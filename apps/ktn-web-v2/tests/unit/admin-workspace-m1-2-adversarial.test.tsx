import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { ktnApi } from '../../src/services/api/ktnApiClient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import type { KtnTeacherRecord, KtnClassItem, KtnStudentRecord } from '../../src/types/ktn.types';

function createMockTeachers(count: number): KtnTeacherRecord[] {
  const teachers = Array.from({ length: count }, (_, i) => {
    const isLinh = i === 0;
    const isTuan = i === 1;
    const isLan = i === 2;
    return {
      code: `GV-KTN-${String(i + 1).padStart(2, '0')}`,
      name: isLinh
        ? 'Cô Lâm Mỹ Linh'
        : isTuan
        ? 'Thầy Đặng Quốc Tuấn'
        : isLan
        ? 'Cô Vũ Thị Lan Hương'
        : `Giáo viên KTN ${i + 1}`,
      email: isLinh
        ? 'linh.lam@khongtunhi.com'
        : isTuan
        ? 'tuan.dang@khongtunhi.com'
        : isLan
        ? 'lanhuong.vu@khongtunhi.com'
        : `gv${i + 1}@khongtunhi.com`,
      phone: `09011122${String(i).padStart(2, '0')}`,
      specialty: isLinh ? 'HSK 1-4, YCT thiếu nhi' : 'Giao tiếp thương mại',
      assigned_classes: isLinh ? ['YCT2-04'] : isTuan ? [] : ['HSK1-01', 'HSK2-02'],
      assigned_courses: ['6adadba969897b0002482ca5'],
      active: i !== 3,
      status: i === 3 ? 'locked' : 'active',
      managedStudentsCount: isLinh ? 12 : 5,
      stats: {
        scheduledSessionsCount: 20,
        confirmedTaughtSessionsCount: 18,
        cancelledOrSubstituteSessionsCount: 0,
        submissionsReviewedCount: 35,
        pendingGradingCount: 2,
        forumAnswersCount: 10,
        acceptedAnswersCount: 8,
        videoAnswersCount: 3,
        totalContributionPoints: 120,
        unverifiedTeachingLog: false,
        avgGradingHours: 2,
      },
    };
  });
  return teachers as unknown as KtnTeacherRecord[];
}

const mockClasses: KtnClassItem[] = [
  {
    id: 'YCT2-04',
    name: 'YCT 2 Thiếu Nhi',
    teacher_code: 'GV-KTN-01',
    teacher_name: 'Cô Lâm Mỹ Linh',
    teacher_email: 'linh.lam@khongtunhi.com',
    total_lessons: 24,
    current_lesson: 4,
    schedule: 'Thứ 3 & Thứ 5',
    active: true,
  },
  {
    id: 'HSK1-01',
    name: 'HSK 1 Căn Bản',
    teacher_code: 'GV-KTN-03',
    teacher_name: 'Cô Vũ Thị Lan Hương',
    teacher_email: 'lanhuong.vu@khongtunhi.com',
    total_lessons: 30,
    current_lesson: 12,
    schedule: 'Thứ 2 & Thứ 6',
    active: true,
  },
];

const mockStudents = [
  {
    code: 'KTN-STU-001',
    name: 'Nguyễn Văn An',
    email: 'an.nguyen@example.com',
    class_code: 'YCT2-04',
    accountStatus: 'ready_to_login',
    syncStatus: 'synced',
    has_live_class: true,
    has_online_courses: false,
    online_courses: [],
    studentCase: 'class_only',
  },
] as unknown as KtnStudentRecord[];

const mockOrders = [
  {
    id: 'ORD-2026-001',
    customer_email: 'order.cust@example.com',
    status: 'paid',
    amount: 1500000,
    created_at: new Date().toISOString(),
  },
];

describe('Adversarial Verification — Milestone M1 AdminWorkspace Invariants', () => {
  let queryClient: QueryClient;
  const mock45Teachers = createMockTeachers(45);

  beforeEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState({
      user: {
        id: 'admin-01',
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

    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(mockClasses);
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getOrders').mockResolvedValue(mockOrders as any);
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
      items: mockStudents,
      students: mockStudents,
      totalCount: 1,
      limit: 20,
      offset: 0,
      hasMore: false,
      nextCursor: null,
      query: '',
      queryMs: 1,
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  function renderAdminWorkspace(initialPath = '/admin/teachers') {
    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[initialPath]}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  }

  it('Invariance 1: Search debounce operates at 220ms and resists rapid typing jitter', async () => {
    const searchCalls: string[] = [];
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      if (params?.q) searchCalls.push(params.q);
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });

    const searchInput = screen.getByTestId('admin-teacher-search-input');

    // Simulate typing rapidly: 'l', 'la', 'lam' spaced 50ms apart
    act(() => {
      fireEvent.change(searchInput, { target: { value: 'l' } });
    });
    await new Promise((r) => setTimeout(r, 60));

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'la' } });
    });
    await new Promise((r) => setTimeout(r, 60));

    act(() => {
      fireEvent.change(searchInput, { target: { value: 'lam' } });
    });

    // Before 220ms after last keystroke (e.g. 100ms later), search for 'lam' should NOT have executed yet
    await new Promise((r) => setTimeout(r, 100));
    expect(searchCalls).not.toContain('lam');

    // After 220ms (total > 220ms from last keystroke), 'lam' executes
    await waitFor(
      () => {
        expect(searchCalls).toContain('lam');
      },
      { timeout: 1000 }
    );

    // Only 'lam' should have executed, intermediate 'l' and 'la' were canceled by debounce
    expect(searchCalls).not.toContain('l');
    expect(searchCalls).not.toContain('la');
  });

  it('Invariance 2: Accent-insensitive Vietnamese diacritics search and various search fields', async () => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace();

    const searchInput = await screen.findByTestId('admin-teacher-search-input');

    // Test A: No accent "dang quoc tuan" -> matches "Thầy Đặng Quốc Tuấn"
    fireEvent.change(searchInput, { target: { value: 'dang quoc tuan' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-tuan.dang@khongtunhi.com')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).not.toBeInTheDocument();
    });

    // Test B: Exact accented "Đặng Quốc Tuấn" -> matches
    fireEvent.change(searchInput, { target: { value: 'Đặng Quốc Tuấn' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-tuan.dang@khongtunhi.com')).toBeInTheDocument();
    });

    // Test C: Partial non-accented "lan huong" -> matches "Cô Vũ Thị Lan Hương"
    fireEvent.change(searchInput, { target: { value: 'lan huong' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-lanhuong.vu@khongtunhi.com')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-teacher-row-tuan.dang@khongtunhi.com')).not.toBeInTheDocument();
    });

    // Test D: Teacher Code "GV-KTN-01" -> matches "Cô Lâm Mỹ Linh"
    fireEvent.change(searchInput, { target: { value: 'GV-KTN-01' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });

    // Test E: Class code "YCT2-04" -> matches "Cô Lâm Mỹ Linh"
    fireEvent.change(searchInput, { target: { value: 'YCT2-04' } });
    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });
  });

  it('Invariance 3: Seamless 3-page pagination navigation across 45 teachers', async () => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace();

    // 1. Initial page 1: 1-20 of 45
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 1 / 3 · Hiển thị 1–20 / 45 giáo viên'
      );
    });
    const prevBtn = screen.getByTestId('teacher-search-prev-page');
    const nextBtn = screen.getByTestId('teacher-search-next-page');

    expect(prevBtn).toBeDisabled();
    expect(nextBtn).toBeEnabled();
    expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();

    // Allow mount debounce timer (220ms) to settle before pagination clicks
    await new Promise((r) => setTimeout(r, 260));

    // 2. Click Next -> Page 2: 21-40 of 45
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 2 / 3 · Hiển thị 21–40 / 45 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-gv21@khongtunhi.com')).toBeInTheDocument();
    });
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeEnabled();
    expect(screen.queryByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).not.toBeInTheDocument();

    // 3. Click Next -> Page 3: 41-45 of 45
    fireEvent.click(nextBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 3 / 3 · Hiển thị 41–45 / 45 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-gv45@khongtunhi.com')).toBeInTheDocument();
    });
    expect(prevBtn).toBeEnabled();
    expect(nextBtn).toBeDisabled();

    // 4. Click Prev -> Back to Page 2
    fireEvent.click(prevBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 2 / 3 · Hiển thị 21–40 / 45 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-gv21@khongtunhi.com')).toBeInTheDocument();
    });
  });

  it('Invariance 4: Clearing search restores full 45-item dataset and resets to Page 1', async () => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace();

    // Allow mount debounce timer (220ms) to settle
    await new Promise((r) => setTimeout(r, 260));

    // Navigate to page 2 first
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-next-page')).toBeInTheDocument();
    });
    fireEvent.click(screen.getByTestId('teacher-search-next-page'));
    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 2 / 3 · Hiển thị 21–40 / 45 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-gv21@khongtunhi.com')).toBeInTheDocument();
    });

    // Search for 'Lâm Mỹ Linh' -> filters to 1 item, page resets to 1
    const searchInput = screen.getByTestId('admin-teacher-search-input');
    fireEvent.change(searchInput, { target: { value: 'Lâm Mỹ Linh' } });

    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 1 / 1 · Hiển thị 1–1 / 1 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });

    // Clear search -> restores full 45 items and resets to page 1 (1–20)
    fireEvent.change(searchInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByTestId('teacher-search-pagination-summary')).toHaveTextContent(
        'Trang 1 / 3 · Hiển thị 1–20 / 45 giáo viên'
      );
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });
  });

  it('Invariance 5: Cross-tab navigation (students, classes, orders, teachers) operates without regressions', async () => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace('/admin/teachers');

    // 1. Initial teachers tab renders teachers section
    await waitFor(() => {
      expect(screen.getByTestId('admin-teachers-section')).toBeInTheDocument();
      expect(screen.getByTestId('admin-teacher-search-input')).toBeInTheDocument();
    });

    // 2. Switch to Students tab
    fireEvent.click(screen.getByTestId('admin-tab-students'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-search-input')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-teachers-section')).not.toBeInTheDocument();
    });

    // 3. Switch to Classes tab
    fireEvent.click(screen.getByTestId('admin-tab-classes'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-class-row-YCT2-04')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-teachers-section')).not.toBeInTheDocument();
    });

    // 4. Switch to Orders tab
    fireEvent.click(screen.getByTestId('admin-tab-orders'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-order-search-input')).toBeInTheDocument();
      expect(screen.queryByTestId('admin-teachers-section')).not.toBeInTheDocument();
    });

    // 5. Switch back to Teachers tab
    fireEvent.click(screen.getByTestId('admin-tab-teachers'));
    await waitFor(() => {
      expect(screen.getByTestId('admin-teachers-section')).toBeInTheDocument();
      expect(screen.getByTestId('admin-teacher-search-input')).toBeInTheDocument();
    });
  });

  it('Invariance 6: R1 & Scope M1 compliance (single create button, 5 columns, action buttons, mobile card)', async () => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      const { filterAndPaginateTeachersClientSide } = await import('@/services/api/ktnApiClient');
      return filterAndPaginateTeachersClientSide(mock45Teachers, params || {});
    });

    renderAdminWorkspace();

    await waitFor(() => {
      expect(screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
    });

    // Check A: Single "+ Tạo giáo viên" button on the entire page
    const createTeacherButtons = screen.getAllByRole('button', { name: /\+ Tạo giáo viên/i });
    expect(createTeacherButtons).toHaveLength(1);
    expect(createTeacherButtons[0]).toHaveAttribute('data-testid', 'admin-open-create-teacher-btn');

    // Check B: Exactly 5 desktop table columns: Tên, Email, Lớp đang phụ trách, Trạng thái, Thao tác
    const tableHeaders = screen.getAllByRole('columnheader');
    expect(tableHeaders).toHaveLength(5);
    expect(tableHeaders[0]).toHaveTextContent('Tên');
    expect(tableHeaders[1]).toHaveTextContent('Email');
    expect(tableHeaders[2]).toHaveTextContent('Lớp đang phụ trách');
    expect(tableHeaders[3]).toHaveTextContent('Trạng thái');
    expect(tableHeaders[4]).toHaveTextContent('Thao tác');

    // Check C: No visible "Số học viên" column header
    expect(screen.queryByRole('columnheader', { name: /số học viên/i })).toBeNull();

    // Check D: Desktop row has both "Xem / Sửa" and "Xóa" buttons
    const desktopOpenBtn = screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com');
    const desktopDeleteBtn = screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com');
    expect(desktopOpenBtn).toBeInTheDocument();
    expect(desktopOpenBtn).toHaveTextContent('Xem / Sửa');
    expect(desktopDeleteBtn).toBeInTheDocument();
    expect(desktopDeleteBtn).toHaveTextContent('Xóa');

    // Check E: Mobile card exists with "Xem / Sửa" and "Xóa"
    const mobileCard = screen.getByTestId('admin-teacher-mobile-card-linh.lam@khongtunhi.com');
    expect(mobileCard).toBeInTheDocument();
    const mobileOpenBtn = screen.getByTestId('admin-open-teacher-btn-mobile-linh.lam@khongtunhi.com');
    const mobileDeleteBtn = screen.getByTestId('admin-delete-teacher-btn-mobile-linh.lam@khongtunhi.com');
    expect(mobileOpenBtn).toBeInTheDocument();
    expect(mobileOpenBtn).toHaveTextContent('Xem / Sửa');
    expect(mobileDeleteBtn).toBeInTheDocument();
    expect(mobileDeleteBtn).toHaveTextContent('Xóa');

    // Check F: Clicking "Xem / Sửa" opens TeacherDetailDrawer
    fireEvent.click(desktopOpenBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
    });
  });
});
