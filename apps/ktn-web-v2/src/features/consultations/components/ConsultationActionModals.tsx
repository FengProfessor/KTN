import React, { useEffect, useRef, useState } from 'react';
import { QrCode, Link2, X, Copy, Send, Search, Loader2, CheckCircle2 } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { formatVnd } from '@/lib/utils';
import type {
  ConsultationCatalogCourse,
  ConsultationThread,
  CourseDurationPreset,
  KtnStudentRecord,
  KtnVietQrPaymentInfo,
} from '@/types/ktn.types';
import { isSafeVietQrUrl, validateVnPhone } from '../utils/consultationHelpers';

interface CreateOrderModalProps {
  open: boolean;
  thread: ConsultationThread;
  courses: ConsultationCatalogCourse[];
  isDemoMode: boolean;
  onClose: () => void;
  onOrderCreated: () => void;
  onSendQrToThread?: (messageText: string) => Promise<void>;
}

export const CreateConsultationOrderModal: React.FC<CreateOrderModalProps> = ({
  open,
  thread,
  courses,
  isDemoMode,
  onClose,
  onOrderCreated,
  onSendQrToThread,
}) => {
  const { tr } = useI18n();
  const addToast = useUiStore((s) => s.addToast);
  const [courseId, setCourseId] = useState(courses[0]?.id || '6adadba969897b0002482ca5');
  const [name, setName] = useState(thread.customer_name || '');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState(thread.customer_phone || '');
  const [durationPreset, setDurationPreset] = useState<CourseDurationPreset>('1m');
  const [note, setNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const submittingRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const [createdResult, setCreatedResult] = useState<{
    id: string;
    amount: number;
    payment: KtnVietQrPaymentInfo | null;
  } | null>(null);

  useEffect(() => {
    submittingRef.current = false;
    if (open) {
      setCourseId(courses[0]?.id || '6adadba969897b0002482ca5');
      setName(thread.customer_name || '');
      setPhone(thread.customer_phone || '');
      setEmail('');
      setDurationPreset('1m');
      setNote('');
      setError(null);
      setCreatedResult(null);
    } else {
      setError(null);
      setCreatedResult(null);
    }
    // Reset cleanly when modal opens or active thread changes (omit courses array identity)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thread.id]);

  if (!open) return null;

  const selectedCourse = courses.find((c) => c.id === courseId) || courses[0];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current || submitting) return;
    setError(null);
    if (!name.trim()) {
      setError(tr('Vui lòng nhập tên học viên / phụ huynh.', 'Please enter customer name.'));
      return;
    }
    if (!validateVnPhone(phone)) {
      setError(
        tr('Số điện thoại Việt Nam chưa hợp lệ (vd: 0901234567).', 'Invalid VN phone number.')
      );
      return;
    }

    submittingRef.current = true;
    setSubmitting(true);
    try {
      const requestId =
        typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
          ? crypto.randomUUID()
          : `req-${Date.now()}`;
      if (isDemoMode) {
        const orderId = `ORD-${String(Date.now()).slice(-6)}`;
        const amount = selectedCourse?.price || 963000;
        setCreatedResult({
          id: orderId,
          amount,
          payment: {
            bankId: 'MB',
            bankName: 'MB Bank',
            accountNo: '0909123456',
            accountName: 'HOC VIEN KHONG TU NHI',
            amount,
            transferContent: `KTN ${orderId}`,
            qrUrl: `https://img.vietqr.io/image/MB-0909123456-compact2.png?amount=${amount}&addInfo=KTN%20${orderId}`,
          },
        });
        onOrderCreated();
        return;
      }

      const res = await ktnApi.createConsultationOrder(thread.id, {
        courseId,
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        requestId,
        note: note.trim() || undefined,
        durationPreset,
      });
      setCreatedResult({
        id: res.id,
        amount: res.amount,
        payment: res.payment,
      });
      onOrderCreated();
      addToast({
        title: tr(`Đã tạo đơn ${res.id}`, `Order ${res.id} created`),
        variant: 'success',
      });
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : tr('Không thể tạo đơn hàng.', 'Failed to create order.')
      );
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const safeQrUrl = isSafeVietQrUrl(createdResult?.payment?.qrUrl)
    ? createdResult!.payment!.qrUrl
    : '';

  const qrSummaryText = createdResult
    ? [
        `Mã đơn: ${createdResult.id}`,
        `Số tiền: ${formatVnd(createdResult.amount)}`,
        createdResult.payment?.bankName
          ? `Ngân hàng: ${createdResult.payment.bankName} - STK: ${createdResult.payment.accountNo || createdResult.payment.accountNumber || ''}`
          : '',
        createdResult.payment?.transferContent
          ? `Nội dung CK: ${createdResult.payment.transferContent}`
          : '',
        safeQrUrl ? `VietQR: ${safeQrUrl}` : '',
      ]
        .filter(Boolean)
        .join('\n')
    : '';

  return (
    <div
      data-testid="crm-create-order-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-lg rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl sm:p-5">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <QrCode className="h-4 w-4 text-red-800" />
            {tr('Tạo đơn & Mã VietQR', 'Create Order & VietQR')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {createdResult ? (
          <div className="mt-3 space-y-3" data-testid="crm-created-order-result">
            <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs">
              <p className="flex items-center gap-1.5 font-bold text-emerald-950">
                <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                {tr('Đã tạo đơn hàng thành công', 'Order created successfully')}:{' '}
                <span className="font-mono">{createdResult.id}</span>
              </p>
              <p className="mt-1 font-bold text-red-900">{formatVnd(createdResult.amount)}</p>
              {createdResult.payment && (
                <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center">
                  {isSafeVietQrUrl(createdResult.payment.qrUrl) && (
                    <img
                      src={createdResult.payment.qrUrl}
                      alt={`VietQR ${createdResult.id}`}
                      className="h-32 w-32 rounded-xl border border-stone-200 bg-white object-contain p-1"
                    />
                  )}
                  <div className="space-y-1 text-[11px] text-stone-800">
                    <p>
                      <strong>{createdResult.payment.bankName}</strong> ·{' '}
                      <span className="font-mono">
                        {createdResult.payment.accountNo || createdResult.payment.accountNumber}
                      </span>
                    </p>
                    <p>{createdResult.payment.accountName}</p>
                    <p className="rounded bg-amber-100 px-2 py-0.5 font-mono font-bold text-amber-950">
                      {createdResult.payment.transferContent}
                    </p>
                  </div>
                </div>
              )}
            </div>

            <div className="flex flex-wrap justify-end gap-2">
              <button
                type="button"
                data-testid="crm-created-order-copy-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard?.writeText(qrSummaryText);
                    addToast({ title: tr('Đã sao chép thông tin QR', 'Copied QR info'), variant: 'success' });
                  } catch {
                    // ignore clipboard errors in restricted contexts
                  }
                }}
                className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
              >
                <Copy className="h-3.5 w-3.5" />
                {tr('Sao chép QR', 'Copy QR')}
              </button>
              {onSendQrToThread && (
                <button
                  type="button"
                  data-testid="crm-created-order-send-thread-btn"
                  onClick={async () => {
                    try {
                      await onSendQrToThread(qrSummaryText);
                      onClose();
                    } catch {
                      // parent opMutation.onError surfaces error toast
                    }
                  }}
                  className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-900"
                >
                  <Send className="h-3.5 w-3.5" />
                  {tr('Gửi QR vào hội thoại', 'Send QR to thread')}
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 px-3 py-2 text-xs font-bold text-stone-700"
              >
                {tr('Đóng', 'Close')}
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-3 space-y-3 text-xs">
            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-900">
                {error}
              </div>
            )}

            <div>
              <label className="block font-bold text-stone-700">
                {tr('Khóa học', 'Course')}
              </label>
              <select
                data-testid="crm-create-order-course-select"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title} ({formatVnd(c.price)})
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block font-bold text-stone-700">
                  {tr('Tên học viên / Phụ huynh', 'Student / Parent name')}
                </label>
                <input
                  type="text"
                  data-testid="crm-create-order-name-input"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700">
                  {tr('Số điện thoại', 'Phone')}
                </label>
                <input
                  type="text"
                  data-testid="crm-create-order-phone-input"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901234567"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block font-bold text-stone-700">
                  {tr('Email nhận khóa học (tùy chọn)', 'Account email (optional)')}
                </label>
                <input
                  type="email"
                  data-testid="crm-create-order-email-input"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="phuhuynh@example.com"
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-bold text-stone-700">
                  {tr('Thời hạn', 'Duration preset')}
                </label>
                <select
                  value={durationPreset}
                  onChange={(e) => setDurationPreset(e.target.value as CourseDurationPreset)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="1w">1w</option>
                  <option value="2w">2w</option>
                  <option value="1m">1m</option>
                  <option value="2m">2m</option>
                  <option value="3m">3m</option>
                  <option value="unlimited">unlimited</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block font-bold text-stone-700">
                {tr('Ghi chú đơn', 'Order note')}
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-stone-200 px-3 py-2 font-bold text-stone-700"
              >
                {tr('Hủy', 'Cancel')}
              </button>
              <button
                type="submit"
                data-testid="crm-create-order-submit-btn"
                disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 font-bold text-white hover:bg-red-900 disabled:opacity-50"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                <span>{tr('Tạo đơn & VietQR', 'Create Order & QR')}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

interface LinkStudentModalProps {
  open: boolean;
  thread: ConsultationThread;
  isDemoMode: boolean;
  onClose: () => void;
  onLinked: (studentCode: string) => void;
}

export const LinkStudentCodeModal: React.FC<LinkStudentModalProps> = ({
  open,
  thread,
  isDemoMode,
  onClose,
  onLinked,
}) => {
  const { tr } = useI18n();
  const addToast = useUiStore((s) => s.addToast);
  const [query, setQuery] = useState(thread.customer_phone || thread.customer_name || '');
  const [studentCode, setStudentCode] = useState(thread.student_code || '');
  const [results, setResults] = useState<KtnStudentRecord[]>([]);
  const [searching, setSearching] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setQuery(thread.customer_phone || thread.customer_name || '');
      setStudentCode(thread.student_code || '');
      setResults([]);
      setError(null);
    } else {
      setResults([]);
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, thread.id]);

  if (!open) return null;

  const handleSearch = async () => {
    setError(null);
    if (isDemoMode) {
      setResults([
        {
          code: 'KTN-2026-089',
          email: 'hoangngan@khongtunhi.com',
          name: 'Bé Nguyễn Hoàng Ngân',
          phone: '0901234567',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: true,
          online_courses: [],
          studentCase: 'both',
        },
      ]);
      return;
    }
    setSearching(true);
    try {
      const res = await ktnApi.searchStudents({ q: query.trim(), limit: 10 });
      setResults(res.items || res.students || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tr('Không tìm thấy học viên.', 'Search failed.')
      );
    } finally {
      setSearching(false);
    }
  };

  const handleLink = async (codeToLink: string) => {
    const cleanCode = codeToLink.trim();
    if (!cleanCode) {
      setError(tr('Vui lòng nhập mã học viên (student_code).', 'Please enter student_code.'));
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      if (!isDemoMode) {
        await ktnApi.linkConsultationStudent(thread.id, cleanCode);
      }
      addToast({
        title: tr(`Đã liên kết hồ sơ ${cleanCode}`, `Linked student ${cleanCode}`),
        variant: 'success',
      });
      onLinked(cleanCode);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : tr('Không thể liên kết học viên.', 'Link failed.')
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      data-testid="crm-link-student-modal"
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
    >
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
        <div className="flex items-center justify-between border-b border-stone-100 pb-2.5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <Link2 className="h-4 w-4 text-red-800" />
            {tr('Liên kết hồ sơ học viên (student_code)', 'Link Student Profile (student_code)')}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-3 space-y-3 text-xs">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 font-semibold text-red-900">
              {error}
            </div>
          )}

          <div className="flex gap-1.5">
            <input
              type="text"
              data-testid="crm-link-student-search-input"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={tr('Tìm theo tên, SĐT, email hoặc mã HV...', 'Search name, phone, email, code...')}
              className="flex-1 rounded-xl border border-stone-300 px-3 py-2 text-xs"
            />
            <button
              type="button"
              data-testid="crm-link-student-search-btn"
              onClick={handleSearch}
              disabled={searching}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 font-bold text-stone-800 hover:bg-stone-100"
            >
              {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
              <span>{tr('Tìm', 'Search')}</span>
            </button>
          </div>

          {results.length > 0 && (
            <div className="max-h-40 space-y-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2">
              {results.map((stu) => (
                <button
                  key={stu.code}
                  type="button"
                  data-testid={`crm-link-student-pick-${stu.code}`}
                  onClick={() => setStudentCode(stu.code)}
                  className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-left ${
                    studentCode === stu.code
                      ? 'border-red-400 bg-red-50'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div>
                    <p className="font-bold text-stone-900">{stu.name}</p>
                    <p className="text-[11px] text-stone-500">
                      <span className="font-mono">{stu.code}</span> · {stu.email}
                    </p>
                  </div>
                  <span className="text-[10px] font-bold text-red-800">{tr('Chọn', 'Pick')}</span>
                </button>
              ))}
            </div>
          )}

          <div>
            <label className="block font-bold text-stone-700">
              {tr('Mã học viên (student_code)', 'Student Code')}
            </label>
            <input
              type="text"
              data-testid="crm-link-student-code-input"
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value)}
              placeholder="KTN-2026-089"
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-200 px-3 py-2 font-bold text-stone-700"
            >
              {tr('Hủy', 'Cancel')}
            </button>
            <button
              type="button"
              data-testid="crm-link-student-submit-btn"
              disabled={submitting || !studentCode.trim()}
              onClick={() => handleLink(studentCode)}
              className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-4 py-2 font-bold text-white hover:bg-red-900 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>{tr('Liên kết hồ sơ', 'Link Student')}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
