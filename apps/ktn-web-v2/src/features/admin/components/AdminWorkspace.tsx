import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldCheck,
  Users,
  BookOpen,
  CheckCircle2,
  PlusCircle,
  Loader2,
  Building2,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES } from '@/lib/demoData';
import { KtnClassItem, KtnOrder, KtnStudentRecord } from '@/types/ktn.types';

export const AdminWorkspace: React.FC = () => {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [targetEmail, setTargetEmail] = useState('taphong2002vip@gmail.com');
  const [targetCourseId, setTargetCourseId] = useState('6adadba969897b0002482ca5');
  const [targetClassCode, setTargetClassCode] = useState('YCT2-04');

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
        title: 'Đã cập nhật quyền khóa học & xếp lớp cho học viên!',
        variant: 'success',
      });
    },
  });

  const classesList = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
  const ordersList = ordersQuery.data || [];
  const studentsList = studentsQuery.data || [];

  return (
    <div data-testid="admin-workspace-page" className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <div className="flex items-center gap-3.5">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-stone-900 text-amber-300 shadow-sm">
            <Building2 className="h-6 w-6" />
          </div>
          <div>
            <span className="rounded bg-stone-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-stone-700">
              Cổng Quản Lý & Học Vụ • KTN Admin
            </span>
            <h1 className="mt-0.5 font-display text-lg font-bold text-stone-900 sm:text-xl">
              Quản trị Học viên, Đơn đăng ký & Phân quyền Khóa học
            </h1>
          </div>
        </div>
      </div>

      {/* Grid: Grant Course/Class & Orders */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Left: Grant Course & Assign Class Form (5 cols) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            updateEntitlementMutation.mutate({
              email: targetEmail,
              courseId: targetCourseId,
              classCode: targetClassCode,
            });
          }}
          className="space-y-4 rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:col-span-5"
        >
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-stone-900">
            <ShieldCheck className="h-5 w-5 text-red-800" />
            Cấp quyền Khóa học Video & Xếp lớp trực tiếp
          </h2>

          <div>
            <label className="block text-xs font-bold text-stone-700">Email học viên:</label>
            <input
              type="email"
              value={targetEmail}
              onChange={(e) => setTargetEmail(e.target.value)}
              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-stone-700">Khóa học mở khóa:</label>
              <select
                value={targetCourseId}
                onChange={(e) => setTargetCourseId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
              >
                <option value="6adadba969897b0002482ca5">New HSK 1 (3.0)</option>
                <option value="65e7704a9ea90c00080d5195">Chinese For Kids</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-stone-700">Xếp vào lớp:</label>
              <select
                value={targetClassCode}
                onChange={(e) => setTargetClassCode(e.target.value)}
                className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs font-bold"
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
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2.5 text-xs font-bold text-white hover:bg-red-900"
          >
            {updateEntitlementMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <PlusCircle className="h-4 w-4" />
            )}
            <span>Cấp quyền học phần & Xếp lớp ngay</span>
          </button>
        </form>

        {/* Right: Orders Queue (7 cols) */}
        <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs lg:col-span-7">
          <h2 className="flex items-center gap-2 font-display text-base font-bold text-stone-900">
            <BookOpen className="h-5 w-5 text-amber-700" />
            Đơn đăng ký khóa học ({ordersList.length})
          </h2>

          <div className="mt-4 space-y-3">
            {ordersList.map((ord) => (
              <div
                key={ord.order_id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs font-bold text-red-900">
                      {ord.order_id}
                    </span>
                    <span className="rounded bg-stone-200 px-2 py-0.5 text-[11px] font-bold text-stone-800">
                      {ord.course_name}
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-stone-900">
                    {ord.student_name} ({ord.student_email})
                  </p>
                </div>

                {ord.approval_status === 'approved' ? (
                  <span className="inline-flex items-center gap-1 rounded-xl bg-emerald-100 px-3 py-1.5 text-xs font-bold text-emerald-900">
                    <CheckCircle2 className="h-4 w-4" />
                    Đã kích hoạt
                  </span>
                ) : (
                  <button
                    type="button"
                    data-testid={`admin-approve-order-${ord.order_id}`}
                    onClick={() => approveOrderMutation.mutate(ord.order_id)}
                    className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                  >
                    Duyệt & Mở khóa học
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Student Roster Table */}
      <div className="rounded-2xl border border-stone-200 bg-white p-5 shadow-2xs">
        <h2 className="flex items-center gap-2 font-display text-base font-bold text-stone-900">
          <Users className="h-5 w-5 text-red-800" />
          Danh sách toàn bộ học viên trên hệ thống ({studentsList.length})
        </h2>

        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-stone-200 text-stone-500">
                <th className="pb-2 font-bold">Học viên</th>
                <th className="pb-2 font-bold">Email</th>
                <th className="pb-2 font-bold">Lớp trực tiếp</th>
                <th className="pb-2 font-bold">Khóa học Video đã mở</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {studentsList.map((stu) => (
                <tr key={stu.code || stu.email}>
                  <td className="py-3 font-bold text-stone-900">{stu.name}</td>
                  <td className="py-3 text-stone-600">{stu.email}</td>
                  <td className="py-3">
                    {stu.class_code ? (
                      <span className="rounded-md bg-red-100 px-2 py-0.5 font-bold text-red-900">
                        {stu.class_code}
                      </span>
                    ) : (
                      <span className="text-stone-400">Chưa xếp lớp</span>
                    )}
                  </td>
                  <td className="py-3">
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
                      <span className="text-amber-700 font-semibold">Chưa có khóa học</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
