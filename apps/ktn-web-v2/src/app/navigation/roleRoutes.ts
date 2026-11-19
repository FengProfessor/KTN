import type { KtnUserSession, UserRole } from '@/types/ktn.types';
import { type AppLanguage, trStatic } from '@/i18n';

export function formatShortPersonName(
  fullName?: string | null,
  lang?: AppLanguage
): string {
  const raw = String(fullName || '').trim();
  if (!raw) return trStatic('bạn', 'there', lang);
  const cleaned = raw.replace(/^(Bé\s+|Học viên\s+)/i, '').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length <= 2) return cleaned;
  return parts.slice(-2).join(' ');
}

export function resolveHeaderTitle(
  pathname: string,
  role: UserRole,
  user?: KtnUserSession | null,
  lang?: AppLanguage
): { title: string; subtitle?: string } {
  if (pathname.startsWith('/chat')) {
    return { title: trStatic('Tin nhắn', 'Messages', lang) };
  }
  if (pathname.startsWith('/learning')) {
    return { title: trStatic('Học tiếp', 'Lessons', lang) };
  }
  if (pathname.startsWith('/flashcards')) {
    return {
      title: trStatic('Flashcard Từ Vựng', 'Vocabulary Flashcards', lang),
      subtitle: trStatic(
        '605 thẻ · 7 Lộ · Mễ Tự Cách',
        '605 cards · 7 Paths · Mi Zi Ge',
        lang
      ),
    };
  }
  if (pathname.startsWith('/games')) {
    return {
      title: trStatic('Trò chơi tiếng Trung', 'Chinese Games', lang),
      subtitle: trStatic('Vừa chơi vừa nhớ từ vựng', 'Learn & play vocabulary games', lang),
    };
  }
  if (pathname.startsWith('/classrooms')) {
    return { title: trStatic('Lớp của em', 'My Classrooms', lang) };
  }
  if (pathname.startsWith('/notifications')) {
    return { title: trStatic('Thông báo', 'Notifications', lang) };
  }
  if (pathname.startsWith('/profile')) {
    return { title: trStatic('Hồ sơ cá nhân', 'My Profile', lang) };
  }
  if (pathname.startsWith('/teacher')) {
    if (pathname.includes('/grading')) return { title: trStatic('Chấm bài', 'Grading', lang) };
    if (pathname.includes('/assign')) return { title: trStatic('Giao bài', 'Assignments', lang) };
    if (pathname.includes('/forum')) {
      return {
        title: trStatic('Hỏi đáp bài học', 'Lesson Q&A', lang),
        subtitle: trStatic(
          'Giải đáp & tích điểm đóng góp',
          'Answer student questions & earn points',
          lang
        ),
      };
    }
    return { title: trStatic('Lớp của tôi', 'My Classes', lang) };
  }
  if (pathname.startsWith('/admin')) {
    if (pathname.includes('/students')) return { title: trStatic('Học viên', 'Students', lang) };
    if (pathname.includes('/classes')) return { title: trStatic('Lớp học', 'Classes', lang) };
    if (pathname.includes('/teachers')) {
      return {
        title: trStatic('Giáo viên', 'Teachers', lang),
        subtitle: trStatic(
          'Hồ sơ, hiệu suất & phê duyệt',
          'Profiles, performance & approvals',
          lang
        ),
      };
    }
    if (pathname.includes('/orders')) return { title: trStatic('Đơn hàng', 'Orders', lang) };
    if (pathname.includes('/consultations')) {
      return {
        title: trStatic('Tư vấn', 'Consultations', lang),
        subtitle: trStatic('Zalo OA, Web Chat & SePay', 'Zalo OA, Web Chat & SePay', lang),
      };
    }
    if (pathname.includes('/more')) {
      return { title: trStatic('Đối soát & Đồng bộ', 'Reconciliation & Sync', lang) };
    }
    return { title: trStatic('Tổng quan học vụ', 'Academic Overview', lang) };
  }
  if (pathname.startsWith('/consultations')) {
    return {
      title: trStatic('Tư vấn', 'Consultations', lang),
      subtitle: trStatic('Zalo OA, Web Chat & SePay', 'Zalo OA, Web Chat & SePay', lang),
    };
  }

  // Home route '/'
  if (role === 'teacher') {
    const tName = user?.name || trStatic('Cô giáo', 'Teacher', lang);
    return {
      title: trStatic(`Chào ${tName}`, `Hi, ${tName}`, lang),
      subtitle: trStatic('Sổ lớp của cô', 'Teacher Portal', lang),
    };
  }
  if (role === 'admin') {
    return {
      title: trStatic('Quản lý học vụ', 'Academic Operations', lang),
      subtitle: trStatic('Việc cần xử lý hôm nay', 'Tasks for today', lang),
    };
  }
  if (role === 'advisor') {
    return {
      title: trStatic(
        `Chào ${user?.name || 'Tư vấn viên'}`,
        `Hi, ${user?.name || 'Advisor'}`,
        lang
      ),
      subtitle: trStatic('Hộp thư tư vấn KTN', 'KTN Consultation Desk', lang),
    };
  }

  const shortName = formatShortPersonName(user?.name, lang);
  return {
    title: trStatic(`Chào ${shortName} 👋`, `Hi, ${shortName} 👋`, lang),
    subtitle: user?.classCode
      ? trStatic(`Lớp ${user.classCode}`, `Class ${user.classCode}`, lang)
      : undefined,
  };
}
