import type {
  KtnClassItem,
  KtnClassSession,
  KtnCourse,
  KtnHomework,
  KtnLessonUnit,
  KtnNotification,
  KtnOrder,
  KtnStudentRecord,
  KtnUserSession
} from '@/types/ktn.types';

const SESSION_STORAGE_KEY = 'ktn_sll_persistent_auth_v2';

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

export function getStoredSession(): KtnUserSession | null {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as KtnUserSession;
    if (parsed && parsed.email) return parsed;
    return null;
  } catch {
    return null;
  }
}

export function saveStoredSession(session: KtnUserSession, token?: string): KtnUserSession {
  const merged: KtnUserSession = {
    ...session,
    token: token || session.token || ''
  };
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(merged));
  } catch {
    // Ignore storage quota errors
  }
  return merged;
}

export function clearStoredSession(): void {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem('ol-credentials-auth-user');
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
  if (session?.token && !session.token.startsWith('KTN-')) {
    headers.set('Authorization', `Bearer ${session.token}`);
  }

  const controller = new AbortController();
  const timeoutMs = options.timeoutMs ?? 12000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

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
    try {
      const res = await ktnRequest<{
        ok: boolean;
        authenticated: boolean;
        session: KtnUserSession;
        token: string;
      }>('/api/ktn/auth/session');
      if (res.authenticated && res.session) {
        return saveStoredSession(res.session, res.token);
      }
      return null;
    } catch (err) {
      if (err instanceof KtnApiError && err.status === 401) {
        clearStoredSession();
        return null;
      }
      return stored;
    }
  },

  async logout(): Promise<void> {
    try {
      await ktnRequest('/api/ktn/auth/logout', { method: 'POST' });
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
    const res = await ktnRequest<{ ok: boolean; units: KtnLessonUnit[] }>(
      `/api/ktn/courses/units?courseId=${encodeURIComponent(courseId)}`
    );
    return Array.isArray(res.units) ? res.units : [];
  },

  async getClasses(): Promise<KtnClassItem[]> {
    const res = await ktnRequest<{ ok: boolean; classes: KtnClassItem[] }>('/api/ktn/classes');
    return Array.isArray(res.classes) ? res.classes : [];
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
    exercises: Array<{ id?: string; num: number; title: string; prompt: string; type: string }>;
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

  async getHomeworks(classCode?: string): Promise<KtnHomework[]> {
    const q = classCode ? `?classCode=${encodeURIComponent(classCode)}` : '';
    const res = await ktnRequest<{ ok: boolean; homeworks: KtnHomework[] }>(
      `/api/ktn/homeworks${q}`
    );
    return Array.isArray(res.homeworks) ? res.homeworks : [];
  },

  async uploadHomeworkFile(file: File | Blob, fileName: string): Promise<{ fileUrl: string; fileType: string; size: number }> {
    const fileType = file.type || 'audio/wav';
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
    fileUrl: string;
    fileType: string;
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

  async getNotifications(): Promise<{ notifications: KtnNotification[]; readIds: string[] }> {
    const res = await ktnRequest<{
      ok: boolean;
      notifications: KtnNotification[];
      readIds: string[];
    }>('/api/ktn/notifications');
    return {
      notifications: Array.isArray(res.notifications) ? res.notifications : [],
      readIds: Array.isArray(res.readIds) ? res.readIds : []
    };
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

  async subscribePush(subscription: Record<string, unknown>): Promise<{ ok: boolean }> {
    const res = await ktnRequest<{ ok: boolean }>('/api/ktn/push/subscribe', {
      method: 'POST',
      body: JSON.stringify({ subscription })
    });
    return { ok: Boolean(res?.ok) };
  },

  async getStudents(classCode?: string): Promise<KtnStudentRecord[]> {
    const q = classCode ? `?classCode=${encodeURIComponent(classCode)}` : '';
    const res = await ktnRequest<{ ok: boolean; students: KtnStudentRecord[] }>(
      `/api/ktn/students${q}`
    );
    return Array.isArray(res.students) ? res.students : [];
  },

  async manageStudentCourses(payload: {
    action: 'grant' | 'revoke' | 'set' | 'assign_class';
    email: string;
    name?: string;
    courseIds?: string[];
    classCode?: string | null;
  }): Promise<{ student: KtnStudentRecord; message: string }> {
    const res = await ktnRequest<{ ok: boolean; student: KtnStudentRecord; message: string }>(
      '/api/ktn/students/courses',
      {
        method: 'POST',
        body: JSON.stringify(payload)
      }
    );
    return res;
  },

  async getOrders(): Promise<KtnOrder[]> {
    const res = await ktnRequest<{ ok: boolean; orders: KtnOrder[] }>('/api/ktn/orders');
    return Array.isArray(res.orders) ? res.orders : [];
  },

  async approveOrder(orderId: string, classCode?: string): Promise<{ message: string; studentEmail: string }> {
    const res = await ktnRequest<{ ok: boolean; message: string; studentEmail: string }>(
      '/api/ktn/orders/approve',
      {
        method: 'POST',
        body: JSON.stringify({ orderId, classCode })
      }
    );
    return res;
  }
};
