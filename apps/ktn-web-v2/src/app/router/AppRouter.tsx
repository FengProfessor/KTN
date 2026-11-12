import React, { useEffect, Suspense, lazy } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate, useLocation } from 'react-router-dom';
import { ShieldAlert, ArrowLeft, Loader2 } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { RoleHome } from '../navigation/RoleHome';
import { ClassroomsPage } from '@/features/classrooms/components/ClassroomsPage';
import { ChatLayout } from '@/features/chat/components/ChatLayout';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { useUiStore, isDemoAllowedInEnv } from '@/stores/useUiStore';
import { resolveNotificationLink } from '@/lib/utils';
import type { UserRole } from '@/types/ktn.types';

const LearningPage = lazy(() =>
  import('@/features/learning/components/LearningPage').then((m) => ({ default: m.LearningPage }))
);
const TeacherWorkspace = lazy(() =>
  import('@/features/teacher/components/TeacherWorkspace').then((m) => ({ default: m.TeacherWorkspace }))
);
const AdminWorkspace = lazy(() =>
  import('@/features/admin/components/AdminWorkspace').then((m) => ({ default: m.AdminWorkspace }))
);
const FlashcardsPage = lazy(() =>
  import('@/features/flashcards/components/FlashcardsPage').then((m) => ({ default: m.FlashcardsPage }))
);

const RouteLoadingFallback: React.FC = () => (
  <div className="flex min-h-[200px] items-center justify-center p-6">
    <Loader2 className="h-6 w-6 animate-spin text-red-800" />
  </div>
);

function buildLoginRedirectUrl(pathname: string, search: string): string {
  if (useAuthStore.getState().isLoading) {
    return '/login';
  }
  const fullPath = `${pathname || '/'}${search || ''}`;
  if (fullPath && fullPath !== '/' && !fullPath.startsWith('/login')) {
    try {
      sessionStorage.setItem('ktn_post_login_redirect', fullPath);
    } catch {
      // ignore storage errors
    }
    return `/login?redirect=${encodeURIComponent(fullPath)}`;
  }
  return '/login';
}

const LegacyNotificationRedirect: React.FC = () => {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const target = resolveNotificationLink(
    { actionUrl: `${location.pathname}${location.search}` },
    user?.role
  );
  return <Navigate to={target} replace />;
};

const RequireRole: React.FC<{
  allowed: UserRole[];
  allowAssignedCourseTeacher?: boolean;
  children: React.ReactNode;
}> = ({ allowed, allowAssignedCourseTeacher = false, children }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const isDemoMode = useUiStore((s) => s.isDemoMode);

  if (isRestoring && !isDemoMode) {
    return <RouteLoadingFallback />;
  }

  if (!user && !isDemoMode) {
    return <Navigate to={buildLoginRedirectUrl(location.pathname, location.search)} replace />;
  }

  const role: UserRole = user?.role || 'student';
  const targetCourseId = (searchParams.get('courseId') || '').trim().toLowerCase();
  const teacherAssignedCourses = Array.isArray(user?.assignedCourses)
    ? user.assignedCourses
        .map((c) => String(c || '').trim().toLowerCase())
        .filter(Boolean)
    : [];
  const isForumDirectView =
    searchParams.get('tab') === 'forum' || Boolean(searchParams.get('questionId'));
  const isAssignedCourseTeacherAllowed =
    allowAssignedCourseTeacher &&
    role === 'teacher' &&
    (isForumDirectView ||
      (teacherAssignedCourses.length > 0 &&
        (!targetCourseId || teacherAssignedCourses.includes(targetCourseId))));

  if (!allowed.includes(role) && !isAssignedCourseTeacherAllowed) {
    return (
      <div
        data-testid="role-forbidden-guard"
        role="alert"
        className="mx-auto my-6 max-w-md rounded-2xl border border-red-200 bg-white p-5 text-center shadow-2xs"
      >
        <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-xl bg-red-50 text-red-700">
          <ShieldAlert className="h-5 w-5" />
        </div>
        <h2 className="text-sm font-bold text-slate-900">
          Không có quyền truy cập khu vực này
        </h2>
        <p className="mt-1 text-xs text-slate-600">
          Khu vực này dành cho vai trò ({allowed.join(', ')}).
        </p>
        <div className="mt-3 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Về Trang chủ
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const setDemoUser = useAuthStore((s) => s.setDemoUser);
  const syncModeUser = useAuthStore((s) => s.syncModeUser);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const setDemoMode = useUiStore((s) => s.setDemoMode);

  // Allow URL query ?demo=1 or ?mode=live to switch seamlessly during automated or manual testing (only when demo is allowed in env)
  useEffect(() => {
    const demoParam = searchParams.get('demo');
    const modeParam = searchParams.get('mode');
    if ((demoParam === '1' || modeParam === 'demo') && isDemoAllowedInEnv()) {
      setDemoMode(true);
      syncModeUser(true);
    } else if (demoParam === '0' || modeParam === 'live') {
      setDemoMode(false);
      syncModeUser(false);
    }
  }, [searchParams, setDemoMode, syncModeUser]);

  // Hydrate real session or populate demo persona
  useEffect(() => {
    if (isDemoMode && isDemoAllowedInEnv()) {
      if (!user) {
        setDemoUser(DEMO_USERS.student_both);
      } else {
        syncModeUser(true);
      }
    } else {
      syncModeUser(false);
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  return (
    <Suspense fallback={<RouteLoadingFallback />}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/"
          element={
            !user && !isRestoring && !isDemoMode ? (
              <Navigate to={buildLoginRedirectUrl(location.pathname, location.search)} replace />
            ) : (
              <AppShell />
            )
          }
        >
          <Route
            index
            element={
              searchParams.get('view') === 'groups' ||
              searchParams.get('view') === 'grade' ||
              searchParams.get('view') === 'orders' ? (
                <LegacyNotificationRedirect />
              ) : (
                <RoleHome />
              )
            }
          />
          <Route
            path="learning"
            element={
              <RequireRole allowed={['student', 'admin']} allowAssignedCourseTeacher>
                <LearningPage />
              </RequireRole>
            }
          />
          <Route
            path="flashcards"
            element={
              <RequireRole allowed={['student', 'teacher', 'admin']}>
                <FlashcardsPage />
              </RequireRole>
            }
          />
          <Route
            path="classrooms"
            element={
              <RequireRole allowed={['student', 'teacher', 'admin']}>
                <ClassroomsPage />
              </RequireRole>
            }
          />
          <Route path="chat" element={<ChatLayout />} />
          <Route path="notifications" element={<NotificationCenter />} />
          <Route
            path="teacher"
            element={
              <RequireRole allowed={['teacher', 'admin']}>
                <TeacherWorkspace />
              </RequireRole>
            }
          />
          <Route
            path="teacher/:section"
            element={
              <RequireRole allowed={['teacher', 'admin']}>
                <TeacherWorkspace />
              </RequireRole>
            }
          />
          <Route
            path="admin"
            element={
              <RequireRole allowed={['admin']}>
                <AdminWorkspace />
              </RequireRole>
            }
          />
          <Route
            path="admin/:section"
            element={
              <RequireRole allowed={['admin']}>
                <AdminWorkspace />
              </RequireRole>
            }
          />
          <Route path="lop/*" element={<LegacyNotificationRedirect />} />
          <Route path="khoa/*" element={<LegacyNotificationRedirect />} />
          <Route path="nhom-lop" element={<LegacyNotificationRedirect />} />
          <Route path="messages" element={<LegacyNotificationRedirect />} />
          <Route path="messages/*" element={<LegacyNotificationRedirect />} />
          <Route path="dashboard" element={<RoleHome />} />
          <Route path="demo" element={<RoleHome />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
};
