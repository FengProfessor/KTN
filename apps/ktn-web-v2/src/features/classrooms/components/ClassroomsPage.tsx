import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Calendar,
  BookOpen,
  MessageSquare,
  CheckCircle2,
  Clock,
  FileCheck2,
  GraduationCap,
  Sparkles,
  AlertCircle,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  Paperclip,
  FileText,
  Download,
  ZoomIn,
  X,
} from 'lucide-react';
import {
  ktnApi,
  resolveUploadedMediaUrl,
  formatBytes,
  type KtnExerciseAttachment,
} from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { HomeworkPanel } from '@/features/learning/components/HomeworkPanel';
import {
  DEMO_CLASSES,
  DEMO_CLASS_SESSIONS,
  DEMO_HOMEWORKS,
} from '@/lib/demoData';
import { KtnClassItem, KtnClassSession, KtnHomework } from '@/types/ktn.types';

export const ClassroomsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const sessionParam = Number(searchParams.get('session'));
  const exerciseParam = Number(searchParams.get('exercise'));
  const hasDeepLinkSession =
    (Number.isFinite(sessionParam) && sessionParam > 0) ||
    (Number.isFinite(exerciseParam) && exerciseParam >= 100);

  const [selectedSessionNum, setSelectedSessionNum] = useState<number>(() => {
    if (Number.isFinite(sessionParam) && sessionParam > 0) return sessionParam;
    if (Number.isFinite(exerciseParam) && exerciseParam >= 100) {
      return Math.floor(exerciseParam / 100);
    }
    return 1;
  });
  const [activeExerciseLessonNum, setActiveExerciseLessonNum] = useState<number | null>(() => {
    if (Number.isFinite(exerciseParam) && exerciseParam >= 100) return exerciseParam;
    return null;
  });
  const [mobileSessionsExpanded, setMobileSessionsExpanded] = useState<boolean>(false);
  const [previewAttachment, setPreviewAttachment] =
    useState<KtnExerciseAttachment | null>(null);
  const didAutoSelectSessionRef = useRef<boolean>(false);

  useEffect(() => {
    const sParam = Number(searchParams.get('session'));
    const exParam = Number(searchParams.get('exercise'));
    if (Number.isFinite(sParam) && sParam > 0) {
      setSelectedSessionNum(sParam);
    } else if (Number.isFinite(exParam) && exParam >= 100) {
      setSelectedSessionNum(Math.floor(exParam / 100));
    }
    if (Number.isFinite(exParam) && exParam >= 100) {
      setActiveExerciseLessonNum(exParam);
    }
  }, [searchParams]);

  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const urlClassParam = (
    searchParams.get('class') ||
    searchParams.get('classCode') ||
    ''
  )
    .trim()
    .toUpperCase();

  const studentOwnClassCode = String(
    user?.classCode || (isDemoMode ? 'YCT2-04' : '')
  )
    .trim()
    .toUpperCase();
  const isCrossClassBlockedForStudent =
    user?.role === 'student' &&
    Boolean(urlClassParam) &&
    Boolean(studentOwnClassCode) &&
    urlClassParam !== studentOwnClassCode;

  const activeClassCode =
    user?.role === 'teacher' || user?.role === 'admin'
      ? urlClassParam ||
        user?.assignedClasses?.[0] ||
        user?.classCode ||
        (isDemoMode ? 'YCT2-04' : '')
      : studentOwnClassCode;

  const sessionsQuery = useQuery<KtnClassSession[]>({
    queryKey: ['ktn-class-sessions', activeClassCode, user?.email, isDemoMode],
    queryFn: async () => {
      if (!activeClassCode) return [];
      if (isDemoMode) return DEMO_CLASS_SESSIONS;
      return ktnApi.getClassSessions(activeClassCode);
    },
    enabled: Boolean(activeClassCode) && (Boolean(user) || isDemoMode),
  });

  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const attendanceQuery = useQuery({
    queryKey: ['ktn-student-attendance', activeClassCode, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode || !activeClassCode) {
        return {
          ok: true,
          classCode: activeClassCode,
          sessionNum: null,
          records: [],
          summary: { total: 1, present: 1, late: 0, absentExcused: 0, absentUnexcused: 0 },
        };
      }
      return ktnApi.getAttendance({ classCode: activeClassCode });
    },
    enabled: Boolean(activeClassCode) && (Boolean(user) || isDemoMode),
  });

  // Default to the nearest session with unsubmitted homework or exercises/content when no deep-link is in the URL
  useEffect(() => {
    if (hasDeepLinkSession || didAutoSelectSessionRef.current) return;
    const list = sessionsQuery.data || [];
    if (list.length === 0) return;
    didAutoSelectSessionRef.current = true;
    const liveCourseId = `CLASS_${String(activeClassCode || '').toUpperCase()}`;
    const hws = homeworksQuery.data || [];
    const withUnsubmitted = list.find((s) => {
      const sNum = Number(s.sessionNum || s.session_num || 1);
      const exs = s.exercises || [];
      if (exs.length === 0) return false;
      return exs.some((ex, idx) => {
        const exNum = Number(ex.num || idx + 1);
        const liveLessonNum = sNum * 100 + exNum;
        const matched = hws.find(
          (h) =>
            String(h.course_id || '').trim().toUpperCase() === liveCourseId &&
            (Number(h.lesson_num) === liveLessonNum ||
              (exNum === 1 && Number(h.lesson_num) === sNum))
        );
        return !matched || matched.status === 'revision_requested';
      });
    });
    const targetSession =
      withUnsubmitted ||
      list.find((s) => (s.exercises && s.exercises.length > 0) || Boolean(s.summary));
    if (targetSession) {
      const sNum = Number(targetSession.sessionNum || targetSession.session_num || 1);
      setSelectedSessionNum(sNum);
    }
  }, [hasDeepLinkSession, sessionsQuery.data, homeworksQuery.data, activeClassCode]);

  const submitLiveClassHwMutation = useMutation({
    mutationFn: async (payload: {
      lessonNum: number;
      lessonTitle: string;
      studentNote: string;
      file?: File | Blob | null;
      fileName?: string;
      submissionMode?: 'file' | 'text';
      textAnswer?: string;
    }) => {
      const liveCourseId = `CLASS_${activeClassCode}`;
      if (isDemoMode) {
        return {
          homework: {
            id: 'HW-LIVE-DEMO-' + Date.now(),
            student_email: user?.email || 'demo@khongtunhi.com',
            student_name: user?.name || 'Học viên Demo',
            class_code: activeClassCode,
            course_id: liveCourseId,
            lesson_num: payload.lessonNum,
            lesson_title: payload.lessonTitle,
            file_url: payload.file ? 'https://d21acfi38wn3iy.cloudfront.net/demo-live.wav' : '',
            file_type: payload.file ? 'audio/wav' : 'text/plain',
            student_note: payload.studentNote,
            status: 'pending' as const,
            score: null,
            teacher_feedback: '',
            submitted_at: new Date().toISOString(),
          },
          syncStatus: 'local_classroom_only',
          mirroredToIzTeach: false,
        };
      }

      if (!payload.file || payload.submissionMode === 'text') {
        return ktnApi.submitHomework({
          courseId: liveCourseId,
          lessonNum: payload.lessonNum,
          lessonTitle: payload.lessonTitle,
          classCode: activeClassCode,
          fileUrl: '',
          fileType: 'text/plain',
          studentNote: payload.studentNote,
          textAnswer: payload.textAnswer || payload.studentNote,
          submissionMode: 'text',
        });
      }

      const up = await ktnApi.uploadHomeworkFile(
        payload.file,
        payload.fileName || `btvn-lop-${activeClassCode}-${payload.lessonNum}.dat`
      );
      const uploadedUrl = up.fileUrl;
      const uploadedType = up.fileType;

      return ktnApi.submitHomework({
        courseId: liveCourseId,
        lessonNum: payload.lessonNum,
        lessonTitle: payload.lessonTitle,
        classCode: activeClassCode,
        fileUrl: uploadedUrl,
        fileType: uploadedType,
        studentNote: payload.studentNote,
        submissionMode: 'file',
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
      addToast({
        title: 'Đã nộp bài tập lớp trực tiếp',
        description: `Bài làm đã gửi tới Giáo viên lớp ${activeClassCode}.`,
        variant: 'success',
      });
    },
  });

  // Never display a fake class if user has no assigned class in live mode
  const assignedClass: KtnClassItem | null = activeClassCode
    ? (classesQuery.data || []).find((c) => c.id === activeClassCode) ||
      (isDemoMode ? DEMO_CLASSES.find((c) => c.id === activeClassCode) : null) ||
      null
    : null;

  const sessions = sessionsQuery.data || [];
  const activeSession =
    sessions.find((s) => Number(s.sessionNum || s.session_num) === Number(selectedSessionNum)) ||
    sessions[0] ||
    null;

  const hasApiError =
    !isDemoMode && (classesQuery.isError || sessionsQuery.isError || homeworksQuery.isError);

  return (
    <div data-testid="classrooms-page" className="space-y-3 pb-16 sm:space-y-4 sm:pb-6">
      {isCrossClassBlockedForStudent && (
        <div
          role="alert"
          data-testid="student-cross-class-blocked-alert"
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-950"
        >
          <AlertCircle className="h-4 w-4 shrink-0 text-amber-800" />
          <span>
            Bạn không có quyền truy cập tài liệu của lớp {urlClassParam}. Hệ thống đang hiển thị lớp {studentOwnClassCode} của bạn.
          </span>
        </div>
      )}
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
              sessionsQuery.refetch();
              homeworksQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Section 1: Strictly Live Classroom Info (No Video Course Promotions) */}
      <div
        data-testid="live-classroom-card"
        className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs sm:p-4"
      >
        {assignedClass ? (
          <>
            <div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-900">
                  <Users className="h-3.5 w-3.5 text-red-800" />
                  LỚP TRỰC TIẾP
                </span>
                <span className="rounded-lg bg-stone-100 px-2 py-0.5 font-mono text-xs font-bold text-stone-700">
                  Mã lớp: {assignedClass.id}
                </span>
              </div>

              <h1 className="mt-1.5 font-display text-base font-bold text-stone-900 sm:text-lg">
                {assignedClass.name}
              </h1>

              <div className="mt-2.5 grid grid-cols-2 gap-2">
                <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 sm:p-2.5">
                  <GraduationCap className="mt-0.5 h-4 w-4 shrink-0 text-red-800" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] text-stone-500">Giáo viên phụ trách</p>
                    <p className="break-words text-xs font-bold text-stone-900">
                      {assignedClass.teacher_name || 'Chưa phân công giáo viên'}
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2 sm:p-2.5">
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10.5px] text-stone-500">Lịch học chính thức</p>
                    <p
                      data-testid="student-classroom-schedule-text"
                      className="break-words text-xs font-bold text-stone-900"
                    >
                      {assignedClass.scheduleStatus === 'confirmed' &&
                      assignedClass.officialScheduleText
                        ? assignedClass.officialScheduleText
                        : 'Chưa có lịch học chính thức'}
                    </p>
                  </div>
                </div>
              </div>

              {assignedClass.nextSession && (
                <div
                  data-testid="student-classroom-next-session-banner"
                  className="mt-2.5 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3 py-2 text-xs"
                >
                  <div>
                    <p className="font-bold text-emerald-950">
                      Buổi học tiếp theo: {assignedClass.nextSession.dayLabel},{' '}
                      {assignedClass.nextSession.sessionDate} ({assignedClass.nextSession.startTime}–
                      {assignedClass.nextSession.endTime})
                    </p>
                    {assignedClass.nextSession.note && (
                      <p className="text-[11px] text-emerald-800">
                        {assignedClass.nextSession.note}
                      </p>
                    )}
                  </div>
                  {assignedClass.nextSession.meetingUrl &&
                    /^https:\/\//i.test(assignedClass.nextSession.meetingUrl) && (
                      <a
                        href={assignedClass.nextSession.meetingUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-testid="student-classroom-join-meeting-btn"
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-900"
                      >
                        Vào phòng học →
                      </a>
                    )}
                </div>
              )}
            </div>

            <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5">
              <button
                type="button"
                data-testid="classroom-open-chat-btn"
                onClick={() => navigate(`/chat?room=class:${assignedClass.id}`)}
                className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Chat lớp {assignedClass.id}
              </button>

              {attendanceQuery.data?.summary && (
                <span
                  data-testid="student-attendance-summary-badge"
                  className="inline-flex items-center gap-1 rounded-xl bg-emerald-50 px-2.5 py-1.5 text-xs font-bold text-emerald-900"
                >
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                  Chuyên cần: {attendanceQuery.data.summary.present + attendanceQuery.data.summary.late}/
                  {Math.max(1, attendanceQuery.data.summary.total)} buổi
                </span>
              )}
            </div>
          </>
        ) : (
          /* Honest Empty State when student is NOT assigned to any live class */
          <div
            data-testid="unassigned-class-empty-state"
            className="flex flex-col items-start justify-center py-3"
          >
            <p className="font-display text-sm font-bold text-stone-900 sm:text-base">
              Em chưa được xếp vào lớp học trực tiếp.
            </p>
            <button
              type="button"
              data-testid="unassigned-class-contact-btn"
              onClick={() => navigate('/chat')}
              className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              Liên hệ Học vụ
            </button>
          </div>
        )}
      </div>

      {/* Section 2: Classroom Sessions & Assigned Exercises */}
      {assignedClass && (
        <div className="rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs sm:p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
            <div>
              <h2 className="font-display text-sm font-bold text-stone-900 sm:text-base">
                Buổi học & Bài tập lớp {assignedClass.id}
              </h2>
              {activeSession && (
                <p className="text-[11px] font-medium text-stone-500 lg:hidden">
                  Đang xem: Buổi {activeSession.sessionNum || activeSession.session_num} —{' '}
                  {activeSession.title || activeSession.session_title}
                </p>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
                {sessions.length} buổi
              </span>
              {sessions.length > 1 && (
                <button
                  type="button"
                  data-testid="toggle-mobile-session-list-btn"
                  onClick={() => setMobileSessionsExpanded((prev) => !prev)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-700 lg:hidden"
                >
                  <span>{mobileSessionsExpanded ? 'Thu gọn buổi' : 'Chọn buổi học'}</span>
                  {mobileSessionsExpanded ? (
                    <ChevronUp className="h-3.5 w-3.5" />
                  ) : (
                    <ChevronDown className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            {/* Session Timeline Selector: Compact horizontal strip on mobile (unless expanded), full list on desktop */}
            <div
              data-testid="classroom-session-selector"
              className={
                mobileSessionsExpanded
                  ? 'max-h-60 space-y-1.5 overflow-y-auto lg:col-span-4 lg:max-h-none lg:overflow-visible'
                  : 'flex items-center gap-1.5 overflow-x-auto pb-1 lg:col-span-4 lg:block lg:space-y-1.5 lg:overflow-visible lg:pb-0'
              }
            >
              {sessions.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-3 text-xs text-stone-500">
                  Chưa có buổi học nào được cập nhật.
                </p>
              ) : (
                sessions.map((session) => {
                  const sNum = session.sessionNum || session.session_num || 1;
                  const activeNum = activeSession?.sessionNum || activeSession?.session_num || 1;
                  const isSelected = Number(sNum) === Number(activeNum);
                  return (
                    <button
                      key={session.id || sNum}
                      type="button"
                      data-testid={`session-item-${sNum}`}
                      onClick={() => {
                        setSelectedSessionNum(sNum);
                        setActiveExerciseLessonNum(null);
                        setMobileSessionsExpanded(false);
                      }}
                      className={`flex items-center gap-2 rounded-xl border text-left transition-all ${
                        mobileSessionsExpanded
                          ? 'w-full p-2.5'
                          : 'shrink-0 px-2.5 py-1.5 lg:w-full lg:p-2.5'
                      } ${
                        isSelected
                          ? 'border-red-300 bg-red-50/90 shadow-2xs'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold lg:h-8 lg:w-8 ${
                          isSelected
                            ? 'bg-red-800 text-white'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        B{sNum}
                      </div>
                      <div
                        className={`min-w-0 flex-1 ${
                          mobileSessionsExpanded ? 'block' : 'hidden lg:block'
                        }`}
                      >
                        <p className="truncate text-xs font-bold text-stone-900">
                          {session.title || session.session_title}
                        </p>
                        <p className="text-[11px] text-stone-500">
                          {session.exercises?.length || 0} bài tập
                        </p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            {/* Active Session Details & Exercises (8 cols) */}
            <div className="lg:col-span-8">
              {activeSession ? (
                <div className="rounded-xl bg-stone-50/50 p-2.5 sm:rounded-2xl sm:border sm:border-stone-200 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="active-session-badge"
                      className="rounded-md bg-red-800 px-2 py-0.5 text-[10.5px] font-bold text-white"
                    >
                      BUỔI {activeSession.sessionNum || activeSession.session_num}
                    </span>
                    <span className="text-xs font-semibold text-stone-600">
                      GV: {assignedClass.teacher_name || 'Chưa phân công giáo viên'}
                    </span>
                  </div>

                  <h3 className="mt-1.5 font-display text-sm font-bold text-stone-900 sm:text-base">
                    {activeSession.title || activeSession.session_title}
                  </h3>
                  {activeSession.summary && (
                    <p className="mt-1 text-xs leading-relaxed text-stone-700">
                      {activeSession.summary}
                    </p>
                  )}

                  {/* Exercises List */}
                  <div className="mt-3 space-y-2.5">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-700">
                      <FileCheck2 className="h-3.5 w-3.5 text-red-800" />
                      Bài tập được giao (
                      {
                        (activeSession.exercises || []).filter(
                          (ex) => user?.role !== 'student' || ex.status !== 'draft'
                        ).length
                      }
                      )
                    </h4>

                    {(activeSession.exercises || [])
                      .filter((ex) => user?.role !== 'student' || ex.status !== 'draft')
                      .map((ex, idx) => {
                        const sNum = Number(
                          activeSession.sessionNum || activeSession.session_num || 1
                        );
                        const exNum = Number(ex.num || idx + 1);
                        const liveLessonNum = sNum * 100 + exNum;
                        const liveCourseId = `CLASS_${assignedClass.id.toUpperCase()}`;

                        // Match ONLY live-classroom homework for this class & session/exercise, NEVER video-course homework
                        const matchedHw = (homeworksQuery.data || []).find((h) => {
                          const hCourseId = String(h.course_id || '').trim().toUpperCase();
                          const isSameLiveClass =
                            hCourseId === liveCourseId ||
                            (!hCourseId &&
                              String(h.class_code || '').trim().toUpperCase() ===
                                assignedClass.id.toUpperCase());
                          if (!isSameLiveClass) return false;
                          return (
                            Number(h.lesson_num) === liveLessonNum ||
                            (exNum === 1 && Number(h.lesson_num) === sNum)
                          );
                        });

                        const isDrawerOpen = activeExerciseLessonNum === liveLessonNum;
                        const teacherAttachments = Array.isArray(ex.attachments)
                          ? ex.attachments
                          : [];

                        return (
                          <div key={ex.id || exNum} className="space-y-2">
                            <div
                              data-testid={`classroom-exercise-${liveLessonNum}`}
                              className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3 shadow-2xs"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2.5">
                                <div className="min-w-0 flex-1">
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    <p className="text-xs font-bold text-stone-900">
                                      {ex.title}
                                    </p>
                                    {ex.dueDate && (
                                      <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-semibold text-stone-700">
                                        Hạn nộp: {ex.dueDate}
                                      </span>
                                    )}
                                    {matchedHw?.status === 'graded' ? (
                                      <span
                                        data-testid={`classroom-hw-status-${liveLessonNum}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800"
                                      >
                                        <CheckCircle2 className="h-3 w-3" />
                                        Đã chấm: {matchedHw.score}/10
                                      </span>
                                    ) : matchedHw ? (
                                      <span
                                        data-testid={`classroom-hw-status-${liveLessonNum}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-800"
                                      >
                                        <Clock className="h-3 w-3" />
                                        Đã nộp (Lớp {assignedClass.id})
                                      </span>
                                    ) : (
                                      <span
                                        data-testid={`classroom-hw-status-${liveLessonNum}`}
                                        className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900"
                                      >
                                        <Sparkles className="h-3 w-3" />
                                        Cần hoàn thành
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-0.5 text-xs text-stone-600">
                                    {ex.prompt || ex.instruction}
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  data-testid={`classroom-open-hw-btn-${liveLessonNum}`}
                                  onClick={() =>
                                    setActiveExerciseLessonNum(
                                      isDrawerOpen ? null : liveLessonNum
                                    )
                                  }
                                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                                >
                                  <BookOpen className="h-3.5 w-3.5" />
                                  <span>
                                    {isDrawerOpen
                                      ? 'Đóng'
                                      : matchedHw
                                        ? 'Xem bài nộp'
                                        : 'Nộp bài'}
                                  </span>
                                </button>
                              </div>

                              {/* C4: Teacher Exercise Attachments right below prompt (separate from student HomeworkPanel) */}
                              {teacherAttachments.length > 0 && (
                                <div
                                  data-testid={`student-exercise-attachments-block-${liveLessonNum}`}
                                  className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50/80 p-2.5"
                                >
                                  <p className="flex items-center gap-1.5 text-[11px] font-bold text-stone-800">
                                    <Paperclip className="h-3.5 w-3.5 text-red-800" />
                                    <span>
                                      Tài liệu đề bài từ giáo viên ({teacherAttachments.length}{' '}
                                      tệp)
                                    </span>
                                  </p>
                                  <div className="space-y-2">
                                    {teacherAttachments.map((att) => {
                                      const resolvedUrl = resolveUploadedMediaUrl(att.url);
                                      const mimeLower = (att.mimeType || '').toLowerCase();
                                      const nameLower = (att.name || '').toLowerCase();
                                      const isImage =
                                        mimeLower.startsWith('image/') ||
                                        /\.(jpg|jpeg|png|webp|gif)$/i.test(nameLower);
                                      const isPdf =
                                        mimeLower.includes('pdf') ||
                                        nameLower.endsWith('.pdf');
                                      const isAudio =
                                        mimeLower.startsWith('audio/') ||
                                        /\.(mp3|m4a|wav|aac|ogg)$/i.test(nameLower);
                                      const isVideo =
                                        mimeLower.startsWith('video/') ||
                                        /\.(mp4|mov|webm)$/i.test(nameLower);

                                      return (
                                        <div
                                          key={att.id}
                                          data-testid={`student-exercise-attachment-${att.id}`}
                                          className="space-y-2 rounded-lg border border-stone-200 bg-white p-2 text-xs"
                                        >
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <div className="flex min-w-0 flex-1 items-center gap-2">
                                              {isImage && resolvedUrl ? (
                                                <img
                                                  src={resolvedUrl}
                                                  alt={att.name}
                                                  className="h-9 w-9 shrink-0 rounded object-cover"
                                                />
                                              ) : (
                                                <FileText className="h-4 w-4 shrink-0 text-red-800" />
                                              )}
                                              <div className="min-w-0 flex-1">
                                                <p className="truncate font-bold text-stone-900">
                                                  {att.name}
                                                </p>
                                                <p className="text-[10px] text-stone-500">
                                                  {formatBytes(att.sizeBytes || 0)}
                                                </p>
                                              </div>
                                            </div>

                                            <div className="flex shrink-0 items-center gap-1.5">
                                              {(isImage || isPdf) && resolvedUrl && (
                                                <button
                                                  type="button"
                                                  data-testid={`student-preview-attachment-btn-${att.id}`}
                                                  onClick={() => setPreviewAttachment(att)}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-800 hover:bg-stone-50"
                                                >
                                                  <ZoomIn className="h-3.5 w-3.5" />
                                                  <span>
                                                    {isPdf ? 'Xem PDF' : 'Xem ảnh'}
                                                  </span>
                                                </button>
                                              )}
                                              {resolvedUrl && (
                                                <a
                                                  href={resolvedUrl}
                                                  download={att.name}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  data-testid={`student-download-attachment-btn-${att.id}`}
                                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
                                                >
                                                  <Download className="h-3.5 w-3.5" />
                                                  <span>Tải về</span>
                                                </a>
                                              )}
                                            </div>
                                          </div>

                                          {isAudio && resolvedUrl && (
                                            <audio
                                              controls
                                              src={resolvedUrl}
                                              data-testid={`student-exercise-audio-player-${att.id}`}
                                              className="h-9 w-full"
                                            />
                                          )}

                                          {isVideo && resolvedUrl && (
                                            <video
                                              controls
                                              src={resolvedUrl}
                                              data-testid={`student-exercise-video-player-${att.id}`}
                                              className="max-h-56 w-full rounded-lg bg-black"
                                            />
                                          )}
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}
                            </div>

                            {isDrawerOpen && (
                              <HomeworkPanel
                                key={`${liveCourseId}:${liveLessonNum}`}
                                courseId={liveCourseId}
                                lessonNum={liveLessonNum}
                                lessonTitle={`Lớp ${assignedClass.id} · Buổi ${sNum} · ${ex.title}`}
                                classCode={assignedClass.id}
                                homeworkAssignment={{
                                  assigned: true,
                                  mandatory: true,
                                  title: ex.title,
                                  instructions:
                                    ex.prompt ||
                                    ex.instruction ||
                                    'Hoàn thành bài luyện tập của buổi học.',
                                  allowedTypes:
                                    ex.submissionType === 'audio'
                                      ? ['audio', 'text']
                                      : ex.submissionType === 'text'
                                        ? ['text']
                                        : ex.submissionType === 'file'
                                          ? ['image', 'pdf', 'video', 'text']
                                          : ['audio', 'image', 'pdf', 'video', 'text'],
                                  deadline: ex.dueDate || null,
                                  maxFiles: 3,
                                }}
                                existingSubmission={matchedHw || null}
                                isSubmitting={submitLiveClassHwMutation.isPending}
                                onSubmitHomework={async ({
                                  file,
                                  fileName,
                                  note,
                                  submissionMode,
                                  textAnswer,
                                }) => {
                                  await submitLiveClassHwMutation.mutateAsync({
                                    lessonNum: liveLessonNum,
                                    lessonTitle: `Lớp ${assignedClass.id} · Buổi ${sNum} · ${ex.title}`,
                                    studentNote: note,
                                    file,
                                    fileName,
                                    submissionMode,
                                    textAnswer,
                                  });
                                }}
                              />
                            )}
                          </div>
                        );
                      })}
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* Student Exercise Attachment Preview Modal (Image / PDF) */}
      {previewAttachment && (
        <div
          data-testid="student-attachment-preview-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
        >
          <div className="w-full max-w-2xl rounded-2xl border border-stone-200 bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
              <div>
                <h3 className="font-display text-sm font-bold text-stone-900">
                  {previewAttachment.name}
                </h3>
                <p className="text-[11px] text-stone-500">
                  {formatBytes(previewAttachment.sizeBytes || 0)}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng xem trước tài liệu"
                onClick={() => setPreviewAttachment(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-3 max-h-[70vh] overflow-auto">
              {(previewAttachment.mimeType || '').toLowerCase().startsWith('image/') ||
              /\.(jpg|jpeg|png|webp|gif)$/i.test(previewAttachment.name) ? (
                <img
                  src={resolveUploadedMediaUrl(previewAttachment.url)}
                  alt={previewAttachment.name}
                  className="mx-auto max-h-[60vh] rounded-xl object-contain"
                />
              ) : (
                <iframe
                  title={previewAttachment.name}
                  src={resolveUploadedMediaUrl(previewAttachment.url)}
                  className="h-[60vh] w-full rounded-xl border border-stone-200"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};


