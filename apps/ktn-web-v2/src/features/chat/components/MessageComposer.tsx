import React, { useState, useRef } from 'react';
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
import { ChatAttachment, ChatMessage, SendMessageInput } from '../types/chat.types';
import { VoiceRecorder } from './VoiceRecorder';
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

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const dlpCheck = detectDlpViolation(draft);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 15 * 1024 * 1024) {
      addToast({
        title: 'Tệp quá lớn',
        description: 'Vui lòng chọn ảnh hoặc tài liệu nhỏ hơn 15MB.',
        variant: 'error',
      });
      return;
    }

    const isImage = file.type.startsWith('image/');
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : URL.createObjectURL(file);
      setStagedAttachment({
        kind: isImage ? 'image' : 'pdf',
        name: file.name,
        url: dataUrl,
        sizeLabel: formatFileSize(file.size),
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const trimmed = draft.trim();
    if (!trimmed && !stagedAttachment) return;

    if (dlpCheck.blocked) {
      addToast({
        title: 'Bảo vệ an toàn lớp học (DLP)',
        description: dlpCheck.reason || 'Không được gửi số điện thoại hoặc liên kết ngoài.',
        variant: 'warning',
      });
      return;
    }

    const messageText =
      trimmed ||
      (stagedAttachment?.kind === 'image'
        ? `[Đã gửi ảnh: ${stagedAttachment.name}]`
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
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-stone-200 bg-white px-3.5 py-2.5">
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
        <div className="mb-2 flex items-center justify-between gap-3 rounded-xl border border-stone-200 bg-stone-50 px-3 py-2">
          <div className="flex min-w-0 items-center gap-2.5">
            {stagedAttachment.kind === 'image' ? (
              <img
                src={stagedAttachment.url}
                alt={stagedAttachment.name}
                className="h-10 w-10 rounded-lg object-cover border border-stone-200"
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
              const persistentUrl = await new Promise<string>((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve(String(reader.result || previewUrl));
                reader.onerror = () => resolve(previewUrl);
                reader.readAsDataURL(blob);
              });
              await onSend({
                roomId,
                classCode,
                content: `🎤 Bản thu âm luyện nói tiếng Trung (${durationSec} giây)`,
                attachment: {
                  kind: 'audio',
                  name: `Thu-am-${classCode || 'KTN'}-${Date.now()}.wav`,
                  url: persistentUrl,
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
              accept="image/*,.pdf,.doc,.docx"
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
              disabled={(!draft.trim() && !stagedAttachment) || dlpCheck.blocked}
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
