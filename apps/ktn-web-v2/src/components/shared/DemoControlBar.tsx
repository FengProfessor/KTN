import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { FlaskConical, Wifi, WifiOff, ChevronDown, ChevronUp } from 'lucide-react';
import { useUiStore, isDemoAllowedInEnv } from '@/stores/useUiStore';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { cn } from '@/lib/utils';
import { translateRoleLabel, useI18n } from '@/i18n';

export const DemoControlBar: React.FC = () => {
  const { lang, tr } = useI18n();
  const queryClient = useQueryClient();
  const {
    isDemoMode,
    setDemoMode,
    isOfflineSimulated,
    setOfflineSimulated,
    resetSessionUiState,
  } = useUiStore();
  const { user, setDemoUser, syncModeUser } = useAuthStore();
  const [expanded, setExpanded] = useState(false);

  // Never show DemoControlBar in Live mode or Production builds unless Demo Mode is explicitly allowed and active
  if (!isDemoMode || !isDemoAllowedInEnv()) {
    return null;
  }

  const handleDemoRoleSwitch = (roleKey: keyof typeof DEMO_USERS) => {
    if (!isDemoMode) return;
    const target = DEMO_USERS[roleKey];
    if (!target) return;
    resetSessionUiState();
    setDemoUser(target);
    queryClient.clear();
  };

  const handleExitDemoMode = () => {
    resetSessionUiState();
    setDemoMode(false);
    syncModeUser(false);
    queryClient.clear();
  };

  return (
    <div
      data-testid="mode-indicator-bar"
      className="border-b border-amber-200 bg-amber-50/95 px-3 py-1 text-[11px] text-amber-950"
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            data-testid="data-mode-badge"
            className="inline-flex items-center gap-1 rounded-full bg-amber-200/80 px-2 py-0.5 font-bold text-amber-950"
          >
            <FlaskConical className="h-3 w-3" />
            <span>DEMO</span>
          </span>
          <span className="font-semibold text-amber-900">
            {tr('Vai trò:', 'Role:')} <strong>{translateRoleLabel(user?.role || 'student', lang)}</strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="toggle-demo-panel-btn"
            onClick={() => setExpanded((prev) => !prev)}
            className="inline-flex items-center gap-1 rounded bg-amber-200/70 px-2 py-0.5 font-bold text-amber-950 hover:bg-amber-200"
          >
            <span>{tr('Đổi vai trò Demo', 'Switch Demo Role')}</span>
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          </button>

          <button
            type="button"
            data-testid="toggle-demo-mode-btn"
            onClick={handleExitDemoMode}
            className="rounded px-2 py-0.5 font-semibold text-amber-900 underline hover:text-red-800"
          >
            {tr('Thoát Demo', 'Exit Demo')}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="mx-auto mt-1.5 flex max-w-7xl flex-wrap items-center gap-1.5 border-t border-amber-200/70 pt-1.5">
          <button
            type="button"
            data-testid="switch-role-student"
            onClick={() => handleDemoRoleSwitch('student_both')}
            className={cn(
              'rounded px-2 py-0.5 font-bold transition-colors',
              user?.role === 'student'
                ? 'bg-red-800 text-white'
                : 'bg-white text-stone-800 border border-amber-300'
            )}
          >
            {tr('Học sinh', 'Student')}
          </button>
          <button
            type="button"
            data-testid="switch-role-teacher"
            onClick={() => handleDemoRoleSwitch('teacher')}
            className={cn(
              'rounded px-2 py-0.5 font-bold transition-colors',
              user?.role === 'teacher'
                ? 'bg-red-800 text-white'
                : 'bg-white text-stone-800 border border-amber-300'
            )}
          >
            {tr('Giáo viên', 'Teacher')}
          </button>
          <button
            type="button"
            data-testid="switch-role-admin"
            onClick={() => handleDemoRoleSwitch('admin')}
            className={cn(
              'rounded px-2 py-0.5 font-bold transition-colors',
              user?.role === 'admin'
                ? 'bg-red-800 text-white'
                : 'bg-white text-stone-800 border border-amber-300'
            )}
          >
            {tr('Quản lý', 'Admin')}
          </button>
          <button
            type="button"
            data-testid="switch-role-advisor"
            onClick={() => handleDemoRoleSwitch('advisor')}
            className={cn(
              'rounded px-2 py-0.5 font-bold transition-colors',
              user?.role === 'advisor'
                ? 'bg-red-800 text-white'
                : 'bg-white text-stone-800 border border-amber-300'
            )}
          >
            {tr('Tư vấn viên', 'Advisor')}
          </button>

          <button
            type="button"
            data-testid="toggle-offline-btn"
            onClick={() => setOfflineSimulated(!isOfflineSimulated)}
            className={cn(
              'ml-auto inline-flex items-center gap-1 rounded px-2 py-0.5 font-bold transition-colors',
              isOfflineSimulated
                ? 'bg-red-600 text-white'
                : 'bg-white text-stone-700 border border-amber-300'
            )}
          >
            {isOfflineSimulated ? (
              <>
                <WifiOff className="h-3 w-3" /> {tr('Mất mạng', 'Offline')}
              </>
            ) : (
              <>
                <Wifi className="h-3 w-3" /> {tr('Mạng ổn định', 'Online')}
              </>
            )}
          </button>
        </div>
      )}
    </div>
  );
};
