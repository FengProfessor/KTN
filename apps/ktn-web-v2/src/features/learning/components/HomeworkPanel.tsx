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

const ALLOWED_TYPE_LABELS: Record<string, string> = {
  audio: '🎤 Thu âm giọng đọc',
  image: '📷 Ảnh chụp vở viết / SBT',
  pdf: '📄 Tệp PDF',
  video: '🎬 Video ngắn',
  text: '✍️ Trả lời bằng chữ',
};

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
      title: `Bài tập ${lessonTitle}`,
      instructions: `Hoàn thành bài luyện tập của ${lessonTitle}: thu âm đọc bài khóa hoặc chụp ảnh vở viết / sách bài tập gửi giáo viên nhận xét.`,
      relatedPages: null,
      allowedTypes: ['audio', 'image', 'pdf', 'text'],
      maxFiles: 3,
      deadline: null,
      completionCriteria: 'Nộp tệp thu âm rõ tiếng hoặc ảnh bài viết rõ nét.',
    };

  const isAssigned = effectiveAssignment.assigned !== false;
  const allowsTextOnly = Boolean(effectiveAssignment.allowedTypes?.includes('text'));
  const status = existingSubmission?.status || 'not_submitted';

  const openConfigEditor = () => {
    setCfgAssigned(effectiveAssignment.assigned !== false);
    setCfgMandatory(effectiveAssignment.mandatory !== false);
    setCfgTitle(effectiveAssignment.title || `Bài tập ${lessonTitle}`);
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
        title: cfgTitle.trim() || `Bài tập ${lessonTitle}`,
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
          title: cfgTitle.trim() || `Bài tập ${lessonTitle}`,
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
            : 'Không thể lưu cấu hình bài tập. Vui lòng kiểm tra quyền truy cập của tài khoản.'
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
      setSubmitError('Tệp vừa chọn bị rỗng (0 byte). Vui lòng chọn tệp hợp lệ.');
      e.target.value = '';
      return;
    }
    if (file.size > 50 * 1024 * 1024) {
      setSubmitError('Tệp vượt quá giới hạn 50MB. Vui lòng chọn tệp nhỏ hơn.');
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
        'Em đang mở khung thu âm. Vui lòng bấm "Dừng thu" để hoàn tất bản thu trước khi bấm Nộp bài tập.'
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
              : 'Chưa nộp được câu trả lời. Vui lòng kiểm tra kết nối và thử lại.'
          );
        }
        return;
      }

      setSubmitError(
        'Vui lòng thu âm giọng đọc hoặc chọn tệp bài làm thật (ảnh vở viết, âm thanh, PDF) trước khi nhấn Nộp bài.'
      );
      return;
    }

    try {
      await onSubmitHomework({
        file: fileToUpload,
        fileName: fileNameToUpload,
        note: note.trim() || `Nộp bài tập ${lessonTitle}`,
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
          : 'Chưa nộp được bài tập do lỗi kết nối. Tệp/bản thu âm của em vẫn được giữ nguyên trên máy để thử lại.'
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
          Cần bổ sung theo nhận xét giáo viên
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
          Đã nộp • Chờ giáo viên chấm
        </span>
      );
    }
    if (!isAssigned) {
      return (
        <span
          data-testid="homework-status-optional"
          className="inline-flex items-center gap-1.5 rounded-full bg-stone-100 px-3 py-1 text-xs font-semibold text-stone-700"
        >
          Tự luyện tập (Không bắt buộc nộp)
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
              Bài tập • {classCode || 'Khóa học Video'}
            </span>
            {isAssigned && effectiveAssignment.mandatory !== false && (
              <span className="rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-900">
                Bắt buộc
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
              <span>Cấu hình bài tập</span>
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
              Thiết lập yêu cầu bài tập cho bài học này
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
              Có giao bài tập cần nộp
            </label>

            {cfgAssigned && (
              <label className="inline-flex items-center gap-1.5 font-semibold text-stone-800">
                <input
                  type="checkbox"
                  checked={cfgMandatory}
                  onChange={(e) => setCfgMandatory(e.target.checked)}
                  className="rounded border-stone-300 text-red-800"
                />
                Bài tập bắt buộc
              </label>
            )}
          </div>

          <div>
            <label className="block font-bold text-stone-800">Tên bài tập:</label>
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
              Hướng dẫn / Yêu cầu cụ thể:
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
              <label className="block font-bold text-stone-800">Trang SGK/SBT liên quan:</label>
              <input
                type="text"
                value={cfgRelatedPages}
                onChange={(e) => setCfgRelatedPages(e.target.value)}
                placeholder="VD: SGK trang 17 • SBT trang 11"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block font-bold text-stone-800">Số file tối đa:</label>
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
              <label className="block font-bold text-stone-800">Hạn nộp (tùy chọn):</label>
              <input
                type="text"
                value={cfgDeadline}
                onChange={(e) => setCfgDeadline(e.target.value)}
                placeholder="VD: Trước buổi học tiếp theo"
                className="mt-1 w-full rounded-lg border border-stone-300 bg-white px-2.5 py-1.5 text-xs"
              />
            </div>
          </div>

          <div>
            <span className="block font-bold text-stone-800">Hình thức nộp được phép:</span>
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
                  <span>{ALLOWED_TYPE_LABELS[t]}</span>
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
              Hủy
            </button>
            <button
              type="submit"
              data-testid="homework-config-save-btn"
              disabled={isSavingConfig}
              className="rounded-lg bg-red-800 px-3.5 py-1.5 font-bold text-white hover:bg-red-900"
            >
              {isSavingConfig ? 'Đang lưu...' : 'Lưu yêu cầu bài tập'}
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
          <p className="font-bold text-stone-900">Yêu cầu bài tập cần hoàn thành:</p>
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
              Tối đa {effectiveAssignment.maxFiles || 3} tệp
            </span>
            {effectiveAssignment.deadline && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 font-semibold text-amber-900 border border-amber-200">
                <Calendar className="h-3 w-3 text-amber-700" />
                Hạn nộp: {effectiveAssignment.deadline}
              </span>
            )}
          </div>

          {Array.isArray(effectiveAssignment.allowedTypes) &&
            effectiveAssignment.allowedTypes.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-semibold text-stone-500">Cần nộp:</span>
                {effectiveAssignment.allowedTypes.map((typeKey) => (
                  <span
                    key={typeKey}
                    className="rounded-full bg-red-50 px-2.5 py-0.5 text-[11px] font-semibold text-red-900 border border-red-200/70"
                  >
                    {ALLOWED_TYPE_LABELS[typeKey] || typeKey}
                  </span>
                ))}
              </div>
            )}

          {effectiveAssignment.completionCriteria && (
            <p className="mt-2 flex items-start gap-1.5 text-[11px] text-stone-600">
              <CheckSquare className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-700" />
              <span>
                <strong>Tiêu chí hoàn thành:</strong> {effectiveAssignment.completionCriteria}
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
            Chưa có bài tập cần nộp cho bài này.
          </p>
          <p className="mt-1 leading-relaxed text-stone-600">
            {effectiveAssignment.instructions ||
              'Mục này là video hướng dẫn / chữa bài tập. Học viên tự đối chiếu đáp án và ôn luyện theo tài liệu đính kèm, không bắt buộc nộp bài.'}
          </p>
          {!voluntaryOpen && !existingSubmission && (
            <button
              type="button"
              data-testid="homework-optional-submit-toggle-btn"
              onClick={() => setVoluntaryOpen(true)}
              className="mt-2.5 inline-flex items-center gap-1.5 rounded-lg border border-stone-300 bg-white px-3 py-1.5 text-xs font-semibold text-stone-700 hover:bg-stone-100"
            >
              <Mic className="h-3.5 w-3.5 text-red-800" />
              Gửi bản thu âm / ảnh luyện tập thêm cho giáo viên (Tự chọn)
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
              <span>Đã nộp: {formatChatTimestamp(existingSubmission.submitted_at)}</span>
            </div>
            {submittedFileUrl && (
              <a
                data-testid="homework-submitted-file-link"
                href={submittedFileUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-bold text-red-800 underline hover:text-red-950"
              >
                Xem / Tải bài làm ({existingSubmission.attachments?.[0]?.title || 'Tệp đã nộp'})
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
                alt="Ảnh bài tập đã nộp"
                onClick={() =>
                  setActiveLightboxAttachment({
                    name: existingSubmission.attachments?.[0]?.title || 'Ảnh bài tập đã nộp',
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
                    name: existingSubmission.attachments?.[0]?.title || 'Ảnh bài tập đã nộp',
                    url: submittedFileUrl,
                    kind: 'image',
                  })
                }
                className="inline-flex items-center gap-1 rounded-lg border border-stone-300 bg-white px-2.5 py-1 text-[11px] font-semibold text-stone-700 hover:bg-stone-100"
              >
                <ZoomIn className="h-3.5 w-3.5 text-red-800" />
                Phóng to ảnh
              </button>
            </div>
          )}

          {existingSubmission.student_note && (
            <p className="mt-2 rounded-lg border border-stone-200/80 bg-white p-2 text-xs text-stone-700">
              <strong>Ghi chú của học viên:</strong> {existingSubmission.student_note}
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
                  Nhận xét của giáo viên
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
                Nộp bổ sung / Nộp lại
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
                submitLabel="Dùng bản thu này"
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
                  <span>{selectedFile ? 'Thu âm lại' : 'Thu âm giọng đọc'}</span>
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
                  <span>{selectedFile ? 'Đổi tệp / ảnh khác' : 'Chọn ảnh / PDF / audio'}</span>
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
                      {formatFileSize(selectedFile.size)} • {selectedFile.mimeType} • Sẵn sàng nộp
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
                    Xóa tệp
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
                ? 'Câu trả lời hoặc ghi chú gửi giáo viên:'
                : 'Ghi chú kèm theo bài nộp (tùy chọn):'}
            </label>
            <textarea
              id="homework-student-note"
              data-testid="homework-note-input"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Ghi chú bài thu âm, trang vở viết hoặc câu hỏi cần Lão sư giải đáp..."
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
                  <span>Đang tải tệp & lưu bài nộp...</span>
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
