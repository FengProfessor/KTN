import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { ktnApi } from '../../src/services/api/ktnApiClient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import type { KtnTeacherRecord } from '../../src/types/ktn.types';

describe('Adversarial M1 Stress Tests: Teacher List UI Edge Cases & Invariants', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
      },
    });

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

    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2 Thiếu Nhi',
        teacher_code: 'GV-01',
        teacher_name: 'Cô Linh',
        teacher_email: 'linh@ktn.com',
        total_lessons: 20,
        current_lesson: 3,
        schedule: 'Thứ 2, 4',
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
      ok: true,
      requests: [],
      pendingCount: 0,
    });
    vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({
      ok: true,
      checkedAt: new Date().toISOString(),
      summary: { totalStudents: 0, unsyncedStudents: 0, lastSyncSuccess: true },
    } as any);
  });

  const renderWorkspace = (customTeachers: KtnTeacherRecord[]) => {
    vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
      ok: true,
      items: customTeachers,
      totalCount: customTeachers.length,
      limit: 20,
      offset: 0,
      hasMore: false,
    });

    return render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/teachers']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );
  };

  it('Edge Case 1: handles 0 assigned classes cleanly (displays "Chưa phân công lớp" on desktop and "Chưa phân công" on mobile)', async () => {
    const zeroClassTeachers: KtnTeacherRecord[] = [
      {
        code: 'GV-ZERO-1',
        name: 'Thầy Chưa Có Lớp A',
        email: 'zeroclassA@khongtunhi.com',
        phone: '0901234567',
        specialty: 'Sơ cấp',
        assigned_classes: [],
        assigned_courses: [],
        active: true,
        status: 'active',
      },
      {
        code: 'GV-ZERO-2',
        name: 'Cô Chưa Có Lớp B (undefined array)',
        email: 'zeroclassB@khongtunhi.com',
        phone: '0901234568',
        specialty: 'Trung cấp',
        assigned_classes: undefined as any,
        assigned_courses: [],
        active: true,
        status: 'active',
      },
    ];

    renderWorkspace(zeroClassTeachers);

    // Desktop assertions
    const desktopRowA = await screen.findByTestId('admin-teacher-row-zeroclassA@khongtunhi.com');
    expect(desktopRowA).toBeInTheDocument();
    expect(within(desktopRowA).getByText('Chưa phân công lớp')).toBeInTheDocument();
    expect(within(desktopRowA).getByText('0 lớp')).toBeInTheDocument();

    const desktopRowB = await screen.findByTestId('admin-teacher-row-zeroclassB@khongtunhi.com');
    expect(desktopRowB).toBeInTheDocument();
    expect(within(desktopRowB).getByText('Chưa phân công lớp')).toBeInTheDocument();
    expect(within(desktopRowB).getByText('0 lớp')).toBeInTheDocument();

    // Mobile card assertions
    const mobileCardA = screen.getByTestId('admin-teacher-mobile-card-zeroclassA@khongtunhi.com');
    expect(mobileCardA).toBeInTheDocument();
    expect(within(mobileCardA).getByText('Chưa phân công')).toBeInTheDocument();

    const mobileCardB = screen.getByTestId('admin-teacher-mobile-card-zeroclassB@khongtunhi.com');
    expect(mobileCardB).toBeInTheDocument();
    expect(within(mobileCardB).getByText('Chưa phân công')).toBeInTheDocument();
  });

  it('Edge Case 2: handles many assigned classes (5+ classes) and wraps cleanly', async () => {
    const manyClasses = [
      'HSK1-01',
      'HSK1-02',
      'HSK2-01',
      'HSK2-02',
      'YCT1-01',
      'YCT2-01',
      'YCT3-01',
      'COMM-01',
    ];

    const teacherWithManyClasses: KtnTeacherRecord[] = [
      {
        code: 'GV-BUSY',
        name: 'Thầy Quá Tải',
        email: 'busyteacher@khongtunhi.com',
        phone: '0909999999',
        specialty: 'Toàn năng',
        assigned_classes: manyClasses,
        assigned_courses: ['HSK1-ONLINE'],
        active: true,
        status: 'active',
      },
    ];

    renderWorkspace(teacherWithManyClasses);

    // Desktop assertions
    const row = await screen.findByTestId('admin-teacher-row-busyteacher@khongtunhi.com');
    expect(within(row).getByText('8 lớp')).toBeInTheDocument();
    manyClasses.forEach((cls) => {
      expect(within(row).getByText(cls)).toBeInTheDocument();
    });

    // Mobile assertions
    const mobileCard = screen.getByTestId('admin-teacher-mobile-card-busyteacher@khongtunhi.com');
    expect(mobileCard).toBeInTheDocument();
    expect(within(mobileCard).getByText(manyClasses.join(', '))).toBeInTheDocument();
  });

  it('Edge Case 3: handles pathologically long teacher names and emails with truncation classes', async () => {
    const longName =
      'Cô Nguyễn Thị Hoàng Mai Chi Lan Phương Vy Ngọc Bích Thảo Linh Giang Hân';
    const longEmail =
      'supercalifragilisticexpialidocious.verylongteacheremailaddress@khongtunhi.com';

    const longTeacher: KtnTeacherRecord[] = [
      {
        code: 'GV-LONG',
        name: longName,
        email: longEmail,
        phone: '0901234567',
        specialty: 'Khẩu ngữ',
        assigned_classes: ['YCT1-01'],
        assigned_courses: [],
        active: true,
        status: 'active',
      },
    ];

    renderWorkspace(longTeacher);

    // Mobile card check for truncation styles
    const mobileCard = await screen.findByTestId(`admin-teacher-mobile-card-${longEmail}`);
    expect(mobileCard).toBeInTheDocument();

    const nameSpan = within(mobileCard).getByText(longName);
    expect(nameSpan.className).toContain('truncate');

    const emailDiv = within(mobileCard).getByText(longEmail);
    expect(emailDiv.className).toContain('truncate');

    // Desktop row check
    const desktopRow = screen.getByTestId(`admin-teacher-row-${longEmail}`);
    expect(desktopRow).toBeInTheDocument();
    expect(within(desktopRow).getByText(longName)).toBeInTheDocument();
    expect(within(desktopRow).getByText(longEmail)).toBeInTheDocument();
  });

  it('Edge Case 4: Event propagation — clicking "Xem / Sửa" opens drawer, clicking "Xóa" stops propagation', async () => {
    const teacher: KtnTeacherRecord = {
      code: 'GV-CLICK-TEST',
      name: 'Cô Test Click',
      email: 'clicktest@khongtunhi.com',
      phone: '0901234567',
      specialty: 'Sơ cấp',
      assigned_classes: ['YCT2-04'],
      assigned_courses: [],
      active: true,
      status: 'active',
    };

    renderWorkspace([teacher]);

    await screen.findByTestId('admin-teacher-row-clicktest@khongtunhi.com');

    // 1. Desktop: Clicking "Xóa" stops propagation — drawer must NOT open
    const desktopDeleteBtn = screen.getByTestId('admin-delete-teacher-btn-clicktest@khongtunhi.com');
    fireEvent.click(desktopDeleteBtn);
    expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();

    // 2. Desktop: Clicking "Xem / Sửa" opens drawer
    const desktopOpenBtn = screen.getByTestId('admin-open-teacher-btn-clicktest@khongtunhi.com');
    fireEvent.click(desktopOpenBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
    });

    // Close drawer via backdrop click
    const backdrop = document.querySelector('.bg-stone-950\\/40');
    expect(backdrop).not.toBeNull();
    fireEvent.click(backdrop!);
    await waitFor(() => {
      expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
    });

    // 3. Mobile: Clicking "Xóa" stops propagation — drawer must NOT open
    const mobileDeleteBtn = screen.getByTestId('admin-delete-teacher-btn-mobile-clicktest@khongtunhi.com');
    fireEvent.click(mobileDeleteBtn);
    expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();

    // 4. Mobile: Clicking "Xem / Sửa" opens drawer
    const mobileOpenBtn = screen.getByTestId('admin-open-teacher-btn-mobile-clicktest@khongtunhi.com');
    fireEvent.click(mobileOpenBtn);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
    });

    // Close drawer again via backdrop
    const backdrop2 = document.querySelector('.bg-stone-950\\/40');
    expect(backdrop2).not.toBeNull();
    fireEvent.click(backdrop2!);
    await waitFor(() => {
      expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
    });

    // 5. Mobile: Clicking entire mobile card also opens drawer
    const mobileCard = screen.getByTestId('admin-teacher-mobile-card-clicktest@khongtunhi.com');
    fireEvent.click(mobileCard);
    await waitFor(() => {
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
    });
  });

  it('Edge Case 5: Button deduplication — exactly 1 "+ Tạo giáo viên" button exists across the entire rendered page', async () => {
    const teacher: KtnTeacherRecord = {
      code: 'GV-BTN-COUNT',
      name: 'Thầy Kiểm Tra Nút',
      email: 'btncount@khongtunhi.com',
      phone: '0901234567',
      specialty: 'Sơ cấp',
      assigned_classes: ['YCT2-04'],
      assigned_courses: [],
      active: true,
      status: 'active',
    };

    renderWorkspace([teacher]);

    await screen.findByTestId('admin-teacher-row-btncount@khongtunhi.com');

    // Query all buttons containing "+ Tạo giáo viên"
    const allCreateButtons = screen.getAllByRole('button', {
      name: /\+\s*Tạo giáo viên/i,
    });

    expect(allCreateButtons).toHaveLength(1);
    expect(allCreateButtons[0]).toHaveAttribute('data-testid', 'admin-open-create-teacher-btn');

    // Clicking it opens the create teacher modal
    fireEvent.click(allCreateButtons[0]);
    expect(
      screen.getByRole('button', { name: /Đóng cửa sổ tạo giáo viên/i })
    ).toBeInTheDocument();
  });

  it('Edge Case 6: Desktop Table column architecture (5 clean columns, no visible "Số học viên" header or cells)', async () => {
    const teacher: KtnTeacherRecord = {
      code: 'GV-COLS',
      name: 'Cô Cột Bảng',
      email: 'columns@khongtunhi.com',
      phone: '0901234567',
      specialty: 'Thương mại',
      assigned_classes: ['HSK1-01'],
      assigned_courses: [],
      active: true,
      status: 'active',
      managedStudentsCount: 15,
    };

    renderWorkspace([teacher]);

    await screen.findByTestId('admin-teacher-row-columns@khongtunhi.com');

    // Desktop table header check
    const thElements = screen.getAllByRole('columnheader');
    const headerTexts = thElements.map((th) => th.textContent?.trim());

    expect(headerTexts).toEqual([
      'Tên',
      'Email',
      'Lớp đang phụ trách',
      'Trạng thái',
      'Thao tác',
    ]);
    expect(thElements).toHaveLength(5);

    // "Số học viên" header is strictly absent
    expect(screen.queryByRole('columnheader', { name: /Số học viên/i })).toBeNull();

    // Verify deep stats are placed inside sr-only container
    const srOnlyContainer = document.querySelector('div.sr-only');
    expect(srOnlyContainer).not.toBeNull();
    expect(srOnlyContainer?.textContent).toContain('Học viên phụ trách: 15 HV');
  });

  it('Edge Case 7: Teacher status mapping matrix (active vs locked/suspended/inactive)', async () => {
    const statusTeachers: KtnTeacherRecord[] = [
      {
        code: 'GV-STATUS-1',
        name: 'Giáo viên Hoạt Động',
        email: 'active@khongtunhi.com',
        phone: '0901111111',
        specialty: 'Khẩu ngữ',
        assigned_classes: [],
        assigned_courses: [],
        active: true,
        status: 'active',
      },
      {
        code: 'GV-STATUS-2',
        name: 'Giáo viên Tạm Khóa (active=false)',
        email: 'inactive_flag@khongtunhi.com',
        phone: '0902222222',
        specialty: 'HSK',
        assigned_classes: [],
        assigned_courses: [],
        active: false,
        status: 'active',
      },
      {
        code: 'GV-STATUS-3',
        name: 'Giáo viên Suspended',
        email: 'suspended@khongtunhi.com',
        phone: '0903333333',
        specialty: 'HSK',
        assigned_classes: [],
        assigned_courses: [],
        active: true,
        status: 'suspended',
      },
      {
        code: 'GV-STATUS-4',
        name: 'Giáo viên Locked',
        email: 'locked@khongtunhi.com',
        phone: '0904444444',
        specialty: 'HSK',
        assigned_classes: [],
        assigned_courses: [],
        active: true,
        status: 'locked',
      },
    ];

    renderWorkspace(statusTeachers);

    await screen.findByTestId('admin-teacher-row-active@khongtunhi.com');

    // Desktop row checks
    const activeRow = screen.getByTestId('admin-teacher-row-active@khongtunhi.com');
    expect(within(activeRow).getByText('Đang hoạt động')).toBeInTheDocument();

    const inactiveRow = screen.getByTestId('admin-teacher-row-inactive_flag@khongtunhi.com');
    expect(within(inactiveRow).getByText('Tạm khóa')).toBeInTheDocument();

    const suspendedRow = screen.getByTestId('admin-teacher-row-suspended@khongtunhi.com');
    expect(within(suspendedRow).getByText('Tạm khóa')).toBeInTheDocument();

    const lockedRow = screen.getByTestId('admin-teacher-row-locked@khongtunhi.com');
    expect(within(lockedRow).getByText('Tạm khóa')).toBeInTheDocument();

    // Mobile card checks
    const activeCard = screen.getByTestId('admin-teacher-mobile-card-active@khongtunhi.com');
    expect(within(activeCard).getByText('Đang hoạt động')).toBeInTheDocument();

    const inactiveCard = screen.getByTestId('admin-teacher-mobile-card-inactive_flag@khongtunhi.com');
    expect(within(inactiveCard).getByText('Tạm khóa')).toBeInTheDocument();

    const suspendedCard = screen.getByTestId('admin-teacher-mobile-card-suspended@khongtunhi.com');
    expect(within(suspendedCard).getByText('Tạm khóa')).toBeInTheDocument();

    const lockedCard = screen.getByTestId('admin-teacher-mobile-card-locked@khongtunhi.com');
    expect(within(lockedCard).getByText('Tạm khóa')).toBeInTheDocument();
  });

  it('Edge Case 8: Empty teacher search result gracefully displays empty state placeholder', async () => {
    renderWorkspace([]);

    expect(await screen.findByText('Chưa có giáo viên phù hợp.')).toBeInTheDocument();
    expect(screen.queryByTestId('admin-teacher-mobile-list')).not.toBeInTheDocument();
  });

  it('Edge Case 9: Extreme assigned classes volume (30 classes) wraps without crashing', async () => {
    const thirtyClasses = Array.from({ length: 30 }, (_, i) => `CLASS-${String(i + 1).padStart(2, '0')}`);
    const heavyTeacher: KtnTeacherRecord = {
      code: 'GV-30-CLASSES',
      name: 'Thầy Dạy 30 Lớp',
      email: 'thirty@khongtunhi.com',
      phone: '0901234567',
      specialty: 'Khẩu ngữ',
      assigned_classes: thirtyClasses,
      assigned_courses: [],
      active: true,
      status: 'active',
    };

    renderWorkspace([heavyTeacher]);

    const row = await screen.findByTestId('admin-teacher-row-thirty@khongtunhi.com');
    expect(within(row).getByText('30 lớp')).toBeInTheDocument();
    thirtyClasses.forEach((cls) => {
      expect(within(row).getByText(cls)).toBeInTheDocument();
    });

    const mobileCard = screen.getByTestId('admin-teacher-mobile-card-thirty@khongtunhi.com');
    expect(within(mobileCard).getByText(thirtyClasses.join(', '))).toBeInTheDocument();
  });
});

