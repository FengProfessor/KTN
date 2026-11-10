import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { StudentDetailDrawer } from '../../src/features/admin/components/StudentDetailDrawer';
import { TeacherDetailDrawer } from '../../src/features/admin/components/TeacherDetailDrawer';
import { AdminWorkspace } from '../../src/features/admin/components/AdminWorkspace';
import { ktnApi, KtnApiError } from '../../src/services/api/ktnApiClient';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '../../src/lib/demoData';
import type {
  KtnClassItem,
  KtnCourse,
  KtnStudentRecord,
  KtnTeacherRecord,
} from '../../src/types/ktn.types';

const SAMPLE_COURSES: KtnCourse[] = DEMO_COURSES.slice(0, 2);

const SAMPLE_CLASSES: KtnClassItem[] = DEMO_CLASSES.slice(0, 2).map((c, idx) => ({
  ...c,
  officialScheduleText:
    idx === 0 ? 'Thứ 3, Thứ 5 · 19:30 (90p)' : 'Thứ 2, Thứ 6 · 18:00 (90p)',
}));

const SAMPLE_ACTIVE_STUDENT: KtnStudentRecord = {
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
      id: '6adadba969897b0002482ca5',
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
  cognito_user_id: 'cog-sub-12345',
};

function createStudentDrawerProps(
  overrides: Partial<React.ComponentProps<typeof StudentDetailDrawer>> = {}
): React.ComponentProps<typeof StudentDetailDrawer> {
  return {
    student: SAMPLE_ACTIVE_STUDENT,
    open: true,
    onClose: vi.fn(),
    catalogCourses: SAMPLE_COURSES,
    catalogError: false,
    catalogLoading: false,
    onRetryCatalog: vi.fn(),
    classesList: SAMPLE_CLASSES,
    actionError: null,
    onClearError: vi.fn(),
    isGrantingCourse: false,
    isRevokingCourse: false,
    isAssigningClass: false,
    isReplacingCourses: false,
    isUpdatingProfile: false,
    isResyncing: false,
    isManagingLifecycle: false,
    hasExistingOrders: false,
    onGrantCourses: vi.fn().mockResolvedValue(undefined),
    onRevokeCourse: vi.fn().mockResolvedValue(undefined),
    onAssignClass: vi.fn().mockResolvedValue(undefined),
    onReplaceAllCourses: vi.fn().mockResolvedValue(undefined),
    onUpdateProfile: vi.fn().mockResolvedValue(undefined),
    onManageLifecycle: vi.fn().mockResolvedValue({ ok: true }),
    onResyncStudent: vi.fn(),
    onCopyEmail: vi.fn(),
    ...overrides,
  };
}

describe('D1 — Student Lifecycle Management & P0 Multi-System Delete Safety', () => {
  it('renders 3-system sync status (Supabase, Cognito, izTeach) and all 4 lifecycle operations', () => {
    const props = createStudentDrawerProps();
    render(<StudentDetailDrawer {...props} />);

    const multiSystemCard = screen.getByTestId('drawer-lifecycle-multisystem-status');
    expect(multiSystemCard).toBeInTheDocument();
    expect(multiSystemCard.textContent).toContain('1. Supabase (ktn_students)');
    expect(multiSystemCard.textContent).toContain('2. Cognito (Auth Upstream)');
    expect(multiSystemCard.textContent).toContain('3. izTeach (LMS Upstream)');

    // All 4 lifecycle operations are available in Section E
    expect(screen.getByTestId('drawer-lifecycle-suspend-btn')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-lifecycle-archive-btn')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-lifecycle-restore-btn')).toBeInTheDocument();
    expect(screen.getByTestId('drawer-lifecycle-delete-btn')).toBeInTheDocument();
  });

  it('executes suspend, archive, and restore actions with reason and shows multi-system feedback', async () => {
    const onManageLifecycle = vi.fn().mockResolvedValue({ ok: true });
    render(
      <StudentDetailDrawer
        {...createStudentDrawerProps({ onManageLifecycle })}
      />
    );

    // 1. Suspend
    fireEvent.click(screen.getByTestId('drawer-lifecycle-suspend-btn'));
    expect(screen.getByTestId('drawer-lifecycle-confirm-box')).toBeInTheDocument();
    fireEvent.change(screen.getByTestId('drawer-lifecycle-reason-input'), {
      target: { value: 'Bảo lưu 1 tháng' },
    });
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    await waitFor(() => {
      expect(onManageLifecycle).toHaveBeenCalledWith({
        email: 'hoangngan@khongtunhi.com',
        action: 'suspend',
        reason: 'Bảo lưu 1 tháng',
      });
    });

    expect(screen.getByTestId('drawer-lifecycle-result-banner')).toBeInTheDocument();

    // 2. Archive
    fireEvent.click(screen.getByTestId('drawer-lifecycle-archive-btn'));
    fireEvent.change(screen.getByTestId('drawer-lifecycle-reason-input'), {
      target: { value: 'Hoàn thành chương trình YCT2' },
    });
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    await waitFor(() => {
      expect(onManageLifecycle).toHaveBeenCalledWith({
        email: 'hoangngan@khongtunhi.com',
        action: 'archive',
        reason: 'Hoàn thành chương trình YCT2',
      });
    });

    // 3. Restore
    fireEvent.click(screen.getByTestId('drawer-lifecycle-restore-btn'));
    fireEvent.change(screen.getByTestId('drawer-lifecycle-reason-input'), {
      target: { value: 'Đi học trở lại' },
    });
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    await waitFor(() => {
      expect(onManageLifecycle).toHaveBeenCalledWith({
        email: 'hoangngan@khongtunhi.com',
        action: 'restore',
        reason: 'Đi học trở lại',
      });
    });
  });

  it('enforces P0 delete contract (confirmDelete: true, reason >= 3 chars), retention warning, and honest unverified upstream message', async () => {
    const onManageLifecycle = vi.fn().mockResolvedValue({
      ok: true,
      action: 'delete',
      upstreamVerified: false,
      message: 'Đã xóa vĩnh viễn hồ sơ học viên khỏi danh sách hoạt động.',
    });

    render(
      <StudentDetailDrawer
        {...createStudentDrawerProps({
          hasExistingOrders: true,
          onManageLifecycle,
        })}
      />
    );

    fireEvent.click(screen.getByTestId('drawer-lifecycle-delete-btn'));

    // Retention & multi-system warning must be visible
    const warningBox = screen.getByTestId('drawer-lifecycle-retention-warning');
    expect(warningBox).toBeInTheDocument();
    expect(warningBox.textContent).toContain('Cognito & izTeach');
    expect(warningBox.textContent).toContain('ktn_orders');
    expect(warningBox.textContent).toContain('không xóa thật trong giai đoạn Pilot');

    const submitBtn = screen.getByTestId(
      'drawer-lifecycle-confirm-submit-btn'
    ) as HTMLButtonElement;
    const checkbox = screen.getByTestId(
      'drawer-lifecycle-delete-confirm-checkbox'
    ) as HTMLInputElement;
    const reasonInput = screen.getByTestId('drawer-lifecycle-reason-input');

    // Initially disabled (unchecked, empty reason)
    expect(submitBtn.disabled).toBe(true);

    // Check checkbox, but reason is only 2 chars ('ab') -> must still be disabled!
    fireEvent.click(checkbox);
    fireEvent.change(reasonInput, { target: { value: 'ab' } });
    expect(submitBtn.disabled).toBe(true);

    // Enter valid reason (>= 3 chars) -> enabled
    fireEvent.change(reasonInput, {
      target: { value: 'Tài khoản test nội bộ trùng lặp' },
    });
    expect(submitBtn.disabled).toBe(false);

    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onManageLifecycle).toHaveBeenCalledWith({
        email: 'hoangngan@khongtunhi.com',
        action: 'delete',
        reason: 'Tài khoản test nội bộ trùng lặp',
        confirmDelete: true,
      });
    });

    // Must NOT mislead Admin that Cognito/izTeach was deleted when upstreamVerified is false
    const resultBanner = screen.getByTestId('drawer-lifecycle-result-banner');
    expect(resultBanner.textContent).toContain(
      'Chưa xác minh xóa/vô hiệu hóa tài khoản gốc trên Cognito/izTeach'
    );
    expect(resultBanner.textContent).toContain('ktn_orders');
  });
});

describe('D2 — Teacher Management & Session Partition Invariant (Buổi có lịch ≠ Buổi thực dạy)', () => {
  it('strictly separates scheduledSessionsCount from activitySessionsCount and confirmedSessionsCount (never conflating 0 recorded with scheduled)', () => {
    const unverifiedTeacherWithZeroRecorded: KtnTeacherRecord = {
      email: 'linh.lam@khongtunhi.com',
      name: 'Cô Lâm Mỹ Linh',
      code: 'GV-01',
      phone: '0901234567',
      specialty: 'YCT & Giao tiếp trẻ em',
      active: true,
      status: 'active',
      assigned_classes: ['YCT2-04'],
      assigned_courses: ['6adadba969897b0002482ca5'],
      managedStudentsCount: 18,
      // Backend payload fields: 8 scheduled, 0 recorded, 0 confirmed
      scheduledSessionsCount: 8,
      activitySessionsCount: 0,
      confirmedSessionsCount: 0,
      teachingVerificationStatus: 'unverified',
      gradedHomeworksCount: 14,
      pendingHomeworksCount: 3,
      forumAnswersCount: 9,
      acceptedAnswersCount: 4,
      videoGuidesCount: 2,
      helpfulVotesCount: 11,
      monthlyContributionPoints: 35,
      totalContributionPoints: 85,
    };

    render(
      <TeacherDetailDrawer
        teacher={unverifiedTeacherWithZeroRecorded}
        open={true}
        isSaving={false}
        onClose={vi.fn()}
        classesList={SAMPLE_CLASSES}
        catalogCourses={SAMPLE_COURSES}
        onSaveTeacher={vi.fn()}
        onAdjustForumPoints={vi.fn()}
      />
    );

    // Switch to Tab 3: "Dạy học"
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-teaching'));

    expect(screen.getByTestId('teacher-drawer-scheduled-sessions').textContent).toContain(
      '8 buổi'
    );
    // CRITICAL REGRESSION CHECK: recorded sessions must be "0 buổi", NEVER falling back to 8!
    expect(screen.getByTestId('teacher-drawer-recorded-sessions').textContent).toContain(
      '0 buổi'
    );
    expect(screen.getByTestId('teacher-drawer-confirmed-sessions').textContent).toContain(
      '0 buổi'
    );
    expect(screen.getByTestId('teacher-unverified-sessions-badge')).toBeInTheDocument();

    // Verify teaching schedule list and student count are rendered
    const scheduleList = screen.getByTestId('teacher-drawer-teaching-schedule-list');
    expect(scheduleList.textContent).toContain('YCT2-04');
    expect(scheduleList.textContent).toContain('Thứ 3, Thứ 5 · 19:30 (90p)');
    expect(scheduleList.textContent).toContain('18 học viên');
  });

  it('maps backend teacher metrics (confirmedSessionsCount, videoGuidesCount, acceptedAnswersCount, monthlyContributionPoints) and enforces non-salary point policy', async () => {
    const onAdjustForumPoints = vi.fn().mockResolvedValue(undefined);
    const verifiedTeacher: KtnTeacherRecord = {
      email: 'linh.lam@khongtunhi.com',
      name: 'Cô Lâm Mỹ Linh',
      code: 'GV-01',
      active: true,
      status: 'active',
      assigned_classes: ['YCT2-04'],
      assigned_courses: ['6adadba969897b0002482ca5'],
      managedStudentsCount: 12,
      scheduledSessionsCount: 10,
      activitySessionsCount: 7,
      confirmedSessionsCount: 6,
      teachingVerificationStatus: 'verified',
      gradedHomeworksCount: 22,
      pendingHomeworksCount: 4,
      forumAnswersCount: 15,
      acceptedAnswersCount: 8,
      videoGuidesCount: 5,
      helpfulVotesCount: 19,
      monthlyContributionPoints: 45,
      totalContributionPoints: 120,
    };

    render(
      <TeacherDetailDrawer
        teacher={verifiedTeacher}
        open={true}
        isSaving={false}
        onClose={vi.fn()}
        classesList={SAMPLE_CLASSES}
        catalogCourses={SAMPLE_COURSES}
        onSaveTeacher={vi.fn()}
        onAdjustForumPoints={onAdjustForumPoints}
      />
    );

    // Tab 3: Teaching
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-teaching'));
    expect(screen.getByTestId('teacher-drawer-scheduled-sessions').textContent).toContain(
      '10 buổi'
    );
    expect(screen.getByTestId('teacher-drawer-recorded-sessions').textContent).toContain(
      '7 buổi'
    );
    expect(screen.getByTestId('teacher-drawer-confirmed-sessions').textContent).toContain(
      '6 buổi'
    );
    expect(screen.getByTestId('teacher-verified-sessions-badge')).toBeInTheDocument();

    // Tab 4: Grading
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-grading'));
    expect(screen.getByTestId('teacher-drawer-graded-homeworks').textContent).toContain(
      '22 bài'
    );
    expect(screen.getByTestId('teacher-drawer-pending-homeworks').textContent).toContain(
      '4 bài'
    );

    // Tab 5: Forum & Points
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-forum'));
    expect(screen.getByTestId('teacher-drawer-monthly-points').textContent).toContain(
      '45 đ'
    );
    expect(screen.getByTestId('teacher-drawer-total-points').textContent).toContain(
      '120 đ'
    );
    expect(screen.getByTestId('teacher-drawer-forum-answers-video').textContent).toContain(
      '15 / 5 video'
    );
    expect(screen.getByTestId('teacher-drawer-forum-resolved').textContent).toContain(
      '8 câu'
    );
    expect(
      screen.getByTestId('teacher-drawer-points-policy-note').textContent
    ).toContain('không tự quy đổi thành lương');

    // Submit point adjustment and verify teacherEmail is included
    fireEvent.change(screen.getByTestId('admin-adjust-points-delta-input'), {
      target: { value: '10' },
    });
    fireEvent.change(screen.getByTestId('admin-adjust-points-reason-input'), {
      target: { value: 'Hỗ trợ giải đáp video HSK1 xuất sắc' },
    });
    fireEvent.click(screen.getByTestId('admin-submit-adjust-points-btn'));

    await waitFor(() => {
      expect(onAdjustForumPoints).toHaveBeenCalledWith({
        teacherId: 'GV-01',
        teacherEmail: 'linh.lam@khongtunhi.com',
        pointsDelta: 10,
        reason: 'Hỗ trợ giải đáp video HSK1 xuất sắc',
      });
    });
  });

  it('renders AdminWorkspace teacher management table with all required D2 columns and search filter', async () => {
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
    useUiStore.setState({
      isDemoMode: true,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/teachers']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const teacherRow = await screen.findByTestId(
      'admin-teacher-row-linh.lam@khongtunhi.com'
    );
    expect(teacherRow).toBeInTheDocument();

    // Verify all D2 metrics are rendered in the teacher row
    expect(
      screen.getByTestId('teacher-students-count-linh.lam@khongtunhi.com').textContent
    ).toContain('12 HV');
    expect(
      screen.getByTestId('teacher-courses-summary-linh.lam@khongtunhi.com').textContent
    ).toContain('1 khóa');
    expect(
      screen.getByTestId('teacher-scheduled-sessions-linh.lam@khongtunhi.com').textContent
    ).toContain('Lịch: 8');
    expect(
      screen.getByTestId('teacher-confirmed-sessions-linh.lam@khongtunhi.com').textContent
    ).toContain('Thực dạy: 0');
    expect(
      screen.getByTestId('teacher-unverified-badge-linh.lam@khongtunhi.com')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('teacher-graded-count-linh.lam@khongtunhi.com').textContent
    ).toContain('Đã chấm: 15');
    expect(
      screen.getByTestId('teacher-pending-grading-count-linh.lam@khongtunhi.com')
        .textContent
    ).toContain('Chờ chấm: 1');
    expect(
      screen.getByTestId('teacher-resolved-forum-count-linh.lam@khongtunhi.com')
        .textContent
    ).toContain('2 giải quyết');
    expect(
      screen.getByTestId('teacher-video-guides-count-linh.lam@khongtunhi.com').textContent
    ).toContain('Video giải đáp: 1');
    expect(
      screen.getByTestId('teacher-monthly-points-linh.lam@khongtunhi.com').textContent
    ).toContain('Tháng: 23 điểm');

    // Test teacher search input filtering
    const searchInput = screen.getByTestId('admin-teacher-search-input');
    fireEvent.change(searchInput, { target: { value: 'không-tồn-tại-xyz' } });
    expect(
      screen.queryByTestId('admin-teacher-row-linh.lam@khongtunhi.com')
    ).not.toBeInTheDocument();

    fireEvent.change(searchInput, { target: { value: 'YCT2-04' } });
    expect(
      screen.getByTestId('admin-teacher-row-linh.lam@khongtunhi.com')
    ).toBeInTheDocument();

    // Switch to All/Students tab and verify student lifecycle filter options match backend contract
    fireEvent.click(screen.getByTestId('admin-tab-all'));
    const accountFilter = screen.getByTestId(
      'admin-filter-account-status'
    ) as HTMLSelectElement;
    const optionValues = Array.from(accountFilter.options).map((o) => o.value);
    expect(optionValues).toEqual([
      'ALL',
      'ready_to_login',
      'active',
      'pending_activation',
      'suspended',
      'archived',
      'deleted',
    ]);
  });

  it('syncs StudentDetailDrawer Section D and Section E consistently when lifecycleStatus differs from accountStatus or when mutation response omits status', async () => {
    const onManageLifecycle = vi.fn().mockResolvedValue({
      ok: true,
      message: 'Đã khôi phục tài khoản học viên!',
    });

    const props = createStudentDrawerProps({
      student: {
        ...SAMPLE_ACTIVE_STUDENT,
        accountStatus: 'ready_to_login',
        lifecycleStatus: 'suspended',
      },
      onManageLifecycle,
    });

    render(<StudentDetailDrawer {...props} />);

    // Both Section D and Section E must agree on "Tạm khóa (suspended)"
    expect(screen.getByTestId('drawer-status-account').textContent).toContain(
      'Tạm khóa'
    );
    expect(screen.getByTestId('drawer-lifecycle-supabase-state').textContent).toContain(
      'Tạm khóa (suspended)'
    );

    // Trigger restore when response omits `status`
    fireEvent.click(screen.getByTestId('drawer-lifecycle-restore-btn'));
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    await waitFor(() => {
      expect(onManageLifecycle).toHaveBeenCalledWith({
        email: 'hoangngan@khongtunhi.com',
        action: 'restore',
        reason: 'Khôi phục hoạt động tài khoản học viên',
      });
    });

    // Must map 'restore' -> 'active', never raw verb 'restore'
    expect(screen.getByTestId('drawer-lifecycle-supabase-state').textContent).toContain(
      'Hoạt động (active)'
    );
  });

  it('persists student lifecycle mutations across AdminWorkspace query refetches and renders mobile lifecycle badges', async () => {
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
    useUiStore.setState({
      isDemoMode: true,
    });

    const queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/students']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    const studentRow = await screen.findByTestId(
      'admin-student-row-hoangngan@khongtunhi.com'
    );
    fireEvent.click(studentRow);

    const suspendBtn = await screen.findByTestId('drawer-lifecycle-suspend-btn');
    fireEvent.click(suspendBtn);
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    // Wait for mutation + query invalidation to complete and verify state is NOT overwritten back to ready_to_login
    await waitFor(() => {
      expect(
        screen.getByTestId('student-lifecycle-badge-hoangngan@khongtunhi.com')
          .textContent
      ).toContain('Tạm khóa');
      expect(
        screen.getByTestId('student-mobile-lifecycle-badge-hoangngan@khongtunhi.com')
          .textContent
      ).toContain('Tạm khóa');
    });

    expect(screen.getByTestId('drawer-status-account').textContent).toContain(
      'Tạm khóa'
    );
  });

  it('never conflates totalContributionPoints into monthlyContributionPoints and ignores sentinel officialScheduleText in TeacherDetailDrawer and AdminWorkspace', async () => {
    const legacyPlaceholderClasses: KtnClassItem[] = [
      {
        ...DEMO_CLASSES[0],
        id: 'HSK1-02',
        officialScheduleText: 'Chưa có lịch học chính thức',
        schedule: '19:30 Thứ 3 & Thứ 6',
        scheduleStatus: 'legacy_unconfirmed',
      },
    ];

    const teacherWithCumulativeOnly: KtnTeacherRecord = {
      email: 'minh.tran@khongtunhi.com',
      name: 'Thầy Trần Quang Minh',
      code: 'GV-02',
      active: true,
      status: 'active',
      assigned_classes: ['hsk1-02'],
      assigned_courses: [],
      managedStudentsCount: 15,
      scheduledSessionsCount: 6,
      activitySessionsCount: 0,
      confirmedSessionsCount: 0,
      stats: {
        scheduledSessionsCount: 6,
        confirmedTaughtSessionsCount: 0,
        cancelledOrSubstituteSessionsCount: 0,
        unverifiedTeachingLog: false, // Even if stats claims false, 0 confirmed sessions must be unverified
        submissionsReviewedCount: 5,
        pendingGradingCount: 2,
        avgGradingHours: 12,
        forumAnswersCount: 4,
        acceptedAnswersCount: 2,
        videoAnswersCount: 1,
        totalContributionPoints: 120,
      },
      totalContributionPoints: 120,
      monthlyContributionPoints: undefined,
    };

    const { unmount } = render(
      <TeacherDetailDrawer
        teacher={teacherWithCumulativeOnly}
        open={true}
        isSaving={false}
        onClose={vi.fn()}
        classesList={legacyPlaceholderClasses}
        catalogCourses={SAMPLE_COURSES}
        onSaveTeacher={vi.fn()}
        onAdjustForumPoints={vi.fn()}
      />
    );

    // Tab 3: Teaching -> verify real schedule is shown (not masked by 'Chưa có lịch học chính thức') and 0 confirmed sessions is unverified
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-teaching'));
    expect(
      screen.getByTestId('teacher-drawer-teaching-schedule-list').textContent
    ).toContain('19:30 Thứ 3 & Thứ 6');
    expect(screen.getByTestId('teacher-unverified-sessions-badge')).toBeInTheDocument();

    // Tab 5: Forum -> monthly points must be 0, never 120
    fireEvent.click(screen.getByTestId('teacher-drawer-tab-forum'));
    expect(screen.getByTestId('teacher-drawer-monthly-points').textContent).toContain(
      '0 đ'
    );
    expect(
      screen.getByTestId('teacher-drawer-monthly-points').textContent
    ).not.toContain('120');
    expect(screen.getByTestId('teacher-drawer-total-points').textContent).toContain(
      '120 đ'
    );

    unmount();

    // Now verify AdminWorkspace teacher row directly with the same payload
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
    const queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          staleTime: Infinity,
        },
      },
    });
    queryClient.setQueryData(
      ['ktn-admin-teachers', 'quanly@khongtunhi.com', false],
      [teacherWithCumulativeOnly]
    );
    queryClient.setQueryData(
      ['ktn-classes', 'quanly@khongtunhi.com', false],
      legacyPlaceholderClasses
    );
    queryClient.setQueryData(
      ['ktn-courses-catalog', 'quanly@khongtunhi.com', false],
      SAMPLE_COURSES
    );
    queryClient.setQueryData(
      ['ktn-admin-course-grant-requests', 'quanly@khongtunhi.com', false],
      []
    );
    queryClient.setQueryData(
      ['ktn-admin-orders', 'quanly@khongtunhi.com', false],
      []
    );
    queryClient.setQueryData(
      ['ktn-admin-sync-status', 'quanly@khongtunhi.com', false],
      {
        ok: true,
        pendingOrdersCount: 0,
        failedStudentsCount: 0,
        pendingActivationCount: 0,
      }
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/teachers']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(
      await screen.findByTestId('admin-teacher-row-minh.tran@khongtunhi.com')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('teacher-monthly-points-minh.tran@khongtunhi.com').textContent
    ).toContain('Tháng: 0 điểm');
    expect(
      screen.getByTestId('teacher-total-points-minh.tran@khongtunhi.com').textContent
    ).toContain('Tích lũy: 120 điểm');
    expect(
      screen.getByTestId('teacher-unverified-badge-minh.tran@khongtunhi.com')
    ).toBeInTheDocument();
    expect(
      screen.getByTestId('teacher-schedule-summary-minh.tran@khongtunhi.com').textContent
    ).toContain('hsk1-02: 19:30 Thứ 3 & Thứ 6');
  });
});

describe('C1 & C2 — Class Lifecycle, Auto Chat Group & Safe Soft-Delete UX', () => {
  it('C1: creating a new class updates ktn-classes, chat-rooms (class:<CODE>), teacher assigned_classes without F5, and opens chat room on click', async () => {
    useAuthStore.setState({
      user: {
        id: 'admin-qa',
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
    useUiStore.setState({ isDemoMode: true, toasts: [] });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData(['chat-rooms'], []);

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/classes']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
            <Route path="/chat" element={<div data-testid="chat-route-view">Chat Route</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('admin-classes-section')).toBeInTheDocument();

    // Open Create Class modal
    fireEvent.click(screen.getByTestId('admin-create-class-btn'));
    expect(await screen.findByTestId('class-schedule-modal')).toBeInTheDocument();

    // Fill new class form
    fireEvent.change(screen.getByTestId('schedule-class-code-input'), {
      target: { value: 'YCT2-05' },
    });
    fireEvent.change(screen.getByTestId('schedule-class-name-input'), {
      target: { value: 'Lớp YCT 2 — Khóa Mới' },
    });
    fireEvent.change(screen.getByTestId('schedule-teacher-select'), {
      target: { value: 'linh.lam@khongtunhi.com' },
    });

    // Select a day of week so schedule auto-confirms
    fireEvent.click(screen.getByTestId('schedule-day-btn-2'));
    expect(
      (screen.getByTestId('schedule-status-select') as HTMLSelectElement).value
    ).toBe('confirmed');

    // Submit Create Class
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));

    // Wait for modal to close and new class row + banner to appear without F5
    await waitFor(() => {
      expect(screen.queryByTestId('class-schedule-modal')).not.toBeInTheDocument();
    });
    expect(await screen.findByTestId('admin-class-row-YCT2-05')).toBeInTheDocument();
    expect(screen.getByTestId('admin-created-class-banner')).toBeInTheDocument();
    expect(screen.getByTestId('class-open-chat-btn-YCT2-05')).toBeInTheDocument();
    expect(screen.getByTestId('admin-edit-schedule-btn-YCT2-05')).toBeInTheDocument();
    expect(screen.getByTestId('admin-delete-class-btn-YCT2-05')).toBeInTheDocument();

    // Verify canonical chat room class:YCT2-05 was added to ['chat-rooms'] cache
    const cachedRooms = queryClient.getQueryData<Array<{ roomId: string; classCode?: string }>>([
      'chat-rooms',
    ]);
    expect(cachedRooms?.some((r) => r.roomId === 'class:YCT2-05')).toBe(true);

    // Click "Mở nhóm chat" on the class row and verify navigation to /chat?room=class:YCT2-05
    fireEvent.click(screen.getByTestId('class-open-chat-btn-YCT2-05'));
    expect(await screen.findByTestId('chat-route-view')).toBeInTheDocument();
    expect(useUiStore.getState().activeRoomId).toBe('class:YCT2-05');
    expect(useUiStore.getState().selectedClassCode).toBe('YCT2-05');
  });

  it('C1: displays honest 409 duplicate class code error without closing modal or showing fake success toast', async () => {
    useAuthStore.setState({
      user: {
        id: 'admin-qa',
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
    useUiStore.setState({ isDemoMode: true, toasts: [] });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/classes']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    expect(await screen.findByTestId('admin-class-row-YCT2-04')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('admin-create-class-btn'));
    expect(await screen.findByTestId('class-schedule-modal')).toBeInTheDocument();

    // Attempt to create existing class code YCT2-04
    fireEvent.change(screen.getByTestId('schedule-class-code-input'), {
      target: { value: 'YCT2-04' },
    });
    fireEvent.change(screen.getByTestId('schedule-class-name-input'), {
      target: { value: 'Lớp trùng mã' },
    });
    fireEvent.change(screen.getByTestId('schedule-teacher-select'), {
      target: { value: 'linh.lam@khongtunhi.com' },
    });
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));

    // Modal must stay open and show schedule-modal-error
    const modalErr = await screen.findByTestId('schedule-modal-error');
    expect(modalErr.textContent).toContain('YCT2-04');
    expect(modalErr.textContent).toContain('đã tồn tại');
    expect(screen.getByTestId('class-schedule-modal')).toBeInTheDocument();
    const toasts = useUiStore.getState().toasts;
    expect(toasts.some((t) => t.variant === 'success')).toBe(false);
    expect(toasts.some((t) => t.variant === 'error')).toBe(true);
  });

  it('C2: blocks deleting a class with active students (studentCount > 0) with clear instructions, and allows soft-deleting an empty class after typing exact class_code', async () => {
    useAuthStore.setState({
      user: {
        id: 'admin-qa',
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
    useUiStore.setState({ isDemoMode: true, toasts: [] });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData(
      ['chat-rooms'],
      [
        {
          roomId: 'class:YCT2-04',
          label: 'Nhóm Lớp YCT2-04',
          type: 'class',
          classCode: 'YCT2-04',
          unreadCount: 0,
        },
        {
          roomId: 'class:YCT3-02',
          label: 'Nhóm Lớp YCT3-02',
          type: 'class',
          classCode: 'YCT3-02',
          unreadCount: 0,
        },
      ]
    );

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

    // Wait for initial class and students to load
    expect(await screen.findByTestId('admin-class-row-YCT2-04')).toBeInTheDocument();
    expect(
      await screen.findByTestId('admin-student-row-hoangngan@khongtunhi.com')
    ).toBeInTheDocument();

    // Create empty class YCT3-02 so we have both a non-empty class (YCT2-04) and an empty class (YCT3-02)
    fireEvent.click(screen.getByTestId('admin-create-class-btn'));
    fireEvent.change(await screen.findByTestId('schedule-class-code-input'), {
      target: { value: 'YCT3-02' },
    });
    fireEvent.change(screen.getByTestId('schedule-class-name-input'), {
      target: { value: 'Lớp YCT 3 Trống' },
    });
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));
    expect(await screen.findByTestId('admin-class-row-YCT3-02')).toBeInTheDocument();

    // YCT2-04 has 1 active student (hoangngan@khongtunhi.com); YCT3-02 has 0 students
    expect(screen.getByTestId('class-student-count-YCT2-04').textContent).toContain(
      '1 học viên'
    );
    expect(screen.getByTestId('class-student-count-YCT3-02').textContent).toContain(
      '0 học viên'
    );

    // 1. Click Delete on YCT2-04 (has 1 student) -> blocked with reason and transfer button
    fireEvent.click(screen.getByTestId('admin-delete-class-btn-YCT2-04'));
    expect(await screen.findByTestId('admin-delete-class-modal')).toBeInTheDocument();
    const blockedReason = screen.getByTestId('delete-class-blocked-reason');
    expect(blockedReason.textContent).toContain('YCT2-04');
    expect(blockedReason.textContent).toContain('1 học viên');
    expect(blockedReason.textContent).toContain('chuyển');
    expect(screen.queryByTestId('delete-class-confirm-input')).not.toBeInTheDocument();
    expect(screen.getByTestId('delete-class-transfer-students-btn')).toBeInTheDocument();

    // Close modal
    fireEvent.click(screen.getByTestId('cancel-delete-class-btn'));
    expect(screen.queryByTestId('admin-delete-class-modal')).not.toBeInTheDocument();

    // 2. Click Delete on YCT3-02 (empty class, 0 students) -> requires typing exact class code
    fireEvent.click(screen.getByTestId('admin-delete-class-btn-YCT3-02'));
    expect(await screen.findByTestId('admin-delete-class-modal')).toBeInTheDocument();
    const confirmInput = screen.getByTestId(
      'delete-class-confirm-input'
    ) as HTMLInputElement;
    const confirmBtn = screen.getByTestId(
      'confirm-delete-class-btn'
    ) as HTMLButtonElement;

    // Disabled until exact code is typed
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(confirmInput, { target: { value: 'YCT3-99' } });
    expect(confirmBtn.disabled).toBe(true);
    fireEvent.change(confirmInput, { target: { value: 'YCT3-02' } });
    expect(confirmBtn.disabled).toBe(false);

    // Confirm soft-delete
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(screen.queryByTestId('admin-delete-class-modal')).not.toBeInTheDocument();
      expect(screen.queryByTestId('admin-class-row-YCT3-02')).not.toBeInTheDocument();
    });

    // Verify YCT3-02 is removed from class filter dropdown and active chat rooms cache
    const filterSelect = screen.getByTestId('admin-filter-class') as HTMLSelectElement;
    const optionValues = Array.from(filterSelect.options).map((o) => o.value);
    expect(optionValues).not.toContain('YCT3-02');
    expect(optionValues).toContain('YCT2-04');

    const remainingRooms = queryClient.getQueryData<Array<{ roomId: string }>>([
      'chat-rooms',
    ]);
    expect(remainingRooms?.some((r) => r.roomId === 'class:YCT3-02')).toBe(false);
    expect(remainingRooms?.some((r) => r.roomId === 'class:YCT2-04')).toBe(true);
  });

  it('C1 & C2 (Live Mode): calls ktnApi.saveClass with mode=create, isNew=true, clientRequestId and handles backend 409 on ktnApi.deleteClass', async () => {
    useAuthStore.setState({
      user: {
        id: 'admin-qa',
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
    useUiStore.setState({ isDemoMode: false, toasts: [] });

    const saveClassSpy = vi.spyOn(ktnApi, 'saveClass').mockResolvedValueOnce({
      ok: true,
      roomId: 'class:HSK2-09',
      message: 'Đã tạo lớp HSK2-09 và khởi tạo nhóm chat!',
      classItem: {
        id: 'HSK2-09',
        name: 'Lớp HSK 2 Buổi Tối',
        teacher_code: 'GV-KTN-08',
        teacher_email: 'linh.lam@khongtunhi.com',
        teacher_name: 'Cô Lâm Mỹ Linh',
        schedule: 'Thứ 3, Thứ 6 · 19:30–21:00',
        officialScheduleText: 'Thứ 3, Thứ 6 · 19:30–21:00',
        scheduleStatus: 'confirmed',
        scheduleConfig: {
          classCode: 'HSK2-09',
          daysOfWeek: [2, 5],
          startTime: '19:30',
          endTime: '21:00',
          timezone: 'Asia/Ho_Chi_Minh',
          effectiveFrom: '2026-11-10',
          effectiveUntil: null,
          mode: 'weekly',
          customSessions: [],
          exceptions: [],
          status: 'confirmed',
        },
        total_lessons: 24,
        current_lesson: 0,
        active: true,
      },
    });

    const deleteClassSpy = vi
      .spyOn(ktnApi, 'deleteClass')
      .mockRejectedValueOnce(
        new KtnApiError({
          message: 'Lớp HSK2-09 vừa có 2 học viên mới đăng ký, vui lòng chuyển học viên trước khi xóa.',
          status: 409,
          code: 'CLASS_HAS_ACTIVE_STUDENTS',
        })
      );

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData(['ktn-classes', 'quanly@khongtunhi.com', false], []);
    queryClient.setQueryData(
      ['ktn-admin-teachers', 'quanly@khongtunhi.com', false],
      [
        {
          code: 'GV-KTN-08',
          name: 'Cô Lâm Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          assigned_classes: [],
          assigned_courses: [],
          active: true,
        },
      ]
    );
    queryClient.setQueryData(['ktn-courses-catalog', false], SAMPLE_COURSES);
    queryClient.setQueryData(['ktn-admin-orders', 'quanly@khongtunhi.com', false], []);
    queryClient.setQueryData(
      ['ktn-admin-course-grant-requests', 'quanly@khongtunhi.com', false],
      []
    );
    queryClient.setQueryData(
      ['ktn-admin-sync-status', 'quanly@khongtunhi.com', false],
      {
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
      }
    );
    queryClient.setQueryData(
      [
        'ktn-admin-students',
        'search',
        'quanly@khongtunhi.com',
        false,
        '',
        'ALL',
        'ALL',
        'ALL',
        'ALL',
        0,
      ],
      {
        ok: true,
        items: [],
        students: [],
        totalCount: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        nextCursor: null,
      }
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/classes']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    fireEvent.click(await screen.findByTestId('admin-create-class-btn'));
    fireEvent.change(screen.getByTestId('schedule-class-code-input'), {
      target: { value: 'HSK2-09' },
    });
    fireEvent.change(screen.getByTestId('schedule-class-name-input'), {
      target: { value: 'Lớp HSK 2 Buổi Tối' },
    });
    fireEvent.change(screen.getByTestId('schedule-teacher-select'), {
      target: { value: 'linh.lam@khongtunhi.com' },
    });
    fireEvent.click(screen.getByTestId('schedule-day-btn-2'));
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));

    await waitFor(() => {
      expect(saveClassSpy).toHaveBeenCalledTimes(1);
    });
    const saveArg = saveClassSpy.mock.calls[0][0];
    expect(saveArg.id).toBe('HSK2-09');
    expect(saveArg.mode).toBe('create');
    expect(saveArg.isNew).toBe(true);
    expect(saveArg.clientRequestId).toContain('CLS-REQ-');
    expect(saveArg.scheduleConfig?.status).toBe('confirmed');

    expect(await screen.findByTestId('admin-class-row-HSK2-09')).toBeInTheDocument();

    // Now test backend 409 when clicking delete on HSK2-09
    fireEvent.click(screen.getByTestId('admin-delete-class-btn-HSK2-09'));
    fireEvent.change(screen.getByTestId('delete-class-confirm-input'), {
      target: { value: 'HSK2-09' },
    });
    fireEvent.click(screen.getByTestId('confirm-delete-class-btn'));

    await waitFor(() => {
      expect(deleteClassSpy).toHaveBeenCalledWith({
        classCode: 'HSK2-09',
        confirmClassCode: 'HSK2-09',
      });
    });

    // Modal switches to blocked state showing the backend 409 message and transfer button
    expect(await screen.findByTestId('delete-class-blocked-reason')).toBeInTheDocument();
    expect(screen.getByTestId('delete-class-error').textContent).toContain(
      'chuyển học viên'
    );
    expect(screen.getByTestId('delete-class-transfer-students-btn')).toBeInTheDocument();

    saveClassSpy.mockRestore();
    deleteClassSpy.mockRestore();
  });

  it('N04 & B3: creates a class without teacher without fabricating GV-KTN, and updates teacher assignment without redundant saveClassSchedule call', async () => {
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

    const saveClassSpy = vi.spyOn(ktnApi, 'saveClass').mockImplementation(async (payload) => ({
      ok: true,
      mode: payload.mode || 'create',
      created: payload.mode === 'create',
      roomId: `class:${payload.id}`,
      classItem: {
        id: payload.id,
        name: payload.name,
        teacher_code: payload.teacher_code || '',
        teacher_name: payload.teacher_email ? 'Cô Lâm Mỹ Linh' : 'Chưa phân công giáo viên',
        teacher_email: payload.teacher_email || '',
        schedule: payload.schedule || 'Chưa có lịch học chính thức',
        scheduleStatus: payload.scheduleConfig?.status || 'unconfirmed',
        scheduleConfig: payload.scheduleConfig
          ? {
              classCode: payload.id,
              daysOfWeek: payload.scheduleConfig.daysOfWeek || [],
              startTime: payload.scheduleConfig.startTime || '19:30',
              endTime: payload.scheduleConfig.endTime || '21:00',
              timezone: payload.scheduleConfig.timezone || 'Asia/Ho_Chi_Minh',
              effectiveFrom: payload.scheduleConfig.effectiveFrom || '2026-11-10',
              effectiveUntil: payload.scheduleConfig.effectiveUntil || null,
              mode: payload.scheduleConfig.mode || 'weekly',
              customSessions: payload.scheduleConfig.customSessions || [],
              exceptions: payload.scheduleConfig.exceptions || [],
              status: payload.scheduleConfig.status || 'unconfirmed',
            }
          : null,
        total_lessons: payload.total_lessons ?? 24,
        current_lesson: 0,
        active: true,
      },
    }));
    const saveScheduleSpy = vi.spyOn(ktnApi, 'saveClassSchedule').mockResolvedValue({
      ok: true,
      classCode: 'YCT1-EMPTY',
      scheduleStatus: 'confirmed',
      officialScheduleText: 'Thứ 3, 6 (19:30–21:00)',
      scheduleConfig: {
        classCode: 'YCT1-EMPTY',
        daysOfWeek: [2, 5],
        startTime: '19:30',
        endTime: '21:00',
        timezone: 'Asia/Ho_Chi_Minh',
        effectiveFrom: '2026-11-10',
        effectiveUntil: null,
        mode: 'weekly',
        customSessions: [],
        exceptions: [],
        status: 'confirmed',
      },
      upcomingSessions: [],
      nextSession: null,
      message: 'Đã lưu lịch học!',
    });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, staleTime: Infinity },
      },
    });
    queryClient.setQueryData(['ktn-classes', 'quanly@khongtunhi.com', false], []);
    queryClient.setQueryData(
      ['ktn-admin-teachers', 'quanly@khongtunhi.com', false],
      [
        {
          code: 'GV-KTN-08',
          name: 'Cô Lâm Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          assigned_classes: [],
          assigned_courses: [],
          active: true,
        },
      ]
    );
    queryClient.setQueryData(['ktn-courses-catalog', false], SAMPLE_COURSES);
    queryClient.setQueryData(['ktn-admin-orders', 'quanly@khongtunhi.com', false], []);
    queryClient.setQueryData(
      ['ktn-admin-course-grant-requests', 'quanly@khongtunhi.com', false],
      []
    );
    queryClient.setQueryData(
      ['ktn-admin-sync-status', 'quanly@khongtunhi.com', false],
      {
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
      }
    );
    queryClient.setQueryData(
      [
        'ktn-admin-students',
        'search',
        'quanly@khongtunhi.com',
        false,
        '',
        'ALL',
        'ALL',
        'ALL',
        'ALL',
        0,
      ],
      {
        ok: true,
        items: [],
        students: [],
        totalCount: 0,
        limit: 20,
        offset: 0,
        hasMore: false,
        nextCursor: null,
      }
    );

    render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={['/admin/classes']}>
          <Routes>
            <Route path="/admin" element={<AdminWorkspace />} />
            <Route path="/admin/:section" element={<AdminWorkspace />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    );

    // 1. N04: Create class without selecting any teacher (select "-- Chọn giáo viên phụ trách --")
    fireEvent.click(await screen.findByTestId('admin-create-class-btn'));
    fireEvent.change(screen.getByTestId('schedule-class-code-input'), {
      target: { value: 'YCT1-EMPTY' },
    });
    fireEvent.change(screen.getByTestId('schedule-class-name-input'), {
      target: { value: 'Lớp YCT 1 Chưa Giao GV' },
    });
    fireEvent.change(screen.getByTestId('schedule-teacher-select'), {
      target: { value: '' },
    });
    fireEvent.change(screen.getByTestId('schedule-status-select'), {
      target: { value: 'unconfirmed' },
    });
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));

    await waitFor(() => {
      expect(saveClassSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveClassSpy.mock.calls[0][0].teacher_code).toBe('');
    expect(saveClassSpy.mock.calls[0][0].teacher_email).toBe('');

    const banner = await screen.findByTestId('admin-created-class-banner');
    expect(banner.textContent).toContain('chưa phân công giáo viên');
    expect(banner.textContent).not.toContain('GV-KTN');

    // 2. B3: Edit class to assign teacher Cô Lâm Mỹ Linh without modifying schedule -> should NOT call saveClassSchedule
    saveScheduleSpy.mockClear();
    fireEvent.click(screen.getByTestId('admin-edit-schedule-btn-YCT1-EMPTY'));
    fireEvent.change(await screen.findByTestId('schedule-teacher-select'), {
      target: { value: 'linh.lam@khongtunhi.com' },
    });
    fireEvent.click(screen.getByTestId('save-class-schedule-btn'));

    await waitFor(() => {
      expect(saveClassSpy).toHaveBeenCalledTimes(2);
    });
    expect(saveClassSpy.mock.calls[1][0].mode).toBe('update');
    expect(saveClassSpy.mock.calls[1][0].teacher_email).toBe('linh.lam@khongtunhi.com');
    expect(saveClassSpy.mock.calls[1][0].teacher_code).toBe('GV-KTN-08');
    expect(saveClassSpy.mock.calls[1][0].scheduleConfig).toBeUndefined();
    expect(saveScheduleSpy).not.toHaveBeenCalled();

    const updatedTeachers = queryClient.getQueryData<KtnTeacherRecord[]>([
      'ktn-admin-teachers',
      'quanly@khongtunhi.com',
      false,
    ]);
    expect(updatedTeachers?.[0]?.assigned_classes).toContain('YCT1-EMPTY');

    saveClassSpy.mockRestore();
    saveScheduleSpy.mockRestore();
  });

  it('C2 & N27: preserves active student count when student list is filtered and excludes suspended students from blocking class deletion', async () => {
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
    useUiStore.setState({ isDemoMode: true });

    const queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
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

    // Wait for initial render with YCT2-04 (1 active student: hoangngan@khongtunhi.com)
    await waitFor(() => {
      expect(screen.getByTestId('class-student-count-YCT2-04')).toHaveTextContent(
        '1 học viên'
      );
    });

    // Filter student table by NONE (unassigned students only) -> YCT2-04 must STILL remember it has 1 active student!
    fireEvent.change(screen.getByTestId('admin-filter-class'), {
      target: { value: 'NONE' },
    });
    await waitFor(() => {
      expect(screen.getByTestId('class-student-count-YCT2-04')).toHaveTextContent(
        '1 học viên'
      );
    });

    // Reset filter to ALL, then suspend hoangngan@khongtunhi.com -> YCT2-04 now has 0 active students
    fireEvent.change(screen.getByTestId('admin-filter-class'), {
      target: { value: 'ALL' },
    });
    const studentRow = await screen.findByTestId(
      'admin-student-row-hoangngan@khongtunhi.com'
    );
    fireEvent.click(studentRow);
    fireEvent.click(await screen.findByTestId('drawer-lifecycle-suspend-btn'));
    fireEvent.click(screen.getByTestId('drawer-lifecycle-confirm-submit-btn'));

    await waitFor(() => {
      expect(screen.getByTestId('class-student-count-YCT2-04')).toHaveTextContent(
        '0 học viên'
      );
    });
  });
});




