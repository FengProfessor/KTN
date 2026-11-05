import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  FileCheck2,
  CalendarPlus,
  MessageSquare,
  Award,
  CheckCircle2,
  RotateCcw,
  Clock,
  Loader2,
  Send,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useAuthStore } from '@/stores/useAuthStore';
import { useUiStore } from '@/stores/useUiStore';
import { DEMO_CLASSES, DEMO_CLASS_SESSIONS, DEMO_HOMEWORKS } from '@/lib/demoData';
import {
  KtnClassItem,
  KtnClassSession,
  KtnHomework,
  KtnStudentRecord,
} from '@/types/ktn.types';
import { formatChatTimestamp } from '@/lib/utils';

export const TeacherWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const { section } = useParams<{ section?: string }>();
  const [searchParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const addToast = useUiStore((s) => s.addToast);

  const [selectedClassId, setSelectedClassId] = useState<string>(
    () => searchParams.get('class') || user?.classCode || ''
  );
  const [activeSubTab, setActiveSubTab] = useState<'grading' | 'sessions' | 'students'>('grading');
  const [gradingFilter, setGradingFilter] = useState<'all' | 'pending' | 'graded'>('all');

  const [activeHomeworkId, setActiveHomeworkId] = useState<string | null>(() =>
    searchParams.get('hwId')
  );
  const [scoreInput, setScoreInput] = useState<string>('9.5');
  const [feedbackInput, setFeedbackInput] = useState<string>('');
  const [gradeStatusInput, setGradeStatusInput] = useState<'graded' | 'revision_requested'>('graded');

  const [sessionNum, setSessionNum] = useState<number>(2);
  const [sessionTitle, setSessionTitle] = useState<string>('Buổi 2: Gia đình của em có mấy người?');
  const [exerciseTitle, setExerciseTitle] = useState<string>(
    'Bài tập thu âm: Giới thiệu gia đình của con (45 giây)'
  );
  const [exercisePrompt, setExercisePrompt] = useState<string>(
    'Con hãy cầm bức ảnh gia đình và giới thiệu bằng tiếng Trung gửi vào mục Bài tập nhé!'
  );

  // Sync sub-tab with route param (:section) or query param (?hwId / ?class)
  useEffect(() => {
    const hwIdParam = searchParams.get('hwId');
    const clsParam = searchParams.get('class');
    if (clsParam) {
      setSelectedClassId(clsParam);
    }
    if (hwIdParam) {
      setActiveSubTab('grading');
      setActiveHomeworkId(hwIdParam);
      return;
    }
    if (section === 'classes') {
      setActiveSubTab('students');
    } else if (section === 'assign') {
      setActiveSubTab('sessions');
    } else if (section === 'grading') {
      setActiveSubTab('grading');
    }
  }, [section, searchParams]);

  // 1. Fetch Classes
  const classesQuery = useQuery<KtnClassItem[]>({
    queryKey: ['ktn-classes', user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASSES;
      return ktnApi.getClasses();
    },
    enabled: Boolean(user) || isDemoMode,
  });

  const classesList = useMemo(() => {
    const raw = isDemoMode ? DEMO_CLASSES : classesQuery.data || [];
    if (isDemoMode || user?.role === 'admin') return raw;
    if (!user?.email) return [];
    return raw.filter(
      (c) =>
        (c.teacher_email &&
          c.teacher_email.toLowerCase() === user.email.toLowerCase()) ||
        (c.teacher_code && user.code && c.teacher_code === user.code)
    );
  }, [isDemoMode, classesQuery.data, user?.email, user?.code, user?.role]);

  useEffect(() => {
    if (!selectedClassId && classesList.length > 0) {
      setSelectedClassId(classesList[0].id);
    }
  }, [selectedClassId, classesList]);

  const effectiveClassId = selectedClassId || classesList[0]?.id || '';

  // 2. Fetch Homeworks for Class
  const homeworksQuery = useQuery<KtnHomework[]>({
    queryKey: ['ktn-homeworks', effectiveClassId, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_HOMEWORKS;
      return ktnApi.getHomeworks(effectiveClassId || undefined);
    },
    enabled: Boolean(user) || isDemoMode,
    refetchInterval: isDemoMode ? false : 3500,
  });

  // 3. Fetch Sessions for Class
  const sessionsQuery = useQuery<KtnClassSession[]>({
    queryKey: ['ktn-class-sessions', effectiveClassId, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) return DEMO_CLASS_SESSIONS;
      if (!effectiveClassId) return [];
      return ktnApi.getClassSessions(effectiveClassId);
    },
    enabled: Boolean(effectiveClassId) && (Boolean(user) || isDemoMode),
  });

  // 4. Fetch Students in Class
  const studentsQuery = useQuery<KtnStudentRecord[]>({
    queryKey: ['ktn-class-students', effectiveClassId, user?.email, isDemoMode],
    queryFn: async () => {
      if (isDemoMode) {
        return [
          {
            code: 'KTN-2026-089',
            email: 'hoangngan@khongtunhi.com',
            name: 'Bé Nguyễn Hoàng Ngân',
            class_code: 'YCT2-04',
            has_live_class: true,
            has_online_courses: true,
            online_courses: [
              {
                id: '6adadba969897b0002482ca5',
                code: 'HSK1-30',
                title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
              },
            ],
            studentCase: 'both',
          },
        ];
      }
      return ktnApi.getStudents(effectiveClassId || undefined);
    },
    enabled: Boolean(user) || isDemoMode,
  });

  // 5. Grade Homework Mutation
  const gradeMutation = useMutation({
    mutationFn: async (params: {
      id: string;
      score: number;
      teacherFeedback: string;
      status: 'graded' | 'revision_requested';
      classCode?: string | null;
    }) => {
      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 400));
        return {
          homework: {
            ...DEMO_HOMEWORKS[0],
            id: params.id,
            score: params.score,
            teacher_feedback: params.teacherFeedback,
            status: params.status,
          },
          syncStatus: 'synced',
        };
      }
      return ktnApi.gradeHomework(params);
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['ktn-homeworks'] });
      queryClient.invalidateQueries({ queryKey: ['ktn-notifications'] });
      setActiveHomeworkId(null);
      addToast({
        title:
          vars.status === 'revision_requested'
            ? 'Đã gửi yêu cầu nộp lại bài'
            : `Đã chấm ${vars.score}/10 điểm!`,
        variant: 'success',
      });
    },
  });

  // 6. Save Class Session Mutation
  const saveSessionMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        classCode: effectiveClassId,
        sessionNum: Number(sessionNum),
        title: sessionTitle,
        exercises: [
          {
            id: `ex_${effectiveClassId}_${sessionNum}_1`,
            num: 1,
            title: exerciseTitle,
            prompt: exercisePrompt,
            type: 'audio',
          },
        ],
      };

      if (isDemoMode) {
        await new Promise((r) => setTimeout(r, 400));
        return payload as unknown as KtnClassSession;
      }
      return ktnApi.saveClassSession(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ktn-class-sessions', effectiveClassId] });
      addToast({
        title: 'Đã giao bài tập cho lớp!',
        variant: 'success',
      });
    },
  });

  const homeworks = homeworksQuery.data || [];
  const filteredHomeworks = useMemo(() => {
    return homeworks.filter((hw) => {
      if (gradingFilter === 'pending') return hw.status === 'pending';
      if (gradingFilter === 'graded') {
        return hw.status === 'graded' || hw.status === 'revision_requested';
      }
      return true;
    });
  }, [homeworks, gradingFilter]);

  const pendingCount = homeworks.filter((h) => h.status === 'pending').length;

  const openGradingForm = (hw: KtnHomework) => {
    setActiveHomeworkId(String(hw.id));
    setScoreInput(hw.score !== null && hw.score !== undefined ? String(hw.score) : '9.5');
    setFeedbackInput(
      hw.teacher_feedback ||
        'Con phát âm to rõ, thanh điệu chuẩn. Tiếp tục phát huy ở bài sau nhé! 🌟'
    );
    setGradeStatusInput(hw.status === 'revision_requested' ? 'revision_requested' : 'graded');
  };

  const sessionsList = sessionsQuery.data || [];
  const studentsList = studentsQuery.data || [];
  const hasApiError =
    !isDemoMode && (classesQuery.isError || homeworksQuery.isError);

  return (
    <div data-testid="teacher-workspace-page" className="space-y-3 sm:space-y-4">
      {/* Compact Class Selector Bar */}
      <div className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 bg-white px-2.5 py-2 shadow-2xs">
        {classesList.length > 0 ? (
          <select
            aria-label="Chọn lớp phụ trách"
            data-testid="teacher-class-select"
            value={effectiveClassId}
            onChange={(e) => setSelectedClassId(e.target.value)}
            className="min-h-[36px] min-w-0 flex-1 rounded-xl border border-stone-300 bg-stone-50 px-2.5 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none sm:max-w-xs"
          >
            {classesList.map((cls) => (
              <option key={cls.id} value={cls.id}>
                {cls.id} · {cls.name}
              </option>
            ))}
          </select>
        ) : (
          <span className="text-xs font-semibold text-stone-600">
            Chưa có lớp được phân công
          </span>
        )}

        {effectiveClassId && (
          <button
            type="button"
            onClick={() => navigate(`/chat?room=class:${effectiveClassId}`)}
            className="inline-flex min-h-[36px] shrink-0 items-center gap-1.5 rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white shadow-2xs hover:bg-red-900"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            <span>Nhóm {effectiveClassId}</span>
          </button>
        )}
      </div>

      {hasApiError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-900"
        >
          <div className="flex items-center gap-1.5">
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>Chưa tải được dữ liệu lớp học.</span>
          </div>
          <button
            type="button"
            onClick={() => {
              classesQuery.refetch();
              homeworksQuery.refetch();
            }}
            className="inline-flex min-h-[32px] items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-red-800"
          >
            <RotateCcw className="h-3 w-3" />
            Thử lại
          </button>
        </div>
      )}

      {/* Compact Sub-Navigation Tabs */}
      <div className="grid grid-cols-3 gap-1.5 sm:flex sm:flex-wrap sm:items-center">
        <button
          type="button"
          data-testid="teacher-tab-grading"
          onClick={() => setActiveSubTab('grading')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'grading'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <FileCheck2 className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Chấm bài ({homeworks.length})</span>
          {pendingCount > 0 && (
            <span className="rounded-full bg-amber-400 px-1.5 py-0.2 text-[10px] font-extrabold text-stone-950">
              {pendingCount}
            </span>
          )}
        </button>

        <button
          type="button"
          data-testid="teacher-tab-sessions"
          onClick={() => setActiveSubTab('sessions')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'sessions'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <CalendarPlus className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Giao bài</span>
        </button>

        <button
          type="button"
          data-testid="teacher-tab-students"
          onClick={() => setActiveSubTab('students')}
          className={`inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold transition-all ${
            activeSubTab === 'students'
              ? 'bg-red-800 text-white shadow-2xs'
              : 'border border-stone-200 bg-white text-stone-700 hover:bg-stone-50'
          }`}
        >
          <Users className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">Học viên ({studentsList.length})</span>
        </button>
      </div>

      {/* SubTab 1: Homework Grading Queue */}
      {activeSubTab === 'grading' && (
        <div className="rounded-xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-200 pb-2.5">
            <h2 className="font-display text-sm font-bold text-stone-900">
              Bài nộp · Lớp {effectiveClassId || 'Tất cả'}
            </h2>

            <div className="flex items-center gap-1 rounded-xl bg-stone-100 p-1">
              {(
                [
                  { id: 'all', label: `Tất cả (${homeworks.length})` },
                  { id: 'pending', label: `Chờ chấm (${pendingCount})` },
                  { id: 'graded', label: 'Đã chấm' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setGradingFilter(f.id)}
                  className={`rounded-lg px-2.5 py-1 text-[11px] font-bold ${
                    gradingFilter === f.id
                      ? 'bg-white text-red-900 shadow-2xs'
                      : 'text-stone-600 hover:text-stone-900'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-3 space-y-2.5">
            {filteredHomeworks.length === 0 ? (
              <p className="py-6 text-center text-xs text-stone-500">
                Chưa có bài nộp trong mục này.
              </p>
            ) : (
              filteredHomeworks.map((hw) => {
                const isEditing = activeHomeworkId === String(hw.id);
                return (
                  <div
                    key={hw.id}
                    data-testid={`teacher-homework-item-${hw.id}`}
                    className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 transition-all"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded bg-red-800 px-1.5 py-0.5 text-[10px] font-bold text-white">
                            {hw.lesson_num > 100
                              ? `Buổi ${Math.floor(hw.lesson_num / 100)} · Bài ${hw.lesson_num % 100}`
                              : `Bài ${hw.lesson_num}`}
                          </span>
                          <span className="truncate font-display text-xs font-bold text-stone-900 sm:text-sm">
                            {hw.student_name || hw.student_email}
                          </span>
                          <span className="text-[11px] text-stone-400">
                            · {formatChatTimestamp(hw.submitted_at)}
                          </span>
                        </div>

                        {hw.student_note && (
                          <p className="mt-1 line-clamp-2 text-xs text-stone-600">
                            {hw.student_note}
                          </p>
                        )}

                        {hw.file_url && (
                          <div className="mt-1.5 flex items-center gap-2">
                            <a
                              href={hw.file_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-red-800 hover:bg-red-50"
                            >
                              <ExternalLink className="h-3 w-3" />
                              <span>Tệp bài làm</span>
                            </a>
                          </div>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5">
                        {hw.status === 'graded' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-100 px-2.5 py-1 text-xs font-bold text-emerald-900">
                            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-700" />
                            {hw.score}/10
                          </span>
                        ) : hw.status === 'revision_requested' ? (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-red-100 px-2.5 py-1 text-xs font-bold text-red-900">
                            <RotateCcw className="h-3 w-3" />
                            Nộp lại
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-900">
                            <Clock className="h-3 w-3" />
                            Chờ chấm
                          </span>
                        )}

                        <button
                          type="button"
                          data-testid={`open-grade-form-btn-${hw.id}`}
                          onClick={() =>
                            isEditing ? setActiveHomeworkId(null) : openGradingForm(hw)
                          }
                          className="min-h-[36px] rounded-xl bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-900"
                        >
                          {isEditing ? 'Đóng' : hw.status === 'graded' ? 'Sửa điểm' : 'Chấm bài'}
                        </button>
                      </div>
                    </div>

                    {/* Inline Grading Form */}
                    {isEditing && (
                      <form
                        data-testid="teacher-grading-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const numericScore = Math.min(
                            10,
                            Math.max(0, Math.round(Number(scoreInput) * 2) / 2)
                          );
                          gradeMutation.mutate({
                            id: String(hw.id),
                            score: numericScore,
                            teacherFeedback: feedbackInput.trim(),
                            status: gradeStatusInput,
                            classCode: hw.class_code || effectiveClassId,
                          });
                        }}
                        className="mt-3 space-y-2.5 rounded-xl border border-red-200 bg-white p-3 shadow-2xs"
                      >
                        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                          <div>
                            <label className="block text-xs font-bold text-stone-800">
                              Điểm (0 – 10):
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              max="10"
                              data-testid="teacher-score-input"
                              value={scoreInput}
                              onChange={(e) => setScoreInput(e.target.value)}
                              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-sm font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                            />
                          </div>

                          <div>
                            <label className="block text-xs font-bold text-stone-800">
                              Đánh giá:
                            </label>
                            <select
                              data-testid="teacher-status-select"
                              value={gradeStatusInput}
                              onChange={(e) =>
                                setGradeStatusInput(
                                  e.target.value as 'graded' | 'revision_requested'
                                )
                              }
                              className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold text-stone-900 focus:border-red-800 focus:outline-none"
                            >
                              <option value="graded">Đạt • Công bố điểm</option>
                              <option value="revision_requested">Cần sửa • Nộp lại</option>
                            </select>
                          </div>
                        </div>

                        <div>
                          <label className="block text-xs font-bold text-stone-800">
                            Nhận xét:
                          </label>
                          <textarea
                            rows={2}
                            data-testid="teacher-feedback-input"
                            value={feedbackInput}
                            onChange={(e) => setFeedbackInput(e.target.value)}
                            className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs text-stone-900 focus:border-red-800 focus:outline-none"
                          />
                        </div>

                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => setActiveHomeworkId(null)}
                            className="min-h-[36px] rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-semibold text-stone-700"
                          >
                            Hủy
                          </button>
                          <button
                            type="submit"
                            data-testid="teacher-submit-grade-btn"
                            disabled={gradeMutation.isPending}
                            className="inline-flex min-h-[36px] items-center gap-1.5 rounded-xl bg-emerald-700 px-3.5 py-1.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
                          >
                            {gradeMutation.isPending ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Award className="h-4 w-4" />
                            )}
                            <span>Lưu điểm</span>
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SubTab 2: Assign Session & Homework */}
      {activeSubTab === 'sessions' && (
        <div className="grid grid-cols-1 gap-3.5 lg:grid-cols-12">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              saveSessionMutation.mutate();
            }}
            className="space-y-3 rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-7"
          >
            <h2 className="font-display text-sm font-bold text-stone-900">
              Giao bài tập buổi học ({effectiveClassId})
            </h2>

            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              <div>
                <label className="block text-xs font-bold text-stone-700">Buổi số:</label>
                <input
                  type="number"
                  min={1}
                  value={sessionNum}
                  onChange={(e) => setSessionNum(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-stone-700">Tiêu đề buổi:</label>
                <input
                  type="text"
                  value={sessionTitle}
                  onChange={(e) => setSessionTitle(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-stone-300 px-3 py-1.5 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50/60 p-3">
              <p className="text-xs font-bold text-amber-950">Bài tập về nhà:</p>
              <input
                type="text"
                value={exerciseTitle}
                onChange={(e) => setExerciseTitle(e.target.value)}
                placeholder="Tiêu đề bài tập..."
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
              />
              <textarea
                rows={2}
                value={exercisePrompt}
                onChange={(e) => setExercisePrompt(e.target.value)}
                placeholder="Hướng dẫn ngắn..."
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs"
              />
            </div>

            <button
              type="submit"
              data-testid="teacher-save-session-btn"
              disabled={saveSessionMutation.isPending}
              className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white hover:bg-red-900"
            >
              <Send className="h-3.5 w-3.5" />
              <span>Giao bài</span>
            </button>
          </form>

          <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs lg:col-span-5">
            <h3 className="font-display text-sm font-bold text-stone-900">
              Buổi học đã lưu ({sessionsList.length})
            </h3>
            <div className="mt-2.5 space-y-2">
              {sessionsList.map((s) => (
                <div
                  key={s.id || s.sessionNum}
                  className="rounded-xl border border-stone-200 bg-stone-50 p-2.5 text-xs"
                >
                  <p className="font-bold text-stone-900">{s.title || s.session_title}</p>
                  <p className="mt-0.5 text-[11px] text-stone-500">
                    {s.exercises?.length || 0} bài tập
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* SubTab 3: Student Roster */}
      {activeSubTab === 'students' && (
        <div className="rounded-xl border border-stone-200 bg-white p-4 shadow-2xs">
          <h2 className="font-display text-sm font-bold text-stone-900">
            Học viên lớp {effectiveClassId} ({studentsList.length})
          </h2>
          <div className="mt-2.5 divide-y divide-stone-100">
            {studentsList.map((st) => (
              <div
                key={st.code || st.email}
                className="flex flex-wrap items-center justify-between gap-2 py-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-bold text-stone-900 sm:text-sm">
                    {st.name}
                  </p>
                  <p className="truncate text-[11px] text-stone-500">{st.email}</p>
                </div>
                <button
                  type="button"
                  onClick={() => navigate(`/chat?room=student:${st.email}`)}
                  className="min-h-[36px] rounded-xl border border-red-200 bg-red-50 px-3 py-1 text-xs font-bold text-red-900 hover:bg-red-100"
                >
                  Nhắn tin
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
