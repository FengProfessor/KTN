import React, { useRef, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { ArrowDown, MessageSquarePlus, History, Loader2 } from 'lucide-react';
import { ChatMessage } from '../types/chat.types';
import { MessageBubble } from './MessageBubble';
import { formatDateDivider } from '@/lib/utils';

interface MessageListProps {
  roomId?: string | null;
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

interface PrependScrollAnchor {
  active: boolean;
  scrollHeight: number;
  scrollTop: number;
  anchorMsgId: string | null;
  anchorOffsetTop: number;
  settledUntil: number;
}

export const MessageList: React.FC<MessageListProps> = ({
  roomId = null,
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
  const rafIdRef = useRef<number | null>(null);
  const isNearBottomRef = useRef<boolean>(true);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadBelowCount, setUnreadBelowCount] = useState(0);

  const prevRoomIdRef = useRef<string | null>(null);
  const needsInitialRoomScrollRef = useRef<boolean>(true);
  const prevCountRef = useRef<number>(0);
  const prevFirstMsgKeyRef = useRef<string>('');
  const prevLastMsgKeyRef = useRef<string>('');
  const lastKnownScrollMetricsRef = useRef<{ scrollTop: number; scrollHeight: number }>({
    scrollTop: 0,
    scrollHeight: 0,
  });
  const prependAnchorRef = useRef<PrependScrollAnchor | null>(null);
  const prevSearchActiveRef = useRef<boolean>(false);
  const preSearchScrollRef = useRef<{ scrollTop: number; wasNearBottom: boolean } | null>(null);

  const normalizedSearchQuery = searchQuery.trim().toLowerCase();

  const cancelPendingRaf = useCallback(() => {
    if (rafIdRef.current !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => {
      cancelPendingRaf();
    };
  }, [cancelPendingRaf]);

  const checkScrollPosition = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (normalizedSearchQuery.length > 0) return;

    if (
      prependAnchorRef.current &&
      !prependAnchorRef.current.active &&
      Math.abs(el.scrollTop - prependAnchorRef.current.scrollTop) > 8
    ) {
      prependAnchorRef.current = null;
    }

    lastKnownScrollMetricsRef.current = {
      scrollTop: el.scrollTop,
      scrollHeight: el.scrollHeight,
    };
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    const near = distanceFromBottom < 120;
    isNearBottomRef.current = near;
    setIsNearBottom((prev) => (prev === near ? prev : near));
    if (near) {
      setUnreadBelowCount((prev) => (prev === 0 ? prev : 0));
    }
  }, [normalizedSearchQuery]);

  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = 'smooth') => {
      cancelPendingRaf();
      const el = scrollContainerRef.current;
      if (el) {
        if (behavior === 'auto') {
          el.scrollTop = el.scrollHeight;
        } else if (typeof el.scrollTo === 'function') {
          el.scrollTo({ top: el.scrollHeight, behavior });
        } else {
          el.scrollTop = el.scrollHeight;
        }
        lastKnownScrollMetricsRef.current = {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
        };
      }
      isNearBottomRef.current = true;
      setIsNearBottom(true);
      setUnreadBelowCount(0);
    },
    [cancelPendingRaf]
  );

  const handleLoadOlderClick = useCallback(() => {
    const el = scrollContainerRef.current;
    if (el) {
      const containerRect = el.getBoundingClientRect();
      const msgNodes = Array.from(
        el.querySelectorAll<HTMLElement>('[data-testid="chat-message-item"]')
      );
      const firstVisible =
        msgNodes.find((node) => node.getBoundingClientRect().bottom > containerRect.top + 4) ||
        msgNodes[0];
      const anchorMsgId = firstVisible?.getAttribute('data-message-id') || null;
      const anchorOffsetTop = firstVisible
        ? firstVisible.getBoundingClientRect().top - containerRect.top
        : 0;
      prependAnchorRef.current = {
        active: true,
        scrollHeight: el.scrollHeight,
        scrollTop: el.scrollTop,
        anchorMsgId,
        anchorOffsetTop,
        settledUntil: Date.now() + 10000,
      };
    }
    onLoadOlder();
  }, [onLoadOlder]);

  const handleContentLoadCapture = useCallback(() => {
    const el = scrollContainerRef.current;
    const anchor = prependAnchorRef.current;
    if (!el) return;
    if (anchor && Date.now() <= anchor.settledUntil && anchor.anchorMsgId) {
      const anchorEl = document.getElementById(`chat-msg-${anchor.anchorMsgId}`);
      if (anchorEl) {
        const currentOffset =
          anchorEl.getBoundingClientRect().top - el.getBoundingClientRect().top;
        const delta = currentOffset - anchor.anchorOffsetTop;
        if (Math.abs(delta) > 1) {
          el.scrollTop += delta;
        }
      }
      anchor.scrollHeight = el.scrollHeight;
      anchor.scrollTop = el.scrollTop;
      lastKnownScrollMetricsRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
      };
    } else if (isNearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      lastKnownScrollMetricsRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
      };
    }
  }, []);

  useLayoutEffect(() => {
    const normalizedRoomKey = String(roomId || '__default__');
    if (prevRoomIdRef.current !== normalizedRoomKey) {
      cancelPendingRaf();
      prevRoomIdRef.current = normalizedRoomKey;
      needsInitialRoomScrollRef.current = true;
      prevCountRef.current = 0;
      prevFirstMsgKeyRef.current = '';
      prevLastMsgKeyRef.current = '';
      prependAnchorRef.current = null;
      prevSearchActiveRef.current = false;
      preSearchScrollRef.current = null;
      isNearBottomRef.current = true;
      setIsNearBottom(true);
      setUnreadBelowCount(0);
    }

    if (isLoading) return;

    const el = scrollContainerRef.current;

    if (normalizedSearchQuery.length > 0) {
      if (!prevSearchActiveRef.current) {
        preSearchScrollRef.current = {
          scrollTop: lastKnownScrollMetricsRef.current.scrollTop,
          wasNearBottom: isNearBottomRef.current,
        };
        prevSearchActiveRef.current = true;
      }
    } else if (prevSearchActiveRef.current) {
      prevSearchActiveRef.current = false;
      const saved = preSearchScrollRef.current;
      preSearchScrollRef.current = null;
      if (saved?.wasNearBottom) {
        scrollToBottom('auto');
      } else if (el && saved) {
        el.scrollTop = saved.scrollTop;
        lastKnownScrollMetricsRef.current = {
          scrollTop: el.scrollTop,
          scrollHeight: el.scrollHeight,
        };
        const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
        const near = distanceFromBottom < 120;
        isNearBottomRef.current = near;
        setIsNearBottom(near);
      }
    }

    const newCount = messages.length;
    const prevCount = prevCountRef.current;
    const firstMsg = newCount > 0 ? messages[0] : null;
    const latestMsg = newCount > 0 ? messages[newCount - 1] : null;
    const firstMsgKey = firstMsg ? String(firstMsg.clientMessageId || firstMsg.id || '') : '';
    const lastMsgKey = latestMsg ? String(latestMsg.clientMessageId || latestMsg.id || '') : '';
    const prevFirstKey = prevFirstMsgKeyRef.current;
    const prevLastKey = prevLastMsgKeyRef.current;

    prevCountRef.current = newCount;
    prevFirstMsgKeyRef.current = firstMsgKey;
    prevLastMsgKeyRef.current = lastMsgKey;

    if (newCount === 0) return;

    // 1. Initial room load: jump immediately to bottom
    if (needsInitialRoomScrollRef.current || prevCount === 0) {
      needsInitialRoomScrollRef.current = false;
      scrollToBottom('auto');
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        const node = scrollContainerRef.current;
        if (node) {
          node.scrollTop = node.scrollHeight;
          lastKnownScrollMetricsRef.current = {
            scrollTop: node.scrollTop,
            scrollHeight: node.scrollHeight,
          };
        }
      });
      return;
    }

    // 2. Older messages prepended at top: preserve exact reading position
    const isOlderPrepend =
      Boolean(prependAnchorRef.current?.active && newCount > prevCount) ||
      (newCount > prevCount && firstMsgKey !== prevFirstKey && lastMsgKey === prevLastKey);

    if (isOlderPrepend && el) {
      const anchor = prependAnchorRef.current;
      const prevHeight = anchor
        ? anchor.scrollHeight
        : lastKnownScrollMetricsRef.current.scrollHeight;
      const prevTop = anchor ? anchor.scrollTop : lastKnownScrollMetricsRef.current.scrollTop;
      const heightDiff = el.scrollHeight - prevHeight;
      if (heightDiff > 0) {
        el.scrollTop = prevTop + heightDiff;
      }
      if (anchor?.anchorMsgId) {
        const anchorEl = document.getElementById(`chat-msg-${anchor.anchorMsgId}`);
        if (anchorEl) {
          const currentOffset =
            anchorEl.getBoundingClientRect().top - el.getBoundingClientRect().top;
          const delta = currentOffset - anchor.anchorOffsetTop;
          if (Math.abs(delta) > 1) {
            el.scrollTop += delta;
          }
        }
      }
      if (anchor) {
        anchor.active = false;
        anchor.scrollHeight = el.scrollHeight;
        anchor.scrollTop = el.scrollTop;
        anchor.settledUntil = Date.now() + 10000;
      }
      lastKnownScrollMetricsRef.current = {
        scrollTop: el.scrollTop,
        scrollHeight: el.scrollHeight,
      };
      return;
    }

    // 3. Polling refetch, reaction, read status, or optimistic ack without new bottom message
    if (lastMsgKey === prevLastKey) {
      return;
    }

    // 4. Genuine new message appended at bottom
    const isLatestFromCurrentUser =
      Boolean(currentUserEmail) &&
      String(latestMsg?.sender_email || '').trim().toLowerCase() ===
        String(currentUserEmail || '').trim().toLowerCase();

    if (isLatestFromCurrentUser || isNearBottomRef.current) {
      cancelPendingRaf();
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        scrollToBottom('smooth');
      });
    } else {
      const prevIdx = messages.findIndex(
        (m) => String(m.clientMessageId || m.id || '') === prevLastKey
      );
      const addedCount =
        prevIdx >= 0 ? Math.max(1, newCount - 1 - prevIdx) : Math.max(1, newCount - prevCount);
      setUnreadBelowCount((c) => c + addedCount);
    }
  }, [
    roomId,
    isLoading,
    messages,
    currentUserEmail,
    normalizedSearchQuery,
    scrollToBottom,
    cancelPendingRaf,
  ]);

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
        className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain bg-[#F3EFEA] p-4"
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
        className="flex min-h-0 flex-1 flex-col items-center justify-center bg-[#F3EFEA] p-6 text-center"
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
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-[#F3EFEA]">
      <div
        ref={scrollContainerRef}
        onScroll={checkScrollPosition}
        onLoadCapture={handleContentLoadCapture}
        data-testid="chat-message-scroll-area"
        className="flex-1 min-h-0 overflow-y-auto overscroll-contain py-3"
      >
        {hasMoreOlder && !searchQuery.trim() && (
          <div className="mb-3 flex justify-center px-4">
            <button
              type="button"
              data-testid="load-older-messages-btn"
              onClick={handleLoadOlderClick}
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
