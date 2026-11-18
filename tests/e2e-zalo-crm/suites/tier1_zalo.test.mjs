import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoSecretLeaks,
  assertSafeCustomerThreadResponse,
  assertSafeStaffThreadResponse,
  assertVietQrPayment
} from '../harness/assertions.mjs';
import {
  CATALOG_COURSES,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  makeZaloTextEvent,
  makeZaloSubmitInfoEvent
} from '../harness/fixtures.mjs';
import { ROOT_DIR } from '../harness/pglite-supabase.mjs';
import { createTestWorld, zaloSign } from '../harness/worker-client.mjs';

function uniqueUserId(prefix = 'zuid') {
  return `${prefix}-${crypto.randomUUID().slice(0, 12)}`;
}

function uniqueMsgId(prefix = 'zmsg') {
  return `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
}

describe('Tier 1 — Zalo OA Connector & Multi-Staff OA (Category-Partition Happy Paths)', () => {
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
  // F03 — Zalo OA Webhook Intake, Signature Auth & Deduplication (5 tests)
  // =========================================================================

  it('[F03] T1-ZALO-F03-01: GET webhook challenge verification (?challenge, ?hub.challenge) and bare health status', async () => {
    const ch1 = await liveWorld.request('/api/ktn/consultations/zalo?challenge=zalo_verify_123');
    assertHttpStatus(ch1, 200, 'GET zalo?challenge');
    assert.match(ch1.headers.get('content-type') || '', /^text\/plain/i);
    assert.equal(ch1.text, 'zalo_verify_123');

    const ch2 = await liveWorld.request('/api/ktn/consultations/zalo?hub.challenge=hub_456');
    assertHttpStatus(ch2, 200, 'GET zalo?hub.challenge');
    assert.match(ch2.headers.get('content-type') || '', /^text\/plain/i);
    assert.equal(ch2.text, 'hub_456');

    const healthLive = await liveWorld.request('/api/ktn/consultations/zalo');
    assertHttpStatus(healthLive, 200, 'GET zalo bare live');
    assert.deepEqual(healthLive.json, { ok: true, channel: 'zalo_oa', sandbox: false });

    const healthSandbox = await sandboxWorld.request('/api/ktn/consultations/zalo');
    assertHttpStatus(healthSandbox, 200, 'GET zalo bare sandbox');
    assert.deepEqual(healthSandbox.json, { ok: true, channel: 'zalo_oa', sandbox: true });
  });

  it('[F03] T1-ZALO-F03-02: Live signed user_send_text intake via raw hex and mac= prefix signatures', async () => {
    const userId1 = uniqueUserId('live-hex');
    const msgId1 = uniqueMsgId('mhex');
    const payload1 = makeZaloTextEvent({
      msgId: msgId1,
      userId: userId1,
      text: 'Bé nhà mình 7 tuổi muốn học tiếng Trung cơ bản.'
    });

    const res1 = await liveWorld.postZaloEvent(payload1, { sign: true });
    assertHttpStatus(res1, 200, 'POST signed raw hex zalo event');
    assert.equal(res1.json.ok, true);
    assert.equal(res1.json.duplicate, false);
    assert.equal(res1.json.event_id, msgId1);
    assert.ok(res1.json.consultation_id);
    assertNoSecretLeaks(res1.json, { rootDir: ROOT_DIR });

    const convRes = await liveWorld.db.query(
      'SELECT id, channel, external_id, zalo_user_id, source_tag FROM public.ktn_consultations WHERE id = $1',
      [res1.json.consultation_id]
    );
    assert.equal(convRes.rows.length, 1);
    assert.equal(convRes.rows[0].channel, 'zalo_oa');
    assert.equal(convRes.rows[0].external_id, userId1);
    assert.equal(convRes.rows[0].zalo_user_id, userId1);
    assert.equal(convRes.rows[0].source_tag, 'zalo_oa');

    const evtRes = await liveWorld.db.query(
      'SELECT event_id, status, consultation_id FROM public.ktn_zalo_oa_events WHERE event_id = $1',
      [msgId1]
    );
    assert.equal(evtRes.rows.length, 1);
    assert.equal(evtRes.rows[0].status, 'processed');
    assert.equal(evtRes.rows[0].consultation_id, res1.json.consultation_id);

    const msgRes = await liveWorld.db.query(
      'SELECT sender, external_id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = $2',
      [res1.json.consultation_id, 'customer']
    );
    assert.equal(msgRes.rows.length, 1);
    assert.equal(msgRes.rows[0].external_id, `zalo:${msgId1}`);

    // Also verify mac=<hex> header format on /api/ktn/consultations/zalo/webhook
    const userId2 = uniqueUserId('live-mac');
    const msgId2 = uniqueMsgId('mmac');
    const payload2 = makeZaloTextEvent({ msgId: msgId2, userId: userId2, text: 'Xin tư vấn lộ trình YCT.' });
    const raw2 = JSON.stringify(payload2);
    const ts2 = String(payload2.timestamp);
    const sig2 = zaloSign(liveWorld.env.KTN_ZALO_APP_ID, raw2, ts2, liveWorld.env.KTN_ZALO_APP_SECRET);
    const res2 = await liveWorld.request('/api/ktn/consultations/zalo/webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ZEvent-Signature': `mac=${sig2}`,
        'X-ZEvent-Timestamp': ts2
      },
      body: raw2
    });
    assertHttpStatus(res2, 200, 'POST signed mac= zalo webhook');
    assert.equal(res2.json.ok, true);
    assert.equal(res2.json.duplicate, false);
    assert.equal(res2.json.event_id, msgId2);
  });

  it('[F03] T1-ZALO-F03-03: Sandbox route and X-KTN-Sandbox header intake without signature', async () => {
    const userId1 = uniqueUserId('sb-route');
    const msgId1 = uniqueMsgId('msb1');
    const res1 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: msgId1, userId: userId1, text: 'Chào KTN, bé 6 tuổi muốn học thử.' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(res1, 200, 'POST /zalo/sandbox/event unsigned');
    assert.equal(res1.json.ok, true);
    assert.equal(res1.json.duplicate, false);

    const userId2 = uniqueUserId('sb-hdr');
    const msgId2 = uniqueMsgId('msb2');
    const res2 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: msgId2, userId: userId2, text: 'Mình muốn hỏi khóa cho bé 8 tuổi.' }),
      { sign: false, sandbox: true, path: '/api/ktn/consultations/zalo' }
    );
    assertHttpStatus(res2, 200, 'POST /zalo with X-KTN-Sandbox unsigned');
    assert.equal(res2.json.ok, true);
    assert.equal(res2.json.duplicate, false);

    const rows = await sandboxWorld.db.query(
      'SELECT id, channel FROM public.ktn_consultations WHERE id = ANY($1::uuid[])',
      [[res1.json.consultation_id, res2.json.consultation_id]]
    );
    assert.equal(rows.rows.length, 2);
    assert.ok(rows.rows.every((r) => r.channel === 'zalo_oa'));
  });

  it('[F03] T1-ZALO-F03-04: Idempotent msg_id deduplication prevents duplicate DB rows and bot replies', async () => {
    const userId = uniqueUserId('dedup');
    const msgId = uniqueMsgId('mdedup');
    const event = makeZaloTextEvent({
      msgId,
      userId,
      text: 'Bé nhà chị 7 tuổi chưa học bao giờ, muốn tìm khóa video tự học.'
    });

    const first = await sandboxWorld.postZaloEvent(event, { sign: false, sandbox: true });
    assertHttpStatus(first, 200, 'First Zalo delivery');
    assert.equal(first.json.ok, true);
    assert.equal(first.json.duplicate, false);
    const convId = first.json.consultation_id;

    const afterFirstMsgs = await sandboxWorld.db.query(
      'SELECT sender FROM public.ktn_consultation_messages WHERE consultation_id = $1 ORDER BY created_at',
      [convId]
    );
    assert.equal(afterFirstMsgs.rows.filter((r) => r.sender === 'customer').length, 1);
    assert.equal(afterFirstMsgs.rows.filter((r) => r.sender === 'bot').length, 1);

    const second = await sandboxWorld.postZaloEvent(event, { sign: false, sandbox: true });
    assertHttpStatus(second, 200, 'Replayed Zalo delivery');
    assert.equal(second.json.ok, true);
    assert.equal(second.json.duplicate, true);
    assert.equal(second.json.event_id, msgId);

    const afterSecondMsgs = await sandboxWorld.db.query(
      'SELECT sender FROM public.ktn_consultation_messages WHERE consultation_id = $1',
      [convId]
    );
    assert.equal(afterSecondMsgs.rows.filter((r) => r.sender === 'customer').length, 1);
    assert.equal(afterSecondMsgs.rows.filter((r) => r.sender === 'bot').length, 1);

    const evtCount = await sandboxWorld.db.query(
      'SELECT count(*)::int AS cnt FROM public.ktn_zalo_oa_events WHERE event_id = $1',
      [msgId]
    );
    assert.equal(evtCount.rows[0].cnt, 1);
  });

  it('[F03] T1-ZALO-F03-05: OA echo (oa_send_text) stores external sender, moves bot thread to waiting, and cancels queued bot reply', async () => {
    const userId = uniqueUserId('echo');
    const echoMsgId = uniqueMsgId('mecho');

    const insertedConv = await liveWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status)
       VALUES ('zalo_oa', $1, $1, 'bot') RETURNING id`,
      [userId]
    );
    const convId = insertedConv.rows[0].id;

    const insertedBotMsg = await liveWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'bot', 'Tin nhắn bot đang chờ gửi', 'queued') RETURNING id`,
      [convId]
    );
    const queuedBotMsgId = insertedBotMsg.rows[0].id;

    const echoEvent = makeZaloTextEvent({
      msgId: echoMsgId,
      userId,
      eventName: 'oa_send_text',
      isEcho: true,
      text: 'Chào chị, em là tư vấn viên hỗ trợ trực tiếp trên Zalo OA.'
    });
    const res = await liveWorld.postZaloEvent(echoEvent, { sign: true });
    assertHttpStatus(res, 200, 'POST signed oa_send_text echo');
    assert.equal(res.json.ok, true);
    assert.equal(res.json.duplicate, false);
    assert.equal(res.json.status, 'waiting');

    const convCheck = await liveWorld.db.query(
      'SELECT status FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convCheck.rows[0].status, 'waiting');

    const echoRow = await liveWorld.db.query(
      'SELECT sender, external_id, delivery FROM public.ktn_consultation_messages WHERE external_id = $1',
      [`zalo:${echoMsgId}`]
    );
    assert.equal(echoRow.rows.length, 1);
    assert.equal(echoRow.rows[0].sender, 'external');
    assert.equal(echoRow.rows[0].delivery, 'sent');

    const cancelledBot = await liveWorld.db.query(
      'SELECT delivery, delivery_note FROM public.ktn_consultation_messages WHERE id = $1',
      [queuedBotMsgId]
    );
    assert.equal(cancelledBot.rows[0].delivery, 'failed');
    assert.equal(cancelledBot.rows[0].delivery_note, 'Đã có phản hồi từ Zalo OA');

    const sendCalls = liveWorld.mocks.upstreamCalls.zalo.filter((c) => c.url.includes('/oa/message/cs'));
    assert.equal(sendCalls.length, 0);
  });

  // =========================================================================
  // F04 — Zalo OA Bidirectional Sync & Outbox Delivery (5 tests)
  // =========================================================================

  it('[F04] T1-ZALO-F04-01: user_submit_info syncs customer_name, normalizes 84... phone, saves address, and surfaces in inbox', async () => {
    const userId = uniqueUserId('subinfo');
    const msgId = uniqueMsgId('minfo');
    const submitEvent = makeZaloSubmitInfoEvent({
      msgId,
      userId,
      name: 'Phụ Huynh Lan',
      phone: '84912345678',
      address: 'Hà Nội'
    });

    const res = await sandboxWorld.postZaloEvent(submitEvent, { sign: false, sandbox: true });
    assertHttpStatus(res, 200, 'POST user_submit_info');
    assert.equal(res.json.ok, true);
    assert.equal(res.json.duplicate, false);
    const convId = res.json.consultation_id;

    const convRow = await sandboxWorld.db.query(
      'SELECT customer_name, customer_phone, zalo_user_id, lead_meta FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convRow.rows[0].customer_name, 'Phụ Huynh Lan');
    assert.equal(convRow.rows[0].customer_phone, '0912345678');
    assert.equal(convRow.rows[0].zalo_user_id, userId);
    assert.equal(convRow.rows[0].lead_meta.address, 'Hà Nội');
    assert.equal(convRow.rows[0].lead_meta.zalo_event, 'user_submit_info');

    const botMsgs = await sandboxWorld.db.query(
      "SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'",
      [convId]
    );
    assert.equal(botMsgs.rows.length, 0);

    const inbox = await sandboxWorld.staffReq('staff/inbox?channel=zalo_oa', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(inbox, 200, 'manager inbox after user_submit_info');
    const match = inbox.json.conversations.find((c) => c.id === convId);
    assert.ok(match, 'Lead should appear in staff/inbox');
    assert.equal(match.customer_name, 'Phụ Huynh Lan');
    assert.equal(match.customer_phone, '0912345678');
    assert.equal(match.zalo_user_id, userId);
  });

  it('[F04] T1-ZALO-F04-02: Live user_send_text fetches OA user profile and tags 963k ad source_tag', async () => {
    const userId = uniqueUserId('prof');
    const msgId = uniqueMsgId('mprof');
    const event = makeZaloTextEvent({
      msgId,
      userId,
      text: 'Mình xem gói 963k, muốn học để trao đổi với nhà cung cấp, chưa học bao giờ.'
    });

    const res = await liveWorld.postZaloEvent(event, { sign: true });
    assertHttpStatus(res, 200, 'POST live 963k text');
    const convId = res.json.consultation_id;

    const detailCalls = liveWorld.mocks.upstreamCalls.zalo.filter((c) => c.url.includes('/v3.0/oa/user/detail'));
    assert.ok(detailCalls.length >= 1, 'Expected GET /v3.0/oa/user/detail call');
    assert.equal(detailCalls[0].headers.access_token, liveWorld.env.KTN_ZALO_OA_ACCESS_TOKEN);

    const convRow = await liveWorld.db.query(
      'SELECT customer_name, source_tag, lead_meta, status FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convRow.rows[0].customer_name, 'Phụ Huynh Zalo Mock');
    assert.equal(convRow.rows[0].source_tag, 'ad_963k');
    assert.equal(convRow.rows[0].lead_meta.ad_package, 'ad_963k');
    assert.equal(convRow.rows[0].lead_meta.flow, 'adult_1_1');
    assert.equal(convRow.rows[0].status, 'open');
  });

  it('[F04] T1-ZALO-F04-03: Live outbox delivers scripted quick-reply menu via Zalo OA v3 CS API', async () => {
    const userId = uniqueUserId('qr-menu');
    const msgId = uniqueMsgId('mmenu');
    const event = makeZaloTextEvent({ msgId, userId, text: 'MENU_ROOT' });

    const res = await liveWorld.postZaloEvent(event, { sign: true });
    assertHttpStatus(res, 200, 'POST live MENU_ROOT');
    const convId = res.json.consultation_id;

    const csCalls = liveWorld.mocks.upstreamCalls.zalo.filter((c) => c.url.includes('/v3.0/oa/message/cs'));
    assert.equal(csCalls.length, 1);
    assert.equal(csCalls[0].headers.access_token, liveWorld.env.KTN_ZALO_OA_ACCESS_TOKEN);
    assert.equal(csCalls[0].body.recipient.user_id, userId);
    assert.equal(csCalls[0].body.message.attachment.type, 'template');
    assert.equal(csCalls[0].body.message.attachment.payload.template_type, 'request_user_info');
    assert.equal(csCalls[0].body.message.attachment.payload.buttons.length, 5);

    const botMsg = await liveWorld.db.query(
      "SELECT delivery, external_id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'",
      [convId]
    );
    assert.equal(botMsg.rows.length, 1);
    assert.equal(botMsg.rows[0].delivery, 'sent');
    assert.match(botMsg.rows[0].external_id, /^zalo:zalo_msg_/);
  });

  it('[F04] T1-ZALO-F04-04: Sandbox outbox delivers bot and advisor replies with zalo_sandbox: external_id and zero upstream calls', async () => {
    const userId = uniqueUserId('sb-out');
    const eventRes = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('msbo'), userId, text: 'MENU_ROOT' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(eventRes, 200, 'sandbox MENU_ROOT');
    const convId = eventRes.json.consultation_id;

    const claimRes = await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claimRes, 200, 'advisor claim');

    const replyRes = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Chào anh/chị, em hỗ trợ mình chọn khóa phù hợp ạ.', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(replyRes, 200, 'advisor sandbox reply');

    const msgs = await sandboxWorld.db.query(
      'SELECT sender, delivery, external_id FROM public.ktn_consultation_messages WHERE consultation_id = $1 ORDER BY created_at',
      [convId]
    );
    const botRow = msgs.rows.find((m) => m.sender === 'bot');
    const advRow = msgs.rows.find((m) => m.sender === 'advisor');
    assert.equal(botRow.delivery, 'sent');
    assert.match(botRow.external_id, /^zalo_sandbox:/);
    assert.equal(advRow.delivery, 'sent');
    assert.match(advRow.external_id, /^zalo_sandbox:/);
    assert.equal(sandboxWorld.mocks.upstreamCalls.zalo.length, 0);
  });

  it('[F04] T1-ZALO-F04-05: VietQR image media template delivered to Zalo OA on web/order creation', async () => {
    const userId = uniqueUserId('vqr');
    const evRes = await liveWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mvqr'), userId, text: 'Bé nhà chị 7 tuổi cần tư vấn khóa học.' }),
      { sign: true }
    );
    assertHttpStatus(evRes, 200, 'live inbound before order');
    const convId = evRes.json.consultation_id;

    const claimRes = await liveWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claimRes, 200, 'advisor claim');

    const linkRes = await liveWorld.staffReq(`staff/thread/${convId}/checkout_link`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(linkRes, 200, 'checkout_link');
    const checkoutTicket = new URL(linkRes.json.url).hash.replace('#checkout=', '');
    assert.ok(checkoutTicket);

    liveWorld.mocks.clearUpstreamCalls();

    const course = CATALOG_COURSES[0];
    const orderRes = await liveWorld.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: checkoutTicket,
      json: {
        courseId: course.course_id,
        name: LEARNERS_AND_PARENTS.parentMinh.name,
        email: LEARNERS_AND_PARENTS.parentMinh.email,
        phone: LEARNERS_AND_PARENTS.parentMinh.phone,
        requestId: crypto.randomUUID()
      }
    });
    assertHttpStatus(orderRes, 200, 'POST web/order for zalo_oa');
    assert.match(orderRes.json.id, /^ORD-\d{6}$/);
    assertVietQrPayment(orderRes.json.payment, orderRes.json.id, course.price, liveWorld.env.KTN_SEPAY_ACCOUNT_NO);

    const csCalls = liveWorld.mocks.upstreamCalls.zalo.filter((c) => c.url.includes('/v3.0/oa/message/cs'));
    assert.equal(csCalls.length, 1);
    const mediaPayload = csCalls[0].body.message.attachment;
    assert.equal(mediaPayload.type, 'template');
    assert.equal(mediaPayload.payload.template_type, 'media');
    assert.equal(mediaPayload.payload.elements[0].media_type, 'image');
    assert.ok(mediaPayload.payload.elements[0].url.startsWith('https://img.vietqr.io/image/'));

    const sysMsg = await liveWorld.db.query(
      "SELECT delivery, external_id, body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'system' ORDER BY created_at DESC LIMIT 1",
      [convId]
    );
    assert.equal(sysMsg.rows[0].delivery, 'sent');
    assert.match(sysMsg.rows[0].external_id, /^zalo:zalo_msg_/);
    assert.ok(sysMsg.rows[0].body.includes(orderRes.json.id));
  });

  // =========================================================================
  // F05 — Zalo OA Multi-Staff Permission & Migration Continuity (5 tests)
  // =========================================================================

  it('[F05] T1-ZALO-F05-01: Single official OA converges same user into one thread across multi-staff reassignment', async () => {
    const userId = uniqueUserId('single-oa');
    const r1 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('soa1'), userId, text: 'Chào trung tâm ạ.' }),
      { sign: false, sandbox: true }
    );
    const r2 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('soa2'), userId, text: 'Cho mình hỏi khóa cho bé 7 tuổi.' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(r1, 200);
    assertHttpStatus(r2, 200);
    assert.equal(r1.json.consultation_id, r2.json.consultation_id);
    const convId = r1.json.consultation_id;

    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    const rep1 = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Tư vấn viên An chào chị ạ.', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(rep1, 200);

    const assignRes = await sandboxWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[1].email }
    });
    assertHttpStatus(assignRes, 200);

    const rep2 = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[1],
      authType: 'supabase-jwt',
      json: { body: 'Tư vấn viên Bình tiếp tục hỗ trợ chị ạ.', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(rep2, 200);

    const convCount = await sandboxWorld.db.query(
      "SELECT count(*)::int AS cnt FROM public.ktn_consultations WHERE channel = 'zalo_oa' AND external_id = $1",
      [userId]
    );
    assert.equal(convCount.rows[0].cnt, 1);

    const advMsgs = await sandboxWorld.db.query(
      "SELECT actor_email, delivery FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' ORDER BY created_at",
      [convId]
    );
    assert.deepEqual(
      advMsgs.rows.map((r) => ({ actor_email: r.actor_email, delivery: r.delivery })),
      [
        { actor_email: STAFF_ACTORS.advisors[0].email, delivery: 'sent' },
        { actor_email: STAFF_ACTORS.advisors[1].email, delivery: 'sent' }
      ]
    );
  });

  it('[F05] T1-ZALO-F05-02: Advisor directory management (GET/PUT staff/advisors) and role-scoped login/profile', async () => {
    const listBefore = await sandboxWorld.staffReq('staff/advisors', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(listBefore, 200, 'GET staff/advisors');
    assert.ok(listBefore.json.advisors.length >= 4);

    const newEmail = 'advisor.dung@khongtunhi.com';
    const upsertRes = await sandboxWorld.staffReq('staff/advisors', {
      method: 'PUT',
      actor: STAFF_ACTORS.manager,
      json: { email: newEmail, name: 'Tư Vấn Dũng', active: true }
    });
    assertHttpStatus(upsertRes, 200, 'PUT staff/advisors');
    assert.equal(upsertRes.json.advisor.email, newEmail);
    assert.equal(upsertRes.json.advisor.active, true);

    const password = 'AdvisorDungPassword!2026';
    sandboxWorld.mocks.registerJwtUser({ email: newEmail, password });
    const loginRes = await sandboxWorld.request('/api/ktn/consultations/staff/login', {
      method: 'POST',
      json: { email: newEmail, password }
    });
    assertHttpStatus(loginRes, 200, 'POST staff/login for newly added advisor');
    assert.ok(loginRes.json.token);
    assert.equal(loginRes.json.actor.email, newEmail);
    assert.equal(loginRes.json.actor.admin, false);

    const profileAdv = await sandboxWorld.request('/api/ktn/consultations/staff/profile', {
      token: loginRes.json.token
    });
    assertHttpStatus(profileAdv, 200, 'GET staff/profile advisor');
    assert.equal(profileAdv.json.actor.admin, false);
    assert.equal(profileAdv.json.actor.email, newEmail);

    const profileMgr = await sandboxWorld.staffReq('staff/profile', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(profileMgr, 200, 'GET staff/profile manager');
    assert.equal(profileMgr.json.actor.admin, true);
  });

  it('[F05] T1-ZALO-F05-03: Pre-existing open Zalo thread retains owner_email and skips bot during OA rollout', async () => {
    const userId = uniqueUserId('legacy');
    const owner = STAFF_ACTORS.advisors[0].email;

    const seeded = await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (
         channel, external_id, zalo_user_id, owner_email, status, source_tag,
         customer_name, last_customer_at, last_reply_at
       ) VALUES (
         'zalo_oa', $1, $1, $2, 'open', 'zalo_legacy',
         'Phụ Huynh Cũ', now() - interval '2 hours', now() - interval '1 hour'
       ) RETURNING id`,
      [userId, owner]
    );
    const convId = seeded.rows[0].id;
    await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
       VALUES ($1, 'customer', 'Tin nhắn cũ từ trước', 'sent'), ($1, 'advisor', 'Phản hồi cũ từ advisor', 'sent')`,
      [convId]
    );

    const inbound = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mleg'), userId, text: 'Chị muốn hỏi thêm về lịch học ạ.' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(inbound, 200, 'inbound on pre-existing open Zalo thread');
    assert.equal(inbound.json.consultation_id, convId);
    assert.equal(inbound.json.status, 'open');

    const convCheck = await sandboxWorld.db.query(
      'SELECT status, owner_email, source_tag FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convCheck.rows[0].status, 'open');
    assert.equal(convCheck.rows[0].owner_email, owner);
    assert.equal(convCheck.rows[0].source_tag, 'zalo_legacy');

    const botMsgs = await sandboxWorld.db.query(
      "SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'bot'",
      [convId]
    );
    assert.equal(botMsgs.rows.length, 0);

    const threadRes = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(threadRes, 200);
    assert.equal(threadRes.json.messages.length, 3);
  });

  it('[F05] T1-ZALO-F05-04: Updating guidance knowledge base preserves active open Zalo OA threads', async () => {
    const userId = uniqueUserId('kb-keep');
    const evRes = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mkb'), userId, text: 'Chào trung tâm' }),
      { sign: false, sandbox: true }
    );
    const convId = evRes.json.consultation_id;

    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const getG = await sandboxWorld.staffReq('staff/guidance', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(getG, 200, 'GET staff/guidance');
    const cfg = getG.json.config;

    const putG = await sandboxWorld.staffReq('staff/guidance', {
      method: 'PUT',
      actor: STAFF_ACTORS.manager,
      json: {
        course_ids: cfg.course_ids,
        duration_presets: cfg.duration_presets,
        policy: `${cfg.policy}\nCập nhật hướng dẫn Zalo OA chuẩn.`,
        examples: [
          ...cfg.examples,
          { question: 'Zalo OA có hỗ trợ chọn khóa không?', answer: 'Có, phụ huynh nhắn độ tuổi và mục tiêu của bé nhé.', hints: ['zalo'] }
        ],
        bot_enabled: true,
        checkout_enabled: true
      }
    });
    assertHttpStatus(putG, 200, 'PUT staff/guidance');

    const convCheck = await sandboxWorld.db.query(
      'SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.equal(convCheck.rows[0].status, 'open');
    assert.equal(convCheck.rows[0].owner_email, STAFF_ACTORS.advisors[0].email);

    const repRes = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Em vẫn theo dõi ca Zalo OA của chị bình thường ạ.', request_id: crypto.randomUUID() }
    });
    assertHttpStatus(repRes, 200);
  });

  it('[F05] T1-ZALO-F05-05: Multi-staff channel visibility scopes Zalo OA vs Web inbox by advisor ownership', async () => {
    const zRes = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mvis'), userId: uniqueUserId('vis'), text: 'Hỏi khóa trên Zalo' }),
      { sign: false, sandbox: true }
    );
    const zaloConvId = zRes.json.consultation_id;

    const webStart = await sandboxWorld.startWebChat();
    await sandboxWorld.sendWebMessage(webStart.token, 'Hỏi khóa trên Web');
    const webConvRow = await sandboxWorld.db.query(
      "SELECT id FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1"
    );
    const webConvId = webConvRow.rows[0].id;

    await sandboxWorld.staffReq(`staff/thread/${zaloConvId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    await sandboxWorld.staffReq(`staff/thread/${webConvId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[1],
      authType: 'supabase-jwt',
      json: {}
    });

    const advInbox = await sandboxWorld.staffReq('staff/inbox?channel=zalo_oa', {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(advInbox, 200);
    const advIds = advInbox.json.conversations.map((c) => c.id);
    assert.ok(advIds.includes(zaloConvId));
    assert.equal(advIds.includes(webConvId), false);

    const mgrInbox = await sandboxWorld.staffReq('staff/inbox', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(mgrInbox, 200);
    const mgrIds = mgrInbox.json.conversations.map((c) => c.id);
    assert.ok(mgrIds.includes(zaloConvId));
    assert.ok(mgrIds.includes(webConvId));
  });

  // =========================================================================
  // F11 — Multi-Advisor Inbox, Round-Robin Auto-Assign & Reassign (5 tests)
  // =========================================================================

  it('[F11] T1-ZALO-F11-01: Round-robin auto_assign distributes 3 waiting threads evenly across 3 active advisors', async () => {
    const convIds = [];
    for (let i = 0; i < 3; i++) {
      const res = await sandboxWorld.postZaloEvent(
        makeZaloTextEvent({ msgId: uniqueMsgId(`mrr${i}`), userId: uniqueUserId(`rr${i}`), text: 'Gặp tư vấn viên' }),
        { sign: false, sandbox: true }
      );
      assertHttpStatus(res, 200);
      convIds.push(res.json.consultation_id);
    }

    const assignedRows = await sandboxWorld.db.query(
      'SELECT id, status, owner_email FROM public.ktn_consultations WHERE id = ANY($1::uuid[])',
      [convIds]
    );
    assert.equal(assignedRows.rows.length, 3);
    assert.ok(assignedRows.rows.every((r) => r.status === 'open'));

    const owners = assignedRows.rows.map((r) => r.owner_email).sort();
    const expectedOwners = STAFF_ACTORS.advisors.map((a) => a.email).sort();
    assert.deepEqual(owners, expectedOwners);
    assert.equal(owners.includes(STAFF_ACTORS.inactiveAdvisor.email), false);

    const evtRows = await sandboxWorld.db.query(
      "SELECT consultation_id, kind FROM public.ktn_consultation_events WHERE consultation_id = ANY($1::uuid[]) AND kind = 'assigned'",
      [convIds]
    );
    assert.equal(evtRows.rows.length, 3);
  });

  it('[F11] T1-ZALO-F11-02: Unified staff/inbox filters (channel, status, owner) and extended lead metadata projection', async () => {
    const uWait = uniqueUserId('f-wait');
    const uOpen = uniqueUserId('f-open');
    const uClosed = uniqueUserId('f-closed');
    const uOverdue = uniqueUserId('f-over');

    // 1. waiting thread via echo
    const rWait = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mw'), userId: uWait, text: 'Chào shop' }),
      { sign: false, sandbox: true }
    );
    await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mwe'), userId: uWait, eventName: 'oa_send_text', isEcho: true, text: 'Chờ xíu nhé' }),
      { sign: false, sandbox: true }
    );
    await sandboxWorld.postZaloEvent(
      makeZaloSubmitInfoEvent({ msgId: uniqueMsgId('mwi'), userId: uWait, name: 'Lead Waiting', phone: '0901112233' }),
      { sign: false, sandbox: true }
    );

    // 2. open unanswered thread (handoff sends system msg, then customer sends follow-up so reply_pending=true)
    const rOpen = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mo'), userId: uOpen, text: 'Mình xem gói 963k' }),
      { sign: false, sandbox: true }
    );
    const idOpen = rOpen.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${idOpen}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[0].email }
    });
    await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mo2'), userId: uOpen, text: 'Cho mình hỏi thêm lịch tối nhé.' }),
      { sign: false, sandbox: true }
    );

    // 3. closed thread
    const rClosed = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mc'), userId: uClosed, text: 'Mình cần hỗ trợ' }),
      { sign: false, sandbox: true }
    );
    const idClosed = rClosed.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${idClosed}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[1].email }
    });
    await sandboxWorld.staffReq(`staff/thread/${idClosed}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { outcome: 'registered' }
    });

    // 4. overdue thread
    const rOver = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mov'), userId: uOverdue, text: 'Tư vấn bé 9 tuổi' }),
      { sign: false, sandbox: true }
    );
    const idOver = rOver.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${idOver}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[2].email }
    });
    await sandboxWorld.staffReq(`staff/thread/${idOver}/follow_up`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { at: new Date(Date.now() - 3600_000).toISOString() }
    });

    // 5. web thread to verify channel=zalo_oa exclusion
    const webStart = await sandboxWorld.startWebChat();
    await sandboxWorld.sendWebMessage(webStart.token, 'Tin nhắn web');

    const byZalo = await sandboxWorld.staffReq('staff/inbox?channel=zalo_oa', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(byZalo, 200);
    assert.ok(byZalo.json.conversations.every((c) => c.channel === 'zalo_oa'));
    assert.equal(byZalo.json.conversations.length, 4);

    const byWaiting = await sandboxWorld.staffReq('staff/inbox?status=waiting', { actor: STAFF_ACTORS.manager });
    assert.deepEqual(byWaiting.json.conversations.map((c) => c.id), [rWait.json.consultation_id]);
    assert.equal(byWaiting.json.conversations[0].customer_name, 'Lead Waiting');
    assert.equal(byWaiting.json.conversations[0].customer_phone, '0901112233');
    assert.equal(byWaiting.json.conversations[0].zalo_user_id, uWait);

    const byUnassigned = await sandboxWorld.staffReq('staff/inbox?owner=unassigned', { actor: STAFF_ACTORS.manager });
    assert.ok(byUnassigned.json.conversations.some((c) => c.id === rWait.json.consultation_id));

    const byOwnerAn = await sandboxWorld.staffReq(`staff/inbox?owner=${encodeURIComponent(STAFF_ACTORS.advisors[0].email)}`, {
      actor: STAFF_ACTORS.manager
    });
    assert.deepEqual(byOwnerAn.json.conversations.map((c) => c.id), [idOpen]);
    assert.equal(byOwnerAn.json.conversations[0].source_tag, 'ad_963k');
    assert.equal(byOwnerAn.json.conversations[0].reply_pending, true);

    const byClosed = await sandboxWorld.staffReq('staff/inbox?status=closed', { actor: STAFF_ACTORS.manager });
    assert.deepEqual(byClosed.json.conversations.map((c) => c.id), [idClosed]);

    const byOverdue = await sandboxWorld.staffReq('staff/inbox?status=overdue', { actor: STAFF_ACTORS.manager });
    assert.deepEqual(byOverdue.json.conversations.map((c) => c.id), [idOver]);
  });

  it('[F11] T1-ZALO-F11-03: AC01 advisor claim (waiting -> open) and safe thread inspection', async () => {
    const userId = uniqueUserId('claim');
    const r1 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mc1'), userId, text: 'Chào trung tâm' }),
      { sign: false, sandbox: true }
    );
    await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mc2'), userId, eventName: 'oa_send_text', isEcho: true, text: 'Đợi nhân viên nhận ca' }),
      { sign: false, sandbox: true }
    );
    const convId = r1.json.consultation_id;

    const inbox = await sandboxWorld.staffReq('staff/inbox?status=waiting', {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(inbox, 200);
    assert.ok(inbox.json.conversations.some((c) => c.id === convId));

    const claim = await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(claim, 200);
    assert.equal(claim.json.updated, true);

    const thread = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(thread, 200);
    assert.equal(thread.json.conversation.status, 'open');
    assert.equal(thread.json.conversation.owner_email, STAFF_ACTORS.advisors[0].email);
    assertSafeStaffThreadResponse(thread.json, { isAdmin: false });
  });

  it('[F11] T1-ZALO-F11-04: Manager reassignment transfers ownership with full history and unassign returns to waiting', async () => {
    const userId = uniqueUserId('reassign');
    const ev = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mra'), userId, text: 'Hỏi lộ trình cho bé' }),
      { sign: false, sandbox: true }
    );
    const convId = ev.json.consultation_id;

    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Em An chào chị ạ.', request_id: crypto.randomUUID() }
    });
    await sandboxWorld.staffReq(`staff/thread/${convId}/note`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Ghi chú bàn giao: bé 7 tuổi, thích nghe nói.' }
    });

    const reassign = await sandboxWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[1].email }
    });
    assertHttpStatus(reassign, 200);

    const prevRead = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(prevRead, 403, 'Previous advisor loses read access after reassignment');

    const nextRead = await sandboxWorld.staffReq(`staff/thread/${convId}`, {
      actor: STAFF_ACTORS.advisors[1],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(nextRead, 200, 'New advisor sees full history + internal notes');
    assert.ok(nextRead.json.messages.some((m) => m.body.includes('Em An chào chị ạ')));
    assert.ok(nextRead.json.events.some((e) => e.kind === 'note' && e.detail.body.includes('Ghi chú bàn giao')));
    assert.ok(
      nextRead.json.events.some(
        (e) => e.kind === 'assigned' && e.detail.from === STAFF_ACTORS.advisors[0].email && e.detail.to === STAFF_ACTORS.advisors[1].email
      )
    );

    const unassign = await sandboxWorld.staffReq(`staff/thread/${convId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: '' }
    });
    assertHttpStatus(unassign, 200);

    const dbRow = await sandboxWorld.db.query('SELECT status, owner_email FROM public.ktn_consultations WHERE id = $1', [convId]);
    assert.equal(dbRow.rows[0].status, 'waiting');
    assert.equal(dbRow.rows[0].owner_email, null);
  });

  it('[F11] T1-ZALO-F11-05: Inbox pagination returns 50 items per page with accurate hasMore and offset', async () => {
    // Insert 52 rows with valid last_customer_at so all appear in ktn_consultation_inbox
    await sandboxWorld.db.query(
      `INSERT INTO public.ktn_consultations (channel, external_id, zalo_user_id, status, last_customer_at, updated_at)
       SELECT 'zalo_oa', 'zpage_' || g, 'zpage_' || g, 'waiting', now() - (g || ' seconds')::interval, now() - (g || ' seconds')::interval
       FROM generate_series(1, 52) AS g`
    );

    const page1 = await sandboxWorld.staffReq('staff/inbox?channel=zalo_oa&offset=0', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(page1, 200);
    assert.equal(page1.json.conversations.length, 50);
    assert.equal(page1.json.hasMore, true);

    const page2 = await sandboxWorld.staffReq('staff/inbox?channel=zalo_oa&offset=50', { actor: STAFF_ACTORS.manager });
    assertHttpStatus(page2, 200);
    assert.equal(page2.json.conversations.length, 2);
    assert.equal(page2.json.hasMore, false);

    const distinctIds = new Set([
      ...page1.json.conversations.map((c) => c.id),
      ...page2.json.conversations.map((c) => c.id)
    ]);
    assert.equal(distinctIds.size, 52);
  });

  // =========================================================================
  // F12 — Advisor Reply, Internal Notes, Follow-up & Close/Reopen (5 tests)
  // =========================================================================

  it('[F12] T1-ZALO-F12-01: Advisor reply persists sender/actor_email, updates reply timestamps, and completes outbox', async () => {
    const ev = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mr1'), userId: uniqueUserId('r1'), text: 'Xin hỏi khóa cho bé 7 tuổi' }),
      { sign: false, sandbox: true }
    );
    const convId = ev.json.consultation_id;

    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const reqId = crypto.randomUUID();
    const replyRes = await sandboxWorld.staffReq(`staff/thread/${convId}/reply`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Chào chị, bé 7 tuổi phù hợp lộ trình Tiểu học ạ.', request_id: reqId }
    });
    assertHttpStatus(replyRes, 200);
    assert.equal(replyRes.json.updated, true);

    const msgRow = await sandboxWorld.db.query(
      "SELECT sender, actor_email, delivery, external_id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor'",
      [convId]
    );
    assert.equal(msgRow.rows.length, 1);
    assert.equal(msgRow.rows[0].actor_email, STAFF_ACTORS.advisors[0].email);
    assert.equal(msgRow.rows[0].delivery, 'sent');
    assert.match(msgRow.rows[0].external_id, /^zalo_sandbox:/);

    const convRow = await sandboxWorld.db.query(
      'SELECT first_reply_at, last_reply_at, next_review_at FROM public.ktn_consultations WHERE id = $1',
      [convId]
    );
    assert.ok(convRow.rows[0].first_reply_at);
    assert.ok(convRow.rows[0].last_reply_at);
    assert.ok(convRow.rows[0].next_review_at);
  });

  it('[F12] T1-ZALO-F12-02: Internal note visible to owning/reassigned staff and never leaked to customer', async () => {
    // (a) Zalo OA note preserved across reassignment, kept out of public messages
    const zEv = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mnz'), userId: uniqueUserId('nz'), text: 'Cho mình hỏi khóa học' }),
      { sign: false, sandbox: true }
    );
    const zId = zEv.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${zId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    const noteRes = await sandboxWorld.staffReq(`staff/thread/${zId}/note`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'Khách quan tâm lớp tối 20h' }
    });
    assertHttpStatus(noteRes, 200);

    await sandboxWorld.staffReq(`staff/thread/${zId}/assign`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { email: STAFF_ACTORS.advisors[1].email }
    });
    const adv2Thread = await sandboxWorld.staffReq(`staff/thread/${zId}`, {
      actor: STAFF_ACTORS.advisors[1],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(adv2Thread, 200);
    assert.ok(adv2Thread.json.events.some((e) => e.kind === 'note' && e.detail.body === 'Khách quan tâm lớp tối 20h'));
    assert.ok(adv2Thread.json.messages.some((m) => m.sender === 'note' && m.body === 'Khách quan tâm lớp tối 20h'));
    assert.equal(adv2Thread.json.messages.some((m) => m.sender !== 'note' && m.body.includes('Khách quan tâm lớp tối 20h')), false);
    const dbNoteMsgs = await sandboxWorld.db.query(
      'SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND body LIKE $2',
      [zId, '%Khách quan tâm lớp tối 20h%']
    );
    assert.equal(dbNoteMsgs.rows.length, 0);

    // (b) Web thread note never leaked via GET web/thread
    const webStart = await sandboxWorld.startWebChat();
    await sandboxWorld.sendWebMessage(webStart.token, 'Chào shop trên web');
    const webRow = await sandboxWorld.db.query(
      "SELECT id FROM public.ktn_consultations WHERE channel = 'web' ORDER BY created_at DESC LIMIT 1"
    );
    const webId = webRow.rows[0].id;
    await sandboxWorld.staffReq(`staff/thread/${webId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    await sandboxWorld.staffReq(`staff/thread/${webId}/note`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { body: 'SECRET_INTERNAL_NOTE_ONLY_STAFF' }
    });

    const custThread = await sandboxWorld.request('/api/ktn/consultations/web/thread', {
      token: webStart.token
    });
    assertHttpStatus(custThread, 200);
    assertSafeCustomerThreadResponse(custThread.json);
    assert.equal(custThread.text.includes('SECRET_INTERNAL_NOTE_ONLY_STAFF'), false);
  });

  it('[F12] T1-ZALO-F12-03: Follow-up scheduling surfaces overdue filter and clearing resets follow_up_at', async () => {
    const ev = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mfu'), userId: uniqueUserId('fu'), text: 'Hẹn gọi lại nhé' }),
      { sign: false, sandbox: true }
    );
    const convId = ev.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });

    const pastIso = new Date(Date.now() - 1800_000).toISOString();
    const setRes = await sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { at: pastIso }
    });
    assertHttpStatus(setRes, 200);

    const overdueRes = await sandboxWorld.staffReq('staff/inbox?status=overdue', {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assertHttpStatus(overdueRes, 200);
    assert.ok(overdueRes.json.conversations.some((c) => c.id === convId));

    const clearRes = await sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { at: null }
    });
    assertHttpStatus(clearRes, 200);

    const row = await sandboxWorld.db.query('SELECT follow_up_at FROM public.ktn_consultations WHERE id = $1', [convId]);
    assert.equal(row.rows[0].follow_up_at, null);

    const overdueAfter = await sandboxWorld.staffReq('staff/inbox?status=overdue', {
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt'
    });
    assert.equal(overdueAfter.json.conversations.some((c) => c.id === convId), false);
  });

  it('[F12] T1-ZALO-F12-04: Close thread supports all 4 valid outcomes and clears follow_up_at', async () => {
    const outcomes = ['registered', 'declined', 'no_response', 'other'];
    for (const outcome of outcomes) {
      const ev = await sandboxWorld.postZaloEvent(
        makeZaloTextEvent({ msgId: uniqueMsgId(`mcl_${outcome}`), userId: uniqueUserId(`cl_${outcome}`), text: 'Tư vấn' }),
        { sign: false, sandbox: true }
      );
      const convId = ev.json.consultation_id;
      await sandboxWorld.staffReq(`staff/thread/${convId}/claim`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: {}
      });
      await sandboxWorld.staffReq(`staff/thread/${convId}/follow_up`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { at: new Date(Date.now() + 3600_000).toISOString() }
      });

      const closeRes = await sandboxWorld.staffReq(`staff/thread/${convId}/close`, {
        method: 'POST',
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        json: { outcome }
      });
      assertHttpStatus(closeRes, 200, `close outcome=${outcome}`);

      const row = await sandboxWorld.db.query(
        'SELECT status, outcome, follow_up_at FROM public.ktn_consultations WHERE id = $1',
        [convId]
      );
      assert.equal(row.rows[0].status, 'closed');
      assert.equal(row.rows[0].outcome, outcome);
      assert.equal(row.rows[0].follow_up_at, null);

      const evRow = await sandboxWorld.db.query(
        "SELECT detail FROM public.ktn_consultation_events WHERE consultation_id = $1 AND kind = 'close'",
        [convId]
      );
      assert.equal(evRow.rows.length, 1);
      assert.equal(evRow.rows[0].detail.outcome, outcome);
    }
  });

  it('[F12] T1-ZALO-F12-05: Manual reopen and customer auto-reopen restore status and clear outcome', async () => {
    // (a) & (b) Owned thread: manual reopen, then close again + customer message auto-reopens to 'open'
    const ownedUser = uniqueUserId('reopen-own');
    const r1 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mro1'), userId: ownedUser, text: 'Xin tư vấn' }),
      { sign: false, sandbox: true }
    );
    const ownedId = r1.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${ownedId}/claim`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    await sandboxWorld.staffReq(`staff/thread/${ownedId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { outcome: 'no_response' }
    });

    const manualReopen = await sandboxWorld.staffReq(`staff/thread/${ownedId}/reopen`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: {}
    });
    assertHttpStatus(manualReopen, 200, 'manual reopen');

    let ownRow = await sandboxWorld.db.query('SELECT status, outcome, owner_email FROM public.ktn_consultations WHERE id = $1', [ownedId]);
    assert.equal(ownRow.rows[0].status, 'open');
    assert.equal(ownRow.rows[0].outcome, null);
    assert.equal(ownRow.rows[0].owner_email, STAFF_ACTORS.advisors[0].email);

    await sandboxWorld.staffReq(`staff/thread/${ownedId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.advisors[0],
      authType: 'supabase-jwt',
      json: { outcome: 'declined' }
    });
    const custReply = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mro2'), userId: ownedUser, text: 'Chị muốn đăng ký lại ạ.' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(custReply, 200);
    ownRow = await sandboxWorld.db.query('SELECT status, outcome, owner_email FROM public.ktn_consultations WHERE id = $1', [ownedId]);
    assert.equal(ownRow.rows[0].status, 'open');
    assert.equal(ownRow.rows[0].outcome, null);
    assert.equal(ownRow.rows[0].owner_email, STAFF_ACTORS.advisors[0].email);

    // (c) Unassigned closed thread -> non-bot inbound (user_submit_info) auto-reopens to 'waiting' without auto_assign
    const unownedUser = uniqueUserId('reopen-un');
    const r2 = await sandboxWorld.postZaloEvent(
      makeZaloTextEvent({ msgId: uniqueMsgId('mru1'), userId: unownedUser, text: 'Chào shop' }),
      { sign: false, sandbox: true }
    );
    const unownedId = r2.json.consultation_id;
    await sandboxWorld.staffReq(`staff/thread/${unownedId}/close`, {
      method: 'POST',
      actor: STAFF_ACTORS.manager,
      json: { outcome: 'other' }
    });

    const custReplyUnowned = await sandboxWorld.postZaloEvent(
      makeZaloSubmitInfoEvent({ msgId: uniqueMsgId('mru2'), userId: unownedUser, name: 'Khách Quay Lại', phone: '0909888777' }),
      { sign: false, sandbox: true }
    );
    assertHttpStatus(custReplyUnowned, 200);
    const unRow = await sandboxWorld.db.query('SELECT status, outcome, owner_email FROM public.ktn_consultations WHERE id = $1', [unownedId]);
    assert.equal(unRow.rows[0].status, 'waiting');
    assert.equal(unRow.rows[0].outcome, null);
    assert.equal(unRow.rows[0].owner_email, null);
  });
});
