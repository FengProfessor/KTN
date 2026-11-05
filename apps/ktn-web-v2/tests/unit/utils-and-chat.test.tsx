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
    });
  });
});

