import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
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
  assertV1Isolation,
  assertViteBundleBudget
} from '../harness/assertions.mjs';
import {
  GUARDRAIL_CORPUS,
  MAX_VITE_CHUNK_BYTES,
  PROTECTED_V1_PAGE_ID,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS
} from '../harness/fixtures.mjs';
import {
  ROOT_DIR,
  createSupabasePgliteHarness
} from '../harness/pglite-supabase.mjs';
import { createTestWorld, loadWorkerInstance } from '../harness/worker-client.mjs';
import { SUITE_REGISTRY, parseCliArgs } from '../run_all_e2e.mjs';

const RUNNER_PATH = path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', 'run_all_e2e.mjs');
const LIVE_SUPABASE_PROJECT_REF = 'lcwprikrn' + 'hpvpkkpqmmj';

function scanDestructiveDdl(sqlText) {
  const forbidden = [];
  const patterns = [
    /\bDROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(?:ktn_orders|ktn_students|ktn_courses|ktn_classes|ktn_teachers|ktn_consultations)\b/i,
    /\bTRUNCATE\s+(?:TABLE\s+)?(?:public\.)?(?:ktn_orders|ktn_students|ktn_courses|ktn_classes|ktn_teachers|ktn_consultations)\b/i,
    /\bALTER\s+TABLE\s+(?:IF\s+EXISTS\s+)?(?:public\.)?(?:ktn_orders|ktn_students|ktn_courses|ktn_classes|ktn_teachers|ktn_consultations)\b[^;]*\bDROP\s+COLUMN\b/i
  ];
  for (const re of patterns) {
    const m = sqlText.match(re);
    if (m) forbidden.push(m[0]);
  }
  return forbidden;
}

function listAllFilesRecursive(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.git' || entry.name === '.artifacts') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listAllFilesRecursive(full));
    else if (entry.isFile()) out.push(full);
  }
  return out;
}

describe('Tier 2 — Infra, Migrations, V1/Secrets & Runner Negative/Boundary Suite (F01, F02, F18)', () => {
  describe('F01 — Migration & DB Boundary Guards', () => {
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

    it('[F01] T2-INFRA-F01-01: Negative FK violation on ktn_consultations.student_code (23503), RPC student_not_found, and Worker 404', async () => {
      const convRes = await world.db.query(
        `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, owner_email)
         VALUES ('zalo_oa', 'zalo-neg-fk', 'zalo-neg-fk', 'open', $1) RETURNING id`,
        [STAFF_ACTORS.advisors[0].email]
      );
      const convId = convRes.rows[0].id;

      await assert.rejects(
        () =>
          world.db.query(
            `UPDATE public.ktn_consultations SET student_code = 'KTN-DOES-NOT-EXIST' WHERE id = $1`,
            [convId]
          ),
        (err) => err?.code === '23503' || /foreign key constraint/i.test(err?.message || '')
      );

      const rpcRes = await world.pgliteSupabase.fetch(
        `${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_link_student`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            p_consultation_id: convId,
            p_student_code: 'KTN-DOES-NOT-EXIST',
            p_actor: STAFF_ACTORS.manager.email
          })
        }
      );
      assert.equal(rpcRes.status, 200);
      const rpcJson = await rpcRes.json();
      assert.equal(rpcJson.ok, false);
      assert.equal(rpcJson.error, 'student_not_found');

      const httpRes = await world.staffReq(`staff/thread/${convId}/link_student`, {
        method: 'POST',
        actor: STAFF_ACTORS.manager,
        json: { student_code: 'KTN-DOES-NOT-EXIST' }
      });
      assertHttpStatus(httpRes, 404, 'link_student non-existent code');
    });

    it('[F01] T2-INFRA-F01-02: Duplicate PK rejection (23505) on ktn_zalo_oa_events, ktn_sepay_reconciliation_logs, ktn_consultation_payments & clean RPC dedup', async () => {
      await world.db.query(
        `INSERT INTO public.ktn_zalo_oa_events (event_id, event_name, zalo_user_id, status)
         VALUES ('evt-dup-1', 'user_send_text', 'z-dup-1', 'processed')`
      );
      await assert.rejects(
        () =>
          world.db.query(
            `INSERT INTO public.ktn_zalo_oa_events (event_id, event_name, zalo_user_id, status)
             VALUES ('evt-dup-1', 'user_send_text', 'z-dup-1', 'processed')`
          ),
        (err) => err?.code === '23505' || /duplicate key/i.test(err?.message || '')
      );

      await world.db.query(
        `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, kind, amount)
         VALUES ('tx-dup-log-1', 'unmatched', 500000)`
      );
      await assert.rejects(
        () =>
          world.db.query(
            `INSERT INTO public.ktn_sepay_reconciliation_logs (transaction_id, kind, amount)
             VALUES ('tx-dup-log-1', 'unmatched', 500000)`
          ),
        (err) => err?.code === '23505' || /duplicate key/i.test(err?.message || '')
      );

      await world.db.query(
        `INSERT INTO public.ktn_orders (order_id, student_name, student_email, phone, amount)
         VALUES ('ORD-991001', 'Dup Pay', 'dup.pay@example.test', '0901234567', 890000)`
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status)
         VALUES ('sepay:dup-pk-1', 'ORD-991001', 890000, 'accepted')`
      );
      await assert.rejects(
        () =>
          world.db.query(
            `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status)
             VALUES ('sepay:dup-pk-1', 'ORD-991001', 890000, 'accepted')`
          ),
        (err) => err?.code === '23505' || /duplicate key/i.test(err?.message || '')
      );

      // ktn_consultation_upsert_zalo_inbound cleanly returns duplicate: true on repeated event_id
      const rpcUrl = `${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_upsert_zalo_inbound`;
      const payload = {
        p_event_id: 'evt-rpc-dedup-01',
        p_event_name: 'user_send_text',
        p_zalo_user_id: 'z-rpc-dedup-01',
        p_payload: { body: 'Xin chào' }
      };
      const first = await (await world.pgliteSupabase.fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })).json();
      assert.equal(first.duplicate, false);

      const second = await (await world.pgliteSupabase.fetch(rpcUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })).json();
      assert.equal(second.ok, true);
      assert.equal(second.duplicate, true);
    });

    it('[F01] T2-INFRA-F01-03: Destructive DDL scanner confirms zero DROP TABLE/TRUNCATE/DROP COLUMN in migrations and catches synthetic violations', () => {
      const migrationFiles = [
        'supabase/migrations/20261114_ktn_consultations.sql',
        'supabase/migrations/20261115_ktn_consultation_example_capacity.sql',
        'supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql'
      ];
      for (const rel of migrationFiles) {
        const sql = fs.readFileSync(path.join(ROOT_DIR, rel), 'utf8');
        assert.deepEqual(scanDestructiveDdl(sql), [], `Destructive DDL found in ${rel}`);
      }

      // Negative probe: scanner must flag synthetic destructive DDL
      assert.ok(scanDestructiveDdl('DROP TABLE public.ktn_orders;').length > 0);
      assert.ok(scanDestructiveDdl('TRUNCATE public.ktn_students;').length > 0);
      assert.ok(scanDestructiveDdl('ALTER TABLE public.ktn_consultations DROP COLUMN channel;').length > 0);
    });

    it('[F01] T2-INFRA-F01-04: Offline harness blocks live Supabase URL and repo test/migration/env files never reference live project ref', async () => {
      await assert.rejects(
        () => world.pgliteSupabase.fetch(`https://${LIVE_SUPABASE_PROJECT_REF}.supabase.co/rest/v1/ktn_orders`),
        /Blocked unexpected outbound network call/
      );

      const dirsToScan = [
        ...listAllFilesRecursive(path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm')),
        ...listAllFilesRecursive(path.join(ROOT_DIR, 'supabase', 'migrations')),
        path.join(ROOT_DIR, '.env.example')
      ];
      for (const filePath of dirsToScan) {
        const text = fs.readFileSync(filePath, 'utf8');
        assert.equal(
          text.includes(LIVE_SUPABASE_PROJECT_REF),
          false,
          `Unexpected live Supabase ref in ${path.relative(ROOT_DIR, filePath)}`
        );
      }
    });

    it('[F01] T2-INFRA-F01-05: RLS & privilege boundary denies anon and authenticated roles (42501) on protected tables, views & RPCs', async () => {
      for (const role of ['anon', 'authenticated']) {
        for (const table of ['ktn_zalo_oa_events', 'ktn_sepay_reconciliation_logs', 'ktn_consultation_inbox']) {
          await world.db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
          let denied = false;
          try {
            await world.db.query(`SELECT * FROM public.${table} LIMIT 1`);
          } catch (err) {
            denied = err?.code === '42501' || /permission denied|insufficient_privilege/i.test(err?.message || '');
          } finally {
            await world.db.exec('ROLLBACK;');
          }
          assert.equal(denied, true, `Expected role ${role} to be denied on ${table}`);
        }

        for (const rpcCall of [
          `SELECT public.ktn_consultation_upsert_zalo_inbound('e1', 'user_send_text', 'u1', '{}'::jsonb)`,
          `SELECT public.ktn_consultation_link_student('00000000-0000-0000-0000-000000000000'::uuid, 'KTN-2026-089', 'x@y.com')`
        ]) {
          await world.db.exec(`BEGIN; SET LOCAL ROLE ${role};`);
          let denied = false;
          try {
            await world.db.query(rpcCall);
          } catch (err) {
            denied = err?.code === '42501' || /permission denied|insufficient_privilege/i.test(err?.message || '');
          } finally {
            await world.db.exec('ROLLBACK;');
          }
          assert.equal(denied, true, `Expected role ${role} to be denied on ${rpcCall}`);
        }
      }
    });
  });

  describe('F02 — V1 Isolation, N27/N28b & PII/Secret Negative Guards', () => {
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

    it('[F02] T2-INFRA-F02-01: Rejects unredacted PII in PUT staff/guidance (question/answer/hints) and assertPiiRedacted throws on corpus', async () => {
      for (const piiCase of GUARDRAIL_CORPUS.piiInputs) {
        assert.throws(() => assertPiiRedacted(piiCase.raw, piiCase.secrets));
      }

      const gRes = await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager });
      const cfg = gRes.json.config;

      const badPayloads = [
        { question: 'Gửi về leak@example.test nhé?', answer: 'Dạ ok', hints: [] },
        { question: 'Hỏi học phí', answer: 'Gọi 0909 123 456 ngay', hints: [] },
        { question: 'Hỏi link', answer: 'Đăng ký chuẩn', hints: ['https://evil.example.test/x'] }
      ];
      for (const ex of badPayloads) {
        const res = await world.staffReq('staff/guidance', {
          method: 'PUT',
          actor: STAFF_ACTORS.manager,
          json: {
            course_ids: cfg.course_ids,
            duration_presets: cfg.duration_presets,
            policy: cfg.policy,
            examples: [ex],
            bot_enabled: true,
            checkout_enabled: true
          }
        });
        assertHttpStatus(res, 400, `unredacted PII rejected: ${JSON.stringify(ex)}`);
      }
    });

    it('[F02] T2-INFRA-F02-02: N27 negative check & Worker V1 pass-through never injects rel="manifest" on /custom-page/so-lien-lac', async () => {
      assert.throws(
        () =>
          assertV1Isolation({
            rootDir: ROOT_DIR,
            baseRef: 'feat/ktn-react-ui-v2',
            v1Html: '<html><head><link rel="manifest" href="/manifest.json"></head></html>',
            checkSwParity: false
          }),
        /MUST NOT contain rel="manifest"/
      );
      assert.throws(
        () =>
          assertV1Isolation({
            rootDir: ROOT_DIR,
            baseRef: 'feat/ktn-react-ui-v2',
            v2Html: '<html><head><title>V2</title></head></html>',
            checkSwParity: false
          }),
        /must include <link rel="manifest"/
      );

      const worker = loadWorkerInstance({
        fetchImpl: async (input) => {
          const u = new URL(typeof input === 'string' ? input : input.url);
          if (u.pathname.startsWith('/custom-page/so-lien-lac')) {
            return new Response('<html><head><title>Origin SLL</title></head><body>OK</body></html>', {
              status: 200,
              headers: { 'Content-Type': 'text/html; charset=utf-8' }
            });
          }
          return new Response(JSON.stringify({ ok: true }), { status: 200 });
        }
      });
      const ctx = { waitUntil() {}, passThroughOnException() {} };
      const v1Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac'), world.env, ctx);
      const v1Html = await v1Res.text();
      assert.equal(v1Html.includes('rel="manifest"'), false);
    });

    it('[F02] T2-INFRA-F02-03: N28b V1-only notificationclick never hijacks V1 client, and 1-byte SW divergence throws', async () => {
      const swSrc = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'), 'utf8');
      const listeners = {};
      let v1Navigated = false;
      let v1Posted = 0;
      let openedUrl = null;
      const sandbox = {
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
              {
                url: 'https://khongtunhi.com/custom-page/so-lien-lac',
                navigate: async () => { v1Navigated = true; return null; },
                postMessage: () => { v1Posted += 1; },
                focus: async () => {}
              }
            ],
            openWindow: async (u) => { openedUrl = u; }
          }
        }
      };
      vm.runInNewContext(swSrc, sandbox, { filename: 'sw-v1-only.js' });
      let clickWait = Promise.resolve();
      listeners.notificationclick({
        notification: { close: () => {}, data: { eventType: 'homework_graded', classCode: 'CLS-A' } },
        waitUntil: (p) => { clickWait = p; }
      });
      await clickWait;
      assert.equal(v1Navigated, false);
      assert.equal(v1Posted, 0);
      assert.equal(openedUrl, '/custom-page/so-lien-lac-test#/classrooms?class=CLS-A');

      // 1-byte SW divergence in temp dir causes assertV1Isolation to throw
      const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-sw-div-'));
      try {
        fs.mkdirSync(path.join(tmpDir, 'apps', 'ktn-web-v2', 'public'), { recursive: true });
        fs.writeFileSync(path.join(tmpDir, 'sw.js'), swSrc, 'utf8');
        fs.writeFileSync(path.join(tmpDir, 'apps', 'ktn-web-v2', 'public', 'sw.js'), swSrc + ' ', 'utf8');
        assert.throws(
          () => assertV1Isolation({ rootDir: tmpDir, checkSwParity: true }),
          /must stay byte-identical/
        );
      } finally {
        fs.rmSync(tmpDir, { recursive: true, force: true });
      }
    });

    it('[F02] T2-INFRA-F02-04: Synthetic secret-leak detector catches all secret patterns and .env secrets without echoing values', () => {
      const patterns = [
        'AIzaSyDummyGoogleKey12345678901234567890',
        're_1234567890abcdef123456',
        'sb_secret_abcdef1234567890',
        'sk-1234567890abcdefghijklmnop',
        'EAA1234567890abcdefghijklmnop',
        '-----BEGIN PRIVATE KEY-----\nABC\n-----END PRIVATE KEY-----',
        'KTN_ZALO_APP_SECRET=my_super_secret_value_123'
      ];
      for (const sample of patterns) {
        let err = null;
        try {
          assertNoSecretLeaks(sample, { checkDotEnv: false });
        } catch (e) {
          err = e;
        }
        assert.ok(err, `Expected secret pattern detection for ${sample.slice(0, 12)}`);
        assert.equal(err.message.includes(sample), false, 'Error message must not echo raw secret value');
      }

      const tmpEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-t2-env-'));
      try {
        const synthVal = 'SyntheticDotEnvSecretValue999';
        fs.writeFileSync(path.join(tmpEnvDir, '.env'), `KTN_ZALO_APP_SECRET=${synthVal}\n`, 'utf8');
        let err = null;
        try {
          assertNoSecretLeaks({ leaked: synthVal }, { rootDir: tmpEnvDir });
        } catch (e) {
          err = e;
        }
        assert.ok(err, 'Expected .env secret leak detection');
        assert.match(err.message, /\[KTN_ZALO_APP_SECRET\]/);
        assert.equal(err.message.includes(synthVal), false);
      } finally {
        fs.rmSync(tmpEnvDir, { recursive: true, force: true });
      }

      const trackedDotEnv = execFileSync('git', ['-C', ROOT_DIR, 'ls-files', '.env'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe']
      }).trim();
      assert.equal(trackedDotEnv, '');
    });

    it('[F02] T2-INFRA-F02-05: Negative assertV1Isolation catches dirty, committed, and git-mv renamed V1 files or missing PROTECTED_V1_PAGE_ID', () => {
      const tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-t2-v1-'));
      try {
        const git = (...args) => execFileSync('git', ['-C', tmpGitDir, ...args], {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe']
        });
        git('init');
        git('config', 'user.email', 't2@khongtunhi.test');
        git('config', 'user.name', 'T2');
        fs.mkdirSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'public'), { recursive: true });
        fs.writeFileSync(path.join(tmpGitDir, 'sw.js'), '// sw\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'public', 'sw.js'), '// sw\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'deploy_so_lien_lac_live.cjs'), '// v1 deploy\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'so-lien-lac.html'), '<html>v1</html>\n', 'utf8');
        fs.writeFileSync(
          path.join(tmpGitDir, 'deploy_ktn_react_v2_izteach.cjs'),
          `const PROTECTED = '${PROTECTED_V1_PAGE_ID}';\n`,
          'utf8'
        );
        git('add', '.');
        git('commit', '-m', 'init');
        git('branch', '-M', 'feat/ktn-react-ui-v2');
        git('checkout', '-b', 'feat/test-branch');

        assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' });

        // (a) Dirty V1 file throws
        fs.writeFileSync(path.join(tmpGitDir, 'deploy_so_lien_lac_live.cjs'), '// edited\n', 'utf8');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));

        // (b) Committed V1 file throws
        git('add', 'deploy_so_lien_lac_live.cjs');
        git('commit', '-m', 'edit v1');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));

        // (c) git mv rename of V1 file still throws (--no-renames)
        git('mv', 'so-lien-lac.html', 'renamed.html');
        git('commit', '-m', 'rename v1');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));

        // (d) Removing PROTECTED_V1_PAGE_ID from deploy_ktn_react_v2_izteach.cjs throws
        fs.writeFileSync(path.join(tmpGitDir, 'deploy_ktn_react_v2_izteach.cjs'), 'const PROTECTED = "other";\n', 'utf8');
        assert.throws(
          () => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }),
          new RegExp(PROTECTED_V1_PAGE_ID)
        );
      } finally {
        fs.rmSync(tmpGitDir, { recursive: true, force: true });
      }
    });
  });

  describe('F18 — Bundle Cap, Runner Thresholds, CLI & Guardrail Negative Guards', () => {
    it('[F18] T2-INFRA-F18-01: assertViteBundleBudget fails on >500 KiB chunk and on missing dist/assets', () => {
      const tmpDist = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-vite-budget-'));
      try {
        assert.throws(() => assertViteBundleBudget(tmpDist), /No built JS chunks found/);

        const assetsDir = path.join(tmpDist, 'assets');
        fs.mkdirSync(assetsDir, { recursive: true });
        fs.writeFileSync(path.join(assetsDir, 'oversized.js'), Buffer.alloc(MAX_VITE_CHUNK_BYTES + 1, 65));
        assert.throws(
          () => assertViteBundleBudget(tmpDist, MAX_VITE_CHUNK_BYTES),
          /limit 512000 bytes/
        );
      } finally {
        fs.rmSync(tmpDist, { recursive: true, force: true });
      }
    });

    it('[F18] T2-INFRA-F18-02: run_all_e2e.mjs fails thresholds when counts <210, rejects skipped tests, honors --no-thresholds, and fails on failing stub', () => {
      const tmpRunnerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-runner-thresh-'));
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      try {
        fs.copyFileSync(RUNNER_PATH, path.join(tmpRunnerDir, 'run_all_e2e.mjs'));
        for (const entry of SUITE_REGISTRY) {
          if (entry.tier === 'harness') continue;
          const dest = path.join(tmpRunnerDir, entry.file);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.writeFileSync(
            dest,
            `import { it } from 'node:test';\nit('stub ${entry.id}', () => {});\n`,
            'utf8'
          );
        }

        const reportFile = path.join(tmpRunnerDir, 'report.json');
        const failRes = spawnSync(process.execPath, ['run_all_e2e.mjs', '--json', reportFile], {
          cwd: tmpRunnerDir,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(failRes.status, 1, 'Runner must exit 1 when counts are below FULL_THRESHOLDS');
        const report = JSON.parse(fs.readFileSync(reportFile, 'utf8'));
        assert.equal(report.thresholdsMet, false);
        assert.equal(report.thresholdsChecked, true);
        assert.ok(report.thresholdErrors.some((e) => e.includes('Tier 1')));
        assert.ok(report.thresholdErrors.some((e) => e.includes('Tier 2')));
        assert.ok(report.thresholdErrors.some((e) => e.includes('Tier 3')));
        assert.ok(report.thresholdErrors.some((e) => e.includes('Tier 4')));
        assert.ok(report.thresholdErrors.some((e) => e.includes('minimum 210')));

        // --no-thresholds with all stubs passing -> exits 0
        const noThreshRes = spawnSync(process.execPath, ['run_all_e2e.mjs', '--no-thresholds'], {
          cwd: tmpRunnerDir,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(noThreshRes.status, 0, `Expected exit 0 with --no-thresholds, got ${noThreshRes.status}: ${noThreshRes.stderr}`);

        // Skipped stub -> exits 1 with threshold error mentioning 'skipped'
        const skippedFile = path.join(tmpRunnerDir, 'suites', 'tier1_chatbot.test.mjs');
        const origSkippedFile = fs.readFileSync(skippedFile, 'utf8');
        const skipReportFile = path.join(tmpRunnerDir, 'report-skip.json');
        fs.writeFileSync(
          skippedFile,
          `import { it } from 'node:test';\nit('skipped stub', { skip: true }, () => {});\n`,
          'utf8'
        );
        const skipRes = spawnSync(process.execPath, ['run_all_e2e.mjs', '--json', skipReportFile], {
          cwd: tmpRunnerDir,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(skipRes.status, 1, 'Runner must exit 1 when any test is skipped in full threshold run');
        const skipReport = JSON.parse(fs.readFileSync(skipReportFile, 'utf8'));
        assert.equal(skipReport.thresholdsMet, false);
        assert.ok(skipReport.summary.skipped >= 1, 'Expected skipped count >= 1');
        assert.ok(
          skipReport.thresholdErrors.some((e) => e.includes('skipped')),
          `Expected thresholdErrors to mention 'skipped', got: ${JSON.stringify(skipReport.thresholdErrors)}`
        );
        fs.writeFileSync(skippedFile, origSkippedFile, 'utf8');

        // 1 failing stub -> exits 1 even with --no-thresholds
        const failingFile = path.join(tmpRunnerDir, 'suites', 'tier1_zalo.test.mjs');
        fs.writeFileSync(
          failingFile,
          `import { it } from 'node:test';\nit('failing stub', () => { throw new Error('boom'); });\n`,
          'utf8'
        );
        const failStubRes = spawnSync(process.execPath, ['run_all_e2e.mjs', '--no-thresholds'], {
          cwd: tmpRunnerDir,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(failStubRes.status, 1);
      } finally {
        fs.rmSync(tmpRunnerDir, { recursive: true, force: true });
      }
    });

    it('[F18] T2-INFRA-F18-03: run_all_e2e.mjs rejects invalid CLI arguments, empty values, unknown tiers, and unknown suites', () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      for (const badArgv of [
        ['--tier'],
        ['--suite'],
        ['--json'],
        ['--tier='],
        ['--suite='],
        ['--json='],
        ['--unknown-flag'],
        ['--tier', '99'],
        ['--suite', 'nonexistent']
      ]) {
        assert.throws(() => parseCliArgs(badArgv), `parseCliArgs should reject ${badArgv.join(' ')}`);
        const res = spawnSync(process.execPath, [RUNNER_PATH, ...badArgv], {
          cwd: ROOT_DIR,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(res.status, 1, `Runner should exit 1 for ${badArgv.join(' ')}`);
      }
    });

    it('[F18] T2-INFRA-F18-04: assertNoForbiddenAiText rejects all forbidden prices, discounts, URLs & unverified adult claims while allowing clean VN phrases', () => {
      for (const bad of [
        ...GUARDRAIL_CORPUS.forbiddenAiOutputs,
        'Học phí ưu đãi 500k thôi ạ',
        'Chỉ 890.000 đ trọn khóa',
        'Giảm 20% học phí khi chuyển ngay',
        'Đăng ký tại www.fake-ktn.example',
        '2 triệu/tháng cho lớp 1:1',
        '500 nghìn đồng',
        'Cam kết 80% thực hành',
        'Đảm bảo đầu ra sau 8 buổi',
        'Rút ngắn một nửa thời gian học'
      ]) {
        assert.throws(() => assertNoForbiddenAiText(bad), `Expected rejection for: ${bad}`);
      }
      assertNoForbiddenAiText('3. Để lại nhu cầu & số điện thoại');
      assertNoForbiddenAiText('1 kèm 1 cho bé 8 tuổi');
    });

    it('[F18] T2-INFRA-F18-05: run_all_e2e.mjs fails closed on empty filter intersection and missing suite files', () => {
      const cleanEnv = { ...process.env };
      delete cleanEnv.NODE_TEST_CONTEXT;
      const emptyFilterRes = spawnSync(process.execPath, [RUNNER_PATH, '--tier', '1', '--suite', 'scenarios'], {
        cwd: ROOT_DIR,
        env: cleanEnv,
        encoding: 'utf8'
      });
      assert.equal(emptyFilterRes.status, 1);
      assert.match(emptyFilterRes.stderr || '', /No test suites matched filters/);

      const tmpMissingDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-runner-missing-'));
      try {
        fs.copyFileSync(RUNNER_PATH, path.join(tmpMissingDir, 'run_all_e2e.mjs'));
        const missingRes = spawnSync(process.execPath, ['run_all_e2e.mjs', '--tier', '1', '--suite', 'zalo'], {
          cwd: tmpMissingDir,
          env: cleanEnv,
          encoding: 'utf8'
        });
        assert.equal(missingRes.status, 1);
        assert.match(missingRes.stderr || '', /Missing suite file\(s\)/);
      } finally {
        fs.rmSync(tmpMissingDir, { recursive: true, force: true });
      }
    });
  });
});
