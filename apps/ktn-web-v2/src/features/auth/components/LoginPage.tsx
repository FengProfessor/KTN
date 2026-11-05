import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  LogIn,
  Sparkles,
  ShieldCheck,
  GraduationCap,
  UserCheck,
  AlertCircle,
  Loader2,
  Eye,
} from 'lucide-react';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

const loginSchema = z.object({
  email: z.string().min(3, 'Vui lòng nhập email hoặc mã học viên hợp lệ'),
  password: z.string().min(4, 'Mật khẩu cần ít nhất 4 ký tự'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const QUICK_TEST_ACCOUNTS = [
  {
    label: 'Học sinh Đã mở khóa (Hoàng Ngân)',
    sub: 'Có lớp YCT2-04, xem được Video HLS & Chat Zalo',
    email: 'hoangngan@khongtunhi.com',
    password: 'Ktn@2026!',
    role: 'student' as const,
    icon: UserCheck,
    badgeColor: 'bg-emerald-100 text-emerald-900',
  },
  {
    label: 'Học sinh Chưa mở khóa (Test 403)',
    sub: 'Kiểm thử màn hình chặn quyền khóa học & chưa xếp lớp',
    email: 'taphong2002vip@gmail.com',
    password: 'Ktn@2026!',
    role: 'student' as const,
    icon: Eye,
    badgeColor: 'bg-amber-100 text-amber-900',
  },
  {
    label: 'Giáo viên Chủ nhiệm (Cô Mỹ Linh)',
    sub: 'Giao bài tập, chấm điểm 0–10, ghim thông báo lớp',
    email: 'linh.lam@khongtunhi.com',
    password: 'Ktn@2026!',
    role: 'teacher' as const,
    icon: GraduationCap,
    badgeColor: 'bg-red-100 text-red-900',
  },
  {
    label: 'Quản lý / Học vụ KTN',
    sub: 'Duyệt đơn đăng ký, cấp quyền học phần & xếp lớp',
    email: 'quanly@khongtunhi.com',
    password: 'Ktn@2026!',
    role: 'admin' as const,
    icon: ShieldCheck,
    badgeColor: 'bg-stone-200 text-stone-900',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const setDemoUser = useAuthStore((s) => s.setDemoUser);
  const authError = useAuthStore((s) => s.error);
  const setDemoMode = useUiStore((s) => s.setDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: 'hoangngan@khongtunhi.com',
      password: 'Ktn@2026!',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      setDemoMode(false);
      const user = await login(values.email, values.password);
      addToast({
        title: `Chào mừng ${user.name}!`,
        description: 'Đã kết nối thành công với máy chủ Học Viện Khổng Tử Nhí.',
        variant: 'success',
      });
      if (user.role === 'teacher') {
        navigate('/teacher');
      } else if (user.role === 'admin') {
        navigate('/admin');
      } else {
        navigate('/');
      }
    } catch {
      // Error is displayed via authError
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (acc: (typeof QUICK_TEST_ACCOUNTS)[number]) => {
    setValue('email', acc.email);
    setValue('password', acc.password);
    await onSubmit({ email: acc.email, password: acc.password });
  };

  const handleEnterInteractiveDemo = () => {
    setDemoMode(true);
    setDemoUser(DEMO_USERS.student_both);
    navigate('/');
  };

  return (
    <div
      data-testid="login-page"
      className="flex min-h-screen flex-col justify-center bg-[#FAF8F5] px-4 py-8 sm:px-6 lg:px-8"
    >
      <div className="mx-auto grid w-full max-w-5xl grid-cols-1 overflow-hidden rounded-3xl border border-stone-200 bg-white shadow-xl lg:grid-cols-12">
        {/* Left Brand Story Column (5 cols) */}
        <div className="flex flex-col justify-between bg-gradient-to-br from-red-900 via-red-800 to-stone-950 p-6 text-white sm:p-8 lg:col-span-5">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full bg-amber-400/20 px-3 py-1 text-xs font-bold text-amber-200 ring-1 ring-amber-300/30">
              <Sparkles className="h-3.5 w-3.5 text-amber-300" />
              <span>HỌC VIỆN KHỔNG TỬ NHÍ • KTN V2</span>
            </div>

            <h1 className="mt-4 font-display text-2xl font-extrabold leading-tight sm:text-3xl">
              Cổng Học Tập Video, Bài Tập & Sổ Liên Lạc Zalo Lớp Học
            </h1>

            <p className="mt-3 text-xs leading-relaxed text-red-100 sm:text-sm">
              Nền tảng học tiếng Trung chuẩn YCT dành cho thiếu nhi, kết nối trực tiếp Học sinh — Phụ huynh — Giáo viên chủ nhiệm trong một không gian duy nhất.
            </p>
          </div>

          <div className="mt-8 space-y-3 border-t border-white/15 pt-5 text-xs text-stone-200">
            <p className="font-bold text-amber-300">Chế độ xem thử giao diện nhanh:</p>
            <button
              type="button"
              data-testid="enter-demo-mode-btn"
              onClick={handleEnterInteractiveDemo}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 text-xs font-extrabold text-stone-950 shadow-md transition-transform hover:scale-[1.01] hover:bg-amber-300"
            >
              <Sparkles className="h-4 w-4" />
              Mở Interactive Demo (Đầy đủ trạng thái mẫu)
            </button>
          </div>
        </div>

        {/* Right Form & Quick Role Switcher Column (7 cols) */}
        <div className="p-6 sm:p-8 lg:col-span-7">
          <h2 className="font-display text-xl font-bold text-stone-900">
            Đăng nhập tài khoản KTN
          </h2>
          <p className="mt-1 text-xs text-stone-500">
            Sử dụng tài khoản học viên, giáo viên hoặc chọn nhanh một tài khoản kiểm thử thực tế bên dưới.
          </p>

          {authError && (
            <div
              role="alert"
              data-testid="login-error-alert"
              className="mt-4 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3.5 py-2.5 text-xs font-semibold text-red-900"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-5 space-y-4">
            <div>
              <label
                htmlFor="login-email"
                className="block text-xs font-bold text-stone-800"
              >
                Email hoặc Mã học viên
              </label>
              <input
                id="login-email"
                type="text"
                data-testid="login-email-input"
                {...register('email')}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
              />
              {errors.email && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errors.email.message}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="login-password"
                className="block text-xs font-bold text-stone-800"
              >
                Mật khẩu
              </label>
              <input
                id="login-password"
                type="password"
                data-testid="login-password-input"
                {...register('password')}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3.5 py-2.5 text-sm text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
              />
              {errors.password && (
                <p className="mt-1 text-xs font-medium text-red-600">
                  {errors.password.message}
                </p>
              )}
            </div>

            <button
              type="submit"
              data-testid="login-submit-btn"
              disabled={isSubmitting}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-5 py-3 text-sm font-bold text-white shadow-md transition-all hover:bg-red-900 disabled:opacity-50"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>Đăng nhập vào hệ thống thật (/api/ktn/*)</span>
            </button>
          </form>

          {/* Quick 1-Click Real BFF Test Accounts */}
          <div className="mt-6 border-t border-stone-200 pt-5">
            <p className="text-xs font-bold uppercase tracking-wider text-stone-500">
              Đăng nhập nhanh 1 chạm (Dữ liệu thật qua Worker BFF):
            </p>
            <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {QUICK_TEST_ACCOUNTS.map((acc) => {
                const Icon = acc.icon;
                return (
                  <button
                    key={acc.email}
                    type="button"
                    data-testid={`quick-login-${acc.email}`}
                    onClick={() => handleQuickLogin(acc)}
                    className="flex items-start gap-2.5 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-left transition-all hover:border-red-300 hover:bg-red-50/50"
                  >
                    <span className={`mt-0.5 rounded-lg p-1.5 ${acc.badgeColor}`}>
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-bold text-stone-900">
                        {acc.label}
                      </p>
                      <p className="mt-0.5 line-clamp-2 text-[11px] text-stone-500">
                        {acc.sub}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
