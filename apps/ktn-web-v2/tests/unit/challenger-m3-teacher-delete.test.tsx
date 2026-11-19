import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import {
  ktnApi,
  KtnApiClient,
  filterAndPaginateTeachersClientSide,
  KtnApiError,
  type KtnTeacherDeleteResult,
} from '../../src/services/api/ktnApiClient';
import { TeacherDetailDrawer } from '../../src/features/admin/components/TeacherDetailDrawer';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import type { KtnTeacherRecord, KtnClassItem, KtnStudentRecord } from '../../src/types/ktn.types';

function createTestTeachers(): KtnTeacherRecord[] {
  return [
    {
      id: 'teacher-01',
      code: 'GV-KTN-01',
      name: 'Cô Lâm Mỹ Linh',
      email: 'linh.lam@khongtunhi.com',
      phone: '0901112201',
      specialty: 'HSK 1-4, YCT thiếu nhi',
      assigned_classes: ['YCT2-04'],
      assigned_courses: ['course-101'],
      active: true,
      status: 'active',
      managedStudentsCount: 12,
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
    },
    {
      id: 'teacher-02',
      code: 'GV-KTN-02',
      name: 'Thầy Đặng Quốc Tuấn',
      email: 'tuan.dang@khongtunhi.com',
      phone: '0901112202',
      specialty: 'Giao tiếp thương mại',
      assigned_classes: [], // 0 assigned classes
      assigned_courses: [],
      active: true,
      status: 'active',
      managedStudentsCount: 0,
      stats: {
        scheduledSessionsCount: 5,
        confirmedTaughtSessionsCount: 5,
        cancelledOrSubstituteSessionsCount: 0,
        submissionsReviewedCount: 10,
        pendingGradingCount: 0,
        forumAnswersCount: 2,
        acceptedAnswersCount: 1,
        videoAnswersCount: 0,
        totalContributionPoints: 30,
        unverifiedTeachingLog: false,
        avgGradingHours: 1,
      },
    },
    {
      id: 'teacher-03',
      code: 'GV-KTN-03',
      name: 'Cô Vũ Thị Lan Hương',
      email: 'lanhuong.vu@khongtunhi.com',
      phone: '0901112203',
      specialty: 'HSK 5-6 cao cấp',
      assigned_classes: ['HSK1-01', 'HSK2-02', 'HSK3-03'], // 3 assigned classes
      assigned_courses: ['course-101', 'course-102'],
      active: true,
      status: 'active',
      managedStudentsCount: 28,
      stats: {
        scheduledSessionsCount: 40,
        confirmedTaughtSessionsCount: 38,
        cancelledOrSubstituteSessionsCount: 1,
        submissionsReviewedCount: 80,
        pendingGradingCount: 4,
        forumAnswersCount: 25,
        acceptedAnswersCount: 20,
        videoAnswersCount: 5,
        totalContributionPoints: 250,
        unverifiedTeachingLog: false,
        avgGradingHours: 2.5,
      },
    },
  ] as unknown as KtnTeacherRecord[];
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

describe('Challenger M3: Teacher Delete UI & Zero-Reload Cache Integration', () => {
  let queryClient: QueryClient;
  let testTeachers: KtnTeacherRecord[];

  beforeEach(() => {
    vi.restoreAllMocks();
    testTeachers = createTestTeachers();

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

    useUiStore.setState({ isDemoMode: false, toasts: [] });

    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(mockClasses);
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
      summary: {
        totalStudents: 0,
        healthyCount: 0,
        needsResyncCount: 0,
        manualReviewCount: 0,
        driftTotal: 0,
      },
      driftItems: [],
    });
    vi.spyOn(ktnApi, 'searchStudents').mockResolvedValue({
      ok: true,
      items: [],
      students: [],
      totalCount: 0,
      limit: 20,
      offset: 0,
      hasMore: false,
      nextCursor: null,
      query: '',
      queryMs: 1,
    });

    vi.spyOn(ktnApi, 'searchAdminTeachers').mockImplementation(async (params) => {
      return filterAndPaginateTeachersClientSide(testTeachers, params || {});
    });

    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
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

  // =========================================================================
  // SUITE 1: API Client Layer Contracts
  // =========================================================================
  describe('Suite 1: ktnApiClient.ts deleteTeacher & filter contracts', () => {
    it('throws MISSING_TEACHER_IDENTIFIER when params are empty', async () => {
      await expect(ktnApi.deleteTeacher({})).rejects.toThrow(
        'Vui lòng cung cấp mã giáo viên (code) hoặc email hợp lệ để xóa.'
      );
    });

    it('builds proper DELETE query parameters and request body', async () => {
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            ok: true,
            deleted: true,
            teacherEmail: 'linh.lam@khongtunhi.com',
            unassignedClassesCount: 1,
            unassignedClasses: ['YCT2-04'],
            sessionRevoked: true,
            syncStatus: 'synced',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        )
      );

      const res = await ktnApi.deleteTeacher({
        teacherId: 'teacher-01',
        code: 'GV-KTN-01',
        email: 'linh.lam@khongtunhi.com',
      });

      expect(fetchSpy).toHaveBeenCalled();
      const [url, init] = fetchSpy.mock.calls[0];
      expect(String(url)).toContain('/api/ktn/teachers?');
      expect(String(url)).toContain('teacherId=teacher-01');
      expect(String(url)).toContain('code=GV-KTN-01');
      expect(String(url)).toContain('email=linh.lam%40khongtunhi.com');
      expect(init?.method).toBe('DELETE');
      expect(JSON.parse(init?.body as string)).toEqual({
        teacherId: 'teacher-01',
        code: 'GV-KTN-01',
        email: 'linh.lam@khongtunhi.com',
      });
      expect(res.deleted).toBe(true);
      expect(res.unassignedClassesCount).toBe(1);
    });

    it('KtnApiClient instance delegates deleteTeacher cleanly', async () => {
      const client = new KtnApiClient();
      const mockResult: KtnTeacherDeleteResult = {
        ok: true,
        deleted: true,
        teacherId: 'teacher-02',
      };
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue(mockResult);

      const res = await client.deleteTeacher({ teacherId: 'teacher-02' });
      expect(res).toBe(mockResult);
      expect(ktnApi.deleteTeacher).toHaveBeenCalledWith({ teacherId: 'teacher-02' });
    });

    it('filterAndPaginateTeachersClientSide filters out soft-deleted teachers', () => {
      const teachers = [
        ...createTestTeachers(),
        {
          code: 'GV-DEL-01',
          name: 'Giáo viên đã xóa 1',
          email: 'del1@ktn.com',
          active: false,
          aliases: ['__status:deleted'],
        } as unknown as KtnTeacherRecord,
        {
          code: 'GV-DEL-02',
          name: 'Giáo viên đã xóa 2',
          email: 'del2@ktn.com',
          active: false,
          deleted: true,
        } as unknown as KtnTeacherRecord,
      ];

      const result = filterAndPaginateTeachersClientSide(teachers, { status: 'ALL' });
      expect(result.items.some((t) => t.email === 'del1@ktn.com')).toBe(false);
      expect(result.items.some((t) => t.email === 'del2@ktn.com')).toBe(false);
      expect(result.totalCount).toBe(3);
    });
  });

  // =========================================================================
  // SUITE 2: TeacherDetailDrawer Tab 6 Delete Card
  // =========================================================================
  describe('Suite 2: TeacherDetailDrawer Tab 6 integration', () => {
    it('renders delete section in Tab 6 and triggers onDeleteTeacher', async () => {
      const teacher = testTeachers[0];
      const onDeleteTeacher = vi.fn();

      render(
        <TeacherDetailDrawer
          open={true}
          teacher={teacher}
          onClose={vi.fn()}
          classesList={mockClasses}
          catalogCourses={[]}
          isSaving={false}
          onDeleteTeacher={onDeleteTeacher}
        />
      );

      // Switch to Tab 6 (Tài khoản)
      const accountTabBtn = screen.getByTestId('teacher-drawer-tab-account');
      fireEvent.click(accountTabBtn);

      // Verify Tab 6 account panel is displayed
      expect(screen.getByTestId('teacher-drawer-account-panel')).toBeInTheDocument();
      expect(screen.getByText('Xóa tài khoản giáo viên')).toBeInTheDocument();
      expect(
        screen.getByText(/Hồ sơ giáo viên sẽ được lưu trữ \(soft-delete\)/)
      ).toBeInTheDocument();

      // Click "Xóa giáo viên này" button
      const deleteBtn = screen.getByTestId('admin-drawer-delete-teacher-btn');
      expect(deleteBtn).toBeInTheDocument();
      expect(deleteBtn).not.toBeDisabled();

      fireEvent.click(deleteBtn);
      expect(onDeleteTeacher).toHaveBeenCalledTimes(1);
      expect(onDeleteTeacher).toHaveBeenCalledWith(teacher);
    });

    it('disables "Xóa giáo viên này" button when isSaving is true', async () => {
      const teacher = testTeachers[0];

      render(
        <TeacherDetailDrawer
          open={true}
          teacher={teacher}
          isSaving={true}
          onClose={vi.fn()}
          classesList={mockClasses}
          catalogCourses={[]}
          onDeleteTeacher={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId('teacher-drawer-tab-account'));
      const deleteBtn = screen.getByTestId('admin-drawer-delete-teacher-btn');
      expect(deleteBtn).toBeDisabled();
    });
  });

  // =========================================================================
  // SUITE 3: Confirmation Modal & Warning Banner Assertions
  // =========================================================================
  describe('Suite 3: Modal text, 1-step confirmation & warning banners', () => {
    it('Teacher with 0 assigned classes: shows 1-step modal WITHOUT classes warning', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-tuan.dang@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Click "Xóa" for Thầy Đặng Quốc Tuấn (0 classes)
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-tuan.dang@khongtunhi.com')
      );

      // Modal appears
      const modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toBeInTheDocument();
      expect(screen.getByText('Xóa giáo viên Thầy Đặng Quốc Tuấn?')).toBeInTheDocument();
      expect(screen.getByText(/tuan\.dang@khongtunhi\.com · GV-KTN-02/)).toBeInTheDocument();

      // Warning banner must NOT be present
      expect(screen.queryByTestId('delete-teacher-classes-warning')).not.toBeInTheDocument();

      // Strictly 1-step verification: NO text inputs inside modal
      const inputs = modal.querySelectorAll('input');
      expect(inputs.length).toBe(0);

      // "Hủy" button closes modal cleanly
      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      fireEvent.click(cancelBtn);
      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
    });

    it('Teacher with 1 assigned class: shows warning banner with exact class count and code', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Click "Xóa" for Cô Lâm Mỹ Linh (1 class: YCT2-04)
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      const modal = screen.getByTestId('admin-delete-teacher-modal');
      expect(modal).toBeInTheDocument();

      // Warning banner must be present with exact copy
      const warningBanner = screen.getByTestId('delete-teacher-classes-warning');
      expect(warningBanner).toBeInTheDocument();
      expect(warningBanner).toHaveTextContent('Sẽ gỡ phân công khỏi 1 lớp (YCT2-04).');
      expect(warningBanner).toHaveTextContent(
        'Các lớp này sẽ được chuyển về trạng thái "Chưa phân công giáo viên".'
      );
    });

    it('Teacher with multiple assigned classes: shows warning banner listing all classes', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-lanhuong.vu@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Click "Xóa" for Cô Vũ Thị Lan Hương (3 classes: HSK1-01, HSK2-02, HSK3-03)
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-lanhuong.vu@khongtunhi.com')
      );

      const warningBanner = screen.getByTestId('delete-teacher-classes-warning');
      expect(warningBanner).toBeInTheDocument();
      expect(warningBanner).toHaveTextContent(
        'Sẽ gỡ phân công khỏi 3 lớp (HSK1-01, HSK2-02, HSK3-03).'
      );
    });
  });

  // =========================================================================
  // SUITE 4: All 3 Interaction Entry Points Open Modal
  // =========================================================================
  describe('Suite 4: Triggering delete modal from table, mobile cards, and drawer', () => {
    it('Entry Point 1: Desktop table row "Xóa" button opens modal', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
    });

    it('Entry Point 2: Mobile card "Xóa" button opens modal', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-mobile-tuan.dang@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-mobile-tuan.dang@khongtunhi.com')
      );
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      expect(screen.getByText('Xóa giáo viên Thầy Đặng Quốc Tuấn?')).toBeInTheDocument();
    });

    it('Entry Point 3: TeacherDetailDrawer Tab 6 "Xóa giáo viên này" opens modal', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // 1. Open drawer
      fireEvent.click(
        screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
      );

      // 2. Click Tab 6 (Tài khoản)
      await waitFor(() => {
        expect(screen.getByTestId('teacher-drawer-tab-account')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('teacher-drawer-tab-account'));

      // 3. Click "Xóa giáo viên này" inside drawer
      await waitFor(() => {
        expect(
          screen.getByTestId('admin-drawer-delete-teacher-btn')
        ).toBeInTheDocument();
      });
      fireEvent.click(screen.getByTestId('admin-drawer-delete-teacher-btn'));

      // 4. Modal opens
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      expect(screen.getByText('Xóa giáo viên Cô Lâm Mỹ Linh?')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // SUITE 5: Zero-Reload Optimistic Cache Updates, Invalidation & Drawer Close
  // =========================================================================
  describe('Suite 5: Zero-Reload Cache Updates, Invalidation & Drawer Closure', () => {
    it('executes delete mutation, updates query caches optimistically, invalidates queries, and closes drawer', async () => {
      const setQueriesDataSpy = vi.spyOn(queryClient, 'setQueriesData');
      const deleteSpy = vi.spyOn(ktnApi, 'deleteTeacher').mockImplementation(async (params) => {
        // Backend removes teacher from db
        testTeachers = testTeachers.filter(
          (t) => t.email !== params.email && t.code !== params.code
        );
        return {
          ok: true,
          deleted: true,
          teacherId: 'teacher-01',
          teacherEmail: 'linh.lam@khongtunhi.com',
          teacherName: 'Cô Lâm Mỹ Linh',
          unassignedClassesCount: 1,
          unassignedClasses: ['YCT2-04'],
          sessionRevoked: true,
          syncStatus: 'synced',
        };
      });

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Open drawer for Cô Lâm Mỹ Linh
      fireEvent.click(
        screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
      );
      await waitFor(() => {
        expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
      });

      // Now open delete modal from table
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      expect(confirmBtn).toHaveTextContent('Xác nhận xóa');

      const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

      // Click "Xác nhận xóa" (Strictly 1-step)
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(deleteSpy).toHaveBeenCalledWith({
          teacherId: 'teacher-01',
          email: 'linh.lam@khongtunhi.com',
          code: 'GV-KTN-01',
        });
      });

      // 1. Modal must close
      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });

      // 2. Success toast emitted
      const toasts = useUiStore.getState().toasts;
      expect(
        toasts.some((t) => t.title === 'Đã xóa giáo viên thành công!' && t.variant === 'success')
      ).toBe(true);

      // 3. Drawer must be closed because selectedTeacherKey was linh.lam@khongtunhi.com
      expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();

      // 4. Queries invalidated
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['ktn-admin-teachers-search'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['ktn-admin-teachers'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['ktn-classes'],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ['chat-rooms'],
      });

      // 5. Query cache optimistic update was called on search and list keys
      expect(setQueriesDataSpy).toHaveBeenCalledWith(
        { queryKey: ['ktn-admin-teachers-search'] },
        expect.any(Function)
      );
      expect(setQueriesDataSpy).toHaveBeenCalledWith(
        { queryKey: ['ktn-admin-teachers'] },
        expect.any(Function)
      );

      // 6. Test the optimistic updater logic directly
      const searchUpdater = setQueriesDataSpy.mock.calls.find(
        (call) => (call[0] as any).queryKey?.[0] === 'ktn-admin-teachers-search'
      )?.[1] as (prev: any) => any;
      expect(searchUpdater).toBeDefined();

      const sampleCache = {
        items: [
          { email: 'linh.lam@khongtunhi.com', code: 'GV-KTN-01' },
          { email: 'other@khongtunhi.com', code: 'GV-KTN-99' },
        ],
        totalCount: 2,
      };
      const updatedCache = searchUpdater(sampleCache);
      expect(updatedCache.items.length).toBe(1);
      expect(updatedCache.items[0].email).toBe('other@khongtunhi.com');
      expect(updatedCache.totalCount).toBe(1);

      // 7. Verify teacher is removed from UI without page reload
      await waitFor(() => {
        expect(
          screen.queryByTestId('admin-teacher-row-linh.lam@khongtunhi.com')
        ).not.toBeInTheDocument();
      });
    });

    it('does NOT close drawer if a different teacher is deleted', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherEmail: 'tuan.dang@khongtunhi.com',
      });

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Open drawer for Cô Lâm Mỹ Linh
      fireEvent.click(
        screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
      );
      await waitFor(() => {
        expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
      });

      // Delete Thầy Đặng Quốc Tuấn instead
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-tuan.dang@khongtunhi.com')
      );
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-delete-teacher-btn'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });

      // Drawer for Cô Linh must REMAIN open
      expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
    });
  });

  // =========================================================================
  // SUITE 6: Error Recovery When API Call Fails
  // =========================================================================
  describe('Suite 6: Error recovery on API failure', () => {
    it('displays error toast, keeps modal open for retry, and does NOT alter cache', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockRejectedValue(
        new Error('Máy chủ 500: Lỗi cơ sở dữ liệu tạm thời')
      );

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');

      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // Modal remains open on error so admin can inspect or retry/cancel
      await waitFor(() => {
        expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();
      });

      // Error toast emitted
      const toasts = useUiStore.getState().toasts;
      const errorToast = toasts.find((t) => t.variant === 'error');
      expect(errorToast).toBeDefined();
      expect(errorToast?.title).toBe('Không thể xóa giáo viên');
      expect(errorToast?.description).toContain('Máy chủ 500');

      // Teacher is still present in the table
      expect(
        screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')
      ).toBeInTheDocument();
    });
  });

  // =========================================================================
  // SUITE 7: Demo Mode Zero-Reload Deletion
  // =========================================================================
  describe('Suite 7: Demo mode delete behavior', () => {
    it('simulates deletion in demo mode with toast and instant cache update', async () => {
      useUiStore.setState({ isDemoMode: true });

      renderAdminWorkspace();

      // In demo mode, demo teachers are loaded
      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');

      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });

      const toasts = useUiStore.getState().toasts;
      expect(
        toasts.some((t) => t.title === 'Đã xóa giáo viên thành công!' && t.variant === 'success')
      ).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 8: Adversarial Edge Cases & Stress Scenarios
  // =========================================================================
  describe('Suite 8: Adversarial Edge Cases & Stress Scenarios', () => {
    it('handles mixed-case email matching in optimistic cache updaters', async () => {
      renderAdminWorkspace();

      const setQueriesDataSpy = vi.spyOn(queryClient, 'setQueriesData');
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherEmail: 'LINH.LAM@KHONGTUNHI.COM',
      });

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-delete-teacher-btn'));
      });

      const searchUpdater = setQueriesDataSpy.mock.calls.find(
        (call) => (call[0] as any).queryKey?.[0] === 'ktn-admin-teachers-search'
      )?.[1] as (prev: any) => any;

      const cacheWithMixedCase = {
        items: [
          { email: 'Linh.Lam@KhongTuNhi.COM', code: 'GV-KTN-01' },
          { email: 'Other@example.com', code: 'GV-KTN-99' },
        ],
        totalCount: 2,
      };

      const result = searchUpdater(cacheWithMixedCase);
      expect(result.items.length).toBe(1);
      expect(result.items[0].code).toBe('GV-KTN-99');
      expect(result.totalCount).toBe(1);
    });

    it('modal can be dismissed via X button in header', async () => {
      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      const closeBtn = screen.getByLabelText('Đóng hộp thoại xóa giáo viên');
      fireEvent.click(closeBtn);

      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
    });

    it('allows cancelling and closing modal after an API error', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockRejectedValue(new Error('Network timeout'));

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-delete-teacher-btn'));
      });

      // Modal remains open
      expect(screen.getByTestId('admin-delete-teacher-modal')).toBeInTheDocument();

      // Click "Hủy" to dismiss
      fireEvent.click(screen.getByTestId('cancel-delete-teacher-btn'));
      expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
    });

    it('closes drawer when selectedTeacherKey was set by teacher code (GV-KTN-01)', async () => {
      vi.spyOn(ktnApi, 'deleteTeacher').mockResolvedValue({
        ok: true,
        deleted: true,
        teacherEmail: 'linh.lam@khongtunhi.com',
        teacherId: 'GV-KTN-01',
      });

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      // Open drawer
      fireEvent.click(
        screen.getByTestId('admin-open-teacher-btn-linh.lam@khongtunhi.com')
      );

      await waitFor(() => {
        expect(screen.getByTestId('teacher-detail-drawer')).toBeInTheDocument();
      });

      // Delete teacher
      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      await act(async () => {
        fireEvent.click(screen.getByTestId('confirm-delete-teacher-btn'));
      });

      await waitFor(() => {
        expect(screen.queryByTestId('teacher-detail-drawer')).not.toBeInTheDocument();
      });
    });

    it('disables modal buttons and displays loading indicator while mutation is pending', async () => {
      let resolvePromise: (val: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      vi.spyOn(ktnApi, 'deleteTeacher').mockReturnValue(pendingPromise as any);

      renderAdminWorkspace();

      await waitFor(() => {
        expect(
          screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
        ).toBeInTheDocument();
      });

      fireEvent.click(
        screen.getByTestId('admin-delete-teacher-btn-linh.lam@khongtunhi.com')
      );

      const confirmBtn = screen.getByTestId('confirm-delete-teacher-btn');
      const cancelBtn = screen.getByTestId('cancel-delete-teacher-btn');
      const closeBtn = screen.getByLabelText('Đóng hộp thoại xóa giáo viên');

      // Click confirm to begin pending mutation
      fireEvent.click(confirmBtn);

      // While pending:
      await waitFor(() => {
        expect(confirmBtn).toBeDisabled();
      });
      expect(cancelBtn).toBeDisabled();
      expect(closeBtn).toBeDisabled();
      expect(confirmBtn).toHaveTextContent('Đang xóa giáo viên...');

      // Now resolve the promise
      await act(async () => {
        resolvePromise!({ ok: true, deleted: true });
      });

      await waitFor(() => {
        expect(screen.queryByTestId('admin-delete-teacher-modal')).not.toBeInTheDocument();
      });
    });
  });
});
