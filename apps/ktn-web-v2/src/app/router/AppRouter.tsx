import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useSearchParams, useNavigate } from 'react-router-dom';
import { ShieldAlert, ArrowLeft } from 'lucide-react';
import { AppShell } from '../layouts/AppShell';
import { StudentDashboard } from '@/features/dashboard/components/StudentDashboard';
import { LearningPage } from '@/features/learning/components/LearningPage';
import { ClassroomsPage } from '@/features/classrooms/components/ClassroomsPage';
import { ChatLayout } from '@/features/chat/components/ChatLayout';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';
import { TeacherWorkspace } from '@/features/teacher/components/TeacherWorkspace';
import { AdminWorkspace } from '@/features/admin/components/AdminWorkspace';
import { LoginPage } from '@/features/auth/components/LoginPage';
import { useAuthStore, DEMO_USERS } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import type { UserRole } from '@/types/ktn.types';

const RequireRole: React.FC<{ allowed: UserRole[]; children: React.ReactNode }> = ({
  allowed,
  children
}) => {
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const role: UserRole = user?.role || 'student';

  if (!allowed.includes(role)) {
    return (
      <div
        data-testid="role-forbidden-guard"
        role="alert"
        className="mx-auto my-8 max-w-lg rounded-2xl border border-red-200 bg-white p-6 text-center shadow-card"
      >
        <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-red-50 text-red-700">
          <ShieldAlert className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold text-slate-900">
          Tài khoản không có quyền truy cập khu vực này
        </h2>
        <p className="mt-1.5 text-xs text-slate-600">
          Khu vực này chỉ dành cho vai trò được phân quyền ({allowed.join(', ')}). Vui lòng quay lại trang học tập hoặc đăng nhập đúng tài khoản phụ trách.
        </p>
        <div className="mt-4 flex justify-center">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="inline-flex items-center gap-1.5 rounded-xl bg-ktn-jade px-4 py-2 text-xs font-bold text-white hover:bg-ktn-jade-dark"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Quay về Trang chủ
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export const AppRouter: React.FC = () => {
  const [searchParams] = useSearchParams();
  const user = useAuthStore((s) => s.user);
  const restoreSession = useAuthStore((s) => s.restoreSession);
  const setDemoUser = useAuthStore((s) => s.setDemoUser);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const setDemoMode = useUiStore((s) => s.setDemoMode);

  // Allow URL query ?demo=1 or ?mode=live to switch seamlessly during automated or manual testing
  useEffect(() => {
    const demoParam = searchParams.get('demo');
    const modeParam = searchParams.get('mode');
    if (demoParam === '1' || modeParam === 'demo') {
      setDemoMode(true);
    } else if (demoParam === '0' || modeParam === 'live') {
      setDemoMode(false);
    }
  }, [searchParams, setDemoMode]);

  // Hydrate real session or populate demo persona
  useEffect(() => {
    if (isDemoMode) {
      if (!user) {
        setDemoUser(DEMO_USERS.student_both);
      }
    } else {
      restoreSession();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDemoMode]);

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          !user && !isDemoMode ? <Navigate to="/login" replace /> : <AppShell />
        }
      >
        <Route index element={<StudentDashboard />} />
        <Route path="learning" element={<LearningPage />} />
        <Route path="classrooms" element={<ClassroomsPage />} />
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
          path="admin"
          element={
            <RequireRole allowed={['admin']}>
              <AdminWorkspace />
            </RequireRole>
          }
        />
        <Route path="demo" element={<StudentDashboard />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
};

