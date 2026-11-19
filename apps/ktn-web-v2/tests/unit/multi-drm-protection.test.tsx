import React from 'react';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
import { HlsVideoPlayer } from '../../src/features/learning/components/HlsVideoPlayer';
import { LearningPage } from '../../src/features/learning/components/LearningPage';
import shaka from 'shaka-player';
import {
  classifyDrmError,
  createFairPlayInitDataTransform,
  detectDrmCapabilities,
  selectDrmPlaybackPlan,
  type DrmCapabilityReport,
} from '../../src/features/learning/utils/drmCapability';
import {
  formatDrmHarnessError,
  getDemoProfile,
  initManualDrmHarness,
} from '../manual/drm';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { clearStoredSession, saveStoredSession } from '../../src/services/api/ktnApiClient';
import type { KtnDrmPlaybackInfo } from '../../src/types/ktn.types';

const COURSE_HSK1_ID = '6adadba969897b0002482ca5';
const COURSE_CFK_ID = '65e7704a9ea90c00080d5195';

async function signTestToken(
  payload: Record<string, any>,
  secret = 'ktn-v2-local-hmac-secret-2026',
  ttlMs = 30 * 86400 * 1000
) {
  const jti =
    payload.jti || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  const data = {
    ...payload,
    jti,
    iat: Date.now(),
    exp: Date.now() + ttlMs,
  };
  const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return { token: `${bodyB64}.${sigB64}`, jti };
}

function makeFakeCapabilities(overrides: Partial<DrmCapabilityReport> = {}): DrmCapabilityReport {
  return {
    isSecureContext: true,
    hasEme: true,
    hasMediaSource: true,
    supportsNativeHls: false,
    isEmbeddedWebView: false,
    embeddedWebViewName: null,
    fairplay: { supported: false, keySystem: null, hardwareBackedLikely: false },
    widevine: {
      supported: true,
      keySystem: 'com.widevine.alpha',
      maxRobustness: 'SW_SECURE_CRYPTO',
      hardwareBacked: false,
    },
    playready: { supported: false, keySystem: null, maxRobustness: null, hardwareBacked: false },
    preferredDrm: 'widevine',
    securityTier: 'software',
    captureProtectionGuaranteed: false,
    checkedAt: '2026-11-16T00:00:00.000Z',
    ...overrides,
  };
}

describe('KTN Multi-DRM Protection Suite (Worker APIs, Anti-Bypass, Policy Matrix, Player, Shaka Packaging & POC Harness)', () => {
  let harness: any;
  let adminToken: string;
  let studentToken: string;
  let qaStudentToken: string;
  let qaStudentJti: string;
  let capturedKmsAuth = '';
  let capturedKmsApiKey = '';
  const originalFetch = globalThis.fetch;
  const originalRequestMediaKeySystemAccess = navigator.requestMediaKeySystemAccess;

  beforeEach(async () => {
    vi.restoreAllMocks();
    capturedKmsAuth = '';
    capturedKmsApiKey = '';
    harness = createLocalWorkerHarness();

    adminToken = (
      await signTestToken({
        id: 'admin-ktn-01',
        email: 'admin@khongtunhi.com',
        name: 'KTN Admin',
        role: 'admin',
        roles: ['admin'],
      })
    ).token;

    studentToken = (
      await signTestToken({
        id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        cognitoUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK1 3.0' }],
      })
    ).token;

    const qaSigned = await signTestToken({
      id: 'qa-student-01',
      email: 'taphong2002@gmail.com',
      name: 'Tạ Phong Võ (QA Pilot)',
      role: 'student',
      roles: ['student'],
      onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK1 3.0' }],
    });
    qaStudentToken = qaSigned.token;
    qaStudentJti = qaSigned.jti;

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('media.izteach.vn')) {
        if (urlStr.endsWith('playlist.m3u8')) {
          return new Response(
            '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1500000,RESOLUTION=1280x720\nv720.m3u8\n',
            { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
          );
        }
        return new Response(
          '#EXTM3U\n#EXT-X-VERSION:3\n#EXT-X-TARGETDURATION:5\n#EXTINF:4.0,\nseg0.ts\n#EXT-X-ENDLIST\n',
          { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
        );
      }
      if (urlStr.includes('drm-cdn.khongtunhi.test')) {
        if (urlStr.endsWith('.mpd')) {
          return new Response('<MPD></MPD>', {
            status: 200,
            headers: { 'Content-Type': 'application/dash+xml' },
          });
        }
        return new Response(new Uint8Array([1, 2, 3, 4]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }
      if (urlStr.includes('kms.vendor-drm.test')) {
        const hdrs = (init?.headers || {}) as Record<string, string>;
        capturedKmsAuth = String(hdrs.authorization || hdrs.Authorization || '');
        capturedKmsApiKey = String(hdrs['x-api-key'] || hdrs['X-API-Key'] || '');
        return new Response(new Uint8Array([0xca, 0xfe, 0xba, 0xbe]), {
          status: 200,
          headers: { 'Content-Type': 'application/octet-stream' },
        });
      }
      return originalFetch(input as any, init);
    }) as any;
  });

  afterEach(() => {
    clearStoredSession();
    globalThis.fetch = originalFetch;
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: originalRequestMediaKeySystemAccess,
    });
    delete (window as any).shaka;
    vi.restoreAllMocks();
  });

  async function callWorker(
    reqPath: string,
    opts: {
      method?: string;
      token?: string;
      headers?: Record<string, string>;
      body?: any;
      rawBody?: Uint8Array;
      envOverride?: Record<string, any>;
    } = {}
  ) {
    const reqHeaders: Record<string, string> = { ...(opts.headers || {}) };
    if (opts.token) {
      reqHeaders.Authorization = `Bearer ${opts.token}`;
    }
    if (opts.body && !reqHeaders['Content-Type']) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const req = new Request(`https://khongtunhi.com${reqPath}`, {
      method: opts.method || 'GET',
      headers: reqHeaders,
      body: opts.rawBody
        ? new Uint8Array(opts.rawBody).buffer
        : opts.body
        ? JSON.stringify(opts.body)
        : undefined,
    });
    return (await harness.workerModule.fetch(req, {
      ...harness.env,
      ...(opts.envOverride || {}),
    })) as Response;
  }

  it('1. Enforces Admin-only DRM policy config, defaults courses to drmDisabled, and rejects public test assets', async () => {
    const defaultPolicyRes = await callWorker(`/api/ktn/drm/policy?courseId=${COURSE_HSK1_ID}`, {
      token: studentToken,
    });
    expect(defaultPolicyRes.status).toBe(200);
    const defaultPolicyJson = await defaultPolicyRes.json();
    expect(defaultPolicyJson.policy).toBe('drmDisabled');

    const forbiddenPostRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: studentToken,
      body: { courseId: COURSE_HSK1_ID, policy: 'drmRequired' },
    });
    expect(forbiddenPostRes.status).toBe(403);

    // Reject public PlayReady/Widevine/EZDRM test URLs in packagedAssets
    const unsafePostRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmPilot',
        packagedAssets: {
          unitA: {
            dashUrl: 'https://test.playready.microsoft.com/media/profficialsite/tearsofsteel_4k.ism/manifest.mpd',
          },
        },
      },
    });
    expect(unsafePostRes.status).toBe(400);
    expect((await unsafePostRes.json()).error).toBe('UNSAFE_PUBLIC_TEST_ASSET_REJECTED');
  });

  it('2. Blocks missing/public commercial license credentials (503 BLOCKED), never fakes production DRM, and verifies all 6 playback gates', async () => {
    const unitsRes = await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
      token: studentToken,
    });
    const unitsJson = await unitsRes.json();
    const unit1 = unitsJson.lessons[0];
    const unit1Id = String(unit1.unitId || unit1._id);
    const unit1Vid = String(unit1.videoId);

    // Enable drmRequired for HSK1 via admin
    const setRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmRequired',
        packagedAssets: {
          [unit1Id]: {
            dashUrl: 'https://drm-cdn.khongtunhi.test/pilot/manifest.mpd',
            hlsFairPlayUrl: 'https://drm-cdn.khongtunhi.test/pilot/master.m3u8',
            encryptionScheme: 'cbcs',
            keyId: '00112233445566778899aabbccddeeff',
          },
        },
      },
    });
    expect(setRes.status).toBe(200);

    // Gate 1: Unauthenticated -> 401
    expect((await callWorker(`/api/ktn/drm/playback?unitId=${unit1Id}`)).status).toBe(401);

    // Gate 2: Unentitled student -> 403 COURSE_NOT_ENTITLED
    const unentitledToken = (
      await signTestToken({
        id: '22222222-3333-4444-5555-666666666662',
        email: 'minhkhang@khongtunhi.com',
        name: 'Bé Trần Minh Khang',
        role: 'student',
        roles: ['student'],
        onlineCourses: [],
      })
    ).token;
    const unentitledRes = await callWorker(`/api/ktn/drm/playback?unitId=${unit1Id}`, {
      token: unentitledToken,
    });
    expect(unentitledRes.status).toBe(403);
    expect((await unentitledRes.json()).error).toBe('COURSE_NOT_ENTITLED');

    // Gate 4: Unit does not belong to requested course -> 403 UNIT_COURSE_MISMATCH
    const cfkRes = await callWorker(`/api/ktn/drm/playback?unitId=${unit1Id}&courseId=${COURSE_CFK_ID}`, {
      token: studentToken,
    });
    expect(cfkRes.status).toBe(403);
    expect((await cfkRes.json()).error).toBe('UNIT_COURSE_MISMATCH');

    // Gate 3: Expired course (real server-side izTeach permission record, not client JWT) -> 403 COURSE_EXPIRED
    const qaUid = 'bc21991c-ce9b-465d-b85f-dbb1821e51a9';
    const prevPermRecords = harness.state.izteach.permissionRecordsByUid[qaUid];
    harness.state.izteach.permissionRecordsByUid[qaUid] = [
      {
        _id: 'perm_exp_test',
        id: 'perm_exp_test',
        userId: qaUid,
        limitTime: '2025-01-01T00:00:00.000Z',
        isExpired: true,
        onlineCourses: [COURSE_HSK1_ID],
      },
    ];
    const expRes = await callWorker(`/api/ktn/drm/playback?unitId=${unit1Id}&courseId=${COURSE_HSK1_ID}`, {
      token: qaStudentToken,
    });
    if (prevPermRecords === undefined) {
      delete harness.state.izteach.permissionRecordsByUid[qaUid];
    } else {
      harness.state.izteach.permissionRecordsByUid[qaUid] = prevPermRecords;
    }
    expect(expRes.status).toBe(403);
    expect((await expRes.json()).error).toBe('COURSE_EXPIRED');

    // Gate 4: Valid entitled student -> receives short-lived drmToken, yet licenseStatus = BLOCKED_MISSING_CREDENTIALS when env has no KMS keys
    const blockedPlaybackRes = await callWorker(
      `/api/ktn/drm/playback?unitId=${unit1Id}&courseId=${COURSE_HSK1_ID}`,
      { token: studentToken }
    );
    expect(blockedPlaybackRes.status).toBe(200);
    const blockedPlaybackJson = await blockedPlaybackRes.json();
    expect(blockedPlaybackJson.drmActiveForUser).toBe(true);
    expect(blockedPlaybackJson.expiresInSeconds).toBe(120);
    expect(blockedPlaybackJson.licenseStatus).toBe('BLOCKED_MISSING_CREDENTIALS');
    expect(blockedPlaybackJson.licenseProviders.widevine.status).toBe('BLOCKED');
    expect(blockedPlaybackJson.licenseProviders.playready.status).toBe('BLOCKED');
    expect(blockedPlaybackJson.licenseProviders.fairplay.status).toBe('BLOCKED');
    // Must NEVER expose fallback HLS URL when drmRequired
    expect(blockedPlaybackJson.fallbackAllowed).toBe(false);
    expect(blockedPlaybackJson.fallbackStreamUrl).toBeNull();

    // Public test license URL configured in env MUST ALSO be rejected as BLOCKED
    const publicTestRejectRes = await callWorker('/api/ktn/drm/license/playready', {
      method: 'POST',
      token: studentToken,
      headers: { 'X-KTN-DRM-Token': blockedPlaybackJson.drmToken },
      rawBody: new Uint8Array([1, 2, 3]),
      envOverride: {
        KTN_DRM_PLAYREADY_PROXY_URL:
          'https://test.playready.microsoft.com/service/rightsmanager.asmx',
      },
    });
    expect(publicTestRejectRes.status).toBe(503);
    expect((await publicTestRejectRes.json()).status).toBe('BLOCKED');

    // Without commercial env, POST /api/ktn/drm/license/widevine fails closed with 503 BLOCKED
    const unconfLicRes = await callWorker('/api/ktn/drm/license/widevine', {
      method: 'POST',
      token: studentToken,
      headers: { 'X-KTN-DRM-Token': blockedPlaybackJson.drmToken },
      rawBody: new Uint8Array([1, 2, 3]),
    });
    expect(unconfLicRes.status).toBe(503);
    expect((await unconfLicRes.json()).blocked).toBe(true);

    // Gate 5: Token stolen/replayed on a DIFFERENT user session fails with 403 DRM_TOKEN_SESSION_MISMATCH
    const replayRes = await callWorker('/api/ktn/drm/license/widevine', {
      method: 'POST',
      token: qaStudentToken,
      headers: { 'X-KTN-DRM-Token': blockedPlaybackJson.drmToken },
      rawBody: new Uint8Array([1, 2, 3]),
      envOverride: {
        KTN_DRM_WIDEVINE_PROXY_URL: 'https://kms.vendor-drm.test/widevine',
        KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
      },
    });
    expect(replayRes.status).toBe(403);
    expect((await replayRes.json()).error).toBe('DRM_TOKEN_SESSION_MISMATCH');

    // Valid commercial env + matching session succeeds cleanly & never leaks secret to client
    const mockEnv = {
      KTN_DRM_WIDEVINE_PROXY_URL: 'https://kms.vendor-drm.test/widevine',
      KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
    };
    const readyPlaybackRes = await callWorker(
      `/api/ktn/drm/playback?unitId=${unit1Id}&courseId=${COURSE_HSK1_ID}`,
      { token: studentToken, envOverride: mockEnv }
    );
    const readyPlaybackJson = await readyPlaybackRes.json();
    expect(readyPlaybackJson.licenseStatus).toBe('READY');
    expect(JSON.stringify(readyPlaybackJson)).not.toContain('super-secret-vendor-key-never-in-browser');
    expect(JSON.stringify(readyPlaybackJson)).not.toContain('kms.vendor-drm.test');

    const okLicRes = await callWorker('/api/ktn/drm/license/widevine', {
      method: 'POST',
      token: studentToken,
      headers: { 'X-KTN-DRM-Token': readyPlaybackJson.drmToken },
      rawBody: new Uint8Array([9, 8, 7]),
      envOverride: mockEnv,
    });
    expect(okLicRes.status).toBe(200);
    expect(Buffer.from(new Uint8Array(await okLicRes.arrayBuffer()))).toEqual(
      Buffer.from([0xca, 0xfe, 0xba, 0xbe])
    );
    expect(capturedKmsApiKey || capturedKmsAuth).toContain('super-secret-vendor-key-never-in-browser');

    // Manifest segment proxy checks session revocation (3-device cap)
    const manifestRes = await callWorker(readyPlaybackJson.manifests.dashUrl, {
      token: studentToken,
      envOverride: mockEnv,
    });
    expect(manifestRes.status).toBe(200);
    expect(unit1Vid).toMatch(/^[0-9a-f]{24}$/);
  });

  it('3. Anti-HLS-Bypass & Pilot Isolation: blocks full-video HLS on drmPilot QA unit while preserving non-QA learners and 90s free trial', async () => {
    const initialUnitsJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: studentToken,
      })
    ).json();
    const unit1 = initialUnitsJson.lessons[0];
    const unit1Id = String(unit1.unitId || unit1._id);
    const unit1HlsUrl = String(unit1.streamUrl);
    expect(unit1HlsUrl).toMatch(/^\/api\/ktn\/media\/hls\//);

    // Also mint a fresh k='hls' token FOR the QA student BEFORE enabling drmPilot (simulating an attacker saving an old HLS URL)
    const qaUnitsBeforeJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: qaStudentToken,
      })
    ).json();
    const qaSavedHlsUrl = String(qaUnitsBeforeJson.lessons[0].streamUrl);
    const qaMasterBeforeText = await (await callWorker(qaSavedHlsUrl)).text();
    const qaVariantUrl = qaMasterBeforeText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l.includes('.m3u8'))!;
    expect(qaVariantUrl).toBeTruthy();
    const qaVariantText = await (await callWorker(qaVariantUrl)).text();
    const qaKeyMatch = qaVariantText.match(/URI="([^"]*\/api\/ktn\/media\/hls-key[^"]+)"/);
    expect(qaKeyMatch).toBeTruthy();

    // Turn on drmPilot ONLY for taphong2002@gmail.com on unit1Id
    const pilotRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmPilot',
        pilotEmails: ['taphong2002@gmail.com'],
        pilotUnitIds: [unit1Id],
      },
    });
    expect(pilotRes.status).toBe(200);

    // Non-QA learner still gets normal Level 1 HLS untouched
    const regularUnitsJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: studentToken,
      })
    ).json();
    expect(regularUnitsJson.lessons[0].drmEnabled).toBe(false);
    expect(regularUnitsJson.lessons[0].streamUrl).toMatch(/^\/api\/ktn\/media\/hls\//);

    // QA Pilot learner gets drmEnabled=true AND NO parallel non-DRM streamUrl in /units
    const qaUnitsAfterJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: qaStudentToken,
      })
    ).json();
    expect(qaUnitsAfterJson.lessons[0].drmEnabled).toBe(true);
    expect(qaUnitsAfterJson.lessons[0].streamUrl).toBeNull();
    expect(qaUnitsAfterJson.lessons[0].video).toBe('');

    // Trying to replay the saved full-lesson HLS playlist or key URL for the QA unit returns 403 DRM_REQUIRED_NO_HLS_BYPASS
    const bypassPlaylistRes = await callWorker(qaSavedHlsUrl);
    expect(bypassPlaylistRes.status).toBe(403);
    expect((await bypassPlaylistRes.json()).error).toBe('DRM_REQUIRED_NO_HLS_BYPASS');

    const bypassKeyRes = await callWorker(qaKeyMatch![1]);
    expect(bypassKeyRes.status).toBe(403);
    expect((await bypassKeyRes.json()).error).toBe('DRM_REQUIRED_NO_HLS_BYPASS');

    // Even if QA session is revoked via 3-device limit, DRM playback fails with 401
    await harness.workerModule.fetch(
      new Request('https://khongtunhi.com/api/ktn/auth/logout', {
        method: 'POST',
        headers: { Authorization: `Bearer ${qaStudentToken}` },
      }),
      harness.env
    );
    expect(
      (await callWorker(`/api/ktn/drm/playback?unitId=${unit1Id}&courseId=${COURSE_HSK1_ID}`, {
        token: qaStudentToken,
      })).status
    ).toBe(401);
    expect(qaStudentJti).toBeTruthy();

    // 90s free trial demo HLS remains intact and playable!
    const catalogJson = await (await callWorker('/api/ktn/courses')).json();
    const hsk1DemoUrl = catalogJson.courses.find((c: any) => c.id === COURSE_HSK1_ID).demoVideoUrl;
    const demoMasterRes = await callWorker(hsk1DemoUrl);
    expect(demoMasterRes.status).toBe(200);
  });

  it('4. Probes real EME capabilities (FairPlay/PlayReady/Widevine), enforces drmRequired vs drmFallbackAllowed, and classifies errors', async () => {
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: vi.fn(async (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
        const rob = configs?.[0]?.videoCapabilities?.[0]?.robustness || '';
        if (keySystem === 'com.microsoft.playready.recommendation' && rob === '3000') {
          return {} as MediaKeySystemAccess;
        }
        if (keySystem === 'com.widevine.alpha' && rob === 'SW_SECURE_CRYPTO') {
          return {} as MediaKeySystemAccess;
        }
        throw new DOMException('Unsupported', 'NotSupportedError');
      }),
    });

    const report = await detectDrmCapabilities();
    expect(report.playready.supported).toBe(true);
    expect(report.playready.maxRobustness).toBe('3000');
    expect(report.widevine.supported).toBe(true);
    expect(report.widevine.maxRobustness).toBe('SW_SECURE_CRYPTO');
    expect(report.preferredDrm).toBe('playready');
    // Never falsely guarantees capture protection
    expect(report.captureProtectionGuaranteed).toBe(false);

    const basePlayback: KtnDrmPlaybackInfo = {
      ok: true,
      unitId: '6adadba969897b0002482c01',
      courseId: COURSE_HSK1_ID,
      videoId: '6adadc45f8c3c60002a2b3c1',
      policy: 'drmRequired',
      drmActiveForUser: true,
      drmToken: 'tok-123',
      licenseStatus: 'READY',
      licenseProviders: {
        widevine: { configured: true, status: 'READY' },
        playready: { configured: true, status: 'READY' },
        fairplay: { configured: false, status: 'BLOCKED' },
      },
      licenseEndpoints: {
        widevine: '/api/ktn/drm/license/widevine',
        playready: '/api/ktn/drm/license/playready',
        fairplay: '/api/ktn/drm/license/fairplay',
      },
      fairplayCertificateUrl: '/api/ktn/drm/fairplay-cert',
      manifests: {
        packaged: true,
        dashUrl: '/api/ktn/drm/manifest/6adadc45f8c3c60002a2b3c1/dash/t-1/manifest.mpd',
        hlsFairPlayUrl: null,
      },
      fallbackAllowed: false,
      fallbackStreamUrl: '/api/ktn/media/hls/6adadc45f8c3c60002a2b3c1/playlist.m3u8?mt=x',
      captureProtectionGuaranteed: false,
    };

    const selectedPr = selectDrmPlaybackPlan(report, basePlayback, 'vi');
    expect(selectedPr.mode).toBe('shaka-drm');
    expect(selectedPr.drmSystem).toBe('playready');

    // On unsupported / Zalo WebView under drmRequired -> MUST block with compatible browser guidance
    const zaloReport = makeFakeCapabilities({
      isEmbeddedWebView: true,
      embeddedWebViewName: 'Zalo',
      widevine: { supported: false, keySystem: null, maxRobustness: null, hardwareBacked: false },
      playready: { supported: false, keySystem: null, maxRobustness: null, hardwareBacked: false },
      fairplay: { supported: false, keySystem: null, hardwareBackedLikely: false },
      preferredDrm: null,
    });
    const zaloBlocked = selectDrmPlaybackPlan(zaloReport, basePlayback, 'vi');
    expect(zaloBlocked.mode).toBe('blocked');
    expect(zaloBlocked.error?.code).toBe('DRM_EMBEDDED_WEBVIEW');
    expect(zaloBlocked.error?.browserGuidance).toContain('Safari');

    // Under drmFallbackAllowed -> falls back ONLY with explicit warning notice
    const fallbackDecision = selectDrmPlaybackPlan(
      zaloReport,
      { ...basePlayback, policy: 'drmFallbackAllowed', fallbackAllowed: true },
      'vi'
    );
    expect(fallbackDecision.mode).toBe('hls-fallback');
    expect(fallbackDecision.fallbackNotice).toContain('chưa bảo đảm chống quay màn hình');

    expect(classifyDrmError({ code: 6007 }, 'widevine', 'vi').code).toBe('DRM_LICENSE_DENIED');
    expect(classifyDrmError({ code: 4032 }, 'playready', 'en').code).toBe('DRM_CODEC_UNSUPPORTED');
  });

  it('5. Renders HlsVideoPlayer with Shaka DRM, injects server token headers, verifies drmInfo(), exposes quality selector, and fails closed on drmRequired', async () => {
    const authUser = {
      id: 'stu-01',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1', title: 'HSK 1' }],
      token: studentToken,
    };
    saveStoredSession(authUser, studentToken);
    useAuthStore.setState({ user: authUser, authUser });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: vi.fn(async (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
        const rob = configs?.[0]?.videoCapabilities?.[0]?.robustness || '';
        if (keySystem === 'com.widevine.alpha' && rob === 'SW_SECURE_CRYPTO') {
          return {} as MediaKeySystemAccess;
        }
        throw new DOMException('Unsupported', 'NotSupportedError');
      }),
    });

    const registeredRequestFilters: Array<(type: number, req: any) => void> = [];
    const selectVariantSpy = vi.fn();
    const configureSpy = vi.fn();
    const destroySpy = vi.fn(async () => {});

    class FakeShakaPlayer {
      getNetworkingEngine() {
        return {
          registerRequestFilter: (fn: any) => registeredRequestFilters.push(fn),
          registerResponseFilter: () => {},
        };
      }
      configure = configureSpy;
      addEventListener() {}
      attach = vi.fn(async () => {});
      load = vi.fn(async () => {});
      drmInfo = () => ({ keySystem: 'com.widevine.alpha' });
      getVariantTracks = () => [
        { id: 10, height: 720, bandwidth: 1800000 },
        { id: 11, height: 480, bandwidth: 900000 },
      ];
      selectVariantTrack = selectVariantSpy;
      destroy = destroySpy;
    }
    (window as any).shaka = {
      Player: FakeShakaPlayer,
      polyfill: { installAll: vi.fn() },
      net: { NetworkingEngine: { RequestType: { LICENSE: 2, MANIFEST: 0 } } },
      drm: { FairPlay: { commonFairPlayResponse: vi.fn() } },
    };

    const drmPlayback: KtnDrmPlaybackInfo = {
      ok: true,
      unitId: '6adadba969897b0002482c01',
      courseId: COURSE_HSK1_ID,
      videoId: '6adadc45f8c3c60002a2b3c1',
      policy: 'drmRequired',
      drmActiveForUser: true,
      drmToken: 'signed-short-lived-drm-token',
      licenseStatus: 'READY',
      licenseProviders: {
        widevine: { configured: true, status: 'READY' },
        playready: { configured: false, status: 'BLOCKED' },
        fairplay: { configured: false, status: 'BLOCKED' },
      },
      licenseEndpoints: {
        widevine: '/api/ktn/drm/license/widevine',
        playready: '/api/ktn/drm/license/playready',
        fairplay: '/api/ktn/drm/license/fairplay',
      },
      fairplayCertificateUrl: '/api/ktn/drm/fairplay-cert',
      manifests: {
        packaged: true,
        dashUrl: '/api/ktn/drm/manifest/6adadc45f8c3c60002a2b3c1/dash/t-1/manifest.mpd',
        hlsFairPlayUrl: null,
      },
      fallbackAllowed: false,
      fallbackStreamUrl: null,
      captureProtectionGuaranteed: false,
    };

    const { unmount } = render(
      <HlsVideoPlayer
        lessonTitle="Bài 1 · Xin chào"
        courseName="HSK 1"
        streamUrl={null}
        drmEnabled={true}
        drmPolicy="drmRequired"
        drmPlayback={drmPlayback}
        isCompleted={false}
        onMarkCompleted={vi.fn()}
        onRetryStream={vi.fn()}
      />
    );

    const badge = await screen.findByTestId('drm-active-badge');
    expect(badge.textContent).toContain('Widevine DRM');

    // Request filter injects auth & X-KTN-DRM-Token for /api/ktn/drm/*
    expect(registeredRequestFilters.length).toBeGreaterThan(0);
    const reqObj = { uris: ['/api/ktn/drm/license/widevine'], headers: {} as Record<string, string> };
    registeredRequestFilters[0](2, reqObj);
    expect(reqObj.headers.Authorization).toBe(`Bearer ${studentToken}`);
    expect(reqObj.headers['X-KTN-DRM-Token']).toBe('signed-short-lived-drm-token');

    // Quality selector disables ABR and calls selectVariantTrack
    const qSelect = screen.getByTestId('video-quality-select') as HTMLSelectElement;
    expect(qSelect.options.length).toBe(3); // Auto, 720p, 480p
    fireEvent.change(qSelect, { target: { value: '11' } });
    expect(configureSpy).toHaveBeenCalledWith('abr.enabled', false);
    expect(selectVariantSpy).toHaveBeenCalledWith(expect.objectContaining({ id: 11, height: 480 }), true);

    unmount();
    expect(destroySpy).toHaveBeenCalled();

    // Unconfigured credentials on drmRequired renders structured DRM error (NEVER silent HLS fallback)
    render(
      <HlsVideoPlayer
        lessonTitle="Bài 1 · Xin chào"
        courseName="HSK 1"
        streamUrl={null}
        drmEnabled={true}
        drmPolicy="drmRequired"
        drmPlayback={{
          ...drmPlayback,
          licenseStatus: 'BLOCKED_MISSING_CREDENTIALS',
          licenseProviders: {
            widevine: { configured: false, status: 'BLOCKED' },
            playready: { configured: false, status: 'BLOCKED' },
            fairplay: { configured: false, status: 'BLOCKED' },
          },
        }}
        isCompleted={false}
        onMarkCompleted={vi.fn()}
        onRetryStream={vi.fn()}
      />
    );
    const errBox = await screen.findByTestId('video-error-state');
    expect(errBox.getAttribute('data-drm-error-code')).toBe('DRM_LICENSE_UNCONFIGURED');
  });

  it('6. LearningPage triggers /api/ktn/drm/playback when unit has drmEnabled and renders BLOCKED error without non-DRM fallback', async () => {
    const unitsJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: studentToken,
      })
    ).json();
    const unit1Id = String(unitsJson.lessons[0].unitId || unitsJson.lessons[0]._id);

    await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmRequired',
        packagedAssets: {
          [unit1Id]: {
            dashUrl: 'https://drm-cdn.khongtunhi.test/pilot/manifest.mpd',
            encryptionScheme: 'cbcs',
          },
        },
      },
    });

    const sessionUser = {
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK1 3.0' }],
      token: studentToken,
    };
    saveStoredSession(sessionUser, studentToken);
    useAuthStore.setState({ user: sessionUser, authUser: sessionUser, isLoading: false });
    useUiStore.setState({ isDemoMode: false, videoDemoScenario: 'live_real' });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: vi.fn(async (keySystem: string) => {
        if (keySystem === 'com.widevine.alpha') return {} as MediaKeySystemAccess;
        throw new DOMException('Unsupported', 'NotSupportedError');
      }),
    });

    const requestedPaths: string[] = [];
    const prevFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('/api/ktn/')) {
        const pathOnly = urlStr.replace(/^https?:\/\/[^/]+/, '');
        requestedPaths.push(pathOnly);
        const res = await callWorker(pathOnly, {
          method: init?.method,
          token: studentToken,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        return new Response(await res.text(), { status: res.status });
      }
      return prevFetch(input as any, init);
    }) as any;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/learning?courseId=${COURSE_HSK1_ID}&lesson=1`]}>
          <LearningPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const errState = await screen.findByTestId('video-error-state', {}, { timeout: 5000 });
    expect(errState.getAttribute('data-drm-error-code')).toBe('DRM_LICENSE_UNCONFIGURED');
    expect(requestedPaths.some((p) => p.startsWith('/api/ktn/drm/playback'))).toBe(true);
  });

  it('7. Verifies POC harness (tests/manual/drm.ts) profiles & offline Shaka Packager readiness guard (blocks ClearKey / public test URLs)', async () => {
    const fpProfile = getDemoProfile('fairplay');
    const pr3000Profile = getDemoProfile('3000');
    const wvHwProfile = getDemoProfile('widevine-hardware');
    expect(fpProfile.isPublicTestOnly).toBe(true);
    expect(pr3000Profile.cencProbe?.robustness).toBe('3000');
    expect(wvHwProfile.cencProbe?.robustness).toBe('HW_SECURE_ALL');
    expect(formatDrmHarnessError(new Error('probe boom'))).toBe('probe boom');

    const root = document.createElement('div');
    root.innerHTML = `
      <pre id="capabilities"></pre>
      <form><select id="level"><option value="3000">3000</option></select><button type="submit">Go</button></form>
      <p id="status"></p>
      <video></video>
    `;
    const mounted = initManualDrmHarness(root);
    await waitFor(() => {
      expect(root.querySelector('#capabilities')?.textContent).toContain('isSecureContext');
    });
    await mounted.destroy();

    // Offline packaging script guard tests
    const pkgScriptPath = path.resolve(__dirname, '../../../../scripts/drm/package-ktn-drm.mjs');
    expect(fs.existsSync(pkgScriptPath)).toBe(true);
    // @ts-ignore
    const pkgMod = await import('../../../../scripts/drm/package-ktn-drm.mjs');
    const ffArgs = pkgMod.buildFfmpeg8BitArgs('input.ts', './tmp');
    expect(JSON.stringify(ffArgs.commands)).toContain('yuv420p');
    const shakaArgs = pkgMod.buildShakaPackagerArgs({
      v720: '720.mp4',
      v480: '480.mp4',
      a128: 'a.mp4',
      outDir: './out',
      scheme: 'cbcs',
      keyIdHex: '00112233445566778899aabbccddeeff',
      keyHex: 'ffeeddccbbaa99887766554433221100',
    });
    expect(shakaArgs.args.join(' ')).toContain('cbcs');
    expect(shakaArgs.args.join(' ')).not.toContain('clear_key');

    const readinessMissing = pkgMod.validateProductionPackagingReadiness({
      args: { execute: true, keyIdHex: '', keyHex: '' },
      env: {},
      packagerBin: null,
      ffmpegBin: 'ffmpeg',
    });
    expect(readinessMissing.status).toBe('BLOCKED');

    const readinessPublicTest = pkgMod.validateProductionPackagingReadiness({
      args: { execute: true, keyIdHex: '00112233445566778899aabbccddeeff', keyHex: 'ffeeddccbbaa99887766554433221100' },
      env: { KTN_DRM_PLAYREADY_PROXY_URL: 'https://test.playready.microsoft.com/service/rightsmanager.asmx' },
      packagerBin: 'packager',
      ffmpegBin: 'ffmpeg',
    });
    expect(readinessPublicTest.status).toBe('BLOCKED');
    expect(readinessPublicTest.blockers.some((b: string) => b.includes('FORBIDDEN_PUBLIC_TEST_LICENSE_URL'))).toBe(true);
  });

  it('8. Regression: enforces anti-bypass on split video/homework units (CFK1) & duplicate videoId siblings (HSK1), fails closed on unknown units, enforces rollback on live tokens & cleans FairPlay certs', async () => {
    // 8a. Reject non-HTTPS packagedAssets URLs
    const httpAssetRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmPilot',
        packagedAssets: {
          unitBad: { dashUrl: 'http://drm-cdn.khongtunhi.test/pilot/manifest.mpd' },
        },
      },
    });
    expect(httpAssetRes.status).toBe(400);
    expect((await httpAssetRes.json()).error).toBe('INVALID_DRM_ASSET_URL');

    // 8b. Unknown 24-hex unitId fails closed with 404 UNIT_NOT_FOUND
    const unknownUnitRes = await callWorker(
      `/api/ktn/drm/playback?unitId=deadbeefdeadbeefdeadbeef&courseId=${COURSE_HSK1_ID}`,
      { token: studentToken }
    );
    expect(unknownUnitRes.status).toBe(404);
    expect((await unknownUnitRes.json()).error).toBe('UNIT_NOT_FOUND');

    // 8c. HSK1 sibling duplicate units sharing videoId (Lesson 1: 6adadbcaf75fe5000247ca71 & 6adb27370ae64c00025de049)
    const pilotHsk1Res = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmPilot',
        pilotEmails: ['taphong2002@gmail.com'],
        pilotUnitIds: ['6adadbcaf75fe5000247ca71'],
        packagedAssets: {
          '6adadbcaf75fe5000247ca71': {
            dashUrl: 'https://drm-cdn.khongtunhi.test/hsk1-l1/manifest.mpd',
            hlsFairPlayUrl: 'https://drm-cdn.khongtunhi.test/hsk1-l1/master.m3u8',
            encryptionScheme: 'cbcs',
          },
        },
      },
    });
    expect(pilotHsk1Res.status).toBe(200);

    const siblingPlaybackRes = await callWorker(
      `/api/ktn/drm/playback?unitId=6adb27370ae64c00025de049&courseId=${COURSE_HSK1_ID}`,
      { token: qaStudentToken }
    );
    expect(siblingPlaybackRes.status).toBe(200);
    const siblingPlaybackJson = await siblingPlaybackRes.json();
    expect(siblingPlaybackJson.drmActiveForUser).toBe(true);
    expect(siblingPlaybackJson.manifests.dashUrl).toContain('/api/ktn/drm/manifest/');

    // 8d. CFK1 split videoUnitId vs hwUnitId anti-HLS-bypass + instant policy rollback
    const cfkStudentToken = (
      await signTestToken({
        id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        cognitoUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        onlineCourses: [{ id: COURSE_CFK_ID, code: 'CFK-01', title: 'CFK 1' }],
      })
    ).token;

    const cfkUnitsBefore = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_CFK_ID}`, { token: cfkStudentToken })
    ).json();
    const cfkLesson1Before = cfkUnitsBefore.lessons[0];
    const savedCfkHlsUrl = String(cfkLesson1Before.streamUrl);
    expect(savedCfkHlsUrl).toMatch(/^\/api\/ktn\/media\/hls\//);

    const cfkVideoUnitId = '65e8a76f7a2e2600088125b4';
    const cfkHwUnitId = '663e2cb2f960e80008fb905a';
    const setCfkRes = await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_CFK_ID,
        policy: 'drmRequired',
        pilotUnitIds: [cfkVideoUnitId],
        packagedAssets: {
          [cfkVideoUnitId]: {
            dashUrl: 'https://drm-cdn.khongtunhi.test/cfk1-l1/manifest.mpd',
            hlsFairPlayUrl: 'https://drm-cdn.khongtunhi.test/cfk1-l1/master.m3u8',
            encryptionScheme: 'cbcs',
          },
        },
      },
    });
    expect(setCfkRes.status).toBe(200);

    const cfkUnitsAfter = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_CFK_ID}`, { token: cfkStudentToken })
    ).json();
    expect(cfkUnitsAfter.lessons[0].drmEnabled).toBe(true);
    expect(cfkUnitsAfter.lessons[0].streamUrl).toBeNull();

    const bypassedHlsRes = await callWorker(savedCfkHlsUrl);
    expect(bypassedHlsRes.status).toBe(403);
    expect((await bypassedHlsRes.json()).error).toBe('DRM_REQUIRED_NO_HLS_BYPASS');

    const mockKmsEnv = {
      KTN_DRM_WIDEVINE_PROXY_URL: 'https://kms.vendor-drm.test/widevine',
      KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
    };
    const cfkHwPlaybackRes = await callWorker(
      `/api/ktn/drm/playback?unitId=${cfkHwUnitId}&courseId=${COURSE_CFK_ID}`,
      { token: cfkStudentToken, envOverride: mockKmsEnv }
    );
    expect(cfkHwPlaybackRes.status).toBe(200);
    const cfkHwPlaybackJson = await cfkHwPlaybackRes.json();
    expect(cfkHwPlaybackJson.drmActiveForUser).toBe(true);
    expect(cfkHwPlaybackJson.drmToken).toBeTruthy();

    // Rollback CFK1 to drmDisabled -> already-issued drmToken and drmStreamToken must fail immediately
    expect(
      (
        await callWorker('/api/ktn/drm/policy', {
          method: 'POST',
          token: adminToken,
          body: { courseId: COURSE_CFK_ID, policy: 'drmDisabled' },
        })
      ).status
    ).toBe(200);

    const rolledBackLicRes = await callWorker('/api/ktn/drm/license/widevine', {
      method: 'POST',
      token: cfkStudentToken,
      headers: { 'X-KTN-DRM-Token': cfkHwPlaybackJson.drmToken },
      rawBody: new Uint8Array([1, 2, 3]),
      envOverride: mockKmsEnv,
    });
    expect(rolledBackLicRes.status).toBe(403);
    expect((await rolledBackLicRes.json()).error).toBe('DRM_POLICY_DISABLED');

    const rolledBackManifestRes = await callWorker(cfkHwPlaybackJson.manifests.dashUrl, {
      token: cfkStudentToken,
      envOverride: mockKmsEnv,
    });
    expect(rolledBackManifestRes.status).toBe(403);
    expect((await rolledBackManifestRes.json()).error).toBe('DRM_POLICY_DISABLED');

    // 8e. FairPlay cert requires auth + configured FairPlay proxy & strips newlines/whitespace before decoding base64
    const fpCertBlockedRes = await callWorker('/api/ktn/drm/fairplay-cert', {
      token: studentToken,
      envOverride: { KTN_DRM_FAIRPLAY_CERT_B64: '  AQID\nBA==  ' },
    });
    expect(fpCertBlockedRes.status).toBe(503);

    const fpCertRes = await callWorker('/api/ktn/drm/fairplay-cert', {
      token: studentToken,
      envOverride: {
        KTN_DRM_FAIRPLAY_PROXY_URL: 'https://kms.vendor-drm.test/fairplay',
        KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
        KTN_DRM_FAIRPLAY_CERT_B64: '  AQID\nBA==  ',
      },
    });
    expect(fpCertRes.status).toBe(200);
    expect(Buffer.from(new Uint8Array(await fpCertRes.arrayBuffer()))).toEqual(
      Buffer.from([1, 2, 3, 4])
    );
  });

  it('9. Regression: classifies Shaka 6000/6014/6018 & empty-message errors and builds dual cbcs+cenc POSIX packager plans with FairPlay URI', async () => {
    expect(classifyDrmError({ code: 6014 }, 'widevine', 'vi').code).toBe('DRM_SESSION_EXPIRED');
    const hdcpErr = classifyDrmError({ code: 6018 }, 'playready', 'en');
    expect(hdcpErr.code).toBe('DRM_LICENSE_DENIED');
    expect(hdcpErr.title).toMatch(/HDCP/i);
    expect(classifyDrmError({ code: 6000 }, 'fairplay', 'vi').code).toBe('DRM_BROWSER_UNSUPPORTED');
    expect(
      classifyDrmError({ message: '', data: ['upstream 503 BLOCKED'] }, 'widevine', 'vi').code
    ).toBe('DRM_LICENSE_DENIED');

    // @ts-ignore
    const pkgMod = await import('../../../../scripts/drm/package-ktn-drm.mjs');
    const parsedDual = pkgMod.parseArgs([
      '--video-id',
      '6adadc45f8c3c60002a2b3c1',
      '--output-dir',
      'C:\\drm\\pilot-out',
      '--scheme',
      'dual',
      '--fairplay-uri',
      'skd://ktn/key1',
    ]);
    expect(parsedDual.outputDir).toBe('C:\\drm\\pilot-out');
    expect(parsedDual.scheme).toBe('dual');
    expect(parsedDual.fairplayKeyUri).toBe('skd://ktn/key1');

    const parsedAlias = pkgMod.parseArgs(['--out', 'C:\\drm\\alias-out']);
    expect(parsedAlias.outputDir).toBe('C:\\drm\\alias-out');

    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const dualReport = pkgMod.main([
      '--video-id',
      '6adadc45f8c3c60002a2b3c1',
      '--output-dir',
      'C:\\drm\\pilot-out',
      '--scheme',
      'dual',
      '--fairplay-uri',
      'skd://ktn/key1',
      '--dry-run',
    ]);
    logSpy.mockRestore();

    expect(dualReport.packagerPlans).toHaveLength(2);
    const cbcsPlan = dualReport.packagerPlans.find((p: any) => p.scheme === 'cbcs');
    const cencPlan = dualReport.packagerPlans.find((p: any) => p.scheme === 'cenc');
    expect(cbcsPlan).toBeTruthy();
    expect(cencPlan).toBeTruthy();
    expect(cbcsPlan.outDir).toMatch(/(^|\/)C:\/drm\/pilot-out\/cbcs$/);
    expect(cbcsPlan.mpdOut).toMatch(/(^|\/)C:\/drm\/pilot-out\/cbcs\/manifest\.mpd$/);
    expect(cbcsPlan.hlsOut).toMatch(/(^|\/)C:\/drm\/pilot-out\/cbcs\/master\.m3u8$/);
    expect(cencPlan.outDir).toMatch(/(^|\/)C:\/drm\/pilot-out\/cenc$/);
    expect(cbcsPlan.args).toContain('--hls_key_uri');
    expect(cbcsPlan.args).toContain('skd://ktn/key1');
    expect(cencPlan.args.join(' ')).not.toContain('FairPlay');
    for (const plan of dualReport.packagerPlans) {
      expect(plan.outDir).not.toContain('\\');
      for (const arg of plan.args) {
        if (
          String(arg).includes('segment_template=') ||
          String(arg).includes('in=') ||
          String(arg).endsWith('.mpd') ||
          String(arg).endsWith('.m3u8')
        ) {
          expect(String(arg)).not.toContain('\\');
        }
      }
    }

    const missingSkd = pkgMod.validateProductionPackagingReadiness({
      args: {
        execute: true,
        scheme: 'cbcs',
        fairplayKeyUri: '',
        keyIdHex: '00112233445566778899aabbccddeeff',
        keyHex: 'ffeeddccbbaa99887766554433221100',
      },
      env: { KTN_DRM_FAIRPLAY_PROXY_URL: 'https://kms.vendor-drm.test/fairplay' },
      packagerBin: 'packager',
      ffmpegBin: 'ffmpeg',
    });
    expect(missingSkd.status).toBe('BLOCKED');
    expect(missingSkd.blockers.some((b: string) => b.includes('MISSING_FAIRPLAY_SKD_KEY_URI'))).toBe(
      true
    );
  });

  it('10. Configures FairPlay initDataTransform (skd:// UTF-8/UTF-16LE, EZDRM & sinf passthrough) in HlsVideoPlayer and sets FairPlay license headers', async () => {
    const transform = createFairPlayInitDataTransform(shaka);
    const cert = new Uint8Array([0x30, 0x82, 0x01, 0x0a]);

    // 10a. Non-skd initData ('sinf') passes through untouched
    const sinfBytes = new Uint8Array([1, 2, 3, 4]);
    expect(transform(sinfBytes, 'sinf', { serverCertificate: cert })).toBe(sinfBytes);

    // 10b. Standard Shaka Packager skd:// URI transforms into [len][utf16 skd][len][utf16 contentId][len][cert]
    const skdUtf8 = new TextEncoder().encode('skd://ktn/key1');
    const transformedStd = transform(skdUtf8, 'skd', { serverCertificate: cert });
    expect(transformedStd.byteLength).toBeGreaterThan(cert.byteLength + 12);
    const viewStd = new DataView(
      transformedStd.buffer,
      transformedStd.byteOffset,
      transformedStd.byteLength
    );
    const skdLen = viewStd.getUint32(0, true);
    const contentIdLen = viewStd.getUint32(4 + skdLen, true);
    const certLen = viewStd.getUint32(8 + skdLen + contentIdLen, true);
    expect(
      new TextDecoder('utf-16le').decode(transformedStd.subarray(4, 4 + skdLen))
    ).toBe('skd://ktn/key1');
    expect(
      new TextDecoder('utf-16le').decode(
        transformedStd.subarray(8 + skdLen, 8 + skdLen + contentIdLen)
      )
    ).toBe('ktn/key1');
    expect(certLen).toBe(cert.byteLength);

    // 10c. UTF-16LE skd:// URI and EZDRM semicolon format both work cleanly
    const ezdrmStr = 'skd://fps.ezdrm.com/;asset-42';
    const ezdrmUtf16 = new Uint8Array(ezdrmStr.length * 2);
    for (let i = 0; i < ezdrmStr.length; i++) {
      ezdrmUtf16[i * 2] = ezdrmStr.charCodeAt(i);
    }
    const transformedEz = transform(ezdrmUtf16, 'skd', { serverCertificate: cert });
    const viewEz = new DataView(
      transformedEz.buffer,
      transformedEz.byteOffset,
      transformedEz.byteLength
    );
    const ezSkdLen = viewEz.getUint32(0, true);
    const ezContentIdLen = viewEz.getUint32(4 + ezSkdLen, true);
    expect(
      new TextDecoder('utf-16le').decode(
        transformedEz.subarray(8 + ezSkdLen, 8 + ezSkdLen + ezContentIdLen)
      )
    ).toBe('asset-42');

    // 10d. Missing serverCertificate fails cleanly with Shaka SERVER_CERTIFICATE_REQUIRED (6012)
    expect(() => transform(skdUtf8, 'skd', { serverCertificate: null })).toThrow();

    // 10e. HlsVideoPlayer wires initDataTransform, commonFairPlayResponse & octet-stream license header for Safari FairPlay
    const authUser = {
      id: 'stu-fp-01',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1', title: 'HSK 1' }],
      token: studentToken,
    };
    saveStoredSession(authUser, studentToken);
    useAuthStore.setState({ user: authUser, authUser });

    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    vi.spyOn(HTMLMediaElement.prototype, 'canPlayType').mockImplementation((mime: string) =>
      mime.includes('mpegurl') ? 'maybe' : ''
    );
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: vi.fn(async (keySystem: string) => {
        if (keySystem === 'com.apple.fps') {
          return {} as MediaKeySystemAccess;
        }
        throw new DOMException('Unsupported', 'NotSupportedError');
      }),
    });

    const fpRequestFilters: Array<(type: number, req: any) => void> = [];
    const fpResponseFilters: Array<(type: number, res: any, ctx: any) => void> = [];
    const fpConfigureCalls: any[] = [];
    class FakeFairPlayShakaPlayer {
      getNetworkingEngine() {
        return {
          registerRequestFilter: (fn: any) => fpRequestFilters.push(fn),
          registerResponseFilter: (fn: any) => fpResponseFilters.push(fn),
        };
      }
      configure = (cfg: any) => {
        fpConfigureCalls.push(cfg);
      };
      addEventListener() {}
      attach = vi.fn(async () => {});
      load = vi.fn(async () => {});
      drmInfo = () => ({ keySystem: 'com.apple.fps' });
      getVariantTracks = () => [];
      destroy = vi.fn(async () => {});
    }
    const commonRespSpy = vi.fn();
    (window as any).shaka = {
      Player: FakeFairPlayShakaPlayer,
      polyfill: { installAll: vi.fn() },
      net: { NetworkingEngine: { RequestType: { LICENSE: 2, MANIFEST: 0 } } },
      drm: {
        FairPlay: {
          initDataTransform: shaka.drm.FairPlay.initDataTransform,
          ezdrmInitDataTransform: shaka.drm.FairPlay.ezdrmInitDataTransform,
          defaultGetContentId: shaka.drm.FairPlay.defaultGetContentId,
          commonFairPlayResponse: commonRespSpy,
        },
      },
    };

    render(
      <HlsVideoPlayer
        lessonTitle="Bài 1 · FairPlay Safari"
        courseName="HSK 1"
        streamUrl={null}
        drmEnabled={true}
        drmPolicy="drmRequired"
        drmPlayback={{
          ok: true,
          unitId: '6adadba969897b0002482c01',
          courseId: COURSE_HSK1_ID,
          videoId: '6adadc45f8c3c60002a2b3c1',
          policy: 'drmRequired',
          drmActiveForUser: true,
          drmToken: 'fp-drm-tok-999',
          licenseStatus: 'READY',
          licenseProviders: {
            widevine: { configured: false, status: 'BLOCKED' },
            playready: { configured: false, status: 'BLOCKED' },
            fairplay: { configured: true, status: 'READY' },
          },
          licenseEndpoints: {
            widevine: '/api/ktn/drm/license/widevine',
            playready: '/api/ktn/drm/license/playready',
            fairplay: '/api/ktn/drm/license/fairplay',
          },
          fairplayCertificateUrl: '/api/ktn/drm/fairplay-cert',
          manifests: {
            packaged: true,
            dashUrl: null,
            hlsFairPlayUrl: '/api/ktn/drm/manifest/6adadc45f8c3c60002a2b3c1/hls/t-1/master.m3u8',
          },
          fallbackAllowed: false,
          fallbackStreamUrl: null,
          captureProtectionGuaranteed: false,
        }}
        isCompleted={false}
        onMarkCompleted={vi.fn()}
        onRetryStream={vi.fn()}
      />
    );

    const fpBadge = await screen.findByTestId('drm-active-badge');
    expect(fpBadge.textContent).toContain('FairPlay DRM');

    const mainCfg = fpConfigureCalls.find((c) => c && typeof c === 'object' && c.drm);
    expect(mainCfg).toBeTruthy();
    expect(typeof mainCfg.drm.initDataTransform).toBe('function');
    expect(mainCfg.drm.servers['com.apple.fps']).toBe('/api/ktn/drm/license/fairplay');
    expect(mainCfg.drm.advanced['com.apple.fps'].serverCertificateUri).toBe(
      '/api/ktn/drm/fairplay-cert'
    );
    expect(mainCfg.streaming?.useNativeHlsForFairPlay).toBe(true);

    // Invoke configured initDataTransform to confirm it transforms skd:// end-to-end
    const configuredOut = mainCfg.drm.initDataTransform(skdUtf8, 'skd', {
      serverCertificate: cert,
    });
    expect(configuredOut).toBeInstanceOf(Uint8Array);
    expect(configuredOut.byteLength).toBeGreaterThan(cert.byteLength + 12);

    // Verify request filter injects Authorization, X-KTN-DRM-Token & Content-Type: application/octet-stream
    const fpReq = { uris: ['/api/ktn/drm/license/fairplay'], headers: {} as Record<string, string> };
    fpRequestFilters[0](2, fpReq);
    expect(fpReq.headers.Authorization).toBe(`Bearer ${studentToken}`);
    expect(fpReq.headers['X-KTN-DRM-Token']).toBe('fp-drm-tok-999');
    expect(fpReq.headers['Content-Type']).toBe('application/octet-stream');

    // Verify response filter delegates FairPlay LICENSE responses to commonFairPlayResponse
    expect(fpResponseFilters.length).toBeGreaterThan(0);
    fpResponseFilters[0](2, { data: new ArrayBuffer(0) }, {});
    expect(commonRespSpy).toHaveBeenCalledTimes(1);
  });

  it('11. Regression: resolves CFK1 videoId when homework unit precedes video unit, forwards PlayReady SOAPAction, and preserves data: PSSH URIs in FairPlay HLS', async () => {
    const cfkStudentToken = (
      await signTestToken({
        id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        cognitoUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        onlineCourses: [{ id: COURSE_CFK_ID, code: 'CFK-01', title: 'CFK 1' }],
      })
    ).token;

    const cfkVideoUnitId = '65e8a76f7a2e2600088125b4';
    const cfkHwUnitId = '663e2cb2f960e80008fb905a';
    const expectedCfkVideoId = '65e8a7a56036860008448c37';

    await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_CFK_ID,
        policy: 'drmRequired',
        pilotUnitIds: [cfkVideoUnitId],
        packagedAssets: {
          [cfkVideoUnitId]: {
            dashUrl: 'https://drm-cdn.khongtunhi.test/cfk1-l1/manifest.mpd',
            hlsFairPlayUrl: 'https://drm-cdn.khongtunhi.test/cfk1-l1/master.m3u8',
            encryptionScheme: 'cbcs',
          },
        },
      },
    });

    let capturedSoapAction = '';
    const baseFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      // Return CFK1 units with HOMEWORK unit BEFORE VIDEO unit (real izTeach unsorted order)
      if (urlStr.includes('/prod/unit') && urlStr.includes(COURSE_CFK_ID)) {
        return new Response(
          JSON.stringify([
            {
              _id: cfkHwUnitId,
              id: cfkHwUnitId,
              index: 1,
              num: 1,
              course: COURSE_CFK_ID,
              title: 'Assignment 1',
              type: 'homework',
            },
            {
              _id: cfkVideoUnitId,
              id: cfkVideoUnitId,
              index: 0,
              num: 1,
              course: COURSE_CFK_ID,
              title: 'Lesson 1',
              type: 'video',
              resources: [{ _id: expectedCfkVideoId, id: expectedCfkVideoId }],
            },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      if (urlStr.includes('drm-cdn.khongtunhi.test/cfk1-l1/v720.m3u8')) {
        return new Response(
          [
            '#EXTM3U',
            '#EXT-X-VERSION:7',
            '#EXT-X-MAP:URI="v720/init.mp4"',
            '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://ktn/cfk1",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"',
            '#EXT-X-KEY:METHOD=SAMPLE-AES,URI="data:text/plain;base64,AAAAW3Bzc2g=",KEYFORMAT="urn:uuid:edef8ba9-79d6-4ace-a3c8-27dcd51d21ed"',
            '#EXTINF:4.0,',
            'v720/1.m4s',
            '#EXT-X-ENDLIST',
          ].join('\n'),
          { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
        );
      }
      if (urlStr.includes('kms.vendor-drm.test/playready')) {
        const hdrs = new Headers(init?.headers || {});
        capturedSoapAction = hdrs.get('SOAPAction') || '';
        return new Response('<AcquireLicenseResponse/>', {
          status: 200,
          headers: { 'Content-Type': 'text/xml; charset=utf-8' },
        });
      }
      return baseFetch(input as any, init);
    }) as any;

    const mockEnv = {
      KTN_DRM_PLAYREADY_PROXY_URL: 'https://kms.vendor-drm.test/playready',
      KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
    };

    const playbackRes = await callWorker(
      `/api/ktn/drm/playback?unitId=${cfkHwUnitId}&courseId=${COURSE_CFK_ID}`,
      { token: cfkStudentToken, envOverride: mockEnv }
    );
    expect(playbackRes.status).toBe(200);
    const playbackJson = await playbackRes.json();
    expect(playbackJson.videoId).toBe(expectedCfkVideoId);
    expect(playbackJson.manifests.packaged).toBe(true);
    expect(playbackJson.manifests.dashUrl).toContain(`/api/ktn/drm/manifest/${expectedCfkVideoId}/dash/`);
    expect(playbackJson.manifests.hlsFairPlayUrl).toContain(`/api/ktn/drm/manifest/${expectedCfkVideoId}/hls/`);

    // Verify CORS preflight allows SOAPAction and PlayReady proxy forwards SOAPAction header
    const preflightRes = await callWorker('/api/ktn/drm/license/playready', { method: 'OPTIONS' });
    expect(preflightRes.headers.get('Access-Control-Allow-Headers')).toContain('SOAPAction');

    const soapActionValue = '"http://schemas.microsoft.com/DRM/2007/03/protocols/AcquireLicense"';
    const prLicRes = await callWorker('/api/ktn/drm/license/playready', {
      method: 'POST',
      token: cfkStudentToken,
      headers: {
        'X-KTN-DRM-Token': playbackJson.drmToken,
        'Content-Type': 'text/xml; charset=utf-8',
        SOAPAction: soapActionValue,
      },
      rawBody: new TextEncoder().encode('<AcquireLicense/>'),
      envOverride: mockEnv,
    });
    expect(prLicRes.status).toBe(200);
    expect(capturedSoapAction).toBe(soapActionValue);

    // Verify FairPlay HLS manifest rewriter preserves both skd: and data: PSSH URIs
    const hlsVarUrl = playbackJson.manifests.hlsFairPlayUrl.replace(/master\.m3u8$/, 'v720.m3u8');
    const rewrittenRes = await callWorker(hlsVarUrl, { token: cfkStudentToken, envOverride: mockEnv });
    expect(rewrittenRes.status).toBe(200);
    const rewrittenText = await rewrittenRes.text();
    expect(rewrittenText).toContain('URI="skd://ktn/cfk1"');
    expect(rewrittenText).toContain('URI="data:text/plain;base64,AAAAW3Bzc2g="');
    expect(rewrittenText).toContain(`/api/ktn/drm/manifest/${expectedCfkVideoId}/hls/`);
    expect(rewrittenText).toContain('v720/init.mp4');
    expect(rewrittenText).toContain('v720/1.m4s');
  });

  it('12. Regression: keeps active DRM Shaka session alive across window focus events, configures PlayReady fallback audio robustness, and gates legacy WebKitMediaKeys', async () => {
    // 12a. Legacy WebKitMediaKeys.isTypeSupported=false does not report FairPlay supported
    Object.defineProperty(window, 'isSecureContext', { configurable: true, value: true });
    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: undefined,
    });
    const canPlaySpy = vi
      .spyOn(HTMLMediaElement.prototype, 'canPlayType')
      .mockImplementation((mime: string) => (mime.includes('mpegurl') ? 'maybe' : ''));
    (window as any).WebKitMediaKeys = { isTypeSupported: vi.fn(() => false) };
    const unsupportedWebViewReport = await detectDrmCapabilities();
    expect(unsupportedWebViewReport.fairplay.supported).toBe(false);
    expect(unsupportedWebViewReport.preferredDrm).toBeNull();
    delete (window as any).WebKitMediaKeys;
    canPlaySpy.mockRestore();

    // 12b. Shaka 6016 & 6003 classification
    expect(classifyDrmError({ code: 6016 }, 'fairplay', 'vi').code).toBe('DRM_LICENSE_DENIED');
    expect(classifyDrmError({ code: 6003 }, 'playready', 'en').code).toBe('DRM_MEDIA_ERROR');

    // 12c. PlayReady player config includes ['2000', ''] audioRobustness fallback & LearningPage ignores focus refetch
    const unitsJson = await (
      await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
        token: studentToken,
      })
    ).json();
    const unit1Id = String(unitsJson.lessons[0].unitId || unitsJson.lessons[0]._id);

    await callWorker('/api/ktn/drm/policy', {
      method: 'POST',
      token: adminToken,
      body: {
        courseId: COURSE_HSK1_ID,
        policy: 'drmRequired',
        packagedAssets: {
          [unit1Id]: {
            dashUrl: 'https://drm-cdn.khongtunhi.test/pilot/manifest.mpd',
            encryptionScheme: 'cbcs',
          },
        },
      },
    });

    const authUser = {
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1', title: 'HSK 1' }],
      token: studentToken,
    };
    saveStoredSession(authUser, studentToken);
    useAuthStore.setState({ user: authUser, authUser, isLoading: false });
    useUiStore.setState({ isDemoMode: false, videoDemoScenario: 'live_real' });

    Object.defineProperty(navigator, 'requestMediaKeySystemAccess', {
      configurable: true,
      writable: true,
      value: vi.fn(async (keySystem: string, configs: MediaKeySystemConfiguration[]) => {
        const rob = configs?.[0]?.videoCapabilities?.[0]?.robustness || '';
        if (keySystem === 'com.microsoft.playready.recommendation' && rob === '2000') {
          return {} as MediaKeySystemAccess;
        }
        throw new DOMException('Unsupported', 'NotSupportedError');
      }),
    });

    let shakaConstructCount = 0;
    let shakaDestroyCount = 0;
    const prConfigureCalls: any[] = [];
    class FakePlayReadyPlayer {
      constructor() {
        shakaConstructCount += 1;
      }
      getNetworkingEngine() {
        return { registerRequestFilter: () => {}, registerResponseFilter: () => {} };
      }
      configure = (cfg: any) => prConfigureCalls.push(cfg);
      addEventListener() {}
      attach = vi.fn(async () => {});
      load = vi.fn(async () => {});
      drmInfo = () => ({ keySystem: 'com.microsoft.playready.recommendation' });
      getVariantTracks = () => [];
      destroy = vi.fn(async () => {
        shakaDestroyCount += 1;
      });
    }
    (window as any).shaka = {
      Player: FakePlayReadyPlayer,
      polyfill: { installAll: vi.fn() },
      net: { NetworkingEngine: { RequestType: { LICENSE: 2 } } },
    };

    let playbackFetchCount = 0;
    const mockEnv = {
      KTN_DRM_PLAYREADY_PROXY_URL: 'https://kms.vendor-drm.test/playready',
      KTN_DRM_PROVIDER_API_KEY: 'super-secret-vendor-key-never-in-browser',
    };
    const prevFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr =
        typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('/api/ktn/')) {
        const pathOnly = urlStr.replace(/^https?:\/\/[^/]+/, '');
        if (pathOnly.startsWith('/api/ktn/drm/playback')) {
          playbackFetchCount += 1;
        }
        const res = await callWorker(pathOnly, {
          method: init?.method,
          token: studentToken,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
          envOverride: mockEnv,
        });
        return new Response(await res.text(), { status: res.status });
      }
      return prevFetch(input as any, init);
    }) as any;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/learning?courseId=${COURSE_HSK1_ID}&lesson=1`]}>
          <LearningPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const prBadge = await screen.findByTestId('drm-active-badge', {}, { timeout: 5000 });
    expect(prBadge.textContent).toContain('PlayReady DRM');
    expect(playbackFetchCount).toBe(1);
    expect(shakaConstructCount).toBe(1);
    expect(shakaDestroyCount).toBe(0);

    const prCfg = prConfigureCalls.find((c) => c && typeof c === 'object' && c.drm);
    expect(prCfg.drm.advanced['com.microsoft.playready.recommendation'].audioRobustness).toEqual([
      '2000',
      '',
    ]);

    // Simulate window focus + visibility return after playback started -> must NOT refetch drmPlayback or destroy active Shaka Player
    fireEvent(window, new Event('focus'));
    fireEvent(document, new Event('visibilitychange'));
    await new Promise((r) => setTimeout(r, 60));
    expect(playbackFetchCount).toBe(1);
    expect(shakaConstructCount).toBe(1);
    expect(shakaDestroyCount).toBe(0);
  });
});
