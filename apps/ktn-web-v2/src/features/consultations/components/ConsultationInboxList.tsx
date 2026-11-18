import React from 'react';
import { Search, UserCheck, Clock, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { useI18n } from '@/i18n';
import type {
  ConsultationAdvisor,
  ConsultationChannel,
  ConsultationInboxItem,
} from '@/types/ktn.types';
import { formatVnDateTime, getChannelBadgeMeta } from '../utils/consultationHelpers';

interface ConsultationInboxListProps {
  items: ConsultationInboxItem[];
  hasMore: boolean;
  isLoading: boolean;
  selectedId: string | null;
  channelFilter: ConsultationChannel | '';
  statusFilter: string;
  ownerFilter: string;
  searchQuery: string;
  offset: number;
  isManager: boolean;
  currentEmail: string;
  advisors: ConsultationAdvisor[];
  onChannelChange: (channel: ConsultationChannel | '') => void;
  onStatusChange: (status: string) => void;
  onOwnerChange: (owner: string) => void;
  onSearchChange: (q: string) => void;
  onPageChange: (nextOffset: number) => void;
  onSelect: (item: ConsultationInboxItem) => void;
  onClaim: (id: string) => Promise<void>;
  claimingId?: string | null;
}

export const ConsultationInboxList: React.FC<ConsultationInboxListProps> = ({
  items,
  hasMore,
  isLoading,
  selectedId,
  channelFilter,
  statusFilter,
  ownerFilter,
  searchQuery,
  offset,
  isManager,
  currentEmail,
  advisors,
  onChannelChange,
  onStatusChange,
  onOwnerChange,
  onSearchChange,
  onPageChange,
  onSelect,
  onClaim,
  claimingId,
}) => {
  const { lang, tr } = useI18n();

  const channels: Array<{ value: ConsultationChannel | ''; label: string }> = [
    { value: '', label: tr('Tất cả', 'All') },
    { value: 'zalo_oa', label: 'Zalo OA' },
    { value: 'web', label: 'Web' },
    { value: 'messenger', label: 'Messenger' },
  ];

  const statuses: Array<{ value: string; label: string }> = [
    { value: '', label: tr('Mọi trạng thái', 'All') },
    { value: 'waiting', label: tr('Chờ nhận', 'Waiting') },
    { value: 'unanswered', label: tr('Chưa trả lời', 'Unanswered') },
    { value: 'overdue', label: tr('Quá hạn hẹn', 'Overdue') },
    { value: 'open', label: tr('Đang xử lý', 'Open') },
    { value: 'paid_pending', label: tr('Đã trả · Chờ duyệt', 'Paid pending') },
    { value: 'bot', label: 'Bot' },
    { value: 'closed', label: tr('Đã đóng', 'Closed') },
  ];

  return (
    <div className="flex h-full flex-col rounded-2xl border border-stone-200 bg-white shadow-2xs">
      <div className="space-y-2 border-b border-stone-200 p-3">
        {/* Channel filter pills */}
        <div className="flex flex-wrap gap-1">
          {channels.map((c) => (
            <button
              key={c.value || 'all'}
              type="button"
              data-testid={`crm-channel-filter-${c.value || 'all'}`}
              onClick={() => onChannelChange(c.value)}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-bold transition-colors ${
                channelFilter === c.value
                  ? 'border-red-800 bg-red-800 text-white'
                  : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>

        {/* Status & Owner filters */}
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          <select
            data-testid="crm-status-filter"
            value={statusFilter}
            onChange={(e) => onStatusChange(e.target.value)}
            className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-800"
          >
            {statuses.map((s) => (
              <option key={s.value || 'all'} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          {isManager && (
            <select
              data-testid="crm-owner-filter"
              value={ownerFilter}
              onChange={(e) => onOwnerChange(e.target.value)}
              className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-800"
            >
              <option value="">{tr('Mọi nhân viên', 'All advisors')}</option>
              <option value="unassigned">{tr('Chưa phân công', 'Unassigned')}</option>
              {advisors.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
          <input
            type="text"
            data-testid="crm-inbox-search-input"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder={tr('Tìm tên khách, SĐT, zalo_user_id, nội dung...', 'Search name, phone, zalo_user_id...')}
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-3 text-xs text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex-1 divide-y divide-stone-100 overflow-y-auto">
        {isLoading && items.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-500">
            {tr('Đang tải hộp thư...', 'Loading inbox...')}
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-xs text-stone-500">
            {tr('Chưa có hội thoại nào khớp bộ lọc.', 'No conversations match filters.')}
          </div>
        ) : (
          items.map((item) => {
            const channelMeta = getChannelBadgeMeta(item.channel);
            const isSelected = selectedId === item.id;
            const isUnassigned = !item.owner_email;
            const isLockedForAdvisor =
              !isManager &&
              item.owner_email &&
              item.owner_email.toLowerCase() !== currentEmail.toLowerCase();
            const needsClaimFirst =
              !isManager &&
              isUnassigned &&
              (item.status === 'waiting' || item.status === 'bot');

            return (
              <div
                key={item.id}
                data-testid={`crm-inbox-item-${item.id}`}
                onClick={() => {
                  if (!needsClaimFirst && !isLockedForAdvisor) {
                    onSelect(item);
                  }
                }}
                className={`p-3 transition-colors ${
                  needsClaimFirst || isLockedForAdvisor ? 'cursor-default' : 'cursor-pointer'
                } ${
                  isSelected
                    ? 'border-l-4 border-l-red-800 bg-red-50/50'
                    : 'hover:bg-stone-50'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1">
                      <span
                        data-testid={`crm-inbox-channel-${item.id}`}
                        className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${channelMeta.badgeClass}`}
                      >
                        {channelMeta.label}
                      </span>
                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                        {item.status}
                      </span>
                      {item.source_tag && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          {item.source_tag}
                        </span>
                      )}
                      {item.reply_pending && (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {tr('Chờ rep', 'Pending')}
                        </span>
                      )}
                      {item.has_paid_pending && (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold text-white">
                          {tr('Đã TT', 'Paid')}
                        </span>
                      )}
                    </div>

                    <p className="mt-1 truncate text-xs font-bold text-stone-900">
                      {item.customer_name || item.zalo_user_id || `#${item.id.slice(0, 8)}`}
                    </p>
                    <p className="truncate text-[11px] text-stone-500">
                      {item.customer_phone || tr('Chưa có SĐT', 'No phone')} ·{' '}
                      {item.owner_email || tr('Chưa nhận', 'Unassigned')}
                    </p>
                  </div>

                  <span className="shrink-0 text-[10px] text-stone-400">
                    {formatVnDateTime(item.updated_at, lang)}
                  </span>
                </div>

                {item.student_code && (
                  <div className="mt-1">
                    <span className="inline-block rounded border border-emerald-200 bg-emerald-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-emerald-900">
                      HV: {item.student_code}
                    </span>
                  </div>
                )}

                {item.follow_up_at && (
                  <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                    <Clock className="h-3 w-3" />
                    {tr('Hẹn:', 'Follow-up:')} {formatVnDateTime(item.follow_up_at, lang)}
                  </p>
                )}

                {(isUnassigned || needsClaimFirst) && (
                  <div className="mt-2 flex items-center justify-between gap-2">
                    {needsClaimFirst && (
                      <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-800">
                        <AlertCircle className="h-3 w-3" />
                        {tr('Nhận ca để xem chi tiết', 'Claim to read')}
                      </span>
                    )}
                    <button
                      type="button"
                      data-testid={`crm-claim-btn-${item.id}`}
                      disabled={claimingId === item.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void onClaim(item.id);
                      }}
                      className="ml-auto inline-flex items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-900 disabled:opacity-50"
                    >
                      <UserCheck className="h-3 w-3" />
                      <span>{tr('Nhận ca', 'Claim')}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {(offset > 0 || hasMore) && (
        <div className="flex items-center justify-between border-t border-stone-200 px-3 py-2 text-xs">
          <button
            type="button"
            disabled={offset === 0}
            onClick={() => onPageChange(Math.max(0, offset - 50))}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            {tr('Trước', 'Prev')}
          </button>
          <span className="text-[11px] text-stone-500">
            {offset + 1} – {offset + items.length}
          </span>
          <button
            type="button"
            disabled={!hasMore}
            onClick={() => onPageChange(offset + 50)}
            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
          >
            {tr('Sau', 'Next')}
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
