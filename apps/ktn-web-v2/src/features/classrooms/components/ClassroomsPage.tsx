import React, { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Calendar,
  BookOpen,
  PlayCircle,
  MessageSquare,
  CheckCircle2,
  Clock,
  FileCheck2,
  GraduationCap,
  Sparkles,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { HomeworkPanel } from '@/features/learning/components/HomeworkPanel';
import {
  DEMO_CLASSES,
  DEMO_CLASS_SESSIONS,
  DEMO_COURSES,
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

  const [selectedSessionNum, setSelectedSessionNum] = useState<number>(() => {
    const p = Number(searchParams.get('session'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [activeExerciseLessonNum, setActiveExerciseLessonNum] = useState<number | null>(null);

  useEffect(() => {
    const p = Number(searchParams.get('session'));
    if (Number.isFinite(p) && p > 0) {
      setSelectedSessionNum(p);
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

  const activeClassCode =
    user?.classCode || (isDemoMode ? 'YCT2-04' : '');

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

  const submitLiveClassHwMutation = useMutation({
    mutationFn: async (payload: {
      lessonNum: number;
      lessonTitle: string;
      studentNote: string;
      file: File | Blob;
      fileName: string;
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
            file_url: 'https://d21acfi38wn3iy.cloudfront.net/demo-live.wav',
            file_type: 'audio/wav',
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

      const up = await ktnApi.uploadHomeworkFile(payload.file, payload.fileName);
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

  const entitledCourses = isDemoMode
    ? DEMO_COURSES
    : user?.onlineCourses && user.onlineCourses.length > 0
    ? user.onlineCourses
    : [];

  const hasApiError =
    !isDemoMode && (classesQuery.isError || sessionsQuery.isError || homeworksQuery.isError);

  return (
    <div data-testid="classrooms-page" className="space-y-3 sm:space-y-4">
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

      {/* Section 1: Clear Separation Between Live Classroom & Video Courses */}
      <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
        {/* Live Classroom Card (7 cols) */}
        <div
          data-testid="live-classroom-card"
          className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-7"
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

                <h1 className="mt-2 font-display text-base font-bold text-stone-900 sm:text-lg">
                  {assignedClass.name}
                </h1>

                <div className="mt-2.5 grid grid-cols-2 gap-2">
                  <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                    <GraduationCap className="h-4 w-4 shrink-0 text-red-800" />
                    <div className="min-w-0">
                      <p className="text-[10.5px] text-stone-500">Giáo viên</p>
                      <p className="truncate text-xs font-bold text-stone-900">
                        {assignedClass.teacher_name || 'Cô Lâm Mỹ Linh'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5">
                    <Calendar className="h-4 w-4 shrink-0 text-amber-700" />
                    <div className="min-w-0">
                      <p className="text-[10.5px] text-stone-500">Lịch học chính thức</p>
                      <p
                        data-testid="student-classroom-schedule-text"
                        className="truncate text-xs font-bold text-stone-900"
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
                          Xem buổi học →
                        </a>
                      )}
                  </div>
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                <button
                  type="button"
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
              className="flex flex-col items-start justify-center py-2"
            >
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                <AlertCircle className="h-3.5 w-3.5" />
                CHƯA XẾP LỚP TRỰC TIẾP
              </span>
              <h2 className="mt-1.5 font-display text-sm font-bold text-stone-900 sm:text-base">
                Chưa xếp lớp trực tiếp
              </h2>
              <p className="mt-0.5 text-xs text-stone-600">
                Tự học khóa Video đã mở hoặc nhắn Học vụ để xếp lịch học cùng giáo viên.
              </p>
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className="mt-3 inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                Nhắn Học vụ xếp lớp
              </button>
            </div>
          )}
        </div>

        {/* Self-Paced Video Courses Card (5 cols) */}
        <div
          data-testid="video-courses-summary-card"
          className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-900 via-red-950 to-stone-900 p-4 text-white shadow-2xs lg:col-span-5"
        >
          <div>
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[11px] font-bold text-amber-300">
              <PlayCircle className="h-3.5 w-3.5" />
              KHÓA VIDEO TỰ HỌC
            </span>
            <h2 className="mt-2 font-display text-sm font-bold sm:text-base">
              Khóa học đã mở ({entitledCourses.length})
            </h2>

            <div className="mt-2.5 space-y-2">
              {entitledCourses.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-2.5 text-xs text-stone-300">
                  Chưa có học phần Video nào được kích hoạt.
                </div>
              ) : (
                entitledCourses.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-white/15 bg-white/10 px-3 py-2"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-amber-200">{c.title}</p>
                      <p className="text-[11px] text-stone-300">Video + MP3</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/learning?courseId=${encodeURIComponent(c.id)}`)}
                      className="min-h-[34px] shrink-0 rounded-lg bg-amber-400 px-3 py-1 text-xs font-bold text-stone-950 hover:bg-amber-300"
                    >
                      Vào học
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Section 2: Classroom Sessions & Assigned Exercises */}
      {assignedClass && (
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-3">
            <h2 className="font-display text-sm font-bold text-stone-900 sm:text-base">
              Buổi học & Bài tập lớp {assignedClass.id}
            </h2>
            <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-[11px] font-bold text-stone-700">
              {sessions.length} buổi
            </span>
          </div>

          <div className="mt-3 grid grid-cols-1 gap-3.5 lg:grid-cols-12">
            {/* Session Timeline Selector (4 cols) */}
            <div className="space-y-1.5 lg:col-span-4">
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
                      }}
                      className={`flex w-full items-center gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                        isSelected
                          ? 'border-red-300 bg-red-50/90 shadow-2xs'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg font-display text-xs font-bold ${
                          isSelected
                            ? 'bg-red-800 text-white'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        B{sNum}
                      </div>
                      <div className="min-w-0 flex-1">
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
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="active-session-badge"
                      className="rounded-md bg-red-800 px-2 py-0.5 text-[10.5px] font-bold text-white"
                    >
                      BUỔI {activeSession.sessionNum || activeSession.session_num}
                    </span>
                    <span className="text-xs font-semibold text-stone-600">
                      GV: {assignedClass.teacher_name}
                    </span>
                  </div>

                  <h3 className="mt-1.5 font-display text-sm font-bold text-stone-900 sm:text-base">
                    {activeSession.title || activeSession.session_title}
                  </h3>
                  {activeSession.summary && (
                    <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-700">
                      {activeSession.summary}
                    </p>
                  )}

                  {/* Exercises List */}
                  <div className="mt-3 space-y-2.5">
                    <h4 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-stone-700">
                      <FileCheck2 className="h-3.5 w-3.5 text-red-800" />
                      Bài tập được giao ({activeSession.exercises?.length || 0})
                    </h4>

                    {(activeSession.exercises || []).map((ex, idx) => {
                      const sNum = Number(activeSession.sessionNum || activeSession.session_num || 1);
                      const exNum = Number(ex.num || idx + 1);
                      const liveLessonNum = sNum * 100 + exNum;
                      const liveCourseId = `CLASS_${assignedClass.id.toUpperCase()}`;

                      // Section 10.4 Fix: Match ONLY live-classroom homework for this class & session/exercise, NEVER video-course homework
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

                      return (
                        <div key={ex.id || exNum} className="space-y-2.5">
                          <div
                            data-testid={`classroom-exercise-${liveLessonNum}`}
                            className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-white p-3 shadow-2xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-1.5">
                                <p className="text-xs font-bold text-stone-900">{ex.title}</p>
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
                              <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">
                                {ex.prompt || ex.instruction}
                              </p>
                            </div>

                            <button
                              type="button"
                              data-testid={`classroom-open-hw-btn-${liveLessonNum}`}
                              onClick={() =>
                                setActiveExerciseLessonNum(isDrawerOpen ? null : liveLessonNum)
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

                          {isDrawerOpen && (
                            <HomeworkPanel
                              key={`${liveCourseId}:${liveLessonNum}`}
                              courseId={liveCourseId}
                              lessonNum={liveLessonNum}
                              lessonTitle={`Lớp ${assignedClass.id} · Buổi ${sNum} · ${ex.title}`}
                              classCode={assignedClass.id}
                              existingSubmission={matchedHw || null}
                              isSubmitting={submitLiveClassHwMutation.isPending}
                              onSubmitHomework={async ({ file, fileName, note }) => {
                                await submitLiveClassHwMutation.mutateAsync({
                                  lessonNum: liveLessonNum,
                                  lessonTitle: `Lớp ${assignedClass.id} · Buổi ${sNum} · ${ex.title}`,
                                  studentNote: note,
                                  file,
                                  fileName,
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
    </div>
  );
};

