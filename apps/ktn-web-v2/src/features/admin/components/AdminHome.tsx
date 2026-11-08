import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  GraduationCap,
  ClipboardList,
  ShieldCheck,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES } from '@/lib/demoData';
import { formatVnd } from '@/lib/utils';
import { KtnClassItem, KtnOrder, KtnStudentRecord } from '@/types/ktn.types';
import {
  QuickActionTile,
  SectionHeading,
  CompactListItem,
  MobileTaskList,
  EmptyState,
} from '@/components/shared/CompactUi';

export const AdminHome: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

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

  const studentsQuery = useQuery<{ items: KtnStudentRecord[]; totalCount: number }>({
    queryKey: ['ktn-admin-students', 'home-unassigned', user?.email, isDemoMode],
    queryFn: async ({ signal }) => {
      if (isDemoMode) {
        return {
          items: [
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
          ],
          totalCount: 1,
        };
      }
      const res = await ktnApi.searchStudents(
        { classCode: 'NONE', limit: 20, offset: 0 },
        signal
      );
      const items = res.items || res.students || [];
      return {
        items,
        totalCount: Number.isFinite(res.totalCount) ? res.totalCount : items.length,
      };
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
        await new Promise((r) => setTimeout(r, 300));
        return { message: 'Approved', studentEmail: 'giahan@khongtunhi.com' };
      }
      return ktnApi.approveOrder(orderId);
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

  const ordersList = ordersQuery.data || [];
  const studentsList = studentsQuery.data?.items || [];
  const classesList = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];

  const pendingOrders = ordersList.filter((o) => o.approval_status === 'pending');
  const unassignedStudents = studentsList.filter((s) => !s.class_code);
  const unassignedTotalCount = studentsQuery.data?.totalCount ?? unassignedStudents.length;
  const activeClasses = classesList.filter((c) => c.active !== false);

  const hasApiError =
    !isDemoMode &&
    (ordersQuery.isError || studentsQuery.isError || classesQuery.isError);

  return (
    <div
      data-testid="admin-home-page"
      data-role-home="admin"
      className="space-y-3 sm:space-y-4"
    >
      {/* Compact 3-Metric Summary Strip */}
      <section
        data-testid="admin-compact-summary"
        className="grid grid-cols-3 gap-2 sm:gap-3"
      >
        <button
          type="button"
          onClick={() => navigate('/admin/orders')}
          className="rounded-xl border border-stone-200/90 bg-white p-2.5 text-left shadow-2xs transition-colors hover:border-red-300"
        >
          <p className="truncate text-[11px] font-semibold text-stone-500">
            Đơn chờ duyệt
          </p>
          <p
            data-testid="admin-kpi-pending-orders"
            className="mt-0.5 font-display text-lg font-extrabold text-red-800 sm:text-xl"
          >
            {ordersQuery.isLoading ? '...' : pendingOrders.length}
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/admin/students')}
          className="rounded-xl border border-stone-200/90 bg-white p-2.5 text-left shadow-2xs transition-colors hover:border-amber-300"
        >
          <p className="truncate text-[11px] font-semibold text-stone-500">
            Chưa xếp lớp
          </p>
          <p
            data-testid="admin-kpi-unassigned-students"
            className="mt-0.5 font-display text-lg font-extrabold text-amber-700 sm:text-xl"
          >
            {studentsQuery.isLoading ? '...' : unassignedTotalCount}
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/admin/classes')}
          className="rounded-xl border border-stone-200/90 bg-white p-2.5 text-left shadow-2xs transition-colors hover:border-emerald-300"
        >
          <p className="truncate text-[11px] font-semibold text-stone-500">
            Lớp hoạt động
          </p>
          <p
            data-testid="admin-kpi-active-classes"
            className="mt-0.5 font-display text-lg font-extrabold text-emerald-700 sm:text-xl"
          >
            {classesQuery.isLoading ? '...' : activeClasses.length}
          </p>
        </button>
      </section>

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
              studentsQuery.refetch();
              classesQuery.refetch();
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-[11px] font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Quick Actions 2x2 Grid */}
      <section
        data-testid="admin-quick-actions"
        className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
      >
        <QuickActionTile
          icon={Users}
          label="Học viên"
          status={`${unassignedTotalCount} chưa xếp lớp`}
          accent="red"
          testId="admin-quick-students"
          onClick={() => navigate('/admin/students')}
        />

        <QuickActionTile
          icon={GraduationCap}
          label="Lớp học"
          status={`${classesList.length} lớp`}
          accent="blue"
          testId="admin-quick-classes"
          onClick={() => navigate('/admin/classes')}
        />

        <QuickActionTile
          icon={ClipboardList}
          label="Đơn hàng"
          status={
            pendingOrders.length > 0
              ? `${pendingOrders.length} chờ duyệt`
              : `${ordersList.length} đơn`
          }
          badgeCount={pendingOrders.length}
          accent="amber"
          testId="admin-quick-orders"
          onClick={() => navigate('/admin/orders')}
        />

        <QuickActionTile
          icon={ShieldCheck}
          label="Đồng bộ"
          status="Đối soát 3 hệ thống"
          accent="emerald"
          testId="admin-quick-permissions"
          onClick={() => navigate('/admin/more')}
        />
      </section>

      {/* Việc cần xử lý: Đơn chờ duyệt & Học viên chưa xếp lớp */}
      <section className="space-y-2">
        <SectionHeading
          title="Việc cần xử lý"
          count={pendingOrders.length + unassignedTotalCount}
          actionLabel="Mở đơn hàng →"
          onAction={() => navigate('/admin/orders')}
        />

        {pendingOrders.length === 0 && unassignedStudents.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title="Đã xử lý hết công việc"
            description="Không có đơn đăng ký tồn đọng hoặc học viên chờ xếp lớp."
          />
        ) : (
          <MobileTaskList testId="admin-action-queue">
            {ordersList.map((ord) => {
              const payLabel =
                ord.payment_detailed_status === 'verified_paid' ||
                ord.payment_status === 'paid'
                  ? 'Đã xác minh tiền thực nhận'
                  : ord.payment_detailed_status === 'customer_reported'
                  ? 'Khách báo đã chuyển khoản'
                  : ord.payment_detailed_status === 'verifying_tx'
                  ? 'Chờ kiểm tra giao dịch'
                  : 'Chưa thanh toán';
              return (
                <CompactListItem
                  key={ord.order_id}
                  unread={ord.approval_status === 'pending'}
                  onClick={() =>
                    navigate(`/admin/orders?orderId=${encodeURIComponent(ord.order_id)}`)
                  }
                  icon={
                    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
                      <ClipboardList className="h-4 w-4" />
                    </div>
                  }
                  title={`${ord.student_name} · ${ord.order_id}`}
                  subtitle={`${ord.course_name} · ${formatVnd(ord.amount)} · ${payLabel}`}
                  rightAction={
                    ord.approval_status === 'approved' ? (
                      <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-[11px] font-bold text-emerald-900">
                        <CheckCircle2 className="h-3.5 w-3.5" />
                        Đã kích hoạt
                      </span>
                    ) : (
                      <button
                        type="button"
                        data-testid={`admin-home-open-order-${ord.order_id}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          navigate(
                            `/admin/orders?orderId=${encodeURIComponent(ord.order_id)}`
                          );
                        }}
                        className="min-h-[36px] rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                      >
                        Xem chi tiết
                      </button>
                    )
                  }
                />
              );
            })}

            {unassignedStudents.slice(0, 4).map((stu) => (
              <CompactListItem
                key={stu.code || stu.email}
                icon={
                  <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-50 text-red-800">
                    <UserPlus className="h-4 w-4" />
                  </div>
                }
                title={stu.name}
                subtitle={`${stu.email} · ${
                  stu.class_code ? `Lớp ${stu.class_code}` : 'Chưa xếp lớp'
                }`}
                rightAction={
                  <button
                    type="button"
                    data-testid={`admin-home-open-student-${stu.email}`}
                    onClick={() =>
                      navigate(`/admin/students?email=${encodeURIComponent(stu.email)}`)
                    }
                    className="min-h-[36px] rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
                  >
                    Xếp lớp
                  </button>
                }
              />
            ))}
          </MobileTaskList>
        )}
      </section>
    </div>
  );
};
