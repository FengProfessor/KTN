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

function formatCompactSchedule(schedule?: string | null): string {
  if (!schedule) return '';
  return schedule
    .replace(/Thứ\s*(\d)/gi, 'T$1')
    .replace(/Chủ\s*Nhật/gi, 'CN')
    .replace(/\s*&\s*/g, ', ');
}

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

  // 1. Live Courses Catalog from API (never fallback to DEMO_COURSES in live mode)
  const coursesCatalogQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  // 2. Classes from API (to get real schedule for assigned class)
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

  const compactClassSummary = useMemo(() => {
    if (effectiveClassCode) {
      const sched = formatCompactSchedule(assignedClass?.schedule);
      return sched ? `${effectiveClassCode} · ${sched}` : `Lớp ${effectiveClassCode}`;
    }
    if (myVideoCourses.length > 0) {
      return `Tự học · Đã mở ${myVideoCourses.length} khóa`;
    }
    return 'Chưa xếp lớp · Chưa mở khóa';
  }, [effectiveClassCode, assignedClass?.schedule, myVideoCourses.length]);

  const hasApiError =
    !isDemoMode && (homeworksQuery.isError || notificationsQuery.isError);

  return (
    <div
      data-testid="student-dashboard-page"
      data-role-home="student"
      className="space-y-3 sm:space-y-4"
    >
      {/* Khu vực 1: Compact Class & Schedule Strip */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200/80 bg-white px-3 py-2 shadow-2xs">
        <div className="flex min-w-0 items-center gap-2">
          <Calendar className="h-3.5 w-3.5 shrink-0 text-red-800" />
          <p
            data-testid="dashboard-class-summary"
            className="truncate text-xs font-bold text-stone-800"
          >
            {compactClassSummary}
          </p>
        </div>
        {assignedClass?.teacher_name && (
          <span className="shrink-0 rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-800">
            {assignedClass.teacher_name}
          </span>
        )}
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

      {/* Khu vực 2: Continue Learning (Primary Action Card) */}
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

      {/* Khu vực 3: Quick Actions 2x2 Grid */}
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

      {/* Khu vực 4: Gần đây (Unified Compact Feed) */}
      <section className="space-y-2">
        <SectionHeading
          title="Gần đây"
          count={homeworks.length + notificationsList.length}
          actionLabel="Thông báo →"
          onAction={() => navigate('/notifications')}
        />

        {homeworks.length === 0 && notificationsList.length === 0 ? (
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
                  hw.teacher_feedback || hw.student_note || 'Đang chờ giáo viên chấm'
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

            {notificationsList.slice(0, 3).map((notif) => (
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
      </section>
    </div>
  );
};
