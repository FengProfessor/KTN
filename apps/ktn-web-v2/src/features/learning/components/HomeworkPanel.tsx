import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Mic,
  Send,
  FileAudio,
  Award,
  RotateCcw,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { KtnHomework } from '@/types/ktn.types';
import { VoiceRecorder } from '@/features/chat/components/VoiceRecorder';
import { formatChatTimestamp, formatFileSize } from '@/lib/utils';

interface HomeworkPanelProps {
  courseId: string;
  lessonNum: number;
  lessonTitle: string;
  classCode: string;
  existingSubmission: KtnHomework | null;
  isSubmitting: boolean;
  onSubmitHomework: (params: {
    file: File | Blob;
    fileName: string;
    note: string;
  }) => Promise<void>;
}

export const HomeworkPanel: React.FC<HomeworkPanelProps> = ({
  courseId,
  lessonNum,
  lessonTitle,
  classCode,
  existingSubmission,
  isSubmitting,
  onSubmitHomework,
}) => {
  const [note, setNote] = useState(existingSubmission?.student_note || '');
  const [selectedFile, setSelectedFile] = useState<{
    blob: File | Blob;
    name: string;
    size: number;
    previewUrl?: string;
  } | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRevising, setIsRevising] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNote(existingSubmission?.student_note || '');
    setSelectedFile(null);
    setShowRecorder(false);
    setSubmitError(null);
    setIsRevising(false);
  }, [courseId, lessonNum, existingSubmission?.id]);

  const status = existingSubmission?.status || 'not_submitted';

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedFile({
      blob: file,
      name: file.name,
      size: file.size,
      previewUrl: file.type.startsWith('audio/') ? URL.createObjectURL(file) : undefined,
    });
    setSubmitError(null);
    e.target.value = '';
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    let fileToUpload = selectedFile?.blob;
    let fileNameToUpload = selectedFile?.name || `BaiTap-Bai${lessonNum}.wav`;

    if (!fileToUpload) {
      if (!note.trim()) {
        setSubmitError('Vui lòng thu âm giọng đọc hoặc chọn tệp bài làm trước khi nhấn Nộp bài.');
        return;
      }
      fileToUpload = new Blob([note.trim()], { type: 'audio/wav' });
      fileNameToUpload = `BaiTap-Bai${lessonNum}.wav`;
    }

    try {
      await onSubmitHomework({
        file: fileToUpload,
        fileName: fileNameToUpload,
        note: note.trim() || `Nộp bài tập ${lessonTitle}`,
      });
      setIsRevising(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : 'Chưa nộp được bài tập do lỗi kết nối. Bản thu âm của con vẫn được giữ nguyên trên máy.'
      );
    }
  };

  const renderStatusBadge = () => {
    if (status === 'graded') {
      return (
        <span
          data-testid="homework-status-graded"
          className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-900"
        >
          <Award className="h-4 w-4 text-emerald-700" />
          Đã chấm điểm: {existingSubmission?.score ?? 10}/10
        </span>
      );
    }
    if (status === 'revision_requested') {
      return (
        <span
          data-testid="homework-status-revision"
          className="inline-flex items-center gap-1.5 rounded-full bg-red-100 px-3 py-1 text-xs font-bold text-red-900"
        >
          <AlertCircle className="h-4 w-4 text-red-700" />
          Cần nộp lại theo nhận xét giáo viên
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span
          data-testid="homework-status-submitted"
          className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-900"
        >
          <Clock className="h-4 w-4 text-blue-700" />
          Đã nộp • Đang chờ Lão sư chấm
        </span>
      );
    }
    return (
      <span
        data-testid="homework-status-unsubmitted"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"
      >
        <Sparkles className="h-4 w-4 text-amber-700" />
        Chưa nộp bài tập
      </span>
    );
  };

  const showSubmissionForm =
    status === 'not_submitted' || status === 'revision_requested' || isRevising;

  return (
    <div
      data-testid="homework-submission-panel"
      className="rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-stone-100 pb-3">
        <div className="min-w-0 flex-1">
          <span className="text-[10.5px] font-bold uppercase tracking-wider text-red-800">
            Bài tập • {classCode || 'Tự học'}
          </span>
          <h3 className="mt-0.5 truncate font-display text-sm font-bold text-stone-900 sm:text-base">
            {lessonTitle}
          </h3>
          <p className="mt-0.5 text-[11px] text-stone-500">
            Thu âm đọc câu (30–45s) hoặc đính kèm ảnh vở viết gửi giáo viên.
          </p>
        </div>
        {renderStatusBadge()}
      </div>

      {/* Existing Graded / Feedback Card */}
      {existingSubmission && (
        <div className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>Đã nộp: {formatChatTimestamp(existingSubmission.submitted_at)}</span>
            </div>
            {existingSubmission.file_url && (
              <a
                href={existingSubmission.file_url}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-red-800 underline hover:text-red-950"
              >
                Xem tệp ({existingSubmission.attachments?.[0]?.title || 'Bài làm'})
              </a>
            )}
          </div>

          {existingSubmission.student_note && (
            <p className="mt-2 rounded-lg border border-stone-200/80 bg-white p-2 text-xs text-stone-700">
              <strong>Ghi chú:</strong> {existingSubmission.student_note}
            </p>
          )}

          {/* Teacher Score & Feedback */}
          {(existingSubmission.status === 'graded' ||
            existingSubmission.status === 'revision_requested' ||
            existingSubmission.teacher_feedback) && (
            <div
              data-testid="teacher-grading-result-card"
              className={`mt-2.5 rounded-xl border p-3 ${
                existingSubmission.status === 'revision_requested'
                  ? 'border-red-200 bg-red-50/80'
                  : 'border-emerald-200 bg-emerald-50/80'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-stone-800">
                  Nhận xét giáo viên
                </span>
                {existingSubmission.score !== null && existingSubmission.score !== undefined && (
                  <span
                    data-testid="homework-score-badge"
                    className="rounded-lg bg-emerald-700 px-2.5 py-0.5 font-display text-xs font-bold text-white shadow-2xs"
                  >
                    Điểm: {existingSubmission.score} / 10
                  </span>
                )}
              </div>
              <p
                data-testid="homework-feedback-text"
                className="mt-1 text-xs leading-relaxed font-medium text-stone-800"
              >
                {existingSubmission.teacher_feedback || 'Giáo viên đã chấm bài.'}
              </p>
            </div>
          )}

          {!showSubmissionForm && (
            <div className="mt-2.5 flex justify-end">
              <button
                type="button"
                data-testid="resubmit-homework-toggle-btn"
                onClick={() => setIsRevising(true)}
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Nộp lại
              </button>
            </div>
          )}
        </div>
      )}

      {/* Submission Form */}
      {showSubmissionForm && (
        <form onSubmit={handleFormSubmit} className="mt-3 space-y-3">
          {submitError && (
            <div
              data-testid="homework-submit-error"
              role="alert"
              className="flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-2.5 text-xs font-medium text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <span>{submitError}</span>
            </div>
          )}

          {/* Voice Recording or File Picker */}
          <div className="space-y-2">
            {showRecorder ? (
              <VoiceRecorder
                onCancel={() => setShowRecorder(false)}
                onSendVoice={(blob, durationSec, previewUrl) => {
                  setSelectedFile({
                    blob,
                    name: `ThuAm-${courseId.slice(0, 6)}-Bai${lessonNum}-${durationSec}s.wav`,
                    size: blob.size,
                    previewUrl,
                  });
                  setShowRecorder(false);
                  setSubmitError(null);
                }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  data-testid="homework-start-record-btn"
                  onClick={() => setShowRecorder(true)}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 transition-colors hover:bg-red-100"
                >
                  <Mic className="h-4 w-4 shrink-0 text-red-700" />
                  <span>Thu âm</span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*,video/*,image/*,.pdf"
                  onChange={handleFilePick}
                  className="hidden"
                />

                <button
                  type="button"
                  data-testid="homework-pick-file-btn"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-stone-300 bg-white px-3 py-2 text-xs font-semibold text-stone-700 transition-colors hover:bg-stone-50"
                >
                  <Upload className="h-4 w-4 shrink-0 text-stone-600" />
                  <span>Chọn tệp / ảnh</span>
                </button>
              </div>
            )}

            {/* Selected File Preview */}
            {selectedFile && (
              <div
                data-testid="homework-selected-file-card"
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2">
                  <FileAudio className="h-4 w-4 shrink-0 text-emerald-700" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-stone-900">{selectedFile.name}</p>
                    <p className="text-[11px] text-stone-600">
                      {formatFileSize(selectedFile.size)} • Sẵn sàng nộp
                    </p>
                  </div>
                </div>
                {selectedFile.previewUrl && (
                  <audio controls src={selectedFile.previewUrl} className="h-8 max-w-[180px]" />
                )}
              </div>
            )}
          </div>

          {/* Student Note */}
          <div>
            <label
              htmlFor="homework-student-note"
              className="block text-xs font-bold text-stone-800"
            >
              Ghi chú gửi giáo viên:
            </label>
            <textarea
              id="homework-student-note"
              data-testid="homework-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú bài thu âm hoặc câu cần cô sửa..."
              className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-red-800 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Submit CTA */}
          <div className="flex items-center justify-end gap-2">
            {isRevising && (
              <button
                type="button"
                onClick={() => setIsRevising(false)}
                className="min-h-[40px] rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                Hủy
              </button>
            )}
            <button
              type="submit"
              data-testid="homework-submit-btn"
              disabled={isSubmitting}
              className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl bg-red-800 px-4 py-2 text-xs font-bold text-white shadow-2xs transition-all hover:bg-red-900 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>Đang nộp...</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>Nộp bài tập</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
