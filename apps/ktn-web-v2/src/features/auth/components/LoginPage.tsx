import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
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
import { useUiStore, isDemoAllowedInEnv } from '@/stores/useUiStore';

const loginSchema = z.object({
  email: z.string().min(3, 'Vui lòng nhập email hoặc mã học viên hợp lệ'),
  password: z.string().min(4, 'Mật khẩu cần ít nhất 4 ký tự'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const DEV_TEST_ACCOUNTS = [
  {
    label: 'Học sinh (Hoàng Ngân)',
    sub: 'Lớp YCT2-04 + Khóa HSK1',
    email: 'hoangngan@khongtunhi.com',
    role: 'student' as const,
    icon: UserCheck,
    badgeColor: 'bg-emerald-100 text-emerald-900',
  },
  {
    label: 'Học sinh (Chưa mở khóa)',
    sub: 'Kiểm thử trạng thái chưa xếp lớp',
    email: 'taphong2002vip@gmail.com',
    role: 'student' as const,
    icon: Eye,
    badgeColor: 'bg-amber-100 text-amber-900',
  },
  {
    label: 'Giáo viên (Cô Mỹ Linh)',
    sub: 'Chấm bài, giao bài & lớp phụ trách',
    email: 'linh.lam@khongtunhi.com',
    role: 'teacher' as const,
    icon: GraduationCap,
    badgeColor: 'bg-red-100 text-red-900',
  },
  {
    label: 'Quản lý / Học vụ',
    sub: 'Duyệt đơn, học viên & phân quyền',
    email: 'quanly@khongtunhi.com',
    role: 'admin' as const,
    icon: ShieldCheck,
    badgeColor: 'bg-stone-200 text-stone-900',
  },
];

export const LoginPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const login = useAuthStore((s) => s.login);
  const setDemoUser = useAuthStore((s) => s.setDemoUser);
  const syncModeUser = useAuthStore((s) => s.syncModeUser);
  const authError = useAuthStore((s) => s.error);
  const setDemoMode = useUiStore((s) => s.setDemoMode);
  const resetSessionUiState = useUiStore((s) => s.resetSessionUiState);
  const addToast = useUiStore((s) => s.addToast);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const showDevTools =
    isDemoAllowedInEnv() &&
    (import.meta.env.DEV ||
      searchParams.get('demo') === '1' ||
      searchParams.get('qa') === '1');

  const devHarnessToken = import.meta.env.VITE_QA_PASS || 'ktn-session-verify';

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: '',
      password: '',
    },
  });

  const onSubmit = async (values: LoginFormValues) => {
    setIsSubmitting(true);
    try {
      resetSessionUiState();
      queryClient.clear();
      setDemoMode(false);
      const user = await login(values.email, values.password);
      syncModeUser(false);
      addToast({
        title: `Chào ${user.name}!`,
        variant: 'success',
      });
      navigate('/');
    } catch {
      // Error is displayed via authError; never fallback to demo identity
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleQuickLogin = async (acc: (typeof DEV_TEST_ACCOUNTS)[number]) => {
    setValue('email', acc.email);
    setValue('password', devHarnessToken);
    await onSubmit({ email: acc.email, password: devHarnessToken });
  };

  const handleEnterInteractiveDemo = () => {
    resetSessionUiState();
    queryClient.clear();
    setDemoMode(true);
    setDemoUser(DEMO_USERS.student_both);
    navigate('/');
  };

  return (
    <div
      data-testid="login-page"
      className="flex min-h-screen flex-col justify-center bg-[#FAF8F5] px-3 py-4 sm:px-6 lg:px-8"
    >
      <div className="mx-auto w-full max-w-md overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-md lg:max-w-4xl lg:grid lg:grid-cols-12">
        {/* Compact Brand Header on Mobile / Left Column on Desktop */}
        <div className="flex flex-col justify-between bg-gradient-to-br from-red-900 to-red-800 px-4 py-3.5 text-white sm:p-6 lg:col-span-5">
          <div className="flex items-center gap-2.5 lg:flex-col lg:items-start">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-amber-400 font-display text-xs font-extrabold text-stone-950">
              KTN
            </div>
            <div>
              <h1 className="font-display text-base font-extrabold leading-tight sm:text-xl">
                Học Viện Khổng Tử Nhí
              </h1>
              <p className="text-[11px] text-red-100 sm:mt-1 sm:text-xs">
                Học tập, Lớp học & Sổ liên lạc
              </p>
            </div>
          </div>

          {showDevTools && (
            <div className="mt-3 border-t border-white/15 pt-2.5 lg:mt-6">
              <button
                type="button"
                data-testid="enter-demo-mode-btn"
                onClick={handleEnterInteractiveDemo}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-amber-400 px-3 py-2 text-xs font-extrabold text-stone-950 shadow-2xs hover:bg-amber-300"
              >
                <Sparkles className="h-3.5 w-3.5" />
                <span>Xem giao diện Demo</span>
              </button>
            </div>
          )}
        </div>

        {/* Login Form Column */}
        <div className="p-4 sm:p-6 lg:col-span-7">
          <h2 className="font-display text-base font-bold text-stone-900 sm:text-lg">
            Đăng nhập
          </h2>

          {authError && (
            <div
              role="alert"
              data-testid="login-error-alert"
              className="mt-2.5 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="mt-3 space-y-3">
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
                placeholder="nhap-email@khongtunhi.com"
                {...register('email')}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
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
                placeholder="••••••••"
                {...register('password')}
                className="mt-1 w-full rounded-xl border border-stone-300 bg-stone-50 px-3 py-2 text-sm text-stone-900 focus:border-red-800 focus:bg-white focus:outline-none"
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
              className="inline-flex min-h-[42px] w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2.5 text-xs font-bold text-white shadow-2xs transition-all hover:bg-red-900 disabled:opacity-50 sm:text-sm"
            >
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              <span>Đăng nhập</span>
            </button>
          </form>

          {showDevTools && (
            <div
              data-testid="dev-quick-login-section"
              className="mt-4 border-t border-stone-200 pt-3"
            >
              <p className="text-[11px] font-bold text-stone-500">
                Chọn nhanh vai trò kiểm thử (Dev/QA):
              </p>
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                {DEV_TEST_ACCOUNTS.map((acc) => {
                  const Icon = acc.icon;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      data-testid={`quick-login-${acc.email}`}
                      onClick={() => handleQuickLogin(acc)}
                      className="flex items-center gap-2 rounded-xl border border-stone-200 bg-stone-50/80 p-2 text-left transition-all hover:border-red-300 hover:bg-red-50/50"
                    >
                      <span className={`shrink-0 rounded-lg p-1.5 ${acc.badgeColor}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[11px] font-bold text-stone-900">
                          {acc.label}
                        </p>
                        <p className="truncate text-[10px] text-stone-500">{acc.sub}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
