import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowLeft,
  Phone,
  Mail,
  User,
  Users,
  CreditCard,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  MessageSquare,
  ExternalLink,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  FileText,
  Sparkles,
  QrCode,
  Send,
} from 'lucide-react';
import { getLeadSourceBadgeMeta } from './leadSourceMeta';
import { isSafeVietQrUrl } from '@/features/consultations/utils/consultationHelpers';
import { useUiStore } from '@/stores/useUiStore';
import {
  buildCourseDurationPreset,
  formatCourseDurationPresetLabel,
  formatVnd,
  getCourseDurationPresetOptions,
  getCourseDurationUnitOptions,
  parseCourseDurationPreset,
  type CourseDurationUnitOption,
} from '@/lib/utils';
import {
  translateCourseTitle,
  translateScheduleText,
  trStatic,
  useI18n,
  type AppLanguage,
} from '@/i18n';
import type {
  CourseDurationPreset,
  KtnClassItem,
  KtnOrder,
  OrderAccountDetailedStatus,
  OrderContactStatus,
  OrderPaymentDetailedStatus,
} from '@/types/ktn.types';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface OrderDetailDrawerProps {
  order: KtnOrder | null;
  open: boolean;
  onClose: () => void;
  classesList: KtnClassItem[];
  isUpdatingOrder: boolean;
  isApprovingOrder: boolean;
  actionError: string | null;
  ephemeralPassword?: string | null;
  onClearError: () => void;
  onUpdateOrder: (params: {
    orderId: string;
    studentName?: string;
    parentName?: string;
    studentEmail?: string;
    phone?: string;
    contactStatus?: OrderContactStatus;
    consultationNote?: string;
    paymentDetailedStatus?: OrderPaymentDetailedStatus;
    paymentTxRef?: string;
    paymentReceivedAmount?: number;
    credentialHandedOff?: boolean;
    cancelOrder?: boolean;
    assignedAdvisor?: string | null;
  }) => Promise<unknown>;
  onApproveOrder: (params: {
    orderId: string;
    classCode?: string;
    studentEmail?: string;
    durationPreset?: CourseDurationPreset;
  }) => Promise<unknown>;
  onOpenStudentProfile: (email: string) => void;
  onOpenConsultation?: (consultationId: string) => void;
  onSendQrToThread?: (payload: {
    consultationId: string;
    requestId: string;
    body: string;
  }) => Promise<unknown>;
  onRetryPayment?: (payload: {
    consultationId: string;
    orderId: string;
    transactionId: string;
  }) => Promise<unknown>;
}

export const CONTACT_STATUS_META: Record<
  OrderContactStatus,
  { label: string; badgeClass: string }
> = {
  not_called: {
    label: 'Chưa gọi',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  called: {
    label: 'Đã gọi tư vấn',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
  },
  no_answer: {
    label: 'Không nghe máy',
    badgeClass: 'bg-orange-100 text-orange-900 border-orange-200',
  },
  callback: {
    label: 'Hẹn gọi lại',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  callback_scheduled: {
    label: 'Hẹn gọi lại',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
};

export const PAYMENT_STATUS_META: Record<
  OrderPaymentDetailedStatus,
  { label: string; badgeClass: string }
> = {
  unpaid: {
    label: 'Chưa thanh toán',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  customer_reported: {
    label: 'Khách báo đã chuyển khoản',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  checking_tx: {
    label: 'Chờ kiểm tra giao dịch',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  verifying_tx: {
    label: 'Chờ kiểm tra giao dịch',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  verified_paid: {
    label: 'Đã xác minh tiền thực nhận',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  refunded: {
    label: 'Hoàn tiền',
    badgeClass: 'bg-purple-100 text-purple-900 border-purple-200',
  },
  mismatch: {
    label: 'Thanh toán sai/thiếu',
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
  },
  amount_mismatch: {
    label: 'Thanh toán sai/thiếu',
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
  },
};

export const ACCOUNT_STATUS_META: Record<
  OrderAccountDetailedStatus,
  { label: string; badgeClass: string }
> = {
  no_account: {
    label: 'Chưa có tài khoản',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  },
  existing_account: {
    label: 'Tài khoản đã tồn tại',
    badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
  },
  pending_account_creation: {
    label: 'Chờ tạo tài khoản',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  pending_creation: {
    label: 'Chờ tạo tài khoản',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-200',
  },
  activated: {
    label: 'Đã kích hoạt',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
  sync_error: {
    label: 'Đồng bộ lỗi',
    badgeClass: 'bg-red-100 text-red-900 border-red-300',
  },
  awaiting_password_or_handoff: {
    label: 'Đang chờ học viên thiết lập mật khẩu / đã bàn giao',
    badgeClass: 'bg-amber-100 text-amber-900 border-amber-300',
  },
  credentials_handed_off: {
    label: 'Đã bàn giao thông tin đăng nhập',
    badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300',
  },
};

export function getContactStatusMeta(
  lang: AppLanguage
): Record<OrderContactStatus, { label: string; badgeClass: string }> {
  if (lang !== 'en') return CONTACT_STATUS_META;
  return {
    not_called: {
      label: trStatic('Chưa gọi', 'Not called', lang),
      badgeClass: CONTACT_STATUS_META.not_called.badgeClass,
    },
    called: {
      label: trStatic('Đã gọi tư vấn', 'Called', lang),
      badgeClass: CONTACT_STATUS_META.called.badgeClass,
    },
    no_answer: {
      label: trStatic('Không nghe máy', 'No answer', lang),
      badgeClass: CONTACT_STATUS_META.no_answer.badgeClass,
    },
    callback: {
      label: trStatic('Hẹn gọi lại', 'Callback scheduled', lang),
      badgeClass: CONTACT_STATUS_META.callback.badgeClass,
    },
    callback_scheduled: {
      label: trStatic('Hẹn gọi lại', 'Callback scheduled', lang),
      badgeClass: CONTACT_STATUS_META.callback_scheduled.badgeClass,
    },
  };
}

export function getPaymentStatusMeta(
  lang: AppLanguage
): Record<OrderPaymentDetailedStatus, { label: string; badgeClass: string }> {
  if (lang !== 'en') return PAYMENT_STATUS_META;
  return {
    unpaid: {
      label: 'Unpaid',
      badgeClass: PAYMENT_STATUS_META.unpaid.badgeClass,
    },
    customer_reported: {
      label: 'Transfer reported',
      badgeClass: PAYMENT_STATUS_META.customer_reported.badgeClass,
    },
    checking_tx: {
      label: 'Verifying tx',
      badgeClass: PAYMENT_STATUS_META.checking_tx.badgeClass,
    },
    verifying_tx: {
      label: 'Verifying tx',
      badgeClass: PAYMENT_STATUS_META.verifying_tx.badgeClass,
    },
    verified_paid: {
      label: 'Payment verified',
      badgeClass: PAYMENT_STATUS_META.verified_paid.badgeClass,
    },
    refunded: {
      label: 'Refunded',
      badgeClass: PAYMENT_STATUS_META.refunded.badgeClass,
    },
    mismatch: {
      label: 'Amount mismatch',
      badgeClass: PAYMENT_STATUS_META.mismatch.badgeClass,
    },
    amount_mismatch: {
      label: 'Amount mismatch',
      badgeClass: PAYMENT_STATUS_META.amount_mismatch.badgeClass,
    },
  };
}

export function getAccountStatusMeta(
  lang: AppLanguage
): Record<OrderAccountDetailedStatus, { label: string; badgeClass: string }> {
  if (lang !== 'en') return ACCOUNT_STATUS_META;
  return {
    no_account: {
      label: 'No account',
      badgeClass: ACCOUNT_STATUS_META.no_account.badgeClass,
    },
    existing_account: {
      label: 'Existing account',
      badgeClass: ACCOUNT_STATUS_META.existing_account.badgeClass,
    },
    pending_account_creation: {
      label: 'Pending account',
      badgeClass: ACCOUNT_STATUS_META.pending_account_creation.badgeClass,
    },
    pending_creation: {
      label: 'Pending account',
      badgeClass: ACCOUNT_STATUS_META.pending_creation.badgeClass,
    },
    activated: {
      label: 'Activated',
      badgeClass: ACCOUNT_STATUS_META.activated.badgeClass,
    },
    sync_error: {
      label: 'Sync error',
      badgeClass: ACCOUNT_STATUS_META.sync_error.badgeClass,
    },
    awaiting_password_or_handoff: {
      label: 'Awaiting password / handoff',
      badgeClass: ACCOUNT_STATUS_META.awaiting_password_or_handoff.badgeClass,
    },
    credentials_handed_off: {
      label: 'Credentials handed off',
      badgeClass: ACCOUNT_STATUS_META.credentials_handed_off.badgeClass,
    },
  };
}

export const OrderDetailDrawer: React.FC<OrderDetailDrawerProps> = ({
  order,
  open,
  onClose,
  classesList,
  isUpdatingOrder,
  isApprovingOrder,
  actionError,
  ephemeralPassword,
  onClearError,
  onUpdateOrder,
  onApproveOrder,
  onOpenStudentProfile,
  onOpenConsultation,
  onSendQrToThread,
  onRetryPayment,
}) => {
  const { lang, tr } = useI18n();
  const [qrCopied, setQrCopied] = useState(false);
  const [sendingQr, setSendingQr] = useState(false);
  const [retryingPayment, setRetryingPayment] = useState(false);
  const [localActionError, setLocalActionError] = useState<string | null>(null);
  const [trackedOrderId, setTrackedOrderId] = useState<string | null>(
    () => order?.order_id || null
  );
  const [editEmail, setEditEmail] = useState(() => order?.student_email || '');
  const [editParentName, setEditParentName] = useState(() => order?.parent_name || '');
  const [editPhone, setEditPhone] = useState(
    () => order?.parent_phone || order?.phone || ''
  );
  const [isEditingCustomerInfo, setIsEditingCustomerInfo] = useState(
    () => !order?.student_email
  );

  const [consultationNote, setConsultationNote] = useState(
    () => order?.consultation_note || ''
  );
  const [txRefInput, setTxRefInput] = useState(() => order?.payment_tx_ref || '');
  const [receivedAmountInput, setReceivedAmountInput] = useState(() =>
    String(
      order?.payment_received_amount !== null &&
        order?.payment_received_amount !== undefined
        ? order.payment_received_amount
        : order?.amount || 890000
    )
  );
  const [selectedClassCode, setSelectedClassCode] = useState(
    () => order?.existing_student?.class_code || ''
  );
  const [selectedDurationPreset, setSelectedDurationPreset] = useState<CourseDurationPreset>(
    () => order?.duration_preset || order?.durationPreset || 'unlimited'
  );
  const [showConfirmApproveModal, setShowConfirmApproveModal] = useState(false);

  const currentOrderId = order?.order_id || null;
  if (currentOrderId !== trackedOrderId) {
    setTrackedOrderId(currentOrderId);
    setEditEmail(order?.student_email || '');
    setEditParentName(order?.parent_name || '');
    setEditPhone(order?.parent_phone || order?.phone || '');
    setIsEditingCustomerInfo(!order?.student_email);
    setConsultationNote(order?.consultation_note || '');
    setTxRefInput(order?.payment_tx_ref || '');
    setReceivedAmountInput(
      String(
        order?.payment_received_amount !== null &&
          order?.payment_received_amount !== undefined
          ? order.payment_received_amount
          : order?.amount || 890000
      )
    );
    setSelectedClassCode(order?.existing_student?.class_code || '');
    setSelectedDurationPreset(order?.duration_preset || order?.durationPreset || 'unlimited');
    setShowConfirmApproveModal(false);
    setLocalActionError(null);
  }

  useEffect(() => {
    if (!order) {
      setEditEmail('');
      setEditParentName('');
      setEditPhone('');
      setIsEditingCustomerInfo(false);
      setConsultationNote('');
      setTxRefInput('');
      setReceivedAmountInput('890000');
      setSelectedClassCode('');
      setSelectedDurationPreset('unlimited');
      setShowConfirmApproveModal(false);
      setLocalActionError(null);
      return;
    }
    setLocalActionError(null);
    setEditEmail(order.student_email || '');
    setEditParentName(order.parent_name || '');
    setEditPhone(order.parent_phone || order.phone || '');
    setIsEditingCustomerInfo(!order.student_email);
    setConsultationNote(order.consultation_note || '');
    setTxRefInput(order.payment_tx_ref || '');
    setReceivedAmountInput(
      String(
        order.payment_received_amount !== null &&
          order.payment_received_amount !== undefined
          ? order.payment_received_amount
          : order.amount || 890000
      )
    );
    setSelectedClassCode(order.existing_student?.class_code || '');
    setSelectedDurationPreset(order.duration_preset || order.durationPreset || 'unlimited');
    setShowConfirmApproveModal(false);
  }, [
    order?.order_id,
    order?.student_email,
    order?.parent_name,
    order?.parent_phone,
    order?.phone,
    order?.consultation_note,
    order?.payment_tx_ref,
    order?.payment_received_amount,
    order?.amount,
    order?.existing_student?.class_code,
    order?.duration_preset,
    order?.durationPreset,
  ]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showConfirmApproveModal) {
          setShowConfirmApproveModal(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open, showConfirmApproveModal, onClose]);

  const contactStatus: OrderContactStatus = order?.contact_status || 'not_called';
  const paymentDetailedStatus: OrderPaymentDetailedStatus =
    order?.payment_detailed_status ||
    (order?.payment_status === 'paid' ? 'verified_paid' : 'unpaid');
  const accountDetailedStatus: OrderAccountDetailedStatus =
    order?.account_detailed_status ||
    (order?.approval_status === 'approved' ? 'activated' : 'no_account');

  const contactMetaMap = getContactStatusMeta(lang);
  const paymentMetaMap = getPaymentStatusMeta(lang);
  const accountMetaMap = getAccountStatusMeta(lang);
  const contactMeta = contactMetaMap[contactStatus] || contactMetaMap.not_called;
  const paymentMeta =
    paymentMetaMap[paymentDetailedStatus] || paymentMetaMap.unpaid;
  const accountMeta =
    accountMetaMap[accountDetailedStatus] || accountMetaMap.no_account;

  const isSameTrackedOrder = currentOrderId === trackedOrderId;
  const effectiveEmail = (
    order?.source === 'authenticated_student'
      ? order?.student_email || ''
      : isSameTrackedOrder && isEditingCustomerInfo && editEmail.trim()
        ? editEmail
        : order?.student_email || (isSameTrackedOrder ? editEmail : '') || ''
  )
    .trim()
    .toLowerCase();
  const hasValidEmail = VALID_EMAIL_REGEX.test(effectiveEmail);
  const contactPhone = (order?.parent_phone || order?.phone || '').trim();
  const isSafeHttpUrl = (raw?: string | null): string | null => {
    const clean = String(raw || '').trim();
    if (!clean) return null;
    try {
      const parsed = new URL(clean);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.toString() : null;
    } catch {
      return null;
    }
  };
  const zaloUrl = useMemo(() => {
    const safeExplicit = isSafeHttpUrl(order?.zalo_url);
    if (safeExplicit) return safeExplicit;
    const digits = contactPhone.replace(/[^\d]/g, '');
    return /^0\d{9}$/.test(digits) ? `https://zalo.me/${digits}` : null;
  }, [order?.zalo_url, contactPhone]);

  const isPartialProvisioningFailure =
    order?.provisioning_status === 'partial_failure' ||
    order?.provisioningStatus === 'partial_failure';

  // Compute live activation readiness and block reasons
  const activationCheck = useMemo(() => {
    if (!order) {
      return { canActivate: false, reasons: [tr('Chưa chọn đơn hàng.', 'No order selected.')] };
    }
    if (
      order.approval_status === 'approved' &&
      accountDetailedStatus !== 'sync_error' &&
      !isPartialProvisioningFailure
    ) {
      return {
        canActivate: false,
        reasons: [tr('Đơn hàng này đã được kích hoạt.', 'This order is already activated.')],
      };
    }
    const reasons: string[] = [];
    if (order.approval_status === 'cancelled' || paymentDetailedStatus === 'refunded') {
      reasons.push(
        tr('Đơn hàng đã hủy hoặc đã hoàn tiền.', 'Order has been cancelled or refunded.')
      );
    }
    if (order.course_valid === false) {
      reasons.push(tr('Mã khóa học không hợp lệ.', 'Invalid course code.'));
    }
    if (order.amount_valid === false) {
      reasons.push(
        tr(
          'Số tiền đơn hàng không khớp bảng giá khóa học.',
          'Order amount does not match course price.'
        )
      );
    }
    if (
      order.payment_status !== 'paid' ||
      paymentDetailedStatus !== 'verified_paid'
    ) {
      reasons.push(
        paymentDetailedStatus === 'customer_reported'
          ? tr(
              'Khách mới báo đã chuyển khoản — Học vụ cần kiểm tra sao kê và xác nhận "Đã xác minh tiền thực nhận" trước khi kích hoạt.',
              'Customer reported transfer — Admin must check bank statement and mark "Payment verified" before activation.'
            )
          : tr(
              'Chưa xác minh tiền thực nhận (Trạng thái thanh toán chưa phải "Đã xác minh tiền thực nhận").',
              'Payment not verified yet (Payment status is not "Payment verified").'
            )
      );
    }
    if (!hasValidEmail) {
      reasons.push(
        tr(
          'Chưa có email đăng nhập hợp lệ cho học viên.',
          'Missing a valid login email for the student.'
        )
      );
    }
    const consultationHandled =
      order.source === 'authenticated_student' ||
      contactStatus === 'called' ||
      Boolean((order.consultation_note || '').trim());
    if (!consultationHandled) {
      reasons.push(
        tr(
          'Chưa cập nhật trạng thái chăm sóc (vui lòng gọi phụ huynh và đánh dấu "Đã gọi" hoặc ghi chú tư vấn trước khi kích hoạt).',
          'Contact status not updated (please call parent and mark "Called" or add a note before activation).'
        )
      );
    }
    return {
      canActivate: reasons.length === 0,
      reasons,
    };
  }, [
    order,
    accountDetailedStatus,
    paymentDetailedStatus,
    hasValidEmail,
    contactStatus,
    tr,
  ]);

  if (!open || !order) return null;

  const hasParentName = Boolean(order.parent_name && order.parent_name.trim());
  const parentDisplay = hasParentName
    ? order.parent_name!.trim()
    : tr('Chưa cung cấp', 'Not provided');

  const canOpenStudentDrawer =
    hasValidEmail &&
    (Boolean(order.existing_student) ||
      order.approval_status === 'approved' ||
      accountDetailedStatus === 'existing_account' ||
      accountDetailedStatus === 'activated' ||
      accountDetailedStatus === 'awaiting_password_or_handoff' ||
      accountDetailedStatus === 'credentials_handed_off');

  const handleSaveCustomerInfo = async () => {
    const trimmedEmail = editEmail.trim().toLowerCase();
    if (trimmedEmail && !VALID_EMAIL_REGEX.test(trimmedEmail)) {
      return;
    }
    await onUpdateOrder({
      orderId: order.order_id,
      studentEmail: trimmedEmail,
      parentName: editParentName.trim(),
      phone: editPhone.trim(),
    });
    setIsEditingCustomerInfo(false);
  };

  const handleContactStatusClick = async (nextStatus: OrderContactStatus) => {
    await onUpdateOrder({
      orderId: order.order_id,
      contactStatus: nextStatus,
      consultationNote: consultationNote.trim(),
    });
  };

  const handleSaveConsultationNote = async () => {
    await onUpdateOrder({
      orderId: order.order_id,
      consultationNote: consultationNote.trim(),
    });
  };

  const handlePaymentStatusChange = async (
    nextPaymentStatus: OrderPaymentDetailedStatus
  ) => {
    const parsedAmount = Number(String(receivedAmountInput).replace(/[^\d]/g, ''));
    await onUpdateOrder({
      orderId: order.order_id,
      paymentDetailedStatus: nextPaymentStatus,
      paymentTxRef: txRefInput.trim(),
      paymentReceivedAmount: Number.isFinite(parsedAmount)
        ? parsedAmount
        : order.amount,
    });
  };

  const handleConfirmHandoff = async () => {
    await onUpdateOrder({
      orderId: order.order_id,
      credentialHandedOff: true,
    });
  };

  return (
    <div
      data-testid="order-detail-drawer-backdrop"
      className="fixed inset-0 z-50 flex justify-end bg-stone-950/60 backdrop-blur-[1px]"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tr(`Chi tiết đơn hàng ${order.order_id}`, `Order details ${order.order_id}`)}
        data-testid="order-detail-drawer"
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col bg-stone-50 shadow-2xl sm:max-w-2xl"
      >
        {/* Top Sticky Header */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-white px-4 py-3">
          <div className="flex min-w-0 items-center gap-2.5">
            <button
              type="button"
              data-testid="order-drawer-back-btn"
              onClick={onClose}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100 sm:hidden"
              aria-label={tr('Quay lại danh sách đơn hàng', 'Back to order list')}
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <span
                  data-testid="order-drawer-id"
                  className="font-mono text-xs font-extrabold text-red-900 sm:text-sm"
                >
                  {order.order_id}
                </span>
                <span
                  data-testid="order-drawer-source-badge"
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${
                    getLeadSourceBadgeMeta(order.source, order.source_label, lang, 'drawer')
                      .badgeClass
                  }`}
                >
                  {
                    getLeadSourceBadgeMeta(order.source, order.source_label, lang, 'drawer')
                      .label
                  }
                </span>
                <span
                  data-testid="order-drawer-payment-badge"
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${paymentMeta.badgeClass}`}
                >
                  {paymentMeta.label}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-stone-900">
                {order.student_name} · {translateCourseTitle(order.course_name, lang)}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="order-drawer-close-btn"
            onClick={onClose}
            aria-label={tr('Đóng chi tiết đơn hàng', 'Close order details')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 sm:p-4">
          {(actionError || localActionError) && (
            <div
              role="alert"
              data-testid="order-drawer-error-banner"
              className="flex items-start justify-between gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <span>{actionError || localActionError}</span>
              </div>
              <button
                type="button"
                onClick={() => {
                  setLocalActionError(null);
                  onClearError();
                }}
                className="rounded px-1.5 py-0.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
              >
                {tr('Đóng', 'Close')}
              </button>
            </div>
          )}

          {/* SECTION 1: THÔNG TIN KHÁCH HÀNG */}
          <section
            data-testid="order-section-customer"
            className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between border-b border-stone-100 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-800">
                <User className="h-4 w-4 text-red-800" />
                {tr('1. Thông tin khách hàng & khóa học', '1. Customer & Course Info')}
              </h3>
              {order.approval_status !== 'approved' && (
                <button
                  type="button"
                  data-testid="order-toggle-edit-customer-btn"
                  onClick={() => setIsEditingCustomerInfo((prev) => !prev)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                >
                  {isEditingCustomerInfo
                    ? tr('Thu gọn', 'Collapse')
                    : tr('Bổ sung / Sửa TT', 'Edit Info')}
                </button>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  {tr('Tên học viên', 'Student name')}
                </span>
                <p
                  data-testid="order-detail-student-name"
                  className="mt-0.5 font-bold text-stone-900"
                >
                  {order.student_name}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  {tr('Tên phụ huynh', 'Parent name')}
                </span>
                <p
                  data-testid="order-detail-parent-name"
                  className={`mt-0.5 font-bold ${
                    !hasParentName ? 'italic text-stone-400' : 'text-stone-900'
                  }`}
                >
                  {parentDisplay}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  {tr('SĐT phụ huynh (ưu tiên liên hệ)', 'Parent phone (primary contact)')}
                </span>
                <p
                  data-testid="order-detail-phone"
                  className="mt-0.5 font-mono font-bold text-red-900"
                >
                  {contactPhone || tr('Chưa cung cấp', 'Not provided')}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  {tr('Email đăng nhập / nhận tài khoản', 'Login / account email')}
                </span>
                <p
                  data-testid="order-detail-email"
                  className={`mt-0.5 break-all font-bold ${
                    order.student_email ? 'text-stone-900' : 'text-amber-800'
                  }`}
                >
                  {order.student_email ||
                    tr(
                      'Chưa có email (cần bổ sung trước khi kích hoạt)',
                      'No email yet (required before activation)'
                    )}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-stone-500">
                      {tr('Khóa học đăng ký', 'Enrolled course')}
                    </span>
                    <p
                      data-testid="order-detail-course-name"
                      className="mt-0.5 font-bold text-stone-900"
                    >
                      {translateCourseTitle(order.course_name, lang)}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-stone-500">
                      {tr('Học phí đơn / Giá chuẩn', 'Order amount / Standard price')}
                    </span>
                    <p
                      data-testid="order-detail-amount"
                      className="mt-0.5 font-display text-sm font-extrabold text-red-800"
                    >
                      {formatVnd(order.amount)}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t border-stone-200/80 pt-2 text-[11px] text-stone-600">
                  <span>
                    {tr('Phương thức:', 'Method:')} <strong>{order.payment_method || 'VietQR'}</strong>
                  </span>
                  <span>
                    {tr('Nguồn đơn:', 'Source:')}{' '}
                    <strong data-testid="order-detail-source">
                      {
                        getLeadSourceBadgeMeta(order.source, order.source_label, lang, 'drawer')
                          .label
                      }
                    </strong>
                  </span>
                  {(order.assigned_advisor || order.owner_email) && (
                    <span>
                      {tr('Tư vấn viên:', 'Advisor:')}{' '}
                      <strong data-testid="order-detail-advisor">
                        {order.assigned_advisor || order.owner_email}
                      </strong>
                    </span>
                  )}
                  {order.consultation_id && (
                    <button
                      type="button"
                      data-testid="order-open-consultation-btn"
                      onClick={() => onOpenConsultation?.(order.consultation_id!)}
                      className="inline-flex items-center gap-1 rounded-md border border-sky-200 bg-sky-50 px-2 py-0.5 font-mono text-[10px] font-bold text-sky-900 hover:bg-sky-100"
                    >
                      <MessageSquare className="h-3 w-3" />
                      <span>{order.consultation_id}</span>
                    </button>
                  )}
                  <span>
                    {tr('Ngày tạo:', 'Created:')}{' '}
                    <strong>
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString(
                            lang === 'en' ? 'en-US' : 'vi-VN'
                          )
                        : '—'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/70 p-2.5 sm:col-span-2">
                <span className="text-[11px] font-semibold text-amber-900">
                  {tr('Ghi chú của khách hàng / phụ huynh:', 'Customer / Parent note:')}
                </span>
                <p
                  data-testid="order-detail-customer-note"
                  className="mt-0.5 text-xs text-stone-800"
                >
                  {order.customer_note ? order.customer_note : tr('Không có ghi chú.', 'No notes.')}
                </p>
              </div>
            </div>

            {/* Inline Customer Info Editor (Email / Parent Name / Phone) */}
            {isEditingCustomerInfo && (
              <div
                data-testid="order-customer-edit-panel"
                className="mt-3 space-y-2.5 rounded-xl border border-red-200 bg-red-50/40 p-3"
              >
                <p className="text-[11px] font-bold text-red-900">
                  {tr(
                    'Cập nhật thông tin phụ huynh & Email cấp tài khoản học viên:',
                    'Update parent info & student login email:'
                  )}
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Email đăng nhập *', 'Login email *')}
                    </label>
                    <input
                      type="email"
                      data-testid="order-edit-email-input"
                      readOnly={order.source === 'authenticated_student'}
                      disabled={order.source === 'authenticated_student'}
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder={tr('phuhuynh@gmail.com', 'parent@example.com')}
                      className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        order.source === 'authenticated_student'
                          ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-600'
                          : 'border-stone-300 bg-white text-stone-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Tên phụ huynh', 'Parent name')}
                    </label>
                    <input
                      type="text"
                      data-testid="order-edit-parent-input"
                      value={editParentName}
                      onChange={(e) => setEditParentName(e.target.value)}
                      placeholder={tr('VD: Chị Lan (Mẹ bé)', 'e.g. Ms. Lan (Mother)')}
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('SĐT liên hệ', 'Contact phone')}
                    </label>
                    <input
                      type="tel"
                      data-testid="order-edit-phone-input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0912345678"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    data-testid="order-save-customer-info-btn"
                    disabled={isUpdatingOrder}
                    onClick={handleSaveCustomerInfo}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isUpdatingOrder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    {tr('Lưu thông tin khách', 'Save customer info')}
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* SECTION 2: HÀNH ĐỘNG LIÊN HỆ & TƯ VẤN */}
          <section
            data-testid="order-section-contact"
            className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-800">
                <Phone className="h-4 w-4 text-red-800" />
                {tr('2. Liên hệ phụ huynh & Chăm sóc tư vấn', '2. Parent Contact & Consultation')}
              </h3>
              <span
                data-testid="order-drawer-contact-badge"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${contactMeta.badgeClass}`}
              >
                {contactMeta.label}
              </span>
            </div>

            {/* Call & Zalo Direct Actions */}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              {contactPhone && (
                <a
                  href={`tel:${contactPhone.replace(/[^\d+]/g, '')}`}
                  data-testid="order-call-tel-link"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800"
                >
                  <Phone className="h-3.5 w-3.5" />
                  <span>{tr(`Gọi điện (${contactPhone})`, `Call (${contactPhone})`)}</span>
                </a>
              )}

              {zaloUrl && (
                <a
                  href={zaloUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="order-zalo-link"
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-bold text-sky-900 hover:bg-sky-100"
                >
                  <ExternalLink className="h-3.5 w-3.5" />
                  <span>{tr('Nhắn Zalo phụ huynh', 'Message via Zalo')}</span>
                </a>
              )}

              {(
                [
                  { id: 'called', label: tr('Đã gọi', 'Called') },
                  { id: 'no_answer', label: tr('Không nghe máy', 'No answer') },
                  { id: 'callback_scheduled', label: tr('Hẹn gọi lại', 'Callback') },
                ] as const
              ).map((btn) => (
                <button
                  key={btn.id}
                  type="button"
                  data-testid={`order-contact-btn-${btn.id}`}
                  disabled={isUpdatingOrder}
                  onClick={() => handleContactStatusClick(btn.id)}
                  className={`min-h-[36px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                    contactStatus === btn.id
                      ? 'bg-red-800 text-white'
                      : 'border border-stone-300 bg-stone-50 text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  {btn.label}
                </button>
              ))}
            </div>

            {/* Consultation Note */}
            <div className="mt-3 space-y-2">
              <label className="block text-[11px] font-bold text-stone-700">
                {tr('Ghi chú tư vấn của Học vụ:', 'Academic advisor consultation note:')}
              </label>
              <textarea
                rows={2}
                data-testid="order-consultation-note-input"
                value={consultationNote}
                onChange={(e) => setConsultationNote(e.target.value)}
                placeholder={tr(
                  'Ghi kết quả cuộc gọi, khung giờ phụ huynh muốn học, hoặc thông tin xuất hóa đơn...',
                  'Record call result, preferred class hours, or invoice details...'
                )}
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-stone-500">
                  {order.contact_updated_at
                    ? tr(
                        `Cập nhật lần cuối: ${new Date(order.contact_updated_at).toLocaleString('vi-VN')} (${order.contact_updated_by || 'Học vụ'})`,
                        `Last updated: ${new Date(order.contact_updated_at).toLocaleString('en-US')} (${order.contact_updated_by || 'Academic Admin'})`
                      )
                    : tr('Chưa có lịch sử cuộc gọi.', 'No call history yet.')}
                </span>
                <button
                  type="button"
                  data-testid="order-save-consultation-note-btn"
                  disabled={isUpdatingOrder}
                  onClick={handleSaveConsultationNote}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-bold text-stone-800 hover:bg-stone-100"
                >
                  {tr('Lưu ghi chú tư vấn', 'Save note')}
                </button>
              </div>
            </div>
          </section>

          {/* SECTION 3: ĐỐI SOÁT & XÁC MINH THANH TOÁN */}
          <section
            data-testid="order-section-payment"
            className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-800">
                <CreditCard className="h-4 w-4 text-red-800" />
                {tr(
                  '3. Xác minh thanh toán & Đối chiếu giao dịch',
                  '3. Payment Verification & Reconciliation'
                )}
              </h3>
              <span
                data-testid="order-payment-detailed-status"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${paymentMeta.badgeClass}`}
              >
                {paymentMeta.label}
              </span>
            </div>

            {(() => {
              const paymentInfo = order.paymentInfo || order.payment_info || null;
              const accountNo = paymentInfo?.accountNo || paymentInfo?.accountNumber || '';
              const safeQrUrl =
                paymentInfo?.qrUrl && isSafeVietQrUrl(paymentInfo.qrUrl)
                  ? paymentInfo.qrUrl
                  : '';
              const qrSummary = paymentInfo
                ? [
                    `Mã đơn: ${order.order_id}`,
                    `Số tiền: ${formatVnd(paymentInfo.amount || order.amount)}`,
                    `Ngân hàng: ${paymentInfo.bankName || paymentInfo.bankId} - STK: ${accountNo}`,
                    `Nội dung CK: ${paymentInfo.transferContent}`,
                    safeQrUrl ? `VietQR: ${safeQrUrl}` : '',
                  ]
                    .filter(Boolean)
                    .join('\n')
                : '';

              const sepayTxRef = String(order.payment_tx_ref || '').trim();
              const hasValidSepayTxRef = /^sepay:\d{1,32}$/.test(sepayTxRef);

              const showRetryBtn =
                order.payment_status === 'paid' &&
                (isPartialProvisioningFailure ||
                  accountDetailedStatus === 'sync_error') &&
                Boolean(order.consultation_id) &&
                Boolean(onRetryPayment);

              if (!paymentInfo && !showRetryBtn) return null;

              return (
                <div className="mt-2.5 space-y-2">
                  {paymentInfo && (
                    <div
                      data-testid="order-vietqr-preview-card"
                      className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                        {safeQrUrl && (
                          <img
                            src={safeQrUrl}
                            alt={`VietQR ${order.order_id}`}
                            className="h-28 w-28 shrink-0 rounded-xl border border-stone-200 bg-white object-contain p-1"
                          />
                        )}
                        <div className="min-w-0 flex-1 space-y-1 text-[11px] text-stone-700">
                          <p className="flex items-center gap-1 font-bold text-stone-900">
                            <QrCode className="h-3.5 w-3.5 text-red-800" />
                            <span>
                              {paymentInfo.bankName || paymentInfo.bankId} ·{' '}
                              <span className="font-mono">{accountNo}</span>
                            </span>
                          </p>
                          <p>{paymentInfo.accountName}</p>
                          <p className="font-bold text-red-900">
                            {formatVnd(paymentInfo.amount || order.amount)}
                          </p>
                          <p className="inline-block rounded bg-amber-100 px-2 py-0.5 font-mono font-bold text-amber-950">
                            {paymentInfo.transferContent}
                          </p>
                        </div>
                      </div>

                      <div className="mt-2.5 flex flex-wrap gap-2">
                        <button
                          type="button"
                          data-testid="order-copy-vietqr-btn"
                          onClick={async () => {
                            try {
                              await navigator.clipboard?.writeText(qrSummary);
                              setQrCopied(true);
                              setTimeout(() => setQrCopied(false), 2000);
                            } catch {
                              // ignore clipboard errors
                            }
                          }}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-800 hover:bg-stone-100"
                        >
                          <Copy className="h-3 w-3" />
                          <span>
                            {qrCopied
                              ? tr('Đã sao chép QR', 'Copied QR')
                              : tr('Sao chép thông tin VietQR', 'Copy VietQR Info')}
                          </span>
                        </button>

                        {order.consultation_id && onSendQrToThread && (
                          <button
                            type="button"
                            data-testid="order-send-qr-thread-btn"
                            disabled={sendingQr}
                            onClick={async () => {
                              setLocalActionError(null);
                              onClearError();
                              setSendingQr(true);
                              try {
                                const requestId =
                                  typeof crypto !== 'undefined' &&
                                  typeof crypto.randomUUID === 'function'
                                    ? crypto.randomUUID()
                                    : `req-${Date.now()}`;
                                await onSendQrToThread({
                                  consultationId: order.consultation_id!,
                                  requestId,
                                  body: qrSummary,
                                });
                              } catch (err) {
                                const msg =
                                  err instanceof Error
                                    ? err.message
                                    : tr(
                                        'Không thể gửi VietQR vào hội thoại.',
                                        'Failed to send VietQR to thread.'
                                      );
                                setLocalActionError(msg);
                                useUiStore.getState().addToast({
                                  title: tr('Gửi QR thất bại', 'Failed to send QR'),
                                  description: msg,
                                  variant: 'error',
                                });
                              } finally {
                                setSendingQr(false);
                              }
                            }}
                            className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-900 disabled:opacity-50"
                          >
                            <Send className="h-3 w-3" />
                            <span>
                              {tr('Gửi QR qua Zalo OA / Web Chat', 'Send QR to Zalo OA / Web')}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  )}

                  {showRetryBtn && (
                    <div className="space-y-1">
                      <button
                        type="button"
                        data-testid="order-retry-payment-btn"
                        disabled={retryingPayment || !hasValidSepayTxRef}
                        onClick={async () => {
                          if (!hasValidSepayTxRef) return;
                          setLocalActionError(null);
                          onClearError();
                          setRetryingPayment(true);
                          try {
                            await onRetryPayment!({
                              consultationId: order.consultation_id!,
                              orderId: order.order_id,
                              transactionId: sepayTxRef,
                            });
                          } catch (err) {
                            const msg =
                              err instanceof Error
                                ? err.message
                                : tr(
                                    'Không thể thử lại SePay provisioning.',
                                    'Failed to retry SePay provisioning.'
                                  );
                            setLocalActionError(msg);
                            useUiStore.getState().addToast({
                              title: tr('Thử lại thất bại', 'Retry failed'),
                              description: msg,
                              variant: 'error',
                            });
                          } finally {
                            setRetryingPayment(false);
                          }
                        }}
                        className="inline-flex items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <RefreshCw className={`h-3.5 w-3.5 ${retryingPayment ? 'animate-spin' : ''}`} />
                        <span>
                          {tr('Thử kích hoạt lại SePay Provisioning', 'Retry SePay Provisioning')}
                        </span>
                      </button>
                      {!hasValidSepayTxRef && (
                        <p
                          data-testid="order-retry-payment-hint"
                          className="text-[11px] font-medium text-amber-800"
                        >
                          {tr(
                            'Cần mã giao dịch SePay hợp lệ (định dạng sepay:<số>) trên đơn hoặc xử lý từ hàng đợi Đối soát SePay.',
                            'Requires a valid SePay transaction reference (sepay:<id>) on the order, or retry via the SePay Reconciliation queue.'
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Automatic Webhook Proof OR Manual Verification Proof */}
            {order.payment_status === 'paid' && order.payment_proof_auto && (
              <div
                data-testid="order-payment-webhook-proof"
                className="mt-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950"
              >
                <p className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  {tr(
                    'Bằng chứng thanh toán tự động (Webhook ngân hàng đã đối khớp)',
                    'Automatic payment proof (Bank webhook matched)'
                  )}
                </p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                  <span>
                    {tr('Mã GD:', 'Tx ID:')}{' '}
                    <strong className="font-mono">{order.payment_tx_ref || 'AUTO'}</strong>
                  </span>
                  <span>
                    {tr('Số tiền nhận:', 'Received:')}{' '}
                    <strong>{formatVnd(order.payment_received_amount ?? order.amount)}</strong>
                  </span>
                  <span>
                    {tr('Thời điểm:', 'Verified at:')}{' '}
                    <strong>
                      {order.payment_verified_at
                        ? new Date(order.payment_verified_at).toLocaleString(
                            lang === 'en' ? 'en-US' : 'vi-VN'
                          )
                        : tr('Tự động', 'Auto')}
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {order.payment_status === 'paid' && !order.payment_proof_auto && (
              <div
                data-testid="order-payment-manual-proof"
                className="mt-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950"
              >
                <p className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  {tr(
                    'Đã xác minh tiền thực nhận (Đối soát thủ công)',
                    'Payment verified (Manual reconciliation)'
                  )}
                </p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                  <span>
                    {tr('Người xác nhận:', 'Verified by:')}{' '}
                    <strong>
                      {order.payment_verified_by || tr('Quản trị viên', 'Admin')}
                    </strong>
                  </span>
                  <span>
                    {tr('Mã tham chiếu GD:', 'Tx reference:')}{' '}
                    <strong className="font-mono">
                      {order.payment_tx_ref || tr('Đã đối chiếu sao kê', 'Statement matched')}
                    </strong>
                  </span>
                  <span>
                    {tr('Thời điểm:', 'Verified at:')}{' '}
                    <strong>
                      {order.payment_verified_at
                        ? new Date(order.payment_verified_at).toLocaleString(
                            lang === 'en' ? 'en-US' : 'vi-VN'
                          )
                        : '—'}
                    </strong>
                  </span>
                </div>
              </div>
            )}

            {paymentDetailedStatus === 'customer_reported' && (
              <div
                data-testid="order-payment-reported-warning"
                className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950"
              >
                <p className="flex items-center gap-1.5 font-bold text-amber-900">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  {tr(
                    'Khách báo đã chuyển khoản — Chưa coi là đã nhận tiền!',
                    'Customer reported transfer — Not yet verified!'
                  )}
                </p>
                <p className="mt-0.5 text-[11px]">
                  {tr(
                    'Vui lòng kiểm tra biến động số dư / sao kê ngân hàng, nhập Mã giao dịch (Transaction ID) và số tiền thực nhận bên dưới trước khi bấm xác minh.',
                    'Please check your bank statement, enter the Transaction ID and actual amount received below before confirming.'
                  )}
                </p>
              </div>
            )}

            {/* Reconciliation Inputs */}
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  {tr('Số tiền thực nhận (VNĐ) — Chuẩn:', 'Actual amount received (VND) — Expected:')}{' '}
                  {formatVnd(order.server_course_price ?? order.amount)}
                </label>
                <input
                  type="number"
                  data-testid="order-payment-received-amount-input"
                  value={receivedAmountInput}
                  onChange={(e) => setReceivedAmountInput(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  {tr(
                    'Mã giao dịch / Tham chiếu NH (Transaction ID)',
                    'Bank Transaction / Reference ID'
                  )}
                </label>
                <input
                  type="text"
                  data-testid="order-payment-tx-ref-input"
                  value={txRefInput}
                  onChange={(e) => setTxRefInput(e.target.value)}
                  placeholder={tr(
                    'VD: FT26312998811 / VietQR MB...',
                    'e.g. FT26312998811 / VietQR MB...'
                  )}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 font-mono text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Distinct Payment Status Action Buttons */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="order-payment-btn-verified_paid"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('verified_paid')}
                className={`min-h-[34px] rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'verified_paid'
                    ? 'bg-emerald-700 text-white'
                    : 'border border-emerald-300 bg-emerald-50 text-emerald-900 hover:bg-emerald-100'
                }`}
              >
                {tr('✓ Đã xác minh tiền thực nhận', '✓ Payment verified')}
              </button>

              <button
                type="button"
                data-testid="order-payment-btn-verifying_tx"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('verifying_tx')}
                className={`min-h-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'verifying_tx'
                    ? 'bg-sky-700 text-white'
                    : 'border border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {tr('Chờ kiểm tra GD', 'Verifying tx')}
              </button>

              <button
                type="button"
                data-testid="order-payment-btn-customer_reported"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('customer_reported')}
                className={`min-h-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'customer_reported'
                    ? 'bg-amber-600 text-white'
                    : 'border border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {tr('Khách báo đã CK', 'Transfer reported')}
              </button>

              <button
                type="button"
                data-testid="order-payment-btn-amount_mismatch"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('amount_mismatch')}
                className={`min-h-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'amount_mismatch'
                    ? 'bg-red-700 text-white'
                    : 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                }`}
              >
                {tr('Thanh toán sai/thiếu', 'Amount mismatch')}
              </button>

              <button
                type="button"
                data-testid="order-payment-btn-unpaid"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('unpaid')}
                className={`min-h-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'unpaid'
                    ? 'bg-stone-800 text-white'
                    : 'border border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                {tr('Chưa thanh toán', 'Unpaid')}
              </button>

              <button
                type="button"
                data-testid="order-payment-btn-refunded"
                disabled={isUpdatingOrder}
                onClick={() => handlePaymentStatusChange('refunded')}
                className={`min-h-[34px] rounded-xl px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  paymentDetailedStatus === 'refunded'
                    ? 'bg-purple-700 text-white'
                    : 'border border-purple-200 bg-purple-50 text-purple-900 hover:bg-purple-100'
                }`}
              >
                {tr('Hoàn tiền / Hủy', 'Refund / Cancel')}
              </button>
            </div>
          </section>

          {/* SECTION 4: TRẠNG THÁI TÀI KHOẢN & BÀN GIAO MẬT KHẨU */}
          <section
            data-testid="order-section-account"
            className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-800">
                <ShieldCheck className="h-4 w-4 text-red-800" />
                {tr(
                  '4. Trạng thái tài khoản & Cấp quyền khóa học',
                  '4. Account Status & Course Provisioning'
                )}
              </h3>
              <span
                data-testid="order-account-detailed-status"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${accountMeta.badgeClass}`}
              >
                {accountMeta.label}
              </span>
            </div>

            <div className="mt-2.5 space-y-2.5 text-xs">
              {order.existing_student && (
                <div
                  data-testid="order-existing-account-box"
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-sky-200 bg-sky-50/70 p-2.5"
                >
                  <div>
                    <p className="font-bold text-sky-950">
                      {tr('Tài khoản học viên đã tồn tại', 'Existing student account')} (
                      {order.existing_student.code || effectiveEmail})
                    </p>
                    <p className="mt-0.5 text-[11px] text-sky-900">
                      {tr('Khi kích hoạt đơn, hệ thống sẽ ', 'When activated, the system will ')}
                      <strong>{tr('cộng thêm quyền khóa mới', 'grant the new course')}</strong>
                      {tr(' và ', ' and ')}
                      <strong>
                        {tr('giữ nguyên mật khẩu hiện tại', 'keep the existing password')}
                      </strong>
                      {tr(
                        ` cùng các khóa học đã mở (${order.existing_student.online_courses_count || 0} khóa). Không tạo tài khoản thứ hai.`,
                        ` and active courses (${order.existing_student.online_courses_count || 0} courses). No duplicate account is created.`
                      )}
                    </p>
                  </div>
                  {canOpenStudentDrawer && (
                    <button
                      type="button"
                      data-testid="order-open-student-drawer-btn"
                      onClick={() => onOpenStudentProfile(effectiveEmail)}
                      className="inline-flex min-h-[34px] shrink-0 items-center gap-1.5 rounded-xl bg-sky-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-sky-900"
                    >
                      <Users className="h-3.5 w-3.5" />
                      <span>{tr('Mở hồ sơ học viên', 'Open student profile')}</span>
                    </button>
                  )}
                </div>
              )}

              {!order.existing_student && order.approval_status !== 'approved' && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                  <p className="font-bold text-stone-900">
                    {tr('Học viên mới (Chưa có tài khoản trên hệ thống)', 'New student (No account yet)')}
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-600">
                    {tr(
                      'Sau khi bấm “Xác nhận & Kích hoạt khóa học”, hệ thống sẽ tạo tài khoản học viên trên Cognito + izTeach + Supabase và cấp mật khẩu khởi tạo an toàn dùng 1 lần để Học vụ bàn giao cho phụ huynh.',
                      'After clicking "Confirm & Activate Course", the system creates an account across Cognito + izTeach + Supabase with a one-time initial password for parent handoff.'
                    )}
                  </p>
                </div>
              )}

              {/* Phase 3: Post-Activation Account & Credential Handoff Status */}
              {order.approval_status === 'approved' && (
                <div
                  data-testid="order-post-activation-status"
                  className={`space-y-2 rounded-xl border p-3 ${
                    isPartialProvisioningFailure ||
                    accountDetailedStatus === 'sync_error'
                      ? 'border-amber-300 bg-amber-50/70'
                      : 'border-emerald-200 bg-emerald-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="order-grant-sync-status-badge"
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold ${
                        isPartialProvisioningFailure ||
                        accountDetailedStatus === 'sync_error'
                          ? 'bg-amber-600 text-white'
                          : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {isPartialProvisioningFailure ||
                      accountDetailedStatus === 'sync_error'
                        ? tr('Cần hoàn tất đồng bộ thời hạn', 'Duration sync required')
                        : tr('Đã cấp thành công', 'Provisioned successfully')}
                    </span>
                    <span className="text-[11px] font-bold text-stone-700">
                      {tr('Thời hạn học:', 'Access duration:')}{' '}
                      {formatCourseDurationPresetLabel(
                        order.duration_preset || order.durationPreset || 'unlimited',
                        lang
                      )}
                      {order.limit_time || order.limitTime
                        ? tr(
                            ` (Hạn: ${String(order.limit_time || order.limitTime).slice(0, 10)})`,
                            ` (Expires: ${String(order.limit_time || order.limitTime).slice(0, 10)})`
                          )
                        : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        {tr('1. Tài khoản', '1. Account')}
                      </span>
                      <p className="mt-0.5 font-bold text-emerald-900">
                        {order.account_created
                          ? tr('Tài khoản đã tạo mới', 'New account created')
                          : tr('Tài khoản đã tồn tại (Giữ mật khẩu cũ)', 'Existing account (Password kept)')}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        {tr('2. Bàn giao đăng nhập', '2. Login Handoff')}
                      </span>
                      <p
                        data-testid="order-handoff-stage-text"
                        className="mt-0.5 font-bold text-amber-900"
                      >
                        {order.credential_handed_off || !order.account_created
                          ? tr('Đã bàn giao thông tin đăng nhập', 'Credentials handed off')
                          : tr(
                              'Đang chờ học viên thiết lập mật khẩu / chờ bàn giao',
                              'Awaiting password setup / handoff'
                            )}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        {tr('3. Trạng thái học tập', '3. Learning Status')}
                      </span>
                      <p className="mt-0.5 font-bold text-emerald-900">
                        {isPartialProvisioningFailure ||
                        accountDetailedStatus === 'sync_error'
                          ? tr('Cần hoàn tất đồng bộ thời hạn', 'Duration sync required')
                          : tr('Học viên có thể đăng nhập', 'Student can sign in')}
                      </p>
                    </div>
                  </div>

                  {ephemeralPassword && (
                    <div
                      data-testid="order-ephemeral-password-box"
                      className="rounded-xl border border-amber-300 bg-white p-2.5"
                    >
                      <p className="flex items-center gap-1.5 font-bold text-stone-900">
                        <KeyRound className="h-4 w-4 text-red-800" />
                        {tr(
                          'Mật khẩu khởi tạo dùng 1 lần (chỉ hiển thị trong phiên này, không lưu vào bảng đơn):',
                          'One-time initial password (shown only in this session, not stored in orders):'
                        )}
                      </p>
                      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
                        <code
                          data-testid="order-ephemeral-password-value"
                          className="rounded bg-stone-100 px-2.5 py-1 font-mono text-sm font-extrabold text-red-800"
                        >
                          {ephemeralPassword}
                        </code>
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard
                              ?.writeText(
                                tr(
                                  `Email đăng nhập: ${effectiveEmail}\nMật khẩu khởi tạo: ${ephemeralPassword}`,
                                  `Login email: ${effectiveEmail}\nInitial password: ${ephemeralPassword}`
                                )
                              )
                              .catch(() => {});
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {tr('Sao chép gửi PH', 'Copy for parent')}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                    {order.account_created && !order.credential_handed_off ? (
                      <button
                        type="button"
                        data-testid="order-confirm-handoff-btn"
                        disabled={isUpdatingOrder}
                        onClick={handleConfirmHandoff}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-amber-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-700"
                      >
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        <span>
                          {tr(
                            'Xác nhận đã bàn giao thông tin đăng nhập cho phụ huynh',
                            'Confirm credentials handed off to parent'
                          )}
                        </span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" />
                        {tr(
                          'Đã hoàn tất bàn giao thông tin đăng nhập',
                          'Credential handoff completed'
                        )}
                      </span>
                    )}

                    {canOpenStudentDrawer && (
                      <button
                        type="button"
                        data-testid="order-open-student-drawer-approved-btn"
                        onClick={() => onOpenStudentProfile(effectiveEmail)}
                        className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
                      >
                        <Users className="h-3.5 w-3.5 text-red-800" />
                        <span>{tr('Mở hồ sơ học viên', 'Open student profile')}</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Course Duration Preset & Optional Live Class Assignment on Activation */}
              {(order.approval_status !== 'approved' ||
                isPartialProvisioningFailure ||
                accountDetailedStatus === 'sync_error') && (
                <div className="space-y-2.5">
                  {(() => {
                    const parsedOrderDur = parseCourseDurationPreset(selectedDurationPreset);
                    return (
                      <div
                        data-testid="order-duration-selector"
                        className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-stone-800">
                            {tr('Thời hạn học:', 'Access duration:')}
                          </span>
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                            {formatCourseDurationPresetLabel(selectedDurationPreset, lang)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-600">
                              {tr('Số lượng (1–365)', 'Amount (1–365)')}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              step={1}
                              data-testid="order-duration-value-input"
                              disabled={parsedOrderDur.unit === 'unlimited'}
                              value={parsedOrderDur.unit === 'unlimited' ? '' : parsedOrderDur.value}
                              placeholder={parsedOrderDur.unit === 'unlimited' ? '—' : '1'}
                              onChange={(e) => {
                                const nextUnit =
                                  parsedOrderDur.unit === 'unlimited' ? 'm' : parsedOrderDur.unit;
                                setSelectedDurationPreset(
                                  buildCourseDurationPreset(e.target.value, nextUnit)
                                );
                              }}
                              className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-600">
                              {tr('Đơn vị (Ngày / Tuần / Tháng)', 'Unit (Days / Weeks / Months)')}
                            </label>
                            <select
                              data-testid="order-duration-unit-select"
                              value={parsedOrderDur.unit}
                              onChange={(e) => {
                                const nextUnit = e.target.value as CourseDurationUnitOption;
                                setSelectedDurationPreset(
                                  buildCourseDurationPreset(parsedOrderDur.value || 1, nextUnit)
                                );
                              }}
                              className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800"
                            >
                              {getCourseDurationUnitOptions(lang).map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {getCourseDurationPresetOptions(lang).map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`order-duration-preset-${opt.id}`}
                              onClick={() => setSelectedDurationPreset(opt.id)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                selectedDurationPreset === opt.id
                                  ? 'bg-red-800 text-white shadow-2xs'
                                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                              }`}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr(
                        'Xếp lớp trực tiếp kèm theo khi kích hoạt (tùy chọn):',
                        'Assign live class on activation (optional):'
                      )}
                    </label>
                    <select
                      data-testid="order-class-select"
                      value={selectedClassCode}
                      onChange={(e) => setSelectedClassCode(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800"
                    >
                      <option value="">
                        {tr(
                          '— Không đổi / Chưa xếp lớp trực tiếp —',
                          '— Unchanged / No live class assigned —'
                        )}
                      </option>
                      {classesList
                        .filter((cls) => cls.active !== false)
                        .map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.id} · {translateScheduleText(cls.name, lang)}
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* SECTION 5: KÍCH HOẠT KHÓA HỌC (PHASE 2.3) */}
          {(order.approval_status !== 'approved' ||
            isPartialProvisioningFailure ||
            accountDetailedStatus === 'sync_error') && (
            <section
              data-testid="order-section-activation"
              className="rounded-2xl border-2 border-red-800/20 bg-white p-3.5 shadow-xs"
            >
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-red-900">
                <Sparkles className="h-4 w-4 text-red-800" />
                {tr('5. Xác nhận & Kích hoạt khóa học', '5. Confirm & Activate Course')}
              </h3>

              {!activationCheck.canActivate && (
                <div
                  data-testid="order-activation-block-reasons"
                  className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950"
                >
                  <p className="font-bold text-amber-900">
                    {tr(
                      'Chưa đủ điều kiện kích hoạt khóa học (nút kích hoạt đang khóa):',
                      'Not ready for activation (activation button is locked):'
                    )}
                  </p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[11px]">
                    {activationCheck.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {activationCheck.canActivate && (
                <p className="mt-2 text-xs text-emerald-800 font-semibold">
                  {tr(
                    '✓ Đơn hàng đã đủ toàn bộ điều kiện (đã tư vấn, đã xác minh tiền thực nhận, email và khóa học hợp lệ).',
                    '✓ All conditions met (consulted, payment verified, valid email and course).'
                  )}
                </p>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                <button
                  type="button"
                  data-testid="order-activate-course-btn"
                  disabled={!activationCheck.canActivate || isApprovingOrder}
                  onClick={() => setShowConfirmApproveModal(true)}
                  className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-extrabold text-white shadow-sm transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-stone-300 disabled:text-stone-500 sm:w-auto"
                >
                  {isApprovingOrder ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  <span>
                    {isPartialProvisioningFailure ||
                    accountDetailedStatus === 'sync_error'
                      ? tr('Đồng bộ lại quyền & thời hạn', 'Re-sync access & duration')
                      : tr('Xác nhận & Kích hoạt khóa học', 'Confirm & Activate Course')}
                  </span>
                </button>
              </div>
            </section>
          )}
        </div>

        {/* Final Confirmation Modal (Phase 2.3) */}
        {showConfirmApproveModal && (
          <div
            data-testid="order-confirm-activation-modal"
            className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/70 p-4"
            onClick={() => setShowConfirmApproveModal(false)}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl"
            >
              <div className="flex items-center gap-2 text-emerald-800">
                <ShieldCheck className="h-5 w-5" />
                <h4 className="font-display text-sm font-extrabold">
                  {tr('Xác nhận kích hoạt khóa học cuối cùng', 'Final Course Activation Confirmation')}
                </h4>
              </div>

              <p
                data-testid="order-confirm-activation-summary"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-stone-900"
              >
                {tr('Học viên ', 'Student ')}
                <strong>{order.student_name}</strong>
                {tr(' sẽ được cấp khóa ', ' will be granted ')}
                <strong>{translateCourseTitle(order.course_name, lang)}</strong>
                {tr(' trên email ', ' on email ')}
                <strong>{effectiveEmail}</strong>
                {tr(' · Thời hạn học: ', ' · Access duration: ')}
                <strong>
                  {formatCourseDurationPresetLabel(selectedDurationPreset, lang)}
                </strong>
                .
              </p>

              <p className="text-[11px] text-stone-600">
                {tr(
                  'Hệ thống sẽ đồng bộ quyền khóa học và thời hạn trên izTeach + Supabase. Nếu email đã có tài khoản, mật khẩu cũ và các khóa hiện có được giữ nguyên.',
                  'The system will sync course access and expiration on izTeach + Supabase. Existing accounts keep their current password and courses.'
                )}
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  data-testid="order-cancel-confirm-activation-btn"
                  onClick={() => setShowConfirmApproveModal(false)}
                  className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  {tr('Quay lại', 'Back')}
                </button>
                <button
                  type="button"
                  data-testid="order-final-confirm-activation-btn"
                  disabled={isApprovingOrder}
                  onClick={async () => {
                    await onApproveOrder({
                      orderId: order.order_id,
                      classCode: selectedClassCode || undefined,
                      studentEmail: effectiveEmail,
                      durationPreset: selectedDurationPreset,
                    });
                    setShowConfirmApproveModal(false);
                  }}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-1.5 text-xs font-extrabold text-white hover:bg-emerald-800 disabled:opacity-50"
                >
                  {isApprovingOrder && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{tr('Đồng ý kích hoạt ngay', 'Confirm & Activate Now')}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
