import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  CheckCircle2,
  Clock,
  Search,
  Send,
  Video,
  Paperclip,
  Loader2,
  ExternalLink,
  Sparkles,
  UserCheck,
  ThumbsUp,
  X,
  PlayCircle,
  Trophy,
} from 'lucide-react';
import { ktnApi, resolveUploadedMediaUrl } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_COURSES } from '@/lib/demoData';
import {
  getCurrentLang,
  trStatic,
  translateCourseTitle,
  useI18n,
  type AppLanguage,
} from '@/i18n';
import { formatRelativeTime } from '@/lib/utils';
import {
  KtnCourse,
  KtnForumAnswer,
  KtnForumAttachment,
  KtnForumLeaderboardResponse,
  KtnForumQuestion,
} from '@/types/ktn.types';

function formatTimestampBadge(seconds?: number | null): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds) || seconds < 0) {
    return null;
  }
  const s = Math.floor(seconds);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function detectAttachmentKind(
  rawType?: string | null,
  rawUrl?: string | null
): 'image' | 'audio' | 'video' | 'file' {
  const t = String(rawType || '').toLowerCase();
  const u = String(rawUrl || '').toLowerCase();
  if (
    t === 'image' ||
    t.startsWith('image/') ||
    /\.(png|jpe?g|webp|gif|bmp|svg)(\?|$)/i.test(u)
  ) {
    return 'image';
  }
  if (
    t === 'audio' ||
    t.startsWith('audio/') ||
    /\.(mp3|wav|m4a|ogg|aac)(\?|$)/i.test(u)
  ) {
    return 'audio';
  }
  if (
    t === 'video' ||
    t.startsWith('video/') ||
    /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)
  ) {
    return 'video';
  }
  return 'file';
}

export function normalizeForumAttachmentRecord(
  raw: any,
  idx = 0,
  lang: AppLanguage = getCurrentLang()
): KtnForumAttachment & {
  title: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  mediaType: string;
} {
  const url = String(raw?.url || raw?.fileUrl || '').trim();
  const name = String(
    raw?.name ||
      raw?.title ||
      raw?.fileName ||
      trStatic(`Đính kèm ${idx + 1}`, `Attachment ${idx + 1}`, lang)
  ).trim();
  const rawMime = String(raw?.fileType || raw?.mediaType || raw?.type || raw?.kind || '').trim();
  const kind = detectAttachmentKind(raw?.kind ? String(raw.kind) : rawMime, url);
  const fileType =
    rawMime && rawMime.includes('/')
      ? rawMime
      : kind === 'image'
      ? 'image/jpeg'
      : kind === 'audio'
      ? 'audio/mpeg'
      : kind === 'video'
      ? 'video/mp4'
      : 'application/octet-stream';

  return {
    id: String(raw?.id || `att-${idx}-${name}`),
    name,
    title: name,
    fileName: name,
    url,
    fileUrl: url,
    type: kind,
    kind,
    fileType,
    mediaType: fileType,
    size: Number(raw?.size || 0) || undefined,
  };
}

export function normalizeForumAnswerRecord(
  raw: any,
  fallbackQuestionId = '',
  lang: AppLanguage = getCurrentLang()
): KtnForumAnswer {
  const authorName = String(
    raw?.author_name ||
      raw?.authorName ||
      raw?.teacher_name ||
      raw?.teacherName ||
      raw?.author_email ||
      raw?.authorEmail ||
      raw?.teacher_email ||
      raw?.teacherEmail ||
      trStatic('Giáo viên KTN', 'KTN Teacher', lang)
  ).trim();
  const authorEmail = String(
    raw?.author_email || raw?.authorEmail || raw?.teacher_email || raw?.teacherEmail || ''
  ).trim();
  const authorRole = String(raw?.author_role || raw?.authorRole || 'teacher').trim();
  const rawAtts = Array.isArray(raw?.attachments)
    ? (raw.attachments as Array<Record<string, unknown>>)
    : [];
  const attachments = rawAtts
    .map((att, i) => normalizeForumAttachmentRecord(att, i, lang))
    .filter((att) => Boolean(att.url));

  const videoUrl = String(raw?.video_url || raw?.videoUrl || '').trim() || null;
  const isAccepted = Boolean(raw?.is_accepted ?? raw?.isAccepted);
  const helpfulCount = Number(raw?.helpful_count ?? raw?.helpfulCount ?? 0) || 0;
  const viewerHasVotedHelpful = Boolean(
    raw?.viewerHasVotedHelpful ?? raw?.hasVotedHelpful
  );
  const createdAt = String(
    raw?.created_at || raw?.createdAt || new Date().toISOString()
  );

  return {
    id: String(raw?.id || `ans-${Date.now()}`),
    question_id: String(raw?.question_id || raw?.questionId || fallbackQuestionId),
    author_email: authorEmail || undefined,
    author_name: authorName,
    author_role: authorRole,
    teacher_id: (raw?.teacher_id || raw?.teacherId || null) as string | null,
    teacher_email: authorEmail || null,
    teacher_name: authorName,
    teacher_title: String(
      raw?.teacher_title || raw?.teacherTitle || trStatic('Giáo viên hướng dẫn', 'Instructor', lang)
    ),
    content: String(raw?.content || ''),
    attachments,
    video_url: videoUrl,
    video_duration_seconds:
      Number(raw?.video_duration_seconds ?? raw?.videoDurationSeconds) || null,
    video_file_size: Number(raw?.video_file_size ?? raw?.videoSizeBytes) || null,
    video_verified: Boolean(raw?.video_verified ?? raw?.videoVerified ?? Boolean(videoUrl)),
    is_accepted: isAccepted,
    helpful_count: helpfulCount,
    viewerHasVotedHelpful,
    status: String(raw?.status || 'visible'),
    created_at: createdAt,
    updated_at: String(raw?.updated_at || raw?.updatedAt || createdAt),
  };
}

export function normalizeForumQuestionRecord(
  raw: any,
  lang: AppLanguage = getCurrentLang()
): KtnForumQuestion {
  const qId = String(raw?.id || `fq-${Date.now()}`);
  const courseId = String(raw?.course_id || raw?.courseId || '').trim();
  const unitId = String(raw?.unit_id || raw?.unitId || '').trim();
  const lessonNum =
    Number(raw?.lesson_num ?? raw?.lesson_number ?? raw?.lessonNum ?? 1) || 1;
  const lessonTitleSnapshot = String(
    raw?.lesson_title_snapshot ||
      raw?.lessonTitleSnapshot ||
      trStatic(`Bài ${lessonNum}`, `Lesson ${lessonNum}`, lang)
  ).trim();
  const studentEmail = String(raw?.student_email || raw?.studentEmail || '').trim();
  const studentName = String(
    raw?.student_name ||
      raw?.studentName ||
      studentEmail ||
      trStatic('Học viên KTN', 'KTN Student', lang)
  ).trim();
  const rawTs = raw?.video_timestamp_seconds ?? raw?.videoTimestampSeconds;
  const videoTimestampSeconds =
    rawTs !== null && rawTs !== undefined && rawTs !== '' && Number.isFinite(Number(rawTs))
      ? Number(rawTs)
      : null;

  const rawAtts = Array.isArray(raw?.attachments)
    ? (raw.attachments as Array<Record<string, unknown>>)
    : [];
  const attachments = rawAtts
    .map((att, i) => normalizeForumAttachmentRecord(att, i, lang))
    .filter((att) => Boolean(att.url));

  const rawAnswers = Array.isArray(raw?.answers)
    ? (raw.answers as Array<Record<string, unknown>>)
    : [];
  const answers = rawAnswers.map((ans) => normalizeForumAnswerRecord(ans, qId, lang));

  const answerCount =
    Number(
      raw?.answer_count ?? raw?.answers_count ?? raw?.answersCount ?? raw?.answerCount ?? answers.length
    ) || answers.length;

  const claimedByTeacherId = String(
    raw?.claimed_by_teacher_id || raw?.claimedByTeacherId || ''
  ).trim() || null;
  const claimedByTeacherName = String(
    raw?.claimed_by_teacher_name ||
      raw?.claimedByTeacherName ||
      raw?.claimed_by_name ||
      ''
  ).trim() || null;
  const claimedByEmail = String(
    raw?.claimed_by_email ||
      raw?.claimedByTeacherEmail ||
      raw?.claimed_by_teacher_email ||
      ''
  ).trim() || null;

  const hasAccepted =
    Boolean(raw?.accepted_answer_id || raw?.hasAcceptedAnswer) ||
    answers.some((a) => a.is_accepted);
  const createdAt = String(raw?.created_at || raw?.createdAt || new Date().toISOString());

  return {
    id: qId,
    course_id: courseId,
    course_title: String(raw?.course_title || raw?.courseTitle || '').trim() || undefined,
    unit_id: unitId,
    lesson_num: lessonNum,
    lesson_number: lessonNum,
    lesson_title_snapshot: lessonTitleSnapshot,
    student_id: String(raw?.student_id || raw?.studentId || 'HS-KTN'),
    student_email: studentEmail || undefined,
    student_name: studentName,
    class_code: (raw?.class_code || raw?.classCode || null) as string | null,
    title: String(raw?.title || ''),
    content: String(raw?.content || ''),
    video_timestamp_seconds: videoTimestampSeconds,
    video_timestamp_label:
      (raw?.video_timestamp_label as string | null) ||
      formatTimestampBadge(videoTimestampSeconds),
    attachments,
    status: (raw?.status as KtnForumQuestion['status']) || 'open',
    claimed_by_email: claimedByEmail,
    claimed_by_name: claimedByTeacherName,
    claimed_by_teacher_id: claimedByTeacherId,
    claimed_by_teacher_name: claimedByTeacherName,
    claimed_at: (raw?.claimed_at || raw?.claimedAt || null) as string | null,
    accepted_answer_id:
      (raw?.accepted_answer_id as string | null) ||
      answers.find((a) => a.is_accepted)?.id ||
      (hasAccepted ? 'accepted' : null),
    answer_count: answerCount,
    answers_count: answerCount,
    answersCount: answerCount,
    answers,
    isFollowing: Boolean(raw?.isFollowing ?? raw?.is_following),
    followCount: Number(raw?.followCount ?? raw?.follow_count ?? (raw?.isFollowing ? 1 : 0)) || 0,
    isOwnQuestion: Boolean(raw?.isOwnQuestion ?? raw?.is_own_question),
    created_at: createdAt,
    updated_at: String(raw?.updated_at || raw?.updatedAt || createdAt),
  };
}

export const TeacherForumInbox: React.FC = () => {
  const { lang, tr } = useI18n();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const deepLinkedQuestionId = searchParams.get('questionId');
  const [statusFilter, setStatusFilter] = useState<string>(() =>
    deepLinkedQuestionId ? 'all' : 'unanswered'
  );
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  // Active question being answered inline
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(() =>
    deepLinkedQuestionId || null
  );
  const [answerContent, setAnswerContent] = useState<string>('');
  const [answerVideoUrl, setAnswerVideoUrl] = useState<string>('');
  const [answerVideoSize, setAnswerVideoSize] = useState<number | null>(null);
  const [answerAttachments, setAnswerAttachments] = useState<KtnForumAttachment[]>([]);
  const [isUploadingVideo, setIsUploadingVideo] = useState<boolean>(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);
  const [localQuestionPatches, setLocalQuestionPatches] = useState<
    Record<string, Partial<KtnForumQuestion>>
  >({});
  const answerRequestRef = useRef<{ signature: string; clientRequestId: string } | null>(
    null
  );

  useEffect(() => {
    const qId = searchParams.get('questionId');
    if (qId) {
      setStatusFilter('all');
      setActiveQuestionId(qId);
    }
  }, [searchParams]);

  const coursesQuery = useQuery<KtnCourse[]>({
    queryKey: ['ktn-courses-catalog', isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_COURSES;
      return ktnApi.getCourses();
    },
  });

  const coursesMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of coursesQuery.data || DEMO_COURSES) {
      map.set(c.id, c.title);
    }
    return map;
  }, [coursesQuery.data]);

  const forumQuery = useQuery({
    queryKey: [
      'ktn-teacher-forum-inbox',
      statusFilter,
      courseFilter,
      searchQuery,
      isDemoMode,
      isDemoMode ? lang : 'live',
    ],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          ok: true,
          questions: [
            {
              id: 'demo-fq-1',
              course_id: '6adadba969897b0002482ca5',
              unit_id: '6af5b82169b0ed0002dc2589',
              lesson_num: 1,
              lesson_title_snapshot: tr(
                'Bài 1: Xin chào — 你好',
                'Lesson 1: Hello — 你好'
              ),
              student_id: 'STU-DEMO',
              student_email: 'hoangngan@khongtunhi.com',
              student_name: 'Bé Nguyễn Hoàng Ngân',
              title: tr(
                'Thầy cô cho em hỏi quy tắc biến điệu hai thanh 3 ạ',
                'Could you explain the double 3rd-tone sandhi rule?'
              ),
              content: tr(
                'Ở đoạn 02:15 trong video Bài 1, khi đọc 你好 (nǐ hǎo) thì chữ nǐ đổi thành ní phải không ạ?',
                'At 02:15 in Lesson 1 video, when pronouncing 你好 (nǐ hǎo), does nǐ change to ní?'
              ),
              video_timestamp_seconds: 135,
              attachments: [],
              status: 'open',
              answer_count: 0,
              created_at: new Date(Date.now() - 1800_000).toISOString(),
              updated_at: new Date(Date.now() - 1800_000).toISOString(),
              answers: [],
            },
          ] as KtnForumQuestion[],
          summary: {
            total: 1,
            openCount: 1,
            claimedCount: 0,
            answeredCount: 0,
            resolvedCount: 0,
          },
        };
      }
      return ktnApi.getForumQuestions({
        courseId: courseFilter !== 'ALL' ? courseFilter : undefined,
        status:
          statusFilter === 'unanswered'
            ? 'unanswered'
            : statusFilter !== 'all'
            ? statusFilter
            : undefined,
        search: searchQuery.trim() || undefined,
      });
    },
    staleTime: 10000,
    refetchInterval: isDemoMode ? false : 20000,
    refetchIntervalInBackground: false,
  });

  const leaderboardQuery = useQuery<KtnForumLeaderboardResponse>({
    queryKey: ['ktn-forum-leaderboard', selectedMonth, isDemoMode, isDemoMode ? lang : 'live'],
    queryFn: async (): Promise<KtnForumLeaderboardResponse> => {
      if (isDemoMode) {
        return {
          ok: true,
          month: selectedMonth,
          leaderboard: [
            {
              teacherId: user?.code || 'GV-KTN',
              teacherEmail: user?.email || 'teacher@khongtunhi.com',
              teacherName: user?.name || tr('Giáo viên KTN', 'KTN Teacher'),
              title: tr('Giáo viên', 'Teacher'),
              avatar: null,
              active: true,
              totalPoints: 23,
              monthlyPoints: 23,
              answersCount: 2,
              acceptedAnswersCount: 1,
              helpfulVotesCount: 0,
              videoGuidesCount: 1,
              longPendingResolvedCount: 0,
              recentEvents: [],
            },
          ],
        };
      }
      return ktnApi.getForumLeaderboard(selectedMonth);
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (
      arg: string | { questionId: string; action?: 'claim' | 'unclaim' }
    ) => {
      const questionId = typeof arg === 'string' ? arg : arg.questionId;
      const action = typeof arg === 'string' ? 'claim' : arg.action || 'claim';
      if (isDemoMode) {
        return { ok: true, question: null as unknown as KtnForumQuestion };
      }
      if (action === 'unclaim') {
        return ktnApi.claimForumQuestion(questionId, 'unclaim');
      }
      return ktnApi.claimForumQuestion(questionId);
    },
    onSuccess: (res, arg) => {
      const questionId = typeof arg === 'string' ? arg : arg.questionId;
      const action = typeof arg === 'string' ? 'claim' : arg.action || 'claim';
      if (action === 'unclaim') {
        setLocalQuestionPatches((prev) => ({
          ...prev,
          [questionId]: {
            ...(prev[questionId] || {}),
            status: 'open',
            claimed_by_teacher_id: null,
            claimed_by_teacher_name: null,
            claimed_by_name: null,
            claimed_by_email: null,
            claimed_at: null,
          },
        }));
        queryClient.invalidateQueries({ queryKey: ['ktn-teacher-forum-inbox'] });
        addToast({
          title: tr('Đã nhường lại câu hỏi', 'Question unclaimed'),
          description: tr(
            'Câu hỏi đã mở lại để các giáo viên khác nhận giải đáp.',
            'This question is open again for other teachers to claim.'
          ),
          variant: 'default',
        });
        return;
      }
      const rawClaimed = (res?.question || {}) as unknown as Record<string, unknown>;
      const claimedName = String(
        rawClaimed.claimed_by_teacher_name ||
          rawClaimed.claimedByTeacherName ||
          rawClaimed.claimed_by_name ||
          user?.name ||
          user?.email ||
          tr('Giáo viên KTN', 'KTN Teacher')
      ).trim();
      const claimedId = String(
        rawClaimed.claimed_by_teacher_id ||
          rawClaimed.claimedByTeacherId ||
          user?.code ||
          user?.id ||
          'GV-KTN'
      ).trim();
      const claimedEmail = String(
        rawClaimed.claimed_by_email ||
          rawClaimed.claimedByTeacherEmail ||
          user?.email ||
          ''
      ).trim();
      setLocalQuestionPatches((prev) => ({
        ...prev,
        [questionId]: {
          ...(prev[questionId] || {}),
          status: 'claimed',
          claimed_by_teacher_id: claimedId,
          claimed_by_teacher_name: claimedName,
          claimed_by_name: claimedName,
          claimed_by_email: claimedEmail || null,
          claimed_at: String(
            rawClaimed.claimed_at || rawClaimed.claimedAt || new Date().toISOString()
          ),
        },
      }));
      queryClient.invalidateQueries({ queryKey: ['ktn-teacher-forum-inbox'] });
      setActiveQuestionId(questionId);
      addToast({
        title: tr('Đã nhận xử lý câu hỏi', 'Question claimed'),
        description: tr(
          'Bạn có thể gửi câu trả lời hoặc đính kèm video hướng dẫn cho học viên.',
          'You can now reply or attach a guide video for the student.'
        ),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Không thể nhận câu hỏi', 'Unable to claim question'),
        description: err.message,
        variant: 'error',
      });
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (question: KtnForumQuestion) => {
      const cleanText = answerContent.trim();
      const cleanVideo = answerVideoUrl.trim();
      if (!cleanText && !cleanVideo && answerAttachments.length === 0) {
        throw new Error(
          tr(
            'Vui lòng nhập nội dung câu trả lời hoặc đính kèm tệp/video hướng dẫn học viên.',
            'Please enter an answer or attach a guide file/video for the student.'
          )
        );
      }
      const effectiveContent =
        cleanText ||
        (cleanVideo
          ? tr(
              'Cô gửi video hướng dẫn chi tiết cho câu hỏi của em nhé.',
              'Here is a detailed guide video for your question.'
            )
          : tr(
              'Cô gửi tệp minh họa hướng dẫn bài học cho em nhé.',
              'Here is an illustrative file for your lesson question.'
            ));

      const sig = `${question.id}|${effectiveContent}|${cleanVideo}|${answerAttachments.length}`;
      if (!answerRequestRef.current || answerRequestRef.current.signature !== sig) {
        answerRequestRef.current = {
          signature: sig,
          clientRequestId: `tfa_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
        };
      }
      const clientRequestId = answerRequestRef.current.clientRequestId;

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: true,
          answer: {
            id: `ans-${Date.now()}`,
            question_id: question.id,
            author_name: user?.name || tr('Giáo viên KTN', 'KTN Teacher'),
            author_email: user?.email || 'teacher@khongtunhi.com',
            author_role: 'teacher',
            teacher_name: user?.name || tr('Giáo viên KTN', 'KTN Teacher'),
            content: effectiveContent,
            video_url: cleanVideo || null,
            attachments: answerAttachments,
            is_accepted: false,
            helpful_count: 0,
            created_at: new Date().toISOString(),
          } as KtnForumAnswer,
          question: null as unknown as KtnForumQuestion,
          awardedEvents: [
            {
              event_id: 'ev-demo',
              teacher_id: user?.code || 'GV',
              teacher_email: user?.email || 'teacher@khongtunhi.com',
              event_type: 'answer_created',
              points_delta: cleanVideo ? 10 : 5,
              created_at: new Date().toISOString(),
            },
          ],
          pointsAwarded: cleanVideo ? 10 : 5,
        };
      }
      const payload = {
        questionId: question.id,
        content: effectiveContent,
        videoUrl: cleanVideo || null,
        videoFileSize: answerVideoSize || null,
        videoSizeBytes: answerVideoSize || null,
        attachments: answerAttachments,
        clientRequestId,
      };
      return ktnApi.createForumAnswer(
        payload as Parameters<typeof ktnApi.createForumAnswer>[0]
      );
    },
    onSuccess: (res, question) => {
      answerRequestRef.current = null;
      const normalizedFromServer = res?.question
        ? normalizeForumQuestionRecord(
            res.question as unknown as Record<string, unknown>,
            lang
          )
        : null;
      const fallbackNewAns = res?.answer
        ? normalizeForumAnswerRecord(
            res.answer as unknown as Record<string, unknown>,
            question.id,
            lang
          )
        : normalizeForumAnswerRecord(
            {
              id: `ans-${Date.now()}`,
              question_id: question.id,
              author_name: user?.name || tr('Giáo viên KTN', 'KTN Teacher'),
              author_email: user?.email || '',
              author_role: 'teacher',
              content:
                answerContent.trim() ||
                (answerVideoUrl.trim()
                  ? tr(
                      'Cô gửi video hướng dẫn chi tiết cho câu hỏi của em nhé.',
                      'Here is a detailed guide video for your question.'
                    )
                  : tr(
                      'Cô gửi tệp minh họa hướng dẫn bài học cho em nhé.',
                      'Here is an illustrative file for your lesson question.'
                    )),
              video_url: answerVideoUrl.trim() || null,
              attachments: answerAttachments,
              created_at: new Date().toISOString(),
            },
            question.id,
            lang
          );

      setLocalQuestionPatches((prev) => {
        if (normalizedFromServer) {
          return { ...prev, [question.id]: normalizedFromServer };
        }
        const existingAnswers = Array.isArray(question.answers) ? question.answers : [];
        const nextAnswers = [...existingAnswers, fallbackNewAns];
        return {
          ...prev,
          [question.id]: {
            status: 'answered',
            answer_count: nextAnswers.length,
            answersCount: nextAnswers.length,
            answers: nextAnswers,
          },
        };
      });

      queryClient.invalidateQueries({ queryKey: ['ktn-teacher-forum-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-forum-leaderboard'] });
      setActiveQuestionId(null);
      setAnswerContent('');
      setAnswerVideoUrl('');
      setAnswerVideoSize(null);
      setAnswerAttachments([]);
      const pts = Number(res.pointsAwarded || 0);
      addToast({
        title:
          pts > 0
            ? tr(
                `Đã gửi câu trả lời (+${pts} điểm đóng góp!)`,
                `Answer sent (+${pts} pts!)`
              )
            : tr('Đã gửi câu trả lời cho học viên!', 'Answer sent to student!'),
        description: tr(
          'Học viên sẽ nhận được thông báo về phản hồi của bạn. Điểm đóng góp dùng để đánh giá chuyên môn (không tự quy đổi thành lương).',
          'The student will be notified of your reply. Contribution points are for academic evaluation only (not converted to salary).'
        ),
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: tr('Chưa gửi được câu trả lời', 'Failed to send answer'),
        description: err.message,
        variant: 'error',
      });
    },
  });

  const handleUploadVideoFile = async (
    file: File,
    _question: KtnForumQuestion
  ) => {
    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      addToast({
        title: tr('Video vượt quá 100 MB', 'Video exceeds 100 MB'),
        description: tr(
          'Vui lòng chọn video hướng dẫn ngắn (MP4/MOV/WebM) dưới 100 MB.',
          'Please choose a short guide video (MP4/MOV/WebM) under 100 MB.'
        ),
        variant: 'error',
      });
      return;
    }
    setIsUploadingVideo(true);
    setVideoUploadProgress(1);
    try {
      const uploadRes = await ktnApi.uploadFileWithProgress(file, (pct: number) => {
        setVideoUploadProgress(pct);
      });
      setAnswerVideoUrl(uploadRes.fileUrl);
      setAnswerVideoSize(uploadRes.size || file.size);
      addToast({
        title: tr('Tải lên video hướng dẫn thành công!', 'Guide video uploaded!'),
        description: tr(
          'Video đã được lưu trên S3 và đính kèm vào câu trả lời (+5 điểm đóng góp).',
          'Video saved to S3 and attached to your answer (+5 pts).'
        ),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Tải video thất bại', 'Video upload failed'),
        description:
          err instanceof Error
            ? err.message
            : tr('Vui lòng thử lại.', 'Please try again.'),
        variant: 'error',
      });
    } finally {
      setIsUploadingVideo(false);
      setVideoUploadProgress(0);
    }
  };

  const handleUploadExtraAttachment = async (
    file: File,
    _question: KtnForumQuestion
  ) => {
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|webm)$/i.test(file.name);
    const maxBytes = isVideo ? 100 * 1024 * 1024 : 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      addToast({
        title: tr('Tệp đính kèm quá lớn', 'Attachment too large'),
        description: isVideo
          ? tr('Video đính kèm tối đa 100 MB.', 'Video attachments must be under 100 MB.')
          : tr('Ảnh/âm thanh đính kèm tối đa 20 MB.', 'Image/audio attachments must be under 20 MB.'),
        variant: 'error',
      });
      return;
    }
    setIsUploadingAttachment(true);
    try {
      const uploadRes = await ktnApi.uploadFileWithProgress(file);
      const kind = detectAttachmentKind(file.type || uploadRes.fileType, file.name);
      const normalizedAtt = normalizeForumAttachmentRecord(
        {
          id: `att-${Date.now()}`,
          url: uploadRes.fileUrl,
          fileUrl: uploadRes.fileUrl,
          name: file.name,
          title: file.name,
          fileName: file.name,
          type: kind,
          kind,
          fileType: uploadRes.fileType || file.type,
          mediaType: uploadRes.fileType || file.type,
          size: uploadRes.size || file.size,
        },
        answerAttachments.length,
        lang
      );
      setAnswerAttachments((prev) => [...prev, normalizedAtt]);
    } catch (err) {
      addToast({
        title: tr('Không thể tải tệp đính kèm', 'Unable to upload attachment'),
        description:
          err instanceof Error
            ? err.message
            : tr('Vui lòng thử lại.', 'Please try again.'),
        variant: 'error',
      });
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const allNormalizedQuestions = useMemo(() => {
    const rawList = forumQuery.data?.questions || [];
    return rawList.map((raw) => {
      const base = normalizeForumQuestionRecord(
        raw as unknown as Record<string, unknown>,
        lang
      );
      const patch = localQuestionPatches[base.id];
      if (!patch) return base;
      return normalizeForumQuestionRecord(
        {
          ...base,
          ...patch,
        } as unknown as Record<string, unknown>,
        lang
      );
    });
  }, [forumQuery.data?.questions, localQuestionPatches, lang]);

  const questions = useMemo(() => {
    return allNormalizedQuestions.filter((q) => {
      if (courseFilter !== 'ALL' && q.course_id !== courseFilter) {
        return false;
      }
      if (statusFilter === 'unanswered') {
        const ansCount = q.answer_count || q.answers?.length || 0;
        if (ansCount > 0 || q.status === 'answered' || q.status === 'resolved') {
          return false;
        }
      } else if (statusFilter === 'answered') {
        const ansCount = q.answer_count || q.answers?.length || 0;
        if (ansCount === 0 && q.status !== 'answered' && q.status !== 'resolved') {
          return false;
        }
      } else if (statusFilter === 'resolved') {
        if (q.status !== 'resolved' && !q.accepted_answer_id) {
          return false;
        }
      }
      if (searchQuery.trim()) {
        const kw = searchQuery.trim().toLowerCase();
        const hay = `${q.title} ${q.content} ${q.student_name} ${q.lesson_title_snapshot}`.toLowerCase();
        if (!hay.includes(kw)) return false;
      }
      return true;
    });
  }, [allNormalizedQuestions, courseFilter, statusFilter, searchQuery]);

  const summary = useMemo(() => {
    const rawSummary = (forumQuery.data?.summary || {}) as Record<
      string,
      number | undefined
    >;
    const openCount = Number(rawSummary.openCount ?? 0) || 0;
    const claimedCount = Number(rawSummary.claimedCount ?? 0) || 0;
    const rawUnanswered =
      rawSummary.unansweredCount !== undefined
        ? Number(rawSummary.unansweredCount) || 0
        : openCount + claimedCount;

    const computedUnanswered = allNormalizedQuestions.filter(
      (q) =>
        (q.answer_count || q.answers?.length || 0) === 0 &&
        q.status !== 'answered' &&
        q.status !== 'resolved'
    ).length;
    const computedAnswered = allNormalizedQuestions.filter(
      (q) =>
        (q.answer_count || q.answers?.length || 0) > 0 ||
        q.status === 'answered' ||
        q.status === 'resolved'
    ).length;
    const computedResolved = allNormalizedQuestions.filter(
      (q) => q.status === 'resolved' || Boolean(q.accepted_answer_id)
    ).length;

    const hasPatches = Object.keys(localQuestionPatches).length > 0;
    return {
      total: hasPatches
        ? allNormalizedQuestions.length
        : Number(rawSummary.total ?? allNormalizedQuestions.length) || 0,
      unansweredCount: hasPatches
        ? computedUnanswered
        : rawUnanswered || computedUnanswered,
      answeredCount: hasPatches
        ? computedAnswered
        : Number(rawSummary.answeredCount ?? computedAnswered) || 0,
      resolvedCount: hasPatches
        ? computedResolved
        : Number(rawSummary.resolvedCount ?? computedResolved) || 0,
    };
  }, [forumQuery.data?.summary, allNormalizedQuestions, localQuestionPatches]);

  const myLeaderboardEntry = useMemo(() => {
    const rawData = leaderboardQuery.data as any;
    const list: any[] = rawData?.leaderboard || [];
    const emailLower = String(user?.email || '').toLowerCase();
    const codeUpper = String(user?.code || '').toUpperCase();
    const found =
      list.find((item) => {
        const itemEmail = String(item?.teacherEmail || item?.teacher_email || '').toLowerCase();
        const itemId = String(item?.teacherId || item?.teacher_id || '').toUpperCase();
        return (
          (emailLower && itemEmail === emailLower) ||
          (codeUpper && itemId === codeUpper)
        );
      }) || rawData?.myStats || null;

    if (!found) return null;
    return {
      teacherId: String(found.teacherId || found.teacher_id || user?.id || ''),
      teacherEmail: String(found.teacherEmail || found.teacher_email || user?.email || ''),
      teacherName: String(found.teacherName || found.teacher_name || user?.name || ''),
      totalPoints: Number(found.totalPoints ?? found.total_points ?? 0) || 0,
      monthlyPoints:
        found.monthlyPoints !== undefined || found.monthly_points !== undefined
          ? Number(found.monthlyPoints ?? found.monthly_points ?? 0) || 0
          : undefined,
      answersCount: Number(found.answersCount ?? found.answers_count ?? 0) || 0,
      videoGuidesCount:
        Number(
          found.videoGuidesCount ??
            found.video_guides_count ??
            found.videoAnswersCount ??
            found.video_answers_count ??
            0
        ) || 0,
      acceptedAnswersCount:
        Number(found.acceptedAnswersCount ?? found.accepted_answers_count ?? 0) || 0,
    };
  }, [leaderboardQuery.data, user]);

  return (
    <div data-testid="teacher-forum-inbox" className="space-y-4">
      {/* Top Banner: Teacher Contribution Summary & Leaderboard */}
      <div
        data-testid="teacher-forum-leaderboard"
        className="grid grid-cols-1 gap-3.5 lg:grid-cols-12"
      >
        <div className="rounded-xl border border-amber-200 bg-gradient-to-br from-amber-50 via-white to-red-50/40 p-4 shadow-2xs lg:col-span-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                <Sparkles className="h-3 w-3 text-amber-700" />
                {tr('Điểm đóng góp Hỏi đáp bài học', 'Lesson Q&A Points')}
              </span>
              <h2
                data-testid="teacher-forum-my-points"
                className="mt-1.5 font-display text-base font-bold text-stone-900"
              >
                {myLeaderboardEntry
                  ? `${myLeaderboardEntry.monthlyPoints ?? myLeaderboardEntry.totalPoints} ${tr('điểm', 'pts')}`
                  : tr('0 điểm', '0 pts')}{' '}
                <span className="text-xs font-normal text-stone-500">
                  ({tr(`Tháng ${selectedMonth}`, `Month ${selectedMonth}`)})
                </span>
              </h2>
            </div>

            <input
              type="month"
              aria-label={tr('Chọn tháng thống kê', 'Select stats month')}
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-bold text-stone-800"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">
                {tr('Trả lời đầu', 'First Replies')}
              </p>
              <p className="mt-0.5 font-display text-sm font-bold text-stone-900">
                {myLeaderboardEntry?.answersCount || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">
                {tr('Có Video', 'With Video')}
              </p>
              <p className="mt-0.5 font-display text-sm font-bold text-red-800">
                {myLeaderboardEntry?.videoGuidesCount || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">
                {tr('Hiểu bài ✓', 'Understood ✓')}
              </p>
              <p className="mt-0.5 font-display text-sm font-bold text-emerald-700">
                {myLeaderboardEntry?.acceptedAnswersCount || 0}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1 rounded-lg bg-white/80 p-2.5 text-[11px] text-stone-600">
            <p className="font-bold text-stone-800">
              {tr('Quy tắc tính điểm tự động:', 'Auto-scoring rules:')}
            </p>
            <p>
              {tr(
                '• +5đ trả lời câu hỏi chưa có GV trả lời · +3đ nếu phản hồi < 2 giờ',
                '• +5 pts for first teacher reply · +3 pts if replied < 2h'
              )}
            </p>
            <p>
              {tr(
                '• +5đ đính kèm video hướng dẫn · +10đ khi học viên xác nhận Hiểu bài',
                '• +5 pts for guide video · +10 pts when student marks Understood'
              )}
            </p>
            <p
              data-testid="teacher-forum-points-policy-notice"
              className="mt-1 border-t border-amber-200/80 pt-1 font-semibold text-amber-950"
            >
              {tr(
                'Lưu ý: Điểm đóng góp chỉ dùng để đánh giá chuyên môn & xét thưởng định kỳ bởi Quản lý, không tự động quy đổi thành lương.',
                'Note: Points are used for academic evaluation & periodic bonuses by Management only (not converted to salary).'
              )}
            </p>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-7">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-600" />
              <h3 className="font-display text-sm font-bold text-stone-900">
                {tr(
                  `Bảng đóng góp giáo viên tháng ${selectedMonth}`,
                  `Teacher Leaderboard · ${selectedMonth}`
                )}
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-stone-500">
              {tr(
                'Cơ sở xét thưởng chuyên môn (không tự quy đổi lương)',
                'Academic bonus basis (no auto salary conversion)'
              )}
            </span>
          </div>

          {(leaderboardQuery.data?.leaderboard || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-500">
              {tr(
                `Chưa có điểm đóng góp trong tháng ${selectedMonth}. Hãy trả lời câu hỏi đầu tiên!`,
                `No contribution points yet for ${selectedMonth}. Reply to the first question!`
              )}
            </p>
          ) : (
            <div className="mt-2.5 divide-y divide-stone-100">
              {(leaderboardQuery.data?.leaderboard || []).slice(0, 5).map((row, idx) => (
                <div
                  key={row.teacherId || row.teacherEmail || idx}
                  className="flex items-center justify-between gap-2 py-2 text-xs"
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${
                        idx === 0
                          ? 'bg-amber-400 text-stone-950'
                          : idx === 1
                          ? 'bg-stone-300 text-stone-900'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-stone-100 text-stone-600'
                      }`}
                    >
                      {idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-stone-900">
                        {row.teacherName}
                      </p>
                      <p className="truncate text-[11px] text-stone-500">
                        {row.answersCount} {tr('câu trả lời', 'replies')} · {row.videoGuidesCount}{' '}
                        {tr('video', 'videos')} · {row.acceptedAnswersCount}{' '}
                        {tr('giải đáp chuẩn', 'accepted')}
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1 font-display text-xs font-extrabold text-red-900">
                    {row.monthlyPoints ?? row.totalPoints} {tr('điểm', 'pts')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="rounded-xl border border-stone-200 bg-white p-3.5 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                {
                  id: 'unanswered',
                  label: tr(
                    `Chưa trả lời (${summary.unansweredCount})`,
                    `Unanswered (${summary.unansweredCount})`
                  ),
                },
                {
                  id: 'answered',
                  label: tr(
                    `Đã trả lời (${summary.answeredCount})`,
                    `Answered (${summary.answeredCount})`
                  ),
                },
                {
                  id: 'resolved',
                  label: tr(
                    `Đã hiểu bài (${summary.resolvedCount})`,
                    `Resolved (${summary.resolvedCount})`
                  ),
                },
                {
                  id: 'all',
                  label: tr(`Tất cả (${summary.total})`, `All (${summary.total})`),
                },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                data-testid={`teacher-forum-filter-${tab.id}`}
                onClick={() => setStatusFilter(tab.id)}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                  statusFilter === tab.id
                    ? 'bg-red-800 text-white'
                    : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              aria-label={tr('Lọc theo khóa học', 'Filter by course')}
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="min-h-[34px] rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800"
            >
              <option value="ALL">{tr('Tất cả khóa video', 'All video courses')}</option>
              {(coursesQuery.data || DEMO_COURSES).map((c) => (
                <option key={c.id} value={c.id}>
                  {translateCourseTitle(c.title, lang)}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={tr('Tìm câu hỏi, học viên...', 'Search questions, students...')}
                className="min-h-[34px] rounded-xl border border-stone-300 pl-8 pr-3 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
              />
            </div>
          </div>
        </div>

        {/* Questions List */}
        <div className="mt-3 space-y-3">
          {forumQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-stone-500">
              <Loader2 className="h-4 w-4 animate-spin text-red-800" />
              <span>
                {tr('Đang tải danh sách câu hỏi bài học...', 'Loading lesson Q&A list...')}
              </span>
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-6 text-center">
              <MessageSquare className="mx-auto h-7 w-7 text-stone-400" />
              <p className="mt-2 text-xs font-bold text-stone-800">
                {tr('Không có câu hỏi nào trong mục này', 'No questions in this filter')}
              </p>
              <p className="mt-0.5 text-[11px] text-stone-500">
                {tr(
                  'Khi học viên đặt câu hỏi tại từng bài giảng video, câu hỏi sẽ xuất hiện tại đây.',
                  'When students ask questions on video lessons, they will appear here.'
                )}
              </p>
            </div>
          ) : (
            questions.map((q) => {
              const isAnswering = activeQuestionId === q.id;
              const tsBadge = formatTimestampBadge(q.video_timestamp_seconds);
              const safeCourseId = String(q.course_id || '');
              const rawCourseTitle =
                coursesMap.get(safeCourseId) ||
                q.course_title ||
                (safeCourseId
                  ? tr(`Khóa ${safeCourseId.slice(0, 8)}`, `Course ${safeCourseId.slice(0, 8)}`)
                  : tr('Khóa học KTN', 'KTN Course'));
              const courseTitle = translateCourseTitle(rawCourseTitle, lang);

              return (
                <div
                  key={q.id}
                  data-testid={`teacher-forum-question-${q.id}`}
                  className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span
                          data-testid={`teacher-forum-course-badge-${q.id}`}
                          className="rounded bg-red-800 px-2 py-0.5 text-[10px] font-bold text-white"
                        >
                          {courseTitle}
                        </span>
                        <span
                          data-testid={`teacher-forum-lesson-badge-${q.id}`}
                          className="rounded bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-800"
                        >
                          {q.lesson_title_snapshot ||
                            tr(`Bài ${q.lesson_num || 1}`, `Lesson ${q.lesson_num || 1}`)}
                        </span>
                        {tsBadge && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            <PlayCircle className="h-3 w-3" />
                            {tr('Đoạn', 'At')} {tsBadge}
                          </span>
                        )}
                        {q.status === 'resolved' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                            <CheckCircle2 className="h-3 w-3" />
                            {tr('Đã hiểu bài', 'Resolved')}
                          </span>
                        ) : q.status === 'answered' ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                            {tr('Đã trả lời', 'Answered')} ({q.answer_count || q.answers?.length || 1})
                          </span>
                        ) : q.status === 'claimed' ? (
                          <span
                            data-testid={`teacher-forum-claimed-badge-${q.id}`}
                            className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-900"
                          >
                            <UserCheck className="h-3 w-3" />
                            {tr('Đang xử lý:', 'Claimed:')}{' '}
                            {q.claimed_by_teacher_name ||
                              q.claimed_by_teacher_id ||
                              tr('Giáo viên KTN', 'KTN Teacher')}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            <Clock className="h-3 w-3" />
                            {tr('Chờ giải đáp (+5đ)', 'Awaiting reply (+5 pts)')}
                          </span>
                        )}
                      </div>

                      <h4 className="mt-1.5 font-display text-sm font-bold text-stone-900">
                        {q.title}
                      </h4>
                      <p className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-stone-700">
                        {q.content}
                      </p>

                      <p className="mt-1.5 text-[11px] text-stone-500">
                        {tr('Học viên:', 'Student:')}{' '}
                        <strong className="text-stone-800">
                          {q.student_name || q.student_email}
                        </strong>{' '}
                        · {formatRelativeTime(q.created_at)}
                      </p>

                      {/* Question attachments */}
                      {Array.isArray(q.attachments) && q.attachments.length > 0 && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          {q.attachments.map((att, idx) => {
                            const mediaUrl = resolveUploadedMediaUrl(att.url);
                            const kind = detectAttachmentKind(
                              att.kind || att.type,
                              mediaUrl
                            );
                            if (kind === 'image') {
                              return (
                                <a
                                  key={att.id || idx}
                                  href={mediaUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block overflow-hidden rounded-lg border border-stone-300 bg-white p-1"
                                >
                                  <img
                                    src={mediaUrl}
                                    alt={att.name || tr('Ảnh đính kèm', 'Attached image')}
                                    className="max-h-32 rounded object-contain"
                                  />
                                </a>
                              );
                            }
                            if (kind === 'audio') {
                              return (
                                <audio
                                  key={att.id || idx}
                                  controls
                                  preload="none"
                                  src={mediaUrl}
                                  className="h-8 max-w-xs"
                                />
                              );
                            }
                            if (kind === 'video') {
                              return (
                                <video
                                  key={att.id || idx}
                                  controls
                                  preload="metadata"
                                  src={mediaUrl}
                                  className="max-h-40 max-w-xs rounded-lg border border-stone-300 bg-black"
                                />
                              );
                            }
                            return (
                              <a
                                key={att.id || idx}
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>{att.name || tr('Tệp đính kèm', 'Attachment')}</span>
                              </a>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() =>
                          navigate(
                            `/learning?courseId=${encodeURIComponent(
                              safeCourseId
                            )}&lesson=${encodeURIComponent(
                              String(q.lesson_num || 1)
                            )}&unitId=${encodeURIComponent(
                              String(q.unit_id || '')
                            )}&tab=forum&questionId=${encodeURIComponent(q.id)}`
                          )
                        }
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>{tr('Mở bài học', 'Open lesson')}</span>
                      </button>

                      {q.status === 'open' && (
                        <button
                          type="button"
                          data-testid={`teacher-claim-question-btn-${q.id}`}
                          disabled={claimMutation.isPending}
                          onClick={() => claimMutation.mutate(q.id)}
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-100"
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          <span>{tr('Nhận trả lời', 'Claim')}</span>
                        </button>
                      )}

                      {q.status === 'claimed' && (
                        <button
                          type="button"
                          data-testid={`teacher-unclaim-question-btn-${q.id}`}
                          disabled={claimMutation.isPending}
                          onClick={() =>
                            claimMutation.mutate({ questionId: q.id, action: 'unclaim' })
                          }
                          className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100"
                        >
                          <X className="h-3.5 w-3.5" />
                          <span>{tr('Nhường lại', 'Unclaim')}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        data-testid={`teacher-open-answer-btn-${q.id}`}
                        onClick={() => {
                          if (isAnswering) {
                            setActiveQuestionId(null);
                          } else {
                            setActiveQuestionId(q.id);
                            setAnswerContent('');
                            setAnswerVideoUrl('');
                            setAnswerVideoSize(null);
                            setAnswerAttachments([]);
                          }
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{isAnswering ? tr('Đóng', 'Close') : tr('Trả lời', 'Reply')}</span>
                      </button>
                    </div>
                  </div>

                  {/* Existing answers */}
                  {Array.isArray(q.answers) && q.answers.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-stone-200/80 pt-2.5">
                      {q.answers.map((ans) => (
                        <div
                          key={ans.id}
                          data-testid={`teacher-forum-answer-item-${ans.id}`}
                          className={`rounded-xl border p-2.5 text-xs ${
                            ans.is_accepted
                              ? 'border-emerald-300 bg-emerald-50/60'
                              : 'border-stone-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-bold text-stone-900">
                              {ans.teacher_name ||
                                ans.author_name ||
                                ans.teacher_email ||
                                tr('Giáo viên KTN', 'KTN Teacher')}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-stone-500">
                              {ans.is_accepted && (
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  {tr('Học viên đã hiểu bài (+10đ)', 'Marked understood (+10 pts)')}
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3" />
                                {ans.helpful_count || 0} {tr('hữu ích', 'helpful')}
                              </span>
                            </div>
                          </div>
                          <p className="mt-1 whitespace-pre-wrap text-stone-700">
                            {ans.content}
                          </p>
                          {ans.video_url && (
                            <video
                              controls
                              preload="metadata"
                              data-testid={`teacher-forum-answer-video-${ans.id}`}
                              src={resolveUploadedMediaUrl(ans.video_url)}
                              className="mt-2 max-h-56 w-full max-w-md rounded-lg border border-stone-300 bg-black"
                            />
                          )}
                          {Array.isArray(ans.attachments) && ans.attachments.length > 0 && (
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              {ans.attachments.map((att, idx) => {
                                const mediaUrl = resolveUploadedMediaUrl(att.url);
                                const kind = detectAttachmentKind(
                                  att.kind || att.type,
                                  mediaUrl
                                );
                                if (kind === 'image') {
                                  return (
                                    <a
                                      key={att.id || idx}
                                      href={mediaUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="block overflow-hidden rounded-lg border border-stone-200 bg-stone-50 p-1"
                                    >
                                      <img
                                        src={mediaUrl}
                                        alt={att.name}
                                        className="max-h-32 rounded object-contain"
                                      />
                                    </a>
                                  );
                                }
                                if (kind === 'audio') {
                                  return (
                                    <audio
                                      key={att.id || idx}
                                      controls
                                      preload="none"
                                      src={mediaUrl}
                                      className="h-8 max-w-xs"
                                    />
                                  );
                                }
                                if (kind === 'video') {
                                  return (
                                    <video
                                      key={att.id || idx}
                                      controls
                                      preload="metadata"
                                      src={mediaUrl}
                                      className="max-h-40 max-w-xs rounded-lg border border-stone-300 bg-black"
                                    />
                                  );
                                }
                                return (
                                  <a
                                    key={att.id || idx}
                                    href={mediaUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                                  >
                                    <ExternalLink className="h-3 w-3" />
                                    <span>{att.name}</span>
                                  </a>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Inline Teacher Answer Form with S3 Video Upload */}
                  {isAnswering && (
                    <form
                      data-testid="teacher-forum-answer-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        answerMutation.mutate(q);
                      }}
                      className="mt-3 space-y-3 rounded-xl border border-red-200 bg-white p-3.5 shadow-2xs"
                    >
                      <div>
                        <label className="block text-xs font-bold text-stone-800">
                          {tr(
                            'Nội dung giải đáp cho học viên:',
                            'Answer for the student:'
                          )}
                        </label>
                        <textarea
                          rows={3}
                          data-testid="teacher-forum-answer-textarea"
                          value={answerContent}
                          onChange={(e) => setAnswerContent(e.target.value)}
                          placeholder={tr(
                            'Giải thích chi tiết ngữ pháp, cách phát âm hoặc hướng dẫn làm bài...',
                            'Explain grammar, pronunciation, or step-by-step instructions...'
                          )}
                          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                        />
                      </div>

                      {/* Video Guidance Upload (S3 Presigned PUT <= 100 MB) */}
                      <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-amber-950">
                              {tr(
                                'Đính kèm Video hướng dẫn (+5 điểm đóng góp)',
                                'Attach Guide Video (+5 pts)'
                              )}
                            </p>
                            <p className="text-[11px] text-amber-900/80">
                              {tr(
                                'Hỗ trợ MP4 / MOV / WebM tối đa 100 MB (tải thẳng lên S3 có thanh tiến trình).',
                                'Supports MP4 / MOV / WebM up to 100 MB (direct S3 upload with progress bar).'
                              )}
                            </p>
                          </div>

                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900">
                            <Video className="h-3.5 w-3.5" />
                            <span>
                              {isUploadingVideo
                                ? tr(
                                    `Đang tải ${videoUploadProgress}%...`,
                                    `Uploading ${videoUploadProgress}%...`
                                  )
                                : tr('Tải video hướng dẫn', 'Upload guide video')}
                            </span>
                            <input
                              type="file"
                              accept="video/mp4,video/quicktime,video/webm,video/*"
                              data-testid="teacher-forum-video-upload-input"
                              disabled={isUploadingVideo}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadVideoFile(f, q);
                                e.target.value = '';
                              }}
                              className="hidden"
                            />
                          </label>
                        </div>

                        {isUploadingVideo && (
                          <div
                            data-testid="teacher-forum-video-progress"
                            className="mt-2 space-y-1"
                          >
                            <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200">
                              <div
                                className="h-full rounded-full bg-red-800 transition-all duration-200"
                                style={{ width: `${videoUploadProgress}%` }}
                              />
                            </div>
                            <p className="text-[11px] font-bold text-red-900">
                              {tr('Đang tải video lên S3:', 'Uploading video to S3:')}{' '}
                              {videoUploadProgress}%
                            </p>
                          </div>
                        )}

                        {answerVideoUrl && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
                              <span className="truncate font-semibold">
                                ✓ {tr('Đã đính kèm video:', 'Video attached:')} {answerVideoUrl}
                              </span>
                              <button
                                type="button"
                                onClick={() => {
                                  setAnswerVideoUrl('');
                                  setAnswerVideoSize(null);
                                }}
                                className="text-stone-500 hover:text-red-700"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            </div>
                            <video
                              controls
                              preload="metadata"
                              src={resolveUploadedMediaUrl(answerVideoUrl)}
                              className="max-h-48 w-full max-w-sm rounded-lg border border-stone-300 bg-black"
                            />
                          </div>
                        )}
                      </div>

                      {/* Optional Image/Audio/Video Attachment & Submit Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100">
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>
                              {isUploadingAttachment
                                ? tr('Đang tải...', 'Uploading...')
                                : tr(
                                    'Đính kèm ảnh / ghi âm / video',
                                    'Attach image / audio / video'
                                  )}
                            </span>
                            <input
                              type="file"
                              accept="image/*,audio/*,video/*"
                              data-testid="teacher-forum-extra-attachment-input"
                              disabled={isUploadingAttachment}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) handleUploadExtraAttachment(f, q);
                                e.target.value = '';
                              }}
                              className="hidden"
                            />
                          </label>

                          {answerAttachments.map((att) => (
                            <span
                              key={att.id}
                              data-testid={`teacher-forum-staged-attachment-${att.name}`}
                              className="inline-flex items-center gap-1 rounded-lg bg-stone-100 px-2 py-1 text-[11px] font-semibold text-stone-700"
                            >
                              {att.name}
                              <button
                                type="button"
                                onClick={() =>
                                  setAnswerAttachments((prev) =>
                                    prev.filter((x) => x.id !== att.id)
                                  )
                                }
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveQuestionId(null)}
                            className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
                          >
                            {tr('Hủy', 'Cancel')}
                          </button>
                          <button
                            type="submit"
                            data-testid="teacher-submit-forum-answer-btn"
                            disabled={
                              answerMutation.isPending ||
                              isUploadingVideo ||
                              isUploadingAttachment
                            }
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {answerMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Send className="h-3.5 w-3.5" />
                            )}
                            <span>{tr('Gửi câu trả lời', 'Send reply')}</span>
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

