import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoForbiddenAiText,
  assertNoSecretLeaks,
  assertPiiRedacted,
  assertSafeCustomerThreadResponse,
  assertSafeStaffThreadResponse,
  assertV1Isolation,
  assertVietQrPayment,
  assertZeroHorizontalOverflow
} from './assertions.mjs';
import { parseCliArgs } from '../run_all_e2e.mjs';
import {
  startBrowserHarness,
  loginViaQuickButton,
  seedAuthSession
} from './browser-harness.mjs';
import {
  ADULT_1_1_FIXTURES,
  CA_TRANSCRIPTS,
  CATALOG_COURSES,
  GUARDRAIL_CORPUS,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS,
  makeGeminiSuccessResponse,
  makeSepayWebhook,
  makeZaloTextEvent
} from './fixtures.mjs';
import {
  CORE_MIGRATION_FILES,
  ROOT_DIR,
  createSupabasePgliteHarness,
  loadMigrations
} from './pglite-supabase.mjs';
import {
  createTestWorld,
  metaSign,
  mintKtnSession,
  mintSupabaseJwt,
  mintWebTicket,
  sepayHeaders,
  zaloSign
} from './worker-client.mjs';

describe('E2E-M1 Harness Smoke Suite', () => {
  describe('(a) PGlite 5-file migration, idempotent 20261119 re-run, and anon RLS denial', () => {
    let pg;

    before(async () => {
      pg = await createSupabasePgliteHarness();
    });

    after(async () => {
      await pg?.close();
    });

    it('loads all 5 SQL files cleanly and re-runs 20261119 idempotently', async () => {
      const reapplied = await loadMigrations(pg.db, [CORE_MIGRATION_FILES[4]]);
      assert.deepEqual(reapplied, ['supabase/migrations/20261119_ktn_zalo_oa_crm_sepay.sql']);

      const coursesRes = await pg.db.query('SELECT count(*)::int AS cnt FROM public.ktn_courses');
      assert.equal(coursesRes.rows[0].cnt, 11);

      const advisorsRes = await pg.db.query('SELECT count(*)::int AS cnt FROM public.ktn_advisors');
      assert.ok(advisorsRes.rows[0].cnt >= 4);
    });

    it('denies anon role access to protected consultation/Zalo/SePay tables via RLS', async () => {
      const protectedTables = [
        'ktn_zalo_oa_events',
        'ktn_sepay_reconciliation_logs',
        'ktn_consultations',
        'ktn_consultation_payments'
      ];
      for (const table of protectedTables) {
        await pg.db.exec('BEGIN; SET LOCAL ROLE anon;');
        let denied = false;
        try {
          await pg.db.query(`SELECT * FROM public.${table} LIMIT 1`);
        } catch (err) {
          denied = /permission denied|insufficient_privilege/i.test(err?.message || '');
        } finally {
          await pg.db.exec('ROLLBACK;');
        }
        assert.equal(denied, true, `Expected anon SELECT on ${table} to be denied`);
      }
    });
  });

  describe('(b) PostgREST, embedded joins, RPC, Worker HTTP bridge, auth helpers & mocks', () => {
    let world;

    before(async () => {
      world = await createTestWorld({ mode: 'live-auth' });
    });

    after(async () => {
      await world?.close();
    });

    it('handles PostgREST CRUD, 409 unique conflict, 400 PGRST204, 406 single-object, !inner & nested joins, and RPCs', async () => {
      const supabaseBase = world.env.SUPABASE_URL;

      // 1. Unknown column -> 400 PGRST204
      const badColRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'bad@khongtunhi.com', name: 'Bad', nonexistent_col: 1 })
      });
      assert.equal(badColRes.status, 400);
      assert.equal((await badColRes.json()).code, 'PGRST204');

      // 2. Duplicate insert without resolution -> 409 { code: '23505' }
      const dupRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: STAFF_ACTORS.advisors[0].email, name: 'Dup' })
      });
      assert.equal(dupRes.status, 409);
      assert.equal((await dupRes.json()).code, '23505');

      // 3. Accept single object -> 406 when multiple rows
      const multiSingleRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_courses`, {
        headers: { Accept: 'application/vnd.pgrst.object+json' }
      });
      assert.equal(multiSingleRes.status, 406);

      // 4. RPC ktn_consultation_upsert_zalo_inbound + dedup
      const rpc1 = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/rpc/ktn_consultation_upsert_zalo_inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_event_id: 'zevt_smoke_001',
          p_event_name: 'user_send_text',
          p_zalo_user_id: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
          p_payload: {
            body: 'Bé 7 tuổi muốn học tiếng Trung',
            customer_name: LEARNERS_AND_PARENTS.parentMinh.name,
            customer_phone: LEARNERS_AND_PARENTS.parentMinh.phone
          }
        })
      });
      assert.equal(rpc1.status, 200);
      const rpc1Json = await rpc1.json();
      assert.equal(rpc1Json.ok, true);
      assert.equal(rpc1Json.duplicate, false);
      const convId = rpc1Json.conversation.id;

      // 5. Embedded !inner join + dotted filter
      const flagInsert = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_consultation_flags`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({
          message_id: rpc1Json.message.id,
          consultation_id: convId,
          category: 'fit',
          reason: 'Smoke test flag',
          excerpt: 'Bé 7 tuổi',
          status: 'confirmed',
          reviewed_at: new Date().toISOString()
        })
      });
      assert.equal(flagInsert.status, 201);

      const joinRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_flags?select=message_id,consultation_id,ktn_consultations!inner(channel),ktn_consultation_messages!inner(actor_email)&ktn_consultations.channel=eq.zalo_oa&ktn_consultation_messages.actor_email=is.null`
      );
      assert.equal(joinRes.status, 200);
      const joinedRows = await joinRes.json();
      assert.equal(joinedRows.length, 1);
      assert.equal(joinedRows[0].ktn_consultations.channel, 'zalo_oa');

      // 6. Nested join: ktn_consultation_orders -> ktn_orders -> ktn_consultation_payments
      const orderRpc = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/rpc/ktn_consultation_create_order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_id: convId,
          p_request_id: '11111111-1111-4111-8111-111111111111',
          p_qr_base: 'https://img.vietqr.io/image/MB-0987654321-compact2.png?addInfo=KTN%20ORDER_CODE',
          p_order: {
            student_name: LEARNERS_AND_PARENTS.parentMinh.name,
            student_email: LEARNERS_AND_PARENTS.parentMinh.email,
            phone: LEARNERS_AND_PARENTS.parentMinh.phone,
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
        })
      });
      assert.equal(orderRpc.status, 200);
      const orderObj = await orderRpc.json();

      const nestedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?consultation_id=eq.${convId}&select=order_id,ktn_orders(course_name,amount,payment_status,ktn_consultation_payments(transaction_id,amount,status))`
      );
      assert.equal(nestedRes.status, 200);
      const nestedRows = await nestedRes.json();
      assert.equal(nestedRows.length, 1);
      assert.equal(nestedRows[0].order_id, orderObj.order_id);
      assert.equal(nestedRows[0].ktn_orders.amount, CATALOG_COURSES[0].price);
      assert.deepEqual(nestedRows[0].ktn_orders.ktn_consultation_payments, []);
    });

    it('routes Worker HTTP bridge (web/catalog, web/start -> web/thread, staff/inbox) and signs auth tokens', async () => {
      const catRes = await world.request('/api/ktn/consultations/web/catalog');
      assertHttpStatus(catRes, 200, 'web/catalog');
      assert.equal(catRes.json.courses.length, 10);
      assert.equal(catRes.json.checkoutEnabled, true);

      const startRes = await world.startWebChat();
      assertHttpStatus(startRes, 200, 'web/start');
      assert.ok(startRes.token, 'web/start must return web ticket');

      // Send customer message -> Gemini mock answers via AsyncLocalStorage global fetch
      world.mocks.setFaults({
        geminiResponse: {
          reply: 'Bé nhà chị thích học nghe nói hay nhận mặt chữ ạ?',
          course_id: '',
          handoff: false
        }
      });
      const msgRes = await world.sendWebMessage(startRes.token, 'Bé nhà chị 7 tuổi chưa biết gì.');
      assertHttpStatus(msgRes, 200, 'web/message');
      assert.equal(world.mocks.upstreamCalls.gemini.length >= 1, true);

      const threadRes = await world.request('/api/ktn/consultations/web/thread', {
        token: startRes.token
      });
      assertHttpStatus(threadRes, 200, 'web/thread');
      assert.equal(threadRes.json.messages.length, 2);
      assertSafeCustomerThreadResponse(threadRes.json);
      assertNoForbiddenAiText(threadRes.json.messages[1].body);

      // Staff inbox via KTN session & Supabase JWT
      const mgrInbox = await world.staffReq('staff/inbox', { actor: STAFF_ACTORS.manager });
      assertHttpStatus(mgrInbox, 200, 'manager staff/inbox');
      assert.ok(Array.isArray(mgrInbox.json.conversations));

      const advInbox = await world.staffReq('staff/inbox', {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt'
      });
      assertHttpStatus(advInbox, 200, 'advisor staff/inbox via Supabase JWT');

      // Standalone signing helpers
      const zSig = zaloSign('app1', '{"a":1}', '1700000000', 'sec1');
      assert.match(zSig, /^[a-f0-9]{64}$/);
      const mSig = metaSign('{"entry":[]}', 'sec2');
      assert.match(mSig, /^sha256=[a-f0-9]{64}$/);
      assert.equal(sepayHeaders('k1').Authorization, 'Apikey k1');
      assert.equal(mintWebTicket({}).split('.').length, 4);
      assert.equal(mintKtnSession({ email: STAFF_ACTORS.manager.email, role: 'admin' }).split('.').length, 2);
      assert.equal(mintSupabaseJwt({ email: STAFF_ACTORS.advisors[0].email }).split('.').length, 3);
    });

    it('supports standalone mintSupabaseJwt, Zalo OAuth form-urlencoded, heterogeneous batch upsert, and world.reset() student retention', async () => {
      const supabaseBase = world.env.SUPABASE_URL;

      // 1. Standalone mintSupabaseJwt (valid vs expired) on staff/profile
      const validJwt = mintSupabaseJwt({ email: STAFF_ACTORS.advisors[0].email });
      const profileOk = await world.request('/api/ktn/consultations/staff/profile', { token: validJwt });
      assertHttpStatus(profileOk, 200, 'standalone mintSupabaseJwt staff/profile');
      assert.equal(profileOk.json.actor.email, STAFF_ACTORS.advisors[0].email);

      const expiredJwt = mintSupabaseJwt({
        email: STAFF_ACTORS.advisors[0].email,
        exp: Math.floor(Date.now() / 1000) - 60
      });
      const profileExp = await world.request('/api/ktn/consultations/staff/profile', { token: expiredJwt });
      assertHttpStatus(profileExp, 401, 'expired mintSupabaseJwt staff/profile');

      // 2. Zalo OA v4 OAuth form-urlencoded mock returns 200 JSON (both string & URLSearchParams body)
      const oauthRes = await world.pgliteSupabase.fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'refresh_token=abc&app_id=123&grant_type=refresh_token'
      });
      assert.equal(oauthRes.status, 200);
      const oauthJson = await oauthRes.json();
      assert.equal(typeof oauthJson.access_token, 'string');

      const oauthSearchParamsRes = await world.pgliteSupabase.fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        body: new URLSearchParams({
          refresh_token: 'abc',
          app_id: '123',
          grant_type: 'refresh_token'
        })
      });
      assert.equal(oauthSearchParamsRes.status, 200);
      const oauthSearchParamsJson = await oauthSearchParamsRes.json();
      assert.equal(typeof oauthSearchParamsJson.access_token, 'string');
      assert.deepEqual(world.mocks.upstreamCalls.zalo.at(-1)?.body, {
        refresh_token: 'abc',
        app_id: '123',
        grant_type: 'refresh_token'
      });

      // 3. Heterogeneous batch merge-duplicates upsert does not overwrite omitted fields with defaults
      await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates' },
        body: JSON.stringify({ email: 'batch.keep@khongtunhi.com', name: 'Batch One', active: false })
      });
      const batchUpsertRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify([
          { email: 'batch.keep@khongtunhi.com', name: 'Batch One Updated' },
          { email: 'batch.two@khongtunhi.com', name: 'Batch Two', active: true }
        ])
      });
      assert.equal(batchUpsertRes.status, 201);
      const batchRows = await batchUpsertRes.json();
      assert.equal(batchRows.find((r) => r.email === 'batch.keep@khongtunhi.com')?.active, false);

      // 4. world.reset() retains all 4 seeded ktn_students, clears consultation linkage, and prunes test-created students
      const convRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_consultations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ channel: 'web', status: 'bot' })
      });
      const convRow = (await convRes.json())[0];
      await world.db.query(
        `UPDATE public.ktn_students SET consultation_id = $1, zalo_user_id = 'z_tmp', lead_source = 'zalo_oa' WHERE code = 'KTN-2026-089'`,
        [convRow.id]
      );
      await world.db.query(
        `INSERT INTO public.ktn_students (code, email, name) VALUES ('KTN-TMP-RESET-01', 'tmp.reset.01@example.test', 'Test Temp Student')`
      );
      const beforeResetStu = await world.db.query(
        `SELECT code FROM public.ktn_students WHERE code = 'KTN-TMP-RESET-01'`
      );
      assert.equal(beforeResetStu.rows.length, 1);

      await world.reset();
      const stuAfterReset = await world.db.query(
        'SELECT code, consultation_id, zalo_user_id, lead_source FROM public.ktn_students ORDER BY code'
      );
      assert.deepEqual(
        stuAfterReset.rows.map((r) => r.code),
        ['KTN-2026-089', 'KTN-2026-102', 'KTN-2026-TAPHON', 'KTN-2026-VIP']
      );
      const linkedRow = stuAfterReset.rows.find((r) => r.code === 'KTN-2026-089');
      assert.equal(linkedRow.consultation_id, null);
      assert.equal(linkedRow.zalo_user_id, null);
      assert.equal(linkedRow.lead_source, null);
    });

    it('enforces POST batch atomicity, DataView body decoding, malformed JSON 400, dotted 1-to-many child filters, and transient table reset', async () => {
      const supabaseBase = world.env.SUPABASE_URL;

      // 1. Multi-item POST batch failure rolls back earlier items atomically
      const atomicRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify([
          { email: 'atomic.leak@khongtunhi.com', name: 'Atomic Row 1' },
          { email: 'atomic.fail@khongtunhi.com', name: null }
        ])
      });
      assert.equal(atomicRes.status, 400);
      const leakedCheck = await world.db.query(
        `SELECT email FROM public.ktn_advisors WHERE email = 'atomic.leak@khongtunhi.com'`
      );
      assert.equal(leakedCheck.rows.length, 0);

      // 2. Malformed JSON on POST & RPC returns 400 PGRST102
      const badPostJson = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_advisors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      });
      assert.equal(badPostJson.status, 400);
      assert.equal((await badPostJson.json()).code, 'PGRST102');

      const badRpcJson = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/rpc/ktn_consultation_action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{'
      });
      assert.equal(badRpcJson.status, 400);
      assert.equal((await badRpcJson.json()).code, 'PGRST102');

      // 3. DataView with non-zero byteOffset decodes accurately in harnessFetch
      const rawStr = 'XXXXrefresh_token=rt_dv&app_id=110&grant_type=refresh_tokenYYYY';
      const u8 = new TextEncoder().encode(rawStr);
      const dv = new DataView(u8.buffer, 4, u8.byteLength - 8);
      const dvRes = await world.pgliteSupabase.fetch('https://oauth.zaloapp.com/v4/oa/access_token', {
        method: 'POST',
        body: dv
      });
      assert.equal(dvRes.status, 200);
      assert.deepEqual(world.mocks.upstreamCalls.zalo.at(-1)?.body, {
        refresh_token: 'rt_dv',
        app_id: '110',
        grant_type: 'refresh_token'
      });

      // 4. Dotted 1-to-many filter filters embedded child array as well as parent
      await world.db.query(
        `INSERT INTO public.ktn_orders (order_id, student_name, student_email, phone, amount)
         VALUES ('ORD-777001', 'Child Filter Test', 'cf@example.test', '0901234567', 890000)`
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status)
         VALUES ('tx_done_1', 'ORD-777001', 890000, 'done'), ('tx_rev_1', 'ORD-777001', 100000, 'needs_review')`
      );
      const dottedChildRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?order_id=eq.ORD-777001&select=order_id,ktn_consultation_payments(transaction_id,status)&ktn_consultation_payments.status=eq.done`
      );
      assert.equal(dottedChildRes.status, 200);
      const dottedRows = await dottedChildRes.json();
      assert.equal(dottedRows.length, 1);
      assert.equal(dottedRows[0].ktn_consultation_payments.length, 1);
      assert.equal(dottedRows[0].ktn_consultation_payments[0].transaction_id, 'tx_done_1');

      // 5. world.reset() truncates transient legacy tables (ktn_homeworks, ktn_messages, ktn_push_subscriptions)
      await world.db.query(
        `INSERT INTO public.ktn_homeworks (id, student_email, student_name, file_url)
         VALUES ('hw-tmp-1', 'hw@example.test', 'HW Test', 'https://example.test/hw.mp4')`
      );
      await world.db.query(
        `INSERT INTO public.ktn_messages (id, room_id, sender_email, sender_name, sender_role, content)
         VALUES ('msg-tmp-1', 'GENERAL', 'a@example.test', 'A', 'student', 'hi')`
      );
      await world.db.query(
        `INSERT INTO public.ktn_push_subscriptions (user_email, user_role, endpoint, p256dh, auth)
         VALUES ('a@example.test', 'student', 'https://push.example.test/1', 'p', 'a')`
      );
      await world.reset();
      assert.equal((await world.db.query('SELECT count(*)::int AS cnt FROM public.ktn_homeworks')).rows[0].cnt, 0);
      assert.equal((await world.db.query('SELECT count(*)::int AS cnt FROM public.ktn_messages')).rows[0].cnt, 0);
      assert.equal((await world.db.query('SELECT count(*)::int AS cnt FROM public.ktn_push_subscriptions')).rows[0].cnt, 0);
    });

    it('correlates EXISTS outer columns on same-name order_id joins across multi-parent dotted filters, !inner + limit + count=exact, and aliased embeds', async () => {
      await world.reset();
      const supabaseBase = world.env.SUPABASE_URL;

      await world.db.query(
        `INSERT INTO public.ktn_orders (order_id, student_name, student_email, phone, amount)
         VALUES
           ('ORD-888001', 'Parent One', 'p1@example.test', '0901111111', 890000),
           ('ORD-888002', 'Parent Two', 'p2@example.test', '0902222222', 890000)`
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status)
         VALUES
           ('tx_888_a', 'ORD-888001', 890000, 'done'),
           ('tx_888_b', 'ORD-888001', 100000, 'mismatch'),
           ('tx_888_c', 'ORD-888002', 890000, 'mismatch')`
      );

      // 1. Multi-parent dotted filter excludes ORD-888002 and keeps only tx_888_a on ORD-888001
      const multiParentRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?order_id=in.(ORD-888001,ORD-888002)&select=order_id,ktn_consultation_payments(transaction_id,status)&ktn_consultation_payments.status=eq.done`
      );
      assert.equal(multiParentRes.status, 200);
      const multiParentRows = await multiParentRes.json();
      assert.deepEqual(multiParentRows, [
        {
          order_id: 'ORD-888001',
          ktn_consultation_payments: [{ transaction_id: 'tx_888_a', status: 'done' }]
        }
      ]);

      // 2. Multi-order !inner + order + limit=1 + Prefer: count=exact
      const innerPagedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?select=order_id,ktn_consultation_payments!inner(transaction_id,status)&ktn_consultation_payments.status=eq.done&order=order_id.desc&limit=1`,
        {
          headers: { Prefer: 'count=exact' }
        }
      );
      assert.equal(innerPagedRes.status, 200);
      assert.equal(innerPagedRes.headers.get('content-range'), '0-0/1');
      assert.deepEqual(await innerPagedRes.json(), [
        {
          order_id: 'ORD-888001',
          ktn_consultation_payments: [{ transaction_id: 'tx_888_a', status: 'done' }]
        }
      ]);

      // 3. Aliased embed with alias-prefixed dotted filter
      const aliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?order_id=in.(ORD-888001,ORD-888002)&select=order_id,payments:ktn_consultation_payments(transaction_id,status)&payments.status=eq.done`
      );
      assert.equal(aliasedRes.status, 200);
      assert.deepEqual(await aliasedRes.json(), [
        {
          order_id: 'ORD-888001',
          payments: [{ transaction_id: 'tx_888_a', status: 'done' }]
        }
      ]);

      await world.reset();
    });

    it('supports dotted/aliased filters in or/and logic trees, 3-level nested !inner + limit + count=exact, and 2-hop embedded filter scoping', async () => {
      await world.reset();
      const supabaseBase = world.env.SUPABASE_URL;

      const convRes = await world.pgliteSupabase.fetch(`${supabaseBase}/rest/v1/ktn_consultations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Prefer: 'return=representation' },
        body: JSON.stringify({ channel: 'web', status: 'bot' })
      });
      assert.equal(convRes.status, 201);
      const convId = (await convRes.json())[0].id;

      await world.db.query(
        `INSERT INTO public.ktn_orders (order_id, student_name, student_email, phone, amount, payment_status)
         VALUES
           ('ORD-888001', 'Parent One', 'p1@example.test', '0901111111', 890000, 'paid'),
           ('ORD-888002', 'Parent Two', 'p2@example.test', '0902222222', 890000, 'pending_verification'),
           ('ORD-888003', 'Parent Three', 'p3@example.test', '0903333333', 890000, 'pending_verification')`
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_orders (order_id, consultation_id, request_id, payment_info)
         VALUES
           ('ORD-888001', $1, '11111111-1111-4111-8111-111111111101', '{}'::jsonb),
           ('ORD-888002', $1, '11111111-1111-4111-8111-111111111102', '{}'::jsonb),
           ('ORD-888003', $1, '11111111-1111-4111-8111-111111111103', '{}'::jsonb)`,
        [convId]
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status)
         VALUES
           ('tx_888_a', 'ORD-888001', 890000, 'done'),
           ('tx_888_b', 'ORD-888001', 100000, 'mismatch'),
           ('tx_888_c', 'ORD-888002', 890000, 'mismatch')`
      );

      // (a) or=(...) and and=(...) with unaliased & aliased dotted filters
      const orUnaliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?select=order_id,ktn_consultation_payments(transaction_id,status)&or=(ktn_consultation_payments.status.eq.done,order_id.eq.ORD-888003)&order=order_id.asc`
      );
      assert.equal(orUnaliasedRes.status, 200);
      assert.deepEqual(
        (await orUnaliasedRes.json()).map((r) => r.order_id),
        ['ORD-888001', 'ORD-888003']
      );

      const orAliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?select=order_id,payments:ktn_consultation_payments(transaction_id,status)&or=(payments.status.eq.done,order_id.eq.ORD-888003)&order=order_id.asc`
      );
      assert.equal(orAliasedRes.status, 200);
      assert.deepEqual(
        (await orAliasedRes.json()).map((r) => r.order_id),
        ['ORD-888001', 'ORD-888003']
      );

      const andUnaliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?select=order_id&and=(ktn_consultation_payments.status.eq.done,payment_status.eq.paid)`
      );
      assert.equal(andUnaliasedRes.status, 200);
      assert.deepEqual(await andUnaliasedRes.json(), [{ order_id: 'ORD-888001' }]);

      const andAliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_orders?select=order_id,payments:ktn_consultation_payments(transaction_id,status)&and=(payments.status.eq.done,payment_status.eq.paid)`
      );
      assert.equal(andAliasedRes.status, 200);
      assert.deepEqual(
        (await andAliasedRes.json()).map((r) => r.order_id),
        ['ORD-888001']
      );

      const orMultiHopRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?select=order_id,ktn_orders(order_id)&or=(ktn_orders.ktn_consultation_payments.status.eq.done,order_id.eq.ORD-888003)&order=order_id.asc`
      );
      assert.equal(orMultiHopRes.status, 200);
      assert.deepEqual(
        (await orMultiHopRes.json()).map((r) => r.order_id),
        ['ORD-888001', 'ORD-888003']
      );

      // (b) 3-level nested !inner + order + limit=1 + Prefer: count=exact excludes unpaid ORD-888003 in SQL
      const nestedInnerPagedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?select=order_id,ktn_orders!inner(order_id,ktn_consultation_payments!inner(transaction_id))&order=order_id.desc&limit=1`,
        { headers: { Prefer: 'count=exact' } }
      );
      assert.equal(nestedInnerPagedRes.status, 200);
      assert.equal(nestedInnerPagedRes.headers.get('content-range'), '0-0/2');
      assert.deepEqual(await nestedInnerPagedRes.json(), [
        {
          order_id: 'ORD-888002',
          ktn_orders: {
            order_id: 'ORD-888002',
            ktn_consultation_payments: [{ transaction_id: 'tx_888_c' }]
          }
        }
      ]);

      // Non-!inner intermediate join does NOT force grandparent filtering when grandchild !inner fails
      const nonInnerMiddleRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?select=order_id,ktn_orders(order_id,ktn_consultation_payments!inner(transaction_id))&order=order_id.desc`,
        { headers: { Prefer: 'count=exact' } }
      );
      assert.equal(nonInnerMiddleRes.status, 200);
      assert.equal(nonInnerMiddleRes.headers.get('content-range'), '0-2/3');
      const nonInnerMiddleRows = await nonInnerMiddleRes.json();
      assert.equal(nonInnerMiddleRows[0].order_id, 'ORD-888003');
      assert.equal(nonInnerMiddleRows[0].ktn_orders, null);

      // (c) 3-level nested join with 2-hop dotted filters (unaliased & aliased) excludes mismatch rows in 3rd-level array
      const twoHopUnaliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?select=order_id,ktn_orders(order_id,ktn_consultation_payments(transaction_id,status))&ktn_orders.ktn_consultation_payments.status=eq.done&order=order_id.asc`
      );
      assert.equal(twoHopUnaliasedRes.status, 200);
      assert.deepEqual(await twoHopUnaliasedRes.json(), [
        {
          order_id: 'ORD-888001',
          ktn_orders: {
            order_id: 'ORD-888001',
            ktn_consultation_payments: [{ transaction_id: 'tx_888_a', status: 'done' }]
          }
        }
      ]);

      const twoHopAliasedRes = await world.pgliteSupabase.fetch(
        `${supabaseBase}/rest/v1/ktn_consultation_orders?select=order_id,ord:ktn_orders(order_id,pay:ktn_consultation_payments(transaction_id,status))&ord.pay.status=eq.done&order=order_id.asc`
      );
      assert.equal(twoHopAliasedRes.status, 200);
      assert.deepEqual(await twoHopAliasedRes.json(), [
        {
          order_id: 'ORD-888001',
          ord: {
            order_id: 'ORD-888001',
            pay: [{ transaction_id: 'tx_888_a', status: 'done' }]
          }
        }
      ]);

      await world.reset();
    });
  });

  describe('(c) Fixtures & assertions invariants', () => {
    it('exports 11 courses, 10 CA transcripts, Adult 1:1 fixtures, and enforces guardrail/PII/secret/V1 assertions', () => {
      assert.equal(CATALOG_COURSES.length, 11);
      assert.equal(Object.keys(CA_TRANSCRIPTS).length, 10);
      assert.equal(ADULT_1_1_FIXTURES.packages.basic963.price, 963000);
      assert.equal(ADULT_1_1_FIXTURES.packages.intensive1500.price, 1500000);

      // Guardrail checks
      for (const bad of GUARDRAIL_CORPUS.forbiddenAiOutputs) {
        assert.throws(() => assertNoForbiddenAiText(bad));
      }
      assertNoForbiddenAiText('Bé nhà chị muốn học qua video hay lớp có giáo viên ạ?');

      // PII redaction check
      assert.throws(() => assertPiiRedacted(GUARDRAIL_CORPUS.piiInputs[0].raw, GUARDRAIL_CORPUS.piiInputs[0].secrets));
      assertPiiRedacted('Email [email] SĐT [số điện thoại] link [liên kết]');

      // Secret leak check (both pattern & in-memory .env check)
      assert.throws(() => assertNoSecretLeaks('token=AIzaSyDummyGoogleKey12345678901234567890', { checkDotEnv: false }));
      assertNoSecretLeaks({ ok: true, envName: TEST_ENV_DEFAULTS.KTN_GEMINI_MODEL }, { rootDir: ROOT_DIR });

      // Safe staff thread & VietQR
      assertSafeStaffThreadResponse({ conversation: { id: 'c1', status: 'open' }, flags: [] }, { isAdmin: false });
      assert.throws(() =>
        assertSafeStaffThreadResponse({ conversation: { id: 'c1', external_id: 'zalo-123' }, flags: [] })
      );
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

      // V1 isolation & SW parity
      assertV1Isolation({ rootDir: ROOT_DIR, checkSwParity: true });

      // Event factories
      const zEv = makeZaloTextEvent({ msgId: 'zm_1', text: 'Xin chào' });
      assert.equal(zEv.message.msg_id, 'zm_1');
      const sEv = makeSepayWebhook({ orderCode: 'ORD-123456', transferAmount: 890000 });
      assert.equal(sEv.transferType, 'in');
      const gEv = makeGeminiSuccessResponse({ reply: 'Chào chị ạ!' });
      assert.ok(gEv.candidates[0].content.parts[0].text.includes('Chào chị ạ!'));

      // Customer thread safety (rejects notes, internal visibility/type, debug/internal keys on root/conversation/thread/msg)
      assertSafeCustomerThreadResponse({
        status: 'open',
        messages: [{ id: 'm1', sender: 'customer', body: 'Xin chào' }]
      });
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          status: 'open',
          messages: [{ id: 'm2', sender: 'note', body: 'Internal note' }]
        })
      );
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          thread: { messages: [{ id: 'm3', sender: 'advisor', delivery: 'internal', body: 'Hidden' }] }
        })
      );
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          status: 'open',
          messages: [{ id: 'm4', sender: 'bot', delivery: 'sent', flags: ['price_check'] }]
        })
      );
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          conversation: { messages: [{ id: 'm5', sender: 'note', body: 'Hidden in conversation.messages' }] }
        })
      );
      for (const badKey of [
        'flags',
        'external_id',
        'prompt_tokens',
        'completion_tokens',
        'ai_debug',
        'system_prompt',
        'internal_notes',
        'internal_note',
        'staff_notes',
        'notes',
        'is_internal'
      ]) {
        assert.throws(() =>
          assertSafeCustomerThreadResponse({
            status: 'open',
            [badKey]: 'leak',
            messages: [{ id: 'm1', sender: 'customer', body: 'Hi' }]
          })
        );
        assert.throws(() =>
          assertSafeCustomerThreadResponse({
            status: 'open',
            messages: [{ id: 'm1', sender: 'customer', body: 'Hi', [badKey]: 'leak' }]
          })
        );
      }
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          status: 'open',
          messages: [{ id: 'm6', sender: 'advisor', visibility: 'internal', body: 'Hidden' }]
        })
      );
      assert.throws(() =>
        assertSafeCustomerThreadResponse({
          status: 'open',
          messages: [{ id: 'm7', sender: 'advisor', type: 'note', body: 'Hidden' }]
        })
      );

      // V1 isolation in synthetic git repo: flags dirty/committed/renamed V1 files, allows apps/ktn-web-v2/index.html
      const tmpGitDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-v1-git-test-'));
      try {
        const git = (...args) => execFileSync('git', ['-C', tmpGitDir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
        git('init');
        git('config', 'user.email', 'smoke@khongtunhi.test');
        git('config', 'user.name', 'Smoke Test');
        fs.mkdirSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'public'), { recursive: true });
        fs.writeFileSync(path.join(tmpGitDir, 'sw.js'), '// sw\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'public', 'sw.js'), '// sw\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'index.html'), '<html>v2</html>\n', 'utf8');
        fs.writeFileSync(path.join(tmpGitDir, 'sll-hocsinh.html'), '<html>v1</html>\n', 'utf8');
        git('add', '.');
        git('commit', '-m', 'init');
        git('branch', '-M', 'feat/ktn-react-ui-v2');
        git('checkout', '-b', 'feat/test-branch');

        assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' });

        // Modifying apps/ktn-web-v2/index.html must NOT trigger V1 false positive
        fs.writeFileSync(path.join(tmpGitDir, 'apps', 'ktn-web-v2', 'index.html'), '<html>v2-updated</html>\n', 'utf8');
        assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' });

        // Dirty V1 sll-hocsinh.html must throw
        fs.writeFileSync(path.join(tmpGitDir, 'sll-hocsinh.html'), '<html>v1-dirty</html>\n', 'utf8');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));

        // Committed V1 sll-hocsinh.html branch diff must also throw
        git('add', 'sll-hocsinh.html');
        git('commit', '-m', 'touch v1');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));

        // Committed git mv rename of V1 sll-hocsinh.html must ALSO throw (--no-renames)
        git('mv', 'sll-hocsinh.html', 'renamed-file.html');
        git('commit', '-m', 'rename v1');
        assert.throws(() => assertV1Isolation({ rootDir: tmpGitDir, baseRef: 'feat/ktn-react-ui-v2' }));
      } finally {
        fs.rmSync(tmpGitDir, { recursive: true, force: true });
      }

      // Quote/JSON/multiline/inline-comment .env secret & Map/Set/AggregateError inspection
      const tmpEnvDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ktn-secret-test-'));
      try {
        const fakeQuotedSecret = '{"kty":"EC","crv":"P-256","d":"SyntheticTestKeyValue123456"}';
        fs.writeFileSync(
          path.join(tmpEnvDir, '.env'),
          [
            `TEST_QUOTED_PEM_SECRET=${fakeQuotedSecret}`,
            'TEST_DQ_ESCAPED="{\\"k\\":\\"SyntheticEscapedSecret789\\"}\\nline2"',
            'TEST_MULTILINE_KEY="SyntheticMultilineFirst123\nSyntheticMultilineSecond456"',
            'TEST_INLINE_COMMENT=SynthInlineSecretValue445 # trailing comment'
          ].join('\n') + '\n',
          'utf8'
        );
        let caughtErr = null;
        try {
          assertNoSecretLeaks({ payload: fakeQuotedSecret }, { rootDir: tmpEnvDir });
        } catch (err) {
          caughtErr = err;
        }
        assert.ok(caughtErr, 'Expected assertNoSecretLeaks to throw on quoted .env secret inside object');
        assert.match(caughtErr.message, /\[TEST_QUOTED_PEM_SECRET\]/);
        assert.equal(caughtErr.message.includes('SyntheticTestKeyValue123456'), false);

        assert.throws(
          () => assertNoSecretLeaks('{"k":"SyntheticEscapedSecret789"}\nline2', { rootDir: tmpEnvDir }),
          /\[TEST_DQ_ESCAPED\]/
        );
        assert.throws(
          () => assertNoSecretLeaks('SyntheticMultilineFirst123\nSyntheticMultilineSecond456', { rootDir: tmpEnvDir }),
          /\[TEST_MULTILINE_KEY\]/
        );
        assert.throws(
          () => assertNoSecretLeaks(new Error('Failure with SyntheticMultilineFirst123\nSyntheticMultilineSecond456'), { rootDir: tmpEnvDir }),
          /\[TEST_MULTILINE_KEY\]/
        );
        assert.throws(
          () => assertNoSecretLeaks('leaked SynthInlineSecretValue445 here', { rootDir: tmpEnvDir }),
          /\[TEST_INLINE_COMMENT\]/
        );
        assert.throws(
          () => assertNoSecretLeaks(new Map([['token', 'SynthInlineSecretValue445']]), { rootDir: tmpEnvDir }),
          /\[TEST_INLINE_COMMENT\]/
        );
        assert.throws(
          () => assertNoSecretLeaks(new Set(['SynthInlineSecretValue445']), { rootDir: tmpEnvDir }),
          /\[TEST_INLINE_COMMENT\]/
        );
        assert.throws(
          () => assertNoSecretLeaks(new AggregateError([new Error('SynthInlineSecretValue445')], 'agg'), { rootDir: tmpEnvDir }),
          /\[TEST_INLINE_COMMENT\]/
        );
      } finally {
        fs.rmSync(tmpEnvDir, { recursive: true, force: true });
      }

      // CLI flag & token validation guard
      assert.throws(() => parseCliArgs(['--tier']));
      assert.throws(() => parseCliArgs(['--tier', '--json', 'out.json']));
      assert.throws(() => parseCliArgs(['--suite']));
      assert.throws(() => parseCliArgs(['--json']));
      assert.throws(() => parseCliArgs(['--json', '--tier', 'harness']));
      assert.throws(() => parseCliArgs(['--bogus']), /Unknown CLI argument/);
      assert.throws(() => parseCliArgs(['bogus']), /Unknown CLI argument/);
      assert.throws(() => parseCliArgs(['--tier', 'bogus']), /Unknown tier value/);
      assert.throws(() => parseCliArgs(['--tier', '1,bogus']), /Unknown tier value/);
      assert.throws(() => parseCliArgs(['--suite', 'bogus']), /Unknown suite value/);

      const runnerPath = path.join(ROOT_DIR, 'tests', 'e2e-zalo-crm', 'run_all_e2e.mjs');
      for (const badArgs of [['--bogus'], ['bogus'], ['--tier', '1,bogus'], ['--suite', 'bogus']]) {
        let spawnErr = null;
        try {
          execFileSync(process.execPath, [runnerPath, ...badArgs], {
            cwd: ROOT_DIR,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe']
          });
        } catch (err) {
          spawnErr = err;
        }
        assert.ok(spawnErr, `Expected non-zero exit for ${badArgs.join(' ')}`);
        assert.equal(spawnErr.status, 1);
        assert.match(spawnErr.stderr || '', /Unknown (?:CLI argument|tier value|suite value)/);
      }
    });
  });

  describe('(d) Layer B: Vite + Playwright Chromium at 1440x900 and 390x844', () => {
    let harness;

    before(async () => {
      harness = await startBrowserHarness();
    });

    after(async () => {
      await harness?.close();
    });

    it('launches Vite + headless Chromium, quick-logs in as admin at 1440x900, and has zero horizontal overflow at 390x844', async () => {
      // Desktop 1440x900 quick login
      const desktop = await harness.openDesktopPage();
      await loginViaQuickButton(desktop.page, harness.baseUrl, STAFF_ACTORS.manager.email, '/admin');
      await desktop.page.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 15000 });
      await assertZeroHorizontalOverflow(desktop.page);
      desktop.diag.assertNoPageErrors();

      // Mobile 390x844 with seeded auth session
      const mobile = await harness.openMobilePage();
      await seedAuthSession(
        mobile.context,
        harness.baseUrl,
        {
          email: STAFF_ACTORS.manager.email,
          name: STAFF_ACTORS.manager.name,
          role: 'admin'
        },
        TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
      );
      await mobile.page.goto(`${harness.baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
      await mobile.page.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 15000 });
      const overflowMetrics = await assertZeroHorizontalOverflow(mobile.page);
      assert.equal(overflowMetrics.clientWidth, 390);
      mobile.diag.assertNoPageErrors();
    });
  });
});
