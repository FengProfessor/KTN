// @vitest-environment jsdom
import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { ktnApi } from '@/services/api/ktnApiClient';
import { WebChatbotWidget } from '@/features/consultations/WebChatbotWidget';
import { OrderDetailDrawer } from '@/features/admin/components/OrderDetailDrawer';
import { ConsultationCrmWorkspace } from '@/features/consultations/ConsultationCrmWorkspace';
import { buildQuickReplyMenu } from '@/features/consultations/utils/consultationHelpers';
import type { ConsultationInboxItem, KtnOrder } from '@/types/ktn.types';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false }
    }
  });
}

describe('Tier 5 Adversarial Hardening — Domain 2 (Frontend UI & Security)', () => {
  beforeEach(() => {
    localStorage.clear();
    useUiStore.setState({ isDemoMode: false, toasts: [] });
    useAuthStore.setState({ user: null, authUser: null });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('D2-Gap 1: keeps optimistic MENU_PAYMENT quick-replies during waitUntil stale GET /web/thread race and clears on handoff', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const rootMenu = buildQuickReplyMenu('MENU_ROOT', 'vi');
    const paymentMenu = buildQuickReplyMenu('MENU_PAYMENT', 'vi');

    vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-tok-1' });
    vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
      courses: [{ id: 'c1', title: 'New HSK 1', price: 963000 }],
      checkoutEnabled: true
    });
    vi.spyOn(ktnApi, 'sendWebConsultationMessage').mockImplementation(async (_tok, payload) => {
      if (payload.menuAction === 'MENU_HANDOFF') {
        return { accepted: true, status: 'waiting' as const };
      }
      return { accepted: true };
    });

    let threadCalls = 0;
    const getThreadSpy = vi.spyOn(ktnApi, 'getWebConsultationThread').mockImplementation(async () => {
      threadCalls++;
      if (threadCalls <= 2) {
        // Initial load + immediate stale fetch after MENU_PAYMENT send
        return {
          status: 'bot' as const,
          messages: [],
          lead_meta: {},
          menu: rootMenu
        };
      }
      if (threadCalls === 3) {
        // Retry 350ms later returns caught-up MENU_PAYMENT state
        return {
          status: 'bot' as const,
          messages: [
            {
              id: 'bot-pay-1',
              sender: 'bot' as const,
              bot_mode: 'scripted' as const,
              body: 'Hướng dẫn thanh toán VietQR chính thức tại KTN:',
              created_at: '2026-11-18T03:00:00Z'
            }
          ],
          lead_meta: { menu_state: 'MENU_PAYMENT' },
          menu: paymentMenu
        };
      }
      // Subsequent call after MENU_HANDOFF
      return {
        status: 'waiting' as const,
        messages: [
          {
            id: 'bot-handoff-1',
            sender: 'bot' as const,
            bot_mode: 'handoff' as const,
            body: 'Đã chuyển tư vấn viên.',
            created_at: '2026-11-18T03:01:00Z'
          }
        ],
        lead_meta: {},
        menu: []
      };
    });

    render(<WebChatbotWidget mode="page" />);

    const payMenuBtn = await screen.findByTestId('web-chatbot-qr-root_payment');
    await act(async () => {
      fireEvent.click(payMenuBtn);
    });

    // Immediate stale GET /web/thread must NOT overwrite optimistic MENU_PAYMENT quick replies
    await waitFor(() => expect(getThreadSpy).toHaveBeenCalledTimes(2));
    expect(screen.getByTestId('web-chatbot-qr-pay_guide')).toBeInTheDocument();

    // Advance past 350ms retry -> caught-up bot message appears and pay_guide stays mounted
    await act(async () => {
      await vi.advanceTimersByTimeAsync(400);
    });
    await waitFor(() => expect(getThreadSpy).toHaveBeenCalledTimes(3));
    expect(screen.getByText('Hướng dẫn thanh toán VietQR chính thức tại KTN:')).toBeInTheDocument();
    expect(screen.getByTestId('web-chatbot-qr-pay_guide')).toBeInTheDocument();

    // Clicking handoff clears all quick-reply chips
    const handoffBtn = screen.getByTestId('web-chatbot-qr-handoff');
    await act(async () => {
      fireEvent.click(handoffBtn);
    });
    await waitFor(() => {
      expect(screen.queryByTestId('web-chatbot-qr-pay_guide')).toBeNull();
      expect(screen.queryByTestId('web-chatbot-qr-root_payment')).toBeNull();
    });
  });

  it('D2-Gap 3: blocks unsafe javascript:/data:/vbscript: schemes in OrderDetailDrawer zalo_url href', () => {
    const baseOrder: KtnOrder = {
      order_id: 'ORD-888111',
      student_name: 'Bé An',
      parent_name: 'Chị Lan',
      student_email: 'lan@example.com',
      phone: '0909123456',
      course_id: 'c1',
      course_name: 'New HSK 1',
      amount: 963000,
      payment_method: 'VietQR',
      payment_status: 'paid',
      approval_status: 'pending',
      created_at: '2026-11-18T02:00:00Z',
      zalo_url: 'javascript:alert(1)'
    };

    const noopAsync = async () => ({});
    const { rerender } = render(
      <OrderDetailDrawer
        order={baseOrder}
        open={true}
        onClose={() => {}}
        classesList={[]}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={() => {}}
        onUpdateOrder={noopAsync}
        onApproveOrder={noopAsync}
        onOpenStudentProfile={() => {}}
      />
    );

    const link = screen.getByTestId('order-zalo-link');
    expect(link.getAttribute('href')).toBe('https://zalo.me/0909123456');

    rerender(
      <OrderDetailDrawer
        order={{ ...baseOrder, phone: '', parent_phone: '', zalo_url: 'data:text/html,<script>' }}
        open={true}
        onClose={() => {}}
        classesList={[]}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={() => {}}
        onUpdateOrder={noopAsync}
        onApproveOrder={noopAsync}
        onOpenStudentProfile={() => {}}
      />
    );
    expect(screen.queryByTestId('order-zalo-link')).toBeNull();

    rerender(
      <OrderDetailDrawer
        order={{ ...baseOrder, phone: '', parent_phone: '', zalo_url: 'vbscript:msgbox(1)' }}
        open={true}
        onClose={() => {}}
        classesList={[]}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={() => {}}
        onUpdateOrder={noopAsync}
        onApproveOrder={noopAsync}
        onOpenStudentProfile={() => {}}
      />
    );
    expect(screen.queryByTestId('order-zalo-link')).toBeNull();
  });

  it('D2-Gap 4: prevents double-submit duplicate order & need-phone submissions in WebChatbotWidget', async () => {
    vi.spyOn(ktnApi, 'startWebConsultation').mockResolvedValue({ token: 'web-tok-2' });
    vi.spyOn(ktnApi, 'getWebConsultationCatalog').mockResolvedValue({
      courses: [{ id: 'c1', title: 'New HSK 1', price: 963000 }],
      checkoutEnabled: true
    });
    vi.spyOn(ktnApi, 'getWebConsultationThread').mockResolvedValue({
      status: 'bot' as const,
      messages: [],
      lead_meta: {},
      menu: buildQuickReplyMenu('MENU_ROOT', 'vi')
    });

    let resolveOrder: (v: any) => void;
    const createOrderSpy = vi.spyOn(ktnApi, 'createWebConsultationOrder').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveOrder = resolve;
        })
    );

    let resolveMsg: (v: any) => void;
    const sendMsgSpy = vi.spyOn(ktnApi, 'sendWebConsultationMessage').mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveMsg = resolve;
        })
    );

    render(<WebChatbotWidget mode="page" />);

    // Open Need & Phone form and verify double-submit prevention
    const needBtn = await screen.findByTestId('web-chatbot-qr-root_need_phone');
    fireEvent.click(needBtn);
    await waitFor(() => expect(sendMsgSpy).toHaveBeenCalledTimes(1));
    await act(async () => {
      resolveMsg!({ accepted: true, status: 'bot', menu: buildQuickReplyMenu('MENU_NEED_PHONE', 'vi') });
    });

    const phoneInput = await screen.findByTestId('web-chatbot-phone-input');
    fireEvent.change(phoneInput, { target: { value: '0901234567' } });
    const phoneSubmitBtn = screen.getByTestId('web-chatbot-phone-submit-btn') as HTMLButtonElement;
    fireEvent.click(phoneSubmitBtn);
    fireEvent.click(phoneSubmitBtn);
    await waitFor(() => expect(sendMsgSpy).toHaveBeenCalledTimes(2)); // only +1 new call
    expect(phoneSubmitBtn.disabled).toBe(true);
    await act(async () => {
      resolveMsg!({ accepted: true, status: 'bot', menu: buildQuickReplyMenu('MENU_ROOT', 'vi') });
    });

    // Open Order form via MENU_PAYMENT -> pay_guide
    const payBtn = await screen.findByTestId('web-chatbot-qr-root_payment');
    fireEvent.click(payBtn);
    await waitFor(() => expect(sendMsgSpy).toHaveBeenCalledTimes(3));
    await act(async () => {
      resolveMsg!({ accepted: true, status: 'bot', menu: buildQuickReplyMenu('MENU_PAYMENT', 'vi') });
    });

    const openOrderBtn = await screen.findByTestId('web-chatbot-qr-pay_guide');
    fireEvent.click(openOrderBtn);

    fireEvent.change(await screen.findByTestId('web-chatbot-order-name-input'), {
      target: { value: 'Phụ huynh Bình' }
    });
    fireEvent.change(screen.getByTestId('web-chatbot-order-email-input'), {
      target: { value: 'binh@example.com' }
    });
    fireEvent.change(screen.getByTestId('web-chatbot-order-phone-input'), {
      target: { value: '0901234567' }
    });

    const orderSubmitBtn = screen.getByTestId('web-chatbot-order-submit-btn') as HTMLButtonElement;
    fireEvent.click(orderSubmitBtn);
    fireEvent.click(orderSubmitBtn);

    expect(orderSubmitBtn.disabled).toBe(true);
    expect(createOrderSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveOrder!({
        id: 'ORD-554433',
        amount: 963000,
        payment: {
          bankId: 'MB',
          bankName: 'MB',
          accountNo: '0987654321',
          accountName: 'KTN',
          amount: 963000,
          transferContent: 'KTN ORD-554433',
          qrUrl: 'https://img.vietqr.io/image/MB-0987654321-compact2.png'
        }
      });
    });
    expect(await screen.findByTestId('web-chatbot-order-card')).toBeInTheDocument();
  });

  it('D2-Gap 5: handles retryConsultationPayment rejection without unhandledRejection and disables retry button while in-flight', async () => {
    useAuthStore.setState({ user: DEMO_USERS.admin, authUser: DEMO_USERS.admin });

    const threadItem: ConsultationInboxItem = {
      id: 'thread-zalo-retry',
      channel: 'zalo_oa',
      owner_email: 'quanly@khongtunhi.com',
      status: 'open',
      created_at: '2026-11-18T01:00:00Z',
      updated_at: '2026-11-18T02:00:00Z',
      reply_pending: false,
      has_paid_pending: true,
      customer_name: 'Anh Minh',
      customer_phone: '0909123456',
      zalo_user_id: 'zu-retry',
      source_tag: 'zalo_oa',
      lead_meta: {}
    };

    vi.spyOn(ktnApi, 'getConsultationStaffProfile').mockResolvedValue({
      actor: { email: 'quanly@khongtunhi.com', name: 'Manager', admin: true, role: 'manager' }
    });
    vi.spyOn(ktnApi, 'getConsultationAdvisors').mockResolvedValue({ advisors: [] });
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getConsultationInbox').mockResolvedValue({
      conversations: [threadItem],
      hasMore: false
    });
    vi.spyOn(ktnApi, 'getConsultationThread').mockResolvedValue({
      conversation: threadItem,
      messages: [],
      hasEarlier: false,
      events: [],
      flags: [],
      orders: [
        {
          order_id: 'ORD-778899',
          ktn_orders: {
            course_name: 'New HSK 1',
            amount: 963000,
            payment_status: 'paid',
            approval_status: 'pending',
            ktn_consultation_payments: [
              {
                transaction_id: 'sepay:9911',
                amount: 963000,
                status: 'needs_review',
                error: 'Sync failed'
              }
            ]
          }
        }
      ]
    });

    let rejectRetry: (err: Error) => void;
    const retrySpy = vi.spyOn(ktnApi, 'retryConsultationPayment').mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          rejectRetry = reject;
        })
    );

    const unhandled: unknown[] = [];
    const onUnhandled = (event: PromiseRejectionEvent) => unhandled.push(event.reason);
    window.addEventListener('unhandledrejection', onUnhandled);

    try {
      const qc = makeQueryClient();
      render(
        <QueryClientProvider client={qc}>
          <MemoryRouter initialEntries={[`/admin/consultations?thread=${threadItem.id}`]}>
            <ConsultationCrmWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const retryBtn = (await screen.findByRole('button', { name: /Thử cấp lại/i })) as HTMLButtonElement;
      fireEvent.click(retryBtn);
      fireEvent.click(retryBtn);

      expect(retryBtn.disabled).toBe(true);
      expect(retrySpy).toHaveBeenCalledTimes(1);

      await act(async () => {
        rejectRetry!(new Error('Đơn cần kế toán kiểm tra lại'));
        await Promise.resolve();
      });

      await waitFor(() => {
        expect(retryBtn.disabled).toBe(false);
        const toasts = useUiStore.getState().toasts;
        expect(toasts.some((t) => t.variant === 'error')).toBe(true);
      });
      expect(unhandled.length).toBe(0);
    } finally {
      window.removeEventListener('unhandledrejection', onUnhandled);
    }
  });
});
