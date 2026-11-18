import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoForbiddenAiText,
  assertNoSecretLeaks,
  assertPiiRedacted,
  assertSafeCustomerThreadResponse,
  assertV1Isolation,
  assertVietQrPayment,
  assertViteBundleBudget
} from '../harness/assertions.mjs';
import {
  CATALOG_COURSES,
  LEARNERS_AND_PARENTS,
  MAX_VITE_CHUNK_BYTES,
  PROTECTED_V1_PAGE_ID,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS,
  makeSepayWebhook,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import {
  CORE_MIGRATION_FILES,
  ROOT_DIR,
  createSupabasePgliteHarness,
  loadMigrations
} from '../harness/pglite-supabase.mjs';
import { createTestWorld, loadWorkerInstance } from '../harness/worker-client.mjs';
import { SUITE_REGISTRY, parseCliArgs } from '../run_all_e2e.mjs';

function runGit(args) {
  return execFileSync('git', ['-C', ROOT_DIR, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe']
  }).trim();
}

function runGitExitCode(args) {
  try {
    execFileSync('git', ['-C', ROOT_DIR, ...args], { stdio: 'ignore' });
    return 0;
  } catch (err) {
    return typeof err?.status === 'number' ? err.status : 1;
  }
}

function listJsFilesInDir(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...listJsFilesInDir(full));
    else if (entry.isFile() && /\.(?:m?js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

describe('Tier 1 — Infra, Migrations, V1/Secrets Safety & QA Readiness (F01, F02, F18)', () => {
  describe('F01 — Safe Feature Branch & Additive SQL Migrations', () => {
    let pg;

    before(async () => {
      pg = await createSupabasePgliteHarness();
    });

    after(async () => {
      await pg?.close();
    });

    it('[F01] T1-INFRA-F01-01: Working branch is feat/ktn-zalo-oa-crm branched off feat/ktn-react-ui-v2 (6f244cc), never main', () => {
      const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD']);
      assert.notEqual(branch, 'main', 'Must not work on legacy main branch');
      assert.equal(branch, 'feat/ktn-zalo-oa-crm');
      assert.equal(runGitExitCode(['merge-base', '--is-ancestor', '6f244cc', 'HEAD']), 0);
      assert.equal(runGitExitCode(['merge-base', '--is-ancestor', 'feat/ktn-react-ui-v2', 'HEAD']), 0);
    });

    it('[F01] T1-INFRA-F01-02: Core SQL migrations load cleanly in PGlite, 20261119 re-runs idempotently, and pg_trgm is active', async () => {
      const reapplied = await loadMigrations(pg.db, [CORE_MIGRATION_FILES[4]]);
      assert.deepEqual(reapplied, ['supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql']);

      const trgmRes = await pg.db.query(`SELECT similarity('tieng trung', 'tiếng trung') AS sim`);
      assert.ok(Number(trgmRes.rows[0].sim) > 0, 'pg_trgm similarity() must return > 0');
    });

    it('[F01] T1-INFRA-F01-03: 20261119 schema invariants (zalo_oa channel, advisor roles, new tables, student_code FK ON DELETE SET NULL)', async () => {
      const stuCode = 'KTN-TMP-FK-01';
      await pg.db.query(
        `INSERT INTO public.ktn_students (code, email, name) VALUES ($1, 'fk.test@example.test', 'FK Test')`,
        [stuCode]
      );

      const convRes = await pg.db.query(
        `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, source_tag, student_code, status)
         VALUES ('zalo_oa', 'zalo-fk-01', 'zalo-fk-01', 'zalo_oa', $1, 'open')
         RETURNING id, channel, student_code`,
        [stuCode]
      );
      assert.equal(convRes.rows[0].channel, 'zalo_oa');
      assert.equal(convRes.rows[0].student_code, stuCode);
      const convId = convRes.rows[0].id;

      // Deleting referenced student sets student_code = NULL rather than failing or deleting consultation
      await pg.db.query(`DELETE FROM public.ktn_students WHERE code = $1`, [stuCode]);
      const afterDel = await pg.db.query(`SELECT student_code FROM public.ktn_consultations WHERE id = $1`, [convId]);
      assert.equal(afterDel.rows[0].student_code, null);

      // ktn_advisors accepts both advisor and manager roles
      await pg.db.query(
        `INSERT INTO public.ktn_advisors (email, name, role, active)
         VALUES ('role.adv@khongtunhi.com', 'Role Adv', 'advisor', true),
                ('role.mgr@khongtunhi.com', 'Role Mgr', 'manager', true)
         ON CONFLICT (email) DO UPDATE SET role = EXCLUDED.role`
      );
      const roleRows = await pg.db.query(
        `SELECT email, role FROM public.ktn_advisors WHERE email IN ('role.adv@khongtunhi.com', 'role.mgr@khongtunhi.com') ORDER BY email`
      );
      assert.deepEqual(roleRows.rows.map((r) => r.role), ['advisor', 'manager']);

      // Verify columns on ktn_zalo_oa_events & ktn_sepay_reconciliation_logs
      const colsRes = await pg.db.query(
        `SELECT table_name, column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name IN ('ktn_zalo_oa_events', 'ktn_sepay_reconciliation_logs')`
      );
      const zaloCols = new Set(colsRes.rows.filter((r) => r.table_name === 'ktn_zalo_oa_events').map((r) => r.column_name));
      const reconCols = new Set(colsRes.rows.filter((r) => r.table_name === 'ktn_sepay_reconciliation_logs').map((r) => r.column_name));
      for (const col of ['event_id', 'event_name', 'zalo_user_id', 'consultation_id', 'payload', 'status']) {
        assert.ok(zaloCols.has(col), `Missing ktn_zalo_oa_events.${col}`);
      }
      for (const col of ['transaction_id', 'order_id', 'kind', 'amount', 'resolution_status', 'resolved_by']) {
        assert.ok(reconCols.has(col), `Missing ktn_sepay_reconciliation_logs.${col}`);
      }
    });

    it('[F01] T1-INFRA-F01-04: ktn_consultation_inbox preserves 16+6 columns, guidance accepts 120 examples, and .env.example has required vars', async () => {
      const inboxColsRes = await pg.db.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'ktn_consultation_inbox'
         ORDER BY ordinal_position`
      );
      const expectedCols = [
        'id', 'channel', 'external_id', 'owner_email', 'status', 'outcome',
        'follow_up_at', 'queued_at', 'first_reply_at', 'last_customer_at',
        'last_reply_at', 'next_review_at', 'created_at', 'updated_at',
        'reply_pending', 'has_paid_pending',
        'customer_name', 'customer_phone', 'zalo_user_id', 'source_tag', 'lead_meta', 'student_code'
      ];
      assert.deepEqual(inboxColsRes.rows.map((r) => r.column_name), expectedCols);

      const examples120 = Array.from({ length: 120 }, (_, i) => ({
        question: `Câu hỏi mẫu số ${i + 1}`,
        answer: `Trả lời chuẩn mẫu số ${i + 1}`
      }));
      await pg.db.query(
        `UPDATE public.ktn_consultation_guidance SET examples = $1::jsonb WHERE id = 'default'`,
        [JSON.stringify(examples120)]
      );
      const gCheck = await pg.db.query(`SELECT jsonb_array_length(examples) AS len FROM public.ktn_consultation_guidance WHERE id = 'default'`);
      assert.equal(gCheck.rows[0].len, 120);

      const envExPath = path.join(ROOT_DIR, '.env.example');
      assert.ok(fs.existsSync(envExPath), '.env.example must exist');
      const envExText = fs.readFileSync(envExPath, 'utf8');
      for (const key of [
        'KTN_ZALO_APP_ID',
        'KTN_ZALO_APP_SECRET',
        'KTN_ZALO_OA_ID',
        'KTN_ZALO_OA_ACCESS_TOKEN',
        'KTN_ZALO_OA_REFRESH_TOKEN',
        'KTN_ZALO_SANDBOX',
        'KTN_AI_SANDBOX',
        'KTN_SEPAY_SANDBOX',
        'KTN_SEPAY_BANK_ID',
        'KTN_SEPAY_ACCOUNT_NO',
        'KTN_SEPAY_ACCOUNT_NAME'
      ]) {
        assert.ok(envExText.includes(`${key}=`), `.env.example missing ${key}`);
      }
      assertNoSecretLeaks(envExText, { checkDotEnv: false, label: '.env.example' });
    });

    it('[F01] T1-INFRA-F01-05: Additive RPCs and hardened ktn_consultation_protect_order execute cleanly via service_role', async () => {
      const base = TEST_ENV_DEFAULTS.SUPABASE_URL;
      const rpcPost = async (name, body) => {
        const res = await pg.fetch(`${base}/rest/v1/rpc/${name}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        assert.equal(res.status, 200, `RPC ${name} expected 200, got ${res.status}`);
        return res.json();
      };

      const zUpsert = await rpcPost('ktn_consultation_upsert_zalo_inbound', {
        p_event_id: 'zevt_t1_f01_05',
        p_event_name: 'user_send_text',
        p_zalo_user_id: 'zalo-rpc-f01-05',
        p_payload: { body: 'Bé 7 tuổi hỏi lớp', customer_name: 'PH F01', customer_phone: '0901234567' }
      });
      assert.equal(zUpsert.ok, true);
      const convId = zUpsert.conversation.id;

      const ordRes = await rpcPost('ktn_consultation_create_order', {
        p_id: convId,
        p_request_id: crypto.randomUUID(),
        p_qr_base: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?addInfo=KTN%20ORDER_CODE',
        p_order: {
          student_name: 'PH F01',
          student_email: 'f01.rpc@example.test',
          phone: '0901234567',
          course_id: CATALOG_COURSES[0].course_id,
          course_name: CATALOG_COURSES[0].title,
          amount: CATALOG_COURSES[0].price,
          payment_info: {
            qrUrl: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?addInfo=KTN%20ORDER_CODE',
            transferContent: 'KTN ORDER_CODE',
            amount: CATALOG_COURSES[0].price,
            accountNo: '0987654321'
          }
        }
      });
      const orderId = ordRes.order_id;
      assert.match(orderId, /^ORD-\d{6}$/);

      // Hardened ktn_consultation_protect_order allows legitimate provisioning updates on consultation orders
      await pg.db.query(
        `UPDATE public.ktn_orders
         SET payment_status = 'paid',
             approval_status = 'approved',
             source = 'zalo_oa',
             note = '<!--KTN_ORDER_META:{"source":"zalo_oa","payment_sub_status":"verified_paid"}-->'
         WHERE order_id = $1`,
        [orderId]
      );

      const logRes = await rpcPost('ktn_consultation_log_sepay_reconciliation', {
        p_transaction_id: 'sepay:t1_f01_05',
        p_kind: 'accepted',
        p_amount: CATALOG_COURSES[0].price,
        p_order_id: orderId
      });
      assert.equal(logRes.ok, true);

      const listRes = await rpcPost('ktn_consultation_list_sepay_reconciliation', {
        p_resolution_status: 'open',
        p_kind: 'accepted'
      });
      assert.ok(Array.isArray(listRes.items) && listRes.items.some((r) => r.transaction_id === 'sepay:t1_f01_05'));

      const resResolve = await rpcPost('ktn_consultation_resolve_sepay_reconciliation', {
        p_transaction_id: 'sepay:t1_f01_05',
        p_resolution_status: 'resolved',
        p_actor: STAFF_ACTORS.manager.email,
        p_note: 'Verified in F01',
        p_order_id: orderId
      });
      assert.equal(resResolve.ok, true);

      const linkRes = await rpcPost('ktn_consultation_link_student', {
        p_consultation_id: convId,
        p_student_code: 'KTN-2026-089',
        p_actor: STAFF_ACTORS.manager.email
      });
      assert.equal(linkRes.ok, true);
      assert.equal(linkRes.student_code, 'KTN-2026-089');
    });
  });

  describe('F02 — V1 Isolation, N27/N28b Parity & Secrets Hygiene', () => {
    let world;

    before(async () => {
      world = await createTestWorld({ mode: 'live-auth' });
    });

    beforeEach(async () => {
      await world.reset();
    });

    after(async () => {
      await world?.close();
    });

    it('[F02] T1-INFRA-F02-01: assertV1Isolation passes on repo (V1 files untouched, protected ID present, sw.js byte-identical)', () => {
      assertV1Isolation({ rootDir: ROOT_DIR, baseRef: 'feat/ktn-react-ui-v2', checkSwParity: true });
      const deploySrc = fs.readFileSync(path.join(ROOT_DIR, 'deploy_ktn_react_v2_izteach.cjs'), 'utf8');
      assert.ok(deploySrc.includes(PROTECTED_V1_PAGE_ID));
    });

    it('[F02] T1-INFRA-F02-02: .env and secret files are untracked and gitignored; only .env.example is tracked', () => {
      const tracked = runGit(['ls-files', '.env', '.env.*'])
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean);
      assert.deepEqual(tracked, ['.env.example']);

      const gitignore = fs.readFileSync(path.join(ROOT_DIR, '.gitignore'), 'utf8');
      assert.match(gitignore, /^\.env$/m);
      assert.match(gitignore, /^\.env\.\*$/m);
      assert.match(gitignore, /^!\.env\.example$/m);
      assert.match(gitignore, /^\.dev\.vars$/m);
      if (fs.existsSync(path.join(ROOT_DIR, '.env'))) {
        assert.equal(runGitExitCode(['check-ignore', '-q', '.env']), 0, '.env must be gitignored');
      }
    });

    it('[F02] T1-INFRA-F02-03: Root workers, migrations, BFF, and apps/ktn-web-v2/src contain zero hardcoded secrets or .env values', () => {
      const filesToScan = [
        ...fs.readdirSync(ROOT_DIR)
          .filter((name) => /\.(?:m?js)$/.test(name))
          .map((name) => path.join(ROOT_DIR, name)),
        ...fs.readdirSync(path.join(ROOT_DIR, 'supabase', 'migrations'))
          .filter((name) => name.endsWith('.sql'))
          .map((name) => path.join(ROOT_DIR, 'supabase', 'migrations', name)),
        path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'server', 'local-worker-middleware.mjs'),
        ...listJsFilesInDir(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'src'))
      ];

      const walkTs = (dir) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, entry.name);
          if (entry.isDirectory()) walkTs(full);
          else if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) filesToScan.push(full);
        }
      };
      walkTs(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'src'));

      for (const filePath of filesToScan) {
        const content = fs.readFileSync(filePath, 'utf8');
        assertNoSecretLeaks(content, {
          checkDotEnv: true,
          rootDir: ROOT_DIR,
          label: path.relative(ROOT_DIR, filePath)
        });
      }
    });

    it('[F02] T1-INFRA-F02-04: N27 & N28b positive parity (V1 HTML omits rel="manifest", V2 injects manifest, sw.js notifies V2 only)', async () => {
      const worker = loadWorkerInstance({
        fetchImpl: async (input) => {
          const u = new URL(typeof input === 'string' ? input : input.url);
          if (u.pathname.startsWith('/custom-page/so-lien-lac')) {
            return new Response('<html><head><title>SLL</title></head><body>OK</body></html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      });

      const ctx = { waitUntil() {}, passThroughOnException() {} };
      const v1Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac'), world.env, ctx);
      const v2Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac-test'), world.env, ctx);
      assert.equal(v1Res.status, 200);
      assert.equal(v2Res.status, 200);
      const v1Html = await v1Res.text();
      const v2Html = await v2Res.text();
      assertV1Isolation({ rootDir: ROOT_DIR, baseRef: 'feat/ktn-react-ui-v2', v1Html, v2Html, checkSwParity: true });

      // N28b sw.js notificationclick VM verification
      const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
      const listeners = {};
      const v1Posted = [];
      const v2Posted = [];
      const swSandbox = {
        URL,
        URLSearchParams,
        Response,
        Promise,
        fetch: async () => new Response('ok', { status: 200 }),
        caches: { open: async () => ({ put: async () => {}, addAll: async () => {}, match: async () => null }), keys: async () => [], delete: async () => true, match: async () => null },
        self: {
          location: { origin: 'https://khongtunhi.com' },
          addEventListener: (ev, fn) => { listeners[ev] = fn; },
          skipWaiting: () => Promise.resolve(),
          registration: { showNotification: async () => {} },
          clients: {
            claim: () => Promise.resolve(),
            matchAll: async () => [
              { url: 'https://khongtunhi.com/custom-page/so-lien-lac', postMessage: (m) => v1Posted.push(m), focus: async () => {} },
              { url: 'https://khongtunhi.com/custom-page/so-lien-lac-test#/dashboard', postMessage: (m) => v2Posted.push(m), focus: async () => {} }
            ],
            openWindow: async () => null
          }
        }
      };
      vm.runInNewContext(swSrc, swSandbox, { filename: 'sw.js' });
      let clickWait = Promise.resolve();
      listeners.notificationclick({
        notification: { close: () => {}, data: { eventType: 'homework_graded', classCode: 'CLS-A' } },
        waitUntil: (p) => { clickWait = p; }
      });
      await clickWait;
      assert.equal(v1Posted.length, 0, 'V1 tab must receive 0 SW notificationclick messages');
      assert.equal(v2Posted.length, 1, 'V2 tab must receive KTN_NOTIFICATION_CLICKED');
      assert.equal(v2Posted[0].type, 'KTN_NOTIFICATION_CLICKED');
    });

    it('[F02] T1-INFRA-F02-05: Redacted guidance examples save cleanly, customer web/thread is safe, and Worker errors leak zero secrets', async () => {
      const gRes = await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager });
      assertHttpStatus(gRes, 200);
      const cfg = gRes.json.config;

      const putOk = await world.staffReq('staff/guidance', {
        method: 'PUT',
        actor: STAFF_ACTORS.manager,
        json: {
          course_ids: cfg.course_ids,
          duration_presets: cfg.duration_presets,
          policy: cfg.policy,
          examples: [{ question: 'Email [email] SĐT [số điện thoại]?', answer: 'Xem cổng chính thức [liên kết].', hints: ['[email]'] }],
          bot_enabled: true,
          checkout_enabled: true
        }
      });
      assertHttpStatus(putOk, 200, 'PUT guidance with redacted markers');

      const started = await world.startWebChat();
      assertHttpStatus(started, 200);
      await world.sendWebMessage(started.token, 'MENU_ROOT');
      const threadRes = await world.request('/api/ktn/consultations/web/thread', { token: started.token });
      assertHttpStatus(threadRes, 200);
      assertSafeCustomerThreadResponse(threadRes.json);
      assertNoSecretLeaks(threadRes.json, { rootDir: ROOT_DIR });

      // Unauthorized / malformed error bodies must never leak secrets
      const unauthErr = await world.request('/api/ktn/consultations/staff/inbox');
      assertHttpStatus(unauthErr, [401, 403]);
      assertNoSecretLeaks(unauthErr.text, { rootDir: ROOT_DIR });
      const badZaloErr = await world.postZaloEvent({ bad: true }, { sign: false });
      assertHttpStatus(badZaloErr, 401);
      assertNoSecretLeaks(badZaloErr.text, { rootDir: ROOT_DIR });
    });
  });

  describe('F18 — Automated Test Readiness, Static Syntax, Typecheck, Bundle Budget & Burst Concurrency', () => {
    it('[F18] T1-INFRA-F18-01: node --check passes on all root worker modules, local-worker-middleware.mjs, and deploy scripts', () => {
      const targets = [
        'cloudflare-worker-sw-proxy.js',
        'consultation-worker.mjs',
        'consultation-zalo.mjs',
        'consultation-chatbot.mjs',
        'consultation-sepay.mjs',
        'consultation-retrieval.mjs',
        'consultation-examples.mjs',
        'consultation-examples-expanded.mjs',
        'consultation-page.mjs',
        'apps/ktn-web-v2/server/local-worker-middleware.mjs',
        'deploy_so_lien_lac_live.cjs',
        'deploy_ktn_react_v2_izteach.cjs'
      ];
      for (const rel of targets) {
        const abs = path.join(ROOT_DIR, rel);
        assert.ok(fs.existsSync(abs), `Missing module ${rel}`);
        execFileSync(process.execPath, ['--check', abs], { stdio: 'pipe' });
      }
    });

    it('[F18] T1-INFRA-F18-02: apps/ktn-web-v2 package.json defines typecheck/build/test:unit and npm run typecheck exits 0', () => {
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'package.json'), 'utf8'));
      assert.ok(pkg.scripts?.typecheck, 'Missing scripts.typecheck');
      assert.ok(pkg.scripts?.build, 'Missing scripts.build');
      assert.ok(pkg.scripts?.['test:unit'], 'Missing scripts.test:unit');
      assert.match(pkg.scripts['test:unit'], /vitest/i);

      const npmCmd = process.platform === 'win32' ? 'npm.cmd' : 'npm';
      execFileSync(npmCmd, ['--prefix', 'apps/ktn-web-v2', 'run', 'typecheck'], {
        cwd: ROOT_DIR,
        stdio: 'pipe',
        shell: process.platform === 'win32'
      });
    });

    it('[F18] T1-INFRA-F18-03: assertViteBundleBudget passes with every JS chunk <= 500 KiB', () => {
      // Build to an isolated temp outDir so parallel suites never race on apps/ktn-web-v2/dist
      const tmpOutDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-vite-t1-f18-'));
      try {
        const appDir = path.join(ROOT_DIR, 'apps', 'ktn-web-v2');
        const viteBin = path.join(appDir, 'node_modules', 'vite', 'bin', 'vite.js');
        execFileSync(process.execPath, [viteBin, 'build', '--outDir', tmpOutDir], {
          cwd: appDir,
          stdio: 'pipe'
        });
        const stats = assertViteBundleBudget(tmpOutDir, MAX_VITE_CHUNK_BYTES);
        assert.ok(stats.totalChunks >= 1);
        assert.ok(stats.maxChunkBytes <= MAX_VITE_CHUNK_BYTES);
      } finally {
        fs.rmSync(tmpOutDir, { recursive: true, force: true });
      }
    });

    it('[F18] T1-INFRA-F18-04: run_all_e2e.mjs registry, CLI aliases, and Vitest unit tests are wired on disk', () => {
      const tiers = new Set(SUITE_REGISTRY.map((e) => e.tier));
      for (const expectedTier of ['harness', '1', '2', '3', '4', 'static']) {
        assert.ok(tiers.has(expectedTier), `Missing tier ${expectedTier} in SUITE_REGISTRY`);
      }
      for (const existingId of ['harness', 'tier1-zalo', 'tier1-chatbot', 'tier1-sepay-crm', 'tier2-zalo', 'tier2-chatbot', 'tier2-sepay-crm']) {
        const entry = SUITE_REGISTRY.find((e) => e.id === existingId);
        assert.ok(entry && fs.existsSync(path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', entry.file)), `Missing suite file for ${existingId}`);
      }
      assert.deepEqual(parseCliArgs(['--tier', 'tier1,tier2', '--suite', 'safety']), {
        tiers: ['1', '2'],
        suites: ['safety'],
        jsonPath: null,
        noThresholds: false
      });

      const unitDir = path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'tests', 'unit');
      assert.ok(fs.existsSync(unitDir), 'Missing apps/ktn-web-v2/tests/unit');
      const unitFiles = fs.readdirSync(unitDir).filter((f) => /\.test\.(?:ts|tsx|js|mjs)$/.test(f));
      assert.ok(unitFiles.length >= 1, 'Expected at least 1 Vitest unit test file');
    });

    it('[F18] T1-INFRA-F18-05: Assertion helpers allow clean Vietnamese strings ("3. Để lại nhu cầu", "1 kèm 1") and enforce PII/VietQR invariants', () => {
      assertNoForbiddenAiText('3. Để lại nhu cầu & số điện thoại');
      assertNoForbiddenAiText('Lớp 1 kèm 1 cho bé sẽ được tư vấn viên hỗ trợ ạ.');
      assertPiiRedacted('Email [email] và SĐT [số điện thoại] và link [liên kết]');
      assertVietQrPayment(
        {
          qrUrl: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?amount=890000&addInfo=KTN%20ORD-100001',
          transferContent: 'KTN ORD-100001',
          amount: 890000,
          accountNo: '0987654321'
        },
        'ORD-100001',
        890000,
        '0987654321'
      );
    });

    it('[F18] T1-INFRA-F18-06: Burst concurrency load check (28 concurrent Web Chat, Zalo OA & SePay requests with zero errors or race corruption)', async () => {
      const world = await createTestWorld({ mode: 'sandbox' });
      try {
        const t0 = Date.now();

        // Pre-create 4 Web orders so SePay webhooks can process concurrently alongside Web Chat & Zalo OA bursts
        const orderIds = [];
        for (let i = 0; i < 4; i++) {
          const started = await world.startWebChat();
          assertHttpStatus(started, 200);
          const ordRes = await world.request('/api/ktn/consultations/web/order', {
            method: 'POST',
            token: started.token,
            json: {
              courseId: CATALOG_COURSES[0].course_id,
              name: `Burst Buyer ${i}`,
              email: `burst.buyer.${i}@example.test`,
              phone: `090123456${i}`,
              requestId: crypto.randomUUID()
            }
          });
          assertHttpStatus(ordRes, 200);
          orderIds.push(ordRes.json.id);
        }

        // 12 concurrent Web Chat starts + MENU_ROOT messages
        const webTasks = Array.from({ length: 12 }, async (_, i) => {
          const s = await world.startWebChat();
          assertHttpStatus(s, 200, `burst web/start ${i}`);
          const m = await world.sendWebMessage(s.token, 'MENU_ROOT', crypto.randomUUID());
          assertHttpStatus(m, 200, `burst web/message ${i}`);
          return s.token;
        });

        // 12 concurrent Zalo OA sandbox inbound events
        const zaloTasks = Array.from({ length: 12 }, (_, i) =>
          world.postZaloEvent(
            makeZaloTextEvent({
              msgId: `burst_z_${i}_${crypto.randomUUID().slice(0, 8)}`,
              userId: `zalo-burst-${i}`,
              text: 'Bé 7 tuổi muốn học giao tiếp'
            }),
            { sign: false, sandbox: true }
          )
        );

        // 4 concurrent SePay sandbox webhooks
        const sepayTasks = orderIds.map((orderId, i) =>
          world.postSepay(
            makeSepayWebhook({
              id: 880000 + i,
              orderCode: orderId,
              transferAmount: CATALOG_COURSES[0].price
            }),
            { path: '/api/ktn/consultations/sepay/sandbox' }
          )
        );

        const [webResults, zaloResults, sepayResults] = await Promise.all([
          Promise.all(webTasks),
          Promise.all(zaloTasks),
          Promise.all(sepayTasks)
        ]);

        assert.equal(webResults.length, 12);
        for (const zr of zaloResults) {
          assertHttpStatus(zr, 200, 'burst zalo');
          assert.equal(zr.json.ok, true);
          assert.equal(zr.json.duplicate, false);
        }
        for (const sr of sepayResults) {
          assertHttpStatus(sr, 201, 'burst sepay');
          assert.equal(sr.json.status, 'accepted');
        }

        // Verify zero duplicate/corrupted orders or missing Zalo consultations
        const zaloCount = await world.db.query(
          `SELECT count(*)::int AS cnt FROM public.ktn_consultations WHERE channel = 'zalo_oa' AND zalo_user_id LIKE 'zalo-burst-%'`
        );
        assert.equal(zaloCount.rows[0].cnt, 12);

        const paidCount = await world.db.query(
          `SELECT count(*)::int AS cnt FROM public.ktn_orders WHERE order_id = ANY($1::text[]) AND payment_status = 'paid'`,
          [orderIds]
        );
        assert.equal(paidCount.rows[0].cnt, 4);

        const elapsedMs = Date.now() - t0;
        assert.ok(elapsedMs < 30_000, `Burst concurrency (28+ concurrent requests) took too long: ${elapsedMs}ms`);
      } finally {
        await world.close();
      }
    });
  });
});
