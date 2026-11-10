import React, { useEffect, useState, useMemo, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MessageSquareOff } from 'lucide-react';
import { ConversationList } from './ConversationList';
import { ConversationHeader } from './ConversationHeader';
import { PinnedMessage } from './PinnedMessage';
import { MessageList } from './MessageList';
import { MessageComposer } from './MessageComposer';
import { useChatRooms, useRoomMessages } from '../hooks/useMessages';
import { useSendMessage } from '../hooks/useSendMessage';
import { useChatRealtime } from '../hooks/useChatRealtime';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { ChatMessage } from '../types/chat.types';

export const ChatLayout: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const setChatDemoScenario = useUiStore((s) => s.setChatDemoScenario);
  const activeRoomId = useUiStore((s) => s.activeRoomId);
  const setActiveRoomId = useUiStore((s) => s.setActiveRoomId);
  const mobileChatConversationOpen = useUiStore((s) => s.mobileChatConversationOpen);
  const setMobileChatConversationOpen = useUiStore((s) => s.setMobileChatConversationOpen);
  const setRoomDraft = useUiStore((s) => s.setRoomDraft);

  const [replyingTo, setReplyingTo] = useState<ChatMessage | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const { data: rooms = [], isLoading: isRoomsLoading } = useChatRooms();

  const rawRoomParam = (
    searchParams.get('room') ||
    searchParams.get('roomId') ||
    searchParams.get('classCode') ||
    searchParams.get('class') ||
    ''
  ).trim();
  const roomParam =
    rawRoomParam &&
    !rawRoomParam.includes(':') &&
    (searchParams.get('classCode') || searchParams.get('class'))
      ? `class:${rawRoomParam.toUpperCase()}`
      : rawRoomParam;

  useEffect(() => {
    if (roomParam) {
      const normParam = roomParam.toUpperCase();
      const normClassParam = normParam.replace(/^CLASS:/, '');
      const matched = rooms.find(
        (r) =>
          String(r.roomId || '').trim().toUpperCase() === normParam ||
          String(r.classCode || '').trim().toUpperCase() === normClassParam
      );
      if (matched) {
        if (activeRoomId !== matched.roomId) {
          setActiveRoomId(matched.roomId);
        }
        if (!mobileChatConversationOpen) {
          setMobileChatConversationOpen(true);
        }
        return;
      }
      if (!isRoomsLoading && rooms.length > 0) {
        if (activeRoomId) {
          setActiveRoomId('');
        }
        return;
      }
      return;
    }
    if (rooms.length > 0 && (!activeRoomId || !rooms.some((r) => r.roomId === activeRoomId))) {
      setActiveRoomId(rooms[0].roomId);
    }
  }, [
    rooms,
    roomParam,
    isRoomsLoading,
    activeRoomId,
    mobileChatConversationOpen,
    setActiveRoomId,
    setMobileChatConversationOpen,
  ]);

  const activeRoom = useMemo(() => {
    if (roomParam) {
      const normParam = roomParam.toUpperCase();
      const normClassParam = normParam.replace(/^CLASS:/, '');
      return (
        rooms.find(
          (r) =>
            String(r.roomId || '').trim().toUpperCase() === normParam ||
            String(r.classCode || '').trim().toUpperCase() === normClassParam
        ) || null
      );
    }
    return rooms.find((r) => r.roomId === activeRoomId) || rooms[0] || null;
  }, [rooms, activeRoomId, roomParam]);

  const resolvedRoomId = activeRoom?.roomId || null;

  const { connectionState, broadcastChatEvent, refreshNow } = useChatRealtime(
    resolvedRoomId,
    isDemoMode
  );

  const {
    messages,
    pinnedMessage,
    isLoading: isMessagesLoading,
    hasMoreOlder,
    isLoadingOlder,
    loadOlderMessages,
    markRoomRead,
  } = useRoomMessages(resolvedRoomId);

  const { sendMessage, isSending, retryFailedMessage, toggleReaction, pinAnnouncement } =
    useSendMessage(broadcastChatEvent);

  const lastMarkedReadKeyRef = useRef<string>('');
  useEffect(() => {
    if (!resolvedRoomId || messages.length === 0) return;
    if ((Number(activeRoom?.unreadCount) || 0) > 0) {
      const lastMsg = messages[messages.length - 1];
      const markKey = `${resolvedRoomId}:${lastMsg?.id || 'latest'}`;
      if (lastMarkedReadKeyRef.current !== markKey) {
        lastMarkedReadKeyRef.current = markKey;
        markRoomRead({ roomId: resolvedRoomId, lastReadMessageId: lastMsg?.id });
      }
    }
  }, [resolvedRoomId, activeRoom?.unreadCount, messages, markRoomRead]);

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setMobileChatConversationOpen(true);
    setReplyingTo(null);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchParams({ room: roomId }, { replace: true });
  };

  const canManagePin = user?.role === 'teacher' || user?.role === 'admin';

  return (
    <div
      data-testid="zalo-chat-workspace"
      className="flex h-[calc(100dvh-7.75rem-env(safe-area-inset-bottom,0px))] lg:h-[calc(100dvh-5rem)] max-h-full min-h-0 min-w-0 flex-1 w-full flex-col overflow-hidden overscroll-contain rounded-2xl border border-stone-200 bg-white shadow-2xs"
    >
      {/* Demo Mode Interactive State Switcher Bar */}
      {isDemoMode && (
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-3.5 py-1.5 text-xs">
          <span className="font-semibold text-amber-950">
            Trạng thái kiểm thử Phòng Chat (Demo):
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'demo_rich', label: 'Đầy đủ tin nhắn' },
                { id: 'demo_empty', label: 'Lớp mới (Trống)' },
                { id: 'demo_unread', label: 'Có tin chưa đọc' },
                { id: 'demo_sending', label: 'Đang gửi...' },
                { id: 'demo_failed', label: 'Gửi lỗi + Thử lại' },
                { id: 'live_real', label: 'Dữ liệu thật' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                data-testid={`chat-demo-btn-${st.id}`}
                onClick={() => setChatDemoScenario(st.id)}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  chatDemoScenario === st.id
                    ? 'bg-red-800 text-white'
                    : 'bg-white text-stone-700 border border-stone-300 hover:bg-stone-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="flex min-h-0 min-w-0 flex-1 overflow-hidden">
        {/* Left Pane: Conversation List */}
        <div
          className={`${
            !mobileChatConversationOpen ? 'flex w-full' : 'hidden'
          } lg:flex lg:w-auto h-full min-h-0 min-w-0 shrink-0 overflow-hidden`}
        >
          <ConversationList
            rooms={rooms}
            activeRoomId={resolvedRoomId}
            isLoading={isRoomsLoading}
            onSelectRoom={handleSelectRoom}
          />
        </div>

        {/* Right Pane: Active Conversation */}
        <div
          className={`${
            mobileChatConversationOpen ? 'flex w-full' : 'hidden'
          } lg:flex flex-1 flex-col h-full min-h-0 min-w-0 overflow-hidden`}
        >
          {activeRoom ? (
            <>
              <ConversationHeader
                room={activeRoom}
                connectionState={connectionState}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                onToggleSearch={() => {
                  setSearchOpen((prev) => {
                    const next = !prev;
                    if (!next) {
                      setSearchQuery('');
                    }
                    return next;
                  });
                }}
                onSearchChange={setSearchQuery}
                onMobileBack={() => {
                  setMobileChatConversationOpen(false);
                  setSearchParams({}, { replace: true });
                }}
                onRefresh={refreshNow}
              />

              <PinnedMessage
                pinnedMessage={pinnedMessage}
                canManagePin={canManagePin}
                onJumpToMessage={(msgId) => {
                  const container = document.querySelector<HTMLElement>(
                    '[data-testid="chat-message-scroll-area"]'
                  );
                  const el = document.getElementById(`chat-msg-${msgId}`);
                  if (container && el) {
                    const cRect = container.getBoundingClientRect();
                    const eRect = el.getBoundingClientRect();
                    const targetTop =
                      container.scrollTop +
                      (eRect.top - cRect.top) -
                      Math.max(0, (container.clientHeight - eRect.height) / 2);
                    container.scrollTo({ top: Math.max(0, targetTop), behavior: 'smooth' });
                  } else if (el) {
                    el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
                  }
                }}
              />

              <MessageList
                roomId={activeRoom.roomId}
                messages={messages}
                currentUserEmail={
                  user?.email || (isDemoMode ? 'hoangngan@khongtunhi.com' : '')
                }
                currentUserName={user?.name}
                canManagePin={canManagePin}
                isLoading={isMessagesLoading}
                hasMoreOlder={hasMoreOlder}
                isLoadingOlder={isLoadingOlder}
                searchQuery={searchQuery}
                onLoadOlder={loadOlderMessages}
                onReply={(msg) => setReplyingTo(msg)}
                onReact={(msgId, emoji) =>
                  toggleReaction({ roomId: activeRoom.roomId, messageId: msgId, emoji })
                }
                onPinMessage={(msg) =>
                  pinAnnouncement({
                    roomId: activeRoom.roomId,
                    content: msg.content,
                    messageId: msg.id,
                  })
                }
                onRetryMessage={retryFailedMessage}
                onQuickGreeting={(text) => setRoomDraft(activeRoom.roomId, text)}
              />

              <MessageComposer
                roomId={activeRoom.roomId}
                classCode={activeRoom.classCode}
                replyingTo={replyingTo}
                isSending={isSending}
                onClearReply={() => setReplyingTo(null)}
                onSend={sendMessage}
              />
            </>
          ) : (
            <div
              data-testid={roomParam ? 'chat-room-unavailable-notice' : 'chat-room-empty-state'}
              className="flex flex-1 flex-col items-center justify-center bg-[#F3EFEA] p-8 text-center"
            >
              <MessageSquareOff className="h-10 w-10 text-stone-400" />
              <h3 className="mt-3 font-display text-base font-bold text-stone-800">
                {roomParam && !isRoomsLoading
                  ? `Nhóm lớp "${roomParam.replace(/^class:/i, '')}" không còn hoạt động hoặc bạn không có quyền truy cập`
                  : 'Chưa chọn phòng trao đổi lớp học'}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-stone-500">
                {roomParam && !isRoomsLoading
                  ? 'Lớp học có thể đã được lưu trữ hoặc tài khoản hiện tại không thuộc danh sách thành viên lớp.'
                  : 'Vui lòng chọn một lớp học hoặc kênh hỗ trợ ở danh sách bên trái để bắt đầu nhắn tin.'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
