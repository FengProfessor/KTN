import React, { useEffect, useState } from 'react';
import {
  Shield,
  Save,
  Plus,
  Trash2,
  BookOpen,
  Users,
  FlaskConical,
  AlertCircle,
  Bot,
  Eye,
  KeyRound,
  RotateCcw,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { isSandboxSimulatorAllowed } from '@/features/admin/components/leadSourceMeta';
import type {
  ConsultationAdvisor,
  ConsultationAdvisorRole,
  ConsultationBotFlow,
  ConsultationExample,
  ConsultationGuidanceConfig,
  CourseDurationPreset,
  KtnCourse,
} from '@/types/ktn.types';
import { detectConsultationExamplePii } from '../utils/consultationHelpers';

interface ConsultationSettingsPanelProps {
  isDemoMode: boolean;
  advisors: ConsultationAdvisor[];
  courses: KtnCourse[];
  onAdvisorsChanged: () => void;
  onSandboxEventTriggered?: () => void;
}

const DEFAULT_GUIDANCE: ConsultationGuidanceConfig = {
  course_ids: [],
  duration_presets: {},
  policy: 'Tư vấn lịch sự, không tự bịa học phí/ưu đãi/link thanh toán ngoài dữ liệu hệ thống.',
  examples: [],
  bot_enabled: true,
  checkout_enabled: true,
};

const DEFAULT_BOT_FLOW: ConsultationBotFlow = {
  welcome_message:
    'Chào anh/chị! Em là Trợ lý tư vấn Học Viện Khổng Tử Nhí (KTN). Gia đình mình đang tìm hiểu lộ trình nào dưới đây ạ?',
  root_buttons: {
    kids: 'Tìm khóa cho bé (4–18 tuổi)',
    adult: 'Tiếng Trung người đi làm',
    trial: 'Học thử & Cách học',
    handoff: 'Chat trực tiếp với tư vấn viên',
  },
  kids_intro:
    'KTN chia lộ trình riêng theo từng độ tuổi của bé (làm quen nghe nói tự nhiên → nhận mặt chữ → thi chứng chỉ YCT/HSK). Bé nhà mình đang ở nhóm tuổi nào ạ?',
  kids_branches: {
    age_4_6: {
      label: 'Bé 4–6 tuổi (Mầm non · Mới bắt đầu)',
      reply:
        'Với bé 4–6 tuổi mới làm quen, KTN thiết kế bài giảng video ngắn vui nhộn qua hình ảnh & trò chơi giúp bé yêu thích tiếng Trung và bật phản xạ nghe nói tự nhiên trên Web/iPad.',
      course_id: '65e7704a9ea90c00080d5195',
    },
    age_7_11: {
      label: 'Bé 7–11 tuổi (Tiểu học)',
      reply:
        'Với các bé 7–11 tuổi, lộ trình kết hợp nghe nói phản xạ, chuẩn phát âm thanh điệu và làm quen nhận mặt chữ Hán vững chắc, có hướng ôn thi chứng chỉ thiếu nhi YCT.',
      course_id: '678d14b960eae20002ddf8fe',
    },
    age_12_15: {
      label: 'Bé 12–18 tuổi (THCS–THPT · HSK/YCT)',
      reply:
        'Ở độ tuổi 12–18, KTN tập trung xây nền tảng ngữ pháp hệ thống, mở rộng vốn từ giao tiếp học thuật và luyện thi chứng chỉ YCT / HSK phục vụ học tập.',
      course_id: '6adadba969897b0002482ca5',
    },
  },
  adult_intro:
    'Khổng Tử Nhí tư vấn trực tiếp ngay trên Web theo đúng mục tiêu công việc của anh/chị (kèm 1:1 linh hoạt buổi tối/cuối tuần hoặc khóa video nền tảng HSK). Anh/chị ưu tiên mục tiêu nào ạ?',
  adult_branches: {
    office: {
      label: 'Giao tiếp công việc / Văn phòng',
      reply:
        'Lộ trình Giao tiếp công việc 1:1 tập trung phản xạ hội thoại thực tế với đồng nghiệp/sếp, từ vựng văn phòng và sắp xếp lịch học linh hoạt buổi tối hoặc cuối tuần.',
    },
    trade: {
      label: 'Đàm phán / Đánh hàng Trung Quốc',
      reply:
        'Lộ trình Đàm phán & Nguồn hàng bám sát mẫu câu hỏi giá, đặt cọc, vận chuyển và trao đổi trực tiếp với xưởng/nhà cung cấp Trung Quốc.',
    },
    hsk: {
      label: 'Thi chứng chỉ HSK (HSK 1–3)',
      reply:
        'Anh/chị có thể học chủ động qua khóa Video New HSK 1 (3.0) kết hợp luyện đề chuẩn cấu trúc mới hoặc kết hợp kèm sửa phát âm trực tiếp cùng giáo viên.',
      course_id: '6adadba969897b0002482ca5',
    },
  },
  trial_intro: 'Tại KTN hiện có 2 hình thức học linh hoạt. Anh/chị muốn xem chi tiết hình thức nào ạ?',
  trial_video: {
    label: 'Khóa Video tự học trên Web / iPad',
    reply:
      'Khóa Video tự học mở được mọi lúc trên điện thoại, iPad và máy tính kèm hệ thống bài tập và Flashcard ôn từ vựng. Anh/chị chọn độ tuổi hoặc bấm nút bên dưới để chọn khóa & tạo mã VietQR ngay ạ.',
  },
  trial_live: {
    label: 'Học thử 1:1 cùng cô (Trực tiếp online)',
    reply:
      'Lớp trực tiếp có giáo viên kèm sửa phát âm, khẩu hình và tương tác 2 chiều theo lịch linh hoạt. Anh/chị bấm nút bên dưới để nối Live Chat với tư vấn viên xếp buổi học thử ngay trên Web ạ.',
  },
};

function mergeBotFlow(raw?: ConsultationBotFlow | null): ConsultationBotFlow {
  if (!raw || typeof raw !== 'object') return DEFAULT_BOT_FLOW;
  return {
    welcome_message: raw.welcome_message || DEFAULT_BOT_FLOW.welcome_message,
    root_buttons: { ...DEFAULT_BOT_FLOW.root_buttons, ...(raw.root_buttons || {}) },
    kids_intro: raw.kids_intro || DEFAULT_BOT_FLOW.kids_intro,
    kids_branches: {
      age_4_6: { ...DEFAULT_BOT_FLOW.kids_branches.age_4_6, ...(raw.kids_branches?.age_4_6 || {}) },
      age_7_11: { ...DEFAULT_BOT_FLOW.kids_branches.age_7_11, ...(raw.kids_branches?.age_7_11 || {}) },
      age_12_15: { ...DEFAULT_BOT_FLOW.kids_branches.age_12_15, ...(raw.kids_branches?.age_12_15 || {}) },
    },
    adult_intro: raw.adult_intro || DEFAULT_BOT_FLOW.adult_intro,
    adult_branches: {
      office: { ...DEFAULT_BOT_FLOW.adult_branches.office, ...(raw.adult_branches?.office || {}) },
      trade: { ...DEFAULT_BOT_FLOW.adult_branches.trade, ...(raw.adult_branches?.trade || {}) },
      hsk: { ...DEFAULT_BOT_FLOW.adult_branches.hsk, ...(raw.adult_branches?.hsk || {}) },
    },
    trial_intro: raw.trial_intro || DEFAULT_BOT_FLOW.trial_intro,
    trial_video: { ...DEFAULT_BOT_FLOW.trial_video, ...(raw.trial_video || {}) },
    trial_live: { ...DEFAULT_BOT_FLOW.trial_live, ...(raw.trial_live || {}) },
  };
}

type PreviewFlowStep =
  | 'ROOT'
  | 'KIDS'
  | 'KIDS_4_6'
  | 'KIDS_7_11'
  | 'KIDS_12_15'
  | 'ADULT'
  | 'ADULT_OFFICE'
  | 'ADULT_TRADE'
  | 'ADULT_HSK'
  | 'TRIAL'
  | 'TRIAL_VIDEO'
  | 'TRIAL_LIVE'
  | 'HANDOFF';

export const ConsultationSettingsPanel: React.FC<ConsultationSettingsPanelProps> = ({
  isDemoMode,
  advisors,
  courses,
  onAdvisorsChanged,
  onSandboxEventTriggered,
}) => {
  const { tr } = useI18n();
  const addToast = useUiStore((s) => s.addToast);

  const [guidance, setGuidance] = useState<ConsultationGuidanceConfig>(DEFAULT_GUIDANCE);
  const [botFlow, setBotFlow] = useState<ConsultationBotFlow>(DEFAULT_BOT_FLOW);
  const [previewStep, setPreviewStep] = useState<PreviewFlowStep>('ROOT');
  const [maxExamples, setMaxExamples] = useState(120);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [savingGuidance, setSavingGuidance] = useState(false);

  const [newAdvEmail, setNewAdvEmail] = useState('');
  const [newAdvName, setNewAdvName] = useState('');
  const [newAdvRole, setNewAdvRole] = useState<ConsultationAdvisorRole>('advisor');
  const [newAdvPassword, setNewAdvPassword] = useState('');
  const [editingPwdEmail, setEditingPwdEmail] = useState<string | null>(null);
  const [editingPwdValue, setEditingPwdValue] = useState('');
  const [savingAdv, setSavingAdv] = useState(false);

  const [zaloSandboxUserId, setZaloSandboxUserId] = useState('zalo-sandbox-001');
  const [zaloSandboxName, setZaloSandboxName] = useState('Phụ huynh Zalo Test');
  const [zaloSandboxBody, setZaloSandboxBody] = useState('Chào KTN, cho mình hỏi khóa học cho bé 7 tuổi');
  const [zaloSandboxTag, setZaloSandboxTag] = useState('zalo_oa');
  const [sendingZaloSandbox, setSendingZaloSandbox] = useState(false);

  useEffect(() => {
    let active = true;
    if (isDemoMode) {
      setGuidance({
        ...DEFAULT_GUIDANCE,
        course_ids: courses.slice(0, 2).map((c) => c.id),
      });
      return;
    }
    void ktnApi
      .getConsultationGuidance()
      .then((res) => {
        if (active && res?.config) {
          setGuidance(res.config);
          if (res.config.bot_flow) {
            setBotFlow(mergeBotFlow(res.config.bot_flow));
          }
        }
      })
      .catch(() => {
        // tolerate missing/unmocked guidance during partial setups
      });
    return () => {
      active = false;
    };
  }, [isDemoMode, courses]);

  const handleLoadResearchDraft = async () => {
    try {
      if (isDemoMode) {
        setGuidance((prev) => ({
          ...prev,
          examples: [
            ...prev.examples,
            {
              question: 'Bé 6 tuổi chưa biết gì nên học khóa nào?',
              answer: 'Bé 6 tuổi mới bắt đầu phù hợp với lộ trình Chinese For Kids làm quen phát âm và từ vựng qua hình ảnh.',
              hints: ['trẻ em', '6 tuổi', 'mới bắt đầu'],
            },
          ].slice(0, maxExamples),
        }));
        return;
      }
      const draft = await ktnApi.getConsultationGuidanceDraft();
      setMaxExamples(draft.maxExamples || 120);
      if (draft.bot_flow) {
        setBotFlow(mergeBotFlow(draft.bot_flow));
      }
      setGuidance((prev) => ({
        ...prev,
        policy: draft.policy || prev.policy,
        examples: (draft.examples || []).slice(0, draft.maxExamples || 120),
      }));
      addToast({
        title: tr(`Đã nạp ${draft.examples?.length || 0} mẫu nghiên cứu`, 'Loaded research draft'),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Không thể nạp bộ mẫu', 'Failed to load draft'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    }
  };

  const handleSaveGuidance = async () => {
    setPiiError(null);
    if (guidance.examples.length > maxExamples) {
      setPiiError(
        tr(
          `Số lượng mẫu vượt quá giới hạn ${maxExamples}.`,
          `Examples exceed limit of ${maxExamples}.`
        )
      );
      return;
    }
    if (guidance.course_ids.length > 10) {
      setPiiError(tr('Tối đa 10 khóa học trong catalog bot.', 'Max 10 catalog courses.'));
      return;
    }

    for (let i = 0; i < guidance.examples.length; i++) {
      const ex = guidance.examples[i];
      const joined = `${ex.question}\n${ex.answer}\n${(ex.hints || []).join(' ')}`;
      const pii = detectConsultationExamplePii(joined);
      if (pii.hasPii) {
        setPiiError(
          tr(
            `Mẫu #${i + 1} chứa thông tin nhạy cảm (${pii.reasons.join(', ')}) — vui lòng xóa email, SĐT hoặc link trước khi lưu.`,
            `Example #${i + 1} contains PII (${pii.reasons.join(', ')}) — remove email, phone, or URL before saving.`
          )
        );
        return;
      }
    }

    const flowTexts = [
      botFlow.welcome_message,
      botFlow.kids_intro,
      botFlow.adult_intro,
      botFlow.trial_intro,
      ...Object.values(botFlow.root_buttons),
      ...Object.values(botFlow.kids_branches).flatMap((b) => [b.label, b.reply]),
      ...Object.values(botFlow.adult_branches).flatMap((b) => [b.label, b.reply]),
      botFlow.trial_video.label,
      botFlow.trial_video.reply,
      botFlow.trial_live.label,
      botFlow.trial_live.reply,
    ].join('\n');
    const flowPii = detectConsultationExamplePii(flowTexts);
    if (flowPii.hasPii) {
      setPiiError(
        tr(
          `Kịch bản Bot chứa thông tin nhạy cảm (${flowPii.reasons.join(', ')}) — vui lòng xóa email, SĐT hoặc link trước khi lưu.`,
          `Bot flow contains PII (${flowPii.reasons.join(', ')}) — remove email, phone, or URL before saving.`
        )
      );
      return;
    }

    setSavingGuidance(true);
    try {
      if (!isDemoMode) {
        const res = await ktnApi.saveConsultationGuidance({
          policy: guidance.policy,
          examples: guidance.examples,
          course_ids: guidance.course_ids,
          duration_presets: guidance.duration_presets,
          bot_enabled: guidance.bot_enabled,
          checkout_enabled: guidance.checkout_enabled,
          bot_flow: botFlow,
        });
        if (res?.config) {
          setGuidance(res.config);
          if (res.config.bot_flow) setBotFlow(mergeBotFlow(res.config.bot_flow));
        }
      }
      addToast({
        title: tr('Đã lưu cấu hình bot & tri thức tư vấn', 'Saved guidance & kill-switches'),
        variant: 'success',
      });
    } catch (err) {
      setPiiError(err instanceof Error ? err.message : tr('Lưu thất bại', 'Save failed'));
    } finally {
      setSavingGuidance(false);
    }
  };

  const handleSaveAdvisor = async (payload: {
    email: string;
    name: string;
    active: boolean;
    role: ConsultationAdvisorRole;
    password?: string;
  }) => {
    setSavingAdv(true);
    try {
      if (!isDemoMode) {
        await ktnApi.saveConsultationAdvisor(payload);
      }
      onAdvisorsChanged();
      addToast({
        title: tr(`Đã cập nhật nhân sự ${payload.email}`, `Saved advisor ${payload.email}`),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Lỗi lưu nhân sự', 'Advisor save error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSavingAdv(false);
    }
  };

  const handleTriggerZaloSandbox = async () => {
    setSendingZaloSandbox(true);
    try {
      if (!isDemoMode) {
        await ktnApi.triggerZaloSandboxEvent({
          event_name: 'user_send_text',
          zalo_user_id: zaloSandboxUserId.trim(),
          customer_name: zaloSandboxName.trim(),
          body: zaloSandboxBody.trim(),
          source_tag: zaloSandboxTag.trim() || 'zalo_oa',
        });
      }
      onSandboxEventTriggered?.();
      addToast({
        title: tr('Đã gửi sự kiện Zalo OA Sandbox', 'Zalo OA Sandbox event triggered'),
        variant: 'success',
      });
    } catch (err) {
      addToast({
        title: tr('Lỗi giả lập Zalo OA', 'Zalo sandbox error'),
        description: err instanceof Error ? err.message : undefined,
        variant: 'error',
      });
    } finally {
      setSendingZaloSandbox(false);
    }
  };

  const toggleCourseInCatalog = (courseId: string) => {
    setGuidance((prev) => {
      const exists = prev.course_ids.includes(courseId);
      if (exists) {
        return { ...prev, course_ids: prev.course_ids.filter((id) => id !== courseId) };
      }
      if (prev.course_ids.length >= 10) return prev;
      return {
        ...prev,
        course_ids: [...prev.course_ids, courseId],
        duration_presets: {
          ...prev.duration_presets,
          [courseId]: prev.duration_presets[courseId] || '1m',
        },
      };
    });
  };

  return (
    <div data-testid="crm-settings-panel" className="min-w-0 max-w-full space-y-4 overflow-x-hidden text-xs">
      {/* Kill-switches & Guidance */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <Shield className="h-4 w-4 text-red-800" />
            <span>{tr('Điều khiển Bot, Thanh toán & Tri thức 72+ ca', 'Bot Kill-Switches, Catalog & 72+ Examples')}</span>
          </h3>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-testid="crm-load-draft-btn"
              onClick={() => void handleLoadResearchDraft()}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-3 py-1.5 font-bold text-stone-800 hover:bg-stone-100"
            >
              <BookOpen className="h-3.5 w-3.5 text-red-800" />
              <span>{tr('Nạp bộ mẫu nghiên cứu (72+)', 'Load 72+ Draft')}</span>
            </button>
            <button
              type="button"
              data-testid="crm-save-guidance-btn"
              disabled={savingGuidance}
              onClick={() => void handleSaveGuidance()}
              className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-3.5 py-1.5 font-bold text-white hover:bg-red-900 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" />
              <span>{tr('Lưu cấu hình', 'Save Guidance')}</span>
            </button>
          </div>
        </div>

        {piiError && (
          <div
            role="alert"
            data-testid="crm-guidance-pii-error"
            className="mt-3 flex items-center gap-2 rounded-xl border border-red-300 bg-red-50 px-3 py-2 font-semibold text-red-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 text-red-700" />
            <span>{piiError}</span>
          </div>
        )}

        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div>
              <p className="font-bold text-stone-900">{tr('Bật AI Chatbot tự động', 'Enable Auto Chatbot')}</p>
              <p className="text-[11px] text-stone-500">
                {tr('Tắt khi cần tạm dừng bot Web & Zalo OA', 'Pause Web & Zalo OA bot replies')}
              </p>
            </div>
            <input
              type="checkbox"
              data-testid="crm-toggle-bot-enabled"
              checked={guidance.bot_enabled}
              onChange={(e) =>
                setGuidance((prev) => ({ ...prev, bot_enabled: e.target.checked }))
              }
              className="h-4 w-4 accent-red-800"
            />
          </label>

          <label className="flex items-center justify-between rounded-xl border border-stone-200 bg-stone-50 p-3">
            <div>
              <p className="font-bold text-stone-900">{tr('Cho phép tạo đơn VietQR mới', 'Enable New VietQR Orders')}</p>
              <p className="text-[11px] text-stone-500">
                {tr('Tắt chỉ chặn đơn mới, webhook SePay vẫn chạy', 'Blocks new orders; SePay webhook stays active')}
              </p>
            </div>
            <input
              type="checkbox"
              data-testid="crm-toggle-checkout-enabled"
              checked={guidance.checkout_enabled}
              onChange={(e) =>
                setGuidance((prev) => ({ ...prev, checkout_enabled: e.target.checked }))
              }
              className="h-4 w-4 accent-red-800"
            />
          </label>
        </div>

        {/* Policy */}
        <div className="mt-3">
          <label className="block font-bold text-stone-700">
            {tr('Chính sách & Rào chắn hệ thống', 'System Policy & Guardrails')}
          </label>
          <textarea
            rows={3}
            value={guidance.policy}
            onChange={(e) => setGuidance((prev) => ({ ...prev, policy: e.target.value }))}
            className="mt-1 w-full rounded-xl border border-stone-200 p-2.5 text-xs"
          />
        </div>

        {/* Course Catalog & Duration Presets (<= 10) */}
        <div className="mt-3">
          <p className="font-bold text-stone-700">
            {tr('Khóa học được phép tư vấn & tạo đơn', 'Enabled Catalog Courses')} (
            {guidance.course_ids.length}/10)
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {courses.map((c) => {
              const checked = guidance.course_ids.includes(c.id);
              return (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-2 rounded-xl border border-stone-200 px-2.5 py-1.5"
                >
                  <label className="flex min-w-0 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCourseInCatalog(c.id)}
                      className="accent-red-800"
                    />
                    <span className="truncate font-semibold text-stone-800">{c.title}</span>
                  </label>
                  {checked && (
                    <select
                      value={guidance.duration_presets[c.id] || '1m'}
                      onChange={(e) =>
                        setGuidance((prev) => ({
                          ...prev,
                          duration_presets: {
                            ...prev.duration_presets,
                            [c.id]: e.target.value as CourseDurationPreset,
                          },
                        }))
                      }
                      className="rounded border border-stone-200 px-1.5 py-0.5 text-[11px]"
                    >
                      <option value="1w">1w</option>
                      <option value="2w">2w</option>
                      <option value="1m">1m</option>
                      <option value="2m">2m</option>
                      <option value="3m">3m</option>
                      <option value="unlimited">unlimited</option>
                    </select>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Examples (<= 120) */}
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <p className="font-bold text-stone-700">
              {tr('Mẫu Q&A đã ẩn danh (không PII)', 'Anonymized Q&A Examples (No PII)')} (
              {guidance.examples.length}/{maxExamples})
            </p>
            <button
              type="button"
              data-testid="crm-add-example-btn"
              disabled={guidance.examples.length >= maxExamples}
              onClick={() =>
                setGuidance((prev) => ({
                  ...prev,
                  examples: [...prev.examples, { question: '', answer: '', hints: [] }],
                }))
              }
              className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-stone-50 px-2.5 py-1 font-bold text-stone-800 hover:bg-stone-100 disabled:opacity-40"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>{tr('Thêm mẫu', 'Add Example')}</span>
            </button>
          </div>

          <div className="mt-2 max-h-72 space-y-2 overflow-y-auto">
            {guidance.examples.map((ex, idx) => (
              <div
                key={idx}
                className="space-y-1.5 rounded-xl border border-stone-200 bg-stone-50 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-stone-600">#{idx + 1}</span>
                  <button
                    type="button"
                    onClick={() =>
                      setGuidance((prev) => ({
                        ...prev,
                        examples: prev.examples.filter((_, i) => i !== idx),
                      }))
                    }
                    className="text-red-700 hover:text-red-900"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  data-testid={`crm-example-question-${idx}`}
                  value={ex.question}
                  onChange={(e) => {
                    const next = [...guidance.examples];
                    next[idx] = { ...ex, question: e.target.value };
                    setGuidance((prev) => ({ ...prev, examples: next }));
                  }}
                  placeholder={tr('Câu hỏi khách...', 'Customer question...')}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
                />
                <textarea
                  rows={2}
                  data-testid={`crm-example-answer-${idx}`}
                  value={ex.answer}
                  onChange={(e) => {
                    const next = [...guidance.examples];
                    next[idx] = { ...ex, answer: e.target.value };
                    setGuidance((prev) => ({ ...prev, examples: next }));
                  }}
                  placeholder={tr('Câu trả lời mẫu...', 'Sample answer...')}
                  className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
                />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Visual Bot Flow Editor & Live Chat Preview */}
      <section
        data-testid="crm-bot-flow-editor"
        className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs"
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-2.5">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <Bot className="h-4 w-4 text-red-800" />
            <span>
              {tr(
                'Thiết kế Kịch bản Bot (Kiểu Telegram) & Xem thử trực tiếp',
                'Visual Bot Flow Designer & Live Preview'
              )}
            </span>
          </h3>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setBotFlow(DEFAULT_BOT_FLOW);
                setPreviewStep('ROOT');
              }}
              className="inline-flex items-center gap-1 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-100"
            >
              <RotateCcw className="h-3 w-3" />
              <span>{tr('Khôi phục mặc định', 'Reset Default')}</span>
            </button>
            <button
              type="button"
              disabled={savingGuidance}
              onClick={() => void handleSaveGuidance()}
              className="inline-flex items-center gap-1 rounded-xl bg-red-800 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-red-900 disabled:opacity-50"
            >
              <Save className="h-3 w-3" />
              <span>{tr('Lưu kịch bản Bot', 'Save Bot Flow')}</span>
            </button>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-12">
          {/* Left: Editable Flow Fields */}
          <div className="min-w-0 space-y-3 lg:col-span-7">
            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 space-y-2">
              <p className="font-bold text-stone-800">1. {tr('Lời chào mở đầu & 4 nút Menu chính', 'Welcome Message & 4 Root Buttons')}</p>
              <textarea
                rows={2}
                data-testid="crm-botflow-welcome"
                value={botFlow.welcome_message}
                onChange={(e) => setBotFlow((prev) => ({ ...prev, welcome_message: e.target.value }))}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
              />
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {(['kids', 'adult', 'trial', 'handoff'] as const).map((key) => (
                  <div key={key}>
                    <label className="block text-[10px] font-bold uppercase text-stone-500">{key}</label>
                    <input
                      type="text"
                      value={botFlow.root_buttons[key]}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          root_buttons: { ...prev.root_buttons, [key]: e.target.value },
                        }))
                      }
                      className="mt-0.5 w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 space-y-2">
              <p className="font-bold text-stone-800">2. {tr('Nhánh Trẻ em (4–18 tuổi) & Khóa học gợi ý', 'Kids Branches & Linked Courses')}</p>
              <input
                type="text"
                value={botFlow.kids_intro}
                onChange={(e) => setBotFlow((prev) => ({ ...prev, kids_intro: e.target.value }))}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
              />
              {(['age_4_6', 'age_7_11', 'age_12_15'] as const).map((ageKey) => {
                const branch = botFlow.kids_branches[ageKey];
                return (
                  <div key={ageKey} className="space-y-1 rounded-lg border border-stone-200 bg-white p-2">
                    <div className="flex flex-wrap gap-1.5">
                      <input
                        type="text"
                        value={branch.label}
                        onChange={(e) =>
                          setBotFlow((prev) => ({
                            ...prev,
                            kids_branches: {
                              ...prev.kids_branches,
                              [ageKey]: { ...prev.kids_branches[ageKey], label: e.target.value },
                            },
                          }))
                        }
                        className="flex-1 rounded border border-stone-200 px-2 py-1 text-xs font-semibold"
                      />
                      <select
                        value={branch.course_id || ''}
                        onChange={(e) =>
                          setBotFlow((prev) => ({
                            ...prev,
                            kids_branches: {
                              ...prev.kids_branches,
                              [ageKey]: { ...prev.kids_branches[ageKey], course_id: e.target.value || undefined },
                            },
                          }))
                        }
                        className="max-w-[220px] rounded border border-stone-200 px-2 py-1 text-[11px]"
                      >
                        <option value="">{tr('-- Không gắn khóa --', '-- No linked course --')}</option>
                        {courses.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.title}
                          </option>
                        ))}
                      </select>
                    </div>
                    <textarea
                      rows={2}
                      value={branch.reply}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          kids_branches: {
                            ...prev.kids_branches,
                            [ageKey]: { ...prev.kids_branches[ageKey], reply: e.target.value },
                          },
                        }))
                      }
                      className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>

            <div className="rounded-xl border border-stone-200 bg-stone-50/70 p-3 space-y-2">
              <p className="font-bold text-stone-800">3. {tr('Nhánh Người đi làm & Học thử', 'Adult & Trial Branches')}</p>
              <input
                type="text"
                value={botFlow.adult_intro}
                onChange={(e) => setBotFlow((prev) => ({ ...prev, adult_intro: e.target.value }))}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
              />
              {(['office', 'trade', 'hsk'] as const).map((aKey) => {
                const branch = botFlow.adult_branches[aKey];
                return (
                  <div key={aKey} className="space-y-1 rounded-lg border border-stone-200 bg-white p-2">
                    <input
                      type="text"
                      value={branch.label}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          adult_branches: {
                            ...prev.adult_branches,
                            [aKey]: { ...prev.adult_branches[aKey], label: e.target.value },
                          },
                        }))
                      }
                      className="w-full rounded border border-stone-200 px-2 py-1 text-xs font-semibold"
                    />
                    <textarea
                      rows={2}
                      value={branch.reply}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          adult_branches: {
                            ...prev.adult_branches,
                            [aKey]: { ...prev.adult_branches[aKey], reply: e.target.value },
                          },
                        }))
                      }
                      className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                    />
                  </div>
                );
              })}
              <input
                type="text"
                value={botFlow.trial_intro}
                onChange={(e) => setBotFlow((prev) => ({ ...prev, trial_intro: e.target.value }))}
                className="w-full rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
              />
              {(['trial_video', 'trial_live'] as const).map((tKey) => {
                const branch = botFlow[tKey];
                return (
                  <div key={tKey} className="space-y-1 rounded-lg border border-stone-200 bg-white p-2">
                    <input
                      type="text"
                      value={branch.label}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], label: e.target.value },
                        }))
                      }
                      className="w-full rounded border border-stone-200 px-2 py-1 text-xs font-semibold"
                    />
                    <textarea
                      rows={2}
                      value={branch.reply}
                      onChange={(e) =>
                        setBotFlow((prev) => ({
                          ...prev,
                          [tKey]: { ...prev[tKey], reply: e.target.value },
                        }))
                      }
                      className="w-full rounded border border-stone-200 px-2 py-1 text-[11px]"
                    />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right: Interactive Live Chat Preview */}
          <div className="min-w-0 lg:col-span-5">
            <div className="sticky top-4 overflow-hidden rounded-2xl border border-stone-300 bg-[#FAF8F5] shadow-sm">
              <div className="flex items-center justify-between bg-red-800 px-3.5 py-2.5 text-white">
                <span className="flex items-center gap-1.5 text-xs font-bold">
                  <Eye className="h-3.5 w-3.5 text-amber-300" />
                  {tr('Xem thử trải nghiệm khách', 'Interactive Live Preview')}
                </span>
                <button
                  type="button"
                  onClick={() => setPreviewStep('ROOT')}
                  className="rounded bg-white/15 px-2 py-0.5 text-[10px] font-bold hover:bg-white/25"
                >
                  {tr('Về đầu', 'Restart')}
                </button>
              </div>
              <div className="min-h-[300px] space-y-2.5 p-3">
                {(() => {
                  const courseLookup = (cid?: string) => courses.find((c) => c.id === cid);
                  let botBubble = botFlow.welcome_message;
                  let buttons: Array<{ label: string; next: PreviewFlowStep }> = [
                    { label: botFlow.root_buttons.kids, next: 'KIDS' },
                    { label: botFlow.root_buttons.adult, next: 'ADULT' },
                    { label: botFlow.root_buttons.trial, next: 'TRIAL' },
                    { label: botFlow.root_buttons.handoff, next: 'HANDOFF' },
                  ];
                  let linkedCourse: KtnCourse | undefined;
                  if (previewStep === 'KIDS') {
                    botBubble = botFlow.kids_intro;
                    buttons = [
                      { label: botFlow.kids_branches.age_4_6.label, next: 'KIDS_4_6' },
                      { label: botFlow.kids_branches.age_7_11.label, next: 'KIDS_7_11' },
                      { label: botFlow.kids_branches.age_12_15.label, next: 'KIDS_12_15' },
                      { label: '← Menu chính', next: 'ROOT' },
                    ];
                  } else if (previewStep === 'KIDS_4_6' || previewStep === 'KIDS_7_11' || previewStep === 'KIDS_12_15') {
                    const key = previewStep === 'KIDS_4_6' ? 'age_4_6' : previewStep === 'KIDS_7_11' ? 'age_7_11' : 'age_12_15';
                    const b = botFlow.kids_branches[key];
                    botBubble = b.reply;
                    linkedCourse = courseLookup(b.course_id);
                    buttons = [
                      { label: 'Đăng ký & lấy mã VietQR ngay', next: 'ROOT' },
                      { label: 'Chat trực tiếp với tư vấn viên', next: 'HANDOFF' },
                      { label: '← Chọn độ tuổi khác', next: 'KIDS' },
                    ];
                  } else if (previewStep === 'ADULT') {
                    botBubble = botFlow.adult_intro;
                    buttons = [
                      { label: botFlow.adult_branches.office.label, next: 'ADULT_OFFICE' },
                      { label: botFlow.adult_branches.trade.label, next: 'ADULT_TRADE' },
                      { label: botFlow.adult_branches.hsk.label, next: 'ADULT_HSK' },
                      { label: '← Menu chính', next: 'ROOT' },
                    ];
                  } else if (previewStep === 'ADULT_OFFICE' || previewStep === 'ADULT_TRADE' || previewStep === 'ADULT_HSK') {
                    const key = previewStep === 'ADULT_OFFICE' ? 'office' : previewStep === 'ADULT_TRADE' ? 'trade' : 'hsk';
                    const b = botFlow.adult_branches[key];
                    botBubble = b.reply;
                    linkedCourse = courseLookup(b.course_id);
                    buttons = [
                      { label: 'Đăng ký & lấy mã VietQR ngay', next: 'ROOT' },
                      { label: 'Chat trực tiếp với tư vấn viên', next: 'HANDOFF' },
                      { label: '← Chọn mục tiêu khác', next: 'ADULT' },
                    ];
                  } else if (previewStep === 'TRIAL') {
                    botBubble = botFlow.trial_intro;
                    buttons = [
                      { label: botFlow.trial_video.label, next: 'TRIAL_VIDEO' },
                      { label: botFlow.trial_live.label, next: 'TRIAL_LIVE' },
                      { label: '← Menu chính', next: 'ROOT' },
                    ];
                  } else if (previewStep === 'TRIAL_VIDEO' || previewStep === 'TRIAL_LIVE') {
                    const b = previewStep === 'TRIAL_VIDEO' ? botFlow.trial_video : botFlow.trial_live;
                    botBubble = b.reply;
                    buttons = [
                      { label: 'Chat trực tiếp với tư vấn viên', next: 'HANDOFF' },
                      { label: '← Menu chính', next: 'ROOT' },
                    ];
                  } else if (previewStep === 'HANDOFF') {
                    botBubble = 'Em đã chuyển cuộc trò chuyện sang tư vấn viên KTN hỗ trợ trực tiếp trên Web cho anh/chị rồi ạ.';
                    buttons = [{ label: '← Quay lại kịch bản bot', next: 'ROOT' }];
                  }
                  return (
                    <>
                      <div className="rounded-2xl border border-stone-200 bg-white p-3 text-xs text-stone-900 shadow-2xs">
                        <p className="mb-1 text-[10px] font-bold text-red-800">KTN Bot · Telegram Preview</p>
                        <p className="whitespace-pre-wrap leading-relaxed">{botBubble}</p>
                        {linkedCourse && (
                          <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-950">
                            📚 {linkedCourse.title} · {linkedCourse.price.toLocaleString('vi-VN')}đ
                          </div>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {buttons.map((btn) => (
                          <button
                            key={btn.label}
                            type="button"
                            onClick={() => setPreviewStep(btn.next)}
                            className="rounded-full border border-red-200 bg-white px-2.5 py-1 text-[11px] font-bold text-red-900 hover:bg-red-50"
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Advisors Management */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
            <Users className="h-4 w-4 text-red-800" />
            <span>{tr('Phân quyền & Mật khẩu nhân viên tư vấn (ktn_advisors)', 'Multi-Staff Advisors & Web Passwords')}</span>
          </h3>
          <span className="text-[11px] text-stone-500">
            {tr('Tư vấn viên: chỉ xem Hộp thư tư vấn · Quản lý: toàn quyền', 'Advisor: Inbox only · Manager: Full CRM & Admin')}
          </span>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <input
            type="email"
            data-testid="crm-new-advisor-email"
            value={newAdvEmail}
            onChange={(e) => setNewAdvEmail(e.target.value)}
            placeholder="advisor@khongtunhi.com"
            className="min-w-[170px] flex-1 rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
          />
          <input
            type="text"
            data-testid="crm-new-advisor-name"
            value={newAdvName}
            onChange={(e) => setNewAdvName(e.target.value)}
            placeholder={tr('Họ tên nhân viên', 'Advisor name')}
            className="min-w-[140px] flex-1 rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
          />
          <select
            value={newAdvRole}
            onChange={(e) => setNewAdvRole(e.target.value as ConsultationAdvisorRole)}
            className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="advisor">advisor</option>
            <option value="manager">manager</option>
          </select>
          <input
            type="password"
            data-testid="crm-new-advisor-password"
            value={newAdvPassword}
            onChange={(e) => setNewAdvPassword(e.target.value)}
            placeholder={tr(
              newAdvRole === 'manager' ? 'Mật khẩu Web (>=8 ký tự)' : 'Mật khẩu Web (>=6 ký tự)',
              'Web Password'
            )}
            className="min-w-[165px] rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
          />
          <button
            type="button"
            data-testid="crm-add-advisor-btn"
            disabled={!newAdvEmail.trim() || savingAdv}
            onClick={async () => {
              const pwd = newAdvPassword.trim();
              const minLen = newAdvRole === 'manager' ? 8 : 6;
              if (pwd && pwd.length < minLen) {
                addToast({
                  title: tr(`Mật khẩu phải từ ${minLen} ký tự trở lên.`, `Password must be at least ${minLen} chars.`),
                  variant: 'error',
                });
                return;
              }
              await handleSaveAdvisor({
                email: newAdvEmail.trim(),
                name: newAdvName.trim() || newAdvEmail.trim(),
                active: true,
                role: newAdvRole,
                ...(pwd ? { password: pwd } : {}),
              });
              setNewAdvEmail('');
              setNewAdvName('');
              setNewAdvPassword('');
            }}
            className="rounded-xl bg-red-800 px-3 py-1.5 font-bold text-white hover:bg-red-900 disabled:opacity-40"
          >
            {tr('Thêm / Cập nhật', 'Save Advisor')}
          </button>
        </div>

        <div className="mt-3 divide-y divide-stone-100">
          {advisors.map((adv) => (
            <div key={adv.email} className="space-y-2 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-1.5">
                  <p className="font-bold text-stone-900">
                    {adv.name} <span className="font-mono text-stone-500">({adv.email})</span>
                  </p>
                  <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-700">
                    {adv.role || 'advisor'}
                  </span>
                  {adv.has_custom_password && (
                    <span className="rounded bg-sky-100 px-1.5 py-0.5 text-[10px] font-bold text-sky-900">
                      {tr('Đã đặt mật khẩu Web', 'Web Password Set')}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    data-testid={`crm-change-pwd-btn-${adv.email}`}
                    onClick={() => {
                      if (editingPwdEmail === adv.email) {
                        setEditingPwdEmail(null);
                        setEditingPwdValue('');
                      } else {
                        setEditingPwdEmail(adv.email);
                        setEditingPwdValue('');
                      }
                    }}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-[11px] font-bold text-stone-700 hover:bg-stone-50"
                  >
                    <KeyRound className="h-3 w-3 text-red-800" />
                    <span>{tr('Đặt / Đổi MK', 'Set Password')}</span>
                  </button>
                  <button
                    type="button"
                    disabled={savingAdv}
                    onClick={() =>
                      void handleSaveAdvisor({
                        email: adv.email,
                        name: adv.name,
                        active: !(adv.active !== false),
                        role: adv.role || 'advisor',
                      })
                    }
                    className={`rounded-lg border px-2.5 py-1 text-[11px] font-bold ${
                      adv.active !== false
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-stone-200 bg-stone-100 text-stone-600'
                    }`}
                  >
                    {adv.active !== false ? tr('Đang hoạt động', 'Active') : tr('Tạm khóa', 'Inactive')}
                  </button>
                </div>
              </div>

              {editingPwdEmail === adv.email && (
                <div className="flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-stone-50 p-2">
                  <input
                    type="password"
                    data-testid={`crm-inline-pwd-input-${adv.email}`}
                    value={editingPwdValue}
                    onChange={(e) => setEditingPwdValue(e.target.value)}
                    placeholder={tr(
                      adv.role === 'manager' ? 'Nhập mật khẩu mới (>=8 ký tự)...' : 'Nhập mật khẩu mới (>=6 ký tự)...',
                      'New password...'
                    )}
                    className="min-w-[200px] flex-1 rounded-lg border border-stone-200 bg-white px-2.5 py-1 text-xs"
                  />
                  <button
                    type="button"
                    disabled={savingAdv || !editingPwdValue.trim()}
                    onClick={async () => {
                      const pwd = editingPwdValue.trim();
                      const minLen = adv.role === 'manager' ? 8 : 6;
                      if (pwd.length < minLen) {
                        addToast({
                          title: tr(`Mật khẩu phải từ ${minLen} ký tự trở lên.`, `Password must be at least ${minLen} chars.`),
                          variant: 'error',
                        });
                        return;
                      }
                      await handleSaveAdvisor({
                        email: adv.email,
                        name: adv.name,
                        active: adv.active !== false,
                        role: adv.role || 'advisor',
                        password: pwd,
                      });
                      setEditingPwdEmail(null);
                      setEditingPwdValue('');
                    }}
                    className="rounded-lg bg-red-800 px-3 py-1 text-[11px] font-bold text-white hover:bg-red-900 disabled:opacity-40"
                  >
                    {tr('Lưu mật khẩu', 'Save Password')}
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Non-Prod Zalo OA Sandbox Simulator */}
      {(isSandboxSimulatorAllowed() || isDemoMode) && (
        <section
          data-testid="crm-zalo-sandbox-panel"
          className="rounded-2xl border border-sky-200 bg-sky-50/60 p-4 shadow-2xs"
        >
          <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-sky-950">
            <FlaskConical className="h-4 w-4 text-sky-700" />
            <span>{tr('Zalo OA Sandbox Simulator (Kiểm thử không chạm production)', 'Zalo OA Sandbox Simulator')}</span>
          </h3>
          <div className="mt-2.5 grid grid-cols-1 gap-2 sm:grid-cols-4">
            <input
              type="text"
              value={zaloSandboxUserId}
              onChange={(e) => setZaloSandboxUserId(e.target.value)}
              placeholder="zalo_user_id"
              className="rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={zaloSandboxName}
              onChange={(e) => setZaloSandboxName(e.target.value)}
              placeholder={tr('Tên khách Zalo', 'Zalo Name')}
              className="rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <input
              type="text"
              value={zaloSandboxTag}
              onChange={(e) => setZaloSandboxTag(e.target.value)}
              placeholder="source_tag (vd: ad_963k)"
              className="rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
            />
            <button
              type="button"
              data-testid="crm-zalo-sandbox-trigger-btn"
              disabled={sendingZaloSandbox}
              onClick={() => void handleTriggerZaloSandbox()}
              className="rounded-xl bg-sky-700 px-3 py-1.5 font-bold text-white hover:bg-sky-800 disabled:opacity-50"
            >
              {tr('Bắn tin nhắn Zalo giả lập', 'Trigger Zalo Event')}
            </button>
          </div>
          <input
            type="text"
            value={zaloSandboxBody}
            onChange={(e) => setZaloSandboxBody(e.target.value)}
            className="mt-2 w-full rounded-xl border border-sky-200 bg-white px-2.5 py-1.5 text-xs"
          />
        </section>
      )}
    </div>
  );
};
