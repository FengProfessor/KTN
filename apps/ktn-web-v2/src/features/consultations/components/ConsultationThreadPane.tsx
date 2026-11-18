import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Send,
  Lock,
  QrCode,
  Link2,
  UserPlus,
  Clock,
  CheckCircle,
  RotateCcw,
  ExternalLink,
  RefreshCw,
  Loader2,
  AlertTriangle,
  Check,
  X as XIcon,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { formatVnd } from '@/lib/utils';
import type {
  ConsultationAdvisor,
  ConsultationEvent,
  ConsultationFlag,
  ConsultationMessage,
  ConsultationOutcome,
  ConsultationThread,
  ConsultationThreadOrderLink,
} from '@/types/ktn.types';
import {
  detectAdultWorking11Context,
  extractVietQrUrlFromBody,
  formatVnDateTime,
  fromVnDatetimeLocalValue,
  getChannelBadgeMeta,
  toVnDatetimeLocalValue,
} from '../utils/consultationHelpers';
import { AdultScriptHelperCard } from './AdultScriptHelperCard';

interface ConsultationThreadPaneProps {
  thread: ConsultationThread | null;
  messages: ConsultationMessage[];
  events: ConsultationEvent[];
  flags: ConsultationFlag[];
  orders: ConsultationThreadOrderLink[];
  hasEarlier: boolean;
  isLoading: boolean;
  threadError?: string | null;
  onRetryThread?: () => void;
  isManager: boolean;
  advisors: ConsultationAdvisor[];
  draftText: string;
  composerMode: 'reply' | 'note';
  onDraftChange: (val: string) => void;
  onComposerModeChange: (mode: 'reply' | 'note') => void;
  onComposerFocusChange: (focused: boolean) => void;
  onLoadEarlier: () => void;
  onSendMessage: () => Promise<void>;
  onAssign: (ownerEmail: string) => Promise<void>;
  onFollowUp: (iso: string) => Promise<void>;
  onCloseThread: (outcome: ConsultationOutcome) => Promise<void>;
  onReopenThread: () => Promise<void>;
  onCreateCheckoutLink: () => Promise<void>;
  onOpenCreateOrder: () => void;
  onOpenLinkStudent: () => void;
  onRetryPayment: (orderId: string, txId: string) => Promise<void>;
  onSaveTimeslotNote: (timeslot: string) => Promise<void>;
  onReviewFlag?: (
    consultationId: string,
    messageId: string,
    status: 'confirmed' | 'dismissed',
    note: string
  ) => Promise<void>;
  isMutating?: boolean;
}

export const ConsultationThreadPane: React.FC<ConsultationThreadPaneProps> = ({
  thread,
  messages,
  events,
  flags,
  orders,
  hasEarlier,
  isLoading,
  threadError = null,
  onRetryThread,
  isManager,
  advisors,
  draftText,
  composerMode,
  onDraftChange,
  onComposerModeChange,
  onComposerFocusChange,
  onLoadEarlier,
  onSendMessage,
  onAssign,
  onFollowUp,
  onCloseThread,
  onReopenThread,
  onCreateCheckoutLink,
  onOpenCreateOrder,
  onOpenLinkStudent,
  onRetryPayment,
  onSaveTimeslotNote,
  onReviewFlag,
  isMutating = false,
}) => {
  const { lang, tr } = useI18n();
  const navigate = useNavigate();
  const [assignEmail, setAssignEmail] = useState(thread?.owner_email || '');
  const [followUpInput, setFollowUpInput] = useState(
    toVnDatetimeLocalValue(thread?.follow_up_at)
  );
  const [closeOutcome, setCloseOutcome] = useState<ConsultationOutcome>('registered');
  const [showEvents, setShowEvents] = useState(false);
  const [flagNotes, setFlagNotes] = useState<Record<string, string>>({});
  const [reviewingFlagId, setReviewingFlagId] = useState<string | null>(null);

  useEffect(() => {
    setAssignEmail(thread?.owner_email || '');
    setFollowUpInput(toVnDatetimeLocalValue(thread?.follow_up_at));
    setCloseOutcome('registered');
    setShowEvents(false);
  }, [thread?.id, thread?.owner_email, thread?.follow_up_at]);

  const combinedText = useMemo(
    () =>
      [
        thread?.source_tag || '',
        thread?.lead_meta?.ad_source || '',
        thread?.lead_meta?.goal || '',
        ...messages.map((m) => m.body),
      ].join('\n'),
    [thread, messages]
  );

  const adultScriptInfo = useMemo(
    () =>
      detectAdultWorking11Context(
        combinedText,
        thread?.lead_meta || null,
        thread?.source_tag || null
      ),
    [combinedText, thread]
  );

  if (!thread) {
    if (threadError) {
      return (
        <div
          role="alert"
          data-testid="crm-thread-error-alert"
          className="flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-red-300 bg-red-50 p-6 text-center text-xs text-red-950"
        >
          <AlertTriangle className="h-6 w-6 text-red-700" />
          <div className="space-y-1">
            <p className="font-bold text-red-900">
              {tr('Không thể mở hội thoại tư vấn', 'Unable to load consultation thread')}
            </p>
            <p className="text-red-800">{threadError}</p>
          </div>
          {onRetryThread && (
            <button
              type="button"
              data-testid="crm-thread-retry-btn"
              onClick={onRetryThread}
              className="inline-flex items-center gap-1 rounded-xl border border-red-300 bg-white px-3 py-1.5 font-bold text-red-900 hover:bg-red-100"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{tr('Thử tải lại', 'Retry')}</span>
            </button>
          )}
        </div>
      );
    }
    return (
      <div className="flex h-full min-h-[360px] items-center justify-center rounded-2xl border border-stone-200 bg-white p-6 text-center text-xs text-stone-500">
        {tr(
          'Chọn một hội thoại bên trái để xem chi tiết khách hàng, tin nhắn Zalo OA / Web và tạo đơn.',
          'Select a conversation on the left to inspect Zalo OA / Web customer details and create orders.'
        )}
      </div>
    );
  }

  const channelMeta = getChannelBadgeMeta(thread.channel);

  const getSenderMeta = (msg: ConsultationMessage) => {
    if (msg.sender === 'note') {
      return {
        label: tr('Ghi chú nội bộ — Khách không thấy', 'Internal Note — Hidden from Customer'),
        cardClass: 'border-amber-300 bg-amber-50/90 text-amber-950',
        badgeClass: 'bg-amber-200 text-amber-950',
      };
    }
    if (msg.sender === 'customer') {
      return {
        label: thread.customer_name || tr('Khách hàng', 'Customer'),
        cardClass: 'border-stone-200 bg-stone-50 text-stone-900',
        badgeClass: 'bg-stone-200 text-stone-800',
      };
    }
    if (msg.sender === 'external') {
      return {
        label: thread.channel === 'zalo_oa' ? 'Zalo OA (External)' : 'Fanpage (External)',
        cardClass: 'border-sky-200 bg-sky-50/70 text-sky-950',
        badgeClass: 'bg-sky-200 text-sky-950',
      };
    }
    if (msg.sender === 'bot') {
      const modeTag =
        msg.bot_mode === 'scripted' || msg.ai_mode === 'scripted'
          ? '[Kịch bản]'
          : msg.ai_mode === 'simulated'
          ? '[AI · Giả lập]'
          : '[AI]';
      return {
        label: `Bot ${modeTag}`,
        cardClass: 'border-indigo-200 bg-indigo-50/60 text-indigo-950',
        badgeClass: 'bg-indigo-200 text-indigo-950',
      };
    }
    if (msg.sender === 'system') {
      return {
        label: tr('Hệ thống', 'System'),
        cardClass: 'border-emerald-200 bg-emerald-50/60 text-emerald-950',
        badgeClass: 'bg-emerald-200 text-emerald-950',
      };
    }
    return {
      label: msg.actor_email || (msg.sender === 'manager' ? 'Manager' : 'Advisor'),
      cardClass: 'border-red-200 bg-red-50/50 text-stone-900',
      badgeClass: 'bg-red-100 text-red-900',
    };
  };

  return (
    <div
      data-testid="crm-thread-pane"
      className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white shadow-2xs"
    >
      {/* Header: Zalo OA / Lead Profile + Actions */}
      <div className="space-y-2.5 border-b border-stone-200 p-3.5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`rounded border px-2 py-0.5 text-[10px] font-bold ${channelMeta.badgeClass}`}>
                {channelMeta.label}
              </span>
              <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                {thread.status}
              </span>
              {thread.source_tag && (
                <span
                  data-testid="crm-thread-source-tag"
                  className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                >
                  {thread.source_tag}
                </span>
              )}
              {thread.student_code && (
                <button
                  type="button"
                  data-testid="crm-thread-student-chip"
                  onClick={() =>
                    navigate(`/admin/students?q=${encodeURIComponent(thread.student_code || '')}`)
                  }
                  className="inline-flex items-center gap-1 rounded border border-emerald-200 bg-emerald-50 px-2 py-0.5 font-mono text-[10px] font-bold text-emerald-900 hover:bg-emerald-100"
                >
                  <span>HV: {thread.student_code}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              )}
            </div>

            <h3 className="mt-1 font-display text-sm font-extrabold text-stone-900">
              {thread.customer_name || tr('Khách tư vấn', 'Consultation Lead')}
            </h3>
            <p className="text-[11px] text-stone-600">
              SĐT:{' '}
              <strong className="font-mono text-red-900">
                {thread.customer_phone || tr('Chưa có', 'None')}
              </strong>
              {thread.zalo_user_id && (
                <>
                  {' '}
                  · Zalo ID: <span className="font-mono">{thread.zalo_user_id}</span>
                </>
              )}
              {' '}
              · {tr('Phụ trách:', 'Owner:')}{' '}
              <strong>{thread.owner_email || tr('Chưa nhận', 'Unassigned')}</strong>
            </p>

            {thread.lead_meta && Object.keys(thread.lead_meta).length > 0 && (
              <div className="mt-1.5 flex flex-wrap gap-1 text-[10px]">
                {thread.lead_meta.target_learner && (
                  <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
                    {tr('Đối tượng:', 'Target:')} {String(thread.lead_meta.target_learner)}
                  </span>
                )}
                {thread.lead_meta.goal && (
                  <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
                    {tr('Mục tiêu:', 'Goal:')} {String(thread.lead_meta.goal)}
                  </span>
                )}
                {thread.lead_meta.background && (
                  <span className="rounded bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
                    {tr('Nền tảng:', 'Background:')} {String(thread.lead_meta.background)}
                  </span>
                )}
                {thread.lead_meta.timeslot && (
                  <span className="rounded bg-indigo-100 px-2 py-0.5 font-semibold text-indigo-900">
                    {tr('Khung giờ:', 'Timeslot:')} {String(thread.lead_meta.timeslot)}
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              data-testid="crm-open-create-order-btn"
              onClick={onOpenCreateOrder}
              className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-red-900"
            >
              <QrCode className="h-3.5 w-3.5" />
              <span>{tr('Tạo đơn & VietQR', 'Create Order & QR')}</span>
            </button>
            <button
              type="button"
              data-testid="crm-open-link-student-btn"
              onClick={onOpenLinkStudent}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-[11px] font-bold text-stone-800 hover:bg-stone-100"
            >
              <Link2 className="h-3.5 w-3.5 text-red-800" />
              <span>{tr('Liên kết học viên', 'Link Student')}</span>
            </button>
            <button
              type="button"
              data-testid="crm-checkout-link-btn"
              onClick={() => void onCreateCheckoutLink()}
              disabled={isMutating}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
            >
              <span>{tr('Link thanh toán', 'Checkout link')}</span>
            </button>
          </div>
        </div>

        {/* Staff Controls row: Manager assign, Follow-up, Close/Reopen */}
        <div className="flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2 text-[11px]">
          {isManager && (
            <div className="flex items-center gap-1">
              <select
                data-testid="crm-assign-select"
                value={assignEmail}
                onChange={(e) => setAssignEmail(e.target.value)}
                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px]"
              >
                <option value="">{tr('-- Chọn tư vấn viên --', '-- Select advisor --')}</option>
                {advisors
                  .filter((a) => a.active !== false)
                  .map((a) => (
                    <option key={a.email} value={a.email}>
                      {a.name} ({a.email})
                    </option>
                  ))}
              </select>
              <button
                type="button"
                data-testid="crm-assign-btn"
                disabled={!assignEmail || isMutating}
                onClick={() => void onAssign(assignEmail)}
                className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 font-bold text-stone-800 hover:bg-stone-100 disabled:opacity-40"
              >
                <UserPlus className="h-3 w-3" />
                <span>{tr('Phân công', 'Assign')}</span>
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Clock className="h-3 w-3 text-stone-500" />
            <input
              type="datetime-local"
              value={followUpInput}
              onChange={(e) => setFollowUpInput(e.target.value)}
              className="rounded-lg border border-stone-200 px-2 py-1 text-[11px]"
            />
            <button
              type="button"
              data-testid="crm-followup-btn"
              disabled={!followUpInput || isMutating}
              onClick={() => {
                const iso = fromVnDatetimeLocalValue(followUpInput);
                if (iso) void onFollowUp(iso);
              }}
              className="rounded-lg border border-stone-200 bg-white px-2 py-1 font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-40"
            >
              {tr('Hẹn lịch', 'Follow-up')}
            </button>
          </div>

          <div className="ml-auto flex items-center gap-1">
            {thread.status === 'closed' ? (
              <button
                type="button"
                data-testid="crm-reopen-btn"
                disabled={isMutating}
                onClick={() => void onReopenThread()}
                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 font-bold text-emerald-900 hover:bg-emerald-100"
              >
                <RotateCcw className="h-3 w-3" />
                <span>{tr('Mở lại', 'Reopen')}</span>
              </button>
            ) : (
              <>
                <select
                  data-testid="crm-close-outcome-select"
                  value={closeOutcome}
                  onChange={(e) => setCloseOutcome(e.target.value as ConsultationOutcome)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px]"
                >
                  <option value="registered">{tr('Đã đăng ký', 'Registered')}</option>
                  <option value="declined">{tr('Từ chối', 'Declined')}</option>
                  <option value="no_response">{tr('Không phản hồi', 'No response')}</option>
                  <option value="other">{tr('Khác', 'Other')}</option>
                </select>
                <button
                  type="button"
                  data-testid="crm-close-btn"
                  disabled={isMutating}
                  onClick={() => void onCloseThread(closeOutcome)}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-800 px-2.5 py-1 font-bold text-white hover:bg-stone-900"
                >
                  <CheckCircle className="h-3 w-3" />
                  <span>{tr('Đóng ca', 'Close')}</span>
                </button>
              </>
            )}
          </div>
        </div>

        {/* Adult 1:1 4-Step Script Helper */}
        <AdultScriptHelperCard
          key={thread.id}
          info={adultScriptInfo}
          initialTimeslot={String(thread.lead_meta?.timeslot || '')}
          onInsertPrompt={(text) => {
            onComposerModeChange('reply');
            onDraftChange(draftText ? `${draftText}\n${text}` : text);
          }}
          onSaveTimeslotNote={onSaveTimeslotNote}
          isSavingNote={isMutating}
        />
      </div>

      {/* Messages & Linked Orders */}
      <div className="flex-1 space-y-2.5 overflow-y-auto p-3.5">
        {threadError && (
          <div
            role="alert"
            data-testid="crm-thread-error-alert"
            className="flex items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-950"
          >
            <span>{threadError}</span>
            {onRetryThread && (
              <button
                type="button"
                data-testid="crm-thread-retry-btn"
                onClick={onRetryThread}
                className="rounded-lg border border-red-300 bg-white px-2 py-0.5 text-[11px] font-bold text-red-900 hover:bg-red-100"
              >
                {tr('Thử lại', 'Retry')}
              </button>
            )}
          </div>
        )}
        {hasEarlier && (
          <div className="text-center">
            <button
              type="button"
              onClick={onLoadEarlier}
              className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
            >
              {tr('Tải tin nhắn cũ hơn', 'Load earlier messages')}
            </button>
          </div>
        )}

        {isLoading && messages.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-xs text-stone-500">
            <Loader2 className="mr-2 h-4 w-4 animate-spin text-red-800" />
            {tr('Đang tải hội thoại...', 'Loading thread...')}
          </div>
        ) : (
          messages.map((msg) => {
            const meta = getSenderMeta(msg);
            const qrUrl = extractVietQrUrlFromBody(msg.body);
            return (
              <div
                key={msg.id}
                data-testid={`crm-msg-${msg.id}`}
                data-sender={msg.sender}
                className={`rounded-xl border p-2.5 text-xs ${meta.cardClass}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    {msg.sender === 'note' && <Lock className="h-3 w-3 text-amber-800" />}
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${meta.badgeClass}`}>
                      {meta.label}
                    </span>
                    {msg.delivery && msg.delivery !== 'sent' && (
                      <span className="rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                        {msg.delivery}
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-stone-500">
                    {formatVnDateTime(msg.created_at, lang)}
                  </span>
                </div>
                <p className="mt-1.5 whitespace-pre-wrap leading-relaxed">{msg.body}</p>
                {qrUrl && (
                  <div className="mt-2 inline-block rounded-xl border border-stone-200 bg-white p-1.5">
                    <img
                      src={qrUrl}
                      alt="VietQR"
                      className="h-28 w-28 rounded-lg object-contain"
                    />
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Linked Orders inside Thread */}
        {orders.length > 0 && (
          <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs">
            <p className="font-bold text-stone-800">
              {tr('Đơn hàng gắn với hội thoại', 'Linked Orders')} ({orders.length})
            </p>
            <div className="mt-1.5 space-y-1.5">
              {orders.map((link) => {
                const ord = link.ktn_orders;
                const retryablePayment = ord?.ktn_consultation_payments?.find(
                  (p) => p.status === 'needs_review' || p.error
                );
                return (
                  <div
                    key={link.order_id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5"
                  >
                    <div>
                      <span className="font-mono font-bold text-red-900">{link.order_id}</span>
                      {ord && (
                        <span className="ml-2 text-stone-700">
                          {ord.course_name} · {formatVnd(ord.amount)} · {ord.payment_status}/
                          {ord.approval_status}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5">
                      {retryablePayment && isManager && (
                        <button
                          type="button"
                          onClick={() =>
                            void onRetryPayment(link.order_id, retryablePayment.transaction_id)
                          }
                          className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-950 hover:bg-amber-200"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>{tr('Thử cấp lại', 'Retry provisioning')}</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          navigate(`/admin/orders?orderId=${encodeURIComponent(link.order_id)}`)
                        }
                        className="rounded border border-stone-200 px-2 py-0.5 text-[10px] font-bold text-red-800 hover:bg-red-50"
                      >
                        {tr('Mở đơn', 'Open order')}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Flags inside thread */}
        {flags.length > 0 && (
          <div
            data-testid="crm-thread-flags-box"
            className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs"
          >
            <p className="font-bold text-amber-950">
              {tr('Cảnh báo chất lượng AI', 'AI Quality Flags')} ({flags.length})
            </p>
            {flags.map((f) => {
              const noteVal = flagNotes[f.message_id] || '';
              return (
                <div
                  key={f.message_id}
                  data-testid={`crm-thread-flag-item-${f.message_id}`}
                  className="rounded-lg border border-amber-200 bg-white p-2 text-[11px] text-amber-950"
                >
                  <p>
                    <span className="font-bold uppercase">[{f.category}]</span> {f.reason} —{' '}
                    <strong>{f.status}</strong>
                  </p>
                  {f.excerpt && (
                    <p className="mt-1 rounded bg-stone-50 px-2 py-1 text-stone-700">
                      {f.excerpt}
                    </p>
                  )}
                  {isManager && f.status === 'pending' && onReviewFlag && (
                    <div className="mt-2 flex flex-wrap items-center gap-1.5">
                      <input
                        type="text"
                        data-testid={`crm-thread-flag-note-${f.message_id}`}
                        value={noteVal}
                        onChange={(e) =>
                          setFlagNotes((prev) => ({
                            ...prev,
                            [f.message_id]: e.target.value,
                          }))
                        }
                        placeholder={tr('Ghi chú duyệt (tùy chọn)...', 'Review note (optional)...')}
                        className="min-w-[160px] flex-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px]"
                      />
                      <button
                        type="button"
                        data-testid={`crm-thread-flag-confirm-${f.message_id}`}
                        disabled={reviewingFlagId === f.message_id}
                        onClick={async () => {
                          setReviewingFlagId(f.message_id);
                          try {
                            await onReviewFlag(
                              f.consultation_id || thread.id,
                              f.message_id,
                              'confirmed',
                              noteVal
                            );
                          } catch {
                            // parent handleReviewFlag already surfaces error toast
                          } finally {
                            setReviewingFlagId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold text-white hover:bg-red-900 disabled:opacity-50"
                      >
                        <Check className="h-3 w-3" />
                        <span>{tr('Xác nhận lỗi', 'Confirm')}</span>
                      </button>
                      <button
                        type="button"
                        data-testid={`crm-thread-flag-dismiss-${f.message_id}`}
                        disabled={reviewingFlagId === f.message_id}
                        onClick={async () => {
                          setReviewingFlagId(f.message_id);
                          try {
                            await onReviewFlag(
                              f.consultation_id || thread.id,
                              f.message_id,
                              'dismissed',
                              noteVal
                            );
                          } catch {
                            // parent handleReviewFlag already surfaces error toast
                          } finally {
                            setReviewingFlagId(null);
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-100 disabled:opacity-50"
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
        )}

        {/* Collapsible Events */}
        {events.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowEvents((p) => !p)}
              className="text-[11px] font-bold text-stone-500 hover:text-stone-800"
            >
              {showEvents
                ? tr('Ẩn lịch sử thao tác', 'Hide audit events')
                : tr(`Xem lịch sử thao tác (${events.length})`, `Show audit events (${events.length})`)}
            </button>
            {showEvents && (
              <div className="mt-1.5 space-y-1 rounded-xl border border-stone-200 bg-stone-50 p-2 text-[11px] text-stone-600">
                {events.map((ev) => (
                  <div key={String(ev.id)} className="flex justify-between gap-2">
                    <span>
                      <strong>{ev.kind}</strong> · {ev.actor_email || 'system'}
                    </span>
                    <span>{formatVnDateTime(ev.created_at, lang)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Composer */}
      <div className="border-t border-stone-200 p-3">
        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            data-testid="crm-mode-reply-btn"
            onClick={() => onComposerModeChange('reply')}
            className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              composerMode === 'reply'
                ? 'bg-red-800 text-white'
                : 'border border-stone-200 bg-stone-50 text-stone-700'
            }`}
          >
            {tr('Trả lời khách (Public)', 'Reply to Customer')}
          </button>
          <button
            type="button"
            data-testid="crm-mode-note-btn"
            onClick={() => onComposerModeChange('note')}
            className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold ${
              composerMode === 'note'
                ? 'bg-amber-600 text-white'
                : 'border border-stone-200 bg-stone-50 text-stone-700'
            }`}
          >
            <Lock className="h-3 w-3" />
            <span>{tr('Ghi chú nội bộ', 'Internal Note')}</span>
          </button>
        </div>

        <div className="flex gap-2">
          <textarea
            data-testid="crm-composer-textarea"
            rows={2}
            maxLength={1900}
            value={draftText}
            onChange={(e) => onDraftChange(e.target.value)}
            onFocus={() => onComposerFocusChange(true)}
            onBlur={() => onComposerFocusChange(false)}
            placeholder={
              composerMode === 'note'
                ? tr('Ghi chú nội bộ (khách hàng sẽ KHÔNG nhìn thấy)...', 'Internal note (customer will NOT see)...')
                : tr('Nhập tin nhắn trả lời khách qua Zalo OA / Web...', 'Reply to customer via Zalo OA / Web...')
            }
            className={`flex-1 rounded-xl border px-3 py-2 text-xs focus:outline-none ${
              composerMode === 'note'
                ? 'border-amber-300 bg-amber-50/50 focus:border-amber-600'
                : 'border-stone-300 bg-white focus:border-red-800'
            }`}
          />
          <button
            type="button"
            data-testid="crm-send-btn"
            disabled={!draftText.trim() || isMutating}
            onClick={() => void onSendMessage()}
            className={`inline-flex shrink-0 items-center gap-1.5 self-end rounded-xl px-4 py-2.5 text-xs font-bold text-white disabled:opacity-40 ${
              composerMode === 'note'
                ? 'bg-amber-600 hover:bg-amber-700'
                : 'bg-red-800 hover:bg-red-900'
            }`}
          >
            <Send className="h-3.5 w-3.5" />
            <span>{composerMode === 'note' ? tr('Lưu ghi chú', 'Save Note') : tr('Gửi', 'Send')}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
