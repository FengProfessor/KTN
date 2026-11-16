import React, { useEffect, useRef, useState, useCallback } from 'react';
import type Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  Sparkles,
  MessageSquare,
} from 'lucide-react';
import { useI18n, translateCourseTitle } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { buildLearnerWatermarkLines } from '../utils/watermark';

export type VideoPlayerStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'
  | 'unentitled'
  | 'expired';

function formatVideoTime(totalSec: number): string {
  const safe = Number.isFinite(totalSec) && totalSec > 0 ? Math.floor(totalSec) : 0;
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

interface HlsVideoPlayerProps {
  lessonTitle: string;
  courseName: string;
  streamUrl: string | null;
  fallbackVideoUrl?: string | null;
  statusOverride?: VideoPlayerStatus | null;
  unentitledReason?: string | null;
  isCompleted: boolean;
  onMarkCompleted: () => void;
  onRetryStream: () => void;
  onRequestUnlockCourse?: () => void;
  onWatchDemoCourse?: () => void;
  maxDemoSeconds?: number;
  onDemoEnded?: () => void;
  onAskAtTimestamp?: (seconds: number) => void;
  seekToTimestampSeconds?: number | null;
  watermarkLabel?: string;
}

export const HlsVideoPlayer: React.FC<HlsVideoPlayerProps> = ({
  lessonTitle,
  courseName,
  streamUrl,
  fallbackVideoUrl,
  statusOverride,
  unentitledReason,
  isCompleted,
  onMarkCompleted,
  onRetryStream,
  onRequestUnlockCourse,
  onWatchDemoCourse,
  maxDemoSeconds,
  onDemoEnded,
  onAskAtTimestamp,
  seekToTimestampSeconds,
  watermarkLabel,
}) => {
  const { lang, tr } = useI18n();
  const user = useAuthStore((s) => s.user);
  const displayCourseName = translateCourseTitle(courseName, lang);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const wmHostRef = useRef<HTMLDivElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [internalStatus, setInternalStatus] = useState<VideoPlayerStatus>('loading');
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [wmPos, setWmPos] = useState<{ top: number; left: number }>({ top: 14, left: 10 });
  const [clockTick, setClockTick] = useState<number>(() => Date.now());

  const isFullscreen = isNativeFullscreen || isPseudoFullscreen;

  useEffect(() => {
    if (
      seekToTimestampSeconds !== null &&
      seekToTimestampSeconds !== undefined &&
      Number.isFinite(seekToTimestampSeconds) &&
      seekToTimestampSeconds >= 0 &&
      videoRef.current
    ) {
      try {
        videoRef.current.currentTime = seekToTimestampSeconds;
        setCurrentTime(seekToTimestampSeconds);
      } catch {
        // Ignore seek errors before metadata is loaded
      }
    }
  }, [seekToTimestampSeconds]);

  const effectiveStatus = statusOverride || internalStatus;
  const showWatermark =
    effectiveStatus === 'ready' ||
    effectiveStatus === 'playing' ||
    effectiveStatus === 'paused';

  const watermarkLines = buildLearnerWatermarkLines(
    user,
    watermarkLabel || tr('KHỔNG TỬ NHÍ · HỌC THỬ', 'KHONG TU NHI · PREVIEW'),
    new Date(clockTick)
  );
  const primaryWmLine = watermarkLabel || watermarkLines.primaryLine;
  const secondaryWmLine = watermarkLines.secondaryLine;

  // Jump watermark position every 9 seconds and update HH:MM clock every 30s
  useEffect(() => {
    if (!showWatermark) return;
    const posTimer = window.setInterval(() => {
      const nextTop = 8 + Math.floor(Math.random() * 64); // 8%..72%
      const nextLeft = 5 + Math.floor(Math.random() * 55); // 5%..60%
      setWmPos({ top: nextTop, left: nextLeft });
    }, 9000);
    const clockTimer = window.setInterval(() => {
      setClockTick(Date.now());
    }, 30000);
    return () => {
      window.clearInterval(posTimer);
      window.clearInterval(clockTimer);
    };
  }, [showWatermark]);

  // Imperative self-healing watermark & anti-DOM-tamper guard: keeps React Fiber decoupled from direct DevTools DOM deletion
  useEffect(() => {
    const hostEl = wmHostRef.current;
    if (!hostEl) return;

    let isDisposed = false;
    let isSyncing = false;

    const syncWatermarkDom = () => {
      const currentHost = wmHostRef.current;
      if (!currentHost || isDisposed) return;
      isSyncing = true;
      try {
        currentHost.removeAttribute('hidden');
        currentHost.classList.remove('hidden');
        currentHost.style.display = '';
        currentHost.style.visibility = '';
        currentHost.style.opacity = '';

        if (!showWatermark) {
          currentHost.textContent = '';
          return;
        }

        let wmEl = currentHost.querySelector(
          '[data-testid="video-dynamic-watermark"]'
        ) as HTMLDivElement | null;
        if (!wmEl) {
          wmEl = document.createElement('div');
          wmEl.setAttribute('data-testid', 'video-dynamic-watermark');
          wmEl.setAttribute('aria-hidden', 'true');
          currentHost.appendChild(wmEl);
        }

        if (wmEl.children.length < 2) {
          wmEl.textContent = '';
          const line1 = document.createElement('div');
          line1.className = 'font-bold tracking-tight';
          const line2 = document.createElement('div');
          line2.className = 'text-[9px] text-amber-200/90';
          wmEl.appendChild(line1);
          wmEl.appendChild(line2);
        }

        wmEl.removeAttribute('hidden');
        wmEl.className =
          'pointer-events-none absolute z-10 select-none rounded-lg bg-stone-950/60 px-2.5 py-1 text-left font-mono text-[10px] leading-tight text-amber-100 shadow-sm backdrop-blur-[1px] transition-all duration-700 sm:text-[11px]';
        wmEl.style.cssText = `top: ${wmPos.top}%; left: ${wmPos.left}%; opacity: 0.34; display: block; visibility: visible;`;
        wmEl.children[0].textContent = primaryWmLine;
        wmEl.children[1].textContent = secondaryWmLine;
      } finally {
        isSyncing = false;
      }
    };

    syncWatermarkDom();

    const stageEl = stageRef.current;
    if (!showWatermark || !stageEl || typeof MutationObserver === 'undefined') {
      return () => {
        isDisposed = true;
      };
    }

    const isElementHidden = (el: HTMLElement | null) => {
      if (!el) return true;
      const inlineHidden =
        el.hasAttribute('hidden') ||
        el.style.display === 'none' ||
        el.style.visibility === 'hidden' ||
        el.style.opacity === '0' ||
        el.classList.contains('hidden');
      const computed =
        typeof window.getComputedStyle === 'function' ? window.getComputedStyle(el) : null;
      const computedHidden =
        computed &&
        (computed.display === 'none' ||
          computed.visibility === 'hidden' ||
          computed.opacity === '0');
      return Boolean(inlineHidden || computedHidden);
    };

    const checkAndEnforceWatermark = () => {
      if (isSyncing || isDisposed || !document.body.contains(stageEl)) return;
      const currentHost = wmHostRef.current;
      const wmEl = currentHost?.querySelector(
        '[data-testid="video-dynamic-watermark"]'
      ) as HTMLElement | null;
      const tampered =
        !currentHost ||
        !stageEl.contains(currentHost) ||
        isElementHidden(currentHost) ||
        !wmEl ||
        wmEl.children.length < 2 ||
        isElementHidden(wmEl);

      if (tampered) {
        try {
          videoRef.current?.pause();
        } catch {
          // ignore
        }
        setInternalStatus('paused');
        syncWatermarkDom();
      }
    };

    const observer = new MutationObserver(() => {
      checkAndEnforceWatermark();
    });
    observer.observe(stageEl, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class', 'hidden'],
    });

    return () => {
      isDisposed = true;
      observer.disconnect();
    };
  }, [showWatermark, wmPos.top, wmPos.left, primaryWmLine, secondaryWmLine]);

  // Fullscreen & Escape listener
  useEffect(() => {
    const onFsChange = () => {
      const fsEl =
        document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element | null })
          .webkitFullscreenElement ||
        null;
      setIsNativeFullscreen(Boolean(stageRef.current && fsEl === stageRef.current));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', onFsChange);
    document.addEventListener('webkitfullscreenchange', onFsChange);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('fullscreenchange', onFsChange);
      document.removeEventListener('webkitfullscreenchange', onFsChange);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isPseudoFullscreen]);

  const toggleFullscreen = async () => {
    const stageEl = stageRef.current as
      | (HTMLDivElement & {
          webkitRequestFullscreen?: () => Promise<void> | void;
        })
      | null;
    if (!stageEl) return;

    const docWithWebkit = document as Document & {
      webkitExitFullscreen?: () => Promise<void> | void;
    };

    if (isNativeFullscreen) {
      try {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (docWithWebkit.webkitExitFullscreen) await docWithWebkit.webkitExitFullscreen();
      } catch {
        setIsNativeFullscreen(false);
      }
      return;
    }

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (typeof stageEl.requestFullscreen === 'function') {
      try {
        await stageEl.requestFullscreen();
        setIsNativeFullscreen(true);
        return;
      } catch {
        // Fallback to pseudo-fullscreen on iOS / restricted WebViews
      }
    } else if (typeof stageEl.webkitRequestFullscreen === 'function') {
      try {
        await stageEl.webkitRequestFullscreen();
        setIsNativeFullscreen(true);
        return;
      } catch {
        // Fallback to pseudo-fullscreen
      }
    }
    setIsPseudoFullscreen(true);
  };

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (
      statusOverride === 'unentitled' ||
      statusOverride === 'expired' ||
      statusOverride === 'error' ||
      statusOverride === 'loading'
    ) {
      cleanupHls();
      if (statusOverride === 'expired' && videoRef.current) {
        try {
          videoRef.current.pause();
          videoRef.current.removeAttribute('src');
          videoRef.current.load();
        } catch {
          // Ignore media reset errors
        }
      }
      return;
    }

    const activeUrl = streamUrl || fallbackVideoUrl;
    if (!activeUrl) {
      setInternalStatus('loading');
      return;
    }

    const videoEl = videoRef.current;
    if (!videoEl) return;

    cleanupHls();
    setInternalStatus('loading');

    let cancelled = false;
    const isM3u8 = /\.m3u8(\?|$)/i.test(activeUrl);

    if (isM3u8) {
      import('hls.js')
        .then(({ default: HlsLib }) => {
          if (cancelled) return;
          if (HlsLib.isSupported()) {
            const hls = new HlsLib({
              enableWorker: true,
              lowLatencyMode: false,
            });
            hlsRef.current = hls;

            hls.loadSource(activeUrl);
            hls.attachMedia(videoEl);

            hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
              if (!cancelled) setInternalStatus('ready');
            });

            let mediaRecoveredOnce = false;
            hls.on(HlsLib.Events.ERROR, (_event, data) => {
              if (cancelled) return;
              if (data.fatal) {
                switch (data.type) {
                  case HlsLib.ErrorTypes.NETWORK_ERROR:
                    if (fallbackVideoUrl && fallbackVideoUrl !== activeUrl) {
                      cleanupHls();
                      videoEl.src = fallbackVideoUrl;
                    } else {
                      cleanupHls();
                      setInternalStatus('error');
                    }
                    break;
                  case HlsLib.ErrorTypes.MEDIA_ERROR:
                    if (!mediaRecoveredOnce) {
                      mediaRecoveredOnce = true;
                      hls.recoverMediaError();
                    } else {
                      cleanupHls();
                      setInternalStatus('error');
                    }
                    break;
                  default:
                    cleanupHls();
                    setInternalStatus('error');
                    break;
                }
              }
            });
          } else if (videoEl.canPlayType('application/vnd.apple.mpegurl')) {
            videoEl.src = activeUrl;
            setInternalStatus('ready');
          } else {
            setInternalStatus('error');
          }
        })
        .catch(() => {
          if (!cancelled) setInternalStatus('error');
        });
    } else {
      videoEl.src = activeUrl;
      setInternalStatus('ready');
    }

    return () => {
      cancelled = true;
      cleanupHls();
    };
  }, [streamUrl, fallbackVideoUrl, statusOverride, cleanupHls]);

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const togglePlay = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play().catch(() => {
        setInternalStatus('playing');
      });
    } else {
      videoEl.pause();
    }
  };

  const toggleMute = () => {
    const videoEl = videoRef.current;
    if (!videoEl) return;
    const nextMuted = !videoEl.muted;
    videoEl.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleSeekChange = (nextTime: number) => {
    const videoEl = videoRef.current;
    setCurrentTime(nextTime);
    if (videoEl) {
      try {
        videoEl.currentTime = nextTime;
      } catch {
        // Ignore seek errors before metadata is loaded
      }
    }
  };

  const lockedControls =
    effectiveStatus === 'unentitled' ||
    effectiveStatus === 'expired' ||
    effectiveStatus === 'error';

  return (
    <div
      data-testid="video-player-container"
      data-player-status={effectiveStatus}
      onContextMenu={(e) => e.preventDefault()}
      className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 shadow-md"
    >
      {/* Fullscreen Stage Wrapping Both Video + Floating Watermark + Custom Control Strip */}
      <div
        ref={stageRef}
        data-testid="video-fullscreen-stage"
        onContextMenu={(e) => e.preventDefault()}
        className={
          isPseudoFullscreen
            ? 'fixed inset-0 z-[9999] flex flex-col justify-between bg-stone-950'
            : isNativeFullscreen
            ? 'flex h-full w-full flex-col justify-between bg-stone-950'
            : 'flex flex-col bg-stone-950'
        }
      >
        {/* 16:9 Aspect Ratio Video Canvas Stage */}
        <div
          className={
            isFullscreen
              ? 'relative flex-1 overflow-hidden bg-stone-950'
              : 'relative aspect-video w-full overflow-hidden bg-stone-950'
          }
        >
          {/* State 1: Unentitled (403 COURSE_NOT_ENTITLED) */}
          {effectiveStatus === 'unentitled' && (
            <div
              data-testid="video-unentitled-guard"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-stone-950 via-red-950/90 to-stone-950 p-6 text-center text-white"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-500/20 text-amber-400 ring-1 ring-amber-400/40">
                <Lock className="h-7 w-7" />
              </div>
              <span className="mt-3 rounded-full bg-amber-500/20 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-amber-300">
                {tr('Khóa học có bản quyền', 'Licensed Course')}
              </span>
              <h3 className="mt-2 font-display text-base font-bold sm:text-lg">
                {tr(
                  `Tài khoản chưa mở khóa học phần ${displayCourseName}`,
                  `Course ${displayCourseName} is not unlocked yet`
                )}
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-stone-300">
                {unentitledReason ||
                  tr(
                    'Bạn có thể xem bài giảng học thử miễn phí hoặc đăng ký mở khóa học phần ngay tại đây.',
                    'You can watch the free trial lessons or enroll to unlock the full course right here.'
                  )}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {onWatchDemoCourse && (
                  <button
                    type="button"
                    data-testid="video-guard-watch-demo-btn"
                    onClick={onWatchDemoCourse}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-500 bg-stone-900/90 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-stone-800"
                  >
                    <Play className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{tr('Xem học thử', 'Watch Free Trial')}</span>
                  </button>
                )}
                {onRequestUnlockCourse && (
                  <button
                    type="button"
                    data-testid="video-guard-register-course-btn"
                    onClick={onRequestUnlockCourse}
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 shadow-md transition-transform hover:scale-105 hover:bg-amber-400"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{tr('Đăng ký khóa học', 'Enroll Course')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* State 1b: Expired (403 COURSE_EXPIRED) */}
          {effectiveStatus === 'expired' && (
            <div
              data-testid="video-expired-guard"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-gradient-to-br from-stone-950 via-red-950/90 to-stone-950 p-6 text-center text-white"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-400/40">
                <Lock className="h-7 w-7" />
              </div>
              <span className="mt-3 rounded-full bg-red-500/20 px-3 py-0.5 text-[11px] font-bold uppercase tracking-wider text-red-300">
                {tr('Đã hết hạn · Gia hạn', 'Expired · Renew')}
              </span>
              <h3 className="mt-2 font-display text-base font-bold sm:text-lg">
                {tr(
                  `Thời hạn truy cập khóa ${displayCourseName} đã kết thúc`,
                  `Access period for ${displayCourseName} has ended`
                )}
              </h3>
              <p className="mt-1.5 max-w-md text-xs leading-relaxed text-stone-300">
                {unentitledReason ||
                  tr(
                    'Thời hạn truy cập khóa học đã kết thúc. Vui lòng gia hạn khóa học để tiếp tục xem bài giảng đầy đủ. Tiến độ học và bài tập đã nộp được giữ nguyên.',
                    'Your course access period has expired. Please renew your course to continue watching full lessons. Your progress and submitted homework are preserved.'
                  )}
              </p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2.5">
                {onWatchDemoCourse && (
                  <button
                    type="button"
                    data-testid="video-expired-watch-demo-btn"
                    onClick={onWatchDemoCourse}
                    className="inline-flex min-h-[38px] items-center gap-1.5 rounded-xl border border-stone-500 bg-stone-900/90 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-stone-800"
                  >
                    <Play className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    <span>{tr('Xem học thử', 'Watch Free Trial')}</span>
                  </button>
                )}
                {onRequestUnlockCourse && (
                  <button
                    type="button"
                    data-testid="video-expired-renew-course-btn"
                    onClick={onRequestUnlockCourse}
                    className="inline-flex min-h-[38px] items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 shadow-md transition-transform hover:scale-105 hover:bg-amber-400"
                  >
                    <Sparkles className="h-4 w-4" />
                    <span>{tr('Gia hạn khóa học', 'Renew Course')}</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {/* State 2: Stream Error */}
          {effectiveStatus === 'error' && (
            <div
              data-testid="video-error-state"
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-stone-950/95 p-6 text-center text-white"
            >
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-400/40">
                <AlertTriangle className="h-7 w-7" />
              </div>
              <h3 className="mt-3 font-display text-base font-bold">
                {tr('Không tải được video bài giảng', 'Unable to load lesson video')}
              </h3>
              <p className="mt-1 max-w-md text-xs text-stone-400">
                {tr(
                  'Đường truyền mạng đang gián đoạn hoặc phiên xem video đã hết hạn. Hãy nhấn thử lại để phát tiếp.',
                  'Your network connection was interrupted or the video session expired. Click retry to continue watching.'
                )}
              </p>
              <button
                type="button"
                data-testid="retry-video-stream-btn"
                onClick={onRetryStream}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-red-600"
              >
                <RotateCcw className="h-4 w-4" />
                {tr('Thử tải lại video', 'Retry Video')}
              </button>
            </div>
          )}

          {/* State 3: Loading */}
          {effectiveStatus === 'loading' && (
            <div
              data-testid="video-loading-state"
              className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-stone-950/90 p-6 text-center text-white"
            >
              <Loader2 className="h-9 w-9 animate-spin text-amber-400" />
              <p className="mt-3 text-xs font-semibold text-stone-200">
                {tr('Đang tải bài giảng...', 'Loading lesson...')}
              </p>
              <p className="mt-1 text-[11px] text-stone-400">{lessonTitle}</p>
            </div>
          )}

          {/* HTML5 / HLS Video Element (Locked down: no browser download/PiP/native-fullscreen bypass) */}
          <video
            ref={videoRef}
            data-testid="hls-video-element"
            playsInline
            preload="metadata"
            disablePictureInPicture
            {...({
              controlsList: 'nodownload nofullscreen noremoteplayback',
              'webkit-playsinline': 'true',
            } as Record<string, string>)}
            onClick={togglePlay}
            onContextMenu={(e) => e.preventDefault()}
            onDragStart={(e) => e.preventDefault()}
            onPlay={() => setInternalStatus('playing')}
            onPause={() => setInternalStatus('paused')}
            onVolumeChange={(e) => setIsMuted(e.currentTarget.muted)}
            onTimeUpdate={(e) => {
              const cur = e.currentTarget.currentTime;
              setCurrentTime(cur);
              if (maxDemoSeconds && maxDemoSeconds > 0 && cur >= maxDemoSeconds) {
                e.currentTarget.pause();
                setInternalStatus('paused');
                onDemoEnded?.();
              }
            }}
            onLoadedMetadata={(e) => {
              setDuration(e.currentTarget.duration || 0);
              setIsMuted(Boolean(e.currentTarget.muted));
              setInternalStatus('ready');
            }}
            onError={() => {
              cleanupHls();
              setInternalStatus('error');
            }}
            onEnded={() => {
              setInternalStatus('paused');
              if (maxDemoSeconds && maxDemoSeconds > 0) {
                onDemoEnded?.();
                return;
              }
              if (!isCompleted) onMarkCompleted();
            }}
            poster={`data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23450a0a'/><stop offset='55%' stop-color='%237f1d1d'/><stop offset='100%' stop-color='%231c1917'/></linearGradient></defs><rect width='1280' height='720' fill='url(%23g)'/><circle cx='640' cy='320' r='68' fill='%23f59e0b' fill-opacity='0.2' stroke='%23fbbf24' stroke-width='3'/><polygon points='622,290 622,350 675,320' fill='%23fef3c7'/><text x='640' y='445' text-anchor='middle' fill='%23fef3c7' font-family='sans-serif' font-size='28' font-weight='bold'>${tr(
              'HỌC VIỆN KHỔNG TỬ NHÍ — PHÒNG HỌC TRỰC TUYẾN',
              'KHONG TU NHI ACADEMY — ONLINE CLASSROOM'
            )}</text></svg>`}
            className="h-full w-full cursor-pointer select-none object-contain"
          />

          {/* Dynamic Floating Forensic Watermark Overlay Host (Preserved in Custom Fullscreen Stage) */}
          <div
            ref={wmHostRef}
            className="pointer-events-none absolute inset-0 z-10 overflow-hidden"
          />
        </div>

        {/* Custom Seek Bar + Bottom Control Strip (Inside Fullscreen Stage) */}
        <div className="border-t border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-200">
          {/* Interactive Progress Scrubber */}
          <div className="mb-1.5 flex items-center gap-2">
            <input
              type="range"
              data-testid="video-seek-slider"
              min={0}
              max={duration > 0 ? duration : 100}
              step={0.5}
              value={Math.min(currentTime, duration > 0 ? duration : 100)}
              disabled={lockedControls || duration <= 0}
              onChange={(e) => handleSeekChange(Number(e.target.value))}
              aria-label={tr('Tua video bài giảng', 'Seek lesson video')}
              className="h-1.5 w-full cursor-pointer accent-amber-500 disabled:cursor-not-allowed disabled:opacity-40"
            />
            <span className="shrink-0 font-mono text-[10.5px] text-stone-400">
              {formatVideoTime(currentTime)} / {formatVideoTime(duration)}
            </span>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                data-testid="toggle-video-play-btn"
                onClick={togglePlay}
                disabled={lockedControls}
                className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
              >
                {effectiveStatus === 'playing' ? (
                  <>
                    <Pause className="h-3.5 w-3.5" />
                    <span>{tr('Tạm dừng', 'Pause')}</span>
                  </>
                ) : (
                  <>
                    <Play className="h-3.5 w-3.5 fill-white" />
                    <span>{tr('Phát', 'Play')}</span>
                  </>
                )}
              </button>

              <button
                type="button"
                data-testid="video-mute-btn"
                onClick={toggleMute}
                disabled={lockedControls}
                aria-label={isMuted ? tr('Bật tiếng', 'Unmute') : tr('Tắt tiếng', 'Mute')}
                className="inline-flex min-h-[34px] items-center justify-center rounded-lg border border-stone-700 bg-stone-800 px-2 text-stone-200 hover:bg-stone-700 disabled:opacity-40"
              >
                {isMuted ? (
                  <VolumeX className="h-3.5 w-3.5 text-red-400" />
                ) : (
                  <Volume2 className="h-3.5 w-3.5 text-amber-400" />
                )}
              </button>

              <span className="inline-flex items-center gap-1 rounded-md bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-300">
                <strong className="text-amber-300">
                  {effectiveStatus === 'playing'
                    ? tr('Đang phát', 'Playing')
                    : effectiveStatus === 'paused'
                    ? tr('Tạm dừng', 'Paused')
                    : effectiveStatus === 'loading'
                    ? tr('Đang tải...', 'Loading...')
                    : effectiveStatus === 'expired'
                    ? tr('Đã hết hạn', 'Expired')
                    : effectiveStatus === 'unentitled'
                    ? tr('Chưa mở khóa', 'Locked')
                    : effectiveStatus === 'error'
                    ? tr('Lỗi luồng phát', 'Stream error')
                    : tr('Sẵn sàng', 'Ready')}
                </strong>
              </span>
            </div>

            {/* Speed, Q&A, Completion & Protected Fullscreen Actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              <div className="flex items-center gap-0.5 rounded-lg bg-stone-800 p-0.5">
                {[0.75, 1, 1.25, 1.5].map((rate) => (
                  <button
                    key={rate}
                    type="button"
                    onClick={() => handleSpeedChange(rate)}
                    className={`rounded-md px-1.5 py-0.5 text-[10.5px] font-bold transition-colors ${
                      playbackRate === rate
                        ? 'bg-amber-500 text-stone-950'
                        : 'text-stone-400 hover:text-white'
                    }`}
                  >
                    {rate}x
                  </button>
                ))}
              </div>

              {onAskAtTimestamp &&
                effectiveStatus !== 'unentitled' &&
                effectiveStatus !== 'expired' && (
                  <button
                    type="button"
                    data-testid="ask-video-timestamp-btn"
                    onClick={() => {
                      const sec = Math.max(
                        0,
                        Math.floor(videoRef.current?.currentTime ?? currentTime ?? 0)
                      );
                      if (videoRef.current && !videoRef.current.paused) {
                        videoRef.current.pause();
                      }
                      onAskAtTimestamp(sec);
                    }}
                    className="inline-flex min-h-[34px] items-center gap-1 rounded-lg border border-amber-500/50 bg-amber-500/20 px-2.5 py-1 text-xs font-bold text-amber-200 transition-colors hover:bg-amber-500/30"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-amber-300" />
                    <span>{tr('Hỏi về đoạn này', 'Ask at this time')}</span>
                  </button>
                )}

              <button
                type="button"
                data-testid="mark-lesson-complete-btn"
                onClick={onMarkCompleted}
                disabled={
                  effectiveStatus === 'unentitled' || effectiveStatus === 'expired'
                }
                className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                  isCompleted
                    ? 'bg-emerald-700 text-white'
                    : 'border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700'
                }`}
              >
                <CheckCircle2 className="h-3.5 w-3.5" />
                <span>{isCompleted ? tr('Đã hoàn thành', 'Completed') : tr('Hoàn thành', 'Complete')}</span>
              </button>

              <button
                type="button"
                data-testid="video-fullscreen-btn"
                onClick={toggleFullscreen}
                disabled={lockedControls}
                aria-label={
                  isFullscreen
                    ? tr('Thoát toàn màn hình', 'Exit fullscreen')
                    : tr('Toàn màn hình', 'Fullscreen')
                }
                className="inline-flex min-h-[34px] items-center justify-center gap-1 rounded-lg border border-stone-700 bg-stone-800 px-2.5 py-1 text-xs font-bold text-stone-200 hover:bg-stone-700 disabled:opacity-40"
              >
                {isFullscreen ? (
                  <Minimize2 className="h-3.5 w-3.5 text-amber-300" />
                ) : (
                  <Maximize2 className="h-3.5 w-3.5 text-amber-300" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
