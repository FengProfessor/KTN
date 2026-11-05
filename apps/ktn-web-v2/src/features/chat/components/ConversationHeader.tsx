import React from 'react';
import {
  ArrowLeft,
  Search,
  Users,
  Wifi,
  WifiOff,
  RefreshCw,
  GraduationCap,
  X,
} from 'lucide-react';
import { ChatConnectionState, ChatRoom } from '../types/chat.types';

interface ConversationHeaderProps {
  room: ChatRoom | null;
  connectionState: ChatConnectionState;
  searchOpen: boolean;
  searchQuery: string;
  onToggleSearch: () => void;
  onSearchChange: (q: string) => void;
  onMobileBack: () => void;
  onRefresh: () => void;
}

export const ConversationHeader: React.FC<ConversationHeaderProps> = ({
  room,
  connectionState,
  searchOpen,
  searchQuery,
  onToggleSearch,
  onSearchChange,
  onMobileBack,
  onRefresh,
}) => {
  if (!room) return null;

  const shortBadge = (room.classCode || room.shortLabel || room.roomId)
    .replace(/^class:|^course:|^student:/, '')
    .slice(0, 4)
    .toUpperCase();

  const renderConnectionBadge = () => {
    if (connectionState === 'offline') {
      return (
        <span
          data-testid="chat-connection-offline"
          className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[11px] font-semibold text-red-800"
        >
          <WifiOff className="h-3 w-3" />
          Mất kết nối
        </span>
      );
    }
    if (connectionState === 'reconnecting') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
          <RefreshCw className="h-3 w-3 animate-spin" />
          Đang đồng bộ...
        </span>
      );
    }
    return (
      <span
        data-testid="chat-connection-online"
        className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700"
      >
        <Wifi className="h-3 w-3" />
        Trực tuyến
      </span>
    );
  };

  return (
    <header className="border-b border-stone-200 bg-white px-3.5 py-2.5 shadow-2xs">
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          {/* Mobile Back Button */}
          <button
            type="button"
            data-testid="mobile-chat-back-btn"
            onClick={onMobileBack}
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 lg:hidden"
            aria-label="Quay lại danh sách hội thoại"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          {/* Room Icon */}
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-red-800 to-red-950 font-display text-xs font-bold text-amber-100 shadow-sm">
            {shortBadge}
          </div>

          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2
                data-testid="active-chat-room-title"
                className="truncate font-display text-sm font-bold text-stone-900 sm:text-base"
              >
                {room.label || `Lớp ${room.classCode || room.roomId}`}
              </h2>
              {room.classCode && (
                <span className="hidden rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-stone-600 sm:inline-block">
                  #{room.classCode}
                </span>
              )}
            </div>

            <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-stone-500">
              {room.teacherName && (
                <span className="inline-flex items-center gap-1 font-medium text-stone-700">
                  <GraduationCap className="h-3.5 w-3.5 text-red-800" />
                  {room.teacherName}
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px]">
                <Users className="h-3 w-3" />
                {room.memberCount ? `${room.memberCount} thành viên` : 'Nhóm lớp chính thức'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          {renderConnectionBadge()}

          <button
            type="button"
            onClick={onToggleSearch}
            className={`inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors ${
              searchOpen
                ? 'border-red-300 bg-red-50 text-red-800'
                : 'border-stone-200 bg-white text-stone-600 hover:bg-stone-50'
            }`}
            title="Tìm kiếm trong hội thoại"
            aria-label="Tìm kiếm trong hội thoại"
          >
            <Search className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={onRefresh}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
            title="Làm mới tin nhắn"
            aria-label="Làm mới tin nhắn"
          >
            <RefreshCw className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {searchOpen && (
        <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5">
          <Search className="h-4 w-4 text-stone-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Tìm nội dung tin nhắn hoặc tên người gửi trong lớp..."
            className="w-full bg-transparent text-xs text-stone-900 placeholder:text-stone-400 focus:outline-none"
            autoFocus
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => onSearchChange('')}
              className="rounded p-0.5 text-stone-400 hover:text-stone-700"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </header>
  );
};
