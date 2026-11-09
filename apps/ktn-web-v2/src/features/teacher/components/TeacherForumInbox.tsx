import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Award,
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
import { formatRelativeTime } from '@/lib/utils';
import {
  KtnCourse,
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

export const TeacherForumInbox: React.FC = () => {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [statusFilter, setStatusFilter] = useState<string>('unanswered');
  const [courseFilter, setCourseFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedMonth, setSelectedMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  // Active question being answered inline
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null);
  const [answerContent, setAnswerContent] = useState<string>('');
  const [answerVideoUrl, setAnswerVideoUrl] = useState<string>('');
  const [answerAttachments, setAnswerAttachments] = useState<KtnForumAttachment[]>([]);
  const [isUploadingVideo, setIsUploadingVideo] = useState<boolean>(false);
  const [videoUploadProgress, setVideoUploadProgress] = useState<number>(0);
  const [isUploadingAttachment, setIsUploadingAttachment] = useState<boolean>(false);

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
              lesson_title_snapshot: 'Bài 1: Xin chào — 你好',
              student_id: 'STU-DEMO',
              student_email: 'hoangngan@khongtunhi.com',
              student_name: 'Bé Nguyễn Hoàng Ngân',
              title: 'Thầy cô cho em hỏi quy tắc biến điệu hai thanh 3 ạ',
              content:
                'Ở đoạn 02:15 trong video Bài 1, khi đọc 你好 (nǐ hǎo) thì chữ nǐ đổi thành ní phải không ạ?',
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
            ? 'open'
            : statusFilter !== 'all'
            ? statusFilter
            : undefined,
        search: searchQuery.trim() || undefined,
      });
    },
    refetchInterval: isDemoMode ? false : 8000,
  });

  const leaderboardQuery = useQuery<KtnForumLeaderboardResponse>({
    queryKey: ['ktn-forum-leaderboard', selectedMonth, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return {
          ok: true,
          month: selectedMonth,
          leaderboard: [
            {
              teacherKey: user?.code || user?.email || 'GV-KTN',
              teacherId: user?.code || 'GV-KTN',
              teacherEmail: user?.email || 'teacher@khongtunhi.com',
              teacherName: user?.name || 'Giáo viên KTN',
              totalPoints: 23,
              firstAnswersCount: 2,
              videoAnswersCount: 1,
              acceptedAnswersCount: 1,
              fastReplyBonusCount: 1,
              helpfulVotesPoints: 0,
              manualAdjustmentsPoints: 0,
            },
          ],
          events: [],
        };
      }
      return ktnApi.getForumLeaderboard(selectedMonth);
    },
  });

  const claimMutation = useMutation({
    mutationFn: async (questionId: string) => {
      if (isDemoMode) {
        return { ok: true, question: null as unknown as KtnForumQuestion };
      }
      return ktnApi.claimForumQuestion(questionId);
    },
    onSuccess: (_res, questionId) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-teacher-forum-inbox'] });
      setActiveQuestionId(questionId);
      addToast({
        title: 'Đã nhận xử lý câu hỏi',
        description: 'Bạn có thể gửi câu trả lời hoặc đính kèm video hướng dẫn cho học viên.',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Không thể nhận câu hỏi',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const answerMutation = useMutation({
    mutationFn: async (question: KtnForumQuestion) => {
      if (!answerContent.trim()) {
        throw new Error('Vui lòng nhập nội dung câu trả lời hướng dẫn học viên.');
      }
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 400));
        return {
          ok: true,
          answer: null as unknown as never,
          awardedEvents: [
            {
              event_id: 'ev-demo',
              teacher_id: user?.code || 'GV',
              event_type: 'first_answer' as const,
              points_delta: 5,
            },
          ],
          pointsAwarded: 5,
        };
      }
      return ktnApi.createForumAnswer({
        questionId: question.id,
        content: answerContent.trim(),
        videoUrl: answerVideoUrl.trim() || null,
        attachments: answerAttachments,
      });
    },
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-teacher-forum-inbox'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-forum-leaderboard'] });
      setActiveQuestionId(null);
      setAnswerContent('');
      setAnswerVideoUrl('');
      setAnswerAttachments([]);
      const pts = Number(res.pointsAwarded || 0);
      addToast({
        title:
          pts > 0
            ? `Đã gửi câu trả lời (+${pts} điểm đóng góp!)`
            : 'Đã gửi câu trả lời cho học viên!',
        description: 'Học viên sẽ nhận được thông báo về phản hồi của bạn.',
        variant: 'success',
      });
    },
    onError: (err: Error) => {
      addToast({
        title: 'Chưa gửi được câu trả lời',
        description: err.message,
        variant: 'error',
      });
    },
  });

  const handleUploadVideoFile = async (
    file: File,
    question: KtnForumQuestion
  ) => {
    const maxBytes = 100 * 1024 * 1024;
    if (file.size > maxBytes) {
      addToast({
        title: 'Video vượt quá 100 MB',
        description: 'Vui lòng chọn video hướng dẫn ngắn (MP4/MOV/WebM) dưới 100 MB.',
        variant: 'error',
      });
      return;
    }
    setIsUploadingVideo(true);
    setVideoUploadProgress(1);
    try {
      const uploadedUrl = await ktnApi.uploadFileWithProgress(file, {
        scope: 'forum_answer_video',
        courseId: question.course_id,
        unitId: question.unit_id,
        onProgress: (pct) => setVideoUploadProgress(pct),
      });
      setAnswerVideoUrl(uploadedUrl);
      addToast({
        title: 'Tải lên video hướng dẫn thành công!',
        description: 'Video đã được lưu trên S3 và đính kèm vào câu trả lời (+5 điểm đóng góp).',
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Tải video thất bại',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setIsUploadingVideo(false);
      setVideoUploadProgress(0);
    }
  };

  const handleUploadExtraAttachment = async (
    file: File,
    question: KtnForumQuestion
  ) => {
    const maxBytes = 20 * 1024 * 1024;
    if (file.size > maxBytes) {
      addToast({
        title: 'Tệp đính kèm quá lớn',
        description: 'Ảnh/âm thanh đính kèm tối đa 20 MB.',
        variant: 'error',
      });
      return;
    }
    setIsUploadingAttachment(true);
    try {
      const uploadedUrl = await ktnApi.uploadFileWithProgress(file, {
        scope: 'forum_answer_attachment',
        courseId: question.course_id,
        unitId: question.unit_id,
      });
      const kind: 'image' | 'audio' | 'file' = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';
      setAnswerAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}`,
          url: uploadedUrl,
          name: file.name,
          type: file.type,
          size: file.size,
          kind,
        },
      ]);
    } catch (err) {
      addToast({
        title: 'Không thể tải tệp đính kèm',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setIsUploadingAttachment(false);
    }
  };

  const questions = forumQuery.data?.questions || [];
  const summary = forumQuery.data?.summary || {
    total: questions.length,
    openCount: 0,
    claimedCount: 0,
    answeredCount: 0,
    resolvedCount: 0,
  };

  const myLeaderboardEntry = useMemo(() => {
    const list = leaderboardQuery.data?.leaderboard || [];
    if (!user) return null;
    const emailLower = String(user.email || '').toLowerCase();
    const codeUpper = String(user.code || '').toUpperCase();
    return (
      list.find(
        (item) =>
          (emailLower && String(item.teacherEmail || '').toLowerCase() === emailLower) ||
          (codeUpper && String(item.teacherId || '').toUpperCase() === codeUpper)
      ) || null
    );
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
                Điểm đóng góp Hỏi đáp bài học
              </span>
              <h2 className="mt-1.5 font-display text-base font-bold text-stone-900">
                {myLeaderboardEntry ? `${myLeaderboardEntry.totalPoints} điểm` : '0 điểm'}{' '}
                <span className="text-xs font-normal text-stone-500">
                  (Tháng {selectedMonth})
                </span>
              </h2>
            </div>

            <input
              type="month"
              aria-label="Chọn tháng thống kê"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="rounded-lg border border-stone-300 bg-white px-2 py-1 text-xs font-bold text-stone-800"
            />
          </div>

          <div className="mt-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">Trả lời đầu</p>
              <p className="mt-0.5 font-display text-sm font-bold text-stone-900">
                {myLeaderboardEntry?.firstAnswersCount || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">Có Video</p>
              <p className="mt-0.5 font-display text-sm font-bold text-red-800">
                {myLeaderboardEntry?.videoAnswersCount || 0}
              </p>
            </div>
            <div className="rounded-lg border border-stone-200/80 bg-white/90 p-2">
              <p className="text-[11px] font-semibold text-stone-500">Hiểu bài ✓</p>
              <p className="mt-0.5 font-display text-sm font-bold text-emerald-700">
                {myLeaderboardEntry?.acceptedAnswersCount || 0}
              </p>
            </div>
          </div>

          <div className="mt-3 space-y-1 rounded-lg bg-white/80 p-2.5 text-[11px] text-stone-600">
            <p className="font-bold text-stone-800">Quy tắc tính điểm tự động:</p>
            <p>• +5đ trả lời câu hỏi chưa có GV trả lời · +3đ nếu phản hồi &lt; 2 giờ</p>
            <p>• +5đ đính kèm video hướng dẫn · +10đ khi học viên xác nhận Hiểu bài</p>
          </div>
        </div>

        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-7">
          <div className="flex items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
            <div className="flex items-center gap-1.5">
              <Trophy className="h-4 w-4 text-amber-600" />
              <h3 className="font-display text-sm font-bold text-stone-900">
                Bảng đóng góp giáo viên tháng {selectedMonth}
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-stone-500">
              Cơ sở xét thưởng chuyên môn
            </span>
          </div>

          {(leaderboardQuery.data?.leaderboard || []).length === 0 ? (
            <p className="py-6 text-center text-xs text-stone-500">
              Chưa có điểm đóng góp trong tháng {selectedMonth}. Hãy trả lời câu hỏi đầu tiên!
            </p>
          ) : (
            <div className="mt-2.5 divide-y divide-stone-100">
              {(leaderboardQuery.data?.leaderboard || []).slice(0, 5).map((row, idx) => (
                <div
                  key={row.teacherKey}
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
                        {row.firstAnswersCount} câu trả lời · {row.videoAnswersCount} video ·{' '}
                        {row.acceptedAnswersCount} giải đáp chuẩn
                      </p>
                    </div>
                  </div>
                  <span className="shrink-0 rounded-lg bg-red-50 px-2.5 py-1 font-display text-xs font-extrabold text-red-900">
                    {row.totalPoints} điểm
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
                { id: 'unanswered', label: `Chưa trả lời (${summary.openCount + summary.claimedCount})` },
                { id: 'answered', label: `Đã trả lời (${summary.answeredCount})` },
                { id: 'resolved', label: `Đã hiểu bài (${summary.resolvedCount})` },
                { id: 'all', label: `Tất cả (${summary.total})` },
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
              aria-label="Lọc theo khóa học"
              value={courseFilter}
              onChange={(e) => setCourseFilter(e.target.value)}
              className="min-h-[34px] rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-bold text-stone-800"
            >
              <option value="ALL">Tất cả khóa video</option>
              {(coursesQuery.data || DEMO_COURSES).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.title}
                </option>
              ))}
            </select>

            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-3.5 w-3.5 text-stone-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm câu hỏi, học viên..."
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
              <span>Đang tải danh sách câu hỏi bài học...</span>
            </div>
          ) : questions.length === 0 ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-6 text-center">
              <MessageSquare className="mx-auto h-7 w-7 text-stone-400" />
              <p className="mt-2 text-xs font-bold text-stone-800">
                Không có câu hỏi nào trong mục này
              </p>
              <p className="mt-0.5 text-[11px] text-stone-500">
                Khi học viên đặt câu hỏi tại từng bài giảng video, câu hỏi sẽ xuất hiện tại đây.
              </p>
            </div>
          ) : (
            questions.map((q) => {
              const isAnswering = activeQuestionId === q.id;
              const tsBadge = formatTimestampBadge(q.video_timestamp_seconds);
              const courseTitle =
                coursesMap.get(q.course_id) || `Khóa ${q.course_id.slice(0, 8)}`;

              return (
                <div
                  key={q.id}
                  data-testid={`teacher-forum-question-${q.id}`}
                  className="rounded-xl border border-stone-200 bg-stone-50/60 p-3.5 transition-all"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded bg-red-800 px-2 py-0.5 text-[10px] font-bold text-white">
                          {courseTitle}
                        </span>
                        <span className="rounded bg-stone-200 px-2 py-0.5 text-[10px] font-bold text-stone-800">
                          {q.lesson_title_snapshot || `Bài ${q.lesson_num || 1}`}
                        </span>
                        {tsBadge && (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            <PlayCircle className="h-3 w-3" />
                            Đoạn {tsBadge}
                          </span>
                        )}
                        {q.status === 'resolved' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-900">
                            <CheckCircle2 className="h-3 w-3" />
                            Đã hiểu bài
                          </span>
                        ) : q.status === 'answered' ? (
                          <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-900">
                            Đã trả lời ({q.answer_count || q.answers?.length || 1})
                          </span>
                        ) : q.status === 'claimed' ? (
                          <span className="inline-flex items-center gap-1 rounded bg-purple-100 px-2 py-0.5 text-[10px] font-bold text-purple-900">
                            <UserCheck className="h-3 w-3" />
                            Đang xử lý: {q.claimed_by_teacher_name || q.claimed_by_teacher_id}
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                            <Clock className="h-3 w-3" />
                            Chờ giải đáp (+5đ)
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
                        Học viên:{' '}
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
                            if (att.kind === 'audio') {
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
                            return (
                              <a
                                key={att.id || idx}
                                href={mediaUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                              >
                                <ExternalLink className="h-3 w-3" />
                                <span>{att.name || 'Tệp đính kèm'}</span>
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
                              q.course_id
                            )}&lesson=${encodeURIComponent(
                              String(q.lesson_num || 1)
                            )}&unitId=${encodeURIComponent(
                              q.unit_id
                            )}&tab=forum&questionId=${encodeURIComponent(q.id)}`
                          )
                        }
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl border border-stone-300 bg-white px-2.5 py-1 text-xs font-bold text-stone-700 hover:bg-stone-100"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Mở bài học</span>
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
                          <span>Nhận trả lời</span>
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
                            setAnswerAttachments([]);
                          }
                        }}
                        className="inline-flex min-h-[34px] items-center gap-1 rounded-xl bg-red-800 px-3 py-1 text-xs font-bold text-white hover:bg-red-900"
                      >
                        <MessageSquare className="h-3.5 w-3.5" />
                        <span>{isAnswering ? 'Đóng' : 'Trả lời'}</span>
                      </button>
                    </div>
                  </div>

                  {/* Existing answers */}
                  {Array.isArray(q.answers) && q.answers.length > 0 && (
                    <div className="mt-3 space-y-2 border-t border-stone-200/80 pt-2.5">
                      {q.answers.map((ans) => (
                        <div
                          key={ans.id}
                          className={`rounded-xl border p-2.5 text-xs ${
                            ans.is_accepted
                              ? 'border-emerald-300 bg-emerald-50/60'
                              : 'border-stone-200 bg-white'
                          }`}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-1.5">
                            <span className="font-bold text-stone-900">
                              {ans.teacher_name || ans.teacher_email || 'Giáo viên KTN'}
                            </span>
                            <div className="flex items-center gap-2 text-[11px] text-stone-500">
                              {ans.is_accepted && (
                                <span className="inline-flex items-center gap-1 font-bold text-emerald-800">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Học viên đã hiểu bài (+10đ)
                                </span>
                              )}
                              <span className="inline-flex items-center gap-1">
                                <ThumbsUp className="h-3 w-3" />
                                {ans.helpful_count || 0} hữu ích
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
                              src={resolveUploadedMediaUrl(ans.video_url)}
                              className="mt-2 max-h-56 w-full max-w-md rounded-lg border border-stone-300 bg-black"
                            />
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
                          Nội dung giải đáp cho học viên:
                        </label>
                        <textarea
                          rows={3}
                          data-testid="teacher-forum-answer-textarea"
                          value={answerContent}
                          onChange={(e) => setAnswerContent(e.target.value)}
                          placeholder="Giải thích chi tiết ngữ pháp, cách phát âm hoặc hướng dẫn làm bài..."
                          className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                        />
                      </div>

                      {/* Video Guidance Upload (S3 Presigned PUT <= 100 MB) */}
                      <div className="rounded-xl border border-amber-200/90 bg-amber-50/50 p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <p className="text-xs font-bold text-amber-950">
                              Đính kèm Video hướng dẫn (+5 điểm đóng góp)
                            </p>
                            <p className="text-[11px] text-amber-900/80">
                              Hỗ trợ MP4 / MOV / WebM tối đa 100 MB (tải thẳng lên S3 có thanh tiến trình).
                            </p>
                          </div>

                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900">
                            <Video className="h-3.5 w-3.5" />
                            <span>
                              {isUploadingVideo
                                ? `Đang tải ${videoUploadProgress}%...`
                                : 'Tải video hướng dẫn'}
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
                              Đang tải video lên S3: {videoUploadProgress}%
                            </p>
                          </div>
                        )}

                        {answerVideoUrl && (
                          <div className="mt-2 space-y-1.5">
                            <div className="flex items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs text-emerald-900">
                              <span className="truncate font-semibold">
                                ✓ Đã đính kèm video: {answerVideoUrl}
                              </span>
                              <button
                                type="button"
                                onClick={() => setAnswerVideoUrl('')}
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

                      {/* Optional Image/Audio Attachment & Submit Row */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl border border-stone-300 bg-stone-50 px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100">
                            <Paperclip className="h-3.5 w-3.5" />
                            <span>
                              {isUploadingAttachment ? 'Đang tải...' : 'Đính kèm ảnh / ghi âm'}
                            </span>
                            <input
                              type="file"
                              accept="image/*,audio/*"
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
                            Hủy
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
                            <span>Gửi câu trả lời</span>
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
