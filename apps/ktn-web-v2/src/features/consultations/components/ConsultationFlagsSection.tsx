import React, { useState } from 'react';
import { AlertTriangle, Check, X as XIcon, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { ConsultationFlag } from '@/types/ktn.types';
import { formatVnDateTime } from '../utils/consultationHelpers';

interface ConsultationFlagsSectionProps {
  flags: ConsultationFlag[];
  hasSelectedThread?: boolean;
  onGoToInbox?: () => void;
  onReviewFlag: (
    consultationId: string,
    messageId: string,
    status: 'confirmed' | 'dismissed',
    note: string
  ) => Promise<void>;
  onOpenThread: (consultationId: string) => void;
}

export const ConsultationFlagsSection: React.FC<ConsultationFlagsSectionProps> = ({
  flags,
  hasSelectedThread = false,
  onGoToInbox,
  onReviewFlag,
  onOpenThread,
}) => {
  const { lang, tr } = useI18n();
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  if (flags.length === 0) {
    if (!hasSelectedThread) {
      return (
        <div
          data-testid="crm-flags-select-thread-guidance"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-bold">
                {tr(
                  'Chưa chọn hội thoại để kiểm tra cảnh báo AI',
                  'No conversation selected for AI flag review'
                )}
              </p>
              <p className="mt-0.5 text-amber-900">
                {tr(
                  'Vui lòng chọn một ca tư vấn trong Hộp thư tư vấn để xem và xác nhận/bỏ qua cảnh báo chất lượng AI của ca đó.',
                  'Please select a thread in the Inbox tab to inspect and confirm/dismiss its AI quality flags.'
                )}
              </p>
            </div>
          </div>
          {onGoToInbox && (
            <button
              type="button"
              data-testid="crm-flags-go-inbox-btn"
              onClick={onGoToInbox}
              className="rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
            >
              {tr('Mở Hộp thư tư vấn', 'Go to Inbox')}
            </button>
          )}
        </div>
      );
    }

    return (
      <div className="rounded-2xl border border-stone-200 bg-white p-4 text-xs text-stone-500">
        {tr('Hội thoại đang chọn chưa có cảnh báo AI nào cần rà soát.', 'No AI quality flags to review for the selected thread.')}
      </div>
    );
  }

  return (
    <div data-testid="crm-flags-section" className="space-y-2.5">
      {flags.map((flag) => {
        const noteVal = notes[flag.message_id] || '';
        return (
          <div
            key={flag.message_id}
            data-testid={`crm-flag-card-${flag.message_id}`}
            className="rounded-2xl border border-amber-200 bg-white p-3.5 text-xs shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4 text-amber-600" />
                <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold uppercase text-amber-950">
                  {flag.category}
                </span>
                <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                  {flag.status}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-stone-500">
                  {formatVnDateTime(flag.created_at, lang)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenThread(flag.consultation_id)}
                  className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 hover:underline"
                >
                  <span>{tr('Mở ca', 'Open thread')}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            </div>

            <p className="mt-1.5 font-semibold text-stone-800">{flag.reason}</p>
            <blockquote className="mt-1 rounded-lg border border-stone-200 bg-stone-50 p-2 text-[11px] text-stone-700">
              {flag.excerpt}
            </blockquote>

            {flag.status === 'pending' && (
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <input
                  type="text"
                  value={noteVal}
                  onChange={(e) =>
                    setNotes((prev) => ({ ...prev, [flag.message_id]: e.target.value }))
                  }
                  placeholder={tr('Ghi chú duyệt (tùy chọn)...', 'Review note (optional)...')}
                  className="min-w-[180px] flex-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs"
                />
                <button
                  type="button"
                  data-testid={`crm-flag-confirm-${flag.message_id}`}
                  disabled={submittingId === flag.message_id}
                  onClick={async () => {
                    setSubmittingId(flag.message_id);
                    try {
                      await onReviewFlag(
                        flag.consultation_id,
                        flag.message_id,
                        'confirmed',
                        noteVal
                      );
                    } catch {
                      // parent handleReviewFlag already surfaces error toast
                    } finally {
                      setSubmittingId(null);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-900"
                >
                  <Check className="h-3 w-3" />
                  <span>{tr('Xác nhận lỗi', 'Confirm Flag')}</span>
                </button>
                <button
                  type="button"
                  data-testid={`crm-flag-dismiss-${flag.message_id}`}
                  disabled={submittingId === flag.message_id}
                  onClick={async () => {
                    setSubmittingId(flag.message_id);
                    try {
                      await onReviewFlag(
                        flag.consultation_id,
                        flag.message_id,
                        'dismissed',
                        noteVal
                      );
                    } catch {
                      // parent handleReviewFlag already surfaces error toast
                    } finally {
                      setSubmittingId(null);
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                >
                  <XIcon className="h-3 w-3" />
                  <span>{tr('Bỏ qua', 'Dismiss')}</span>
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};
