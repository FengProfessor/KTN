import React from 'react';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
import { HlsVideoPlayer } from '../../src/features/learning/components/HlsVideoPlayer';
import { LearningPage } from '../../src/features/learning/components/LearningPage';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { clearStoredSession, saveStoredSession } from '../../src/services/api/ktnApiClient';

const COURSE_HSK1_ID = '6adadba969897b0002482ca5';
const COURSE_CFK_ID = '65e7704a9ea90c00080d5195';

function toPlainHeaders(h?: any): Record<string, string> {
  const out: Record<string, string> = {};
  if (!h) return out;
  if (typeof h.forEach === 'function') {
    h.forEach((v: string, k: string) => {
      out[k] = String(v);
    });
    return out;
  }
  if (Array.isArray(h)) {
    for (const pair of h) {
      if (Array.isArray(pair) && pair.length >= 2) {
        out[String(pair[0])] = String(pair[1]);
      }
    }
    return out;
  }
  if (typeof h === 'object') {
    for (const [k, v] of Object.entries(h)) {
      if (v !== undefined && v !== null) out[k] = String(v);
    }
  }
  return out;
}

async function signTestToken(
  payload: Record<string, any>,
  secret = 'ktn-v2-local-hmac-secret-2026'
) {
  const jti =
    payload.jti || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  const data = {
    ...payload,
    jti,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000,
  };
  const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sigB64}`;
}

describe('Level 1 Content Protection Suite (HLS AES-128, Signed Doc/Audio Proxy, 3-Device Cap, Watermark & PDF Viewer)', () => {
  let harness: any;
  let studentToken: string;
  const originalFetch = globalThis.fetch;

  const sampleTsBytes = new Uint8Array(Array.from({ length: 564 }, (_, i) => (i * 17 + 71) & 0xff));
  const samplePdfBytes = Buffer.from('%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n');

  beforeEach(async () => {
    vi.restoreAllMocks();
    const variantLines = [
      '#EXTM3U',
      '#EXT-X-VERSION:3',
      '#EXT-X-MEDIA-SEQUENCE:0',
      '#EXT-X-ALLOW-CACHE:YES',
      '#EXT-X-TARGETDURATION:5',
      ...Array.from({ length: 35 }, (_, i) =>
        `#EXTINF:4.000000,\nseg_01_${String(i).padStart(7, '0')}.ts`
      ),
      '#EXT-X-ENDLIST',
    ].join('\n');

    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.includes('media.izteach.vn')) {
        if (urlStr.endsWith('playlist.m3u8')) {
          return new Response(
            '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=2000000,RESOLUTION=1280x720\nvariant_01.m3u8\n',
            { status: 200, headers: { 'Content-Type': 'application/vnd.apple.mpegurl' } }
          );
        }
        if (urlStr.endsWith('variant_01.m3u8')) {
          return new Response(variantLines, {
            status: 200,
            headers: { 'Content-Type': 'application/vnd.apple.mpegurl' },
          });
        }
        if (urlStr.endsWith('.ts')) {
          return new Response(sampleTsBytes, {
            status: 200,
            headers: { 'Content-Type': 'video/MP2T' },
          });
        }
      }
      if (urlStr.includes('d21acfi38wn3iy.cloudfront.net')) {
        const hdrs = toPlainHeaders(
          init?.headers || (typeof input === 'object' && 'headers' in input ? (input as Request).headers : undefined)
        );
        const range = hdrs.Range || hdrs.range;
        if (range === 'bytes=0-9') {
          return new Response(samplePdfBytes.subarray(0, 10), {
            status: 206,
            headers: {
              'Content-Type': 'application/pdf',
              'Content-Range': `bytes 0-9/${samplePdfBytes.length}`,
              'Content-Length': '10',
              'Accept-Ranges': 'bytes',
            },
          });
        }
        return new Response(samplePdfBytes, {
          status: 200,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Length': String(samplePdfBytes.length),
            'Accept-Ranges': 'bytes',
          },
        });
      }
      return originalFetch(input as any, init);
    }) as any;

    harness = createLocalWorkerHarness();
    studentToken = await signTestToken({
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      cognitoUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student',
      roles: ['student'],
      onlineCourses: [
        { id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK1 3.0' },
        { id: COURSE_CFK_ID, code: 'CFK-01', title: 'CFK' },
      ],
    });
  });

  afterEach(() => {
    clearStoredSession();
    globalThis.fetch = originalFetch;
    delete (window as any).pdfjsLib;
    vi.restoreAllMocks();
  });

  async function callWorker(
    path: string,
    opts: { method?: string; token?: string; headers?: Record<string, string>; body?: any } = {}
  ) {
    const reqHeaders: Record<string, string> = {};
    for (const [k, v] of Object.entries(opts.headers || {})) {
      if (v !== undefined && v !== null) reqHeaders[k] = String(v);
    }
    if (opts.token) {
      delete reqHeaders.authorization;
      delete reqHeaders.Authorization;
      reqHeaders.Authorization = `Bearer ${opts.token}`;
    }
    const hasCt = Object.keys(reqHeaders).some((k) => k.toLowerCase() === 'content-type');
    if (opts.body && !hasCt) {
      reqHeaders['Content-Type'] = 'application/json';
    }
    const req = new Request(`https://khongtunhi.com${path}`, {
      method: opts.method || 'GET',
      headers: reqHeaders,
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    const res = await harness.workerModule.fetch(req, harness.env);
    return res as Response;
  }

  it('1. Hides media.izteach.vn & cloudfront.net URLs in /api/ktn/courses and /api/ktn/courses/units and restricts canDownload to writing sheets', async () => {
    const catalogRes = await callWorker('/api/ktn/courses');
    expect(catalogRes.status).toBe(200);
    const catalogJson = await catalogRes.json();
    const hsk1Course = catalogJson.courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hsk1Course.demoVideoUrl).toMatch(/^\/api\/ktn\/media\/hls\/[0-9a-f]{24}\/playlist\.m3u8\?mt=/);
    expect(JSON.stringify(catalogJson.courses.map((c: any) => c.demoVideoUrl))).not.toContain('media.izteach.vn');

    const hsk1Res = await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
      token: studentToken,
    });
    expect(hsk1Res.status).toBe(200);
    const hsk1Json = await hsk1Res.json();
    const lesson1 = hsk1Json.lessons[0];

    expect(lesson1.streamUrl).toMatch(/^\/api\/ktn\/media\/hls\/[0-9a-f]{24}\/playlist\.m3u8\?mt=/);
    expect(lesson1.video).toBe(lesson1.streamUrl);
    expect(lesson1.posterUrl).toMatch(/^\/api\/ktn\/media\/poster\/[0-9a-f]{24}\.jpg\?mt=/);
    expect(JSON.stringify(hsk1Json.units)).not.toContain('media.izteach.vn');
    expect(JSON.stringify(hsk1Json.units)).not.toContain('d21acfi38wn3iy.cloudfront.net');

    const sgkMat = lesson1.materials.find((m: any) => m.type === 'sgk_pdf');
    const sbtMat = lesson1.materials.find((m: any) => m.type === 'sbt_pdf');
    const voVietMat = lesson1.materials.find((m: any) => m.type === 'voviet_pdf');
    expect(sgkMat.canDownload).toBe(false);
    expect(sgkMat.url).toContain('HSK1_SGK.pdf#page=17');
    expect(sbtMat.canDownload).toBe(false);
    expect(sbtMat.url).toContain('HSK1_SBT.pdf#page=11');
    expect(voVietMat.canDownload).toBe(true);
    expect(voVietMat.url).toContain('HSK1_Vo_luyen_viet.pdf#page=1');
    expect(lesson1.audioTracks[0].url).toContain('01-1.mp3');
    expect(lesson1.audioTracks[0].url).toMatch(/^\/api\/ktn\/media\/audio\//);

    // Non-HSK1 course check (syllabus PDF has canDownload: false)
    const cfkRes = await callWorker(`/api/ktn/courses/units?courseId=${COURSE_CFK_ID}`, {
      token: studentToken,
    });
    expect(cfkRes.status).toBe(200);
    const cfkText = await cfkRes.text();
    expect(cfkText).not.toContain('media.izteach.vn');
    expect(cfkText).not.toContain('d21acfi38wn3iy.cloudfront.net');
  });

  it('2. Encrypts .ts segments with HLS AES-128-CBC matching /api/ktn/media/hls-key and decrypts bit-for-bit', async () => {
    const unitsRes = await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
      token: studentToken,
    });
    const unitsJson = await unitsRes.json();
    const masterUrl = unitsJson.lessons[0].streamUrl as string;

    const masterRes = await callWorker(masterUrl);
    expect(masterRes.status).toBe(200);
    const masterText = await masterRes.text();
    expect(masterText).toContain('/api/ktn/media/hls/');
    const variantPath = masterText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l.includes('variant_01.m3u8'))!;
    expect(variantPath).toBeTruthy();

    const variantRes = await callWorker(variantPath);
    expect(variantRes.status).toBe(200);
    const variantText = await variantRes.text();
    expect(variantText).toContain('#EXT-X-ALLOW-CACHE:NO');

    const keyMatch = variantText.match(/#EXT-X-KEY:METHOD=AES-128,URI="([^"]+)",IV=0x([0-9a-f]{32})/i);
    expect(keyMatch).toBeTruthy();
    const keyUri = keyMatch![1];
    const ivBytes = Buffer.from(keyMatch![2], 'hex');

    const segPath = variantText
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l && !l.startsWith('#') && l.includes('.ts'))!;
    expect(segPath).toBeTruthy();

    const [keyRes, segRes] = await Promise.all([callWorker(keyUri), callWorker(segPath)]);
    expect(keyRes.status).toBe(200);
    expect(segRes.status).toBe(200);

    const keyBuf = new Uint8Array(await keyRes.arrayBuffer());
    expect(keyBuf.byteLength).toBe(16);

    const encBuf = new Uint8Array(await segRes.arrayBuffer());
    expect(Buffer.from(encBuf).equals(Buffer.from(sampleTsBytes))).toBe(false);

    const subtle = globalThis.crypto?.subtle || crypto.webcrypto.subtle;
    const aesKey = await subtle.importKey(
      'raw',
      keyBuf,
      { name: 'AES-CBC' },
      false,
      ['decrypt']
    );
    const decBuf = new Uint8Array(
      await subtle.decrypt({ name: 'AES-CBC', iv: ivBytes }, aesKey, encBuf)
    );
    expect(Buffer.from(decBuf).equals(Buffer.from(sampleTsBytes))).toBe(true);
  });

  it('3. Truncates demo HLS playlist ~90s, rejects scrapers/tampered tokens/hotlink Origins with 403, and rate-limits segment bursts (429)', async () => {
    const catalogRes = await callWorker('/api/ktn/courses');
    const catalogJson = await catalogRes.json();
    const demoUrl = catalogJson.courses.find((c: any) => c.id === COURSE_HSK1_ID).demoVideoUrl as string;

    const demoMaster = await (await callWorker(demoUrl)).text();
    const demoVarUrl = demoMaster
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('variant_01.m3u8'))!;
    const demoVarText = await (await callWorker(demoVarUrl)).text();
    const segCount = demoVarText.split('\n').filter((l) => l.trim().startsWith('#EXTINF:')).length;
    expect(segCount).toBeGreaterThan(20);
    expect(segCount).toBeLessThanOrEqual(25); // 94s max / 4s per segment = 24 segments vs 35 full

    // Scraper UA blocked (403)
    const scraperRes = await callWorker(demoUrl, { headers: { 'User-Agent': 'yt-dlp/2026.01' } });
    expect(scraperRes.status).toBe(403);

    // Hotlink Origin blocked (403)
    const evilOriginRes = await callWorker(demoUrl, { headers: { Origin: 'https://pirate-site.example' } });
    expect(evilOriginRes.status).toBe(403);

    // Tampered token blocked (403)
    const tamperedUrl = demoUrl.replace(/mt=[^&]+/, 'mt=tampered.token123');
    const tamperedRes = await callWorker(tamperedUrl);
    expect(tamperedRes.status).toBe(403);

    // Burst rate limit (>40 TS fetches in 10s -> 429)
    const demoSegUrl = demoVarText.split('\n').map((l) => l.trim()).find((l) => l.includes('.ts'))!;
    for (let i = 0; i < 40; i++) {
      const okRes = await callWorker(demoSegUrl);
      expect(okRes.status).toBe(200);
    }
    const burstBlocked = await callWorker(demoSegUrl);
    expect(burstBlocked.status).toBe(429);
  });

  it('4. Proxies PDF Range requests (206) and enforces inline-only on SGK vs attachment allowed on Vở tập viết', async () => {
    const unitsRes = await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, {
      token: studentToken,
    });
    const lesson1 = (await unitsRes.json()).lessons[0];
    const sgkMat = lesson1.materials.find((m: any) => m.type === 'sgk_pdf');
    const voVietMat = lesson1.materials.find((m: any) => m.type === 'voviet_pdf');

    const rangeRes = await callWorker(sgkMat.url.split('#')[0], {
      headers: { Range: 'bytes=0-9' },
    });
    expect(rangeRes.status).toBe(206);
    expect(rangeRes.headers.get('Accept-Ranges')).toBe('bytes');
    expect(rangeRes.headers.get('Content-Disposition')).toContain('inline');

    // Even if user appends ?dl=1 manually to SGK, server refuses attachment
    const sgkForcedDl = await callWorker(`${sgkMat.url.split('#')[0]}?dl=1`);
    expect(sgkForcedDl.status).toBe(200);
    expect(sgkForcedDl.headers.get('Content-Disposition')).toContain('inline');

    // Vở tập viết permits ?dl=1 attachment
    const vvDl = await callWorker(voVietMat.fileUrl);
    expect(vvDl.status).toBe(200);
    expect(vvDl.headers.get('Content-Disposition')).toContain('attachment');
  });

  it('5. Enforces max 3 concurrent sessions per student (FIFO evicts 1st session + revokes its HLS key), without capping teachers', async () => {
    const loginStudent = async () => {
      const res = await callWorker('/api/ktn/auth/login', {
        method: 'POST',
        body: { email: 'hoangngan@khongtunhi.com', password: 'KtnStudent@2026', role: 'student' },
      });
      expect(res.status).toBe(200);
      return (await res.json()).token as string;
    };

    const t1 = await loginStudent();
    const u1 = await (await callWorker(`/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`, { token: t1 })).json();
    const m3u8_1 = u1.lessons[0].streamUrl as string;
    const varUrl_1 = (await (await callWorker(m3u8_1)).text())
      .split('\n')
      .map((l) => l.trim())
      .find((l) => l.includes('.m3u8'))!;
    const keyUrl_1 = (await (await callWorker(varUrl_1)).text()).match(/URI="([^"]+)"/)![1];

    const t2 = await loginStudent();
    const t3 = await loginStudent();
    // With 3 active devices, t1 still works
    expect((await callWorker('/api/ktn/auth/session', { token: t1 })).status).toBe(200);
    expect((await callWorker(keyUrl_1)).status).toBe(200);

    // 4th login evicts t1
    const t4 = await loginStudent();
    expect((await callWorker('/api/ktn/auth/session', { token: t1 })).status).toBe(401);
    expect((await callWorker(keyUrl_1)).status).toBe(403);
    expect((await callWorker('/api/ktn/auth/session', { token: t2 })).status).toBe(200);
    expect((await callWorker('/api/ktn/auth/session', { token: t3 })).status).toBe(200);
    expect((await callWorker('/api/ktn/auth/session', { token: t4 })).status).toBe(200);

    // Teachers are exempt from the 3-device student cap
    const teacherTokens: string[] = [];
    for (let i = 0; i < 4; i++) {
      const res = await callWorker('/api/ktn/auth/login', {
        method: 'POST',
        body: { email: 'linh.lam@khongtunhi.com', password: 'KtnTeacher@2026', role: 'teacher' },
      });
      expect(res.status).toBe(200);
      teacherTokens.push((await res.json()).token);
    }
    expect((await callWorker('/api/ktn/auth/session', { token: teacherTokens[0] })).status).toBe(200);
  });

  it('6. HlsVideoPlayer hides native controls, renders dynamic learner watermark, and blocks DOM removal tampering', async () => {
    useAuthStore.setState({
      user: {
        id: 'stu-1',
        code: 'KTN-2026-089',
        email: 'hoangngan@khongtunhi.com',
        phone: '0912345678',
        name: 'Bé Hoàng Ngân',
        role: 'student',
        roles: ['student'],
        classCode: 'YCT2-04',
        hasLiveClass: true,
        hasOnlineCourses: true,
        onlineCourses: [{ id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK 1 3.0' }],
      },
      authUser: null,
      isLoading: false,
      isRestoring: false,
      error: null,
    });

    const { container } = render(
      <HlsVideoPlayer
        lessonTitle="Bài 1"
        courseName="HSK 1"
        streamUrl="https://khongtunhi.com/lesson1.mp4"
        isCompleted={false}
        onMarkCompleted={() => {}}
        onRetryStream={() => {}}
      />
    );

    const videoEl = screen.getByTestId('hls-video-element') as HTMLVideoElement;
    expect(videoEl.hasAttribute('controls')).toBe(false);
    expect(videoEl.getAttribute('controlsList')).toContain('nodownload');

    const wm = await screen.findByTestId('video-dynamic-watermark', {}, { timeout: 3000 });
    expect(wm.textContent).toContain('KTN-2026-089');
    expect(wm.textContent).toContain('hoangngan@khongtunhi.com');
    expect(wm.textContent).toContain('0912***678');

    // Simulate DevTools watermark deletion tampering while active
    const pauseSpy = vi.spyOn(videoEl, 'pause').mockImplementation(() => {});
    wm.remove();

    await waitFor(() => {
      expect(pauseSpy).toHaveBeenCalled();
      expect(container.querySelector('[data-testid="video-dynamic-watermark"]')).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('7. LearningPage hides Download on SGK/SBT, keeps Download on Vở tập viết, and opens ProtectedPdfModal on click', async () => {
    const sessionUser = {
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      code: 'KTN-2026-089',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student' as const,
      roles: ['student' as const],
      classCode: 'YCT2-04',
      hasLiveClass: true,
      hasOnlineCourses: true,
      onlineCourses: [
        { id: COURSE_HSK1_ID, code: 'HSK1-30', title: 'HSK 1 3.0' },
        { id: COURSE_CFK_ID, code: 'CFK-01', title: 'CFK' },
      ],
      token: studentToken,
    };
    saveStoredSession(sessionUser, studentToken);
    useAuthStore.setState({ user: sessionUser, authUser: sessionUser, isLoading: false, isRestoring: false, error: null });
    useUiStore.setState({ isDemoMode: false, videoDemoScenario: 'live_real' });

    (window as any).pdfjsLib = {
      GlobalWorkerOptions: { workerSrc: '' },
      getDocument: () => ({
        promise: Promise.resolve({
          numPages: 30,
          getPage: async () => ({
            getViewport: ({ scale }: { scale: number }) => ({
              width: 600 * scale,
              height: 800 * scale,
            }),
            render: () => ({ promise: Promise.resolve() }),
          }),
          destroy: () => {},
        }),
      }),
    };

    const workerOriginFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (urlStr.startsWith('/api/ktn/') || urlStr.includes('/api/ktn/')) {
        const pathOnly = urlStr.replace(/^https?:\/\/[^/]+/, '');
        const hdrsObj = toPlainHeaders(init?.headers);
        const hasAuth = Object.keys(hdrsObj).some((k) => k.toLowerCase() === 'authorization');
        const workerRes = await callWorker(pathOnly, {
          method: init?.method,
          token: hasAuth ? undefined : studentToken,
          headers: hdrsObj,
          body: init?.body ? JSON.parse(String(init.body)) : undefined,
        });
        const bodyText =
          workerRes.status === 204 || workerRes.status === 304
            ? null
            : await workerRes.text();
        return new Response(bodyText, {
          status: workerRes.status,
          headers: toPlainHeaders(workerRes.headers),
        });
      }
      return workerOriginFetch(input as any, init);
    }) as any;

    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    render(
      <QueryClientProvider client={qc}>
        <MemoryRouter initialEntries={[`/learning?courseId=${COURSE_HSK1_ID}&lesson=1&tab=materials`]}>
          <LearningPage />
        </MemoryRouter>
      </QueryClientProvider>
    );

    const sgkOpenBtn = await screen.findByTestId(
      'material-open-btn-hsk1-l1-sgk-pdf',
      {},
      { timeout: 5000 }
    );
    expect(screen.queryByTestId('material-download-btn-hsk1-l1-sgk-pdf')).toBeNull();
    expect(screen.queryByTestId('material-download-btn-hsk1-l1-sbt-pdf')).toBeNull();
    expect(screen.getByTestId('material-download-btn-hsk1-l1-voviet-pdf')).toBeInTheDocument();

    fireEvent.click(sgkOpenBtn);
    const modal = await screen.findByTestId('protected-pdf-modal');
    expect(modal).toBeInTheDocument();
    expect(screen.getByTestId('protected-pdf-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('protected-pdf-watermark')).toBeInTheDocument();
    expect(screen.queryByTestId('protected-pdf-download-btn')).toBeNull();

    fireEvent.click(screen.getByTestId('protected-pdf-close-btn'));
    expect(screen.queryByTestId('protected-pdf-modal')).toBeNull();
  });
});
