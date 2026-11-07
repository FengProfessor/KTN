import { describe, it, expect, beforeEach } from 'vitest';
import {
  inspectDlpClient,
  generateClientMessageId,
  getInitials,
  formatFileSize,
  resolveNotificationLink,
} from '../../src/lib/utils';
import {
  encodeAttachmentUrl,
  parseAttachmentFromUrl,
  normalizeServerMessage,
} from '../../src/features/chat/services/chatApi';
import { useUiStore } from '../../src/stores/useUiStore';
import { useAuthStore, DEMO_USERS } from '../../src/stores/useAuthStore';
import { roleNavigation } from '../../src/app/navigation/navigationConfig';
import {
  formatShortPersonName,
  resolveHeaderTitle,
} from '../../src/app/navigation/roleRoutes';
import { shouldUseHashRouter } from '../../src/app/providers/AppProviders';
import { ktnApi } from '../../src/services/api/ktnApiClient';
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
  });
});




