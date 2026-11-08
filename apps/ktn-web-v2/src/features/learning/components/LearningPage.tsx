import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  CheckCircle2,
  BookOpen,
  Headphones,
  FileCheck2,
  FileText,
  Download,
  ExternalLink,
  ChevronRight,
  Volume2,
  ListVideo,
  MessageSquare,
  AlertCircle,
  RotateCcw,
  Sparkles,
  Lock,
  Clock,
  CreditCard,
  X,
  Loader2,
  ShieldCheck,
  Copy,
  Layers,
} from 'lucide-react';
import { HlsVideoPlayer, VideoPlayerStatus } from './HlsVideoPlayer';
import { HomeworkPanel } from './HomeworkPanel';
import { KtnApiError, ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore } from '@/stores/useAuthStore';
import { DEMO_COURSES, DEMO_HOMEWORKS, DEMO_LESSONS } from '@/lib/demoData';
import { disambiguateCatalogCourses, formatVnd } from '@/lib/utils';
import {
  KtnCourse,
  KtnHomework,
  KtnLessonUnit,
  KtnOrder,
  KtnStudentRecord,
  KtnVietQrPaymentInfo,
  StudentOrderTrackerStage,
} from '@/types/ktn.types';

const VALID_VN_PHONE_REGEX = /^0\d{9}$/;

function formatMaterialBytes(bytes?: number | null): string {
  if (!bytes || bytes <= 0) return '';
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export const STUDENT_TRACKER_STAGES: Array<{
  id: StudentOrderTrackerStage;
  label: string;
}> = [
  { id: 'received', label: 'Đã tiếp nhận' },
  { id: 'contacted', label: 'Đã liên hệ' },
  { id: 'awaiting_payment', label: 'Chờ thanh toán' },
  { id: 'payment_verified', label: 'Đã xác minh thanh toán' },
  { id: 'activating', label: 'Đang kích hoạt' },
  { id: 'unlocked', label: 'Đã mở khóa' },
  { id: 'needs_support', label: 'Cần hỗ trợ' },
];

export const LearningPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const videoDemoScenario = useUiStore((s) => s.videoDemoScenario);
  const setVideoDemoScenario = useUiStore((s) => s.setVideoDemoScenario);
  const completedLessons = useUiStore((s) => s.completedLessons);
  const toggleLessonCompleted = useUiStore((s) => s.toggleLessonCompleted);
  const addToast = useUiStore((s) => s.addToast);

  const [selectedCourseId, setSelectedCourseId] = useState<string>(
    () => searchParams.get('courseId') || '6adadba969897b0002482ca5'
  );
  const [selectedLessonNum, setSelectedLessonNum] = useState<number>(() => {
    const p = Number(searchParams.get('lesson'));
    return Number.isFinite(p) && p > 0 ? p : 1;
  });
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(
    () => searchParams.get('unitId') || null
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'materials' | 'homework'>(() => {
    const t = searchParams.get('tab');
    if (t === 'homework') return 'homework';
    if (t === 'materials' || t === 'audio') return 'materials';
    return 'overview';
  });
  const [mobileLessonDrawerOpen, setMobileLessonDrawerOpen] = useState(false);

  // Phase 4.2: Demo Video Modal state
  const [demoModalCourse, setDemoModalCourse] = useState<KtnCourse | null>(null);
  const [demoEnded, setDemoEnded] = useState(false);

  // Phase 4.3 & 4.4: In-App Course Registration Modal state
  const [registerModalCourse, setRegisterModalCourse] = useState<KtnCourse | null>(
    null
  );
  const [regParentPhone, setRegParentPhone] = useState('');
  const [regParentName, setRegParentName] = useState('');
  const [regStudentName, setRegStudentName] = useState('');
  const [regNote, setRegNote] = useState('');
  const [regUpdateProfilePhone, setRegUpdateProfilePhone] = useState(false);
  const [regError, setRegError] = useState<string | null>(null);
  const [regIdempotencyKey, setRegIdempotencyKey] = useState(
    () => `STU-ORD-${Date.now()}`
  );
  const [activeCreatedOrder, setActiveCreatedOrder] = useState<{
    order: KtnOrder;
    paymentInfo: KtnVietQrPaymentInfo | null;
  } | null>(null);
  const [reportTxRefInput, setReportTxRefInput] = useState('');

  const syncUrlParams = (
    nextCourseId: string,
    nextLessonNum: number,
    nextTab?: 'overview' | 'materials' | 'homework',
    nextUnitId?: string | null
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set('courseId', nextCourseId);
    next.set('lesson', String(nextLessonNum));
    if (nextUnitId) next.set('unitId', nextUnitId);
    else next.delete('unitId');
    if (nextTab) {
      if (nextTab === 'overview') next.delete('tab');
      else next.set('tab', nextTab);
    }
    setSearchParams(next, { replace: true });
  };

  // Sync deep-link query params (?courseId=...&lesson=...&tab=homework)
  useEffect(() => {
    const cid = searchParams.get('courseId');
    const lnum = Number(searchParams.get('lesson'));
    const uid = searchParams.get('unitId');
    const tab = searchParams.get('tab');
    if (cid) setSelectedCourseId(cid);
    if (Number.isFinite(lnum) && lnum > 0) setSelectedLessonNum(lnum);
    if (uid !== null) setSelectedUnitId(uid || null);
    if (tab === 'homework') {
      setActiveTab('homework');
    } else if (tab === 'materials' || tab === 'audio') {
      setActiveTab('materials');
    } else if (tab === 'overview') {
      setActiveTab('overview');
    }
  }, [searchParams]);

  // Sync default course to user's entitled course when logging in (unless explicitly specified via URL)
  useEffect(() => {
    if (
      !searchParams.get('courseId') &&
      !isDemoMode &&
      user?.onlineCourses &&
      user.onlineCourses.length > 0
    ) {
      const hasCurrent = user.onlineCourses.some((c) => c.id === selectedCourseId);
      if (!hasCurrent) {
        setSelectedCourseId(user.onlineCourses[0].id);
      }
    }
  }, [user, isDemoMode, selectedCourseId, searchParams]);

  // 1. Fetch Course Catalog
  const coursesQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  // 1b. Fetch Student Profile (for accurate pre-fill of phone & parent_name in registration modal)
  const studentMeQuery = useQuery<KtnStudentRecord | null>({
    queryKey: ['ktn-student-me', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode || !user || user.role !== 'student') return null;
      return ktnApi.getStudentMe();
    },
    enabled: Boolean(user && user.role === 'student' && !isDemoMode),
  });

  // 1c. Fetch Student's Own Orders (Phase 4.4)
  const myOrdersQuery = useQuery<KtnOrder[]>({
    queryKey: ['ktn-student-my-orders', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode || !user) return [];
      return ktnApi.getMyOrders();
    },
    enabled: Boolean(user && !isDemoMode),
  });

  const coursesList = useMemo(() => {
    if (isDemoMode) return DEMO_COURSES;
    return (coursesQuery.data || []).filter((c) => !c.isBundle);
  }, [isDemoMode, coursesQuery.data]);

  const entitledCourseIdSet = useMemo(() => {
    const ids = new Set<string>((user?.onlineCourses || []).map((c) => c.id).filter(Boolean));
    if (!isDemoMode) {
      for (const c of studentMeQuery.data?.online_courses || []) {
        const cid = typeof c === 'string' ? c : c?.id;
        if (cid) ids.add(cid);
      }
      for (const ord of myOrdersQuery.data || []) {
        if (
          ord.approval_status === 'approved' &&
          ord.provisioningStatus !== 'partial_failure' &&
          ord.provisioningStatus !== 'sync_failed' &&
          ord.course_id
        ) {
          ids.add(ord.course_id);
        }
      }
    }
    return ids;
  }, [user?.onlineCourses, isDemoMode, studentMeQuery.data?.online_courses, myOrdersQuery.data]);

  // If studentMeQuery or myOrdersQuery detects a newly unlocked course not yet in user.onlineCourses, refresh session
  useEffect(() => {
    if (isDemoMode || !user || user.role !== 'student') return;
    const sessionIds = new Set<string>((user.onlineCourses || []).map((c) => c.id));
    let hasNewlyUnlocked = false;
    for (const cid of entitledCourseIdSet) {
      if (!sessionIds.has(cid)) {
        hasNewlyUnlocked = true;
        break;
      }
    }
    if (hasNewlyUnlocked) {
      restoreSession().catch(() => null);
    }
  }, [entitledCourseIdSet, isDemoMode, user, restoreSession]);

  const isCourseEntitled = (courseId: string): boolean => {
    if (user?.role === 'teacher' || user?.role === 'admin') return true;
    if (entitledCourseIdSet.has(courseId)) return true;
    if (isDemoMode && entitledCourseIdSet.size === 0) {
      return courseId === DEMO_COURSES[0]?.id;
    }
    return false;
  };

  const myEntitledCourses = useMemo(
    () =>
      disambiguateCatalogCourses(
        coursesList.filter((c) => isCourseEntitled(c.id))
      ),
    [coursesList, user, isDemoMode, entitledCourseIdSet]
  );

  const exploreUnentitledCourses = useMemo(
    () =>
      disambiguateCatalogCourses(
        coursesList.filter((c) => !isCourseEntitled(c.id))
      ),
    [coursesList, user, isDemoMode, entitledCourseIdSet]
  );

  const activeCourse: KtnCourse = useMemo(() => {
    return (
      coursesList.find((c) => c.id === selectedCourseId) ||
      coursesList[0] ||
      (isDemoMode
        ? DEMO_COURSES[0]
        : {
            id: selectedCourseId,
            code: 'HSK',
            title: 'Khóa học tiếng Trung Khổng Tử Nhí',
            shortTitle: 'Khóa học',
          })
    );
  }, [coursesList, selectedCourseId, isDemoMode]);

  // Open Registration Modal and auto-fill from session/profile (Phase 4.3)
  const openRegistrationModal = (course: KtnCourse) => {
    const stuProfile = studentMeQuery.data;
    setRegisterModalCourse(course);
    setActiveCreatedOrder(null);
    setRegError(null);
    setRegStudentName(stuProfile?.name || user?.name || '');
    setRegParentPhone(stuProfile?.phone || user?.phone || '');
    setRegParentName(stuProfile?.parent_name || user?.parentName || '');
    setRegNote('');
    setRegUpdateProfilePhone(false);
    setRegIdempotencyKey(`STU-ORD-${course.id}-${Date.now()}`);
  };

  const openDemoVideoModal = (course: KtnCourse) => {
    setDemoEnded(false);
    setDemoModalCourse(course);
  };

  // Create In-App Student Order Mutation (Phase 4.4)
  const createStudentOrderMutation = useMutation({
    mutationFn: async () => {
      if (!registerModalCourse) throw new Error('Chưa chọn khóa học');
      setRegError(null);
      const cleanPhone = regParentPhone.replace(/[^\d]/g, '');
      if (!VALID_VN_PHONE_REGEX.test(cleanPhone)) {
        throw new Error(
          'Số điện thoại / Zalo phụ huynh không hợp lệ (vui lòng nhập đủ 10 số bắt đầu bằng 0).'
        );
      }

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 300));
        const demoOrder: KtnOrder = {
          order_id: `ORD-DEMO-${Date.now().toString().slice(-5)}`,
          student_name: regStudentName || user?.name || 'Học viên KTN',
          parent_name: regParentName.trim(),
          student_email: user?.email || 'hoangngan@khongtunhi.com',
          phone: cleanPhone,
          parent_phone: cleanPhone,
          course_id: registerModalCourse.id,
          course_name: registerModalCourse.title,
          amount: registerModalCourse.price || 890000,
          payment_method: 'VietQR',
          payment_status: 'pending_verification',
          payment_detailed_status: 'unpaid',
          contact_status: 'not_called',
          approval_status: 'pending',
          source: 'authenticated_student',
          source_label: 'Học viên đang đăng nhập',
          student_tracker_stage: 'received',
          student_tracker_label: 'Đã tiếp nhận',
          created_at: new Date().toISOString(),
        };
        return {
          ok: true,
          orderId: demoOrder.order_id,
          order: demoOrder,
          paymentInfo: {
            bankId: 'MB',
            bankName: 'MB Bank (Ngân hàng Quân Đội)',
            accountNumber: '8838683868',
            accountName: 'HOC VIEN KHONG TU NHI',
            amount: demoOrder.amount,
            transferContent: demoOrder.order_id,
            qrUrl: `https://img.vietqr.io/image/MB-8838683868-compact2.png?amount=${demoOrder.amount}&addInfo=${demoOrder.order_id}`,
          },
          message: 'Đơn của em đang chờ xác nhận.',
        };
      }

      return ktnApi.createStudentOrder({
        courseId: registerModalCourse.id,
        studentName: regStudentName.trim() || user?.name || undefined,
        parentName: regParentName.trim() || undefined,
        parentPhone: cleanPhone,
        note: regNote.trim() || undefined,
        updateProfilePhone: regUpdateProfilePhone,
        idempotencyKey: regIdempotencyKey,
      });
    },
    onSuccess: (res) => {
      setRegError(null);
      setActiveCreatedOrder({
        order: res.order,
        paymentInfo: res.paymentInfo || res.order.payment_info || null,
      });
      queryClient.invalidateQueries({ queryKey: ['ktn-student-my-orders'] });
      if (regUpdateProfilePhone) {
        queryClient.invalidateQueries({ queryKey: ['ktn-student-me'] });
      }
      addToast({
        title: 'Đơn của em đang chờ xác nhận.',
        description: `Mã đơn ${res.orderId} đã được ghi nhận thành công.`,
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      setRegError(err.message);
    },
  });

  // Report Transfer Mutation
  const reportPaymentMutation = useMutation({
    mutationFn: async (params: { orderId: string; paymentTxRef?: string }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 250));
        return {
          ok: true,
          order: activeCreatedOrder?.order
            ? {
                ...activeCreatedOrder.order,
                payment_detailed_status: 'customer_reported' as const,
                student_tracker_stage: 'awaiting_payment' as const,
                student_tracker_label: 'Chờ thanh toán (Đã báo chuyển khoản)',
              }
            : ({} as KtnOrder),
          message:
            'Đã ghi nhận thông báo chuyển khoản. Học vụ sẽ kiểm tra giao dịch và xác nhận sớm nhất!',
        };
      }
      return ktnApi.reportOrderPayment(params);
    },
    onSuccess: (res) => {
      if (res.order && res.order.order_id) {
        setActiveCreatedOrder((prev) =>
          prev
            ? {
                ...prev,
                order: res.order,
              }
            : null
        );
      }
      queryClient.invalidateQueries({ queryKey: ['ktn-student-my-orders'] });
      addToast({
        title: 'Đã gửi thông báo chuyển khoản!',
        description: res.message,
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể gửi báo cáo chuyển khoản',
        description: err.message,
        variant: 'error',
      });
    },
  });

  // 2. Fetch Lesson Units for Selected Course (enforces 403 COURSE_NOT_ENTITLED on BFF)
  const unitsQuery = useQuery<KtnLessonUnit[]>({
    queryKey: [
      'ktn-course-units',
      activeCourse.id,
      user?.email,
      isDemoMode,
      videoDemoScenario,
    ],
    queryFn: async () => {
      if (isDemoMode || videoDemoScenario !== 'live_real') {
        if (videoDemoScenario === 'loading') {
          await new Promise((r) => setTimeout(r, 1500));
        }
        if (videoDemoScenario === 'unentitled') {
          throw new KtnApiError({
            message: 'Tài khoản chưa được mở khóa khóa học này.',
            status: 403,
            code: 'COURSE_NOT_ENTITLED',
          });
        }
        if (videoDemoScenario === 'error') {
          throw new KtnApiError({
            message: 'Không tải được video bài giảng.',
            status: 502,
            code: 'STREAM_ERROR',
          });
        }
        return DEMO_LESSONS;
      }

      return ktnApi.getCourseUnits(activeCourse.id);
    },
    enabled: Boolean(user) || isDemoMode,
    retry: false,
  });

  const lessons: KtnLessonUnit[] = useMemo(() => {
    if (unitsQuery.data && unitsQuery.data.length > 0) {
      return unitsQuery.data;
    }
    if (isDemoMode) return DEMO_LESSONS;
    return [];
  }, [unitsQuery.data, isDemoMode]);

  const groupedMainLessons = useMemo(() => {
    const groups = new Map<
      number,
      {
        lessonNum: number;
        primaryUnit: KtnLessonUnit;
        subUnits: KtnLessonUnit[];
        title: string;
        titleZh: string;
        titleVi: string;
        duration: string;
      }
    >();

    for (const u of lessons) {
      if (u.unitType === 'workbook') continue;
      const lNum = Number(u.lessonNumber || u.num || 1);
      if (!groups.has(lNum)) {
        groups.set(lNum, {
          lessonNum: lNum,
          primaryUnit: u,
          subUnits: [],
          title: u.title,
          titleZh: u.titleZh || '',
          titleVi: u.titleVi || '',
          duration: u.duration || '12:00',
        });
      }
      groups.get(lNum)!.subUnits.push(u);
    }

    return Array.from(groups.values());
  }, [lessons]);

  const workbookUnits = useMemo(
    () => lessons.filter((u) => u.unitType === 'workbook'),
    [lessons]
  );

  const activeLesson: KtnLessonUnit | null = useMemo(() => {
    if (lessons.length === 0) return null;
    if (selectedUnitId) {
      const byUnitId = lessons.find(
        (l) =>
          String(l.unitId || l._id || l.id) === String(selectedUnitId)
      );
      if (byUnitId) return byUnitId;
    }
    return (
      lessons.find(
        (l) => Number(l.lessonNumber || l.num) === Number(selectedLessonNum)
      ) ||
      lessons[0] ||
      null
    );
  }, [lessons, selectedLessonNum, selectedUnitId]);

  const activeLessonGroup = useMemo(() => {
    if (!activeLesson) return null;
    const lNum = Number(activeLesson.lessonNumber || activeLesson.num);
    return groupedMainLessons.find((g) => g.lessonNum === lNum) || null;
  }, [groupedMainLessons, activeLesson]);

  // 3. Fetch Student Homeworks
  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const currentLessonHomework = useMemo(() => {
    if (!activeLesson) return null;
    if (isDemoMode && videoDemoScenario === 'homework_pending') {
      return null;
    }
    if (isDemoMode && videoDemoScenario === 'homework_submitted') {
      return {
        ...DEMO_HOMEWORKS[0],
        id: 'DEMO-HW-SUBMITTED-STATE',
        course_id: activeCourse.id,
        lesson_num: activeLesson.num,
        lesson_title: activeLesson.title,
        status: 'pending' as const,
        score: null,
        teacher_feedback: '',
        student_note: 'Con vừa nộp bản thu âm đọc từ mới bài này ạ!',
      };
    }
    const list = homeworksQuery.data || [];
    const targetLessonNum = Number(activeLesson.lessonNumber || activeLesson.num);
    return (
      list.find(
        (h) =>
          String(h.course_id) === String(activeCourse.id) &&
          Number(h.lesson_num) === targetLessonNum
      ) || null
    );
  }, [homeworksQuery.data, activeCourse.id, activeLesson, isDemoMode, videoDemoScenario]);

  // 4. Submit Homework Mutation (Presigned S3 Upload + POST /api/ktn/homeworks, or Text Answer)
  const submitHomeworkMutation = useMutation({
    mutationFn: async (params: {
      file?: File | Blob | null;
      fileName?: string;
      note: string;
      submissionMode?: 'file' | 'text';
      textAnswer?: string;
    }) => {
      if (!activeLesson) throw new Error('Chưa chọn bài học');
      const targetLessonNum = Number(activeLesson.lessonNumber || activeLesson.num);

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 450));
        return {
          homework: {
            ...DEMO_HOMEWORKS[0],
            id: `demo_hw_${Date.now()}`,
            lesson_num: targetLessonNum,
            lesson_title: activeLesson.title,
            student_note: params.note,
            status: 'pending' as const,
            submitted_at: new Date().toISOString(),
          },
          syncStatus: 'synced',
        };
      }

      if (!params.file || params.submissionMode === 'text') {
        return ktnApi.submitHomework({
          courseId: activeCourse.id,
          classCode: user?.classCode || '',
          lessonNum: targetLessonNum,
          lessonTitle: activeLesson.title,
          unitId: activeLesson.unitId || activeLesson._id || activeLesson.id || null,
          fileUrl: '',
          fileType: 'text/plain',
          studentNote: params.note,
          textAnswer: params.textAnswer || params.note,
          submissionMode: 'text',
          attachments: [],
        });
      }

      const uploaded = await ktnApi.uploadHomeworkFile(
        params.file,
        params.fileName || `btvn-bai-${targetLessonNum}.dat`
      );

      return ktnApi.submitHomework({
        courseId: activeCourse.id,
        classCode: user?.classCode || '',
        lessonNum: targetLessonNum,
        lessonTitle: activeLesson.title,
        unitId: activeLesson.unitId || activeLesson._id || activeLesson.id || null,
        fileUrl: uploaded.fileUrl,
        fileType: uploaded.fileType,
        studentNote: params.note,
        submissionMode: 'file',
        attachments: [
          {
            title: params.fileName || `Bài nộp Bài ${targetLessonNum}`,
            fileUrl: uploaded.fileUrl,
            mediaType: uploaded.fileType,
            size: uploaded.size,
          },
        ],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
      addToast({
        title: 'Đã nộp bài tập thành công!',
        description: user?.classCode
          ? `Bài làm của em đã được lưu và gửi tới giáo viên phụ trách lớp ${user.classCode}.`
          : 'Bài làm của em đã được lưu vào hệ thống và đang chờ chấm điểm.',
        variant: 'success',
      });
    },
  });

  // Determine video player status override
  const playerStatusOverride: VideoPlayerStatus | null = useMemo(() => {
    if (videoDemoScenario === 'loading') return 'loading';
    if (videoDemoScenario === 'unentitled') return 'unentitled';
    if (videoDemoScenario === 'error') return 'error';
    if (videoDemoScenario === 'playing') return 'playing';
    if (videoDemoScenario === 'paused') return 'paused';

    if (unitsQuery.isLoading) return 'loading';
    if (unitsQuery.isError) {
      const err = unitsQuery.error as KtnApiError;
      if (
        err?.status === 403 ||
        err?.code === 'COURSE_NOT_ENTITLED' ||
        String(err?.message || '').includes('COURSE_NOT_ENTITLED') ||
        String(err?.message || '').includes('chưa được cấp quyền') ||
        String(err?.message || '').includes('chưa được mở khóa')
      ) {
        return 'unentitled';
      }
      return 'error';
    }
    return null;
  }, [
    videoDemoScenario,
    unitsQuery.isLoading,
    unitsQuery.isError,
    unitsQuery.error,
  ]);

  const activeLessonNumber = Number(activeLesson?.lessonNumber || activeLesson?.num || 1);
  const lessonKey = `${activeCourse.id}:${activeLessonNumber}`;
  const isCurrentLessonCompleted = Boolean(completedLessons[lessonKey]);

  const handleToggleCompleted = () => {
    if (!activeLesson) return;
    toggleLessonCompleted(activeCourse.id, activeLessonNumber);
    addToast({
      title: !isCurrentLessonCompleted
        ? 'Tuyệt vời! Đã hoàn thành bài học 🎉'
        : 'Đã bỏ đánh dấu hoàn thành bài học',
      variant: 'success',
    });
  };

  const totalCurriculumCount =
    groupedMainLessons.length > 0 ? groupedMainLessons.length : lessons.length;
  const completedCount =
    groupedMainLessons.length > 0
      ? groupedMainLessons.filter(
          (g) => completedLessons[`${activeCourse.id}:${g.lessonNum}`]
        ).length
      : lessons.filter((l) => completedLessons[`${activeCourse.id}:${l.num}`]).length;

  const myOrdersList = myOrdersQuery.data || [];

  const handleSelectLessonGroup = (group: {
    lessonNum: number;
    primaryUnit: KtnLessonUnit;
  }) => {
    const uid =
      group.primaryUnit.unitId || group.primaryUnit._id || group.primaryUnit.id || null;
    setSelectedLessonNum(group.lessonNum);
    setSelectedUnitId(uid);
    syncUrlParams(activeCourse.id, group.lessonNum, activeTab, uid);
  };

  const handleSelectUnit = (unit: KtnLessonUnit) => {
    const lNum = Number(unit.lessonNumber || unit.num || 1);
    const uid = unit.unitId || unit._id || unit.id || null;
    setSelectedLessonNum(lNum);
    setSelectedUnitId(uid);
    syncUrlParams(activeCourse.id, lNum, activeTab, uid);
  };

  return (
    <div data-testid="video-learning-page" className="space-y-3 pb-16 sm:space-y-4 sm:pb-6">
      {/* Demo Mode Video State Switcher */}
      {isDemoMode && (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-amber-200 bg-amber-50/90 px-4 py-2 text-xs">
          <span className="font-semibold text-amber-950">
            Trạng thái kiểm thử Phòng học (Demo):
          </span>
          <div className="flex flex-wrap items-center gap-1">
            {(
              [
                { id: 'live_real', label: 'Sẵn sàng phát' },
                { id: 'playing', label: 'Đang phát' },
                { id: 'paused', label: 'Tạm dừng' },
                { id: 'loading', label: 'Đang tải (Loading)' },
                { id: 'error', label: 'Lỗi Stream + Thử lại' },
                { id: 'unentitled', label: 'Chưa mở khóa (403 Guard)' },
                { id: 'homework_pending', label: 'Có bài tập cần nộp' },
                { id: 'homework_submitted', label: 'Đã nộp bài tập' },
              ] as const
            ).map((st) => (
              <button
                key={st.id}
                type="button"
                data-testid={`video-demo-btn-${st.id}`}
                onClick={() => setVideoDemoScenario(st.id)}
                className={`rounded-md px-2.5 py-1 text-[11px] font-bold transition-colors ${
                  videoDemoScenario === st.id
                    ? 'bg-red-800 text-white'
                    : 'border border-stone-300 bg-white text-stone-700 hover:bg-stone-100'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {!isDemoMode && coursesQuery.isError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được danh sách khóa học.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              coursesQuery.refetch();
              unitsQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Course Selector Header (Full Course Title — never truncated to Kh...) */}
      <div
        data-testid="learning-course-switcher-header"
        className="space-y-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-2xs sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:px-4 sm:py-3"
      >
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
          <h1
            data-testid="learning-active-course-title"
            className="font-display text-sm font-bold leading-snug text-stone-900 sm:text-base"
          >
            {activeCourse.title}
          </h1>
          <span
            data-testid="learning-course-progress-pill"
            className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800 ring-1 ring-emerald-200"
          >
            Tiến độ: {completedCount}/{totalCurriculumCount} bài
          </span>
        </div>

        {/* Course Level Pills (Single-line horizontal scroll on mobile, entitled courses first) */}
        {coursesList.length > 0 && (
          <div
            data-testid="learning-course-pills"
            className="flex items-center gap-1.5 overflow-x-auto pb-0.5 sm:pb-0"
          >
            {disambiguateCatalogCourses(
              [...coursesList].sort((a, b) => {
                const aEnt = isCourseEntitled(a.id) ? 0 : 1;
                const bEnt = isCourseEntitled(b.id) ? 0 : 1;
                return aEnt - bEnt;
              })
            ).map((course) => {
              const isEntitled = isCourseEntitled(course.id);

              return (
                <button
                  key={course.id}
                  type="button"
                  data-testid={`select-course-${course.id}`}
                  onClick={() => {
                    setSelectedCourseId(course.id);
                    setSelectedLessonNum(1);
                    setSelectedUnitId(null);
                    syncUrlParams(course.id, 1, activeTab, null);
                  }}
                  className={`inline-flex min-h-[34px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-all ${
                    activeCourse.id === course.id
                      ? 'bg-red-800 text-white shadow-2xs'
                      : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                  }`}
                >
                  <span>{course.displayLabel}</span>
                  {!isEntitled && (
                    <span className="rounded bg-stone-200 px-1 py-0.2 text-[10px] text-stone-600">
                      Chưa mở
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Main Responsive Grid: Video + Tabs on Left (8 cols), Lesson List Sidebar on Right (4 cols) */}
      <div className="grid grid-cols-1 gap-3 sm:gap-4 lg:grid-cols-12">
        {/* Left Column: Prominent Lesson Banner + Video Player + 3 Clear Tabs */}
        <div className="space-y-3 sm:space-y-4 lg:col-span-8">
          {/* Phase 3A: Prominent Active Lesson Header Banner */}
          {activeLesson && playerStatusOverride !== 'unentitled' && (
            <div
              data-testid="lesson-header-banner"
              className="rounded-xl border border-stone-200 bg-white px-3.5 py-3 shadow-2xs sm:px-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="inline-flex items-center rounded-lg bg-red-800 px-2.5 py-0.5 text-[11px] font-bold text-white">
                    {activeLesson.unitType === 'workbook'
                      ? activeLesson.partNumber || 'Sách bài tập'
                      : activeLesson.partNumber && String(activeLesson.partNumber).includes('.')
                      ? `Bài ${activeLessonNumber} · Phần ${activeLesson.partNumber}`
                      : `Bài ${activeLessonNumber}/${totalCurriculumCount}`}
                  </span>
                  {activeLesson.rawTitle && (
                    <span className="rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-semibold text-stone-600">
                      {activeLesson.rawTitle}
                    </span>
                  )}
                  {activeLesson.duration && (
                    <span className="inline-flex items-center gap-1 rounded-md bg-stone-100 px-2 py-0.5 text-[11px] font-medium text-stone-600">
                      <Clock className="h-3 w-3 text-stone-500" />
                      {activeLesson.duration}
                    </span>
                  )}
                </div>

                {isCurrentLessonCompleted && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Đã hoàn thành
                  </span>
                )}
              </div>

              <h2
                data-testid="active-lesson-title"
                className="mt-1.5 font-display text-base font-bold leading-snug text-stone-900 sm:text-lg"
              >
                {activeLesson.title}
              </h2>

              {(activeLesson.titleZh || activeLesson.titleVi) && (
                <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                  {activeLesson.titleZh && (
                    <span
                      data-testid="active-lesson-title-zh"
                      className="font-bold text-red-900"
                    >
                      {activeLesson.titleZh}
                    </span>
                  )}
                  {activeLesson.titleZh && activeLesson.titleVi && (
                    <span className="text-stone-400">—</span>
                  )}
                  {activeLesson.titleVi && (
                    <span
                      data-testid="active-lesson-title-vi"
                      className="font-semibold text-stone-700"
                    >
                      {activeLesson.titleVi}
                    </span>
                  )}
                </div>
              )}

              {activeLesson.grammar && (
                <p
                  data-testid="active-lesson-grammar-summary"
                  className="mt-1.5 text-xs leading-relaxed text-stone-600"
                >
                  <strong className="font-semibold text-stone-800">Trọng tâm bài học:</strong>{' '}
                  {activeLesson.grammar}
                </p>
              )}
            </div>
          )}

          <HlsVideoPlayer
            lessonTitle={activeLesson?.title || 'Bài giảng tiếng Trung KTN'}
            courseName={activeCourse.title}
            streamUrl={activeLesson?.streamUrl || activeLesson?.video || null}
            fallbackVideoUrl={activeLesson?.video || null}
            statusOverride={playerStatusOverride}
            unentitledReason={
              unitsQuery.error instanceof Error ? unitsQuery.error.message : undefined
            }
            isCompleted={isCurrentLessonCompleted}
            onMarkCompleted={handleToggleCompleted}
            onRetryStream={() => {
              if (videoDemoScenario === 'error') setVideoDemoScenario('live_real');
              unitsQuery.refetch();
            }}
            onWatchDemoCourse={() => openDemoVideoModal(activeCourse)}
            onRequestUnlockCourse={() => openRegistrationModal(activeCourse)}
          />

          {/* Sub-part Video Switcher (When a lesson has multiple video parts like 3.1/3.2 or 13.1/13.2) */}
          {activeLesson &&
            playerStatusOverride !== 'unentitled' &&
            activeLessonGroup &&
            activeLessonGroup.subUnits.length > 1 && (
              <div
                data-testid="lesson-parts-switcher"
                className="flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-white px-3 py-2 shadow-2xs"
              >
                <span className="inline-flex items-center gap-1 text-xs font-bold text-stone-700">
                  <Layers className="h-3.5 w-3.5 text-red-800" />
                  Các phần của Bài {activeLessonGroup.lessonNum}:
                </span>
                {activeLessonGroup.subUnits.map((sub, sIdx) => {
                  const subUid = sub.unitId || sub._id || sub.id;
                  const activeUid =
                    activeLesson.unitId || activeLesson._id || activeLesson.id;
                  const isCurrentPart = String(subUid) === String(activeUid);
                  const partCode = sub.partNumber || `${activeLessonGroup.lessonNum}.${sIdx + 1}`;
                  return (
                    <button
                      key={subUid || sIdx}
                      type="button"
                      data-testid={`switch-part-${partCode}`}
                      onClick={() => handleSelectUnit(sub)}
                      className={`inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                        isCurrentPart
                          ? 'bg-red-800 text-white shadow-2xs'
                          : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                      }`}
                    >
                      <PlayCircle className="h-3.5 w-3.5" />
                      <span>Phần {partCode}</span>
                      {sub.duration && (
                        <span
                          className={`text-[10px] ${
                            isCurrentPart ? 'text-red-100' : 'text-stone-500'
                          }`}
                        >
                          ({sub.duration})
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}

          {/* Mobile Lesson Drawer Trigger & Content Tabs (Only when entitled and lessons exist) */}
          {activeLesson && playerStatusOverride !== 'unentitled' && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 lg:hidden">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase text-red-800">
                    {activeLesson.unitType === 'workbook'
                      ? activeLesson.partNumber || 'Sách bài tập'
                      : `Bài ${activeLessonNumber}/${totalCurriculumCount}`}
                  </p>
                  <p className="truncate text-xs font-semibold text-stone-900">
                    {activeLesson.title}
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="mobile-lesson-drawer-toggle"
                  onClick={() => setMobileLessonDrawerOpen((prev) => !prev)}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-800"
                >
                  <ListVideo className="h-3.5 w-3.5 text-red-800" />
                  <span>
                    Chọn bài ({totalCurriculumCount}
                    {workbookUnits.length > 0 ? `+${workbookUnits.length} SBT` : ''})
                  </span>
                </button>
              </div>

              {mobileLessonDrawerOpen && (
                <div
                  data-testid="mobile-lesson-drawer"
                  className="rounded-2xl border border-stone-200 bg-white p-2.5 lg:hidden"
                >
                  <div className="max-h-72 space-y-1.5 overflow-y-auto">
                    {groupedMainLessons.map((grp) => {
                      const isSelected =
                        activeLesson.unitType !== 'workbook' &&
                        Number(grp.lessonNum) === Number(activeLessonNumber);
                      const done = Boolean(
                        completedLessons[`${activeCourse.id}:${grp.lessonNum}`]
                      );
                      return (
                        <div
                          key={grp.lessonNum}
                          className="rounded-xl border border-stone-100 bg-stone-50/50 p-1.5"
                        >
                          <button
                            type="button"
                            onClick={() => {
                              handleSelectLessonGroup(grp);
                              if (grp.subUnits.length <= 1) {
                                setMobileLessonDrawerOpen(false);
                              }
                            }}
                            className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs ${
                              isSelected
                                ? 'bg-red-50 font-bold text-red-900'
                                : 'font-semibold text-stone-800 hover:bg-stone-100'
                            }`}
                          >
                            <span className="line-clamp-1">{grp.title}</span>
                            <div className="ml-2 flex shrink-0 items-center gap-1.5">
                              <span className="text-[10px] text-stone-500">
                                {grp.duration}
                              </span>
                              {done && (
                                <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                              )}
                            </div>
                          </button>

                          {grp.subUnits.length > 1 && (
                            <div className="mt-1 flex flex-wrap gap-1 px-2 pb-1">
                              {grp.subUnits.map((sub, sIdx) => {
                                const subUid = sub.unitId || sub._id || sub.id;
                                const activeUid =
                                  activeLesson.unitId ||
                                  activeLesson._id ||
                                  activeLesson.id;
                                const isPartActive = String(subUid) === String(activeUid);
                                const pCode =
                                  sub.partNumber || `${grp.lessonNum}.${sIdx + 1}`;
                                return (
                                  <button
                                    key={subUid || sIdx}
                                    type="button"
                                    onClick={() => {
                                      handleSelectUnit(sub);
                                      setMobileLessonDrawerOpen(false);
                                    }}
                                    className={`rounded-md px-2 py-1 text-[11px] font-bold ${
                                      isPartActive
                                        ? 'bg-red-800 text-white'
                                        : 'border border-stone-200 bg-white text-stone-700'
                                    }`}
                                  >
                                    Phần {pCode} ({sub.duration || '12:00'})
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })}

                    {workbookUnits.length > 0 && (
                      <div className="pt-2">
                        <p className="px-2 pb-1 text-[11px] font-bold uppercase text-stone-500">
                          Chữa Sách bài tập (SBT)
                        </p>
                        {workbookUnits.map((wb) => {
                          const wbUid = wb.unitId || wb._id || wb.id;
                          const activeUid =
                            activeLesson.unitId || activeLesson._id || activeLesson.id;
                          const isSelected = String(wbUid) === String(activeUid);
                          return (
                            <button
                              key={wbUid || wb.num}
                              type="button"
                              onClick={() => {
                                handleSelectUnit(wb);
                                setMobileLessonDrawerOpen(false);
                              }}
                              className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                                isSelected
                                  ? 'bg-red-50 font-bold text-red-900'
                                  : 'text-stone-700 hover:bg-stone-50'
                              }`}
                            >
                              <span className="truncate">{wb.title}</span>
                              <span className="ml-2 shrink-0 text-[10px] text-stone-500">
                                {wb.duration}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Phase 3C: Three Clear Tabs Below Video: Nội dung | Học liệu | Bài tập */}
              <div className="rounded-xl border border-stone-200 bg-white p-3 shadow-2xs sm:p-4">
                <div className="flex items-center justify-between gap-1.5 overflow-x-auto border-b border-stone-200 pb-2.5">
                  <div className="flex shrink-0 items-center gap-1.5">
                    <button
                      type="button"
                      data-testid="tab-lesson-overview"
                      onClick={() => {
                        setActiveTab('overview');
                        syncUrlParams(
                          activeCourse.id,
                          activeLessonNumber,
                          'overview',
                          selectedUnitId
                        );
                      }}
                      className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'overview'
                          ? 'bg-red-800 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Nội dung</span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-materials"
                      onClick={() => {
                        setActiveTab('materials');
                        syncUrlParams(
                          activeCourse.id,
                          activeLessonNumber,
                          'materials',
                          selectedUnitId
                        );
                      }}
                      className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'materials'
                          ? 'bg-red-800 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>
                        Học liệu (
                        {(activeLesson.materials?.length || 0) +
                          (activeLesson.audioTracks?.length || 0)}
                        )
                      </span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-homework"
                      onClick={() => {
                        setActiveTab('homework');
                        syncUrlParams(
                          activeCourse.id,
                          activeLessonNumber,
                          'homework',
                          selectedUnitId
                        );
                      }}
                      className={`inline-flex min-h-[38px] shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'homework'
                          ? 'bg-red-800 text-white shadow-2xs'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      <span>Bài tập</span>
                      {currentLessonHomework?.status === 'graded' ? (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                          {currentLessonHomework.score}đ
                        </span>
                      ) : currentLessonHomework ? (
                        <span className="rounded-full bg-blue-600 px-1.5 py-0.2 text-[10px] text-white">
                          Đã nộp
                        </span>
                      ) : activeLesson.homeworkAssignment?.assigned !== false ? (
                        <span className="rounded-full bg-amber-500/90 px-1.5 py-0.2 text-[10px] text-white">
                          Cần làm
                        </span>
                      ) : null}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      navigate(
                        user?.classCode
                          ? `/chat?room=class:${user.classCode}`
                          : `/chat?room=course:${activeCourse.id}`
                      )
                    }
                    className="inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-bold text-red-900 hover:bg-red-100"
                  >
                    <MessageSquare className="h-3.5 w-3.5" />
                    <span>Hỏi GV</span>
                  </button>
                </div>

                {/* Tab 1: Nội dung (Overview & Quick Real Material Links) */}
                {activeTab === 'overview' && (
                  <div data-testid="lesson-overview-panel" className="mt-3 space-y-3">
                    <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3">
                      <p className="text-xs font-bold text-stone-900">
                        Chủ đề & Ngữ pháp trọng tâm:
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-stone-700">
                        {activeLesson.grammar ||
                          'Xem video bài giảng, luyện nghe phát âm chuẩn và thực hành bài tập theo hướng dẫn.'}
                      </p>
                    </div>

                    {/* Quick access to real verified materials of this lesson (never fake page 1) */}
                    {(activeLesson.materials && activeLesson.materials.length > 0) ||
                    (activeLesson.audioTracks && activeLesson.audioTracks.length > 0) ? (
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <h3 className="text-xs font-bold uppercase tracking-wide text-stone-600">
                            Học liệu của bài này
                          </h3>
                          <button
                            type="button"
                            onClick={() => {
                              setActiveTab('materials');
                              syncUrlParams(
                                activeCourse.id,
                                activeLessonNumber,
                                'materials',
                                selectedUnitId
                              );
                            }}
                            className="text-xs font-bold text-red-800 hover:underline"
                          >
                            Xem tất cả học liệu & MP3 →
                          </button>
                        </div>

                        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                          {(activeLesson.materials || []).slice(0, 3).map((mat) => (
                            <a
                              key={mat.id}
                              href={mat.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              data-testid={`overview-material-link-${mat.id}`}
                              className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50 p-2.5 transition-colors hover:border-red-300 hover:bg-red-50/40"
                            >
                              <div>
                                <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase text-red-800">
                                  <FileText className="h-3 w-3" />
                                  {mat.page ? `Trang ${mat.page}` : 'Tài liệu PDF'}
                                </span>
                                <p className="mt-0.5 line-clamp-1 text-xs font-bold text-stone-900">
                                  {mat.title}
                                </p>
                              </div>
                              <span className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold text-red-800">
                                {mat.actionLabel || 'Mở xem tài liệu'}
                                <ExternalLink className="h-3 w-3" />
                              </span>
                            </a>
                          ))}
                        </div>
                      </div>
                    ) : (
                      <div
                        data-testid="overview-no-materials-notice"
                        className="rounded-xl border border-dashed border-stone-200 bg-stone-50 px-3 py-2.5 text-xs text-stone-500"
                      >
                        Bài này chưa có tài liệu đính kèm.
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 2: Học liệu (PDF SGK/SBT/Vở viết + MP3 Bài khóa/Từ mới/SBT) */}
                {activeTab === 'materials' && (
                  <div
                    data-testid="lesson-materials-section"
                    className="mt-3 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <h3
                          data-testid="lesson-materials-heading"
                          className="font-display text-sm font-bold text-stone-900"
                        >
                          Học liệu của bài này
                        </h3>
                        <p className="text-xs text-stone-500">
                          Sách giáo khoa, sách bài tập, vở tập viết và các tệp nghe MP3 đúng theo{' '}
                          {activeLesson.title}
                        </p>
                      </div>
                    </div>

                    {(!activeLesson.materials || activeLesson.materials.length === 0) &&
                    (!activeLesson.audioTracks || activeLesson.audioTracks.length === 0) ? (
                      <div
                        data-testid="empty-lesson-materials"
                        className="rounded-xl border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-xs font-semibold text-stone-600"
                      >
                        Bài này chưa có tài liệu đính kèm.
                      </div>
                    ) : (
                      <>
                        {/* 1. PDF / Document Materials */}
                        {activeLesson.materials && activeLesson.materials.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">
                              Sách & Tài liệu học tập ({activeLesson.materials.length})
                            </h4>
                            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                              {activeLesson.materials.map((mat) => {
                                const sizeStr = formatMaterialBytes(mat.size);
                                const downloadHref =
                                  mat.baseUrl || mat.fileUrl || mat.url;
                                return (
                                  <div
                                    key={mat.id}
                                    data-testid={`material-card-${mat.id}`}
                                    className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/80 p-3 shadow-2xs"
                                  >
                                    <div className="flex items-start gap-2.5">
                                      <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-red-800 text-white">
                                        <FileText className="h-4 w-4" />
                                      </span>
                                      <div className="min-w-0 flex-1">
                                        <p className="text-xs font-bold leading-snug text-stone-900">
                                          {mat.title}
                                        </p>
                                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                                          {mat.page && (
                                            <span className="rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-900">
                                              Trang {mat.page}
                                            </span>
                                          )}
                                          {sizeStr && <span>• {sizeStr}</span>}
                                          <span>• PDF chuẩn</span>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="mt-3 flex flex-wrap items-center gap-2">
                                      <a
                                        href={mat.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        data-testid={`material-open-btn-${mat.id}`}
                                        className="inline-flex min-h-[34px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white transition-colors hover:bg-red-900"
                                      >
                                        <ExternalLink className="h-3.5 w-3.5" />
                                        <span>
                                          {mat.actionLabel ||
                                            (mat.page
                                              ? `Mở xem (Trang ${mat.page})`
                                              : 'Xem tài liệu')}
                                        </span>
                                      </a>
                                      <a
                                        href={downloadHref}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        download
                                        data-testid={`material-download-btn-${mat.id}`}
                                        className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-100"
                                      >
                                        <Download className="h-3.5 w-3.5" />
                                        <span>Tải về</span>
                                      </a>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 2. MP3 Audio Tracks (SGK & SBT) — preload="none" */}
                        {activeLesson.audioTracks && activeLesson.audioTracks.length > 0 && (
                          <div className="space-y-2">
                            <h4 className="text-xs font-bold uppercase tracking-wide text-stone-600">
                              File nghe MP3 của bài này ({activeLesson.audioTracks.length})
                            </h4>
                            <div className="space-y-2">
                              {activeLesson.audioTracks.map((audio, idx) => (
                                <div
                                  key={audio.url || idx}
                                  data-testid={`lesson-audio-row-${idx}`}
                                  className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5"
                                >
                                  <div className="flex min-w-0 items-center gap-2">
                                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-red-800 text-white">
                                      <Volume2 className="h-3.5 w-3.5" />
                                    </span>
                                    <div className="min-w-0">
                                      <p className="truncate text-xs font-bold text-stone-900">
                                        {audio.name}
                                      </p>
                                      <span className="text-[10px] font-semibold uppercase text-stone-500">
                                        {audio.category === 'sbt' || audio.category === 'mp3_sbt'
                                          ? 'MP3 Luyện nghe Sách bài tập'
                                          : 'MP3 Bài khóa & Từ mới SGK'}
                                      </span>
                                    </div>
                                  </div>
                                  <audio
                                    controls
                                    preload="none"
                                    data-testid={`lesson-audio-player-${idx}`}
                                    src={audio.url}
                                    className="h-8 w-full max-w-xs sm:w-64"
                                  />
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}

                {/* Tab 3: Bài tập (Homework) — single persistent mount so switching tabs on Desktop never unmounts an active recording/file */}
                <div className={activeTab === 'homework' ? 'mt-3' : 'mt-4 hidden lg:block'}>
                  <HomeworkPanel
                    key={`${activeCourse.id}:${activeLessonNumber}:${activeLesson.unitId || ''}`}
                    courseId={activeCourse.id}
                    lessonNum={activeLessonNumber}
                    unitId={
                      activeLesson.unitId || activeLesson._id || activeLesson.id || null
                    }
                    lessonTitle={activeLesson.title}
                    classCode={user?.classCode || ''}
                    homeworkAssignment={activeLesson.homeworkAssignment}
                    existingSubmission={currentLessonHomework}
                    isSubmitting={submitHomeworkMutation.isPending}
                    canManageHomeworkConfig={
                      user?.role === 'admin' ||
                      (user?.role === 'teacher' &&
                        Array.isArray(user?.assignedCourses) &&
                        user.assignedCourses.some(
                          (cid) => String(cid || '').toLowerCase() === activeCourse.id.toLowerCase()
                        ))
                    }
                    onHomeworkConfigSaved={() => {
                      unitsQuery.refetch();
                    }}
                    onSubmitHomework={async (params) => {
                      await submitHomeworkMutation.mutateAsync(params);
                    }}
                  />
                </div>
              </div>
            </>
          )}
        </div>

        {/* Right Column: Grouped Curriculum Lesson List Sidebar (Phase 3D) */}
        <aside className="hidden lg:block lg:col-span-4">
          <div
            data-testid="curriculum-sidebar"
            className="sticky top-4 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs"
          >
            <div className="border-b border-stone-200 bg-stone-50/80 p-4">
              <div className="flex items-center justify-between gap-2">
                <h2 className="font-display text-sm font-bold text-stone-900">
                  Chương trình học ({totalCurriculumCount} bài
                  {workbookUnits.length > 0 ? ` · ${workbookUnits.length} SBT` : ''})
                </h2>
                <span className="shrink-0 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Hoàn thành {completedCount}/{totalCurriculumCount}
                </span>
              </div>

              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{
                    width: `${
                      totalCurriculumCount > 0
                        ? Math.round((completedCount / totalCurriculumCount) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="flex-1 space-y-1.5 overflow-y-auto p-2.5">
              {/* Main Lessons Group (1..15) */}
              {groupedMainLessons.map((grp) => {
                const isSelectedLesson =
                  activeLesson?.unitType !== 'workbook' &&
                  Number(grp.lessonNum) === Number(activeLessonNumber);
                const isDone = Boolean(
                  completedLessons[`${activeCourse.id}:${grp.lessonNum}`]
                );

                return (
                  <div
                    key={grp.lessonNum}
                    className={`rounded-xl border transition-all ${
                      isSelectedLesson
                        ? 'border-red-200 bg-red-50/70'
                        : 'border-stone-100 bg-white hover:border-stone-200 hover:bg-stone-50/60'
                    }`}
                  >
                    <button
                      type="button"
                      data-testid={`lesson-sidebar-item-${grp.lessonNum}`}
                      onClick={() => handleSelectLessonGroup(grp)}
                      className="flex w-full items-start gap-2.5 p-2.5 text-left"
                    >
                      <div
                        className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                          isDone
                            ? 'bg-emerald-600 text-white'
                            : isSelectedLesson
                            ? 'bg-red-800 text-white'
                            : 'bg-stone-100 text-stone-700'
                        }`}
                      >
                        {isDone ? (
                          <CheckCircle2 className="h-4 w-4" />
                        ) : isSelectedLesson ? (
                          <PlayCircle className="h-4 w-4" />
                        ) : (
                          grp.lessonNum
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-xs leading-snug ${
                            isSelectedLesson
                              ? 'font-bold text-red-950'
                              : 'font-semibold text-stone-800'
                          }`}
                        >
                          {grp.title}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-stone-500">
                          <span>{grp.duration}</span>
                          {grp.subUnits.length > 1 && (
                            <span className="rounded bg-stone-200/80 px-1.5 py-0.2 text-[10px] font-bold text-stone-700">
                              {grp.subUnits.length} phần
                            </span>
                          )}
                          {grp.primaryUnit.audioTracks &&
                            grp.primaryUnit.audioTracks.length > 0 && (
                              <span>• {grp.primaryUnit.audioTracks.length} MP3</span>
                            )}
                          {isDone && (
                            <span className="font-semibold text-emerald-700">
                              • Đã học
                            </span>
                          )}
                        </div>
                      </div>

                      <ChevronRight
                        className={`mt-1 h-4 w-4 shrink-0 ${
                          isSelectedLesson ? 'text-red-800' : 'text-stone-300'
                        }`}
                      />
                    </button>

                    {/* Sub-part buttons (e.g. 3.1/3.2, 12.1/12.2/12.3, 13.1/13.2) */}
                    {grp.subUnits.length > 1 && (
                      <div className="flex flex-wrap gap-1.5 border-t border-stone-200/60 px-2.5 py-2">
                        {grp.subUnits.map((sub, sIdx) => {
                          const subUid = sub.unitId || sub._id || sub.id;
                          const activeUid =
                            activeLesson?.unitId ||
                            activeLesson?._id ||
                            activeLesson?.id;
                          const isCurrentPart = String(subUid) === String(activeUid);
                          const partCode =
                            sub.partNumber || `${grp.lessonNum}.${sIdx + 1}`;
                          return (
                            <button
                              key={subUid || sIdx}
                              type="button"
                              data-testid={`lesson-part-btn-${partCode}`}
                              onClick={() => handleSelectUnit(sub)}
                              className={`inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold transition-colors ${
                                isCurrentPart
                                  ? 'bg-red-800 text-white shadow-2xs'
                                  : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-100'
                              }`}
                            >
                              <PlayCircle className="h-3 w-3" />
                              <span>Phần {partCode}</span>
                              {sub.duration && (
                                <span
                                  className={`text-[10px] ${
                                    isCurrentPart ? 'text-red-100' : 'text-stone-400'
                                  }`}
                                >
                                  ({sub.duration})
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Separate Workbook (SBT) Group Section */}
              {workbookUnits.length > 0 && (
                <div
                  data-testid="sidebar-workbook-section"
                  className="mt-3 border-t border-stone-200 pt-3"
                >
                  <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-wider text-stone-500">
                    Chữa Sách Bài Tập ({workbookUnits.length} phần)
                  </p>
                  <div className="space-y-1.5">
                    {workbookUnits.map((wb) => {
                      const wbUid = wb.unitId || wb._id || wb.id;
                      const activeUid =
                        activeLesson?.unitId || activeLesson?._id || activeLesson?.id;
                      const isSelected = String(wbUid) === String(activeUid);
                      const wbCode = wb.partNumber || `SBT ${wb.num}`;
                      return (
                        <button
                          key={wbUid || wb.num}
                          type="button"
                          data-testid={`lesson-sidebar-item-${wb.num}`}
                          onClick={() => handleSelectUnit(wb)}
                          className={`flex w-full items-start gap-2.5 rounded-xl border p-2.5 text-left transition-all ${
                            isSelected
                              ? 'border-red-200 bg-red-50/90'
                              : 'border-stone-100 bg-stone-50/60 hover:bg-stone-100/70'
                          }`}
                        >
                          <div
                            className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-[10px] font-bold ${
                              isSelected
                                ? 'bg-red-800 text-white'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            SBT
                          </div>
                          <div className="min-w-0 flex-1">
                            <p
                              data-testid={`workbook-unit-title-${wbCode}`}
                              className={`text-xs leading-snug ${
                                isSelected
                                  ? 'font-bold text-red-950'
                                  : 'font-semibold text-stone-800'
                              }`}
                            >
                              {wb.title}
                            </p>
                            <p className="mt-0.5 text-[11px] text-stone-500">
                              {wb.rawTitle} • {wb.duration || '12:00'}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </aside>
      </div>

      {/* PHASE 4.4: STUDENT ACTIVE ORDERS TRACKER (If student has placed orders) */}
      {myOrdersList.length > 0 && (
        <section
          data-testid="student-orders-tracker-section"
          className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3.5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-amber-950 sm:text-sm">
                <Clock className="h-4 w-4 text-red-800" />
                Đơn đăng ký khóa học của em ({myOrdersList.length})
              </h2>
              <p
                data-testid="student-order-waiting-banner-text"
                className="mt-0.5 text-xs font-semibold text-stone-700"
              >
                {myOrdersList.some((o) => o.approval_status === 'pending')
                  ? 'Đơn của em đang chờ xác nhận.'
                  : 'Tất cả đơn đăng ký của em đã được xử lý.'}
              </p>
            </div>
          </div>

          <div className="mt-2.5 space-y-2.5">
            {myOrdersList.map((ord) => {
              const currentStage: StudentOrderTrackerStage =
                ord.student_tracker_stage ||
                (ord.approval_status === 'approved' ? 'unlocked' : 'received');

              return (
                <div
                  key={ord.order_id}
                  data-testid={`student-my-order-card-${ord.order_id}`}
                  className="rounded-xl border border-stone-200 bg-white p-3 text-xs shadow-2xs"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <span className="font-mono font-extrabold text-red-900">
                        {ord.order_id}
                      </span>{' '}
                      · <strong className="text-stone-900">{ord.course_name}</strong> ·{' '}
                      <span className="font-extrabold text-red-800">
                        {formatVnd(ord.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        data-testid={`student-my-order-stage-${ord.order_id}`}
                        className="rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-950"
                      >
                        {ord.student_tracker_label || 'Đang xử lý'}
                      </span>
                      {ord.approval_status === 'pending' && (
                        <button
                          type="button"
                          data-testid={`student-my-order-open-payment-${ord.order_id}`}
                          onClick={() => {
                            const matchedCourse =
                              coursesList.find((c) => c.id === ord.course_id) ||
                              activeCourse;
                            setRegisterModalCourse(matchedCourse);
                            setActiveCreatedOrder({
                              order: ord,
                              paymentInfo: ord.payment_info || null,
                            });
                          }}
                          className="rounded-lg bg-red-800 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-red-900"
                        >
                          Xem TT chuyển khoản
                        </button>
                      )}
                    </div>
                  </div>

                  {/* 7-Stage Status Strip */}
                  <div className="mt-2 flex flex-wrap items-center gap-1">
                    {STUDENT_TRACKER_STAGES.map((st) => {
                      const isCurrent = st.id === currentStage;
                      return (
                        <span
                          key={st.id}
                          className={`rounded-md px-2 py-0.5 text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-red-800 text-white'
                              : 'bg-stone-100 text-stone-500'
                          }`}
                        >
                          {st.label}
                        </span>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* PHASE 4.1: KHÓA CỦA EM (First) & KHÁM PHÁ THÊM (Below) */}
      <section
        data-testid="student-course-catalog-sections"
        className="space-y-3 rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs"
      >
        {/* Group 1: Khóa của em (Prioritized first) */}
        <div data-testid="student-my-courses-section">
          <div className="flex items-center justify-between gap-2">
            <h2 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-900 sm:text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-700" />
              Khóa của em ({myEntitledCourses.length})
            </h2>
            <span className="text-[11px] font-medium text-stone-500">
              Ưu tiên học tập hàng ngày
            </span>
          </div>

          {myEntitledCourses.length === 0 ? (
            <p className="mt-2 rounded-xl bg-stone-50 p-3 text-xs text-stone-600">
              Tài khoản của em hiện chưa có khóa học video nào được kích hoạt. Em có thể xem học thử và đăng ký khóa học ở mục Khám phá thêm bên dưới.
            </p>
          ) : (
            <div className="mt-2 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
              {myEntitledCourses.map((course) => {
                const isSelected = activeCourse.id === course.id;
                return (
                  <div
                    key={course.id}
                    data-testid={`my-entitled-course-card-${course.id}`}
                    className={`flex items-center justify-between gap-2.5 rounded-xl border p-2.5 transition-colors ${
                      isSelected
                        ? 'border-red-800 bg-red-50/50'
                        : 'border-stone-200 bg-stone-50/70 hover:bg-stone-100/80'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-bold text-emerald-900">
                        Đã mở khóa · {course.lessonsCount || 15} bài
                      </span>
                      <p className="mt-1 truncate text-xs font-bold text-stone-900">
                        {course.title}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedCourseId(course.id);
                        setSelectedLessonNum(1);
                        syncUrlParams(course.id, 1, activeTab);
                      }}
                      className="shrink-0 rounded-lg bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                    >
                      {isSelected ? 'Đang học' : 'Vào học'}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Group 2: Khám phá thêm (Unentitled courses below — compact, informative, non-intrusive) */}
        {exploreUnentitledCourses.length > 0 && (
          <div
            data-testid="student-explore-courses-section"
            className="border-t border-stone-200 pt-3"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex items-center gap-1.5 font-display text-xs font-bold uppercase tracking-wide text-stone-900 sm:text-sm">
                <Sparkles className="h-4 w-4 text-amber-600" />
                Khám phá thêm khóa học ({exploreUnentitledCourses.length})
              </h2>
              <span className="text-[11px] text-stone-500">
                Học thử miễn phí & đăng ký mở khóa trực tiếp
              </span>
            </div>

            <div className="mt-2.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {exploreUnentitledCourses.map((course) => (
                <div
                  key={course.id}
                  data-testid={`explore-course-card-${course.id}`}
                  className="flex flex-col justify-between rounded-xl border border-stone-200 bg-stone-50/70 p-3 shadow-2xs transition-all hover:border-red-300 hover:bg-white"
                >
                  <div>
                    {/* Cover Thumbnail + Status Badge */}
                    <div className="relative mb-2.5 h-28 w-full overflow-hidden rounded-lg bg-gradient-to-br from-red-950 via-red-900 to-stone-900">
                      {course.thumb ? (
                        <img
                          src={course.thumb}
                          alt={course.title}
                          loading="lazy"
                          className="h-full w-full object-cover opacity-90"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center px-3 text-center">
                          <span className="font-display text-xs font-extrabold text-amber-200">
                            {course.badge || course.shortTitle || course.title}
                          </span>
                        </div>
                      )}
                      <span
                        data-testid={`course-unentitled-badge-${course.id}`}
                        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md bg-stone-950/85 px-2 py-0.5 text-[10px] font-bold text-amber-300"
                      >
                        <Lock className="h-2.5 w-2.5" />
                        Chưa mở
                      </span>
                      <span className="absolute bottom-2 left-2 rounded-md bg-white/95 px-2 py-0.5 text-[10px] font-extrabold text-stone-900">
                        {course.lessonsCount || 15} bài học
                      </span>
                    </div>

                    <h3
                      data-testid={`explore-course-title-${course.id}`}
                      className="font-display text-xs font-bold text-stone-900 sm:text-sm"
                    >
                      {course.title}
                    </h3>

                    <p
                      data-testid={`explore-course-desc-${course.id}`}
                      className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-stone-600"
                    >
                      {course.description ||
                        'Giáo trình chuẩn quốc tế kèm bài giảng video tương tác và luyện phát âm cùng giáo viên Khổng Tử Nhí.'}
                    </p>
                  </div>

                  <div className="mt-3 border-t border-stone-200/80 pt-2.5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-[11px] font-semibold text-stone-500">
                        Học phí trọn khóa:
                      </span>
                      <span
                        data-testid={`explore-course-price-${course.id}`}
                        className="font-display text-sm font-extrabold text-red-800"
                      >
                        {formatVnd(course.price || 890000)}
                      </span>
                    </div>

                    <div className="mt-2 grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        data-testid={`watch-demo-course-btn-${course.id}`}
                        onClick={() => openDemoVideoModal(course)}
                        className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-xl border border-stone-300 bg-white px-2.5 py-1.5 text-xs font-bold text-stone-800 hover:bg-stone-100"
                      >
                        <PlayCircle className="h-3.5 w-3.5 text-red-800" />
                        <span>Xem học thử</span>
                      </button>

                      <button
                        type="button"
                        data-testid={`register-course-btn-${course.id}`}
                        onClick={() => openRegistrationModal(course)}
                        className="inline-flex min-h-[36px] items-center justify-center gap-1 rounded-xl bg-red-800 px-2.5 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
                      >
                        <Sparkles className="h-3.5 w-3.5" />
                        <span>Đăng ký khóa học</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* PHASE 4.2: DEMO VIDEO MODAL */}
      {demoModalCourse && (
        <div
          data-testid="course-demo-video-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-3 sm:p-4"
          onClick={() => setDemoModalCourse(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-2xl overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="rounded-md bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                    Học thử miễn phí
                  </span>
                  {demoModalCourse.demoVideoUrl && (
                    <span
                      data-testid="course-demo-duration-badge"
                      className="rounded-md bg-stone-100 px-2 py-0.5 text-[10px] font-bold text-stone-700"
                    >
                      Thời lượng học thử: {demoModalCourse.demoDurationSeconds || 90} giây
                    </span>
                  )}
                </div>
                <h3 className="mt-0.5 truncate font-display text-sm font-bold text-stone-900">
                  {demoModalCourse.title}
                </h3>
              </div>
              <button
                type="button"
                data-testid="close-demo-modal-btn"
                onClick={() => setDemoModalCourse(null)}
                aria-label="Đóng học thử"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-3.5 sm:p-4">
              {demoModalCourse.demoVideoUrl ? (
                <div className="relative">
                  <HlsVideoPlayer
                    lessonTitle={
                      demoModalCourse.lessonSample || 'Bài 1: Bài giảng học thử'
                    }
                    courseName={demoModalCourse.title}
                    streamUrl={demoModalCourse.demoVideoUrl}
                    isCompleted={false}
                    onMarkCompleted={() => {}}
                    onRetryStream={() => setDemoEnded(false)}
                    maxDemoSeconds={demoModalCourse.demoDurationSeconds || 90}
                    onDemoEnded={() => setDemoEnded(true)}
                  />

                  {demoEnded && (
                    <div
                      data-testid="course-demo-ended-cta"
                      className="absolute inset-0 z-30 flex flex-col items-center justify-center rounded-2xl bg-stone-950/90 p-6 text-center text-white"
                    >
                      <Sparkles className="h-8 w-8 text-amber-400" />
                      <h4 className="mt-2 font-display text-base font-bold">
                        Đã hết thời lượng xem học thử ({demoModalCourse.demoDurationSeconds || 90} giây)
                      </h4>
                      <p className="mt-1 max-w-md text-xs text-stone-300">
                        Đăng ký mở khóa trọn bộ {demoModalCourse.lessonsCount || 15} bài giảng video, file nghe MP3 và được giáo viên chấm chữa bài tập từng buổi!
                      </p>
                      <button
                        type="button"
                        data-testid="demo-ended-register-btn"
                        onClick={() => {
                          const target = demoModalCourse;
                          setDemoModalCourse(null);
                          openRegistrationModal(target);
                        }}
                        className="mt-4 inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-extrabold text-stone-950 hover:bg-amber-400"
                      >
                        <Sparkles className="h-4 w-4" />
                        <span>Đăng ký khóa học ngay ({formatVnd(demoModalCourse.price || 890000)})</span>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  data-testid="course-demo-unavailable"
                  className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-6 text-center"
                >
                  <AlertCircle className="mx-auto h-8 w-8 text-amber-700" />
                  <h4 className="mt-2 font-display text-sm font-bold text-stone-900">
                    Chưa có bài học thử
                  </h4>
                  <p className="mt-1 text-xs text-stone-600">
                    Khóa học này hiện chưa có video học thử công khai. Em có thể đăng ký khóa học để Học vụ tư vấn lộ trình chi tiết.
                  </p>
                </div>
              )}

              <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-3">
                <div className="text-xs">
                  <span className="text-stone-500">Học phí trọn khóa: </span>
                  <strong className="font-display text-sm font-extrabold text-red-800">
                    {formatVnd(demoModalCourse.price || 890000)}
                  </strong>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setDemoModalCourse(null)}
                    className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-700"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    data-testid="demo-modal-open-register-btn"
                    onClick={() => {
                      const target = demoModalCourse;
                      setDemoModalCourse(null);
                      openRegistrationModal(target);
                    }}
                    className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    <span>Đăng ký khóa học</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PHASE 4.3 & 4.4: IN-APP COURSE REGISTRATION & VIETQR PAYMENT MODAL */}
      {registerModalCourse && (
        <div
          data-testid="course-registration-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-stone-950/75 p-3 sm:p-4"
          onClick={() => setRegisterModalCourse(null)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-stone-200 bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 border-b border-stone-200 px-4 py-3">
              <div>
                <span className="rounded-md bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-900">
                  Đăng ký mở khóa học phần
                </span>
                <h3 className="mt-0.5 font-display text-sm font-bold text-stone-900">
                  {registerModalCourse.title}
                </h3>
              </div>
              <button
                type="button"
                data-testid="close-registration-modal-btn"
                onClick={() => setRegisterModalCourse(null)}
                aria-label="Đóng cửa sổ đăng ký khóa học"
                className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-200 text-stone-600 hover:bg-stone-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {!activeCreatedOrder ? (
              <form
                data-testid="course-registration-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  createStudentOrderMutation.mutate();
                }}
                className="space-y-3 p-4 text-xs"
              >
                {regError && (
                  <div
                    role="alert"
                    data-testid="course-registration-error"
                    className="rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs font-semibold text-red-900"
                  >
                    {regError}
                  </div>
                )}

                <div className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div>
                    <p className="font-bold text-stone-900">
                      {registerModalCourse.title}
                    </p>
                    <p className="text-[11px] text-stone-500">
                      {registerModalCourse.lessonsCount || 15} bài giảng · Cấp quyền trên tài khoản đang đăng nhập
                    </p>
                  </div>
                  <span
                    data-testid="reg-modal-course-price"
                    className="font-display text-base font-extrabold text-red-800"
                  >
                    {formatVnd(registerModalCourse.price || 890000)}
                  </span>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Email tài khoản học viên (Chỉ đọc)
                    </label>
                    <input
                      type="email"
                      readOnly
                      data-testid="reg-student-email-readonly"
                      value={user?.email || ''}
                      className="mt-1 w-full cursor-not-allowed rounded-xl border border-stone-200 bg-stone-100 px-3 py-1.5 text-xs font-bold text-stone-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Họ tên học viên
                    </label>
                    <input
                      type="text"
                      readOnly={Boolean(studentMeQuery.data?.name || user?.name)}
                      data-testid="reg-student-name-input"
                      value={regStudentName}
                      onChange={(e) => setRegStudentName(e.target.value)}
                      className={`mt-1 w-full rounded-xl border px-3 py-1.5 text-xs font-bold ${
                        studentMeQuery.data?.name || user?.name
                          ? 'border-stone-200 bg-stone-100 text-stone-700'
                          : 'border-stone-300 bg-white text-stone-900'
                      }`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Số điện thoại / Zalo phụ huynh *
                    </label>
                    <input
                      type="tel"
                      required
                      data-testid="reg-parent-phone-input"
                      value={regParentPhone}
                      onChange={(e) => setRegParentPhone(e.target.value)}
                      placeholder="VD: 0912345678"
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 font-mono text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-stone-700">
                      Tên phụ huynh / Người liên hệ
                    </label>
                    <input
                      type="text"
                      data-testid="reg-parent-name-input"
                      value={regParentName}
                      onChange={(e) => setRegParentName(e.target.value)}
                      placeholder="VD: Chị Hương (Mẹ bé)"
                      className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-900 focus:border-red-800 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[11px] font-bold text-stone-700">
                    Ghi chú cho Học vụ (tùy chọn)
                  </label>
                  <input
                    type="text"
                    data-testid="reg-note-input"
                    value={regNote}
                    onChange={(e) => setRegNote(e.target.value)}
                    placeholder="VD: Nhờ cô tư vấn thêm lịch học tối..."
                    className="mt-1 w-full rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                  />
                </div>

                <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-[11px] text-stone-700">
                  <input
                    type="checkbox"
                    data-testid="reg-update-profile-phone-checkbox"
                    checked={regUpdateProfilePhone}
                    onChange={(e) => setRegUpdateProfilePhone(e.target.checked)}
                    className="mt-0.5 rounded border-stone-300 text-red-800"
                  />
                  <span>
                    Đồng thời cập nhật số điện thoại liên hệ này vào hồ sơ học viên của em (nếu không chọn, hồ sơ gốc giữ nguyên số cũ).
                  </span>
                </label>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setRegisterModalCourse(null)}
                    className="min-h-[38px] rounded-xl border border-stone-300 px-3.5 py-1.5 text-xs font-bold text-stone-700"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    data-testid="reg-submit-order-btn"
                    disabled={createStudentOrderMutation.isPending}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-1.5 text-xs font-extrabold text-white shadow-sm hover:bg-red-900 disabled:opacity-50"
                  >
                    {createStudentOrderMutation.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <CreditCard className="h-4 w-4" />
                    )}
                    <span>Tạo đơn đăng ký khóa học</span>
                  </button>
                </div>
              </form>
            ) : (
              /* Order Created Confirmation & VietQR View (Phase 4.4) */
              <div
                data-testid="course-order-confirmation-view"
                className="space-y-3.5 p-4 text-xs"
              >
                <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-emerald-950">
                  <p
                    data-testid="student-order-pending-headline"
                    className="flex items-center gap-1.5 font-display text-sm font-extrabold text-emerald-900"
                  >
                    <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                    Đơn của em đang chờ xác nhận.
                  </p>
                  <p className="mt-1 text-[11px]">
                    Mã đơn:{' '}
                    <strong
                      data-testid="student-created-order-id"
                      className="font-mono text-red-900"
                    >
                      {activeCreatedOrder.order.order_id}
                    </strong>{' '}
                    · Tài khoản nhận khóa học:{' '}
                    <strong>{activeCreatedOrder.order.student_email}</strong>
                  </p>
                </div>

                {/* 7-Stage Progress Tracker */}
                <div className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <p className="text-[11px] font-bold text-stone-700">
                    Trạng thái xử lý đơn hàng:
                  </p>
                  <div
                    data-testid="student-order-7stage-list"
                    className="flex flex-wrap gap-1.5"
                  >
                    {STUDENT_TRACKER_STAGES.map((st) => {
                      const currentStage =
                        activeCreatedOrder.order.student_tracker_stage || 'received';
                      const isCurrent = st.id === currentStage;
                      return (
                        <span
                          key={st.id}
                          data-testid={`student-tracker-pill-${st.id}`}
                          className={`rounded-lg px-2 py-1 text-[10px] font-bold ${
                            isCurrent
                              ? 'bg-red-800 text-white shadow-2xs'
                              : 'border border-stone-200 bg-white text-stone-600'
                          }`}
                        >
                          {st.label}
                        </span>
                      );
                    })}
                  </div>
                </div>

                {/* VietQR Payment Box */}
                {activeCreatedOrder.paymentInfo && (
                  <div
                    data-testid="student-vietqr-payment-box"
                    className="rounded-xl border border-stone-200 bg-white p-3"
                  >
                    <p className="font-bold text-stone-900">
                      Thông tin chuyển khoản học phí qua VietQR:
                    </p>
                    <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row">
                      <img
                        src={activeCreatedOrder.paymentInfo.qrUrl}
                        alt="VietQR Học viện Khổng Tử Nhí"
                        className="h-36 w-36 shrink-0 rounded-xl border border-stone-200 object-contain p-1"
                      />
                      <div className="w-full space-y-1 text-[11px] text-stone-700">
                        <p>
                          Ngân hàng:{' '}
                          <strong className="text-stone-900">
                            {activeCreatedOrder.paymentInfo.bankName}
                          </strong>
                        </p>
                        <p>
                          Số tài khoản:{' '}
                          <strong className="font-mono text-stone-900">
                            {activeCreatedOrder.paymentInfo.accountNumber}
                          </strong>
                        </p>
                        <p>
                          Chủ tài khoản:{' '}
                          <strong className="text-stone-900">
                            {activeCreatedOrder.paymentInfo.accountName}
                          </strong>
                        </p>
                        <p>
                          Số tiền:{' '}
                          <strong className="font-display text-xs font-extrabold text-red-800">
                            {formatVnd(activeCreatedOrder.paymentInfo.amount)}
                          </strong>
                        </p>
                        <div className="flex items-center justify-between rounded-lg bg-amber-50 px-2.5 py-1.5">
                          <span>
                            Nội dung CK:{' '}
                            <strong className="font-mono text-red-900">
                              {activeCreatedOrder.paymentInfo.transferContent}
                            </strong>
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              navigator.clipboard
                                ?.writeText(
                                  activeCreatedOrder.paymentInfo!.transferContent
                                )
                                .catch(() => {});
                              addToast({
                                title: 'Đã sao chép nội dung chuyển khoản!',
                                variant: 'success',
                              });
                            }}
                            className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-bold text-red-800 shadow-2xs"
                          >
                            <Copy className="h-3 w-3" />
                            Sao chép
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Customer Self-Reported Transfer Action */}
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-stone-100 pt-2.5">
                      <input
                        type="text"
                        data-testid="student-report-tx-input"
                        value={reportTxRefInput}
                        onChange={(e) => setReportTxRefInput(e.target.value)}
                        placeholder="Mã giao dịch ngân hàng (nếu có)..."
                        className="flex-1 rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 font-mono text-xs"
                      />
                      <button
                        type="button"
                        data-testid="student-report-payment-btn"
                        disabled={
                          reportPaymentMutation.isPending ||
                          activeCreatedOrder.order.payment_detailed_status ===
                            'customer_reported' ||
                          activeCreatedOrder.order.payment_status === 'paid'
                        }
                        onClick={() =>
                          reportPaymentMutation.mutate({
                            orderId: activeCreatedOrder.order.order_id,
                            paymentTxRef: reportTxRefInput.trim() || undefined,
                          })
                        }
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-amber-600 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50"
                      >
                        <ShieldCheck className="h-4 w-4" />
                        <span>
                          {activeCreatedOrder.order.payment_detailed_status ===
                          'customer_reported'
                            ? 'Đã báo chuyển khoản (Chờ Học vụ đối soát)'
                            : 'Em / Phụ huynh đã chuyển khoản'}
                        </span>
                      </button>
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <button
                    type="button"
                    data-testid="student-close-confirmation-btn"
                    onClick={() => setRegisterModalCourse(null)}
                    className="min-h-[36px] rounded-xl bg-stone-800 px-4 py-1.5 text-xs font-bold text-white"
                  >
                    Đóng
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
