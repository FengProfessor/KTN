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
  id?: string;
  eventId?: string;
  title?: string;
  body?: string;
  type?: string;
  eventType?: string;
  actionUrl?: string;
  action_url?: string;
  url?: string;
  roomId?: string;
  classCode?: string;
  courseId?: string;
  unitId?: string;
  questionId?: string;
  lessonNum?: number;
  homeworkId?: string;
  sessionNum?: number;
  role?: string;
  userRole?: string;
  meta?: Record<string, unknown> | null;
}

export function isTeacherUnassignedNotification(
  notif?: NotificationLinkInput | null
): boolean {
  if (!notif) return false;
  const type = String(notif.type || notif.eventType || '').trim();
  if (type !== 'class_teacher_changed') return false;
  const roleInEvent = String(notif.meta?.roleInEvent || '').trim().toLowerCase();
  if (roleInEvent === 'previous_teacher' || roleInEvent === 'unassigned') return true;
  const idToken = String(notif.id || notif.eventId || '').toLowerCase();
  const textToken = `${notif.title || ''} ${notif.body || ''}`;
  return (
    idToken.includes(':removed') ||
    idToken.includes('_removed') ||
    idToken.includes(':unassigned') ||
    idToken.includes('_unassigned') ||
    /chuyển(?:\s+phân\s+công)?\s+sang\s+giáo\s+viên\s+khác|không còn phụ trách|ngừng phụ trách|thu hồi phân công|đã chuyển quyền chủ nhiệm/i.test(
      textToken
    )
  );
}

export function resolveNotificationLink(
  notif?: NotificationLinkInput | null,
  userRole?: string | null
): string {
  if (!notif) return '/';
  const type = String(notif.type || notif.eventType || '').trim();
  const rawActionUrl = String(notif.actionUrl || notif.action_url || notif.url || '').trim();
  const effectiveRole = String(userRole || notif.userRole || notif.role || '')
    .trim()
    .toLowerCase();

  let actionUrl = rawActionUrl;
  // 0. Valid external meeting room URL (for class_reminder with online room like Zoom/Meet)
  if (/^https?:\/\//i.test(rawActionUrl)) {
    try {
      const parsedUrl = new URL(rawActionUrl);
      const host = parsedUrl.hostname.toLowerCase();
      const isInternalPortal =
        host === 'khongtunhi.com' ||
        host === 'www.khongtunhi.com' ||
        host === 'localhost' ||
        host === '127.0.0.1';
      if (!isInternalPortal) {
        return rawActionUrl;
      }
      actionUrl = `${parsedUrl.pathname}${parsedUrl.search}${parsedUrl.hash}`;
    } catch {
      return rawActionUrl;
    }
  }

  // Normalize /custom-page/so-lien-lac-test#/route or #/route into cleanRoute starting with '/'
  let cleanRoute = actionUrl;
  const hashRouteIdx = actionUrl.indexOf('#/');
  if (hashRouteIdx >= 0) {
    cleanRoute = actionUrl.slice(hashRouteIdx + 1);
  } else if (actionUrl.startsWith('#')) {
    const strippedHash = actionUrl.slice(1);
    cleanRoute = strippedHash.startsWith('/') ? strippedHash : `/${strippedHash}`;
  } else if (/^\/custom-page\/so-lien-lac(?:-test)?/i.test(actionUrl)) {
    const rest = actionUrl.replace(/^\/custom-page\/so-lien-lac(?:-test)?/i, '');
    cleanRoute = rest.startsWith('/') ? rest : rest ? `/${rest}` : '/';
  }

  const normalizeClassCodeValue = (val?: string | null): string => {
    const s = String(val || '')
      .replace(/^class:/i, '')
      .trim()
      .toUpperCase();
    return s;
  };

  // Extract common query parameters from cleanRoute or actionUrl
  let queryCourseId = '';
  let queryLesson = '';
  let queryUnitId = '';
  let queryTab = '';
  let queryQuestionId = '';
  let queryClass = '';
  let queryRoom = '';
  const qIndex = cleanRoute.indexOf('?');
  const fallbackQIndex = actionUrl.indexOf('?');
  const rawQueryString =
    qIndex >= 0
      ? cleanRoute.slice(qIndex + 1)
      : fallbackQIndex >= 0
      ? actionUrl.slice(fallbackQIndex + 1).split('#')[0]
      : '';
  if (rawQueryString) {
    const sp = new URLSearchParams(rawQueryString);
    queryCourseId = sp.get('courseId') || '';
    queryLesson = sp.get('lesson') || '';
    queryUnitId = sp.get('unitId') || '';
    queryTab = sp.get('tab') || '';
    queryQuestionId = sp.get('questionId') || '';
    queryClass = sp.get('class') || sp.get('classCode') || '';
    queryRoom = sp.get('room') || sp.get('roomId') || '';
  }

  const applyRoleSafety = (targetRoute: string): string => {
    if (effectiveRole === 'student') {
      if (targetRoute.startsWith('/admin') || targetRoute.startsWith('/teacher')) {
        const fallbackRoom = String(notif.roomId || queryRoom || '').trim();
        if (fallbackRoom) {
          const normRoom = /^(?:class:|course:|student:)/i.test(fallbackRoom)
            ? fallbackRoom
            : `class:${fallbackRoom.toUpperCase()}`;
          return `/chat?room=${encodeURIComponent(normRoom)}`;
        }
        const fallbackCls = normalizeClassCodeValue(notif.classCode || queryClass);
        if (fallbackCls) {
          return `/classrooms?class=${encodeURIComponent(fallbackCls)}`;
        }
        const fallbackCourse = String(notif.courseId || queryCourseId || '').trim();
        if (fallbackCourse) {
          return `/learning?courseId=${encodeURIComponent(fallbackCourse)}`;
        }
        return '/notifications';
      }
    } else if (effectiveRole === 'teacher') {
      if (targetRoute.startsWith('/admin')) {
        const fallbackCls = normalizeClassCodeValue(notif.classCode || queryClass);
        return fallbackCls
          ? `/teacher/classes?class=${encodeURIComponent(fallbackCls)}`
          : '/teacher/classes';
      }
    }
    return targetRoute;
  };

  // 0.5. Teacher Forum Inbox notification
  if (
    cleanRoute.startsWith('/teacher/forum') ||
    actionUrl.includes('tab=forum_inbox') ||
    (cleanRoute.startsWith('/teacher') && queryTab === 'forum') ||
    (type === 'forum_question' && (cleanRoute.startsWith('/teacher') || effectiveRole === 'teacher'))
  ) {
    const qId = String(notif.questionId || queryQuestionId || '').trim();
    const qs = qId
      ? `?questionId=${encodeURIComponent(qId)}`
      : qIndex >= 0
      ? cleanRoute.slice(qIndex)
      : '';
    return applyRoleSafety(`/teacher/forum${qs}`);
  }

  // 0.6. Class Created / Teacher Reassigned / Course Request Reviewed / Teacher Classes
  const isExplicitChatTarget =
    cleanRoute.startsWith('/chat') ||
    cleanRoute.startsWith('/messages') ||
    cleanRoute.startsWith('/nhom-lop') ||
    actionUrl.startsWith('#/messages') ||
    actionUrl.startsWith('#/nhom-lop') ||
    actionUrl.includes('view=groups');

  if (
    !isExplicitChatTarget &&
    (type === 'class_created' ||
      type === 'class_teacher_changed' ||
      (type === 'schedule_changed' &&
        effectiveRole === 'teacher' &&
        !cleanRoute.startsWith('/classrooms')) ||
      type === 'course_request_reviewed' ||
      cleanRoute.startsWith('/teacher/classes') ||
      (cleanRoute.startsWith('/teacher') && (queryTab === 'students' || queryTab === 'classes')))
  ) {
    if (isTeacherUnassignedNotification(notif)) {
      return applyRoleSafety('/teacher/classes');
    }
    const cls = normalizeClassCodeValue(
      notif.classCode ||
        queryClass ||
        (/^class:/i.test(String(notif.roomId || '')) ? notif.roomId : '')
    );
    if (cls && type !== 'course_request_reviewed') {
      return applyRoleSafety(`/teacher/classes?class=${encodeURIComponent(cls)}`);
    }
    return applyRoleSafety('/teacher/classes');
  }

  // 0.7. Student Joined Class (class_joined) -> opens /classrooms?class=<CODE> unless actionUrl explicitly targets /chat
  if (type === 'class_joined' && !isExplicitChatTarget) {
    const lopJoinMatch = cleanRoute.match(/^\/lop\/([^/?#]+)/i);
    const classroomJoinMatch = cleanRoute.match(/^\/classrooms\/([^/?#]+)/i);
    const cls = normalizeClassCodeValue(
      notif.classCode ||
        queryClass ||
        lopJoinMatch?.[1] ||
        classroomJoinMatch?.[1] ||
        (/^class:/i.test(String(notif.roomId || '')) ? notif.roomId : '')
    );
    return applyRoleSafety(cls ? `/classrooms?class=${encodeURIComponent(cls)}` : '/classrooms');
  }

  // 1. Teacher homework grading notification
  if (type === 'homework_submitted' || actionUrl.includes('view=grade')) {
    let hwId = String(notif.homeworkId || '').trim();
    if (!hwId && actionUrl.includes('hwId=')) {
      const m = actionUrl.match(/[?&]hwId=([^&#]+)/);
      if (m?.[1]) hwId = decodeURIComponent(m[1]);
    }
    return applyRoleSafety(hwId ? `/teacher?hwId=${encodeURIComponent(hwId)}` : '/teacher');
  }

  // 2. Admin order or teacher approval notification
  if (cleanRoute.startsWith('/admin/teachers')) {
    return applyRoleSafety('/admin/teachers');
  }
  if (
    type === 'order_pending' ||
    type === 'course_request_pending' ||
    actionUrl.includes('view=orders') ||
    cleanRoute.startsWith('/admin') ||
    actionUrl.includes('/admin')
  ) {
    return applyRoleSafety('/admin');
  }

  // 3. Chat message or pinned announcement notification (unless actionUrl explicitly points to a video course / learning page)
  const isCourseOrLearningAction =
    cleanRoute.includes('/khoa/') ||
    cleanRoute.includes('/learning') ||
    actionUrl.includes('/khoa/') ||
    actionUrl.includes('/learning') ||
    Boolean(queryCourseId) ||
    type === 'forum_question' ||
    type === 'forum_question_created' ||
    type === 'forum_answer' ||
    type === 'forum_answer_posted' ||
    type === 'forum_answer_accepted';

  if (
    !isCourseOrLearningAction &&
    (type === 'chat_message' ||
      type === 'chat_group_message' ||
      type === 'chat_private_message' ||
      type === 'chat_course_message' ||
      type === 'announcement_pinned' ||
      type === 'class_announcement' ||
      isExplicitChatTarget)
  ) {
    let room = String(notif.roomId || queryRoom || '').trim();
    if (!room && /(?:[?&])(?:room|roomId)=([^&#]+)/.test(actionUrl)) {
      const m = actionUrl.match(/(?:[?&])(?:room|roomId)=([^&#]+)/);
      if (m?.[1]) room = decodeURIComponent(m[1]);
    }
    if (!room && (notif.classCode || queryClass)) {
      const rawCls = String(notif.classCode || queryClass).trim();
      room = /^(?:class:|course:|(?:direct:)?student:)/i.test(rawCls)
        ? rawCls.replace(/^direct:student:/i, 'student:')
        : `class:${rawCls.toUpperCase()}`;
    } else if (room && /^direct:student:/i.test(room)) {
      room = room.replace(/^direct:student:/i, 'student:');
    } else if (room && !/^(?:class:|course:|student:)/i.test(room)) {
      room = `class:${room.toUpperCase()}`;
    } else if (room && /^class:/i.test(room)) {
      room = `class:${room.slice(6).trim().toUpperCase()}`;
    }
    return applyRoleSafety(room ? `/chat?room=${encodeURIComponent(room)}` : '/chat');
  }

  // 4. Class schedule reminders, schedule changes, session cancellations, live classroom session / live class homework
  const khoaMatch = cleanRoute.match(/^\/khoa\/([^/?#]+)(?:\/bai\/(\d+))?/i);
  const learningMatch = cleanRoute.match(/^\/learning\/([^/?#]+)\/lesson\/(\d+)/i);
  const rawCourseId = String(
    notif.courseId || queryCourseId || khoaMatch?.[1] || learningMatch?.[1] || ''
  ).trim();
  const isLiveClassCourse = rawCourseId.toUpperCase().startsWith('CLASS_');
  const lopMatch = cleanRoute.match(/^\/lop\/([^/?#]+)(?:\/buoi\/(\d+))?/i);
  const classroomMatch = cleanRoute.match(/^\/classrooms(?:\/([^/?#]+))?(?:\?(.*))?/i);

  const isOnlineVideoCourseHwAssigned =
    type === 'homework_assigned' &&
    Boolean(rawCourseId) &&
    !isLiveClassCourse &&
    !notif.classCode &&
    !queryClass &&
    !lopMatch &&
    !classroomMatch;

  if (
    !isOnlineVideoCourseHwAssigned &&
    (type === 'class_reminder' ||
      type === 'schedule_changed' ||
      type === 'session_cancelled' ||
      type === 'homework_assigned' ||
      type === 'class_joined' ||
      isLiveClassCourse ||
      lopMatch ||
      classroomMatch ||
      cleanRoute.startsWith('/classrooms'))
  ) {
    let queryCls = queryClass;
    let querySession = '';
    let queryExercise = '';
    if (classroomMatch?.[2]) {
      const sp = new URLSearchParams(classroomMatch[2]);
      queryCls = sp.get('class') || sp.get('classCode') || queryCls;
      querySession = sp.get('session') || '';
      queryExercise = sp.get('exercise') || '';
    }
    const cls = normalizeClassCodeValue(
      (isLiveClassCourse ? rawCourseId.slice(6) : '') ||
        notif.classCode ||
        queryCls ||
        lopMatch?.[1] ||
        classroomMatch?.[1] ||
        (/^class:/i.test(String(notif.roomId || '')) ? notif.roomId : '')
    );
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
    if (cls) params.set('class', cls);
    if (sessionNum > 0) params.set('session', String(sessionNum));
    if (exerciseNum >= 100) params.set('exercise', String(exerciseNum));
    const qs = params.toString();
    return applyRoleSafety(qs ? `/classrooms?${qs}` : '/classrooms');
  }

  // 5. Video course lesson / graded homework / course granted / lesson forum Q&A
  const isForumType =
    type === 'forum_question' ||
    type === 'forum_question_created' ||
    type === 'forum_answer' ||
    type === 'forum_answer_posted' ||
    type === 'forum_answer_accepted' ||
    queryTab === 'forum' ||
    Boolean(notif.questionId || queryQuestionId);

  if (
    type === 'homework_graded' ||
    type === 'course_granted' ||
    isOnlineVideoCourseHwAssigned ||
    isForumType ||
    khoaMatch ||
    learningMatch ||
    cleanRoute.startsWith('/learning')
  ) {
    const courseId = rawCourseId;
    const lessonNum =
      Number(notif.lessonNum || queryLesson || khoaMatch?.[2] || learningMatch?.[2] || 1) || 1;
    const unitId = String(notif.unitId || queryUnitId || '').trim();
    const questionId = String(notif.questionId || queryQuestionId || '').trim();
    const params = new URLSearchParams();
    if (courseId) params.set('courseId', courseId);
    if (unitId) params.set('unitId', unitId);
    if (type !== 'course_granted') {
      params.set('lesson', String(lessonNum));
      params.set('tab', isForumType ? 'forum' : queryTab || 'homework');
    }
    if (questionId) params.set('questionId', questionId);
    const qs = params.toString();
    return applyRoleSafety(qs ? `/learning?${qs}` : '/learning');
  }

  if (cleanRoute.startsWith('/teacher')) {
    return applyRoleSafety(cleanRoute);
  }
  return '/notifications';
}

export function sanitizePostLoginRedirect(
  rawRedirect?: string | null,
  userRole?: string | null
): string {
  const raw = String(rawRedirect || '').trim();
  if (!raw) return '/';
  let cleaned = raw;
  if (cleaned.includes('#/')) {
    cleaned = cleaned.slice(cleaned.indexOf('#/') + 1);
  } else if (cleaned.startsWith('#')) {
    cleaned = cleaned.slice(1);
  }
  cleaned = cleaned.replace(/^\/custom-page\/so-lien-lac(?:-test)?/i, '');
  if (!cleaned.startsWith('/') || cleaned.startsWith('//') || cleaned.startsWith('/login')) {
    return '/';
  }
  if (cleaned === '/dashboard' || cleaned.startsWith('/dashboard?')) {
    return '/';
  }
  if (
    cleaned.startsWith('/lop/') ||
    cleaned.startsWith('/khoa/') ||
    cleaned.startsWith('/nhom-lop') ||
    cleaned.startsWith('/messages') ||
    cleaned.includes('view=groups') ||
    cleaned.includes('view=grade') ||
    cleaned.includes('view=orders')
  ) {
    cleaned = resolveNotificationLink({ actionUrl: `#${cleaned}` }, userRole);
  }
  const role = String(userRole || '').trim().toLowerCase();
  if (role === 'student' && (cleaned.startsWith('/admin') || cleaned.startsWith('/teacher'))) {
    return resolveNotificationLink({ actionUrl: cleaned }, 'student');
  }
  if (role === 'teacher' && cleaned.startsWith('/admin')) {
    return resolveNotificationLink({ actionUrl: cleaned }, 'teacher');
  }
  return cleaned || '/';
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
  '661528ea42af880008944573': {
    id: '661528ea42af880008944573',
    code: 'CFK-03',
    title: 'Chinese For Kids 3 (Khóa học cho bé 7 – 9 tuổi)',
    shortTitle: 'Chinese For Kids 3'
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
  userPermissionId?: string | null;
  limitTime?: string | null;
  expiresAt?: string | null;
  durationPreset?: CourseDurationPresetOptionId;
  isExpired?: boolean;
  syncStatus?: string;
  updatedAt?: string | null;
}

export function resolveStudentOnlineCourses(
  rawCourses?: Array<{
    id?: string;
    _id?: string;
    code?: string;
    title?: string;
    shortTitle?: string;
    userPermissionId?: string | null;
    limitTime?: string | null;
    expiresAt?: string | null;
    durationPreset?: CourseDurationPresetOptionId;
    isExpired?: boolean;
    syncStatus?: string;
    updatedAt?: string | null;
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
    {
      id: string;
      code: string;
      title: string;
      shortTitle: string;
      userPermissionId?: string | null;
      limitTime?: string | null;
      expiresAt?: string | null;
      durationPreset?: CourseDurationPresetOptionId;
      isExpired?: boolean;
      syncStatus?: string;
      updatedAt?: string | null;
    }
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

    const itemObj = typeof item === 'object' ? item : null;
    const existing = dedupedById.get(rawId);
    if (!existing) {
      dedupedById.set(rawId, {
        id: rawId,
        code: resolvedCode,
        title: resolvedTitle,
        shortTitle: resolvedShortTitle,
        userPermissionId: itemObj?.userPermissionId ?? null,
        limitTime: itemObj?.limitTime ?? null,
        expiresAt: itemObj?.expiresAt ?? null,
        durationPreset: itemObj?.durationPreset,
        isExpired: itemObj?.isExpired ?? false,
        syncStatus: itemObj?.syncStatus || 'synced',
        updatedAt: itemObj?.updatedAt ?? null,
      });
    } else {
      // Upgrade title if previous duplicate had a fallback suffix and current has real title
      if (existing.title.startsWith('Khóa học (') && !resolvedTitle.startsWith('Khóa học (')) {
        existing.title = resolvedTitle;
      }
      if (existing.shortTitle.startsWith('Khóa (') && !resolvedShortTitle.startsWith('Khóa (')) {
        existing.shortTitle = resolvedShortTitle;
      }
      if (itemObj) {
        if (!existing.userPermissionId && itemObj.userPermissionId) {
          existing.userPermissionId = itemObj.userPermissionId;
        }
        // Prefer unlimited or non-expired entitlement when multiple permissions exist
        if (existing.isExpired && itemObj.isExpired === false) {
          existing.limitTime = itemObj.limitTime ?? null;
          existing.expiresAt = itemObj.expiresAt ?? null;
          existing.durationPreset = itemObj.durationPreset;
          existing.isExpired = false;
          if (itemObj.userPermissionId) existing.userPermissionId = itemObj.userPermissionId;
        } else if (existing.limitTime && (itemObj.limitTime === null || itemObj.limitTime === undefined)) {
          existing.limitTime = null;
          existing.expiresAt = null;
          existing.durationPreset = 'unlimited';
          existing.isExpired = false;
        } else if (
          existing.limitTime &&
          itemObj.limitTime &&
          String(itemObj.limitTime) > String(existing.limitTime)
        ) {
          existing.limitTime = itemObj.limitTime;
          existing.expiresAt = itemObj.expiresAt ?? existing.expiresAt;
          existing.durationPreset = itemObj.durationPreset ?? existing.durationPreset;
        }
        if (itemObj.syncStatus && itemObj.syncStatus !== 'synced') {
          existing.syncStatus = itemObj.syncStatus;
        }
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

/**
 * Shared Vietnamese accent-insensitive search normalizer.
 * Strips diacritics, converts đ/Đ -> d, lowercases, and collapses whitespace.
 */
export function normalizeVietnameseText(raw?: string | null): string {
  return String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

export const normalizeViSearchText = normalizeVietnameseText;

export type CourseDurationPresetOptionId =
  | '1w'
  | '2w'
  | '1m'
  | '2m'
  | '3m'
  | 'unlimited'
  | `${number}${'d' | 'w' | 'm'}`
  | string;

export type CourseDurationUnitOption = 'd' | 'w' | 'm' | 'unlimited';

export const COURSE_DURATION_UNIT_OPTIONS: Array<{
  id: CourseDurationUnitOption;
  label: string;
}> = [
  { id: 'd', label: 'Ngày' },
  { id: 'w', label: 'Tuần' },
  { id: 'm', label: 'Tháng' },
  { id: 'unlimited', label: 'Vĩnh viễn' },
];

export const COURSE_DURATION_PRESET_OPTIONS: Array<{
  id: CourseDurationPresetOptionId;
  label: string;
}> = [
  { id: '1w', label: '1 tuần' },
  { id: '2w', label: '2 tuần' },
  { id: '1m', label: '1 tháng' },
  { id: '2m', label: '2 tháng' },
  { id: '3m', label: '3 tháng' },
  { id: 'unlimited', label: 'Vĩnh viễn' },
];

export function parseCourseDurationPreset(preset?: string | null): {
  value: number;
  unit: CourseDurationUnitOption;
} {
  const s = String(preset || '').trim().toLowerCase();
  if (!s || s === 'unlimited' || s === 'forever' || s === 'permanent' || s === 'vinh_vien') {
    return { value: 1, unit: 'unlimited' };
  }
  const m = s.match(/^([1-9]\d{0,2})([dwm])$/);
  if (m) {
    const val = Math.min(365, Math.max(1, Number(m[1])));
    const unit = m[2] as 'd' | 'w' | 'm';
    return { value: val, unit };
  }
  return { value: 1, unit: 'unlimited' };
}

export function buildCourseDurationPreset(
  value: number | string,
  unit: CourseDurationUnitOption
): string {
  if (unit === 'unlimited') return 'unlimited';
  const num = Number(value);
  const clamped = Number.isFinite(num) ? Math.min(365, Math.max(1, Math.floor(num))) : 1;
  return `${clamped}${unit}`;
}

export function formatCourseDurationPresetLabel(preset?: string | null): string {
  const parsed = parseCourseDurationPreset(preset);
  if (parsed.unit === 'unlimited') return 'Vĩnh viễn';
  if (parsed.unit === 'd') return `${parsed.value} ngày`;
  if (parsed.unit === 'w') return `${parsed.value} tuần`;
  return `${parsed.value} tháng`;
}

export function getHoChiMinhCalendarDateString(nowMs: number = Date.now()): string {
  const ts = Number.isFinite(Number(nowMs)) ? Number(nowMs) : Date.now();
  return new Date(ts + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function extractCalendarDateFromLimitTime(limitTime?: string | null): string | null {
  if (limitTime === null || limitTime === undefined || limitTime === '') return null;
  const s = String(limitTime).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10);
  }
  const ts = Date.parse(s);
  if (Number.isFinite(ts)) {
    return getHoChiMinhCalendarDateString(ts);
  }
  return null;
}

export function addPresetToCalendarDate(
  baseYmd: string | null | undefined,
  preset: CourseDurationPresetOptionId
): string | null {
  if (!preset || preset === 'unlimited') return null;
  const parsed = parseCourseDurationPreset(preset);
  if (parsed.unit === 'unlimited') return null;
  const cleanYmd =
    extractCalendarDateFromLimitTime(baseYmd) || getHoChiMinhCalendarDateString();
  const m = cleanYmd.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);

  if (parsed.unit === 'd' || parsed.unit === 'w') {
    const addDays = parsed.unit === 'w' ? parsed.value * 7 : parsed.value;
    const d = new Date(Date.UTC(year, month - 1, day + addDays));
    return d.toISOString().slice(0, 10);
  }

  const addMonths = parsed.value;
  const totalMonths = year * 12 + (month - 1) + addMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const maxDayInTargetMonth = new Date(Date.UTC(targetYear, targetMonth, 0)).getUTCDate();
  const clampedDay = Math.min(day, maxDayInTargetMonth);
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}-${String(clampedDay).padStart(2, '0')}`;
}

export function toIzTeachExpiresAtIso(limitTime?: string | null): string | null {
  if (limitTime === null || limitTime === undefined || limitTime === '') return null;
  const s = String(limitTime).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return `${s}T23:59:59.999Z`;
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {
    return s;
  }
  const ts = Date.parse(s);
  if (Number.isFinite(ts)) {
    return new Date(ts).toISOString();
  }
  return null;
}

export interface CourseExpirationDisplayInfo {
  statusKey: 'unlimited' | 'active' | 'expiring_soon' | 'expired' | 'sync_error';
  adminStatusLabel: 'Vĩnh viễn' | 'Còn hạn' | 'Sắp hết hạn' | 'Đã hết hạn' | 'Đồng bộ lỗi';
  adminCompactText: string;
  studentCardText: string;
  isUnlimited: boolean;
  isExpiringSoon: boolean;
  isExpired: boolean;
  isSyncError: boolean;
  remainingMs: number | null;
  remainingDays: number | null;
  expiresAtIso: string | null;
  limitDateYmd: string | null;
}

export function computeCourseExpirationInfo(
  course?: {
    limitTime?: string | null;
    expiresAt?: string | null;
    isExpired?: boolean;
    syncStatus?: string | null;
  } | null,
  nowMs: number = Date.now()
): CourseExpirationDisplayInfo {
  const rawSync = String(course?.syncStatus || 'synced').trim().toLowerCase();
  const isSyncError =
    rawSync === 'partial_failure' || rawSync === 'sync_failed' || rawSync === 'error';

  const rawLimit = course?.expiresAt || course?.limitTime || null;
  const expiresAtIso = toIzTeachExpiresAtIso(rawLimit);
  const limitDateYmd = extractCalendarDateFromLimitTime(rawLimit);

  if (!expiresAtIso) {
    if (course?.isExpired === true) {
      return {
        statusKey: isSyncError ? 'sync_error' : 'expired',
        adminStatusLabel: isSyncError ? 'Đồng bộ lỗi' : 'Đã hết hạn',
        adminCompactText: isSyncError ? 'Đồng bộ lỗi' : 'Đã hết hạn',
        studentCardText: 'Đã hết hạn · Gia hạn',
        isUnlimited: false,
        isExpiringSoon: false,
        isExpired: true,
        isSyncError,
        remainingMs: 0,
        remainingDays: 0,
        expiresAtIso: null,
        limitDateYmd: null,
      };
    }
    return {
      statusKey: isSyncError ? 'sync_error' : 'unlimited',
      adminStatusLabel: isSyncError ? 'Đồng bộ lỗi' : 'Vĩnh viễn',
      adminCompactText: isSyncError ? 'Đồng bộ lỗi' : 'Vĩnh viễn',
      studentCardText: 'Không giới hạn thời gian',
      isUnlimited: true,
      isExpiringSoon: false,
      isExpired: false,
      isSyncError,
      remainingMs: null,
      remainingDays: null,
      expiresAtIso: null,
      limitDateYmd: null,
    };
  }

  const expMs = Date.parse(expiresAtIso);
  const remainingMs = Number.isFinite(expMs) ? expMs - nowMs : 0;

  if (remainingMs <= 0) {
    return {
      statusKey: isSyncError ? 'sync_error' : 'expired',
      adminStatusLabel: isSyncError ? 'Đồng bộ lỗi' : 'Đã hết hạn',
      adminCompactText: isSyncError ? 'Đồng bộ lỗi' : 'Đã hết hạn',
      studentCardText: 'Đã hết hạn · Gia hạn',
      isUnlimited: false,
      isExpiringSoon: false,
      isExpired: true,
      isSyncError,
      remainingMs: 0,
      remainingDays: 0,
      expiresAtIso,
      limitDateYmd,
    };
  }

  const sevenDaysMs = 7 * 86400 * 1000;
  const remainingDays = Math.max(1, Math.ceil(remainingMs / 86400000));

  if (remainingMs <= sevenDaysMs) {
    const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const hhmmss = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    const ddStr = String(days).padStart(2, '0');
    return {
      statusKey: isSyncError ? 'sync_error' : 'expiring_soon',
      adminStatusLabel: isSyncError ? 'Đồng bộ lỗi' : 'Sắp hết hạn',
      adminCompactText: isSyncError ? `Còn ${remainingDays} ngày · Đồng bộ lỗi` : `Còn ${remainingDays} ngày`,
      studentCardText: `Sắp hết hạn · ${ddStr} ngày ${hhmmss}`,
      isUnlimited: false,
      isExpiringSoon: true,
      isExpired: false,
      isSyncError,
      remainingMs,
      remainingDays,
      expiresAtIso,
      limitDateYmd,
    };
  }

  return {
    statusKey: isSyncError ? 'sync_error' : 'active',
    adminStatusLabel: isSyncError ? 'Đồng bộ lỗi' : 'Còn hạn',
    adminCompactText: isSyncError ? `Còn ${remainingDays} ngày · Đồng bộ lỗi` : `Còn ${remainingDays} ngày`,
    studentCardText: `Thời hạn học: còn ${remainingDays} ngày`,
    isUnlimited: false,
    isExpiringSoon: false,
    isExpired: false,
    isSyncError,
    remainingMs,
    remainingDays,
    expiresAtIso,
    limitDateYmd,
  };
}





