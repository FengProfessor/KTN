import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { TeacherWorkspace } from '@/features/teacher/components/TeacherWorkspace';
import { StudentHome } from '@/features/dashboard/components/StudentHome';
import { ClassroomsPage } from '@/features/classrooms/components/ClassroomsPage';
import { ChatLayout } from '@/features/chat/components/ChatLayout';
import { AppShell } from '@/app/layouts/AppShell';
import { chatApi } from '@/features/chat/services/chatApi';
import { ktnApi, KtnApiError, saveStoredSession } from '@/services/api/ktnApiClient';

type KtnClassSession = Awaited<ReturnType<typeof ktnApi.getClassSessions>>[number];
import { syncRemoteVocabulary } from '@/features/games/services/vocabularyService';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { usePwaInstall } from '@/hooks/usePwaInstall';

function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

function renderWithQuery(ui: React.ReactElement, initialEntries: string[] = ['/']) {
  const queryClient = createTestQueryClient();
  return {
    queryClient,
    ...render(
      <MemoryRouter initialEntries={initialEntries}>
        <QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>
      </MemoryRouter>
    ),
  };
}

describe('KTN Master Refactor Acceptance Suite (Agent A / B / C / D)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    useUiStore.setState({ isDemoMode: false });
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
      ok: true,
      requests: [],
      pendingCount: 0,
    });
    vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
      ok: true,
      questions: [],
      totalCount: 0,
      openCount: 0,
      summary: { total: 0, openCount: 0, claimedCount: 0, answeredCount: 0, resolvedCount: 0 },
    });
    vi.spyOn(ktnApi, 'getOrders').mockResolvedValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('H01-H04: TeacherWorkspace Live mode starts with ZERO sample/mock defaults and "Tạo bài mới" resets cleanly', async () => {
    useAuthStore.setState({
      user: {
        id: 't-1',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2 Thiếu Nhi',
        teacher_code: 'GV-01',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        schedule: 'Thứ 3 & Thứ 5',
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([
      {
        id: 'HW-UNGRADED-1',
        student_email: 'hs@khongtunhi.com',
        student_name: 'Bé An',
        class_code: 'YCT2-04',
        course_id: 'CLASS_YCT2-04',
        lesson_num: 101,
        lesson_title: 'Bài 1',
        file_url: '',
        file_type: 'audio',
        attachments: [],
        status: 'pending',
        score: null,
        teacher_feedback: '',
        student_note: 'Em đã nộp',
        submitted_at: new Date().toISOString(),
      },
    ]);

    renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions']);

    const classSelect = (await screen.findByTestId('teacher-exercise-class-select')) as HTMLSelectElement;
    const sessionSelect = (await screen.findByTestId('teacher-session-select')) as HTMLSelectElement;
    const exTitleInput = (await screen.findByTestId('teacher-exercise-title-input')) as HTMLInputElement;
    const exPromptInput = (await screen.findByTestId('teacher-exercise-prompt-input')) as HTMLInputElement;

    // B1/B2: Starts completely unselected with zero prefilled class, session, title, or prompt
    expect(classSelect.value).toBe('');
    expect(sessionSelect.value).toBe('');
    expect(exTitleInput.value).toBe('');
    expect(exPromptInput.value).toBe('');

    // Selecting class keeps session dropdown unselected until teacher picks or chooses "+ Tạo buổi học mới"
    fireEvent.change(classSelect, { target: { value: 'YCT2-04' } });
    await waitFor(() => {
      expect(screen.getByTestId('teacher-assignments-status-summary')).toBeInTheDocument();
    });
    expect(sessionSelect.value).toBe('');

    fireEvent.change(sessionSelect, { target: { value: '__new__' } });
    const sessionNumInput = (await screen.findByTestId('teacher-session-num-input')) as HTMLInputElement;
    expect(sessionNumInput.value).toBe('');

    const suggestBtn = await screen.findByTestId('teacher-suggest-next-session-btn');
    fireEvent.click(suggestBtn);
    expect(sessionNumInput.value).toBe('1');

    // Fill title/prompt then click "Tạo bài mới" -> clears inputs cleanly
    fireEvent.change(exTitleInput, { target: { value: 'Tạm nhập' } });
    fireEvent.change(exPromptInput, { target: { value: 'Mô tả tạm' } });
    fireEvent.click(screen.getByTestId('teacher-exercise-mode-create'));
    expect(exTitleInput.value).toBe('');
    expect(exPromptInput.value).toBe('');

    // Switch to grading tab and open ungraded homework -> NO hardcoded '9.5' or sample template text
    fireEvent.click(screen.getByTestId('teacher-tab-grading'));
    const gradeOpenBtn = await screen.findByTestId('open-grade-form-btn-HW-UNGRADED-1');
    fireEvent.click(gradeOpenBtn);

    const scoreInput = (await screen.findByTestId('teacher-score-input')) as HTMLInputElement;
    const feedbackInput = (await screen.findByTestId('teacher-feedback-input')) as HTMLTextAreaElement;
    expect(scoreInput.value).toBe('');
    expect(feedbackInput.value).toBe('');
  });

  it('H02 + B7: TeacherWorkspace renders status summary badges, deduplicates Bài N: prefixes, and hides raw internal exercise IDs', async () => {
    useAuthStore.setState({
      user: {
        id: 't-1',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2 Thiếu Nhi',
        teacher_code: 'GV-01',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 2,
        schedule: 'Thứ 3 & Thứ 5 · 18:00',
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'sess_YCT2-04_2',
        classCode: 'YCT2-04',
        session_num: 2,
        sessionNum: 2,
        session_title: 'Giao tiếp chào hỏi',
        title: 'Giao tiếp chào hỏi',
        session_date: '2026-11-18',
        updatedAt: '2026-11-15T10:00:00.000Z',
        exercises: [
          {
            id: 'ex_internal_pub_17777',
            num: 1,
            title: 'Bài 1: Bài 1: Luyện nghe từ vựng',
            prompt: 'Nghe 3 lần',
            type: 'audio',
            status: 'published',
          },
          {
            id: 'ex_internal_draft_88888',
            num: 2,
            title: 'Phiếu nháp ôn tập',
            prompt: '',
            type: 'text',
            status: 'draft',
          },
        ],
      },
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);

    renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions&class=YCT2-04']);

    const card = await screen.findByTestId('teacher-saved-session-card-2');
    const summary = await screen.findByTestId('teacher-assignments-status-summary');
    expect(summary).toHaveTextContent('1 buổi đã tạo');
    expect(summary).toHaveTextContent('1 đang giao');
    expect(summary).toHaveTextContent('1 bản nháp');

    expect(card).toHaveTextContent('Bài 1: Luyện nghe từ vựng');
    expect(card).not.toHaveTextContent('Bài 1: Bài 1:');
    expect(card).not.toHaveTextContent('ex_internal_pub_17777');
    expect(card).not.toHaveTextContent('ex_internal_draft_88888');
    expect(card).toHaveTextContent('Đang giao');
    expect(card).toHaveTextContent('Nháp');
  });

  it('H05-H11: TeacherWorkspace allows title + attachment with blank prompt, supports Retry on failed upload, and handles 409 Conflict', async () => {
    useAuthStore.setState({
      user: {
        id: 't-1',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2 Thiếu Nhi',
        teacher_code: 'GV-01',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        schedule: 'Thứ 3 & Thứ 5',
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'sess_YCT2-04_1',
        classCode: 'YCT2-04',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1',
        title: 'Buổi 1',
        updatedAt: '2026-11-15T10:00:00.000Z',
        exercises: [],
      },
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);

    let attempt = 0;
    vi.spyOn(ktnApi, 'uploadHomeworkAttachment').mockImplementation(async ({ file, onProgress }) => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('Mạng chập chờn khi tải tệp');
      }
      onProgress?.(100);
      return {
        id: 'att-retry-ok',
        name: (file as File).name,
        url: 'https://cdn.khongtunhi.com/phieu-ok.pdf',
        mimeType: 'application/pdf',
        sizeBytes: 2048,
      };
    });

    const saveSpy = vi
      .spyOn(ktnApi, 'saveClassSession')
      .mockRejectedValueOnce(Object.assign(new Error('Dữ liệu buổi học vừa được cập nhật ở nơi khác.'), { status: 409 }))
      .mockResolvedValueOnce({
        id: 'sess_YCT2-04_1',
        classCode: 'YCT2-04',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1',
        title: 'Buổi 1',
        exercises: [{ id: 'ex-1', num: 1, title: 'Phiếu ôn tập', prompt: '', type: 'audio' }],
      });

    renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions&class=YCT2-04']);

    await screen.findByTestId('teacher-saved-session-card-1');
    const sessionSelect = (await screen.findByTestId('teacher-session-select')) as HTMLSelectElement;
    fireEvent.change(sessionSelect, { target: { value: '1' } });

    const exTitleInput = (await screen.findByTestId('teacher-exercise-title-input')) as HTMLInputElement;
    fireEvent.change(exTitleInput, { target: { value: 'Phiếu ôn tập PDF' } });

    const fileInput = screen.getByTestId('teacher-exercise-file-input') as HTMLInputElement;
    const pdfFile = new File(['%PDF-1.4'], 'phieu-on-tap.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [pdfFile] } });

    // First attempt failed -> Retry button rendered
    const retryBtn = await screen.findByText(/Thử lại|Retry/i);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(screen.getByTestId('teacher-exercise-attachments-list')).toHaveTextContent('Đã tải xong');
    });

    // Save with blank prompt succeeds validation and sends expectedUpdatedAt; first call triggers 409 conflict notice
    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(1);
    });
    expect(saveSpy.mock.calls[0][0].expectedUpdatedAt).toBe('2026-11-15T10:00:00.000Z');
  });

  it('H08: StudentHome excludes draft exercises from priorityHomeworks', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-1',
        email: 'hs@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'YCT 2',
        teacher_code: 'GV-01',
        teacher_name: 'Cô Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        schedule: 'Thứ 3',
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'sess-1',
        classCode: 'YCT2-04',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1',
        title: 'Buổi 1',
        exercises: [
          { id: 'ex-draft-hidden', num: 1, title: 'BÀI NHÁP BÍ MẬT', prompt: 'Draft', type: 'audio', status: 'draft' },
          { id: 'ex-pub-visible', num: 2, title: 'Bài công khai cần nộp', prompt: 'Published', type: 'audio', status: 'published' },
        ],
      },
    ]);

    renderWithQuery(<StudentHome />, ['/']);

    expect(await screen.findByText(/Bài công khai cần nộp/)).toBeInTheDocument();
    expect(screen.queryByText(/BÀI NHÁP BÍ MẬT/)).not.toBeInTheDocument();
  });

  it('N08-N10: Unassigned student sees Học vụ Khổng Tử Nhí / Trung tâm instead of Cô giáo fallback', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-new',
        email: 'hs.new@khongtunhi.com',
        name: 'Học Viên Mới',
        role: 'student',
        roles: ['student'],
        classCode: null,
        assignedClasses: [],
        hasLiveClass: false,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
      role: 'student',
      groupRooms: [],
      privateRoom: {
        roomId: 'student:hs.new@khongtunhi.com',
        type: 'student',
        label: '🏢 Học vụ Khổng Tử Nhí',
        hasAssignedTeacher: false,
        recipientTargetType: 'support_center',
        unreadCount: 0,
      },
      privateThreads: [],
    });
    vi.spyOn(chatApi, 'getMessages').mockResolvedValue({
      roomId: 'student:hs.new@khongtunhi.com',
      messages: [],
      pinnedMessage: null,
      pagination: {
        hasMore: false,
        nextCursor: null,
        oldestCreatedAt: null,
        limit: 30,
        totalAvailable: 0,
      },
    });

    renderWithQuery(<ChatLayout />, ['/chat?room=student:hs.new@khongtunhi.com']);

    const matches = await screen.findAllByText(/Học vụ Khổng Tử Nhí|Trung tâm/i);
    expect(matches.length).toBeGreaterThan(0);
    expect(screen.queryByText(/Nhắn riêng Cô/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Lão sư Chủ nhiệm/i)).not.toBeInTheDocument();
  });

  it('N16: ClassroomsPage refreshes permissions immediately when backend returns 403 revocation', async () => {
    const refreshSpy = vi.fn().mockResolvedValue(undefined);
    useAuthStore.setState({
      user: {
        id: 'stu-moved',
        email: 'hs.moved@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
      refreshPermissions: refreshSpy,
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockRejectedValue(
      Object.assign(new Error('Không còn quyền truy cập lớp YCT2-04'), { status: 403 })
    );

    renderWithQuery(<ClassroomsPage />, ['/classrooms?class=YCT2-04']);

    await waitFor(() => {
      expect(refreshSpy).toHaveBeenCalled();
    });
  });

  it('N19 + P01 + P10-P12: AppShell uses lightweight summary polling and supports Desktop PWA Install + Logout Push Unsubscribe', async () => {
    const summarySpy = vi.spyOn(ktnApi, 'getNotificationsSummary').mockResolvedValue({
      unreadCount: 0,
      totalCount: 0,
      latestAt: null,
    });
    const fullNotifSpy = vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
      notifications: [],
      readIds: [],
      unreadCount: 0,
      totalCount: 0,
    });
    vi.spyOn(chatApi, 'getRooms').mockResolvedValue({
      role: 'student',
      groupRooms: [],
      privateThreads: [],
    });

    useAuthStore.setState({
      user: {
        id: 'stu-shell',
        email: 'hs@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });

    renderWithQuery(
      <Routes>
        <Route element={<AppShell />}>
          <Route path="*" element={<div data-testid="dummy-child">OK</div>} />
        </Route>
      </Routes>,
      ['/']
    );

    await waitFor(() => {
      expect(summarySpy).toHaveBeenCalled();
    });
    // AppShell idle shell MUST NOT eagerly spam full /notifications endpoint before dropdown/bell click
    expect(fullNotifSpy).not.toHaveBeenCalled();

    // Desktop PWA Install button appears cleanly; clicking opens Windows/macOS guide when native prompt isn't emitted
    const pwaBtn = await screen.findByTestId('header-pwa-install-btn');
    expect(pwaBtn).toHaveTextContent(/Cài Khổng Tử Nhí|Install Khổng Tử Nhí/);
    fireEvent.click(pwaBtn);
    expect(await screen.findByTestId('pwa-install-guide-modal')).toBeInTheDocument();
    expect(screen.getByTestId('pwa-install-guide-modal')).toHaveTextContent(/Windows|macOS/);
  });

  it('P11: usePwaInstall captures beforeinstallprompt, prompts natively, and marks installed on appinstalled', async () => {
    function Harness() {
      const pwa = usePwaInstall();
      return (
        <div>
          <span data-testid="can-native">{String(pwa.canNativeInstall)}</span>
          <span data-testid="is-installed">{String(pwa.isInstalled)}</span>
          <button type="button" data-testid="trigger-btn" onClick={() => void pwa.triggerInstall()}>
            Install
          </button>
        </div>
      );
    }

    render(<Harness />);
    expect(screen.getByTestId('can-native')).toHaveTextContent('false');

    const promptMock = vi.fn().mockResolvedValue(undefined);
    const evt = new Event('beforeinstallprompt') as Event & {
      prompt?: () => Promise<void>;
      userChoice?: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
    };
    evt.prompt = promptMock;
    evt.userChoice = Promise.resolve({ outcome: 'accepted', platform: 'windows' });

    act(() => {
      window.dispatchEvent(evt);
    });
    expect(screen.getByTestId('can-native')).toHaveTextContent('true');

    await act(async () => {
      fireEvent.click(screen.getByTestId('trigger-btn'));
    });
    expect(promptMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('is-installed')).toHaveTextContent('true');
  });

  it('N19-LOGOUT: ktnApi.logout sends push unsubscribeEndpoint to Worker and unsubscribes Service Worker pushManager', async () => {
    const unsubMock = vi.fn().mockResolvedValue(true);
    const subMock = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/device-xyz',
      unsubscribe: unsubMock,
    };
    const origSw = navigator.serviceWorker;
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        getRegistrations: vi.fn().mockResolvedValue([
          { pushManager: { getSubscription: vi.fn().mockResolvedValue(subMock) } },
        ]),
        getRegistration: vi.fn().mockResolvedValue(null),
      },
    });
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    try {
      await ktnApi.logout();
      expect(fetchSpy).toHaveBeenCalled();
      const logoutCall = fetchSpy.mock.calls.find(([u]) => String(u).includes('/api/ktn/auth/logout'));
      expect(logoutCall).toBeTruthy();
      const bodyObj = JSON.parse(String((logoutCall?.[1] as RequestInit)?.body || '{}'));
      expect(bodyObj.unsubscribeEndpoint).toBe('https://fcm.googleapis.com/fcm/send/device-xyz');
      expect(unsubMock).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: origSw });
    }
  });

  it('ClassroomsPage hides drafts from sidebar counter, cleans duplicated Bài N: prefix, and displays Cần sửa badge for revision_requested', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-rev-1',
        email: 'hoangngan@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'Lớp YCT2-04',
        teacher_code: 'GV-01',
        schedule: 'T3-T5 19:00',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'YCT2-04::1',
        classCode: 'YCT2-04',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1: Thanh điệu',
        title: 'Buổi 1: Thanh điệu',
        updatedAt: '2026-11-15T10:00:00.000Z',
        exercises: [
          {
            id: 'ex-pub-1',
            num: 1,
            title: 'Bài 1: Bài 1: Luyện nghe thanh điệu',
            prompt: 'Nghe và lặp lại',
            type: 'audio',
            status: 'published',
          },
          {
            id: 'ex-draft-2',
            num: 2,
            title: 'Phiếu nháp chưa giao',
            prompt: 'Nháp giáo viên',
            type: 'text',
            status: 'draft',
          },
        ],
      },
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([
      {
        id: 'hw-rev-101',
        student_email: 'hoangngan@khongtunhi.com',
        student_name: 'Hoàng Ngân',
        course_id: 'CLASS_YCT2-04',
        class_code: 'YCT2-04',
        lesson_num: 101,
        lesson_title: 'Luyện nghe thanh điệu',
        file_url: '',
        file_type: 'audio',
        attachments: [],
        status: 'revision_requested',
        score: null,
        teacher_feedback: 'Con thu âm lại rõ thanh 3 nhé!',
        student_note: 'Em nộp bài 1',
        submitted_at: '2026-11-15T11:00:00.000Z',
      },
    ]);

    renderWithQuery(<ClassroomsPage />, ['/classrooms?class=YCT2-04&session=1']);

    const badge = await screen.findByTestId('classroom-hw-status-101');
    expect(badge).toHaveTextContent('Cần sửa');
    expect(badge).not.toHaveTextContent('Đã nộp');

    const card = await screen.findByTestId('classroom-exercise-101');
    expect(card).toHaveTextContent('Bài 1: Luyện nghe thanh điệu');
    expect(card).not.toHaveTextContent('Bài 1: Bài 1:');

    expect(screen.queryByText('Phiếu nháp chưa giao')).not.toBeInTheDocument();
    expect(screen.getByText('1 bài tập')).toBeInTheDocument();
  });

  it('TeacherWorkspace skips getStudents(undefined) full-table call when no class is selected on Assign tab', async () => {
    useAuthStore.setState({
      user: {
        id: 't-scope-1',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    const classesSpy = vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'Lớp YCT2-04',
        teacher_code: 'GV-01',
        schedule: 'T3-T5 19:00',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
    const studentsSpy = vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);

    renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions']);

    const classSel = (await screen.findByTestId('teacher-exercise-class-select')) as HTMLSelectElement;
    await waitFor(() => {
      expect(classesSpy).toHaveBeenCalled();
    });
    expect(classSel.value).toBe('');
    expect(studentsSpy).not.toHaveBeenCalled();
  });

  it('StudentHome requests paginated notifications { limit: 50, offset: 0 } to share cache with NotificationCenter/AppShell', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-home-1',
        email: 'hoangngan@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getStudentMe').mockResolvedValue({
      ok: true,
      student: {
        code: 'HS-01',
        name: 'Hoàng Ngân',
        email: 'hoangngan@khongtunhi.com',
        class_code: 'YCT2-04',
        online_courses: [],
      },
    } as never);
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
    const notifSpy = vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
      notifications: [],
      readIds: [],
    });

    renderWithQuery(<StudentHome />, ['/']);

    await waitFor(() => {
      expect(notifSpy).toHaveBeenCalledWith({ limit: 50, offset: 0 });
    });
  });

  it('H12-H15: Edit preserves prior exercises, 409 conflict alerts cleanly, and class transfer hides old class homework', async () => {
    useAuthStore.setState({
      user: {
        id: 't-h12',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'Lớp YCT2-04',
        teacher_code: 'GV-01',
        schedule: 'T3-T5 19:00',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'YCT2-04__S3',
        classCode: 'YCT2-04',
        session_num: 3,
        sessionNum: 3,
        session_title: 'Buổi 3: Gia đình',
        title: 'Buổi 3: Gia đình',
        updatedAt: '2026-11-15T10:00:00.000Z',
        exercises: [
          {
            id: 'EX-1',
            num: 1,
            type: 'audio',
            title: 'Bài 1: Nghe hội thoại',
            prompt: 'Nghe file đính kèm',
            submissionType: 'audio',
            status: 'published',
            attachments: [{ id: 'att-1', name: 'bai1.pdf', url: 'https://cdn.example/bai1.pdf', sizeBytes: 1024, mimeType: 'application/pdf' }],
          },
          {
            id: 'EX-2',
            num: 2,
            type: 'audio',
            title: 'Bài 2: Đọc đoạn văn',
            prompt: 'Thu âm 30 giây',
            submissionType: 'audio',
            status: 'published',
            attachments: [],
          },
        ],
      },
    ]);

    const saveSpy = vi
      .spyOn(ktnApi, 'saveClassSession')
      .mockRejectedValueOnce(
        new KtnApiError({
          message: 'Phiên đã được cập nhật ở tab khác',
          status: 409,
          code: 'SESSION_CONFLICT',
        })
      )
      .mockResolvedValueOnce({
        id: 'YCT2-04__S3',
        classCode: 'YCT2-04',
        session_num: 3,
        sessionNum: 3,
        session_title: 'Buổi 3: Gia đình',
        title: 'Buổi 3: Gia đình',
        updatedAt: '2026-11-15T10:05:00.000Z',
        exercises: [
          {
            id: 'EX-1',
            num: 1,
            type: 'audio',
            title: 'Bài 1: Nghe hội thoại (Đã sửa)',
            prompt: 'Nghe file đính kèm',
            submissionType: 'audio',
            status: 'published',
            attachments: [{ id: 'att-1', name: 'bai1.pdf', url: 'https://cdn.example/bai1.pdf', sizeBytes: 1024, mimeType: 'application/pdf' }],
          },
          {
            id: 'EX-2',
            num: 2,
            type: 'audio',
            title: 'Bài 2: Đọc đoạn văn',
            prompt: 'Thu âm 30 giây',
            submissionType: 'audio',
            status: 'published',
            attachments: [],
          },
        ],
      });

    renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions']);

    const classSel = await screen.findByTestId('teacher-exercise-class-select');
    await waitFor(() => {
      expect(classSel.querySelector('option[value="YCT2-04"]')).toBeTruthy();
    });
    fireEvent.change(classSel, { target: { value: 'YCT2-04' } });

    const editBtn = await screen.findByTestId('teacher-edit-saved-exercise-btn-EX-1');
    fireEvent.click(editBtn);

    const titleInput = (await screen.findByTestId('teacher-exercise-title-input')) as HTMLInputElement;
    fireEvent.change(titleInput, { target: { value: 'Bài 1: Nghe hội thoại (Đã sửa)' } });

    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    fireEvent.click(await screen.findByTestId('teacher-confirm-overwrite-btn'));

    // H15: 409 conflict displays explicit warning without wiping session data
    const errEl = await screen.findByTestId('teacher-attachment-error');
    expect(errEl).toBeInTheDocument();
    expect(saveSpy).toHaveBeenCalledTimes(1);

    // H12: Retry after refresh sends update_exercise preserving EX-1 + EX-2
    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    fireEvent.click(await screen.findByTestId('teacher-confirm-overwrite-btn'));
    await waitFor(() => {
      expect(saveSpy).toHaveBeenCalledTimes(2);
    });
    expect(saveSpy.mock.calls[1][0]).toMatchObject({
      mode: 'update_exercise',
      exercise: expect.objectContaining({ id: 'EX-1' }),
    });
    expect(screen.getByTestId('teacher-saved-exercise-EX-2')).toBeInTheDocument();
  });

  it('H14: Student transferred from Class A to Class B sees only Class B assignments on ClassroomsPage', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-h14',
        email: 'student.a@khongtunhi.com',
        name: 'Minh Anh',
        role: 'student',
        roles: ['student'],
        classCode: 'CLS-B',
        assignedClasses: ['CLS-B'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'CLS-B',
        name: 'Lớp B',
        teacher_code: 'GV-B',
        schedule: 'T2-T4',
        teacher_name: 'Cô B',
        teacher_email: 'b@khongtunhi.com',
        total_lessons: 20,
        current_lesson: 1,
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([
      {
        id: 'CLS-B__S1',
        classCode: 'CLS-B',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1 Lớp B',
        title: 'Buổi 1 Lớp B',
        exercises: [{ id: 'EX-B1', num: 1, type: 'audio', title: 'Bài tập Lớp B', prompt: 'Đọc từ mới', submissionType: 'audio', status: 'published' }],
      },
      {
        id: 'CLS-A__S1',
        classCode: 'CLS-A',
        session_num: 1,
        sessionNum: 1,
        session_title: 'Buổi 1 Lớp A Cũ',
        title: 'Buổi 1 Lớp A Cũ',
        exercises: [{ id: 'EX-A1', num: 1, type: 'audio', title: 'Bài tập Lớp A Cũ', prompt: 'Không được hiển thị', submissionType: 'audio', status: 'published' }],
      },
    ]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);

    renderWithQuery(<ClassroomsPage />, ['/classrooms']);

    expect(await screen.findByText(/Bài tập Lớp B/)).toBeInTheDocument();
    expect(screen.queryByText(/Bài tập Lớp A Cũ/)).not.toBeInTheDocument();
  });

  it('D3 & CORS: syncRemoteVocabulary uses same-origin /api/ktn/vocab (never hardcoded cross-origin workers.dev)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })
    );
    const words = await syncRemoteVocabulary('hsk1');
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const calledUrl = String(fetchSpy.mock.calls[0][0]);
    expect(calledUrl).toBe('/api/ktn/vocab?level=hsk1');
    expect(calledUrl).not.toContain('workers.dev');
    expect(words.length).toBeGreaterThan(0);
  });

  it('BUG-1 Regression: cross-tab logout & account switch on ktn_sll_persistent_auth_v2 syncs useAuthStore and clears drafts', async () => {
    const studentSession = {
      id: 'stu-ct-1',
      email: 'tab1.student@khongtunhi.com',
      name: 'Bé Tab Một',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      assignedClasses: ['YCT2-04'],
      hasLiveClass: true,
      hasOnlineCourses: false,
      onlineCourses: [],
    };
    saveStoredSession(studentSession, 'jwt-tab1-token');
    expect(localStorage.getItem('ktn_sll_persistent_auth_v2')).toContain('tab1.student@khongtunhi.com');

    useAuthStore.setState({
      user: { ...studentSession, token: 'jwt-tab1-token' },
      authUser: { ...studentSession, token: 'jwt-tab1-token' },
    });
    useUiStore.getState().setRoomDraft('class:YCT2-04', 'Bản nháp riêng của Tab 1');

    act(() => {
      localStorage.removeItem('ktn_sll_persistent_auth_v2');
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'ktn_sll_persistent_auth_v2',
          newValue: null,
        })
      );
    });

    expect(useAuthStore.getState().user).toBeNull();
    expect(useAuthStore.getState().authUser).toBeNull();
    expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();

    // Also test switching to a different account in another tab
    saveStoredSession(studentSession, 'jwt-tab1-token');
    useAuthStore.setState({
      user: { ...studentSession, token: 'jwt-tab1-token' },
      authUser: { ...studentSession, token: 'jwt-tab1-token' },
    });
    useUiStore.getState().setRoomDraft('class:YCT2-04', 'Bản nháp trước khi đổi tài khoản');
    const teacherSession = {
      ...studentSession,
      id: 'tea-ct-2',
      email: 'linh.lam@khongtunhi.com',
      name: 'Cô Lâm Linh',
      role: 'teacher' as const,
      roles: ['teacher' as const],
      token: 'jwt-tab2-teacher-token',
    };
    const verifySpy = vi.spyOn(ktnApi, 'verifySession').mockResolvedValue(teacherSession);
    saveStoredSession(teacherSession, 'jwt-tab2-teacher-token');

    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'ktn_sll_persistent_auth_v2',
          newValue: JSON.stringify(teacherSession),
        })
      );
    });

    expect(localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')).toBeNull();
    await waitFor(() => {
      expect(verifySpy).toHaveBeenCalledTimes(1);
      expect(useAuthStore.getState().user?.email).toBe('linh.lam@khongtunhi.com');
    });
  });

  it('BUG-2 Regression: newer server sessionsQuery data overrides older localSavedSessions timestamp in TeacherWorkspace', async () => {
    useAuthStore.setState({
      user: {
        id: 't-bug2',
        email: 'linh.lam@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        roles: ['teacher'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
      {
        id: 'YCT2-04',
        name: 'Lớp YCT2-04',
        teacher_code: 'GV-01',
        schedule: 'T3-T5',
        teacher_name: 'Cô Lâm Linh',
        teacher_email: 'linh.lam@khongtunhi.com',
        total_lessons: 24,
        current_lesson: 1,
        active: true,
      },
    ]);
    vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);

    let currentRemoteSessions: KtnClassSession[] = [
      {
        id: 'YCT2-04__S5',
        classCode: 'YCT2-04',
        session_num: 5,
        sessionNum: 5,
        session_title: 'Buổi 5',
        title: 'Buổi 5',
        updatedAt: '2026-11-15T10:00:00.000Z',
        exercises: [
          {
            id: 'EX-5A',
            num: 1,
            type: 'audio',
            title: 'Bài 1: Phiên bản cũ',
            prompt: 'Đọc từ mới',
            submissionType: 'audio',
            status: 'published',
            attachments: [],
          },
        ],
      },
    ];
    vi.spyOn(ktnApi, 'getClassSessions').mockImplementation(async () => currentRemoteSessions);
    vi.spyOn(ktnApi, 'saveClassSession').mockResolvedValue({
      id: 'YCT2-04__S5',
      classCode: 'YCT2-04',
      session_num: 5,
      sessionNum: 5,
      session_title: 'Buổi 5',
      title: 'Buổi 5',
      updatedAt: '2026-11-15T10:05:00.000Z',
      exercises: [
        {
          id: 'EX-5A',
          num: 1,
          type: 'audio',
          title: 'Bài 1: Lưu tại Tab A (10:05)',
          prompt: 'Đọc từ mới',
          submissionType: 'audio',
          status: 'published',
          attachments: [],
        },
      ],
    });

    const { queryClient } = renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=sessions']);

    const classSel = await screen.findByTestId('teacher-exercise-class-select');
    await waitFor(() => {
      expect(classSel.querySelector('option[value="YCT2-04"]')).toBeTruthy();
    });
    fireEvent.change(classSel, { target: { value: 'YCT2-04' } });

    fireEvent.click(await screen.findByTestId('teacher-edit-saved-exercise-btn-EX-5A'));
    fireEvent.change(await screen.findByTestId('teacher-exercise-title-input'), {
      target: { value: 'Bài 1: Lưu tại Tab A (10:05)' },
    });
    fireEvent.click(screen.getByTestId('teacher-save-session-btn'));
    fireEvent.click(await screen.findByTestId('teacher-confirm-overwrite-btn'));

    expect((await screen.findAllByText(/Lưu tại Tab A \(10:05\)/)).length).toBeGreaterThan(0);

    // Simulate Tab B saving newer data at 10:15:00Z and sessionsQuery refetching
    currentRemoteSessions = [
      {
        id: 'YCT2-04__S5',
        classCode: 'YCT2-04',
        session_num: 5,
        sessionNum: 5,
        session_title: 'Buổi 5',
        title: 'Buổi 5',
        updatedAt: '2026-11-15T10:15:00.000Z',
        exercises: [
          {
            id: 'EX-5A',
            num: 1,
            type: 'audio',
            title: 'Bài 1: Cập nhật mới từ Tab B (10:15)',
            prompt: 'Đọc từ mới',
            submissionType: 'audio',
            status: 'published',
            attachments: [],
          },
          {
            id: 'EX-5B',
            num: 2,
            type: 'audio',
            title: 'Bài 2: Thêm mới ở Tab B',
            prompt: 'Viết chữ Hán',
            submissionType: 'audio',
            status: 'published',
            attachments: [],
          },
        ],
      },
    ];
    await act(async () => {
      await queryClient.invalidateQueries({ queryKey: ['ktn-class-sessions', 'YCT2-04'] });
    });

    expect((await screen.findAllByText(/Cập nhật mới từ Tab B \(10:15\)/)).length).toBeGreaterThan(0);
    expect(screen.getByTestId('teacher-saved-exercise-EX-5B')).toBeInTheDocument();
  });

  it('BUG-3 Regression: StudentHome markReadMutation invalidates ktn-notifications-summary for header badge consistency', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-bug3',
        email: 'hoangngan@khongtunhi.com',
        name: 'Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        assignedClasses: ['YCT2-04'],
        hasLiveClass: true,
        hasOnlineCourses: false,
        onlineCourses: [],
      },
    });
    vi.spyOn(ktnApi, 'getStudentMe').mockResolvedValue({
      ok: true,
      student: {
        code: 'HS-01',
        name: 'Hoàng Ngân',
        email: 'hoangngan@khongtunhi.com',
        class_code: 'YCT2-04',
        online_courses: [],
      },
    } as never);
    vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
    vi.spyOn(ktnApi, 'getNotifications').mockResolvedValue({
      notifications: [
        {
          id: 'NOTIF-BUG3-UNREAD',
          type: 'homework_graded',
          classCode: 'YCT2-04',
          title: 'Cô đã chấm bài tập số 1',
          body: '9.5/10 — Phát âm rõ ràng',
          actionUrl: '#/classrooms?class=YCT2-04',
          createdAt: new Date().toISOString(),
          read: false,
        },
      ],
      readIds: [],
    });
    const markSpy = vi.spyOn(ktnApi, 'markNotificationsRead').mockResolvedValue({ ok: true, markedCount: 1 } as never);

    const { queryClient } = renderWithQuery(<StudentHome />, ['/']);
    const invalidateSpy = vi.spyOn(queryClient, 'invalidateQueries');

    const notifItemBtn = await screen.findByText(/Cô đã chấm bài tập số 1/);
    fireEvent.click(notifItemBtn);

    await waitFor(() => {
      expect(markSpy).toHaveBeenCalledWith(['NOTIF-BUG3-UNREAD']);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ktn-notifications-summary'] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['ktn-notifications'] });
    });
  });
});
