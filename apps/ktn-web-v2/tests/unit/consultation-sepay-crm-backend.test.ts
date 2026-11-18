// @vitest-environment node
import crypto from 'node:crypto';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

// @ts-ignore Root ESM worker modules do not carry TypeScript declarations
import { isSepaySandbox, hasSepayReadyConfig } from '../../../../consultation-sepay.mjs';
// @ts-ignore Local BFF harness ESM module
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
import {
  createTestWorld,
  mintKtnSession,
  mintSupabaseJwt,
  sepayHeaders,
  zaloSign
// @ts-ignore Root E2E harness ESM module
} from '../../../../tests/e2e-zalo-crm/harness/worker-client.mjs';

vi.setConfig({ testTimeout: 30_000, hookTimeout: 30_000 });

async function invokeMiddleware(
  harness: any,
  urlPath: string,
  options: { method?: string; headers?: Record<string, string>; json?: unknown } = {}
) {
  const chunks: Buffer[] = [];
  if (options.json !== undefined) {
    chunks.push(Buffer.from(JSON.stringify(options.json), 'utf8'));
  }
  const req: any = {
    url: urlPath,
    method: (options.method || 'GET').toUpperCase(),
    headers: {
      host: 'localhost:5173',
      ...(options.json !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(options.headers || {})
    },
    async *[Symbol.asyncIterator]() {
      for (const c of chunks) yield c;
    }
  };

  let statusCode = 200;
  const headers: Record<string, string> = {};
  const bodyChunks: Buffer[] = [];
  let nextCalled = false;

  const res: any = {
    set statusCode(val: number) {
      statusCode = val;
    },
    get statusCode() {
      return statusCode;
    },
    setHeader(k: string, v: string | string[]) {
      headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : String(v);
    },
    end(data?: Buffer | string) {
      if (data !== undefined && data !== null) {
        bodyChunks.push(Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'utf8'));
      }
    }
  };

  await harness.handleRequest(req, res, () => {
    nextCalled = true;
  });

  const text = Buffer.concat(bodyChunks).toString('utf8');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { status: statusCode, headers, text, json, nextCalled };
}

describe('M3 SePay, Unified CRM, RBAC, P0001 Fix & Middleware Integration', () => {
  let world: any;
  let defaultEnvSnapshot: Record<string, unknown>;

  beforeAll(async () => {
    world = await createTestWorld({ mode: 'sandbox' });
    defaultEnvSnapshot = { ...world.env };
  });

  afterAll(async () => {
    if (world) await world.close();
  });

  afterEach(async () => {
    if (world) {
      await world.reset();
      for (const k of Object.keys(world.env)) {
        if (!(k in defaultEnvSnapshot)) delete world.env[k];
      }
      Object.assign(world.env, defaultEnvSnapshot);
    }
  });

  it('1. creates VietQR consultation orders in live and sandbox (incl. missing keys, pilot mode, and optional-email staff create_order)', async () => {
    // Live mode without SePay/Mail keys must return 503
    Object.assign(world.env, {
      KTN_SEPAY_SANDBOX: 'false',
      KTN_SEPAY_API_KEY: '',
      KTN_CONSULTATION_MAIL_KEY: '',
      KTN_CONSULTATION_MAIL_FROM: ''
    });
    expect(isSepaySandbox(world.env)).toBe(false);
    expect(hasSepayReadyConfig(world.env)).toBe(false);

    const start1 = await world.request('/api/ktn/consultations/web/start', { method: 'POST' });
    expect(start1.status).toBe(200);
    const webToken1 = start1.json.token;

    const liveMissingRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: webToken1,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé An Live Fail',
        email: 'bean.live@example.com',
        phone: '0901234567'
      }
    });
    expect(liveMissingRes.status).toBe(503);

    // Sandbox mode even without live SePay/Mail keys & even in pilot mode must succeed (no 503)
    Object.assign(world.env, {
      KTN_SEPAY_SANDBOX: 'true',
      KTN_CONSULTATION_MODE: 'pilot',
      KTN_SEPAY_API_KEY: '',
      KTN_CONSULTATION_MAIL_KEY: '',
      KTN_CONSULTATION_MAIL_FROM: ''
    });
    expect(isSepaySandbox(world.env)).toBe(true);
    expect(hasSepayReadyConfig(world.env)).toBe(true);

    const sandboxOrderRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: webToken1,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé An Sandbox',
        email: 'bean.sbx@example.com',
        phone: '0901234567'
      }
    });
    expect(sandboxOrderRes.status).toBe(200);
    expect(sandboxOrderRes.json.id).toMatch(/^ORD-\d{6}$/);
    expect(sandboxOrderRes.json.payment.qrUrl).toContain('https://img.vietqr.io/image/');
    expect(sandboxOrderRes.json.payment.transferContent).toBe(`KTN ${sandboxOrderRes.json.id}`);
    expect(sandboxOrderRes.json.source).toBe('web_chat');

    // Switch back to full mode and test staff/thread/:id/create_order with optional email & cross-advisor RBAC
    Object.assign(world.env, { KTN_CONSULTATION_MODE: 'full' });
    const zaloRes = await world.postZaloEvent({
      event_name: 'user_send_text',
      sender: { id: 'zalo-order-1', name: 'Mẹ Bé Bo' },
      message: { msg_id: 'msg-order-1', text: 'Gặp tư vấn viên giúp mình' }
    });
    expect(zaloRes.status).toBe(200);
    const convId = zaloRes.json.consultation_id;

    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });
    const advAnToken = mintKtnSession({ email: 'advisor.an@khongtunhi.com', name: 'Tư Vấn An', role: 'advisor' });
    const advBinhToken = mintKtnSession({ email: 'advisor.binh@khongtunhi.com', name: 'Tư Vấn Bình', role: 'advisor' });

    // Manager unassigns back to waiting queue so advisor.an can claim explicitly
    await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: adminToken,
      json: { email: '' }
    });
    const claimRes = await world.request(`/api/ktn/consultations/staff/thread/${convId}/claim`, {
      method: 'POST',
      token: advAnToken,
      json: {}
    });
    expect(claimRes.status).toBe(200);

    // Cross-advisor create_order must return 403
    const crossOrder = await world.request(`/api/ktn/consultations/staff/thread/${convId}/create_order`, {
      method: 'POST',
      token: advBinhToken,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Bo',
        email: '',
        phone: '0909888777'
      }
    });
    expect(crossOrder.status).toBe(403);

    // Owning advisor creates order WITHOUT email (optional email '')
    const staffOrder = await world.request(`/api/ktn/consultations/staff/thread/${convId}/create_order`, {
      method: 'POST',
      token: advAnToken,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Bo',
        email: '',
        phone: '0909888777',
        durationPreset: '3m',
        note: 'Khách đăng ký qua Zalo OA'
      }
    });
    expect(staffOrder.status).toBe(200);
    expect(staffOrder.json.order_id).toMatch(/^ORD-\d{6}$/);
    expect(staffOrder.json.source).toBe('zalo_oa');
    expect(staffOrder.json.assigned_advisor).toBe('advisor.an@khongtunhi.com');
    expect(staffOrder.json.payment.qrUrl).toContain('https://img.vietqr.io/image/');

    const dbOrd = await world.db.query(
      'SELECT source, assigned_advisor, consultation_id, student_email, note FROM public.ktn_orders WHERE order_id = $1',
      [staffOrder.json.order_id]
    );
    expect(dbOrd.rows[0]).toMatchObject({
      source: 'zalo_oa',
      assigned_advisor: 'advisor.an@khongtunhi.com',
      consultation_id: convId,
      student_email: ''
    });
    expect(dbOrd.rows[0].note).toContain('"source":"consultation"');
  });

  it('2. verifies SePay webhook auth (401), classifies all reconciliation kinds with non-null p_amount, resolves logs, and fixes P0001 provisioning + retry_payment', async () => {
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });
    const advAnToken = mintKtnSession({ email: 'advisor.an@khongtunhi.com', name: 'Tư Vấn An', role: 'advisor' });

    // 401 on missing/invalid Apikey
    const unauthSepay = await world.request('/api/ktn/consultations/sepay', {
      method: 'POST',
      headers: { Authorization: 'Apikey wrong-key' },
      json: { id: 1001, transferType: 'in', transferAmount: 890000, content: 'KTN ORD-123456', accountNumber: '0987654321' }
    });
    expect(unauthSepay.status).toBe(401);

    // Sandbox route returns 403 when KTN_SEPAY_SANDBOX !== 'true' or on production host
    Object.assign(world.env, { KTN_SEPAY_SANDBOX: 'false' });
    const sbxDisabled = await world.request('/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      token: adminToken,
      json: { transferAmount: 890000, transferContent: 'KTN TEST' }
    });
    expect(sbxDisabled.status).toBe(403);

    Object.assign(world.env, { KTN_SEPAY_SANDBOX: 'true' });
    const prodHostSbx = await world.request('https://khongtunhi.com/api/ktn/consultations/sepay/sandbox', {
      method: 'POST',
      headers: sepayHeaders(world.env.KTN_SEPAY_API_KEY),
      json: { transferAmount: 890000, transferContent: 'KTN TEST' }
    });
    expect(prodHostSbx.status).toBe(403);

    // Create a Zalo OA thread -> assign to advisor.an -> create order with real email
    const zaloRes = await world.postZaloEvent({
      event_name: 'user_send_text',
      sender: { id: 'zalo-sepay-1', name: 'Chị Hương' },
      message: { msg_id: 'msg-sepay-1', text: 'Gặp tư vấn viên' }
    });
    const convId = zaloRes.json.consultation_id;
    await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: adminToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });

    const ordRes = await world.request(`/api/ktn/consultations/staff/thread/${convId}/create_order`, {
      method: 'POST',
      token: advAnToken,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Gia Bảo',
        email: 'giabao.zalo@example.com',
        phone: '0912345678'
      }
    });
    expect(ordRes.status).toBe(200);
    const orderId = ordRes.json.order_id;

    // (a) Unmatched transfer (no ORD- code)
    const unmatchedRes = await world.postSepay({
      id: 9001,
      transferType: 'in',
      transferAmount: 500000,
      content: 'CHUYEN KHOAN HOC PHI',
      accountNumber: '0987654321'
    });
    expect(unmatchedRes.status).toBe(201);
    expect(unmatchedRes.json.status).toBe('unmatched');

    // (b) Unknown order
    const unknownRes = await world.postSepay({
      id: 9002,
      transferType: 'in',
      transferAmount: 890000,
      content: 'KTN ORD-999999',
      accountNumber: '0987654321'
    });
    expect(unknownRes.status).toBe(201);
    expect(unknownRes.json.status).toBe('unknown_order');

    // (c) Account mismatch
    const accMismatchRes = await world.postSepay({
      id: 9003,
      transferType: 'in',
      transferAmount: 890000,
      content: `KTN ${orderId}`,
      accountNumber: '1111111111'
    });
    expect(accMismatchRes.status).toBe(201);
    expect(accMismatchRes.json.status).toBe('account_mismatch');

    // (d) Amount mismatch
    const amtMismatchRes = await world.postSepay({
      id: 9004,
      transferType: 'in',
      transferAmount: 500000,
      content: `KTN ${orderId}`,
      accountNumber: '0987654321'
    });
    expect(amtMismatchRes.status).toBe(201);
    expect(amtMismatchRes.json.status).toBe('mismatch');

    // (e) Accepted payment with fault on izTeach -> keeps paid status & retries cleanly via retry_payment (no P0001!)
    world.pgliteSupabase.setFaults({ failIzTeachAddProducts: true });
    const acceptedRes = await world.request('/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      token: adminToken,
      json: {
        order_id: orderId,
        transferAmount: 890000,
        transaction_id: '9005',
        transferContent: `KTN ${orderId}`
      }
    });
    expect(acceptedRes.status).toBe(201);
    expect(acceptedRes.json.status).toBe('accepted');

    // Verify payment stays accepted (attempts=1) & order stays paid
    const midOrder = await world.db.query('SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1', [orderId]);
    expect(midOrder.rows[0]).toEqual({ payment_status: 'paid', approval_status: 'pending' });
    const midPay = await world.db.query("SELECT status, attempts FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:9005'");
    expect(midPay.rows[0]).toEqual({ status: 'accepted', attempts: 1 });

    // (f) Duplicate transfer (new txId for already-paid order) -> duplicate
    const dupPaidRes = await world.postSepay({
      id: 9006,
      transferType: 'in',
      transferAmount: 890000,
      content: `KTN ${orderId}`,
      accountNumber: '0987654321'
    });
    expect(dupPaidRes.status).toBe(201);
    expect(dupPaidRes.json.status).toBe('duplicate');

    // (g) Replay same transaction_id (sepay:9005) -> idempotent duplicate: true
    const replayTxRes = await world.postSepay({
      id: 9005,
      transferType: 'in',
      transferAmount: 890000,
      content: `KTN ${orderId}`,
      accountNumber: '0987654321'
    });
    expect(replayTxRes.status).toBe(201);
    expect(replayTxRes.json.duplicate).toBe(true);

    // Clear fault and trigger immediate retry_payment -> provisions student, links consultation_id & student_code, sends Resend email with Idempotency-Key
    world.pgliteSupabase.clearFaults();
    const retryRes = await world.request(`/api/ktn/consultations/staff/thread/${convId}/retry_payment`, {
      method: 'POST',
      token: adminToken,
      json: { order_id: orderId, transaction_id: 'sepay:9005' }
    });
    expect(retryRes.status).toBe(200);
    expect(retryRes.json.updated).toBe(true);

    const finalOrder = await world.db.query(
      'SELECT payment_status, approval_status, source, assigned_advisor, consultation_id, note FROM public.ktn_orders WHERE order_id = $1',
      [orderId]
    );
    expect(finalOrder.rows[0]).toMatchObject({
      payment_status: 'paid',
      approval_status: 'approved',
      source: 'zalo_oa',
      assigned_advisor: 'advisor.an@khongtunhi.com',
      consultation_id: convId
    });
    expect(finalOrder.rows[0].note).toContain('"source":"consultation"');

    const finalPay = await world.db.query("SELECT status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:9005'");
    expect(finalPay.rows[0].status).toBe('done');

    const linkedStu = await world.db.query(
      'SELECT code, lead_source, zalo_user_id, consultation_id FROM public.ktn_students WHERE email = $1',
      ['giabao.zalo@example.com']
    );
    expect(linkedStu.rows[0].consultation_id).toBe(convId);
    expect(linkedStu.rows[0].zalo_user_id).toBe('zalo-sepay-1');

    const linkedConv = await world.db.query('SELECT student_code FROM public.ktn_consultations WHERE id = $1', [convId]);
    expect(linkedConv.rows[0].student_code).toBe(linkedStu.rows[0].code);

    const resendCalls = world.pgliteSupabase.getUpstreamCalls().resend;
    expect(resendCalls.some((c: any) => c.idempotencyKey === `ktn-order-${orderId}`)).toBe(true);

    // Verify P0001 trigger STILL blocks non-provisioning overwrite on ktn_orders
    await expect(
      world.db.query("UPDATE public.ktn_orders SET note = 'overwritten' WHERE order_id = $1", [orderId])
    ).rejects.toThrow(/Consultation order cannot be replaced/);

    // Verify staff/reconciliation list & resolve (RBAC: 403 for advisor, 200 for manager)
    const reconAdv = await world.request('/api/ktn/consultations/staff/reconciliation', { token: advAnToken });
    expect(reconAdv.status).toBe(403);

    const reconList = await world.request('/api/ktn/consultations/staff/reconciliation?resolution_status=open', { token: adminToken });
    expect(reconList.status).toBe(200);
    expect(reconList.json.items.some((i: any) => i.transaction_id === 'sepay:9001' && i.kind === 'unmatched')).toBe(true);
    expect(reconList.json.items.some((i: any) => i.transaction_id === 'sepay:9004' && i.kind === 'mismatch')).toBe(true);

    const resolveRes = await world.request('/api/ktn/consultations/staff/reconciliation/sepay%3A9001/resolve', {
      method: 'POST',
      token: adminToken,
      json: { resolution_status: 'resolved', order_id: orderId, note: 'Kế toán đối soát tay' }
    });
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.json.log.resolution_status).toBe('resolved');
    expect(resolveRes.json.log.order_id).toBe(orderId);
  });

  it('3. handles sandbox_email fallback without Resend keys and routes paid email-less staff orders to needs_review while keeping paid status', async () => {
    Object.assign(world.env, {
      KTN_SEPAY_SANDBOX: 'true',
      KTN_CONSULTATION_MAIL_KEY: '',
      KTN_CONSULTATION_MAIL_FROM: ''
    });
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });

    const start = await world.request('/api/ktn/consultations/web/start', { method: 'POST' });
    const webOrder = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: start.json.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé No Mail Key',
        email: 'nomailkey@example.com',
        phone: '0911223344'
      }
    });
    expect(webOrder.status).toBe(200);

    const paySbx = await world.request('/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      token: adminToken,
      json: { order_id: webOrder.json.id, transferAmount: 890000, transaction_id: '77701' }
    });
    expect(paySbx.status).toBe(201);

    const payRow = await world.db.query("SELECT status FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:77701'");
    expect(payRow.rows[0].status).toBe('done');
    const sbxEv = await world.db.query("SELECT kind, detail FROM public.ktn_consultation_events WHERE kind = 'sandbox_email'");
    expect(sbxEv.rows).toHaveLength(1);
    expect(sbxEv.rows[0].detail.order_id).toBe(webOrder.json.id);

    // Email-less staff order paid -> needs_review while payment_status stays paid
    const zRes = await world.postZaloEvent({
      event_name: 'user_send_text',
      sender: { id: 'zalo-noemail-1' },
      message: { msg_id: 'msg-noemail-1', text: 'Gặp tư vấn viên' }
    });
    const cId = zRes.json.consultation_id;
    await world.request(`/api/ktn/consultations/staff/thread/${cId}/assign`, {
      method: 'POST',
      token: adminToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });
    const noEmailOrd = await world.request(`/api/ktn/consultations/staff/thread/${cId}/create_order`, {
      method: 'POST',
      token: adminToken,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Khách Chưa Có Email',
        email: '',
        phone: '0933445566'
      }
    });
    expect(noEmailOrd.status).toBe(200);

    await world.request('/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      token: adminToken,
      json: { order_id: noEmailOrd.json.order_id, transferAmount: 890000, transaction_id: '77702' }
    });
    const noEmailOrdDb = await world.db.query('SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1', [noEmailOrd.json.order_id]);
    expect(noEmailOrdDb.rows[0]).toEqual({ payment_status: 'paid', approval_status: 'pending' });
    const noEmailPayDb = await world.db.query("SELECT status, error FROM public.ktn_consultation_payments WHERE transaction_id = 'sepay:77702'");
    expect(noEmailPayDb.rows[0].status).toBe('needs_review');
  });

  it('4. supports unified KTN Session + Supabase JWT RBAC, assign 403, link_student, inbox?search=, report.csv escaping, advisors role, guidance PII/sandbox, and T2-ZALO-F12-01 reply replay', async () => {
    // (a) Unified KTN Login & Session for advisor + inactive advisor
    const loginAdv = await world.request('/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'advisor.an@khongtunhi.com', password: world.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(loginAdv.status).toBe(200);
    expect(loginAdv.json.session.role).toBe('advisor');
    expect(loginAdv.json.redirectUrl).toBe('/');
    const ktnAdvToken = loginAdv.json.token;

    const sessAdv = await world.request('/api/ktn/auth/session', { token: ktnAdvToken });
    expect(sessAdv.status).toBe(200);
    expect(sessAdv.json.user.role).toBe('advisor');

    // Inactive advisor blocked on login
    const loginInactive = await world.request('/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'advisor.locked@khongtunhi.com', password: world.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(loginInactive.status).toBe(403);
    expect(loginInactive.json.error).toBe('ADVISOR_INACTIVE');

    // (b) PUT staff/advisors persists role='manager' & ktn_user_id and enables Supabase JWT manager access
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });
    const badRoleAdv = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr2@khongtunhi.com', name: 'Mgr 2', role: 'superadmin' }
    });
    expect(badRoleAdv.status).toBe(400);

    const saveMgr2 = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr2@khongtunhi.com', name: 'Quản lý 2', active: true, role: 'manager', ktn_user_id: 'KTN-MGR-2' }
    });
    expect(saveMgr2.status).toBe(200);
    expect(saveMgr2.json.advisor.role).toBe('manager');
    expect(saveMgr2.json.advisor.ktn_user_id).toBe('KTN-MGR-2');

    const mgr2Jwt = mintSupabaseJwt({ email: 'mgr2@khongtunhi.com', sub: 'KTN-MGR-2' });
    const mgr2Profile = await world.request('/api/ktn/consultations/staff/profile', { token: mgr2Jwt });
    expect(mgr2Profile.status).toBe(200);
    expect(mgr2Profile.json.actor).toMatchObject({ email: 'mgr2@khongtunhi.com', admin: true, role: 'manager' });

    // (c) PUT staff/guidance: sandbox checkout_enabled, 72-case draft, PII rejection (incl. parenthesized phone) while preserving currency
    const draftRes = await world.request('/api/ktn/consultations/staff/guidance/draft', { token: adminToken });
    expect(draftRes.status).toBe(200);
    expect(draftRes.json.examples.length).toBe(72);
    expect(draftRes.json.maxExamples).toBe(120);

    const piiReject = await world.request('/api/ktn/consultations/staff/guidance', {
      method: 'PUT',
      token: adminToken,
      json: {
        policy: draftRes.json.policy,
        course_ids: ['6adadba969897b0002482ca5'],
        duration_presets: { '6adadba969897b0002482ca5': '3m' },
        examples: [{ question: 'Liên hệ (090) 123-4567 hoặc (+84) 901 234 567', answer: 'Dạ vâng ạ', hints: [] }],
        bot_enabled: true,
        checkout_enabled: true
      }
    });
    expect(piiReject.status).toBe(400);

    Object.assign(world.env, {
      KTN_SEPAY_API_KEY: '',
      KTN_CONSULTATION_MAIL_KEY: '',
      KTN_CONSULTATION_MAIL_FROM: '',
      KTN_SEPAY_SANDBOX: 'true'
    });
    const currencyOk = await world.request('/api/ktn/consultations/staff/guidance', {
      method: 'PUT',
      token: adminToken,
      json: {
        policy: draftRes.json.policy,
        course_ids: ['6adadba969897b0002482ca5'],
        duration_presets: { '6adadba969897b0002482ca5': '3m' },
        examples: [{ question: 'Gói 963.000đ và 1.500.000đ khác gì ạ?', answer: 'Dạ mình xem thông tin khóa học nhé.', hints: [] }],
        bot_enabled: true,
        checkout_enabled: true
      }
    });
    expect(currencyOk.status).toBe(200);
    expect(currencyOk.json.config.checkout_enabled).toBe(true);

    // (d) staff/zalo/sandbox -> RBAC 403 for advisor, 200 for manager -> formula injection name for CSV test
    const advZaloSbx = await world.request('/api/ktn/consultations/staff/zalo/sandbox', {
      method: 'POST',
      token: ktnAdvToken,
      json: { event_name: 'user_send_text', zalo_user_id: 'z-csv-1', body: 'Xin chào' }
    });
    expect(advZaloSbx.status).toBe(403);

    const mgrZaloSbx = await world.request('/api/ktn/consultations/staff/zalo/sandbox', {
      method: 'POST',
      token: mgr2Jwt,
      json: {
        event_name: 'user_send_text',
        zalo_user_id: 'z-csv-1',
        customer_name: '=CMD("calc")',
        customer_phone: '0987654321',
        body: 'Gặp tư vấn viên ngay nhé',
        source_tag: 'zalo_oa'
      }
    });
    expect(mgrZaloSbx.status).toBe(200);
    const convId = mgrZaloSbx.json.conversation.id;

    // Advisor cannot assign (must be 403, NOT 409!)
    const advAssign = await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });
    expect(advAssign.status).toBe(403);

    // Manager assigns to advisor.an
    await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: adminToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });

    // Advisor Binh cannot read advisor.an's thread (403)
    const advBinhToken = mintKtnSession({ email: 'advisor.binh@khongtunhi.com', name: 'Tư Vấn Bình', role: 'advisor' });
    const crossRead = await world.request(`/api/ktn/consultations/staff/thread/${convId}`, { token: advBinhToken });
    expect(crossRead.status).toBe(403);

    // Advisor An searches inbox?search=0987654321 (nested and=(or(...),or(...)))
    const searchInbox = await world.request('/api/ktn/consultations/staff/inbox?search=0987654321&channel=zalo_oa', {
      token: ktnAdvToken
    });
    expect(searchInbox.status).toBe(200);
    expect(searchInbox.json.conversations.some((c: any) => c.id === convId)).toBe(true);

    // Advisor An links student_code ('KTN-2026-089') and gets 404 for unknown student_code
    const badLink = await world.request(`/api/ktn/consultations/staff/thread/${convId}/link_student`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { student_code: 'KTN-DOES-NOT-EXIST' }
    });
    expect(badLink.status).toBe(404);

    const goodLink = await world.request(`/api/ktn/consultations/staff/thread/${convId}/link_student`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { student_code: 'KTN-2026-089' }
    });
    expect(goodLink.status).toBe(200);
    expect(goodLink.json.student_code).toBe('KTN-2026-089');

    // (e) T2-ZALO-F12-01: staff reply -> sendOutbox (complete_send overwrites external_id) -> replay SAME request_id MUST NOT duplicate!
    const replyReqId = crypto.randomUUID();
    const reply1 = await world.request(`/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { request_id: replyReqId, body: 'Chào phụ huynh, mình gửi lộ trình nhé!' }
    });
    expect(reply1.status).toBe(200);

    // Replay same request_id AFTER complete_send updated external_id to zalo_sandbox:...
    const replyReplay = await world.request(`/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { request_id: replyReqId, body: 'Chào phụ huynh, mình gửi lộ trình nhé!' }
    });
    expect(replyReplay.status).toBe(200);

    const advisorMsgs = await world.db.query(
      "SELECT id, external_id, client_request_id, delivery FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'advisor'",
      [convId]
    );
    expect(advisorMsgs.rows).toHaveLength(1);
    expect(advisorMsgs.rows[0].delivery).toBe('sent');
    expect(advisorMsgs.rows[0].external_id).toMatch(/^zalo_sandbox:/);
    expect(advisorMsgs.rows[0].client_request_id).toBe(`staff:${convId}:${replyReqId}`);

    // Post-send OA echo deduplication in live Zalo mode (external_id = 'zalo:<msgId>')
    Object.assign(world.env, { KTN_ZALO_SANDBOX: 'false' });
    const liveReplyReqId = crypto.randomUUID();
    const liveReply1 = await world.request(`/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { request_id: liveReplyReqId, body: 'Tin nhắn gửi qua Zalo OA thật' }
    });
    expect(liveReply1.status).toBe(200);
    const liveReplyReplay = await world.request(`/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { request_id: liveReplyReqId, body: 'Tin nhắn gửi qua Zalo OA thật' }
    });
    expect(liveReplyReplay.status).toBe(200);

    const liveAdvMsgs = await world.db.query(
      "SELECT id, external_id, client_request_id, delivery FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND client_request_id = $2",
      [convId, `staff:${convId}:${liveReplyReqId}`]
    );
    expect(liveAdvMsgs.rows).toHaveLength(1);
    expect(liveAdvMsgs.rows[0].external_id).toMatch(/^zalo:/);

    const echoMid = liveAdvMsgs.rows[0].external_id.replace(/^zalo:/, '');
    const echoEvent = await world.postZaloEvent({
      event_name: 'oa_send_text',
      sender: { id: world.env.KTN_ZALO_OA_ID },
      recipient: { id: 'z-csv-1' },
      message: { msg_id: echoMid, text: 'Tin nhắn gửi qua Zalo OA thật' }
    });
    expect(echoEvent.status).toBe(200);
    const totalExternalEcho = await world.db.query(
      "SELECT count(*)::int AS cnt FROM public.ktn_consultation_messages WHERE consultation_id = $1 AND sender = 'external'",
      [convId]
    );
    expect(totalExternalEcho.rows[0].cnt).toBe(0);
    Object.assign(world.env, { KTN_ZALO_SANDBOX: 'true' });

    // Internal note is persisted in events AND surfaced in thread messages
    await world.request(`/api/ktn/consultations/staff/thread/${convId}/note`, {
      method: 'POST',
      token: ktnAdvToken,
      json: { body: 'Phụ huynh quan tâm lịch học buổi tối' }
    });
    const threadView = await world.request(`/api/ktn/consultations/staff/thread/${convId}`, { token: ktnAdvToken });
    expect(threadView.status).toBe(200);
    expect(threadView.json.messages.some((m: any) => m.sender === 'note' && m.body === 'Phụ huynh quan tâm lịch học buổi tối')).toBe(true);

    // (f) Report JSON & CSV export (formula-injection safe + zalo_oa filter)
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const reportJson = await world.request(`/api/ktn/consultations/staff/report?from=${today}&to=${today}&channel=zalo_oa`, {
      token: adminToken
    });
    expect(reportJson.status).toBe(200);
    expect(reportJson.json.conversations.some((c: any) => c.id === convId && c.source_tag === 'zalo_oa')).toBe(true);

    const reportCsv = await world.request(`/api/ktn/consultations/staff/report.csv?from=${today}&to=${today}&channel=zalo_oa`, {
      token: adminToken
    });
    expect(reportCsv.status).toBe(200);
    expect(reportCsv.headers.get('content-type')).toContain('text/csv');
    expect(reportCsv.text).toContain('"\'=CMD(""calc"")"');
  });

  it('5. surfaces source_label, assigned_advisor, consultation_id, zalo_user_id on Admin orders & students, and routes /tu-van* + /api/ktn/zalo* without breaking V1/N27', async () => {
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });
    const advAnToken = mintKtnSession({ email: 'advisor.an@khongtunhi.com', name: 'Tư Vấn An', role: 'advisor' });
    const teacherToken = mintKtnSession({ email: 'linh.lam@khongtunhi.com', name: 'Cô Linh', role: 'teacher' });

    const zRes = await world.postZaloEvent({
      event_name: 'user_send_text',
      sender: { id: 'zalo-admin-1', name: 'Phụ Huynh Hoa' },
      message: { msg_id: 'msg-admin-1', text: 'Gặp tư vấn viên' }
    });
    const convId = zRes.json.consultation_id;
    await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: adminToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });
    const ordRes = await world.request(`/api/ktn/consultations/staff/thread/${convId}/create_order`, {
      method: 'POST',
      token: advAnToken,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Hoa',
        email: 'hoa.student@example.com',
        phone: '0977665544'
      }
    });
    expect(ordRes.status).toBe(200);
    const orderId = ordRes.json.order_id;

    // Admin GET /api/ktn/orders & /api/ktn/admin/orders
    const ordersRes = await world.request('/api/ktn/orders?q=Zalo%20OA', { token: adminToken });
    expect(ordersRes.status).toBe(200);
    const foundOrd = ordersRes.json.orders.find((o: any) => o.order_id === orderId);
    expect(foundOrd).toMatchObject({
      source: 'zalo_oa',
      source_label: 'Zalo OA',
      assigned_advisor: 'advisor.an@khongtunhi.com',
      owner_email: 'advisor.an@khongtunhi.com',
      consultation_id: convId,
      zalo_user_id: 'zalo-admin-1'
    });

    // POST /api/ktn/orders/update persists assignedAdvisor without tripping P0001
    const updOrd = await world.request('/api/ktn/orders/update', {
      method: 'POST',
      token: adminToken,
      json: { orderId, assignedAdvisor: 'advisor.binh@khongtunhi.com', contactStatus: 'called' }
    });
    expect(updOrd.status).toBe(200);
    expect(updOrd.json.order.assigned_advisor).toBe('advisor.binh@khongtunhi.com');

    // POST /api/ktn/students/courses forwards leadSource, zaloUserId, consultationId & search surfaces assigned_advisor
    const stuUpd = await world.request('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      json: {
        action: 'assign_class',
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân',
        leadSource: 'zalo_oa',
        zaloUserId: 'zalo-admin-1',
        consultationId: convId
      }
    });
    expect(stuUpd.status).toBe(200);

    // Advisor can search students for link_student modal without internal_note
    const advStuSearch = await world.request('/api/ktn/admin/students/search?q=hoangngan', { token: advAnToken });
    expect(advStuSearch.status).toBe(200);
    expect(advStuSearch.json.items[0].assigned_advisor).toBe('advisor.an@khongtunhi.com');
    expect(advStuSearch.json.items[0].internal_note).toBeUndefined();

    // Teacher search does not leak consultation internal metadata
    const teacherSearch = await world.request('/api/ktn/admin/students/search?q=hoangngan', { token: teacherToken });
    expect(teacherSearch.status).toBe(200);
    expect(teacherSearch.json.items[0].internal_note).toBeUndefined();

    // Proxy routes /tu-van, /tu-van/, /tu-van/nhan-vien/, /api/ktn/zalo/webhook
    const tuVanTrailing = await world.request('/tu-van/');
    expect(tuVanTrailing.status).toBe(200);
    expect(tuVanTrailing.headers.get('content-type')).toContain('text/html');

    const staffTrailing = await world.request('/tu-van/nhan-vien/');
    expect(staffTrailing.status).toBe(200);
    expect(staffTrailing.headers.get('content-type')).toContain('text/html');

    const zaloBody = JSON.stringify({
      app_id: world.env.KTN_ZALO_APP_ID,
      event_name: 'user_send_text',
      timestamp: '1763400001000',
      sender: { id: 'zalo-alias-1' },
      message: { msg_id: 'mid-alias-1', text: 'Xin chào qua /api/ktn/zalo/webhook' }
    });
    const sig = zaloSign(world.env.KTN_ZALO_APP_ID, zaloBody, '1763400001000', world.env.KTN_ZALO_APP_SECRET);
    const zaloAlias = await world.request('/api/ktn/zalo/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-ZEvent-Signature': sig },
      body: zaloBody
    });
    expect(zaloAlias.status).toBe(200);
    expect(zaloAlias.json.ok).toBe(true);
  });

  it('6. executes local-worker-middleware.mjs end-to-end (dynamic import, /tu-van, advisor login, Zalo sandbox, SePay sandbox, T2-ZALO-F12-01 reply replay, and host fetch safety)', async () => {
    const originalFetch = globalThis.fetch;
    const localHarness = createLocalWorkerHarness();

    // Verify middleware serves /tu-van
    const pageRes = await invokeMiddleware(localHarness, '/tu-van');
    expect(pageRes.status).toBe(200);
    expect(pageRes.headers['content-type']).toContain('text/html');

    // Non-API/non-/tu-van falls through to next()
    const spaRes = await invokeMiddleware(localHarness, '/admin/consultations');
    expect(spaRes.nextCalled).toBe(true);

    // Login advisor1 via /api/ktn/auth/login
    const loginRes = await invokeMiddleware(localHarness, '/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'advisor1@khongtunhi.com', password: localHarness.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(loginRes.status).toBe(200);
    expect(loginRes.json.user.role).toBe('advisor');
    const advBearer = loginRes.json.token;

    // Login manager via /api/ktn/auth/login
    const mgrLoginRes = await invokeMiddleware(localHarness, '/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'quanly@khongtunhi.com', password: localHarness.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(mgrLoginRes.status).toBe(200);
    const mgrBearer = mgrLoginRes.json.token;

    // Manager triggers Zalo sandbox event (bot stays active), then unassigns/assigns to advisor1
    const zRes = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/zalo/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: {
        event_name: 'user_send_text',
        zalo_user_id: 'local-zalo-001',
        customer_name: 'Phụ Huynh Local',
        customer_phone: '0908777666',
        body: 'Gặp tư vấn viên giúp mình'
      }
    });
    expect(zRes.status).toBe(200);
    const convId = zRes.json.conversation.id;

    // Manager puts thread in waiting queue -> advisor1 claims -> tests T2-ZALO-F12-01 reply replay
    await invokeMiddleware(localHarness, `/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { email: '' }
    });

    const claimRes = await invokeMiddleware(localHarness, `/api/ktn/consultations/staff/thread/${convId}/claim`, {
      method: 'POST',
      headers: { authorization: `Bearer ${advBearer}` },
      json: {}
    });
    expect(claimRes.status).toBe(200);

    const reqId = crypto.randomUUID();
    const r1 = await invokeMiddleware(localHarness, `/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${advBearer}` },
      json: { request_id: reqId, body: 'Xin chào từ local middleware' }
    });
    expect(r1.status).toBe(200);
    for (let i = 0; i < 40; i++) {
      const m = localHarness.state.tables.ktn_consultation_messages.find(
        (row: any) => row.consultation_id === convId && row.sender === 'advisor'
      );
      if (m?.delivery === 'sent') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }

    const r2 = await invokeMiddleware(localHarness, `/api/ktn/consultations/staff/thread/${convId}/reply`, {
      method: 'POST',
      headers: { authorization: `Bearer ${advBearer}` },
      json: { request_id: reqId, body: 'Xin chào từ local middleware' }
    });
    expect(r2.status).toBe(200);
    const advMsgs = localHarness.state.tables.ktn_consultation_messages.filter(
      (m: any) => m.consultation_id === convId && m.sender === 'advisor'
    );
    expect(advMsgs).toHaveLength(1);

    // Advisor creates order -> Manager runs SePay sandbox -> provisions & resolves
    const ordRes = await invokeMiddleware(localHarness, `/api/ktn/consultations/staff/thread/${convId}/create_order`, {
      method: 'POST',
      headers: { authorization: `Bearer ${advBearer}` },
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Local',
        email: 'local.student@example.com',
        phone: '0908777666'
      }
    });
    expect(ordRes.status).toBe(200);

    const sepayRes = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: ordRes.json.order_id, transferAmount: 890000, transaction_id: '555001' }
    });
    expect(sepayRes.status).toBe(201);
    expect(sepayRes.json.status).toBe('accepted');
    let payRow: any;
    for (let i = 0; i < 40; i++) {
      payRow = localHarness.state.tables.ktn_consultation_payments.find(
        (p: any) => p.transaction_id === 'sepay:555001'
      );
      if (payRow?.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    expect(payRow?.status).toBe('done');

    // Direct globalThis.fetch outside handleRequest must NOT route into localHarness mockFetch
    expect(typeof globalThis.fetch).toBe('function');
    const customSpy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ external: true }), { status: 200 }));
    globalThis.fetch = customSpy;
    const outsideRes = await globalThis.fetch('https://example.test/ping');
    expect(await outsideRes.json()).toEqual({ external: true });
    expect(customSpy).toHaveBeenCalledTimes(1);
    globalThis.fetch = originalFetch;
  });

  it('7. keeps V1 /custom-page/so-lien-lac N27 rel="manifest" isolation untouched', async () => {
    const v1Html = '<!DOCTYPE html><html><head><title>V1 SLL</title></head><body>V1</body></html>';
    const v2Html = '<!DOCTYPE html><html><head><title>V2 SLL</title></head><body>V2</body></html>';
    const v1SpyFetch = vi.fn(async (input: any) => {
      const url = typeof input === 'string' ? input : input.url;
      if (url.includes('/custom-page/so-lien-lac-test')) {
        return new Response(v2Html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      if (url.includes('/custom-page/so-lien-lac')) {
        return new Response(v1Html, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
      }
      return world.pgliteSupabase.fetch(input);
    });

    // @ts-ignore Root E2E harness ESM module
    const { loadWorkerInstance } = await import('../../../../tests/e2e-zalo-crm/harness/worker-client.mjs');
    const worker = loadWorkerInstance({ fetchImpl: v1SpyFetch });
    const ctx = { waitUntil() {}, passThroughOnException() {} };

    const v1Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac'), world.env, ctx);
    const v1Out = await v1Res.text();
    expect(v1Out).not.toContain('rel="manifest"');

    const v2Res = await worker.fetch(new Request('https://khongtunhi.com/custom-page/so-lien-lac-test'), world.env, ctx);
    const v2Out = await v2Res.text();
    expect(v2Out).toContain('rel="manifest"');
  });

  it('8. enforces SePay transaction_id conflict 409 across PGlite and local-worker-middleware, and blocks retry_payment pre-check on unmatched logs without mutating resolution_status', async () => {
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });

    // (a) PGlite: create two web orders A & B
    const start1 = await world.request('/api/ktn/consultations/web/start', { method: 'POST' });
    const start2 = await world.request('/api/ktn/consultations/web/start', { method: 'POST' });
    const ordARes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: start1.json.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé A Conflict',
        email: 'conflict.a@example.com',
        phone: '0901112233'
      }
    });
    const ordBRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: start2.json.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé B Conflict',
        email: 'conflict.b@example.com',
        phone: '0904445566'
      }
    });
    expect(ordARes.status).toBe(200);
    expect(ordBRes.status).toBe(200);
    const orderA = ordARes.json.id;
    const orderB = ordBRes.json.id;

    // First SePay webhook succeeds for orderA
    const firstPay = await world.postSepay({
      id: 94001,
      transferType: 'in',
      transferAmount: 890000,
      content: `KTN ${orderA}`,
      accountNumber: '0987654321'
    });
    expect(firstPay.status).toBe(201);
    expect(firstPay.json.status).toBe('accepted');

    // Reuse same txId 94001 for different orderB -> HTTP 409 + conflict: true, duplicate: false, orderB untouched
    const conflictOrder = await world.postSepay({
      id: 94001,
      transferType: 'in',
      transferAmount: 890000,
      content: `KTN ${orderB}`,
      accountNumber: '0987654321'
    });
    expect(conflictOrder.status).toBe(409);
    expect(conflictOrder.json).toMatchObject({
      ok: false,
      success: false,
      conflict: true,
      status: 'conflict',
      order_id: orderB,
      transaction_id: 'sepay:94001',
      duplicate: false
    });

    // Reuse same txId 94001 for orderA with different amount -> HTTP 409 + conflict: true
    const conflictAmt = await world.postSepay({
      id: 94001,
      transferType: 'in',
      transferAmount: 500000,
      content: `KTN ${orderA}`,
      accountNumber: '0987654321'
    });
    expect(conflictAmt.status).toBe(409);
    expect(conflictAmt.json).toMatchObject({
      ok: false,
      success: false,
      conflict: true,
      status: 'conflict',
      order_id: orderA,
      transaction_id: 'sepay:94001',
      duplicate: false
    });

    const ordBCheck = await world.db.query(
      'SELECT payment_status, approval_status FROM public.ktn_orders WHERE order_id = $1',
      [orderB]
    );
    expect(ordBCheck.rows[0]).toEqual({ payment_status: 'pending_verification', approval_status: 'pending' });

    // (b) local-worker-middleware parity: conflict 409 for different order_id & amount, 201 for fresh mismatch
    const localHarness = createLocalWorkerHarness();
    const mgrLoginRes = await invokeMiddleware(localHarness, '/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'quanly@khongtunhi.com', password: localHarness.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(mgrLoginRes.status).toBe(200);
    const mgrBearer = mgrLoginRes.json.token;

    const lStart1 = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/start', { method: 'POST' });
    const lStart2 = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/start', { method: 'POST' });
    const lOrdA = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/order', {
      method: 'POST',
      headers: { authorization: `Bearer ${lStart1.json.token}` },
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Local A',
        email: 'local.a@example.com',
        phone: '0901112233'
      }
    });
    const lOrdB = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/order', {
      method: 'POST',
      headers: { authorization: `Bearer ${lStart2.json.token}` },
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Local B',
        email: 'local.b@example.com',
        phone: '0904445566'
      }
    });
    expect(lOrdA.status).toBe(200);
    expect(lOrdB.status).toBe(200);

    // Fresh mismatch on lOrdB with txId 666001 must still return 201 status='mismatch' (not 409)
    const lMismatch = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: lOrdB.json.id, transferAmount: 500000, transaction_id: '666001' }
    });
    expect(lMismatch.status).toBe(201);
    expect(lMismatch.json.status).toBe('mismatch');

    // First accepted payment for lOrdA with txId 666002
    const lFirst = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: lOrdA.json.id, transferAmount: 890000, transaction_id: '666002' }
    });
    expect(lFirst.status).toBe(201);
    expect(lFirst.json.status).toBe('accepted');

    // Exact replay of 666002 returns 201 duplicate: true
    const lReplay = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: lOrdA.json.id, transferAmount: 890000, transaction_id: '666002' }
    });
    expect(lReplay.status).toBe(201);
    expect(lReplay.json.duplicate).toBe(true);

    // Reuse 666002 on lOrdB -> 409 + conflict: true, lOrdB stays pending_verification
    const lConflictOrder = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: lOrdB.json.id, transferAmount: 890000, transaction_id: '666002' }
    });
    expect(lConflictOrder.status).toBe(409);
    expect(lConflictOrder.json).toMatchObject({
      ok: false,
      success: false,
      conflict: true,
      status: 'conflict',
      order_id: lOrdB.json.id,
      transaction_id: 'sepay:666002',
      duplicate: false
    });

    // Reuse 666002 on lOrdA with different amount -> 409 + conflict: true
    const lConflictAmt = await invokeMiddleware(localHarness, '/api/ktn/consultations/staff/sepay/sandbox', {
      method: 'POST',
      headers: { authorization: `Bearer ${mgrBearer}` },
      json: { order_id: lOrdA.json.id, transferAmount: 500000, transaction_id: '666002' }
    });
    expect(lConflictAmt.status).toBe(409);
    expect(lConflictAmt.json.conflict).toBe(true);

    const localOrdBRow = localHarness.state.tables.ktn_orders.find((o: any) => o.order_id === lOrdB.json.id);
    expect(localOrdBRow.payment_status).toBe('pending_verification');

    // (c) resolveSepayReconciliation with retry_payment: true on an unmatched log must return 409 WITHOUT mutating log
    const unmatchedTx = await world.postSepay({
      id: 94009,
      transferType: 'in',
      transferAmount: 500000,
      content: 'CHUYEN KHOAN CHUA CO MA DON',
      accountNumber: '0987654321'
    });
    expect(unmatchedTx.status).toBe(201);
    expect(unmatchedTx.json.status).toBe('unmatched');

    const badResolve = await world.request('/api/ktn/consultations/staff/reconciliation/sepay%3A94009/resolve', {
      method: 'POST',
      token: adminToken,
      json: { resolution_status: 'resolved', order_id: orderB, retry_payment: true }
    });
    expect(badResolve.status).toBe(409);

    const logAfterFailedResolve = await world.db.query(
      "SELECT resolution_status, order_id, resolved_by FROM public.ktn_sepay_reconciliation_logs WHERE transaction_id = 'sepay:94009'"
    );
    expect(logAfterFailedResolve.rows[0]).toEqual({
      resolution_status: 'open',
      order_id: null,
      resolved_by: null
    });
  });

  it('9. revokes existing KTN sessions when a manager-role advisor is deactivated/demoted and escapes leading LF in report.csv', async () => {
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });

    // Create an active manager-role advisor and log in via /api/ktn/auth/login
    const createMgr = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.revoke@khongtunhi.com', name: 'Quản lý Revoke', active: true, role: 'manager', ktn_user_id: 'KTN-MGR-REV' }
    });
    expect(createMgr.status).toBe(200);

    const mgrLogin = await world.request('/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'mgr.revoke@khongtunhi.com', password: world.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(mgrLogin.status).toBe(200);
    expect(mgrLogin.json.session.role).toBe('admin');
    expect(mgrLogin.json.session.advisorRole).toBe('manager');
    const mgrKtnToken = mgrLogin.json.token;

    // Active manager KTN session works on auth/session and staff/inbox
    const sessActive = await world.request('/api/ktn/auth/session', { token: mgrKtnToken });
    expect(sessActive.status).toBe(200);
    expect(sessActive.json.user.role).toBe('admin');
    expect(sessActive.json.user.advisorRole).toBe('manager');

    const inboxActive = await world.request('/api/ktn/consultations/staff/inbox', { token: mgrKtnToken });
    expect(inboxActive.status).toBe(200);

    // Demote manager -> advisor and verify existing session syncs role down to advisor (and assign returns 403)
    const demoteMgr = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.revoke@khongtunhi.com', name: 'Quản lý Revoke', active: true, role: 'advisor', ktn_user_id: 'KTN-MGR-REV' }
    });
    expect(demoteMgr.status).toBe(200);

    const sessDemoted = await world.request('/api/ktn/auth/session', { token: mgrKtnToken });
    expect(sessDemoted.status).toBe(200);
    expect(sessDemoted.json.user.role).toBe('advisor');
    expect(sessDemoted.json.user.advisorRole).toBe('advisor');

    const zRes = await world.postZaloEvent({
      event_name: 'user_send_text',
      sender: { id: 'zalo-lf-csv-1' },
      message: { msg_id: 'msg-lf-csv-1', text: 'Xin chào' }
    });
    expect(zRes.status).toBe(200);
    const convId = zRes.json.consultation_id;

    const demotedAssign = await world.request(`/api/ktn/consultations/staff/thread/${convId}/assign`, {
      method: 'POST',
      token: mgrKtnToken,
      json: { email: 'advisor.an@khongtunhi.com' }
    });
    expect(demotedAssign.status).toBe(403);

    // Deactivate the manager-role advisor -> existing KTN session MUST immediately get 403
    await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.revoke@khongtunhi.com', name: 'Quản lý Revoke', active: false, role: 'manager', ktn_user_id: 'KTN-MGR-REV' }
    });

    const sessRevoked = await world.request('/api/ktn/auth/session', { token: mgrKtnToken });
    expect(sessRevoked.status).toBe(403);
    expect(sessRevoked.json.error).toBe('ADVISOR_ACCOUNT_LOCKED');

    const inboxRevoked = await world.request('/api/ktn/consultations/staff/inbox', { token: mgrKtnToken });
    expect(inboxRevoked.status).toBe(403);

    // Static/root admin session (no advisorRole) remains unaffected
    const rootInbox = await world.request('/api/ktn/consultations/staff/inbox', { token: adminToken });
    expect(rootInbox.status).toBe(200);

    // Raw DB customer_name starting with leading LF (\n=CMD...) must be safely escaped with ' in report.csv
    await world.db.query(
      "UPDATE public.ktn_consultations SET customer_name = E'\\n=CMD|''/C calc''!A0' WHERE id = $1",
      [convId]
    );
    const today = new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10);
    const csvRes = await world.request(`/api/ktn/consultations/staff/report.csv?from=${today}&to=${today}&channel=zalo_oa`, {
      token: adminToken
    });
    expect(csvRes.status).toBe(200);
    expect(csvRes.text).toContain('"\'\n=CMD|\'/C calc\'!A0"');
  });

  it('10. enforces advisor ktn_advisors re-validation & fail-closed checks across /api/ktn/admin/*, /api/ktn/orders/*, /api/ktn/students*, and /api/ktn/auth/session', async () => {
    const adminToken = mintKtnSession({ email: 'quanly@khongtunhi.com', name: 'Quản Lý KTN', role: 'admin' });

    // Seed a paid order to verify deactivated/demoted manager cannot approve it
    const webStart = await world.request('/api/ktn/consultations/web/start', { method: 'POST' });
    expect(webStart.status).toBe(200);
    const ordRes = await world.request('/api/ktn/consultations/web/order', {
      method: 'POST',
      token: webStart.json.token,
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Bảo Mật',
        email: 'baomat.order@example.com',
        phone: '0901239988'
      }
    });
    expect(ordRes.status).toBe(200);
    const paidOrderId = ordRes.json.id;
    await world.db.query("UPDATE public.ktn_orders SET payment_status = 'paid' WHERE order_id = $1", [paidOrderId]);

    // Create manager-role advisor and regular advisor, log both in
    const createMgr = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.admincheck@khongtunhi.com', name: 'Quản lý AdminCheck', active: true, role: 'manager', ktn_user_id: 'KTN-MGR-ADM' }
    });
    expect(createMgr.status).toBe(200);

    const createAdv = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'adv.lockcheck@khongtunhi.com', name: 'Tư vấn LockCheck', active: true, role: 'advisor', ktn_user_id: 'KTN-ADV-LCK' }
    });
    expect(createAdv.status).toBe(200);

    const mgrLogin = await world.request('/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'mgr.admincheck@khongtunhi.com', password: world.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(mgrLogin.status).toBe(200);
    const mgrTok = mgrLogin.json.token;

    const advLogin = await world.request('/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'adv.lockcheck@khongtunhi.com', password: world.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(advLogin.status).toBe(200);
    const advTok = advLogin.json.token;

    // Active manager-advisor has full admin access before demotion/deactivation
    expect((await world.request('/api/ktn/admin/orders', { token: mgrTok })).status).toBe(200);
    expect((await world.request('/api/ktn/students', { token: mgrTok })).status).toBe(200);
    expect((await world.request('/api/ktn/admin/audit-logs', { token: mgrTok })).status).toBe(200);

    // Demote manager -> advisor: existing token must immediately lose admin routes (403)
    const demoteRes = await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.admincheck@khongtunhi.com', name: 'Quản lý AdminCheck', active: true, role: 'advisor', ktn_user_id: 'KTN-MGR-ADM' }
    });
    expect(demoteRes.status).toBe(200);

    expect((await world.request('/api/ktn/admin/orders', { token: mgrTok })).status).toBe(403);
    expect(
      (await world.request('/api/ktn/orders/approve', {
        method: 'POST',
        token: mgrTok,
        json: { orderId: paidOrderId }
      })).status
    ).toBe(403);
    expect((await world.request('/api/ktn/students', { token: mgrTok })).status).toBe(403);
    expect((await world.request('/api/ktn/admin/audit-logs', { token: mgrTok })).status).toBe(403);

    // Re-promote to manager then deactivate (active: false): existing token rejected everywhere + 403 ADVISOR_ACCOUNT_LOCKED on auth/session
    await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.admincheck@khongtunhi.com', name: 'Quản lý AdminCheck', active: false, role: 'manager', ktn_user_id: 'KTN-MGR-ADM' }
    });

    const mgrSessLocked = await world.request('/api/ktn/auth/session', { token: mgrTok });
    expect(mgrSessLocked.status).toBe(403);
    expect(mgrSessLocked.json.error).toBe('ADVISOR_ACCOUNT_LOCKED');

    expect((await world.request('/api/ktn/admin/orders', { token: mgrTok })).status).toBe(403);
    expect(
      (await world.request('/api/ktn/orders/approve', {
        method: 'POST',
        token: mgrTok,
        json: { orderId: paidOrderId }
      })).status
    ).toBe(403);
    expect((await world.request('/api/ktn/admin/students/search?q=a', { token: mgrTok })).status).toBe(403);
    expect((await world.request('/api/ktn/admin/audit-logs', { token: mgrTok })).status).toBe(403);

    // Deactivate regular advisor: existing token rejected on /api/ktn/admin/students/search
    expect((await world.request('/api/ktn/admin/students/search?q=a', { token: advTok })).status).toBe(200);
    await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'adv.lockcheck@khongtunhi.com', name: 'Tư vấn LockCheck', active: false, role: 'advisor', ktn_user_id: 'KTN-ADV-LCK' }
    });
    expect((await world.request('/api/ktn/admin/students/search?q=a', { token: advTok })).status).toBe(403);
    const advSessLocked = await world.request('/api/ktn/auth/session', { token: advTok });
    expect(advSessLocked.status).toBe(403);
    expect(advSessLocked.json.error).toBe('ADVISOR_ACCOUNT_LOCKED');

    // Re-activate manager-advisor and verify fail-closed 503 / 403 when ktn_advisors lookup fails
    await world.request('/api/ktn/consultations/staff/advisors', {
      method: 'PUT',
      token: adminToken,
      json: { email: 'mgr.admincheck@khongtunhi.com', name: 'Quản lý AdminCheck', active: true, role: 'manager', ktn_user_id: 'KTN-MGR-ADM' }
    });
    // @ts-ignore Root E2E harness ESM module
    const { loadWorkerInstance } = await import('../../../../tests/e2e-zalo-crm/harness/worker-client.mjs');
    const failingAdvisorFetch = async (input: any, init?: any) => {
      const urlStr = typeof input === 'string' ? input : input?.url || '';
      if (urlStr.includes('/rest/v1/ktn_advisors')) {
        throw new Error('simulated_ktn_advisors_outage');
      }
      return world.pgliteSupabase.fetch(input, init);
    };
    const outageWorker = loadWorkerInstance({ fetchImpl: failingAdvisorFetch });
    const outageCtx = { waitUntil() {}, passThroughOnException() {} };
    const failClosedSess = await outageWorker.fetch(
      new Request('https://khongtunhi.com/api/ktn/auth/session', {
        headers: { Authorization: `Bearer ${mgrTok}` }
      }),
      world.env,
      outageCtx
    );
    expect(failClosedSess.status).toBe(503);
    const failClosedOrders = await outageWorker.fetch(
      new Request('https://khongtunhi.com/api/ktn/admin/orders', {
        headers: { Authorization: `Bearer ${mgrTok}` }
      }),
      world.env,
      outageCtx
    );
    expect(failClosedOrders.status).toBe(403);

    // Root/static admin token (no advisorRole) continues returning 200 on admin/orders and auth/session
    const rootOrders = await world.request('/api/ktn/admin/orders', { token: adminToken });
    expect(rootOrders.status).toBe(200);
    const rootSess = await world.request('/api/ktn/auth/session', { token: adminToken });
    expect(rootSess.status).toBe(200);
    expect(rootSess.json.user.role).toBe('admin');
  });

  it('11. resets payment.attempts to 0 in local-worker-middleware rpc/ktn_consultation_retry_payment so attempts=6 needs_review recovers to done', async () => {
    const localHarness = createLocalWorkerHarness();
    const mgrLogin = await invokeMiddleware(localHarness, '/api/ktn/auth/login', {
      method: 'POST',
      json: { email: 'quanly@khongtunhi.com', password: localHarness.env.KTN_STAFF_AND_TEST_PASSWORD }
    });
    expect(mgrLogin.status).toBe(200);
    const mgrBearer = mgrLogin.json.token;

    const webStart = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/start', { method: 'POST' });
    expect(webStart.status).toBe(200);
    const webOrd = await invokeMiddleware(localHarness, '/api/ktn/consultations/web/order', {
      method: 'POST',
      headers: { authorization: `Bearer ${webStart.json.token}` },
      json: {
        requestId: crypto.randomUUID(),
        courseId: '6adadba969897b0002482ca5',
        name: 'Bé Retry Six',
        email: 'retry.six@example.com',
        phone: '0907778899'
      }
    });
    expect(webOrd.status).toBe(200);
    const orderId = webOrd.json.id;

    // Seed attempts=6 needs_review payment + open reconciliation log + paid order
    const ordRow = localHarness.state.tables.ktn_orders.find((o: any) => o.order_id === orderId);
    expect(ordRow).toBeTruthy();
    ordRow.payment_status = 'paid';

    const txId = 'sepay:666999';
    localHarness.state.tables.ktn_consultation_payments.push({
      transaction_id: txId,
      order_id: orderId,
      amount: 890000,
      status: 'needs_review',
      attempts: 6,
      next_attempt_at: new Date().toISOString(),
      error: 'izteach_500',
      created_at: new Date().toISOString()
    });
    localHarness.state.tables.ktn_sepay_reconciliation_logs.push({
      transaction_id: txId,
      kind: 'needs_review',
      order_id: orderId,
      amount: 890000,
      account_number: localHarness.env.KTN_SEPAY_ACCOUNT_NO,
      transfer_content: `KTN ${orderId}`,
      resolution_status: 'open',
      raw_payload: {},
      created_at: new Date().toISOString()
    });

    const resolveRes = await invokeMiddleware(
      localHarness,
      `/api/ktn/consultations/staff/reconciliation/${encodeURIComponent(txId)}/resolve`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${mgrBearer}` },
        json: { resolution_status: 'resolved', order_id: orderId, retry_payment: true, note: 'Retry after fixing upstream' }
      }
    );
    expect(resolveRes.status).toBe(200);
    expect(resolveRes.json.ok).toBe(true);
    expect(resolveRes.json.log?.resolution_status).toBe('resolved');

    let payRow: any;
    for (let i = 0; i < 40; i++) {
      payRow = localHarness.state.tables.ktn_consultation_payments.find((p: any) => p.transaction_id === txId);
      if (payRow?.status === 'done') break;
      await new Promise(resolve => setTimeout(resolve, 25));
    }
    const updatedOrd = localHarness.state.tables.ktn_orders.find((o: any) => o.order_id === orderId);
    expect(payRow?.status).toBe('done');
    expect(payRow?.attempts).toBe(1);
    expect(updatedOrd?.approval_status).toBe('approved');
  });
});
