import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { roleNavigation, NavBadgeKey } from './navigationConfig';
import type { UserRole } from '@/types/ktn.types';

interface RoleBottomNavigationProps {
  role: UserRole;
  badges: Partial<Record<NavBadgeKey, number>>;
}

export const RoleBottomNavigation: React.FC<RoleBottomNavigationProps> = ({
  role,
  badges,
}) => {
  const location = useLocation();
  const items = roleNavigation[role]?.mobile || roleNavigation.student.mobile;

  return (
    <nav
      data-testid="mobile-bottom-nav"
      data-role-nav={role}
      aria-label="Điều hướng di động"
      className="safe-bottom fixed bottom-0 left-0 right-0 z-30 flex h-14 items-center justify-around border-t border-stone-200 bg-white/95 px-1 backdrop-blur-md lg:hidden"
    >
      {items.map((item) => {
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
            data-testid={item.mobileTestId || `mobile-${item.testId}`}
            className={({ isActive }) => {
              const active = isActive || isPrefixActive;
              return `relative flex min-h-[44px] min-w-[60px] flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[11px] font-bold transition-colors ${
                active ? 'text-red-800' : 'text-stone-500 hover:text-stone-900'
              }`;
            }}
          >
            <Icon className="h-4 w-4 shrink-0" />
            <span className="max-w-[70px] truncate leading-tight">{item.label}</span>
            {badgeCount > 0 ? (
              <span className="absolute right-2.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-600 px-1 text-[9px] font-bold text-white">
                {badgeCount > 99 ? '99+' : badgeCount}
              </span>
            ) : null}
          </NavLink>
        );
      })}
    </nav>
  );
};
