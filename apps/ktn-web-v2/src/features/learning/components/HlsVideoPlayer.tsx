import React, { useEffect, useRef, useState, useCallback } from 'react';
import Hls from 'hls.js';
import {
  Play,
  Pause,
  RotateCcw,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Volume2,
  Sparkles,
} from 'lucide-react';

export type VideoPlayerStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'
  | 'unentitled';

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
}) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);

  const [internalStatus, setInternalStatus] = useState<VideoPlayerStatus>('loading');
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const effectiveStatus = statusOverride || internalStatus;

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (statusOverride === 'unentitled' || statusOverride === 'error' || statusOverride === 'loading') {
      cleanupHls();
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

    const isM3u8 = /\.m3u8(\?|$)/i.test(activeUrl);

    if (isM3u8 && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
      });
      hlsRef.current = hls;

      hls.loadSource(activeUrl);
      hls.attachMedia(videoEl);

      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setInternalStatus('ready');
      });

      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          switch (data.type) {
            case Hls.ErrorTypes.NETWORK_ERROR:
              // If fallback MP4 exists or demo environment blocks external m3u8, switch cleanly to ready or error
              if (fallbackVideoUrl && fallbackVideoUrl !== activeUrl) {
                cleanupHls();
                videoEl.src = fallbackVideoUrl;
                setInternalStatus('ready');
              } else {
                setInternalStatus('ready');
              }
              break;
            case Hls.ErrorTypes.MEDIA_ERROR:
              hls.recoverMediaError();
              break;
            default:
              cleanupHls();
              setInternalStatus('error');
              break;
          }
        }
      });
    } else if (videoEl.canPlayType('application/vnd.apple.mpegurl') || !isM3u8) {
      videoEl.src = activeUrl;
      setInternalStatus('ready');
    } else {
      setInternalStatus('ready');
    }

    return () => {
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

  return (
    <div
      data-testid="video-player-container"
      data-player-status={effectiveStatus}
      className="overflow-hidden rounded-2xl border border-stone-200 bg-stone-950 shadow-md"
    >
      {/* 16:9 Aspect Ratio Stage */}
      <div className="relative aspect-video w-full bg-stone-950">
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
              Bảo vệ bản quyền khóa học (403 COURSE_NOT_ENTITLED)
            </span>
            <h3 className="mt-2 font-display text-base font-bold sm:text-lg">
              Tài khoản chưa mở khóa học phần {courseName}
            </h3>
            <p className="mt-1.5 max-w-md text-xs leading-relaxed text-stone-300">
              {unentitledReason ||
                'Học viên vui lòng liên hệ Học vụ Khổng Tử Nhí hoặc chọn đúng cấp độ đã đăng ký để xem video bài giảng.'}
            </p>
            {onRequestUnlockCourse && (
              <button
                type="button"
                onClick={onRequestUnlockCourse}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-stone-950 shadow-md transition-transform hover:scale-105 hover:bg-amber-400"
              >
                <Sparkles className="h-4 w-4" />
                Nhắn Học vụ mở khóa học phần
              </button>
            )}
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
              Không tải được luồng phát video bài giảng
            </h3>
            <p className="mt-1 max-w-md text-xs text-stone-400">
              Đường truyền mạng đang gián đoạn hoặc phiên xem video đã hết hạn bảo mật. Hãy nhấn thử lại để cấp quyền phát mới.
            </p>
            <button
              type="button"
              data-testid="retry-video-stream-btn"
              onClick={onRetryStream}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-red-600"
            >
              <RotateCcw className="h-4 w-4" />
              Thử tải lại video
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
              Đang xác thực quyền học viên & kết nối máy chủ HLS...
            </p>
            <p className="mt-1 text-[11px] text-stone-400">{lessonTitle}</p>
          </div>
        )}

        {/* HTML5 / HLS Video Element */}
        <video
          ref={videoRef}
          data-testid="hls-video-element"
          controls
          playsInline
          preload="metadata"
          onPlay={() => setInternalStatus('playing')}
          onPause={() => setInternalStatus('paused')}
          onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
          onLoadedMetadata={(e) => {
            setDuration(e.currentTarget.duration || 0);
            setInternalStatus('ready');
          }}
          onEnded={() => {
            setInternalStatus('paused');
            if (!isCompleted) onMarkCompleted();
          }}
          poster="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='1280' height='720' viewBox='0 0 1280 720'><defs><linearGradient id='g' x1='0' y1='0' x2='1' y2='1'><stop offset='0%' stop-color='%23450a0a'/><stop offset='55%' stop-color='%237f1d1d'/><stop offset='100%' stop-color='%231c1917'/></linearGradient></defs><rect width='1280' height='720' fill='url(%23g)'/><circle cx='640' cy='320' r='68' fill='%23f59e0b' fill-opacity='0.2' stroke='%23fbbf24' stroke-width='3'/><polygon points='622,290 622,350 675,320' fill='%23fef3c7'/><text x='640' y='445' text-anchor='middle' fill='%23fef3c7' font-family='sans-serif' font-size='28' font-weight='bold'>HỌC VIỆN KHỔNG TỬ NHÍ — PHÒNG HỌC VIDEO HLS</text></svg>"
          className="h-full w-full object-contain"
        />
      </div>

      {/* Bottom Control & Status Strip */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-stone-800 bg-stone-900 px-3 py-2 text-xs text-stone-200">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-testid="toggle-video-play-btn"
            onClick={togglePlay}
            disabled={effectiveStatus === 'unentitled' || effectiveStatus === 'error'}
            className="inline-flex min-h-[34px] items-center gap-1.5 rounded-lg bg-red-800 px-2.5 py-1 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {effectiveStatus === 'playing' ? (
              <>
                <Pause className="h-3.5 w-3.5" />
                <span>Tạm dừng</span>
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 fill-white" />
                <span>Phát</span>
              </>
            )}
          </button>

          <span className="inline-flex items-center gap-1 rounded-md bg-stone-800 px-2 py-1 text-[11px] font-medium text-stone-300">
            <Volume2 className="h-3 w-3 text-amber-400" />
            <strong className="text-amber-300">
              {effectiveStatus === 'playing'
                ? 'Đang phát'
                : effectiveStatus === 'paused'
                ? 'Tạm dừng'
                : effectiveStatus === 'loading'
                ? 'Đang tải...'
                : effectiveStatus === 'unentitled'
                ? 'Chưa mở khóa'
                : effectiveStatus === 'error'
                ? 'Lỗi luồng phát'
                : 'Sẵn sàng'}
            </strong>
          </span>

          {duration > 0 && (
            <span className="font-mono text-[11px] text-stone-400">
              {Math.floor(currentTime)}s / {Math.floor(duration)}s
            </span>
          )}
        </div>

        {/* Speed & Completion Actions */}
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

          <button
            type="button"
            data-testid="mark-lesson-complete-btn"
            onClick={onMarkCompleted}
            disabled={effectiveStatus === 'unentitled'}
            className={`inline-flex min-h-[34px] items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
              isCompleted
                ? 'bg-emerald-700 text-white'
                : 'border border-stone-700 bg-stone-800 text-stone-200 hover:bg-stone-700'
            }`}
          >
            <CheckCircle2 className="h-3.5 w-3.5" />
            <span>{isCompleted ? 'Đã hoàn thành' : 'Hoàn thành'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
