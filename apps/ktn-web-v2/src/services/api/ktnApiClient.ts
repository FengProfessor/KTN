import type {
  ClassScheduleConfig,
  ClassScheduleException,
  CustomClassSession,
  KtnAttendanceResponse,
  KtnClassItem,
  KtnClassSession,
  KtnCourse,
  KtnCourseGrantRequest,
  KtnExerciseAttachment,
  KtnForumAnswer,
  KtnForumAttachment,
  KtnForumLeaderboardEntry,
  KtnForumQuestion,
  KtnHomework,
  KtnHomeworkAssignment,
  KtnLessonUnit,
  KtnNotification,
  KtnOrder,
  KtnProvisionStudentResponse,
  KtnSessionExercise,
  KtnStudentRecord,
  KtnStudentSearchResult,
  KtnSyncStatusResponse,
  KtnTeacherContributionEvent,
  KtnTeacherRecord,
  KtnTeacherSearchResult,
  KtnUserSession,
  KtnVietQrPaymentInfo,
  OrderContactStatus,
  OrderPaymentDetailedStatus,
  UpcomingClassSession,
  UserNotificationSettings
} from '@/types/ktn.types';

import { normalizeViSearchText, normalizeVietnameseText } from '@/lib/utils';

export type { KtnExerciseAttachment, KtnSessionExercise, KtnTeacherSearchResult };
export { normalizeViSearchText, normalizeVietnameseText };

export const MAX_HOMEWORK_ATTACHMENT_BYTES = 50 * 1024 * 1024;

export const ALLOWED_HOMEWORK_ATTACHMENT_EXTENSIONS: Record<string, string> = {
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  ogg: 'audio/ogg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm'
};

export function formatBytes(bytes?: number | null): string {
  const num = Number(bytes || 0);
  if (!Number.isFinite(num) || num <= 0) return '0 KB';
  if (num < 1024) return `${num} B`;
  if (num < 1024 * 1024) return `${(num / 1024).toFixed(1)} KB`;
  return `${(num / (1024 * 1024)).toFixed(1)} MB`;
}

export function filterAndPaginateTeachersClientSide(
  teachers: KtnTeacherRecord[],
  params?: {
    q?: string;
    status?: string;
    classCode?: string;
    courseId?: string;
    limit?: number;
    offset?: number;
  }
): KtnTeacherSearchResult {
  const qNorm = normalizeViSearchText(params?.q || '');
  const qCompact = qNorm.replace(/\s+/g, '');
  const qDigits = String(params?.q || '').replace(/\D+/g, '');
  const statusFilter = String(params?.status || 'ALL').toUpperCase();
  const classCodeFilter = String(params?.classCode || '').trim().toUpperCase();
  const courseIdFilter = String(params?.courseId || '').trim().toUpperCase();
  const limit = Math.max(1, Math.min(100, Number(params?.limit) || 20));
  const offset = Math.max(0, Number(params?.offset) || 0);

  const filtered = (Array.isArray(teachers) ? teachers : []).filter((t) => {
    const isActive = t.active !== false && t.status !== 'locked' && t.status !== 'inactive';
    const assignedClasses = Array.isArray(t.assigned_classes) ? t.assigned_classes : [];
    const assignedCourses = Array.isArray(t.assigned_courses) ? t.assigned_courses : [];

    if (statusFilter === 'ACTIVE' && !isActive) return false;
    if ((statusFilter === 'INACTIVE' || statusFilter === 'LOCKED') && isActive) return false;
    if (statusFilter === 'UNASSIGNED' && assignedClasses.length > 0) return false;

    if (
      classCodeFilter &&
      classCodeFilter !== 'ALL' &&
      !assignedClasses.some((c) => String(c || '').trim().toUpperCase() === classCodeFilter)
    ) {
      return false;
    }

    if (
      courseIdFilter &&
      courseIdFilter !== 'ALL' &&
      !assignedCourses.some((c) => String(c || '').trim().toUpperCase() === courseIdFilter)
    ) {
      return false;
    }

    if (!qNorm) return true;

    const rawHaystack = [
      t.name,
      t.email,
      t.code,
      t.phone,
      t.specialty,
      t.specialization,
      assignedClasses.join(' '),
      assignedCourses.join(' ')
    ]
      .filter(Boolean)
      .join(' ');
    const normHaystack = normalizeViSearchText(rawHaystack);
    const compactHaystack = normHaystack.replace(/\s+/g, '');
    const phoneDigits = String(t.phone || '').replace(/\D+/g, '');
    return (
      normHaystack.includes(qNorm) ||
      (Boolean(qCompact) && compactHaystack.includes(qCompact)) ||
      (qDigits.length >= 3 && phoneDigits.includes(qDigits)) ||
      rawHaystack.toLowerCase().includes(String(params?.q || '').trim().toLowerCase())
    );
  });

  const totalCount = filtered.length;
  const items = filtered.slice(offset, offset + limit);
  const hasMore = offset + items.length < totalCount;

  return {
    ok: true,
    items,
    totalCount,
    hasMore,
    limit,
    offset
  };
}

const SESSION_STORAGE_KEY = 'ktn_sll_persistent_auth_v2';

const localUploadedBlobUrls = new Map<string, string>();

export function registerLocalUploadedMediaPreview(remoteUrl: string, file: Blob): void {
  if (!remoteUrl || typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function') {
    return;
  }
  try {
    const objectUrl = URL.createObjectURL(file);
    localUploadedBlobUrls.set(remoteUrl, objectUrl);
  } catch {
    // Ignore blob URL creation errors in non-browser runtimes
  }
}

export function resolveUploadedMediaUrl(url?: string | null): string {
  const clean = String(url || '').trim();
  if (!clean) return '';
  return localUploadedBlobUrls.get(clean) || clean;
}

export class KtnApiError extends Error {
  public readonly status: number;
  public readonly code?: string;
  public readonly isNetworkError: boolean;
  public readonly dlpBlocked: boolean;

  constructor(options: {
    message: string;
    status: number;
    code?: string;
    isNetworkError?: boolean;
    dlpBlocked?: boolean;
  }) {
    super(options.message);
    this.name = 'KtnApiError';
    this.status = options.status;
    this.code = options.code;
    this.isNetworkError = Boolean(options.isNetworkError);
    this.dlpBlocked = Boolean(options.dlpBlocked);
  }
}

let inMemorySession: KtnUserSession | null = null;

export function getStoredSession(): KtnUserSession | null {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    // Ignore localStorage access error (e.g. Safari Private Browsing / restricted WebView)
  }
  if (!raw) {
    try {
      raw = sessionStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      // Ignore sessionStorage access error
    }
  }
  if (!raw) {
    return inMemorySession;
  }
  try {
    const parsed = JSON.parse(raw) as KtnUserSession & {
      accessToken?: string;
      roles?: string[];
      type?: string;
    };
    if (!parsed || !parsed.email || parsed.token === 'DEMO-MODE-ONLY') {
      return inMemorySession;
    }
    if (!parsed.token && parsed.accessToken) {
      parsed.token = parsed.accessToken;
    }
    if (!parsed.role) {
      const roles = Array.isArray(parsed.roles) ? parsed.roles : [];
      if (roles.includes('admin') || roles.includes('root') || parsed.type === 'admin') {
        parsed.role = 'admin';
      } else if (roles.includes('teacher') || parsed.type === 'teacher') {
        parsed.role = 'teacher';
      } else {
        parsed.role = 'student';
      }
    }
    inMemorySession = parsed;
    return parsed;
  } catch {
    return inMemorySession;
  }
}

export function saveStoredSession(session: KtnUserSession, token?: string): KtnUserSession {
  const effectiveToken = token || session.token || '';
  if (effectiveToken === 'DEMO-MODE-ONLY') {
    return session;
  }
  const merged: KtnUserSession = {
    ...session,
    token: effectiveToken
  };
  inMemorySession = merged;
  const serialized = JSON.stringify(merged);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, serialized);
    localStorage.removeItem('ol-credentials-auth-user');
  } catch {
    // Ignore localStorage quota/privacy error
  }
  try {
    sessionStorage.setItem(SESSION_STORAGE_KEY, serialized);
    sessionStorage.removeItem('ol-credentials-auth-user');
  } catch {
    // Ignore sessionStorage quota/privacy error
  }
  return merged;
}

export function clearStoredSession(): void {
  inMemorySession = null;
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('ol-credentials-auth-user');
  } catch {
    // Ignore
  }
  try {
    sessionStorage.removeItem(SESSION_STORAGE_KEY);
    sessionStorage.removeItem('ol-credentials-auth-user');
  } catch {
    // Ignore
  }
}

function getApiBase(): string {
  const envBase = import.meta.env.VITE_KTN_API_BASE;
  if (typeof envBase === 'string' && envBase.trim()) {
    return envBase.trim().replace(/\/$/, '');
  }
  return '';
}

export async function ktnRequest<T>(
  path: string,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<T> {
  const session = getStoredSession();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (
    session?.token &&
    session.token !== 'DEMO-MODE-ONLY' &&
    !session.token.startsWith('KTN-')
  ) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (options.signal) {
    if (options.signal.aborted) {
      controller.abort();
    } else {
      options.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }
  }

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}${path}`, {
      ...options,
      headers,
      credentials: 'same-origin',
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (options.signal?.aborted) {
      throw err instanceof Error && err.name === 'AbortError'
        ? err
        : new DOMException('Yêu cầu đã bị hủy.', 'AbortError');
    }
    throw new KtnApiError({
      message: 'Mất kết nối mạng hoặc máy chủ không phản hồi.',
      status: 0,
      code: 'NETWORK_ERROR',
      isNetworkError: true
    });
  } finally {
    clearTimeout(timer);
  }

  let data: Record<string, unknown> | null = null;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = null;
  }

  if (!res.ok || (data && data.ok === false)) {
    throw new KtnApiError({
      message:
        (typeof data?.message === 'string' && data.message) ||
        `Yêu cầu không thành công (HTTP ${res.status})`,
      status: res.status || 500,
      code: typeof data?.error === 'string' ? data.error : undefined,
      dlpBlocked: Boolean(data?.dlpBlocked)
    });
  }

  return (data ?? {}) as T;
}

export const ktnApi = {
  async login(email: string, password: string): Promise<{ session: KtnUserSession; token: string }> {
    const res = await ktnRequest<{
      ok: boolean;
      session: KtnUserSession;
      token: string;
    }>('/api/ktn/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    const saved = saveStoredSession(res.session, res.token);
    return { session: saved, token: res.token };
  },

  async verifySession(): Promise<KtnUserSession | null> {
    const stored = getStoredSession();
    if (!stored?.token) return null;
    const tokenAtStart = stored.token;
    try {
      const res = await ktnRequest<{
        ok: boolean;
        authenticated: boolean;
        session: KtnUserSession;
        token: string;
      }>('/api/ktn/auth/session');
      const latest = getStoredSession();
      if (latest?.token && latest.token !== tokenAtStart) {
        return latest;
      }
      if (res.authenticated && res.session) {
        return saveStoredSession(res.session, res.token || tokenAtStart);
      }
      clearStoredSession();
      return null;
    } catch (err) {
      const latest = getStoredSession();
      if (latest?.token && latest.token !== tokenAtStart) {
        return latest;
      }
      if (err instanceof KtnApiError && (err.status === 401 || err.status === 403)) {
        clearStoredSession();
        return null;
      }
      return stored;
    }
  },

  async logout(): Promise<void> {
    try {
      let unsubscribeEndpoint = '';
      if (typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window) {
        try {
          const reg = await navigator.serviceWorker.getRegistration('/');
          const sub = await reg?.pushManager?.getSubscription();
          if (sub?.endpoint) {
            unsubscribeEndpoint = String(sub.endpoint).trim();
          }
        } catch {
          // ignore
        }
      }
      await ktnRequest('/api/ktn/auth/logout', {
        method: 'POST',
        body: JSON.stringify(unsubscribeEndpoint ? { unsubscribeEndpoint } : {})
      });
    } catch {
      // Best-effort server revoke, always clear client state
    } finally {
      clearStoredSession();
    }
  },

  async getStudentMe(sync = false): Promise<KtnStudentRecord> {
    const res = await ktnRequest<{ ok: boolean; student: KtnStudentRecord }>(
      `/api/ktn/students/me${sync ? '?sync=1' : ''}`
    );
    return res.student;
  },

  async getCourses(): Promise<KtnCourse[]> {
    const res = await ktnRequest<{ ok: boolean; courses: KtnCourse[] }>('/api/ktn/courses');
    return Array.isArray(res.courses) ? res.courses : [];
  },

  async getCourseUnits(courseId: string): Promise<KtnLessonUnit[]> {
    const res = await ktnRequest<{ ok: boolean; units: Array<Record<string, unknown>> }>(
      `/api/ktn/courses/units?courseId=${encodeURIComponent(courseId)}`
    );
    const rawUnits = Array.isArray(res.units) ? res.units : [];
    const vendorId = '3529cd2b-7af6-4fda-887c-392a79393d6a';
    const sorted = [...rawUnits].sort(
      (a, b) => Number(a?.index ?? a?.num ?? 0) - Number(b?.index ?? b?.num ?? 0)
    );
    return sorted.map((u, idx) => {
      const unitId = String(u.unitId || u._id || u.id || `unit-${idx + 1}`).trim();
      const resources = Array.isArray(u.resources) ? (u.resources as Array<Record<string, unknown>>) : [];
      const rawVid = String(
        u.videoId ||
          (typeof u.video === 'string' ? u.video : '') ||
          resources[0]?._id ||
          resources[0]?.id ||
          ''
      ).trim();
      const isHexVid = /^[0-9a-f]{24}$/i.test(rawVid);
      const streamUrl = String(
        u.streamUrl ||
          (rawVid.startsWith('http')
            ? rawVid
            : isHexVid
            ? `https://media.izteach.vn/${vendorId}/${rawVid}/playlist.m3u8`
            : '')
      );
      const posterUrl = String(
        u.posterUrl ||
          (isHexVid ? `https://media.izteach.vn/${vendorId}/${rawVid}/thumbnail.jpg` : '')
      );
      const durMs = Number(u.durationMs || resources[0]?.duration || 0);
      const duration = String(
        u.duration ||
          (durMs > 0
            ? `${Math.floor(durMs / 60000)}:${String(Math.floor((durMs % 60000) / 1000)).padStart(2, '0')}`
            : '15:00')
      );
      const num = Number(u.lessonNumber ?? u.num) > 0 ? Number(u.lessonNumber ?? u.num) : idx + 1;
      return {
        ...(u as unknown as KtnLessonUnit),
        id: unitId,
        _id: unitId,
        unitId,
        num,
        lessonNumber: typeof u.lessonNumber === 'number' ? u.lessonNumber : num,
        partNumber:
          typeof u.partNumber === 'string' || typeof u.partNumber === 'number'
            ? (u.partNumber as string | number)
            : null,
        partLabel: typeof u.partLabel === 'string' || u.partLabel === null ? (u.partLabel as string | null) : null,
        unitType: (u.unitType as KtnLessonUnit['unitType']) || 'lesson',
        rawTitle: typeof u.rawTitle === 'string' ? u.rawTitle : String(u.title || `Bài ${num}`),
        title: String(u.title || `Bài ${num}`),
        titleZh: typeof u.titleZh === 'string' ? u.titleZh : '',
        titleVi: typeof u.titleVi === 'string' ? u.titleVi : '',
        grammar: typeof u.grammar === 'string' ? u.grammar : '',
        sgkPage: typeof u.sgkPage === 'number' ? u.sgkPage : null,
        sbtPage: typeof u.sbtPage === 'number' ? u.sbtPage : null,
        voVietPage: typeof u.voVietPage === 'number' ? u.voVietPage : null,
        audioTracks: Array.isArray(u.audioTracks) ? (u.audioTracks as KtnLessonUnit['audioTracks']) : [],
        materials: Array.isArray(u.materials) ? (u.materials as KtnLessonUnit['materials']) : [],
        homeworkAssignment: (u.homeworkAssignment as KtnHomeworkAssignment | null) || null,
        parts: Array.isArray(u.parts) ? (u.parts as KtnLessonUnit['parts']) : [],
        videoId: rawVid || undefined,
        streamUrl,
        posterUrl,
        duration
      };
    });
  },

  async getCourseHomeworkConfigs(courseId: string): Promise<Record<string, KtnHomeworkAssignment>> {
    const res = await ktnRequest<{ ok: boolean; configs: Record<string, KtnHomeworkAssignment> }>(
      `/api/ktn/courses/homework-configs?courseId=${encodeURIComponent(courseId)}`
    );
    return res.configs || {};
  },

  async saveCourseHomeworkConfig(payload: {
    courseId: string;
    lessonNumber?: number | null;
    unitId?: string | null;
    assigned: boolean;
    mandatory?: boolean;
    title: string;
    instructions: string;
    relatedPages?: string | null;
    allowedTypes?: Array<'audio' | 'image' | 'pdf' | 'video' | 'text'>;
    maxFiles?: number;
    deadline?: string | null;
    completionCriteria?: string | null;
    sampleMaterialUrl?: string | null;
  }): Promise<{ ok: boolean; config: KtnHomeworkAssignment }> {
    return ktnRequest('/api/ktn/courses/homework-configs', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getClasses(): Promise<KtnClassItem[]> {
    const res = await ktnRequest<{ ok: boolean; classes: KtnClassItem[] }>('/api/ktn/classes');
    return (Array.isArray(res.classes) ? res.classes : []).filter((c) => c.active !== false);
  },

  async saveClass(payload: {
    id: string;
    classCode?: string;
    name: string;
    mode?: 'create' | 'update';
    isNew?: boolean;
    clientRequestId?: string;
    teacher_code?: string;
    teacherCode?: string;
    teacher_email?: string;
    teacherEmail?: string;
    schedule?: string;
    total_lessons?: number;
    totalLessons?: number;
    current_lesson?: number;
    currentLesson?: number;
    active?: boolean;
    scheduleConfig?: Partial<ClassScheduleConfig> & {
      daysOfWeek?: number[];
      startTime?: string;
      endTime?: string;
      timezone?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      mode?: 'weekly' | 'custom_sessions';
      scheduleMode?: 'weekly' | 'custom_sessions';
      customSessions?: CustomClassSession[];
      exceptions?: ClassScheduleException[];
      meetingUrl?: string;
      status?: 'confirmed' | 'unconfirmed' | 'paused';
      notifyMembers?: boolean;
    };
  }): Promise<{
    ok: boolean;
    classItem: KtnClassItem;
    roomId?: string;
    chatRoom?: Record<string, unknown>;
    scheduleConfig?: ClassScheduleConfig | null;
    idempotentReplay?: boolean;
    message?: string;
  }> {
    const cleanCode = String(payload.id || payload.classCode || '')
      .trim()
      .toUpperCase();
    return ktnRequest('/api/ktn/classes', {
      method: 'POST',
      headers: payload.clientRequestId
        ? { 'Idempotency-Key': payload.clientRequestId }
        : undefined,
      body: JSON.stringify({
        ...payload,
        id: cleanCode,
        classCode: cleanCode,
      })
    });
  },

  async createClass(payload: {
    id?: string;
    classCode?: string;
    name: string;
    clientRequestId?: string;
    teacher_code?: string;
    teacherCode?: string;
    teacher_email?: string;
    teacherEmail?: string;
    schedule?: string;
    total_lessons?: number;
    totalLessons?: number;
    scheduleConfig?: Partial<ClassScheduleConfig> & {
      daysOfWeek?: number[];
      startTime?: string;
      endTime?: string;
      timezone?: string;
      effectiveFrom?: string;
      effectiveUntil?: string | null;
      mode?: 'weekly' | 'custom_sessions';
      scheduleMode?: 'weekly' | 'custom_sessions';
      customSessions?: CustomClassSession[];
      exceptions?: ClassScheduleException[];
      meetingUrl?: string;
      status?: 'confirmed' | 'unconfirmed' | 'paused';
      notifyMembers?: boolean;
    };
  }) {
    const cleanCode = String(payload.id || payload.classCode || '')
      .trim()
      .toUpperCase();
    return this.saveClass({
      ...payload,
      id: cleanCode,
      classCode: cleanCode,
      mode: 'create',
      isNew: true,
    });
  },

  async deleteClass(
    classCodeOrPayload:
      | string
      | {
          id?: string;
          classCode?: string;
          confirmClassCode?: string;
          reason?: string;
        }
  ): Promise<{
    ok: boolean;
    deletedClassId?: string;
    classCode?: string;
    active?: boolean;
    studentCount?: number;
    message?: string;
  }> {
    const rawCode =
      typeof classCodeOrPayload === 'string'
        ? classCodeOrPayload
        : classCodeOrPayload.classCode || classCodeOrPayload.id || '';
    const cleanCode = String(rawCode || '').trim().toUpperCase();
    if (!cleanCode) {
      throw new KtnApiError({
        message: 'Thiếu mã lớp cần xóa.',
        status: 400,
        code: 'MISSING_CLASS_CODE',
      });
    }
    const confirmCode =
      typeof classCodeOrPayload === 'object' && classCodeOrPayload.confirmClassCode
        ? String(classCodeOrPayload.confirmClassCode).trim().toUpperCase()
        : cleanCode;
    const reason =
      typeof classCodeOrPayload === 'object' && classCodeOrPayload.reason
        ? String(classCodeOrPayload.reason).trim()
        : undefined;
    return ktnRequest(
      `/api/ktn/classes?classCode=${encodeURIComponent(cleanCode)}&id=${encodeURIComponent(cleanCode)}`,
      {
        method: 'DELETE',
        body: JSON.stringify({
          id: cleanCode,
          classCode: cleanCode,
          confirmClassCode: confirmCode,
          confirmDelete: true,
          ...(reason ? { reason } : {}),
        }),
      }
    );
  },

  async getClassSchedule(classCode: string): Promise<{
    ok: boolean;
    classCode: string;
    className: string;
    scheduleStatus: 'confirmed' | 'legacy_unconfirmed' | 'unconfirmed' | 'paused';
    officialScheduleText: string;
    legacyScheduleText: string;
    scheduleConfig: ClassScheduleConfig | null;
    suggestedFromLegacyText?: {
      daysOfWeek?: number[];
      startTime?: string;
      endTime?: string;
      legacyText?: string;
    } | null;
    upcomingSessions: UpcomingClassSession[];
    nextSession: UpcomingClassSession | null;
  }> {
    return ktnRequest(
      `/api/ktn/classes/schedule?classCode=${encodeURIComponent(classCode)}`
    );
  },

  async saveClassSchedule(payload: {
    classCode: string;
    daysOfWeek?: number[];
    dayOfWeek?: string | number | number[];
    startTime: string;
    endTime: string;
    timezone?: string;
    effectiveFrom?: string;
    effectiveUntil?: string | null;
    mode?: 'weekly' | 'custom_sessions';
    customSessions?: CustomClassSession[];
    exceptions?: ClassScheduleException[];
    meetingUrl?: string;
    status?: 'confirmed' | 'unconfirmed' | 'paused';
    notifyMembers?: boolean;
  }): Promise<{
    ok: boolean;
    classCode: string;
    scheduleStatus: 'confirmed' | 'unconfirmed' | 'paused';
    officialScheduleText: string;
    scheduleConfig: ClassScheduleConfig;
    upcomingSessions: UpcomingClassSession[];
    nextSession: UpcomingClassSession | null;
    message: string;
  }> {
    return ktnRequest('/api/ktn/classes/schedule', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async runScheduleReminders(payload?: {
    nowMs?: number;
    dryRun?: boolean;
    classCode?: string;
  }): Promise<{
    ok: boolean;
    checkedAt: string;
    vnNow: string;
    remindedSessionsCount: number;
    dispatchedCount: number;
    skippedDuplicatesCount: number;
    details: Array<Record<string, unknown>>;
  }> {
    return ktnRequest('/api/ktn/schedule/run-reminders', {
      method: 'POST',
      body: JSON.stringify(payload || {})
    });
  },

  async getClassSessions(classCode: string): Promise<KtnClassSession[]> {
    const res = await ktnRequest<{ ok: boolean; sessions: KtnClassSession[] }>(
      `/api/ktn/class-sessions?classCode=${encodeURIComponent(classCode)}`
    );
    return Array.isArray(res.sessions) ? res.sessions : [];
  },

  async saveClassSession(payload: {
    classCode: string;
    sessionNum: number;
    title: string;
    mode?: 'append_exercise' | 'update_exercise' | 'upsert';
    exercise?: KtnSessionExercise;
    preserveExistingExercises?: boolean;
    preserveDefaultExercises?: boolean;
    status?: 'draft' | 'published';
    suppressDuplicateNotification?: boolean;
    exercises: Array<{
      id?: string;
      num: number;
      title: string;
      prompt: string;
      type: string;
      submissionType?: string;
      dueDate?: string;
      status?: 'draft' | 'published';
      attachments?: KtnExerciseAttachment[];
    }>;
  }): Promise<KtnClassSession> {
    const res = await ktnRequest<{ ok: boolean; sessionItem: KtnClassSession }>(
      '/api/ktn/class-sessions',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return res.sessionItem;
  },

  async presignUpload(payload: {
    fileName: string;
    fileType: string;
    fileSize: number;
    folder?: string;
    classCode?: string;
    sessionNum?: number;
  }): Promise<{
    ok: boolean;
    signedUrl: string;
    fileUrl: string;
  }> {
    const folder = payload.folder || 'homework-assignments';
    const isSessionAssignmentUpload =
      Boolean(payload.classCode) &&
      folder !== 'chat' &&
      folder !== 'forum';
    const primaryPath = isSessionAssignmentUpload
      ? '/api/ktn/class-sessions/upload-url'
      : '/api/ktn/upload-url';

    try {
      return await ktnRequest<{
        ok: boolean;
        signedUrl: string;
        fileUrl: string;
      }>(primaryPath, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          folder
        })
      });
    } catch (err) {
      if (err instanceof KtnApiError && (err.status === 404 || err.status === 405)) {
        if (primaryPath !== '/api/ktn/upload-url') {
          try {
            return await ktnRequest<{
              ok: boolean;
              signedUrl: string;
              fileUrl: string;
            }>('/api/ktn/upload-url', {
              method: 'POST',
              body: JSON.stringify({
                ...payload,
                folder
              })
            });
          } catch (fallbackErr) {
            if (
              !(
                fallbackErr instanceof KtnApiError &&
                (fallbackErr.status === 404 || fallbackErr.status === 405)
              )
            ) {
              throw fallbackErr;
            }
          }
        }
        return ktnRequest<{
          ok: boolean;
          signedUrl: string;
          fileUrl: string;
        }>('/api/ktn/homeworks/upload-url', {
          method: 'POST',
          body: JSON.stringify({
            fileName: payload.fileName,
            fileType: payload.fileType,
            fileSize: payload.fileSize,
            classCode: payload.classCode,
            sessionNum: payload.sessionNum
          })
        });
      }
      throw err;
    }
  },

  async uploadHomeworkAttachment(params: {
    file: File | Blob;
    fileName?: string;
    classCode: string;
    sessionNum: number;
    allowedClassCodes?: string[];
    isDemoMode?: boolean;
    signal?: AbortSignal;
    onProgress?: (percent: number) => void;
  }): Promise<KtnExerciseAttachment> {
    const rawFile = params.file;
    const fileName = String(
      params.fileName || (rawFile as File).name || `tai-lieu-buoi-${params.sessionNum}.pdf`
    ).trim();
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const mappedMime = ALLOWED_HOMEWORK_ATTACHMENT_EXTENSIONS[ext];
    if (!mappedMime) {
      throw new KtnApiError({
        message: `Định dạng tệp ".${ext || 'unknown'}" không được hỗ trợ. Chỉ chấp nhận PDF, DOC/DOCX, PPT/PPTX, JPG/PNG, MP3/M4A, MP4.`,
        status: 415,
        code: 'UNSUPPORTED_FILE_TYPE'
      });
    }

    const sizeBytes = Number(rawFile.size || 0);
    if (sizeBytes > MAX_HOMEWORK_ATTACHMENT_BYTES) {
      const sizeMb = (sizeBytes / (1024 * 1024)).toFixed(1);
      throw new KtnApiError({
        message: `Tệp "${fileName}" có dung lượng ${sizeMb}MB, vượt quá giới hạn tối đa 50MB/tệp cho luồng giao bài tập.`,
        status: 413,
        code: 'FILE_TOO_LARGE'
      });
    }

    const cleanClassCode = String(params.classCode || '').trim().toUpperCase();
    if (!cleanClassCode) {
      throw new KtnApiError({
        message: 'Vui lòng chọn lớp học trước khi tải tài liệu đính kèm.',
        status: 400,
        code: 'MISSING_CLASS_CODE'
      });
    }

    const session = getStoredSession();
    const allowedList =
      params.allowedClassCodes ||
      (session?.role === 'teacher' && Array.isArray(session.assignedClasses)
        ? session.assignedClasses
        : undefined);
    if (
      Array.isArray(allowedList) &&
      session?.role !== 'admin' &&
      !allowedList.some((c) => String(c || '').trim().toUpperCase() === cleanClassCode)
    ) {
      throw new KtnApiError({
        message: `Giáo viên không có quyền tải tài liệu giao bài cho lớp ${cleanClassCode} không thuộc phạm vi phụ trách.`,
        status: 403,
        code: 'FORBIDDEN_CLASS'
      });
    }

    const mimeType =
      (rawFile.type && rawFile.type.split(';')[0].trim()) || mappedMime || 'application/octet-stream';
    const effectiveSize = sizeBytes || 2048;

    params.onProgress?.(10);

    if (params.isDemoMode || session?.token === 'DEMO-MODE-ONLY') {
      if (params.signal?.aborted) {
        throw new DOMException('Đã hủy tải tệp.', 'AbortError');
      }
      params.onProgress?.(60);
      const demoUrl = `https://cdn.khongtunhi.com/homework-assignments/${encodeURIComponent(
        cleanClassCode
      )}/s${params.sessionNum}-${Date.now()}-${encodeURIComponent(fileName)}`;
      registerLocalUploadedMediaPreview(demoUrl, rawFile);
      params.onProgress?.(100);
      return {
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: fileName,
        url: demoUrl,
        mimeType,
        sizeBytes: effectiveSize
      };
    }

    const presign = await this.presignUpload({
      fileName,
      fileType: mimeType,
      fileSize: effectiveSize,
      folder: `homework-assignments/${cleanClassCode}/session-${params.sessionNum}`,
      classCode: cleanClassCode,
      sessionNum: params.sessionNum
    });

    if (params.signal?.aborted) {
      throw new DOMException('Đã hủy tải tệp.', 'AbortError');
    }

    params.onProgress?.(45);

    const uploadRes = await fetch(presign.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': mimeType },
      body: rawFile,
      signal: params.signal
    });

    if (!uploadRes.ok) {
      throw new KtnApiError({
        message: `Không thể tải tệp "${fileName}" lên kho lưu trữ (HTTP ${uploadRes.status}). Vui lòng thử lại.`,
        status: uploadRes.status || 502,
        code: 'STORAGE_UPLOAD_FAILED'
      });
    }

    params.onProgress?.(100);
    registerLocalUploadedMediaPreview(presign.fileUrl, rawFile);

    return {
      id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: fileName,
      url: presign.fileUrl,
      mimeType,
      sizeBytes: effectiveSize
    };
  },

  async getHomeworks(classCode?: string): Promise<KtnHomework[]> {
    const q = classCode ? `?classCode=${encodeURIComponent(classCode)}` : '';
    const res = await ktnRequest<{ ok: boolean; homeworks: KtnHomework[] }>(
      `/api/ktn/homeworks${q}`
    );
    return Array.isArray(res.homeworks) ? res.homeworks : [];
  },

  async uploadHomeworkFile(file: File | Blob, fileName: string): Promise<{ fileUrl: string; fileType: string; size: number }> {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const extMimeMap: Record<string, string> = {
      wav: 'audio/wav',
      webm: 'audio/webm',
      mp3: 'audio/mpeg',
      m4a: 'audio/mp4',
      ogg: 'audio/ogg',
      aac: 'audio/aac',
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      pdf: 'application/pdf',
      mp4: 'video/mp4',
      mov: 'video/quicktime'
    };
    const fileType = (file.type || extMimeMap[ext] || 'audio/wav').split(';')[0].trim() || 'audio/wav';
    const fileSize = file.size || 2048;
    const presign = await ktnRequest<{
      ok: boolean;
      signedUrl: string;
      fileUrl: string;
    }>('/api/ktn/homeworks/upload-url', {
      method: 'POST',
      body: JSON.stringify({ fileName, fileType, fileSize })
    });

    const uploadRes = await fetch(presign.signedUrl, {
      method: 'PUT',
      headers: { 'Content-Type': fileType },
      body: file
    });
    if (!uploadRes.ok) {
      throw new KtnApiError({
        message: 'Không thể tải tệp bài làm lên kho lưu trữ. Em vui lòng thử lại.',
        status: uploadRes.status || 502
      });
    }
    registerLocalUploadedMediaPreview(presign.fileUrl, file);
    return {
      fileUrl: presign.fileUrl,
      fileType,
      size: fileSize
    };
  },

  async uploadChatFile(
    file: File | Blob,
    fileName: string,
    onProgress?: (percent: number) => void
  ): Promise<{ fileUrl: string; fileType: string; size: number }> {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    const extMimeMap: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      webp: 'image/webp',
      gif: 'image/gif',
      bmp: 'image/bmp',
      heic: 'image/heic',
      pdf: 'application/pdf',
      mp3: 'audio/mpeg',
      wav: 'audio/wav',
      m4a: 'audio/mp4',
      aac: 'audio/aac',
      ogg: 'audio/ogg',
      mp4: 'video/mp4',
      mov: 'video/quicktime',
      m4v: 'video/x-m4v',
      webm: 'video/webm',
      zip: 'application/zip',
      rar: 'application/vnd.rar',
      txt: 'text/plain',
      doc: 'application/msword',
      docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      xls: 'application/vnd.ms-excel',
      xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      ppt: 'application/vnd.ms-powerpoint',
      pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    };
    const fileType = (file.type || extMimeMap[ext] || 'application/octet-stream').split(';')[0].trim() || 'application/octet-stream';
    const fileSize = file.size || 2048;

    if (fileSize > 100 * 1024 * 1024) {
      throw new KtnApiError({
        message: 'Tệp đính kèm vượt quá giới hạn 100MB.',
        status: 400
      });
    }

    let presign: { ok: boolean; signedUrl: string; fileUrl: string };
    try {
      presign = await ktnRequest<{
        ok: boolean;
        signedUrl: string;
        fileUrl: string;
      }>('/api/ktn/upload-url', {
        method: 'POST',
        body: JSON.stringify({ fileName, fileType, fileSize }),
        timeoutMs: 20000
      });
    } catch (err) {
      if (err instanceof KtnApiError && err.status === 404) {
        presign = await ktnRequest<{
          ok: boolean;
          signedUrl: string;
          fileUrl: string;
        }>('/api/ktn/homeworks/upload-url', {
          method: 'POST',
          body: JSON.stringify({ fileName, fileType, fileSize }),
          timeoutMs: 20000
        });
      } else {
        throw err;
      }
    }

    if (!presign?.signedUrl || !presign?.fileUrl) {
      throw new KtnApiError({
        message: 'Không tạo được đường dẫn tải tệp an toàn (Presigned URL).',
        status: 502
      });
    }

    onProgress?.(5);

    const putOnce = async (): Promise<void> => {
      if (onProgress && typeof XMLHttpRequest !== 'undefined') {
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open('PUT', presign.signedUrl, true);
          xhr.setRequestHeader('Content-Type', fileType);
          xhr.upload.onprogress = (evt) => {
            if (evt.lengthComputable && evt.total > 0) {
              const pct = Math.min(99, Math.max(5, Math.round((evt.loaded / evt.total) * 100)));
              onProgress(pct);
            }
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              onProgress(100);
              resolve();
            } else {
              reject(
                new KtnApiError({
                  message: `Không thể tải tệp đính kèm lên kho lưu trữ (HTTP ${xhr.status}).`,
                  status: xhr.status || 502
                })
              );
            }
          };
          xhr.onerror = () => {
            reject(
              new KtnApiError({
                message: 'Lỗi kết nối mạng khi tải tệp lớn lên S3.',
                status: 0,
                isNetworkError: true
              })
            );
          };
          xhr.send(file);
        });
        return;
      }

      const uploadRes = await fetch(presign.signedUrl, {
        method: 'PUT',
        headers: { 'Content-Type': fileType },
        body: file
      });
      if (!uploadRes.ok) {
        throw new KtnApiError({
          message: 'Không thể tải tệp đính kèm lên kho lưu trữ. Vui lòng thử lại.',
          status: uploadRes.status || 502
        });
      }
      onProgress?.(100);
    };

    try {
      await putOnce();
    } catch (err) {
      const shouldRetry =
        !(err instanceof KtnApiError) || err.isNetworkError || err.status >= 500 || err.status === 0;
      if (!shouldRetry) throw err;
      await putOnce();
    }

    registerLocalUploadedMediaPreview(presign.fileUrl, file);

    return {
      fileUrl: presign.fileUrl,
      fileType,
      size: fileSize
    };
  },

  async submitHomework(payload: {
    courseId: string;
    classCode?: string | null;
    lessonNum: number;
    lessonTitle: string;
    unitId?: string | null;
    fileUrl?: string;
    fileType?: string;
    submissionMode?: 'file' | 'text';
    textAnswer?: string;
    studentNote?: string;
    workbookAnswers?: Record<string, unknown>;
    attachments?: Array<{ title: string; fileUrl: string; mediaType: string; size: number }>;
  }): Promise<{ homework: KtnHomework; syncStatus: string }> {
    const res = await ktnRequest<{
      ok: boolean;
      homework: KtnHomework;
      syncStatus: string;
    }>('/api/ktn/homeworks', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    return res;
  },

  async gradeHomework(payload: {
    id: string;
    score?: number | null;
    status: 'graded' | 'revision_requested';
    teacherFeedback: string;
    classCode?: string | null;
  }): Promise<{ homework: KtnHomework; syncStatus: string }> {
    const res = await ktnRequest<{
      ok: boolean;
      homework: KtnHomework;
      syncStatus: string;
    }>('/api/ktn/homeworks/grade', {
      method: 'PATCH',
      body: JSON.stringify(payload)
    });
    return res;
  },

  async getNotifications(): Promise<{
    notifications: KtnNotification[];
    readIds: string[];
    settings?: UserNotificationSettings;
  }> {
    const res = await ktnRequest<{
      ok: boolean;
      notifications: KtnNotification[];
      readIds: string[];
      settings?: UserNotificationSettings;
    }>('/api/ktn/notifications');
    return {
      notifications: Array.isArray(res.notifications) ? res.notifications : [],
      readIds: Array.isArray(res.readIds) ? res.readIds : [],
      settings: res.settings
    };
  },

  async getNotificationSettings(): Promise<UserNotificationSettings> {
    const res = await ktnRequest<{ ok: boolean; settings: UserNotificationSettings }>(
      '/api/ktn/notifications/settings'
    );
    return (
      res.settings || {
        chat: true,
        homework: true,
        schedule: true,
        important: true,
        reminder10Min: false
      }
    );
  },

  async updateNotificationSettings(
    settings: Partial<UserNotificationSettings>
  ): Promise<UserNotificationSettings> {
    const res = await ktnRequest<{ ok: boolean; settings: UserNotificationSettings }>(
      '/api/ktn/notifications/settings',
      {
        method: 'PUT',
        body: JSON.stringify(settings)
      }
    );
    return res.settings;
  },

  async markNotificationsRead(ids: string[]): Promise<{ markedCount: number }> {
    const res = await ktnRequest<{ ok: boolean; markedCount: number }>(
      '/api/ktn/notifications/read',
      {
        method: 'PATCH',
        body: JSON.stringify({ ids })
      }
    );
    return { markedCount: res.markedCount || 0 };
  },

  async getVapidPublicKey(): Promise<{ publicKey: string; serverDeliveryConfigured?: boolean }> {
    const res = await ktnRequest<{
      ok: boolean;
      publicKey: string;
      serverDeliveryConfigured?: boolean;
    }>('/api/ktn/push/vapid-public-key');
    return {
      publicKey: String(res?.publicKey || ''),
      serverDeliveryConfigured: res?.serverDeliveryConfigured
    };
  },

  async subscribePush(
    subscription: Record<string, unknown>,
    previousEndpoint?: string
  ): Promise<{ ok: boolean; endpoint?: string; serverDeliveryConfigured?: boolean }> {
    const prev = String(previousEndpoint || subscription.previousEndpoint || '').trim();
    const res = await ktnRequest<{
      ok: boolean;
      endpoint?: string;
      serverDeliveryConfigured?: boolean;
    }>('/api/ktn/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({
        subscription,
        ...(prev ? { previousEndpoint: prev } : {})
      })
    });
    return {
      ok: Boolean(res?.ok),
      endpoint: res?.endpoint,
      serverDeliveryConfigured: res?.serverDeliveryConfigured
    };
  },

  async getStudents(classCode?: string): Promise<KtnStudentRecord[]> {
    const q = classCode ? `?classCode=${encodeURIComponent(classCode)}` : '';
    const res = await ktnRequest<{ ok: boolean; students: KtnStudentRecord[] }>(
      `/api/ktn/students${q}`
    );
    return Array.isArray(res.students) ? res.students : [];
  },

  async searchStudents(
    params: {
      q?: string;
      classCode?: string;
      courseId?: string;
      accountStatus?: string;
      syncStatus?: string;
      limit?: number;
      offset?: number;
    },
    signal?: AbortSignal
  ): Promise<KtnStudentSearchResult> {
    const sp = new URLSearchParams();
    if (params.q) sp.set('q', params.q);
    if (params.classCode) sp.set('classCode', params.classCode);
    if (params.courseId) sp.set('courseId', params.courseId);
    if (params.accountStatus) sp.set('accountStatus', params.accountStatus);
    if (params.syncStatus) sp.set('syncStatus', params.syncStatus);
    sp.set('limit', String(params.limit ?? 25));
    sp.set('offset', String(params.offset ?? 0));
    return ktnRequest<KtnStudentSearchResult>(
      `/api/ktn/admin/students/search?${sp.toString()}`,
      { signal }
    );
  },

  async provisionStudent(payload: {
    name: string;
    email: string;
    phone?: string;
    parentName?: string;
    classCode?: string | null;
    courseIds?: string[];
    note?: string;
    idempotencyKey?: string;
    operationId?: string;
  }): Promise<KtnProvisionStudentResponse> {
    return ktnRequest<KtnProvisionStudentResponse>(
      '/api/ktn/admin/students/provision',
      {
        method: 'POST',
        headers: payload.idempotencyKey
          ? { 'Idempotency-Key': payload.idempotencyKey }
          : undefined,
        body: JSON.stringify(payload)
      }
    );
  },

  async manageStudentCourses(payload: {
    action: 'grant' | 'revoke' | 'set' | 'assign_class';
    email: string;
    name?: string;
    phone?: string;
    parentName?: string;
    courseIds?: string[];
    classCode?: string | null;
  }): Promise<{
    student: KtnStudentRecord;
    message: string;
    syncStatus?: string;
    accountStatus?: string;
    accountCreated?: boolean;
    existingAccount?: boolean;
    initialPassword?: string | null;
  }> {
    const res = await ktnRequest<{
      ok: boolean;
      student: KtnStudentRecord;
      message: string;
      syncStatus?: string;
      accountStatus?: string;
      accountCreated?: boolean;
      existingAccount?: boolean;
      initialPassword?: string | null;
    }>(
      '/api/ktn/students/courses',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return res;
  },

  async grantStudentCourses(params: {
    email: string;
    courseIds: string[];
  }) {
    const cleanIds = Array.from(
      new Set((params.courseIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    if (cleanIds.length === 0) {
      throw new KtnApiError({
        message: 'Vui lòng chọn ít nhất 1 khóa học cần cấp.',
        status: 400,
        code: 'EMPTY_COURSE_SELECTION'
      });
    }
    return this.manageStudentCourses({
      action: 'grant',
      email: params.email.trim(),
      courseIds: cleanIds
    });
  },

  async revokeStudentCourse(params: {
    email: string;
    courseId: string;
  }) {
    const cleanId = String(params.courseId || '').trim();
    if (!cleanId) {
      throw new KtnApiError({
        message: 'Vui lòng chọn khóa học cần thu hồi.',
        status: 400,
        code: 'EMPTY_COURSE_REVOKE'
      });
    }
    return this.manageStudentCourses({
      action: 'revoke',
      email: params.email.trim(),
      courseIds: [cleanId]
    });
  },

  async assignStudentClass(params: {
    email: string;
    classCode: string | null;
  }) {
    const normalizedClass =
      params.classCode && String(params.classCode).trim()
        ? String(params.classCode).trim().toUpperCase()
        : null;
    return this.manageStudentCourses({
      action: 'assign_class',
      email: params.email.trim(),
      classCode: normalizedClass
    });
  },

  async replaceAllStudentCourses(params: {
    email: string;
    courseIds: string[];
  }) {
    const cleanIds = Array.from(
      new Set((params.courseIds || []).map((id) => String(id || '').trim()).filter(Boolean))
    );
    return this.manageStudentCourses({
      action: 'set',
      email: params.email.trim(),
      courseIds: cleanIds
    });
  },

  async updateStudentProfile(params: {
    email: string;
    name: string;
    phone?: string;
    parentName?: string;
  }) {
    return this.manageStudentCourses({
      action: 'assign_class',
      email: params.email.trim(),
      name: params.name.trim(),
      phone: params.phone !== undefined ? params.phone.trim() : undefined,
      parentName: params.parentName !== undefined ? params.parentName.trim() : undefined
    });
  },

  async getTeachers(q?: string): Promise<KtnTeacherRecord[]> {
    const cleanQ = String(q || '').trim();
    const sp = new URLSearchParams();
    if (cleanQ) {
      sp.set('q', cleanQ);
      if (cleanQ.includes('@') && !cleanQ.includes(' ')) {
        sp.set('teacherEmail', cleanQ.toLowerCase());
      }
    }
    const qs = sp.toString();
    const res = await ktnRequest<{ ok: boolean; teachers: KtnTeacherRecord[] }>(
      `/api/ktn/teachers${qs ? `?${qs}` : ''}`
    );
    return Array.isArray(res.teachers) ? res.teachers : [];
  },

  async searchAdminTeachers(
    params?: {
      q?: string;
      status?: string;
      classCode?: string;
      courseId?: string;
      limit?: number;
      offset?: number;
    },
    options?: { signal?: AbortSignal }
  ): Promise<KtnTeacherSearchResult> {
    const limit = Math.max(1, Math.min(100, Number(params?.limit) || 20));
    const offset = Math.max(0, Number(params?.offset) || 0);
    const sp = new URLSearchParams();
    if (params?.q && params.q.trim()) sp.set('q', params.q.trim());
    if (params?.status && params.status !== 'ALL') sp.set('status', params.status);
    if (params?.classCode && params.classCode !== 'ALL') sp.set('classCode', params.classCode);
    if (params?.courseId && params.courseId !== 'ALL') sp.set('courseId', params.courseId);
    sp.set('limit', String(limit));
    sp.set('offset', String(offset));

    try {
      const res = await ktnRequest<{
        ok?: boolean;
        items?: KtnTeacherRecord[];
        teachers?: KtnTeacherRecord[];
        totalCount?: number;
        total?: number;
        hasMore?: boolean;
        limit?: number;
        offset?: number;
      }>(`/api/ktn/admin/teachers/search?${sp.toString()}`, {
        signal: options?.signal
      });
      const items = Array.isArray(res.items)
        ? res.items
        : Array.isArray(res.teachers)
          ? res.teachers
          : [];
      const totalCount =
        typeof res.totalCount === 'number'
          ? res.totalCount
          : typeof res.total === 'number'
            ? res.total
            : offset + items.length;
      const effectiveLimit = typeof res.limit === 'number' ? res.limit : limit;
      const effectiveOffset = typeof res.offset === 'number' ? res.offset : offset;
      const hasMore =
        typeof res.hasMore === 'boolean'
          ? res.hasMore
          : effectiveOffset + items.length < totalCount;

      return {
        ok: true,
        items,
        totalCount,
        hasMore,
        limit: effectiveLimit,
        offset: effectiveOffset
      };
    } catch (err) {
      if (options?.signal?.aborted || (err instanceof Error && err.name === 'AbortError')) {
        throw err;
      }
      if (err instanceof KtnApiError && (err.status === 401 || err.status === 403)) {
        throw err;
      }
      // Graceful fallback to legacy /api/ktn/teachers if backend endpoint is not yet deployed or returns 404
      const allTeachers = await this.getTeachers(undefined);
      return filterAndPaginateTeachersClientSide(allTeachers, {
        ...params,
        limit,
        offset
      });
    }
  },

  async saveTeacher(payload: {
    code?: string;
    name: string;
    email: string;
    phone?: string;
    specialty?: string;
    assignedClasses?: string[];
    assignedCourses?: string[];
    active?: boolean;
    initialPassword?: string;
    provisionOnIzTeach?: boolean;
  }): Promise<{
    ok: boolean;
    teacher: KtnTeacherRecord;
    provisioningStatus: string;
    readyToLogin: boolean;
    accountCreated?: boolean;
    existingAccount?: boolean;
    initialPassword?: string | null;
    message: string;
  }> {
    return ktnRequest('/api/ktn/teachers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async uploadFileWithProgress(
    file: File | Blob,
    onProgress?: (percent: number) => void
  ): Promise<{ fileUrl: string; fileType: string; size: number }> {
    const fileName = (file as File).name || `upload-${Date.now()}.bin`;
    return this.uploadChatFile(file, fileName, onProgress);
  },

  async teacherCreateStudent(payload: {
    name: string;
    email: string;
    phone?: string;
    parentName?: string;
    parentPhone?: string;
    classCode: string;
    note?: string;
    initialPassword?: string;
  }): Promise<{
    ok: boolean;
    operationId: string;
    student: KtnStudentRecord;
    classCode: string;
    onlineCourses: Array<{ id: string; title: string }>;
    cognitoUserId?: string | null;
    izteachStudentId?: string | null;
    accountCreated?: boolean;
    initialPassword?: string | null;
    message: string;
  }> {
    return ktnRequest('/api/ktn/teacher/students/create', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getCourseGrantRequests(params?: {
    status?: string;
    studentEmail?: string;
  }): Promise<{
    ok: boolean;
    requests: KtnCourseGrantRequest[];
    pendingCount: number;
  }> {
    const sp = new URLSearchParams();
    if (params?.status) sp.set('status', params.status);
    if (params?.studentEmail) sp.set('studentEmail', params.studentEmail);
    const qs = sp.toString();
    const res = await ktnRequest<{
      ok: boolean;
      requests: KtnCourseGrantRequest[];
      pendingCount?: number;
    }>(`/api/ktn/course-requests${qs ? `?${qs}` : ''}`);
    const list = Array.isArray(res.requests) ? res.requests : [];
    return {
      ok: true,
      requests: list,
      pendingCount: res.pendingCount ?? list.filter((r) => r.status === 'pending').length
    };
  },

  async createCourseGrantRequest(payload: {
    studentEmail: string;
    studentName?: string;
    studentId?: string;
    classCode?: string;
    courseId?: string;
    requestedCourseId?: string;
    courseTitle?: string;
    requestedCourseTitle?: string;
    reason: string;
  }): Promise<{
    ok: boolean;
    request: KtnCourseGrantRequest;
    message: string;
  }> {
    const normalizedPayload = {
      ...payload,
      courseId: payload.courseId || payload.requestedCourseId || '',
      courseTitle: payload.courseTitle || payload.requestedCourseTitle
    };
    return ktnRequest('/api/ktn/course-requests', {
      method: 'POST',
      body: JSON.stringify(normalizedPayload)
    });
  },

  async cancelCourseGrantRequest(requestId: string, reason?: string): Promise<{
    ok: boolean;
    request: KtnCourseGrantRequest;
    message: string;
  }> {
    return ktnRequest('/api/ktn/course-requests', {
      method: 'POST',
      body: JSON.stringify({ action: 'cancel', requestId, reason })
    });
  },

  async reviewCourseGrantRequest(payload: {
    requestId: string;
    decision: 'approve' | 'reject';
    reviewNote?: string;
  }): Promise<{
    ok: boolean;
    request: KtnCourseGrantRequest;
    student?: KtnStudentRecord | null;
    message: string;
  }> {
    return ktnRequest('/api/ktn/course-requests/review', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async manageStudentLifecycle(payload: {
    email: string;
    action: 'suspend' | 'archive' | 'restore' | 'delete';
    reason?: string;
    confirmDelete?: boolean;
  }): Promise<{
    ok: boolean;
    email: string;
    action: string;
    status: 'active' | 'suspended' | 'archived' | 'deleted';
    student?: KtnStudentRecord | null;
    reverseSyncBlocked?: boolean;
    preservedOrders?: boolean;
    message: string;
  }> {
    return ktnRequest('/api/ktn/admin/students/lifecycle', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        reason: payload.reason || ''
      })
    });
  },

  async getForumQuestions(params?: {
    courseId?: string;
    unitId?: string;
    status?: string;
    q?: string;
    search?: string;
  }): Promise<{
    ok: boolean;
    questions: KtnForumQuestion[];
    totalCount: number;
    openCount: number;
    summary: {
      total: number;
      openCount: number;
      claimedCount: number;
      answeredCount: number;
      resolvedCount: number;
    };
  }> {
    const sp = new URLSearchParams();
    if (params?.courseId) sp.set('courseId', params.courseId);
    if (params?.unitId) sp.set('unitId', params.unitId);
    if (params?.status && params.status !== 'all') sp.set('status', params.status);
    const searchVal = params?.q || params?.search;
    if (searchVal) sp.set('q', searchVal);
    const qs = sp.toString();
    const res = await ktnRequest<{
      ok: boolean;
      questions: KtnForumQuestion[];
      totalCount?: number;
      openCount?: number;
      summary?: {
        total: number;
        openCount: number;
        claimedCount: number;
        answeredCount: number;
        resolvedCount: number;
      };
    }>(`/api/ktn/forum/questions${qs ? `?${qs}` : ''}`);
    const list = Array.isArray(res.questions) ? res.questions : [];
    const openCount = res.openCount ?? list.filter((item) => item.status === 'open').length;
    const claimedCount = list.filter((item) => item.status === 'claimed' || Boolean(item.claimed_by_email)).length;
    const answeredCount = list.filter((item) => item.status === 'answered').length;
    const resolvedCount = list.filter((item) => item.status === 'resolved').length;
    return {
      ok: true,
      questions: list,
      totalCount: res.totalCount ?? list.length,
      openCount,
      summary: res.summary || {
        total: res.totalCount ?? list.length,
        openCount,
        claimedCount,
        answeredCount,
        resolvedCount
      }
    };
  },

  async createForumQuestion(payload: {
    courseId: string;
    unitId: string;
    lessonNumber?: number;
    lessonTitle?: string;
    title: string;
    content: string;
    videoTimestampSeconds?: number | null;
    attachments?: KtnForumAttachment[];
  }): Promise<{
    ok: boolean;
    question: KtnForumQuestion;
  }> {
    return ktnRequest('/api/ktn/forum/questions', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async claimForumQuestion(questionId: string, action: 'claim' | 'unclaim' = 'claim'): Promise<{
    ok: boolean;
    question: KtnForumQuestion;
  }> {
    return ktnRequest('/api/ktn/forum/questions/claim', {
      method: 'POST',
      body: JSON.stringify({ questionId, action })
    });
  },

  async createForumAnswer(payload: {
    questionId: string;
    content: string;
    attachments?: KtnForumAttachment[];
    videoUrl?: string | null;
    videoDurationSeconds?: number | null;
    videoFileSize?: number | null;
  }): Promise<{
    ok: boolean;
    answer: KtnForumAnswer;
    question: KtnForumQuestion;
    pointsAwarded: number;
    awardedEvents: KtnTeacherContributionEvent[];
  }> {
    return ktnRequest('/api/ktn/forum/answers', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async voteForumAnswerHelpful(payload: {
    answerId: string;
    questionId?: string;
    markAccepted?: boolean;
  }): Promise<{
    ok: boolean;
    alreadyVoted: boolean;
    pointsAwarded: number;
    question: KtnForumQuestion;
  }> {
    return ktnRequest('/api/ktn/forum/answers/helpful', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async toggleForumFollow(payload: {
    questionId: string;
    following: boolean;
    notifyMode?: 'immediate' | 'digest' | 'off';
  }): Promise<{
    ok: boolean;
    questionId: string;
    isFollowing: boolean;
    notifyMode: string;
  }> {
    return ktnRequest('/api/ktn/forum/follows', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async moderateForumItem(payload: {
    targetType: 'question' | 'answer';
    targetId: string;
    action: 'resolve' | 'reopen' | 'hide' | 'unhide' | 'delete';
  }): Promise<{
    ok: boolean;
    question?: KtnForumQuestion;
    answer?: KtnForumAnswer;
  }> {
    return ktnRequest('/api/ktn/forum/moderate', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async adjustTeacherForumPoints(payload: {
    teacherEmail?: string;
    teacherId?: string;
    pointsDelta: number;
    reason: string;
    questionId?: string;
    answerId?: string;
  }): Promise<{
    ok: boolean;
    event: KtnTeacherContributionEvent;
    message: string;
  }> {
    return ktnRequest('/api/ktn/forum/points/adjust', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        teacherEmail: payload.teacherEmail || payload.teacherId || ''
      })
    });
  },

  async getForumLeaderboard(month?: string): Promise<{
    ok: boolean;
    month: string;
    openQuestionsCount: number;
    totalQuestionsCount: number;
    leaderboard: KtnForumLeaderboardEntry[];
  }> {
    const qs = month ? `?month=${encodeURIComponent(month)}` : '';
    return ktnRequest(`/api/ktn/forum/leaderboard${qs}`);
  },

  async getOrders(params?: {
    q?: string;
    filterPreset?: string;
    paymentStatus?: string;
    approvalStatus?: string;
  }): Promise<KtnOrder[]> {
    const sp = new URLSearchParams();
    if (params?.q) sp.set('q', params.q);
    if (params?.filterPreset && params.filterPreset !== 'ALL') {
      sp.set('filterPreset', params.filterPreset);
    }
    if (params?.paymentStatus && params.paymentStatus !== 'ALL') {
      sp.set('paymentStatus', params.paymentStatus);
    }
    if (params?.approvalStatus && params.approvalStatus !== 'ALL') {
      sp.set('approvalStatus', params.approvalStatus);
    }
    const qs = sp.toString();
    const res = await ktnRequest<{ ok: boolean; orders: KtnOrder[] }>(
      `/api/ktn/orders${qs ? `?${qs}` : ''}`
    );
    return Array.isArray(res.orders) ? res.orders : [];
  },

  async updateOrder(payload: {
    orderId: string;
    studentName?: string;
    parentName?: string;
    studentEmail?: string;
    phone?: string;
    parentPhone?: string;
    courseId?: string;
    customerNote?: string;
    contactStatus?: OrderContactStatus;
    contactNote?: string;
    consultationNote?: string;
    paymentDetailedStatus?: OrderPaymentDetailedStatus;
    paymentTxRef?: string;
    paymentReceivedAmount?: number;
    credentialHandedOff?: boolean;
    cancelOrder?: boolean;
    restoreOrder?: boolean;
  }): Promise<{ ok: boolean; order: KtnOrder; message: string }> {
    return ktnRequest('/api/ktn/orders/update', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async approveOrder(
    orderId: string,
    classCode?: string,
    options?: { confirmActivation?: boolean; studentEmail?: string }
  ): Promise<{
    message: string;
    studentEmail: string;
    syncStatus?: string;
    accountCreated?: boolean;
    existingAccount?: boolean;
    initialPassword?: string | null;
    order?: KtnOrder;
  }> {
    const res = await ktnRequest<{
      ok: boolean;
      message: string;
      studentEmail: string;
      syncStatus?: string;
      accountCreated?: boolean;
      existingAccount?: boolean;
      initialPassword?: string | null;
      order?: KtnOrder;
    }>('/api/ktn/orders/approve', {
      method: 'POST',
      body: JSON.stringify({
        orderId,
        classCode,
        confirmActivation: options?.confirmActivation ?? true,
        ...(options?.studentEmail ? { studentEmail: options.studentEmail } : {})
      })
    });
    return res;
  },

  async createStudentOrder(payload: {
    courseId: string;
    phone?: string;
    parentPhone?: string;
    studentName?: string;
    parentName?: string;
    note?: string;
    updateProfilePhone?: boolean;
    idempotencyKey?: string;
  }): Promise<{
    ok: boolean;
    orderId?: string;
    duplicatePrevented?: boolean;
    order: KtnOrder;
    paymentInfo?: KtnVietQrPaymentInfo;
    message: string;
  }> {
    return ktnRequest('/api/ktn/orders', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        source: 'authenticated_student'
      })
    });
  },

  async getMyOrders(): Promise<KtnOrder[]> {
    const res = await ktnRequest<{ ok: boolean; orders: KtnOrder[] }>('/api/ktn/orders/my');
    return Array.isArray(res.orders) ? res.orders : [];
  },

  async reportOrderPayment(payload: {
    orderId: string;
    transactionRef?: string;
    paymentTxRef?: string;
    phone?: string;
  }): Promise<{ ok: boolean; order: KtnOrder; message: string }> {
    return ktnRequest('/api/ktn/orders/report-payment', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getPaymentConfig(): Promise<{
    id?: string;
    bank_id?: string;
    bank_name?: string;
    account_no?: string;
    account_name?: string;
    default_amount?: number;
    auto_approve_webhook?: boolean;
    course_prices?: Record<string, number>;
  } | null> {
    const res = await ktnRequest<{
      ok: boolean;
      config: {
        id?: string;
        bank_id?: string;
        bank_name?: string;
        account_no?: string;
        account_name?: string;
        default_amount?: number;
        auto_approve_webhook?: boolean;
        course_prices?: Record<string, number>;
      } | null;
    }>('/api/ktn/payment-config');
    return res.config || null;
  },

  async getSyncStatus(): Promise<KtnSyncStatusResponse> {
    return ktnRequest<KtnSyncStatusResponse>('/api/ktn/admin/sync-status');
  },

  async retrySyncItem(payload: {
    type: 'student_provision' | 'student_sync' | 'teacher_provision' | 'order_approve' | 'homework_sync' | 'bulk_sync';
    email?: string;
    orderId?: string;
    homeworkId?: string;
  }): Promise<{ ok: boolean; syncStatus?: string; message?: string }> {
    return ktnRequest('/api/ktn/admin/sync-retry', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async getAttendance(params: {
    classCode: string;
    sessionNum?: number;
  }): Promise<KtnAttendanceResponse> {
    const sp = new URLSearchParams();
    sp.set('classCode', params.classCode);
    if (params.sessionNum && params.sessionNum > 0) {
      sp.set('sessionNum', String(params.sessionNum));
    }
    return ktnRequest<KtnAttendanceResponse>(`/api/ktn/attendance?${sp.toString()}`);
  },

  async saveAttendance(payload: {
    classCode: string;
    sessionNum: number;
    date?: string;
    records: Array<{
      studentEmail: string;
      studentName?: string;
      status: 'present' | 'absent_excused' | 'absent_unexcused' | 'late';
      note?: string;
    }>;
  }): Promise<KtnAttendanceResponse> {
    return ktnRequest<KtnAttendanceResponse>('/api/ktn/attendance', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  }
};

