import React, { useEffect, useState, useMemo } from 'react';
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

  useEffect(() => {
    const roomParam = searchParams.get('room');
    if (roomParam) {
      const matched = rooms.find(
        (r) => r.roomId === roomParam || r.classCode === roomParam
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
    }
    if (rooms.length > 0 && (!activeRoomId || !rooms.some((r) => r.roomId === activeRoomId))) {
      setActiveRoomId(rooms[0].roomId);
    }
  }, [
    rooms,
    searchParams,
    activeRoomId,
    mobileChatConversationOpen,
    setActiveRoomId,
    setMobileChatConversationOpen,
  ]);

  const activeRoom = useMemo(
    () => rooms.find((r) => r.roomId === activeRoomId) || rooms[0] || null,
    [rooms, activeRoomId]
  );

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

  useEffect(() => {
    if (!resolvedRoomId || messages.length === 0) return;
    if ((Number(activeRoom?.unreadCount) || 0) > 0) {
      const lastMsg = messages[messages.length - 1];
      markRoomRead({ roomId: resolvedRoomId, lastReadMessageId: lastMsg?.id });
    }
  }, [resolvedRoomId, activeRoom?.unreadCount, messages, markRoomRead]);

  const handleSelectRoom = (roomId: string) => {
    setActiveRoomId(roomId);
    setMobileChatConversationOpen(true);
    setReplyingTo(null);
    setSearchQuery('');
    setSearchParams({ room: roomId }, { replace: true });
  };

  const canManagePin = user?.role === 'teacher' || user?.role === 'admin';

  return (
    <div
      data-testid="zalo-chat-workspace"
      className="flex h-[calc(100vh-8rem)] lg:h-[calc(100vh-5rem)] w-full flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs"
    >
      {/* Demo Mode Interactive State Switcher Bar */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50/90 px-3.5 py-1.5 text-xs">
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

      <div className="flex flex-1 overflow-hidden">
        {/* Left Pane: Conversation List */}
        <div
          className={`${
            !mobileChatConversationOpen ? 'flex w-full' : 'hidden'
          } lg:flex lg:w-auto h-full`}
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
          } lg:flex flex-1 flex-col h-full min-w-0`}
        >
          {activeRoom ? (
            <>
              <ConversationHeader
                room={activeRoom}
                connectionState={connectionState}
                searchOpen={searchOpen}
                searchQuery={searchQuery}
                onToggleSearch={() => setSearchOpen((prev) => !prev)}
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
                  const el = document.getElementById(`chat-msg-${msgId}`);
                  if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
                }}
              />

              <MessageList
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
            <div className="flex flex-1 flex-col items-center justify-center bg-[#F3EFEA] p-8 text-center">
              <MessageSquareOff className="h-10 w-10 text-stone-400" />
              <h3 className="mt-3 font-display text-base font-bold text-stone-800">
                Chưa chọn phòng trao đổi lớp học
              </h3>
              <p className="mt-1 max-w-sm text-xs text-stone-500">
                Vui lòng chọn một lớp học hoặc kênh hỗ trợ ở danh sách bên trái để bắt đầu nhắn tin.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
