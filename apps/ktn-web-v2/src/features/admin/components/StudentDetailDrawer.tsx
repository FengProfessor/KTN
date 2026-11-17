import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  ArrowLeft,
  User,
  Mail,
  Phone,
  BookOpen,
  GraduationCap,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  PlusCircle,
  Trash2,
  Search,
  Loader2,
  ShieldCheck,
  Edit3,
  Copy,
  Layers,
  Lock,
  Archive,
  RotateCcw,
  Clock,
  KeyRound,
} from 'lucide-react';
import {
  buildCourseDurationPreset,
  computeCourseExpirationInfo,
  disambiguateCatalogCourses,
  formatCourseDurationPresetLabel,
  getCourseDurationPresetOptions,
  getCourseDurationUnitOptions,
  normalizeVietnameseText,
  parseCourseDurationPreset,
  resolveStudentOnlineCourses,
  type CourseDurationUnitOption,
} from '@/lib/utils';
import { translateCourseTitle, useI18n } from '@/i18n';
import { getServerNowMs, ktnApi } from '@/services/api/ktnApiClient';
import type {
  CourseDurationMode,
  CourseDurationPreset,
  KtnClassItem,
  KtnCourse,
  KtnStudentRecord,
} from '@/types/ktn.types';

export interface StudentDetailDrawerProps {
  student: KtnStudentRecord | null;
  open: boolean;
  onClose: () => void;
  catalogCourses: KtnCourse[];
  catalogError: boolean;
  catalogLoading: boolean;
  onRetryCatalog: () => void;
  classesList: KtnClassItem[];
  actionError: string | null;
  onClearError: () => void;
  isGrantingCourse: boolean;
  isRevokingCourse: boolean;
  isAssigningClass: boolean;
  isReplacingCourses: boolean;
  isUpdatingProfile: boolean;
  isResyncing: boolean;
  isManagingLifecycle?: boolean;
  isSettingCourseDuration?: boolean;
  onGrantCourses: (params: {
    email: string;
    courseIds: string[];
    durationPreset?: CourseDurationPreset;
    durationMode?: CourseDurationMode;
  }) => Promise<unknown>;
  onSetCourseDuration?: (params: {
    studentEmail: string;
    courseId: string;
    preset: CourseDurationPreset;
    mode: CourseDurationMode;
  }) => Promise<unknown>;
  onRevokeCourse: (params: { email: string; courseId: string }) => Promise<unknown>;
  onAssignClass: (params: {
    email: string;
    classCode: string | null;
    enrolledClasses?: string[];
  }) => Promise<unknown>;
  onReplaceAllCourses: (params: { email: string; courseIds: string[] }) => Promise<unknown>;
  onUpdateProfile: (params: {
    email: string;
    name: string;
    phone?: string;
    parentName?: string;
  }) => Promise<unknown>;
  onResyncStudent: (student: KtnStudentRecord) => void;
  onManageLifecycle?: (params: {
    email: string;
    action: 'suspend' | 'archive' | 'restore' | 'delete';
    reason?: string;
    confirmDelete?: boolean;
  }) => Promise<unknown>;
  hasExistingOrders?: boolean;
  onCopyEmail?: (email: string) => void;
}

export const StudentDetailDrawer: React.FC<StudentDetailDrawerProps> = ({
  student,
  open,
  onClose,
  catalogCourses,
  catalogError,
  catalogLoading,
  onRetryCatalog,
  classesList,
  actionError,
  onClearError,
  isGrantingCourse,
  isRevokingCourse,
  isAssigningClass,
  isReplacingCourses,
  isUpdatingProfile,
  isResyncing,
  isManagingLifecycle = false,
  isSettingCourseDuration = false,
  onGrantCourses,
  onSetCourseDuration,
  onRevokeCourse,
  onAssignClass,
  onReplaceAllCourses,
  onUpdateProfile,
  onResyncStudent,
  onManageLifecycle,
  hasExistingOrders = false,
  onCopyEmail,
}) => {
  const { lang, tr } = useI18n();
  const durationUnitOptions = useMemo(() => getCourseDurationUnitOptions(lang), [lang]);
  const durationPresetOptions = useMemo(() => getCourseDurationPresetOptions(lang), [lang]);

  // Section A: Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editParent, setEditParent] = useState('');

  // Section B: Course Grant / Revoke / Replace / Duration state (Always starts neutral!)
  const [courseDropdownId, setCourseDropdownId] = useState('');
  const [selectedGrantCourseIds, setSelectedGrantCourseIds] = useState<string[]>([]);
  const [grantDurationPreset, setGrantDurationPreset] =
    useState<CourseDurationPreset>('unlimited');
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [coursePendingRevokeId, setCoursePendingRevokeId] = useState<string | null>(null);
  const [activeRenewCourseId, setActiveRenewCourseId] = useState<string | null>(null);
  const [renewPreset, setRenewPreset] = useState<CourseDurationPreset>('1m');
  const [renewMode, setRenewMode] = useState<CourseDurationMode>('extend_from_current');
  const [showReplaceAllMode, setShowReplaceAllMode] = useState(false);
  const [replaceTargetCourseIds, setReplaceTargetCourseIds] = useState<string[]>([]);
  const [replaceConfirmedCheck, setReplaceConfirmedCheck] = useState(false);

  // Section C: Live Class Assignment state (Always starts neutral!)
  const [selectedClassCode, setSelectedClassCode] = useState('');
  const [selectedEnrolledClasses, setSelectedEnrolledClasses] = useState<string[]>([]);
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);

  // Section E: Account Lifecycle state
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState<
    'suspend' | 'archive' | 'restore' | 'delete' | null
  >(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);
  const [resetPasswordInput, setResetPasswordInput] = useState('12345678');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  const [resetPasswordFeedback, setResetPasswordFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [lastLifecycleFeedback, setLastLifecycleFeedback] = useState<{
    action: 'suspend' | 'archive' | 'restore' | 'delete';
    status: string;
    upstreamVerified: boolean;
    cognitoVerified: boolean;
    izteachVerified: boolean;
    preservedOrders: boolean;
    reverseSyncBlocked: boolean;
    summaryText: string;
  } | null>(null);

  // Reset form states to neutral whenever student changes
  useEffect(() => {
    if (!student) return;
    setIsEditingProfile(false);
    setEditName(student.name || '');
    setEditPhone(student.phone || '');
    setEditParent(student.parent_name || '');
    setCourseDropdownId('');
    setSelectedGrantCourseIds([]);
    setGrantDurationPreset('unlimited');
    setCourseSearchQuery('');
    setCoursePendingRevokeId(null);
    setActiveRenewCourseId(null);
    setRenewPreset('1m');
    setRenewMode('extend_from_current');
    setShowReplaceAllMode(false);
    setReplaceTargetCourseIds([]);
    setReplaceConfirmedCheck(false);
    setSelectedClassCode('');
    setShowUnassignConfirm(false);
    setPendingLifecycleAction(null);
    setLifecycleReason('');
    setDeleteConfirmChecked(false);
    setLastLifecycleFeedback(null);
    setResetPasswordInput('12345678');
    setResetPasswordFeedback(null);
  }, [student?.email]);

  // Handle Escape key to close drawer
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (coursePendingRevokeId) {
          setCoursePendingRevokeId(null);
          return;
        }
        if (showUnassignConfirm) {
          setShowUnassignConfirm(false);
          return;
        }
        if (pendingLifecycleAction) {
          setPendingLifecycleAction(null);
          setLifecycleReason('');
          setDeleteConfirmChecked(false);
          return;
        }
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, coursePendingRevokeId, showUnassignConfirm, pendingLifecycleAction, onClose]);

  const entitledCourses = useMemo(
    () => resolveStudentOnlineCourses(student?.online_courses, catalogCourses),
    [student?.online_courses, catalogCourses]
  );

  const entitledIdSet = useMemo(
    () => new Set(entitledCourses.map((c) => c.id)),
    [entitledCourses]
  );

  const disambiguatedCatalog = useMemo(
    () =>
      disambiguateCatalogCourses(
        catalogCourses.filter((c) => !c.isBundle && /^[0-9a-f]{24}$/i.test(c.id))
      ),
    [catalogCourses]
  );

  const filteredCatalog = useMemo(() => {
    const rawQ = courseSearchQuery.trim().toLowerCase();
    const normQ = normalizeVietnameseText(courseSearchQuery);
    if (!rawQ && !normQ) return disambiguatedCatalog;
    const compactQ = normQ.replace(/[\s\-_]+/g, '');
    return disambiguatedCatalog.filter((c) => {
      const fields = [
        c.title,
        c.shortTitle,
        c.displayLabel,
        c.fullDisplayLabel,
        c.code,
        c.id,
      ];
      return fields.some((f) => {
        if (!f) return false;
        const low = f.toLowerCase();
        if (rawQ && low.includes(rawQ)) return true;
        const normF = normalizeVietnameseText(f);
        if (normQ && normF.includes(normQ)) return true;
        if (compactQ && normF.replace(/[\s\-_]+/g, '').includes(compactQ)) return true;
        return false;
      });
    });
  }, [disambiguatedCatalog, courseSearchQuery]);

  const selectedCoursesPreview = useMemo(
    () =>
      selectedGrantCourseIds.map((id) => {
        const found = disambiguatedCatalog.find((c) => c.id === id);
        if (found) return found;
        const resolved = resolveStudentOnlineCourses([{ id, title: '' }], catalogCourses)[0];
        return {
          id,
          code: resolved?.code || id.slice(-6),
          title: resolved?.title || id,
          shortTitle: resolved?.shortTitle || id,
          displayLabel: resolved?.displayLabel || id,
          fullDisplayLabel: resolved?.fullDisplayLabel || id,
        };
      }),
    [selectedGrantCourseIds, disambiguatedCatalog, catalogCourses]
  );

  const currentClassCode = student?.class_code ? String(student.class_code).trim() : '';
  const currentEnrolledClasses = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(student?.enrolledClasses)) {
      for (const code of student.enrolledClasses) {
        const clean = String(code || '').trim().toUpperCase();
        if (clean) set.add(clean);
      }
    }
    if (currentClassCode) {
      set.add(currentClassCode.toUpperCase());
    }
    return Array.from(set);
  }, [student?.enrolledClasses, currentClassCode]);

  useEffect(() => {
    setSelectedEnrolledClasses(currentEnrolledClasses);
  }, [student?.email, currentEnrolledClasses]);

  const matchedClassItem = useMemo(() => {
    if (!currentClassCode) return null;
    return (
      classesList.find((c) => c.id.toUpperCase() === currentClassCode.toUpperCase()) || null
    );
  }, [currentClassCode, classesList]);

  // Legacy class code detection: student has a class_code that does not exist in active classesList
  const isLegacyUnknownClassCode = Boolean(
    currentClassCode && classesList.length > 0 && !matchedClassItem
  );

  // Derive 3-part Account & Sync statuses for Section D & Section E
  const syncBreakdown = useMemo(() => {
    if (!student) {
      return {
        effectiveAccountStatus: 'pending_activation',
        accountLabel: tr('Chờ kích hoạt', 'Pending activation'),
        accountTone: 'amber' as const,
        coursesLabel: tr('Đã đồng bộ', 'Synced'),
        coursesTone: 'emerald' as const,
        classLabel: tr('Chưa xếp lớp', 'Unassigned'),
        classTone: 'stone' as const,
        needsAttention: false,
      };
    }

    const rawAcc = String(
      lastLifecycleFeedback?.status ||
        student.lifecycleStatus ||
        student.accountStatus ||
        (student as unknown as Record<string, unknown>).account_status ||
        ''
    ).toLowerCase();
    const rawSync = String(
      student.syncStatus ||
        (student as unknown as Record<string, unknown>).sync_status ||
        ''
    ).toLowerCase();
    const isKtn2026Student =
      /^2026\d{4,}$/i.test(String(student.code || '').trim()) ||
      /^2026\d{4,}@khongtunhi\.com$/i.test(String(student.email || '').trim());
    const hasCognito = Boolean(student.cognito_user_id) || isKtn2026Student;
    const hasSyncErr = Boolean(
      student.last_sync_error ||
        rawSync === 'sync_failed' ||
        rawSync === 'partial_failure' ||
        rawSync === 'drift_detected'
    );
    const isPendingSync =
      rawSync === 'pending_activation' ||
      rawSync === 'pending_sync' ||
      rawAcc === 'pending_activation';

    // 1. Account login status
    let accountLabel = tr('Hoạt động', 'Active');
    let accountTone: 'emerald' | 'amber' | 'red' = 'emerald';
    if (rawAcc === 'deleted') {
      accountLabel = tr('Đã xóa', 'Deleted');
      accountTone = 'red';
    } else if (rawAcc === 'suspended' || rawAcc === 'locked') {
      accountLabel = tr('Tạm khóa', 'Suspended');
      accountTone = 'amber';
    } else if (rawAcc === 'archived') {
      accountLabel = tr('Đã lưu trữ', 'Archived');
      accountTone = 'amber';
    } else if (rawAcc === 'error' || rawAcc === 'sync_error') {
      accountLabel = tr('Lỗi tài khoản', 'Account error');
      accountTone = 'red';
    } else if (
      rawAcc === 'pending_activation' ||
      (!hasCognito && rawAcc !== 'ready_to_login' && rawAcc !== 'active')
    ) {
      accountLabel = tr('Chờ kích hoạt', 'Pending activation');
      accountTone = 'amber';
    }

    // 2. Course entitlements sync status
    let coursesLabel =
      entitledCourses.length > 0
        ? tr(
            `Đã đồng bộ (${entitledCourses.length} khóa)`,
            `Synced (${entitledCourses.length} courses)`
          )
        : tr('Đã đồng bộ (0 khóa)', 'Synced (0 courses)');
    let coursesTone: 'emerald' | 'amber' | 'red' = 'emerald';
    if (hasSyncErr) {
      coursesLabel = tr('Lỗi đồng bộ', 'Sync error');
      coursesTone = 'red';
    } else if (isPendingSync && entitledCourses.length > 0) {
      coursesLabel = tr('Chờ đồng bộ', 'Pending sync');
      coursesTone = 'amber';
    }

    // 3. Live class sync status
    let classLabel = tr('Chưa xếp lớp', 'Unassigned');
    let classTone: 'emerald' | 'amber' | 'red' | 'stone' = 'stone';
    if (currentClassCode) {
      if (isLegacyUnknownClassCode) {
        classLabel = tr(
          `Lỗi (Cần kiểm tra mã lớp ${currentClassCode})`,
          `Error (Check class ${currentClassCode})`
        );
        classTone = 'red';
      } else if (hasSyncErr) {
        classLabel = tr('Lỗi đồng bộ', 'Sync error');
        classTone = 'red';
      } else if (isPendingSync) {
        classLabel = tr(
          `Chờ đồng bộ (${currentClassCode})`,
          `Pending sync (${currentClassCode})`
        );
        classTone = 'amber';
      } else {
        classLabel = tr(
          `Đã lưu (${currentClassCode})`,
          `Saved (${currentClassCode})`
        );
        classTone = 'emerald';
      }
    }

    const needsAttention =
      accountTone !== 'emerald' ||
      coursesTone !== 'emerald' ||
      classTone === 'red' ||
      classTone === 'amber';

    return {
      effectiveAccountStatus: rawAcc || 'ready_to_login',
      accountLabel,
      accountTone,
      coursesLabel,
      coursesTone,
      classLabel,
      classTone,
      needsAttention,
    };
  }, [
    student,
    lastLifecycleFeedback?.status,
    entitledCourses.length,
    currentClassCode,
    isLegacyUnknownClassCode,
    tr,
  ]);

  if (!open || !student) return null;

  const isAnyMutating =
    isGrantingCourse ||
    isRevokingCourse ||
    isAssigningClass ||
    isReplacingCourses ||
    isUpdatingProfile ||
    isResyncing ||
    isManagingLifecycle ||
    isSettingCourseDuration;

  const handleDropdownCourseChange = (val: string) => {
    setCourseDropdownId(val);
    if (!val) {
      setSelectedGrantCourseIds([]);
      return;
    }
    setSelectedGrantCourseIds((prev) => (prev.includes(val) ? prev : [...prev, val]));
  };

  const toggleGrantCourseSelection = (courseId: string) => {
    if (entitledIdSet.has(courseId)) return;
    setSelectedGrantCourseIds((prev) => {
      const next = prev.includes(courseId)
        ? prev.filter((id) => id !== courseId)
        : [...prev, courseId];
      if (next.length === 0) {
        setCourseDropdownId('');
      } else if (next.length === 1) {
        setCourseDropdownId(next[0]);
      }
      return next;
    });
  };

  const handleGrantSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedGrantCourseIds.length === 0 || isGrantingCourse) return;
    onClearError();
    try {
      await onGrantCourses({
        email: student.email,
        courseIds: selectedGrantCourseIds,
        durationPreset: grantDurationPreset,
        durationMode: 'set_from_now',
      });
      setSelectedGrantCourseIds([]);
      setCourseDropdownId('');
    } catch {
      // Error is handled and displayed via actionError prop
    }
  };

  const handleSaveCourseDuration = async (courseId: string) => {
    if (!onSetCourseDuration || isSettingCourseDuration) return;
    onClearError();
    try {
      await onSetCourseDuration({
        studentEmail: student.email,
        courseId,
        preset: renewPreset,
        mode: renewMode,
      });
      setActiveRenewCourseId(null);
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleConfirmRevoke = async () => {
    if (!coursePendingRevokeId || isRevokingCourse) return;
    onClearError();
    try {
      await onRevokeCourse({
        email: student.email,
        courseId: coursePendingRevokeId,
      });
      setCoursePendingRevokeId(null);
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleAssignClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassCode || selectedClassCode === currentClassCode || isAssigningClass) {
      return;
    }
    onClearError();
    try {
      const nextEnrolled = Array.from(
        new Set([selectedClassCode.toUpperCase(), ...selectedEnrolledClasses])
      );
      await onAssignClass({
        email: student.email,
        classCode: selectedClassCode,
        enrolledClasses: nextEnrolled,
      });
      setSelectedClassCode('');
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleConfirmUnassignClass = async () => {
    if (!currentClassCode || isAssigningClass) return;
    onClearError();
    try {
      await onAssignClass({
        email: student.email,
        classCode: null,
        enrolledClasses: [],
      });
      setShowUnassignConfirm(false);
      setSelectedClassCode('');
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleSaveMultiClasses = async () => {
    if (!student || isAssigningClass) return;
    onClearError();
    const cleaned = Array.from(
      new Set(selectedEnrolledClasses.map((c) => c.trim().toUpperCase()).filter(Boolean))
    );
    const nextPrimary = cleaned.includes(currentClassCode.toUpperCase())
      ? currentClassCode
      : cleaned[0] || null;
    try {
      await onAssignClass({
        email: student.email,
        classCode: nextPrimary,
        enrolledClasses: cleaned,
      });
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleSaveProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim() || isUpdatingProfile) return;
    onClearError();
    try {
      await onUpdateProfile({
        email: student.email,
        name: editName.trim(),
        phone: editPhone.trim(),
        parentName: editParent.trim(),
      });
      setIsEditingProfile(false);
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const handleReplaceAllSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!replaceConfirmedCheck || isReplacingCourses) return;
    onClearError();
    try {
      await onReplaceAllCourses({
        email: student.email,
        courseIds: replaceTargetCourseIds,
      });
      setShowReplaceAllMode(false);
      setReplaceConfirmedCheck(false);
    } catch {
      // Error is displayed via actionError prop
    }
  };

  const coursePendingRevokeObj = coursePendingRevokeId
    ? entitledCourses.find((c) => c.id === coursePendingRevokeId) || {
        id: coursePendingRevokeId,
        code: coursePendingRevokeId.slice(-6),
        title: coursePendingRevokeId,
        shortTitle: coursePendingRevokeId,
        displayLabel: coursePendingRevokeId,
        fullDisplayLabel: coursePendingRevokeId,
      }
    : null;

  const replaceAddedCourses = replaceTargetCourseIds.filter((id) => !entitledIdSet.has(id));
  const replaceRemovedCourses = entitledCourses.filter(
    (c) => !replaceTargetCourseIds.includes(c.id)
  );

  return (
    <div
      data-testid="student-detail-drawer-root"
      className="fixed inset-0 z-50 flex justify-end"
      role="dialog"
      aria-modal="true"
      aria-labelledby="student-drawer-title"
    >
      {/* Desktop Backdrop Overlay */}
      <div
        data-testid="student-drawer-backdrop"
        onClick={() => {
          if (!isAnyMutating) onClose();
        }}
        className="fixed inset-0 bg-stone-950/40 backdrop-blur-[1px] transition-opacity"
      />

      {/* Slide-over Drawer (Desktop right panel / Mobile full-width view) */}
      <aside
        data-testid="student-detail-drawer"
        className="relative z-10 flex h-full w-full flex-col bg-white shadow-2xl sm:max-w-xl sm:border-l sm:border-stone-200"
      >
        {/* Top Sticky Header */}
        <div className="flex items-center justify-between gap-2 border-b border-stone-200 bg-stone-50/90 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <button
              type="button"
              data-testid="drawer-back-btn"
              onClick={onClose}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-800 hover:bg-stone-100 sm:hidden"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>{tr('Quay lại', 'Back')}</span>
            </button>

            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <h2
                  id="student-drawer-title"
                  data-testid="drawer-student-name"
                  className="truncate font-display text-sm font-extrabold text-stone-900 sm:text-base"
                >
                  {student.name}
                </h2>
                <span
                  data-testid="drawer-student-code"
                  className="shrink-0 rounded-md bg-stone-200/80 px-1.5 py-0.5 font-mono text-[10px] font-bold text-stone-700"
                >
                  {student.code || 'KTN'}
                </span>
              </div>
              <p
                data-testid="drawer-student-email"
                className="truncate font-mono text-xs font-semibold text-red-900"
              >
                {student.email}
              </p>
            </div>
          </div>

          <button
            type="button"
            data-testid="drawer-close-btn"
            aria-label={tr('Đóng hồ sơ học viên', 'Close student drawer')}
            onClick={onClose}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-600 hover:bg-stone-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Scrollable Body with 4 Sections (A, B, C, D) */}
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {/* Real Backend Error Alert */}
          {actionError && (
            <div
              role="alert"
              data-testid="drawer-action-error-alert"
              className="flex items-start justify-between gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950 shadow-2xs"
            >
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <div>
                  <p className="font-bold text-red-900">
                    {tr(
                      'Thao tác chưa hoàn tất — Dữ liệu chưa bị ghi đè',
                      'Action incomplete — Data was not overwritten'
                    )}
                  </p>
                  <p className="mt-0.5 text-red-800">{actionError}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label={tr('Đóng thông báo lỗi', 'Dismiss error')}
                onClick={onClearError}
                className="rounded-lg p-1 text-red-800 hover:bg-red-100"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* =============================================================== */}
          {/* KHU VỰC A: THÔNG TIN HỌC VIÊN                                  */}
          {/* =============================================================== */}
          <section
            data-testid="drawer-section-profile"
            className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                <User className="h-3.5 w-3.5 text-red-800" />
                <span>{tr('A. Thông tin học viên', 'A. Student Profile')}</span>
              </h3>
              <button
                type="button"
                data-testid="drawer-edit-profile-btn"
                onClick={() => {
                  setEditName(student.name || '');
                  setEditPhone(student.phone || '');
                  setEditParent(student.parent_name || '');
                  setIsEditingProfile((v) => !v);
                }}
                className="inline-flex min-h-[28px] items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
              >
                <Edit3 className="h-3 w-3" />
                <span>
                  {isEditingProfile ? tr('Đóng sửa', 'Cancel edit') : tr('Sửa hồ sơ', 'Edit profile')}
                </span>
              </button>
            </div>

            {/* Identity Email Callout */}
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-stone-500">
                  <Mail className="h-3 w-3 text-red-800" />
                  <span>
                    {tr('Email đăng nhập (Định danh tài khoản)', 'Login Email (Account ID)')}
                  </span>
                </p>
                <p
                  data-testid="drawer-identity-email"
                  className="truncate font-mono text-xs font-bold text-stone-900"
                >
                  {student.email}
                </p>
              </div>
              <button
                type="button"
                aria-label={tr('Sao chép email học viên', 'Copy student email')}
                onClick={() => onCopyEmail?.(student.email)}
                className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
              >
                <Copy className="h-3 w-3" />
                <span>{tr('Sao chép', 'Copy')}</span>
              </button>
            </div>

            {!isEditingProfile ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    {tr('Họ và tên', 'Full name')}
                  </span>
                  <span
                    data-testid="drawer-info-name"
                    className="font-bold text-stone-900"
                  >
                    {student.name}
                  </span>
                </div>
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    {tr('Mã học viên', 'Student code')}
                  </span>
                  <span
                    data-testid="drawer-info-code"
                    className="font-mono font-bold text-stone-900"
                  >
                    {student.code || '—'}
                  </span>
                </div>
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    {tr('Số điện thoại', 'Phone')}
                  </span>
                  <span
                    data-testid="drawer-info-phone"
                    className="inline-flex items-center gap-1 font-semibold text-stone-800"
                  >
                    <Phone className="h-3 w-3 text-stone-400" />
                    {student.phone || tr('Chưa cập nhật', 'Not updated')}
                  </span>
                </div>
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    {tr('Phụ huynh', 'Parent')}
                  </span>
                  <span
                    data-testid="drawer-info-parent"
                    className="font-semibold text-stone-800"
                  >
                    {student.parent_name || tr('Chưa cập nhật', 'Not updated')}
                  </span>
                </div>
              </div>
            ) : (
              <form
                data-testid="drawer-profile-edit-form"
                onSubmit={handleSaveProfileSubmit}
                className="mt-2.5 space-y-2.5 border-t border-stone-100 pt-2.5 text-xs"
              >
                <div>
                  <label className="block text-[11px] font-bold text-stone-600">
                    {tr(
                      'Email đăng nhập (Cố định theo Cognito/izTeach)',
                      'Login Email (Fixed by Cognito/izTeach)'
                    )}
                  </label>
                  <input
                    type="email"
                    readOnly
                    disabled
                    data-testid="drawer-profile-email-readonly"
                    value={student.email}
                    className="mt-1 w-full cursor-not-allowed rounded-lg border border-stone-200 bg-stone-100 px-2.5 py-1.5 font-mono text-xs text-stone-500"
                  />
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Họ tên học viên *', 'Student name *')}
                    </label>
                    <input
                      type="text"
                      required
                      data-testid="drawer-profile-name-input"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Số điện thoại', 'Phone')}
                    </label>
                    <input
                      type="tel"
                      data-testid="drawer-profile-phone-input"
                      value={editPhone}
                      onChange={(e) => setEditPhone(e.target.value)}
                      placeholder="0912345678"
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      {tr('Phụ huynh', 'Parent')}
                    </label>
                    <input
                      type="text"
                      data-testid="drawer-profile-parent-input"
                      value={editParent}
                      onChange={(e) => setEditParent(e.target.value)}
                      placeholder={tr('Tên phụ huynh', 'Parent name')}
                      className="mt-1 w-full rounded-lg border border-stone-300 px-2.5 py-1.5 text-xs font-semibold"
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsEditingProfile(false)}
                    className="min-h-[32px] rounded-lg border border-stone-300 px-3 py-1 text-xs font-bold text-stone-700"
                  >
                    {tr('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    data-testid="drawer-save-profile-btn"
                    disabled={isUpdatingProfile || !editName.trim()}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isUpdatingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{tr('Lưu thông tin', 'Save profile')}</span>
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* =============================================================== */}
          {/* KHU VỰC B: KHÓA HỌC ĐÃ ĐƯỢC CẤP                                */}
          {/* =============================================================== */}
          <section
            data-testid="drawer-section-courses"
            className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                <BookOpen className="h-3.5 w-3.5 text-emerald-700" />
                <span>
                  {tr(
                    `B. Khóa học đã được cấp (${entitledCourses.length})`,
                    `B. Granted Courses (${entitledCourses.length})`
                  )}
                </span>
              </h3>
              <button
                type="button"
                data-testid="drawer-toggle-replace-mode-btn"
                onClick={() => {
                  const next = !showReplaceAllMode;
                  setShowReplaceAllMode(next);
                  setReplaceConfirmedCheck(false);
                  if (next) {
                    setReplaceTargetCourseIds(entitledCourses.map((c) => c.id));
                  }
                }}
                className="inline-flex min-h-[26px] items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-600 hover:bg-stone-100"
              >
                <Layers className="h-3 w-3" />
                <span>
                  {showReplaceAllMode
                    ? tr('Đóng chế độ thay thế', 'Close replace mode')
                    : tr('Thay thế toàn bộ', 'Replace all')}
                </span>
              </button>
            </div>

            {/* Current Granted Courses List */}
            <div
              data-testid="drawer-current-courses-list"
              className="mt-2.5 space-y-2"
            >
              {entitledCourses.length === 0 ? (
                <div
                  data-testid="drawer-no-courses-badge"
                  className="rounded-lg border border-dashed border-stone-200 bg-stone-50 px-3 py-2.5 text-xs font-medium text-stone-500"
                >
                  {tr(
                    'Học viên chưa được cấp khóa học trực tuyến nào.',
                    'No online courses have been granted yet.'
                  )}
                </div>
              ) : (
                entitledCourses.map((course) => {
                  const expInfo = computeCourseExpirationInfo(course, getServerNowMs(), lang);
                  const hasExistingLimit = Boolean(course.limitTime || course.expiresAt);
                  const isRenewPanelOpen = activeRenewCourseId === course.id;
                  const statusToneClass =
                    expInfo.statusKey === 'sync_error'
                      ? 'border-amber-300 bg-amber-100 text-amber-900'
                      : expInfo.statusKey === 'expired'
                      ? 'border-red-300 bg-red-100 text-red-900'
                      : expInfo.statusKey === 'expiring_soon'
                      ? 'border-amber-300 bg-amber-50 text-amber-900'
                      : expInfo.statusKey === 'unlimited'
                      ? 'border-stone-200 bg-white text-stone-700'
                      : 'border-emerald-200 bg-white text-emerald-800';
                  const rowToneClass =
                    expInfo.statusKey === 'expired'
                      ? 'border-red-200 bg-red-50/50'
                      : expInfo.statusKey === 'sync_error'
                      ? 'border-amber-200 bg-amber-50/50'
                      : 'border-emerald-200/80 bg-emerald-50/60';

                  return (
                    <div
                      key={course.id}
                      data-testid={`drawer-granted-course-${course.id}`}
                      className={`rounded-xl border px-3 py-2 ${rowToneClass}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                              {course.code}
                            </span>
                            <p
                              data-testid={`drawer-granted-course-summary-${course.id}`}
                              className="truncate text-xs font-bold text-stone-900"
                            >
                              {translateCourseTitle(
                                course.displayLabel || course.fullDisplayLabel,
                                lang
                              )}{' '}
                              · {expInfo.adminCompactText}
                            </p>
                            <span
                              data-testid={`drawer-granted-course-status-${course.id}`}
                              className={`inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold ${statusToneClass}`}
                            >
                              {expInfo.adminStatusLabel}
                            </span>
                          </div>
                          <p className="mt-0.5 font-mono text-[10px] text-stone-500">
                            ID: {course.id}
                            {expInfo.limitDateYmd
                              ? ` · ${tr('Hạn:', 'Expires:')} ${expInfo.limitDateYmd}`
                              : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1.5">
                          {onSetCourseDuration && (
                            <button
                              type="button"
                              data-testid={`drawer-renew-course-btn-${course.id}`}
                              disabled={isSettingCourseDuration}
                              onClick={() => {
                                if (isRenewPanelOpen) {
                                  setActiveRenewCourseId(null);
                                } else {
                                  setActiveRenewCourseId(course.id);
                                  setRenewPreset(course.durationPreset || '1m');
                                  setRenewMode(
                                    hasExistingLimit && !expInfo.isExpired
                                      ? 'extend_from_current'
                                      : 'set_from_now',
                                  );
                                }
                              }}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-50 disabled:opacity-50"
                            >
                              <span>{tr('Gia hạn', 'Renew')}</span>
                            </button>
                          )}
                          <button
                            type="button"
                            data-testid={`drawer-revoke-course-btn-${course.id}`}
                            disabled={isRevokingCourse}
                            onClick={() => setCoursePendingRevokeId(course.id)}
                            className="inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>{tr('Thu hồi', 'Revoke')}</span>
                          </button>
                        </div>
                      </div>

                      {isRenewPanelOpen && onSetCourseDuration && (
                        <div
                          data-testid={`drawer-renew-panel-${course.id}`}
                          className="mt-2.5 space-y-2 rounded-lg border border-stone-200 bg-white p-2.5 text-xs"
                        >
                          {(() => {
                            const parsedRenew = parseCourseDurationPreset(renewPreset);
                            return (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                  <span className="text-[11px] font-bold text-stone-700">
                                    {tr('Thời hạn học:', 'Access duration:')}
                                  </span>
                                  <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                                    {formatCourseDurationPresetLabel(renewPreset, lang)}
                                  </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-semibold text-stone-600">
                                      {tr('Số lượng (1–365)', 'Quantity (1–365)')}
                                    </label>
                                    <input
                                      type="number"
                                      min={1}
                                      max={365}
                                      step={1}
                                      data-testid={`drawer-renew-value-input-${course.id}`}
                                      disabled={parsedRenew.unit === 'unlimited'}
                                      value={parsedRenew.unit === 'unlimited' ? '' : parsedRenew.value}
                                      placeholder={parsedRenew.unit === 'unlimited' ? '—' : '1'}
                                      onChange={(e) => {
                                        const nextUnit =
                                          parsedRenew.unit === 'unlimited' ? 'm' : parsedRenew.unit;
                                        setRenewPreset(
                                          buildCourseDurationPreset(e.target.value, nextUnit)
                                        );
                                      }}
                                      className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-semibold text-stone-600">
                                      {tr('Đơn vị (Ngày / Tuần / Tháng)', 'Unit (Day / Week / Month)')}
                                    </label>
                                    <select
                                      data-testid={`drawer-renew-unit-select-${course.id}`}
                                      value={parsedRenew.unit}
                                      onChange={(e) => {
                                        const nextUnit = e.target.value as CourseDurationUnitOption;
                                        setRenewPreset(
                                          buildCourseDurationPreset(parsedRenew.value || 1, nextUnit)
                                        );
                                      }}
                                      className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800"
                                    >
                                      {durationUnitOptions.map((u) => (
                                        <option key={u.id} value={u.id}>
                                          {u.label}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                                <div className="flex flex-wrap gap-1 pt-0.5">
                                  {durationPresetOptions.map((opt) => (
                                    <button
                                      key={opt.id}
                                      type="button"
                                      data-testid={`drawer-renew-preset-${course.id}-${opt.id}`}
                                      onClick={() => setRenewPreset(opt.id)}
                                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                                        renewPreset === opt.id
                                          ? 'bg-red-800 text-white'
                                          : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          })()}

                          {hasExistingLimit && renewPreset !== 'unlimited' && (
                            <div
                              data-testid={`drawer-renew-mode-selector-${course.id}`}
                              className="flex flex-wrap gap-1.5 pt-0.5"
                            >
                              <button
                                type="button"
                                data-testid={`drawer-renew-mode-extend-${course.id}`}
                                onClick={() => setRenewMode('extend_from_current')}
                                className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                                  renewMode === 'extend_from_current'
                                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                                    : 'border-stone-200 bg-white text-stone-600'
                                }`}
                              >
                                {tr('Gia hạn thêm từ hạn hiện tại', 'Extend from current expiry')}
                              </button>
                              <button
                                type="button"
                                data-testid={`drawer-renew-mode-reset-${course.id}`}
                                onClick={() => setRenewMode('set_from_now')}
                                className={`rounded-lg border px-2 py-1 text-[11px] font-bold ${
                                  renewMode === 'set_from_now'
                                    ? 'border-amber-600 bg-amber-50 text-amber-900'
                                    : 'border-stone-200 bg-white text-stone-600'
                                }`}
                              >
                                {tr('Đặt lại hạn từ hôm nay', 'Reset from today')}
                              </button>
                            </div>
                          )}

                          <div className="flex justify-end gap-1.5 pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveRenewCourseId(null)}
                              className="rounded-lg border border-stone-200 px-2.5 py-1 text-[11px] font-bold text-stone-600"
                            >
                              {tr('Đóng', 'Close')}
                            </button>
                            <button
                              type="button"
                              data-testid={`drawer-save-duration-btn-${course.id}`}
                              disabled={isSettingCourseDuration}
                              onClick={() => handleSaveCourseDuration(course.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-900 disabled:opacity-50"
                            >
                              {isSettingCourseDuration && (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              )}
                              <span>{tr('Lưu thời hạn', 'Save duration')}</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            {/* Inline Confirmation for Revoking a Single Course */}
            {coursePendingRevokeObj && (
              <div
                data-testid="drawer-revoke-confirm-box"
                className="mt-3 rounded-xl border-2 border-red-300 bg-red-50/90 p-3 text-xs text-red-950"
              >
                <p className="font-bold text-red-900">
                  {tr('Xác nhận thu hồi khóa học:', 'Confirm revoke course:')}{' '}
                  <span className="underline">
                    {translateCourseTitle(coursePendingRevokeObj.fullDisplayLabel, lang)}
                  </span>
                  ?
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] text-red-900">
                  <li>
                    {tr('Chỉ thu hồi mã khóa học', 'Only revokes course ID')}{' '}
                    <code className="font-mono font-bold">{coursePendingRevokeObj.id}</code>.
                  </li>
                  <li>
                    {tr('Lớp học trực tiếp (', 'Live class (')}
                    <strong>{currentClassCode || tr('Chưa xếp lớp', 'Unassigned')}</strong>
                    {tr(') sẽ', ') will' )}{' '}
                    <strong>{tr('không thay đổi', 'remain unchanged')}</strong>.
                  </li>
                  <li>
                    {tr(
                      `Các khóa học khác (${Math.max(0, entitledCourses.length - 1)} khóa) được`,
                      `Other courses (${Math.max(0, entitledCourses.length - 1)}) will be`
                    )}{' '}
                    <strong>{tr('giữ nguyên', 'preserved')}</strong>.
                  </li>
                </ul>
                <div className="mt-2.5 flex justify-end gap-2">
                  <button
                    type="button"
                    data-testid="drawer-cancel-revoke-btn"
                    disabled={isRevokingCourse}
                    onClick={() => setCoursePendingRevokeId(null)}
                    className="min-h-[32px] rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-bold text-stone-700"
                  >
                    {tr('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    data-testid="drawer-confirm-revoke-btn"
                    disabled={isRevokingCourse}
                    onClick={handleConfirmRevoke}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isRevokingCourse ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                    <span>{tr('Xác nhận thu hồi', 'Confirm revoke')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Add / Grant New Course(s) Panel */}
            <form
              data-testid="drawer-grant-course-panel"
              onSubmit={handleGrantSubmit}
              className="mt-3.5 space-y-2.5 border-t border-stone-100 pt-3"
            >
              <label className="block text-xs font-bold text-stone-800">
                {tr(
                  'Cấp thêm khóa học mới (Không ảnh hưởng lớp học hoặc khóa đã có):',
                  'Grant additional course(s) (Does not affect class or existing courses):'
                )}
              </label>

              {catalogError ? (
                <div
                  role="alert"
                  data-testid="drawer-catalog-error-alert"
                  className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
                >
                  <span>
                    {tr(
                      'Không tải được danh mục khóa học từ izTeach. Hệ thống không dùng khóa demo trong chế độ thật.',
                      'Unable to load izTeach course catalog. Demo courses are disabled in live mode.'
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={onRetryCatalog}
                    className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-red-800"
                  >
                    {tr('Thử lại', 'Retry')}
                  </button>
                </div>
              ) : (
                <>
                  {/* Neutral Course Select Dropdown */}
                  <div>
                    <select
                      aria-label={tr('Chọn khóa học cần cấp', 'Select course to grant')}
                      data-testid="drawer-course-select"
                      value={courseDropdownId}
                      disabled={catalogLoading}
                      onChange={(e) => handleDropdownCourseChange(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                    >
                      <option value="">
                        {tr('— Chưa chọn khóa học —', '— Select course —')}
                      </option>
                      {disambiguatedCatalog.map((course) => {
                        const alreadyHas = entitledIdSet.has(course.id);
                        return (
                          <option
                            key={course.id}
                            value={course.id}
                            disabled={alreadyHas}
                          >
                            {translateCourseTitle(course.fullDisplayLabel, lang)} ({course.code})
                            {alreadyHas ? tr(' — Đã cấp', ' — Granted') : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>

                  {/* Catalog Search + Multi-Select List */}
                  <div className="space-y-1.5">
                    <div className="relative">
                      <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                      <input
                        type="search"
                        data-testid="drawer-course-search-input"
                        value={courseSearchQuery}
                        onChange={(e) => setCourseSearchQuery(e.target.value)}
                        placeholder={tr(
                          'Tìm khóa học trong catalog (tên, mã HSK/YCT, ID)...',
                          'Search catalog (name, HSK/YCT code, ID)...'
                        )}
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-2.5 text-xs font-medium text-stone-800 focus:border-red-800 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/70 p-2">
                      {filteredCatalog.length === 0 ? (
                        <span className="text-[11px] text-stone-500">
                          {tr(
                            'Không tìm thấy khóa học phù hợp trong catalog.',
                            'No matching courses found in catalog.'
                          )}
                        </span>
                      ) : (
                        filteredCatalog.map((course) => {
                          const alreadyHas = entitledIdSet.has(course.id);
                          const isSelected = selectedGrantCourseIds.includes(course.id);
                          return (
                            <button
                              key={course.id}
                              type="button"
                              disabled={alreadyHas}
                              data-testid={`drawer-course-option-${course.id}`}
                              onClick={() => toggleGrantCourseSelection(course.id)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                                alreadyHas
                                  ? 'cursor-not-allowed border border-emerald-200 bg-emerald-50/60 text-emerald-800 opacity-60'
                                  : isSelected
                                  ? 'bg-red-800 text-white shadow-2xs'
                                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                              }`}
                            >
                              <span>{translateCourseTitle(course.displayLabel, lang)}</span>
                              {alreadyHas && (
                                <span className="text-[9px]">{tr('(Đã có)', '(Owned)')}</span>
                              )}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Course Duration 2-Column + Quick Preset Selector */}
                  {(() => {
                    const parsedGrant = parseCourseDurationPreset(grantDurationPreset);
                    return (
                      <div
                        data-testid="drawer-grant-duration-selector"
                        className="space-y-2 rounded-xl border border-stone-200 bg-stone-50/70 p-2.5"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[11px] font-bold text-stone-800">
                            {tr('Thời hạn học:', 'Access duration:')}
                          </span>
                          <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                            {formatCourseDurationPresetLabel(grantDurationPreset, lang)}
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-600">
                              {tr('Số lượng (1–365)', 'Quantity (1–365)')}
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={365}
                              step={1}
                              data-testid="drawer-grant-duration-value-input"
                              disabled={parsedGrant.unit === 'unlimited'}
                              value={parsedGrant.unit === 'unlimited' ? '' : parsedGrant.value}
                              placeholder={parsedGrant.unit === 'unlimited' ? '—' : '1'}
                              onChange={(e) => {
                                const nextUnit =
                                  parsedGrant.unit === 'unlimited' ? 'm' : parsedGrant.unit;
                                setGrantDurationPreset(
                                  buildCourseDurationPreset(e.target.value, nextUnit)
                                );
                              }}
                              className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-stone-600">
                              {tr('Đơn vị (Ngày / Tuần / Tháng)', 'Unit (Day / Week / Month)')}
                            </label>
                            <select
                              data-testid="drawer-grant-duration-unit-select"
                              value={parsedGrant.unit}
                              onChange={(e) => {
                                const nextUnit = e.target.value as CourseDurationUnitOption;
                                setGrantDurationPreset(
                                  buildCourseDurationPreset(parsedGrant.value || 1, nextUnit)
                                );
                              }}
                              className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800"
                            >
                              {durationUnitOptions.map((u) => (
                                <option key={u.id} value={u.id}>
                                  {u.label}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {durationPresetOptions.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              data-testid={`drawer-grant-duration-preset-${opt.id}`}
                              onClick={() => setGrantDurationPreset(opt.id)}
                              className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                grantDurationPreset === opt.id
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

                  {/* Preview Box Before Confirming Grant */}
                  {selectedCoursesPreview.length > 0 && (
                    <div
                      data-testid="drawer-grant-preview"
                      className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-950"
                    >
                      <p className="font-bold text-amber-900">
                        {tr(
                          `Xem trước thay đổi (Cấp thêm ${selectedCoursesPreview.length} khóa học`,
                          `Preview changes (Grant +${selectedCoursesPreview.length} courses`
                        )}{' '}
                        · {formatCourseDurationPresetLabel(grantDurationPreset, lang)}
                        ):
                      </p>
                      <ul className="mt-1 space-y-0.5 text-[11px]">
                        {selectedCoursesPreview.map((c) => (
                          <li key={c.id} className="font-semibold text-emerald-900">
                            + {tr('Thêm:', 'Add:')} {translateCourseTitle(c.fullDisplayLabel, lang)} (
                            <code className="font-mono text-[10px]">{c.id}</code>)
                          </li>
                        ))}
                        <li className="text-stone-600">
                          •{' '}
                          {tr(
                            `Giữ nguyên ${entitledCourses.length} khóa học hiện có & Lớp trực tiếp:`,
                            `Keep ${entitledCourses.length} existing course(s) & Live Class:`
                          )}{' '}
                          <strong>{currentClassCode || tr('Chưa xếp lớp', 'Unassigned')}</strong>{' '}
                          {tr('(không đổi)', '(unchanged)')}
                        </li>
                      </ul>
                    </div>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    {selectedGrantCourseIds.length > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedGrantCourseIds([]);
                          setCourseDropdownId('');
                        }}
                        className="min-h-[34px] rounded-xl border border-stone-200 px-2.5 py-1 text-xs font-bold text-stone-600"
                      >
                        {tr('Bỏ chọn', 'Clear')}
                      </button>
                    )}
                    <button
                      type="submit"
                      data-testid="drawer-grant-course-submit-btn"
                      disabled={selectedGrantCourseIds.length === 0 || isGrantingCourse}
                      className="inline-flex min-h-[36px] items-center justify-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      {isGrantingCourse ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="h-3.5 w-3.5" />
                      )}
                      <span>
                        {selectedGrantCourseIds.length > 0
                          ? tr(
                              `Cấp ${selectedGrantCourseIds.length} khóa đã chọn`,
                              `Grant ${selectedGrantCourseIds.length} selected`
                            )
                          : tr('Cấp khóa học', 'Grant course')}
                      </span>
                    </button>
                  </div>
                </>
              )}
            </form>

            {/* Explicit Replace All Courses Mode (Never used by default) */}
            {showReplaceAllMode && (
              <form
                data-testid="drawer-replace-courses-section"
                onSubmit={handleReplaceAllSubmit}
                className="mt-3 space-y-2.5 rounded-xl border-2 border-amber-300 bg-amber-50/50 p-3 text-xs"
              >
                <div className="flex items-center justify-between">
                  <p className="font-bold text-amber-950">
                    {tr(
                      'Chế độ Thay thế toàn bộ khóa học (Ghi đè danh sách khóa):',
                      'Replace All Courses Mode (Overwrites course list):'
                    )}
                  </p>
                </div>
                <p className="text-[11px] text-amber-900">
                  {tr(
                    `Chọn chính xác các khóa học muốn giữ lại cho học viên. Những khóa bỏ chọn sẽ bị thu hồi. Lớp trực tiếp (${currentClassCode || 'Chưa xếp lớp'}) không bị ảnh hưởng.`,
                    `Select exact courses to keep. Deselected ones will be revoked. Live class (${currentClassCode || 'Unassigned'}) is unaffected.`
                  )}
                </p>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-amber-200 bg-white p-2">
                  {disambiguatedCatalog.map((course) => {
                    const checked = replaceTargetCourseIds.includes(course.id);
                    return (
                      <button
                        key={course.id}
                        type="button"
                        data-testid={`drawer-replace-option-${course.id}`}
                        onClick={() => {
                          setReplaceConfirmedCheck(false);
                          setReplaceTargetCourseIds((prev) =>
                            checked
                              ? prev.filter((id) => id !== course.id)
                              : [...prev, course.id]
                          );
                        }}
                        className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
                          checked
                            ? 'bg-amber-800 text-white'
                            : 'border border-stone-200 bg-stone-50 text-stone-700'
                        }`}
                      >
                        {translateCourseTitle(course.displayLabel, lang)}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg bg-white p-2 text-[11px] text-stone-700">
                  <p>
                    • {tr('Sẽ thêm mới:', 'Will add:')}{' '}
                    <strong>
                      {replaceAddedCourses.length} {tr('khóa', 'courses')}
                    </strong>{' '}
                    · {tr('Sẽ thu hồi:', 'Will revoke:')}{' '}
                    <strong className="text-red-700">
                      {replaceRemovedCourses.length} {tr('khóa', 'courses')}
                    </strong>
                  </p>
                </div>

                <label className="flex items-center gap-2 text-[11px] font-bold text-amber-950">
                  <input
                    type="checkbox"
                    data-testid="drawer-replace-confirm-checkbox"
                    checked={replaceConfirmedCheck}
                    onChange={(e) => setReplaceConfirmedCheck(e.target.checked)}
                    className="rounded border-amber-400"
                  />
                  <span>
                    {tr(
                      'Tôi xác nhận thay thế toàn bộ danh sách khóa học theo lựa chọn trên',
                      'I confirm replacing the entire course list with this selection'
                    )}
                  </span>
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReplaceAllMode(false)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700"
                  >
                    {tr('Đóng', 'Close')}
                  </button>
                  <button
                    type="submit"
                    data-testid="drawer-confirm-replace-btn"
                    disabled={!replaceConfirmedCheck || isReplacingCourses}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-amber-800 px-3 py-1 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-40"
                  >
                    {isReplacingCourses && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>{tr('Xác nhận thay thế toàn bộ', 'Confirm replace all')}</span>
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* =============================================================== */}
          {/* KHU VỰC C: LỚP HỌC TRỰC TIẾP                                    */}
          {/* =============================================================== */}
          <section
            data-testid="drawer-section-class"
            className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                <GraduationCap className="h-3.5 w-3.5 text-red-800" />
                <span>{tr('C. Lớp học trực tiếp', 'C. Live Class')}</span>
              </h3>
              {currentClassCode && !showUnassignConfirm && (
                <button
                  type="button"
                  data-testid="drawer-unassign-class-btn"
                  disabled={isAssigningClass}
                  onClick={() => setShowUnassignConfirm(true)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-600 hover:bg-red-50 hover:text-red-800"
                >
                  {tr('Bỏ xếp lớp', 'Unassign class')}
                </button>
              )}
            </div>

            {/* Current Live Class Status */}
            <div className="mt-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-[10px] font-semibold uppercase text-stone-500">
                    {tr('Lớp hiện tại', 'Current class')}
                  </span>
                  {currentClassCode ? (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                      <span
                        data-testid="drawer-current-class-badge"
                        className="inline-flex items-center whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 text-xs font-extrabold text-red-900"
                      >
                        {currentClassCode}
                      </span>
                      {matchedClassItem && (
                        <span className="text-xs font-semibold text-stone-800">
                          {translateCourseTitle(matchedClassItem.name, lang)} ·{' '}
                          {tr('GV:', 'Teacher:')} {matchedClassItem.teacher_name}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      data-testid="drawer-current-class-badge"
                      className="mt-0.5 inline-block text-xs font-bold text-stone-500"
                    >
                      {tr('Chưa xếp lớp', 'Unassigned')}
                    </span>
                  )}
                </div>
              </div>

              {/* Legacy / Unknown Class Code Warning (Never auto-deletes data!) */}
              {isLegacyUnknownClassCode && (
                <div
                  role="alert"
                  data-testid="drawer-legacy-class-warning"
                  className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-300 bg-amber-50 p-2 text-[11px] text-amber-950"
                >
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-bold text-amber-900">
                      {tr(
                        `Cần kiểm tra mã lớp (${currentClassCode})`,
                        `Check class code (${currentClassCode})`
                      )}
                    </p>
                    <p className="text-amber-800">
                      {tr(
                        'Mã lớp hiện tại không nằm trong danh mục lớp đang hoạt động. Hệ thống giữ nguyên dữ liệu cũ và không tự xóa.',
                        'Current class code is not in active classes. Legacy data is preserved and never auto-deleted.'
                      )}
                    </p>
                  </div>
                </div>
              )}
            </div>

            {/* Confirmation for Intentional Unassign Class */}
            {showUnassignConfirm && (
              <div
                data-testid="drawer-unassign-confirm-box"
                className="mt-2.5 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
              >
                <p className="font-bold">
                  {tr('Xác nhận bỏ xếp lớp', 'Confirm removing class')}{' '}
                  <strong>{currentClassCode}</strong> {tr('cho học viên', 'for student')}{' '}
                  <strong>{student.name}</strong>?
                </p>
                <p className="mt-1 text-[11px] text-amber-900">
                  {tr(
                    `Danh sách khóa học trực tuyến (${entitledCourses.length} khóa) vẫn được giữ nguyên.`,
                    `Online course entitlements (${entitledCourses.length} courses) remain unchanged.`
                  )}
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnassignConfirm(false)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700"
                  >
                    {tr('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    data-testid="drawer-confirm-unassign-class-btn"
                    disabled={isAssigningClass}
                    onClick={handleConfirmUnassignClass}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white"
                  >
                    {isAssigningClass && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>{tr('Xác nhận bỏ xếp lớp', 'Confirm unassign')}</span>
                  </button>
                </div>
              </div>
            )}

            {/* Assign / Change Class Form (Only existing classes, neutral placeholder) */}
            <form
              data-testid="drawer-assign-class-form"
              onSubmit={handleAssignClassSubmit}
              className="mt-3 space-y-2 border-t border-stone-100 pt-2.5"
            >
              <label className="block text-xs font-bold text-stone-800">
                {currentClassCode
                  ? tr('Chuyển sang lớp khác:', 'Transfer to another class:')
                  : tr('Xếp vào lớp học trực tiếp:', 'Assign to live class:')}
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label={tr('Chọn lớp học trực tiếp', 'Select live class')}
                  data-testid="drawer-class-select"
                  value={selectedClassCode}
                  onChange={(e) => setSelectedClassCode(e.target.value)}
                  className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                >
                  <option value="">
                    {tr('— Chưa xếp lớp —', '— Unassigned —')}
                  </option>
                  {classesList
                    .filter((cls) => cls.active !== false)
                    .map((cls) => (
                      <option
                        key={cls.id}
                        value={cls.id}
                        disabled={cls.id.toUpperCase() === currentClassCode.toUpperCase()}
                      >
                        {cls.id} · {translateCourseTitle(cls.name, lang)}
                        {cls.id.toUpperCase() === currentClassCode.toUpperCase()
                          ? tr(' (Lớp hiện tại)', ' (Current class)')
                          : ''}
                      </option>
                    ))}
                </select>

                <button
                  type="submit"
                  data-testid="drawer-save-class-btn"
                  disabled={
                    !selectedClassCode ||
                    selectedClassCode.toUpperCase() === currentClassCode.toUpperCase() ||
                    isAssigningClass
                  }
                  className="inline-flex min-h-[36px] shrink-0 items-center justify-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isAssigningClass ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <GraduationCap className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {currentClassCode
                      ? tr('Chuyển lớp', 'Transfer')
                      : tr('Xếp lớp', 'Assign')}
                  </span>
                </button>
              </div>

              {selectedClassCode &&
                selectedClassCode.toUpperCase() !== currentClassCode.toUpperCase() && (
                  <p
                    data-testid="drawer-class-change-preview"
                    className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                  >
                    {tr('Xác nhận chuyển lớp:', 'Confirm class transfer:')}{' '}
                    <strong>{currentClassCode || tr('Chưa xếp lớp', 'Unassigned')}</strong> →{' '}
                    <strong className="text-red-900">{selectedClassCode}</strong>.{' '}
                    {tr(
                      `Quyền khóa học video (${entitledCourses.length} khóa)`,
                      `Video course entitlements (${entitledCourses.length} courses)`
                    )}{' '}
                    <strong>{tr('không thay đổi', 'remain unchanged')}</strong>.
                  </p>
                )}
            </form>

            {/* Optional Multi-Class Enrollment Checkboxes */}
            {classesList.some((cls) => cls.active !== false) && (
              <div
                data-testid="drawer-multiclass-section"
                className="mt-3 space-y-2 border-t border-stone-100 pt-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-stone-700">
                    {tr(
                      'Học nhiều lớp cùng lúc (tùy chọn)',
                      'Multi-class enrollment (optional)'
                    )}
                  </span>
                  {currentEnrolledClasses.length > 1 && (
                    <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      {currentEnrolledClasses.length} {tr('lớp', 'classes')}
                    </span>
                  )}
                </div>
                <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50/70 p-2">
                  {classesList
                    .filter((cls) => cls.active !== false)
                    .map((cls) => {
                      const code = cls.id.toUpperCase();
                      const checked = selectedEnrolledClasses.includes(code);
                      return (
                        <label
                          key={cls.id}
                          className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-2 py-1 text-[11px] font-bold transition-colors ${
                            checked
                              ? 'border-red-800 bg-red-50 text-red-900'
                              : 'border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                          }`}
                        >
                          <input
                            type="checkbox"
                            data-testid={`drawer-multiclass-checkbox-${cls.id}`}
                            checked={checked}
                            onChange={(e) => {
                              const isChecked = e.target.checked;
                              setSelectedEnrolledClasses((prev) =>
                                isChecked
                                  ? Array.from(new Set([...prev, code]))
                                  : prev.filter((item) => item !== code)
                              );
                            }}
                            className="h-3.5 w-3.5 accent-red-800"
                          />
                          <span>{cls.id}</span>
                        </label>
                      );
                    })}
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="drawer-save-multiclass-btn"
                    disabled={
                      isAssigningClass ||
                      (selectedEnrolledClasses.length === currentEnrolledClasses.length &&
                        selectedEnrolledClasses.every((c) => currentEnrolledClasses.includes(c)))
                    }
                    onClick={handleSaveMultiClasses}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isAssigningClass && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>{tr('Lưu danh sách lớp', 'Save enrolled classes')}</span>
                  </button>
                </div>
              </div>
            )}
          </section>

          {/* =============================================================== */}
          {/* KHU VỰC D: TRẠNG THÁI TÀI KHOẢN VÀ ĐỒNG BỘ                      */}
          {/* =============================================================== */}
          <section
            data-testid="drawer-section-sync"
            className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                <span>
                  {tr('D. Trạng thái tài khoản & đồng bộ', 'D. Account & Sync Status')}
                </span>
              </h3>
              <button
                type="button"
                data-testid="drawer-resync-student-btn"
                disabled={isResyncing}
                onClick={() => onResyncStudent(student)}
                className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  syncBreakdown.needsAttention
                    ? 'bg-red-800 text-white hover:bg-red-900'
                    : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                }`}
              >
                <RefreshCw
                  className={`h-3 w-3 ${isResyncing ? 'animate-spin' : ''}`}
                />
                <span>{tr('Đồng bộ lại', 'Re-sync')}</span>
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {/* 1. Account Login Status */}
              <div className="rounded-lg border border-stone-200/80 bg-stone-50/70 p-2.5">
                <span className="block text-[10px] font-semibold text-stone-500">
                  {tr('Tài khoản đăng nhập', 'Login Account')}
                </span>
                <span
                  data-testid="drawer-status-account"
                  className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    syncBreakdown.accountTone === 'emerald'
                      ? 'bg-emerald-100 text-emerald-900'
                      : syncBreakdown.accountTone === 'red'
                      ? 'bg-red-100 text-red-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {syncBreakdown.accountTone === 'emerald' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {syncBreakdown.accountLabel}
                </span>
              </div>

              {/* 2. Course Entitlements Sync Status */}
              <div className="rounded-lg border border-stone-200/80 bg-stone-50/70 p-2.5">
                <span className="block text-[10px] font-semibold text-stone-500">
                  {tr('Quyền khóa học', 'Course Access')}
                </span>
                <span
                  data-testid="drawer-status-courses"
                  className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    syncBreakdown.coursesTone === 'emerald'
                      ? 'bg-emerald-100 text-emerald-900'
                      : syncBreakdown.coursesTone === 'red'
                      ? 'bg-red-100 text-red-900'
                      : 'bg-amber-100 text-amber-900'
                  }`}
                >
                  {syncBreakdown.coursesTone === 'emerald' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : (
                    <AlertCircle className="h-3 w-3" />
                  )}
                  {syncBreakdown.coursesLabel}
                </span>
              </div>

              {/* 3. Live Class Sync Status */}
              <div className="rounded-lg border border-stone-200/80 bg-stone-50/70 p-2.5">
                <span className="block text-[10px] font-semibold text-stone-500">
                  {tr('Lớp học trực tiếp', 'Live Class')}
                </span>
                <span
                  data-testid="drawer-status-class"
                  className={`mt-1 inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[11px] font-bold ${
                    syncBreakdown.classTone === 'emerald'
                      ? 'bg-emerald-100 text-emerald-900'
                      : syncBreakdown.classTone === 'red'
                      ? 'bg-red-100 text-red-900'
                      : syncBreakdown.classTone === 'amber'
                      ? 'bg-amber-100 text-amber-900'
                      : 'bg-stone-200/80 text-stone-700'
                  }`}
                >
                  {syncBreakdown.classTone === 'emerald' ? (
                    <CheckCircle2 className="h-3 w-3" />
                  ) : syncBreakdown.classTone === 'red' ||
                    syncBreakdown.classTone === 'amber' ? (
                    <AlertCircle className="h-3 w-3" />
                  ) : null}
                  {syncBreakdown.classLabel}
                </span>
              </div>
            </div>

            {student.last_sync_error && (
              <p
                data-testid="drawer-sync-error-detail"
                className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-[11px] text-red-900"
              >
                {tr('Chi tiết lỗi đồng bộ gần nhất:', 'Latest sync error detail:')}{' '}
                <strong>{student.last_sync_error}</strong>
              </p>
            )}
          </section>

          {/* =============================================================== */}
          {/* ĐẶT LẠI MẬT KHẨU HỌC VIÊN (MẶC ĐỊNH 12345678)                     */}
          {/* =============================================================== */}
          <section
            data-testid="student-reset-password-section"
            className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                <KeyRound className="h-3.5 w-3.5 text-red-800" />
                <span>{tr('Đặt lại mật khẩu học viên', 'Reset Student Password')}</span>
              </h3>
              <span className="rounded-md bg-amber-100 px-2 py-0.5 font-mono text-[10px] font-bold text-amber-900">
                {tr('Mặc định: 12345678', 'Default: 12345678')}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-stone-600">
              {tr(
                'Cấp lại mật khẩu đăng nhập cho học viên',
                'Reset login password for student'
              )}{' '}
              <strong className="font-mono">{student.code || student.email}</strong>{' '}
              {tr('(1 chạm về', '(1-click reset to')}{' '}
              <code className="font-mono font-bold">12345678</code>{' '}
              {tr(
                'hoặc nhập mật khẩu tùy chọn tối thiểu 6 ký tự).',
                'or enter a custom password of at least 6 chars).'
              )}
            </p>
            <div className="mt-2.5 flex flex-col gap-2 sm:flex-row sm:items-center">
              <input
                type="text"
                data-testid="drawer-reset-password-input"
                value={resetPasswordInput}
                onChange={(e) => setResetPasswordInput(e.target.value)}
                placeholder="12345678"
                className="w-full rounded-xl border border-stone-300 px-3 py-1.5 font-mono text-xs font-bold text-stone-900 sm:w-44"
              />
              <button
                type="button"
                data-testid="drawer-reset-password-btn"
                disabled={
                  isResettingPassword ||
                  (resetPasswordInput.trim().length > 0 && resetPasswordInput.trim().length < 6)
                }
                onClick={async () => {
                  const targetPwd = resetPasswordInput.trim() || '12345678';
                  setIsResettingPassword(true);
                  setResetPasswordFeedback(null);
                  try {
                    const res = await ktnApi.resetUserPassword({
                      email: student.email,
                      role: 'student',
                      newPassword: targetPwd,
                    });
                    setResetPasswordFeedback({
                      ok: true,
                      message:
                        res.message ||
                        tr(
                          `Đã đặt lại mật khẩu cho ${student.code || student.email} thành "${targetPwd}".`,
                          `Password reset for ${student.code || student.email} to "${targetPwd}".`
                        ),
                    });
                  } catch (err: unknown) {
                    setResetPasswordFeedback({
                      ok: false,
                      message:
                        err instanceof Error
                          ? err.message
                          : tr(
                              'Không thể đặt lại mật khẩu học viên.',
                              'Unable to reset student password.'
                            ),
                    });
                  } finally {
                    setIsResettingPassword(false);
                  }
                }}
                className="inline-flex min-h-[34px] items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-50"
              >
                {isResettingPassword ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <KeyRound className="h-3.5 w-3.5" />
                )}
                <span>
                  {resetPasswordInput.trim() && resetPasswordInput.trim() !== '12345678'
                    ? tr(
                        `Đặt lại mật khẩu (${resetPasswordInput.trim()})`,
                        `Reset password (${resetPasswordInput.trim()})`
                      )
                    : tr('Đặt lại mật khẩu (12345678)', 'Reset password (12345678)')}
                </span>
              </button>
            </div>
            {resetPasswordFeedback && (
              <div
                data-testid="drawer-reset-password-feedback"
                className={`mt-2 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  resetPasswordFeedback.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                    : 'border-red-200 bg-red-50 text-red-800'
                }`}
              >
                {resetPasswordFeedback.message}
              </div>
            )}
          </section>

          {/* =============================================================== */}
          {/* KHU VỰC E: QUẢN LÝ TÀI KHOẢN (KHÓA / LƯU TRỮ / KHÔI PHỤC / XÓA) */}
          {/* =============================================================== */}
          {onManageLifecycle && (
            <section
              data-testid="student-lifecycle-section"
              className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
            >
              <div className="flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-1.5 font-display text-xs font-extrabold uppercase tracking-wide text-stone-700">
                  <Lock className="h-3.5 w-3.5 text-red-800" />
                  <span>{tr('E. Quản lý tài khoản', 'E. Account Lifecycle')}</span>
                </h3>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                  {tr('Vòng đời học viên', 'Student lifecycle')}
                </span>
              </div>

              <p className="mt-1.5 text-[11px] text-stone-600">
                {tr(
                  'Quản lý trạng thái đăng nhập, lưu trữ hồ sơ nghỉ học hoặc xóa có điều kiện. Hệ thống',
                  'Manage login status, archive inactive profiles, or conditional delete. The system'
                )}{' '}
                <strong>
                  {tr('bảo toàn tuyệt đối dữ liệu đơn hàng (', 'strictly preserves orders (')}
                  <code className="font-mono">ktn_orders</code>
                  {tr(
                    '), thanh toán và lịch sử học tập',
                    '), payment records, and learning history'
                  )}
                </strong>{' '}
                {tr('theo chính sách lưu trữ.', 'per retention policy.')}
              </p>

              {/* Multi-System Sync Status (Supabase / Cognito / izTeach) */}
              <div
                data-testid="drawer-lifecycle-multisystem-status"
                className="mt-2.5 grid grid-cols-1 gap-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2.5 text-[11px] sm:grid-cols-3"
              >
                <div className="rounded-lg bg-white p-2 border border-stone-200/80">
                  <span className="block text-[10px] font-bold uppercase text-stone-500">
                    1. Supabase (ktn_students)
                  </span>
                  <span
                    data-testid="drawer-lifecycle-supabase-state"
                    className="mt-0.5 block font-bold text-stone-900"
                  >
                    {syncBreakdown.accountLabel} ({syncBreakdown.effectiveAccountStatus})
                  </span>
                </div>

                <div className="rounded-lg bg-white p-2 border border-stone-200/80">
                  <span className="block text-[10px] font-bold uppercase text-stone-500">
                    2. Cognito (Auth Upstream)
                  </span>
                  <span
                    data-testid="drawer-lifecycle-cognito-state"
                    className="mt-0.5 block font-bold text-stone-800"
                  >
                    {student.cognito_user_id
                      ? tr(
                          `Đã liên kết (${student.cognito_user_id.slice(0, 8)}…) · Chưa hỗ trợ xóa cứng tự động`,
                          `Linked (${student.cognito_user_id.slice(0, 8)}…) · No auto hard-delete`
                        )
                      : tr('Chưa liên kết Cognito UUID', 'Cognito UUID not linked')}
                  </span>
                </div>

                <div className="rounded-lg bg-white p-2 border border-stone-200/80">
                  <span className="block text-[10px] font-bold uppercase text-stone-500">
                    3. izTeach (LMS Upstream)
                  </span>
                  <span
                    data-testid="drawer-lifecycle-izteach-state"
                    className="mt-0.5 block font-bold text-stone-800"
                  >
                    {student.izteach_student_id || entitledCourses.length > 0
                      ? tr(
                          `Có dữ liệu (${entitledCourses.length} khóa) · Chỉ chặn đồng bộ ngược, chưa xóa cứng upstream`,
                          `Has data (${entitledCourses.length} courses) · Reverse sync blocked only, no upstream hard-delete`
                        )
                      : tr('Chưa phát sinh khóa học izTeach', 'No izTeach courses yet')}
                  </span>
                </div>
              </div>

              {/* Honest Post-Lifecycle Multi-System Feedback Banner */}
              {lastLifecycleFeedback && (
                <div
                  role="status"
                  data-testid="drawer-lifecycle-result-banner"
                  className={`mt-2.5 rounded-xl border p-3 text-xs ${
                    lastLifecycleFeedback.action === 'delete' &&
                    !lastLifecycleFeedback.upstreamVerified
                      ? 'border-amber-300 bg-amber-50 text-amber-950'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-950'
                  }`}
                >
                  <p className="font-bold">
                    {lastLifecycleFeedback.action === 'delete' &&
                    !lastLifecycleFeedback.upstreamVerified
                      ? tr(
                          'Cảnh báo: Mới xử lý cục bộ trên Supabase — Chưa xác minh xóa tài khoản gốc trên Cognito/izTeach',
                          'Warning: Processed locally on Supabase — Upstream deletion on Cognito/izTeach not verified'
                        )
                      : tr(
                          'Đã cập nhật trạng thái vòng đời học viên',
                          'Student lifecycle status updated'
                        )}
                  </p>
                  <p className="mt-1 text-[11px]">{lastLifecycleFeedback.summaryText}</p>
                  {lastLifecycleFeedback.action === 'delete' && (
                    <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px]">
                      <li>
                        <strong>Supabase:</strong>{' '}
                        {tr('Đã chuyển trạng thái', 'Marked')}{' '}
                        <code className="font-mono">deleted</code>{' '}
                        {tr('& chặn đồng bộ ngược', '& reverse sync blocked')} (
                        <code className="font-mono">
                          reverseSyncBlocked: {lastLifecycleFeedback.reverseSyncBlocked ? 'true' : 'false'}
                        </code>
                        ).
                      </li>
                      <li>
                        <strong>Cognito & izTeach:</strong>{' '}
                        {lastLifecycleFeedback.upstreamVerified
                          ? tr(
                              'Đã xác minh vô hiệu hóa/xóa trên Cognito và izTeach.',
                              'Verified disabled/deleted on Cognito and izTeach.'
                            )
                          : tr(
                              'Chưa xác minh xóa/vô hiệu hóa tài khoản gốc trên Cognito/izTeach (hệ thống không báo xóa thành công toàn cục khi upstream chưa xác nhận).',
                              'Root account deletion/disablement on Cognito/izTeach unverified (global deletion is not claimed until confirmed upstream).'
                            )}
                      </li>
                      <li>
                        <strong>{tr('Chính sách lưu trữ:', 'Retention Policy:')}</strong>{' '}
                        {tr('Dữ liệu đơn hàng (', 'Orders (')}
                        <code className="font-mono">ktn_orders</code>
                        {tr(
                          '), thanh toán và lịch sử học tập được giữ nguyên',
                          '), payments, and learning history preserved'
                        )}{' '}
                        (
                        <code className="font-mono">
                          preservedOrders: {lastLifecycleFeedback.preservedOrders ? 'true' : 'false'}
                        </code>
                        ).
                      </li>
                    </ul>
                  )}
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  data-testid="drawer-lifecycle-suspend-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('suspend');
                    setLifecycleReason(
                      tr('Tạm khóa tài khoản học viên', 'Suspend student account')
                    );
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>{tr('Tạm khóa tài khoản', 'Suspend')}</span>
                </button>

                <button
                  type="button"
                  data-testid="drawer-lifecycle-archive-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('archive');
                    setLifecycleReason(
                      tr(
                        'Học viên đã hoàn thành khóa học / lưu trữ hồ sơ',
                        'Student completed course / archive profile'
                      )
                    );
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-stone-300 bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-200 disabled:opacity-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>{tr('Lưu trữ học viên', 'Archive')}</span>
                </button>

                <button
                  type="button"
                  data-testid="drawer-lifecycle-restore-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('restore');
                    setLifecycleReason(
                      tr('Khôi phục hoạt động tài khoản học viên', 'Restore student account')
                    );
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>{tr('Khôi phục', 'Restore')}</span>
                </button>

                <button
                  type="button"
                  data-testid="drawer-lifecycle-delete-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('delete');
                    setLifecycleReason('');
                    setDeleteConfirmChecked(false);
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-red-300 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100 disabled:opacity-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  <span>{tr('Xóa vĩnh viễn có điều kiện', 'Conditional Delete')}</span>
                </button>
              </div>

              {pendingLifecycleAction && (
                <div
                  data-testid="drawer-lifecycle-confirm-box"
                  className={`mt-3 space-y-2.5 rounded-xl border p-3 text-xs ${
                    pendingLifecycleAction === 'delete'
                      ? 'border-red-300 bg-red-50/90 text-red-950'
                      : 'border-stone-300 bg-stone-50 text-stone-900'
                  }`}
                >
                  <p className="font-bold">
                    {pendingLifecycleAction === 'suspend' &&
                      tr(
                        `Xác nhận TẠM KHÓA tài khoản ${student.name} (${student.email})`,
                        `Confirm SUSPEND account ${student.name} (${student.email})`
                      )}
                    {pendingLifecycleAction === 'archive' &&
                      tr(
                        `Xác nhận LƯU TRỮ học viên ${student.name} (${student.email})`,
                        `Confirm ARCHIVE student ${student.name} (${student.email})`
                      )}
                    {pendingLifecycleAction === 'restore' &&
                      tr(
                        `Xác nhận KHÔI PHỤC tài khoản ${student.name} (${student.email})`,
                        `Confirm RESTORE account ${student.name} (${student.email})`
                      )}
                    {pendingLifecycleAction === 'delete' &&
                      tr(
                        `CẢNH BÁO P0: Xóa có điều kiện học viên ${student.name} (${student.email}) — Chưa xóa cứng Cognito/izTeach`,
                        `P0 WARNING: Conditional delete ${student.name} (${student.email}) — Cognito/izTeach not hard-deleted`
                      )}
                  </p>

                  {pendingLifecycleAction === 'delete' && (
                    <div
                      data-testid="drawer-lifecycle-retention-warning"
                      className="space-y-1.5 rounded-lg border border-red-200 bg-white/95 p-2.5 text-[11px] text-red-900"
                    >
                      <p className="font-bold text-red-950">
                        {tr(
                          'Trạng thái đồng bộ xóa đa hệ thống & Chính sách lưu trữ bắt buộc:',
                          'Multi-system delete status & mandatory retention policy:'
                        )}
                      </p>
                      <p>
                        • <strong>Supabase (<code className="font-mono">ktn_students</code>):</strong>{' '}
                        {tr(
                          'Gỡ bản ghi khỏi danh sách hoạt động và bật cờ chặn đồng bộ ngược (',
                          'Removes record from active list and enables reverse-sync block ('
                        )}
                        <code className="font-mono">reverseSyncBlocked</code>
                        {tr(
                          ') để izTeach không tự tạo lại hồ sơ.',
                          ') so izTeach does not recreate the profile.'
                        )}
                      </p>
                      <p>
                        •{' '}
                        <strong>
                          {tr(
                            'Cognito & izTeach Upstream (Chưa nghiệm thu xóa cứng):',
                            'Cognito & izTeach Upstream (Hard-delete unverified):'
                          )}
                        </strong>{' '}
                        {tr('Worker hiện', 'Worker has')}{' '}
                        <strong>
                          {tr(
                            'chưa chứng minh xóa/vô hiệu hóa hoàn toàn tài khoản gốc trên Cognito/izTeach',
                            'not verified full deletion/disablement on Cognito/izTeach'
                          )}
                        </strong>
                        {tr(
                          '. Hệ thống sẽ ghi nhận trạng thái xóa cục bộ có kiểm soát và không báo cáo gây hiểu lầm là đã xóa sạch trên mọi hệ thống.',
                          '. The system records a controlled local deletion without claiming full cross-system wipe.'
                        )}
                      </p>
                      <p>
                        • <strong>{tr('Bảo toàn dữ liệu tài chính & học tập:', 'Financial & learning data retention:')}</strong>{' '}
                        {tr('Tài khoản đã có đơn hàng (', 'Accounts with orders (')}
                        <code className="font-mono">ktn_orders</code>
                        {tr(
                          '), lịch sử thanh toán hoặc lịch sử nộp bài/học tập',
                          '), payments, or learning/submission history'
                        )}{' '}
                        <strong>
                          {tr(
                            'không được xóa trắng trái chính sách lưu trữ',
                            'cannot be wiped against retention policy'
                          )}
                        </strong>
                        .
                        {(hasExistingOrders || entitledCourses.length > 0 || Boolean(currentClassCode)) && (
                          <span className="mt-1 block rounded bg-amber-100 px-2 py-1 font-bold text-amber-950">
                            {tr(
                              `Lưu ý: Học viên này đang có dữ liệu liên kết (${entitledCourses.length} khóa học${currentClassCode ? `, lớp ${currentClassCode}` : ''}${hasExistingOrders ? ', có đơn hàng thanh toán' : ''}). Khuyến nghị dùng Tạm khóa hoặc Lưu trữ; không xóa thật trong giai đoạn Pilot.`,
                              `Note: Student has linked data (${entitledCourses.length} courses${currentClassCode ? `, class ${currentClassCode}` : ''}${hasExistingOrders ? ', payment orders' : ''}). Suspend or Archive recommended; avoid real deletion during Pilot.`
                            )}
                          </span>
                        )}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold">
                      {tr('Lý do thực hiện', 'Reason')}{' '}
                      {pendingLifecycleAction === 'delete'
                        ? tr('* (tối thiểu 3 ký tự)', '* (min 3 chars)')
                        : ''}
                      :
                    </label>
                    <input
                      type="text"
                      data-testid="drawer-lifecycle-reason-input"
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder={tr(
                        'Nhập lý do (lưu vào nhật ký kiểm toán Quản lý)...',
                        'Enter reason (recorded in Admin audit log)...'
                      )}
                      className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900"
                    />
                  </div>

                  {pendingLifecycleAction === 'delete' && (
                    <label className="flex cursor-pointer items-start gap-2 text-[11px] font-bold text-red-900">
                      <input
                        type="checkbox"
                        data-testid="drawer-lifecycle-delete-confirm-checkbox"
                        checked={deleteConfirmChecked}
                        onChange={(e) => setDeleteConfirmChecked(e.target.checked)}
                        className="mt-0.5 rounded border-red-400"
                      />
                      <span>
                        {tr(
                          `Tôi hiểu rõ thao tác này chỉ xóa/ẩn hồ sơ hoạt động trên Supabase (chưa xóa cứng Cognito/izTeach) và giữ nguyên toàn bộ đơn hàng, thanh toán, lịch sử học tập của ${student.email}.`,
                          `I understand this only hides/deletes the active profile on Supabase (not Cognito/izTeach) and preserves all orders, payments, and learning history of ${student.email}.`
                        )}
                      </span>
                    </label>
                  )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPendingLifecycleAction(null);
                        setLifecycleReason('');
                        setDeleteConfirmChecked(false);
                      }}
                      className="rounded-lg border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-700"
                    >
                      {tr('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="button"
                      data-testid="drawer-lifecycle-confirm-submit-btn"
                      disabled={
                        isManagingLifecycle ||
                        (pendingLifecycleAction === 'delete' &&
                          (!deleteConfirmChecked || lifecycleReason.trim().length < 3))
                      }
                      onClick={async () => {
                        onClearError();
                        try {
                          const actionToRun = pendingLifecycleAction;
                          const res = (await onManageLifecycle({
                            email: student.email,
                            action: actionToRun,
                            reason: lifecycleReason.trim() || undefined,
                            ...(actionToRun === 'delete' ? { confirmDelete: true } : {}),
                          })) as Record<string, unknown> | undefined;

                          const cognitoVerified = Boolean(
                            res?.cognitoDeleted === true || res?.cognitoDisabled === true
                          );
                          const izteachVerified = Boolean(
                            res?.izteachDeleted === true || res?.izteachRevoked === true
                          );
                          const upstreamVerified = Boolean(
                            res?.upstreamVerified === true ||
                              (cognitoVerified && izteachVerified)
                          );
                          const preservedOrders = res?.preservedOrders !== false;
                          const reverseSyncBlocked = res?.reverseSyncBlocked !== false;

                          const defaultTargetStatus =
                            actionToRun === 'suspend'
                              ? 'suspended'
                              : actionToRun === 'archive'
                              ? 'archived'
                              : actionToRun === 'delete'
                              ? 'deleted'
                              : 'active';

                          setLastLifecycleFeedback({
                            action: actionToRun,
                            status: String(res?.status || defaultTargetStatus).toLowerCase(),
                            upstreamVerified,
                            cognitoVerified,
                            izteachVerified,
                            preservedOrders,
                            reverseSyncBlocked,
                            summaryText:
                              actionToRun === 'delete' && !upstreamVerified
                                ? tr(
                                    `Đã gỡ ${student.email} khỏi danh sách hoạt động Supabase và chặn đồng bộ ngược. Chưa xác minh xóa tài khoản gốc trên Cognito/izTeach; dữ liệu đơn hàng & lịch sử học tập vẫn được bảo toàn.`,
                                    `Removed ${student.email} from active Supabase list and blocked reverse sync. Root Cognito/izTeach deletion unverified; orders & learning history preserved.`
                                  )
                                : typeof res?.message === 'string' && res.message
                                ? res.message
                                : tr(
                                    `Đã cập nhật trạng thái (${actionToRun}) cho học viên ${student.email}.`,
                                    `Updated status (${actionToRun}) for student ${student.email}.`
                                  ),
                          });

                          setPendingLifecycleAction(null);
                          setLifecycleReason('');
                          setDeleteConfirmChecked(false);
                        } catch {
                          // Error displayed via actionError
                        }
                      }}
                      className={`inline-flex items-center gap-1 rounded-lg px-3 py-1 text-xs font-bold text-white disabled:opacity-50 ${
                        pendingLifecycleAction === 'delete'
                          ? 'bg-red-800 hover:bg-red-900'
                          : pendingLifecycleAction === 'restore'
                          ? 'bg-emerald-700 hover:bg-emerald-800'
                          : 'bg-stone-900 hover:bg-stone-800'
                      }`}
                    >
                      {isManagingLifecycle && (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      )}
                      <span>
                        {pendingLifecycleAction === 'delete'
                          ? tr(
                              'Xác nhận xóa có điều kiện (Supabase)',
                              'Confirm conditional delete (Supabase)'
                            )
                          : tr('Xác nhận thực hiện', 'Confirm action')}
                      </span>
                    </button>
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </aside>
    </div>
  );
};
