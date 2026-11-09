import { useMemo, useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { chatApi } from '../services/chatApi';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  DEMO_CHAT_ROOMS,
  DEMO_PINNED_ANNOUNCEMENT,
  DEMO_RICH_MESSAGES,
} from '@/lib/demoData';
import { ChatMessage, ChatRoom, PinnedAnnouncement } from '../types/chat.types';

export function useChatRooms() {
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const user = useAuthStore((s) => s.user);

  const query = useQuery<ChatRoom[]>({
    queryKey: ['chat-rooms', user?.email, isDemoMode, chatDemoScenario],
    queryFn: async () => {
      if (isDemoMode || chatDemoScenario !== 'live_real') {
        if (chatDemoScenario === 'demo_empty') {
          return DEMO_CHAT_ROOMS.map((r) => ({ ...r, unreadCount: 0, lastMessage: '' }));
        }
        if (chatDemoScenario === 'demo_unread') {
          return DEMO_CHAT_ROOMS.map((r, i) => ({
            ...r,
            unreadCount: (r.unreadCount || 0) + (i === 0 ? 5 : 2),
          }));
        }
        return DEMO_CHAT_ROOMS;
      }
      const res = await chatApi.getRooms();
      const all: ChatRoom[] = [...(res.groupRooms || [])];
      if (res.privateRoom) {
        all.push(res.privateRoom);
      }
      if (res.privateThreads && res.privateThreads.length > 0) {
        for (const t of res.privateThreads) {
          if (!all.some((r) => r.roomId === t.roomId)) {
            all.push(t);
          }
        }
      }
      return all;
    },
    enabled: Boolean(user) || isDemoMode,
    refetchInterval: isDemoMode ? false : 3500,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });

  return query;
}

export function useRoomMessages(roomId: string | null) {
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const sendingMessagesByRoom = useUiStore((s) => s.sendingMessagesByRoom);
  const failedMessagesByRoom = useUiStore((s) => s.failedMessagesByRoom);
  const reactionsByMessageId = useUiStore((s) => s.reactionsByMessageId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [olderMessages, setOlderMessages] = useState<ChatMessage[]>([]);
  const [olderCursor, setOlderCursor] = useState<string | null>(null);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);

  useEffect(() => {
    setOlderMessages([]);
    setOlderCursor(null);
    setHasMoreOlder(false);
  }, [roomId]);

  const query = useQuery({
    queryKey: ['chat-messages', roomId, user?.email, isDemoMode, chatDemoScenario],
    queryFn: async () => {
      if (!roomId) {
        return {
          messages: [] as ChatMessage[],
          pinnedMessage: null as PinnedAnnouncement | null,
          pagination: {
            hasMore: false,
            nextCursor: null,
            oldestCreatedAt: null,
            limit: 60,
            totalAvailable: 0,
          },
        };
      }

      if (isDemoMode || chatDemoScenario !== 'live_real') {
        if (chatDemoScenario === 'demo_empty') {
          return {
            messages: [] as ChatMessage[],
            pinnedMessage: null,
            pagination: {
              hasMore: false,
              nextCursor: null,
              oldestCreatedAt: null,
              limit: 60,
              totalAvailable: 0,
            },
          };
        }
        return {
          messages: DEMO_RICH_MESSAGES,
          pinnedMessage: DEMO_PINNED_ANNOUNCEMENT,
          pagination: {
            hasMore: true,
            nextCursor: DEMO_RICH_MESSAGES[0]?.created_at || null,
            oldestCreatedAt: DEMO_RICH_MESSAGES[0]?.created_at || null,
            limit: 60,
            totalAvailable: DEMO_RICH_MESSAGES.length + 5,
          },
        };
      }

      const res = await chatApi.getMessages(roomId, { limit: 60 });
      return {
        messages: res.messages || [],
        pinnedMessage: res.pinnedMessage || null,
        pagination: res.pagination || {
          hasMore: false,
          nextCursor: null,
          oldestCreatedAt: null,
          limit: 60,
          totalAvailable: (res.messages || []).length,
        },
      };
    },
    enabled: Boolean(roomId) && (Boolean(user) || isDemoMode),
    refetchInterval: isDemoMode ? false : 3000,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });

  useEffect(() => {
    if (query.data?.pagination && olderMessages.length === 0) {
      setHasMoreOlder(Boolean(query.data.pagination.hasMore));
      setOlderCursor(query.data.pagination.nextCursor || null);
    }
  }, [query.data?.pagination, olderMessages.length]);

  const loadOlderMessages = useCallback(async () => {
    if (!roomId || isLoadingOlder || !hasMoreOlder) return;
    setIsLoadingOlder(true);
    try {
      if (isDemoMode || chatDemoScenario !== 'live_real') {
        await new Promise((r) => setTimeout(r, 300));
        const syntheticOlder: ChatMessage[] = [
          {
            id: `msg_older_${Date.now()}_1`,
            room_id: roomId,
            class_code: 'YCT2-04',
            sender_email: 'linh.lam@khongtunhi.com',
            sender_name: 'Cô Lâm Mỹ Linh',
            sender_role: 'teacher',
            content: 'Chào mừng ba mẹ và các con đến với học kỳ mới lớp YCT2-04! 🎉',
            reactions: [{ emoji: '❤️', count: 3, users: ['PH Hoàng Ngân'] }],
            created_at: '2026-03-01T08:00:00.000Z',
            status: 'seen',
          },
        ];
        setOlderMessages((prev) => [...syntheticOlder, ...prev]);
        setHasMoreOlder(false);
        return;
      }

      if (!olderCursor) return;
      const res = await chatApi.getMessages(roomId, { limit: 50, before: olderCursor });
      const fetched = res.messages || [];
      setOlderMessages((prev) => [...fetched, ...prev]);
      setHasMoreOlder(Boolean(res.pagination?.hasMore));
      setOlderCursor(res.pagination?.nextCursor || null);
    } finally {
      setIsLoadingOlder(false);
    }
  }, [roomId, hasMoreOlder, isDemoMode, chatDemoScenario, isLoadingOlder, olderCursor]);

  const mergedMessages = useMemo(() => {
    if (!roomId) return [];
    const serverMessages = query.data?.messages || [];
    const sendingList = sendingMessagesByRoom[roomId] || [];
    const failedList = failedMessagesByRoom[roomId] || [];

    let demoExtra: ChatMessage[] = [];
    if (chatDemoScenario === 'demo_sending') {
      demoExtra = [
        {
          id: 'demo_sending_1',
          clientMessageId: 'demo_sending_1',
          room_id: roomId,
          class_code: 'YCT2-04',
          sender_email: user?.email || 'hoangngan@khongtunhi.com',
          sender_name: user?.name || 'Bé Nguyễn Hoàng Ngân',
          sender_role: user?.role || 'student',
          content: 'Con đang gửi thêm bản ghi âm lần 2 cho cô Linh ạ...',
          created_at: new Date().toISOString(),
          status: 'sending',
        },
      ];
    } else if (chatDemoScenario === 'demo_failed') {
      demoExtra = [
        {
          id: 'demo_failed_1',
          clientMessageId: 'demo_failed_1',
          room_id: roomId,
          class_code: 'YCT2-04',
          sender_email: user?.email || 'hoangngan@khongtunhi.com',
          sender_name: user?.name || 'Bé Nguyễn Hoàng Ngân',
          sender_role: user?.role || 'student',
          content: 'Cô Linh ơi mạng nhà con đang hơi chập chờn ạ!',
          created_at: new Date().toISOString(),
          status: 'failed',
          errorMessage: 'Mất kết nối máy chủ. Tin nhắn vẫn được lưu trên thiết bị.',
        },
      ];
    }

    const byKey = new Map<string, ChatMessage>();
    const clientIdToKey = new Map<string, string>();

    const allServer = [...olderMessages, ...serverMessages];
    for (const msg of allServer) {
      const key = String(msg.id);
      if (msg.clientMessageId) {
        const existingKey = clientIdToKey.get(msg.clientMessageId);
        if (existingKey && existingKey !== key) {
          byKey.delete(existingKey);
        }
        clientIdToKey.set(msg.clientMessageId, key);
      }
      const localReactions = reactionsByMessageId[key];
      byKey.set(key, {
        ...msg,
        status: msg.status || 'sent',
        reactions: localReactions || msg.reactions || [],
      });
    }

    for (const pending of [...sendingList, ...failedList, ...demoExtra]) {
      const cId = pending.clientMessageId || pending.id;
      if (clientIdToKey.has(cId) || byKey.has(cId)) continue;
      clientIdToKey.set(cId, cId);
      byKey.set(cId, pending);
    }

    return Array.from(byKey.values()).sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });
  }, [
    roomId,
    query.data?.messages,
    olderMessages,
    sendingMessagesByRoom,
    failedMessagesByRoom,
    reactionsByMessageId,
    chatDemoScenario,
    user,
  ]);

  const markReadMutation = useMutation({
    mutationFn: async (params: { roomId: string; lastReadMessageId?: string | null }) => {
      if (isDemoMode || chatDemoScenario !== 'live_real') return;
      return chatApi.markRoomRead(params.roomId, params.lastReadMessageId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
    },
  });

  return {
    messages: mergedMessages,
    pinnedMessage: query.data?.pinnedMessage || null,
    isLoading: query.isLoading,
    isError: query.isError,
    error: query.error,
    hasMoreOlder,
    isLoadingOlder,
    loadOlderMessages,
    markRoomRead: markReadMutation.mutate,
    refetch: query.refetch,
  };
}
