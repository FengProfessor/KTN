import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { TeacherWorkspace } from '@/features/teacher/components/TeacherWorkspace';
import {
  TeacherForumInbox,
  detectAttachmentKind,
  normalizeForumAttachmentRecord,
  normalizeForumQuestionRecord,
} from '@/features/teacher/components/TeacherForumInbox';
import { LessonForumPanel } from '@/features/learning/components/LessonForumPanel';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';

function createTestQueryClient() {
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

function renderWithQuery(
  ui: React.ReactElement,
  initialEntries: string[] = ['/teacher/classes']
) {
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

describe('Agent C — Teacher Onboarding, Permission Boundaries & Forum UI', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useUiStore.setState({
      isDemoMode: false,
      toasts: [],
    });
    useAuthStore.setState({
      user: {
        id: 'KTN-GV-01',
        email: 'colinh@khongtunhi.com',
        name: 'Cô Lâm Linh',
        role: 'teacher',
        classCode: 'CAP1-T24',
        assignedClasses: ['CAP1-T24'],
      } as any,
    });
  });

  describe('C1 & C2: TeacherWorkspace Student Onboarding & Permission Boundaries', () => {
    beforeEach(() => {
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
        {
          id: 'CAP1-T24',
          name: 'Cấp 1 — Tối 2-4',
          teacher_name: 'Cô Lâm Linh',
          teacher_email: 'colinh@khongtunhi.com',
          schedule: '19:00 - 20:30 (T2, T4)',
          level: 'Cấp 1',
        },
        {
          id: 'CAP2-T35',
          name: 'Cấp 2 — Tối 3-5 (Lớp giáo viên khác)',
          teacher_name: 'Thầy Minh Quân',
          teacher_email: 'thayquan@khongtunhi.com',
          schedule: '19:00 - 20:30 (T3, T5)',
          level: 'Cấp 2',
        },
      ] as any);

      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([
        { id: 'course-cap1', title: 'Khổng Tử Nhí Cấp 1 Online' },
        { id: 'course-cap2', title: 'Khổng Tử Nhí Cấp 2 Online' },
      ] as any);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getAttendance').mockResolvedValue({
        ok: true,
        classCode: 'CAP1-T24',
        sessionNum: 1,
        records: [],
        summary: {
          total: 0,
          present: 0,
          late: 0,
          absentExcused: 0,
          absentUnexcused: 0,
        },
      } as any);
      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [],
        summary: { unansweredCount: 0, answeredCount: 0, totalCount: 0 },
      } as any);
      vi.spyOn(ktnApi, 'getForumLeaderboard').mockResolvedValue({
        ok: true,
        myStats: { totalPoints: 0, answersCount: 0, videoAnswersCount: 0, acceptedAnswersCount: 0 },
        leaderboard: [],
      } as any);
    });

    it('C1: renders all 7 onboarding fields, sends parentPhone + phone + parentName + note + classCode, and displays returned parent/student details', async () => {
      const createSpy = vi.spyOn(ktnApi, 'teacherCreateStudent').mockResolvedValue({
        ok: true,
        created: true,
        student: {
          id: 'STU-101',
          studentCode: 'KTN-STU-101',
          name: 'Bé Trần Minh Khang',
          email: 'minhkhang@khongtunhi.com',
          classCode: 'CAP1-T24',
          phone: '0912345678',
          parentName: 'Chị Nguyễn Thu Hà',
          parentPhone: '0987654321',
          note: 'Bé mới học phát âm Pinyin, cần kèm thêm thanh 3',
        },
        credentials: {
          loginIdentifier: 'minhkhang@khongtunhi.com',
          initialPassword: 'Ktn@2026',
          temporaryPasswordIssued: true,
        },
      } as any);

      renderWithQuery(<TeacherWorkspace />);

      // Switch to Danh sách Lớp & Học viên sub-tab
      const studentsTabBtn = await screen.findByTestId('teacher-tab-students');
      fireEvent.click(studentsTabBtn);

      const openBtn = await screen.findByTestId('teacher-create-student-btn');
      fireEvent.click(openBtn);

      const modal = await screen.findByTestId('teacher-create-student-modal');
      expect(modal).toBeTruthy();

      const nameInput = screen.getByTestId('teacher-create-student-name-input') as HTMLInputElement;
      const emailInput = screen.getByTestId('teacher-create-student-email-input') as HTMLInputElement;
      const phoneInput = screen.getByTestId('teacher-create-student-phone-input') as HTMLInputElement;
      const parentNameInput = screen.getByTestId(
        'teacher-create-student-parent-name-input'
      ) as HTMLInputElement;
      const parentPhoneInput = screen.getByTestId(
        'teacher-create-student-parent-phone-input'
      ) as HTMLInputElement;
      const classSelect = screen.getByTestId(
        'teacher-create-student-class-select'
      ) as HTMLSelectElement;
      const noteInput = screen.getByTestId(
        'teacher-create-student-note-input'
      ) as HTMLInputElement;

      // C2 check: Only teacher's assigned class CAP1-T24 is selectable, unassigned CAP2-T35 is excluded
      const classOptionValues = Array.from(classSelect.options).map((o) => o.value);
      expect(classOptionValues).toEqual(['CAP1-T24']);
      expect(classOptionValues).not.toContain('CAP2-T35');

      fireEvent.change(nameInput, { target: { value: 'Bé Trần Minh Khang' } });
      fireEvent.change(emailInput, { target: { value: 'MinhKhang@khongtunhi.com' } });
      fireEvent.change(phoneInput, { target: { value: '0912345678' } });
      fireEvent.change(parentNameInput, { target: { value: 'Chị Nguyễn Thu Hà' } });
      fireEvent.change(parentPhoneInput, { target: { value: '0987654321' } });
      fireEvent.change(noteInput, {
        target: { value: 'Bé mới học phát âm Pinyin, cần kèm thêm thanh 3' },
      });

      fireEvent.click(screen.getByTestId('teacher-submit-create-student-btn'));

      await waitFor(() => {
        expect(createSpy).toHaveBeenCalledTimes(1);
      });

      const payload = createSpy.mock.calls[0][0] as any;
      expect(payload).toMatchObject({
        name: 'Bé Trần Minh Khang',
        email: 'minhkhang@khongtunhi.com',
        phone: '0912345678',
        studentPhone: '0912345678',
        parentName: 'Chị Nguyễn Thu Hà',
        parentPhone: '0987654321',
        classCode: 'CAP1-T24',
        note: 'Bé mới học phát âm Pinyin, cần kèm thêm thanh 3',
      });
      expect(typeof payload.clientRequestId).toBe('string');
      expect(payload.clientRequestId.length).toBeGreaterThan(5);
      // C2: Teacher must never send courseIds to self-grant online courses during creation
      expect(payload.courseIds).toBeUndefined();

      // Verify credentials and parent details are displayed in the confirmation panel
      expect(await screen.findByTestId('teacher-created-student-credentials')).toBeTruthy();
      expect(screen.getByTestId('teacher-created-student-email-display').textContent).toContain(
        'minhkhang@khongtunhi.com'
      );
      expect(screen.getByTestId('teacher-created-student-password-display').textContent).toContain(
        'Ktn@2026'
      );
      expect(
        screen.getByTestId('teacher-created-student-parent-name-display').textContent
      ).toContain('Chị Nguyễn Thu Hà');
      expect(
        screen.getByTestId('teacher-created-student-parent-phone-display').textContent
      ).toContain('0987654321');
      expect(screen.getByTestId('teacher-created-student-note-display').textContent).toContain(
        'Bé mới học phát âm Pinyin'
      );

      // Verify student row is immediately added to the class roster
      expect(
        await screen.findByTestId('teacher-student-row-minhkhang@khongtunhi.com')
      ).toBeTruthy();
    });

    it('C1 & C2: falls back phone to parentPhone when student phone is blank, preserves identical clientRequestId across retry, and routes online course requests to Admin', async () => {
      let callCount = 0;
      const createSpy = vi.spyOn(ktnApi, 'teacherCreateStudent').mockImplementation(async () => {
        callCount += 1;
        if (callCount === 1) {
          throw new Error('Mất kết nối mạng tạm thời');
        }
        return {
          ok: true,
          created: true,
          student: {
            id: 'STU-102',
            studentCode: 'KTN-STU-102',
            name: 'Bé Lê Bảo Ngọc',
            email: 'baongoc@khongtunhi.com',
            classCode: 'CAP1-T24',
          },
          credentials: {
            loginIdentifier: 'baongoc@khongtunhi.com',
            initialPassword: 'Ktn@2026',
            temporaryPasswordIssued: true,
          },
        } as any;
      });

      const grantSpy = vi.spyOn(ktnApi, 'createCourseGrantRequest').mockResolvedValue({
        ok: true,
        request: {
          id: 'CGR-01',
          student_email: 'baongoc@khongtunhi.com',
          student_name: 'Bé Lê Bảo Ngọc',
          course_id: 'course-cap1',
          course_title: 'Khổng Tử Nhí Cấp 1 Online',
          class_code: 'CAP1-T24',
          status: 'pending',
          requested_by_email: 'colinh@khongtunhi.com',
          created_at: new Date().toISOString(),
        },
      } as any);

      renderWithQuery(<TeacherWorkspace />);

      fireEvent.click(await screen.findByTestId('teacher-tab-students'));
      fireEvent.click(await screen.findByTestId('teacher-create-student-btn'));

      fireEvent.change(screen.getByTestId('teacher-create-student-name-input'), {
        target: { value: 'Bé Lê Bảo Ngọc' },
      });
      fireEvent.change(screen.getByTestId('teacher-create-student-email-input'), {
        target: { value: 'baongoc@khongtunhi.com' },
      });
      // Leave student phone empty, provide parentPhone
      fireEvent.change(screen.getByTestId('teacher-create-student-parent-name-input'), {
        target: { value: 'Anh Lê Văn Tùng' },
      });
      fireEvent.change(screen.getByTestId('teacher-create-student-parent-phone-input'), {
        target: { value: '0909111222' },
      });

      // First attempt fails
      fireEvent.click(screen.getByTestId('teacher-submit-create-student-btn'));
      await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(1));

      // Retry without changing student email/class
      fireEvent.click(screen.getByTestId('teacher-submit-create-student-btn'));
      await waitFor(() => expect(createSpy).toHaveBeenCalledTimes(2));

      const firstPayload = createSpy.mock.calls[0][0] as any;
      const secondPayload = createSpy.mock.calls[1][0] as any;
      expect(firstPayload.clientRequestId).toBe(secondPayload.clientRequestId);
      expect(secondPayload.parentPhone).toBe('0909111222');
      // Fallback ensures Worker receives parentPhone in `phone` when studentPhone is blank
      expect(secondPayload.phone).toBe('0909111222');

      // Click "Đề nghị mở khóa học online" from created student panel
      const requestCourseBtn = await screen.findByTestId('teacher-request-course-from-created-btn');
      fireEvent.click(requestCourseBtn);

      const grantModal = await screen.findByTestId('teacher-request-course-modal');
      expect(grantModal).toBeTruthy();

      fireEvent.change(screen.getByTestId('teacher-request-course-select'), {
        target: { value: 'course-cap1' },
      });
      fireEvent.click(screen.getByTestId('teacher-submit-course-request-btn'));

      await waitFor(() => expect(grantSpy).toHaveBeenCalledTimes(1));
      expect(grantSpy.mock.calls[0][0]).toMatchObject({
        studentEmail: 'baongoc@khongtunhi.com',
        requestedCourseId: 'course-cap1',
        classCode: 'CAP1-T24',
      });
    });
  });

  describe('C3: Forum Normalization, TeacherForumInbox & LessonForumPanel', () => {
    it('normalizes camelCase Worker forum questions, answers, and attachments accurately', () => {
      const att = normalizeForumAttachmentRecord({
        id: 'att-camel-1',
        title: 'phat-am-thanh-3.mp3',
        fileUrl: 'https://cdn.khongtunhi.com/audio/phat-am-thanh-3.mp3',
        fileType: 'audio/mpeg',
        size: 42000,
      });
      expect(att.type).toBe('audio');
      expect(att.name).toBe('phat-am-thanh-3.mp3');
      expect(att.url).toBe('https://cdn.khongtunhi.com/audio/phat-am-thanh-3.mp3');
      expect(detectAttachmentKind('video/mp4', 'huong-dan.mp4')).toBe('video');

      const question = normalizeForumQuestionRecord({
        id: 'fq-camel-101',
        courseId: 'course-cap1',
        courseTitle: 'Khổng Tử Nhí Cấp 1',
        unitId: 'unit-3',
        lessonNum: 3,
        lessonTitleSnapshot: 'Thanh điệu cơ bản',
        studentId: 'STU-09',
        studentName: 'Bé An Nhiên',
        studentEmail: 'annhien@khongtunhi.com',
        title: 'Biến điệu thanh 3',
        content: 'Cô ơi cho em hỏi cách đọc hai thanh 3 liền nhau ạ?',
        videoTimestampSeconds: 125,
        status: 'claimed',
        claimedByTeacherEmail: 'colinh@khongtunhi.com',
        claimedByTeacherName: 'Cô Lâm Linh',
        answerCount: 1,
        hasAcceptedAnswer: false,
        isFollowing: true,
        followCount: 3,
        createdAt: '2026-11-10T01:00:00.000Z',
        attachments: [att],
        answers: [
          {
            id: 'fa-camel-201',
            questionId: 'fq-camel-101',
            authorName: 'Cô Lâm Linh',
            authorRole: 'teacher',
            content: 'Em đổi âm tiết đầu thành thanh 2 nhé!',
            videoUrl: 'https://cdn.khongtunhi.com/video/thanh3.mp4',
            isAccepted: false,
            helpfulCount: 4,
            hasVotedHelpful: true,
            createdAt: '2026-11-10T01:10:00.000Z',
            attachments: [],
          },
        ],
      });

      expect(question.course_id).toBe('course-cap1');
      expect(question.unit_id).toBe('unit-3');
      expect(question.lesson_number).toBe(3);
      expect(question.lesson_title_snapshot).toBe('Thanh điệu cơ bản');
      expect(question.video_timestamp_seconds).toBe(125);
      expect(question.claimed_by_name).toBe('Cô Lâm Linh');
      expect(question.status).toBe('claimed');
      expect(question.answers?.[0].author_name).toBe('Cô Lâm Linh');
      expect(question.answers?.[0].video_url).toBe('https://cdn.khongtunhi.com/video/thanh3.mp4');
      expect(question.answers?.[0].helpful_count).toBe(4);
      expect(question.answers?.[0].viewerHasVotedHelpful).toBe(true);
    });

    it('C3: TeacherForumInbox renders unanswered count without NaN, claims question (open -> claimed), answers with media attachments, and shows non-salary policy notice', async () => {
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([
        { id: 'course-cap1', title: 'Khổng Tử Nhí Cấp 1' },
      ] as any);

      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        summary: {
          unansweredCount: 1,
          answeredCount: 0,
          totalCount: 1,
        },
        questions: [
          {
            id: 'fq-inbox-1',
            courseId: 'course-cap1',
            courseTitle: 'Khổng Tử Nhí Cấp 1',
            unitId: 'unit-3',
            lessonNum: 3,
            lessonTitleSnapshot: 'Bài 3: Thanh điệu cơ bản',
            studentName: 'Bé Hoàng Ngân',
            studentEmail: 'hoangngan@khongtunhi.com',
            title: 'Thắc mắc biến điệu Bài 3',
            content: 'Cô ơi giải thích giúp con đoạn 01:30 với ạ!',
            videoTimestampSeconds: 90,
            status: 'open',
            answerCount: 0,
            createdAt: new Date().toISOString(),
            attachments: [],
            answers: [],
          },
        ],
      } as any);

      vi.spyOn(ktnApi, 'getForumLeaderboard').mockResolvedValue({
        ok: true,
        myStats: {
          totalPoints: 18,
          answersCount: 5,
          videoAnswersCount: 2,
          acceptedAnswersCount: 1,
        },
        leaderboard: [
          {
            teacher_email: 'colinh@khongtunhi.com',
            teacher_name: 'Cô Lâm Linh',
            total_points: 18,
            answers_count: 5,
            video_answers_count: 2,
            accepted_answers_count: 1,
            helpful_votes_received: 7,
          },
        ],
      } as any);

      const claimSpy = vi.spyOn(ktnApi, 'claimForumQuestion').mockResolvedValue({
        ok: true,
        question: {
          id: 'fq-inbox-1',
          status: 'claimed',
          claimedByTeacherEmail: 'colinh@khongtunhi.com',
          claimedByTeacherName: 'Cô Lâm Linh',
        },
      } as any);

      vi.spyOn(ktnApi, 'uploadChatFile').mockResolvedValue({
        fileUrl: 'https://cdn.khongtunhi.com/uploads/pronunciation-guide.mp3',
        fileType: 'audio/mpeg',
        size: 128000,
      });

      const answerSpy = vi.spyOn(ktnApi, 'createForumAnswer').mockResolvedValue({
        ok: true,
        pointsAwarded: 1,
        notifiedStudent: true,
        answer: {
          id: 'fa-inbox-1',
          questionId: 'fq-inbox-1',
          authorName: 'Cô Lâm Linh',
          authorRole: 'teacher',
          content: 'Con nghe file âm thanh mẫu cô vừa thu nhé, đọc thành ní hǎo nha!',
          attachments: [
            {
              id: 'att-audio-1',
              title: 'pronunciation-guide.mp3',
              fileUrl: 'https://cdn.khongtunhi.com/uploads/pronunciation-guide.mp3',
              fileType: 'audio/mpeg',
            },
          ],
          createdAt: new Date().toISOString(),
        },
      } as any);

      renderWithQuery(<TeacherForumInbox />);

      // Verify contribution points & explicit non-salary conversion policy notice
      await waitFor(() => {
        expect(screen.getByTestId('teacher-forum-my-points').textContent).toContain('18 điểm');
      });
      const policyNotice = screen.getByTestId('teacher-forum-points-policy-notice');
      expect(policyNotice.textContent).toContain('không tự động quy đổi thành lương');

      // Verify unanswered filter button shows (1) and never NaN
      const unansweredFilterBtn = screen.getByTestId('teacher-forum-filter-unanswered');
      expect(unansweredFilterBtn.textContent).toContain('(1)');
      expect(unansweredFilterBtn.textContent).not.toContain('NaN');

      // Verify question row renders under Lesson 3
      const questionRow = await screen.findByTestId('teacher-forum-question-fq-inbox-1');
      expect(questionRow.textContent).toContain('Bài 3: Thanh điệu cơ bản');

      // Claim question: open -> claimed
      const claimBtn = await screen.findByTestId('teacher-claim-question-btn-fq-inbox-1');
      fireEvent.click(claimBtn);

      await waitFor(() => {
        expect(claimSpy).toHaveBeenCalledWith('fq-inbox-1');
      });
      const claimedBadge = await screen.findByTestId('teacher-forum-claimed-badge-fq-inbox-1');
      expect(claimedBadge.textContent).toContain('Cô Lâm Linh');

      // Open answer composer if not already open, upload audio attachment & submit answer
      const extraAttInput = await screen.findByTestId(
        'teacher-forum-extra-attachment-input'
      ) as HTMLInputElement;
      const audioFile = new File(['audio-bytes'], 'pronunciation-guide.mp3', {
        type: 'audio/mpeg',
      });
      fireEvent.change(extraAttInput, { target: { files: [audioFile] } });

      await screen.findByTestId('teacher-forum-staged-attachment-pronunciation-guide.mp3');

      fireEvent.change(screen.getByTestId('teacher-forum-answer-textarea'), {
        target: { value: 'Con nghe file âm thanh mẫu cô vừa thu nhé, đọc thành ní hǎo nha!' },
      });
      fireEvent.click(screen.getByTestId('teacher-submit-forum-answer-btn'));

      await waitFor(() => {
        expect(answerSpy).toHaveBeenCalledTimes(1);
      });
      const submittedPayload = answerSpy.mock.calls[0][0] as any;
      expect(submittedPayload.questionId).toBe('fq-inbox-1');
      expect(submittedPayload.attachments[0]).toMatchObject({
        name: 'pronunciation-guide.mp3',
        title: 'pronunciation-guide.mp3',
        url: 'https://cdn.khongtunhi.com/uploads/pronunciation-guide.mp3',
        fileUrl: 'https://cdn.khongtunhi.com/uploads/pronunciation-guide.mp3',
        type: 'audio',
      });
    });

    it('C3: LessonForumPanel scopes questions strictly to the current lesson, updates follow/unfollow state, and shows non-salary policy notice for teachers', async () => {
      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [
          {
            id: 'fq-lesson-3',
            courseId: 'course-cap1',
            unitId: 'unit-3',
            lessonNum: 3,
            lessonTitleSnapshot: 'Thanh điệu cơ bản',
            studentName: 'Bé Minh Anh',
            title: 'Câu hỏi đúng Bài 3',
            content: 'Nội dung câu hỏi thuộc Bài 3',
            status: 'open',
            isFollowing: false,
            followCount: 0,
            createdAt: new Date().toISOString(),
            answers: [],
          },
          {
            id: 'fq-lesson-4-other',
            courseId: 'course-cap1',
            unitId: 'unit-4',
            lessonNum: 4,
            lessonTitleSnapshot: 'Bài 4 Khác',
            studentName: 'Bé Khác',
            title: 'Câu hỏi của Bài 4 không được lẫn vào Bài 3',
            content: 'Nội dung Bài 4',
            status: 'open',
            isFollowing: false,
            followCount: 0,
            createdAt: new Date().toISOString(),
            answers: [],
          },
        ],
      } as any);

      const followSpy = vi.spyOn(ktnApi, 'toggleForumFollow').mockResolvedValue({
        ok: true,
        questionId: 'fq-lesson-3',
        isFollowing: true,
        notifyMode: 'all',
      });

      renderWithQuery(
        <LessonForumPanel
          courseId="course-cap1"
          courseTitle="Khổng Tử Nhí Cấp 1"
          unitId="unit-3"
          lessonNumber={3}
          lessonTitle="Thanh điệu cơ bản"
        />
      );

      // Verify question for Lesson 3 is displayed with its lesson badge, while Lesson 4 question is filtered out
      expect(await screen.findByTestId('forum-question-card-fq-lesson-3')).toBeTruthy();
      expect(
        screen.getByTestId('forum-question-lesson-badge-fq-lesson-3').textContent
      ).toContain('Bài 3: Thanh điệu cơ bản');
      expect(screen.queryByTestId('forum-question-card-fq-lesson-4-other')).toBeNull();

      // Verify teacher sees the contribution points non-salary conversion policy notice
      expect(screen.getByTestId('forum-points-policy-notice').textContent).toContain(
        'không tự quy đổi thành lương'
      );

      // Toggle follow -> verify button text updates to "Đang theo dõi (1)"
      const followBtn = screen.getByTestId('forum-follow-btn-fq-lesson-3');
      expect(followBtn.textContent).toContain('Theo dõi câu hỏi');
      fireEvent.click(followBtn);

      await waitFor(() => {
        expect(followSpy).toHaveBeenCalledWith({
          questionId: 'fq-lesson-3',
          following: true,
        });
      });

      await waitFor(() => {
        expect(screen.getByTestId('forum-follow-btn-fq-lesson-3').textContent).toContain(
          'Đang theo dõi (1)'
        );
      });
    });

    it('Edge case (C2): blocks student creation when teacher has zero assigned classes', async () => {
      useAuthStore.setState({
        user: {
          id: 'KTN-GV-99',
          email: 'unassigned@khongtunhi.com',
          name: 'Cô Giáo Mới',
          role: 'teacher',
          classCode: '',
          assignedClasses: [],
        } as any,
      });

      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
        {
          id: 'CAP1-T24',
          name: 'Cấp 1 — Tối 2-4',
          teacher_name: 'Cô Lâm Linh',
          teacher_email: 'colinh@khongtunhi.com',
        },
      ] as any);
      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      });
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);

      renderWithQuery(<TeacherWorkspace />);

      fireEvent.click(await screen.findByTestId('teacher-tab-students'));
      fireEvent.click(await screen.findByTestId('teacher-create-student-btn'));

      const warning = await screen.findByTestId('teacher-no-assigned-classes-warning');
      expect(warning.textContent).toContain('Bạn chưa được phân công lớp');
      expect(screen.queryByTestId('teacher-submit-create-student-btn')).toBeNull();
    });

    it('Edge case (C3): LessonForumPanel question creation preserves clientRequestId on retry, sends lessonNum + videoTimestampSeconds, and accepts teacher answer', async () => {
      useAuthStore.setState({
        user: {
          id: 'STU-09',
          email: 'annhien@khongtunhi.com',
          name: 'Bé An Nhiên',
          role: 'student',
          classCode: 'CAP1-T24',
        } as any,
      });

      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [],
      } as any);

      let createAttempts = 0;
      const createQPy = vi
        .spyOn(ktnApi, 'createForumQuestion')
        .mockImplementation(async (payload: any) => {
          createAttempts += 1;
          if (createAttempts === 1) {
            throw new Error('Mạng chập chờn');
          }
          return {
            ok: true,
            notifiedTeachersCount: 2,
            question: {
              id: 'fq-new-99',
              courseId: payload.courseId,
              unitId: payload.unitId,
              lessonNum: payload.lessonNum,
              lessonTitleSnapshot: payload.lessonTitleSnapshot,
              studentId: 'STU-09',
              studentName: 'Bé An Nhiên',
              studentEmail: 'annhien@khongtunhi.com',
              title: payload.title,
              content: payload.content,
              videoTimestampSeconds: payload.videoTimestampSeconds,
              status: 'answered',
              createdAt: new Date().toISOString(),
              answers: [
                {
                  id: 'fa-teacher-99',
                  questionId: 'fq-new-99',
                  authorName: 'Cô Lâm Linh',
                  authorRole: 'teacher',
                  content: 'Lời giải của cô cho đoạn 03:25 nhé!',
                  isAccepted: false,
                  helpfulCount: 0,
                  createdAt: new Date().toISOString(),
                },
              ],
            },
          } as any;
        });

      const helpfulSpy = vi.spyOn(ktnApi, 'voteForumAnswerHelpful').mockResolvedValue({
        ok: true,
        alreadyVoted: false,
        pointsAwarded: 10,
        question: null as any,
      });

      renderWithQuery(
        <LessonForumPanel
          courseId="course-cap1"
          courseTitle="Khổng Tử Nhí Cấp 1"
          unitId="unit-5"
          lessonNumber={5}
          lessonTitle="Lượng từ tiếng Trung"
        />
      );

      fireEvent.click(await screen.findByTestId('forum-open-ask-form-btn'));
      fireEvent.change(screen.getByTestId('forum-question-title-input'), {
        target: { value: 'Cách phân biệt lượng từ 个 và 本' },
      });
      fireEvent.change(screen.getByTestId('forum-question-timestamp-input'), {
        target: { value: '03:25' },
      });
      fireEvent.change(screen.getByTestId('forum-question-content-input'), {
        target: { value: 'Cô ơi khi nào mình dùng lượng từ quyển sách ạ?' },
      });

      // Attempt 1 (fails)
      fireEvent.click(screen.getByTestId('forum-submit-question-btn'));
      await waitFor(() => expect(createQPy).toHaveBeenCalledTimes(1));

      // Attempt 2 (succeeds with identical clientRequestId)
      fireEvent.click(screen.getByTestId('forum-submit-question-btn'));
      await waitFor(() => expect(createQPy).toHaveBeenCalledTimes(2));

      const call1 = createQPy.mock.calls[0][0] as any;
      const call2 = createQPy.mock.calls[1][0] as any;
      expect(call1.clientRequestId).toBe(call2.clientRequestId);
      expect(call2.lessonNum).toBe(5);
      expect(call2.lessonNumber).toBe(5);
      expect(call2.videoTimestampSeconds).toBe(205);

      // Student accepts the teacher's answer
      const acceptBtn = await screen.findByTestId('forum-accept-answer-btn-fa-teacher-99');
      fireEvent.click(acceptBtn);

      await waitFor(() => {
        expect(helpfulSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            answerId: 'fa-teacher-99',
            questionId: 'fq-new-99',
            markAccepted: true,
            accept: true,
          })
        );
      });
    });

    it('C1/C2 regression: blank studentPhone + provided parentPhone does not duplicate as SĐT học viên, and course grant request preserves idempotent clientRequestId + renders backend course_title', async () => {
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
        {
          id: 'CAP1-T24',
          name: 'Cấp 1 — Tối 2-4',
          level: 'Cấp 1',
          schedule: 'T2 - T4 (19:00)',
        } as any,
      ]);
      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([
        {
          code: 'KTN-015',
          name: 'Bé Trần Minh Khôi',
          email: 'minhkhoi@khongtunhi.com',
          class_code: 'CAP1-T24',
          has_live_class: true,
          has_online_courses: false,
          online_courses: [],
        } as any,
      ]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([
        {
          id: '6adadba969897b0002482ca5',
          title: 'Khổng Tử Nhí Cấp 1',
        } as any,
      ]);
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getAttendance').mockResolvedValue({
        ok: true,
        classCode: 'CAP1-T24',
        sessionNum: 1,
        records: [],
        summary: {
          total: 0,
          present: 0,
          late: 0,
          absentExcused: 0,
          absentUnexcused: 0,
        },
      } as any);
      // Simulate real Worker response shape where course_title / course_id are snake_case
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        pendingCount: 1,
        requests: [
          {
            id: 'cgr-existing-1',
            student_email: 'minhkhoi@khongtunhi.com',
            student_name: 'Bé Trần Minh Khôi',
            class_code: 'CAP1-T24',
            course_id: '6adadba969897b0002482ca5',
            course_title: 'Khổng Tử Nhí Cấp 1 (Backend SnakeCase)',
            reason: 'Cần ôn tập ở nhà',
            status: 'pending',
            created_at: new Date().toISOString(),
          },
        ],
      } as any);

      vi.spyOn(ktnApi, 'teacherCreateStudent').mockImplementation(
        async (payload: any) =>
          ({
            ok: true,
            classCode: payload.classCode,
            initialPassword: 'Ktn#ParentPhoneOnly9',
            student: {
              code: 'KTN-778',
              name: payload.name,
              email: payload.email,
              class_code: payload.classCode,
              // Backend stores payload.phone (which fell back to parentPhone)
              phone: payload.phone,
              parent_name: payload.parentName,
              has_live_class: true,
              has_online_courses: false,
              online_courses: [],
            },
          }) as any
      );

      let reqCall = 0;
      const createCourseReqSpy = vi
        .spyOn(ktnApi, 'createCourseGrantRequest')
        .mockImplementation(async (payload: any) => {
          reqCall += 1;
          if (reqCall === 1) {
            throw new Error('Mạng chập chờn khi gửi đề nghị cấp khóa');
          }
          return {
            ok: true,
            message: 'ok',
            request: {
              id: payload.id || payload.clientRequestId || 'cgr-2',
              student_email: payload.studentEmail,
              student_name: payload.studentName,
              class_code: payload.classCode,
              course_id: payload.requestedCourseId,
              course_title: payload.requestedCourseTitle,
              reason: payload.reason,
              status: 'pending',
              created_at: new Date().toISOString(),
            },
          } as any;
        });

      renderWithQuery(<TeacherWorkspace />, ['/teacher?tab=students']);

      // Verify existing backend snake_case course_title renders in the list
      const existingReqRow = await screen.findByTestId('teacher-course-request-item-cgr-existing-1');
      expect(within(existingReqRow).getByText('Khổng Tử Nhí Cấp 1 (Backend SnakeCase)')).toBeInTheDocument();

      // Create student with blank studentPhone and provided parentPhone
      fireEvent.click(await screen.findByTestId('teacher-create-student-btn'));
      fireEvent.change(screen.getByTestId('teacher-create-student-name-input'), {
        target: { value: 'Bé Lê Bảo Châu' },
      });
      fireEvent.change(screen.getByTestId('teacher-create-student-email-input'), {
        target: { value: 'baochau@khongtunhi.com' },
      });
      // Leave teacher-create-student-phone-input empty!
      fireEvent.change(screen.getByTestId('teacher-create-student-parent-name-input'), {
        target: { value: 'Anh Tuấn' },
      });
      fireEvent.change(screen.getByTestId('teacher-create-student-parent-phone-input'), {
        target: { value: '0909111222' },
      });
      fireEvent.click(screen.getByTestId('teacher-submit-create-student-btn'));

      const banner = await screen.findByTestId('teacher-created-student-credentials');
      expect(within(banner).getByText(/SĐT phụ huynh:/)).toBeInTheDocument();
      expect(within(banner).getByText('0909111222')).toBeInTheDocument();
      expect(within(banner).queryByText(/SĐT học viên:/)).not.toBeInTheDocument();

      // Close created student modal
      fireEvent.click(within(banner).getByText('Hoàn tất'));

      const stuRow = await screen.findByTestId('teacher-student-row-baochau@khongtunhi.com');
      expect(stuRow.textContent).toContain('PH: Anh Tuấn (0909111222)');
      expect(stuRow.textContent).not.toContain('SĐT: 0909111222');

      // Test Course Grant Request retry idempotency + short reason fallback
      fireEvent.click(screen.getByTestId('teacher-request-course-for-minhkhoi@khongtunhi.com'));
      fireEvent.change(await screen.findByTestId('teacher-request-course-reason-input'), {
        target: { value: 'ok' }, // < 3 chars, should normalize to default valid reason
      });

      fireEvent.click(screen.getByTestId('teacher-submit-course-request-btn'));
      await waitFor(() => expect(createCourseReqSpy).toHaveBeenCalledTimes(1));

      // Retry after transient failure
      fireEvent.click(screen.getByTestId('teacher-submit-course-request-btn'));
      await waitFor(() => expect(createCourseReqSpy).toHaveBeenCalledTimes(2));

      const firstReqPayload = createCourseReqSpy.mock.calls[0][0] as any;
      const secondReqPayload = createCourseReqSpy.mock.calls[1][0] as any;
      expect(firstReqPayload.clientRequestId).toBeTruthy();
      expect(firstReqPayload.clientRequestId).toBe(secondReqPayload.clientRequestId);
      expect(firstReqPayload.id).toBe(secondReqPayload.id);
      expect(secondReqPayload.reason.length).toBeGreaterThanOrEqual(3);
    });

    it('C3 regression: deep-linking /teacher?tab=forum&questionId=... opens forum tab, targets the question, supports unclaiming, and blocks >100MB video uploads', async () => {
      vi.spyOn(ktnApi, 'getClasses').mockResolvedValue([
        {
          id: 'CAP1-T24',
          name: 'Cấp 1 — Tối 2-4',
          level: 'Cấp 1',
          schedule: 'T2 - T4 (19:00)',
        } as any,
      ]);
      vi.spyOn(ktnApi, 'getStudents').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getCourses').mockResolvedValue([
        {
          id: 'course-cap1',
          title: 'Khổng Tử Nhí Cấp 1',
        } as any,
      ]);
      vi.spyOn(ktnApi, 'getHomeworks').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getClassSessions').mockResolvedValue([]);
      vi.spyOn(ktnApi, 'getAttendance').mockResolvedValue({
        ok: true,
        classCode: 'CAP1-T24',
        sessionNum: 1,
        records: [],
        summary: {
          total: 0,
          present: 0,
          late: 0,
          absentExcused: 0,
          absentUnexcused: 0,
        },
      } as any);
      vi.spyOn(ktnApi, 'getCourseGrantRequests').mockResolvedValue({
        ok: true,
        requests: [],
        pendingCount: 0,
      } as any);
      vi.spyOn(ktnApi, 'getForumLeaderboard').mockResolvedValue({
        ok: true,
        month: '2026-11',
        leaderboard: [],
      } as any);

      vi.spyOn(ktnApi, 'getForumQuestions').mockResolvedValue({
        ok: true,
        questions: [
          {
            id: 'fq-deep-1',
            courseId: 'course-cap1',
            unitId: 'unit-2',
            lessonNum: 2,
            lessonTitleSnapshot: 'Bài 2: Gia đình',
            studentId: 'STU-02',
            studentName: 'Bé Nam',
            title: 'Câu hỏi được deep-link từ thông báo',
            content: 'Cô ơi giải thích giúp em chữ 爸 ạ',
            status: 'claimed',
            claimedByTeacherId: 'GV-01',
            claimedByTeacherName: 'Cô Lâm Linh',
            claimedByTeacherEmail: 'lamlinh@khongtunhi.com',
            answerCount: 0,
            createdAt: new Date().toISOString(),
            answers: [],
          } as any,
        ],
        summary: {
          total: 1,
          openCount: 0,
          claimedCount: 1,
          answeredCount: 0,
          resolvedCount: 0,
        },
      } as any);

      const claimSpy = vi.spyOn(ktnApi, 'claimForumQuestion').mockResolvedValue({
        ok: true,
        question: {
          id: 'fq-deep-1',
          status: 'open',
        } as any,
      });
      const uploadChatFileSpy = vi.spyOn(ktnApi, 'uploadChatFile');

      renderWithQuery(
        <TeacherWorkspace />,
        ['/teacher?tab=forum&questionId=fq-deep-1']
      );

      // Should automatically open the forum tab and expand fq-deep-1 composer
      expect(await screen.findByTestId('teacher-forum-inbox')).toBeInTheDocument();
      const answerInput = await screen.findByTestId('teacher-forum-answer-textarea');
      expect(answerInput).toBeInTheDocument();

      // Test >100MB video rejection in TeacherForumInbox
      const questionCard = screen.getByTestId('teacher-forum-question-fq-deep-1');
      const fileInputs = questionCard.querySelectorAll('input[type="file"]');
      const videoFileInput = fileInputs[0] as HTMLInputElement;
      const oversizedVideo = new File(['x'], 'huge-video.mp4', { type: 'video/mp4' });
      Object.defineProperty(oversizedVideo, 'size', { value: 105 * 1024 * 1024 });
      fireEvent.change(videoFileInput, { target: { files: [oversizedVideo] } });

      expect(uploadChatFileSpy).not.toHaveBeenCalled();

      // Test unclaiming a claimed question
      const unclaimBtn = screen.getByTestId('teacher-unclaim-question-btn-fq-deep-1');
      fireEvent.click(unclaimBtn);
      await waitFor(() => {
        expect(claimSpy).toHaveBeenCalledWith('fq-deep-1', 'unclaim');
      });
    });
  });
});

