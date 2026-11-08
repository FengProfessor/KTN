import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  FileText,
  Download,
  Maximize2,
  X,
  Volume2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
} from 'lucide-react';
import { ChatAttachment } from '../types/chat.types';
import { resolveUploadedMediaUrl } from '@/services/api/ktnApiClient';
import { useUiStore } from '@/stores/useUiStore';

interface AttachmentPreviewProps {
  attachment: ChatAttachment | null | undefined;
  isOwn?: boolean;
}

export const ChatImageLightbox: React.FC = () => {
  const activeAttachment = useUiStore((s) => s.activeLightboxAttachment);
  const setActiveAttachment = useUiStore((s) => s.setActiveLightboxAttachment);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  useEffect(() => {
    setZoomLevel(1);
  }, [activeAttachment?.url]);

  useEffect(() => {
    if (!activeAttachment) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveAttachment(null);
      } else if (e.key === '+' || e.key === '=') {
        setZoomLevel((z) => Math.min(3, Number((z + 0.5).toFixed(2))));
      } else if (e.key === '-') {
        setZoomLevel((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))));
      } else if (e.key === '0') {
        setZoomLevel(1);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activeAttachment, setActiveAttachment]);

  if (!activeAttachment || !activeAttachment.url || typeof document === 'undefined') {
    return null;
  }

  const resolvedUrl = resolveUploadedMediaUrl(activeAttachment.url);

  return createPortal(
    <div
      id="ktn-chat-image-lightbox-portal"
      data-testid="chat-image-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={activeAttachment.name || 'Xem ảnh phóng to'}
      className="fixed inset-0 z-[99999] flex flex-col bg-black/90 backdrop-blur-sm"
      onClick={() => setActiveAttachment(null)}
    >
      {/* Top Control Bar */}
      <div
        className="flex flex-wrap items-center justify-between gap-2 border-b border-white/15 bg-stone-950/90 px-4 py-2.5 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs sm:text-sm font-bold text-white">
            {activeAttachment.name || 'Ảnh đính kèm lớp học'}
          </p>
          <p className="text-[11px] text-stone-400">
            Bấm vào ảnh hoặc dùng nút +/- để phóng to kiểm tra bài viết • Nhấn ESC để đóng
          </p>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            data-testid="lightbox-zoom-out-btn"
            onClick={() => setZoomLevel((z) => Math.max(0.75, Number((z - 0.25).toFixed(2))))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            title="Thu nhỏ"
          >
            <ZoomOut className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Thu nhỏ</span>
          </button>

          <button
            type="button"
            data-testid="lightbox-zoom-reset-btn"
            onClick={() => setZoomLevel(1)}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 font-mono text-xs font-bold text-amber-300 hover:bg-white/20"
            title="Đặt lại 100%"
          >
            <RotateCcw className="h-3 w-3" />
            {Math.round(zoomLevel * 100)}%
          </button>

          <button
            type="button"
            data-testid="lightbox-zoom-in-btn"
            onClick={() => setZoomLevel((z) => Math.min(3, Number((z + 0.5).toFixed(2))))}
            className="inline-flex items-center gap-1 rounded-lg border border-white/15 bg-white/10 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-white/20"
            title="Phóng to"
          >
            <ZoomIn className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Phóng to</span>
          </button>

          <a
            data-testid="lightbox-download-btn"
            href={resolvedUrl}
            download={activeAttachment.name || 'ktn-image.png'}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
          >
            <Download className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">Tải ảnh</span>
          </a>

          <button
            type="button"
            data-testid="lightbox-close-btn"
            onClick={() => setActiveAttachment(null)}
            className="inline-flex items-center justify-center rounded-lg bg-white/15 p-1.5 text-white hover:bg-white/25"
            aria-label="Đóng xem ảnh"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Scrollable / Zoomable Image Viewport */}
      <div
        className="flex flex-1 overflow-auto p-4"
        onClick={() => setActiveAttachment(null)}
      >
        <div
          className="relative m-auto flex items-center justify-center"
          onClick={(e) => e.stopPropagation()}
        >
          <img
            data-testid="lightbox-image"
            src={resolvedUrl}
            alt={activeAttachment.name || 'Ảnh phóng to'}
            onClick={() => setZoomLevel((z) => (z < 1.8 ? 2 : 1))}
            onError={(e) => {
              const target = e.currentTarget;
              if (activeAttachment.url && target.src !== activeAttachment.url) {
                target.src = activeAttachment.url;
              }
            }}
            style={{
              transform: `scale(${zoomLevel})`,
              transformOrigin: zoomLevel > 1 ? 'top center' : 'center center',
            }}
            className={`max-h-[82vh] max-w-[92vw] rounded-xl object-contain shadow-2xl transition-transform duration-150 ${
              zoomLevel < 1.8 ? 'cursor-zoom-in' : 'cursor-zoom-out'
            }`}
          />
        </div>
      </div>
    </div>,
    document.body
  );
};

export const AttachmentPreview: React.FC<AttachmentPreviewProps> = ({
  attachment,
  isOwn,
}) => {
  const setActiveLightboxAttachment = useUiStore((s) => s.setActiveLightboxAttachment);

  if (!attachment || !attachment.url) return null;

  const resolvedUrl = resolveUploadedMediaUrl(attachment.url);

  const isImage =
    attachment.kind === 'image' ||
    /^data:image\//i.test(attachment.url) ||
    /\.(png|jpe?g|gif|webp|svg|bmp|heic)(\?|$)/i.test(attachment.url) ||
    /\.(png|jpe?g|gif|webp|svg|bmp|heic)$/i.test(attachment.name || '');

  const isVideo =
    attachment.kind === 'video' ||
    /\.(mp4|mov|m4v)(\?|$)/i.test(attachment.url) ||
    /\.(mp4|mov|m4v)$/i.test(attachment.name || '');

  const isAudio =
    !isVideo &&
    (attachment.kind === 'audio' ||
      /^data:audio\//i.test(attachment.url) ||
      /\.(webm|mp3|wav|ogg|m4a|aac)(\?|$)/i.test(attachment.url) ||
      /\.(webm|mp3|wav|ogg|m4a|aac)$/i.test(attachment.name || ''));

  const handleOpenLightbox = (e: React.MouseEvent) => {
    e.stopPropagation();
    setActiveLightboxAttachment({
      ...attachment,
      url: resolvedUrl || attachment.url,
    });
  };

  if (isImage) {
    return (
      <div
        data-testid="chat-image-attachment"
        className="mt-1.5 overflow-hidden rounded-xl border border-black/10 bg-stone-100"
      >
        <div
          className="group relative max-h-64 max-w-xs cursor-zoom-in overflow-hidden bg-stone-200/60"
          onClick={handleOpenLightbox}
        >
          <img
            src={resolvedUrl}
            alt={attachment.name || 'Ảnh đính kèm'}
            onError={(e) => {
              const target = e.currentTarget;
              if (attachment.url && target.src !== attachment.url) {
                target.src = attachment.url;
              }
            }}
            className="max-h-64 w-full object-cover transition-transform duration-200 group-hover:scale-[1.02]"
          />
          <button
            type="button"
            data-testid="chat-image-zoom-btn"
            onClick={handleOpenLightbox}
            className="absolute bottom-2 right-2 flex items-center gap-1 rounded-lg bg-black/70 px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm backdrop-blur-sm transition-all hover:bg-black"
          >
            <Maximize2 className="h-3 w-3" />
            Phóng to
          </button>
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-black/5 bg-white/95 px-2.5 py-1.5 text-[11px] text-stone-600">
          <span className="truncate font-medium text-stone-800">
            {attachment.name || 'Ảnh đính kèm'}
          </span>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={handleOpenLightbox}
              className="inline-flex items-center gap-1 font-semibold text-stone-700 hover:text-red-800"
            >
              <ZoomIn className="h-3 w-3" />
              Xem lớn
            </button>
            <a
              data-testid="chat-attachment-download"
              href={resolvedUrl}
              download={attachment.name || 'ktn-image.png'}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-800 hover:underline"
            >
              <Download className="h-3 w-3" />
              Tải về
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (isVideo) {
    return (
      <div
        data-testid="chat-video-attachment"
        className={`mt-1.5 flex min-w-0 max-w-xs flex-col gap-1.5 overflow-hidden rounded-xl border p-2 ${
          isOwn
            ? 'border-red-300/60 bg-white/90 text-stone-900'
            : 'border-stone-200 bg-stone-50 text-stone-900'
        }`}
      >
        <video
          data-testid="chat-video-player"
          controls
          playsInline
          preload="metadata"
          src={resolvedUrl}
          className="max-h-60 w-full rounded-lg bg-black"
        />
        <div className="flex items-center justify-between gap-2 px-1 text-[11px] text-stone-600">
          <span className="truncate font-semibold text-stone-800">
            {attachment.name || 'Video đính kèm'}
          </span>
          <a
            data-testid="chat-attachment-download"
            href={resolvedUrl}
            target="_blank"
            rel="noreferrer"
            download={attachment.name}
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-red-800 hover:underline"
          >
            <Download className="h-3.5 w-3.5" />
            Tải về
          </a>
        </div>
      </div>
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
          {resolvedUrl && (
            <a
              data-testid="chat-attachment-download"
              href={resolvedUrl}
              target="_blank"
              rel="noreferrer"
              download={attachment.name}
              className="inline-flex shrink-0 items-center gap-0.5 text-[11px] font-semibold text-red-800 hover:underline"
            >
              <Download className="h-3 w-3" />
              Tải về
            </a>
          )}
        </div>
        <audio
          data-testid="chat-audio-player"
          controls
          preload="metadata"
          src={resolvedUrl}
          className="h-8 w-full max-w-[210px] sm:max-w-[260px]"
        />
      </div>
    );
  }

  return (
    <a
      data-testid="chat-attachment-download"
      href={resolvedUrl}
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
