import React, { useState, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  Upload,
  Mic,
  Send,
  FileAudio,
  FileText,
  Image as ImageIcon,
  Award,
  RotateCcw,
  Loader2,
  Sparkles,
  Trash2,
  Settings2,
  BookOpen,
  Calendar,
  CheckSquare,
  X,
  ZoomIn,
} from 'lucide-react';
import { KtnHomework, KtnHomeworkAssignment } from '@/types/ktn.types';
import {
  VoiceRecorder,
  getAudioExtensionFromMime,
  normalizeAudioMimeType,
} from '@/features/chat/components/VoiceRecorder';
import { ktnApi, resolveUploadedMediaUrl } from '@/services/api/ktnApiClient';
import { formatChatTimestamp, formatFileSize } from '@/lib/utils';
import { useUiStore } from '@/stores/useUiStore';
import { useI18n, trStatic, type AppLanguage } from '@/i18n';

interface HomeworkPanelProps {
  courseId: string;
  unitId?: string | null;
  lessonNum: number;
  lessonTitle: string;
  classCode: string;
  homeworkAssignment?: KtnHomeworkAssignment | null;
  existingSubmission: KtnHomework | null;
  isSubmitting: boolean;
  canManageHomeworkConfig?: boolean;
  onHomeworkConfigSaved?: (config: KtnHomeworkAssignment) => void;
  onSubmitHomework: (params: {
    file?: File | Blob | null;
    fileName?: string;
    note: string;
    submissionMode?: 'file' | 'text';
    textAnswer?: string;
  }) => Promise<void>;
}

function getAllowedTypeLabels(lang: AppLanguage): Record<string, string> {
  return {
    audio: trStatic('🎤 Thu âm giọng đọc', '🎤 Voice Recording', lang),
    image: trStatic('📷 Ảnh chụp vở viết / SBT', '📷 Notebook / Workbook Photo', lang),
    pdf: trStatic('📄 Tệp PDF', '📄 PDF File', lang),
    video: trStatic('🎬 Video ngắn', '🎬 Short Video', lang),
    text: trStatic('✍️ Trả lời bằng chữ', '✍️ Text Answer', lang),
  };
}

export const HomeworkPanel: React.FC<HomeworkPanelProps> = ({
  courseId,
  unitId,
  lessonNum,
  lessonTitle,
  classCode,
  homeworkAssignment,
  existingSubmission,
  isSubmitting,
  canManageHomeworkConfig = false,
  onHomeworkConfigSaved,
  onSubmitHomework,
}) => {
  const { lang, tr } = useI18n();
  const allowedTypeLabels = getAllowedTypeLabels(lang);
  const setActiveLightboxAttachment = useUiStore((s) => s.setActiveLightboxAttachment);
  const isDemoMode = useUiStore((s) => s.isDemoMode);
  const [note, setNote] = useState(existingSubmission?.student_note || '');
  const [selectedFile, setSelectedFile] = useState<{
    blob: File | Blob;
    name: string;
    size: number;
    mimeType: string;
    previewUrl?: string;
  } | null>(null);
  const [showRecorder, setShowRecorder] = useState(false);
  const [isRecorderActive, setIsRecorderActive] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isRevising, setIsRevising] = useState(false);
  const [voluntaryOpen, setVoluntaryOpen] = useState(false);

  // Admin / Teacher Homework Config Editor State
  const [localAssignment, setLocalAssignment] = useState<KtnHomeworkAssignment | null>(null);
  const [isEditingConfig, setIsEditingConfig] = useState(false);
  const [isSavingConfig, setIsSavingConfig] = useState(false);
  const [configError, setConfigError] = useState<string | null>(null);
  const [cfgAssigned, setCfgAssigned] = useState(true);
  const [cfgMandatory, setCfgMandatory] = useState(true);
  const [cfgTitle, setCfgTitle] = useState('');
  const [cfgInstructions, setCfgInstructions] = useState('');
  const [cfgRelatedPages, setCfgRelatedPages] = useState('');
  const [cfgAllowedTypes, setCfgAllowedTypes] = useState<Array<'audio' | 'image' | 'pdf' | 'video' | 'text'>>([
    'audio',
    'image',
    'pdf',
  ]);
  const [cfgMaxFiles, setCfgMaxFiles] = useState(3);
  const [cfgDeadline, setCfgDeadline] = useState('');
  const [cfgCriteria, setCfgCriteria] = useState('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setNote(existingSubmission?.student_note || '');
    setSelectedFile(null);
    setShowRecorder(false);
    setIsRecorderActive(false);
    setSubmitError(null);
    setIsRevising(false);
    setVoluntaryOpen(false);
    setLocalAssignment(null);
    setIsEditingConfig(false);
    setConfigError(null);
  }, [courseId, unitId, lessonNum, existingSubmission?.id]);

  const effectiveAssignment: KtnHomeworkAssignment = localAssignment ||
    homeworkAssignment || {
      assigned: true,
      mandatory: true,
      title: tr(`Bài tập ${lessonTitle}`, `Homework: ${lessonTitle}`),
      instructions: tr(
        `Hoàn thành bài luyện tập của ${lessonTitle}: thu âm đọc bài khóa hoặc chụp ảnh vở viết / sách bài tập gửi giáo viên nhận xét.`,
        `Complete the practice for ${lessonTitle}: record yourself reading the lesson or upload photos of your notebook/workbook for teacher review.`
      ),
      relatedPages: null,
      allowedTypes: ['audio', 'image', 'pdf', 'text'],
      maxFiles: 3,
      deadline: null,
      completionCriteria: tr(
        'Nộp tệp thu âm rõ tiếng hoặc ảnh bài viết rõ nét.',
        'Submit a clear audio recording or sharp photos of your work.'
      ),
    };

  const isAssigned = effectiveAssignment.assigned !== false;
  const allowsTextOnly = Boolean(effectiveAssignment.allowedTypes?.includes('text'));
  const status = existingSubmission?.status || 'not_submitted';

  const openConfigEditor = () => {
    setCfgAssigned(effectiveAssignment.assigned !== false);
    setCfgMandatory(effectiveAssignment.mandatory !== false);
    setCfgTitle(
      effectiveAssignment.title || tr(`Bài tập ${lessonTitle}`, `Homework: ${lessonTitle}`)
    );
    setCfgInstructions(effectiveAssignment.instructions || '');
    setCfgRelatedPages(effectiveAssignment.relatedPages || '');
    setCfgAllowedTypes(
      Array.isArray(effectiveAssignment.allowedTypes) && effectiveAssignment.allowedTypes.length > 0
        ? (effectiveAssignment.allowedTypes as Array<'audio' | 'image' | 'pdf' | 'video' | 'text'>)
        : ['audio', 'image', 'pdf', 'text']
    );
    setCfgMaxFiles(effectiveAssignment.maxFiles || 3);
    setCfgDeadline(effectiveAssignment.deadline || '');
    setCfgCriteria(effectiveAssignment.completionCriteria || '');
    setConfigError(null);
    setIsEditingConfig(true);
  };

  const handleSaveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingConfig(true);
    setConfigError(null);
    try {
      const res = await ktnApi.saveCourseHomeworkConfig({
        courseId,
        lessonNumber: lessonNum,
        unitId: unitId || null,
        assigned: cfgAssigned,
        mandatory: cfgAssigned ? cfgMandatory : false,
        title: cfgTitle.trim() || tr(`Bài tập ${lessonTitle}`, `Homework: ${lessonTitle}`),
        instructions: cfgInstructions.trim(),
        relatedPages: cfgRelatedPages.trim() || null,
        allowedTypes: cfgAllowedTypes.length > 0 ? cfgAllowedTypes : ['audio', 'image', 'pdf', 'text'],
        maxFiles: Math.max(1, Math.min(10, Number(cfgMaxFiles) || 3)),
        deadline: cfgDeadline.trim() || null,
        completionCriteria: cfgCriteria.trim() || null,
      });
      if (res.config) {
        setLocalAssignment(res.config);
        onHomeworkConfigSaved?.(res.config);
      }
      setIsEditingConfig(false);
    } catch (err) {
      if (isDemoMode) {
        const fallbackCfg: KtnHomeworkAssignment = {
          assigned: cfgAssigned,
          mandatory: cfgAssigned ? cfgMandatory : false,
          title: cfgTitle.trim() || tr(`Bài tập ${lessonTitle}`, `Homework: ${lessonTitle}`),
          instructions: cfgInstructions.trim(),
          relatedPages: cfgRelatedPages.trim() || null,
          allowedTypes: cfgAllowedTypes.length > 0 ? cfgAllowedTypes : ['audio', 'image', 'pdf', 'text'],
          maxFiles: Math.max(1, Math.min(10, Number(cfgMaxFiles) || 3)),
          deadline: cfgDeadline.trim() || null,
          completionCriteria: cfgCriteria.trim() || null,
        };
        setLocalAssignment(fallbackCfg);
        onHomeworkConfigSaved?.(fallbackCfg);
        setIsEditingConfig(false);
      } else {
        setConfigError(
          err instanceof Error
            ? err.message
            : tr(
                'Không thể lưu cấu hình bài tập. Vui lòng kiểm tra quyền truy cập của tài khoản.',
                'Unable to save homework settings. Please verify your account permissions.'
              )
        );
      }
    } finally {
      setIsSavingConfig(false);
    }
  };

  const attachVoiceRecording = (blob: Blob, durationSec: number, previewUrl: string) => {
    const cleanMime = normalizeAudioMimeType(blob.type);
    const ext = getAudioExtensionFromMime(cleanMime);
    const cleanCoursePrefix = courseId.slice(0, 6);
    const fileName = `ThuAm-${cleanCoursePrefix}-Bai${lessonNum}-${durationSec}s.${ext}`;
    const normalizedFile = new File([blob], fileName, { type: cleanMime });
    setSelectedFile({
      blob: normalizedFile,
      name: fileName,
      size: normalizedFile.size,
      mimeType: cleanMime,
      previewUrl,
    });
    setSubmitError(null);
  };

  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size <= 0) {
      setSubmitError(
        tr(
          'Tệp vừa chọn bị rỗng (0 byte). Vui lòng chọn tệp hợp lệ.',
          'The selected file is empty (0 bytes). Please choose a valid file.'
        )
      );
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setSubmitError(
        tr(
          'Tệp vượt quá giới hạn 50MB. Vui lòng chọn tệp nhỏ hơn.',
          'File exceeds the 50MB limit. Please choose a smaller file.'
        )
      );
      e.target.value = '';
      return;
    }
    const cleanMime = (file.type || 'application/octet-stream').split(';')[0].trim();
    const isPreviewable = cleanMime.startsWith('audio/') || cleanMime.startsWith('image/');
    setSelectedFile({
      blob: file,
      name: file.name,
      size: file.size,
      mimeType: cleanMime,
      previewUrl: isPreviewable ? URL.createObjectURL(file) : undefined,
    });
    setSubmitError(null);
    e.target.value = '';
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitError(null);

    const fileToUpload = selectedFile?.blob || null;
    const fileNameToUpload = selectedFile?.name || '';

    // Block submission if student is actively recording (even if note is non-empty!)
    if (showRecorder && (isRecorderActive || !fileToUpload)) {
      setSubmitError(
        tr(
          'Em đang mở khung thu âm. Vui lòng bấm "Dừng thu" để hoàn tất bản thu trước khi bấm Nộp bài tập.',
          'The recorder is open. Please click "Stop Recording" to finalize your audio before submitting.'
        )
      );
      return;
    }

    // Phase 5.1: NEVER create fake WAV from text note!
    if (!fileToUpload) {
      if (allowsTextOnly && note.trim()) {
        try {
          await onSubmitHomework({
            file: null,
            fileName: '',
            note: note.trim(),
            submissionMode: 'text',
            textAnswer: note.trim(),
          });
          setSelectedFile(null);
          setShowRecorder(false);
          setIsRecorderActive(false);
          setIsRevising(false);
          setVoluntaryOpen(false);
        } catch (err) {
          setSubmitError(
            err instanceof Error
              ? err.message
              : tr(
                  'Chưa nộp được câu trả lời. Vui lòng kiểm tra kết nối và thử lại.',
                  'Unable to submit your answer. Please check your connection and try again.'
                )
          );
        }
        return;
      }

      setSubmitError(
        tr(
          'Vui lòng thu âm giọng đọc hoặc chọn tệp bài làm thật (ảnh vở viết, âm thanh, PDF) trước khi nhấn Nộp bài.',
          'Please record your reading or select an actual file (notebook photo, audio, PDF) before submitting.'
        )
      );
      return;
    }

    try {
      await onSubmitHomework({
        file: fileToUpload,
        fileName: fileNameToUpload,
        note: note.trim() || tr(`Nộp bài tập ${lessonTitle}`, `Homework submission: ${lessonTitle}`),
        submissionMode: 'file',
      });
      setSelectedFile(null);
      setShowRecorder(false);
      setIsRecorderActive(false);
      setIsRevising(false);
      setVoluntaryOpen(false);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : tr(
              'Chưa nộp được bài tập do lỗi kết nối. Tệp/bản thu âm của em vẫn được giữ nguyên trên máy để thử lại.',
              'Could not submit homework due to a connection error. Your file/recording is preserved locally so you can retry.'
            )
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
          {tr('Đã chấm điểm:', 'Graded:')} {existingSubmission?.score ?? 10}/10
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
          {tr('Cần bổ sung theo nhận xét giáo viên', 'Revision requested')}
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
          {tr('Đã nộp • Chờ giáo viên chấm', 'Submitted • Pending review')}
        </span>
      );
    }
    if (!isAssigned) {
      return (
        <span
          data-testid="homework-status-optional"
          className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700"
        >
          {tr('Tự luyện tập (Không bắt buộc nộp)', 'Self-practice (Optional)')}
        </span>
      );
    }
    return (
      <span
        data-testid="homework-status-unsubmitted"
        className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-3 py-1 text-xs font-bold text-amber-900"
      >
        <Sparkles className="h-4 w-4 text-amber-700" />
        {tr('Chưa nộp bài tập', 'Not submitted')}
      </span>
    );
  };

  const showSubmissionForm =
    (isAssigned || voluntaryOpen) &&
    (status === 'not_submitted' || status === 'revision_requested' || isRevising);

  const rawSubmittedFileUrl = existingSubmission?.file_url || '';
  const submittedFileUrl = rawSubmittedFileUrl
    ? resolveUploadedMediaUrl(rawSubmittedFileUrl)
    : '';
  const isSubmittedAudio =
    Boolean(submittedFileUrl) &&
    (String(existingSubmission?.file_type || '').startsWith('audio/') ||
      /\.(wav|mp3|m4a|webm|ogg)(\?|$)/i.test(rawSubmittedFileUrl) ||
      /\.(wav|mp3|m4a|webm|ogg)(\?|$)/i.test(submittedFileUrl));
  const isSubmittedImage =
    Boolean(submittedFileUrl) &&
    (String(existingSubmission?.file_type || '').startsWith('image/') ||
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(rawSubmittedFileUrl) ||
      /\.(png|jpe?g|webp|gif)(\?|$)/i.test(submittedFileUrl));

  return (
    <div
      data-testid="homework-submission-panel"
      className="rounded-2xl border border-stone-200 bg-white p-3.5 sm:p-4 shadow-2xs"
    >
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-2.5 border-b border-stone-100 pb-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10.5px] font-bold uppercase tracking-wider text-red-800">
              {tr('Bài tập', 'Homework')} • {classCode || tr('Khóa học Video', 'Video Course')}
            </span>
            {isAssigned && effectiveAssignment.mandatory !== false && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                {tr('Bắt buộc', 'Required')}
              </span>
            )}
          </div>
          <h3 className="mt-0.5 font-display text-sm font-bold text-stone-900 sm:text-base">
            {isAssigned ? effectiveAssignment.title || lessonTitle : lessonTitle}
          </h3>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {renderStatusBadge()}
          {canManageHomeworkConfig && (
            <button
              type="button"
              data-testid="homework-config-edit-btn"
              onClick={openConfigEditor}
              className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-stone-50 px-2.5 py-1 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <Settings2 className="h-3.5 w-3.5" />
              <span>{tr('Cấu hình bài tập', 'Homework Settings')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Admin / Teacher Inline Homework Config Editor */}
      {isEditingConfig && (
        <form
          data-testid="homework-config-editor-form"
          onSubmit={handleSaveConfig}
          className="mt-3 space-y-3 rounded-xl border border-amber-300 bg-amber-50/70 p-3.5 text-xs"
        >
          <div className="flex items-center justify-between border-b border-amber-200 pb-2">
            <span className="font-bold text-amber-950">
              {tr(
                'Thiết lập yêu cầu bài tập cho bài học này',
                'Configure homework requirements for this lesson'
              )}
            </span>
            <button
              type="button"
              onClick={() => setIsEditingConfig(false)}
              className="rounded p-1 text-stone-500 hover:bg-amber-100"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            <label className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
              <input
                type="checkbox"
                checked={cfgAssigned}
                onChange={(e) => setCfgAssigned(e.target.checked)}
                className="rounded border-stone-300 text-red-800"
              />
              {tr('Có giao bài tập cần nộp', 'Require homework submission')}
            </label>

            {cfgAssigned && (
              <label className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={cfgMandatory}
                  onChange={(e) => setCfgMandatory(e.target.checked)}
                  className="rounded border-stone-300 text-red-800"
                />
                {tr('Bài tập bắt buộc', 'Mandatory homework')}
              </label>
            )}
          </div>

          <div>
            <label className="block font-bold text-stone-800">
              {tr('Tên bài tập:', 'Homework title:')}
            </label>
            <input
              type="text"
              data-testid="homework-config-title-input"
              value={cfgTitle}
              onChange={(e) => setCfgTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="block font-bold text-stone-800">
              {tr('Hướng dẫn / Yêu cầu cụ thể:', 'Instructions / Specific requirements:')}
            </label>
            <textarea
              rows={3}
              data-testid="homework-config-instructions-input"
              value={cfgInstructions}
              onChange={(e) => setCfgInstructions(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <div>
              <label className="block font-bold text-stone-800">
                {tr('Trang SGK/SBT liên quan:', 'Textbook/Workbook pages:')}
              </label>
              <input
                type="text"
                value={cfgRelatedPages}
                onChange={(e) => setCfgRelatedPages(e.target.value)}
                placeholder={tr('VD: SGK trang 17 • SBT trang 11', 'e.g. TB p.17 • WB p.11')}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-800">
                {tr('Số file tối đa:', 'Max files:')}
              </label>
              <input
                type="number"
                min={1}
                max={10}
                value={cfgMaxFiles}
                onChange={(e) => setCfgMaxFiles(Number(e.target.value) || 3)}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-800">
                {tr('Hạn nộp (tùy chọn):', 'Deadline (optional):')}
              </label>
              <input
                type="text"
                value={cfgDeadline}
                onChange={(e) => setCfgDeadline(e.target.value)}
                placeholder={tr('VD: Trước buổi học tiếp theo', 'e.g. Before next class')}
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <span className="block font-bold text-stone-800">
              {tr('Hình thức nộp được phép:', 'Allowed submission formats:')}
            </span>
            <div className="mt-1 flex flex-wrap gap-2">
              {(['audio', 'image', 'pdf', 'video', 'text'] as const).map((t) => (
                <label
                  key={t}
                  className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1"
                >
                  <input
                    type="checkbox"
                    checked={cfgAllowedTypes.includes(t)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setCfgAllowedTypes((prev) => Array.from(new Set([...prev, t])));
                      } else {
                        setCfgAllowedTypes((prev) => prev.filter((x) => x !== t));
                      }
                    }}
                  />
                  <span>{allowedTypeLabels[t]}</span>
                </label>
              ))}
            </div>
          </div>

          {configError && (
            <div
              data-testid="homework-config-error"
              className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 p-2.5 text-xs font-semibold text-red-900"
            >
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              <span>{configError}</span>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setIsEditingConfig(false)}
              className="rounded-lg border border-stone-300 bg-white px-3 py-1.5 font-semibold text-stone-700"
            >
              {tr('Hủy', 'Cancel')}
            </button>
            <button
              type="submit"
              data-testid="homework-config-save-btn"
              disabled={isSavingConfig}
              className="rounded-lg bg-red-800 px-3.5 py-1.5 font-bold text-white hover:bg-red-900"
            >
              {isSavingConfig
                ? tr('Đang lưu...', 'Saving...')
                : tr('Lưu yêu cầu bài tập', 'Save Homework Settings')}
            </button>
          </div>
        </form>
      )}

      {/* Case 1 vs Case 2 Requirements Section */}
      {isAssigned ? (
        <div
          data-testid="homework-requirements-card"
          className="mt-3 rounded-xl border border-stone-200 bg-stone-50/80 p-3 text-xs"
        >
          <p className="font-bold text-stone-900">
            {tr('Yêu cầu bài tập cần hoàn thành:', 'Homework instructions:')}
          </p>
          <p
            data-testid="homework-instructions-text"
            className="mt-1 whitespace-pre-line leading-relaxed text-stone-700"
          >
            {effectiveAssignment.instructions}
          </p>

          <div className="mt-2.5 flex flex-wrap items-center gap-2 pt-2 border-t border-stone-200/70 text-[11px] text-stone-600">
            {effectiveAssignment.relatedPages && (
              <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-semibold text-stone-800 border border-stone-200">
                <BookOpen className="h-3 w-3 text-red-800" />
                {effectiveAssignment.relatedPages}
              </span>
            )}
            <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-medium text-stone-700 border border-stone-200">
              {tr(
                `Tối đa ${effectiveAssignment.maxFiles || 3} tệp`,
                `Max ${effectiveAssignment.maxFiles || 3} files`
              )}
            </span>
            {effectiveAssignment.deadline && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-900 border border-amber-200">
                <Calendar className="h-3 w-3 text-amber-700" />
                {tr('Hạn nộp:', 'Due:')} {effectiveAssignment.deadline}
              </span>
            )}
          </div>

          {Array.isArray(effectiveAssignment.allowedTypes) &&
            effectiveAssignment.allowedTypes.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-stone-500">
                  {tr('Cần nộp:', 'Accepted:')}
                </span>
                {effectiveAssignment.allowedTypes.map((typeKey) => (
                  <span
                    key={typeKey}
                    className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-900 border border-red-200/70"
                  >
                    {allowedTypeLabels[typeKey] || typeKey}
                  </span>
                ))}
              </div>
            )}

          {effectiveAssignment.completionCriteria && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-stone-600">
              <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <span>
                <strong>{tr('Tiêu chí hoàn thành:', 'Completion criteria:')}</strong>{' '}
                {effectiveAssignment.completionCriteria}
              </span>
            </p>
          )}
        </div>
      ) : (
        <div
          data-testid="homework-unassigned-notice"
          className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3.5 text-xs"
        >
          <p className="font-bold text-stone-900">
            {tr('Chưa có bài tập cần nộp cho bài này.', 'No homework required for this lesson.')}
          </p>
          <p className="mt-1 leading-relaxed text-stone-600">
            {effectiveAssignment.instructions ||
              tr(
                'Mục này là video hướng dẫn / chữa bài tập. Học viên tự đối chiếu đáp án và ôn luyện theo tài liệu đính kèm, không bắt buộc nộp bài.',
                'This video is a guided walkthrough / exercise review. Check your answers and practice with attached materials — no submission required.'
              )}
          </p>
          {!voluntaryOpen && !existingSubmission && (
            <button
              type="button"
              data-testid="homework-optional-submit-toggle-btn"
              onClick={() => setVoluntaryOpen(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <Mic className="h-3.5 w-3.5 text-red-800" />
              {tr(
                'Gửi bản thu âm / ảnh luyện tập thêm cho giáo viên (Tự chọn)',
                'Send extra practice audio / photo to teacher (Optional)'
              )}
            </button>
          )}
        </div>
      )}

      {/* Existing Graded / Submitted Card */}
      {existingSubmission && (
        <div
          data-testid="homework-submitted-summary-card"
          className="mt-3 rounded-xl border border-stone-200 bg-stone-50 p-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-stone-800">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
              <span>{tr('Đã nộp:', 'Submitted:')} {formatChatTimestamp(existingSubmission.submitted_at)}</span>
            </div>
            {submittedFileUrl && (
              <a
                data-testid="homework-submitted-file-link"
                href={submittedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-red-800 underline hover:text-red-950"
              >
                {tr('Xem / Tải bài làm', 'View / Download')} ({existingSubmission.attachments?.[0]?.title || tr('Tệp đã nộp', 'Submitted file')})
              </a>
            )}
          </div>

          {isSubmittedAudio && (
            <div className="mt-2">
              <audio
                data-testid="homework-submitted-audio-player"
                controls
                preload="metadata"
                src={submittedFileUrl}
                className="h-9 w-full max-w-sm"
              />
            </div>
          )}

          {isSubmittedImage && (
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <img
                data-testid="homework-submitted-image-preview"
                src={submittedFileUrl}
                alt={tr('Ảnh bài tập đã nộp', 'Submitted homework image')}
                onClick={() =>
                  setActiveLightboxAttachment({
                    name: existingSubmission.attachments?.[0]?.title || tr('Ảnh bài tập đã nộp', 'Submitted homework image'),
                    url: submittedFileUrl,
                    kind: 'image',
                  })
                }
                className="max-h-48 cursor-zoom-in rounded-lg border border-stone-200 object-contain transition-opacity hover:opacity-90"
              />
              <button
                type="button"
                data-testid="homework-submitted-image-zoom-btn"
                onClick={() =>
                  setActiveLightboxAttachment({
                    name: existingSubmission.attachments?.[0]?.title || tr('Ảnh bài tập đã nộp', 'Submitted homework image'),
                    url: submittedFileUrl,
                    kind: 'image',
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
              >
                <ZoomIn className="h-3.5 w-3.5 text-red-800" />
                {tr('Phóng to ảnh', 'Zoom image')}
              </button>
            </div>
          )}

          {existingSubmission.student_note && (
            <p className="mt-2 rounded-lg border border-stone-200/80 bg-white p-2 text-xs text-stone-700">
              <strong>{tr('Ghi chú của học viên:', 'Student note:')}</strong> {existingSubmission.student_note}
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
                  {tr('Nhận xét của giáo viên', 'Teacher Feedback')}
                </span>
                {existingSubmission.score !== null && existingSubmission.score !== undefined && (
                  <span
                    data-testid="homework-score-badge"
                    className="rounded-lg bg-emerald-700 px-2.5 py-0.5 font-display text-xs font-bold text-white shadow-2xs"
                  >
                    {tr('Điểm:', 'Score:')} {existingSubmission.score} / 10
                  </span>
                )}
              </div>
              <p
                data-testid="homework-feedback-text"
                className="mt-1 text-xs leading-relaxed font-medium text-stone-800"
              >
                {existingSubmission.teacher_feedback || tr('Giáo viên đã chấm bài.', 'Graded by teacher.')}
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
                {tr('Nộp bổ sung / Nộp lại', 'Add / Resubmit')}
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
                submitLabel={tr('Dùng bản thu này', 'Use This Recording')}
                onRecordingStateChange={(active) => setIsRecorderActive(active)}
                onClearRecording={() => setSelectedFile(null)}
                onCancel={() => {
                  setSelectedFile(null);
                  setIsRecorderActive(false);
                  setShowRecorder(false);
                }}
                onRecordingReady={(blob, durationSec, previewUrl) => {
                  attachVoiceRecording(blob, durationSec, previewUrl);
                  setIsRecorderActive(false);
                }}
                onSendVoice={(blob, durationSec, previewUrl) => {
                  attachVoiceRecording(blob, durationSec, previewUrl);
                  setIsRecorderActive(false);
                  setShowRecorder(false);
                }}
              />
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
                <button
                  type="button"
                  data-testid="homework-start-record-btn"
                  onClick={() => {
                    setSubmitError(null);
                    setShowRecorder(true);
                  }}
                  className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-900 transition-colors hover:bg-red-100"
                >
                  <Mic className="h-4 w-4 shrink-0 text-red-700" />
                  <span>
                    {selectedFile
                      ? tr('Thu âm lại', 'Re-record')
                      : tr('Thu âm giọng đọc', 'Record Voice')}
                  </span>
                </button>

                <input
                  ref={fileInputRef}
                  type="file"
                  data-testid="homework-file-input"
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
                  <span>
                    {selectedFile
                      ? tr('Đổi tệp / ảnh khác', 'Change File / Image')
                      : tr('Chọn ảnh / PDF / audio', 'Choose Image / PDF / Audio')}
                  </span>
                </button>
              </div>
            )}

            {/* Selected File Preview */}
            {selectedFile && (
              <div
                data-testid="homework-selected-file-card"
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-200 bg-emerald-50/70 p-2.5"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  {selectedFile.mimeType.startsWith('image/') && selectedFile.previewUrl ? (
                    <img
                      src={selectedFile.previewUrl}
                      alt={selectedFile.name}
                      onClick={() =>
                        setActiveLightboxAttachment({
                          name: selectedFile.name,
                          url: selectedFile.previewUrl!,
                          kind: 'image',
                        })
                      }
                      className="h-12 w-12 shrink-0 cursor-zoom-in rounded-lg border border-emerald-300 object-cover"
                    />
                  ) : selectedFile.mimeType.startsWith('audio/') ? (
                    <FileAudio className="h-5 w-5 shrink-0 text-emerald-700" />
                  ) : selectedFile.mimeType.includes('pdf') ? (
                    <FileText className="h-5 w-5 shrink-0 text-red-800" />
                  ) : (
                    <ImageIcon className="h-5 w-5 shrink-0 text-emerald-700" />
                  )}
                  <div className="min-w-0">
                    <p className="truncate text-xs font-bold text-stone-900">{selectedFile.name}</p>
                    <p className="text-[11px] text-stone-600">
                      {formatFileSize(selectedFile.size)} • {selectedFile.mimeType} • {tr('Sẵn sàng nộp', 'Ready to submit')}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {selectedFile.previewUrl && selectedFile.mimeType.startsWith('audio/') && (
                    <audio
                      data-testid="homework-selected-audio-preview"
                      controls
                      src={selectedFile.previewUrl}
                      className="h-8 max-w-[180px]"
                    />
                  )}
                  <button
                    type="button"
                    data-testid="homework-remove-file-btn"
                    onClick={() => setSelectedFile(null)}
                    className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
                  >
                    <Trash2 className="h-3 w-3 text-red-700" />
                    {tr('Xóa tệp', 'Remove')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Student Note */}
          <div>
            <label
              htmlFor="homework-student-note"
              className="block text-xs font-bold text-stone-800"
            >
              {allowsTextOnly
                ? tr('Câu trả lời hoặc ghi chú gửi giáo viên:', 'Answer or note for your teacher:')
                : tr('Ghi chú kèm theo bài nộp (tùy chọn):', 'Note with submission (optional):')}
            </label>
            <textarea
              id="homework-student-note"
              data-testid="homework-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={tr(
                'Ghi chú bài thu âm, trang vở viết hoặc câu hỏi cần Lão sư giải đáp...',
                'Note on your recording, workbook pages, or questions for your teacher...'
              )}
              className="mt-1 w-full rounded-xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-900 placeholder:text-stone-400 focus:border-red-800 focus:bg-white focus:outline-none"
            />
          </div>

          {/* Submit CTA */}
          <div className="flex items-center justify-end gap-2 pb-1">
            {(isRevising || (!isAssigned && voluntaryOpen)) && (
              <button
                type="button"
                onClick={() => {
                  setIsRevising(false);
                  setVoluntaryOpen(false);
                }}
                className="min-h-[40px] rounded-xl border border-stone-300 px-3 py-2 text-xs font-semibold text-stone-600 hover:bg-stone-100"
              >
                {tr('Hủy', 'Cancel')}
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
                  <span>{tr('Đang tải tệp & lưu bài nộp...', 'Uploading & saving...')}</span>
                </>
              ) : (
                <>
                  <Send className="h-3.5 w-3.5" />
                  <span>{tr('Nộp bài tập', 'Submit Homework')}</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};
