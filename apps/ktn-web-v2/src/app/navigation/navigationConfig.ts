import {
  Home,
  PlayCircle,
  Users,
  MessageSquare,
  Bell,
  LayoutDashboard,
  FileCheck2,
  CalendarPlus,
  GraduationCap,
  ClipboardList,
  ShieldCheck,
  MoreHorizontal,
  LucideIcon,
} from 'lucide-react';
import type { UserRole } from '@/types/ktn.types';

export type NavBadgeKey = 'chat' | 'notifications' | 'grading' | 'orders';

export interface RoleNavItem {
  to: string;
  label: string;
  icon: LucideIcon;
  testId: string;
  mobileTestId?: string;
  end?: boolean;
  badgeKey?: NavBadgeKey;
  matchPrefix?: string[];
}

export interface RoleNavigationDef {
  home: string;
  roleBadgeLabel: string;
  mobile: RoleNavItem[];
  desktop: RoleNavItem[];
}

export const roleNavigation: Record<UserRole, RoleNavigationDef> = {
  student: {
    home: '/',
    roleBadgeLabel: 'Học viên',
    mobile: [
      {
        to: '/',
        label: 'Trang chủ',
        icon: Home,
        testId: 'nav-dashboard',
        mobileTestId: 'mobile-nav-home',
        end: true,
      },
      {
        to: '/learning',
        label: 'Học',
        icon: PlayCircle,
        testId: 'nav-learning',
        mobileTestId: 'mobile-nav-learning',
        matchPrefix: ['/learning'],
      },
      {
        to: '/classrooms',
        label: 'Lớp',
        icon: Users,
        testId: 'nav-classrooms',
        mobileTestId: 'mobile-nav-classrooms',
        matchPrefix: ['/classrooms'],
      },
      {
        to: '/chat',
        label: 'Tin nhắn',
        icon: MessageSquare,
        testId: 'nav-chat',
        mobileTestId: 'mobile-nav-chat',
        badgeKey: 'chat',
        matchPrefix: ['/chat'],
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        testId: 'nav-notifications',
        mobileTestId: 'mobile-nav-notifications',
        badgeKey: 'notifications',
        matchPrefix: ['/notifications'],
      },
    ],
    desktop: [
      {
        to: '/',
        label: 'Trang chủ',
        icon: Home,
        testId: 'nav-dashboard',
        end: true,
      },
      {
        to: '/learning',
        label: 'Học tiếp',
        icon: PlayCircle,
        testId: 'nav-learning',
        matchPrefix: ['/learning'],
      },
      {
        to: '/classrooms',
        label: 'Lớp học',
        icon: Users,
        testId: 'nav-classrooms',
        matchPrefix: ['/classrooms'],
      },
      {
        to: '/chat',
        label: 'Tin nhắn',
        icon: MessageSquare,
        testId: 'nav-chat',
        badgeKey: 'chat',
        matchPrefix: ['/chat'],
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        testId: 'nav-notifications',
        badgeKey: 'notifications',
        matchPrefix: ['/notifications'],
      },
    ],
  },
  teacher: {
    home: '/',
    roleBadgeLabel: 'Giáo viên',
    mobile: [
      {
        to: '/',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        testId: 'nav-dashboard',
        mobileTestId: 'mobile-nav-home',
        end: true,
      },
      {
        to: '/teacher/classes',
        label: 'Lớp',
        icon: Users,
        testId: 'nav-teacher-classes',
        mobileTestId: 'mobile-nav-classes',
        matchPrefix: ['/teacher/classes'],
      },
      {
        to: '/teacher/grading',
        label: 'Chấm bài',
        icon: FileCheck2,
        testId: 'nav-teacher',
        mobileTestId: 'mobile-nav-grading',
        badgeKey: 'grading',
        matchPrefix: ['/teacher/grading', '/teacher/assign'],
      },
      {
        to: '/chat',
        label: 'Tin nhắn',
        icon: MessageSquare,
        testId: 'nav-chat',
        mobileTestId: 'mobile-nav-chat',
        badgeKey: 'chat',
        matchPrefix: ['/chat'],
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        testId: 'nav-notifications',
        mobileTestId: 'mobile-nav-notifications',
        badgeKey: 'notifications',
        matchPrefix: ['/notifications'],
      },
    ],
    desktop: [
      {
        to: '/',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        testId: 'nav-dashboard',
        end: true,
      },
      {
        to: '/teacher/classes',
        label: 'Lớp của tôi',
        icon: Users,
        testId: 'nav-teacher-classes',
        matchPrefix: ['/teacher/classes'],
      },
      {
        to: '/teacher/grading',
        label: 'Chấm bài',
        icon: FileCheck2,
        testId: 'nav-teacher',
        badgeKey: 'grading',
        matchPrefix: ['/teacher/grading'],
      },
      {
        to: '/teacher/assign',
        label: 'Giao bài',
        icon: CalendarPlus,
        testId: 'nav-teacher-assign',
        matchPrefix: ['/teacher/assign'],
      },
      {
        to: '/teacher/forum',
        label: 'Hỏi đáp',
        icon: MessageSquare,
        testId: 'nav-teacher-forum',
        matchPrefix: ['/teacher/forum'],
      },
      {
        to: '/chat',
        label: 'Tin nhắn',
        icon: MessageSquare,
        testId: 'nav-chat',
        badgeKey: 'chat',
        matchPrefix: ['/chat'],
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        testId: 'nav-notifications',
        badgeKey: 'notifications',
        matchPrefix: ['/notifications'],
      },
    ],
  },
  admin: {
    home: '/',
    roleBadgeLabel: 'Quản lý',
    mobile: [
      {
        to: '/',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        testId: 'nav-dashboard',
        mobileTestId: 'mobile-nav-home',
        end: true,
      },
      {
        to: '/admin/students',
        label: 'Học viên',
        icon: Users,
        testId: 'nav-admin-students',
        mobileTestId: 'mobile-nav-students',
        matchPrefix: ['/admin/students'],
      },
      {
        to: '/admin/classes',
        label: 'Lớp',
        icon: GraduationCap,
        testId: 'nav-admin-classes',
        mobileTestId: 'mobile-nav-classes',
        matchPrefix: ['/admin/classes'],
      },
      {
        to: '/admin/orders',
        label: 'Đơn hàng',
        icon: ClipboardList,
        testId: 'nav-admin',
        mobileTestId: 'mobile-nav-orders',
        badgeKey: 'orders',
        matchPrefix: ['/admin/orders'],
      },
      {
        to: '/admin/more',
        label: 'Thêm',
        icon: MoreHorizontal,
        testId: 'nav-admin-more',
        mobileTestId: 'mobile-nav-more',
        matchPrefix: ['/admin/more', '/admin/teachers'],
      },
    ],
    desktop: [
      {
        to: '/',
        label: 'Tổng quan',
        icon: LayoutDashboard,
        testId: 'nav-dashboard',
        end: true,
      },
      {
        to: '/admin/students',
        label: 'Học viên',
        icon: Users,
        testId: 'nav-admin-students',
        matchPrefix: ['/admin/students'],
      },
      {
        to: '/admin/classes',
        label: 'Lớp học',
        icon: GraduationCap,
        testId: 'nav-admin-classes',
        matchPrefix: ['/admin/classes'],
      },
      {
        to: '/admin/teachers',
        label: 'Giáo viên',
        icon: Users,
        testId: 'nav-admin-teachers',
        matchPrefix: ['/admin/teachers'],
      },
      {
        to: '/admin/orders',
        label: 'Đơn hàng',
        icon: ClipboardList,
        testId: 'nav-admin',
        badgeKey: 'orders',
        matchPrefix: ['/admin/orders'],
      },
      {
        to: '/admin/more',
        label: 'Đồng bộ',
        icon: ShieldCheck,
        testId: 'nav-admin-more',
        matchPrefix: ['/admin/more'],
      },
      {
        to: '/chat',
        label: 'Tin nhắn',
        icon: MessageSquare,
        testId: 'nav-chat',
        badgeKey: 'chat',
        matchPrefix: ['/chat'],
      },
      {
        to: '/notifications',
        label: 'Thông báo',
        icon: Bell,
        testId: 'nav-notifications',
        badgeKey: 'notifications',
        matchPrefix: ['/notifications'],
      },
    ],
  },
};
