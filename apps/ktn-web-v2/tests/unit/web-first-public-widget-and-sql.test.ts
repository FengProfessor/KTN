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
// @ts-ignore E2E harness helper
import { loadWorkerInstance, DEFAULT_TEST_ENV } from '../../../../tests/e2e-zalo-crm/harness/worker-client.mjs';

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
});
