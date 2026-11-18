import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Download, BarChart3, ExternalLink } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { formatVnd, getHoChiMinhCalendarDateString } from '@/lib/utils';
import type {
  ConsultationAdvisor,
  ConsultationChannel,
  ConsultationReportResponse,
} from '@/types/ktn.types';
import { formatVnDateTime, serializeReportToCsv } from '../utils/consultationHelpers';

interface ConsultationAnalyticsPanelProps {
  isDemoMode: boolean;
  advisors: ConsultationAdvisor[];
  onOpenThread: (consultationId: string) => void;
}

const DEMO_REPORT: ConsultationReportResponse = {
  start: '2026-11-10T00:00:00Z',
  end: '2026-11-18T23:59:59Z',
  responseMinutes: 4.5,
  conversations: [
    {
      id: 'con-zalo-01',
      channel: 'zalo_oa',
      owner_email: 'advisor1@khongtunhi.com',
      status: 'open',
      created_at: '2026-11-18T02:00:00Z',
      updated_at: '2026-11-18T02:30:00Z',
      reply_pending: false,
      has_paid_pending: false,
      customer_name: 'Phụ huynh Minh Hạnh',
      customer_phone: '0909123456',
      zalo_user_id: 'zalo-u-8899',
      source_tag: 'zalo_oa',
    },
  ],
  assigned: [
    {
      consultation_id: 'con-zalo-01',
      owner_email: 'advisor1@khongtunhi.com',
      channel: 'zalo_oa',
      assigned_at: '2026-11-18T02:05:00Z',
    },
  ],
  overdue: [],
  flags: [],
  paid: [
    {
      order_id: 'ORD-261109',
      consultation_id: 'con-zalo-01',
      owner_email: 'advisor1@khongtunhi.com',
      channel: 'zalo_oa',
      course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      amount: 963000,
      approval_status: 'approved',
      paid_at: '2026-11-18T02:20:00Z',
    },
  ],
  revenue: 963000,
};

export const ConsultationAnalyticsPanel: React.FC<ConsultationAnalyticsPanelProps> = ({
  isDemoMode,
  advisors,
  onOpenThread,
}) => {
  const { lang, tr } = useI18n();
  const addToast = useUiStore((s) => s.addToast);
  const nowMs = Date.now();
  const today = getHoChiMinhCalendarDateString(nowMs);
  const weekAgo = getHoChiMinhCalendarDateString(nowMs - 6 * 86400_000);

  const [fromDate, setFromDate] = useState(weekAgo);
  const [toDate, setToDate] = useState(today);
  const [channel, setChannel] = useState<ConsultationChannel | ''>('');
  const [owner, setOwner] = useState('');
  const [drillGroup, setDrillGroup] = useState<
    'conversations' | 'assigned' | 'overdue' | 'paid'
  >('conversations');

  const reportQuery = useQuery<ConsultationReportResponse>({
    queryKey: ['ktn-consultation-report', fromDate, toDate, channel, owner, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_REPORT;
      return ktnApi.getConsultationReport({
        from: fromDate,
        to: toDate,
        channel: channel || undefined,
        owner: owner || undefined,
      });
    },
  });

  const report = reportQuery.data || DEMO_REPORT;

  const handleExportCsv = async () => {
    try {
      let csvBlob: Blob;
      if (!isDemoMode) {
        try {
          csvBlob = await ktnApi.downloadConsultationReportCsv({
            from: fromDate,
            to: toDate,
            channel: channel || undefined,
            owner: owner || undefined,
          });
        } catch {
          const rows: unknown[][] = [
            ['ID', 'Channel', 'Customer', 'Phone', 'Owner', 'Status', 'Updated At'],
            ...report.conversations.map((c) => [
              c.id,
              c.channel,
              c.customer_name || '',
              c.customer_phone || '',
              c.owner_email || '',
              c.status,
              c.updated_at,
            ]),
          ];
          csvBlob = new Blob([serializeReportToCsv(rows)], {
            type: 'text/csv;charset=utf-8;',
          });
        }
      } else {
        const rows: unknown[][] = [
          ['ID', 'Channel', 'Customer', 'Phone', 'Owner', 'Status', 'Updated At'],
          ...report.conversations.map((c) => [
            c.id,
            c.channel,
            c.customer_name || '',
            c.customer_phone || '',
            c.owner_email || '',
            c.status,
            c.updated_at,
          ]),
        ];
        csvBlob = new Blob([serializeReportToCsv(rows)], {
          type: 'text/csv;charset=utf-8;',
        });
      }

      if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
        const url = URL.createObjectURL(csvBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `ktn-consultation-report-${fromDate}-to-${toDate}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
      }
      addToast({
        title: tr('Đã xuất báo cáo CSV', 'CSV report exported'),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Xuất CSV thất bại', 'CSV export failed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  return (
    <div data-testid="crm-analytics-panel" className="space-y-3 text-xs">
      <div className="flex flex-wrap items-end justify-between gap-2 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[11px] font-bold text-stone-600">
              {tr('Từ ngày', 'From')}
            </label>
            <input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="mt-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600">
              {tr('Đến ngày', 'To')}
            </label>
            <input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="mt-1 rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600">
              {tr('Kênh', 'Channel')}
            </label>
            <select
              data-testid="crm-report-channel-select"
              value={channel}
              onChange={(e) => setChannel(e.target.value as ConsultationChannel | '')}
              className="mt-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">{tr('Tất cả kênh', 'All channels')}</option>
              <option value="zalo_oa">Zalo OA</option>
              <option value="web">Web</option>
              <option value="messenger">Messenger</option>
            </select>
          </div>
          <div>
            <label className="block text-[11px] font-bold text-stone-600">
              {tr('Nhân viên', 'Advisor')}
            </label>
            <select
              value={owner}
              onChange={(e) => setOwner(e.target.value)}
              className="mt-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="">{tr('Tất cả', 'All')}</option>
              {advisors.map((a) => (
                <option key={a.email} value={a.email}>
                  {a.name || a.email}
                </option>
              ))}
            </select>
          </div>
        </div>

        <button
          type="button"
          data-testid="crm-export-csv-btn"
          onClick={() => void handleExportCsv()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
        >
          <Download className="h-3.5 w-3.5" />
          <span>{tr('Xuất CSV (An toàn Excel)', 'Export CSV')}</span>
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-5">
        <button
          type="button"
          onClick={() => setDrillGroup('conversations')}
          className="rounded-2xl border border-stone-200 bg-white p-3 text-left hover:border-red-300"
        >
          <p className="text-[11px] font-bold text-stone-500">{tr('Tổng hội thoại', 'Threads')}</p>
          <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
            {report.conversations.length}
          </p>
        </button>
        <div className="rounded-2xl border border-stone-200 bg-white p-3">
          <p className="text-[11px] font-bold text-stone-500">
            {tr('TB phản hồi đầu', 'Avg 1st Reply')}
          </p>
          <p className="mt-1 font-display text-lg font-extrabold text-indigo-900">
            {report.responseMinutes !== null ? `${report.responseMinutes}m` : '—'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDrillGroup('assigned')}
          className="rounded-2xl border border-stone-200 bg-white p-3 text-left hover:border-red-300"
        >
          <p className="text-[11px] font-bold text-stone-500">{tr('Đã phân công', 'Assigned')}</p>
          <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
            {report.assigned.length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDrillGroup('overdue')}
          className="rounded-2xl border border-stone-200 bg-white p-3 text-left hover:border-red-300"
        >
          <p className="text-[11px] font-bold text-stone-500">{tr('Quá hạn hẹn', 'Overdue')}</p>
          <p className="mt-1 font-display text-lg font-extrabold text-amber-800">
            {report.overdue.length}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setDrillGroup('paid')}
          className="rounded-2xl border border-stone-200 bg-white p-3 text-left hover:border-red-300"
        >
          <p className="text-[11px] font-bold text-stone-500">{tr('Doanh thu chốt', 'Revenue')}</p>
          <p className="mt-1 font-display text-base font-extrabold text-emerald-800">
            {formatVnd(report.revenue)}
          </p>
        </button>
      </div>

      {/* Drilldown List */}
      <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs">
        <h4 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase text-stone-800">
          <BarChart3 className="h-4 w-4 text-red-800" />
          <span>{tr('Chi tiết nhóm:', 'Drilldown:')} {drillGroup}</span>
        </h4>
        <div className="mt-2 divide-y divide-stone-100">
          {drillGroup === 'conversations' &&
            report.conversations.map((c) => (
              <div key={c.id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-bold text-stone-900">
                    {c.customer_name || c.id} ({c.channel})
                  </span>
                  <span className="ml-2 text-stone-500">{c.owner_email || 'unassigned'}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenThread(c.id)}
                  className="inline-flex items-center gap-1 font-bold text-red-800 hover:underline"
                >
                  <span>{tr('Mở', 'Open')}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          {drillGroup === 'paid' &&
            report.paid.map((p) => (
              <div key={p.order_id} className="flex items-center justify-between py-2">
                <div>
                  <span className="font-mono font-bold text-red-900">{p.order_id}</span>
                  <span className="ml-2 text-stone-800">
                    {p.course_name} · {formatVnd(p.amount)} ({p.channel})
                  </span>
                  <span className="ml-2 text-stone-500">{formatVnDateTime(p.paid_at, lang)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => onOpenThread(p.consultation_id)}
                  className="inline-flex items-center gap-1 font-bold text-red-800 hover:underline"
                >
                  <span>{tr('Mở ca', 'Thread')}</span>
                  <ExternalLink className="h-3 w-3" />
                </button>
              </div>
            ))}
          {drillGroup === 'assigned' &&
            report.assigned.map((a) => (
              <div key={`${a.consultation_id}-${a.assigned_at}`} className="flex items-center justify-between py-2">
                <span>
                  {a.owner_email} · {a.channel} · {formatVnDateTime(a.assigned_at, lang)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenThread(a.consultation_id)}
                  className="font-bold text-red-800 hover:underline"
                >
                  {tr('Mở ca', 'Thread')}
                </button>
              </div>
            ))}
          {drillGroup === 'overdue' &&
            report.overdue.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-2">
                <span>
                  {o.id} ({o.channel}) · {o.owner_email || 'unassigned'} ·{' '}
                  {formatVnDateTime(o.follow_up_at, lang)}
                </span>
                <button
                  type="button"
                  onClick={() => onOpenThread(o.id)}
                  className="font-bold text-red-800 hover:underline"
                >
                  {tr('Mở ca', 'Thread')}
                </button>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
};
