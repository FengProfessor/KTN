import React, { useEffect, useState } from 'react';
import { Sparkles, ChevronDown, ChevronUp, AlertTriangle, Clock, Copy } from 'lucide-react';
import { useI18n } from '@/i18n';
import type { AdultWorking11Info } from '../utils/consultationHelpers';

interface AdultScriptHelperCardProps {
  info: AdultWorking11Info;
  initialTimeslot?: string;
  onInsertPrompt: (text: string) => void;
  onSaveTimeslotNote?: (timeslot: string) => Promise<void>;
  isSavingNote?: boolean;
}

export const AdultScriptHelperCard: React.FC<AdultScriptHelperCardProps> = ({
  info,
  initialTimeslot = '',
  onInsertPrompt,
  onSaveTimeslotNote,
  isSavingNote = false,
}) => {
  const { isEn, tr } = useI18n();
  const [expanded, setExpanded] = useState(true);
  const [timeslot, setTimeslot] = useState(initialTimeslot);

  useEffect(() => {
    setTimeslot(initialTimeslot);
  }, [initialTimeslot]);

  if (!info.matched && !info.isChildExcluded) {
    return null;
  }

  if (info.isChildExcluded) {
    return (
      <div
        data-testid="crm-adult-script-child-excluded"
        className="rounded-xl border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-950"
      >
        <p className="font-bold">
          {tr(
            'Đã loại trừ kịch bản Người đi làm 1:1 (nhu cầu học cho trẻ em)',
            'Adult 1:1 script excluded (child/parent inquiry detected)'
          )}
        </p>
        <p className="mt-0.5 text-amber-900">
          {tr(
            'Hội thoại này đang hỏi lớp cho bé/học sinh — vui lòng tư vấn theo lộ trình phụ huynh & trẻ em (YCT / Chinese For Kids).',
            'This inquiry is for a child — please follow the Kids / Parent consultation flow.'
          )}
        </p>
      </div>
    );
  }

  return (
    <div
      data-testid="crm-adult-script-helper"
      className="rounded-xl border border-indigo-200 bg-indigo-50/60 p-3 text-xs"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <Sparkles className="h-3.5 w-3.5 text-indigo-700" />
          <span className="font-bold text-indigo-950">
            {tr('Kịch bản Người đi làm 1:1 (4 bước)', 'Adult Working 1:1 Script (4 Steps)')}
          </span>
          <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-[10px] font-bold text-indigo-900">
            {info.packageLabel}
          </span>
        </div>
        <button
          type="button"
          onClick={() => setExpanded((prev) => !prev)}
          className="inline-flex items-center gap-1 rounded-lg border border-indigo-200 bg-white px-2 py-0.5 text-[11px] font-bold text-indigo-900 hover:bg-indigo-100"
        >
          {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          <span>{expanded ? tr('Thu gọn', 'Hide') : tr('Mở', 'Show')}</span>
        </button>
      </div>

      {expanded && (
        <div className="mt-2.5 space-y-2">
          <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
            {info.steps.map((s) => {
              const prompt = isEn ? s.promptEn : s.promptVi;
              return (
                <div
                  key={s.step}
                  className="flex flex-col justify-between rounded-lg border border-indigo-200/80 bg-white p-2"
                >
                  <div>
                    <p className="text-[11px] font-bold text-indigo-950">
                      {isEn ? s.titleEn : s.titleVi}
                    </p>
                    <p className="mt-0.5 text-[11px] text-stone-600">{prompt}</p>
                  </div>
                  <button
                    type="button"
                    data-testid={`crm-adult-step-insert-${s.step}`}
                    onClick={() => onInsertPrompt(prompt)}
                    className="mt-1.5 inline-flex items-center gap-1 self-start rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[10px] font-bold text-indigo-900 hover:bg-indigo-100"
                  >
                    <Copy className="h-3 w-3" />
                    <span>{tr('Chèn vào ô trả lời', 'Insert reply')}</span>
                  </button>
                </div>
              );
            })}
          </div>

          {onSaveTimeslotNote && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-indigo-200 bg-white p-2">
              <Clock className="h-3.5 w-3.5 shrink-0 text-indigo-700" />
              <input
                type="text"
                data-testid="crm-adult-timeslot-input"
                value={timeslot}
                onChange={(e) => setTimeslot(e.target.value)}
                placeholder={tr(
                  'Ghi nhận khung giờ rảnh (vd: Tối T3/T5 20h-21h)...',
                  'Record free timeslot (e.g. Tue/Thu 20:00)...'
                )}
                className="min-w-[200px] flex-1 rounded-lg border border-stone-200 px-2.5 py-1 text-xs focus:border-indigo-500 focus:outline-none"
              />
              <button
                type="button"
                data-testid="crm-adult-timeslot-save-btn"
                disabled={!timeslot.trim() || isSavingNote}
                onClick={async () => {
                  await onSaveTimeslotNote(timeslot.trim());
                }}
                className="rounded-lg bg-indigo-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-indigo-800 disabled:opacity-50"
              >
                {tr('Lưu khung giờ (ghi chú)', 'Save timeslot note')}
              </button>
            </div>
          )}

          <div className="flex items-start gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1.5 text-[11px] text-amber-950">
            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-700" />
            <span>
              {tr(
                `Rào chắn tư vấn: KHÔNG cam kết các nội dung chưa xác thực (${info.forbiddenClaims.join(', ')}).`,
                `Guardrail: NEVER promise unverified claims (${info.forbiddenClaims.join(', ')}).`
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
};
