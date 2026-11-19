import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoForbiddenAiText,
  assertNoSecretLeaks,
  assertSafeCustomerThreadResponse,
  assertSafeStaffThreadResponse,
  assertVietQrPayment,
  assertZeroHorizontalOverflow
} from '../harness/assertions.mjs';
import {
  loginViaUi,
  seedAuthSession,
  startBrowserHarness
} from '../harness/browser-harness.mjs';
import {
  CATALOG_COURSES,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS,
  makeSepayWebhook,
  makeZaloSubmitInfoEvent,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import { ROOT_DIR } from '../harness/pglite-supabase.mjs';
import { createTestWorld, mintKtnSession } from '../harness/worker-client.mjs';

async function createZaloThread(world, {
  userId = LEARNERS_AND_PARENTS.parentMinh.zaloUserId,
  text = 'Bé nhà chị 7 tuổi muốn tìm khóa video tiếng Trung ạ.',
  msgId = `zmsg_t1_${crypto.randomUUID().slice(0, 8)}`,
  sandbox = false
} = {}) {
  const res = await world.postZaloEvent(
    makeZaloTextEvent({ msgId, userId, text }),
    { sign: !sandbox, sandbox }
  );
  assertHttpStatus(res, [200, 202], 'postZaloEvent');
  const rowRes = await world.db.query(
    `SELECT * FROM public.ktn_consultations WHERE channel = 'zalo_oa' AND external_id = $1 LIMIT 1`,
    [userId]
  );
  assert.equal(rowRes.rows.length, 1, 'Expected Zalo OA consultation row in DB');
  return rowRes.rows[0];
}

async function createWebOrderViaApi(world, {
  course = CATALOG_COURSES[0],
  learner = LEARNERS_AND_PARENTS.parentMinh,
  requestId = crypto.randomUUID()
} = {}) {
  const started = await world.startWebChat();
  assertHttpStatus(started, 200, 'startWebChat');
  const orderRes = await world.request('/api/ktn/consultations/web/order', {
    method: 'POST',
    token: started.token,
    json: {
      courseId: course.course_id,
      name: learner.name,
      email: learner.email,
      phone: learner.phone,
      requestId
    }
  });
  return { token: started.token, orderRes };
}

describe('Tier 1 — SePay & CRM Web V2 Happy-Path Suite (F13–F17)', () => {
  describe('Layer A (Sandbox Mode): F13, F14, F15 Sandbox Flows', () => {
    let sandboxWorld;

    before(async () => {
      sandboxWorld = await createTestWorld({
        mode: 'sandbox',
        envOverrides: {
          KTN_SEPAY_API_KEY: '',
          KTN_CONSULTATION_MAIL_KEY: '',
          KTN_CONSULTATION_MAIL_FROM: ''
        }
      });
    });

    beforeEach(async () => {
      await sandboxWorld.reset();
    });

    after(async () => {
      await sandboxWorld?.close();
    });

    it('[F13-T1-04] creates consultation order and pinned VietQR in KTN_SEPAY_SANDBOX=true without live SePay or Mail keys', async () => {
      const course = CATALOG_COURSES[4]; // KIDS-04 (890,000 VND)
      const { orderRes } = await createWebOrderViaApi(sandboxWorld, { course });
      assertHttpStatus(orderRes, 200, 'sandbox web/order without live keys');
      assert.match(orderRes.json.id, /^ORD-\d{6}$/);
      assert.equal(orderRes.json.amount, course.price);
      assertVietQrPayment(
        orderRes.json.payment,
        orderRes.json.id,
        course.price,
        TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO
      );
      assertNoSecretLeaks(orderRes.json, { rootDir: ROOT_DIR, label: 'sandbox web/order' });
    });

    it('[F13-T1-05] delivers VietQR message into Zalo OA outbox in sandbox mode when creating an order for a zalo_oa thread', async () => {
      const conv = await createZaloThread(sandboxWorld, { sandbox: true });
      const claimRes = await sandboxWorld.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: {}
      });
      assertHttpStatus(claimRes, 200, 'claim zalo_oa thread in sandbox mode');

      const createRes = await sandboxWorld.staffReq(`staff/thread/${conv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: LEARNERS_AND_PARENTS.parentMinh.name,
          email: LEARNERS_AND_PARENTS.parentMinh.email,
          phone: LEARNERS_AND_PARENTS.parentMinh.phone,
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(createRes, [200, 201], 'create_order on zalo_oa thread');
      const orderId = createRes.json.id || createRes.json.order_id;
      assert.match(orderId, /^ORD-\d{6}$/);
      assertVietQrPayment(
        createRes.json.payment,
        orderId,
        CATALOG_COURSES[0].price,
        TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO
      );

      const sysMsg = await sandboxWorld.db.query(
        `SELECT sender, body, delivery, external_id FROM public.ktn_consultation_messages
         WHERE consultation_id = $1 AND sender = 'system' ORDER BY created_at DESC LIMIT 1`,
        [conv.id]
      );
      assert.equal(sysMsg.rows.length, 1);
      assert.ok(sysMsg.rows[0].body.includes('https://img.vietqr.io/image/'));
      assert.equal(sysMsg.rows[0].delivery, 'sent');
      assert.match(String(sysMsg.rows[0].external_id || ''), /^zalo_sandbox:/);
    });

    it('[F14-T1-06] simulates accepted and mismatch SePay events via POST staff/sepay/sandbox and lists reconciliation logs', async () => {
      const { orderRes } = await createWebOrderViaApi(sandboxWorld, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'sandbox web/order');
      const orderId = orderRes.json.id;

      // 1. Simulate mismatch (underpaid)
      const simMismatch = await sandboxWorld.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          order_id: orderId,
          transferAmount: 500000,
          transferContent: `KTN ${orderId}`,
          accountNumber: TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO,
          kind: 'mismatch'
        }
      });
      assertHttpStatus(simMismatch, [200, 201], 'staff/sepay/sandbox mismatch');

      const reconList = await sandboxWorld.staffReq('staff/reconciliation?kind=mismatch&resolution_status=open', {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(reconList, 200, 'staff/reconciliation mismatch');
      assert.equal(reconList.json.ok, true);
      assert.ok(reconList.json.items.some((item) => item.order_id === orderId && item.kind === 'mismatch'));

      // 2. Simulate accepted (exact amount)
      const simAccepted = await sandboxWorld.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          order_id: orderId,
          transferAmount: CATALOG_COURSES[0].price,
          transferContent: `KTN ${orderId}`,
          accountNumber: TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO,
          kind: 'accepted'
        }
      });
      assertHttpStatus(simAccepted, [200, 201], 'staff/sepay/sandbox accepted');

      const ordRow = await sandboxWorld.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRow.rows[0].payment_status, 'paid');
      assert.equal(ordRow.rows[0].approval_status, 'approved');
    });

    it('[F15-T1-06] unlocks paid order and syncs ktn_students cleanly in sandbox mode without Resend mail keys', async () => {
      const learner = {
        name: 'Phụ Huynh Sandbox',
        email: 'sandbox.parent@example.test',
        phone: '0909555111'
      };
      const { orderRes } = await createWebOrderViaApi(sandboxWorld, {
        course: CATALOG_COURSES[0],
        learner
      });
      assertHttpStatus(orderRes, 200, 'sandbox web/order');
      const orderId = orderRes.json.id;

      const simAccepted = await sandboxWorld.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          order_id: orderId,
          transferAmount: CATALOG_COURSES[0].price,
          transferContent: `KTN ${orderId}`,
          accountNumber: TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO,
          kind: 'accepted'
        }
      });
      assertHttpStatus(simAccepted, [200, 201], 'sandbox payment accepted');

      const ordRes = await sandboxWorld.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRes.rows[0].payment_status, 'paid');
      assert.equal(ordRes.rows[0].approval_status, 'approved');

      const stuRes = await sandboxWorld.db.query(
        `SELECT email, online_courses FROM public.ktn_students WHERE lower(email) = lower($1)`,
        [learner.email]
      );
      assert.equal(stuRes.rows.length, 1);
      assert.ok(
        Array.isArray(stuRes.rows[0].online_courses) &&
          stuRes.rows[0].online_courses.some(
            (c) => String(typeof c === 'string' ? c : c?.id || '') === CATALOG_COURSES[0].course_id
          ),
        `Expected course ${CATALOG_COURSES[0].course_id} in ktn_students.online_courses`
      );
    });
  });

  describe('Layer A (Live-Auth Mode): F13, F14, F15, F17 Contracts', () => {
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

    // --- F13 (4 tests in live-auth + 2 in sandbox = 6) ---
    it('[F13-T1-01] POST web/order creates ORD-XXXXXX with server-locked price, source=web_chat, consultation_id, and pinned VietQR', async () => {
      const course = CATALOG_COURSES[7]; // YCT-04 (1,290,000 VND)
      const { orderRes } = await createWebOrderViaApi(world, { course });
      assertHttpStatus(orderRes, 200, 'web/order');
      assert.match(orderRes.json.id, /^ORD-\d{6}$/);
      assert.equal(orderRes.json.amount, course.price);
      assertVietQrPayment(
        orderRes.json.payment,
        orderRes.json.id,
        course.price,
        TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO
      );

      const dbOrd = await world.db.query(
        `SELECT order_id, amount, source, consultation_id, note FROM public.ktn_orders WHERE order_id = $1`,
        [orderRes.json.id]
      );
      assert.equal(dbOrd.rows.length, 1);
      assert.equal(dbOrd.rows[0].source, 'web_chat');
      assert.ok(dbOrd.rows[0].consultation_id);
      assert.ok(dbOrd.rows[0].note.includes('"source":"consultation"'));
    });

    it('[F13-T1-02] replays POST web/order idempotently for identical (consultation_id, requestId) without duplicate DB rows', async () => {
      const started = await world.startWebChat();
      assertHttpStatus(started, 200, 'startWebChat');
      const reqId = crypto.randomUUID();
      const payload = {
        courseId: CATALOG_COURSES[0].course_id,
        name: LEARNERS_AND_PARENTS.parentMinh.name,
        email: LEARNERS_AND_PARENTS.parentMinh.email,
        phone: LEARNERS_AND_PARENTS.parentMinh.phone,
        requestId: reqId
      };

      const first = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: payload
      });
      const second = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: payload
      });
      assertHttpStatus(first, 200, 'first web/order');
      assertHttpStatus(second, 200, 'second web/order');
      assert.equal(second.json.id, first.json.id);
      assert.equal(second.json.amount, first.json.amount);

      const countRes = await world.db.query(
        `SELECT count(*)::int AS cnt FROM public.ktn_consultation_orders WHERE request_id = $1`,
        [reqId]
      );
      assert.equal(countRes.rows[0].cnt, 1);
    });

    it('[F13-T1-03] preserves pinned VietQR accountNo and amount on GET web/status after payment_config and catalog price change', async () => {
      const course = CATALOG_COURSES[0];
      const { token, orderRes } = await createWebOrderViaApi(world, { course });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      await world.db.query(
        `UPDATE public.ktn_payment_config SET account_no = '999988887777' WHERE id = 'default'`
      );
      await world.db.query(
        `UPDATE public.ktn_courses SET price = 1990000 WHERE course_id = $1`,
        [course.course_id]
      );

      const statusRes = await world.request(`/api/ktn/consultations/web/status?id=${orderId}`, {
        token
      });
      assertHttpStatus(statusRes, 200, 'web/status');
      assert.equal(statusRes.json.id, orderId);
      assert.equal(statusRes.json.amount, course.price);
      assert.equal(statusRes.json.paymentStatus, 'pending_verification');
      assert.equal(statusRes.json.accessStatus, 'pending');
      assertVietQrPayment(
        statusRes.json.payment,
        orderId,
        course.price,
        TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO
      );
    });

    it('[F13-T1-06] allows owning advisor (KTN session role=advisor) to create order via staff/thread/:id/create_order with source=zalo_oa', async () => {
      const conv = await createZaloThread(world);
      const claimRes = await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: {}
      });
      assertHttpStatus(claimRes, 200, 'advisor KTN session claim');

      const orderRes = await world.staffReq(`staff/thread/${conv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[8].course_id, // PRON-01 (690,000 VND)
          name: LEARNERS_AND_PARENTS.adultLearnerAn.name,
          email: LEARNERS_AND_PARENTS.adultLearnerAn.email,
          phone: LEARNERS_AND_PARENTS.adultLearnerAn.phone,
          requestId: crypto.randomUUID(),
          note: 'Tạo đơn từ CRM Zalo OA'
        }
      });
      assertHttpStatus(orderRes, [200, 201], 'staff create_order');
      const orderId = orderRes.json.id || orderRes.json.order_id;
      assert.match(orderId, /^ORD-\d{6}$/);
      assert.equal(orderRes.json.amount, CATALOG_COURSES[8].price);
      assertVietQrPayment(
        orderRes.json.payment,
        orderId,
        CATALOG_COURSES[8].price,
        TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO
      );

      const ordRow = await world.db.query(
        `SELECT source, assigned_advisor, consultation_id FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRow.rows[0].source, 'zalo_oa');
      assert.equal(ordRow.rows[0].assigned_advisor, STAFF_ACTORS.advisors[0].email);
      assert.equal(ordRow.rows[0].consultation_id, conv.id);

      assert.ok(
        world.mocks.upstreamCalls.zalo.some(
          (c) =>
            c.url.includes('/oa/message') &&
            (c.body?.message?.attachment?.payload?.elements?.[0]?.attachment_type === 'image' ||
              JSON.stringify(c.body || {}).includes('https://img.vietqr.io/image/'))
        ),
        'Expected Zalo OA outbound message carrying VietQR image'
      );
    });

    // --- F14 (5 tests in live-auth + 1 in sandbox = 6) ---
    it('[F14-T1-01] accepts valid SePay webhook (Apikey + exact amount + matching account) and marks order paid -> done', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      const sepayRes = await world.postSepay(
        makeSepayWebhook({
          id: 901001,
          orderCode: orderId,
          transferAmount: CATALOG_COURSES[0].price
        })
      );
      assertHttpStatus(sepayRes, [200, 201], 'valid sepay webhook');

      const payRow = await world.db.query(
        `SELECT transaction_id, order_id, amount, status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:901001'`
      );
      assert.equal(payRow.rows.length, 1);
      assert.equal(payRow.rows[0].order_id, orderId);
      assert.equal(payRow.rows[0].status, 'done');

      const ordRow = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRow.rows[0].payment_status, 'paid');
      assert.equal(ordRow.rows[0].approval_status, 'approved');
    });

    it('[F14-T1-02] reconciles space/dot formatted order codes (ORD 123456 / ORD.123456) and subAccount matches', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;
      const digits = orderId.slice(4);

      const sepayRes = await world.postSepay(
        makeSepayWebhook({
          id: 901002,
          orderCode: null,
          accountNumber: '0000000000',
          subAccount: TEST_ENV_DEFAULTS.KTN_SEPAY_ACCOUNT_NO,
          transferAmount: CATALOG_COURSES[0].price,
          content: `Thanh toan KTN ORD.${digits} ngay hom nay`,
          description: `KTN ORD ${digits}`
        })
      );
      assertHttpStatus(sepayRes, [200, 201], 'formatted code + subAccount sepay webhook');

      const ordRow = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRow.rows[0].payment_status, 'paid');
      assert.equal(ordRow.rows[0].approval_status, 'approved');
    });

    it('[F14-T1-03] replays identical SePay transaction_id idempotently without duplicate payment rows or duplicate Resend emails', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;
      const webhookPayload = makeSepayWebhook({
        id: 901003,
        orderCode: orderId,
        transferAmount: CATALOG_COURSES[0].price
      });

      const first = await world.postSepay(webhookPayload);
      const second = await world.postSepay(webhookPayload);
      assertHttpStatus(first, [200, 201], 'first sepay');
      assertHttpStatus(second, [200, 201], 'replayed sepay');

      const payRows = await world.db.query(
        `SELECT transaction_id FROM public.ktn_consultation_payments WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(payRows.rows.length, 1);
      assert.equal(world.mocks.upstreamCalls.resend.length, 1);
    });

    it('[F14-T1-04] logs mismatch for underpaid transfer (keeping order unpaid) and duplicate for second transfer on already-paid order', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      // Underpaid mismatch
      const underRes = await world.postSepay(
        makeSepayWebhook({ id: 901004, orderCode: orderId, transferAmount: 500000 })
      );
      assertHttpStatus(underRes, [200, 201], 'mismatch sepay');

      const ordAfterUnder = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordAfterUnder.rows[0].payment_status, 'pending_verification');
      assert.equal(ordAfterUnder.rows[0].approval_status, 'pending');

      // Exact accepted payment
      const okRes = await world.postSepay(
        makeSepayWebhook({ id: 901005, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(okRes, [200, 201], 'accepted sepay');

      // Second exact transfer -> duplicate
      const dupRes = await world.postSepay(
        makeSepayWebhook({ id: 901006, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(dupRes, [200, 201], 'duplicate sepay');

      const payments = await world.db.query(
        `SELECT transaction_id, status FROM public.ktn_consultation_payments WHERE order_id = $1 ORDER BY transaction_id`,
        [orderId]
      );
      assert.deepEqual(
        payments.rows.map((r) => [r.transaction_id, r.status]),
        [
          ['sepay:901004', 'mismatch'],
          ['sepay:901005', 'done'],
          ['sepay:901006', 'duplicate']
        ]
      );

      const reconRes = await world.staffReq('staff/reconciliation', { actor: STAFF_ACTORS.manager });
      assertHttpStatus(reconRes, 200, 'staff/reconciliation');
      const kindsByTx = Object.fromEntries(reconRes.json.items.map((x) => [x.transaction_id, x.kind]));
      assert.equal(kindsByTx['sepay:901004'], 'mismatch');
      assert.equal(kindsByTx['sepay:901006'], 'duplicate');
    });

    it('[F14-T1-05] logs unmatched/unknown_order/account_mismatch transfers and resolves via POST staff/reconciliation/:txId/resolve', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      // Unmatched (no ORD code)
      const unmatchedRes = await world.postSepay(
        makeSepayWebhook({ id: 901010, orderCode: null, transferAmount: 890000, content: 'Chuyen khoan hoc phi cho be' })
      );
      assertHttpStatus(unmatchedRes, [200, 201], 'unmatched transfer');

      // Unknown order code
      const unknownRes = await world.postSepay(
        makeSepayWebhook({ id: 901011, orderCode: 'ORD-999999', transferAmount: 890000 })
      );
      assertHttpStatus(unknownRes, [200, 201], 'unknown order transfer');

      // Account mismatch
      const acctRes = await world.postSepay(
        makeSepayWebhook({ id: 901012, orderCode: orderId, transferAmount: 890000, accountNumber: '111122223333' })
      );
      assertHttpStatus(acctRes, [200, 201], 'account mismatch transfer');

      const listRes = await world.staffReq('staff/reconciliation?resolution_status=open', {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(listRes, 200, 'list open reconciliation logs');
      const byTx = Object.fromEntries(listRes.json.items.map((x) => [x.transaction_id, x]));
      assert.equal(byTx['sepay:901010']?.kind, 'unmatched');
      assert.equal(byTx['sepay:901011']?.kind, 'unknown_order');
      assert.equal(byTx['sepay:901012']?.kind, 'account_mismatch');

      const resolveRes = await world.staffReq('staff/reconciliation/sepay:901010/resolve', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          resolution_status: 'resolved',
          order_id: orderId,
          note: 'Kế toán đã xác nhận sao kê khớp đơn'
        }
      });
      assertHttpStatus(resolveRes, 200, 'resolve reconciliation log');
      assert.equal(resolveRes.json.ok, true);
      assert.equal(resolveRes.json.log.resolution_status, 'resolved');
      assert.equal(resolveRes.json.log.order_id, orderId);
      assert.equal(resolveRes.json.log.resolved_by, STAFF_ACTORS.manager.email);

      const evRes = await world.db.query(
        `SELECT kind, detail FROM public.ktn_consultation_events WHERE kind = 'sepay_reconciliation'`
      );
      assert.equal(evRes.rows.length, 1);
      assert.equal(evRes.rows[0].detail.transaction_id, 'sepay:901010');
    });

    // --- F15 (5 tests in live-auth + 1 in sandbox = 6) ---
    it('[F15-T1-01] CA 06: provisions new student on izTeach, records paid BEFORE unlocked without P0001 crash, and sends Resend with Idempotency-Key', async () => {
      const conv = await createZaloThread(world);
      await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });
      const learner = {
        name: 'Bé Nguyễn An Mới',
        email: 'new.student.ca06@example.test',
        phone: '0908111222'
      };
      const createRes = await world.staffReq(`staff/thread/${conv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[4].course_id,
          name: learner.name,
          email: learner.email,
          phone: learner.phone,
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(createRes, [200, 201], 'create_order zalo_oa');
      const orderId = createRes.json.id || createRes.json.order_id;

      // Delay background provisioning so we can verify CA 06: payment_status='paid' BEFORE approval_status='approved'
      const sepayRes = await world.request('/api/ktn/consultations/sepay', {
        method: 'POST',
        headers: world.sepayHeaders(),
        json: makeSepayWebhook({ id: 902001, orderCode: orderId, transferAmount: CATALOG_COURSES[4].price }),
        awaitBackground: false
      });
      assertHttpStatus(sepayRes, [200, 201], 'sepay sync phase');

      const midOrd = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(midOrd.rows[0].payment_status, 'paid');
      assert.equal(midOrd.rows[0].approval_status, 'pending');

      // Now run provisioning cron/job
      await world.scheduled();

      const finalOrd = await world.db.query(
        `SELECT payment_status, approval_status, source, consultation_id FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(finalOrd.rows[0].payment_status, 'paid');
      assert.equal(finalOrd.rows[0].approval_status, 'approved');
      assert.equal(finalOrd.rows[0].source, 'zalo_oa');
      assert.equal(finalOrd.rows[0].consultation_id, conv.id);

      const stu = await world.db.query(
        `SELECT email, online_courses, lead_source, zalo_user_id, consultation_id FROM public.ktn_students WHERE lower(email) = lower($1)`,
        [learner.email]
      );
      assert.equal(stu.rows.length, 1);
      assert.ok(
        Array.isArray(stu.rows[0].online_courses) &&
          stu.rows[0].online_courses.some(
            (c) => String(typeof c === 'string' ? c : c?.id || '') === CATALOG_COURSES[4].course_id
          ),
        `Expected course ${CATALOG_COURSES[4].course_id} in ktn_students.online_courses`
      );
      assert.equal(stu.rows[0].lead_source, 'zalo_oa');
      assert.equal(stu.rows[0].zalo_user_id, conv.zalo_user_id);
      assert.equal(stu.rows[0].consultation_id, conv.id);

      assert.equal(world.mocks.upstreamCalls.resend.length, 1);
      assert.equal(world.mocks.upstreamCalls.resend[0].idempotencyKey, `ktn-order-${orderId}`);
      assert.ok(world.mocks.upstreamCalls.resend[0].body.text.includes('Mật khẩu khởi tạo:'));
      assertNoSecretLeaks(world.mocks.upstreamCalls.resend[0].body, { rootDir: ROOT_DIR });
    });

    it('[F15-T1-02] preserves existing KTN account and sends existing-password email copy when provisioning an already-registered student', async () => {
      // hoangngan@khongtunhi.com is already in seeded izteach.students with HSK1-30
      const existingLearner = {
        name: 'Bé Nguyễn Hoàng Ngân',
        email: 'hoangngan@khongtunhi.com',
        phone: '0900000089'
      };
      const newCourse = CATALOG_COURSES[7]; // YCT-04
      const { orderRes } = await createWebOrderViaApi(world, {
        course: newCourse,
        learner: existingLearner
      });
      assertHttpStatus(orderRes, 200, 'web/order existing student');
      const orderId = orderRes.json.id;

      const sepayRes = await world.postSepay(
        makeSepayWebhook({ id: 902002, orderCode: orderId, transferAmount: newCourse.price })
      );
      assertHttpStatus(sepayRes, [200, 201], 'sepay existing student');

      assert.equal(world.mocks.upstreamCalls.resend.length, 1);
      const emailText = world.mocks.upstreamCalls.resend[0].body.text;
      assert.ok(emailText.includes('Sử dụng mật khẩu tài khoản KTN hiện tại'));
      assert.equal(emailText.includes('Mật khẩu khởi tạo:'), false);

      const uid = 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68';
      assert.ok(world.mocks.izteach.permissionsByUid[uid].includes(newCourse.course_id));
    });

    it('[F15-T1-03] CA 08: recovers needs_review payment via manager POST staff/thread/:id/retry_payment after izTeach fault clears', async () => {
      const started = await world.startWebChat();
      assertHttpStatus(started, 200, 'startWebChat');
      const orderRes = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Học Viên Recovery',
          email: 'recovery.ca08@example.test',
          phone: '0908222333',
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      const convRow = await world.db.query(
        `SELECT consultation_id FROM public.ktn_consultation_orders WHERE order_id = $1`,
        [orderId]
      );
      const convId = convRow.rows[0].consultation_id;

      world.mocks.setFaults({ failIzTeachCreate: true });
      const sepayRes = await world.postSepay(
        makeSepayWebhook({ id: 902003, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(sepayRes, [200, 201], 'sepay during fault');

      // Exhaust remaining attempts until needs_review
      for (let i = 0; i < 6; i += 1) {
        await world.db.query(
          `UPDATE public.ktn_consultation_payments SET next_attempt_at = now() - interval '1 minute' WHERE transaction_id = 'sepay:902003'`
        );
        await world.scheduled();
      }
      const stuckPay = await world.db.query(
        `SELECT status, attempts FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:902003'`
      );
      assert.equal(stuckPay.rows[0].status, 'needs_review');
      assert.ok(stuckPay.rows[0].attempts >= 6);

      // Clear fault and trigger manager retry_payment
      world.mocks.clearFaults();
      const retryRes = await world.staffReq(`staff/thread/${convId}/retry_payment`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { order_id: orderId, transaction_id: 'sepay:902003' }
      });
      assertHttpStatus(retryRes, 200, 'manager retry_payment');
      assert.equal(retryRes.json.updated, true);

      const finalPay = await world.db.query(
        `SELECT status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:902003'`
      );
      assert.equal(finalPay.rows[0].status, 'done');
      const finalOrd = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(finalOrd.rows[0].payment_status, 'paid');
      assert.equal(finalOrd.rows[0].approval_status, 'approved');
      assert.equal(world.mocks.upstreamCalls.resend.length, 1);
    });

    it('[F15-T1-04] links existing student profile via POST staff/thread/:id/link_student and syncs Zalo OA metadata', async () => {
      const conv = await createZaloThread(world, {
        userId: 'zalo-uid-link-089',
        text: 'Chị muốn kiểm tra thông tin học viên Hoàng Ngân'
      });
      await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });

      const linkRes = await world.staffReq(`staff/thread/${conv.id}/link_student`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: { student_code: 'KTN-2026-089' }
      });
      assertHttpStatus(linkRes, 200, 'staff link_student');
      assert.equal(linkRes.json.ok, true);
      assert.equal(linkRes.json.student_code, 'KTN-2026-089');

      const stuRow = await world.db.query(
        `SELECT consultation_id, zalo_user_id, lead_source FROM public.ktn_students WHERE code = 'KTN-2026-089'`
      );
      assert.equal(stuRow.rows[0].consultation_id, conv.id);
      assert.equal(stuRow.rows[0].zalo_user_id, 'zalo-uid-link-089');
      assert.equal(stuRow.rows[0].lead_source, 'zalo_oa');

      const evRes = await world.db.query(
        `SELECT kind, detail FROM public.ktn_consultation_events WHERE consultation_id = $1 AND kind = 'student_linked'`,
        [conv.id]
      );
      assert.equal(evRes.rows.length, 1);
      assert.equal(evRes.rows[0].detail.student_code, 'KTN-2026-089');
    });

    it('[F15-T1-05] persists CRM metadata (leadSource, zaloUserId, consultationId) through POST /api/ktn/students/courses and admin search', async () => {
      const conv = await createZaloThread(world, { userId: 'zalo-uid-sync-102' });
      const updateRes = await world.staffReq('/api/ktn/students/courses', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          action: 'update_profile',
          email: 'minhkhang@khongtunhi.com',
          name: 'Bé Minh Khang CRM',
          phone: '0909888777',
          parentName: 'Chị Thảo',
          leadSource: 'zalo_oa',
          zaloUserId: 'zalo-uid-sync-102',
          consultationId: conv.id
        }
      });
      assertHttpStatus(updateRes, 200, 'POST /api/ktn/students/courses update_profile');

      const searchRes = await world.staffReq('/api/ktn/admin/students/search?q=minhkhang%40khongtunhi.com', {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(searchRes, 200, 'admin/students/search');
      const items = searchRes.json.items || searchRes.json.students || [];
      const found = items.find((s) => s.email === 'minhkhang@khongtunhi.com');
      assert.ok(found, 'Expected updated student in search results');
      assert.equal(found.lead_source, 'zalo_oa');
      assert.equal(found.zalo_user_id, 'zalo-uid-sync-102');
      assert.equal(found.consultation_id, conv.id);
    });

    // --- F17 (6 tests in live-auth = 6) ---
    it('[F17-T1-01] runs flagThread via world.scheduled() to create pending ktn_consultation_flags and clear next_review_at', async () => {
      const conv = await createZaloThread(world);
      await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });
      const replyRes = await world.staffReq(`staff/thread/${conv.id}/reply`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {
          request_id: crypto.randomUUID(),
          body: 'Hôm nay em giảm giá riêng còn 500k cho chị nhé.'
        }
      });
      assertHttpStatus(replyRes, 200, 'advisor reply');

      const advMsg = await world.db.query(
        `SELECT id, body FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' ORDER BY created_at DESC LIMIT 1`,
        [conv.id]
      );
      assert.equal(advMsg.rows.length, 1);

      await world.db.query(
        `UPDATE public.ktn_consultations SET next_review_at = now() - interval '1 minute' WHERE id = $1`,
        [conv.id]
      );
      world.mocks.setFaults({
        geminiResponse: {
          flags: [
            {
              message_id: advMsg.rows[0].id,
              category: 'price',
              excerpt: 'giảm giá riêng còn 500k',
              reason: 'Báo giá và ưu đãi không khớp bảng giá KTN'
            }
          ]
        }
      });

      await world.scheduled();

      const flagRows = await world.db.query(
        `SELECT message_id, category, status, excerpt FROM public.ktn_consultation_flags WHERE consultation_id = $1`,
        [conv.id]
      );
      assert.equal(flagRows.rows.length, 1);
      assert.equal(flagRows.rows[0].status, 'pending');
      assert.equal(flagRows.rows[0].category, 'price');

      const convAfter = await world.db.query(
        `SELECT next_review_at FROM public.ktn_consultations WHERE id = $1`,
        [conv.id]
      );
      assert.equal(convAfter.rows[0].next_review_at, null);
    });

    it('[F17-T1-02] confirms flag via POST staff/thread/:id/review and includes confirmed flag in GET staff/report', async () => {
      const conv = await createZaloThread(world);
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/claim`, {
          actor: STAFF_ACTORS.advisors[0],
          authType: 'supabase-jwt',
          method: 'POST',
          json: {}
        }),
        200,
        'claim'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/reply`, {
          actor: STAFF_ACTORS.advisors[0],
          authType: 'supabase-jwt',
          method: 'POST',
          json: { request_id: crypto.randomUUID(), body: 'Cam kết giảm 30% học phí hôm nay.' }
        }),
        200,
        'reply'
      );
      const msgRow = (
        await world.db.query(
          `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' LIMIT 1`,
          [conv.id]
        )
      ).rows[0];
      await world.db.query(
        `INSERT INTO public.ktn_consultation_flags (message_id, consultation_id, category, excerpt, reason, status)
         VALUES ($1, $2, 'promotion', 'giảm 30%', 'Sai ưu đãi', 'pending')`,
        [msgRow.id, conv.id]
      );

      const reviewRes = await world.staffReq(`staff/thread/${conv.id}/review`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { message_id: msgRow.id, status: 'confirmed', note: 'Xác nhận sai ưu đãi' }
      });
      assertHttpStatus(reviewRes, 200, 'review confirm');
      assert.equal(reviewRes.json.updated, true);

      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const reportRes = await world.staffReq(`staff/report?from=${today}&to=${today}&channel=zalo_oa`, {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(reportRes, 200, 'staff/report');
      assert.equal(reportRes.json.flags.length, 1);
      assert.equal(reportRes.json.flags[0].message_id, msgRow.id);
      assert.equal(reportRes.json.flags[0].category, 'promotion');
    });

    it('[F17-T1-03] dismisses flag via POST staff/thread/:id/review and excludes pending & dismissed flags from report KPIs', async () => {
      const conv = await createZaloThread(world);
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/claim`, {
          actor: STAFF_ACTORS.advisors[0],
          authType: 'supabase-jwt',
          method: 'POST',
          json: {}
        }),
        200,
        'claim'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/reply`, {
          actor: STAFF_ACTORS.advisors[0],
          authType: 'supabase-jwt',
          method: 'POST',
          json: { request_id: crypto.randomUUID(), body: 'Khóa này phù hợp cho bé 7 tuổi ạ.' }
        }),
        200,
        'reply 1'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/reply`, {
          actor: STAFF_ACTORS.advisors[0],
          authType: 'supabase-jwt',
          method: 'POST',
          json: { request_id: crypto.randomUUID(), body: 'Chị cân nhắc khóa HSK1 nhé.' }
        }),
        200,
        'reply 2'
      );
      const msgs = (
        await world.db.query(
          `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' ORDER BY created_at`,
          [conv.id]
        )
      ).rows;

      await world.db.query(
        `INSERT INTO public.ktn_consultation_flags (message_id, consultation_id, category, excerpt, reason, status)
         VALUES ($1, $3, 'fit', 'bé 7 tuổi', 'Cờ giả dương tính', 'pending'),
                ($2, $3, 'fit', 'HSK1', 'Chưa duyệt', 'pending')`,
        [msgs[0].id, msgs[1].id, conv.id]
      );

      const dismissRes = await world.staffReq(`staff/thread/${conv.id}/review`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { message_id: msgs[0].id, status: 'dismissed', note: 'Tư vấn hợp lý' }
      });
      assertHttpStatus(dismissRes, 200, 'review dismiss');

      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const reportRes = await world.staffReq(`staff/report?from=${today}&to=${today}`, {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(reportRes, 200, 'staff/report after dismiss');
      assert.deepEqual(reportRes.json.flags, []);
    });

    it('[F17-T1-04] filters GET staff/report by channel=zalo_oa & owner, computes responseMinutes/revenue, and supports thread drill-down', async () => {
      const zaloConv = await createZaloThread(world, { userId: 'zalo-rep-01' });
      const webStarted = await world.startWebChat();
      assertHttpStatus(webStarted, 200, 'startWebChat');

      // Claim + reply on Zalo OA (with 12-minute gap between queued_at and first_reply_at)
      await world.staffReq(`staff/thread/${zaloConv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });
      await world.staffReq(`staff/thread/${zaloConv.id}/reply`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: { request_id: crypto.randomUUID(), body: 'Em chào chị, bé 7 tuổi học KIDS-04 ạ.' }
      });
      await world.db.query(
        `UPDATE public.ktn_consultations
         SET queued_at = first_reply_at - interval '12 minutes',
             follow_up_at = now() - interval '1 hour'
         WHERE id = $1`,
        [zaloConv.id]
      );

      const orderRes = await world.staffReq(`staff/thread/${zaloConv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Phụ Huynh Báo Cáo',
          email: 'report.zalo@example.test',
          phone: '0908333444',
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(orderRes, [200, 201], 'create_order for report');
      const orderId = orderRes.json.id || orderRes.json.order_id;
      await world.postSepay(
        makeSepayWebhook({ id: 903001, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );

      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const repRes = await world.staffReq(
        `staff/report?from=${today}&to=${today}&channel=zalo_oa&owner=${encodeURIComponent(STAFF_ACTORS.advisors[0].email)}`,
        { actor: STAFF_ACTORS.manager }
      );
      assertHttpStatus(repRes, 200, 'filtered staff/report');
      assert.equal(repRes.json.conversations.length, 1);
      assert.equal(repRes.json.conversations[0].id, zaloConv.id);
      assert.equal(repRes.json.assigned.length, 1);
      assert.equal(repRes.json.overdue.length, 1);
      assert.equal(repRes.json.paid.length, 1);
      assert.equal(repRes.json.revenue, CATALOG_COURSES[0].price);
      assert.equal(repRes.json.responseMinutes, 12);

      // Drill-down to thread as Manager
      const drillRes = await world.staffReq(`staff/thread/${zaloConv.id}`, {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(drillRes, 200, 'manager drill-down thread');
      assertSafeStaffThreadResponse(drillRes.json, { isAdmin: true });
      assert.equal(drillRes.json.orders.length, 1);
    });

    it('[F17-T1-05] exports GET staff/report.csv with text/csv Content-Type, UTF-8 BOM, channel filter, and zero secret leaks', async () => {
      const zaloConv = await createZaloThread(world, { userId: 'zalo-csv-01' });
      const infoRes = await world.postZaloEvent(
        makeZaloSubmitInfoEvent({
          userId: 'zalo-csv-01',
          name: 'Khách Hàng CSV',
          phone: '0908444555'
        }),
        { sign: true }
      );
      assertHttpStatus(infoRes, [200, 202], 'zalo user_submit_info for CSV');
      await world.staffReq(`staff/thread/${zaloConv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });
      const orderRes = await world.staffReq(`staff/thread/${zaloConv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Khách Hàng CSV',
          email: 'csv.export@example.test',
          phone: '0908444555',
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(orderRes, [200, 201], 'create_order for csv');
      const orderId = orderRes.json.id || orderRes.json.order_id;
      await world.postSepay(
        makeSepayWebhook({ id: 903002, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );

      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const csvRes = await world.staffReq(`staff/report.csv?from=${today}&to=${today}&channel=zalo_oa`, {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(csvRes, 200, 'staff/report.csv');
      assert.match(csvRes.headers.get('content-type') || '', /^text\/csv/i);
      // Note: Response.prototype.text() strips UTF-8 BOM per WHATWG Fetch; verify raw BOM bytes via arrayBuffer()
      const mgrSession = mintKtnSession(
        { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
        world.env.KTN_SESSION_SECRET
      );
      const rawCsvRes = await world.worker.fetch(
        new Request(
          `${world.env.KTN_CONSULTATION_PUBLIC_URL}/api/ktn/consultations/staff/report.csv?from=${today}&to=${today}&channel=zalo_oa`,
          { headers: { Authorization: `Bearer ${mgrSession}` } }
        ),
        world.env,
        { waitUntil() {}, passThroughOnException() {} }
      );
      const rawBytes = Buffer.from(await rawCsvRes.arrayBuffer());
      assert.deepEqual(
        [rawBytes[0], rawBytes[1], rawBytes[2]],
        [0xef, 0xbb, 0xbf],
        'CSV response must begin with UTF-8 BOM bytes 0xEF 0xBB 0xBF'
      );
      assert.ok(csvRes.text.includes(zaloConv.id), 'Expected conversation id in staff/report.csv');
      assert.ok(csvRes.text.includes('zalo_oa'), 'Expected zalo_oa channel in staff/report.csv');
      assert.ok(csvRes.text.includes('Khách Hàng CSV'), 'Expected customer_name in staff/report.csv');
      assertNoSecretLeaks(csvRes.text, { rootDir: ROOT_DIR, label: 'staff/report.csv' });
    });

    it('[F17-T1-06] neutralizes formula-injection prefixes (=, +, -, @) in GET staff/report.csv cells', async () => {
      const conv1 = await createZaloThread(world, { userId: 'zalo-csv-inj-1' });
      const conv2 = await createZaloThread(world, { userId: 'zalo-csv-inj-2' });
      await world.db.query(
        `UPDATE public.ktn_consultations SET customer_name = '=CMD("calc")', source_tag = '+SUM(A1:A2)' WHERE id = $1`,
        [conv1.id]
      );
      await world.db.query(
        `UPDATE public.ktn_consultations SET customer_name = '@evilFormula', source_tag = '-HACK(1)' WHERE id = $1`,
        [conv2.id]
      );

      const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
      const csvRes = await world.staffReq(`staff/report.csv?from=${today}&to=${today}`, {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(csvRes, 200, 'staff/report.csv formula neutralization');

      const body = csvRes.text.replace(/^\uFEFF/, '');
      const lines = body.split(/\r?\n/).filter(Boolean);
      assert.ok(lines.length >= 3, 'Expected CSV header + 2 data rows');
      // Every cell starting with =, +, -, @ in raw CSV data must be prefixed with leading single quote '
      assert.equal(/(?:^|,)"?=(?:CMD|SUM)/i.test(body), false, 'Unescaped = formula found in CSV');
      assert.equal(/(?:^|,)"?\+SUM/i.test(body), false, 'Unescaped + formula found in CSV');
      assert.equal(/(?:^|,)"?-HACK/i.test(body), false, 'Unescaped - formula found in CSV');
      assert.equal(/(?:^|,)"?@evilFormula/i.test(body), false, 'Unescaped @ formula found in CSV');
      assert.ok(body.includes("'=CMD"), 'Expected leading single-quote neutralization for =CMD');
      assert.ok(body.includes("'+SUM"), 'Expected leading single-quote neutralization for +SUM');
      assert.ok(body.includes("'-HACK"), 'Expected leading single-quote neutralization for -HACK');
      assert.ok(body.includes("'@evilFormula"), 'Expected leading single-quote neutralization for @evilFormula');
    });
  });

  describe('Layer B (Playwright + Vite BFF): F16 Unified KTN Web V2 CRM Workspace', () => {
    let harness;

    before(async () => {
      harness = await startBrowserHarness({
        envOverrides: {
          KTN_ZALO_SANDBOX: 'true',
          KTN_AI_SANDBOX: 'true',
          KTN_SEPAY_SANDBOX: 'true'
        }
      });
    });

    after(async () => {
      await harness?.close();
    });

    it('[F16-T1-01] Advisor logs in, filters Zalo OA inbox, claims waiting thread, uses Adult 1:1 script, and separates reply vs internal note', async () => {
      const api = await harness.getApiClient();
      const mgrCtx = await harness.openDesktopPage();
      let advPageCtx;
      try {
        // Seed a Zalo OA waiting thread via Manager sandbox trigger
        const mgrToken = (await seedAuthSession(
          mgrCtx.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        const sandboxRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: {
            event_name: 'user_send_text',
            zalo_user_id: 'zalo-pw-t1-01',
            customer_name: 'Anh Minh Zalo',
            customer_phone: '0909123456',
            source_tag: 'ad_963k',
            body: 'Mình xem gói 963k cho người đi làm 1 kèm 1.'
          }
        });
        assert.equal(sandboxRes.status(), 200, `Expected 200 from staff/zalo/sandbox, got ${sandboxRes.status()}`);
        const sandboxJson = await sandboxRes.json();
        const threadId = sandboxJson.conversation?.id;
        assert.ok(threadId, 'Expected created Zalo thread ID');

        // Log in via UI as advisor
        advPageCtx = await harness.openDesktopPage();
        await loginViaUi(advPageCtx.page, harness.baseUrl, {
          email: STAFF_ACTORS.advisors[0].email,
          password: TEST_ENV_DEFAULTS.KTN_STAFF_AND_TEST_PASSWORD
        });

        await advPageCtx.page.waitForSelector('[data-testid="consultation-crm-workspace"]', { timeout: 25000 });
        await advPageCtx.page.locator('[data-testid="crm-channel-filter-zalo_oa"]').click();

        const inboxItem = advPageCtx.page.locator(`[data-testid="crm-inbox-item-${threadId}"]`);
        await inboxItem.waitFor({ state: 'visible', timeout: 15000 });
        assert.ok((await advPageCtx.page.locator(`[data-testid="crm-inbox-channel-${threadId}"]`).textContent()).includes('Zalo OA'));

        const claimBtn = advPageCtx.page.locator(`[data-testid="crm-claim-btn-${threadId}"]`);
        if ((await claimBtn.count()) > 0) {
          await claimBtn.click();
        } else {
          await inboxItem.click();
        }
        await advPageCtx.page.waitForSelector('[data-testid="crm-thread-pane"]', { timeout: 15000 });
        await advPageCtx.page.waitForSelector('[data-testid="crm-adult-script-helper"]', { timeout: 10000 });

        await advPageCtx.page.locator('[data-testid="crm-adult-step-insert-1"]').click();
        await advPageCtx.page.locator('[data-testid="crm-send-btn"]').click();

        await advPageCtx.page.locator('[data-testid="crm-mode-note-btn"]').click();
        await advPageCtx.page.locator('[data-testid="crm-composer-textarea"]').fill('Ghi chú nội bộ: khách làm kế toán');
        await advPageCtx.page.locator('[data-testid="crm-send-btn"]').click();

        await advPageCtx.page.locator('[data-sender="note"]').waitFor({ state: 'visible', timeout: 10000 });
        assert.ok((await advPageCtx.page.locator('[data-testid="crm-thread-pane"]').textContent()).includes('Ghi chú nội bộ'));
        await assertZeroHorizontalOverflow(advPageCtx.page);
        advPageCtx.diag.assertNoPageErrors();
        mgrCtx.diag.assertNoPageErrors();
      } finally {
        await advPageCtx?.context?.close().catch(() => {});
        await mgrCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T1-02] Manager opens /admin/consultations, reassigns thread, creates VietQR order, sends QR to thread, and links KTN-2026-089', async () => {
      const api = await harness.getApiClient();
      const pageCtx = await harness.openDesktopPage();
      const { context, page, diag } = pageCtx;
      try {
        const mgrSession = await seedAuthSession(
          context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );

        const sandboxRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrSession.token}` },
          data: {
            event_name: 'user_send_text',
            zalo_user_id: 'zalo-pw-t1-02',
            customer_name: 'Chị Hương Zalo',
            customer_phone: '0909222333',
            source_tag: 'zalo_oa',
            body: 'Chị muốn đăng ký khóa video cho bé 7 tuổi.'
          }
        });
        assert.equal(sandboxRes.status(), 200);
        const threadId = (await sandboxRes.json()).conversation?.id;

        await page.goto(`${harness.baseUrl}/admin/consultations?thread=${threadId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        await page.waitForSelector('[data-testid="consultation-crm-workspace"]', { timeout: 25000 });
        for (const tab of ['crm-tab-inbox', 'crm-tab-flags', 'crm-tab-analytics', 'crm-tab-recon', 'crm-tab-settings']) {
          await page.locator(`[data-testid="${tab}"]`).waitFor({ state: 'visible', timeout: 10000 });
        }
        await page.waitForSelector('[data-testid="crm-thread-pane"]', { timeout: 15000 });

        // Assign to advisor and verify API + DOM owner update
        await page.locator('[data-testid="crm-assign-select"]').selectOption(STAFF_ACTORS.advisors[0].email);
        const assignRespPromise = page.waitForResponse(
          (res) =>
            res.url().includes(`/api/ktn/consultations/staff/thread/${threadId}/assign`) &&
            res.request().method() === 'POST'
        );
        await page.locator('[data-testid="crm-assign-btn"]').click();
        const assignResp = await assignRespPromise;
        assert.equal(assignResp.status(), 200, `Expected 200 from thread assign, got ${assignResp.status()}`);
        await page.waitForFunction(
          (email) => document.querySelector('[data-testid="crm-thread-pane"]')?.textContent?.includes(email),
          STAFF_ACTORS.advisors[0].email,
          { timeout: 15000 }
        );

        // Create Order & VietQR and verify QR reply posted to thread
        await page.locator('[data-testid="crm-open-create-order-btn"]').click();
        await page.waitForSelector('[data-testid="crm-create-order-modal"]', { timeout: 10000 });
        await page.locator('[data-testid="crm-create-order-email-input"]').fill('huong.zalo@example.test');
        await page.locator('[data-testid="crm-create-order-submit-btn"]').click();

        await page.waitForSelector('[data-testid="crm-created-order-result"]', { timeout: 15000 });
        const resultText = await page.locator('[data-testid="crm-created-order-result"]').textContent();
        const createdOrdMatch = /ORD-\d{6}/.exec(resultText || '');
        assert.ok(createdOrdMatch, `Expected ORD-XXXXXX in result, got ${resultText}`);
        const createdOrderId = createdOrdMatch[0];
        const qrImgSrc = await page.locator('[data-testid="crm-created-order-result"] img').getAttribute('src');
        assert.ok(qrImgSrc?.startsWith('https://img.vietqr.io/image/'));
        const sendQrRespPromise = page.waitForResponse(
          (res) =>
            res.url().includes(`/api/ktn/consultations/staff/thread/${threadId}/reply`) &&
            res.request().method() === 'POST'
        );
        await page.locator('[data-testid="crm-created-order-send-thread-btn"]').click();
        const sendQrResp = await sendQrRespPromise;
        assert.equal(sendQrResp.status(), 200, `Expected 200 from send QR to thread, got ${sendQrResp.status()}`);
        await page.locator('[data-testid="crm-create-order-modal"]').waitFor({ state: 'detached', timeout: 10000 });
        await page.waitForFunction(
          (ordId) => {
            const pane = document.querySelector('[data-testid="crm-thread-pane"]');
            if (!pane) return false;
            const imgs = Array.from(pane.querySelectorAll('[data-testid^="crm-msg-"] img'));
            const hasQrImg = imgs.some((img) =>
              (img.getAttribute('src') || '').startsWith('https://img.vietqr.io/image/')
            );
            return hasQrImg && (pane.textContent || '').includes(ordId);
          },
          createdOrderId,
          { timeout: 15000 }
        );

        // Link student code KTN-2026-089
        await page.locator('[data-testid="crm-open-link-student-btn"]').click();
        await page.waitForSelector('[data-testid="crm-link-student-modal"]', { timeout: 10000 });
        await page.locator('[data-testid="crm-link-student-code-input"]').fill('KTN-2026-089');
        await page.locator('[data-testid="crm-link-student-submit-btn"]').click();

        await page.waitForSelector('[data-testid="crm-thread-student-chip"]', { timeout: 15000 });
        assert.ok((await page.locator('[data-testid="crm-thread-student-chip"]').textContent()).includes('KTN-2026-089'));
        diag.assertNoPageErrors();
      } finally {
        await pageCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T1-03] Manager inspects Zalo OA order in /admin/orders, opens OrderDetailDrawer, and runs SePay Sandbox + Reconciliation Resolve', async () => {
      const api = await harness.getApiClient();
      const pageCtx = await harness.openDesktopPage();
      const { context, page, diag } = pageCtx;
      try {
        const mgrSession = await seedAuthSession(
          context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );

        const sandboxRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrSession.token}` },
          data: {
            event_name: 'user_send_text',
            zalo_user_id: 'zalo-pw-t1-03',
            customer_name: 'Chị Mai SePay',
            customer_phone: '0909333444',
            body: 'Đăng ký HSK1 qua Zalo OA'
          }
        });
        assert.equal(sandboxRes.status(), 200);
        const threadId = (await sandboxRes.json()).conversation?.id;

        const ordCreateRes = await api.post(`/api/ktn/consultations/staff/thread/${threadId}/create_order`, {
          headers: { Authorization: `Bearer ${mgrSession.token}` },
          data: {
            courseId: CATALOG_COURSES[0].course_id,
            name: 'Chị Mai SePay',
            email: 'mai.sepay@example.test',
            phone: '0909333444',
            requestId: crypto.randomUUID()
          }
        });
        assert.equal(ordCreateRes.ok(), true);
        const ordCreateJson = await ordCreateRes.json();
        const orderId = ordCreateJson.id || ordCreateJson.order_id;

        await page.goto(`${harness.baseUrl}/admin/orders`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector(`[data-testid="admin-order-row-${orderId}"]`, { timeout: 25000 });
        assert.ok((await page.locator(`[data-testid="admin-order-source-badge-${orderId}"]`).textContent()).includes('Zalo OA'));

        await page.locator(`[data-testid="admin-open-order-btn-${orderId}"]`).click();
        await page.waitForSelector('[data-testid="order-detail-drawer"]', { timeout: 10000 });
        assert.ok((await page.locator('[data-testid="order-drawer-source-badge"]').textContent()).includes('Zalo OA'));
        await page.locator('[data-testid="order-drawer-close-btn"]').click();

        // Open SePay Reconciliation Panel & simulate mismatch -> resolve
        await page.locator('[data-testid="admin-orders-toggle-recon-btn"]').click();
        await page.waitForSelector('[data-testid="sepay-reconciliation-panel"]', { timeout: 15000 });
        await page.locator('[data-testid="sepay-sandbox-order-input"]').fill(orderId);
        await page.locator('[data-testid="sepay-sandbox-amount-input"]').fill('450000');
        await page.locator('[data-testid="sepay-sandbox-kind-select"]').selectOption('mismatch');
        await page.locator('[data-testid="sepay-sandbox-simulate-btn"]').click();

        await page.locator('[data-testid="sepay-recon-kind-filter"]').selectOption('mismatch');
        const resolveBtn = page.locator('[data-testid^="sepay-recon-resolve-btn-"]').first();
        await resolveBtn.waitFor({ state: 'visible', timeout: 15000 });
        const resolveTestId = await resolveBtn.getAttribute('data-testid');
        const txId = String(resolveTestId || '').replace(/^sepay-recon-resolve-btn-/, '');
        assert.ok(txId, 'Expected reconciliation transaction_id on resolve button');

        const resolveRespPromise = page.waitForResponse(
          (res) =>
            res.url().includes('/api/ktn/consultations/staff/reconciliation/') &&
            res.url().includes('/resolve') &&
            res.request().method() === 'POST'
        );
        await resolveBtn.click();
        const resolveResp = await resolveRespPromise;
        assert.equal(resolveResp.status(), 200, `Expected 200 from reconciliation resolve, got ${resolveResp.status()}`);

        const reconRow = page.locator(`[data-testid="sepay-recon-row-${txId}"]`);
        await page.waitForFunction(
          (id) =>
            document.querySelector(`[data-testid="sepay-recon-row-${id}"]`)?.textContent?.includes('resolved'),
          txId,
          { timeout: 15000 }
        );
        await page.locator('[data-testid="sepay-recon-status-filter"]').selectOption('open');
        await reconRow.waitFor({ state: 'detached', timeout: 15000 });
        diag.assertNoPageErrors();
      } finally {
        await pageCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T1-04] Manager verifies student lead_source sync in /admin/students and retention warning in StudentDetailDrawer', async () => {
      const api = await harness.getApiClient();
      const pageCtx = await harness.openDesktopPage();
      const { context, page, diag } = pageCtx;
      try {
        const mgrSession = await seedAuthSession(
          context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );

        // Link KTN-2026-089 via API so student badge reflects Zalo OA
        const sandboxRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrSession.token}` },
          data: {
            event_name: 'user_send_text',
            zalo_user_id: 'zalo-pw-t1-04',
            customer_name: 'Bé Nguyễn Hoàng Ngân',
            customer_phone: '0900000089',
            body: 'Hỏi lớp cho Hoàng Ngân'
          }
        });
        assert.equal(sandboxRes.status(), 200);
        const threadId = (await sandboxRes.json()).conversation?.id;
        const linkRes = await api.post(`/api/ktn/consultations/staff/thread/${threadId}/link_student`, {
          headers: { Authorization: `Bearer ${mgrSession.token}` },
          data: { student_code: 'KTN-2026-089' }
        });
        assert.equal(linkRes.ok(), true);

        await page.goto(`${harness.baseUrl}/admin/students`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await page.waitForSelector('[data-testid="admin-open-student-btn-hoangngan@khongtunhi.com"]', { timeout: 25000 });
        await page.locator('[data-testid="admin-open-student-btn-hoangngan@khongtunhi.com"]').click();
        await page.waitForSelector('[data-testid="student-detail-drawer"]', { timeout: 10000 });

        await page.locator('[data-testid="drawer-edit-profile-btn"]').click();
        await page.locator('[data-testid="drawer-profile-lead-source-select"]').selectOption('zalo_oa');
        await page.locator('[data-testid="drawer-profile-zalo-id-input"]').fill('zalo-pw-t1-04');
        await page.locator('[data-testid="drawer-save-profile-btn"]').click();

        await page.waitForSelector('[data-testid="drawer-info-lead-source"]', { timeout: 10000 });
        assert.ok((await page.locator('[data-testid="drawer-info-lead-source"]').textContent()).includes('Zalo OA'));

        await page.locator('[data-testid="drawer-lifecycle-delete-btn"]').click();
        await page.waitForSelector('[data-testid="drawer-lifecycle-retention-warning"]', { timeout: 10000 });
        diag.assertNoPageErrors();
      } finally {
        await pageCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T1-05] Customer completes /chatbot scripted phone capture, AI Q&A, VietQR order, SePay sandbox refresh, and sees floating launcher on /login', async () => {
      const api = await harness.getApiClient();
      const mgrCtx = await harness.openDesktopPage();
      let guest;
      try {
        const mgrToken = (await seedAuthSession(
          mgrCtx.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        // Visit /login unauthenticated first -> verify floating launcher
        guest = await harness.openDesktopPage();
        await guest.page.goto(`${harness.baseUrl}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await guest.page.waitForSelector('[data-testid="web-chatbot-launcher-btn"]', { timeout: 25000 });

        // Visit /chatbot full page and wait for web/thread hydration
        await guest.page.goto(`${harness.baseUrl}/chatbot`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await guest.page.waitForSelector('[data-testid="web-chatbot-panel"]', { timeout: 25000 });
        await guest.page.waitForFunction(() => Boolean(localStorage.getItem('ktn_consult_web')), null, { timeout: 15000 });
        await guest.page.locator('[data-testid="web-chatbot-qr-FLOW_KIDS"]').waitFor({ state: 'visible', timeout: 15000 });
        assert.equal(await guest.page.locator('[data-testid="web-chatbot-qr-OPEN_ORDER_FORM"]').isVisible().catch(() => false), false);

        // Need & phone capture via subtle header phone button (no premature inline phone clutter)
        await guest.page.locator('[data-testid="web-chatbot-need-phone-toggle"]').click();
        await guest.page.waitForSelector('[data-testid="web-chatbot-need-phone-form"]', { timeout: 10000 });
        await guest.page.locator('[data-testid="web-chatbot-phone-input"]').fill('0901234567');
        await guest.page.locator('[data-testid="web-chatbot-phone-submit-btn"]').click();
        await guest.page.locator('[data-testid="web-chatbot-need-phone-form"]').waitFor({ state: 'detached', timeout: 15000 });

        // Free-text AI reply
        await guest.page.locator('[data-testid="web-chatbot-input"]').fill('Bé 7 tuổi mới học nên chọn khóa nào?');
        await guest.page.locator('[data-testid="web-chatbot-send-btn"]').click();
        await guest.page.waitForFunction(
          () =>
            Array.from(document.querySelectorAll('[data-testid^="web-chatbot-msg-"]')).some(
              (el) =>
                el.classList.contains('justify-start') &&
                (el.textContent || '').includes('KTN Bot') &&
                ((el.textContent || '').includes('890.000 ₫') ||
                  (el.textContent || '').includes('Tiếng Trung Trẻ Em') ||
                  (el.textContent || '').includes('khóa học video'))
            ),
          null,
          { timeout: 15000 }
        );

        // Progressive recommendation or Telegram Kids flow reveals OPEN_ORDER_FORM button
        const openOrderQrBtn = guest.page
          .locator('[data-testid="web-chatbot-qr-OPEN_ORDER_FORM"], [data-testid="web-chatbot-qr-pay_guide"]')
          .first();
        if (!(await openOrderQrBtn.isVisible().catch(() => false))) {
          await guest.page.locator('[data-testid="web-chatbot-qr-FLOW_KIDS"]').click();
          await guest.page.locator('[data-testid="web-chatbot-qr-FLOW_KIDS_4_6"]').waitFor({ state: 'visible', timeout: 10000 });
          await guest.page.locator('[data-testid="web-chatbot-qr-FLOW_KIDS_4_6"]').click();
        }
        await openOrderQrBtn.waitFor({ state: 'visible', timeout: 10000 });
        await openOrderQrBtn.click();
        await guest.page.waitForSelector('[data-testid="web-chatbot-order-form"]', { timeout: 10000 });

        await guest.page.locator('[data-testid="web-chatbot-order-name-input"]').fill('Phụ Huynh Web');
        await guest.page.locator('[data-testid="web-chatbot-order-email-input"]').fill('web.chatbot@example.test');
        await guest.page.locator('[data-testid="web-chatbot-order-phone-input"]').fill('0901234567');
        await guest.page.locator('[data-testid="web-chatbot-order-submit-btn"]').click();

        await guest.page.waitForSelector('[data-testid="web-chatbot-order-card"]', { timeout: 15000 });
        const cardText = await guest.page.locator('[data-testid="web-chatbot-order-card"]').textContent();
        const ordMatch = /ORD-\d{6}/.exec(cardText || '');
        assert.ok(ordMatch, `Expected ORD-XXXXXX in order card, got ${cardText}`);

        // Simulate SePay accepted payment and refresh status
        const simRes = await api.post('/api/ktn/consultations/staff/sepay/sandbox', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: {
            order_id: ordMatch[0],
            transferAmount: CATALOG_COURSES[0].price,
            transferContent: `KTN ${ordMatch[0]}`,
            kind: 'accepted'
          }
        });
        assert.equal(simRes.ok(), true);

        await guest.page.locator('[data-testid="web-chatbot-refresh-order-btn"]').click();
        await guest.page.waitForFunction(
          () => document.querySelector('[data-testid="web-chatbot-order-card"]')?.textContent?.includes('paid'),
          null,
          { timeout: 15000 }
        );

        // Verify ONLY bot bubbles (excluding customer bubbles) and separate server-locked catalog lines from AI prose
        const botBodies = await guest.page.evaluate(() => {
          return Array.from(document.querySelectorAll('[data-testid^="web-chatbot-msg-"]'))
            .filter((el) => el.classList.contains('justify-start') && (el.textContent || '').includes('KTN Bot'))
            .map((el) => el.querySelector('p')?.textContent || '')
            .filter(Boolean);
        });
        assert.ok(botBodies.length >= 1, 'Expected at least 1 bot message bubble in WebChatbotWidget');
        const allowedCatalogLines = new Set(
          CATALOG_COURSES.map((c) => `${c.title} — ${new Intl.NumberFormat('vi-VN').format(c.price)} ₫`)
        );
        for (const body of botBodies) {
          const proseLines = body
            .split(/\r?\n/)
            .filter((line) => {
              const trimmed = line.trim();
              if (!trimmed) return false;
              const baseCatalogLine = trimmed.split(' · ')[0].trim();
              return !allowedCatalogLines.has(baseCatalogLine);
            });
          assertNoForbiddenAiText(proseLines.join('\n'), 'WebChatbot bot prose');
        }
        guest.diag.assertNoPageErrors();
        mgrCtx.diag.assertNoPageErrors();
      } finally {
        await guest?.context?.close().catch(() => {});
        await mgrCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T1-06] renders /login, /chatbot, /admin/consultations, /admin/orders, /admin/students, and /admin/more with zero horizontal overflow at 1440x900 and 390x844', async () => {
      const publicRoutes = [
        { path: '/login', selector: '[data-testid="login-email-input"]' },
        { path: '/chatbot', selector: '[data-testid="web-chatbot-panel"]' }
      ];
      const adminRoutes = [
        { path: '/admin/consultations', selector: '[data-testid="consultation-crm-workspace"]' },
        { path: '/admin/orders', selector: '[data-testid="admin-orders-section"]' },
        { path: '/admin/students', selector: '[data-testid="admin-students-section"]' },
        { path: '/admin/more', selector: '[data-testid="sepay-reconciliation-panel"]' }
      ];

      for (const viewport of ['desktop', 'mobile']) {
        const ctxObj = viewport === 'desktop' ? await harness.openDesktopPage() : await harness.openMobilePage();
        try {
          for (const route of publicRoutes) {
            await ctxObj.page.goto(`${harness.baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await ctxObj.page.waitForSelector(route.selector, { timeout: 25000 });
            await assertZeroHorizontalOverflow(ctxObj.page);
          }

          await seedAuthSession(
            ctxObj.context,
            harness.baseUrl,
            { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
            TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
          );
          for (const route of adminRoutes) {
            await ctxObj.page.goto(`${harness.baseUrl}${route.path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
            await ctxObj.page.waitForSelector(route.selector, { timeout: 25000 });
            await assertZeroHorizontalOverflow(ctxObj.page);
          }
          ctxObj.diag.assertNoPageErrors();
        } finally {
          await ctxObj?.context?.close().catch(() => {});
        }
      }
    });
  });
});
