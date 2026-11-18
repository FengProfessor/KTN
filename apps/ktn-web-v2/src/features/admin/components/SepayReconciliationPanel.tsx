import React, { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  CheckCircle2,
  XCircle,
  RefreshCw,
  FlaskConical,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { formatVnd } from '@/lib/utils';
import type {
  KtnOrder,
  SepayReconciliationKind,
  SepayReconciliationLog,
  SepayReconciliationResolutionStatus,
} from '@/types/ktn.types';
import { isSandboxSimulatorAllowed } from './leadSourceMeta';

interface SepayReconciliationPanelProps {
  isDemoMode: boolean;
  ordersList?: KtnOrder[];
  onOpenOrder?: (orderId: string) => void;
  onMutationSuccess?: () => void;
}

const DEMO_RECON_LOGS: SepayReconciliationLog[] = [
  {
    id: 'recon-1',
    transaction_id: 'SEPAY-TX-9001',
    order_id: 'ORD-261105',
    claimed_order_code: 'ORD-261105',
    consultation_id: 'con-zalo-01',
    kind: 'mismatch',
    amount: 900000,
    expected_amount: 963000,
    account_number: '0909123456',
    transfer_content: 'KTN ORD-261105',
    resolution_status: 'open',
    created_at: '2026-11-18T02:10:00Z',
    updated_at: '2026-11-18T02:10:00Z',
  },
  {
    id: 'recon-2',
    transaction_id: 'SEPAY-TX-9002',
    order_id: 'ORD-261106',
    claimed_order_code: 'ORD-261106',
    consultation_id: 'con-web-02',
    kind: 'needs_review',
    amount: 1500000,
    expected_amount: 1500000,
    account_number: '0909123456',
    transfer_content: 'KTN ORD-261106',
    resolution_status: 'open',
    created_at: '2026-11-18T03:00:00Z',
    updated_at: '2026-11-18T03:00:00Z',
  },
  {
    id: 'recon-3',
    transaction_id: 'SEPAY-TX-9003',
    order_id: null,
    claimed_order_code: null,
    consultation_id: null,
    kind: 'unmatched',
    amount: 963000,
    expected_amount: null,
    account_number: '0909123456',
    transfer_content: 'CHUYEN KHOAN HOC PHI',
    resolution_status: 'open',
    created_at: '2026-11-18T03:15:00Z',
    updated_at: '2026-11-18T03:15:00Z',
  },
];

export const SepayReconciliationPanel: React.FC<SepayReconciliationPanelProps> = ({
  isDemoMode,
  ordersList = [],
  onOpenOrder,
  onMutationSuccess,
}) => {
  const { tr } = useI18n();
  const queryClient = useQueryClient();
  const addToast = useUiStore((s) => s.addToast);

  const [statusFilter, setStatusFilter] = useState<SepayReconciliationResolutionStatus | ''>('');
  const [kindFilter, setKindFilter] = useState<SepayReconciliationKind | ''>('');
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [linkOrderIds, setLinkOrderIds] = useState<Record<string, string>>({});
  const [demoLogs, setDemoLogs] = useState<SepayReconciliationLog[]>(DEMO_RECON_LOGS);

  const [simOrderId, setSimOrderId] = useState(ordersList[0]?.order_id || 'ORD-261105');
  const [simAmount, setSimAmount] = useState('963000');
  const [simContent, setSimContent] = useState(
    ordersList[0]?.order_id ? `KTN ${ordersList[0].order_id}` : 'KTN ORD-261105'
  );
  const [simKind, setSimKind] = useState('accepted');

  const reconQuery = useQuery({
    queryKey: ['ktn-admin-sepay-reconciliation', statusFilter, kindFilter, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          ok: true,
          items: demoLogs.filter(
            (l) =>
              (!statusFilter || l.resolution_status === statusFilter) &&
              (!kindFilter || l.kind === kindFilter)
          ),
          total: demoLogs.length,
          limit: 50,
          offset: 0,
        };
      }
      return ktnApi.listSepayReconciliation({
        resolutionStatus: statusFilter || undefined,
        kind: kindFilter || undefined,
        limit: 50,
      });
    },
    retry: false,
  });

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: ['ktn-admin-sepay-reconciliation'] });
    void queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
    void queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
    onMutationSuccess?.();
  };

  const resolveMutation = useMutation({
    mutationFn: async (vars: {
      transactionId: string;
      resolutionStatus: SepayReconciliationResolutionStatus;
      note?: string;
      orderId?: string;
    }) => {
      if (isDemoMode) {
        setDemoLogs((prev) =>
          prev.map((item) =>
            item.transaction_id === vars.transactionId
              ? {
                  ...item,
                  resolution_status: vars.resolutionStatus,
                  resolution_note: vars.note || item.resolution_note,
                  order_id: vars.orderId || item.order_id,
                }
              : item
          )
        );
        return { ok: true };
      }
      return ktnApi.resolveSepayReconciliation(vars);
    },
    onSuccess: () => {
      addToast({ title: tr('Đã cập nhật đối soát SePay', 'Updated reconciliation log'), variant: 'success' });
      invalidateAll();
    },
    onError: (err) => {
      addToast({
        title: tr('Lỗi xử lý đối soát', 'Reconciliation error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    },
  });

  const retryMutation = useMutation({
    mutationFn: async (vars: { consultationId: string; orderId: string; transactionId: string }) => {
      if (isDemoMode) return { updated: true };
      return ktnApi.retryConsultationPayment(vars);
    },
    onSuccess: () => {
      addToast({ title: tr('Đã thử kích hoạt lại đơn thanh toán', 'Retried payment provisioning'), variant: 'success' });
      invalidateAll();
    },
    onError: (err) => {
      addToast({
        title: tr('Lỗi thử lại cấp khóa', 'Retry provisioning failed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    },
  });

  const sandboxMutation = useMutation({
    mutationFn: async () => {
      const amount = Number(simAmount) || 0;
      const cleanOrderId = simOrderId.trim() || undefined;
      const cleanContent = simContent.trim() || (cleanOrderId ? `KTN ${cleanOrderId}` : 'KTN SANDBOX');
      if (isDemoMode) {
        const txId = `SEPAY-SB-${String(Date.now()).slice(-5)}`;
        setDemoLogs((prev) => [
          {
            id: txId,
            transaction_id: txId,
            order_id: simKind === 'unmatched' ? null : cleanOrderId || null,
            claimed_order_code: cleanOrderId || null,
            kind: simKind as SepayReconciliationKind,
            amount,
            expected_amount: 963000,
            transfer_content: cleanContent,
            resolution_status: 'open',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
          ...prev,
        ]);
        return { ok: true };
      }
      return ktnApi.simulateSepaySandboxEvent({
        orderId: simKind === 'unmatched' ? undefined : cleanOrderId,
        transferAmount: amount,
        transferContent: cleanContent,
        kind: simKind,
      });
    },
    onSuccess: () => {
      addToast({ title: tr('Đã chạy giao dịch SePay Sandbox', 'Simulated SePay webhook event'), variant: 'success' });
      invalidateAll();
    },
    onError: (err) => {
      addToast({
        title: tr('Lỗi giả lập SePay', 'Sandbox simulation failed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    },
  });

  const items = reconQuery.data?.items || [];

  const kindBadgeClass = (kind: SepayReconciliationKind) => {
    if (kind === 'accepted') return 'border-emerald-200 bg-emerald-50 text-emerald-900';
    if (kind === 'duplicate') return 'border-stone-300 bg-stone-100 text-stone-800';
    if (kind === 'mismatch' || kind === 'account_mismatch')
      return 'border-red-200 bg-red-50 text-red-900';
    return 'border-amber-200 bg-amber-50 text-amber-950';
  };

  return (
    <div
      data-testid="sepay-reconciliation-panel"
      className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3.5 text-xs shadow-2xs sm:p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
        <div>
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <AlertTriangle className="h-4 w-4 text-red-800" />
            <span>{tr('Hàng đợi đối soát SePay & Giao dịch lệch', 'SePay Reconciliation Queue')}</span>
          </h3>
          <p className="text-[11px] text-stone-500">
            {tr(
              'Theo dõi giao dịch lệch tiền, trùng lặp, chưa khớp mã đơn hoặc cần duyệt thủ công.',
              'Track mismatched, duplicate, unmatched, and review-required SePay transfers.'
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <select
            data-testid="sepay-recon-status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as SepayReconciliationResolutionStatus | '')
            }
            className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="">{tr('Mọi trạng thái', 'All statuses')}</option>
            <option value="open">{tr('Chưa xử lý', 'Open')}</option>
            <option value="resolved">{tr('Đã đối soát', 'Resolved')}</option>
            <option value="ignored">{tr('Đã bỏ qua', 'Ignored')}</option>
          </select>

          <select
            data-testid="sepay-recon-kind-filter"
            value={kindFilter}
            onChange={(e) => setKindFilter(e.target.value as SepayReconciliationKind | '')}
            className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold"
          >
            <option value="">{tr('Mọi loại cảnh báo', 'All kinds')}</option>
            <option value="mismatch">mismatch</option>
            <option value="duplicate">duplicate</option>
            <option value="needs_review">needs_review</option>
            <option value="unmatched">unmatched</option>
            <option value="unknown_order">unknown_order</option>
            <option value="account_mismatch">account_mismatch</option>
            <option value="accepted">accepted</option>
          </select>
        </div>
      </div>

      {/* Non-prod Sandbox Simulator */}
      {(isSandboxSimulatorAllowed() || isDemoMode) && (
        <div
          data-testid="sepay-sandbox-simulator"
          className="rounded-xl border border-sky-200 bg-sky-50/70 p-3"
        >
          <p className="flex items-center gap-1.5 font-bold text-sky-950">
            <FlaskConical className="h-3.5 w-3.5 text-sky-700" />
            <span>{tr('SePay Sandbox Simulator (Chỉ môi trường kiểm thử)', 'SePay Sandbox Simulator')}</span>
          </p>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-5">
            <input
              type="text"
              data-testid="sepay-sandbox-order-input"
              value={simOrderId}
              onChange={(e) => {
                setSimOrderId(e.target.value);
                if (e.target.value.trim()) {
                  setSimContent(`KTN ${e.target.value.trim()}`);
                }
              }}
              placeholder="ORD-261105"
              className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-mono text-xs"
            />
            <input
              type="number"
              data-testid="sepay-sandbox-amount-input"
              value={simAmount}
              onChange={(e) => setSimAmount(e.target.value)}
              placeholder="963000"
              className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 font-mono text-xs"
            />
            <input
              type="text"
              data-testid="sepay-sandbox-content-input"
              value={simContent}
              onChange={(e) => setSimContent(e.target.value)}
              placeholder="KTN ORD-261105"
              className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <select
              data-testid="sepay-sandbox-kind-select"
              value={simKind}
              onChange={(e) => setSimKind(e.target.value)}
              className="rounded-lg border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            >
              <option value="accepted">accepted</option>
              <option value="mismatch">mismatch</option>
              <option value="duplicate">duplicate</option>
              <option value="unmatched">unmatched</option>
            </select>
            <button
              type="button"
              data-testid="sepay-sandbox-simulate-btn"
              disabled={sandboxMutation.isPending}
              onClick={() => sandboxMutation.mutate()}
              className="rounded-lg bg-sky-700 px-3 py-1.5 font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {tr('Giả lập Webhook SePay', 'Simulate SePay')}
            </button>
          </div>
        </div>
      )}

      {/* Reconciliation Table / Cards */}
      {reconQuery.isLoading ? (
        <p className="py-4 text-center text-stone-500">
          {tr('Đang tải dữ liệu đối soát...', 'Loading reconciliation logs...')}
        </p>
      ) : reconQuery.isError ? (
        <div
          role="alert"
          data-testid="sepay-recon-error-alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950"
        >
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
            <div>
              <p className="font-bold text-red-900">
                {tr(
                  'Không thể tải danh sách đối soát SePay.',
                  'Failed to load SePay reconciliation logs.'
                )}
              </p>
              <p className="mt-0.5 text-red-800">
                {reconQuery.error instanceof Error
                  ? reconQuery.error.message
                  : tr('Vui lòng thử lại sau.', 'Please try again later.')}
              </p>
            </div>
          </div>
          <button
            type="button"
            data-testid="sepay-recon-retry-fetch-btn"
            onClick={() => void reconQuery.refetch()}
            className="inline-flex items-center gap-1 rounded-lg border border-red-300 bg-white px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
          >
            <RefreshCw className="h-3 w-3" />
            <span>{tr('Thử lại', 'Retry')}</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <p className="py-4 text-center text-stone-500">
          {tr('Không có giao dịch đối soát nào.', 'No reconciliation logs found.')}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((log) => {
            const targetOrderId = linkOrderIds[log.transaction_id] ?? log.order_id ?? '';
            const noteVal = notes[log.transaction_id] ?? '';
            const showRetry =
              Boolean(log.order_id) &&
              Boolean(log.consultation_id) &&
              (log.kind === 'needs_review' || log.kind === 'accepted');

            return (
              <div
                key={log.transaction_id}
                data-testid={`sepay-recon-row-${log.transaction_id}`}
                className="rounded-xl border border-stone-200 bg-stone-50 p-3"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono font-extrabold text-red-900">
                      {log.transaction_id}
                    </span>
                    <span
                      className={`rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase ${kindBadgeClass(
                        log.kind
                      )}`}
                    >
                      {log.kind}
                    </span>
                    <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                      {log.resolution_status}
                    </span>
                    {(log.order_id || log.claimed_order_code) && (
                      <button
                        type="button"
                        onClick={() =>
                          onOpenOrder?.(String(log.order_id || log.claimed_order_code))
                        }
                        className="inline-flex items-center gap-1 rounded bg-white px-1.5 py-0.5 font-mono text-[10px] font-bold text-red-800 hover:underline"
                      >
                        <span>{log.order_id || log.claimed_order_code}</span>
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    )}
                  </div>

                  <div className="font-display font-extrabold text-stone-900">
                    {formatVnd(log.amount)}
                    {typeof log.expected_amount === 'number' &&
                      log.expected_amount !== log.amount && (
                        <span className="ml-1.5 text-[11px] font-semibold text-red-700">
                          ({tr('Kỳ vọng:', 'Expected:')} {formatVnd(log.expected_amount)})
                        </span>
                      )}
                  </div>
                </div>

                {log.transfer_content && (
                  <p className="mt-1 font-mono text-[11px] text-stone-700">
                    {tr('Nội dung CK:', 'Content:')} {log.transfer_content}
                  </p>
                )}

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {!log.order_id && (
                    <input
                      type="text"
                      value={targetOrderId}
                      onChange={(e) =>
                        setLinkOrderIds((prev) => ({
                          ...prev,
                          [log.transaction_id]: e.target.value,
                        }))
                      }
                      placeholder={tr('Gắn mã đơn (ORD-...)', 'Order ID (ORD-...)')}
                      className="w-36 rounded-lg border border-stone-200 bg-white px-2 py-1 font-mono text-[11px]"
                    />
                  )}
                  <input
                    type="text"
                    value={noteVal}
                    onChange={(e) =>
                      setNotes((prev) => ({
                        ...prev,
                        [log.transaction_id]: e.target.value,
                      }))
                    }
                    placeholder={tr('Ghi chú kế toán / lý do...', 'Resolution note...')}
                    className="min-w-[180px] flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px]"
                  />

                  <button
                    type="button"
                    data-testid={`sepay-recon-resolve-btn-${log.transaction_id}`}
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({
                        transactionId: log.transaction_id,
                        resolutionStatus: 'resolved',
                        note: noteVal.trim() || undefined,
                        orderId: targetOrderId.trim() || undefined,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                  >
                    <CheckCircle2 className="h-3 w-3" />
                    <span>{tr('Đánh dấu đã khớp', 'Resolve')}</span>
                  </button>

                  <button
                    type="button"
                    data-testid={`sepay-recon-ignore-btn-${log.transaction_id}`}
                    disabled={resolveMutation.isPending}
                    onClick={() =>
                      resolveMutation.mutate({
                        transactionId: log.transaction_id,
                        resolutionStatus: 'ignored',
                        note: noteVal.trim() || undefined,
                      })
                    }
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                  >
                    <XCircle className="h-3 w-3" />
                    <span>{tr('Bỏ qua', 'Ignore')}</span>
                  </button>

                  {showRetry && (
                    <button
                      type="button"
                      data-testid={`sepay-recon-retry-btn-${log.transaction_id}`}
                      disabled={retryMutation.isPending}
                      onClick={() =>
                        retryMutation.mutate({
                          consultationId: log.consultation_id!,
                          orderId: log.order_id!,
                          transactionId: log.transaction_id,
                        })
                      }
                      className="inline-flex items-center gap-1 rounded-lg bg-amber-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-amber-700"
                    >
                      <RefreshCw className="h-3 w-3" />
                      <span>{tr('Thử cấp lại', 'Retry Provisioning')}</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
