import { create } from 'zustand';
import type { KtnUserSession } from '@/types/ktn.types';
import {
  clearStoredSession,
  getStoredSession,
  ktnApi,
  saveStoredSession
} from '@/services/api/ktnApiClient';

interface AuthState {
  user: KtnUserSession | null;
  authUser: KtnUserSession | null;
  demoUser: KtnUserSession;
  isLoading: boolean;
  isRestoring: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<KtnUserSession>;
  logout: () => Promise<void>;
  restoreSession: () => Promise<KtnUserSession | null>;
  setDemoUser: (user: KtnUserSession) => void;
  syncModeUser: (isDemoMode: boolean) => void;
}

export const DEMO_USERS: Record<string, KtnUserSession> = {
  student_both: {
    id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
    code: 'KTN-2026-089',
    email: 'hoangngan@khongtunhi.com',
    name: 'Bé Nguyễn Hoàng Ngân',
    role: 'student',
    roles: ['student'],
    classCode: 'YCT2-04',
    hasLiveClass: true,
    hasOnlineCourses: true,
    onlineCourses: [
      { id: '6adadba969897b0002482ca5', code: 'HSK1-30', title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)', shortTitle: 'HSK1 3.0' },
      { id: '65e7704a9ea90c00080d5195', code: 'CFK-01', title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)', shortTitle: 'Chinese For Kids' }
    ],
    studentCase: 'both'
  },
  student_online: {
    id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
    code: 'KTN-2026-TAPHON',
    email: 'taphong2002@gmail.com',
    name: 'Tạ Phong Võ',
    role: 'student',
    roles: ['student'],
    classCode: null,
    hasLiveClass: false,
    hasOnlineCourses: true,
    onlineCourses: [
      { id: '6adadba969897b0002482ca5', code: 'HSK1-30', title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)', shortTitle: 'HSK1 3.0' },
      { id: '65e7704a9ea90c00080d5195', code: 'CFK-01', title: 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)', shortTitle: 'Chinese For Kids' }
    ],
    studentCase: 'online_only'
  },
  student_unassigned: {
    id: '424d2085-8685-4a49-a5e8-8fb63b0c85c5',
    code: 'KTN-2026-VIP',
    email: 'taphong2002vip@gmail.com',
    name: 'Tạ Phong (Chưa cấp khóa)',
    role: 'student',
    roles: ['student'],
    classCode: null,
    hasLiveClass: false,
    hasOnlineCourses: false,
    onlineCourses: [],
    studentCase: 'unassigned'
  },
  teacher: {
    id: 'GV-KTN-08',
    code: 'GV-KTN-08',
    email: 'linh.lam@khongtunhi.com',
    name: 'Cô Lâm Mỹ Linh',
    role: 'teacher',
    roles: ['teacher'],
    classCode: 'YCT2-04',
    hasLiveClass: true,
    hasOnlineCourses: true,
    onlineCourses: [],
    studentCase: 'teacher'
  },
  admin: {
    id: '2c01e488-d866-4341-a0db-644fe6ba1202',
    code: 'ADMIN-01',
    email: 'quanly@khongtunhi.com',
    name: 'Ban Quản Lý KTN',
    role: 'admin',
    roles: ['admin'],
    classCode: null,
    hasLiveClass: true,
    hasOnlineCourses: true,
    onlineCourses: [],
    studentCase: 'admin'
  }
};

const initialAuthUser = getStoredSession();
const initialIsDemo = typeof window !== 'undefined' && window.location.search.includes('demo=1');

export const useAuthStore = create<AuthState>((set, get) => ({
  user: initialIsDemo ? DEMO_USERS.student_both : initialAuthUser,
  authUser: initialAuthUser,
  demoUser: DEMO_USERS.student_both,
  isLoading: false,
  isRestoring: Boolean(initialAuthUser) && !initialIsDemo,
  error: null,

  async login(email: string, password: string) {
    set({ isLoading: true, error: null });
    try {
      const { session } = await ktnApi.login(email, password);
      set({
        user: session,
        authUser: session,
        isLoading: false,
        isRestoring: false,
        error: null
      });
      return session;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Đăng nhập không thành công.';
      set({ isLoading: false, isRestoring: false, error: msg });
      throw err;
    }
  },

  async logout() {
    set({ isLoading: true });
    await ktnApi.logout();
    clearStoredSession();
    set({
      user: null,
      authUser: null,
      isLoading: false,
      isRestoring: false,
      error: null
    });
  },

  async restoreSession() {
    const existing = getStoredSession();
    if (!existing) {
      set({ user: null, authUser: null, isRestoring: false });
      return null;
    }
    set({ isRestoring: true });
    const verified = await ktnApi.verifySession();
    set({
      user: verified,
      authUser: verified,
      isRestoring: false
    });
    return verified;
  },

  setDemoUser(demoPersona: KtnUserSession) {
    const cleanDemo: KtnUserSession = {
      ...demoPersona,
      token: 'DEMO-MODE-ONLY'
    };
    set({
      demoUser: cleanDemo,
      user: cleanDemo,
      error: null
    });
  },

  syncModeUser(isDemoMode: boolean) {
    const { demoUser, authUser } = get();
    set({
      user: isDemoMode ? demoUser : authUser,
      error: null
    });
  }
}));
