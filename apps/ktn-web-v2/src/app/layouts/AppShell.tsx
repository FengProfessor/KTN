import React, { useMemo, useEffect, useRef } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  LogOut,
  CheckCheck,
  Sparkles,
} from 'lucide-react';
import { DemoControlBar } from '@/components/shared/DemoControlBar';
import { RoleBottomNavigation } from '@/app/navigation/RoleBottomNavigation';
import { RoleDesktopNavigation } from '@/app/navigation/RoleDesktopNavigation';
import { resolveHeaderTitle } from '@/app/navigation/roleRoutes';
import type { NavBadgeKey } from '@/app/navigation/navigationConfig';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { useChatRooms } from '@/features/chat/hooks/useMessages';
import { ktnApi } from '@/services/api/ktnApiClient';
import { DEMO_HOMEWORKS, DEMO_NOTIFICATIONS } from '@/lib/demoData';
import { formatRelativeTime, resolveNotificationLink } from '@/lib/utils';
import { KtnHomework, KtnNotification, KtnOrder } from '@/types/ktn.types';

export const AppShell: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();

  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const logout = useAuthStore((s) => s.logout);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const setDemoMode = useUiStore((s) => s.setDemoMode);
  const notifDropdownOpen = useUiStore((s) => s.notifDropdownOpen);
  const setNotifDropdownOpen = useUiStore((s) => s.setNotifDropdownOpen);
  const resetSessionUiState = useUiStore((s) => s.resetSessionUiState);
  const addToast = useUiStore((s) => s.addToast);

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedNotifsForUserRef = useRef<string>('');

  const isRestoringLiveSession = isRestoring && !isDemoMode && !user;
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
          readIds: DEMO_NOTIFICATIONS.filter((n) => n.id && n.read).map((n) => n.id),
        };
      }
      return ktnApi.getNotifications();
    },
    enabled: Boolean(user) || isDemoMode,
    staleTime: 2000,
    refetchInterval: isDemoMode ? false : 4000,
    refetchIntervalInBackground: true,
  });

  const teacherHomeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', 'teacher-badge', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: !isRestoringLiveSession && effectiveRole === 'teacher' && (Boolean(user) || isDemoMode),
  });

  const adminOrdersQuery = useQuery<KtnOrder[]>({
    queryKey: ['ktn-admin-orders', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return [];
      return ktnApi.getOrders();
    },
    enabled: !isRestoringLiveSession && effectiveRole === 'admin' && (Boolean(user) || isDemoMode),
  });

  const notificationsList = notificationsQuery.data?.notifications || [];
  const unreadNotifications = notificationsList.filter((n) => !n.read).length;
  const recentNotifications = notificationsList.slice(0, 5);

  // Register Service Worker (/sw.js) and handle notification click deep-links
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);

    const onSwMessage = (event: MessageEvent) => {
      const payload = event.data || {};
      if (payload.type === 'KTN_NOTIFICATION_CLICKED' && payload.data?.url) {
        const rawUrl = String(payload.data.url);
        const hashIdx = rawUrl.indexOf('#');
        if (hashIdx >= 0) {
          navigate(rawUrl.slice(hashIdx + 1) || '/notifications');
        } else if (rawUrl.startsWith('/')) {
          navigate(rawUrl);
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, [navigate]);

  // Alert user via in-app toast & Service Worker notification when unread notifications arrive
  useEffect(() => {
    const activeEmail = user?.email || (isDemoMode ? 'demo' : '');
    if (!activeEmail || notificationsList.length === 0) return;

    const triggerSwNotification = (notif: KtnNotification) => {
      if (typeof window === 'undefined' || !('Notification' in window) || Notification.permission !== 'granted') {
        return;
      }
      const deepLink = `/custom-page/so-lien-lac-test#${resolveNotificationLink(notif)}`;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.ready
          .then((reg) => {
            if (reg.active) {
              reg.active.postMessage({
                type: 'KTN_SHOW_NOTIFICATION',
                title: notif.title,
                body: notif.body,
                data: { id: notif.id, action_url: deepLink, url: deepLink },
              });
            } else if (typeof reg.showNotification === 'function') {
              reg.showNotification(notif.title, {
                body: notif.body,
                tag: notif.id,
                data: { id: notif.id, action_url: deepLink, url: deepLink },
              });
            }
          })
          .catch(() => null);
      }
    };

    if (initializedNotifsForUserRef.current !== activeEmail) {
      initializedNotifsForUserRef.current = activeEmail;
      seenNotifIdsRef.current = new Set(notificationsList.map((n) => n.id));
      const unreadItems = notificationsList.filter((n) => !n.read);
      if (unreadItems.length > 0) {
        const sessionKey = `ktn_v2_unread_welcomed_${activeEmail}`;
        let alreadyWelcomed = false;
        try {
          alreadyWelcomed = sessionStorage.getItem(sessionKey) === '1';
          sessionStorage.setItem(sessionKey, '1');
        } catch {
          // ignore
        }
        if (!alreadyWelcomed) {
          const latest = unreadItems[0];
          addToast({
            title:
              unreadItems.length === 1
                ? `🔔 ${latest.title}`
                : `🔔 Bạn có ${unreadItems.length} thông báo mới`,
            description: latest.body,
            variant: 'default',
          });
          triggerSwNotification(latest);
        }
      }
      return;
    }

    const newlyArrivedUnread = notificationsList.filter(
      (n) => !seenNotifIdsRef.current.has(n.id) && !n.read
    );
    for (const n of notificationsList) {
      seenNotifIdsRef.current.add(n.id);
    }

    if (newlyArrivedUnread.length > 0) {
      const topNotif = newlyArrivedUnread[0];
      addToast({
        title: `🔔 ${topNotif.title}`,
        description: topNotif.body,
        variant: 'default',
      });
      triggerSwNotification(topNotif);
    }
  }, [notificationsList, user?.email, isDemoMode, addToast]);

  const pendingGradingCount = useMemo(
    () => (teacherHomeworksQuery.data || []).filter((h) => h.status === 'pending').length,
    [teacherHomeworksQuery.data]
  );

  const pendingOrdersCount = useMemo(
    () =>
      (adminOrdersQuery.data || []).filter((o) => o.approval_status === 'pending').length,
    [adminOrdersQuery.data]
  );

  const navBadges = useMemo<Partial<Record<NavBadgeKey, number>>>(
    () => ({
      chat: totalUnreadChat,
      notifications: unreadNotifications,
      grading: pendingGradingCount,
      orders: pendingOrdersCount,
    }),
    [totalUnreadChat, unreadNotifications, pendingGradingCount, pendingOrdersCount]
  );

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

  const handleLogout = async () => {
    setDemoMode(false);
    await logout();
    queryClient.clear();
    resetSessionUiState();
    navigate('/login');
  };

  const headerInfo = isRestoringLiveSession
    ? { title: 'Khổng Tử Nhí', subtitle: 'Đang khôi phục phiên...' }
    : resolveHeaderTitle(location.pathname, effectiveRole, user);

  return (
    <div className="flex min-h-screen flex-col bg-[#FAF8F5] text-stone-900">
      <DemoControlBar />

      <div className="flex flex-1">
        {/* Role-Specific Desktop Navigation (hidden while restoring unverified live session) */}
        {!isRestoringLiveSession && (
          <RoleDesktopNavigation
            role={effectiveRole}
            user={user}
            isDemoMode={isDemoMode}
            badges={navBadges}
            onLogout={handleLogout}
          />
        )}

        {/* Main Content Area */}
        <div className="flex min-w-0 flex-1 flex-col">
          {/* Compact Top App Bar (48px-52px on mobile) */}
          <header
            data-testid="compact-top-header"
            className="sticky top-0 z-30 flex h-12 items-center justify-between border-b border-stone-200 bg-white/95 px-3 backdrop-blur-md sm:h-13 sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                data-testid="header-home-btn"
                onClick={() => navigate('/')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-800 font-display text-xs font-extrabold text-amber-300 shadow-2xs transition-transform active:scale-95"
                title="Trang chủ"
                aria-label="Trang chủ"
              >
                KTN
              </button>

              <div className="min-w-0">
                <p
                  data-testid="header-page-title"
                  className="truncate font-display text-sm font-bold leading-tight text-stone-900 sm:text-base"
                >
                  {headerInfo.title}
                </p>
                {headerInfo.subtitle && (
                  <p className="truncate text-[11px] font-medium leading-tight text-stone-500">
                    {headerInfo.subtitle}
                  </p>
                )}
              </div>
            </div>

            {/* Right Header Controls: Notification Bell + Logout */}
            <div className="flex shrink-0 items-center gap-1.5">
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
                    className="fixed left-2.5 right-2.5 top-13 z-50 overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-88"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-xs font-bold text-stone-900">
                          Thông báo
                        </span>
                        {unreadNotifications > 0 && (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
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

                    <div className="max-h-72 divide-y divide-stone-100 overflow-y-auto">
                      {recentNotifications.length === 0 ? (
                        <p className="p-5 text-center text-xs text-stone-500">
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
                            className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
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
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-stone-600">
                                {n.body}
                              </p>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="border-t border-stone-100 bg-stone-50 p-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => {
                          setNotifDropdownOpen(false);
                          navigate('/notifications');
                        }}
                        className="w-full rounded-xl py-1.5 text-xs font-bold text-red-800 hover:bg-red-50"
                      >
                        Xem tất cả thông báo →
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(user || isDemoMode) ? (
                <button
                  type="button"
                  data-testid="logout-btn"
                  onClick={handleLogout}
                  className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-800"
                  title="Đăng xuất"
                  aria-label="Đăng xuất"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              ) : isRestoringLiveSession ? null : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="inline-flex h-9 items-center gap-1 rounded-xl bg-red-800 px-3 text-xs font-bold text-white"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Đăng nhập
                </button>
              )}
            </div>
          </header>

          {/* Main Page Outlet */}
          <main className="mx-auto w-full max-w-[1440px] flex-1 px-3 py-2.5 pb-16 sm:p-4 lg:pb-6">
            <Outlet />
          </main>

          {/* Purposeful Role-Based Mobile Bottom Navigation */}
          {!isRestoringLiveSession && (
            <RoleBottomNavigation role={effectiveRole} badges={navBadges} />
          )}
        </div>
      </div>
    </div>
  );
};
