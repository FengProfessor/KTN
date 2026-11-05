import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Users,
  BookOpen,
  CheckCircle2,
  PlusCircle,
  Loader2,
  GraduationCap,
  ClipboardList,
  MessageSquare,
  Bell,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES } from '@/lib/demoData';
import { formatVnd } from '@/lib/utils';
import { KtnClassItem, KtnOrder, KtnStudentRecord } from '@/types/ktn.types';

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
            created_at: new Date().toISOString(),
          },
        ];
      }
      return ktnApi.getOrders();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const studentsQuery = useQuery<KtnStudentRecord[]>({
    queryKey: ['ktn-admin-students', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
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
          },
        ];
      }
      return ktnApi.getStudents();
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

  const approveOrderMutation = useMutation({
    mutationFn: async (orderId: string) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        return { message: 'Approved', studentEmail: 'giahan@khongtunhi.com' };
      }
      return ktnApi.approveOrder(orderId, 'YCT2-04');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-orders'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      addToast({
        title: 'Đã duyệt đơn hàng & kích hoạt khóa học!',
        variant: 'success',
      });
    },
  });

  const updateEntitlementMutation = useMutation({
    mutationFn: async (params: {
      email: string;
      courseId: string;
      classCode: string;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 350));
        return { message: 'Updated' };
      }
      await ktnApi.manageStudentCourses({
        action: 'grant',
        email: params.email,
        courseIds: [params.courseId],
        classCode: params.classCode,
      });
      return { message: 'Updated' };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-admin-students'] });
      addToast({
        title: 'Đã cập nhật quyền khóa học & xếp lớp!',
        variant: 'success',
      });
    },
  });

  const classesList = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
  const ordersList = ordersQuery.data || [];
  const studentsList = studentsQuery.data || [];

  const showOrders = activeTab === 'all' || activeTab === 'orders';
  const showPermissions = activeTab === 'all' || activeTab === 'more';
  const showStudents = activeTab === 'all' || activeTab === 'students';
  const showClasses = activeTab === 'all' || activeTab === 'classes';

  return (
    <div data-testid="admin-workspace-page" className="space-y-3 sm:space-y-4">
      {/* Compact Header & Section Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-3.5 py-2.5 shadow-2xs">
        <h1 className="font-display text-base font-bold text-stone-900 sm:text-lg">
          Tổng quan học vụ
        </h1>

        <div className="flex flex-wrap items-center gap-1">
          {(
            [
              { id: 'all', label: 'Tất cả', to: '/admin' },
              { id: 'students', label: `Học viên (${studentsList.length})`, to: '/admin/students' },
              { id: 'classes', label: `Lớp (${classesList.length})`, to: '/admin/classes' },
              { id: 'orders', label: `Đơn hàng (${ordersList.length})`, to: '/admin/orders' },
              { id: 'more', label: 'Phân quyền & Thêm', to: '/admin/more' },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              data-testid={`admin-tab-${t.id}`}
              onClick={() => navigate(t.to)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                activeTab === t.id
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Orders & Entitlements Grid */}
      {(showOrders || showPermissions) && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          {/* Grant Course & Assign Class Form */}
          {showPermissions && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                updateEntitlementMutation.mutate({
                  email: targetEmail,
                  courseId: targetCourseId,
                  classCode: targetClassCode,
                });
              }}
              className={`space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs ${
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
                    <option value="6adadba969897b0002482ca5">New HSK 1 (3.0)</option>
                    <option value="65e7704a9ea90c00080d5195">Chinese For Kids</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-stone-700">Xếp lớp:</label>
                  <select
                    value={targetClassCode}
                    onChange={(e) => setTargetClassCode(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-stone-300 px-2.5 py-1.5 text-xs font-bold"
                  >
                    {classesList.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.id}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <button
                type="submit"
                data-testid="admin-grant-course-btn"
                disabled={updateEntitlementMutation.isPending}
                className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
              >
                {updateEntitlementMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <PlusCircle className="h-4 w-4" />
                )}
                <span>Cấp quyền & Xếp lớp</span>
              </button>

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

          {/* Orders Queue */}
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
                {ordersList.map((ord) => (
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
                      </div>
                      <p className="mt-0.5 truncate text-xs font-bold text-stone-900">
                        {ord.student_name} · {formatVnd(ord.amount)}
                      </p>
                    </div>

                    {ord.approval_status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Đã kích hoạt
                      </span>
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
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Classes List */}
      {showClasses && (
        <div
          data-testid="admin-classes-section"
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
        >
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
            <GraduationCap className="h-4 w-4 text-red-800" />
            Danh sách lớp học ({classesList.length})
          </h2>
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
                    GV: {cls.teacher_name} · {cls.schedule}
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

      {/* Student Roster: Compact Rows on Mobile, Table on Desktop */}
      {showStudents && (
        <div
          data-testid="admin-students-section"
          className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs"
        >
          <h2 className="flex items-center gap-2 font-display text-sm font-bold text-stone-900">
            <Users className="h-4 w-4 text-red-800" />
            Danh sách học viên ({studentsList.length})
          </h2>

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
                  <th className="pb-2 font-bold">Email</th>
                  <th className="pb-2 font-bold">Lớp trực tiếp</th>
                  <th className="pb-2 font-bold">Khóa học đã mở</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-stone-100">
                {studentsList.map((stu) => (
                  <tr key={stu.code || stu.email}>
                    <td className="py-2.5 font-bold text-stone-900">{stu.name}</td>
                    <td className="py-2.5 text-stone-600">{stu.email}</td>
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
