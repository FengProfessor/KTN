import React from 'react';
import crypto from 'node:crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import { StudentDetailDrawer } from '../../src/features/admin/components/StudentDetailDrawer';
import { OrderDetailDrawer } from '../../src/features/admin/components/OrderDetailDrawer';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { LearningPage } from '../../src/features/learning/components/LearningPage';
import { clearStoredSession, ktnApi, saveStoredSession } from '../../src/services/api/ktnApiClient';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '../../src/lib/demoData';
import {
  CANONICAL_IZTEACH_COURSE_TITLES,
  disambiguateCatalogCourses,
  resolveStudentOnlineCourses,
} from '../../src/lib/utils';
import type { KtnCourse, KtnOrder, KtnStudentRecord } from '../../src/types/ktn.types';

const HSK2_ID = '6af2d9719a8b000002ad4bc0';
const HSK1_ID = '6adadba969897b0002482ca5';
const CFK1_ID = '65e7704a9ea90c00080d5195';
const HSK2_THUMB =
  'https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1794357758090-hsk2_gemini_thumb.jpg';

const FULL_ADMIN_CATALOG: KtnCourse[] = [
  ...DEMO_COURSES,
  {
    id: '6600fa477c18b80008c53c88',
    code: 'MINI-02',
    title: 'Tiếng Trung Trẻ Em Mini 2 (Khóa học cho bé 5 – 7 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 2',
    badge: 'MẦM NON MINI 2',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000,
  },
  {
    id: '6600fa7da2bfe10008834e13',
    code: 'MINI-03',
    title: 'Tiếng Trung Trẻ Em Mini 3 (Khóa học cho bé 6 – 8 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 3',
    badge: 'MẦM NON MINI 3',
    lessonsCount: 20,
    price: 890000,
    oldPrice: 1500000,
  },
  {
    id: 'BUNDLE_YCT_ALL',
    code: 'COMBO-6',
    title: 'Trọn Bộ 6 Khóa Học Trực Tuyến (Lộ trình 5 – 15 tuổi)',
    shortTitle: 'Trọn Bộ 6 Khóa',
    badge: 'COMBO ƯU ĐÃI 50%',
    lessonsCount: 111,
    price: 2990000,
    oldPrice: 6000000,
    isBundle: true,
    bundleCourseIds: [HSK1_ID, CFK1_ID],
  },
];

const SAMPLE_STUDENT: KtnStudentRecord = {
  code: 'KTN-2026-089',
  email: 'hoangngan@khongtunhi.com',
  name: 'Bé Nguyễn Hoàng Ngân',
  phone: '0987654321',
  parent_name: 'Chị Nguyễn Thị Lan',
  class_code: 'YCT2-04',
  has_live_class: true,
  has_online_courses: true,
  online_courses: [
    {
      id: HSK1_ID,
      code: 'HSK1-30',
      title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      shortTitle: 'HSK1 3.0',
    },
  ],
  studentCase: 'both',
  accountStatus: 'ready_to_login',
  account_status: 'ready_to_login',
  syncStatus: 'synced',
  sync_status: 'synced',
};

const HSK2_ORDER: KtnOrder = {
  order_id: 'ORD-HSK2-261117',
  student_name: 'Trần Minh Khôi',
  parent_name: 'Anh Trần Văn Nam',
  student_email: 'minhkhoi.hsk2@example.com',
  phone: '0912345678',
  parent_phone: '0912345678',
  course_id: HSK2_ID,
  course_name: 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)',
  amount: 890000,
  server_course_price: 890000,
  payment_method: 'VietQR',
  course_valid: true,
  amount_valid: true,
  payment_status: 'paid',
  payment_detailed_status: 'verified_paid',
  contact_status: 'called',
  approval_status: 'pending',
  account_detailed_status: 'no_account',
  created_at: new Date().toISOString(),
};

const HSK1_ORDER: KtnOrder = {
  order_id: 'ORD-HSK1-261116',
  student_name: 'Lê Thảo Vy',
  parent_name: 'Chị Lê Thu Hà',
  student_email: 'thaovy.hsk1@example.com',
  phone: '0988776655',
  parent_phone: '0988776655',
  course_id: HSK1_ID,
  course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
  amount: 890000,
  server_course_price: 890000,
  payment_method: 'VietQR',
  course_valid: true,
  amount_valid: true,
  payment_status: 'paid',
  payment_detailed_status: 'verified_paid',
  contact_status: 'called',
  approval_status: 'pending',
  account_detailed_status: 'no_account',
  created_at: new Date().toISOString(),
};

describe('HSK2 3.0 Admin Catalog, Search, Grant & Order Approval', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: {
        id: 'admin-hsk2-test',
        email: 'quanly@khongtunhi.com',
        name: 'Quản lý KTN',
        role: 'admin',
        roles: ['admin'],
        classCode: null,
        hasLiveClass: false,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    useUiStore.setState({ isDemoMode: false });
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  it('matches canonical HSK2 3.0 metadata across DEMO_COURSES, CANONICAL_IZTEACH_COURSE_TITLES, and entitlement fallback', () => {
    const demoHsk2 = DEMO_COURSES.find((c) => c.id === HSK2_ID);
    expect(demoHsk2).toBeDefined();
    expect(demoHsk2?.code).toBe('HSK2-30');
    expect(demoHsk2?.title).toBe('Khóa học Tiêu Chuẩn New HSK 2 (3.0)');
    expect(demoHsk2?.shortTitle).toBe('HSK2 3.0');
    expect(demoHsk2?.badge).toBe('TIÊU CHUẨN MỚI 3.0');
    expect(demoHsk2?.lessonsCount).toBe(11);
    expect(demoHsk2?.description).toContain('11 bài (22 phần)');
    expect(demoHsk2?.thumb).toBe(HSK2_THUMB);
    expect(demoHsk2?.price).toBe(890000);
    expect(demoHsk2?.oldPrice).toBe(1500000);

    const canonical = CANONICAL_IZTEACH_COURSE_TITLES[HSK2_ID];
    expect(canonical).toEqual({
      id: HSK2_ID,
      code: 'HSK2-30',
      title: 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)',
      shortTitle: 'HSK2 3.0',
    });

    const disambiguated = disambiguateCatalogCourses(
      FULL_ADMIN_CATALOG.filter((c) => !c.isBundle)
    );
    const hsk1Dis = disambiguated.find((c) => c.id === HSK1_ID);
    const hsk2Dis = disambiguated.find((c) => c.id === HSK2_ID);
    expect(hsk1Dis?.displayLabel).toBe('HSK1 3.0');
    expect(hsk2Dis?.displayLabel).toBe('HSK2 3.0');

    const fallbackResolved = resolveStudentOnlineCourses(
      [{ id: HSK2_ID, title: 'Khóa học trực tuyến' }],
      []
    );
    expect(fallbackResolved).toHaveLength(1);
    expect(fallbackResolved[0].code).toBe('HSK2-30');
    expect(fallbackResolved[0].shortTitle).toBe('HSK2 3.0');
    expect(fallbackResolved[0].title).toBe('Khóa học Tiêu Chuẩn New HSK 2 (3.0)');
  });

  it('displays HSK2 3.0 in StudentDetailDrawer dropdown & quick-pick, searches all 5 query variants, and grants without altering HSK1 3.0 or class YCT2-04', async () => {
    const onGrantCourses = vi.fn().mockResolvedValue(undefined);
    render(
      <StudentDetailDrawer
        student={SAMPLE_STUDENT}
        open={true}
        onClose={vi.fn()}
        catalogCourses={FULL_ADMIN_CATALOG}
        catalogError={false}
        catalogLoading={false}
        onRetryCatalog={vi.fn()}
        classesList={DEMO_CLASSES.slice(0, 2)}
        actionError={null}
        onClearError={vi.fn()}
        isGrantingCourse={false}
        isRevokingCourse={false}
        isAssigningClass={false}
        isReplacingCourses={false}
        isUpdatingProfile={false}
        isResyncing={false}
        isManagingLifecycle={false}
        hasExistingOrders={false}
        onGrantCourses={onGrantCourses}
        onRevokeCourse={vi.fn().mockResolvedValue(undefined)}
        onAssignClass={vi.fn().mockResolvedValue(undefined)}
        onReplaceAllCourses={vi.fn().mockResolvedValue(undefined)}
        onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
        onManageLifecycle={vi.fn().mockResolvedValue({ ok: true })}
        onResyncStudent={vi.fn()}
        onCopyEmail={vi.fn()}
      />
    );

    const selectEl = screen.getByTestId('drawer-course-select');
    expect(
      within(selectEl).getByText(/Khóa học Tiêu Chuẩn New HSK 2 \(3\.0\) \(HSK2-30\)/)
    ).toBeInTheDocument();

    expect(screen.getByTestId(`drawer-course-option-${HSK2_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`drawer-course-option-${HSK1_ID}`)).toBeDisabled();
    expect(screen.getByTestId(`drawer-course-option-${CFK1_ID}`)).toBeInTheDocument();

    const searchInput = screen.getByTestId('drawer-course-search-input');
    const queries = [
      'Khóa học Tiêu Chuẩn New HSK 2 (3.0)',
      'tieu chuan new hsk 2',
      'HSK2 3.0',
      'hsk 2 3.0',
      'HSK2-30',
      HSK2_ID,
    ];
    for (const q of queries) {
      fireEvent.change(searchInput, { target: { value: q } });
      expect(screen.getByTestId(`drawer-course-option-${HSK2_ID}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`drawer-course-option-${HSK1_ID}`)).toBeNull();
    }

    fireEvent.change(searchInput, { target: { value: '' } });
    fireEvent.click(screen.getByTestId(`drawer-course-option-${HSK2_ID}`));

    const preview = screen.getByTestId('drawer-grant-preview');
    expect(preview.textContent).toContain('Khóa học Tiêu Chuẩn New HSK 2 (3.0)');
    expect(preview.textContent).toContain('YCT2-04');

    fireEvent.click(screen.getByTestId('drawer-grant-course-submit-btn'));

    await waitFor(() => {
      expect(onGrantCourses).toHaveBeenCalledWith(
        expect.objectContaining({
          email: SAMPLE_STUDENT.email,
          courseIds: [HSK2_ID],
        })
      );
    });
  });

  it('supports HSK2 3.0 in AdminWorkspace roster filter, student provision modal (excluding bundles), and order search without breaking existing courses', async () => {
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(DEMO_CLASSES.slice(0, 2));
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(FULL_ADMIN_CATALOG);
    vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([HSK2_ORDER, HSK1_ORDER]);
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

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId(`admin-order-row-${HSK2_ORDER.order_id}`)).toBeInTheDocument();
      expect(screen.getByTestId(`admin-order-row-${HSK1_ORDER.order_id}`)).toBeInTheDocument();
    });

    const orderSearch = screen.getByTestId('admin-order-search-input');
    for (const q of ['HSK2-30', 'HSK2 3.0', HSK2_ID, 'tieu chuan new hsk 2']) {
      fireEvent.change(orderSearch, { target: { value: q } });
      expect(screen.getByTestId(`admin-order-row-${HSK2_ORDER.order_id}`)).toBeInTheDocument();
      expect(screen.queryByTestId(`admin-order-row-${HSK1_ORDER.order_id}`)).toBeNull();
    }

    fireEvent.change(orderSearch, { target: { value: '' } });

    const courseFilter = screen.getByTestId('admin-filter-course');
    expect(within(courseFilter).getByText('HSK2 3.0')).toBeInTheDocument();
    expect(within(courseFilter).getByText('HSK1 3.0')).toBeInTheDocument();
    expect(within(courseFilter).queryByText('Trọn Bộ 6 Khóa')).toBeNull();

    fireEvent.click(screen.getByTestId('admin-open-create-student-btn'));
    expect(screen.getByTestId(`provision-student-course-btn-${HSK2_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`provision-student-course-btn-${HSK1_ID}`)).toBeInTheDocument();
    expect(screen.getByTestId(`provision-student-course-btn-${CFK1_ID}`)).toBeInTheDocument();
    expect(screen.queryByTestId('provision-student-course-btn-BUNDLE_YCT_ALL')).toBeNull();
  });

  it('approves HSK2 3.0 and HSK1 3.0 orders cleanly via OrderDetailDrawer', async () => {
    const onApproveOrder = vi.fn().mockResolvedValue({ ok: true });
    const { rerender } = render(
      <OrderDetailDrawer
        order={HSK2_ORDER}
        open={true}
        onClose={vi.fn()}
        classesList={DEMO_CLASSES.slice(0, 2)}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={vi.fn()}
        onUpdateOrder={vi.fn().mockResolvedValue({ ok: true })}
        onApproveOrder={onApproveOrder}
        onOpenStudentProfile={vi.fn()}
      />
    );

    expect(screen.getByTestId('order-detail-drawer').textContent).toContain(
      'Khóa học Tiêu Chuẩn New HSK 2 (3.0)'
    );
    fireEvent.click(screen.getByTestId('order-activate-course-btn'));
    fireEvent.click(screen.getByTestId('order-final-confirm-activation-btn'));

    await waitFor(() => {
      expect(onApproveOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: HSK2_ORDER.order_id,
          studentEmail: HSK2_ORDER.student_email,
        })
      );
    });

    rerender(
      <OrderDetailDrawer
        order={HSK1_ORDER}
        open={true}
        onClose={vi.fn()}
        classesList={DEMO_CLASSES.slice(0, 2)}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={vi.fn()}
        onUpdateOrder={vi.fn().mockResolvedValue({ ok: true })}
        onApproveOrder={onApproveOrder}
        onOpenStudentProfile={vi.fn()}
      />
    );
    fireEvent.click(screen.getByTestId('order-activate-course-btn'));
    fireEvent.click(screen.getByTestId('order-final-confirm-activation-btn'));

    await waitFor(() => {
      expect(onApproveOrder).toHaveBeenCalledWith(
        expect.objectContaining({
          orderId: HSK1_ORDER.order_id,
          studentEmail: HSK1_ORDER.student_email,
        })
      );
    });
  });

  it('renders HSK2 3.0 multi-part buttons (1.1, 1.2, 11.1, 11.2) and switches unitId cleanly in LearningPage wired to createLocalWorkerHarness() while keeping HSK1 (3.1, 3.2) intact', async () => {
    const signTestToken = (
      payload: Record<string, any>,
      secret = 'ktn-v2-local-hmac-secret-2026'
    ) => {
      const data = {
        ...payload,
        jti: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`,
        iat: Date.now(),
        exp: Date.now() + 30 * 86400 * 1000,
      };
      const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
      const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
      return `${bodyB64}.${sigB64}`;
    };

    const harness = createLocalWorkerHarness();
    const adminToken = signTestToken({
      id: 'ADMIN-HSK2-LP',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });
    const studentToken = signTestToken({
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      email: 'hoangngan@khongtunhi.com',
      role: 'student',
      roles: ['student'],
    });

    // Grant HSK2 3.0 to hoangngan@khongtunhi.com via real worker endpoint so student is entitled
    const grantRes = await harness.workerModule.fetch(
      new Request('http://localhost/api/ktn/students/courses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'grant',
          email: 'hoangngan@khongtunhi.com',
          courseIds: [HSK2_ID],
        }),
      }),
      harness.env
    );
    expect(grantRes.status).toBe(200);

    const sessionUser = {
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      code: 'KTN-2026-089',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [
        { id: HSK1_ID, code: 'HSK1-30', title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)' },
        { id: HSK2_ID, code: 'HSK2-30', title: 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)' },
      ],
      token: studentToken,
    };
    saveStoredSession(sessionUser, studentToken);
    useAuthStore.setState({
      user: sessionUser,
      authUser: sessionUser,
      isLoading: false,
      isRestoring: false,
      error: null,
    });
    useUiStore.setState({ isDemoMode: false, videoDemoScenario: 'live_real' });

    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith('/api/ktn/') || urlStr.includes('/api/ktn/')) {
        const pathOnly = urlStr.replace(/^https?:\/\/[^/]+/, '');
        const headers = new Headers(init?.headers || {});
        if (!headers.has('Authorization')) {
          headers.set('Authorization', `Bearer ${studentToken}`);
        }
        const workerReq = new Request(`http://localhost${pathOnly}`, {
          method: init?.method || 'GET',
          headers,
          body: init?.body,
        });
        const workerRes = await harness.workerModule.fetch(workerReq, harness.env);
        const bodyText =
          workerRes.status === 204 || workerRes.status === 304 ? null : await workerRes.text();
        return new Response(bodyText, {
          status: workerRes.status,
          headers: workerRes.headers,
        });
      }
      return originalFetch(input as any, init);
    }) as typeof fetch;

    const LocationSearchProbe: React.FC = () => {
      const loc = useLocation();
      return <div data-testid="router-search">{loc.search}</div>;
    };

    try {
      const hsk2View = render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={[`/learning?courseId=${HSK2_ID}&lesson=1`]}>
            <LocationSearchProbe />
            <LearningPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const part11Btn = await screen.findByTestId('lesson-part-btn-1.1', {}, { timeout: 5000 });
      const part12Btn = await screen.findByTestId('lesson-part-btn-1.2', {}, { timeout: 5000 });
      const part111Btn = await screen.findByTestId('lesson-part-btn-11.1', {}, { timeout: 5000 });
      const part112Btn = await screen.findByTestId('lesson-part-btn-11.2', {}, { timeout: 5000 });

      expect(part11Btn).toBeInTheDocument();
      expect(part12Btn).toBeInTheDocument();
      expect(part111Btn).toBeInTheDocument();
      expect(part112Btn).toBeInTheDocument();

      fireEvent.click(part12Btn);
      await waitFor(() => {
        expect(screen.getByTestId('router-search').textContent).toContain(
          'unitId=6af2dd379a8b000002ad6194'
        );
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('1.2');
      });

      fireEvent.click(part11Btn);
      await waitFor(() => {
        expect(screen.getByTestId('router-search').textContent).toContain(
          'unitId=6af2da51b46c6400026f9097'
        );
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('1.1');
      });

      fireEvent.click(part112Btn);
      await waitFor(() => {
        expect(screen.getByTestId('router-search').textContent).toContain(
          'unitId=6afc68220434430002bcc5f2'
        );
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('11.2');
      });

      fireEvent.click(part111Btn);
      await waitFor(() => {
        expect(screen.getByTestId('router-search').textContent).toContain(
          'unitId=6afc67e30434430002bcc3ee'
        );
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('11.1');
      });

      hsk2View.unmount();

      const hsk1Qc = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      render(
        <QueryClientProvider client={hsk1Qc}>
          <MemoryRouter initialEntries={[`/learning?courseId=${HSK1_ID}&lesson=3`]}>
            <LocationSearchProbe />
            <LearningPage />
          </MemoryRouter>
        </QueryClientProvider>
      );

      const hsk1Part31 = await screen.findByTestId('lesson-part-btn-3.1', {}, { timeout: 5000 });
      const hsk1Part32 = await screen.findByTestId('lesson-part-btn-3.2', {}, { timeout: 5000 });
      expect(hsk1Part31).toBeInTheDocument();
      expect(hsk1Part32).toBeInTheDocument();

      fireEvent.click(hsk1Part32);
      await waitFor(() => {
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('3.2');
      });
      const part32Search = screen.getByTestId('router-search').textContent || '';
      expect(part32Search).toContain('unitId=');

      fireEvent.click(hsk1Part31);
      await waitFor(() => {
        expect(screen.getByTestId('lesson-header-banner').textContent).toContain('3.1');
        expect(screen.getByTestId('router-search').textContent).not.toBe(part32Search);
      });
      hsk1Qc.clear();
    } finally {
      globalThis.fetch = originalFetch;
      clearStoredSession();
    }
  });
});
