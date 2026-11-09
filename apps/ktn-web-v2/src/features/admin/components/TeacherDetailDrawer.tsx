import React, { useState, useEffect } from 'react';
import {
  X,
  User,
  GraduationCap,
  Calendar,
  FileCheck2,
  MessageSquare,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  Award,
  Lock,
  Unlock,
  KeyRound,
  Loader2,
  Save,
} from 'lucide-react';
import type {
  KtnClassItem,
  KtnCourse,
  KtnTeacherRecord,
} from '@/types/ktn.types';

export interface TeacherDetailDrawerProps {
  teacher: KtnTeacherRecord | null;
  open?: boolean;
  isOpen?: boolean;
  onClose: () => void;
  classesList: KtnClassItem[];
  catalogCourses: KtnCourse[];
  isSaving: boolean;
  isAdjustingPoints?: boolean;
  onSaveTeacher?: (payload: {
    code: string;
    name: string;
    email: string;
    phone?: string;
    specialization?: string;
    bio?: string;
    notes?: string;
    active?: boolean;
    password?: string;
    assignedClasses: string[];
    assignedCourses: string[];
  }) => Promise<unknown>;
  onAdjustForumPoints?: (payload: {
    teacherId: string;
    pointsDelta: number;
    reason: string;
  }) => Promise<unknown>;
  onUpdateTeacher?: (payload: {
    code: string;
    name: string;
    email: string;
    phone?: string;
    specialization?: string;
    bio?: string;
    notes?: string;
    active?: boolean;
    password?: string;
    assignedClasses: string[];
    assignedCourses: string[];
  }) => Promise<unknown>;
  onAdjustPoints?: (payload: {
    teacherId: string;
    pointsDelta: number;
    reason: string;
  }) => Promise<unknown>;
}

export const TeacherDetailDrawer: React.FC<TeacherDetailDrawerProps> = ({
  teacher,
  open,
  isOpen,
  onClose,
  classesList,
  catalogCourses,
  isSaving,
  isAdjustingPoints = false,
  onSaveTeacher,
  onAdjustForumPoints,
  onUpdateTeacher,
  onAdjustPoints,
}) => {
  const [activeTab, setActiveTab] = useState<
    'info' | 'assignments' | 'teaching' | 'grading' | 'forum' | 'account'
  >('info');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [bio, setBio] = useState('');
  const [notes, setNotes] = useState('');
  const [assignedClasses, setAssignedClasses] = useState<string[]>([]);
  const [assignedCourses, setAssignedCourses] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  // Forum points adjustment state
  const [pointsDeltaInput, setPointsDeltaInput] = useState<string>('5');
  const [pointsReasonInput, setPointsReasonInput] = useState<string>('');

  useEffect(() => {
    if (!teacher) return;
    setName(teacher.name || '');
    setPhone(teacher.phone || '');
    setSpecialization(teacher.specialization || '');
    setBio(teacher.bio || '');
    setNotes(teacher.notes || '');
    setAssignedClasses(
      Array.isArray(teacher.assigned_classes) ? teacher.assigned_classes : []
    );
    setAssignedCourses(
      Array.isArray(teacher.assigned_courses) ? teacher.assigned_courses : []
    );
    setNewPassword('');
    setPointsDeltaInput('5');
    setPointsReasonInput('');
  }, [teacher?.code, teacher?.email]);

  const isDrawerOpen = Boolean(open ?? isOpen);

  if (!isDrawerOpen || !teacher) return null;

  const isActive = teacher.active !== false && teacher.status !== 'suspended';

  const toggleClass = (clsId: string) => {
    setAssignedClasses((prev) =>
      prev.includes(clsId) ? prev.filter((x) => x !== clsId) : [...prev, clsId]
    );
  };

  const toggleCourse = (courseId: string) => {
    setAssignedCourses((prev) =>
      prev.includes(courseId) ? prev.filter((x) => x !== courseId) : [...prev, courseId]
    );
  };

  const handleSave = async (overrideActive?: boolean, overridePassword?: string) => {
    const saveFn = onSaveTeacher || onUpdateTeacher;
    if (!saveFn) return;
    await saveFn({
      code: teacher.code,
      name: name.trim() || teacher.name,
      email: teacher.email,
      phone: phone.trim(),
      specialization: specialization.trim(),
      bio: bio.trim(),
      notes: notes.trim(),
      active: overrideActive !== undefined ? overrideActive : isActive,
      password: overridePassword?.trim() || undefined,
      assignedClasses,
      assignedCourses,
    });
    if (overridePassword) setNewPassword('');
  };

  return (
    <div
      data-testid="teacher-detail-drawer-root"
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
    >
      <div
        onClick={() => {
          if (!isSaving && !isAdjustingPoints) onClose();
        }}
        className="fixed inset-0 bg-stone-950/40 backdrop-blur-[1px]"
      />

      <aside
        data-testid="teacher-detail-drawer"
        className="relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl sm:border-l sm:border-stone-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-50/90 px-4 py-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2
                data-testid="teacher-drawer-name"
                className="truncate font-display text-sm font-extrabold text-stone-900 sm:text-base"
              >
                {teacher.name}
              </h2>
              <span className="rounded bg-stone-200 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-700">
                {teacher.code}
              </span>
              {isActive ? (
                <span className="rounded-md bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                  Đang hoạt động
                </span>
              ) : (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  Tạm khóa
                </span>
              )}
            </div>
            <p className="truncate font-mono text-xs font-semibold text-red-900">
              {teacher.email}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 6 Tabs Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50/50 px-3 py-2">
          {(
            [
              { id: 'info', label: 'Thông tin', icon: User },
              { id: 'assignments', label: 'Phân công', icon: GraduationCap },
              { id: 'teaching', label: 'Dạy học', icon: Calendar },
              { id: 'grading', label: 'Chấm bài', icon: FileCheck2 },
              { id: 'forum', label: 'Diễn đàn', icon: MessageSquare },
              { id: 'account', label: 'Tài khoản', icon: ShieldCheck },
            ] as const
          ).map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                data-testid={`teacher-drawer-tab-${t.id}`}
                onClick={() => setActiveTab(t.id)}
                className={`inline-flex min-h-[32px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  activeTab === t.id
                    ? 'bg-red-800 text-white shadow-2xs'
                    : 'bg-white text-stone-700 hover:bg-stone-100'
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Body */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* TAB 1: THÔNG TIN */}
          {activeTab === 'info' && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSave();
              }}
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
            >
              <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                Hồ sơ giáo viên
              </h3>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Họ và tên giáo viên
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Số điện thoại
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Chuyên môn giảng dạy
                  </label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder="VD: HSK 1-4, YCT thiếu nhi"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Giới thiệu / Bằng cấp
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder="Thông tin giới thiệu chuyên môn..."
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Ghi chú nội bộ Quản lý
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Ghi chú lịch rảnh, đánh giá nội bộ..."
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>Lưu thông tin</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: PHÂN CÔNG */}
          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  Lớp trực tiếp phụ trách ({assignedClasses.length})
                </h3>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Giáo viên chỉ được nhắn tin, giao bài, chấm bài và tạo học viên trong các lớp được phân công.
                </p>

                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {classesList.map((cls) => {
                    const checked = assignedClasses.includes(cls.id);
                    return (
                      <label
                        key={cls.id}
                        className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs ${
                          checked
                            ? 'border-red-300 bg-red-50/70 font-bold text-red-950'
                            : 'border-stone-200 bg-stone-50/60 text-stone-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleClass(cls.id)}
                          className="rounded border-stone-300 text-red-800"
                        />
                        <span className="truncate">
                          {cls.id} · {cls.name}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  Khóa học video phụ trách ({assignedCourses.length})
                </h3>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Giáo viên nhận thông báo hỏi đáp bài học và giải đáp cho học viên trong các khóa học này.
                </p>

                <div className="mt-2.5 max-h-60 space-y-1.5 overflow-y-auto pr-1">
                  {catalogCourses
                    .filter((c) => !c.isBundle)
                    .map((c) => {
                      const checked = assignedCourses.includes(c.id);
                      return (
                        <label
                          key={c.id}
                          className={`flex cursor-pointer items-center gap-2 rounded-xl border p-2.5 text-xs ${
                            checked
                              ? 'border-red-300 bg-red-50/70 font-bold text-red-950'
                              : 'border-stone-200 bg-stone-50/60 text-stone-700'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleCourse(c.id)}
                            className="rounded border-stone-300 text-red-800"
                          />
                          <span className="truncate">{c.title}</span>
                        </label>
                      );
                    })}
                </div>
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  data-testid="teacher-drawer-save-assignments-btn"
                  disabled={isSaving}
                  onClick={() => handleSave()}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                >
                  {isSaving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  <span>Lưu phân công</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DẠY HỌC (3-TIER TEACHING SESSION STATS) */}
          {activeTab === 'teaching' && (
            <div
              data-testid="teacher-drawer-teaching-panel"
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  Thống kê buổi dạy thực tế (3 tầng đối chiếu)
                </h3>

                {teacher.teachingVerificationStatus === 'verified' ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Đã xác minh qua điểm danh
                  </span>
                ) : (
                  <span
                    data-testid="teacher-unverified-sessions-badge"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Chưa xác minh số buổi thực dạy
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[11px] font-semibold text-stone-500">
                    1. Số buổi theo lịch
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
                    {teacher.scheduledSessionsCount ?? 0} buổi
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-500">
                    Tổng tiến độ buổi theo lịch các lớp phụ trách
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[11px] font-semibold text-stone-500">
                    2. Buổi đã tạo nội dung
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-blue-900">
                    {teacher.recordedClassSessionsCount ?? 0} buổi
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-500">
                    Có lưu nội dung/bài tập trên <code className="font-mono">ktn_class_sessions</code>
                  </p>
                </div>

                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <p className="text-[11px] font-semibold text-emerald-900">
                    3. Buổi có điểm danh xác nhận
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-emerald-900">
                    {teacher.attendanceConfirmedSessionsCount ?? 0} buổi
                  </p>
                  <p className="mt-0.5 text-[10px] text-emerald-800">
                    Xác thực qua dữ liệu điểm danh <code className="font-mono">ktn_attendance</code>
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs text-stone-700">
                <p>
                  Tổng học viên thuộc các lớp phụ trách:{' '}
                  <strong>{teacher.managedStudentsCount ?? 0} học viên</strong>
                </p>
                <p className="mt-1 text-[11px] text-stone-500">
                  Lưu ý: Hệ thống không tự suy diễn số buổi thực dạy từ thời khóa biểu nếu giáo viên chưa lưu điểm danh buổi học.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: CHẤM BÀI */}
          {activeTab === 'grading' && (
            <div
              data-testid="teacher-drawer-grading-panel"
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
            >
              <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                Hiệu suất chấm bài tập
              </h3>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
                  <p className="text-[11px] font-semibold text-emerald-900">
                    Đã chấm điểm
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-emerald-900">
                    {teacher.gradedHomeworksCount ?? 0} bài
                  </p>
                </div>

                <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                  <p className="text-[11px] font-semibold text-amber-900">
                    Đang chờ chấm
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-amber-900">
                    {teacher.pendingHomeworksCount ?? 0} bài
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[11px] font-semibold text-stone-600">
                    Thời gian phản hồi TB
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
                    {teacher.avgGradingTurnaroundHours !== null &&
                    teacher.avgGradingTurnaroundHours !== undefined
                      ? `${teacher.avgGradingTurnaroundHours} giờ`
                      : 'Chưa có dữ liệu'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: DIỄN ĐÀN & ĐIỂM ĐÓNG GÓP */}
          {activeTab === 'forum' && (
            <div
              data-testid="teacher-drawer-forum-panel"
              className="space-y-4"
            >
              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  Đóng góp Hỏi đáp bài học & Điểm thưởng
                </h3>

                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5">
                    <p className="text-[10px] font-semibold text-amber-900">
                      Điểm tháng này
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-amber-950">
                      {teacher.monthlyContributionPoints ?? 0} đ
                    </p>
                  </div>

                  <div className="rounded-xl border border-red-200 bg-red-50/70 p-2.5">
                    <p className="text-[10px] font-semibold text-red-900">
                      Tổng điểm tích lũy
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-red-950">
                      {teacher.totalContributionPoints ?? 0} đ
                    </p>
                  </div>

                  <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                    <p className="text-[10px] font-semibold text-stone-600">
                      Câu trả lời / Video
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-stone-900">
                      {teacher.forumAnswersCount ?? 0} /{' '}
                      <span className="text-red-800">
                        {teacher.forumVideoAnswersCount ?? 0} video
                      </span>
                    </p>
                  </div>

                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5">
                    <p className="text-[10px] font-semibold text-emerald-900">
                      HV xác nhận hiểu bài
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-emerald-900">
                      {teacher.forumAcceptedAnswersCount ?? 0} câu
                    </p>
                  </div>
                </div>
              </div>

              {/* Admin manual point adjustment / revocation */}
              <form
                data-testid="admin-adjust-teacher-points-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const delta = Number(pointsDeltaInput);
                  if (!Number.isFinite(delta) || delta === 0 || !pointsReasonInput.trim()) {
                    return;
                  }
                  const adjustFn = onAdjustForumPoints || onAdjustPoints;
                  if (!adjustFn) return;
                  await adjustFn({
                    teacherId: teacher.code || teacher.email,
                    pointsDelta: delta,
                    reason: pointsReasonInput.trim(),
                  });
                  setPointsReasonInput('');
                }}
                className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-red-800" />
                  <h4 className="font-display text-xs font-bold text-stone-900">
                    Điều chỉnh / Thu hồi điểm đóng góp (Ghi nhận kiểm toán)
                  </h4>
                </div>
                <p className="text-[11px] text-stone-500">
                  Nhập số dương (VD: <code className="font-mono">+10</code>) để thưởng thêm hoặc số âm (VD: <code className="font-mono">-5</code>) để thu hồi điểm khi câu trả lời sơ sài/spam.
                </p>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Số điểm (+/-) *
                    </label>
                    <input
                      type="number"
                      required
                      data-testid="admin-adjust-points-delta-input"
                      value={pointsDeltaInput}
                      onChange={(e) => setPointsDeltaInput(e.target.value)}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-900"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block text-[11px] font-bold text-stone-700">
                      Lý do điều chỉnh *
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="admin-adjust-points-reason-input"
                      value={pointsReasonInput}
                      onChange={(e) => setPointsReasonInput(e.target.value)}
                      placeholder="VD: Thưởng giải đáp xuất sắc / Thu hồi câu trả lời quá ngắn..."
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="admin-submit-adjust-points-btn"
                    disabled={isAdjustingPoints || !pointsReasonInput.trim()}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {isAdjustingPoints && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Ghi nhận điều chỉnh điểm</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 6: TÀI KHOẢN */}
          {activeTab === 'account' && (
            <div
              data-testid="teacher-drawer-account-panel"
              className="space-y-4"
            >
              <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  Trạng thái hoạt động tài khoản giáo viên
                </h3>
                <p className="mt-1 text-xs text-stone-600">
                  Khi tạm khóa, giáo viên không thể đăng nhập, nhắn tin nhóm lớp hoặc tạo học viên mới, nhưng toàn bộ lịch sử chấm bài và câu trả lời diễn đàn vẫn được bảo toàn.
                </p>

                <div className="mt-3">
                  <button
                    type="button"
                    data-testid="admin-toggle-teacher-active-btn"
                    disabled={isSaving}
                    onClick={() => handleSave(!isActive)}
                    className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-xl px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50 ${
                      isActive
                        ? 'bg-amber-700 hover:bg-amber-800'
                        : 'bg-emerald-700 hover:bg-emerald-800'
                    }`}
                  >
                    {isActive ? (
                      <>
                        <Lock className="h-3.5 w-3.5" />
                        <span>Tạm khóa tài khoản giáo viên</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>Mở khóa tài khoản giáo viên</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newPassword.trim()) return;
                  handleSave(undefined, newPassword.trim());
                }}
                className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-4 w-4 text-red-800" />
                  <h4 className="font-display text-xs font-bold text-stone-900">
                    Đặt lại mật khẩu đăng nhập giáo viên
                  </h4>
                </div>
                <input
                  type="text"
                  data-testid="admin-reset-teacher-password-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nhập mật khẩu mới (tối thiểu 8 ký tự)..."
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={isSaving || newPassword.trim().length < 6}
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    <span>Cập nhật mật khẩu</span>
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
