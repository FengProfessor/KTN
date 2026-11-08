import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  PlayCircle,
  CheckCircle2,
  BookOpen,
  Headphones,
  FileCheck2,
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
  const [activeTab, setActiveTab] = useState<'overview' | 'audio' | 'homework'>(() => {
    const t = searchParams.get('tab');
    return t === 'homework' || t === 'audio' ? t : 'overview';
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
    nextTab?: 'overview' | 'audio' | 'homework'
  ) => {
    const next = new URLSearchParams(searchParams);
    next.set('courseId', nextCourseId);
    next.set('lesson', String(nextLessonNum));
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
    const tab = searchParams.get('tab');
    if (cid) setSelectedCourseId(cid);
    if (Number.isFinite(lnum) && lnum > 0) setSelectedLessonNum(lnum);
    if (tab === 'homework' || tab === 'audio' || tab === 'overview') {
      setActiveTab(tab);
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

  const isCourseEntitled = (courseId: string): boolean => {
    if (user?.role === 'teacher' || user?.role === 'admin') return true;
    const userCourseIds = (user?.onlineCourses || []).map((c) => c.id);
    if (userCourseIds.includes(courseId)) return true;
    if (isDemoMode && userCourseIds.length === 0) {
      return courseId === DEMO_COURSES[0]?.id;
    }
    return false;
  };

  const myEntitledCourses = useMemo(
    () =>
      disambiguateCatalogCourses(
        coursesList.filter((c) => isCourseEntitled(c.id))
      ),
    [coursesList, user, isDemoMode]
  );

  const exploreUnentitledCourses = useMemo(
    () =>
      disambiguateCatalogCourses(
        coursesList.filter((c) => !isCourseEntitled(c.id))
      ),
    [coursesList, user, isDemoMode]
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

  const activeLesson: KtnLessonUnit | null = useMemo(() => {
    if (lessons.length === 0) return null;
    return (
      lessons.find((l) => Number(l.num) === Number(selectedLessonNum)) ||
      lessons[0] ||
      null
    );
  }, [lessons, selectedLessonNum]);

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
    return (
      list.find(
        (h) =>
          String(h.course_id) === String(activeCourse.id) &&
          Number(h.lesson_num) === Number(activeLesson.num)
      ) || null
    );
  }, [homeworksQuery.data, activeCourse.id, activeLesson, isDemoMode, videoDemoScenario]);

  // 4. Submit Homework Mutation (Presigned S3 Upload + POST /api/ktn/homeworks)
  const submitHomeworkMutation = useMutation({
    mutationFn: async (params: { file: File | Blob; fileName: string; note: string }) => {
      if (!activeLesson) throw new Error('Chưa chọn bài học');

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 450));
        return {
          homework: {
            ...DEMO_HOMEWORKS[0],
            id: `demo_hw_${Date.now()}`,
            lesson_num: activeLesson.num,
            lesson_title: activeLesson.title,
            student_note: params.note,
            status: 'pending' as const,
            submitted_at: new Date().toISOString(),
          },
          syncStatus: 'synced',
        };
      }

      const uploaded = await ktnApi.uploadHomeworkFile(params.file, params.fileName);

      return ktnApi.submitHomework({
        courseId: activeCourse.id,
        classCode: user?.classCode || '',
        lessonNum: activeLesson.num,
        lessonTitle: activeLesson.title,
        unitId: activeLesson._id || activeLesson.id || null,
        fileUrl: uploaded.fileUrl,
        fileType: uploaded.fileType,
        studentNote: params.note,
        attachments: [
          {
            title: params.fileName,
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
        description: 'Bài làm của con đã được gửi tới Lão sư chủ nhiệm.',
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

  const lessonKey = `${activeCourse.id}:${activeLesson?.num || 1}`;
  const isCurrentLessonCompleted = Boolean(completedLessons[lessonKey]);

  const handleToggleCompleted = () => {
    if (!activeLesson) return;
    toggleLessonCompleted(activeCourse.id, activeLesson.num);
    addToast({
      title: !isCurrentLessonCompleted
        ? 'Tuyệt vời! Đã hoàn thành bài học 🎉'
        : 'Đã bỏ đánh dấu hoàn thành bài học',
      variant: 'success',
    });
  };

  const completedCount = lessons.filter(
    (l) => completedLessons[`${activeCourse.id}:${l.num}`]
  ).length;

  const myOrdersList = myOrdersQuery.data || [];

  return (
    <div data-testid="video-learning-page" className="space-y-3 sm:space-y-4">
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

      {/* Course Selector Header (Compact on mobile — Khóa của em prioritized first) */}
      <div
        data-testid="learning-course-switcher-header"
        className="space-y-2 rounded-xl border border-stone-200 bg-white px-3 py-2.5 shadow-2xs sm:flex sm:items-center sm:justify-between sm:space-y-0 sm:px-4 sm:py-3"
      >
        <div className="flex min-w-0 items-center justify-between gap-2">
          <h1 className="truncate font-display text-sm font-bold text-stone-900 sm:text-base">
            {activeCourse.title}
          </h1>
          <span className="shrink-0 rounded-full bg-stone-100 px-2 py-0.5 text-[11px] font-bold text-stone-700">
            {completedCount}/{lessons.length} bài
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
                    syncUrlParams(course.id, 1, activeTab);
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
        {/* Left Column: Video Player & Lesson Content Tabs */}
        <div className="space-y-3 sm:space-y-4 lg:col-span-8">
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

          {/* Mobile Lesson Drawer Trigger & Content Tabs (Only when entitled and lessons exist) */}
          {activeLesson && playerStatusOverride !== 'unentitled' && (
            <>
              <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3 py-2 lg:hidden">
                <div className="min-w-0">
                  <p className="text-[11px] font-bold uppercase text-red-800">
                    Bài {activeLesson.num}/{lessons.length}
                  </p>
                  <p className="truncate text-xs font-semibold text-stone-900">
                    {activeLesson.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setMobileLessonDrawerOpen((prev) => !prev)}
                  className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-lg bg-stone-100 px-2.5 py-1.5 text-xs font-bold text-stone-800"
                >
                  <ListVideo className="h-3.5 w-3.5 text-red-800" />
                  <span>Chọn bài ({lessons.length})</span>
                </button>
              </div>

              {mobileLessonDrawerOpen && (
                <div className="rounded-2xl border border-stone-200 bg-white p-2.5 lg:hidden">
                  <div className="max-h-56 space-y-1 overflow-y-auto">
                    {lessons.map((lesson) => {
                      const isSelected = Number(lesson.num) === Number(activeLesson.num);
                      const done = Boolean(
                        completedLessons[`${activeCourse.id}:${lesson.num}`]
                      );
                      return (
                        <button
                          key={lesson._id || lesson.num}
                          type="button"
                          onClick={() => {
                            setSelectedLessonNum(lesson.num);
                            syncUrlParams(activeCourse.id, lesson.num, activeTab);
                            setMobileLessonDrawerOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-xs ${
                            isSelected
                              ? 'bg-red-50 font-bold text-red-900'
                              : 'text-stone-700 hover:bg-stone-50'
                          }`}
                        >
                          <span className="truncate">{lesson.title}</span>
                          {done && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Lesson Navigation Tabs: Nội dung / MP3 / Bài tập / Hỏi GV */}
              <div className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4 shadow-2xs">
                <div className="flex items-center justify-between gap-1.5 overflow-x-auto border-b border-stone-200 pb-2">
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      data-testid="tab-lesson-overview"
                      onClick={() => {
                        setActiveTab('overview');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'overview');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'overview'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <BookOpen className="h-3.5 w-3.5" />
                      <span>Nội dung</span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-audio"
                      onClick={() => {
                        setActiveTab('audio');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'audio');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'audio'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <Headphones className="h-3.5 w-3.5" />
                      <span>MP3 ({activeLesson.audioTracks?.length || 0})</span>
                    </button>

                    <button
                      type="button"
                      data-testid="tab-lesson-homework"
                      onClick={() => {
                        setActiveTab('homework');
                        syncUrlParams(activeCourse.id, activeLesson.num, 'homework');
                      }}
                      className={`inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                        activeTab === 'homework'
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                      }`}
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      <span>Bài tập</span>
                      {currentLessonHomework?.status === 'graded' && (
                        <span className="rounded-full bg-emerald-600 px-1.5 py-0.2 text-[10px] text-white">
                          {currentLessonHomework.score}đ
                        </span>
                      )}
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

                {/* Tab 1: Overview */}
                {activeTab === 'overview' && (
                  <div className="mt-2.5 space-y-2.5">
                    <div>
                      <h2
                        data-testid="active-lesson-title"
                        className="font-display text-sm font-bold text-stone-900 sm:text-base"
                      >
                        {activeLesson.title}
                      </h2>
                      <p className="mt-1 line-clamp-2 text-xs leading-relaxed text-stone-600">
                        {activeLesson.grammar ||
                          'Xem video bài giảng, luyện nghe phát âm chuẩn và gửi bản thu âm bài tập.'}
                      </p>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-stone-500">
                          SGK • Tr.{activeLesson.sgkPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Đọc theo bài
                        </p>
                      </div>
                      <div className="rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-stone-500">
                          SBT • Tr.{activeLesson.sbtPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Nghe MP3
                        </p>
                      </div>
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-2.5 py-2">
                        <span className="block text-[10px] font-bold uppercase text-amber-900">
                          Viết • Tr.{activeLesson.voVietPage || 1}
                        </span>
                        <p className="mt-0.5 text-[11px] font-semibold text-stone-800">
                          Thu âm nộp
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Audio Tracks */}
                {activeTab === 'audio' && (
                  <div className="mt-2.5 space-y-2">
                    {!activeLesson.audioTracks || activeLesson.audioTracks.length === 0 ? (
                      <p className="py-3 text-center text-xs text-stone-500">
                        Âm thanh đã tích hợp trực tiếp trong video bài giảng.
                      </p>
                    ) : (
                      activeLesson.audioTracks.map((audio, idx) => (
                        <div
                          key={idx}
                          className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5"
                        >
                          <div className="flex items-center gap-2">
                            <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-red-800 text-white">
                              <Volume2 className="h-3.5 w-3.5" />
                            </span>
                            <p className="text-xs font-bold text-stone-900">{audio.name}</p>
                          </div>
                          <audio
                            controls
                            preload="none"
                            src={audio.url}
                            className="h-8 max-w-xs"
                          />
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab 3: Homework */}
                {activeTab === 'homework' && (
                  <div className="mt-2.5">
                    <HomeworkPanel
                      key={`${activeCourse.id}:${activeLesson.num}`}
                      courseId={activeCourse.id}
                      lessonNum={activeLesson.num}
                      lessonTitle={activeLesson.title}
                      classCode={user?.classCode || ''}
                      existingSubmission={currentLessonHomework}
                      isSubmitting={submitHomeworkMutation.isPending}
                      onSubmitHomework={async (params) => {
                        await submitHomeworkMutation.mutateAsync(params);
                      }}
                    />
                  </div>
                )}
              </div>

              {activeTab !== 'homework' && (
                <div className="hidden lg:block">
                  <HomeworkPanel
                    key={`${activeCourse.id}:${activeLesson.num}`}
                    courseId={activeCourse.id}
                    lessonNum={activeLesson.num}
                    lessonTitle={activeLesson.title}
                    classCode={user?.classCode || ''}
                    existingSubmission={currentLessonHomework}
                    isSubmitting={submitHomeworkMutation.isPending}
                    onSubmitHomework={async (params) => {
                      await submitHomeworkMutation.mutateAsync(params);
                    }}
                  />
                </div>
              )}
            </>
          )}
        </div>

        {/* Right Column: Curriculum Lesson List Sidebar */}
        <aside className="hidden lg:block lg:col-span-4">
          <div className="sticky top-4 flex max-h-[calc(100vh-6rem)] flex-col overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs">
            <div className="border-b border-stone-200 bg-stone-50/80 p-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display text-sm font-bold text-stone-900">
                  Danh sách bài giảng ({lessons.length})
                </h2>
                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                  Hoàn thành {completedCount}/{lessons.length}
                </span>
              </div>

              <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-stone-200">
                <div
                  className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                  style={{
                    width: `${
                      lessons.length > 0
                        ? Math.round((completedCount / lessons.length) * 100)
                        : 0
                    }%`,
                  }}
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-stone-100 p-2">
              {lessons.map((lesson, idx) => {
                const isSelected = Number(lesson.num) === Number(activeLesson?.num);
                const isDone = Boolean(
                  completedLessons[`${activeCourse.id}:${lesson.num}`]
                );

                return (
                  <button
                    key={lesson._id || lesson.num}
                    type="button"
                    data-testid={`lesson-sidebar-item-${lesson.num}`}
                    onClick={() => {
                      setSelectedLessonNum(lesson.num);
                      syncUrlParams(activeCourse.id, lesson.num, activeTab);
                    }}
                    className={`flex w-full items-start gap-3 rounded-xl p-3 text-left transition-all ${
                      isSelected
                        ? 'bg-red-50/95 ring-1 ring-red-200'
                        : 'hover:bg-stone-50'
                    }`}
                  >
                    <div
                      className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${
                        isDone
                          ? 'bg-emerald-600 text-white'
                          : isSelected
                          ? 'bg-red-800 text-white'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {isDone ? (
                        <CheckCircle2 className="h-4 w-4" />
                      ) : isSelected ? (
                        <PlayCircle className="h-4 w-4" />
                      ) : (
                        idx + 1
                      )}
                    </div>

                    <div className="min-w-0 flex-1">
                      <p
                        className={`text-xs leading-snug ${
                          isSelected ? 'font-bold text-red-950' : 'font-semibold text-stone-800'
                        }`}
                      >
                        {lesson.title}
                      </p>
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-stone-500">
                        <span>{lesson.duration || '12:00'}</span>
                        {lesson.audioTracks && lesson.audioTracks.length > 0 && (
                          <span>• {lesson.audioTracks.length} file nghe</span>
                        )}
                        {isDone && (
                          <span className="font-semibold text-emerald-700">• Đã học</span>
                        )}
                      </div>
                    </div>

                    <ChevronRight
                      className={`mt-1 h-4 w-4 shrink-0 ${
                        isSelected ? 'text-red-800' : 'text-stone-300'
                      }`}
                    />
                  </button>
                );
              })}
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
