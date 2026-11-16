import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Download,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { useI18n } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import type { KtnLearningMaterial } from '@/types/ktn.types';
import { buildLearnerWatermarkLines } from '../utils/watermark';

const PDFJS_CDN_URL = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
const PDFJS_WORKER_CDN_URL =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

interface PdfJsPageViewport {
  width: number;
  height: number;
}

interface PdfJsPage {
  getViewport: (opts: { scale: number }) => PdfJsPageViewport;
  render: (opts: {
    canvasContext: CanvasRenderingContext2D;
    viewport: PdfJsPageViewport;
  }) => { promise: Promise<void>; cancel?: () => void };
}

interface PdfJsDocument {
  numPages: number;
  getPage: (pageNumber: number) => Promise<PdfJsPage>;
  destroy?: () => Promise<void> | void;
}

interface PdfJsLibGlobal {
  GlobalWorkerOptions: { workerSrc: string };
  getDocument: (src: {
    url: string;
    rangeChunkSize?: number;
    disableAutoFetch?: boolean;
    disableStream?: boolean;
  }) => { promise: Promise<PdfJsDocument>; destroy?: () => Promise<void> | void };
}

let pdfJsLoadPromise: Promise<PdfJsLibGlobal> | null = null;

function loadPdfJsFromCdn(): Promise<PdfJsLibGlobal> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('PDF viewer requires browser environment'));
  }
  const existing = (window as unknown as { pdfjsLib?: PdfJsLibGlobal }).pdfjsLib;
  if (existing) {
    existing.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
    return Promise.resolve(existing);
  }
  if (pdfJsLoadPromise) return pdfJsLoadPromise;

  pdfJsLoadPromise = new Promise<PdfJsLibGlobal>((resolve, reject) => {
    const script = document.createElement('script');
    script.src = PDFJS_CDN_URL;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.onload = () => {
      const loaded = (window as unknown as { pdfjsLib?: PdfJsLibGlobal }).pdfjsLib;
      if (loaded) {
        loaded.GlobalWorkerOptions.workerSrc = PDFJS_WORKER_CDN_URL;
        resolve(loaded);
      } else {
        pdfJsLoadPromise = null;
        reject(new Error('pdfjsLib unavailable after script load'));
      }
    };
    script.onerror = () => {
      pdfJsLoadPromise = null;
      reject(new Error('Không tải được trình xem tài liệu từ CDN'));
    };
    document.head.appendChild(script);
  });
  return pdfJsLoadPromise;
}

function paintCanvasWatermarks(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  primaryLine: string,
  secondaryLine: string
) {
  ctx.save();
  const baseFont = Math.max(13, Math.round(width / 38));
  ctx.font = `700 ${baseFont}px sans-serif`;
  ctx.fillStyle = 'rgba(153, 27, 27, 0.16)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const bandYFractions = [0.22, 0.5, 0.78];
  for (const frac of bandYFractions) {
    ctx.save();
    ctx.translate(width / 2, height * frac);
    ctx.rotate(-0.32);
    ctx.fillText(`HỌC VIỆN KHỔNG TỬ NHÍ · ${primaryLine}`, 0, -baseFont * 0.65);
    ctx.fillStyle = 'rgba(28, 25, 23, 0.14)';
    ctx.font = `600 ${Math.max(11, baseFont - 2)}px monospace`;
    ctx.fillText(secondaryLine, 0, baseFont * 0.75);
    ctx.restore();
  }
  ctx.restore();
}

interface ProtectedPdfModalProps {
  material: KtnLearningMaterial | null;
  onClose: () => void;
}

export const ProtectedPdfModal: React.FC<ProtectedPdfModalProps> = ({
  material,
  onClose,
}) => {
  const { tr } = useI18n();
  const user = useAuthStore((s) => s.user);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pdfDocRef = useRef<PdfJsDocument | null>(null);
  const renderTaskRef = useRef<{ cancel?: () => void } | null>(null);

  const hashPageMatch = material?.url?.match(/#page=(\d+)/i);
  const initialPage = Math.max(
    1,
    Number(material?.page || material?.bookPage || (hashPageMatch ? hashPageMatch[1] : 1) || 1)
  );
  const cleanPdfUrl = (material?.url || '').split('#')[0];

  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [pageInput, setPageInput] = useState<string>(String(initialPage));
  const [zoom, setZoom] = useState<number>(1.2);
  const [isLoadingDoc, setIsLoadingDoc] = useState<boolean>(true);
  const [isRenderingPage, setIsRenderingPage] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const { primaryLine, secondaryLine } = buildLearnerWatermarkLines(
    user,
    tr('KHỔNG TỬ NHÍ · TÀI LIỆU BẢN QUYỀN', 'KHONG TU NHI · LICENSED MATERIAL')
  );

  // Keyboard and Print guard while modal is active
  useEffect(() => {
    if (!material) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && ['p', 's', 'u'].includes(e.key.toLowerCase())) {
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [material, onClose]);

  const loadDocument = useCallback(async () => {
    if (!cleanPdfUrl) return;
    setIsLoadingDoc(true);
    setErrorMsg(null);
    try {
      const pdfjsLib = await loadPdfJsFromCdn();
      const loadingTask = pdfjsLib.getDocument({
        url: cleanPdfUrl,
        rangeChunkSize: 65536,
        disableAutoFetch: true,
        disableStream: false,
      });
      const doc = await loadingTask.promise;
      pdfDocRef.current = doc;
      const total = Math.max(1, Number(doc.numPages || 1));
      setNumPages(total);
      const boundedStart = Math.min(total, initialPage);
      setPageNumber(boundedStart);
      setPageInput(String(boundedStart));
      setIsLoadingDoc(false);
    } catch (err) {
      setIsLoadingDoc(false);
      setErrorMsg(
        err instanceof Error
          ? err.message
          : tr('Không tải được tài liệu PDF.', 'Unable to load PDF document.')
      );
    }
  }, [cleanPdfUrl, initialPage, tr]);

  useEffect(() => {
    if (!material) return;
    loadDocument();
    return () => {
      try {
        renderTaskRef.current?.cancel?.();
      } catch {
        // ignore
      }
      try {
        pdfDocRef.current?.destroy?.();
      } catch {
        // ignore
      }
      pdfDocRef.current = null;
    };
  }, [material, loadDocument]);

  useEffect(() => {
    const doc = pdfDocRef.current;
    const canvas = canvasRef.current;
    if (!doc || !canvas || isLoadingDoc) return;

    let cancelled = false;
    setIsRenderingPage(true);

    (async () => {
      try {
        try {
          renderTaskRef.current?.cancel?.();
        } catch {
          // ignore
        }
        const safePage = Math.max(1, Math.min(numPages || 1, pageNumber));
        const page = await doc.getPage(safePage);
        if (cancelled) return;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const viewport = page.getViewport({ scale: zoom * dpr });
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        canvas.style.width = `${Math.round(viewport.width / dpr)}px`;
        canvas.style.height = `${Math.round(viewport.height / dpr)}px`;

        let ctx: CanvasRenderingContext2D | null = null;
        try {
          ctx = canvas.getContext('2d');
        } catch {
          ctx = null;
        }
        if (!ctx) return;

        const task = page.render({ canvasContext: ctx, viewport });
        renderTaskRef.current = task;
        await task.promise;
        if (cancelled) return;

        paintCanvasWatermarks(ctx, canvas.width, canvas.height, primaryLine, secondaryLine);
      } catch {
        // ignore render cancellation errors during fast page switch
      } finally {
        if (!cancelled) setIsRenderingPage(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pageNumber, zoom, numPages, isLoadingDoc, primaryLine, secondaryLine]);

  if (!material) return null;

  const goToPage = (target: number) => {
    const maxP = Math.max(1, numPages || target);
    const clamped = Math.max(1, Math.min(maxP, target));
    setPageNumber(clamped);
    setPageInput(String(clamped));
  };

  return (
    <div
      data-testid="protected-pdf-modal"
      role="dialog"
      aria-modal="true"
      aria-label={material.title}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed inset-0 z-50 flex flex-col bg-stone-950/90 p-2 sm:p-4"
      onClick={onClose}
    >
      {!material.canDownload && (
        <style>{`@media print { body * { visibility: hidden !important; } }`}</style>
      )}

      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-stone-700 bg-stone-900 text-stone-100 shadow-2xl"
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 bg-stone-950 px-3.5 py-2.5 sm:px-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-red-900/70 px-2 py-0.5 text-[10px] font-bold text-amber-300 ring-1 ring-amber-500/30">
                <ShieldCheck className="h-3 w-3" />
                {material.canDownload
                  ? tr('Vở luyện viết · Có thể tải in', 'Practice Sheet · Printable')
                  : tr('Tài liệu bảo vệ bản quyền', 'Copyright Protected Material')}
              </span>
            </div>
            <h3 className="mt-0.5 truncate font-display text-xs font-bold text-white sm:text-sm">
              {material.title}
            </h3>
          </div>

          <button
            type="button"
            data-testid="protected-pdf-close-btn"
            onClick={onClose}
            aria-label={tr('Đóng trình đọc sách', 'Close document viewer')}
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-800 bg-stone-900/95 px-3 py-2 text-xs">
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              data-testid="pdf-prev-page-btn"
              disabled={pageNumber <= 1 || isLoadingDoc}
              onClick={() => goToPage(pageNumber - 1)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 font-bold text-stone-200 hover:bg-stone-700 disabled:opacity-40"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{tr('Trang trước', 'Prev')}</span>
            </button>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const parsed = Number(pageInput);
                if (Number.isFinite(parsed)) goToPage(Math.floor(parsed));
              }}
              className="flex items-center gap-1.5 rounded-lg border border-stone-700 bg-stone-950 px-2 py-1"
            >
              <span className="text-[11px] text-stone-400">{tr('Trang', 'Page')}</span>
              <input
                type="number"
                min={1}
                max={numPages || 999}
                value={pageInput}
                onChange={(e) => setPageInput(e.target.value)}
                onBlur={() => {
                  const parsed = Number(pageInput);
                  if (Number.isFinite(parsed) && parsed > 0) goToPage(Math.floor(parsed));
                }}
                aria-label={tr('Số trang', 'Page number')}
                className="w-12 bg-transparent text-center font-mono text-xs font-bold text-amber-300 focus:outline-none"
              />
              <span className="font-mono text-[11px] text-stone-400">
                / {numPages || '...'}
              </span>
            </form>

            <button
              type="button"
              data-testid="pdf-next-page-btn"
              disabled={(numPages > 0 && pageNumber >= numPages) || isLoadingDoc}
              onClick={() => goToPage(pageNumber + 1)}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 font-bold text-stone-200 hover:bg-stone-700 disabled:opacity-40"
            >
              <span className="hidden sm:inline">{tr('Trang sau', 'Next')}</span>
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              aria-label={tr('Thu nhỏ', 'Zoom out')}
              onClick={() => setZoom((z) => Math.max(0.6, +(z - 0.15).toFixed(2)))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700"
            >
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1.2)}
              className="inline-flex h-8 items-center rounded-lg border border-stone-700 bg-stone-800 px-2 font-mono text-[11px] font-bold text-stone-200 hover:bg-stone-700"
            >
              {Math.round(zoom * 100)}%
            </button>
            <button
              type="button"
              aria-label={tr('Phóng to', 'Zoom in')}
              onClick={() => setZoom((z) => Math.min(2.2, +(z + 0.15).toFixed(2)))}
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700"
            >
              <ZoomIn className="h-3.5 w-3.5" />
            </button>

            {material.canDownload === true && (
              <a
                href={material.fileUrl || cleanPdfUrl}
                target="_blank"
                rel="noopener noreferrer"
                download
                data-testid="protected-pdf-download-btn"
                className="ml-1 inline-flex h-8 items-center gap-1 rounded-lg bg-amber-500 px-3 font-bold text-stone-950 hover:bg-amber-400"
              >
                <Download className="h-3.5 w-3.5" />
                <span>{tr('Tải / In vở viết', 'Download / Print')}</span>
              </a>
            )}
          </div>
        </div>

        {/* Canvas Viewport Stage */}
        <div
          onContextMenu={(e) => e.preventDefault()}
          className="relative flex-1 overflow-auto bg-stone-950 p-3 sm:p-6"
        >
          {isLoadingDoc && (
            <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center">
              <Loader2 className="h-8 w-8 animate-spin text-amber-400" />
              <p className="mt-2 text-xs font-semibold text-stone-300">
                {tr(
                  `Đang tải trang ${initialPage}...`,
                  `Loading page ${initialPage}...`
                )}
              </p>
            </div>
          )}

          {errorMsg && !isLoadingDoc && (
            <div
              role="alert"
              className="mx-auto flex max-w-md flex-col items-center justify-center rounded-2xl border border-red-800/60 bg-stone-900 p-6 text-center"
            >
              <AlertTriangle className="h-8 w-8 text-red-400" />
              <p className="mt-2 text-xs font-bold text-red-200">{errorMsg}</p>
              <button
                type="button"
                onClick={loadDocument}
                className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-red-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                <span>{tr('Thử lại', 'Retry')}</span>
              </button>
            </div>
          )}

          {!errorMsg && (
            <div className="relative mx-auto inline-flex min-w-full flex-col items-center">
              <div className="relative inline-block">
                <canvas
                  ref={canvasRef}
                  data-testid="protected-pdf-canvas"
                  onContextMenu={(e) => e.preventDefault()}
                  onDragStart={(e) => e.preventDefault()}
                  className="mx-auto block select-none rounded-lg bg-white shadow-xl"
                />

                {/* Overlay Dynamic Watermark Layer */}
                <div
                  data-testid="protected-pdf-watermark"
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 z-10 flex select-none flex-col items-center justify-between overflow-hidden p-4 opacity-25"
                >
                  <span className="-rotate-12 rounded bg-stone-950/30 px-2 py-0.5 font-mono text-[10px] font-bold text-red-900">
                    {primaryLine}
                  </span>
                  <span className="-rotate-12 rounded bg-stone-950/20 px-2 py-0.5 font-mono text-[10px] font-bold text-stone-900">
                    {primaryLine} · {secondaryLine}
                  </span>
                </div>

                {isRenderingPage && !isLoadingDoc && (
                  <div className="pointer-events-none absolute right-3 top-3 inline-flex items-center gap-1.5 rounded-full bg-stone-950/80 px-2.5 py-1 text-[10px] font-semibold text-amber-300">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>{tr('Đang kết xuất...', 'Rendering...')}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
