import React, { useState } from 'react';
import { FileText, Download, Maximize2, X, Volume2 } from 'lucide-react';
import { ChatAttachment } from '../types/chat.types';

interface AttachmentPreviewProps {
  attachment: ChatAttachment | null | undefined;
  isOwn?: boolean;
}

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  isOwn,
}) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (!attachment || !attachment.url) return null;

  const isImage =
    attachment.kind === 'image' ||
    /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(attachment.url);

  const isAudio =
    attachment.kind === 'audio' ||
    /\.(webm|mp3|wav|ogg|m4a)(\?|$)/i.test(attachment.url);

  if (isImage) {
    return (
      <>
        <div className="mt-1.5 overflow-hidden rounded-xl border border-black/10 bg-stone-100">
          <div className="group relative max-h-60 max-w-xs cursor-pointer overflow-hidden">
            <img
              src={attachment.url}
              alt={attachment.name || 'Ảnh đính kèm'}
              className="max-h-60 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
              onClick={() => setLightboxOpen(true)}
            />
            <button
              type="button"
              onClick={() => setLightboxOpen(true)}
              className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-medium text-white opacity-90 backdrop-blur-sm transition-opacity group-hover:opacity-100"
            >
              <Maximize2 className="h-3 w-3" />
              Phóng to
            </button>
          </div>
        </div>

        {lightboxOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 p-4 backdrop-blur-sm"
            onClick={() => setLightboxOpen(false)}
          >
            <div
              className="relative max-h-[90vh] max-w-4xl overflow-hidden rounded-2xl bg-stone-950 p-2 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setLightboxOpen(false)}
                className="absolute right-4 top-4 z-10 rounded-full bg-black/70 p-2 text-white hover:bg-black"
                aria-label="Đóng xem ảnh"
              >
                <X className="h-5 w-5" />
              </button>
              <img
                src={attachment.url}
                alt={attachment.name || 'Ảnh phóng to'}
                className="max-h-[82vh] w-auto rounded-xl object-contain"
              />
              <div className="mt-2 flex items-center justify-between px-2 py-1 text-xs text-stone-300">
                <span>{attachment.name || 'Ảnh đính kèm lớp học'}</span>
                <a
                  href={attachment.url}
                  download={attachment.name || 'ktn-image.png'}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 font-medium text-white hover:bg-white/20"
                >
                  <Download className="h-3.5 w-3.5" />
                  Tải ảnh
                </a>
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  if (isAudio) {
    return (
      <div
        data-testid="chat-audio-attachment"
        className={`mt-1.5 flex min-w-0 max-w-full flex-col gap-1.5 overflow-hidden rounded-xl border p-2 ${
          isOwn
            ? 'border-red-300/60 bg-white/80 text-stone-900'
            : 'border-stone-200 bg-stone-50 text-stone-900'
        }`}
      >
        <div className="flex min-w-0 items-center gap-1.5 text-xs font-semibold text-red-900">
          <Volume2 className="h-3.5 w-3.5 shrink-0 text-red-700" />
          <span className="min-w-0 flex-1 truncate">
            {attachment.name || 'Bản thu âm luyện nói tiếng Trung'}
          </span>
          {attachment.durationSec ? (
            <span className="shrink-0 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-800">
              {attachment.durationSec}s
            </span>
          ) : null}
        </div>
        <audio
          data-testid="chat-audio-player"
          controls
          preload="metadata"
          src={attachment.url}
          className="h-8 w-full max-w-[210px] sm:max-w-[260px]"
        />
      </div>
    );
  }

  return (
    <a
      href={attachment.url}
      target="_blank"
      rel="noreferrer"
      download={attachment.name}
      className={`mt-1.5 flex items-center gap-3 rounded-xl border p-2.5 transition-colors ${
        isOwn
          ? 'border-red-300/60 bg-white/90 hover:bg-white'
          : 'border-stone-200 bg-stone-50 hover:bg-stone-100'
      }`}
    >
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-800 text-white">
        <FileText className="h-5 w-5" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-semibold text-stone-900">
          {attachment.name || 'Tài liệu đính kèm.pdf'}
        </p>
        <p className="text-[11px] text-stone-500">
          {attachment.sizeLabel || 'PDF / Tài liệu học tập'}
        </p>
      </div>
      <Download className="h-4 w-4 shrink-0 text-stone-500" />
    </a>
  );
};
