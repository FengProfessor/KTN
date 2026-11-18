import React, { useMemo, useEffect, useRef, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  LogOut,
  CheckCheck,
  Sparkles,
  KeyRound,
  X,
  Download,
  UserCircle,
} from 'lucide-react';
import { usePwaInstall } from '@/hooks/usePwaInstall';
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
import { RouteErrorBoundary } from '@/components/shared/ErrorBoundary';
import { translateNotificationItem, useI18n } from '@/i18n';

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
  const { lang, toggleLang, tr } = useI18n();

  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedNotifsForUserRef = useRef<string>('');
  const prevSummarySigRef = useRef<string>('');
  const bellButtonRef = useRef<HTMLButtonElement | null>(null);
  const notifDropdownRef = useRef<HTMLDivElement | null>(null);

  const [changePwdModalOpen, setChangePwdModalOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);
  const {
    canNativeInstall,
    isInstalled: isPwaInstalled,
    installing: isPwaInstalling,
    platformHint,
    showGuideModal: pwaGuideOpen,
    setShowGuideModal: setPwaGuideOpen,
    triggerInstall: handleTriggerPwaInstall,
  } = usePwaInstall();

  const handleOpenChangePwdModal = () => {
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setPwdError(null);
    setChangePwdModalOpen(true);
  };

  const handleSubmitChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    const minLen = effectiveRole === 'admin' ? 8 : 6;
    if (!currentPassword.trim()) {
      setPwdError(tr('Vui lòng nhập mật khẩu hiện tại.', 'Please enter your current password.'));
      return;
    }
    if (newPassword.trim().length < minLen) {
      setPwdError(
        tr(
          `Mật khẩu mới cần tối thiểu ${minLen} ký tự.`,
          `New password must be at least ${minLen} characters.`
        )
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError(tr('Xác nhận mật khẩu mới không khớp.', 'New password confirmation does not match.'));
      return;
    }
    if (newPassword === currentPassword) {
      setPwdError(
        tr(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
          'New password must be different from your current password.'
        )
      );
      return;
    }
    if (isDemoMode) {
      addToast({
        title: tr('Đã đổi mật khẩu (Demo)', 'Password updated (Demo)'),
        description: tr(
          'Mật khẩu mới đã được ghi nhận trong phiên dùng thử.',
          'Your new password has been saved for this demo session.'
        ),
        variant: 'success',
      });
      setChangePwdModalOpen(false);
      return;
    }
    setPwdSubmitting(true);
    try {
      const res = await ktnApi.changePassword({
        currentPassword,
        newPassword,
      });
      addToast({
        title: tr('Đổi mật khẩu thành công', 'Password changed successfully'),
        description:
          (lang === 'en' ? '' : res.message) ||
          tr(
            'Bạn có thể dùng mật khẩu mới cho lần đăng nhập tiếp theo.',
            'You can use your new password on your next sign-in.'
          ),
        variant: 'success',
      });
      setChangePwdModalOpen(false);
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : tr(
              'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.',
              'Unable to change password. Please double-check and try again.'
            );
      setPwdError(msg);
    } finally {
      setPwdSubmitting(false);
    }
  };

  // Redirect away from open-shell routes (e.g. /chat, /notifications) when session expires
  useEffect(() => {
    const onSessionExpired = () => {
      if (useUiStore.getState().isDemoMode) return;
      if (!location.pathname.startsWith('/login')) {
        const redirect = encodeURIComponent(`${location.pathname}${location.search}`);
        navigate(`/login?redirect=${redirect}`, { replace: true });
      }
    };
    window.addEventListener('ktn:session-expired', onSessionExpired);
    return () => window.removeEventListener('ktn:session-expired', onSessionExpired);
  }, [location.pathname, location.search, navigate]);

  // Scope and sync lesson completion progress per user (and hydrate from server)
  useEffect(() => {
    const cleanEmail = String(user?.email || '').trim().toLowerCase();
    useUiStore.getState().setProgressUserEmail(cleanEmail || null);
    if (!cleanEmail || isDemoMode) return;
    let cancelled = false;
    ktnApi
      .getLearningProgress()
      .then((res) => {
        if (!cancelled && Array.isArray(res?.completedLessons) && res.completedLessons.length > 0) {
          useUiStore.getState().mergeRemoteCompletedLessons(res.completedLessons);
        }
      })
      .catch(() => null);
    return () => {
      cancelled = true;
    };
  }, [user?.email, isDemoMode]);

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
  const onChatRoute = location.pathname === '/chat' || location.pathname.startsWith('/chat/');
  const isLocalTestHost =
    typeof window !== 'undefined' &&
    ['localhost', '127.0.0.1'].includes(window.location.hostname.toLowerCase());
  const bustNextSummaryRef = useRef(false);
  const summaryPollInterval = useMemo(
    () =>
      isDemoMode
        ? false
        : isLocalTestHost
        ? 30000
        : 90000 + Math.floor(Math.random() * 15000),
    [isDemoMode, isLocalTestHost]
  );

  const { data: chatRooms = [] } = useChatRooms({
    refetchInterval: onChatRoute ? false : isLocalTestHost ? 60000 : 120000,
  });
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
      return ktnApi.getNotifications({ limit: 50, offset: 0 });
    },
    enabled: isDemoMode || (Boolean(user) && notifDropdownOpen),
    staleTime: 10000,
    refetchInterval: isDemoMode ? false : notifDropdownOpen ? 10000 : false,
    refetchIntervalInBackground: false,
  });

  const notificationsSummaryQuery = useQuery({
    queryKey: ['ktn-notifications-summary', user?.email, isDemoMode],
    queryFn: async () => {
      const bust = bustNextSummaryRef.current;
      bustNextSummaryRef.current = false;
      return ktnApi.getNotificationsSummary(bust ? { bust: true } : undefined);
    },
    enabled: !isDemoMode && Boolean(user),
    staleTime: isLocalTestHost ? 10000 : 30000,
    refetchInterval: summaryPollInterval,
    refetchIntervalInBackground: false,
  });

  useEffect(() => {
    prevSummarySigRef.current = '';
  }, [user?.email, isDemoMode]);

  useEffect(() => {
    const d = notificationsSummaryQuery.data;
    if (!d) return;
    const sig = `${d.unreadCount}:${d.totalCount}:${d.latestAt || ''}`;
    if (!prevSummarySigRef.current) {
      prevSummarySigRef.current = sig;
      return;
    }
    if (prevSummarySigRef.current !== sig) {
      prevSummarySigRef.current = sig;
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
    }
  }, [notificationsSummaryQuery.data, queryClient]);

  const teacherHomeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', 'teacher-badge', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: !isRestoringLiveSession && effectiveRole === 'teacher' && (Boolean(user) || isDemoMode),
    staleTime: 15000,
    refetchIntervalInBackground: false,
  });

  const adminOrdersQuery = useQuery<KtnOrder[]>({
    queryKey: ['ktn-admin-orders', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return [];
      return ktnApi.getOrders();
    },
    enabled: !isRestoringLiveSession && effectiveRole === 'admin' && (Boolean(user) || isDemoMode),
    staleTime: 15000,
    refetchIntervalInBackground: false,
  });

  const notificationsList = notificationsQuery.data?.notifications || [];
  const unreadNotifications =
    !isDemoMode && notificationsSummaryQuery.data
      ? Number(notificationsSummaryQuery.data.unreadCount || 0)
      : notificationsList.filter((n) => !n.read).length;
  const recentNotifications = notificationsList.slice(0, 5);

  // Register Service Worker (/sw.js), auto-sync existing PushSubscription, and handle deep-links
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !navigator.serviceWorker) return;
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
        bustNextSummaryRef.current = true;
        queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
        queryClient.invalidateQueries({ queryKey: ['ktn-notifications-summary'] });
        queryClient.invalidateQueries({ queryKey: ['chat-messages'] });
        queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
        queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
        const pushType = String(payload.data?.type || payload.data?.eventType || '').trim();
        if (
          pushType === 'class_created' ||
          pushType === 'class_joined' ||
          pushType === 'class_teacher_changed' ||
          pushType === 'schedule_changed'
        ) {
          queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
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
          const latest = translateNotificationItem(unreadItems[0], lang);
          const cleanBody = String(latest.body || '').replace(
            /\[(?:Đã (?:gửi|đính kèm) (?:ảnh|hình ảnh)(?::\s*[^\r\n]*)?|Ảnh đính kèm|Attached image(?::\s*[^\r\n]*)?)\]/gi,
            tr('📷 Hình ảnh', '📷 Image')
          );
          addToast({
            title:
              unreadItems.length === 1
                ? `🔔 ${latest.title}`
                : tr(
                    `🔔 Bạn có ${unreadItems.length} thông báo mới`,
                    `🔔 You have ${unreadItems.length} new notifications`
                  ),
            description: cleanBody,
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
      const topNotif = translateNotificationItem(newlyArrivedUnread[0], lang);
      const cleanTopBody = String(topNotif.body || '').replace(
        /\[(?:Đã (?:gửi|đính kèm) (?:ảnh|hình ảnh)(?::\s*[^\r\n]*)?|Ảnh đính kèm|Attached image(?::\s*[^\r\n]*)?)\]/gi,
        tr('📷 Hình ảnh', '📷 Image')
      );
      addToast({
        title: `🔔 ${topNotif.title}`,
        description: cleanTopBody,
        variant: 'default',
      });
    }
  }, [notificationsList, user?.email, isDemoMode, addToast, lang, tr]);

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
    onMutate: () => {
      queryClient.setQueryData<{ unreadCount: number; totalCount: number; latestAt?: string | null }>(
        ['ktn-notifications-summary', user?.email, isDemoMode],
        (old) => (old ? { ...old, unreadCount: 0 } : old)
      );
      queryClient.setQueryData<{ notifications: KtnNotification[]; readIds: string[] }>(
        ['ktn-notifications', user?.email, isDemoMode],
        (old) =>
          old
            ? {
                ...old,
                notifications: old.notifications.map((n) => ({ ...n, read: true })),
                readIds: Array.from(new Set([...(old.readIds || []), ...old.notifications.map((n) => n.id)])),
              }
            : old
      );
    },
    onSuccess: () => {
      bustNextSummaryRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications-summary'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: async (notifId: string) => {
      if (isDemoMode) return { markedCount: 1 };
      return ktnApi.markNotificationsRead([notifId]);
    },
    onMutate: (notifId: string) => {
      let wasUnread = true;
      queryClient.setQueryData<{ notifications: KtnNotification[]; readIds: string[] }>(
        ['ktn-notifications', user?.email, isDemoMode],
        (old) => {
          if (!old) return old;
          const target = old.notifications.find((n) => n.id === notifId);
          if (target) wasUnread = !target.read;
          return {
            ...old,
            notifications: old.notifications.map((n) => (n.id === notifId ? { ...n, read: true } : n)),
            readIds: old.readIds.includes(notifId) ? old.readIds : [...old.readIds, notifId],
          };
        }
      );
      if (wasUnread) {
        queryClient.setQueryData<{ unreadCount: number; totalCount: number; latestAt?: string | null }>(
          ['ktn-notifications-summary', user?.email, isDemoMode],
          (old) =>
            old
              ? { ...old, unreadCount: Math.max(0, Number(old.unreadCount || 0) - 1) }
              : old
        );
      }
    },
    onSuccess: () => {
      bustNextSummaryRef.current = true;
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications-summary'] });
      queryClient.invalidateQueries({ queryKey: ['notifications'] });
    },
  });

  const handleLogout = async () => {
    setDemoMode(false);
    resetSessionUiState();
    prevSummarySigRef.current = '';
    queryClient.clear();
    try {
      sessionStorage.removeItem('ktn_post_login_redirect');
      localStorage.removeItem('ktn_push_enabled_v2');
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
      localStorage.removeItem('ktn_push_enabled_v2');
    } catch {
      // ignore
    }
    navigate('/login', { replace: true });
  };

  const headerInfo = isRestoringLiveSession
    ? {
        title: tr('Khổng Tử Nhí', 'Khong Tu Nhi'),
        subtitle: tr('Đang khôi phục phiên...', 'Restoring session...'),
      }
    : resolveHeaderTitle(location.pathname, effectiveRole, user, lang);
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
            className="sticky top-0 z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-stone-200 bg-white/95 px-3 backdrop-blur-md sm:h-13 sm:px-5"
          >
            <div className="flex min-w-0 items-center gap-2.5">
              <button
                type="button"
                data-testid="header-home-btn"
                onClick={() => navigate('/')}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-800 font-display text-xs font-extrabold text-amber-300 shadow-2xs transition-transform active:scale-95"
                title={tr('Trang chủ', 'Home')}
                aria-label={tr('Trang chủ', 'Home')}
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

            {/* Right Header Controls: PWA Install + Language Switch + Notification Bell + Change Password + Logout */}
            <div className="flex shrink-0 items-center gap-1 sm:gap-1.5">
              {!isPwaInstalled && (
                <button
                  type="button"
                  data-testid="header-pwa-install-btn"
                  disabled={isPwaInstalling}
                  onClick={() => void handleTriggerPwaInstall()}
                  title={
                    canNativeInstall
                      ? tr('Cài ứng dụng Khổng Tử Nhí lên máy tính / điện thoại', 'Install Khổng Tử Nhí Desktop App')
                      : tr('Hướng dẫn cài đặt ứng dụng Desktop & nhận thông báo đẩy', 'Install Desktop App & Push guide')
                  }
                  aria-label={tr('Cài Khổng Tử Nhí', 'Install Khổng Tử Nhí')}
                  className="inline-flex h-8 shrink-0 items-center gap-1 rounded-xl border border-red-200 bg-red-50 px-2 text-[11px] font-bold text-red-800 shadow-2xs transition-colors hover:bg-red-100 disabled:opacity-50 sm:h-9 sm:px-2.5"
                >
                  <Download className="h-3.5 w-3.5 shrink-0" />
                  <span className="hidden md:inline">
                    {tr('Cài Khổng Tử Nhí', 'Install Khổng Tử Nhí')}
                  </span>
                </button>
              )}

              <button
                type="button"
                data-testid="header-lang-toggle"
                onClick={toggleLang}
                title={tr('Chuyển ngôn ngữ (Tiếng Việt / English)', 'Switch language (Vietnamese / English)')}
                aria-label={tr('Chuyển ngôn ngữ', 'Switch language')}
                className="inline-flex h-8 shrink-0 items-center rounded-xl border border-stone-200 bg-stone-50 p-0.5 text-[10px] font-extrabold shadow-2xs transition-colors hover:border-amber-300 sm:h-9 sm:text-[11px]"
              >
                <span
                  className={
                    lang === 'vi'
                      ? 'rounded-lg bg-red-800 px-1.5 py-0.5 text-white'
                      : 'px-1.5 py-0.5 text-stone-500'
                  }
                >
                  VI
                </span>
                <span
                  className={
                    lang === 'en'
                      ? 'rounded-lg bg-red-800 px-1.5 py-0.5 text-white'
                      : 'px-1.5 py-0.5 text-stone-500'
                  }
                >
                  EN
                </span>
              </button>

              {/* Notification Bell & Dropdown */}
              <div className="relative">
                <button
                  ref={bellButtonRef}
                  type="button"
                  data-testid="header-notification-bell"
                  aria-label={tr('Thông báo', 'Notifications')}
                  aria-expanded={notifDropdownOpen}
                  aria-haspopup="dialog"
                  aria-controls="header-notification-dropdown"
                  onClick={() => {
                    const next = !notifDropdownOpen;
                    setNotifDropdownOpen(next);
                    if (next && !isDemoMode) {
                      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
                    }
                  }}
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
                    aria-label={tr('Thông báo gần đây', 'Recent notifications')}
                    data-testid="header-notification-dropdown"
                    className="fixed left-3 right-3 top-13 z-50 max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-xl sm:absolute sm:left-auto sm:right-0 sm:top-full sm:mt-2 sm:w-96"
                  >
                    <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-3.5 py-2.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-display text-xs font-bold text-stone-900">
                          {tr('Thông báo mới nhất', 'Latest notifications')}
                        </span>
                        {unreadNotifications > 0 && (
                          <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {tr(`${unreadNotifications} chưa đọc`, `${unreadNotifications} unread`)}
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
                        {tr('Đánh dấu tất cả đã đọc', 'Mark all as read')}
                      </button>
                    </div>

                    <div
                      data-testid="header-notif-scroll-list"
                      className="max-h-[min(60vh,20rem)] divide-y divide-stone-100 overflow-y-auto overscroll-contain"
                    >
                      {recentNotifications.length === 0 ? (
                        <p className="p-5 text-center text-xs text-stone-500">
                          {tr('Chưa có thông báo mới.', 'No new notifications.')}
                        </p>
                      ) : (
                        recentNotifications.map((rawNotif) => {
                          const n = translateNotificationItem(rawNotif, lang);
                          return (
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
                              const target = resolveNotificationLink(rawNotif, user?.role);
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
                                  {!n.read ? tr('Chưa đọc', 'Unread') : tr('Đã đọc', 'Read')}
                                </span>
                                {n.actionLabel && (
                                  <span className="text-[10px] font-bold text-red-800">
                                    {n.actionLabel} →
                                  </span>
                                )}
                              </div>
                            </div>
                          </button>
                          );
                        })
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
                        {tr('Xem tất cả thông báo →', 'View all notifications →')}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {(user || isDemoMode) ? (
                <>
                  <button
                    type="button"
                    data-testid="header-profile-btn"
                    onClick={() => navigate('/profile')}
                    className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-xl border px-2 text-xs font-bold transition-colors sm:h-9 sm:px-2.5 ${
                      location.pathname.startsWith('/profile')
                        ? 'border-red-300 bg-red-50 text-red-900'
                        : 'border-stone-200 bg-stone-50 text-stone-700 hover:border-amber-300 hover:bg-amber-50 hover:text-red-900'
                    }`}
                    title={tr('Hồ sơ & Đổi mật khẩu', 'Profile & Password')}
                    aria-label={tr('Hồ sơ & Đổi mật khẩu', 'Profile & Password')}
                  >
                    <UserCircle className="h-4 w-4 text-red-800 shrink-0" />
                    <span className="hidden md:inline">{tr('Hồ sơ', 'Profile')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="open-change-password-modal-btn"
                    onClick={handleOpenChangePwdModal}
                    className="hidden h-8 items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2 text-xs font-bold text-stone-700 hover:border-amber-300 hover:bg-amber-50 hover:text-red-900 sm:inline-flex sm:h-9 sm:px-2.5"
                    title={tr('Đổi mật khẩu', 'Change password')}
                    aria-label={tr('Đổi mật khẩu', 'Change password')}
                  >
                    <KeyRound className="h-3.5 w-3.5 text-red-800" />
                    <span className="hidden lg:inline">{tr('Đổi mật khẩu', 'Change password')}</span>
                  </button>
                  <button
                    type="button"
                    data-testid="logout-btn"
                    onClick={handleLogout}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 text-stone-600 hover:bg-red-50 hover:text-red-800 sm:h-9 sm:w-9"
                    title={tr('Đăng xuất', 'Sign out')}
                    aria-label={tr('Đăng xuất', 'Sign out')}
                  >
                    <LogOut className="h-4 w-4" />
                  </button>
                </>
              ) : isRestoringLiveSession ? null : (
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="inline-flex h-8 items-center gap-1 rounded-xl bg-red-800 px-3 text-xs font-bold text-white sm:h-9"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {tr('Đăng nhập', 'Sign in')}
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
            <RouteErrorBoundary key={location.pathname}>
              <Outlet />
            </RouteErrorBoundary>
          </main>

          {/* Purposeful Role-Based Mobile Bottom Navigation */}
          {!isRestoringLiveSession && (
            <RoleBottomNavigation role={effectiveRole} badges={navBadges} />
          )}

          {/* Global Full-Screen Image Lightbox Portal */}
          <ChatImageLightbox />

          {/* Change Password Modal */}
          {changePwdModalOpen && (
            <div
              data-testid="change-password-modal"
              role="dialog"
              aria-modal="true"
              aria-label={tr('Đổi mật khẩu', 'Change password')}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
            >
              <div className="w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-stone-100 bg-stone-50 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-xl bg-red-100 text-red-800">
                      <KeyRound className="h-4 w-4" />
                    </span>
                    <div>
                      <h3 className="font-display text-sm font-bold text-stone-900">
                        {tr('Đổi mật khẩu tài khoản', 'Change account password')}
                      </h3>
                      <p className="text-[11px] text-stone-500">
                        {user?.code ? `${user.code} · ` : ''}
                        {user?.email || tr('Tài khoản đang đăng nhập', 'Signed-in account')}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setChangePwdModalOpen(false)}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-stone-400 hover:bg-stone-200/60 hover:text-stone-700"
                    aria-label={tr('Đóng', 'Close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <form onSubmit={handleSubmitChangePassword} className="space-y-3.5 p-4">
                  {pwdError && (
                    <div
                      data-testid="change-password-error"
                      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-medium text-red-800"
                    >
                      {pwdError}
                    </div>
                  )}

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      {tr('Mật khẩu hiện tại', 'Current password')}
                    </label>
                    <input
                      type="password"
                      data-testid="change-password-current-input"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder={tr(
                        'Nhập mật khẩu hiện tại (mặc định: 12345678)',
                        'Enter current password (default: 12345678)'
                      )}
                      autoComplete="current-password"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      {tr('Mật khẩu mới', 'New password')}
                    </label>
                    <input
                      type="password"
                      data-testid="change-password-new-input"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder={tr(
                        `Tối thiểu ${effectiveRole === 'admin' ? 8 : 6} ký tự`,
                        `At least ${effectiveRole === 'admin' ? 8 : 6} characters`
                      )}
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
                    />
                  </div>

                  <div>
                    <label className="mb-1 block text-xs font-bold text-stone-700">
                      {tr('Xác nhận mật khẩu mới', 'Confirm new password')}
                    </label>
                    <input
                      type="password"
                      data-testid="change-password-confirm-input"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder={tr('Nhập lại mật khẩu mới', 'Re-enter new password')}
                      autoComplete="new-password"
                      className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
                    />
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-2">
                    <button
                      type="button"
                      onClick={() => setChangePwdModalOpen(false)}
                      className="rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-bold text-stone-600 hover:bg-stone-100"
                    >
                      {tr('Hủy', 'Cancel')}
                    </button>
                    <button
                      type="submit"
                      data-testid="change-password-submit-btn"
                      disabled={pwdSubmitting}
                      className="rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-900 disabled:opacity-50"
                    >
                      {pwdSubmitting
                        ? tr('Đang lưu...', 'Saving...')
                        : tr('Lưu mật khẩu mới', 'Save new password')}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}
          {pwaGuideOpen && (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/50 p-4 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="pwa-install-modal-title"
              data-testid="pwa-install-guide-modal"
            >
              <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
                <div className="mb-3 flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <img
                      src="/icons/icon-192.png"
                      alt="Khổng Tử Nhí"
                      className="h-10 w-10 rounded-xl border border-stone-200 object-cover"
                    />
                    <div>
                      <h3 id="pwa-install-modal-title" className="font-display text-base font-bold text-stone-900">
                        {tr('Cài Khổng Tử Nhí thành Ứng dụng Desktop', 'Install Khổng Tử Nhí Desktop App')}
                      </h3>
                      <p className="text-xs text-stone-500">
                        {tr(
                          'Chạy cửa sổ riêng có icon trên Windows / macOS & nhận thông báo đẩy realtime.',
                          'Run in a standalone window with OS notifications on Windows / macOS.'
                        )}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPwaGuideOpen(false)}
                    className="rounded-lg p-1 text-stone-400 hover:bg-stone-100 hover:text-stone-700"
                    aria-label={tr('Đóng', 'Close')}
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>

                <div className="space-y-2.5 text-xs text-stone-700">
                  <div
                    className={`rounded-xl border p-3 ${
                      platformHint === 'windows' ? 'border-red-200 bg-red-50/70' : 'border-stone-200 bg-stone-50'
                    }`}
                  >
                    <p className="font-bold text-stone-900">
                      🪟 Windows (Chrome / Microsoft Edge)
                    </p>
                    <p className="mt-1 leading-relaxed text-stone-600">
                      {tr(
                        'Nhấn biểu tượng Cài đặt (hình màn hình + mũi tên) ở góc phải thanh địa chỉ Chrome/Edge, hoặc mở Menu (⋮ / …) → Apps / Ứng dụng → "Cài đặt Sổ Liên Lạc Điện Tử".',
                        'Click the Install icon in the Chrome/Edge address bar, or open Menu → Apps → "Install Sổ Liên Lạc Điện Tử".'
                      )}
                    </p>
                  </div>

                  <div
                    className={`rounded-xl border p-3 ${
                      platformHint === 'macos' ? 'border-red-200 bg-red-50/70' : 'border-stone-200 bg-stone-50'
                    }`}
                  >
                    <p className="font-bold text-stone-900">
                      🍎 macOS (Chrome / Edge / Safari)
                    </p>
                    <p className="mt-1 leading-relaxed text-stone-600">
                      {tr(
                        'Trên Chrome/Edge: chọn biểu tượng Cài đặt trên thanh URL hoặc Menu → Truyền, lưu và chia sẻ → Cài đặt trang. Trên Safari (macOS Sonoma+): File → Add to Dock…',
                        'On Chrome/Edge: click Install in URL bar or Menu → Cast, save & share → Install page. On Safari (macOS Sonoma+): File → Add to Dock…'
                      )}
                    </p>
                  </div>

                  <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                    <p className="font-bold text-amber-900">
                      🔔 {tr('Thông báo đẩy Desktop (Web Push)', 'Desktop Web Push Status')}
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      {typeof Notification !== 'undefined'
                        ? Notification.permission === 'granted'
                          ? tr('Trình duyệt đã cấp quyền thông báo đẩy.', 'Browser notification permission is granted.')
                          : Notification.permission === 'denied'
                            ? tr('Quyền thông báo đang bị chặn — hãy bật lại trong biểu tượng Ổ khóa trên thanh URL.', 'Notifications blocked — re-enable in site permissions.')
                            : tr('Vào mục Thông báo và nhấn "Bật thông báo" để nhận nhắc bài & tin nhắn realtime.', 'Open Notifications and click "Enable push" to receive real-time alerts.')
                        : tr('Vui lòng dùng Chrome/Edge/Safari phiên bản mới để bật thông báo đẩy.', 'Use a modern Chrome/Edge/Safari browser for push alerts.')}
                    </p>
                  </div>
                </div>

                <div className="mt-4 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setPwaGuideOpen(false);
                      navigate('/notifications');
                    }}
                    className="rounded-xl border border-stone-200 px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
                  >
                    {tr('Mở cài đặt Thông báo', 'Open Notifications')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPwaGuideOpen(false)}
                    className="rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
                  >
                    {tr('Đã hiểu', 'Got it')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
