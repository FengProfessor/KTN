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
  Trash2,
} from 'lucide-react';
import type {
  KtnClassItem,
  KtnCourse,
  KtnTeacherRecord,
} from '@/types/ktn.types';
import { ktnApi } from '@/services/api/ktnApiClient';
import { translateCourseTitle, translateScheduleText, useI18n } from '@/i18n';

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
    specialty?: string;
    bio?: string;
    notes?: string;
    active?: boolean;
    password?: string;
    initialPassword?: string;
    assignedClasses: string[];
    assignedCourses: string[];
  }) => Promise<unknown>;
  onAdjustForumPoints?: (payload: {
    teacherId: string;
    teacherEmail?: string;
    pointsDelta: number;
    reason: string;
  }) => Promise<unknown>;
  onUpdateTeacher?: (payload: {
    code: string;
    name: string;
    email: string;
    phone?: string;
    specialization?: string;
    specialty?: string;
    bio?: string;
    notes?: string;
    active?: boolean;
    password?: string;
    initialPassword?: string;
    assignedClasses: string[];
    assignedCourses: string[];
  }) => Promise<unknown>;
  onAdjustPoints?: (payload: {
    teacherId: string;
    teacherEmail?: string;
    pointsDelta: number;
    reason: string;
  }) => Promise<unknown>;
  onDeleteTeacher?: (teacher: KtnTeacherRecord) => void;
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
  onDeleteTeacher,
}) => {
  const { lang, tr } = useI18n();
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
  const [newPassword, setNewPassword] = useState('12345678');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  // Forum points adjustment state
  const [pointsDeltaInput, setPointsDeltaInput] = useState<string>('5');
  const [pointsReasonInput, setPointsReasonInput] = useState<string>('');

  useEffect(() => {
    if (!teacher) return;
    setName(teacher.name || '');
    setPhone(teacher.phone || '');
    setSpecialization(teacher.specialization || teacher.specialty || '');
    setBio(teacher.bio || '');
    setNotes(teacher.notes || '');
    setAssignedClasses(
      Array.isArray(teacher.assigned_classes) ? teacher.assigned_classes : []
    );
    setAssignedCourses(
      Array.isArray(teacher.assigned_courses) ? teacher.assigned_courses : []
    );
    setNewPassword('12345678');
    setResetPasswordFeedback(null);
    setPointsDeltaInput('5');
    setPointsReasonInput('');
  }, [teacher?.code, teacher?.email]);

  const isDrawerOpen = Boolean(open ?? isOpen);

  if (!isDrawerOpen || !teacher) return null;

  const isActive =
    teacher.active !== false &&
    teacher.status !== 'suspended' &&
    teacher.status !== 'locked' &&
    teacher.status !== 'inactive';

  // Strict 3-tier session metrics: NEVER fall back to scheduledSessionsCount for recorded or confirmed taught counts!
  const scheduledSessionsCount =
    teacher.scheduledSessionsCount ??
    teacher.stats?.scheduledSessionsCount ??
    0;
  const recordedClassSessionsCount =
    teacher.activitySessionsCount ??
    teacher.recordedClassSessionsCount ??
    0;
  const confirmedTaughtSessionsCount =
    teacher.confirmedSessionsCount ??
    teacher.attendanceConfirmedSessionsCount ??
    teacher.stats?.confirmedTaughtSessionsCount ??
    0;
  const isTeachingVerified =
    confirmedTaughtSessionsCount > 0 &&
    teacher.teachingVerificationStatus !== 'unverified' &&
    teacher.stats?.unverifiedTeachingLog !== true;

  const gradedHomeworksCount =
    teacher.gradedHomeworksCount ??
    teacher.stats?.submissionsReviewedCount ??
    0;
  const pendingHomeworksCount =
    teacher.pendingHomeworksCount ??
    teacher.stats?.pendingGradingCount ??
    0;
  const avgGradingHours =
    teacher.avgGradingTurnaroundHours ??
    teacher.stats?.avgGradingHours ??
    null;

  const monthlyContributionPoints = teacher.monthlyContributionPoints ?? 0;
  const totalContributionPoints =
    teacher.totalContributionPoints ??
    teacher.stats?.totalContributionPoints ??
    0;
  const forumAnswersCount =
    teacher.forumAnswersCount ??
    teacher.stats?.forumAnswersCount ??
    0;
  const videoGuidesCount =
    teacher.videoGuidesCount ??
    teacher.forumVideoAnswersCount ??
    teacher.stats?.videoAnswersCount ??
    0;
  const acceptedAnswersCount =
    teacher.acceptedAnswersCount ??
    teacher.forumAcceptedAnswersCount ??
    teacher.stats?.acceptedAnswersCount ??
    0;
  const helpfulVotesCount = teacher.helpfulVotesCount ?? 0;

  const assignedClassDetails = assignedClasses.map((clsId) => {
    const matched = classesList.find(
      (c) => c.id.toUpperCase() === String(clsId).toUpperCase()
    );
    const rawOfficial = String(matched?.officialScheduleText || '').trim();
    const hasOfficialSchedule =
      Boolean(rawOfficial) && rawOfficial !== 'Chưa có lịch học chính thức';
    const rawFallback = String(
      matched?.schedule || matched?.legacyScheduleText || ''
    ).trim();
    const hasFallbackSchedule =
      Boolean(rawFallback) && rawFallback !== 'Chưa có lịch học chính thức';
    const scheduleText = hasOfficialSchedule
      ? translateScheduleText(rawOfficial, lang)
      : hasFallbackSchedule
      ? translateScheduleText(rawFallback, lang)
      : tr(
          'Chưa xác nhận lịch giảng dạy chính thức',
          'Official teaching schedule pending'
        );
    const isScheduleConfirmed =
      matched?.scheduleStatus === 'confirmed'
        ? hasOfficialSchedule || hasFallbackSchedule
        : !matched?.scheduleStatus && hasOfficialSchedule;
    return {
      id: clsId,
      name: matched?.name
        ? translateScheduleText(matched.name, lang)
        : tr(`Lớp ${clsId}`, `Class ${clsId}`),
      scheduleText,
      isScheduleConfirmed,
      currentLesson: matched?.current_lesson ?? 0,
      totalLessons: matched?.total_lessons ?? 0,
    };
  });

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
    const cleanSpecialty = specialization.trim();
    const cleanPwd = overridePassword?.trim() || undefined;
    try {
      await saveFn({
        code: teacher.code,
        name: name.trim() || teacher.name,
        email: teacher.email,
        phone: phone.trim(),
        specialization: cleanSpecialty,
        specialty: cleanSpecialty,
        bio: bio.trim(),
        notes: notes.trim(),
        active: overrideActive !== undefined ? overrideActive : isActive,
        password: cleanPwd,
        initialPassword: cleanPwd,
        assignedClasses,
        assignedCourses,
      });
      if (overridePassword) setNewPassword('');
    } catch {
      // Error is handled by caller toast/mutation handler
    }
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
                  {tr('Đang hoạt động', 'Active')}
                </span>
              ) : (
                <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  {tr('Tạm khóa', 'Suspended')}
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
            aria-label={tr('Đóng', 'Close')}
            className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* 6 Tabs Navigation */}
        <div className="flex items-center gap-1 overflow-x-auto border-b border-stone-200 bg-stone-50/50 px-3 py-2">
          {(
            [
              { id: 'info', label: tr('Thông tin', 'Info'), icon: User },
              { id: 'assignments', label: tr('Phân công', 'Assignments'), icon: GraduationCap },
              { id: 'teaching', label: tr('Dạy học', 'Teaching'), icon: Calendar },
              { id: 'grading', label: tr('Chấm bài', 'Grading'), icon: FileCheck2 },
              { id: 'forum', label: tr('Diễn đàn', 'Forum'), icon: MessageSquare },
              { id: 'account', label: tr('Tài khoản', 'Account'), icon: ShieldCheck },
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
          {/* Quick Reset Password Card (always available when not on Account tab, and rendered inside Account tab when activeTab === 'account') */}
          {activeTab !== 'account' && (
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 shadow-2xs">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <KeyRound className="h-3.5 w-3.5 text-red-800" />
                  <span className="font-display text-xs font-bold text-stone-900">
                    {tr('Mật khẩu đăng nhập', 'Login password')} ({teacher.code || teacher.email})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <input
                    type="text"
                    data-testid="drawer-reset-password-input"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="12345678"
                    className="w-28 rounded-lg border border-stone-300 bg-white px-2.5 py-1 font-mono text-xs font-bold text-stone-900"
                  />
                  <button
                    type="button"
                    data-testid="drawer-reset-password-btn"
                    disabled={
                      isResettingPassword ||
                      isSaving ||
                      (newPassword.trim().length > 0 && newPassword.trim().length < 6)
                    }
                    onClick={async () => {
                      const targetPwd = newPassword.trim() || '12345678';
                      setIsResettingPassword(true);
                      setResetPasswordFeedback(null);
                      try {
                        const res = await ktnApi.resetUserPassword({
                          email: teacher.email,
                          role: 'teacher',
                          newPassword: targetPwd,
                        });
                        setResetPasswordFeedback({
                          ok: true,
                          message:
                            res.message ||
                            tr(
                              `Đã đặt lại mật khẩu giáo viên ${teacher.code || teacher.email} thành "${targetPwd}".`,
                              `Reset password for teacher ${teacher.code || teacher.email} to "${targetPwd}".`
                            ),
                        });
                      } catch (err: unknown) {
                        setResetPasswordFeedback({
                          ok: false,
                          message:
                            err instanceof Error
                              ? err.message
                              : tr(
                                  'Không thể đặt lại mật khẩu giáo viên.',
                                  'Could not reset teacher password.'
                                ),
                        });
                      } finally {
                        setIsResettingPassword(false);
                      }
                    }}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isResettingPassword ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <KeyRound className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {newPassword.trim() && newPassword.trim() !== '12345678'
                        ? tr(
                            `Đặt lại mật khẩu (${newPassword.trim()})`,
                            `Reset password (${newPassword.trim()})`
                          )
                        : tr('Đặt lại mật khẩu (12345678)', 'Reset password (12345678)')}
                    </span>
                  </button>
                </div>
              </div>
              {resetPasswordFeedback && (
                <p
                  data-testid="drawer-reset-password-feedback"
                  className={`mt-1.5 text-[11px] font-semibold ${
                    resetPasswordFeedback.ok ? 'text-emerald-800' : 'text-red-800'
                  }`}
                >
                  {resetPasswordFeedback.message}
                </p>
              )}
            </div>
          )}

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
                {tr('Hồ sơ giáo viên', 'Teacher profile')}
              </h3>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Họ và tên giáo viên', 'Full name')}
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
                    {tr('Số điện thoại', 'Phone number')}
                  </label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder={tr('VD: 0912345678', 'e.g. 0912345678')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {tr('Chuyên môn giảng dạy', 'Teaching specialization')}
                  </label>
                  <input
                    type="text"
                    value={specialization}
                    onChange={(e) => setSpecialization(e.target.value)}
                    placeholder={tr('VD: HSK 1-4, YCT thiếu nhi', 'e.g. HSK 1-4, YCT Kids')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Giới thiệu / Bằng cấp', 'Bio / Credentials')}
                </label>
                <textarea
                  rows={2}
                  value={bio}
                  onChange={(e) => setBio(e.target.value)}
                  placeholder={tr('Thông tin giới thiệu chuyên môn...', 'Teaching background & credentials...')}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Ghi chú nội bộ Quản lý', 'Internal admin notes')}
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={tr('Ghi chú lịch rảnh, đánh giá nội bộ...', 'Availability, internal notes...')}
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
                  <span>{tr('Lưu thông tin', 'Save info')}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: PHÂN CÔNG */}
          {activeTab === 'assignments' && (
            <div className="space-y-4">
              <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  {tr(
                    `Lớp trực tiếp phụ trách (${assignedClasses.length})`,
                    `Assigned live classes (${assignedClasses.length})`
                  )}
                </h3>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {tr(
                    'Giáo viên chỉ được nhắn tin, giao bài, chấm bài và tạo học viên trong các lớp được phân công.',
                    'Teachers can only chat, assign, grade, and add students in their assigned classes.'
                  )}
                </p>

                <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {classesList
                    .filter((cls) => cls.active !== false)
                    .map((cls) => {
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
                          {cls.id} · {translateScheduleText(cls.name, lang)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  {tr(
                    `Khóa học video phụ trách (${assignedCourses.length})`,
                    `Assigned video courses (${assignedCourses.length})`
                  )}
                </h3>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {tr(
                    'Giáo viên nhận thông báo hỏi đáp bài học và giải đáp cho học viên trong các khóa học này.',
                    'Teachers receive lesson Q&A notifications and reply to students in these courses.'
                  )}
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
                          <span className="truncate">{translateCourseTitle(c.title, lang)}</span>
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
                  <span>{tr('Lưu phân công', 'Save assignments')}</span>
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: DẠY HỌC (3-TIER TEACHING SESSION STATS & SCHEDULE) */}
          {activeTab === 'teaching' && (
            <div
              data-testid="teacher-drawer-teaching-panel"
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  {tr(
                    'Thống kê buổi dạy thực tế (3 tầng đối chiếu)',
                    'Actual teaching stats (3-tier reconciliation)'
                  )}
                </h3>

                {isTeachingVerified ? (
                  <span
                    data-testid="teacher-verified-sessions-badge"
                    className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    {tr(
                      `Đã xác minh qua điểm danh (${confirmedTaughtSessionsCount} buổi)`,
                      `Verified via attendance (${confirmedTaughtSessionsCount} sessions)`
                    )}
                  </span>
                ) : (
                  <span
                    data-testid="teacher-unverified-sessions-badge"
                    className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900"
                  >
                    <AlertTriangle className="h-3.5 w-3.5" />
                    {tr(
                      'Chưa xác minh số buổi thực dạy (Buổi có lịch ≠ Buổi thực dạy)',
                      'Actual taught sessions unverified (Scheduled ≠ Taught)'
                    )}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div
                  data-testid="teacher-drawer-scheduled-sessions"
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                >
                  <p className="text-[11px] font-semibold text-stone-500">
                    {tr('1. Số buổi theo lịch (Dự kiến)', '1. Scheduled sessions (Est.)')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
                    {tr(`${scheduledSessionsCount} buổi`, `${scheduledSessionsCount} sessions`)}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-500">
                    {tr(
                      'Tổng buổi dự kiến theo lịch lớp phụ trách (không tự tính là đã dạy)',
                      'Total planned sessions per assigned class schedule (not auto-counted as taught)'
                    )}
                  </p>
                </div>

                <div
                  data-testid="teacher-drawer-recorded-sessions"
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3"
                >
                  <p className="text-[11px] font-semibold text-stone-500">
                    {tr('2. Buổi đã tạo nội dung', '2. Content recorded')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-blue-900">
                    {tr(
                      `${recordedClassSessionsCount} buổi`,
                      `${recordedClassSessionsCount} sessions`
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-stone-500">
                    {tr(
                      'Có lưu nội dung/bài tập trên ',
                      'Has saved content/homework in '
                    )}
                    <code className="font-mono">ktn_class_sessions</code>
                  </p>
                </div>

                <div
                  data-testid="teacher-drawer-confirmed-sessions"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"
                >
                  <p className="text-[11px] font-semibold text-emerald-900">
                    {tr('3. Buổi thực dạy có xác nhận', '3. Confirmed taught sessions')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-emerald-900">
                    {tr(
                      `${confirmedTaughtSessionsCount} buổi`,
                      `${confirmedTaughtSessionsCount} sessions`
                    )}
                  </p>
                  <p className="mt-0.5 text-[10px] text-emerald-800">
                    {tr('Xác thực qua dữ liệu điểm danh ', 'Verified via attendance records in ')}
                    <code className="font-mono">ktn_attendance</code>
                  </p>
                </div>
              </div>

              {/* Teaching Schedule List for Assigned Classes */}
              <div
                data-testid="teacher-drawer-teaching-schedule-list"
                className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/80 p-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-stone-800">
                    {tr(
                      `Lịch giảng dạy các lớp phụ trách (${assignedClassDetails.length} lớp · ${assignedCourses.length} khóa video)`,
                      `Assigned teaching schedule (${assignedClassDetails.length} classes · ${assignedCourses.length} video courses)`
                    )}
                  </p>
                  <span
                    data-testid="teacher-drawer-managed-students"
                    className="rounded-md bg-white px-2 py-0.5 text-[11px] font-bold text-stone-700 border border-stone-200"
                  >
                    {tr(
                      `${teacher.managedStudentsCount ?? 0} học viên`,
                      `${teacher.managedStudentsCount ?? 0} students`
                    )}
                  </span>
                </div>

                {assignedClassDetails.length === 0 ? (
                  <p className="text-[11px] text-stone-500">
                    {tr(
                      'Giáo viên hiện chưa được phân công lớp trực tiếp nào.',
                      'This teacher has no assigned live classes yet.'
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {assignedClassDetails.map((cls) => (
                      <div
                        key={cls.id}
                        data-testid={`teacher-drawer-class-schedule-${cls.id}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-white px-2.5 py-2 text-xs"
                      >
                        <div>
                          <span className="font-bold text-stone-900">
                            {cls.id} · {cls.name}
                          </span>
                          <p className="text-[11px] text-stone-600">
                            {tr('Lịch học:', 'Schedule:')} <strong>{cls.scheduleText}</strong>
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                            {tr(
                              `Buổi ${cls.currentLesson}/${cls.totalLessons}`,
                              `Session ${cls.currentLesson}/${cls.totalLessons}`
                            )}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              cls.isScheduleConfirmed
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {cls.isScheduleConfirmed
                              ? tr('Lịch chính thức', 'Confirmed schedule')
                              : tr('Chưa xác nhận lịch', 'Unconfirmed schedule')}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                <p className="text-[11px] text-stone-500">
                  {tr('Lưu ý nguyên tắc đối soát:', 'Reconciliation rule:')}{' '}
                  <strong>
                    {tr('Buổi có lịch ≠ Buổi thực dạy', 'Scheduled session ≠ Taught session')}
                  </strong>
                  {tr(
                    '. Hệ thống tuyệt đối không tự động quy đổi buổi có lịch thành buổi thực dạy khi chưa có xác nhận điểm danh.',
                    '. The system never auto-converts scheduled sessions into taught sessions without attendance confirmation.'
                  )}
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
                {tr('Hiệu suất chấm bài tập', 'Homework grading performance')}
              </h3>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                <div
                  data-testid="teacher-drawer-graded-homeworks"
                  className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3"
                >
                  <p className="text-[11px] font-semibold text-emerald-900">
                    {tr('Đã chấm điểm', 'Graded')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-emerald-900">
                    {tr(`${gradedHomeworksCount} bài`, `${gradedHomeworksCount} items`)}
                  </p>
                </div>

                <div
                  data-testid="teacher-drawer-pending-homeworks"
                  className="rounded-xl border border-amber-200 bg-amber-50/70 p-3"
                >
                  <p className="text-[11px] font-semibold text-amber-900">
                    {tr('Đang chờ chấm', 'Pending grading')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-amber-900">
                    {tr(`${pendingHomeworksCount} bài`, `${pendingHomeworksCount} items`)}
                  </p>
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[11px] font-semibold text-stone-600">
                    {tr('Thời gian phản hồi TB', 'Avg turnaround time')}
                  </p>
                  <p className="mt-1 font-display text-lg font-extrabold text-stone-900">
                    {avgGradingHours !== null && avgGradingHours !== undefined
                      ? tr(`${avgGradingHours} giờ`, `${avgGradingHours} hrs`)
                      : tr('Chưa có dữ liệu', 'No data yet')}
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
                  {tr(
                    'Đóng góp Hỏi đáp bài học & Điểm thưởng',
                    'Lesson Q&A Contributions & Points'
                  )}
                </h3>

                <div className="mt-3 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                  <div
                    data-testid="teacher-drawer-monthly-points"
                    className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5"
                  >
                    <p className="text-[10px] font-semibold text-amber-900">
                      {tr('Điểm đóng góp tháng này', 'Points this month')}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-amber-950">
                      {tr(`${monthlyContributionPoints} đ`, `${monthlyContributionPoints} pts`)}
                    </p>
                  </div>

                  <div
                    data-testid="teacher-drawer-total-points"
                    className="rounded-xl border border-red-200 bg-red-50/70 p-2.5"
                  >
                    <p className="text-[10px] font-semibold text-red-900">
                      {tr('Tổng điểm tích lũy', 'Total accumulated')}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-red-950">
                      {tr(`${totalContributionPoints} đ`, `${totalContributionPoints} pts`)}
                    </p>
                  </div>

                  <div
                    data-testid="teacher-drawer-forum-answers-video"
                    className="rounded-xl border border-stone-200 bg-stone-50 p-2.5"
                  >
                    <p className="text-[10px] font-semibold text-stone-600">
                      {tr('Câu trả lời / Video giải đáp', 'Replies / Video guides')}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-stone-900">
                      {forumAnswersCount} /{' '}
                      <span className="text-red-800">
                        {videoGuidesCount} video
                      </span>
                    </p>
                  </div>

                  <div
                    data-testid="teacher-drawer-forum-resolved"
                    className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5"
                  >
                    <p className="text-[10px] font-semibold text-emerald-900">
                      {tr('Câu hỏi đã giải quyết', 'Accepted answers')}
                    </p>
                    <p className="mt-0.5 font-display text-base font-extrabold text-emerald-900">
                      {tr(`${acceptedAnswersCount} câu`, `${acceptedAnswersCount} solved`)}
                    </p>
                    {helpfulVotesCount > 0 && (
                      <p className="text-[10px] font-semibold text-emerald-800">
                        {tr(
                          `${helpfulVotesCount} lượt hữu ích`,
                          `${helpfulVotesCount} helpful votes`
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <p
                  data-testid="teacher-drawer-points-policy-note"
                  className="mt-2.5 rounded-lg bg-stone-50 px-2.5 py-1.5 text-[11px] text-stone-600"
                >
                  {tr(
                    'Chính sách điểm đóng góp: Điểm thưởng chỉ dùng để đánh giá chuyên môn và vinh danh giáo viên hỗ trợ học viên theo tháng, ',
                    'Contribution points policy: Points are only used for quality evaluation and monthly teacher recognition, '
                  )}
                  <strong>
                    {tr(
                      'không tự quy đổi thành lương hoặc phụ cấp tự động',
                      'never auto-converted into salary or allowances'
                    )}
                  </strong>
                  .
                </p>
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
                  try {
                    await adjustFn({
                      teacherId: teacher.code || teacher.email,
                      teacherEmail: teacher.email,
                      pointsDelta: delta,
                      reason: pointsReasonInput.trim(),
                    });
                    setPointsReasonInput('');
                  } catch {
                    // Error handled by caller mutation handler
                  }
                }}
                className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center gap-1.5">
                  <Award className="h-4 w-4 text-red-800" />
                  <h4 className="font-display text-xs font-bold text-stone-900">
                    {tr(
                      'Điều chỉnh / Thu hồi điểm đóng góp (Ghi nhận kiểm toán)',
                      'Adjust / Revoke Contribution Points (Audit Logged)'
                    )}
                  </h4>
                </div>
                <p className="text-[11px] text-stone-500">
                  {tr('Nhập số dương (VD: ', 'Enter a positive value (e.g. ')}
                  <code className="font-mono">+10</code>
                  {tr(') để thưởng thêm hoặc số âm (VD: ', ') to award bonus points or negative (e.g. ')}
                  <code className="font-mono">-5</code>
                  {tr(
                    ') để thu hồi điểm khi câu trả lời sơ sài/spam.',
                    ') to deduct points for low-quality/spam replies.'
                  )}
                </p>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Số điểm (+/-) *', 'Points (+/-) *')}
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
                      {tr('Lý do điều chỉnh *', 'Adjustment reason *')}
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="admin-adjust-points-reason-input"
                      value={pointsReasonInput}
                      onChange={(e) => setPointsReasonInput(e.target.value)}
                      placeholder={tr(
                        'VD: Thưởng giải đáp xuất sắc / Thu hồi câu trả lời quá ngắn...',
                        'e.g. Bonus for detailed guide / Deducted for brief reply...'
                      )}
                      className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-900"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="admin-submit-adjust-points-btn"
                    disabled={
                      isAdjustingPoints ||
                      !pointsReasonInput.trim() ||
                      !Number.isFinite(Number(pointsDeltaInput)) ||
                      Number(pointsDeltaInput) === 0
                    }
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-stone-900 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {isAdjustingPoints && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{tr('Ghi nhận điều chỉnh điểm', 'Record points adjustment')}</span>
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
                  {tr('Trạng thái hoạt động tài khoản giáo viên', 'Teacher account status')}
                </h3>
                <p className="mt-1 text-xs text-stone-600">
                  {tr(
                    'Khi tạm khóa, giáo viên không thể đăng nhập, nhắn tin nhóm lớp hoặc tạo học viên mới, nhưng toàn bộ lịch sử chấm bài và câu trả lời diễn đàn vẫn được bảo toàn.',
                    'When suspended, the teacher cannot sign in, message classes, or create students, while grading and Q&A history remain preserved.'
                  )}
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
                        <span>{tr('Tạm khóa tài khoản giáo viên', 'Suspend teacher account')}</span>
                      </>
                    ) : (
                      <>
                        <Unlock className="h-3.5 w-3.5" />
                        <span>{tr('Mở khóa tài khoản giáo viên', 'Unlock teacher account')}</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

                <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const targetPwd = newPassword.trim() || '12345678';
                  setIsResettingPassword(true);
                  setResetPasswordFeedback(null);
                  try {
                    const res = await ktnApi.resetUserPassword({
                      email: teacher.email,
                      role: 'teacher',
                      newPassword: targetPwd,
                    });
                    setResetPasswordFeedback({
                      ok: true,
                      message:
                        res.message ||
                        tr(
                          `Đã đặt lại mật khẩu giáo viên ${teacher.code || teacher.email} thành "${targetPwd}".`,
                          `Reset password for teacher ${teacher.code || teacher.email} to "${targetPwd}".`
                        ),
                    });
                  } catch (err: unknown) {
                    setResetPasswordFeedback({
                      ok: false,
                      message:
                        err instanceof Error
                          ? err.message
                          : tr(
                              'Không thể đặt lại mật khẩu giáo viên.',
                              'Could not reset teacher password.'
                            ),
                    });
                  } finally {
                    setIsResettingPassword(false);
                  }
                }}
                className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
              >
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <KeyRound className="h-4 w-4 text-red-800" />
                    <h4 className="font-display text-xs font-bold text-stone-900">
                      {tr('Đặt lại mật khẩu đăng nhập giáo viên', 'Reset teacher login password')}
                    </h4>
                  </div>
                  <span className="rounded bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                    {tr('Mặc định: 12345678', 'Default: 12345678')}
                  </span>
                </div>
                <input
                  type="text"
                  data-testid="drawer-reset-password-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={tr(
                    'Nhập mật khẩu mới (mặc định 12345678)...',
                    'Enter new password (default 12345678)...'
                  )}
                  className="w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs font-bold text-stone-900"
                />
                {resetPasswordFeedback && (
                  <p
                    data-testid="drawer-reset-password-feedback"
                    className={`text-xs font-semibold ${
                      resetPasswordFeedback.ok ? 'text-emerald-800' : 'text-red-800'
                    }`}
                  >
                    {resetPasswordFeedback.message}
                  </p>
                )}
                <div className="flex justify-end">
                  <button
                    type="submit"
                    data-testid="drawer-reset-password-btn"
                    disabled={
                      isSaving ||
                      isResettingPassword ||
                      (newPassword.trim().length > 0 && newPassword.trim().length < 6)
                    }
                    className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isResettingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>
                      {newPassword.trim() && newPassword.trim() !== '12345678'
                        ? tr(
                            `Đặt lại mật khẩu (${newPassword.trim()})`,
                            `Reset password (${newPassword.trim()})`
                          )
                        : tr('Đặt lại mật khẩu (12345678)', 'Reset password (12345678)')}
                    </span>
                  </button>
                </div>
              </form>

              <div className="rounded-xl border border-red-200 bg-red-50/50 p-4 shadow-2xs">
                <div className="flex items-center gap-1.5 text-red-900">
                  <Trash2 className="h-4 w-4 text-red-700" />
                  <h3 className="font-display text-xs font-extrabold uppercase tracking-wide text-red-900">
                    {tr('Xóa tài khoản giáo viên', 'Delete teacher account')}
                  </h3>
                </div>
                <p className="mt-1 text-xs text-red-700">
                  {tr(
                    'Hồ sơ giáo viên sẽ được lưu trữ (soft-delete), vô hiệu hóa quyền truy cập và ngăn các phiên đăng nhập cũ tiếp tục hoạt động. Hệ thống sẽ tự động gỡ phân công giáo viên khỏi các lớp học liên quan và chuyển các lớp đó về trạng thái "Chưa phân công giáo viên". Toàn bộ lịch sử tin nhắn nhóm lớp, bài tập, chấm điểm và điểm danh được bảo toàn nguyên vẹn.',
                    'The teacher profile will be archived (soft-deleted), disabling access and invalidating existing sessions. Related classes will be automatically unassigned ("No teacher assigned yet"). All class chat, homework, grading, and attendance history remain intact.'
                  )}
                </p>
                <div className="mt-3">
                  <button
                    type="button"
                    data-testid="admin-drawer-delete-teacher-btn"
                    disabled={isSaving || !teacher}
                    onClick={() => {
                      if (teacher && onDeleteTeacher) {
                        onDeleteTeacher(teacher);
                      }
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-800 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>{tr('Xóa giáo viên này', 'Delete this teacher')}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </aside>
    </div>
  );
};
