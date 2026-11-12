import type { KtnUserSession, UserRole } from '@/types/ktn.types';

export function formatShortPersonName(fullName?: string | null): string {
  const raw = String(fullName || '').trim();
  if (!raw) return 'bạn';
  const cleaned = raw.replace(/^(Bé\s+|Học viên\s+)/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return parts.slice(-2).join(' ');
}

export function resolveHeaderTitle(
  pathname: string,
  role: UserRole,
  user?: KtnUserSession | null
): { title: string; subtitle?: string } {
  if (pathname.startsWith('/chat')) {
    return { title: 'Tin nhắn' };
  }
  if (pathname.startsWith('/learning')) {
    return { title: 'Học tiếp' };
  }
  if (pathname.startsWith('/flashcards')) {
    return { title: 'Flashcard Từ Vựng', subtitle: '605 thẻ · 7 Lộ · Mễ Tự Cách' };
  }
  if (pathname.startsWith('/classrooms')) {
    return { title: 'Lớp của em' };
  }
  if (pathname.startsWith('/notifications')) {
    return { title: 'Thông báo' };
  }
  if (pathname.startsWith('/teacher')) {
    if (pathname.includes('/grading')) return { title: 'Chấm bài' };
    if (pathname.includes('/assign')) return { title: 'Giao bài' };
    if (pathname.includes('/forum')) return { title: 'Hỏi đáp bài học', subtitle: 'Giải đáp & tích điểm đóng góp' };
    return { title: 'Lớp của tôi' };
  }
  if (pathname.startsWith('/admin')) {
    if (pathname.includes('/students')) return { title: 'Học viên' };
    if (pathname.includes('/classes')) return { title: 'Lớp học' };
    if (pathname.includes('/teachers')) return { title: 'Giáo viên', subtitle: 'Hồ sơ, hiệu suất & phê duyệt' };
    if (pathname.includes('/orders')) return { title: 'Đơn hàng' };
    if (pathname.includes('/more')) return { title: 'Đối soát & Đồng bộ' };
    return { title: 'Tổng quan học vụ' };
  }

  // Home route '/'
  if (role === 'teacher') {
    const tName = user?.name || 'Cô giáo';
    return {
      title: `Chào ${tName}`,
      subtitle: 'Sổ lớp của cô',
    };
  }
  if (role === 'admin') {
    return {
      title: 'Quản lý học vụ',
      subtitle: 'Việc cần xử lý hôm nay',
    };
  }

  const shortName = formatShortPersonName(user?.name);
  return {
    title: `Chào ${shortName} 👋`,
    subtitle: user?.classCode ? `Lớp ${user.classCode}` : undefined,
  };
}
