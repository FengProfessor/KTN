import { useCallback } from 'react';
import { useUiStore } from '@/stores/useUiStore';
import {
  APP_LANGUAGE_STORAGE_KEY,
  persistLanguage,
  readInitialLanguage,
  syncDocumentLang,
  type AppLanguage,
} from './langStorage';

export {
  APP_LANGUAGE_STORAGE_KEY,
  persistLanguage,
  readInitialLanguage,
  syncDocumentLang,
  type AppLanguage,
};

export function getCurrentLang(): AppLanguage {
  return useUiStore.getState().lang;
}

export function trStatic(vi: string, en: string, langOverride?: AppLanguage): string {
  const lang = langOverride ?? getCurrentLang();
  return lang === 'en' ? en : vi;
}

export function useI18n() {
  const lang = useUiStore((s) => s.lang);
  const setLang = useUiStore((s) => s.setLang);
  const toggleLang = useUiStore((s) => s.toggleLang);
  const isEn = lang === 'en';
  const tr = useCallback((vi: string, en: string) => (isEn ? en : vi), [isEn]);
  return { lang, isEn, setLang, toggleLang, tr };
}

export function translateDayLabel(label?: string | null, langOverride?: AppLanguage): string {
  const raw = String(label || '');
  const lang = langOverride ?? getCurrentLang();
  if (lang !== 'en' || !raw) return raw;

  return raw
    .replace(/\bThứ\s*Hai\b/gi, 'Mon')
    .replace(/\bThứ\s*Ba\b/gi, 'Tue')
    .replace(/\bThứ\s*Tư\b/gi, 'Wed')
    .replace(/\bThứ\s*Năm\b/gi, 'Thu')
    .replace(/\bThứ\s*Sáu\b/gi, 'Fri')
    .replace(/\bThứ\s*Bảy\b/gi, 'Sat')
    .replace(/\bChủ\s*Nhật\b/gi, 'Sun')
    .replace(/\bThứ\s*2\b/gi, 'Mon')
    .replace(/\bThứ\s*3\b/gi, 'Tue')
    .replace(/\bThứ\s*4\b/gi, 'Wed')
    .replace(/\bThứ\s*5\b/gi, 'Thu')
    .replace(/\bThứ\s*6\b/gi, 'Fri')
    .replace(/\bThứ\s*7\b/gi, 'Sat')
    .replace(/\bT2\b/g, 'Mon')
    .replace(/\bT3\b/g, 'Tue')
    .replace(/\bT4\b/g, 'Wed')
    .replace(/\bT5\b/g, 'Thu')
    .replace(/\bT6\b/g, 'Fri')
    .replace(/\bT7\b/g, 'Sat')
    .replace(/\bCN\b/g, 'Sun');
}

export function translateScheduleText(text?: string | null, langOverride?: AppLanguage): string {
  const raw = String(text || '');
  const lang = langOverride ?? getCurrentLang();
  if (lang !== 'en' || !raw) return raw;

  const trimmed = raw.trim();
  if (trimmed === 'Chưa có lịch học chính thức') return 'Official schedule pending';
  if (trimmed === 'Chưa phân công giáo viên') return 'No teacher assigned yet';
  if (trimmed === 'Chưa xếp lớp') return 'Unassigned';

  let out = translateDayLabel(trimmed, 'en');
  out = out
    .replace(/\bCa\s+tối\b/gi, 'Evening')
    .replace(/\bCa\s+sáng\b/gi, 'Morning')
    .replace(/\bCa\s+chiều\b/gi, 'Afternoon')
    .replace(/\bHằng\s+tuần\b/gi, 'Weekly')
    .replace(/\bMỗi\s+tuần\b/gi, 'Weekly')
    .replace(/\bLớp\s+trực\s+tiếp\b/gi, 'Live Class')
    .replace(/\bLớp\s+/gi, 'Class ')
    .replace(/\bBuổi\s+(\d+)/gi, 'Session $1')
    .replace(/\bBài\s+(\d+)/gi, 'Lesson $1')
    .replace(/\bChưa\s+có\s+lịch\s+học\s+chính\s+thức\b/gi, 'Official schedule pending')
    .replace(/\bChưa\s+phân\s+công\s+giáo\s+viên\b/gi, 'No teacher assigned yet');
  return out;
}

export function translateRoleLabel(role?: string | null, langOverride?: AppLanguage): string {
  const lang = langOverride ?? getCurrentLang();
  const r = String(role || '').toLowerCase();
  if (r === 'teacher') return lang === 'en' ? 'Teacher' : 'Giáo viên';
  if (r === 'admin') return lang === 'en' ? 'Admin' : 'Quản lý';
  return lang === 'en' ? 'Student' : 'Học viên';
}

export function translateCourseTitle(title?: string | null, langOverride?: AppLanguage): string {
  const raw = String(title || '');
  const lang = langOverride ?? getCurrentLang();
  if (lang !== 'en' || !raw) return raw;

  const exactMap: Record<string, string> = {
    'Khóa học Tiêu Chuẩn New HSK 1 (3.0)': 'Standard New HSK 1 (3.0) Course',
    'Khóa học Tiêu Chuẩn New HSK 2 (3.0)': 'Standard New HSK 2 (3.0) Course',
    'Khóa học Tiêu Chuẩn New HSK 3 (3.0)': 'Standard New HSK 3 (3.0) Course',
    'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)': 'Chinese For Kids (Ages 5–6)',
    'Chinh phục YCT 1 cho học sinh Tiểu học': 'Conquer YCT 1 for Primary Students',
    'Khóa học HSK 1 (Giáo trình chuẩn Hán ngữ)': 'HSK 1 Standard Chinese Course',
    'Khóa học tiếng Trung Khổng Tử Nhí': 'Khong Tu Nhi Chinese Course',
    'Khóa học HSK1': 'HSK1 Course',
  };
  if (exactMap[raw.trim()]) return exactMap[raw.trim()];

  return raw
    .replace(/^Khóa\s+học\s+Tiêu\s+Chuẩn\s+New\s+HSK\s+(\d+)\s*\(3\.0\)$/i, 'Standard New HSK $1 (3.0) Course')
    .replace(/^Khóa\s+học\s+tiếng\s+Trung\s+/i, 'Chinese Course ')
    .replace(/^Khóa\s+học\s+/i, '')
    .replace(/\bBài\s+(\d+):/gi, 'Lesson $1:');
}

export function translateNotificationItem<
  T extends { title?: string; body?: string; actionLabel?: string }
>(notif: T, langOverride?: AppLanguage): T {
  const lang = langOverride ?? getCurrentLang();
  if (lang !== 'en') return notif;

  let title = String(notif.title || '');
  let body = String(notif.body || '');
  let actionLabel = notif.actionLabel ? String(notif.actionLabel) : notif.actionLabel;

  title = title
    .replace(/^Cô Linh vừa chấm bài của con$/i, 'Ms. Linh just graded your homework')
    .replace(/^(.+?)\s+vừa chấm bài của (?:con|bạn|em)$/i, '$1 just graded your homework')
    .replace(/^Tin nhắn mới từ\s+(.+)$/i, 'New message from $1')
    .replace(/^Cô giáo giao bài tập mới$/i, 'Teacher assigned new homework')
    .replace(/^Giáo viên vừa giao bài tập mới$/i, 'Teacher assigned new homework')
    .replace(/^Nhắc lịch học$/i, 'Class schedule reminder')
    .replace(/^Cập nhật lịch học$/i, 'Schedule update')
    .replace(/^Cập nhật phân công lớp/i, 'Class assignment update')
    .replace(/^Học viên vừa nộp bài tập$/i, 'Student submitted homework')
    .replace(/^Câu hỏi mới trong bài học$/i, 'New lesson Q&A question')
    .replace(/^Có câu trả lời mới cho câu hỏi của (?:bạn|em|con)$/i, 'New reply to your question');

  body = translateScheduleText(body, 'en')
    .replace(/\[Đã đính kèm tệp:\s*([^\]]+)\]/gi, '[Attached file: $1]')
    .replace(/\[Đã (?:gửi|đính kèm) (?:ảnh|hình ảnh)(?::\s*([^\]]*))?\]/gi, (_, name) =>
      name ? `[Attached image: ${name}]` : '[Attached image]'
    )
    .replace(/\[Ảnh đính kèm\]/gi, '[Attached image]')
    .replace(/(\d+(?:[.,]\d+)?)\s*\/\s*10\s*điểm/gi, '$1/10 pts')
    .replace(/(\d+)\s*điểm\b/gi, '$1 pts')
    .replace(/\bThu âm\b/gi, 'Recording');

  if (actionLabel) {
    actionLabel = actionLabel
      .replace(/^Xem chi tiết$/i, 'View details')
      .replace(/^Mở bài học$/i, 'Open lesson')
      .replace(/^Xem bài chấm$/i, 'View grade')
      .replace(/^Trả lời$/i, 'Reply')
      .replace(/^Xem lớp$/i, 'View class')
      .replace(/^Vào lớp$/i, 'Open class')
      .replace(/^Xem tin nhắn$/i, 'View chat');
  }

  return {
    ...notif,
    title,
    body,
    actionLabel,
  };
}
