import React, { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  FileCheck2,
  CalendarPlus,
  MessageSquare,
  Clock,
  CheckCircle2,
  RotateCcw,
  AlertCircle,
  GraduationCap,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_HOMEWORKS } from '@/lib/demoData';
import { useChatRooms } from '@/features/chat/hooks/useMessages';
import { formatRelativeTime } from '@/lib/utils';
import { translateCourseTitle, translateScheduleText, useI18n } from '@/i18n';
import { KtnClassItem, KtnHomework } from '@/types/ktn.types';
import {
  PrimaryActionCard,
  QuickActionTile,
  SectionHeading,
  CompactListItem,
  MobileTaskList,
  EmptyState,
} from '@/components/shared/CompactUi';

export const TeacherHome: React.FC = () => {
  const { lang, tr } = useI18n();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);

  const [selectedClassFilter, setSelectedClassFilter] = useState<string>('ALL');

  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses({ lite: true });
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const assignedClasses = useMemo(() => {
    const raw = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
    if (isDemoMode || user?.role === 'admin') return raw;
    if (!user?.email) return [];
    return raw.filter(
      (c) =>
        (c.teacher_email &&
          c.teacher_email.toLowerCase() === user.email.toLowerCase()) ||
        (!c.teacher_email &&
          c.teacher_code &&
          user.code &&
          c.teacher_code.toUpperCase() === user.code.toUpperCase())
    );
  }, [isDemoMode, classesQuery.data, user?.email, user?.code, user?.role]);

  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', 'teacher-all', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const { data: chatRooms = [] } = useChatRooms();
  const totalUnreadChat = useMemo(
    () => chatRooms.reduce((sum, r) => sum + (Number(r.unreadCount) || 0), 0),
    [chatRooms]
  );

  const forumSummaryQuery = useQuery({
    queryKey: ['ktn-teacher-forum-summary', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return { openCount: 1 };
      }
      const res = await ktnApi.getForumQuestions({ status: 'open' });
      return { openCount: Number(res.summary?.openCount || res.questions?.length || 0) };
    },
    enabled: Boolean(user) || isDemoMode,
  });
  const openForumCount = forumSummaryQuery.data?.openCount || 0;

  const assignedClassIds = useMemo(
    () => new Set(assignedClasses.map((c) => c.id)),
    [assignedClasses]
  );
  const allHomeworks = useMemo(() => {
    const raw = homeworksQuery.data || [];
    if (isDemoMode || user?.role === 'admin') return raw;
    return raw.filter((h) => !h.class_code || assignedClassIds.has(h.class_code));
  }, [homeworksQuery.data, isDemoMode, user?.role, assignedClassIds]);
  const filteredHomeworks = useMemo(() => {
    if (selectedClassFilter === 'ALL') return allHomeworks;
    return allHomeworks.filter((h) => h.class_code === selectedClassFilter);
  }, [allHomeworks, selectedClassFilter]);

  const pendingHomeworks = useMemo(
    () => filteredHomeworks.filter((h) => h.status === 'pending'),
    [filteredHomeworks]
  );

  const hasApiError = !isDemoMode && (classesQuery.isError || homeworksQuery.isError);

  return (
    <div
      data-testid="teacher-home-page"
      data-role-home="teacher"
      className="space-y-3 sm:space-y-4"
    >
      {/* Compact Class Filter Strip (when teacher has classes loaded) */}
      {assignedClasses.length > 0 && (
        <div
          data-testid="teacher-class-selector-bar"
          className="flex items-center gap-1.5 overflow-x-auto rounded-xl border border-stone-200/80 bg-white px-2.5 py-2 shadow-2xs"
        >
          <button
            type="button"
            onClick={() => setSelectedClassFilter('ALL')}
            className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              selectedClassFilter === 'ALL'
                ? 'bg-red-800 text-white'
                : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
            }`}
          >
            {tr(`Tất cả (${assignedClasses.length} lớp)`, `All (${assignedClasses.length})`)}
          </button>
          {assignedClasses.map((cls) => (
            <button
              key={cls.id}
              type="button"
              data-testid={`teacher-filter-class-${cls.id}`}
              onClick={() => setSelectedClassFilter(cls.id)}
              className={`shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                selectedClassFilter === cls.id
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {cls.id}
            </button>
          ))}
        </div>
      )}

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
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            {tr('Thử lại', 'Retry')}
          </button>
        </div>
      )}

      {/* Khối ưu tiên: Bài chờ chấm */}
      <PrimaryActionCard
        testId="teacher-priority-grading-card"
        eyebrow={tr('Ưu tiên hôm nay', "Today's priority")}
        title={
          homeworksQuery.isLoading
            ? tr('Đang kiểm tra bài nộp...', 'Checking submissions...')
            : pendingHomeworks.length > 0
            ? tr(`${pendingHomeworks.length} bài chờ chấm`, `${pendingHomeworks.length} pending grading`)
            : tr(`Đã chấm hết (${filteredHomeworks.length} bài nộp)`, `All graded (${filteredHomeworks.length})`)
        }
        subtitle={
          selectedClassFilter === 'ALL'
            ? tr(`Phụ trách ${assignedClasses.length} lớp học`, `Managing ${assignedClasses.length} classes`)
            : tr(`Lớp ${selectedClassFilter}`, `Class ${selectedClassFilter}`)
        }
        ctaLabel={tr('Chấm bài', 'Grade now')}
        ctaIcon={FileCheck2}
        ctaTestId="teacher-home-grade-btn"
        onCtaClick={() =>
          navigate(
            selectedClassFilter !== 'ALL'
              ? `/teacher/grading?class=${encodeURIComponent(selectedClassFilter)}`
              : '/teacher/grading'
          )
        }
      />

      {/* Quick Actions Grid */}
      <section
        data-testid="teacher-quick-actions"
        className="grid grid-cols-2 gap-2 sm:grid-cols-5 sm:gap-3"
      >
        <QuickActionTile
          icon={Users}
          label={tr('Lớp của tôi', 'My Classes')}
          status={tr(`${assignedClasses.length} lớp phụ trách`, `${assignedClasses.length} classes`)}
          accent="red"
          testId="teacher-quick-classes"
          onClick={() => navigate('/teacher/classes')}
        />

        <QuickActionTile
          icon={FileCheck2}
          label={tr('Chấm bài', 'Grading')}
          status={
            pendingHomeworks.length > 0
              ? tr(`${pendingHomeworks.length} chờ chấm`, `${pendingHomeworks.length} pending`)
              : tr(`${filteredHomeworks.length} đã chấm`, `${filteredHomeworks.length} graded`)
          }
          badgeCount={pendingHomeworks.length}
          accent="emerald"
          testId="teacher-quick-grading"
          onClick={() => navigate('/teacher/grading')}
        />

        <QuickActionTile
          icon={MessageSquare}
          label={tr('Hỏi đáp bài học', 'Lesson Q&A')}
          status={
            openForumCount > 0
              ? tr(`${openForumCount} câu chờ giải đáp`, `${openForumCount} open`)
              : tr('Cộng đồng bài học', 'Lesson community')
          }
          badgeCount={openForumCount}
          accent="amber"
          testId="teacher-quick-forum"
          onClick={() => navigate('/teacher/forum')}
        />

        <QuickActionTile
          icon={CalendarPlus}
          label={tr('Giao bài', 'Assign')}
          status={tr('Cập nhật buổi học', 'Update sessions')}
          accent="amber"
          testId="teacher-quick-assign"
          onClick={() => navigate('/teacher/assign')}
        />

        <QuickActionTile
          icon={MessageSquare}
          label={tr('Tin nhắn', 'Messages')}
          status={
            totalUnreadChat > 0
              ? tr(`${totalUnreadChat} tin chưa đọc`, `${totalUnreadChat} unread`)
              : tr('Nhắn phụ huynh', 'Message parents')
          }
          badgeCount={totalUnreadChat}
          accent="blue"
          testId="teacher-quick-chat"
          onClick={() => navigate('/chat')}
        />
      </section>

      {/* Lớp phụ trách (Assigned Classes Compact List) */}
      <section className="space-y-2">
        <SectionHeading
          title={tr('Lớp phụ trách', 'Assigned Classes')}
          count={assignedClasses.length}
          actionLabel={tr('Quản lý lớp →', 'Manage classes →')}
          onAction={() => navigate('/teacher/classes')}
        />

        {classesQuery.isLoading ? (
          <div className="rounded-xl border border-stone-200 bg-white p-4 text-xs text-stone-500">
            {tr('Đang tải danh sách lớp...', 'Loading classes...')}
          </div>
        ) : assignedClasses.length === 0 ? (
          <EmptyState
            icon={GraduationCap}
            title={tr('Chưa có lớp được phân công', 'No classes assigned yet')}
            description={tr(
              'Khi Học vụ phân công lớp mới, danh sách lớp sẽ hiển thị tại đây.',
              'Once Academic Admin assigns classes, they will appear here.'
            )}
          />
        ) : (
          <MobileTaskList testId="teacher-assigned-classes-list">
            {assignedClasses.map((cls) => {
              const clsPending = allHomeworks.filter(
                (h) => h.class_code === cls.id && h.status === 'pending'
              ).length;
              return (
                <CompactListItem
                  key={cls.id}
                  testId={`teacher-home-class-${cls.id}`}
                  icon={
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-800 font-display text-[11px] font-bold text-white">
                      {cls.id.slice(0, 4)}
                    </div>
                  }
                  title={`${cls.id} · ${translateScheduleText(cls.name || cls.id, lang)}`}
                  subtitle={tr(
                    `${translateScheduleText(cls.schedule || '', lang)} · Buổi ${cls.current_lesson ?? 1}/${cls.total_lessons ?? 25}`,
                    `${translateScheduleText(cls.schedule || '', lang)} · Session ${cls.current_lesson ?? 1}/${cls.total_lessons ?? 25}`
                  )}
                  badge={
                    clsPending > 0 ? (
                      <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                        {tr(`${clsPending} chờ chấm`, `${clsPending} pending`)}
                      </span>
                    ) : null
                  }
                  onClick={() =>
                    navigate(`/teacher/classes?class=${encodeURIComponent(cls.id)}`)
                  }
                />
              );
            })}
          </MobileTaskList>
        )}
      </section>

      {/* Hoạt động gần đây (Recent Student Submissions) */}
      <section className="space-y-2">
        <SectionHeading
          title={tr('Hoạt động gần đây', 'Recent Activity')}
          count={filteredHomeworks.length}
          actionLabel={tr('Mở chấm bài →', 'Open grading →')}
          onAction={() => navigate('/teacher/grading')}
        />

        {filteredHomeworks.length === 0 ? (
          <EmptyState
            icon={FileCheck2}
            title={tr('Chưa có bài nộp mới', 'No new submissions')}
            description={tr(
              'Bài thu âm và ảnh viết chữ của học viên sẽ xuất hiện tại đây.',
              'Student audio recordings and handwriting photos will appear here.'
            )}
          />
        ) : (
          <MobileTaskList testId="teacher-recent-submissions-list">
            {filteredHomeworks.slice(0, 4).map((hw) => (
              <CompactListItem
                key={hw.id}
                testId={`teacher-home-hw-${hw.id}`}
                unread={hw.status === 'pending'}
                icon={
                  <div
                    className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                      hw.status === 'pending'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-emerald-50 text-emerald-700'
                    }`}
                  >
                    {hw.status === 'pending' ? (
                      <Clock className="h-4 w-4" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4" />
                    )}
                  </div>
                }
                title={`${hw.student_name || hw.student_email} · ${
                  hw.lesson_num > 100
                    ? tr(
                        `Buổi ${Math.floor(hw.lesson_num / 100)} · Bài ${hw.lesson_num % 100}`,
                        `Session ${Math.floor(hw.lesson_num / 100)} · Ex ${hw.lesson_num % 100}`
                      )
                    : tr(`Bài ${hw.lesson_num}`, `Lesson ${hw.lesson_num}`)
                }`}
                subtitle={hw.student_note || translateCourseTitle(hw.lesson_title, lang)}
                badge={
                  hw.status === 'pending' ? (
                    <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                      {tr('Chờ chấm', 'Pending')}
                    </span>
                  ) : hw.status === 'revision_requested' ? (
                    <span className="rounded-md bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                      {tr('Cần sửa', 'Needs revision')}
                    </span>
                  ) : (
                    <span className="rounded-md bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                      {hw.score}/10
                    </span>
                  )
                }
                meta={formatRelativeTime(hw.submitted_at)}
                onClick={() =>
                  navigate(`/teacher/grading?hwId=${encodeURIComponent(hw.id)}`)
                }
              />
            ))}
          </MobileTaskList>
        )}
      </section>
    </div>
  );
};
