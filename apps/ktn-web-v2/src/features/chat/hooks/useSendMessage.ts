import { useCallback } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi, sortChatRoomsLatestFirst } from '../services/chatApi';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { generateClientMessageId } from '@/lib/utils';
import { ChatMessage, ChatRoom, PinnedAnnouncement, SendMessageInput } from '../types/chat.types';
import { RealtimeChatBroadcastPayload } from './useChatRealtime';

const inFlightPromisesByClientId = new Map<string, Promise<{
  message: ChatMessage;
  clientMessageId: string;
  serverMessageId: string;
  idempotent?: boolean;
}>>();

export function useSendMessage(
  onBroadcast?: (payload: RealtimeChatBroadcastPayload) => void
) {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const effectiveScenario = isDemoMode ? chatDemoScenario : 'live_real';
  const isOfflineSimulated = useUiStore((s) => s.isOfflineSimulated);
  const addSendingMessage = useUiStore((s) => s.addSendingMessage);
  const removeSendingMessage = useUiStore((s) => s.removeSendingMessage);
  const markMessageFailed = useUiStore((s) => s.markMessageFailed);
  const removeFailedMessage = useUiStore((s) => s.removeFailedMessage);
  const setRoomDraft = useUiStore((s) => s.setRoomDraft);
  const getRoomDraft = useUiStore((s) => s.getRoomDraft);
  const toggleReactionStore = useUiStore((s) => s.toggleReaction);
  const addToast = useUiStore((s) => s.addToast);

  const sendMutation = useMutation({
    mutationFn: async (input: SendMessageInput) => {
      const clientMessageId = input.clientMessageId || generateClientMessageId('cmsg');
      const existingInFlight = inFlightPromisesByClientId.get(clientMessageId);
      if (existingInFlight) {
        return existingInFlight;
      }

      const executionPromise = (async () => {
        const nowIso = new Date().toISOString();

        const optimisticMessage: ChatMessage = {
          id: clientMessageId,
          clientMessageId,
          room_id: input.roomId,
          class_code: input.classCode || input.roomId.replace(/^class:/, ''),
          sender_email: user?.email || (isDemoMode ? 'hoangngan@khongtunhi.com' : ''),
          sender_name: user?.name || user?.email || 'Thành viên KTN',
          sender_role: user?.role || 'student',
          content: input.content,
          attachment: input.attachment || null,
          replyTo: input.replyTo || null,
          reactions: [],
          created_at: nowIso,
          status: 'sending',
        };

        const promoteRoomInCache = (msg: ChatMessage) => {
          const roomsKey = ['chat-rooms', user?.email, isDemoMode, effectiveScenario];
          queryClient.setQueryData<ChatRoom[]>(roomsKey, (prev) => {
            const list = Array.isArray(prev) ? prev : [];
            const normTarget = String(input.roomId || '').trim().toUpperCase();
            let found = false;
            const next = list.map((r) => {
              if (String(r.roomId || '').trim().toUpperCase() !== normTarget) return r;
              found = true;
              return {
                ...r,
                hasMessages: true,
                isEphemeral: false,
                lastMessage: msg.content || input.content,
                lastSenderName: msg.sender_name || user?.name || user?.email,
                lastSenderRole: msg.sender_role || user?.role,
                lastMessageId: msg.id,
                lastMessageAt: msg.created_at,
                updatedAt: msg.created_at,
              };
            });
            if (!found) {
              const isStudent = input.roomId.toLowerCase().startsWith('student:');
              const studentEmail = isStudent ? input.roomId.slice(8).trim().toLowerCase() : undefined;
              next.unshift({
                roomId: input.roomId,
                type: isStudent ? 'student' : input.roomId.toLowerCase().startsWith('course:') ? 'course' : 'class',
                classCode: input.classCode || input.roomMeta?.classCode,
                studentEmail: input.roomMeta?.studentEmail || studentEmail,
                studentName: input.roomMeta?.studentName,
                teacherName: input.roomMeta?.teacherName,
                label:
                  input.roomMeta?.label ||
                  (isStudent ? `Học viên (${studentEmail})` : `Phòng ${input.roomId}`),
                shortLabel: input.roomMeta?.shortLabel || (isStudent ? '1-1' : input.roomId),
                lastMessage: msg.content || input.content,
                lastSenderName: msg.sender_name || user?.name || user?.email,
                lastSenderRole: msg.sender_role || user?.role,
                lastMessageId: msg.id,
                lastMessageAt: msg.created_at,
                updatedAt: msg.created_at,
                unreadCount: 0,
                hasMessages: true,
                isEphemeral: false,
              });
            }
            return sortChatRoomsLatestFirst(next);
          });
        };

        // Step 1: Transition to SENDING immediately (never claim 'Đã gửi' before server ack)
        removeFailedMessage(input.roomId, clientMessageId);
        addSendingMessage(input.roomId, optimisticMessage);

        try {
          if (isOfflineSimulated) {
            await new Promise((r) => setTimeout(r, 250));
            throw new Error('Thiết bị đang mất kết nối mạng. Tin nhắn được giữ trên máy.');
          }

          if (isDemoMode) {
            await new Promise((r) => setTimeout(r, 350));
            const demoAck: ChatMessage = {
              ...optimisticMessage,
              id: `demo_srv_${Date.now()}`,
              status: 'sent',
            };
            removeSendingMessage(input.roomId, clientMessageId);
            promoteRoomInCache(demoAck);
            return {
              message: demoAck,
              clientMessageId,
              serverMessageId: demoAck.id,
            };
          }

          // Step 2: Call authoritative Worker BFF endpoint
          const res = await chatApi.sendMessage({
            roomId: input.roomId,
            classCode: input.classCode,
            content: input.content,
            attachment: input.attachment,
            replyTo: input.replyTo,
            clientMessageId,
            isPinned: input.isPinned,
          });

          // Step 3: Server acknowledged -> Remove from temporary sending & failed queues & update cache
          removeSendingMessage(input.roomId, clientMessageId);
          removeFailedMessage(input.roomId, clientMessageId);

          const confirmedMsg: ChatMessage = {
            ...res.message,
            clientMessageId: res.clientMessageId || clientMessageId,
            status: 'sent',
          };

          promoteRoomInCache(confirmedMsg);

          queryClient.setQueryData(
            ['chat-messages', input.roomId, user?.email, isDemoMode, effectiveScenario],
            (
              oldData:
                | {
                    messages: ChatMessage[];
                    pinnedMessage: PinnedAnnouncement | null;
                    pagination: Record<string, unknown>;
                  }
                | undefined
            ) => {
              if (!oldData) return oldData;
              let replaced = false;
              const nextMessages = oldData.messages.map((m) => {
                if (
                  String(m.id) === String(confirmedMsg.id) ||
                  String(m.id) === String(clientMessageId) ||
                  (m.clientMessageId && m.clientMessageId === clientMessageId)
                ) {
                  replaced = true;
                  return confirmedMsg;
                }
                return m;
              });
              return {
                ...oldData,
                messages: replaced ? nextMessages : [...nextMessages, confirmedMsg],
              };
            }
          );

          queryClient.invalidateQueries({ queryKey: ['chat-messages', input.roomId] });
          queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });

          onBroadcast?.({
            type: 'NEW_MESSAGE',
            roomId: input.roomId,
            senderEmail: user?.email,
            timestamp: Date.now(),
          });

          return res;
        } catch (err) {
          const errorReason =
            err instanceof Error
              ? err.message
              : 'Chưa gửi được tin nhắn. Vui lòng kiểm tra kết nối và thử lại.';

          const isStillAuthenticated =
            Boolean(useAuthStore.getState().user) || useUiStore.getState().isDemoMode;
          if (!isStillAuthenticated) {
            throw err;
          }

          // Step 4: Server failed -> Transition to FAILED, retain draft in composer if empty, allow 1-click retry
          markMessageFailed(input.roomId, optimisticMessage, errorReason);

          const currentDraft = getRoomDraft(input.roomId);
          if (!currentDraft.trim() && input.content) {
            setRoomDraft(input.roomId, input.content);
          }

          addToast({
            title: 'Chưa gửi được tin nhắn',
            description: `${errorReason} (Tin nhắn vẫn được giữ để thử lại).`,
            variant: 'error',
          });

          throw err;
        } finally {
          inFlightPromisesByClientId.delete(clientMessageId);
        }
      })();

      inFlightPromisesByClientId.set(clientMessageId, executionPromise);
      return executionPromise;
    },
  });

  const retryFailedMessage = useCallback(
    async (failedMsg: ChatMessage) => {
      const clientMessageId = failedMsg.clientMessageId || failedMsg.id;
      const existingInFlight = inFlightPromisesByClientId.get(clientMessageId);
      if (existingInFlight) {
        return existingInFlight;
      }
      return sendMutation.mutateAsync({
        roomId: failedMsg.room_id,
        classCode: failedMsg.class_code,
        content: failedMsg.content,
        attachment: failedMsg.attachment,
        replyTo: failedMsg.replyTo,
        clientMessageId, // Same clientMessageId guarantees idempotency on backend
      });
    },
    [sendMutation]
  );

  const toggleReaction = useCallback(
    (params: { roomId: string; messageId: string; emoji: string }) => {
      toggleReactionStore(params.messageId, params.emoji, user?.name || user?.email || 'Thành viên KTN');
      onBroadcast?.({
        type: 'REACTION_UPDATED',
        roomId: params.roomId,
        senderEmail: user?.email,
        timestamp: Date.now(),
      });
    },
    [toggleReactionStore, user?.name, user?.email, onBroadcast]
  );

  const pinMutation = useMutation({
    mutationFn: async (params: { roomId: string; content: string; messageId?: string }) => {
      if (isDemoMode) return null;
      const res = await chatApi.pinAnnouncement(params.roomId, params.content, params.messageId);
      onBroadcast?.({
        type: 'PIN_UPDATED',
        roomId: params.roomId,
        senderEmail: user?.email,
        timestamp: Date.now(),
      });
      return res;
    },
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['chat-messages', variables.roomId] });
      addToast({
        title: 'Đã cập nhật thông báo ghim của lớp học',
        variant: 'success',
      });
    },
  });

  return {
    sendMessage: sendMutation.mutateAsync,
    isSending: sendMutation.isPending,
    retryFailedMessage,
    toggleReaction,
    pinAnnouncement: pinMutation.mutate,
  };
}
