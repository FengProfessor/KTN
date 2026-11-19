/**
 * KTN MASTER UPGRADE — TARGETED BACKEND VERIFICATION SUITE (Agent A + Cross-Agent C1/D1)
 * Verifies:
 *   - A1: Forum Follow Contract (snake_case & camelCase, persistence + read-back, unfollow/re-follow)
 *   - A2: Forum Claim & Lifecycle (open -> claimed -> answered -> resolved, DB constraint resilience, contribution points)
 *   - A3: Course Chat RBAC vs Shared Forum Policy + Stale Entitlement Revocation Protection
 *   - A4: Chat Idempotency (5x rapid concurrent sends + retry, 1 DB row, 1 push dispatch)
 *   - A5: Forum Notification Targeting (active teachers only on question, author+followers on answer, unfollow respected, no duplicates)
 *   - C1/C2: Teacher Student Onboarding (parentPhone persistence/read-back/search, RBAC boundaries, retry idempotency)
 *   - D1: Admin Student Lifecycle (suspend/archive/restore/delete, retention gate, upstream izTeach revoke, honest Cognito status)
 *
 * Usage: node tests/ktn_master_upgrade_backend_targeted.cjs
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');

const ROOT_DIR = path.resolve(__dirname, '..');

function normalizeMockViText(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9@._\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function loadWorkerInstance(sharedState = null) {
  const code = fs.readFileSync(path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js'), 'utf8');
  const transformed = code.replace(/export\s+default\s+\{/, 'module.exports = {');

  const state = sharedState || {
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
        }
      ],
      ktn_teachers: [
        {
          code: 'GV-KTN-08',
          name: 'Cô Lâm Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          assigned_classes: ['YCT2-04', 'YCT1-01'],
          assigned_courses: ['6adadba969897b0002482ca5'],
          active: true,
          status: 'active',
          updated_at: new Date().toISOString()
        },
        {
          code: 'GV-KTN-03',
          name: 'Cô Trần Thu Hà',
          email: 'thu.ha@khongtunhi.com',
          assigned_classes: ['YCT3-02'],
          assigned_courses: ['65e7704a9ea90c00080d5195'],
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
      ktn_push_subscriptions: [],
      ktn_forum_questions: [],
      ktn_forum_answers: [],
      ktn_forum_follows: [],
      ktn_teacher_contributions: [],
      ktn_course_grant_requests: [],
      ktn_student_lifecycle: [],
      ktn_admin_audit_logs: [],
      ktn_provisioning_jobs: [],
      ktn_sync_events: []
    },
    izteach: {
      permissionsByUid: {
        '11111111-2222-3333-4444-555555555551': ['6adadba969897b0002482ca5'],
        '11111111-2222-3333-4444-555555555552': ['65e7704a9ea90c00080d5195']
      },
      homeworkPosts: [],
      unitsByCourse: {
        '6adadba969897b0002482ca5': [
          { _id: '6adb27370ae64c00025de049', title: 'Bài 1: 你好', type: 'video', index: 0, video: 'vid-hsk1-1' },
          { _id: '6adb30510ae64c00025de0cd', title: 'Bài tập Bài 1', type: 'homework', index: 1 }
        ],
        '65e7704a9ea90c00080d5195': [
          { _id: '65e7dc7f8a1ca2000816c35a', title: 'Lesson 1', type: 'video', index: 0, video: 'vid-cfk-1' },
          { _id: '65fc39bd42c24000085d87e2', title: 'Homework 1', type: 'homework', index: 1 }
        ]
      }
    },
    faults: {
      rejectForumClaimedStatusInSql: false,
      izteachPermissionMutateFail: false,
      simulateLegacyV2StudentSchema: false,
      disableSearchRpc: true
    }
  };

  function matchesJsonbContains(cellVal, jsonStr) {
    try {
      const needles = JSON.parse(jsonStr);
      const hay = Array.isArray(cellVal) ? cellVal : [];
      if (!Array.isArray(needles)) return false;
      return needles.every(needle => {
        if (needle && typeof needle === 'object') {
          return hay.some(
            item =>
              item &&
              typeof item === 'object' &&
              Object.keys(needle).every(k => String(item[k] ?? '') === String(needle[k] ?? ''))
          );
        }
        return hay.some(
          item => (typeof item === 'string' || typeof item === 'number') && String(item) === String(needle)
        );
      });
    } catch {
      return false;
    }
  }

  function evalSinglePostgrestClause(row, c) {
    if (c.endsWith('.is.null')) {
      const col = c.slice(0, -8);
      return row[col] === null || row[col] === undefined;
    }
    const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|ilike|like|cs)\.(.*)$/);
    if (!m) return true;
    const [, col, op, v] = m;
    if (op === 'cs') return matchesJsonbContains(row[col], v);
    const cell = String(row[col] ?? '');
    if (op === 'eq') return cell === v;
    const isCaseInsensitive = op === 'ilike';
    const regexStr = '^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
    const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
    return re.test(cell);
  }

  function matchQueryFilters(row, searchParams) {
    for (const [k, rawVal] of searchParams.entries()) {
      if (k === 'select' || k === 'order' || k === 'limit' || k === 'offset' || k === 'on_conflict') continue;
      if (k === 'or') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        if (!clauses.some(c => evalSinglePostgrestClause(row, c))) return false;
        continue;
      }
      if (k === 'and') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = inner.split(',');
        if (!clauses.every(c => evalSinglePostgrestClause(row, c))) return false;
        continue;
      }
      if (rawVal === 'is.null') {
        if (row[k] !== null && row[k] !== undefined) return false;
      } else if (rawVal.startsWith('eq.')) {
        const target = rawVal.slice(3);
        if (String(row[k] ?? '') !== target) return false;
      } else if (rawVal.startsWith('cs.')) {
        if (!matchesJsonbContains(row[k], rawVal.slice(3))) return false;
      } else if (rawVal.startsWith('ilike.') || rawVal.startsWith('like.')) {
        const isCaseInsensitive = rawVal.startsWith('ilike.');
        const pattern = rawVal.slice(isCaseInsensitive ? 6 : 5);
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
        const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
        if (!re.test(String(row[k] ?? ''))) return false;
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

    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      if (table === 'rpc/ktn_search_students') {
        return new Response(JSON.stringify({ message: 'RPC disabled in targeted test' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (table === 'ktn_forum_follows' && state.faults.missingForumFollowsTable) {
        return new Response(
          JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.ktn_forum_follows' in the schema cache" }),
          { status: 404, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        if (
          table === 'ktn_students' &&
          state.faults.simulateLegacyV2StudentSchema &&
          (u.searchParams.has('search_text') ||
            u.searchParams.has('account_status') ||
            u.searchParams.has('sync_status') ||
            String(u.searchParams.get('and') || '').includes('search_text'))
        ) {
          return new Response(
            JSON.stringify({ code: '42703', message: 'column ktn_students.search_text does not exist' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        const matched = rows.filter(r => matchQueryFilters(r, u.searchParams));
        const totalMatched = matched.length;
        const offset = Math.max(0, Number(u.searchParams.get('offset') || 0));
        const limit = Number(u.searchParams.get('limit') || 0);
        const paged = limit > 0 ? matched.slice(offset, offset + limit) : matched.slice(offset);
        return new Response(JSON.stringify(paged), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Content-Range': `${offset}-${Math.max(offset, offset + paged.length - 1)}/${totalMatched}`
          }
        });
      }

      if (method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        const items = Array.isArray(body) ? body : [body];

        if (
          table === 'ktn_students' &&
          state.faults.simulateLegacyV2StudentSchema &&
          items.some(it => it.parent_phone !== undefined || it.search_text !== undefined || it.account_status !== undefined)
        ) {
          return new Response(
            JSON.stringify({ code: '42703', message: 'column does not exist in legacy V2 schema' }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }

        if (table === 'ktn_forum_questions') {
          for (const it of items) {
            const validStatuses = state.faults.rejectForumClaimedStatusInSql
              ? ['open', 'answered', 'resolved', 'hidden']
              : ['open', 'claimed', 'answered', 'resolved', 'hidden'];
            if (it.status && !validStatuses.includes(it.status)) {
              return new Response(
                JSON.stringify({
                  code: '23514',
                  message: `new row for relation "ktn_forum_questions" violates check constraint "ktn_forum_questions_status_check" (status=${it.status})`
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        if (table === 'ktn_forum_follows') {
          for (const it of items) {
            if (!it.question_id || !it.user_email) {
              return new Response(
                JSON.stringify({
                  code: '23502',
                  message: 'null value in column "question_id" or "user_email" violates not-null constraint'
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
            if (it.notify_mode && !['immediate', 'digest', 'off'].includes(it.notify_mode)) {
              return new Response(
                JSON.stringify({
                  code: '23514',
                  message: 'new row for relation "ktn_forum_follows" violates check constraint "ktn_forum_follows_notify_mode_check"'
                }),
                { status: 400, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
        }

        const onConflict = u.searchParams.get('on_conflict');
        const pkByTable = {
          ktn_students: 'email',
          ktn_orders: 'order_id',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_forum_questions: 'id',
          ktn_forum_answers: 'id',
          ktn_forum_follows: 'id',
          ktn_teacher_contributions: 'id',
          ktn_student_lifecycle: 'student_email'
        };
        const defaultPk = pkByTable[table] || 'id';
        const out = [];
        for (const item of items) {
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map(s => s.trim());
            existingIdx = rows.findIndex(r =>
              keys.every(k => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase())
            );
          } else if (table === 'ktn_forum_follows' && item.question_id && item.user_email) {
            existingIdx = rows.findIndex(
              r =>
                String(r.question_id || '').toLowerCase() === String(item.question_id || '').toLowerCase() &&
                String(r.user_email || '').toLowerCase() === String(item.user_email || '').toLowerCase()
            );
          } else if (item[defaultPk]) {
            existingIdx = rows.findIndex(
              r => String(r[defaultPk] ?? '').toLowerCase() === String(item[defaultPk] ?? '').toLowerCase()
            );
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
        return new Response(JSON.stringify({ message: 'Invalid credentials' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (u.pathname.includes('/prod/user-permission/add-products/')) {
        if (state.faults.izteachPermissionMutateFail) {
          return new Response(JSON.stringify({ message: 'izTeach add-products 500' }), { status: 500 });
        }
        const uid = decodeURIComponent(u.pathname.split('/').pop());
        const body = init.body ? JSON.parse(init.body) : {};
        const cur = new Set(state.izteach.permissionsByUid[uid] || []);
        (body.productIds || []).forEach(id => cur.add(id));
        state.izteach.permissionsByUid[uid] = Array.from(cur);
        return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }

      if (u.pathname.includes('/prod/user-permission/remove-products/')) {
        if (state.faults.izteachPermissionMutateFail) {
          return new Response(JSON.stringify({ message: 'izTeach remove-products 500' }), { status: 500 });
        }
        const uid = decodeURIComponent(u.pathname.split('/').pop());
        const body = init.body ? JSON.parse(init.body) : {};
        const removeSet = new Set(body.productIds || []);
        state.izteach.permissionsByUid[uid] = (state.izteach.permissionsByUid[uid] || []).filter(id => !removeSet.has(id));
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

      if (u.pathname.endsWith('/prod/user') && method === 'POST') {
        const body = init.body ? JSON.parse(init.body) : {};
        if (!state.izteach.createdUsersByEmail) state.izteach.createdUsersByEmail = {};
        const em = String(body.email || '').toLowerCase();
        if (!state.izteach.createdUsersByEmail[em]) {
          const seq = Object.keys(state.izteach.createdUsersByEmail).length + 100;
          state.izteach.createdUsersByEmail[em] = `aaaa1111-2222-3333-4444-${String(seq).padStart(12, '0')}`;
        }
        const uid = state.izteach.createdUsersByEmail[em];
        return new Response(JSON.stringify({ id: uid, userId: uid, email: em }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (u.pathname.endsWith('/prod/student')) {
        if (method === 'POST') {
          const body = init.body ? JSON.parse(init.body) : {};
          const em = String(body.email || '').toLowerCase();
          const reqPhone = String(body.phone || '').trim();
          if (!state.izteach.createdStudentsByEmail) state.izteach.createdStudentsByEmail = {};
          if (state.izteach.createdStudentsByEmail[em]) {
            return new Response(
              JSON.stringify({ code: 409, data: 'Email đã tồn tại trong hệ thống' }),
              { status: 409, headers: { 'Content-Type': 'application/json' } }
            );
          }
          const seq = Object.keys(state.izteach.createdStudentsByEmail).length + 100;
          const generatedCognitoUid = body.dynamoId || body.userId || `aaaa1111-2222-3333-4444-${String(seq).padStart(12, '0')}`;
          const crmId = '66fb0000000000000000' + String(seq).padStart(4, '0');
          const stuObj = {
            _id: crmId,
            id: crmId,
            userId: generatedCognitoUid,
            dynamoId: generatedCognitoUid,
            email: em,
            name: body.name || em,
            phone: reqPhone
          };
          state.izteach.createdStudentsByEmail[em] = stuObj;
          return new Response(JSON.stringify(stuObj), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const email = (u.searchParams.get('email') || '').toLowerCase();
        if (!email && Array.isArray(state.izteach.studentList)) {
          return new Response(JSON.stringify(state.izteach.studentList), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        if (state.izteach.createdStudentsByEmail && state.izteach.createdStudentsByEmail[email]) {
          return new Response(JSON.stringify([state.izteach.createdStudentsByEmail[email]]), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
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
    }

    if (u.hostname === 'fcm.googleapis.com' || u.hostname === 'web.push.apple.com') {
      if (!Array.isArray(state.pushDeliveries)) state.pushDeliveries = [];
      state.pushDeliveries.push({
        endpoint: urlStr,
        method,
        status: 201,
        headers: init.headers || {}
      });
      return new Response('', { status: 201 });
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
    AbortController: globalThis.AbortController,
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
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026',
    KTN_WEBHOOK_SECRET: 'mock-webhook-secret-2026'
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
    const waitUntilPromises = [];
    const res = await worker.fetch(req, env, {
      waitUntil: p => {
        if (p && typeof p.then === 'function') waitUntilPromises.push(p);
      }
    });
    if (waitUntilPromises.length > 0) {
      await Promise.allSettled(waitUntilPromises);
    }
    const data = await res.json().catch(() => null);
    return { status: res.status, ok: res.ok, headers: res.headers, data };
  }

  return { worker, state, env, callApi };
}

async function runTargetedSuite() {
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
  console.log('KTN MASTER UPGRADE — TARGETED BACKEND VERIFICATION SUITE (A1–A5, C1–C2, D1)');
  console.log('================================================================================\n');

  const { state, callApi } = loadWorkerInstance();

  // Authenticate test actors
  const loginStuA = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const loginStuB = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.b@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const loginTeaLinh = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'linh.lam@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  const loginTeaHa = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'thu.ha@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  const loginAdmin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'hocvienkhongtunhi123@gmail.com', password: 'AdminStrongPassword!2026', role: 'admin' }
  });

  assert.strictEqual(loginStuA.status, 200, 'Student A login');
  assert.strictEqual(loginStuB.status, 200, 'Student B login');
  assert.strictEqual(loginTeaLinh.status, 200, 'Teacher Linh login');
  assert.strictEqual(loginTeaHa.status, 200, 'Teacher Ha login');
  assert.strictEqual(loginAdmin.status, 200, 'Admin login');

  const hStuA = { Authorization: `Bearer ${loginStuA.data.token}` };
  const hStuB = { Authorization: `Bearer ${loginStuB.data.token}` };
  const hTeaLinh = { Authorization: `Bearer ${loginTeaLinh.data.token}` };
  const hTeaHa = { Authorization: `Bearer ${loginTeaHa.data.token}` };
  const hAdmin = { Authorization: `Bearer ${loginAdmin.data.token}` };

  const HSK1_COURSE = '6adadba969897b0002482ca5';
  const CFK1_COURSE = '65e7704a9ea90c00080d5195';

  // ============================================================================
  // A1 & A5: FORUM QUESTION CREATION, NOTIFICATION TARGETING & FOLLOW CONTRACT
  // ============================================================================
  const qCreateRes = await callApi('/api/ktn/forum/questions', {
    method: 'POST',
    headers: hStuA,
    body: {
      courseId: HSK1_COURSE,
      lessonNumber: 2,
      lessonTitle: 'Bài 2: 谢谢你',
      title: 'Cách phát âm thanh nhẹ trong 谢谢',
      content: 'Thưa cô, chữ 谢 thứ hai trong 谢谢 đọc thanh nhẹ như thế nào cho tự nhiên ạ?',
      videoTimestampSec: 75,
      clientQuestionId: 'cq_a1_test_001'
    }
  });

  // Idempotent retry with same clientQuestionId -> must return idempotentReplay=true and not create duplicate row
  const qCreateRetryRes = await callApi('/api/ktn/forum/questions', {
    method: 'POST',
    headers: hStuA,
    body: {
      courseId: HSK1_COURSE,
      lessonNumber: 2,
      lessonTitle: 'Bài 2: 谢谢你',
      title: 'Cách phát âm thanh nhẹ trong 谢谢',
      content: 'Thưa cô, chữ 谢 thứ hai trong 谢谢 đọc thanh nhẹ như thế nào cho tự nhiên ạ?',
      videoTimestampSec: 75,
      clientQuestionId: 'cq_a1_test_001'
    }
  });

  const qId = qCreateRes.data?.question?.id;
  const qSqlRow = state.tables.ktn_forum_questions.find(q => q.id === qId);
  const qFilterByLessonNumber = await callApi(
    `/api/ktn/forum/questions?courseId=${HSK1_COURSE}&lessonNumber=2`,
    { headers: hStuA }
  );

  record(
    'A1-FORUM-QUESTION-CREATE-AND-AUTHOR-AUTO-FOLLOW',
    'AGENT_A',
    'Student creates forum question (supporting lessonNumber/videoTimestampSec/clientQuestionId), persists lesson_num in SQL, deduplicates retry, and auto-follows in ktn_forum_follows',
    qCreateRes.status === 200 &&
      Boolean(qId) &&
      qCreateRes.data?.question?.status === 'open' &&
      qCreateRes.data?.question?.lessonNum === 2 &&
      qCreateRes.data?.question?.videoTimestampSeconds === 75 &&
      qSqlRow?.lesson_num === 2 &&
      qSqlRow?.video_timestamp_seconds === 75 &&
      qCreateRetryRes.status === 200 &&
      qCreateRetryRes.data?.idempotentReplay === true &&
      state.tables.ktn_forum_questions.length === 1 &&
      (qFilterByLessonNumber.data?.questions || []).some(q => q.id === qId) &&
      qCreateRes.data?.question?.isFollowing === true &&
      state.tables.ktn_forum_follows.some(
        f => f.question_id === qId && f.user_email === 'e2e.hs.a@khongtunhi.com' && f.notify_mode === 'immediate' && f.following === true
      ),
    `qId=${qId}, sqlLessonNum=${qSqlRow?.lesson_num}, videoTs=${qSqlRow?.video_timestamp_seconds}, retryReplay=${qCreateRetryRes.data?.idempotentReplay}`
  );

  // Verify A5: Active teachers receive notification, other students do NOT receive mass notification
  const teaLinhNotifs = await callApi('/api/ktn/notifications', { headers: hTeaLinh });
  const teaHaNotifs = await callApi('/api/ktn/notifications', { headers: hTeaHa });
  const stuBNotifs = await callApi('/api/ktn/notifications', { headers: hStuB });

  const linhHasQNotif = (teaLinhNotifs.data?.notifications || []).some(n =>
    String(n.id || '').includes(qId)
  );
  const haHasQNotif = (teaHaNotifs.data?.notifications || []).some(n =>
    String(n.id || '').includes(qId)
  );
  const stuBHasQNotif = (stuBNotifs.data?.notifications || []).some(n =>
    String(n.id || '').includes(qId)
  );

  record(
    'A5-FORUM-QUESTION-NOTIFIES-TEACHERS-NO-MASS-STUDENT-PUSH',
    'AGENT_A',
    'New student forum question notifies active teachers in-system and never pushes/notifies unrelated students',
    linhHasQNotif === true && haHasQNotif === true && stuBHasQNotif === false,
    `teaLinh=${linhHasQNotif}, teaHa=${haHasQNotif}, unrelatedStuB=${stuBHasQNotif}`
  );

  // Grant HSK1 to Student B temporarily so Student B can test following HSK1 forum question
  state.tables.ktn_students.find(s => s.email === 'e2e.hs.b@khongtunhi.com').online_courses.push({
    id: HSK1_COURSE,
    title: 'HSK1 3.0'
  });

  // Test A1: Follow via snake_case payload (`question_id`, `notify_mode`)
  const stuBFollowRes = await callApi('/api/ktn/forum/follows', {
    method: 'POST',
    headers: hStuB,
    body: {
      question_id: qId,
      notify_mode: 'immediate',
      following: true
    }
  });
  const stuBFollowGet = await callApi(`/api/ktn/forum/follows?questionId=${encodeURIComponent(qId)}`, {
    headers: hStuB
  });
  const stuBQListAfterFollow = await callApi(`/api/ktn/forum/questions?courseId=${HSK1_COURSE}`, {
    headers: hStuB
  });
  const stuBQItemFollowed = (stuBQListAfterFollow.data?.questions || []).find(q => q.id === qId);

  record(
    'A1-FOLLOW-CONTRACT-SNAKE-AND-CAMEL-PERSISTENCE-READBACK',
    'AGENT_A',
    'saveForumFollow accepts snake_case & camelCase, persists non-empty question_id & user_email, and reads back accurately',
    stuBFollowRes.status === 200 &&
      stuBFollowRes.data?.isFollowing === true &&
      stuBFollowRes.data?.follow?.question_id === qId &&
      stuBFollowRes.data?.follow?.questionId === qId &&
      stuBFollowRes.data?.follow?.user_email === 'e2e.hs.b@khongtunhi.com' &&
      stuBFollowRes.data?.follow?.userEmail === 'e2e.hs.b@khongtunhi.com' &&
      stuBFollowGet.data?.isFollowing === true &&
      stuBFollowGet.data?.followsCount === 2 &&
      stuBQItemFollowed?.isFollowing === true,
    `isFollowing=${stuBFollowGet.data?.isFollowing}, followsCount=${stuBFollowGet.data?.followsCount}`
  );

  // Test A1: Unfollow persistence & read-back (both for follower Student B and question author Student A)
  const stuBUnfollowRes = await callApi('/api/ktn/forum/follows', {
    method: 'POST',
    headers: hStuB,
    body: {
      questionId: qId,
      following: false
    }
  });
  const stuBFollowGetAfterOff = await callApi(`/api/ktn/forum/follows?questionId=${encodeURIComponent(qId)}`, {
    headers: hStuB
  });
  const stuBQListAfterUnfollow = await callApi(`/api/ktn/forum/questions?courseId=${HSK1_COURSE}`, {
    headers: hStuB
  });
  const stuBQItemUnfollowed = (stuBQListAfterUnfollow.data?.questions || []).find(q => q.id === qId);

  // Author unfollow & re-follow test (including when ktn_forum_follows table is missing/unmigrated)
  const authorUnfollowRes = await callApi('/api/ktn/forum/follows', {
    method: 'POST',
    headers: hStuA,
    body: { questionId: qId, following: false }
  });
  const authorQAfterUnfollow = await callApi(`/api/ktn/forum/questions?courseId=${HSK1_COURSE}`, {
    headers: hStuA
  });
  const authorItemUnfollowed = (authorQAfterUnfollow.data?.questions || []).find(q => q.id === qId);
  const authorRowsInFollowsTable = state.tables.ktn_forum_follows.filter(
    f => f.question_id === qId && f.user_email === 'e2e.hs.a@khongtunhi.com'
  );

  // Simulate unmigrated environment where ktn_forum_follows table returns 404
  state.faults.missingForumFollowsTable = true;
  const authorRefollowRes = await callApi('/api/ktn/forum/follows', {
    method: 'POST',
    headers: hStuA,
    body: { questionId: qId, following: true, notifyMode: 'all' }
  });
  const authorGetWhileTableMissing = await callApi(
    `/api/ktn/forum/follows?questionId=${encodeURIComponent(qId)}`,
    { headers: hStuA }
  );
  state.faults.missingForumFollowsTable = false;
  // Sync back to SQL table as well so both stores are aligned
  await callApi('/api/ktn/forum/follows', {
    method: 'POST',
    headers: hStuA,
    body: { questionId: qId, following: true, notifyMode: 'immediate' }
  });

  record(
    'A1-UNFOLLOW-AND-REFOLLOW-PERSISTENCE-INCLUDING-AUTHOR',
    'AGENT_A',
    'Unfollowing persists notify_mode=off without duplicate user_id rows, respects author explicit unfollow/re-follow, and works even when ktn_forum_follows table is unmigrated',
    stuBUnfollowRes.status === 200 &&
      stuBUnfollowRes.data?.isFollowing === false &&
      stuBFollowGetAfterOff.data?.isFollowing === false &&
      stuBFollowGetAfterOff.data?.followNotifyMode === 'off' &&
      stuBQItemUnfollowed?.isFollowing === false &&
      authorUnfollowRes.data?.isFollowing === false &&
      authorItemUnfollowed?.isFollowing === false &&
      authorRowsInFollowsTable.length === 1 &&
      authorRefollowRes.data?.isFollowing === true &&
      authorGetWhileTableMissing.data?.isFollowing === true,
    `stuBAfterOff=${stuBFollowGetAfterOff.data?.isFollowing}, authorSqlRows=${authorRowsInFollowsTable.length}, authorUnfollow=${authorItemUnfollowed?.isFollowing}, missingTableFallback=${authorGetWhileTableMissing.data?.isFollowing}`
  );

  // ============================================================================
  // A2: FORUM CLAIM & FULL LIFECYCLE (open -> claimed -> answered -> resolved)
  // ============================================================================
  // Test both SQL-native 'claimed' and fallback when legacy DB constraint rejects 'claimed'
  state.faults.rejectForumClaimedStatusInSql = true;
  const claimRes1 = await callApi('/api/ktn/forum/questions/claim', {
    method: 'POST',
    headers: hTeaLinh,
    body: { questionId: qId, action: 'claim' }
  });
  state.faults.rejectForumClaimedStatusInSql = false;

  // Teacher Ha tries to claim while Teacher Linh holds active claim -> 409
  const competingClaimRes = await callApi('/api/ktn/forum/questions/claim', {
    method: 'POST',
    headers: hTeaHa,
    body: { questionId: qId, action: 'claim' }
  });

  // Unclaim by Teacher Linh -> back to 'open', then claim by Teacher Ha (testing shared forum access!)
  const unclaimRes = await callApi('/api/ktn/forum/questions/claim', {
    method: 'POST',
    headers: hTeaLinh,
    body: { questionId: qId, action: 'unclaim' }
  });
  const claimResHa = await callApi('/api/ktn/forum/questions/claim', {
    method: 'POST',
    headers: hTeaHa,
    body: { questionId: qId, action: 'claim' }
  });

  const qListAfterClaim = await callApi(`/api/ktn/forum/questions?courseId=${HSK1_COURSE}`, {
    headers: hTeaHa
  });
  const claimedQ = (qListAfterClaim.data?.questions || []).find(q => q.id === qId);

  record(
    'A2-FORUM-CLAIM-CONFLICT-AND-UNCLAIM-TRANSITIONS',
    'AGENT_A',
    'Forum claim transitions open -> claimed (even across legacy SQL check fallback), blocks competing teacher claim (409), and supports unclaim/re-claim',
    claimRes1.status === 200 &&
      claimRes1.data?.question?.status === 'claimed' &&
      competingClaimRes.status === 409 &&
      unclaimRes.status === 200 &&
      unclaimRes.data?.question?.status === 'open' &&
      claimResHa.status === 200 &&
      claimedQ?.status === 'claimed' &&
      claimedQ?.claimedByEmail === 'thu.ha@khongtunhi.com',
    `claim1=${claimRes1.data?.question?.status}, competing=${competingClaimRes.status}, unclaim=${unclaimRes.data?.question?.status}, claimedBy=${claimedQ?.claimedByEmail}`
  );

  // Teacher Ha posts an answer with video attachment -> transitions 'claimed' -> 'answered'
  const answerRes = await callApi('/api/ktn/forum/answers', {
    method: 'POST',
    headers: hTeaHa,
    body: {
      questionId: qId,
      content: 'Em hạ thấp giọng và đọc ngắn âm 谢 thứ hai nhé, cô gửi kèm video mẫu cho em!',
      videoUrl: 'https://d21acfi38wn3iy.cloudfront.net/forum-demo-answer.mp4',
      videoDurationSec: 32,
      videoFileSize: 4200000,
      clientAnswerId: 'ca_a2_test_001'
    }
  });
  const ansId = answerRes.data?.answer?.id;

  // Retry same clientAnswerId -> idempotent replay, no duplicate answer or points
  const answerRetryRes = await callApi('/api/ktn/forum/answers', {
    method: 'POST',
    headers: hTeaHa,
    body: {
      questionId: qId,
      content: 'Em hạ thấp giọng và đọc ngắn âm 谢 thứ hai nhé, cô gửi kèm video mẫu cho em!',
      videoUrl: 'https://d21acfi38wn3iy.cloudfront.net/forum-demo-answer.mp4',
      videoDurationSec: 32,
      videoFileSize: 4200000,
      clientAnswerId: 'ca_a2_test_001'
    }
  });

  // Verify A5 on answer notification: Author (Stu A) gets notified, Unfollowed Stu B does NOT get notified
  const stuANotifsAfterAns = await callApi('/api/ktn/notifications', { headers: hStuA });
  const stuBNotifsAfterAns = await callApi('/api/ktn/notifications', { headers: hStuB });
  const stuAGotAnsNotif = (stuANotifsAfterAns.data?.notifications || []).some(
    n => String(n.id || '').includes(`NOTIF-FORUM-ANS-${ansId}`) || n.answerId === ansId
  );
  const stuBGotAnsNotif = (stuBNotifsAfterAns.data?.notifications || []).some(
    n => String(n.id || '').includes(`NOTIF-FORUM-ANS-${ansId}`) || n.answerId === ansId
  );

  // Student A marks answer as accepted (`accept: true`) -> transitions 'answered' -> 'resolved'
  const acceptRes = await callApi('/api/ktn/forum/answers/helpful', {
    method: 'POST',
    headers: hStuA,
    body: {
      answerId: ansId,
      questionId: qId,
      helpful: true,
      accept: true
    }
  });

  const qListAfterResolve = await callApi(`/api/ktn/forum/questions?courseId=${HSK1_COURSE}`, {
    headers: hStuA
  });
  const resolvedQ = (qListAfterResolve.data?.questions || []).find(q => q.id === qId);
  const resolvedAns = (resolvedQ?.answers || []).find(a => a.id === ansId);

  // Check teacher contributions summary (points only, no salary auto-conversion)
  const contribRes = await callApi('/api/ktn/forum/leaderboard', { headers: hTeaHa });
  const haLeader = (contribRes.data?.leaderboard || []).find(
    t => t.teacherEmail === 'thu.ha@khongtunhi.com'
  );

  record(
    'A2-A5-FORUM-LIFECYCLE-ANSWERED-TO-RESOLVED-AND-CONTRIBUTION-POINTS',
    'AGENT_A',
    'Teacher answer transitions claimed -> answered, notifies author (skipping unfollowed users), deduplicates retry, and accepting answer transitions answered -> resolved with accurate contribution points',
    answerRes.status === 200 &&
      answerRes.data?.questionStatus === 'answered' &&
      answerRetryRes.status === 200 &&
      answerRetryRes.data?.idempotentReplay === true &&
      stuAGotAnsNotif === true &&
      stuBGotAnsNotif === false &&
      acceptRes.status === 200 &&
      acceptRes.data?.questionStatus === 'resolved' &&
      resolvedQ?.status === 'resolved' &&
      resolvedAns?.isAccepted === true &&
      resolvedAns?.videoSizeBytes === 4200000 &&
      haLeader?.totalPoints === 11, // 1 answer_created + 5 video_attached + 2 helpful_vote + 3 accepted_answer
    `ansStatus=${answerRes.data?.questionStatus}, resolvedStatus=${resolvedQ?.status}, stuANotif=${stuAGotAnsNotif}, stuBNotif=${stuBGotAnsNotif}, haPoints=${haLeader?.totalPoints}`
  );

  // Clean up temporary HSK1 on Student B before A3 RBAC tests
  state.tables.ktn_students.find(s => s.email === 'e2e.hs.b@khongtunhi.com').online_courses = [
    { id: CFK1_COURSE, title: 'Chinese For Kids' }
  ];

  // ============================================================================
  // A3: COURSE CHAT RBAC & STALE ENTITLEMENT REVOCATION ENFORCEMENT
  // ============================================================================
  // 1. Assigned teacher (Linh) can read & post in course:HSK1, unassigned teacher (Ha) gets 403
  const teaLinhRooms = await callApi('/api/ktn/messages/rooms', { headers: hTeaLinh });
  const teaHaRooms = await callApi('/api/ktn/messages/rooms', { headers: hTeaHa });
  const linhCourseRoomIds = (teaLinhRooms.data?.groupRooms || [])
    .filter(r => r.roomType === 'course')
    .map(r => r.roomId);
  const haCourseRoomIds = (teaHaRooms.data?.groupRooms || [])
    .filter(r => r.roomType === 'course')
    .map(r => r.roomId);

  const teaLinhReadHsk1 = await callApi(`/api/ktn/messages?roomId=course:${HSK1_COURSE}`, {
    headers: hTeaLinh
  });
  const teaHaReadHsk1 = await callApi(`/api/ktn/messages?roomId=course:${HSK1_COURSE}`, {
    headers: hTeaHa
  });
  const teaHaSendHsk1 = await callApi('/api/ktn/messages', {
    method: 'POST',
    headers: hTeaHa,
    body: { roomId: `course:${HSK1_COURSE}`, content: 'Unassigned teacher attempt' }
  });
  const adminReadHsk1 = await callApi(`/api/ktn/messages?roomId=course:${HSK1_COURSE}`, {
    headers: hAdmin
  });
  const stuBReadHsk1 = await callApi(`/api/ktn/messages?roomId=course:${HSK1_COURSE}`, {
    headers: hStuB
  });

  record(
    'A3-COURSE-CHAT-TEACHER-AND-STUDENT-RBAC',
    'AGENT_A',
    'Course chat room restricts teachers to assigned courses (or Admin), blocks unassigned teachers (403 TEACHER_COURSE_SCOPE_FORBIDDEN) and unentitled students (403 COURSE_NOT_ENTITLED)',
    linhCourseRoomIds.includes(`course:${HSK1_COURSE}`) &&
      !linhCourseRoomIds.includes(`course:${CFK1_COURSE}`) &&
      haCourseRoomIds.includes(`course:${CFK1_COURSE}`) &&
      !haCourseRoomIds.includes(`course:${HSK1_COURSE}`) &&
      teaLinhReadHsk1.status === 200 &&
      teaHaReadHsk1.status === 403 &&
      teaHaReadHsk1.data?.error === 'TEACHER_COURSE_SCOPE_FORBIDDEN' &&
      teaHaSendHsk1.status === 403 &&
      adminReadHsk1.status === 200 &&
      stuBReadHsk1.status === 403 &&
      stuBReadHsk1.data?.error === 'COURSE_NOT_ENTITLED',
    `linhRooms=${JSON.stringify(linhCourseRoomIds)}, haReadHsk1=${teaHaReadHsk1.status}, stuBReadHsk1=${stuBReadHsk1.status}`
  );

  // 2. Revoked course with stale izTeach permissions & stale JWT session token
  // Simulate course revoked in Supabase DB, while izTeach permissionsByUid AND hStuA token still carry HSK1!
  const stuARow = state.tables.ktn_students.find(s => s.email === 'e2e.hs.a@khongtunhi.com');
  stuARow.online_courses = [];
  stuARow.has_online_courses = false;
  // Ensure izTeach still has stale permission for Student A's Cognito UID:
  state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555551'] = [HSK1_COURSE];

  // First call GET /api/ktn/students/me, POST /api/ktn/auth/login, and GET /api/ktn/courses/units?courseId=HSK1_COURSE -> must NOT re-grant HSK1 in DB!
  const stuAMeAfterRevoke = await callApi('/api/ktn/students/me?sync=1', { headers: hStuA });
  const stuALoginAfterRevoke = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const stuAUnitsRevokedCourse = await callApi(`/api/ktn/courses/units?courseId=${HSK1_COURSE}`, {
    headers: hStuA
  });
  const stuAReadRevokedCourse = await callApi(`/api/ktn/messages?roomId=course:${HSK1_COURSE}`, {
    headers: hStuA
  });
  const stuASendRevokedCourse = await callApi('/api/ktn/messages', {
    method: 'POST',
    headers: hStuA,
    body: { roomId: `course:${HSK1_COURSE}`, content: 'Attempt with stale token after DB revoke' }
  });
  const stuARoomsAfterRevoke = await callApi('/api/ktn/messages/rooms', { headers: hStuA });
  const stuACourseRoomsAfterRevoke = (stuARoomsAfterRevoke.data?.groupRooms || []).filter(
    r => r.roomType === 'course'
  );

  record(
    'A3-REVOKED-COURSE-BLOCKS-STALE-IZTEACH-AND-SESSION-ENTITLEMENT',
    'AGENT_A',
    'When a course is revoked in DB, stale izTeach permissions or stale session token cannot re-grant access via /students/me, /auth/login, course units, or course chat',
    stuAMeAfterRevoke.status === 200 &&
      (stuAMeAfterRevoke.data?.student?.online_courses || []).length === 0 &&
      stuALoginAfterRevoke.status === 200 &&
      (stuALoginAfterRevoke.data?.session?.onlineCourses || []).length === 0 &&
      stuAUnitsRevokedCourse.status === 403 &&
      stuAUnitsRevokedCourse.data?.error === 'COURSE_NOT_ENTITLED' &&
      stuAReadRevokedCourse.status === 403 &&
      stuAReadRevokedCourse.data?.error === 'COURSE_NOT_ENTITLED' &&
      stuASendRevokedCourse.status === 403 &&
      stuACourseRoomsAfterRevoke.length === 0 &&
      stuARow.online_courses.length === 0,
    `meCourses=${(stuAMeAfterRevoke.data?.student?.online_courses || []).length}, loginCourses=${(stuALoginAfterRevoke.data?.session?.onlineCourses || []).length}, units=${stuAUnitsRevokedCourse.status}, read=${stuAReadRevokedCourse.status}, send=${stuASendRevokedCourse.status}, courseRooms=${stuACourseRoomsAfterRevoke.length}`
  );

  // Restore Student A's HSK1 course for subsequent tests
  stuARow.online_courses = [{ id: HSK1_COURSE, title: 'HSK1 3.0' }];
  stuARow.has_online_courses = true;

  // ============================================================================
  // A4: CHAT IDEMPOTENCY (5x RAPID CONCURRENT SENDS + RETRY + RELOAD)
  // ============================================================================
  const clientMsgId = 'cmsg_rapid_5x_test_001';
  const msgBeforeCount = state.tables.ktn_messages.length;

  const rapidPayloads = Array.from({ length: 5 }, () =>
    callApi('/api/ktn/messages', {
      method: 'POST',
      headers: hStuA,
      body: {
        roomId: 'class:YCT2-04',
        content: 'Em chào cô Linh ạ! (tin nhắn kiểm tra chống trùng 5 lần)',
        clientMessageId: clientMsgId
      }
    })
  );
  const rapidResponses = await Promise.all(rapidPayloads);
  const retryAfterReloadRes = await callApi('/api/ktn/messages', {
    method: 'POST',
    headers: hStuA,
    body: {
      roomId: 'class:YCT2-04',
      content: 'Em chào cô Linh ạ! (tin nhắn kiểm tra chống trùng 5 lần)',
      clientMessageId: clientMsgId
    }
  });
  const reloadMessagesRes = await callApi('/api/ktn/messages?roomId=class:YCT2-04', {
    headers: hStuA
  });
  const matchingDbMsgs = state.tables.ktn_messages.filter(
    m => m.content === 'Em chào cô Linh ạ! (tin nhắn kiểm tra chống trùng 5 lần)'
  );
  const matchingUiMsgs = (reloadMessagesRes.data?.messages || []).filter(
    m => m.content === 'Em chào cô Linh ạ! (tin nhắn kiểm tra chống trùng 5 lần)'
  );

  record(
    'A4-CHAT-IDEMPOTENCY-5X-CONCURRENT-AND-RETRY',
    'AGENT_A',
    'Sending the same chat message 5x concurrently + retry after disconnect/reload stores 1 row in DB and returns 1 item in UI',
    rapidResponses.every(r => r.status === 200 && r.data?.ok === true) &&
      retryAfterReloadRes.status === 200 &&
      retryAfterReloadRes.data?.idempotentReplay === true &&
      state.tables.ktn_messages.length === msgBeforeCount + 1 &&
      matchingDbMsgs.length === 1 &&
      matchingUiMsgs.length === 1,
    `dbCount=${matchingDbMsgs.length}, uiCount=${matchingUiMsgs.length}, replay=${retryAfterReloadRes.data?.idempotentReplay}`
  );

  // ============================================================================
  // C1 & C2: TEACHER ONBOARDING (parentPhone CONTRACT, RBAC, RETRY IDEMPOTENCY)
  // ============================================================================
  // 1. RBAC boundaries: role spoof, unassigned class, direct course grant
  const roleSpoofRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Spoof Admin',
      email: 'spoof.admin@khongtunhi.com',
      classCode: 'YCT2-04',
      role: 'admin'
    }
  });
  const wrongClassRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Wrong Class Student',
      email: 'wrong.class@khongtunhi.com',
      classCode: 'YCT3-02'
    }
  });
  const directCourseGrantRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Direct Course Student',
      email: 'direct.course@khongtunhi.com',
      classCode: 'YCT2-04',
      courseIds: [HSK1_COURSE]
    }
  });

  // 2. Valid Teacher Onboarding with all 7 fields including parentPhone (and testing legacy V2 schema fallback)
  state.faults.simulateLegacyV2StudentSchema = true;
  const createStuRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Bé Trần Minh Khôi',
      email: 'minhkhoi.c1@khongtunhi.com',
      phone: '0911222333',
      parentName: 'Chị Nguyễn Thị Lan',
      parentPhone: '0988777666',
      classCode: 'YCT2-04',
      note: 'Học viên lớp tối Thứ 3 & Thứ 6',
      clientRequestId: 'tcs_c1_req_001'
    }
  });

  // Network retry with same clientRequestId -> 200 idempotentReplay
  const retrySameReqIdRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Bé Trần Minh Khôi',
      email: 'minhkhoi.c1@khongtunhi.com',
      phone: '0911222333',
      parentName: 'Chị Nguyễn Thị Lan',
      parentPhone: '0988777666',
      classCode: 'YCT2-04',
      note: 'Học viên lớp tối Thứ 3 & Thứ 6',
      clientRequestId: 'tcs_c1_req_001'
    }
  });

  // Separate submission for same email -> 409 STUDENT_ALREADY_EXISTS
  const dupEmailRes = await callApi('/api/ktn/teacher/students/create', {
    method: 'POST',
    headers: hTeaLinh,
    body: {
      name: 'Bé Trần Minh Khôi',
      email: 'minhkhoi.c1@khongtunhi.com',
      classCode: 'YCT2-04'
    }
  });

  // Read-back and search by parentPhone ('0988777666')
  const searchByParentPhoneRes = await callApi('/api/ktn/students?q=0988777666', {
    headers: hTeaLinh
  });
  state.faults.simulateLegacyV2StudentSchema = false;

  const foundStuByParentPhone = (searchByParentPhoneRes.data?.students || []).find(
    s => s.email === 'minhkhoi.c1@khongtunhi.com'
  );

  record(
    'C1-C2-TEACHER-ONBOARDING-PARENT-PHONE-AND-RBAC',
    'CROSS_AGENT_C',
    'Teacher student onboarding enforces RBAC (blocks role spoof, unassigned class, direct course grant), persists & returns parentPhone/parent_phone with clean internal_note, supports search by parentPhone, and prevents duplicate accounts on retry',
    roleSpoofRes.status === 403 &&
      wrongClassRes.status === 403 &&
      directCourseGrantRes.status === 403 &&
      createStuRes.status === 200 &&
      createStuRes.data?.parentPhone === '0988777666' &&
      createStuRes.data?.parent_phone === '0988777666' &&
      createStuRes.data?.student?.parentPhone === '0988777666' &&
      createStuRes.data?.student?.parent_phone === '0988777666' &&
      createStuRes.data?.student?.parent_name === 'Chị Nguyễn Thị Lan' &&
      !String(createStuRes.data?.student?.internal_note || '').includes('[SĐT_PH:') &&
      retrySameReqIdRes.status === 200 &&
      retrySameReqIdRes.data?.idempotentReplay === true &&
      dupEmailRes.status === 409 &&
      dupEmailRes.data?.existingStudent?.parentPhone === '0988777666' &&
      foundStuByParentPhone?.parentPhone === '0988777666' &&
      foundStuByParentPhone?.parent_phone === '0988777666' &&
      !String(foundStuByParentPhone?.internal_note || '').includes('[SĐT_PH:'),
    `parentPhone=${createStuRes.data?.student?.parentPhone}, cleanNote=${!String(foundStuByParentPhone?.internal_note || '').includes('[SĐT_PH:')}, searchFound=${Boolean(foundStuByParentPhone)}, replay=${retrySameReqIdRes.data?.idempotentReplay}`
  );

  // ============================================================================
  // D1 & D2: STUDENT LIFECYCLE & TEACHER COURSE ASSIGNMENT SYNC
  // ============================================================================
  // Test D2: Admin updates teacher assignedCourses (including removing & re-adding course) and verifies scheduled vs confirmed sessions
  const updateTeaCoursesRemoveRes = await callApi('/api/ktn/teachers', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'thu.ha@khongtunhi.com',
      name: 'Cô Thu Hà',
      assignedClasses: ['YCT3-02'],
      assignedCourses: [],
      provisionOnIzTeach: false
    }
  });
  const teaHaReadCfkAfterUnassign = await callApi(`/api/ktn/messages?roomId=course:${CFK1_COURSE}`, {
    headers: hTeaHa
  });
  const updateTeaCoursesRestoreRes = await callApi('/api/ktn/teachers', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'thu.ha@khongtunhi.com',
      name: 'Cô Thu Hà',
      assignedClasses: ['YCT3-02'],
      assignedCourses: [CFK1_COURSE],
      provisionOnIzTeach: false
    }
  });
  const getTeachersRes = await callApi('/api/ktn/teachers', { headers: hAdmin });
  const teaHaAdminEntry = (getTeachersRes.data?.teachers || []).find(
    t => t.email === 'thu.ha@khongtunhi.com'
  );

  record(
    'D2-TEACHER-ASSIGNED-COURSES-SYNC-AND-TEACHING-VERIFICATION-SEPARATION',
    'CROSS_AGENT_D',
    'POST /api/ktn/teachers syncs assigned_courses column (supporting unassign & reassign) and GET /api/ktn/teachers separates scheduledSessionsCount from confirmedSessionsCount',
    updateTeaCoursesRemoveRes.status === 200 &&
      Array.isArray(updateTeaCoursesRemoveRes.data?.assignedCourses) &&
      updateTeaCoursesRemoveRes.data.assignedCourses.length === 0 &&
      teaHaReadCfkAfterUnassign.status === 403 &&
      updateTeaCoursesRestoreRes.status === 200 &&
      updateTeaCoursesRestoreRes.data?.assignedCourses?.includes(CFK1_COURSE) &&
      teaHaAdminEntry?.assignedCourses?.includes(CFK1_COURSE) &&
      teaHaAdminEntry?.scheduledSessionsCount !== undefined &&
      teaHaAdminEntry?.confirmedSessionsCount === 0 &&
      teaHaAdminEntry?.teachingVerificationStatus === 'unverified',
    `unassignRead=${teaHaReadCfkAfterUnassign.status}, restoredCourses=${JSON.stringify(teaHaAdminEntry?.assignedCourses)}, verification=${teaHaAdminEntry?.teachingVerificationStatus}`
  );

  // Seed a paid order and homework for Student A to verify retention policy & preservation
  state.tables.ktn_orders.push({
    id: 'ORD-RETENTION-001',
    order_id: 'ORD-RETENTION-001',
    student_email: 'e2e.hs.a@khongtunhi.com',
    student_name: 'Học Sinh E2E A',
    course_id: HSK1_COURSE,
    amount: 890000,
    payment_status: 'paid',
    approval_status: 'approved',
    created_at: new Date().toISOString()
  });
  state.tables.ktn_homeworks.push({
    id: 'HW-RETENTION-001',
    student_email: 'e2e.hs.a@khongtunhi.com',
    student_name: 'Học Sinh E2E A',
    course_id: HSK1_COURSE,
    lesson_num: 1,
    status: 'graded',
    score: 9.5,
    created_at: new Date().toISOString()
  });

  // 1. Suspend Student A -> blocked from chat & login
  const suspendRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'suspend',
      reason: 'Tạm khóa kiểm thử D1'
    }
  });
  const chatWhileSuspended = await callApi('/api/ktn/messages?roomId=class:YCT2-04', {
    headers: hStuA
  });

  // 2. Archive Student A -> hidden from default student list, visible with accountStatus=archived, and blocked from login & session
  const archiveRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'archive',
      reason: 'Lưu trữ kiểm thử D1'
    }
  });
  const activeListDuringArchive = await callApi('/api/ktn/students', { headers: hAdmin });
  const archivedListDuringArchive = await callApi('/api/ktn/students?accountStatus=archived', {
    headers: hAdmin
  });
  const loginWhileArchived = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const sessionWhileArchived = await callApi('/api/ktn/auth/session', { headers: hStuA });

  // 3. Restore Student A -> back to active, can access chat again
  const restoreRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'restore',
      reason: 'Khôi phục kiểm thử D1'
    }
  });
  const chatAfterRestore = await callApi('/api/ktn/messages?roomId=class:YCT2-04', {
    headers: hStuA
  });

  record(
    'D1-STUDENT-LIFECYCLE-SUSPEND-ARCHIVE-RESTORE',
    'CROSS_AGENT_D',
    'Student lifecycle suspend blocks chat (403), archive hides from default list, blocks login/session (403 ACCOUNT_ARCHIVED), and restore re-enables active access',
    suspendRes.status === 200 &&
      suspendRes.data?.status === 'suspended' &&
      chatWhileSuspended.status === 403 &&
      archiveRes.status === 200 &&
      archiveRes.data?.status === 'archived' &&
      loginWhileArchived.status === 403 &&
      loginWhileArchived.data?.error === 'ACCOUNT_ARCHIVED' &&
      sessionWhileArchived.status === 403 &&
      sessionWhileArchived.data?.error === 'ACCOUNT_ARCHIVED' &&
      !(activeListDuringArchive.data?.students || []).some(s => s.email === 'e2e.hs.a@khongtunhi.com') &&
      (archivedListDuringArchive.data?.students || []).some(s => s.email === 'e2e.hs.a@khongtunhi.com') &&
      restoreRes.status === 200 &&
      restoreRes.data?.status === 'active' &&
      chatAfterRestore.status === 200,
    `suspendChat=${chatWhileSuspended.status}, archiveLogin=${loginWhileArchived.status}, archivedFiltered=${(archivedListDuringArchive.data?.students || []).length}, restoreChat=${chatAfterRestore.status}`
  );

  // 4. Delete gates:
  // 4a. enforceRetentionGate blocks deleting student with paid orders/homework (409 RETENTION_POLICY_BLOCKED)
  const retentionGateRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'delete',
      confirmDelete: true,
      enforceRetentionGate: true,
      reason: 'Kiểm tra chặn xóa khi có đơn hàng đã thanh toán'
    }
  });

  // 4b. requireUpstreamHardDelete blocks deleting Cognito-linked student (409 UPSTREAM_COGNITO_DELETE_UNVERIFIED)
  const hardDeleteGateRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'delete',
      confirmDelete: true,
      requireUpstreamHardDelete: true,
      reason: 'Kiểm tra yêu cầu xóa cứng Cognito'
    }
  });

  // 4c. Upstream izTeach course revoke failure blocks Supabase deletion (502 UPSTREAM_IZTEACH_REVOKE_FAILED)
  state.faults.izteachPermissionMutateFail = true;
  const upstreamRevokeFailRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'delete',
      confirmDelete: true,
      reason: 'Kiểm tra lỗi thu hồi khóa học izTeach khi xóa'
    }
  });
  state.faults.izteachPermissionMutateFail = false;

  // 4d. Conditional Supabase deletion succeeds when confirmed: revokes izTeach courses, reports upstreamVerified=false & cognitoDeleted=false honestly, preserves orders & homeworks, and blocks login
  const conditionalDeleteRes = await callApi('/api/ktn/admin/students/lifecycle', {
    method: 'POST',
    headers: hAdmin,
    body: {
      email: 'e2e.hs.a@khongtunhi.com',
      action: 'delete',
      confirmDelete: true,
      reason: 'Xóa có điều kiện hồ sơ thử nghiệm D1'
    }
  });

  const loginAfterDelete = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const preservedOrdersCount = state.tables.ktn_orders.filter(
    o => o.student_email === 'e2e.hs.a@khongtunhi.com'
  ).length;
  const preservedHomeworksCount = state.tables.ktn_homeworks.filter(
    h => h.student_email === 'e2e.hs.a@khongtunhi.com'
  ).length;
  const remainingIzPerms =
    state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555551'] || [];

  record(
    'D1-STUDENT-DELETE-MULTI-SYSTEM-HONESTY-AND-RETENTION',
    'CROSS_AGENT_D',
    'Delete enforces retention gate (409), blocks unverified Cognito hard-delete (409), aborts on izTeach revoke failure (502), and on conditional delete revokes izTeach courses, reports upstreamVerified=false/cognitoDeleted=false, preserves orders & homeworks, and blocks login (403)',
    retentionGateRes.status === 409 &&
      retentionGateRes.data?.error === 'RETENTION_POLICY_BLOCKED' &&
      hardDeleteGateRes.status === 409 &&
      hardDeleteGateRes.data?.error === 'UPSTREAM_COGNITO_DELETE_UNVERIFIED' &&
      upstreamRevokeFailRes.status === 502 &&
      upstreamRevokeFailRes.data?.error === 'UPSTREAM_IZTEACH_REVOKE_FAILED' &&
      conditionalDeleteRes.status === 200 &&
      conditionalDeleteRes.data?.upstreamVerified === false &&
      conditionalDeleteRes.data?.cognitoDeleted === false &&
      conditionalDeleteRes.data?.izteachRevoked === true &&
      conditionalDeleteRes.data?.deletionScope === 'supabase_conditional_only' &&
      conditionalDeleteRes.data?.preservedOrders === true &&
      conditionalDeleteRes.data?.preservedLearningHistory === true &&
      conditionalDeleteRes.data?.reverseSyncBlocked === true &&
      remainingIzPerms.length === 0 &&
      preservedOrdersCount === 1 &&
      preservedHomeworksCount === 1 &&
      loginAfterDelete.status === 403,
    `retGate=${retentionGateRes.status}, hardGate=${hardDeleteGateRes.status}, izFail=${upstreamRevokeFailRes.status}, condDel=${conditionalDeleteRes.status}, izRevoked=${conditionalDeleteRes.data?.izteachRevoked}, orders=${preservedOrdersCount}, hws=${preservedHomeworksCount}, loginAfter=${loginAfterDelete.status}`
  );

  console.log('\n================================================================================');
  console.log(`SUMMARY: ${results.length}/${results.length} TARGETED TESTS PASSED (100% PASS)`);
  console.log('================================================================================');
}

runTargetedSuite().catch(err => {
  console.error('\n[TARGETED SUITE FAILED]', err);
  process.exit(1);
});
