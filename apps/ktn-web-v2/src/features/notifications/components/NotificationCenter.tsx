import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Bell,
  CheckCheck,
  MessageSquare,
  Award,
  BookOpen,
  Calendar,
  BellRing,
  Check,
  ExternalLink,
  AlertCircle,
  RotateCcw,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { DEMO_NOTIFICATIONS } from '@/lib/demoData';
import { KtnNotification } from '@/types/ktn.types';
import { formatChatTimestamp, resolveNotificationLink } from '@/lib/utils';

export const NotificationCenter: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [filterTab, setFilterTab] = useState<'all' | 'unread' | 'homework' | 'chat'>('all');
  const [pushEnabled, setPushEnabled] = useState(false);
  const [demoState, setDemoState] = useState<'unread' | 'all_read' | 'empty'>('unread');
  const [demoLocalReadIds, setDemoLocalReadIds] = useState<Record<string, boolean>>({});

  const notificationsQuery = useQuery<{
    notifications: KtnNotification[];
    readIds: string[];
  }>({
    queryKey: ['ktn-notifications', user?.email, isDemoMode, demoState],
    queryFn: async () => {
      if (isDemoMode) {
        if (demoState === 'empty') {
          return { notifications: [] as KtnNotification[], readIds: [] };
        }
        const list = DEMO_NOTIFICATIONS.map((n) => ({
          ...n,
          read: demoState === 'all_read' ? true : Boolean(n.read || demoLocalReadIds[n.id]),
        }));
        return {
          notifications: list,
          readIds: list.filter((n) => n.read).map((n) => n.id),
        };
      }
      return ktnApi.getNotifications();
    },
    enabled: Boolean(user) || isDemoMode,
    refetchInterval: isDemoMode ? false : 4000,
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
          n.type === 'class_announcement' ||
          n.type === 'announcement_pinned'
        );
      }
      return true;
    });
  }, [notifications, filterTab]);

  const handleOpenNotification = async (item: KtnNotification) => {
    if (!item.read) {
      await markReadMutation.mutateAsync([item.id]);
    }
    navigate(resolveNotificationLink(item));
  };

  const handleMarkAllRead = () => {
    const unreadIds = notifications.filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    if (isDemoMode) {
      setDemoState('all_read');
    }
    markReadMutation.mutate(unreadIds);
  };

  // Explicit user-initiated Web Push opt-in (NEVER auto-prompt on page load)
  const handleEnableWebPush = async () => {
    try {
      if ('Notification' in window && Notification.permission === 'default') {
        const perm = await Notification.requestPermission();
        if (perm === 'denied') {
          addToast({
            title: 'Quyền thông báo đang tắt trên trình duyệt',
            description: 'Bạn vẫn nhận được đầy đủ thông báo trực tiếp trong trung tâm KTN.',
            variant: 'warning',
          });
          return;
        }
      }
      if (!isDemoMode) {
        await ktnApi
          .subscribePush({
            endpoint: `https://push.khongtunhi.com/v2/${encodeURIComponent(
              user?.email || 'student'
            )}`,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'ktn-web-v2',
          })
          .catch(() => null);
      }
      setPushEnabled(true);
      addToast({
        title: 'Đã bật thông báo đẩy KTN',
        description: 'Thiết bị sẽ nhận thông báo ngay khi Giáo viên chấm bài hoặc nhắn tin.',
        variant: 'success',
      });
    } catch {
      setPushEnabled(true);
    }
  };

  const renderIcon = (type: string) => {
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
                { id: 'homework', label: 'Chấm bài' },
                { id: 'chat', label: 'Tin nhắn' },
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

          <div className="flex items-center gap-1.5">
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
              data-testid="enable-web-push-btn"
              onClick={handleEnableWebPush}
              className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors ${
                pushEnabled
                  ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                  : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
              }`}
            >
              <BellRing className="h-3.5 w-3.5" />
              <span>{pushEnabled ? 'Đã bật' : 'Bật chuông'}</span>
            </button>

            <button
              type="button"
              data-testid="mark-all-notifications-read-btn"
              disabled={unreadCount === 0 || markReadMutation.isPending}
              onClick={handleMarkAllRead}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-40"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              <span>Đọc tất cả</span>
            </button>
          </div>
        </div>

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
                Điểm bài tập hoặc tin nhắn lớp mới sẽ hiển thị tại đây.
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
                      <span className="text-[11px] text-stone-400">
                        • {formatChatTimestamp(item.createdAt)}
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
                      <span>Mở</span>
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
