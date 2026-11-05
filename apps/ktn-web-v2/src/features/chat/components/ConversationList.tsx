import React, { useState, useMemo } from 'react';
import { Search, MessageSquare, Users, Headset, Sparkles } from 'lucide-react';
import { ChatRoom } from '../types/chat.types';
import { UnreadBadge } from './UnreadBadge';
import { formatRelativeTime } from '@/lib/utils';

interface ConversationListProps {
  rooms: ChatRoom[];
  activeRoomId: string | null;
  isLoading: boolean;
  onSelectRoom: (roomId: string) => void;
}

export const ConversationList: React.FC<ConversationListProps> = ({
  rooms,
  activeRoomId,
  isLoading,
  onSelectRoom,
}) => {
  const [searchText, setSearchText] = useState('');
  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'support'>('all');

  const totalUnread = useMemo(
    () => rooms.reduce((acc, r) => acc + (Number(r.unreadCount) || 0), 0),
    [rooms]
  );

  const filteredRooms = useMemo(() => {
    return rooms.filter((room) => {
      const matchesSearch =
        !searchText.trim() ||
        room.label?.toLowerCase().includes(searchText.toLowerCase()) ||
        room.roomId?.toLowerCase().includes(searchText.toLowerCase()) ||
        room.teacherName?.toLowerCase().includes(searchText.toLowerCase());

      if (!matchesSearch) return false;

      if (filterTab === 'unread') {
        return (Number(room.unreadCount) || 0) > 0;
      }
      if (filterTab === 'support') {
        return room.type === 'student';
      }
      return true;
    });
  }, [rooms, searchText, filterTab]);

  return (
    <aside
      data-testid="chat-conversation-list"
      className="flex h-full w-full flex-col border-r border-stone-200 bg-white lg:w-[330px] xl:w-[360px] shrink-0"
    >
      {/* Top Header */}
      <div className="border-b border-stone-200 p-3.5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-base font-bold text-stone-900">
              Trao đổi lớp học
            </h1>
            {totalUnread > 0 && <UnreadBadge count={totalUnread} />}
          </div>
          <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-900">
            <Sparkles className="h-3 w-3 text-red-700" />
            Zalo KTN
          </span>
        </div>

        {/* Search Input */}
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 focus-within:border-red-700 focus-within:bg-white">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="Tìm lớp học, giáo viên chủ nhiệm..."
            className="w-full bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
          />
        </div>

        {/* Filter Tabs */}
        <div className="mt-2.5 grid grid-cols-3 gap-1 rounded-xl bg-stone-100 p-1">
          <button
            type="button"
            onClick={() => setFilterTab('all')}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
              filterTab === 'all'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Tất cả ({rooms.length})
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('unread')}
            className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-xs font-semibold transition-all ${
              filterTab === 'unread'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            <span>Chưa đọc</span>
            {totalUnread > 0 && (
              <span className="rounded-full bg-red-600 px-1.5 text-[10px] text-white">
                {totalUnread}
              </span>
            )}
          </button>
          <button
            type="button"
            onClick={() => setFilterTab('support')}
            className={`rounded-lg py-1.5 text-xs font-semibold transition-all ${
              filterTab === 'support'
                ? 'bg-white text-red-900 shadow-2xs'
                : 'text-stone-600 hover:text-stone-900'
            }`}
          >
            Trao đổi 1-1
          </button>
        </div>
      </div>

      {/* Room List */}
      <div className="flex-1 overflow-y-auto divide-y divide-stone-100">
        {isLoading ? (
          <div className="space-y-3 p-3.5">
            {[1, 2, 3].map((i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="h-11 w-11 animate-pulse rounded-xl bg-stone-200" />
                <div className="flex-1 space-y-2">
                  <div className="h-3.5 w-32 animate-pulse rounded bg-stone-200" />
                  <div className="h-3 w-48 animate-pulse rounded bg-stone-100" />
                </div>
              </div>
            ))}
          </div>
        ) : filteredRooms.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <MessageSquare className="h-8 w-8 text-stone-300" />
            <p className="mt-2 text-xs font-semibold text-stone-700">
              Không có hội thoại nào
            </p>
            <p className="mt-1 text-[11px] text-stone-500">
              {filterTab === 'unread'
                ? 'Bạn đã đọc hết tất cả tin nhắn mới.'
                : 'Danh sách lớp học của bạn sẽ tự động hiển thị tại đây.'}
            </p>
          </div>
        ) : (
          filteredRooms.map((room) => {
            const isSelected = room.roomId === activeRoomId;
            const isDirect = room.type === 'student';
            const unread = Number(room.unreadCount) || 0;
            const badgeText = (room.classCode || room.shortLabel || room.roomId)
              .replace(/^class:|^course:|^student:/, '')
              .slice(0, 4)
              .toUpperCase();

            return (
              <button
                key={room.roomId}
                type="button"
                data-testid={`chat-room-item-${room.roomId}`}
                onClick={() => onSelectRoom(room.roomId)}
                className={`flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors ${
                  isSelected
                    ? 'bg-red-50/90 border-l-4 border-l-red-800'
                    : 'hover:bg-stone-50'
                }`}
              >
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold shadow-2xs ${
                    isDirect
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : isSelected
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-800 border border-stone-200'
                  }`}
                >
                  {isDirect ? (
                    <Headset className="h-5 w-5 text-amber-800" />
                  ) : (
                    <span>{badgeText}</span>
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-1">
                    <p
                      className={`truncate text-sm ${
                        unread > 0 || isSelected
                          ? 'font-bold text-stone-950'
                          : 'font-semibold text-stone-800'
                      }`}
                    >
                      {room.label}
                    </p>
                    {room.updatedAt && (
                      <span className="shrink-0 text-[10.5px] font-medium text-stone-400">
                        {formatRelativeTime(room.updatedAt)}
                      </span>
                    )}
                  </div>

                  {room.teacherName && (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] font-medium text-red-800/90">
                      <Users className="h-3 w-3 shrink-0" />
                      <span>{room.teacherName}</span>
                    </p>
                  )}

                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p
                      className={`truncate text-xs ${
                        unread > 0 ? 'font-semibold text-stone-900' : 'text-stone-500'
                      }`}
                    >
                      {room.lastMessage || 'Nhấn để mở phòng trao đổi lớp học'}
                    </p>
                    <UnreadBadge count={unread} />
                  </div>
                </div>
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
};
