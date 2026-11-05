import React, { useRef, useEffect, useState, useCallback } from 'react';
import { ArrowDown, MessageSquarePlus, History, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types/chat.types';
import { MessageBubble } from './MessageBubble';
import { formatDateDivider } from '@/lib/utils';

interface MessageListProps {
  messages: ChatMessage[];
  currentUserEmail: string;
  currentUserName?: string;
  canManagePin: boolean;
  isLoading: boolean;
  hasMoreOlder: boolean;
  isLoadingOlder: boolean;
  searchQuery?: string;
  onLoadOlder: () => void;
  onReply: (message: ChatMessage) => void;
  onReact: (messageId: string, emoji: string) => void;
  onPinMessage: (message: ChatMessage) => void;
  onRetryMessage: (message: ChatMessage) => void;
  onQuickGreeting?: (text: string) => void;
}

export const MessageList: React.FC<MessageListProps> = ({
  messages,
  currentUserEmail,
  currentUserName,
  canManagePin,
  isLoading,
  hasMoreOlder,
  isLoadingOlder,
  searchQuery = '',
  onLoadOlder,
  onReply,
  onReact,
  onPinMessage,
  onRetryMessage,
  onQuickGreeting,
}) => {
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);
  const prevCountRef = useRef(messages.length);

  const checkScrollPosition = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 120;
    setIsNearBottom(near);
    if (near) {
      setUnreadBelowCount(0);
    }
  }, []);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (el) {
      el.scrollTo({ top: el.scrollHeight, behavior });
    }
    setUnreadBelowCount(0);
    setIsNearBottom(true);
  }, []);

  useEffect(() => {
    const newCount = messages.length;
    const prevCount = prevCountRef.current;
    prevCountRef.current = newCount;

    if (newCount === 0) return;

    const latestMsg = messages[newCount - 1];
    const isLatestOwn =
      String(latestMsg?.sender_email || '').toLowerCase() ===
      String(currentUserEmail || '').toLowerCase();

    if (prevCount === 0 || isNearBottom || isLatestOwn) {
      requestAnimationFrame(() => {
        scrollToBottom(prevCount === 0 ? 'auto' : 'smooth');
      });
    } else if (newCount > prevCount) {
      setUnreadBelowCount((c) => c + (newCount - prevCount));
    }
  }, [messages, currentUserEmail, isNearBottom, scrollToBottom]);

  const filteredMessages = searchQuery.trim()
    ? messages.filter(
        (m) =>
          m.content?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.sender_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : messages;

  if (isLoading) {
    return (
      <div
        data-testid="chat-loading-skeleton"
        className="flex flex-1 flex-col gap-4 overflow-y-auto bg-[#F3EFEA] p-4"
      >
        {[1, 2, 3, 4].map((idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2.5 ${idx % 2 === 0 ? 'flex-row-reverse' : ''}`}
          >
            <div className="h-9 w-9 animate-pulse rounded-full bg-stone-300" />
            <div className="w-60 space-y-2 rounded-2xl bg-white/80 p-3.5 shadow-sm">
              <div className="h-3 w-24 animate-pulse rounded bg-stone-200" />
              <div className="h-4 w-full animate-pulse rounded bg-stone-200" />
              <div className="h-3 w-2/3 animate-pulse rounded bg-stone-200" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Empty state — fixes BUG CHAT-02: NO fake teacher message
  if (filteredMessages.length === 0) {
    return (
      <div
        data-testid="chat-empty-state"
        className="flex flex-1 flex-col items-center justify-center bg-[#F3EFEA] p-6 text-center"
      >
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-red-800/10 text-red-800 shadow-inner">
          <MessageSquarePlus className="h-8 w-8" />
        </div>
        <h3 className="mt-4 font-display text-base font-bold text-stone-900">
          {searchQuery.trim()
            ? 'Không tìm thấy tin nhắn phù hợp'
            : 'Chưa có tin nhắn trong lớp. Hãy gửi lời chào đầu tiên!'}
        </h3>
        <p className="mt-1.5 max-w-md text-xs leading-relaxed text-stone-600">
          {searchQuery.trim()
            ? `Không có kết quả nào khớp với từ khóa "${searchQuery}".`
            : 'Mọi trao đổi với Lão sư chủ nhiệm, bài thu âm phát âm và thông báo lớp học sẽ được lưu trữ an toàn tại đây.'}
        </p>

        {!searchQuery.trim() && onQuickGreeting && (
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {[
              'Con chào Lão sư ạ! 👋',
              'Lão sư ơi hôm nay bài tập về nhà là gì ạ?',
              'Bố/mẹ xin phép trao đổi cùng cô giáo ạ.',
            ].map((greeting) => (
              <button
                key={greeting}
                type="button"
                onClick={() => onQuickGreeting(greeting)}
                className="rounded-full border border-red-200 bg-white px-3.5 py-1.5 text-xs font-semibold text-red-900 shadow-sm transition-colors hover:bg-red-50"
              >
                {greeting}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  let lastDateLabel = '';

  return (
    <div className="relative flex flex-1 flex-col overflow-hidden bg-[#F3EFEA]">
      <div
        ref={scrollContainerRef}
        onScroll={checkScrollPosition}
        data-testid="chat-message-scroll-area"
        className="flex-1 overflow-y-auto py-3"
      >
        {hasMoreOlder && !searchQuery.trim() && (
          <div className="mb-3 flex justify-center px-4">
            <button
              type="button"
              data-testid="load-older-messages-btn"
              onClick={onLoadOlder}
              disabled={isLoadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-stone-300 bg-white/90 px-3.5 py-1.5 text-xs font-semibold text-stone-700 shadow-sm transition-colors hover:bg-white disabled:opacity-60"
            >
              {isLoadingOlder ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-red-800" />
              ) : (
                <History className="h-3.5 w-3.5 text-red-800" />
              )}
              <span>{isLoadingOlder ? 'Đang tải tin nhắn cũ...' : 'Xem các tin nhắn trước đó'}</span>
            </button>
          </div>
        )}

        {filteredMessages.map((msg) => {
          const dateLabel = formatDateDivider(msg.created_at);
          const showDateDivider = dateLabel && dateLabel !== lastDateLabel;
          if (dateLabel) {
            lastDateLabel = dateLabel;
          }

          return (
            <React.Fragment key={msg.clientMessageId || msg.id}>
              {showDateDivider && (
                <div className="my-3 flex items-center justify-center px-4">
                  <span className="rounded-full border border-stone-300/70 bg-stone-200/75 px-3 py-0.5 text-[11px] font-semibold text-stone-600 shadow-2xs">
                    {dateLabel}
                  </span>
                </div>
              )}

              <MessageBubble
                message={msg}
                currentUserEmail={currentUserEmail}
                currentUserName={currentUserName}
                canManagePin={canManagePin}
                onReply={onReply}
                onReact={onReact}
                onPinMessage={onPinMessage}
                onRetry={onRetryMessage}
              />
            </React.Fragment>
          );
        })}

        <div ref={bottomAnchorRef} className="h-2" />
      </div>

      {!isNearBottom && (
        <button
          type="button"
          data-testid="jump-to-latest-msg-btn"
          onClick={() => scrollToBottom('smooth')}
          className="absolute bottom-4 right-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-red-800 px-3.5 py-2 text-xs font-bold text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-900"
        >
          <ArrowDown className="h-3.5 w-3.5" />
          <span>
            {unreadBelowCount > 0 ? `${unreadBelowCount} tin nhắn mới` : 'Về tin mới nhất'}
          </span>
        </button>
      )}
    </div>
  );
};
