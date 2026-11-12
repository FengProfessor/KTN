import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { roleNavigation, NavBadgeKey } from './navigationConfig';
import { UnreadBadge } from '@/features/chat/components/UnreadBadge';
import { getInitials } from '@/lib/utils';
import type { KtnUserSession, UserRole } from '@/types/ktn.types';

interface RoleDesktopNavigationProps {
  role: UserRole;
  user: KtnUserSession | null;
  isDemoMode: boolean;
  badges: Partial<Record<NavBadgeKey, number>>;
  onLogout: () => void;
}

export const RoleDesktopNavigation: React.FC<RoleDesktopNavigationProps> = ({
  role,
  user,
  isDemoMode,
  badges,
  onLogout,
}) => {
  const location = useLocation();
  const config = roleNavigation[role] || roleNavigation.student;

  const subtitle =
    role === 'teacher'
      ? 'Giáo viên chủ nhiệm'
      : role === 'admin'
      ? 'Quản lý Học vụ'
      : user?.classCode
      ? `Lớp ${user.classCode}`
      : isDemoMode
      ? 'Lớp YCT2-04'
      : 'Học viên tự học / Chưa xếp lớp';

  return (
    <aside
      data-testid="desktop-sidebar"
      data-role-sidebar={role}
      className="hidden w-60 shrink-0 flex-col border-r border-stone-200 bg-white lg:flex"
    >
      {/* Brand Logo */}
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-red-800 font-display text-xs font-extrabold text-amber-300 shadow-2xs">
            KTN
          </div>
          <div className="min-w-0">
            <p className="truncate font-display text-sm font-extrabold text-stone-900">
              Khổng Tử Nhí
            </p>
            <p className="truncate text-[11px] font-medium text-stone-500">
              {config.roleBadgeLabel}
            </p>
          </div>
        </div>
      </div>

      {/* Role-Specific Nav Links */}
      <nav className="flex-1 space-y-1 p-2.5" aria-label="Điều hướng chính">
        {config.desktop.map((item) => {
          const Icon = item.icon;
          const badgeCount = item.badgeKey ? badges[item.badgeKey] || 0 : 0;
          const isPrefixActive = Boolean(
            item.matchPrefix?.some((p) => location.pathname.startsWith(p)) ||
              (item.to === '/teacher/grading' && location.pathname === '/teacher') ||
              (item.to === '/admin/orders' && location.pathname === '/admin')
          );

          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              data-testid={item.testId}
              className={({ isActive }) => {
                const active = isActive || isPrefixActive;
                return `flex items-center justify-between rounded-xl px-3 py-2.5 text-xs font-bold transition-all ${
                  active
                    ? 'bg-red-800 text-white shadow-2xs'
                    : 'text-stone-700 hover:bg-stone-100 hover:text-stone-950'
                }`;
              }}
            >
              <div className="flex items-center gap-2.5">
                <Icon className="h-4 w-4 shrink-0" />
                <span>{item.label}</span>
              </div>
              {badgeCount > 0 ? <UnreadBadge count={badgeCount} /> : null}
            </NavLink>
          );
        })}
      </nav>

      {/* User Profile Footer */}
      <div className="border-t border-stone-200 p-3">
        <div className="flex items-center gap-2.5 rounded-xl border border-stone-200/80 bg-stone-50 p-2.5">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-red-800 text-xs font-bold text-white">
            {getInitials(user?.name || 'KTN')}
          </div>
          <div className="min-w-0 flex-1">
            <p
              data-testid="sidebar-user-name"
              className="truncate text-xs font-bold text-stone-900"
            >
              {user?.name || 'Thành viên KTN'}
            </p>
            <p
              data-testid="sidebar-user-subtitle"
              className="truncate text-[11px] text-stone-500"
            >
              {subtitle}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className="rounded-lg p-1.5 text-stone-500 hover:bg-red-100 hover:text-red-800"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </aside>
  );
};
