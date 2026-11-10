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
  KtnClassItem,
  KtnClassSession,
  KtnCourse,
  KtnCourseGrantRequest,
  KtnHomework,
  KtnStudentRecord,
} from '@/types/ktn.types';
import { formatChatTimestamp, formatRelativeTime } from '@/lib/utils';

export interface TeacherAttachmentUploadItem extends KtnExerciseAttachment {
  uploading?: boolean;
  progress?: number;
  error?: string;
  controller?: AbortController;
}

const MAX_EXERCISE_ATTACHMENTS = 5;

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
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);
  const setActiveLightboxAttachment = useUiStore((s) => s.setActiveLightboxAttachment);

  const [selectedClassId, setSelectedClassId] = useState<string>(
    () => searchParams.get('class') || searchParams.get('classCode') || user?.classCode || ''
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
  const [scoreInput, setScoreInput] = useState<string>('9.5');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [gradeStatusInput, setGradeStatusInput] = useState<'graded' | 'revision_requested'>('graded');

  const [sessionNum, setSessionNum] = useState<number>(2);
  const [sessionTitle, setSessionTitle] = useState<string>('Buổi 2: Gia đình của em có mấy người?');
  const [exerciseMode, setExerciseMode] = useState<'create' | 'edit'>('create');
  const [editingExerciseId, setEditingExerciseId] = useState<string>('');
  const [exerciseTitle, setExerciseTitle] = useState<string>(
    'Bài tập thu âm: Giới thiệu gia đình của con (45 giây)'
  );
  const [exercisePrompt, setExercisePrompt] = useState<string>(
    'Con hãy cầm bức ảnh gia đình và giới thiệu bằng tiếng Trung gửi vào mục Bài tập nhé!'
  );
  const [exerciseSubmissionType, setExerciseSubmissionType] = useState<
    'mixed' | 'file' | 'audio' | 'text'
  >('mixed');
  const [exerciseDueDate, setExerciseDueDate] = useState<string>('');
  const [exerciseAttachments, setExerciseAttachments] = useState<
    TeacherAttachmentUploadItem[]
  >([]);
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
    if (user?.role === 'admin') return raw;
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
    if (!selectedClassId && classesList.length > 0) {
      const preferred =
        (user?.classCode && classesList.find((c) => c.id === user.classCode)?.id) ||
        classesList[0].id;
      setSelectedClassId(preferred);
    } else if (
      selectedClassId &&
      classesList.length > 0 &&
      !classesList.some((c) => c.id.toUpperCase() === selectedClassId.toUpperCase())
    ) {
      setSelectedClassId(classesList[0].id);
    } else if (selectedClassId && !classesQuery.isLoading && classesList.length === 0) {
      setSelectedClassId('');
    }
  }, [selectedClassId, classesList, classesQuery.isLoading, user?.classCode]);

  const effectiveClassId = useMemo(() => {
    if (classesList.length === 0) {
      return classesQuery.isLoading ? selectedClassId : '';
    }
    const matched = classesList.find(
      (c) => c.id.toUpperCase() === String(selectedClassId || '').toUpperCase()
    );
    return matched ? matched.id : classesList[0].id;
  }, [classesList, classesQuery.isLoading, selectedClassId]);

  const prevEffectiveClassIdRef = useRef<string>(effectiveClassId);
  useEffect(() => {
    const prev = prevEffectiveClassIdRef.current;
    if (prev && effectiveClassId && prev.toUpperCase() !== effectiveClassId.toUpperCase()) {
      setExerciseMode('create');
      setEditingExerciseId('');
      setExerciseAttachments([]);
      setExerciseAttachmentError(null);
      setConfirmOverwriteOpen(false);
      setPreviewingExerciseAttachment(null);
    }
    if (effectiveClassId) {
      prevEffectiveClassIdRef.current = effectiveClassId;
    }
  }, [effectiveClassId]);

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
    refetchInterval: isDemoMode ? false : 3500,
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
    enabled: Boolean(user) || isDemoMode,
  });

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
            ? 'Đã gửi yêu cầu nộp lại bài'
            : `Đã chấm ${vars.score}/10 điểm!`,
        variant: 'success',
      });
    },
  });

  // 6. Save Class Session & Exercise Assignment Mutation (C2 & C3: Non-overwriting + File Attachments)
  const saveSessionMutation = useMutation({
    mutationFn: async (vars?: { status?: 'draft' | 'published' }) => {
      const submitStatus: 'draft' | 'published' = vars?.status || 'published';
      setExerciseAttachmentError(null);

      if (!effectiveClassId) {
        throw new Error('Vui lòng chọn lớp học trước khi giao bài tập.');
      }
      if (
        user?.role !== 'admin' &&
        !classesList.some((c) => c.id.toUpperCase() === effectiveClassId.toUpperCase())
      ) {
        throw new Error(
          `Giáo viên không có quyền giao bài tập cho lớp ${effectiveClassId} không thuộc phạm vi phụ trách.`
        );
      }

      if (exerciseAttachments.some((a) => a.uploading)) {
        throw new Error(
          'Vui lòng chờ quá trình tải tài liệu đính kèm hoàn tất trước khi lưu hoặc giao bài.'
        );
      }

      const cleanTitle = exerciseTitle.trim();
      const cleanPrompt = exercisePrompt.trim();
      if (!cleanTitle || !cleanPrompt) {
        throw new Error('Vui lòng nhập đầy đủ Tên bài tập và Hướng dẫn làm bài.');
      }

      const numSession = Math.max(1, Number(sessionNum) || 1);
      const remoteSessions = sessionsQuery.data || [];
      const localSessions = localSavedSessions[effectiveClassId] || [];
      const sessionMap = new Map<number, KtnClassSession>();
      remoteSessions.forEach((s) => sessionMap.set(Number(s.sessionNum ?? s.session_num), s));
      localSessions.forEach((s) => sessionMap.set(Number(s.sessionNum ?? s.session_num), s));

      const existingSession = sessionMap.get(numSession);
      const existingExercises: KtnSessionExercise[] = Array.isArray(existingSession?.exercises)
        ? existingSession!.exercises.map((ex) => ({ ...ex }))
        : [];

      const readyAttachments: KtnExerciseAttachment[] = exerciseAttachments
        .filter((a) => !a.uploading && !a.error && a.url)
        .map((a) => ({
          id: a.id,
          name: a.name,
          url: a.url,
          mimeType: a.mimeType,
          sizeBytes: a.sizeBytes,
        }));

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

      const payload = {
        classCode: effectiveClassId,
        sessionNum: numSession,
        title: sessionTitle.trim() || existingSession?.title || `Buổi ${numSession}`,
        mode: saveMode,
        exercise: targetExercise,
        preserveExistingExercises: true,
        preserveDefaultExercises: true,
        status: submitStatus,
        suppressDuplicateNotification:
          submitStatus === 'draft' || wasAlreadyPublished,
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
      queryClient.invalidateQueries({ queryKey: ['ktn-class-sessions', effectiveClassId] });
      addToast({
        title:
          submitStatus === 'draft'
            ? 'Đã lưu nháp bài tập buổi học!'
            : saveMode === 'update_exercise'
              ? 'Đã cập nhật bài tập hiện có (bảo toàn các bài khác)!'
              : 'Đã giao bài tập cho lớp!',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      const msg = err instanceof Error ? err.message : 'Không thể lưu bài tập buổi học.';
      setExerciseAttachmentError(msg);
      addToast({
        title: 'Không thể lưu bài tập',
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
        title: `Đã lưu điểm danh Buổi ${attendanceSessionNum} lớp ${effectiveClassId}!`,
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
        throw new Error('Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.');
      }
      const chosenClass = (newStuClassCode || effectiveClassId || classesList[0]?.id || '').trim();
      if (!chosenClass) {
        throw new Error('Vui lòng chọn lớp học trực tiếp được phân công.');
      }
      if (
        user?.role !== 'admin' &&
        !classesList.some((c) => c.id.toUpperCase() === chosenClass.toUpperCase())
      ) {
        throw new Error(
          `Bạn chỉ được phép tạo và xếp học viên vào lớp mình đang phụ trách (${classesList
            .map((c) => c.id)
            .join(', ')}).`
        );
      }
      const cleanName = newStuName.trim();
      const cleanEmail = newStuEmail.trim().toLowerCase();
      if (!cleanName || !cleanEmail || !cleanEmail.includes('@')) {
        throw new Error('Vui lòng nhập đầy đủ họ tên và email hợp lệ của học viên.');
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
            `Học viên ${existingInDemo.name || cleanEmail} đã tồn tại trên hệ thống (lớp ${
              existingInDemo.class_code || chosenClass
            }). Không tạo trùng tài khoản.`
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
          message: 'Đã tạo học viên mới.',
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
        title: `Đã tạo học viên ${enrichedStudent.name} vào lớp ${resolvedClassCode}`,
        description:
          'Tài khoản đã được tạo và xếp vào nhóm chat lớp trực tiếp (chưa cấp khóa học video).',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof KtnApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Không thể tạo học viên mới.';
      setCreateStudentError(msg);
    },
  });

  const createCourseRequestMutation = useMutation({
    mutationFn: async () => {
      setCourseRequestError(null);
      if (!reqStudentEmail.trim()) {
        throw new Error('Vui lòng chọn học viên trong lớp phụ trách.');
      }
      if (!reqCourseId.trim()) {
        throw new Error('Vui lòng chọn khóa học video đề xuất mở.');
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
          'Chỉ được đề nghị cấp khóa học cho học viên thuộc lớp trực tiếp bạn phụ trách.'
        );
      }
      const courseObj = (coursesQuery.data || DEMO_COURSES).find(
        (c) => c.id === cleanCourseId
      );
      const cleanReason =
        reqReason.trim().length >= 3
          ? reqReason.trim()
          : 'Giáo viên phụ trách đề xuất mở khóa video bổ trợ';
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
        title: 'Đã gửi đề nghị mở khóa học online!',
        description: 'Quản lý sẽ xem xét và phê duyệt cấp khóa học cho học viên.',
        variant: 'success',
      });
    },
    onError: (err: unknown) => {
      const msg =
        err instanceof KtnApiError
          ? err.message
          : err instanceof Error
          ? err.message
          : 'Không thể gửi đề nghị mở khóa học.';
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
        title: 'Đã hủy đề nghị mở khóa học',
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
    setScoreInput(hw.score !== null && hw.score !== undefined ? String(hw.score) : '9.5');
    setFeedbackInput(
      hw.teacher_feedback ||
        'Con phát âm to rõ, thanh điệu chuẩn. Tiếp tục phát huy ở bài sau nhé! 🌟'
    );
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
    const num = Math.max(1, Number(sessionNum) || 1);
    return (
      sessionsList.find((s) => Number(s.sessionNum ?? s.session_num) === num) || null
    );
  }, [sessionsList, sessionNum]);

  const existingSessionExercises = useMemo<KtnSessionExercise[]>(
    () => (Array.isArray(currentSessionObj?.exercises) ? currentSessionObj!.exercises : []),
    [currentSessionObj]
  );

  const loadExistingExerciseIntoForm = (ex: KtnSessionExercise) => {
    setExerciseMode('edit');
    setEditingExerciseId(ex.id);
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

    if (
      user?.role !== 'admin' &&
      !classesList.some((c) => c.id.toUpperCase() === effectiveClassId.toUpperCase())
    ) {
      setExerciseAttachmentError(
        `Giáo viên không có quyền tải tài liệu giao bài cho lớp ${effectiveClassId || 'này'} không thuộc phạm vi phụ trách.`
      );
      return;
    }

    const currentActiveCount = exerciseAttachments.filter((a) => !a.error).length;
    if (currentActiveCount + files.length > MAX_EXERCISE_ATTACHMENTS) {
      setExerciseAttachmentError(
        `Chỉ được đính kèm tối đa ${MAX_EXERCISE_ATTACHMENTS} tệp cho mỗi bài tập (hiện đã có ${currentActiveCount} tệp).`
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
            : `Không thể tải tệp "${file.name}". Vui lòng thử lại.`;
        setExerciseAttachmentError(errMsg);
        setExerciseAttachments((prev) => prev.filter((item) => item.id !== tempId));
      }
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
        'Vui lòng chờ tải xong toàn bộ tài liệu đính kèm trước khi hoàn tất giao bài.'
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
    () => classesList.find((c) => c.id === effectiveClassId) || classesList[0] || null,
    [classesList, effectiveClassId]
  );
  const hasApiError =
    !isDemoMode && (classesQuery.isError || homeworksQuery.isError);

  return (
    <div data-testid="teacher-workspace-page" className="space-y-3 sm:space-y-4">
      {/* Compact Class Selector & Schedule Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-2xs">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          {classesList.length > 0 ? (
            <select
              aria-label="Chọn lớp phụ trách"
              data-testid="teacher-class-select"
              value={effectiveClassId}
              onChange={(e) => {
                setSelectedClassId(e.target.value);
                setHasManualClassSelection(true);
              }}
              className="min-h-[36px] min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none sm:max-w-xs"
            >
              {classesList.map((cls) => (
                <option key={cls.id} value={cls.id}>
                  {cls.id} · {cls.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="text-xs font-semibold text-stone-600">
              Chưa có lớp được phân công
            </span>
          )}

          {selectedClassItem && (
            <span
              data-testid="teacher-class-schedule-badge"
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold ${
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
                  ? `Lớp ${selectedClassItem.id} — ${selectedClassItem.officialScheduleText}`
                  : 'Chưa có lịch học chính thức'}
              </span>
            </span>
          )}
        </div>

        {effectiveClassId && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              data-testid="teacher-edit-schedule-btn"
              onClick={() => setScheduleModalOpen(true)}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100"
            >
              <Calendar className="h-3.5 w-3.5" />
              <span>
                {selectedClassItem?.scheduleStatus === 'confirmed'
                  ? 'Chỉnh lịch'
                  : 'Cài lịch học'}
              </span>
            </button>

            <button
              type="button"
              data-testid="teacher-open-class-chat-btn"
              onClick={() => navigate(`/chat?room=${encodeURIComponent(`class:${effectiveClassId}`)}`)}
              className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Nhóm {effectiveClassId}</span>
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
              title: `Đã cập nhật lịch học lớp ${schedulePayload.classCode}`,
              description:
                'Lịch học chính thức của lớp phụ trách đã được ghi nhận và đồng bộ nhắc giờ.',
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
            <span>Chưa tải được dữ liệu lớp học.</span>
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
            Thử lại
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
          <span className="truncate">Chấm bài ({homeworks.length})</span>
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
          <span className="truncate">Giao bài</span>
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
          <span className="truncate">Học viên ({studentsList.length})</span>
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
          <span className="truncate">Hỏi đáp bài học</span>
        </button>
      </div>

      {/* SubTab 1: Homework Grading Queue */}
      {activeSubTab === 'grading' && (
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
            <h2 className="font-display text-sm font-bold text-stone-900">
              Bài nộp · Lớp {effectiveClassId || 'Tất cả'}
            </h2>

            <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${homeworks.length})` },
                  { id: 'pending', label: `Chờ chấm (${pendingCount})` },
                  { id: 'graded', label: 'Đã chấm' },
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
                Chưa có bài nộp trong mục này.
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
                              ? `Buổi ${Math.floor(hw.lesson_num / 100)} · Bài ${hw.lesson_num % 100}`
                              : `Bài ${hw.lesson_num}`}
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
                                    alt={`Bài làm ${hw.student_name || hw.student_email}`}
                                    data-testid={`teacher-homework-image-${hw.id}`}
                                    onClick={() =>
                                      setActiveLightboxAttachment({
                                        name:
                                          hw.attachments?.[0]?.title ||
                                          `Bài làm Bài ${hw.lesson_num} - ${hw.student_name || hw.student_email}`,
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
                                          `Bài làm Bài ${hw.lesson_num} - ${hw.student_name || hw.student_email}`,
                                        url: resolvedHwUrl,
                                        kind: 'image',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                                  >
                                    <ZoomIn className="h-3 w-3 text-red-800" />
                                    <span>Phóng to</span>
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
                                <span>Tệp bài làm</span>
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
                            Nộp lại
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                            <Clock className="h-3 w-3" />
                            Chờ chấm
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
                          {isEditing ? 'Đóng' : hw.status === 'graded' ? 'Sửa điểm' : 'Chấm bài'}
                        </button>
                      </div>
                    </div>

                    {/* Inline Grading Form */}
                    {isEditing && (
                      <form
                        data-testid="teacher-grading-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const numericScore = Math.min(
                            10,
                            Math.max(0, Math.round(Number(scoreInput) * 2) / 2)
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
                              Điểm (0 – 10):
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              data-testid="teacher-score-input"
                              value={scoreInput}
                              onChange={(e) => setScoreInput(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-stone-800">
                              Đánh giá:
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
                              <option value="graded">Đạt • Công bố điểm</option>
                              <option value="revision_requested">Cần sửa • Nộp lại</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-stone-800">
                            Nhận xét:
                          </label>
                          <textarea
                            rows={2}
                            data-testid="teacher-feedback-input"
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
                            Hủy
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
                            <span>Lưu điểm</span>
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
            className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-7"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-sm font-bold text-stone-900">
                Giao bài tập buổi học ({effectiveClassId})
              </h2>
              <div className="inline-flex rounded-xl border border-stone-200 bg-stone-50 p-0.5 text-xs">
                <button
                  type="button"
                  data-testid="teacher-exercise-mode-create"
                  onClick={() => {
                    if (exerciseMode === 'edit') {
                      setExerciseAttachments([]);
                      setExerciseDueDate('');
                    }
                    setExerciseMode('create');
                    setEditingExerciseId('');
                    setExerciseAttachmentError(null);
                  }}
                  className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 font-bold transition-colors ${
                    exerciseMode === 'create'
                      ? 'bg-red-800 text-white'
                      : 'text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <Plus className="h-3.5 w-3.5" />
                  <span>Tạo bài mới</span>
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
                  <span>Sửa bài hiện có ({existingSessionExercises.length})</span>
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
                    <strong>Bảo toàn bài cũ:</strong> Buổi {sessionNum} hiện đã có{' '}
                    <strong>{existingSessionExercises.length} bài tập</strong>. Chế độ{' '}
                    <strong>&ldquo;Tạo bài mới&rdquo;</strong> sẽ tự động nối thêm bài số{' '}
                    {existingSessionExercises.length + 1} mà không ghi đè các bài đã giao.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    <label className="block font-bold text-emerald-950">
                      Chọn bài tập hiện có trong Buổi {sessionNum} để chỉnh sửa:
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
                          Bài {ex.num || idx + 1}: {ex.title} ({ex.id})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div>
                <label className="block text-xs font-bold text-stone-700">Lớp học:</label>
                <select
                  aria-label="Chọn lớp giao bài"
                  data-testid="teacher-exercise-class-select"
                  value={effectiveClassId}
                  onChange={(e) => {
                    setSelectedClassId(e.target.value);
                    setHasManualClassSelection(true);
                  }}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                >
                  {classesList.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {cls.id} · {cls.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700">Buổi số:</label>
                <input
                  type="number"
                  min={1}
                  data-testid="teacher-session-num-input"
                  value={sessionNum}
                  onChange={(e) => {
                    const nextNum = Math.max(1, Number(e.target.value) || 1);
                    setSessionNum(nextNum);
                    const matched = sessionsList.find(
                      (s) => Number(s.sessionNum ?? s.session_num) === nextNum
                    );
                    if (matched) {
                      setSessionTitle(matched.title || matched.session_title);
                    } else {
                      setSessionTitle(`Buổi ${nextNum}: Nội dung bài học`);
                    }
                    setExerciseMode('create');
                    setEditingExerciseId('');
                  }}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700">Tiêu đề buổi:</label>
                <input
                  type="text"
                  data-testid="teacher-session-title-input"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2.5 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs font-bold text-amber-950">
                  {exerciseMode === 'edit'
                    ? `Đang chỉnh sửa bài tập (${editingExerciseId})`
                    : 'Bài tập về nhà:'}
                </p>
                {exerciseMode === 'edit' && (
                  <span className="rounded bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                    Giữ nguyên ID & các bài tập khác trong buổi
                  </span>
                )}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  Tên bài tập:
                </label>
                <input
                  type="text"
                  data-testid="teacher-exercise-title-input"
                  value={exerciseTitle}
                  onChange={(e) => setExerciseTitle(e.target.value)}
                  placeholder="Tiêu đề bài tập..."
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-stone-700">
                  Hướng dẫn làm bài:
                </label>
                <textarea
                  rows={2}
                  data-testid="teacher-exercise-prompt-input"
                  value={exercisePrompt}
                  onChange={(e) => setExercisePrompt(e.target.value)}
                  placeholder="Hướng dẫn ngắn..."
                  className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="block text-[11px] font-bold text-stone-700">
                    Loại bài cần nộp:
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
                    <option value="mixed">Tổng hợp (Thu âm / Ảnh / Tệp / Văn bản)</option>
                    <option value="audio">Thu âm giọng đọc (Audio)</option>
                    <option value="file">Nộp tệp / Ảnh vở viết (PDF, Word, Ảnh)</option>
                    <option value="text">Trả lời văn bản trực tiếp</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700">
                    Hạn nộp (tùy chọn):
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
              <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="flex items-center gap-1.5 text-xs font-bold text-stone-800">
                      <Paperclip className="h-3.5 w-3.5 text-red-800" />
                      <span>
                        Tài liệu đính kèm ({exerciseAttachments.length}/{MAX_EXERCISE_ATTACHMENTS})
                      </span>
                    </p>
                    <p className="text-[10px] text-stone-500">
                      Hỗ trợ PDF, DOC/DOCX, PPT/PPTX, JPG/PNG, MP3/M4A, MP4 (tối đa{' '}
                      {Math.round(MAX_HOMEWORK_ATTACHMENT_BYTES / (1024 * 1024))}MB/tệp).
                    </p>
                  </div>

                  <label className="inline-flex min-h-[32px] cursor-pointer items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-red-100">
                    <Paperclip className="h-3.5 w-3.5" />
                    <span>+ Đính kèm tệp</span>
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
                              <div className="flex items-center gap-2 text-[10px] text-stone-500">
                                <span>{formatBytes(att.sizeBytes || 0)}</span>
                                {att.uploading ? (
                                  <span
                                    data-testid={`teacher-attachment-progress-${att.id}`}
                                    className="font-bold text-amber-800"
                                  >
                                    Đang tải {att.progress ?? 0}%...
                                  </span>
                                ) : (
                                  <span className="font-semibold text-emerald-700">
                                    Đã tải xong
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1.5">
                            {!att.uploading &&
                              resolvedUrl &&
                              (isImage || isPdf || isAudio || isVideo) && (
                                <button
                                  type="button"
                                  data-testid={`teacher-preview-attachment-${att.id}`}
                                  onClick={() => setPreviewingExerciseAttachment(att)}
                                  className="inline-flex items-center gap-1 rounded border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                                >
                                  <ZoomIn className="h-3 w-3" />
                                  <span>Xem trước</span>
                                </button>
                              )}
                            <button
                              type="button"
                              data-testid={`teacher-remove-attachment-${att.id}`}
                              onClick={() => handleRemoveExerciseAttachment(att.id)}
                              className="inline-flex items-center gap-1 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-800 hover:bg-red-100"
                            >
                              <Trash2 className="h-3 w-3" />
                              <span>{att.uploading ? 'Hủy tải' : 'Xóa'}</span>
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

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
                <span>Lưu nháp</span>
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
                  {exerciseMode === 'edit' ? 'Cập nhật & Giao bài' : 'Giao bài'}
                </span>
              </button>
            </div>
          </form>

          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-5">
            <h3 className="font-display text-sm font-bold text-stone-900">
              Buổi học đã lưu ({sessionsList.length})
            </h3>
            <div className="mt-2.5 space-y-2.5">
              {sessionsList.map((s) => {
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
                        {exList.length} bài tập
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
                                  Bài {ex.num || idx + 1}: {ex.title}
                                </span>
                                {ex.status === 'draft' && (
                                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                    Nháp
                                  </span>
                                )}
                                {Array.isArray(ex.attachments) &&
                                  ex.attachments.length > 0 && (
                                    <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                                      {ex.attachments.length} tệp đính kèm
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
                                setSessionNum(sNum);
                                setSessionTitle(s.title || s.session_title);
                                loadExistingExerciseIntoForm(ex);
                              }}
                              className="shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-red-800 hover:bg-red-50"
                            >
                              Sửa bài này
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
                  <span>Xác nhận cập nhật bài tập đã giao ({editingExerciseId})</span>
                </h3>
                <p className="mt-2 text-xs leading-relaxed text-stone-600">
                  Bạn đang sửa bài tập đã giao trong <strong>Buổi {sessionNum}</strong>. Hệ thống sẽ giữ nguyên mã bài tập (<code>{editingExerciseId}</code>), bảo toàn các bài tập khác cùng buổi và không gửi thông báo giao bài trùng lặp.
                </p>
                <div className="mt-4 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    data-testid="teacher-cancel-overwrite-btn"
                    onClick={() => setConfirmOverwriteOpen(false)}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="button"
                    data-testid="teacher-confirm-overwrite-btn"
                    onClick={() =>
                      handleTriggerSessionSubmit(pendingSubmitStatus, true)
                    }
                    className="rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
                  >
                    Xác nhận cập nhật
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
                    aria-label="Đóng xem trước tài liệu"
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
                      Tệp tài liệu văn phòng ({previewingExerciseAttachment.name}).
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
                  Học viên & Điểm danh lớp {effectiveClassId} ({studentsList.length})
                </h2>
                <p className="mt-0.5 text-[11px] text-stone-500">
                  Giáo viên được tạo học viên mới trong lớp mình phụ trách. Khóa học video cần gửi đề nghị để Quản lý phê duyệt.
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
                  <span>+ Tạo học viên</span>
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
                  <span>Đề nghị mở khóa học online</span>
                </button>

                <div className="flex items-center gap-1.5 border-l border-stone-200 pl-2">
                  <label className="text-xs font-bold text-stone-600">Buổi:</label>
                  <input
                    type="number"
                    min={1}
                    aria-label="Buổi điểm danh"
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
                    <span>Lưu điểm danh</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-2.5 divide-y divide-stone-100">
              {studentsList.length === 0 ? (
                <p className="py-6 text-center text-xs text-stone-500">
                  Lớp {effectiveClassId || 'này'} chưa có học viên. Bấm &ldquo;+ Tạo học viên&rdquo; để thêm học viên mới.
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
                              Có khóa video ({st.online_courses?.length || 1})
                            </span>
                          ) : (
                            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-500">
                              Chỉ học lớp trực tiếp
                            </span>
                          )}
                        </div>
                        <p className="truncate text-[11px] text-stone-500">
                          {st.email}
                          {st.phone && st.phone !== displayParentPhone ? ` · SĐT: ${st.phone}` : ''}
                          {displayParentName ? ` · PH: ${displayParentName}` : ''}
                          {displayParentPhone
                            ? displayParentName
                              ? ` (${displayParentPhone})`
                              : ` · SĐT PH: ${displayParentPhone}`
                            : ''}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        <select
                          aria-label={`Điểm danh ${st.name}`}
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
                          <option value="present">Có mặt</option>
                          <option value="late">Đi muộn</option>
                          <option value="absent_excused">Vắng có phép</option>
                          <option value="absent_unexcused">Vắng không phép</option>
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
                          Đề nghị cấp khóa
                        </button>

                        <button
                          type="button"
                          onClick={() => navigate(`/chat?room=student:${st.email}`)}
                          className="min-h-[34px] rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
                        >
                          Nhắn tin
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
                Đề nghị mở khóa học online đã gửi (
                {(courseGrantRequestsQuery.data || []).length})
              </h3>
              <span className="text-[11px] font-semibold text-stone-500">
                Quản lý phê duyệt để kích hoạt trên hệ thống video
              </span>
            </div>

            {(courseGrantRequestsQuery.data || []).length === 0 ? (
              <p className="py-5 text-center text-xs text-stone-500">
                Chưa có đề nghị mở khóa học online nào.
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
                          Lớp {req.class_code}
                        </span>
                        <span className="rounded bg-red-50 px-2 py-0.5 text-[10px] font-bold text-red-900">
                          {(req as Record<string, any>).requested_course_title ||
                            (req as Record<string, any>).course_title ||
                            (req as Record<string, any>).requested_course_id ||
                            (req as Record<string, any>).course_id}
                        </span>
                      </div>
                      {req.reason && (
                        <p className="mt-0.5 text-[11px] text-stone-600">
                          Lý do: {req.reason}
                        </p>
                      )}
                      {req.review_note && (
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-700">
                          Phản hồi Quản lý: {req.review_note}
                        </p>
                      )}
                      <p className="mt-0.5 text-[10px] text-stone-400">
                        Gửi {formatRelativeTime(req.created_at)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      {req.status === 'approved' ? (
                        <span className="rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
                          Đã duyệt ✓
                        </span>
                      ) : req.status === 'rejected' ? (
                        <span className="rounded-lg bg-red-100 px-2.5 py-1 text-[11px] font-bold text-red-900">
                          Từ chối
                        </span>
                      ) : req.status === 'cancelled' ? (
                        <span className="rounded-lg bg-stone-100 px-2.5 py-1 text-[11px] font-semibold text-stone-500">
                          Đã hủy
                        </span>
                      ) : (
                        <>
                          <span className="rounded-lg bg-amber-100 px-2.5 py-1 text-[11px] font-bold text-amber-900">
                            Chờ Quản lý duyệt
                          </span>
                          <button
                            type="button"
                            data-testid={`teacher-cancel-course-request-${req.id}`}
                            disabled={cancelCourseRequestMutation.isPending}
                            onClick={() => cancelCourseRequestMutation.mutate(req.id)}
                            className="rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
                          >
                            Hủy yêu cầu
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
                  Tạo học viên mới (Lớp phụ trách)
                </h3>
                <p className="text-[11px] text-stone-500">
                  Chỉ xếp vào lớp bạn phụ trách · Không tự động mở khóa học video
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
                Bạn chưa được phân công lớp. Vui lòng liên hệ Quản lý.
              </div>
            ) : createdStudentResult ? (
              <div
                data-testid="teacher-created-student-credentials"
                className="mt-4 space-y-3"
              >
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs text-emerald-950">
                  <p className="font-bold">
                    ✓ Đã tạo tài khoản học viên và xếp vào lớp {createdStudentResult.classCode}
                  </p>
                  <div className="mt-2 space-y-1 rounded-lg bg-white p-2.5 text-stone-800">
                    <p>
                      Họ tên: <strong>{createdStudentResult.name}</strong>
                    </p>
                    <p>
                      Mã HV: <strong>{createdStudentResult.code}</strong>
                    </p>
                    <p data-testid="teacher-created-student-email-display">
                      Email đăng nhập: <strong>{createdStudentResult.email}</strong>
                    </p>
                    <p data-testid="teacher-created-student-password-display">
                      Mật khẩu khởi tạo:{' '}
                      <strong className="text-red-800">
                        {createdStudentResult.initialPassword}
                      </strong>
                    </p>
                    {createdStudentResult.phone && (
                      <p data-testid="teacher-created-student-phone-display">
                        SĐT học viên: <strong>{createdStudentResult.phone}</strong>
                      </p>
                    )}
                    {createdStudentResult.parentName && (
                      <p data-testid="teacher-created-student-parent-name-display">
                        Phụ huynh: <strong>{createdStudentResult.parentName}</strong>
                      </p>
                    )}
                    {createdStudentResult.parentPhone && (
                      <p data-testid="teacher-created-student-parent-phone-display">
                        SĐT phụ huynh: <strong>{createdStudentResult.parentPhone}</strong>
                      </p>
                    )}
                    {createdStudentResult.note && (
                      <p data-testid="teacher-created-student-note-display">
                        Ghi chú: <strong>{createdStudentResult.note}</strong>
                      </p>
                    )}
                    <p>
                      Khóa học video: <strong>Chưa cấp (0 khóa)</strong>
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
                    <span>Đề nghị mở khóa học online</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const text = `Thông tin đăng nhập Sổ Liên Lạc Khổng Tử Nhí:\n- Học viên: ${createdStudentResult.name} (${createdStudentResult.code})\n- Lớp: ${createdStudentResult.classCode}\n- Email: ${createdStudentResult.email}\n- Mật khẩu: ${createdStudentResult.initialPassword}`;
                      navigator.clipboard?.writeText(text);
                      addToast({
                        title: 'Đã sao chép thông tin đăng nhập!',
                        variant: 'success',
                      });
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
                  >
                    <Copy className="h-3.5 w-3.5" />
                    <span>Sao chép thông tin</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCreatedStudentResult(null);
                      setCreateStudentModalOpen(false);
                    }}
                    className="min-h-[36px] rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                  >
                    Hoàn tất
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
                    Lớp học trực tiếp (chỉ lớp bạn phụ trách):
                  </label>
                  <select
                    data-testid="teacher-create-student-class-select"
                    value={newStuClassCode || effectiveClassId || classesList[0]?.id || ''}
                    onChange={(e) => setNewStuClassCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                  >
                    {classesList.map((cls) => (
                      <option key={cls.id} value={cls.id}>
                        {cls.id} · {cls.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Họ và tên học viên *
                  </label>
                  <input
                    type="text"
                    required
                    data-testid="teacher-create-student-name-input"
                    value={newStuName}
                    onChange={(e) => setNewStuName(e.target.value)}
                    placeholder="VD: Bé Trần Minh Khôi"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Email đăng nhập học viên *
                  </label>
                  <input
                    type="email"
                    required
                    data-testid="teacher-create-student-email-input"
                    value={newStuEmail}
                    onChange={(e) => setNewStuEmail(e.target.value)}
                    placeholder="VD: minhkhoi@khongtunhi.com"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Số điện thoại học viên
                  </label>
                  <input
                    type="tel"
                    data-testid="teacher-create-student-phone-input"
                    value={newStuPhone}
                    onChange={(e) => setNewStuPhone(e.target.value)}
                    placeholder="VD: 0987654321"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Họ tên phụ huynh
                  </label>
                  <input
                    type="text"
                    data-testid="teacher-create-student-parent-name-input"
                    value={newStuParentName}
                    onChange={(e) => setNewStuParentName(e.target.value)}
                    placeholder="VD: Chị Nguyễn Lan Anh"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Số điện thoại phụ huynh
                  </label>
                  <input
                    type="tel"
                    data-testid="teacher-create-student-parent-phone-input"
                    value={newStuParentPhone}
                    onChange={(e) => setNewStuParentPhone(e.target.value)}
                    placeholder="VD: 0912345678"
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-800">
                    Ghi chú
                  </label>
                  <input
                    type="text"
                    data-testid="teacher-create-student-note-input"
                    value={newStuNotes}
                    onChange={(e) => setNewStuNotes(e.target.value)}
                    placeholder="Ghi chú trình độ hoặc lịch học của con..."
                    className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <div className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-600">
                  Lưu ý: Học viên do giáo viên tạo mặc định <strong>chưa có khóa học video</strong>. Nếu cần cấp khóa học video, hãy dùng chức năng &ldquo;Đề nghị mở khóa học online&rdquo; để Quản lý phê duyệt.
                </div>

                <div className="flex justify-end gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => setCreateStudentModalOpen(false)}
                    className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700"
                  >
                    Hủy
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
                    <span>Tạo học viên</span>
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
                  Đề nghị mở khóa học online
                </h3>
                <p className="text-[11px] text-stone-500">
                  Gửi yêu cầu để Quản lý duyệt và cấp quyền khóa học video cho học viên
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
                  Chọn học viên trong lớp phụ trách *
                </label>
                <select
                  data-testid="teacher-request-course-student-select"
                  value={reqStudentEmail}
                  onChange={(e) => setReqStudentEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="">-- Chọn học viên --</option>
                  {studentsList.map((st) => (
                    <option key={st.email} value={st.email}>
                      {st.name} ({st.email})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800">
                  Khóa học video đề xuất mở *
                </label>
                <select
                  data-testid="teacher-request-course-select"
                  value={reqCourseId}
                  onChange={(e) => setReqCourseId(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-900"
                >
                  <option value="">-- Chọn khóa học video --</option>
                  {(coursesQuery.data || DEMO_COURSES).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-stone-800">
                  Lý do đề xuất
                </label>
                <textarea
                  rows={2}
                  data-testid="teacher-request-course-reason-input"
                  value={reqReason}
                  onChange={(e) => setReqReason(e.target.value)}
                  placeholder="VD: Học viên đã đóng học phí combo lớp trực tiếp + khóa video bổ trợ..."
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                />
              </div>

              <div className="flex justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setCourseRequestModalOpen(false)}
                  className="min-h-[36px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-semibold text-stone-700"
                >
                  Hủy
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
                  <span>Gửi đề nghị</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
