import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import {
  ktnApi,
  saveStoredSession,
  setConsultationStaffToken,
  getConsultationStaffToken,
} from '@/services/api/ktnApiClient';
import { chatApi } from '@/features/chat/services/chatApi';
import { AppRouter } from '@/app/router/AppRouter';
import { getRoleNavigation } from '@/app/navigation/navigationConfig';
import { detectDlpViolation, resolveNotificationLink, sanitizePostLoginRedirect } from '@/lib/utils';
import { ConsultationCrmWorkspace } from '@/features/consultations/ConsultationCrmWorkspace';
import { CreateConsultationOrderModal } from '@/features/consultations/components/ConsultationActionModals';
import { WebChatbotWidget } from '@/features/consultations/WebChatbotWidget';
import {
  detectAdultWorking11Context,
  detectConsultationExamplePii,
  escapeCsvCell,
  serializeReportToCsv,
  validateVnPhone,
} from '@/features/consultations/utils/consultationHelpers';
import { AdminWorkspace } from '@/features/admin/components/AdminWorkspace';
import { OrderDetailDrawer } from '@/features/admin/components/OrderDetailDrawer';
import { SepayReconciliationPanel } from '@/features/admin/components/SepayReconciliationPanel';
import { StudentDetailDrawer } from '@/features/admin/components/StudentDetailDrawer';
import type {
  ConsultationAdvisor,
  ConsultationFlag,
  ConsultationInboxItem,
  ConsultationMessage,
  KtnCourse,
  KtnOrder,
  KtnStudentRecord,
  SepayReconciliationLog,
} from '@/types/ktn.types';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

const SAMPLE_COURSES: KtnCourse[] = [
  {
    id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortTitle: 'HSK1 3.0',
    badge: 'HSK1',
    lessonsCount: 30,
    price: 963000,
    oldPrice: 1200000,
  },
];

const SAMPLE_ADVISORS: ConsultationAdvisor[] = [
  { email: 'advisor1@khongtunhi.com', name: 'Tư vấn viên Minh Anh', active: true, role: 'advisor' },
  { email: 'quanly@khongtunhi.com', name: 'Ban Quản Lý KTN', active: true, role: 'manager' },
];

const ZALO_THREAD: ConsultationInboxItem = {
  id: 'thread-zalo-01',
  channel: 'zalo_oa',
  owner_email: 'advisor1@khongtunhi.com',
  status: 'open',
  created_at: '2026-11-18T01:00:00Z',
  updated_at: '2026-11-18T02:00:00Z',
  reply_pending: true,
  has_paid_pending: false,
  customer_name: 'Anh Hoàng Minh',
  customer_phone: '0909123456',
  zalo_user_id: 'zalo-u-12345',
  source_tag: 'ad_963k',
  lead_meta: { ad_source: 'ad_963k', target_learner: 'Người đi làm', goal: 'Giao tiếp' },
  student_code: 'KTN-2026-089',
};

const WAITING_WEB_THREAD: ConsultationInboxItem = {
  id: 'thread-web-02',
  channel: 'web',
  owner_email: null,
  status: 'waiting',
  created_at: '2026-11-18T01:30:00Z',
  updated_at: '2026-11-18T02:10:00Z',
  reply_pending: true,
  has_paid_pending: false,
  customer_name: 'Chị Thu Hà',
  customer_phone: '0912345678',
  source_tag: 'web_chat',
};

const ZALO_MESSAGES: ConsultationMessage[] = [
  {
    id: 'msg-1',
    sender: 'customer',
    body: 'Chào KTN, mình thấy quảng cáo gói 963k cho người đi làm 1 kèm 1.',
    created_at: '2026-11-18T01:00:00Z',
  },
  {
    id: 'msg-2',
    sender: 'bot',
    bot_mode: 'scripted',
    body: '[Kịch bản] Chào anh/chị, bên em sẽ kết nối tư vấn viên hỗ trợ lộ trình 1:1 ngay.',
    created_at: '2026-11-18T01:00:05Z',
  },
  {
    id: 'msg-3',
    sender: 'note',
    actor_email: 'advisor1@khongtunhi.com',
    body: 'Khách làm logistic, cần lịch tối.',
    created_at: '2026-11-18T01:05:00Z',
  },
];

const SAMPLE_FLAG: ConsultationFlag = {
  message_id: 'msg-flag-1',
  consultation_id: 'thread-zalo-01',
  category: 'price',
  reason: 'Bot nhắc học phí chưa chuẩn hóa',
  excerpt: 'Học phí khoảng 900k...',
  status: 'pending',
  created_at: '2026-11-18T01:10:00Z',
};

const SAMPLE_ZALO_ORDER: KtnOrder = {
  order_id: 'ORD-261199',
  student_name: 'Anh Hoàng Minh',
  parent_name: 'Anh Hoàng Minh',
  student_email: 'hoangminh@example.com',
  phone: '0909123456',
  course_id: '6adadba969897b0002482ca5',
  course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
  amount: 963000,
  payment_method: 'VietQR',
  payment_status: 'paid',
  approval_status: 'pending',
  source: 'zalo_oa',
  assigned_advisor: 'advisor1@khongtunhi.com',
  consultation_id: 'thread-zalo-01',
  provisioning_status: 'partial_failure',
  payment_tx_ref: 'sepay:123456',
  created_at: '2026-11-18T02:00:00Z',
  paymentInfo: {
    bankId: 'MB',
    bankName: 'MB Bank',
    accountNo: '0909123456',
    accountName: 'HOC VIEN KHONG TU NHI',
    amount: 963000,
    transferContent: 'KTN ORD-261199',
    qrUrl: 'https://img.vietqr.io/image/MB-0909123456-compact2.png?amount=963000&addInfo=KTN%20ORD-261199',
  },
};

const SAMPLE_STUDENT: KtnStudentRecord = {
  code: 'KTN-2026-089',
  email: 'hoangngan@khongtunhi.com',
  name: 'Bé Nguyễn Hoàng Ngân',
  parent_name: 'Chị Lan',
  phone: '0901234567',
  class_code: 'YCT2-04',
  has_live_class: true,
  has_online_courses: true,
  online_courses: [],
  studentCase: 'both',
  lead_source: 'zalo_oa',
  zalo_user_id: 'zalo-u-12345',
  consultation_id: 'thread-zalo-01',
  assigned_advisor: 'advisor1@khongtunhi.com',
};

const SAMPLE_RECON_LOGS: SepayReconciliationLog[] = [
  {
    id: 'rec-1',
    transaction_id: 'TX-MISMATCH-1',
    order_id: 'ORD-261199',
    claimed_order_code: 'ORD-261199',
    consultation_id: 'thread-zalo-01',
    kind: 'mismatch',
    amount: 900000,
    expected_amount: 963000,
    transfer_content: 'KTN ORD-261199',
    resolution_status: 'open',
    created_at: '2026-11-18T02:05:00Z',
    updated_at: '2026-11-18T02:05:00Z',
  },
  {
    id: 'rec-2',
    transaction_id: 'TX-NEEDS-REV-2',
    order_id: 'ORD-261199',
    claimed_order_code: 'ORD-261199',
    consultation_id: 'thread-zalo-01',
    kind: 'needs_review',
    amount: 963000,
    expected_amount: 963000,
    transfer_content: 'KTN ORD-261199',
    resolution_status: 'open',
    created_at: '2026-11-18T02:06:00Z',
    updated_at: '2026-11-18T02:06:00Z',
  },
  {
    id: 'rec-3',
    transaction_id: 'TX-UNMATCHED-3',
    order_id: null,
    claimed_order_code: null,
    consultation_id: null,
    kind: 'unmatched',
    amount: 500000,
    expected_amount: null,
    transfer_content: 'HOC PHI KHONG GHI MA',
    resolution_status: 'open',
    created_at: '2026-11-18T02:07:00Z',
    updated_at: '2026-11-18T02:07:00Z',
  },
];

describe('Milestone M4 — KTN Zalo OA CRM, Hybrid Chatbot UI & SePay Reconciliation', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    useUiStore.setState({ isDemoMode: false, lang: 'vi' });
    useAuthStore.setState({
      user: DEMO_USERS.admin,
      authUser: DEMO_USERS.admin,
      isLoading: false,
      isRestoring: false,
      error: null,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Advisor RBAC, Navigation & Routing Invariants', () => {
    it('defines DEMO_USERS.advisor and allows advisor on /admin/consultations & /consultations while blocking /admin & /teacher', async () => {
      expect(DEMO_USERS.advisor).toBeDefined();
      expect(DEMO_USERS.advisor.role).toBe('advisor');

      expect(getRoleNavigation('student').mobile.map((i) => i.label)).toEqual([
        'Trang chủ',
        'Học',
        'Lớp',
        'Tin nhắn',
        'Thông báo',
      ]);
      expect(getRoleNavigation('teacher').mobile.map((i) => i.label)).toEqual([
        'Tổng quan',
        'Lớp',
        'Chấm bài',
        'Tin nhắn',
        'Thông báo',
      ]);
      expect(getRoleNavigation('admin').mobile.map((i) => i.label)).toEqual([
        'Tổng quan',
        'Học viên',
        'Lớp',
        'Đơn hàng',
        'Thêm',
      ]);

      expect(resolveNotificationLink({ actionUrl: '/admin/orders' }, 'advisor')).toBe(
        '/admin/consultations'
      );
      expect(sanitizePostLoginRedirect('/admin/orders', 'advisor')).toBe('/admin/consultations');
      expect(sanitizePostLoginRedirect('/admin/consultations', 'advisor')).toBe(
        '/admin/consultations'
      );

      const advisorSession = { ...DEMO_USERS.advisor, token: 'advisor-test-token' };
      saveStoredSession(advisorSession, 'advisor-test-token');
      useAuthStore.setState({
        user: advisorSession,
        authUser: advisorSession,
        isLoading: false,
        isRestoring: false,
      });

      vi.spyOn(ktnApi, 'verifySession').mockResolvedValue(advisorSession);
      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: DEMO_USERS.advisor.email,
          name: DEMO_USERS.advisor.name,
          admin: false,
          role: 'advisor',
        },
      });
      vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
        conversations: [ZALO_THREAD],
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
        notifications: [],
        readIds: [],
        unreadCount: 0,
        totalCount: 0,
      });
      vi.spyOn(ktnApi, 'getNotificationsSummary').mockResolvedValue({
        unreadCount: 0,
        totalCount: 0,
        latestAt: null,
      });
      vi.spyOn(ktnApi, 'getLearningProgress').mockResolvedValue({
        ok: true,
        completedLessons: [],
      });
      vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
        role: 'advisor',
        groupRooms: [],
      });

      const qc = makeQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/']}>
            <AppRouter />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('consultation-crm-workspace')).toBeInTheDocument();
        },
        { timeout: 4000 }
      );
      unmount();

      // Advisor visiting /admin/orders must be blocked by role-forbidden-guard
      const qc2 = makeQueryClient();
      render(
        <QueryClientProvider client={qc2}>
          <MemoryRouter initialEntries={['/admin/orders']}>
            <AppRouter />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(
        () => {
          expect(screen.getByTestId('role-forbidden-guard')).toBeInTheDocument();
        },
        { timeout: 4000 }
      );
    });
  });

  describe('2. Helpers: PII Detection, Adult 1:1 Script Detection & CSV Formula Escaping', () => {
    it('detects PII in consultation examples, escapes CSV formulas with UTF-8 BOM, and keeps classroom DLP intact', () => {
      expect(detectConsultationExamplePii('Liên hệ email test@khongtunhi.com').hasPii).toBe(true);
      expect(detectConsultationExamplePii('Gọi số 0901234567 nhé').hasPii).toBe(true);
      expect(detectConsultationExamplePii('Xem tại https://evil.example/pay').hasPii).toBe(true);
      expect(detectConsultationExamplePii('Học phí chuẩn khóa HSK1 là 963.000đ.').hasPii).toBe(false);

      expect(escapeCsvCell('=CMD("calc")')).toBe('"\'=CMD(""calc"")"');
      expect(escapeCsvCell('+1234')).toBe("'+1234");
      expect(escapeCsvCell('-1234')).toBe("'-1234");
      expect(escapeCsvCell('@SUM(A1)')).toBe("'@SUM(A1)");

      const csv = serializeReportToCsv([
        ['Name', 'Formula'],
        ['Minh Anh', '=1+1'],
      ]);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv).toContain("'=1+1");

      // Adult 1:1 vs Child 1:1 exclusion
      const adultInfo = detectAdultWorking11Context('Gói 963k cho người đi làm 1 kèm 1');
      expect(adultInfo.matched).toBe(true);
      expect(adultInfo.adPackage).toBe('963k');

      const childExcluded = detectAdultWorking11Context('Con chị 8 tuổi cần lớp 1 kèm 1.');
      expect(childExcluded.matched).toBe(false);
      expect(childExcluded.isChildExcluded).toBe(true);

      // Classroom DLP must remain intact
      expect(detectDlpViolation('Gọi số 0901234567 nhé').blocked).toBe(true);
      expect(detectDlpViolation('zalo.me/0901234567').blocked).toBe(true);
    });
  });

  describe('3. Native ConsultationCrmWorkspace (Zalo OA, Claim, Notes, Adult Script, Order/Link, Flags, Guidance, CSV)', () => {
    it('filters Zalo OA threads, enforces advisor claim, separates internal notes from replies, inserts Adult 1:1 step, creates VietQR order, and links student_code', async () => {
      useAuthStore.setState({ user: DEMO_USERS.advisor, authUser: DEMO_USERS.advisor });

      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: 'advisor1@khongtunhi.com',
          name: 'Tư vấn viên Minh Anh',
          admin: false,
          role: 'advisor',
        },
      });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      const inboxSpy = vi
        .spyOn(ktnApi, 'getConsultationInbox')
        .mockResolvedValue({
          conversations: [ZALO_THREAD, WAITING_WEB_THREAD],
          hasMore: false,
        });
      const threadSpy = vi.spyOn(ktnApi, 'getConsultationThread').mockResolvedValue({
        conversation: ZALO_THREAD,
        messages: ZALO_MESSAGES,
        hasEarlier: false,
        events: [],
        flags: [SAMPLE_FLAG],
        orders: [],
      });
      const operateSpy = vi
        .spyOn(ktnApi, 'operateConsultationThread')
        .mockResolvedValue({ updated: true });
      const createOrderSpy = vi
        .spyOn(ktnApi, 'createConsultationOrder')
        .mockResolvedValue({
          ok: true,
          id: 'ORD-261200',
          order_id: 'ORD-261200',
          amount: 963000,
          payment: SAMPLE_ZALO_ORDER.paymentInfo!,
        });
      const linkStudentSpy = vi
        .spyOn(ktnApi, 'linkConsultationStudent')
        .mockResolvedValue({
          ok: true,
          student_code: 'KTN-2026-089',
        });

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('crm-inbox-item-thread-zalo-01')).toBeInTheDocument();
        expect(screen.getByTestId('crm-inbox-channel-thread-zalo-01')).toHaveTextContent('Zalo OA');
      });

      // Advisor cannot read waiting unassigned thread without claiming; clicking Nhận ca claims it
      fireEvent.click(screen.getByTestId('crm-claim-btn-thread-web-02'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith('thread-web-02', 'claim');
      });

      // Filter by Zalo OA
      fireEvent.click(screen.getByTestId('crm-channel-filter-zalo_oa'));
      await waitFor(() => {
        expect(inboxSpy).toHaveBeenCalledWith(expect.objectContaining({ channel: 'zalo_oa' }));
        expect(screen.getByTestId('crm-inbox-item-thread-zalo-01')).toBeInTheDocument();
      });

      // Open Zalo thread -> renders internal note banner, Adult 1:1 4-step helper, source_tag
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-zalo-01'));
      await waitFor(() => {
        expect(threadSpy).toHaveBeenCalledWith('thread-zalo-01', undefined);
        expect(screen.getByTestId('crm-adult-script-helper')).toBeInTheDocument();
        expect(screen.getByText(/Ghi chú nội bộ — Khách không thấy/)).toBeInTheDocument();
      });

      // Insert Adult 1:1 step 1 and send public reply
      fireEvent.click(screen.getByTestId('crm-adult-step-insert-1'));
      expect((screen.getByTestId('crm-composer-textarea') as HTMLTextAreaElement).value).toContain(
        'mục tiêu công việc'
      );
      fireEvent.click(screen.getByTestId('crm-send-btn'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith(
          'thread-zalo-01',
          'reply',
          expect.objectContaining({ body: expect.stringContaining('mục tiêu công việc') })
        );
      });

      // Switch to internal note and submit
      fireEvent.click(screen.getByTestId('crm-mode-note-btn'));
      fireEvent.change(screen.getByTestId('crm-composer-textarea'), {
        target: { value: 'Lưu ý nội bộ cho ca này' },
      });
      fireEvent.click(screen.getByTestId('crm-send-btn'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith('thread-zalo-01', 'note', {
          body: 'Lưu ý nội bộ cho ca này',
        });
      });

      // 1-click Create Order & VietQR
      fireEvent.click(screen.getByTestId('crm-open-create-order-btn'));
      fireEvent.click(screen.getByTestId('crm-create-order-submit-btn'));
      await waitFor(() => {
        expect(createOrderSpy).toHaveBeenCalledWith(
          'thread-zalo-01',
          expect.objectContaining({
            courseId: '6adadba969897b0002482ca5',
            name: 'Anh Hoàng Minh',
            phone: '0909123456',
          })
        );
        expect(screen.getByTestId('crm-created-order-result')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-created-order-send-thread-btn'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith(
          'thread-zalo-01',
          'reply',
          expect.objectContaining({ body: expect.stringContaining('ORD-261200') })
        );
      });

      // Link Student by student_code
      fireEvent.click(screen.getByTestId('crm-open-link-student-btn'));
      fireEvent.change(screen.getByTestId('crm-link-student-code-input'), {
        target: { value: 'KTN-2026-089' },
      });
      fireEvent.click(screen.getByTestId('crm-link-student-submit-btn'));
      await waitFor(() => {
        expect(linkStudentSpy).toHaveBeenCalledWith('thread-zalo-01', 'KTN-2026-089');
      });
    });

    it('supports Manager AI Flags, Guidance PII check + 72+ Draft + Kill-switches, and CSV Report export', async () => {
      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: 'quanly@khongtunhi.com',
          name: 'Ban Quản Lý KTN',
          admin: true,
          role: 'manager',
        },
      });
      vi.spyOn(ktnApi, 'getConsultationAdvisors').mockResolvedValue({ advisors: SAMPLE_ADVISORS });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
        conversations: [ZALO_THREAD],
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getConsultationThread').mockResolvedValue({
        conversation: ZALO_THREAD,
        messages: ZALO_MESSAGES,
        hasEarlier: false,
        events: [],
        flags: [SAMPLE_FLAG],
        orders: [],
      });
      const reviewSpy = vi
        .spyOn(ktnApi, 'reviewConsultationFlag')
        .mockResolvedValue({ updated: true });
      vi.spyOn(ktnApi, 'getConsultationGuidance').mockResolvedValue({
        config: {
          course_ids: ['6adadba969897b0002482ca5'],
          duration_presets: { '6adadba969897b0002482ca5': '1m' },
          policy: 'Chính sách KTN',
          examples: [{ question: 'Học phí?', answer: 'Học phí niêm yết.', hints: [] }],
          bot_enabled: true,
          checkout_enabled: true,
        },
      });
      vi.spyOn(ktnApi, 'getConsultationGuidanceDraft').mockResolvedValue({
        policy: 'Chính sách 72 ca',
        examples: [{ question: 'Mẫu 1', answer: 'Trả lời chuẩn 1', hints: ['a'] }],
        maxExamples: 120,
      });
      const saveGuidanceSpy = vi
        .spyOn(ktnApi, 'saveConsultationGuidance')
        .mockResolvedValue({
          config: {
            course_ids: ['6adadba969897b0002482ca5'],
            duration_presets: { '6adadba969897b0002482ca5': '1m' },
            policy: 'Chính sách 72 ca',
            examples: [{ question: 'Mẫu 1', answer: 'Trả lời chuẩn 1', hints: ['a'] }],
            bot_enabled: false,
            checkout_enabled: false,
          },
        });
      vi.spyOn(ktnApi, 'getConsultationReport').mockResolvedValue({
        start: '2026-11-10T00:00:00Z',
        end: '2026-11-18T23:59:59Z',
        responseMinutes: 3.2,
        conversations: [ZALO_THREAD],
        assigned: [],
        overdue: [],
        flags: [],
        paid: [],
        revenue: 963000,
      });
      const csvSpy = vi
        .spyOn(ktnApi, 'downloadConsultationReportCsv')
        .mockResolvedValue(new Blob(['\uFEFFID\nthread-zalo-01'], { type: 'text/csv' }));

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={['/admin/consultations?thread=thread-zalo-01']}>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('crm-tab-flags')).toBeInTheDocument();
      });

      // Review Flag
      fireEvent.click(screen.getByTestId('crm-tab-flags'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-flag-confirm-msg-flag-1')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-flag-confirm-msg-flag-1'));
      await waitFor(() => {
        expect(reviewSpy).toHaveBeenCalledWith('thread-zalo-01', {
          message_id: 'msg-flag-1',
          status: 'confirmed',
          note: undefined,
        });
      });

      // Analytics & CSV Export
      fireEvent.click(screen.getByTestId('crm-tab-analytics'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-export-csv-btn')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-export-csv-btn'));
      await waitFor(() => {
        expect(csvSpy).toHaveBeenCalled();
      });

      // Settings: PII rejection + Draft load + Kill switches
      fireEvent.click(screen.getByTestId('crm-tab-settings'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-example-answer-0')).toBeInTheDocument();
      });

      // Attempt to save PII in example
      fireEvent.change(screen.getByTestId('crm-example-answer-0'), {
        target: { value: 'Liên hệ 0901234567 hoặc email@test.com' },
      });
      fireEvent.click(screen.getByTestId('crm-save-guidance-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-guidance-pii-error')).toBeInTheDocument();
      });
      expect(saveGuidanceSpy).not.toHaveBeenCalled();

      // Load 72+ clean draft & toggle kill-switches off
      fireEvent.click(screen.getByTestId('crm-load-draft-btn'));
      await waitFor(() => {
        expect((screen.getByTestId('crm-example-question-0') as HTMLInputElement).value).toBe(
          'Mẫu 1'
        );
      });
      fireEvent.click(screen.getByTestId('crm-toggle-bot-enabled'));
      fireEvent.click(screen.getByTestId('crm-toggle-checkout-enabled'));
      fireEvent.click(screen.getByTestId('crm-save-guidance-btn'));
      await waitFor(() => {
        expect(saveGuidanceSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            bot_enabled: false,
            checkout_enabled: false,
          })
        );
      });
    });
  });

  describe('4. WebChatbotWidget (Scripted Quick-Reply Menu, AI Free-Text, VN Phone & VietQR Status)', () => {
    it('runs scripted quick-reply menu, free-text AI chat, VN phone capture, and VietQR order status without touching classroom DLP or auth token', async () => {
      const startSpy = vi
        .spyOn(ktnApi, 'startWebConsultation')
        .mockResolvedValue({ token: 'web-ticket-123' });
      vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
        courses: [{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }],
        checkoutEnabled: true,
      });
      vi.spyOn(ktnApi, 'getWebConsultationThread').mockResolvedValue({
        status: 'bot',
        messages: [],
      });
      let botSeq = 0;
      const sendMsgSpy = vi
        .spyOn(ktnApi, 'sendWebConsultationMessage')
        .mockImplementation(async () => ({
          accepted: true,
          reply: {
            id: `bot-reply-${++botSeq}`,
            sender: 'bot',
            ai_mode: 'simulated',
            body: 'Khóa học phù hợp cho bé là Chinese For Kids.',
            created_at: '2026-11-18T02:00:00Z',
          },
        }));
      const createOrderSpy = vi
        .spyOn(ktnApi, 'createWebConsultationOrder')
        .mockResolvedValue({
          id: 'ORD-WEB-01',
          amount: 963000,
          payment: SAMPLE_ZALO_ORDER.paymentInfo!,
        });
      const statusSpy = vi
        .spyOn(ktnApi, 'getWebConsultationOrderStatus')
        .mockResolvedValue({
          id: 'ORD-WEB-01',
          amount: 963000,
          paymentStatus: 'paid',
          accessStatus: 'approved',
          payment: SAMPLE_ZALO_ORDER.paymentInfo!,
        });

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <WebChatbotWidget mode="page" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(startSpy).toHaveBeenCalled();
        expect(localStorage.getItem('ktn_consult_web')).toBe('web-ticket-123');
      });

      // Click Quick-Reply "Để lại nhu cầu & SĐT"
      fireEvent.click(screen.getByTestId('web-chatbot-qr-root_need_phone'));
      await waitFor(() => {
        expect(screen.getByTestId('web-chatbot-need-phone-form')).toBeInTheDocument();
      });

      // Reject invalid phone, accept valid VN phone
      fireEvent.change(screen.getByTestId('web-chatbot-phone-input'), {
        target: { value: '123' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-phone-submit-btn'));
      expect(screen.getByText(/Số điện thoại Việt Nam chưa hợp lệ/)).toBeInTheDocument();

      fireEvent.change(screen.getByTestId('web-chatbot-phone-input'), {
        target: { value: '0901234567' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-phone-submit-btn'));
      await waitFor(() => {
        expect(sendMsgSpy).toHaveBeenCalledWith(
          'web-ticket-123',
          expect.objectContaining({
            menuAction: 'MENU_NEED_PHONE',
            body: expect.stringContaining('0901234567'),
          })
        );
      });

      // Free-text AI question
      fireEvent.change(screen.getByTestId('web-chatbot-input'), {
        target: { value: 'Cho mình hỏi lịch học buổi tối' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-send-btn'));
      await waitFor(() => {
        expect(sendMsgSpy).toHaveBeenCalledWith(
          'web-ticket-123',
          expect.objectContaining({ body: 'Cho mình hỏi lịch học buổi tối' })
        );
      });

      // Navigate to Payment Menu -> Open Order Form -> Create VietQR Order -> Refresh Status
      fireEvent.click(screen.getByTestId('web-chatbot-qr-back_root'));
      fireEvent.click(screen.getByTestId('web-chatbot-qr-root_payment'));
      fireEvent.click(screen.getByTestId('web-chatbot-qr-pay_guide'));

      fireEvent.change(screen.getByTestId('web-chatbot-order-name-input'), {
        target: { value: 'Phụ huynh Lan' },
      });
      fireEvent.change(screen.getByTestId('web-chatbot-order-email-input'), {
        target: { value: 'lan@example.com' },
      });
      fireEvent.change(screen.getByTestId('web-chatbot-order-phone-input'), {
        target: { value: '0901234567' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-order-submit-btn'));

      await waitFor(() => {
        expect(createOrderSpy).toHaveBeenCalled();
        expect(screen.getByTestId('web-chatbot-order-card')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('web-chatbot-refresh-order-btn'));
      await waitFor(() => {
        expect(statusSpy).toHaveBeenCalledWith('web-ticket-123', 'ORD-WEB-01');
        expect(screen.getByTestId('web-chatbot-order-card')).toHaveTextContent('paid');
      });
    });
  });

  describe('5. AdminWorkspace, OrderDetailDrawer, SepayReconciliationPanel & StudentDetailDrawer', () => {
    it('renders Zalo OA badges & advisor on Orders/Students, avoids unmocked recon fetch on /admin mount, and runs SePay Reconciliation & Sandbox Simulator on /admin/more', async () => {
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([SAMPLE_ZALO_ORDER]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
        ok: true,
        checkedAt: new Date().toISOString(),
        summary: {
          totalStudents: 1,
          healthyCount: 1,
          needsResyncCount: 0,
          manualReviewCount: 0,
          driftTotal: 0,
        },
        driftItems: [],
      });
      vi.spyOn(ktnApi, 'searchStudents').mockResolvedValue({
        ok: true,
        items: [SAMPLE_STUDENT],
        students: [SAMPLE_STUDENT],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        nextCursor: null,
        query: '',
        queryMs: 1,
      });
      const reconSpy = vi
        .spyOn(ktnApi, 'listSepayReconciliation')
        .mockResolvedValue({
          ok: true,
          items: SAMPLE_RECON_LOGS,
          total: 3,
          limit: 50,
          offset: 0,
        });
      const resolveReconSpy = vi
        .spyOn(ktnApi, 'resolveSepayReconciliation')
        .mockResolvedValue({ ok: true, log: SAMPLE_RECON_LOGS[0] });
      const retryPaySpy = vi
        .spyOn(ktnApi, 'retryConsultationPayment')
        .mockResolvedValue({ updated: true });
      const simSandboxSpy = vi
        .spyOn(ktnApi, 'simulateSepaySandboxEvent')
        .mockResolvedValue({ ok: true, status: 'accepted' });

      const qc = makeQueryClient();
      const { unmount } = render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={['/admin']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('admin-order-source-badge-ORD-261199')).toHaveTextContent(
          'Zalo OA'
        );
        expect(screen.getByTestId('admin-order-advisor-ORD-261199')).toHaveTextContent(
          'advisor1@khongtunhi.com'
        );
        expect(
          screen.getByTestId('student-lead-source-badge-hoangngan@khongtunhi.com')
        ).toHaveTextContent('Zalo OA');
      });

      // CRITICAL INVARIANT: /admin (activeTab === 'all') does NOT fetch reconciliation on mount
      expect(reconSpy).not.toHaveBeenCalled();
      unmount();

      // Navigate to /admin/more -> mounts SepayReconciliationPanel
      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={['/admin/more']}>
            <Routes>
              <Route path="/admin" element={<AdminWorkspace />} />
              <Route path="/admin/:section" element={<AdminWorkspace />} />
            </Routes>
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(reconSpy).toHaveBeenCalled();
        expect(screen.getByTestId('sepay-recon-row-TX-MISMATCH-1')).toBeInTheDocument();
        expect(screen.getByTestId('sepay-recon-row-TX-NEEDS-REV-2')).toBeInTheDocument();
        expect(screen.getByTestId('sepay-recon-row-TX-UNMATCHED-3')).toBeInTheDocument();
        expect(screen.getByTestId('sepay-sandbox-simulator')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('sepay-recon-resolve-btn-TX-MISMATCH-1'));
      await waitFor(() => {
        expect(resolveReconSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: 'TX-MISMATCH-1',
            resolutionStatus: 'resolved',
          })
        );
      });

      fireEvent.click(screen.getByTestId('sepay-recon-ignore-btn-TX-UNMATCHED-3'));
      await waitFor(() => {
        expect(resolveReconSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            transactionId: 'TX-UNMATCHED-3',
            resolutionStatus: 'ignored',
          })
        );
      });

      fireEvent.click(screen.getByTestId('sepay-recon-retry-btn-TX-NEEDS-REV-2'));
      await waitFor(() => {
        expect(retryPaySpy).toHaveBeenCalledWith({
          consultationId: 'thread-zalo-01',
          orderId: 'ORD-261199',
          transactionId: 'TX-NEEDS-REV-2',
        });
      });

      fireEvent.click(screen.getByTestId('sepay-sandbox-simulate-btn'));
      await waitFor(() => {
        expect(simSandboxSpy).toHaveBeenCalled();
      });
    });

    it('renders OrderDetailDrawer VietQR preview, Copy, Send to Zalo/Web thread, and Retry SePay Provisioning', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const onSendQrToThread = vi.fn().mockResolvedValue({ updated: true });
      const onRetryPayment = vi.fn().mockResolvedValue({ updated: true });
      const onOpenConsultation = vi.fn();

      render(
        <OrderDetailDrawer
          order={SAMPLE_ZALO_ORDER}
          open
          onClose={vi.fn()}
          classesList={[]}
          isUpdatingOrder={false}
          isApprovingOrder={false}
          actionError={null}
          onClearError={vi.fn()}
          onUpdateOrder={vi.fn()}
          onApproveOrder={vi.fn()}
          onOpenStudentProfile={vi.fn()}
          onOpenConsultation={onOpenConsultation}
          onSendQrToThread={onSendQrToThread}
          onRetryPayment={onRetryPayment}
        />
      );

      expect(screen.getByTestId('order-drawer-source-badge')).toHaveTextContent('Zalo OA');
      expect(screen.getByTestId('order-detail-advisor')).toHaveTextContent(
        'advisor1@khongtunhi.com'
      );
      expect(screen.getByTestId('order-vietqr-preview-card')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('order-open-consultation-btn'));
      expect(onOpenConsultation).toHaveBeenCalledWith('thread-zalo-01');

      fireEvent.click(screen.getByTestId('order-copy-vietqr-btn'));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.stringContaining('KTN ORD-261199'));
      });

      fireEvent.click(screen.getByTestId('order-send-qr-thread-btn'));
      await waitFor(() => {
        expect(onSendQrToThread).toHaveBeenCalledWith(
          expect.objectContaining({
            consultationId: 'thread-zalo-01',
            body: expect.stringContaining('img.vietqr.io'),
          })
        );
      });

      fireEvent.click(screen.getByTestId('order-retry-payment-btn'));
      await waitFor(() => {
        expect(onRetryPayment).toHaveBeenCalledWith({
          consultationId: 'thread-zalo-01',
          orderId: 'ORD-261199',
          transactionId: 'sepay:123456',
        });
      });
    });

    it('StudentDetailDrawer renders CRM sync metadata and links consultation via student.code PK', async () => {
      const onUpdateProfile = vi.fn().mockResolvedValue({ ok: true });
      const onLinkConsultation = vi.fn().mockResolvedValue({ ok: true });
      const onOpenConsultation = vi.fn();

      render(
        <StudentDetailDrawer
          student={SAMPLE_STUDENT}
          open
          onClose={vi.fn()}
          catalogCourses={SAMPLE_COURSES}
          catalogError={false}
          catalogLoading={false}
          onRetryCatalog={vi.fn()}
          classesList={[]}
          actionError={null}
          onClearError={vi.fn()}
          isGrantingCourse={false}
          isRevokingCourse={false}
          isAssigningClass={false}
          isReplacingCourses={false}
          isUpdatingProfile={false}
          isResyncing={false}
          onGrantCourses={vi.fn()}
          onRevokeCourse={vi.fn()}
          onAssignClass={vi.fn()}
          onReplaceAllCourses={vi.fn()}
          onUpdateProfile={onUpdateProfile}
          onLinkConsultation={onLinkConsultation}
          onOpenConsultation={onOpenConsultation}
          onResyncStudent={vi.fn()}
        />
      );

      expect(screen.getByTestId('drawer-info-lead-source')).toHaveTextContent('Zalo OA');
      expect(screen.getByTestId('drawer-info-zalo-user-id')).toHaveTextContent('zalo-u-12345');
      expect(screen.getByTestId('drawer-info-consultation-id')).toHaveTextContent('thread-zalo-01');

      fireEvent.click(screen.getByTestId('drawer-open-consultation-btn'));
      expect(onOpenConsultation).toHaveBeenCalledWith('thread-zalo-01');

      fireEvent.click(screen.getByTestId('drawer-edit-profile-btn'));
      fireEvent.change(screen.getByTestId('drawer-profile-consultation-id-input'), {
        target: { value: 'thread-zalo-99' },
      });
      fireEvent.click(screen.getByTestId('drawer-link-consultation-btn'));
      await waitFor(() => {
        expect(onLinkConsultation).toHaveBeenCalledWith({
          consultationId: 'thread-zalo-99',
          studentCode: 'KTN-2026-089',
        });
      });

      fireEvent.click(screen.getByTestId('drawer-save-profile-btn'));
      await waitFor(() => {
        expect(onUpdateProfile).toHaveBeenCalledWith(
          expect.objectContaining({
            code: 'KTN-2026-089',
            email: 'hoangngan@khongtunhi.com',
            consultationId: 'thread-zalo-99',
          })
        );
      });
    });
  });

  describe('6. Iteration 2 Regression Guards (Payloads, Stale State, Security, Regex, Error Propagation, Auth)', () => {
    it('sends { email } for assign, { at } for follow_up, supports inline thread flag review, shows flags guidance when unselected, and surfaces 403 thread error', async () => {
      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: 'quanly@khongtunhi.com',
          name: 'Ban Quản Lý KTN',
          admin: true,
          role: 'manager',
        },
      });
      vi.spyOn(ktnApi, 'getConsultationAdvisors').mockResolvedValue({ advisors: SAMPLE_ADVISORS });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
        conversations: [ZALO_THREAD],
        hasMore: false,
      });
      const threadSpy = vi
        .spyOn(ktnApi, 'getConsultationThread')
        .mockResolvedValueOnce({
          conversation: ZALO_THREAD,
          messages: ZALO_MESSAGES,
          hasEarlier: false,
          events: [],
          flags: [SAMPLE_FLAG],
          orders: [],
        });
      const operateSpy = vi
        .spyOn(ktnApi, 'operateConsultationThread')
        .mockResolvedValue({ updated: true });
      const reviewSpy = vi
        .spyOn(ktnApi, 'reviewConsultationFlag')
        .mockResolvedValue({ updated: true });

      // 1) Unselected thread -> Flags tab shows guidance banner instead of empty claim
      const { unmount } = render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={['/admin/consultations']}>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );
      await waitFor(() => {
        expect(screen.getByTestId('crm-tab-flags')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-tab-flags'));
      expect(screen.getByTestId('crm-flags-select-thread-guidance')).toBeInTheDocument();

      // Switch to inbox & open thread -> test assign { email }, follow_up { at }, and inline flag confirm
      fireEvent.click(screen.getByTestId('crm-flags-go-inbox-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-inbox-item-thread-zalo-01')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-zalo-01'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-assign-select')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('crm-assign-select'), {
        target: { value: 'quanly@khongtunhi.com' },
      });
      fireEvent.click(screen.getByTestId('crm-assign-btn'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith('thread-zalo-01', 'assign', {
          email: 'quanly@khongtunhi.com',
        });
      });

      const dtInput = document.querySelector('input[type="datetime-local"]') as HTMLInputElement;
      fireEvent.change(dtInput, { target: { value: '2026-11-20T14:30' } });
      fireEvent.click(screen.getByTestId('crm-followup-btn'));
      await waitFor(() => {
        expect(operateSpy).toHaveBeenCalledWith('thread-zalo-01', 'follow_up', {
          at: '2026-11-20T07:30:00.000Z',
        });
      });

      fireEvent.click(screen.getByTestId('crm-thread-flag-confirm-msg-flag-1'));
      await waitFor(() => {
        expect(reviewSpy).toHaveBeenCalledWith('thread-zalo-01', {
          message_id: 'msg-flag-1',
          status: 'confirmed',
          note: undefined,
        });
      });
      unmount();

      // 2) Direct deep-link ?thread=forbidden-id failing with 403 surfaces role="alert"
      threadSpy.mockRejectedValueOnce(new Error('403 Forbidden: Bạn không phụ trách cuộc tư vấn này.'));
      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter initialEntries={['/admin/consultations?thread=thread-forbidden']}>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );
      await waitFor(() => {
        const alertEl = screen.getByTestId('crm-thread-error-alert');
        expect(alertEl).toHaveAttribute('role', 'alert');
        expect(alertEl).toHaveTextContent('403 Forbidden');
      });
    });

    it('resets CreateConsultationOrderModal, LinkStudentCodeModal, ConsultationThreadPane, and AdultScriptHelperCard state when switching threads', async () => {
      const threadA: ConsultationInboxItem = {
        ...ZALO_THREAD,
        id: 'thread-a',
        customer_name: 'Anh Hoàng Minh',
        customer_phone: '0909123456',
        lead_meta: { ad_source: 'ad_963k', timeslot: 'Tối T3/T5' },
        student_code: 'KTN-A-01',
      };
      const threadB: ConsultationInboxItem = {
        ...ZALO_THREAD,
        id: 'thread-b',
        customer_name: 'Chị Thu Hà',
        customer_phone: '0912345678',
        lead_meta: { ad_source: 'ad_1500k', timeslot: 'Sáng T7' },
        student_code: '',
      };

      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: 'quanly@khongtunhi.com',
          name: 'Ban Quản Lý KTN',
          admin: true,
          role: 'manager',
        },
      });
      vi.spyOn(ktnApi, 'getConsultationAdvisors').mockResolvedValue({ advisors: SAMPLE_ADVISORS });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
        conversations: [threadA, threadB],
        hasMore: false,
      });
      vi.spyOn(ktnApi, 'getConsultationThread').mockImplementation(async (id) => ({
        conversation: id === 'thread-a' ? threadA : threadB,
        messages: [
          {
            id: `m-${id}`,
            sender: 'customer',
            body: 'Mình là người đi làm cần học 1 kèm 1',
            created_at: '2026-11-18T01:00:00Z',
          },
        ],
        hasEarlier: false,
        events: [],
        flags: [],
        orders: [],
      }));
      vi.spyOn(ktnApi, 'createConsultationOrder').mockResolvedValue({
        ok: true,
        id: 'ORD-THREAD-A',
        order_id: 'ORD-THREAD-A',
        amount: 963000,
        payment: SAMPLE_ZALO_ORDER.paymentInfo!,
      });

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('crm-inbox-item-thread-a')).toBeInTheDocument();
      });

      // Visit Thread A -> verify timeslot, create order, close modal
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-a'));
      await waitFor(() => {
        expect((screen.getByTestId('crm-adult-timeslot-input') as HTMLInputElement).value).toBe(
          'Tối T3/T5'
        );
      });
      fireEvent.click(screen.getByTestId('crm-open-create-order-btn'));
      fireEvent.click(screen.getByTestId('crm-create-order-submit-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-created-order-result')).toHaveTextContent('ORD-THREAD-A');
      });
      fireEvent.click(screen.getByText('Đóng'));

      // Switch to Thread B -> timeslot resets, CreateConsultationOrderModal opens clean with Thread B customer info, LinkStudentCodeModal resets
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-b'));
      await waitFor(() => {
        expect((screen.getByTestId('crm-adult-timeslot-input') as HTMLInputElement).value).toBe(
          'Sáng T7'
        );
      });

      fireEvent.click(screen.getByTestId('crm-open-create-order-btn'));
      expect(screen.queryByTestId('crm-created-order-result')).not.toBeInTheDocument();
      expect((screen.getByTestId('crm-create-order-name-input') as HTMLInputElement).value).toBe(
        'Chị Thu Hà'
      );
      expect((screen.getByTestId('crm-create-order-phone-input') as HTMLInputElement).value).toBe(
        '0912345678'
      );
      fireEvent.click(screen.getByText('Hủy'));

      fireEvent.click(screen.getByTestId('crm-open-link-student-btn'));
      expect((screen.getByTestId('crm-link-student-code-input') as HTMLInputElement).value).toBe('');
    });

    it('WebChatbotWidget sends lead: { targetGroup, phone, goal } and normalizes leadMeta/quickReplies from web/thread', async () => {
      vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-ticket-456' });
      vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
        courses: [{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }],
        checkoutEnabled: true,
      });

      let botMsgCounter = 0;
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('/web/thread')) {
          return new Response(
            JSON.stringify({
              status: 'bot',
              messages: [],
              leadMeta: { target_group: 'adult_working' },
              quickReplies: [
                {
                  id: 'server_qr_1',
                  label: 'Để lại nhu cầu & SĐT',
                  payload: 'Tôi muốn để lại nhu cầu',
                  action: 'MENU_NEED_PHONE',
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (url.includes('/web/message')) {
          return new Response(
            JSON.stringify({
              accepted: true,
              reply: {
                id: `bot-${++botMsgCounter}`,
                sender: 'bot',
                body: 'Đã nhận nhu cầu',
                created_at: '2026-11-18T02:00:00Z',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      });

      const sendMsgSpy = vi.spyOn(ktnApi, 'sendWebConsultationMessage');

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <WebChatbotWidget mode="page" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('web-chatbot-qr-server_qr_1')).toBeInTheDocument();
      });

      // Verify getWebConsultationThread normalizes leadMeta & quickReplies
      const threadNorm = await ktnApi.getWebConsultationThread('web-ticket-456');
      expect(threadNorm.lead_meta).toEqual({ target_group: 'adult_working' });
      expect(threadNorm.menu?.[0]?.id).toBe('server_qr_1');

      // Click server-driven MENU_NEED_PHONE button in UI, fill form, submit, and inspect real fetch body
      fireEvent.click(screen.getByTestId('web-chatbot-qr-server_qr_1'));
      await waitFor(() => {
        expect(screen.getByTestId('web-chatbot-need-phone-form')).toBeInTheDocument();
      });
      const formEl = screen.getByTestId('web-chatbot-need-phone-form');
      fireEvent.change(formEl.querySelector('select') as HTMLSelectElement, {
        target: { value: 'Người đi làm 1:1' },
      });
      fireEvent.change(screen.getByTestId('web-chatbot-phone-input'), {
        target: { value: '090.123.4567' },
      });
      const inputs = formEl.querySelectorAll('input');
      fireEvent.change(inputs[1] as HTMLInputElement, {
        target: { value: 'Giao tiếp công việc' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-phone-submit-btn'));

      await waitFor(() => {
        const msgFetchCall = fetchSpy.mock.calls.find(([u, init]) => {
          if (!String(u).includes('/web/message')) return false;
          const b = JSON.parse(String((init as RequestInit)?.body || '{}'));
          return Boolean(b.lead);
        });
        expect(msgFetchCall).toBeDefined();
        const sentBody = JSON.parse(String((msgFetchCall?.[1] as RequestInit)?.body || '{}'));
        expect(sentBody.lead).toEqual({
          targetGroup: 'Người đi làm 1:1',
          phone: '0901234567',
          goal: 'Giao tiếp công việc',
        });
      });
      expect(sendMsgSpy).toHaveBeenCalled();
    });

    it('OrderDetailDrawer blocks unsafe qrUrl, supports camelCase provisioningStatus, and guards retry_payment when payment_tx_ref is invalid/missing', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });

      const unsafeOrder: KtnOrder = {
        ...SAMPLE_ZALO_ORDER,
        order_id: 'ORD-UNSAFE-1',
        provisioning_status: undefined,
        provisioningStatus: 'partial_failure',
        payment_tx_ref: '',
        paymentInfo: {
          ...SAMPLE_ZALO_ORDER.paymentInfo!,
          qrUrl: 'javascript:alert(1)',
        },
      };

      const { rerender } = render(
        <OrderDetailDrawer
          order={unsafeOrder}
          open
          onClose={vi.fn()}
          classesList={[]}
          isUpdatingOrder={false}
          isApprovingOrder={false}
          actionError={null}
          onClearError={vi.fn()}
          onUpdateOrder={vi.fn()}
          onApproveOrder={vi.fn()}
          onOpenStudentProfile={vi.fn()}
          onSendQrToThread={vi.fn()}
          onRetryPayment={vi.fn()}
        />
      );

      expect(screen.queryByAltText('VietQR ORD-UNSAFE-1')).not.toBeInTheDocument();
      fireEvent.click(screen.getByTestId('order-copy-vietqr-btn'));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('javascript:alert(1)'));
      });

      // camelCase provisioningStatus='partial_failure' shows retry button, but missing payment_tx_ref disables it with hint
      const retryBtn = screen.getByTestId('order-retry-payment-btn');
      expect(retryBtn).toBeDisabled();
      expect(screen.getByTestId('order-retry-payment-hint')).toBeInTheDocument();

      // External non-img.vietqr.io URL is also blocked
      rerender(
        <OrderDetailDrawer
          order={{
            ...unsafeOrder,
            paymentInfo: {
              ...SAMPLE_ZALO_ORDER.paymentInfo!,
              qrUrl: 'https://evil.example/x.png',
            },
          }}
          open
          onClose={vi.fn()}
          classesList={[]}
          isUpdatingOrder={false}
          isApprovingOrder={false}
          actionError={null}
          onClearError={vi.fn()}
          onUpdateOrder={vi.fn()}
          onApproveOrder={vi.fn()}
          onOpenStudentProfile={vi.fn()}
          onSendQrToThread={vi.fn()}
          onRetryPayment={vi.fn()}
        />
      );
      expect(screen.queryByAltText('VietQR ORD-UNSAFE-1')).not.toBeInTheDocument();
    });

    it('SepayReconciliationPanel renders role="alert" on fetch error and StudentDetailDrawer surfaces link errors & trims student.code', async () => {
      const reconSpy = vi
        .spyOn(ktnApi, 'listSepayReconciliation')
        .mockRejectedValueOnce(new Error('500 Database unavailable'));

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <SepayReconciliationPanel isDemoMode={false} />
        </QueryClientProvider>
      );

      await waitFor(() => {
        const alertEl = screen.getByTestId('sepay-recon-error-alert');
        expect(alertEl).toHaveAttribute('role', 'alert');
        expect(alertEl).toHaveTextContent('500 Database unavailable');
      });
      expect(screen.queryByText('Không có giao dịch đối soát nào.')).not.toBeInTheDocument();
      expect(screen.getByTestId('sepay-recon-retry-fetch-btn')).toBeInTheDocument();
      expect(reconSpy).toHaveBeenCalledTimes(1);

      // StudentDetailDrawer: blank/whitespace student.code disables linking, and rejected onLinkConsultation surfaces role="alert"
      const blankCodeStudent: KtnStudentRecord = { ...SAMPLE_STUDENT, code: '   ' };
      const { rerender } = render(
        <StudentDetailDrawer
          student={blankCodeStudent}
          open
          onClose={vi.fn()}
          catalogCourses={SAMPLE_COURSES}
          catalogError={false}
          catalogLoading={false}
          onRetryCatalog={vi.fn()}
          classesList={[]}
          actionError={null}
          onClearError={vi.fn()}
          isGrantingCourse={false}
          isRevokingCourse={false}
          isAssigningClass={false}
          isReplacingCourses={false}
          isUpdatingProfile={false}
          isResyncing={false}
          onGrantCourses={vi.fn()}
          onRevokeCourse={vi.fn()}
          onAssignClass={vi.fn()}
          onReplaceAllCourses={vi.fn()}
          onUpdateProfile={vi.fn()}
          onLinkConsultation={vi.fn()}
          onResyncStudent={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('drawer-edit-profile-btn'));
      fireEvent.change(screen.getByTestId('drawer-profile-consultation-id-input'), {
        target: { value: 'thread-zalo-99' },
      });
      expect(screen.getByTestId('drawer-link-consultation-btn')).toBeDisabled();

      const failingLink = vi.fn().mockRejectedValue(new Error('404 Thread not found'));
      rerender(
        <StudentDetailDrawer
          student={SAMPLE_STUDENT}
          open
          onClose={vi.fn()}
          catalogCourses={SAMPLE_COURSES}
          catalogError={false}
          catalogLoading={false}
          onRetryCatalog={vi.fn()}
          classesList={[]}
          actionError={null}
          onClearError={vi.fn()}
          isGrantingCourse={false}
          isRevokingCourse={false}
          isAssigningClass={false}
          isReplacingCourses={false}
          isUpdatingProfile={false}
          isResyncing={false}
          onGrantCourses={vi.fn()}
          onRevokeCourse={vi.fn()}
          onAssignClass={vi.fn()}
          onReplaceAllCourses={vi.fn()}
          onUpdateProfile={vi.fn()}
          onLinkConsultation={failingLink}
          onResyncStudent={vi.fn()}
        />
      );
      fireEvent.click(screen.getByTestId('drawer-link-consultation-btn'));
      await waitFor(() => {
        const drawerAlert = screen.getByTestId('drawer-action-error-alert');
        expect(drawerAlert).toHaveAttribute('role', 'alert');
        expect(drawerAlert).toHaveTextContent('404 Thread not found');
      });
    });

    it('handles Unicode Vietnamese boundaries in detectAdultWorking11Context and accurate phone/VND detection in detectConsultationExamplePii', () => {
      const childRes = detectAdultWorking11Context('Gói 963k cho con chị');
      expect(childRes.matched).toBe(false);
      expect(childRes.isChildExcluded).toBe(true);

      const tuitionRes = detectAdultWorking11Context('Học phí 21.500.000đ');
      expect(tuitionRes.adPackage).not.toBe('1500k');
      expect(tuitionRes.matched).toBe(false);

      expect(detectConsultationExamplePii('Gọi (090) 123-4567').hasPii).toBe(true);
      expect(detectConsultationExamplePii('Học phí 1.000.000.000đ').hasPii).toBe(false);
    });

    it('never sends student session token to staff consultation endpoints and clears ktn_consult_staff on session-expired / cross-tab logout', async () => {
      const studentSession = { ...DEMO_USERS.student_both, token: 'student-jwt-secret' };
      saveStoredSession(studentSession, 'student-jwt-secret');
      setConsultationStaffToken('');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(JSON.stringify({ conversations: [], hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await ktnApi.getConsultationInbox();
      const headers = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(headers.get('Authorization')).toBeNull();

      // Set consultation staff token, then dispatch ktn:session-expired -> must clear
      setConsultationStaffToken('staff-jwt-123');
      expect(getConsultationStaffToken()).toBe('staff-jwt-123');
      window.dispatchEvent(new CustomEvent('ktn:session-expired'));
      expect(getConsultationStaffToken()).toBe('');

      // Set again, then dispatch cross-tab storage logout -> must clear
      setConsultationStaffToken('staff-jwt-456');
      window.dispatchEvent(
        new StorageEvent('storage', { key: 'ktn_sll_persistent_auth_v2', newValue: null })
      );
      expect(getConsultationStaffToken()).toBe('');
    });
  });

  describe('7. Iteration 3 Regression Guards (Token Fallback, Cross-Thread Draft/Offset, Price Boundary/Phone, Modal QR)', () => {
    it('never falls back to stale ktn_consult_staff when student session is active, and clears ktn_consult_staff on login & useAuthStore.logout()', async () => {
      // Case 1: Active student session + stale ktn_consult_staff -> NO Authorization header sent
      const studentSession = { ...DEMO_USERS.student_both, token: 'student-jwt-active' };
      saveStoredSession(studentSession, 'student-jwt-active');
      setConsultationStaffToken('old-staff-jwt');
      expect(getConsultationStaffToken()).toBe('old-staff-jwt');

      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () =>
        new Response(JSON.stringify({ conversations: [], hasMore: false }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      );

      await ktnApi.getConsultationInbox();
      const firstHeaders = fetchSpy.mock.calls[0]?.[1]?.headers as Headers;
      expect(firstHeaders.get('Authorization')).toBeNull();

      // Case 2: Same-tab ktnApi.login() as student clears stale ktn_consult_staff
      fetchSpy.mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            session: DEMO_USERS.student_both,
            token: 'student-login-jwt',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );
      await ktnApi.login('hoangngan@khongtunhi.com', 'secret');
      expect(getConsultationStaffToken()).toBe('');

      // Case 3: useAuthStore.logout() clears ktn_consult_staff
      setConsultationStaffToken('staff-jwt-before-logout');
      expect(getConsultationStaffToken()).toBe('staff-jwt-before-logout');
      await useAuthStore.getState().logout();
      expect(getConsultationStaffToken()).toBe('');
    });

    it('resets draftText, composerMode, and threadOffset when switching threads via Inbox or Analytics/Flags onOpenThread, and handles onReviewFlag errors cleanly', async () => {
      const thread1: ConsultationInboxItem = {
        ...ZALO_THREAD,
        id: 'thread-1',
        customer_name: 'Khách 1',
      };
      const thread2: ConsultationInboxItem = {
        ...ZALO_THREAD,
        id: 'thread-2',
        customer_name: 'Khách 2',
      };

      vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
        actor: {
          email: 'quanly@khongtunhi.com',
          name: 'Ban Quản Lý KTN',
          admin: true,
          role: 'manager',
        },
      });
      vi.spyOn(ktnApi, 'getConsultationAdvisors').mockResolvedValue({ advisors: SAMPLE_ADVISORS });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(SAMPLE_COURSES);
      vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
        conversations: [thread1, thread2],
        hasMore: false,
      });
      const threadSpy = vi.spyOn(ktnApi, 'getConsultationThread').mockImplementation(async (id) => ({
        conversation: id === 'thread-1' ? thread1 : thread2,
        messages: ZALO_MESSAGES,
        hasEarlier: true,
        events: [],
        flags: [SAMPLE_FLAG],
        orders: [],
      }));
      vi.spyOn(ktnApi, 'getConsultationReport').mockResolvedValue({
        start: '2026-11-10T00:00:00Z',
        end: '2026-11-18T23:59:59Z',
        responseMinutes: 3.0,
        conversations: [thread1, thread2],
        assigned: [],
        overdue: [],
        flags: [],
        paid: [],
        revenue: 0,
      });
      vi.spyOn(ktnApi, 'reviewConsultationFlag').mockRejectedValue(
        new Error('500 Flag review failed')
      );

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('crm-inbox-item-thread-1')).toBeInTheDocument();
      });

      // Open Thread 1, switch to note mode, type draft, load earlier messages (offset = 40)
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-1'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-composer-textarea')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('crm-mode-note-btn'));
      fireEvent.change(screen.getByTestId('crm-composer-textarea'), {
        target: { value: 'Secret draft for Thread 1' },
      });
      expect((screen.getByTestId('crm-composer-textarea') as HTMLTextAreaElement).value).toBe(
        'Secret draft for Thread 1'
      );

      fireEvent.click(screen.getByText('Tải tin nhắn cũ hơn'));
      await waitFor(() => {
        expect(threadSpy).toHaveBeenCalledWith('thread-1', 40);
      });
      await waitFor(() => {
        expect(screen.getByTestId('crm-thread-flag-confirm-msg-flag-1')).toBeInTheDocument();
      });

      // Failed onReviewFlag click must be caught cleanly (error toast surfaced, no unhandled rejection)
      fireEvent.click(screen.getByTestId('crm-thread-flag-confirm-msg-flag-1'));
      await waitFor(() => {
        expect(
          useUiStore.getState().toasts.some((t) => t.variant === 'error')
        ).toBe(true);
      });

      // Switch to Thread 2 via Inbox -> draftText cleared, composerMode back to 'reply', offset === undefined
      threadSpy.mockClear();
      fireEvent.click(screen.getByTestId('crm-inbox-item-thread-2'));
      await waitFor(() => {
        expect(threadSpy).toHaveBeenCalledWith('thread-2', undefined);
        expect((screen.getByTestId('crm-composer-textarea') as HTMLTextAreaElement).value).toBe('');
      });
      expect(screen.getByTestId('crm-mode-reply-btn').className).toContain('bg-red-800');

      // On Thread 2, set note draft & load earlier messages, then jump to Thread 1 via Analytics onOpenThread
      fireEvent.click(screen.getByTestId('crm-mode-note-btn'));
      fireEvent.change(screen.getByTestId('crm-composer-textarea'), {
        target: { value: 'Draft on Thread 2' },
      });
      fireEvent.click(screen.getByText('Tải tin nhắn cũ hơn'));
      await waitFor(() => {
        expect(threadSpy).toHaveBeenCalledWith('thread-2', 40);
      });

      fireEvent.click(screen.getByTestId('crm-tab-analytics'));
      await waitFor(() => {
        expect(screen.getByText(/Khách 1/)).toBeInTheDocument();
      });
      threadSpy.mockClear();
      const openBtns = screen.getAllByRole('button', { name: 'Mở' });
      fireEvent.click(openBtns[0]);

      await waitFor(() => {
        expect(threadSpy).toHaveBeenCalledWith('thread-1', undefined);
        expect((screen.getByTestId('crm-composer-textarea') as HTMLTextAreaElement).value).toBe('');
      });
      expect(screen.getByTestId('crm-mode-reply-btn').className).toContain('bg-red-800');
    });

    it('rejects .963.000đ / .963k multi-million false positives in detectAdultWorking11Context while matching real 963k/1.500k ads and normalizing (090) 123-4567', () => {
      expect(detectAdultWorking11Context('Học phí 12.963.000đ')).toMatchObject({
        matched: false,
        adPackage: null,
      });
      expect(detectAdultWorking11Context('Học phí 2.963.000đ')).toMatchObject({
        matched: false,
        adPackage: null,
      });
      expect(detectAdultWorking11Context('Gói 31.963k')).toMatchObject({
        matched: false,
        adPackage: null,
      });
      expect(detectAdultWorking11Context('Học phí 963.000.000đ')).toMatchObject({
        matched: false,
        adPackage: null,
      });

      expect(detectAdultWorking11Context('Gói 963k')).toMatchObject({
        matched: true,
        adPackage: '963k',
      });
      expect(detectAdultWorking11Context('963.000đ')).toMatchObject({
        matched: true,
        adPackage: '963k',
      });
      expect(detectAdultWorking11Context('1.500.000đ')).toMatchObject({
        matched: true,
        adPackage: '1500k',
      });

      expect(validateVnPhone('(090) 123-4567')).toBe(true);
      expect(validateVnPhone('(+84) 90-123-4567')).toBe(true);
    });

    it('gates unsafe qrUrl out of CreateConsultationOrderModal qrSummaryText and renders no img', async () => {
      const writeText = vi.fn().mockResolvedValue(undefined);
      Object.defineProperty(navigator, 'clipboard', {
        value: { writeText },
        configurable: true,
      });
      const onSendQrToThread = vi.fn().mockResolvedValue(undefined);

      vi.spyOn(ktnApi, 'createConsultationOrder').mockResolvedValue({
        ok: true,
        id: 'ORD-XSS-99',
        order_id: 'ORD-XSS-99',
        amount: 963000,
        payment: {
          ...SAMPLE_ZALO_ORDER.paymentInfo!,
          qrUrl: 'javascript:alert(1)',
        },
      });

      render(
        <CreateConsultationOrderModal
          open
          thread={ZALO_THREAD}
          courses={[{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }]}
          isDemoMode={false}
          onClose={vi.fn()}
          onOrderCreated={vi.fn()}
          onSendQrToThread={onSendQrToThread}
        />
      );

      fireEvent.click(screen.getByTestId('crm-create-order-submit-btn'));
      await waitFor(() => {
        expect(screen.getByTestId('crm-created-order-result')).toBeInTheDocument();
      });

      expect(screen.queryByAltText('VietQR ORD-XSS-99')).not.toBeInTheDocument();

      fireEvent.click(screen.getByTestId('crm-created-order-copy-btn'));
      await waitFor(() => {
        expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('javascript:alert(1)'));
        expect(writeText).toHaveBeenCalledWith(expect.not.stringContaining('VietQR:'));
      });

      fireEvent.click(screen.getByTestId('crm-created-order-send-thread-btn'));
      await waitFor(() => {
        expect(onSendQrToThread).toHaveBeenCalledWith(
          expect.not.stringContaining('javascript:alert(1)')
        );
        expect(onSendQrToThread).toHaveBeenCalledWith(expect.not.stringContaining('VietQR:'));
      });
    });
  });

  describe('8. Iteration 4 Regression Guards (Monotonic IDs, Poll-Race Dedup, Order Refresh Catch, Modal QR Catch)', () => {
    it('generates unique monotonic message IDs in WebChatbotWidget Demo Mode when Date.now() returns a constant millisecond', async () => {
      useUiStore.setState({ isDemoMode: true, lang: 'vi' });
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      vi.spyOn(Date, 'now').mockReturnValue(1700000000000);

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <WebChatbotWidget mode="page" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('web-chatbot-input')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByTestId('web-chatbot-input'), {
        target: { value: 'Tin nhắn thứ nhất' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-send-btn'));

      fireEvent.change(screen.getByTestId('web-chatbot-input'), {
        target: { value: 'Tin nhắn thứ hai' },
      });
      fireEvent.click(screen.getByTestId('web-chatbot-send-btn'));

      await waitFor(() => {
        expect(screen.getByText('Tin nhắn thứ nhất')).toBeInTheDocument();
        expect(screen.getByText('Tin nhắn thứ hai')).toBeInTheDocument();
      });

      const localMsgs = document.querySelectorAll('[data-testid^="web-chatbot-msg-local-"]');
      const botMsgs = document.querySelectorAll('[data-testid^="web-chatbot-msg-demo-bot-"]');
      expect(localMsgs).toHaveLength(2);
      expect(botMsgs).toHaveLength(2);
      expect(localMsgs[0].getAttribute('data-testid')).not.toBe(
        localMsgs[1].getAttribute('data-testid')
      );
      expect(botMsgs[0].getAttribute('data-testid')).not.toBe(
        botMsgs[1].getAttribute('data-testid')
      );

      const sameKeyErrors = errorSpy.mock.calls.filter((args) =>
        args.map((a) => String(a)).join(' ').toLowerCase().includes('same key')
      );
      expect(sameKeyErrors).toHaveLength(0);
    });

    it('deduplicates srv-bot-42 across the 4500ms thread poll and in-flight sendWebConsultationMessage resolution', async () => {
      vi.useFakeTimers();
      try {
        const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
        vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-race-token' });
        vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
          courses: [],
          checkoutEnabled: true,
        });

        let pollCount = 0;
        vi.spyOn(ktnApi, 'getWebConsultationThread').mockImplementation(async () => {
          pollCount += 1;
          if (pollCount === 1) {
            return { status: 'bot', messages: [] };
          }
          return {
            status: 'bot',
            messages: [
              {
                id: 'srv-cust-41',
                sender: 'customer',
                body: 'Câu hỏi race poll',
                created_at: '2026-11-18T02:00:00Z',
              },
              {
                id: 'srv-bot-42',
                sender: 'bot',
                ai_mode: 'simulated',
                body: 'Trả lời từ server',
                created_at: '2026-11-18T02:00:01Z',
              },
            ],
          };
        });

        let resolveSend!: (val: { accepted: boolean; reply?: ConsultationMessage }) => void;
        vi.spyOn(ktnApi, 'sendWebConsultationMessage').mockImplementation(
          () =>
            new Promise((resolve) => {
              resolveSend = resolve;
            })
        );

        render(
          <QueryClientProvider client={makeQueryClient()}>
            <MemoryRouter>
              <WebChatbotWidget mode="page" />
            </MemoryRouter>
          </QueryClientProvider>
        );

        // Flush init() so webToken is set and 4500ms poll timer starts
        await act(async () => {
          await vi.advanceTimersByTimeAsync(10);
        });
        expect(pollCount).toBe(1);

        // Send message while keeping sendWebConsultationMessage pending
        fireEvent.change(screen.getByTestId('web-chatbot-input'), {
          target: { value: 'Câu hỏi race poll' },
        });
        fireEvent.click(screen.getByTestId('web-chatbot-send-btn'));
        await act(async () => {
          await Promise.resolve();
        });
        expect(typeof resolveSend).toBe('function');

        // Advance past 4500ms so poll fetches srv-bot-42 before send resolves
        await act(async () => {
          await vi.advanceTimersByTimeAsync(4600);
        });
        expect(pollCount).toBeGreaterThanOrEqual(2);
        expect(screen.getAllByText('Trả lời từ server')).toHaveLength(1);

        // Resolve sendWebConsultationMessage with the same reply.id = 'srv-bot-42'
        await act(async () => {
          resolveSend({
            accepted: true,
            reply: {
              id: 'srv-bot-42',
              sender: 'bot',
              ai_mode: 'simulated',
              body: 'Trả lời từ server',
              created_at: '2026-11-18T02:00:01Z',
            },
          });
          await Promise.resolve();
        });

        expect(screen.getAllByText('Trả lời từ server')).toHaveLength(1);
        const sameKeyErrors = errorSpy.mock.calls.filter((args) =>
          args.map((a) => String(a)).join(' ').toLowerCase().includes('same key')
        );
        expect(sameKeyErrors).toHaveLength(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it('normalizes orderPhone on createWebConsultationOrder and handles manual order-status refresh failure without unhandled rejection', async () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        useUiStore.setState({ toasts: [] });
        vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-order-token' });
        vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
          courses: [{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }],
          checkoutEnabled: true,
        });
        vi.spyOn(ktnApi, 'getWebConsultationThread').mockResolvedValue({
          status: 'bot',
          messages: [],
        });
        const createOrderSpy = vi
          .spyOn(ktnApi, 'createWebConsultationOrder')
          .mockResolvedValue({
            id: 'ORD-FAIL-REFRESH',
            amount: 963000,
            payment: SAMPLE_ZALO_ORDER.paymentInfo!,
          });
        const statusSpy = vi
          .spyOn(ktnApi, 'getWebConsultationOrderStatus')
          .mockRejectedValue(new Error('Network offline'));

        render(
          <QueryClientProvider client={makeQueryClient()}>
            <MemoryRouter>
              <WebChatbotWidget mode="page" />
            </MemoryRouter>
          </QueryClientProvider>
        );

        await waitFor(() => {
          expect(screen.getByTestId('web-chatbot-qr-root_payment')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('web-chatbot-qr-root_payment'));
        fireEvent.click(screen.getByTestId('web-chatbot-qr-pay_guide'));

        fireEvent.change(screen.getByTestId('web-chatbot-order-name-input'), {
          target: { value: 'Phụ huynh An' },
        });
        fireEvent.change(screen.getByTestId('web-chatbot-order-email-input'), {
          target: { value: 'an@example.com' },
        });
        fireEvent.change(screen.getByTestId('web-chatbot-order-phone-input'), {
          target: { value: '(+84) 90-123-4567' },
        });
        fireEvent.click(screen.getByTestId('web-chatbot-order-submit-btn'));

        await waitFor(() => {
          expect(createOrderSpy).toHaveBeenCalledWith(
            'web-order-token',
            expect.objectContaining({ phone: '0901234567' })
          );
          expect(screen.getByTestId('web-chatbot-refresh-order-btn')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('web-chatbot-refresh-order-btn'));
        await waitFor(() => {
          expect(statusSpy).toHaveBeenCalledWith('web-order-token', 'ORD-FAIL-REFRESH');
          expect(useUiStore.getState().toasts.some((t) => t.variant === 'error')).toBe(true);
        });
        await new Promise((r) => setTimeout(r, 20));
        expect(rejections).toHaveLength(0);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });

    it('keeps CreateConsultationOrderModal open without unhandled rejection when onSendQrToThread rejects', async () => {
      const rejections: unknown[] = [];
      const onUnhandled = (reason: unknown) => rejections.push(reason);
      process.on('unhandledRejection', onUnhandled);

      try {
        const onClose = vi.fn();
        const onSendQrToThread = vi.fn().mockRejectedValue(new Error('500 Send failed'));

        vi.spyOn(ktnApi, 'createConsultationOrder').mockResolvedValue({
          ok: true,
          id: 'ORD-MODAL-ERR',
          order_id: 'ORD-MODAL-ERR',
          amount: 963000,
          payment: SAMPLE_ZALO_ORDER.paymentInfo!,
        });

        render(
          <CreateConsultationOrderModal
            open
            thread={ZALO_THREAD}
            courses={[{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }]}
            isDemoMode={false}
            onClose={onClose}
            onOrderCreated={vi.fn()}
            onSendQrToThread={onSendQrToThread}
          />
        );

        fireEvent.click(screen.getByTestId('crm-create-order-submit-btn'));
        await waitFor(() => {
          expect(screen.getByTestId('crm-created-order-result')).toBeInTheDocument();
        });

        fireEvent.click(screen.getByTestId('crm-created-order-send-thread-btn'));
        await waitFor(() => {
          expect(onSendQrToThread).toHaveBeenCalledTimes(1);
        });
        await new Promise((r) => setTimeout(r, 20));

        expect(onClose).not.toHaveBeenCalled();
        expect(screen.getByTestId('crm-create-order-modal')).toBeInTheDocument();
        expect(screen.getByTestId('crm-created-order-result')).toBeInTheDocument();
        expect(rejections).toHaveLength(0);
      } finally {
        process.off('unhandledRejection', onUnhandled);
      }
    });

    it('normalizes omitted qr.action on pay_guide/back_root and hides quick-reply chips when status !== bot and menu is []', async () => {
      vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-qr-fallback-token' });
      vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
        courses: [{ id: '6adadba969897b0002482ca5', title: 'New HSK 1 (3.0)', price: 963000 }],
        checkoutEnabled: true,
      });
      const threadSpy = vi
        .spyOn(ktnApi, 'getWebConsultationThread')
        .mockResolvedValueOnce({
          status: 'bot',
          messages: [],
          menu: [
            { id: 'pay_guide', label: 'Tạo đơn & mã VietQR ngay', payload: 'OPEN_ORDER_FORM' },
            { id: 'back_root', label: 'Menu chính', payload: 'MENU_ROOT' },
          ],
        })
        .mockResolvedValueOnce({
          status: 'waiting',
          messages: [
            {
              id: 'handoff-1',
              sender: 'bot',
              bot_mode: 'handoff',
              body: 'Đã chuyển tư vấn viên.',
              created_at: '2026-11-18T03:00:00Z',
            },
          ],
          menu: [],
        });
      const sendMsgSpy = vi.spyOn(ktnApi, 'sendWebConsultationMessage').mockResolvedValue({
        accepted: true,
      });

      render(
        <QueryClientProvider client={makeQueryClient()}>
          <MemoryRouter>
            <WebChatbotWidget mode="page" />
          </MemoryRouter>
        </QueryClientProvider>
      );

      await waitFor(() => {
        expect(screen.getByTestId('web-chatbot-qr-pay_guide')).toBeInTheDocument();
      });

      // Omitted qr.action on pay_guide opens order form with 0 sendWebConsultationMessage calls
      fireEvent.click(screen.getByTestId('web-chatbot-qr-pay_guide'));
      expect(screen.getByTestId('web-chatbot-order-form')).toBeInTheDocument();
      expect(sendMsgSpy).not.toHaveBeenCalled();

      // Omitted qr.action on back_root sends MENU_ROOT and refreshes thread -> waiting + menu:[] hides chips
      fireEvent.click(screen.getByTestId('web-chatbot-qr-back_root'));
      await waitFor(() => {
        expect(sendMsgSpy).toHaveBeenCalledWith(
          'web-qr-fallback-token',
          expect.objectContaining({ body: 'MENU_ROOT', menuAction: 'MENU_ROOT' })
        );
        expect(threadSpy).toHaveBeenCalledTimes(2);
      });

      await waitFor(() => {
        expect(screen.queryByTestId(/^web-chatbot-qr-/)).not.toBeInTheDocument();
      });
    });
  });
});
