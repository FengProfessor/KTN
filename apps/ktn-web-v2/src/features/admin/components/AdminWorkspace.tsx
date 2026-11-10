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
  Trash2,
} from 'lucide-react';
import { ktnApi, KtnApiError } from '@/services/api/ktnApiClient';
import { ChatRoom } from '@/features/chat/types/chat.types';
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

type KtnClassWithCounts = KtnClassItem & {
  student_count?: number;
  studentCount?: number;
  activeStudentCount?: number;
  studentsCount?: number;
  students_count?: number;
  roomId?: string;
};

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
  const [recentlyCreatedClass, setRecentlyCreatedClass] = useState<{
    id: string;
    name: string;
    teacherName: string;
    roomId: string;
  } | null>(null);

  // Safe Soft-Delete Class modal state (C2)
  const [classToDelete, setClassToDelete] = useState<KtnClassWithCounts | null>(null);
  const [deleteClassConfirmInput, setDeleteClassConfirmInput] = useState('');
  const [deleteClassError, setDeleteClassError] = useState<string | null>(null);
  const [deleteClassBlockedStudentCount, setDeleteClassBlockedStudentCount] = useState<
    number | null
  >(null);

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

  const demoStudentOverridesRef = React.useRef<Record<string, KtnStudentRecord>>({});
  const demoTeacherOverridesRef = React.useRef<Record<string, KtnTeacherRecord>>({});
  const demoClassesRef = React.useRef<KtnClassWithCounts[] | null>(null);
  const lastKnownClassStudentCountsRef = React.useRef<Record<string, number>>({});

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
        const baseDemoRows: KtnStudentRecord[] = [
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
        const mergedMap = new Map<string, KtnStudentRecord>();
        baseDemoRows.forEach((r) => mergedMap.set(r.email.toLowerCase(), r));
        Object.entries(demoStudentOverridesRef.current).forEach(([em, row]) => {
          mergedMap.set(em.toLowerCase(), row);
        });
        const qNorm = debouncedQ.trim().toLowerCase();
        const accFilterLower = accountStatusFilter.toLowerCase();
        const demoRows = Array.from(mergedMap.values()).filter((stu) => {
          const effStatus = String(
            stu.lifecycleStatus || stu.accountStatus || stu.account_status || 'ready_to_login'
          ).toLowerCase();
          if (effStatus === 'deleted' && accFilterLower !== 'deleted') return false;
          if (effStatus === 'archived' && accFilterLower !== 'archived') return false;
          if (accountStatusFilter !== 'ALL' && effStatus !== accFilterLower) {
            if (
              !(
                (accFilterLower === 'active' || accFilterLower === 'ready_to_login') &&
                (effStatus === 'active' || effStatus === 'ready_to_login')
              )
            ) {
              return false;
            }
          }
          if (classFilter !== 'ALL') {
            if (classFilter === 'NONE') {
              if (stu.class_code) return false;
            } else if ((stu.class_code || '').toUpperCase() !== classFilter.toUpperCase()) {
              return false;
            }
          }
          if (courseFilter !== 'ALL') {
            const hasC = (stu.online_courses || []).some((c) => c.id === courseFilter);
            if (!hasC) return false;
          }
          if (qNorm) {
            const hay = [stu.code, stu.name, stu.email, stu.phone, stu.parent_name]
              .filter(Boolean)
              .join(' ')
              .toLowerCase();
            if (!hay.includes(qNorm)) return false;
          }
          return true;
        });
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

  const classesQuery = useQuery<KtnClassWithCounts[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        if (!demoClassesRef.current) {
          demoClassesRef.current = DEMO_CLASSES.map((c) => ({ ...c }));
        }
        return demoClassesRef.current.filter((c) => c.active !== false);
      }
      const list = await ktnApi.getClasses();
      return (list || []).filter((c) => c.active !== false);
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const teachersQuery = useQuery<KtnTeacherRecord[]>({
    queryKey: ['ktn-admin-teachers', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        const baseTeachers: KtnTeacherRecord[] = [
          {
            code: 'GV-KTN-08',
            name: 'Cô Lâm Mỹ Linh',
            email: 'linh.lam@khongtunhi.com',
            phone: '0901112233',
            specialty: 'HSK 1-4, YCT thiếu nhi',
            specialization: 'HSK 1-4, YCT thiếu nhi',
            assigned_classes: ['YCT2-04', 'YCT3-02'],
            assigned_courses: ['6adadba969897b0002482ca5'],
            active: true,
            provisioningStatus: 'ready_to_login',
            syncStatus: 'synced',
            managedStudentsCount: 12,
            scheduledSessionsCount: 8,
            activitySessionsCount: 4,
            recordedClassSessionsCount: 4,
            confirmedSessionsCount: 0,
            attendanceConfirmedSessionsCount: 0,
            teachingVerificationStatus: 'unverified',
            gradedHomeworksCount: 15,
            pendingHomeworksCount: 1,
            avgGradingTurnaroundHours: 2.4,
            forumAnswersCount: 3,
            videoGuidesCount: 1,
            forumVideoAnswersCount: 1,
            acceptedAnswersCount: 2,
            forumAcceptedAnswersCount: 2,
            totalContributionPoints: 40,
            monthlyContributionPoints: 23,
          },
        ];
        const tMap = new Map<string, KtnTeacherRecord>();
        baseTeachers.forEach((t) => tMap.set(t.email.toLowerCase(), t));
        Object.entries(demoTeacherOverridesRef.current).forEach(([em, row]) => {
          tMap.set(em.toLowerCase(), row);
        });
        return Array.from(tMap.values());
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
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
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
      const emailKey = (res.student.email || fallbackEmail || '').toLowerCase();
      if (emailKey) {
        demoStudentOverridesRef.current[emailKey] = res.student;
      }
      setSelectedStudentSnapshot(res.student);
    }
    queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
    queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
    queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
    queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
    queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
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
      const prevClassCode = selectedStudent?.class_code || null;
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
          prevClassCode,
        };
      }
      const res = await ktnApi.assignStudentClass({
        email: params.email,
        classCode: params.classCode,
      });
      return { ...res, prevClassCode };
    },
    onSuccess: (res, vars) => {
      const prevClass = (res.prevClassCode || '').trim().toUpperCase();
      const nextClass = (vars.classCode || '').trim().toUpperCase();
      if (prevClass !== nextClass) {
        if (
          prevClass &&
          typeof lastKnownClassStudentCountsRef.current[prevClass] === 'number'
        ) {
          lastKnownClassStudentCountsRef.current[prevClass] = Math.max(
            0,
            lastKnownClassStudentCountsRef.current[prevClass] - 1
          );
        }
        if (nextClass) {
          lastKnownClassStudentCountsRef.current[nextClass] =
            (lastKnownClassStudentCountsRef.current[nextClass] ?? 0) + 1;
        }
        const updateClassCounts = (list: KtnClassWithCounts[]) =>
          list.map((c) => {
            const code = String(c.id || '').trim().toUpperCase();
            const rawCount =
              c.studentCount ??
              c.student_count ??
              c.activeStudentCount ??
              c.studentsCount ??
              c.students_count;
            if (typeof rawCount !== 'number') return c;
            if (code === prevClass) {
              const dec = Math.max(0, rawCount - 1);
              return {
                ...c,
                studentCount: dec,
                student_count: dec,
                activeStudentCount: dec,
              };
            }
            if (code === nextClass) {
              const inc = rawCount + 1;
              return {
                ...c,
                studentCount: inc,
                student_count: inc,
                activeStudentCount: inc,
              };
            }
            return c;
          });
        if (isDemoMode && demoClassesRef.current) {
          demoClassesRef.current = updateClassCounts(demoClassesRef.current);
        }
        queryClient.setQueriesData<KtnClassWithCounts[]>(
          { queryKey: ['ktn-classes'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
          (prev) => (Array.isArray(prev) ? updateClassCounts(prev) : prev)
        );
      }
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
      if (res.student?.email) {
        demoStudentOverridesRef.current[res.student.email.toLowerCase()] = res.student;
      }
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
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
      if (res.teacher?.email) {
        const emailKey = res.teacher.email.toLowerCase();
        demoTeacherOverridesRef.current[emailKey] = {
          ...(demoTeacherOverridesRef.current[emailKey] || {}),
          ...res.teacher,
        };
      }
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
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
      confirmDelete?: boolean;
    }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        const nextStatus =
          params.action === 'suspend'
            ? ('suspended' as const)
            : params.action === 'archive'
            ? ('archived' as const)
            : params.action === 'delete'
            ? ('deleted' as const)
            : ('ready_to_login' as const);
        return {
          ok: true,
          email: params.email,
          action: params.action,
          status: nextStatus === 'ready_to_login' ? ('active' as const) : nextStatus,
          reverseSyncBlocked: params.action === 'delete',
          preservedOrders: true,
          upstreamVerified: false,
          student: selectedStudent
            ? {
                ...selectedStudent,
                accountStatus: nextStatus,
                account_status: nextStatus,
                lifecycleStatus:
                  nextStatus === 'ready_to_login' ? 'active' : nextStatus,
              }
            : undefined,
          message:
            params.action === 'delete'
              ? `Đã gỡ ${params.email} khỏi danh sách hoạt động Supabase và chặn đồng bộ ngược (chưa xác minh xóa cứng Cognito/izTeach, giữ nguyên đơn hàng).`
              : 'Đã cập nhật trạng thái tài khoản học viên!',
        };
      }
      return ktnApi.manageStudentLifecycle(params);
    },
    onSuccess: (res, vars) => {
      const resRecord = res as unknown as Record<string, unknown>;
      const upstreamVerified = Boolean(
        resRecord?.upstreamVerified === true ||
          (resRecord?.cognitoDeleted === true && resRecord?.izteachDeleted === true)
      );

      const nextStatus =
        vars.action === 'suspend'
          ? ('suspended' as const)
          : vars.action === 'archive'
          ? ('archived' as const)
          : vars.action === 'delete'
          ? ('deleted' as const)
          : ('ready_to_login' as const);
      const nextLifecycle =
        nextStatus === 'ready_to_login' ? ('active' as const) : nextStatus;

      const updatedStudent: KtnStudentRecord | null = res.student
        ? {
            ...res.student,
            accountStatus: res.student.accountStatus || nextStatus,
            account_status: res.student.account_status || nextStatus,
            lifecycleStatus: res.student.lifecycleStatus || nextLifecycle,
          }
        : selectedStudent
        ? {
            ...selectedStudent,
            accountStatus: nextStatus,
            account_status: nextStatus,
            lifecycleStatus: nextLifecycle,
          }
        : null;

      if (updatedStudent) {
        const emailKey = (updatedStudent.email || vars.email || '').toLowerCase();
        if (emailKey) {
          demoStudentOverridesRef.current[emailKey] = updatedStudent;
        }
        setSelectedStudentSnapshot(updatedStudent);
      }

      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });

      if (vars.action === 'delete' && !upstreamVerified) {
        addToast({
          title:
            'Đã xử lý xóa có điều kiện trên Supabase (Chưa xác minh xóa Cognito/izTeach)',
          description:
            'Hồ sơ hoạt động đã gỡ khỏi Supabase & chặn đồng bộ ngược. Đơn hàng/lịch sử học tập được bảo toàn; tài khoản gốc Cognito/izTeach chưa xóa cứng.',
          variant: 'warning',
        });
      } else {
        addToast({
          title: res.message || 'Đã cập nhật trạng thái tài khoản học viên!',
          variant: 'success',
        });
      }
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
      specialty?: string;
      bio?: string;
      notes?: string;
      active?: boolean;
      password?: string;
      initialPassword?: string;
      assignedClasses: string[];
      assignedCourses: string[];
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        const emailKey = (payload.email || '').toLowerCase();
        if (emailKey) {
          demoTeacherOverridesRef.current[emailKey] = {
            ...(demoTeacherOverridesRef.current[emailKey] || {}),
            code: payload.code,
            name: payload.name,
            email: payload.email,
            phone: payload.phone,
            specialization: payload.specialization || payload.specialty,
            specialty: payload.specialty || payload.specialization,
            bio: payload.bio,
            notes: payload.notes,
            active: payload.active !== false,
            status: payload.active === false ? 'locked' : 'active',
            assigned_classes: payload.assignedClasses,
            assigned_courses: payload.assignedCourses,
          };
        }
        return { ok: true, message: 'Đã cập nhật hồ sơ giáo viên!' };
      }
      return ktnApi.saveTeacher({
        ...payload,
        specialty: payload.specialty || payload.specialization,
        initialPassword: payload.initialPassword || payload.password,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
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
      teacherEmail?: string;
      pointsDelta: number;
      reason: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        const emailKey = (payload.teacherEmail || payload.teacherId || '').toLowerCase();
        const existing = teachersList.find(
          (t) =>
            (t.email || '').toLowerCase() === emailKey ||
            (t.code || '').toLowerCase() === emailKey
        );
        if (existing?.email) {
          const targetKey = existing.email.toLowerCase();
          const prevMonthly = existing.monthlyContributionPoints ?? 0;
          const prevTotal =
            existing.totalContributionPoints ??
            existing.stats?.totalContributionPoints ??
            0;
          demoTeacherOverridesRef.current[targetKey] = {
            ...(demoTeacherOverridesRef.current[targetKey] || {}),
            monthlyContributionPoints: Math.max(0, prevMonthly + payload.pointsDelta),
            totalContributionPoints: Math.max(0, prevTotal + payload.pointsDelta),
          };
        }
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

  const deleteClassMutation = useMutation({
    mutationFn: async (params: { classCode: string; confirmClassCode: string }) => {
      setDeleteClassError(null);
      const cleanCode = params.classCode.trim().toUpperCase();
      if (params.confirmClassCode.trim().toUpperCase() !== cleanCode) {
        throw new Error(`Vui lòng nhập chính xác mã lớp "${cleanCode}" để xác nhận xóa.`);
      }
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        if (!demoClassesRef.current) {
          demoClassesRef.current = DEMO_CLASSES.map((c) => ({ ...c }));
        }
        demoClassesRef.current = demoClassesRef.current.map((c) =>
          c.id.toUpperCase() === cleanCode ? { ...c, active: false } : c
        );
        return {
          ok: true,
          classCode: cleanCode,
          softDeleted: true,
          active: false,
          message: `Đã lưu trữ (soft-delete) lớp ${cleanCode} thành công. Dữ liệu lịch sử được bảo toàn.`,
        };
      }
      return ktnApi.deleteClass({
        classCode: cleanCode,
        confirmClassCode: params.confirmClassCode.trim().toUpperCase(),
      });
    },
    onSuccess: (res, vars) => {
      const cleanCode = vars.classCode.trim().toUpperCase();
      setDeleteClassError(null);
      setClassToDelete(null);
      setDeleteClassConfirmInput('');
      setDeleteClassBlockedStudentCount(null);
      delete lastKnownClassStudentCountsRef.current[cleanCode];
      if (recentlyCreatedClass?.id.toUpperCase() === cleanCode) {
        setRecentlyCreatedClass(null);
      }
      if (selectedClassForSchedule?.id.toUpperCase() === cleanCode) {
        setSelectedClassForSchedule(null);
        setScheduleModalOpen(false);
      }
      const uiStore = useUiStore.getState();
      if (String(uiStore.selectedClassCode || '').trim().toUpperCase() === cleanCode) {
        uiStore.setSelectedClassCode('');
      }
      const activeRid = String(uiStore.activeRoomId || '').trim().toUpperCase();
      if (activeRid === `CLASS:${cleanCode}` || activeRid === cleanCode) {
        uiStore.setActiveRoomId('general');
      }
      if (classFilter.toUpperCase() === cleanCode) {
        setClassFilter('ALL');
      }
      if (newStuClassCode.toUpperCase() === cleanCode) {
        setNewStuClassCode('');
      }
      setNewTeacherClasses((prev) =>
        prev.filter((c) => c.toUpperCase() !== cleanCode)
      );

      // Immediately remove the soft-deleted class from active classes cache
      queryClient.setQueriesData<KtnClassWithCounts[]>(
        { queryKey: ['ktn-classes'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter(
            (c) => String(c.id || '').trim().toUpperCase() !== cleanCode && c.active !== false
          );
        }
      );

      // Immediately remove the soft-deleted class room from active chat-rooms cache
      queryClient.setQueriesData<ChatRoom[]>(
        { queryKey: ['chat-rooms'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter((r) => {
            const rid = String(r.roomId || '').trim().toUpperCase();
            const rcode = String(r.classCode || '').trim().toUpperCase();
            return rid !== `CLASS:${cleanCode}` && rid !== cleanCode && rcode !== cleanCode;
          });
        }
      );

      // Immediately unassign the soft-deleted class from teachers cache & demo overrides
      if (isDemoMode) {
        teachersList.forEach((t) => {
          const em = String(t.email || '').trim().toLowerCase();
          if (!em) return;
          const baseRow = demoTeacherOverridesRef.current[em] || t;
          if (Array.isArray(baseRow.assigned_classes)) {
            demoTeacherOverridesRef.current[em] = {
              ...baseRow,
              assigned_classes: baseRow.assigned_classes.filter(
                (c) => String(c || '').trim().toUpperCase() !== cleanCode
              ),
            };
          }
        });
        Object.keys(demoTeacherOverridesRef.current).forEach((em) => {
          const row = demoTeacherOverridesRef.current[em];
          if (row?.assigned_classes) {
            demoTeacherOverridesRef.current[em] = {
              ...row,
              assigned_classes: row.assigned_classes.filter(
                (c) => String(c || '').trim().toUpperCase() !== cleanCode
              ),
            };
          }
        });
      }
      queryClient.setQueriesData<KtnTeacherRecord[]>(
        { queryKey: ['ktn-admin-teachers'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.map((t) => ({
            ...t,
            assigned_classes: (t.assigned_classes || []).filter(
              (c) => String(c || '').trim().toUpperCase() !== cleanCode
            ),
          }));
        }
      );

      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-overview'] });

      addToast({
        title: res.message || `Đã xóa / lưu trữ lớp ${cleanCode}`,
        description:
          'Nhóm lớp đã ẩn khỏi danh sách hoạt động & phân công hiện hành; tin nhắn, bài tập và điểm danh lịch sử được bảo toàn.',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      const apiErr = err as KtnApiError;
      const errMsg = err.message || 'Không thể xóa lớp học.';
      setDeleteClassError(errMsg);
      if (
        apiErr?.status === 409 ||
        errMsg.toLowerCase().includes('học viên') ||
        errMsg.toLowerCase().includes('student')
      ) {
        setDeleteClassBlockedStudentCount((prev) => (prev && prev > 0 ? prev : 1));
      }
      addToast({
        title: 'Chưa thể xóa lớp học',
        description: errMsg,
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
  const classesList: KtnClassWithCounts[] = useMemo(() => {
    const raw = classesQuery.data ?? (isDemoMode ? DEMO_CLASSES : []);
    return (Array.isArray(raw) ? raw : []).filter((c) => c.active !== false);
  }, [classesQuery.data, isDemoMode]);
  const knownClassIds = useMemo(
    () => new Set(classesList.map((c) => c.id)),
    [classesList]
  );
  const ordersList = ordersQuery.data || [];
  const studentsList = studentSearchQuery.data?.items || [];
  const totalStudentsCount = studentSearchQuery.data?.totalCount ?? studentsList.length;
  const teachersList = teachersQuery.data || [];

  const getClassActiveStudentCount = (cls: KtnClassWithCounts): number => {
    const codeUpper = String(cls.id || '').trim().toUpperCase();
    const explicit =
      cls.studentCount ??
      cls.student_count ??
      cls.activeStudentCount ??
      cls.studentsCount ??
      cls.students_count;
    if (typeof explicit === 'number' && Number.isFinite(explicit)) {
      const normalized = Math.max(0, explicit);
      if (codeUpper) {
        lastKnownClassStudentCountsRef.current[codeUpper] = normalized;
      }
      return normalized;
    }
    const countMatchingInStudentsList = () =>
      studentsList.filter((stu) => {
        const effStatus = String(
          stu.lifecycleStatus || stu.accountStatus || stu.account_status || 'ready_to_login'
        ).toLowerCase();
        if (
          effStatus === 'deleted' ||
          effStatus === 'archived' ||
          effStatus === 'suspended' ||
          effStatus === 'locked'
        ) {
          return false;
        }
        return String(stu.class_code || '').trim().toUpperCase() === codeUpper;
      }).length;

    if (
      classFilter === 'ALL' &&
      !debouncedQ &&
      courseFilter === 'ALL' &&
      statusFilter === 'ALL' &&
      accountStatusFilter === 'ALL'
    ) {
      const count = countMatchingInStudentsList();
      if (codeUpper && studentSearchQuery.data) {
        lastKnownClassStudentCountsRef.current[codeUpper] = count;
      }
      return count;
    }
    if (
      codeUpper &&
      typeof lastKnownClassStudentCountsRef.current[codeUpper] === 'number'
    ) {
      return Math.max(0, lastKnownClassStudentCountsRef.current[codeUpper]);
    }
    return countMatchingInStudentsList();
  };

  const openClassChatRoom = (classCode: string) => {
    const cleanCode = String(classCode || '').trim().toUpperCase();
    if (!cleanCode) return;
    const roomId = `class:${cleanCode}`;
    const uiStore = useUiStore.getState();
    uiStore.setSelectedClassCode(cleanCode);
    uiStore.setActiveRoomId(roomId);
    uiStore.setMobileChatConversationOpen(true);
    navigate(`/chat?room=${encodeURIComponent(roomId)}`);
  };
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
      [
        t.code,
        t.name,
        t.email,
        t.phone,
        t.specialty,
        t.specialization,
        ...(t.assigned_classes || []),
        ...(t.assigned_courses || []),
      ]
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
      !studentInCurrentPage &&
      (!selectedStudentSnapshot ||
        (selectedStudentSnapshot.email || '').toLowerCase() !==
          (selectedStudentEmail || '').toLowerCase()),
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
                        {syncStatus.summary?.healthyCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-900">
                      <p className="text-[10px] font-semibold">Chờ đồng bộ lại</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary?.needsResyncCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-1.5 text-red-900">
                      <p className="text-[10px] font-semibold">Cần kiểm tra</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary?.manualReviewCount ?? 0}
                      </p>
                    </div>
                  </div>
                  {(syncStatus.driftItems || []).length > 0 && (
                    <div className="mt-2 space-y-1.5 border-t border-stone-200 pt-2">
                      {(syncStatus.driftItems || []).slice(0, 6).map((item) => (
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
                Hệ thống tự động tạo nhóm chat lớp và nhắc học viên, giáo viên trước giờ học 30 phút dựa trên lịch chính thức đã xác nhận.
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

          {recentlyCreatedClass && (
            <div
              data-testid="admin-created-class-banner"
              className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2.5 text-xs text-emerald-950"
            >
              <div className="flex flex-wrap items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
                <span>
                  Lớp <strong>{recentlyCreatedClass.id}</strong> ({recentlyCreatedClass.name}) đã tạo thành công
                  {recentlyCreatedClass.teacherName &&
                  recentlyCreatedClass.teacherName !== 'Chưa phân công giáo viên' ? (
                    <>
                      {' '}và phân công cho <strong>{recentlyCreatedClass.teacherName}</strong>.
                    </>
                  ) : (
                    <> (chưa phân công giáo viên).</>
                  )}{' '}
                  Nhóm chat{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-emerald-900">
                    {recentlyCreatedClass.roomId}
                  </code>{' '}
                  đã sẵn sàng!
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  data-testid="admin-created-class-open-chat-btn"
                  onClick={() => openClassChatRoom(recentlyCreatedClass.id)}
                  className="inline-flex min-h-[32px] items-center gap-1.5 rounded-lg bg-emerald-800 px-3 py-1 text-xs font-bold text-white hover:bg-emerald-900"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Mở nhóm chat</span>
                </button>
                <button
                  type="button"
                  aria-label="Đóng thông báo lớp vừa tạo"
                  onClick={() => setRecentlyCreatedClass(null)}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-900 hover:bg-emerald-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}

          <div className="mt-3 divide-y divide-stone-100">
            {classesList.map((cls) => {
              const isConfirmed =
                cls.scheduleStatus === 'confirmed' && Boolean(cls.officialScheduleText);
              const displaySchedule = isConfirmed
                ? `Lớp ${cls.id} — ${cls.officialScheduleText}`
                : 'Chưa có lịch học chính thức';
              const activeStudentCount = getClassActiveStudentCount(cls);

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
                      <span
                        data-testid={`class-student-count-${cls.id}`}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          activeStudentCount > 0
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {activeStudentCount} học viên
                      </span>
                    </div>

                    <p className="text-[11px] font-medium text-stone-600">
                      GV phụ trách:{' '}
                      <strong className="text-stone-800">{cls.teacher_name}</strong>
                      {cls.teacher_email || cls.teacher_code
                        ? ` (${cls.teacher_email || cls.teacher_code})`
                        : ''}
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

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid={`class-open-chat-btn-${cls.id}`}
                      onClick={() => openClassChatRoom(cls.id)}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-900 hover:bg-emerald-100"
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      <span data-testid={`admin-open-chat-btn-${cls.id}`}>Mở nhóm chat</span>
                    </button>

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

                    <button
                      type="button"
                      data-testid={`admin-delete-class-btn-${cls.id}`}
                      onClick={() => {
                        setClassToDelete(cls);
                        setDeleteClassConfirmInput('');
                        setDeleteClassError(null);
                        setDeleteClassBlockedStudentCount(activeStudentCount);
                      }}
                      className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:border-red-300 hover:bg-red-50 hover:text-red-900"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span data-testid={`class-delete-btn-${cls.id}`}>Xóa lớp</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Safe Delete Class Modal (C2) */}
      {classToDelete && (
        <div
          data-testid="admin-delete-class-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-3">
              <div>
                <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-stone-900">
                  <Trash2 className="h-4 w-4 text-red-800" />
                  {(deleteClassBlockedStudentCount ?? 0) > 0
                    ? `Chưa thể xóa lớp ${classToDelete.id}`
                    : `Xác nhận xóa / lưu trữ lớp ${classToDelete.id}`}
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  {classToDelete.id} · {classToDelete.name}
                </p>
              </div>
              <button
                type="button"
                aria-label="Đóng hộp thoại xóa lớp"
                onClick={() => {
                  setClassToDelete(null);
                  setDeleteClassConfirmInput('');
                  setDeleteClassError(null);
                  setDeleteClassBlockedStudentCount(null);
                }}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(deleteClassBlockedStudentCount ?? 0) > 0 ? (
              <div className="mt-4 space-y-3 text-xs">
                <div
                  data-testid="delete-class-blocked-reason"
                  className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-amber-950"
                >
                  <p className="flex items-center gap-1.5 font-bold text-amber-900">
                    <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
                    Lớp {classToDelete.id} hiện còn {deleteClassBlockedStudentCount} học viên đang theo học nên chưa thể xóa.
                  </p>
                  <p className="mt-1.5 leading-relaxed text-amber-900">
                    <strong>Cách xử lý an toàn:</strong> Vui lòng mở danh sách học viên của lớp{' '}
                    <strong>{classToDelete.id}</strong>, chuyển từng học viên sang lớp mới (hoặc chọn &ldquo;Bỏ xếp lớp trực tiếp&rdquo;) trước khi thực hiện xóa / lưu trữ lớp.
                  </p>
                  {deleteClassError && (
                    <p
                      data-testid="delete-class-error"
                      className="mt-2 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 font-semibold text-red-900"
                    >
                      {deleteClassError}
                    </p>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    data-testid="cancel-delete-class-btn"
                    onClick={() => {
                      setClassToDelete(null);
                      setDeleteClassConfirmInput('');
                      setDeleteClassError(null);
                      setDeleteClassBlockedStudentCount(null);
                    }}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    data-testid="delete-class-transfer-students-btn"
                    onClick={() => {
                      const targetCode = classToDelete.id;
                      setClassFilter(targetCode);
                      setSearchInput('');
                      setDebouncedQ('');
                      setPageOffset(0);
                      setClassToDelete(null);
                      setDeleteClassConfirmInput('');
                      setDeleteClassError(null);
                      setDeleteClassBlockedStudentCount(null);
                      navigate('/admin/students');
                    }}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-900"
                  >
                    <Users className="h-3.5 w-3.5" />
                    <span>Xem &amp; Chuyển lớp học viên ({classToDelete.id})</span>
                  </button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  deleteClassMutation.mutate({
                    classCode: classToDelete.id,
                    confirmClassCode: deleteClassConfirmInput,
                  });
                }}
                className="mt-4 space-y-3 text-xs"
              >
                <div className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-stone-700">
                  <p className="font-semibold text-stone-900">
                    Lớp <strong>{classToDelete.id}</strong> hiện trống (0 học viên) và đủ điều kiện lưu trữ an toàn:
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-stone-600">
                    <li>Nhóm chat <code>class:{classToDelete.id}</code> sẽ ẩn khỏi danh sách hoạt động.</li>
                    <li>Lớp được gỡ khỏi phân công hiện hành và các danh sách chọn lớp.</li>
                    <li>Toàn bộ lịch sử tin nhắn, bài tập và điểm danh cũ được bảo toàn.</li>
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    Nhập chính xác mã lớp{' '}
                    <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono font-bold text-red-900">
                      {classToDelete.id}
                    </code>{' '}
                    để xác nhận xóa:
                  </label>
                  <input
                    type="text"
                    data-testid="delete-class-confirm-input"
                    value={deleteClassConfirmInput}
                    onChange={(e) => {
                      setDeleteClassConfirmInput(e.target.value.toUpperCase());
                      if (deleteClassError) setDeleteClassError(null);
                    }}
                    placeholder={classToDelete.id}
                    className="mt-1.5 w-full rounded-xl border border-stone-300 px-3 py-2 font-mono text-xs font-bold uppercase text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                {deleteClassError && (
                  <div
                    data-testid="delete-class-error"
                    className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-800"
                  >
                    {deleteClassError}
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-2">
                  <button
                    type="button"
                    data-testid="cancel-delete-class-btn"
                    onClick={() => {
                      setClassToDelete(null);
                      setDeleteClassConfirmInput('');
                      setDeleteClassError(null);
                      setDeleteClassBlockedStudentCount(null);
                    }}
                    className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    data-testid="confirm-delete-class-btn"
                    disabled={
                      deleteClassMutation.isPending ||
                      deleteClassConfirmInput.trim().toUpperCase() !==
                        classToDelete.id.trim().toUpperCase()
                    }
                    className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span data-testid="delete-class-submit-btn">
                      {deleteClassMutation.isPending ? 'Đang xóa lớp...' : 'Xác nhận xóa lớp'}
                    </span>
                  </button>
                </div>
              </form>
            )}
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
          clientRequestId,
          schedulePayload,
        }) => {
          setIsSavingSchedule(true);
          try {
            const cleanCode = classCode.trim().toUpperCase();
            const cleanTeacherEmail = String(teacherEmail ?? '').trim();
            const cleanTeacherCode = String(teacherCode ?? '').trim();
            const hasAssignedTeacherInput = Boolean(
              cleanTeacherEmail || cleanTeacherCode
            );
            const assignedTeacher = hasAssignedTeacherInput
              ? teachersList.find(
                  (t) =>
                    (cleanTeacherEmail &&
                      String(t.email || '').trim().toLowerCase() ===
                        cleanTeacherEmail.toLowerCase()) ||
                    (cleanTeacherCode &&
                      String(t.code || '').trim().toUpperCase() ===
                        cleanTeacherCode.toUpperCase())
                )
              : undefined;
            const resolvedTeacherEmail = hasAssignedTeacherInput
              ? cleanTeacherEmail || assignedTeacher?.email || ''
              : '';
            const resolvedTeacherCode = hasAssignedTeacherInput
              ? cleanTeacherCode || assignedTeacher?.code || ''
              : '';
            const resolvedTeacherName = hasAssignedTeacherInput
              ? assignedTeacher?.name ||
                (selectedClassForSchedule &&
                ((cleanTeacherEmail &&
                  String(selectedClassForSchedule.teacher_email || '')
                    .trim()
                    .toLowerCase() === cleanTeacherEmail.toLowerCase()) ||
                  (cleanTeacherCode &&
                    String(selectedClassForSchedule.teacher_code || '')
                      .trim()
                      .toUpperCase() === cleanTeacherCode.toUpperCase()))
                  ? selectedClassForSchedule.teacher_name
                  : '') ||
                cleanTeacherEmail ||
                cleanTeacherCode
              : 'Chưa phân công giáo viên';
            const prevTeacherEmail = String(
              selectedClassForSchedule?.teacher_email || ''
            )
              .trim()
              .toLowerCase();
            const prevTeacherCode = String(
              selectedClassForSchedule?.teacher_code || ''
            )
              .trim()
              .toUpperCase();
            const teacherChanged =
              !isCreateClass &&
              (resolvedTeacherEmail.trim().toLowerCase() !== prevTeacherEmail ||
                resolvedTeacherCode.trim().toUpperCase() !== prevTeacherCode);

            const hasStructuredSchedule =
              schedulePayload.status === 'confirmed' ||
              schedulePayload.daysOfWeek.length > 0 ||
              schedulePayload.customSessions.length > 0 ||
              Boolean(selectedClassForSchedule?.scheduleConfig);

            const prevSched = selectedClassForSchedule?.scheduleConfig;
            const didScheduleChange =
              isCreateClass ||
              !prevSched ||
              (prevSched.status || 'draft') !== schedulePayload.status ||
              (prevSched.mode || 'recurring') !== schedulePayload.mode ||
              (prevSched.startTime || '') !== schedulePayload.startTime ||
              (prevSched.endTime || '') !== schedulePayload.endTime ||
              (prevSched.effectiveFrom || null) !== schedulePayload.effectiveFrom ||
              (prevSched.effectiveUntil || null) !== schedulePayload.effectiveUntil ||
              (prevSched.meetingUrl || null) !== schedulePayload.meetingUrl ||
              JSON.stringify(prevSched.daysOfWeek || []) !==
                JSON.stringify(schedulePayload.daysOfWeek || []) ||
              JSON.stringify(prevSched.customSessions || []) !==
                JSON.stringify(schedulePayload.customSessions || []) ||
              JSON.stringify(prevSched.exceptions || []) !==
                JSON.stringify(schedulePayload.exceptions || []);

            let savedClassItem: KtnClassWithCounts;
            let serverMessage: string | undefined;

            if (isDemoMode) {
              if (!demoClassesRef.current) {
                demoClassesRef.current = DEMO_CLASSES.map((c) => ({ ...c }));
              }
              const existingIdx = demoClassesRef.current.findIndex(
                (c) => c.id.toUpperCase() === cleanCode && c.active !== false
              );
              if (isCreateClass && existingIdx >= 0) {
                throw new KtnApiError({
                  message: `Mã lớp ${cleanCode} đã tồn tại trên hệ thống. Vui lòng chọn mã lớp khác hoặc chỉnh sửa lớp hiện có.`,
                  status: 409,
                  code: 'DUPLICATE_CLASS_CODE',
                });
              }
              const officialText =
                schedulePayload.status === 'confirmed'
                  ? schedulePayload.daysOfWeek.length > 0
                    ? `Thứ ${schedulePayload.daysOfWeek.join(', ')} (${schedulePayload.startTime}–${schedulePayload.endTime})`
                    : schedulePayload.customSessions.length > 0
                    ? `${schedulePayload.customSessions.length} buổi tùy chỉnh`
                    : 'Đã xác nhận lịch học'
                  : undefined;
              savedClassItem = {
                ...(existingIdx >= 0 ? demoClassesRef.current[existingIdx] : {}),
                id: cleanCode,
                name: className.trim(),
                teacher_code: resolvedTeacherCode,
                teacher_name: resolvedTeacherName,
                teacher_email: resolvedTeacherEmail,
                schedule:
                  officialText ||
                  selectedClassForSchedule?.schedule ||
                  'Chưa có lịch học chính thức',
                officialScheduleText: officialText,
                scheduleStatus: schedulePayload.status,
                scheduleConfig: hasStructuredSchedule
                  ? {
                      classCode: cleanCode,
                      timezone: schedulePayload.timezone || 'Asia/Ho_Chi_Minh',
                      daysOfWeek: schedulePayload.daysOfWeek,
                      startTime: schedulePayload.startTime,
                      endTime: schedulePayload.endTime,
                      effectiveFrom: schedulePayload.effectiveFrom,
                      effectiveUntil: schedulePayload.effectiveUntil,
                      mode: schedulePayload.mode,
                      customSessions: schedulePayload.customSessions,
                      exceptions: schedulePayload.exceptions,
                      meetingUrl: schedulePayload.meetingUrl,
                      status: schedulePayload.status,
                    }
                  : selectedClassForSchedule?.scheduleConfig || null,
                total_lessons: totalLessons ?? 24,
                current_lesson: selectedClassForSchedule?.current_lesson ?? 0,
                active: true,
                roomId: `class:${cleanCode}`,
              };
              if (existingIdx >= 0) {
                demoClassesRef.current[existingIdx] = savedClassItem;
              } else {
                demoClassesRef.current = [...demoClassesRef.current, savedClassItem];
              }
            } else {
              const saveRes = await ktnApi.saveClass({
                id: cleanCode,
                classCode: cleanCode,
                name: className.trim(),
                teacher_code: resolvedTeacherCode,
                teacher_email: resolvedTeacherEmail,
                total_lessons: totalLessons ?? 24,
                mode: isCreateClass ? 'create' : 'update',
                isNew: isCreateClass,
                clientRequestId,
                schedule:
                  schedulePayload.status === 'confirmed'
                    ? undefined
                    : selectedClassForSchedule?.schedule || '',
                scheduleConfig:
                  isCreateClass && hasStructuredSchedule
                    ? { ...schedulePayload, classCode: cleanCode }
                    : undefined,
              });
              serverMessage = saveRes.message;

              let mergedClassItem: KtnClassWithCounts = {
                ...(selectedClassForSchedule || {}),
                ...(saveRes.classItem || {}),
                id: saveRes.classItem?.id || cleanCode,
                name: saveRes.classItem?.name || className.trim(),
                teacher_code: hasAssignedTeacherInput
                  ? saveRes.classItem?.teacher_code || resolvedTeacherCode
                  : '',
                teacher_name: hasAssignedTeacherInput
                  ? saveRes.classItem?.teacher_name || resolvedTeacherName
                  : 'Chưa phân công giáo viên',
                teacher_email: hasAssignedTeacherInput
                  ? saveRes.classItem?.teacher_email || resolvedTeacherEmail
                  : '',
                total_lessons: saveRes.classItem?.total_lessons ?? totalLessons ?? 24,
                current_lesson:
                  saveRes.classItem?.current_lesson ??
                  selectedClassForSchedule?.current_lesson ??
                  0,
                schedule:
                  saveRes.classItem?.schedule ||
                  selectedClassForSchedule?.schedule ||
                  'Chưa có lịch học chính thức',
                active: true,
                roomId: saveRes.roomId || `class:${cleanCode}`,
              };

              const shouldSaveScheduleSeparately =
                hasStructuredSchedule &&
                (isCreateClass
                  ? !saveRes.classItem?.scheduleConfig
                  : didScheduleChange || !teacherChanged);

              if (shouldSaveScheduleSeparately) {
                const schedRes = await ktnApi.saveClassSchedule({
                  ...schedulePayload,
                  classCode: cleanCode,
                });
                if (schedRes?.scheduleConfig) {
                  mergedClassItem = {
                    ...mergedClassItem,
                    scheduleConfig: schedRes.scheduleConfig,
                    scheduleStatus:
                      schedRes.scheduleStatus || schedRes.scheduleConfig.status,
                    officialScheduleText:
                      schedRes.officialScheduleText ||
                      mergedClassItem.officialScheduleText,
                    upcomingSessions:
                      schedRes.upcomingSessions || mergedClassItem.upcomingSessions,
                    nextSession:
                      schedRes.nextSession !== undefined
                        ? schedRes.nextSession
                        : mergedClassItem.nextSession,
                  };
                }
              }

              savedClassItem = mergedClassItem;
            }

            // 1. Immediately update ['ktn-classes'] cache so the class list updates without F5
            queryClient.setQueriesData<KtnClassWithCounts[]>(
              { queryKey: ['ktn-classes'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
              (prev) => {
                const base = Array.isArray(prev)
                  ? prev.filter((c) => c.active !== false)
                  : [];
                const idx = base.findIndex(
                  (c) => String(c.id || '').trim().toUpperCase() === cleanCode
                );
                if (idx >= 0) {
                  const next = [...base];
                  next[idx] = { ...next[idx], ...savedClassItem, active: true };
                  return next;
                }
                return [...base, savedClassItem];
              }
            );

            // 2. Immediately update ['chat-rooms'] cache so the canonical class:<CODE> room appears without F5
            const canonicalRoomId = `class:${cleanCode}`;
            const newChatRoom: ChatRoom = {
              roomId: canonicalRoomId,
              label: `Nhóm Lớp ${cleanCode} — ${savedClassItem.name}`,
              shortLabel: `Lớp ${cleanCode}`,
              type: 'class',
              classCode: cleanCode,
              teacherName: savedClassItem.teacher_name,
              unreadCount: 0,
            };
            queryClient.setQueriesData<ChatRoom[]>(
              { queryKey: ['chat-rooms'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
              (prev) => {
                if (!Array.isArray(prev)) return [newChatRoom];
                const idx = prev.findIndex(
                  (r) =>
                    String(r.roomId || '').trim().toUpperCase() ===
                      canonicalRoomId.toUpperCase() ||
                    String(r.classCode || '').trim().toUpperCase() === cleanCode
                );
                if (idx >= 0) {
                  const next = [...prev];
                  next[idx] = {
                    ...next[idx],
                    roomId: canonicalRoomId,
                    label: newChatRoom.label,
                    shortLabel: newChatRoom.shortLabel,
                    classCode: cleanCode,
                    teacherName: savedClassItem.teacher_name,
                  };
                  return next;
                }
                return [...prev, newChatRoom];
              }
            );

            // 3. Immediately update ['ktn-admin-teachers'] cache & demo overrides so assigned teacher shows the class without F5
            const targetEmailLower = resolvedTeacherEmail.trim().toLowerCase();
            const targetCodeUpper = resolvedTeacherCode.trim().toUpperCase();
            const mapTeacherClassAssignment = (t: KtnTeacherRecord): KtnTeacherRecord => {
              const tEmail = String(t.email || '').trim().toLowerCase();
              const tCode = String(t.code || '').trim().toUpperCase();
              const isTarget =
                (targetEmailLower && tEmail === targetEmailLower) ||
                (targetCodeUpper && tCode === targetCodeUpper);
              const currentClasses = Array.isArray(t.assigned_classes)
                ? t.assigned_classes
                : [];
              const currentlyHasClass = currentClasses.some(
                (c) => String(c || '').trim().toUpperCase() === cleanCode
              );
              const isPrev =
                !isCreateClass &&
                !isTarget &&
                (currentlyHasClass ||
                  (prevTeacherEmail && tEmail === prevTeacherEmail) ||
                  (prevTeacherCode && tCode === prevTeacherCode));
              if (isTarget) {
                return currentlyHasClass
                  ? t
                  : { ...t, assigned_classes: [...currentClasses, cleanCode] };
              }
              if (isPrev) {
                return {
                  ...t,
                  assigned_classes: currentClasses.filter(
                    (c) => String(c || '').trim().toUpperCase() !== cleanCode
                  ),
                };
              }
              return t;
            };
            if (isDemoMode) {
              teachersList.forEach((t) => {
                const em = String(t.email || '').trim().toLowerCase();
                if (!em) return;
                const baseRow = demoTeacherOverridesRef.current[em] || t;
                demoTeacherOverridesRef.current[em] = mapTeacherClassAssignment(baseRow);
              });
              Object.keys(demoTeacherOverridesRef.current).forEach((em) => {
                const row = demoTeacherOverridesRef.current[em];
                if (row) {
                  demoTeacherOverridesRef.current[em] = mapTeacherClassAssignment(row);
                }
              });
            }
            queryClient.setQueriesData<KtnTeacherRecord[]>(
              { queryKey: ['ktn-admin-teachers'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
              (prev) => (Array.isArray(prev) ? prev.map(mapTeacherClassAssignment) : prev)
            );

            // 4. Invalidate related queries for background consistency
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['ktn-classes'] }),
              queryClient.invalidateQueries({ queryKey: ['chat-rooms'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-overview'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] }),
            ]);

            if (isCreateClass) {
              setRecentlyCreatedClass({
                id: cleanCode,
                name: savedClassItem.name,
                teacherName: savedClassItem.teacher_name,
                roomId: canonicalRoomId,
              });
            }

            addToast({
              title:
                serverMessage ||
                (isCreateClass
                  ? `Đã tạo lớp ${cleanCode} & nhóm chat ${canonicalRoomId}`
                  : `Đã cập nhật lịch học lớp ${cleanCode}`),
              description: isCreateClass
                ? hasAssignedTeacherInput
                  ? `Đã phân công ${savedClassItem.teacher_name} và kích hoạt nhóm trao đổi lớp.`
                  : 'Đã kích hoạt nhóm trao đổi lớp (chưa phân công giáo viên).'
                : schedulePayload.status === 'confirmed'
                ? 'Lịch học chính thức đã được lưu và đồng bộ bộ nhắc tự động.'
                : 'Thông tin lớp học đã được lưu.',
              variant: 'success',
            });
            setScheduleModalOpen(false);
          } catch (err) {
            const errMsg =
              err instanceof Error
                ? err.message
                : 'Không thể lưu thông tin lớp học.';
            addToast({
              title: isCreateClass
                ? 'Không thể tạo lớp mới'
                : 'Không thể cập nhật lớp học',
              description: errMsg,
              variant: 'error',
            });
            throw err;
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
                      <th className="pb-2 pr-2 font-bold">Lớp, Khóa & Lịch dạy</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Lịch / Thực dạy</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Bài chấm / Chờ chấm</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Diễn đàn & Video</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Điểm đóng góp</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">Trạng thái</th>
                      <th className="whitespace-nowrap pb-2 text-right font-bold">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-stone-100">
                    {filteredTeachersList.map((teacher) => {
                      const scheduledSessionsCount =
                        teacher.scheduledSessionsCount ??
                        teacher.stats?.scheduledSessionsCount ??
                        0;
                      const recordedSessionsCount =
                        teacher.activitySessionsCount ??
                        teacher.recordedClassSessionsCount ??
                        0;
                      const confirmedTaughtSessionsCount =
                        teacher.confirmedSessionsCount ??
                        teacher.attendanceConfirmedSessionsCount ??
                        teacher.stats?.confirmedTaughtSessionsCount ??
                        0;
                      const unverifiedTeachingLog =
                        confirmedTaughtSessionsCount === 0 ||
                        teacher.teachingVerificationStatus === 'unverified' ||
                        teacher.stats?.unverifiedTeachingLog === true;
                      const submissionsReviewedCount =
                        teacher.gradedHomeworksCount ??
                        teacher.stats?.submissionsReviewedCount ??
                        0;
                      const pendingGradingCount =
                        teacher.pendingHomeworksCount ??
                        teacher.stats?.pendingGradingCount ??
                        0;
                      const forumAnswersCount =
                        teacher.forumAnswersCount ??
                        teacher.stats?.forumAnswersCount ??
                        0;
                      const acceptedAnswersCount =
                        teacher.acceptedAnswersCount ??
                        teacher.forumAcceptedAnswersCount ??
                        teacher.stats?.acceptedAnswersCount ??
                        0;
                      const videoAnswersCount =
                        teacher.videoGuidesCount ??
                        teacher.forumVideoAnswersCount ??
                        teacher.stats?.videoAnswersCount ??
                        0;
                      const monthlyContributionPoints =
                        teacher.monthlyContributionPoints ?? 0;
                      const totalContributionPoints =
                        teacher.totalContributionPoints ??
                        teacher.stats?.totalContributionPoints ??
                        0;
                      const managedStudentsCount = teacher.managedStudentsCount ?? 0;

                      const classes = Array.isArray(teacher.assigned_classes)
                        ? teacher.assigned_classes
                        : [];
                      const courses = Array.isArray(teacher.assigned_courses)
                        ? teacher.assigned_courses
                        : [];
                      const scheduleSummaries = classes
                        .map((clsCode) => {
                          const clsObj = classesList.find(
                            (c) => String(c.id).toUpperCase() === String(clsCode).toUpperCase()
                          );
                          const rawOfficial = (clsObj?.officialScheduleText || '').trim();
                          const hasRealOfficial =
                            Boolean(rawOfficial) &&
                            rawOfficial !== 'Chưa có lịch học chính thức';
                          const sched =
                            (hasRealOfficial ? rawOfficial : '') ||
                            clsObj?.schedule ||
                            clsObj?.legacyScheduleText ||
                            '';
                          return sched ? `${clsCode}: ${sched}` : '';
                        })
                        .filter(Boolean);

                      const isLocked =
                        teacher.active === false ||
                        teacher.status === 'locked' ||
                        teacher.status === 'suspended' ||
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
                            <div
                              data-testid={`teacher-students-count-${teacher.email}`}
                              className="mt-0.5 text-[10px] font-semibold text-stone-600"
                            >
                              Học viên phụ trách: {managedStudentsCount} HV
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
                              <span className="text-stone-400">Chưa phân công lớp</span>
                            )}
                            <div
                              data-testid={`teacher-courses-summary-${teacher.email}`}
                              className="mt-1 text-[10px] font-medium text-stone-600"
                            >
                              Khóa phụ trách: {courses.length} khóa
                            </div>
                            {scheduleSummaries.length > 0 && (
                              <div
                                data-testid={`teacher-schedule-summary-${teacher.email}`}
                                className="mt-0.5 max-w-[230px] truncate text-[10px] text-stone-500"
                                title={scheduleSummaries.join(' | ')}
                              >
                                Lịch dạy: {scheduleSummaries.join(' · ')}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <div className="font-bold text-stone-800">
                              <span data-testid={`teacher-scheduled-sessions-${teacher.email}`}>
                                Lịch: {scheduledSessionsCount}
                              </span>{' '}
                              ·{' '}
                              <span
                                data-testid={`teacher-confirmed-sessions-${teacher.email}`}
                                className="text-emerald-700"
                              >
                                Thực dạy: {confirmedTaughtSessionsCount}
                              </span>
                            </div>
                            <div className="text-[10px] text-stone-500">
                              Ghi nhận log: {recordedSessionsCount} buổi (Lịch ≠ Thực dạy)
                            </div>
                            {unverifiedTeachingLog && (
                              <span
                                data-testid={`teacher-unverified-badge-${teacher.email}`}
                                className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900"
                              >
                                Chưa xác minh số buổi thực dạy
                              </span>
                            )}
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <div>
                              <span
                                data-testid={`teacher-graded-count-${teacher.email}`}
                                className="font-bold text-stone-900"
                              >
                                Đã chấm: {submissionsReviewedCount}
                              </span>
                            </div>
                            <div className="mt-0.5">
                              <span
                                data-testid={`teacher-pending-grading-count-${teacher.email}`}
                                className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                  pendingGradingCount > 0
                                    ? 'bg-amber-100 text-amber-900'
                                    : 'bg-stone-100 text-stone-600'
                                }`}
                              >
                                Chờ chấm: {pendingGradingCount}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <div>
                              <span className="font-bold text-stone-900">
                                {forumAnswersCount} trả lời
                              </span>
                              <span
                                data-testid={`teacher-resolved-forum-count-${teacher.email}`}
                                className="ml-1 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                              >
                                {acceptedAnswersCount} giải quyết
                              </span>
                            </div>
                            <div
                              data-testid={`teacher-video-guides-count-${teacher.email}`}
                              className="mt-0.5 text-[10px] font-semibold text-indigo-800"
                            >
                              Video giải đáp: {videoAnswersCount}
                            </div>
                          </td>
                          <td className="whitespace-nowrap py-2.5 pr-2">
                            <div>
                              <span
                                data-testid={`teacher-monthly-points-${teacher.email}`}
                                className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold text-amber-900"
                              >
                                <Award className="h-3 w-3" />
                                Tháng: {monthlyContributionPoints} điểm
                              </span>
                            </div>
                            <div
                              data-testid={`teacher-total-points-${teacher.email}`}
                              className="mt-0.5 text-[10px] text-stone-500"
                            >
                              Tích lũy: {totalContributionPoints} điểm
                            </div>
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
                <option value="ALL">Mọi tài khoản</option>
                <option value="ready_to_login">Sẵn sàng đăng nhập</option>
                <option value="active">Đang hoạt động (Active)</option>
                <option value="pending_activation">Chờ kích hoạt</option>
                <option value="suspended">Tạm khóa</option>
                <option value="archived">Đã lưu trữ</option>
                <option value="deleted">Đã xóa (Supabase)</option>
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
                  const rawAccount = String(
                    stu.accountStatus || stu.account_status || 'ready_to_login'
                  ).toLowerCase();
                  const rawLifecycle = String(
                    stu.lifecycleStatus || rawAccount
                  ).toLowerCase();
                  const isSuspended =
                    rawAccount === 'suspended' ||
                    rawAccount === 'locked' ||
                    rawLifecycle === 'suspended';
                  const isArchived =
                    rawAccount === 'archived' || rawLifecycle === 'archived';
                  const isDeleted =
                    rawAccount === 'deleted' || rawLifecycle === 'deleted';

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
                          {(isSuspended || isArchived || isDeleted) && (
                            <span
                              data-testid={`student-mobile-lifecycle-badge-${stu.email}`}
                              className={`inline-block whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold ${
                                isDeleted
                                  ? 'bg-red-100 text-red-900'
                                  : isSuspended
                                  ? 'bg-amber-100 text-amber-900'
                                  : 'bg-stone-200 text-stone-800'
                              }`}
                            >
                              {isDeleted
                                ? 'Đã xóa (Supabase)'
                                : isSuspended
                                ? 'Tạm khóa'
                                : 'Đã lưu trữ'}
                            </span>
                          )}
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
                      const rawLifecycle = String(
                        stu.lifecycleStatus || rawAccount
                      ).toLowerCase();
                      const isSuspended =
                        rawAccount === 'suspended' ||
                        rawAccount === 'locked' ||
                        rawLifecycle === 'suspended';
                      const isArchived =
                        rawAccount === 'archived' || rawLifecycle === 'archived';
                      const isDeleted =
                        rawAccount === 'deleted' || rawLifecycle === 'deleted';
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
                            <div className="flex flex-wrap items-center gap-1">
                              {(isSuspended || isArchived || isDeleted) && (
                                <span
                                  data-testid={`student-lifecycle-badge-${stu.email}`}
                                  className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-bold ${
                                    isDeleted
                                      ? 'bg-red-100 text-red-900'
                                      : isSuspended
                                      ? 'bg-amber-100 text-amber-900'
                                      : 'bg-stone-200 text-stone-800'
                                  }`}
                                >
                                  {isDeleted
                                    ? 'Đã xóa (Supabase)'
                                    : isSuspended
                                    ? 'Tạm khóa'
                                    : 'Đã lưu trữ'}
                                </span>
                              )}
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
                            </div>
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
        hasExistingOrders={Boolean(
          selectedStudent &&
            ordersList.some(
              (o) =>
                (o.student_email || '').trim().toLowerCase() ===
                (selectedStudent.email || '').trim().toLowerCase()
            )
        )}
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
