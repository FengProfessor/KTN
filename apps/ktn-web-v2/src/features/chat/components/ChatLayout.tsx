import React, { useEffect, useState, useMemo, useRef, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { MessageSquareOff, Search, X, Loader2, UserPlus } from 'lucide-react';
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
import { ChatMessage, ChatRoom, SendMessageInput } from '../types/chat.types';
import { getInitials } from '@/lib/utils';
import { getStoredSession, KtnApiError } from '@/services/api/ktnApiClient';
import { chatApi, formatQuotedReplyText, normalizeVietnameseSearchText } from '../services/chatApi';
import type { KtnStudentProfile } from '@/types/ktn.types';
import { useI18n } from '@/i18n';

const DEMO_FALLBACK_STUDENTS: KtnStudentProfile[] = [
  {
    email: 'hoangngan@khongtunhi.com',
    name: 'Bé Nguyễn Hoàng Ngân',
    code: 'KTN-HS-01',
    class_code: 'YCT2-04',
  },
  {
    email: 'minhkhang@khongtunhi.com',
    name: 'Bé Trần Minh Khang',
    code: 'KTN-HS-02',
    class_code: 'YCT2-04',
  },
  {
    email: 'baongoc@khongtunhi.com',
    name: 'Bé Lê Bảo Ngọc',
    code: 'KTN-HS-03',
    class_code: 'YCT1-01',
  },
];

export const ChatLayout: React.FC = () => {
  const { lang, tr } = useI18n();
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

  // Ephemeral 1-1 room state (only exists while open before first message is sent)
  const [ephemeralRoom, setEphemeralRoom] = useState<ChatRoom | null>(null);

  // "Nhắn mới" modal state for Teacher / Admin
  const [newMsgModalOpen, setNewMsgModalOpen] = useState(false);
  const [studentQuery, setStudentQuery] = useState('');
  const [studentResults, setStudentResults] = useState<KtnStudentProfile[]>([]);
  const [isSearchingStudents, setIsSearchingStudents] = useState(false);

  const roomPollInterval = useMemo(() => {
    if (isDemoMode) return false;
    const host =
      typeof window !== 'undefined' ? window.location.hostname.toLowerCase() : '';
    const isLocalTestHost = host === 'localhost' || host === '127.0.0.1';
    if (isLocalTestHost) return 3500;
    return 15000 + Math.floor(Math.random() * 5000);
  }, [isDemoMode]);

  const { data: serverRooms = [], isLoading: isRoomsLoading } = useChatRooms({
    refetchInterval: roomPollInterval,
  });
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  const resolveStudentDirectTarget = useCallback(() => {
    const cachedPrivateMeta = queryClient.getQueryData<ChatRoom | null>([
      'chat-private-room-meta',
      user?.email,
    ]);
    if (cachedPrivateMeta && typeof cachedPrivateMeta.hasAssignedTeacher === 'boolean') {
      const hasTeacher = cachedPrivateMeta.hasAssignedTeacher;
      return {
        hasAssignedTeacher: hasTeacher,
        recipientTargetType:
          cachedPrivateMeta.recipientTargetType ||
          (hasTeacher ? ('teacher' as const) : ('support_center' as const)),
        label: hasTeacher
          ? cachedPrivateMeta.label ||
            tr('Lão sư Chủ nhiệm & Học vụ KTN (1-1)', 'Homeroom Teacher & KTN Academic Support (1-1)')
          : cachedPrivateMeta.label ||
            tr('🏢 Học vụ Khổng Tử Nhí', '🏢 KTN Academic Office'),
        shortLabel: hasTeacher
          ? cachedPrivateMeta.shortLabel || tr('1-1 Giáo viên', '1-1 Teacher')
          : cachedPrivateMeta.shortLabel || tr('Học vụ KTN', 'Academic Office'),
        teacherName: hasTeacher
          ? cachedPrivateMeta.teacherName
          : tr('Học vụ Khổng Tử Nhí', 'KTN Academic Office'),
      };
    }

    const activeClassRoom = serverRooms.find((r) => r.type === 'class');
    const teacherRaw = String(activeClassRoom?.teacherName || '').trim();
    const hasTeacher =
      Boolean(activeClassRoom) &&
      Boolean(teacherRaw) &&
      teacherRaw !== 'Chưa phân công giáo viên' &&
      teacherRaw !== 'No teacher assigned yet';

    if (hasTeacher) {
      return {
        hasAssignedTeacher: true,
        recipientTargetType: 'teacher' as const,
        label: tr('Lão sư Chủ nhiệm & Học vụ KTN (1-1)', 'Homeroom Teacher & KTN Academic Support (1-1)'),
        shortLabel: tr('1-1 Giáo viên', '1-1 Teacher'),
        teacherName: teacherRaw,
      };
    }
    return {
      hasAssignedTeacher: false,
      recipientTargetType: 'support_center' as const,
      label: tr('🏢 Học vụ Khổng Tử Nhí', '🏢 KTN Academic Office'),
      shortLabel: tr('Học vụ KTN', 'Academic Office'),
      teacherName: tr('Học vụ Khổng Tử Nhí', 'KTN Academic Office'),
    };
  }, [queryClient, serverRooms, tr, user?.email]);

  // Merge ephemeral 1-1 room only if it is not yet in serverRooms
  const rooms = useMemo(() => {
    if (!ephemeralRoom) return serverRooms;
    const normEphemeralId = String(ephemeralRoom.roomId || '').trim().toUpperCase();
    const alreadyPersisted = serverRooms.some(
      (r) => String(r.roomId || '').trim().toUpperCase() === normEphemeralId
    );
    if (alreadyPersisted) {
      return serverRooms;
    }
    return [ephemeralRoom, ...serverRooms];
  }, [serverRooms, ephemeralRoom]);

  // Clear ephemeralRoom once it has been persisted in serverRooms
  useEffect(() => {
    if (!ephemeralRoom) return;
    const normEphemeralId = String(ephemeralRoom.roomId || '').trim().toUpperCase();
    if (serverRooms.some((r) => String(r.roomId || '').trim().toUpperCase() === normEphemeralId)) {
      setEphemeralRoom(null);
    }
  }, [serverRooms, ephemeralRoom]);

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
      // If Student opens their own 1-1 room or Admin deep-links to a student: room that has no messages yet, open ephemeral draft room
      if (!isRoomsLoading && normParam.startsWith('STUDENT:')) {
        const targetStudentEmail = roomParam.slice(8).trim().toLowerCase();
        const isOwnStudentRoom =
          user?.role === 'student' &&
          String(user?.email || '').trim().toLowerCase() === targetStudentEmail;
        if (targetStudentEmail && (isOwnStudentRoom || user?.role === 'admin')) {
          const directTarget = resolveStudentDirectTarget();
          const draftRoom: ChatRoom = {
            roomId: `student:${targetStudentEmail}`,
            type: 'student',
            studentEmail: targetStudentEmail,
            studentName: isOwnStudentRoom ? user?.name || targetStudentEmail : targetStudentEmail,
            hasAssignedTeacher: isOwnStudentRoom ? directTarget.hasAssignedTeacher : undefined,
            recipientTargetType: isOwnStudentRoom ? directTarget.recipientTargetType : undefined,
            teacherName: isOwnStudentRoom ? directTarget.teacherName : undefined,
            label: isOwnStudentRoom
              ? directTarget.label
              : `1-1: ${targetStudentEmail}`,
            shortLabel: isOwnStudentRoom ? directTarget.shortLabel : targetStudentEmail,
            lastMessage: '',
            hasMessages: false,
            isEphemeral: true,
            unreadCount: 0,
          };
          setEphemeralRoom(draftRoom);
          setActiveRoomId(draftRoom.roomId);
          if (!mobileChatConversationOpen) {
            setMobileChatConversationOpen(true);
          }
          return;
        }
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
    user?.role,
    user?.email,
    user?.name,
    tr,
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
    isError: isMessagesError,
    error: messagesError,
    hasMoreOlder,
    isLoadingOlder,
    loadOlderMessages,
    markRoomRead,
  } = useRoomMessages(resolvedRoomId);

  const isRoomForbidden =
    isMessagesError &&
    messagesError instanceof KtnApiError &&
    messagesError.status === 403;

  useEffect(() => {
    if (!isRoomForbidden || !resolvedRoomId) return;
    setEphemeralRoom(null);
    setActiveRoomId('');
    setMobileChatConversationOpen(false);
    addToast({
      title: tr('Phòng chat đã đóng quyền truy cập', 'Chat room access revoked'),
      description:
        messagesError instanceof Error
          ? messagesError.message
          : tr(
              'Bạn không còn thuộc phòng hoặc lớp học này. Đã làm mới danh sách phòng hợp lệ.',
              'You no longer have access to this class or conversation. Room list refreshed.'
            ),
      variant: 'error',
    });
    if (roomParam) {
      setSearchParams({}, { replace: true });
    }
  }, [
    isRoomForbidden,
    resolvedRoomId,
    messagesError,
    roomParam,
    setActiveRoomId,
    setMobileChatConversationOpen,
    setSearchParams,
    addToast,
    tr,
  ]);

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

  const handleSelectRoom = useCallback(
    (roomId: string) => {
      // If leaving an ephemeral room without having sent any message, discard the ephemeral room so no garbage thread remains
      if (
        ephemeralRoom &&
        String(ephemeralRoom.roomId || '').trim().toUpperCase() !==
          String(roomId || '').trim().toUpperCase()
      ) {
        setEphemeralRoom(null);
      }
      setActiveRoomId(roomId);
      setMobileChatConversationOpen(true);
      setReplyingTo(null);
      setSearchOpen(false);
      setSearchQuery('');
      setSearchParams({ room: roomId }, { replace: true });
    },
    [ephemeralRoom, setActiveRoomId, setMobileChatConversationOpen, setSearchParams]
  );

  const handleOpenNewMessage = useCallback(() => {
    if (user?.role === 'student') {
      const studentEmail = String(
        user?.email || (isDemoMode ? 'hoangngan@khongtunhi.com' : '')
      )
        .trim()
        .toLowerCase();
      if (!studentEmail) return;
      const targetRoomId = `student:${studentEmail}`;
      const existing = serverRooms.find(
        (r) => String(r.roomId || '').trim().toLowerCase() === targetRoomId
      );
      if (existing) {
        handleSelectRoom(existing.roomId);
        return;
      }
      const directTarget = resolveStudentDirectTarget();
      const draftRoom: ChatRoom = {
        roomId: targetRoomId,
        type: 'student',
        classCode: user?.classCode || undefined,
        studentEmail,
        studentName: user?.name || studentEmail,
        hasAssignedTeacher: directTarget.hasAssignedTeacher,
        recipientTargetType: directTarget.recipientTargetType,
        teacherName: directTarget.teacherName,
        label: directTarget.label,
        shortLabel: directTarget.shortLabel,
        lastMessage: '',
        hasMessages: false,
        isEphemeral: true,
        unreadCount: 0,
      };
      setEphemeralRoom(draftRoom);
      setActiveRoomId(draftRoom.roomId);
      setMobileChatConversationOpen(true);
      setSearchParams({ room: draftRoom.roomId }, { replace: true });
      return;
    }

    setStudentQuery('');
    setNewMsgModalOpen(true);
  }, [
    user?.role,
    user?.email,
    user?.classCode,
    user?.name,
    isDemoMode,
    serverRooms,
    handleSelectRoom,
    setActiveRoomId,
    setMobileChatConversationOpen,
    setSearchParams,
    tr,
  ]);

  // Search students for "Nhắn mới" modal (Teacher / Admin)
  useEffect(() => {
    if (!newMsgModalOpen) return;

    const assignedClassCodes = new Set(
      serverRooms
        .filter((r) => r.type === 'class' && r.classCode)
        .map((r) => String(r.classCode || '').trim().toUpperCase())
    );

    if (isDemoMode) {
      const qNorm = normalizeVietnameseSearchText(studentQuery);
      const filtered = DEMO_FALLBACK_STUDENTS.filter((s) => {
        if (user?.role === 'teacher') {
          const sCls = String(s.class_code || '').trim().toUpperCase();
          if (!sCls) return false;
          if (assignedClassCodes.size > 0 && !assignedClassCodes.has(sCls)) return false;
        }
        if (!qNorm) return true;
        return normalizeVietnameseSearchText(
          `${s.name} ${s.email} ${s.code || ''} ${s.class_code || ''}`
        ).includes(qNorm);
      });
      setStudentResults(filtered);
      setIsSearchingStudents(false);
      return;
    }

    const controller = new AbortController();
    setIsSearchingStudents(true);
    const timer = setTimeout(async () => {
      try {
        const rawItems = await chatApi.searchMessageCandidates(
          { q: studentQuery.trim(), limit: 25 },
          controller.signal
        );
        const allowedItems =
          user?.role === 'teacher'
            ? rawItems.filter((s) => {
                const sCls = String(s.class_code || '').trim().toUpperCase();
                // Teacher may only message students assigned to their classes (never unassigned students)
                if (!sCls) return false;
                if (assignedClassCodes.size > 0) return assignedClassCodes.has(sCls);
                if (user?.classCode) {
                  return sCls === String(user.classCode).trim().toUpperCase();
                }
                return isRoomsLoading;
              })
            : rawItems;
        setStudentResults(allowedItems);
      } catch (err) {
        if ((err as Error)?.name !== 'AbortError') {
          setStudentResults([]);
        }
      } finally {
        if (!controller.signal.aborted) {
          setIsSearchingStudents(false);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [newMsgModalOpen, studentQuery, isDemoMode, user?.role, user?.classCode, isRoomsLoading, serverRooms]);

  const handleStartDirectChatWithStudent = useCallback(
    (student: KtnStudentProfile) => {
      const email = String(student.email || '').trim().toLowerCase();
      if (!email) return;
      const targetRoomId = `student:${email}`;
      setNewMsgModalOpen(false);

      const existing = serverRooms.find(
        (r) => String(r.roomId || '').trim().toLowerCase() === targetRoomId
      );
      if (existing) {
        handleSelectRoom(existing.roomId);
        return;
      }

      const cls = String(student.class_code || '').trim().toUpperCase();
      const studentName = String(student.name || email).trim();
      const draftRoom: ChatRoom = {
        roomId: targetRoomId,
        type: 'student',
        classCode: cls || undefined,
        studentEmail: email,
        studentName,
        label: `1-1: ${studentName}${cls ? ` (${cls})` : ''}`,
        shortLabel: studentName,
        lastMessage: '',
        hasMessages: false,
        isEphemeral: true,
        unreadCount: 0,
      };
      setEphemeralRoom(draftRoom);
      setActiveRoomId(draftRoom.roomId);
      setMobileChatConversationOpen(true);
      setReplyingTo(null);
      setSearchOpen(false);
      setSearchQuery('');
      setSearchParams({ room: draftRoom.roomId }, { replace: true });
    },
    [
      serverRooms,
      handleSelectRoom,
      setActiveRoomId,
      setMobileChatConversationOpen,
      setSearchParams,
    ]
  );

  const handleSendWithRoomMeta = useCallback(
    (input: SendMessageInput) => {
      return sendMessage({
        ...input,
        roomMeta: activeRoom || undefined,
      });
    },
    [sendMessage, activeRoom]
  );

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
            {tr('Trạng thái kiểm thử Phòng Chat (Demo):', 'Chat Room Test State (Demo):')}
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'demo_rich', label: tr('Đầy đủ tin nhắn', 'Rich messages') },
                { id: 'demo_empty', label: tr('Lớp mới (Trống)', 'New class (Empty)') },
                { id: 'demo_unread', label: tr('Có tin chưa đọc', 'Has unread') },
                { id: 'demo_sending', label: tr('Đang gửi...', 'Sending...') },
                { id: 'demo_failed', label: tr('Gửi lỗi + Thử lại', 'Failed + Retry') },
                { id: 'live_real', label: tr('Dữ liệu thật', 'Live data') },
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
            onOpenNewMessage={handleOpenNewMessage}
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
                  if (ephemeralRoom && messages.length === 0) {
                    setEphemeralRoom(null);
                  }
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
                room={activeRoom}
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
                    content:
                      formatQuotedReplyText(msg.content, msg.attachment, lang) ||
                      msg.content ||
                      tr('📷 Hình ảnh', '📷 Image'),
                    messageId: msg.id,
                  })
                }
                onRetryMessage={retryFailedMessage}
                onQuickGreeting={(text) => {
                  const authState = useAuthStore.getState();
                  const uiState = useUiStore.getState();
                  if (!authState.user && !authState.authUser && !uiState.isDemoMode && !getStoredSession()) {
                    return;
                  }
                  setRoomDraft(activeRoom.roomId, text);
                }}
              />

              <MessageComposer
                roomId={activeRoom.roomId}
                classCode={activeRoom.classCode}
                replyingTo={replyingTo}
                isSending={isSending}
                onClearReply={() => setReplyingTo(null)}
                onSend={handleSendWithRoomMeta}
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
                  ? tr(
                      `Nhóm lớp "${roomParam.replace(/^class:/i, '')}" không còn hoạt động hoặc bạn không có quyền truy cập`,
                      `Class group "${roomParam.replace(/^class:/i, '')}" is no longer active or you do not have access`
                    )
                  : tr('Chưa chọn phòng trao đổi lớp học', 'No class conversation selected')}
              </h3>
              <p className="mt-1 max-w-sm text-xs text-stone-500">
                {roomParam && !isRoomsLoading
                  ? tr(
                      'Lớp học có thể đã được lưu trữ hoặc tài khoản hiện tại không thuộc danh sách thành viên lớp.',
                      'The class may have been archived or your current account is not on the class roster.'
                    )
                  : tr(
                      'Vui lòng chọn một lớp học hoặc kênh hỗ trợ ở danh sách bên trái để bắt đầu nhắn tin.',
                      'Please select a class or support channel from the list on the left to start messaging.'
                    )}
              </p>
              {roomParam && !isRoomsLoading && (
                <button
                  type="button"
                  data-testid="chat-room-return-valid-btn"
                  onClick={() => {
                    setSearchParams({}, { replace: true });
                    setMobileChatConversationOpen(false);
                  }}
                  className="mt-4 inline-flex min-h-[36px] items-center rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
                >
                  {tr('Quay về danh sách phòng hợp lệ', 'Return to valid conversations')}
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      {/* "Nhắn mới" 1-1 Student Picker Modal (Teacher & Admin) */}
      {newMsgModalOpen && (
        <div
          data-testid="chat-new-message-modal"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Bắt đầu tin nhắn 1-1 mới', 'Start a new 1-1 message')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setNewMsgModalOpen(false)}
        >
          <div
            className="flex max-h-[82vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3">
              <div className="flex items-center gap-2">
                <UserPlus className="h-4 w-4 text-red-800" />
                <h2 className="font-display text-sm font-bold text-stone-900">
                  {tr('Nhắn mới 1-1 với học viên', 'New 1-1 message with student')}
                </h2>
              </div>
              <button
                type="button"
                data-testid="chat-new-message-close-btn"
                onClick={() => setNewMsgModalOpen(false)}
                aria-label={tr('Đóng cửa sổ nhắn mới', 'Close new message dialog')}
                title={tr('Đóng cửa sổ nhắn mới', 'Close new message dialog')}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 hover:text-stone-800"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="border-b border-stone-100 p-3">
              <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-red-700 focus-within:bg-white">
                <Search className="h-4 w-4 shrink-0 text-stone-400" />
                <input
                  type="text"
                  data-testid="chat-new-message-search-input"
                  value={studentQuery}
                  onChange={(e) => setStudentQuery(e.target.value)}
                  placeholder={tr(
                    'Nhập tên, mã HV hoặc email học viên (hỗ trợ không dấu)...',
                    'Enter student name, ID, or email...'
                  )}
                  className="w-full bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
                  autoFocus
                />
              </div>
              <p className="mt-1.5 text-[11px] text-stone-500">
                {tr(
                  'Hội thoại 1-1 chỉ xuất hiện trong danh sách Gần đây sau khi gửi tin nhắn đầu tiên.',
                  '1-1 conversations only appear in Recent after sending the first message.'
                )}
              </p>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto divide-y divide-stone-100">
              {isSearchingStudents ? (
                <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-500">
                  <Loader2 className="h-4 w-4 animate-spin text-red-800" />
                  <span>{tr('Đang tìm học viên...', 'Searching students...')}</span>
                </div>
              ) : studentResults.length === 0 ? (
                <div className="py-8 text-center text-xs text-stone-500">
                  {tr(
                    'Không tìm thấy học viên hợp lệ trong phạm vi lớp phụ trách.',
                    'No eligible students found within your assigned classes.'
                  )}
                </div>
              ) : (
                studentResults.map((st) => (
                  <button
                    key={st.email}
                    type="button"
                    data-testid={`chat-new-message-student-item-${st.email}`}
                    onClick={() => handleStartDirectChatWithStudent(st)}
                    className="flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors hover:bg-red-50/60"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-100 font-display text-xs font-bold text-amber-900 border border-amber-300/80">
                      {getInitials(st.name || st.email)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-stone-900">
                        {st.name || st.email}
                      </p>
                      <p className="truncate text-[11px] text-stone-500">
                        {st.email}
                        {st.class_code ? ` • ${tr('Lớp', 'Class')} ${st.class_code}` : ''}
                      </p>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
