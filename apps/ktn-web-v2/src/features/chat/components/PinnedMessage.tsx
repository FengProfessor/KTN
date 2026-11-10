import React, { useState } from 'react';
import { Pin, ChevronDown, ChevronUp, Sparkles } from 'lucide-react';
import { PinnedAnnouncement } from '../types/chat.types';
import { formatChatTimestamp } from '@/lib/utils';

interface PinnedMessageProps {
  pinnedMessage: PinnedAnnouncement | null;
  canManagePin: boolean;
  onJumpToMessage?: (messageId: string) => void;
}

export const PinnedMessage: React.FC<PinnedMessageProps> = ({
  pinnedMessage,
  onJumpToMessage,
}) => {
  const [expanded, setExpanded] = useState(false);

  if (!pinnedMessage || !pinnedMessage.content) return null;

  return (
    <div
      data-testid="pinned-announcement-banner"
      className="shrink-0 border-b border-amber-200/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/95 px-3 py-1.5 transition-all"
    >
      <div className="flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => {
            if (pinnedMessage.messageId && onJumpToMessage) {
              onJumpToMessage(pinnedMessage.messageId);
            } else {
              setExpanded((prev) => !prev);
            }
          }}
          className="flex min-w-0 flex-1 items-center gap-2 text-left"
        >
          <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-amber-500/15 text-amber-800">
            <Pin className="h-3 w-3 rotate-45 fill-amber-600 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div
              className={`flex gap-1.5 ${
                expanded ? 'flex-col items-start' : 'items-center min-w-0'
              }`}
            >
              <span className="inline-flex shrink-0 items-center gap-0.5 rounded bg-amber-600/15 px-1.5 py-0.2 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                <Sparkles className="h-2.5 w-2.5" />
                Ghim
              </span>
              {pinnedMessage.pinnedBy && (
                <span className="hidden shrink-0 text-[10.5px] font-medium text-amber-800/80 sm:inline">
                  • {pinnedMessage.pinnedBy}{' '}
                  {pinnedMessage.updatedAt ? `(${formatChatTimestamp(pinnedMessage.updatedAt)})` : ''}
                </span>
              )}
              <p
                className={`min-w-0 flex-1 text-xs font-medium text-stone-800 ${
                  expanded ? 'whitespace-pre-wrap' : 'truncate'
                }`}
              >
                {pinnedMessage.content}
              </p>
            </div>
          </div>
        </button>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded-md p-1 text-amber-800 hover:bg-amber-200/50"
            title={expanded ? 'Thu gọn thông báo' : 'Xem toàn bộ thông báo'}
            aria-label={expanded ? 'Thu gọn thông báo' : 'Xem toàn bộ thông báo'}
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </div>
  );
};
