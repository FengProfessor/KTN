import shaka from 'shaka-player';
import {
  detectDrmCapabilities,
  type DrmCapabilityReport,
} from '../../src/features/learning/utils/drmCapability';

export const DRM_POC_KEY_SYSTEMS = {
  fairPlay: 'com.apple.fps',
  widevine: 'com.widevine.alpha',
  playReady: 'com.microsoft.playready',
  playReadyRecommendation: 'com.microsoft.playready.recommendation',
} as const;

export type DemoDrmConfiguration = Partial<
  Pick<
    shaka.extern.DrmConfiguration,
    'servers' | 'keySystemsMapping' | 'preferredKeySystems' | 'initDataTransform'
  >
> & {
  advanced: Record<string, Partial<shaka.extern.AdvancedDrmConfiguration>>;
};

export interface DemoProfile {
  label: string;
  isPublicTestOnly: true;
  manifest: string;
  drm: DemoDrmConfiguration;
  streaming?: Partial<shaka.extern.StreamingConfiguration>;
  cencProbe?: { keySystem: string; robustness: string };
}

/**
 * POC public test profiles only (Shaka UAT / EZDRM demo / Microsoft PlayReady test server).
 * NEVER use these profiles or URLs to protect production KTN course videos.
 */
export function getDemoProfile(value: string): DemoProfile {
  if (value === 'fairplay') {
    return {
      label: 'FairPlay (Public POC Demo)',
      isPublicTestOnly: true,
      manifest: 'https://fps.ezdrm.com/demo/video/ezdrm.m3u8',
      streaming: {
        useNativeHlsForFairPlay: true,
        fallbackToNativeHlsOnMseError: true,
      },
      drm: {
        preferredKeySystems: [DRM_POC_KEY_SYSTEMS.fairPlay],
        initDataTransform: shaka.drm?.FairPlay?.ezdrmInitDataTransform,
        servers: {
          [DRM_POC_KEY_SYSTEMS.fairPlay]:
            'https://fps.ezdrm.com/api/licenses/09cc0377-6dd4-40cb-b09d-b582236e70fe',
        },
        advanced: {
          [DRM_POC_KEY_SYSTEMS.fairPlay]: {
            serverCertificateUri: 'https://fps.ezdrm.com/demo/video/eleisure.cer',
          },
        },
      },
    };
  }

  if (value === 'widevine-hardware' || value === 'widevine-software') {
    const robustness = value === 'widevine-hardware' ? 'HW_SECURE_ALL' : 'SW_SECURE_CRYPTO';
    return {
      label: `Widevine ${robustness} (Public POC Demo)`,
      isPublicTestOnly: true,
      manifest: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
      cencProbe: { keySystem: DRM_POC_KEY_SYSTEMS.widevine, robustness },
      drm: {
        servers: {
          [DRM_POC_KEY_SYSTEMS.widevine]: 'https://proxy.uat.widevine.com/proxy',
        },
        advanced: {
          [DRM_POC_KEY_SYSTEMS.widevine]: {
            videoRobustness: [robustness],
            serverCertificateUri: 'https://cwip-shaka-proxy.appspot.com/service-cert',
          },
        },
      },
    };
  }

  const robustness = value === '3000' ? '3000' : '2000';
  const keyId = '6f651ae1-dbe4-4434-bcb4-690d1564c41c';
  return {
    label: `PlayReady SL${robustness} (Public Test Server - POC Only)`,
    isPublicTestOnly: true,
    manifest:
      'https://test.playready.microsoft.com/media/profficialsite/tearsofsteel_4k.ism/manifest.mpd',
    cencProbe: { keySystem: DRM_POC_KEY_SYSTEMS.playReadyRecommendation, robustness },
    drm: {
      keySystemsMapping: {
        [DRM_POC_KEY_SYSTEMS.playReady]: DRM_POC_KEY_SYSTEMS.playReadyRecommendation,
      },
      preferredKeySystems: [DRM_POC_KEY_SYSTEMS.playReadyRecommendation],
      servers: {
        [DRM_POC_KEY_SYSTEMS.playReady]: `https://test.playready.microsoft.com/service/rightsmanager.asmx?cfg=(kid:${keyId},sl:${robustness},persist:false)`,
      },
      advanced: {
        [DRM_POC_KEY_SYSTEMS.playReadyRecommendation]: { videoRobustness: [robustness] },
      },
    },
  };
}

export function formatDrmHarnessError(error: unknown): string {
  if (typeof shaka !== 'undefined' && shaka.util?.Error && error instanceof shaka.util.Error) {
    return `Shaka ${error.code}`;
  }
  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Lỗi chưa xác định';
}

export async function runDrmCapabilityProbe(): Promise<DrmCapabilityReport> {
  return detectDrmCapabilities();
}

export function initManualDrmHarness(root: ParentNode = document): {
  player: shaka.Player;
  destroy: () => Promise<void>;
} {
  const video = root.querySelector<HTMLVideoElement>('video');
  const form = root.querySelector<HTMLFormElement>('form');
  const level = root.querySelector<HTMLSelectElement>('#level');
  const button = root.querySelector<HTMLButtonElement>('button');
  const status = root.querySelector<HTMLElement>('#status');
  const capabilitiesEl = root.querySelector<HTMLElement>('#capabilities');

  if (!video || !form || !level || !button || !status) {
    throw new Error('[DRM] Thiếu phần tử kiểm thử.');
  }

  shaka.polyfill.installAll();
  const player = new shaka.Player();
  let loadedLabel: string | undefined;

  void runDrmCapabilityProbe().then((report) => {
    if (capabilitiesEl) {
      capabilitiesEl.textContent = JSON.stringify(report, null, 2);
    }
  });

  player.getNetworkingEngine()?.registerRequestFilter((type, request, context) => {
    if (request.drmInfo?.keySystem === DRM_POC_KEY_SYSTEMS.fairPlay) {
      shaka.drm.FairPlay.ezdrmFairPlayRequest(type, request, context);
    }
  });
  player.getNetworkingEngine()?.registerResponseFilter((type, response, context) => {
    if (player.drmInfo()?.keySystem === DRM_POC_KEY_SYSTEMS.fairPlay) {
      shaka.drm.FairPlay.commonFairPlayResponse(type, response, context);
    }
  });

  player.addEventListener('error', (event) => {
    const detail = 'detail' in event ? (event as CustomEvent<unknown>).detail : event;
    status.textContent = `Lỗi phát DRM (${formatDrmHarnessError(detail)}).`;
  });
  video.addEventListener('playing', () => {
    if (loadedLabel) status.textContent = `Đang phát ${loadedLabel}.`;
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!window.isSecureContext) {
      status.textContent = 'Mở trang thử qua HTTPS hoặc localhost để phát DRM.';
      return;
    }

    const profile = getDemoProfile(level.value);
    button.disabled = true;
    loadedLabel = undefined;
    status.textContent = `Đang kiểm tra ${profile.label}…`;

    try {
      await player.unload();
      player.resetConfiguration();
      if (profile.cencProbe) {
        const { keySystem, robustness } = profile.cencProbe;
        if (!navigator.requestMediaKeySystemAccess) {
          throw new DOMException('Thiếu API EME', 'NotSupportedError');
        }
        await navigator.requestMediaKeySystemAccess(keySystem, [
          {
            initDataTypes: ['cenc'],
            sessionTypes: ['temporary'],
            videoCapabilities: [{ contentType: 'video/mp4; codecs="avc1.640028"', robustness }],
          },
        ]);
      }

      player.configure({
        drm: profile.drm,
        ...(profile.streaming ? { streaming: profile.streaming } : {}),
        restrictions: { maxHeight: 1080 },
      });
      await player.attach(video);
      await player.load(profile.manifest);
      if (!player.drmInfo()?.keySystem) throw new Error('Video chưa có phiên DRM');
      loadedLabel = profile.label;
      status.textContent = `Đã nạp ${profile.label}. Bấm Phát để thử quay.`;
    } catch (error: unknown) {
      const unsupported =
        (error instanceof DOMException && error.name === 'NotSupportedError') ||
        (error instanceof shaka.util.Error &&
          error.code === shaka.util.Error.Code.REQUESTED_KEY_SYSTEM_CONFIG_UNAVAILABLE);
      if (unsupported) {
        status.textContent = `Trình duyệt hoặc thiết bị không hỗ trợ ${profile.label}.`;
      } else {
        console.error('[DRM] Không nạp được video mẫu.', error);
        status.textContent = `Không nạp được ${profile.label} (${formatDrmHarnessError(error)}).`;
      }
    } finally {
      button.disabled = false;
    }
  });

  return {
    player,
    destroy: async () => {
      await player.destroy();
    },
  };
}

if (
  typeof document !== 'undefined' &&
  document.querySelector('#level') &&
  document.querySelector('video')
) {
  initManualDrmHarness(document);
}
