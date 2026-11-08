import { create } from 'zustand';
import type { ChatAttachment, ChatDemoScenario, ChatMessage, ChatReaction } from '@/features/chat/types/chat.types';

export type VideoDemoScenario =
  | 'live_real'
  | 'loading'
  | 'playing'
  | 'paused'
  | 'error'
  | 'unentitled'
  | 'homework_pending'
  | 'homework_submitted';

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant: 'default' | 'success' | 'warning' | 'error';
}

const DRAFT_STORAGE_PREFIX = 'ktn_v2_chat_draft_';
const FAILED_QUEUE_STORAGE_KEY = 'ktn_v2_failed_messages';
const COMPLETED_LESSONS_KEY = 'ktn_v2_completed_lessons';

function readInitialFailedQueue(): Record<string, ChatMessage[]> {
  try {
    const raw = localStorage.getItem(FAILED_QUEUE_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Record<string, ChatMessage[]>) : {};
  } catch {
    return {};
  }
}

function readInitialCompletedLessons(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(COMPLETED_LESSONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

export function isDemoAllowedInEnv(): boolean {
  if (import.meta.env.DEV) return true;
  if (
    import.meta.env.VITE_ENABLE_DEMO === 'true' ||
    import.meta.env.VITE_ENABLE_DEMO_BAR === 'true'
  ) {
    return true;
  }
  return false;
}

interface UiState {
  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;

  sidebarOpen: boolean;
  setSidebarOpen: (val: boolean) => void;

  notifDropdownOpen: boolean;
  setNotifDropdownOpen: (val: boolean) => void;

  selectedClassCode: string;
  setSelectedClassCode: (code: string) => void;

  activeRoomId: string;
  setActiveRoomId: (roomId: string) => void;

  mobileChatConversationOpen: boolean;
  setMobileChatConversationOpen: (open: boolean) => void;

  activeLightboxAttachment: ChatAttachment | null;
  setActiveLightboxAttachment: (attachment: ChatAttachment | null) => void;

  draftByRoom: Record<string, string>;
  setRoomDraft: (roomId: string, text: string) => void;
  getRoomDraft: (roomId: string) => string;

  sendingMessagesByRoom: Record<string, ChatMessage[]>;
  addSendingMessage: (roomId: string, msg: ChatMessage) => void;
  removeSendingMessage: (roomId: string, clientMessageId: string) => void;

  failedMessagesByRoom: Record<string, ChatMessage[]>;
  markMessageFailed: (roomId: string, msg: ChatMessage, errorMessage: string) => void;
  removeFailedMessage: (roomId: string, clientMessageId: string) => void;

  reactionsByMessageId: Record<string, ChatReaction[]>;
  toggleReaction: (messageId: string, emoji: string, userName: string) => void;

  completedLessons: Record<string, boolean>;
  toggleLessonCompleted: (courseId: string, lessonNum: number, completed?: boolean) => void;

  chatDemoScenario: ChatDemoScenario;
  setChatDemoScenario: (scenario: ChatDemoScenario) => void;

  videoDemoScenario: VideoDemoScenario;
  setVideoDemoScenario: (scenario: VideoDemoScenario) => void;

  isOfflineSimulated: boolean;
  setOfflineSimulated: (offline: boolean) => void;

  toasts: ToastItem[];
  addToast: (toast: Omit<ToastItem, 'id'>) => void;
  dismissToast: (id: string) => void;

  resetSessionUiState: () => void;
}

export const useUiStore = create<UiState>((set, get) => ({
  isDemoMode:
    isDemoAllowedInEnv() &&
    typeof window !== 'undefined' &&
    window.location.search.includes('demo=1'),
  setDemoMode: (val) => set({ isDemoMode: val && isDemoAllowedInEnv() }),

  sidebarOpen: false,
  setSidebarOpen: (val) => set({ sidebarOpen: val }),

  notifDropdownOpen: false,
  setNotifDropdownOpen: (val) => set({ notifDropdownOpen: val }),

  selectedClassCode: 'YCT2-04',
  setSelectedClassCode: (code) => set({ selectedClassCode: code }),

  activeRoomId: 'class:YCT2-04',
  setActiveRoomId: (roomId) => set({ activeRoomId: roomId }),

  mobileChatConversationOpen: false,
  setMobileChatConversationOpen: (open) => set({ mobileChatConversationOpen: open }),

  activeLightboxAttachment: null,
  setActiveLightboxAttachment: (attachment) => set({ activeLightboxAttachment: attachment }),

  draftByRoom: {},
  setRoomDraft: (roomId, text) => {
    try {
      if (text) localStorage.setItem(DRAFT_STORAGE_PREFIX + roomId, text);
      else localStorage.removeItem(DRAFT_STORAGE_PREFIX + roomId);
    } catch {
      // Ignore
    }
    set((state) => ({
      draftByRoom: { ...state.draftByRoom, [roomId]: text }
    }));
  },
  getRoomDraft: (roomId) => {
    const inMem = get().draftByRoom[roomId];
    if (inMem !== undefined) return inMem;
    try {
      return localStorage.getItem(DRAFT_STORAGE_PREFIX + roomId) || '';
    } catch {
      return '';
    }
  },

  sendingMessagesByRoom: {},
  addSendingMessage: (roomId, msg) =>
    set((state) => {
      const list = state.sendingMessagesByRoom[roomId] || [];
      return {
        sendingMessagesByRoom: {
          ...state.sendingMessagesByRoom,
          [roomId]: [...list.filter((m) => m.clientMessageId !== msg.clientMessageId), msg]
        }
      };
    }),
  removeSendingMessage: (roomId, clientMessageId) =>
    set((state) => {
      const list = state.sendingMessagesByRoom[roomId] || [];
      return {
        sendingMessagesByRoom: {
          ...state.sendingMessagesByRoom,
          [roomId]: list.filter((m) => m.clientMessageId !== clientMessageId)
        }
      };
    }),

  failedMessagesByRoom: readInitialFailedQueue(),
  markMessageFailed: (roomId, msg, errorMessage) =>
    set((state) => {
      const sendingList = state.sendingMessagesByRoom[roomId] || [];
      const failedList = state.failedMessagesByRoom[roomId] || [];
      const updatedMsg: ChatMessage = {
        ...msg,
        status: 'failed',
        errorMessage
      };
      const nextFailed = {
        ...state.failedMessagesByRoom,
        [roomId]: [
          ...failedList.filter((m) => m.clientMessageId !== msg.clientMessageId),
          updatedMsg
        ]
      };
      try {
        localStorage.setItem(FAILED_QUEUE_STORAGE_KEY, JSON.stringify(nextFailed));
      } catch {
        // Ignore
      }
      return {
        sendingMessagesByRoom: {
          ...state.sendingMessagesByRoom,
          [roomId]: sendingList.filter((m) => m.clientMessageId !== msg.clientMessageId)
        },
        failedMessagesByRoom: nextFailed
      };
    }),
  removeFailedMessage: (roomId, clientMessageId) =>
    set((state) => {
      const failedList = state.failedMessagesByRoom[roomId] || [];
      const nextFailed = {
        ...state.failedMessagesByRoom,
        [roomId]: failedList.filter((m) => m.clientMessageId !== clientMessageId)
      };
      try {
        localStorage.setItem(FAILED_QUEUE_STORAGE_KEY, JSON.stringify(nextFailed));
      } catch {
        // Ignore
      }
      return { failedMessagesByRoom: nextFailed };
    }),

  reactionsByMessageId: {
    'MSG-SEED-YCT2-001': [{ emoji: '❤️', count: 3, users: ['PH Bé Hoàng Ngân', 'PH Bé An Mẫn', 'Cô Lâm Mỹ Linh'] }],
    'MSG-SEED-YCT2-002': [{ emoji: '👍', count: 1, users: ['Cô Lâm Mỹ Linh'] }]
  },
  toggleReaction: (messageId, emoji, userName) =>
    set((state) => {
      const current = state.reactionsByMessageId[messageId] || [];
      const existing = current.find((r) => r.emoji === emoji);
      let nextList: ChatReaction[];
      if (existing) {
        const hasUser = existing.users.includes(userName);
        const nextUsers = hasUser
          ? existing.users.filter((u) => u !== userName)
          : [...existing.users, userName];
        nextList =
          nextUsers.length === 0
            ? current.filter((r) => r.emoji !== emoji)
            : current.map((r) =>
                r.emoji === emoji ? { ...r, count: nextUsers.length, users: nextUsers } : r
              );
      } else {
        nextList = [...current, { emoji, count: 1, users: [userName] }];
      }
      return {
        reactionsByMessageId: {
          ...state.reactionsByMessageId,
          [messageId]: nextList
        }
      };
    }),

  completedLessons: readInitialCompletedLessons(),
  toggleLessonCompleted: (courseId, lessonNum, completed) =>
    set((state) => {
      const key = `${courseId}:${lessonNum}`;
      const nextVal = completed !== undefined ? completed : !state.completedLessons[key];
      const nextMap = { ...state.completedLessons, [key]: nextVal };
      try {
        localStorage.setItem(COMPLETED_LESSONS_KEY, JSON.stringify(nextMap));
      } catch {
        // Ignore
      }
      return { completedLessons: nextMap };
    }),

  chatDemoScenario: 'live_real',
  setChatDemoScenario: (scenario) => set({ chatDemoScenario: scenario }),

  videoDemoScenario: 'live_real',
  setVideoDemoScenario: (scenario) => set({ videoDemoScenario: scenario }),

  isOfflineSimulated: false,
  setOfflineSimulated: (offline) => set({ isOfflineSimulated: offline }),

  toasts: [],
  addToast: (toast) => {
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    set((state) => ({ toasts: [...state.toasts, { ...toast, id }] }));
    setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }));
    }, 4500);
  },
  dismissToast: (id) =>
    set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),

  resetSessionUiState: () => {
    try {
      localStorage.removeItem(FAILED_QUEUE_STORAGE_KEY);
      localStorage.removeItem(COMPLETED_LESSONS_KEY);
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(DRAFT_STORAGE_PREFIX)) keysToRemove.push(k);
      }
      for (const k of keysToRemove) localStorage.removeItem(k);
    } catch {
      // Ignore
    }
    set({
      sidebarOpen: false,
      notifDropdownOpen: false,
      mobileChatConversationOpen: false,
      selectedClassCode: '',
      activeRoomId: '',
      draftByRoom: {},
      sendingMessagesByRoom: {},
      failedMessagesByRoom: {},
      completedLessons: {},
      isOfflineSimulated: false
    });
  }
}));

