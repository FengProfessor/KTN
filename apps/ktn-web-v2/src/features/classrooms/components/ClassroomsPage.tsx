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
      DEMO_CLASSES.find((c) => c.id === activeClassCode) ||
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

  return (
    <div data-testid="classrooms-page" className="space-y-6">
      {/* Section 1: Clear Separation Between Live Classroom & Video Courses */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Live Classroom Card (7 cols) */}
        <div
          data-testid="live-classroom-card"
          className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:col-span-7"
        >
          {assignedClass ? (
            <>
              <div>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-900">
                    <Users className="h-3.5 w-3.5 text-red-800" />
                    LỚP HỌC TRỰC TIẾP CÙNG GIÁO VIÊN
                  </span>
                  <span className="rounded-lg bg-stone-100 px-2.5 py-1 font-mono text-xs font-bold text-stone-700">
                    Mã lớp: {assignedClass.id}
                  </span>
                </div>

                <h1 className="mt-3 font-display text-xl font-bold text-stone-900">
                  {assignedClass.name}
                </h1>

                <div className="mt-3 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <GraduationCap className="h-5 w-5 shrink-0 text-red-800" />
                    <div>
                      <p className="text-[11px] text-stone-500">Giáo viên chủ nhiệm</p>
                      <p className="text-xs font-bold text-stone-900">
                        {assignedClass.teacher_name || 'Cô Lâm Mỹ Linh'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
                    <Calendar className="h-5 w-5 shrink-0 text-amber-700" />
                    <div>
                      <p className="text-[11px] text-stone-500">Lịch học cố định</p>
                      <p className="text-xs font-bold text-stone-900">
                        {assignedClass.schedule || '19:30 Thứ 3 & Thứ 6'}
                      </p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2.5 border-t border-stone-100 pt-4">
                <button
                  type="button"
                  onClick={() => navigate(`/chat?room=class:${assignedClass.id}`)}
                  className="inline-flex items-center gap-2 rounded-xl bg-red-800 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-red-900"
                >
                  <MessageSquare className="h-4 w-4" />
                  Vào phòng Chat Zalo lớp {assignedClass.id}
                </button>
              </div>
            </>
          ) : (
            /* Honest Empty State when student is NOT assigned to any live class */
            <div
              data-testid="unassigned-class-empty-state"
              className="flex flex-col items-start justify-center py-4"
            >
              <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900">
                <AlertCircle className="h-3.5 w-3.5" />
                CHƯA XẾP LỚP TRỰC TIẾP
              </span>
              <h2 className="mt-2 font-display text-lg font-bold text-stone-900">
                Tài khoản hiện chưa được phân vào lớp trực tiếp
              </h2>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                Con vẫn có thể tự học các khóa học Video đã mở khóa hoặc nhắn tin cho bộ phận Học vụ để được xếp lịch học cùng Lão sư.
              </p>
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
              >
                <MessageSquare className="h-4 w-4" />
                Nhắn Học vụ xếp lớp
              </button>
            </div>
          )}
        </div>

        {/* Self-Paced Video Courses Card (5 cols) */}
        <div
          data-testid="video-courses-summary-card"
          className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-gradient-to-br from-stone-900 via-red-950 to-stone-900 p-5 text-white shadow-sm lg:col-span-5"
        >
          <div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-300">
              <PlayCircle className="h-3.5 w-3.5" />
              KHÓA HỌC VIDEO TỰ HỌC (HLS)
            </span>
            <h2 className="mt-3 font-display text-lg font-bold">
              Giáo trình Video đã mở khóa ({entitledCourses.length})
            </h2>
            <p className="mt-1 text-xs text-stone-300">
              Xem lại bài giảng chuẩn HD và nghe file MP3 bất cứ lúc nào để ôn bài trước và sau giờ học trên lớp.
            </p>

            <div className="mt-3 space-y-2">
              {entitledCourses.length === 0 ? (
                <div className="rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-stone-300">
                  Chưa có học phần Video nào được kích hoạt trên tài khoản này.
                </div>
              ) : (
                entitledCourses.map((c) => (
                  <div
                    key={c.id}
                    className="flex items-center justify-between rounded-xl border border-white/15 bg-white/10 px-3.5 py-2.5"
                  >
                    <div>
                      <p className="text-xs font-bold text-amber-200">{c.title}</p>
                      <p className="text-[11px] text-stone-300">
                        Đầy đủ video bài giảng + file nghe MP3
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => navigate(`/learning?courseId=${encodeURIComponent(c.id)}`)}
                      className="rounded-lg bg-amber-400 px-3 py-1.5 text-xs font-bold text-stone-950 hover:bg-amber-300"
                    >
                      Vào học
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="mt-4 border-t border-white/10 pt-3 text-[11px] text-stone-300">
            Mẹo học tốt: Xem video trước buổi học 15 phút giúp con nhớ ngay 80% từ vựng trên lớp!
          </div>
        </div>
      </div>

      {/* Section 2: Classroom Sessions & Assigned Exercises */}
      {assignedClass && (
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-4">
            <div>
              <h2 className="font-display text-base font-bold text-stone-900 sm:text-lg">
                Lộ trình các buổi học & Bài tập lớp {assignedClass.id}
              </h2>
              <p className="text-xs text-stone-500">
                Chọn từng buổi học để xem tóm tắt kiến thức trên lớp và các bài tập Lão sư đã giao.
              </p>
            </div>
            <span className="rounded-full bg-stone-100 px-3 py-1 text-xs font-bold text-stone-700">
              Tổng số: {sessions.length} buổi đã cập nhật
            </span>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-12">
            {/* Session Timeline Selector (4 cols) */}
            <div className="space-y-2 lg:col-span-4">
              {sessions.length === 0 ? (
                <p className="rounded-xl bg-stone-50 p-4 text-xs text-stone-500">
                  Giáo viên đang cập nhật lịch trình buổi học cho lớp.
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
                      className={`flex w-full items-start gap-3 rounded-xl border p-3.5 text-left transition-all ${
                        isSelected
                          ? 'border-red-300 bg-red-50/90 shadow-2xs'
                          : 'border-stone-200 bg-white hover:bg-stone-50'
                      }`}
                    >
                      <div
                        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl font-display text-xs font-bold ${
                          isSelected
                            ? 'bg-red-800 text-white'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        B{sNum}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-stone-900">
                          {session.title || session.session_title}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          {session.exercises?.length || 0} bài tập được giao
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
                <div className="rounded-2xl border border-stone-200 bg-stone-50/70 p-4 sm:p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span
                      data-testid="active-session-badge"
                      className="rounded-md bg-red-800 px-2.5 py-0.5 text-[11px] font-bold text-white"
                    >
                      BUỔI {activeSession.sessionNum || activeSession.session_num}
                    </span>
                    <span className="text-xs font-semibold text-stone-600">
                      GV: {assignedClass.teacher_name}
                    </span>
                  </div>

                  <h3 className="mt-2 font-display text-base font-bold text-stone-900">
                    {activeSession.title || activeSession.session_title}
                  </h3>
                  {activeSession.summary && (
                    <p className="mt-1 text-xs leading-relaxed text-stone-700">
                      {activeSession.summary}
                    </p>
                  )}

                  {/* Exercises List */}
                  <div className="mt-4 space-y-3">
                    <h4 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-stone-700">
                      <FileCheck2 className="h-4 w-4 text-red-800" />
                      Danh sách bài tập được giao ({activeSession.exercises?.length || 0})
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
                        <div key={ex.id || exNum} className="space-y-3">
                          <div
                            data-testid={`classroom-exercise-${liveLessonNum}`}
                            className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs"
                          >
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
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
                              <p className="mt-1 text-xs text-stone-600">
                                {ex.prompt || ex.instruction}
                              </p>
                            </div>

                            <button
                              type="button"
                              data-testid={`classroom-open-hw-btn-${liveLessonNum}`}
                              onClick={() =>
                                setActiveExerciseLessonNum(isDrawerOpen ? null : liveLessonNum)
                              }
                              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
                            >
                              <BookOpen className="h-3.5 w-3.5" />
                              <span>
                                {isDrawerOpen
                                  ? 'Đóng khung nộp bài'
                                  : matchedHw
                                  ? 'Xem bài nộp / Điểm'
                                  : 'Làm bài & Nộp ngay'}
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

