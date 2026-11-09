import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  MessageSquare,
  Search,
  Plus,
  Send,
  ThumbsUp,
  CheckCircle2,
  Clock,
  Video,
  Paperclip,
  Bell,
  BellOff,
  Sparkles,
  UserCheck,
  ShieldAlert,
  Loader2,
  Play,
  X,
  Image as ImageIcon,
  Volume2,
  Award,
} from 'lucide-react';
import { ktnApi, KtnApiError } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { formatRelativeTimeVi } from '@/lib/utils';
import type {
  KtnForumAttachment,
  KtnForumQuestion,
} from '@/types/ktn.types';

export function formatSecondsToTimestamp(sec?: number | null): string {
  if (sec === null || sec === undefined || !Number.isFinite(sec) || sec < 0) {
    return '00:00';
  }
  const total = Math.floor(sec);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function parseTimestampToSeconds(raw: string): number | null {
  const clean = String(raw || '').trim();
  if (!clean) return null;
  if (/^\d+$/.test(clean)) return Math.max(0, Number(clean));
  const parts = clean.split(':').map((p) => Number(p.trim()));
  if (parts.length === 2 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
    return parts[0] * 60 + parts[1];
  }
  if (parts.length === 3 && parts.every((n) => Number.isFinite(n) && n >= 0)) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return null;
}

interface LessonForumPanelProps {
  courseId: string;
  courseTitle: string;
  unitId: string;
  lessonNumber: number;
  lessonTitle: string;
  initialTimestampSeconds?: number | null;
  highlightQuestionId?: string | null;
  onClearInitialTimestamp?: () => void;
  onSeekVideoTimestamp?: (seconds: number) => void;
}

export const LessonForumPanel: React.FC<LessonForumPanelProps> = ({
  courseId,
  courseTitle,
  unitId,
  lessonNumber,
  lessonTitle,
  initialTimestampSeconds,
  highlightQuestionId,
  onClearInitialTimestamp,
  onSeekVideoTimestamp,
}) => {
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const isTeacherOrAdmin = user?.role === 'teacher' || user?.role === 'admin';

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'unanswered' | 'answered'>('all');
  const [showAskForm, setShowAskForm] = useState(false);

  // Ask question form states
  const [questionTitle, setQuestionTitle] = useState('');
  const [questionContent, setQuestionContent] = useState('');
  const [timestampInput, setTimestampInput] = useState<string>('');
  const [questionAttachments, setQuestionAttachments] = useState<KtnForumAttachment[]>([]);
  const [isUploadingQuestionAttachment, setIsUploadingQuestionAttachment] = useState(false);

  // Expanded question & answer composer states
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(
    highlightQuestionId || null
  );
  const [answerContentMap, setAnswerContentMap] = useState<Record<string, string>>({});
  const [answerAttachmentsMap, setAnswerAttachmentsMap] = useState<
    Record<string, KtnForumAttachment[]>
  >({});
  const [answerVideoMap, setAnswerVideoMap] = useState<
    Record<
      string,
      {
        url: string;
        fileName: string;
        fileSize: number;
        previewUrl?: string;
      } | null
    >
  >({});
  const [uploadingVideoProgressMap, setUploadingVideoProgressMap] = useState<
    Record<string, number | null>
  >({});
  const [uploadingAnswerAttachmentFor, setUploadingAnswerAttachmentFor] = useState<
    string | null
  >(null);

  // Auto-open ask form when user clicks "Hỏi về đoạn này" on the video player
  useEffect(() => {
    if (
      initialTimestampSeconds !== null &&
      initialTimestampSeconds !== undefined &&
      Number.isFinite(initialTimestampSeconds) &&
      initialTimestampSeconds >= 0
    ) {
      const formatted = formatSecondsToTimestamp(initialTimestampSeconds);
      setShowAskForm(true);
      setTimestampInput(formatted);
      setQuestionTitle((prev) =>
        prev.trim() ? prev : `Thắc mắc tại đoạn ${formatted} — Bài ${lessonNumber}`
      );
      setQuestionContent((prev) =>
        prev.trim()
          ? prev
          : `Em chưa hiểu rõ nội dung ở đoạn ${formatted} của video bài học. Nhờ thầy cô giải thích giúp em ạ!`
      );
    }
  }, [initialTimestampSeconds, lessonNumber]);

  useEffect(() => {
    if (highlightQuestionId) {
      setExpandedQuestionId(highlightQuestionId);
    }
  }, [highlightQuestionId]);

  const forumQueryKey = ['ktn-lesson-forum', courseId, unitId, statusFilter, searchQuery, isDemoMode];

  const questionsQuery = useQuery({
    queryKey: forumQueryKey,
    queryFn: async () => {
      if (isDemoMode) {
        return {
          ok: true,
          totalCount: 1,
          openCount: 0,
          questions: [
            {
              id: `demo-fq-${unitId}`,
              course_id: courseId,
              course_title: courseTitle,
              unit_id: unitId,
              lesson_number: lessonNumber,
              lesson_title_snapshot: lessonTitle,
              student_id: 'KTN-STU-01',
              student_name: 'Bé Hoàng Ngân',
              title: `Cách phát âm thanh điệu trong Bài ${lessonNumber}`,
              content:
                'Cô ơi, ở đoạn 02:15 khi hai thanh 3 đi liền nhau thì mình biến điệu như thế nào cho tự nhiên ạ?',
              video_timestamp_seconds: 135,
              video_timestamp_label: '02:15',
              attachments: [],
              status: 'answered' as const,
              accepted_answer_id: 'demo-fa-1',
              answersCount: 1,
              isFollowing: true,
              followCount: 2,
              isOwnQuestion: true,
              created_at: new Date(Date.now() - 3600_000).toISOString(),
              answers: [
                {
                  id: 'demo-fa-1',
                  question_id: `demo-fq-${unitId}`,
                  author_name: 'Cô Lâm Linh',
                  author_role: 'teacher',
                  teacher_title: 'Giáo viên',
                  content:
                    'Chào Ngân nhé! Khi hai âm tiết mang thanh 3 đứng liền nhau (ví dụ: 你好 nǐ hǎo), âm tiết thứ nhất sẽ đọc thành thanh 2 (ní hǎo) để câu nói mượt mà hơn nhé.',
                  attachments: [],
                  video_url: null,
                  video_verified: false,
                  is_accepted: true,
                  helpful_count: 3,
                  viewerHasVotedHelpful: false,
                  created_at: new Date(Date.now() - 1800_000).toISOString(),
                },
              ],
            },
          ],
        };
      }
      return ktnApi.getForumQuestions({
        courseId,
        unitId,
        status: statusFilter,
        q: searchQuery.trim() || undefined,
      });
    },
  });

  const questions = questionsQuery.data?.questions || [];

  const handleUploadQuestionAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setIsUploadingQuestionAttachment(true);
    try {
      const uploaded = await ktnApi.uploadChatFile(file, file.name);
      const mediaCategory = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';
      setQuestionAttachments((prev) => [
        ...prev,
        {
          id: `att-${Date.now()}`,
          name: file.name,
          url: uploaded.fileUrl,
          type: mediaCategory,
          size: uploaded.size,
        },
      ]);
      addToast({
        title: 'Đã đính kèm tệp vào câu hỏi',
        description: file.name,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Chưa tải được tệp đính kèm',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setIsUploadingQuestionAttachment(false);
    }
  };

  const createQuestionMutation = useMutation({
    mutationFn: async () => {
      const cleanTitle = questionTitle.trim();
      const cleanContent = questionContent.trim();
      if (cleanTitle.length < 3 || cleanContent.length < 5) {
        throw new Error('Vui lòng nhập tiêu đề ngắn và nội dung câu hỏi chi tiết (tối thiểu 5 ký tự).');
      }
      const parsedSec = parseTimestampToSeconds(timestampInput);
      return ktnApi.createForumQuestion({
        courseId,
        unitId,
        lessonNumber,
        lessonTitle,
        title: cleanTitle,
        content: cleanContent,
        videoTimestampSeconds: parsedSec,
        attachments: questionAttachments,
      });
    },
    onSuccess: (res) => {
      setQuestionTitle('');
      setQuestionContent('');
      setTimestampInput('');
      setQuestionAttachments([]);
      setShowAskForm(false);
      onClearInitialTimestamp?.();
      setExpandedQuestionId(res.question.id);
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
      addToast({
        title: 'Đã gửi câu hỏi thành công!',
        description: 'Tất cả giáo viên đang hoạt động đã nhận được thông báo để hỗ trợ em.',
        variant: 'success',
      });
    },
    onError: (err) => {
      addToast({
        title: 'Không thể gửi câu hỏi',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    },
  });

  const handleUploadAnswerVideo = async (
    questionId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      addToast({
        title: 'Video vượt quá dung lượng cho phép',
        description: 'Vui lòng chọn video hướng dẫn tối đa 100MB (MP4/MOV/WebM).',
        variant: 'error',
      });
      return;
    }

    setUploadingVideoProgressMap((prev) => ({ ...prev, [questionId]: 1 }));
    try {
      const uploaded = await ktnApi.uploadChatFile(file, file.name, (pct) => {
        setUploadingVideoProgressMap((prev) => ({ ...prev, [questionId]: pct }));
      });
      const localPreview =
        typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function'
          ? URL.createObjectURL(file)
          : undefined;
      setAnswerVideoMap((prev) => ({
        ...prev,
        [questionId]: {
          url: uploaded.fileUrl,
          fileName: file.name,
          fileSize: uploaded.size,
          previewUrl: localPreview,
        },
      }));
      addToast({
        title: 'Đã tải lên video hướng dẫn!',
        description: `${file.name} đã sẵn sàng đính kèm (+5 điểm đóng góp khi gửi câu trả lời).`,
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: 'Tải video hướng dẫn thất bại',
        description: err instanceof Error ? err.message : 'Vui lòng kiểm tra mạng và thử lại.',
        variant: 'error',
      });
    } finally {
      setUploadingVideoProgressMap((prev) => ({ ...prev, [questionId]: null }));
    }
  };

  const handleUploadAnswerAttachment = async (
    questionId: string,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setUploadingAnswerAttachmentFor(questionId);
    try {
      const uploaded = await ktnApi.uploadChatFile(file, file.name);
      const mediaCategory = file.type.startsWith('image/')
        ? 'image'
        : file.type.startsWith('audio/')
        ? 'audio'
        : 'file';
      setAnswerAttachmentsMap((prev) => ({
        ...prev,
        [questionId]: [
          ...(prev[questionId] || []),
          {
            id: `ans-att-${Date.now()}`,
            name: file.name,
            url: uploaded.fileUrl,
            type: mediaCategory,
            size: uploaded.size,
          },
        ],
      }));
    } catch (err) {
      addToast({
        title: 'Chưa tải được tệp minh họa',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    } finally {
      setUploadingAnswerAttachmentFor(null);
    }
  };

  const submitAnswerMutation = useMutation({
    mutationFn: async (questionId: string) => {
      const text = (answerContentMap[questionId] || '').trim();
      const vid = answerVideoMap[questionId];
      const atts = answerAttachmentsMap[questionId] || [];
      if (text.length < 2 && !vid && atts.length === 0) {
        throw new Error('Vui lòng nhập nội dung giải đáp hoặc đính kèm video hướng dẫn.');
      }
      return ktnApi.createForumAnswer({
        questionId,
        content: text || (vid ? `Video hướng dẫn chi tiết (${vid.fileName})` : 'Hình ảnh/tệp hướng dẫn'),
        attachments: atts,
        videoUrl: vid?.url || null,
        videoFileSize: vid?.fileSize || null,
      });
    },
    onSuccess: (res, questionId) => {
      setAnswerContentMap((prev) => ({ ...prev, [questionId]: '' }));
      setAnswerAttachmentsMap((prev) => ({ ...prev, [questionId]: [] }));
      setAnswerVideoMap((prev) => ({ ...prev, [questionId]: null }));
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-forum-leaderboard'] });
      addToast({
        title:
          res.pointsAwarded > 0
            ? `Đã gửi giải đáp (+${res.pointsAwarded} điểm đóng góp)!`
            : 'Đã gửi phản hồi thành công!',
        description:
          res.pointsAwarded > 0
            ? 'Học viên đặt câu hỏi và các bạn theo dõi đã nhận được thông báo.'
            : 'Phản hồi đã được hiển thị trong bài học.',
        variant: 'success',
      });
    },
    onError: (err) => {
      addToast({
        title: 'Không thể gửi câu trả lời',
        description: err instanceof KtnApiError ? err.message : (err as Error)?.message || 'Vui lòng thử lại.',
        variant: 'error',
      });
    },
  });

  const claimMutation = useMutation({
    mutationFn: async ({ questionId, action }: { questionId: string; action: 'claim' | 'unclaim' }) =>
      ktnApi.claimForumQuestion(questionId, action),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
    },
  });

  const helpfulMutation = useMutation({
    mutationFn: async ({
      answerId,
      questionId,
      markAccepted,
    }: {
      answerId: string;
      questionId: string;
      markAccepted?: boolean;
    }) => ktnApi.voteForumAnswerHelpful({ answerId, questionId, markAccepted }),
    onSuccess: (res, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-forum-leaderboard'] });
      addToast({
        title: vars.markAccepted
          ? 'Đã đánh dấu "Câu trả lời giúp em hiểu bài" 🎉'
          : res.alreadyVoted
          ? 'Em đã đánh giá hữu ích cho câu trả lời này rồi'
          : 'Đã cảm ơn thầy/cô (+điểm đóng góp)!',
        variant: 'success',
      });
    },
    onError: (err) => {
      addToast({
        title: 'Không thể thực hiện đánh giá',
        description: err instanceof Error ? err.message : 'Vui lòng thử lại.',
        variant: 'error',
      });
    },
  });

  const followMutation = useMutation({
    mutationFn: async ({ questionId, following }: { questionId: string; following: boolean }) =>
      ktnApi.toggleForumFollow({ questionId, following }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
      addToast({
        title: res.isFollowing
          ? 'Đang theo dõi câu hỏi này'
          : 'Đã tắt thông báo cho câu hỏi này',
        description: res.isFollowing
          ? 'Khi giáo viên trả lời, hệ thống sẽ gửi thông báo trực tiếp cho em.'
          : undefined,
        variant: 'info',
      });
    },
  });

  const moderateMutation = useMutation({
    mutationFn: async ({
      targetType,
      targetId,
      action,
    }: {
      targetType: 'question' | 'answer';
      targetId: string;
      action: 'resolve' | 'reopen' | 'hide';
    }) => ktnApi.moderateForumItem({ targetType, targetId, action }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-lesson-forum'] });
      addToast({
        title: 'Đã cập nhật trạng thái câu hỏi',
        variant: 'success',
      });
    },
  });

  return (
    <div data-testid="lesson-forum-panel" className="mt-3 space-y-3.5">
      {/* Header Context Banner */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-amber-200/80 bg-gradient-to-r from-amber-50/90 via-white to-red-50/50 px-3.5 py-2.5">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold text-red-900">
            <MessageSquare className="h-3.5 w-3.5 text-red-800" />
            <span>Diễn đàn hỏi đáp theo bài học</span>
            <span>•</span>
            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] text-red-900">
              Bài {lessonNumber}: {lessonTitle}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-stone-600">
            Đặt câu hỏi đúng nội dung bài này để đội ngũ giáo viên giải đáp kèm lời giải hoặc video hướng dẫn.
          </p>
        </div>

        <button
          type="button"
          data-testid="forum-open-ask-form-btn"
          onClick={() => setShowAskForm((prev) => !prev)}
          className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs transition-colors hover:bg-red-900"
        >
          {showAskForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
          <span>{showAskForm ? 'Đóng khung hỏi' : 'Đặt câu hỏi mới'}</span>
        </button>
      </div>

      {/* Ask Question Form */}
      {showAskForm && (
        <div
          data-testid="forum-ask-question-form"
          className="space-y-3 rounded-2xl border border-red-200 bg-red-50/30 p-3.5 shadow-2xs"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="font-display text-xs font-bold uppercase tracking-wide text-red-950">
              Đặt câu hỏi mới cho Bài {lessonNumber} ({lessonTitle})
            </h4>
            {timestampInput && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900 ring-1 ring-amber-300">
                <Clock className="h-3 w-3" />
                Đoạn video: {timestampInput}
                <button
                  type="button"
                  onClick={() => {
                    setTimestampInput('');
                    onClearInitialTimestamp?.();
                  }}
                  className="ml-1 text-amber-800 hover:text-red-800"
                >
                  ×
                </button>
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label className="mb-1 block text-[11px] font-bold text-stone-700">
                Tiêu đề ngắn gọn *
              </label>
              <input
                type="text"
                data-testid="forum-question-title-input"
                value={questionTitle}
                onChange={(e) => setQuestionTitle(e.target.value)}
                placeholder={`Ví dụ: Thắc mắc cách dùng lượng từ ở Bài ${lessonNumber}...`}
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs text-stone-900 focus:border-red-800 focus:outline-hidden"
              />
            </div>
            <div>
              <label className="mb-1 block text-[11px] font-bold text-stone-700">
                Mốc thời gian video (tùy chọn)
              </label>
              <input
                type="text"
                data-testid="forum-question-timestamp-input"
                value={timestampInput}
                onChange={(e) => setTimestampInput(e.target.value)}
                placeholder="Ví dụ: 03:25"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2 font-mono text-xs text-stone-900 focus:border-red-800 focus:outline-hidden"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-bold text-stone-700">
              Nội dung câu hỏi chi tiết *
            </label>
            <textarea
              rows={3}
              data-testid="forum-question-content-input"
              value={questionContent}
              onChange={(e) => setQuestionContent(e.target.value)}
              placeholder="Mô tả rõ phần từ vựng, ngữ pháp, phát âm hoặc bài tập em chưa hiểu..."
              className="w-full rounded-xl border border-stone-300 bg-white p-3 text-xs text-stone-900 focus:border-red-800 focus:outline-hidden"
            />
          </div>

          {/* Question Attachments Preview */}
          {questionAttachments.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {questionAttachments.map((att, idx) => (
                <div
                  key={att.id || idx}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs font-medium text-stone-700"
                >
                  {att.type === 'image' ? (
                    <ImageIcon className="h-3.5 w-3.5 text-emerald-700" />
                  ) : (
                    <Volume2 className="h-3.5 w-3.5 text-amber-700" />
                  )}
                  <span className="max-w-[180px] truncate">{att.name}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setQuestionAttachments((prev) => prev.filter((_, i) => i !== idx))
                    }
                    className="text-stone-400 hover:text-red-700"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex flex-wrap items-center gap-2">
              <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-1.5 text-xs font-bold text-stone-700 hover:bg-stone-50">
                {isUploadingQuestionAttachment ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-red-800" />
                ) : (
                  <Paperclip className="h-3.5 w-3.5 text-red-800" />
                )}
                <span>Đính kèm ảnh chụp / âm thanh phát âm</span>
                <input
                  type="file"
                  accept="image/*,audio/*,.pdf"
                  data-testid="forum-question-attachment-input"
                  onChange={handleUploadQuestionAttachment}
                  disabled={isUploadingQuestionAttachment}
                  className="hidden"
                />
              </label>
            </div>

            <button
              type="button"
              data-testid="forum-submit-question-btn"
              onClick={() => createQuestionMutation.mutate()}
              disabled={createQuestionMutation.isPending || isUploadingQuestionAttachment}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-2xs hover:bg-red-900 disabled:opacity-50"
            >
              {createQuestionMutation.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span>Gửi câu hỏi</span>
            </button>
          </div>
        </div>
      )}

      {/* Search & Status Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-stone-400" />
          <input
            type="text"
            data-testid="forum-search-input"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm câu hỏi trong bài học này..."
            className="w-full rounded-xl border border-stone-200 bg-stone-50 py-2 pr-3 pl-8 text-xs text-stone-900 focus:border-red-800 focus:bg-white focus:outline-hidden"
          />
        </div>

        <div className="flex items-center gap-1">
          {(
            [
              { id: 'all', label: 'Tất cả' },
              { id: 'unanswered', label: 'Chưa có trả lời' },
              { id: 'answered', label: 'Đã giải đáp' },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              data-testid={`forum-filter-${f.id}`}
              onClick={() => setStatusFilter(f.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors ${
                statusFilter === f.id
                  ? 'bg-red-800 text-white'
                  : 'bg-stone-100 text-stone-700 hover:bg-stone-200'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Questions List */}
      {questionsQuery.isLoading ? (
        <div className="flex items-center justify-center rounded-xl border border-stone-200 bg-stone-50 py-8 text-xs text-stone-600">
          <Loader2 className="mr-2 h-4 w-4 animate-spin text-red-800" />
          Đang tải câu hỏi của bài học...
        </div>
      ) : questions.length === 0 ? (
        <div
          data-testid="forum-empty-state"
          className="rounded-2xl border border-dashed border-stone-300 bg-stone-50/70 px-4 py-8 text-center"
        >
          <MessageSquare className="mx-auto h-7 w-7 text-stone-400" />
          <p className="mt-2 text-xs font-bold text-stone-800">
            Chưa có câu hỏi nào cho Bài {lessonNumber} ({lessonTitle})
          </p>
          <p className="mt-1 text-xs text-stone-500">
            Nếu em có chỗ nào chưa hiểu trong video hoặc bài tập, hãy bấm &ldquo;Đặt câu hỏi mới&rdquo; hoặc &ldquo;Hỏi về đoạn này&rdquo; trên thanh video nhé!
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions.map((q: KtnForumQuestion) => {
            const isExpanded = expandedQuestionId === q.id || questions.length <= 3;
            const answers = q.answers || [];
            const hasAccepted = Boolean(
              q.accepted_answer_id || answers.some((a) => a.is_accepted)
            );
            const uploadPct = uploadingVideoProgressMap[q.id];
            const stagedVideo = answerVideoMap[q.id];
            const stagedAttachments = answerAttachmentsMap[q.id] || [];

            return (
              <div
                key={q.id}
                data-testid={`forum-question-card-${q.id}`}
                className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xs"
              >
                {/* Question Header & Body */}
                <div className="p-3.5 sm:p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {hasAccepted || q.status === 'resolved' ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2.5 py-0.5 text-[11px] font-bold text-emerald-800">
                          <CheckCircle2 className="h-3 w-3" />
                          Đã giải đáp rõ ràng
                        </span>
                      ) : answers.length > 0 ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[11px] font-bold text-blue-800">
                          Đã có {answers.length} phản hồi
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-0.5 text-[11px] font-bold text-amber-900">
                          Chờ giáo viên giải đáp
                        </span>
                      )}

                      {q.video_timestamp_seconds !== null &&
                        q.video_timestamp_seconds !== undefined && (
                          <button
                            type="button"
                            data-testid={`forum-seek-timestamp-${q.id}`}
                            onClick={() =>
                              onSeekVideoTimestamp?.(Number(q.video_timestamp_seconds))
                            }
                            className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2.5 py-0.5 font-mono text-[11px] font-bold text-red-900 ring-1 ring-red-200 hover:bg-red-100"
                            title="Bấm để tua video bài giảng tới đúng đoạn này"
                          >
                            <Play className="h-2.5 w-2.5 fill-red-800 text-red-800" />
                            <span>
                              Đoạn{' '}
                              {q.video_timestamp_label ||
                                formatSecondsToTimestamp(q.video_timestamp_seconds)}
                            </span>
                          </button>
                        )}

                      {q.claimed_by_name && q.status === 'open' && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-purple-50 px-2 py-0.5 text-[10.5px] font-semibold text-purple-800">
                          <UserCheck className="h-3 w-3" />
                          {q.claimed_by_name} đang hỗ trợ
                        </span>
                      )}
                    </div>

                    <span className="text-[11px] text-stone-400">
                      {formatRelativeTimeVi(q.created_at)}
                    </span>
                  </div>

                  <h4
                    onClick={() =>
                      setExpandedQuestionId((prev) => (prev === q.id ? null : q.id))
                    }
                    className="mt-2 cursor-pointer font-display text-sm font-bold text-stone-900 hover:text-red-900"
                  >
                    {q.title}
                  </h4>

                  <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-stone-700">
                    {q.content}
                  </p>

                  {/* Question Attachments */}
                  {q.attachments && q.attachments.length > 0 && (
                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {q.attachments.map((att, idx) => (
                        <div key={att.id || idx} className="overflow-hidden rounded-xl border border-stone-200 bg-stone-50 p-2">
                          {att.type === 'image' ? (
                            <a href={att.url} target="_blank" rel="noopener noreferrer">
                              <img
                                src={att.url}
                                alt={att.name}
                                className="max-h-40 rounded-lg object-contain"
                              />
                            </a>
                          ) : att.type === 'audio' ? (
                            <div className="space-y-1">
                              <p className="text-[11px] font-semibold text-stone-700">
                                {att.name}
                              </p>
                              <audio controls preload="none" src={att.url} className="h-8 w-56" />
                            </div>
                          ) : (
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-bold text-red-800 hover:underline"
                            >
                              <Paperclip className="h-3.5 w-3.5" />
                              <span>{att.name}</span>
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Question Footer Metadata & Actions */}
                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-stone-100 pt-2.5 text-[11px] text-stone-500">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-stone-700">
                        Học viên: {q.student_name}
                      </span>
                      {isTeacherOrAdmin && q.student_email && (
                        <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] text-stone-600">
                          {q.student_email}
                        </span>
                      )}
                      {isTeacherOrAdmin && q.class_code && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">
                          Lớp {q.class_code}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        data-testid={`forum-follow-btn-${q.id}`}
                        onClick={() =>
                          followMutation.mutate({
                            questionId: q.id,
                            following: !q.isFollowing,
                          })
                        }
                        className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                          q.isFollowing
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-stone-100 text-stone-600 hover:bg-stone-200'
                        }`}
                      >
                        {q.isFollowing ? (
                          <>
                            <Bell className="h-3 w-3 text-amber-700" />
                            <span>Đang theo dõi ({q.followCount || 1})</span>
                          </>
                        ) : (
                          <>
                            <BellOff className="h-3 w-3" />
                            <span>Theo dõi câu hỏi</span>
                          </>
                        )}
                      </button>

                      {isTeacherOrAdmin && q.status === 'open' && !q.claimed_by_email && (
                        <button
                          type="button"
                          data-testid={`forum-claim-btn-${q.id}`}
                          onClick={() =>
                            claimMutation.mutate({ questionId: q.id, action: 'claim' })
                          }
                          className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-2.5 py-1 text-[11px] font-bold text-purple-900 hover:bg-purple-100"
                        >
                          <UserCheck className="h-3 w-3" />
                          <span>Nhận trả lời câu này</span>
                        </button>
                      )}

                      {isTeacherOrAdmin && (
                        <button
                          type="button"
                          onClick={() =>
                            moderateMutation.mutate({
                              targetType: 'question',
                              targetId: q.id,
                              action: q.status === 'resolved' ? 'reopen' : 'resolve',
                            })
                          }
                          className="inline-flex min-h-[30px] items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-50"
                        >
                          <CheckCircle2 className="h-3 w-3 text-emerald-700" />
                          <span>
                            {q.status === 'resolved' ? 'Mở lại câu hỏi' : 'Đánh dấu đã giải quyết'}
                          </span>
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() =>
                          setExpandedQuestionId((prev) => (prev === q.id ? null : q.id))
                        }
                        className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-red-50 px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-100"
                      >
                        <MessageSquare className="h-3 w-3" />
                        <span>
                          {answers.length > 0
                            ? `${answers.length} câu trả lời`
                            : isTeacherOrAdmin
                            ? 'Trả lời học viên'
                            : 'Xem / Phản hồi'}
                        </span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Answers & Teacher Video/Text Answer Composer */}
                {isExpanded && (
                  <div className="border-t border-stone-200 bg-stone-50/70 p-3.5 sm:p-4">
                    {/* Existing Answers */}
                    {answers.length > 0 && (
                      <div className="mb-3.5 space-y-2.5">
                        {answers.map((ans) => {
                          const isTeacherAnswer =
                            ans.author_role === 'teacher' || ans.author_role === 'admin';
                          return (
                            <div
                              key={ans.id}
                              data-testid={`forum-answer-card-${ans.id}`}
                              className={`rounded-xl border p-3 ${
                                ans.is_accepted
                                  ? 'border-emerald-300 bg-emerald-50/60'
                                  : isTeacherAnswer
                                  ? 'border-amber-200/90 bg-white'
                                  : 'border-stone-200 bg-white'
                              }`}
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="text-xs font-bold text-stone-900">
                                    {ans.author_name}
                                  </span>
                                  {isTeacherAnswer && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-red-800 px-2 py-0.5 text-[10px] font-bold text-white">
                                      <Award className="h-2.5 w-2.5 text-amber-300" />
                                      {ans.teacher_title || 'Giáo viên hướng dẫn'}
                                    </span>
                                  )}
                                  {ans.is_accepted && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-2 py-0.5 text-[10px] font-bold text-white">
                                      <CheckCircle2 className="h-2.5 w-2.5" />
                                      Câu trả lời giúp hiểu bài
                                    </span>
                                  )}
                                  {ans.video_url && (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-900">
                                      <Video className="h-2.5 w-2.5" />
                                      Có video hướng dẫn
                                    </span>
                                  )}
                                </div>
                                <span className="text-[11px] text-stone-400">
                                  {formatRelativeTimeVi(ans.created_at)}
                                </span>
                              </div>

                              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-stone-800">
                                {ans.content}
                              </p>

                              {/* Embedded Teacher Guidance Video */}
                              {ans.video_url && (
                                <div className="mt-2.5 overflow-hidden rounded-xl border border-stone-200 bg-stone-950">
                                  <video
                                    controls
                                    playsInline
                                    preload="metadata"
                                    data-testid={`forum-answer-video-${ans.id}`}
                                    src={ans.video_url}
                                    className="max-h-72 w-full object-contain"
                                  />
                                </div>
                              )}

                              {/* Answer Attachments */}
                              {ans.attachments && ans.attachments.length > 0 && (
                                <div className="mt-2 flex flex-wrap gap-2">
                                  {ans.attachments.map((att, idx) => (
                                    <div
                                      key={att.id || idx}
                                      className="rounded-lg border border-stone-200 bg-stone-50 p-1.5"
                                    >
                                      {att.type === 'image' ? (
                                        <a
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                        >
                                          <img
                                            src={att.url}
                                            alt={att.name}
                                            className="max-h-36 rounded object-contain"
                                          />
                                        </a>
                                      ) : att.type === 'audio' ? (
                                        <audio
                                          controls
                                          preload="none"
                                          src={att.url}
                                          className="h-8 w-56"
                                        />
                                      ) : (
                                        <a
                                          href={att.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="text-xs font-bold text-red-800 hover:underline"
                                        >
                                          {att.name}
                                        </a>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Helpful & Accept Actions */}
                              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2 pt-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <button
                                    type="button"
                                    data-testid={`forum-helpful-btn-${ans.id}`}
                                    onClick={() =>
                                      helpfulMutation.mutate({
                                        answerId: ans.id,
                                        questionId: q.id,
                                      })
                                    }
                                    disabled={helpfulMutation.isPending}
                                    className={`inline-flex min-h-[30px] items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-bold transition-colors ${
                                      ans.viewerHasVotedHelpful
                                        ? 'bg-amber-500 text-stone-950'
                                        : 'border border-stone-200 bg-stone-50 text-stone-700 hover:bg-stone-100'
                                    }`}
                                  >
                                    <ThumbsUp className="h-3 w-3" />
                                    <span>Hữu ích ({ans.helpful_count || 0})</span>
                                  </button>

                                  {(q.isOwnQuestion || user?.role === 'admin') &&
                                    isTeacherAnswer &&
                                    !ans.is_accepted && (
                                      <button
                                        type="button"
                                        data-testid={`forum-accept-answer-btn-${ans.id}`}
                                        onClick={() =>
                                          helpfulMutation.mutate({
                                            answerId: ans.id,
                                            questionId: q.id,
                                            markAccepted: true,
                                          })
                                        }
                                        disabled={helpfulMutation.isPending}
                                        className="inline-flex min-h-[30px] items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800"
                                      >
                                        <Sparkles className="h-3 w-3" />
                                        <span>Câu trả lời giúp em hiểu bài</span>
                                      </button>
                                    )}
                                </div>

                                {isTeacherOrAdmin && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      moderateMutation.mutate({
                                        targetType: 'answer',
                                        targetId: ans.id,
                                        action: 'hide',
                                      })
                                    }
                                    className="inline-flex items-center gap-1 text-[10.5px] text-stone-400 hover:text-red-700"
                                  >
                                    <ShieldAlert className="h-3 w-3" />
                                    <span>Ẩn</span>
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Reply / Teacher Video Answer Composer */}
                    <div className="space-y-2.5 rounded-xl border border-stone-200 bg-white p-3">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="text-[11px] font-bold text-stone-800">
                          {isTeacherOrAdmin
                            ? 'Gửi lời giải / Video hướng dẫn cho học viên (+1 điểm trả lời, +5 điểm video hướng dẫn)'
                            : 'Gửi phản hồi bổ sung cho câu hỏi này'}
                        </span>
                      </div>

                      <textarea
                        rows={2}
                        data-testid={`forum-answer-content-input-${q.id}`}
                        value={answerContentMap[q.id] || ''}
                        onChange={(e) =>
                          setAnswerContentMap((prev) => ({
                            ...prev,
                            [q.id]: e.target.value,
                          }))
                        }
                        placeholder={
                          isTeacherOrAdmin
                            ? 'Nhập lời giải chi tiết cho học viên (tối thiểu 15 ký tự để tính điểm đóng góp)...'
                            : 'Nhập phản hồi của em...'
                        }
                        className="w-full rounded-xl border border-stone-300 bg-stone-50/60 p-2.5 text-xs text-stone-900 focus:border-red-800 focus:bg-white focus:outline-hidden"
                      />

                      {/* Video upload progress bar */}
                      {uploadPct !== null && uploadPct !== undefined && (
                        <div className="space-y-1 rounded-xl border border-amber-200 bg-amber-50 p-2.5">
                          <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                            <span className="inline-flex items-center gap-1.5">
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              Đang tải video hướng dẫn lên đám mây...
                            </span>
                            <span>{uploadPct}%</span>
                          </div>
                          <div className="h-2 w-full overflow-hidden rounded-full bg-amber-200">
                            <div
                              className="h-full bg-red-800 transition-all"
                              style={{ width: `${uploadPct}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Staged Teacher Guidance Video Preview before sending */}
                      {stagedVideo && (
                        <div className="space-y-1.5 rounded-xl border border-emerald-200 bg-emerald-50/50 p-2.5">
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-900">
                              <Video className="h-3.5 w-3.5 text-emerald-700" />
                              Video hướng dẫn đã tải lên: {stagedVideo.fileName} (+5 điểm)
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setAnswerVideoMap((prev) => ({ ...prev, [q.id]: null }))
                              }
                              className="text-xs font-bold text-red-700 hover:underline"
                            >
                              Gỡ video
                            </button>
                          </div>
                          <video
                            controls
                            playsInline
                            preload="metadata"
                            src={stagedVideo.previewUrl || stagedVideo.url}
                            className="max-h-48 w-full rounded-lg bg-black object-contain"
                          />
                        </div>
                      )}

                      {/* Staged Answer Attachments */}
                      {stagedAttachments.length > 0 && (
                        <div className="flex flex-wrap gap-1.5">
                          {stagedAttachments.map((att, idx) => (
                            <span
                              key={att.id || idx}
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2 py-1 text-[11px] font-medium text-stone-700"
                            >
                              <Paperclip className="h-3 w-3 text-red-800" />
                              <span className="max-w-[150px] truncate">{att.name}</span>
                              <button
                                type="button"
                                onClick={() =>
                                  setAnswerAttachmentsMap((prev) => ({
                                    ...prev,
                                    [q.id]: (prev[q.id] || []).filter((_, i) => i !== idx),
                                  }))
                                }
                                className="text-stone-400 hover:text-red-700"
                              >
                                ×
                              </button>
                            </span>
                          ))}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {isTeacherOrAdmin && (
                            <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-2.5 py-1 text-xs font-bold text-amber-950 hover:bg-amber-100">
                              <Video className="h-3.5 w-3.5 text-red-800" />
                              <span>Tải video hướng dẫn (+5đ)</span>
                              <input
                                type="file"
                                accept="video/mp4,video/quicktime,video/webm,video/*"
                                data-testid={`forum-answer-video-input-${q.id}`}
                                onChange={(e) => handleUploadAnswerVideo(q.id, e)}
                                disabled={uploadPct !== null && uploadPct !== undefined}
                                className="hidden"
                              />
                            </label>
                          )}

                          <label className="inline-flex min-h-[34px] cursor-pointer items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100">
                            {uploadingAnswerAttachmentFor === q.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-red-800" />
                            ) : (
                              <Paperclip className="h-3.5 w-3.5 text-stone-600" />
                            )}
                            <span>Ảnh / Âm thanh</span>
                            <input
                              type="file"
                              accept="image/*,audio/*,.pdf"
                              onChange={(e) => handleUploadAnswerAttachment(q.id, e)}
                              disabled={uploadingAnswerAttachmentFor === q.id}
                              className="hidden"
                            />
                          </label>
                        </div>

                        <button
                          type="button"
                          data-testid={`forum-submit-answer-btn-${q.id}`}
                          onClick={() => submitAnswerMutation.mutate(q.id)}
                          disabled={
                            submitAnswerMutation.isPending ||
                            (uploadPct !== null && uploadPct !== undefined)
                          }
                          className="inline-flex min-h-[34px] items-center gap-1.5 rounded-xl bg-red-800 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-red-900 disabled:opacity-50"
                        >
                          {submitAnswerMutation.isPending ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          <span>{isTeacherOrAdmin ? 'Gửi lời giải' : 'Gửi phản hồi'}</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
