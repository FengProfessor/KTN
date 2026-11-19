import { trStatic, type AppLanguage } from '@/i18n';

export interface LeadSourceBadgeMeta {
  key: 'zalo_oa' | 'web_chat' | 'messenger' | 'authenticated_student' | 'website';
  label: string;
  badgeClass: string;
}

export function getLeadSourceBadgeMeta(
  source?: string | null,
  sourceLabel?: string | null,
  lang?: AppLanguage,
  variant: 'short' | 'drawer' = 'short'
): LeadSourceBadgeMeta {
  const raw = String(source || '').trim().toLowerCase();
  const rawLabel = String(sourceLabel || '').trim();

  if (raw === 'zalo_oa' || rawLabel.toLowerCase() === 'zalo oa') {
    return {
      key: 'zalo_oa',
      label: 'Zalo OA',
      badgeClass: 'bg-sky-100 text-sky-900 border-sky-200',
    };
  }

  if (raw === 'web_chat' || raw === 'consultation' || raw === 'web') {
    return {
      key: 'web_chat',
      label: 'Web Chat',
      badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-200',
    };
  }

  if (raw === 'messenger') {
    return {
      key: 'messenger',
      label: 'Messenger',
      badgeClass: 'bg-blue-100 text-blue-900 border-blue-200',
    };
  }

  if (raw === 'authenticated_student') {
    const label =
      variant === 'drawer'
        ? trStatic('Học viên đang đăng nhập', 'Logged-in student', lang)
        : trStatic('HV đăng nhập', 'Logged-in student', lang);
    return {
      key: 'authenticated_student',
      label,
      badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
    };
  }

  if (rawLabel) {
    if (rawLabel === 'HV đăng nhập') {
      return {
        key: 'authenticated_student',
        label: trStatic('HV đăng nhập', 'Logged-in student', lang),
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      };
    }
    if (rawLabel === 'Học viên đang đăng nhập') {
      return {
        key: 'authenticated_student',
        label: trStatic('Học viên đang đăng nhập', 'Logged-in student', lang),
        badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-200',
      };
    }
    return {
      key: 'website',
      label: rawLabel,
      badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
    };
  }

  return {
    key: 'website',
    label: 'Website',
    badgeClass: 'bg-stone-100 text-stone-700 border-stone-200',
  };
}

export function isSandboxSimulatorAllowed(): boolean {
  if (typeof window !== 'undefined') {
    const hn = String(window.location?.hostname || '').toLowerCase();
    if (hn === 'khongtunhi.com' || hn.endsWith('.khongtunhi.com')) {
      return false;
    }
  }
  return Boolean(
    import.meta.env.DEV ||
      import.meta.env.MODE === 'test' ||
      import.meta.env.VITE_ENABLE_SANDBOX_SIMULATOR === 'true'
  );
}
