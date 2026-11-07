import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Users,
  CheckCircle2,
  PlusCircle,
  Loader2,
  GraduationCap,
  ClipboardList,
  MessageSquare,
  Bell,
  AlertCircle,
  RotateCcw,
  Search,
  UserPlus,
  RefreshCw,
  Copy,
  KeyRound,
  X,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '@/lib/demoData';
import { formatVnd } from '@/lib/utils';
import {
  KtnClassItem,
  KtnCourse,
  KtnOrder,
  KtnStudentRecord,
  KtnStudentSearchResult,
  KtnSyncStatusResponse,
  KtnTeacherRecord,
} from '@/types/ktn.types';

export const AdminWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<
    'all' | 'students' | 'classes' | 'orders' | 'more'
  >('all');
  const [targetEmail, setTargetEmail] = useState(
    () => searchParams.get('email') || 'taphong2002vip@gmail.com'
  );
  const [targetCourseId, setTargetCourseId] = useState('6adadba969897b0002482ca5');
  const [targetClassCode, setTargetClassCode] = useState('YCT2-04');

  // Server-side Student Search state (250ms debounce + pagination + filters)
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [pageOffset, setPageOffset] = useState(0);
  const pageLimit = 20;

  // One-click Student Provisioning modal state
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false);
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuPhone, setNewStuPhone] = useState('');
  const [newStuParent, setNewStuParent] = useState('');
  const [newStuClassCode, setNewStuClassCode] = useState(''); // Never defaults to YCT2-04!
  const [newStuCourseIds, setNewStuCourseIds] = useState<string[]>([
    '6adadba969897b0002482ca5',
  ]);
  const [newStuIdempotencyKey, setNewStuIdempotencyKey] = useState(
    () => `PROV-UI-${Date.now()}`
  );

  // One-click Teacher Creation modal state
  const [showCreateTeacherModal, setShowCreateTeacherModal] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherCode, setNewTeacherCode] = useState('');
  const [newTeacherClasses, setNewTeacherClasses] = useState<string[]>(['YCT2-04']);

  // Ephemeral One-Time Credential Handoff Banner (in-memory only, never persisted to localStorage)
  const [credentialHandoff, setCredentialHandoff] = useState<{
    name: string;
    email: string;
    roleLabel: string;
    accountCreated: boolean;
    existingAccount: boolean;
    initialPassword: string | null;
    classCode?: string | null;
    coursesCount?: number;
  } | null>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(searchInput.trim());
      setPageOffset(0);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchInput]);

  useEffect(() => {
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setTargetEmail(emailParam);
    }
    if (
      section === 'students' ||
      section === 'classes' ||
      section === 'orders' ||
      section === 'more'
    ) {
      setActiveTab(section);
    } else {
      setActiveTab('all');
    }
  }, [section, searchParams]);

  const coursesCatalogQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const ordersQuery = useQuery<KtnOrder[]>({
    queryKey: ['ktn-admin-orders', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
          {
            order_id: 'ORD-261105',
            student_name: 'Bé Phạm Gia Hân',
            student_email: 'giahan@khongtunhi.com',
            phone: '0987654321',
            course_id: '6adadba969897b0002482ca5',
            course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
            amount: 890000,
            payment_method: 'VietQR',
            payment_status: 'paid',
            approval_status: 'pending',
            provisioningStatus: 'pending',
            created_at: new Date().toISOString(),
          },
        ];
      }
      return ktnApi.getOrders();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const studentSearchQuery = useQuery<KtnStudentSearchResult>({
    queryKey: [
      'ktn-admin-students',
      'search',
      user?.email,
      isDemoMode,
      debouncedQ,
      classFilter,
      courseFilter,
      statusFilter,
      pageOffset,
    ],
    queryFn: async ({ signal }) => {
      if (isDemoMode) {
        const demoRows: KtnStudentRecord[] = [
          {
            code: 'KTN-2026-089',
            email: 'hoangngan@khongtunhi.com',
            name: 'Bé Nguyễn Hoàng Ngân',
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
            syncStatus: 'synced',
          },
          {
            code: 'KTN-2026-VIP',
            email: 'taphong2002vip@gmail.com',
            name: 'Tạ Phong (Chưa cấp khóa)',
            class_code: null,
            has_live_class: false,
            has_online_courses: false,
            online_courses: [],
            studentCase: 'unassigned',
            accountStatus: 'ready_to_login',
            syncStatus: 'synced',
          },
        ];
        return {
          ok: true,
          items: demoRows,
          students: demoRows,
          totalCount: demoRows.length,
          limit: pageLimit,
          offset: 0,
          hasMore: false,
          nextCursor: null,
          query: debouncedQ,
          queryMs: 2,
        };
      }
      return ktnApi.searchStudents(
        {
          q: debouncedQ || undefined,
          classCode: classFilter !== 'ALL' ? classFilter : undefined,
          courseId: courseFilter !== 'ALL' ? courseFilter : undefined,
          syncStatus: statusFilter !== 'ALL' ? statusFilter : undefined,
          limit: pageLimit,
          offset: pageOffset,
        },
        signal
      );
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const teachersQuery = useQuery<KtnTeacherRecord[]>({
    queryKey: ['ktn-admin-teachers', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
          {
            code: 'GV-KTN-08',
            name: 'Cô Lâm Mỹ Linh',
            email: 'linh.lam@khongtunhi.com',
            phone: '0901112233',
            assigned_classes: ['YCT2-04', 'YCT3-02'],
            active: true,
            provisioningStatus: 'ready_to_login',
            syncStatus: 'synced',
          },
        ];
      }
      return ktnApi.getTeachers();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const syncStatusQuery = useQuery<KtnSyncStatusResponse>({
    queryKey: ['ktn-admin-sync-status', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          ok: true,
          checkedAt: new Date().toISOString(),
          summary: {
            totalStudents: 2,
            healthyCount: 2,
            needsResyncCount: 0,
            manualReviewCount: 0,
            driftTotal: 0,
          },
          driftItems: [],
        };
      }
      return ktnApi.getSyncStatus();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const approveOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        return {
          message: 'Approved',
          studentEmail: 'giahan@khongtunhi.com',
          accountCreated: false,
          existingAccount: true,
          initialPassword: null,
        };
      }
      return ktnApi.approveOrder(orderId);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      if (res.accountCreated && res.initialPassword) {
        setCredentialHandoff({
          name: res.studentEmail,
          email: res.studentEmail,
          roleLabel: 'Học viên (Duyệt đơn)',
          accountCreated: true,
          existingAccount: false,
          initialPassword: res.initialPassword,
        });
      }
      addToast({
        title: 'Đã duyệt đơn hàng & kích hoạt khóa học!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      addToast({
        title: 'Duyệt đơn chưa hoàn tất đồng bộ',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const updateEntitlementMutation = useMutation({
    mutationFn: async (params: {
      action?: 'grant' | 'revoke';
      email: string;
      courseId: string;
      classCode: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        return { message: 'Updated' };
      }
      return ktnApi.manageStudentCourses({
        action: params.action || 'grant',
        email: params.email,
        courseIds: [params.courseId],
        classCode: params.classCode || null,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      if (res && 'accountCreated' in res && res.accountCreated && res.initialPassword) {
        setCredentialHandoff({
          name: res.student?.name || targetEmail,
          email: res.student?.email || targetEmail,
          roleLabel: 'Học viên',
          accountCreated: true,
          existingAccount: false,
          initialPassword: res.initialPassword,
        });
      }
      addToast({
        title: 'Đã cập nhật quyền khóa học & xếp lớp!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể cập nhật phân quyền',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const provisionStudentMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          operationId: 'PROV-DEMO',
          syncStatus: 'synced',
          accountStatus: 'ready_to_login',
          accountProvisioned: true,
          readyToLogin: true,
          fullySynced: true,
          accountCreated: true,
          existingAccount: false,
          credentialMode: 'new_account_initial_password',
          initialPassword: 'KtnDemo!2026',
          student: {
            code: 'KTN-DEMO-NEW',
            email: newStuEmail,
            name: newStuName,
            class_code: newStuClassCode || null,
            has_live_class: Boolean(newStuClassCode),
            has_online_courses: newStuCourseIds.length > 0,
            online_courses: [],
            studentCase: 'both' as const,
          },
          message: 'Đã tạo học viên mới thành công!',
        };
      }
      return ktnApi.provisionStudent({
        name: newStuName.trim(),
        email: newStuEmail.trim(),
        phone: newStuPhone.trim() || undefined,
        parentName: newStuParent.trim() || undefined,
        classCode: newStuClassCode ? newStuClassCode : null,
        courseIds: newStuCourseIds,
        idempotencyKey: newStuIdempotencyKey,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      setShowCreateStudentModal(false);
      setCredentialHandoff({
        name: res.student?.name || newStuName,
        email: res.student?.email || newStuEmail,
        roleLabel: 'Học viên mới',
        accountCreated: Boolean(res.accountCreated),
        existingAccount: Boolean(res.existingAccount),
        initialPassword: res.accountCreated ? res.initialPassword || null : null,
        classCode: res.student?.class_code,
        coursesCount: res.student?.online_courses?.length ?? newStuCourseIds.length,
      });
      setNewStuName('');
      setNewStuEmail('');
      setNewStuPhone('');
      setNewStuParent('');
      setNewStuClassCode('');
      setNewStuIdempotencyKey(`PROV-UI-${Date.now()}`);
      addToast({
        title: res.message || 'Đã tạo & cấp quyền học viên thành công!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Chưa tạo được tài khoản học viên',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const saveTeacherMutation = useMutation({
    mutationFn: async () => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          teacher: {
            code: newTeacherCode || 'GV-DEMO',
            name: newTeacherName,
            email: newTeacherEmail,
            assigned_classes: newTeacherClasses,
            active: true,
          },
          provisioningStatus: 'ready_to_login',
          readyToLogin: true,
          accountCreated: true,
          existingAccount: false,
          initialPassword: 'KtnTeacher!2026',
          message: 'Đã tạo tài khoản giáo viên!',
        };
      }
      return ktnApi.saveTeacher({
        code: newTeacherCode.trim() || undefined,
        name: newTeacherName.trim(),
        email: newTeacherEmail.trim(),
        phone: newTeacherPhone.trim() || undefined,
        assignedClasses: newTeacherClasses,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      setShowCreateTeacherModal(false);
      setCredentialHandoff({
        name: res.teacher?.name || newTeacherName,
        email: res.teacher?.email || newTeacherEmail,
        roleLabel: 'Giáo viên',
        accountCreated: Boolean(res.accountCreated),
        existingAccount: Boolean(res.existingAccount),
        initialPassword: res.accountCreated ? res.initialPassword || null : null,
        classCode: (res.teacher?.assigned_classes || newTeacherClasses).join(', '),
      });
      setNewTeacherName('');
      setNewTeacherEmail('');
      setNewTeacherPhone('');
      setNewTeacherCode('');
      addToast({
        title: res.message || 'Đã lưu hồ sơ giáo viên & phân công lớp!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể tạo giáo viên',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (payload: {
      type: 'student_provision' | 'student_sync' | 'teacher_provision' | 'order_approve' | 'homework_sync' | 'bulk_sync';
      email?: string;
      orderId?: string;
      homeworkId?: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true, syncStatus: 'synced' };
      }
      return ktnApi.retrySyncItem(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      addToast({
        title: 'Đã đồng bộ lại dữ liệu thành công!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Đồng bộ lại chưa thành công',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const coursesList =
    coursesCatalogQuery.data && coursesCatalogQuery.data.length > 0
      ? coursesCatalogQuery.data
      : DEMO_COURSES;
  const classesList = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
  const ordersList = ordersQuery.data || [];
  const studentsList = studentSearchQuery.data?.items || [];
  const totalStudentsCount = studentSearchQuery.data?.totalCount ?? studentsList.length;
  const teachersList = teachersQuery.data || [];
  const syncStatus = syncStatusQuery.data;

  const hasApiError =
    !isDemoMode &&
    (ordersQuery.isError || studentSearchQuery.isError || classesQuery.isError);

  const showOrders = activeTab === 'all' || activeTab === 'orders';
  const showPermissions = activeTab === 'all' || activeTab === 'more';
  const showStudents = activeTab === 'all' || activeTab === 'students';
  const showClasses = activeTab === 'all' || activeTab === 'classes';

  const copyCredentialText = (info: NonNullable<typeof credentialHandoff>) => {
    const lines = [
      `THÔNG TIN TÀI KHOẢN HỌC VIỆN KHỔNG TỬ NHÍ (${info.roleLabel})`,
      `- Họ tên: ${info.name}`,
      `- Email đăng nhập: ${info.email}`,
      info.accountCreated && info.initialPassword
        ? `- Mật khẩu khởi tạo (dùng 1 lần): ${info.initialPassword}`
        : `- Mật khẩu: Giữ nguyên mật khẩu tài khoản hiện có của bạn (nếu quên mật khẩu, vui lòng bấm Quên mật khẩu hoặc nhắn Học vụ hỗ trợ).`,
      info.classCode ? `- Lớp trực tiếp: ${info.classCode}` : null,
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    addToast({
      title: 'Đã sao chép thông tin bàn giao tài khoản!',
      variant: 'success',
    });
  };

  return (
    <div data-testid="admin-workspace-page" className="space-y-3 sm:space-y-4">
      {/* Compact Section Switcher + Quick One-Click Provisioning Buttons */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2 shadow-2xs">
        <div className="flex items-center gap-1 overflow-x-auto">
          {(
            [
              { id: 'all', label: 'Tất cả', to: '/admin' },
              {
                id: 'students',
                label: `Học viên (${totalStudentsCount})`,
                to: '/admin/students',
              },
              { id: 'classes', label: `Lớp (${classesList.length})`, to: '/admin/classes' },
              { id: 'orders', label: `Đơn hàng (${ordersList.length})`, to: '/admin/orders' },
              { id: 'more', label: 'Phân quyền & Đồng bộ', to: '/admin/more' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`admin-tab-${t.id}`}
              onClick={() => navigate(t.to)}
              className={`min-h-[34px] shrink-0 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                activeTab === t.id
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="admin-open-create-student-btn"
            onClick={() => setShowCreateStudentModal(true)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-900"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>+ Tạo học viên</span>
          </button>
          <button
            type="button"
            data-testid="admin-open-create-teacher-btn"
            onClick={() => setShowCreateTeacherModal(true)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800 hover:bg-stone-100"
          >
            <GraduationCap className="h-3.5 w-3.5 text-red-800" />
            <span>+ Tạo giáo viên</span>
          </button>
        </div>
      </div>

      {/* Ephemeral One-Time Credential Handoff Banner (BUG BE-02 Safe Handoff) */}
      {credentialHandoff && (
        <div
          data-testid="admin-credential-handoff-banner"
          className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-950 shadow-2xs"
        >
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-1">
              <p className="flex items-center gap-1.5 font-display text-xs font-bold text-emerald-900">
                <KeyRound className="h-4 w-4 text-emerald-700" />
                Thông tin bàn giao tài khoản ({credentialHandoff.roleLabel}):{' '}
                <span>{credentialHandoff.name}</span> ({credentialHandoff.email})
              </p>
              {credentialHandoff.accountCreated && credentialHandoff.initialPassword ? (
                <p data-testid="admin-credential-initial-password" className="text-xs">
                  Mật khẩu khởi tạo (chỉ hiển thị 1 lần, không lưu trữ bản rõ):{' '}
                  <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-red-800">
                    {credentialHandoff.initialPassword}
                  </code>
                </p>
              ) : (
                <p data-testid="admin-credential-existing-account-notice" className="text-xs">
                  Tài khoản đã tồn tại trên hệ thống — <strong>giữ nguyên mật khẩu hiện tại</strong> của người dùng (không ghi đè mật khẩu).
                </p>
              )}
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                data-testid="admin-copy-credential-btn"
                onClick={() => copyCredentialText(credentialHandoff)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-emerald-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-emerald-900"
              >
                <Copy className="h-3.5 w-3.5" />
                Sao chép
              </button>
              <button
                type="button"
                aria-label="Đóng thông tin bàn giao"
                onClick={() => setCredentialHandoff(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 1: One-Click Student Provisioning */}
      {showCreateStudentModal && (
        <form
          data-testid="admin-create-student-modal"
          onSubmit={(e) => {
            e.preventDefault();
            provisionStudentMutation.mutate();
          }}
          className="space-y-3 rounded-2xl border-2 border-red-800/20 bg-white p-4 shadow-md"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <UserPlus className="h-4 w-4 text-red-800" />
              Tạo tài khoản học viên mới (Đồng bộ izTeach + Supabase)
            </h2>
            <button
              type="button"
              aria-label="Đóng cửa sổ tạo học viên"
              onClick={() => setShowCreateStudentModal(false)}
              className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">Họ tên học viên *</label>
              <input
                type="text"
                required
                data-testid="provision-student-name-input"
                value={newStuName}
                onChange={(e) => setNewStuName(e.target.value)}
                placeholder="VD: Nguyễn Hoàng Ngân"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Email đăng nhập *</label>
              <input
                type="email"
                required
                data-testid="provision-student-email-input"
                value={newStuEmail}
                onChange={(e) => setNewStuEmail(e.target.value)}
                placeholder="hocvien@gmail.com"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Số điện thoại</label>
              <input
                type="tel"
                data-testid="provision-student-phone-input"
                value={newStuPhone}
                onChange={(e) => setNewStuPhone(e.target.value)}
                placeholder="0912345678"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Phụ huynh</label>
              <input
                type="text"
                data-testid="provision-student-parent-input"
                value={newStuParent}
                onChange={(e) => setNewStuParent(e.target.value)}
                placeholder="Tên phụ huynh (tùy chọn)"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                Xếp lớp trực tiếp (tùy chọn — không tự gán nếu chỉ học video):
              </label>
              <select
                data-testid="provision-student-class-select"
                value={newStuClassCode}
                onChange={(e) => setNewStuClassCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
              >
                <option value="">-- Không xếp lớp (Chỉ học khóa Video) --</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">
                Cấp khóa học Video ({newStuCourseIds.length} khóa đã chọn):
              </label>
              <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2">
                {coursesList.map((course) => {
                  const checked = newStuCourseIds.includes(course.id);
                  return (
                    <button
                      key={course.id}
                      type="button"
                      onClick={() =>
                        setNewStuCourseIds((prev) =>
                          checked
                            ? prev.filter((id) => id !== course.id)
                            : [...prev, course.id]
                        )
                      }
                      className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                        checked
                          ? 'bg-red-800 text-white'
                          : 'border border-stone-200 bg-white text-stone-700'
                      }`}
                    >
                      {course.shortTitle || course.title}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateStudentModal(false)}
              className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              data-testid="provision-student-submit-btn"
              disabled={provisionStudentMutation.isPending}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900"
            >
              {provisionStudentMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              <span>Tạo & Kích hoạt ngay</span>
            </button>
          </div>
        </form>
      )}

      {/* Modal 2: One-Click Teacher Provisioning */}
      {showCreateTeacherModal && (
        <form
          data-testid="admin-create-teacher-modal"
          onSubmit={(e) => {
            e.preventDefault();
            saveTeacherMutation.mutate();
          }}
          className="space-y-3 rounded-2xl border-2 border-stone-300 bg-white p-4 shadow-md"
        >
          <div className="flex items-center justify-between border-b border-stone-100 pb-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <GraduationCap className="h-4 w-4 text-red-800" />
              Tạo tài khoản Giáo viên & Phân công lớp phụ trách
            </h2>
            <button
              type="button"
              aria-label="Đóng cửa sổ tạo giáo viên"
              onClick={() => setShowCreateTeacherModal(false)}
              className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">Họ tên giáo viên *</label>
              <input
                type="text"
                required
                data-testid="create-teacher-name-input"
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
                placeholder="VD: Cô Nguyễn Phương Anh"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Email đăng nhập *</label>
              <input
                type="email"
                required
                data-testid="create-teacher-email-input"
                value={newTeacherEmail}
                onChange={(e) => setNewTeacherEmail(e.target.value)}
                placeholder="giaovien@khongtunhi.com"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Số điện thoại</label>
              <input
                type="tel"
                data-testid="create-teacher-phone-input"
                value={newTeacherPhone}
                onChange={(e) => setNewTeacherPhone(e.target.value)}
                placeholder="0901234567"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">Mã GV (tùy chọn)</label>
              <input
                type="text"
                data-testid="create-teacher-code-input"
                value={newTeacherCode}
                onChange={(e) => setNewTeacherCode(e.target.value)}
                placeholder="Tự sinh nếu để trống"
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700">
              Lớp phụ trách ({newTeacherClasses.length} lớp):
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {classesList.map((cls) => {
                const selected = newTeacherClasses.includes(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    onClick={() =>
                      setNewTeacherClasses((prev) =>
                        selected ? prev.filter((c) => c !== cls.id) : [...prev, cls.id]
                      )
                    }
                    className={`rounded-lg px-2.5 py-1 text-xs font-bold ${
                      selected
                        ? 'bg-red-800 text-white'
                        : 'border border-stone-200 bg-stone-50 text-stone-700'
                    }`}
                  >
                    {cls.id}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateTeacherModal(false)}
              className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700"
            >
              Hủy
            </button>
            <button
              type="submit"
              data-testid="create-teacher-submit-btn"
              disabled={saveTeacherMutation.isPending}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900"
            >
              {saveTeacherMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <GraduationCap className="h-3.5 w-3.5" />
              )}
              <span>Lưu giáo viên</span>
            </button>
          </div>
        </form>
      )}

      {hasApiError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được dữ liệu quản trị.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              ordersQuery.refetch();
              studentSearchQuery.refetch();
              classesQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Orders & Entitlements Grid */}
      {(showOrders || showPermissions) && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Grant Course & Assign Class Form */}
          {showPermissions && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateEntitlementMutation.mutate({
                  action: 'grant',
                  email: targetEmail,
                  courseId: targetCourseId,
                  classCode: targetClassCode,
                });
              }}
              className={`space-y-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs ${
                showOrders ? 'lg:col-span-5' : 'lg:col-span-12'
              }`}
            >
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <ShieldCheck className="h-4 w-4 text-red-800" />
                Phân quyền khóa học & Xếp lớp
              </h2>

              <div>
                <label className="block text-xs font-bold text-stone-700">
                  Email học viên:
                </label>
                <input
                  type="email"
                  value={targetEmail}
                  onChange={(e) => setTargetEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-xs font-bold text-stone-700">Khóa học:</label>
                  <select
                    value={targetCourseId}
                    onChange={(e) => setTargetCourseId(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                  >
                    {coursesList.map((course) => (
                      <option key={course.id} value={course.id}>
                        {course.shortTitle || course.title}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Xếp lớp:</label>
                  <select
                    value={targetClassCode}
                    onChange={(e) => setTargetClassCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                  >
                    <option value="">Chưa xếp lớp (Chỉ Video)</option>
                    {classesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  data-testid="admin-grant-course-btn"
                  disabled={updateEntitlementMutation.isPending}
                  className="inline-flex min-h-[38px] flex-1 items-center justify-center gap-1.5 rounded-xl bg-red-800 px-3 py-2 text-xs font-bold text-white hover:bg-red-900"
                >
                  {updateEntitlementMutation.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <PlusCircle className="h-4 w-4" />
                  )}
                  <span>Cấp quyền & Xếp lớp</span>
                </button>
                <button
                  type="button"
                  data-testid="admin-revoke-course-btn"
                  disabled={updateEntitlementMutation.isPending}
                  onClick={() =>
                    updateEntitlementMutation.mutate({
                      action: 'revoke',
                      email: targetEmail,
                      courseId: targetCourseId,
                      classCode: targetClassCode,
                    })
                  }
                  className="inline-flex min-h-[38px] shrink-0 items-center justify-center rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  Thu hồi
                </button>
              </div>

              {/* 3-System Sync Health Summary inside Permissions/More */}
              {syncStatus && (
                <div
                  data-testid="admin-sync-health-card"
                  className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-800">
                      Đồng bộ 3 hệ thống (Web · Supabase · izTeach)
                    </span>
                    <button
                      type="button"
                      data-testid="admin-sync-retry-all-btn"
                      disabled={retrySyncMutation.isPending}
                      onClick={() => retrySyncMutation.mutate({ type: 'bulk_sync' })}
                      className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-bold text-stone-800 hover:bg-stone-100"
                    >
                      <RefreshCw
                        className={`h-3 w-3 ${retrySyncMutation.isPending ? 'animate-spin' : ''}`}
                      />
                      Đối soát ngay
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-900">
                      <p className="text-[10px] font-semibold">Đã đồng bộ</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary.healthyCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-900">
                      <p className="text-[10px] font-semibold">Chờ đồng bộ lại</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary.needsResyncCount}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-1.5 text-red-900">
                      <p className="text-[10px] font-semibold">Cần kiểm tra</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary.manualReviewCount}
                      </p>
                    </div>
                  </div>
                  {syncStatus.driftItems.length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-stone-200 pt-2">
                      {syncStatus.driftItems.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          data-testid={`admin-drift-item-${item.entityKey}`}
                          className="flex items-center justify-between gap-2 rounded-lg bg-white p-2 text-[11px]"
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-bold text-stone-900">
                              {item.title || item.studentName || item.entityKey}
                            </p>
                            <p className="truncate text-stone-500">
                              {item.detail || item.reason || item.driftCode}
                            </p>
                          </div>
                          {item.retryAction && (
                            <button
                              type="button"
                              onClick={() => retrySyncMutation.mutate(item.retryAction!)}
                              className="shrink-0 rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold text-white"
                            >
                              Đồng bộ lại
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'more' && (
                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-stone-100 pt-3">
                  <button
                    type="button"
                    onClick={() => navigate('/chat')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-red-800" />
                    <span>Tin nhắn hỗ trợ</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
                  >
                    <Bell className="h-3.5 w-3.5 text-amber-700" />
                    <span>Thông báo</span>
                  </button>
                </div>
              )}
            </form>
          )}

          {/* Orders Queue with Separated Payment Status & Provisioning Status */}
          {showOrders && (
            <div
              className={`rounded-xl border border-stone-200 bg-white p-4 shadow-2xs ${
                showPermissions ? 'lg:col-span-7' : 'lg:col-span-12'
              }`}
            >
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <ClipboardList className="h-4 w-4 text-amber-700" />
                Đơn đăng ký ({ordersList.length})
              </h2>

              <div className="mt-3 space-y-2.5">
                {ordersList.map((ord) => {
                  const provStatus =
                    ord.provisioningStatus ||
                    ord.provisioning_status ||
                    (ord.approval_status === 'approved' ? 'synced' : 'pending');
                  return (
                    <div
                      key={ord.order_id}
                      className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-red-900">
                            {ord.order_id}
                          </span>
                          <span className="truncate rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-800">
                            {ord.course_name}
                          </span>
                          <span
                            className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              ord.payment_status === 'paid'
                                ? 'bg-emerald-100 text-emerald-900'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {ord.payment_status === 'paid'
                              ? 'Đã thanh toán'
                              : 'Chờ xác minh CK'}
                          </span>
                        </div>
                        <p className="mt-0.5 truncate text-xs font-bold text-stone-900">
                          {ord.student_name} ({ord.student_email}) · {formatVnd(ord.amount)}
                        </p>
                      </div>

                      {ord.approval_status === 'approved' && provStatus === 'synced' ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Đã kích hoạt
                        </span>
                      ) : provStatus === 'partial_failure' ? (
                        <button
                          type="button"
                          onClick={() =>
                            retrySyncMutation.mutate({
                              type: 'order_approve',
                              orderId: ord.order_id,
                            })
                          }
                          className="min-h-[36px] rounded-xl bg-amber-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-amber-800"
                        >
                          Đồng bộ lại đơn
                        </button>
                      ) : (
                        <button
                          type="button"
                          data-testid={`admin-approve-order-${ord.order_id}`}
                          onClick={() => approveOrderMutation.mutate(ord.order_id)}
                          className="min-h-[36px] rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          Duyệt đơn
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Classes & Teachers List */}
      {showClasses && (
        <div
          data-testid="admin-classes-section"
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <GraduationCap className="h-4 w-4 text-red-800" />
              Danh sách lớp học ({classesList.length}) & Giáo viên ({teachersList.length})
            </h2>
          </div>
          <div className="mt-2.5 divide-y divide-stone-100">
            {classesList.map((cls) => (
              <div
                key={cls.id}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-stone-900 sm:text-sm">
                    {cls.id} · {cls.name}
                  </p>
                  <p className="truncate text-[11px] text-stone-500">
                    GV: {cls.teacher_name} ({cls.teacher_email || cls.teacher_code}) ·{' '}
                    {cls.schedule}
                  </p>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                  Buổi {cls.current_lesson}/{cls.total_lessons}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Student Roster with Ultra-Fast Server-Side Search & Filters */}
      {showStudents && (
        <div
          data-testid="admin-students-section"
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
              <Users className="h-4 w-4 text-red-800" />
              Danh sách học viên ({totalStudentsCount})
              {studentSearchQuery.data?.queryMs !== undefined && (
                <span className="rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] font-normal text-stone-500">
                  {studentSearchQuery.data.queryMs}ms
                </span>
              )}
            </h2>

            {/* Search & Filter Bar */}
            <div className="flex flex-1 flex-wrap items-center justify-end gap-2">
              <div className="relative min-w-[210px] flex-1 sm:max-w-xs">
                <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                <input
                  type="search"
                  data-testid="admin-search-input"
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  placeholder="Tìm tên (có/không dấu), email, SĐT, mã HV..."
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                />
              </div>

              <select
                aria-label="Lọc theo lớp"
                data-testid="admin-filter-class"
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">Tất cả lớp</option>
                <option value="NONE">Chưa xếp lớp</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    Lớp {c.id}
                  </option>
                ))}
              </select>

              <select
                aria-label="Lọc theo khóa học"
                data-testid="admin-filter-course"
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">Tất cả khóa học</option>
                {coursesList.map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.shortTitle || course.title}
                  </option>
                ))}
              </select>

              <select
                aria-label="Lọc theo trạng thái đồng bộ"
                data-testid="admin-filter-sync-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">Mọi trạng thái</option>
                <option value="synced">Đã đồng bộ</option>
                <option value="pending_activation">Chờ kích hoạt</option>
              </select>
            </div>
          </div>

          {studentsList.length === 0 ? (
            <div
              data-testid="admin-students-empty-state"
              className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center"
            >
              <p className="text-xs font-bold text-stone-800">
                Không tìm thấy học viên phù hợp với từ khóa &ldquo;{searchInput}&rdquo;.
              </p>
              <button
                type="button"
                onClick={() => {
                  setNewStuName(searchInput.trim());
                  setShowCreateStudentModal(true);
                }}
                className="mt-2.5 inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white"
              >
                <UserPlus className="h-3.5 w-3.5" />
                Tạo học viên mới
              </button>
            </div>
          ) : (
            <>
              {/* Mobile Compact List (< sm) */}
              <div className="mt-2.5 divide-y divide-stone-100 sm:hidden">
                {studentsList.map((stu) => (
                  <div
                    key={stu.code || stu.email}
                    className="flex items-center justify-between gap-2 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-stone-900">{stu.name}</p>
                      <p className="truncate text-[11px] text-stone-500">{stu.email}</p>
                      <div className="mt-1 flex flex-wrap items-center gap-1">
                        {stu.class_code ? (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                            {stu.class_code}
                          </span>
                        ) : (
                          <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                            Chưa xếp lớp
                          </span>
                        )}
                        {(stu.online_courses || []).map((c) => (
                          <span
                            key={c.id}
                            className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                          >
                            {c.shortTitle || c.title}
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/admin/more?email=${encodeURIComponent(stu.email)}`)
                      }
                      className="min-h-[34px] shrink-0 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700"
                    >
                      Phân quyền
                    </button>
                  </div>
                ))}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="mt-3 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="pb-2 font-bold">Học viên</th>
                      <th className="pb-2 font-bold">Email / SĐT</th>
                      <th className="pb-2 font-bold">Lớp trực tiếp</th>
                      <th className="pb-2 font-bold">Khóa học đã mở</th>
                      <th className="pb-2 font-bold">Đồng bộ</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {studentsList.map((stu) => (
                      <tr
                        key={stu.code || stu.email}
                        data-testid={`admin-student-row-${stu.email}`}
                      >
                        <td className="py-2.5 font-bold text-stone-900">
                          <div>{stu.name}</div>
                          <div className="font-mono text-[10px] font-normal text-stone-400">
                            {stu.code}
                          </div>
                        </td>
                        <td className="py-2.5 text-stone-600">
                          <div>{stu.email}</div>
                          {stu.phone && (
                            <div className="text-[11px] text-stone-400">{stu.phone}</div>
                          )}
                        </td>
                        <td className="py-2.5">
                          {stu.class_code ? (
                            <span className="rounded-md bg-red-100 px-2 py-0.5 font-bold text-red-900">
                              {stu.class_code}
                            </span>
                          ) : (
                            <span className="text-stone-400">Chưa xếp lớp</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {(stu.online_courses || []).length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {stu.online_courses.map((c) => (
                                <span
                                  key={c.id}
                                  className="rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900"
                                >
                                  {c.shortTitle || c.title}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <span className="font-semibold text-amber-700">Chưa mở khóa</span>
                          )}
                        </td>
                        <td className="py-2.5">
                          {stu.syncStatus === 'pending_activation' ||
                          stu.accountStatus === 'pending_activation' ? (
                            <button
                              type="button"
                              onClick={() =>
                                retrySyncMutation.mutate({
                                  type: 'student_provision',
                                  email: stu.email,
                                })
                              }
                              className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200"
                            >
                              <RefreshCw className="h-3 w-3" />
                              Chờ kích hoạt (Đồng bộ lại)
                            </button>
                          ) : (
                            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                              <CheckCircle2 className="h-3 w-3" />
                              Sẵn sàng
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination Controls */}
              {(pageOffset > 0 || studentSearchQuery.data?.hasMore) && (
                <div className="mt-3 flex items-center justify-between border-t border-stone-100 pt-2.5 text-xs">
                  <span className="text-stone-500">
                    Hiển thị {pageOffset + 1}–{pageOffset + studentsList.length} /{' '}
                    {totalStudentsCount} học viên
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pageOffset === 0}
                      onClick={() => setPageOffset((p) => Math.max(0, p - pageLimit))}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
                    >
                      Trang trước
                    </button>
                    <button
                      type="button"
                      disabled={!studentSearchQuery.data?.hasMore}
                      onClick={() => setPageOffset((p) => p + pageLimit)}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
                    >
                      Trang sau
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
