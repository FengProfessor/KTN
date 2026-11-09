import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  Mic,
  Smile,
  X,
  Reply,
  ShieldAlert,
  Image as ImageIcon,
  FileText,
  Loader2,
} from 'lucide-react';
import { AttachmentKind, ChatAttachment, ChatMessage, SendMessageInput } from '../types/chat.types';
import {
  VoiceRecorder,
  getAudioExtensionFromMime,
  normalizeAudioMimeType,
} from './VoiceRecorder';
import { detectDlpViolation, formatFileSize } from '@/lib/utils';
import { useUiStore } from '@/stores/useUiStore';

const COMPOSER_EMOJIS = ['👋', '👍', '❤️', '🎉', '🙏', '🌟', '🐼', '📚'];

interface MessageComposerProps {
  roomId: string;
  classCode?: string;
  replyingTo: ChatMessage | null;
  isSending: boolean;
  onClearReply: () => void;
  onSend: (input: SendMessageInput) => Promise<unknown>;
}

export const MessageComposer: React.FC<MessageComposerProps> = ({
  roomId,
  classCode,
  replyingTo,
  isSending,
  onClearReply,
  onSend,
}) => {
  const draft = useUiStore((s) => s.draftByRoom[roomId] ?? s.getRoomDraft(roomId));
  const setRoomDraft = useUiStore((s) => s.setRoomDraft);
  const addToast = useUiStore((s) => s.addToast);

  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [stagedAttachment, setStagedAttachment] = useState<ChatAttachment | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const submittingRef = useRef<boolean>(false);

  const dlpCheck = detectDlpViolation(draft);

  useEffect(() => {
    const onProgress = (e: Event) => {
      const detail = (e as CustomEvent<{ fileName: string; percent: number }>).detail;
      if (detail && typeof detail.percent === 'number') {
        setUploadProgress({ fileName: detail.fileName || 'Tệp đính kèm', percent: detail.percent });
      }
    };
    window.addEventListener('ktn:chat-upload-progress', onProgress);
    return () => {
      window.removeEventListener('ktn:chat-upload-progress', onProgress);
    };
  }, []);

  useEffect(() => {
    if (!isSending) {
      setUploadProgress(null);
    }
  }, [isSending]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 100 * 1024 * 1024) {
      addToast({
        title: 'Tệp quá lớn',
        description: 'Vui lòng chọn ảnh, âm thanh, video hoặc tài liệu nhỏ hơn 100MB.',
        variant: 'error',
      });
      e.target.value = '';
      return;
    }

    const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|gif|bmp|heic)$/i.test(file.name);
    const isAudio = file.type.startsWith('audio/') || /\.(wav|mp3|m4a|ogg|aac)$/i.test(file.name);
    const isVideo = file.type.startsWith('video/') || /\.(mp4|mov|m4v|webm)$/i.test(file.name);
    const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
    const kind: AttachmentKind = isImage
      ? 'image'
      : isAudio
      ? 'audio'
      : isVideo
      ? 'video'
      : isPdf
      ? 'pdf'
      : 'file';

    const blobUrl = URL.createObjectURL(file);
    setStagedAttachment({
      kind,
      name: file.name,
      url: blobUrl,
      sizeLabel: formatFileSize(file.size),
      file,
      mimeType: file.type || undefined,
      sizeBytes: file.size,
    });
    e.target.value = '';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (submittingRef.current || isSending) return;

    const latestStoreDraft = useUiStore.getState().getRoomDraft(roomId);
    const effectiveDraft = latestStoreDraft !== undefined ? latestStoreDraft : draft;
    const trimmed = effectiveDraft.trim();
    if (!trimmed && !stagedAttachment) return;

    if (dlpCheck.blocked) {
      addToast({
        title: 'Bảo vệ an toàn lớp học (DLP)',
        description: dlpCheck.reason || 'Không được gửi số điện thoại hoặc liên kết ngoài.',
        variant: 'warning',
      });
      return;
    }

    submittingRef.current = true;

    const messageText =
      trimmed ||
      (stagedAttachment?.kind === 'image'
        ? `[Đã gửi ảnh: ${stagedAttachment.name}]`
        : stagedAttachment?.kind === 'video'
        ? `[Đã gửi video: ${stagedAttachment.name}]`
        : `[Đã đính kèm tệp: ${stagedAttachment?.name}]`);

    const attachmentToSend = stagedAttachment || null;
    const replyData = replyingTo
      ? {
          id: replyingTo.id,
          senderName: replyingTo.sender_name,
          content: replyingTo.content,
        }
      : null;

    setRoomDraft(roomId, '');
    setStagedAttachment(null);
    onClearReply();
    setShowEmojiBar(false);

    try {
      await onSend({
        roomId,
        classCode,
        content: messageText,
        attachment: attachmentToSend,
        replyTo: replyData,
      });
    } catch {
      // Handled inside useSendMessage (retains draft & adds failed message bubble with retry button)
    } finally {
      submittingRef.current = false;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (submittingRef.current || isSending) return;
      void handleSubmit();
    }
  };

  return (
    <div className="border-t border-stone-200 bg-white px-3.5 py-2.5">
      {/* Upload Progress Banner */}
      {isSending && uploadProgress && (
        <div
          data-testid="chat-upload-progress"
          className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-red-200 bg-red-50/70 px-3 py-1.5 text-xs text-red-900"
        >
          <span className="flex min-w-0 items-center gap-1.5 font-semibold truncate">
            <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-red-700" />
            <span className="truncate">Đang tải lên S3: {uploadProgress.fileName}</span>
          </span>
          <span className="shrink-0 font-bold text-red-800">{uploadProgress.percent}%</span>
        </div>
      )}

      {/* DLP Warning Banner */}
      {dlpCheck.blocked && (
        <div
          data-testid="chat-dlp-warning"
          role="alert"
          className="mb-2 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-medium text-amber-900"
        >
          <ShieldAlert className="h-4 w-4 shrink-0 text-amber-700" />
          <span>{dlpCheck.reason}</span>
        </div>
      )}

      {/* Reply Quote Preview */}
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border-l-4 border-red-800 bg-stone-100 px-3 py-1.5 text-xs">
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-1 font-bold text-red-900">
              <Reply className="h-3 w-3" />
              Đang trả lời {replyingTo.sender_name}
            </p>
            <p className="truncate text-stone-600">{replyingTo.content}</p>
          </div>
          <button
            type="button"
            onClick={onClearReply}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-200 hover:text-stone-800"
            aria-label="Hủy trả lời"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Staged Attachment Preview */}
      {stagedAttachment && (
        <div
          data-testid="composer-staged-attachment"
          className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2.5">
            {stagedAttachment.kind === 'image' ? (
              <img
                src={stagedAttachment.url}
                alt={stagedAttachment.name}
                onClick={() => useUiStore.getState().setActiveLightboxAttachment(stagedAttachment)}
                className="h-10 w-10 cursor-zoom-in rounded-lg object-cover border border-stone-200 hover:opacity-90"
              />
            ) : (
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-red-800 text-white">
                <FileText className="h-5 w-5" />
              </div>
            )}
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-stone-900">
                {stagedAttachment.name}
              </p>
              <p className="text-[11px] text-stone-500">
                {stagedAttachment.sizeLabel} • Sẵn sàng gửi
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setStagedAttachment(null)}
            className="rounded-lg p-1 text-stone-500 hover:bg-stone-200"
            aria-label="Xóa tệp đính kèm"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Voice Recorder Mode */}
      {showVoiceRecorder ? (
        <VoiceRecorder
          onCancel={() => setShowVoiceRecorder(false)}
          onSendVoice={async (blob, durationSec, previewUrl) => {
            setShowVoiceRecorder(false);
            try {
              const cleanMime = normalizeAudioMimeType(blob.type);
              const ext = getAudioExtensionFromMime(cleanMime);
              const fileName = `Thu-am-${classCode || 'KTN'}-${Date.now()}.${ext}`;
              const persistentUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || previewUrl));
                reader.onerror = () => resolve(previewUrl);
                reader.readAsDataURL(blob);
              });
              const audioFile = new File([blob], fileName, { type: cleanMime });
              await onSend({
                roomId,
                classCode,
                content: `🎤 Bản thu âm luyện nói tiếng Trung (${durationSec} giây)`,
                attachment: {
                  kind: 'audio',
                  name: fileName,
                  url: persistentUrl,
                  file: persistentUrl.length > 180 * 1024 ? audioFile : undefined,
                  mimeType: cleanMime,
                  sizeBytes: audioFile.size,
                  sizeLabel: formatFileSize(audioFile.size),
                  durationSec,
                },
              });
            } catch {
              // Handled in useSendMessage
            }
          }}
        />
      ) : (
        <>
          {/* Quick Emoji Picker Bar */}
          {showEmojiBar && (
            <div className="mb-2 flex flex-wrap items-center gap-1.5 rounded-xl border border-stone-200 bg-stone-50 px-2.5 py-1.5">
              {COMPOSER_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setRoomDraft(roomId, `${draft}${emoji}`)}
                  className="rounded-lg p-1.5 text-base transition-transform hover:scale-110 hover:bg-white"
                >
                  {emoji}
                </button>
              ))}
            </div>
          )}

          {/* Composer Row */}
          <form onSubmit={handleSubmit} className="flex items-end gap-1.5 sm:gap-2">
            <input
              ref={fileInputRef}
              type="file"
              data-testid="chat-file-input"
              accept="image/*,audio/*,video/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.txt"
              onChange={handleFileChange}
              className="hidden"
            />

            <div className="flex shrink-0 items-center gap-0.5 pb-0.5">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-100 hover:text-red-800"
                title="Đính kèm ảnh hoặc bài tập PDF"
                aria-label="Đính kèm ảnh hoặc bài tập PDF"
              >
                <ImageIcon className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="hidden sm:inline-flex h-9 w-9 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-stone-100 hover:text-red-800"
                title="Đính kèm tệp tài liệu"
                aria-label="Đính kèm tệp tài liệu"
              >
                <Paperclip className="h-4 w-4" />
              </button>

              <button
                type="button"
                data-testid="open-voice-recorder-btn"
                onClick={() => setShowVoiceRecorder(true)}
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl text-stone-600 transition-colors hover:bg-red-50 hover:text-red-800"
                title="Ghi âm giọng nói tiếng Trung"
                aria-label="Ghi âm giọng nói tiếng Trung"
              >
                <Mic className="h-4 w-4" />
              </button>

              <button
                type="button"
                onClick={() => setShowEmojiBar((prev) => !prev)}
                className={`inline-flex h-9 w-9 items-center justify-center rounded-xl transition-colors ${
                  showEmojiBar
                    ? 'bg-amber-100 text-amber-800'
                    : 'text-stone-600 hover:bg-stone-100 hover:text-stone-900'
                }`}
                title="Chèn biểu tượng cảm xúc"
                aria-label="Chèn biểu tượng cảm xúc"
              >
                <Smile className="h-4 w-4" />
              </button>
            </div>

            <div className="relative flex-1">
              <textarea
                rows={1}
                data-testid="chat-composer-input"
                value={draft}
                onChange={(e) => setRoomDraft(roomId, e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={`Nhắn tới ${classCode || roomId}...`}
                className="max-h-24 min-h-[38px] w-full resize-none rounded-2xl border border-stone-200 bg-stone-50 px-3 py-2 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:border-red-800 focus:bg-white focus:outline-none"
              />
            </div>

            <button
              type="submit"
              data-testid="chat-send-btn"
              disabled={isSending || (!draft.trim() && !stagedAttachment) || dlpCheck.blocked}
              className="inline-flex h-[38px] shrink-0 items-center justify-center gap-1 rounded-2xl bg-red-800 px-3.5 text-xs font-bold text-white shadow-2xs transition-all hover:bg-red-900 disabled:cursor-not-allowed disabled:opacity-45"
            >
              {isSending ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-3.5 w-3.5" />
              )}
              <span className="hidden sm:inline">Gửi</span>
            </button>
          </form>
        </>
      )}
    </div>
  );
};
