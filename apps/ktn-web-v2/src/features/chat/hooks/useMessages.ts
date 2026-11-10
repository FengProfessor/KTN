import { useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  chatApi,
  getRoomLastMessageTimestampMs,
  hasRoomRealMessages,
  sortChatRoomsLatestFirst,
} from '../services/chatApi';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import {
  DEMO_CHAT_ROOMS,
  DEMO_PINNED_ANNOUNCEMENT,
  DEMO_RICH_MESSAGES,
} from '@/lib/demoData';
import { ChatMessage, ChatRoom, PinnedAnnouncement } from '../types/chat.types';
import type { KtnClassItem } from '@/types/ktn.types';

function reconcileRoomsWithActiveClasses(
  rooms: ChatRoom[],
  activeClasses: KtnClassItem[] | undefined,
  includeMissingActiveClasses: boolean
): ChatRoom[] {
  if (!Array.isArray(activeClasses)) {
    return sortChatRoomsLatestFirst(rooms);
  }
  const activeClassMap = new Map<string, KtnClassItem>();
  for (const cls of activeClasses) {
    if (cls && cls.active !== false) {
      const code = String(cls.id || '').trim().toUpperCase();
      if (code) {
        activeClassMap.set(code, cls);
      }
    }
  }

  const filteredRooms = rooms
    .filter((r) => {
      const rawCode = String(
        r.classCode || (r.roomId.toLowerCase().startsWith('class:') ? r.roomId.slice(6) : '')
      )
        .trim()
        .toUpperCase();
      if ((r.type === 'class' || r.roomId.toLowerCase().startsWith('class:')) && rawCode) {
        return activeClassMap.has(rawCode);
      }
      return true;
    })
    .map((r) => {
      const rawCode = String(
        r.classCode || (r.roomId.toLowerCase().startsWith('class:') ? r.roomId.slice(6) : '')
      )
        .trim()
        .toUpperCase();
      const matchedCls = rawCode ? activeClassMap.get(rawCode) : undefined;
      if (matchedCls && (r.type === 'class' || r.roomId.toLowerCase().startsWith('class:'))) {
        return {
          ...r,
          roomId: `class:${rawCode}`,
          classCode: rawCode,
          className: matchedCls.name,
          label: `Nhóm Lớp ${rawCode} — ${matchedCls.name}`,
          shortLabel: `Lớp ${rawCode}`,
          teacherName: matchedCls.teacher_name || r.teacherName,
          hasMessages: hasRoomRealMessages(r),
        };
      }
      return {
        ...r,
        hasMessages: hasRoomRealMessages(r),
      };
    });

  if (!includeMissingActiveClasses) {
    return sortChatRoomsLatestFirst(filteredRooms);
  }

  const existingCodes = new Set(
    filteredRooms
      .map((r) =>
        String(
          r.classCode || (r.roomId.toLowerCase().startsWith('class:') ? r.roomId.slice(6) : '')
        )
          .trim()
          .toUpperCase()
      )
      .filter(Boolean)
  );

  const extraClassRooms: ChatRoom[] = [];
  activeClassMap.forEach((c, code) => {
    if (!existingCodes.has(code)) {
      extraClassRooms.push({
        roomId: `class:${code}`,
        classCode: code,
        className: c.name,
        label: `Nhóm Lớp ${code} — ${c.name}`,
        shortLabel: `Lớp ${code}`,
        teacherName: c.teacher_name,
        type: 'class',
        unreadCount: 0,
        lastMessage: '',
        hasMessages: false,
        lastMessageAt: null,
        updatedAt: undefined,
      });
    }
  });

  return sortChatRoomsLatestFirst([...filteredRooms, ...extraClassRooms]);
}

export function useChatRooms() {
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const effectiveScenario = isDemoMode ? chatDemoScenario : 'live_real';
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const query = useQuery<ChatRoom[]>({
    queryKey: ['chat-rooms', user?.email, isDemoMode, effectiveScenario],
    queryFn: async () => {
      const cachedClassEntries = queryClient.getQueriesData<KtnClassItem[]>({
        queryKey: ['ktn-classes'],
        predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode,
      });
      const activeClasses = cachedClassEntries
        .map(([, data]) => data)
        .find((data): data is KtnClassItem[] => Array.isArray(data));

      if (isDemoMode) {
        let baseRooms = DEMO_CHAT_ROOMS.map((r) => ({
          ...r,
          hasMessages: hasRoomRealMessages(r),
          lastMessageAt: r.updatedAt || null,
        }));
        if (effectiveScenario === 'demo_empty') {
          baseRooms = DEMO_CHAT_ROOMS.map((r) => ({
            ...r,
            unreadCount: 0,
            lastMessage: '',
            hasMessages: false,
            lastMessageAt: null,
            updatedAt: undefined,
          }));
        } else if (effectiveScenario === 'demo_unread') {
          baseRooms = baseRooms.map((r, i) => ({
            ...r,
            unreadCount: (r.unreadCount || 0) + (i === 0 ? 5 : 2),
          }));
        }

        const reconciled = reconcileRoomsWithActiveClasses(baseRooms, activeClasses, true);
        return sortChatRoomsLatestFirst(
          reconciled.filter(
            (r) =>
              (r.type !== 'student' && !String(r.roomId || '').toLowerCase().startsWith('student:')) ||
              hasRoomRealMessages(r)
          )
        );
      }
      const res = await chatApi.getRooms();
      const groupRooms =
        user?.role === 'admin' && Array.isArray(activeClasses)
          ? reconcileRoomsWithActiveClasses(res.groupRooms || [], activeClasses, true)
          : res.groupRooms || [];
      const all: ChatRoom[] = [];
      const seenRoomIds = new Set<string>();
      const pushUniqueRoom = (room: ChatRoom) => {
        const key = String(room.roomId || '').trim().toUpperCase();
        if (!key || seenRoomIds.has(key)) return;
        const isStudentDirect =
          room.type === 'student' || String(room.roomId || '').toLowerCase().startsWith('student:');
        // 1-1 rooms without real saved messages must not appear in Inbox
        if (isStudentDirect && !hasRoomRealMessages(room)) {
          return;
        }
        seenRoomIds.add(key);
        all.push({
          ...room,
          hasMessages: hasRoomRealMessages(room),
        });
      };
      for (const r of groupRooms) {
        pushUniqueRoom(r);
      }
      if (res.privateRoom) {
        pushUniqueRoom(res.privateRoom);
      }
      if (res.privateThreads && res.privateThreads.length > 0) {
        for (const t of res.privateThreads) {
          pushUniqueRoom(t);
        }
      }
      return sortChatRoomsLatestFirst(all);
    },
    enabled: Boolean(user) || isDemoMode,
    refetchInterval: isDemoMode ? false : 3500,
    refetchIntervalInBackground: false,
    staleTime: 1000,
  });

  return query;
}

const EMPTY_MESSAGES: ChatMessage[] = [];

interface RoomOlderHistoryState {
  messages: ChatMessage[];
  cursor: string | null;
  hasMore: boolean | null;
}

function doesMessageBelongToRoom(msg: ChatMessage, targetRoomId: string, isDemoMode: boolean): boolean {
  if (isDemoMode) return true;
  const msgRoom = String(msg.room_id || msg.class_code || '').trim();
  if (!msgRoom) return true;
  const normMsgRoom = msgRoom.toUpperCase();
  const normTarget = String(targetRoomId || '').trim().toUpperCase();
  const normTargetBare = normTarget.replace(/^CLASS:/, '');
  const normMsgBare = normMsgRoom.replace(/^CLASS:/, '');
  return normMsgRoom === normTarget || (Boolean(normTargetBare) && normMsgBare === normTargetBare);
}

function buildMessagesSignature(list: ChatMessage[]): string {
  return list
    .map((m) => {
      const rxSig = Array.isArray(m.reactions)
        ? m.reactions.map((r) => `${r.emoji}:${r.count}:${(r.users || []).join(',')}`).join(';')
        : '';
      return `${m.id}|${m.clientMessageId || ''}|${m.status || 'sent'}|${m.created_at}|${m.content}|${m.attachment?.url || ''}|${rxSig}`;
    })
    .join('~');
}

const MAX_RETAINED_SERVER_MESSAGES = 1000;

export function useRoomMessages(roomId: string | null) {
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const chatDemoScenario = useUiStore((s) => s.chatDemoScenario);
  const effectiveScenario = isDemoMode ? chatDemoScenario : 'live_real';
  const sendingMessagesByRoom = useUiStore((s) => s.sendingMessagesByRoom);
  const failedMessagesByRoom = useUiStore((s) => s.failedMessagesByRoom);
  const reactionsByMessageId = useUiStore((s) => s.reactionsByMessageId);
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const [olderByScope, setOlderByScope] = useState<Record<string, RoomOlderHistoryState>>({});
  const [loadingOlderScopeKey, setLoadingOlderScopeKey] = useState<string | null>(null);
  const loadingOlderScopeRef = useRef<string | null>(null);
  const retainedServerByScopeRef = useRef<Record<string, Map<string, ChatMessage>>>({});
  const initialPaginationByScopeRef = useRef<
    Record<string, { cursor: string | null; hasMore: boolean }>
  >({});
  const prevMergedRef = useRef<{ scopeKey: string; sig: string; list: ChatMessage[] }>({
    scopeKey: '',
    sig: '',
    list: EMPTY_MESSAGES,
  });

  const roomScopeKey = roomId
    ? `${user?.email || 'anon'}::${isDemoMode ? effectiveScenario : 'live'}::${roomId}`
    : '';

  const query = useQuery({
    queryKey: ['chat-messages', roomId, user?.email, isDemoMode, effectiveScenario],
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

      if (isDemoMode) {
        if (effectiveScenario === 'demo_empty') {
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

  if (roomScopeKey && query.data?.pagination) {
    const existingInit = initialPaginationByScopeRef.current[roomScopeKey];
    if (!existingInit || (!existingInit.hasMore && query.data.pagination.hasMore)) {
      const retainedOldest = retainedServerByScopeRef.current[roomScopeKey]
        ? Array.from(retainedServerByScopeRef.current[roomScopeKey].values())[0]?.created_at
        : null;
      initialPaginationByScopeRef.current[roomScopeKey] = {
        cursor: retainedOldest || query.data.pagination.nextCursor || null,
        hasMore: Boolean(query.data.pagination.hasMore),
      };
    }
  }

  const currentRoomOlder = roomScopeKey ? olderByScope[roomScopeKey] : undefined;
  const olderMessages = currentRoomOlder?.messages ?? EMPTY_MESSAGES;
  const initialPag = roomScopeKey ? initialPaginationByScopeRef.current[roomScopeKey] : undefined;
  const hasMoreOlder =
    currentRoomOlder && currentRoomOlder.hasMore !== null
      ? currentRoomOlder.hasMore
      : initialPag
      ? initialPag.hasMore
      : Boolean(query.data?.pagination?.hasMore);
  const olderCursor =
    currentRoomOlder && currentRoomOlder.messages.length > 0
      ? currentRoomOlder.cursor
      : initialPag?.cursor || query.data?.pagination?.nextCursor || null;
  const isLoadingOlder = Boolean(roomScopeKey && loadingOlderScopeKey === roomScopeKey);

  const loadOlderMessages = useCallback(async () => {
    const targetRoomId = roomId;
    const targetScopeKey = roomScopeKey;
    if (
      !targetRoomId ||
      !targetScopeKey ||
      loadingOlderScopeRef.current === targetScopeKey ||
      loadingOlderScopeKey === targetScopeKey ||
      !hasMoreOlder
    ) {
      return;
    }
    loadingOlderScopeRef.current = targetScopeKey;
    setLoadingOlderScopeKey(targetScopeKey);
    try {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        const syntheticOlder: ChatMessage[] = [
          {
            id: `msg_older_${Date.now()}_1`,
            room_id: targetRoomId,
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
        setOlderByScope((prev) => {
          const existing = prev[targetScopeKey]?.messages || [];
          return {
            ...prev,
            [targetScopeKey]: {
              messages: [...syntheticOlder, ...existing],
              cursor: null,
              hasMore: false,
            },
          };
        });
        return;
      }

      if (!olderCursor) return;
      const res = await chatApi.getMessages(targetRoomId, { limit: 50, before: olderCursor });
      const fetched = (res.messages || []).filter((m) =>
        doesMessageBelongToRoom(m, targetRoomId, false)
      );
      setOlderByScope((prev) => {
        const existing = prev[targetScopeKey]?.messages || [];
        const deduped = new Map<string, ChatMessage>();
        for (const item of [...fetched, ...existing]) {
          deduped.set(String(item.id), item);
        }
        return {
          ...prev,
          [targetScopeKey]: {
            messages: Array.from(deduped.values()),
            cursor: res.pagination?.nextCursor || null,
            hasMore: Boolean(res.pagination?.hasMore),
          },
        };
      });
    } finally {
      if (loadingOlderScopeRef.current === targetScopeKey) {
        loadingOlderScopeRef.current = null;
      }
      setLoadingOlderScopeKey((curr) => (curr === targetScopeKey ? null : curr));
    }
  }, [roomId, roomScopeKey, hasMoreOlder, isDemoMode, loadingOlderScopeKey, olderCursor]);

  const mergedMessages = useMemo(() => {
    if (!roomId) return EMPTY_MESSAGES;
    const serverMessages = query.data?.messages || EMPTY_MESSAGES;
    const sendingList = sendingMessagesByRoom[roomId] || EMPTY_MESSAGES;
    const failedList = failedMessagesByRoom[roomId] || EMPTY_MESSAGES;

    let retainedMap = roomScopeKey ? retainedServerByScopeRef.current[roomScopeKey] : undefined;
    if (roomScopeKey && !retainedMap) {
      retainedMap = new Map<string, ChatMessage>();
      retainedServerByScopeRef.current[roomScopeKey] = retainedMap;
    }
    if (retainedMap) {
      if (isDemoMode && effectiveScenario === 'demo_empty') {
        retainedMap.clear();
      } else {
        for (const sm of serverMessages) {
          if (doesMessageBelongToRoom(sm, roomId, isDemoMode)) {
            retainedMap.set(String(sm.id), sm);
          }
        }
        while (retainedMap.size > MAX_RETAINED_SERVER_MESSAGES) {
          const oldestKey = retainedMap.keys().next().value;
          if (oldestKey === undefined) break;
          retainedMap.delete(oldestKey);
        }
      }
    }
    const accumulatedServerMessages = retainedMap
      ? Array.from(retainedMap.values())
      : serverMessages;

    let demoExtra: ChatMessage[] = [];
    if (isDemoMode && effectiveScenario === 'demo_sending') {
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
    } else if (isDemoMode && effectiveScenario === 'demo_failed') {
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

    const allServer =
      isDemoMode && effectiveScenario === 'demo_empty'
        ? EMPTY_MESSAGES
        : [...olderMessages, ...accumulatedServerMessages];
    for (const msg of allServer) {
      if (!doesMessageBelongToRoom(msg, roomId, isDemoMode)) continue;
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

    const sorted = Array.from(byKey.values()).sort((a, b) => {
      const ta = new Date(a.created_at).getTime();
      const tb = new Date(b.created_at).getTime();
      if (ta !== tb) return ta - tb;
      return String(a.id).localeCompare(String(b.id));
    });

    const nextSig = buildMessagesSignature(sorted);
    if (
      prevMergedRef.current.scopeKey === roomScopeKey &&
      prevMergedRef.current.sig === nextSig
    ) {
      return prevMergedRef.current.list;
    }
    prevMergedRef.current = { scopeKey: roomScopeKey, sig: nextSig, list: sorted };
    return sorted;
  }, [
    roomId,
    roomScopeKey,
    query.data?.messages,
    olderMessages,
    sendingMessagesByRoom,
    failedMessagesByRoom,
    reactionsByMessageId,
    isDemoMode,
    effectiveScenario,
    user,
  ]);

  useEffect(() => {
    if (!roomId || mergedMessages.length === 0) return;
    if (isDemoMode && effectiveScenario === 'demo_empty') return;
    const latestMsg = mergedMessages[mergedMessages.length - 1];
    if (!latestMsg || latestMsg.status === 'failed' || latestMsg.status === 'sending') return;
    const latestTs = Date.parse(latestMsg.created_at);
    if (!Number.isFinite(latestTs) || latestTs <= 0) return;

    const normRoomId = String(roomId).trim().toUpperCase();
    const normRoomBare = normRoomId.replace(/^CLASS:/, '');
    const msgRoom = String(latestMsg.room_id || latestMsg.class_code || '').trim().toUpperCase();
    const msgRoomBare = msgRoom.replace(/^CLASS:/, '');
    if (msgRoom && msgRoom !== normRoomId && msgRoomBare !== normRoomBare) {
      return;
    }

    const roomsKey = ['chat-rooms', user?.email, isDemoMode, effectiveScenario];
    const currentRooms = queryClient.getQueryData<ChatRoom[]>(roomsKey);
    if (!Array.isArray(currentRooms) || currentRooms.length === 0) return;

    const targetRoom = currentRooms.find(
      (r) => String(r.roomId || '').trim().toUpperCase() === normRoomId
    );
    if (!targetRoom) return;

    const existingTs = getRoomLastMessageTimestampMs(targetRoom);
    if (
      latestTs > existingTs ||
      (!hasRoomRealMessages(targetRoom) && Boolean(latestMsg.content || latestMsg.attachment))
    ) {
      queryClient.setQueryData<ChatRoom[]>(roomsKey, (prev) => {
        if (!Array.isArray(prev)) return prev;
        const updated = prev.map((r) => {
          if (String(r.roomId || '').trim().toUpperCase() !== normRoomId) return r;
          return {
            ...r,
            hasMessages: true,
            isEphemeral: false,
            lastMessage: latestMsg.content || r.lastMessage,
            lastSenderName: latestMsg.sender_name || r.lastSenderName,
            lastSenderRole: latestMsg.sender_role || r.lastSenderRole,
            lastMessageId: latestMsg.id || r.lastMessageId,
            lastMessageAt: latestMsg.created_at,
            updatedAt: latestMsg.created_at,
          };
        });
        return sortChatRoomsLatestFirst(updated);
      });
    }
  }, [roomId, mergedMessages, isDemoMode, effectiveScenario, user?.email, queryClient]);

  const markReadMutation = useMutation({
    mutationFn: async (params: { roomId: string; lastReadMessageId?: string | null }) => {
      if (isDemoMode) return;
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
