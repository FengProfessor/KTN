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
      className="border-b border-amber-200/80 bg-gradient-to-r from-amber-50/95 via-orange-50/80 to-amber-50/95 px-3.5 py-2.5 transition-all"
    >
      <div className="flex items-start justify-between gap-2.5">
        <button
          type="button"
          onClick={() => {
            if (pinnedMessage.messageId && onJumpToMessage) {
              onJumpToMessage(pinnedMessage.messageId);
            } else {
              setExpanded((prev) => !prev);
            }
          }}
          className="flex min-w-0 flex-1 items-start gap-2.5 text-left"
        >
          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-800">
            <Pin className="h-3.5 w-3.5 rotate-45 fill-amber-600 text-amber-700" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded bg-amber-600/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-900">
                <Sparkles className="h-2.5 w-2.5" />
                Thông báo ghim lớp học
              </span>
              {pinnedMessage.pinnedBy && (
                <span className="text-[11px] font-medium text-amber-800/80">
                  • {pinnedMessage.pinnedBy}{' '}
                  {pinnedMessage.updatedAt ? `(${formatChatTimestamp(pinnedMessage.updatedAt)})` : ''}
                </span>
              )}
            </div>
            <p
              className={`mt-0.5 text-xs font-medium text-stone-800 ${
                expanded ? 'whitespace-pre-wrap' : 'line-clamp-1'
              }`}
            >
              {pinnedMessage.content}
            </p>
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
