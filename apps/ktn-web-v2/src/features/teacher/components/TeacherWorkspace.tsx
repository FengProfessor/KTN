import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  FileCheck2,
  CalendarPlus,
  MessageSquare,
  Award,
  CheckCircle2,
  RotateCcw,
  Clock,
  Loader2,
  Send,
  ExternalLink,
  AlertCircle,
  Calendar,
  ZoomIn,
  UserPlus,
  BookOpen,
  Copy,
  X,
  Paperclip,
  FileText,
  Trash2,
  Edit3,
  Plus,
  Save,
  AlertTriangle,
  Upload,
  RefreshCw,
} from 'lucide-react';
import {
  KtnApiError,
  ktnApi,
  resolveUploadedMediaUrl,
  formatBytes,
  MAX_HOMEWORK_ATTACHMENT_BYTES,
  type KtnExerciseAttachment,
  type KtnSessionExercise,
} from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_CLASS_SESSIONS, DEMO_COURSES, DEMO_HOMEWORKS } from '@/lib/demoData';
import { ClassScheduleModal } from '@/features/classrooms/components/ClassScheduleModal';
import { TeacherForumInbox } from './TeacherForumInbox';
import {
  translateCourseTitle,
  translateScheduleText,
  useI18n,
} from '@/i18n';
import {
  KtnClassItem,
  KtnClassSession,
  KtnCourse,
  KtnCourseGrantRequest,
  KtnHomework,
  KtnStudentRecord,
} from '@/types/ktn.types';
import {
  formatChatTimestamp,
  formatRelativeTime,
  formatExerciseDisplayTitle,
} from '@/lib/utils';

export interface TeacherAttachmentUploadItem extends KtnExerciseAttachment {
  uploading?: boolean;
  progress?: number;
  error?: string;
  controller?: AbortController;
  rawFile?: File;
}

const MAX_EXERCISE_ATTACHMENTS = 5;

function formatSessionShortDate(raw?: string | null): string {
  if (!raw) return '';
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return '';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  return `${day}/${month}/${year}`;
}

export interface CreatedStudentSummary {
  name: string;
  email: string;
  code: string;
  classCode: string;
  initialPassword: string;
  phone?: string;
  parentName?: string;
  parentPhone?: string;
  note?: string;
  clientRequestId?: string;
}

export const TeacherWorkspace: React.FC = () => {
  const { lang, tr } = useI18n();
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const refreshPermissions = useAuthStore((s) => s.refreshPermissions);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);
  const setActiveLightboxAttachment = useUiStore((s) => s.setActiveLightboxAttachment);

  const [selectedClassId, setSelectedClassId] = useState<string>(
    () => (searchParams.get('class') || searchParams.get('classCode') || '').trim()
  );
  const [hasManualClassSelection, setHasManualClassSelection] = useState<boolean>(() =>
    Boolean(searchParams.get('class') || searchParams.get('classCode'))
  );
  const [activeSubTab, setActiveSubTab] = useState<
    'grading' | 'sessions' | 'students' | 'forum'
  >('grading');
  const [gradingFilter, setGradingFilter] = useState<'all' | 'pending' | 'graded'>('all');
  const [scheduleModalOpen, setScheduleModalOpen] = useState<boolean>(false);
  const [isSavingSchedule, setIsSavingSchedule] = useState<boolean>(false);

  // Agent C / Agent E: Teacher Create Student Modal state & idempotency tracking
  const [createStudentModalOpen, setCreateStudentModalOpen] = useState<boolean>(false);
  const [newStuName, setNewStuName] = useState<string>('');
  const [newStuEmail, setNewStuEmail] = useState<string>('');
  const [newStuPhone, setNewStuPhone] = useState<string>('');
  const [newStuParentName, setNewStuParentName] = useState<string>('');
  const [newStuParentPhone, setNewStuParentPhone] = useState<string>('');
  const [newStuClassCode, setNewStuClassCode] = useState<string>('');
  const [newStuNotes, setNewStuNotes] = useState<string>('');
  const [createStudentError, setCreateStudentError] = useState<string | null>(null);
  const [createdStudentResult, setCreatedStudentResult] =
    useState<CreatedStudentSummary | null>(null);
  const [localCreatedStudents, setLocalCreatedStudents] = useState<KtnStudentRecord[]>([]);
  const createStudentRequestRef = useRef<{
    signature: string;
    clientRequestId: string;
  } | null>(null);
  const courseGrantRequestRef = useRef<{
    signature: string;
    clientRequestId: string;
  } | null>(null);

  // Agent C / Agent E: Teacher Request Online Course Access Modal state
  const [courseRequestModalOpen, setCourseRequestModalOpen] = useState<boolean>(false);
  const [reqStudentEmail, setReqStudentEmail] = useState<string>('');
  const [reqCourseId, setReqCourseId] = useState<string>('');
  const [reqReason, setReqReason] = useState<string>('');
  const [courseRequestError, setCourseRequestError] = useState<string | null>(null);

  const [activeHomeworkId, setActiveHomeworkId] = useState<string | null>(() =>
    searchParams.get('hwId')
  );
  const [scoreInput, setScoreInput] = useState<string>('');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [gradeStatusInput, setGradeStatusInput] = useState<'graded' | 'revision_requested'>('graded');

  const [sessionNum, setSessionNum] = useState<number | null>(() => {
    const raw = Number(searchParams.get('session'));
    return Number.isFinite(raw) && raw >= 1 ? Math.floor(raw) : null;
  });
  const [sessionSelectMode, setSessionSelectMode] = useState<'none' | 'existing' | 'create_new'>(
    () => {
      const raw = Number(searchParams.get('session'));
      return Number.isFinite(raw) && raw >= 1 ? 'existing' : 'none';
    }
  );
  const [customSessionNumInput, setCustomSessionNumInput] = useState<string>(() => {
    const raw = Number(searchParams.get('session'));
    return Number.isFinite(raw) && raw >= 1 ? String(Math.floor(raw)) : '';
  });
  const [sessionTitle, setSessionTitle] = useState<string>('');
  const [sessionTitleDirty, setSessionTitleDirty] = useState<boolean>(false);
  const [exerciseMode, setExerciseMode] = useState<'create' | 'edit'>('create');
  const [editingExerciseId, setEditingExerciseId] = useState<string>('');
  const [notifyStudentsOnUpdate, setNotifyStudentsOnUpdate] = useState<boolean>(false);
  const [exerciseTitle, setExerciseTitle] = useState<string>('');
  const [exercisePrompt, setExercisePrompt] = useState<string>('');
  const [exerciseSubmissionType, setExerciseSubmissionType] = useState<
    'mixed' | 'file' | 'audio' | 'text'
  >('mixed');
  const [exerciseDueDate, setExerciseDueDate] = useState<string>('');
  const [exerciseAttachments, setExerciseAttachments] = useState<
    TeacherAttachmentUploadItem[]
  >([]);
  const [isDraggingFiles, setIsDraggingFiles] = useState<boolean>(false);
  const [exerciseAttachmentError, setExerciseAttachmentError] = useState<string | null>(
    null
  );
  const [previewingExerciseAttachment, setPreviewingExerciseAttachment] =
    useState<KtnExerciseAttachment | null>(null);
  const [confirmOverwriteOpen, setConfirmOverwriteOpen] = useState<boolean>(false);
  const [pendingSubmitStatus, setPendingSubmitStatus] = useState<'draft' | 'published'>(
    'published'
  );
  const [localSavedSessions, setLocalSavedSessions] = useState<
    Record<string, KtnClassSession[]>
  >({});
  const exerciseFileInputRef = useRef<HTMLInputElement | null>(null);

  // Sync sub-tab with route param (:section) or query param (?hwId / ?class / ?classCode / ?tab / ?questionId)
  useEffect(() => {
    const hwIdParam = searchParams.get('hwId');
    const clsParam = (searchParams.get('class') || searchParams.get('classCode') || '').trim();
    const tabParam = searchParams.get('tab');
    const questionIdParam = searchParams.get('questionId');
    if (clsParam) {
      setSelectedClassId(clsParam.toUpperCase());
      setHasManualClassSelection(true);
    }
    if (hwIdParam) {
      setActiveSubTab('grading');
      setActiveHomeworkId(hwIdParam);
      return;
    }
    if (tabParam === 'forum' || questionIdParam) {
      setActiveSubTab('forum');
      return;
    }
    if (tabParam === 'students' || tabParam === 'classes') {
      setActiveSubTab('students');
      return;
    }
    if (tabParam === 'sessions' || tabParam === 'assign') {
      setActiveSubTab('sessions');
      return;
    }
    if (tabParam === 'grading') {
      setActiveSubTab('grading');
      return;
    }
    if (section === 'classes') {
      setActiveSubTab('students');
    } else if (section === 'assign') {
      setActiveSubTab('sessions');
    } else if (section === 'forum') {
      setActiveSubTab('forum');
    } else if (section === 'grading') {
      setActiveSubTab('grading');
    }
  }, [section, searchParams]);

  // 1. Fetch Classes
  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const classesList = useMemo(() => {
    const raw = (isDemoMode ? DEMO_CLASSES : classesQuery.data || []).filter(
      (c) => (c as KtnClassItem & { active?: boolean }).active !== false
    );
    if (isDemoMode || user?.role === 'admin') return raw;
    const assignedSet = new Set(
      (user?.assignedClasses || [])
        .map((c) => String(c || '').trim().toUpperCase())
        .filter(Boolean)
    );
    const hasTeacherIdentity = Boolean(
      user?.email || user?.code || user?.classCode || assignedSet.size > 0
    );
    if (!hasTeacherIdentity) {
      return isDemoMode ? raw : [];
    }
    const filtered = raw.filter((c) => {
      const classIdUpper = String(c.id || '').trim().toUpperCase();
      if (
        c.teacher_email &&
        user?.email &&
        c.teacher_email.toLowerCase() === user.email.toLowerCase()
      ) {
        return true;
      }
      if (
        c.teacher_email &&
        user?.email &&
        c.teacher_email.toLowerCase() !== user.email.toLowerCase()
      ) {
        // Class was explicitly reassigned to another teacher — do not trust stale session assignedClasses
        return false;
      }
      if (c.teacher_code) {
        return Boolean(
          user?.code && c.teacher_code.toUpperCase() === user.code.toUpperCase()
        );
      }
      if (
        !c.teacher_email &&
        !c.teacher_code &&
        c.teacher_name === 'Chưa phân công giáo viên'
      ) {
        // Class is explicitly unassigned — do not trust stale session assignedClasses or classCode
        return false;
      }
      if (assignedSet.size > 0 && assignedSet.has(classIdUpper)) return true;
      if (user?.classCode && classIdUpper === String(user.classCode).trim().toUpperCase()) {
        return true;
      }
      return false;
    });
    if (isDemoMode && filtered.length === 0 && assignedSet.size === 0 && !user?.email) {
      return raw;
    }
    return filtered;
  }, [
    isDemoMode,
    classesQuery.data,
    user?.email,
    user?.code,
    user?.role,
    user?.assignedClasses,
    user?.classCode,
  ]);

  useEffect(() => {
    if (
      selectedClassId &&
      classesList.length > 0 &&
      !classesList.some((c) => c.id.toUpperCase() === selectedClassId.toUpperCase())
    ) {
      setSelectedClassId('');
    } else if (selectedClassId && !classesQuery.isLoading && classesList.length === 0) {
      setSelectedClassId('');
    }
  }, [selectedClassId, classesList, classesQuery.isLoading]);

  const effectiveClassId = useMemo(() => {
    if (classesList.length === 0) {
      return classesQuery.isLoading ? selectedClassId : '';
    }
    if (selectedClassId) {
      const matched = classesList.find(
        (c) => c.id.toUpperCase() === selectedClassId.toUpperCase()
      );
      return matched ? matched.id : '';
    }
    if (activeSubTab === 'students' && !hasManualClassSelection) {
      return (
        (user?.classCode &&
          classesList.find((c) => c.id.toUpperCase() === user.classCode!.toUpperCase())?.id) ||
        classesList[0].id
      );
    }
    return '';
  }, [
    classesList,
    classesQuery.isLoading,
    selectedClassId,
    activeSubTab,
    hasManualClassSelection,
    user?.classCode,
  ]);

  const prevEffectiveClassIdRef = useRef<string>(effectiveClassId);
  useEffect(() => {
    const prev = prevEffectiveClassIdRef.current;
    if (prev.toUpperCase() !== effectiveClassId.toUpperCase()) {
      const urlSessionRaw = Number(searchParams.get('session'));
      const hasUrlSession =
        Boolean(searchParams.get('class') || searchParams.get('classCode')) &&
        Number.isFinite(urlSessionRaw) &&
        urlSessionRaw >= 1;
      setSessionNum(hasUrlSession ? Math.floor(urlSessionRaw) : null);
      setSessionSelectMode(hasUrlSession ? 'existing' : 'none');
      setCustomSessionNumInput(hasUrlSession ? String(Math.floor(urlSessionRaw)) : '');
      setSessionTitle('');
      setSessionTitleDirty(false);
      setExerciseMode('create');
      setEditingExerciseId('');
      setNotifyStudentsOnUpdate(false);
      setExerciseTitle('');
      setExercisePrompt('');
      setExerciseSubmissionType('mixed');
      setExerciseDueDate('');
      setExerciseAttachments([]);
      setExerciseAttachmentError(null);
      setConfirmOverwriteOpen(false);
      setPreviewingExerciseAttachment(null);
    }
    prevEffectiveClassIdRef.current = effectiveClassId;
  }, [effectiveClassId, searchParams]);

  const homeworkClassFilter =
    user?.role === 'teacher' && !hasManualClassSelection
      ? undefined
      : effectiveClassId || undefined;

  // 2. Fetch Homeworks for Class (or all assigned classes when teacher has not filtered to a single class)
  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', homeworkClassFilter || 'teacher-all', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks(homeworkClassFilter);
    },
    enabled: Boolean(user) || isDemoMode,
    refetchInterval: isDemoMode || activeSubTab !== 'grading' ? false : 15000,
    refetchIntervalInBackground: false,
  });

  // 3. Fetch Sessions for Class
  const sessionsQuery = useQuery<KtnClassSession[]>({
    queryKey: ['ktn-class-sessions', effectiveClassId, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASS_SESSIONS;
      if (!effectiveClassId) return [];
      return ktnApi.getClassSessions(effectiveClassId);
    },
    enabled: Boolean(effectiveClassId) && (Boolean(user) || isDemoMode),
  });

  // Sync saved session title ONLY when user has explicitly chosen an existing session (e.g. via ?session= URL param)
  useEffect(() => {
    if (sessionSelectMode !== 'existing' || !sessionNum || sessionTitleDirty) return;
    const matched = (sessionsQuery.data || []).find(
      (s) => Number(s.sessionNum ?? s.session_num) === sessionNum
    );
    if (matched) {
      const realTitle = String(matched.title || matched.session_title || '').trim();
      setSessionTitle(realTitle);
    }
  }, [sessionSelectMode, sessionNum, sessionTitleDirty, sessionsQuery.data]);

  // 4. Fetch Students in Class
  const studentsQuery = useQuery<KtnStudentRecord[]>({
    queryKey: ['ktn-class-students', effectiveClassId, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
          {
            code: 'KTN-2026-089',
            email: 'hoangngan@khongtunhi.com',
            name: 'Bé Nguyễn Hoàng Ngân',
            class_code: 'YCT2-04',
            has_live_class: true,
            has_online_courses: true,
            online_courses: [
              {
                id: '6adadba969897b0002482ca5',
                code: 'HSK1-30',
                title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              },
            ],
            studentCase: 'both',
          },
        ];
      }
      return ktnApi.getStudents(effectiveClassId || undefined);
    },
    enabled: (Boolean(user) && Boolean(effectiveClassId)) || isDemoMode,
  });

  const handleRevokedClassAccess = async (err: unknown, classCode?: string) => {
    const isForbidden =
      err instanceof KtnApiError &&
      (err.status === 403 ||
        err.code === 'TEACHER_CLASS_SCOPE_FORBIDDEN' ||
        err.code === 'CLASS_ARCHIVED_OR_INACTIVE');
    if (!isForbidden) return false;
    await refreshPermissions?.().catch(() => null);
    queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
    queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
    queryClient.invalidateQueries({ queryKey: ['notifications'] });
    queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
    if (classCode) {
      queryClient.removeQueries({ queryKey: ['ktn-class-sessions', classCode] });
      queryClient.removeQueries({ queryKey: ['ktn-class-students', classCode] });
      setLocalSavedSessions((prev) => {
        const next = { ...prev };
        delete next[classCode];
        return next;
      });
    }
    setHasManualClassSelection(false);
    addToast({
      title: tr('Quyền truy cập lớp đã thay đổi', 'Class access updated'),
      description:
        err instanceof Error
          ? err.message
          : tr(
              'Lớp này đã được gỡ phân công hoặc lưu trữ. Hệ thống đã cập nhật lại danh sách lớp.',
              'This class was unassigned or archived. Your class list has been refreshed.'
            ),
      variant: 'error',
    });
    return true;
  };

  useEffect(() => {
    const errs = [sessionsQuery.error, studentsQuery.error, homeworksQuery.error].filter(Boolean);
    for (const err of errs) {
      if (
        err instanceof KtnApiError &&
        (err.status === 403 ||
          err.code === 'TEACHER_CLASS_SCOPE_FORBIDDEN' ||
          err.code === 'CLASS_ARCHIVED_OR_INACTIVE')
      ) {
        void handleRevokedClassAccess(err, effectiveClassId || undefined);
        break;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionsQuery.error, studentsQuery.error, homeworksQuery.error, effectiveClassId]);

  // 5. Grade Homework Mutation
  const gradeMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      score: number;
      teacherFeedback: string;
      status: 'graded' | 'revision_requested';
      classCode?: string | null;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 400));
        return {
          homework: {
            ...DEMO_HOMEWORKS[0],
            id: params.id,
            score: params.score,
            teacher_feedback: params.teacherFeedback,
            status: params.status,
          },
          syncStatus: 'synced',
        };
      }
      return ktnApi.gradeHomework(params);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      setActiveHomeworkId(null);
      addToast({
        title:
          vars.status === 'revision_requested'
            ? tr('Đã gửi yêu cầu nộp lại bài', 'Revision requested')
            : tr(`Đã chấm ${vars.score}/10 điểm!`, `Graded ${vars.score}/10 pts!`),
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      void handleRevokedClassAccess(err, effectiveClassId || undefined);
    },
  });

  // 6. Save Class Session & Exercise Assignment Mutation (C2 & C3: Non-overwriting + File Attachments)
  const saveSessionMutation = useMutation({
    mutationFn: async (vars?: { status?: 'draft' | 'published' }) => {
      const submitStatus: 'draft' | 'published' = vars?.status || 'published';
      setExerciseAttachmentError(null);

      if (!effectiveClassId) {
        throw new Error(
          tr(
            'Vui lòng chọn lớp học trước khi giao bài tập.',
            'Please select a class before assigning homework.'
          )
        );
      }
      if (
        user?.role !== 'admin' &&
        !classesList.some((c) => c.id.toUpperCase() === effectiveClassId.toUpperCase())
      ) {
        throw new Error(
          tr(
            `Giáo viên không có quyền giao bài tập cho lớp ${effectiveClassId} không thuộc phạm vi phụ trách.`,
            `You are not authorized to assign homework to class ${effectiveClassId}.`
          )
        );
      }

      if (exerciseAttachments.some((a) => a.uploading)) {
        throw new Error(
          tr(
            'Vui lòng chờ quá trình tải tài liệu đính kèm hoàn tất trước khi lưu hoặc giao bài.',
            'Please wait for attachments to finish uploading before saving or publishing.'
          )
        );
      }

      if (exerciseAttachments.some((a) => Boolean(a.error))) {
        throw new Error(
          tr(
            'Có tệp đính kèm tải lên bị lỗi. Vui lòng bấm "Thử lại" hoặc "Xóa" tệp lỗi trước khi lưu.',
            'Some attachments failed to upload. Please click Retry or Remove before saving.'
          )
        );
      }

      const cleanTitle = exerciseTitle.trim();
      const cleanPrompt = exercisePrompt.trim();
      const readyAttachments: KtnExerciseAttachment[] = exerciseAttachments
        .filter((a) => !a.uploading && !a.error && a.url)
        .map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        }));

      if (!cleanTitle) {
        throw new Error(
          tr(
            'Vui lòng nhập Tên bài tập.',
            'Please enter an Exercise Title.'
          )
        );
      }

      if (!cleanPrompt && readyAttachments.length === 0) {
        throw new Error(
          tr(
            'Vui lòng nhập Hướng dẫn làm bài hoặc đính kèm ít nhất 1 tệp tài liệu.',
            'Please enter Instructions or attach at least 1 file.'
          )
        );
      }

      if (!sessionNum || !Number.isFinite(sessionNum) || sessionNum < 1) {
        throw new Error(
          tr(
            'Vui lòng chọn buổi học hoặc nhập số buổi mới.',
            'Please select a session or enter a new session number.'
          )
        );
      }

      const numSession = Math.max(1, Math.floor(Number(sessionNum)));
      const remoteSessions = sessionsQuery.data || [];
      const localSessions = localSavedSessions[effectiveClassId] || [];
      const sessionMap = new Map<number, KtnClassSession>();
      remoteSessions.forEach((s) => sessionMap.set(Number(s.sessionNum ?? s.session_num), s));
      localSessions.forEach((s) => sessionMap.set(Number(s.sessionNum ?? s.session_num), s));

      const existingSession = sessionMap.get(numSession);
      const existingExercises: KtnSessionExercise[] = Array.isArray(existingSession?.exercises)
        ? existingSession!.exercises.map((ex) => ({ ...ex }))
        : [];

      let updatedExercises: KtnSessionExercise[];
      let targetExercise: KtnSessionExercise;
      let saveMode: 'append_exercise' | 'update_exercise' = 'append_exercise';

      if (exerciseMode === 'edit' && editingExerciseId) {
        saveMode = 'update_exercise';
        const existingIdx = existingExercises.findIndex((ex) => ex.id === editingExerciseId);
        const prevEx = existingIdx >= 0 ? existingExercises[existingIdx] : undefined;
        targetExercise = {
          ...(prevEx || {}),
          id: editingExerciseId,
          num: prevEx?.num || (existingIdx >= 0 ? existingIdx + 1 : 1),
          title: cleanTitle,
          prompt: cleanPrompt,
          type:
            exerciseSubmissionType === 'mixed'
              ? prevEx?.type || 'audio'
              : exerciseSubmissionType,
          submissionType: exerciseSubmissionType,
          dueDate: exerciseDueDate.trim() || undefined,
          status: submitStatus,
          attachments: readyAttachments,
        };
        if (existingIdx >= 0) {
          updatedExercises = existingExercises.map((ex, idx) =>
            idx === existingIdx ? targetExercise : ex
          );
        } else {
          updatedExercises = [...existingExercises, targetExercise];
        }
      } else {
        saveMode = 'append_exercise';
        const nextNum = existingExercises.length + 1;
        const baseId = `ex_${effectiveClassId}_${numSession}_${nextNum}`;
        const uniqueId = existingExercises.some((ex) => ex.id === baseId)
          ? `${baseId}_${Date.now().toString(36)}`
          : baseId;
        targetExercise = {
          id: uniqueId,
          num: nextNum,
          title: cleanTitle,
          prompt: cleanPrompt,
          type: exerciseSubmissionType === 'mixed' ? 'audio' : exerciseSubmissionType,
          submissionType: exerciseSubmissionType,
          dueDate: exerciseDueDate.trim() || undefined,
          status: submitStatus,
          attachments: readyAttachments,
        };
        updatedExercises = [...existingExercises, targetExercise];
      }

      const prevExInSession =
        saveMode === 'update_exercise'
          ? existingExercises.find((ex) => ex.id === editingExerciseId)
          : undefined;
      const wasAlreadyPublished =
        saveMode === 'update_exercise' &&
        Boolean(prevExInSession) &&
        prevExInSession?.status !== 'draft';

      const existingSessionTitle = String(
        existingSession?.title || existingSession?.session_title || ''
      ).trim();
      const resolvedSessionTitle =
        existingSession && !sessionTitleDirty && existingSessionTitle
          ? existingSessionTitle
          : sessionTitle.trim() ||
            existingSessionTitle ||
            tr(`Buổi ${numSession}`, `Session ${numSession}`);

      const payload = {
        classCode: effectiveClassId,
        sessionNum: numSession,
        title: resolvedSessionTitle,
        mode: saveMode,
        exercise: targetExercise,
        preserveExistingExercises: true,
        preserveDefaultExercises: true,
        status: submitStatus,
        suppressDuplicateNotification:
          submitStatus === 'draft' || (wasAlreadyPublished && !notifyStudentsOnUpdate),
        ...(wasAlreadyPublished && notifyStudentsOnUpdate ? { forceNotify: true } : {}),
        ...(existingSession?.updatedAt
          ? { expectedUpdatedAt: existingSession.updatedAt }
          : {}),
        exercises: updatedExercises,
      };

      let savedSession: KtnClassSession;
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        savedSession = {
          id: existingSession?.id || `sess_${effectiveClassId}_${numSession}`,
          classCode: effectiveClassId,
          session_num: numSession,
          sessionNum: numSession,
          session_title: payload.title,
          title: payload.title,
          exercises: updatedExercises,
        };
      } else {
        const apiRes = await ktnApi.saveClassSession(payload);
        const serverExercises =
          Array.isArray(apiRes?.exercises) && apiRes.exercises.length > 0
            ? apiRes.exercises
            : updatedExercises;
        if (saveMode === 'append_exercise' && serverExercises.length > 0) {
          const matchedOrLast =
            serverExercises.find((ex) => ex.id === targetExercise.id) ||
            serverExercises[serverExercises.length - 1];
          if (matchedOrLast) {
            targetExercise = matchedOrLast;
          }
        }
        savedSession = {
          ...(existingSession || {}),
          ...(apiRes || {}),
          classCode: effectiveClassId,
          session_num: numSession,
          sessionNum: numSession,
          session_title: apiRes?.session_title || apiRes?.title || payload.title,
          title: apiRes?.title || payload.title,
          exercises: serverExercises,
        };
      }

      return {
        savedSession,
        submitStatus,
        saveMode,
        targetExercise,
      };
    },
    onSuccess: ({ savedSession, submitStatus, saveMode, targetExercise }) => {
      setLocalSavedSessions((prev) => {
        const list = prev[effectiveClassId] || [];
        const num = Number(savedSession.sessionNum ?? savedSession.session_num);
        const filtered = list.filter(
          (s) => Number(s.sessionNum ?? s.session_num) !== num
        );
        return {
          ...prev,
          [effectiveClassId]: [...filtered, savedSession].sort(
            (a, b) =>
              Number(a.sessionNum ?? a.session_num) -
              Number(b.sessionNum ?? b.session_num)
          ),
        };
      });
      if (saveMode === 'append_exercise' && targetExercise?.id) {
        setExerciseMode('edit');
        setEditingExerciseId(targetExercise.id);
      }
      setConfirmOverwriteOpen(false);
      setNotifyStudentsOnUpdate(false);
      queryClient.invalidateQueries({ queryKey: ['ktn-class-sessions', effectiveClassId] });
      addToast({
        title:
          submitStatus === 'draft'
            ? tr('Đã lưu nháp bài tập buổi học!', 'Saved session exercise draft!')
            : saveMode === 'update_exercise'
              ? tr(
                  'Đã cập nhật bài tập hiện có (bảo toàn các bài khác)!',
                  'Updated existing exercise (other exercises preserved)!'
                )
              : tr('Đã giao bài tập cho lớp!', 'Assigned homework to class!'),
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      if (err instanceof KtnApiError && err.status === 409) {
        setLocalSavedSessions((prev) => {
          const next = { ...prev };
          delete next[effectiveClassId];
          return next;
        });
        setConfirmOverwriteOpen(false);
        queryClient.invalidateQueries({ queryKey: ['ktn-class-sessions', effectiveClassId] });
        const conflictMsg = tr(
          'Buổi học vừa được cập nhật ở tab hoặc thiết bị khác. Hệ thống đã tải lại dữ liệu mới nhất — vui lòng kiểm tra lại trước khi lưu để tránh ghi đè.',
          'This session was updated in another tab or device. Latest exercises were reloaded — please review before saving again.'
        );
        setExerciseAttachmentError(conflictMsg);
        addToast({
          title: tr('Xung đột cập nhật (409)', 'Session update conflict (409)'),
          description: conflictMsg,
          variant: 'error',
        });
        return;
      }
      if (
        err instanceof KtnApiError &&
        (err.status === 403 ||
          err.code === 'TEACHER_CLASS_SCOPE_FORBIDDEN' ||
          err.code === 'CLASS_ARCHIVED_OR_INACTIVE')
      ) {
        setConfirmOverwriteOpen(false);
        void handleRevokedClassAccess(err, effectiveClassId || undefined);
      }
      const msg =
        err instanceof Error
          ? err.message
          : tr('Không thể lưu bài tập buổi học.', 'Unable to save session exercise.');
      setExerciseAttachmentError(msg);
      addToast({
        title: tr('Không thể lưu bài tập', 'Unable to save exercise'),
        description: msg,
        variant: 'error',
      });
    },
  });

  // 7. Attendance state & mutation for active class
  const [attendanceSessionNum, setAttendanceSessionNum] = useState<number>(1);
  const [attendanceMap, setAttendanceMap] = useState<
    Record<string, 'present' | 'late' | 'absent_excused' | 'absent_unexcused'>
  >({});

  const attendanceQuery = useQuery({
    queryKey: ['ktn-attendance', effectiveClassId, attendanceSessionNum, isDemoMode],
    queryFn: async () => {
      if (isDemoMode || !effectiveClassId) {
        return {
          ok: true,
          classCode: effectiveClassId,
          sessionNum: attendanceSessionNum,
          records: [],
          summary: { total: 0, present: 0, late: 0, absentExcused: 0, absentUnexcused: 0 },
        };
      }
      return ktnApi.getAttendance({
        classCode: effectiveClassId,
        sessionNum: attendanceSessionNum,
      });
    },
    enabled: Boolean(effectiveClassId) && (Boolean(user) || isDemoMode),
  });

  useEffect(() => {
    const recs = attendanceQuery.data?.records || attendanceQuery.data?.attendance || [];
    if (recs.length > 0) {
      const next: Record<string, 'present' | 'late' | 'absent_excused' | 'absent_unexcused'> = {};
      for (const r of recs) {
        const normalizedStatus =
          r.status === 'excused'
            ? 'absent_excused'
            : r.status === 'absent'
            ? 'absent_unexcused'
            : r.status;
        next[r.student_email] = normalizedStatus;
      }
      setAttendanceMap(next);
    }
  }, [attendanceQuery.data]);

  const saveAttendanceMutation = useMutation({
    mutationFn: async () => {
      const records = (studentsQuery.data || []).map((st) => ({
        studentEmail: st.email,
        studentName: st.name,
        status: attendanceMap[st.email] || ('present' as const),
      }));
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          classCode: effectiveClassId,
          sessionNum: attendanceSessionNum,
          records: [],
          summary: {
            total: records.length,
            present: records.length,
            late: 0,
            absentExcused: 0,
            absentUnexcused: 0,
          },
        };
      }
      return ktnApi.saveAttendance({
        classCode: effectiveClassId,
        sessionNum: attendanceSessionNum,
        records,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-attendance', effectiveClassId] });
      addToast({
        title: tr(
          `Đã lưu điểm danh Buổi ${attendanceSessionNum} lớp ${effectiveClassId}!`,
          `Saved Session ${attendanceSessionNum} attendance for ${effectiveClassId}!`
        ),
        variant: 'success',
      });
    },
  });

  // 8. Agent E: Courses catalog & Teacher Course Grant Requests + Student Creation
  const coursesQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const courseGrantRequestsQuery = useQuery<KtnCourseGrantRequest[]>({
    queryKey: ['ktn-course-grant-requests', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return [];
      const res = await ktnApi.getCourseGrantRequests();
      return res.requests || [];
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const teacherCreateStudentMutation = useMutation({
    mutationFn: async () => {
      setCreateStudentError(null);
      if (classesList.length === 0) {
        throw new Error(
          tr(
            'Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.',
            'You are not assigned to any class. Please contact Admin.'
          )
        );
      }
      const chosenClass = (newStuClassCode || effectiveClassId || classesList[0]?.id || '').trim();
      if (!chosenClass) {
        throw new Error(
          tr(
            'Vui lòng chọn lớp học trực tiếp được phân công.',
            'Please select an assigned live class.'
          )
        );
      }
      if (
        user?.role !== 'admin' &&
        !classesList.some((c) => c.id.toUpperCase() === chosenClass.toUpperCase())
      ) {
        throw new Error(
          tr(
            `Bạn chỉ được phép tạo và xếp học viên vào lớp mình đang phụ trách (${classesList
              .map((c) => c.id)
              .join(', ')}).`,
            `You may only create and enroll students in your assigned classes (${classesList
              .map((c) => c.id)
              .join(', ')}).`
          )
        );
      }
      const cleanName = newStuName.trim();
      const cleanEmail = newStuEmail.trim().toLowerCase();
      if (!cleanName || !cleanEmail || !cleanEmail.includes('@')) {
        throw new Error(
          tr(
            'Vui lòng nhập đầy đủ họ tên và email hợp lệ của học viên.',
            'Please enter the student name and a valid email.'
          )
        );
      }
      const cleanPhone = newStuPhone.trim();
      const cleanParentName = newStuParentName.trim();
      const cleanParentPhone = newStuParentPhone.trim();
      const cleanNote = newStuNotes.trim();

      // Preserve stable clientRequestId across network retries for the same (email, classCode)
      const signature = `${cleanEmail}|${chosenClass.toUpperCase()}`;
      if (!createStudentRequestRef.current || createStudentRequestRef.current.signature !== signature) {
        createStudentRequestRef.current = {
          signature,
          clientRequestId: `tcs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        };
      }
      const clientRequestId = createStudentRequestRef.current.clientRequestId;

      if (isDemoMode) {
        const existingInDemo = (studentsQuery.data || []).find(
          (s) => s.email.toLowerCase() === cleanEmail
        );
        if (existingInDemo) {
          throw new Error(
            tr(
              `Học viên ${existingInDemo.name || cleanEmail} đã tồn tại trên hệ thống (lớp ${
                existingInDemo.class_code || chosenClass
              }). Không tạo trùng tài khoản.`,
              `Student ${existingInDemo.name || cleanEmail} already exists (class ${
                existingInDemo.class_code || chosenClass
              }). Duplicate account prevented.`
            )
          );
        }
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: true,
          operationId: clientRequestId,
          student: {
            code: `KTN-2026-${Math.floor(100 + Math.random() * 899)}`,
            name: cleanName,
            email: cleanEmail,
            phone: cleanPhone || cleanParentPhone || undefined,
            parent_name: cleanParentName || undefined,
            parent_phone: cleanParentPhone || undefined,
            internal_note: cleanNote || undefined,
            class_code: chosenClass,
            has_live_class: true,
            has_online_courses: false,
            online_courses: [],
            studentCase: 'sll_only',
          } as KtnStudentRecord & { parent_phone?: string },
          initialPassword: 'Ktn@123456',
          classCode: chosenClass,
          message: tr('Đã tạo học viên mới.', 'Created new student.'),
        };
      }

      // Contract note for Agent A (/api/ktn/teacher/students/create):
      // Frontend sends all 7 onboarding fields + idempotent clientRequestId.
      // We send both `parentPhone` and `phone` (falling back to `parentPhone` when student `phone` is blank)
      // so parent contact phone is never dropped even if backend only reads `body.phone` or `body.parentPhone`.
      const payload = {
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone || cleanParentPhone || undefined,
        studentPhone: cleanPhone || undefined,
        parentName: cleanParentName || undefined,
        parentPhone: cleanParentPhone || undefined,
        classCode: chosenClass,
        note: cleanNote || undefined,
        clientRequestId,
      };
      return ktnApi.teacherCreateStudent(
        payload as Parameters<typeof ktnApi.teacherCreateStudent>[0]
      );
    },
    onSuccess: (res) => {
      const stuObj = (res.student || {}) as KtnStudentRecord & {
        studentCode?: string;
        classCode?: string;
        parent_phone?: string;
        parentPhone?: string;
        parentName?: string;
        note?: string;
      };
      const rawRes = res as Record<string, any>;
      const resolvedClassCode =
        res.classCode ||
        stuObj.class_code ||
        stuObj.classCode ||
        newStuClassCode ||
        effectiveClassId ||
        '';
      const resolvedParentName =
        stuObj.parent_name || stuObj.parentName || newStuParentName.trim() || undefined;
      const resolvedParentPhone =
        stuObj.parent_phone || stuObj.parentPhone || newStuParentPhone.trim() || undefined;
      const explicitStudentPhone =
        (stuObj as Record<string, any>).student_phone ||
        (stuObj as Record<string, any>).studentPhone ||
        newStuPhone.trim();
      const resolvedPhone =
        explicitStudentPhone ||
        (stuObj.phone && stuObj.phone !== resolvedParentPhone ? stuObj.phone : undefined) ||
        undefined;
      const resolvedNote =
        stuObj.internal_note || stuObj.note || newStuNotes.trim() || undefined;
      const resolvedPassword = String(
        res.initialPassword ||
          rawRes?.credentials?.initialPassword ||
          rawRes?.credentials?.tempPassword ||
          ''
      );
      const usedClientRequestId = createStudentRequestRef.current?.clientRequestId;

      const enrichedStudent: KtnStudentRecord & {
        parent_phone?: string;
        parentPhone?: string;
      } = {
        ...stuObj,
        code: stuObj.code || stuObj.studentCode || 'KTN-NEW',
        name: stuObj.name || newStuName.trim(),
        email: stuObj.email || newStuEmail.trim().toLowerCase(),
        class_code: resolvedClassCode,
        phone: resolvedPhone || resolvedParentPhone,
        parent_name: resolvedParentName,
        parent_phone: resolvedParentPhone,
        parentPhone: resolvedParentPhone,
        internal_note: resolvedNote,
        has_live_class: true,
        has_online_courses: Boolean(stuObj.has_online_courses),
        online_courses: Array.isArray(stuObj.online_courses) ? stuObj.online_courses : [],
        studentCase: stuObj.studentCase || 'sll_only',
      };

      setLocalCreatedStudents((prev) => [
        enrichedStudent,
        ...prev.filter(
          (item) => item.email.toLowerCase() !== enrichedStudent.email.toLowerCase()
        ),
      ]);
      queryClient.setQueryData<KtnStudentRecord[]>(
        ['ktn-class-students', effectiveClassId, user?.email, isDemoMode],
        (prev) => {
          const list = Array.isArray(prev) ? prev : [];
          const exists = list.some(
            (item) => item.email.toLowerCase() === enrichedStudent.email.toLowerCase()
          );
          return exists
            ? list.map((item) =>
                item.email.toLowerCase() === enrichedStudent.email.toLowerCase()
                  ? enrichedStudent
                  : item
              )
            : [enrichedStudent, ...list];
        }
      );
      queryClient.invalidateQueries({ queryKey: ['ktn-class-students'] });

      setCreatedStudentResult({
        name: enrichedStudent.name,
        email: enrichedStudent.email,
        code: enrichedStudent.code,
        classCode: resolvedClassCode,
        initialPassword: resolvedPassword,
        phone: resolvedPhone,
        parentName: resolvedParentName,
        parentPhone: resolvedParentPhone,
        note: resolvedNote,
        clientRequestId: usedClientRequestId,
      });
      createStudentRequestRef.current = null;
      setNewStuName('');
      setNewStuEmail('');
      setNewStuPhone('');
      setNewStuParentName('');
      setNewStuParentPhone('');
      setNewStuNotes('');
      addToast({
        title: tr(
          `Đã tạo học viên ${enrichedStudent.name} vào lớp ${resolvedClassCode}`,
          `Created student ${enrichedStudent.name} in class ${resolvedClassCode}`
        ),
        description: tr(
          'Tài khoản đã được tạo và xếp vào nhóm chat lớp trực tiếp (chưa cấp khóa học video).',
          'Account created and added to direct class chat (no video course granted yet).'
        ),
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof KtnApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : tr('Không thể tạo học viên mới.', 'Unable to create new student.');
      setCreateStudentError(msg);
    },
  });

  const createCourseRequestMutation = useMutation({
    mutationFn: async () => {
      setCourseRequestError(null);
      if (!reqStudentEmail.trim()) {
        throw new Error(tr('Vui lòng chọn học viên trong lớp phụ trách.', 'Please select a student in your assigned class.'));
      }
      if (!reqCourseId.trim()) {
        throw new Error(tr('Vui lòng chọn khóa học video đề xuất mở.', 'Please select a video course to request.'));
      }
      const cleanStuEmail = reqStudentEmail.trim().toLowerCase();
      const cleanCourseId = reqCourseId.trim();
      const stObj = studentsList.find((s) => s.email.toLowerCase() === cleanStuEmail);
      const targetClassCode = stObj?.class_code || effectiveClassId;
      const isAssignedClass =
        user?.role === 'admin' ||
        classesList.some(
          (c) =>
            String((c as Record<string, any>).code || c.id || '')
              .trim()
              .toUpperCase() ===
            String(targetClassCode || '')
              .trim()
              .toUpperCase()
        );
      if (!stObj || !isAssignedClass) {
        throw new Error(
          tr(
            'Chỉ được đề nghị cấp khóa học cho học viên thuộc lớp trực tiếp bạn phụ trách.',
            'Course grants can only be requested for students in classes directly assigned to you.'
          )
        );
      }
      const courseObj = (coursesQuery.data || DEMO_COURSES).find(
        (c) => c.id === cleanCourseId
      );
      const cleanReason =
        reqReason.trim().length >= 3
          ? reqReason.trim()
          : tr(
              'Giáo viên phụ trách đề xuất mở khóa video bổ trợ',
              'Homeroom teacher recommends unlocking supplementary video course'
            );
      const reqSig = `${cleanStuEmail}|${cleanCourseId}`;
      if (!courseGrantRequestRef.current || courseGrantRequestRef.current.signature !== reqSig) {
        courseGrantRequestRef.current = {
          signature: reqSig,
          clientRequestId: `cgr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        };
      }
      const clientRequestId = courseGrantRequestRef.current.clientRequestId;
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          request: {
            id: clientRequestId,
            student_id: stObj?.code || cleanStuEmail,
            student_email: cleanStuEmail,
            student_name: stObj?.name || cleanStuEmail,
            class_code: targetClassCode,
            requested_course_id: cleanCourseId,
            requested_course_title: courseObj?.title || cleanCourseId,
            requested_by_teacher_id: user?.code || 'GV',
            reason: cleanReason,
            status: 'pending' as const,
            created_at: new Date().toISOString(),
          },
        };
      }
      return ktnApi.createCourseGrantRequest({
        id: clientRequestId,
        clientRequestId,
        studentEmail: cleanStuEmail,
        studentId: stObj?.code,
        studentName: stObj?.name,
        classCode: targetClassCode,
        requestedCourseId: cleanCourseId,
        requestedCourseTitle: courseObj?.title,
        reason: cleanReason,
      } as Parameters<typeof ktnApi.createCourseGrantRequest>[0]);
    },
    onSuccess: () => {
      courseGrantRequestRef.current = null;
      queryClient.invalidateQueries({ queryKey: ['ktn-course-grant-requests'] });
      setCourseRequestModalOpen(false);
      setReqReason('');
      addToast({
        title: tr('Đã gửi đề nghị mở khóa học online!', 'Online course access request submitted!'),
        description: tr(
          'Quản lý sẽ xem xét và phê duyệt cấp khóa học cho học viên.',
          'Admin will review and approve granting this course to the student.'
        ),
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof KtnApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : tr('Không thể gửi đề nghị mở khóa học.', 'Unable to submit course access request.');
      setCourseRequestError(msg);
    },
  });

  const cancelCourseRequestMutation = useMutation({
    mutationFn: async (requestId: string) => {
      if (isDemoMode) {
        return { ok: true, request: null as unknown as KtnCourseGrantRequest };
      }
      return ktnApi.cancelCourseGrantRequest(requestId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-course-grant-requests'] });
      addToast({
        title: tr('Đã hủy đề nghị mở khóa học', 'Cancelled course access request'),
        variant: 'success',
      });
    },
  });

  const homeworks = homeworksQuery.data || [];
  const filteredHomeworks = useMemo(() => {
    return homeworks.filter((hw) => {
      if (gradingFilter === 'pending') return hw.status === 'pending';
      if (gradingFilter === 'graded') {
        return hw.status === 'graded' || hw.status === 'revision_requested';
      }
      return true;
    });
  }, [homeworks, gradingFilter]);

  const pendingCount = homeworks.filter((h) => h.status === 'pending').length;

  const openGradingForm = (hw: KtnHomework) => {
    setActiveHomeworkId(String(hw.id));
    setScoreInput(hw.score !== null && hw.score !== undefined ? String(hw.score) : '');
    setFeedbackInput(hw.teacher_feedback || '');
    setGradeStatusInput(hw.status === 'revision_requested' ? 'revision_requested' : 'graded');
  };

  const sessionsList = useMemo(() => {
    const remote = sessionsQuery.data || [];
    const local = localSavedSessions[effectiveClassId] || [];
    const mergedMap = new Map<number, KtnClassSession>();
    remote.forEach((s) => {
      const num = Number(s.sessionNum ?? s.session_num);
      if (num > 0) mergedMap.set(num, s);
    });
    local.forEach((s) => {
      const num = Number(s.sessionNum ?? s.session_num);
      if (num > 0) mergedMap.set(num, s);
    });
    return Array.from(mergedMap.values()).sort(
      (a, b) =>
        Number(a.sessionNum ?? a.session_num) - Number(b.sessionNum ?? b.session_num)
    );
  }, [sessionsQuery.data, localSavedSessions, effectiveClassId]);

  const currentSessionObj = useMemo(() => {
    if (!sessionNum || sessionNum < 1) return null;
    const num = Math.floor(sessionNum);
    return (
      sessionsList.find((s) => Number(s.sessionNum ?? s.session_num) === num) || null
    );
  }, [sessionsList, sessionNum]);

  const existingSessionExercises = useMemo<KtnSessionExercise[]>(
    () => (Array.isArray(currentSessionObj?.exercises) ? currentSessionObj!.exercises : []),
    [currentSessionObj]
  );

  const suggestedNextSessionNum = useMemo(() => {
    if (sessionsList.length === 0) return 1;
    const maxNum = sessionsList.reduce(
      (max, s) => Math.max(max, Number(s.sessionNum ?? s.session_num) || 0),
      0
    );
    return maxNum + 1;
  }, [sessionsList]);

  const sessionsSummaryStats = useMemo(() => {
    let publishedCount = 0;
    let draftCount = 0;
    for (const s of sessionsList) {
      const exs = Array.isArray(s.exercises) ? s.exercises : [];
      for (const ex of exs) {
        if (ex?.status === 'draft') draftCount += 1;
        else publishedCount += 1;
      }
    }
    return {
      sessionsCount: sessionsList.length,
      publishedCount,
      draftCount,
      totalExercisesCount: publishedCount + draftCount,
    };
  }, [sessionsList]);

  const editingExerciseDisplayLabel = useMemo(() => {
    if (!editingExerciseId) return '';
    const idx = existingSessionExercises.findIndex((ex) => ex.id === editingExerciseId);
    const found = idx >= 0 ? existingSessionExercises[idx] : undefined;
    if (found) {
      return formatExerciseDisplayTitle(found, idx, tr);
    }
    return exerciseTitle.trim() || tr('bài tập đang chọn', 'selected exercise');
  }, [editingExerciseId, existingSessionExercises, exerciseTitle, tr]);

  const loadExistingExerciseIntoForm = (ex: KtnSessionExercise) => {
    setExerciseMode('edit');
    setEditingExerciseId(ex.id);
    setNotifyStudentsOnUpdate(false);
    setExerciseTitle(ex.title || '');
    setExercisePrompt(ex.prompt || ex.instruction || '');
    const subType = (ex.submissionType || ex.type || 'mixed') as
      | 'mixed'
      | 'file'
      | 'audio'
      | 'text';
    setExerciseSubmissionType(
      ['mixed', 'file', 'audio', 'text'].includes(subType) ? subType : 'mixed'
    );
    setExerciseDueDate(ex.dueDate || '');
    setExerciseAttachments(
      Array.isArray(ex.attachments)
        ? ex.attachments.map((att) => ({
            ...att,
            uploading: false,
            progress: 100,
          }))
        : []
    );
    setExerciseAttachmentError(null);
  };

  const handleExerciseFilesSelected = async (fileList: FileList | File[] | null) => {
    if (!fileList) return;
    const files = Array.from(fileList);
    if (files.length === 0) return;
    setExerciseAttachmentError(null);

    if (user?.role !== 'admin' && classesQuery.isLoading && classesList.length === 0) {
      setExerciseAttachmentError(
        tr(
          'Đang đồng bộ danh sách lớp phụ trách, vui lòng thử lại sau giây lát.',
          'Syncing your assigned classes, please try again in a moment.'
        )
      );
      return;
    }

    if (
      user?.role !== 'admin' &&
      !classesList.some((c) => c.id.toUpperCase() === effectiveClassId.toUpperCase())
    ) {
      setExerciseAttachmentError(
        tr(
          `Giáo viên không có quyền tải tài liệu giao bài cho lớp ${effectiveClassId || 'này'} không thuộc phạm vi phụ trách.`,
          `You do not have permission to upload assignment files for class ${effectiveClassId || 'this class'}, which is not assigned to you.`
        )
      );
      return;
    }

    const currentActiveCount = exerciseAttachments.filter((a) => !a.error).length;
    if (currentActiveCount + files.length > MAX_EXERCISE_ATTACHMENTS) {
      setExerciseAttachmentError(
        tr(
          `Chỉ được đính kèm tối đa ${MAX_EXERCISE_ATTACHMENTS} tệp cho mỗi bài tập (hiện đã có ${currentActiveCount} tệp).`,
          `Up to ${MAX_EXERCISE_ATTACHMENTS} files can be attached per exercise (currently ${currentActiveCount} attached).`
        )
      );
      return;
    }

    for (const file of files) {
      const tempId = `temp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const controller = new AbortController();
      const pendingItem: TeacherAttachmentUploadItem = {
        id: tempId,
        name: file.name,
        url: '',
        mimeType: file.type || 'application/octet-stream',
        sizeBytes: file.size || 0,
        uploading: true,
        progress: 5,
        controller,
        rawFile: file,
      };
      setExerciseAttachments((prev) => [...prev, pendingItem]);

      try {
        const uploaded = await ktnApi.uploadHomeworkAttachment({
          file,
          fileName: file.name,
          classCode: effectiveClassId,
          sessionNum: Math.max(1, Number(sessionNum) || 1),
          allowedClassCodes: classesList.map((c) => c.id),
          isDemoMode,
          signal: controller.signal,
          onProgress: (pct) => {
            setExerciseAttachments((prev) =>
              prev.map((item) =>
                item.id === tempId ? { ...item, progress: pct } : item
              )
            );
          },
        });
        setExerciseAttachments((prev) =>
          prev.map((item) =>
            item.id === tempId
              ? {
                  ...uploaded,
                  uploading: false,
                  progress: 100,
                }
              : item
          )
        );
      } catch (err) {
        if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
          setExerciseAttachments((prev) => prev.filter((item) => item.id !== tempId));
          continue;
        }
        const errMsg =
          err instanceof Error
            ? err.message
            : tr(
                `Không thể tải tệp "${file.name}". Vui lòng thử lại.`,
                `Could not upload "${file.name}". Please try again.`
              );
        setExerciseAttachmentError(errMsg);
        const isClientValidationRejection =
          err instanceof KtnApiError &&
          (err.code === 'FILE_TOO_LARGE' ||
            err.code === 'UNSUPPORTED_FILE_TYPE' ||
            err.code === 'DANGEROUS_FILE_TYPE' ||
            err.code === 'FORBIDDEN_CLASS' ||
            err.code === 'MISSING_CLASS_CODE');
        const isTextValidationRejection =
          errMsg.includes('50MB') ||
          errMsg.includes('không được hỗ trợ') ||
          errMsg.includes('not supported');
        if (isClientValidationRejection || isTextValidationRejection) {
          setExerciseAttachments((prev) => prev.filter((item) => item.id !== tempId));
        } else {
          setExerciseAttachments((prev) =>
            prev.map((item) =>
              item.id === tempId
                ? {
                    ...item,
                    uploading: false,
                    progress: 0,
                    error: errMsg,
                    controller: undefined,
                    rawFile: file,
                  }
                : item
            )
          );
        }
      }
    }
  };

  const retryExerciseAttachmentUpload = async (failedItem: TeacherAttachmentUploadItem) => {
    if (!failedItem.rawFile) return;
    if (
      user?.role !== 'admin' &&
      !classesList.some((c) => c.id.toUpperCase() === effectiveClassId.toUpperCase())
    ) {
      setExerciseAttachmentError(
        tr(
          `Giáo viên không có quyền tải tài liệu giao bài cho lớp ${effectiveClassId || 'này'} không thuộc phạm vi phụ trách.`,
          `You do not have permission to upload assignment files for class ${effectiveClassId || 'this class'}, which is not assigned to you.`
        )
      );
      return;
    }
    const validOtherCount = exerciseAttachments.filter(
      (a) => a.id !== failedItem.id && !a.error
    ).length;
    if (validOtherCount >= MAX_EXERCISE_ATTACHMENTS) {
      setExerciseAttachmentError(
        tr(
          `Chỉ được đính kèm tối đa ${MAX_EXERCISE_ATTACHMENTS} tệp cho mỗi bài tập.`,
          `Up to ${MAX_EXERCISE_ATTACHMENTS} files can be attached per exercise.`
        )
      );
      return;
    }
    setExerciseAttachmentError(null);
    const controller = new AbortController();
    const targetId = failedItem.id;
    const file = failedItem.rawFile;
    setExerciseAttachments((prev) =>
      prev.map((item) =>
        item.id === targetId
          ? { ...item, uploading: true, progress: 5, error: undefined, controller }
          : item
      )
    );
    try {
      const uploaded = await ktnApi.uploadHomeworkAttachment({
        file,
        fileName: file.name,
        classCode: effectiveClassId,
        sessionNum: Math.max(1, Number(sessionNum) || 1),
        allowedClassCodes: classesList.map((c) => c.id),
        isDemoMode,
        signal: controller.signal,
        onProgress: (pct) => {
          setExerciseAttachments((prev) =>
            prev.map((item) =>
              item.id === targetId ? { ...item, progress: pct } : item
            )
          );
        },
      });
      setExerciseAttachments((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? {
                ...uploaded,
                uploading: false,
                progress: 100,
              }
            : item
        )
      );
    } catch (err) {
      if (controller.signal.aborted || (err instanceof Error && err.name === 'AbortError')) {
        setExerciseAttachments((prev) => prev.filter((item) => item.id !== targetId));
        return;
      }
      const errMsg =
        err instanceof Error
          ? err.message
          : tr(
              `Không thể tải lại tệp "${file.name}". Vui lòng thử lại.`,
              `Could not retry upload for "${file.name}". Please try again.`
            );
      setExerciseAttachmentError(errMsg);
      setExerciseAttachments((prev) =>
        prev.map((item) =>
          item.id === targetId
            ? { ...item, uploading: false, progress: 0, error: errMsg, controller: undefined }
            : item
        )
      );
    }
  };

  const handleRemoveExerciseAttachment = (attachmentId: string) => {
    setExerciseAttachments((prev) => {
      const target = prev.find((item) => item.id === attachmentId);
      if (target?.uploading && target.controller) {
        target.controller.abort();
      }
      return prev.filter((item) => item.id !== attachmentId);
    });
  };

  const handleTriggerSessionSubmit = (
    status: 'draft' | 'published',
    confirmedOverwrite = false
  ) => {
    setExerciseAttachmentError(null);
    if (exerciseAttachments.some((a) => a.uploading)) {
      setExerciseAttachmentError(
        tr(
          'Vui lòng chờ tải xong toàn bộ tài liệu đính kèm trước khi hoàn tất giao bài.',
          'Please wait for all attachment uploads to finish before assigning.'
        )
      );
      return;
    }
    if (
      exerciseMode === 'edit' &&
      editingExerciseId &&
      status === 'published' &&
      !confirmedOverwrite
    ) {
      const targetEx = existingSessionExercises.find((ex) => ex.id === editingExerciseId);
      if (targetEx && targetEx.status !== 'draft') {
        setPendingSubmitStatus(status);
        setConfirmOverwriteOpen(true);
        return;
      }
    }
    saveSessionMutation.mutate({ status });
  };
  const studentsList = useMemo(() => {
    const remote = studentsQuery.data || [];
    const merged = new Map<string, KtnStudentRecord>();
    for (const st of localCreatedStudents) {
      if (
        !effectiveClassId ||
        !st.class_code ||
        st.class_code.toUpperCase() === effectiveClassId.toUpperCase()
      ) {
        merged.set(st.email.toLowerCase(), st);
      }
    }
    for (const st of remote) {
      const existing = merged.get(st.email.toLowerCase());
      merged.set(st.email.toLowerCase(), existing ? { ...existing, ...st } : st);
    }
    return Array.from(merged.values());
  }, [studentsQuery.data, localCreatedStudents, effectiveClassId]);
  const selectedClassItem = useMemo(
    () => (effectiveClassId ? classesList.find((c) => c.id === effectiveClassId) || null : null),
    [classesList, effectiveClassId]
  );
  const hasApiError =
    !isDemoMode && (classesQuery.isError || homeworksQuery.isError);

  return (
    <div data-testid="teacher-workspace-page" className="space-y-3 sm:space-y-4">
      {/* Compact Class Selector & Schedule Bar */}
      <div className="flex flex-col gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-2xs sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {classesList.length > 0 ? (
            <select
              aria-label={tr('Chọn lớp phụ trách', 'Select assigned class')}
              data-testid="teacher-class-select"
              value={effectiveClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setHasManualClassSelection(true);
              }}
              className="min-h-[38px] w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none sm:w-auto sm:min-w-[210px] sm:max-w-xs"
            >
              <option value="">
                {activeSubTab === 'grading'
                  ? tr('-- Tất cả lớp được phân công --', '-- All assigned classes --')
                  : tr('-- Chọn lớp học --', '-- Select class --')}
              </option>
              {classesList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.id} · {translateCourseTitle(cls.name, lang)}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold text-stone-600">
              {tr('Chưa có lớp được phân công', 'No assigned classes yet')}
            </span>
          )}

          {selectedClassItem && (
            <span
              data-testid="teacher-class-schedule-badge"
              className={`inline-flex w-full items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold leading-snug sm:w-auto ${
                selectedClassItem.scheduleStatus === 'confirmed' &&
                selectedClassItem.officialScheduleText
                  ? 'bg-emerald-50 text-emerald-900'
                  : 'bg-amber-50 text-amber-900'
              }`}
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {selectedClassItem.scheduleStatus === 'confirmed' &&
                selectedClassItem.officialScheduleText
                  ? `${tr('Lớp', 'Class')} ${selectedClassItem.id} — ${translateScheduleText(selectedClassItem.officialScheduleText, lang)}`
                  : tr('Chưa có lịch học chính thức', 'Official schedule not set')}
              </span>
            </span>
          )}
        </div>

        {effectiveClassId && (
          <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
            <button
              type="button"
              data-testid="teacher-edit-schedule-btn"
              onClick={() => setScheduleModalOpen(true)}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100"
            >
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              <span>
                {selectedClassItem?.scheduleStatus === 'confirmed'
                  ? tr('Chỉnh lịch', 'Edit schedule')
                  : tr('Cài lịch học', 'Set schedule')}
              </span>
            </button>

            <button
              type="button"
              data-testid="teacher-open-class-chat-btn"
              onClick={() => navigate(`/chat?room=${encodeURIComponent(`class:${effectiveClassId}`)}`)}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
            >
              <MessageSquare className="h-3.5 w-3.5 shrink-0" />
              <span>{tr('Nhóm', 'Group')} {effectiveClassId}</span>
            </button>
          </div>
        )}
      </div>

      <ClassScheduleModal
        open={scheduleModalOpen}
        mode="edit_schedule"
        role="teacher"
        classItem={selectedClassItem}
        isSubmitting={isSavingSchedule}
        onClose={() => setScheduleModalOpen(false)}
        onSaveClassAndSchedule={async ({ schedulePayload }) => {
          setIsSavingSchedule(true);
          try {
            if (!isDemoMode) {
              await ktnApi.saveClassSchedule(schedulePayload);
            }
            await queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
            addToast({
              title: tr(
                `Đã cập nhật lịch học lớp ${schedulePayload.classCode}`,
                `Updated schedule for class ${schedulePayload.classCode}`
              ),
              description: tr(
                'Lịch học chính thức của lớp phụ trách đã được ghi nhận và đồng bộ nhắc giờ.',
                'The official schedule for your class has been saved and synced for reminders.'
              ),
              variant: 'success',
            });
            setScheduleModalOpen(false);
          } finally {
            setIsSavingSchedule(false);
          }
        }}
      />

      {hasApiError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>{tr('Chưa tải được dữ liệu lớp học.', 'Could not load class data.')}</span>
          </div>
          <button
            type="button"
            onClick={() => {
              classesQuery.refetch();
              homeworksQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            {tr('Thử lại', 'Retry')}
          </button>
        </div>
      )}

      {/* Compact Sub-Navigation Tabs */}
      <div className="grid grid-cols-2 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          data-testid="teacher-tab-grading"
          onClick={() => setActiveSubTab('grading')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'grading'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('Chấm bài', 'Grading')} ({homeworks.length})</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-stone-950">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="teacher-tab-sessions"
          onClick={() => setActiveSubTab('sessions')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'sessions'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('Giao bài', 'Assign')}</span>
        </button>

        <button
          type="button"
          data-testid="teacher-tab-students"
          onClick={() => setActiveSubTab('students')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'students'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('Học viên', 'Students')} ({studentsList.length})</span>
        </button>

        <button
          type="button"
          data-testid="teacher-tab-forum"
          onClick={() => setActiveSubTab('forum')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'forum'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{tr('Hỏi đáp bài học', 'Q&A Inbox')}</span>
        </button>
      </div>

      {/* SubTab 1: Homework Grading Queue */}
      {activeSubTab === 'grading' && (
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
            <h2 className="font-display text-sm font-bold text-stone-900">
              {tr('Bài nộp', 'Submissions')} · {tr('Lớp', 'Class')} {effectiveClassId || tr('Tất cả', 'All')}
            </h2>

            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-stone-100 p-1">
              {(
                [
                  { id: 'all', label: `${tr('Tất cả', 'All')} (${homeworks.length})` },
                  { id: 'pending', label: `${tr('Chờ chấm', 'Pending')} (${pendingCount})` },
                  { id: 'graded', label: tr('Đã chấm', 'Graded') },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setGradingFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    gradingFilter === f.id
                      ? 'bg-white text-red-900 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {filteredHomeworks.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-500">
                {tr('Chưa có bài nộp trong mục này.', 'No submissions in this category yet.')}
              </p>
            ) : (
              filteredHomeworks.map((hw) => {
                const isEditing = activeHomeworkId === String(hw.id);
                return (
                  <div
                    key={hw.id}
                    data-testid={`teacher-homework-item-${hw.id}`}
                    className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 transition-all"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-red-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {hw.lesson_num > 100
                              ? `${tr('Buổi', 'Session')} ${Math.floor(hw.lesson_num / 100)} · ${tr('Bài', 'Ex.')} ${hw.lesson_num % 100}`
                              : `${tr('Bài', 'Lesson')} ${hw.lesson_num}`}
                          </span>
                          <span className="truncate font-display text-xs font-bold text-stone-900 sm:text-sm">
                            {hw.student_name || hw.student_email}
                          </span>
                          <span className="text-[11px] text-stone-400">
                            · {formatChatTimestamp(hw.submitted_at)}
                          </span>
                        </div>

                        {hw.student_note && (
                          <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                            {hw.student_note}
                          </p>
                        )}

                        {hw.file_url && (() => {
                          const resolvedHwUrl = resolveUploadedMediaUrl(hw.file_url);
                          const isHwImage =
                            String(hw.file_type || '').startsWith('image/') ||
                            /\.(png|jpe?g|webp|gif)(\?|$)/i.test(hw.file_url);
                          const isHwPdf =
                            String(hw.file_type || '').includes('pdf') ||
                            /\.pdf(\?|$)/i.test(hw.file_url);
                          const isHwAudio = !isHwImage && !isHwPdf;

                          return (
                            <div className="mt-1.5 flex flex-wrap items-center gap-2">
                              {isHwImage && (
                                <>
                                  <img
                                    src={resolvedHwUrl}
                                    alt={`${tr('Bài làm', 'Submission')} ${hw.student_name || hw.student_email}`}
                                    data-testid={`teacher-homework-image-${hw.id}`}
                                    onClick={() =>
                                      setActiveLightboxAttachment({
                                        name:
                                          hw.attachments?.[0]?.title ||
                                          `${tr('Bài làm Bài', 'Submission Ex.')} ${hw.lesson_num} - ${hw.student_name || hw.student_email}`,
                                        url: resolvedHwUrl,
                                        kind: 'image',
                                      })
                                    }
                                    className="h-12 w-16 cursor-zoom-in rounded-lg border border-stone-300 object-cover hover:opacity-90"
                                  />
                                  <button
                                    type="button"
                                    data-testid={`teacher-homework-zoom-btn-${hw.id}`}
                                    onClick={() =>
                                      setActiveLightboxAttachment({
                                        name:
                                          hw.attachments?.[0]?.title ||
                                          `${tr('Bài làm Bài', 'Submission Ex.')} ${hw.lesson_num} - ${hw.student_name || hw.student_email}`,
                                        url: resolvedHwUrl,
                                        kind: 'image',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                                  >
                                    <ZoomIn className="h-3 w-3 text-red-800" />
                                    <span>{tr('Phóng to', 'Zoom')}</span>
                                  </button>
                                </>
                              )}
                              {isHwAudio && (
                                <audio
                                  controls
                                  preload="metadata"
                                  src={resolvedHwUrl}
                                  data-testid={`teacher-homework-audio-${hw.id}`}
                                  className="h-8 max-w-full sm:max-w-[240px]"
                                />
                              )}
                              <a
                                href={resolvedHwUrl}
                                target="_blank"
                                rel="noreferrer"
                                data-testid={`teacher-homework-file-link-${hw.id}`}
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>{tr('Tệp bài làm', 'Submission file')}</span>
                              </a>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {hw.status === 'graded' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                            {hw.score}/10
                          </span>
                        ) : hw.status === 'revision_requested' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-900">
                            <RotateCcw className="h-3 w-3" />
                            {tr('Nộp lại', 'Resubmit')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                            <Clock className="h-3 w-3" />
                            {tr('Chờ chấm', 'Pending')}
                          </span>
                        )}

                        <button
                          type="button"
                          data-testid={`open-grade-form-btn-${hw.id}`}
                          onClick={() =>
                            isEditing ? setActiveHomeworkId(null) : openGradingForm(hw)
                          }
                          className="min-h-[36px] rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                        >
                          {isEditing
                            ? tr('Đóng', 'Close')
                            : hw.status === 'graded'
                            ? tr('Sửa điểm', 'Edit grade')
                            : tr('Chấm bài', 'Grade')}
                        </button>
                      </div>
                    </div>

                    {/* Inline Grading Form */}
                    {isEditing && (
                      <form
                        data-testid="teacher-grading-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const trimmedScore = scoreInput.trim();
                          const parsedScore = trimmedScore === '' ? NaN : Number(trimmedScore);
                          if (gradeStatusInput === 'graded') {
                            if (
                              trimmedScore === '' ||
                              !Number.isFinite(parsedScore) ||
                              parsedScore < 0 ||
                              parsedScore > 10
                            ) {
                              addToast({
                                title: tr('Chưa nhập điểm hợp lệ', 'Valid score required'),
                                description: tr(
                                  'Vui lòng nhập điểm từ 0 đến 10 trước khi lưu điểm.',
                                  'Please enter a score between 0 and 10 before saving.'
                                ),
                                variant: 'error',
                              });
                              return;
                            }
                          }
                          const rawScore = Number.isFinite(parsedScore)
                            ? parsedScore
                            : Number(hw.score ?? 0);
                          const numericScore = Math.min(
                            10,
                            Math.max(0, Math.round(rawScore * 2) / 2)
                          );
                          gradeMutation.mutate({
                            id: String(hw.id),
                            score: numericScore,
                            teacherFeedback: feedbackInput.trim(),
                            status: gradeStatusInput,
                            classCode: hw.class_code || effectiveClassId,
                          });
                        }}
                        className="mt-3 space-y-2.5 rounded-xl border border-red-200 bg-white p-3 shadow-2xs"
                      >
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-stone-800">
                              {tr('Điểm (0 – 10):', 'Score (0 – 10):')}
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              data-testid="teacher-score-input"
                              placeholder="0 – 10"
                              value={scoreInput}
                              onChange={(e) => setScoreInput(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-stone-800">
                              {tr('Đánh giá:', 'Assessment:')}
                            </label>
                            <select
                              data-testid="teacher-status-select"
                              value={gradeStatusInput}
                              onChange={(e) =>
                                setGradeStatusInput(
                                  e.target.value as 'graded' | 'revision_requested'
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                            >
                              <option value="graded">{tr('Đạt • Công bố điểm', 'Pass • Publish grade')}</option>
                              <option value="revision_requested">{tr('Cần sửa • Nộp lại', 'Needs revision • Resubmit')}</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-stone-800">
                            {tr('Nhận xét:', 'Feedback:')}
                          </label>
                          <textarea
                            rows={2}
                            data-testid="teacher-feedback-input"
                            placeholder={tr(
                              'Nhập nhận xét chi tiết cho học viên...',
                              'Write personalized feedback for the student...'
                            )}
                            value={feedbackInput}
                            onChange={(e) => setFeedbackInput(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveHomeworkId(null)}
                            className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
                          >
                            {tr('Hủy', 'Cancel')}
                          </button>
                          <button
                            type="submit"
                            data-testid="teacher-submit-grade-btn"
                            disabled={gradeMutation.isPending}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {gradeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Award className="h-4 w-4" />
                            )}
                            <span>{tr('Lưu điểm', 'Save grade')}</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SubTab 2: Assign Session & Homework (C2 File Assignments & C3 Non-Overwriting Exercises) */}
      {activeSubTab === 'sessions' && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleTriggerSessionSubmit('published');
            }}
            className="min-w-0 space-y-3 rounded-xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <h2 className="font-display text-sm font-bold text-stone-900">
                  {tr('Giao bài tập buổi học', 'Assign session homework')}
                  {effectiveClassId ? ` (${effectiveClassId})` : ''}
                </h2>
                {effectiveClassId && (
                  <div
                    data-testid="teacher-assignments-status-summary"
                    className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]"
                  >
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 font-semibold text-stone-700">
                      {sessionsSummaryStats.sessionsCount} {tr('buổi đã tạo', 'sessions')}
                    </span>
                    <span className="rounded-md bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-800">
                      {sessionsSummaryStats.publishedCount} {tr('đang giao', 'published')}
                    </span>
                    <span className="rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-900">
                      {sessionsSummaryStats.draftCount} {tr('bản nháp', 'drafts')}
                    </span>
                  </div>
                )}
              </div>
              <div className="inline-flex max-w-full flex-wrap rounded-xl border border-stone-200 bg-stone-50 p-0.5 text-xs">
                <button
                  type="button"
                  data-testid="teacher-exercise-mode-create"
                  onClick={() => {
                    setExerciseMode('create');
                    setEditingExerciseId('');
                    setNotifyStudentsOnUpdate(false);
                    setExerciseTitle('');
                    setExercisePrompt('');
                    setExerciseSubmissionType('mixed');
                    setExerciseDueDate('');
                    setExerciseAttachments([]);
                    setExerciseAttachmentError(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition-colors ${
                    exerciseMode === 'create'
                      ? 'bg-red-800 text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>{tr('Tạo bài mới', 'New exercise')}</span>
                </button>
                <button
                  type="button"
                  data-testid="teacher-exercise-mode-edit"
                  disabled={existingSessionExercises.length === 0}
                  onClick={() => {
                    if (existingSessionExercises.length > 0) {
                      const target =
                        existingSessionExercises.find(
                          (ex) => ex.id === editingExerciseId
                        ) || existingSessionExercises[0];
                      loadExistingExerciseIntoForm(target);
                    }
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition-colors disabled:opacity-40 ${
                    exerciseMode === 'edit'
                      ? 'bg-red-800 text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  <span>{tr('Sửa bài hiện có', 'Edit existing')} ({existingSessionExercises.length})</span>
                </button>
              </div>
            </div>

            {existingSessionExercises.length > 0 && (
              <div
                data-testid="teacher-existing-exercises-banner"
                className="rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs text-emerald-950"
              >
                {exerciseMode === 'create' ? (
                  <p>
                    {lang === 'en' ? (
                      <>
                        <strong>Keep existing exercises:</strong> Session {sessionNum} already has{' '}
                        <strong>{existingSessionExercises.length} exercise(s)</strong>.{' '}
                        <strong>&ldquo;New exercise&rdquo;</strong> mode automatically appends exercise #{existingSessionExercises.length + 1} without overwriting existing ones.
                      </>
                    ) : (
                      <>
                        <strong>Bảo toàn bài cũ:</strong> Buổi {sessionNum} hiện đã có{' '}
                        <strong>{existingSessionExercises.length} bài tập</strong>. Chế độ{' '}
                        <strong>&ldquo;Tạo bài mới&rdquo;</strong> sẽ tự động nối thêm bài số{' '}
                        {existingSessionExercises.length + 1} mà không ghi đè các bài đã giao.
                      </>
                    )}
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-emerald-950">
                      {tr(
                        `Chọn bài tập hiện có trong Buổi ${sessionNum} để chỉnh sửa:`,
                        `Select an existing exercise in Session ${sessionNum} to edit:`
                      )}
                    </label>
                    <select
                      data-testid="teacher-existing-exercise-select"
                      value={editingExerciseId}
                      onChange={(e) => {
                        const target = existingSessionExercises.find(
                          (ex) => ex.id === e.target.value
                        );
                        if (target) {
                          loadExistingExerciseIntoForm(target);
                        }
                      }}
                      className="w-full rounded-lg border border-emerald-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                    >
                      {existingSessionExercises.map((ex, idx) => (
                        <option key={ex.id || idx} value={ex.id}>
                          {formatExerciseDisplayTitle(ex, idx, tr)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Lớp học:', 'Class:')}
                </label>
                <select
                  aria-label={tr('Chọn lớp giao bài', 'Select class for assignment')}
                  data-testid="teacher-exercise-class-select"
                  value={effectiveClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setHasManualClassSelection(true);
                  }}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                >
                  <option value="">{tr('-- Chọn lớp học --', '-- Select class --')}</option>
                  {classesList.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.id} · {translateCourseTitle(cls.name, lang)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Buổi học:', 'Session:')}
                </label>
                <select
                  aria-label={tr('Chọn buổi học', 'Select session')}
                  data-testid="teacher-session-select"
                  disabled={!effectiveClassId}
                  value={
                    sessionSelectMode === 'create_new'
                      ? '__new__'
                      : sessionNum !== null
                      ? String(sessionNum)
                      : ''
                  }
                  onChange={(e) => {
                    const val = e.target.value;
                    setExerciseMode('create');
                    setEditingExerciseId('');
                    setNotifyStudentsOnUpdate(false);
                    if (!val) {
                      setSessionSelectMode('none');
                      setSessionNum(null);
                      setCustomSessionNumInput('');
                      setSessionTitle('');
                      setSessionTitleDirty(false);
                      return;
                    }
                    if (val === '__new__') {
                      setSessionSelectMode('create_new');
                      setSessionNum(null);
                      setCustomSessionNumInput('');
                      setSessionTitle('');
                      setSessionTitleDirty(false);
                      return;
                    }
                    const nextNum = Math.max(1, Number(val) || 1);
                    setSessionSelectMode('existing');
                    setSessionNum(nextNum);
                    setCustomSessionNumInput(String(nextNum));
                    const matched = sessionsList.find(
                      (s) => Number(s.sessionNum ?? s.session_num) === nextNum
                    );
                    setSessionTitle(
                      String(matched?.title || matched?.session_title || '').trim()
                    );
                    setSessionTitleDirty(false);
                  }}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none disabled:bg-stone-100 disabled:text-stone-400"
                >
                  <option value="">
                    {effectiveClassId
                      ? tr('-- Chọn buổi học --', '-- Select session --')
                      : tr('-- Chọn lớp học trước --', '-- Select class first --')}
                  </option>
                  {sessionsList.map((s) => {
                    const sNum = Number(s.sessionNum ?? s.session_num);
                    const realTitle = String(s.title || s.session_title || '').trim();
                    const datePart = formatSessionShortDate(s.updatedAt);
                    const exCount = Array.isArray(s.exercises) ? s.exercises.length : 0;
                    const hasPrefix = /^(?:Buổi|Session)\s*\d+\b/i.test(realTitle);
                    const baseLabel = realTitle
                      ? hasPrefix
                        ? realTitle
                        : `${tr('Buổi', 'Session')} ${sNum} — ${realTitle}`
                      : `${tr('Buổi', 'Session')} ${sNum}`;
                    return (
                      <option key={s.id || sNum} value={String(sNum)}>
                        {baseLabel}
                        {datePart ? ` · ${datePart}` : ''} ({exCount} {tr('bài', 'ex.')})
                      </option>
                    );
                  })}
                  {effectiveClassId && (
                    <option value="__new__">
                      {tr('+ Tạo buổi học mới...', '+ Create new session...')}
                    </option>
                  )}
                </select>

                {effectiveClassId && sessionSelectMode === 'create_new' && (
                  <div className="mt-1.5 space-y-1">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        aria-label={tr('Số buổi mới', 'New session number')}
                        data-testid="teacher-session-num-input"
                        value={customSessionNumInput}
                        placeholder={tr(
                          `Nhập số buổi (VD: ${suggestedNextSessionNum})`,
                          `Session # (e.g. ${suggestedNextSessionNum})`
                        )}
                        onChange={(e) => {
                          const rawVal = e.target.value;
                          setCustomSessionNumInput(rawVal);
                          const parsed = Number(rawVal);
                          if (!rawVal.trim() || !Number.isFinite(parsed) || parsed < 1) {
                            setSessionNum(null);
                            return;
                          }
                          const nextNum = Math.floor(parsed);
                          setSessionNum(nextNum);
                          const matched = sessionsList.find(
                            (s) => Number(s.sessionNum ?? s.session_num) === nextNum
                          );
                          if (matched) {
                            setSessionTitle(
                              String(matched.title || matched.session_title || '').trim()
                            );
                            setSessionTitleDirty(false);
                          } else if (!sessionTitleDirty) {
                            setSessionTitle('');
                          }
                        }}
                        className="min-h-[34px] min-w-0 flex-1 rounded-xl border border-stone-300 px-3 py-1 text-xs font-bold focus:border-red-800 focus:outline-none"
                      />
                      <button
                        type="button"
                        data-testid="teacher-suggest-next-session-btn"
                        onClick={() => {
                          setSessionNum(suggestedNextSessionNum);
                          setCustomSessionNumInput(String(suggestedNextSessionNum));
                          setSessionTitle('');
                          setSessionTitleDirty(false);
                        }}
                        className="shrink-0 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[10px] font-bold text-red-800 hover:bg-red-100"
                      >
                        {tr(`Buổi ${suggestedNextSessionNum}`, `Session ${suggestedNextSessionNum}`)}
                      </button>
                    </div>
                    {sessionNum !== null &&
                      sessionsList.some(
                        (s) => Number(s.sessionNum ?? s.session_num) === sessionNum
                      ) && (
                        <p className="text-[11px] font-medium text-amber-800">
                          {tr(
                            `Buổi ${sessionNum} đã có sẵn — bài tập mới sẽ được thêm nối tiếp vào buổi này.`,
                            `Session ${sessionNum} already exists — new exercise will be appended safely.`
                          )}
                        </p>
                      )}
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700">
                  {tr('Tiêu đề buổi:', 'Session title:')}
                </label>
                <input
                  type="text"
                  data-testid="teacher-session-title-input"
                  value={sessionTitle}
                  disabled={!effectiveClassId || sessionSelectMode === 'none'}
                  placeholder={
                    !effectiveClassId || sessionSelectMode === 'none'
                      ? tr('Chọn buổi học trước', 'Select a session first')
                      : tr('Nhập chủ đề buổi học (tùy chọn)', 'Enter session topic (optional)')
                  }
                  onChange={(e) => {
                    setSessionTitle(e.target.value);
                    setSessionTitleDirty(true);
                  }}
                  className="mt-1 min-h-[38px] w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs disabled:bg-stone-100 disabled:text-stone-400"
                />
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-950">
                  {exerciseMode === 'edit'
                    ? tr(
                        `Đang chỉnh sửa: ${editingExerciseDisplayLabel}`,
                        `Editing: ${editingExerciseDisplayLabel}`
                      )
                    : tr('Bài tập về nhà:', 'Homework assignment:')}
                </p>
                {exerciseMode === 'edit' && (
                  <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                    {tr('Bảo toàn các bài tập khác trong buổi', 'Preserves other exercises in session')}
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  {tr('Tên bài tập *:', 'Exercise title *:')}
                </label>
                <input
                  type="text"
                  data-testid="teacher-exercise-title-input"
                  value={exerciseTitle}
                  onChange={(e) => setExerciseTitle(e.target.value)}
                  placeholder={tr('VD: Thu âm từ vựng hoặc làm phiếu bài tập...', 'e.g. Record vocabulary or complete worksheet...')}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  {tr('Hướng dẫn làm bài (không bắt buộc nếu đã đính kèm tệp):', 'Instructions (optional if files attached):')}
                </label>
                <textarea
                  rows={2}
                  data-testid="teacher-exercise-prompt-input"
                  value={exercisePrompt}
                  onChange={(e) => setExercisePrompt(e.target.value)}
                  placeholder={tr('Nhập yêu cầu, gợi ý hoặc ghi chú nộp bài...', 'Enter instructions or submission notes...')}
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700">
                    {tr('Loại bài cần nộp:', 'Submission type:')}
                  </label>
                  <select
                    data-testid="teacher-exercise-submission-type-select"
                    value={exerciseSubmissionType}
                    onChange={(e) =>
                      setExerciseSubmissionType(
                        e.target.value as 'mixed' | 'file' | 'audio' | 'text'
                      )
                    }
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-900"
                  >
                    <option value="mixed">{tr('Tổng hợp (Thu âm / Ảnh / Tệp / Văn bản)', 'Mixed (Audio / Image / File / Text)')}</option>
                    <option value="audio">{tr('Thu âm giọng đọc (Audio)', 'Voice recording (Audio)')}</option>
                    <option value="file">{tr('Nộp tệp / Ảnh vở viết (PDF, Word, Ảnh)', 'File / Workbook photo (PDF, Word, Image)')}</option>
                    <option value="text">{tr('Trả lời văn bản trực tiếp', 'Direct text answer')}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700">
                    {tr('Hạn nộp (tùy chọn):', 'Due date (optional):')}
                  </label>
                  <input
                    type="date"
                    data-testid="teacher-exercise-due-date-input"
                    value={exerciseDueDate}
                    onChange={(e) => setExerciseDueDate(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs text-stone-900"
                  />
                </div>
              </div>

              {/* File Attachments Upload Section (C2) */}
              <div
                data-testid="teacher-exercise-dropzone"
                onDragOver={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFiles(false);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setIsDraggingFiles(false);
                  if (e.dataTransfer?.files?.length) {
                    void handleExerciseFilesSelected(e.dataTransfer.files);
                  }
                }}
                className={`space-y-2 rounded-xl border p-2.5 transition-colors ${
                  isDraggingFiles
                    ? 'border-dashed border-red-700 bg-red-50/70'
                    : 'border-stone-200 bg-white'
                }`}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                      <Upload className="h-3.5 w-3.5 text-red-800" />
                      <span>
                        {tr('Tài liệu đính kèm', 'Attachments')} ({exerciseAttachments.length}/{MAX_EXERCISE_ATTACHMENTS})
                      </span>
                    </p>
                    <p className="text-[10px] text-stone-500">
                      {tr(
                        `Kéo thả tệp vào đây hoặc bấm đính kèm · PDF, DOC/DOCX, PPT/PPTX, JPG/PNG, MP3/M4A, MP4 (tối đa ${Math.round(MAX_HOMEWORK_ATTACHMENT_BYTES / (1024 * 1024))}MB/tệp).`,
                        `Drag & drop or browse · PDF, DOC/DOCX, PPT/PPTX, JPG/PNG, MP3/M4A, MP4 (max ${Math.round(MAX_HOMEWORK_ATTACHMENT_BYTES / (1024 * 1024))}MB/file).`
                      )}
                    </p>
                  </div>

                  <label className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-red-100">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>{tr('+ Đính kèm tệp', '+ Attach files')}</span>
                    <input
                      ref={exerciseFileInputRef}
                      type="file"
                      multiple
                      accept=".pdf,.doc,.docx,.ppt,.pptx,.jpg,.jpeg,.png,.webp,.gif,.mp3,.m4a,.wav,.aac,.ogg,.mp4,.mov,.webm"
                      data-testid="teacher-exercise-file-input"
                      onChange={(e) => {
                        handleExerciseFilesSelected(e.target.files);
                        e.target.value = '';
                      }}
                      className="sr-only"
                    />
                  </label>
                </div>

                {exerciseAttachmentError && (
                  <div
                    role="alert"
                    data-testid="teacher-attachment-error"
                    className="flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-2 text-xs font-semibold text-red-900"
                  >
                    <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-red-700" />
                    <span>{exerciseAttachmentError}</span>
                  </div>
                )}

                {exerciseAttachments.length > 0 && (
                  <div
                    data-testid="teacher-exercise-attachments-list"
                    className="space-y-1.5 pt-1"
                  >
                    {exerciseAttachments.map((att) => {
                      const resolvedUrl = resolveUploadedMediaUrl(att.url);
                      const mimeLower = (att.mimeType || '').toLowerCase();
                      const nameLower = (att.name || '').toLowerCase();
                      const isImage =
                        mimeLower.startsWith('image/') ||
                        /\.(jpg|jpeg|png|webp|gif)$/i.test(nameLower);
                      const isPdf =
                        mimeLower.includes('pdf') || nameLower.endsWith('.pdf');
                      const isAudio =
                        mimeLower.startsWith('audio/') ||
                        /\.(mp3|m4a|wav|aac|ogg)$/i.test(nameLower);
                      const isVideo =
                        mimeLower.startsWith('video/') ||
                        /\.(mp4|mov|webm)$/i.test(nameLower);

                      return (
                        <div
                          key={att.id}
                          data-testid={`teacher-exercise-attachment-item-${att.id}`}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1.5 text-xs"
                        >
                          <div className="flex min-w-0 flex-1 items-center gap-2">
                            {isImage && resolvedUrl ? (
                              <img
                                src={resolvedUrl}
                                alt={att.name}
                                className="h-8 w-8 shrink-0 rounded object-cover"
                              />
                            ) : (
                              <FileText className="h-4 w-4 shrink-0 text-red-800" />
                            )}
                            <div className="min-w-0 flex-1">
                              <div className="truncate font-bold text-stone-900">
                                {att.name}
                              </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] text-stone-500">
                                  <span>{formatBytes(att.sizeBytes || 0)}</span>
                                  {att.uploading ? (
                                    <span
                                      data-testid={`teacher-attachment-progress-${att.id}`}
                                      className="font-bold text-amber-800"
                                    >
                                      {tr(`Đang tải ${att.progress ?? 0}%...`, `Uploading ${att.progress ?? 0}%...`)}
                                    </span>
                                  ) : att.error ? (
                                    <span
                                      data-testid={`teacher-attachment-item-error-${att.id}`}
                                      className="font-semibold text-red-700"
                                    >
                                      {att.error}
                                    </span>
                                  ) : (
                                    <span className="font-semibold text-emerald-700">
                                      {tr('Đã tải xong', 'Uploaded')}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                              {att.error && att.rawFile && (
                                <button
                                  type="button"
                                  data-testid={`teacher-retry-attachment-${att.id}`}
                                  onClick={() => void retryExerciseAttachmentUpload(att)}
                                  className="inline-flex items-center gap-1 rounded border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-900 hover:bg-amber-100"
                                >
                                  <RefreshCw className="h-3 w-3" />
                                  <span>{tr('Thử lại', 'Retry')}</span>
                                </button>
                              )}
                              {!att.uploading &&
                                !att.error &&
                                resolvedUrl &&
                                (isImage || isPdf || isAudio || isVideo) && (
                                <button
                                  type="button"
                                  data-testid={`teacher-preview-attachment-${att.id}`}
                                  onClick={() => setPreviewingExerciseAttachment(att)}
                                  className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                                >
                                  <ZoomIn className="h-3 w-3" />
                                  <span>{tr('Xem trước', 'Preview')}</span>
                                </button>
                              )}
                            <button
                              type="button"
                              data-testid={`teacher-remove-attachment-${att.id}`}
                              onClick={() => handleRemoveExerciseAttachment(att.id)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{att.uploading ? tr('Hủy tải', 'Cancel') : tr('Xóa', 'Remove')}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {exerciseMode === 'edit' &&
              Boolean(editingExerciseId) &&
              existingSessionExercises.find((ex) => ex.id === editingExerciseId)?.status !== 'draft' && (
                <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-950">
                  <input
                    type="checkbox"
                    data-testid="teacher-notify-on-update-checkbox"
                    checked={notifyStudentsOnUpdate}
                    onChange={(e) => setNotifyStudentsOnUpdate(e.target.checked)}
                    className="h-3.5 w-3.5 rounded border-stone-300 text-red-800 focus:ring-red-700"
                  />
                  <span>
                    {tr(
                      'Gửi thông báo cập nhật bài tập tới học viên trong lớp (mặc định tắt để tránh gửi trùng)',
                      'Notify class students about this exercise update (off by default to prevent duplicate alerts)'
                    )}
                  </span>
                </label>
              )}

            <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
              <button
                type="button"
                data-testid="teacher-save-draft-session-btn"
                disabled={
                  saveSessionMutation.isPending ||
                  exerciseAttachments.some((a) => a.uploading)
                }
                onClick={() => handleTriggerSessionSubmit('draft')}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-800 hover:bg-stone-50 disabled:opacity-50"
              >
                <Save className="h-3.5 w-3.5" />
                <span>{tr('Lưu nháp', 'Save draft')}</span>
              </button>

              <button
                type="submit"
                data-testid="teacher-save-session-btn"
                disabled={
                  saveSessionMutation.isPending ||
                  exerciseAttachments.some((a) => a.uploading)
                }
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
              >
                <Send className="h-3.5 w-3.5" />
                <span>
                  {exerciseMode === 'edit'
                    ? tr('Cập nhật & Giao bài', 'Update & Assign')
                    : tr('Giao bài', 'Assign')}
                </span>
              </button>
            </div>
          </form>

          <div className="min-w-0 rounded-xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs lg:col-span-5">
            <h3 className="font-display text-sm font-bold text-stone-900">
              {tr('Buổi học đã lưu', 'Saved sessions')} ({sessionsList.length})
            </h3>
            <div className="mt-2.5 space-y-2.5">
              {!effectiveClassId ? (
                <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center text-xs text-stone-500">
                  {tr(
                    'Vui lòng chọn lớp học ở biểu mẫu bên cạnh để xem các buổi học đã lưu.',
                    'Please select a class in the form beside this panel to view saved sessions.'
                  )}
                </p>
              ) : sessionsList.length === 0 ? (
                <p className="rounded-xl border border-dashed border-stone-200 bg-stone-50 p-4 text-center text-xs text-stone-500">
                  {tr(
                    'Lớp chưa có buổi học hoặc bài tập nào. Hãy tạo bài tập đầu tiên bên cạnh.',
                    'No saved sessions or exercises for this class yet. Create the first one using the form.'
                  )}
                </p>
              ) : sessionsList.map((s) => {
                const sNum = Number(s.sessionNum ?? s.session_num);
                const exList = Array.isArray(s.exercises) ? s.exercises : [];
                return (
                  <div
                    key={s.id || sNum}
                    data-testid={`teacher-saved-session-card-${sNum}`}
                    className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="font-bold text-stone-900">
                        {s.title || s.session_title}
                      </p>
                      <span className="rounded bg-stone-200/80 px-2 py-0.5 text-[10px] font-bold text-stone-800">
                        {exList.length} {tr('bài tập', 'exercises')}
                      </span>
                    </div>

                    {exList.length > 0 && (
                      <div className="mt-2 space-y-1.5 border-t border-stone-200/80 pt-2">
                        {exList.map((ex, idx) => (
                          <div
                            key={ex.id || idx}
                            data-testid={`teacher-saved-exercise-${ex.id}`}
                            className="flex items-start justify-between gap-2 rounded-lg border border-stone-200 bg-white p-2"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <span className="font-bold text-stone-900">
                                  {formatExerciseDisplayTitle(ex, idx, tr)}
                                </span>
                                {ex.status === 'draft' ? (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    {tr('Nháp', 'Draft')}
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                                    {tr('Đang giao', 'Published')}
                                  </span>
                                )}
                                {Array.isArray(ex.attachments) &&
                                  ex.attachments.length > 0 && (
                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                                      {ex.attachments.length} {tr('tệp đính kèm', 'attachment(s)')}
                                    </span>
                                  )}
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                                {ex.prompt || ex.instruction}
                              </p>
                            </div>
                            <button
                              type="button"
                              data-testid={`teacher-edit-saved-exercise-btn-${ex.id}`}
                              onClick={() => {
                                setSessionSelectMode('existing');
                                setSessionNum(sNum);
                                setCustomSessionNumInput(String(sNum));
                                setSessionTitle(String(s.title || s.session_title || '').trim());
                                setSessionTitleDirty(false);
                                loadExistingExerciseIntoForm(ex);
                              }}
                              className="shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-red-800 hover:bg-red-50"
                            >
                              {tr('Sửa bài này', 'Edit')}
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* C3 Confirmation Modal before overwriting an already-published exercise */}
          {confirmOverwriteOpen && (
            <div
              data-testid="teacher-confirm-overwrite-modal"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            >
              <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
                <h3 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                  <AlertTriangle className="h-4 w-4 text-amber-700" />
                  <span>
                    {tr(
                      `Xác nhận cập nhật: ${editingExerciseDisplayLabel}`,
                      `Confirm updating: ${editingExerciseDisplayLabel}`
                    )}
                  </span>
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  {lang === 'en' ? (
                    <>
                      You are editing an already-assigned exercise (<strong>{editingExerciseDisplayLabel}</strong>) in <strong>Session {sessionNum}</strong>. Other exercises in this session will be preserved without sending duplicate assignment alerts.
                    </>
                  ) : (
                    <>
                      Bạn đang sửa bài tập đã giao (<strong>{editingExerciseDisplayLabel}</strong>) trong <strong>Buổi {sessionNum}</strong>. Hệ thống sẽ bảo toàn các bài tập khác cùng buổi và không gửi thông báo giao bài trùng lặp.
                    </>
                  )}
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-testid="teacher-cancel-overwrite-btn"
                    onClick={() => setConfirmOverwriteOpen(false)}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                  >
                    {tr('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="button"
                    data-testid="teacher-confirm-overwrite-btn"
                    onClick={() =>
                      handleTriggerSessionSubmit(pendingSubmitStatus, true)
                    }
                    className="rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
                  >
                    {tr('Xác nhận cập nhật', 'Confirm update')}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Teacher Attachment Preview Modal (Image / PDF / Audio / Video) */}
          {previewingExerciseAttachment && (
            <div
              data-testid="teacher-attachment-preview-modal"
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
            >
              <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
                <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
                  <div>
                    <h3 className="font-display text-sm font-bold text-stone-900">
                      {previewingExerciseAttachment.name}
                    </h3>
                    <p className="text-[11px] text-stone-500">
                      {formatBytes(previewingExerciseAttachment.sizeBytes || 0)}
                    </p>
                  </div>
                  <button
                    type="button"
                    aria-label={tr('Đóng xem trước tài liệu', 'Close file preview')}
                    onClick={() => setPreviewingExerciseAttachment(null)}
                    className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="mt-3 max-h-[70vh] overflow-auto">
                  {previewingExerciseAttachment.mimeType.startsWith('image/') ? (
                    <img
                      src={resolveUploadedMediaUrl(previewingExerciseAttachment.url)}
                      alt={previewingExerciseAttachment.name}
                      className="mx-auto max-h-[60vh] rounded-xl object-contain"
                    />
                  ) : previewingExerciseAttachment.mimeType.includes('pdf') ||
                    previewingExerciseAttachment.name.toLowerCase().endsWith('.pdf') ? (
                    <iframe
                      title={previewingExerciseAttachment.name}
                      src={resolveUploadedMediaUrl(previewingExerciseAttachment.url)}
                      className="h-[60vh] w-full rounded-xl border border-stone-200"
                    />
                  ) : previewingExerciseAttachment.mimeType.startsWith('audio/') ? (
                    <audio
                      controls
                      src={resolveUploadedMediaUrl(previewingExerciseAttachment.url)}
                      className="w-full"
                    />
                  ) : previewingExerciseAttachment.mimeType.startsWith('video/') ? (
                    <video
                      controls
                      src={resolveUploadedMediaUrl(previewingExerciseAttachment.url)}
                      className="max-h-[60vh] w-full rounded-xl"
                    />
                  ) : (
                    <p className="py-6 text-center text-xs text-stone-600">
                      {tr(
                        `Tệp tài liệu văn phòng (${previewingExerciseAttachment.name}).`,
                        `Office document (${previewingExerciseAttachment.name}).`
                      )}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* SubTab 3: Student Roster, Attendance, Create Student & Course Grant Requests */}
      {activeSubTab === 'students' && (
        <div className="space-y-4">
          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
              <div>
                <h2 className="font-display text-sm font-bold text-stone-900">
                  {tr('Học viên & Điểm danh lớp', 'Students & Attendance for class')} {effectiveClassId} ({studentsList.length})
                </h2>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  {tr(
                    'Giáo viên được tạo học viên mới trong lớp mình phụ trách. Khóa học video cần gửi đề nghị để Quản lý phê duyệt.',
                    'Teachers can create new students in assigned classes. Video course access requires submitting a request for Admin approval.'
                  )}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-testid="teacher-create-student-btn"
                  onClick={() => {
                    setCreateStudentError(null);
                    setCreatedStudentResult(null);
                    setNewStuClassCode(effectiveClassId || classesList[0]?.id || '');
                    setCreateStudentModalOpen(true);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>{tr('+ Tạo học viên', '+ Add student')}</span>
                </button>

                <button
                  type="button"
                  data-testid="teacher-request-course-btn"
                  onClick={() => {
                    setCourseRequestError(null);
                    if (!reqStudentEmail && studentsList[0]?.email) {
                      setReqStudentEmail(studentsList[0].email);
                    }
                    if (!reqCourseId && (coursesQuery.data || DEMO_COURSES)[0]?.id) {
                      setReqCourseId((coursesQuery.data || DEMO_COURSES)[0].id);
                    }
                    setCourseRequestModalOpen(true);
                  }}
                  className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
                >
                  <BookOpen className="h-3.5 w-3.5 text-amber-800" />
                  <span>{tr('Đề nghị mở khóa học online', 'Request online course')}</span>
                </button>

                <div className="flex items-center gap-1.5 border-l border-stone-200 pl-2">
                  <label className="text-xs font-bold text-stone-600">{tr('Buổi:', 'Session:')}</label>
                  <input
                    type="number"
                    min={1}
                    aria-label={tr('Buổi điểm danh', 'Attendance session')}
                    data-testid="teacher-attendance-session-input"
                    value={attendanceSessionNum}
                    onChange={(e) =>
                      setAttendanceSessionNum(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="w-16 rounded-lg border border-stone-300 px-2 py-1 text-xs font-bold text-stone-900"
                  />
                  <button
                    type="button"
                    data-testid="teacher-save-attendance-btn"
                    disabled={saveAttendanceMutation.isPending || studentsList.length === 0}
                    onClick={() => saveAttendanceMutation.mutate()}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    <span>{tr('Lưu điểm danh', 'Save attendance')}</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2.5 divide-y divide-stone-100">
              {studentsList.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">
                  {tr(
                    `Lớp ${effectiveClassId || 'này'} chưa có học viên. Bấm "+ Tạo học viên" để thêm học viên mới.`,
                    `Class ${effectiveClassId || 'this class'} has no students yet. Click "+ Add student" to add one.`
                  )}
                </p>
              ) : (
                studentsList.map((st) => {
                  const attStatus = attendanceMap[st.email] || 'present';
                  const stExt = st as KtnStudentRecord & {
                    parent_phone?: string;
                    parentPhone?: string;
                    parentName?: string;
                  };
                  const displayParentName = stExt.parent_name || stExt.parentName;
                  const displayParentPhone = stExt.parent_phone || stExt.parentPhone;
                  return (
                    <div
                      key={st.code || st.email}
                      data-testid={`teacher-student-row-${st.email}`}
                      className="flex flex-wrap items-center justify-between gap-2 py-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-stone-900 sm:text-sm">
                            {st.name}
                          </p>
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-600">
                            {st.code}
                          </span>
                          {st.has_online_courses ? (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-800">
                              {tr('Có khóa video', 'Has video course')} ({st.online_courses?.length || 1})
                            </span>
                          ) : (
                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                              {tr('Chỉ học lớp trực tiếp', 'Offline class only')}
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-stone-500">
                          {st.email}
                          {st.phone && st.phone !== displayParentPhone ? ` · ${tr('SĐT', 'Phone')}: ${st.phone}` : ''}
                          {displayParentName ? ` · ${tr('PH', 'Parent')}: ${displayParentName}` : ''}
                          {displayParentPhone
                            ? displayParentName
                              ? ` (${displayParentPhone})`
                              : ` · ${tr('SĐT PH', 'Parent phone')}: ${displayParentPhone}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`${tr('Điểm danh', 'Attendance for')} ${st.name}`}
                          data-testid={`teacher-attendance-select-${st.email}`}
                          value={attStatus}
                          onChange={(e) =>
                            setAttendanceMap((prev) => ({
                              ...prev,
                              [st.email]: e.target.value as
                                | 'present'
                                | 'late'
                                | 'absent_excused'
                                | 'absent_unexcused',
                            }))
                          }
                          className="min-h-[34px] rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800"
                        >
                          <option value="present">{tr('Có mặt', 'Present')}</option>
                          <option value="late">{tr('Đi muộn', 'Late')}</option>
                          <option value="absent_excused">{tr('Vắng có phép', 'Excused')}</option>
                          <option value="absent_unexcused">{tr('Vắng không phép', 'Unexcused')}</option>
                        </select>

                        <button
                          type="button"
                          data-testid={`teacher-request-course-for-${st.email}`}
                          onClick={() => {
                            setCourseRequestError(null);
                            setReqStudentEmail(st.email);
                            if (!reqCourseId && (coursesQuery.data || DEMO_COURSES)[0]?.id) {
                              setReqCourseId((coursesQuery.data || DEMO_COURSES)[0].id);
                            }
                            setCourseRequestModalOpen(true);
                          }}
                          className="min-h-[34px] rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-900 hover:bg-amber-100"
                        >
                          {tr('Đề nghị cấp khóa', 'Request course')}
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/chat?room=student:${st.email}`)}
                          className="min-h-[34px] rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
                        >
                          {tr('Nhắn tin', 'Message')}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* Teacher's Course Grant Requests List */}
          <div
            data-testid="teacher-course-requests-list"
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
              <h3 className="font-display text-sm font-bold text-stone-900">
                {tr('Đề nghị mở khóa học online đã gửi', 'Submitted online course requests')} (
                {(courseGrantRequestsQuery.data || []).length})
              </h3>
              <span className="text-[11px] font-semibold text-stone-500">
                {tr('Quản lý phê duyệt để kích hoạt trên hệ thống video', 'Admin approval activates access in the video portal')}
              </span>
            </div>

            {(courseGrantRequestsQuery.data || []).length === 0 ? (
              <p className="py-5 text-center text-xs text-stone-500">
                {tr('Chưa có đề nghị mở khóa học online nào.', 'No online course access requests yet.')}
              </p>
            ) : (
              <div className="mt-2.5 divide-y divide-stone-100">
                {(courseGrantRequestsQuery.data || []).map((req) => (
                  <div
                    key={req.id}
                    data-testid={`teacher-course-request-item-${req.id}`}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-stone-900">
                          {req.student_name || req.student_email}
                        </span>
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold text-stone-700">
                          {tr('Lớp', 'Class')} {req.class_code}
                        </span>
                        <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-900">
                          {translateCourseTitle(
                            (req as Record<string, any>).requested_course_title ||
                              (req as Record<string, any>).course_title ||
                              (req as Record<string, any>).requested_course_id ||
                              (req as Record<string, any>).course_id,
                            lang
                          )}
                        </span>
                      </div>
                      {req.reason && (
                        <p className="mt-0.5 text-[11px] text-stone-600">
                          {tr('Lý do:', 'Reason:')} {req.reason}
                        </p>
                      )}
                      {req.review_note && (
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-700">
                          {tr('Phản hồi Quản lý:', 'Admin note:')} {req.review_note}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        {tr('Gửi', 'Sent')} {formatRelativeTime(req.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === 'approved' ? (
                        <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
                          {tr('Đã duyệt ✓', 'Approved ✓')}
                        </span>
                      ) : req.status === 'rejected' ? (
                        <span className="rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-900">
                          {tr('Từ chối', 'Rejected')}
                        </span>
                      ) : req.status === 'cancelled' ? (
                        <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-500">
                          {tr('Đã hủy', 'Cancelled')}
                        </span>
                      ) : (
                        <>
                          <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                            {tr('Chờ Quản lý duyệt', 'Pending approval')}
                          </span>
                          <button
                            type="button"
                            data-testid={`teacher-cancel-course-request-${req.id}`}
                            disabled={cancelCourseRequestMutation.isPending}
                            onClick={() => cancelCourseRequestMutation.mutate(req.id)}
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                          >
                            {tr('Hủy yêu cầu', 'Cancel request')}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* SubTab 4: Per-Lesson Forum Inbox & Leaderboard */}
      {activeSubTab === 'forum' && <TeacherForumInbox />}

      {/* Modal 1: Teacher Create Student (Agent E) */}
      {createStudentModalOpen && (
        <div
          data-testid="teacher-create-student-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">
                  {tr('Tạo học viên mới (Lớp phụ trách)', 'Create new student (Assigned class)')}
                </h3>
                <p className="text-[11px] text-stone-500">
                  {tr('Chỉ xếp vào lớp bạn phụ trách · Không tự động mở khóa học video', 'Assigned classes only · Does not auto-unlock video courses')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCreateStudentModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {classesList.length === 0 ? (
              <div
                data-testid="teacher-no-assigned-classes-warning"
                className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-xs font-semibold text-amber-950"
              >
                {tr('Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.', 'You have not been assigned any class yet. Please contact Admin.')}
              </div>
            ) : createdStudentResult ? (
              <div
                data-testid="teacher-created-student-credentials"
                className="mt-4 space-y-3"
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
                  <p className="font-bold">
                    {tr(
                      `✓ Đã tạo tài khoản học viên và xếp vào lớp ${createdStudentResult.classCode}`,
                      `✓ Student account created and added to class ${createdStudentResult.classCode}`
                    )}
                  </p>
                  <div className="mt-2 space-y-1 rounded-lg bg-white p-2.5 text-stone-800">
                    <p>
                      {tr('Họ tên:', 'Full name:')} <strong>{createdStudentResult.name}</strong>
                    </p>
                    <p>
                      {tr('Mã HV:', 'Student ID:')} <strong>{createdStudentResult.code}</strong>
                    </p>
                    <p data-testid="teacher-created-student-email-display">
                      {tr('Email đăng nhập:', 'Login email:')} <strong>{createdStudentResult.email}</strong>
                    </p>
                    <p data-testid="teacher-created-student-password-display">
                      {tr('Mật khẩu khởi tạo:', 'Initial password:')}{' '}
                      <strong className="text-red-800">
                        {createdStudentResult.initialPassword}
                      </strong>
                    </p>
                    {createdStudentResult.phone && (
                      <p data-testid="teacher-created-student-phone-display">
                        {tr('SĐT học viên:', 'Student phone:')} <strong>{createdStudentResult.phone}</strong>
                      </p>
                    )}
                    {createdStudentResult.parentName && (
                      <p data-testid="teacher-created-student-parent-name-display">
                        {tr('Phụ huynh:', 'Parent:')} <strong>{createdStudentResult.parentName}</strong>
                      </p>
                    )}
                    {createdStudentResult.parentPhone && (
                      <p data-testid="teacher-created-student-parent-phone-display">
                        {tr('SĐT phụ huynh:', 'Parent phone:')} <strong>{createdStudentResult.parentPhone}</strong>
                      </p>
                    )}
                    {createdStudentResult.note && (
                      <p data-testid="teacher-created-student-note-display">
                        {tr('Ghi chú:', 'Notes:')} <strong>{createdStudentResult.note}</strong>
                      </p>
                    )}
                    <p>
                      {tr('Khóa học video:', 'Video courses:')} <strong>{tr('Chưa cấp (0 khóa)', 'Not granted (0 courses)')}</strong>
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap justify-end gap-2">
                  <button
                    type="button"
                    data-testid="teacher-request-course-from-created-btn"
                    onClick={() => {
                      const targetEmail = createdStudentResult.email;
                      setCreatedStudentResult(null);
                      setCreateStudentModalOpen(false);
                      setCourseRequestError(null);
                      setReqStudentEmail(targetEmail);
                      if (!reqCourseId && (coursesQuery.data || DEMO_COURSES)[0]?.id) {
                        setReqCourseId((coursesQuery.data || DEMO_COURSES)[0].id);
                      }
                      setCourseRequestModalOpen(true);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-amber-950 hover:bg-amber-100"
                  >
                    <BookOpen className="h-3.5 w-3.5 text-amber-800" />
                    <span>{tr('Đề nghị mở khóa học online', 'Request online course')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = tr(
                        `Thông tin đăng nhập Sổ Liên Lạc Khổng Tử Nhí:\n- Học viên: ${createdStudentResult.name} (${createdStudentResult.code})\n- Lớp: ${createdStudentResult.classCode}\n- Email: ${createdStudentResult.email}\n- Mật khẩu: ${createdStudentResult.initialPassword}`,
                        `Little Confucius Portal Login Credentials:\n- Student: ${createdStudentResult.name} (${createdStudentResult.code})\n- Class: ${createdStudentResult.classCode}\n- Email: ${createdStudentResult.email}\n- Password: ${createdStudentResult.initialPassword}`
                      );
                      navigator.clipboard?.writeText(text);
                      addToast({
                        title: tr('Đã sao chép thông tin đăng nhập!', 'Copied login credentials!'),
                        variant: 'success',
                      });
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>{tr('Sao chép thông tin', 'Copy credentials')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedStudentResult(null);
                      setCreateStudentModalOpen(false);
                    }}
                    className="min-h-[36px] rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                  >
                    {tr('Hoàn tất', 'Done')}
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  teacherCreateStudentMutation.mutate();
                }}
                className="mt-3.5 space-y-3"
              >
                {createStudentError && (
                  <div
                    role="alert"
                    data-testid="teacher-create-student-error"
                    className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-900"
                  >
                    {createStudentError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Lớp học trực tiếp (chỉ lớp bạn phụ trách):', 'Offline class (assigned classes only):')}
                  </label>
                  <select
                    data-testid="teacher-create-student-class-select"
                    value={newStuClassCode || effectiveClassId || classesList[0]?.id || ''}
                    onChange={(e) => setNewStuClassCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {classesList.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.id} · {translateCourseTitle(cls.name, lang)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Họ và tên học viên *', 'Student full name *')}
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="teacher-create-student-name-input"
                    value={newStuName}
                    onChange={(e) => setNewStuName(e.target.value)}
                    placeholder={tr('VD: Bé Trần Minh Khôi', 'e.g., Tran Minh Khoi')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Email đăng nhập học viên *', 'Student login email *')}
                  </label>
                  <input
                    type="email"
                    required
                    data-testid="teacher-create-student-email-input"
                    value={newStuEmail}
                    onChange={(e) => setNewStuEmail(e.target.value)}
                    placeholder={tr('VD: minhkhoi@khongtunhi.com', 'e.g., minhkhoi@khongtunhi.com')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Số điện thoại học viên', 'Student phone')}
                  </label>
                  <input
                    type="tel"
                    data-testid="teacher-create-student-phone-input"
                    value={newStuPhone}
                    onChange={(e) => setNewStuPhone(e.target.value)}
                    placeholder={tr('VD: 0987654321', 'e.g., 0987654321')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Họ tên phụ huynh', 'Parent name')}
                  </label>
                  <input
                    type="text"
                    data-testid="teacher-create-student-parent-name-input"
                    value={newStuParentName}
                    onChange={(e) => setNewStuParentName(e.target.value)}
                    placeholder={tr('VD: Chị Nguyễn Lan Anh', 'e.g., Ms. Nguyen Lan Anh')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Số điện thoại phụ huynh', 'Parent phone')}
                  </label>
                  <input
                    type="tel"
                    data-testid="teacher-create-student-parent-phone-input"
                    value={newStuParentPhone}
                    onChange={(e) => setNewStuParentPhone(e.target.value)}
                    placeholder={tr('VD: 0912345678', 'e.g., 0912345678')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    {tr('Ghi chú', 'Notes')}
                  </label>
                  <input
                    type="text"
                    data-testid="teacher-create-student-note-input"
                    value={newStuNotes}
                    onChange={(e) => setNewStuNotes(e.target.value)}
                    placeholder={tr('Ghi chú trình độ hoặc lịch học của con...', 'Notes on level or schedule...')}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-600">
                  {lang === 'en' ? (
                    <>
                      Note: Teacher-created students have <strong>no video courses</strong> by default. Use &ldquo;Request online course&rdquo; for Admin approval when needed.
                    </>
                  ) : (
                    <>
                      Lưu ý: Học viên do giáo viên tạo mặc định <strong>chưa có khóa học video</strong>. Nếu cần cấp khóa học video, hãy dùng chức năng &ldquo;Đề nghị mở khóa học online&rdquo; để Quản lý phê duyệt.
                    </>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateStudentModalOpen(false)}
                    className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700"
                  >
                    {tr('Hủy', 'Cancel')}
                  </button>
                  <button
                    type="submit"
                    data-testid="teacher-submit-create-student-btn"
                    disabled={teacherCreateStudentMutation.isPending}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    {teacherCreateStudentMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <UserPlus className="h-3.5 w-3.5" />
                    )}
                    <span>{tr('Tạo học viên', 'Create student')}</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Modal 2: Teacher Request Online Course Access (Agent E) */}
      {courseRequestModalOpen && (
        <div
          data-testid="teacher-request-course-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-4 shadow-xl sm:p-5">
            <div className="flex items-center justify-between border-b border-stone-100 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-stone-900">
                  {tr('Đề nghị mở khóa học online', 'Request online course access')}
                </h3>
                <p className="text-[11px] text-stone-500">
                  {tr(
                    'Gửi yêu cầu để Quản lý duyệt và cấp quyền khóa học video cho học viên',
                    'Submit a request for Admin to approve and grant video course access'
                  )}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCourseRequestModalOpen(false)}
                className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createCourseRequestMutation.mutate();
              }}
              className="mt-3.5 space-y-3"
            >
              {courseRequestError && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs font-semibold text-red-900"
                >
                  {courseRequestError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-stone-800">
                  {tr('Chọn học viên trong lớp phụ trách *', 'Select student in assigned class *')}
                </label>
                <select
                  data-testid="teacher-request-course-student-select"
                  value={reqStudentEmail}
                  onChange={(e) => setReqStudentEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="">{tr('-- Chọn học viên --', '-- Select student --')}</option>
                  {studentsList.map((st) => (
                    <option key={st.email} value={st.email}>
                      {st.name} ({st.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800">
                  {tr('Khóa học video đề xuất mở *', 'Recommended video course *')}
                </label>
                <select
                  data-testid="teacher-request-course-select"
                  value={reqCourseId}
                  onChange={(e) => setReqCourseId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="">{tr('-- Chọn khóa học video --', '-- Select video course --')}</option>
                  {(coursesQuery.data || DEMO_COURSES).map((c) => (
                    <option key={c.id} value={c.id}>
                      {translateCourseTitle(c.title, lang)}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800">
                  {tr('Lý do đề xuất', 'Reason for request')}
                </label>
                <textarea
                  rows={2}
                  data-testid="teacher-request-course-reason-input"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder={tr(
                    'VD: Học viên đã đóng học phí combo lớp trực tiếp + khóa video bổ trợ...',
                    'e.g., Student paid combo tuition for offline class + supplementary video course...'
                  )}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCourseRequestModalOpen(false)}
                  className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700"
                >
                  {tr('Hủy', 'Cancel')}
                </button>
                <button
                  type="submit"
                  data-testid="teacher-submit-course-request-btn"
                  disabled={createCourseRequestMutation.isPending}
                  className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                >
                  {createCourseRequestMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-3.5 w-3.5" />
                  )}
                  <span>{tr('Gửi đề nghị', 'Submit request')}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
