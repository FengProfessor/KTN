import type { KtnUserSession } from '@/types/ktn.types';

export interface WatermarkIdentityLines {
  primaryLine: string;
  secondaryLine: string;
}

export function maskPhoneForWatermark(rawPhone?: string | null): string {
  const digits = String(rawPhone || '').replace(/\D+/g, '');
  if (digits.length < 7) return '';
  return `${digits.slice(0, 4)}***${digits.slice(-3)}`;
}

export function formatClockHhMm(now: Date = new Date()): string {
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export function buildLearnerWatermarkLines(
  user: KtnUserSession | null | undefined,
  fallbackLabel = 'KHỔNG TỬ NHÍ · HỌC THỬ',
  now: Date = new Date()
): WatermarkIdentityLines {
  const maskedPhone = maskPhoneForWatermark(user?.phone);
  const parts = user?.email
    ? [user.code, user.email, maskedPhone].filter(
        (v): v is string => typeof v === 'string' && v.trim().length > 0
      )
    : [];

  return {
    primaryLine: parts.length > 0 ? parts.join(' · ') : fallbackLabel,
    secondaryLine: `KTN BẢN QUYỀN · ${formatClockHhMm(now)}`,
  };
}
