import React, { useState, useEffect, useMemo } from 'react';
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
  Calendar,
  Clock,
  ChevronRight,
  AlertTriangle,
  Award,
  BookOpen,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '@/lib/demoData';
import {
  disambiguateCatalogCourses,
  formatVnd,
  resolveStudentOnlineCourses,
} from '@/lib/utils';
import { ClassScheduleModal } from '@/features/classrooms/components/ClassScheduleModal';
import { StudentDetailDrawer } from '@/features/admin/components/StudentDetailDrawer';
import { TeacherDetailDrawer } from '@/features/admin/components/TeacherDetailDrawer';
import {
  OrderDetailDrawer,
  ACCOUNT_STATUS_META,
  CONTACT_STATUS_META,
  PAYMENT_STATUS_META,
} from '@/features/admin/components/OrderDetailDrawer';
import {
  KtnClassItem,
  KtnCourse,
  KtnCourseGrantRequest,
  KtnOrder,
  KtnStudentRecord,
  KtnStudentSearchResult,
  KtnSyncStatusResponse,
  KtnTeacherRecord,
  OrderContactStatus,
  OrderPaymentDetailedStatus,
} from '@/types/ktn.types';

const VALID_EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type AdminOrderFilterKey =
  | 'all'
  | 'new'
  | 'not_called'
  | 'called_awaiting_payment'
  | 'paid_awaiting_approval'
  | 'activated'
  | 'needs_error_handling'
  | 'cancelled_refunded';

export const ORDER_FILTER_OPTIONS: Array<{ id: AdminOrderFilterKey; label: string }> = [
  { id: 'all', label: 'Tất cả đơn' },
  { id: 'new', label: 'Đơn mới' },
  { id: 'not_called', label: 'Chưa gọi' },
  { id: 'called_awaiting_payment', label: 'Đã gọi, chờ thanh toán' },
  { id: 'paid_awaiting_approval', label: 'Đã nhận thanh toán, chờ duyệt' },
  { id: 'activated', label: 'Đã kích hoạt' },
  { id: 'needs_error_handling', label: 'Cần xử lý lỗi' },
  { id: 'cancelled_refunded', label: 'Đã hủy/hoàn tiền' },
];

export const AdminWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [activeTab, setActiveTab] = useState<
    'all' | 'students' | 'teachers' | 'classes' | 'orders' | 'more'
  >('all');

  // Selected teacher for TeacherDetailDrawer
  const [selectedTeacherKey, setSelectedTeacherKey] = useState<string | null>(null);
  const [teacherSearchInput, setTeacherSearchInput] = useState<string>('');

  // Selected student for StudentDetailDrawer (neutral by default — only opened by explicit click or valid ?email= param)
  const [selectedStudentEmail, setSelectedStudentEmail] = useState<string | null>(() => {
    const rawEmail = (searchParams.get('email') || '').trim().toLowerCase();
    return VALID_EMAIL_REGEX.test(rawEmail) ? rawEmail : null;
  });
  const [selectedStudentSnapshot, setSelectedStudentSnapshot] =
    useState<KtnStudentRecord | null>(null);

  // Selected order for OrderDetailDrawer + Search & Filter state
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(() => {
    const rawOrderId = (searchParams.get('orderId') || '').trim();
    return rawOrderId || null;
  });
  const [orderSearchInput, setOrderSearchInput] = useState('');
  const [orderFilter, setOrderFilter] = useState<AdminOrderFilterKey>('all');
  const [orderDrawerError, setOrderDrawerError] = useState<string | null>(null);
  const [orderEphemeralPasswords, setOrderEphemeralPasswords] = useState<
    Record<string, string>
  >({});

  // Server-side Student Search state (250ms debounce + pagination + filters)
  const [searchInput, setSearchInput] = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [classFilter, setClassFilter] = useState('ALL');
  const [courseFilter, setCourseFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [accountStatusFilter, setAccountStatusFilter] = useState('ALL');
  const [pageOffset, setPageOffset] = useState(0);
  const pageLimit = 20;

  // One-click Student Provisioning modal state (neutral defaults: no class, no courses)
  const [showCreateStudentModal, setShowCreateStudentModal] = useState(false);
  const [newStuName, setNewStuName] = useState('');
  const [newStuEmail, setNewStuEmail] = useState('');
  const [newStuPhone, setNewStuPhone] = useState('');
  const [newStuParent, setNewStuParent] = useState('');
  const [newStuClassCode, setNewStuClassCode] = useState('');
  const [newStuCourseIds, setNewStuCourseIds] = useState<string[]>([]);
  const [newStuIdempotencyKey, setNewStuIdempotencyKey] = useState(
    () => `PROV-UI-${Date.now()}`
  );

  // One-click Teacher Creation modal state (neutral defaults: no classes pre-selected)
  const [showCreateTeacherModal, setShowCreateTeacherModal] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherEmail, setNewTeacherEmail] = useState('');
  const [newTeacherPhone, setNewTeacherPhone] = useState('');
  const [newTeacherCode, setNewTeacherCode] = useState('');
  const [newTeacherClasses, setNewTeacherClasses] = useState<string[]>([]);

  // Official Class Schedule & Create Class modal state
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [scheduleModalMode, setScheduleModalMode] = useState<'create_class' | 'edit_schedule'>(
    'edit_schedule'
  );
  const [selectedClassForSchedule, setSelectedClassForSchedule] =
    useState<KtnClassItem | null>(null);
  const [isSavingSchedule, setIsSavingSchedule] = useState(false);

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
    const rawEmail = (searchParams.get('email') || '').trim().toLowerCase();
    const hasValidEmail = VALID_EMAIL_REGEX.test(rawEmail);
    const rawOrderId = (searchParams.get('orderId') || '').trim();

    if (rawOrderId) {
      setSelectedOrderId(rawOrderId);
    }

    if (hasValidEmail) {
      setSelectedStudentEmail(rawEmail);
      // Redirect legacy /admin/more?email=... deep-links to unified /admin/students?email=...
      if (section === 'more') {
        navigate(`/admin/students?email=${encodeURIComponent(rawEmail)}`, {
          replace: true,
        });
        return;
      }
    }

    if (
      section === 'students' ||
      section === 'teachers' ||
      section === 'classes' ||
      section === 'orders' ||
      section === 'more'
    ) {
      setActiveTab(section);
    } else {
      setActiveTab('all');
    }
  }, [section, searchParams, navigate]);

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
            parent_name: 'Chị Phạm Thu Hương',
            student_email: 'giahan@khongtunhi.com',
            phone: '0987654321',
            parent_phone: '0987654321',
            course_id: '6adadba969897b0002482ca5',
            course_name: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
            amount: 890000,
            server_course_price: 890000,
            course_valid: true,
            amount_valid: true,
            payment_method: 'VietQR',
            payment_status: 'paid',
            payment_detailed_status: 'verified_paid',
            payment_tx_ref: 'FT26311009988',
            payment_received_amount: 890000,
            payment_proof_auto: true,
            contact_status: 'called',
            consultation_note: 'Đã gọi tư vấn lộ trình HSK 1 3.0 cho mẹ bé Gia Hân.',
            approval_status: 'pending',
            account_detailed_status: 'pending_creation',
            provisioningStatus: 'pending',
            source: 'website',
            source_label: 'Website',
            can_activate: true,
            activation_block_reasons: [],
            created_at: new Date().toISOString(),
          },
          {
            order_id: 'ORD-261106',
            student_name: 'Bé Lê Minh Khôi',
            parent_name: '',
            student_email: '',
            phone: '0912345678',
            parent_phone: '0912345678',
            course_id: '65e7704a9ea90c00080d5195',
            course_name: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
            amount: 890000,
            server_course_price: 890000,
            course_valid: true,
            amount_valid: true,
            payment_method: 'VietQR',
            payment_status: 'pending_verification',
            payment_detailed_status: 'unpaid',
            contact_status: 'not_called',
            approval_status: 'pending',
            account_detailed_status: 'no_account',
            provisioningStatus: 'pending',
            source: 'website',
            source_label: 'Website',
            can_activate: false,
            activation_block_reasons: [
              'Chưa xác minh tiền thực nhận (Trạng thái thanh toán chưa phải "Đã xác minh tiền thực nhận").',
              'Chưa có email đăng nhập hợp lệ cho học viên.',
              'Chưa cập nhật trạng thái chăm sóc (vui lòng gọi phụ huynh và đánh dấu "Đã gọi" hoặc ghi chú tư vấn trước khi kích hoạt).',
            ],
            created_at: new Date(Date.now() - 1800 * 1000).toISOString(),
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
      accountStatusFilter,
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
          accountStatus: accountStatusFilter !== 'ALL' ? accountStatusFilter : undefined,
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
            managedStudentsCount: 12,
            scheduledSessionsCount: 8,
            recordedClassSessionsCount: 4,
            attendanceConfirmedSessionsCount: 0,
            teachingVerificationStatus: 'unverified',
            gradedHomeworksCount: 15,
            pendingHomeworksCount: 1,
            avgGradingTurnaroundHours: 2.4,
            forumAnswersCount: 3,
            forumVideoAnswersCount: 1,
            forumAcceptedAnswersCount: 2,
            totalContributionPoints: 40,
            monthlyContributionPoints: 23,
          },
        ];
      }
      return ktnApi.getTeachers();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const courseGrantRequestsQuery = useQuery<KtnCourseGrantRequest[]>({
    queryKey: ['ktn-admin-course-grant-requests', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return [];
      const res = await ktnApi.getCourseGrantRequests();
      return res.requests || [];
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

  const updateOrderMutation = useMutation({
    mutationFn: async (params: {
      orderId: string;
      studentName?: string;
      parentName?: string;
      studentEmail?: string;
      phone?: string;
      contactStatus?: OrderContactStatus;
      consultationNote?: string;
      paymentDetailedStatus?: OrderPaymentDetailedStatus;
      paymentTxRef?: string;
      paymentReceivedAmount?: number;
      credentialHandedOff?: boolean;
      cancelOrder?: boolean;
    }) => {
      setOrderDrawerError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        return {
          ok: true,
          message: 'Đã cập nhật thông tin đơn hàng (Demo)!',
        };
      }
      return ktnApi.updateOrder(params);
    },
    onSuccess: (res) => {
      setOrderDrawerError(null);
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      addToast({
        title: res.message || 'Đã cập nhật thông tin đơn hàng!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      setOrderDrawerError(err.message);
      addToast({
        title: 'Không thể cập nhật đơn hàng',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const approveOrderMutation = useMutation({
    mutationFn: async (params: {
      orderId: string;
      classCode?: string;
      studentEmail?: string;
    }) => {
      setOrderDrawerError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        return {
          message: 'Approved',
          orderId: params.orderId,
          studentEmail: params.studentEmail || 'giahan@khongtunhi.com',
          accountCreated: true,
          existingAccount: false,
          initialPassword: 'KtnDemoOrder!2026',
        };
      }
      return ktnApi.approveOrder(params.orderId, params.classCode, {
        confirmActivation: true,
        studentEmail: params.studentEmail,
      });
    },
    onSuccess: (res, vars) => {
      setOrderDrawerError(null);
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      if (res.accountCreated && res.initialPassword) {
        setOrderEphemeralPasswords((prev) => ({
          ...prev,
          [vars.orderId]: res.initialPassword!,
        }));
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
        title: 'Đã xác nhận & kích hoạt khóa học thành công!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      setOrderDrawerError(err.message);
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      addToast({
        title: 'Chưa thể kích hoạt khóa học',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const [drawerActionError, setDrawerActionError] = useState<string | null>(null);

  const handleStudentMutationSuccess = (
    res: {
      student?: KtnStudentRecord;
      accountCreated?: boolean;
      initialPassword?: string | null;
      message?: string;
    },
    fallbackEmail: string,
    defaultToastTitle: string
  ) => {
    setDrawerActionError(null);
    if (res?.student) {
      setSelectedStudentSnapshot(res.student);
    }
    queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
    queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
    if (res?.accountCreated && res?.initialPassword) {
      setCredentialHandoff({
        name: res.student?.name || fallbackEmail,
        email: res.student?.email || fallbackEmail,
        roleLabel: 'Học viên',
        accountCreated: true,
        existingAccount: false,
        initialPassword: res.initialPassword,
      });
    }
    addToast({
      title: res?.message || defaultToastTitle,
      variant: 'success',
    });
  };

  const buildBaseDemoStudent = (email: string): KtnStudentRecord =>
    selectedStudent || {
      code: 'KTN-DEMO',
      email,
      name: email,
      class_code: null,
      has_live_class: false,
      has_online_courses: false,
      online_courses: [],
      studentCase: 'unassigned',
    };

  const grantCoursesMutation = useMutation({
    mutationFn: async (params: { email: string; courseIds: string[] }) => {
      setDrawerActionError(null);
      if (!params.courseIds || params.courseIds.length === 0) {
        throw new Error('Vui lòng chọn ít nhất 1 khóa học trước khi cấp quyền.');
      }
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const existingCourses = base.online_courses || [];
        const addedCourses = DEMO_COURSES.filter((c) =>
          params.courseIds.includes(c.id)
        ).map((c) => ({
          id: c.id,
          code: c.code || c.id,
          title: c.title,
          shortTitle: c.shortTitle || c.title,
        }));
        const mergedMap = new Map<string, (typeof existingCourses)[number]>();
        [...existingCourses, ...addedCourses].forEach((c) => mergedMap.set(c.id, c));
        const updatedStudent: KtnStudentRecord = {
          ...base,
          has_online_courses: mergedMap.size > 0,
          online_courses: Array.from(mergedMap.values()),
        };
        return { message: 'Đã cấp thêm khóa học thành công!', student: updatedStudent };
      }
      return ktnApi.grantStudentCourses({
        email: params.email,
        courseIds: params.courseIds,
      });
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        'Đã cấp thêm khóa học (giữ nguyên lớp trực tiếp)!'
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể cấp khóa học',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const revokeCourseMutation = useMutation({
    mutationFn: async (params: { email: string; courseId: string }) => {
      setDrawerActionError(null);
      if (!params.courseId) {
        throw new Error('Vui lòng chọn khóa học cần thu hồi.');
      }
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const remaining = (base.online_courses || []).filter(
          (c) => c.id !== params.courseId
        );
        const updatedStudent: KtnStudentRecord = {
          ...base,
          has_online_courses: remaining.length > 0,
          online_courses: remaining,
        };
        return { message: 'Đã thu hồi khóa học!', student: updatedStudent };
      }
      return ktnApi.revokeStudentCourse({
        email: params.email,
        courseId: params.courseId,
      });
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        'Đã thu hồi khóa học (giữ nguyên các khóa khác & lớp học)!'
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể thu hồi khóa học',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const assignClassMutation = useMutation({
    mutationFn: async (params: { email: string; classCode: string | null }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const updatedStudent: KtnStudentRecord = {
          ...base,
          class_code: params.classCode,
          has_live_class: Boolean(params.classCode),
        };
        return {
          message: params.classCode
            ? `Đã chuyển sang lớp ${params.classCode}!`
            : 'Đã bỏ xếp lớp trực tiếp!',
          student: updatedStudent,
        };
      }
      return ktnApi.assignStudentClass({
        email: params.email,
        classCode: params.classCode,
      });
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        vars.classCode
          ? `Đã cập nhật lớp trực tiếp (${vars.classCode}) — giữ nguyên quyền khóa học!`
          : 'Đã bỏ xếp lớp trực tiếp — giữ nguyên quyền khóa học!'
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể cập nhật lớp trực tiếp',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const replaceAllCoursesMutation = useMutation({
    mutationFn: async (params: { email: string; courseIds: string[] }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const nextCourses = DEMO_COURSES.filter((c) =>
          params.courseIds.includes(c.id)
        ).map((c) => ({
          id: c.id,
          code: c.code || c.id,
          title: c.title,
          shortTitle: c.shortTitle || c.title,
        }));
        const updatedStudent: KtnStudentRecord = {
          ...base,
          has_online_courses: nextCourses.length > 0,
          online_courses: nextCourses,
        };
        return { message: 'Đã thay thế danh sách khóa học!', student: updatedStudent };
      }
      return ktnApi.replaceAllStudentCourses({
        email: params.email,
        courseIds: params.courseIds,
      });
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        'Đã thay thế toàn bộ danh sách khóa học!'
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể thay thế danh sách khóa học',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (params: {
      email: string;
      name: string;
      phone?: string;
      parentName?: string;
    }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const updatedStudent: KtnStudentRecord = {
          ...base,
          name: params.name,
          phone: params.phone || '',
          parent_name: params.parentName || '',
        };
        return { message: 'Đã lưu thông tin hồ sơ học viên!', student: updatedStudent };
      }
      return ktnApi.updateStudentProfile(params);
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        'Đã cập nhật thông tin hồ sơ học viên!'
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể lưu thông tin học viên',
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
      const normalizedEmail = newStuEmail.trim().toLowerCase();
      const scopedIdempotencyKey = normalizedEmail
        ? `${newStuIdempotencyKey}:${normalizedEmail}`
        : newStuIdempotencyKey;
      return ktnApi.provisionStudent({
        name: newStuName.trim(),
        email: normalizedEmail,
        phone: newStuPhone.trim() || undefined,
        parentName: newStuParent.trim() || undefined,
        classCode: newStuClassCode ? newStuClassCode : null,
        courseIds: newStuCourseIds,
        idempotencyKey: scopedIdempotencyKey,
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
      setNewStuCourseIds([]);
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
      setNewTeacherClasses([]);
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

  const manageLifecycleMutation = useMutation({
    mutationFn: async (params: {
      email: string;
      action: 'suspend' | 'archive' | 'restore' | 'delete';
      reason?: string;
    }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          action: params.action,
          student: selectedStudent
            ? {
                ...selectedStudent,
                accountStatus:
                  params.action === 'suspend'
                    ? ('suspended' as const)
                    : params.action === 'archive'
                    ? ('archived' as const)
                    : params.action === 'delete'
                    ? ('deleted' as const)
                    : ('ready_to_login' as const),
              }
            : undefined,
          message: 'Đã cập nhật trạng thái tài khoản học viên!',
        };
      }
      return ktnApi.manageStudentLifecycle(params);
    },
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      if (vars.action === 'delete') {
        closeStudentDrawer();
      } else if (res.student) {
        setSelectedStudentSnapshot(res.student);
      }
      addToast({
        title: res.message || 'Đã cập nhật trạng thái tài khoản học viên!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: 'Không thể cập nhật trạng thái tài khoản',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const reviewCourseRequestMutation = useMutation({
    mutationFn: async (params: {
      requestId: string;
      decision: 'approve' | 'reject';
      reviewNote?: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return {
          ok: true,
          request: null as unknown as KtnCourseGrantRequest,
          message:
            params.decision === 'approve'
              ? 'Đã phê duyệt & kích hoạt khóa học video cho học viên!'
              : 'Đã từ chối đề nghị mở khóa học.',
        };
      }
      return ktnApi.reviewCourseGrantRequest(params);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-course-grant-requests'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      addToast({
        title: res.message || 'Đã xử lý đề nghị mở khóa học của giáo viên!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể xử lý yêu cầu',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const updateTeacherDetailMutation = useMutation({
    mutationFn: async (payload: {
      code: string;
      name: string;
      email: string;
      phone?: string;
      specialization?: string;
      bio?: string;
      notes?: string;
      active?: boolean;
      password?: string;
      assignedClasses: string[];
      assignedCourses: string[];
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true, message: 'Đã cập nhật hồ sơ giáo viên!' };
      }
      return ktnApi.saveTeacher(payload);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      addToast({
        title: res.message || 'Đã cập nhật hồ sơ & phân công giáo viên!',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể cập nhật giáo viên',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const adjustTeacherPointsMutation = useMutation({
    mutationFn: async (payload: {
      teacherId: string;
      pointsDelta: number;
      reason: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        return { ok: true };
      }
      return ktnApi.adjustTeacherForumPoints(payload);
    },
    onSuccess: (_res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-forum-leaderboard'] });
      addToast({
        title: `Đã ghi nhận ${vars.pointsDelta > 0 ? `+${vars.pointsDelta}` : vars.pointsDelta} điểm đóng góp!`,
        description: `Lý do: ${vars.reason}`,
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể điều chỉnh điểm đóng góp',
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

  // Never fall back to DEMO_COURSES in live mode when catalog API fails
  const coursesList = isDemoMode ? DEMO_COURSES : coursesCatalogQuery.data || [];
  const catalogError =
    !isDemoMode &&
    (coursesCatalogQuery.isError ||
      (!coursesCatalogQuery.isLoading && coursesList.length === 0));
  const classesList = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
  const knownClassIds = useMemo(
    () => new Set(classesList.map((c) => c.id)),
    [classesList]
  );
  const ordersList = ordersQuery.data || [];
  const studentsList = studentSearchQuery.data?.items || [];
  const totalStudentsCount = studentSearchQuery.data?.totalCount ?? studentsList.length;
  const teachersList = teachersQuery.data || [];
  const courseGrantRequestsList = courseGrantRequestsQuery.data || [];
  const pendingCourseRequestsCount = useMemo(
    () => courseGrantRequestsList.filter((r) => r.status === 'pending').length,
    [courseGrantRequestsList]
  );
  const selectedTeacher: KtnTeacherRecord | null = useMemo(() => {
    if (!selectedTeacherKey) return null;
    const norm = selectedTeacherKey.toLowerCase();
    return (
      teachersList.find(
        (t) =>
          String(t.code || '').toLowerCase() === norm ||
          String(t.email || '').toLowerCase() === norm
      ) || null
    );
  }, [selectedTeacherKey, teachersList]);
  const filteredTeachersList = useMemo(() => {
    const q = teacherSearchInput.trim().toLowerCase();
    if (!q) return teachersList;
    return teachersList.filter((t) =>
      [t.code, t.name, t.email, t.phone, ...(t.assigned_classes || [])]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [teachersList, teacherSearchInput]);
  const syncStatus = syncStatusQuery.data;

  const studentInCurrentPage = useMemo(() => {
    if (!selectedStudentEmail) return null;
    const norm = selectedStudentEmail.toLowerCase();
    return studentsList.find((s) => (s.email || '').toLowerCase() === norm) || null;
  }, [selectedStudentEmail, studentsList]);

  // If a student is opened via ?email=... deep-link or is not on the current pagination page, look them up by email
  const selectedStudentLookupQuery = useQuery<KtnStudentRecord | null>({
    queryKey: ['ktn-admin-student-detail-lookup', selectedStudentEmail, isDemoMode],
    queryFn: async () => {
      if (!selectedStudentEmail || isDemoMode) return null;
      const res = await ktnApi.searchStudents({ q: selectedStudentEmail, limit: 10 });
      const norm = selectedStudentEmail.toLowerCase();
      return (
        (res.items || []).find((s) => (s.email || '').toLowerCase() === norm) || null
      );
    },
    enabled:
      Boolean(selectedStudentEmail) &&
      !isDemoMode &&
      !studentInCurrentPage,
  });

  useEffect(() => {
    if (studentInCurrentPage) {
      setSelectedStudentSnapshot(studentInCurrentPage);
    } else if (selectedStudentLookupQuery.data) {
      setSelectedStudentSnapshot(selectedStudentLookupQuery.data);
    }
  }, [studentInCurrentPage, selectedStudentLookupQuery.data]);

  const selectedStudent: KtnStudentRecord | null = useMemo(() => {
    if (!selectedStudentEmail) return null;
    const norm = selectedStudentEmail.toLowerCase();
    if (
      selectedStudentSnapshot &&
      (selectedStudentSnapshot.email || '').toLowerCase() === norm
    ) {
      return selectedStudentSnapshot;
    }
    if (studentInCurrentPage) return studentInCurrentPage;
    if (selectedStudentLookupQuery.data) return selectedStudentLookupQuery.data;
    return null;
  }, [
    selectedStudentEmail,
    selectedStudentSnapshot,
    studentInCurrentPage,
    selectedStudentLookupQuery.data,
  ]);

  const openStudentDrawer = (stu: KtnStudentRecord) => {
    setSelectedStudentSnapshot(stu);
    setSelectedStudentEmail(stu.email.toLowerCase());
  };

  const closeStudentDrawer = () => {
    setSelectedStudentEmail(null);
    setSelectedStudentSnapshot(null);
    if (searchParams.has('email')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('email');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const selectedOrder: KtnOrder | null = useMemo(() => {
    if (!selectedOrderId) return null;
    return ordersList.find((o) => o.order_id === selectedOrderId) || null;
  }, [selectedOrderId, ordersList]);

  const openOrderDrawer = (orderId: string) => {
    setOrderDrawerError(null);
    setSelectedOrderId(orderId);
  };

  const closeOrderDrawer = () => {
    setSelectedOrderId(null);
    setOrderDrawerError(null);
    if (searchParams.has('orderId')) {
      const nextParams = new URLSearchParams(searchParams);
      nextParams.delete('orderId');
      setSearchParams(nextParams, { replace: true });
    }
  };

  const filteredOrdersList = useMemo(() => {
    const q = orderSearchInput.trim().toLowerCase();
    return ordersList.filter((o) => {
      if (q) {
        const hay = [
          o.order_id,
          o.student_name,
          o.parent_name,
          o.student_email,
          o.phone,
          o.parent_phone,
          o.course_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }

      const contactSt = o.contact_status || 'not_called';
      const payDetSt =
        o.payment_detailed_status ||
        (o.payment_status === 'paid' ? 'verified_paid' : 'unpaid');
      const accDetSt =
        o.account_detailed_status ||
        (o.approval_status === 'approved' ? 'activated' : 'no_account');

      switch (orderFilter) {
        case 'new':
          return (
            o.approval_status === 'pending' &&
            contactSt === 'not_called' &&
            payDetSt === 'unpaid'
          );
        case 'not_called':
          return o.approval_status === 'pending' && contactSt === 'not_called';
        case 'called_awaiting_payment':
          return (
            o.approval_status === 'pending' &&
            contactSt !== 'not_called' &&
            o.payment_status !== 'paid' &&
            payDetSt !== 'refunded'
          );
        case 'paid_awaiting_approval':
          return o.approval_status === 'pending' && o.payment_status === 'paid';
        case 'activated':
          return o.approval_status === 'approved' && accDetSt !== 'sync_error';
        case 'needs_error_handling':
          return (
            accDetSt === 'sync_error' ||
            payDetSt === 'amount_mismatch' ||
            o.course_valid === false ||
            o.amount_valid === false
          );
        case 'cancelled_refunded':
          return o.approval_status === 'cancelled' || payDetSt === 'refunded';
        default:
          return true;
      }
    });
  }, [ordersList, orderSearchInput, orderFilter]);

  const hasApiError =
    !isDemoMode &&
    (ordersQuery.isError || studentSearchQuery.isError || classesQuery.isError);

  const showOrders = activeTab === 'all' || activeTab === 'orders';
  const showPermissions = activeTab === 'all' || activeTab === 'more';
  const showStudents = activeTab === 'all' || activeTab === 'students';
  const showTeachers = activeTab === 'all' || activeTab === 'teachers';
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
              {
                id: 'teachers',
                label: `Giáo viên (${teachersList.length})${
                  pendingCourseRequestsCount > 0 ? ` · ${pendingCourseRequestsCount} YC` : ''
                }`,
                to: '/admin/teachers',
              },
              { id: 'classes', label: `Lớp (${classesList.length})`, to: '/admin/classes' },
              { id: 'orders', label: `Đơn hàng (${ordersList.length})`, to: '/admin/orders' },
              { id: 'more', label: 'Đối soát & Đồng bộ', to: '/admin/more' },
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
                Xếp lớp trực tiếp (tùy chọn):
              </label>
              <select
                data-testid="provision-student-class-select"
                value={newStuClassCode}
                onChange={(e) => setNewStuClassCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
              >
                <option value="">— Chưa xếp lớp —</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">
                Cấp khóa học Video (tùy chọn —{' '}
                {newStuCourseIds.length > 0
                  ? `${newStuCourseIds.length} khóa đã chọn`
                  : '— Chưa chọn khóa học —'}
                ):
              </label>
              <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2">
                {coursesList.length === 0 ? (
                  <span className="text-[11px] font-medium text-stone-500">
                    — Chưa chọn khóa học —
                  </span>
                ) : (
                  coursesList.map((course) => {
                    const checked = newStuCourseIds.includes(course.id);
                    return (
                      <button
                        key={course.id}
                        type="button"
                        data-testid={`provision-student-course-btn-${course.id}`}
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
                  })
                )}
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
              Lớp phụ trách (tùy chọn —{' '}
              {newTeacherClasses.length > 0
                ? `${newTeacherClasses.length} lớp đã chọn`
                : '— Chưa xếp lớp —'}
              ):
            </label>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {classesList.map((cls) => {
                const selected = newTeacherClasses.includes(cls.id);
                return (
                  <button
                    key={cls.id}
                    type="button"
                    data-testid={`create-teacher-class-btn-${cls.id}`}
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

      {/* Orders & 3-System Sync Reconciliation Grid */}
      {(showOrders || showPermissions) && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* 3-System Sync Health & Reconciliation Tools (No duplicate student entitlement form) */}
          {showPermissions && (
            <div
              className="space-y-3 rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs lg:col-span-12"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                  <ShieldCheck className="h-4 w-4 text-red-800" />
                  Đối soát & Đồng bộ hệ thống
                </h2>
                <button
                  type="button"
                  data-testid="admin-goto-students-btn"
                  onClick={() => navigate('/admin/students')}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>Mở danh sách Học viên để cấp quyền / xếp lớp</span>
                </button>
              </div>

              <p className="text-[11px] text-stone-600">
                Để cấp khóa học, thu hồi khóa học hoặc chuyển lớp trực tiếp, hãy chọn trực tiếp học viên trong mục{' '}
                <strong className="text-stone-900">Học viên</strong>. Khu vực này dành riêng cho đối soát đồng bộ giữa Web · Supabase · izTeach.
              </p>

              {/* 3-System Sync Health Summary */}
              {syncStatus && (
                <div
                  data-testid="admin-sync-health-card"
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
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
                      {syncStatus.driftItems.slice(0, 6).map((item) => (
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
                          <div className="flex shrink-0 items-center gap-1.5">
                            {VALID_EMAIL_REGEX.test(item.entityKey || '') && (
                              <button
                                type="button"
                                onClick={() =>
                                  navigate(
                                    `/admin/students?email=${encodeURIComponent(item.entityKey)}`
                                  )
                                }
                                className="rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[10px] font-bold text-stone-700 hover:bg-stone-100"
                              >
                                Mở hồ sơ
                              </button>
                            )}
                            {item.retryAction && (
                              <button
                                type="button"
                                onClick={() => retrySyncMutation.mutate(item.retryAction!)}
                                className="rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                Đồng bộ lại
                              </button>
                            )}
                          </div>
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
            </div>
          )}

          {/* Phase 2.1: Full Order Management Table, Search & 7 Filter Presets */}
          {showOrders && (
            <div
              data-testid="admin-orders-section"
              className={`rounded-xl border border-stone-200 bg-white p-4 shadow-2xs ${
                showPermissions && activeTab === 'all' ? 'lg:col-span-12' : 'lg:col-span-12'
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                  <ClipboardList className="h-4 w-4 text-amber-700" />
                  Quản lý đơn hàng ({filteredOrdersList.length}/{ordersList.length})
                </h2>

                {/* Quick Search by Name, Parent, Email, Phone, Order ID */}
                <div className="relative min-w-[230px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="search"
                    data-testid="admin-order-search-input"
                    value={orderSearchInput}
                    onChange={(e) => setOrderSearchInput(e.target.value)}
                    placeholder="Tìm mã đơn, tên HV, tên PH, SĐT, email..."
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* 7 Filter Presets (+ Tất cả) */}
              <div
                data-testid="admin-order-filter-bar"
                className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1"
              >
                {ORDER_FILTER_OPTIONS.map((flt) => (
                  <button
                    key={flt.id}
                    type="button"
                    data-testid={`admin-order-filter-${flt.id}`}
                    onClick={() => setOrderFilter(flt.id)}
                    className={`min-h-[30px] shrink-0 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                      orderFilter === flt.id
                        ? 'bg-red-800 text-white shadow-2xs'
                        : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                    }`}
                  >
                    {flt.label}
                  </button>
                ))}
              </div>

              {filteredOrdersList.length === 0 ? (
                <div
                  data-testid="admin-orders-empty-state"
                  className="mt-3 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-xs text-stone-600"
                >
                  Không có đơn hàng nào khớp bộ lọc hiện tại.
                </div>
              ) : (
                <>
                  {/* Mobile Compact Order Cards (< sm) */}
                  <div className="mt-3 space-y-2.5 sm:hidden">
                    {filteredOrdersList.map((ord) => {
                      const contactSt = ord.contact_status || 'not_called';
                      const payDetSt =
                        ord.payment_detailed_status ||
                        (ord.payment_status === 'paid' ? 'verified_paid' : 'unpaid');
                      const accDetSt =
                        ord.account_detailed_status ||
                        (ord.approval_status === 'approved' ? 'activated' : 'no_account');

                      const contactMeta =
                        CONTACT_STATUS_META[contactSt] || CONTACT_STATUS_META.not_called;
                      const payMeta =
                        PAYMENT_STATUS_META[payDetSt] || PAYMENT_STATUS_META.unpaid;
                      const accMeta =
                        ACCOUNT_STATUS_META[accDetSt] || ACCOUNT_STATUS_META.no_account;
                      const parentNameDisplay =
                        ord.parent_name && ord.parent_name.trim()
                          ? ord.parent_name.trim()
                          : 'Chưa cung cấp';
                      const contactPhone = ord.parent_phone || ord.phone || '—';

                      return (
                        <div
                          key={ord.order_id}
                          data-testid={`admin-order-card-${ord.order_id}`}
                          onClick={() => openOrderDrawer(ord.order_id)}
                          className="cursor-pointer space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-3 transition-colors hover:border-red-300"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-xs font-extrabold text-red-900">
                              {ord.order_id}
                            </span>
                            <span className="font-display text-xs font-extrabold text-stone-900">
                              {formatVnd(ord.amount)}
                            </span>
                          </div>

                          <div className="text-xs">
                            <p className="font-bold text-stone-900">
                              HV: {ord.student_name}
                            </p>
                            <p className="text-[11px] text-stone-600">
                              PH: <strong className="text-stone-800">{parentNameDisplay}</strong> · SĐT:{' '}
                              <strong className="font-mono text-red-900">{contactPhone}</strong>
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-700">
                              {ord.course_name}
                            </p>
                          </div>

                          <div className="flex flex-wrap items-center gap-1">
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${contactMeta.badgeClass}`}
                            >
                              {contactMeta.label}
                            </span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${payMeta.badgeClass}`}
                            >
                              {payMeta.label}
                            </span>
                            <span
                              className={`rounded border px-1.5 py-0.5 text-[10px] font-bold ${accMeta.badgeClass}`}
                            >
                              {accMeta.label}
                            </span>
                          </div>

                          <div className="flex justify-end pt-1">
                            <button
                              type="button"
                              data-testid={`admin-mobile-open-order-btn-${ord.order_id}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openOrderDrawer(ord.order_id);
                              }}
                              className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-3 py-1 text-xs font-bold text-white"
                            >
                              <span>Xem chi tiết</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop Table (>= sm) */}
                  <div className="mt-3 hidden overflow-x-auto sm:block">
                    <table
                      data-testid="admin-orders-table"
                      className="w-full text-left text-xs"
                    >
                      <thead>
                        <tr className="border-b border-stone-200 text-[11px] text-stone-500">
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">Mã đơn</th>
                          <th className="pb-2 pr-2 font-bold">Tên học viên</th>
                          <th className="pb-2 pr-2 font-bold">Tên phụ huynh</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            SĐT liên hệ
                          </th>
                          <th className="pb-2 pr-2 font-bold">Khóa học</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">Số tiền</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            Trạng thái chăm sóc
                          </th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            Trạng thái thanh toán
                          </th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            Trạng thái cấp TK
                          </th>
                          <th className="whitespace-nowrap pb-2 text-right font-bold">
                            Thao tác
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-stone-100">
                        {filteredOrdersList.map((ord) => {
                          const contactSt = ord.contact_status || 'not_called';
                          const payDetSt =
                            ord.payment_detailed_status ||
                            (ord.payment_status === 'paid' ? 'verified_paid' : 'unpaid');
                          const accDetSt =
                            ord.account_detailed_status ||
                            (ord.approval_status === 'approved' ? 'activated' : 'no_account');

                          const contactMeta =
                            CONTACT_STATUS_META[contactSt] || CONTACT_STATUS_META.not_called;
                          const payMeta =
                            PAYMENT_STATUS_META[payDetSt] || PAYMENT_STATUS_META.unpaid;
                          const accMeta =
                            ACCOUNT_STATUS_META[accDetSt] || ACCOUNT_STATUS_META.no_account;
                          const parentNameDisplay =
                            ord.parent_name && ord.parent_name.trim()
                              ? ord.parent_name.trim()
                              : 'Chưa cung cấp';
                          const contactPhone = ord.parent_phone || ord.phone || '—';

                          return (
                            <tr
                              key={ord.order_id}
                              data-testid={`admin-order-row-${ord.order_id}`}
                              onClick={() => openOrderDrawer(ord.order_id)}
                              className="cursor-pointer transition-colors hover:bg-stone-50"
                            >
                              <td className="whitespace-nowrap py-2.5 pr-2 font-mono font-bold text-red-900">
                                <div>{ord.order_id}</div>
                                <div className="font-sans text-[10px] font-medium text-stone-400">
                                  {ord.source_label ||
                                    (ord.source === 'authenticated_student'
                                      ? 'HV đăng nhập'
                                      : 'Website')}
                                </div>
                              </td>
                              <td className="py-2.5 pr-2">
                                <div className="font-bold text-stone-900">
                                  {ord.student_name}
                                </div>
                                <div className="text-[11px] text-stone-500">
                                  {ord.student_email || 'Chưa có email'}
                                </div>
                              </td>
                              <td
                                data-testid={`admin-order-parent-${ord.order_id}`}
                                className={`py-2.5 pr-2 font-semibold ${
                                  parentNameDisplay === 'Chưa cung cấp'
                                    ? 'italic text-stone-400'
                                    : 'text-stone-800'
                                }`}
                              >
                                {parentNameDisplay}
                              </td>
                              <td className="whitespace-nowrap py-2.5 pr-2 font-mono font-bold text-stone-800">
                                {contactPhone}
                              </td>
                              <td className="max-w-[200px] py-2.5 pr-2">
                                <div
                                  className="truncate font-semibold text-stone-900"
                                  title={ord.course_name}
                                >
                                  {ord.course_name}
                                </div>
                              </td>
                              <td className="whitespace-nowrap py-2.5 pr-2 font-display font-extrabold text-red-900">
                                {formatVnd(ord.amount)}
                              </td>
                              <td className="whitespace-nowrap py-2.5 pr-2">
                                <span
                                  data-testid={`admin-order-contact-badge-${ord.order_id}`}
                                  className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${contactMeta.badgeClass}`}
                                >
                                  {contactMeta.label}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-2.5 pr-2">
                                <span
                                  data-testid={`admin-order-payment-badge-${ord.order_id}`}
                                  className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${payMeta.badgeClass}`}
                                >
                                  {payMeta.label}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-2.5 pr-2">
                                <span
                                  data-testid={`admin-order-account-badge-${ord.order_id}`}
                                  className={`inline-block rounded-md border px-2 py-0.5 text-[10px] font-bold ${accMeta.badgeClass}`}
                                >
                                  {accMeta.label}
                                </span>
                              </td>
                              <td className="whitespace-nowrap py-2.5 text-right">
                                <button
                                  type="button"
                                  data-testid={`admin-open-order-btn-${ord.order_id}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openOrderDrawer(ord.order_id);
                                  }}
                                  className="inline-flex min-h-[32px] items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 shadow-2xs hover:bg-red-50"
                                >
                                  <span>Xem chi tiết</span>
                                  <ChevronRight className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
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
            <div>
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <GraduationCap className="h-4 w-4 text-red-800" />
                Danh sách lớp học ({classesList.length}) & Lịch học chính thức
              </h2>
              <p className="mt-0.5 text-[11px] text-stone-500">
                Hệ thống tự động nhắc học viên và giáo viên trước giờ học 30 phút dựa trên lịch chính thức đã xác nhận.
              </p>
            </div>

            <button
              type="button"
              data-testid="admin-create-class-btn"
              onClick={() => {
                setSelectedClassForSchedule(null);
                setScheduleModalMode('create_class');
                setScheduleModalOpen(true);
              }}
              className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>+ Tạo lớp mới</span>
            </button>
          </div>

          <div className="mt-3 divide-y divide-stone-100">
            {classesList.map((cls) => {
              const isConfirmed =
                cls.scheduleStatus === 'confirmed' && Boolean(cls.officialScheduleText);
              const displaySchedule = isConfirmed
                ? `Lớp ${cls.id} — ${cls.officialScheduleText}`
                : 'Chưa có lịch học chính thức';
              return (
                <div
                  key={cls.id}
                  data-testid={`admin-class-row-${cls.id}`}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-xs font-bold text-stone-900 sm:text-sm">
                        {cls.id} · {cls.name}
                      </p>
                      <span
                        data-testid={`class-schedule-status-${cls.id}`}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          isConfirmed
                            ? 'bg-emerald-100 text-emerald-900'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {isConfirmed ? 'Đã có lịch chính thức' : 'Chưa có lịch học chính thức'}
                      </span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                        Buổi {cls.current_lesson}/{cls.total_lessons}
                      </span>
                    </div>

                    <p className="text-[11px] font-medium text-stone-600">
                      GV phụ trách:{' '}
                      <strong className="text-stone-800">{cls.teacher_name}</strong> (
                      {cls.teacher_email || cls.teacher_code})
                    </p>

                    <div className="flex flex-wrap items-center gap-2 text-[11px]">
                      <span
                        data-testid={`class-official-schedule-text-${cls.id}`}
                        className={`inline-flex items-center gap-1 font-semibold ${
                          isConfirmed ? 'text-red-900' : 'text-stone-500'
                        }`}
                      >
                        <Calendar className="h-3.5 w-3.5 text-red-800" />
                        {displaySchedule}
                      </span>

                      {!isConfirmed && cls.legacyScheduleText && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800">
                          Lịch văn bản cũ: &ldquo;{cls.legacyScheduleText}&rdquo; (Cần xác nhận)
                        </span>
                      )}

                      {isConfirmed && cls.nextSession && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          <Clock className="h-3 w-3" />
                          Buổi tới: {cls.nextSession.dayLabel}, {cls.nextSession.sessionDate} (
                          {cls.nextSession.startTime}–{cls.nextSession.endTime})
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <button
                      type="button"
                      data-testid={`admin-edit-schedule-btn-${cls.id}`}
                      onClick={() => {
                        setSelectedClassForSchedule(cls);
                        setScheduleModalMode('edit_schedule');
                        setScheduleModalOpen(true);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100"
                    >
                      <Calendar className="h-3.5 w-3.5" />
                      <span>{isConfirmed ? 'Chỉnh lịch' : 'Cài lịch học'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <ClassScheduleModal
        open={scheduleModalOpen}
        mode={scheduleModalMode}
        role="admin"
        classItem={selectedClassForSchedule}
        teachers={teachersList}
        isSubmitting={isSavingSchedule}
        onClose={() => setScheduleModalOpen(false)}
        onSaveClassAndSchedule={async ({
          isCreateClass,
          classCode,
          className,
          teacherCode,
          teacherEmail,
          totalLessons,
          schedulePayload,
        }) => {
          setIsSavingSchedule(true);
          try {
            if (!isDemoMode) {
              await ktnApi.saveClass({
                id: classCode,
                name: className,
                teacher_code: teacherCode,
                teacher_email: teacherEmail,
                total_lessons: totalLessons,
                schedule:
                  schedulePayload.status === 'confirmed'
                    ? undefined
                    : selectedClassForSchedule?.schedule || '',
              });
              if (
                schedulePayload.status === 'confirmed' ||
                schedulePayload.daysOfWeek.length > 0 ||
                schedulePayload.customSessions.length > 0 ||
                selectedClassForSchedule?.scheduleConfig
              ) {
                await ktnApi.saveClassSchedule(schedulePayload);
              }
            }
            await queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
            addToast({
              title: isCreateClass
                ? `Đã tạo lớp ${classCode}`
                : `Đã cập nhật lịch học lớp ${classCode}`,
              description:
                schedulePayload.status === 'confirmed'
                  ? 'Lịch học chính thức đã được lưu và đồng bộ bộ nhắc tự động.'
                  : 'Thông tin lớp học đã được lưu.',
              variant: 'success',
            });
            setScheduleModalOpen(false);
          } finally {
            setIsSavingSchedule(false);
          }
        }}
      />

      {/* Teacher Roster, Performance Metrics & Course Grant Requests Approval Inbox (Agent F + Agent E) */}
      {showTeachers && (
        <div className="space-y-4">
          <div
            data-testid="admin-teachers-section"
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <Award className="h-4 w-4 text-red-800" />
                Quản lý giáo viên & Hiệu suất ({filteredTeachersList.length})
                {teachersQuery.isFetching && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[200px]">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="search"
                    data-testid="admin-teacher-search-input"
                    value={teacherSearchInput}
                    onChange={(e) => setTeacherSearchInput(e.target.value)}
                    placeholder="Tìm tên, email, mã GV, lớp..."
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreateTeacherModal(true)}
                  className="inline-flex min-h-[32px] items-center gap-1 rounded-xl bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                >
                  <UserPlus className="h-3.5 w-3.5" />
                  <span>+ Tạo giáo viên</span>
                </button>
              </div>
            </div>

            {filteredTeachersList.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-xs text-stone-600">
                Chưa có giáo viên phù hợp.
              </div>
            ) : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="pb-2 pr-2 font-bold">Giáo viên</th>
                      <th className="pb-2 pr-2 font-bold">Lớp phụ trách</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Lịch / Thực dạy</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Bài đã chấm</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Diễn đàn</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Điểm đóng góp</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Trạng thái</th>
                      <th className="whitespace-nowrap pb-2 text-right font-bold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTeachersList.map((teacher) => {
                      const stats = teacher.stats || {
                        scheduledSessionsCount: teacher.scheduledSessionsCount || 0,
                        confirmedTaughtSessionsCount: teacher.confirmedSessionsCount || 0,
                        cancelledOrSubstituteSessionsCount: 0,
                        unverifiedTeachingLog:
                          teacher.teachingVerificationStatus !== 'verified',
                        submissionsReviewedCount: teacher.gradedHomeworksCount || 0,
                        pendingGradingCount: teacher.pendingHomeworksCount || 0,
                        avgGradingHours: teacher.avgGradingTurnaroundHours ?? null,
                        forumAnswersCount: teacher.forumAnswersCount || 0,
                        acceptedAnswersCount: teacher.acceptedAnswersCount || 0,
                        videoAnswersCount: teacher.videoGuidesCount || 0,
                        totalContributionPoints: teacher.totalContributionPoints || 0,
                      };
                      const classes = Array.isArray(teacher.assigned_classes)
                        ? teacher.assigned_classes
                        : [];
                      const isLocked =
                        teacher.active === false ||
                        teacher.status === 'locked' ||
                        teacher.status === 'inactive';

                      return (
                        <tr
                          key={teacher.email}
                          data-testid={`admin-teacher-row-${teacher.email}`}
                          onClick={() => setSelectedTeacherKey(teacher.email)}
                          className="cursor-pointer transition-colors hover:bg-stone-50"
                        >
                          <td className="py-2.5 pr-2">
                            <div className="font-bold text-stone-900">{teacher.name}</div>
                            <div className="text-[11px] text-stone-500">
                              {teacher.email}
                              {teacher.code ? ` · ${teacher.code}` : ''}
                            </div>
                          </td>
                          <td className="py-2.5 pr-2">
                            {classes.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {classes.map((cls) => (
                                  <span
                                    key={cls}
                                    className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900"
                                  >
                                    {cls}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span className="text-stone-400">Chưa phân công</span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <div className="font-bold text-stone-800">
                              Lịch: {stats.scheduledSessionsCount} · Thực dạy:{' '}
                              <span className="text-emerald-700">
                                {stats.confirmedTaughtSessionsCount}
                              </span>
                            </div>
                            {stats.unverifiedTeachingLog && (
                              <span
                                data-testid={`teacher-unverified-badge-${teacher.email}`}
                                className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                              >
                                Chưa xác minh số buổi thực dạy
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <span className="font-bold text-stone-900">
                              {stats.submissionsReviewedCount}
                            </span>
                            {stats.pendingGradingCount > 0 && (
                              <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                                Tồn: {stats.pendingGradingCount}
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <span className="font-bold text-stone-900">
                              {stats.forumAnswersCount} trả lời
                            </span>
                            {stats.acceptedAnswersCount > 0 && (
                              <span className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                                {stats.acceptedAnswersCount} hữu ích
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900">
                              <Award className="h-3 w-3" />
                              {stats.totalContributionPoints} điểm
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <span
                              className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                isLocked
                                  ? 'bg-red-100 text-red-900'
                                  : 'bg-emerald-100 text-emerald-900'
                              }`}
                            >
                              {isLocked ? 'Tạm khóa' : 'Đang hoạt động'}
                            </span>
                          </td>
                          <td className="whitespace-nowrap py-2.5 text-right">
                            <button
                              type="button"
                              data-testid={`admin-open-teacher-btn-${teacher.email}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTeacherKey(teacher.email);
                              }}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 shadow-2xs hover:bg-red-50"
                            >
                              <span>Hồ sơ & Hiệu suất</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Course Grant Requests Inbox (Teacher requests for Student Online Course access) */}
          <div
            data-testid="admin-course-requests-inbox"
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <BookOpen className="h-4 w-4 text-red-800" />
                Yêu cầu cấp khóa học online từ Giáo viên ({courseGrantRequestsList.length})
              </h3>
            </div>

            {courseGrantRequestsList.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">
                Chưa có yêu cầu cấp khóa học online nào từ giáo viên.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {courseGrantRequestsList.map((req) => (
                  <div
                    key={req.id}
                    data-testid={`admin-course-request-item-${req.id}`}
                    className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-bold text-stone-900">
                          HV: {req.student_name || req.student_email}
                        </span>
                        <span className="text-stone-500">({req.student_email})</span>
                        {req.class_code && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                            Lớp {req.class_code}
                          </span>
                        )}
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                            req.status === 'approved'
                              ? 'bg-emerald-100 text-emerald-900'
                              : req.status === 'rejected'
                              ? 'bg-red-100 text-red-900'
                              : 'bg-amber-100 text-amber-900'
                          }`}
                        >
                          {req.status === 'approved'
                            ? 'Đã duyệt'
                            : req.status === 'rejected'
                            ? 'Đã từ chối'
                            : 'Chờ duyệt'}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-stone-700">
                        Khóa đề nghị:{' '}
                        {(req.requested_course_titles && req.requested_course_titles.length > 0
                          ? req.requested_course_titles
                          : req.requested_course_ids && req.requested_course_ids.length > 0
                          ? req.requested_course_ids
                          : [req.course_title || req.course_id]
                        ).join(', ')}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        Giáo viên đề nghị: {req.teacher_name || req.teacher_email} · Lý do:{' '}
                        {req.reason || 'Không ghi chú'}
                      </p>
                    </div>

                    {req.status === 'pending' && (
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          data-testid={`admin-approve-course-request-${req.id}`}
                          disabled={reviewCourseRequestMutation.isPending}
                          onClick={() =>
                            reviewCourseRequestMutation.mutate({
                              requestId: req.id,
                              decision: 'approve',
                            })
                          }
                          className="rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                        >
                          Duyệt & Mở khóa
                        </button>
                        <button
                          type="button"
                          data-testid={`admin-reject-course-request-${req.id}`}
                          disabled={reviewCourseRequestMutation.isPending}
                          onClick={() =>
                            reviewCourseRequestMutation.mutate({
                              requestId: req.id,
                              decision: 'reject',
                              reviewNote: 'Quản lý từ chối yêu cầu',
                            })
                          }
                          className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-50 disabled:opacity-50"
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Student Roster with Ultra-Fast Server-Side Search, Filters & Unified Detail Drawer */}
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
              {studentSearchQuery.isFetching && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
              )}
            </h2>

            {/* Search, Filter & Quick Create Bar */}
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
                <option value="NONE">— Chưa xếp lớp —</option>
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
                {disambiguateCatalogCourses(coursesList).map((course) => (
                  <option key={course.id} value={course.id}>
                    {course.displayLabel}
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
                <option value="ALL">Mọi đồng bộ</option>
                <option value="synced">Đã đồng bộ</option>
                <option value="pending_activation">Chờ kích hoạt</option>
                <option value="needs_resync">Cần đồng bộ lại</option>
              </select>

              <select
                aria-label="Lọc theo vòng đời tài khoản"
                data-testid="admin-filter-account-status"
                value={accountStatusFilter}
                onChange={(e) => {
                  setAccountStatusFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ACTIVE">Đang học (ẩn Lưu trữ)</option>
                <option value="ALL">Mọi tài khoản</option>
                <option value="locked">Tạm khóa</option>
                <option value="archived">Đã lưu trữ</option>
              </select>

              <button
                type="button"
                data-testid="admin-roster-create-student-btn"
                onClick={() => setShowCreateStudentModal(true)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-xl bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-900"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>+ Tạo học viên</span>
              </button>
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
              {/* Mobile Compact Cards (< sm) */}
              <div className="mt-2.5 divide-y divide-stone-100 sm:hidden">
                {studentsList.map((stu) => {
                  const resolvedCourses = resolveStudentOnlineCourses(
                    stu.online_courses,
                    coursesList
                  );
                  const visibleCourses = resolvedCourses.slice(0, 2);
                  const extraCoursesCount = Math.max(0, resolvedCourses.length - 2);
                  const hasLegacyInvalidClass =
                    Boolean(stu.class_code) &&
                    classesList.length > 0 &&
                    !knownClassIds.has(stu.class_code!);
                  const isSelected =
                    selectedStudentEmail === (stu.email || '').toLowerCase();

                  return (
                    <div
                      key={stu.code || stu.email}
                      data-testid={`admin-student-card-${stu.email}`}
                      onClick={() => openStudentDrawer(stu)}
                      className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl px-2 py-2.5 transition-colors ${
                        isSelected ? 'bg-red-50/70' : 'hover:bg-stone-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <p className="truncate text-xs font-bold text-stone-900">
                            {stu.name}
                          </p>
                          <span className="shrink-0 font-mono text-[10px] text-stone-400">
                            {stu.code}
                          </span>
                        </div>
                        <p className="truncate text-[11px] text-stone-500">
                          {stu.email}
                          {stu.phone ? ` · ${stu.phone}` : ''}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          {stu.class_code ? (
                            <span className="inline-block whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                              {stu.class_code}
                            </span>
                          ) : (
                            <span className="inline-block whitespace-nowrap rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                              Chưa xếp lớp
                            </span>
                          )}
                          {hasLegacyInvalidClass && (
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Cần kiểm tra mã lớp
                            </span>
                          )}
                          {visibleCourses.map((c) => (
                            <span
                              key={c.id}
                              className="max-w-[150px] truncate rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                            >
                              {c.shortTitle || c.title}
                            </span>
                          ))}
                          {extraCoursesCount > 0 && (
                            <span
                              data-testid={`student-mobile-extra-courses-badge-${stu.email}`}
                              className="whitespace-nowrap rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-700"
                            >
                              +{extraCoursesCount} khóa
                            </span>
                          )}
                        </div>
                      </div>
                      <button
                        type="button"
                        data-testid={`admin-mobile-open-student-btn-${stu.email}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          openStudentDrawer(stu);
                        }}
                        className="inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 shadow-2xs"
                      >
                        <span>Xem / Sửa</span>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>

              {/* Desktop Table (>= sm) */}
              <div className="mt-3 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-stone-200 text-stone-500">
                      <th className="pb-2 pr-2 font-bold">Học viên</th>
                      <th className="pb-2 pr-2 font-bold">Email / SĐT</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                        Lớp trực tiếp
                      </th>
                      <th className="pb-2 pr-2 font-bold">Khóa học đã mở</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                        Trạng thái & Đồng bộ
                      </th>
                      <th className="whitespace-nowrap pb-2 text-right font-bold">
                        Thao tác
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {studentsList.map((stu) => {
                      const resolvedCourses = resolveStudentOnlineCourses(
                        stu.online_courses,
                        coursesList
                      );
                      const visibleCourses = resolvedCourses.slice(0, 2);
                      const extraCoursesCount = Math.max(0, resolvedCourses.length - 2);
                      const hasLegacyInvalidClass =
                        Boolean(stu.class_code) &&
                        classesList.length > 0 &&
                        !knownClassIds.has(stu.class_code!);
                      const isSelected =
                        selectedStudentEmail === (stu.email || '').toLowerCase();

                      const rawSync = String(
                        stu.syncStatus || stu.sync_status || 'synced'
                      ).toLowerCase();
                      const rawAccount = String(
                        stu.accountStatus || stu.account_status || 'ready_to_login'
                      ).toLowerCase();
                      const isSyncError =
                        rawSync === 'error' ||
                        rawSync === 'failed' ||
                        rawSync === 'sync_failed' ||
                        rawSync === 'partial_failure' ||
                        rawSync === 'needs_resync' ||
                        Boolean(stu.last_sync_error);
                      const isPendingActivation =
                        rawAccount === 'pending_activation' ||
                        rawSync === 'pending_activation' ||
                        rawSync === 'pending_sync' ||
                        rawSync === 'pending';

                      return (
                        <tr
                          key={stu.code || stu.email}
                          data-testid={`admin-student-row-${stu.email}`}
                          tabIndex={0}
                          role="button"
                          aria-label={`Mở hồ sơ học viên ${stu.name}`}
                          onClick={() => openStudentDrawer(stu)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openStudentDrawer(stu);
                            }
                          }}
                          className={`cursor-pointer transition-colors focus:outline-none focus:ring-2 focus:ring-inset focus:ring-red-800 ${
                            isSelected ? 'bg-red-50/70' : 'hover:bg-stone-50'
                          }`}
                        >
                          <td className="py-2.5 pr-2 font-bold text-stone-900">
                            <div className="group-hover:text-red-800">{stu.name}</div>
                            <div className="font-mono text-[10px] font-normal text-stone-400">
                              {stu.code}
                            </div>
                          </td>
                          <td className="py-2.5 pr-2 text-stone-600">
                            <div className="font-medium text-stone-800">{stu.email}</div>
                            {stu.phone && (
                              <div className="text-[11px] text-stone-400">{stu.phone}</div>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            {stu.class_code ? (
                              <div className="inline-flex flex-wrap items-center gap-1">
                                <span
                                  data-testid={`student-class-badge-${stu.email}`}
                                  className="inline-block whitespace-nowrap rounded-md bg-red-100 px-2 py-0.5 font-bold text-red-900"
                                >
                                  {stu.class_code}
                                </span>
                                {hasLegacyInvalidClass && (
                                  <span
                                    data-testid={`student-legacy-class-badge-${stu.email}`}
                                    className="inline-flex items-center gap-0.5 whitespace-nowrap rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                                  >
                                    <AlertTriangle className="h-3 w-3" />
                                    Cần kiểm tra mã lớp
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="whitespace-nowrap text-stone-400">
                                Chưa xếp lớp
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 pr-2">
                            {resolvedCourses.length > 0 ? (
                              <div className="flex flex-wrap items-center gap-1">
                                {visibleCourses.map((c) => (
                                  <span
                                    key={c.id}
                                    className="max-w-[180px] truncate rounded bg-emerald-100 px-2 py-0.5 text-[11px] font-bold text-emerald-900"
                                    title={c.title}
                                  >
                                    {c.shortTitle || c.title}
                                  </span>
                                ))}
                                {extraCoursesCount > 0 && (
                                  <span
                                    data-testid={`student-extra-courses-badge-${stu.email}`}
                                    className="whitespace-nowrap rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-bold text-stone-700"
                                    title={resolvedCourses
                                      .slice(2)
                                      .map((c) => c.title)
                                      .join(', ')}
                                  >
                                    +{extraCoursesCount} khóa
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-semibold text-amber-700">
                                Chưa mở khóa
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            {isSyncError ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retrySyncMutation.mutate({
                                    type: 'student_sync',
                                    email: stu.email,
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-red-100 px-2 py-0.5 text-[11px] font-bold text-red-900 hover:bg-red-200"
                              >
                                <AlertCircle className="h-3 w-3" />
                                Lỗi đồng bộ (Đồng bộ lại)
                              </button>
                            ) : isPendingActivation ? (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  retrySyncMutation.mutate({
                                    type: 'student_provision',
                                    email: stu.email,
                                  });
                                }}
                                className="inline-flex items-center gap-1 rounded-md bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900 hover:bg-amber-200"
                              >
                                <RefreshCw className="h-3 w-3" />
                                Chờ kích hoạt (Đồng bộ lại)
                              </button>
                            ) : hasLegacyInvalidClass ? (
                              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                <AlertTriangle className="h-3 w-3" />
                                Cần kiểm tra mã lớp
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                <CheckCircle2 className="h-3 w-3" />
                                Đã đồng bộ
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 text-right">
                            <button
                              type="button"
                              data-testid={`admin-open-student-btn-${stu.email}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                openStudentDrawer(stu);
                              }}
                              className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-800 shadow-2xs hover:bg-red-50"
                            >
                              <span>Xem / Sửa</span>
                              <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
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

      {/* Unified Student Detail Drawer (Desktop slide-over / Mobile full-screen) */}
      <StudentDetailDrawer
        student={selectedStudent}
        open={Boolean(selectedStudent)}
        onClose={closeStudentDrawer}
        catalogCourses={coursesList}
        catalogError={catalogError}
        catalogLoading={coursesCatalogQuery.isLoading}
        onRetryCatalog={() => {
          coursesCatalogQuery.refetch();
        }}
        classesList={classesList}
        actionError={drawerActionError}
        onClearError={() => setDrawerActionError(null)}
        isGrantingCourse={grantCoursesMutation.isPending}
        isRevokingCourse={revokeCourseMutation.isPending}
        isAssigningClass={assignClassMutation.isPending}
        isReplacingCourses={replaceAllCoursesMutation.isPending}
        isUpdatingProfile={updateProfileMutation.isPending}
        isResyncing={retrySyncMutation.isPending}
        isManagingLifecycle={manageLifecycleMutation.isPending}
        onGrantCourses={(params) => grantCoursesMutation.mutateAsync(params)}
        onRevokeCourse={(params) => revokeCourseMutation.mutateAsync(params)}
        onAssignClass={(params) => assignClassMutation.mutateAsync(params)}
        onReplaceAllCourses={(params) => replaceAllCoursesMutation.mutateAsync(params)}
        onUpdateProfile={(params) => updateProfileMutation.mutateAsync(params)}
        onManageLifecycle={(params) => manageLifecycleMutation.mutateAsync(params)}
        onResyncStudent={(stu) => {
          const rawAcc = String(stu.accountStatus || stu.account_status || '').toLowerCase();
          const rawSyn = String(stu.syncStatus || stu.sync_status || '').toLowerCase();
          retrySyncMutation.mutate({
            type:
              !stu.cognito_user_id ||
              rawAcc === 'pending_activation' ||
              rawSyn === 'pending_activation' ||
              rawSyn === 'pending_sync'
                ? 'student_provision'
                : 'student_sync',
            email: stu.email,
          });
        }}
        onCopyEmail={(email) => {
          navigator.clipboard?.writeText(email).catch(() => {});
          addToast({
            title: `Đã sao chép email: ${email}`,
            variant: 'success',
          });
        }}
      />

      {/* Teacher Profile & Performance Drawer (Agent F) */}
      <TeacherDetailDrawer
        teacher={selectedTeacher}
        open={Boolean(selectedTeacherKey)}
        isOpen={Boolean(selectedTeacherKey)}
        onClose={() => setSelectedTeacherKey(null)}
        classesList={classesList}
        catalogCourses={coursesList}
        isSaving={updateTeacherDetailMutation.isPending}
        isAdjustingPoints={adjustTeacherPointsMutation.isPending}
        onSaveTeacher={(payload) => updateTeacherDetailMutation.mutateAsync(payload)}
        onAdjustForumPoints={(payload) => adjustTeacherPointsMutation.mutateAsync(payload)}
      />

      {/* Order Detail Drawer (Phase 2.2 & 2.3 & Phase 3) */}
      <OrderDetailDrawer
        key={selectedOrder?.order_id || 'closed'}
        order={selectedOrder}
        open={Boolean(selectedOrder)}
        onClose={closeOrderDrawer}
        classesList={classesList}
        isUpdatingOrder={updateOrderMutation.isPending}
        isApprovingOrder={approveOrderMutation.isPending}
        actionError={orderDrawerError}
        ephemeralPassword={
          selectedOrder
            ? orderEphemeralPasswords[selectedOrder.order_id] || null
            : null
        }
        onClearError={() => setOrderDrawerError(null)}
        onUpdateOrder={(params) => updateOrderMutation.mutateAsync(params)}
        onApproveOrder={(params) => approveOrderMutation.mutateAsync(params)}
        onOpenStudentProfile={(email) => {
          closeOrderDrawer();
          setSelectedStudentEmail(email.trim().toLowerCase());
        }}
      />
    </div>
  );
};
