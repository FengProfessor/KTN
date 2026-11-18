import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoSecretLeaks,
  assertSafeStaffThreadResponse
} from '../harness/assertions.mjs';
import {
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  makeZaloSubmitInfoEvent,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import { ROOT_DIR } from '../harness/pglite-supabase.mjs';
import { createTestWorld, mintKtnSession, mintSupabaseJwt, zaloSign } from '../harness/worker-client.mjs';

function uniqueUserId(prefix = 'zuid2') {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function uniqueMsgId(prefix = 'zmsg2') {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

async function createWaitingZaloThread(world, userId = uniqueUserId('wait')) {
  const isSandbox = world.env.KTN_ZALO_SANDBOX === 'true';
  const r1 = await world.postZaloEvent(
    makeZaloTextEvent({ msgId: uniqueMsgId('mw1'), userId, text: 'Chào trung tâm' }),
    { sign: !isSandbox, sandbox: isSandbox }
  );
  assertHttpStatus(r1, 200, 'seed zalo inbound');
  await world.postZaloEvent(
    makeZaloTextEvent({
      msgId: uniqueMsgId('mw2'),
      userId,
      eventName: 'oa_send_text',
      isEcho: true,
      text: 'Đợi nhân viên nhận ca'
    }),
    { sign: !isSandbox, sandbox: isSandbox }
  );
  return { convId: r1.json.consultation_id, userId };
}

describe('Tier 2 — Zalo OA Connector & Multi-Staff OA (Boundary / Negative / Auth / Race)', () => {
  let sandboxWorld;
  let liveWorld;

  before(async () => {
    sandboxWorld = await createTestWorld({ mode: 'sandbox' });
    liveWorld = await createTestWorld({ mode: 'live-auth' });
  });

  after(async () => {
    await sandboxWorld?.close();
    await liveWorld?.close();
  });

  beforeEach(async () => {
    await sandboxWorld.reset();
    await liveWorld.reset();
  });

  // =========================================================================
  // F03 — Zalo OA Webhook Auth, Limits & Concurrency Boundaries (5 tests)
  // =========================================================================

  it('[F03] T2-ZALO-F03-01: Rejects missing, tampered, wrong-secret, empty-secret, and invalid-in-sandbox signatures (401)', async () => {
    const payload = makeZaloTextEvent({ msgId: uniqueMsgId('bad'), userId: uniqueUserId('bad'), text: 'Test' });
    const rawBody = JSON.stringify(payload);
    const ts = String(payload.timestamp);
    const validSig = zaloSign(liveWorld.env.KTN_ZALO_APP_ID, rawBody, ts, liveWorld.env.KTN_ZALO_APP_SECRET);

    // (a) Missing X-ZEvent-Signature on live route
    const rMissing = await liveWorld.request('/api/ktn/consultations/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ZEvent-Timestamp': ts },
      body: rawBody
    });
    assertHttpStatus(rMissing, 401, 'missing signature');
    assertNoSecretLeaks(rMissing.text, { rootDir: ROOT_DIR });

    // (b) Tampered body after signing
    const tamperedBody = JSON.stringify({ ...payload, message: { ...payload.message, text: 'Tampered!' } });
    const rTampered = await liveWorld.request('/api/ktn/consultations/zalo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZEvent-Signature': validSig,
        'X-ZEvent-Timestamp': ts
      },
      body: tamperedBody
    });
    assertHttpStatus(rTampered, 401, 'tampered body');

    // (c) Wrong secret & spoofed X-KTN-Sandbox: true in live-auth mode
    const wrongSig = zaloSign(liveWorld.env.KTN_ZALO_APP_ID, rawBody, ts, 'wrong-secret');
    const rSpoof = await liveWorld.request('/api/ktn/consultations/zalo', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZEvent-Signature': wrongSig,
        'X-ZEvent-Timestamp': ts,
        'X-KTN-Sandbox': 'true'
      },
      body: rawBody
    });
    assertHttpStatus(rSpoof, 401, 'wrong secret + spoofed sandbox header');

    const rSpoofUnsigned = await liveWorld.request('/api/ktn/consultations/zalo', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-KTN-Sandbox': 'true' },
      body: rawBody
    });
    assertHttpStatus(rSpoofUnsigned, 401, 'spoofed X-KTN-Sandbox without signature in live mode');

    // (d) Empty KTN_ZALO_APP_SECRET even with signature header
    const noSecretWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_ZALO_APP_SECRET: '' }
    });
    try {
      const rNoSec = await noSecretWorld.request('/api/ktn/consultations/zalo', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-ZEvent-Signature': validSig,
          'X-ZEvent-Timestamp': ts
        },
        body: rawBody
      });
      assertHttpStatus(rNoSec, 401, 'missing KTN_ZALO_APP_SECRET');
      assertNoSecretLeaks(rNoSec.text, { rootDir: ROOT_DIR });
    } finally {
      await noSecretWorld.close();
    }

    // (e) Sandbox mode WITH X-KTN-Sandbox: true AND invalid non-empty signature -> still 401
    const rBadInSandbox = await sandboxWorld.request('/api/ktn/consultations/zalo/sandbox/event', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KTN-Sandbox': 'true',
        'X-ZEvent-Signature': 'mac=0000deadbeef',
        'X-ZEvent-Timestamp': ts
      },
      body: rawBody
    });
    assertHttpStatus(rBadInSandbox, 401, 'invalid non-empty signature inside sandbox mode');

    const evCnt = await liveWorld.db.query('SELECT count(*)::int AS cnt FROM public.ktn_zalo_oa_events');
    const convCnt = await liveWorld.db.query('SELECT count(*)::int AS cnt FROM public.ktn_consultations');
    assert.equal(evCnt.rows[0].cnt, 0);
    assert.equal(convCnt.rows[0].cnt, 0);
  });

  it('[F03] T2-ZALO-F03-02: Enforces sandbox-disabled (403), pilot-mode gate (404), and HTTP method guard (405)', async () => {
    const payload = makeZaloTextEvent({ msgId: uniqueMsgId('gate'), userId: uniqueUserId('gate'), text: 'Hi' });

    // (a) /zalo/sandbox/event when KTN_ZALO_SANDBOX='false' -> 403
    const rSbDisabled = await liveWorld.request('/api/ktn/consultations/zalo/sandbox/event', {
      method: 'POST',
      json: payload
    });
    assertHttpStatus(rSbDisabled, 403, 'sandbox route disabled in live-auth');

    // (b) Pilot mode (KTN_CONSULTATION_MODE='web', KTN_ZALO_SANDBOX='false') -> 404
    const pilotWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_CONSULTATION_MODE: 'web', KTN_ZALO_SANDBOX: 'false' }
    });
    try {
      const rPilot = await pilotWorld.postZaloEvent(payload, { sign: true });
      assertHttpStatus(rPilot, 404, 'zalo route blocked in web pilot mode');
    } finally {
      await pilotWorld.close();
    }

    // (c) PUT and DELETE on /api/ktn/consultations/zalo -> 405
    const rPut = await sandboxWorld.request('/api/ktn/consultations/zalo', { method: 'PUT', json: payload });
    assertHttpStatus(rPut, 405, 'PUT zalo webhook');
    const rDel = await sandboxWorld.request('/api/ktn/consultations/zalo', { method: 'DELETE' });
    assertHttpStatus(rDel, 405, 'DELETE zalo webhook');
  });

  it('[F03] T2-ZALO-F03-03: Rejects malformed JSON (400), array JSON (400), >512KB payload (413), and ignores missing userId', async () => {
    // (a) Malformed JSON -> 400
    const rBadJson = await sandboxWorld.request('/api/ktn/consultations/zalo/sandbox/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{bad-json'
    });
    assertHttpStatus(rBadJson, 400, 'malformed JSON');

    // (b) Array JSON -> 400
    const rArrJson = await sandboxWorld.request('/api/ktn/consultations/zalo/sandbox/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '[{"event_name":"user_send_text"}]'
    });
    assertHttpStatus(rArrJson, 400, 'array JSON');

    // (c) >512KB body -> 413
    const hugeBody = JSON.stringify({
      event_name: 'user_send_text',
      sender: { id: uniqueUserId('big') },
      message: { msg_id: 'big1', text: 'A'.repeat(520 * 1024) }
    });
    const rTooBig = await sandboxWorld.request('/api/ktn/consultations/zalo/sandbox/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: hugeBody
    });
    assertHttpStatus(rTooBig, 413, 'oversized >512KB payload');

    // (d) Missing sender/recipient/follower ID -> 200 { ok: true, ignored: true } with 0 DB rows
    const rNoUser = await sandboxWorld.postZaloEvent(
      { event_name: 'user_send_text', message: { msg_id: 'no_user_1', text: 'hi' } },
      { sign: false, sandbox: true }
    );
    assertHttpStatus(rNoUser, 200, 'missing userId ignored');
    assert.deepEqual(rNoUser.json, { ok: true, ignored: true });

    const evCnt = await sandboxWorld.db.query('SELECT count(*)::int AS cnt FROM public.ktn_zalo_oa_events');
    assert.equal(evCnt.rows[0].cnt, 0);
  });

  it('[F03] T2-ZALO-F03-04: Normalizes 10-digit Unix timestamp boundaries and hands off attachment-only user_send_image', async () => {
    // (a) 10-digit Unix seconds timestamp -> 2023-11-14T22:13:20.000Z
    const uSec = uniqueUserId('ts-sec');
    const rSec = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mts1'), userId: uSec, timestamp: '1700000000', text: 'Xin chào' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(rSec, 200);
    const secRow = await sandboxWorld.db.query(
      'SELECT last_customer_at FROM public.ktn_consultations WHERE id = $1',
      [rSec.json.consultation_id]
    );
    assert.equal(new Date(secRow.rows[0].last_customer_at).toISOString(), '2023-11-14T22:13:20.000Z');

    // Negative & invalid timestamps fall back cleanly without 500
    const rNeg = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mts2'), userId: uniqueUserId('ts-neg'), timestamp: '-50', text: 'Xin chào' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(rNeg, 200);
    const rInv = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mts3'), userId: uniqueUserId('ts-inv'), timestamp: 'not-a-ts', text: 'Xin chào' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(rInv, 200);

    // (b) Attachment-only user_send_image without text -> placeholder body + has_attachments + handoff
    const uImg = uniqueUserId('img');
    const imgEvent = {
      app_id: sandboxWorld.env.KTN_ZALO_APP_ID,
      oa_id: sandboxWorld.env.KTN_ZALO_OA_ID,
      event_name: 'user_send_image',
      timestamp: String(Date.now()),
      sender: { id: uImg },
      recipient: { id: sandboxWorld.env.KTN_ZALO_OA_ID },
      message: {
        msg_id: uniqueMsgId('mimg'),
        attachments: [{ type: 'image', payload: { url: 'https://example.test/receipt.jpg' } }]
      }
    };
    const rImg = await sandboxWorld.postZaloEvent(imgEvent, { sign: false, sandbox: true });
    assertHttpStatus(rImg, 200);
    const imgConvId = rImg.json.consultation_id;

    const convRow = await sandboxWorld.db.query(
      'SELECT status, owner_email, queued_at, lead_meta FROM public.ktn_consultations WHERE id = $1',
      [imgConvId]
    );
    assert.ok(convRow.rows[0].queued_at);
    assert.equal(convRow.rows[0].status, 'open');
    assert.ok(convRow.rows[0].owner_email);
    assert.equal(convRow.rows[0].lead_meta.has_attachments, true);

    const custMsg = await sandboxWorld.db.query(
      "SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'customer'",
      [imgConvId]
    );
    assert.equal(custMsg.rows[0].body, '[Tệp đính kèm trên Zalo OA]');
  });

  it('[F03] T2-ZALO-F03-05: Concurrent duplicate msg_id race yields 1 DB event/message and RPC rejects empty event_id', async () => {
    const userId = uniqueUserId('race-dup');
    const msgId = uniqueMsgId('mrd');
    const event = makeZaloTextEvent({ msgId, userId, text: 'Chào trung tâm, bé 7 tuổi muốn học.' });

    const [r1, r2] = await Promise.all([
      liveWorld.postZaloEvent(event, { sign: true }),
      liveWorld.postZaloEvent(event, { sign: true })
    ]);
    assertHttpStatus(r1, 200);
    assertHttpStatus(r2, 200);

    const dupFlags = [r1.json.duplicate, r2.json.duplicate].sort();
    assert.deepEqual(dupFlags, [false, true]);

    const evCount = await liveWorld.db.query(
      'SELECT count(*)::int AS cnt FROM public.ktn_zalo_oa_events WHERE event_id = $1',
      [msgId]
    );
    assert.equal(evCount.rows[0].cnt, 1);

    const msgCount = await liveWorld.db.query(
      'SELECT count(*)::int AS cnt FROM public.ktn_consultation_messages WHERE external_id = $1',
      [`zalo:${msgId}`]
    );
    assert.equal(msgCount.rows[0].cnt, 1);

    // Direct RPC check for empty p_event_id / p_zalo_user_id
    const rpcRes = await liveWorld.pgliteSupabase.fetch(
      `${liveWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_upsert_zalo_inbound`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_event_id: '   ', p_event_name: 'user_send_text', p_zalo_user_id: '', p_payload: {} })
      }
    );
    assert.equal(rpcRes.status, 200);
    assert.deepEqual(await rpcRes.json(), { ok: false, error: 'invalid' });
  });

  // =========================================================================
  // F04 — Outbox Failure, Cron Stale Recovery & Sync Boundaries (5 tests)
  // =========================================================================

  it('[F04] T2-ZALO-F04-01: Zalo Send API 502 failure (failZaloSend) marks delivery=failed and preserves first_reply_at=null', async () => {
    const userId = uniqueUserId('fail-send');
    const ev = await liveWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mfs'), userId, text: 'Gặp tư vấn viên' }),
      { sign: true }
    );
    assertHttpStatus(ev, 200);
    const convId = ev.json.consultation_id;

    // Assign specifically to advisor.an so we know owner, and enable failZaloSend before reply
    await liveWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[0].email }
    });

    liveWorld.mocks.setFaults({ failZaloSend: true });
    const reqId = crypto.randomUUID();
    const replyRes = await liveWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Tin nhắn gặp lỗi gửi Zalo OA.', request_id: reqId }
    });
    assertHttpStatus(replyRes, 200);

    const msgRow = await liveWorld.db.query(
      'SELECT delivery, delivery_note, external_id FROM public.ktn_consultation_messages WHERE external_id = $1',
      [`staff:${convId}:${reqId}`]
    );
    assert.equal(msgRow.rows.length, 1);
    assert.equal(msgRow.rows[0].delivery, 'failed');
    assert.equal(msgRow.rows[0].delivery_note, 'Zalo OA chưa xác nhận gửi. Kiểm tra trước khi gửi lại.');

    const convRow = await liveWorld.db.query(
      'SELECT first_reply_at FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convRow.rows[0].first_reply_at, null);
  });

  it('[F04] T2-ZALO-F04-02: Missing KTN_ZALO_OA_ACCESS_TOKEN fails outbox cleanly without external calls or secret leaks', async () => {
    const noTokenWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_ZALO_OA_ACCESS_TOKEN: '' }
    });
    try {
      const userId = uniqueUserId('no-tok');
      const ev = await noTokenWorld.postZaloEvent(
        makeZaloTextEvent({ msgId: uniqueMsgId('mnt'), userId, text: 'Gặp tư vấn viên' }),
        { sign: true }
      );
      assertHttpStatus(ev, 200);
      const convId = ev.json.consultation_id;

      await noTokenWorld.staffReq(`staff/thread/${convId}/assign`, {
        method: 'POST',
        actor: STAFF_ACTORS.manager,
        json: { email: STAFF_ACTORS.advisors[0].email }
      });

      const reqId = crypto.randomUUID();
      const replyRes = await noTokenWorld.staffReq(`staff/thread/${convId}/reply`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { body: 'Kiểm tra thiếu token OA.', request_id: reqId }
      });
      assertHttpStatus(replyRes, 200);
      assertNoSecretLeaks(replyRes.json, { rootDir: ROOT_DIR });

      const msgRow = await noTokenWorld.db.query(
        'SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE external_id = $1',
        [`staff:${convId}:${reqId}`]
      );
      assert.equal(msgRow.rows[0].delivery, 'failed');
      assert.match(msgRow.rows[0].delivery_note, /access token/i);

      const csCalls = noTokenWorld.mocks.upstreamCalls.zalo.filter((c) => c.url.includes('/oa/message/cs'));
      assert.equal(csCalls.length, 0);
    } finally {
      await noTokenWorld.close();
    }
  });

  it('[F04] T2-ZALO-F04-03: Cron recovers stale sending (>10m) to failed while keeping fresh sending and flushing queued', async () => {
    const userId = uniqueUserId('cron');
    const insConv = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, owner_email, last_customer_at)
       VALUES ('zalo_oa', $1, $1, 'open', $2, now()) RETURNING id`,
      [userId, STAFF_ACTORS.advisors[0].email]
    );
    const convId = insConv.rows[0].id;

    const staleRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery, claimed_at)
       VALUES ($1, 'advisor', 'Stale sending msg', 'sending', now() - interval '15 minutes') RETURNING id`,
      [convId]
    );
    const freshRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery, claimed_at)
       VALUES ($1, 'advisor', 'Fresh sending msg', 'sending', now() - interval '2 minutes') RETURNING id`,
      [convId]
    );
    const queuedRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'advisor', 'Queued msg to flush', 'queued') RETURNING id`,
      [convId]
    );

    await sandboxWorld.scheduled('*/5 * * * *');

    const rows = await sandboxWorld.db.query(
      'SELECT id, delivery, delivery_note, external_id FROM public.ktn_consultation_messages WHERE id = ANY($1::uuid[])',
      [[staleRes.rows[0].id, freshRes.rows[0].id, queuedRes.rows[0].id]]
    );
    const byId = Object.fromEntries(rows.rows.map((r) => [r.id, r]));

    assert.equal(byId[staleRes.rows[0].id].delivery, 'failed');
    assert.equal(byId[staleRes.rows[0].id].delivery_note, 'Chưa có xác nhận gửi. Kiểm tra lại trên kênh.');
    assert.equal(byId[freshRes.rows[0].id].delivery, 'sending');
    assert.equal(byId[queuedRes.rows[0].id].delivery, 'sent');
    assert.match(byId[queuedRes.rows[0].id].external_id, /^zalo_sandbox:/);
  });

  it('[F04] T2-ZALO-F04-04: Invalid VN phones are rejected and partial user_submit_info preserves existing name/phone', async () => {
    const userId = uniqueUserId('keep-prof');
    const first = await sandboxWorld.postZaloEvent(
      makeZaloSubmitInfoEvent({
        msgId: uniqueMsgId('mkp1'),
        userId,
        name: 'Phụ Huynh Minh',
        phone: '0901234567',
        address: 'Hà Nội'
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(first, 200);
    const convId = first.json.consultation_id;

    for (const badPhone of LEARNERS_AND_PARENTS.invalidPhones) {
      const next = await sandboxWorld.postZaloEvent(
        makeZaloSubmitInfoEvent({
          msgId: uniqueMsgId('mkp_bad'),
          userId,
          name: '',
          phone: badPhone,
          address: 'TP.HCM'
        }),
        { sign: false, sandbox: true }
      );
      assertHttpStatus(next, 200);
    }

    const row = await sandboxWorld.db.query(
      'SELECT customer_name, customer_phone, lead_meta FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(row.rows[0].customer_name, 'Phụ Huynh Minh');
    assert.equal(row.rows[0].customer_phone, '0901234567');
    assert.equal(row.rows[0].lead_meta.address, 'TP.HCM');
  });

  it('[F04] T2-ZALO-F04-05: Echo-before-Send-API race removes duplicate external row and take_outbox cancels stale queued bot msg', async () => {
    const userId = uniqueUserId('out-race');
    const { convId } = await createWaitingZaloThread(liveWorld, userId);

    await liveWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    // (a) Queue advisor reply via action RPC, claim via take_outbox -> sending, then echo arrives before complete_send
    const raceMsgId = uniqueMsgId('zm_race');
    const actionRes = await liveWorld.pgliteSupabase.fetch(
      `${liveWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_id: convId,
          p_action: 'reply',
          p_actor: STAFF_ACTORS.advisors[0].email,
          p_admin: false,
          p_payload: { body: 'Tin nhắn gửi trước echo', external_id: `staff:${convId}:${crypto.randomUUID()}` }
        })
      }
    );
    assert.equal(actionRes.status, 200);
    const advisorMsgId = (await actionRes.json()).message.id;

    const takeRes = await liveWorld.pgliteSupabase.fetch(
      `${liveWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_take_outbox`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: convId })
      }
    );
    assert.equal(takeRes.status, 200);
    const taken = await takeRes.json();
    assert.equal(taken.length, 1);
    assert.equal(taken[0].delivery, 'sending');

    // Echo arrives with Zalo message_id before Send API returns
    const echoRes = await liveWorld.postZaloEvent(
      makeZaloTextEvent({
        msgId: raceMsgId,
        userId,
        eventName: 'oa_send_text',
        isEcho: true,
        text: 'Tin nhắn gửi trước echo'
      }),
      { sign: true }
    );
    assertHttpStatus(echoRes, 200);

    // Send API completes with the same Zalo message_id (void RPC -> 204 No Content)
    const completeRes = await liveWorld.pgliteSupabase.fetch(
      `${liveWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_complete_send`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: advisorMsgId, p_external_id: `zalo:${raceMsgId}`, p_error: null })
      }
    );
    assert.equal(completeRes.status, 204);

    const msgsWithExt = await liveWorld.db.query(
      'SELECT id, sender, delivery FROM public.ktn_consultation_messages WHERE external_id = $1',
      [`zalo:${raceMsgId}`]
    );
    assert.equal(msgsWithExt.rows.length, 1);
    assert.equal(msgsWithExt.rows[0].id, advisorMsgId);
    assert.equal(msgsWithExt.rows[0].sender, 'advisor');
    assert.equal(msgsWithExt.rows[0].delivery, 'sent');

    // (b) Stale queued bot message on non-bot thread is cancelled by take_outbox without calling Zalo API
    const staleBotIns = await liveWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'bot', 'Bot reply sau khi đã có advisor', 'queued') RETURNING id`,
      [convId]
    );
    liveWorld.mocks.clearUpstreamCalls();

    const takeBotRes = await liveWorld.pgliteSupabase.fetch(
      `${liveWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_take_outbox`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: convId })
      }
    );
    assert.equal(takeBotRes.status, 200);
    const takenBot = await takeBotRes.json();
    assert.equal(takenBot.length, 1);
    assert.equal(takenBot[0].id, staleBotIns.rows[0].id);
    assert.equal(takenBot[0].delivery, 'failed');
    assert.equal(takenBot[0].delivery_note, 'Đã chuyển cho tư vấn viên');
    assert.equal(liveWorld.mocks.upstreamCalls.zalo.length, 0);
  });

  // =========================================================================
  // F05 — Multi-Staff Auth, Role Boundaries & Deactivation (5 tests)
  // =========================================================================

  it('[F05] T2-ZALO-F05-01: Rejects missing auth, expired JWT, unconfirmed email, tampered session, and wrong login password', async () => {
    // (a) Missing auth header -> 403
    const rNoAuth = await sandboxWorld.request('/api/ktn/consultations/staff/inbox');
    assertHttpStatus(rNoAuth, 403, 'no auth header');
    assertNoSecretLeaks(rNoAuth.json, { rootDir: ROOT_DIR });

    // (b) Expired Supabase JWT -> 401
    const expJwt = mintSupabaseJwt({
      email: STAFF_ACTORS.advisors[0].email,
      exp: Math.floor(Date.now() / 1000) - 60
    });
    const rExpJwt = await sandboxWorld.request('/api/ktn/consultations/staff/inbox', { token: expJwt });
    assertHttpStatus(rExpJwt, 401, 'expired Supabase JWT');

    // (c) Unconfirmed email Supabase JWT -> 403
    const unconfJwt = mintSupabaseJwt({
      email: STAFF_ACTORS.advisors[0].email,
      email_confirmed_at: null
    });
    const rUnconf = await sandboxWorld.request('/api/ktn/consultations/staff/inbox', { token: unconfJwt });
    assertHttpStatus(rUnconf, 403, 'unconfirmed email JWT');

    // (d) Tampered KTN session signature & non-admin KTN session -> 403
    const validSess = mintKtnSession({ email: STAFF_ACTORS.manager.email, role: 'admin' }, sandboxWorld.env.KTN_SESSION_SECRET);
    const tamperedSess = `${validSess.split('.')[0]}.tampered_sig`;
    const rTampered = await sandboxWorld.request('/api/ktn/consultations/staff/inbox', { token: tamperedSess });
    assertHttpStatus(rTampered, 403, 'tampered KTN session');

    const studentSess = mintKtnSession({ email: 'student@example.test', role: 'student' }, sandboxWorld.env.KTN_SESSION_SECRET);
    const rStudent = await sandboxWorld.request('/api/ktn/consultations/staff/inbox', { token: studentSess });
    assertHttpStatus(rStudent, 403, 'non-admin student KTN session');

    // (e) staff/login wrong password -> 401; unconfirmed email login -> 403
    sandboxWorld.mocks.registerJwtUser({
      email: STAFF_ACTORS.advisors[0].email,
      password: 'CorrectPassword!2026',
      email_confirmed_at: new Date().toISOString()
    });
    const rBadPwd = await sandboxWorld.request('/api/ktn/consultations/staff/login', {
      method: 'POST',
      json: { email: STAFF_ACTORS.advisors[0].email, password: 'WrongPassword!' }
    });
    assertHttpStatus(rBadPwd, 401, 'staff/login wrong password');
    assertNoSecretLeaks(rBadPwd.json, { rootDir: ROOT_DIR });

    sandboxWorld.mocks.registerJwtUser({
      email: 'unconfirmed@khongtunhi.com',
      password: 'CorrectPassword!2026',
      email_confirmed_at: null
    });
    const rUnconfLogin = await sandboxWorld.request('/api/ktn/consultations/staff/login', {
      method: 'POST',
      json: { email: 'unconfirmed@khongtunhi.com', password: 'CorrectPassword!2026' }
    });
    assertHttpStatus(rUnconfLogin, 403, 'staff/login unconfirmed email');
  });

  it('[F05] T2-ZALO-F05-02: Inactive advisor and deactivated advisor receive immediate 403 revocation', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);

    // (a) Seeded inactive advisor
    const rProf = await sandboxWorld.staffReq('staff/profile', {
      actor: STAFF_ACTORS.inactiveAdvisor,
      authType: 'supabase-jwt'
    });
    assertHttpStatus(rProf, 403, 'inactive advisor profile');

    const rInbox = await sandboxWorld.staffReq('staff/inbox', {
      actor: STAFF_ACTORS.inactiveAdvisor,
      authType: 'supabase-jwt'
    });
    assertHttpStatus(rInbox, 403, 'inactive advisor inbox');

    const rClaim = await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.inactiveAdvisor,
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(rClaim, 403, 'inactive advisor claim');

    // (b) Deactivate advisor.chau via manager PUT staff/advisors -> immediate 403
    const okBefore = await sandboxWorld.staffReq('staff/inbox', {
      actor: STAFF_ACTORS.advisors[2],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(okBefore, 200, 'advisor.chau active before deactivation');

    const deact = await sandboxWorld.staffReq('staff/advisors', {
      method: 'PUT',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[2].email, name: STAFF_ACTORS.advisors[2].name, active: false }
    });
    assertHttpStatus(deact, 200);
    assert.equal(deact.json.advisor.active, false);

    const deniedAfter = await sandboxWorld.staffReq('staff/inbox', {
      actor: STAFF_ACTORS.advisors[2],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(deniedAfter, 403, 'advisor.chau revoked after active=false');
  });

  it('[F05] T2-ZALO-F05-03: Advisor is blocked (403) from all manager-only endpoints', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const checks = [
      sandboxWorld.staffReq('staff/advisors', { actor: STAFF_ACTORS.advisors[0], authType: 'supabase-jwt' }),
      sandboxWorld.staffReq('staff/advisors', {
        method: 'PUT',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { email: 'x@khongtunhi.com', name: 'X', active: true }
      }),
      sandboxWorld.staffReq('staff/guidance', { actor: STAFF_ACTORS.advisors[0], authType: 'supabase-jwt' }),
      sandboxWorld.staffReq('staff/guidance', {
        method: 'PUT',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { policy: 'p', examples: [] }
      }),
      sandboxWorld.staffReq('staff/guidance/draft', { actor: STAFF_ACTORS.advisors[0], authType: 'supabase-jwt' }),
      sandboxWorld.staffReq('staff/report', { actor: STAFF_ACTORS.advisors[0], authType: 'supabase-jwt' }),
      sandboxWorld.staffReq(`staff/thread/${convId}/review`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { message_id: crypto.randomUUID(), status: 'confirmed', note: 'test' }
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/retry_payment`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { order_id: 'ORD-100001', transaction_id: 'sepay:123' }
      })
    ];

    const results = await Promise.all(checks);
    for (const res of results) {
      assertHttpStatus(res, 403, 'advisor calling manager-only endpoint');
    }
  });

  it('[F05] T2-ZALO-F05-04: Cross-advisor thread snooping, actions, and inbox leakage are blocked (403)', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const advB = STAFF_ACTORS.advisors[1];
    const inboxB = await sandboxWorld.staffReq('staff/inbox', { actor: advB, authType: 'supabase-jwt' });
    assertHttpStatus(inboxB, 200);
    assert.equal(inboxB.json.conversations.some((c) => c.id === convId), false);

    const forbiddenOps = [
      sandboxWorld.staffReq(`staff/thread/${convId}`, { actor: advB, authType: 'supabase-jwt' }),
      sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: { body: 'Cross reply', request_id: crypto.randomUUID() }
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/note`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: { body: 'Cross note' }
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: { at: new Date().toISOString() }
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: { outcome: 'other' }
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/reopen`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: {}
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/checkout_link`, {
        method: 'POST',
        actor: advB,
        authType: 'supabase-jwt',
        json: {}
      })
    ];

    const results = await Promise.all(forbiddenOps);
    for (const res of results) {
      assertHttpStatus(res, 403, 'cross-advisor action');
    }
  });

  it('[F05] T2-ZALO-F05-05: Rejects advisor assign (403), invalid advisor payload (400), and unredacted PII in guidance (400)', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    // (a) Non-admin advisor calling assign -> 403 forbidden (requireManager in consultation-worker.mjs)
    const advAssign = await sandboxWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { email: STAFF_ACTORS.advisors[1].email }
    });
    assertHttpStatus(advAssign, 403, 'non-admin advisor calling assign');

    // (b) Invalid email or empty name in PUT staff/advisors -> 400
    const badEmail = await sandboxWorld.staffReq('staff/advisors', {
      method: 'PUT',
      actor: STAFF_ACTORS.manager,
      json: { email: 'not-an-email', name: 'Bad', active: true }
    });
    assertHttpStatus(badEmail, 400, 'invalid advisor email');

    const emptyName = await sandboxWorld.staffReq('staff/advisors', {
      method: 'PUT',
      actor: STAFF_ACTORS.manager,
      json: { email: 'valid@khongtunhi.com', name: '   ', active: true }
    });
    assertHttpStatus(emptyName, 400, 'empty advisor name');

    // (c) Unredacted PII (raw email / phone / URL) in PUT staff/guidance examples -> 400
    const gRes = await sandboxWorld.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager });
    const cfg = gRes.json.config;

    for (const piiAnswer of [
      'Liên hệ parent@example.test để biết thêm',
      'Gọi số 0901234567 ngay nhé',
      'Xem tại https://evil.example.com/pay'
    ]) {
      const piiPut = await sandboxWorld.staffReq('staff/guidance', {
        method: 'PUT',
        actor: STAFF_ACTORS.manager,
        json: {
          course_ids: cfg.course_ids,
          duration_presets: cfg.duration_presets,
          policy: cfg.policy,
          examples: [{ question: 'Câu hỏi mẫu?', answer: piiAnswer, hints: [] }],
          bot_enabled: true,
          checkout_enabled: true
        }
      });
      assertHttpStatus(piiPut, 400, `unredacted PII rejected: ${piiAnswer}`);
    }
  });

  // =========================================================================
  // F11 — Inbox Locking, Race Conditions & State Guards (5 tests)
  // =========================================================================

  it('[F11] T2-ZALO-F11-01: Concurrent double-claim race yields strictly one 200 winner and one 409 loser', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);

    const [resAn, resBinh] = await Promise.all([
      sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: {}
      }),
      sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[1],
        authType: 'supabase-jwt',
        json: {}
      })
    ]);

    const outcomes = [
      { email: STAFF_ACTORS.advisors[0].email, status: resAn.status },
      { email: STAFF_ACTORS.advisors[1].email, status: resBinh.status }
    ];
    const winners = outcomes.filter((o) => o.status === 200);
    const losers = outcomes.filter((o) => o.status === 409);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);

    const convRow = await sandboxWorld.db.query(
      'SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convRow.rows[0].status, 'open');
    assert.equal(convRow.rows[0].owner_email, winners[0].email);

    const evRows = await sandboxWorld.db.query(
      "SELECT count(*)::int AS cnt FROM public.ktn_consultation_events WHERE consultation_id = $1 AND kind = 'assigned'",
      [convId]
    );
    assert.equal(evRows.rows[0].cnt, 1);
  });

  it('[F11] T2-ZALO-F11-02: AC01 blocks advisor reading unassigned waiting thread (403) while manager reads safely', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);

    const advRead = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(advRead, 403, 'advisor cannot read unclaimed waiting thread');
    assert.match(advRead.json.message || '', /nhận ca/i);

    const mgrRead = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.manager
    });
    assertHttpStatus(mgrRead, 200, 'manager reads waiting thread');
    assertSafeStaffThreadResponse(mgrRead.json, { isAdmin: true });
  });

  it('[F11] T2-ZALO-F11-03: Rejects claim/assign on closed (409), inactive/unknown target (400), and missing/bad UUID (404)', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { outcome: 'declined' }
    });

    // (a) claim & assign on closed thread -> 409
    const claimClosed = await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claimClosed, 409, 'claim on closed thread');

    const assignClosed = await sandboxWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[0].email }
    });
    assertHttpStatus(assignClosed, 409, 'assign on closed thread');

    // (b) assign to inactive or unknown advisor on open/waiting thread -> 400
    const { convId: openId } = await createWaitingZaloThread(sandboxWorld);
    const assignInactive = await sandboxWorld.staffReq(`staff/thread/${openId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.inactiveAdvisor.email }
    });
    assertHttpStatus(assignInactive, 400, 'assign to inactive advisor');

    const assignUnknown = await sandboxWorld.staffReq(`staff/thread/${openId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: 'nobody@khongtunhi.com' }
    });
    assertHttpStatus(assignUnknown, 400, 'assign to unknown advisor');

    // (c) non-existent valid UUID -> 404
    const missingUuid = crypto.randomUUID();
    const getMissing = await sandboxWorld.staffReq(`staff/thread/${missingUuid}`, { actor: STAFF_ACTORS.manager });
    assertHttpStatus(getMissing, 404, 'GET missing thread UUID');

    const claimMissing = await sandboxWorld.staffReq(`staff/thread/${missingUuid}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claimMissing, 404, 'POST claim missing thread UUID');

    // (d) malformed UUID -> 404
    const badUuid = await sandboxWorld.staffReq('staff/thread/not-a-uuid', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(badUuid, 404, 'GET malformed thread UUID');
  });

  it('[F11] T2-ZALO-F11-04: auto_assign skips non-waiting threads (false) and handles concurrent waiting threads with SKIP LOCKED', async () => {
    // (a) Seed bot, open, and closed threads
    const botRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status)
       VALUES ('zalo_oa', $1, $1, 'bot') RETURNING id`,
      [uniqueUserId('aa-bot')]
    );
    const openRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, owner_email)
       VALUES ('zalo_oa', $1, $1, 'open', $2) RETURNING id`,
      [uniqueUserId('aa-open'), STAFF_ACTORS.advisors[0].email]
    );
    const closedRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status)
       VALUES ('zalo_oa', $1, $1, 'closed') RETURNING id`,
      [uniqueUserId('aa-closed')]
    );

    const callAutoAssign = async (id) => {
      const r = await sandboxWorld.pgliteSupabase.fetch(
        `${sandboxWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_auto_assign`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ p_id: id })
        }
      );
      assert.equal(r.status, 200);
      return r.json();
    };

    assert.equal(await callAutoAssign(botRes.rows[0].id), false);
    assert.equal(await callAutoAssign(openRes.rows[0].id), false);
    assert.equal(await callAutoAssign(closedRes.rows[0].id), false);

    // (b) Concurrent auto_assign on 2 waiting threads
    const { convId: w1 } = await createWaitingZaloThread(sandboxWorld);
    const { convId: w2 } = await createWaitingZaloThread(sandboxWorld);
    const [a1, a2] = await Promise.all([callAutoAssign(w1), callAutoAssign(w2)]);
    assert.equal(a1, true);
    assert.equal(a2, true);

    const assigned = await sandboxWorld.db.query(
      'SELECT id, owner_email, status FROM public.ktn_consultations WHERE id = ANY($1::uuid[])',
      [[w1, w2]]
    );
    assert.ok(assigned.rows.every((r) => r.status === 'open' && r.owner_email));
    assert.notEqual(assigned.rows[0].owner_email, assigned.rows[1].owner_email);
  });

  it('[F11] T2-ZALO-F11-05: Bot vs human claim race rejects late bot RPC (conflict) and cancels queued bot outbox', async () => {
    // Seed a bot-state zalo_oa thread with a customer message and a queued bot message
    const userId = uniqueUserId('bot-race');
    const convRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, last_customer_at)
       VALUES ('zalo_oa', $1, $1, 'bot', now()) RETURNING id`,
      [userId]
    );
    const convId = convRes.rows[0].id;
    const custMsgRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, external_id, delivery)
       VALUES ($1, 'customer', 'Bé nhà mình 7 tuổi', $2, 'sent') RETURNING id`,
      [convId, `zalo:${uniqueMsgId('brc')}`]
    );
    const afterId = custMsgRes.rows[0].id;
    const queuedBotRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'bot', 'Tin nhắn bot đang chờ gửi', 'queued') RETURNING id`,
      [convId]
    );
    const queuedBotId = queuedBotRes.rows[0].id;

    // Advisor claims the thread before late bot RPC executes
    const claimRes = await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claimRes, 200);

    // Queued bot message is marked failed
    const cancelledRow = await sandboxWorld.db.query(
      'SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE id = $1',
      [queuedBotId]
    );
    assert.equal(cancelledRow.rows[0].delivery, 'failed');
    assert.equal(cancelledRow.rows[0].delivery_note, 'Đã chuyển cho tư vấn viên');

    // Late in-flight bot action RPC hits conflict
    const botRpcRes = await sandboxWorld.pgliteSupabase.fetch(
      `${sandboxWorld.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_id: convId,
          p_action: 'bot',
          p_actor: null,
          p_admin: false,
          p_payload: { after_id: afterId, body: 'Phản hồi bot đến trễ' }
        })
      }
    );
    assert.equal(botRpcRes.status, 200);
    assert.deepEqual(await botRpcRes.json(), { error: 'conflict' });
  });

  // =========================================================================
  // F12 — Operational Validation, Channel Windows & Outbox Cleanup (5 tests)
  // =========================================================================

  it('[F12] T2-ZALO-F12-01: Reply rejects missing/non-UUID request_id (400), blank body (400), and deduplicates replays', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const missingReqId = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Hello' }
    });
    assertHttpStatus(missingReqId, 400, 'missing request_id');

    const badReqId = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Hello', request_id: 'not-a-uuid' }
    });
    assertHttpStatus(badReqId, 400, 'non-UUID request_id');

    const blankBody = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: '   \n\t  ', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(blankBody, 400, 'whitespace-only reply body');

    // Replay same request_id twice -> single DB row
    const replayId = crypto.randomUUID();
    const r1 = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Phản hồi gửi một lần duy nhất.', request_id: replayId }
    });
    const r2 = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Phản hồi gửi một lần duy nhất.', request_id: replayId }
    });
    assertHttpStatus(r1, 200);
    assertHttpStatus(r2, 200);

    const cnt = await sandboxWorld.db.query(
      "SELECT count(*)::int AS cnt FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor'",
      [convId]
    );
    assert.equal(cnt.rows[0].cnt, 1, 'Replaying reply with the same request_id must not create a duplicate advisor message');
  });

  it('[F12] T2-ZALO-F12-02: Forbids reply and follow_up on closed or bot threads (409)', async () => {
    // (a) Bot thread -> manager reply -> 409
    const botRes = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mbot'), userId: uniqueUserId('st-bot'), text: 'MENU_ROOT' }),
      { sign: false, sandbox: true }
    );
    const botConvId = botRes.json.consultation_id;
    const replyBot = await sandboxWorld.staffReq(`staff/thread/${botConvId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { body: 'Reply on bot thread', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(replyBot, 409, 'reply on bot thread');

    // (b) Closed thread -> reply & follow_up -> 409
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { outcome: 'registered' }
    });

    const replyClosed = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Reply on closed thread', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(replyClosed, 409, 'reply on closed thread');

    const followUpClosed = await sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { at: new Date(Date.now() + 3600_000).toISOString() }
    });
    assertHttpStatus(followUpClosed, 409, 'follow_up on closed thread');
  });

  it('[F12] T2-ZALO-F12-03: Rejects empty note, invalid follow_up timestamp, and invalid close outcome (400)', async () => {
    const { convId } = await createWaitingZaloThread(sandboxWorld);
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const emptyNote = await sandboxWorld.staffReq(`staff/thread/${convId}/note`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: '   ' }
    });
    assertHttpStatus(emptyNote, 400, 'blank internal note');

    const badFollowUp = await sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { at: 'not-a-valid-date' }
    });
    assertHttpStatus(badFollowUp, 400, 'invalid follow_up timestamp');

    const badOutcome1 = await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { outcome: 'won' }
    });
    assertHttpStatus(badOutcome1, 400, 'unknown close outcome');

    const badOutcome2 = await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { outcome: '' }
    });
    assertHttpStatus(badOutcome2, 400, 'empty close outcome');

    const convRow = await sandboxWorld.db.query(
      'SELECT status, outcome, follow_up_at FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convRow.rows[0].status, 'open');
    assert.equal(convRow.rows[0].outcome, null);
    assert.equal(convRow.rows[0].follow_up_at, null);
  });

  it('[F12] T2-ZALO-F12-04: Enforces 24h window cutoff on Messenger (409 window_closed) while allowing Zalo OA >24h (200)', async () => {
    const metaConv = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, status, owner_email, last_customer_at)
       VALUES ('messenger', '1000000000999', 'open', $1, now() - interval '25 hours') RETURNING id`,
      [STAFF_ACTORS.advisors[0].email]
    );
    const metaId = metaConv.rows[0].id;

    const zaloConv = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, owner_email, last_customer_at)
       VALUES ('zalo_oa', $1, $1, 'open', $2, now() - interval '25 hours') RETURNING id`,
      [uniqueUserId('win25h'), STAFF_ACTORS.advisors[0].email]
    );
    const zaloId = zaloConv.rows[0].id;

    const metaReply = await sandboxWorld.staffReq(`staff/thread/${metaId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Trả lời quá 24h trên Messenger', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(metaReply, 409, 'Messenger >24h window_closed');

    const zaloReply = await sandboxWorld.staffReq(`staff/thread/${zaloId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Trả lời trên Zalo OA sau 25 giờ', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(zaloReply, 200, 'Zalo OA >24h allowed');

    const zMsg = await sandboxWorld.db.query(
      "SELECT delivery FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor'",
      [zaloId]
    );
    assert.equal(zMsg.rows[0].delivery, 'sent');
  });

  it('[F12] T2-ZALO-F12-05: Closing thread cancels queued bot outbox and unknown thread operations return 400', async () => {
    const convRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, owner_email, last_customer_at)
       VALUES ('zalo_oa', $1, $1, 'open', $2, now()) RETURNING id`,
      [uniqueUserId('cls-bot'), STAFF_ACTORS.advisors[0].email]
    );
    const convId = convRes.rows[0].id;

    const botMsgRes = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'bot', 'Tin nhắn bot còn tồn đọng', 'queued') RETURNING id`,
      [convId]
    );
    const botMsgId = botMsgRes.rows[0].id;

    const closeRes = await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { outcome: 'other' }
    });
    assertHttpStatus(closeRes, 200);

    const botCheck = await sandboxWorld.db.query(
      'SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE id = $1',
      [botMsgId]
    );
    assert.equal(botCheck.rows[0].delivery, 'failed');
    assert.equal(botCheck.rows[0].delivery_note, 'Đã đóng ca');

    const unknownOp = await sandboxWorld.staffReq(`staff/thread/${convId}/unknown_op`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: {}
    });
    assertHttpStatus(unknownOp, 400, 'unknown thread operation');
  });
});
