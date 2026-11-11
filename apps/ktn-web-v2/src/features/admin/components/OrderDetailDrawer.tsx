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
} from 'lucide-react';
import {
  COURSE_DURATION_PRESET_OPTIONS,
  COURSE_DURATION_UNIT_OPTIONS,
  buildCourseDurationPreset,
  formatCourseDurationPresetLabel,
  formatVnd,
  parseCourseDurationPreset,
  type CourseDurationUnitOption,
} from '@/lib/utils';
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
  }) => Promise<unknown>;
  onApproveOrder: (params: {
    orderId: string;
    classCode?: string;
    studentEmail?: string;
    durationPreset?: CourseDurationPreset;
  }) => Promise<unknown>;
  onOpenStudentProfile: (email: string) => void;
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
}) => {
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
      return;
    }
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

  const contactMeta = CONTACT_STATUS_META[contactStatus] || CONTACT_STATUS_META.not_called;
  const paymentMeta =
    PAYMENT_STATUS_META[paymentDetailedStatus] || PAYMENT_STATUS_META.unpaid;
  const accountMeta =
    ACCOUNT_STATUS_META[accountDetailedStatus] || ACCOUNT_STATUS_META.no_account;

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
  const zaloUrl = useMemo(() => {
    if (order?.zalo_url) return order.zalo_url;
    const digits = contactPhone.replace(/[^\d]/g, '');
    return /^0\d{9}$/.test(digits) ? `https://zalo.me/${digits}` : null;
  }, [order?.zalo_url, contactPhone]);

  // Compute live activation readiness and block reasons
  const activationCheck = useMemo(() => {
    if (!order) {
      return { canActivate: false, reasons: ['Chưa chọn đơn hàng.'] };
    }
    if (
      order.approval_status === 'approved' &&
      accountDetailedStatus !== 'sync_error' &&
      order.provisioning_status !== 'partial_failure'
    ) {
      return { canActivate: false, reasons: ['Đơn hàng này đã được kích hoạt.'] };
    }
    const reasons: string[] = [];
    if (order.approval_status === 'cancelled' || paymentDetailedStatus === 'refunded') {
      reasons.push('Đơn hàng đã hủy hoặc đã hoàn tiền.');
    }
    if (order.course_valid === false) {
      reasons.push('Mã khóa học không hợp lệ.');
    }
    if (order.amount_valid === false) {
      reasons.push('Số tiền đơn hàng không khớp bảng giá khóa học.');
    }
    if (
      order.payment_status !== 'paid' ||
      paymentDetailedStatus !== 'verified_paid'
    ) {
      reasons.push(
        paymentDetailedStatus === 'customer_reported'
          ? 'Khách mới báo đã chuyển khoản — Học vụ cần kiểm tra sao kê và xác nhận "Đã xác minh tiền thực nhận" trước khi kích hoạt.'
          : 'Chưa xác minh tiền thực nhận (Trạng thái thanh toán chưa phải "Đã xác minh tiền thực nhận").'
      );
    }
    if (!hasValidEmail) {
      reasons.push('Chưa có email đăng nhập hợp lệ cho học viên.');
    }
    const consultationHandled =
      order.source === 'authenticated_student' ||
      contactStatus === 'called' ||
      Boolean((order.consultation_note || '').trim());
    if (!consultationHandled) {
      reasons.push(
        'Chưa cập nhật trạng thái chăm sóc (vui lòng gọi phụ huynh và đánh dấu "Đã gọi" hoặc ghi chú tư vấn trước khi kích hoạt).'
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
  ]);

  if (!open || !order) return null;

  const parentDisplay =
    order.parent_name && order.parent_name.trim()
      ? order.parent_name.trim()
      : 'Chưa cung cấp';

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
        aria-label={`Chi tiết đơn hàng ${order.order_id}`}
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
              aria-label="Quay lại danh sách đơn hàng"
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
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                  {order.source_label ||
                    (order.source === 'authenticated_student'
                      ? 'Học viên đang đăng nhập'
                      : 'Website')}
                </span>
                <span
                  data-testid="order-drawer-payment-badge"
                  className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${paymentMeta.badgeClass}`}
                >
                  {paymentMeta.label}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs font-bold text-stone-900">
                {order.student_name} · {order.course_name}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="order-drawer-close-btn"
            onClick={onClose}
            aria-label="Đóng chi tiết đơn hàng"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 space-y-3.5 overflow-y-auto p-3.5 sm:p-4">
          {actionError && (
            <div
              role="alert"
              data-testid="order-drawer-error-banner"
              className="flex items-start justify-between gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <span>{actionError}</span>
              </div>
              <button
                type="button"
                onClick={onClearError}
                className="rounded px-1.5 py-0.5 text-[11px] font-bold text-red-800 hover:bg-red-100"
              >
                Đóng
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
                1. Thông tin khách hàng & khóa học
              </h3>
              {order.approval_status !== 'approved' && (
                <button
                  type="button"
                  data-testid="order-toggle-edit-customer-btn"
                  onClick={() => setIsEditingCustomerInfo((prev) => !prev)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                >
                  {isEditingCustomerInfo ? 'Thu gọn' : 'Bổ sung / Sửa TT'}
                </button>
              )}
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2.5 text-xs sm:grid-cols-2">
              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  Tên học viên
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
                  Tên phụ huynh
                </span>
                <p
                  data-testid="order-detail-parent-name"
                  className={`mt-0.5 font-bold ${
                    parentDisplay === 'Chưa cung cấp'
                      ? 'italic text-stone-400'
                      : 'text-stone-900'
                  }`}
                >
                  {parentDisplay}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  SĐT phụ huynh (ưu tiên liên hệ)
                </span>
                <p
                  data-testid="order-detail-phone"
                  className="mt-0.5 font-mono font-bold text-red-900"
                >
                  {contactPhone || 'Chưa cung cấp'}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  Email đăng nhập / nhận tài khoản
                </span>
                <p
                  data-testid="order-detail-email"
                  className={`mt-0.5 break-all font-bold ${
                    order.student_email ? 'text-stone-900' : 'text-amber-800'
                  }`}
                >
                  {order.student_email || 'Chưa có email (cần bổ sung trước khi kích hoạt)'}
                </p>
              </div>

              <div className="rounded-xl bg-stone-50 p-2.5 sm:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="text-[11px] font-semibold text-stone-500">
                      Khóa học đăng ký
                    </span>
                    <p
                      data-testid="order-detail-course-name"
                      className="mt-0.5 font-bold text-stone-900"
                    >
                      {order.course_name}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[11px] font-semibold text-stone-500">
                      Học phí đơn / Giá chuẩn
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
                    Phương thức: <strong>{order.payment_method || 'VietQR'}</strong>
                  </span>
                  <span>
                    Nguồn đơn:{' '}
                    <strong data-testid="order-detail-source">
                      {order.source_label ||
                        (order.source === 'authenticated_student'
                          ? 'Học viên đang đăng nhập'
                          : 'Website')}
                    </strong>
                  </span>
                  <span>
                    Ngày tạo:{' '}
                    <strong>
                      {order.created_at
                        ? new Date(order.created_at).toLocaleString('vi-VN')
                        : '—'}
                    </strong>
                  </span>
                </div>
              </div>

              <div className="rounded-xl bg-amber-50/70 p-2.5 sm:col-span-2">
                <span className="text-[11px] font-semibold text-amber-900">
                  Ghi chú của khách hàng / phụ huynh:
                </span>
                <p
                  data-testid="order-detail-customer-note"
                  className="mt-0.5 text-xs text-stone-800"
                >
                  {order.customer_note ? order.customer_note : 'Không có ghi chú.'}
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
                  Cập nhật thông tin phụ huynh & Email cấp tài khoản học viên:
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Email đăng nhập *
                    </label>
                    <input
                      type="email"
                      data-testid="order-edit-email-input"
                      readOnly={order.source === 'authenticated_student'}
                      disabled={order.source === 'authenticated_student'}
                      value={editEmail}
                      onChange={(e) => setEditEmail(e.target.value)}
                      placeholder="phuhuynh@gmail.com"
                      className={`mt-1 w-full rounded-lg border px-2.5 py-1.5 text-xs font-semibold ${
                        order.source === 'authenticated_student'
                          ? 'cursor-not-allowed border-stone-200 bg-stone-100 text-stone-600'
                          : 'border-stone-300 bg-white text-stone-900'
                      }`}
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Tên phụ huynh
                    </label>
                    <input
                      type="text"
                      data-testid="order-edit-parent-input"
                      value={editParentName}
                      onChange={(e) => setEditParentName(e.target.value)}
                      placeholder="VD: Chị Lan (Mẹ bé)"
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      SĐT liên hệ
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
                    Lưu thông tin khách
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
                2. Liên hệ phụ huynh & Chăm sóc tư vấn
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
                  <span>Gọi điện ({contactPhone})</span>
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
                  <span>Nhắn Zalo phụ huynh</span>
                </a>
              )}

              {(
                [
                  { id: 'called', label: 'Đã gọi' },
                  { id: 'no_answer', label: 'Không nghe máy' },
                  { id: 'callback_scheduled', label: 'Hẹn gọi lại' },
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
                Ghi chú tư vấn của Học vụ:
              </label>
              <textarea
                rows={2}
                data-testid="order-consultation-note-input"
                value={consultationNote}
                onChange={(e) => setConsultationNote(e.target.value)}
                placeholder="Ghi kết quả cuộc gọi, khung giờ phụ huynh muốn học, hoặc thông tin xuất hóa đơn..."
                className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-stone-500">
                  {order.contact_updated_at
                    ? `Cập nhật lần cuối: ${new Date(
                        order.contact_updated_at
                      ).toLocaleString('vi-VN')} (${order.contact_updated_by || 'Học vụ'})`
                    : 'Chưa có lịch sử cuộc gọi.'}
                </span>
                <button
                  type="button"
                  data-testid="order-save-consultation-note-btn"
                  disabled={isUpdatingOrder}
                  onClick={handleSaveConsultationNote}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-bold text-stone-800 hover:bg-stone-100"
                >
                  Lưu ghi chú tư vấn
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
                3. Xác minh thanh toán & Đối chiếu giao dịch
              </h3>
              <span
                data-testid="order-payment-detailed-status"
                className={`rounded-md border px-2 py-0.5 text-[10px] font-bold ${paymentMeta.badgeClass}`}
              >
                {paymentMeta.label}
              </span>
            </div>

            {/* Automatic Webhook Proof OR Manual Verification Proof */}
            {order.payment_status === 'paid' && order.payment_proof_auto && (
              <div
                data-testid="order-payment-webhook-proof"
                className="mt-2.5 rounded-xl border border-emerald-300 bg-emerald-50 p-2.5 text-xs text-emerald-950"
              >
                <p className="flex items-center gap-1.5 font-bold text-emerald-900">
                  <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                  Bằng chứng thanh toán tự động (Webhook ngân hàng đã đối khớp)
                </p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                  <span>
                    Mã GD: <strong className="font-mono">{order.payment_tx_ref || 'AUTO'}</strong>
                  </span>
                  <span>
                    Số tiền nhận:{' '}
                    <strong>{formatVnd(order.payment_received_amount ?? order.amount)}</strong>
                  </span>
                  <span>
                    Thời điểm:{' '}
                    <strong>
                      {order.payment_verified_at
                        ? new Date(order.payment_verified_at).toLocaleString('vi-VN')
                        : 'Tự động'}
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
                  Đã xác minh tiền thực nhận (Đối soát thủ công)
                </p>
                <div className="mt-1 grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-3">
                  <span>
                    Người xác nhận:{' '}
                    <strong>{order.payment_verified_by || 'Quản trị viên'}</strong>
                  </span>
                  <span>
                    Mã tham chiếu GD:{' '}
                    <strong className="font-mono">
                      {order.payment_tx_ref || 'Đã đối chiếu sao kê'}
                    </strong>
                  </span>
                  <span>
                    Thời điểm:{' '}
                    <strong>
                      {order.payment_verified_at
                        ? new Date(order.payment_verified_at).toLocaleString('vi-VN')
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
                  Khách báo đã chuyển khoản — Chưa coi là đã nhận tiền!
                </p>
                <p className="mt-0.5 text-[11px]">
                  Vui lòng kiểm tra biến động số dư / sao kê ngân hàng, nhập Mã giao dịch (Transaction ID) và số tiền thực nhận bên dưới trước khi bấm xác minh.
                </p>
              </div>
            )}

            {/* Reconciliation Inputs */}
            <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  Số tiền thực nhận (VNĐ) — Chuẩn: {formatVnd(order.server_course_price ?? order.amount)}
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
                  Mã giao dịch / Tham chiếu NH (Transaction ID)
                </label>
                <input
                  type="text"
                  data-testid="order-payment-tx-ref-input"
                  value={txRefInput}
                  onChange={(e) => setTxRefInput(e.target.value)}
                  placeholder="VD: FT26312998811 / VietQR MB..."
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
                ✓ Đã xác minh tiền thực nhận
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
                Chờ kiểm tra GD
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
                Khách báo đã CK
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
                Thanh toán sai/thiếu
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
                Chưa thanh toán
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
                Hoàn tiền / Hủy
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
                4. Trạng thái tài khoản & Cấp quyền khóa học
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
                      Tài khoản học viên đã tồn tại ({order.existing_student.code || effectiveEmail})
                    </p>
                    <p className="mt-0.5 text-[11px] text-sky-900">
                      Khi kích hoạt đơn, hệ thống sẽ <strong>cộng thêm quyền khóa mới</strong> và{' '}
                      <strong>giữ nguyên mật khẩu hiện tại</strong> cùng các khóa học đã mở ({order.existing_student.online_courses_count || 0} khóa). Không tạo tài khoản thứ hai.
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
                      <span>Mở hồ sơ học viên</span>
                    </button>
                  )}
                </div>
              )}

              {!order.existing_student && order.approval_status !== 'approved' && (
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                  <p className="font-bold text-stone-900">
                    Học viên mới (Chưa có tài khoản trên hệ thống)
                  </p>
                  <p className="mt-0.5 text-[11px] text-stone-600">
                    Sau khi bấm &ldquo;Xác nhận & Kích hoạt khóa học&rdquo;, hệ thống sẽ tạo tài khoản học viên trên Cognito + izTeach + Supabase và cấp mật khẩu khởi tạo an toàn dùng 1 lần để Học vụ bàn giao cho phụ huynh.
                  </p>
                </div>
              )}

              {/* Phase 3: Post-Activation Account & Credential Handoff Status */}
              {order.approval_status === 'approved' && (
                <div
                  data-testid="order-post-activation-status"
                  className={`space-y-2 rounded-xl border p-3 ${
                    order.provisioning_status === 'partial_failure' ||
                    accountDetailedStatus === 'sync_error'
                      ? 'border-amber-300 bg-amber-50/70'
                      : 'border-emerald-200 bg-emerald-50/60'
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="order-grant-sync-status-badge"
                      className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-extrabold ${
                        order.provisioning_status === 'partial_failure' ||
                        accountDetailedStatus === 'sync_error'
                          ? 'bg-amber-600 text-white'
                          : 'bg-emerald-700 text-white'
                      }`}
                    >
                      {order.provisioning_status === 'partial_failure' ||
                      accountDetailedStatus === 'sync_error'
                        ? 'Cần hoàn tất đồng bộ thời hạn'
                        : 'Đã cấp thành công'}
                    </span>
                    <span className="text-[11px] font-bold text-stone-700">
                      Thời hạn học:{' '}
                      {formatCourseDurationPresetLabel(
                        order.duration_preset || order.durationPreset || 'unlimited'
                      )}
                      {order.limit_time || order.limitTime
                        ? ` (Hạn: ${String(order.limit_time || order.limitTime).slice(0, 10)})`
                        : ''}
                    </span>
                  </div>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        1. Tài khoản
                      </span>
                      <p className="mt-0.5 font-bold text-emerald-900">
                        {order.account_created
                          ? 'Tài khoản đã tạo mới'
                          : 'Tài khoản đã tồn tại (Giữ mật khẩu cũ)'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        2. Bàn giao đăng nhập
                      </span>
                      <p
                        data-testid="order-handoff-stage-text"
                        className="mt-0.5 font-bold text-amber-900"
                      >
                        {order.credential_handed_off || !order.account_created
                          ? 'Đã bàn giao thông tin đăng nhập'
                          : 'Đang chờ học viên thiết lập mật khẩu / chờ bàn giao'}
                      </p>
                    </div>
                    <div className="rounded-lg bg-white p-2 border border-emerald-200">
                      <span className="text-[10px] font-bold uppercase text-stone-500">
                        3. Trạng thái học tập
                      </span>
                      <p className="mt-0.5 font-bold text-emerald-900">
                        {order.provisioning_status === 'partial_failure' ||
                        accountDetailedStatus === 'sync_error'
                          ? 'Cần hoàn tất đồng bộ thời hạn'
                          : 'Học viên có thể đăng nhập'}
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
                        Mật khẩu khởi tạo dùng 1 lần (chỉ hiển thị trong phiên này, không lưu vào bảng đơn):
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
                                `Email đăng nhập: ${effectiveEmail}\nMật khẩu khởi tạo: ${ephemeralPassword}`
                              )
                              .catch(() => {});
                          }}
                          className="inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-xs font-bold text-white"
                        >
                          <Copy className="h-3.5 w-3.5" />
                          Sao chép gửi PH
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
                        <span>Xác nhận đã bàn giao thông tin đăng nhập cho phụ huynh</span>
                      </button>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-800">
                        <CheckCircle2 className="h-4 w-4" />
                        Đã hoàn tất bàn giao thông tin đăng nhập
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
                        <span>Mở hồ sơ học viên</span>
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Course Duration Preset & Optional Live Class Assignment on Activation */}
              {(order.approval_status !== 'approved' ||
                order.provisioning_status === 'partial_failure' ||
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
                            Thời hạn học:
                          </span>
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                            {formatCourseDurationPresetLabel(selectedDurationPreset)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-600">
                              Số lượng (1–365)
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
                              Đơn vị (Ngày / Tuần / Tháng)
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
                              {COURSE_DURATION_UNIT_OPTIONS.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {COURSE_DURATION_PRESET_OPTIONS.map((opt) => (
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
                      Xếp lớp trực tiếp kèm theo khi kích hoạt (tùy chọn):
                    </label>
                    <select
                      data-testid="order-class-select"
                      value={selectedClassCode}
                      onChange={(e) => setSelectedClassCode(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-800"
                    >
                      <option value="">— Không đổi / Chưa xếp lớp trực tiếp —</option>
                      {classesList
                        .filter((cls) => cls.active !== false)
                        .map((cls) => (
                          <option key={cls.id} value={cls.id}>
                            {cls.id} · {cls.name}
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
            order.provisioning_status === 'partial_failure' ||
            accountDetailedStatus === 'sync_error') && (
            <section
              data-testid="order-section-activation"
              className="rounded-2xl border-2 border-red-800/20 bg-white p-3.5 shadow-xs"
            >
              <h3 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-red-900">
                <Sparkles className="h-4 w-4 text-red-800" />
                5. Xác nhận & Kích hoạt khóa học
              </h3>

              {!activationCheck.canActivate && (
                <div
                  data-testid="order-activation-block-reasons"
                  className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-950"
                >
                  <p className="font-bold text-amber-900">
                    Chưa đủ điều kiện kích hoạt khóa học (nút kích hoạt đang khóa):
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
                  ✓ Đơn hàng đã đủ toàn bộ điều kiện (đã tư vấn, đã xác minh tiền thực nhận, email và khóa học hợp lệ).
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
                    {order.provisioning_status === 'partial_failure' ||
                    accountDetailedStatus === 'sync_error'
                      ? 'Đồng bộ lại quyền & thời hạn'
                      : 'Xác nhận & Kích hoạt khóa học'}
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
                  Xác nhận kích hoạt khóa học cuối cùng
                </h4>
              </div>

              <p
                data-testid="order-confirm-activation-summary"
                className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs leading-relaxed text-stone-900"
              >
                Học viên <strong>{order.student_name}</strong> sẽ được cấp khóa{' '}
                <strong>{order.course_name}</strong> trên email{' '}
                <strong>{effectiveEmail}</strong> · Thời hạn học:{' '}
                <strong>
                  {formatCourseDurationPresetLabel(selectedDurationPreset)}
                </strong>
                .
              </p>

              <p className="text-[11px] text-stone-600">
                Hệ thống sẽ đồng bộ quyền khóa học và thời hạn trên izTeach + Supabase. Nếu email đã có tài khoản, mật khẩu cũ và các khóa hiện có được giữ nguyên.
              </p>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  data-testid="order-cancel-confirm-activation-btn"
                  onClick={() => setShowConfirmApproveModal(false)}
                  className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  Quay lại
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
                  <span>Đồng ý kích hoạt ngay</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
