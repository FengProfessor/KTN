/**
 * KTN Master Refactor — Automated Acceptance Suite N01–N20 + PWA Routes
 *
 * Tests Class Membership Transfer, Teacher Unassignment, Unassigned Support Center Routing
 * ("Học vụ Khổng Tử Nhí"), Delayed Push Eligibility Guards, Homework Draft Isolation & Optimistic Lock,
 * Multi-Account Push Unbind/Rebind, and Desktop Installable PWA Routes against cloudflare-worker-sw-proxy.js.
 *
 * Usage: node tests/ktn_lifecycle_n01_n20_acceptance.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

async function createWorkerHarness() {
  const code = fs.readFileSync(path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js'), 'utf8');
  const transformed = code.replace(/export\s+default\s+\{/, 'module.exports = {');

  const state = {
    tables: {
      ktn_students: [
        {
          code: 'HS-N-01',
          name: 'Học Viên H',
          email: 'student.h@khongtunhi.com',
          phone: '0901000001',
          class_code: 'CLS-A',
          cognito_user_id: 'aaaa1111-2222-3333-4444-000000000001',
          izteach_student_id: '660000000000000000000101',
          online_courses: [{ id: '6adadba969897b0002482ca5', title: 'HSK1 3.0' }],
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          code: 'HS-N-02',
          name: 'Học Viên NoClass',
          email: 'student.noclass@khongtunhi.com',
          phone: '0901000002',
          class_code: '',
          cognito_user_id: 'aaaa1111-2222-3333-4444-000000000002',
          izteach_student_id: '660000000000000000000102',
          online_courses: [],
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          code: 'HS-N-03',
          name: 'Học Viên B',
          email: 'student.b@khongtunhi.com',
          phone: '0901000003',
          class_code: 'CLS-B',
          cognito_user_id: 'aaaa1111-2222-3333-4444-000000000003',
          izteach_student_id: '660000000000000000000103',
          online_courses: [],
          updated_at: '2026-11-10T08:00:00.000Z'
        }
      ],
      ktn_teachers: [
        {
          code: 'GV-X',
          name: 'Cô X',
          email: 'teacher.x@khongtunhi.com',
          assigned_classes: ['CLS-A'],
          aliases: ['__class:CLS-A'],
          assigned_courses: [],
          active: true,
          status: 'active',
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          code: 'GV-Y',
          name: 'Cô Y',
          email: 'teacher.y@khongtunhi.com',
          assigned_classes: ['CLS-B'],
          aliases: ['__class:CLS-B'],
          assigned_courses: [],
          active: true,
          status: 'active',
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          code: 'GV-RAND',
          name: 'Cô Ngẫu Nhiên',
          email: 'teacher.random@khongtunhi.com',
          assigned_classes: ['CLS-OTHER'],
          aliases: ['__class:CLS-OTHER'],
          assigned_courses: [],
          active: true,
          status: 'active',
          updated_at: '2026-11-10T08:00:00.000Z'
        }
      ],
      ktn_classes: [
        {
          id: 'CLS-A',
          class_code: 'CLS-A',
          name: 'Lớp A',
          teacher_email: 'teacher.x@khongtunhi.com',
          teacher_code: 'GV-X',
          active: true,
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          id: 'CLS-B',
          class_code: 'CLS-B',
          name: 'Lớp B',
          teacher_email: 'teacher.y@khongtunhi.com',
          teacher_code: 'GV-Y',
          active: true,
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          id: 'CLS-DEL',
          class_code: 'CLS-DEL',
          name: 'Lớp Đã Xóa',
          teacher_email: 'teacher.random@khongtunhi.com',
          teacher_code: 'GV-RAND',
          active: false,
          updated_at: '2026-11-10T08:00:00.000Z'
        }
      ],
      ktn_class_sessions: [
        {
          id: 'CLS-A::1',
          class_code: 'CLS-A',
          session_num: 1,
          title: 'Buổi 1 Lớp A',
          exercises: [
            { id: 'EX-A-PUB', num: 1, title: 'Bài công khai Lớp A', prompt: 'Đọc bài 1', status: 'published' },
            { id: 'EX-A-DRAFT', num: 2, title: 'Bài nháp ẩn', prompt: 'Draft', status: 'draft' }
          ],
          updated_at: '2026-11-10T08:00:00.000Z'
        },
        {
          id: 'CLS-B::1',
          class_code: 'CLS-B',
          session_num: 1,
          title: 'Buổi 1 Lớp B',
          exercises: [
            { id: 'EX-B-PUB', num: 1, title: 'Bài công khai Lớp B', prompt: 'Đọc bài B', status: 'published' }
          ],
          updated_at: '2026-11-10T08:00:00.000Z'
        }
      ],
      ktn_homeworks: [
        {
          id: 'HW-HIST-A',
          student_email: 'student.h@khongtunhi.com',
          student_code: 'HS-N-01',
          student_name: 'Học Viên H',
          class_code: 'CLS-A',
          course_id: 'CLASS_CLS-A',
          lesson_num: 101,
          lesson_title: 'Bài 1 Lớp A',
          status: 'graded',
          score: 9.0,
          teacher_feedback: 'Điểm cũ lớp A',
          submitted_at: '2026-11-05T08:00:00.000Z',
          graded_at: '2026-11-05T09:00:00.000Z',
          updated_at: '2026-11-05T09:00:00.000Z'
        },
        {
          id: 'HW-COURSE-H',
          student_email: 'student.h@khongtunhi.com',
          student_code: 'HS-N-01',
          student_name: 'Học Viên H',
          class_code: '',
          course_id: '6adadba969897b0002482ca5',
          lesson_num: 1,
          lesson_title: 'HSK1 Bài 1',
          status: 'graded',
          score: 10,
          teacher_feedback: 'Giỏi lắm',
          submitted_at: '2026-11-06T08:00:00.000Z',
          graded_at: '2026-11-06T09:00:00.000Z',
          updated_at: '2026-11-06T09:00:00.000Z'
        },
        {
          id: 'HW-REV-B',
          student_email: 'student.b@khongtunhi.com',
          student_code: 'HS-N-03',
          student_name: 'Học Viên B',
          class_code: 'CLS-B',
          course_id: 'CLASS_CLS-B',
          lesson_num: 101,
          lesson_title: 'Bài 1 Lớp B',
          status: 'pending',
          score: null,
          submitted_at: '2026-11-07T08:00:00.000Z',
          updated_at: '2026-11-07T08:00:00.000Z'
        }
      ],
      ktn_messages: [
        {
          id: 'MSG-CLS-A-1',
          room_id: 'class:CLS-A',
          class_code: 'CLS-A',
          sender_email: 'teacher.x@khongtunhi.com',
          sender_name: 'Cô X',
          sender_role: 'teacher',
          content: 'Tin nhắn lịch sử Lớp A',
          created_at: '2026-11-05T08:00:00.000Z'
        },
        {
          id: 'MSG-HIST-STU-H',
          room_id: 'student:student.h@khongtunhi.com',
          class_code: null,
          sender_email: 'teacher.x@khongtunhi.com',
          sender_name: 'Cô X (Lịch sử)',
          sender_role: 'teacher',
          content: 'Nhận xét lịch sử từ Cô X',
          created_at: '2026-11-04T08:00:00.000Z'
        }
      ],
      ktn_dlp_alerts: [
        {
          id: 'EVT-CLS-A-OLD',
          room_id: 'NOTIF_CLASS_EVENTS',
          class_code: 'CLS-A',
          sender_email: 'teacher.x@khongtunhi.com',
          blocked_content: JSON.stringify({
            id: 'EVT-CLS-A-OLD',
            type: 'class_reminder',
            classCode: 'CLS-A',
            title: 'Nhắc lịch Lớp A cũ',
            body: 'Lịch cũ lớp A',
            createdAt: '2026-11-05T08:00:00.000Z'
          }),
          created_at: '2026-11-05T08:00:00.000Z'
        }
      ],
      ktn_push_subscriptions: [],
      ktn_attendance: [],
      ktn_orders: [],
      ktn_courses: [],
      ktn_student_lifecycle: [],
      ktn_provisioning_jobs: [],
      ktn_sync_events: [],
      ktn_course_grant_requests: [],
      ktn_teacher_contribution_events: [],
      ktn_admin_audit_logs: []
    },
    pushDeliveries: [],
    supabaseQueries: []
  };

  function evalClause(row, rawClause) {
    if (rawClause.endsWith('.is.null')) {
      const col = rawClause.slice(0, -8);
      return row[col] === null || row[col] === undefined;
    }
    const m = rawClause.match(/^([a-zA-Z0-9_]+)\.(eq|ilike|like)\.(.*)$/);
    if (!m) return true;
    const [, col, op, v] = m;
    const cell = String(row[col] ?? '');
    if (op === 'eq') return cell === v;
    const isCi = op === 'ilike';
    const regexStr = '^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
    return new RegExp(regexStr, isCi ? 'i' : '').test(cell);
  }

  function matchAll(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const clauses = rawVal.replace(/^\(/, '').replace(/\)$/, '').split(',');
        if (!clauses.some((c) => evalClause(row, c))) return false;
        continue;
      }
      if (rawVal === 'is.null') {
        if (row[k] !== null && row[k] !== undefined) return false;
      } else if (rawVal.startsWith('eq.')) {
        if (String(row[k] ?? '') !== rawVal.slice(3)) return false;
      } else if (rawVal.startsWith('neq.')) {
        if (String(row[k] ?? '') === rawVal.slice(4)) return false;
      } else if (rawVal.startsWith('ilike.') || rawVal.startsWith('like.')) {
        const isCi = rawVal.startsWith('ilike.');
        const p = rawVal.slice(isCi ? 6 : 5);
        const rx = new RegExp('^' + p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$', isCi ? 'i' : '');
        if (!rx.test(String(row[k] ?? ''))) return false;
      } else if (rawVal.startsWith('in.(')) {
        const list = rawVal.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, ''));
        if (!list.includes(String(row[k] ?? ''))) return false;
      }
    }
    return true;
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(urlStr);

    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      state.supabaseQueries.push({ method, table, search: u.search });
      if (table.startsWith('rpc/')) {
        return new Response(JSON.stringify({ message: 'RPC omitted' }), { status: 404 });
      }
      const selectParam = u.searchParams.get('select') || '';
      if (selectParam && selectParam !== '*') {
        if (table === 'ktn_students' && selectParam.includes('account_status')) {
          return new Response(JSON.stringify({ code: '42703' }), { status: 400 });
        }
        if (table === 'ktn_teachers' && selectParam.includes('assigned_classes')) {
          return new Response(JSON.stringify({ code: '42703' }), { status: 400 });
        }
      }
      const rows = state.tables[table] || (state.tables[table] = []);
      if (method === 'GET') {
        let matched = rows.filter((r) => matchAll(r, u.searchParams));
        const orderParam = u.searchParams.get('order');
        if (orderParam && matched.length > 1) {
          const [col, dir] = orderParam.split('.');
          const desc = dir === 'desc';
          matched = [...matched].sort((a, b) => {
            const va = String(a[col] ?? '');
            const vb = String(b[col] ?? '');
            return desc ? vb.localeCompare(va) : va.localeCompare(vb);
          });
        }
        const offset = Math.max(0, Number(u.searchParams.get('offset') || 0));
        const limit = Number(u.searchParams.get('limit') || 0);
        const paged = limit > 0 ? matched.slice(offset, offset + limit) : matched.slice(offset);
        return new Response(JSON.stringify(paged), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `${offset}-${Math.max(offset, offset + paged.length - 1)}/${matched.length}`
          }
        });
      }
      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(body) ? body : [body];
        const onConflict = u.searchParams.get('on_conflict');
        const pkByTable = {
          ktn_students: 'email',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_class_sessions: 'id',
          ktn_homeworks: 'id',
          ktn_push_subscriptions: 'endpoint'
        };
        const pk = pkByTable[table] || 'id';
        const out = [];
        for (const item of items) {
          let idx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map((s) => s.trim());
            idx = rows.findIndex((r) => keys.every((k) => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase()));
          } else if (item[pk]) {
            idx = rows.findIndex((r) => String(r[pk] ?? '').toLowerCase() === String(item[pk] ?? '').toLowerCase());
          }
          if (idx >= 0) {
            Object.assign(rows[idx], item);
            out.push(rows[idx]);
          } else {
            const rec = { id: item.id || `MOCK-${rows.length + 1}`, created_at: new Date().toISOString(), ...item };
            rows.push(rec);
            out.push(rec);
          }
        }
        return new Response(JSON.stringify(out), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'PATCH') {
        const patch = init.body ? JSON.parse(init.body) : {};
        const matched = rows.filter((r) => matchAll(r, u.searchParams));
        matched.forEach((r) => Object.assign(r, patch));
        return new Response(JSON.stringify(matched), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (method === 'DELETE') {
        state.tables[table] = rows.filter((r) => !matchAll(r, u.searchParams));
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (u.hostname.includes('amazonaws.com') && u.pathname.endsWith('/signin')) {
      const body = init.body ? JSON.parse(init.body) : {};
      const email = String(body.email || '').toLowerCase();
      if (email === 'hocvienkhongtunhi123@gmail.com') {
        return new Response(
          JSON.stringify({
            accessToken: 'mock-admin-jwt',
            id: '2c01e488-d866-4341-a0db-644fe6ba1202',
            userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
            email,
            roles: ['root', 'admin'],
            type: 'admin'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const stu = state.tables.ktn_students.find((s) => s.email.toLowerCase() === email);
      if (stu) {
        return new Response(
          JSON.stringify({
            accessToken: `mock-stu-jwt-${stu.code}`,
            id: stu.cognito_user_id,
            userId: stu.cognito_user_id,
            email,
            roles: ['student'],
            type: 'student'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      const tea = state.tables.ktn_teachers.find((t) => t.email.toLowerCase() === email);
      if (tea) {
        return new Response(
          JSON.stringify({
            accessToken: `mock-tea-jwt-${tea.code}`,
            id: `tea-uid-${tea.code}`,
            userId: `tea-uid-${tea.code}`,
            email,
            roles: ['teacher'],
            type: 'teacher'
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401 });
    }

    if (u.hostname === 'fcm.googleapis.com' || u.hostname === 'web.push.apple.com') {
      state.pushDeliveries.push({ endpoint: urlStr, method, at: Date.now() });
      return new Response('', { status: 201 });
    }

    if (u.pathname.startsWith('/custom-page/so-lien-lac')) {
      return new Response('<!doctype html><html><head><title>KTN</title></head><body>OK</body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  }

  const sandbox = {
    console: { log: () => {}, warn: () => {}, error: () => {} },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    Headers,
    Request,
    Response,
    TextEncoder,
    TextDecoder,
    Uint8Array,
    ArrayBuffer,
    crypto: crypto.webcrypto,
    btoa: (s) => Buffer.from(s, 'binary').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('binary'),
    fetch: mockFetch,
    module: { exports: {} },
    Math,
    Date,
    JSON,
    Object,
    Array,
    String,
    Number,
    Boolean,
    Promise,
    Set,
    Map,
    RegExp,
    Error,
    encodeURIComponent,
    decodeURIComponent
  };

  vm.runInNewContext(transformed, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  const worker = sandbox.module.exports;

  const subtle = crypto.webcrypto.subtle;
  const vapidPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const vapidJwk = await subtle.exportKey('jwk', vapidPair.privateKey);
  const vapidRawPub = Buffer.from(await subtle.exportKey('raw', vapidPair.publicKey));

  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-secret-key-2026',
    KTN_STAFF_AND_TEST_PASSWORD: 'TestStrongPassword!2026',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026',
    KTN_SESSION_SECRET: 'n01-n20-acceptance-secret-2026',
    KTN_WEBHOOK_SECRET: 'n01-n20-webhook-secret-2026',
    VAPID_PUBLIC_KEY: vapidRawPub.toString('base64url'),
    VAPID_PRIVATE_KEY: vapidJwk.d
  };

  async function makePushSub(endpoint) {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const rawPub = Buffer.from(await subtle.exportKey('raw', kp.publicKey));
    return {
      endpoint,
      keys: {
        p256dh: rawPub.toString('base64url'),
        auth: crypto.randomBytes(16).toString('base64url')
      }
    };
  }

  async function callApi(pathAndQuery, opts = {}) {
    const req = new Request('https://khongtunhi.com' + pathAndQuery, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined
    });
    const waitUntilPromises = [];
    const res = await worker.fetch(req, env, {
      waitUntil: (p) => {
        if (p && typeof p.then === 'function') waitUntilPromises.push(p);
      }
    });
    if (waitUntilPromises.length > 0) await Promise.allSettled(waitUntilPromises);
    const bytes = new Uint8Array(await res.arrayBuffer());
    let data = null;
    const text = Buffer.from(bytes).toString('utf8');
    try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, ok: res.ok, headers: res.headers, bytes, data, text };
  }

  async function loginToken(email, pwd) {
    const res = await callApi('/api/ktn/auth/login', { method: 'POST', body: { email, password: pwd } });
    assert.strictEqual(res.status, 200, `Login failed for ${email}: ${res.text}`);
    return res.data.token;
  }

  return { state, sandbox, env, makePushSub, callApi, loginToken };
}

async function run() {
  console.log('================================================================================');
  console.log('KTN MASTER REFACTOR — LIFECYCLE & PWA ACCEPTANCE MATRIX (N01–N20)');
  console.log('================================================================================');

  const h = await createWorkerHarness();
  const adminTok = await h.loginToken('hocvienkhongtunhi123@gmail.com', 'AdminStrongPassword!2026');
  const teacherXTok = await h.loginToken('teacher.x@khongtunhi.com', 'TestStrongPassword!2026');
  const teacherYTok = await h.loginToken('teacher.y@khongtunhi.com', 'TestStrongPassword!2026');
  const teacherRandTok = await h.loginToken('teacher.random@khongtunhi.com', 'TestStrongPassword!2026');
  const stuHTok = await h.loginToken('student.h@khongtunhi.com', 'TestStrongPassword!2026');
  const stuNoClassTok = await h.loginToken('student.noclass@khongtunhi.com', 'TestStrongPassword!2026');
  const stuBTok = await h.loginToken('student.b@khongtunhi.com', 'TestStrongPassword!2026');

  const epH = 'https://fcm.googleapis.com/fcm/send/n-stu-h';
  const epX = 'https://fcm.googleapis.com/fcm/send/n-tea-x';
  const epY = 'https://fcm.googleapis.com/fcm/send/n-tea-y';
  const epRand = 'https://fcm.googleapis.com/fcm/send/n-tea-rand';
  const epAdm = 'https://fcm.googleapis.com/fcm/send/n-adm';

  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuHTok}` },
    body: { subscription: await h.makePushSub(epH) }
  });
  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherXTok}` },
    body: { subscription: await h.makePushSub(epX) }
  });
  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: { subscription: await h.makePushSub(epY) }
  });
  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherRandTok}` },
    body: { subscription: await h.makePushSub(epRand) }
  });
  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: { subscription: await h.makePushSub(epAdm) }
  });

  function pass(id, title, details) {
    console.log(`[PASS] ${id}: ${title} (${details})`);
  }

  // N01–N05: Transfer student.h from CLS-A -> CLS-B
  const transferRes = await h.callApi('/api/ktn/students/courses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: { action: 'assign_class', email: 'student.h@khongtunhi.com', classCode: 'CLS-B' }
  });
  assert.strictEqual(transferRes.status, 200);

  const hOldChatRead = await h.callApi('/api/ktn/messages?roomId=class%3ACLS-A', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  const hOldChatSend = await h.callApi('/api/ktn/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuHTok}` },
    body: { roomId: 'class:CLS-A', content: 'Thử gửi vào lớp cũ A' }
  });
  assert.strictEqual(hOldChatRead.status, 403);
  assert.strictEqual(hOldChatSend.status, 403);
  pass('N01', 'Transferred student gets 403 on old Class A read/send even with stale JWT', `read=${hOldChatRead.status}, write=${hOldChatSend.status}`);

  const hRooms = await h.callApi('/api/ktn/messages/rooms', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  const hGroupIds = (hRooms.data?.groupRooms || []).map((r) => r.roomId);
  assert.ok(!hGroupIds.includes('class:CLS-A'), 'Old class:CLS-A must be absent');
  assert.ok(hGroupIds.includes('class:CLS-B'), 'New class:CLS-B must be present');
  assert.ok(hGroupIds.includes('course:6adadba969897b0002482ca5'), 'Online course must stay accessible');
  pass('N02', 'Chat rooms update immediately to CLS-B while keeping independent online courses', `rooms=${hGroupIds.join(',')}`);

  const hNotifs = await h.callApi('/api/ktn/notifications', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  const hNotifItems = hNotifs.data?.notifications || [];
  assert.ok(!hNotifItems.some((n) => String(n.classCode || '').toUpperCase() === 'CLS-A'), 'Old CLS-A notifications must not leak');
  assert.ok(hNotifItems.some((n) => String(n.courseId || '') === '6adadba969897b0002482ca5'), 'Course notification kept');
  pass('N03', 'Old CLS-A notifications excluded from inbox & badge while keeping online course notifications', `count=${hNotifItems.length}`);

  assert.ok(h.state.tables.ktn_homeworks.some((hw) => hw.id === 'HW-HIST-A' && hw.score === 9.0), 'Historical HW-HIST-A kept');
  assert.ok(h.state.tables.ktn_messages.some((m) => m.id === 'MSG-HIST-STU-H'), 'Historical chat message kept');
  pass('N04', 'Historical Class A grades & chat messages preserved in DB', 'HW-HIST-A=9.0, MSG-HIST-STU-H intact');

  h.state.pushDeliveries = [];
  const xMsgRes = await h.callApi('/api/ktn/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherXTok}` },
    body: { roomId: 'class:CLS-A', content: 'Tin nhắn mới lớp A sau khi H đã chuyển' }
  });
  assert.strictEqual(xMsgRes.status, 200);
  assert.ok(!h.state.pushDeliveries.some((d) => d.endpoint === epH), 'Transferred student must NOT receive push from CLS-A');
  pass('N05', 'New Class A activity sends zero push to transferred student H', `pushDeliveries=${h.state.pushDeliveries.length}`);

  // N06–N07: Teacher X unassigned/replaced on CLS-A
  h.state.pushDeliveries = [];
  const clearTeacherRes = await h.callApi('/api/ktn/classes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: { id: 'CLS-A', name: 'Lớp A', teacherEmail: '', teacherCode: '', mode: 'update' }
  });
  assert.strictEqual(clearTeacherRes.status, 200);
  const xAccessA = await h.callApi('/api/ktn/messages?roomId=class%3ACLS-A', {
    headers: { Authorization: `Bearer ${teacherXTok}` }
  });
  const xClassSessA = await h.callApi('/api/ktn/class-sessions?classCode=CLS-A', {
    headers: { Authorization: `Bearer ${teacherXTok}` }
  });
  const xNotifsA = await h.callApi('/api/ktn/notifications', {
    headers: { Authorization: `Bearer ${teacherXTok}` }
  });
  assert.strictEqual(xAccessA.status, 403);
  assert.strictEqual(xClassSessA.status, 403);
  pass('N06', 'Unassigned Teacher X loses immediate Class A chat & session access', `chat=${xAccessA.status}, sessions=${xClassSessA.status}`);

  const clsAfterClear = await h.callApi('/api/ktn/classes?lite=1', {
    headers: { Authorization: `Bearer ${adminTok}` }
  });
  const clsAObj = (clsAfterClear.data?.classes || []).find((c) => c.id === 'CLS-A');
  assert.strictEqual(clsAObj.teacher_email, '');
  assert.strictEqual(clsAObj.teacher_name, 'Chưa phân công giáo viên');
  pass('N07', 'Class A metadata shows "Chưa phân công giáo viên" when teacher cleared', `teacher_name=${clsAObj.teacher_name}`);

  // N08–N10: Unassigned student & class-without-teacher -> Học vụ Khổng Tử Nhí ("support_center")
  // Move student.h back into CLS-A (which currently has NO teacher!)
  await h.callApi('/api/ktn/students/courses', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: { action: 'assign_class', email: 'student.h@khongtunhi.com', classCode: 'CLS-A' }
  });
  const hRoomsNoTeacher = await h.callApi('/api/ktn/messages/rooms', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  assert.strictEqual(hRoomsNoTeacher.data?.privateRoom?.hasAssignedTeacher, false);
  assert.strictEqual(hRoomsNoTeacher.data?.privateRoom?.recipientTargetType, 'support_center');
  assert.ok(String(hRoomsNoTeacher.data?.privateRoom?.label || '').includes('Học vụ Khổng Tử Nhí'));
  pass('N08', 'Student in teacherless class routes 1-1 chat to Học vụ Khổng Tử Nhí', hRoomsNoTeacher.data?.privateRoom?.label);

  const noClassRooms = await h.callApi('/api/ktn/messages/rooms', {
    headers: { Authorization: `Bearer ${stuNoClassTok}` }
  });
  assert.strictEqual(noClassRooms.data?.privateRoom?.hasAssignedTeacher, false);
  assert.strictEqual(noClassRooms.data?.privateRoom?.recipientTargetType, 'support_center');
  assert.ok(String(noClassRooms.data?.privateRoom?.label || '').includes('Học vụ Khổng Tử Nhí'));
  pass('N09', 'Unassigned student (no class) routes 1-1 chat to Học vụ Khổng Tử Nhí', noClassRooms.data?.privateRoom?.label);

  h.state.pushDeliveries = [];
  const stuSupportSend = await h.callApi('/api/ktn/messages', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuNoClassTok}` },
    body: { roomId: 'student:student.noclass@khongtunhi.com', content: 'Em cần Học vụ tư vấn xếp lớp ạ' }
  });
  assert.strictEqual(stuSupportSend.status, 200);
  const randTeacherPeek = await h.callApi('/api/ktn/messages?roomId=student%3Astudent.noclass%40khongtunhi.com', {
    headers: { Authorization: `Bearer ${teacherRandTok}` }
  });
  assert.strictEqual(randTeacherPeek.status, 403);
  assert.ok(!h.state.pushDeliveries.some((d) => d.endpoint === epRand), 'Random teacher must NOT get unassigned student push');
  assert.ok(h.state.pushDeliveries.some((d) => d.endpoint === epAdm), 'Academic Admin receives support center push');

  // Historical teacher author preserved when reading student:student.h room
  const hPrivHistory = await h.callApi('/api/ktn/messages?roomId=student%3Astudent.h%40khongtunhi.com', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  assert.strictEqual(hPrivHistory.status, 200);
  const histAuthorMsg = (hPrivHistory.data?.messages || []).find((m) => m.id === 'MSG-HIST-STU-H');
  assert.strictEqual(histAuthorMsg?.sender_name, 'Cô X (Lịch sử)');
  // Assign Teacher Y to CLS-A -> student.h target flips back to teacher Y cleanly
  await h.callApi('/api/ktn/classes', {
    method: 'POST',
    headers: { Authorization: `Bearer ${adminTok}` },
    body: { id: 'CLS-A', name: 'Lớp A', teacherEmail: 'teacher.y@khongtunhi.com', teacherCode: 'GV-Y', mode: 'update' }
  });
  const hRoomsWithTeacherY = await h.callApi('/api/ktn/messages/rooms', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  assert.strictEqual(hRoomsWithTeacherY.data?.privateRoom?.hasAssignedTeacher, true);
  assert.strictEqual(hRoomsWithTeacherY.data?.privateRoom?.recipientTargetType, 'teacher');
  pass('N10', 'Unassigned support chat blocks random teachers, alerts Admin, keeps historical authors & updates when teacher Y assigned', 'verified');

  // N11–N12: Delayed queued push re-verification guard inside Worker dispatchWebPushForQuery
  h.state.pushDeliveries = [];
  // Delayed queued push targeting student.h for CLS-B (H is currently in CLS-A!) must be skipped before dispatch
  await h.sandbox.dispatchWebPushForQuery(
    h.env,
    `user_email=eq.${encodeURIComponent('student.h@khongtunhi.com')}`,
    {
      title: 'Delayed Push CLS-B',
      body: 'Should be skipped',
      classCode: 'CLS-B',
      eventType: 'class_reminder'
    }
  );
  assert.strictEqual(h.state.pushDeliveries.length, 0, 'Delayed push for former/other class CLS-B must be blocked pre-dispatch');
  pass('N11', 'Delayed queued push re-verifies student membership pre-dispatch and aborts stale class push', 'deliveries=0');

  // Delayed queued push for soft-deleted class CLS-DEL must be skipped
  await h.sandbox.dispatchWebPushForQuery(
    h.env,
    `user_email=eq.${encodeURIComponent('teacher.random@khongtunhi.com')}`,
    {
      title: 'Deleted class push',
      body: 'Should abort',
      classCode: 'CLS-DEL',
      eventType: 'homework_assigned'
    }
  );
  assert.strictEqual(h.state.pushDeliveries.length, 0, 'Soft-deleted class push must abort pre-dispatch');
  pass('N12', 'Soft-deleted class delayed push is aborted pre-dispatch', 'deliveries=0');

  // N13–N16: Draft isolation, blank prompt with attachment, 409 conflict, blank score on revision_requested
  const stuSessA = await h.callApi('/api/ktn/class-sessions?classCode=CLS-A', {
    headers: { Authorization: `Bearer ${stuHTok}` }
  });
  const teaSessA = await h.callApi('/api/ktn/class-sessions?classCode=CLS-A', {
    headers: { Authorization: `Bearer ${teacherYTok}` }
  });
  const stuExIds = (stuSessA.data?.sessions?.[0]?.exercises || []).map((e) => e.id);
  const teaExIds = (teaSessA.data?.sessions?.[0]?.exercises || []).map((e) => e.id);
  assert.ok(stuExIds.includes('EX-A-PUB') && !stuExIds.includes('EX-A-DRAFT'), 'Student must not see draft exercises');
  assert.ok(teaExIds.includes('EX-A-DRAFT'), 'Teacher retains visibility of draft exercises');
  pass('N13', 'Student GET /api/ktn/class-sessions strips draft exercises while Teacher keeps drafts', `stu=${stuExIds.join(',')}`);

  const saveBlankPromptOk = await h.callApi('/api/ktn/class-sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: {
      classCode: 'CLS-A',
      sessionNum: 1,
      title: 'Buổi 1 Lớp A',
      expectedUpdatedAt: teaSessA.data?.sessions?.[0]?.updatedAt,
      exercises: [
        {
          id: 'EX-A-PUB',
          num: 1,
          title: 'Phiếu PDF Không Cần Mô Tả',
          prompt: '',
          attachments: [{ id: 'a1', name: 'phieu.pdf', url: 'https://cdn.khongtunhi.com/phieu.pdf', mimeType: 'application/pdf', sizeBytes: 1024 }],
          status: 'published'
        }
      ]
    }
  });
  assert.strictEqual(saveBlankPromptOk.status, 200);
  pass('N14', 'POST /api/ktn/class-sessions allows title + attachment with blank prompt', 'status=200');

  const staleSaveConflict = await h.callApi('/api/ktn/class-sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: {
      classCode: 'CLS-A',
      sessionNum: 1,
      title: 'Buổi 1 Lớp A',
      expectedUpdatedAt: '2026-11-10T08:00:00.000Z',
      exercises: [{ id: 'EX-A-PUB', num: 1, title: 'Ghi đè cũ', prompt: 'Cũ', status: 'published' }]
    }
  });
  assert.strictEqual(staleSaveConflict.status, 409);
  pass('N15', 'Optimistic lock rejects stale expectedUpdatedAt with 409 Conflict', `status=${staleSaveConflict.status}`);

  const revGradeRes = await h.callApi('/api/ktn/homeworks/grade', {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: { id: 'HW-REV-B', status: 'revision_requested', score: null, teacherFeedback: 'Thu lại âm rõ hơn' }
  });
  assert.strictEqual(revGradeRes.status, 200);
  pass('N16', 'PATCH /api/ktn/homeworks/grade allows revision_requested with blank score', `status=${revGradeRes.status}`);

  // N17–N19: Unassigned push subscription clearing, logout endpoint unsubscribe & multi-account rebind
  await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuNoClassTok}` },
    body: { subscription: await h.makePushSub('https://fcm.googleapis.com/fcm/send/noclass-dev') }
  });
  const noClassSub = h.state.tables.ktn_push_subscriptions.find((s) => s.endpoint === 'https://fcm.googleapis.com/fcm/send/noclass-dev');
  assert.ok(noClassSub && !noClassSub.class_code, `Expected empty/null class_code, got ${String(noClassSub?.class_code)}`);
  pass('N17', 'Push subscribe stores null/empty class_code when student is unassigned', `class_code="${String(noClassSub?.class_code)}"`);

  const logoutRes = await h.callApi('/api/ktn/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuHTok}` },
    body: { unsubscribeEndpoint: epH }
  });
  assert.strictEqual(logoutRes.status, 200);
  assert.ok(!h.state.tables.ktn_push_subscriptions.some((s) => s.endpoint === epH), 'Logged-out endpoint removed/deactivated');
  pass('N18', 'POST /api/ktn/auth/logout deactivates HTTPS push subscription endpoint', 'unsubscribed=true');

  // Same shared desktop endpoint rebound from Student B -> re-authenticated Student H must reassign ownership strictly
  const sharedEp = 'https://fcm.googleapis.com/fcm/send/shared-desktop-edge';
  const subBRes = await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuBTok}` },
    body: { subscription: await h.makePushSub(sharedEp) }
  });
  assert.strictEqual(subBRes.status, 200);
  const stuHFreshTok = await h.loginToken('student.h@khongtunhi.com', 'TestStrongPassword!2026');
  const subHRes = await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuHFreshTok}` },
    body: { subscription: await h.makePushSub(sharedEp) }
  });
  assert.strictEqual(subHRes.status, 200);
  const matchingShared = h.state.tables.ktn_push_subscriptions.filter((s) => s.endpoint === sharedEp);
  assert.strictEqual(matchingShared.length, 1);
  assert.strictEqual(matchingShared[0].user_email, 'student.h@khongtunhi.com');
  pass('N19', 'Device endpoint switch rebinds strictly to latest logged-in account', `owner=${matchingShared[0].user_email}`);

  // N20: PWA Manifest, Real Binary PNG Icons (180/192/512) & SW v3 Routes
  const manifestRes = await h.callApi('/manifest.json');
  assert.strictEqual(manifestRes.status, 200);
  assert.strictEqual(manifestRes.data?.start_url, '/custom-page/so-lien-lac-test');
  assert.strictEqual(manifestRes.data?.scope, '/');
  assert.strictEqual(manifestRes.data?.display, 'standalone');
  assert.ok(manifestRes.data?.icons?.some((i) => i.src === '/icons/icon-192.png' && i.sizes === '192x192'));
  assert.ok(manifestRes.data?.icons?.some((i) => i.src === '/icons/icon-512.png' && i.sizes === '512x512'));

  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  for (const iconPath of ['/icons/icon-192.png', '/icons/icon-512.png', '/icons/icon-maskable-512.png', '/icons/apple-touch-icon-180.png']) {
    const iconRes = await h.callApi(iconPath);
    assert.strictEqual(iconRes.status, 200, `Icon ${iconPath} returned ${iconRes.status}`);
    assert.ok(String(iconRes.headers.get('content-type') || '').includes('image/png'));
    for (let i = 0; i < pngMagic.length; i++) {
      assert.strictEqual(iconRes.bytes[i], pngMagic[i], `${iconPath} missing PNG signature byte ${i}`);
    }
  }
  const swRes = await h.callApi('/sw.js');
  assert.strictEqual(swRes.status, 200);
  assert.ok(swRes.text.includes('ktn-pwa-v3') && swRes.text.includes('notificationclick'));
  pass('N20', 'Worker serves Desktop Installable /manifest.json, genuine PNG icons, and ktn-pwa-v3 /sw.js', 'verified');

  // N21: Empty class session row (exercises: []) MUST NOT emit phantom homework_assigned notification
  h.state.tables.ktn_class_sessions.push({
    id: 'CLS-B::9',
    class_code: 'CLS-B',
    session_num: 9,
    title: 'Buổi 9 trống bài tập',
    exercises: [],
    updated_at: '2026-11-12T08:00:00.000Z'
  });
  const stuBNotifEmptyCheck = await h.callApi('/api/ktn/notifications', {
    headers: { Authorization: `Bearer ${stuBTok}` }
  });
  assert.strictEqual(stuBNotifEmptyCheck.status, 200);
  assert.ok(
    !(stuBNotifEmptyCheck.data?.notifications || []).some((n) => n.type === 'homework_assigned' && Number(n.sessionNum) === 9),
    'Empty exercises session must not emit phantom homework_assigned notification'
  );
  pass('N21', 'Empty class session (exercises: []) does not emit phantom homework_assigned notification', 'verified');

  // N22: Edit published exercise suppresses duplicate notify by default, and forceNotify: true delivers fresh push without dedup collision
  const stuBFreshTok = await h.loginToken('student.b@khongtunhi.com', 'TestStrongPassword!2026');
  const pushEpB = 'https://fcm.googleapis.com/fcm/send/stu-b-force-notify';
  const subForceB = await h.callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuBFreshTok}` },
    body: { subscription: await h.makePushSub(pushEpB) }
  });
  assert.strictEqual(subForceB.status, 200);

  const editNoForceRes = await h.callApi('/api/ktn/class-sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: {
      classCode: 'CLS-B',
      sessionNum: 1,
      title: 'Buổi 1 Lớp B',
      mode: 'update_exercise',
      status: 'published',
      exercise: { id: 'EX-B-PUB', num: 1, title: 'Bài công khai Lớp B (sửa)', prompt: 'Đọc lại bài B', status: 'published' }
    }
  });
  assert.strictEqual(editNoForceRes.status, 200);
  assert.strictEqual(editNoForceRes.data?.pushDispatch?.skipped, true);
  assert.strictEqual(editNoForceRes.data?.pushDispatch?.reason, 'EDIT_EXISTING_EXERCISE_NO_DUPLICATE_NOTIFY');

  const editForceRes = await h.callApi('/api/ktn/class-sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${teacherYTok}` },
    body: {
      classCode: 'CLS-B',
      sessionNum: 1,
      title: 'Buổi 1 Lớp B',
      mode: 'update_exercise',
      status: 'published',
      forceNotify: true,
      exercise: { id: 'EX-B-PUB', num: 1, title: 'Bài công khai Lớp B (cập nhật quan trọng)', prompt: 'Nộp trước 20h', status: 'published' }
    }
  });
  assert.strictEqual(editForceRes.status, 200);
  assert.ok(!editForceRes.data?.pushDispatch?.skipped, `Expected forceNotify push dispatch not skipped, got: ${JSON.stringify(editForceRes.data?.pushDispatch)}`);
  const forceDeliveredCount = Number(editForceRes.data?.pushDispatch?.delivered ?? editForceRes.data?.pushDispatch?.pushAccepted ?? 0);
  assert.ok(forceDeliveredCount >= 1, `Expected at least 1 push accepted/delivered for forceNotify, got: ${JSON.stringify(editForceRes.data?.pushDispatch)}`);
  pass('N22', 'Edit published exercise suppresses duplicate notify by default and honors forceNotify without push dedup collision', `delivered=${forceDeliveredCount}`);

  // N23: Revoked video course hides forum_answer notifications for that course
  const stuBRecord = h.state.tables.ktn_students.find((s) => s.email === 'student.b@khongtunhi.com');
  stuBRecord.online_courses = [{ id: '6adadba969897b0002482ca5', code: 'HSK1' }];
  const fqRevPayload = {
    id: 'FQ-REV-N23',
    course_id: '6adadba969897b0002482ca5',
    unit_id: 'u1',
    lesson_num: 1,
    lesson_title_snapshot: 'Bài 1 HSK1',
    student_email: 'student.b@khongtunhi.com',
    student_name: 'Học Viên B',
    title: 'Câu hỏi HSK1',
    content: 'Cách phát âm thanh 3?',
    status: 'answered',
    created_at: '2026-11-12T09:00:00.000Z',
    updated_at: '2026-11-12T09:00:00.000Z'
  };
  const faRevPayload = {
    id: 'FA-REV-N23',
    question_id: 'FQ-REV-N23',
    author_email: 'teacher.y@khongtunhi.com',
    author_name: 'Cô Y',
    author_role: 'teacher',
    content: 'Biến điệu thanh 3 nhé!',
    status: 'visible',
    created_at: '2026-11-12T09:05:00.000Z',
    updated_at: '2026-11-12T09:05:00.000Z'
  };
  h.state.tables.ktn_forum_questions = h.state.tables.ktn_forum_questions || [];
  h.state.tables.ktn_forum_answers = h.state.tables.ktn_forum_answers || [];
  h.state.tables.ktn_forum_questions.push(fqRevPayload);
  h.state.tables.ktn_forum_answers.push(faRevPayload);
  h.state.tables.ktn_dlp_alerts.push(
    { id: 'FQ-REV-N23', room_id: 'FORUM_QUESTION', sender_email: 'student.b@khongtunhi.com', blocked_content: JSON.stringify(fqRevPayload), created_at: fqRevPayload.created_at },
    { id: 'FA-REV-N23', room_id: 'FORUM_ANSWER', sender_email: 'teacher.y@khongtunhi.com', blocked_content: JSON.stringify(faRevPayload), created_at: faRevPayload.created_at }
  );
  const notifsWithCourse = await h.callApi('/api/ktn/notifications', { headers: { Authorization: `Bearer ${stuBFreshTok}` } });
  assert.ok((notifsWithCourse.data?.notifications || []).some((n) => n.id === 'NOTIF-FORUM-ANS-FA-REV-N23'), 'Enrolled course student sees forum_answer notification');
  stuBRecord.online_courses = [];
  const notifsAfterCourseRevoke = await h.callApi('/api/ktn/notifications', { headers: { Authorization: `Bearer ${stuBFreshTok}` } });
  assert.ok(!(notifsAfterCourseRevoke.data?.notifications || []).some((n) => n.id === 'NOTIF-FORUM-ANS-FA-REV-N23'), 'Revoked course student must not receive forum_answer notification');
  pass('N23', 'Forum answer notification enforces current online_courses DB entitlement after revocation', 'verified');

  // N24: Logout unsubscribeEndpoints array cleans up all endpoints for the user
  const multiEp1 = 'https://fcm.googleapis.com/fcm/send/stu-b-multi-1';
  const multiEp2 = 'https://fcm.googleapis.com/fcm/send/stu-b-multi-2';
  await h.callApi('/api/ktn/push/subscribe', { method: 'POST', headers: { Authorization: `Bearer ${stuBFreshTok}` }, body: { subscription: await h.makePushSub(multiEp1) } });
  await h.callApi('/api/ktn/push/subscribe', { method: 'POST', headers: { Authorization: `Bearer ${stuBFreshTok}` }, body: { subscription: await h.makePushSub(multiEp2) } });
  const multiLogoutRes = await h.callApi('/api/ktn/auth/logout', {
    method: 'POST',
    headers: { Authorization: `Bearer ${stuBFreshTok}` },
    body: { unsubscribeEndpoints: [multiEp1, multiEp2] }
  });
  assert.strictEqual(multiLogoutRes.status, 200);
  assert.ok(
    !h.state.tables.ktn_push_subscriptions.some((s) => s.endpoint === multiEp1 || s.endpoint === multiEp2),
    'All endpoints in unsubscribeEndpoints array must be deleted on logout'
  );
  pass('N24', 'POST /api/ktn/auth/logout deletes all URLs in unsubscribeEndpoints array', 'verified');

  // N25: Deleted student DB row with non-expired JWT has zero stale session.classCode fallback
  const stuBTokenBeforeDelete = await h.loginToken('student.b@khongtunhi.com', 'TestStrongPassword!2026');
  h.state.tables.ktn_students = h.state.tables.ktn_students.filter((s) => s.email !== 'student.b@khongtunhi.com');
  const [delNotifs, delRooms, delSessions, delMsgRoom, delHwPost] = await Promise.all([
    h.callApi('/api/ktn/notifications', { headers: { Authorization: `Bearer ${stuBTokenBeforeDelete}` } }),
    h.callApi('/api/ktn/messages/rooms', { headers: { Authorization: `Bearer ${stuBTokenBeforeDelete}` } }),
    h.callApi('/api/ktn/class-sessions?classCode=CLS-B', { headers: { Authorization: `Bearer ${stuBTokenBeforeDelete}` } }),
    h.callApi('/api/ktn/messages?roomId=class:CLS-B', { headers: { Authorization: `Bearer ${stuBTokenBeforeDelete}` } }),
    h.callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${stuBTokenBeforeDelete}` },
      body: { classCode: 'CLS-B', lessonNum: 101, submissionMode: 'text', textAnswer: 'Nộp thử sau khi bị xóa' }
    })
  ]);
  assert.strictEqual(delNotifs.status, 200);
  assert.strictEqual((delNotifs.data?.notifications || []).length, 0);
  assert.strictEqual(delNotifs.data?.unreadCount, 0);
  assert.strictEqual(delRooms.status, 200);
  assert.strictEqual((delRooms.data?.rooms || []).length, 0);
  assert.strictEqual(delRooms.data?.accountInactive, true);
  assert.strictEqual(delSessions.status, 403);
  assert.strictEqual(delMsgRoom.status, 403);
  assert.strictEqual(delHwPost.status, 403);
  pass('N25', 'Deleted student record (!stuRow) cannot leak stale JWT classCode across notifications, rooms, sessions, chat, or homeworks', 'verified');

  // N26: Teacher GET /api/ktn/notifications executes zero duplicate Supabase queries for classes/alerts/schedule
  h.state.supabaseQueries.length = 0;
  const teaNotifsN26 = await h.callApi('/api/ktn/notifications', {
    headers: { Authorization: `Bearer ${teacherYTok}` }
  });
  assert.strictEqual(teaNotifsN26.status, 200);
  const clsScanCount = h.state.supabaseQueries.filter(
    (q) => q.method === 'GET' && q.table === 'ktn_classes' && q.search.includes('teacher_email')
  ).length;
  const schedWaveCount = h.state.supabaseQueries.filter(
    (q) => q.method === 'GET' && q.table === 'ktn_dlp_alerts' && q.search.includes('CLASS_SCHEDULE_EVENT')
  ).length;
  const combinedAlertsCount = h.state.supabaseQueries.filter(
    (q) => q.method === 'GET' && q.table === 'ktn_dlp_alerts' && q.search.includes('NOTIF_PREFS')
  ).length;
  assert.strictEqual(clsScanCount, 1, `Expected 1 ktn_classes scan for teacher notifications, got ${clsScanCount}`);
  assert.strictEqual(schedWaveCount, 1, `Expected 1 CLASS_SCHEDULE_EVENT query for teacher notifications, got ${schedWaveCount}`);
  assert.strictEqual(combinedAlertsCount, 1, `Expected 1 combined user alerts query for teacher notifications, got ${combinedAlertsCount}`);
  pass('N26', 'Teacher GET /api/ktn/notifications eliminates duplicate Supabase queries', `classes=${clsScanCount}, sched=${schedWaveCount}, alerts=${combinedAlertsCount}`);

  // N27: Worker HTML pass-through injects V2 manifest ONLY on /custom-page/so-lien-lac-test (never V1 /custom-page/so-lien-lac)
  const v1HtmlRes = await h.callApi('/custom-page/so-lien-lac');
  const v2HtmlRes = await h.callApi('/custom-page/so-lien-lac-test');
  assert.strictEqual(v1HtmlRes.status, 200);
  assert.strictEqual(v2HtmlRes.status, 200);
  assert.ok(!v1HtmlRes.text.includes('rel="manifest"'), 'V1 /custom-page/so-lien-lac MUST NOT receive V2 manifest.json');
  assert.ok(v2HtmlRes.text.includes('<link rel="manifest" href="/manifest.json">'), 'V2 /custom-page/so-lien-lac-test must include manifest.json');
  pass('N27', 'V1 /custom-page/so-lien-lac stays unpolluted by V2 PWA manifest tags while V2 /so-lien-lac-test receives manifest', 'verified');

  // N28: SW parity (root sw.js === apps/ktn-web-v2/public/sw.js), homework_graded cold-open routing, and strict V2 notificationclick focus
  const swRootBuf = fs.readFileSync(path.join(ROOT_DIR, 'sw.js'));
  const swPublicBuf = fs.readFileSync(path.join(ROOT_DIR, 'apps/ktn-web-v2/public/sw.js'));
  assert.strictEqual(Buffer.compare(swRootBuf, swPublicBuf), 0, 'sw.js and apps/ktn-web-v2/public/sw.js must be byte-identical');
  const swListeners = {};
  const v1Posted = [];
  const v2Posted = [];
  let openedUrl = null;
  const swSandbox = {
    URL,
    URLSearchParams,
    self: {
      location: { origin: 'https://khongtunhi.com' },
      addEventListener: (ev, fn) => {
        swListeners[ev] = fn;
      },
      skipWaiting: () => Promise.resolve(),
      clients: {
        claim: () => Promise.resolve(),
        matchAll: async () => [
          {
            url: 'https://khongtunhi.com/custom-page/so-lien-lac',
            postMessage: (m) => v1Posted.push(m),
            focus: async () => {}
          },
          {
            url: 'https://khongtunhi.com/custom-page/so-lien-lac-test#/dashboard',
            postMessage: (m) => v2Posted.push(m),
            focus: async () => {}
          }
        ],
        openWindow: async (u) => {
          openedUrl = u;
        }
      },
      registration: { showNotification: async () => {} }
    },
    caches: {
      open: async () => ({ put: async () => {}, addAll: async () => {}, match: async () => null }),
      keys: async () => [],
      delete: async () => true,
      match: async () => null
    },
    fetch: async () => new Response('ok', { status: 200 }),
    Response,
    Promise
  };
  vm.runInNewContext(swRes.text, swSandbox, { filename: 'worker-sw.js' });
  const gradedLiveUrl = swSandbox.resolveSwColdOpenUrl({ eventType: 'homework_graded', classCode: 'CLS-A' });
  const gradedCourseUrl = swSandbox.resolveSwColdOpenUrl({ eventType: 'homework_graded', courseId: '6adadba969897b0002482ca5' });
  assert.strictEqual(gradedLiveUrl, '/custom-page/so-lien-lac-test#/classrooms?class=CLS-A');
  assert.strictEqual(gradedCourseUrl, '/custom-page/so-lien-lac-test#/learning?courseId=6adadba969897b0002482ca5&tab=homework');

  let clickWait = Promise.resolve();
  swListeners.notificationclick({
    notification: {
      close: () => {},
      data: { eventType: 'homework_graded', classCode: 'CLS-A' }
    },
    waitUntil: (p) => {
      clickWait = p;
    }
  });
  await clickWait;
  assert.strictEqual(v1Posted.length, 0, 'V1 tab MUST NOT hijack V2 Service Worker push click');
  assert.strictEqual(v2Posted.length, 1, 'V2 /custom-page/so-lien-lac-test tab must receive KTN_NOTIFICATION_CLICKED');
  assert.strictEqual(v2Posted[0].targetUrl, '/custom-page/so-lien-lac-test#/classrooms?class=CLS-A');
  pass('N28', 'SW files match byte-for-byte, homework_graded cold-open routes accurately, and notificationclick isolates V1 vs V2 tabs', `opened=${String(openedUrl)}, v2Posted=${v2Posted.length}`);

  console.log('\nSUMMARY: 28/28 KTN LIFECYCLE & PWA ACCEPTANCE CHECKS (N01–N28) PASSED');
}

run().catch((err) => {
  console.error('\n[N01-N20 ACCEPTANCE FAILED]', err);
  process.exit(1);
});
