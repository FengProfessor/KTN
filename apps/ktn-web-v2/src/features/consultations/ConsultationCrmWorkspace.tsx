import React, { Suspense, useEffect, useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  AlertTriangle,
  BarChart3,
  Settings,
  Receipt,
  ExternalLink,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { CompactPageHeader } from '@/components/shared/CompactUi';
import type {
  ConsultationAdvisor,
  ConsultationCatalogCourse,
  ConsultationChannel,
  ConsultationEvent,
  ConsultationFlag,
  ConsultationInboxItem,
  ConsultationMessage,
  ConsultationOutcome,
  ConsultationThread,
  ConsultationThreadOrderLink,
  KtnCourse,
} from '@/types/ktn.types';
import { ConsultationInboxList } from './components/ConsultationInboxList';
import { ConsultationThreadPane } from './components/ConsultationThreadPane';
import { ConsultationFlagsSection } from './components/ConsultationFlagsSection';
import { ConsultationAnalyticsPanel } from './components/ConsultationAnalyticsPanel';
import { ConsultationSettingsPanel } from './components/ConsultationSettingsPanel';
import {
  CreateConsultationOrderModal,
  LinkStudentCodeModal,
} from './components/ConsultationActionModals';

const SepayReconciliationPanel = lazyWithRetry(() =>
  import('@/features/admin/components/SepayReconciliationPanel').then((m) => ({
    default: m.SepayReconciliationPanel,
  }))
);

type CrmSubTab = 'inbox' | 'flags' | 'analytics' | 'recon' | 'settings';

const DEMO_ADVISORS: ConsultationAdvisor[] = [
  { email: 'advisor1@khongtunhi.com', name: 'Tư vấn viên Minh Anh', active: true, role: 'advisor' },
  { email: 'quanly@khongtunhi.com', name: 'Ban Quản Lý KTN', active: true, role: 'manager' },
];

const DEMO_INBOX: ConsultationInboxItem[] = [
  {
    id: 'con-zalo-01',
    channel: 'zalo_oa',
    owner_email: 'advisor1@khongtunhi.com',
    status: 'open',
    created_at: '2026-11-18T01:30:00Z',
    updated_at: '2026-11-18T02:30:00Z',
    reply_pending: true,
    has_paid_pending: false,
    customer_name: 'Anh Hoàng Minh',
    customer_phone: '0909123456',
    zalo_user_id: 'zalo-88990011',
    source_tag: 'ad_963k',
    lead_meta: {
      ad_source: 'ad_963k',
      target_learner: 'Người đi làm',
      goal: 'Giao tiếp công việc',
    },
    student_code: 'KTN-2026-089',
  },
  {
    id: 'con-web-02',
    channel: 'web',
    owner_email: null,
    status: 'waiting',
    created_at: '2026-11-18T02:00:00Z',
    updated_at: '2026-11-18T02:45:00Z',
    reply_pending: true,
    has_paid_pending: false,
    customer_name: 'Chị Thu Hà',
    customer_phone: '0912345678',
    source_tag: 'web_chat',
    lead_meta: { target_learner: 'Bé 8 tuổi' },
  },
];

const DEMO_MESSAGES_MAP: Record<string, ConsultationMessage[]> = {
  'con-zalo-01': [
    {
      id: 'm1',
      sender: 'customer',
      body: 'Chào KTN, mình thấy quảng cáo gói 963k cho người đi làm 1 kèm 1.',
      created_at: '2026-11-18T01:30:00Z',
    },
    {
      id: 'm2',
      sender: 'bot',
      bot_mode: 'scripted',
      body: '[Kịch bản] Em đã ghi nhận nhu cầu học 1:1 cho người đi làm và chuyển thông tin cho tư vấn viên KTN hỗ trợ ngay ạ.',
      created_at: '2026-11-18T01:30:05Z',
    },
    {
      id: 'm3',
      sender: 'note',
      actor_email: 'advisor1@khongtunhi.com',
      body: 'Khách làm xuất nhập khẩu, ưu tiên học tối T3/T5.',
      created_at: '2026-11-18T01:35:00Z',
    },
  ],
  'con-web-02': [
    {
      id: 'm4',
      sender: 'customer',
      body: 'Con chị 8 tuổi cần lớp 1 kèm 1 hoặc nhóm nhỏ.',
      created_at: '2026-11-18T02:00:00Z',
    },
  ],
};

export const ConsultationCrmWorkspace: React.FC = () => {
  const { tr } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const initialThreadParam = searchParams.get('thread');
  const [subTab, setSubTab] = useState<CrmSubTab>('inbox');
  const [selectedId, setSelectedId] = useState<string | null>(initialThreadParam);
  const [channelFilter, setChannelFilter] = useState<ConsultationChannel | ''>('');
  const [statusFilter, setStatusFilter] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [threadOffset, setThreadOffset] = useState(0);

  const [draftText, setDraftText] = useState('');
  const [composerMode, setComposerMode] = useState<'reply' | 'note'>('reply');
  const [composerFocused, setComposerFocused] = useState(false);

  const [createOrderOpen, setCreateOrderOpen] = useState(false);
  const [linkStudentOpen, setLinkStudentOpen] = useState(false);

  const [demoInbox, setDemoInbox] = useState<ConsultationInboxItem[]>(DEMO_INBOX);
  const [demoMessages, setDemoMessages] =
    useState<Record<string, ConsultationMessage[]>>(DEMO_MESSAGES_MAP);

  useEffect(() => {
    if (initialThreadParam) {
      setSelectedId(initialThreadParam);
      setSubTab('inbox');
    }
  }, [initialThreadParam]);

  useEffect(() => {
    setDraftText('');
    setComposerMode('reply');
    setThreadOffset(0);
  }, [selectedId]);

  const profileQuery = useQuery({
    queryKey: ['ktn-consultation-staff-profile', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          actor: {
            email: user?.email || 'quanly@khongtunhi.com',
            name: user?.name || 'Staff',
            admin: user?.role === 'admin',
            role: user?.role === 'admin' ? ('manager' as const) : ('advisor' as const),
          },
        };
      }
      return ktnApi.getConsultationStaffProfile();
    },
    retry: false,
  });

  const actor = profileQuery.data?.actor;
  const isManager =
    user?.role === 'admin' || actor?.admin === true || actor?.role === 'manager';
  const currentEmail = actor?.email || user?.email || '';

  const advisorsQuery = useQuery({
    queryKey: ['ktn-consultation-advisors', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return { advisors: DEMO_ADVISORS };
      return ktnApi.getConsultationAdvisors();
    },
    enabled: isManager,
    retry: false,
  });

  const coursesQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
          {
            id: '6adadba969897b0002482ca5',
            code: 'HSK1-30',
            title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
            shortTitle: 'HSK1 3.0',
            badge: 'HSK1',
            lessonsCount: 30,
            price: 963000,
            oldPrice: 1200000,
          },
        ];
      }
      return ktnApi.getCourses();
    },
    retry: false,
  });

  const shouldPausePolling =
    composerFocused ||
    Boolean(draftText.trim()) ||
    (typeof document !== 'undefined' && document.hidden);

  const inboxQuery = useQuery({
    queryKey: [
      'ktn-consultation-inbox',
      channelFilter,
      statusFilter,
      ownerFilter,
      searchQuery,
      offset,
      isDemoMode,
    ],
    queryFn: async () => {
      if (isDemoMode) {
        const filtered = demoInbox.filter((item) => {
          if (channelFilter && item.channel !== channelFilter) return false;
          if (statusFilter && item.status !== statusFilter) return false;
          if (ownerFilter === 'unassigned' && item.owner_email) return false;
          if (ownerFilter && ownerFilter !== 'unassigned' && item.owner_email !== ownerFilter)
            return false;
          if (searchQuery.trim()) {
            const q = searchQuery.trim().toLowerCase();
            const hay = `${item.customer_name || ''} ${item.customer_phone || ''} ${item.zalo_user_id || ''} ${item.id}`.toLowerCase();
            if (!hay.includes(q)) return false;
          }
          return true;
        });
        return { conversations: filtered, hasMore: false };
      }
      return ktnApi.getConsultationInbox({
        channel: channelFilter || undefined,
        status: statusFilter || undefined,
        owner: ownerFilter || undefined,
        search: searchQuery.trim() || undefined,
        offset,
      });
    },
    refetchInterval: subTab === 'inbox' && !shouldPausePolling ? 7000 : false,
    retry: false,
  });

  const threadQuery = useQuery<{
    conversation: ConsultationThread;
    messages: ConsultationMessage[];
    hasEarlier: boolean;
    events: ConsultationEvent[];
    flags: ConsultationFlag[];
    orders: ConsultationThreadOrderLink[];
  } | null>({
    queryKey: ['ktn-consultation-thread', selectedId, threadOffset, isDemoMode],
    queryFn: async () => {
      if (!selectedId) return null;
      if (isDemoMode) {
        const found = demoInbox.find((c) => c.id === selectedId);
        if (!found) return null;
        return {
          conversation: found,
          messages: demoMessages[selectedId] || [],
          hasEarlier: false,
          events: [],
          flags: [],
          orders: [],
        };
      }
      return ktnApi.getConsultationThread(selectedId, threadOffset || undefined);
    },
    enabled: Boolean(selectedId),
    refetchInterval: subTab === 'inbox' && selectedId && !shouldPausePolling ? 7000 : false,
    retry: false,
  });

  const invalidateInboxAndThread = () => {
    void queryClient.invalidateQueries({ queryKey: ['ktn-consultation-inbox'] });
    if (selectedId) {
      void queryClient.invalidateQueries({ queryKey: ['ktn-consultation-thread', selectedId] });
    }
  };

  const claimMutation = useMutation({
    mutationFn: async (id: string) => {
      if (isDemoMode) {
        setDemoInbox((prev) =>
          prev.map((c) =>
            c.id === id ? { ...c, owner_email: currentEmail, status: 'open' } : c
          )
        );
        return { updated: true };
      }
      return ktnApi.operateConsultationThread(id, 'claim');
    },
    onSuccess: (_res, id) => {
      if (selectedId !== id) {
        setDraftText('');
        setComposerMode('reply');
      }
      setSelectedId(id);
      setThreadOffset(0);
      addToast({ title: tr('Đã nhận ca tư vấn', 'Claimed consultation'), variant: 'success' });
      invalidateInboxAndThread();
    },
    onError: (err) => {
      addToast({
        title: tr('Không thể nhận ca', 'Claim failed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    },
  });

  const opMutation = useMutation({
    mutationFn: async (vars: {
      op: 'assign' | 'reply' | 'note' | 'follow_up' | 'close' | 'reopen';
      payload?: Record<string, unknown>;
    }) => {
      if (!selectedId) return { updated: false };
      if (isDemoMode) {
        if (vars.op === 'reply' || vars.op === 'note') {
          const msg: ConsultationMessage = {
            id: `demo-m-${Date.now()}`,
            sender: vars.op === 'note' ? 'note' : isManager ? 'manager' : 'advisor',
            actor_email: currentEmail,
            body: String(vars.payload?.body || ''),
            created_at: new Date().toISOString(),
          };
          setDemoMessages((prev) => ({
            ...prev,
            [selectedId]: [...(prev[selectedId] || []), msg],
          }));
        } else if (vars.op === 'assign') {
          const owner = String(vars.payload?.email || vars.payload?.owner_email || '');
          setDemoInbox((prev) =>
            prev.map((c) =>
              c.id === selectedId
                ? { ...c, owner_email: owner || null, status: owner ? 'open' : 'waiting' }
                : c
            )
          );
        } else if (vars.op === 'follow_up') {
          const at = (vars.payload?.at as string | null) ?? null;
          setDemoInbox((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, follow_up_at: at } : c))
          );
        } else if (vars.op === 'close') {
          setDemoInbox((prev) =>
            prev.map((c) =>
              c.id === selectedId
                ? {
                    ...c,
                    status: 'closed',
                    outcome: vars.payload?.outcome as ConsultationOutcome,
                  }
                : c
            )
          );
        } else if (vars.op === 'reopen') {
          setDemoInbox((prev) =>
            prev.map((c) => (c.id === selectedId ? { ...c, status: 'open' } : c))
          );
        }
        return { updated: true };
      }
      return ktnApi.operateConsultationThread(selectedId, vars.op, vars.payload);
    },
    onSuccess: (_res, vars) => {
      if (vars.op === 'reply' || vars.op === 'note') {
        setDraftText('');
      }
      invalidateInboxAndThread();
    },
    onError: (err) => {
      addToast({
        title: tr('Thao tác thất bại', 'Operation failed'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    },
  });

  const handleSendMessage = async () => {
    const clean = draftText.trim();
    if (!clean || !selectedId) return;
    const requestId =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : `req-${Date.now()}`;
    await opMutation.mutateAsync({
      op: composerMode,
      payload:
        composerMode === 'reply'
          ? { body: clean, request_id: requestId }
          : { body: clean },
    });
  };

  const catalogCourses: ConsultationCatalogCourse[] = (coursesQuery.data || []).map((c) => ({
    id: c.id,
    title: c.title,
    price: c.price,
  }));

  const currentThread = threadQuery.data?.conversation || null;
  const inboxItems = inboxQuery.data?.conversations || [];
  const allFlags = threadQuery.data?.flags || [];
  const threadErrorMessage = threadQuery.isError
    ? threadQuery.error instanceof Error
      ? threadQuery.error.message
      : tr('Không thể tải chi tiết hội thoại.', 'Failed to load consultation thread.')
    : null;

  const handleReviewFlag = async (
    consultationId: string,
    messageId: string,
    status: 'confirmed' | 'dismissed',
    note: string
  ) => {
    try {
      if (!isDemoMode) {
        await ktnApi.reviewConsultationFlag(consultationId, {
          message_id: messageId,
          status,
          note: note || undefined,
        });
      }
      invalidateInboxAndThread();
      addToast({
        title: tr('Đã cập nhật cảnh báo AI', 'Updated AI flag'),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Không thể duyệt cảnh báo AI', 'Failed to review AI flag'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
      throw err;
    }
  };

  return (
    <div data-testid="consultation-crm-workspace" className="space-y-3">
      <CompactPageHeader
        title={tr('CRM Tư vấn Zalo OA & Web', 'Zalo OA & Web Consultation CRM')}
        subtitle={tr(
          'Hộp thư đa kênh · Kịch bản 1:1 · Đơn hàng VietQR · Đối soát SePay',
          'Omnichannel Inbox · 1:1 Script · VietQR Orders · SePay Reconciliation'
        )}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => invalidateInboxAndThread()}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>{tr('Làm mới', 'Refresh')}</span>
            </button>
            <a
              href="/tu-van/nhan-vien"
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-red-800 hover:bg-red-50"
            >
              <span>{tr('Mở bản /tu-van/nhan-vien', 'Legacy /tu-van/nhan-vien')}</span>
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        }
      />

      {/* Sub-navigation */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          data-testid="crm-tab-inbox"
          onClick={() => setSubTab('inbox')}
          className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
            subTab === 'inbox'
              ? 'bg-red-800 text-white'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Inbox className="h-3.5 w-3.5" />
          <span>{tr('Hộp thư tư vấn', 'Inbox')}</span>
        </button>

        {isManager && (
          <>
            <button
              type="button"
              data-testid="crm-tab-flags"
              onClick={() => setSubTab('flags')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                subTab === 'flags'
                  ? 'bg-red-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              <span>{tr('Cảnh báo AI', 'AI Flags')}</span>
            </button>

            <button
              type="button"
              data-testid="crm-tab-analytics"
              onClick={() => setSubTab('analytics')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                subTab === 'analytics'
                  ? 'bg-red-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <BarChart3 className="h-3.5 w-3.5" />
              <span>{tr('Báo cáo & CSV', 'Reports & CSV')}</span>
            </button>

            <button
              type="button"
              data-testid="crm-tab-recon"
              onClick={() => setSubTab('recon')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                subTab === 'recon'
                  ? 'bg-red-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Receipt className="h-3.5 w-3.5" />
              <span>{tr('Đối soát SePay', 'SePay Recon')}</span>
            </button>

            <button
              type="button"
              data-testid="crm-tab-settings"
              onClick={() => setSubTab('settings')}
              className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold ${
                subTab === 'settings'
                  ? 'bg-red-800 text-white'
                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
              }`}
            >
              <Settings className="h-3.5 w-3.5" />
              <span>{tr('Cấu hình 72+ & Nhân sự', '72+ Config & Staff')}</span>
            </button>
          </>
        )}
      </div>

      {/* Tab Content */}
      {subTab === 'inbox' && (
        <div className="grid min-h-[68vh] grid-cols-1 gap-3 lg:grid-cols-12">
          <div className="lg:col-span-4">
            <ConsultationInboxList
              items={inboxItems}
              hasMore={Boolean(inboxQuery.data?.hasMore)}
              isLoading={inboxQuery.isLoading}
              selectedId={selectedId}
              channelFilter={channelFilter}
              statusFilter={statusFilter}
              ownerFilter={ownerFilter}
              searchQuery={searchQuery}
              offset={offset}
              isManager={isManager}
              currentEmail={currentEmail}
              advisors={advisorsQuery.data?.advisors || []}
              onChannelChange={(c) => {
                setChannelFilter(c);
                setOffset(0);
              }}
              onStatusChange={(s) => {
                setStatusFilter(s);
                setOffset(0);
              }}
              onOwnerChange={(o) => {
                setOwnerFilter(o);
                setOffset(0);
              }}
              onSearchChange={(q) => {
                setSearchQuery(q);
                setOffset(0);
              }}
              onPageChange={(next) => setOffset(next)}
              onSelect={(item) => {
                if (item.id !== selectedId) {
                  setDraftText('');
                  setComposerMode('reply');
                }
                setSelectedId(item.id);
                setThreadOffset(0);
              }}
              onClaim={async (id) => {
                await claimMutation.mutateAsync(id);
              }}
              claimingId={claimMutation.isPending ? claimMutation.variables : null}
            />
          </div>

          <div className="lg:col-span-8">
            <ConsultationThreadPane
              key={currentThread?.id || selectedId || 'empty'}
              thread={currentThread}
              messages={threadQuery.data?.messages || []}
              events={threadQuery.data?.events || []}
              flags={allFlags}
              orders={threadQuery.data?.orders || []}
              hasEarlier={Boolean(threadQuery.data?.hasEarlier)}
              isLoading={threadQuery.isLoading}
              threadError={threadErrorMessage}
              onRetryThread={() => void threadQuery.refetch()}
              isManager={isManager}
              advisors={advisorsQuery.data?.advisors || []}
              draftText={draftText}
              composerMode={composerMode}
              onDraftChange={setDraftText}
              onComposerModeChange={setComposerMode}
              onComposerFocusChange={setComposerFocused}
              onLoadEarlier={() => setThreadOffset((p) => p + 40)}
              onSendMessage={handleSendMessage}
              onAssign={async (ownerEmail) => {
                await opMutation.mutateAsync({ op: 'assign', payload: { email: ownerEmail } });
              }}
              onFollowUp={async (iso) => {
                await opMutation.mutateAsync({ op: 'follow_up', payload: { at: iso } });
              }}
              onCloseThread={async (outcome) => {
                await opMutation.mutateAsync({ op: 'close', payload: { outcome } });
              }}
              onReopenThread={async () => {
                await opMutation.mutateAsync({ op: 'reopen' });
              }}
              onCreateCheckoutLink={async () => {
                if (!selectedId) return;
                if (isDemoMode) {
                  setDraftText((prev) =>
                    prev ? `${prev}\nhttps://khongtunhi.com/tu-van?checkout=demo` : 'https://khongtunhi.com/tu-van?checkout=demo'
                  );
                  return;
                }
                const res = await ktnApi.createConsultationCheckoutLink(selectedId);
                if (res?.url) {
                  setDraftText((prev) => (prev ? `${prev}\n${res.url}` : res.url));
                  addToast({ title: tr('Đã chèn link thanh toán', 'Checkout link inserted'), variant: 'success' });
                }
              }}
              onOpenCreateOrder={() => setCreateOrderOpen(true)}
              onOpenLinkStudent={() => setLinkStudentOpen(true)}
              onRetryPayment={async (orderId, txId) => {
                if (!selectedId) return;
                try {
                  await ktnApi.retryConsultationPayment(selectedId, {
                    order_id: orderId,
                    transaction_id: txId,
                  });
                  invalidateInboxAndThread();
                  addToast({ title: tr('Đã thử kích hoạt lại đơn', 'Retried provisioning'), variant: 'success' });
                } catch (err) {
                  addToast({
                    title: tr('Thử cấp lại thất bại', 'Retry provisioning failed'),
                    description: err instanceof Error ? err.message : undefined,
                    variant: 'error',
                  });
                }
              }}
              onSaveTimeslotNote={async (timeslot) => {
                await opMutation.mutateAsync({
                  op: 'note',
                  payload: { body: `[Khung giờ rảnh Người đi làm 1:1]: ${timeslot}` },
                });
              }}
              onReviewFlag={handleReviewFlag}
              isMutating={opMutation.isPending}
            />
          </div>
        </div>
      )}

      {subTab === 'flags' && isManager && (
        <ConsultationFlagsSection
          flags={allFlags}
          hasSelectedThread={Boolean(selectedId)}
          onGoToInbox={() => setSubTab('inbox')}
          onReviewFlag={handleReviewFlag}
          onOpenThread={(id) => {
            if (id !== selectedId) {
              setDraftText('');
              setComposerMode('reply');
            }
            setSelectedId(id);
            setThreadOffset(0);
            setSubTab('inbox');
          }}
        />
      )}

      {subTab === 'analytics' && isManager && (
        <ConsultationAnalyticsPanel
          isDemoMode={isDemoMode}
          advisors={advisorsQuery.data?.advisors || []}
          onOpenThread={(id) => {
            if (id !== selectedId) {
              setDraftText('');
              setComposerMode('reply');
            }
            setSelectedId(id);
            setThreadOffset(0);
            setSubTab('inbox');
          }}
        />
      )}

      {subTab === 'recon' && isManager && (
        <Suspense
          fallback={
            <div className="rounded-2xl border border-stone-200 bg-white p-6 text-center text-xs text-stone-500">
              {tr('Đang tải bảng đối soát SePay...', 'Loading SePay reconciliation...')}
            </div>
          }
        >
          <SepayReconciliationPanel
            isDemoMode={isDemoMode}
            onOpenOrder={(orderId) =>
              navigate(`/admin/orders?orderId=${encodeURIComponent(orderId)}`)
            }
            onMutationSuccess={invalidateInboxAndThread}
          />
        </Suspense>
      )}

      {subTab === 'settings' && isManager && (
        <ConsultationSettingsPanel
          isDemoMode={isDemoMode}
          advisors={advisorsQuery.data?.advisors || []}
          courses={coursesQuery.data || []}
          onAdvisorsChanged={() =>
            void queryClient.invalidateQueries({ queryKey: ['ktn-consultation-advisors'] })
          }
          onSandboxEventTriggered={() => {
            invalidateInboxAndThread();
            setSubTab('inbox');
          }}
        />
      )}

      {currentThread && (
        <>
          <CreateConsultationOrderModal
            key={`create-order-${currentThread.id}`}
            open={createOrderOpen}
            thread={currentThread}
            courses={catalogCourses}
            isDemoMode={isDemoMode}
            onClose={() => setCreateOrderOpen(false)}
            onOrderCreated={() => invalidateInboxAndThread()}
            onSendQrToThread={async (qrText) => {
              const requestId =
                typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
                  ? crypto.randomUUID()
                  : `req-${Date.now()}`;
              await opMutation.mutateAsync({
                op: 'reply',
                payload: { body: qrText, request_id: requestId },
              });
            }}
          />
          <LinkStudentCodeModal
            key={`link-student-${currentThread.id}`}
            open={linkStudentOpen}
            thread={currentThread}
            isDemoMode={isDemoMode}
            onClose={() => setLinkStudentOpen(false)}
            onLinked={(studentCode) => {
              if (isDemoMode) {
                setDemoInbox((prev) =>
                  prev.map((c) =>
                    c.id === currentThread.id ? { ...c, student_code: studentCode } : c
                  )
                );
              }
              invalidateInboxAndThread();
            }}
          />
        </>
      )}
    </div>
  );
};
