import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  MessageSquare,
  Award,
  BookOpen,
  Calendar,
  Clock,
  BellRing,
  Check,
  ExternalLink,
  AlertCircle,
  RotateCcw,
  SlidersHorizontal,
  ShieldCheck,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { DEMO_NOTIFICATIONS } from '@/lib/demoData';
import { KtnNotification, UserNotificationSettings } from '@/types/ktn.types';
import { formatRelativeTime, resolveNotificationLink } from '@/lib/utils';

const DEFAULT_VAPID_PUBLIC_KEY =
  'BG4yPEa0evkPFiDAtau85Mg90U2WimsmOCRZgvIqeXQzUDzts5yR75wQub8YJCSXk0sK5jN3Jc3Hbp9jIVRECPM';

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

function hasMatchingApplicationServerKey(
  sub: PushSubscription | null | undefined,
  expectedKeyBytes: Uint8Array
): boolean {
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
}

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [filterTab, setFilterTab] = useState<
    'all' | 'unread' | 'schedule' | 'homework' | 'chat' | 'important'
  >('all');
  const [showPrefsPanel, setShowPrefsPanel] = useState<boolean>(true);
  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [isSubscribingPush, setIsSubscribingPush] = useState<boolean>(false);
  const [demoState, setDemoState] = useState<'unread' | 'all_read' | 'empty'>('unread');
  const [demoLocalReadIds, setDemoLocalReadIds] = useState<Record<string, boolean>>({});
  const [demoSettings, setDemoSettings] = useState<UserNotificationSettings>({
    chat: true,
    homework: true,
    grades: true,
    schedule: true,
    important: true,
    reminder10Min: false,
  });

  // Verify real browser PushSubscription on mount and bind to current authenticated user — never assume enabled just from permission
  useEffect(() => {
    let cancelled = false;
    const onPushSynced = (evt: Event) => {
      const detail = (evt as CustomEvent<{ enabled?: boolean }>)?.detail;
      if (!cancelled && detail?.enabled) {
        setPushEnabled(true);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('ktn:push-subscription-synced', onPushSynced);
    }
    if (typeof window === 'undefined' || !('serviceWorker' in navigator) || !('PushManager' in window)) {
      setPushEnabled(false);
      return () => {
        if (typeof window !== 'undefined') {
          window.removeEventListener('ktn:push-subscription-synced', onPushSynced);
        }
      };
    }
    const expectedDefaultKey = urlBase64ToUint8Array(DEFAULT_VAPID_PUBLIC_KEY);
    navigator.serviceWorker
      .getRegistration('/')
      .then((reg) => reg?.pushManager?.getSubscription())
      .then(async (sub) => {
        if (cancelled) return;
        const subJson = sub ? sub.toJSON() : null;
        const endpoint = String(subJson?.endpoint || '').trim();
        const p256dh = String(subJson?.keys?.p256dh || '').trim();
        const auth = String(subJson?.keys?.auth || '').trim();
        const keyMatches = hasMatchingApplicationServerKey(sub, expectedDefaultKey);
        const hasRealSub = Boolean(
          endpoint &&
            !endpoint.includes('push.khongtunhi.com/v2/') &&
            p256dh &&
            auth &&
            p256dh !== 'ktn-mobile-web-p256dh' &&
            keyMatches
        );
        if (!hasRealSub) {
          setPushEnabled(false);
          try {
            localStorage.removeItem('ktn_push_enabled_v2');
          } catch {
            // ignore
          }
          return;
        }
        if (!isDemoMode && user?.email) {
          try {
            const syncRes = await ktnApi.subscribePush({
              endpoint,
              expirationTime: subJson?.expirationTime ?? null,
              keys: { p256dh, auth },
              userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ktn-web-v2',
            });
            if (cancelled) return;
            if (!syncRes.ok) {
              setPushEnabled(false);
              return;
            }
          } catch {
            if (!cancelled) setPushEnabled(false);
            return;
          }
        }
        if (cancelled) return;
        setPushEnabled(true);
        try {
          localStorage.setItem('ktn_push_enabled_v2', '1');
        } catch {
          // ignore
        }
      })
      .catch(() => {
        if (!cancelled) setPushEnabled(false);
      });
    return () => {
      cancelled = true;
      window.removeEventListener('ktn:push-subscription-synced', onPushSynced);
    };
  }, [user?.email, isDemoMode]);

  const notificationsQuery = useQuery<{
    notifications: KtnNotification[];
    readIds: string[];
    settings?: UserNotificationSettings;
  }>({
    queryKey: isDemoMode
      ? ['ktn-notifications', user?.email, isDemoMode, demoState]
      : ['ktn-notifications', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        if (demoState === 'empty') {
          return { notifications: [] as KtnNotification[], readIds: [], settings: demoSettings };
        }
        const list = DEMO_NOTIFICATIONS.map((n) => ({
          ...n,
          read: demoState === 'all_read' ? true : Boolean(n.read || demoLocalReadIds[n.id]),
        }));
        return {
          notifications: list,
          readIds: list.filter((n) => n.read).map((n) => n.id),
          settings: demoSettings,
        };
      }
      return ktnApi.getNotifications();
    },
    enabled: Boolean(user) || isDemoMode,
    staleTime: 2000,
    refetchInterval: isDemoMode ? false : 4000,
    refetchIntervalInBackground: true,
  });

  const notifSettingsQuery = useQuery<UserNotificationSettings>({
    queryKey: ['ktn-notification-settings', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return demoSettings;
      return ktnApi.getNotificationSettings();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const activeSettings: UserNotificationSettings =
    notifSettingsQuery.data ||
    notificationsQuery.data?.settings || {
      chat: true,
      homework: true,
      grades: true,
      schedule: true,
      important: true,
      reminder10Min: false,
    };

  const updateSettingsMutation = useMutation({
    mutationFn: async (patch: Partial<UserNotificationSettings>) => {
      const merged: UserNotificationSettings = {
        ...activeSettings,
        ...patch,
        important: true,
      };
      if (isDemoMode) {
        setDemoSettings(merged);
        return merged;
      }
      return ktnApi.updateNotificationSettings(merged);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-notification-settings'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      addToast({
        title: 'Đã lưu tùy chọn thông báo',
        description: 'Cài đặt thông báo của bạn đã được cập nhật.',
        variant: 'success',
      });
    },
  });

  const notifications = notificationsQuery.data?.notifications || [];
  const unreadCount = notifications.filter((n) => !n.read).length;

  const markReadMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      if (isDemoMode) {
        const nextMap = { ...demoLocalReadIds };
        for (const id of ids) nextMap[id] = true;
        setDemoLocalReadIds(nextMap);
        return { markedCount: ids.length };
      }
      return ktnApi.markNotificationsRead(ids);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
    },
  });

  const filteredList = useMemo(() => {
    return notifications.filter((n) => {
      if (filterTab === 'unread') return !n.read;
      if (filterTab === 'schedule') {
        return (
          n.type === 'class_reminder' ||
          n.type === 'schedule_changed' ||
          n.type === 'session_cancelled'
        );
      }
      if (filterTab === 'homework') {
        return (
          n.type === 'homework_graded' ||
          n.type === 'homework_submitted' ||
          n.type === 'homework_assigned'
        );
      }
      if (filterTab === 'chat') {
        return n.type === 'chat_message';
      }
      if (filterTab === 'important') {
        return (
          n.type === 'announcement_pinned' ||
          n.type === 'class_announcement' ||
          n.type === 'order_pending' ||
          n.type === 'course_granted'
        );
      }
      return true;
    });
  }, [notifications, filterTab]);

  const handleOpenNotification = async (item: KtnNotification) => {
    if (!item.read) {
      await markReadMutation.mutateAsync([item.id]);
    }
    const target = resolveNotificationLink(item);
    if (/^https:\/\//i.test(target)) {
      window.open(target, '_blank', 'noopener,noreferrer');
    } else {
      navigate(target);
    }
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    if (isDemoMode) {
      setDemoState('all_read');
    }
    markReadMutation.mutate(unreadIds);
  };

  // Explicit user-initiated Web Push opt-in (NEVER fake subscription, NEVER swallow errors)
  const handleEnableWebPush = async () => {
    if (isSubscribingPush) return;

    if (isDemoMode) {
      setPushEnabled(true);
      addToast({
        title: 'Đã bật thông báo đẩy (Chế độ Demo)',
        description: 'Trên môi trường thật sẽ yêu cầu PushSubscription và VAPID key từ trình duyệt.',
        variant: 'success',
      });
      return;
    }

    setIsSubscribingPush(true);
    try {
      const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
      const isIOS =
        /iPad|iPhone|iPod/.test(ua) ||
        (typeof navigator !== 'undefined' &&
          navigator.platform === 'MacIntel' &&
          navigator.maxTouchPoints > 1);
      const isStandalone =
        (typeof window !== 'undefined' &&
          typeof window.matchMedia === 'function' &&
          window.matchMedia('(display-mode: standalone)').matches) ||
        Boolean((navigator as unknown as { standalone?: boolean }).standalone);

      if (isIOS && !isStandalone) {
        setPushEnabled(false);
        addToast({
          title: 'iPhone/iPad cần Thêm vào Màn hình chính',
          description:
            'iOS chỉ hỗ trợ Web Push khi ứng dụng được Thêm vào Màn hình chính (Add to Home Screen). Bạn vẫn nhận thông báo trực tiếp trong Sổ liên lạc.',
          variant: 'warning',
        });
        return;
      }

      if (
        typeof window === 'undefined' ||
        !('serviceWorker' in navigator) ||
        !('PushManager' in window) ||
        !('Notification' in window)
      ) {
        setPushEnabled(false);
        addToast({
          title: 'Trình duyệt chưa hỗ trợ Web Push',
          description:
            'Trình duyệt hiện tại không hỗ trợ PushManager/Service Worker. Bạn vẫn nhận thông báo trực tiếp trong trung tâm KTN.',
          variant: 'warning',
        });
        return;
      }

      let perm = Notification.permission;
      if (perm === 'default') {
        perm = await Notification.requestPermission();
      }
      if (perm !== 'granted') {
        setPushEnabled(false);
        addToast({
          title: 'Quyền thông báo đang tắt trên trình duyệt',
          description:
            'Vui lòng cho phép quyền thông báo trên trình duyệt để nhận thông báo đẩy. Bạn vẫn nhận thông báo trong trung tâm KTN.',
          variant: 'warning',
        });
        return;
      }

      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const readyReg = await navigator.serviceWorker.ready;
      if (!readyReg || !readyReg.pushManager) {
        throw new Error('Service Worker PushManager chưa sẵn sàng trên trình duyệt này.');
      }

      let vapidPublicKey = DEFAULT_VAPID_PUBLIC_KEY;
      try {
        const keyRes = await ktnApi.getVapidPublicKey();
        if (keyRes.publicKey && keyRes.publicKey.length >= 40) {
          vapidPublicKey = keyRes.publicKey;
        }
      } catch {
        // Fallback to verified P-256 public key
      }

      const appServerKey = urlBase64ToUint8Array(vapidPublicKey);
      const existingSub = await readyReg.pushManager.getSubscription();
      let previousEndpoint = '';
      if (existingSub) {
        const existingJson = existingSub.toJSON();
        const isFakeOrCorrupt =
          !existingJson.endpoint ||
          existingJson.endpoint.includes('push.khongtunhi.com/v2/') ||
          !existingJson.keys?.p256dh ||
          !existingJson.keys?.auth ||
          existingJson.keys.p256dh === 'ktn-mobile-web-p256dh';
        const isVapidKeyMismatch = !hasMatchingApplicationServerKey(existingSub, appServerKey);
        if (isFakeOrCorrupt || isVapidKeyMismatch) {
          if (isVapidKeyMismatch && existingJson.endpoint) {
            previousEndpoint = String(existingJson.endpoint).trim();
          }
          try {
            await existingSub.unsubscribe();
          } catch {
            // ignore unsubscribe error on corrupt/mismatched subscription
          }
        }
      }

      let sub: PushSubscription;
      try {
        sub = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as unknown as BufferSource,
        });
      } catch {
        if (existingSub) {
          const prevEp = existingSub.endpoint || '';
          if (prevEp && !previousEndpoint) previousEndpoint = prevEp;
          try {
            await existingSub.unsubscribe();
          } catch {
            // ignore unsubscribe error before re-subscribing with new VAPID key
          }
        }
        sub = await readyReg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: appServerKey as unknown as BufferSource,
        });
      }

      const subJson = sub.toJSON();
      const endpoint = String(subJson.endpoint || '').trim();
      const p256dh = String(subJson.keys?.p256dh || '').trim();
      const auth = String(subJson.keys?.auth || '').trim();

      if (!endpoint || !p256dh || !auth) {
        throw new Error('Trình duyệt không trả về khóa mã hóa PushSubscription hợp lệ (p256dh/auth).');
      }

      const saveRes = await ktnApi.subscribePush(
        {
          endpoint,
          expirationTime: subJson.expirationTime ?? null,
          keys: { p256dh, auth },
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ktn-web-v2',
        },
        previousEndpoint || undefined
      );

      if (!saveRes.ok) {
        throw new Error('Máy chủ chưa xác nhận lưu đăng ký thông báo đẩy.');
      }

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
      setPushEnabled(true);
      addToast({
        title: 'Đã bật thông báo đẩy KTN',
        description: 'Thiết bị sẽ nhận thông báo đẩy từ máy chủ ngay khi Giáo viên chấm bài hoặc nhắn tin.',
        variant: 'success',
      });
    } catch (err) {
      setPushEnabled(false);
      try {
        localStorage.removeItem('ktn_push_enabled_v2');
      } catch {
        // ignore
      }
      addToast({
        title: 'Chưa thể bật thông báo đẩy',
        description:
          err instanceof Error
            ? err.message
            : 'Đăng ký PushManager không thành công. Bạn vẫn nhận thông báo trong ứng dụng.',
        variant: 'error',
      });
    } finally {
      setIsSubscribingPush(false);
    }
  };

  const renderIcon = (type: string) => {
    if (type === 'class_reminder') {
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Clock className="h-4 w-4" />
        </div>
      );
    }
    if (type === 'schedule_changed' || type === 'session_cancelled') {
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-100 text-orange-800">
          <Calendar className="h-4 w-4" />
        </div>
      );
    }
    if (type === 'homework_graded' || type === 'homework_submitted') {
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <Award className="h-4 w-4" />
        </div>
      );
    }
    if (type === 'chat_message') {
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800">
          <MessageSquare className="h-4 w-4" />
        </div>
      );
    }
    if (type === 'homework_assigned') {
      return (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Calendar className="h-4 w-4" />
        </div>
      );
    }
    return (
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
        <BookOpen className="h-4 w-4" />
      </div>
    );
  };

  return (
    <div data-testid="notification-center-page" className="space-y-3">
      {/* Demo Mode State Switcher */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs">
          <span className="font-semibold text-amber-950">
            Trạng thái Thông báo (Demo):
          </span>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'unread', label: 'Chưa đọc' },
                { id: 'all_read', label: 'Đã đọc hết' },
                { id: 'empty', label: 'Trống' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setDemoLocalReadIds({});
                  setDemoState(st.id);
                }}
                className={`rounded-md px-2 py-0.5 text-[11px] font-bold transition-colors ${
                  demoState === st.id
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

      {!isDemoMode && notificationsQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được danh sách thông báo.</span>
          </div>
          <button
            type="button"
            onClick={() => notificationsQuery.refetch()}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Filter Tabs & List in a Single Compact Card */}
      <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'all', label: `Tất cả (${notifications.length})` },
                { id: 'unread', label: `Chưa đọc (${unreadCount})` },
                { id: 'schedule', label: 'Lịch học' },
                { id: 'homework', label: 'Bài tập' },
                { id: 'chat', label: 'Tin nhắn' },
                { id: 'important', label: 'Quan trọng' },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`notif-filter-${tab.id}`}
                onClick={() => setFilterTab(tab.id)}
                className={`min-h-[34px] shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  filterTab === tab.id
                    ? 'bg-red-800 text-white'
                    : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {unreadCount > 0 && (
              <span
                data-testid="notifications-unread-count-pill"
                className="rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white"
              >
                {unreadCount} mới
              </span>
            )}

            <button
              type="button"
              data-testid="toggle-notif-prefs-btn"
              onClick={() => setShowPrefsPanel((v) => !v)}
              className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                showPrefsPanel
                  ? 'border-red-300 bg-red-50 text-red-800'
                  : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span>Cài đặt thông báo</span>
            </button>

            <button
              type="button"
              data-testid="mark-all-notifications-read-btn"
              disabled={unreadCount === 0 || markReadMutation.isPending}
              onClick={handleMarkAllRead}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Đánh dấu tất cả đã đọc</span>
            </button>
          </div>
        </div>

        {/* User Notification Preferences Card */}
        {showPrefsPanel && (
          <div
            data-testid="notification-preferences-card"
            className="mt-3 space-y-2.5 rounded-xl border border-stone-200 bg-stone-50/90 p-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-display text-xs font-bold text-stone-900 sm:text-sm">
                Cài đặt thông báo
              </p>
              <span className="text-[11px] font-medium text-stone-500">
                Đồng bộ theo tài khoản & thiết bị
              </span>
            </div>

            {/* Device Push Status & Opt-in Button */}
            {(() => {
              const isPushSupported =
                typeof window !== 'undefined' &&
                'serviceWorker' in navigator &&
                'PushManager' in window &&
                'Notification' in window;
              const isDenied =
                isPushSupported &&
                typeof Notification !== 'undefined' &&
                Notification.permission === 'denied';
              const statusLabel = pushEnabled
                ? 'Đã bật'
                : !isPushSupported
                ? 'Thiết bị không hỗ trợ'
                : isDenied
                ? 'Bị chặn'
                : 'Chưa bật';

              return (
                <div
                  data-testid="device-push-status-row"
                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-stone-900">
                        Trạng thái thông báo trên thiết bị hiện tại:
                      </p>
                      <span
                        data-testid="device-push-status-badge"
                        className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${
                          pushEnabled
                            ? 'bg-emerald-100 text-emerald-800'
                            : isDenied
                            ? 'bg-red-100 text-red-800'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {statusLabel}
                      </span>
                    </div>
                    <p
                      data-testid="iphone-pwa-push-guide"
                      className="mt-1 text-[11px] leading-relaxed text-stone-600"
                    >
                      Trên iPhone/iPad: Nhấn nút Chia sẻ (Share) trên Safari → Thêm vào Màn hình chính
                      (Add to Home Screen), sau đó mở ứng dụng từ màn hình chính để bật thông báo.
                    </p>
                  </div>

                  <button
                    type="button"
                    data-testid="enable-web-push-btn"
                    onClick={handleEnableWebPush}
                    disabled={isSubscribingPush}
                    className={`inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-bold transition-colors ${
                      pushEnabled
                        ? 'border border-emerald-300 bg-emerald-50 text-emerald-900'
                        : 'bg-red-800 text-white shadow-2xs hover:bg-red-900'
                    }`}
                  >
                    <BellRing className="h-3.5 w-3.5" />
                    <span>
                      {pushEnabled
                        ? 'Đang nhận thông báo trên thiết bị này'
                        : 'Bật thông báo trên thiết bị này'}
                    </span>
                  </button>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">Tin nhắn</p>
                  <p className="text-[11px] text-stone-500">Tin nhắn riêng & nhóm lớp</p>
                </div>
                <input
                  type="checkbox"
                  data-testid="notif-pref-chat"
                  checked={activeSettings.chat}
                  onChange={(e) => updateSettingsMutation.mutate({ chat: e.target.checked })}
                  className="h-4 w-4 rounded accent-red-800"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">Bài tập</p>
                  <p className="text-[11px] text-stone-500">Bài tập mới được giao</p>
                </div>
                <input
                  type="checkbox"
                  data-testid="notif-pref-homework"
                  checked={activeSettings.homework}
                  onChange={(e) => updateSettingsMutation.mutate({ homework: e.target.checked })}
                  className="h-4 w-4 rounded accent-red-800"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">Điểm số</p>
                  <p className="text-[11px] text-stone-500">Kết quả giáo viên chấm bài</p>
                </div>
                <input
                  type="checkbox"
                  data-testid="notif-pref-grades"
                  checked={activeSettings.grades !== false}
                  onChange={(e) =>
                    updateSettingsMutation.mutate({ grades: e.target.checked })
                  }
                  className="h-4 w-4 rounded accent-red-800"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">Lịch học</p>
                  <p className="text-[11px] text-stone-500">Nhắc trước giờ học & đổi lịch</p>
                </div>
                <input
                  type="checkbox"
                  data-testid="notif-pref-schedule"
                  checked={activeSettings.schedule}
                  onChange={(e) => updateSettingsMutation.mutate({ schedule: e.target.checked })}
                  className="h-4 w-4 rounded accent-red-800"
                />
              </label>

              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs sm:col-span-2">
                <div>
                  <p className="font-bold text-stone-900">Nhắc thêm trước 10 phút</p>
                  <p className="text-[11px] text-stone-500">Tùy chọn nhắc thêm sát giờ vào lớp</p>
                </div>
                <input
                  type="checkbox"
                  data-testid="notif-pref-reminder-10m"
                  checked={activeSettings.reminder10Min}
                  onChange={(e) =>
                    updateSettingsMutation.mutate({ reminder10Min: e.target.checked })
                  }
                  className="h-4 w-4 rounded accent-red-800"
                />
              </label>

              <div
                data-testid="notif-pref-important"
                className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs sm:col-span-2"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 shrink-0 text-amber-800" />
                  <div>
                    <p className="font-bold text-amber-950">Thông báo quan trọng từ Quản lý</p>
                    <p className="text-[11px] text-amber-800">
                      Luôn được bật để đảm bảo không bỏ lỡ thông báo học vụ quan trọng.
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                  Luôn bật
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Items */}
        <div className="mt-2.5 space-y-2">
          {filteredList.length === 0 ? (
            <div
              data-testid="notifications-empty-state"
              className="flex flex-col items-center justify-center py-8 text-center"
            >
              <Bell className="h-8 w-8 text-stone-300" />
              <h3 className="mt-2 font-display text-sm font-bold text-stone-800">
                Chưa có thông báo mới
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Nhắc lịch học, điểm bài tập hoặc tin nhắn lớp mới sẽ hiển thị tại đây.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id}
                data-testid={`notification-item-${item.id}`}
                data-read={item.read ? 'true' : 'false'}
                className={`flex flex-wrap items-start justify-between gap-2.5 rounded-2xl border p-3 transition-all ${
                  !item.read
                    ? 'border-red-200 bg-red-50/50 shadow-2xs'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <div
                  onClick={() => handleOpenNotification(item)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5"
                >
                  {renderIcon(item.type)}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <h3
                        className={`text-xs sm:text-sm ${
                          !item.read
                            ? 'font-bold text-stone-950'
                            : 'font-semibold text-stone-800'
                        }`}
                      >
                        {item.title}
                      </h3>
                      {!item.read && (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                          MỚI
                        </span>
                      )}
                      {item.coalescedCount && item.coalescedCount > 1 && (
                        <span className="rounded-full bg-stone-200 px-1.5 py-0.2 text-[9.5px] font-bold text-stone-700">
                          {item.coalescedCount} tin nhắn
                        </span>
                      )}
                      <span className="text-[11px] text-stone-400">
                        • {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-600">
                      {item.body}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-1.5">
                  {!item.read && (
                    <button
                      type="button"
                      data-testid={`mark-single-notif-read-${item.id}`}
                      onClick={() => markReadMutation.mutate([item.id])}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-700" />
                      <span>Đã đọc</span>
                    </button>
                  )}

                  {item.actionUrl && (
                    <button
                      type="button"
                      data-testid={`open-notif-target-${item.id}`}
                      onClick={() => handleOpenNotification(item)}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-900"
                    >
                      <span>{item.actionLabel || 'Mở'}</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
