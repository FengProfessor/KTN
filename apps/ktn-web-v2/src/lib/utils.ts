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
  let queryCourseId = '';
  let queryLesson = '';
  const qIndex = actionUrl.indexOf('?');
  if (qIndex >= 0) {
    const sp = new URLSearchParams(actionUrl.slice(qIndex + 1));
    queryCourseId = sp.get('courseId') || '';
    queryLesson = sp.get('lesson') || '';
  }
  const khoaMatch = actionUrl.match(/^#\/khoa\/([^/]+)(?:\/bai\/(\d+))?/i);
  const learningMatch = actionUrl.match(/^\/learning\/([^/]+)\/lesson\/(\d+)/i);
  const rawCourseId = String(
    notif.courseId || queryCourseId || khoaMatch?.[1] || learningMatch?.[1] || ''
  ).trim();
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
    let queryExercise = '';
    if (classroomMatch?.[2]) {
      const sp = new URLSearchParams(classroomMatch[2]);
      queryCls = sp.get('class') || '';
      querySession = sp.get('session') || '';
      queryExercise = sp.get('exercise') || '';
    }
    const cls =
      (isLiveClassCourse ? rawCourseId.slice(6) : '') ||
      notif.classCode ||
      queryCls ||
      lopMatch?.[1] ||
      classroomMatch?.[1] ||
      '';
    const rawNum = Number(
      notif.sessionNum ||
        notif.lessonNum ||
        queryExercise ||
        querySession ||
        queryLesson ||
        lopMatch?.[2] ||
        khoaMatch?.[2] ||
        learningMatch?.[2] ||
        0
    );
    const sessionNum = rawNum >= 100 ? Math.floor(rawNum / 100) : rawNum > 0 ? rawNum : 0;
    const exerciseNum = rawNum >= 100 ? rawNum : Number(queryExercise || 0);
    const params = new URLSearchParams();
    if (cls) params.set('class', cls.toUpperCase());
    if (sessionNum > 0) params.set('session', String(sessionNum));
    if (exerciseNum >= 100) params.set('exercise', String(exerciseNum));
    const qs = params.toString();
    return qs ? `/classrooms?${qs}` : '/classrooms';
  }

  // 5. Video course lesson / graded homework / course granted
  if (
    type === 'homework_graded' ||
    type === 'course_granted' ||
    khoaMatch ||
    learningMatch ||
    actionUrl.startsWith('/learning') ||
    actionUrl.startsWith('#/learning')
  ) {
    const courseId = rawCourseId;
    const lessonNum =
      Number(notif.lessonNum || queryLesson || khoaMatch?.[2] || learningMatch?.[2] || 1) || 1;
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

export function resolveHomeworkLink(hw: {
  course_id?: string | null;
  class_code?: string | null;
  lesson_num?: number | null;
}): string {
  const rawCourseId = String(hw.course_id || '').trim();
  const isLiveClass = rawCourseId.toUpperCase().startsWith('CLASS_');
  const rawNum = Number(hw.lesson_num || 1) || 1;

  if (isLiveClass) {
    const cls = (rawCourseId.slice(6) || String(hw.class_code || '')).trim().toUpperCase();
    const sessionNum = rawNum >= 100 ? Math.floor(rawNum / 100) : rawNum > 0 ? rawNum : 1;
    const exerciseNum = rawNum >= 100 ? rawNum : sessionNum * 100 + 1;
    const params = new URLSearchParams();
    if (cls) params.set('class', cls);
    params.set('session', String(sessionNum));
    params.set('exercise', String(exerciseNum));
    return `/classrooms?${params.toString()}`;
  }

  const params = new URLSearchParams();
  if (rawCourseId) params.set('courseId', rawCourseId);
  params.set('lesson', String(rawNum));
  params.set('tab', 'homework');
  return `/learning?${params.toString()}`;
}

export interface CanonicalCourseMeta {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
}

export const CANONICAL_IZTEACH_COURSE_TITLES: Record<string, CanonicalCourseMeta> = {
  '6adadba969897b0002482ca5': {
    id: '6adadba969897b0002482ca5',
    code: 'HSK1-30',
    title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
    shortTitle: 'HSK1 3.0'
  },
  '65e7704a9ea90c00080d5195': {
    id: '65e7704a9ea90c00080d5195',
    code: 'CFK-01',
    title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)',
    shortTitle: 'Chinese For Kids'
  },
  '65e7636a0a1b61000825c2ef': {
    id: '65e7636a0a1b61000825c2ef',
    code: 'MINI-01',
    title: 'Tiếng Trung Trẻ Em Mini 1 (Khóa học cho bé 4 – 6 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 1'
  },
  '6600fa477c18b80008c53c88': {
    id: '6600fa477c18b80008c53c88',
    code: 'MINI-02',
    title: 'Tiếng Trung Trẻ Em Mini 2 (Khóa học cho bé 5 – 7 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 2'
  },
  '6600fa7da2bfe10008834e13': {
    id: '6600fa7da2bfe10008834e13',
    code: 'MINI-03',
    title: 'Tiếng Trung Trẻ Em Mini 3 (Khóa học cho bé 6 – 8 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em Mini 3'
  },
  '65e769bd637339000870618f': {
    id: '65e769bd637339000870618f',
    code: 'KIDS-01',
    title: 'Tiếng Trung Trẻ Em 1 (Lộ trình 6 – 11 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 1'
  },
  '66028938bfd6c90008b816e1': {
    id: '66028938bfd6c90008b816e1',
    code: 'KIDS-02',
    title: 'Tiếng Trung Trẻ Em 2 (Lộ trình 6 – 12 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 2'
  },
  '6638bd09a7367400085c7ab2': {
    id: '6638bd09a7367400085c7ab2',
    code: 'KIDS-03',
    title: 'Tiếng Trung Trẻ Em 3 (Lộ trình 6 – 12 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 3'
  },
  '678d14b960eae20002ddf8fe': {
    id: '678d14b960eae20002ddf8fe',
    code: 'KIDS-04',
    title: 'Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 4'
  },
  '67a7290a5fdc26000238b4e9': {
    id: '67a7290a5fdc26000238b4e9',
    code: 'KIDS-05',
    title: 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 5'
  },
  '67a869302ecb9c000257d966': {
    id: '67a869302ecb9c000257d966',
    code: 'KIDS-06',
    title: 'Tiếng Trung Trẻ Em 6 (Lộ trình 9 – 15 tuổi)',
    shortTitle: 'Tiếng Trung Trẻ Em 6'
  },
  '65e772a1767c56000829518e': {
    id: '65e772a1767c56000829518e',
    code: 'JUNIOR-01',
    title: 'Chinese Junior 1 (Tiếng Trung Thiếu Niên Song Ngữ)',
    shortTitle: 'Chinese Junior 1'
  },
  '6638c76dfac274000876cd13': {
    id: '6638c76dfac274000876cd13',
    code: 'JUNIOR-03',
    title: 'Chinese Junior 3 (Tiếng Trung Thiếu Niên Cấp Độ 3)',
    shortTitle: 'Chinese Junior 3'
  },
  '65e76a533f5e7c00086715d7': {
    id: '65e76a533f5e7c00086715d7',
    code: 'HSK1-20',
    title: 'Khóa học Tiếng Trung HSK 1 & Giao Tiếp Phản Xạ',
    shortTitle: 'Tiếng Trung HSK 1'
  },
  '65f6d1c722106a0008ff81a3': {
    id: '65f6d1c722106a0008ff81a3',
    code: 'HSK-PREP-VN',
    title: 'Khóa học Tiếng Trung + Luyện Thi HSK Chuẩn Quốc Tế',
    shortTitle: 'Tiếng Trung + Luyện Thi HSK'
  },
  '65e773c89ea90c00080d52fc': {
    id: '65e773c89ea90c00080d52fc',
    code: 'HSK-PREP-EN',
    title: 'Chinese + HSK Exam Preparation (Song ngữ Quốc tế)',
    shortTitle: 'Chinese + HSK Exam Prep'
  }
};

const GENERIC_COURSE_LABELS = new Set([
  '',
  'khóa học trực tuyến',
  'khoa hoc truc tuyen',
  'khóa học',
  'khoa hoc',
  'online course',
  'course'
]);

function isGenericCourseTitle(label?: string | null): boolean {
  const clean = String(label || '').trim().toLowerCase();
  return GENERIC_COURSE_LABELS.has(clean);
}

export interface ResolvedStudentCourse {
  id: string;
  code: string;
  title: string;
  shortTitle: string;
  displayLabel: string;
  fullDisplayLabel: string;
}

export function resolveStudentOnlineCourses(
  rawCourses?: Array<{
    id?: string;
    _id?: string;
    code?: string;
    title?: string;
    shortTitle?: string;
  } | string> | null,
  catalogCourses?: Array<{
    id: string;
    code?: string;
    title: string;
    shortTitle?: string;
  }> | null
): ResolvedStudentCourse[] {
  if (!Array.isArray(rawCourses) || rawCourses.length === 0) return [];

  const catalogById = new Map<string, { id: string; code?: string; title: string; shortTitle?: string }>();
  if (Array.isArray(catalogCourses)) {
    for (const c of catalogCourses) {
      const cid = String(c?.id || '').trim();
      if (cid) catalogById.set(cid, c);
    }
  }

  // Deduplicate by canonical course ID while preserving order and best non-generic metadata
  const dedupedById = new Map<
    string,
    { id: string; code: string; title: string; shortTitle: string }
  >();

  for (const item of rawCourses) {
    if (!item) continue;
    const rawId =
      typeof item === 'string'
        ? item.trim()
        : String(item.id || item._id || '').trim();
    if (!rawId) continue;

    const cat = catalogById.get(rawId);
    const fallback = CANONICAL_IZTEACH_COURSE_TITLES[rawId];
    const itemTitle =
      typeof item === 'object' && !isGenericCourseTitle(item.title)
        ? String(item.title || '').trim()
        : '';
    const itemShort =
      typeof item === 'object' && !isGenericCourseTitle(item.shortTitle)
        ? String(item.shortTitle || '').trim()
        : '';
    const itemCode =
      typeof item === 'object' && item.code ? String(item.code).trim() : '';

    const resolvedTitle =
      (cat && !isGenericCourseTitle(cat.title) ? cat.title : '') ||
      itemTitle ||
      fallback?.title ||
      itemShort ||
      `Khóa học (${rawId.slice(-6)})`;

    const resolvedShortTitle =
      (cat && !isGenericCourseTitle(cat.shortTitle) ? cat.shortTitle : '') ||
      itemShort ||
      fallback?.shortTitle ||
      (cat && !isGenericCourseTitle(cat.title) ? cat.title : '') ||
      itemTitle ||
      `Khóa (${rawId.slice(-6)})`;

    const resolvedCode =
      cat?.code || itemCode || fallback?.code || rawId.slice(-6).toUpperCase();

    const existing = dedupedById.get(rawId);
    if (!existing) {
      dedupedById.set(rawId, {
        id: rawId,
        code: resolvedCode,
        title: resolvedTitle,
        shortTitle: resolvedShortTitle
      });
    } else {
      // Upgrade title if previous duplicate had a fallback suffix and current has real title
      if (existing.title.startsWith('Khóa học (') && !resolvedTitle.startsWith('Khóa học (')) {
        existing.title = resolvedTitle;
      }
      if (existing.shortTitle.startsWith('Khóa (') && !resolvedShortTitle.startsWith('Khóa (')) {
        existing.shortTitle = resolvedShortTitle;
      }
    }
  }

  const list = Array.from(dedupedById.values());

  // Check if any courses with different IDs share the same shortTitle or title (either in student list or catalog)
  const shortTitleCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  const allToCount = new Map<string, { shortTitle: string; title: string }>();

  for (const c of list) {
    allToCount.set(c.id, { shortTitle: c.shortTitle, title: c.title });
  }
  if (Array.isArray(catalogCourses)) {
    for (const c of catalogCourses) {
      const cid = String(c?.id || '').trim();
      if (cid && !allToCount.has(cid)) {
        allToCount.set(cid, {
          shortTitle: String(c.shortTitle || c.title || '').trim(),
          title: String(c.title || '').trim()
        });
      }
    }
  }

  for (const [, val] of allToCount.entries()) {
    const sKey = val.shortTitle.toLowerCase();
    const tKey = val.title.toLowerCase();
    shortTitleCounts.set(sKey, (shortTitleCounts.get(sKey) || 0) + 1);
    titleCounts.set(tKey, (titleCounts.get(tKey) || 0) + 1);
  }

  return list.map((c) => {
    const hasShortCollision = (shortTitleCounts.get(c.shortTitle.toLowerCase()) || 0) > 1;
    const hasTitleCollision = (titleCounts.get(c.title.toLowerCase()) || 0) > 1;
    const suffix = `${c.code || c.id.slice(-6)}`;
    const displayLabel = hasShortCollision ? `${c.shortTitle} (${suffix})` : c.shortTitle;
    const fullDisplayLabel = hasTitleCollision
      ? `${c.title} [${c.code ? `${c.code} · ` : ''}${c.id.slice(-6)}]`
      : c.title;
    return {
      ...c,
      shortTitle: displayLabel,
      title: fullDisplayLabel,
      displayLabel,
      fullDisplayLabel
    };
  });
}

export function disambiguateCatalogCourses<
  T extends { id: string; code?: string; title: string; shortTitle?: string }
>(courses?: T[] | null): Array<T & { displayLabel: string; fullDisplayLabel: string }> {
  if (!Array.isArray(courses) || courses.length === 0) return [];
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const c of courses) {
    const cid = String(c?.id || '').trim();
    if (!cid || seen.has(cid)) continue;
    seen.add(cid);
    unique.push(c);
  }

  const shortCounts = new Map<string, number>();
  const titleCounts = new Map<string, number>();
  for (const c of unique) {
    const sKey = String(c.shortTitle || c.title || '').trim().toLowerCase();
    const tKey = String(c.title || '').trim().toLowerCase();
    shortCounts.set(sKey, (shortCounts.get(sKey) || 0) + 1);
    titleCounts.set(tKey, (titleCounts.get(tKey) || 0) + 1);
  }

  return unique.map((c) => {
    const shortLabel = String(c.shortTitle || c.title || '').trim();
    const fullLabel = String(c.title || shortLabel).trim();
    const hasShortDup = (shortCounts.get(shortLabel.toLowerCase()) || 0) > 1;
    const hasTitleDup = (titleCounts.get(fullLabel.toLowerCase()) || 0) > 1;
    const tag = c.code ? `${c.code} · ${c.id.slice(-6)}` : c.id.slice(-6);
    const displayLabel = hasShortDup ? `${shortLabel} (${tag})` : shortLabel;
    const fullDisplayLabel = hasTitleDup ? `${fullLabel} (${tag})` : fullLabel;
    return {
      ...c,
      shortTitle: displayLabel,
      title: fullDisplayLabel,
      displayLabel,
      fullDisplayLabel
    };
  });
}



