import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  CheckCircle2,
  BookOpen,
  Headphones,
  FileCheck2,
  ChevronRight,
  Volume2,
  ListVideo,
  MessageSquare,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { HlsVideoPlayer, VideoPlayerStatus } from './HlsVideoPlayer';
import { HomeworkPanel } from './HomeworkPanel';
import { KtnApiError, ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { DEMO_COURSES, DEMO_HOMEWORKS, DEMO_LESSONS } from '@/lib/demoData';
import { KtnCourse, KtnHomework, KtnLessonUnit } from '@/types/ktn.types';

export const LearningPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const videoDemoScenario = useUiStore((s) => s.videoDemoScenario);
  const setVideoDemoScenario = useUiStore((s) => s.setVideoDemoScenario);
  const completedLessons = useUiStore((s) => s.completedLessons);
  const toggleLessonCompleted = useUiStore((s) => s.toggleLessonCompleted);
  const addToast = useUiStore((s) => s.addToast);

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    () => searchParams.get('courseId') || '6adadba969897b0002482ca5'
  );
  const [selectedLessonNum, setSelectedLessonNum] = useState<number>(() => {
    const p = Number(searchParams.get('lesson'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [activeTab, setActiveTab] = useState<'overview' | 'audio' | 'homework'>(() => {
    const t = searchParams.get('tab');
    return t === 'homework' || t === 'audio' ? t : 'overview';
  });
  const [mobileLessonDrawerOpen, setMobileLessonDrawerOpen] = useState(false);

  const syncUrlParams = (
    nextCourseId: string,
    nextLessonNum: number,
    nextTab?: 'overview' | 'audio' | 'homework'
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set('courseId', nextCourseId);
    next.set('lesson', String(nextLessonNum));
    if (nextTab) {
      if (nextTab === 'overview') next.delete('tab');
      else next.set('tab', nextTab);
    }
    setSearchParams(next, { replace: true });
  };

  // Sync deep-link query params (?courseId=...&lesson=...&tab=homework)
  useEffect(() => {
    const cid = searchParams.get('courseId');
    const lnum = Number(searchParams.get('lesson'));
    const tab = searchParams.get('tab');
    if (cid) setSelectedCourseId(cid);
    if (Number.isFinite(lnum) && lnum > 0) setSelectedLessonNum(lnum);
    if (tab === 'homework' || tab === 'audio' || tab === 'overview') {
      setActiveTab(tab);
    }
  }, [searchParams]);

  // Sync default course to user's entitled course when logging in (unless explicitly specified via URL)
  useEffect(() => {
    if (
      !searchParams.get('courseId') &&
      !isDemoMode &&
      user?.onlineCourses &&
      user.onlineCourses.length > 0
    ) {
      const hasCurrent = user.onlineCourses.some((c) => c.id === selectedCourseId);
      if (!hasCurrent) {
        setSelectedCourseId(user.onlineCourses[0].id);
      }
    }
  }, [user, isDemoMode, selectedCourseId, searchParams]);

  // 1. Fetch Course Catalog
  const coursesQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const coursesList = useMemo(() => {
    if (isDemoMode) return DEMO_COURSES;
    return coursesQuery.data || [];
  }, [isDemoMode, coursesQuery.data]);

  const activeCourse: KtnCourse = useMemo(() => {
    return (
      coursesList.find((c) => c.id === selectedCourseId) ||
      coursesList[0] ||
      (isDemoMode
        ? DEMO_COURSES[0]
        : {
            id: selectedCourseId,
            code: 'HSK',
            title: 'Khóa học tiếng Trung Khổng Tử Nhí',
            shortTitle: 'Khóa học',
          })
    );
  }, [coursesList, selectedCourseId, isDemoMode]);

  // 2. Fetch Lesson Units for Selected Course (enforces 403 COURSE_NOT_ENTITLED on BFF)
  const unitsQuery = useQuery<KtnLessonUnit[]>({
    queryKey: [
      'ktn-course-units',
      activeCourse.id,
      user?.email,
      isDemoMode,
      videoDemoScenario,
    ],
    queryFn: async () => {
      if (isDemoMode || videoDemoScenario !== 'live_real') {
        if (videoDemoScenario === 'loading') {
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (videoDemoScenario === 'unentitled') {
          throw new KtnApiError({
            message: 'Tài khoản chưa được mở khóa khóa học này.',
            status: 403,
            code: 'COURSE_NOT_ENTITLED',
          });
        }
        if (videoDemoScenario === 'error') {
          throw new KtnApiError({
            message: 'Không tải được video bài giảng.',
            status: 502,
            code: 'STREAM_ERROR',
          });
        }
        return DEMO_LESSONS;
      }

      return ktnApi.getCourseUnits(activeCourse.id);
    },
    enabled: Boolean(user) || isDemoMode,
    retry: false,
  });

  const lessons: KtnLessonUnit[] = useMemo(() => {
    if (unitsQuery.data && unitsQuery.data.length > 0) {
      return unitsQuery.data;
    }
    if (isDemoMode) return DEMO_LESSONS;
    return [];
  }, [unitsQuery.data, isDemoMode]);

  const activeLesson: KtnLessonUnit | null = useMemo(() => {
    if (lessons.length === 0) return null;
    return (
      lessons.find((l) => Number(l.num) === Number(selectedLessonNum)) ||
      lessons[0] ||
      null
    );
  }, [lessons, selectedLessonNum]);

  // 3. Fetch Student Homeworks
  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const currentLessonHomework = useMemo(() => {
    if (!activeLesson) return null;
    if (isDemoMode && videoDemoScenario === 'homework_pending') {
      return null;
    }
    if (isDemoMode && videoDemoScenario === 'homework_submitted') {
      return {
        ...DEMO_HOMEWORKS[0],
        id: 'DEMO-HW-SUBMITTED-STATE',
        course_id: activeCourse.id,
        lesson_num: activeLesson.num,
        lesson_title: activeLesson.title,
        status: 'pending' as const,
        score: null,
        teacher_feedback: '',
        student_note: 'Con vừa nộp bản thu âm đọc từ mới bài này ạ!',
      };
    }
    const list = homeworksQuery.data || [];
    return (
      list.find(
        (h) =>
          String(h.course_id) === String(activeCourse.id) &&
          Number(h.lesson_num) === Number(activeLesson.num)
      ) || null
    );
  }, [homeworksQuery.data, activeCourse.id, activeLesson, isDemoMode, videoDemoScenario]);

  // 4. Submit Homework Mutation (Presigned S3 Upload + POST /api/ktn/homeworks)
  const submitHomeworkMutation = useMutation({
    mutationFn: async (params: { file: File | Blob; fileName: string; note: string }) => {
      if (!activeLesson) throw new Error('Chưa chọn bài học');

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 450));
        return {
          homework: {
            ...DEMO_HOMEWORKS[0],
            id: `demo_hw_${Date.now()}`,
            lesson_num: activeLesson.num,
            lesson_title: activeLesson.title,
            student_note: params.note,
            status: 'pending' as const,
            submitted_at: new Date().toISOString(),
          },
          syncStatus: 'synced',
        };
      }

      const uploaded = await ktnApi.uploadHomeworkFile(params.file, params.fileName);

      return ktnApi.submitHomework({
        courseId: activeCourse.id,
        classCode: user?.classCode || '',
        lessonNum: activeLesson.num,
        lessonTitle: activeLesson.title,
        unitId: activeLesson._id || activeLesson.id || null,
        fileUrl: uploaded.fileUrl,
        fileType: uploaded.fileType,
        studentNote: params.note,
        attachments: [
          {
            title: params.fileName,
            fileUrl: uploaded.fileUrl,
            mediaType: uploaded.fileType,
            size: uploaded.size,
          },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
      addToast({
        title: 'Đã nộp bài tập thành công!',
        description: 'Bài làm của con đã được gửi tới Lão sư chủ nhiệm.',
        variant: 'success',
      });
    },
  });

  // Determine video player status override
  const playerStatusOverride: VideoPlayerStatus | null = useMemo(() => {
    if (videoDemoScenario === 'loading') return 'loading';
    if (videoDemoScenario === 'unentitled') return 'unentitled';
    if (videoDemoScenario === 'error') return 'error';
    if (videoDemoScenario === 'playing') return 'playing';
    if (videoDemoScenario === 'paused') return 'paused';

    if (unitsQuery.isLoading) return 'loading';
    if (unitsQuery.isError) {
      const err = unitsQuery.error as KtnApiError;
      if (
        err?.status === 403 ||
        err?.code === 'COURSE_NOT_ENTITLED' ||
        String(err?.message || '').includes('COURSE_NOT_ENTITLED') ||
        String(err?.message || '').includes('chưa được cấp quyền') ||
        String(err?.message || '').includes('chưa được mở khóa')
      ) {
        return 'unentitled';
      }
      return 'error';
    }
    return null;
  }, [
    videoDemoScenario,
    unitsQuery.isLoading,
    unitsQuery.isError,
    unitsQuery.error,
  ]);

  const lessonKey = `${activeCourse.id}:${activeLesson?.num || 1}`;
  const isCurrentLessonCompleted = Boolean(completedLessons[lessonKey]);

  const handleToggleCompleted = () => {
    if (!activeLesson) return;
    toggleLessonCompleted(activeCourse.id, activeLesson.num);
    addToast({
      title: !isCurrentLessonCompleted
        ? 'Tuyệt vời! Đã hoàn thành bài học 🎉'
        : 'Đã bỏ đánh dấu hoàn thành bài học',
      variant: 'success',
    });
  };

  const completedCount = lessons.filter(
    (l) => completedLessons[`${activeCourse.id}:${l.num}`]
  ).length;

  return (
    <div data-testid="video-learning-page" className="space-y-3 sm:space-y-4">
      {/* Demo Mode Video State Switcher */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2 text-xs">
          <span className="font-semibold text-amber-950">
            Trạng thái kiểm thử Phòng học (Demo):
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'live_real', label: 'Sẵn sàng phát' },
                { id: 'playing', label: 'Đang phát' },
                { id: 'paused', label: 'Tạm dừng' },
                { id: 'loading', label: 'Đang tải (Loading)' },
                { id: 'error', label: 'Lỗi Stream + Thử lại' },
                { id: 'unentitled', label: 'Chưa mở khóa (403 Guard)' },
                { id: 'homework_pending', label: 'Có bài tập cần nộp' },
                { id: 'homework_submitted', label: 'Đã nộp bài tập' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                data-testid={`video-demo-btn-${st.id}`}
                onClick={() => setVideoDemoScenario(st.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  videoDemoScenario === st.id
                    ? 'bg-red-800 text-white'
                    : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isDemoMode && coursesQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được danh sách khóa học.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              coursesQuery.refetch();
              unitsQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Course Selector Header (Compact on mobile) */}
      <div className="space-y-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-2xs sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:px-4 sm:py-3">
        <div className="flex items-center justify-between gap-2 min-w-0">
          <h1 className="truncate font-display text-sm font-bold text-stone-900 sm:text-base">
            {activeCourse.title}
          </h1>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
            {completedCount}/{lessons.length} bài
          </span>
        </div>

        {/* Course Level Pills (Single-line horizontal scroll on mobile) */}
        {coursesList.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0">
            {coursesList.slice(0, 4).map((course) => {
              const isEntitled =
                isDemoMode ||
                user?.role === 'teacher' ||
                user?.role === 'admin' ||
                (user?.onlineCourses || []).some((c) => c.id === course.id);

              return (
                <button
                  key={course.id}
                  type="button"
                  data-testid={`select-course-${course.id}`}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setSelectedLessonNum(1);
                    syncUrlParams(course.id, 1, activeTab);
                  }}
                  className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    activeCourse.id === course.id
                      ? 'bg-red-800 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{course.shortTitle || course.code}</span>
                  {!isEntitled && (
                    <span className="rounded bg-stone-200 px-1 py-0.2 text-[10px] text-stone-600">
                      Khóa
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Responsive Grid: Video + Tabs on Left (8 cols), Lesson List Sidebar on Right (4 cols) */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        {/* Left Column: Video Player & Lesson Content Tabs */}
        <div className="space-y-3 sm:space-y-4 lg:col-span-8">
          <HlsVideoPlayer
            lessonTitle={activeLesson?.title || 'Bài giảng tiếng Trung KTN'}
            courseName={activeCourse.title}
            streamUrl={activeLesson?.streamUrl || activeLesson?.video || null}
            fallbackVideoUrl={activeLesson?.video || null}
            statusOverride={playerStatusOverride}
            unentitledReason={
              unitsQuery.error instanceof Error ? unitsQuery.error.message : undefined
            }
            isCompleted={isCurrentLessonCompleted}
            onMarkCompleted={handleToggleCompleted}
            onRetryStream={() => {
              if (videoDemoScenario === 'error') setVideoDemoScenario('live_real');
              unitsQuery.refetch();
            }}
            onRequestUnlockCourse={() => navigate('/chat')}
          />

          {/* Mobile Lesson Drawer Trigger & Content Tabs (Only when entitled and lessons exist) */}
          {activeLesson && playerStatusOverride !== 'unentitled' && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 lg:hidden">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase text-red-800">
                    Bài {activeLesson.num}/{lessons.length}
                  </p>
                  <p className="truncate text-xs font-semibold text-stone-900">
                    {activeLesson.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileLessonDrawerOpen((prev) => !prev)}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-800"
                >
                  <ListVideo className="h-3.5 w-3.5 text-red-800" />
                  <span>Chọn bài ({lessons.length})</span>
                </button>
              </div>

              {mobileLessonDrawerOpen && (
                <div className="rounded-2xl border border-stone-200 bg-white p-2.5 lg:hidden">
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {lessons.map((lesson) => {
                      const isSelected = Number(lesson.num) === Number(activeLesson.num);
                      const done = Boolean(
                        completedLessons[`${activeCourse.id}:${lesson.num}`]
                      );
                      return (
                        <button
                          key={lesson._id || lesson.num}
                          type="button"
                          onClick={() => {
                            setSelectedLessonNum(lesson.num);
                            syncUrlParams(activeCourse.id, lesson.num, activeTab);
                            setMobileLessonDrawerOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                            isSelected
                              ? 'bg-red-50 font-bold text-red-900'
                              : 'text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <span className="truncate">{lesson.title}</span>
                          {done && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lesson Navigation Tabs: Nội dung / MP3 / Bài tập / Hỏi GV */}
              <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between gap-1.5 overflow-x-auto border-b border-stone-200 pb-2">
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid="tab-lesson-overview"
                      onClick={() => {
                        setActiveTab('overview');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'overview');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'overview'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Nội dung</span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-audio"
                      onClick={() => {
                        setActiveTab('audio');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'audio');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'audio'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>MP3 ({activeLesson.audioTracks?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-homework"
                      onClick={() => {
                        setActiveTab('homework');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'homework');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'homework'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      <span>Bài tập</span>
                      {currentLessonHomework?.status === 'graded' && (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                          {currentLessonHomework.score}đ
                        </span>
                      )}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        user?.classCode
                          ? `/chat?room=class:${user.classCode}`
                          : `/chat?room=course:${activeCourse.id}`
                      )
                    }
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Hỏi GV</span>
                  </button>
                </div>

                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                  <div className="mt-2.5 space-y-2.5">
                    <div>
                      <h2
                        data-testid="active-lesson-title"
                        className="font-display text-sm font-bold text-stone-900 sm:text-base"
                      >
                        {activeLesson.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">
                        {activeLesson.grammar ||
                          'Xem video bài giảng, luyện nghe phát âm chuẩn và gửi bản thu âm bài tập.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-stone-500">
                          SGK • Tr.{activeLesson.sgkPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Đọc theo bài
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-stone-500">
                          SBT • Tr.{activeLesson.sbtPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Nghe MP3
                        </p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-amber-900">
                          Viết • Tr.{activeLesson.voVietPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Thu âm nộp
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Audio Tracks */}
                {activeTab === 'audio' && (
                  <div className="mt-2.5 space-y-2">
                    {!activeLesson.audioTracks || activeLesson.audioTracks.length === 0 ? (
                      <p className="py-3 text-center text-xs text-stone-500">
                        Âm thanh đã tích hợp trực tiếp trong video bài giảng.
                      </p>
                    ) : (
                      activeLesson.audioTracks.map((audio, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-800 text-white">
                              <Volume2 className="h-3.5 w-3.5" />
                            </span>
                            <p className="text-xs font-bold text-stone-900">{audio.name}</p>
                          </div>
                          <audio
                            controls
                            preload="none"
                            src={audio.url}
                            className="h-8 max-w-xs"
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: Homework */}
                {activeTab === 'homework' && (
                  <div className="mt-2.5">
                    <HomeworkPanel
                      key={`${activeCourse.id}:${activeLesson.num}`}
                      courseId={activeCourse.id}
                      lessonNum={activeLesson.num}
                      lessonTitle={activeLesson.title}
                      classCode={user?.classCode || ''}
                      existingSubmission={currentLessonHomework}
                      isSubmitting={submitHomeworkMutation.isPending}
                      onSubmitHomework={async (params) => {
                        await submitHomeworkMutation.mutateAsync(params);
                      }}
                    />
                  </div>
                )}
              </div>

              {activeTab !== 'homework' && (
                <div className="hidden lg:block">
                  <HomeworkPanel
                    key={`${activeCourse.id}:${activeLesson.num}`}
                    courseId={activeCourse.id}
                    lessonNum={activeLesson.num}
                    lessonTitle={activeLesson.title}
                    classCode={user?.classCode || ''}
                    existingSubmission={currentLessonHomework}
                    isSubmitting={submitHomeworkMutation.isPending}
                    onSubmitHomework={async (params) => {
                      await submitHomeworkMutation.mutateAsync(params);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Curriculum Lesson List Sidebar */}
        <aside className="hidden lg:block lg:col-span-4">
          <div className="sticky top-4 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
            <div className="border-b border-stone-200 bg-stone-50/80 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-stone-900">
                  Danh sách bài giảng ({lessons.length})
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Hoàn thành {completedCount}/{lessons.length}
                </span>
              </div>

              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{
                    width: `${
                      lessons.length > 0
                        ? Math.round((completedCount / lessons.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 p-2">
              {lessons.map((lesson, idx) => {
                const isSelected = Number(lesson.num) === Number(activeLesson?.num);
                const isDone = Boolean(
                  completedLessons[`${activeCourse.id}:${lesson.num}`]
                );

                return (
                  <button
                    key={lesson._id || lesson.num}
                    type="button"
                    data-testid={`lesson-sidebar-item-${lesson.num}`}
                    onClick={() => {
                      setSelectedLessonNum(lesson.num);
                      syncUrlParams(activeCourse.id, lesson.num, activeTab);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all ${
                      isSelected
                        ? 'bg-red-50/95 ring-1 ring-red-200'
                        : 'hover:bg-stone-50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isSelected
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isSelected ? (
                        <PlayCircle className="h-4 w-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs leading-snug ${
                          isSelected ? 'font-bold text-red-950' : 'font-semibold text-stone-800'
                        }`}
                      >
                        {lesson.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                        <span>{lesson.duration || '12:00'}</span>
                        {lesson.audioTracks && lesson.audioTracks.length > 0 && (
                          <span>• {lesson.audioTracks.length} file nghe</span>
                        )}
                        {isDone && (
                          <span className="font-semibold text-emerald-700">• Đã học</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      className={`mt-1 h-4 w-4 shrink-0 ${
                        isSelected ? 'text-red-800' : 'text-stone-300'
                      }`}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
