import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Globe,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Sparkles,
  Video,
  History,
} from 'lucide-react';
import type {
  ClassScheduleConfig,
  ClassScheduleException,
  CustomClassSession,
  KtnClassItem,
  KtnTeacherRecord,
} from '@/types/ktn.types';

const DAY_OPTIONS = [
  { value: 1, label: 'Thứ 2', short: 'T2' },
  { value: 2, label: 'Thứ 3', short: 'T3' },
  { value: 3, label: 'Thứ 4', short: 'T4' },
  { value: 4, label: 'Thứ 5', short: 'T5' },
  { value: 5, label: 'Thứ 6', short: 'T6' },
  { value: 6, label: 'Thứ 7', short: 'T7' },
  { value: 0, label: 'Chủ nhật', short: 'CN' },
] as const;

const DAY_SORT_ORDER: Record<number, number> = { 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 0: 7 };
const EMPTY_TEACHERS: KtnTeacherRecord[] = [];

const EXCEPTION_TYPE_LABELS: Record<ClassScheduleException['type'], string> = {
  rescheduled: 'Đổi giờ / Đổi buổi',
  postponed: 'Hoãn buổi học',
  holiday: 'Nghỉ lễ',
  cancelled: 'Hủy buổi học',
};

function getTodayVnStr(): string {
  const vnNow = new Date(Date.now() + 7 * 3600 * 1000);
  const y = vnNow.getUTCFullYear();
  const m = String(vnNow.getUTCMonth() + 1).padStart(2, '0');
  const d = String(vnNow.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getIsoDayFromDateStr(dateStr: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateStr);
  if (!m) return 1;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCDay();
}

function formatDayLabelVi(isoDay: number): string {
  return DAY_OPTIONS.find((d) => d.value === isoDay)?.label || `Thứ ${isoDay + 1}`;
}

export interface ClassScheduleModalProps {
  open: boolean;
  mode: 'create_class' | 'edit_schedule';
  role: 'admin' | 'teacher';
  classItem?: KtnClassItem | null;
  teachers?: KtnTeacherRecord[];
  isSubmitting?: boolean;
  onClose: () => void;
  onSaveClassAndSchedule: (payload: {
    isCreateClass: boolean;
    clientRequestId?: string;
    classCode: string;
    className: string;
    teacherCode?: string;
    teacherEmail?: string;
    totalLessons?: number;
    schedulePayload: {
      classCode: string;
      daysOfWeek: number[];
      startTime: string;
      endTime: string;
      timezone: string;
      effectiveFrom: string;
      effectiveUntil: string | null;
      mode: 'weekly' | 'custom_sessions';
      scheduleMode?: 'weekly' | 'custom_sessions';
      customSessions: CustomClassSession[];
      exceptions: ClassScheduleException[];
      meetingUrl: string;
      status: 'confirmed' | 'unconfirmed' | 'paused';
      notifyMembers: boolean;
    };
  }) => Promise<void>;
}

export const ClassScheduleModal: React.FC<ClassScheduleModalProps> = ({
  open,
  mode,
  role,
  classItem,
  teachers = EMPTY_TEACHERS,
  isSubmitting = false,
  onClose,
  onSaveClassAndSchedule,
}) => {
  const todayStr = useMemo(() => getTodayVnStr(), []);
  const isAdmin = role === 'admin';
  const isCreateMode = mode === 'create_class' && isAdmin;

  // Idempotency seed per modal open session
  const [clientRequestIdSeed, setClientRequestIdSeed] = useState<string>(
    () => `CLS-REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );

  // Class identity fields (for create_class or admin editing teacher)
  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [selectedTeacherEmail, setSelectedTeacherEmail] = useState('');
  const [totalLessons, setTotalLessons] = useState<number>(25);

  // Schedule fields — NEVER pre-fill fake "19:30 Thứ 3 & Thứ 6" for unconfirmed classes!
  const [scheduleMode, setScheduleMode] = useState<'weekly' | 'custom_sessions'>('weekly');
  const [daysOfWeek, setDaysOfWeek] = useState<number[]>([]);
  const [startTime, setStartTime] = useState<string>('');
  const [endTime, setEndTime] = useState<string>('');
  const [timezone] = useState<string>('Asia/Ho_Chi_Minh');
  const [effectiveFrom, setEffectiveFrom] = useState<string>(todayStr);
  const [effectiveUntil, setEffectiveUntil] = useState<string>('');
  const [meetingUrl, setMeetingUrl] = useState<string>('');
  const [status, setStatus] = useState<'confirmed' | 'unconfirmed' | 'paused'>('confirmed');
  const [statusManuallyChanged, setStatusManuallyChanged] = useState<boolean>(false);
  const [notifyMembers, setNotifyMembers] = useState<boolean>(true);

  // Custom sessions (when scheduleMode === 'custom_sessions')
  const [customSessions, setCustomSessions] = useState<CustomClassSession[]>([]);

  // Exceptions (rescheduled / postponed / holiday / cancelled)
  const [exceptions, setExceptions] = useState<ClassScheduleException[]>([]);
  const [newExcDate, setNewExcDate] = useState<string>(todayStr);
  const [newExcType, setNewExcType] = useState<ClassScheduleException['type']>('postponed');
  const [newExcStartTime, setNewExcStartTime] = useState<string>('19:30');
  const [newExcEndTime, setNewExcEndTime] = useState<string>('20:30');
  const [newExcNewDate, setNewExcNewDate] = useState<string>('');
  const [newExcNote, setNewExcNote] = useState<string>('');

  const [formError, setFormError] = useState<string>('');

  const selectableTeachers = useMemo(() => {
    const currentEmailNorm = (selectedTeacherEmail || classItem?.teacher_email || '')
      .trim()
      .toLowerCase();
    return teachers.filter((t) => {
      if ((t.email || '').trim().toLowerCase() === currentEmailNorm && currentEmailNorm) {
        return true;
      }
      if (t.active === false) return false;
      const st = String(t.status || '').toLowerCase();
      if (st === 'locked' || st === 'suspended' || st === 'inactive') return false;
      return true;
    });
  }, [teachers, selectedTeacherEmail, classItem?.teacher_email]);

  useEffect(() => {
    if (!open) return;
    setFormError('');
    setStatusManuallyChanged(false);
    setClientRequestIdSeed(
      `CLS-REQ-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );

    if (isCreateMode || !classItem) {
      setClassCode('');
      setClassName('');
      setSelectedTeacherEmail('');
      setTotalLessons(25);
      setScheduleMode('weekly');
      setDaysOfWeek([]);
      setStartTime('');
      setEndTime('');
      setEffectiveFrom(todayStr);
      setEffectiveUntil('');
      setMeetingUrl('');
      setStatus('unconfirmed');
      setCustomSessions([]);
      setExceptions([]);
      return;
    }

    setClassCode(classItem.id || '');
    setClassName(classItem.name || `Lớp ${classItem.id}`);
    setSelectedTeacherEmail(classItem.teacher_email || '');
    setTotalLessons(Number(classItem.total_lessons) || 25);

    const cfg: ClassScheduleConfig | null | undefined = classItem.scheduleConfig;
    if (cfg && (cfg.status === 'confirmed' || cfg.daysOfWeek?.length || cfg.customSessions?.length)) {
      const savedMode =
        cfg.scheduleMode === 'custom_sessions' || cfg.mode === 'custom_sessions'
          ? 'custom_sessions'
          : 'weekly';
      setScheduleMode(savedMode);
      setDaysOfWeek(Array.isArray(cfg.daysOfWeek) ? cfg.daysOfWeek : []);
      setStartTime(cfg.startTime || '');
      setEndTime(cfg.endTime || '');
      setEffectiveFrom(cfg.effectiveFrom || todayStr);
      setEffectiveUntil(cfg.effectiveUntil || '');
      setMeetingUrl(cfg.meetingUrl || '');
      setStatus(cfg.status || 'confirmed');
      setCustomSessions(Array.isArray(cfg.customSessions) ? cfg.customSessions : []);
      setExceptions(Array.isArray(cfg.exceptions) ? cfg.exceptions : []);
    } else {
      // Do NOT auto-populate fake defaults when class has no official schedule
      setScheduleMode('weekly');
      setDaysOfWeek([]);
      setStartTime('');
      setEndTime('');
      setEffectiveFrom(todayStr);
      setEffectiveUntil('');
      setMeetingUrl('');
      setStatus(
        cfg?.status === 'paused' || classItem.scheduleStatus === 'paused'
          ? 'paused'
          : 'unconfirmed'
      );
      setCustomSessions([]);
      setExceptions([]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCreateMode, classItem?.id, classItem?.scheduleConfig?.updatedAt, todayStr]);

  const toggleDayOfWeek = (day: number) => {
    setDaysOfWeek((prev) => {
      const next = prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => (DAY_SORT_ORDER[a] || 9) - (DAY_SORT_ORDER[b] || 9));
      if (!statusManuallyChanged) {
        if (next.length > 0) {
          if (!startTime) setStartTime('19:30');
          if (!endTime) setEndTime('20:30');
          setStatus('confirmed');
        } else {
          setStatus('unconfirmed');
        }
      }
      return next;
    });
  };

  const handleApplyLegacySuggestion = () => {
    const sug = classItem?.suggestedFromLegacyText;
    if (!sug) return;
    if (Array.isArray(sug.daysOfWeek) && sug.daysOfWeek.length > 0) {
      setDaysOfWeek(sug.daysOfWeek);
    }
    if (sug.startTime) setStartTime(sug.startTime);
    if (sug.endTime) setEndTime(sug.endTime);
    setStatus('confirmed');
    setFormError('');
  };

  const handleAddCustomSession = () => {
    setCustomSessions((prev) => [
      ...prev,
      {
        date: todayStr,
        startTime: startTime || '19:30',
        endTime: endTime || '20:30',
        title: `Buổi học ${prev.length + 1}`,
      },
    ]);
    if (isCreateMode && !statusManuallyChanged) {
      setStatus('confirmed');
    }
  };

  const handleAddException = () => {
    if (!newExcDate) return;
    const item: ClassScheduleException = {
      date: newExcDate,
      type: newExcType,
      ...(newExcType === 'rescheduled'
        ? {
            newDate: newExcNewDate || newExcDate,
            startTime: newExcStartTime || startTime || '19:30',
            endTime: newExcEndTime || endTime || '20:30',
          }
        : {}),
      note: newExcNote.trim() || EXCEPTION_TYPE_LABELS[newExcType],
    };
    setExceptions((prev) => [...prev.filter((e) => e.date !== newExcDate), item]);
    setNewExcNote('');
  };

  // Live preview of upcoming sessions over the next 21 days
  const previewSessions = useMemo(() => {
    if (status !== 'confirmed') return [];
    const results: Array<{
      date: string;
      dayLabel: string;
      startTime: string;
      endTime: string;
      status: string;
      note?: string;
    }> = [];

    const excByDate = new Map<string, ClassScheduleException>();
    for (const exc of exceptions) {
      if (!exc?.date) continue;
      if (exc.type === 'rescheduled' && exc.newDate && exc.newDate !== exc.date) {
        excByDate.set(exc.date, {
          ...exc,
          type: 'postponed',
          note: exc.note || `Đổi lịch sang ${exc.newDate}`,
        });
        excByDate.set(exc.newDate, {
          ...exc,
          date: exc.newDate,
          type: 'rescheduled',
        });
      } else {
        excByDate.set(exc.date, exc);
      }
    }

    if (scheduleMode === 'custom_sessions') {
      for (const cs of customSessions) {
        if (!cs.date || !cs.startTime) continue;
        const exc = excByDate.get(cs.date);
        const targetDate = exc?.newDate || cs.date;
        const isoDay = getIsoDayFromDateStr(targetDate);
        results.push({
          date: targetDate,
          dayLabel: formatDayLabelVi(isoDay),
          startTime: exc?.startTime || cs.startTime,
          endTime: exc?.endTime || cs.endTime || '20:30',
          status: exc ? exc.type : 'scheduled',
          note: exc?.note || cs.title,
        });
      }
      return results.slice(0, 6);
    }

    if (daysOfWeek.length === 0 || !startTime || !endTime) return [];

    const baseParts = todayStr.split('-').map(Number);
    const baseUtc = Date.UTC(baseParts[0], baseParts[1] - 1, baseParts[2]);
    for (let offset = 0; offset < 21; offset++) {
      const d = new Date(baseUtc + offset * 86400000);
      const y = d.getUTCFullYear();
      const m = String(d.getUTCMonth() + 1).padStart(2, '0');
      const day = String(d.getUTCDate()).padStart(2, '0');
      const dateStr = `${y}-${m}-${day}`;
      if (effectiveFrom && dateStr < effectiveFrom) continue;
      if (effectiveUntil && dateStr > effectiveUntil) continue;
      const jsDay = d.getUTCDay();
      const exc = excByDate.get(dateStr);
      const isExtraRescheduled = Boolean(exc && exc.type === 'rescheduled');
      if (!daysOfWeek.includes(jsDay) && !isExtraRescheduled) continue;

      const targetDate = dateStr;
      const targetIsoDay = getIsoDayFromDateStr(targetDate);
      results.push({
        date: targetDate,
        dayLabel: formatDayLabelVi(targetIsoDay),
        startTime: exc?.startTime || startTime,
        endTime: exc?.endTime || endTime,
        status: exc ? exc.type : 'scheduled',
        note: exc?.note,
      });
      if (results.length >= 6) break;
    }
    return results;
  }, [
    status,
    scheduleMode,
    daysOfWeek,
    startTime,
    endTime,
    effectiveFrom,
    effectiveUntil,
    customSessions,
    exceptions,
    todayStr,
  ]);

  const formattedSummaryLine = useMemo(() => {
    const code = (classCode || classItem?.id || 'LOP').toUpperCase();
    if (status !== 'confirmed') {
      return `Lớp ${code} — Chưa có lịch học chính thức`;
    }
    if (scheduleMode === 'custom_sessions') {
      if (customSessions.length === 0) return `Lớp ${code} — Chưa có buổi học nào`;
      return `Lớp ${code} — Lịch riêng từng buổi (${customSessions.length} buổi)`;
    }
    if (daysOfWeek.length === 0 || !startTime || !endTime) {
      return `Lớp ${code} — Chưa chọn đủ Thứ và Giờ học`;
    }
    const dayStr = daysOfWeek.map((d) => formatDayLabelVi(d)).join(' & ');
    return `Lớp ${code} — ${dayStr} — ${startTime}–${endTime}`;
  }, [classCode, classItem?.id, status, scheduleMode, customSessions.length, daysOfWeek, startTime, endTime]);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    const cleanCode = (classCode || classItem?.id || '').trim().toUpperCase();
    if (!cleanCode) {
      setFormError('Vui lòng nhập mã lớp (ví dụ: YCT2-04).');
      return;
    }

    if (status === 'confirmed') {
      if (scheduleMode === 'weekly') {
        if (daysOfWeek.length === 0) {
          setFormError('Vui lòng chọn ít nhất một Thứ trong tuần cho lịch học chính thức.');
          return;
        }
        if (!/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime)) {
          setFormError('Vui lòng chọn Giờ bắt đầu và Giờ kết thúc hợp lệ (HH:mm).');
          return;
        }
      } else if (customSessions.length === 0) {
        setFormError('Vui lòng thêm ít nhất 1 buổi học cho chế độ lịch riêng từng buổi.');
        return;
      }
    }

    if (meetingUrl.trim() && !/^https:\/\//i.test(meetingUrl.trim())) {
      setFormError('Link phòng học trực tuyến phải bắt đầu bằng https:// (hoặc để trống).');
      return;
    }

    const cleanSelectedTeacher = selectedTeacherEmail.trim();
    const matchedTeacher = cleanSelectedTeacher
      ? teachers.find(
          (t) =>
            (t.email || '').trim().toLowerCase() === cleanSelectedTeacher.toLowerCase() ||
            (t.code || '').trim() === cleanSelectedTeacher
        )
      : undefined;

    const resolvedSubmitTeacherCode = isAdmin
      ? cleanSelectedTeacher
        ? matchedTeacher?.code || ''
        : ''
      : matchedTeacher?.code || classItem?.teacher_code;

    const resolvedSubmitTeacherEmail = isAdmin
      ? cleanSelectedTeacher
        ? matchedTeacher?.email || cleanSelectedTeacher
        : ''
      : matchedTeacher?.email || cleanSelectedTeacher || classItem?.teacher_email;

    try {
      await onSaveClassAndSchedule({
        isCreateClass: isCreateMode,
        clientRequestId: `${clientRequestIdSeed}:${cleanCode}`,
        classCode: cleanCode,
        className: (className || `Lớp ${cleanCode}`).trim(),
        teacherCode: resolvedSubmitTeacherCode,
        teacherEmail: resolvedSubmitTeacherEmail,
        totalLessons,
        schedulePayload: {
          classCode: cleanCode,
          daysOfWeek,
          startTime: startTime || '19:30',
          endTime: endTime || '20:30',
          timezone,
          effectiveFrom: effectiveFrom || todayStr,
          effectiveUntil: effectiveUntil.trim() ? effectiveUntil.trim() : null,
          mode: scheduleMode,
          scheduleMode,
          customSessions,
          exceptions,
          meetingUrl: meetingUrl.trim(),
          status,
          notifyMembers,
        },
      });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Không thể lưu lịch học. Vui lòng kiểm tra lại.'
      );
    }
  };

  return (
    <div
      data-testid="class-schedule-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/60 p-3 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={isCreateMode ? 'Tạo lớp mới & Cài lịch học' : `Cài lịch học chính thức — ${classCode}`}
        data-testid="class-schedule-modal"
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
          <div>
            <h2 className="font-display text-sm font-bold text-stone-900 sm:text-base">
              {isCreateMode
                ? 'Tạo lớp mới & Cài lịch học chính thức'
                : `Cài lịch học chính thức — Lớp ${classCode}`}
            </h2>
            <p className="text-[11px] font-medium text-stone-500">
              {isAdmin
                ? 'Quyền Quản lý: Toàn quyền tạo lớp, phân công giáo viên, xác nhận lịch và hoãn/hủy buổi'
                : 'Quyền Giáo viên: Cập nhật giờ học & ngoại lệ buổi học cho lớp mình phụ trách'}
            </p>
          </div>
          <button
            type="button"
            data-testid="close-schedule-modal-btn"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
            aria-label="Đóng"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 space-y-4 overflow-y-auto p-4 text-xs">
          {formError && (
            <div
              role="alert"
              data-testid="schedule-modal-error"
              className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
            >
              <AlertTriangle className="h-4 w-4 shrink-0 text-red-700" />
              <span>{formError}</span>
            </div>
          )}

          {/* Legacy Unconfirmed Schedule Banner */}
          {!isCreateMode &&
            classItem?.legacyScheduleText &&
            classItem?.scheduleStatus !== 'confirmed' && (
              <div
                data-testid="legacy-schedule-suggestion-banner"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200 bg-amber-50/90 p-3"
              >
                <div>
                  <p className="font-bold text-amber-950">
                    Lịch văn bản cũ chưa xác nhận: “{classItem.legacyScheduleText}”
                  </p>
                  <p className="text-[11px] text-amber-800">
                    Hệ thống không tự động phát thông báo nhắc giờ từ văn bản tự do. Bấm nút bên cạnh để chuyển thành lịch có cấu trúc rồi bấm Lưu.
                  </p>
                </div>
                {classItem.suggestedFromLegacyText && (
                  <button
                    type="button"
                    data-testid="apply-legacy-schedule-btn"
                    onClick={handleApplyLegacySuggestion}
                    className="inline-flex items-center gap-1 rounded-lg bg-amber-800 px-2.5 py-1.5 text-[11px] font-bold text-white hover:bg-amber-900"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    Chuyển thành lịch chính thức
                  </button>
                )}
              </div>
            )}

          {/* Section 1: Class Info (Create Class or Admin Teacher Assignment) */}
          <div className="grid grid-cols-1 gap-3 rounded-xl border border-stone-200 bg-stone-50/60 p-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block font-bold text-stone-700">Mã lớp *</label>
              <input
                type="text"
                data-testid="schedule-class-code-input"
                disabled={!isCreateMode}
                value={classCode}
                onChange={(e) => setClassCode(e.target.value.toUpperCase())}
                placeholder="VD: YCT2-04"
                className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-900 disabled:bg-stone-100"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="mb-1 block font-bold text-stone-700">Tên hiển thị lớp học *</label>
              <input
                type="text"
                data-testid="schedule-class-name-input"
                disabled={!isAdmin}
                value={className}
                onChange={(e) => setClassName(e.target.value)}
                placeholder="VD: Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6"
                className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900 disabled:bg-stone-100"
              />
            </div>

            {isAdmin && (
              <>
                <div className="sm:col-span-2">
                  <label className="mb-1 block font-bold text-stone-700">
                    Giáo viên phụ trách (Chỉ Quản lý được đổi)
                  </label>
                  <select
                    data-testid="schedule-teacher-select"
                    value={selectedTeacherEmail}
                    onChange={(e) => setSelectedTeacherEmail(e.target.value)}
                    className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                  >
                    <option value="">-- Chọn giáo viên phụ trách --</option>
                    {selectableTeachers.map((t) => (
                      <option key={t.code || t.email} value={t.email}>
                        {t.name} ({t.email})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="mb-1 block font-bold text-stone-700">Tổng số buổi</label>
                  <input
                    type="number"
                    min={1}
                    max={200}
                    value={totalLessons}
                    onChange={(e) => setTotalLessons(Number(e.target.value) || 25)}
                    className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                  />
                </div>
              </>
            )}
          </div>

          {/* Section 2: Schedule Status & Mode */}
          <div className="space-y-3 rounded-xl border border-stone-200 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-red-800" />
                <span className="font-display text-xs font-bold text-stone-900">
                  Cấu hình giờ học chính thức
                </span>
              </div>

              <div className="flex items-center gap-1.5">
                <select
                  data-testid="schedule-status-select"
                  value={status}
                  onChange={(e) => {
                    setStatusManuallyChanged(true);
                    setStatus(e.target.value as 'confirmed' | 'unconfirmed' | 'paused');
                  }}
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-800"
                >
                  <option value="confirmed">Đã xác nhận lịch chính thức</option>
                  <option value="unconfirmed">Chưa có lịch học chính thức</option>
                  <option value="paused">Tạm dừng nhắc lịch</option>
                </select>

                <select
                  data-testid="schedule-mode-select"
                  value={scheduleMode}
                  onChange={(e) =>
                    setScheduleMode(e.target.value as 'weekly' | 'custom_sessions')
                  }
                  className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700"
                >
                  <option value="weekly">Lặp hằng tuần</option>
                  <option value="custom_sessions">Lịch riêng từng buổi</option>
                </select>
              </div>
            </div>

            {scheduleMode === 'weekly' ? (
              <>
                {/* Days of week */}
                <div>
                  <label className="mb-1.5 block font-bold text-stone-700">
                    Chọn thứ trong tuần *
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {DAY_OPTIONS.map((day) => {
                      const active = daysOfWeek.includes(day.value);
                      return (
                        <button
                          key={day.value}
                          type="button"
                          data-testid={`schedule-day-btn-${day.value}`}
                          onClick={() => toggleDayOfWeek(day.value)}
                          className={`rounded-lg border px-3 py-1.5 text-xs font-bold transition-colors ${
                            active
                              ? 'border-red-800 bg-red-800 text-white shadow-2xs'
                              : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Start/End Time & Timezone */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="mb-1 block font-bold text-stone-700">
                      <Clock className="mr-1 inline h-3.5 w-3.5 text-stone-500" />
                      Giờ bắt đầu *
                    </label>
                    <input
                      type="time"
                      data-testid="schedule-start-time-input"
                      value={startTime}
                      onChange={(e) => {
                        const val = e.target.value;
                        setStartTime(val);
                        if (!endTime && /^\d{2}:\d{2}$/.test(val)) {
                          const [hh, mm] = val.split(':').map(Number);
                          const nextH = String((hh + 1) % 24).padStart(2, '0');
                          setEndTime(`${nextH}:${String(mm).padStart(2, '0')}`);
                        }
                        if (
                          isCreateMode &&
                          !statusManuallyChanged &&
                          daysOfWeek.length > 0 &&
                          /^\d{2}:\d{2}$/.test(val)
                        ) {
                          setStatus('confirmed');
                        }
                      }}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-stone-700">
                      <Clock className="mr-1 inline h-3.5 w-3.5 text-stone-500" />
                      Giờ kết thúc *
                    </label>
                    <input
                      type="time"
                      data-testid="schedule-end-time-input"
                      value={endTime}
                      onChange={(e) => setEndTime(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-stone-700">
                      <Globe className="mr-1 inline h-3.5 w-3.5 text-stone-500" />
                      Múi giờ
                    </label>
                    <input
                      type="text"
                      disabled
                      value={timezone}
                      className="w-full rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5 text-xs font-semibold text-stone-600"
                    />
                  </div>
                </div>

                {/* Effective From & Effective Until */}
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="mb-1 block font-bold text-stone-700">
                      Ngày bắt đầu áp dụng
                    </label>
                    <input
                      type="date"
                      data-testid="schedule-effective-from-input"
                      value={effectiveFrom}
                      onChange={(e) => setEffectiveFrom(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block font-bold text-stone-700">
                      Ngày kết thúc (Tùy chọn)
                    </label>
                    <input
                      type="date"
                      data-testid="schedule-effective-until-input"
                      value={effectiveUntil}
                      onChange={(e) => setEffectiveUntil(e.target.value)}
                      className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                    />
                  </div>
                </div>
              </>
            ) : (
              /* Custom Sessions Mode */
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-stone-700">
                    Danh sách các buổi học riêng ({customSessions.length})
                  </span>
                  <button
                    type="button"
                    onClick={handleAddCustomSession}
                    className="inline-flex items-center gap-1 rounded-lg bg-stone-800 px-2.5 py-1 text-[11px] font-bold text-white"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Thêm buổi
                  </button>
                </div>
                {customSessions.map((cs, idx) => (
                  <div
                    key={idx}
                    className="grid grid-cols-1 gap-2 rounded-lg border border-stone-200 bg-stone-50 p-2 sm:grid-cols-4"
                  >
                    <input
                      type="date"
                      value={cs.date}
                      onChange={(e) => {
                        const next = [...customSessions];
                        next[idx] = { ...cs, date: e.target.value };
                        setCustomSessions(next);
                      }}
                      className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                    />
                    <input
                      type="time"
                      value={cs.startTime}
                      onChange={(e) => {
                        const next = [...customSessions];
                        next[idx] = { ...cs, startTime: e.target.value };
                        setCustomSessions(next);
                      }}
                      className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                    />
                    <input
                      type="time"
                      value={cs.endTime}
                      onChange={(e) => {
                        const next = [...customSessions];
                        next[idx] = { ...cs, endTime: e.target.value };
                        setCustomSessions(next);
                      }}
                      className="rounded border border-stone-300 bg-white px-2 py-1 text-xs"
                    />
                    <button
                      type="button"
                      onClick={() =>
                        setCustomSessions((prev) => prev.filter((_, i) => i !== idx))
                      }
                      className="inline-flex items-center justify-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-xs font-bold text-red-700"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Xóa
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Optional valid online room link */}
            <div>
              <label className="mb-1 block font-bold text-stone-700">
                <Video className="mr-1 inline h-3.5 w-3.5 text-stone-500" />
                Link phòng học trực tuyến (Tùy chọn — Để trống nếu mở chi tiết lớp trên Sổ liên lạc)
              </label>
              <input
                type="url"
                data-testid="schedule-meeting-url-input"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                placeholder="https://zoom.us/j/... hoặc để trống"
                className="w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900"
              />
            </div>

            {/* Live summary banner */}
            <div
              data-testid="schedule-live-summary"
              className="rounded-xl border border-red-200 bg-red-50/70 px-3 py-2 font-display text-xs font-bold text-red-950"
            >
              {formattedSummaryLine}
            </div>
          </div>

          {/* Section 3: Date-specific Exceptions (Postpone / Cancel / Reschedule / Holiday) */}
          <div className="space-y-2.5 rounded-xl border border-stone-200 p-3">
            <p className="font-display text-xs font-bold text-stone-900">
              Ngoại lệ theo ngày (Đổi giờ 1 buổi / Hoãn / Nghỉ lễ / Hủy buổi)
            </p>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                  Ngày buổi học gốc
                </label>
                <input
                  type="date"
                  data-testid="exception-date-input"
                  value={newExcDate}
                  onChange={(e) => setNewExcDate(e.target.value)}
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                  Loại thay đổi
                </label>
                <select
                  data-testid="exception-type-select"
                  value={newExcType}
                  onChange={(e) =>
                    setNewExcType(e.target.value as ClassScheduleException['type'])
                  }
                  className="w-full rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-xs font-semibold"
                >
                  <option value="postponed">Hoãn buổi học</option>
                  <option value="cancelled">Hủy buổi học</option>
                  <option value="holiday">Nghỉ lễ</option>
                  <option value="rescheduled">Đổi giờ / Đổi ngày</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="mb-1 block text-[11px] font-semibold text-stone-600">
                  Lý do / Ghi chú gửi học viên
                </label>
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    data-testid="exception-note-input"
                    value={newExcNote}
                    onChange={(e) => setNewExcNote(e.target.value)}
                    placeholder="VD: Nghỉ lễ / Đổi giờ sang 20:00"
                    className="min-w-0 flex-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="button"
                    data-testid="add-exception-btn"
                    onClick={handleAddException}
                    className="shrink-0 rounded-lg bg-stone-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-stone-900"
                  >
                    + Thêm
                  </button>
                </div>
              </div>
            </div>

            {newExcType === 'rescheduled' && (
              <div className="grid grid-cols-1 gap-2 rounded-lg border border-amber-200 bg-amber-50/60 p-2.5 sm:grid-cols-3">
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                    Ngày học bù (Tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={newExcNewDate}
                    onChange={(e) => setNewExcNewDate(e.target.value)}
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                    Giờ bắt đầu mới
                  </label>
                  <input
                    type="time"
                    data-testid="exception-new-start-input"
                    value={newExcStartTime}
                    onChange={(e) => setNewExcStartTime(e.target.value)}
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold text-amber-950">
                    Giờ kết thúc mới
                  </label>
                  <input
                    type="time"
                    data-testid="exception-new-end-input"
                    value={newExcEndTime}
                    onChange={(e) => setNewExcEndTime(e.target.value)}
                    className="w-full rounded border border-amber-300 bg-white px-2 py-1 text-xs"
                  />
                </div>
              </div>
            )}

            {exceptions.length > 0 && (
              <div data-testid="schedule-exceptions-list" className="space-y-1.5 pt-1">
                {exceptions.map((exc) => (
                  <div
                    key={exc.date}
                    className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5"
                  >
                    <div className="min-w-0">
                      <span className="font-bold text-stone-900">{exc.date}</span>
                      <span className="mx-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {EXCEPTION_TYPE_LABELS[exc.type] || exc.type}
                      </span>
                      {exc.type === 'rescheduled' && (
                        <span className="text-[11px] font-semibold text-stone-700">
                          → {exc.newDate || exc.date} ({exc.startTime}–{exc.endTime})
                        </span>
                      )}
                      {exc.note && (
                        <span className="ml-1.5 text-[11px] text-stone-500">• {exc.note}</span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setExceptions((prev) => prev.filter((item) => item.date !== exc.date))
                      }
                      className="text-stone-400 hover:text-red-700"
                      aria-label={`Xóa ngoại lệ ngày ${exc.date}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Section 4: Upcoming Sessions Preview */}
          <div
            data-testid="schedule-upcoming-preview"
            className="rounded-xl border border-stone-200 bg-stone-50/80 p-3"
          >
            <div className="mb-2 flex items-center justify-between">
              <span className="font-display text-xs font-bold text-stone-900">
                Xem trước các buổi học sắp tới
              </span>
              <span className="text-[11px] text-stone-500">
                Tự động nhắc trước 30 phút (Giờ VN)
              </span>
            </div>

            {previewSessions.length === 0 ? (
              <p className="py-2 text-center text-xs text-stone-500">
                Chưa có buổi học sắp tới được xác nhận.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {previewSessions.map((s, idx) => {
                  const isCancelledOrPostponed =
                    s.status === 'cancelled' || s.status === 'postponed' || s.status === 'holiday';
                  return (
                    <div
                      key={`${s.date}-${idx}`}
                      className={`flex items-center justify-between rounded-lg border px-2.5 py-1.5 ${
                        isCancelledOrPostponed
                          ? 'border-stone-200 bg-stone-100 text-stone-400 line-through'
                          : 'border-emerald-200 bg-white text-stone-800'
                      }`}
                    >
                      <div>
                        <p className="font-bold">
                          {s.dayLabel}, {s.date}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {s.startTime} – {s.endTime}
                          {s.note ? ` • ${s.note}` : ''}
                        </p>
                      </div>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isCancelledOrPostponed
                            ? 'bg-stone-200 text-stone-600'
                            : s.status === 'rescheduled'
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isCancelledOrPostponed
                          ? EXCEPTION_TYPE_LABELS[s.status as ClassScheduleException['type']]
                          : s.status === 'rescheduled'
                          ? 'Đã đổi giờ'
                          : 'Sẽ nhắc giờ'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Audit log info & notify checkbox */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-stone-700">
              <input
                type="checkbox"
                checked={notifyMembers}
                onChange={(e) => setNotifyMembers(e.target.checked)}
                className="h-4 w-4 rounded accent-red-800"
              />
              <span>Thông báo cho học viên & giáo viên trong lớp khi thay đổi lịch</span>
            </label>

            {classItem?.scheduleConfig?.updatedBy && (
              <span className="inline-flex items-center gap-1 text-[11px] text-stone-500">
                <History className="h-3 w-3" />
                Cập nhật bởi: {classItem.scheduleConfig.updatedBy}
              </span>
            )}
          </div>

          {/* Footer Buttons */}
          <div className="flex items-center justify-end gap-2 border-t border-stone-200 pt-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-stone-300 bg-white px-4 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
            >
              Hủy
            </button>
            <button
              type="submit"
              data-testid="save-class-schedule-btn"
              disabled={isSubmitting}
              className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-50"
            >
              <CheckCircle2 className="h-4 w-4" />
              <span>
                {isSubmitting
                  ? 'Đang lưu...'
                  : isCreateMode
                  ? 'Tạo lớp & Lưu lịch học'
                  : 'Lưu lịch học'}
              </span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
