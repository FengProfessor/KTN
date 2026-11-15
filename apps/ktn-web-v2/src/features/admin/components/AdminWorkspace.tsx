import React, { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
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
  Upload,
} from 'lucide-react';
import {
  parseKtnCenterBulkCsv,
  KTN_CENTER_SAMPLE_CSV,
  type BulkImportParseResult,
} from '@/lib/bulkImportParser';
import {
  ktnApi,
  KtnApiError,
  getServerNowMs,
  filterAndPaginateTeachersClientSide,
  type KtnTeacherSearchResult,
} from '@/services/api/ktnApiClient';
import { ChatRoom } from '@/features/chat/types/chat.types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '@/lib/demoData';
import {
  useI18n,
  trStatic,
  translateCourseTitle,
  translateDayLabel,
  translateScheduleText,
  type AppLanguage,
} from '@/i18n';
import {
  getCourseDurationPresetOptions,
  getCourseDurationUnitOptions,
  addPresetToCalendarDate,
  buildCourseDurationPreset,
  disambiguateCatalogCourses,
  extractCalendarDateFromLimitTime,
  formatCourseDurationPresetLabel,
  formatVnd,
  getHoChiMinhCalendarDateString,
  parseCourseDurationPreset,
  resolveStudentOnlineCourses,
  toIzTeachExpiresAtIso,
  type CourseDurationUnitOption,
} from '@/lib/utils';
import { ClassScheduleModal } from '@/features/classrooms/components/ClassScheduleModal';
import { StudentDetailDrawer } from '@/features/admin/components/StudentDetailDrawer';
import { TeacherDetailDrawer } from '@/features/admin/components/TeacherDetailDrawer';
import {
  OrderDetailDrawer,
  getAccountStatusMeta,
  getContactStatusMeta,
  getPaymentStatusMeta,
} from '@/features/admin/components/OrderDetailDrawer';
import {
  CourseDurationMode,
  CourseDurationPreset,
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

export function getOrderFilterOptions(
  lang: AppLanguage
): Array<{ id: AdminOrderFilterKey; label: string }> {
  return [
    { id: 'all', label: trStatic('Tất cả đơn', 'All orders', lang) },
    { id: 'new', label: trStatic('Đơn mới', 'New', lang) },
    { id: 'not_called', label: trStatic('Chưa gọi', 'Not called', lang) },
    {
      id: 'called_awaiting_payment',
      label: trStatic('Đã gọi, chờ thanh toán', 'Called, awaiting payment', lang),
    },
    {
      id: 'paid_awaiting_approval',
      label: trStatic('Đã nhận thanh toán, chờ duyệt', 'Paid, awaiting approval', lang),
    },
    { id: 'activated', label: trStatic('Đã kích hoạt', 'Activated', lang) },
    {
      id: 'needs_error_handling',
      label: trStatic('Cần xử lý lỗi', 'Needs attention', lang),
    },
    {
      id: 'cancelled_refunded',
      label: trStatic('Đã hủy/hoàn tiền', 'Cancelled / Refunded', lang),
    },
  ];
}

export const AdminWorkspace: React.FC = () => {
  const { lang, tr } = useI18n();
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

  // Selected teacher for TeacherDetailDrawer + Server-side Teacher Search state (C1)
  const [selectedTeacherKey, setSelectedTeacherKey] = useState<string | null>(null);
  const [teacherSearchInput, setTeacherSearchInput] = useState<string>('');
  const [debouncedTeacherQ, setDebouncedTeacherQ] = useState<string>('');
  const [teacherFilter, setTeacherFilter] = useState<
    'ALL' | 'ACTIVE' | 'INACTIVE' | 'UNASSIGNED'
  >('ALL');
  const [teacherClassFilter, setTeacherClassFilter] = useState<string>('ALL');
  const [teacherPage, setTeacherPage] = useState<number>(1);
  const teacherPageLimit = 20;

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
  const [newStuDurationPreset, setNewStuDurationPreset] =
    useState<CourseDurationPreset>('unlimited');
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

  // Bulk Import Modal state
  const [showBulkImportModal, setShowBulkImportModal] = useState(false);
  const [bulkCsvText, setBulkCsvText] = useState('');
  const [bulkDefaultPassword, setBulkDefaultPassword] = useState('12345678');
  const [bulkPreviewResult, setBulkPreviewResult] = useState<BulkImportParseResult | null>(null);
  const [bulkPreviewTab, setBulkPreviewTab] = useState<
    'classes' | 'teachers' | 'students' | 'warnings'
  >('classes');
  const [isAnalyzingBulk, setIsAnalyzingBulk] = useState(false);
  const [isExecutingBulk, setIsExecutingBulk] = useState(false);
  const [bulkError, setBulkError] = useState<string | null>(null);

  const handlePreviewBulkImport = async (overrideCsvText?: string) => {
    const raw = (overrideCsvText ?? bulkCsvText).trim();
    if (!raw) {
      setBulkError(
        tr(
          'Vui lòng dán dữ liệu CSV/Excel hoặc bấm "Tải dữ liệu mẫu của Trung tâm".',
          'Please paste CSV/Excel data or click "Load Center Sample Data".'
        )
      );
      return;
    }
    setBulkError(null);
    setIsAnalyzingBulk(true);
    try {
      const localPreview = parseKtnCenterBulkCsv(raw, {
        defaultPassword: bulkDefaultPassword.trim() || '12345678',
        lang,
      });
      setBulkPreviewResult(localPreview);
      if (!isDemoMode) {
        const serverPreview = await ktnApi.bulkImportCenterData({
          csvText: raw,
          dryRun: true,
          defaultPassword: bulkDefaultPassword.trim() || '12345678',
        });
        if (serverPreview?.ok) {
          setBulkPreviewResult({
            classes: serverPreview.classes,
            teachers: serverPreview.teachers,
            students: serverPreview.students,
            warnings: serverPreview.warnings,
            summary: serverPreview.summary,
          });
        }
      }
    } catch (err: unknown) {
      // Keep local preview if available, or show error
      if (!bulkPreviewResult) {
        setBulkError(
          err instanceof Error
            ? err.message
            : tr('Không thể phân tích dữ liệu CSV.', 'Could not parse CSV data.')
        );
      }
    } finally {
      setIsAnalyzingBulk(false);
    }
  };

  const handleConfirmBulkImport = async () => {
    const raw = bulkCsvText.trim();
    if (!raw) {
      setBulkError(
        tr(
          'Vui lòng dán dữ liệu CSV trước khi tạo hàng loạt.',
          'Please paste CSV data before bulk creating.'
        )
      );
      return;
    }
    setBulkError(null);
    setIsExecutingBulk(true);
    try {
      if (isDemoMode) {
        const parsed = parseKtnCenterBulkCsv(raw, {
          defaultPassword: bulkDefaultPassword.trim() || '12345678',
          lang,
        });
        setBulkPreviewResult(parsed);
        addToast({
          title: tr('Đã tạo hàng loạt thành công (Demo)', 'Bulk creation succeeded (Demo)'),
          description: tr(
            `Đã tạo ${parsed.summary.classCount} lớp, ${parsed.summary.teacherCount} giáo viên, ${parsed.summary.studentCount} học viên.`,
            `Created ${parsed.summary.classCount} classes, ${parsed.summary.teacherCount} teachers, ${parsed.summary.studentCount} students.`
          ),
          variant: 'success',
        });
        setShowBulkImportModal(false);
        return;
      }
      const res = await ktnApi.bulkImportCenterData({
        csvText: raw,
        dryRun: false,
        defaultPassword: bulkDefaultPassword.trim() || '12345678',
      });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-overview'] });
      addToast({
        title: tr('Đã nhập hàng loạt thành công!', 'Bulk import completed!'),
        description:
          res.message ||
          tr(
            `Đã khởi tạo ${res.summary.classCount} lớp, ${res.summary.teacherCount} giáo viên và ${res.summary.studentCount} học sinh.`,
            `Initialized ${res.summary.classCount} classes, ${res.summary.teacherCount} teachers, and ${res.summary.studentCount} students.`
          ),
        variant: 'success',
      });
      setShowBulkImportModal(false);
    } catch (err: unknown) {
      setBulkError(
        err instanceof Error
          ? err.message
          : tr('Không thể thực thi nhập hàng loạt.', 'Unable to run bulk import.')
      );
    } finally {
      setIsExecutingBulk(false);
    }
  };

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

  // Safe Soft-Delete Teacher confirmation modal state (Milestone M3)
  const [teacherToDelete, setTeacherToDelete] = useState<KtnTeacherRecord | null>(null);

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
    const timer = setTimeout(() => {
      setDebouncedTeacherQ(teacherSearchInput.trim());
      setTeacherPage(1);
    }, 220);
    return () => clearTimeout(timer);
  }, [teacherSearchInput]);

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
              tr(
                'Chưa xác minh tiền thực nhận (Trạng thái thanh toán chưa phải "Đã xác minh tiền thực nhận").',
                'Payment receipt not yet verified (status is not "Payment verified").'
              ),
              tr(
                'Chưa có email đăng nhập hợp lệ cho học viên.',
                'Valid student login email is missing.'
              ),
              tr(
                'Chưa cập nhật trạng thái chăm sóc (vui lòng gọi phụ huynh và đánh dấu "Đã gọi" hoặc ghi chú tư vấn trước khi kích hoạt).',
                'Care status not updated (please call parent and mark "Called" or add consult notes before activating).'
              ),
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

  const getDemoTeachersList = (): KtnTeacherRecord[] => {
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
    return Array.from(tMap.values()).filter(
      (t) =>
        t.active !== false &&
        t.status !== 'inactive' &&
        !(t as { aliases?: string[] }).aliases?.includes('__status:deleted') &&
        !(t as { deleted?: boolean }).deleted
    );
  };

  const teachersQuery = useQuery<KtnTeacherRecord[]>({
    queryKey: ['ktn-admin-teachers', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return getDemoTeachersList();
      }
      const seeded = queryClient.getQueryData<KtnTeacherRecord[]>([
        'ktn-admin-teachers',
        user?.email,
        isDemoMode,
      ]);
      if (Array.isArray(seeded) && seeded.length > 0) {
        return seeded;
      }
      const res = await ktnApi.searchAdminTeachers({ limit: 50, offset: 0 });
      return res.items;
    },
    enabled: isDemoMode,
  });

  const teacherSearchOffset = (teacherPage - 1) * teacherPageLimit;

  const teacherSearchQuery = useQuery<KtnTeacherSearchResult>({
    queryKey: [
      'ktn-admin-teachers-search',
      user?.email,
      isDemoMode,
      debouncedTeacherQ,
      teacherFilter,
      teacherClassFilter,
      teacherPage,
      teacherPageLimit,
    ],
    placeholderData: keepPreviousData,
    queryFn: async ({ signal }) => {
      if (isDemoMode) {
        return filterAndPaginateTeachersClientSide(getDemoTeachersList(), {
          q: debouncedTeacherQ,
          status: teacherFilter,
          classCode: teacherClassFilter,
          limit: teacherPageLimit,
          offset: teacherSearchOffset,
        });
      }
      try {
        const res = await ktnApi.searchAdminTeachers(
          {
            q: debouncedTeacherQ || undefined,
            status: teacherFilter !== 'ALL' ? teacherFilter : undefined,
            classCode: teacherClassFilter !== 'ALL' ? teacherClassFilter : undefined,
            limit: teacherPageLimit,
            offset: teacherSearchOffset,
          },
          { signal }
        );
        if (
          !debouncedTeacherQ &&
          teacherFilter === 'ALL' &&
          teacherClassFilter === 'ALL' &&
          teacherPage === 1
        ) {
          const existing = queryClient.getQueryData<KtnTeacherRecord[]>([
            'ktn-admin-teachers',
            user?.email,
            isDemoMode,
          ]);
          if (!Array.isArray(existing) || existing.length === 0) {
            queryClient.setQueryData(
              ['ktn-admin-teachers', user?.email, isDemoMode],
              res.items
            );
          }
        }
        return res;
      } catch (err) {
        if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
          throw err;
        }
        const seeded = queryClient.getQueryData<KtnTeacherRecord[]>([
          'ktn-admin-teachers',
          user?.email,
          isDemoMode,
        ]);
        if (Array.isArray(seeded)) {
          return filterAndPaginateTeachersClientSide(seeded, {
            q: debouncedTeacherQ,
            status: teacherFilter,
            classCode: teacherClassFilter,
            limit: teacherPageLimit,
            offset: teacherSearchOffset,
          });
        }
        throw err;
      }
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const selectedTeacherDetailQuery = useQuery<KtnTeacherRecord | null>({
    queryKey: ['ktn-admin-teacher-detail', selectedTeacherKey, isDemoMode],
    queryFn: async () => {
      if (!selectedTeacherKey || isDemoMode) return null;
      const list = await ktnApi.getTeachers(selectedTeacherKey);
      const norm = selectedTeacherKey.toLowerCase();
      return (
        list.find(
          (t) =>
            String(t.email || '').toLowerCase() === norm ||
            String(t.code || '').toLowerCase() === norm
        ) || null
      );
    },
    enabled: Boolean(selectedTeacherKey) && !isDemoMode,
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
          message: tr('Đã cập nhật thông tin đơn hàng (Demo)!', 'Order info updated (Demo)!'),
        };
      }
      return ktnApi.updateOrder(params);
    },
    onSuccess: (res) => {
      setOrderDrawerError(null);
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      addToast({
        title: res.message || tr('Đã cập nhật thông tin đơn hàng!', 'Order info updated!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      setOrderDrawerError(err.message);
      addToast({
        title: tr('Không thể cập nhật đơn hàng', 'Unable to update order'),
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
      durationPreset?: CourseDurationPreset;
    }) => {
      setOrderDrawerError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        const preset = params.durationPreset || 'unlimited';
        const todayStr = getHoChiMinhCalendarDateString(getServerNowMs());
        const limitTime = addPresetToCalendarDate(todayStr, preset);
        return {
          message: tr('Đã cấp thành công', 'Granted successfully'),
          orderId: params.orderId,
          studentEmail: params.studentEmail || 'giahan@khongtunhi.com',
          accountCreated: true,
          existingAccount: false,
          initialPassword: 'KtnDemoOrder!2026',
          syncStatus: 'synced' as const,
          durationPreset: preset,
          limitTime,
          expiresAt: toIzTeachExpiresAtIso(limitTime),
        };
      }
      return ktnApi.approveOrder(params.orderId, params.classCode, {
        confirmActivation: true,
        studentEmail: params.studentEmail,
        durationPreset: params.durationPreset,
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
          roleLabel: tr('Học viên (Duyệt đơn)', 'Student (Order approved)'),
          accountCreated: true,
          existingAccount: false,
          initialPassword: res.initialPassword,
        });
      }
      if (res.syncStatus === 'partial_failure') {
        addToast({
          title: tr('Cần hoàn tất đồng bộ thời hạn', 'Duration sync needs completion'),
          description: res.message,
          variant: 'warning',
        });
      } else {
        addToast({
          title: res.message || tr('Đã cấp thành công!', 'Granted successfully!'),
          variant: 'success',
        });
      }
    },
    onError: (err: Error) => {
      setOrderDrawerError(err.message);
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      addToast({
        title: tr('Chưa thể kích hoạt khóa học', 'Unable to activate course'),
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
        roleLabel: tr('Học viên', 'Student'),
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
    mutationFn: async (params: {
      email: string;
      courseIds: string[];
      durationPreset?: CourseDurationPreset;
      durationMode?: CourseDurationMode;
    }) => {
      setDrawerActionError(null);
      if (!params.courseIds || params.courseIds.length === 0) {
        throw new Error(
          tr(
            'Vui lòng chọn ít nhất 1 khóa học trước khi cấp quyền.',
            'Please select at least 1 course before granting access.'
          )
        );
      }
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        const base = buildBaseDemoStudent(params.email);
        const existingCourses = base.online_courses || [];
        const preset = params.durationPreset || 'unlimited';
        const todayStr = getHoChiMinhCalendarDateString(getServerNowMs());
        const limitTime = addPresetToCalendarDate(todayStr, preset);
        const expiresAt = toIzTeachExpiresAtIso(limitTime);
        const addedCourses = DEMO_COURSES.filter((c) =>
          params.courseIds.includes(c.id)
        ).map((c) => ({
          id: c.id,
          code: c.code || c.id,
          title: c.title,
          shortTitle: c.shortTitle || c.title,
          limitTime,
          expiresAt,
          durationPreset: preset,
          isExpired: false,
          syncStatus: 'synced' as const,
        }));
        const mergedMap = new Map<string, (typeof existingCourses)[number]>();
        [...existingCourses, ...addedCourses].forEach((c) => mergedMap.set(c.id, c));
        const updatedStudent: KtnStudentRecord = {
          ...base,
          has_online_courses: mergedMap.size > 0,
          online_courses: Array.from(mergedMap.values()),
        };
        return {
          message: tr('Đã cấp thêm khóa học thành công!', 'Added course access successfully!'),
          student: updatedStudent,
        };
      }
      return ktnApi.grantStudentCourses({
        email: params.email,
        courseIds: params.courseIds,
        durationPreset: params.durationPreset,
        durationMode: params.durationMode,
      });
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        tr(
          'Đã cấp thêm khóa học (giữ nguyên lớp trực tiếp)!',
          'Added courses (offline class unchanged)!'
        )
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể cấp khóa học', 'Unable to grant course'),
        description: err.message,
        variant: 'error',
      });
    },
  });

  const setCourseDurationMutation = useMutation({
    mutationFn: async (params: {
      studentEmail: string;
      courseId: string;
      preset: CourseDurationPreset;
      mode?: CourseDurationMode;
      clientRequestId?: string;
    }) => {
      setDrawerActionError(null);
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200));
        const base = buildBaseDemoStudent(params.studentEmail);
        const existingCourses = base.online_courses || [];
        const todayStr = getHoChiMinhCalendarDateString(getServerNowMs());
        const targetCourse = existingCourses.find((c) => c.id === params.courseId);
        const currentLimitDate = extractCalendarDateFromLimitTime(
          targetCourse?.limitTime || targetCourse?.expiresAt
        );
        const anchorDate =
          params.mode === 'extend_from_current' &&
          currentLimitDate &&
          currentLimitDate > todayStr
            ? currentLimitDate
            : todayStr;
        const limitTime = addPresetToCalendarDate(anchorDate, params.preset);
        const expiresAt = toIzTeachExpiresAtIso(limitTime);
        const nextCourses = existingCourses.map((c) =>
          c.id === params.courseId
            ? {
                ...c,
                limitTime,
                expiresAt,
                durationPreset: params.preset,
                isExpired: false,
                syncStatus: 'synced' as const,
              }
            : c
        );
        const updatedStudent: KtnStudentRecord = {
          ...base,
          online_courses: nextCourses,
        };
        return {
          ok: true,
          message: tr('Đã cập nhật thời hạn khóa học thành công!', 'Updated course duration successfully!'),
          student: updatedStudent,
        };
      }
      return ktnApi.setStudentCourseDuration(params);
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.studentEmail,
        tr('Đã cập nhật thời hạn khóa học!', 'Course duration updated!')
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể cập nhật thời hạn khóa học', 'Unable to update course duration'),
        description: err.message,
        variant: 'error',
      });
    },
  });

  const revokeCourseMutation = useMutation({
    mutationFn: async (params: { email: string; courseId: string }) => {
      setDrawerActionError(null);
      if (!params.courseId) {
        throw new Error(tr('Vui lòng chọn khóa học cần thu hồi.', 'Please select a course to revoke.'));
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
        return { message: tr('Đã thu hồi khóa học!', 'Revoked course access!'), student: updatedStudent };
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
        tr(
          'Đã thu hồi khóa học (giữ nguyên các khóa khác & lớp học)!',
          'Course revoked (other courses & classes kept unchanged)!'
        )
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể thu hồi khóa học', 'Unable to revoke course'),
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
            ? tr(`Đã chuyển sang lớp ${params.classCode}!`, `Transferred to class ${params.classCode}!`)
            : tr('Đã bỏ xếp lớp trực tiếp!', 'Unassigned from offline class!'),
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
          ? tr(
              `Đã cập nhật lớp trực tiếp (${vars.classCode}) — giữ nguyên quyền khóa học!`,
              `Updated live class (${vars.classCode}) — course access preserved!`
            )
          : tr(
              'Đã bỏ xếp lớp trực tiếp — giữ nguyên quyền khóa học!',
              'Unassigned live class — course access preserved!'
            )
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể cập nhật lớp trực tiếp', 'Unable to update offline class'),
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
        return {
          message: tr('Đã thay thế danh sách khóa học!', 'Replaced courses list!'),
          student: updatedStudent,
        };
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
        tr('Đã thay thế toàn bộ danh sách khóa học!', 'Replaced full courses list!')
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể thay thế danh sách khóa học', 'Unable to replace courses list'),
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
        return {
          message: tr('Đã lưu thông tin hồ sơ học viên!', 'Saved student profile!'),
          student: updatedStudent,
        };
      }
      return ktnApi.updateStudentProfile(params);
    },
    onSuccess: (res, vars) => {
      handleStudentMutationSuccess(
        res,
        vars.email,
        tr('Đã cập nhật thông tin hồ sơ học viên!', 'Updated student profile!')
      );
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể lưu thông tin học viên', 'Unable to save student info'),
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
          message: tr('Đã tạo học viên mới thành công!', 'Created new student successfully!'),
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
        durationPreset: newStuDurationPreset,
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
        roleLabel: tr('Học viên mới', 'New student'),
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
      setNewStuDurationPreset('unlimited');
      setNewStuIdempotencyKey(`PROV-UI-${Date.now()}`);
      if (res.syncStatus === 'partial_failure') {
        addToast({
          title: tr('Cần hoàn tất đồng bộ thời hạn', 'Duration sync needs completion'),
          description: res.message,
          variant: 'warning',
        });
      } else {
        addToast({
          title: res.message || tr('Đã tạo & cấp quyền học viên thành công!', 'Student created & granted access!'),
          variant: 'success',
        });
      }
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Chưa tạo được tài khoản học viên', 'Could not create student account'),
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
          message: tr('Đã tạo tài khoản giáo viên!', 'Created teacher account!'),
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
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teacher-detail'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      setShowCreateTeacherModal(false);
      setCredentialHandoff({
        name: res.teacher?.name || newTeacherName,
        email: res.teacher?.email || newTeacherEmail,
        roleLabel: tr('Giáo viên', 'Teacher'),
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
        title: res.message || tr('Đã lưu hồ sơ giáo viên & phân công lớp!', 'Saved teacher profile & class assignments!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể tạo giáo viên', 'Unable to create teacher'),
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
              ? tr(
                  `Đã gỡ ${params.email} khỏi danh sách hoạt động Supabase và chặn đồng bộ ngược (chưa xác minh xóa cứng Cognito/izTeach, giữ nguyên đơn hàng).`,
                  `Removed ${params.email} from active Supabase list and blocked reverse sync (hard deletion on Cognito/izTeach unverified, orders preserved).`
                )
              : tr('Đã cập nhật trạng thái tài khoản học viên!', 'Updated student account status!'),
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
          title: tr(
            'Đã xử lý xóa có điều kiện trên Supabase (Chưa xác minh xóa Cognito/izTeach)',
            'Conditional Supabase deletion processed (Cognito/izTeach deletion unverified)'
          ),
          description: tr(
            'Hồ sơ hoạt động đã gỡ khỏi Supabase & chặn đồng bộ ngược. Đơn hàng/lịch sử học tập được bảo toàn; tài khoản gốc Cognito/izTeach chưa xóa cứng.',
            'Active record removed from Supabase & reverse sync blocked. Orders/learning history preserved; Cognito/izTeach root account not hard-deleted.'
          ),
          variant: 'warning',
        });
      } else {
        addToast({
          title: res.message || tr('Đã cập nhật trạng thái tài khoản học viên!', 'Updated student account status!'),
          variant: 'success',
        });
      }
    },
    onError: (err: Error) => {
      setDrawerActionError(err.message);
      addToast({
        title: tr('Không thể cập nhật trạng thái tài khoản', 'Unable to update account status'),
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
              ? tr(
                  'Đã phê duyệt & kích hoạt khóa học video cho học viên!',
                  'Approved & activated video course for student!'
                )
              : tr('Đã từ chối đề nghị mở khóa học.', 'Rejected course access request.'),
        };
      }
      return ktnApi.reviewCourseGrantRequest(params);
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-course-grant-requests'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      addToast({
        title: res.message || tr('Đã xử lý đề nghị mở khóa học của giáo viên!', 'Processed teacher course request!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể xử lý yêu cầu', 'Unable to process request'),
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
        return { ok: true, message: tr('Đã cập nhật hồ sơ giáo viên!', 'Updated teacher profile!') };
      }
      return ktnApi.saveTeacher({
        ...payload,
        specialty: payload.specialty || payload.specialization,
        initialPassword: payload.initialPassword || payload.password,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teacher-detail'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      addToast({
        title: res.message || tr('Đã cập nhật hồ sơ & phân công giáo viên!', 'Updated teacher profile & assignments!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể cập nhật giáo viên', 'Unable to update teacher'),
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
        title: tr(
          `Đã ghi nhận ${vars.pointsDelta > 0 ? `+${vars.pointsDelta}` : vars.pointsDelta} điểm đóng góp!`,
          `Recorded ${vars.pointsDelta > 0 ? `+${vars.pointsDelta}` : vars.pointsDelta} contribution points!`
        ),
        description: `${tr('Lý do:', 'Reason:')} ${vars.reason}`,
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể điều chỉnh điểm đóng góp', 'Unable to adjust contribution points'),
        description: err.message,
        variant: 'error',
      });
    },
  });

  const retrySyncMutation = useMutation({
    mutationFn: async (payload: {
      type:
        | 'student_provision'
        | 'student_sync'
        | 'teacher_provision'
        | 'order_approve'
        | 'homework_sync'
        | 'course_duration'
        | 'bulk_sync';
      email?: string;
      orderId?: string;
      homeworkId?: string;
      courseId?: string;
      preset?: CourseDurationPreset;
      mode?: CourseDurationMode;
      limitTime?: string | null;
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
        title: tr('Đã đồng bộ lại dữ liệu thành công!', 'Data re-synced successfully!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Đồng bộ lại chưa thành công', 'Re-sync failed'),
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
        throw new Error(
          tr(
            `Vui lòng nhập chính xác mã lớp "${cleanCode}" để xác nhận xóa.`,
            `Please enter exact class code "${cleanCode}" to confirm deletion.`
          )
        );
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
          message: tr(
            `Đã lưu trữ (soft-delete) lớp ${cleanCode} thành công. Dữ liệu lịch sử được bảo toàn.`,
            `Archived (soft-deleted) class ${cleanCode} successfully. Historical data preserved.`
          ),
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
      queryClient.setQueriesData<KtnTeacherSearchResult>(
        { queryKey: ['ktn-admin-teachers-search'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
        (prev) => {
          if (!prev || !Array.isArray(prev.items)) return prev;
          return {
            ...prev,
            items: prev.items.map((t) => ({
              ...t,
              assigned_classes: (t.assigned_classes || []).filter(
                (c) => String(c || '').trim().toUpperCase() !== cleanCode
              ),
            })),
          };
        }
      );

      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-sync-status'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-overview'] });

      addToast({
        title:
          res.message ||
          tr(`Đã xóa / lưu trữ lớp ${cleanCode}`, `Deleted / archived class ${cleanCode}`),
        description: tr(
          'Nhóm lớp đã ẩn khỏi danh sách hoạt động & phân công hiện hành; tin nhắn, bài tập và điểm danh lịch sử được bảo toàn.',
          'Class hidden from active lists & assignments; past messages, homework, and attendance are preserved.'
        ),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      const apiErr = err as KtnApiError;
      const errMsg = err.message || tr('Không thể xóa lớp học.', 'Unable to delete class.');
      setDeleteClassError(errMsg);
      if (
        apiErr?.status === 409 ||
        errMsg.toLowerCase().includes('học viên') ||
        errMsg.toLowerCase().includes('student')
      ) {
        setDeleteClassBlockedStudentCount((prev) => (prev && prev > 0 ? prev : 1));
      }
      addToast({
        title: tr('Chưa thể xóa lớp học', 'Unable to delete class'),
        description: errMsg,
        variant: 'error',
      });
    },
  });

  const deleteTeacherMutation = useMutation({
    mutationFn: async (teacher: KtnTeacherRecord) => {
      const teacherId = (teacher as { id?: string }).id || teacher.code || teacher.email;
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 200));
        const emailKey = (teacher.email || '').toLowerCase();
        if (emailKey) {
          demoTeacherOverridesRef.current[emailKey] = {
            ...(demoTeacherOverridesRef.current[emailKey] || teacher),
            active: false,
            status: 'inactive',
            assigned_classes: [],
            assigned_courses: [],
          };
        }
        if (Array.isArray(demoClassesRef.current)) {
          demoClassesRef.current = demoClassesRef.current.map((c) => {
            if (
              c.teacher_email?.toLowerCase() === emailKey ||
              c.teacher_code === teacher.code
            ) {
              return { ...c, teacher_email: undefined, teacher_code: '' };
            }
            return c;
          });
        }
        return {
          ok: true,
          deleted: true,
          teacherId,
          teacherEmail: teacher.email,
          teacherName: teacher.name,
          unassignedClassesCount: teacher.assigned_classes?.length ?? 0,
          unassignedClasses: teacher.assigned_classes ?? [],
          sessionRevoked: true,
          syncStatus: 'synced',
          message: tr(
            'Đã xóa giáo viên thành công (chế độ demo).',
            'Teacher deleted successfully (demo mode).'
          ),
        };
      }

      return ktnApi.deleteTeacher({
        teacherId,
        email: teacher.email,
        code: teacher.code,
      });
    },
    onSuccess: (res, deletedTeacher) => {
      const deletedEmail = (deletedTeacher.email || '').toLowerCase();
      const deletedCode = deletedTeacher.code;
      const deletedId = (deletedTeacher as { id?: string }).id;

      // 1. Optimistic cache update for teacher search queries
      queryClient.setQueriesData<KtnTeacherSearchResult>(
        { queryKey: ['ktn-admin-teachers-search'] },
        (prev) => {
          if (!prev || !Array.isArray(prev.items)) return prev;
          const remaining = prev.items.filter(
            (t) =>
              t.email.toLowerCase() !== deletedEmail &&
              (!deletedCode || t.code !== deletedCode) &&
              (!deletedId || (t as { id?: string }).id !== deletedId)
          );
          const removedCount = prev.items.length - remaining.length;
          return {
            ...prev,
            items: remaining,
            totalCount: Math.max(
              0,
              (prev.totalCount ?? (remaining.length + removedCount)) - removedCount
            ),
          };
        }
      );

      // 2. Optimistic cache update for teacher list queries
      queryClient.setQueriesData<KtnTeacherRecord[]>(
        { queryKey: ['ktn-admin-teachers'] },
        (prev) => {
          if (!Array.isArray(prev)) return prev;
          return prev.filter(
            (t) =>
              t.email.toLowerCase() !== deletedEmail &&
              (!deletedCode || t.code !== deletedCode) &&
              (!deletedId || (t as { id?: string }).id !== deletedId)
          );
        }
      );

      // 3. Invalidate relevant queries for zero-reload consistency
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-classes'] });
      queryClient.invalidateQueries({ queryKey: ['chat-rooms'] });

      // 4. Close drawer if open teacher is deleted
      if (
        selectedTeacherKey &&
        (selectedTeacherKey.toLowerCase() === deletedEmail ||
          selectedTeacherKey === deletedCode ||
          (deletedId && selectedTeacherKey === deletedId))
      ) {
        setSelectedTeacherKey(null);
      }

      // 5. Close confirmation modal
      setTeacherToDelete(null);

      // 6. Display success toast
      addToast({
        title: tr('Đã xóa giáo viên thành công!', 'Teacher deleted successfully!'),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể xóa giáo viên', 'Unable to delete teacher'),
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
  const teachersList = useMemo(() => {
    if (isDemoMode) {
      return teachersQuery.data || getDemoTeachersList();
    }
    const legacyItems = Array.isArray(teachersQuery.data) ? teachersQuery.data : [];
    const searchItems = Array.isArray(teacherSearchQuery.data?.items)
      ? teacherSearchQuery.data.items
      : [];
    if (legacyItems.length === 0) return searchItems;
    if (searchItems.length === 0) return legacyItems;
    const byKey = new Map<string, KtnTeacherRecord>();
    for (const item of legacyItems) {
      const k = String(item.email || item.code || '').toLowerCase();
      if (k) byKey.set(k, item);
    }
    for (const item of searchItems) {
      const k = String(item.email || item.code || '').toLowerCase();
      if (k) {
        const prev = byKey.get(k);
        byKey.set(k, prev ? { ...prev, ...item } : item);
      }
    }
    return Array.from(byKey.values());
  }, [isDemoMode, teachersQuery.data, teacherSearchQuery.data?.items]);

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
    const baseMatch =
      teachersList.find(
        (t) =>
          String(t.code || '').toLowerCase() === norm ||
          String(t.email || '').toLowerCase() === norm
      ) || null;
    if (selectedTeacherDetailQuery.data) {
      return {
        ...(baseMatch || {}),
        ...selectedTeacherDetailQuery.data,
      };
    }
    return baseMatch;
  }, [selectedTeacherKey, teachersList, selectedTeacherDetailQuery.data]);
  const filteredTeachersResult: KtnTeacherSearchResult = useMemo(() => {
    if (isDemoMode) {
      return filterAndPaginateTeachersClientSide(teachersList, {
        q: teacherSearchInput,
        status: teacherFilter,
        classCode: teacherClassFilter,
        limit: teacherPageLimit,
        offset: teacherSearchOffset,
      });
    }
    if (teacherSearchQuery.data) {
      return teacherSearchQuery.data;
    }
    return filterAndPaginateTeachersClientSide(teachersList, {
      q: debouncedTeacherQ,
      status: teacherFilter,
      classCode: teacherClassFilter,
      limit: teacherPageLimit,
      offset: teacherSearchOffset,
    });
  }, [
    isDemoMode,
    teachersList,
    teacherSearchInput,
    debouncedTeacherQ,
    teacherFilter,
    teacherClassFilter,
    teacherPageLimit,
    teacherSearchOffset,
    teacherSearchQuery.data,
  ]);
  const filteredTeachersList = filteredTeachersResult.items;
  const totalTeachersCount = filteredTeachersResult.totalCount;
  const hasMoreTeachers = filteredTeachersResult.hasMore;
  const totalTeacherPages = Math.max(
    1,
    Math.ceil(totalTeachersCount / teacherPageLimit)
  );
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
      tr(
        `THÔNG TIN TÀI KHOẢN HỌC VIỆN KHỔNG TỬ NHÍ (${info.roleLabel})`,
        `LITTLE CONFUCIUS ACADEMY ACCOUNT DETAILS (${info.roleLabel})`
      ),
      `- ${tr('Họ tên', 'Full name')}: ${info.name}`,
      `- ${tr('Email đăng nhập', 'Login email')}: ${info.email}`,
      info.accountCreated && info.initialPassword
        ? `- ${tr('Mật khẩu khởi tạo (dùng 1 lần)', 'Initial password (one-time)')}: ${info.initialPassword}`
        : `- ${tr(
            'Mật khẩu: Giữ nguyên mật khẩu tài khoản hiện có của bạn (nếu quên mật khẩu, vui lòng bấm Quên mật khẩu hoặc nhắn Học vụ hỗ trợ).',
            'Password: Keeps your existing account password (if forgotten, click Forgot Password or message Academic Support).'
          )}`,
      info.classCode ? `- ${tr('Lớp trực tiếp', 'Offline class')}: ${info.classCode}` : null,
    ].filter(Boolean);
    navigator.clipboard?.writeText(lines.join('\n')).catch(() => {});
    addToast({
      title: tr('Đã sao chép thông tin bàn giao tài khoản!', 'Copied account handoff info!'),
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
              { id: 'all', label: tr('Tất cả', 'Overview'), to: '/admin' },
              {
                id: 'students',
                label: `${tr('Học viên', 'Students')} (${totalStudentsCount})`,
                to: '/admin/students',
              },
              {
                id: 'teachers',
                label: `${tr('Giáo viên', 'Teachers')} (${totalTeachersCount})${
                  pendingCourseRequestsCount > 0 ? ` · ${pendingCourseRequestsCount} ${tr('YC', 'req')}` : ''
                }`,
                to: '/admin/teachers',
              },
              { id: 'classes', label: `${tr('Lớp', 'Classes')} (${classesList.length})`, to: '/admin/classes' },
              { id: 'orders', label: `${tr('Đơn hàng', 'Orders')} (${ordersList.length})`, to: '/admin/orders' },
              { id: 'consultations', label: tr('Tư vấn', 'Consults'), to: '/admin/consultations' },
              { id: 'more', label: tr('Đối soát & Đồng bộ', 'Sync & Audit'), to: '/admin/more' },
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

        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            data-testid="open-bulk-import-modal-btn"
            onClick={() => {
              setBulkError(null);
              setShowBulkImportModal(true);
            }}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-amber-100"
          >
            <Upload className="h-3.5 w-3.5 text-red-800" />
            <span>{tr('Nhập hàng loạt (Excel/CSV)', 'Bulk Import (Excel/CSV)')}</span>
          </button>
          <button
            type="button"
            data-testid="admin-open-create-student-btn"
            onClick={() => setShowCreateStudentModal(true)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-900"
          >
            <UserPlus className="h-3.5 w-3.5" />
            <span>{tr('+ Tạo học viên', '+ Add student')}</span>
          </button>
          <button
            type="button"
            data-testid="admin-open-create-teacher-btn"
            onClick={() => setShowCreateTeacherModal(true)}
            className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800 hover:bg-stone-100"
          >
            <GraduationCap className="h-3.5 w-3.5 text-red-800" />
            <span>{tr('+ Tạo giáo viên', '+ Add teacher')}</span>
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
                {tr('Thông tin bàn giao tài khoản', 'Account handoff details')} ({credentialHandoff.roleLabel}):{' '}
                <span>{credentialHandoff.name}</span> ({credentialHandoff.email})
              </p>
              {credentialHandoff.accountCreated && credentialHandoff.initialPassword ? (
                <p data-testid="admin-credential-initial-password" className="text-xs">
                  {tr(
                    'Mật khẩu khởi tạo (chỉ hiển thị 1 lần, không lưu trữ bản rõ):',
                    'Initial password (shown once only, not stored in plaintext):'
                  )}{' '}
                  <code className="rounded bg-white px-2 py-0.5 font-mono font-bold text-red-800">
                    {credentialHandoff.initialPassword}
                  </code>
                </p>
              ) : (
                <p data-testid="admin-credential-existing-account-notice" className="text-xs">
                  {lang === 'en' ? (
                    <>
                      Account already exists — <strong>current password preserved</strong> (not overwritten).
                    </>
                  ) : (
                    <>
                      Tài khoản đã tồn tại trên hệ thống — <strong>giữ nguyên mật khẩu hiện tại</strong> của người dùng (không ghi đè mật khẩu).
                    </>
                  )}
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
                {tr('Sao chép', 'Copy')}
              </button>
              <button
                type="button"
                aria-label={tr('Đóng thông tin bàn giao', 'Close handoff info')}
                onClick={() => setCredentialHandoff(null)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-emerald-200 bg-white text-emerald-900"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 0: Bulk Import Classes · Teachers · Students (Excel/CSV) */}
      {showBulkImportModal && (
        <div
          data-testid="bulk-import-modal"
          role="dialog"
          aria-modal="true"
          aria-label={tr('Nhập hàng loạt Lớp · Giáo viên · Học sinh', 'Bulk Import Classes · Teachers · Students')}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-3 backdrop-blur-xs sm:p-5"
        >
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-stone-200 bg-stone-50 px-4 py-3">
              <div className="flex items-center gap-2.5">
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-red-100 text-red-800">
                  <Upload className="h-4 w-4" />
                </span>
                <div>
                  <h2 className="font-display text-sm font-extrabold text-stone-900 sm:text-base">
                    {tr('Nhập hàng loạt Lớp · Giáo viên · Học sinh (Excel / CSV)', 'Bulk Import Classes · Teachers · Students (Excel / CSV)')}
                  </h2>
                  <p className="text-[11px] text-stone-500">
                    {lang === 'en' ? (
                      <>
                        Auto-normalizes class codes (<code className="font-mono">LO2-N01</code>, <code className="font-mono">HSK-N01</code>...), Teacher IDs (<code className="font-mono">GV001@khongtunhi.com</code>), Student IDs (<code className="font-mono">20260001@khongtunhi.com</code>) & default password <code className="font-mono font-bold text-red-800">12345678</code>
                      </>
                    ) : (
                      <>
                        Tự động chuẩn hóa mã lớp (<code className="font-mono">LO2-N01</code>, <code className="font-mono">HSK-N01</code>...), mã Giáo viên (<code className="font-mono">GV001@khongtunhi.com</code>), mã Học sinh (<code className="font-mono">20260001@khongtunhi.com</code>) & mật khẩu mặc định <code className="font-mono font-bold text-red-800">12345678</code>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowBulkImportModal(false)}
                className="inline-flex h-8 w-8 items-center justify-center rounded-xl border border-stone-200 bg-white text-stone-500 hover:bg-stone-100"
                aria-label={tr('Đóng', 'Close')}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex-1 space-y-4 overflow-y-auto p-4">
              {bulkError && (
                <div
                  data-testid="bulk-import-error"
                  className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-xs font-medium text-red-800"
                >
                  {bulkError}
                </div>
              )}

              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-stone-800">
                    {lang === 'en' ? (
                      <>
                        5-column data (<code className="font-mono">CLASS · SCHEDULE, TEACHER, STUDENT, PHONE, PARENT</code>)
                      </>
                    ) : (
                      <>
                        Dữ liệu 5 cột (<code className="font-mono">LỚP · LỊCH HỌC, GIÁO VIÊN, HỌC SINH, SĐT, PHỤ HUYNH</code>)
                      </>
                    )}
                  </label>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      data-testid="bulk-import-load-sample-btn"
                      onClick={() => {
                        setBulkCsvText(KTN_CENTER_SAMPLE_CSV);
                        handlePreviewBulkImport(KTN_CENTER_SAMPLE_CSV);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3 py-1.5 text-xs font-bold text-red-900 hover:bg-amber-100"
                    >
                      <span>{tr('Tải dữ liệu mẫu của Trung tâm', 'Load Center Sample Data')}</span>
                    </button>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50">
                      <span>{tr('Chọn file .CSV', 'Choose .CSV file')}</span>
                      <input
                        type="file"
                        accept=".csv,.tsv,.txt"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = () => {
                            const content = String(reader.result || '');
                            setBulkCsvText(content);
                            handlePreviewBulkImport(content);
                          };
                          reader.readAsText(file, 'utf-8');
                        }}
                      />
                    </label>
                  </div>
                </div>

                <textarea
                  rows={5}
                  data-testid="bulk-import-csv-textarea"
                  value={bulkCsvText}
                  onChange={(e) => setBulkCsvText(e.target.value)}
                  placeholder={tr(
                    'Dán trực tiếp bảng dữ liệu từ Excel hoặc CSV 5 cột:\n"LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h",Cô Hồng,Bùi Đức Huy,0366753257,Mẹ Bùi Hằng',
                    'Paste 5-column Excel or CSV data here:\n"LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h",Ms. Hong,Bui Duc Huy,0366753257,Mom Bui Hang'
                  )}
                  className="w-full rounded-xl border border-stone-300 p-3 font-mono text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                />

                <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-stone-700">
                      {tr('Mật khẩu mặc định:', 'Default password:')}
                    </span>
                    <input
                      type="text"
                      data-testid="bulk-import-default-password-input"
                      value={bulkDefaultPassword}
                      onChange={(e) => setBulkDefaultPassword(e.target.value)}
                      className="w-32 rounded-lg border border-stone-300 px-2.5 py-1 font-mono text-xs font-bold text-red-900"
                    />
                  </div>
                  <button
                    type="button"
                    data-testid="bulk-import-preview-btn"
                    disabled={isAnalyzingBulk}
                    onClick={() => handlePreviewBulkImport()}
                    className="inline-flex items-center gap-1.5 rounded-xl bg-stone-900 px-4 py-2 text-xs font-bold text-white hover:bg-stone-800 disabled:opacity-50"
                  >
                    {isAnalyzingBulk && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{tr('Phân tích & Xem trước', 'Parse & Preview')}</span>
                  </button>
                </div>
              </div>

              {bulkPreviewResult && (
                <div data-testid="bulk-import-preview-section" className="space-y-3">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <span className="block text-[11px] font-semibold text-stone-500">
                        {tr('Tổng số Lớp học', 'Total Classes')}
                      </span>
                      <span
                        data-testid="bulk-preview-class-count"
                        className="mt-0.5 block font-display text-lg font-extrabold text-stone-900"
                      >
                        {bulkPreviewResult.summary.classCount} {tr('lớp', 'classes')}
                      </span>
                      <span className="text-[11px] text-stone-600">
                        {bulkPreviewResult.summary.activeClassCount} {tr('đang học', 'active')} ·{' '}
                        {bulkPreviewResult.summary.archivedClassCount} {tr('bảo lưu', 'archived')}
                      </span>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <span className="block text-[11px] font-semibold text-stone-500">
                        {tr('Giáo viên phụ trách', 'Teachers')}
                      </span>
                      <span
                        data-testid="bulk-preview-teacher-count"
                        className="mt-0.5 block font-display text-lg font-extrabold text-red-900"
                      >
                        {bulkPreviewResult.summary.teacherCount} {tr('GV', 'teachers')}
                      </span>
                      <span className="font-mono text-[11px] text-stone-600">
                        {bulkPreviewResult.teachers[0]?.code || 'GV001'} →{' '}
                        {bulkPreviewResult.teachers[bulkPreviewResult.teachers.length - 1]?.code || 'GVxxx'}
                      </span>
                    </div>

                    <div className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                      <span className="block text-[11px] font-semibold text-stone-500">
                        {tr('Tổng số Học sinh', 'Total Students')}
                      </span>
                      <span
                        data-testid="bulk-preview-student-count"
                        className="mt-0.5 block font-display text-lg font-extrabold text-emerald-900"
                      >
                        {bulkPreviewResult.summary.studentCount} {tr('học viên', 'students')}
                      </span>
                      <span className="text-[11px] text-stone-600">
                        {bulkPreviewResult.summary.activeStudentCount} {tr('đang học', 'active')} ·{' '}
                        {bulkPreviewResult.summary.archivedStudentCount} {tr('bảo lưu', 'archived')}
                      </span>
                    </div>

                    <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
                      <span className="block text-[11px] font-semibold text-amber-900">
                        {tr('Mật khẩu mặc định & Cảnh báo', 'Default Password & Notes')}
                      </span>
                      <span className="mt-0.5 block font-mono text-base font-extrabold text-red-800">
                        {bulkPreviewResult.summary.defaultPassword}
                      </span>
                      <span className="text-[11px] font-medium text-amber-900">
                        {bulkPreviewResult.summary.warningCount} {tr('ghi chú chuẩn hóa SĐT/tên', 'phone/name normalization note(s)')}
                      </span>
                    </div>
                  </div>

                  {/* Preview Sub-tabs */}
                  <div className="flex flex-wrap items-center gap-1.5 border-b border-stone-200 pb-2">
                    {(
                      [
                        {
                          id: 'classes',
                          label: `${tr('Lớp học', 'Classes')} (${bulkPreviewResult.classes.length})`,
                        },
                        {
                          id: 'teachers',
                          label: `${tr('Giáo viên', 'Teachers')} (${bulkPreviewResult.teachers.length})`,
                        },
                        {
                          id: 'students',
                          label: `${tr('Học sinh', 'Students')} (${bulkPreviewResult.students.length})`,
                        },
                        {
                          id: 'warnings',
                          label: `${tr('Chuẩn hóa tự động', 'Auto-normalized')} (${bulkPreviewResult.warnings.length})`,
                        },
                      ] as const
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setBulkPreviewTab(tab.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                          bulkPreviewTab === tab.id
                            ? 'bg-red-800 text-white'
                            : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>

                  {/* Preview Table Content */}
                  <div className="max-h-72 overflow-y-auto rounded-xl border border-stone-200">
                    {bulkPreviewTab === 'classes' && (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-stone-100 text-[11px] font-bold uppercase text-stone-600">
                          <tr>
                            <th className="px-3 py-2">{tr('Mã lớp', 'Class code')}</th>
                            <th className="px-3 py-2">{tr('Tên lớp', 'Class name')}</th>
                            <th className="px-3 py-2">{tr('Lịch học', 'Schedule')}</th>
                            <th className="px-3 py-2">{tr('Giáo viên', 'Teacher')}</th>
                            <th className="px-3 py-2">{tr('Sĩ số', 'Size')}</th>
                            <th className="px-3 py-2">{tr('Trạng thái', 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {bulkPreviewResult.classes.map((cls) => (
                            <tr key={cls.code} className="hover:bg-stone-50">
                              <td className="px-3 py-2 font-mono font-bold text-red-900">
                                {cls.code}
                              </td>
                              <td className="px-3 py-2 font-semibold text-stone-900">
                                {cls.title}
                              </td>
                              <td className="px-3 py-2 text-stone-600">
                                {cls.schedule === 'Đang cập nhật lịch học'
                                  ? tr('Đang cập nhật lịch học', 'Schedule pending')
                                  : translateScheduleText(cls.schedule, lang)}
                              </td>
                              <td className="px-3 py-2">
                                <span className="font-semibold text-stone-800">
                                  {cls.teacherDisplayName === 'Chưa phân công'
                                    ? tr('Chưa phân công', 'Unassigned')
                                    : cls.teacherDisplayName}
                                </span>{' '}
                                {cls.teacherCode && (
                                  <span className="font-mono text-[11px] text-stone-500">
                                    ({cls.teacherCode})
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-2 font-bold text-stone-800">
                                {cls.studentCount} {tr('HV', 'st')}
                              </td>
                              <td className="px-3 py-2">
                                {cls.isArchived ? (
                                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                    {tr('Bảo lưu (Archived)', 'Archived')}
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                                    {tr('Đang hoạt động', 'Active')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {bulkPreviewTab === 'teachers' && (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-stone-100 text-[11px] font-bold uppercase text-stone-600">
                          <tr>
                            <th className="px-3 py-2">{tr('Mã GV', 'Teacher ID')}</th>
                            <th className="px-3 py-2">{tr('Tên giáo viên', 'Teacher name')}</th>
                            <th className="px-3 py-2">{tr('Email đăng nhập', 'Login email')}</th>
                            <th className="px-3 py-2">{tr('Mật khẩu mặc định', 'Default password')}</th>
                            <th className="px-3 py-2">{tr('Lớp phụ trách', 'Assigned classes')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {bulkPreviewResult.teachers.map((t) => (
                            <tr key={t.code} className="hover:bg-stone-50">
                              <td className="px-3 py-2 font-mono font-bold text-red-900">
                                {t.code}
                              </td>
                              <td className="px-3 py-2 font-semibold text-stone-900">
                                {t.name}
                              </td>
                              <td className="px-3 py-2 font-mono text-stone-700">{t.email}</td>
                              <td className="px-3 py-2 font-mono font-bold text-stone-800">
                                {t.defaultPassword}
                              </td>
                              <td className="px-3 py-2 font-mono text-[11px] text-stone-600">
                                {t.assignedClasses.join(', ') || tr('Chưa gán lớp', 'No class assigned')}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {bulkPreviewTab === 'students' && (
                      <table className="w-full text-left text-xs">
                        <thead className="sticky top-0 bg-stone-100 text-[11px] font-bold uppercase text-stone-600">
                          <tr>
                            <th className="px-3 py-2">{tr('Mã HS', 'Student ID')}</th>
                            <th className="px-3 py-2">{tr('Email đăng nhập', 'Login email')}</th>
                            <th className="px-3 py-2">{tr('Họ tên học sinh', 'Student name')}</th>
                            <th className="px-3 py-2">{tr('SĐT', 'Phone')}</th>
                            <th className="px-3 py-2">{tr('Phụ huynh', 'Parent')}</th>
                            <th className="px-3 py-2">{tr('Lớp', 'Class')}</th>
                            <th className="px-3 py-2">{tr('Trạng thái', 'Status')}</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-stone-100">
                          {bulkPreviewResult.students.map((s) => (
                            <tr key={s.code} className="hover:bg-stone-50">
                              <td className="px-3 py-2 font-mono font-bold text-red-900">
                                {s.code}
                              </td>
                              <td className="px-3 py-2 font-mono text-stone-700">{s.email}</td>
                              <td className="px-3 py-2 font-semibold text-stone-900">
                                {s.name}
                              </td>
                              <td className="px-3 py-2 font-mono text-stone-700">
                                {s.phone || '—'}
                              </td>
                              <td className="px-3 py-2 text-stone-600">
                                {s.parentName || '—'}
                              </td>
                              <td className="px-3 py-2 font-mono font-bold text-stone-800">
                                {s.classCode}
                              </td>
                              <td className="px-3 py-2">
                                {s.status === 'archived' ? (
                                  <span className="rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                    {tr('Bảo lưu', 'Archived')}
                                  </span>
                                ) : (
                                  <span className="rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                                    {tr('Đang học', 'Active')}
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {bulkPreviewTab === 'warnings' && (
                      <div className="space-y-1.5 p-3 text-xs">
                        {bulkPreviewResult.warnings.length === 0 ? (
                          <p className="text-stone-500">
                            {tr('Không có cảnh báo dữ liệu.', 'No data warnings.')}
                          </p>
                        ) : (
                          bulkPreviewResult.warnings.map((w, i) => (
                            <div
                              key={i}
                              className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-1.5 text-amber-950"
                            >
                              • {typeof w === 'string' ? w : (w as { message?: string })?.message || JSON.stringify(w)}
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between border-t border-stone-200 bg-stone-50 px-4 py-3">
              <p className="text-[11px] text-stone-600">
                {lang === 'en' ? (
                  <>
                    Students sign in with <strong className="font-mono">2026xxxx</strong> (or{' '}
                    <strong className="font-mono">2026xxxx@khongtunhi.com</strong>) · Teachers with{' '}
                    <strong className="font-mono">GVxxx</strong> · Password:{' '}
                  </>
                ) : (
                  <>
                    Học sinh đăng nhập bằng <strong className="font-mono">2026xxxx</strong> (hoặc{' '}
                    <strong className="font-mono">2026xxxx@khongtunhi.com</strong>) · Giáo viên bằng{' '}
                    <strong className="font-mono">GVxxx</strong> · Mật khẩu:{' '}
                  </>
                )}
                <strong className="font-mono text-red-800">{bulkDefaultPassword}</strong>
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowBulkImportModal(false)}
                  className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-100"
                >
                  {tr('Đóng', 'Close')}
                </button>
                <button
                  type="button"
                  data-testid="bulk-import-confirm-btn"
                  disabled={isExecutingBulk || !bulkCsvText.trim()}
                  onClick={handleConfirmBulkImport}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-xs hover:bg-red-900 disabled:opacity-50"
                >
                  {isExecutingBulk && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  <span>{tr('Xác nhận tạo hàng loạt', 'Confirm Bulk Create')}</span>
                </button>
              </div>
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
              {tr('Tạo tài khoản học viên mới (Đồng bộ izTeach + Supabase)', 'Create new student account (izTeach + Supabase sync)')}
            </h2>
            <button
              type="button"
              aria-label={tr('Đóng cửa sổ tạo học viên', 'Close create student dialog')}
              onClick={() => setShowCreateStudentModal(false)}
              className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Họ tên học viên *', 'Student full name *')}
              </label>
              <input
                type="text"
                required
                data-testid="provision-student-name-input"
                value={newStuName}
                onChange={(e) => setNewStuName(e.target.value)}
                placeholder={tr('VD: Nguyễn Hoàng Ngân', 'e.g., Nguyen Hoang Ngan')}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Email đăng nhập *', 'Login email *')}
              </label>
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
              <label className="block text-xs font-bold text-stone-700">
                {tr('Số điện thoại', 'Phone number')}
              </label>
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
              <label className="block text-xs font-bold text-stone-700">
                {tr('Phụ huynh', 'Parent')}
              </label>
              <input
                type="text"
                data-testid="provision-student-parent-input"
                value={newStuParent}
                onChange={(e) => setNewStuParent(e.target.value)}
                placeholder={tr('Tên phụ huynh (tùy chọn)', 'Parent name (optional)')}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Xếp lớp trực tiếp (tùy chọn):', 'Assign offline class (optional):')}
              </label>
              <select
                data-testid="provision-student-class-select"
                value={newStuClassCode}
                onChange={(e) => setNewStuClassCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
              >
                <option value="">{tr('— Chưa xếp lớp —', '— Unassigned —')}</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.id} · {translateCourseTitle(c.name, lang)}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Cấp khóa học Video (tùy chọn —', 'Grant Video Courses (optional —')}{' '}
                {newStuCourseIds.length > 0
                  ? tr(`${newStuCourseIds.length} khóa đã chọn`, `${newStuCourseIds.length} selected`)
                  : tr('— Chưa chọn khóa học —', '— No course selected —')}
                ):
              </label>
              <div className="mt-1 flex max-h-24 flex-wrap gap-1.5 overflow-y-auto rounded-xl border border-stone-200 bg-stone-50 p-2">
                {coursesList.length === 0 ? (
                  <span className="text-[11px] font-medium text-stone-500">
                    {tr('— Chưa chọn khóa học —', '— No course selected —')}
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
                        {translateCourseTitle(course.shortTitle || course.title, lang)}
                      </button>
                    );
                  })
                )}
              </div>

              {newStuCourseIds.length > 0 && (() => {
                const parsedDur = parseCourseDurationPreset(newStuDurationPreset);
                return (
                  <div
                    data-testid="provision-student-duration-selector"
                    className="mt-2 space-y-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-stone-700">
                        {tr('Thời hạn học:', 'Duration:')}
                      </span>
                      <span className="rounded-md bg-red-50 px-2 py-0.5 text-[11px] font-extrabold text-red-900">
                        {formatCourseDurationPresetLabel(newStuDurationPreset, lang)}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-stone-600">
                          {tr('Số lượng (1–365)', 'Amount (1–365)')}
                        </label>
                        <input
                          type="number"
                          min={1}
                          max={365}
                          step={1}
                          data-testid="provision-student-duration-value-input"
                          disabled={parsedDur.unit === 'unlimited'}
                          value={parsedDur.unit === 'unlimited' ? '' : parsedDur.value}
                          placeholder={parsedDur.unit === 'unlimited' ? '—' : '1'}
                          onChange={(e) => {
                            const nextUnit = parsedDur.unit === 'unlimited' ? 'm' : parsedDur.unit;
                            setNewStuDurationPreset(
                              buildCourseDurationPreset(e.target.value, nextUnit)
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 disabled:bg-stone-100 disabled:text-stone-400"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-stone-600">
                          {tr('Đơn vị (Ngày / Tuần / Tháng)', 'Unit (Day / Week / Month)')}
                        </label>
                        <select
                          data-testid="provision-student-duration-unit-select"
                          value={parsedDur.unit}
                          onChange={(e) => {
                            const nextUnit = e.target.value as CourseDurationUnitOption;
                            setNewStuDurationPreset(
                              buildCourseDurationPreset(parsedDur.value || 1, nextUnit)
                            );
                          }}
                          className="mt-0.5 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800"
                        >
                          {getCourseDurationUnitOptions(lang).map((u) => (
                            <option key={u.id} value={u.id}>
                              {u.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {getCourseDurationPresetOptions(lang).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          data-testid={`provision-student-duration-preset-${opt.id}`}
                          onClick={() => setNewStuDurationPreset(opt.id)}
                          className={`rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                            newStuDurationPreset === opt.id
                              ? 'bg-red-800 text-white'
                              : 'border border-stone-200 bg-white text-stone-700'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreateStudentModal(false)}
              className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700"
            >
              {tr('Hủy', 'Cancel')}
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
              <span>{tr('Tạo & Kích hoạt ngay', 'Create & Activate')}</span>
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
              {tr('Tạo tài khoản Giáo viên & Phân công lớp phụ trách', 'Create Teacher Account & Assign Classes')}
            </h2>
            <button
              type="button"
              aria-label={tr('Đóng cửa sổ tạo giáo viên', 'Close create teacher dialog')}
              onClick={() => setShowCreateTeacherModal(false)}
              className="rounded-lg p-1 text-stone-500 hover:bg-stone-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Họ tên giáo viên *', 'Teacher full name *')}
              </label>
              <input
                type="text"
                required
                data-testid="create-teacher-name-input"
                value={newTeacherName}
                onChange={(e) => setNewTeacherName(e.target.value)}
                placeholder={tr('VD: Cô Nguyễn Phương Anh', 'e.g., Ms. Nguyen Phuong Anh')}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-stone-700">
                {tr('Email đăng nhập *', 'Login email *')}
              </label>
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
              <label className="block text-xs font-bold text-stone-700">
                {tr('Số điện thoại', 'Phone number')}
              </label>
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
              <label className="block text-xs font-bold text-stone-700">
                {tr('Mã GV (tùy chọn)', 'Teacher ID (optional)')}
              </label>
              <input
                type="text"
                data-testid="create-teacher-code-input"
                value={newTeacherCode}
                onChange={(e) => setNewTeacherCode(e.target.value)}
                placeholder={tr('Tự sinh nếu để trống', 'Auto-generated if empty')}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-stone-700">
              {tr('Lớp phụ trách (tùy chọn — ', 'Assigned classes (optional — ')}
              {newTeacherClasses.length > 0
                ? tr(`${newTeacherClasses.length} lớp đã chọn`, `${newTeacherClasses.length} selected`)
                : tr('— Chưa xếp lớp —', '— None assigned —')}
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
              {tr('Hủy', 'Cancel')}
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
              <span>{tr('Lưu giáo viên', 'Save teacher')}</span>
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
            <span>{tr('Chưa tải được dữ liệu quản trị.', 'Failed to load admin data.')}</span>
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
            {tr('Thử lại', 'Retry')}
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
                  {tr('Đối soát & Đồng bộ hệ thống', 'System Audit & Sync')}
                </h2>
                <button
                  type="button"
                  data-testid="admin-goto-students-btn"
                  onClick={() => navigate('/admin/students')}
                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
                >
                  <Users className="h-3.5 w-3.5" />
                  <span>{tr('Mở danh sách Học viên để cấp quyền / xếp lớp', 'Open Students to manage access & classes')}</span>
                </button>
              </div>

              <p className="text-[11px] text-stone-600">
                {tr(
                  'Để cấp khóa học, thu hồi khóa học hoặc chuyển lớp trực tiếp, hãy chọn trực tiếp học viên trong mục ',
                  'To grant courses, revoke courses, or transfer classes directly, select a student under '
                )}
                <strong className="text-stone-900">{tr('Học viên', 'Students')}</strong>
                {tr(
                  '. Khu vực này dành riêng cho đối soát đồng bộ giữa Web · Supabase · izTeach.',
                  '. This area is dedicated to sync auditing across Web · Supabase · izTeach.'
                )}
              </p>

              {/* 3-System Sync Health Summary */}
              {syncStatus && (
                <div
                  data-testid="admin-sync-health-card"
                  className="rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-stone-800">
                      {tr('Đồng bộ 3 hệ thống (Web · Supabase · izTeach)', '3-System Sync (Web · Supabase · izTeach)')}
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
                      {tr('Đối soát ngay', 'Audit now')}
                    </button>
                  </div>
                  <div className="mt-2 grid grid-cols-3 gap-2 text-center">
                    <div className="rounded-lg bg-emerald-50 p-1.5 text-emerald-900">
                      <p className="text-[10px] font-semibold">{tr('Đã đồng bộ', 'Synced')}</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary?.healthyCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-amber-50 p-1.5 text-amber-900">
                      <p className="text-[10px] font-semibold">{tr('Chờ đồng bộ lại', 'Pending resync')}</p>
                      <p className="font-display text-sm font-extrabold">
                        {syncStatus.summary?.needsResyncCount ?? 0}
                      </p>
                    </div>
                    <div className="rounded-lg bg-red-50 p-1.5 text-red-900">
                      <p className="text-[10px] font-semibold">{tr('Cần kiểm tra', 'Needs review')}</p>
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
                                {tr('Mở hồ sơ', 'Open profile')}
                              </button>
                            )}
                            {item.retryAction && (
                              <button
                                type="button"
                                onClick={() => retrySyncMutation.mutate(item.retryAction!)}
                                className="rounded-lg bg-red-800 px-2 py-1 text-[10px] font-bold text-white"
                              >
                                {tr('Đồng bộ lại', 'Resync')}
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
                    <span>{tr('Tin nhắn hỗ trợ', 'Support chat')}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/notifications')}
                    className="flex items-center justify-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 py-2 text-xs font-bold text-stone-800 hover:bg-stone-100"
                  >
                    <Bell className="h-3.5 w-3.5 text-amber-700" />
                    <span>{tr('Thông báo', 'Notifications')}</span>
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
                  {tr('Quản lý đơn hàng', 'Order Management')} ({filteredOrdersList.length}/{ordersList.length})
                </h2>

                {/* Quick Search by Name, Parent, Email, Phone, Order ID */}
                <div className="relative min-w-[230px] flex-1 sm:max-w-sm">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="search"
                    data-testid="admin-order-search-input"
                    value={orderSearchInput}
                    onChange={(e) => setOrderSearchInput(e.target.value)}
                    placeholder={tr(
                      'Tìm mã đơn, tên HV, tên PH, SĐT, email...',
                      'Search order ID, student, parent, phone, email...'
                    )}
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                  />
                </div>
              </div>

              {/* 7 Filter Presets (+ Tất cả) */}
              <div
                data-testid="admin-order-filter-bar"
                className="mt-2.5 flex items-center gap-1.5 overflow-x-auto pb-1"
              >
                {getOrderFilterOptions(lang).map((flt) => (
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
                  {tr('Không có đơn hàng nào khớp bộ lọc hiện tại.', 'No orders match the current filter.')}
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

                      const contactStatusMap = getContactStatusMeta(lang);
                      const paymentStatusMap = getPaymentStatusMeta(lang);
                      const accountStatusMap = getAccountStatusMeta(lang);

                      const contactMeta =
                        contactStatusMap[contactSt] || contactStatusMap.not_called;
                      const payMeta =
                        paymentStatusMap[payDetSt] || paymentStatusMap.unpaid;
                      const accMeta =
                        accountStatusMap[accDetSt] || accountStatusMap.no_account;
                      const parentNameDisplay =
                        ord.parent_name && ord.parent_name.trim()
                          ? ord.parent_name.trim()
                          : tr('Chưa cung cấp', 'Not provided');
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
                              {tr('HV:', 'Student:')} {ord.student_name}
                            </p>
                            <p className="text-[11px] text-stone-600">
                              {tr('PH:', 'Parent:')} <strong className="text-stone-800">{parentNameDisplay}</strong> · {tr('SĐT:', 'Phone:')}{' '}
                              <strong className="font-mono text-red-900">{contactPhone}</strong>
                            </p>
                            <p className="mt-0.5 truncate text-[11px] font-semibold text-stone-700">
                              {translateCourseTitle(ord.course_name, lang)}
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
                              <span>{tr('Xem chi tiết', 'View details')}</span>
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
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">{tr('Mã đơn', 'Order ID')}</th>
                          <th className="pb-2 pr-2 font-bold">{tr('Tên học viên', 'Student')}</th>
                          <th className="pb-2 pr-2 font-bold">{tr('Tên phụ huynh', 'Parent')}</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            {tr('SĐT liên hệ', 'Contact phone')}
                          </th>
                          <th className="pb-2 pr-2 font-bold">{tr('Khóa học', 'Course')}</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">{tr('Số tiền', 'Amount')}</th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            {tr('Trạng thái chăm sóc', 'Care status')}
                          </th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            {tr('Trạng thái thanh toán', 'Payment status')}
                          </th>
                          <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                            {tr('Trạng thái cấp TK', 'Account status')}
                          </th>
                          <th className="whitespace-nowrap pb-2 text-right font-bold">
                            {tr('Thao tác', 'Actions')}
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

                          const contactStatusMap = getContactStatusMeta(lang);
                          const paymentStatusMap = getPaymentStatusMeta(lang);
                          const accountStatusMap = getAccountStatusMeta(lang);

                          const contactMeta =
                            contactStatusMap[contactSt] || contactStatusMap.not_called;
                          const payMeta =
                            paymentStatusMap[payDetSt] || paymentStatusMap.unpaid;
                          const accMeta =
                            accountStatusMap[accDetSt] || accountStatusMap.no_account;
                          const missingParentName = !ord.parent_name || !ord.parent_name.trim();
                          const parentNameDisplay = missingParentName
                            ? tr('Chưa cung cấp', 'Not provided')
                            : ord.parent_name!.trim();
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
                                  {ord.source_label
                                    ? ord.source_label === 'HV đăng nhập'
                                      ? tr('HV đăng nhập', 'Logged-in student')
                                      : ord.source_label
                                    : ord.source === 'authenticated_student'
                                      ? tr('HV đăng nhập', 'Logged-in student')
                                      : 'Website'}
                                </div>
                              </td>
                              <td className="py-2.5 pr-2">
                                <div className="font-bold text-stone-900">
                                  {ord.student_name}
                                </div>
                                <div className="text-[11px] text-stone-500">
                                  {ord.student_email || tr('Chưa có email', 'No email')}
                                </div>
                              </td>
                              <td
                                data-testid={`admin-order-parent-${ord.order_id}`}
                                className={`py-2.5 pr-2 font-semibold ${
                                  missingParentName
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
                                  title={translateCourseTitle(ord.course_name, lang)}
                                >
                                  {translateCourseTitle(ord.course_name, lang)}
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
                                  <span>{tr('Xem chi tiết', 'View details')}</span>
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
                {tr('Danh sách lớp học', 'Classes')} ({classesList.length}) {tr('& Lịch học chính thức', '& Official Schedules')}
              </h2>
              <p className="mt-0.5 text-[11px] text-stone-500">
                {tr(
                  'Hệ thống tự động tạo nhóm chat lớp và nhắc học viên, giáo viên trước giờ học 30 phút dựa trên lịch chính thức đã xác nhận.',
                  'The system automatically creates class group chats and reminds students and teachers 30 minutes before class based on confirmed official schedules.'
                )}
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
              <span>{tr('+ Tạo lớp mới', '+ New class')}</span>
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
                  {tr('Lớp', 'Class')} <strong>{recentlyCreatedClass.id}</strong> ({recentlyCreatedClass.name}){' '}
                  {tr('đã tạo thành công', 'was created')}
                  {recentlyCreatedClass.teacherName &&
                  recentlyCreatedClass.teacherName !== 'Chưa phân công giáo viên' ? (
                    <>
                      {' '}
                      {tr('và phân công cho', 'and assigned to')} <strong>{recentlyCreatedClass.teacherName}</strong>.
                    </>
                  ) : (
                    <> {tr('(chưa phân công giáo viên).', '(no teacher assigned yet).')}</>
                  )}{' '}
                  {tr('Nhóm chat', 'Group chat')}{' '}
                  <code className="rounded bg-white px-1.5 py-0.5 font-mono font-bold text-emerald-900">
                    {recentlyCreatedClass.roomId}
                  </code>{' '}
                  {tr('đã sẵn sàng!', 'is ready!')}
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
                  <span>{tr('Mở nhóm chat', 'Open group chat')}</span>
                </button>
                <button
                  type="button"
                  aria-label={tr('Đóng thông báo lớp vừa tạo', 'Dismiss created class notice')}
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
                ? `${tr('Lớp', 'Class')} ${cls.id} — ${translateScheduleText(cls.officialScheduleText!, lang)}`
                : tr('Chưa có lịch học chính thức', 'No official schedule yet');
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
                        {isConfirmed
                          ? tr('Đã có lịch chính thức', 'Official schedule set')
                          : tr('Chưa có lịch học chính thức', 'No official schedule yet')}
                      </span>
                      <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700">
                        {tr('Buổi', 'Session')} {cls.current_lesson}/{cls.total_lessons}
                      </span>
                      <span
                        data-testid={`class-student-count-${cls.id}`}
                        className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                          activeStudentCount > 0
                            ? 'bg-sky-100 text-sky-900'
                            : 'bg-stone-100 text-stone-600'
                        }`}
                      >
                        {activeStudentCount}{' '}
                        {tr('học viên', activeStudentCount === 1 ? 'student' : 'students')}
                      </span>
                    </div>

                    <p className="text-[11px] font-medium text-stone-600">
                      {tr('GV phụ trách:', 'Assigned teacher:')}{' '}
                      <strong className="text-stone-800">
                        {cls.teacher_name === 'Chưa phân công giáo viên'
                          ? tr('Chưa phân công giáo viên', 'No teacher assigned')
                          : cls.teacher_name}
                      </strong>
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
                          {tr('Lịch văn bản cũ:', 'Legacy schedule text:')} &ldquo;
                          {translateScheduleText(cls.legacyScheduleText, lang)}&rdquo; (
                          {tr('Cần xác nhận', 'Needs confirmation')})
                        </span>
                      )}

                      {isConfirmed && cls.nextSession && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                          <Clock className="h-3 w-3" />
                          {tr('Buổi tới:', 'Next session:')}{' '}
                          {translateDayLabel(cls.nextSession.dayLabel, lang)},{' '}
                          {cls.nextSession.sessionDate} ({cls.nextSession.startTime}–
                          {cls.nextSession.endTime})
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
                      <span data-testid={`admin-open-chat-btn-${cls.id}`}>
                        {tr('Mở nhóm chat', 'Open group chat')}
                      </span>
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
                      <span>
                        {isConfirmed ? tr('Chỉnh lịch', 'Edit schedule') : tr('Cài lịch học', 'Set schedule')}
                      </span>
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
                      <span data-testid={`class-delete-btn-${cls.id}`}>{tr('Xóa lớp', 'Delete class')}</span>
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
                    ? tr(
                        `Chưa thể xóa lớp ${classToDelete.id}`,
                        `Cannot delete class ${classToDelete.id}`
                      )
                    : tr(
                        `Xác nhận xóa / lưu trữ lớp ${classToDelete.id}`,
                        `Confirm delete / archive class ${classToDelete.id}`
                      )}
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  {classToDelete.id} · {classToDelete.name}
                </p>
              </div>
              <button
                type="button"
                aria-label={tr('Đóng hộp thoại xóa lớp', 'Close delete class dialog')}
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
                    {tr(
                      `Lớp ${classToDelete.id} hiện còn ${deleteClassBlockedStudentCount} học viên đang theo học nên chưa thể xóa.`,
                      `Class ${classToDelete.id} still has ${deleteClassBlockedStudentCount} active student(s) and cannot be deleted yet.`
                    )}
                  </p>
                  <p className="mt-1.5 leading-relaxed text-amber-900">
                    <strong>{tr('Cách xử lý an toàn:', 'Safe resolution:')}</strong>{' '}
                    {tr(
                      'Vui lòng mở danh sách học viên của lớp',
                      'Please open the student list for class'
                    )}{' '}
                    <strong>{classToDelete.id}</strong>
                    {tr(
                      ', chuyển từng học viên sang lớp mới (hoặc chọn “Bỏ xếp lớp trực tiếp”) trước khi thực hiện xóa / lưu trữ lớp.',
                      ', transfer each student to another class (or choose "Unassign class directly") before deleting or archiving this class.'
                    )}
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
                    {tr('Đóng', 'Close')}
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
                    <span>
                      {tr('Xem & Chuyển lớp học viên', 'View & Transfer students')} ({classToDelete.id})
                    </span>
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
                    {tr('Lớp', 'Class')} <strong>{classToDelete.id}</strong>{' '}
                    {tr(
                      'hiện trống (0 học viên) và đủ điều kiện lưu trữ an toàn:',
                      'is currently empty (0 students) and eligible for safe archiving:'
                    )}
                  </p>
                  <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[11px] text-stone-600">
                    <li>
                      {tr('Nhóm chat', 'Group chat')} <code>class:{classToDelete.id}</code>{' '}
                      {tr('sẽ ẩn khỏi danh sách hoạt động.', 'will be hidden from active chats.')}
                    </li>
                    <li>
                      {tr(
                        'Lớp được gỡ khỏi phân công hiện hành và các danh sách chọn lớp.',
                        'The class is removed from active assignments and class selectors.'
                      )}
                    </li>
                    <li>
                      {tr(
                        'Toàn bộ lịch sử tin nhắn, bài tập và điểm danh cũ được bảo toàn.',
                        'All past chat history, homework, and attendance records are preserved.'
                      )}
                    </li>
                  </ul>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">
                    {tr('Nhập chính xác mã lớp', 'Type exact class code')}{' '}
                    <code className="rounded bg-red-50 px-1.5 py-0.5 font-mono font-bold text-red-900">
                      {classToDelete.id}
                    </code>{' '}
                    {tr('để xác nhận xóa:', 'to confirm deletion:')}
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
                    {tr('Hủy', 'Cancel')}
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
                      {deleteClassMutation.isPending
                        ? tr('Đang xóa lớp...', 'Deleting class...')
                        : tr('Xác nhận xóa lớp', 'Confirm delete class')}
                    </span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* Single-Step Teacher Delete Confirmation Modal (Milestone M3) */}
      {teacherToDelete && (
        <div
          data-testid="admin-delete-teacher-modal"
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-5 shadow-2xl">
            <div className="flex items-start justify-between gap-2 border-b border-stone-200 pb-3">
              <div>
                <h3 className="flex items-center gap-1.5 font-display text-sm font-bold text-stone-900">
                  <Trash2 className="h-4 w-4 text-red-800" />
                  <span>
                    {tr(
                      `Xóa giáo viên ${teacherToDelete.name}?`,
                      `Delete teacher ${teacherToDelete.name}?`
                    )}
                  </span>
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  {teacherToDelete.email}
                  {teacherToDelete.code ? ` · ${teacherToDelete.code}` : ''}
                </p>
              </div>
              <button
                type="button"
                aria-label={tr('Đóng hộp thoại xóa giáo viên', 'Close delete teacher dialog')}
                disabled={deleteTeacherMutation.isPending}
                onClick={() => setTeacherToDelete(null)}
                className="rounded-lg p-1 text-stone-500 hover:bg-stone-100 disabled:opacity-50"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {(teacherToDelete.assigned_classes?.length ?? 0) > 0 && (
              <div
                data-testid="delete-teacher-classes-warning"
                className="mt-4 rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-bold text-amber-900">
                      {tr(
                        `Sẽ gỡ phân công khỏi ${teacherToDelete.assigned_classes!.length} lớp (${teacherToDelete.assigned_classes!.join(', ')}).`,
                        `Will unassign from ${teacherToDelete.assigned_classes!.length} class(es) (${teacherToDelete.assigned_classes!.join(', ')}).`
                      )}
                    </p>
                    <p className="mt-0.5 text-amber-800">
                      {tr(
                        'Các lớp này sẽ được chuyển về trạng thái "Chưa phân công giáo viên".',
                        'These classes will revert to "No teacher assigned".'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3 text-xs text-stone-600">
              <p>
                {tr(
                  'Hồ sơ giáo viên sẽ được lưu trữ (soft-delete) và vô hiệu hóa tài khoản ngay lập tức. Toàn bộ lịch sử tin nhắn, bài tập, chấm điểm và điểm danh của lớp được bảo toàn.',
                  'The teacher profile will be archived (soft-deleted) and the account deactivated immediately. All class chat history, homework, grading, and attendance records remain preserved.'
                )}
              </p>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2 border-t border-stone-100 pt-3">
              <button
                type="button"
                data-testid="cancel-delete-teacher-btn"
                disabled={deleteTeacherMutation.isPending}
                onClick={() => setTeacherToDelete(null)}
                className="rounded-xl border border-stone-300 bg-white px-3.5 py-2 text-xs font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {tr('Hủy', 'Cancel')}
              </button>
              <button
                type="button"
                data-testid="confirm-delete-teacher-btn"
                disabled={deleteTeacherMutation.isPending}
                onClick={() => deleteTeacherMutation.mutate(teacherToDelete)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
              >
                {deleteTeacherMutation.isPending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Trash2 className="h-3.5 w-3.5" />
                )}
                <span>
                  {deleteTeacherMutation.isPending
                    ? tr('Đang xóa giáo viên...', 'Deleting teacher...')
                    : tr('Xác nhận xóa', 'Confirm delete')}
                </span>
              </button>
            </div>
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
                  message: tr(
                    `Mã lớp ${cleanCode} đã tồn tại trên hệ thống. Vui lòng chọn mã lớp khác hoặc chỉnh sửa lớp hiện có.`,
                    `Class code ${cleanCode} already exists. Please choose another code or edit the existing class.`
                  ),
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
              label: tr(
                `Nhóm Lớp ${cleanCode} — ${savedClassItem.name}`,
                `Class Group ${cleanCode} — ${savedClassItem.name}`
              ),
              shortLabel: tr(`Lớp ${cleanCode}`, `Class ${cleanCode}`),
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
            queryClient.setQueriesData<KtnTeacherSearchResult>(
              { queryKey: ['ktn-admin-teachers-search'], predicate: (q) => q.queryKey.length < 3 || q.queryKey[2] === isDemoMode },
              (prev) =>
                prev && Array.isArray(prev.items)
                  ? { ...prev, items: prev.items.map(mapTeacherClassAssignment) }
                  : prev
            );

            // 4. Invalidate related queries for background consistency
            await Promise.all([
              queryClient.invalidateQueries({ queryKey: ['ktn-classes'] }),
              queryClient.invalidateQueries({ queryKey: ['chat-rooms'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers'] }),
              queryClient.invalidateQueries({ queryKey: ['ktn-admin-teachers-search'] }),
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
                  ? tr(
                      `Đã tạo lớp ${cleanCode} & nhóm chat ${canonicalRoomId}`,
                      `Created class ${cleanCode} & chat ${canonicalRoomId}`
                    )
                  : tr(
                      `Đã cập nhật lịch học lớp ${cleanCode}`,
                      `Updated schedule for class ${cleanCode}`
                    )),
              description: isCreateClass
                ? hasAssignedTeacherInput
                  ? tr(
                      `Đã phân công ${savedClassItem.teacher_name} và kích hoạt nhóm trao đổi lớp.`,
                      `Assigned ${savedClassItem.teacher_name} and activated the class group chat.`
                    )
                  : tr(
                      'Đã kích hoạt nhóm trao đổi lớp (chưa phân công giáo viên).',
                      'Activated the class group chat (no teacher assigned yet).'
                    )
                : schedulePayload.status === 'confirmed'
                ? tr(
                    'Lịch học chính thức đã được lưu và đồng bộ bộ nhắc tự động.',
                    'Official schedule saved and automated reminders synced.'
                  )
                : tr('Thông tin lớp học đã được lưu.', 'Class details saved.'),
              variant: 'success',
            });
            setScheduleModalOpen(false);
          } catch (err) {
            const errMsg =
              err instanceof Error
                ? err.message
                : tr('Không thể lưu thông tin lớp học.', 'Unable to save class details.');
            addToast({
              title: isCreateClass
                ? tr('Không thể tạo lớp mới', 'Unable to create class')
                : tr('Không thể cập nhật lớp học', 'Unable to update class'),
              description: errMsg,
              variant: 'error',
            });
            throw err;
          } finally {
            setIsSavingSchedule(false);
          }
        }}
      />

      {/* Teacher Roster, Performance Metrics & Course Grant Requests Approval Inbox (Agent F + Agent E + C1) */}
      {showTeachers && (
        <div className="space-y-4">
          <div
            data-testid="admin-teachers-section"
            className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
                <Award className="h-4 w-4 text-red-800" />
                {tr('Quản lý giáo viên & Hiệu suất', 'Teachers & Performance')} ({totalTeachersCount})
                {(teachersQuery.isFetching || teacherSearchQuery.isFetching) && (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-stone-400" />
                )}
              </h2>
              <div className="flex flex-wrap items-center gap-2">
                <div className="relative min-w-[210px]">
                  <Search className="pointer-events-none absolute left-2.5 top-2 h-3.5 w-3.5 text-stone-400" />
                  <input
                    type="search"
                    data-testid="admin-teacher-search-input"
                    value={teacherSearchInput}
                    onChange={(e) => setTeacherSearchInput(e.target.value)}
                    placeholder={tr(
                      'Tìm tên (có/không dấu), email, mã GV, lớp...',
                      'Search name, email, teacher ID, class...'
                    )}
                    className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                  />
                </div>
                <select
                  data-testid="admin-teacher-status-filter"
                  value={teacherFilter}
                  onChange={(e) => {
                    setTeacherFilter(
                      e.target.value as 'ALL' | 'ACTIVE' | 'INACTIVE' | 'UNASSIGNED'
                    );
                    setTeacherPage(1);
                  }}
                  aria-label={tr('Lọc trạng thái giáo viên', 'Filter teachers by status')}
                  className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-800 focus:border-red-800 focus:bg-white focus:outline-none"
                >
                  <option value="ALL">{tr('Tất cả trạng thái', 'All statuses')}</option>
                  <option value="ACTIVE">{tr('Đang hoạt động', 'Active')}</option>
                  <option value="INACTIVE">{tr('Tạm khóa', 'Suspended')}</option>
                  <option value="UNASSIGNED">{tr('Chưa có lớp', 'Unassigned')}</option>
                </select>
                <select
                  data-testid="admin-teacher-class-filter"
                  value={teacherClassFilter}
                  onChange={(e) => {
                    setTeacherClassFilter(e.target.value);
                    setTeacherPage(1);
                  }}
                  aria-label={tr('Lọc giáo viên theo lớp', 'Filter teachers by class')}
                  className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-semibold text-stone-800 focus:border-red-800 focus:bg-white focus:outline-none"
                >
                  <option value="ALL">{tr('Tất cả lớp', 'All classes')}</option>
                  {classesList.map((cls) => (
                    <option key={cls.id} value={cls.id}>
                      {tr('Lớp', 'Class')} {cls.id}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Filter quick pills */}
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: tr('Tất cả', 'All') },
                  { id: 'ACTIVE', label: tr('Đang hoạt động', 'Active') },
                  { id: 'INACTIVE', label: tr('Tạm khóa', 'Suspended') },
                  { id: 'UNASSIGNED', label: tr('Chưa có lớp', 'Unassigned') },
                ] as const
              ).map((pill) => (
                <button
                  key={pill.id}
                  type="button"
                  data-testid={`teacher-filter-${pill.id}`}
                  onClick={() => {
                    setTeacherFilter(pill.id);
                    setTeacherPage(1);
                  }}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                    teacherFilter === pill.id
                      ? 'bg-red-800 text-white'
                      : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                  }`}
                >
                  {pill.label}
                </button>
              ))}
            </div>

            {filteredTeachersList.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center text-xs text-stone-600">
                {tr('Chưa có giáo viên phù hợp.', 'No matching teachers found.')}
              </div>
            ) : (
              <>
                {/* Mobile Compact Card List (<768px) */}
                <div
                  data-testid="admin-teacher-mobile-list"
                  className="mt-3 space-y-2.5 md:hidden"
                >
                  {filteredTeachersList.map((teacher) => {
                    const classes = Array.isArray(teacher.assigned_classes)
                      ? teacher.assigned_classes
                      : [];
                    const isLocked =
                      teacher.active === false ||
                      teacher.status === 'locked' ||
                      teacher.status === 'suspended' ||
                      teacher.status === 'inactive';

                    return (
                      <div
                        key={`mobile-${teacher.email}`}
                        data-testid={`admin-teacher-mobile-card-${teacher.email}`}
                        onClick={() => setSelectedTeacherKey(teacher.email)}
                        className="cursor-pointer space-y-2 rounded-xl border border-stone-200 bg-stone-50/70 p-3 text-xs transition-colors hover:border-red-200 hover:bg-red-50/30"
                      >
                        {/* Header Row: Tên + Trạng thái */}
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-1.5">
                            <span className="truncate font-bold text-stone-900">
                              {teacher.name}
                            </span>
                            {teacher.code && (
                              <span className="shrink-0 rounded bg-stone-200/80 px-1 py-0.5 text-[9px] font-semibold text-stone-600">
                                {teacher.code}
                              </span>
                            )}
                          </div>
                          <span
                            className={`shrink-0 inline-block rounded px-1.5 py-0.5 text-[10px] font-bold ${
                              isLocked
                                ? 'bg-red-100 text-red-900'
                                : 'bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {isLocked ? tr('Tạm khóa', 'Suspended') : tr('Đang hoạt động', 'Active')}
                          </span>
                        </div>

                        {/* Content Row: Email & Lớp đang phụ trách */}
                        <div className="space-y-1">
                          <div className="truncate text-[11px] text-stone-500">
                            {teacher.email}
                          </div>
                          <div className="text-[11px] text-stone-700">
                            <span className="font-semibold text-stone-600">
                              {tr('Lớp:', 'Classes:')}
                            </span>{' '}
                            {classes.length > 0 ? (
                              <span className="font-medium text-stone-800">
                                {classes.join(', ')}
                              </span>
                            ) : (
                              <span className="italic text-stone-400">
                                {tr('Chưa phân công', 'Unassigned')}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons: Xem / Sửa & Xóa (< 768px / 390px mobile viewport) */}
                        <div className="flex items-center gap-2 border-t border-stone-200/60 pt-2">
                          <button
                            type="button"
                            data-testid={`admin-open-teacher-btn-mobile-${teacher.email}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTeacherKey(teacher.email);
                            }}
                            className="inline-flex min-h-[32px] flex-1 items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-800 shadow-2xs transition-colors hover:bg-stone-50 active:bg-stone-100"
                          >
                            <span>{tr('Xem / Sửa', 'View / Edit')}</span>
                          </button>
                          <button
                            type="button"
                            data-testid={`admin-delete-teacher-btn-mobile-${teacher.email}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setTeacherToDelete(teacher);
                            }}
                            className="inline-flex min-h-[32px] items-center justify-center gap-1 rounded-lg border border-red-200 bg-red-50/70 px-2.5 py-1 text-xs font-bold text-red-700 transition-colors hover:bg-red-100 active:bg-red-200"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>{tr('Xóa', 'Delete')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Desktop Concise Table (5 columns: Tên, Email, Lớp đang phụ trách, Trạng thái, Thao tác) */}
                <div className="mt-3 hidden overflow-x-auto md:block">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-stone-200 text-stone-500">
                        <th className="pb-2 pr-2 font-bold">{tr('Tên', 'Name')}</th>
                        <th className="pb-2 pr-2 font-bold">Email</th>
                        <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                          {tr('Lớp đang phụ trách', 'Assigned classes')}
                        </th>
                        <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                          {tr('Trạng thái', 'Status')}
                        </th>
                        <th className="whitespace-nowrap pb-2 text-right font-bold">
                          {tr('Thao tác', 'Actions')}
                        </th>
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
                            return sched ? `${clsCode}: ${translateScheduleText(sched, lang)}` : '';
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
                            {/* Col 1: Tên (+ sr-only accessibility & test selectors) */}
                            <td className="py-2.5 pr-2">
                              <div className="font-bold text-stone-900">{teacher.name}</div>
                              {teacher.code && (
                                <div className="text-[10px] font-semibold text-stone-500">
                                  {teacher.code}
                                </div>
                              )}
                              {/* Deep stats live in TeacherDetailDrawer; sr-only preserves accessibility & test selectors */}
                              <div className="sr-only">
                                <span data-testid={`teacher-students-count-${teacher.email}`}>
                                  {tr('Học viên phụ trách:', 'Managed students:')}{' '}
                                  {managedStudentsCount} {tr('HV', 'students')}
                                </span>
                                <span data-testid={`teacher-courses-summary-${teacher.email}`}>
                                  {tr('Khóa phụ trách:', 'Assigned courses:')} {courses.length}{' '}
                                  {tr('khóa', courses.length === 1 ? 'course' : 'courses')}
                                </span>
                                {scheduleSummaries.length > 0 && (
                                  <span data-testid={`teacher-schedule-summary-${teacher.email}`}>
                                    {tr('Lịch dạy:', 'Schedule:')} {scheduleSummaries.join(' · ')}
                                  </span>
                                )}
                                <span data-testid={`teacher-scheduled-sessions-${teacher.email}`}>
                                  {tr('Lịch:', 'Scheduled:')} {scheduledSessionsCount}
                                </span>
                                <span data-testid={`teacher-confirmed-sessions-${teacher.email}`}>
                                  {tr('Thực dạy:', 'Confirmed taught:')}{' '}
                                  {confirmedTaughtSessionsCount}
                                </span>
                                <span>
                                  {tr('Ghi nhận log:', 'Logged:')} {recordedSessionsCount}{' '}
                                  {tr(
                                    'buổi (Lịch ≠ Thực dạy)',
                                    'sessions (Scheduled ≠ Taught)'
                                  )}
                                </span>
                                {unverifiedTeachingLog && (
                                  <span data-testid={`teacher-unverified-badge-${teacher.email}`}>
                                    {tr('Chưa xác minh số buổi thực dạy', 'Unverified taught sessions')}
                                  </span>
                                )}
                                <span data-testid={`teacher-graded-count-${teacher.email}`}>
                                  {tr('Đã chấm:', 'Graded:')} {submissionsReviewedCount}
                                </span>
                                <span data-testid={`teacher-pending-grading-count-${teacher.email}`}>
                                  {tr('Chờ chấm:', 'Pending grading:')} {pendingGradingCount}
                                </span>
                                <span>
                                  {forumAnswersCount} {tr('trả lời', 'replies')}
                                </span>
                                <span data-testid={`teacher-resolved-forum-count-${teacher.email}`}>
                                  {acceptedAnswersCount} {tr('giải quyết', 'accepted')}
                                </span>
                                <span data-testid={`teacher-video-guides-count-${teacher.email}`}>
                                  {tr('Video giải đáp:', 'Video replies:')} {videoAnswersCount}
                                </span>
                                <span data-testid={`teacher-monthly-points-${teacher.email}`}>
                                  {tr('Tháng:', 'Monthly:')} {monthlyContributionPoints}{' '}
                                  {tr('điểm', 'pts')}
                                </span>
                                <span data-testid={`teacher-total-points-${teacher.email}`}>
                                  {tr('Tích lũy:', 'Total:')} {totalContributionPoints}{' '}
                                  {tr('điểm', 'pts')}
                                </span>
                              </div>
                            </td>

                            {/* Col 2: Email */}
                            <td className="py-2.5 pr-2">
                              <div className="text-[11px] font-medium text-stone-700">
                                {teacher.email}
                              </div>
                            </td>

                            {/* Col 3: Lớp đang phụ trách */}
                            <td className="py-2.5 pr-2">
                              <div className="font-bold text-stone-900">
                                {classes.length}{' '}
                                {tr('lớp', classes.length === 1 ? 'class' : 'classes')}
                              </div>
                              {classes.length > 0 ? (
                                <div className="mt-0.5 flex flex-wrap gap-1">
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
                                <span className="text-[10px] text-stone-400">
                                  {tr('Chưa phân công lớp', 'No classes assigned')}
                                </span>
                              )}
                            </td>

                            {/* Col 4: Trạng thái */}
                            <td className="whitespace-nowrap py-2.5 pr-2">
                              <span
                                className={`inline-block rounded px-2 py-0.5 text-[10px] font-bold ${
                                  isLocked
                                    ? 'bg-red-100 text-red-900'
                                    : 'bg-emerald-100 text-emerald-900'
                                }`}
                              >
                                {isLocked
                                  ? tr('Tạm khóa', 'Suspended')
                                  : tr('Đang hoạt động', 'Active')}
                              </span>
                            </td>

                            {/* Col 5: Thao tác (Xem / Sửa & Xóa) */}
                            <td className="whitespace-nowrap py-2.5 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <button
                                  type="button"
                                  data-testid={`admin-open-teacher-btn-${teacher.email}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setSelectedTeacherKey(teacher.email);
                                  }}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 shadow-2xs hover:bg-stone-50 hover:text-stone-900"
                                >
                                  <span>{tr('Xem / Sửa', 'View / Edit')}</span>
                                </button>
                                <button
                                  type="button"
                                  data-testid={`admin-delete-teacher-btn-${teacher.email}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setTeacherToDelete(teacher);
                                  }}
                                  className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-bold text-red-700 shadow-2xs hover:bg-red-100 hover:text-red-800"
                                  title={tr('Xóa giáo viên', 'Delete teacher')}
                                >
                                  <Trash2 className="h-3.5 w-3.5 text-red-600" />
                                  <span>{tr('Xóa', 'Delete')}</span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Teacher Search Pagination Controls */}
                <div
                  data-testid="teacher-search-pagination"
                  className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-xs"
                >
                  <span
                    data-testid="teacher-search-pagination-summary"
                    className="text-stone-500"
                  >
                    {tr('Trang', 'Page')} {teacherPage} / {totalTeacherPages} ·{' '}
                    {tr('Hiển thị', 'Showing')}{' '}
                    {Math.min(totalTeachersCount, teacherSearchOffset + 1)}–
                    {Math.min(
                      totalTeachersCount,
                      teacherSearchOffset + filteredTeachersList.length
                    )}{' '}
                    / {totalTeachersCount}{' '}
                    {tr('giáo viên', totalTeachersCount === 1 ? 'teacher' : 'teachers')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="teacher-search-prev-page"
                      disabled={teacherPage <= 1}
                      onClick={() => setTeacherPage((p) => Math.max(1, p - 1))}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                    >
                      {tr('Trang trước', 'Previous')}
                    </button>
                    <button
                      type="button"
                      data-testid="teacher-search-next-page"
                      disabled={!hasMoreTeachers && teacherPage >= totalTeacherPages}
                      onClick={() => setTeacherPage((p) => p + 1)}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 hover:bg-stone-50 disabled:opacity-40"
                    >
                      {tr('Trang sau', 'Next')}
                    </button>
                  </div>
                </div>
              </>
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
                {tr(
                  'Yêu cầu cấp khóa học online từ Giáo viên',
                  'Teacher Online Course Requests'
                )}{' '}
                ({courseGrantRequestsList.length})
              </h3>
            </div>

            {courseGrantRequestsList.length === 0 ? (
              <p className="mt-2 text-xs text-stone-500">
                {tr(
                  'Chưa có yêu cầu cấp khóa học online nào từ giáo viên.',
                  'No online course grant requests from teachers yet.'
                )}
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
                          {tr('HV:', 'Student:')} {req.student_name || req.student_email}
                        </span>
                        <span className="text-stone-500">({req.student_email})</span>
                        {req.class_code && (
                          <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                            {tr('Lớp', 'Class')} {req.class_code}
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
                            ? tr('Đã duyệt', 'Approved')
                            : req.status === 'rejected'
                            ? tr('Đã từ chối', 'Rejected')
                            : tr('Chờ duyệt', 'Pending')}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-stone-700">
                        {tr('Khóa đề nghị:', 'Requested courses:')}{' '}
                        {(req.requested_course_titles && req.requested_course_titles.length > 0
                          ? req.requested_course_titles
                          : req.requested_course_ids && req.requested_course_ids.length > 0
                          ? req.requested_course_ids
                          : [req.course_title || req.course_id]
                        )
                          .map((title) => translateCourseTitle(title, lang))
                          .join(', ')}
                      </p>
                      <p className="text-[11px] text-stone-500">
                        {tr('Giáo viên đề nghị:', 'Requested by:')}{' '}
                        {req.teacher_name || req.teacher_email} · {tr('Lý do:', 'Reason:')}{' '}
                        {req.reason || tr('Không ghi chú', 'No note')}
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
                          {tr('Duyệt & Mở khóa', 'Approve & Unlock')}
                        </button>
                        <button
                          type="button"
                          data-testid={`admin-reject-course-request-${req.id}`}
                          disabled={reviewCourseRequestMutation.isPending}
                          onClick={() =>
                            reviewCourseRequestMutation.mutate({
                              requestId: req.id,
                              decision: 'reject',
                              reviewNote: tr('Quản lý từ chối yêu cầu', 'Rejected by admin'),
                            })
                          }
                          className="rounded-lg border border-red-300 bg-white px-2.5 py-1.5 text-[11px] font-bold text-red-800 hover:bg-red-50 disabled:opacity-50"
                        >
                          {tr('Từ chối', 'Reject')}
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
              {tr('Danh sách học viên', 'Students')} ({totalStudentsCount})
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
                  placeholder={tr(
                    'Tìm tên (có/không dấu), email, SĐT, mã HV...',
                    'Search name, email, phone, student ID...'
                  )}
                  className="w-full rounded-xl border border-stone-300 bg-stone-50 py-1.5 pl-8 pr-3 text-xs font-semibold text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
                />
              </div>

              <select
                aria-label={tr('Lọc theo lớp', 'Filter by class')}
                data-testid="admin-filter-class"
                value={classFilter}
                onChange={(e) => {
                  setClassFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">{tr('Tất cả lớp', 'All classes')}</option>
                <option value="NONE">{tr('— Chưa xếp lớp —', '— Unassigned —')}</option>
                {classesList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {tr('Lớp', 'Class')} {c.id}
                  </option>
                ))}
              </select>

              <select
                aria-label={tr('Lọc theo khóa học', 'Filter by course')}
                data-testid="admin-filter-course"
                value={courseFilter}
                onChange={(e) => {
                  setCourseFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">{tr('Tất cả khóa học', 'All courses')}</option>
                {disambiguateCatalogCourses(coursesList).map((course) => (
                  <option key={course.id} value={course.id}>
                    {translateCourseTitle(course.displayLabel, lang)}
                  </option>
                ))}
              </select>

              <select
                aria-label={tr('Lọc theo trạng thái đồng bộ', 'Filter by sync status')}
                data-testid="admin-filter-sync-status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">{tr('Mọi đồng bộ', 'All sync statuses')}</option>
                <option value="synced">{tr('Đã đồng bộ', 'Synced')}</option>
                <option value="pending_activation">{tr('Chờ kích hoạt', 'Pending activation')}</option>
                <option value="needs_resync">{tr('Cần đồng bộ lại', 'Needs resync')}</option>
              </select>

              <select
                aria-label={tr('Lọc theo vòng đời tài khoản', 'Filter by account status')}
                data-testid="admin-filter-account-status"
                value={accountStatusFilter}
                onChange={(e) => {
                  setAccountStatusFilter(e.target.value);
                  setPageOffset(0);
                }}
                className="rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-700"
              >
                <option value="ALL">{tr('Mọi tài khoản', 'All accounts')}</option>
                <option value="ready_to_login">{tr('Sẵn sàng đăng nhập', 'Ready to log in')}</option>
                <option value="active">{tr('Đang hoạt động (Active)', 'Active')}</option>
                <option value="pending_activation">{tr('Chờ kích hoạt', 'Pending activation')}</option>
                <option value="suspended">{tr('Tạm khóa', 'Suspended')}</option>
                <option value="archived">{tr('Đã lưu trữ', 'Archived')}</option>
                <option value="deleted">{tr('Đã xóa (Supabase)', 'Deleted (Supabase)')}</option>
              </select>

              <button
                type="button"
                data-testid="admin-roster-create-student-btn"
                onClick={() => setShowCreateStudentModal(true)}
                className="inline-flex min-h-[32px] items-center gap-1 rounded-xl bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-900"
              >
                <UserPlus className="h-3.5 w-3.5" />
                <span>{tr('+ Tạo học viên', '+ New student')}</span>
              </button>
            </div>
          </div>

          {studentsList.length === 0 ? (
            <div
              data-testid="admin-students-empty-state"
              className="mt-4 rounded-xl border border-dashed border-stone-200 bg-stone-50 p-6 text-center"
            >
              <p className="text-xs font-bold text-stone-800">
                {tr(
                  'Không tìm thấy học viên phù hợp với từ khóa',
                  'No students found matching'
                )}{' '}
                &ldquo;{searchInput}&rdquo;.
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
                {tr('Tạo học viên mới', 'Create new student')}
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
                                ? tr('Đã xóa (Supabase)', 'Deleted (Supabase)')
                                : isSuspended
                                ? tr('Tạm khóa', 'Suspended')
                                : tr('Đã lưu trữ', 'Archived')}
                            </span>
                          )}
                          {stu.class_code ? (
                            <span className="inline-block whitespace-nowrap rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                              {stu.class_code}
                            </span>
                          ) : (
                            <span className="inline-block whitespace-nowrap rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-medium text-stone-500">
                              {tr('Chưa xếp lớp', 'Unassigned')}
                            </span>
                          )}
                          {hasLegacyInvalidClass && (
                            <span className="inline-flex items-center gap-0.5 whitespace-nowrap rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              {tr('Cần kiểm tra mã lớp', 'Check class code')}
                            </span>
                          )}
                          {visibleCourses.map((c) => (
                            <span
                              key={c.id}
                              className="max-w-[150px] truncate rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900"
                            >
                              {translateCourseTitle(c.shortTitle || c.title, lang)}
                            </span>
                          ))}
                          {extraCoursesCount > 0 && (
                            <span
                              data-testid={`student-mobile-extra-courses-badge-${stu.email}`}
                              className="whitespace-nowrap rounded bg-stone-200 px-1.5 py-0.5 text-[10px] font-bold text-stone-700"
                            >
                              +{extraCoursesCount} {tr('khóa', 'more')}
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
                        <span>{tr('Xem / Sửa', 'View / Edit')}</span>
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
                      <th className="pb-2 pr-2 font-bold">{tr('Học viên', 'Student')}</th>
                      <th className="pb-2 pr-2 font-bold">{tr('Email / SĐT', 'Email / Phone')}</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                        {tr('Lớp trực tiếp', 'Live class')}
                      </th>
                      <th className="pb-2 pr-2 font-bold">{tr('Khóa học đã mở', 'Unlocked courses')}</th>
                      <th className="whitespace-nowrap pb-2 pr-2 font-bold">
                        {tr('Trạng thái & Đồng bộ', 'Status & Sync')}
                      </th>
                      <th className="whitespace-nowrap pb-2 text-right font-bold">
                        {tr('Thao tác', 'Actions')}
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
                          aria-label={tr(
                            `Mở hồ sơ học viên ${stu.name}`,
                            `Open profile for ${stu.name}`
                          )}
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
                                    {tr('Cần kiểm tra mã lớp', 'Check class code')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="whitespace-nowrap text-stone-400">
                                {tr('Chưa xếp lớp', 'Unassigned')}
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
                                    title={translateCourseTitle(c.title, lang)}
                                  >
                                    {translateCourseTitle(c.shortTitle || c.title, lang)}
                                  </span>
                                ))}
                                {extraCoursesCount > 0 && (
                                  <span
                                    data-testid={`student-extra-courses-badge-${stu.email}`}
                                    className="whitespace-nowrap rounded bg-stone-200 px-1.5 py-0.5 text-[11px] font-bold text-stone-700"
                                    title={resolvedCourses
                                      .slice(2)
                                      .map((c) => translateCourseTitle(c.title, lang))
                                      .join(', ')}
                                  >
                                    +{extraCoursesCount} {tr('khóa', 'more')}
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="font-semibold text-amber-700">
                                {tr('Chưa mở khóa', 'No courses yet')}
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
                                    ? tr('Đã xóa (Supabase)', 'Deleted (Supabase)')
                                    : isSuspended
                                    ? tr('Tạm khóa', 'Suspended')
                                    : tr('Đã lưu trữ', 'Archived')}
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
                                  {tr('Lỗi đồng bộ (Đồng bộ lại)', 'Sync error (Retry)')}
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
                                  {tr('Chờ kích hoạt (Đồng bộ lại)', 'Pending activation (Retry)')}
                                </button>
                              ) : hasLegacyInvalidClass ? (
                                <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-800">
                                  <AlertTriangle className="h-3 w-3" />
                                  {tr('Cần kiểm tra mã lớp', 'Check class code')}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  {tr('Đã đồng bộ', 'Synced')}
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
                              <span>{tr('Xem / Sửa', 'View / Edit')}</span>
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
                    {tr('Hiển thị', 'Showing')} {pageOffset + 1}–{pageOffset + studentsList.length} /{' '}
                    {totalStudentsCount}{' '}
                    {tr('học viên', totalStudentsCount === 1 ? 'student' : 'students')}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      disabled={pageOffset === 0}
                      onClick={() => setPageOffset((p) => Math.max(0, p - pageLimit))}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
                    >
                      {tr('Trang trước', 'Previous')}
                    </button>
                    <button
                      type="button"
                      disabled={!studentSearchQuery.data?.hasMore}
                      onClick={() => setPageOffset((p) => p + pageLimit)}
                      className="rounded-lg border border-stone-200 px-2.5 py-1 font-bold text-stone-700 disabled:opacity-40"
                    >
                      {tr('Trang sau', 'Next')}
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
        isSettingCourseDuration={setCourseDurationMutation.isPending}
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
        onSetCourseDuration={(params) => setCourseDurationMutation.mutateAsync(params)}
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
            title: tr(`Đã sao chép email: ${email}`, `Copied email: ${email}`),
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
        onDeleteTeacher={(t) => setTeacherToDelete(t)}
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
