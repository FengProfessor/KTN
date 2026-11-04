/**
 * KTN THREE-WAY SYNC, SECURITY & PRODUCTION RELIABILITY SUITE (Groups A, C, D)
 * Runs deterministically in-process against cloudflare-worker-sw-proxy.js with
 * stateful mock Supabase + izTeach backends and failure injection hooks.
 *
 * Usage: node tests/ktn_three_way_reliability_suite.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

function loadWorkerInstance() {
  const code = fs.readFileSync(path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js'), 'utf8');
  const transformed = code.replace(/export\s+default\s+\{/, 'module.exports = {');

  const state = {
    tables: {
      ktn_students: [
        {
          code: 'HS-E2E-A',
          name: 'Học Sinh E2E A',
          email: 'e2e.hs.a@khongtunhi.com',
          phone: '0900000001',
          class_code: 'YCT2-04',
          cognito_user_id: '11111111-2222-3333-4444-555555555551',
          izteach_student_id: '660000000000000000000001',
          online_courses: [{ id: '6adadba969897b0002482ca5', title: 'HSK1 3.0' }],
          updated_at: new Date().toISOString()
        },
        {
          code: 'HS-E2E-B',
          name: 'Học Sinh E2E B',
          email: 'e2e.hs.b@khongtunhi.com',
          phone: '0900000002',
          class_code: 'YCT3-02',
          cognito_user_id: '11111111-2222-3333-4444-555555555552',
          izteach_student_id: '660000000000000000000002',
          online_courses: [{ id: '65e7704a9ea90c00080d5195', title: 'Chinese For Kids' }],
          updated_at: new Date().toISOString()
        },
        {
          code: 'KTN-2026-TAPHON',
          name: 'Tạ Phong Võ',
          email: 'taphong2002@gmail.com',
          phone: '0900000003',
          class_code: null,
          cognito_user_id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
          izteach_student_id: '6abb2c0b8b46e30002add37b',
          online_courses: [
            { id: '6adadba969897b0002482ca5', title: 'HSK1 3.0' },
            { id: '65e7704a9ea90c00080d5195', title: 'Chinese For Kids' }
          ],
          updated_at: new Date().toISOString()
        }
      ],
      ktn_teachers: [
        {
          code: 'GV-KTN-08',
          name: 'Cô Lâm Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          assigned_classes: ['YCT2-04', 'YCT1-01'],
          active: true,
          status: 'active',
          updated_at: new Date().toISOString()
        },
        {
          code: 'GV-KTN-03',
          name: 'Cô Trần Thu Hà',
          email: 'thu.ha@khongtunhi.com',
          assigned_classes: ['YCT3-02'],
          active: true,
          status: 'active',
          updated_at: new Date().toISOString()
        }
      ],
      ktn_classes: [
        {
          id: 'YCT2-04',
          name: 'Lớp YCT2-04',
          teacher_code: 'GV-KTN-08',
          teacher_name: 'Cô Lâm Mỹ Linh',
          teacher_email: 'linh.lam@khongtunhi.com',
          schedule: '19:30 Thứ 3 & Thứ 6',
          total_lessons: 25,
          active: true,
          updated_at: new Date().toISOString()
        },
        {
          id: 'YCT3-02',
          name: 'Lớp YCT3-02',
          teacher_code: 'GV-KTN-03',
          teacher_name: 'Cô Trần Thu Hà',
          teacher_email: 'thu.ha@khongtunhi.com',
          schedule: '18:00 Thứ 4 & Chủ Nhật',
          total_lessons: 25,
          active: true,
          updated_at: new Date().toISOString()
        }
      ],
      ktn_class_sessions: [],
      ktn_homeworks: [],
      ktn_messages: [],
      ktn_notifications: [],
      ktn_dlp_alerts: [],
      ktn_orders: [],
      ktn_push_subscriptions: []
    },
    izteach: {
      permissionsByUid: {
        '11111111-2222-3333-4444-555555555551': ['6adadba969897b0002482ca5'],
        '11111111-2222-3333-4444-555555555552': ['65e7704a9ea90c00080d5195'],
        'bc21991c-ce9b-465d-b85f-dbb1821e51a9': ['6adadba969897b0002482ca5', '65e7704a9ea90c00080d5195']
      },
      homeworkPosts: [],
      unitsByCourse: {
        '6adadba969897b00080d5195': [],
        '6adadba969897b0002482ca5': [
          { _id: '6adb27370ae64c00025de049', title: 'Bài 1: 你好', type: 'video', index: 0, video: 'vid-hsk1-1' },
          { _id: '6adb30510ae64c00025de0cd', title: 'Bài tập Bài 1', type: 'homework', index: 1 }
        ],
        '65e7704a9ea90c00080d5195': [
          { _id: '65e7dc7f8a1ca2000816c35a', title: 'Lesson 1', type: 'video', index: 0, video: 'vid-cfk-1' },
          { _id: '65fc39bd42c24000085d87e2', title: 'Homework 1', type: 'homework', index: 1 }
        ],
        '66028938bfd6c90008b816e1': [
          { _id: '66029086bfd6c90008b8175a', title: 'Bài 1 TTTE2', type: 'video', index: 0, video: 'vid-ttte2-1' }
        ]
      }
    },
    faults: {
      izteachHomeworkFail: false,
      izteachPermissionMutateFail: false,
      izteachPermissionSkipVerifyMutation: false,
      supabaseFailOnTable: null,
      supabaseFailMethod: null
    }
  };

  function matchQueryFilters(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        const anyMatch = clauses.some(c => {
          const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|ilike)\.(.+)$/);
          if (!m) return true;
          const [, col, op, v] = m;
          const cell = String(row[col] ?? '');
          return op === 'ilike' ? cell.toLowerCase() === v.toLowerCase() : cell === v;
        });
        if (!anyMatch) return false;
        continue;
      }
      if (rawVal.startsWith('eq.')) {
        const target = rawVal.slice(3);
        if (String(row[k] ?? '') !== target) return false;
      } else if (rawVal.startsWith('ilike.')) {
        const target = rawVal.slice(6).toLowerCase();
        if (String(row[k] ?? '').toLowerCase() !== target) return false;
      } else if (rawVal.startsWith('in.(')) {
        const list = rawVal.slice(4, -1).split(',').map(s => s.replace(/^"|"$/g, ''));
        if (!list.includes(String(row[k] ?? ''))) return false;
      }
    }
    return true;
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init.method || 'GET').toUpperCase();
    const u = new URL(urlStr);

    // 1. Mock Supabase REST
    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      if (
        state.faults.supabaseFailOnTable === table &&
        (!state.faults.supabaseFailMethod || state.faults.supabaseFailMethod === method)
      ) {
        return new Response(JSON.stringify({ message: 'Simulated Supabase outage' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      const rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        let matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        const limit = Number(u.searchParams.get('limit') || 0);
        if (limit > 0) matched = matched.slice(0, limit);
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(body) ? body : [body];
        const onConflict = u.searchParams.get('on_conflict');
        const out = [];
        for (const item of items) {
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map(s => s.trim());
            existingIdx = rows.findIndex(r => keys.every(k => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase()));
          } else if (item.id) {
            existingIdx = rows.findIndex(r => r.id === item.id);
          }
          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item };
            out.push(rows[existingIdx]);
          } else {
            const created = {
              id: item.id || ('SB-' + (rows.length + 1) + '-' + Date.now()),
              created_at: item.created_at || new Date().toISOString(),
              updated_at: item.updated_at || new Date().toISOString(),
              ...item
            };
            rows.unshift(created);
            out.push(created);
          }
        }
        return new Response(JSON.stringify(out), {
          status: 201,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'PATCH') {
        const patch = init.body ? JSON.parse(init.body) : {};
        const matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        matched.forEach(r => Object.assign(r, patch));
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'DELETE') {
        const keep = rows.filter(r => !matchQueryFilters(r, u.searchParams));
        state.tables[table] = keep;
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    // 2. Mock izTeach Auth & API
    if (u.hostname.includes('amazonaws.com')) {
      if (u.pathname.endsWith('/signin')) {
        const body = init.body ? JSON.parse(init.body) : {};
        const email = String(body.email || '').toLowerCase();
        const decodedPwd = body.password ? Buffer.from(body.password, 'base64').toString('utf8') : '';
        if (email === 'hocvienkhongtunhi123@gmail.com' && decodedPwd === 'AdminStrongPassword!2026' && !u.pathname.includes('/student/')) {
          return new Response(JSON.stringify({
            accessToken: 'mock-admin-izteach-jwt',
            id: '2c01e488-d866-4341-a0db-644fe6ba1202',
            userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
            email,
            roles: ['root', 'admin'],
            type: 'admin'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (email === 'taphong2002@gmail.com' && decodedPwd === 'TestStrongPassword!2026' && u.pathname.includes('/student/')) {
          return new Response(JSON.stringify({
            accessToken: 'mock-student-taphong-jwt',
            id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
            userId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
            studentId: '6abb2c0b8b46e30002add37b',
            email,
            name: 'Tạ Phong Võ',
            roles: ['student'],
            type: 'student'
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ message: 'Invalid credentials' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.includes('/prod/homework')) {
        if (state.faults.izteachHomeworkFail) {
          return new Response(JSON.stringify({ message: 'izTeach Homework Service Unavailable' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (method === 'POST') {
          const body = init.body ? JSON.parse(init.body) : {};
          const rec = {
            _id: '66fa0000000000000000' + String(state.izteach.homeworkPosts.length + 1).padStart(4, '0'),
            ...body,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };
          state.izteach.homeworkPosts.push(rec);
          return new Response(JSON.stringify(rec), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify(state.izteach.homeworkPosts), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.includes('/prod/user-permission/add-products/')) {
        if (state.faults.izteachPermissionMutateFail) {
          return new Response(JSON.stringify({ message: 'izTeach add-products 500' }), { status: 500 });
        }
        const uid = decodeURIComponent(u.pathname.split('/').pop());
        const body = init.body ? JSON.parse(init.body) : {};
        if (!state.faults.izteachPermissionSkipVerifyMutation) {
          const cur = new Set(state.izteach.permissionsByUid[uid] || []);
          (body.productIds || []).forEach(id => cur.add(id));
          state.izteach.permissionsByUid[uid] = Array.from(cur);
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.includes('/prod/user-permission/remove-products/')) {
        if (state.faults.izteachPermissionMutateFail) {
          return new Response(JSON.stringify({ message: 'izTeach remove-products 500' }), { status: 500 });
        }
        const uid = decodeURIComponent(u.pathname.split('/').pop());
        const body = init.body ? JSON.parse(init.body) : {};
        if (!state.faults.izteachPermissionSkipVerifyMutation) {
          const removeSet = new Set(body.productIds || []);
          state.izteach.permissionsByUid[uid] = (state.izteach.permissionsByUid[uid] || []).filter(id => !removeSet.has(id));
        }
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.endsWith('/prod/user-permission')) {
        const uid = u.searchParams.get('userId') || '';
        const pids = state.izteach.permissionsByUid[uid] || [];
        return new Response(JSON.stringify([
          {
            userId: uid,
            vendorId: '3529cd2b-7af6-4fda-887c-392a79393d6a',
            onlineCourses: pids.map(id => ({ id }))
          }
        ]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.endsWith('/prod/student')) {
        const email = (u.searchParams.get('email') || '').toLowerCase();
        const hit = state.tables.ktn_students.find(s => s.email.toLowerCase() === email);
        if (hit && hit.cognito_user_id) {
          return new Response(JSON.stringify([{
            _id: hit.izteach_student_id || '660000000000000000000099',
            userId: hit.cognito_user_id,
            email: hit.email,
            onlineCourses: hit.online_courses || []
          }]), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.endsWith('/prod/unit')) {
        const cid = u.searchParams.get('course') || '';
        const units = state.izteach.unitsByCourse[cid] || [
          { _id: '660000000000000000000101', title: 'Bài 1', type: 'video', index: 0, video: 'vid-generic-1' }
        ];
        return new Response(JSON.stringify(units), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
    }

    if (u.hostname === 'd21acfi38wn3iy.cloudfront.net') {
      return new Response('', {
        status: 200,
        headers: {
          'Content-Type': 'audio/wav',
          'Content-Length': '8192'
        }
      });
    }

    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

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
    atob: str => Buffer.from(str, 'base64').toString('binary'),
    btoa: bin => Buffer.from(bin, 'binary').toString('base64'),
    Uint8Array,
    ArrayBuffer,
    DecompressionStream: globalThis.DecompressionStream,
    console,
    setTimeout,
    clearTimeout,
    Date,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Array,
    Object,
    Set,
    Map,
    RegExp,
    Error,
    Promise,
    encodeURIComponent,
    decodeURIComponent
  };

  vm.runInNewContext(transformed, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  const worker = sandbox.module.exports;

  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-secret-key-2026',
    KTN_STAFF_AND_TEST_PASSWORD: 'TestStrongPassword!2026',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026'
  };

  async function callApi(pathAndQuery, opts = {}) {
    const req = new Request('https://khongtunhi.com' + pathAndQuery, {
      method: opts.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.headers || {})
      },
      body: opts.body && typeof opts.body === 'object' ? JSON.stringify(opts.body) : opts.body
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, headers: res.headers, data };
  }

  return { worker, state, env, callApi };
}

async function runSuite() {
  const results = [];
  function record(id, group, name, passed, detail = '') {
    results.push({ id, group, name, passed, detail });
    const icon = passed ? 'PASS' : 'FAIL';
    console.log(`[${icon}] [${group}] ${id}: ${name}${detail ? ' — ' + detail : ''}`);
    if (!passed) {
      throw new Error(`Test failed: ${id} (${name}) — ${detail}`);
    }
  }

  console.log('================================================================================');
  console.log('KTN THREE-WAY SYNC, SECURITY & RELIABILITY TEST SUITE (Groups A, C, D)');
  console.log('================================================================================\n');

  // ============================================================================
  // GROUP A1: 17-COURSE / 346-LESSON CURRICULUM & UNIT MAP INTEGRITY
  // ============================================================================
  {
    const hsk1Lessons = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'clean_lessons_data.json'), 'utf8'));
    const allCourses = JSON.parse(fs.readFileSync(path.join(ROOT_DIR, 'all_courses_lessons_data.json'), 'utf8'));
    const courseIds = ['6adadba969897b0002482ca5', ...Object.keys(allCourses)];
    assert.strictEqual(courseIds.length, 17, 'Must have exactly 17 courses');

    const seenUnitIds = new Set();
    let totalLessons = 0;
    let fabricatedCount = 0;
    let missingStreamCount = 0;

    const inspectLesson = (cid, l) => {
      totalLessons++;
      const p0 = (l.parts && l.parts[0]) || {};
      const uid = p0.unitId;
      assert.ok(/^[0-9a-f]{24}$/i.test(uid), `Invalid unitId ${uid} in course ${cid} lesson ${l.num}`);
      assert.ok(!seenUnitIds.has(uid), `Duplicate unitId ${uid} across curriculum`);
      seenUnitIds.add(uid);
      if (!p0.streamUrl || !p0.streamUrl.includes('.m3u8')) missingStreamCount++;
      if (l.vocab || l.quiz || l.exercises || l.listeningJudge || l.listeningChoose || l.readingMatch || l.writingPrompts) fabricatedCount++;
    };

    hsk1Lessons.forEach(l => inspectLesson('6adadba969897b0002482ca5', l));
    for (const [cid, list] of Object.entries(allCourses)) {
      list.forEach(l => inspectLesson(cid, l));
    }

    record(
      'A1-CURRICULUM-346',
      'GROUP_A',
      '17 courses / 346 lessons unique 24-hex unitIds, 100% HLS streams, 0 fabricated exercises',
      totalLessons === 346 && seenUnitIds.size === 346 && fabricatedCount === 0 && missingStreamCount === 0,
      `courses=${courseIds.length}, lessons=${totalLessons}, uniqueUnits=${seenUnitIds.size}, fabricated=${fabricatedCount}`
    );
  }

  const { state, callApi } = loadWorkerInstance();

  // Authenticate all test actors
  const loginAdmin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'hocvienkhongtunhi123@gmail.com', password: 'AdminStrongPassword!2026', role: 'admin' }
  });
  assert.strictEqual(loginAdmin.status, 200);
  const adminToken = loginAdmin.data.token;

  const loginTeacherA = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'linh.lam@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  assert.strictEqual(loginTeacherA.status, 200);
  const teacherAToken = loginTeacherA.data.token;

  const loginTeacherB = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'thu.ha@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  assert.strictEqual(loginTeacherB.status, 200);
  const teacherBToken = loginTeacherB.data.token;

  const loginStudentA = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  assert.strictEqual(loginStudentA.status, 200);
  const studentAToken = loginStudentA.data.token;

  const loginStudentB = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.b@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  assert.strictEqual(loginStudentB.status, 200);
  const studentBToken = loginStudentB.data.token;

  const loginTaPhong = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'taphong2002@gmail.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  assert.strictEqual(loginTaPhong.status, 200);
  const taPhongToken = loginTaPhong.data.token;

  const CDN_HW_A = 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/e2e_hs_a_khongtunhi_com';
  const CDN_HW_B = 'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/e2e_hs_b_khongtunhi_com';

  // ============================================================================
  // GROUP A2: HOMEWORK SUBMISSION ROUTING & LIVE-CLASS ISOLATION
  // ============================================================================
  {
    const izPostsBefore = state.izteach.homeworkPosts.length;

    // 1. Live class submission must NOT mirror to izTeach or HSK1
    const liveHwRes = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        classCode: 'YCT2-04',
        courseId: 'CLASS_YCT2-04',
        lessonNum: 101,
        lessonTitle: 'Lớp YCT2-04 · Buổi 1',
        fileUrl: `${CDN_HW_A}/live-class-b1.wav`,
        fileType: 'audio/wav',
        studentNote: 'Em nộp bài buổi 1 lớp YCT2-04'
      }
    });
    const izPostsAfterLive = state.izteach.homeworkPosts.length;
    record(
      'A2-LIVE-CLASS-NO-HSK1-LEAK',
      'GROUP_A',
      'Live-class homework (CLASS_YCT2-04) saves to Supabase with syncStatus=not_applicable_live_class and 0 izTeach posts',
      liveHwRes.status === 200 &&
        liveHwRes.data?.syncStatus === 'not_applicable_live_class' &&
        liveHwRes.data?.mirroredToIzTeach === false &&
        izPostsAfterLive === izPostsBefore,
      `status=${liveHwRes.status}, syncStatus=${liveHwRes.data?.syncStatus}, izPostsDelta=${izPostsAfterLive - izPostsBefore}`
    );

    // 2. Non-HSK1 online course (Chinese For Kids = 65e7704a9ea90c00080d5195, Lesson 3 -> unit 65fc3aa45f2c0b000803ba10)
    const cfkHwRes = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentBToken}` },
      body: {
        courseId: '65e7704a9ea90c00080d5195',
        lessonNum: 3,
        lessonTitle: 'Chinese For Kids 1 · Bài 3',
        fileUrl: `${CDN_HW_B}/cfk-l3.wav`,
        fileType: 'audio/wav',
        studentNote: 'Em nộp bài 3 khóa CFK1'
      }
    });
    const lastIzPost = state.izteach.homeworkPosts[state.izteach.homeworkPosts.length - 1];
    record(
      'A2-CFK-EXACT-UNIT-MAPPING',
      'GROUP_A',
      'Non-HSK1 course homework (CFK1 Lesson 3) maps to exact CFK1 unitId 663e2cb6d87762000820b409 on izTeach',
      cfkHwRes.status === 200 &&
        cfkHwRes.data?.syncStatus === 'synced' &&
        cfkHwRes.data?.unitId === '663e2cb6d87762000820b409' &&
        lastIzPost?.course === '65e7704a9ea90c00080d5195' &&
        lastIzPost?.unit === '663e2cb6d87762000820b409',
      `course=${lastIzPost?.course}, unit=${lastIzPost?.unit}`
    );

    // 3. Student A (only owns HSK1) tries to submit to CFK1 -> 403 COURSE_NOT_ENTITLED
    const unentitledHwRes = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '65e7704a9ea90c00080d5195',
        lessonNum: 1,
        fileUrl: `${CDN_HW_A}/unauth.wav`
      }
    });
    record(
      'A2-BLOCK-UNENTITLED-COURSE-SUBMIT',
      'GROUP_A',
      'Student without course entitlement cannot submit homework to that course (403 COURSE_NOT_ENTITLED)',
      unentitledHwRes.status === 403 && unentitledHwRes.data?.error === 'COURSE_NOT_ENTITLED',
      `status=${unentitledHwRes.status}, error=${unentitledHwRes.data?.error}`
    );

    // 4. Cross-course unitId mismatch -> 400 UNIT_COURSE_MISMATCH
    const mismatchUnitRes = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentBToken}` },
      body: {
        courseId: '65e7704a9ea90c00080d5195',
        unitId: '6adadbcaf75fe5000247ca71', // HSK1 Lesson 1 unitId!
        lessonNum: 1,
        fileUrl: `${CDN_HW_B}/mismatch.wav`
      }
    });
    record(
      'A2-BLOCK-CROSS-COURSE-UNIT-MISMATCH',
      'GROUP_A',
      'Submitting a homework with an HSK1 unitId to CFK1 is rejected with 400 UNIT_COURSE_MISMATCH',
      mismatchUnitRes.status === 400 && mismatchUnitRes.data?.error === 'UNIT_COURSE_MISMATCH',
      `status=${mismatchUnitRes.status}, error=${mismatchUnitRes.data?.error}`
    );

    // 5. Unmapped lesson number (e.g. Lesson 49 of HSK1, which only has 15 lessons) -> saved in Supabase with syncStatus=mapping_required, 0 izTeach posts
    const beforeUnmappedPosts = state.izteach.homeworkPosts.length;
    const unmappedLessonRes = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 49,
        fileUrl: `${CDN_HW_A}/hsk1-l49.wav`
      }
    });
    record(
      'A2-UNMAPPED-LESSON-NO-FALLBACK',
      'GROUP_A',
      'Unmapped lesson number sets syncStatus=mapping_required and never guesses or falls back to Lesson 1 on izTeach',
      unmappedLessonRes.status === 200 &&
        unmappedLessonRes.data?.syncStatus === 'mapping_required' &&
        unmappedLessonRes.data?.mirroredToIzTeach === false &&
        state.izteach.homeworkPosts.length === beforeUnmappedPosts,
      `syncStatus=${unmappedLessonRes.data?.syncStatus}`
    );
  }

  // ============================================================================
  // GROUP A3: IDEMPOTENCY, GRADING & RESUBMISSION VERSION HISTORY
  // ============================================================================
  {
    const submit1 = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 2,
        lessonTitle: 'HSK1 3.0 · Bài 2',
        fileUrl: `${CDN_HW_A}/hsk1-l2-v1.wav`,
        fileType: 'audio/wav',
        studentNote: 'Lần nộp 1 Bài 2'
      }
    });
    assert.strictEqual(submit1.status, 200);
    const hwId = submit1.data.homework.id;
    const postsAfterSubmit1 = state.izteach.homeworkPosts.length;

    // Duplicate double-click submit with identical payload
    const submit1Replay = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 2,
        lessonTitle: 'HSK1 3.0 · Bài 2',
        fileUrl: `${CDN_HW_A}/hsk1-l2-v1.wav`,
        fileType: 'audio/wav',
        studentNote: 'Lần nộp 1 Bài 2'
      }
    });
    record(
      'A3-SUBMIT-IDEMPOTENCY',
      'GROUP_A',
      'Double-click homework submission returns idempotentReplay=true without duplicate izTeach post',
      submit1Replay.status === 200 &&
        submit1Replay.data?.idempotentReplay === true &&
        state.izteach.homeworkPosts.length === postsAfterSubmit1,
      `idempotentReplay=${submit1Replay.data?.idempotentReplay}`
    );

    // Teacher A grades Lesson 2
    const grade1 = await callApi('/api/ktn/homeworks/grade', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        id: hwId,
        score: 9.5,
        status: 'graded',
        teacherFeedback: 'Con đọc Bài 2 rất rõ ràng!'
      }
    });
    const postsAfterGrade1 = state.izteach.homeworkPosts.length;
    record(
      'A3-TEACHER-GRADE-SYNC',
      'GROUP_A',
      'Teacher grading updates Supabase and mirrors approved record to exact unit 6adadc3b69897b0002482d22 on izTeach',
      grade1.status === 200 &&
        grade1.data?.syncStatus === 'synced' &&
        grade1.data?.homework?.status === 'graded' &&
        grade1.data?.homework?.score === 9.5 &&
        state.izteach.homeworkPosts[postsAfterGrade1 - 1]?.unit === '6adadc3b69897b0002482d22' &&
        state.izteach.homeworkPosts[postsAfterGrade1 - 1]?.state === 'approved',
      `score=${grade1.data?.homework?.score}, syncStatus=${grade1.data?.syncStatus}`
    );

    // Duplicate double-click grade with identical score & feedback
    const grade1Replay = await callApi('/api/ktn/homeworks/grade', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        id: hwId,
        score: 9.5,
        status: 'graded',
        teacherFeedback: 'Con đọc Bài 2 rất rõ ràng!'
      }
    });
    record(
      'A3-GRADE-IDEMPOTENCY',
      'GROUP_A',
      'Double-click teacher grading returns idempotentReplay=true without duplicate izTeach post',
      grade1Replay.status === 200 &&
        grade1Replay.data?.idempotentReplay === true &&
        state.izteach.homeworkPosts.length === postsAfterGrade1,
      `idempotentReplay=${grade1Replay.data?.idempotentReplay}`
    );

    // Student A resubmits Lesson 2 after grading -> archives prior graded version in _history and resets status to pending
    const resubmit2 = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 2,
        lessonTitle: 'HSK1 3.0 · Bài 2',
        fileUrl: `${CDN_HW_A}/hsk1-l2-v2-resubmit.wav`,
        fileType: 'audio/wav',
        studentNote: 'Em nộp lại Bài 2 bản thu mới'
      }
    });
    const updatedRow = resubmit2.data?.homework;
    const historyArr = updatedRow?.workbook_answers?._history || [];
    const syncMeta = updatedRow?.workbook_answers?._syncMeta || {};
    record(
      'A3-RESUBMIT-VERSION-HISTORY',
      'GROUP_A',
      'Resubmitting after grading archives graded v1 in _history, increments submissionCount=2, and resets status=pending for teacher',
      resubmit2.status === 200 &&
        updatedRow?.status === 'pending' &&
        updatedRow?.score === null &&
        historyArr.length === 1 &&
        historyArr[0].status === 'graded' &&
        historyArr[0].score === 9.5 &&
        syncMeta.submissionCount === 2,
      `status=${updatedRow?.status}, historyLen=${historyArr.length}, prevScore=${historyArr[0]?.score}, submissionCount=${syncMeta.submissionCount}`
    );
  }

  // ============================================================================
  // GROUP A4: COURSE ENTITLEMENT GRANT & REVOKE VERIFICATION
  // ============================================================================
  {
    const TTTE2_ID = '66028938bfd6c90008b816e1';

    // 1. Grant TTTE2 to Student A
    const grantRes = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'e2e.hs.a@khongtunhi.com',
        action: 'grant',
        courseIds: [TTTE2_ID]
      }
    });
    const izPermsAfterGrant = state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555551'] || [];
    const sbCoursesAfterGrant = (grantRes.data?.student?.online_courses || []).map(c => c.id);
    record(
      'A4-COURSE-GRANT-THREE-WAY',
      'GROUP_A',
      'Granting course updates izTeach permissions, verifies read-after-write, and updates Supabase online_courses',
      grantRes.status === 200 &&
        grantRes.data?.ok === true &&
        grantRes.data?.syncStatus === 'synced' &&
        izPermsAfterGrant.includes(TTTE2_ID) &&
        sbCoursesAfterGrant.includes(TTTE2_ID),
      `izPerms=${JSON.stringify(izPermsAfterGrant)}, sbCourses=${JSON.stringify(sbCoursesAfterGrant)}`
    );

    // 2. Verify Student A can now fetch TTTE2 units
    const unitsAllowedRes = await callApi(`/api/ktn/courses/units?courseId=${TTTE2_ID}`, {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });
    record(
      'A4-UNITS-ALLOWED-WHEN-ENTITLED',
      'GROUP_A',
      'Entitled student can fetch /api/ktn/courses/units for granted course',
      unitsAllowedRes.status === 200 && Array.isArray(unitsAllowedRes.data?.units) && unitsAllowedRes.data.units.length > 0,
      `status=${unitsAllowedRes.status}, units=${unitsAllowedRes.data?.units?.length}`
    );

    // 3. Revoke TTTE2 from Student A
    const revokeRes = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'e2e.hs.a@khongtunhi.com',
        action: 'revoke',
        courseIds: [TTTE2_ID]
      }
    });
    const izPermsAfterRevoke = state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555551'] || [];
    const sbCoursesAfterRevoke = (revokeRes.data?.student?.online_courses || []).map(c => c.id);
    record(
      'A4-COURSE-REVOKE-THREE-WAY',
      'GROUP_A',
      'Revoking course removes product on izTeach, verifies read-after-write, and removes from Supabase online_courses',
      revokeRes.status === 200 &&
        revokeRes.data?.ok === true &&
        revokeRes.data?.syncStatus === 'synced' &&
        !izPermsAfterRevoke.includes(TTTE2_ID) &&
        !sbCoursesAfterRevoke.includes(TTTE2_ID) &&
        sbCoursesAfterRevoke.includes('6adadba969897b0002482ca5'),
      `izPerms=${JSON.stringify(izPermsAfterRevoke)}, sbCourses=${JSON.stringify(sbCoursesAfterRevoke)}`
    );

    // 4. Verify Student A is immediately blocked from TTTE2 units and homework submission after revoke
    const unitsBlockedAfterRevoke = await callApi(`/api/ktn/courses/units?courseId=${TTTE2_ID}`, {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });
    const hwBlockedAfterRevoke = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: TTTE2_ID,
        lessonNum: 1,
        fileUrl: `${CDN_HW_A}/revoked-course.wav`
      }
    });
    record(
      'A4-REVOKED-COURSE-IMMEDIATE-ENFORCEMENT',
      'GROUP_A',
      'After course revoke, student is immediately blocked from /api/ktn/courses/units (403) and /api/ktn/homeworks (403)',
      unitsBlockedAfterRevoke.status === 403 && hwBlockedAfterRevoke.status === 403,
      `unitsStatus=${unitsBlockedAfterRevoke.status}, hwStatus=${hwBlockedAfterRevoke.status}`
    );

    // 5. Revoke when student has no Cognito UID must NOT return skipped:true as 200 OK
    const noUidRevokeRes = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'unlinked.student@khongtunhi.com',
        action: 'revoke',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    record(
      'A4-NO-SKIPPED-TRUE-FALSE-SUCCESS',
      'GROUP_A',
      'Revoking course for unlinked account without Cognito UID returns 502 sync_failed (never treats skipped as success)',
      noUidRevokeRes.status === 502 &&
        noUidRevokeRes.data?.ok === false &&
        noUidRevokeRes.data?.syncStatus === 'sync_failed',
      `status=${noUidRevokeRes.status}, syncStatus=${noUidRevokeRes.data?.syncStatus}`
    );
  }

  // ============================================================================
  // GROUP A5: AUTHENTICATION, LOGOUT REVOCATION & TEACHER/STUDENT RBAC
  // ============================================================================
  {
    // 1. Forged token & legacy password
    const forgedRes = await callApi('/api/ktn/auth/session', {
      headers: { Authorization: 'Bearer forged.token.sig', 'X-KTN-User-Email': 'hocvienkhongtunhi123@gmail.com' }
    });
    const legacyLoginRes = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'e2e.hs.a@khongtunhi.com', password: ['123', '456'].join(''), role: 'student' }
    });
    record(
      'A5-FORGED-TOKEN-AND-LEGACY-PWD-BLOCKED',
      'GROUP_A',
      'Forged token and legacy password (123456) both return 401',
      forgedRes.status === 401 && legacyLoginRes.status === 401,
      `forged=${forgedRes.status}, legacyPwd=${legacyLoginRes.status}`
    );

    // 2. Teacher RBAC boundaries
    const teacherCreateClass = await callApi('/api/ktn/classes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: { id: 'HACK-99', name: 'Unauthorized Class' }
    });
    const teacherChangeOwner = await callApi('/api/ktn/classes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: { id: 'YCT2-04', name: 'Lớp YCT2-04', teacherEmail: 'thu.ha@khongtunhi.com', teacherCode: 'GV-KTN-03' }
    });
    const teacherGrantCourse = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: { email: 'e2e.hs.a@khongtunhi.com', action: 'grant', courseIds: ['65e7704a9ea90c00080d5195'] }
    });
    const teacherStealStudent = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: { email: 'e2e.hs.b@khongtunhi.com', action: 'assign_class', classCode: 'YCT2-04' }
    });
    const teacherCrossClassSession = await callApi('/api/ktn/class-sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: { classCode: 'YCT3-02', sessionNum: 1, title: 'Unauthorized Session' }
    });
    record(
      'A5-TEACHER-RBAC-BOUNDARIES',
      'GROUP_A',
      'Teacher cannot create classes, reassign class teacher, grant/revoke courses, steal other class students, or post sessions to unmanaged classes',
      teacherCreateClass.status === 403 &&
        teacherChangeOwner.status === 403 &&
        teacherGrantCourse.status === 403 &&
        teacherStealStudent.status === 403 &&
        teacherCrossClassSession.status === 403,
      `createClass=${teacherCreateClass.status}, changeOwner=${teacherChangeOwner.status}, grantCourse=${teacherGrantCourse.status}, stealStudent=${teacherStealStudent.status}, crossSession=${teacherCrossClassSession.status}`
    );

    // 3. Logout revocation server-side enforcement
    const tempLogin = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'taphong2002@gmail.com', password: 'TestStrongPassword!2026', role: 'student' }
    });
    const tempToken = tempLogin.data.token;
    const beforeLogoutMe = await callApi('/api/ktn/students/me', {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    const logoutRes = await callApi('/api/ktn/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    const afterLogoutSession = await callApi('/api/ktn/auth/session', {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    const afterLogoutMe = await callApi('/api/ktn/students/me', {
      headers: { Authorization: `Bearer ${tempToken}` }
    });
    record(
      'A5-LOGOUT-TOKEN-REVOCATION',
      'GROUP_A',
      'Logged-out token is persisted as revoked and rejected with 401 on subsequent /auth/session and /students/me calls',
      beforeLogoutMe.status === 200 &&
        logoutRes.status === 200 &&
        logoutRes.data?.revoked === true &&
        afterLogoutSession.status === 401 &&
        afterLogoutMe.status === 401,
      `before=${beforeLogoutMe.status}, logout=${logoutRes.status}, afterSession=${afterLogoutSession.status}, afterMe=${afterLogoutMe.status}`
    );
  }

  // ============================================================================
  // GROUP C: FAILURE INJECTION TESTS
  // ============================================================================
  {
    // C1. izTeach Down (503) during Homework Submission
    state.faults.izteachHomeworkFail = true;
    const c1Submit = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: '6adadba969897b0002482ca5',
        lessonNum: 4,
        lessonTitle: 'HSK1 3.0 · Bài 4',
        fileUrl: `${CDN_HW_A}/hsk1-l4-izdown.wav`,
        fileType: 'audio/wav',
        studentNote: 'Nộp khi izTeach 503'
      }
    });
    state.faults.izteachHomeworkFail = false;
    record(
      'C1-IZTEACH-DOWN-ON-HOMEWORK-SUBMIT',
      'GROUP_C',
      'When izTeach /prod/homework returns 503, submission is preserved in Supabase with syncStatus=sync_failed and mirroredToIzTeach=false',
      c1Submit.status === 200 &&
        c1Submit.data?.ok === true &&
        c1Submit.data?.mirroredToIzTeach === false &&
        c1Submit.data?.syncStatus === 'sync_failed' &&
        c1Submit.data?.homework?.workbook_answers?._syncMeta?.syncStatus === 'sync_failed',
      `status=${c1Submit.status}, syncStatus=${c1Submit.data?.syncStatus}, mirrored=${c1Submit.data?.mirroredToIzTeach}`
    );

    // C2. izTeach Down (503) during Teacher Grading
    state.faults.izteachHomeworkFail = true;
    const c2Grade = await callApi('/api/ktn/homeworks/grade', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        id: c1Submit.data.homework.id,
        score: 8.5,
        status: 'graded',
        teacherFeedback: 'Chấm điểm khi izTeach 503'
      }
    });
    state.faults.izteachHomeworkFail = false;
    record(
      'C2-IZTEACH-DOWN-ON-TEACHER-GRADE',
      'GROUP_C',
      'When izTeach /prod/homework returns 503 during grading, grade is saved in Supabase with syncStatus=sync_failed and mirroredToIzTeach=false',
      c2Grade.status === 200 &&
        c2Grade.data?.ok === true &&
        c2Grade.data?.mirroredToIzTeach === false &&
        c2Grade.data?.syncStatus === 'sync_failed' &&
        c2Grade.data?.homework?.score === 8.5,
      `status=${c2Grade.status}, syncStatus=${c2Grade.data?.syncStatus}, score=${c2Grade.data?.homework?.score}`
    );

    // C3. izTeach Down (500) or Read-After-Write Verification Mismatch during Course Revoke
    state.faults.izteachPermissionMutateFail = true;
    const c3Revoke500 = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'e2e.hs.a@khongtunhi.com',
        action: 'revoke',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    state.faults.izteachPermissionMutateFail = false;

    state.faults.izteachPermissionSkipVerifyMutation = true;
    const c3RevokeVerifyMismatch = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'e2e.hs.a@khongtunhi.com',
        action: 'revoke',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    state.faults.izteachPermissionSkipVerifyMutation = false;

    const stuAAfterFailedRevokes = state.tables.ktn_students.find(s => s.email === 'e2e.hs.a@khongtunhi.com');
    record(
      'C3-IZTEACH-FAILURE-OR-VERIFY-MISMATCH-BLOCKS-SUPABASE-MUTATION',
      'GROUP_C',
      'When izTeach remove-products fails (500) or read-after-write verification detects course still active, Worker returns 502 and does not desync Supabase',
      c3Revoke500.status === 502 &&
        c3RevokeVerifyMismatch.status === 502 &&
        c3RevokeVerifyMismatch.data?.izteachResult?.reason === 'REVOKE_VERIFICATION_MISMATCH' &&
        stuAAfterFailedRevokes.online_courses.some(c => c.id === '6adadba969897b0002482ca5'),
      `http500=${c3Revoke500.status}, verifyMismatch=${c3RevokeVerifyMismatch.status} (${c3RevokeVerifyMismatch.data?.izteachResult?.reason})`
    );

    // C4. Partial failure: izTeach succeeds, Supabase fails (503) during Course Grant
    state.faults.supabaseFailOnTable = 'ktn_students';
    state.faults.supabaseFailMethod = 'POST';
    const c4Partial = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'e2e.hs.a@khongtunhi.com',
        action: 'grant',
        courseIds: ['65e7704a9ea90c00080d5195']
      }
    });
    state.faults.supabaseFailOnTable = null;
    state.faults.supabaseFailMethod = null;
    // Restore izTeach state for Student A back to HSK1 only
    state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555551'] = ['6adadba969897b0002482ca5'];
    record(
      'C4-PARTIAL-FAILURE-SUPABASE-DOWN-AFTER-IZTEACH',
      'GROUP_C',
      'When izTeach grant succeeds but Supabase write fails, Worker returns 502 with partialFailure=true and syncStatus=partial_failure_supabase',
      c4Partial.status === 502 &&
        c4Partial.data?.partialFailure === true &&
        c4Partial.data?.syncStatus === 'partial_failure_supabase' &&
        c4Partial.data?.izteachUpdated === true &&
        c4Partial.data?.supabaseUpdated === false,
      `status=${c4Partial.status}, syncStatus=${c4Partial.data?.syncStatus}`
    );

    // C5. Supabase Down during Logout & Token Revocation Fail-Closed
    state.faults.supabaseFailOnTable = 'ktn_dlp_alerts';
    state.faults.supabaseFailMethod = 'POST';
    const c5LogoutFail = await callApi('/api/ktn/auth/logout', {
      method: 'POST',
      headers: { Authorization: `Bearer ${taPhongToken}` }
    });
    state.faults.supabaseFailMethod = 'GET';
    const c5SessionFailClosed = await callApi('/api/ktn/auth/session', {
      headers: { Authorization: `Bearer ${taPhongToken}` }
    });
    state.faults.supabaseFailOnTable = null;
    state.faults.supabaseFailMethod = null;
    record(
      'C5-LOGOUT-PERSIST-FAILURE-AND-REVOCATION-FAIL-CLOSED',
      'GROUP_C',
      'When ktn_dlp_alerts is unreachable, logout returns 503 (revoked:false) and token revocation check fails closed (401)',
      c5LogoutFail.status === 503 &&
        c5LogoutFail.data?.revoked === false &&
        c5SessionFailClosed.status === 401,
      `logoutStatus=${c5LogoutFail.status}, sessionWhenDbDown=${c5SessionFailClosed.status}`
    );
  }

  // ============================================================================
  // GROUP D: 3-ROLE END-TO-END FLOW, CLASS SESSIONS, CHAT ISOLATION & NOTIFICATIONS
  // ============================================================================
  {
    // 1. Teacher A posts session with `assignments` -> normalized into both `exercises` and `assignments`
    const createSessRes = await callApi('/api/ktn/class-sessions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        classCode: 'YCT2-04',
        sessionNum: 1,
        title: 'Buổi 1: Chào hỏi & Gia đình',
        assignments: [
          { id: 't1', type: 'audio', title: 'Thu âm 5 câu hội thoại trang 8', instruction: 'Đọc to rõ ràng' }
        ]
      }
    });
    const getSessStudentA = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });
    const getSessStudentB = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentBToken}` }
    });
    const sess0 = getSessStudentA.data?.sessions?.[0];
    record(
      'D1-CLASS-SESSION-SCHEMA-AND-ISOLATION',
      'GROUP_D',
      'Teacher session assignment normalizes both exercises[] and assignments[], is readable by class student, and returns 403 to other class student',
      createSessRes.status === 200 &&
        getSessStudentA.status === 200 &&
        Array.isArray(sess0?.exercises) &&
        sess0.exercises.length === 1 &&
        sess0.exercises[0].prompt === 'Đọc to rõ ràng' &&
        getSessStudentB.status === 403,
      `studentA=${getSessStudentA.status}, exercises=${sess0?.exercises?.length}, studentB=${getSessStudentB.status}`
    );

    // 2. Class Chat Isolation & DLP Check
    const msgSendA = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: { classCode: 'YCT2-04', text: 'Con chào cô Linh ạ!' }
    });
    const msgSendCrossClass = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentBToken}` },
      body: { classCode: 'YCT2-04', text: 'Tin nhắn trái phép sang YCT2-04' }
    });
    const msgReadTeacherA = await callApi('/api/ktn/messages?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${teacherAToken}` }
    });
    const msgReadTeacherB = await callApi('/api/ktn/messages?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${teacherBToken}` }
    });
    record(
      'D2-CLASS-CHAT-RBAC-ISOLATION',
      'GROUP_D',
      'Class chat allows enrolled student & assigned teacher in YCT2-04 and blocks Student B (403) and Teacher B (403)',
      msgSendA.status === 200 &&
        msgSendCrossClass.status === 403 &&
        msgReadTeacherA.status === 200 &&
        msgReadTeacherA.data?.messages?.length === 1 &&
        msgReadTeacherB.status === 403,
      `sendA=${msgSendA.status}, crossSendB=${msgSendCrossClass.status}, readTeacherA=${msgReadTeacherA.status}, readTeacherB=${msgReadTeacherB.status}`
    );

    // 3. Notifications Read-State Persistence & No Duplicate Notifications
    const notifsBefore = await callApi('/api/ktn/notifications', {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });
    const unreadIds = (notifsBefore.data?.notifications || []).filter(n => !n.read).map(n => n.id);
    assert.ok(unreadIds.length > 0, 'Student A should have grading notification from earlier grading steps');

    const markReadRes = await callApi('/api/ktn/notifications/read', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: { ids: unreadIds }
    });
    const notifsAfterReload = await callApi('/api/ktn/notifications', {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });
    const stillUnread = (notifsAfterReload.data?.notifications || []).filter(n => unreadIds.includes(n.id) && !n.read);
    record(
      'D3-NOTIFICATION-READ-PERSISTENCE',
      'GROUP_D',
      'Marking notifications read persists in Supabase across reload with 0 unread regression and 0 cross-student leakage',
      markReadRes.status === 200 &&
        stillUnread.length === 0 &&
        (notifsAfterReload.data?.notifications || []).every(n => !n.target_email || n.target_email === 'e2e.hs.a@khongtunhi.com'),
      `marked=${unreadIds.length}, stillUnreadAfterReload=${stillUnread.length}`
    );
  }

  console.log('\n================================================================================');
  console.log(`SUMMARY: ${results.length}/${results.length} TESTS PASSED (100% PASS)`);
  console.log('================================================================================');
}

runSuite().catch(err => {
  console.error('\n[SUITE FAILED]', err);
  process.exit(1);
});
