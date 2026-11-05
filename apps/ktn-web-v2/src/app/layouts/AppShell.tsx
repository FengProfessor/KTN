import React, { useMemo } from 'react';
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Home,
  PlayCircle,
  Users,
  MessageSquare,
  Bell,
  GraduationCap,
  ShieldCheck,
  LogOut,
  Menu,
  X,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import { DemoControlBar } from '@/components/shared/DemoControlBar';
import { UnreadBadge } from '@/features/chat/components/UnreadBadge';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { useChatRooms } from '@/features/chat/hooks/useMessages';
import { ktnApi } from '@/services/api/ktnApiClient';
import { DEMO_NOTIFICATIONS } from '@/lib/demoData';
import { formatRelativeTime, getInitials, resolveNotificationLink } from '@/lib/utils';
import { KtnNotification } from '@/types/ktn.types';

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const sidebarOpen = useUiStore((s) => s.sidebarOpen);
  const setSidebarOpen = useUiStore((s) => s.setSidebarOpen);
  const notifDropdownOpen = useUiStore((s) => s.notifDropdownOpen);
  const setNotifDropdownOpen = useUiStore((s) => s.setNotifDropdownOpen);
  const resetSessionUiState = useUiStore((s) => s.resetSessionUiState);

  const effectiveRole = user?.role || 'student';

  const { data: chatRooms = [] } = useChatRooms();
  const totalUnreadChat = useMemo(
    () => chatRooms.reduce((sum, r) => sum + (Number(r.unreadCount) || 0), 0),
    [chatRooms]
  );

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
    refetchInterval: isDemoMode ? false : 4000,
  });

  const notificationsList = notificationsQuery.data?.notifications || [];
  const unreadNotifications = notificationsList.filter((n) => !n.read).length;
  const recentNotifications = notificationsList.slice(0, 5);

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) return { markedCount: 0 };
      const unreadIds = notificationsList.filter((n) => !n.read).map((n) => n.id);
      if (unreadIds.length === 0) return { markedCount: 0 };
      return ktnApi.markNotificationsRead(unreadIds);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      if (isDemoMode) return { markedCount: 1 };
      return ktnApi.markNotificationsRead([notifId]);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const navItems = useMemo(() => {
    const base = [
      {
        to: '/',
        label: 'Tổng quan',
        icon: Home,
        testId: 'nav-dashboard',
      },
      {
        to: '/learning',
        label: 'Học Video',
        icon: PlayCircle,
        testId: 'nav-learning',
      },
      {
        to: '/classrooms',
        label: 'Lớp & Bài tập',
        icon: Users,
        testId: 'nav-classrooms',
      },
      {
        to: '/chat',
        label: 'Chat Zalo Lớp',
        icon: MessageSquare,
        badge: totalUnreadChat,
        testId: 'nav-chat',
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        badge: unreadNotifications,
        testId: 'nav-notifications',
      },
    ];

    if (effectiveRole === 'teacher' || effectiveRole === 'admin') {
      base.push({
        to: '/teacher',
        label: 'Cổng Giáo viên',
        icon: GraduationCap,
        testId: 'nav-teacher',
      });
    }

    if (effectiveRole === 'admin') {
      base.push({
        to: '/admin',
        label: 'Quản trị KTN',
        icon: ShieldCheck,
        testId: 'nav-admin',
      });
    }

    return base;
  }, [effectiveRole, totalUnreadChat, unreadNotifications]);

  const handleLogout = async () => {
    await logout();
    queryClient.clear();
    resetSessionUiState();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-stone-900">
      {/* Top Demo / Live Mode Bar */}
      <DemoControlBar />

      <div className="flex flex-1">
        {/* Desktop Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex">
          {/* Brand Logo */}
          <div className="flex items-center gap-3 border-b border-stone-200 px-5 py-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-red-800 to-red-950 font-display text-sm font-extrabold text-amber-300 shadow-sm">
              KTN
            </div>
            <div className="min-w-0">
              <p className="truncate font-display text-sm font-extrabold text-stone-900">
                Khổng Tử Nhí
              </p>
              <p className="truncate text-[11px] font-medium text-stone-500">
                Sổ Liên Lạc & Học Tập V2
              </p>
            </div>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 space-y-1 p-3" aria-label="Điều hướng chính">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  data-testid={item.testId}
                  className={({ isActive }) =>
                    `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all ${
                      isActive
                        ? 'bg-red-800 text-white shadow-sm'
                        : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950'
                    }`
                  }
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-4 w-4 shrink-0" />
                    <span>{item.label}</span>
                  </div>
                  {item.badge && item.badge > 0 ? (
                    <UnreadBadge count={item.badge} />
                  ) : null}
                </NavLink>
              );
            })}
          </nav>

          {/* User Profile Footer */}
          <div className="border-t border-stone-200 p-3.5">
            <div className="flex items-center gap-2.5 rounded-xl bg-stone-50 p-2.5 border border-stone-200/80">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-800 text-xs font-bold text-white">
                {getInitials(user?.name || 'KTN')}
              </div>
              <div className="min-w-0 flex-1">
                <p
                  data-testid="sidebar-user-name"
                  className="truncate text-xs font-bold text-stone-900"
                >
                  {user?.name || 'Học viên KTN'}
                </p>
                <p data-testid="sidebar-user-subtitle" className="truncate text-[11px] text-stone-500">
                  {effectiveRole === 'teacher'
                    ? 'Giáo viên chủ nhiệm'
                    : effectiveRole === 'admin'
                    ? 'Quản lý Học vụ'
                    : user?.classCode
                    ? `Lớp ${user.classCode}`
                    : isDemoMode
                    ? 'Lớp YCT2-04'
                    : 'Học viên tự học / Chưa xếp lớp'}
                </p>
              </div>
              <button
                type="button"
                data-testid="logout-btn"
                onClick={handleLogout}
                className="rounded-lg p-1.5 text-stone-500 hover:bg-red-100 hover:text-red-800"
                title="Đăng xuất"
                aria-label="Đăng xuất"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          </div>
        </aside>

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Top Header */}
          <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-stone-200 bg-white/95 px-4 backdrop-blur-md sm:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 text-stone-700 lg:hidden"
                aria-label="Mở menu điều hướng"
              >
                {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>

              <div className="flex items-center gap-2">
                <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-red-800 font-display text-xs font-extrabold text-amber-300 lg:hidden">
                  KTN
                </span>
                <span className="font-display text-sm font-bold text-stone-900">
                  {location.pathname.startsWith('/chat')
                    ? 'Phòng Chat Zalo Lớp Học'
                    : location.pathname.startsWith('/learning')
                    ? 'Phòng Học Video & Bài Tập'
                    : location.pathname.startsWith('/classrooms')
                    ? 'Lớp Học Trực Tiếp & Lộ Trình'
                    : location.pathname.startsWith('/teacher')
                    ? 'Không Gian Giáo Viên Chủ Nhiệm'
                    : location.pathname.startsWith('/admin')
                    ? 'Quản Trị Học Viện KTN'
                    : location.pathname.startsWith('/notifications')
                    ? 'Trung Tâm Thông Báo'
                    : 'Sổ Liên Lạc Điện Tử KTN'}
                </span>
              </div>
            </div>

            {/* Right Header Controls: Quick Chat + Notification Bell Dropdown + User Pill */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/chat')}
                className="relative inline-flex h-9 items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-3 text-xs font-bold text-stone-700 hover:bg-stone-100"
              >
                <MessageSquare className="h-4 w-4 text-red-800" />
                <span className="hidden sm:inline">Chat Lớp</span>
                {totalUnreadChat > 0 && <UnreadBadge count={totalUnreadChat} />}
              </button>

              {/* Notification Bell & Dropdown */}
              <div className="relative">
                <button
                  type="button"
                  data-testid="header-notification-bell"
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className="relative inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100"
                  aria-label="Thông báo"
                >
                  <Bell className="h-4 w-4" />
                  {unreadNotifications > 0 && (
                    <span
                      data-testid="header-notification-badge"
                      className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold text-white"
                    >
                      {unreadNotifications}
                    </span>
                  )}
                </button>

                {notifDropdownOpen && (
                  <div
                    data-testid="header-notification-dropdown"
                    className="absolute right-0 mt-2 w-80 sm:w-96 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl z-50"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className="font-display text-xs font-bold text-stone-900">
                          Thông báo mới nhất
                        </span>
                        {unreadNotifications > 0 && (
                          <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                            {unreadNotifications}
                          </span>
                        )}
                      </div>
                      {unreadNotifications > 0 && (
                        <button
                          type="button"
                          onClick={() => markAllReadMutation.mutate()}
                          className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 hover:underline"
                        >
                          <CheckCheck className="h-3.5 w-3.5" />
                          Đọc tất cả
                        </button>
                      )}
                    </div>

                    <div className="max-h-80 overflow-y-auto divide-y divide-stone-100">
                      {recentNotifications.length === 0 ? (
                        <p className="p-6 text-center text-xs text-stone-500">
                          Chưa có thông báo mới.
                        </p>
                      ) : (
                        recentNotifications.map((n) => (
                          <button
                            key={n.id}
                            type="button"
                            data-testid={`header-notif-item-${n.id}`}
                            onClick={() => {
                              if (!n.read) {
                                markSingleReadMutation.mutate(n.id);
                              }
                              setNotifDropdownOpen(false);
                              navigate(resolveNotificationLink(n));
                            }}
                            className={`flex w-full items-start gap-3 px-4 py-3 text-left transition-colors ${
                              !n.read ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-stone-50'
                            }`}
                          >
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                !n.read ? 'bg-red-600' : 'bg-stone-300'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-bold text-stone-900">
                                  {n.title}
                                </p>
                                <span className="shrink-0 text-[10px] text-stone-400">
                                  {formatRelativeTime(n.createdAt)}
                                </span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                                {n.body}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="border-t border-stone-100 bg-stone-50 p-2 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifDropdownOpen(false);
                          navigate('/notifications');
                        }}
                        className="w-full rounded-xl py-1.5 text-xs font-bold text-red-800 hover:bg-red-50"
                      >
                        Mở Trung tâm Thông báo đầy đủ →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {!user && !isDemoMode && (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Đăng nhập
                </button>
              )}
            </div>
          </header>

          {/* Mobile Drawer Menu */}
          {sidebarOpen && (
            <div className="border-b border-stone-200 bg-white p-3 lg:hidden">
              <div className="space-y-1">
                {navItems.map((item) => {
                  const Icon = item.icon;
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.to === '/'}
                      onClick={() => setSidebarOpen(false)}
                      className={({ isActive }) =>
                        `flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold ${
                          isActive ? 'bg-red-800 text-white' : 'text-stone-700 hover:bg-stone-100'
                        }`
                      }
                    >
                      <div className="flex items-center gap-3">
                        <Icon className="h-4 w-4" />
                        <span>{item.label}</span>
                      </div>
                      {item.badge && item.badge > 0 ? <UnreadBadge count={item.badge} /> : null}
                    </NavLink>
                  );
                })}
                <button
                  type="button"
                  onClick={handleLogout}
                  className="flex w-full items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold text-red-800 hover:bg-red-50"
                >
                  <LogOut className="h-4 w-4" />
                  <span>Đăng xuất ({user?.name || 'KTN'})</span>
                </button>
              </div>
            </div>
          )}

          {/* Main Page Outlet */}
          <main className="mx-auto w-full max-w-[1440px] flex-1 p-3 sm:p-5 pb-20 lg:pb-6">
            <Outlet />
          </main>

          {/* Mobile Bottom Navigation Bar */}
          <nav
            data-testid="mobile-bottom-nav"
            aria-label="Điều hướng di động"
            className="fixed bottom-0 left-0 right-0 z-30 flex items-center justify-around border-t border-stone-200 bg-white/95 px-1 py-1.5 backdrop-blur-md lg:hidden"
          >
            {navItems.slice(0, 5).map((item) => {
              const Icon = item.icon;
              return (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  className={({ isActive }) =>
                    `relative flex flex-col items-center gap-0.5 rounded-xl px-2.5 py-1 text-[10.5px] font-bold ${
                      isActive ? 'text-red-800' : 'text-stone-500'
                    }`
                  }
                >
                  <Icon className="h-4 w-4" />
                  <span className="truncate max-w-[68px]">{item.label}</span>
                  {item.badge && item.badge > 0 ? (
                    <span className="absolute right-1.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                      {item.badge}
                    </span>
                  ) : null}
                </NavLink>
              );
            })}
          </nav>
        </div>
      </div>
    </div>
  );
};
