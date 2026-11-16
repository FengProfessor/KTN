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
  ShieldCheck,
} from 'lucide-react';
import { useI18n, translateCourseTitle } from '@/i18n';
import { useAuthStore } from '@/stores/useAuthStore';
import { getStoredSession, toHttpHeaderSafeValue } from '@/services/api/ktnApiClient';
import type {
  KtnDrmPlaybackInfo,
  KtnDrmPolicy,
  KtnDrmSystem,
} from '@/types/ktn.types';
import { buildLearnerWatermarkLines } from '../utils/watermark';
import {
  DRM_KEY_SYSTEMS,
  type DrmCapabilityReport,
  type DrmStructuredError,
  buildUnsupportedDrmError,
  classifyDrmError,
  createFairPlayInitDataTransform,
  detectDrmCapabilities,
  selectDrmPlaybackPlan,
} from '../utils/drmCapability';
import { loadShakaPlayer, type ShakaStatic } from '../utils/shakaLoader';

export type VideoPlayerStatus =
  | 'loading'
  | 'ready'
  | 'playing'
  | 'paused'
  | 'error'
  | 'unentitled'
  | 'expired';

interface VideoQualityOption {
  id: string;
  label: string;
  height: number;
  levelIndex?: number;
  trackId?: number;
}

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
  drmEnabled?: boolean;
  drmPolicy?: KtnDrmPolicy;
  drmPlayback?: KtnDrmPlaybackInfo | null;
  isDrmLoading?: boolean;
  drmPlaybackError?: string | null;
  onCapabilityChecked?: (report: DrmCapabilityReport) => void;
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
  drmEnabled = false,
  drmPolicy = 'drmDisabled',
  drmPlayback = null,
  isDrmLoading = false,
  drmPlaybackError = null,
  onCapabilityChecked,
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
  const shakaRef = useRef<InstanceType<ShakaStatic['Player']> | null>(null);
  const shakaErrorHandledRef = useRef<boolean>(false);

  const [internalStatus, setInternalStatus] = useState<VideoPlayerStatus>('loading');
  const [playbackRate, setPlaybackRate] = useState<number>(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isMuted, setIsMuted] = useState(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState(false);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState(false);
  const [wmPos, setWmPos] = useState<{ top: number; left: number }>({ top: 14, left: 10 });
  const [clockTick, setClockTick] = useState<number>(() => Date.now());
  const [drmError, setDrmError] = useState<DrmStructuredError | null>(null);
  const [activeDrmSystem, setActiveDrmSystem] = useState<KtnDrmSystem | null>(null);
  const [fallbackNotice, setFallbackNotice] = useState<string | null>(null);
  const [qualityOptions, setQualityOptions] = useState<VideoQualityOption[]>([]);
  const [selectedQualityId, setSelectedQualityId] = useState<string>('auto');

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

  const onCapabilityCheckedRef = useRef(onCapabilityChecked);
  onCapabilityCheckedRef.current = onCapabilityChecked;

  const cleanupHls = useCallback(() => {
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
  }, []);

  const cleanupShaka = useCallback(() => {
    if (shakaRef.current) {
      const instance = shakaRef.current;
      shakaRef.current = null;
      void instance.destroy().catch(() => {});
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
      cleanupShaka();
      setDrmError(null);
      setActiveDrmSystem(null);
      setFallbackNotice(null);
      setQualityOptions([]);
      setSelectedQualityId('auto');
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

    const videoEl = videoRef.current;
    if (!videoEl) return;

    cleanupHls();
    cleanupShaka();
    shakaErrorHandledRef.current = false;
    setDrmError(null);
    setActiveDrmSystem(null);
    setFallbackNotice(null);
    setQualityOptions([]);
    setSelectedQualityId('auto');
    setInternalStatus('loading');

    let cancelled = false;

    const startHlsOrDirectPlayback = (targetUrl: string, allowRawFallback: boolean) => {
      const isM3u8 = /\.m3u8(\?|$)/i.test(targetUrl);
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

              hls.loadSource(targetUrl);
              hls.attachMedia(videoEl);

              hls.on(HlsLib.Events.MANIFEST_PARSED, () => {
                if (cancelled) return;
                const seenHeights = new Set<number>();
                const nextOptions: VideoQualityOption[] = [];
                (hls.levels || []).forEach((lvl, idx) => {
                  const h = Number(lvl?.height || 0);
                  if (h > 0 && !seenHeights.has(h)) {
                    seenHeights.add(h);
                    nextOptions.push({
                      id: String(idx),
                      label: `${h}p`,
                      height: h,
                      levelIndex: idx,
                    });
                  }
                });
                nextOptions.sort((a, b) => b.height - a.height);
                setQualityOptions(nextOptions);
                setInternalStatus('ready');
              });

              let mediaRecoveredOnce = false;
              hls.on(HlsLib.Events.ERROR, (_event, data) => {
                if (cancelled) return;
                if (data.fatal) {
                  switch (data.type) {
                    case HlsLib.ErrorTypes.NETWORK_ERROR:
                      if (
                        allowRawFallback &&
                        fallbackVideoUrl &&
                        fallbackVideoUrl !== targetUrl
                      ) {
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
              videoEl.src = targetUrl;
              setInternalStatus('ready');
            } else {
              setInternalStatus('error');
            }
          })
          .catch(() => {
            if (!cancelled) setInternalStatus('error');
          });
      } else {
        videoEl.src = targetUrl;
        setInternalStatus('ready');
      }
    };

    if (drmEnabled) {
      if (drmPlaybackError) {
        setDrmError({
          code: 'DRM_LICENSE_DENIED',
          title: tr('Không thể khởi tạo phiên phát DRM', 'Unable to initialize DRM session'),
          description: drmPlaybackError,
        });
        setInternalStatus('error');
        return () => {
          cancelled = true;
        };
      }

      if (isDrmLoading) {
        return () => {
          cancelled = true;
        };
      }

      if (!drmPlayback) {
        setDrmError({
          code: 'DRM_LICENSE_UNCONFIGURED',
          title: tr(
            'Chưa nhận được cấu hình phiên DRM từ máy chủ',
            'DRM playback session configuration is missing'
          ),
          description: tr(
            'Vui lòng thử tải lại bài giảng để đồng bộ quyền phát DRM.',
            'Please retry loading this lesson to refresh your DRM playback token.'
          ),
        });
        setInternalStatus('error');
        return () => {
          cancelled = true;
        };
      }

      void (async () => {
        let chosenDrmSystem: KtnDrmSystem | null = null;
        try {
          const capReport = await detectDrmCapabilities();
          if (cancelled) return;
          onCapabilityCheckedRef.current?.(capReport);

          const decision = selectDrmPlaybackPlan(capReport, drmPlayback, lang);
          if (cancelled) return;
          chosenDrmSystem = decision.drmSystem;

          if (decision.mode === 'blocked') {
            setDrmError(
              decision.error ||
                buildUnsupportedDrmError('DRM_BROWSER_UNSUPPORTED', capReport, lang)
            );
            setInternalStatus('error');
            return;
          }

          if (decision.mode === 'hls-fallback') {
            if (drmPolicy === 'drmRequired' || drmPlayback.policy === 'drmRequired') {
              setDrmError(buildUnsupportedDrmError('DRM_BROWSER_UNSUPPORTED', capReport, lang));
              setInternalStatus('error');
              return;
            }
            const fallbackSrc =
              drmPlayback.fallbackStreamUrl || streamUrl || fallbackVideoUrl;
            if (!fallbackSrc) {
              setDrmError(buildUnsupportedDrmError('DRM_CONTENT_NOT_PACKAGED', capReport, lang));
              setInternalStatus('error');
              return;
            }
            setFallbackNotice(decision.fallbackNotice);
            startHlsOrDirectPlayback(fallbackSrc, false);
            return;
          }

          const targetManifest =
            decision.drmSystem === 'fairplay'
              ? drmPlayback.manifests?.hlsFairPlayUrl
              : drmPlayback.manifests?.dashUrl;

          if (!targetManifest || !decision.drmSystem) {
            setDrmError(buildUnsupportedDrmError('DRM_CONTENT_NOT_PACKAGED', capReport, lang));
            setInternalStatus('error');
            return;
          }

          const shaka = await loadShakaPlayer();
          if (cancelled) return;

          const player = new shaka.Player();
          shakaRef.current = player;

          const sessionToken = String(getStoredSession()?.token || '').trim();
          const authHeaderValue =
            sessionToken &&
            sessionToken !== 'DEMO-MODE-ONLY' &&
            !sessionToken.startsWith('KTN-')
              ? toHttpHeaderSafeValue(`Bearer ${sessionToken}`)
              : '';

          const netEngine = player.getNetworkingEngine();
          const licenseReqType = shaka.net?.NetworkingEngine?.RequestType?.LICENSE;
          if (netEngine) {
            netEngine.registerRequestFilter((type, request) => {
              const primaryUri = Array.isArray(request.uris)
                ? String(request.uris[0] || '')
                : '';
              if (primaryUri.includes('/api/ktn/drm/')) {
                if (authHeaderValue) {
                  request.headers['Authorization'] = authHeaderValue;
                }
                if (drmPlayback.drmToken) {
                  request.headers['X-KTN-DRM-Token'] = drmPlayback.drmToken;
                }
              }
              if (
                decision.drmSystem === 'fairplay' &&
                licenseReqType !== undefined &&
                type === licenseReqType &&
                !request.headers['Content-Type'] &&
                !request.headers['content-type']
              ) {
                request.headers['Content-Type'] = 'application/octet-stream';
              }
            });

            if (decision.drmSystem === 'fairplay') {
              netEngine.registerResponseFilter((type, response, context) => {
                if (licenseReqType !== undefined && type === licenseReqType) {
                  shaka.drm?.FairPlay?.commonFairPlayResponse?.(type, response, context);
                }
              });
            }
          }

          const drmConfig: Record<string, unknown> = {};
          if (decision.drmSystem === 'fairplay') {
            drmConfig.initDataTransform = createFairPlayInitDataTransform(shaka);
            drmConfig.servers = {
              [DRM_KEY_SYSTEMS.fairplay]: drmPlayback.licenseEndpoints.fairplay,
              [DRM_KEY_SYSTEMS.fairplayLegacy]: drmPlayback.licenseEndpoints.fairplay,
            };
            drmConfig.preferredKeySystems = [
              DRM_KEY_SYSTEMS.fairplay,
              DRM_KEY_SYSTEMS.fairplayLegacy,
            ];
            drmConfig.advanced = {
              [DRM_KEY_SYSTEMS.fairplay]: {
                serverCertificateUri: drmPlayback.fairplayCertificateUrl,
              },
              [DRM_KEY_SYSTEMS.fairplayLegacy]: {
                serverCertificateUri: drmPlayback.fairplayCertificateUrl,
              },
            };
          } else if (decision.drmSystem === 'playready') {
            const prRob = capReport.playready.maxRobustness
              ? [capReport.playready.maxRobustness]
              : ['2000'];
            const useLegacyPrOnly =
              capReport.playready.keySystem === DRM_KEY_SYSTEMS.playready;
            drmConfig.keySystemsMapping = {
              [DRM_KEY_SYSTEMS.playready]: DRM_KEY_SYSTEMS.playreadyRecommendation,
            };
            drmConfig.preferredKeySystems = useLegacyPrOnly
              ? [DRM_KEY_SYSTEMS.playready, DRM_KEY_SYSTEMS.playreadyRecommendation]
              : [DRM_KEY_SYSTEMS.playreadyRecommendation, DRM_KEY_SYSTEMS.playready];
            drmConfig.servers = {
              [DRM_KEY_SYSTEMS.playready]: drmPlayback.licenseEndpoints.playready,
              [DRM_KEY_SYSTEMS.playreadyRecommendation]: drmPlayback.licenseEndpoints.playready,
            };
            drmConfig.advanced = {
              [DRM_KEY_SYSTEMS.playreadyRecommendation]: {
                videoRobustness: prRob,
                audioRobustness: ['2000', ''],
              },
              [DRM_KEY_SYSTEMS.playready]: useLegacyPrOnly
                ? {
                    videoRobustness: [''],
                    audioRobustness: [''],
                  }
                : {
                    videoRobustness: prRob,
                    audioRobustness: ['2000', ''],
                  },
            };
          } else {
            const wvRob = capReport.widevine.maxRobustness
              ? [capReport.widevine.maxRobustness]
              : ['SW_SECURE_CRYPTO'];
            drmConfig.preferredKeySystems = [DRM_KEY_SYSTEMS.widevine];
            drmConfig.servers = {
              [DRM_KEY_SYSTEMS.widevine]: drmPlayback.licenseEndpoints.widevine,
            };
            drmConfig.advanced = {
              [DRM_KEY_SYSTEMS.widevine]: {
                videoRobustness: wvRob,
                audioRobustness: ['SW_SECURE_CRYPTO'],
              },
            };
          }

          player.configure({
            drm: drmConfig,
            ...(decision.drmSystem === 'fairplay'
              ? {
                  streaming: {
                    useNativeHlsForFairPlay: true,
                    fallbackToNativeHlsOnMseError: true,
                  },
                }
              : {}),
            restrictions: { maxHeight: 1080 },
          });

          const syncShakaTracks = () => {
            if (cancelled || !shakaRef.current) return;
            const seenHeights = new Set<number>();
            const nextOptions: VideoQualityOption[] = [];
            const sortedTracks = [...(shakaRef.current.getVariantTracks() || [])].sort(
              (a, b) =>
                Number(b.height || 0) - Number(a.height || 0) ||
                Number(b.bandwidth || 0) - Number(a.bandwidth || 0)
            );
            for (const track of sortedTracks) {
              const h = Number(track.height || 0);
              if (h > 0 && !seenHeights.has(h)) {
                seenHeights.add(h);
                nextOptions.push({
                  id: String(track.id),
                  label: `${h}p`,
                  height: h,
                  trackId: track.id,
                });
              }
            }
            nextOptions.sort((a, b) => b.height - a.height);
            setQualityOptions(nextOptions);
          };

          player.addEventListener('trackschanged', syncShakaTracks);
          player.addEventListener('error', (event: Event) => {
            if (cancelled) return;
            const detail =
              'detail' in event
                ? (event as CustomEvent<unknown>).detail
                : event;
            shakaErrorHandledRef.current = true;
            cleanupShaka();
            setDrmError(classifyDrmError(detail, decision.drmSystem, lang));
            setInternalStatus('error');
          });

          await player.attach(videoEl);
          if (cancelled) {
            await player.destroy().catch(() => {});
            return;
          }

          await player.load(targetManifest);
          if (cancelled) {
            await player.destroy().catch(() => {});
            return;
          }

          if (!player.drmInfo()?.keySystem) {
            throw new Error('DRM keySystem was not activated by browser CDM');
          }

          syncShakaTracks();
          setActiveDrmSystem(decision.drmSystem);
          setInternalStatus('ready');
        } catch (err) {
          if (cancelled) return;
          shakaErrorHandledRef.current = true;
          cleanupShaka();
          setDrmError(classifyDrmError(err, chosenDrmSystem, lang));
          setInternalStatus('error');
        }
      })();

      return () => {
        cancelled = true;
        cleanupHls();
        cleanupShaka();
      };
    }

    const activeUrl = streamUrl || fallbackVideoUrl;
    if (!activeUrl) {
      setInternalStatus('loading');
      return () => {
        cancelled = true;
        cleanupHls();
        cleanupShaka();
      };
    }

    startHlsOrDirectPlayback(activeUrl, true);

    return () => {
      cancelled = true;
      cleanupHls();
      cleanupShaka();
    };
  }, [
    streamUrl,
    fallbackVideoUrl,
    drmEnabled,
    drmPolicy,
    drmPlayback,
    isDrmLoading,
    drmPlaybackError,
    statusOverride,
    lang,
    tr,
    cleanupHls,
    cleanupShaka,
  ]);

  const handleSpeedChange = (rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) {
      videoRef.current.playbackRate = rate;
    }
  };

  const handleQualityChange = (nextValue: string) => {
    setSelectedQualityId(nextValue);
    if (shakaRef.current) {
      if (nextValue === 'auto') {
        shakaRef.current.configure('abr.enabled', true);
        return;
      }
      const targetId = Number(nextValue);
      const track = (shakaRef.current.getVariantTracks() || []).find(
        (t) => t.id === targetId
      );
      if (track) {
        shakaRef.current.configure('abr.enabled', false);
        shakaRef.current.selectVariantTrack(track, true);
      }
      return;
    }
    if (hlsRef.current) {
      if (nextValue === 'auto') {
        hlsRef.current.currentLevel = -1;
      } else {
        const levelIdx = Number(nextValue);
        if (Number.isFinite(levelIdx)) {
          hlsRef.current.currentLevel = levelIdx;
        }
      }
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

          {/* State 2: Stream / DRM Error */}
          {effectiveStatus === 'error' && (
            <div
              data-testid="video-error-state"
              data-drm-error-code={drmError?.code || undefined}
              className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-stone-950/95 p-5 text-center text-white"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-500/20 text-red-400 ring-1 ring-red-400/40 sm:h-14 sm:w-14">
                <AlertTriangle className="h-6 w-6 sm:h-7 sm:w-7" />
              </div>
              <h3 className="mt-2.5 font-display text-sm font-bold sm:text-base">
                {drmError?.title ||
                  tr('Không tải được video bài giảng', 'Unable to load lesson video')}
              </h3>
              <p className="mt-1 max-w-md text-xs leading-relaxed text-stone-300">
                {drmError?.description ||
                  tr(
                    'Đường truyền mạng đang gián đoạn hoặc phiên xem video đã hết hạn. Hãy nhấn thử lại để phát tiếp.',
                    'Your network connection was interrupted or the video session expired. Click retry to continue watching.'
                  )}
              </p>
              {drmError?.browserGuidance && (
                <p
                  data-testid="drm-error-guidance"
                  className="mt-2 max-w-md rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-[11px] font-medium text-amber-200"
                >
                  {drmError.browserGuidance}
                </p>
              )}
              <button
                type="button"
                data-testid="retry-video-stream-btn"
                onClick={onRetryStream}
                className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2 text-xs font-bold text-white shadow-md hover:bg-red-600"
              >
                <RotateCcw className="h-4 w-4" />
                <span>{tr('Thử tải lại video', 'Retry Video')}</span>
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
              if (e.currentTarget.playbackRate !== playbackRate) {
                e.currentTarget.playbackRate = playbackRate;
              }
              setInternalStatus('ready');
            }}
            onError={(e) => {
              if (shakaErrorHandledRef.current) {
                return;
              }
              if (drmEnabled && shakaRef.current) {
                const mediaErr = e.currentTarget.error;
                setDrmError(
                  classifyDrmError(
                    { code: 3016, message: mediaErr?.message || '' },
                    activeDrmSystem,
                    lang
                  )
                );
              }
              cleanupHls();
              cleanupShaka();
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

        {/* Non-DRM Compatibility Notice when drmFallbackAllowed is active */}
        {fallbackNotice && (
          <div
            data-testid="drm-fallback-notice"
            className="flex items-center gap-2 border-t border-amber-700/40 bg-amber-950/70 px-3 py-1.5 text-[11px] text-amber-200"
          >
            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-amber-400" />
            <span>{fallbackNotice}</span>
          </div>
        )}

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

              {activeDrmSystem && (
                <span
                  data-testid="drm-active-badge"
                  className="inline-flex items-center gap-1 rounded-md border border-emerald-500/40 bg-emerald-950/60 px-2 py-1 text-[10.5px] font-bold uppercase tracking-wider text-emerald-300"
                >
                  <ShieldCheck className="h-3 w-3 text-emerald-400" />
                  <span>
                    {activeDrmSystem === 'fairplay'
                      ? 'FairPlay DRM'
                      : activeDrmSystem === 'playready'
                      ? 'PlayReady DRM'
                      : 'Widevine DRM'}
                  </span>
                </span>
              )}
            </div>

            {/* Quality, Speed, Q&A, Completion & Protected Fullscreen Actions */}
            <div className="flex flex-wrap items-center gap-1.5">
              {qualityOptions.length > 0 && (
                <select
                  data-testid="video-quality-select"
                  value={selectedQualityId}
                  onChange={(e) => handleQualityChange(e.target.value)}
                  disabled={lockedControls}
                  aria-label={tr('Chất lượng video', 'Video quality')}
                  className="h-[26px] rounded-lg border border-stone-700 bg-stone-800 px-1.5 text-[10.5px] font-bold text-stone-200 focus:border-amber-500 focus:outline-none disabled:opacity-40"
                >
                  <option value="auto">{tr('Tự động', 'Auto')}</option>
                  {qualityOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              )}

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
