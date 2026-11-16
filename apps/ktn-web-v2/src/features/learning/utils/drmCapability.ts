import type { AppLanguage } from '@/i18n';
import type { KtnDrmPlaybackInfo, KtnDrmPolicy, KtnDrmSystem } from '@/types/ktn.types';

export const DRM_KEY_SYSTEMS = {
  fairplay: 'com.apple.fps',
  fairplayLegacy: 'com.apple.fps.1_0',
  widevine: 'com.widevine.alpha',
  playready: 'com.microsoft.playready',
  playreadyRecommendation: 'com.microsoft.playready.recommendation',
} as const;

export type DrmErrorCode =
  | 'DRM_INSECURE_CONTEXT'
  | 'DRM_BROWSER_UNSUPPORTED'
  | 'DRM_EMBEDDED_WEBVIEW'
  | 'DRM_LICENSE_UNCONFIGURED'
  | 'DRM_CONTENT_NOT_PACKAGED'
  | 'DRM_LICENSE_DENIED'
  | 'DRM_CODEC_UNSUPPORTED'
  | 'DRM_MEDIA_ERROR'
  | 'DRM_SESSION_EXPIRED'
  | 'DRM_UNKNOWN_ERROR';

export interface DrmStructuredError {
  code: DrmErrorCode;
  title: string;
  description: string;
  browserGuidance?: string;
}

export interface DrmCapabilityReport {
  isSecureContext: boolean;
  hasEme: boolean;
  hasMediaSource: boolean;
  supportsNativeHls: boolean;
  isEmbeddedWebView: boolean;
  embeddedWebViewName: string | null;
  fairplay: {
    supported: boolean;
    keySystem: string | null;
    hardwareBackedLikely: boolean;
  };
  widevine: {
    supported: boolean;
    keySystem: string | null;
    maxRobustness: 'HW_SECURE_ALL' | 'HW_SECURE_CRYPTO' | 'SW_SECURE_CRYPTO' | null;
    hardwareBacked: boolean;
  };
  playready: {
    supported: boolean;
    keySystem: string | null;
    maxRobustness: '3000' | '2000' | null;
    hardwareBacked: boolean;
  };
  preferredDrm: KtnDrmSystem | null;
  securityTier: 'hardware' | 'software' | 'none';
  captureProtectionGuaranteed: false;
  checkedAt: string;
}

export interface DrmPlaybackDecision {
  mode: 'shaka-drm' | 'hls-fallback' | 'blocked';
  drmSystem: KtnDrmSystem | null;
  fallbackNotice: string | null;
  error: DrmStructuredError | null;
}

function detectEmbeddedWebView(ua: string): { isEmbedded: boolean; appName: string | null } {
  const s = String(ua || '');
  if (/Zalo/i.test(s)) return { isEmbedded: true, appName: 'Zalo' };
  if (/FBAN|FBAV|FB_IAB/i.test(s)) return { isEmbedded: true, appName: 'Facebook' };
  if (/Instagram/i.test(s)) return { isEmbedded: true, appName: 'Instagram' };
  if (/Line\//i.test(s)) return { isEmbedded: true, appName: 'LINE' };
  return { isEmbedded: false, appName: null };
}

async function probeKeySystem(
  keySystem: string,
  configs: MediaKeySystemConfiguration[]
): Promise<boolean> {
  if (
    typeof navigator === 'undefined' ||
    typeof navigator.requestMediaKeySystemAccess !== 'function'
  ) {
    return false;
  }
  try {
    await navigator.requestMediaKeySystemAccess(keySystem, configs);
    return true;
  } catch {
    return false;
  }
}

function hasLegacyWebKitFairPlaySupport(supportsNativeHls: boolean): boolean {
  if (!supportsNativeHls || typeof window === 'undefined') return false;
  const wmk = (
    window as unknown as {
      WebKitMediaKeys?: { isTypeSupported?: (ks: string, type: string) => boolean };
    }
  ).WebKitMediaKeys;
  if (!wmk) return false;
  if (typeof wmk.isTypeSupported === 'function') {
    try {
      return Boolean(
        wmk.isTypeSupported(DRM_KEY_SYSTEMS.fairplayLegacy, 'video/mp4') ||
          wmk.isTypeSupported(DRM_KEY_SYSTEMS.fairplay, 'video/mp4')
      );
    } catch {
      return false;
    }
  }
  return true;
}

export async function detectDrmCapabilities(): Promise<DrmCapabilityReport> {
  const isSecureContext =
    typeof window !== 'undefined' ? Boolean(window.isSecureContext) : false;
  const hasEme =
    typeof navigator !== 'undefined' &&
    typeof navigator.requestMediaKeySystemAccess === 'function';
  const hasMediaSource =
    typeof window !== 'undefined' && typeof window.MediaSource !== 'undefined';

  let supportsNativeHls = false;
  if (typeof document !== 'undefined') {
    try {
      const probeVideo = document.createElement('video');
      supportsNativeHls = Boolean(
        probeVideo.canPlayType('application/vnd.apple.mpegurl') ||
          probeVideo.canPlayType('application/x-mpegURL')
      );
    } catch {
      supportsNativeHls = false;
    }
  }

  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const embedded = detectEmbeddedWebView(ua);

  const report: DrmCapabilityReport = {
    isSecureContext,
    hasEme,
    hasMediaSource,
    supportsNativeHls,
    isEmbeddedWebView: embedded.isEmbedded,
    embeddedWebViewName: embedded.appName,
    fairplay: { supported: false, keySystem: null, hardwareBackedLikely: false },
    widevine: {
      supported: false,
      keySystem: null,
      maxRobustness: null,
      hardwareBacked: false,
    },
    playready: {
      supported: false,
      keySystem: null,
      maxRobustness: null,
      hardwareBacked: false,
    },
    preferredDrm: null,
    securityTier: 'none',
    captureProtectionGuaranteed: false,
    checkedAt: new Date().toISOString(),
  };

  if (!isSecureContext || !hasEme) {
    // Check legacy WebKitMediaKeys for older Safari FairPlay presence only as capability hint
    if (isSecureContext && hasLegacyWebKitFairPlaySupport(supportsNativeHls)) {
      report.fairplay = {
        supported: true,
        keySystem: DRM_KEY_SYSTEMS.fairplayLegacy,
        hardwareBackedLikely: true,
      };
      report.preferredDrm = 'fairplay';
      report.securityTier = 'hardware';
    }
    return report;
  }

  const h264HighMime = 'video/mp4; codecs="avc1.640028"';
  const h264BaselineMime = 'video/mp4; codecs="avc1.42E01E"';
  const aacAudioMime = 'audio/mp4; codecs="mp4a.40.2"';

  // Probe PlayReady (SL3000 -> SL2000 -> legacy keySystem)
  const pr3000 = await probeKeySystem(DRM_KEY_SYSTEMS.playreadyRecommendation, [
    {
      initDataTypes: ['cenc'],
      sessionTypes: ['temporary'],
      videoCapabilities: [
        { contentType: h264HighMime, robustness: '3000' },
        { contentType: h264BaselineMime, robustness: '3000' },
      ],
      audioCapabilities: [{ contentType: aacAudioMime, robustness: '2000' }],
    },
  ]);
  if (pr3000) {
    report.playready = {
      supported: true,
      keySystem: DRM_KEY_SYSTEMS.playreadyRecommendation,
      maxRobustness: '3000',
      hardwareBacked: true,
    };
  } else {
    const pr2000 = await probeKeySystem(DRM_KEY_SYSTEMS.playreadyRecommendation, [
      {
        initDataTypes: ['cenc'],
        sessionTypes: ['temporary'],
        videoCapabilities: [
          { contentType: h264HighMime, robustness: '2000' },
          { contentType: h264BaselineMime, robustness: '2000' },
        ],
      },
    ]);
    if (pr2000) {
      report.playready = {
        supported: true,
        keySystem: DRM_KEY_SYSTEMS.playreadyRecommendation,
        maxRobustness: '2000',
        hardwareBacked: false,
      };
    } else {
      const prLegacy = await probeKeySystem(DRM_KEY_SYSTEMS.playready, [
        {
          initDataTypes: ['cenc'],
          sessionTypes: ['temporary'],
          videoCapabilities: [
            { contentType: h264HighMime },
            { contentType: h264BaselineMime },
          ],
        },
      ]);
      if (prLegacy) {
        report.playready = {
          supported: true,
          keySystem: DRM_KEY_SYSTEMS.playready,
          maxRobustness: '2000',
          hardwareBacked: false,
        };
      }
    }
  }

  // Probe Widevine (HW_SECURE_ALL -> HW_SECURE_CRYPTO -> SW_SECURE_CRYPTO)
  const wvHwAll = await probeKeySystem(DRM_KEY_SYSTEMS.widevine, [
    {
      initDataTypes: ['cenc'],
      sessionTypes: ['temporary'],
      videoCapabilities: [
        { contentType: h264HighMime, robustness: 'HW_SECURE_ALL' },
        { contentType: h264BaselineMime, robustness: 'HW_SECURE_ALL' },
      ],
      audioCapabilities: [{ contentType: aacAudioMime, robustness: 'SW_SECURE_CRYPTO' }],
    },
  ]);
  if (wvHwAll) {
    report.widevine = {
      supported: true,
      keySystem: DRM_KEY_SYSTEMS.widevine,
      maxRobustness: 'HW_SECURE_ALL',
      hardwareBacked: true,
    };
  } else {
    const wvHwCrypto = await probeKeySystem(DRM_KEY_SYSTEMS.widevine, [
      {
        initDataTypes: ['cenc'],
        sessionTypes: ['temporary'],
        videoCapabilities: [
          { contentType: h264HighMime, robustness: 'HW_SECURE_CRYPTO' },
          { contentType: h264BaselineMime, robustness: 'HW_SECURE_CRYPTO' },
        ],
      },
    ]);
    if (wvHwCrypto) {
      report.widevine = {
        supported: true,
        keySystem: DRM_KEY_SYSTEMS.widevine,
        maxRobustness: 'HW_SECURE_CRYPTO',
        hardwareBacked: true,
      };
    } else {
      const wvSw = await probeKeySystem(DRM_KEY_SYSTEMS.widevine, [
        {
          initDataTypes: ['cenc'],
          sessionTypes: ['temporary'],
          videoCapabilities: [
            { contentType: h264HighMime, robustness: 'SW_SECURE_CRYPTO' },
            { contentType: h264BaselineMime, robustness: 'SW_SECURE_CRYPTO' },
          ],
        },
      ]);
      if (wvSw) {
        report.widevine = {
          supported: true,
          keySystem: DRM_KEY_SYSTEMS.widevine,
          maxRobustness: 'SW_SECURE_CRYPTO',
          hardwareBacked: false,
        };
      }
    }
  }

  // Probe FairPlay (modern EME com.apple.fps -> com.apple.fps.1_0 -> legacy WebKitMediaKeys)
  const fpsModern = await probeKeySystem(DRM_KEY_SYSTEMS.fairplay, [
    {
      initDataTypes: ['sinf', 'skd', 'cenc'],
      sessionTypes: ['temporary'],
      videoCapabilities: [
        { contentType: h264BaselineMime },
        { contentType: h264HighMime },
      ],
    },
  ]);
  if (fpsModern) {
    report.fairplay = {
      supported: true,
      keySystem: DRM_KEY_SYSTEMS.fairplay,
      hardwareBackedLikely: true,
    };
  } else {
    const fpsLegacy = await probeKeySystem(DRM_KEY_SYSTEMS.fairplayLegacy, [
      {
        initDataTypes: ['sinf', 'skd'],
        sessionTypes: ['temporary'],
        videoCapabilities: [
          { contentType: h264BaselineMime },
          { contentType: h264HighMime },
        ],
      },
    ]);
    if (fpsLegacy) {
      report.fairplay = {
        supported: true,
        keySystem: DRM_KEY_SYSTEMS.fairplayLegacy,
        hardwareBackedLikely: true,
      };
    } else if (hasLegacyWebKitFairPlaySupport(supportsNativeHls)) {
      report.fairplay = {
        supported: true,
        keySystem: DRM_KEY_SYSTEMS.fairplayLegacy,
        hardwareBackedLikely: true,
      };
    }
  }

  // Choose preferred DRM by real EME capability, preferring hardware-backed CDMs first
  if (report.fairplay.supported && supportsNativeHls) {
    report.preferredDrm = 'fairplay';
    report.securityTier = 'hardware';
  } else if (report.playready.supported && report.playready.hardwareBacked) {
    report.preferredDrm = 'playready';
    report.securityTier = 'hardware';
  } else if (report.widevine.supported && report.widevine.hardwareBacked) {
    report.preferredDrm = 'widevine';
    report.securityTier = 'hardware';
  } else if (report.playready.supported) {
    report.preferredDrm = 'playready';
    report.securityTier = 'software';
  } else if (report.widevine.supported) {
    report.preferredDrm = 'widevine';
    report.securityTier = 'software';
  } else if (report.fairplay.supported) {
    report.preferredDrm = 'fairplay';
    report.securityTier = 'hardware';
  }

  return report;
}

export function getCompatibleBrowserGuidance(lang: AppLanguage = 'vi'): string {
  return lang === 'en'
    ? 'Please open this lesson in Safari (iPhone/iPad/Mac), Microsoft Edge (Windows), or Google Chrome / Firefox.'
    : 'Vui lòng mở bài học bằng Safari (iPhone/iPad/Mac), Microsoft Edge (Windows) hoặc Chrome / Firefox.';
}

export function buildUnsupportedDrmError(
  code: DrmErrorCode,
  capabilities: DrmCapabilityReport,
  lang: AppLanguage = 'vi'
): DrmStructuredError {
  const guidance = getCompatibleBrowserGuidance(lang);

  if (code === 'DRM_INSECURE_CONTEXT') {
    return {
      code,
      title:
        lang === 'en'
          ? 'Secure HTTPS connection required for protected video'
          : 'Cần kết nối HTTPS bảo mật để phát video bản quyền',
      description:
        lang === 'en'
          ? 'Protected playback requires HTTPS. Please reopen the portal over https://khongtunhi.com.'
          : 'Video được bảo vệ DRM chỉ hoạt động qua HTTPS. Vui lòng mở lại trang qua https://khongtunhi.com.',
      browserGuidance: guidance,
    };
  }

  if (code === 'DRM_EMBEDDED_WEBVIEW' || capabilities.isEmbeddedWebView) {
    const app = capabilities.embeddedWebViewName || 'app';
    return {
      code: 'DRM_EMBEDDED_WEBVIEW',
      title:
        lang === 'en'
          ? `Protected video cannot play inside ${app} in-app browser`
          : `Trình duyệt trong ${app} không hỗ trợ phát video bảo vệ DRM`,
      description:
        lang === 'en'
          ? `Embedded browsers (${app}) do not expose full DRM decryption.`
          : `Trình duyệt nhúng của ${app} thường khóa API giải mã bản quyền video.`,
      browserGuidance: guidance,
    };
  }

  if (code === 'DRM_LICENSE_UNCONFIGURED') {
    return {
      code,
      title:
        lang === 'en'
          ? 'DRM license service is not configured yet'
          : 'Hệ thống cấp phép DRM chưa được kích hoạt',
      description:
        lang === 'en'
          ? 'This protected lesson requires a verified production DRM license service before playback.'
          : 'Bài giảng đang bật chế độ bảo vệ DRM nhưng chưa cấu hình chứng chỉ/license thương mại trên máy chủ.',
    };
  }

  if (code === 'DRM_CONTENT_NOT_PACKAGED') {
    return {
      code,
      title:
        lang === 'en'
          ? 'Lesson media is not packaged for DRM yet'
          : 'Video bài giảng chưa được đóng gói Multi-DRM',
      description:
        lang === 'en'
          ? 'Protected DASH/FairPlay manifests are missing for this unit.'
          : 'Bài học này chưa có bản đóng gói DASH/FairPlay tương ứng trên CDN.',
    };
  }

  return {
    code: 'DRM_BROWSER_UNSUPPORTED',
    title:
      lang === 'en'
        ? 'This browser/device does not support protected playback'
        : 'Trình duyệt hoặc thiết bị hiện tại chưa hỗ trợ phát video bảo vệ DRM',
    description:
      lang === 'en'
        ? 'Your current browser lacks the required DRM module (FairPlay, PlayReady, or Widevine).'
        : 'Trình duyệt đang dùng không hỗ trợ giải mã bản quyền (FairPlay / PlayReady / Widevine).',
    browserGuidance: guidance,
  };
}

export function selectDrmPlaybackPlan(
  capabilities: DrmCapabilityReport,
  playback: KtnDrmPlaybackInfo,
  lang: AppLanguage = 'vi'
): DrmPlaybackDecision {
  const policy: KtnDrmPolicy = playback.policy || 'drmDisabled';
  const allowFallback =
    policy === 'drmFallbackAllowed' &&
    Boolean(playback.fallbackAllowed && playback.fallbackStreamUrl);

  const fallbackWarningNotice =
    lang === 'en'
      ? 'Compatibility playback with watermark (screen-capture protection is not guaranteed on this browser).'
      : 'Đang phát ở chế độ tương thích kèm watermark (chưa bảo đảm chống quay màn hình trên trình duyệt này).';

  if (!playback.drmActiveForUser || policy === 'drmDisabled') {
    if (playback.fallbackStreamUrl) {
      return {
        mode: 'hls-fallback',
        drmSystem: null,
        fallbackNotice: null,
        error: null,
      };
    }
    return {
      mode: 'blocked',
      drmSystem: null,
      fallbackNotice: null,
      error: buildUnsupportedDrmError('DRM_CONTENT_NOT_PACKAGED', capabilities, lang),
    };
  }

  if (!capabilities.isSecureContext) {
    if (allowFallback) {
      return {
        mode: 'hls-fallback',
        drmSystem: null,
        fallbackNotice: fallbackWarningNotice,
        error: null,
      };
    }
    return {
      mode: 'blocked',
      drmSystem: null,
      fallbackNotice: null,
      error: buildUnsupportedDrmError('DRM_INSECURE_CONTEXT', capabilities, lang),
    };
  }

  // Pick compatible DRM system that has BOTH EME browser support, packaged manifest, and configured server license
  const candidates: Array<{
    sys: KtnDrmSystem;
    emeSupported: boolean;
    hasManifest: boolean;
    licenseConfigured: boolean;
  }> = [];

  if (capabilities.preferredDrm === 'fairplay') {
    candidates.push(
      {
        sys: 'fairplay',
        emeSupported: capabilities.fairplay.supported,
        hasManifest: Boolean(playback.manifests?.hlsFairPlayUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.fairplay?.configured),
      },
      {
        sys: 'playready',
        emeSupported: capabilities.playready.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.playready?.configured),
      },
      {
        sys: 'widevine',
        emeSupported: capabilities.widevine.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.widevine?.configured),
      }
    );
  } else if (capabilities.preferredDrm === 'playready') {
    candidates.push(
      {
        sys: 'playready',
        emeSupported: capabilities.playready.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.playready?.configured),
      },
      {
        sys: 'widevine',
        emeSupported: capabilities.widevine.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.widevine?.configured),
      },
      {
        sys: 'fairplay',
        emeSupported: capabilities.fairplay.supported,
        hasManifest: Boolean(playback.manifests?.hlsFairPlayUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.fairplay?.configured),
      }
    );
  } else {
    candidates.push(
      {
        sys: 'widevine',
        emeSupported: capabilities.widevine.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.widevine?.configured),
      },
      {
        sys: 'playready',
        emeSupported: capabilities.playready.supported,
        hasManifest: Boolean(playback.manifests?.dashUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.playready?.configured),
      },
      {
        sys: 'fairplay',
        emeSupported: capabilities.fairplay.supported,
        hasManifest: Boolean(playback.manifests?.hlsFairPlayUrl),
        licenseConfigured: Boolean(playback.licenseProviders?.fairplay?.configured),
      }
    );
  }

  const readyCandidate = candidates.find(
    (c) => c.emeSupported && c.hasManifest && c.licenseConfigured
  );
  if (readyCandidate) {
    return {
      mode: 'shaka-drm',
      drmSystem: readyCandidate.sys,
      fallbackNotice: null,
      error: null,
    };
  }

  if (allowFallback) {
    return {
      mode: 'hls-fallback',
      drmSystem: null,
      fallbackNotice: fallbackWarningNotice,
      error: null,
    };
  }

  const anyEme = candidates.some((c) => c.emeSupported);
  if (!anyEme) {
    return {
      mode: 'blocked',
      drmSystem: null,
      fallbackNotice: null,
      error: buildUnsupportedDrmError(
        capabilities.isEmbeddedWebView ? 'DRM_EMBEDDED_WEBVIEW' : 'DRM_BROWSER_UNSUPPORTED',
        capabilities,
        lang
      ),
    };
  }

  const anyLicense = candidates.some((c) => c.emeSupported && c.licenseConfigured);
  if (!anyLicense || playback.licenseStatus === 'BLOCKED_MISSING_CREDENTIALS') {
    return {
      mode: 'blocked',
      drmSystem: null,
      fallbackNotice: null,
      error: buildUnsupportedDrmError('DRM_LICENSE_UNCONFIGURED', capabilities, lang),
    };
  }

  return {
    mode: 'blocked',
    drmSystem: null,
    fallbackNotice: null,
    error: buildUnsupportedDrmError('DRM_CONTENT_NOT_PACKAGED', capabilities, lang),
  };
}

export function classifyDrmError(
  error: unknown,
  drmSystem: KtnDrmSystem | null,
  lang: AppLanguage = 'vi'
): DrmStructuredError {
  const guidance = getCompatibleBrowserGuidance(lang);
  const sysLabel =
    drmSystem === 'fairplay'
      ? 'FairPlay'
      : drmSystem === 'playready'
      ? 'PlayReady'
      : drmSystem === 'widevine'
      ? 'Widevine'
      : 'DRM';

  const errObj = error as { code?: number | string; message?: string; name?: string; data?: unknown[] } | null;
  const numericCode = typeof errObj?.code === 'number' ? errObj.code : null;
  const dataText = Array.isArray(errObj?.data)
    ? errObj.data.map((d) => (typeof d === 'object' && d ? JSON.stringify(d) : String(d ?? ''))).join(' ')
    : '';
  const rawMessage = String(errObj?.message || dataText || '');

  if (
    errObj?.name === 'NotSupportedError' ||
    numericCode === 6000 ||
    numericCode === 6001 ||
    numericCode === 6002 ||
    numericCode === 6020 ||
    numericCode === 4008
  ) {
    return {
      code: 'DRM_BROWSER_UNSUPPORTED',
      title:
        lang === 'en'
          ? `${sysLabel} is not supported on this browser/device`
          : `Trình duyệt/thiết bị không hỗ trợ ${sysLabel}`,
      description:
        lang === 'en'
          ? 'Required encrypted media key system or robustness level is unavailable.'
          : 'Mức bảo vệ phần cứng/trình giải mã DRM yêu cầu không khả dụng trên thiết bị này.',
      browserGuidance: guidance,
    };
  }

  if (numericCode === 6014) {
    return {
      code: 'DRM_SESSION_EXPIRED',
      title:
        lang === 'en'
          ? `${sysLabel} playback session expired`
          : `Phiên bản quyền phát (${sysLabel}) đã hết hạn`,
      description:
        lang === 'en'
          ? 'Please reload the lesson to acquire a fresh license token.'
          : 'Vui lòng nhấn thử tải lại video để cấp lại phiên phát DRM mới.',
    };
  }

  if (numericCode === 6018 || numericCode === 6019) {
    return {
      code: 'DRM_LICENSE_DENIED',
      title:
        lang === 'en'
          ? 'External display / HDCP policy blocked playback'
          : 'Màn hình ngoài / HDCP không đạt chuẩn bảo vệ video',
      description:
        lang === 'en'
          ? 'Disconnect uncertified external displays or screen-capture adapters and retry.'
          : 'Vui lòng ngắt kết nối màn hình ngoài không hỗ trợ HDCP hoặc thiết bị ghi hình rồi thử lại.',
      browserGuidance: guidance,
    };
  }

  if (
    numericCode === 6004 ||
    numericCode === 6005 ||
    numericCode === 6006 ||
    numericCode === 6007 ||
    numericCode === 6008 ||
    numericCode === 6010 ||
    numericCode === 6012 ||
    numericCode === 6015 ||
    numericCode === 6016 ||
    numericCode === 6017 ||
    /license|503|BLOCKED/i.test(rawMessage)
  ) {
    return {
      code: 'DRM_LICENSE_DENIED',
      title:
        lang === 'en'
          ? `${sysLabel} license verification failed`
          : `Không xác thực được giấy phép phát (${sysLabel})`,
      description:
        lang === 'en'
          ? 'Your lesson license expired, reached the device cap, or the license/certificate initialization failed.'
          : 'Phiên cấp phép phát video đã hết hạn, vượt giới hạn thiết bị, thiếu chứng chỉ DRM hoặc máy chủ bản quyền từ chối yêu cầu.',
    };
  }

  if (numericCode === 6003) {
    return {
      code: 'DRM_MEDIA_ERROR',
      title:
        lang === 'en'
          ? `Unable to attach ${sysLabel} session to video`
          : `Không thể gắn phiên giải mã ${sysLabel} vào trình phát`,
      description:
        lang === 'en'
          ? 'The browser failed to attach DRM keys to the media element. Please reload or switch browsers.'
          : 'Trình duyệt không gắn được khóa giải mã DRM vào phần tử video. Vui lòng thử tải lại hoặc mở bằng trình duyệt tương thích.',
      browserGuidance: guidance,
    };
  }

  if (numericCode && numericCode >= 4000 && numericCode < 5000) {
    return {
      code: 'DRM_CODEC_UNSUPPORTED',
      title:
        lang === 'en'
          ? 'Video codec or hardware decoder unsupported'
          : 'Thiết bị không giải mã được định dạng video bảo vệ',
      description:
        lang === 'en'
          ? 'Enable hardware acceleration in browser settings or switch to a supported browser.'
          : 'Vui lòng bật tăng tốc phần cứng (Hardware Acceleration) hoặc mở bằng trình duyệt được hỗ trợ.',
      browserGuidance: guidance,
    };
  }

  if (numericCode && numericCode >= 3000 && numericCode < 4000) {
    return {
      code: 'DRM_MEDIA_ERROR',
      title:
        lang === 'en' ? 'Encrypted media playback error' : 'Lỗi giải mã luồng video',
      description:
        lang === 'en'
          ? 'An error occurred while decoding the encrypted stream. Please retry.'
          : 'Đã xảy ra lỗi khi giải mã dữ liệu video. Vui lòng thử tải lại.',
    };
  }

  return {
    code: 'DRM_UNKNOWN_ERROR',
    title:
      lang === 'en'
        ? 'Unable to start protected video playback'
        : 'Không thể khởi chạy trình phát video bảo vệ DRM',
    description:
      rawMessage ||
      (lang === 'en'
        ? 'Please reload the lesson or open in a compatible browser.'
        : 'Vui lòng thử tải lại bài giảng hoặc mở bằng trình duyệt tương thích.'),
    browserGuidance: guidance,
  };
}

export function extractFairPlaySkdUri(initData: Uint8Array): string {
  if (!initData || initData.byteLength === 0) return '';
  try {
    if (initData.byteLength >= 2 && initData[0] === 0xfe && initData[1] === 0xff) {
      return new TextDecoder('utf-16be').decode(initData.subarray(2)).replace(/\0/g, '').trim();
    }
    if (initData.byteLength >= 2 && initData[0] === 0xff && initData[1] === 0xfe) {
      return new TextDecoder('utf-16le').decode(initData.subarray(2)).replace(/\0/g, '').trim();
    }
    if (initData.byteLength >= 4 && initData[0] === 0 && initData[2] === 0) {
      return new TextDecoder('utf-16be').decode(initData).replace(/\0/g, '').trim();
    }
    if (initData.byteLength >= 4 && initData[1] === 0 && initData[3] === 0) {
      return new TextDecoder('utf-16le').decode(initData).replace(/\0/g, '').trim();
    }
    return new TextDecoder('utf-8').decode(initData).replace(/\0/g, '').trim();
  } catch {
    return '';
  }
}

export interface FairPlayDrmInfoLike {
  serverCertificate?: Uint8Array | null;
}

export interface ShakaFairPlayStaticLike {
  drm?: {
    FairPlay?: {
      initDataTransform?: (
        initData: ArrayBuffer | ArrayBufferView,
        contentId: ArrayBuffer | ArrayBufferView | string,
        cert: ArrayBuffer | ArrayBufferView | null
      ) => Uint8Array;
      ezdrmInitDataTransform?: (
        initData: Uint8Array,
        initDataType: string,
        drmInfo: never
      ) => Uint8Array;
      verimatrixInitDataTransform?: (
        initData: Uint8Array,
        initDataType: string,
        drmInfo: never
      ) => Uint8Array;
      defaultGetContentId?: (initData: ArrayBuffer | ArrayBufferView) => string;
    };
  };
}

export function createFairPlayInitDataTransform(shakaLib: ShakaFairPlayStaticLike) {
  return (
    initData: Uint8Array,
    initDataType: string,
    drmInfo: FairPlayDrmInfoLike | null
  ): Uint8Array => {
    if (initDataType !== 'skd') {
      return initData;
    }
    const fp = shakaLib?.drm?.FairPlay;
    if (!fp) {
      return initData;
    }
    const rawUri = extractFairPlaySkdUri(initData);
    if (rawUri.includes(';') && typeof fp.ezdrmInitDataTransform === 'function') {
      return fp.ezdrmInitDataTransform(initData, initDataType, drmInfo as never);
    }
    const cert = drmInfo?.serverCertificate ?? null;
    const stripped = rawUri.replace(/^skd:\/\//i, '').trim();
    const contentId =
      stripped ||
      (typeof fp.defaultGetContentId === 'function' ? fp.defaultGetContentId(initData) : '');
    if (typeof fp.initDataTransform === 'function') {
      return fp.initDataTransform(initData, contentId, cert);
    }
    if (typeof fp.verimatrixInitDataTransform === 'function') {
      return fp.verimatrixInitDataTransform(initData, initDataType, drmInfo as never);
    }
    if (typeof fp.ezdrmInitDataTransform === 'function') {
      return fp.ezdrmInitDataTransform(initData, initDataType, drmInfo as never);
    }
    return initData;
  };
}
