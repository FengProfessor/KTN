import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export function formatTimeVi(isoOrMs?: string | number | null): string {
  if (!isoOrMs) return '';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts)) return '';
  const d = new Date(ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

export const formatChatTimestamp = formatTimeVi;

export function formatDayDividerVi(isoOrMs?: string | number | null): string {
  if (!isoOrMs) return 'Hôm nay';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts)) return 'Hôm nay';
  const d = new Date(ts);
  const now = new Date();
  const isToday =
    d.getDate() === now.getDate() &&
    d.getMonth() === now.getMonth() &&
    d.getFullYear() === now.getFullYear();
  if (isToday) return 'Hôm nay';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday =
    d.getDate() === yesterday.getDate() &&
    d.getMonth() === yesterday.getMonth() &&
    d.getFullYear() === yesterday.getFullYear();
  if (isYesterday) return 'Hôm qua';

  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}/${mm}/${d.getFullYear()}`;
}

export const formatDateDivider = formatDayDividerVi;

export function formatRelativeTimeVi(isoOrMs?: string | number | null): string {
  if (!isoOrMs) return 'Vừa xong';
  const ts = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (!Number.isFinite(ts)) return 'Vừa xong';
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'Vừa xong';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHours = Math.floor(diffMin / 60);
  if (diffHours < 24) return `${diffHours} giờ trước`;
  return formatDayDividerVi(ts);
}

export const formatRelativeTime = formatRelativeTimeVi;

export function formatVnd(amount: number): string {
  return new Intl.NumberFormat('vi-VN').format(amount) + 'đ';
}

export function formatFileSize(bytes?: number | null): string {
  if (!bytes || !Number.isFinite(bytes) || bytes <= 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(1)} MB`;
}

export function getInitials(name?: string | null): string {
  const clean = String(name || '').trim();
  if (!clean) return 'KT';
  const parts = clean.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[parts.length - 2][0] + parts[parts.length - 1][0]).toUpperCase();
}

export interface DlpCheckResult {
  blocked: boolean;
  reasons: string[];
  reason?: string;
}

export function inspectDlpClient(text: string): DlpCheckResult {
  const s = String(text || '').trim();
  if (!s) return { blocked: false, reasons: [] };
  const reasons: string[] = [];
  if (/(?<!\d)(?:\+?84|0)(?:\s*[.-]?\s*\d){8,9}(?!\d)/.test(s)) {
    reasons.push('Vì an toàn học đường (DLP), không chia sẻ số điện thoại cá nhân trong nhóm lớp.');
  }
  if (/(?:zalo\.me|facebook\.com|fb\.com|m\.me|t\.me)\//i.test(s)) {
    reasons.push('Vì an toàn học đường (DLP), không gửi liên kết mạng xã hội ngoài luồng.');
  }
  return {
    blocked: reasons.length > 0,
    reasons,
    reason: reasons[0]
  };
}

export const detectDlpViolation = inspectDlpClient;

export function generateClientMessageId(prefix = 'cmsg'): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export const generateClientId = generateClientMessageId;

export interface NotificationLinkInput {
  type?: string;
  actionUrl?: string;
  roomId?: string;
  classCode?: string;
  courseId?: string;
  lessonNum?: number;
  homeworkId?: string;
  sessionNum?: number;
}

export function resolveNotificationLink(notif?: NotificationLinkInput | null): string {
  if (!notif) return '/';
  const type = String(notif.type || '').trim();
  const actionUrl = String(notif.actionUrl || '').trim();

  // 0. Valid external meeting room URL (for class_reminder with online room)
  if (/^https:\/\//i.test(actionUrl)) {
    return actionUrl;
  }

  // 1. Teacher homework grading notification
  if (type === 'homework_submitted' || actionUrl.includes('view=grade')) {
    let hwId = String(notif.homeworkId || '').trim();
    if (!hwId && actionUrl.includes('hwId=')) {
      const m = actionUrl.match(/[?&]hwId=([^&#]+)/);
      if (m?.[1]) hwId = decodeURIComponent(m[1]);
    }
    return hwId ? `/teacher?hwId=${encodeURIComponent(hwId)}` : '/teacher';
  }

  // 2. Admin order notification
  if (
    type === 'order_pending' ||
    actionUrl.includes('view=orders') ||
    actionUrl.includes('/admin')
  ) {
    return '/admin';
  }

  // 3. Chat message or pinned announcement notification (unless actionUrl explicitly points to a video course / learning page)
  const isCourseOrLearningAction =
    actionUrl.includes('/khoa/') ||
    actionUrl.includes('/learning') ||
    actionUrl.includes('courseId=');

  if (
    !isCourseOrLearningAction &&
    (type === 'chat_message' ||
      type === 'announcement_pinned' ||
      type === 'class_announcement' ||
      actionUrl.startsWith('/chat') ||
      actionUrl.startsWith('#/nhom-lop') ||
      actionUrl.includes('view=groups'))
  ) {
    let room = String(notif.roomId || '').trim();
    if (!room && actionUrl.includes('room=')) {
      const m = actionUrl.match(/[?&]room=([^&#]+)/);
      if (m?.[1]) room = decodeURIComponent(m[1]);
    }
    if (!room && notif.classCode) {
      const rawCls = String(notif.classCode).trim();
      room = /^(?:class:|course:|(?:direct:)?student:)/i.test(rawCls)
        ? rawCls.replace(/^direct:student:/i, 'student:')
        : `class:${rawCls.toUpperCase()}`;
    } else if (room && /^direct:student:/i.test(room)) {
      room = room.replace(/^direct:student:/i, 'student:');
    } else if (room && !/^(?:class:|course:|student:)/i.test(room)) {
      room = `class:${room.toUpperCase()}`;
    }
    return room ? `/chat?room=${encodeURIComponent(room)}` : '/chat';
  }

  // 4. Class schedule reminders, schedule changes, session cancellations, live classroom session / live class homework
  const rawCourseId = String(notif.courseId || '').trim();
  const isLiveClassCourse = rawCourseId.toUpperCase().startsWith('CLASS_');
  const lopMatch = actionUrl.match(/^#\/lop\/([^/]+)(?:\/buoi\/(\d+))?/i);
  const classroomMatch = actionUrl.match(/^(?:#)?\/classrooms(?:\/([^/?#]+))?(?:\?(.*))?/i);

  if (
    type === 'class_reminder' ||
    type === 'schedule_changed' ||
    type === 'session_cancelled' ||
    type === 'homework_assigned' ||
    isLiveClassCourse ||
    lopMatch ||
    classroomMatch ||
    actionUrl.startsWith('/classrooms') ||
    actionUrl.startsWith('#/classrooms')
  ) {
    let queryCls = '';
    let querySession = '';
    if (classroomMatch?.[2]) {
      const sp = new URLSearchParams(classroomMatch[2]);
      queryCls = sp.get('class') || '';
      querySession = sp.get('session') || '';
    }
    const cls =
      (isLiveClassCourse ? rawCourseId.slice(6) : '') ||
      notif.classCode ||
      queryCls ||
      lopMatch?.[1] ||
      classroomMatch?.[1] ||
      '';
    const rawNum = Number(notif.sessionNum || notif.lessonNum || querySession || lopMatch?.[2] || 0);
    const sessionNum = rawNum >= 100 ? Math.floor(rawNum / 100) : rawNum > 0 ? rawNum : 0;
    const params = new URLSearchParams();
    if (cls) params.set('class', cls.toUpperCase());
    if (sessionNum > 0) params.set('session', String(sessionNum));
    const qs = params.toString();
    return qs ? `/classrooms?${qs}` : '/classrooms';
  }

  // 5. Video course lesson / graded homework / course granted
  const khoaMatch = actionUrl.match(/^#\/khoa\/([^/]+)(?:\/bai\/(\d+))?/i);
  const learningMatch = actionUrl.match(/^\/learning\/([^/]+)\/lesson\/(\d+)/i);
  if (
    type === 'homework_graded' ||
    type === 'course_granted' ||
    khoaMatch ||
    learningMatch ||
    actionUrl.startsWith('/learning') ||
    actionUrl.startsWith('#/learning')
  ) {
    const courseId = rawCourseId || khoaMatch?.[1] || learningMatch?.[1] || '';
    const lessonNum = Number(notif.lessonNum || khoaMatch?.[2] || learningMatch?.[2] || 1) || 1;
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    if (type !== 'course_granted') {
      params.set('lesson', String(lessonNum));
      params.set('tab', 'homework');
    }
    const qs = params.toString();
    return qs ? `/learning?${qs}` : '/learning';
  }

  if (actionUrl.startsWith('/teacher')) return '/teacher';
  return '/notifications';
}

