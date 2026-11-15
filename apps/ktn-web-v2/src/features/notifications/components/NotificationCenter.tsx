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
import {
  formatRelativeTime,
  isTeacherUnassignedNotification,
  resolveNotificationLink,
} from '@/lib/utils';
import {
  AppLanguage,
  trStatic,
  translateNotificationItem,
  useI18n,
} from '@/i18n';

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

function translateNotificationDisplayItem(
  item: KtnNotification,
  lang: AppLanguage
): KtnNotification {
  if (lang !== 'en') return item;
  const base = translateNotificationItem(item, lang);
  let title = String(base.title || '');
  let body = String(base.body || '');
  let actionLabel = base.actionLabel ? String(base.actionLabel) : base.actionLabel;

  title = title
    .replace(/^Bạn được phân công lớp mới(?:\s*(?::|-)\s*(.+))?$/i, (_, rest) =>
      rest ? `Assigned to a new class: ${rest}` : 'Assigned to a new class'
    )
    .replace(/^Bạn đã được thêm vào lớp\s+(.+)$/i, 'You were added to class $1')
    .replace(/^Thay đổi giáo viên chủ nhiệm(?:\s*(?::|-)\s*(.+))?$/i, (_, rest) =>
      rest ? `Homeroom teacher changed: ${rest}` : 'Homeroom teacher changed'
    )
    .replace(/^Thay đổi phân công(?:\s*(?::|-)\s*(.+))?$/i, (_, rest) =>
      rest ? `Class assignment updated: ${rest}` : 'Class assignment updated'
    )
    .replace(/^Lịch học lớp\s+(.+?)\s+đã cập nhật$/i, 'Schedule for class $1 updated')
    .replace(/^Sắp đến giờ học(?:\s+lớp\s+(.+))?$/i, (_, cls) =>
      cls ? `Upcoming class: ${cls}` : 'Upcoming class reminder'
    )
    .replace(/^Tin nhắn mới trong\s+(?:Nhóm\s+)?lớp\s+(.+)$/i, 'New message in class $1')
    .replace(/^Bài tập mới(?:\s+lớp\s+(.+))?$/i, (_, cls) =>
      cls ? `New homework for class ${cls}` : 'New homework'
    )
    .replace(/^Lớp\s+(.+?)\s+sắp bắt đầu$/i, 'Class $1 is starting soon');

  body = body
    .replace(/\[Đã gửi video:\s*([^\]]+)\]/gi, '[Sent video: $1]')
    .replace(/\bLớp\s+([A-Z0-9_-]+)/g, 'Class $1')
    .replace(/\bGiáo viên chủ nhiệm\b/gi, 'Homeroom teacher')
    .replace(/\bGiáo viên\b/gi, 'Teacher')
    .replace(/\bHọc viên\b/gi, 'Student')
    .replace(/\bChủ đề:/gi, 'Topic:')
    .replace(/\bHạn nộp:/gi, 'Due:');

  if (actionLabel) {
    actionLabel = actionLabel
      .replace(/^Mở lớp$/i, 'Open class')
      .replace(/^Mở nhóm chat$/i, 'Open chat')
      .replace(/^Làm bài tập$/i, 'Do homework')
      .replace(/^Mở$/i, 'Open');
  }

  return {
    ...base,
    title,
    body,
    actionLabel,
  };
}

export const NotificationCenter: React.FC = () => {
  const { lang, tr } = useI18n();
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
      return ktnApi.getNotifications({ limit: 50, offset: 0 });
    },
    enabled: Boolean(user) || isDemoMode,
    staleTime: 10000,
    refetchInterval: isDemoMode ? false : 30000,
    refetchIntervalInBackground: false,
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
        title: trStatic('Đã lưu tùy chọn thông báo', 'Notification preferences saved'),
        description: trStatic(
          'Cài đặt thông báo của bạn đã được cập nhật.',
          'Your notification settings have been updated.'
        ),
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
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications-summary'] });
    },
  });

  const filteredList = useMemo(() => {
    return notifications.filter((n) => {
      if (filterTab === 'unread') return !n.read;
      if (filterTab === 'schedule') {
        return (
          n.type === 'class_reminder' ||
          n.type === 'schedule_changed' ||
          n.type === 'session_cancelled' ||
          n.type === 'class_created' ||
          n.type === 'class_joined' ||
          n.type === 'class_teacher_changed'
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
        return (
          n.type === 'chat_message' ||
          n.type === 'chat_group_message' ||
          n.type === 'chat_private_message' ||
          n.type === 'chat_course_message'
        );
      }
      if (filterTab === 'important') {
        return (
          n.type === 'announcement_pinned' ||
          n.type === 'class_announcement' ||
          n.type === 'order_pending' ||
          n.type === 'course_granted' ||
          n.type === 'class_created' ||
          n.type === 'class_joined' ||
          n.type === 'class_teacher_changed'
        );
      }
      return true;
    });
  }, [notifications, filterTab]);

  const handleOpenNotification = async (item: KtnNotification, customTarget?: string) => {
    if (!item.read) {
      await markReadMutation.mutateAsync([item.id]);
    }
    if (
      item.type === 'class_created' ||
      item.type === 'class_joined' ||
      item.type === 'class_teacher_changed' ||
      item.type === 'schedule_changed'
    ) {
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
    }
    const target = customTarget || resolveNotificationLink(item, user?.role);
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
        title: trStatic(
          'Đã bật thông báo đẩy (Chế độ Demo)',
          'Push notifications enabled (Demo Mode)'
        ),
        description: trStatic(
          'Trên môi trường thật sẽ yêu cầu PushSubscription và VAPID key từ trình duyệt.',
          'In production, this will request a browser PushSubscription and VAPID key.'
        ),
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
          title: trStatic(
            'iPhone/iPad cần Thêm vào Màn hình chính',
            'iPhone/iPad requires Add to Home Screen'
          ),
          description: trStatic(
            'iOS chỉ hỗ trợ Web Push khi ứng dụng được Thêm vào Màn hình chính (Add to Home Screen). Bạn vẫn nhận thông báo trực tiếp trong Sổ liên lạc.',
            'iOS only supports Web Push when added to your Home Screen. You will still receive notifications directly in the app.'
          ),
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
          title: trStatic(
            'Trình duyệt chưa hỗ trợ Web Push',
            'Browser does not support Web Push'
          ),
          description: trStatic(
            'Trình duyệt hiện tại không hỗ trợ PushManager/Service Worker. Bạn vẫn nhận thông báo trực tiếp trong trung tâm KTN.',
            'Your current browser does not support PushManager/Service Worker. You will still receive in-app notifications.'
          ),
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
          title: trStatic(
            'Quyền thông báo đang tắt trên trình duyệt',
            'Notification permission is disabled in browser'
          ),
          description: trStatic(
            'Vui lòng cho phép quyền thông báo trên trình duyệt để nhận thông báo đẩy. Bạn vẫn nhận thông báo trong trung tâm KTN.',
            'Please allow notification permission in your browser to receive push alerts. You will still receive in-app notifications.'
          ),
          variant: 'warning',
        });
        return;
      }

      await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      const readyReg = await navigator.serviceWorker.ready;
      if (!readyReg || !readyReg.pushManager) {
        throw new Error(
          trStatic(
            'Service Worker PushManager chưa sẵn sàng trên trình duyệt này.',
            'Service Worker PushManager is not ready on this browser.'
          )
        );
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
        throw new Error(
          trStatic(
            'Trình duyệt không trả về khóa mã hóa PushSubscription hợp lệ (p256dh/auth).',
            'Browser did not return valid PushSubscription encryption keys (p256dh/auth).'
          )
        );
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
        throw new Error(
          trStatic(
            'Máy chủ chưa xác nhận lưu đăng ký thông báo đẩy.',
            'Server did not confirm saving the push subscription.'
          )
        );
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
        title: trStatic('Đã bật thông báo đẩy KTN', 'KTN push notifications enabled'),
        description: trStatic(
          'Thiết bị sẽ nhận thông báo đẩy từ máy chủ ngay khi Giáo viên chấm bài hoặc nhắn tin.',
          'This device will receive push alerts when a teacher grades work or sends a message.'
        ),
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
        title: trStatic('Chưa thể bật thông báo đẩy', 'Could not enable push notifications'),
        description:
          err instanceof Error
            ? err.message
            : trStatic(
                'Đăng ký PushManager không thành công. Bạn vẫn nhận thông báo trong ứng dụng.',
                'PushManager registration failed. You will still receive in-app notifications.'
              ),
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
    if (
      type === 'schedule_changed' ||
      type === 'session_cancelled' ||
      type === 'class_created' ||
      type === 'class_joined' ||
      type === 'class_teacher_changed'
    ) {
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
    if (
      type === 'chat_message' ||
      type === 'chat_group_message' ||
      type === 'chat_private_message' ||
      type === 'chat_course_message'
    ) {
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
            {tr('Trạng thái Thông báo (Demo):', 'Notification State (Demo):')}
          </span>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'unread', label: tr('Chưa đọc', 'Unread') },
                { id: 'all_read', label: tr('Đã đọc hết', 'All read') },
                { id: 'empty', label: tr('Trống', 'Empty') },
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
            <span>
              {tr('Chưa tải được danh sách thông báo.', 'Could not load notifications.')}
            </span>
          </div>
          <button
            type="button"
            onClick={() => notificationsQuery.refetch()}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            {tr('Thử lại', 'Retry')}
          </button>
        </div>
      )}

      {/* Filter Tabs & List in a Single Compact Card */}
      <div className="rounded-2xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
          <div className="flex items-center gap-1 overflow-x-auto">
            {(
              [
                { id: 'all', label: tr(`Tất cả (${notifications.length})`, `All (${notifications.length})`) },
                { id: 'unread', label: tr(`Chưa đọc (${unreadCount})`, `Unread (${unreadCount})`) },
                { id: 'schedule', label: tr('Lịch học', 'Schedule') },
                { id: 'homework', label: tr('Bài tập', 'Homework') },
                { id: 'chat', label: tr('Tin nhắn', 'Messages') },
                { id: 'important', label: tr('Quan trọng', 'Important') },
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
                {tr(`${unreadCount} mới`, `${unreadCount} new`)}
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
              <span>{tr('Cài đặt thông báo', 'Notification settings')}</span>
            </button>

            <button
              type="button"
              data-testid="mark-all-notifications-read-btn"
              disabled={unreadCount === 0 || markReadMutation.isPending}
              onClick={handleMarkAllRead}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>{tr('Đánh dấu tất cả đã đọc', 'Mark all as read')}</span>
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
                {tr('Cài đặt thông báo', 'Notification settings')}
              </p>
              <span className="text-[11px] font-medium text-stone-500">
                {tr('Đồng bộ theo tài khoản & thiết bị', 'Synced across account & devices')}
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
                ? tr('Đã bật', 'Enabled')
                : !isPushSupported
                ? tr('Thiết bị không hỗ trợ', 'Unsupported device')
                : isDenied
                ? tr('Bị chặn', 'Blocked')
                : tr('Chưa bật', 'Not enabled');

              return (
                <div
                  data-testid="device-push-status-row"
                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-white p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-xs font-bold text-stone-900">
                        {tr(
                          'Trạng thái thông báo trên thiết bị hiện tại:',
                          'Notification status on this device:'
                        )}
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
                      {tr(
                        'Trên iPhone/iPad: Nhấn nút Chia sẻ (Share) trên Safari → Thêm vào Màn hình chính (Add to Home Screen), sau đó mở ứng dụng từ màn hình chính để bật thông báo.',
                        'On iPhone/iPad: Tap Share in Safari → Add to Home Screen, then open the app from your Home Screen to enable notifications.'
                      )}
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
                        ? tr(
                            'Đang nhận thông báo trên thiết bị này',
                            'Receiving notifications on this device'
                          )
                        : tr(
                            'Bật thông báo trên thiết bị này',
                            'Enable notifications on this device'
                          )}
                    </span>
                  </button>
                </div>
              );
            })()}

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
              <label className="flex cursor-pointer items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs">
                <div>
                  <p className="font-bold text-stone-900">{tr('Tin nhắn', 'Messages')}</p>
                  <p className="text-[11px] text-stone-500">
                    {tr('Tin nhắn riêng & nhóm lớp', 'Direct & class group messages')}
                  </p>
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
                  <p className="font-bold text-stone-900">{tr('Bài tập', 'Homework')}</p>
                  <p className="text-[11px] text-stone-500">
                    {tr('Bài tập mới được giao', 'New homework assignments')}
                  </p>
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
                  <p className="font-bold text-stone-900">{tr('Điểm số', 'Grades')}</p>
                  <p className="text-[11px] text-stone-500">
                    {tr('Kết quả giáo viên chấm bài', 'Teacher grading results')}
                  </p>
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
                  <p className="font-bold text-stone-900">{tr('Lịch học', 'Schedule')}</p>
                  <p className="text-[11px] text-stone-500">
                    {tr('Nhắc trước giờ học & đổi lịch', 'Class reminders & schedule changes')}
                  </p>
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
                  <p className="font-bold text-stone-900">
                    {tr('Nhắc thêm trước 10 phút', 'Extra 10-minute reminder')}
                  </p>
                  <p className="text-[11px] text-stone-500">
                    {tr(
                      'Tùy chọn nhắc thêm sát giờ vào lớp',
                      'Optional reminder shortly before class starts'
                    )}
                  </p>
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
                    <p className="font-bold text-amber-950">
                      {tr('Thông báo quan trọng từ Quản lý', 'Important announcements from Admin')}
                    </p>
                    <p className="text-[11px] text-amber-800">
                      {tr(
                        'Luôn được bật để đảm bảo không bỏ lỡ thông báo học vụ quan trọng.',
                        'Always enabled so you never miss critical academic notices.'
                      )}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 rounded-full bg-amber-200/80 px-2 py-0.5 text-[10px] font-bold text-amber-950">
                  {tr('Luôn bật', 'Always on')}
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
                {tr('Chưa có thông báo mới', 'No new notifications')}
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                {tr(
                  'Nhắc lịch học, điểm bài tập hoặc tin nhắn lớp mới sẽ hiển thị tại đây.',
                  'Class reminders, homework grades, and new class messages will appear here.'
                )}
              </p>
            </div>
          ) : (
            filteredList.map((item) => {
              const displayItem = translateNotificationDisplayItem(item, lang);
              return (
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
                        {displayItem.title}
                      </h3>
                      {!item.read && (
                        <span className="rounded-full bg-red-600 px-1.5 py-0.2 text-[9.5px] font-bold text-white">
                          {tr('MỚI', 'NEW')}
                        </span>
                      )}
                      {item.coalescedCount && item.coalescedCount > 1 && (
                        <span className="rounded-full bg-stone-200 px-1.5 py-0.2 text-[9.5px] font-bold text-stone-700">
                          {tr(`${item.coalescedCount} tin nhắn`, `${item.coalescedCount} messages`)}
                        </span>
                      )}
                      <span className="text-[11px] text-stone-400">
                        • {formatRelativeTime(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-stone-600">
                      {String(displayItem.body || '').replace(
                        /\[(?:Đã (?:gửi|đính kèm) (?:ảnh|hình ảnh)(?::\s*[^\r\n]*)?|Ảnh đính kèm|(?:Sent|Attached) image(?::\s*[^\r\n]*)?|Image attached)\]/gi,
                        tr('📷 Hình ảnh', '📷 Image')
                      )}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {!item.read && (
                    <button
                      type="button"
                      data-testid={`mark-single-notif-read-${item.id}`}
                      onClick={() => markReadMutation.mutate([item.id])}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
                    >
                      <Check className="h-3.5 w-3.5 text-emerald-700" />
                      <span>{tr('Đã đọc', 'Mark read')}</span>
                    </button>
                  )}

                  {(item.type === 'class_created' ||
                    item.type === 'class_joined' ||
                    (item.type === 'class_teacher_changed' &&
                      !isTeacherUnassignedNotification(item))) &&
                    (item.classCode || item.roomId) && (
                      <button
                        type="button"
                        data-testid={`open-notif-chat-${item.id}`}
                        onClick={() => {
                          const room =
                            item.roomId || `class:${String(item.classCode || '').trim().toUpperCase()}`;
                          handleOpenNotification(
                            item,
                            `/chat?room=${encodeURIComponent(room)}`
                          );
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-800 hover:bg-red-100"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>{tr('Nhóm lớp', 'Class chat')}</span>
                      </button>
                    )}

                  {Boolean(
                    item.actionUrl ||
                      item.classCode ||
                      item.roomId ||
                      item.courseId ||
                      item.type === 'class_created' ||
                      item.type === 'class_joined' ||
                      item.type === 'class_teacher_changed' ||
                      item.type === 'schedule_changed' ||
                      item.type === 'class_reminder' ||
                      item.type === 'chat_group_message' ||
                      item.type === 'homework_assigned'
                  ) && (
                    <button
                      type="button"
                      data-testid={`open-notif-target-${item.id}`}
                      onClick={() => handleOpenNotification(item)}
                      className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-900"
                    >
                      <span>
                        {displayItem.actionLabel ||
                          (item.type === 'class_created' ||
                          item.type === 'class_joined' ||
                          item.type === 'class_teacher_changed'
                            ? tr('Mở lớp', 'Open class')
                            : item.type === 'chat_group_message' ||
                              item.type === 'chat_message'
                            ? tr('Mở nhóm chat', 'Open chat')
                            : item.type === 'homework_assigned'
                            ? tr('Làm bài tập', 'Do homework')
                            : tr('Mở', 'Open'))}
                      </span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  )}
                </div>
              </div>
            );
            })
          )}
        </div>
      </div>
    </div>
  );
};
