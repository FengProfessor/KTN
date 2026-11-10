import React from 'react';
import fs from 'fs';
import path from 'path';
import { PGlite } from '@electric-sql/pglite';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, useLocation } from 'react-router-dom';
import {
  isTeacherUnassignedNotification,
  resolveNotificationLink,
  sanitizePostLoginRedirect,
} from '../../src/lib/utils';
import { NotificationCenter } from '../../src/features/notifications/components/NotificationCenter';
import { useAuthStore, DEMO_USERS } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { ktnApi } from '../../src/services/api/ktnApiClient';
import type { KtnNotification } from '../../src/types/ktn.types';

const LocationDisplay: React.FC = () => {
  const location = useLocation();
  return (
    <div data-testid="current-route-display">
      {location.pathname}
      {location.search}
    </div>
  );
};

describe('AGENT B — Notification Engine & Center Tests (B1–B5)', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  describe('1. resolveNotificationLink — All 7 Required Lifecycle Events (B1, B2, B3, B5)', () => {
    it('B1: routes class_created to /teacher/classes?class=<CODE> for assigned teacher', () => {
      const link = resolveNotificationLink(
        {
          type: 'class_created',
          classCode: 'YCT2-05',
          actionUrl: '/teacher/classes?class=YCT2-05',
        },
        'teacher'
      );
      expect(link).toBe('/teacher/classes?class=YCT2-05');

      const fallbackLink = resolveNotificationLink(
        {
          type: 'class_created',
          classCode: 'yct2-05',
        },
        'teacher'
      );
      expect(fallbackLink).toBe('/teacher/classes?class=YCT2-05');
    });

    it('B2: routes class_joined to /classrooms?class=<CODE> or /chat?room=class:<CODE> for student', () => {
      const classLink = resolveNotificationLink(
        {
          type: 'class_joined',
          classCode: 'YCT2-05',
        },
        'student'
      );
      expect(classLink).toBe('/classrooms?class=YCT2-05');

      const chatLink = resolveNotificationLink(
        {
          type: 'class_joined',
          classCode: 'YCT2-05',
          roomId: 'class:YCT2-05',
          actionUrl: '/chat?room=class:YCT2-05',
        },
        'student'
      );
      expect(chatLink).toBe('/chat?room=class%3AYCT2-05');

      const workerChatUrlLink = resolveNotificationLink(
        {
          type: 'class_joined',
          classCode: 'YCT2-05',
          roomId: 'class:YCT2-05',
          actionUrl: '/custom-page/so-lien-lac-test#/messages?roomId=class%3AYCT2-05',
        },
        'student'
      );
      expect(workerChatUrlLink).toBe('/chat?room=class%3AYCT2-05');
    });

    it('B3: routes class_teacher_changed to /teacher/classes?class=<CODE> for assigned teacher and /teacher/classes when unassigned', () => {
      const link = resolveNotificationLink(
        {
          type: 'class_teacher_changed',
          classCode: 'YCT2-05',
        },
        'teacher'
      );
      expect(link).toBe('/teacher/classes?class=YCT2-05');

      const removedLink = resolveNotificationLink(
        {
          id: 'class_teacher_changed:YCT2-05:old@khongtunhi.com:removed',
          type: 'class_teacher_changed',
          classCode: 'YCT2-05',
          body: 'Lớp YCT2-05 đã được chuyển sang giáo viên khác.',
        },
        'teacher'
      );
      expect(removedLink).toBe('/teacher/classes');

      const workerUnassignedNotif = {
        id: 'CLASS_TEACHER_UNASSIGNED_YCT2-05_abc_TO_def',
        eventId: 'CLASS_TEACHER_UNASSIGNED_YCT2-05_abc_TO_def',
        type: 'class_teacher_changed',
        classCode: 'YCT2-05',
        roomId: 'class:YCT2-05',
        title: 'Thay đổi phân công lớp YCT2-05',
        body: 'Lớp YCT2-05 đã được chuyển phân công sang giáo viên khác.',
        actionUrl: '/custom-page/so-lien-lac-test#/teacher/classes',
        meta: { roleInEvent: 'previous_teacher' },
      };
      expect(isTeacherUnassignedNotification(workerUnassignedNotif)).toBe(true);
      expect(resolveNotificationLink(workerUnassignedNotif, 'teacher')).toBe('/teacher/classes');
    });

    it('B5: routes schedule_changed to /classrooms?class=<CODE> for student and /teacher/classes?class=<CODE> for teacher', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'schedule_changed',
            classCode: 'YCT2-05',
            actionUrl: '/custom-page/so-lien-lac-test#/lop/yct2-05/buoi/1',
          },
          'student'
        )
      ).toBe('/classrooms?class=YCT2-05&session=1');

      expect(
        resolveNotificationLink(
          {
            type: 'schedule_changed',
            classCode: 'YCT2-05',
          },
          'teacher'
        )
      ).toBe('/teacher/classes?class=YCT2-05');
    });

    it('B5: routes class_reminder to external Zoom URL when present or /classrooms?class=<CODE> internally', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'class_reminder',
            classCode: 'YCT2-05',
            actionUrl: 'https://zoom.us/j/9988776655',
          },
          'student'
        )
      ).toBe('https://zoom.us/j/9988776655');

      expect(
        resolveNotificationLink(
          {
            type: 'class_reminder',
            classCode: 'YCT2-05',
            actionUrl: 'https://khongtunhi.com/custom-page/so-lien-lac-test#/lop/yct2-05/buoi/2',
          },
          'student'
        )
      ).toBe('/classrooms?class=YCT2-05&session=2');
    });

    it('B5: routes chat_group_message to canonical /chat?room=class%3A<CODE>', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'chat_group_message',
            roomId: 'class:YCT2-05',
            classCode: 'YCT2-05',
          },
          'student'
        )
      ).toBe('/chat?room=class%3AYCT2-05');

      expect(
        resolveNotificationLink(
          {
            eventType: 'chat_group_message',
            action_url: '/custom-page/so-lien-lac-test#/nhom-lop?classCode=YCT2-05',
          },
          'teacher'
        )
      ).toBe('/chat?room=class%3AYCT2-05');
    });

    it('B5: routes homework_assigned with session/exercise deep-link for student', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'homework_assigned',
            classCode: 'YCT2-05',
            lessonNum: 201,
          },
          'student'
        )
      ).toBe('/classrooms?class=YCT2-05&session=2&exercise=201');
    });
  });

  describe('2. Role Safety Guard — Never Route Student to /admin or /teacher', () => {
    it('redirects student away from /admin or /teacher notification URLs to safe student routes', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'class_joined',
            classCode: 'YCT2-05',
            actionUrl: '/teacher/classes?class=YCT2-05',
          },
          'student'
        )
      ).toBe('/classrooms?class=YCT2-05');

      expect(
        resolveNotificationLink(
          {
            type: 'order_pending',
            actionUrl: '#/admin/orders',
            classCode: 'YCT2-05',
          },
          'student'
        )
      ).toBe('/classrooms?class=YCT2-05');

      expect(
        resolveNotificationLink(
          {
            actionUrl: '/admin',
          },
          'student'
        )
      ).toBe('/notifications');
    });

    it('redirects teacher away from /admin notification URLs to /teacher/classes', () => {
      expect(
        resolveNotificationLink(
          {
            type: 'class_created',
            classCode: 'YCT2-05',
            actionUrl: '/admin/classes',
          },
          'teacher'
        )
      ).toBe('/teacher/classes?class=YCT2-05');
    });
  });

  describe('3. Post-Login Deep-Link Preservation (sanitizePostLoginRedirect)', () => {
    it('preserves valid deep-links after login and blocks open redirects or unauthorized role paths', () => {
      expect(
        sanitizePostLoginRedirect('/teacher/classes?class=YCT2-05', 'teacher')
      ).toBe('/teacher/classes?class=YCT2-05');

      expect(
        sanitizePostLoginRedirect('/chat?room=class%3AYCT2-05', 'student')
      ).toBe('/chat?room=class%3AYCT2-05');

      // Blocks external open redirect
      expect(
        sanitizePostLoginRedirect('https://evil.example.com/phish', 'student')
      ).toBe('/');
      expect(sanitizePostLoginRedirect('//evil.example.com', 'student')).toBe('/');

      // Blocks student from landing on /admin or /teacher after login
      expect(
        sanitizePostLoginRedirect('/admin/classes', 'student')
      ).toBe('/notifications');
      expect(
        sanitizePostLoginRedirect('/teacher/classes?class=YCT2-05', 'student')
      ).toBe('/classrooms?class=YCT2-05');
    });
  });

  describe('4. NotificationCenter Component — 7 Event Types, Unread Sync, Filter Tabs & Mark Read', () => {
    const sampleNotifications: KtnNotification[] = [
      {
        id: 'evt_class_created_yct2_05',
        eventId: 'evt_class_created_yct2_05',
        type: 'class_created',
        title: 'Bạn được phân công lớp mới',
        body: 'Bạn vừa được phân công phụ trách lớp YCT2-05. Mở lớp để xem lịch học và nhóm trao đổi.',
        classCode: 'YCT2-05',
        roomId: 'class:YCT2-05',
        actionUrl: '/teacher/classes?class=YCT2-05',
        actionLabel: 'Mở lớp YCT2-05',
        createdAt: '2026-11-10T03:00:00.000Z',
        read: false,
      },
      {
        id: 'evt_class_joined_yct2_05_stu1',
        eventId: 'evt_class_joined_yct2_05_stu1',
        type: 'class_joined',
        title: 'Bạn đã được thêm vào lớp YCT2-05',
        body: 'Bạn đã được thêm vào lớp YCT2-05 (Giáo viên: Cô Lâm Mỹ Linh). Hãy mở Sổ liên lạc để xem lịch học và nhóm lớp nhé!',
        classCode: 'YCT2-05',
        roomId: 'class:YCT2-05',
        actionUrl: '/classrooms?class=YCT2-05',
        actionLabel: 'Mở lớp YCT2-05',
        createdAt: '2026-11-10T03:05:00.000Z',
        read: false,
      },
      {
        id: 'evt_class_teacher_changed_yct2_05',
        eventId: 'evt_class_teacher_changed_yct2_05',
        type: 'class_teacher_changed',
        title: 'Cập nhật phân công lớp YCT2-05',
        body: 'Bạn vừa được phân công phụ trách lớp YCT2-05.',
        classCode: 'YCT2-05',
        roomId: 'class:YCT2-05',
        actionUrl: '/teacher/classes?class=YCT2-05',
        createdAt: '2026-11-10T03:10:00.000Z',
        read: false,
      },
      {
        id: 'evt_schedule_changed_yct2_05',
        eventId: 'evt_schedule_changed_yct2_05',
        type: 'schedule_changed',
        title: 'Lịch học lớp YCT2-05 đã cập nhật',
        body: 'Thứ 3 & Thứ 5 (19:30 - 20:30)',
        classCode: 'YCT2-05',
        actionUrl: '/classrooms?class=YCT2-05',
        createdAt: '2026-11-10T03:15:00.000Z',
        read: false,
      },
      {
        id: 'evt_class_reminder_yct2_05_s1',
        eventId: 'evt_class_reminder_yct2_05_s1',
        type: 'class_reminder',
        title: 'Sắp đến giờ học lớp YCT2-05 (trước 30 phút)',
        body: 'Buổi 1 bắt đầu lúc 19:30 hôm nay.',
        classCode: 'YCT2-05',
        actionUrl: '/classrooms?class=YCT2-05&session=1',
        createdAt: '2026-11-10T03:20:00.000Z',
        read: false,
      },
      {
        id: 'evt_chat_group_msg_yct2_05_1',
        eventId: 'evt_chat_group_msg_yct2_05_1',
        type: 'chat_group_message',
        title: 'Tin nhắn mới trong Nhóm lớp YCT2-05',
        body: 'Cô Lâm Mỹ Linh: Chào mừng các con vào lớp YCT2-05!',
        classCode: 'YCT2-05',
        roomId: 'class:YCT2-05',
        actionUrl: '/chat?room=class:YCT2-05',
        createdAt: '2026-11-10T03:25:00.000Z',
        read: false,
      },
      {
        id: 'evt_hw_assigned_yct2_05_201',
        eventId: 'evt_hw_assigned_yct2_05_201',
        type: 'homework_assigned',
        title: 'Bài tập mới lớp YCT2-05',
        body: 'Buổi 2: Thu âm giới thiệu gia đình.',
        classCode: 'YCT2-05',
        lessonNum: 201,
        actionUrl: '/classrooms?class=YCT2-05&session=2&exercise=201',
        createdAt: '2026-11-10T03:30:00.000Z',
        read: true,
      },
    ];

    it('renders all 7 lifecycle event types, filters accurately, marks read, and navigates to deep-links', async () => {
      useUiStore.setState({ isDemoMode: false });
      useAuthStore.setState({
        user: {
          ...DEMO_USERS.teacher,
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          role: 'teacher',
          assignedClasses: ['YCT2-05'],
        },
        isRestoring: false,
      });

      const getNotifsSpy = vi
        .spyOn(ktnApi, 'getNotifications')
        .mockResolvedValue({
          notifications: sampleNotifications,
          readIds: ['evt_hw_assigned_yct2_05_201'],
        });
      vi.spyOn(ktnApi, 'getNotificationSettings').mockResolvedValue({
        chat: true,
        homework: true,
        grades: true,
        schedule: true,
        important: true,
        reminder10Min: false,
      });
      const markReadSpy = vi
        .spyOn(ktnApi, 'markNotificationsRead')
        .mockResolvedValue({ markedCount: 1 });

      const queryClient = new QueryClient({
        defaultOptions: {
          queries: { retry: false },
        },
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/notifications']}>
            <NotificationCenter />
            <LocationDisplay />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(getNotifsSpy).toHaveBeenCalled();
      });

      // Verify all 7 items are rendered in 'all' tab
      for (const item of sampleNotifications) {
        expect(
          await screen.findByTestId(`notification-item-${item.id}`)
        ).toBeTruthy();
      }

      // Verify unread count pill shows 6 unread items
      const unreadPill = await screen.findByTestId('notifications-unread-count-pill');
      expect(unreadPill.textContent).toContain('6 mới');

      // Filter by 'chat' -> should show chat_group_message
      fireEvent.click(screen.getByTestId('notif-filter-chat'));
      expect(
        screen.getByTestId('notification-item-evt_chat_group_msg_yct2_05_1')
      ).toBeTruthy();
      expect(
        screen.queryByTestId('notification-item-evt_class_created_yct2_05')
      ).toBeNull();

      // Filter by 'important' -> should show class_created, class_joined, class_teacher_changed
      fireEvent.click(screen.getByTestId('notif-filter-important'));
      expect(
        screen.getByTestId('notification-item-evt_class_created_yct2_05')
      ).toBeTruthy();
      expect(
        screen.getByTestId('notification-item-evt_class_joined_yct2_05_stu1')
      ).toBeTruthy();
      expect(
        screen.getByTestId('notification-item-evt_class_teacher_changed_yct2_05')
      ).toBeTruthy();

      // Click primary open button on class_created -> marks read & navigates to /teacher/classes?class=YCT2-05
      fireEvent.click(
        screen.getByTestId('open-notif-target-evt_class_created_yct2_05')
      );

      await waitFor(() => {
        expect(markReadSpy).toHaveBeenCalledWith(['evt_class_created_yct2_05']);
        expect(screen.getByTestId('current-route-display').textContent).toBe(
          '/teacher/classes?class=YCT2-05'
        );
      });

      // Click secondary quick chat button on class_joined -> navigates to /chat?room=class%3AYCT2-05
      fireEvent.click(
        screen.getByTestId('open-notif-chat-evt_class_joined_yct2_05_stu1')
      );

      await waitFor(() => {
        expect(markReadSpy).toHaveBeenCalledWith(['evt_class_joined_yct2_05_stu1']);
        expect(screen.getByTestId('current-route-display').textContent).toBe(
          '/chat?room=class%3AYCT2-05'
        );
      });
    });
  });

  describe('5. Durable PostgreSQL Notification Deduplication & RLS (B4)', () => {
    it('enforces unique (event_id, LOWER(recipient_email)) index and service_role RLS on public.ktn_notifications', async () => {
      const db = new PGlite();
      try {
        await db.exec(`
          DO $$ BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
          END $$;
        `);

        const migrationPath = path.resolve(
          __dirname,
          '../../../../supabase/migrations/20261109_ktn_master_upgrade.sql'
        );
        const fullSql = fs.readFileSync(migrationPath, 'utf8');
        const sec4bStart = fullSql.indexOf(
          '-- 4B. DURABLE NOTIFICATIONS & EVENT_ID DEDUPLICATION (AGENT B)'
        );
        const sec5Start = fullSql.indexOf(
          '-- 5. ROW-LEVEL SECURITY (RLS) & ROLE GRANTS (WORKER BFF ARCHITECTURE)'
        );
        const notifMigrationSql = fullSql.slice(sec4bStart, sec5Start);
        await db.exec(notifMigrationSql);
        await db.exec(`
          ALTER TABLE public.ktn_notifications ENABLE ROW LEVEL SECURITY;
          ALTER TABLE public.ktn_notifications FORCE ROW LEVEL SECURITY;
          REVOKE ALL ON public.ktn_notifications FROM PUBLIC, anon, authenticated;
          GRANT ALL ON public.ktn_notifications TO service_role;
          DROP POLICY IF EXISTS service_role_only_ktn_notifications ON public.ktn_notifications;
          CREATE POLICY service_role_only_ktn_notifications ON public.ktn_notifications
            FOR ALL TO service_role USING (true) WITH CHECK (true);
        `);

        // 1. Insert first class_created notification for teacher A
        await db.query(
          `INSERT INTO public.ktn_notifications (id, event_id, recipient_email, recipient_role, type, class_code, room_id, title, body, action_url)
           VALUES ($1, $2, $3, 'teacher', 'class_created', 'YCT2-05', 'class:YCT2-05', $4, $5, $6)`,
          [
            'notif_1',
            'class_created:YCT2-05:linh.lam@khongtunhi.com',
            'linh.lam@khongtunhi.com',
            'Bạn được phân công lớp mới',
            'Bạn vừa được phân công phụ trách lớp YCT2-05. Mở lớp để xem lịch học và nhóm trao đổi.',
            '/teacher/classes?class=YCT2-05',
          ]
        );

        // 2. Retry with same event_id + recipient_email (even uppercase) -> blocked by unique partial index
        let duplicateRejected = false;
        try {
          await db.query(
            `INSERT INTO public.ktn_notifications (id, event_id, recipient_email, recipient_role, type, class_code, room_id, title, body, action_url)
             VALUES ($1, $2, $3, 'teacher', 'class_created', 'YCT2-05', 'class:YCT2-05', $4, $5, $6)`,
            [
              'notif_1_retry',
              'class_created:YCT2-05:linh.lam@khongtunhi.com',
              'LINH.LAM@KHONGTUNHI.COM',
              'Bạn được phân công lớp mới',
              'Retry body',
              '/teacher/classes?class=YCT2-05',
            ]
          );
        } catch (err: any) {
          if (String(err?.code || '') === '23505') {
            duplicateRejected = true;
          }
        }
        expect(duplicateRejected).toBe(true);

        // 3. Same event_id for a DIFFERENT recipient (e.g. group message fan-out) -> allowed!
        await db.query(
          `INSERT INTO public.ktn_notifications (id, event_id, recipient_email, recipient_role, type, class_code, room_id, title, body, action_url)
           VALUES ($1, $2, $3, 'student', 'chat_group_message', 'YCT2-05', 'class:YCT2-05', 'Tin nhắn nhóm', 'Nội dung', '/chat?room=class:YCT2-05')`,
          ['notif_group_stu1', 'chat_msg:MSG-900', 'stu1@khongtunhi.com']
        );
        await db.query(
          `INSERT INTO public.ktn_notifications (id, event_id, recipient_email, recipient_role, type, class_code, room_id, title, body, action_url)
           VALUES ($1, $2, $3, 'student', 'chat_group_message', 'YCT2-05', 'class:YCT2-05', 'Tin nhắn nhóm', 'Nội dung', '/chat?room=class:YCT2-05')`,
          ['notif_group_stu2', 'chat_msg:MSG-900', 'stu2@khongtunhi.com']
        );

        const countRes = await db.query<{ cnt: string }>(
          `SELECT COUNT(*)::text AS cnt FROM public.ktn_notifications`
        );
        expect(Number(countRes.rows[0]?.cnt)).toBe(3);

        // 4. Worker emitTargetedLifecycleNotification payload (id, user_email, target_email without event_id/recipient_email)
        await db.query(
          `INSERT INTO public.ktn_notifications (id, user_email, target_email, type, class_code, title, body, action_url, action_label, read)
           VALUES ($1, $2, $3, 'class_joined', 'YCT2-05', 'Bạn đã được thêm vào lớp YCT2-05', 'Mở Sổ liên lạc', '/classrooms?class=YCT2-05', 'Mở lớp', false)`,
          [
            'CLASS_JOINED_YCT2-05_hoangngan@khongtunhi.com_NONE',
            'HoangNgan@khongtunhi.com',
            'HoangNgan@khongtunhi.com',
          ]
        );
        const syncedRow = await db.query<{
          event_id: string;
          recipient_email: string;
          user_email: string;
        }>(
          `SELECT event_id, recipient_email, user_email FROM public.ktn_notifications WHERE id = $1`,
          ['CLASS_JOINED_YCT2-05_hoangngan@khongtunhi.com_NONE']
        );
        expect(syncedRow.rows[0]?.event_id).toBe(
          'CLASS_JOINED_YCT2-05_hoangngan@khongtunhi.com_NONE'
        );
        expect(syncedRow.rows[0]?.recipient_email).toBe('hoangngan@khongtunhi.com');

        let workerDuplicateRejected = false;
        try {
          await db.query(
            `INSERT INTO public.ktn_notifications (id, event_id, user_email, target_email, type, class_code, title, body, action_url, read)
             VALUES ($1, $2, $3, $4, 'class_joined', 'YCT2-05', 'Retry', 'Retry', '/classrooms?class=YCT2-05', false)`,
            [
              'notif_worker_retry_2',
              'CLASS_JOINED_YCT2-05_hoangngan@khongtunhi.com_NONE',
              'hoangngan@khongtunhi.com',
              'hoangngan@khongtunhi.com',
            ]
          );
        } catch (err: any) {
          if (String(err?.code || '') === '23505') {
            workerDuplicateRejected = true;
          }
        }
        expect(workerDuplicateRejected).toBe(true);

        // 5. Verify anon role is denied direct SELECT
        let anonDenied = false;
        try {
          await db.exec(`SET ROLE anon; SELECT * FROM public.ktn_notifications; RESET ROLE;`);
        } catch {
          anonDenied = true;
          await db.exec(`RESET ROLE;`).catch(() => null);
        }
        expect(anonDenied).toBe(true);
      } finally {
        await db.close();
      }
    });
  });

  describe('6. Service Worker sw.js — resolveSwColdOpenUrl Deep-Link Routing', () => {
    it('normalizes full internal URLs, ?view=groups/grade/orders, /messages, and /dashboard fallbacks in sw.js', () => {
      const swPath = path.resolve(__dirname, '../../../../sw.js');
      const publicSwPath = path.resolve(__dirname, '../../public/sw.js');
      const swSource = fs.readFileSync(swPath, 'utf8');
      const publicSwSource = fs.readFileSync(publicSwPath, 'utf8');
      expect(publicSwSource).toBe(swSource);

      const fnStart = swSource.indexOf('function resolveSwColdOpenUrl(data)');
      const fnEnd = swSource.indexOf('// 4. Khi người dùng chạm vào thông báo');
      const fnCode = swSource.slice(fnStart, fnEnd);
      const resolveSwColdOpenUrl = new Function(
        'data',
        `${fnCode}\nreturn resolveSwColdOpenUrl(data);`
      ) as (data: Record<string, unknown>) => string;

      expect(
        resolveSwColdOpenUrl({
          url: 'https://khongtunhi.com/custom-page/so-lien-lac-test?view=groups&room=class:YCT2-05',
          eventType: 'chat_group_message',
          classCode: 'YCT2-05',
        })
      ).toBe('/custom-page/so-lien-lac-test#/chat?room=class%3AYCT2-05');

      expect(
        resolveSwColdOpenUrl({
          url: '/custom-page/so-lien-lac-test#/messages?roomId=class:YCT2-05',
          eventType: 'class_joined',
          classCode: 'YCT2-05',
        })
      ).toBe('/custom-page/so-lien-lac-test#/chat?room=class%3AYCT2-05');

      expect(
        resolveSwColdOpenUrl({
          url: '/custom-page/so-lien-lac-test#/dashboard',
          eventType: 'class_created',
          classCode: 'YCT2-05',
        })
      ).toBe('/custom-page/so-lien-lac-test#/teacher/classes?class=YCT2-05');

      expect(
        resolveSwColdOpenUrl({
          url: '/custom-page/so-lien-lac-test?view=grade&hwId=HW-999',
          eventType: 'homework_submitted',
        })
      ).toBe('/custom-page/so-lien-lac-test#/teacher?hwId=HW-999');
    });
  });
});
