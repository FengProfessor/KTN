import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppShell } from '@/app/layouts/AppShell';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { APP_LANGUAGE_STORAGE_KEY } from '@/i18n/langStorage';
import { STATIC_VOCABULARY } from '@/features/games/data/staticVocabulary';
import { ENGLISH_VOCAB_BY_ID } from '@/features/games/data/englishVocabularyMap';
import {
  getDistractorMeanings,
  getLocalizedGameLevels,
  getWordDisplayMeaning,
  getWordsForLevel,
} from '@/features/games/services/vocabularyService';
import { setSoundMuted } from '@/features/games/services/audioService';
import { GameHub } from '@/features/games/components/GameHub';
import { MemoryFlipGame } from '@/features/games/components/games/MemoryFlipGame';
import { SpeedBlitzGame } from '@/features/games/components/games/SpeedBlitzGame';
import { BalloonPopGame } from '@/features/games/components/games/BalloonPopGame';
import { ZombieDefenderGame } from '@/features/games/components/games/ZombieDefenderGame';
import { StudentHome } from '@/features/dashboard/components/StudentHome';
import { FlashcardsPage } from '@/features/flashcards/components/FlashcardsPage';
import { LearningPage } from '@/features/learning/components/LearningPage';
import { HomeworkPanel } from '@/features/learning/components/HomeworkPanel';
import { LessonForumPanel } from '@/features/learning/components/LessonForumPanel';
import { ClassroomsPage } from '@/features/classrooms/components/ClassroomsPage';
import { ClassScheduleModal } from '@/features/classrooms/components/ClassScheduleModal';
import { ChatLayout } from '@/features/chat/components/ChatLayout';
import { NotificationCenter } from '@/features/notifications/components/NotificationCenter';
import { TeacherHome } from '@/features/teacher/components/TeacherHome';
import { TeacherWorkspace } from '@/features/teacher/components/TeacherWorkspace';
import { TeacherForumInbox } from '@/features/teacher/components/TeacherForumInbox';
import { AdminHome } from '@/features/admin/components/AdminHome';
import { AdminWorkspace } from '@/features/admin/components/AdminWorkspace';
import { OrderDetailDrawer } from '@/features/admin/components/OrderDetailDrawer';
import { StudentDetailDrawer } from '@/features/admin/components/StudentDetailDrawer';
import { TeacherDetailDrawer } from '@/features/admin/components/TeacherDetailDrawer';
import { ktnApi } from '@/services/api/ktnApiClient';
import { chatApi } from '@/features/chat/services/chatApi';
import { DEMO_CLASSES, DEMO_COURSES, DEMO_NOTIFICATIONS, DEMO_CHAT_ROOMS } from '@/lib/demoData';
import type {
  KtnOrder,
  KtnStudentRecord,
  KtnTeacherRecord,
} from '@/types/ktn.types';

const VI_DIACRITICS_RE =
  /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: false,
        gcTime: 0,
      },
      mutations: {
        retry: false,
      },
    },
  });
}

function renderWithProviders(
  ui: React.ReactElement,
  initialEntries: string[] = ['/']
) {
  const queryClient = createQueryClient();
  return {
    queryClient,
    ...render(
      <MemoryRouter initialEntries={initialEntries}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    ),
  };
}

const SAMPLE_STUDENT = {
  id: 'STU-001',
  code: 'KTN-2026-089',
  email: 'hoangngan@khongtunhi.com',
  name: 'Bé Nguyễn Hoàng Ngân',
  role: 'student' as const,
  classCode: 'YCT2-04',
  assignedClasses: ['YCT2-04'],
  onlineCourses: [
    {
      id: '6adadba969897b0002482ca5',
      code: 'HSK1-30',
      title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
      shortTitle: 'HSK1 3.0',
    },
  ],
};

const SAMPLE_TEACHER = {
  id: 'GV-001',
  code: 'GV001',
  email: 'colinh@khongtunhi.com',
  name: 'Cô Lâm Mỹ Linh',
  role: 'teacher' as const,
  classCode: 'YCT2-04',
  assignedClasses: ['YCT2-04'],
};

const SAMPLE_ADMIN = {
  id: 'ADM-001',
  code: 'ADMIN-01',
  email: 'admin@khongtunhi.com',
  name: 'Ban Quản Lý KTN',
  role: 'admin' as const,
};

describe('Post-Login Bilingual i18n (VI <-> EN) Across All Modules & Roles', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    setSoundMuted(false);
    document.documentElement.lang = 'vi';
    useUiStore.setState({
      lang: 'vi',
      isDemoMode: true,
      toasts: [],
      notifDropdownOpen: false,
    });
    useAuthStore.setState({
      user: SAMPLE_STUDENT as any,
      isRestoring: false,
    });
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('1. Language Toggle Persistence & AppShell Chrome', () => {
    it('defaults to vi, toggles to en via header-lang-toggle, syncs localStorage + <html lang>, translates dropdown & change-password modal', async () => {
      vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
        notifications: DEMO_NOTIFICATIONS,
        readIds: [],
      });
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);

      renderWithProviders(
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/learning" element={<div data-testid="dummy-learning">Content</div>} />
          </Route>
        </Routes>,
        ['/learning']
      );

      expect(useUiStore.getState().lang).toBe('vi');
      expect(document.documentElement.lang).toBe('vi');
      expect(screen.getByTestId('header-page-title')).toHaveTextContent('Học tiếp');

      const langToggle = screen.getByTestId('header-lang-toggle');
      fireEvent.click(langToggle);

      await waitFor(() => {
        expect(useUiStore.getState().lang).toBe('en');
        expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('en');
        expect(document.documentElement.lang).toBe('en');
        expect(screen.getByTestId('header-page-title')).toHaveTextContent('Lessons');
      });

      // Open notification dropdown in English
      fireEvent.click(screen.getByTestId('header-notification-bell'));
      const dropdown = await screen.findByTestId('header-notification-dropdown');
      expect(dropdown.textContent).toContain('Latest notifications');
      expect(dropdown.textContent).toContain('Mark all as read');
      expect(dropdown.textContent).toContain('View all notifications');

      // Open Change Password modal in English & trigger validation
      fireEvent.click(screen.getByTestId('open-change-password-modal-btn'));
      const pwdModal = await screen.findByTestId('change-password-modal');
      expect(pwdModal.textContent).toContain('Change account password');
      expect(pwdModal.textContent).toContain('Current password');
      expect(pwdModal.textContent).toContain('Save new password');

      fireEvent.click(screen.getByTestId('change-password-submit-btn'));
      expect(await screen.findByTestId('change-password-error')).toHaveTextContent(
        'Please enter your current password.'
      );

      // Toggle back to Vietnamese
      fireEvent.click(screen.getByTestId('header-lang-toggle'));
      await waitFor(() => {
        expect(useUiStore.getState().lang).toBe('vi');
        expect(localStorage.getItem(APP_LANGUAGE_STORAGE_KEY)).toBe('vi');
        expect(document.documentElement.lang).toBe('vi');
        expect(screen.getByTestId('header-page-title')).toHaveTextContent('Học tiếp');
      });
    });
  });

  describe('2. Game Vocabulary English Dictionary & Level Metadata', () => {
    it('covers 100% of STATIC_VOCABULARY IDs with non-empty, diacritic-free English meanings', () => {
      const missing: string[] = [];
      const empty: string[] = [];
      const vnLeaks: string[] = [];

      for (const word of STATIC_VOCABULARY) {
        const enMeaning = ENGLISH_VOCAB_BY_ID[word.id];
        if (enMeaning === undefined) {
          missing.push(word.id);
        } else if (!String(enMeaning).trim()) {
          empty.push(word.id);
        } else if (VI_DIACRITICS_RE.test(enMeaning)) {
          vnLeaks.push(`${word.id}:${enMeaning}`);
        }
      }

      expect(missing).toEqual([]);
      expect(empty).toEqual([]);
      expect(vnLeaks).toEqual([]);

      const hello = STATIC_VOCABULARY.find((w) => w.hanzi === '你好');
      expect(hello).toBeDefined();
      expect(getWordDisplayMeaning(hello!, 'en')).toBe(ENGLISH_VOCAB_BY_ID[hello!.id]);
      expect(getWordDisplayMeaning(hello!, 'vi')).toBe(hello!.meaning);
    });

    it('provides localized level metadata for all 13 levels without Vietnamese diacritics or distractor collisions', () => {
      const enLevels = getLocalizedGameLevels('en');
      expect(enLevels).toHaveLength(13);

      for (const lvl of enLevels) {
        expect(VI_DIACRITICS_RE.test(lvl.label)).toBe(false);
        expect(VI_DIACRITICS_RE.test(lvl.shortLabel)).toBe(false);
        expect(VI_DIACRITICS_RE.test(lvl.description)).toBe(false);

        const words = getWordsForLevel(lvl.id);
        for (const sample of words.slice(0, 6)) {
          const correctMeaning = getWordDisplayMeaning(sample, 'en').toLowerCase();
          const distractors = getDistractorMeanings(sample, 3, lvl.id, 'en');
          expect(distractors).toHaveLength(3);
          for (const d of distractors) {
            expect(d.toLowerCase()).not.toBe(correctMeaning);
            expect(VI_DIACRITICS_RE.test(d)).toBe(false);
          }
        }
      }
    });
  });

  describe('3. Student Modules in English', () => {
    beforeEach(() => {
      useUiStore.getState().setLang('en');
      useAuthStore.setState({ user: SAMPLE_STUDENT as any, isRestoring: false });
    });

    it('renders StudentHome and FlashcardsPage in English with lang=en iframe parameter', async () => {
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
        notifications: DEMO_NOTIFICATIONS,
        readIds: [],
      });
      vi.spyOn(ktnApi, 'getStudentMe').mockResolvedValue({
        code: 'KTN-2026-089',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        class_code: 'YCT2-04',
        online_courses: [],
      } as any);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(DEMO_CLASSES);

      const { unmount } = renderWithProviders(<StudentHome />);
      await waitFor(() => {
        expect(screen.getByTestId('discovery-card-games')).toBeInTheDocument();
      });
      const homeText = document.body.textContent || '';
      expect(homeText).toContain('Chinese Games');
      expect(homeText).toContain('Next');
      unmount();

      renderWithProviders(<FlashcardsPage />);
      expect(screen.getByText(/Back to Home/i)).toBeInTheDocument();
      expect(screen.getByText(/605 cards/i)).toBeInTheDocument();
      const iframe = screen.getByTitle(/Flashcard|Flashcards/i) as HTMLIFrameElement;
      expect(iframe.getAttribute('src')).toContain('lang=en');
    });

    it('renders GameHub and all 4 Chinese games in English and hides HV: lines in en mode', async () => {
      const hsk1Words = getWordsForLevel('hsk1');
      const englishWordSet = new Set(hsk1Words.map((w) => getWordDisplayMeaning(w, 'en')));

      // GameHub
      const { unmount: unmountHub } = renderWithProviders(
        <GameHub onSelectGame={vi.fn()} selectedLevelId="hsk1" onSelectLevel={vi.fn()} />
      );
      expect(document.body.textContent).toContain('KTN Games');
      expect(document.body.textContent).toContain('Choose Vocabulary Level');
      expect(document.body.textContent).not.toContain('Trung tâm Trò chơi');
      unmountHub();

      // MemoryFlipGame: en hides HV:, vi shows HV:
      const { unmount: unmountMem } = renderWithProviders(
        <MemoryFlipGame levelId="hsk1" onBack={vi.fn()} />
      );
      const card0 = screen.getByTestId('memory-card-0');
      expect(card0).toBeInTheDocument();
      const meaningCardTexts = Array.from({ length: 12 }, (_, idx) =>
        screen.getByTestId(`memory-card-${idx}`).textContent || ''
      );
      expect(meaningCardTexts.some((t) => [...englishWordSet].some((en) => t.includes(en)))).toBe(true);
      expect(meaningCardTexts.some((t) => t.includes('HV:'))).toBe(false);

      // Switch to vi live -> HV: returns on memory cards
      await act(async () => {
        useUiStore.getState().setLang('vi');
      });
      await waitFor(() => {
        const cardTextsVi = Array.from({ length: 12 }, (_, idx) =>
          screen.getByTestId(`memory-card-${idx}`).textContent || ''
        );
        expect(cardTextsVi.some((t) => t.includes('HV:') || t.includes('Nghĩa'))).toBe(true);
      });
      unmountMem();

      await act(async () => {
        useUiStore.getState().setLang('en');
      });

      // SpeedBlitzGame: en hides Hán-Việt / HV: and renders English options
      const { unmount: unmountBlitz } = renderWithProviders(
        <SpeedBlitzGame levelId="hsk1" onBack={vi.fn()} />
      );
      const blitzCardText = screen.getByTestId('speed-blitz-card').textContent || '';
      expect(blitzCardText).not.toContain('Hán-Việt');
      expect(blitzCardText).not.toContain('HV:');
      expect(
        Array.from({ length: 4 }, (_, i) => screen.getByTestId(`speed-blitz-option-${i}`).textContent || '').some((t) =>
          [...englishWordSet].some((en) => t.includes(en))
        )
      ).toBe(true);
      unmountBlitz();

      // BalloonPopGame
      const { unmount: unmountBalloon } = renderWithProviders(
        <BalloonPopGame levelId="hsk1" onBack={vi.fn()} />
      );
      const balloonText = screen.getByTestId('balloon-stage').textContent || '';
      expect(balloonText).not.toContain('Hán-Việt');
      expect(balloonText).not.toContain('HV:');
      unmountBalloon();

      // ZombieDefenderGame
      const { unmount: unmountZombie } = renderWithProviders(
        <ZombieDefenderGame levelId="hsk1" onBack={vi.fn()} />
      );
      const zombieText = screen.getByTestId('zombie-defender-game').textContent || '';
      expect(zombieText).not.toContain('Hán-Việt');
      expect(zombieText).not.toContain('HV:');
      expect(
        Array.from({ length: 3 }, (_, i) => screen.queryByTestId(`zombie-bubble-${i}`)?.textContent || '').some((t) =>
          [...englishWordSet].some((en) => t.includes(en))
        )
      ).toBe(true);
      unmountZombie();
    });

    it('renders LearningPage, HomeworkPanel, LessonForumPanel, ClassroomsPage, ChatLayout, and NotificationCenter in English', async () => {
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(DEMO_COURSES);
      vi.spyOn(ktnApi, 'getCourseUnits').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(DEMO_CLASSES);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
        notifications: DEMO_NOTIFICATIONS,
        readIds: [],
      });
      vi.spyOn(ktnApi, 'getNotificationSettings').mockResolvedValue({
        chat: true,
        homework: true,
        schedule: true,
        important: true,
        reminder10Min: false,
      });
      vi.spyOn(ktnApi, 'getVapidPublicKey').mockResolvedValue({ publicKey: '' });
      vi.spyOn(ktnApi, 'getMyOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getPaymentConfig').mockResolvedValue({} as any);
      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [],
        totalCount: 0,
        openCount: 0,
        summary: { total: 0, openCount: 0, claimedCount: 0, answeredCount: 0, resolvedCount: 0 },
      });
      vi.spyOn(ktnApi, 'getForumLeaderboard').mockResolvedValue({
        ok: true,
        month: '2026-11',
        openQuestionsCount: 0,
        totalQuestionsCount: 0,
        leaderboard: [],
      });
      vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
        rooms: DEMO_CHAT_ROOMS,
        source: 'demo',
      } as any);
      vi.spyOn(chatApi, 'getMessages').mockResolvedValue({
        messages: [],
        hasMore: false,
      } as any);

      // HomeworkPanel
      const { unmount: unmountHw } = renderWithProviders(
        <HomeworkPanel
          courseId={DEMO_COURSES[0].id}
          lessonNum={1}
          lessonTitle="Lesson 1: Hello"
          classCode="YCT2-04"
          existingSubmission={null}
          isSubmitting={false}
          onSubmitHomework={vi.fn()}
        />
      );
      expect(document.body.textContent).toContain('Not submitted');
      expect(document.body.textContent).toContain('Submit');
      unmountHw();

      // LessonForumPanel
      const { unmount: unmountForum } = renderWithProviders(
        <LessonForumPanel
          courseId={DEMO_COURSES[0].id}
          courseTitle="Standard New HSK 1 (3.0) Course"
          unitId="unit-1"
          lessonNumber={1}
          lessonTitle="Lesson 1"
          currentUser={SAMPLE_STUDENT}
        />
      );
      await waitFor(() => {
        expect(document.body.textContent).toContain('All');
      });
      expect(document.body.textContent).toContain('Unanswered');
      expect(document.body.textContent).toContain('Answered');
      unmountForum();

      // LearningPage
      const { unmount: unmountLearn } = renderWithProviders(<LearningPage />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Standard New HSK 1 (3.0) Course');
      });
      unmountLearn();

      // ClassroomsPage
      const { unmount: unmountCls } = renderWithProviders(<ClassroomsPage />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('LIVE CLASS');
      });
      unmountCls();

      // ChatLayout
      const { unmount: unmountChat } = renderWithProviders(<ChatLayout />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Messages');
      });
      expect(document.body.textContent).toContain('Recent');
      expect(document.body.textContent).toContain('Unread');
      unmountChat();

      // NotificationCenter
      renderWithProviders(<NotificationCenter />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Notification');
      });
    });
  });

  describe('4. Teacher & Admin Workspaces in English', () => {
    beforeEach(() => {
      useUiStore.getState().setLang('en');
    });

    it('renders TeacherHome, TeacherWorkspace, and TeacherForumInbox in English', async () => {
      useAuthStore.setState({ user: SAMPLE_TEACHER as any, isRestoring: false });
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(DEMO_CLASSES);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(DEMO_COURSES);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [],
        totalCount: 0,
        openCount: 0,
        summary: { total: 0, openCount: 0, claimedCount: 0, answeredCount: 0, resolvedCount: 0 },
      });
      vi.spyOn(ktnApi, 'getForumLeaderboard').mockResolvedValue({
        ok: true,
        month: '2026-11',
        openQuestionsCount: 0,
        totalQuestionsCount: 0,
        leaderboard: [],
      });

      const { unmount: unmountTHome } = renderWithProviders(<TeacherHome />);
      await waitFor(() => {
        expect(document.body.textContent).not.toContain('Lớp của tôi');
      });
      expect(document.body.textContent).toContain('YCT2-04');
      unmountTHome();

      const { unmount: unmountTWork } = renderWithProviders(
        <Routes>
          <Route path="/teacher/:section" element={<TeacherWorkspace />} />
        </Routes>,
        ['/teacher/classes']
      );
      await waitFor(() => {
        expect(document.body.textContent).toContain('YCT2-04');
      });
      expect(document.body.textContent).not.toContain('Chưa có lớp học');
      unmountTWork();

      renderWithProviders(<TeacherForumInbox />);
      await waitFor(() => {
        expect(document.body.textContent).toContain('Unanswered');
      });
    });

    it('renders AdminHome, AdminWorkspace, ClassScheduleModal, and Detail Drawers in English', async () => {
      useAuthStore.setState({ user: SAMPLE_ADMIN as any, isRestoring: false });
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue(DEMO_COURSES);
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue(DEMO_CLASSES);
      vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getTeachers').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'searchAdminTeachers').mockResolvedValue({
        teachers: [],
        total: 0,
        page: 1,
        limit: 20,
      } as any);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({ requests: [] } as any);
      vi.spyOn(ktnApi, 'getSyncStatus').mockResolvedValue({ ok: true, items: [] } as any);

      const { unmount: unmountAHome } = renderWithProviders(<AdminHome />);
      await waitFor(() => {
        expect(document.body.textContent).not.toContain('Tổng quan học vụ');
      });
      unmountAHome();

      const { unmount: unmountAWork } = renderWithProviders(
        <Routes>
          <Route path="/admin/:section" element={<AdminWorkspace />} />
        </Routes>,
        ['/admin/classes']
      );
      await waitFor(() => {
        expect(document.body.textContent).toContain('Classes');
      });
      unmountAWork();

      // ClassScheduleModal
      const { unmount: unmountModal } = renderWithProviders(
        <ClassScheduleModal
          open={true}
          mode="create_class"
          role="admin"
          teachers={[]}
          onClose={vi.fn()}
          onSaveClassAndSchedule={vi.fn()}
        />
      );
      expect(document.body.textContent).toContain('Create');
      unmountModal();

      // OrderDetailDrawer
      const sampleOrder: KtnOrder = {
        id: 'ORD-EN-1',
        studentName: 'Hoàng Ngân',
        parentName: 'Nguyễn Lan',
        phone: '0987654321',
        email: 'ngan@khongtunhi.com',
        courseId: DEMO_COURSES[0].id,
        courseTitle: DEMO_COURSES[0].title,
        amount: 1500000,
        expectedAmount: 1500000,
        status: 'pending',
        createdAt: new Date().toISOString(),
      } as unknown as KtnOrder;

      const { unmount: unmountOrder } = renderWithProviders(
        <OrderDetailDrawer
          order={sampleOrder}
          open={true}
          onClose={vi.fn()}
          classesList={DEMO_CLASSES}
          isUpdatingOrder={false}
          isApprovingOrder={false}
          actionError={null}
          onClearError={vi.fn()}
          onUpdateOrder={vi.fn()}
          onApproveOrder={vi.fn()}
          onOpenStudentProfile={vi.fn()}
        />
      );
      expect(document.body.textContent).toContain('Confirm & Activate Course');
      expect(document.body.textContent).toContain('Parent Contact & Consultation');
      unmountOrder();

      // StudentDetailDrawer
      const sampleStudentRec: KtnStudentRecord = {
        code: 'KTN-2026-089',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        phone: '0987654321',
        parent_name: 'Chị Nguyễn Thị Lan',
        class_code: 'YCT2-04',
        has_live_class: true,
        has_online_courses: true,
        online_courses: [],
        studentCase: 'both',
        accountStatus: 'ready_to_login',
        syncStatus: 'synced',
      } as unknown as KtnStudentRecord;

      const { unmount: unmountStu } = renderWithProviders(
        <StudentDetailDrawer
          student={sampleStudentRec}
          open={true}
          onClose={vi.fn()}
          catalogCourses={DEMO_COURSES}
          catalogError={false}
          catalogLoading={false}
          onRetryCatalog={vi.fn()}
          classesList={DEMO_CLASSES}
          actionError={null}
          onClearError={vi.fn()}
          isGrantingCourse={false}
          isRevokingCourse={false}
          isAssigningClass={false}
          isReplacingCourses={false}
          isUpdatingProfile={false}
          isResyncing={false}
          isManagingLifecycle={false}
          hasExistingOrders={false}
          onGrantCourses={vi.fn().mockResolvedValue(undefined)}
          onRevokeCourse={vi.fn().mockResolvedValue(undefined)}
          onAssignClass={vi.fn().mockResolvedValue(undefined)}
          onReplaceAllCourses={vi.fn().mockResolvedValue(undefined)}
          onUpdateProfile={vi.fn().mockResolvedValue(undefined)}
          onManageLifecycle={vi.fn().mockResolvedValue({ ok: true })}
          onResyncStudent={vi.fn()}
          onCopyEmail={vi.fn()}
        />
      );
      expect(document.body.textContent).toContain('Grant');
      unmountStu();

      // TeacherDetailDrawer
      const sampleTeacherRec: KtnTeacherRecord = {
        id: 'GV001',
        code: 'GV001',
        name: 'Cô Lâm Mỹ Linh',
        email: 'colinh@khongtunhi.com',
        assignedClasses: ['YCT2-04'],
        assignedCourses: [],
      } as unknown as KtnTeacherRecord;

      renderWithProviders(
        <TeacherDetailDrawer
          teacher={sampleTeacherRec}
          open={true}
          onClose={vi.fn()}
          classesList={DEMO_CLASSES}
          catalogCourses={DEMO_COURSES}
          isSaving={false}
        />
      );
      expect(document.body.textContent).toContain('GV001');
    });
  });
});
