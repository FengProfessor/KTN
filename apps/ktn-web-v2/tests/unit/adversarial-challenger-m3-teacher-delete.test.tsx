import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { ktnApi, KtnApiClient, KtnApiError } from '../../src/services/api/ktnApiClient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import type { KtnTeacherRecord } from '../../src/types/ktn.types';

describe('Adversarial Challenger M3: Teacher Delete UI & Zero-Reload Cache Integration', () => {
  let queryClient: QueryClient;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
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

    // Mock generic endpoints needed by AdminWorkspace
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2 Thiếu Nhi',
        teacher_code: 'GV-KTN-08',
        teacher_name: 'Cô Lâm Mỹ Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
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

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // FOCUS 1: API CONTRACT & EDGE CASES (ktnApi.deleteTeacher & KtnApiClient)
  // =========================================================================
  describe('Focus 1: API Contract & Parameter Permutations', () => {
    it('1.1. calls DELETE with { teacherId } only: formats query param and JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          deleted: true,
          teacherId: 'GV-KTN-08',
          teacherEmail: 'linh.lam@khongtunhi.com',
          message: 'Đã xóa giáo viên thành công.',
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await ktnApi.deleteTeacher({ teacherId: 'GV-KTN-08' });

      expect(res.ok).toBe(true);
      expect(res.deleted).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/ktn/teachers?teacherId=GV-KTN-08');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ teacherId: 'GV-KTN-08' });
    });

    it('1.2. calls DELETE with { email } only: properly URL-encodes email param and sends JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          deleted: true,
          teacherEmail: 'linh.lam@khongtunhi.com',
          message: 'Đã xóa giáo viên thành công.',
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await ktnApi.deleteTeacher({ email: 'linh.lam@khongtunhi.com' });

      expect(res.ok).toBe(true);
      expect(mockFetch).toHaveBeenCalledTimes(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/ktn/teachers?email=linh.lam%40khongtunhi.com');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ email: 'linh.lam@khongtunhi.com' });
    });

    it('1.3. calls DELETE with { code } only: formats query param and JSON body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          deleted: true,
          teacherId: 'GV-02',
          message: 'Đã xóa giáo viên thành công.',
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await ktnApi.deleteTeacher({ code: 'GV-02' });

      expect(res.ok).toBe(true);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('/api/ktn/teachers?code=GV-02');
      expect(init.method).toBe('DELETE');
      expect(JSON.parse(init.body)).toEqual({ code: 'GV-02' });
    });

    it('1.4. calls DELETE with combinations ({ teacherId, code, email }): includes all in query and body', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          ok: true,
          deleted: true,
          teacherId: 'GV-KTN-08',
          teacherEmail: 'linh.lam@khongtunhi.com',
          unassignedClassesCount: 1,
          unassignedClasses: ['YCT2-04'],
          sessionRevoked: true,
          syncStatus: 'synced',
          message: 'Đã xóa giáo viên thành công.',
        }),
      });
      globalThis.fetch = mockFetch;

      const res = await ktnApi.deleteTeacher({
        teacherId: 'GV-KTN-08',
        code: 'GV-KTN-08',
        email: 'linh.lam@khongtunhi.com',
      });

      expect(res.ok).toBe(true);
      expect(res.unassignedClassesCount).toBe(1);
      const [url, init] = mockFetch.mock.calls[0];
      expect(url).toContain('teacherId=GV-KTN-08');
      expect(url).toContain('code=GV-KTN-08');
      expect(url).toContain('email=linh.lam%40khongtunhi.com');
      expect(JSON.parse(init.body)).toEqual({
        teacherId: 'GV-KTN-08',
        code: 'GV-KTN-08',
        email: 'linh.lam@khongtunhi.com',
      });
    });

    it('1.5. throws KtnApiError (status 400, MISSING_TEACHER_IDENTIFIER) when no identifiers are provided', async () => {
      await expect(ktnApi.deleteTeacher({})).rejects.toThrowError(KtnApiError);
      await expect(ktnApi.deleteTeacher({ teacherId: '   ' })).rejects.toThrowError(
        'Vui lòng cung cấp mã giáo viên (code) hoặc email hợp lệ để xóa.'
      );
      await expect(ktnApi.deleteTeacher({ teacherId: '', code: '', email: '' })).rejects.toMatchObject({
        status: 400,
        code: 'MISSING_TEACHER_IDENTIFIER',
      });
    });

    it('1.6. handles non-200 HTTP responses: 401 Unauthorized propagates backend error and message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          ok: false,
          error: 'AUTH_REQUIRED',
          message: 'Vui lòng đăng nhập với quyền Admin.',
        }),
      });

      await expect(ktnApi.deleteTeacher({ teacherId: 'GV-01' })).rejects.toMatchObject({
        status: 401,
        code: 'AUTH_REQUIRED',
        message: 'Vui lòng đăng nhập với quyền Admin.',
      });
    });

    it('1.7. handles non-200 HTTP responses: 403 Forbidden propagates backend error and message', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          ok: false,
          error: 'ADMIN_ONLY',
          message: 'Chỉ Admin mới có quyền xóa giáo viên.',
        }),
      });

      await expect(ktnApi.deleteTeacher({ teacherId: 'GV-01' })).rejects.toMatchObject({
        status: 403,
        code: 'ADMIN_ONLY',
        message: 'Chỉ Admin mới có quyền xóa giáo viên.',
      });
    });

    it('1.8. handles non-200 HTTP responses: 404 Not Found propagates backend error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({
          ok: false,
          error: 'TEACHER_NOT_FOUND',
          message: 'Không tìm thấy giáo viên với mã hoặc email đã cung cấp.',
        }),
      });

      await expect(ktnApi.deleteTeacher({ email: 'unknown@ktn.com' })).rejects.toMatchObject({
        status: 404,
        code: 'TEACHER_NOT_FOUND',
        message: 'Không tìm thấy giáo viên với mã hoặc email đã cung cấp.',
      });
    });

    it('1.9. handles non-200 HTTP responses: 502 Database Error propagates backend error', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({
          ok: false,
          error: 'DATABASE_ERROR',
          message: 'Lỗi cập nhật cơ sở dữ liệu khi xóa giáo viên.',
        }),
      });

      await expect(ktnApi.deleteTeacher({ teacherId: 'GV-01' })).rejects.toMatchObject({
        status: 502,
        code: 'DATABASE_ERROR',
        message: 'Lỗi cập nhật cơ sở dữ liệu khi xóa giáo viên.',
      });
    });

    it('1.10. handles network connection drops (fetch throws): transforms into NETWORK_ERROR', async () => {
      globalThis.fetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

      await expect(ktnApi.deleteTeacher({ teacherId: 'GV-01' })).rejects.toMatchObject({
        status: 0,
        code: 'NETWORK_ERROR',
        isNetworkError: true,
        message: 'Mất kết nối mạng hoặc máy chủ không phản hồi.',
      });
    });

    it('1.11. verifies KtnApiClient class instance has deleteTeacher method with exact parity', async () => {
      const client = new KtnApiClient();
      expect(typeof client.deleteTeacher).toBe('function');

      const spy = vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        message: 'Mock deleted',
      });

      const result = await client.deleteTeacher({ teacherId: 'GV-PARITY' });
      expect(spy).toHaveBeenCalledWith({ teacherId: 'GV-PARITY' });
      expect(result.ok).toBe(true);
    });
  });

  // =========================================================================
  // FOCUS 2: UI EDGE CASES & SINGLE-STEP CONFIRMATION MODAL
  // =========================================================================
  describe('Focus 2: UI Confirmation Dialog, Cancellation, Double-Click & Drawer State', () => {
    const mockTeacherWithClasses: KtnTeacherRecord = {
      code: 'GV-KTN-08',
      name: 'Cô Lâm Mỹ Linh',
      email: 'linh.lam@khongtunhi.com',
      phone: '0901234567',
      specialty: 'YCT & Thiếu nhi',
      assigned_classes: ['YCT2-04', 'HSK1-01'],
      assigned_courses: [],
      active: true,
      status: 'active',
    };

    const mockTeacherWithoutClasses: KtnTeacherRecord = {
      code: 'GV-KTN-09',
      name: 'Thầy Trần Văn An',
      email: 'an.tran@khongtunhi.com',
      phone: '0909888777',
      specialty: 'Giao tiếp',
      assigned_classes: [],
      assigned_courses: [],
      active: true,
      status: 'active',
    };

    const renderAdminWorkspace = (teachers: KtnTeacherRecord[]) => {
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: teachers,
        totalCount: teachers.length,
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

    it('2.1. Desktop table: clicking Xóa opens single-step confirmation modal with dynamic warning banner for assigned classes', async () => {
      renderAdminWorkspace([mockTeacherWithClasses]);

      const deleteBtn = await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com');
      expect(deleteBtn).toBeInTheDocument();

      fireEvent.click(deleteBtn);

      // Modal is open
      const modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveTextContent('Xóa giáo viên Cô Lâm Mỹ Linh?');
      expect(modal).toHaveTextContent('linh.lam@khongtunhi.com · GV-KTN-08');

      // Dynamic warning banner must be visible because assigned_classes > 0
      const warningBanner = screen.getByTestId('delete-teacher-classes-warning');
      expect(warningBanner).toBeInTheDocument();
      expect(warningBanner).toHaveTextContent('Sẽ gỡ phân công khỏi 2 lớp (YCT2-04, HSK1-01).');
      expect(warningBanner).toHaveTextContent('Chưa phân công giáo viên');

      // Strictly single-step: NO input field for typing email/code
      expect(modal.querySelector('input')).toBeNull();
    });

    it('2.2. Modal without assigned classes: omits dynamic warning banner', async () => {
      renderAdminWorkspace([mockTeacherWithoutClasses]);

      const deleteBtn = await screen.findByTestId('admin-delete-teacher-btn-an.tran@khongtunhi.com');
      fireEvent.click(deleteBtn);

      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      expect(screen.queryByTestId('delete-teacher-classes-warning')).not.toBeInTheDocument();
    });

    it('2.3. Mobile card (<768px): clicking Xóa button opens modal with identical contract', async () => {
      renderAdminWorkspace([mockTeacherWithClasses]);

      const mobileDeleteBtn = await screen.findByTestId('admin-delete-teacher-btn-mobile-linh.lam@khongtunhi.com');
      expect(mobileDeleteBtn).toBeInTheDocument();

      fireEvent.click(mobileDeleteBtn);

      const modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toBeInTheDocument();
      expect(modal).toHaveTextContent('Xóa giáo viên Cô Lâm Mỹ Linh?');
    });

    it('2.4. Cancellation flow: clicking "Hủy" closes modal without executing delete mutation', async () => {
      const deleteSpy = vi.spyOn(ktnApi, 'deleteTeacher');
      renderAdminWorkspace([mockTeacherWithClasses]);

      fireEvent.click(await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com'));
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      fireEvent.click(cancelBtn);

      // Modal must be dismissed
      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('2.5. Cancellation flow: clicking close icon "X" closes modal without executing mutation', async () => {
      const deleteSpy = vi.spyOn(ktnApi, 'deleteTeacher');
      renderAdminWorkspace([mockTeacherWithClasses]);

      fireEvent.click(await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com'));
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      const closeIconBtn = screen.getByLabelText('Đóng hộp thoại xóa giáo viên');
      fireEvent.click(closeIconBtn);

      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      expect(deleteSpy).not.toHaveBeenCalled();
    });

    it('2.6. Empirical check on backdrop click: verifies whether clicking backdrop overlay closes modal', async () => {
      renderAdminWorkspace([mockTeacherWithClasses]);

      fireEvent.click(await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com'));
      const modalOverlay = screen.getByTestId('admin-delete-teacher-modal');
      expect(modalOverlay).toBeInTheDocument();

      // Click outer overlay (backdrop)
      fireEvent.click(modalOverlay);

      // Observation: Does the modal close on backdrop click?
      // Since modalOverlay does not have an onClick handler, it will remain open.
      const isStillOpen = screen.queryByTestId('admin-delete-teacher-modal') !== null;
      // We assert empirical state:
      expect(isStillOpen).toBe(true);
    });

    it('2.7. Rapid double-click protection: button is disabled while mutation is pending and does NOT invoke duplicate mutations', async () => {
      let resolveMutation: (val: any) => void;
      const deferredPromise = new Promise((resolve) => {
        resolveMutation = resolve;
      });

      const deleteSpy = vi.spyOn(ktnApi, 'deleteTeacher').mockImplementation(() => deferredPromise as any);
      renderAdminWorkspace([mockTeacherWithClasses]);

      fireEvent.click(await screen.findByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com'));
      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');

      // First click: triggers mutation
      fireEvent.click(confirmBtn);

      // Verify button enters disabled loading state
      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
        expect(confirmBtn).toHaveTextContent('Đang xóa giáo viên...');
      });

      // Second rapid click while disabled
      fireEvent.click(confirmBtn);

      // Verify deleteTeacher was called exactly ONCE
      expect(deleteSpy).toHaveBeenCalledTimes(1);

      // Resolve mutation to clean up
      resolveMutation!({
        ok: true,
        deleted: true,
        message: 'Deleted',
      });

      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });
    });

    it('2.8. Zero-reload UI cache update: deletes teacher, removes row from table without page reload (F5)', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherId: 'GV-KTN-08',
        teacherEmail: 'linh.lam@khongtunhi.com',
        unassignedClassesCount: 2,
        unassignedClasses: ['YCT2-04', 'HSK1-01'],
        message: 'Đã xóa giáo viên Lâm Mỹ Linh',
      });

      renderAdminWorkspace([mockTeacherWithClasses, mockTeacherWithoutClasses]);

      expect(await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).toBeInTheDocument();
      expect(screen.getByTestId('admin-teacher-row-an.tran@khongtunhi.com')).toBeInTheDocument();

      fireEvent.click(screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com'));
      fireEvent.click(screen.getByTestId('confirm-delete-teacher-btn'));

      // Optimistic cache update removes teacher from table
      await waitFor(() => {
        expect(screen.queryByTestId('admin-teacher-row-linh.lam@khongtunhi.com')).not.toBeInTheDocument();
        expect(screen.getByTestId('admin-teacher-row-an.tran@khongtunhi.com')).toBeInTheDocument();
      });
    });

    it('2.9. Non-matching drawer state: deleting Teacher B does NOT close Teacher A profile drawer', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherEmail: 'an.tran@khongtunhi.com',
        message: 'Đã xóa giáo viên An',
      });

      renderAdminWorkspace([mockTeacherWithClasses, mockTeacherWithoutClasses]);

      // 1. Open Teacher A (Lâm Mỹ Linh) in detail drawer by clicking row
      const rowA = await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com');
      fireEvent.click(rowA);

      // Drawer is open for Teacher A
      expect(await screen.findByTestId('teacher-detail-drawer')).toBeInTheDocument();

      // 2. Click Delete on Teacher B (Trần Văn An)
      const deleteBtnB = screen.getByTestId('admin-delete-teacher-btn-an.tran@khongtunhi.com');
      fireEvent.click(deleteBtnB);

      // Confirm deletion of Teacher B
      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      fireEvent.click(confirmBtn);

      // Wait for mutation to finish
      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });

      // Verify: Teacher A drawer is STILL OPEN!
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
      expect(screen.getByTestId('teacher-detail-drawer')).toHaveTextContent('Cô Lâm Mỹ Linh');
    });

    it('2.10. Matching drawer state: deleting Teacher A auto-closes Teacher A profile drawer', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherEmail: 'linh.lam@khongtunhi.com',
        message: 'Đã xóa giáo viên Linh',
      });

      renderAdminWorkspace([mockTeacherWithClasses]);

      // Open Teacher A
      const rowA = await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com');
      fireEvent.click(rowA);
      expect(await screen.findByTestId('teacher-detail-drawer')).toBeInTheDocument();

      // Delete Teacher A
      const deleteBtnA = screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com');
      fireEvent.click(deleteBtnA);

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      fireEvent.click(confirmBtn);

      // Drawer must be closed
      await waitFor(() => {
        expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
      });
    });

    it('2.11. Detail Drawer Tab 6 (Account): "Xóa giáo viên này" triggers delete confirmation modal', async () => {
      renderAdminWorkspace([mockTeacherWithClasses]);

      // Open drawer for Teacher
      fireEvent.click(await screen.findByTestId('admin-teacher-row-linh.lam@khongtunhi.com'));
      expect(await screen.findByTestId('teacher-detail-drawer')).toBeInTheDocument();

      // Switch to Tab 6 ("Tài khoản & phân quyền")
      const tab6Btn = screen.getByTestId('teacher-drawer-tab-account');
      fireEvent.click(tab6Btn);

      // Danger zone button "Xóa giáo viên này"
      const drawerDeleteBtn = screen.getByTestId('admin-drawer-delete-teacher-btn');
      expect(drawerDeleteBtn).toBeInTheDocument();
      expect(drawerDeleteBtn).toHaveTextContent('Xóa giáo viên này');

      // Click button in drawer
      fireEvent.click(drawerDeleteBtn);

      // Modal opens
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      expect(screen.getByTestId('admin-delete-teacher-modal')).toHaveTextContent('Xóa giáo viên Cô Lâm Mỹ Linh?');
    });
  });

  // =========================================================================
  // FOCUS 3: MOBILE LAYOUT (390PX VIEWPORT) & DOM/Z-INDEX HIERARCHY ANALYSIS
  // =========================================================================
  describe('Focus 3: Mobile Viewport 390px & Stacking Analysis', () => {
    it('3.1. Mobile layout classes: modal uses responsive max-w-md w-full with p-4 inset-0 overlay', async () => {
      useUiStore.setState({ isDemoMode: false });
      const teacher: KtnTeacherRecord = {
        code: 'GV-390',
        name: 'Thầy Di Động',
        email: 'mobile@ktn.com',
        active: true,
        status: 'active',
        assigned_classes: ['LỚP-1'],
      };

      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [teacher],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <AdminWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Open modal
      fireEvent.click(await screen.findByTestId('admin-delete-teacher-btn-mobile-mobile@ktn.com'));
      const modalOverlay = screen.getByTestId('admin-delete-teacher-modal');
      expect(modalOverlay).toHaveClass('fixed', 'inset-0', 'z-[60]', 'flex', 'items-center', 'justify-center', 'p-4');

      const modalDialog = modalOverlay.firstElementChild;
      expect(modalDialog).toHaveClass('w-full', 'max-w-md', 'rounded-2xl', 'p-5');

      // Buttons container
      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      expect(cancelBtn.parentElement).toHaveClass('flex', 'items-center', 'justify-end', 'gap-2');
    });

    it('3.2. Stacking order analysis: modal vs TeacherDetailDrawer z-index coexistence', async () => {
      useUiStore.setState({ isDemoMode: false });
      const teacher: KtnTeacherRecord = {
        code: 'GV-STACK',
        name: 'Cô Stacking Test',
        email: 'stack@ktn.com',
        active: true,
        status: 'active',
        assigned_classes: ['STACK-01'],
      };

      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        ok: true,
        items: [teacher],
        totalCount: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
      });

      render(
        <QueryClientProvider client={queryClient}>
          <MemoryRouter initialEntries={['/admin/teachers']}>
            <AdminWorkspace />
          </MemoryRouter>
        </QueryClientProvider>
      );

      // Open drawer first
      fireEvent.click(await screen.findByTestId('admin-teacher-row-stack@ktn.com'));
      const drawer = await screen.findByTestId('teacher-detail-drawer');
      expect(drawer).toBeInTheDocument();

      // Open Tab 6 and click delete
      fireEvent.click(screen.getByTestId('teacher-drawer-tab-account'));
      fireEvent.click(screen.getByTestId('admin-drawer-delete-teacher-btn'));

      // Both modal and drawer are present in DOM
      const modal = screen.getByTestId('admin-delete-teacher-modal');
      const drawerRoot = screen.getByTestId('teacher-detail-drawer-root');
      expect(modal).toBeInTheDocument();
      expect(drawerRoot).toBeInTheDocument();

      // Check z-index classes: modal has z-[60] elevating it above drawer (z-50)
      expect(modal.className).toContain('z-[60]');
      expect(drawerRoot.className).toContain('z-50');

      // Check document order: drawerRoot is rendered AFTER modal in DOM tree
      const position = modal.compareDocumentPosition(drawerRoot);
      expect(position & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });
  });
});
