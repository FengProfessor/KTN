import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import {
  UserCircle,
  KeyRound,
  Mail,
  GraduationCap,
  BookOpen,
  ShieldCheck,
  LogOut,
  Globe,
  Bell,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Hash,
} from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { ktnApi } from '@/services/api/ktnApiClient';
import { getInitials } from '@/lib/utils';
import { useI18n } from '@/i18n';

/** Authenticated account overview and self-service password change page. */
export const ProfilePage: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const setDemoMode = useUiStore((s) => s.setDemoMode);
  const resetSessionUiState = useUiStore((s) => s.resetSessionUiState);
  const addToast = useUiStore((s) => s.addToast);
  const { lang, toggleLang, tr } = useI18n();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [pwdError, setPwdError] = useState<string | null>(null);
  const [pwdSuccess, setPwdSuccess] = useState<string | null>(null);
  const [pwdSubmitting, setPwdSubmitting] = useState(false);

  const effectiveRole = user?.role || 'student';
  const minPasswordLen = effectiveRole === 'admin' ? 8 : 6;

  const roleBadgeLabel =
    effectiveRole === 'admin'
      ? tr('Quản lý học vụ', 'Academic Admin')
      : effectiveRole === 'advisor'
      ? tr('Chuyên viên tư vấn', 'Consultation Advisor')
      : effectiveRole === 'teacher'
      ? tr('Giáo viên', 'Teacher')
      : tr('Học viên', 'Student');

  const assignedClassLabel =
    effectiveRole === 'teacher'
      ? user?.assignedClasses && user.assignedClasses.length > 0
        ? user.assignedClasses.join(', ')
        : user?.classCode || tr('Chưa phân công lớp', 'No classes assigned')
      : effectiveRole === 'admin'
      ? tr('Toàn hệ thống', 'All classes & courses')
      : effectiveRole === 'advisor'
      ? tr('Hộp thư tư vấn Zalo OA & Web', 'Zalo OA & Web Consultation Desk')
      : user?.classCode || tr('Chưa xếp lớp trực tiếp', 'Not assigned to a live class');

  const onlineCoursesCount = Array.isArray(user?.onlineCourses) ? user.onlineCourses.length : 0;

  const handleSubmitPasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwdError(null);
    setPwdSuccess(null);

    if (!currentPassword.trim()) {
      setPwdError(tr('Vui lòng nhập mật khẩu hiện tại.', 'Please enter your current password.'));
      return;
    }
    if (newPassword.trim().length < minPasswordLen) {
      setPwdError(
        tr(
          `Mật khẩu mới cần tối thiểu ${minPasswordLen} ký tự.`,
          `New password must be at least ${minPasswordLen} characters.`
        )
      );
      return;
    }
    if (newPassword !== confirmPassword) {
      setPwdError(tr('Xác nhận mật khẩu mới không khớp.', 'New password confirmation does not match.'));
      return;
    }
    if (newPassword === currentPassword) {
      setPwdError(
        tr(
          'Mật khẩu mới phải khác mật khẩu hiện tại.',
          'New password must be different from your current password.'
        )
      );
      return;
    }

    if (isDemoMode) {
      const msg = tr(
        'Đã đổi mật khẩu trong phiên dùng thử (Demo).',
        'Password updated in Demo session.'
      );
      setPwdSuccess(msg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        title: tr('Đã đổi mật khẩu (Demo)', 'Password updated (Demo)'),
        description: msg,
        variant: 'success',
      });
      return;
    }

    setPwdSubmitting(true);
    try {
      const res = await ktnApi.changePassword({
        currentPassword,
        newPassword,
      });
      const successMsg =
        (lang === 'en' ? '' : res.message) ||
        tr(
          'Đổi mật khẩu thành công! Bạn có thể dùng mật khẩu mới cho lần đăng nhập tiếp theo.',
          'Password changed successfully! Use your new password next time you sign in.'
        );
      setPwdSuccess(successMsg);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      addToast({
        title: tr('Đổi mật khẩu thành công', 'Password changed successfully'),
        description: successMsg,
        variant: 'success',
      });
    } catch (err: unknown) {
      setPwdError(
        err instanceof Error
          ? err.message
          : tr(
              'Không thể đổi mật khẩu. Vui lòng kiểm tra lại.',
              'Unable to change password. Please double-check and try again.'
            )
      );
    } finally {
      setPwdSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    setDemoMode(false);
    resetSessionUiState();
    queryClient.clear();
    try {
      sessionStorage.removeItem('ktn_post_login_redirect');
      localStorage.removeItem('ktn_push_enabled_v2');
    } catch {
      // ignore storage errors
    }
    const logoutPromise = logout();
    navigate('/login', { replace: true });
    await logoutPromise;
    queryClient.clear();
    resetSessionUiState();
    navigate('/login', { replace: true });
  };

  return (
    <div data-testid="profile-page" className="mx-auto w-full max-w-4xl space-y-4">
      {/* Account Summary Card */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5">
        <div className="flex flex-wrap items-center gap-3.5">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-red-800 font-display text-lg font-extrabold text-amber-300 shadow-xs">
            {getInitials(user?.name || 'KTN')}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                data-testid="profile-user-name"
                className="truncate font-display text-base font-extrabold text-stone-900 sm:text-lg"
              >
                {user?.name || tr('Thành viên Khổng Tử Nhí', 'Khong Tu Nhi Member')}
              </h1>
              <span
                data-testid="profile-role-badge"
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-0.5 text-[11px] font-bold text-red-900"
              >
                <ShieldCheck className="h-3 w-3 shrink-0" />
                {roleBadgeLabel}
              </span>
              {isDemoMode && (
                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                  DEMO
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-stone-500">
              {tr(
                'Quản lý thông tin tài khoản và bảo mật đăng nhập',
                'Manage your account details and sign-in security'
              )}
            </p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          <div className="min-w-0 rounded-xl border border-stone-200/80 bg-stone-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
              <Mail className="h-3.5 w-3.5 text-red-800" />
              {tr('Email đăng nhập', 'Login email')}
            </p>
            <p
              data-testid="profile-user-email"
              className="mt-1 break-all text-xs font-bold text-stone-900"
            >
              {user?.email || '—'}
            </p>
          </div>

          {user?.code && (
            <div className="min-w-0 rounded-xl border border-stone-200/80 bg-stone-50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
                <Hash className="h-3.5 w-3.5 text-red-800" />
                {tr('Mã tài khoản', 'Account ID')}
              </p>
              <p className="mt-1 break-all font-mono text-xs font-bold text-stone-900">
                {user.code}
              </p>
            </div>
          )}

          <div className="min-w-0 rounded-xl border border-stone-200/80 bg-stone-50 p-3">
            <p className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
              <GraduationCap className="h-3.5 w-3.5 text-red-800" />
              {effectiveRole === 'teacher'
                ? tr('Lớp đang phụ trách', 'Assigned classes')
                : tr('Lớp học trực tiếp', 'Live classroom')}
            </p>
            <p
              data-testid="profile-user-classes"
              className="mt-1 break-words text-xs font-bold text-stone-900"
            >
              {assignedClassLabel}
            </p>
          </div>

          {effectiveRole === 'student' && (
            <div className="min-w-0 rounded-xl border border-stone-200/80 bg-stone-50 p-3">
              <p className="flex items-center gap-1.5 text-[11px] font-bold text-stone-500">
                <BookOpen className="h-3.5 w-3.5 text-red-800" />
                {tr('Khóa học video', 'Video courses')}
              </p>
              <p className="mt-1 text-xs font-bold text-stone-900">
                {onlineCoursesCount > 0
                  ? tr(`${onlineCoursesCount} khóa đang sở hữu`, `${onlineCoursesCount} active course(s)`)
                  : tr('Chưa kích hoạt khóa video', 'No video courses active')}
              </p>
            </div>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Change Password Card */}
        <section
          data-testid="profile-change-password-card"
          className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5 lg:col-span-7"
        >
          <div className="flex items-start gap-2.5 border-b border-stone-100 pb-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-100 text-red-800">
              <KeyRound className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <h2 className="font-display text-sm font-extrabold text-stone-900">
                {tr('Đổi mật khẩu tài khoản', 'Change account password')}
              </h2>
              <p className="mt-0.5 text-[11px] text-stone-600">
                {tr(
                  'Mật khẩu mặc định ban đầu cho tài khoản mới là 12345678. Khuyến nghị đổi sang mật khẩu riêng để bảo mật.',
                  'Default initial password for newly created accounts is 12345678. Set your own password to secure your account.'
                )}
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmitPasswordChange} className="mt-3.5 space-y-3">
            {pwdError && (
              <div
                role="alert"
                data-testid="profile-password-error"
                className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-900"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
                <span>{pwdError}</span>
              </div>
            )}

            {pwdSuccess && (
              <div
                role="status"
                data-testid="profile-password-success"
                className="flex items-start gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-900"
              >
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
                <span>{pwdSuccess}</span>
              </div>
            )}

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                {tr('Mật khẩu hiện tại', 'Current password')}
              </label>
              <div className="relative">
                <input
                  type={showCurrentPwd ? 'text' : 'password'}
                  data-testid="profile-current-password-input"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder={tr(
                    'Nhập mật khẩu hiện tại (mặc định: 12345678)',
                    'Enter current password (default: 12345678)'
                  )}
                  autoComplete="current-password"
                  className="w-full rounded-xl border border-stone-300 py-2 pl-3 pr-10 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd((v) => !v)}
                  aria-label={tr('Ẩn/hiện mật khẩu hiện tại', 'Toggle current password visibility')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-400 hover:text-stone-700"
                >
                  {showCurrentPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                {tr('Mật khẩu mới', 'New password')}
              </label>
              <div className="relative">
                <input
                  type={showNewPwd ? 'text' : 'password'}
                  data-testid="profile-new-password-input"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={tr(
                    `Tối thiểu ${minPasswordLen} ký tự`,
                    `At least ${minPasswordLen} characters`
                  )}
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-stone-300 py-2 pl-3 pr-10 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  aria-label={tr('Ẩn/hiện mật khẩu mới', 'Toggle new password visibility')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-stone-400 hover:text-stone-700"
                >
                  {showNewPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-stone-700">
                {tr('Xác nhận mật khẩu mới', 'Confirm new password')}
              </label>
              <input
                type={showNewPwd ? 'text' : 'password'}
                data-testid="profile-confirm-password-input"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={tr('Nhập lại mật khẩu mới', 'Re-enter new password')}
                autoComplete="new-password"
                className="w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-red-700 focus:outline-none"
              />
            </div>

            <div className="pt-1">
              <button
                type="submit"
                data-testid="profile-change-password-submit-btn"
                disabled={pwdSubmitting}
                className="inline-flex min-h-[40px] w-full items-center justify-center gap-2 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-red-900 disabled:opacity-50 sm:w-auto"
              >
                {pwdSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <KeyRound className="h-4 w-4" />
                )}
                <span>
                  {pwdSubmitting
                    ? tr('Đang cập nhật...', 'Updating...')
                    : tr('Đổi mật khẩu', 'Change password')}
                </span>
              </button>
            </div>
          </form>
        </section>

        {/* Quick Preferences & Account Actions */}
        <section className="space-y-3 rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs sm:p-5 lg:col-span-5">
          <div className="flex items-center gap-2 border-b border-stone-100 pb-3">
            <UserCircle className="h-4 w-4 text-red-800" />
            <h2 className="font-display text-sm font-extrabold text-stone-900">
              {tr('Tùy chọn & Phiên đăng nhập', 'Preferences & Session')}
            </h2>
          </div>

          <div className="space-y-2.5 text-xs">
            <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-stone-50 p-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 font-bold text-stone-900">
                  <Globe className="h-3.5 w-3.5 text-red-800" />
                  {tr('Ngôn ngữ giao diện', 'Interface language')}
                </p>
                <p className="text-[11px] text-stone-500">
                  {lang === 'en' ? 'English (active)' : 'Tiếng Việt (đang chọn)'}
                </p>
              </div>
              <button
                type="button"
                data-testid="profile-lang-toggle-btn"
                onClick={toggleLang}
                className="shrink-0 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-[11px] font-extrabold text-stone-800 hover:border-red-300 hover:bg-red-50"
              >
                {lang === 'en' ? 'Chuyển Tiếng Việt' : 'Switch to EN'}
              </button>
            </div>

            <button
              type="button"
              data-testid="profile-goto-notifications-btn"
              onClick={() => navigate('/notifications')}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3 text-left font-bold text-stone-800 transition-colors hover:bg-stone-100"
            >
              <span className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-red-800" />
                {tr('Cài đặt thông báo đẩy', 'Notification settings')}
              </span>
              <span className="text-red-800">→</span>
            </button>

            <button
              type="button"
              data-testid="profile-logout-btn"
              onClick={handleSignOut}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-xs font-bold text-red-900 transition-colors hover:bg-red-100"
            >
              <LogOut className="h-4 w-4" />
              <span>{tr('Đăng xuất khỏi tài khoản', 'Sign out')}</span>
            </button>
          </div>
        </section>
      </div>
    </div>
  );
};
