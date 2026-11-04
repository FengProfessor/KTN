#!/usr/bin/env node
/**
 * KTN BROWSER E2E RELIABILITY SUITE (Group B — Real Chromium via Puppeteer)
 * =========================================================================
 * Verifies in a real headless Chromium browser against a local HTTP + Worker
 * harness (0 network calls to live production):
 *   - B1: taphong2002@gmail.com logs in -> no false 'Lớp YCT2-04' card, middle/online
 *         courses ('HSK1 3.0', 'Chinese For Kids') are clickable and load lessons.
 *   - B2: Unentitled course hash route (#/khoa/ttte2/bai/1) and enterCourseLearning()
 *         are blocked by client & server permission guards.
 *   - B3: Revoking 'Chinese For Kids' on the server immediately removes access on
 *         student browser reload (_serverSynced prevents localStorage resurrection).
 *   - B4: Student in 'YCT2-04' views teacher-assigned session, submits homework
 *         without false error banner, teacher grades 9.5/10, student reload shows
 *         9.5/10 + teacher feedback in the DOM.
 *   - B5: Student logout revokes token server-side, clears localStorage session
 *         and ktn_pending_revoke_token, and blocks subsequent API calls with 401.
 */

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');
const crypto = require('node:crypto');
const puppeteer = require('puppeteer');

const ROOT = path.resolve(__dirname, '..');
const WORKER_PATH = path.join(ROOT, 'cloudflare-worker-sw-proxy.js');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function createTestEnvironment() {
  const state = {
    tables: {
      ktn_students: [
        {
          code: 'KTN-2026-TAPHON',
          email: 'taphong2002@gmail.com',
          name: 'Tạ Phong',
          phone: '0988000111',
          cognito_user_id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
          izteach_student_id: '6abb2c0b8b46e30002add37b',
          class_code: null,
          has_live_class: false,
          has_online_courses: true,
          online_courses: [
            { id: '6adadba969897b0002482ca5', code: 'HSK1', title: 'Tiếng Trung HSK 1 (Tiêu chuẩn 3.0)' },
            { id: '65e7704a9ea90c00080d5195', code: 'CFK1', title: 'Chinese For Kids (5–6 tuổi)' }
          ],
          updated_at: new Date().toISOString()
        },
        {
          code: 'KTN-E2E-HSA',
          email: 'e2e.hs.a@khongtunhi.com',
          name: 'Bé An (E2E Lớp A)',
          phone: '0900000001',
          cognito_user_id: '11111111-2222-3333-4444-555555555551',
          izteach_student_id: '65f0000000000000000000a1',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: true,
          online_courses: [
            { id: '6adadba969897b0002482ca5', code: 'HSK1', title: 'Tiếng Trung HSK 1 (Tiêu chuẩn 3.0)' }
          ],
          updated_at: new Date().toISOString()
        }
      ],
      ktn_teachers: [
        {
          id: 1,
          code: 'GV-KTN-08',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          role: 'teacher',
          class_codes: ['YCT2-04'],
          active: true
        }
      ],
      ktn_classes: [
        {
          id: 'YCT2-04',
          code: 'YCT2-04',
          name: 'Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6',
          teacher_code: 'GV-KTN-08',
          teacher_email: 'linh.lam@khongtunhi.com',
          teacher_name: 'Cô Lâm Mỹ Linh',
          schedule: 'Thứ 3 & Thứ 6 (19:30 - 21:00)',
          level: 'YCT 2',
          student_count: 15,
          active: true
        }
      ],
      ktn_courses: [],
      ktn_homeworks: [],
      ktn_class_sessions: [
        {
          id: 101,
          class_code: 'YCT2-04',
          session_num: 1,
          title: 'Buổi 1: Từ vựng Gia đình & Chào hỏi (我家有四口人)',
          session_date: '19:30 Thứ 3',
          summary: 'Ôn tập từ vựng gia đình và mẫu câu giới thiệu thành viên.',
          vocabulary: ['爸爸', '妈妈', '哥哥', '姐姐'],
          Homework: 'Thu âm đọc to 5 câu hội thoại trang 8.',
          exercises: [
            {
              id: 't1',
              type: 'audio',
              title: 'Bài 1: Thu âm đọc to 5 câu hội thoại trang 8',
              instruction: 'Em bấm Thu âm hoặc Chọn tệp rồi bấm Nộp bài cho cô nhé.',
              pageRef: 'Trang 8'
            }
          ],
          assignments: [
            {
              id: 't1',
              type: 'audio',
              title: 'Bài 1: Thu âm đọc to 5 câu hội thoại trang 8',
              instruction: 'Em bấm Thu âm hoặc Chọn tệp rồi bấm Nộp bài cho cô nhé.',
              pageRef: 'Trang 8'
            }
          ],
          teacher_email: 'linh.lam@khongtunhi.com',
          teacher_name: 'Cô Lâm Mỹ Linh',
          updated_at: new Date().toISOString()
        }
      ],
      ktn_messages: [],
      ktn_orders: [],
      ktn_dlp_alerts: [],
      ktn_push_subscriptions: []
    },
    izteach: {
      permissionsByUid: {
        'bc21991c-ce9b-465d-b85f-dbb1821e51a9': [
          '6adadba969897b0002482ca5',
          '65e7704a9ea90c00080d5195'
        ],
        '11111111-2222-3333-4444-555555555551': [
          '6adadba969897b0002482ca5'
        ]
      },
      homeworkPosts: []
    },
    autoId: 500
  };

  function matchRow(row, filters) {
    for (const f of filters) {
      const { col, op, val } = f;
      const cell = row[col];
      if (op === 'eq') {
        if (String(cell ?? '') !== String(val)) return false;
      } else if (op === 'ilike') {
        const pattern = String(val).replace(/%/g, '.*');
        const rx = new RegExp(`^${pattern}$`, 'i');
        if (!rx.test(String(cell ?? ''))) return false;
      } else if (op === 'in') {
        const list = val.replace(/^\(|\)$/g, '').split(',').map(s => s.trim().replace(/^"|"$/g, ''));
        if (!list.includes(String(cell ?? ''))) return false;
      }
    }
    return true;
  }

  function parseSupabaseQuery(urlObj) {
    const filters = [];
    for (const [k, v] of urlObj.searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      const dotIdx = k.indexOf('.');
      const col = dotIdx > 0 ? k.slice(0, dotIdx) : k;
      const rawVal = dotIdx > 0 ? k.slice(dotIdx + 1) + '=' + v : v;
      if (rawVal.startsWith('eq.')) {
        filters.push({ col, op: 'eq', val: rawVal.slice(3) });
      } else if (rawVal.startsWith('ilike.')) {
        filters.push({ col, op: 'ilike', val: rawVal.slice(6) });
      } else if (rawVal.startsWith('in.')) {
        filters.push({ col, op: 'in', val: rawVal.slice(3) });
      }
    }
    return filters;
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = String(init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const urlObj = new URL(urlStr);

    if (urlObj.hostname === 'mock-supabase.local' && urlObj.pathname.startsWith('/rest/v1/')) {
      const table = urlObj.pathname.replace('/rest/v1/', '').split('/')[0];
      const rows = state.tables[table] || (state.tables[table] = []);
      const filters = parseSupabaseQuery(urlObj);

      if (method === 'GET') {
        let matched = rows.filter(r => matchRow(r, filters));
        const limit = Number(urlObj.searchParams.get('limit') || 0);
        if (limit > 0) matched = matched.slice(0, limit);
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (method === 'POST') {
        const bodyData = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(bodyData) ? bodyData : [bodyData];
        const prefer = String((init.headers && (init.headers.Prefer || init.headers.prefer)) || '');
        const isUpsert = prefer.includes('resolution=merge-duplicates');
        const inserted = [];

        for (const item of items) {
          let existing = null;
          if (isUpsert) {
            if (table === 'ktn_students' && item.email) {
              existing = rows.find(r => String(r.email).toLowerCase() === String(item.email).toLowerCase());
            } else if (table === 'ktn_class_sessions' && item.class_code && item.session_num !== undefined) {
              existing = rows.find(r => r.class_code === item.class_code && Number(r.session_num) === Number(item.session_num));
            }
          }
          if (existing) {
            Object.assign(existing, item);
            inserted.push(existing);
          } else {
            const newRow = {
              id: item.id || (++state.autoId),
              created_at: item.created_at || new Date().toISOString(),
              ...item
            };
            rows.unshift(newRow);
            inserted.push(newRow);
          }
        }
        return new Response(JSON.stringify(inserted), {
          status: 201,
          headers: { 'content-type': 'application/json' }
        });
      }

      if (method === 'PATCH') {
        const patchData = init.body ? JSON.parse(init.body) : {};
        const matched = rows.filter(r => matchRow(r, filters));
        for (const r of matched) {
          Object.assign(r, patchData);
        }
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    }

    if (urlObj.hostname.endsWith('amazonaws.com')) {
      const p = urlObj.pathname;
      if (p.endsWith('/signin') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const email = String(body.email || '').toLowerCase();
        if (email === 'taphong2002@gmail.com') {
          return new Response(JSON.stringify({
            accessToken: 'mock-student-taphong-jwt',
            id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
            userId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
            studentId: '6abb2c0b8b46e30002add37b',
            email,
            name: 'Tạ Phong',
            roles: ['student'],
            type: 'student'
          }), { status: 200, headers: { 'content-type': 'application/json' } });
        }
        return new Response(JSON.stringify({
          token: 'mock-izteach-admin-token',
          accessToken: 'mock-izteach-admin-token',
          id: '2c01e488-d866-4341-a0db-644fe6ba1202',
          userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
          email: email || 'hocvienkhongtunhi123@gmail.com',
          roles: ['root', 'admin'],
          type: 'admin'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.includes('/prod/user-permission/add-products/') && method === 'PUT') {
        const uid = decodeURIComponent(p.split('/add-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const current = new Set(state.izteach.permissionsByUid[uid] || []);
        for (const cid of (body.productIds || body.onlineCourses || [])) current.add(String(cid));
        state.izteach.permissionsByUid[uid] = Array.from(current);
        return new Response(JSON.stringify({ ok: true, onlineCourses: state.izteach.permissionsByUid[uid] }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.includes('/prod/user-permission/remove-products/') && method === 'PUT') {
        const uid = decodeURIComponent(p.split('/remove-products/')[1]);
        const body = init.body ? JSON.parse(init.body) : {};
        const toRemove = new Set((body.productIds || body.onlineCourses || []).map(String));
        const current = (state.izteach.permissionsByUid[uid] || []).filter(cid => !toRemove.has(String(cid)));
        state.izteach.permissionsByUid[uid] = current;
        return new Response(JSON.stringify({ ok: true, onlineCourses: current }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.endsWith('/prod/user-permission') && method === 'GET') {
        const uid = urlObj.searchParams.get('userId');
        const courses = state.izteach.permissionsByUid[uid] || [];
        return new Response(JSON.stringify([{
          userId: uid,
          onlineCourses: courses.map(id => ({ _id: id, id }))
        }]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.endsWith('/prod/courses/units') && method === 'GET') {
        const cid = urlObj.searchParams.get('course');
        return new Response(JSON.stringify([
          { _id: '6adadc3b69897b0002482d21', course: cid, title: 'Bài 1', type: 'video', video: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8' }
        ]), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.endsWith('/prod/homework') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const rec = { _id: 'izhw_' + (++state.autoId), ...body };
        state.izteach.homeworkPosts.push(rec);
        return new Response(JSON.stringify(rec), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
      if (p.includes('/signed-url')) {
        return new Response(JSON.stringify({
          url: 'https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/mock-presigned-put'
        }), {
          status: 200,
          headers: { 'content-type': 'application/json' }
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': '2048'
      }
    });
  }

  let workerCode = fs.readFileSync(WORKER_PATH, 'utf8');
  workerCode = workerCode.replace(/export\s+default\s+\{/, 'module.exports = {');

  const sandbox = {
    module: { exports: {} },
    exports: {},
    fetch: mockFetch,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto || crypto.webcrypto,
    TextEncoder,
    TextDecoder,
    atob: globalThis.atob || (str => Buffer.from(str, 'base64').toString('binary')),
    btoa: globalThis.btoa || (str => Buffer.from(str, 'binary').toString('base64')),
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
     Array,
    Object,
    String,
    Number,
    Boolean,
    RegExp,
    Map,
    Set,
    WeakMap,
    Promise,
    Error,
    TypeError,
    Uint8Array
  };

  vm.createContext(sandbox);
  vm.runInContext(workerCode, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  const worker = sandbox.module.exports;

  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-secret-key-2026',
    KTN_STAFF_AND_TEST_PASSWORD: 'TestStrongPassword!2026',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026',
    IZTEACH_VENDOR_ID: '3529cd2b-7af6-4fda-887c-392a79393d6a'
  };

  async function callApi(pathAndQuery, options = {}) {
    const url = pathAndQuery.startsWith('http')
      ? pathAndQuery
      : `https://khongtunhi.com${pathAndQuery.startsWith('/') ? '' : '/'}${pathAndQuery}`;
    const headers = new Headers(options.headers || {});
    let body = options.body;
    if (body && typeof body === 'object' && !(body instanceof Uint8Array) && typeof body !== 'string') {
      body = JSON.stringify(body);
      if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    }
    const req = new Request(url, {
      method: options.method || 'GET',
      headers,
      body
    });
    const pending = [];
    const ctx = { waitUntil: p => pending.push(Promise.resolve(p).catch(() => {})) };
    const res = await worker.fetch(req, env, ctx);
    await Promise.all(pending);
    const text = await res.text();
    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
    return { status: res.status, ok: res.ok, data, text, headers: res.headers };
  }

  function mintSessionToken(payloadOverrides = {}) {
    const payload = {
      id: payloadOverrides.id || 'KTN-E2E-USER',
      email: payloadOverrides.email || 'e2e.hs.a@khongtunhi.com',
      name: payloadOverrides.name || 'E2E User',
      role: payloadOverrides.role || 'student',
      userId: payloadOverrides.userId || '',
      studentId: payloadOverrides.studentId || '',
      classCode: payloadOverrides.classCode ?? null,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 7 * 24 * 3600,
      ...payloadOverrides
    };
    const jsonStr = JSON.stringify(payload);
    const b64 = Buffer.from(jsonStr, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const sig = crypto
      .createHmac('sha256', env.SESSION_HMAC_SECRET)
      .update(b64)
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    return `ktn1.${b64}.${sig}`;
  }

  return { state, callApi, mintSessionToken };
}

async function runBrowserSuite() {
  const { state, callApi, mintSessionToken } = createTestEnvironment();
  const results = [];

  function record(id, description, passed, details = '') {
    results.push({ id, description, passed: Boolean(passed), details });
    const badge = passed ? 'PASS' : 'FAIL';
    console.log(`[${badge}] [GROUP_B] ${id}: ${description}${details ? ' — ' + details : ''}`);
    if (!passed) {
      throw new Error(`Browser E2E test failed: ${id} (${description}) — ${details}`);
    }
  }

  // Create local HTTP server that routes /api/ktn/* to Worker and serves static files
  const server = http.createServer(async (req, res) => {
    try {
      const reqUrl = new URL(req.url, 'http://127.0.0.1');
      if (reqUrl.pathname.startsWith('/api/ktn/')) {
        const chunks = [];
        for await (const chunk of req) chunks.push(chunk);
        const bodyBuf = Buffer.concat(chunks);
        const apiRes = await callApi(reqUrl.pathname + reqUrl.search, {
          method: req.method,
          headers: req.headers,
          body: bodyBuf.length > 0 ? bodyBuf.toString('utf8') : undefined
        });
        res.writeHead(apiRes.status, {
          'content-type': 'application/json; charset=utf-8',
          'access-control-allow-origin': '*',
          'access-control-allow-headers': '*',
          'access-control-allow-methods': 'GET,POST,PATCH,PUT,DELETE,OPTIONS'
        });
        res.end(apiRes.text);
        return;
      }

      let relPath = decodeURIComponent(reqUrl.pathname);
      if (relPath === '/' || relPath === '/custom-page/so-lien-lac-test') {
        relPath = '/sll-hocsinh.html';
      }
      const filePath = path.join(ROOT, relPath.replace(/^\/+/, ''));
      if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
        const ext = path.extname(filePath).toLowerCase();
        res.writeHead(200, { 'content-type': MIME_TYPES[ext] || 'application/octet-stream' });
        res.end(fs.readFileSync(filePath));
        return;
      }
      res.writeHead(404, { 'content-type': 'text/plain' });
      res.end('Not found');
    } catch (err) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message }));
    }
  });

  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const baseUrl = `http://127.0.0.1:${port}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    console.log('================================================================================');
    console.log('KTN BROWSER E2E RELIABILITY SUITE (Group B — Headless Chromium)');
    console.log('================================================================================\n');

    const loginTaPhong = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'taphong2002@gmail.com', password: 'TestStrongPassword!2026', role: 'student' }
    });
    const taPhongToken = loginTaPhong.data.token;

    const loginStudentA = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
    });
    const studentAToken = loginStudentA.data.token;

    const loginTeacherA = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'linh.lam@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
    });
    const teacherAToken = loginTeacherA.data.token;

    const loginAdmin = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'hocvienkhongtunhi123@gmail.com', password: 'AdminStrongPassword!2026', role: 'admin' }
    });
    const adminToken = loginAdmin.data.token;

    async function setupInterceptedPage() {
      const page = await browser.newPage();
      await page.setViewport({ width: 1366, height: 860 });
      await page.setRequestInterception(true);
      page.on('request', req => {
        const u = req.url();
        // Redirect any hardcoded khongtunhi.com or workers.dev /api/ktn/* calls to local server
        if (u.includes('/api/ktn/')) {
          const parsed = new URL(u);
          const localTarget = `${baseUrl}${parsed.pathname}${parsed.search}`;
          if (u !== localTarget) {
            req.continue({ url: localTarget });
            return;
          }
        }
        // Block/stub all external network requests (CDNs, fonts, CloudFront media, S3 PUT) for deterministic offline execution
        if (!u.startsWith(baseUrl) && !u.startsWith('data:') && !u.startsWith('blob:')) {
          req.respond({
            status: 200,
            headers: {
              'Access-Control-Allow-Origin': '*',
              'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
              'Access-Control-Allow-Headers': '*'
            },
            contentType: 'application/json',
            body: '{}'
          });
          return;
        }
        req.continue();
      });
      return page;
    }

    // =========================================================================
    // B1: taphong2002@gmail.com logs in -> NO false 'Lớp YCT2-04' card, and
    //     both 'HSK1 3.0' & 'Chinese For Kids' are entitled and clickable!
    // =========================================================================
    {
      const page = await setupInterceptedPage();
      await page.evaluateOnNewDocument((token) => {
        // Simulate stale localStorage that previously caused the bug (classCode: 'YCT2-04')
        localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify({
          id: 'KTN-2026-TAPHON',
          email: 'taphong2002@gmail.com',
          name: 'Tạ Phong',
          role: 'student',
          roles: ['student'],
          token,
          accessToken: token,
          classCode: 'YCT2-04', // Stale local classCode that MUST be cleared by server sync!
          onlineCourses: [{ id: '6adadba969897b0002482ca5', code: 'HSK1' }]
        }));
      }, taPhongToken);

      await page.goto(`${baseUrl}/sll-hocsinh.html`, { waitUntil: 'domcontentloaded' });
      // Wait for syncLiveStudentProfile() and syncPortalState() to complete
      const b1State = await page.evaluate(async () => {
        await syncLiveStudentProfile();
        await syncPortalState();
        const user = getRealCurrentUser();
        const access = checkUserCourseAccess(user);
        const enrolledIds = access?.enrolledCourseIds || [];
        // Click into Chinese For Kids (middle/online course)
        await enterCourseLearning(0, '65e7704a9ea90c00080d5195');
        const guardEl = document.getElementById('sibling-permission-guard');
        return {
          email: user.email,
          classCode: user.classCode,
          hasLiveClass: user.hasLiveClass,
          serverSynced: user._serverSynced,
          hasHsk1: enrolledIds.includes('6adadba969897b0002482ca5'),
          hasCfk1: enrolledIds.includes('65e7704a9ea90c00080d5195'),
          hasTtte2: enrolledIds.includes('66028938bfd6c90008b816e1'),
          activeCourseAfterClick: typeof activeCourseId !== 'undefined' ? activeCourseId : null,
          guardVisibleAfterClick: guardEl ? guardEl.style.display !== 'none' : false
        };
      });

      record(
        'B1-TAPHON-NO-FALSE-CLASS-AND-COURSE-CLICKABLE',
        'taphong2002@gmail.com syncs classCode=null (no false YCT2-04) and clicks into Chinese For Kids cleanly',
        b1State.email === 'taphong2002@gmail.com' &&
          b1State.classCode === null &&
          b1State.hasLiveClass === false &&
          b1State.serverSynced === true &&
          b1State.hasHsk1 === true &&
          b1State.hasCfk1 === true &&
          b1State.hasTtte2 === false &&
          b1State.activeCourseAfterClick === '65e7704a9ea90c00080d5195' &&
          b1State.guardVisibleAfterClick === false,
        `classCode=${b1State.classCode}, hasCfk1=${b1State.hasCfk1}, activeCourse=${b1State.activeCourseAfterClick}`
      );

      // =======================================================================
      // B3: Revoke 'Chinese For Kids' on server -> Reload browser -> Immediately
      //     removed from student dashboard (no stale localStorage resurrection)
      // =======================================================================
      const revokeRes = await callApi('/api/ktn/students/courses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
        body: {
          email: 'taphong2002@gmail.com',
          action: 'revoke',
          courseIds: ['65e7704a9ea90c00080d5195']
        }
      });

      const pageAfterRevoke = await setupInterceptedPage();
      await pageAfterRevoke.evaluateOnNewDocument((token) => {
        localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify({
          id: 'KTN-2026-TAPHON',
          email: 'taphong2002@gmail.com',
          name: 'Tạ Phong',
          role: 'student',
          roles: ['student'],
          token,
          accessToken: token,
          // Even if localStorage still had CFK1 cached before reload:
          onlineCourses: [
            { id: '6adadba969897b0002482ca5', code: 'HSK1' },
            { id: '65e7704a9ea90c00080d5195', code: 'CFK1' }
          ]
        }));
      }, taPhongToken);
      await pageAfterRevoke.goto(`${baseUrl}/sll-hocsinh.html`, { waitUntil: 'domcontentloaded' });

      const b3State = await pageAfterRevoke.evaluate(async () => {
        await syncLiveStudentProfile();
        await syncPortalState();
        const user = getRealCurrentUser();
        const access = checkUserCourseAccess(user);
        const enrolledIds = access?.enrolledCourseIds || [];
        // Try hash route to revoked course cfk1
        window.location.hash = '#/khoa/cfk1/bai/1';
        await handleStudentHashRoute();
        const guardEl = document.getElementById('sibling-permission-guard');
        return {
          hasCfk1AfterRevoke: enrolledIds.includes('65e7704a9ea90c00080d5195'),
          hasHsk1AfterRevoke: enrolledIds.includes('6adadba969897b00080d5195') || enrolledIds.includes('6adadba969897b0002482ca5'),
          guardVisibleForRevoked: guardEl ? guardEl.style.display === 'block' : false,
          enrolledIds
        };
      });

      record(
        'B3-COURSE-REVOKE-REFLECTED-ON-RELOAD',
        'After server revoke of Chinese For Kids, reload clears stale localStorage and blocks access to revoked course',
        revokeRes.status === 200 &&
          b3State.hasCfk1AfterRevoke === false &&
          b3State.hasHsk1AfterRevoke === true &&
          b3State.guardVisibleForRevoked === true &&
          !b3State.enrolledIds.includes('65e7704a9ea90c00080d5195'),
        `revokeStatus=${revokeRes.status}, hasCfk1AfterRevoke=${b3State.hasCfk1AfterRevoke}, guardVisible=${b3State.guardVisibleForRevoked}`
      );

      await page.close();
      await pageAfterRevoke.close();
    }

    // =========================================================================
    // B2: Unentitled hash route (#/khoa/ttte2/bai/1) is blocked for Student A
    // =========================================================================
    {
      const page = await setupInterceptedPage();
      await page.evaluateOnNewDocument((token) => {
        localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify({
          id: 'KTN-E2E-HSA',
          email: 'e2e.hs.a@khongtunhi.com',
          name: 'Bé An (E2E Lớp A)',
          role: 'student',
          roles: ['student'],
          token,
          accessToken: token,
          classCode: 'YCT2-04',
          onlineCourses: [{ id: '6adadba969897b0002482ca5', code: 'HSK1' }]
        }));
      }, studentAToken);
      await page.goto(`${baseUrl}/sll-hocsinh.html`, { waitUntil: 'domcontentloaded' });

      const b2State = await page.evaluate(async () => {
        await syncLiveStudentProfile();
        await syncPortalState();
        const user = getRealCurrentUser();
        const access = checkUserCourseAccess(user);
        const enrolledIds = access?.enrolledCourseIds || [];
        // Attempt hash navigation to unentitled course TTTE2 (66028938bfd6c90008b816e1)
        window.location.hash = '#/khoa/ttte2/bai/1';
        await handleStudentHashRoute();
        const guardEl = document.getElementById('sibling-permission-guard');
        return {
          canAccessTtte2: enrolledIds.includes('66028938bfd6c90008b816e1'),
          guardVisibleAfterHash: guardEl ? guardEl.style.display === 'block' : false,
          guardText: guardEl ? guardEl.innerText.trim() : ''
        };
      });

      record(
        'B2-UNENTITLED-HASH-ROUTE-BLOCKED',
        'Student without TTTE2 entitlement is blocked from #/khoa/ttte2/bai/1 with sibling permission guard',
        b2State.canAccessTtte2 === false &&
          b2State.guardVisibleAfterHash === true &&
          b2State.guardText.includes('chưa được cấp'),
        `canAccessTtte2=${b2State.canAccessTtte2}, guardVisible=${b2State.guardVisibleAfterHash}`
      );

      // =======================================================================
      // B4: Student A submits live-class homework in YCT2-04 -> Teacher grades
      //     9.5/10 -> Student reloads and sees 9.5/10 + feedback in UI
      // =======================================================================
      const b4SubmitState = await page.evaluate(async () => {
        await renderStudentClassSessions('YCT2-04', 1);
        window.__classExDrafts = window.__classExDrafts || {};
        const blob = new Blob(['mock-audio-content'], { type: 'audio/webm' });
        const file = new File([blob], 'bai-doc-trang-8.webm', { type: 'audio/webm' });
        window.__classExDrafts['YCT2-04_1_1'] = {
          recording: false,
          submitting: false,
          timer: null,
          secs: 7,
          voiceFile: file,
          attachFile: null
        };
        await submitClassSessionExercise('YCT2-04', 1, 1, 'Bài 1: Thu âm đọc to 5 câu hội thoại trang 8');
        const localSaved = JSON.parse(localStorage.getItem('ktn_local_submitted_homeworks') || '[]');
        const myHw = localSaved.find(h => h.class_code === 'YCT2-04' && Number(h.lesson_num) === 101);
        const errEl = document.getElementById('err-class-submit-YCT2-04_1_1');
        return {
          submitted: Boolean(myHw),
          homeworkId: myHw?.id || null,
          errVisible: errEl ? errEl.style.display === 'block' : false,
          errText: errEl ? errEl.innerText : ''
        };
      });

      // Teacher grades the homework on the server
      const gradeRes = await callApi('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${teacherAToken}` },
        body: {
          id: b4SubmitState.homeworkId,
          score: 9.5,
          feedback: 'Con đọc rất to và chuẩn thanh điệu!'
        }
      });

      // Student re-syncs contact book from server
      const b4AfterGrade = await page.evaluate(async () => {
        await loadStudentContactBook();
        const hwBox = document.getElementById('student-homework-list');
        return {
          hwHtml: hwBox ? hwBox.innerHTML : ''
        };
      });

      record(
        'B4-STUDENT-SUBMIT-AND-TEACHER-GRADE-E2E-UI',
        'Student submits YCT2-04 class task without false error, teacher grades 9.5/10, and student UI updates to 9.5/10 with feedback',
        b4SubmitState.submitted === true &&
          b4SubmitState.errVisible === false &&
          gradeRes.status === 200 &&
          b4AfterGrade.hwHtml.includes('9.5/10') &&
          b4AfterGrade.hwHtml.includes('Con đọc rất to và chuẩn thanh điệu!'),
        `submitted=${b4SubmitState.submitted}, errVisible=${b4SubmitState.errVisible}, errText="${b4SubmitState.errText}", gradeStatus=${gradeRes.status}`
      );

      // =======================================================================
      // B5: Student logs out -> Server revokes token, localStorage cleared,
      //     subsequent API call with old token returns 401
      // =======================================================================
      const b5Logout = await page.evaluate(async () => {
        const res = await window.KtnWebApp.logout({ redirect: false });
        return {
          logoutResult: res,
          persistentAuth: localStorage.getItem('ktn_sll_persistent_auth_v2'),
          pendingRevoke: localStorage.getItem('ktn_pending_revoke_token')
        };
      });

      const verifyRevokedRes = await callApi('/api/ktn/students/me', {
        headers: { Authorization: `Bearer ${studentAToken}` }
      });

      record(
        'B5-LOGOUT-REVOKES-TOKEN-AND-CLEARS-BROWSER-STORAGE',
        'Student logout clears localStorage session + pending_revoke_token and revokes token on server (401 on reuse)',
        b5Logout.logoutResult?.serverRevoked === true &&
          b5Logout.persistentAuth === null &&
          b5Logout.pendingRevoke === null &&
          verifyRevokedRes.status === 401,
        `serverRevoked=${b5Logout.logoutResult?.serverRevoked}, persistentAuth=${b5Logout.persistentAuth}, reuseStatus=${verifyRevokedRes.status}`
      );

      await page.close();
    }

    console.log('\n================================================================================');
    console.log(`SUMMARY: ${results.length}/${results.length} BROWSER E2E TESTS PASSED (100% PASS)`);
    console.log('================================================================================');
  } finally {
    await browser.close();
    server.close();
  }
}

runBrowserSuite().catch(err => {
  console.error('\n[BROWSER SUITE FAILED]', err);
  process.exit(1);
});
