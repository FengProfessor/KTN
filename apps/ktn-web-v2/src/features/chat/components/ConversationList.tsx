import React, { useState, useMemo, useRef, useLayoutEffect } from 'react';
import {
  Search,
  MessageSquare,
  MessageSquarePlus,
  ChevronDown,
  ChevronRight,
  UserCheck,
  X,
} from 'lucide-react';
import { ChatRoom } from '../types/chat.types';
import { UnreadBadge } from './UnreadBadge';
import { formatRelativeTime, getInitials } from '@/lib/utils';
import {
  formatRoomPreviewText,
  hasRoomRealMessages,
  normalizeVietnameseSearchText,
} from '../services/chatApi';

export type ChatInboxFilterTab = 'all' | 'unread' | 'groups' | 'support';

interface ConversationListProps {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  isLoading: boolean;
  onSelectRoom: (roomId: string) => void;
  onOpenNewMessage?: () => void;
}

export function formatCompactRoomTitle(room: ChatRoom): string {
  const raw = String(room.label || room.shortLabel || room.roomId || '').trim();
  if (!raw) return room.roomId;
  // Strip leading emoji clutter while keeping the meaningful room name on 1 line
  return raw.replace(/^(?:👩‍🏫|👨‍🏫|🏫|🎬|💬)\s*/u, '').trim();
}

export const ConversationList: React.FC<ConversationListProps> = ({
  rooms,
  activeRoomId,
  isLoading,
  onSelectRoom,
  onOpenNewMessage,
}) => {
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<ChatInboxFilterTab>('all');
  const [showEmptyGroups, setShowEmptyGroups] = useState(true);
  const roomListScrollRef = useRef<HTMLDivElement | null>(null);
  const prevFilterKeyRef = useRef<string>('all::');

  const normalizedSearch = normalizeVietnameseSearchText(searchText);

  useLayoutEffect(() => {
    const nextFilterKey = `${filterTab}::${normalizedSearch}`;
    if (prevFilterKeyRef.current !== nextFilterKey) {
      prevFilterKeyRef.current = nextFilterKey;
      if (roomListScrollRef.current) {
        roomListScrollRef.current.scrollTop = 0;
      }
    }
  }, [filterTab, normalizedSearch]);

  const totalUnread = useMemo(
    () => rooms.reduce((acc, r) => acc + (Number(r.unreadCount) || 0), 0),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      if (normalizedSearch) {
        const haystack = normalizeVietnameseSearchText(
          `${room.label || ''} ${room.shortLabel || ''} ${room.roomId || ''} ${room.classCode || ''} ${room.teacherName || ''} ${room.studentName || ''} ${room.studentEmail || ''}`
        );
        if (!haystack.includes(normalizedSearch)) {
          return false;
        }
      }

      if (filterTab === 'unread') {
        return (Number(room.unreadCount) || 0) > 0;
      }
      if (filterTab === 'groups') {
        return room.type !== 'student' && !String(room.roomId || '').toLowerCase().startsWith('student:');
      }
      if (filterTab === 'support') {
        return (
          (room.type === 'student' || String(room.roomId || '').toLowerCase().startsWith('student:')) &&
          (hasRoomRealMessages(room) || Boolean(room.isEphemeral))
        );
      }
      // 'all' ('Gần đây'): active conversations + accessible group rooms; never empty 1-1 unless ephemeral
      const isDirect =
        room.type === 'student' || String(room.roomId || '').toLowerCase().startsWith('student:');
      if (isDirect && !hasRoomRealMessages(room) && !room.isEphemeral) {
        return false;
      }
      return true;
    });
  }, [rooms, normalizedSearch, filterTab]);

  const { activeConversationRooms, emptyGroupRooms } = useMemo(() => {
    const activeList: ChatRoom[] = [];
    const emptyGroups: ChatRoom[] = [];
    for (const room of filteredRooms) {
      if (hasRoomRealMessages(room) || room.isEphemeral) {
        activeList.push(room);
      } else {
        emptyGroups.push(room);
      }
    }
    return { activeConversationRooms: activeList, emptyGroupRooms: emptyGroups };
  }, [filteredRooms]);

  const renderRoomItem = (room: ChatRoom) => {
    const isSelected = room.roomId === activeRoomId;
    const isDirect =
      room.type === 'student' || String(room.roomId || '').toLowerCase().startsWith('student:');
    const unread = Number(room.unreadCount) || 0;
    const hasMessages = hasRoomRealMessages(room);
    const titleText = formatCompactRoomTitle(room);
    const previewText = formatRoomPreviewText(room);
    const timestampValue = hasMessages ? room.lastMessageAt || room.updatedAt : undefined;

    const badgeText = isDirect
      ? getInitials(
          room.studentName ||
            room.teacherName ||
            titleText.replace(/^1-1:\s*/i, '')
        )
      : (room.classCode || room.shortLabel || room.roomId)
          .replace(/^class:|^course:|^student:/i, '')
          .slice(0, 4)
          .toUpperCase();

    return (
      <button
        key={room.roomId}
        type="button"
        data-testid={`chat-room-item-${room.roomId}`}
        onClick={() => onSelectRoom(room.roomId)}
        className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors ${
          isSelected
            ? 'bg-red-50/90 border-l-4 border-l-red-800'
            : 'hover:bg-stone-50'
        }`}
      >
        <div
          className={`flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-full font-display text-[11px] font-bold shadow-2xs ${
            isDirect
              ? isSelected
                ? 'bg-amber-700 text-white'
                : 'bg-amber-100 text-amber-900 border border-amber-300/80'
              : isSelected
              ? 'bg-red-800 text-white'
              : hasMessages
              ? 'bg-red-50 text-red-900 border border-red-200/80'
              : 'bg-stone-100 text-stone-600 border border-stone-200'
          }`}
        >
          {isDirect && badgeText.length < 2 ? (
            <UserCheck className="h-4 w-4" />
          ) : (
            <span>{badgeText}</span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p
              title={titleText}
              className={`min-w-0 flex-1 truncate text-[13px] sm:text-sm leading-tight ${
                unread > 0
                  ? 'font-bold text-stone-950'
                  : isSelected
                  ? 'font-bold text-red-950'
                  : hasMessages
                  ? 'font-semibold text-stone-900'
                  : 'font-medium text-stone-700'
              }`}
            >
              {titleText}
            </p>
            {room.isEphemeral && !hasMessages ? (
              <span className="shrink-0 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                Nháp
              </span>
            ) : timestampValue ? (
              <span
                className={`shrink-0 text-[10.5px] ${
                  unread > 0 ? 'font-bold text-red-700' : 'font-medium text-stone-400'
                }`}
              >
                {formatRelativeTime(timestampValue)}
              </span>
            ) : null}
          </div>

          <div className="mt-0.5 flex items-center justify-between gap-2">
            <p
              className={`min-w-0 flex-1 truncate text-xs leading-snug ${
                unread > 0
                  ? 'font-semibold text-stone-900'
                  : hasMessages
                  ? 'text-stone-500'
                  : 'text-stone-400 italic'
              }`}
            >
              {previewText}
            </p>
            <UnreadBadge count={unread} className="shrink-0" />
          </div>
        </div>
      </button>
    );
  };

  return (
    <aside
      data-testid="chat-conversation-list"
      className="flex h-full min-h-0 min-w-0 w-full flex-col overflow-hidden border-r border-stone-200 bg-white lg:w-[320px] xl:w-[350px] shrink-0"
    >
      {/* Compact Inbox Header */}
      <div className="shrink-0 border-b border-stone-200 bg-white px-3 py-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-1.5">
            <h1 className="truncate font-display text-base font-bold text-stone-900">
              Tin nhắn
            </h1>
            {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
          </div>
          {onOpenNewMessage && (
            <button
              type="button"
              data-testid="chat-new-message-btn"
              onClick={onOpenNewMessage}
              title="Nhắn mới"
              aria-label="Nhắn mới"
              className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-red-900"
            >
              <MessageSquarePlus className="h-3.5 w-3.5" />
              <span>Nhắn mới</span>
            </button>
          )}
        </div>

        {/* Compact Search Input */}
        <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 focus-within:border-red-700 focus-within:bg-white">
          <Search className="h-3.5 w-3.5 shrink-0 text-stone-400" />
          <input
            type="text"
            data-testid="chat-room-search-input"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm tên phòng, lớp, học viên..."
            className="w-full bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
          {searchText && (
            <button
              type="button"
              onClick={() => setSearchText('')}
              aria-label="Xóa tìm kiếm phòng"
              title="Xóa tìm kiếm phòng"
              className="rounded p-0.5 text-stone-400 hover:text-stone-700"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        {/* 4 Filter Tabs: Gần đây, Chưa đọc, Nhóm lớp, 1-1 */}
        <div className="mt-2 grid grid-cols-4 gap-1 rounded-lg bg-stone-100 p-0.5">
          <button
            type="button"
            data-testid="chat-filter-tab-all"
            onClick={() => setFilterTab('all')}
            className={`truncate rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
              filterTab === 'all'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Gần đây
          </button>
          <button
            type="button"
            data-testid="chat-filter-tab-unread"
            onClick={() => setFilterTab('unread')}
            className={`flex items-center justify-center gap-1 truncate rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
              filterTab === 'unread'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span className="truncate">Chưa đọc</span>
            {totalUnread > 0 && (
              <span className="rounded-full bg-red-600 px-1 text-[9.5px] leading-tight text-white">
                {totalUnread > 99 ? '99+' : totalUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            data-testid="chat-filter-tab-groups"
            onClick={() => setFilterTab('groups')}
            className={`truncate rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
              filterTab === 'groups'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Nhóm lớp
          </button>
          <button
            type="button"
            data-testid="chat-filter-tab-support"
            onClick={() => setFilterTab('support')}
            className={`truncate rounded-md px-1.5 py-1 text-[11px] font-semibold transition-all ${
              filterTab === 'support'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            1-1
          </button>
        </div>
      </div>

      {/* Room List */}
      <div
        ref={roomListScrollRef}
        data-testid="chat-room-scroll-list"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-stone-100"
      >
        {isLoading ? (
          <div className="space-y-2.5 p-3">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="flex items-center gap-2.5">
                <div className="h-9 w-9 animate-pulse rounded-full bg-stone-200" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-28 animate-pulse rounded bg-stone-200" />
                  <div className="h-2.5 w-44 animate-pulse rounded bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-8 w-8 text-stone-300" />
            <p className="mt-2 text-xs font-semibold text-stone-700">
              {filterTab === 'unread'
                ? 'Không có tin nhắn chưa đọc'
                : filterTab === 'support'
                ? 'Chưa có cuộc trò chuyện 1-1 nào'
                : 'Không tìm thấy hội thoại phù hợp'}
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              {filterTab === 'unread'
                ? 'Bạn đã xem hết tất cả các tin nhắn mới.'
                : filterTab === 'support'
                ? 'Nhấn "Nhắn mới" để bắt đầu trao đổi riêng 1-1.'
                : 'Thử từ khóa khác hoặc mở tab Nhóm lớp để xem toàn bộ lớp.'}
            </p>
            {filterTab === 'support' && onOpenNewMessage && (
              <button
                type="button"
                onClick={onOpenNewMessage}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
              >
                <MessageSquarePlus className="h-3.5 w-3.5" />
                <span>Nhắn mới 1-1</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {activeConversationRooms.map(renderRoomItem)}

            {emptyGroupRooms.length > 0 && (
              <div
                data-testid="chat-empty-groups-section"
                className="bg-stone-50/90 px-3 py-1.5"
              >
                <button
                  type="button"
                  data-testid="chat-toggle-empty-groups-btn"
                  onClick={() => setShowEmptyGroups((prev) => !prev)}
                  className="flex w-full items-center justify-between text-left text-[11px] font-bold uppercase tracking-wider text-stone-500 hover:text-stone-800"
                >
                  <span>Nhóm lớp chưa có tin nhắn ({emptyGroupRooms.length})</span>
                  {showEmptyGroups ? (
                    <ChevronDown className="h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <ChevronRight className="h-3.5 w-3.5 shrink-0" />
                  )}
                </button>
              </div>
            )}

            {emptyGroupRooms.length > 0 &&
              showEmptyGroups &&
              emptyGroupRooms.map(renderRoomItem)}
          </>
        )}
      </div>
    </aside>
  );
};
