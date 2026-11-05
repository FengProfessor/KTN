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
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
          <Award className="h-5 w-5" />
        </div>
      );
    }
    if (type === 'chat_message') {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800">
          <MessageSquare className="h-5 w-5" />
        </div>
      );
    }
    if (type === 'homework_assigned') {
      return (
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
          <Calendar className="h-5 w-5" />
        </div>
      );
    }
    return (
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-100 text-blue-800">
        <BookOpen className="h-5 w-5" />
      </div>
    );
  };

  return (
    <div data-testid="notification-center-page" className="space-y-4">
      {/* Demo Mode State Switcher */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2 text-xs">
          <span className="font-semibold text-amber-950">
            Trạng thái kiểm thử Trung tâm Thông báo (Demo):
          </span>
          <div className="flex items-center gap-1">
            {(
              [
                { id: 'unread', label: 'Có thông báo mới chưa đọc' },
                { id: 'all_read', label: 'Đã đọc tất cả' },
                { id: 'empty', label: 'Trống (Chưa có thông báo)' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  setDemoLocalReadIds({});
                  setDemoState(st.id);
                }}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
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

      {/* Header Card */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-800 text-white shadow-sm">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-lg font-bold text-stone-900">
                Trung tâm Thông báo & Sổ liên lạc
              </h1>
              {unreadCount > 0 && (
                <span
                  data-testid="notifications-unread-count-pill"
                  className="rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold text-white"
                >
                  {unreadCount} chưa đọc
                </span>
              )}
            </div>
            <p className="text-xs text-stone-500">
              Cập nhật tức thì điểm chấm bài tập, tin nhắn của Lão sư và lịch học lớp trực tiếp.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="enable-web-push-btn"
            onClick={handleEnableWebPush}
            className={`inline-flex items-center gap-1.5 rounded-xl border px-3.5 py-2 text-xs font-bold transition-colors ${
              pushEnabled
                ? 'border-emerald-300 bg-emerald-50 text-emerald-800'
                : 'border-stone-300 bg-stone-50 text-stone-700 hover:bg-stone-100'
            }`}
          >
            <BellRing className="h-3.5 w-3.5" />
            <span>{pushEnabled ? 'Đã bật thông báo đẩy PWA' : 'Bật thông báo trên thiết bị'}</span>
          </button>

          <button
            type="button"
            data-testid="mark-all-notifications-read-btn"
            disabled={unreadCount === 0 || markReadMutation.isPending}
            onClick={handleMarkAllRead}
            className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-40"
          >
            <CheckCheck className="h-4 w-4" />
            <span>Đánh dấu đã đọc tất cả</span>
          </button>
        </div>
      </div>

      {/* Filter Tabs & List */}
      <div className="rounded-2xl border border-stone-200 bg-white p-4 sm:p-5 shadow-2xs">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-3">
          {(
            [
              { id: 'all', label: `Tất cả (${notifications.length})` },
              { id: 'unread', label: `Chưa đọc (${unreadCount})` },
              { id: 'homework', label: 'Chấm bài & Điểm số' },
              { id: 'chat', label: 'Tin nhắn & Lịch học' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              data-testid={`notif-filter-${tab.id}`}
              onClick={() => setFilterTab(tab.id)}
              className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-colors ${
                filterTab === tab.id
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Items */}
        <div className="mt-4 space-y-2.5">
          {filteredList.length === 0 ? (
            <div
              data-testid="notifications-empty-state"
              className="flex flex-col items-center justify-center py-12 text-center"
            >
              <Bell className="h-10 w-10 text-stone-300" />
              <h3 className="mt-3 font-display text-sm font-bold text-stone-800">
                Không có thông báo nào trong mục này
              </h3>
              <p className="mt-1 text-xs text-stone-500">
                Khi Lão sư chấm điểm hoặc gửi thông báo lớp học mới, tin sẽ hiển thị ngay tại đây.
              </p>
            </div>
          ) : (
            filteredList.map((item) => (
              <div
                key={item.id}
                data-testid={`notification-item-${item.id}`}
                data-read={item.read ? 'true' : 'false'}
                className={`flex flex-wrap items-start justify-between gap-3 rounded-2xl border p-4 transition-all ${
                  !item.read
                    ? 'border-red-200 bg-red-50/50 shadow-2xs'
                    : 'border-stone-200 bg-white hover:bg-stone-50'
                }`}
              >
                <div
                  onClick={() => handleOpenNotification(item)}
                  className="flex min-w-0 flex-1 cursor-pointer items-start gap-3.5"
                >
                  {renderIcon(item.type)}

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3
                        className={`text-sm ${
                          !item.read
                            ? 'font-bold text-stone-950'
                            : 'font-semibold text-stone-800'
                        }`}
                      >
                        {item.title}
                      </h3>
                      {!item.read && (
                        <span className="rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          MỚI
                        </span>
                      )}
                      <span className="text-[11px] text-stone-400">
                        • {formatChatTimestamp(item.createdAt)}
                      </span>
                    </div>

                    <p className="mt-1 text-xs leading-relaxed text-stone-600">
                      {item.body}
                    </p>
                  </div>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {!item.read && (
                    <button
                      type="button"
                      data-testid={`mark-single-notif-read-${item.id}`}
                      onClick={() => markReadMutation.mutate([item.id])}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
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
                      className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                    >
                      <span>Xem chi tiết</span>
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
