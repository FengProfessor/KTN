import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, render, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  inspectDlpClient,
  generateClientMessageId,
  getInitials,
  formatFileSize,
  resolveNotificationLink,
  resolveHomeworkLink,
  resolveStudentOnlineCourses,
  disambiguateCatalogCourses,
} from '../../src/lib/utils';
import {
  chatApi,
  encodeAttachmentUrl,
  parseAttachmentFromUrl,
  normalizeServerMessage,
  hasRoomRealMessages,
  sortChatRoomsLatestFirst,
  isRedundantAttachmentPlaceholder,
  getDisplayMessageCaption,
  formatRoomPreviewText,
  truncateFileName,
  shouldGroupWithPreviousMessage,
} from '../../src/features/chat/services/chatApi';
import { MessageBubble } from '../../src/features/chat/components/MessageBubble';
import {
  ConversationList,
  formatCompactRoomTitle,
} from '../../src/features/chat/components/ConversationList';
import { useChatRooms, useRoomMessages } from '../../src/features/chat/hooks/useMessages';
import { useSendMessage } from '../../src/features/chat/hooks/useSendMessage';
import { useUiStore } from '../../src/stores/useUiStore';
import { useAuthStore, DEMO_USERS } from '../../src/stores/useAuthStore';
import { roleNavigation } from '../../src/app/navigation/navigationConfig';
import {
  formatShortPersonName,
  resolveHeaderTitle,
} from '../../src/app/navigation/roleRoutes';
import { shouldUseHashRouter } from '../../src/app/providers/AppProviders';
import { ktnApi } from '../../src/services/api/ktnApiClient';
import {
  CONTACT_STATUS_META,
  PAYMENT_STATUS_META,
  ACCOUNT_STATUS_META,
} from '../../src/features/admin/components/OrderDetailDrawer';
import type { ChatMessage } from '../../src/features/chat/types/chat.types';

describe('KTN UI V2 — Unit & State Machine Tests', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('1. Classroom DLP Guard (inspectDlpClient)', () => {
    it('allows normal Vietnamese and Chinese classroom messages', () => {
      const res = inspectDlpClient('Con chào Lão sư! 老师好，我叫阮黄银。Hôm nay học trang 12 ạ.');
      expect(res.blocked).toBe(false);
      expect(res.reasons).toHaveLength(0);
    });

    it('blocks personal Vietnamese phone numbers in various formats', () => {
      expect(inspectDlpClient('Mẹ nhắn số của mẹ nhé 0912345678').blocked).toBe(true);
      expect(inspectDlpClient('Liên hệ +84 988.123.456 giúp em').blocked).toBe(true);
    });

    it('blocks external social links (Zalo, Facebook, Telegram)', () => {
      expect(inspectDlpClient('Kết bạn qua https://zalo.me/0912345678 nhé').blocked).toBe(true);
      expect(inspectDlpClient('Xem trang https://facebook.com/group123').blocked).toBe(true);
    });
  });

  describe('2. Attachment URL Encoding & Server Message Normalization', () => {
    it('encodes and parses PDF/audio/image attachment metadata losslessly', () => {
      const encoded = encodeAttachmentUrl({
        kind: 'audio',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/test.wav',
        name: 'Bai_Thu_Am_B1.wav',
        sizeLabel: '240 KB',
        durationSec: 32,
      });

      const parsed = parseAttachmentFromUrl(encoded);
      expect(parsed).not.toBeNull();
      expect(parsed?.kind).toBe('audio');
      expect(parsed?.name).toBe('Bai_Thu_Am_B1.wav');
      expect(parsed?.durationSec).toBe(32);
      expect(parsed?.url).toBe('https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/test.wav');
    });

    it('normalizes quoted reply prefix from server message content', () => {
      const raw = {
        id: 'MSG-100',
        room_id: 'class:YCT2-04',
        sender_email: 'hoangngan@khongtunhi.com',
        sender_name: 'Bé Nguyễn Hoàng Ngân',
        sender_role: 'student',
        content: '[Trả lời Cô Lâm Mỹ Linh: "Các con nộp bài trước 18h nhé"]\nDạ con đã nộp bài rồi ạ!',
        created_at: '2026-11-05T10:00:00.000Z',
      };

      const normalized = normalizeServerMessage(raw);
      expect(normalized.replyTo).toEqual({
        id: 'quoted',
        senderName: 'Cô Lâm Mỹ Linh',
        content: 'Các con nộp bài trước 18h nhé',
      });
      expect(normalized.content).toBe('Dạ con đã nộp bài rồi ạ!');
      expect(normalized.status).toBe('sent');
    });
  });

  describe('3. Chat Delivery State Machine (sending -> failed -> retry with same clientMessageId)', () => {
    it('tracks sending -> failed and preserves clientMessageId + draft for retry', () => {
      const roomId = 'class:YCT2-04';
      const clientId = generateClientMessageId('cmsg');
      const store = useUiStore.getState();

      const pendingMsg: ChatMessage = {
        id: clientId,
        clientMessageId: clientId,
        room_id: roomId,
        class_code: 'YCT2-04',
        sender_email: 'hoangngan@khongtunhi.com',
        sender_name: 'Bé Nguyễn Hoàng Ngân',
        sender_role: 'student',
        content: 'Con nộp bài đọc trang 15 ạ!',
        created_at: new Date().toISOString(),
        status: 'sending',
      };

      // Step 1: Enter sending queue
      store.addSendingMessage(roomId, pendingMsg);
      expect(useUiStore.getState().sendingMessagesByRoom[roomId]).toHaveLength(1);
      expect(useUiStore.getState().sendingMessagesByRoom[roomId][0].status).toBe('sending');

      // Step 2: Simulate API failure -> move to failed queue & preserve clientMessageId
      store.markMessageFailed(roomId, pendingMsg, 'HTTP 503 Simulated DB Error');
      expect(useUiStore.getState().sendingMessagesByRoom[roomId]).toHaveLength(0);
      const failedList = useUiStore.getState().failedMessagesByRoom[roomId];
      expect(failedList).toHaveLength(1);
      expect(failedList[0].status).toBe('failed');
      expect(failedList[0].clientMessageId).toBe(clientId);
      expect(failedList[0].errorMessage).toContain('503');

      // Step 3: Simulate retry success -> remove from failed queue
      store.removeFailedMessage(roomId, clientId);
      expect(useUiStore.getState().failedMessagesByRoom[roomId]).toHaveLength(0);
    });

    it('persists per-room message draft in memory and localStorage and clears on resetSessionUiState', () => {
      const store = useUiStore.getState();
      store.setRoomDraft('class:YCT2-04', 'Bản nháp đang gõ dở...');
      expect(store.getRoomDraft('class:YCT2-04')).toBe('Bản nháp đang gõ dở...');
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBe(
        'Bản nháp đang gõ dở...'
      );

      store.resetSessionUiState();
      expect(store.getRoomDraft('class:YCT2-04')).toBe('');
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();
    });
  });

  describe('4. Formatting & Notification Deep-Link Resolution', () => {
    it('computes initials and file sizes accurately', () => {
      expect(getInitials('Bé Nguyễn Hoàng Ngân')).toBe('HN');
      expect(getInitials('KTN')).toBe('KT');
      expect(formatFileSize(1536)).toBe('1.5 KB');
      expect(formatFileSize(2 * 1024 * 1024)).toBe('2.0 MB');
    });

    it('resolves backend and demo notification links to exact routes and query params', () => {
      expect(
        resolveNotificationLink({
          type: 'homework_graded',
          courseId: '6adadba969897b0002482ca5',
          lessonNum: 2,
          actionUrl: '#/khoa/6adadba969897b0002482ca5/bai/2',
        })
      ).toBe('/learning?courseId=6adadba969897b0002482ca5&lesson=2&tab=homework');

      expect(
        resolveNotificationLink({
          type: 'homework_assigned',
          classCode: 'YCT2-04',
          sessionNum: 2,
          actionUrl: '#/lop/yct2-04/buoi/2',
        })
      ).toBe('/classrooms?class=YCT2-04&session=2');

      expect(
        resolveNotificationLink({
          type: 'chat_message',
          classCode: 'YCT2-04',
          roomId: 'class:YCT2-04',
          actionUrl: '#/lop/yct2-04/buoi/1',
        })
      ).toBe('/chat?room=class%3AYCT2-04');

      expect(
        resolveNotificationLink({
          type: 'homework_submitted',
          homeworkId: 'HW-123',
          actionUrl: '/custom-page/so-lien-lac-test?view=grade&hwId=HW-123',
        })
      ).toBe('/teacher?hwId=HW-123');

      expect(
        resolveNotificationLink({
          type: 'order_pending',
          actionUrl: '/custom-page/so-lien-lac-test?view=orders&orderId=ORD-1',
        })
      ).toBe('/admin');

      expect(
        resolveNotificationLink({
          type: 'class_reminder',
          classCode: 'YCT2-04',
          actionUrl: '#/classrooms?class=YCT2-04',
        })
      ).toBe('/classrooms?class=YCT2-04');

      expect(
        resolveNotificationLink({
          type: 'class_reminder',
          classCode: 'YCT2-04',
          actionUrl: 'https://zoom.us/j/123456789',
        })
      ).toBe('https://zoom.us/j/123456789');

      expect(
        resolveNotificationLink({
          type: 'schedule_changed',
          classCode: 'YCT2-04',
          actionUrl: '#/classrooms?class=YCT2-04',
        })
      ).toBe('/classrooms?class=YCT2-04');

      expect(
        resolveNotificationLink({
          type: 'session_cancelled',
          classCode: 'YCT2-04',
          actionUrl: '#/classrooms?class=YCT2-04',
        })
      ).toBe('/classrooms?class=YCT2-04');

      expect(
        resolveNotificationLink({
          type: 'course_granted',
          courseId: '6adadba969897b0002482ca5',
          actionUrl: '#/learning?courseId=6adadba969897b0002482ca5',
        })
      ).toBe('/learning?courseId=6adadba969897b0002482ca5');

      expect(
        resolveNotificationLink({
          type: 'class_announcement',
          actionUrl: '/custom-page/so-lien-lac-test#/admin/orders',
        })
      ).toBe('/admin');

      expect(
        resolveNotificationLink({
          type: 'class_announcement',
          courseId: '6adadba969897b0002482ca5',
          actionUrl: '#/khoa/6adadba969897b0002482ca5/bai/1',
        })
      ).toBe('/learning?courseId=6adadba969897b0002482ca5&lesson=1&tab=homework');

      // Live classroom homework notifications (course_id = CLASS_<CODE>) must open /classrooms, never /learning
      expect(
        resolveNotificationLink({
          type: 'homework_graded',
          courseId: 'CLASS_YCT2-04',
          lessonNum: 201,
          actionUrl: '/learning?courseId=CLASS_YCT2-04&lesson=201&tab=homework',
        })
      ).toBe('/classrooms?class=YCT2-04&session=2&exercise=201');

      expect(
        resolveHomeworkLink({
          course_id: 'CLASS_YCT2-04',
          class_code: 'YCT2-04',
          lesson_num: 101,
        })
      ).toBe('/classrooms?class=YCT2-04&session=1&exercise=101');

      expect(
        resolveHomeworkLink({
          course_id: '6adadba969897b0002482ca5',
          class_code: 'YCT2-04',
          lesson_num: 3,
        })
      ).toBe('/learning?courseId=6adadba969897b0002482ca5&lesson=3&tab=homework');
    });
  });

  describe('5. Role-Based Navigation & Compact Header Resolution (P0-01/P0-02/P0-03)', () => {
    it('defines purposeful 5-item mobile navigation per role without sharing student items', () => {
      const studentMobile = roleNavigation.student.mobile.map((i) => i.label);
      const teacherMobile = roleNavigation.teacher.mobile.map((i) => i.label);
      const adminMobile = roleNavigation.admin.mobile.map((i) => i.label);

      expect(studentMobile).toEqual(['Trang chủ', 'Học', 'Lớp', 'Tin nhắn', 'Thông báo']);
      expect(teacherMobile).toEqual(['Tổng quan', 'Lớp', 'Chấm bài', 'Tin nhắn', 'Thông báo']);
      expect(adminMobile).toEqual(['Tổng quan', 'Học viên', 'Lớp', 'Đơn hàng', 'Thêm']);
    });

    it('formats short greeting names and route-aware compact header titles', () => {
      const studentUser = DEMO_USERS.student_both;
      const teacherUser = DEMO_USERS.teacher;
      const adminUser = DEMO_USERS.admin;

      expect(formatShortPersonName('Bé Nguyễn Hoàng Ngân')).toBe('Hoàng Ngân');

      expect(resolveHeaderTitle('/', 'student', studentUser).title).toBe('Chào Hoàng Ngân 👋');
      expect(resolveHeaderTitle('/', 'teacher', teacherUser).title).toBe('Chào Cô Lâm Mỹ Linh');
      expect(resolveHeaderTitle('/', 'admin', adminUser).title).toBe('Quản lý học vụ');
      expect(resolveHeaderTitle('/learning', 'student', studentUser).title).toBe('Học tiếp');
      expect(resolveHeaderTitle('/chat', 'student', studentUser).title).toBe('Tin nhắn');
      expect(resolveHeaderTitle('/teacher/classes', 'teacher', teacherUser).title).toBe('Lớp của tôi');
      expect(resolveHeaderTitle('/admin/orders', 'admin', adminUser).title).toBe('Đơn hàng');
    });
  });

  describe('6. Demo vs Live Identity Isolation (P0-05)', () => {
    it('keeps demoUser in memory only and never persists DEMO-MODE-ONLY token to localStorage', () => {
      const auth = useAuthStore.getState();
      auth.setDemoUser(DEMO_USERS.teacher);

      expect(useAuthStore.getState().demoUser?.role).toBe('teacher');
      expect(localStorage.getItem('ktn_v2_auth_session')).toBeNull();

      // Switching back to live mode without a live authUser clears active user
      auth.syncModeUser(false);
      expect(useAuthStore.getState().user).toBeNull();
    });

    it('starts with empty completedLessons (no fabricated Lesson 1 completion) and clears localStorage chat drafts on identity switch', () => {
      localStorage.removeItem('ktn_v2_completed_lessons');
      expect(useUiStore.getState().completedLessons).toEqual({});

      useUiStore.getState().setRoomDraft('class:YCT2-04', 'Bản nháp riêng tư');
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBe('Bản nháp riêng tư');

      useUiStore.getState().resetSessionUiState();
      expect(useUiStore.getState().draftByRoom).toEqual({});
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();
    });

    it('synchronously clears room drafts in localStorage and memory as soon as logout() begins (before async ktnApi.logout resolves)', async () => {
      let resolveLogoutApi!: () => void;
      const logoutSpy = vi.spyOn(ktnApi, 'logout').mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveLogoutApi = resolve;
          })
      );

      useUiStore.getState().setRoomDraft('class:YCT2-04', 'Bản nháp riêng của Hoàng Ngân');
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBe(
        'Bản nháp riêng của Hoàng Ngân'
      );

      const logoutPromise = useAuthStore.getState().logout();

      // Even before ktnApi.logout() resolves, draft keys must already be purged
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();
      expect(useUiStore.getState().draftByRoom).toEqual({});
      expect(useAuthStore.getState().user).toBeNull();

      resolveLogoutApi();
      await logoutPromise;
      expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();
      logoutSpy.mockRestore();
    });

    it('T09: switching from Demo to Live mode does not leak cached Demo ktn-classes (Cô Lâm Mỹ Linh) into Live useChatRooms', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      // Seed Demo mode ktn-classes cache entry (queryKey[2] === true) with Cô Lâm Mỹ Linh
      queryClient.setQueryData(
        ['ktn-classes', 'quanly@khongtunhi.com', true],
        [
          {
            id: 'YCT2-04',
            name: 'Lớp Demo YCT2-04',
            teacher_name: 'Cô Lâm Mỹ Linh',
            teacher_email: 'linh.lam@khongtunhi.com',
            active: true,
          },
        ]
      );
      useAuthStore.setState({
        user: {
          id: 'admin-live',
          email: 'quanly@khongtunhi.com',
          name: 'Quản lý Học vụ',
          role: 'admin',
          roles: ['admin'],
          classCode: null,
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: false });

      const getRoomsSpy = vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
        role: 'admin',
        groupRooms: [
          {
            roomId: 'class:TESTOK',
            classCode: 'TESTOK',
            label: '🏫 Lớp TESTOK',
            shortLabel: 'Lớp TESTOK',
            teacherName: 'Chưa phân công giáo viên',
            type: 'class',
            unreadCount: 0,
          },
        ],
        privateThreads: [],
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useChatRooms(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const rooms = result.current.data || [];
      expect(rooms.some((r) => r.classCode === 'YCT2-04')).toBe(false);
      expect(rooms.some((r) => r.teacherName === 'Cô Lâm Mỹ Linh')).toBe(false);
      const testOkRoom = rooms.find((r) => r.roomId === 'class:TESTOK');
      expect(testOkRoom?.teacherName).toBe('Chưa phân công giáo viên');

      getRoomsSpy.mockRestore();
    });
  });

  describe('7. V3 Embed Mode Detection & API Contract Surface', () => {
    it('detects izTeach Custom Page embed mode and switches to HashRouter cleanly', () => {
      delete (window as unknown as Record<string, unknown>).__KTN_EMBED_MODE__;
      expect(shouldUseHashRouter()).toBe(false);

      (window as unknown as Record<string, unknown>).__KTN_EMBED_MODE__ = true;
      expect(shouldUseHashRouter()).toBe(true);
      delete (window as unknown as Record<string, unknown>).__KTN_EMBED_MODE__;
    });

    it('exposes V3 provisioning, Vietnamese search, 3-way reconciliation, attendance, and official class schedule API methods', () => {
      expect(typeof ktnApi.searchStudents).toBe('function');
      expect(typeof ktnApi.provisionStudent).toBe('function');
      expect(typeof ktnApi.saveTeacher).toBe('function');
      expect(typeof ktnApi.getSyncStatus).toBe('function');
      expect(typeof ktnApi.retrySyncItem).toBe('function');
      expect(typeof ktnApi.getAttendance).toBe('function');
      expect(typeof ktnApi.saveAttendance).toBe('function');
      expect(typeof ktnApi.getVapidPublicKey).toBe('function');
      expect(typeof ktnApi.uploadChatFile).toBe('function');
      expect(typeof ktnApi.saveClass).toBe('function');
      expect(typeof ktnApi.getClassSchedule).toBe('function');
      expect(typeof ktnApi.saveClassSchedule).toBe('function');
      expect(typeof ktnApi.runScheduleReminders).toBe('function');
      expect(typeof ktnApi.getNotificationSettings).toBe('function');
      expect(typeof ktnApi.updateNotificationSettings).toBe('function');
    });

    it('rejects chat files exceeding 100 MB before creating any message', async () => {
      const over100MbBlob = {
        size: 101 * 1024 * 1024,
        type: 'video/mp4',
      } as unknown as Blob;

      await expect(
        ktnApi.uploadChatFile(over100MbBlob, 'video_101mb.mp4')
      ).rejects.toThrow(/100MB/);
    });

    it('encodes and parses video and large file attachments with mimeType and sizeBytes cleanly', () => {
      const encoded = encodeAttachmentUrl({
        kind: 'video',
        url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/lesson_clip.mp4#stale=1',
        name: 'lesson_clip.mp4',
        sizeBytes: 75 * 1024 * 1024,
        mimeType: 'video/mp4',
      });
      const parsed = parseAttachmentFromUrl(encoded);
      expect(parsed?.kind).toBe('video');
      expect(parsed?.url).toBe('https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/lesson_clip.mp4');
      expect(parsed?.name).toBe('lesson_clip.mp4');
      expect(parsed?.sizeLabel).toBe('75.0 MB');
      expect(parsed?.sizeBytes).toBe(75 * 1024 * 1024);
      expect(parsed?.mimeType).toBe('video/mp4');
    });

    it('resolves canonical course titles, replaces generic labels, deduplicates IDs, and disambiguates duplicate titles', () => {
      const catalog = disambiguateCatalogCourses([
        {
          id: '6adadba969897b0002482ca5',
          title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
          shortTitle: 'HSK1 3.0',
          code: 'HSK1-30',
        },
        {
          id: '6adadbd569897b0002482cb0',
          title: 'Khóa Giao Tiếp Thiếu Nhi',
          code: 'GT-A',
        },
        {
          id: '6adadc0069897b0002482cc1',
          title: 'Khóa Giao Tiếp Thiếu Nhi',
          code: 'GT-B',
        },
      ]);

      expect(catalog[1].title).not.toBe(catalog[2].title);
      expect(catalog[1].title).toContain('GT-A');
      expect(catalog[2].title).toContain('GT-B');

      const resolved = resolveStudentOnlineCourses(
        [
          { id: '6adadba969897b0002482ca5', title: 'Khóa học trực tuyến' },
          { id: '6adadba969897b0002482ca5', title: 'Khóa học trực tuyến' },
          { id: '65e7704a9ea90c00080d5195', title: 'Khóa học trực tuyến' },
          { id: '661528ea42af880008944573', title: 'Khóa học trực tuyến' },
        ],
        catalog
      );

      expect(resolved).toHaveLength(3);
      expect(resolved[0].title).toBe('Khóa học Tiêu Chuẩn New HSK 1 (3.0)');
      expect(resolved[1].title).toBe('Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)');
      expect(resolved[2].title).toBe('Chinese For Kids 3 (Khóa học cho bé 7 – 9 tuổi)');
    });

    it('exposes isolated student management API methods (grant, revoke, assignClass, replaceAll, updateProfile)', () => {
      expect(typeof ktnApi.grantStudentCourses).toBe('function');
      expect(typeof ktnApi.revokeStudentCourse).toBe('function');
      expect(typeof ktnApi.assignStudentClass).toBe('function');
      expect(typeof ktnApi.replaceAllStudentCourses).toBe('function');
      expect(typeof ktnApi.updateStudentProfile).toBe('function');
    });
  });

  describe('8. Order Management, In-App Course Purchase & Status Taxonomy', () => {
    it('defines distinct labels for consultation, payment, and account provisioning statuses without collapsing unpaid states', () => {
      expect(CONTACT_STATUS_META.not_called.label).toBe('Chưa gọi');
      expect(CONTACT_STATUS_META.called.label).toBe('Đã gọi tư vấn');
      expect(CONTACT_STATUS_META.no_answer.label).toBe('Không nghe máy');
      expect(CONTACT_STATUS_META.callback_scheduled.label).toBe('Hẹn gọi lại');

      expect(PAYMENT_STATUS_META.unpaid.label).toBe('Chưa thanh toán');
      expect(PAYMENT_STATUS_META.customer_reported.label).toBe('Khách báo đã chuyển khoản');
      expect(PAYMENT_STATUS_META.verifying_tx.label).toBe('Chờ kiểm tra giao dịch');
      expect(PAYMENT_STATUS_META.verified_paid.label).toBe('Đã xác minh tiền thực nhận');
      expect(PAYMENT_STATUS_META.refunded.label).toBe('Hoàn tiền');
      expect(PAYMENT_STATUS_META.amount_mismatch.label).toBe('Thanh toán sai/thiếu');
      expect(PAYMENT_STATUS_META.unpaid.label).not.toBe(PAYMENT_STATUS_META.customer_reported.label);

      expect(ACCOUNT_STATUS_META.no_account.label).toBe('Chưa có tài khoản');
      expect(ACCOUNT_STATUS_META.existing_account.label).toBe('Tài khoản đã tồn tại');
      expect(ACCOUNT_STATUS_META.pending_creation.label).toBe('Chờ tạo tài khoản');
      expect(ACCOUNT_STATUS_META.activated.label).toBe('Đã kích hoạt');
      expect(ACCOUNT_STATUS_META.sync_error.label).toBe('Đồng bộ lỗi');
      expect(ACCOUNT_STATUS_META.awaiting_password_or_handoff.label).toBe(
        'Đang chờ học viên thiết lập mật khẩu / đã bàn giao'
      );
      expect(ACCOUNT_STATUS_META.credentials_handed_off.label).toBe(
        'Đã bàn giao thông tin đăng nhập'
      );
    });

    it('exposes order management & in-app student course purchase API methods', () => {
      expect(typeof ktnApi.getOrders).toBe('function');
      expect(typeof ktnApi.updateOrder).toBe('function');
      expect(typeof ktnApi.approveOrder).toBe('function');
      expect(typeof ktnApi.createStudentOrder).toBe('function');
      expect(typeof ktnApi.getMyOrders).toBe('function');
      expect(typeof ktnApi.reportOrderPayment).toBe('function');
    });
  });

  describe('9. Chat Scroll & Sliding-Window Message Retention (useRoomMessages)', () => {
    it('retains already-loaded older messages when a sliding-window refetch returns newer messages and isolates per-room history', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      useAuthStore.setState({
        user: {
          id: 'student-1',
          email: 'hoangngan@khongtunhi.com',
          name: 'Bé Nguyễn Hoàng Ngân',
          role: 'student',
          roles: ['student'],
          classCode: 'YCT2-04',
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: false });

      let pollCount = 0;
      const getMessagesSpy = vi.spyOn(chatApi, 'getMessages').mockImplementation(async (roomId) => {
        if (roomId === 'class:ROOM-B') {
          return {
            roomId: 'class:ROOM-B',
            pinnedMessage: null,
            messages: [
              {
                id: 'MSG-B-1',
                room_id: 'class:ROOM-B',
                sender_email: 'linh.lam@khongtunhi.com',
                sender_name: 'Cô Lâm Mỹ Linh',
                sender_role: 'teacher',
                content: 'Tin nhắn riêng phòng B',
                created_at: '2026-11-05T10:00:00.000Z',
                status: 'sent',
              },
            ],
            pagination: {
              hasMore: false,
              nextCursor: null,
              oldestCreatedAt: '2026-11-05T10:00:00.000Z',
              limit: 60,
              totalAvailable: 1,
            },
          };
        }
        pollCount += 1;
        if (pollCount === 1) {
          return {
            roomId: 'class:YCT2-04',
            pinnedMessage: null,
            messages: [
              {
                id: 'MSG-61',
                room_id: 'class:YCT2-04',
                sender_email: 'linh.lam@khongtunhi.com',
                sender_name: 'Cô Lâm Mỹ Linh',
                sender_role: 'teacher',
                content: 'Tin nhắn đầu cửa sổ #61',
                created_at: '2026-11-05T09:00:00.000Z',
                status: 'sent',
              },
              {
                id: 'MSG-120',
                room_id: 'class:YCT2-04',
                sender_email: 'hoangngan@khongtunhi.com',
                sender_name: 'Bé Nguyễn Hoàng Ngân',
                sender_role: 'student',
                content: 'Tin nhắn #120',
                created_at: '2026-11-05T09:59:00.000Z',
                status: 'sent',
              },
            ],
            pagination: {
              hasMore: true,
              nextCursor: '2026-11-05T09:00:00.000Z',
              oldestCreatedAt: '2026-11-05T09:00:00.000Z',
              limit: 60,
              totalAvailable: 120,
            },
          };
        }
        // Poll 2 simulates sliding window dropping MSG-61 and adding MSG-121
        return {
          roomId: 'class:YCT2-04',
          pinnedMessage: null,
          messages: [
            {
              id: 'MSG-120',
              room_id: 'class:YCT2-04',
              sender_email: 'hoangngan@khongtunhi.com',
              sender_name: 'Bé Nguyễn Hoàng Ngân',
              sender_role: 'student',
              content: 'Tin nhắn #120',
              created_at: '2026-11-05T09:59:00.000Z',
              status: 'sent',
            },
            {
              id: 'MSG-121',
              room_id: 'class:YCT2-04',
              sender_email: 'linh.lam@khongtunhi.com',
              sender_name: 'Cô Lâm Mỹ Linh',
              sender_role: 'teacher',
              content: 'Tin nhắn mới #121 từ giáo viên',
              created_at: '2026-11-05T10:05:00.000Z',
              status: 'sent',
            },
          ],
          pagination: {
            hasMore: true,
            nextCursor: '2026-11-05T09:59:00.000Z',
            oldestCreatedAt: '2026-11-05T09:59:00.000Z',
            limit: 60,
            totalAvailable: 121,
          },
        };
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result, rerender } = renderHook(
        ({ roomId }) => useRoomMessages(roomId),
        {
          wrapper,
          initialProps: { roomId: 'class:YCT2-04' },
        }
      );

      await waitFor(() => {
        expect(result.current.messages).toHaveLength(2);
      });
      expect(result.current.messages.map((m) => m.id)).toEqual(['MSG-61', 'MSG-120']);

      await result.current.refetch();
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(3);
      });
      // MSG-61 must be retained so top scroll offset never collapses when MSG-121 arrives
      expect(result.current.messages.map((m) => m.id)).toEqual(['MSG-61', 'MSG-120', 'MSG-121']);

      // Switching to ROOM-B must not mix messages from YCT2-04
      rerender({ roomId: 'class:ROOM-B' });
      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['MSG-B-1']);
      });

      getMessagesSpy.mockRestore();
    });

    it('isolates olderByScope across demo/live modes and guards concurrent loadOlderMessages calls', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      useAuthStore.setState({
        user: {
          id: 'student-1',
          email: 'hoangngan@khongtunhi.com',
          name: 'Bé Nguyễn Hoàng Ngân',
          role: 'student',
          roles: ['student'],
          classCode: 'YCT2-04',
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: true, chatDemoScenario: 'demo_rich' });

      const getMessagesSpy = vi.spyOn(chatApi, 'getMessages').mockImplementation(async (_roomId, opts) => {
        if (opts?.before) {
          await new Promise((r) => setTimeout(r, 40));
          return {
            roomId: 'class:YCT2-04',
            pinnedMessage: null,
            messages: [
              {
                id: 'MSG-LIVE-OLDER-1',
                room_id: 'class:YCT2-04',
                sender_email: 'linh.lam@khongtunhi.com',
                sender_name: 'Cô Lâm Mỹ Linh',
                sender_role: 'teacher',
                content: 'Tin nhắn cũ live #1',
                created_at: '2026-11-01T08:00:00.000Z',
                status: 'sent',
              },
            ],
            pagination: {
              hasMore: false,
              nextCursor: null,
              oldestCreatedAt: '2026-11-01T08:00:00.000Z',
              limit: 50,
              totalAvailable: 61,
            },
          };
        }
        return {
          roomId: 'class:YCT2-04',
          pinnedMessage: null,
          messages: [
            {
              id: 'MSG-LIVE-61',
              room_id: 'class:YCT2-04',
              sender_email: 'linh.lam@khongtunhi.com',
              sender_name: 'Cô Lâm Mỹ Linh',
              sender_role: 'teacher',
              content: 'Tin nhắn live #61',
              created_at: '2026-11-05T09:00:00.000Z',
              status: 'sent',
            },
          ],
          pagination: {
            hasMore: true,
            nextCursor: '2026-11-05T09:00:00.000Z',
            oldestCreatedAt: '2026-11-05T09:00:00.000Z',
            limit: 60,
            totalAvailable: 61,
          },
        };
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result, rerender } = renderHook(() => useRoomMessages('class:YCT2-04'), {
        wrapper,
      });

      await waitFor(() => {
        expect(result.current.messages.length).toBeGreaterThan(0);
      });

      // Load older in demo_rich
      await act(async () => {
        await result.current.loadOlderMessages();
      });
      await waitFor(() => {
        expect(result.current.hasMoreOlder).toBe(false);
      });

      // Switch to demo_empty -> must be completely empty (no leak from demo_rich older messages)
      act(() => {
        useUiStore.setState({ isDemoMode: true, chatDemoScenario: 'demo_empty' });
      });
      rerender();
      await waitFor(() => {
        expect(result.current.messages).toHaveLength(0);
      });

      // Switch to Live mode -> must not inherit demo_rich older messages or hasMoreOlder=false
      act(() => {
        useUiStore.setState({ isDemoMode: false });
      });
      rerender();
      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual(['MSG-LIVE-61']);
      });
      expect(result.current.hasMoreOlder).toBe(true);

      // Fire two concurrent loadOlderMessages calls in the same tick -> only 1 before-fetch should execute
      await act(async () => {
        await Promise.all([
          result.current.loadOlderMessages(),
          result.current.loadOlderMessages(),
        ]);
      });
      await waitFor(() => {
        expect(result.current.messages.map((m) => m.id)).toEqual([
          'MSG-LIVE-OLDER-1',
          'MSG-LIVE-61',
        ]);
      });
      const beforeCalls = getMessagesSpy.mock.calls.filter(([, opts]) => Boolean(opts?.before));
      expect(beforeCalls).toHaveLength(1);

      getMessagesSpy.mockRestore();
    });
  });

  describe('10. Compact Chat Inbox, Latest-First Sorting, Empty 1-1 Filtering & Attachment UX (B1–B4)', () => {
    it('sorts active rooms by latest message timestamp descending and keeps empty group rooms below active rooms (ignoring student profile updatedAt on empty rooms)', () => {
      const sorted = sortChatRoomsLatestFirst([
        {
          roomId: 'class:EMPTY-NEW',
          classCode: 'EMPTY-NEW',
          type: 'class',
          label: 'Nhóm Lớp Mới Chưa Có Tin',
          lastMessage: 'Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!',
          updatedAt: '2026-11-10T12:00:00.000Z',
          unreadCount: 0,
        },
        {
          roomId: 'class:YCT1-01',
          classCode: 'YCT1-01',
          type: 'class',
          label: 'Nhóm Lớp YCT1-01',
          lastMessage: 'Tin nhắn lúc 09:00',
          updatedAt: '2026-11-10T09:00:00.000Z',
          unreadCount: 0,
        },
        {
          roomId: 'class:YCT2-04',
          classCode: 'YCT2-04',
          type: 'class',
          label: 'Nhóm Lớp YCT2-04',
          lastMessage: 'Tin nhắn mới nhất lúc 10:30',
          updatedAt: '2026-11-10T10:30:00.000Z',
          unreadCount: 2,
        },
      ]);

      expect(hasRoomRealMessages(sorted[0])).toBe(true);
      expect(hasRoomRealMessages(sorted[1])).toBe(true);
      expect(hasRoomRealMessages(sorted[2])).toBe(false);
      expect(sorted.map((r) => r.roomId)).toEqual([
        'class:YCT2-04',
        'class:YCT1-01',
        'class:EMPTY-NEW',
      ]);
    });

    it('filters out empty 1-1 student threads from useChatRooms while keeping 1-1 threads that have real saved messages and keeping group rooms', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      useAuthStore.setState({
        user: {
          id: 'teacher-1',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          role: 'teacher',
          roles: ['teacher'],
          classCode: 'YCT2-04',
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: false });

      const getRoomsSpy = vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
        role: 'teacher',
        groupRooms: [
          {
            roomId: 'class:EMPTY-GROUP',
            classCode: 'EMPTY-GROUP',
            label: 'Nhóm Lớp Trống',
            type: 'class',
            lastMessage: 'Chưa có tin nhắn. Hãy gửi lời chào đầu tiên!',
            unreadCount: 0,
          },
          {
            roomId: 'class:YCT2-04',
            classCode: 'YCT2-04',
            label: 'Nhóm Lớp YCT2-04',
            type: 'class',
            lastMessage: 'Cô gửi bài ôn tập nhé',
            updatedAt: '2026-11-10T08:00:00.000Z',
            unreadCount: 0,
          },
        ],
        privateThreads: [
          {
            roomId: 'student:empty1@khongtunhi.com',
            studentEmail: 'empty1@khongtunhi.com',
            label: '💬 1-1: Học viên chưa từng nhắn',
            type: 'student',
            lastMessage: 'Nhắn riêng 1-1 với học viên',
            updatedAt: '2026-11-10T11:59:00.000Z',
            unreadCount: 0,
          },
          {
            roomId: 'student:hoangngan@khongtunhi.com',
            studentEmail: 'hoangngan@khongtunhi.com',
            label: '💬 1-1: Bé Nguyễn Hoàng Ngân',
            type: 'student',
            lastMessage: 'Con nộp bài thu âm cho cô ạ',
            updatedAt: '2026-11-10T09:30:00.000Z',
            unreadCount: 1,
          },
        ],
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useChatRooms(), { wrapper });

      await waitFor(() => {
        expect(result.current.isSuccess).toBe(true);
      });

      const rooms = result.current.data || [];
      expect(rooms.map((r) => r.roomId)).toEqual([
        'student:hoangngan@khongtunhi.com',
        'class:YCT2-04',
        'class:EMPTY-GROUP',
      ]);
      expect(rooms.some((r) => r.roomId === 'student:empty1@khongtunhi.com')).toBe(false);

      getRoomsSpy.mockRestore();
    });

    it('suppresses redundant [Đã gửi ảnh: ...] marker in MessageBubble while preserving real user captions and never mutating raw message data', () => {
      const imageOnlyMsg: ChatMessage = {
        id: 'MSG-IMG-1',
        room_id: 'class:YCT2-04',
        sender_email: 'hoangngan@khongtunhi.com',
        sender_name: 'Bé Nguyễn Hoàng Ngân',
        sender_role: 'student',
        content: '[Đã gửi ảnh: IMG_20261110_bai_tap_viet_chu_han_rat_dai_001.png]',
        attachment: {
          kind: 'image',
          url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/sample.png',
          name: 'IMG_20261110_bai_tap_viet_chu_han_rat_dai_001.png',
        },
        created_at: '2026-11-10T10:00:00.000Z',
        status: 'sent',
      };

      expect(getDisplayMessageCaption(imageOnlyMsg)).toBe('');

      const { queryByTestId, getByTestId, unmount } = render(
        <MessageBubble
          message={imageOnlyMsg}
          currentUserEmail="hoangngan@khongtunhi.com"
          canManagePin={false}
          onReply={() => {}}
          onReact={() => {}}
          onPinMessage={() => {}}
        />
      );

      expect(getByTestId('chat-image-attachment')).toBeTruthy();
      expect(getByTestId('chat-image-zoom-btn')).toBeTruthy();
      expect(getByTestId('chat-attachment-download')).toBeTruthy();
      expect(queryByTestId('chat-message-text')).toBeNull();
      // Raw message object must remain untouched
      expect(imageOnlyMsg.content).toBe(
        '[Đã gửi ảnh: IMG_20261110_bai_tap_viet_chu_han_rat_dai_001.png]'
      );
      unmount();

      const captionedImgMsg: ChatMessage = {
        ...imageOnlyMsg,
        id: 'MSG-IMG-2',
        content: 'Cô Linh chấm giúp con trang chữ Hán này với ạ!',
      };
      expect(getDisplayMessageCaption(captionedImgMsg)).toBe(
        'Cô Linh chấm giúp con trang chữ Hán này với ạ!'
      );

      const renderedWithCaption = render(
        <MessageBubble
          message={captionedImgMsg}
          currentUserEmail="hoangngan@khongtunhi.com"
          canManagePin={false}
          onReply={() => {}}
          onReact={() => {}}
          onPinMessage={() => {}}
        />
      );
      expect(renderedWithCaption.getByTestId('chat-message-text').textContent).toBe(
        'Cô Linh chấm giúp con trang chữ Hán này với ạ!'
      );
      expect(renderedWithCaption.getByTestId('chat-image-attachment')).toBeTruthy();
      renderedWithCaption.unmount();
    });

    it('truncates long filenames cleanly while preserving extensions and groups consecutive messages from the same sender', () => {
      const truncated = truncateFileName(
        'Bai_Tap_Luyen_Viet_Chu_Han_Buoi_18_Nguyen_Hoang_Ngan_2026.pdf',
        26
      );
      expect(truncated.length).toBeLessThanOrEqual(26);
      expect(truncated.endsWith('.pdf')).toBe(true);
      expect(truncated).toContain('…');

      const msg1: ChatMessage = {
        id: 'M1',
        room_id: 'class:YCT2-04',
        sender_email: 'linh.lam@khongtunhi.com',
        sender_name: 'Cô Lâm Mỹ Linh',
        sender_role: 'teacher',
        content: 'Các con mở sách trang 18 nhé.',
        created_at: '2026-11-10T10:00:00.000Z',
        status: 'sent',
      };
      const msg2: ChatMessage = {
        ...msg1,
        id: 'M2',
        content: 'Sau đó nghe file MP3 số 2.',
        created_at: '2026-11-10T10:02:00.000Z',
      };
      const msg3Later: ChatMessage = {
        ...msg1,
        id: 'M3',
        content: 'Tin nhắn sau 15 phút.',
        created_at: '2026-11-10T10:15:00.000Z',
      };

      expect(shouldGroupWithPreviousMessage(null, msg1)).toBe(false);
      expect(shouldGroupWithPreviousMessage(msg1, msg2)).toBe(true);
      expect(shouldGroupWithPreviousMessage(msg2, msg3Later)).toBe(false);

      const firstRender = render(
        <MessageBubble
          message={msg1}
          currentUserEmail="hoangngan@khongtunhi.com"
          canManagePin={false}
          isGroupedWithPrev={false}
          onReply={() => {}}
          onReact={() => {}}
          onPinMessage={() => {}}
        />
      );
      expect(firstRender.queryByTestId('chat-message-sender-header')).not.toBeNull();
      firstRender.unmount();

      const groupedRender = render(
        <MessageBubble
          message={msg2}
          currentUserEmail="hoangngan@khongtunhi.com"
          canManagePin={false}
          isGroupedWithPrev={true}
          onReply={() => {}}
          onReact={() => {}}
          onPinMessage={() => {}}
        />
      );
      expect(groupedRender.queryByTestId('chat-message-sender-header')).toBeNull();
      groupedRender.unmount();
    });

    it('renders compact ConversationList with Tin nhắn header, Nhắn mới button, 4 filter tabs, and promotes ephemeral 1-1 room to top of Inbox on first message', async () => {
      const onOpenNew = vi.fn();
      const onSelect = vi.fn();
      const convRender = render(
        <ConversationList
          rooms={[
            {
              roomId: 'class:YCT2-04',
              classCode: 'YCT2-04',
              type: 'class',
              label: 'Nhóm Lớp YCT2-04 — Ca tối T3 & T6',
              lastMessage: 'Cô gửi phiếu bài tập nhé',
              updatedAt: '2026-11-10T10:00:00.000Z',
              unreadCount: 1,
            },
            {
              roomId: 'class:EMPTY-01',
              classCode: 'EMPTY-01',
              type: 'class',
              label: 'Nhóm Lớp Mới Khai Giảng',
              lastMessage: '',
              unreadCount: 0,
            },
          ]}
          activeRoomId="class:YCT2-04"
          isLoading={false}
          onSelectRoom={onSelect}
          onOpenNewMessage={onOpenNew}
        />
      );

      expect(convRender.getByText('Tin nhắn')).toBeTruthy();
      expect(convRender.getByTestId('chat-new-message-btn')).toBeTruthy();
      expect(convRender.getByTestId('chat-filter-tab-all').textContent).toContain('Gần đây');
      expect(convRender.getByTestId('chat-filter-tab-unread').textContent).toContain('Chưa đọc');
      expect(convRender.getByTestId('chat-filter-tab-groups').textContent).toContain('Nhóm lớp');
      expect(convRender.getByTestId('chat-filter-tab-support').textContent).toContain('1-1');
      expect(convRender.getByTestId('chat-empty-groups-section').textContent).toContain(
        'Nhóm lớp chưa có tin nhắn (1)'
      );
      convRender.unmount();

      // Verify useSendMessage promotes an ephemeral 1-1 room to the top of ['chat-rooms'] cache on first sent message
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      useAuthStore.setState({
        user: {
          id: 'teacher-1',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          role: 'teacher',
          roles: ['teacher'],
          classCode: 'YCT2-04',
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: false, isOfflineSimulated: false });

      const roomsKey = ['chat-rooms', 'linh.lam@khongtunhi.com', false, 'live_real'];
      queryClient.setQueryData(roomsKey, [
        {
          roomId: 'class:YCT2-04',
          classCode: 'YCT2-04',
          type: 'class',
          label: 'Nhóm Lớp YCT2-04',
          lastMessage: 'Tin nhắn cũ trong lớp',
          updatedAt: '2026-11-10T08:00:00.000Z',
          unreadCount: 0,
          hasMessages: true,
        },
      ]);

      const sendSpy = vi.spyOn(chatApi, 'sendMessage').mockResolvedValue({
        clientMessageId: 'cmsg-ephemeral-1',
        serverMessageId: 'SRV-EPHEMERAL-1',
        message: {
          id: 'SRV-EPHEMERAL-1',
          clientMessageId: 'cmsg-ephemeral-1',
          room_id: 'student:minhkhang@khongtunhi.com',
          sender_email: 'linh.lam@khongtunhi.com',
          sender_name: 'Cô Lâm Mỹ Linh',
          sender_role: 'teacher',
          content: 'Cô chào mẹ bé Minh Khang ạ!',
          created_at: '2026-11-10T11:30:00.000Z',
          status: 'sent',
        },
      });

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );
      const { result } = renderHook(() => useSendMessage(), { wrapper });

      await act(async () => {
        await result.current.sendMessage({
          roomId: 'student:minhkhang@khongtunhi.com',
          classCode: 'YCT2-04',
          content: 'Cô chào mẹ bé Minh Khang ạ!',
          roomMeta: {
            roomId: 'student:minhkhang@khongtunhi.com',
            type: 'student',
            studentEmail: 'minhkhang@khongtunhi.com',
            studentName: 'Bé Trần Minh Khang',
            label: '1-1: Bé Trần Minh Khang (YCT2-04)',
          },
        });
      });

      const updatedRooms = queryClient.getQueryData<Array<{ roomId: string; lastMessage?: string; isEphemeral?: boolean }>>(roomsKey) || [];
      expect(updatedRooms[0]?.roomId).toBe('student:minhkhang@khongtunhi.com');
      expect(updatedRooms[0]?.lastMessage).toBe('Cô chào mẹ bé Minh Khang ạ!');
      expect(updatedRooms[0]?.isEphemeral).toBe(false);
      expect(updatedRooms[1]?.roomId).toBe('class:YCT2-04');

      sendSpy.mockRestore();
    });

    it('handles bracketed filenames in attachment placeholders, quoted reply image previews, and ZWJ emoji room labels', () => {
      expect(isRedundantAttachmentPlaceholder('[Đã gửi ảnh: IMG_2026_[1].png]', true)).toBe(true);
      expect(isRedundantAttachmentPlaceholder('[Đã đính kèm tệp: De_thi_[v2].pdf]', true)).toBe(true);
      expect(isRedundantAttachmentPlaceholder('Ảnh bài tập [1] con nộp ạ', true)).toBe(false);
      expect(isRedundantAttachmentPlaceholder('[Đã gửi ảnh: IMG_2026_[1].png]', false)).toBe(false);

      const bracketImgMsg: ChatMessage = {
        id: 'MSG-BRACKET-1',
        room_id: 'class:YCT2-04',
        sender_email: 'hoangngan@khongtunhi.com',
        sender_name: 'Bé Nguyễn Hoàng Ngân',
        sender_role: 'student',
        content: '[Đã gửi ảnh: IMG_2026_[1].png]',
        attachment: {
          kind: 'image',
          url: 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/sample.png',
          name: 'IMG_2026_[1].png',
        },
        created_at: '2026-11-10T10:00:00.000Z',
        status: 'sent',
      };
      expect(getDisplayMessageCaption(bracketImgMsg)).toBe('');

      const quotedReplyImagePreview = formatRoomPreviewText({
        roomId: 'class:YCT2-04',
        type: 'class',
        label: 'Nhóm Lớp YCT2-04',
        lastMessage: '[Trả lời Cô Linh: "Các con nộp bài nhé"]\n[Đã gửi ảnh: bai_tap_viet_chu_han_[1].png]',
        unreadCount: 0,
        hasMessages: true,
      });
      expect(quotedReplyImagePreview).toContain('↩ 📷 Hình ảnh');
      expect(quotedReplyImagePreview).not.toContain('[Đã gửi ảnh:');

      expect(
        formatCompactRoomTitle({
          roomId: 'student:hoangngan@khongtunhi.com',
          type: 'student',
          label: '👩‍🏫 Bé Nguyễn Hoàng Ngân',
          unreadCount: 0,
        })
      ).toBe('Bé Nguyễn Hoàng Ngân');
      expect(
        formatCompactRoomTitle({
          roomId: 'student:hoangngan@khongtunhi.com',
          type: 'student',
          label: '👩‍🏫 Nhắn riêng Cô',
          unreadCount: 0,
        })
      ).toBe('Nhắn riêng Cô');
    });

    it('prevents cross-room timestamp pollution in Demo Mode and prevents unacknowledged sending messages from prematurely promoting rooms', async () => {
      const queryClient = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      useAuthStore.setState({
        user: {
          id: 'teacher-1',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          role: 'teacher',
          roles: ['teacher'],
          classCode: 'YCT2-04',
          hasLiveClass: true,
          hasOnlineCourses: true,
          onlineCourses: [],
        },
      });
      useUiStore.setState({ isDemoMode: true, chatDemoScenario: 'demo_rich' });

      const demoRoomsKey = ['chat-rooms', 'linh.lam@khongtunhi.com', true, 'demo_rich'];
      queryClient.setQueryData(demoRoomsKey, [
        {
          roomId: 'class:YCT2-04',
          classCode: 'YCT2-04',
          type: 'class',
          label: 'Nhóm Lớp YCT2-04',
          lastMessage: 'Tin nhắn của lớp YCT2-04',
          updatedAt: '2026-11-10T09:00:00.000Z',
          unreadCount: 0,
          hasMessages: true,
        },
        {
          roomId: 'student:hoangngan@khongtunhi.com',
          studentEmail: 'hoangngan@khongtunhi.com',
          type: 'student',
          label: '1-1: Bé Nguyễn Hoàng Ngân',
          lastMessage: 'Tin nhắn riêng 1-1 ban đầu',
          updatedAt: '2026-11-10T08:00:00.000Z',
          unreadCount: 0,
          hasMessages: true,
        },
      ]);

      const wrapper = ({ children }: { children: React.ReactNode }) => (
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      );

      // Viewing student:hoangngan@khongtunhi.com in demo_rich returns fallback DEMO_RICH_MESSAGES (which have room_id: class:YCT2-04)
      const { unmount } = renderHook(
        () => useRoomMessages('student:hoangngan@khongtunhi.com'),
        { wrapper }
      );

      await waitFor(() => {
        const rooms = queryClient.getQueryData<Array<{ roomId: string; lastMessage?: string }>>(demoRoomsKey) || [];
        const studentRoom = rooms.find((r) => r.roomId === 'student:hoangngan@khongtunhi.com');
        expect(studentRoom?.lastMessage).toBe('Tin nhắn riêng 1-1 ban đầu');
      });
      unmount();

      // Now test Live mode with an unacknowledged optimistic 'sending' message in an ephemeral room
      useUiStore.setState({ isDemoMode: false });
      const liveRoomsKey = ['chat-rooms', 'linh.lam@khongtunhi.com', false, 'live_real'];
      queryClient.setQueryData(liveRoomsKey, [
        {
          roomId: 'class:YCT2-04',
          classCode: 'YCT2-04',
          type: 'class',
          label: 'Nhóm Lớp YCT2-04',
          lastMessage: 'Tin nhắn cũ',
          updatedAt: '2026-11-10T09:00:00.000Z',
          unreadCount: 0,
          hasMessages: true,
        },
        {
          roomId: 'student:pending@khongtunhi.com',
          studentEmail: 'pending@khongtunhi.com',
          type: 'student',
          label: '1-1: Học viên đang gõ',
          lastMessage: 'Phòng tạm thời — Gửi tin nhắn đầu tiên để bắt đầu hội thoại',
          unreadCount: 0,
          hasMessages: false,
          isEphemeral: true,
        },
      ]);

      const getMessagesSpy = vi.spyOn(chatApi, 'getMessages').mockResolvedValue({
        roomId: 'student:pending@khongtunhi.com',
        pinnedMessage: null,
        messages: [
          {
            id: 'OPT-SENDING-1',
            room_id: 'student:pending@khongtunhi.com',
            sender_email: 'linh.lam@khongtunhi.com',
            sender_name: 'Cô Lâm Mỹ Linh',
            sender_role: 'teacher',
            content: 'Tin nhắn đang gửi...',
            created_at: '2026-11-10T12:00:00.000Z',
            status: 'sending',
          },
        ],
        pagination: {
          hasMore: false,
          nextCursor: null,
          oldestCreatedAt: '2026-11-10T12:00:00.000Z',
          limit: 60,
          totalAvailable: 1,
        },
      });

      const liveHook = renderHook(
        () => useRoomMessages('student:pending@khongtunhi.com'),
        { wrapper }
      );
      await waitFor(() => {
        expect(liveHook.result.current.messages).toHaveLength(1);
      });

      const liveRoomsAfter = queryClient.getQueryData<Array<{ roomId: string; isEphemeral?: boolean; hasMessages?: boolean }>>(liveRoomsKey) || [];
      const pendingRoom = liveRoomsAfter.find((r) => r.roomId === 'student:pending@khongtunhi.com');
      expect(pendingRoom?.isEphemeral).toBe(true);
      expect(pendingRoom?.hasMessages).toBe(false);

      liveHook.unmount();
      getMessagesSpy.mockRestore();
    });
  });
});





