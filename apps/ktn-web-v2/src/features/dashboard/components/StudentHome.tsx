import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  Bell,
  Award,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Calendar,
  Clock,
  Sparkles,
  BookOpenCheck,
  Clapperboard,
  Gamepad2,
  ArrowRight,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import {
  DEMO_CLASSES,
  DEMO_COURSES,
  DEMO_HOMEWORKS,
  DEMO_LESSONS,
  DEMO_NOTIFICATIONS,
} from '@/lib/demoData';
import {
  formatRelativeTime,
  resolveHomeworkLink,
  resolveNotificationLink,
} from '@/lib/utils';
import {
  KtnClassItem,
  KtnCourse,
  KtnHomework,
  KtnLessonUnit,
  KtnNotification,
} from '@/types/ktn.types';
import {
  SectionHeading,
  CompactListItem,
  MobileTaskList,
} from '@/components/shared/CompactUi';

export const StudentHome: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const completedLessons = useUiStore((s) => s.completedLessons);

  const effectiveClassCode = isDemoMode
    ? user?.classCode || DEMO_CLASSES[0].id
    : user?.classCode || null;

  // Check if external Flashcard URL is configured & active
  const flashcardUrl = useMemo(() => {
    const envUrl = import.meta.env.VITE_KTN_FLASHCARD_URL;
    if (typeof envUrl === 'string' && /^https?:\/\//i.test(envUrl.trim())) {
      return envUrl.trim();
    }
    if (typeof window !== 'undefined') {
      const winUrl = (window as unknown as { __KTN_FLASHCARD_URL__?: string })
        .__KTN_FLASHCARD_URL__;
      if (typeof winUrl === 'string' && /^https?:\/\//i.test(winUrl.trim())) {
        return winUrl.trim();
      }
    }
    return '';
  }, []);

  // 1. Live Courses Catalog from API (never fallback to DEMO_COURSES in live mode)
  const coursesCatalogQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  // 2. Classes from API (to get real official schedule for assigned class)
  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses();
    },
    enabled: Boolean(effectiveClassCode) && (Boolean(user) || isDemoMode),
  });

  const assignedClass = useMemo(() => {
    if (!effectiveClassCode) return null;
    const list = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
    return list.find((c) => c.id === effectiveClassCode) || null;
  }, [effectiveClassCode, isDemoMode, classesQuery.data]);

  // 3. Entitled courses based strictly on user session entitlements in live mode
  const myVideoCourses = useMemo(() => {
    if (isDemoMode) {
      return user?.hasOnlineCourses === false ? [] : DEMO_COURSES.slice(0, 2);
    }
    const entitledList = user?.onlineCourses || [];
    if (entitledList.length === 0) return [];
    const catalog = coursesCatalogQuery.data || [];
    return entitledList.map((ent) => {
      const matched = catalog.find((c) => c.id === ent.id || c.code === ent.code);
      return (
        matched || {
          id: ent.id,
          code: ent.code || 'COURSE',
          title: ent.title,
          shortTitle: ent.shortTitle || ent.title,
          badge: '',
          lessonsCount: 15,
          price: 0,
          oldPrice: 0,
        }
      );
    });
  }, [isDemoMode, user?.hasOnlineCourses, user?.onlineCourses, coursesCatalogQuery.data]);

  const primaryCourse = myVideoCourses[0] || null;

  // 4. Fetch units for primary entitled course to show real lesson title & progress
  const unitsQuery = useQuery<KtnLessonUnit[]>({
    queryKey: ['ktn-course-units', primaryCourse?.id, user?.email, isDemoMode],
    queryFn: async () => {
      if (!primaryCourse) return [];
      if (isDemoMode) return DEMO_LESSONS;
      return ktnApi.getCourseUnits(primaryCourse.id);
    },
    enabled: Boolean(primaryCourse?.id) && (Boolean(user) || isDemoMode),
    retry: false,
  });

  // 5. Homeworks & Notifications
  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const notificationsQuery = useQuery<{
    notifications: KtnNotification[];
    readIds: string[];
  }>({
    queryKey: ['ktn-notifications', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          notifications: DEMO_NOTIFICATIONS,
          readIds: DEMO_NOTIFICATIONS.filter((n) => n.read).map((n) => n.id),
        };
      }
      return ktnApi.getNotifications();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const markReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      if (isDemoMode) return { markedCount: 1 };
      return ktnApi.markNotificationsRead([notifId]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const homeworks = homeworksQuery.data || [];
  const notificationsList = notificationsQuery.data?.notifications || [];

  // Calculate real lesson progress for primary course
  const courseUnits = unitsQuery.data || [];
  const completedInCourse = primaryCourse
    ? courseUnits.filter((u) => completedLessons[`${primaryCourse.id}:${u.num}`]).length
    : 0;
  const nextLesson =
    courseUnits.find((u) => primaryCourse && !completedLessons[`${primaryCourse.id}:${u.num}`]) ||
    courseUnits[0] ||
    null;
  const progressPercent =
    courseUnits.length > 0
      ? Math.round((completedInCourse / courseUnits.length) * 100)
      : undefined;

  // Official class schedule text (never assume unconfirmed text in live mode)
  const officialScheduleLine = useMemo(() => {
    if (!effectiveClassCode) return '';
    if (isDemoMode) {
      return assignedClass?.officialScheduleText || 'Thứ 3 & Thứ 6 — 19:30–20:30';
    }
    if (
      assignedClass?.scheduleStatus === 'confirmed' &&
      assignedClass?.officialScheduleText
    ) {
      return assignedClass.officialScheduleText;
    }
    return 'Chưa có lịch học chính thức';
  }, [
    effectiveClassCode,
    isDemoMode,
    assignedClass?.scheduleStatus,
    assignedClass?.officialScheduleText,
  ]);

  const priorityHomeworks = useMemo(() => {
    const sorted = [...homeworks].sort(
      (a, b) =>
        new Date(b.submitted_at || 0).getTime() -
        new Date(a.submitted_at || 0).getTime()
    );
    return sorted.slice(0, 2);
  }, [homeworks]);

  const dedupedNotifications = useMemo(() => {
    const shownHwLessons = new Set(priorityHomeworks.map((hw) => Number(hw.lesson_num)));
    return notificationsList
      .filter(
        (n) =>
          !(
            n.type === 'homework_graded' &&
            n.lessonNum !== undefined &&
            shownHwLessons.has(Number(n.lessonNum))
          )
      )
      .slice(0, 2);
  }, [notificationsList, priorityHomeworks]);

  const hasApiError =
    !isDemoMode && (homeworksQuery.isError || notificationsQuery.isError);

  return (
    <div
      data-testid="student-dashboard-page"
      data-role-home="student"
      className="space-y-3 sm:space-y-3.5"
    >
      {hasApiError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được dữ liệu mới nhất.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              homeworksQuery.refetch();
              notificationsQuery.refetch();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 shadow-2xs"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* 1 & 2. Việc quan trọng sắp tới (Lớp học tiếp theo) + Học tiếp khóa video đã cấp */}
      <div data-testid="dashboard-courses-vs-classrooms" className="space-y-2.5">
        {effectiveClassCode ? (
          <section
            data-testid="student-next-class-card"
            className="flex items-center justify-between gap-2.5 rounded-2xl border border-stone-200 bg-white p-3 shadow-2xs sm:p-3.5"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800">
                <Calendar className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-red-800 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                    Lớp học tiếp theo
                  </span>
                  <span className="font-mono text-xs font-bold text-stone-700">
                    {effectiveClassCode}
                  </span>
                </div>

                <h2 className="mt-0.5 truncate font-display text-sm font-bold text-stone-900">
                  {assignedClass?.name || `Lớp trực tiếp ${effectiveClassCode}`}
                </h2>

                <p className="mt-0.5 text-[11px] font-medium text-stone-600">
                  GV: {assignedClass?.teacher_name || 'Cô Lâm Mỹ Linh'}
                </p>

                <p
                  data-testid="student-next-class-schedule-line"
                  className="mt-0.5 flex flex-wrap items-center gap-1 text-xs font-semibold text-red-900"
                >
                  <Clock className="h-3.5 w-3.5 shrink-0 text-red-700" />
                  {assignedClass?.nextSession ? (
                    <span>
                      {assignedClass.nextSession.dayLabel}, {assignedClass.nextSession.sessionDate}{' '}
                      · {assignedClass.nextSession.startTime}–{assignedClass.nextSession.endTime}
                    </span>
                  ) : (
                    <span>{officialScheduleLine}</span>
                  )}
                </p>
              </div>
            </div>

            <button
              type="button"
              data-testid="student-next-class-cta-btn"
              onClick={() =>
                navigate(`/classrooms?class=${encodeURIComponent(effectiveClassCode)}`)
              }
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
            >
              <span>Xem lớp</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </section>
        ) : null}

        {primaryCourse ? (
          <section
            data-testid="student-continue-learning-card"
            className="flex items-center justify-between gap-2.5 rounded-2xl border border-amber-200/90 bg-gradient-to-r from-amber-50/90 via-white to-red-50/40 p-3 shadow-2xs sm:p-3.5"
          >
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-800 text-amber-300">
                <PlayCircle className="h-4 w-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="truncate text-[10.5px] font-bold uppercase tracking-wide text-red-900">
                    {primaryCourse.shortTitle || primaryCourse.title}
                  </span>
                  {progressPercent !== undefined && (
                    <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      {progressPercent}%
                    </span>
                  )}
                </div>
                <p className="truncate font-display text-xs font-bold text-stone-900 sm:text-sm">
                  {nextLesson?.title || primaryCourse.title}
                </p>
                {courseUnits.length > 0 && (
                  <p className="text-[11px] text-stone-500">
                    Đã học {completedInCourse}/{courseUnits.length} bài
                  </p>
                )}
              </div>
            </div>

            <button
              type="button"
              data-testid="dashboard-continue-learning-btn"
              onClick={() =>
                navigate(
                  nextLesson
                    ? `/learning?courseId=${encodeURIComponent(primaryCourse.id)}&lesson=${nextLesson.num}`
                    : `/learning?courseId=${encodeURIComponent(primaryCourse.id)}`
                )
              }
              className="inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-stone-950 shadow-2xs hover:bg-amber-300"
            >
              <PlayCircle className="h-3.5 w-3.5 shrink-0" />
              <span>Học tiếp</span>
            </button>
          </section>
        ) : null}
      </div>

      {/* 3. Bài tập cần quan tâm (Tối đa 2 mục) */}
      {priorityHomeworks.length > 0 && (
        <section data-testid="student-priority-homework-section" className="space-y-1.5">
          <SectionHeading
            title="Bài tập & Điểm mới"
            count={priorityHomeworks.length}
          />
          <MobileTaskList testId="student-priority-homework-list">
            {priorityHomeworks.map((hw) => {
              const rawTitle = (hw.lesson_title || '').trim();
              const isLiveClassHw = String(hw.course_id || '')
                .toUpperCase()
                .startsWith('CLASS_');
              const displayTitle =
                /^(bài|lớp|buổi)\b/i.test(rawTitle) || hw.lesson_num > 100
                  ? rawTitle || `Bài ${hw.lesson_num}`
                  : `Bài ${hw.lesson_num}: ${rawTitle || 'Bài thu âm'}`;
              return (
                <CompactListItem
                  key={`hw-${hw.id}`}
                  testId={`dashboard-hw-item-${hw.id}`}
                  icon={
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                      <Award className="h-4 w-4" />
                    </div>
                  }
                  title={displayTitle}
                  subtitle={
                    hw.teacher_feedback ||
                    hw.student_note ||
                    (isLiveClassHw
                      ? `Bài tập lớp ${String(hw.course_id).slice(6) || hw.class_code || ''}`
                      : 'Đang chờ giáo viên chấm')
                  }
                  badge={
                    hw.status === 'graded' ? (
                      <span className="inline-flex items-center gap-0.5 rounded-md bg-emerald-700 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {hw.score}/10
                      </span>
                    ) : (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        Chờ chấm
                      </span>
                    )
                  }
                  meta={formatRelativeTime(hw.submitted_at)}
                  onClick={() => navigate(resolveHomeworkLink(hw))}
                />
              );
            })}
          </MobileTaskList>
        </section>
      )}

      {/* 4. Flashcard và tiện ích (Khám phá tiếng Trung gọn gàng) */}
      <section data-testid="chinese-discovery-section" className="space-y-2 pt-0.5">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-[13px] font-bold text-stone-900 sm:text-sm">
            <Sparkles className="h-3.5 w-3.5 text-amber-600" />
            <span>Flashcard & Tiện ích</span>
          </h2>
        </div>

        <div className="space-y-2.5 sm:grid sm:grid-cols-3 sm:gap-3 sm:space-y-0">
          {/* Ô 1 — Flashcard tiếng Trung */}
          <div
            data-testid="discovery-card-flashcard"
            className="flex items-center justify-between gap-3 rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 p-3 shadow-2xs sm:flex-col sm:items-stretch"
          >
            <div className="flex min-w-0 flex-1 items-start gap-2.5 sm:block">
              <div className="flex items-center justify-between gap-2">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800">
                  <BookOpenCheck className="h-4 w-4" />
                </div>
                <span className="hidden rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-extrabold text-amber-900 sm:inline-block">
                  汉字卡片 · Từ vựng
                </span>
              </div>

              <div className="min-w-0 flex-1 sm:mt-2">
                <h3 className="font-display text-xs font-bold text-stone-900 sm:text-sm">
                  Flashcard — Học từ vựng
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-stone-600">
                  Lật thẻ, nghe phát âm, luyện viết chữ Hán
                </p>
              </div>
            </div>

            <div className="shrink-0 sm:mt-2.5">
              {flashcardUrl ? (
                <a
                  href={flashcardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="flashcard-cta-btn"
                  className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900 sm:w-full"
                >
                  <span>Học ngay</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              ) : (
                <button
                  type="button"
                  disabled
                  data-testid="flashcard-cta-btn"
                  title="Hệ thống Flashcard đang được kết nối trực tiếp vào Sổ liên lạc"
                  className="inline-flex min-h-[34px] cursor-not-allowed items-center justify-between gap-1.5 rounded-xl border border-amber-300/80 bg-amber-100/60 px-2.5 py-1.5 text-[11px] font-bold text-amber-900 sm:w-full"
                >
                  <span>Học ngay</span>
                  <span className="rounded bg-white/90 px-1.5 py-0.5 text-[9.5px] font-semibold text-amber-800">
                    Đang tích hợp
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Ô 2 & Ô 3 — Gọn trên 1 hàng 2 cột ở Mobile */}
          <div className="grid grid-cols-2 gap-2.5 sm:col-span-2 sm:grid-cols-2 sm:gap-3">
            <div
              data-testid="discovery-card-short-video"
              className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-2.5 shadow-2xs sm:p-3"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-100 text-red-800">
                    <Clapperboard className="h-3.5 w-3.5" />
                  </div>
                  <span
                    data-testid="short-video-coming-soon-badge"
                    className="rounded-full bg-red-100 px-2 py-0.5 text-[9.5px] font-extrabold text-red-900"
                  >
                    Sắp ra mắt
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-xs font-bold text-stone-900">
                  Video ngắn tiếng Trung
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
                  Xem video ngắn, học tiếng Trung mỗi ngày
                </p>
              </div>
            </div>

            <div
              data-testid="discovery-card-games"
              className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-2.5 shadow-2xs sm:p-3"
            >
              <div>
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-800">
                    <Gamepad2 className="h-3.5 w-3.5" />
                  </div>
                  <span
                    data-testid="games-coming-soon-badge"
                    className="rounded-full bg-emerald-100 px-2 py-0.5 text-[9.5px] font-extrabold text-emerald-900"
                  >
                    Sắp ra mắt
                  </span>
                </div>

                <h3 className="mt-1.5 font-display text-xs font-bold text-stone-900">
                  Trò chơi tiếng Trung
                </h3>
                <p className="mt-0.5 text-[11px] leading-snug text-stone-500">
                  Vừa chơi vừa nhớ từ vựng
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. Hoạt động gần đây rút gọn (Tối đa 2 thông báo, ẩn nếu trống) */}
      {dedupedNotifications.length > 0 && (
        <section data-testid="student-recent-activity-section" className="space-y-1.5">
          <SectionHeading
            title="Hoạt động gần đây"
            count={dedupedNotifications.length}
            actionLabel="Xem tất cả →"
            onAction={() => navigate('/notifications')}
          />
          <MobileTaskList testId="student-recent-feed">
            {dedupedNotifications.map((notif) => (
              <CompactListItem
                key={notif.id}
                testId={`dashboard-notif-item-${notif.id}`}
                unread={!notif.read}
                icon={
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-800">
                    <Bell className="h-4 w-4" />
                  </div>
                }
                title={notif.title}
                subtitle={notif.body}
                meta={formatRelativeTime(notif.createdAt)}
                onClick={() => {
                  if (!notif.read) {
                    markReadMutation.mutate(notif.id);
                  }
                  navigate(resolveNotificationLink(notif));
                }}
              />
            ))}
          </MobileTaskList>
        </section>
      )}
    </div>
  );
};


