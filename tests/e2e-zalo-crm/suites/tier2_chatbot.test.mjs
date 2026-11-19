import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { isAdultTutoringRequest } from '../../../consultation-retrieval.mjs';
import { draftConsultationExamples, draftConsultationPolicy } from '../../../consultation-examples.mjs';
import {
  assertHttpStatus,
  assertNoForbiddenAiText,
  assertNoSecretLeaks,
  assertPiiRedacted,
  assertSafeCustomerThreadResponse
} from '../harness/assertions.mjs';
import {
  ADULT_1_1_FIXTURES,
  CA_TRANSCRIPTS,
  DEFAULT_COURSE_IDS,
  DEFAULT_DURATION_PRESETS,
  GUARDRAIL_CORPUS,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import { createTestWorld } from '../harness/worker-client.mjs';

function makeSyntheticRedactedExamples(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      question: `Phụ huynh hỏi trường hợp giới hạn số ${i + 1}?`,
      hints: [`giới hạn ${i + 1}`],
      answer: `Hỏi độ tuổi và mục tiêu rồi chuyển tư vấn viên nếu cần kiểm tra lịch số ${i + 1}.`
    });
  }
  return out;
}

describe('Tier 2 — F06 Scripted / Menu Boundary & Fault Tests', () => {
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

  it('T2-F06-01: MENU_NEED_PHONE rejects invalid VN phones cleanly without saving customer_phone or clearing menu_state', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);

    const enterNeedPhone = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Để lại nhu cầu & SĐT', menuCommand: 'MENU_NEED_PHONE' }
    });
    assertHttpStatus(enterNeedPhone, 200, 'web/message enter MENU_NEED_PHONE');

    for (const badPhone of LEARNERS_AND_PARENTS.invalidPhones) {
      const res = await world.request('/api/ktn/consultations/web/message', {
        method: 'POST',
        token: start.token,
        json: {
          requestId: crypto.randomUUID(),
          body: `SĐT của chị là ${badPhone}`,
          lead: { phone: badPhone }
        }
      });
      assertHttpStatus(res, 200, `Invalid phone ${badPhone} must not crash`);
    }

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.leadMeta.menu_state, 'MENU_NEED_PHONE');
    const lastBot = thread.json.messages.filter((m) => m.sender === 'bot').at(-1);
    assert.match(lastBot.body, /chưa đúng định dạng Việt Nam/i);

    const webDb = (
      await world.db.query(
        `SELECT customer_phone, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    assert.equal(webDb.customer_phone, null);
    assert.equal(webDb.lead_meta.menu_state, 'MENU_NEED_PHONE');

    // Also verify invalid numeric phone text on Zalo OA
    const zMenu = await world.postZaloEvent(
      makeZaloTextEvent({ msgId: 'z_t2_f06_01_a', userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId, text: 'MENU_NEED_PHONE' }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zMenu, 200, 'Zalo MENU_NEED_PHONE');
    const zBad = await world.postZaloEvent(
      makeZaloTextEvent({ msgId: 'z_t2_f06_01_b', userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId, text: '0123456789' }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zBad, 200);
    const zDb = (
      await world.db.query(`SELECT customer_phone, lead_meta FROM public.ktn_consultations WHERE id = $1`, [
        zBad.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zDb.customer_phone, null);
    assert.equal(zDb.lead_meta.menu_state, 'MENU_NEED_PHONE');
  });

  it('T2-F06-02: MENU_FAQ tuition & MENU_PAYMENT with empty catalog and null bank_id degrade safely without 500 or fabricated numbers', async () => {
    await world.db.query(`UPDATE public.ktn_consultation_guidance SET course_ids = '{}'::text[] WHERE id = 'default'`);
    await world.db.query(`UPDATE public.ktn_payment_config SET bank_id = '' WHERE id = 'default'`);

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);

    const faqRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Học phí & Ưu đãi' }
    });
    assertHttpStatus(faqRes, 200);

    const payRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Hướng dẫn thanh toán VietQR', menuCommand: 'MENU_PAYMENT' }
    });
    assertHttpStatus(payRes, 200);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    const botMsgs = thread.json.messages.filter((m) => m.sender === 'bot');
    assert.equal(botMsgs.length, 2);
    for (const msg of botMsgs) {
      assert.equal(/\d+\.\d{3}\s*₫/.test(msg.body), false, 'Must not fabricate prices');
      assert.equal(/\d{6,}/.test(msg.body), false, 'Must not fabricate bank account digits');
    }
  });

  it('T2-F06-03: Unknown menuCommand (MENU_INVALID_999 / __proto__) is ignored safely without prototype pollution', async () => {
    world.mocks.setFaults({
      geminiResponse: {
        reply: 'Bé nhà chị đã từng nghe hoặc nhắc lại câu tiếng Trung nào chưa ạ?',
        course_id: '',
        handoff: false
      }
    });

    const start = await world.startWebChat();
    const res1 = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Bé 7 tuổi chưa học gì', menuCommand: 'MENU_INVALID_999' }
    });
    assertHttpStatus(res1, 200);

    const res2 = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Bé muốn luyện nghe nói', menuCommand: '__proto__' }
    });
    assertHttpStatus(res2, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'handled'), false);
    assert.equal(({}).handled, undefined);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'bot');
    assert.ok(thread.json.messages.some((m) => m.sender === 'bot'));
  });

  it('T2-F06-04: All 4 scripted menus succeed deterministically even in AI sandbox or when Gemini returns 500', async () => {
    const sbWorld = await createTestWorld({ mode: 'sandbox' });
    try {
      const start = await sbWorld.startWebChat();
      for (const cmd of ['MENU_ROOT', 'MENU_FAQ', 'MENU_PAYMENT', 'MENU_HANDOFF']) {
        const res = await sbWorld.request('/api/ktn/consultations/web/message', {
          method: 'POST',
          token: start.token,
          json: { requestId: crypto.randomUUID(), body: cmd, menuCommand: cmd }
        });
        assertHttpStatus(res, 200);
      }
      assert.equal(sbWorld.mocks.upstreamCalls.gemini.length, 0);
      const thread = await sbWorld.request('/api/ktn/consultations/web/thread', { token: start.token });
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.messages.filter((m) => m.sender === 'bot').length, 3);
      assert.equal(thread.json.messages.filter((m) => m.sender === 'system').length, 1);
    } finally {
      await sbWorld.close();
    }

    // Also verify when live Gemini keys exist but Gemini is returning HTTP 500
    world.mocks.setFaults({ geminiStatus: 500 });
    const startLive = await world.startWebChat();
    for (const cmd of ['MENU_ROOT', 'MENU_FAQ', 'MENU_PAYMENT']) {
      const r = await world.request('/api/ktn/consultations/web/message', {
        method: 'POST',
        token: startLive.token,
        json: { requestId: crypto.randomUUID(), body: cmd, menuCommand: cmd }
      });
      assertHttpStatus(r, 200);
    }
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T2-F06-05: Menu commands sent on advisor-owned open thread do not trigger bot replies or alter ownership', async () => {
    await world.db.query(`UPDATE public.ktn_advisors SET active = false`);
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const handoffReq = await world.sendWebMessage(start.token, 'Gặp tư vấn viên');
    assertHttpStatus(handoffReq, 200);
    const webRow = (
      await world.db.query(`SELECT id, status FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0];
    assert.equal(webRow.status, 'waiting');

    await world.db.query(`UPDATE public.ktn_advisors SET active = true WHERE email = $1`, [STAFF_ACTORS.advisors[0].email]);
    const claimRes = await world.staffReq(`staff/thread/${webRow.id}/claim`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      method: 'POST',
      json: {}
    });
    assertHttpStatus(claimRes, 200);

    const mRootRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'MENU_ROOT', menuCommand: 'MENU_ROOT' }
    });
    assertHttpStatus(mRootRes, 200);
    const mPayRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Hướng dẫn thanh toán VietQR', menuCommand: 'MENU_PAYMENT' }
    });
    assertHttpStatus(mPayRes, 200);

    const afterConv = (await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [webRow.id])).rows[0];
    assert.equal(afterConv.status, 'open');
    assert.equal(afterConv.owner_email, STAFF_ACTORS.advisors[0].email);
    const botMsgs = await world.db.query(
      `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
      [webRow.id]
    );
    assert.equal(botMsgs.rows.length, 0);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T2-F06-06: Zalo OA outbox failure sets delivery=failed with delivery_note while FAQ adult reply passes guardrail check', async () => {
    world.mocks.setFaults({ failZaloSend: true });

    const zRoot = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f06_06_a',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'MENU_ROOT'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRoot, 200);
    assert.equal(zRoot.json.ok, true);

    const failedMsg = (
      await world.db.query(
        `SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
        [zRoot.json.consultation_id]
      )
    ).rows[0];
    assert.equal(failedMsg.delivery, 'failed');
    assert.ok(failedMsg.delivery_note && failedMsg.delivery_note.length > 0);

    world.mocks.clearFaults();
    const zFaq = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f06_06_b',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Tiếng Trung người đi làm 1:1'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zFaq, 200);
    const faqMsg = (
      await world.db.query(
        `SELECT body, delivery FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot' ORDER BY created_at DESC LIMIT 1`,
        [zRoot.json.consultation_id]
      )
    ).rows[0];
    assert.equal(faqMsg.delivery, 'sent');
    assertNoForbiddenAiText(faqMsg.body);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });
});

describe('Tier 2 — F07 AI Outage, Concurrency, Schema, PII & Payload Boundaries', () => {
  let world;

  before(async () => {
    world = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_GEMINI_KEYS: 'k1,k2' }
    });
  });

  beforeEach(async () => {
    await world.reset();
  });

  after(async () => {
    await world?.close();
  });

  it('T2-F07-01: Total Gemini outage (all keys 429 then 503) falls back silently to human handoff with 0 secret leaks', async () => {
    world.mocks.setFaults({ geminiStatus: 429 });
    const start = await world.startWebChat();
    const resWeb = await world.sendWebMessage(start.token, 'Bé 7 tuổi muốn học giao tiếp');
    assertHttpStatus(resWeb, 200);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'open');
    const sysWeb = thread.json.messages.find((m) => m.sender === 'system');
    assert.equal(sysWeb?.body, 'Mình đã chuyển câu hỏi cho tư vấn viên KTN.');
    assertNoSecretLeaks(thread.json);

    world.mocks.setFaults({ geminiStatus: 503 });
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f07_01',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: 'Bé 8 tuổi muốn học giao tiếp'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const zConv = (
      await world.db.query(`SELECT status FROM public.ktn_consultations WHERE id = $1`, [zRes.json.consultation_id])
    ).rows[0];
    assert.equal(zConv.status, 'open');
    assertNoSecretLeaks(zRes.json);
  });

  it('T2-F07-02: Invalid AI output (empty reply, array schema, unknown course_id) is discarded and handed off cleanly', async () => {
    for (const badResp of [{ reply: '' }, () => [], { reply: 'Khóa này hay lắm ạ.', course_id: 'NON_EXISTENT_ID', handoff: false }]) {
      await world.reset();
      world.mocks.setFaults({ geminiResponse: badResp });
      const start = await world.startWebChat();
      const res = await world.sendWebMessage(start.token, 'Bé 7 tuổi muốn học tiếng Trung');
      assertHttpStatus(res, 200);

      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.messages.some((m) => m.body.includes('NON_EXISTENT_ID')), false);
      assert.equal(thread.json.messages.some((m) => m.body.includes('Khóa này hay lắm ạ.')), false);
      assert.equal(thread.json.messages.find((m) => m.sender === 'system')?.body, 'Mình đã chuyển câu hỏi cho tư vấn viên KTN.');
    }
  });

  it('T2-F07-03: Advisor claim concurrency blocks stale bot action (conflict) and marks queued Zalo bot msgs failed', async () => {
    // Part A: Claimed open thread rejects subsequent bot action with conflict
    const start = await world.startWebChat();
    const convWeb = (
      await world.db.query(`SELECT id FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0];
    const custRes = await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_id: convWeb.id,
        p_action: 'customer',
        p_actor: null,
        p_admin: false,
        p_payload: { body: 'Bé 7 tuổi muốn học' }
      })
    });
    const m1 = (await custRes.json()).message;

    const claimRes = await world.staffReq(`staff/thread/${convWeb.id}/claim`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      method: 'POST',
      json: {}
    });
    assertHttpStatus(claimRes, 200);

    const lateBot = await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_id: convWeb.id,
        p_action: 'bot',
        p_actor: null,
        p_admin: false,
        p_payload: { after_id: m1.id, body: 'Bot late reply' }
      })
    });
    assert.equal((await lateBot.json()).error, 'conflict');

    // Verify via Worker HTTP that advisor.an's claim keeps status='open', owner_email=advisor.an.email, with no bot reply
    world.mocks.clearUpstreamCalls();
    world.mocks.setFaults({
      geminiResponse: { reply: 'Bot reply after claim must not run', course_id: '', handoff: false }
    });
    const postClaimWebMsg = await world.sendWebMessage(start.token, 'Bé 7 tuổi cần tư vấn thêm sau khi nhận ca');
    assertHttpStatus(postClaimWebMsg, 200, 'web/message after advisor claim');
    const postClaimThread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(postClaimThread, 200);
    assert.equal(postClaimThread.json.status, 'open');
    assert.equal(postClaimThread.json.messages.filter((m) => m.sender === 'bot').length, 0);
    const postClaimRow = (
      await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [convWeb.id])
    ).rows[0];
    assert.equal(postClaimRow.status, 'open');
    assert.equal(postClaimRow.owner_email, STAFF_ACTORS.advisors[0].email);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);

    // Part B: Stale after_id on bot thread also returns conflict
    const start2 = await world.startWebChat();
    const conv2 = (
      await world.db.query(`SELECT id FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0];
    const c1 = await (
      await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: conv2.id, p_action: 'customer', p_payload: { body: 'Tin 1' } })
      })
    ).json();
    await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_id: conv2.id, p_action: 'customer', p_payload: { body: 'Tin 2' } })
    });
    const staleBot = await (
      await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ p_id: conv2.id, p_action: 'bot', p_payload: { after_id: c1.message.id, body: 'Stale reply' } })
      })
    ).json();
    assert.equal(staleBot.error, 'conflict');

    // Part C: Claim on Zalo OA thread marks queued bot messages delivery='failed'
    const zUpsert = await (
      await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_upsert_zalo_inbound`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          p_event_id: 'zevt_race_01',
          p_event_name: 'user_send_text',
          p_zalo_user_id: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
          p_payload: { body: 'Xin chào' }
        })
      })
    ).json();
    await world.pgliteSupabase.fetch(`${world.env.SUPABASE_URL}/rest/v1/rpc/ktn_consultation_action`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        p_id: zUpsert.conversation.id,
        p_action: 'bot',
        p_payload: { after_id: zUpsert.message.id, body: 'Queued bot message' }
      })
    });
    const claimZalo = await world.staffReq(`staff/thread/${zUpsert.conversation.id}/claim`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      method: 'POST',
      json: {}
    });
    assertHttpStatus(claimZalo, 200);
    const queuedCheck = (
      await world.db.query(
        `SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
        [zUpsert.conversation.id]
      )
    ).rows[0];
    assert.equal(queuedCheck.delivery, 'failed');
    assert.equal(queuedCheck.delivery_note, 'Đã chuyển cho tư vấn viên');
  });

  it('T2-F07-04: Multi-turn PII in both history and current message is redacted before Gemini fetch', async () => {
    world.mocks.setFaults({
      geminiResponse: {
        reply: 'Bé nhà chị mấy tuổi rồi ạ?',
        course_id: '',
        handoff: false
      }
    });
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const piiRes1 = await world.sendWebMessage(start.token, '+84 912-345-678 parent@khongtunhi.test http://demo.local/x');
    assertHttpStatus(piiRes1, 200, 'web/message multi-turn PII turn 1');
    const piiRes2 = await world.sendWebMessage(start.token, '0909.123.456 www.ktn-example.vn/pay');
    assertHttpStatus(piiRes2, 200, 'web/message multi-turn PII turn 2');

    const lastPayload = JSON.stringify(world.mocks.upstreamCalls.gemini.at(-1).body.contents);
    assertPiiRedacted(
      lastPayload,
      ['+84 912-345-678', 'parent@khongtunhi.test', 'http://demo.local/x', '0909.123.456', 'www.ktn-example.vn/pay'],
      'Multi-turn Gemini payload'
    );
  });

  it('T2-F07-05: Empty body -> 400, >16KB body -> 413, and Zalo image attachment-only -> handoff with 0 Gemini calls', async () => {
    const start = await world.startWebChat();

    const emptyRes = await world.sendWebMessage(start.token, '');
    assertHttpStatus(emptyRes, 400, 'Empty body');

    const spaceRes = await world.sendWebMessage(start.token, '   ');
    assertHttpStatus(spaceRes, 400, 'Whitespace body');

    const oversizedRes = await world.sendWebMessage(start.token, 'A'.repeat(16500));
    assertHttpStatus(oversizedRes, 413, 'Oversized >16KB body');

    const zImg = await world.postZaloEvent(
      {
        app_id: world.env.KTN_ZALO_APP_ID,
        oa_id: world.env.KTN_ZALO_OA_ID,
        event_name: 'user_send_image',
        timestamp: String(Date.now()),
        sender: { id: LEARNERS_AND_PARENTS.parentMinh.zaloUserId },
        recipient: { id: world.env.KTN_ZALO_OA_ID },
        message: { msg_id: 'z_img_01', attachments: [{ type: 'image', payload: { url: 'https://img.example.test/receipt.jpg' } }] }
      },
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zImg, 200);
    const zRow = (
      await world.db.query(`SELECT status FROM public.ktn_consultations WHERE id = $1`, [zImg.json.consultation_id])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T2-F07-06: Empty guidance.course_ids or invalid KTN_GEMINI_MODEL hands off cleanly without calling Gemini or returning 502', async () => {
    await world.db.query(`UPDATE public.ktn_consultation_guidance SET course_ids = '{}'::text[] WHERE id = 'default'`);
    const start = await world.startWebChat();
    const res1 = await world.sendWebMessage(start.token, 'Bé 7 tuổi');
    assertHttpStatus(res1, 200);
    const t1 = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assert.equal(t1.json.status, 'open');
    assert.equal(t1.json.messages.find((m) => m.sender === 'system')?.body, 'Mình đã chuyển câu hỏi cho tư vấn viên KTN.');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);

    const badModelWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_GEMINI_MODEL: 'bad model!' }
    });
    try {
      const s2 = await badModelWorld.startWebChat();
      const res2 = await badModelWorld.sendWebMessage(s2.token, 'Bé 7 tuổi muốn học');
      assertHttpStatus(res2, 200);
      const t2 = await badModelWorld.request('/api/ktn/consultations/web/thread', { token: s2.token });
      assert.equal(t2.json.status, 'open');
      assert.equal(badModelWorld.mocks.upstreamCalls.gemini.length, 0);
    } finally {
      await badModelWorld.close();
    }
  });
});

describe('Tier 2 — F08 Hard Guardrails & Negative Output Enforcement', () => {
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

  it('T2-F08-01: AI hallucinated price or discount is rejected on Web & Zalo OA and thread hands off', async () => {
    const hallucinations = ['Giá chỉ 500k hôm nay thôi ạ', 'Khóa 963k giảm 20%', 'Ưu đãi voucher miễn phí'];
    for (const bad of hallucinations) {
      await world.reset();
      world.mocks.setFaults({ geminiResponse: { reply: bad, course_id: '', handoff: false } });

      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const webMsgRes = await world.sendWebMessage(start.token, 'Bé 7 tuổi muốn học giao tiếp');
      assertHttpStatus(webMsgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assertSafeCustomerThreadResponse(thread.json);
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.messages.some((m) => m.body.includes(bad)), false);
    }

    await world.reset();
    world.mocks.setFaults({ geminiResponse: { reply: 'Giá chỉ 500k hôm nay thôi ạ', course_id: '', handoff: false } });
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({ msgId: 'z_t2_f08_01', userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId, text: 'Bé 7 tuổi muốn học' }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const zConv = (
      await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.ok(zConv, 'Zalo OA consultation row must exist');
    assert.equal(zConv.status, 'open');
    assert.ok(zConv.owner_email, 'Zalo OA thread must be assigned to an advisor on handoff');
    const zMsgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    assert.ok(zMsgs.rows.some((m) => m.sender === 'system'), 'Expected system handoff message on Zalo OA');
    assert.equal(zMsgs.rows.some((m) => /500k|giảm/i.test(m.body)), false);
    for (const m of zMsgs.rows.filter((msg) => msg.sender !== 'customer')) {
      assertNoForbiddenAiText(m.body, 'Zalo guardrail handoff reply');
    }
  });

  it('T2-F08-02: AI hallucinated URL or bank account digits are rejected and handed off', async () => {
    for (const bad of ['Vào https://fake-ktn.example.com đóng tiền', 'Chuyển khoản STK MB 1234567890']) {
      await world.reset();
      world.mocks.setFaults({ geminiResponse: { reply: bad, course_id: '', handoff: false } });

      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, 'Bé 7 tuổi muốn học');
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.messages.some((m) => m.body.includes('fake-ktn.example.com') || m.body.includes('1234567890')), false);
    }
  });

  it('T2-F08-03: Child live 1:1 (CA 05) and Zoom trial requests force mandatory handoff with 0 Gemini calls', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const msgRes = await world.sendWebMessage(start.token, CA_TRANSCRIPTS.CA05.turns[0].text);
    assertHttpStatus(msgRes, 200);
    const tWeb = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(tWeb, 200);
    assert.equal(tWeb.json.status, 'open');
    assert.equal(tWeb.json.leadMeta.flow, 'parent_child');

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f08_03',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: 'Cho bé học thử với cô qua Zoom được không?'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const zRow = (
      await world.db.query(`SELECT status, lead_meta FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(zRow.lead_meta.flow, 'parent_child');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T2-F08-04: AI emitting unverified adult marketing claims is blocked and handed off', async () => {
    for (const claim of ADULT_1_1_FIXTURES.unverifiedClaims) {
      await world.reset();
      world.mocks.setFaults({ geminiResponse: { reply: `Cam kết ${claim} cho học viên ạ.`, course_id: '', handoff: false } });

      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, 'Bé 7 tuổi muốn học');
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.messages.some((m) => m.body.includes(claim)), false);
    }
  });

  it('T2-F08-05: Payment errors, refund complaints, and VAT/installment triggers force immediate handoff with 0 Gemini calls', async () => {
    const triggers = [
      'Chị chuyển tiền rồi mà chưa thấy mở video',
      'Muốn hoàn tiền và khiếu nại',
      'Xuất hóa đơn VAT trả góp'
    ];
    for (const text of triggers) {
      await world.reset();
      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, text);
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      const sys = thread.json.messages.find((m) => m.sender === 'system');
      assert.ok(sys);
      assertNoForbiddenAiText(sys.body);
      assert.equal(/đồng ý hoàn|duyệt trả góp|đã mở khóa/i.test(sys.body), false);
    }

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f08_05',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Chị chuyển tiền rồi mà chưa thấy mở video'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T2-F08-06: Multi-vector prompt injection inputs refuse and hand off on Web & Zalo OA without secret/price leaks', async () => {
    for (const inj of GUARDRAIL_CORPUS.promptInjectionInputs) {
      await world.reset();
      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, inj);
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      assertNoSecretLeaks(thread.json);
      for (const m of thread.json.messages.filter((msg) => msg.sender !== 'customer')) {
        assertNoForbiddenAiText(m.body);
      }
      assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
    }

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f08_06',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: GUARDRAIL_CORPUS.promptInjectionInputs[1]
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
    const zConv = (
      await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.ok(zConv, 'Zalo OA consultation row must exist');
    assert.equal(zConv.status, 'open');
    assert.ok(zConv.owner_email, 'Zalo OA prompt injection thread must be assigned to an advisor');
    const zMsgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    assert.ok(
      zMsgs.rows.some((m) => m.sender === 'system' && /chuyển|tư vấn viên|nội bộ/i.test(m.body)),
      'Expected system handoff/refusal message on Zalo OA'
    );
    for (const m of zMsgs.rows.filter((msg) => msg.sender !== 'customer')) {
      assertNoForbiddenAiText(m.body, 'Zalo prompt injection reply');
    }
    assertNoSecretLeaks(zMsgs.rows);
  });
});

describe('Tier 2 — F09 Knowledge Base Validation, RBAC & Mode Guardrails', () => {
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

  it('T2-F09-01: PUT staff/guidance rejects unredacted email, VN phone, or URL in question, answer, or hints (400)', async () => {
    const base = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
    const piiPayloads = [
      { question: 'Liên hệ parent@example.test giúp chị?', answer: 'Câu trả lời sạch.', hints: ['hỏi'] },
      { question: 'Câu hỏi sạch?', answer: 'Gọi 0901234567 để hỏi thêm.', hints: ['sđt'] },
      { question: 'Câu hỏi sạch?', answer: 'Câu trả lời sạch.', hints: ['https://example.test/leak'] }
    ];
    for (const badEx of piiPayloads) {
      const res = await world.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { ...base, examples: [badEx, ...base.examples.slice(1)] }
      });
      assertHttpStatus(res, 400, 'Unredacted PII in guidance example');
    }
    const after = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
    assert.equal(after.examples.length, base.examples.length);
  });

  it('T2-F09-02: PUT staff/guidance rejects >120 examples and empty question/answer (400)', async () => {
    const base = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
    const tooMany = [...draftConsultationExamples, ...makeSyntheticRedactedExamples(49)];
    assert.equal(tooMany.length, 121);

    const res121 = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: { ...base, examples: tooMany }
    });
    assertHttpStatus(res121, 400, '121 examples');

    const resEmpty = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: { ...base, examples: [{ question: '', answer: 'Có câu trả lời', hints: [] }] }
    });
    assertHttpStatus(resEmpty, 400, 'Empty example question');

    const dbCount = (
      await world.db.query(`SELECT jsonb_array_length(examples) AS cnt FROM public.ktn_consultation_guidance WHERE id = 'default'`)
    ).rows[0].cnt;
    assert.ok(dbCount <= 120);
  });

  it('T2-F09-03: PUT staff/guidance rejects >10 course_ids, nonexistent course_id, invalid duration_preset, and bad chars (400)', async () => {
    const beforeRow = (
      await world.db.query(
        `SELECT policy, examples, course_ids, duration_presets, bot_enabled, checkout_enabled FROM public.ktn_consultation_guidance WHERE id = 'default'`
      )
    ).rows[0];
    const base = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;

    // (a) 11 course_ids (>10)
    const elevenIds = [...DEFAULT_COURSE_IDS, 'BUNDLE_YCT_ALL'];
    const res11 = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        ...base,
        course_ids: elevenIds,
        duration_presets: { ...DEFAULT_DURATION_PRESETS, BUNDLE_YCT_ALL: '3m' }
      }
    });
    assertHttpStatus(res11, 400, '11 course_ids');

    // (b) Nonexistent course_id
    const resMissing = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        ...base,
        course_ids: ['MISSING_COURSE_999'],
        duration_presets: { MISSING_COURSE_999: '3m' }
      }
    });
    assertHttpStatus(resMissing, 400, 'Nonexistent course_id');

    // (c) Invalid duration_preset '6m'
    const resDur = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        ...base,
        course_ids: [DEFAULT_COURSE_IDS[0]],
        duration_presets: { [DEFAULT_COURSE_IDS[0]]: '6m' }
      }
    });
    assertHttpStatus(resDur, 400, 'Invalid duration preset');

    // (d) Bad chars '../etc'
    const resBadChars = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        ...base,
        course_ids: ['../etc'],
        duration_presets: { '../etc': '3m' }
      }
    });
    assertHttpStatus(resBadChars, 400, 'Bad course_id chars');

    const afterRow = (
      await world.db.query(
        `SELECT policy, examples, course_ids, duration_presets, bot_enabled, checkout_enabled FROM public.ktn_consultation_guidance WHERE id = 'default'`
      )
    ).rows[0];
    assert.deepEqual(afterRow, beforeRow, 'ktn_consultation_guidance row must remain unchanged after rejected PUTs');
  });

  it('T2-F09-04: Pilot web mode rejects enabling bot_enabled or checkout_enabled with 409', async () => {
    const pilotWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_CONSULTATION_MODE: 'web' }
    });
    try {
      const r1 = await pilotWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { policy: draftConsultationPolicy, examples: draftConsultationExamples, bot_enabled: true }
      });
      assertHttpStatus(r1, 409, 'bot_enabled in pilot web');

      const r2 = await pilotWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { policy: draftConsultationPolicy, examples: draftConsultationExamples, checkout_enabled: true }
      });
      assertHttpStatus(r2, 409, 'checkout_enabled in pilot web');
    } finally {
      await pilotWorld.close();
    }
  });

  it('T2-F09-05: Non-manager advisor (Supabase JWT & non-admin KTN session) receives 403 on all guidance endpoints', async () => {
    const adv = STAFF_ACTORS.advisors[0];
    for (const authType of ['supabase-jwt', 'ktn-session']) {
      const rDraft = await world.staffReq('staff/guidance/draft', { actor: adv, authType });
      assertHttpStatus(rDraft, 403, `advisor ${authType} guidance/draft`);

      const rGet = await world.staffReq('staff/guidance', { actor: adv, authType });
      assertHttpStatus(rGet, 403, `advisor ${authType} GET guidance`);

      const rPut = await world.staffReq('staff/guidance', {
        actor: adv,
        authType,
        method: 'PUT',
        json: { policy: 'Override', examples: [] }
      });
      assertHttpStatus(rPut, 403, `advisor ${authType} PUT guidance`);
    }
  });

  it('T2-F09-06: Cannot enable bot_enabled without Gemini/AI sandbox or checkout_enabled without SePay config (400)', async () => {
    const unconfiguredWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: {
        KTN_GEMINI_KEYS: '',
        KTN_AI_SANDBOX: 'false',
        KTN_SEPAY_API_KEY: ''
      }
    });
    try {
      const base = (await unconfiguredWorld.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;

      const rBot = await unconfiguredWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { ...base, bot_enabled: true, checkout_enabled: false }
      });
      assertHttpStatus(rBot, 400, 'bot_enabled without Gemini or AI sandbox');

      const rPay = await unconfiguredWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { ...base, bot_enabled: false, checkout_enabled: true }
      });
      assertHttpStatus(rPay, 400, 'checkout_enabled without SePay key');
    } finally {
      await unconfiguredWorld.close();
    }
  });
});

describe('Tier 2 — F10 Adult 1:1 Exclusions, Claims & Boundary Cases', () => {
  let world;

  before(async () => {
    world = await createTestWorld({ mode: 'sandbox' });
  });

  beforeEach(async () => {
    await world.reset();
  });

  after(async () => {
    await world?.close();
  });

  it('T2-F10-01: CA 05 child 1:1 ("Con chị 8 tuổi cần lớp 1 kèm 1.") routes to parent_child flow without adult_1_1 metadata', async () => {
    const input = CA_TRANSCRIPTS.CA05.turns[0].text;
    assert.equal(isAdultTutoringRequest(input), false);

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const webMsgRes = await world.sendWebMessage(start.token, input);
    assertHttpStatus(webMsgRes, 200);
    const webRow = (
      await world.db.query(
        `SELECT id, status, source_tag, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    assert.equal(webRow.status, 'open');
    assert.equal(webRow.lead_meta.flow, 'parent_child');
    assert.equal(webRow.lead_meta.target_group, 'parent_child');
    assert.equal(webRow.lead_meta.child_age, 8);
    assert.equal(webRow.lead_meta.ad_package, undefined);
    assert.equal(/^ad_/.test(webRow.source_tag || ''), false);
    const webMsgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [webRow.id]
    );
    const webSys = webMsgs.rows.find((m) => m.sender === 'system');
    assert.ok(webSys, 'Expected Web system handoff message for child 1:1');
    assert.equal(webSys.body.includes('lớp 1 kèm 1 cho bé'), true);
    assert.equal(webSys.body.includes('người đi làm'), false);

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({ msgId: 'z_t2_f10_01', userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId, text: input }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);
    const zRow = (
      await world.db.query(`SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(zRow.lead_meta.flow, 'parent_child');
    assert.equal(zRow.lead_meta.child_age, 8);
    assert.equal(zRow.lead_meta.ad_package, undefined);
    assert.equal(zRow.source_tag, 'zalo_oa');
    const zMsgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    const zSys = zMsgs.rows.find((m) => m.sender === 'system');
    assert.ok(zSys, 'Expected Zalo OA system handoff message for child 1:1');
    assert.equal(zSys.body.includes('lớp 1 kèm 1 cho bé'), true);
    assert.equal(zSys.body.includes('người đi làm'), false);
  });

  it('T2-F10-02: Unaccented & abbreviated child 1:1 queries are excluded from adult script and parse child_age', async () => {
    const cases = [
      { text: 'cho be 7t hoc 1 kem 1', expectedAge: 7 },
      { text: 'tim gia su cho chau 9 tuoi', expectedAge: 9 },
      { text: 'be gai nha toi 6t can hoc kem 1-1', expectedAge: 6 }
    ];
    for (const c of cases) {
      await world.reset();
      assert.equal(isAdultTutoringRequest(c.text), false, `Must exclude: ${c.text}`);

      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, c.text);
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      assert.equal(thread.json.leadMeta.flow, 'parent_child');
      assert.equal(thread.json.leadMeta.child_age, c.expectedAge);
      assert.equal(thread.json.leadMeta.ad_package, undefined);
      assert.equal(thread.json.leadMeta.script_step, undefined);
      const sys = thread.json.messages.find((m) => m.sender === 'system');
      assert.ok(sys, `Expected system handoff message for "${c.text}"`);
      assert.equal(sys.body.includes('lớp 1 kèm 1 cho bé'), true);
      assert.equal(sys.body.includes('người đi làm'), false);
    }

    // Also verify unaccented child 1:1 exclusion on Zalo OA
    await world.reset();
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f10_02',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'cho be 7t hoc 1 kem 1'
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);
    const zRow = (
      await world.db.query(`SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(zRow.lead_meta.flow, 'parent_child');
    assert.equal(zRow.lead_meta.child_age, 7);
    assert.equal(zRow.lead_meta.ad_package, undefined);
    assert.equal(zRow.lead_meta.script_step, undefined);
    assert.equal(zRow.source_tag, 'zalo_oa');
    const zMsgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    const zSys = zMsgs.rows.find((m) => m.sender === 'system');
    assert.ok(zSys, 'Expected Zalo OA system handoff message for unaccented child 1:1');
    assert.equal(zSys.body.includes('lớp 1 kèm 1 cho bé'), true);
    assert.equal(zSys.body.includes('người đi làm'), false);
  });

  it('T2-F10-03: Adult 1:1 handoff replies & adversarial Gemini claims never expose unconfirmed 80%/8-session/963k claims', async () => {
    for (const utterance of ADULT_1_1_FIXTURES.testUtterances) {
      await world.reset();
      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, utterance);
      assertHttpStatus(msgRes, 200);
      const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      for (const m of thread.json.messages.filter((msg) => msg.sender !== 'customer')) {
        assertNoForbiddenAiText(m.body.replace(/1\s*kèm\s*1/gi, '1 (kèm) 1'));
        assert.equal(/8\s*buổi/i.test(m.body), false);
      }
    }

    const liveWorld = await createTestWorld({ mode: 'live-auth' });
    try {
      liveWorld.mocks.setFaults({
        geminiResponse: {
          reply: 'Gói 963k 80% thực hành, đầu ra sau 8 buổi, rút ngắn một nửa thời gian',
          course_id: '',
          handoff: false
        }
      });
      const start = await liveWorld.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await liveWorld.sendWebMessage(start.token, 'Bé nhà chị muốn tìm khóa giao tiếp');
      assertHttpStatus(msgRes, 200);
      const thread = await liveWorld.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(thread, 200);
      assert.equal(thread.json.status, 'open');
      const allBodies = thread.json.messages.filter((m) => m.sender !== 'customer').map((m) => m.body).join('\n');
      assertNoForbiddenAiText(allBodies);
      assert.equal(allBodies.includes('963k'), false);
    } finally {
      await liveWorld.close();
    }
  });

  it('T2-F10-04: CA 03 overtime boundary hands off without promising unconfirmed make-up or no-loss policy', async () => {
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f10_04',
        userId: LEARNERS_AND_PARENTS.adultLearnerAn.zaloUserId,
        text: CA_TRANSCRIPTS.CA03.turns[1].text
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);
    const conv = (
      await world.db.query(`SELECT status FROM public.ktn_consultations WHERE id = $1`, [zRes.json.consultation_id])
    ).rows[0];
    assert.equal(conv.status, 'open');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);

    const msgs = await world.db.query(
      `SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender <> 'customer'`,
      [zRes.json.consultation_id]
    );
    for (const m of msgs.rows) {
      assert.equal(/không mất buổi|được bù|bảo lưu miễn phí/i.test(m.body), false);
    }
  });

  it('T2-F10-05: Ambiguous inputs do not fabricate timeslot, ad_package, or ad_* source_tag', async () => {
    for (const text of ['Hôm nào rảnh thì mình học', 'Mình muốn học tiếng Trung']) {
      await world.reset();
      const start = await world.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await world.sendWebMessage(start.token, text);
      assertHttpStatus(msgRes, 200);
      const row = (
        await world.db.query(
          `SELECT source_tag, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
        )
      ).rows[0];
      assert.equal(row.lead_meta.timeslot, undefined);
      assert.equal(row.lead_meta.ad_package, undefined);
      assert.equal(/^ad_/.test(row.source_tag || ''), false);
    }
  });

  it('T2-F10-06: Child age + 963k package collision prioritizes parent_child exclusion and clears ad_package', async () => {
    const query = 'Con chị 10 tuổi học gói 963k được không?';
    assert.equal(isAdultTutoringRequest(query), false);

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f10_06',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: query
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);
    const row = (
      await world.db.query(
        `SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE id = $1`,
        [zRes.json.consultation_id]
      )
    ).rows[0];
    assert.equal(row.status, 'bot');
    assert.equal(row.lead_meta.flow, 'parent_child');
    assert.equal(row.lead_meta.child_age, 10);
    assert.equal(row.lead_meta.ad_package, undefined);
    assert.equal(row.lead_meta.script_step, undefined);
    assert.equal(row.source_tag, 'zalo_oa');
    const msgs1 = await world.db.query(
      `SELECT sender, delivery, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    const botMsg1 = msgs1.rows.find((m) => m.sender === 'bot');
    assert.ok(botMsg1, 'Expected bot reply for non-1:1 child age + 963k collision');
    assert.equal(botMsg1.delivery, 'sent');
    assert.equal(botMsg1.body.includes('963k'), false);
    assert.equal(botMsg1.body.includes('người đi làm'), false);
    assertNoForbiddenAiText(botMsg1.body.split('\n\n')[0], 'Child age + 963k bot reply');

    // Also verify child 1:1 + 963k collision hands off as child_1_1 (never adult_1_1)
    const child11Query = 'Con chị 10 tuổi học 1 kèm 1 gói 963k được không?';
    assert.equal(isAdultTutoringRequest(child11Query), false);
    const zRes2 = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t2_f10_06_b',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: child11Query
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes2, 200);
    const row2 = (
      await world.db.query(
        `SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE id = $1`,
        [zRes2.json.consultation_id]
      )
    ).rows[0];
    assert.equal(row2.status, 'open');
    assert.equal(row2.lead_meta.flow, 'parent_child');
    assert.equal(row2.lead_meta.child_age, 10);
    assert.equal(row2.lead_meta.ad_package, undefined);
    assert.equal(row2.lead_meta.script_step, undefined);
    assert.equal(row2.source_tag, 'zalo_oa');
    const msgs2 = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes2.json.consultation_id]
    );
    const sysMsg2 = msgs2.rows.find((m) => m.sender === 'system');
    assert.ok(sysMsg2, 'Expected system handoff message for child 1:1 + 963k collision');
    assert.equal(sysMsg2.body.includes('lớp 1 kèm 1 cho bé'), true);
    assert.equal(sysMsg2.body.includes('người đi làm'), false);
  });
});
