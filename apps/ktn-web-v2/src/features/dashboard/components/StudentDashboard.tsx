import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  MessageSquare,
  FileCheck2,
  Bell,
  Award,
  Calendar,
  ArrowRight,
  Sparkles,
  CheckCircle2,
  BookOpen,
  Users,
  Video,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import {
  DEMO_CLASSES,
  DEMO_CLASS_SESSIONS,
  DEMO_COURSES,
  DEMO_HOMEWORKS,
  DEMO_NOTIFICATIONS,
} from '@/lib/demoData';
import { useChatRooms } from '@/features/chat/hooks/useMessages';
import { formatRelativeTime, resolveNotificationLink } from '@/lib/utils';
import { KtnClassSession, KtnHomework, KtnNotification } from '@/types/ktn.types';

export const StudentDashboard: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const completedLessons = useUiStore((s) => s.completedLessons);

  const effectiveClassCode = isDemoMode
    ? user?.classCode || DEMO_CLASSES[0].id
    : user?.classCode || null;

  const { data: chatRooms = [] } = useChatRooms();

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

  const sessionsQuery = useQuery<KtnClassSession[]>({
    queryKey: ['ktn-class-sessions', effectiveClassCode, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASS_SESSIONS;
      if (!effectiveClassCode) return [];
      return ktnApi.getClassSessions(effectiveClassCode);
    },
    enabled: Boolean(effectiveClassCode) && (Boolean(user) || isDemoMode),
  });

  const homeworks = homeworksQuery.data || [];
  const latestGraded = homeworks.find((h) => h.status === 'graded');
  const sessionsList = sessionsQuery.data || [];
  const latestSession =
    sessionsList[sessionsList.length - 1] || (isDemoMode ? DEMO_CLASS_SESSIONS[0] : null);
  const primaryRoom =
    chatRooms.find((r) => effectiveClassCode && r.classCode === effectiveClassCode) ||
    chatRooms[0] ||
    null;
  const totalUnreadMessages = chatRooms.reduce(
    (sum, r) => sum + (Number(r.unreadCount) || 0),
    0
  );
  const notificationsList = notificationsQuery.data?.notifications || [];
  const unreadNotifs = notificationsList.filter((n) => !n.read).length;

  const entitledCourseIds = new Set(
    (user?.onlineCourses || []).map((c) => String(c.id || c._id || '').trim()).filter(Boolean)
  );
  const myVideoCourses = isDemoMode
    ? DEMO_COURSES.slice(0, 2)
    : DEMO_COURSES.filter((c) => entitledCourseIds.has(c.id));
  const completedCount = Object.values(completedLessons).filter(Boolean).length;

  return (
    <div data-testid="student-dashboard-page" className="space-y-5">
      {/* Hero Banner: Answers "Hôm nay con học gì?" in 3 seconds */}
      <section className="relative overflow-hidden rounded-3xl border border-red-900/20 bg-gradient-to-r from-red-900 via-red-800 to-amber-900 p-5 text-white shadow-md sm:p-7">
        <div className="relative z-10 flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>SỔ LIÊN LẠC ĐIỆN TỬ & PHÒNG HỌC KTN V2</span>
            </div>
            <h1 className="font-display text-xl font-bold sm:text-2xl">
              Xin chào {user?.name || 'Học viên KTN'}! Hôm nay mình học gì nhỉ? 👋
            </h1>
            <p
              data-testid="dashboard-class-summary"
              className="max-w-2xl text-xs leading-relaxed text-red-100 sm:text-sm"
            >
              {effectiveClassCode ? (
                <>
                  Lớp trực tiếp của con:{' '}
                  <strong className="text-amber-300">{effectiveClassCode}</strong> • Lịch học:
                  Thứ 3 & Thứ 6 (19:30). Con hãy xem video bài giảng và hoàn thành bài thu âm gửi
                  Lão sư nhé!
                </>
              ) : (
                <>
                  Chế độ học tập:{' '}
                  <strong className="text-amber-300">
                    Học viên tự học qua Video ({myVideoCourses.length} khóa đã mở quyền)
                  </strong>{' '}
                  • Chưa xếp lớp trực tiếp. Con có thể xem bài giảng và nộp bài thu âm để Lão sư
                  chấm điểm!
                </>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              data-testid="dashboard-continue-learning-btn"
              onClick={() => navigate('/learning')}
              className="inline-flex items-center gap-2 rounded-2xl bg-amber-400 px-5 py-3 text-xs font-extrabold text-stone-950 shadow-lg transition-transform hover:scale-[1.02] hover:bg-amber-300 sm:text-sm"
            >
              <PlayCircle className="h-5 w-5 fill-stone-950 text-amber-400" />
              <span>Vào phòng học Video HLS</span>
            </button>

            <button
              type="button"
              data-testid="dashboard-open-chat-btn"
              onClick={() =>
                navigate(
                  primaryRoom?.roomId
                    ? `/chat?room=${encodeURIComponent(primaryRoom.roomId)}`
                    : '/chat'
                )
              }
              className="inline-flex items-center gap-2 rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-xs font-bold text-white backdrop-blur-xs hover:bg-white/20 sm:text-sm"
            >
              <MessageSquare className="h-4 w-4 text-amber-300" />
              <span>Nhắn Lão sư</span>
              {totalUnreadMessages > 0 && (
                <span className="rounded-full bg-red-500 px-2 py-0.5 text-[11px] font-extrabold text-white">
                  {totalUnreadMessages} mới
                </span>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 4 Key Action Cards answering the 5 parent/student questions */}
      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/* Card 1: Hôm nay học gì? */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-800">
                <Calendar className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-bold text-red-900">
                {effectiveClassCode ? `Lớp ${effectiveClassCode}` : 'Tự học Video'}
              </span>
            </div>
            <h2 className="mt-3 font-display text-sm font-bold text-stone-900">
              {effectiveClassCode
                ? latestSession?.title || `Lộ trình Lớp ${effectiveClassCode}`
                : myVideoCourses[0]?.title || 'Khóa học Video tự học'}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-stone-600">
              {effectiveClassCode
                ? latestSession?.exercises?.[0]?.prompt ||
                  'Xem lộ trình buổi học và bài tập được giao từ giáo viên chủ nhiệm.'
                : myVideoCourses.length > 0
                ? `Đã mở quyền ${myVideoCourses.length} khóa học video • Đã hoàn thành ${completedCount} bài.`
                : 'Tài khoản chưa được gán lớp trực tiếp hoặc khóa học video.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(effectiveClassCode ? '/classrooms' : '/learning')}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-red-800 hover:text-red-950"
          >
            <span>{effectiveClassCode ? 'Xem chi tiết buổi học' : 'Vào khóa học của em'}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card 2: Bài tập nào cần làm / Đã chấm? */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700">
                <Award className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-900">
                {latestGraded
                  ? `Điểm mới: ${latestGraded.score}/10`
                  : `${homeworks.length} bài đã nộp`}
              </span>
            </div>
            <h2 className="mt-3 font-display text-sm font-bold text-stone-900">
              Kết quả & Bài tập về nhà
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-stone-600">
              {latestGraded?.teacher_feedback ||
                'Nộp bài thu âm phát âm và ảnh viết chữ Hán để Lão sư chấm điểm chi tiết.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/learning')}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-emerald-800 hover:text-emerald-950"
          >
            <span>Mở bảng nộp bài & điểm số</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card 3: Giáo viên vừa nhắn gì? */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-amber-50 text-amber-800">
                <MessageSquare className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                {totalUnreadMessages > 0 ? `${totalUnreadMessages} tin chưa đọc` : 'Đã xem hết'}
              </span>
            </div>
            <h2 className="mt-3 font-display text-sm font-bold text-stone-900">
              {primaryRoom?.label ||
                (effectiveClassCode ? `Tin nhắn lớp ${effectiveClassCode}` : 'Hỏi đáp Cô giáo 1-1')}
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-stone-600">
              {primaryRoom?.lastMessage ||
                'Mở phòng trò chuyện để trao đổi bài tập và nhận hướng dẫn từ Lão sư.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() =>
              navigate(
                primaryRoom?.roomId
                  ? `/chat?room=${encodeURIComponent(primaryRoom.roomId)}`
                  : '/chat'
              )
            }
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-amber-900 hover:text-red-900"
          >
            <span>Trả lời trong Zalo KTN</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Card 4: Có thông báo mới không? */}
        <div className="flex flex-col justify-between rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div>
            <div className="flex items-center justify-between">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-blue-700">
                <Bell className="h-5 w-5" />
              </span>
              <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-900">
                {unreadNotifs > 0 ? `${unreadNotifs} thông báo mới` : 'Đã cập nhật'}
              </span>
            </div>
            <h2 className="mt-3 font-display text-sm font-bold text-stone-900">
              Sổ liên lạc & Thông báo
            </h2>
            <p className="mt-1 line-clamp-2 text-xs text-stone-600">
              {notificationsList[0]?.body ||
                'Theo dõi thông báo chấm bài, lịch học bù và nhận xét định kỳ của giáo viên.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate('/notifications')}
            className="mt-4 inline-flex items-center gap-1 text-xs font-bold text-blue-800 hover:text-blue-950"
          >
            <span>Xem tất cả thông báo</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </section>

      {/* Section 10.1: Clear separation between Video Courses ("Khóa học của em") and Live Classrooms ("Lớp trực tiếp của em") */}
      <section
        data-testid="dashboard-courses-vs-classrooms"
        className="grid grid-cols-1 gap-4 lg:grid-cols-2"
      >
        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <Video className="h-4 w-4 text-red-800" />
              <span>1. Khóa học Video của em (Tự học theo tiến độ)</span>
            </h2>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
              Hoàn thành {completedCount} bài
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            {myVideoCourses.length > 0
              ? `Đang mở quyền: ${myVideoCourses.map((c) => c.title).join(' • ')}`
              : 'Chưa mở quyền khóa học video nào. Vui lòng liên hệ Học vụ để kích hoạt.'}
          </p>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <Users className="h-4 w-4 text-amber-700" />
              <span>2. Lớp trực tiếp của em (Có Giáo viên & Lịch cố định)</span>
            </h2>
            <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
              {effectiveClassCode ? `Lớp ${effectiveClassCode}` : 'Chưa xếp lớp'}
            </span>
          </div>
          <p className="mt-1 text-xs text-stone-600">
            {effectiveClassCode
              ? `${sessionsList.length} buổi học đã lên lịch • Bài tập lớp trực tiếp được chấm riêng theo từng buổi.`
              : 'Em đang học theo hình thức Khóa học Video tự học, chưa tham gia lớp trực tiếp cố định.'}
          </p>
        </div>
      </section>

      {/* Bottom 2-Column Section: Recent Homework Feedback & Latest Classroom Activity */}
      <section className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Recent Homework List (7 cols) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:col-span-7">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-stone-900">
              <FileCheck2 className="h-5 w-5 text-red-800" />
              Bảng điểm & Nhận xét bài tập gần đây
            </h2>
            <button
              type="button"
              onClick={() => navigate('/learning')}
              className="text-xs font-bold text-red-800 hover:underline"
            >
              Nộp bài mới →
            </button>
          </div>

          <div className="mt-3 space-y-3">
            {homeworks.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-500">
                Chưa có bài nộp nào. Hãy vào Phòng học Video để thu âm bài đầu tiên nhé!
              </p>
            ) : (
              homeworks.slice(0, 4).map((hw) => (
                <div
                  key={hw.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3.5"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="rounded bg-red-800 px-2 py-0.5 text-[10px] font-bold text-white">
                        Bài {hw.lesson_num}
                      </span>
                      <span className="text-xs font-bold text-stone-900">
                        {hw.lesson_title || 'Bài thu âm thực hành'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-stone-600">
                      {hw.teacher_feedback || hw.student_note || 'Đang chờ giáo viên chấm điểm...'}
                    </p>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    {hw.status === 'graded' ? (
                      <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-700 px-3 py-1.5 font-display text-xs font-bold text-white">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        {hw.score}/10 điểm
                      </span>
                    ) : (
                      <span className="rounded-xl bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-900">
                        Chờ chấm
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Quick Notifications Feed (5 cols) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:col-span-5">
          <div className="flex items-center justify-between border-b border-stone-100 pb-3">
            <h2 className="flex items-center gap-2 font-display text-base font-bold text-stone-900">
              <BookOpen className="h-5 w-5 text-amber-700" />
              Nhật ký Sổ liên lạc mới nhất
            </h2>
            <button
              type="button"
              onClick={() => navigate('/notifications')}
              className="text-xs font-bold text-red-800 hover:underline"
            >
              Xem tất cả →
            </button>
          </div>

          <div className="mt-3 space-y-2.5">
            {notificationsList.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-500">
                Chưa có thông báo mới.
              </p>
            ) : (
              notificationsList.slice(0, 4).map((notif) => (
                <button
                  key={notif.id}
                  type="button"
                  data-testid={`dashboard-notif-item-${notif.id}`}
                  onClick={() => {
                    if (!notif.read) {
                      markReadMutation.mutate(notif.id);
                    }
                    navigate(resolveNotificationLink(notif));
                  }}
                  className={`flex w-full items-start gap-3 rounded-xl border p-3 text-left transition-colors ${
                    !notif.read
                      ? 'border-red-200 bg-red-50/60 hover:bg-red-50'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <div
                    className={`mt-1 h-2.5 w-2.5 shrink-0 rounded-full ${
                      !notif.read ? 'bg-red-600' : 'bg-stone-300'
                    }`}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-xs font-bold text-stone-900">{notif.title}</p>
                      <span className="shrink-0 text-[10px] text-stone-400">
                        {formatRelativeTime(notif.createdAt)}
                      </span>
                    </div>
                    <p className="mt-0.5 line-clamp-2 text-xs text-stone-600">{notif.body}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
};

