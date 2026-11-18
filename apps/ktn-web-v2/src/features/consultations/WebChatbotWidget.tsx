import React, { useEffect, useRef, useState } from 'react';
import {
  MessageCircle,
  X,
  Send,
  QrCode,
  Phone,
  Sparkles,
  CheckCircle2,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { formatVnd } from '@/lib/utils';
import type {
  ConsultationCatalogCourse,
  ConsultationLeadMeta,
  ConsultationMessage,
  ConsultationQuickReply,
  ConsultationStatus,
  KtnVietQrPaymentInfo,
} from '@/types/ktn.types';
import {
  buildQuickReplyMenu,
  isSafeVietQrUrl,
  normalizeVnPhone,
  validateVnPhone,
  type WebChatbotMenuKey,
} from './utils/consultationHelpers';

const WEB_CHAT_TOKEN_KEY = 'ktn_consult_web';

function dedupeMessagesById(list: ConsultationMessage[]): ConsultationMessage[] {
  const seen = new Set<string>();
  const result: ConsultationMessage[] = [];
  for (const msg of list) {
    if (!msg?.id || seen.has(msg.id)) continue;
    seen.add(msg.id);
    result.push(msg);
  }
  return result;
}

function appendUniqueMessage(
  prev: ConsultationMessage[],
  incoming: ConsultationMessage
): ConsultationMessage[] {
  if (!incoming?.id) return prev;
  if (prev.some((m) => m.id === incoming.id)) return prev;
  return [...prev, incoming];
}

interface WebChatbotWidgetProps {
  mode?: 'floating' | 'page';
}

export const WebChatbotWidget: React.FC<WebChatbotWidgetProps> = ({ mode = 'floating' }) => {
  const { lang, tr } = useI18n();
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [open, setOpen] = useState(mode === 'page');
  const [webToken, setWebToken] = useState<string>(() => {
    try {
      return localStorage.getItem(WEB_CHAT_TOKEN_KEY) || '';
    } catch {
      return '';
    }
  });
  const [status, setStatus] = useState<ConsultationStatus>('bot');
  const [messages, setMessages] = useState<ConsultationMessage[]>([]);
  const [quickReplies, setQuickReplies] = useState<ConsultationQuickReply[]>(() =>
    buildQuickReplyMenu('MENU_ROOT', lang)
  );
  const [catalog, setCatalog] = useState<ConsultationCatalogCourse[]>([]);
  const [checkoutEnabled, setCheckoutEnabled] = useState(true);

  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const [creatingOrder, setCreatingOrder] = useState(false);

  // Needs & Phone Capture Form
  const [showNeedPhoneForm, setShowNeedPhoneForm] = useState(false);
  const [needTarget, setNeedTarget] = useState('Lớp cho bé (5-12 tuổi)');
  const [needPhone, setNeedPhone] = useState('');
  const [needNote, setNeedNote] = useState('');
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // VietQR Checkout & Status Form
  const [showOrderForm, setShowOrderForm] = useState(false);
  const [orderCourseId, setOrderCourseId] = useState('');
  const [orderName, setOrderName] = useState('');
  const [orderEmail, setOrderEmail] = useState('');
  const [orderPhone, setOrderPhone] = useState('');
  const [orderError, setOrderError] = useState<string | null>(null);
  const [activeOrder, setActiveOrder] = useState<{
    id: string;
    amount: number;
    paymentStatus: string;
    accessStatus: string;
    payment: KtnVietQrPaymentInfo | null;
  } | null>(null);

  const listEndRef = useRef<HTMLDivElement | null>(null);
  const msgSeqRef = useRef(0);
  const mountedRef = useRef(true);
  const pendingMenuGuardRef = useRef<{ expectedState: WebChatbotMenuKey | null; setAt: number } | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const creatingOrderRef = useRef(false);
  const submittingPhoneRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, []);

  const applyThreadSnapshot = (
    threadRes: {
      status: ConsultationStatus;
      messages: ConsultationMessage[];
      lead_meta?: ConsultationLeadMeta;
      menu?: ConsultationQuickReply[];
    },
    token: string,
    allowRetry: boolean
  ) => {
    setStatus(threadRes.status);
    setMessages(dedupeMessagesById(threadRes.messages));
    if (threadRes.status !== 'bot') {
      pendingMenuGuardRef.current = null;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      setQuickReplies([]);
      return;
    }

    const guard = pendingMenuGuardRef.current;
    if (guard) {
      const elapsed = Date.now() - guard.setAt;
      const expected = guard.expectedState;
      const menu = Array.isArray(threadRes.menu) ? threadRes.menu : [];
      const caughtUp =
        elapsed > 8000 ||
        !expected ||
        (expected === 'MENU_ROOT'
          ? !threadRes.lead_meta?.menu_state &&
            menu.some((m) => m.id === 'MENU_PAYMENT' || m.id === 'root_payment')
          : threadRes.lead_meta?.menu_state === expected ||
            menu.some(
              (m) =>
                (expected === 'MENU_PAYMENT' &&
                  (m.action === 'OPEN_ORDER_FORM' || m.id === 'OPEN_ORDER_FORM' || m.id === 'pay_guide')) ||
                (expected === 'MENU_FAQ' && (m.id === 'FAQ_KIDS' || m.id === 'faq_kids')) ||
                (expected === 'MENU_NEED_PHONE' &&
                  (m.id === 'need_kids' ||
                    (m.id === 'MENU_HANDOFF' &&
                      !menu.some(
                        (item) =>
                          item.id === 'MENU_PAYMENT' ||
                          item.id === 'root_payment' ||
                          item.id === 'OPEN_ORDER_FORM' ||
                          item.id === 'pay_guide'
                      ))))
            ));

      if (!caughtUp) {
        if (allowRetry && !retryTimerRef.current) {
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (!mountedRef.current) return;
            void ktnApi
              .getWebConsultationThread(token)
              .then((retryRes) => {
                if (!mountedRef.current) return;
                applyThreadSnapshot(retryRes, token, true);
              })
              .catch(() => {
                // ignore transient retry failure
              });
          }, 350);
        }
        return;
      }
      pendingMenuGuardRef.current = null;
    }

    if (Array.isArray(threadRes.menu) && threadRes.menu.length > 0) {
      setQuickReplies(threadRes.menu);
    }
  };

  const nextSyntheticId = (prefix: string) => {
    msgSeqRef.current += 1;
    const entropy =
      typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
        ? crypto.randomUUID()
        : String(Date.now());
    return `${prefix}-${msgSeqRef.current}-${entropy}`;
  };

  useEffect(() => {
    if (!open) return;
    let active = true;

    const init = async () => {
      try {
        if (isDemoMode) {
          setCatalog([
            {
              id: '6adadba969897b0002482ca5',
              title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              price: 963000,
            },
          ]);
          setOrderCourseId('6adadba969897b0002482ca5');
          if (messages.length === 0) {
            setMessages((prev) =>
              prev.length === 0
                ? [
                    {
                      id: 'welcome-demo',
                      sender: 'bot',
                      bot_mode: 'scripted',
                      body: 'Chào anh/chị đến với Học Viện Khổng Tử Nhí! Anh/chị có thể chọn nhanh menu bên dưới hoặc nhắn câu hỏi để được hỗ trợ ngay.',
                      created_at: new Date().toISOString(),
                    },
                  ]
                : prev
            );
          }
          return;
        }

        let token = webToken;
        if (!token) {
          const started = await ktnApi.startWebConsultation();
          if (!active) return;
          token = started.token;
          setWebToken(token);
          try {
            localStorage.setItem(WEB_CHAT_TOKEN_KEY, token);
          } catch {
            // ignore storage errors
          }
        }

        const [catRes, threadRes] = await Promise.all([
          ktnApi.getWebConsultationCatalog().catch(() => ({ courses: [], checkoutEnabled: true })),
          ktnApi.getWebConsultationThread(token).catch(() => null),
        ]);
        if (!active) return;
        setCatalog(catRes.courses || []);
        setCheckoutEnabled(catRes.checkoutEnabled);
        if (catRes.courses?.[0]?.id && !orderCourseId) {
          setOrderCourseId(catRes.courses[0].id);
        }
        if (threadRes) {
          applyThreadSnapshot(threadRes, token, false);
        }
      } catch {
        // Keep initial quick-reply menu functional even if backend offline
      }
    };

    void init();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isDemoMode]);

  useEffect(() => {
    if (!open || !webToken || isDemoMode) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void ktnApi
        .getWebConsultationThread(webToken)
        .then((res) => {
          if (cancelled) return;
          applyThreadSnapshot(res, webToken, false);
        })
        .catch(() => {
          // ignore transient poll failure
        });
    }, 4500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, webToken, isDemoMode]);

  useEffect(() => {
    if (!open || !webToken || !activeOrder?.id || isDemoMode) return;
    let cancelled = false;
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return;
      void ktnApi
        .getWebConsultationOrderStatus(webToken, activeOrder.id)
        .then((st) => {
          if (!cancelled) setActiveOrder(st);
        })
        .catch(() => {
          // ignore transient status poll error
        });
    }, 6500);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [open, webToken, activeOrder?.id, isDemoMode]);

  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ behavior: 'smooth' });
  }, [messages.length]);

  const sendMessage = async (
    body: string,
    menuAction?: string,
    lead?: {
      targetGroup?: string;
      phone?: string;
      goal?: string;
      timeslot?: string;
      name?: string;
    }
  ) => {
    const clean = body.trim();
    if (!clean) return;

    if (!menuAction || menuAction === 'MENU_HANDOFF' || Boolean(lead?.phone)) {
      pendingMenuGuardRef.current = null;
    }
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }

    const optimisticUserMsg: ConsultationMessage = {
      id: nextSyntheticId('local'),
      sender: 'customer',
      body: clean,
      created_at: new Date().toISOString(),
    };
    setMessages((prev) => appendUniqueMessage(prev, optimisticUserMsg));
    setSending(true);

    try {
      if (isDemoMode) {
        const isHandoff = menuAction === 'MENU_HANDOFF';
        if (isHandoff) {
          setStatus('waiting');
          setQuickReplies([]);
        }
        const botMsg: ConsultationMessage = {
          id: nextSyntheticId('demo-bot'),
          sender: 'bot',
          bot_mode: menuAction ? 'scripted' : 'ai',
          ai_mode: menuAction ? 'scripted' : 'simulated',
          body: isHandoff
            ? '[Chuyển tư vấn viên] Em đã chuyển yêu cầu sang tư vấn viên KTN hỗ trợ trực tiếp cho anh/chị ạ.'
            : menuAction
            ? `[Kịch bản] KTN đã ghi nhận lựa chọn "${clean}". Anh/chị có thể để lại SĐT hoặc chọn mục tiếp theo.`
            : '[AI · Giả lập] Khổng Tử Nhí có lộ trình cho trẻ em (YCT/Kids) và người đi làm 1:1. Anh/chị có thể để lại SĐT để nhận tư vấn chi tiết.',
          created_at: new Date().toISOString(),
        };
        setMessages((prev) => appendUniqueMessage(prev, botMsg));
        return;
      }

      let token = webToken;
      if (!token) {
        const started = await ktnApi.startWebConsultation();
        token = started.token;
        setWebToken(token);
        try {
          localStorage.setItem(WEB_CHAT_TOKEN_KEY, token);
        } catch {
          // ignore
        }
      }

      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : nextSyntheticId('req');
      const res = await ktnApi.sendWebConsultationMessage(token, {
        body: clean,
        requestId,
        menuAction,
        lead,
      });

      if (res.status) setStatus(res.status);
      if (res.status && res.status !== 'bot') {
        pendingMenuGuardRef.current = null;
        setQuickReplies([]);
      } else if (Array.isArray(res.menu) && res.menu.length > 0) {
        if (res.reply) pendingMenuGuardRef.current = null;
        setQuickReplies(res.menu);
      }
      if (res.reply) {
        pendingMenuGuardRef.current = null;
        setMessages((prev) => appendUniqueMessage(prev, res.reply!));
      } else {
        const threadRes = await ktnApi.getWebConsultationThread(token);
        applyThreadSnapshot(threadRes, token, true);
      }
    } catch (err) {
      addToast({
        title: tr('Không gửi được tin nhắn', 'Failed to send message'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSending(false);
    }
  };

  const handleQuickReply = (qr: ConsultationQuickReply) => {
    const action =
      qr.action ||
      (qr.payload === 'OPEN_ORDER_FORM' || qr.id === 'pay_guide'
        ? 'OPEN_ORDER_FORM'
        : qr.payload === 'MENU_ROOT' || qr.id === 'back_root'
          ? 'MENU_ROOT'
          : qr.id.startsWith('MENU_FAQ') || qr.id.startsWith('FAQ_')
            ? 'MENU_FAQ'
            : qr.id);
    if (action === 'OPEN_ORDER_FORM') {
      setShowOrderForm(true);
      return;
    }
    if (action === 'MENU_NEED_PHONE') {
      setShowNeedPhoneForm(true);
    }
    if (
      action === 'MENU_ROOT' ||
      action === 'MENU_FAQ' ||
      action === 'MENU_NEED_PHONE' ||
      action === 'MENU_PAYMENT'
    ) {
      pendingMenuGuardRef.current = { expectedState: action as WebChatbotMenuKey, setAt: Date.now() };
      setQuickReplies(buildQuickReplyMenu(action as WebChatbotMenuKey, lang));
    }
    if (qr.payload && (qr.payload !== 'MENU_ROOT' || (!isDemoMode && action === 'MENU_ROOT'))) {
      void sendMessage(qr.payload, action);
    }
  };

  const handleSubmitNeedPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingPhoneRef.current || sending) return;
    setPhoneError(null);
    if (!validateVnPhone(needPhone)) {
      setPhoneError(
        tr('Số điện thoại Việt Nam chưa hợp lệ (vd: 0901234567).', 'Invalid VN phone number.')
      );
      return;
    }
    submittingPhoneRef.current = true;
    try {
      const normalizedPhone = normalizeVnPhone(needPhone);
      const trimmedGoal = needNote.trim();
      const summary = `Nhu cầu: ${needTarget}${trimmedGoal ? ` - ${trimmedGoal}` : ''} | SĐT: ${needPhone.trim()}`;
      await sendMessage(summary, 'MENU_NEED_PHONE', {
        targetGroup: needTarget,
        phone: normalizedPhone,
        ...(trimmedGoal ? { goal: trimmedGoal } : {}),
      });
      setShowNeedPhoneForm(false);
    } finally {
      submittingPhoneRef.current = false;
    }
  };

  const handleCreateOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (creatingOrderRef.current) return;
    setOrderError(null);
    if (!orderName.trim()) {
      setOrderError(tr('Vui lòng nhập họ tên.', 'Please enter your name.'));
      return;
    }
    if (!validateVnPhone(orderPhone)) {
      setOrderError(tr('Số điện thoại Việt Nam chưa hợp lệ.', 'Invalid VN phone number.'));
      return;
    }
    creatingOrderRef.current = true;
    setCreatingOrder(true);
    try {
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : nextSyntheticId('req');
      if (isDemoMode) {
        const id = `ORD-${String(Date.now()).slice(-6)}`;
        setActiveOrder({
          id,
          amount: 963000,
          paymentStatus: 'pending_verification',
          accessStatus: 'pending',
          payment: {
            bankId: 'MB',
            bankName: 'MB Bank',
            accountNo: '0909123456',
            accountName: 'HOC VIEN KHONG TU NHI',
            amount: 963000,
            transferContent: `KTN ${id}`,
            qrUrl: `https://img.vietqr.io/image/MB-0909123456-compact2.png?amount=963000&addInfo=KTN%20${id}`,
          },
        });
        setShowOrderForm(false);
        return;
      }

      let token = webToken;
      if (!token) {
        const started = await ktnApi.startWebConsultation();
        token = started.token;
        setWebToken(token);
        try {
          localStorage.setItem(WEB_CHAT_TOKEN_KEY, token);
        } catch {
          // ignore
        }
      }
      const created = await ktnApi.createWebConsultationOrder(token, {
        courseId: orderCourseId || catalog[0]?.id || '',
        name: orderName.trim(),
        email: orderEmail.trim(),
        phone: normalizeVnPhone(orderPhone),
        requestId,
      });
      setActiveOrder({
        id: created.id,
        amount: created.amount,
        paymentStatus: 'pending_verification',
        accessStatus: 'pending',
        payment: created.payment,
      });
      setShowOrderForm(false);
    } catch (err) {
      setOrderError(
        err instanceof Error ? err.message : tr('Không tạo được đơn.', 'Order failed.')
      );
    } finally {
      creatingOrderRef.current = false;
      setCreatingOrder(false);
    }
  };

  const renderBotBadge = (msg: ConsultationMessage) => {
    if (msg.sender !== 'bot') return null;
    if (msg.bot_mode === 'handoff') {
      return (
        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[9px] font-bold text-amber-950">
          [Chuyển tư vấn viên]
        </span>
      );
    }
    if (msg.bot_mode === 'scripted' || msg.ai_mode === 'scripted') {
      return (
        <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[9px] font-bold text-emerald-900">
          [Kịch bản]
        </span>
      );
    }
    if (msg.ai_mode === 'simulated') {
      return (
        <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-900">
          [AI · Giả lập]
        </span>
      );
    }
    return (
      <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[9px] font-bold text-indigo-900">
        [AI]
      </span>
    );
  };

  const panelBody = (
    <div
      data-testid="web-chatbot-panel"
      className={`flex flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl ${
        mode === 'page' ? 'mx-auto h-[82vh] max-w-2xl' : 'h-[520px] w-[350px] sm:w-[390px]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center justify-between bg-gradient-to-r from-red-900 to-red-800 px-4 py-3 text-white">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-400 font-display text-xs font-extrabold text-stone-950">
            KTN
          </div>
          <div>
            <p className="font-display text-xs font-extrabold">
              {tr('Trợ lý Tư vấn KTN', 'KTN Consultation Assistant')}
            </p>
            <p className="text-[10px] text-red-100">
              {status === 'waiting' || status === 'open'
                ? tr('Đang kết nối tư vấn viên', 'Connected with advisor')
                : tr('Kịch bản nhanh + AI hỗ trợ 24/7', 'Scripted Menu + AI Support')}
            </p>
          </div>
        </div>
        {mode === 'floating' && (
          <button
            type="button"
            data-testid="web-chatbot-close-btn"
            onClick={() => setOpen(false)}
            className="rounded-lg p-1 text-red-100 hover:bg-white/15"
            aria-label={tr('Đóng chatbot', 'Close chatbot')}
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 space-y-2.5 overflow-y-auto bg-[#FAF8F5] p-3 text-xs">
        {messages.map((msg) => {
          const isCustomer = msg.sender === 'customer';
          return (
            <div
              key={msg.id}
              data-testid={`web-chatbot-msg-${msg.id}`}
              className={`flex ${isCustomer ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 shadow-2xs ${
                  isCustomer
                    ? 'bg-red-800 text-white'
                    : 'border border-stone-200 bg-white text-stone-900'
                }`}
              >
                {!isCustomer && (
                  <div className="mb-1 flex items-center gap-1">
                    <Sparkles className="h-3 w-3 text-red-700" />
                    <span className="text-[10px] font-bold text-stone-600">
                      {msg.sender === 'bot' ? 'KTN Bot' : tr('Tư vấn viên', 'Advisor')}
                    </span>
                    {renderBotBadge(msg)}
                  </div>
                )}
                <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>
              </div>
            </div>
          );
        })}

        {/* Active VietQR Order Status Card */}
        {activeOrder && (
          <div
            data-testid="web-chatbot-order-card"
            className="rounded-2xl border border-emerald-300 bg-emerald-50 p-3 text-xs shadow-2xs"
          >
            <div className="flex items-center justify-between">
              <span className="font-mono font-extrabold text-red-900">{activeOrder.id}</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-white px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                <CheckCircle2 className="h-3 w-3" />
                {activeOrder.paymentStatus}
              </span>
            </div>
            <p className="mt-1 font-bold text-stone-900">{formatVnd(activeOrder.amount)}</p>
            {activeOrder.payment && isSafeVietQrUrl(activeOrder.payment.qrUrl) && (
              <div className="mt-2 flex items-center gap-2.5">
                <img
                  src={activeOrder.payment.qrUrl}
                  alt={`VietQR ${activeOrder.id}`}
                  className="h-24 w-24 rounded-xl border border-stone-200 bg-white object-contain p-1"
                />
                <div className="space-y-0.5 text-[11px] text-stone-800">
                  <p className="font-bold">{activeOrder.payment.bankName}</p>
                  <p className="font-mono">
                    {activeOrder.payment.accountNo || activeOrder.payment.accountNumber}
                  </p>
                  <p className="rounded bg-amber-100 px-1.5 py-0.5 font-mono font-bold text-amber-950">
                    {activeOrder.payment.transferContent}
                  </p>
                </div>
              </div>
            )}
            {!isDemoMode && webToken && (
              <button
                type="button"
                data-testid="web-chatbot-refresh-order-btn"
                onClick={() => {
                  void ktnApi
                    .getWebConsultationOrderStatus(webToken, activeOrder.id)
                    .then((st) => setActiveOrder(st))
                    .catch((err) => {
                      addToast({
                        title: tr(
                          'Không kiểm tra được trạng thái thanh toán',
                          'Failed to refresh payment status'
                        ),
                        description: err instanceof Error ? err.message : undefined,
                        variant: 'error',
                      });
                    });
                }}
                className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 hover:underline"
              >
                <RefreshCw className="h-3 w-3" />
                <span>{tr('Kiểm tra trạng thái thanh toán', 'Refresh payment status')}</span>
              </button>
            )}
          </div>
        )}

        {/* Need & VN Phone Capture Form */}
        {showNeedPhoneForm && (
          <form
            onSubmit={handleSubmitNeedPhone}
            data-testid="web-chatbot-need-phone-form"
            className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 font-bold text-stone-900">
                <Phone className="h-3.5 w-3.5 text-red-800" />
                <span>{tr('Để lại nhu cầu & SĐT', 'Leave Need & Phone')}</span>
              </p>
              <button
                type="button"
                onClick={() => setShowNeedPhoneForm(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {phoneError && <p className="font-semibold text-red-700">{phoneError}</p>}
            <select
              value={needTarget}
              onChange={(e) => setNeedTarget(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            >
              <option value="Lớp cho bé (5-12 tuổi)">{tr('Lớp cho bé (5-12 tuổi)', 'Kids (5-12y)')}</option>
              <option value="Người đi làm 1:1">{tr('Người đi làm 1:1', 'Working Adults 1:1')}</option>
              <option value="Ôn thi HSK / YCT">{tr('Ôn thi HSK / YCT', 'HSK / YCT Prep')}</option>
            </select>
            <input
              type="text"
              data-testid="web-chatbot-phone-input"
              value={needPhone}
              onChange={(e) => setNeedPhone(e.target.value)}
              placeholder="0901234567"
              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={needNote}
              onChange={(e) => setNeedNote(e.target.value)}
              placeholder={tr('Mục tiêu hoặc khung giờ mong muốn...', 'Goal or preferred schedule...')}
              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              data-testid="web-chatbot-phone-submit-btn"
              disabled={sending}
              className="w-full rounded-xl bg-red-800 py-1.5 font-bold text-white hover:bg-red-900 disabled:opacity-50"
            >
              {tr('Gửi thông tin tư vấn', 'Submit Need & Phone')}
            </button>
          </form>
        )}

        {/* VietQR Order Form */}
        {showOrderForm && checkoutEnabled && (
          <form
            onSubmit={handleCreateOrder}
            data-testid="web-chatbot-order-form"
            className="space-y-2 rounded-2xl border border-stone-200 bg-white p-3"
          >
            <div className="flex items-center justify-between">
              <p className="flex items-center gap-1 font-bold text-stone-900">
                <QrCode className="h-3.5 w-3.5 text-red-800" />
                <span>{tr('Tạo đơn thanh toán VietQR', 'Create VietQR Order')}</span>
              </p>
              <button
                type="button"
                onClick={() => setShowOrderForm(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            {orderError && <p className="font-semibold text-red-700">{orderError}</p>}
            <select
              value={orderCourseId}
              onChange={(e) => setOrderCourseId(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
            >
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title} ({formatVnd(c.price)})
                </option>
              ))}
            </select>
            <input
              type="text"
              data-testid="web-chatbot-order-name-input"
              value={orderName}
              onChange={(e) => setOrderName(e.target.value)}
              placeholder={tr('Họ tên học viên / phụ huynh', 'Full name')}
              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
            <input
              type="email"
              data-testid="web-chatbot-order-email-input"
              value={orderEmail}
              onChange={(e) => setOrderEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              data-testid="web-chatbot-order-phone-input"
              value={orderPhone}
              onChange={(e) => setOrderPhone(e.target.value)}
              placeholder="0901234567"
              className="w-full rounded-lg border border-stone-200 px-2.5 py-1.5 text-xs"
            />
            <button
              type="submit"
              data-testid="web-chatbot-order-submit-btn"
              disabled={creatingOrder}
              className="w-full rounded-xl bg-red-800 py-1.5 font-bold text-white hover:bg-red-900 disabled:opacity-50"
            >
              {tr('Tạo mã QR thanh toán', 'Generate VietQR')}
            </button>
          </form>
        )}

        <div ref={listEndRef} />
      </div>

      {/* Scripted Quick-Reply Menu */}
      {status === 'bot' && quickReplies.length > 0 && (
        <div className="flex flex-wrap gap-1 border-t border-stone-200 bg-stone-50 px-3 py-2">
          {quickReplies.map((qr) => (
            <button
              key={qr.id}
              type="button"
              data-testid={`web-chatbot-qr-${qr.id}`}
              onClick={() => handleQuickReply(qr)}
              className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-50"
            >
              {qr.label}
            </button>
          ))}
        </div>
      )}

      {/* Free-text Input */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const text = inputText;
          setInputText('');
          void sendMessage(text);
        }}
        className="flex items-center gap-2 border-t border-stone-200 bg-white p-2.5"
      >
        <input
          type="text"
          data-testid="web-chatbot-input"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          maxLength={4000}
          placeholder={tr('Nhắn câu hỏi của anh/chị...', 'Ask your question...')}
          className="flex-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs focus:border-red-800 focus:bg-white focus:outline-none"
        />
        <button
          type="submit"
          data-testid="web-chatbot-send-btn"
          disabled={sending || !inputText.trim()}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-800 text-white hover:bg-red-900 disabled:opacity-40"
          aria-label={tr('Gửi', 'Send')}
        >
          {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </form>
    </div>
  );

  if (mode === 'page') {
    return (
      <div data-testid="web-chatbot-page" className="min-h-screen bg-[#FAF8F5] px-3 py-6">
        {panelBody}
      </div>
    );
  }

  return (
    <div className="fixed bottom-16 right-4 z-40 lg:bottom-5">
      {open ? (
        panelBody
      ) : (
        <button
          type="button"
          data-testid="web-chatbot-launcher-btn"
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-2 rounded-full bg-red-800 px-4 py-2.5 text-xs font-extrabold text-white shadow-lg transition-transform hover:scale-105 hover:bg-red-900"
        >
          <MessageCircle className="h-4 w-4 text-amber-300" />
          <span>{tr('Tư vấn KTN', 'KTN Chatbot')}</span>
        </button>
      )}
    </div>
  );
};

export const WebChatbotPage: React.FC = () => <WebChatbotWidget mode="page" />;
