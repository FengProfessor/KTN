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
import { ChatImageLightbox } from '@/features/chat/components/AttachmentPreview';

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
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const notifDropdownRef = useRef<HTMLDivElement | null>(null);

  // Close notification dropdown automatically when navigating to another page
  useEffect(() => {
    setNotifDropdownOpen(false);
  }, [location.pathname, location.search, setNotifDropdownOpen]);

  // Close notification dropdown on outside pointer/touch/click or Escape key
  useEffect(() => {
    if (!notifDropdownOpen) return;

    const handleOutsideInteraction = (event: MouseEvent | TouchEvent | PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (notifDropdownRef.current?.contains(target)) return;
      if (bellButtonRef.current?.contains(target)) return;
      setNotifDropdownOpen(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        setNotifDropdownOpen(false);
        bellButtonRef.current?.focus();
      }
    };

    document.addEventListener('pointerdown', handleOutsideInteraction, true);
    document.addEventListener('mousedown', handleOutsideInteraction, true);
    document.addEventListener('touchstart', handleOutsideInteraction, {
      capture: true,
      passive: true,
    });
    document.addEventListener('keydown', handleKeyDown, true);

    return () => {
      document.removeEventListener('pointerdown', handleOutsideInteraction, true);
      document.removeEventListener('mousedown', handleOutsideInteraction, true);
      document.removeEventListener('touchstart', handleOutsideInteraction, true);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [notifDropdownOpen, setNotifDropdownOpen]);

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

  // Register Service Worker (/sw.js), auto-sync existing PushSubscription, and handle deep-links
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
    let cancelled = false;
    let lastSyncTs = 0;

    const urlBase64ToUint8Array = (base64String: string): Uint8Array => {
      const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
      const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
      const rawData = window.atob(base64);
      const outputArray = new Uint8Array(rawData.length);
      for (let i = 0; i < rawData.length; ++i) {
        outputArray[i] = rawData.charCodeAt(i);
      }
      return outputArray;
    };

    const hasMatchingApplicationServerKey = (
      sub: PushSubscription | null,
      expectedKeyBytes: Uint8Array
    ): boolean => {
      try {
        const rawKey = sub?.options?.applicationServerKey;
        if (!rawKey) return true;
        const actual = new Uint8Array(rawKey);
        if (actual.length !== expectedKeyBytes.length) return false;
        for (let i = 0; i < actual.length; i++) {
          if (actual[i] !== expectedKeyBytes[i]) return false;
        }
        return true;
      } catch {
        return true;
      }
    };

    const syncPushSubscriptionForSession = async (force = false) => {
      if (cancelled || isDemoMode || !user?.email || !('PushManager' in window)) return;
      const now = Date.now();
      if (!force && now - lastSyncTs < 15000) return;
      lastSyncTs = now;
      try {
        await navigator.serviceWorker.register('/sw.js', { scope: '/' });
        const readyReg = await navigator.serviceWorker.ready;
        if (cancelled || !readyReg?.pushManager) return;

        let vapidPublicKey =
          'BG4yPEa0evkPFiDAtau85Mg90U2WimsmOCRZgvIqeXQzUDzts5yR75wQub8YJCSXk0sK5jN3Jc3Hbp9jIVRECPM';
        try {
          const keyRes = await ktnApi.getVapidPublicKey();
          if (keyRes.publicKey && keyRes.publicKey.length >= 40) {
            vapidPublicKey = keyRes.publicKey;
          }
        } catch {
          // fallback to default VAPID public key
        }
        const appServerKey = urlBase64ToUint8Array(vapidPublicKey);

        let sub = await readyReg.pushManager.getSubscription();
        let subJson = sub ? sub.toJSON() : null;
        let previousEndpoint = '';
        const isFakeOrCorrupt =
          subJson &&
          (!subJson.endpoint ||
            subJson.endpoint.includes('push.khongtunhi.com/v2/') ||
            !subJson.keys?.p256dh ||
            !subJson.keys?.auth ||
            subJson.keys.p256dh === 'ktn-mobile-web-p256dh');
        const isVapidKeyMismatch = sub ? !hasMatchingApplicationServerKey(sub, appServerKey) : false;

        if (sub && (isFakeOrCorrupt || isVapidKeyMismatch)) {
          if (isVapidKeyMismatch && subJson?.endpoint) {
            previousEndpoint = String(subJson.endpoint).trim();
          }
          try {
            await sub.unsubscribe();
          } catch {
            // ignore
          }
          sub = null;
          subJson = null;
        }

        if (!sub && 'Notification' in window && Notification.permission === 'granted') {
          sub = await readyReg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey as unknown as BufferSource,
          });
          subJson = sub ? sub.toJSON() : null;
        }

        const endpoint = String(subJson?.endpoint || '').trim();
        const p256dh = String(subJson?.keys?.p256dh || '').trim();
        const auth = String(subJson?.keys?.auth || '').trim();
        if (!endpoint || !p256dh || !auth || cancelled) return;

        const saveRes = await ktnApi.subscribePush(
          {
            endpoint,
            expirationTime: subJson?.expirationTime ?? null,
            keys: { p256dh, auth },
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ktn-web-v2',
          },
          previousEndpoint || undefined
        );
        if (saveRes.ok) {
          try {
            localStorage.setItem('ktn_push_enabled_v2', '1');
            window.dispatchEvent(
              new CustomEvent('ktn:push-subscription-synced', {
                detail: { enabled: true, endpoint },
              })
            );
          } catch {
            // ignore
          }
        }
      } catch {
        // Non-fatal: user can still explicitly re-enable in NotificationCenter
      }
    };

    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => null);
    syncPushSubscriptionForSession(true);

    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncPushSubscriptionForSession(false);
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    const onSwMessage = (event: MessageEvent) => {
      const payload = event.data || {};
      if (payload.type === 'KTN_NOTIFICATION_CLICKED') {
        const rawUrl = String(
          payload.data?.url || payload.data?.action_url || payload.data?.actionUrl || ''
        );
        const target = resolveNotificationLink(
          {
            ...(payload.data || {}),
            actionUrl: rawUrl || payload.data?.actionUrl,
          },
          user?.role
        );
        if (/^https:\/\//i.test(target)) {
          window.open(target, '_blank', 'noopener,noreferrer');
        } else {
          navigate(target);
        }
      } else if (payload.type === 'KTN_PUSH_SUBSCRIPTION_CHANGED' && payload.subscription) {
        if (!isDemoMode && user?.email) {
          ktnApi
            .subscribePush(payload.subscription, payload.previousEndpoint)
            .then((res) => {
              if (res.ok) {
                try {
                  localStorage.setItem('ktn_push_enabled_v2', '1');
                  window.dispatchEvent(
                    new CustomEvent('ktn:push-subscription-synced', {
                      detail: { enabled: true, endpoint: res.endpoint },
                    })
                  );
                } catch {
                  // ignore
                }
              }
            })
            .catch(() => null);
        }
      } else if (payload.type === 'KTN_PUSH_RECEIVED') {
        queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
        const pushType = String(payload.data?.type || payload.data?.eventType || '').trim();
        if (
          pushType === 'class_created' ||
          pushType === 'class_joined' ||
          pushType === 'class_teacher_changed' ||
          pushType === 'schedule_changed'
        ) {
          queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
          queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
          queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
        }
      }
    };
    navigator.serviceWorker.addEventListener('message', onSwMessage);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibilityChange);
      navigator.serviceWorker.removeEventListener('message', onSwMessage);
    };
  }, [navigate, isDemoMode, user?.email, user?.role, queryClient]);

  // Alert user via in-app toast when unread notifications arrive in foreground
  useEffect(() => {
    const activeEmail = user?.email || (isDemoMode ? 'demo' : '');
    if (!activeEmail || notificationsList.length === 0) return;

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
    resetSessionUiState();
    queryClient.clear();
    try {
      sessionStorage.removeItem('ktn_post_login_redirect');
    } catch {
      // ignore
    }
    const logoutPromise = logout();
    navigate('/login', { replace: true });
    await logoutPromise;
    queryClient.clear();
    resetSessionUiState();
    try {
      sessionStorage.removeItem('ktn_post_login_redirect');
    } catch {
      // ignore
    }
    navigate('/login', { replace: true });
  };

  const headerInfo = isRestoringLiveSession
    ? { title: 'Khổng Tử Nhí', subtitle: 'Đang khôi phục phiên...' }
    : resolveHeaderTitle(location.pathname, effectiveRole, user);
  const isChatRoute =
    location.pathname === '/chat' || location.pathname.startsWith('/chat/');

  return (
    <div
      className={`flex flex-col bg-[#FAF8F5] text-stone-900 ${
        isChatRoute ? 'h-[100dvh] max-h-[100dvh] overflow-hidden' : 'min-h-screen'
      }`}
    >
      <DemoControlBar />

      <div className={`flex flex-1 ${isChatRoute ? 'min-h-0 overflow-hidden' : ''}`}>
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
        <div
          className={`flex min-w-0 flex-1 flex-col ${
            isChatRoute ? 'min-h-0 overflow-hidden' : ''
          }`}
        >
          {/* Compact Top App Bar (48px-52px on mobile) */}
          <header
            data-testid="compact-top-header"
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between border-b border-stone-200 bg-white/95 px-3 backdrop-blur-md sm:h-13 sm:px-5"
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
                  ref={bellButtonRef}
                  type="button"
                  data-testid="header-notification-bell"
                  aria-label="Thông báo"
                  aria-expanded={notifDropdownOpen}
                  aria-haspopup="dialog"
                  aria-controls="header-notification-dropdown"
                  onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                  className={`relative inline-flex h-9 w-9 items-center justify-center rounded-xl border transition-colors ${
                    notifDropdownOpen
                      ? 'border-red-300 bg-red-50 text-red-800'
                      : 'border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
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
                    id="header-notification-dropdown"
                    ref={notifDropdownRef}
                    role="dialog"
                    aria-label="Thông báo gần đây"
                    data-testid="header-notification-dropdown"
                    className="fixed left-3 right-3 top-13 z-50 max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-xs font-bold text-stone-900">
                          Thông báo mới nhất
                        </span>
                        {unreadNotifications > 0 && (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {unreadNotifications} chưa đọc
                          </span>
                        )}
                      </div>
                      <button
                        type="button"
                        data-testid="header-notif-mark-all-read-btn"
                        disabled={unreadNotifications === 0 || markAllReadMutation.isPending}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (unreadNotifications > 0) {
                            markAllReadMutation.mutate();
                          }
                        }}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-red-800 hover:underline disabled:cursor-default disabled:text-stone-400 disabled:no-underline"
                      >
                        <CheckCheck className="h-3.5 w-3.5" />
                        Đánh dấu tất cả đã đọc
                      </button>
                    </div>

                    <div
                      data-testid="header-notif-scroll-list"
                      className="max-h-[min(60vh,20rem)] divide-y divide-stone-100 overflow-y-auto overscroll-contain"
                    >
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
                              if (
                                n.type === 'class_created' ||
                                n.type === 'class_joined' ||
                                n.type === 'class_teacher_changed' ||
                                n.type === 'schedule_changed'
                              ) {
                                queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
                                queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
                              }
                              setNotifDropdownOpen(false);
                              const target = resolveNotificationLink(n, user?.role);
                              if (/^https:\/\//i.test(target)) {
                                window.open(target, '_blank', 'noopener,noreferrer');
                              } else {
                                navigate(target);
                              }
                            }}
                            className={`flex w-full items-start gap-2.5 px-3.5 py-2.5 text-left transition-colors ${
                              !n.read ? 'bg-red-50/50 hover:bg-red-50' : 'hover:bg-stone-50'
                            }`}
                          >
                            <span
                              data-testid={`header-notif-dot-${n.id}`}
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${
                                !n.read ? 'bg-red-600' : 'bg-stone-300'
                              }`}
                            />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <p className="truncate text-xs font-bold text-stone-900">
                                  {n.title}
                                </p>
                                <span className="shrink-0 text-[10px] font-medium text-stone-400">
                                  {formatRelativeTime(n.createdAt)}
                                </span>
                              </div>
                              <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-600">
                                {n.body}
                              </p>
                              <div className="mt-1 flex items-center justify-between">
                                <span
                                  className={`text-[10px] font-semibold ${
                                    !n.read ? 'text-red-700' : 'text-stone-400'
                                  }`}
                                >
                                  {!n.read ? 'Chưa đọc' : 'Đã đọc'}
                                </span>
                                {n.actionLabel && (
                                  <span className="text-[10px] font-bold text-red-800">
                                    {n.actionLabel} →
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                        ))
                      )}
                    </div>

                    <div className="border-t border-stone-100 bg-stone-50 p-1.5 text-center">
                      <button
                        type="button"
                        data-testid="header-notif-view-all-btn"
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
          <main
            className={`mx-auto w-full max-w-[1440px] flex-1 ${
              isChatRoute
                ? 'flex min-h-0 flex-col overflow-hidden px-2 pt-1.5 pb-[calc(3.75rem+env(safe-area-inset-bottom,0px))] sm:px-4 sm:pt-3 lg:pb-4'
                : 'px-3 py-2.5 pb-16 sm:p-4 lg:pb-6'
            }`}
          >
            <Outlet />
          </main>

          {/* Purposeful Role-Based Mobile Bottom Navigation */}
          {!isRestoringLiveSession && (
            <RoleBottomNavigation role={effectiveRole} badges={navBadges} />
          )}

          {/* Global Full-Screen Image Lightbox Portal */}
          <ChatImageLightbox />
        </div>
      </div>
    </div>
  );
};
