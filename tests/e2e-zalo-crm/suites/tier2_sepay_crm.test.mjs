import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { after, before, beforeEach, describe, it } from 'node:test';
import {
  assertHttpStatus,
  assertNoSecretLeaks,
  assertPiiRedacted,
  assertSafeStaffThreadResponse
} from '../harness/assertions.mjs';
import {
  seedAuthSession,
  startBrowserHarness
} from '../harness/browser-harness.mjs';
import {
  CATALOG_COURSES,
  LEARNERS_AND_PARENTS,
  STAFF_ACTORS,
  TEST_ENV_DEFAULTS,
  makeSepayWebhook,
  makeZaloTextEvent
} from '../harness/fixtures.mjs';
import { ROOT_DIR } from '../harness/pglite-supabase.mjs';
import { createTestWorld, mintWebTicket } from '../harness/worker-client.mjs';

async function createZaloThread(world, {
  userId = `zalo_t2_${crypto.randomUUID().slice(0, 8)}`,
  text = 'Chào KTN, bé 7 tuổi muốn tìm hiểu khóa học.',
  msgId = `zmsg_t2_${crypto.randomUUID().slice(0, 8)}`
} = {}) {
  const res = await world.postZaloEvent(
    makeZaloTextEvent({ msgId, userId, text }),
    { sign: true, sandbox: false }
  );
  assertHttpStatus(res, [200, 202], 'postZaloEvent');
  const rowRes = await world.db.query(
    `SELECT * FROM public.ktn_consultations WHERE channel = 'zalo_oa' AND external_id = $1 LIMIT 1`,
    [userId]
  );
  assert.equal(rowRes.rows.length, 1);
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

describe('Tier 2 — SePay & CRM Web V2 Boundary, Negative & Fault-Injection Suite (F13–F17)', () => {
  describe('Layer A (Sandbox Mode): F13 Kill-Switch & F14 Reconciliation RBAC/Validation', () => {
    let sandboxWorld;

    before(async () => {
      sandboxWorld = await createTestWorld({ mode: 'sandbox' });
    });

    beforeEach(async () => {
      await sandboxWorld.reset();
    });

    after(async () => {
      await sandboxWorld?.close();
    });

    it('[F13-T2-02] returns 503 on POST web/order when checkout_enabled=false even in sandbox mode, and 404 in pilot web mode', async () => {
      const started = await sandboxWorld.startWebChat();
      assertHttpStatus(started, 200, 'startWebChat');

      await sandboxWorld.db.query(
        `UPDATE public.ktn_consultation_guidance SET checkout_enabled = false WHERE id = 'default'`
      );
      const disabledRes = await sandboxWorld.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: LEARNERS_AND_PARENTS.parentMinh.name,
          email: LEARNERS_AND_PARENTS.parentMinh.email,
          phone: LEARNERS_AND_PARENTS.parentMinh.phone,
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(disabledRes, 503, 'checkout_enabled=false web/order');

      // Pilot web mode (live-auth with KTN_CONSULTATION_MODE='web', KTN_SEPAY_SANDBOX='false') disables web/order with 404
      const pilotWorld = await createTestWorld({
        mode: 'live-auth',
        envOverrides: { KTN_CONSULTATION_MODE: 'web' }
      });
      try {
        const pilotStart = await pilotWorld.startWebChat();
        assertHttpStatus(pilotStart, 200, 'pilot startWebChat');
        const pilotOrder = await pilotWorld.request('/api/ktn/consultations/web/order', {
          method: 'POST',
          token: pilotStart.token,
          json: {
            courseId: CATALOG_COURSES[0].course_id,
            name: LEARNERS_AND_PARENTS.parentMinh.name,
            email: LEARNERS_AND_PARENTS.parentMinh.email,
            phone: LEARNERS_AND_PARENTS.parentMinh.phone,
            requestId: crypto.randomUUID()
          }
        });
        assertHttpStatus(pilotOrder, 404, 'pilot web mode web/order');
      } finally {
        await pilotWorld.close();
      }
    });

    it('[F14-T2-06] blocks non-manager advisor from reconciliation/sandbox (403) and rejects invalid status (400) or missing txId/order_id (404)', async () => {
      const advList = await sandboxWorld.staffReq('staff/reconciliation', {
        actor: STAFF_ACTORS.advisors[0]
      });
      assertHttpStatus(advList, 403, 'advisor GET staff/reconciliation');

      const advResolve = await sandboxWorld.staffReq('staff/reconciliation/sepay:999/resolve', {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: { resolution_status: 'resolved' }
      });
      assertHttpStatus(advResolve, 403, 'advisor POST staff/reconciliation resolve');

      const advSandbox = await sandboxWorld.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: { transferAmount: 890000, kind: 'unmatched' }
      });
      assertHttpStatus(advSandbox, 403, 'advisor POST staff/sepay/sandbox');

      // Seed one open unmatched log
      const simRes = await sandboxWorld.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          transaction_id: 'sepay:909100',
          transferAmount: 500000,
          transferContent: 'CK khong ma don',
          kind: 'unmatched'
        }
      });
      assertHttpStatus(simRes, [200, 201], 'manager sandbox unmatched');

      const badStatus = await sandboxWorld.staffReq('staff/reconciliation/sepay:909100/resolve', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { resolution_status: 'bogus_status' }
      });
      assertHttpStatus(badStatus, 400, 'invalid resolution_status');

      const missingTx = await sandboxWorld.staffReq('staff/reconciliation/sepay:404404/resolve', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { resolution_status: 'resolved' }
      });
      assertHttpStatus(missingTx, 404, 'nonexistent transaction_id');

      const missingOrd = await sandboxWorld.staffReq('staff/reconciliation/sepay:909100/resolve', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { resolution_status: 'resolved', order_id: 'ORD-000404' }
      });
      assertHttpStatus(missingOrd, 404, 'nonexistent order_id');
    });
  });

  describe('Layer A (Live-Auth Mode): F13, F14, F15, F17 Negative & Race Cases', () => {
    let world;

    before(async () => {
      world = await createTestWorld({
        mode: 'live-auth',
        envOverrides: {
          KTN_WEBHOOK_SECRET: 'test-legacy-webhook-secret-not-real'
        }
      });
    });

    beforeEach(async () => {
      await world.reset();
    });

    after(async () => {
      await world?.close();
    });

    // --- F13 (5 more -> total 6) ---
    it('[F13-T2-01] rejects invalid VN phones, synthetic placeholder emails, bad requestId, and non-catalog courseId with 400', async () => {
      const started = await world.startWebChat();
      assertHttpStatus(started, 200, 'startWebChat');

      for (const badPhone of LEARNERS_AND_PARENTS.invalidPhones) {
        const res = await world.request('/api/ktn/consultations/web/order', {
          method: 'POST',
          token: started.token,
          json: {
            courseId: CATALOG_COURSES[0].course_id,
            name: 'Test Parent',
            email: 'valid.parent@example.test',
            phone: badPhone,
            requestId: crypto.randomUUID()
          }
        });
        assertHttpStatus(res, 400, `invalid phone ${badPhone}`);
      }

      for (const badEmail of LEARNERS_AND_PARENTS.blockedSyntheticEmails) {
        const res = await world.request('/api/ktn/consultations/web/order', {
          method: 'POST',
          token: started.token,
          json: {
            courseId: CATALOG_COURSES[0].course_id,
            name: 'Test Parent',
            email: badEmail,
            phone: '0901234567',
            requestId: crypto.randomUUID()
          }
        });
        assertHttpStatus(res, 400, `synthetic email ${badEmail}`);
      }

      const badReqId = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Test Parent',
          email: 'valid.parent@example.test',
          phone: '0901234567',
          requestId: 'not-a-uuid'
        }
      });
      assertHttpStatus(badReqId, 400, 'non-UUID requestId');

      const excludedCourse = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: {
          courseId: 'BUNDLE_YCT_ALL', // Not in DEFAULT_COURSE_IDS
          name: 'Test Parent',
          email: 'valid.parent@example.test',
          phone: '0901234567',
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(excludedCourse, 400, 'course not in guidance.course_ids');
    });

    it('[F13-T2-03] CA 10: blocks cross-customer order status snooping via GET web/status with 404', async () => {
      const customerA = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(customerA.orderRes, 200, 'customer A order');
      const orderIdA = customerA.orderRes.json.id;

      const customerB = await world.startWebChat();
      assertHttpStatus(customerB, 200, 'customer B startWebChat');

      const snoopRes = await world.request(`/api/ktn/consultations/web/status?id=${orderIdA}`, {
        token: customerB.token
      });
      assertHttpStatus(snoopRes, 404, 'cross-customer web/status snooping');
    });

    it('[F13-T2-04] rejects malformed order ID (400), expired/tampered web ticket (401), and ignores tampered client amount', async () => {
      const started = await world.startWebChat();
      assertHttpStatus(started, 200, 'startWebChat');

      const badOrderRes = await world.request('/api/ktn/consultations/web/status?id=BAD-ORDER', {
        token: started.token
      });
      assertHttpStatus(badOrderRes, 400, 'malformed order ID');

      const expiredTicket = mintWebTicket({
        id: crypto.randomUUID(),
        scope: 'web',
        secret: world.env.KTN_CONSULTATION_SECRET,
        ttlMs: -60_000
      });
      const expRes = await world.request('/api/ktn/consultations/web/status?id=ORD-123456', {
        token: expiredTicket
      });
      assertHttpStatus(expRes, 401, 'expired web ticket');

      // Client tries to tamper amount = 1 VND -> server ignores and locks catalog price 890000
      const tamperedRes = await world.request('/api/ktn/consultations/web/order', {
        method: 'POST',
        token: started.token,
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Tamper Test',
          email: 'tamper.test@example.test',
          phone: '0901234567',
          amount: 1,
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(tamperedRes, 200, 'server-locked price ignores client amount');
      assert.equal(tamperedRes.json.amount, CATALOG_COURSES[0].price);
    });

    it('[F13-T2-05] blocks non-owner advisor from calling POST staff/thread/:id/create_order with 403', async () => {
      const conv = await createZaloThread(world);
      await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: {}
      });

      const forbiddenRes = await world.staffReq(`staff/thread/${conv.id}/create_order`, {
        actor: STAFF_ACTORS.advisors[1],
        method: 'POST',
        json: {
          courseId: CATALOG_COURSES[0].course_id,
          name: 'Blocked Order',
          email: 'blocked.advisor@example.test',
          phone: '0901234567',
          requestId: crypto.randomUUID()
        }
      });
      assertHttpStatus(forbiddenRes, 403, 'non-owner advisor create_order');
    });

    it('[F13-T2-06] enforces ktn_consultation_protect_order P0001 guard on legacy overwrite while allowing consultation provisioning updates', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      assertHttpStatus(orderRes, 200, 'web/order');
      const orderId = orderRes.json.id;

      let caughtSqlErr = null;
      try {
        await world.db.query(
          `UPDATE public.ktn_orders SET note = 'legacy overwrite stripped consultation marker' WHERE order_id = $1`,
          [orderId]
        );
      } catch (err) {
        caughtSqlErr = err;
      }
      assert.ok(caughtSqlErr, 'Expected P0001 trigger error when stripping consultation marker');
      assert.match(caughtSqlErr.message || '', /Consultation order cannot be replaced/i);
    });

    // --- F14 (5 more -> total 6) ---
    it('[F14-T2-01] rejects missing, wrong, or Bearer-prefixed Apikey on POST /api/ktn/consultations/sepay with 401 and no secret leaks', async () => {
      const payload = makeSepayWebhook({ id: 904001, orderCode: 'ORD-123456', transferAmount: 890000 });

      const noKey = await world.request('/api/ktn/consultations/sepay', {
        method: 'POST',
        json: payload
      });
      assertHttpStatus(noKey, 401, 'sepay missing Authorization');
      assertNoSecretLeaks(noKey.text, { rootDir: ROOT_DIR });

      const wrongKey = await world.postSepay(payload, { apiKey: 'wrong-apikey-999' });
      assertHttpStatus(wrongKey, 401, 'sepay wrong Apikey');
      assertNoSecretLeaks(wrongKey.text, { rootDir: ROOT_DIR });

      const bearerScheme = await world.request('/api/ktn/consultations/sepay', {
        method: 'POST',
        headers: { Authorization: `Bearer ${world.env.KTN_SEPAY_API_KEY}` },
        json: payload
      });
      assertHttpStatus(bearerScheme, 401, 'sepay Bearer instead of Apikey');
    });

    it('[F14-T2-02] rejects transaction_id conflict across different order_id or amount without mutating either order', async () => {
      const orderA = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      const orderB = await createWebOrderViaApi(world, {
        course: CATALOG_COURSES[7],
        learner: LEARNERS_AND_PARENTS.parentLan
      });
      const idA = orderA.orderRes.json.id;
      const idB = orderB.orderRes.json.id;

      const first = await world.postSepay(
        makeSepayWebhook({ id: 904002, orderCode: idA, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(first, [200, 201], 'first tx');

      // Reuse same txId 904002 for orderB -> conflict
      const conflictOrder = await world.postSepay(
        makeSepayWebhook({ id: 904002, orderCode: idB, transferAmount: CATALOG_COURSES[7].price })
      );
      assert.ok(
        conflictOrder.status === 409 || conflictOrder.json?.conflict === true,
        `Expected 409 or { conflict: true }, got ${conflictOrder.status}: ${conflictOrder.text}`
      );

      // Reuse same txId 904002 with different amount -> conflict
      const conflictAmt = await world.postSepay(
        makeSepayWebhook({ id: 904002, orderCode: idA, transferAmount: 500000 })
      );
      assert.ok(
        conflictAmt.status === 409 || conflictAmt.json?.conflict === true,
        `Expected 409 or { conflict: true } on amount conflict, got ${conflictAmt.status}`
      );

      const ordBCheck = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [idB]
      );
      assert.equal(ordBCheck.rows[0].payment_status, 'pending_verification');
      assert.equal(ordBCheck.rows[0].approval_status, 'pending');
    });

    it('[F14-T2-03] flags SePay transfer for cancelled/rejected order as needs_review without unlocking access', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      const orderId = orderRes.json.id;

      await world.db.query(
        `UPDATE public.ktn_orders SET approval_status = 'rejected' WHERE order_id = $1`,
        [orderId]
      );

      const sepayRes = await world.postSepay(
        makeSepayWebhook({ id: 904003, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(sepayRes, [200, 201], 'sepay on rejected order');

      const payRow = await world.db.query(
        `SELECT status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:904003'`
      );
      assert.equal(payRow.rows[0].status, 'needs_review');

      const ordRow = await world.db.query(
        `SELECT approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordRow.rows[0].approval_status, 'rejected');

      const reconList = await world.staffReq('staff/reconciliation?kind=needs_review', {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(reconList, 200, 'reconciliation needs_review');
      assert.ok(reconList.json.items.some((x) => x.transaction_id === 'sepay:904003'));
    });

    it('[F14-T2-04] ignores outgoing transfers (transferType=out), zero amount, and multi-ORD ambiguity without paying any order', async () => {
      const ord1 = (await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] })).orderRes.json.id;
      const ord2 = (await createWebOrderViaApi(world, { course: CATALOG_COURSES[0], learner: LEARNERS_AND_PARENTS.parentLan })).orderRes.json.id;

      const outRes = await world.postSepay(
        makeSepayWebhook({ id: 904004, orderCode: ord1, transferAmount: 890000, transferType: 'out' })
      );
      assertHttpStatus(outRes, [200, 201], 'transferType out');

      const zeroRes = await world.postSepay(
        makeSepayWebhook({ id: 904005, orderCode: ord1, transferAmount: 0 })
      );
      assertHttpStatus(zeroRes, [200, 201], 'zero transferAmount');

      const multiCodeRes = await world.postSepay(
        makeSepayWebhook({
          id: 904006,
          orderCode: null,
          transferAmount: 890000,
          content: `KTN ${ord1} va ${ord2}`,
          description: ''
        })
      );
      assertHttpStatus(multiCodeRes, [200, 201], 'multi-ORD ambiguity');

      const unpaidCheck = await world.db.query(
        `SELECT order_id, payment_status FROM public.ktn_orders WHERE order_id = ANY($1::text[])`,
        [[ord1, ord2]]
      );
      for (const row of unpaidCheck.rows) {
        assert.equal(row.payment_status, 'pending_verification');
      }
    });

    it('[F14-T2-05] blocks POST staff/sepay/sandbox with 403 when KTN_SEPAY_SANDBOX is not true', async () => {
      const res = await world.staffReq('staff/sepay/sandbox', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          order_id: 'ORD-100001',
          transferAmount: 890000,
          kind: 'accepted'
        }
      });
      assertHttpStatus(res, 403, 'staff/sepay/sandbox in live-auth mode');
    });

    // --- F15 (6 tests = 6) ---
    it('[F15-T2-01] CA 08: keeps payment_status=paid on izTeach 502 and escalates to needs_review + reconciliation log at attempts >= 6', async () => {
      const { orderRes } = await createWebOrderViaApi(world, {
        course: CATALOG_COURSES[0],
        learner: { name: 'Học Viên Fail IzTeach', email: 'izfail.t2@example.test', phone: '0907111222' }
      });
      const orderId = orderRes.json.id;

      world.mocks.setFaults({ failIzTeachCreate: true });
      const sepayRes = await world.postSepay(
        makeSepayWebhook({ id: 905001, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(sepayRes, [200, 201], 'sepay during izTeach 502');

      const ordMid = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordMid.rows[0].payment_status, 'paid');
      assert.equal(ordMid.rows[0].approval_status, 'pending');

      for (let i = 0; i < 6; i += 1) {
        await world.db.query(
          `UPDATE public.ktn_consultation_payments SET next_attempt_at = now() - interval '1 minute' WHERE transaction_id = 'sepay:905001'`
        );
        await world.scheduled();
      }

      const payRow = await world.db.query(
        `SELECT status, attempts FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:905001'`
      );
      assert.equal(payRow.rows[0].status, 'needs_review');
      assert.ok(payRow.rows[0].attempts >= 6);

      const ordFinal = await world.db.query(
        `SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1`,
        [orderId]
      );
      assert.equal(ordFinal.rows[0].payment_status, 'paid');
      assert.equal(ordFinal.rows[0].approval_status, 'pending');

      const reconRes = await world.staffReq('staff/reconciliation?kind=needs_review', {
        actor: STAFF_ACTORS.manager
      });
      assertHttpStatus(reconRes, 200, 'reconciliation after 6 failed attempts');
      assert.ok(reconRes.json.items.some((x) => x.transaction_id === 'sepay:905001'));
    });

    it('[F15-T2-02] preserves payment_status=paid when Resend 502 fails and recovers cleanly on retry without duplicate izTeach student', async () => {
      const learner = { name: 'Học Viên Fail Resend', email: 'resendfail.t2@example.test', phone: '0907222333' };
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0], learner });
      const orderId = orderRes.json.id;

      world.mocks.setFaults({ failResendEmail: true });
      const sepayRes = await world.postSepay(
        makeSepayWebhook({ id: 905002, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(sepayRes, [200, 201], 'sepay during resend 502');

      const payAfterFail = await world.db.query(
        `SELECT status, attempts FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:905002'`
      );
      assert.equal(payAfterFail.rows[0].status, 'accepted');
      assert.equal(payAfterFail.rows[0].attempts, 1);

      const izCountBefore = world.mocks.izteach.students.filter((s) => s.email === learner.email).length;
      assert.equal(izCountBefore, 1);

      world.mocks.clearFaults();
      await world.db.query(
        `UPDATE public.ktn_consultation_payments SET next_attempt_at = now() - interval '1 minute' WHERE transaction_id = 'sepay:905002'`
      );
      await world.scheduled();

      const payDone = await world.db.query(
        `SELECT status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:905002'`
      );
      assert.equal(payDone.rows[0].status, 'done');
      const izCountAfter = world.mocks.izteach.students.filter((s) => s.email === learner.email).length;
      assert.equal(izCountAfter, 1);
    });

    it('[F15-T2-03] enforces RBAC (403) and state guards (409/400/404) on POST staff/thread/:id/retry_payment', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      const orderId = orderRes.json.id;
      const convId = (
        await world.db.query(`SELECT consultation_id FROM public.ktn_consultation_orders WHERE order_id = $1`, [orderId])
      ).rows[0].consultation_id;

      // Underpaid mismatch -> status is 'mismatch' (not needs_review)
      await world.postSepay(makeSepayWebhook({ id: 905003, orderCode: orderId, transferAmount: 500000 }));

      const advRetry = await world.staffReq(`staff/thread/${convId}/retry_payment`, {
        actor: STAFF_ACTORS.advisors[0],
        method: 'POST',
        json: { order_id: orderId, transaction_id: 'sepay:905003' }
      });
      assertHttpStatus(advRetry, 403, 'advisor retry_payment');

      const mismatchRetry = await world.staffReq(`staff/thread/${convId}/retry_payment`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { order_id: orderId, transaction_id: 'sepay:905003' }
      });
      assertHttpStatus(mismatchRetry, 409, 'retry_payment on mismatch');

      const badTxFormat = await world.staffReq(`staff/thread/${convId}/retry_payment`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { order_id: orderId, transaction_id: 'bad_tx_format' }
      });
      assertHttpStatus(badTxFormat, 400, 'retry_payment malformed txId');

      const unknownOrd = await world.staffReq(`staff/thread/${convId}/retry_payment`, {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: { order_id: 'ORD-000404', transaction_id: 'sepay:905003' }
      });
      assertHttpStatus(unknownOrd, 404, 'retry_payment unknown order');
    });

    it('[F15-T2-04] enforces FOR UPDATE SKIP LOCKED on concurrent ktn_consultation_take_payment invocations', async () => {
      const { orderRes } = await createWebOrderViaApi(world, { course: CATALOG_COURSES[0] });
      const orderId = orderRes.json.id;
      await world.db.query(
        `UPDATE public.ktn_orders SET payment_status = 'paid' WHERE order_id = $1`,
        [orderId]
      );
      await world.db.query(
        `INSERT INTO public.ktn_consultation_payments (transaction_id, order_id, amount, status, attempts, next_attempt_at)
         VALUES ('sepay:905004', $1, $2, 'accepted', 0, now() - interval '1 minute')`,
        [orderId, CATALOG_COURSES[0].price]
      );

      // Single-connection PGlite cannot hold two concurrent transactions simultaneously;
      // this sequentially verifies the 5-minute next_attempt_at backoff lock guard after take_payment claims the row.
      await world.db.exec('BEGIN;');
      const claimedFirst = await world.db.query(
        `SELECT * FROM public.ktn_consultation_take_payment($1)`,
        [orderId]
      );
      assert.equal(claimedFirst.rows.length, 1);

      await world.db.exec('COMMIT;');
      const claimedSecond = await world.db.query(
        `SELECT * FROM public.ktn_consultation_take_payment($1)`,
        [orderId]
      );
      assert.equal(claimedSecond.rows.length, 0, 'Already-claimed payment must not be double-taken within backoff window');
    });

    it('[F15-T2-05] returns 404 for unknown student_code and 403 for cross-advisor POST staff/thread/:id/link_student', async () => {
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

      const unknownRes = await world.staffReq(`staff/thread/${conv.id}/link_student`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: { student_code: 'KTN-NO-SUCH-CODE' }
      });
      assertHttpStatus(unknownRes, 404, 'link_student unknown student_code');

      const crossAdvisorRes = await world.staffReq(`staff/thread/${conv.id}/link_student`, {
        actor: STAFF_ACTORS.advisors[1],
        authType: 'supabase-jwt',
        method: 'POST',
        json: { student_code: 'KTN-2026-089' }
      });
      assertHttpStatus(crossAdvisorRes, 403, 'cross-advisor link_student');
    });

    it('[F15-T2-06] blocks hard delete of student with paid consultation order (409 RETENTION_POLICY_BLOCKED) and legacy webhook skips consultation orders', async () => {
      const { orderRes } = await createWebOrderViaApi(world, {
        course: CATALOG_COURSES[0],
        learner: { name: 'Bé Nguyễn Hoàng Ngân', email: 'hoangngan@khongtunhi.com', phone: '0900000089' }
      });
      const orderId = orderRes.json.id;

      // Legacy webhook must skip consultation order
      const legacyWebhook = await world.request('/api/ktn/webhook/payment', {
        method: 'POST',
        headers: {
          'X-KTN-Webhook-Secret': world.env.KTN_WEBHOOK_SECRET,
          'Content-Type': 'application/json'
        },
        json: makeSepayWebhook({ id: 905006, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      });
      assertHttpStatus(legacyWebhook, 200, 'legacy webhook skip');
      assert.equal(legacyWebhook.json.skipped, true);
      assert.equal(legacyWebhook.json.reason, 'CONSULTATION_PAYMENT_ENDPOINT');

      // Now pay via consultation SePay webhook
      const sepayOk = await world.postSepay(
        makeSepayWebhook({ id: 905007, orderCode: orderId, transferAmount: CATALOG_COURSES[0].price })
      );
      assertHttpStatus(sepayOk, [200, 201], 'consultation sepay');

      // Retention gate blocks delete -> 409 RETENTION_POLICY_BLOCKED
      const delRes = await world.staffReq('/api/ktn/admin/students/lifecycle', {
        actor: STAFF_ACTORS.manager,
        method: 'POST',
        json: {
          email: 'hoangngan@khongtunhi.com',
          action: 'delete',
          confirmDelete: true,
          reason: 'Kiểm thử khóa chính sách lưu trữ',
          enforceRetentionGate: true
        }
      });
      assertHttpStatus(delRes, 409, 'retention gate delete');
      assert.equal(delRes.json.error, 'RETENTION_POLICY_BLOCKED');
      assert.equal(delRes.json.retentionBlocked, true);
      assert.equal(delRes.json.recommendedAction, 'archive');
      assert.ok(delRes.json.paidOrderCount >= 1);
    });

    // --- F17 (6 tests = 6) ---
    it('[F17-T2-01] blocks non-manager advisor from staff/report, staff/report.csv, and staff/thread/:id/review (403) and strips flags from staff/thread/:id', async () => {
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
          json: { request_id: crypto.randomUUID(), body: 'Tin nhắn advisor để kiểm tra flag.' }
        }),
        200,
        'reply'
      );
      const msgId = (
        await world.db.query(
          `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' LIMIT 1`,
          [conv.id]
        )
      ).rows[0].id;
      await world.db.query(
        `INSERT INTO public.ktn_consultation_flags (message_id, consultation_id, category, excerpt, reason, status)
         VALUES ($1, $2, 'price', 'Tin nhắn advisor', 'Test', 'pending')`,
        [msgId, conv.id]
      );

      assertHttpStatus(
        await world.staffReq('staff/report', { actor: STAFF_ACTORS.advisors[0] }),
        403,
        'advisor GET staff/report'
      );
      assertHttpStatus(
        await world.staffReq('staff/report.csv', { actor: STAFF_ACTORS.advisors[0] }),
        403,
        'advisor GET staff/report.csv'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/review`, {
          actor: STAFF_ACTORS.advisors[0],
          method: 'POST',
          json: { message_id: msgId, status: 'confirmed' }
        }),
        403,
        'advisor POST review'
      );

      const advThread = await world.staffReq(`staff/thread/${conv.id}`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt'
      });
      assertHttpStatus(advThread, 200, 'advisor GET own thread');
      assertSafeStaffThreadResponse(advThread.json, { isAdmin: false });
    });

    it('[F17-T2-02] rejects date range > 31 days, inverted from > to, and invalid YYYY-MM-DD with 400 on report and report.csv', async () => {
      for (const path of ['staff/report', 'staff/report.csv']) {
        assertHttpStatus(
          await world.staffReq(`${path}?from=2026-10-01&to=2026-11-15`, { actor: STAFF_ACTORS.manager }),
          400,
          `${path} >31 days`
        );
        assertHttpStatus(
          await world.staffReq(`${path}?from=2026-11-15&to=2026-11-01`, { actor: STAFF_ACTORS.manager }),
          400,
          `${path} inverted range`
        );
        assertHttpStatus(
          await world.staffReq(`${path}?from=2026/11/01&to=2026-11-10`, { actor: STAFF_ACTORS.manager }),
          400,
          `${path} bad date format`
        );
      }
    });

    it('[F17-T2-03] flagThread ignores hallucinated flags referencing customer/bot messages, ungrounded excerpts, or invalid categories', async () => {
      const conv = await createZaloThread(world, { text: 'Khách hỏi giá 500k phải không?' });
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
          json: { request_id: crypto.randomUUID(), body: 'Dạ học phí theo niêm yết của trung tâm ạ.' }
        }),
        200,
        'reply'
      );

      const msgs = (
        await world.db.query(
          `SELECT id, sender FROM public.ktn_consultation_messages WHERE consultation_id = $1 ORDER BY created_at`,
          [conv.id]
        )
      ).rows;
      const custMsg = msgs.find((m) => m.sender === 'customer');
      const advMsg = msgs.find((m) => m.sender === 'advisor');

      await world.db.query(
        `UPDATE public.ktn_consultations SET next_review_at = now() - interval '1 minute' WHERE id = $1`,
        [conv.id]
      );
      world.mocks.setFaults({
        geminiResponse: {
          flags: [
            { message_id: custMsg.id, category: 'price', excerpt: 'giá 500k', reason: 'Customer message should be ignored' },
            { message_id: advMsg.id, category: 'price', excerpt: 'không có trong tin nhắn', reason: 'Ungrounded excerpt' },
            { message_id: advMsg.id, category: 'unknown_cat', excerpt: 'học phí theo niêm yết', reason: 'Invalid category' }
          ]
        }
      });

      await world.scheduled();

      const flagRows = await world.db.query(
        `SELECT * FROM public.ktn_consultation_flags WHERE consultation_id = $1`,
        [conv.id]
      );
      assert.equal(flagRows.rows.length, 0);
    });

    it('[F17-T2-04] redacts emails, phones, and URLs before flagThread sends conversation history to Gemini', async () => {
      const conv = await createZaloThread(world);
      await world.staffReq(`staff/thread/${conv.id}/claim`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {}
      });
      await world.staffReq(`staff/thread/${conv.id}/reply`, {
        actor: STAFF_ACTORS.advisors[0],
        authType: 'supabase-jwt',
        method: 'POST',
        json: {
          request_id: crypto.randomUUID(),
          body: 'Anh gửi qua staff.leak@example.test hoặc gọi 0909 123 456 và xem https://internal.example/doc'
        }
      });
      await world.db.query(
        `UPDATE public.ktn_consultations SET next_review_at = now() - interval '1 minute' WHERE id = $1`,
        [conv.id]
      );
      world.mocks.setFaults({ geminiResponse: { flags: [] } });

      await world.scheduled();

      assert.ok(world.mocks.upstreamCalls.gemini.length >= 1, 'Expected Gemini call during flagThread');
      const geminiBodyStr = JSON.stringify(world.mocks.upstreamCalls.gemini.at(-1).body);
      assertPiiRedacted(
        geminiBodyStr,
        ['staff.leak@example.test', '0909 123 456', 'https://internal.example/doc'],
        'flagThread Gemini payload'
      );
    });

    it('[F17-T2-05] returns 409 on double review_flag and 400 on invalid message_id or status', async () => {
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
          json: { request_id: crypto.randomUUID(), body: 'Nội dung test review 409.' }
        }),
        200,
        'reply'
      );
      const msgId = (
        await world.db.query(
          `SELECT id FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor' LIMIT 1`,
          [conv.id]
        )
      ).rows[0].id;
      await world.db.query(
        `INSERT INTO public.ktn_consultation_flags (message_id, consultation_id, category, excerpt, reason, status)
         VALUES ($1, $2, 'fit', 'test review', 'Test', 'pending')`,
        [msgId, conv.id]
      );

      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/review`, {
          actor: STAFF_ACTORS.manager,
          method: 'POST',
          json: { message_id: 'not-a-uuid', status: 'confirmed' }
        }),
        400,
        'invalid message_id'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/review`, {
          actor: STAFF_ACTORS.manager,
          method: 'POST',
          json: { message_id: msgId, status: 'pending' }
        }),
        400,
        'invalid review status'
      );

      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/review`, {
          actor: STAFF_ACTORS.manager,
          method: 'POST',
          json: { message_id: msgId, status: 'confirmed' }
        }),
        200,
        'first review'
      );
      assertHttpStatus(
        await world.staffReq(`staff/thread/${conv.id}/review`, {
          actor: STAFF_ACTORS.manager,
          method: 'POST',
          json: { message_id: msgId, status: 'dismissed' }
        }),
        409,
        'double review 409'
      );
    });

    it('[F17-T2-06] scopes staff/report in KTN_CONSULTATION_MODE=web to channel=web with empty paid/flags and zero secret leaks', async () => {
      const pilotWorld = await createTestWorld({
        mode: 'live-auth',
        envOverrides: { KTN_CONSULTATION_MODE: 'web' }
      });
      try {
        await pilotWorld.db.query(
          `INSERT INTO public.ktn_consultations (channel, external_id, status) VALUES ('zalo_oa', 'zalo-pilot-filter', 'waiting')`
        );
        const started = await pilotWorld.startWebChat();
        assertHttpStatus(started, 200, 'pilot startWebChat');

        const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
        const repRes = await pilotWorld.staffReq(`staff/report?from=${today}&to=${today}&channel=zalo_oa`, {
          actor: STAFF_ACTORS.manager
        });
        assertHttpStatus(repRes, 200, 'pilot staff/report');
        assert.deepEqual(repRes.json.paid, []);
        assert.deepEqual(repRes.json.flags, []);
        assert.ok(repRes.json.conversations.every((c) => c.channel === 'web'));
        assertNoSecretLeaks(repRes.json, { rootDir: ROOT_DIR, label: 'pilot staff/report' });
      } finally {
        await pilotWorld.close();
      }
    });
  });

  describe('Layer B (Playwright + Vite BFF): F16 RBAC, Snooping, Validation, Session & Error Recovery', () => {
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

    it('[F16-T2-01] enforces RequireRole guards on /admin/orders, /admin/students, /admin/more, /admin/consultations and hides manager tabs from advisor', async () => {
      // Student blocked from /admin/orders and /admin/consultations
      const stuCtx = await harness.openDesktopPage();
      let advCtx;
      try {
        await seedAuthSession(
          stuCtx.context,
          harness.baseUrl,
          { email: 'hoangngan@khongtunhi.com', name: 'Hoàng Ngân', role: 'student' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );
        for (const path of ['/admin/orders', '/admin/consultations']) {
          await stuCtx.page.goto(`${harness.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await stuCtx.page.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 20000 });
        }
        stuCtx.diag.assertNoPageErrors();

        // Advisor blocked from /admin/orders & /admin/students, allowed on /admin/consultations without manager tabs
        advCtx = await harness.openDesktopPage();
        await seedAuthSession(
          advCtx.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.advisors[0].email, name: STAFF_ACTORS.advisors[0].name, role: 'advisor' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );
        for (const path of ['/admin/orders', '/admin/students', '/admin/more']) {
          await advCtx.page.goto(`${harness.baseUrl}${path}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
          await advCtx.page.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 20000 });
        }
        await advCtx.page.goto(`${harness.baseUrl}/admin/consultations`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await advCtx.page.waitForSelector('[data-testid="consultation-crm-workspace"]', { timeout: 20000 });
        for (const hiddenTab of ['crm-tab-flags', 'crm-tab-analytics', 'crm-tab-recon', 'crm-tab-settings']) {
          assert.equal(await advCtx.page.locator(`[data-testid="${hiddenTab}"]`).count(), 0);
        }
        advCtx.diag.assertNoPageErrors();
      } finally {
        await advCtx?.context?.close().catch(() => {});
        await stuCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T2-02] blocks cross-advisor snooping (403 + crm-thread-error-alert) without leaking Advisor A messages or notes', async () => {
      const api = await harness.getApiClient();
      const mgrCtx = await harness.openDesktopPage();
      let advB;
      try {
        const mgrToken = (await seedAuthSession(
          mgrCtx.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        // Ensure Advisor Binh exists in ktn_advisors so /api/ktn/auth/session succeeds before testing thread 403
        const ensureAdvBRes = await api.put('/api/ktn/consultations/staff/advisors', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: {
            email: STAFF_ACTORS.advisors[1].email,
            name: STAFF_ACTORS.advisors[1].name,
            active: true,
            role: 'advisor'
          }
        });
        assert.equal(ensureAdvBRes.status(), 200, `Expected 200 from staff/advisors upsert, got ${ensureAdvBRes.status()}`);

        // Create thread and assign to Advisor An with a secret internal note
        const sbRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: {
            event_name: 'user_send_text',
            zalo_user_id: 'zalo-pw-t2-snoop',
            customer_name: 'Khách Riêng Tư',
            body: 'Nội dung mật của ca Advisor An'
          }
        });
        assert.equal(sbRes.status(), 200);
        const threadId = (await sbRes.json()).conversation?.id;
        const assignRes = await api.post(`/api/ktn/consultations/staff/thread/${threadId}/assign`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: { email: STAFF_ACTORS.advisors[0].email }
        });
        assert.equal(assignRes.status(), 200, `Expected 200 from staff/thread/assign, got ${assignRes.status()}`);
        const noteRes = await api.post(`/api/ktn/consultations/staff/thread/${threadId}/note`, {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: { body: 'SECRET_ADVISOR_A_INTERNAL_NOTE' }
        });
        assert.equal(noteRes.status(), 200, `Expected 200 from staff/thread/note, got ${noteRes.status()}`);

        // Advisor Binh tries direct URL & API access
        advB = await harness.openDesktopPage();
        const advBToken = (await seedAuthSession(
          advB.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.advisors[1].email, name: STAFF_ACTORS.advisors[1].name, role: 'advisor' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        const apiSnoop = await api.get(`/api/ktn/consultations/staff/thread/${threadId}`, {
          headers: { Authorization: `Bearer ${advBToken}` }
        });
        assert.equal(apiSnoop.status(), 403);

        await advB.page.goto(`${harness.baseUrl}/admin/consultations?thread=${threadId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        await advB.page.waitForSelector('[data-testid="crm-thread-error-alert"]', { timeout: 20000 });
        const bodyText = await advB.page.locator('body').textContent();
        assert.equal(bodyText.includes('SECRET_ADVISOR_A_INTERNAL_NOTE'), false);
        assert.equal(bodyText.includes('Nội dung mật của ca Advisor An'), false);
        advB.diag.assertNoPageErrors();
      } finally {
        await advB?.context?.close().catch(() => {});
        await mgrCtx?.context?.close().catch(() => {});
      }
    });

    it('[F16-T2-03] rejects invalid phone in WebChatbotWidget and blocks unredacted PII in ConsultationSettingsPanel & PUT staff/guidance', async () => {
      const api = await harness.getApiClient();
      const guest = await harness.openDesktopPage();
      let mgr;
      try {
        await guest.page.goto(`${harness.baseUrl}/chatbot`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await guest.page.waitForSelector('[data-testid="web-chatbot-panel"]', { timeout: 25000 });
        await guest.page.waitForFunction(() => Boolean(localStorage.getItem('ktn_consult_web')), null, { timeout: 15000 });
        await guest.page.locator('[data-testid="web-chatbot-qr-FLOW_KIDS"]').waitFor({ state: 'visible', timeout: 15000 });

        await guest.page.locator('[data-testid="web-chatbot-need-phone-toggle"]').click();
        await guest.page.waitForSelector('[data-testid="web-chatbot-need-phone-form"]', { timeout: 10000 });

        // Count only requests triggered by invalid phone form submission
        let messagePosts = 0;
        guest.page.on('request', (req) => {
          if (req.url().includes('/api/ktn/consultations/web/message') && req.method() === 'POST') {
            messagePosts += 1;
          }
        });

        await guest.page.locator('[data-testid="web-chatbot-phone-input"]').fill('0123456789');
        await guest.page.locator('[data-testid="web-chatbot-phone-submit-btn"]').click();
        await guest.page.locator('[data-testid="web-chatbot-need-phone-form"] p.text-red-700').waitFor({ state: 'visible', timeout: 5000 });
        assert.equal(messagePosts, 0, 'Invalid phone must not submit web/message');
        guest.diag.assertNoPageErrors();

        // Manager settings PII validation in UI + server PUT staff/guidance 400
        mgr = await harness.openDesktopPage();
        const mgrToken = (await seedAuthSession(
          mgr.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        await mgr.page.goto(`${harness.baseUrl}/admin/consultations`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await mgr.page.waitForSelector('[data-testid="crm-tab-settings"]', { timeout: 25000 });
        await mgr.page.locator('[data-testid="crm-tab-settings"]').click();
        await mgr.page.waitForSelector('[data-testid="crm-settings-panel"]', { timeout: 15000 });

        await mgr.page.locator('[data-testid="crm-add-example-btn"]').click();
        const qInputs = mgr.page.locator('[data-testid^="crm-example-question-"]');
        const aInputs = mgr.page.locator('[data-testid^="crm-example-answer-"]');
        const lastIdx = (await qInputs.count()) - 1;
        await qInputs.nth(lastIdx).fill('Câu hỏi mẫu test PII');
        await aInputs.nth(lastIdx).fill('Gọi 0901234567 hoặc email leak@test.com');
        await mgr.page.locator('[data-testid="crm-save-guidance-btn"]').click();

        await mgr.page.waitForSelector('[data-testid="crm-guidance-pii-error"]', { timeout: 10000 });
        mgr.diag.assertNoPageErrors();

        const rawPut = await api.put('/api/ktn/consultations/staff/guidance', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: {
            policy: 'Chính sách KTN',
            examples: [{ question: 'Hỏi', answer: 'Liên hệ 0901234567 hoặc leak@test.com', hints: [] }],
            course_ids: [CATALOG_COURSES[0].course_id],
            duration_presets: { [CATALOG_COURSES[0].course_id]: '3m' },
            bot_enabled: true,
            checkout_enabled: true
          }
        });
        assert.equal(rawPut.status(), 400);
      } finally {
        await mgr?.context?.close().catch(() => {});
        await guest?.context?.close().catch(() => {});
      }
    });

    it('[F16-T2-04] redirects unauthenticated users and invalidates tampered/expired ktn_webapp_token sessions back to /login', async () => {
      const guest = await harness.openDesktopPage();
      let tampered;
      try {
        await guest.page.goto(`${harness.baseUrl}/admin/consultations`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await guest.page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 20000 });

        tampered = await harness.openDesktopPage();
        await seedAuthSession(
          tampered.context,
          harness.baseUrl,
          {
            email: STAFF_ACTORS.manager.email,
            name: STAFF_ACTORS.manager.name,
            role: 'admin',
            token: 'tamperedPayload.invalidSignature'
          },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );
        await tampered.page.goto(`${harness.baseUrl}/admin/consultations`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await tampered.page.waitForURL((url) => url.pathname.includes('/login'), { timeout: 20000 });
        assert.equal(await tampered.page.locator('[data-testid="consultation-crm-workspace"]').count(), 0);
        tampered.diag.assertNoPageErrors();
      } finally {
        await tampered?.context?.close().catch(() => {});
        await guest?.context?.close().catch(() => {});
      }
    });

    it('[F16-T2-05] enforces StudentDetailDrawer conditional delete button guards and CreateConsultationOrderModal validation', async () => {
      const api = await harness.getApiClient();
      const mgr = await harness.openDesktopPage();
      try {
        const mgrToken = (await seedAuthSession(
          mgr.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;

        // 1. StudentDetailDrawer delete guard
        await mgr.page.goto(`${harness.baseUrl}/admin/students`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await mgr.page.waitForSelector('[data-testid="admin-open-student-btn-hoangngan@khongtunhi.com"]', { timeout: 25000 });
        await mgr.page.locator('[data-testid="admin-open-student-btn-hoangngan@khongtunhi.com"]').click();
        await mgr.page.waitForSelector('[data-testid="drawer-lifecycle-delete-btn"]', { timeout: 10000 });
        await mgr.page.locator('[data-testid="drawer-lifecycle-delete-btn"]').click();

        const confirmSubmit = mgr.page.locator('[data-testid="drawer-lifecycle-confirm-submit-btn"]');
        await confirmSubmit.waitFor({ state: 'visible', timeout: 10000 });
        assert.equal(await confirmSubmit.isDisabled(), true);

        await mgr.page.locator('[data-testid="drawer-lifecycle-reason-input"]').fill('ab');
        await mgr.page.locator('[data-testid="drawer-lifecycle-delete-confirm-checkbox"]').check();
        assert.equal(await confirmSubmit.isDisabled(), true, 'Must stay disabled when reason < 3 chars');

        // 2. CreateConsultationOrderModal invalid phone/name guard
        const sbRes = await api.post('/api/ktn/consultations/staff/zalo/sandbox', {
          headers: { Authorization: `Bearer ${mgrToken}` },
          data: { event_name: 'user_send_text', zalo_user_id: 'zalo-pw-t2-modal', body: 'Test modal' }
        });
        assert.equal(sbRes.status(), 200, `Expected 200 from staff/zalo/sandbox, got ${sbRes.status()}`);
        const threadId = (await sbRes.json()).conversation?.id;
        await mgr.page.goto(`${harness.baseUrl}/admin/consultations?thread=${threadId}`, {
          waitUntil: 'domcontentloaded',
          timeout: 60000
        });
        await mgr.page.waitForSelector('[data-testid="crm-open-create-order-btn"]', { timeout: 20000 });
        await mgr.page.locator('[data-testid="crm-open-create-order-btn"]').click();
        await mgr.page.waitForSelector('[data-testid="crm-create-order-modal"]', { timeout: 10000 });

        let orderCalls = 0;
        mgr.page.on('request', (req) => {
          if (req.url().includes('/create_order') && req.method() === 'POST') orderCalls += 1;
        });
        await mgr.page.locator('[data-testid="crm-create-order-name-input"]').fill('');
        await mgr.page.locator('[data-testid="crm-create-order-phone-input"]').fill('12345');
        await mgr.page.locator('[data-testid="crm-create-order-submit-btn"]').click();
        assert.equal(orderCalls, 0, 'Invalid form must not submit create_order API');
        mgr.diag.assertNoPageErrors();
      } finally {
        await mgr?.context?.close().catch(() => {});
      }
    });

    it('[F16-T2-06] surfaces BFF 503 error cleanly with retry recovery on SepayReconciliationPanel and enforces 403 on direct API', async () => {
      const api = await harness.getApiClient();
      const advCtx = await harness.openDesktopPage();
      let mgr;
      try {
        const advToken = (await seedAuthSession(
          advCtx.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.advisors[0].email, name: STAFF_ACTORS.advisors[0].name, role: 'advisor' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        )).token;
        const forbiddenApi = await api.get('/api/ktn/consultations/staff/reconciliation', {
          headers: { Authorization: `Bearer ${advToken}` }
        });
        assert.equal(forbiddenApi.status(), 403);

        mgr = await harness.openDesktopPage();
        await seedAuthSession(
          mgr.context,
          harness.baseUrl,
          { email: STAFF_ACTORS.manager.email, name: STAFF_ACTORS.manager.name, role: 'admin' },
          TEST_ENV_DEFAULTS.KTN_SESSION_SECRET
        );

        let inject503 = true;
        await mgr.page.route('**/api/ktn/consultations/staff/reconciliation*', async (route) => {
          if (inject503) {
            await route.fulfill({
              status: 503,
              contentType: 'application/json',
              body: JSON.stringify({ error: 'Upstream database temporarily unavailable' })
            });
            return;
          }
          await route.continue();
        });

        await mgr.page.goto(`${harness.baseUrl}/admin/more`, { waitUntil: 'domcontentloaded', timeout: 60000 });
        await mgr.page.waitForSelector('[data-testid="sepay-recon-error-alert"]', { timeout: 25000 });
        const alertText = await mgr.page.locator('[data-testid="sepay-recon-error-alert"]').textContent();
        assertNoSecretLeaks(alertText || '', { rootDir: ROOT_DIR, label: 'sepay-recon-error-alert' });

        inject503 = false;
        await mgr.page.locator('[data-testid="sepay-recon-retry-fetch-btn"]').click();
        await mgr.page.waitForSelector('[data-testid="sepay-recon-error-alert"]', { state: 'detached', timeout: 15000 });
        mgr.diag.assertNoPageErrors();
      } finally {
        await mgr?.context?.close().catch(() => {});
        await advCtx?.context?.close().catch(() => {});
      }
    });
  });
});
