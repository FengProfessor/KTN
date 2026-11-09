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
} from 'lucide-react';
import {
  disambiguateCatalogCourses,
  resolveStudentOnlineCourses,
} from '@/lib/utils';
import type {
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
  onGrantCourses: (params: { email: string; courseIds: string[] }) => Promise<unknown>;
  onRevokeCourse: (params: { email: string; courseId: string }) => Promise<unknown>;
  onAssignClass: (params: { email: string; classCode: string | null }) => Promise<unknown>;
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
  }) => Promise<unknown>;
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
  onGrantCourses,
  onRevokeCourse,
  onAssignClass,
  onReplaceAllCourses,
  onUpdateProfile,
  onResyncStudent,
  onManageLifecycle,
  onCopyEmail,
}) => {
  // Section A: Profile edit state
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editParent, setEditParent] = useState('');

  // Section B: Course Grant / Revoke / Replace state (Always starts neutral!)
  const [courseDropdownId, setCourseDropdownId] = useState('');
  const [selectedGrantCourseIds, setSelectedGrantCourseIds] = useState<string[]>([]);
  const [courseSearchQuery, setCourseSearchQuery] = useState('');
  const [coursePendingRevokeId, setCoursePendingRevokeId] = useState<string | null>(null);
  const [showReplaceAllMode, setShowReplaceAllMode] = useState(false);
  const [replaceTargetCourseIds, setReplaceTargetCourseIds] = useState<string[]>([]);
  const [replaceConfirmedCheck, setReplaceConfirmedCheck] = useState(false);

  // Section C: Live Class Assignment state (Always starts neutral!)
  const [selectedClassCode, setSelectedClassCode] = useState('');
  const [showUnassignConfirm, setShowUnassignConfirm] = useState(false);

  // Section E: Account Lifecycle state
  const [pendingLifecycleAction, setPendingLifecycleAction] = useState<
    'suspend' | 'archive' | 'restore' | 'delete' | null
  >(null);
  const [lifecycleReason, setLifecycleReason] = useState('');
  const [deleteConfirmChecked, setDeleteConfirmChecked] = useState(false);

  // Reset form states to neutral whenever student changes
  useEffect(() => {
    if (!student) return;
    setIsEditingProfile(false);
    setEditName(student.name || '');
    setEditPhone(student.phone || '');
    setEditParent(student.parent_name || '');
    setCourseDropdownId('');
    setSelectedGrantCourseIds([]);
    setCourseSearchQuery('');
    setCoursePendingRevokeId(null);
    setShowReplaceAllMode(false);
    setReplaceTargetCourseIds([]);
    setReplaceConfirmedCheck(false);
    setSelectedClassCode('');
    setShowUnassignConfirm(false);
    setPendingLifecycleAction(null);
    setLifecycleReason('');
    setDeleteConfirmChecked(false);
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
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, coursePendingRevokeId, showUnassignConfirm, onClose]);

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
    const q = courseSearchQuery.trim().toLowerCase();
    if (!q) return disambiguatedCatalog;
    return disambiguatedCatalog.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.shortTitle || '').toLowerCase().includes(q) ||
        (c.code || '').toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
    );
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

  // Derive 3-part Account & Sync statuses for Section D
  const syncBreakdown = useMemo(() => {
    if (!student) {
      return {
        accountLabel: 'Chờ kích hoạt',
        accountTone: 'amber' as const,
        coursesLabel: 'Đã đồng bộ',
        coursesTone: 'emerald' as const,
        classLabel: 'Chưa xếp lớp',
        classTone: 'stone' as const,
        needsAttention: false,
      };
    }

    const rawAcc = String(
      student.accountStatus ||
        (student as unknown as Record<string, unknown>).account_status ||
        ''
    ).toLowerCase();
    const rawSync = String(
      student.syncStatus ||
        (student as unknown as Record<string, unknown>).sync_status ||
        ''
    ).toLowerCase();
    const hasCognito = Boolean(student.cognito_user_id);
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
    let accountLabel = 'Hoạt động';
    let accountTone: 'emerald' | 'amber' | 'red' = 'emerald';
    if (rawAcc === 'deleted') {
      accountLabel = 'Đã xóa';
      accountTone = 'red';
    } else if (rawAcc === 'suspended') {
      accountLabel = 'Tạm khóa';
      accountTone = 'amber';
    } else if (rawAcc === 'archived') {
      accountLabel = 'Đã lưu trữ';
      accountTone = 'amber';
    } else if (rawAcc === 'error' || rawAcc === 'sync_error') {
      accountLabel = 'Lỗi tài khoản';
      accountTone = 'red';
    } else if (
      rawAcc === 'pending_activation' ||
      (!hasCognito && rawAcc !== 'ready_to_login' && rawAcc !== 'active')
    ) {
      accountLabel = 'Chờ kích hoạt';
      accountTone = 'amber';
    }

    // 2. Course entitlements sync status
    let coursesLabel =
      entitledCourses.length > 0
        ? `Đã đồng bộ (${entitledCourses.length} khóa)`
        : 'Đã đồng bộ (0 khóa)';
    let coursesTone: 'emerald' | 'amber' | 'red' = 'emerald';
    if (hasSyncErr) {
      coursesLabel = 'Lỗi đồng bộ';
      coursesTone = 'red';
    } else if (isPendingSync && entitledCourses.length > 0) {
      coursesLabel = 'Chờ đồng bộ';
      coursesTone = 'amber';
    }

    // 3. Live class sync status
    let classLabel = 'Chưa xếp lớp';
    let classTone: 'emerald' | 'amber' | 'red' | 'stone' = 'stone';
    if (currentClassCode) {
      if (isLegacyUnknownClassCode) {
        classLabel = `Lỗi (Cần kiểm tra mã lớp ${currentClassCode})`;
        classTone = 'red';
      } else if (hasSyncErr) {
        classLabel = 'Lỗi đồng bộ';
        classTone = 'red';
      } else if (isPendingSync) {
        classLabel = `Chờ đồng bộ (${currentClassCode})`;
        classTone = 'amber';
      } else {
        classLabel = `Đã lưu (${currentClassCode})`;
        classTone = 'emerald';
      }
    }

    const needsAttention =
      accountTone !== 'emerald' ||
      coursesTone !== 'emerald' ||
      classTone === 'red' ||
      classTone === 'amber';

    return {
      accountLabel,
      accountTone,
      coursesLabel,
      coursesTone,
      classLabel,
      classTone,
      needsAttention,
    };
  }, [student, entitledCourses.length, currentClassCode, isLegacyUnknownClassCode]);

  if (!open || !student) return null;

  const isAnyMutating =
    isGrantingCourse ||
    isRevokingCourse ||
    isAssigningClass ||
    isReplacingCourses ||
    isUpdatingProfile ||
    isResyncing ||
    isManagingLifecycle;

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
      });
      setSelectedGrantCourseIds([]);
      setCourseDropdownId('');
    } catch {
      // Error is handled and displayed via actionError prop
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
      await onAssignClass({
        email: student.email,
        classCode: selectedClassCode,
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
      });
      setShowUnassignConfirm(false);
      setSelectedClassCode('');
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
              <span>Quay lại</span>
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
            aria-label="Đóng hồ sơ học viên"
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
                    Thao tác chưa hoàn tất — Dữ liệu chưa bị ghi đè
                  </p>
                  <p className="mt-0.5 text-red-800">{actionError}</p>
                </div>
              </div>
              <button
                type="button"
                aria-label="Đóng thông báo lỗi"
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
                <span>A. Thông tin học viên</span>
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
                <span>{isEditingProfile ? 'Đóng sửa' : 'Sửa hồ sơ'}</span>
              </button>
            </div>

            {/* Identity Email Callout */}
            <div className="mt-2.5 flex items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2">
              <div className="min-w-0">
                <p className="flex items-center gap-1 text-[10px] font-bold uppercase text-stone-500">
                  <Mail className="h-3 w-3 text-red-800" />
                  <span>Email đăng nhập (Định danh tài khoản)</span>
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
                aria-label="Sao chép email học viên"
                onClick={() => onCopyEmail?.(student.email)}
                className="inline-flex min-h-[28px] shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
              >
                <Copy className="h-3 w-3" />
                <span>Sao chép</span>
              </button>
            </div>

            {!isEditingProfile ? (
              <div className="mt-2.5 grid grid-cols-2 gap-2.5 text-xs">
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    Họ và tên
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
                    Mã học viên
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
                    Số điện thoại
                  </span>
                  <span
                    data-testid="drawer-info-phone"
                    className="inline-flex items-center gap-1 font-semibold text-stone-800"
                  >
                    <Phone className="h-3 w-3 text-stone-400" />
                    {student.phone || 'Chưa cập nhật'}
                  </span>
                </div>
                <div className="rounded-lg bg-stone-50/70 p-2">
                  <span className="block text-[10px] font-semibold text-stone-500">
                    Phụ huynh
                  </span>
                  <span
                    data-testid="drawer-info-parent"
                    className="font-semibold text-stone-800"
                  >
                    {student.parent_name || 'Chưa cập nhật'}
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
                    Email đăng nhập (Cố định theo Cognito/izTeach)
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
                      Họ tên học viên *
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
                      Số điện thoại
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
                      Phụ huynh
                    </label>
                    <input
                      type="text"
                      data-testid="drawer-profile-parent-input"
                      value={editParent}
                      onChange={(e) => setEditParent(e.target.value)}
                      placeholder="Tên phụ huynh"
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
                    Hủy
                  </button>
                  <button
                    type="submit"
                    data-testid="drawer-save-profile-btn"
                    disabled={isUpdatingProfile || !editName.trim()}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {isUpdatingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>Lưu thông tin</span>
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
                <span>B. Khóa học đã được cấp ({entitledCourses.length})</span>
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
                <span>{showReplaceAllMode ? 'Đóng chế độ thay thế' : 'Thay thế toàn bộ'}</span>
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
                  Học viên chưa được cấp khóa học trực tuyến nào.
                </div>
              ) : (
                entitledCourses.map((course) => (
                  <div
                    key={course.id}
                    data-testid={`drawer-granted-course-${course.id}`}
                    className="flex items-center justify-between gap-2 rounded-xl border border-emerald-200/80 bg-emerald-50/60 px-3 py-2"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-emerald-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          {course.code}
                        </span>
                        <p className="truncate text-xs font-bold text-stone-900">
                          {course.fullDisplayLabel}
                        </p>
                      </div>
                      <p className="mt-0.5 font-mono text-[10px] text-stone-500">
                        ID: {course.id}
                      </p>
                    </div>
                    <button
                      type="button"
                      data-testid={`drawer-revoke-course-btn-${course.id}`}
                      disabled={isRevokingCourse}
                      onClick={() => setCoursePendingRevokeId(course.id)}
                      className="inline-flex min-h-[30px] shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3 w-3" />
                      <span>Thu hồi</span>
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Inline Confirmation for Revoking a Single Course */}
            {coursePendingRevokeObj && (
              <div
                data-testid="drawer-revoke-confirm-box"
                className="mt-3 rounded-xl border-2 border-red-300 bg-red-50/90 p-3 text-xs text-red-950"
              >
                <p className="font-bold text-red-900">
                  Xác nhận thu hồi khóa học:{' '}
                  <span className="underline">{coursePendingRevokeObj.fullDisplayLabel}</span>?
                </p>
                <ul className="mt-1.5 list-inside list-disc space-y-0.5 text-[11px] text-red-900">
                  <li>
                    Chỉ thu hồi mã khóa học{' '}
                    <code className="font-mono font-bold">{coursePendingRevokeObj.id}</code>.
                  </li>
                  <li>
                    Lớp học trực tiếp (
                    <strong>{currentClassCode || 'Chưa xếp lớp'}</strong>) sẽ{' '}
                    <strong>không thay đổi</strong>.
                  </li>
                  <li>
                    Các khóa học khác ({Math.max(0, entitledCourses.length - 1)} khóa) được{' '}
                    <strong>giữ nguyên</strong>.
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
                    Hủy
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
                    <span>Xác nhận thu hồi</span>
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
                Cấp thêm khóa học mới (Không ảnh hưởng lớp học hoặc khóa đã có):
              </label>

              {catalogError ? (
                <div
                  role="alert"
                  data-testid="drawer-catalog-error-alert"
                  className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
                >
                  <span>
                    Không tải được danh mục khóa học từ izTeach. Hệ thống không dùng khóa demo trong chế độ thật.
                  </span>
                  <button
                    type="button"
                    onClick={onRetryCatalog}
                    className="shrink-0 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-red-800"
                  >
                    Thử lại
                  </button>
                </div>
              ) : (
                <>
                  {/* Neutral Course Select Dropdown */}
                  <div>
                    <select
                      aria-label="Chọn khóa học cần cấp"
                      data-testid="drawer-course-select"
                      value={courseDropdownId}
                      disabled={catalogLoading}
                      onChange={(e) => handleDropdownCourseChange(e.target.value)}
                      className="w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                    >
                      <option value="">— Chưa chọn khóa học —</option>
                      {disambiguatedCatalog.map((course) => {
                        const alreadyHas = entitledIdSet.has(course.id);
                        return (
                          <option
                            key={course.id}
                            value={course.id}
                            disabled={alreadyHas}
                          >
                            {course.fullDisplayLabel} ({course.code})
                            {alreadyHas ? ' — Đã cấp' : ''}
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
                        placeholder="Tìm khóa học trong catalog (tên, mã HSK/YCT, ID)..."
                        className="w-full rounded-lg border border-stone-200 bg-stone-50 py-1.5 pl-8 pr-2.5 text-xs font-medium text-stone-800 focus:border-red-800 focus:bg-white focus:outline-none"
                      />
                    </div>

                    <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50/70 p-2">
                      {filteredCatalog.length === 0 ? (
                        <span className="text-[11px] text-stone-500">
                          Không tìm thấy khóa học phù hợp trong catalog.
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
                              <span>{course.displayLabel}</span>
                              {alreadyHas && <span className="text-[9px]">(Đã có)</span>}
                            </button>
                          );
                        })
                      )}
                    </div>
                  </div>

                  {/* Preview Box Before Confirming Grant */}
                  {selectedCoursesPreview.length > 0 && (
                    <div
                      data-testid="drawer-grant-preview"
                      className="rounded-xl border border-amber-200 bg-amber-50/70 p-2.5 text-xs text-amber-950"
                    >
                      <p className="font-bold text-amber-900">
                        Xem trước thay đổi (Cấp thêm {selectedCoursesPreview.length} khóa học):
                      </p>
                      <ul className="mt-1 space-y-0.5 text-[11px]">
                        {selectedCoursesPreview.map((c) => (
                          <li key={c.id} className="font-semibold text-emerald-900">
                            + Thêm: {c.fullDisplayLabel} (
                            <code className="font-mono text-[10px]">{c.id}</code>)
                          </li>
                        ))}
                        <li className="text-stone-600">
                          • Giữ nguyên {entitledCourses.length} khóa học hiện có & Lớp trực tiếp:{' '}
                          <strong>{currentClassCode || 'Chưa xếp lớp'}</strong> (không đổi)
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
                        Bỏ chọn
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
                          ? `Cấp ${selectedGrantCourseIds.length} khóa đã chọn`
                          : 'Cấp khóa học'}
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
                    Chế độ Thay thế toàn bộ khóa học (Ghi đè danh sách khóa):
                  </p>
                </div>
                <p className="text-[11px] text-amber-900">
                  Chọn chính xác các khóa học muốn giữ lại cho học viên. Những khóa bỏ chọn sẽ bị thu hồi. Lớp trực tiếp ({currentClassCode || 'Chưa xếp lớp'}) không bị ảnh hưởng.
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
                        {course.displayLabel}
                      </button>
                    );
                  })}
                </div>

                <div className="rounded-lg bg-white p-2 text-[11px] text-stone-700">
                  <p>
                    • Sẽ thêm mới: <strong>{replaceAddedCourses.length} khóa</strong> · Sẽ thu hồi:{' '}
                    <strong className="text-red-700">{replaceRemovedCourses.length} khóa</strong>
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
                  <span>Tôi xác nhận thay thế toàn bộ danh sách khóa học theo lựa chọn trên</span>
                </label>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowReplaceAllMode(false)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700"
                  >
                    Đóng
                  </button>
                  <button
                    type="submit"
                    data-testid="drawer-confirm-replace-btn"
                    disabled={!replaceConfirmedCheck || isReplacingCourses}
                    className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-amber-800 px-3 py-1 text-xs font-bold text-white hover:bg-amber-900 disabled:opacity-40"
                  >
                    {isReplacingCourses && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>Xác nhận thay thế toàn bộ</span>
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
                <span>C. Lớp học trực tiếp</span>
              </h3>
              {currentClassCode && !showUnassignConfirm && (
                <button
                  type="button"
                  data-testid="drawer-unassign-class-btn"
                  disabled={isAssigningClass}
                  onClick={() => setShowUnassignConfirm(true)}
                  className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-0.5 text-[10px] font-bold text-stone-600 hover:bg-red-50 hover:text-red-800"
                >
                  Bỏ xếp lớp
                </button>
              )}
            </div>

            {/* Current Live Class Status */}
            <div className="mt-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <span className="block text-[10px] font-semibold uppercase text-stone-500">
                    Lớp hiện tại
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
                          {matchedClassItem.name} · GV: {matchedClassItem.teacher_name}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span
                      data-testid="drawer-current-class-badge"
                      className="mt-0.5 inline-block text-xs font-bold text-stone-500"
                    >
                      Chưa xếp lớp
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
                      Cần kiểm tra mã lớp ({currentClassCode})
                    </p>
                    <p className="text-amber-800">
                      Mã lớp hiện tại không nằm trong danh mục lớp đang hoạt động. Hệ thống giữ nguyên dữ liệu cũ và không tự xóa.
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
                  Xác nhận bỏ xếp lớp <strong>{currentClassCode}</strong> cho học viên{' '}
                  <strong>{student.name}</strong>?
                </p>
                <p className="mt-1 text-[11px] text-amber-900">
                  Danh sách khóa học trực tuyến ({entitledCourses.length} khóa) vẫn được giữ nguyên.
                </p>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowUnassignConfirm(false)}
                    className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    data-testid="drawer-confirm-unassign-class-btn"
                    disabled={isAssigningClass}
                    onClick={handleConfirmUnassignClass}
                    className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white"
                  >
                    {isAssigningClass && <Loader2 className="h-3 w-3 animate-spin" />}
                    <span>Xác nhận bỏ xếp lớp</span>
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
                {currentClassCode ? 'Chuyển sang lớp khác:' : 'Xếp vào lớp học trực tiếp:'}
              </label>

              <div className="flex flex-col gap-2 sm:flex-row">
                <select
                  aria-label="Chọn lớp học trực tiếp"
                  data-testid="drawer-class-select"
                  value={selectedClassCode}
                  onChange={(e) => setSelectedClassCode(e.target.value)}
                  className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                >
                  <option value="">— Chưa xếp lớp —</option>
                  {classesList.map((cls) => (
                    <option
                      key={cls.id}
                      value={cls.id}
                      disabled={cls.id.toUpperCase() === currentClassCode.toUpperCase()}
                    >
                      {cls.id} · {cls.name}
                      {cls.id.toUpperCase() === currentClassCode.toUpperCase()
                        ? ' (Lớp hiện tại)'
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
                  <span>{currentClassCode ? 'Chuyển lớp' : 'Xếp lớp'}</span>
                </button>
              </div>

              {selectedClassCode &&
                selectedClassCode.toUpperCase() !== currentClassCode.toUpperCase() && (
                  <p
                    data-testid="drawer-class-change-preview"
                    className="rounded-lg bg-stone-100 px-2.5 py-1.5 text-[11px] font-medium text-stone-700"
                  >
                    Xác nhận chuyển lớp:{' '}
                    <strong>{currentClassCode || 'Chưa xếp lớp'}</strong> →{' '}
                    <strong className="text-red-900">{selectedClassCode}</strong>. Quyền khóa học video ({entitledCourses.length} khóa) <strong>không thay đổi</strong>.
                  </p>
                )}
            </form>
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
                <span>D. Trạng thái tài khoản & đồng bộ</span>
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
                <span>Đồng bộ lại</span>
              </button>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {/* 1. Account Login Status */}
              <div className="rounded-lg border border-stone-200/80 bg-stone-50/70 p-2.5">
                <span className="block text-[10px] font-semibold text-stone-500">
                  Tài khoản đăng nhập
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
                  Quyền khóa học
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
                  Lớp học trực tiếp
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
                Chi tiết lỗi đồng bộ gần nhất: <strong>{student.last_sync_error}</strong>
              </p>
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
                  <span>E. Quản lý tài khoản</span>
                </h3>
                <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-600">
                  Vòng đời học viên
                </span>
              </div>

              <p className="mt-1.5 text-[11px] text-stone-600">
                Quản lý trạng thái đăng nhập, lưu trữ hồ sơ nghỉ học hoặc xóa vĩnh viễn có điều kiện (vẫn giữ nguyên dữ liệu đơn hàng tài chính <code className="font-mono">ktn_orders</code>).
              </p>

              <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                <button
                  type="button"
                  data-testid="drawer-lifecycle-suspend-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('suspend');
                    setLifecycleReason('Tạm khóa tài khoản học viên');
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100 disabled:opacity-50"
                >
                  <Lock className="h-3.5 w-3.5" />
                  <span>Tạm khóa tài khoản</span>
                </button>

                <button
                  type="button"
                  data-testid="drawer-lifecycle-archive-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('archive');
                    setLifecycleReason('Học viên đã hoàn thành khóa học / lưu trữ hồ sơ');
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-stone-300 bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-200 disabled:opacity-50"
                >
                  <Archive className="h-3.5 w-3.5" />
                  <span>Lưu trữ học viên</span>
                </button>

                <button
                  type="button"
                  data-testid="drawer-lifecycle-restore-btn"
                  disabled={isManagingLifecycle}
                  onClick={() => {
                    setPendingLifecycleAction('restore');
                    setLifecycleReason('Khôi phục hoạt động tài khoản học viên');
                  }}
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl border border-emerald-300 bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100 disabled:opacity-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  <span>Khôi phục</span>
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
                  <span>Xóa vĩnh viễn có điều kiện</span>
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
                      `Xác nhận TẠM KHÓA tài khoản ${student.name} (${student.email})`}
                    {pendingLifecycleAction === 'archive' &&
                      `Xác nhận LƯU TRỮ học viên ${student.name} (${student.email})`}
                    {pendingLifecycleAction === 'restore' &&
                      `Xác nhận KHÔI PHỤC tài khoản ${student.name} (${student.email})`}
                    {pendingLifecycleAction === 'delete' &&
                      `CẢNH BÁO: Xóa vĩnh viễn có điều kiện học viên ${student.name} (${student.email})`}
                  </p>

                  {pendingLifecycleAction === 'delete' && (
                    <div className="space-y-1 rounded-lg bg-white/90 p-2.5 text-[11px] text-red-900">
                      <p>
                        • Gỡ học viên khỏi lớp trực tiếp, thu hồi khóa học video, ẩn khỏi danh sách hoạt động và chặn đồng bộ ngược từ izTeach tự tạo lại tài khoản.
                      </p>
                      <p>
                        • Dữ liệu đơn hàng tài chính (<code className="font-mono">ktn_orders</code>) được <strong>giữ nguyên</strong> để đối soát kế toán.
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-[11px] font-bold">
                      Lý do thực hiện {pendingLifecycleAction === 'delete' ? '*' : ''}:
                    </label>
                    <input
                      type="text"
                      data-testid="drawer-lifecycle-reason-input"
                      value={lifecycleReason}
                      onChange={(e) => setLifecycleReason(e.target.value)}
                      placeholder="Nhập lý do (lưu vào nhật ký kiểm toán Quản lý)..."
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
                        Tôi xác nhận xóa tài khoản {student.email} và hiểu rằng thao tác này sẽ thu hồi toàn bộ quyền truy cập.
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
                      Hủy
                    </button>
                    <button
                      type="button"
                      data-testid="drawer-lifecycle-confirm-submit-btn"
                      disabled={
                        isManagingLifecycle ||
                        (pendingLifecycleAction === 'delete' &&
                          (!deleteConfirmChecked || !lifecycleReason.trim()))
                      }
                      onClick={async () => {
                        onClearError();
                        try {
                          await onManageLifecycle({
                            email: student.email,
                            action: pendingLifecycleAction,
                            reason: lifecycleReason.trim() || undefined,
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
                      <span>Xác nhận thực hiện</span>
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
