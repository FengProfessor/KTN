import React, { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  MessageSquare,
  FileCheck2,
  Bell,
  Award,
  Users,
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
import { useChatRooms } from '@/features/chat/hooks/useMessages';
import { formatRelativeTime, resolveNotificationLink } from '@/lib/utils';
import {
  KtnClassItem,
  KtnCourse,
  KtnHomework,
  KtnLessonUnit,
  KtnNotification,
} from '@/types/ktn.types';
import {
  PrimaryActionCard,
  QuickActionTile,
  SectionHeading,
  CompactListItem,
  MobileTaskList,
  EmptyState,
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

  const { data: chatRooms = [] } = useChatRooms();

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
  const latestGraded = homeworks.find((h) => h.status === 'graded');
  const primaryRoom =
    chatRooms.find((r) => effectiveClassCode && r.classCode === effectiveClassCode) ||
    chatRooms[0] ||
    null;
  const totalUnreadMessages = chatRooms.reduce(
    (sum, r) => sum + (Number(r.unreadCount) || 0),
    0
  );
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

  const compactClassSummary = useMemo(() => {
    if (effectiveClassCode) {
      return `${effectiveClassCode} · ${officialScheduleLine}`;
    }
    if (myVideoCourses.length > 0) {
      return `Tự học · Đã mở ${myVideoCourses.length} khóa`;
    }
    return 'Chưa xếp lớp · Chưa mở khóa';
  }, [effectiveClassCode, officialScheduleLine, myVideoCourses.length]);

  const studentDisplayName = user?.name || (isDemoMode ? 'Bé Hoàng Ngân' : 'Em');
  const shortStudyReminder = useMemo(() => {
    if (assignedClass?.nextSession) {
      return `Nhớ chuẩn bị vở và vào lớp đúng giờ (${assignedClass.nextSession.startTime} ${assignedClass.nextSession.dayLabel}) nhé!`;
    }
    if (nextLesson) {
      return `Mỗi ngày 15 phút học tiếng Trung giúp con nhớ chữ Hán thật lâu!`;
    }
    return 'Chào mừng con đến với không gian học tiếng Trung Khổng Tử Nhí!';
  }, [assignedClass?.nextSession, nextLesson]);

  const hasApiError =
    !isDemoMode && (homeworksQuery.isError || notificationsQuery.isError);

  return (
    <div
      data-testid="student-dashboard-page"
      data-role-home="student"
      className="space-y-3.5 sm:space-y-4"
    >
      {/* 1. Lời chào và lời nhắc ngắn */}
      <div
        data-testid="student-greeting-strip"
        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-white to-red-50/60 px-3.5 py-2.5 shadow-2xs"
      >
        <div className="min-w-0">
          <p className="font-display text-xs font-extrabold text-stone-900 sm:text-sm">
            👋 Chào {studentDisplayName}! <span className="text-red-800">加油 (Cố lên nhé)!</span>
          </p>
          <p className="truncate text-[11px] font-medium text-stone-600">
            {shortStudyReminder}
          </p>
        </div>
        <span
          data-testid="dashboard-class-summary"
          className="shrink-0 rounded-full border border-stone-200 bg-white px-2.5 py-0.5 text-[11px] font-bold text-stone-700"
        >
          {compactClassSummary}
        </span>
      </div>

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

      {/* 2 & 3. Lớp học tiếp theo (Thứ/ngày/giờ, tên lớp, giáo viên + Nút vào bài học / xem lớp) */}
      {effectiveClassCode ? (
        <section
          data-testid="student-next-class-card"
          className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-3.5 shadow-2xs sm:p-4"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800">
              <Calendar className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="rounded-md bg-red-800 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
                  Lớp học tiếp theo
                </span>
                <span className="font-mono text-xs font-bold text-stone-700">
                  Lớp {effectiveClassCode}
                </span>
                {assignedClass?.teacher_name && (
                  <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-700">
                    GV: {assignedClass.teacher_name}
                  </span>
                )}
              </div>

              <h2 className="mt-1 truncate font-display text-sm font-bold text-stone-900 sm:text-base">
                {assignedClass?.name || `Lớp trực tiếp ${effectiveClassCode}`}
              </h2>

              <p
                data-testid="student-next-class-schedule-line"
                className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-red-900"
              >
                <Clock className="h-3.5 w-3.5 shrink-0 text-red-700" />
                {assignedClass?.nextSession ? (
                  <span>
                    {assignedClass.nextSession.dayLabel}, {assignedClass.nextSession.sessionDate} ·{' '}
                    {assignedClass.nextSession.startTime}–{assignedClass.nextSession.endTime}
                  </span>
                ) : (
                  <span>{officialScheduleLine}</span>
                )}
              </p>
            </div>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {assignedClass?.nextSession?.meetingUrl &&
              /^https:\/\//i.test(assignedClass.nextSession.meetingUrl) && (
                <a
                  href={assignedClass.nextSession.meetingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="student-join-meeting-link"
                  className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-emerald-800"
                >
                  <span>Vào phòng học</span>
                  <ArrowRight className="h-3.5 w-3.5" />
                </a>
              )}

            <button
              type="button"
              data-testid="student-next-class-cta-btn"
              onClick={() => navigate(`/classrooms?class=${encodeURIComponent(effectiveClassCode)}`)}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
            >
              <span>Xem buổi học</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </section>
      ) : null}

      {/* 4. Khóa học video đang học (Primary Action Card) */}
      {primaryCourse ? (
        <PrimaryActionCard
          testId="student-continue-learning-card"
          eyebrow={primaryCourse.shortTitle || primaryCourse.title}
          title={nextLesson?.title || primaryCourse.title}
          subtitle={
            courseUnits.length > 0
              ? `Đã học ${completedInCourse}/${courseUnits.length} bài`
              : 'Sẵn sàng vào bài học'
          }
          progressPercent={progressPercent}
          progressLabel={progressPercent !== undefined ? `${progressPercent}%` : undefined}
          ctaLabel="Học tiếp"
          ctaIcon={PlayCircle}
          ctaTestId="dashboard-continue-learning-btn"
          onCtaClick={() =>
            navigate(
              nextLesson
                ? `/learning?courseId=${encodeURIComponent(primaryCourse.id)}&lesson=${nextLesson.num}`
                : `/learning?courseId=${encodeURIComponent(primaryCourse.id)}`
            )
          }
        />
      ) : (
        <PrimaryActionCard
          testId="student-continue-learning-card"
          eyebrow="Khóa học của em"
          title="Chưa có khóa học được mở quyền"
          subtitle="Liên hệ Học vụ để kích hoạt khóa học"
          ctaLabel="Học tiếp"
          ctaIcon={PlayCircle}
          ctaTestId="dashboard-continue-learning-btn"
          onCtaClick={() => navigate('/learning')}
        />
      )}

      {/* Quick Actions 2x2 Grid */}
      <section
        data-testid="dashboard-courses-vs-classrooms"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        <QuickActionTile
          icon={PlayCircle}
          label="Khóa học"
          status={
            myVideoCourses.length > 0
              ? `${myVideoCourses.length} khóa đang học`
              : 'Chưa mở khóa'
          }
          accent="red"
          testId="student-quick-courses"
          onClick={() => navigate('/learning')}
        />

        <QuickActionTile
          icon={FileCheck2}
          label="Bài tập"
          status={
            latestGraded
              ? `Điểm: ${latestGraded.score}/10`
              : homeworks.length > 0
              ? `${homeworks.length} đã nộp`
              : 'Nộp bài'
          }
          accent="emerald"
          testId="student-quick-homework"
          onClick={() => navigate('/learning?tab=homework')}
        />

        <QuickActionTile
          icon={MessageSquare}
          label="Tin nhắn"
          status={
            totalUnreadMessages > 0
              ? `${totalUnreadMessages} tin mới`
              : primaryRoom?.teacherName || 'Nhắn giáo viên'
          }
          badgeCount={totalUnreadMessages}
          accent="amber"
          testId="dashboard-open-chat-btn"
          onClick={() =>
            navigate(
              primaryRoom?.roomId
                ? `/chat?room=${encodeURIComponent(primaryRoom.roomId)}`
                : '/chat'
            )
          }
        />

        <QuickActionTile
          icon={Users}
          label="Lớp học"
          status={effectiveClassCode ? `Lớp ${effectiveClassCode}` : 'Chưa xếp lớp'}
          accent="blue"
          testId="student-quick-classrooms"
          onClick={() => navigate('/classrooms')}
        />
      </section>

      {/* 5. Bài tập cần hoàn thành & Hoạt động gần đây */}
      <section className="space-y-2">
        {(() => {
          const shownHwLessons = new Set(
            homeworks.slice(0, 2).map((hw) => hw.lesson_num)
          );
          const dedupedNotifications = notificationsList.filter(
            (n) =>
              !(
                n.type === 'homework_graded' &&
                n.lessonNum !== undefined &&
                shownHwLessons.has(Number(n.lessonNum))
              )
          );
          const totalFeedCount = homeworks.length + dedupedNotifications.length;
          return (
            <>
              <SectionHeading
                title="Bài tập & Hoạt động gần đây"
                count={totalFeedCount}
                actionLabel="Thông báo →"
                onAction={() => navigate('/notifications')}
              />

              {totalFeedCount === 0 ? (
                <EmptyState
                  icon={Bell}
                  title="Chưa có hoạt động mới"
                  description="Điểm bài tập và tin nhắn của giáo viên sẽ hiển thị tại đây."
                />
              ) : (
                <MobileTaskList testId="student-recent-feed">
                  {homeworks.slice(0, 2).map((hw) => {
                    const rawTitle = (hw.lesson_title || '').trim();
                    const displayTitle =
                      /^(bài|lớp|buổi)\b/i.test(rawTitle) || hw.lesson_num > 100
                        ? rawTitle || `Bài ${hw.lesson_num}`
                        : `Bài ${hw.lesson_num}: ${rawTitle || 'Bài thu âm'}`;
                    return (
                      <CompactListItem
                        key={`hw-${hw.id}`}
                        icon={
                          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                            <Award className="h-4 w-4" />
                          </div>
                        }
                        title={displayTitle}
                        subtitle={
                          hw.teacher_feedback ||
                          hw.student_note ||
                          'Đang chờ giáo viên chấm'
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
                        onClick={() =>
                          navigate(
                            `/learning?courseId=${encodeURIComponent(hw.course_id)}&lesson=${hw.lesson_num}&tab=homework`
                          )
                        }
                      />
                    );
                  })}

                  {dedupedNotifications.slice(0, 2).map((notif) => (
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
              )}
            </>
          );
        })()}
      </section>

      {/* 6. Khu vực Khám phá tiếng Trung (3 ô trực quan: Flashcard, Video ngắn, Trò chơi) */}
      <section data-testid="chinese-discovery-section" className="space-y-2.5 pt-1">
        <div className="flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 font-display text-sm font-bold text-stone-900">
            <Sparkles className="h-4 w-4 text-amber-600" />
            <span>Khám phá tiếng Trung</span>
          </h2>
          <span className="text-[11px] font-medium text-stone-500">
            Tiện ích luyện tập mỗi ngày
          </span>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          {/* Ô 1 — Flashcard tiếng Trung */}
          <div
            data-testid="discovery-card-flashcard"
            className="flex flex-col justify-between rounded-2xl border border-amber-200/90 bg-gradient-to-br from-amber-50/90 via-white to-orange-50/60 p-4 shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-800">
                  <BookOpenCheck className="h-5 w-5" />
                </div>
                <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[10px] font-extrabold text-amber-900">
                  汉字卡片 · Từ vựng
                </span>
              </div>

              <h3 className="mt-3 font-display text-sm font-bold text-stone-900">
                Flashcard — Học từ vựng
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                Lật thẻ, nghe phát âm, luyện viết chữ Hán
              </p>
            </div>

            <div className="mt-3.5 flex items-center justify-between gap-2 pt-1">
              {flashcardUrl ? (
                <a
                  href={flashcardUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="flashcard-cta-btn"
                  className="inline-flex min-h-[36px] w-full items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
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
                  className="inline-flex min-h-[36px] w-full cursor-not-allowed items-center justify-between rounded-xl border border-amber-300/80 bg-amber-100/60 px-3 py-1.5 text-xs font-bold text-amber-900"
                >
                  <span>Học ngay</span>
                  <span className="rounded-md bg-white/90 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Đang tích hợp
                  </span>
                </button>
              )}
            </div>
          </div>

          {/* Ô 2 — Video ngắn tiếng Trung */}
          <div
            data-testid="discovery-card-short-video"
            className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-gradient-to-br from-red-50/70 via-white to-stone-50 p-4 shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-100 text-red-800">
                  <Clapperboard className="h-5 w-5" />
                </div>
                <span
                  data-testid="short-video-coming-soon-badge"
                  className="rounded-full bg-red-100 px-2.5 py-0.5 text-[10px] font-extrabold text-red-900"
                >
                  Sắp ra mắt
                </span>
              </div>

              <h3 className="mt-3 font-display text-sm font-bold text-stone-900">
                Video ngắn tiếng Trung
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                Xem video ngắn, học tiếng Trung mỗi ngày
              </p>
            </div>

            <div className="mt-3.5 flex items-center gap-1.5 rounded-xl bg-stone-100/80 px-3 py-1.5 text-[11px] font-semibold text-stone-600">
              <span>🎬 Tình huống giao tiếp & hoạt hình chữ Hán</span>
            </div>
          </div>

          {/* Ô 3 — Trò chơi tiếng Trung */}
          <div
            data-testid="discovery-card-games"
            className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-gradient-to-br from-emerald-50/70 via-white to-stone-50 p-4 shadow-2xs"
          >
            <div>
              <div className="flex items-center justify-between gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
                  <Gamepad2 className="h-5 w-5" />
                </div>
                <span
                  data-testid="games-coming-soon-badge"
                  className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-extrabold text-emerald-900"
                >
                  Sắp ra mắt
                </span>
              </div>

              <h3 className="mt-3 font-display text-sm font-bold text-stone-900">
                Trò chơi tiếng Trung
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-stone-600">
                Vừa chơi vừa nhớ từ vựng
              </p>
            </div>

            <div className="mt-3.5 flex items-center gap-1.5 rounded-xl bg-stone-100/80 px-3 py-1.5 text-[11px] font-semibold text-stone-600">
              <span>🎮 Ghép chữ Hán & thử thách phản xạ</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

