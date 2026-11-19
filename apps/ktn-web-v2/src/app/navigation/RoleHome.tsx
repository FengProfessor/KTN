import React, { Suspense } from 'react';
import { Navigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { StudentHome } from '@/features/dashboard/components/StudentHome';
import { TeacherHome } from '@/features/teacher/components/TeacherHome';
import { AdminHome } from '@/features/admin/components/AdminHome';
import { lazyWithRetry } from '@/lib/lazyWithRetry';
import { useI18n } from '@/i18n';

const ConsultationCrmWorkspace = lazyWithRetry(() =>
  import('@/features/consultations/ConsultationCrmWorkspace').then((m) => ({
    default: m.ConsultationCrmWorkspace,
  }))
);

export const RoleHome: React.FC = () => {
  const user = useAuthStore((s) => s.user);
  const isRestoring = useAuthStore((s) => s.isRestoring);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const { tr } = useI18n();

  if (isRestoring && !isDemoMode) {
    return (
      <div
        data-testid="session-restoring-loader"
        className="flex min-h-[240px] flex-col items-center justify-center rounded-xl border border-stone-200 bg-white p-6 text-center"
      >
        <Loader2 className="h-6 w-6 animate-spin text-red-800" />
        <p className="mt-2 text-xs font-semibold text-stone-600">
          {tr('Đang khôi phục phiên làm việc...', 'Restoring session...')}
        </p>
      </div>
    );
  }

  if (!user && !isDemoMode) {
    return <Navigate to="/login" replace />;
  }

  const role = user?.role;

  switch (role) {
    case 'teacher':
      return <TeacherHome />;
    case 'admin':
      return <AdminHome />;
    case 'advisor':
      return (
        <Suspense
          fallback={
            <div className="flex min-h-[200px] items-center justify-center p-6">
              <Loader2 className="h-6 w-6 animate-spin text-red-800" />
            </div>
          }
        >
          <ConsultationCrmWorkspace />
        </Suspense>
      );
    case 'student':
      return <StudentHome />;
    default:
      if (isDemoMode) {
        return <StudentHome />;
      }
      return <Navigate to="/login" replace />;
  }
};
