import React from 'react';
import { FlaskConical, Wifi, WifiOff, UserCheck } from 'lucide-react';
import { useUiStore } from '@/stores/useUiStore';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';

export const DemoControlBar: React.FC = () => {
  const {
    isDemoMode,
    setDemoMode,
    isOfflineSimulated,
    setOfflineSimulated
  } = useUiStore();
  const { user, login, setDemoUser } = useAuthStore();

  const handleQuickRoleSwitch = async (roleKey: keyof typeof DEMO_USERS) => {
    const target = DEMO_USERS[roleKey];
    if (!target) return;
    if (isDemoMode) {
      setDemoUser(target);
      return;
    }
    try {
      await login(target.email, 'Ktn@2026!');
    } catch {
      setDemoUser(target);
    }
  };

  return (
    <div
      data-testid="mode-indicator-bar"
      className={cn(
        'border-b px-3 py-1.5 text-xs transition-colors',
        isDemoMode
          ? 'bg-amber-50 border-amber-200 text-amber-950'
          : 'bg-zinc-900 border-zinc-800 text-zinc-200'
      )}
    >
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            data-testid="data-mode-badge"
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 font-semibold',
              isDemoMode
                ? 'bg-amber-200/80 text-amber-950'
                : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
            )}
          >
            <FlaskConical className="h-3.5 w-3.5" />
            {isDemoMode ? 'CHẾ ĐỘ DEMO (MOCK DATA)' : 'DỮ LIỆU THẬT (/api/ktn/* BFF)'}
          </span>
          <button
            type="button"
            data-testid="toggle-demo-mode-btn"
            onClick={() => setDemoMode(!isDemoMode)}
            className={cn(
              'rounded-md px-2 py-0.5 font-medium underline-offset-2 hover:underline',
              isDemoMode ? 'text-amber-900' : 'text-zinc-300'
            )}
          >
            {isDemoMode ? 'Chuyển sang API Thật' : 'Bật Demo States'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="hidden sm:inline text-[11px] opacity-75 mr-1">
            <UserCheck className="inline h-3.5 w-3.5 mr-1" />
            Đổi nhanh vai trò:
          </span>
          <button
            type="button"
            data-testid="switch-role-student"
            onClick={() => handleQuickRoleSwitch('student_both')}
            className={cn(
              'rounded px-2 py-0.5 font-medium transition-colors',
              user?.email === 'hoangngan@khongtunhi.com'
                ? 'bg-ktn-primary text-white'
                : 'bg-white/10 hover:bg-white/20 text-current border border-current/20'
            )}
          >
            HS Hoàng Ngân (YCT2-04 + HSK1)
          </button>
          <button
            type="button"
            data-testid="switch-role-teacher"
            onClick={() => handleQuickRoleSwitch('teacher')}
            className={cn(
              'rounded px-2 py-0.5 font-medium transition-colors',
              user?.role === 'teacher'
                ? 'bg-ktn-primary text-white'
                : 'bg-white/10 hover:bg-white/20 text-current border border-current/20'
            )}
          >
            GV Cô Mỹ Linh
          </button>
          <button
            type="button"
            data-testid="switch-role-admin"
            onClick={() => handleQuickRoleSwitch('admin')}
            className={cn(
              'rounded px-2 py-0.5 font-medium transition-colors',
              user?.role === 'admin'
                ? 'bg-ktn-primary text-white'
                : 'bg-white/10 hover:bg-white/20 text-current border border-current/20'
            )}
          >
            Quản lý
          </button>

          <button
            type="button"
            data-testid="toggle-offline-btn"
            onClick={() => setOfflineSimulated(!isOfflineSimulated)}
            className={cn(
              'ml-1 inline-flex items-center gap-1 rounded px-2 py-0.5 font-medium transition-colors',
              isOfflineSimulated
                ? 'bg-red-600 text-white'
                : 'bg-white/10 hover:bg-white/20 text-current border border-current/20'
            )}
            title="Mô phỏng mất kết nối mạng để kiểm thử trạng thái Offline & giữ bản nháp"
          >
            {isOfflineSimulated ? (
              <>
                <WifiOff className="h-3 w-3" /> Mất mạng (Đang bật)
              </>
            ) : (
              <>
                <Wifi className="h-3 w-3" /> Mạng ổn định
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
