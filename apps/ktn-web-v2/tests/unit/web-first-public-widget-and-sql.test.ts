// @vitest-environment node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { pg_trgm } from '@electric-sql/pglite/contrib/pg_trgm';
// @ts-ignore JSDOM types are not installed in ktn-web-v2
import { JSDOM } from 'jsdom';

// @ts-ignore Root ESM modules do not carry TypeScript declarations
import { consultationPage, consultationPublicWidgetScript } from '../../../../consultation-page.mjs';
// @ts-ignore Root ESM modules do not carry TypeScript declarations
import { handleGeminiRelayRequest } from '../../../../consultation-worker.mjs';
// @ts-ignore E2E harness helper
import { createTestWorld, loadWorkerInstance, DEFAULT_TEST_ENV } from '../../../../tests/e2e-zalo-crm/harness/worker-client.mjs';

vi.setConfig({ testTimeout: 45_000, hookTimeout: 45_000 });

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

const ROLE_BOOTSTRAP_SQL = `
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOLOGIN;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    CREATE ROLE service_role NOLOGIN BYPASSRLS;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;
`;

function readRepoSql(relativePath: string): string {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), 'utf8');
}

const dbsToClose: PGlite[] = [];

afterEach(async () => {
  while (dbsToClose.length > 0) {
    const db = dbsToClose.pop();
    if (db) await db.close();
  }
});

describe('Web-first public Chatbot Widget, ?embed=1 mode & All-In-One SQL 20261120', () => {
  it('renders /tu-van?embed=1 with body.embed and frame-ancestors self while leaving /tu-van unembedded', async () => {
    const embedRes = consultationPage(false, true, true);
    expect(embedRes.status).toBe(200);
    expect(embedRes.headers.get('Content-Security-Policy')).toContain("frame-ancestors 'self'");
    const embedHtml = await embedRes.text();
    expect(embedHtml).toContain('<body class="embed">');
    expect(embedHtml).toContain('history.replaceState(null, \'\', location.pathname + location.search)');

    const fullRes = consultationPage(false, true, false);
    const fullHtml = await fullRes.text();
    expect(fullHtml).toContain('<body>');
    expect(fullHtml).not.toContain('<body class="embed">');

    const staffRes = consultationPage(true, true, true);
    const staffHtml = await staffRes.text();
    expect(staffHtml).toContain('<body class="embed">');
  });

  it('serves /api/ktn/consultations/widget.js and injects public chatbot script on public pages ONLY (never V1/V2/flashcards/tu-van)', async () => {
    const publicHtmlTemplate = (title: string) =>
      `<!doctype html><html><head><title>${title}</title></head><body><div id="__next"><main><h1>${title}</h1></main></div></body></html>`;

    const worker = loadWorkerInstance({
      fetchImpl: async (input: RequestInfo | URL) => {
        const u = new URL(
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
        );
        if (u.pathname === '/' || u.pathname === '/khoa-hoc-tieng-trung') {
          return new Response(publicHtmlTemplate(`Public ${u.pathname}`), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        if (u.pathname.startsWith('/custom-page/so-lien-lac')) {
          return new Response(publicHtmlTemplate(`Portal ${u.pathname}`), {
            status: 200,
            headers: { 'Content-Type': 'text/html; charset=utf-8' }
          });
        }
        return new Response('<html><body>Not Found</body></html>', {
          status: 404,
          headers: { 'Content-Type': 'text/html; charset=utf-8' }
        });
      }
    });

    const ctx = { waitUntil: () => {}, passThroughOnException: () => {} };
    const enabledEnv = { ...DEFAULT_TEST_ENV, KTN_CONSULTATIONS_ENABLED: 'true', KTN_CONSULTATION_MODE: 'full' };
    const disabledEnv = { ...DEFAULT_TEST_ENV, KTN_CONSULTATIONS_ENABLED: 'false', KTN_CONSULTATION_MODE: 'full' };

    const widgetEnabled = await worker.fetch(new Request('https://khongtunhi.com/api/ktn/consultations/widget.js'), enabledEnv, ctx);
    expect(widgetEnabled.status).toBe(200);
    expect(widgetEnabled.headers.get('Content-Type')).toContain('application/javascript');
    const widgetJs = await widgetEnabled.text();
    expect(widgetJs).toContain('__ktnPublicChatWidgetLoaded');
    expect(widgetJs).toContain('/tu-van?embed=1');

    const widgetDisabled = await worker.fetch(new Request('https://khongtunhi.com/api/ktn/consultations/widget.js'), disabledEnv, ctx);
    expect(widgetDisabled.status).toBe(200);
    expect(widgetDisabled.headers.get('Content-Type')).toContain('application/javascript');
    expect(await widgetDisabled.text()).toContain('consultation disabled');

    const homeRes = await worker.fetch(new Request('https://khongtunhi.com/'), enabledEnv, ctx);
    const homeHtml = await homeRes.text();
    expect(homeHtml).toContain('<script defer src="/api/ktn/consultations/widget.js"></script>');

    const courseRes = await worker.fetch(new Request('https://khongtunhi.com/khoa-hoc-tieng-trung'), enabledEnv, ctx);
    const courseHtml = await courseRes.text();
    expect(courseHtml).toContain('<script defer src="/api/ktn/consultations/widget.js"></script>');

    const homeOffRes = await worker.fetch(new Request('https://khongtunhi.com/'), disabledEnv, ctx);
    const homeOffHtml = await homeOffRes.text();
    expect(homeOffHtml).not.toContain('/api/ktn/consultations/widget.js');

    const v1Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac'), enabledEnv, ctx);
    const v1Html = await v1Res.text();
    expect(v1Html).not.toContain('/api/ktn/consultations/widget.js');
    expect(v1Html).not.toContain('rel="manifest"');

    const v2Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac-test'), enabledEnv, ctx);
    const v2Html = await v2Res.text();
    expect(v2Html).not.toContain('/api/ktn/consultations/widget.js');

    const tuVanEmbedRes = await worker.fetch(new Request('https://khongtunhi.com/tu-van?embed=1'), enabledEnv, ctx);
    expect(tuVanEmbedRes.status).toBe(200);
    expect(await tuVanEmbedRes.text()).toContain('<body class="embed">');
  });

  it('mounts floating shadow-DOM chat button in JSDOM on / with lazy iframe creation and hides on /custom-page/so-lien-lac', async () => {
    vi.useFakeTimers();
    try {
      const dom = new JSDOM('<!doctype html><html><body><div id="__next"><main>Trang chủ</main></div></body></html>', {
        url: 'https://khongtunhi.com/',
        runScripts: 'outside-only'
      });
      const { window } = dom;
      window.eval(consultationPublicWidgetScript());

      await vi.advanceTimersByTimeAsync(400);
      const host = window.document.getElementById('ktn-public-chat-host');
      expect(host).toBeTruthy();
      expect(host?.style.display).toBe('');
      expect(host?.closest('#__next')).toBeNull();

      const shadow = host?.shadowRoot;
      expect(shadow).toBeTruthy();
      const fab = shadow?.querySelector('.ktn-chat-fab') as HTMLButtonElement | null;
      const panel = shadow?.querySelector('.ktn-chat-panel');
      expect(fab).toBeTruthy();
      expect(shadow?.querySelector('iframe')).toBeNull();

      fab?.click();
      expect(panel?.classList.contains('open')).toBe(true);
      const frame = shadow?.querySelector('iframe') as HTMLIFrameElement | null;
      expect(frame).toBeTruthy();
      expect(frame?.getAttribute('src')).toBe('/tu-van?embed=1');

      const closeBtn = shadow?.querySelector('.ktn-chat-close') as HTMLButtonElement | null;
      closeBtn?.click();
      expect(panel?.classList.contains('open')).toBe(false);

      // Navigate SPA path onto protected V1 portal route -> auto-hides widget
      window.history.pushState({}, '', '/custom-page/so-lien-lac');
      await vi.advanceTimersByTimeAsync(1100);
      expect(host?.style.display).toBe('none');
    } finally {
      vi.useRealTimers();
    }
  });

  it('applies 20261120_ktn_web_consultation_live_all_in_one.sql cleanly on simulated live Supabase (without prior 20261114..20261119) AND re-runs idempotently', async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    dbsToClose.push(db);

    await db.exec(ROLE_BOOTSTRAP_SQL);
    await db.exec(readRepoSql('supabase_schema.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261109_ktn_master_upgrade.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261118_ktn_production_scale_all_in_one.sql'));

    const sql20261120 = readRepoSql('supabase/migrations/20261120_ktn_web_consultation_live_all_in_one.sql');
    await db.exec(sql20261120);
    // Re-run second time to confirm 100% idempotency
    await db.exec(sql20261120);

    const guidanceRes = await db.query<{
      bot_enabled: boolean;
      checkout_enabled: boolean;
      course_count: number;
      example_count: number;
    }>(
      `SELECT bot_enabled, checkout_enabled, cardinality(course_ids) AS course_count, jsonb_array_length(examples) AS example_count
       FROM public.ktn_consultation_guidance WHERE id = 'default'`
    );
    expect(guidanceRes.rows).toHaveLength(1);
    expect(guidanceRes.rows[0].bot_enabled).toBe(true);
    expect(guidanceRes.rows[0].checkout_enabled).toBe(true);
    expect(guidanceRes.rows[0].course_count).toBe(10);
    expect(guidanceRes.rows[0].example_count).toBeGreaterThanOrEqual(70);

    const advisorRes = await db.query<{ email: string; role: string; active: boolean }>(
      `SELECT email, role, active FROM public.ktn_advisors ORDER BY email`
    );
    expect(advisorRes.rows.map((r) => r.email)).toContain('quanly@khongtunhi.com');
    expect(advisorRes.rows.every((r) => r.role === 'manager' && r.active === true)).toBe(true);

    // Verify RLS blocks anon role on consultation tables & RPCs
    await db.exec('BEGIN; SET LOCAL ROLE anon;');
    let denied = false;
    try {
      await db.query('SELECT * FROM public.ktn_consultation_guidance LIMIT 1');
    } catch (err) {
      denied = /permission denied|insufficient_privilege/i.test((err as Error)?.message || '');
    } finally {
      await db.exec('ROLLBACK;');
    }
    expect(denied).toBe(true);
  });

  it('applies 20261120_ktn_web_consultation_live_all_in_one.sql cleanly on top of full 20261114+20261115+20261119 chain', async () => {
    const db = new PGlite({ extensions: { pg_trgm } });
    dbsToClose.push(db);

    await db.exec(ROLE_BOOTSTRAP_SQL);
    await db.exec(readRepoSql('supabase_schema.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261109_ktn_master_upgrade.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261114_ktn_consultations.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261115_ktn_consultation_example_capacity.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql'));
    await db.exec(readRepoSql('supabase/migrations/20261120_ktn_web_consultation_live_all_in_one.sql'));

    const res = await db.query<{ cnt: number }>('SELECT count(*)::int AS cnt FROM public.ktn_consultation_inbox');
    expect(res.rows[0].cnt).toBe(0);
  });

  it('retries onto KTN_GEMINI_FALLBACK_MODELS when primary KTN_GEMINI_MODEL returns 404 or 503', async () => {
    const world = await createTestWorld({
      mode: 'live-auth',
      envOverrides: {
        KTN_GEMINI_KEYS: 'fake-key-fallback-test',
        KTN_GEMINI_MODEL: 'gemini-retired-404',
        KTN_GEMINI_FALLBACK_MODELS: 'gemini-3.5-flash-lite,gemini-3-flash-preview'
      }
    });
    try {
      world.mocks.setFaults({
        geminiStatus: [404, 200],
        geminiResponse: {
          reply: 'Bé 6 tuổi có thể bắt đầu làm quen nhẹ nhàng tại nhà, mục tiêu chính của bé là gì ạ?',
          course_id: '',
          handoff: false
        }
      });

      const start = await world.startWebChat();
      expect(start.status).toBe(200);
      const sendRes = await world.sendWebMessage(start.token, 'Bé nhà chị 6 tuổi chưa biết gì, học có khó không em?');
      expect(sendRes.status).toBe(200);

      const calls = world.mocks.upstreamCalls.gemini;
      expect(calls.length).toBe(2);
      expect(String(calls[0].url)).toContain('/models/gemini-retired-404:generateContent');
      expect(String(calls[1].url)).toContain('/models/gemini-3.5-flash-lite:generateContent');

      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      expect(thread.status).toBe(200);
      expect(thread.json.status).toBe('bot');
      expect(thread.json.messages.some((m: { sender: string; body: string }) => m.sender === 'bot' && m.body.includes('mục tiêu chính'))).toBe(true);
    } finally {
      await world.close();
    }
  });

  it('normalizes empty course_id sentinels ("null", "none") while rejecting unknown fabricated course_id', async () => {
    const world = await createTestWorld({
      mode: 'live-auth',
      envOverrides: {
        KTN_GEMINI_KEYS: 'fake-key-sentinel-test',
        KTN_GEMINI_MODEL: 'gemini-3.5-flash-lite'
      }
    });
    try {
      for (const sentinel of ['null', 'none']) {
        await world.reset();
        world.mocks.setFaults({
          geminiResponse: {
            reply: 'Dạ, bé đã từng nghe tiếng Trung bao giờ chưa ạ?',
            course_id: sentinel,
            handoff: false
          }
        });
        const start = await world.startWebChat();
        await world.sendWebMessage(start.token, 'Bé 6 tuổi chưa biết gì ạ');
        const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
        expect(thread.json.status).toBe('bot');
        expect(thread.json.messages.some((m: { sender: string; body: string }) => m.sender === 'bot' && m.body.includes('tiếng Trung bao giờ chưa'))).toBe(true);
      }

      await world.reset();
      world.mocks.setFaults({
        geminiResponse: {
          reply: 'Anh/chị xem khóa này nhé.',
          course_id: 'NON_EXISTENT_ID',
          handoff: false
        }
      });
      const startBad = await world.startWebChat();
      await world.sendWebMessage(startBad.token, 'Bé 6 tuổi học khóa nào ạ?');
      const badThread = await world.request('/api/ktn/consultations/web/thread', { token: startBad.token });
      expect(badThread.json.status).toBe('open');
      expect(badThread.json.messages.some((m: { sender: string; body: string }) => m.sender === 'system' && m.body.includes('chuyển câu hỏi cho tư vấn viên'))).toBe(true);
    } finally {
      await world.close();
    }
  });

  it('routes Gemini calls through KTN_AI_RELAY Durable Object (wnam -> enam fallback on location block) and forwards via handleGeminiRelayRequest without leaking keys', async () => {
    const methodErr = await handleGeminiRelayRequest(new Request('https://do.internal/gemini', { method: 'GET' }));
    expect(methodErr.status).toBe(405);

    const invalidPayloadErr = await handleGeminiRelayRequest(
      new Request('https://do.internal/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: '../bad', apiKey: 'fake', payload: {} })
      })
    );
    expect(invalidPayloadErr.status).toBe(400);

    const relayCalls: Array<{ name: string; locationHint?: string; model?: string }> = [];
    const relayBinding = {
      idFromName(name: string) {
        return { name };
      },
      get(id: { name: string }, options?: { locationHint?: string }) {
        return {
          async fetch(input: RequestInfo | URL, init?: RequestInit) {
            const req = input instanceof Request ? input : new Request(input, init);
            const cloned = req.clone();
            const parsed = await cloned.json();
            relayCalls.push({
              name: id.name,
              locationHint: options?.locationHint,
              model: parsed?.model
            });
            if (options?.locationHint === 'wnam') {
              return new Response(
                JSON.stringify({
                  error: {
                    code: 400,
                    message: 'User location is not supported for the API use.',
                    status: 'FAILED_PRECONDITION'
                  }
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
            return handleGeminiRelayRequest(req);
          }
        };
      }
    };

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const fakeRelayTestKey = 'fake-key-do-relay-test';
    const world = await createTestWorld({
      mode: 'live-auth',
      envOverrides: {
        KTN_GEMINI_KEYS: fakeRelayTestKey,
        KTN_GEMINI_MODEL: 'gemini-3.5-flash-lite',
        KTN_GEMINI_FALLBACK_MODELS: '',
        KTN_AI_RELAY: relayBinding
      }
    });
    try {
      world.mocks.setFaults({
        geminiResponse: {
          reply: 'Bé 6 tuổi bắt đầu học tại nhà rất phù hợp với lộ trình nhẹ nhàng, chị muốn ưu tiên nghe nói trước hay cả đọc viết ạ?',
          course_id: '',
          handoff: false
        }
      });

      const start = await world.startWebChat();
      expect(start.status).toBe(200);
      const sendRes = await world.sendWebMessage(start.token, 'Bé nhà chị 6 tuổi chưa biết gì, học tại nhà được không em?');
      expect(sendRes.status).toBe(200);

      expect(relayCalls).toEqual([
        { name: 'ktn-gemini-relay-v1-wnam', locationHint: 'wnam', model: 'gemini-3.5-flash-lite' },
        { name: 'ktn-gemini-relay-v1-enam', locationHint: 'enam', model: 'gemini-3.5-flash-lite' }
      ]);
      expect(world.mocks.upstreamCalls.gemini).toHaveLength(1);
      expect(String(world.mocks.upstreamCalls.gemini[0].url)).toContain('/models/gemini-3.5-flash-lite:generateContent');
      const warnText = warnSpy.mock.calls.map((args) => args.join(' ')).join('\n');
      expect(warnText).not.toContain(fakeRelayTestKey);

      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      expect(thread.status).toBe(200);
      expect(thread.json.status).toBe('bot');
      expect(thread.json.messages.some((m: { sender: string; body: string }) => m.sender === 'bot' && m.body.includes('nghe nói trước'))).toBe(true);
    } finally {
      warnSpy.mockRestore();
      await world.close();
    }
  });

  it('executes serialized /tu-van?embed=1 script cleanly in JSDOM even when esbuild __name instrumentation is present', async () => {
    const rawHtml = await consultationPage(false, true, true).text();
    // Simulate Wrangler/esbuild keepNames injection inside serialized browser() source:
    const instrumentedHtml = rawHtml.replace(
      'function node(',
      '__name(node, "node");\nfunction node('
    );
    const runtimeErrors: string[] = [];
    const dom = new JSDOM(instrumentedHtml, {
      url: 'https://mock-ktn.local/tu-van?embed=1',
      runScripts: 'dangerously',
      beforeParse(window: any) {
        Object.defineProperty(window, 'crypto', { value: globalThis.crypto });
        window.matchMedia = () => ({ matches: false });
        window.addEventListener('error', (ev: any) => {
          runtimeErrors.push(ev?.message || String(ev?.error || 'error'));
        });
        window.fetch = async (url: string) => {
          if (url.endsWith('/web/start')) {
            return new Response(JSON.stringify({ token: 'web.33333333-3333-3333-3333-333333333333.9999999999999.sig' }), { status: 200 });
          }
          if (url.endsWith('/web/thread')) {
            return new Response(
              JSON.stringify({
                status: 'bot',
                messages: [],
                quickReplies: [
                  { id: 'MENU_FAQ', label: 'Chọn khóa học', payload: 'MENU_FAQ' },
                  { id: 'MENU_PAYMENT', label: 'Hướng dẫn thanh toán VietQR', payload: 'MENU_PAYMENT' }
                ]
              }),
              { status: 200 }
            );
          }
          if (url.endsWith('/web/catalog')) {
            return new Response(JSON.stringify({ courses: [], checkoutEnabled: false }), { status: 200 });
          }
          return new Response(JSON.stringify({}), { status: 200 });
        };
      }
    });

    await new Promise((resolve) => setTimeout(resolve, 60));
    expect(runtimeErrors).toEqual([]);
    const chips = [...dom.window.document.querySelectorAll('#content .quick-replies button.chip')];
    expect(chips.length).toBeGreaterThanOrEqual(2);
    expect(dom.window.document.querySelector('#content textarea[name="body"]')).toBeTruthy();
  });
});
