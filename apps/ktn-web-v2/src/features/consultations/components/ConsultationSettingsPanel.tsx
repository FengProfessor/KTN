import React, { useEffect, useState } from 'react';
import { Shield, Save, Plus, Trash2, BookOpen, Users, FlaskConical, AlertCircle } from 'lucide-react';
import { useI18n } from '@/i18n';
import { ktnApi } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';
import { isSandboxSimulatorAllowed } from '@/features/admin/components/leadSourceMeta';
import type {
  ConsultationAdvisor,
  ConsultationAdvisorRole,
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
  const [maxExamples, setMaxExamples] = useState(120);
  const [piiError, setPiiError] = useState<string | null>(null);
  const [savingGuidance, setSavingGuidance] = useState(false);

  const [newAdvEmail, setNewAdvEmail] = useState('');
  const [newAdvName, setNewAdvName] = useState('');
  const [newAdvRole, setNewAdvRole] = useState<ConsultationAdvisorRole>('advisor');
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
        });
        if (res?.config) setGuidance(res.config);
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
    <div data-testid="crm-settings-panel" className="space-y-4 text-xs">
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

      {/* Advisors Management */}
      <section className="rounded-2xl border border-stone-200 bg-white p-4 shadow-2xs">
        <h3 className="flex items-center gap-1.5 font-display text-sm font-extrabold text-stone-900">
          <Users className="h-4 w-4 text-red-800" />
          <span>{tr('Phân quyền nhân viên Zalo OA & Tư vấn (ktn_advisors)', 'Multi-Staff Advisors')}</span>
        </h3>

        <div className="mt-2.5 flex flex-wrap gap-2">
          <input
            type="email"
            data-testid="crm-new-advisor-email"
            value={newAdvEmail}
            onChange={(e) => setNewAdvEmail(e.target.value)}
            placeholder="advisor@khongtunhi.com"
            className="min-w-[180px] flex-1 rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
          />
          <input
            type="text"
            data-testid="crm-new-advisor-name"
            value={newAdvName}
            onChange={(e) => setNewAdvName(e.target.value)}
            placeholder={tr('Họ tên nhân viên', 'Advisor name')}
            className="min-w-[160px] flex-1 rounded-xl border border-stone-200 px-3 py-1.5 text-xs"
          />
          <select
            value={newAdvRole}
            onChange={(e) => setNewAdvRole(e.target.value as ConsultationAdvisorRole)}
            className="rounded-xl border border-stone-200 bg-white px-2.5 py-1.5 text-xs"
          >
            <option value="advisor">advisor</option>
            <option value="manager">manager</option>
          </select>
          <button
            type="button"
            data-testid="crm-add-advisor-btn"
            disabled={!newAdvEmail.trim() || savingAdv}
            onClick={async () => {
              await handleSaveAdvisor({
                email: newAdvEmail.trim(),
                name: newAdvName.trim() || newAdvEmail.trim(),
                active: true,
                role: newAdvRole,
              });
              setNewAdvEmail('');
              setNewAdvName('');
            }}
            className="rounded-xl bg-red-800 px-3 py-1.5 font-bold text-white hover:bg-red-900 disabled:opacity-40"
          >
            {tr('Thêm / Cập nhật', 'Save Advisor')}
          </button>
        </div>

        <div className="mt-3 divide-y divide-stone-100">
          {advisors.map((adv) => (
            <div key={adv.email} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <div>
                <p className="font-bold text-stone-900">
                  {adv.name} <span className="font-mono text-stone-500">({adv.email})</span>
                </p>
                <span className="rounded bg-stone-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-stone-700">
                  {adv.role || 'advisor'}
                </span>
              </div>
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
