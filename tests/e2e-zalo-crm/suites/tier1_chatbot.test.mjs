import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import { simulateAiReply } from '../../../consultation-chatbot.mjs';
import { draftConsultationExamples, draftConsultationPolicy } from '../../../consultation-examples.mjs';
import {
  assertHttpStatus,
  assertNoForbiddenAiText,
  assertNoSecretLeaks,
  assertPiiRedacted,
  assertSafeCustomerThreadResponse,
  assertSafeStaffThreadResponse
} from '../harness/assertions.mjs';
import {
  CA_TRANSCRIPTS,
  CATALOG_COURSES,
  DEFAULT_COURSE_IDS,
  DEFAULT_DURATION_PRESETS,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  makeSepayWebhook,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import { createTestWorld } from '../harness/worker-client.mjs';

function makeSyntheticRedactedExamples(count) {
  const out = [];
  for (let i = 0; i < count; i += 1) {
    out.push({
      question: `Phụ huynh hỏi lộ trình bổ sung số ${i + 1} cho học viên mới?`,
      hints: [`mẫu bổ sung ${i + 1}`, `lộ trình ${i + 1}`],
      answer: `Xác nhận độ tuổi và mục tiêu học số ${i + 1} rồi đề xuất khóa video phù hợp trong danh mục.`
    });
  }
  return out;
}

describe('Tier 1 — F06 Scripted / Menu Quick-Reply Engine (Web & Zalo OA)', () => {
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

  it('T1-F06-01: Web MENU_ROOT returns 4 menu sections, 5 quickReplies, and 0 Gemini calls', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200, 'web/start');

    const msgRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: {
        requestId: crypto.randomUUID(),
        body: 'Menu chính',
        menuCommand: 'MENU_ROOT'
      }
    });
    assertHttpStatus(msgRes, 200, 'web/message MENU_ROOT');
    assert.equal(msgRes.json.accepted, true);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200, 'web/thread');
    assertSafeCustomerThreadResponse(thread.json);
    assert.equal(thread.json.status, 'bot');
    assert.equal(thread.json.quickReplies.length, 5);
    assert.deepEqual(
      thread.json.quickReplies.map((q) => q.id),
      ['MENU_FAQ', 'MENU_FAQ_TUITION', 'MENU_PAYMENT', 'MENU_NEED_PHONE', 'MENU_HANDOFF']
    );

    const botMsg = thread.json.messages.find((m) => m.sender === 'bot');
    assert.ok(botMsg, 'Expected scripted bot message');
    assert.match(botMsg.body, /1\.\s*Chọn khóa học/);
    assert.match(botMsg.body, /2\.\s*Hướng dẫn thanh toán VietQR/);
    assert.match(botMsg.body, /3\.\s*Để lại nhu cầu & số điện thoại/);
    assert.match(botMsg.body, /4\.\s*Gặp tư vấn viên KTN/);
    assertNoForbiddenAiText(botMsg.body.replace(/3\.\s*Để/u, '3. Mục Để'), 'MENU_ROOT reply');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F06-02: Zalo OA live-auth signed MENU_ROOT sends request_user_info buttons via CS API with 0 Gemini calls', async () => {
    const zEv = makeZaloTextEvent({
      msgId: 'z_t1_f06_02',
      userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
      text: 'MENU_ROOT'
    });
    const res = await world.postZaloEvent(zEv, { sign: true, sandbox: false });
    assertHttpStatus(res, 200, 'Zalo MENU_ROOT');
    assert.equal(res.json.ok, true);
    assert.equal(res.json.duplicate, false);
    assert.equal(res.json.status, 'bot');

    const msgs = await world.db.query(
      `SELECT sender, delivery, body FROM public.ktn_consultation_messages WHERE consultation_id = $1 ORDER BY created_at ASC`,
      [res.json.consultation_id]
    );
    const botMsg = msgs.rows.find((r) => r.sender === 'bot');
    assert.ok(botMsg, 'Bot message must exist');
    assert.equal(botMsg.delivery, 'sent');

    const csCall = world.mocks.upstreamCalls.zalo.find((c) => c.url.includes('/v3.0/oa/message/cs'));
    assert.ok(csCall, 'Expected Zalo OA CS API call');
    assert.equal(csCall.body.recipient.user_id, LEARNERS_AND_PARENTS.parentMinh.zaloUserId);
    assert.equal(csCall.body.message.attachment?.type, 'template');
    assert.equal(csCall.body.message.attachment?.payload?.template_type, 'request_user_info');
    const buttons = csCall.body.message.attachment?.payload?.buttons || [];
    assert.ok(buttons.length >= 1 && buttons.length <= 5, `Expected 1..5 Zalo buttons, got ${buttons.length}`);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F06-03: MENU_FAQ serves tuition from live catalog on Web and child roadmap on Zalo OA with 0 Gemini calls', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);

    const faqCmdRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Chọn khóa học', menuCommand: 'MENU_FAQ' }
    });
    assertHttpStatus(faqCmdRes, 200, 'web/message MENU_FAQ');
    const tuitionCmdRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Học phí & Ưu đãi' }
    });
    assertHttpStatus(tuitionCmdRes, 200, 'web/message Học phí & Ưu đãi');

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.leadMeta.menu_state, 'MENU_FAQ');
    assert.equal(thread.json.quickReplies.length, 5);
    assert.deepEqual(
      thread.json.quickReplies.map((q) => q.id),
      ['FAQ_KIDS', 'FAQ_ADULT', 'FAQ_FORMAT', 'FAQ_EXAM', 'MENU_ROOT']
    );
    const tuitionReply = thread.json.messages.filter((m) => m.sender === 'bot').at(-1);
    assert.ok(tuitionReply);
    assert.match(tuitionReply.body, /890\.000\s*₫/);

    const zEv = makeZaloTextEvent({
      msgId: 'z_t1_f06_03',
      userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
      text: 'Lộ trình trẻ em (4–15 tuổi)'
    });
    const zRes = await world.postZaloEvent(zEv, { sign: true, sandbox: false });
    assertHttpStatus(zRes, 200);
    const zConv = await world.db.query(
      `SELECT lead_meta FROM public.ktn_consultations WHERE id = $1`,
      [zRes.json.consultation_id]
    );
    assert.equal(zConv.rows[0].lead_meta.menu_state, 'MENU_FAQ');
    const zMsgs = await world.db.query(
      `SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
      [zRes.json.consultation_id]
    );
    assert.match(zMsgs.rows[0].body, /Mầm non.*Tiểu học/i);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F06-04: MENU_NEED_PHONE captures valid VN phone & lead metadata on Web and Zalo OA and clears menu_state', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);

    const needPhoneRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: {
        requestId: crypto.randomUUID(),
        body: 'Để lại nhu cầu & SĐT',
        menuCommand: 'MENU_NEED_PHONE',
        lead: {
          name: LEARNERS_AND_PARENTS.parentMinh.name,
          phone: '0901234567',
          targetGroup: 'Tiểu học (7–11 tuổi)',
          goal: 'Nghe nói cơ bản'
        }
      }
    });
    assertHttpStatus(needPhoneRes, 200, 'web/message MENU_NEED_PHONE');

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.leadMeta.goal, 'Nghe nói cơ bản');
    assert.equal(thread.json.leadMeta.target_group, 'Tiểu học (7–11 tuổi)');
    assert.equal(thread.json.leadMeta.menu_state, undefined);

    const webDb = await world.db.query(
      `SELECT customer_phone, customer_name, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
    );
    assert.equal(webDb.rows[0].customer_phone, '0901234567');
    assert.equal(webDb.rows[0].customer_name, LEARNERS_AND_PARENTS.parentMinh.name);
    assert.equal(webDb.rows[0].lead_meta.menu_state, undefined);

    const zStart = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f06_04_a',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: 'MENU_NEED_PHONE'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zStart, 200);

    const zPhone = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f06_04_b',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: 'Bé 7 tuổi giao tiếp, +84912345678'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zPhone, 200);

    const zDb = await world.db.query(
      `SELECT customer_phone, lead_meta FROM public.ktn_consultations WHERE id = $1`,
      [zPhone.json.consultation_id]
    );
    assert.equal(zDb.rows[0].customer_phone, '+84912345678');
    assert.equal(zDb.rows[0].lead_meta.menu_state, undefined);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F06-05: MENU_PAYMENT returns official VietQR & SePay steps on Web and Zalo OA without raw bank account numbers or URLs', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);

    const payMenuRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Thanh toán', menuCommand: 'MENU_PAYMENT' }
    });
    assertHttpStatus(payMenuRes, 200, 'web/message MENU_PAYMENT');
    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'bot');
    const webReply = thread.json.messages.find((m) => m.sender === 'bot').body;
    assert.match(webReply, /\bMB\b/);
    assert.match(webReply, /ORD-XXXXXX/);
    assert.match(webReply, /KTN ORD-XXXXXX/);
    assert.match(webReply, /Đã nhận tiền/);
    assert.match(webReply, /Đã mở khóa/);
    assert.equal(/\d{6,}/.test(webReply), false, 'Must not include raw bank account digits');
    assert.equal(/https?:|www\./i.test(webReply), false, 'Must not include raw URL');

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f06_05',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Hướng dẫn thanh toán VietQR'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    assert.equal(zRes.json.status, 'bot');
    const zBot = await world.db.query(
      `SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
      [zRes.json.consultation_id]
    );
    assert.match(zBot.rows[0].body, /KTN ORD-XXXXXX/);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F06-06: MENU_HANDOFF transfers Web & Zalo OA threads to advisor round-robin while preserving lead_meta.goal', async () => {
    const advisorEmails = STAFF_ACTORS.advisors.map((a) => a.email);

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const leadSaveRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: {
        requestId: crypto.randomUUID(),
        body: 'Mình muốn để lại thông tin',
        menuCommand: 'MENU_NEED_PHONE',
        lead: { goal: 'Giao tiếp nghe nói cho bé 7 tuổi', phone: '0901234567' }
      }
    });
    assertHttpStatus(leadSaveRes, 200, 'web/message MENU_NEED_PHONE before handoff');
    const handoffRes = await world.request('/api/ktn/consultations/web/message', {
      method: 'POST',
      token: start.token,
      json: { requestId: crypto.randomUUID(), body: 'Gặp tư vấn viên', menuCommand: 'MENU_HANDOFF' }
    });
    assertHttpStatus(handoffRes, 200, 'web/message MENU_HANDOFF');

    const webRow = (
      await world.db.query(
        `SELECT id, status, owner_email, queued_at, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    assert.equal(webRow.status, 'open');
    assert.ok(advisorEmails.includes(webRow.owner_email), `Unexpected owner_email: ${webRow.owner_email}`);
    assert.ok(webRow.queued_at);
    assert.equal(webRow.lead_meta.goal, 'Giao tiếp nghe nói cho bé 7 tuổi');

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f06_06',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: 'Gặp tư vấn viên'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const zRow = (
      await world.db.query(
        `SELECT status, owner_email, queued_at FROM public.ktn_consultations WHERE id = $1`,
        [zRes.json.consultation_id]
      )
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.ok(advisorEmails.includes(zRow.owner_email));
    assert.notEqual(webRow.owner_email, zRow.owner_email, 'Round-robin auto-assign must distribute across advisors');
    assert.ok(zRow.queued_at);
    const sysMsg = (
      await world.db.query(
        `SELECT delivery, body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'system'`,
        [zRes.json.consultation_id]
      )
    ).rows[0];
    assert.ok(sysMsg);
    assert.equal(sysMsg.delivery, 'sent');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });
});

describe('Tier 1 — F07 Worker-Hosted AI LLM Engine & Sandbox Mode', () => {
  let world;

  before(async () => {
    world = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_GEMINI_KEYS: 'k1,k2,k3' }
    });
  });

  beforeEach(async () => {
    await world.reset();
  });

  after(async () => {
    await world?.close();
  });

  it('T1-F07-01: Gemini key rotation retries past 429/503 and 401/403 keys across all 3 distinct keys until healthy attempt succeeds', async () => {
    world.mocks.setFaults({
      geminiStatus: [429, 503, 200],
      geminiResponse: {
        reply: 'Bé nhà mình đã từng nghe tiếng Trung trước đây chưa ạ?',
        course_id: '',
        handoff: false
      }
    });

    const start1 = await world.startWebChat();
    assertHttpStatus(start1, 200);
    const res1 = await world.sendWebMessage(start1.token, 'Bé 7 tuổi chưa biết gì');
    assertHttpStatus(res1, 200);

    const calls1 = world.mocks.upstreamCalls.gemini;
    assert.equal(calls1.length, 3, 'Must rotate deterministically across all 3 keys on 429 -> 503 -> 200');
    assert.equal(new Set(calls1.map((c) => c.apiKey)).size, 3, 'Must try 3 distinct Gemini keys');

    const thread1 = await world.request('/api/ktn/consultations/web/thread', { token: start1.token });
    assertHttpStatus(thread1, 200);
    assert.equal(thread1.json.status, 'bot');
    const bot1 = thread1.json.messages.find((m) => m.sender === 'bot');
    assert.ok(bot1);
    assertNoForbiddenAiText(bot1.body);

    // Also verify 401/403 key rotation deterministically across all 3 distinct keys
    world.mocks.clearUpstreamCalls();
    world.mocks.setFaults({
      geminiStatus: [401, 403, 200],
      geminiResponse: {
        reply: 'Gia đình muốn cho bé luyện nghe nói hay chứng chỉ ạ?',
        course_id: '',
        handoff: false
      }
    });
    const start2 = await world.startWebChat();
    assertHttpStatus(start2, 200);
    const res2 = await world.sendWebMessage(start2.token, 'Bé 8 tuổi mới bắt đầu');
    assertHttpStatus(res2, 200);
    const calls2 = world.mocks.upstreamCalls.gemini;
    assert.equal(calls2.length, 3, 'Must rotate deterministically across all 3 keys on 401 -> 403 -> 200');
    assert.equal(new Set(calls2.map((c) => c.apiKey)).size, 3, 'Must try 3 distinct Gemini keys on 401/403');
    const thread2 = await world.request('/api/ktn/consultations/web/thread', { token: start2.token });
    assertHttpStatus(thread2, 200);
    assert.equal(thread2.json.status, 'bot');
    const bot2 = thread2.json.messages.find((m) => m.sender === 'bot');
    assert.ok(bot2);
    assertNoForbiddenAiText(bot2.body);
  });

  it('T1-F07-02: Worker sends Gemini request to configured KTN_GEMINI_MODEL with JSON response schema', async () => {
    const modelWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_GEMINI_MODEL: 'gemini-2.5-flash-test' }
    });
    try {
      modelWorld.mocks.setFaults({
        geminiResponse: {
          reply: 'Bé 6 tuổi đang muốn tập phát âm theo chủ đề nào ạ?',
          course_id: '',
          handoff: false
        }
      });
      const start = await modelWorld.startWebChat();
      assertHttpStatus(start, 200);
      const msgRes = await modelWorld.sendWebMessage(start.token, 'Bé 6 tuổi muốn học phát âm');
      assertHttpStatus(msgRes, 200, 'web/message model test');

      assert.equal(modelWorld.mocks.upstreamCalls.gemini.length, 1);
      const call = modelWorld.mocks.upstreamCalls.gemini[0];
      assert.ok(call.url.includes('/v1beta/models/gemini-2.5-flash-test:generateContent'));
      assert.equal(call.body.generationConfig.responseMimeType, 'application/json');
      assert.ok(call.body.generationConfig.responseJsonSchema?.properties?.reply);
    } finally {
      await modelWorld.close();
    }
  });

  it('T1-F07-03: Top-4 example retrieval handles 120-example store, unaccented abbreviations, and multi-turn pronoun context', async () => {
    const full120 = [...draftConsultationExamples, ...makeSyntheticRedactedExamples(48)];
    assert.equal(full120.length, 120);

    const saveRes = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        policy: draftConsultationPolicy,
        examples: full120,
        course_ids: DEFAULT_COURSE_IDS,
        duration_presets: DEFAULT_DURATION_PRESETS,
        bot_enabled: true,
        checkout_enabled: true
      }
    });
    assertHttpStatus(saveRes, 200, 'Seed 120 examples');

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const msg1Res = await world.sendWebMessage(start.token, 'be 7t ko biet gi muon hoc giao tiep');
    assertHttpStatus(msg1Res, 200, 'web/message turn 1 retrieval');
    const msg2Res = await world.sendWebMessage(start.token, 'khoa do xem dc bao lau?');
    assertHttpStatus(msg2Res, 200, 'web/message turn 2 retrieval');

    const lastGeminiCall = world.mocks.upstreamCalls.gemini.at(-1);
    assert.ok(lastGeminiCall);
    const payload = JSON.parse(lastGeminiCall.body.contents[0].parts[0].text);
    assert.ok(Array.isArray(payload.examples));
    assert.ok(payload.examples.length >= 1 && payload.examples.length <= 4, `Expected 1..4 examples, got ${payload.examples.length}`);
    const joined = payload.examples.map((e) => `${e.question} ${e.answer}`).join(' ').toLowerCase();
    assert.match(joined, /thời hạn|bao lâu|xem/);
  });

  it('T1-F07-04: PII in customer message is redacted before Gemini call and systemInstruction limits 1 question/turn', async () => {
    world.mocks.setFaults({
      geminiResponse: {
        reply: 'Bé nhà mình đã từng học tiếng Trung chưa ạ?',
        course_id: '',
        handoff: false
      }
    });

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const rawMsg = 'Email ph.minh@example.test SĐT 0901 234 567 xem https://evil.test/x Bé 7 tuổi muốn học';
    const msgRes = await world.sendWebMessage(start.token, rawMsg);
    assertHttpStatus(msgRes, 200, 'web/message PII redaction');

    assert.equal(world.mocks.upstreamCalls.gemini.length, 1);
    const gBody = world.mocks.upstreamCalls.gemini[0].body;
    const contentsStr = JSON.stringify(gBody.contents);
    assertPiiRedacted(contentsStr, ['ph.minh@example.test', '0901 234 567', 'https://evil.test/x'], 'Gemini payload');
    assert.ok(contentsStr.includes('[email]'));
    assert.ok(contentsStr.includes('[số điện thoại]'));
    assert.ok(contentsStr.includes('[liên kết]'));
    assert.match(gBody.systemInstruction.parts[0].text, /Hỏi tối đa một câu mỗi lượt/);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertNoForbiddenAiText(thread.json.messages.find((m) => m.sender === 'bot').body);
  });

  it('T1-F07-05: AI Sandbox mode runs clarifying -> catalog flow with 0 Gemini calls and returns ai_mode=simulated', async () => {
    const sbWorld = await createTestWorld({ mode: 'sandbox' });
    try {
      const start = await sbWorld.startWebChat();
      assertHttpStatus(start, 200);

      const m1Res = await sbWorld.sendWebMessage(start.token, 'Bé 7 tuổi chưa học bao giờ');
      assertHttpStatus(m1Res, 200, 'sandbox web/message turn 1');
      const t1 = await sbWorld.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(t1, 200);
      assert.equal(t1.json.status, 'bot');
      assert.equal(sbWorld.mocks.upstreamCalls.gemini.length, 0);
      const bot1 = t1.json.messages.find((m) => m.sender === 'bot');
      assert.ok(bot1);
      assert.match(bot1.body, /\?$/);
      assertNoForbiddenAiText(bot1.body);

      const m2Res = await sbWorld.sendWebMessage(start.token, 'Bé muốn nghe nói và nhận mặt chữ');
      assertHttpStatus(m2Res, 200, 'sandbox web/message turn 2');
      const t2 = await sbWorld.request('/api/ktn/consultations/web/thread', { token: start.token });
      assertHttpStatus(t2, 200);
      assert.equal(sbWorld.mocks.upstreamCalls.gemini.length, 0);
      const bot2 = t2.json.messages.filter((m) => m.sender === 'bot').at(-1);
      assert.ok(bot2);
      assert.match(bot2.body, /Tiếng Trung Trẻ Em 4/);
      assert.match(bot2.body, /890\.000\s*₫/);
      const preCatalog = bot2.body.split('\n\n')[0];
      assertNoForbiddenAiText(preCatalog);

      // Direct contract verification for pure simulateAiReply() ai_mode: 'simulated'
      const simRes = simulateAiReply({
        question: 'Bé muốn nghe nói và nhận mặt chữ',
        earlierQuestions: ['Bé 7 tuổi chưa học bao giờ'],
        courses: [{ id: CATALOG_COURSES[4].course_id, title: CATALOG_COURSES[4].title, price: 890000, duration: '3 tháng', ageGroup: '7 – 13 tuổi' }],
        examples: draftConsultationExamples,
        policy: draftConsultationPolicy
      });
      assert.equal(simRes.ai_mode, 'simulated');
      assert.equal(simRes.handoff, false);
      assert.equal(simRes.course_id, CATALOG_COURSES[4].course_id);
    } finally {
      await sbWorld.close();
    }
  });

  it('T1-F07-06: Zalo OA Sandbox mode delivers simulated catalog recommendation with zalo_sandbox: external_id and 0 external calls', async () => {
    const sbWorld = await createTestWorld({ mode: 'sandbox' });
    try {
      const zEv = makeZaloTextEvent({
        msgId: 'z_t1_f07_06',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Bé 5 tuổi chưa biết gì, muốn luyện nghe nói'
      });
      const res = await sbWorld.postZaloEvent(zEv, { sign: false, sandbox: true });
      assertHttpStatus(res, 200);
      assert.equal(res.json.ok, true);
      assert.equal(res.json.duplicate, false);
      assert.equal(sbWorld.mocks.upstreamCalls.gemini.length, 0);
      assert.equal(sbWorld.mocks.upstreamCalls.zalo.length, 0);

      const msgs = await sbWorld.db.query(
        `SELECT sender, delivery, external_id, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
        [res.json.consultation_id]
      );
      const botMsg = msgs.rows.find((r) => r.sender === 'bot');
      assert.ok(botMsg);
      assert.equal(botMsg.delivery, 'sent');
      assert.ok(botMsg.external_id.startsWith('zalo_sandbox:'));
      assert.match(botMsg.body, /Chinese For Kids/);
      assert.match(botMsg.body, /890\.000\s*₫/);
    } finally {
      await sbWorld.close();
    }
  });
});

describe('Tier 1 — F08 Hard Guardrails: Tuition/Offer/Link Lock & Handoff', () => {
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

  it('T1-F08-01: Zalo OA strips prices from Gemini prompt and appends server catalog price & #checkout ticket URL', async () => {
    const courseId = '678d14b960eae20002ddf8fe';
    world.mocks.setFaults({
      geminiResponse: {
        reply: 'Gia đình tham khảo khóa này nhé.',
        course_id: courseId,
        handoff: false
      }
    });

    const zEv = makeZaloTextEvent({
      msgId: 'z_t1_f08_01',
      userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
      text: 'Bé 8 tuổi muốn học khóa giao tiếp nhận mặt chữ'
    });
    const res = await world.postZaloEvent(zEv, { sign: true, sandbox: false });
    assertHttpStatus(res, 200);

    assert.equal(world.mocks.upstreamCalls.gemini.length, 1);
    const promptPayload = JSON.parse(world.mocks.upstreamCalls.gemini[0].body.contents[0].parts[0].text);
    assert.ok(Array.isArray(promptPayload.courses) && promptPayload.courses.length > 0);
    for (const c of promptPayload.courses) {
      assert.equal(Object.hasOwn(c, 'price'), false, 'Prompt courses must strip price');
    }

    const botMsg = (
      await world.db.query(
        `SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
        [res.json.consultation_id]
      )
    ).rows[0];
    assert.ok(botMsg);
    const [aiPart] = botMsg.body.split('\n\n');
    assertNoForbiddenAiText(aiPart, 'Pre-catalog AI text');
    assert.ok(botMsg.body.includes('Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi) — 890.000 ₫ · 3 tháng'));
    assert.match(
      botMsg.body,
      /Đăng ký: https:\/\/mock-ktn\.local\/tu-van#checkout=checkout\.[a-f0-9-]+\.\d{13}\.[a-f0-9]{64}&course=678d14b960eae20002ddf8fe/
    );
  });

  it('T1-F08-02: CA 04 2-turn Web chat asks 1 clean question then appends server title, price, duration without #checkout URL', async () => {
    const courseId = '678d14b960eae20002ddf8fe';
    world.mocks.setFaults({
      geminiResponse: [
        { reply: 'Bé nhà chị thích học nghe nói hay nhận mặt chữ ạ?', course_id: '', handoff: false },
        { reply: 'Khóa này phù hợp cho bé mới bắt đầu ạ.', course_id: courseId, handoff: false }
      ]
    });

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const m1 = await world.sendWebMessage(start.token, CA_TRANSCRIPTS.CA04.turns[0].text);
    assertHttpStatus(m1, 200, 'CA 04 turn 1');
    const t1 = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(t1, 200);
    assertNoForbiddenAiText(t1.json.messages.at(-1).body);

    const m2 = await world.sendWebMessage(start.token, CA_TRANSCRIPTS.CA04.turns[1].text);
    assertHttpStatus(m2, 200, 'CA 04 turn 2');
    const t2 = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(t2, 200);
    assert.equal(t2.json.status, 'bot');
    const finalReply = t2.json.messages.filter((m) => m.sender === 'bot').at(-1).body;
    assertNoForbiddenAiText(finalReply.split('\n\n')[0]);
    assert.ok(finalReply.includes('Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi) — 890.000 ₫ · 3 tháng'));
    assert.equal(finalReply.includes('#checkout='), false, 'Web channel relies on embedded form, not #checkout link');
  });

  it('T1-F08-03: Explicit human request hands off immediately on Web and Zalo OA with 0 Gemini calls', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const webMsgRes = await world.sendWebMessage(start.token, 'Chị muốn gặp tư vấn viên để hỏi thêm');
    assertHttpStatus(webMsgRes, 200);
    const webThread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(webThread, 200);
    assert.equal(webThread.json.status, 'open');
    assert.ok(webThread.json.messages.some((m) => m.sender === 'system'));

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f08_03',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Chị muốn gặp tư vấn viên để hỏi thêm'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const zRow = (
      await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.ok(zRow.owner_email);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F08-04: Underage self-buyer triggers immediate guardian handoff with 0 Gemini calls', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const msgRes = await world.sendWebMessage(start.token, 'Em là học sinh 14 tuổi muốn tự mua khóa không cần ba mẹ');
    assertHttpStatus(msgRes, 200);
    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'open');
    const sys = thread.json.messages.find((m) => m.sender === 'system');
    assert.ok(sys);
    assert.equal(sys.body, 'Nhờ phụ huynh hoặc người giám hộ liên hệ KTN để được hỗ trợ đăng ký nhé.');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F08-05: CA 10 prompt injection & other-customer order request on Zalo OA refuses and hands off without secret leaks', async () => {
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f08_05',
        userId: LEARNERS_AND_PARENTS.parentLan.zaloUserId,
        text: CA_TRANSCRIPTS.CA10.turns[0].text
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    const conv = (
      await world.db.query(`SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(conv.status, 'open');
    assert.ok(conv.owner_email);

    const msgs = await world.db.query(
      `SELECT sender, body FROM public.ktn_consultation_messages WHERE consultation_id = $1`,
      [zRes.json.consultation_id]
    );
    const sys = msgs.rows.find((m) => m.sender === 'system');
    assert.ok(sys);
    assert.match(sys.body, /không thể chia sẻ thông tin nội bộ|dữ liệu của khách hàng khác/i);
    assertNoSecretLeaks(msgs.rows);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F08-06: AI returning handoff=true discards candidate reply and transitions thread to human advisor', async () => {
    world.mocks.setFaults({
      geminiResponse: {
        reply: 'Để em hỏi thêm.',
        course_id: '',
        handoff: true
      }
    });

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const msgRes = await world.sendWebMessage(start.token, 'Con đã học một khóa chỗ khác rồi, chưa rõ nên học tiếp thế nào ạ?');
    assertHttpStatus(msgRes, 200);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 1);

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'open');
    assert.equal(thread.json.messages.some((m) => m.body.includes('Để em hỏi thêm.')), false);
    const sys = thread.json.messages.find((m) => m.sender === 'system');
    assert.equal(sys?.body, 'Mình đã chuyển câu hỏi cho tư vấn viên KTN.');
  });
});

describe('Tier 1 — F09 72-Case Knowledge Matrix & Catalog/Kill-Switch Config', () => {
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

  it('T1-F09-01: Manager GET staff/guidance/draft returns 72 redacted examples and maxExamples=120', async () => {
    const res = await world.staffReq('staff/guidance/draft', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(res, 200, 'staff/guidance/draft');
    assert.equal(res.json.examples.length, 72);
    assert.equal(res.json.maxExamples, 120);
    assert.ok(typeof res.json.policy === 'string' && res.json.policy.length > 50);
    for (const ex of res.json.examples) {
      assertPiiRedacted([ex.question, ex.answer, ...(ex.hints || [])].join(' '), [], 'Draft example');
    }
  });

  it('T1-F09-02: Manager PUT staff/guidance persists 120 anonymized examples & 10 courses reflected in web/catalog', async () => {
    const examples120 = [...draftConsultationExamples, ...makeSyntheticRedactedExamples(48)];
    const putRes = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: {
        policy: draftConsultationPolicy,
        examples: examples120,
        course_ids: DEFAULT_COURSE_IDS,
        duration_presets: DEFAULT_DURATION_PRESETS,
        bot_enabled: true,
        checkout_enabled: true
      }
    });
    assertHttpStatus(putRes, 200, 'PUT staff/guidance 120');

    const getRes = await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(getRes, 200);
    assert.equal(getRes.json.config.examples.length, 120);
    assert.equal(getRes.json.config.course_ids.length, 10);

    const catRes = await world.request('/api/ktn/consultations/web/catalog');
    assertHttpStatus(catRes, 200);
    assert.equal(catRes.json.courses.length, 10);
    assert.equal(catRes.json.checkoutEnabled, true);
  });

  it('T1-F09-03: bot_enabled=false kill-switch queues new Web & Zalo OA threads for human without calling Gemini', async () => {
    const cur = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
    const offRes = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: { ...cur, bot_enabled: false }
    });
    assertHttpStatus(offRes, 200);

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const t0 = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(t0, 200);
    assert.equal(t0.json.status, 'waiting');

    const webRow = (
      await world.db.query(`SELECT id FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`)
    ).rows[0];
    const claimRes = await world.staffReq(`staff/thread/${webRow.id}/claim`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      method: 'POST',
      json: {}
    });
    assertHttpStatus(claimRes, 200);

    const replyRes = await world.staffReq(`staff/thread/${webRow.id}/reply`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      method: 'POST',
      json: { request_id: crypto.randomUUID(), body: 'Chào chị, em là tư vấn viên KTN hỗ trợ mình ạ.' }
    });
    assertHttpStatus(replyRes, 200);

    // Send a Web customer message while bot_enabled=false on a fresh waiting Web thread
    const startWebMsg = await world.startWebChat();
    assertHttpStatus(startWebMsg, 200);
    const webMsgRes = await world.sendWebMessage(startWebMsg.token, 'Bé 7 tuổi muốn học tiếng Trung');
    assertHttpStatus(webMsgRes, 200, 'web/message when bot_enabled=false');
    const tAfterWebMsg = await world.request('/api/ktn/consultations/web/thread', { token: startWebMsg.token });
    assertHttpStatus(tAfterWebMsg, 200);
    assert.notEqual(tAfterWebMsg.json.status, 'bot');
    assert.equal(tAfterWebMsg.json.messages.filter((m) => m.sender === 'bot').length, 0);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f09_03',
        userId: LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
        text: 'Bé 7 tuổi muốn học tiếng Trung'
      }),
      { sign: true, sandbox: false }
    );
    assertHttpStatus(zRes, 200);
    assert.notEqual(zRes.json.status, 'bot');
    const zBotMsgs = await world.db.query(
      `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'`,
      [zRes.json.consultation_id]
    );
    assert.equal(zBotMsgs.rows.length, 0);
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F09-04: checkout_enabled=false blocks new web/order (503) while SePay webhook still marks existing order paid', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const orderRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: start.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: CATALOG_COURSES[4].course_id,
        name: LEARNERS_AND_PARENTS.parentMinh.name,
        email: LEARNERS_AND_PARENTS.parentMinh.email,
        phone: LEARNERS_AND_PARENTS.parentMinh.phone
      }
    });
    assertHttpStatus(orderRes, 200, 'Create order before kill-switch');
    const existingOrderId = orderRes.json.id;

    const cur = (await world.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
    const disableRes = await world.staffReq('staff/guidance', {
      actor: STAFF_ACTORS.manager,
      method: 'PUT',
      json: { ...cur, checkout_enabled: false }
    });
    assertHttpStatus(disableRes, 200);

    const catRes = await world.request('/api/ktn/consultations/web/catalog');
    assertHttpStatus(catRes, 200);
    assert.equal(catRes.json.checkoutEnabled, false);

    const blockedOrderRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: start.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: CATALOG_COURSES[4].course_id,
        name: LEARNERS_AND_PARENTS.parentMinh.name,
        email: LEARNERS_AND_PARENTS.parentMinh.email,
        phone: LEARNERS_AND_PARENTS.parentMinh.phone
      }
    });
    assertHttpStatus(blockedOrderRes, 503, 'New web/order blocked when checkout_enabled=false');

    const sepayRes = await world.postSepay(
      makeSepayWebhook({
        id: 99000101,
        orderCode: existingOrderId,
        transferAmount: CATALOG_COURSES[4].price
      })
    );
    assertHttpStatus(sepayRes, 201, 'Existing order SePay webhook');
    const ordRow = (
      await world.db.query(`SELECT payment_status FROM public.ktn_orders WHERE order_id = $1`, [existingOrderId])
    ).rows[0];
    assert.equal(ordRow.payment_status, 'paid');
    const payRow = (
      await world.db.query(`SELECT status, amount FROM public.ktn_consultation_payments WHERE order_id = $1`, [
        existingOrderId
      ])
    ).rows[0];
    assert.ok(payRow);
    assert.equal(Number(payRow.amount), CATALOG_COURSES[4].price);
    assert.ok(['accepted', 'done'].includes(payRow.status));
  });

  it('T1-F09-05: Pilot web mode (KTN_CONSULTATION_MODE=web) gates full-mode routes (404) while permitting policy-only guidance save', async () => {
    const pilotWorld = await createTestWorld({
      mode: 'live-auth',
      envOverrides: { KTN_CONSULTATION_MODE: 'web' }
    });
    try {
      const cat = await pilotWorld.request('/api/ktn/consultations/web/catalog');
      assertHttpStatus(cat, 200);
      assert.deepEqual(cat.json, { courses: [], checkoutEnabled: false });

      const start = await pilotWorld.startWebChat();
      assertHttpStatus(start, 200);
      const thread = await pilotWorld.request('/api/ktn/consultations/web/thread', { token: start.token });
      assert.equal(thread.json.status, 'waiting');

      const sepayRes = await pilotWorld.postSepay(makeSepayWebhook({ orderCode: 'ORD-100001', transferAmount: 890000 }));
      assertHttpStatus(sepayRes, 404);

      const zaloRes = await pilotWorld.postZaloEvent(
        makeZaloTextEvent({ msgId: 'z_pilot_1', text: 'Xin chào' }),
        { sign: true, sandbox: false }
      );
      assertHttpStatus(zaloRes, 404);

      const putRes = await pilotWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: {
          policy: `${draftConsultationPolicy} Cập nhật pilot.`,
          examples: draftConsultationExamples,
          bot_enabled: false,
          checkout_enabled: false
        }
      });
      assertHttpStatus(putRes, 200);
      assert.match(putRes.json.config.policy, /Cập nhật pilot\./);
    } finally {
      await pilotWorld.close();
    }
  });

  it('T1-F09-06: Manager can enable bot_enabled=true in AI sandbox mode with empty KTN_GEMINI_KEYS', async () => {
    const sbWorld = await createTestWorld({ mode: 'sandbox' });
    try {
      const cur = (await sbWorld.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager })).json.config;
      const putRes = await sbWorld.staffReq('staff/guidance', {
        actor: STAFF_ACTORS.manager,
        method: 'PUT',
        json: { ...cur, bot_enabled: true }
      });
      assertHttpStatus(putRes, 200);
      assert.equal(putRes.json.config.bot_enabled, true);
    } finally {
      await sbWorld.close();
    }
  });
});

describe('Tier 1 — F10 Adult Working 1:1 Ad Recognition & 4-Step Script', () => {
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

  it('T1-F10-01: CA 01 963k ad recognition hands off on Zalo OA & Web retaining source_tag, goal, background, and script_step', async () => {
    const zEv = makeZaloTextEvent({
      msgId: 'z_t1_f10_01',
      userId: LEARNERS_AND_PARENTS.adultLearnerAn.zaloUserId,
      text: CA_TRANSCRIPTS.CA01.turns[0].text
    });
    const zRes = await world.postZaloEvent(zEv, { sign: false, sandbox: true });
    assertHttpStatus(zRes, 200);

    const zRow = (
      await world.db.query(
        `SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE id = $1`,
        [zRes.json.consultation_id]
      )
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(zRow.source_tag, 'ad_963k');
    assert.equal(zRow.lead_meta.ad_package, 'ad_963k');
    assert.equal(zRow.lead_meta.flow, 'adult_1_1');
    assert.equal(zRow.lead_meta.target_group, 'adult_working');
    assert.equal(zRow.lead_meta.goal, 'Trao đổi với nhà cung cấp / nhập hàng');
    assert.equal(zRow.lead_meta.background, 'Mới bắt đầu / chưa học bao giờ');
    assert.equal(zRow.lead_meta.script_step, 'step_4_timeslot');

    const sysMsg = (
      await world.db.query(
        `SELECT body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'system'`,
        [zRes.json.consultation_id]
      )
    ).rows[0];
    assert.ok(sysMsg);
    assertNoForbiddenAiText(sysMsg.body.replace(/1\s*kèm\s*1/gi, '1 (kèm) 1'));

    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const webMsgRes = await world.sendWebMessage(start.token, CA_TRANSCRIPTS.CA01.turns[0].text);
    assertHttpStatus(webMsgRes, 200);
    const webThread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(webThread, 200);
    assert.equal(webThread.json.status, 'open');
    assert.equal(webThread.json.leadMeta.ad_package, 'ad_963k');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F10-02: CA 02 963k vs 1.500k comparison & standalone 1.500k ad capture source_tag and compared_packages', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const webMsgRes = await world.sendWebMessage(start.token, CA_TRANSCRIPTS.CA02.turns[0].text);
    assertHttpStatus(webMsgRes, 200);

    const webRow = (
      await world.db.query(
        `SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    assert.equal(webRow.status, 'open');
    assert.equal(webRow.source_tag, 'ad_compare');
    assert.equal(webRow.lead_meta.ad_package, 'compare_963k_1500k');
    assert.deepEqual(webRow.lead_meta.compared_packages, ['ad_963k', 'ad_1500k']);
    assert.match(webRow.lead_meta.goal, /kế toán/i);
    assert.equal(webRow.lead_meta.background, 'Mới bắt đầu / chưa học bao giờ');

    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f10_02',
        userId: LEARNERS_AND_PARENTS.adultLearnerAn.zaloUserId,
        text: 'Gói 1.500k cho người đi làm có phù hợp không?'
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
    assert.equal(zRow.source_tag, 'ad_1500k');
    assert.equal(zRow.lead_meta.ad_package, 'ad_1500k');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F10-03: Multi-turn Web 4-step script progression accumulates step_1_goal..step_4_timeslot to complete', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    for (const stepText of [
      'Mình xem gói 963k',
      'Mục tiêu nhắn với nhà cung cấp',
      'Chưa học bao giờ',
      'Thường rảnh tối 20h thứ 4'
    ]) {
      const stepRes = await world.sendWebMessage(start.token, stepText);
      assertHttpStatus(stepRes, 200, `web/message 4-step: ${stepText}`);
    }

    const thread = await world.request('/api/ktn/consultations/web/thread', { token: start.token });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.status, 'open');
    const lm = thread.json.leadMeta;
    assert.equal(lm.step_1_goal, 'Trao đổi với nhà cung cấp / nhập hàng');
    assert.equal(lm.step_2_background, 'Mới bắt đầu / chưa học bao giờ');
    assert.equal(lm.step_3_recommendation, 'Gói Cơ bản 963k');
    assert.ok(lm.step_4_timeslot);
    assert.ok(lm.timeslot);
    assert.equal(lm.script_step, 'complete');
  });

  it('T1-F10-04: Workplace Chinese cue without 963k or human-request keyword still routes to adult_1_1 handoff', async () => {
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f10_04',
        userId: LEARNERS_AND_PARENTS.adultLearnerAn.zaloUserId,
        text: 'Mình người đi làm cần tiếng Trung thương mại để nhắn nhà cung cấp'
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);

    const zRow = (
      await world.db.query(`SELECT status, lead_meta FROM public.ktn_consultations WHERE id = $1`, [
        zRes.json.consultation_id
      ])
    ).rows[0];
    assert.equal(zRow.status, 'open');
    assert.equal(zRow.lead_meta.flow, 'adult_1_1');
    assert.equal(zRow.lead_meta.target_group, 'adult_working');
    assert.equal(zRow.lead_meta.goal, 'Trao đổi với nhà cung cấp / nhập hàng');
    assert.equal(world.mocks.upstreamCalls.gemini.length, 0);
  });

  it('T1-F10-05: CA 03 timeslot capture surfaces lead_meta.timeslot to assigned advisor in staff/inbox & staff/thread without confirming availability', async () => {
    const zRes = await world.postZaloEvent(
      makeZaloTextEvent({
        msgId: 'z_t1_f10_05',
        userId: LEARNERS_AND_PARENTS.adultLearnerAn.zaloUserId,
        text: CA_TRANSCRIPTS.CA03.turns[0].text
      }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(zRes, 200);
    const convId = zRes.json.consultation_id;

    const convRow = (
      await world.db.query(`SELECT owner_email, lead_meta FROM public.ktn_consultations WHERE id = $1`, [convId])
    ).rows[0];
    assert.ok(convRow.owner_email);
    assert.match(convRow.lead_meta.timeslot || '', /20h/i);

    const assignedAdvisor = STAFF_ACTORS.advisors.find((a) => a.email === convRow.owner_email);
    assert.ok(assignedAdvisor);

    const inboxRes = await world.staffReq('staff/inbox?channel=zalo_oa', {
      actor: assignedAdvisor,
      authType: 'supabase-jwt'
    });
    assertHttpStatus(inboxRes, 200);
    const inboxItem = inboxRes.json.conversations.find((c) => c.id === convId);
    assert.ok(inboxItem);
    assert.match(inboxItem.lead_meta.timeslot || '', /20h/i);

    const staffThread = await world.staffReq(`staff/thread/${convId}`, {
      actor: assignedAdvisor,
      authType: 'supabase-jwt'
    });
    assertHttpStatus(staffThread, 200);
    assertSafeStaffThreadResponse(staffThread.json, { isAdmin: false });
    assert.match(staffThread.json.conversation.lead_meta.timeslot || '', /20h/i);
    const botReplies = staffThread.json.messages.filter((m) => m.sender === 'system' || m.sender === 'bot');
    for (const msg of botReplies) {
      assert.equal(/có cô|đã giữ lịch|xác nhận lịch/i.test(msg.body), false, 'Bot must not confirm unverified teacher slot');
    }
  });

  it('T1-F10-06: "Còn gói 963k..." is not misclassified as child "con" and preserves adult_1_1 flow', async () => {
    const start = await world.startWebChat();
    assertHttpStatus(start, 200);
    const webMsgRes = await world.sendWebMessage(start.token, 'Còn gói 963k cho người đi làm thì sao, mình muốn giao tiếp công việc?');
    assertHttpStatus(webMsgRes, 200);

    const row = (
      await world.db.query(
        `SELECT status, source_tag, lead_meta FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1`
      )
    ).rows[0];
    assert.equal(row.status, 'open');
    assert.equal(row.source_tag, 'ad_963k');
    assert.equal(row.lead_meta.flow, 'adult_1_1');
    assert.equal(row.lead_meta.ad_package, 'ad_963k');
    assert.equal(row.lead_meta.child_age, undefined);
  });
});
