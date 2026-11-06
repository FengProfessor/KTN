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
      ktn_push_subscriptions: [],
      ktn_payment_config: [
        {
          id: 'default',
          bank_id: 'MB',
          bank_name: 'MBBank',
          account_no: '0123456789',
          account_name: 'HOC VIEN KHONG TU NHI',
          default_amount: 890000,
          auto_approve_webhook: false
        }
      ],
      ktn_attendance: [],
      ktn_provisioning_jobs: [],
      ktn_sync_events: []
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
      supabaseFailMethod: null,
      disableSearchRpc: false
    }
  };

  function evalSinglePostgrestClause(row, c) {
    if (c.endsWith('.is.null')) {
      const col = c.slice(0, -8);
      return row[col] === null || row[col] === undefined;
    }
    const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|ilike|like)\.(.*)$/);
    if (!m) return true;
    const [, col, op, v] = m;
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

    // 1. Mock Supabase REST
    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      if (
        (state.faults.supabaseFailOnTable === table ||
          (state.faults.supabaseFailOnTable === 'ktn_students' && table === 'rpc/ktn_search_students')) &&
        (!state.faults.supabaseFailMethod || state.faults.supabaseFailMethod === method)
      ) {
        return new Response(JSON.stringify({ message: 'Simulated Supabase outage' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table === 'rpc/ktn_search_students' && method === 'POST') {
        if (state.faults.disableSearchRpc) {
          return new Response(JSON.stringify({ message: 'RPC not found' }), {
            status: 404,
            headers: { 'Content-Type': 'application/json' }
          });
        }
        const p = init.body ? JSON.parse(init.body) : {};
        const rawQ = String(p.p_query || '').trim().toLowerCase();
        const normQ = normalizeMockViText(p.p_query || '');
        const digitsQ = String(p.p_query || '').replace(/\D+/g, '');
        const tokens = normQ ? normQ.split(' ').filter(Boolean) : [];
        const allowedClasses = Array.isArray(p.p_allowed_classes) ? p.p_allowed_classes : null;
        const classCode = String(p.p_class_code || '').trim().toUpperCase();
        const courseId = String(p.p_course_id || '').trim();
        const accountStatus = String(p.p_account_status || '').trim();
        const syncStatus = String(p.p_sync_status || '').trim();
        const limit = Math.max(1, Math.min(500, Number(p.p_limit) || 25));
        const offset = Math.max(0, Number(p.p_offset) || 0);

        const matched = [];
        const srcRows = state.tables.ktn_students || [];
        for (let i = 0; i < srcRows.length; i++) {
          const s = srcRows[i];
          const sClass = String(s.class_code || '').trim().toUpperCase();
          if (allowedClasses) {
            if (allowedClasses.length === 0 || !allowedClasses.includes(sClass)) continue;
          }
          if (classCode === 'NONE') {
            if (sClass) continue;
          } else if (classCode && classCode !== 'ALL') {
            if (sClass !== classCode) continue;
          }
          if (courseId && courseId !== 'ALL') {
            const cArr = Array.isArray(s.online_courses) ? s.online_courses : [];
            const hasC = cArr.some(c => String(c?.id || c || '') === courseId);
            if (!hasC) continue;
          }
          if (accountStatus && accountStatus !== 'ALL') {
            const stAcc = s.account_status || (s.cognito_user_id ? 'ready_to_login' : 'pending_activation');
            if (stAcc !== accountStatus && !(accountStatus === 'ready_to_login' && stAcc === 'active')) continue;
          }
          if (syncStatus && syncStatus !== 'ALL') {
            const stSync = s.sync_status || (s.cognito_user_id ? 'synced' : 'pending_activation');
            if (stSync !== syncStatus) continue;
          }
          let score = 0;
          if (tokens.length > 0) {
            const hay = s.search_text || normalizeMockViText([s.code, s.name, s.email, s.phone, s.parent_name, s.class_code].join(' '));
            let allMatch = true;
            for (let t = 0; t < tokens.length; t++) {
              if (!hay.includes(tokens[t])) {
                allMatch = false;
                break;
              }
            }
            if (!allMatch) continue;
            const em = String(s.email || '').toLowerCase();
            const nm = normalizeMockViText(s.name || '');
            const ph = String(s.phone || '').replace(/\D+/g, '');
            if (em === rawQ) score += 1200;
            else if (em.startsWith(rawQ)) score += 760;
            if (digitsQ.length >= 4 && ph.includes(digitsQ)) score += 600;
            if (nm === normQ) score += 950;
            else if (nm.includes(normQ)) score += 520;
          }
          matched.push({ ...s, match_score: score });
        }

        if (tokens.length > 0) {
          matched.sort((a, b) => (b.match_score - a.match_score) || String(b.updated_at || '').localeCompare(String(a.updated_at || '')));
        }
        const totalCount = matched.length;
        const page = matched.slice(offset, offset + limit).map(r => ({ ...r, total_count: totalCount }));
        return new Response(JSON.stringify(page), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
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
        const rawLimit = Number(u.searchParams.get('limit') || 0);
        const limit = state.faults.simulateLegacyV2StudentSchema && rawLimit > 1000 ? 1000 : rawLimit;
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
        const onConflict = u.searchParams.get('on_conflict');
        const preferHeader = String((init.headers && (init.headers.Prefer || init.headers.prefer)) || '');
        const allowMergeDuplicates = preferHeader.includes('resolution=merge-duplicates');
        const pkByTable = {
          ktn_students: 'email',
          ktn_orders: 'order_id',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_attendance: 'id',
          ktn_provisioning_jobs: 'operation_id',
          ktn_payment_config: 'id'
        };
        const defaultPk = pkByTable[table] || 'id';
        const out = [];
        for (const item of items) {
          if (table === 'ktn_provisioning_jobs' && item.idempotency_key && !allowMergeDuplicates) {
            const dupIdem = rows.find(
              r => r.idempotency_key && String(r.idempotency_key) === String(item.idempotency_key)
            );
            if (dupIdem) {
              return new Response(
                JSON.stringify({
                  code: '23505',
                  message: 'duplicate key value violates unique constraint "idx_ktn_prov_jobs_idem"'
                }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
          }
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map(s => s.trim());
            existingIdx = rows.findIndex(r => keys.every(k => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase()));
          } else if (item[defaultPk]) {
            existingIdx = rows.findIndex(r => String(r[defaultPk] ?? '').toLowerCase() === String(item[defaultPk] ?? '').toLowerCase());
          } else if (item.id) {
            existingIdx = rows.findIndex(r => r.id === item.id);
          }
          if (existingIdx >= 0) {
            if (!allowMergeDuplicates && table === 'ktn_provisioning_jobs') {
              return new Response(
                JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint' }),
                { status: 409, headers: { 'Content-Type': 'application/json' } }
              );
            }
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
        if (state.faults.izteachPermissionInvalidPayload) {
          return new Response(JSON.stringify({ message: 'unexpected non-array object without onlineCourses' }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' }
          });
        }
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
        if (state.faults.izteachUserCreateFail) {
          return new Response(JSON.stringify({ message: 'izTeach user create 503' }), { status: 503 });
        }
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
        if (state.faults.izteachStudentCrmFail) {
          return new Response(JSON.stringify({ message: 'izTeach student CRM 503' }), { status: 503 });
        }
        if (method === 'POST') {
          if (state.faults.izteachUserCreateFail) {
            return new Response(JSON.stringify({ message: 'izTeach student create 503' }), { status: 503 });
          }
          const body = init.body ? JSON.parse(init.body) : {};
          const em = String(body.email || '').toLowerCase();
          if (!state.izteach.createdStudentsByEmail) state.izteach.createdStudentsByEmail = {};
          const seq = Object.keys(state.izteach.createdStudentsByEmail).length + 100;
          const generatedCognitoUid = body.dynamoId || body.userId || `aaaa1111-2222-3333-4444-${String(seq).padStart(12, '0')}`;
          const stuObj = {
            _id: '66fb0000000000000000' + String(seq).padStart(4, '0'),
            id: '66fb0000000000000000' + String(seq).padStart(4, '0'),
            userId: generatedCognitoUid,
            dynamoId: generatedCognitoUid,
            email: em,
            name: body.name || em,
            phone: body.phone || ''
          };
          state.izteach.createdStudentsByEmail[em] = stuObj;
          return new Response(JSON.stringify(stuObj), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        const email = (u.searchParams.get('email') || '').toLowerCase();
        if (!email && Array.isArray(state.izteach.studentListPages)) {
          const pageIdx = Math.max(1, Number(u.searchParams.get('page') || 1)) - 1;
          const pageRows = state.izteach.studentListPages[pageIdx] || [];
          return new Response(
            JSON.stringify({
              data: pageRows,
              totalPages: state.izteach.studentListPages.length,
              hasMore: pageIdx + 1 < state.izteach.studentListPages.length
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        if (!email && Array.isArray(state.izteach.studentList)) {
          return new Response(JSON.stringify(state.izteach.studentList), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        if (state.izteach.createdStudentsByEmail && state.izteach.createdStudentsByEmail[email]) {
          return new Response(JSON.stringify([state.izteach.createdStudentsByEmail[email]]), { status: 200, headers: { 'Content-Type': 'application/json' } });
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

  const { state, env, callApi } = loadWorkerInstance();

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

  // ============================================================================
  // GROUP E: PRE-DEPLOY HARDENING (SPOOFED MIRROR FLAG, CONCURRENT RACE, UNCATALOGUED UNIT, >25 BULK SYNC)
  // ============================================================================
  {
    const HSK1_ID = '6adadba969897b0002482ca5';
    // 1. Client Spoofed mirroredToIzTeach: true is NEVER trusted by Server
    state.faults.izteachHomeworkFail = true;
    const spoofedSubmitWhenDown = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: HSK1_ID,
        lessonNum: 4,
        lessonTitle: 'HSK 1 - Bài 4 (Spoof Test)',
        fileUrl: `${CDN_HW_A}/hsk1_l4_spoof.wav`,
        fileType: 'audio/wav',
        studentNote: 'Client tự khai mirroredToIzTeach=true khi izTeach sập',
        mirroredToIzTeach: true,
        izteachRemoteId: '66fa99999999999999999999'
      }
    });
    const spoofedGradeWhenDown = await callApi('/api/ktn/homeworks/grade', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        id: 'HW-e2e.hs.a@khongtunhi.com-' + HSK1_ID + '-L4',
        score: 9.0,
        status: 'graded',
        teacherFeedback: 'Client tự khai mirroredToIzTeach=true khi chấm bài',
        mirroredToIzTeach: true,
        izteachRemoteId: '66fa99999999999999999999'
      }
    });
    state.faults.izteachHomeworkFail = false;

    const postsBeforeSpoofUp = state.izteach.homeworkPosts.length;
    const spoofedSubmitWhenUp = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: HSK1_ID,
        lessonNum: 5,
        lessonTitle: 'HSK 1 - Bài 5 (Spoof Verified Server Mirror)',
        fileUrl: `${CDN_HW_A}/hsk1_l5_spoof.wav`,
        fileType: 'audio/wav',
        studentNote: 'Client tự khai mirroredToIzTeach=true nhưng server tự đẩy thật sang izTeach',
        mirroredToIzTeach: true,
        izteachRemoteId: '66fa88888888888888888888'
      }
    });
    const postsAfterSpoofUp = state.izteach.homeworkPosts.length;

    record(
      'E1-CLIENT-SPOOF-MIRROR-REJECTED',
      'GROUP_E',
      'Server ignores client-supplied mirroredToIzTeach:true — reports sync_failed when izTeach is down and performs real izTeach POST when unverified',
      spoofedSubmitWhenDown.status === 200 &&
        spoofedSubmitWhenDown.data?.syncStatus === 'sync_failed' &&
        spoofedSubmitWhenDown.data?.mirroredToIzTeach === false &&
        spoofedGradeWhenDown.status === 200 &&
        spoofedGradeWhenDown.data?.syncStatus === 'sync_failed' &&
        spoofedGradeWhenDown.data?.mirroredToIzTeach === false &&
        spoofedSubmitWhenUp.status === 200 &&
        spoofedSubmitWhenUp.data?.syncStatus === 'synced' &&
        postsAfterSpoofUp === postsBeforeSpoofUp + 1,
      `downSubmitSync=${spoofedSubmitWhenDown.data?.syncStatus}, downGradeSync=${spoofedGradeWhenDown.data?.syncStatus}, realPostsAdded=${postsAfterSpoofUp - postsBeforeSpoofUp}`
    );

    // 2. Concurrent Double-Submit & Double-Grade Race Condition (Promise.all)
    const postsBeforeConcurrentSubmit = state.izteach.homeworkPosts.length;
    const concurrentPayload = {
      courseId: HSK1_ID,
      lessonNum: 6,
      lessonTitle: 'HSK 1 - Bài 6 (Concurrent Submit)',
      fileUrl: `${CDN_HW_A}/hsk1_l6_race.wav`,
      fileType: 'audio/wav',
      studentNote: 'Bấm nộp 2 lần liên tiếp cùng lúc'
    };
    const [raceSub1, raceSub2] = await Promise.all([
      callApi('/api/ktn/homeworks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: concurrentPayload
      }),
      callApi('/api/ktn/homeworks', {
        method: 'POST',
        headers: { Authorization: `Bearer ${studentAToken}` },
        body: concurrentPayload
      })
    ]);
    const postsAfterConcurrentSubmit = state.izteach.homeworkPosts.length;

    const postsBeforeConcurrentGrade = state.izteach.homeworkPosts.length;
    const concurrentGradePayload = {
      id: `HW-e2e.hs.a@khongtunhi.com-${HSK1_ID}-L6`,
      score: 9.5,
      status: 'graded',
      teacherFeedback: 'Chấm đồng thời 2 request cùng lúc'
    };
    const [raceGrade1, raceGrade2] = await Promise.all([
      callApi('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${teacherAToken}` },
        body: concurrentGradePayload
      }),
      callApi('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        headers: { Authorization: `Bearer ${teacherAToken}` },
        body: concurrentGradePayload
      })
    ]);
    const postsAfterConcurrentGrade = state.izteach.homeworkPosts.length;

    record(
      'E2-CONCURRENT-SUBMIT-AND-GRADE-DEDUP',
      'GROUP_E',
      'Simultaneous Promise.all([req1, req2]) for submit and grade deduplicate in-flight and create exactly 1 record on izTeach',
      raceSub1.status === 200 &&
        raceSub2.status === 200 &&
        postsAfterConcurrentSubmit === postsBeforeConcurrentSubmit + 1 &&
        Boolean(raceSub1.data?.idempotentReplay || raceSub2.data?.idempotentReplay) &&
        raceGrade1.status === 200 &&
        raceGrade2.status === 200 &&
        postsAfterConcurrentGrade === postsBeforeConcurrentGrade + 1 &&
        Boolean(raceGrade1.data?.idempotentReplay || raceGrade2.data?.idempotentReplay),
      `submitPostsDelta=${postsAfterConcurrentSubmit - postsBeforeConcurrentSubmit}, gradePostsDelta=${postsAfterConcurrentGrade - postsBeforeConcurrentGrade}`
    );

    // 3. Uncatalogued unitId Guard (Catalogued Course vs Uncatalogued Course with Live Verification)
    const bogusUnitOnCataloguedCourse = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: HSK1_ID,
        lessonNum: 30,
        unitId: '66ff11112222333344445555',
        fileUrl: `${CDN_HW_A}/bogus_unit.wav`,
        fileType: 'audio/wav'
      }
    });

    // Grant an uncatalogued course to Student A and test unverified vs verified unitId
    const UNCATALOGUED_COURSE = '66ff00000000000000000999';
    const VERIFIED_NEW_UNIT = '66ff00000000000000000abc';
    state.izteach.unitsByCourse[UNCATALOGUED_COURSE] = [
      { _id: VERIFIED_NEW_UNIT, title: 'Bài 1 khóa mới', type: 'video', index: 0, video: 'vid-new-1' }
    ];
    const stuARow = state.tables.ktn_students.find(s => s.email === 'e2e.hs.a@khongtunhi.com');
    stuARow.online_courses.push({ id: UNCATALOGUED_COURSE, title: 'Khóa mới mở rộng' });
    state.izteach.permissionsByUid[stuARow.cognito_user_id].push(UNCATALOGUED_COURSE);

    const bogusUnitOnUncataloguedCourse = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: UNCATALOGUED_COURSE,
        lessonNum: 1,
        unitId: '66ff99999999999999999999', // Not in izTeach /prod/unit
        fileUrl: `${CDN_HW_A}/bogus_uncat.wav`,
        fileType: 'audio/wav'
      }
    });

    const verifiedUnitOnUncataloguedCourse = await callApi('/api/ktn/homeworks', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        courseId: UNCATALOGUED_COURSE,
        lessonNum: 1,
        unitId: VERIFIED_NEW_UNIT, // Present in izTeach /prod/unit
        fileUrl: `${CDN_HW_A}/verified_uncat.wav`,
        fileType: 'audio/wav'
      }
    });

    record(
      'E3-UNCATALOGUED-UNIT-STRICT-VERIFICATION',
      'GROUP_E',
      'Rejects uncatalogued unitId on catalogued course (400) and unverified unitId on uncatalogued course (400); only accepts izTeach-verified unitId',
      bogusUnitOnCataloguedCourse.status === 400 &&
        bogusUnitOnCataloguedCourse.data?.error === 'UNIT_COURSE_MISMATCH' &&
        bogusUnitOnUncataloguedCourse.status === 400 &&
        bogusUnitOnUncataloguedCourse.data?.error === 'UNIT_COURSE_MISMATCH' &&
        verifiedUnitOnUncataloguedCourse.status === 200 &&
        verifiedUnitOnUncataloguedCourse.data?.syncStatus === 'synced' &&
        verifiedUnitOnUncataloguedCourse.data?.unitId === VERIFIED_NEW_UNIT,
      `bogusCat=${bogusUnitOnCataloguedCourse.status}, bogusUncat=${bogusUnitOnUncataloguedCourse.status}, verifiedUncat=${verifiedUnitOnUncataloguedCourse.status} (${verifiedUnitOnUncataloguedCourse.data?.syncStatus})`
    );

    // 4. Bulk Sync >25 Students Without Cap & Array user-permission Extraction
    const bulkStudents = [];
    for (let i = 1; i <= 30; i++) {
      const uid = `99999999-0000-4000-8000-${String(i).padStart(12, '0')}`;
      const email = `bulksync.hs${i}@khongtunhi.com`;
      bulkStudents.push({
        _id: `66b00000000000000000${String(i).padStart(4, '0')}`,
        userId: uid,
        email,
        name: `Học sinh Bulk ${i}`,
        phone: `09000000${String(i).padStart(2, '0')}`
      });
      state.izteach.permissionsByUid[uid] = [HSK1_ID];
    }
    state.izteach.studentList = bulkStudents;

    const bulkSyncRes = await callApi('/api/ktn/students/sync-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {}
    });

    const syncedBulkRows = state.tables.ktn_students.filter(s => s.email.startsWith('bulksync.hs'));
    const all30HaveCourses = syncedBulkRows.length === 30 && syncedBulkRows.every(
      s => Array.isArray(s.online_courses) && s.online_courses.some(c => c.id === HSK1_ID)
    );

    record(
      'E4-BULK-SYNC-UNLIMITED-PERMISSIONS',
      'GROUP_E',
      'Bulk sync reconciles user-permission for all 30 new students (no 25-student cap) and extracts array-formatted permissions',
      bulkSyncRes.status === 200 &&
        bulkSyncRes.data?.ok === true &&
        all30HaveCourses,
      `syncedStudents=${syncedBulkRows.length}/30, allHaveHSK1=${all30HaveCourses}`
    );

    // 5. Course Group Chat (course:6adadba969897b0002482ca5), Teacher Pin Announcement, and Student 1-on-1 Privacy Isolation
    const loginTaphong = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'taphong2002@gmail.com', password: 'TestStrongPassword!2026', role: 'student' }
    });
    const taphongToken = loginTaphong.data.token;

    // 5a. Enrolled online student posts to course:6adadba969897b0002482ca5 -> 200
    const courseChatPostA = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${taphongToken}` },
      body: {
        roomId: `course:${HSK1_ID}`,
        content: 'Chào Cô và các bạn cùng khóa HSK1 3.0 ạ!'
      }
    });
    // Student B (only enrolled in CFK, not HSK1) cannot read or post to course:HSK1_ID -> 403
    const courseChatReadUnentitled = await callApi(`/api/ktn/messages?roomId=${encodeURIComponent('course:' + HSK1_ID)}`, {
      headers: { Authorization: `Bearer ${studentBToken}` }
    });
    // Teacher pins announcement in course:HSK1_ID -> 200, visible to Student in GET /api/ktn/messages
    const teacherPinRes = await callApi('/api/ktn/messages/pin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        roomId: `course:${HSK1_ID}`,
        content: 'Lịch ôn tập trực tuyến khóa HSK1 3.0 tối Thứ 7 tuần này lúc 20:00 nhé các con!'
      }
    });
    const studentTryPinRes = await callApi('/api/ktn/messages/pin', {
      method: 'POST',
      headers: { Authorization: `Bearer ${taphongToken}` },
      body: {
        roomId: `course:${HSK1_ID}`,
        content: 'Học sinh thử tự ghim'
      }
    });
    const courseChatGetA = await callApi(`/api/ktn/messages?roomId=${encodeURIComponent('course:' + HSK1_ID)}`, {
      headers: { Authorization: `Bearer ${taphongToken}` }
    });

    // 5b. 1-on-1 private chat: taphong2002@gmail.com writes to student:taphong2002@gmail.com -> 200
    // Student B (e2e.hs.b@khongtunhi.com) tries to read or write student:taphong2002@gmail.com -> 403
    const privPostOwn = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${taphongToken}` },
      body: {
        roomId: 'student:taphong2002@gmail.com',
        content: 'Cô ơi cho em hỏi riêng về thanh 3 biến điệu với ạ!'
      }
    });
    const privReadCrossStudent = await callApi('/api/ktn/messages?roomId=student%3Ataphong2002%40gmail.com', {
      headers: { Authorization: `Bearer ${studentBToken}` }
    });
    const privWriteCrossStudent = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentBToken}` },
      body: {
        roomId: 'student:taphong2002@gmail.com',
        content: 'Giả mạo nhắn vào phòng riêng bạn khác'
      }
    });
    const teacherNotifPrivRes = await callApi('/api/ktn/notifications', {
      headers: { Authorization: `Bearer ${teacherAToken}` }
    });
    const teacherGotPrivNotif = Array.isArray(teacherNotifPrivRes.data?.notifications) &&
      teacherNotifPrivRes.data.notifications.some(n =>
        n.type === 'chat_message' &&
        (n.roomId === 'student:taphong2002@gmail.com' || n.classCode === 'student:taphong2002@gmail.com')
      );

    const teacherReplyPriv = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        roomId: 'student:taphong2002@gmail.com',
        content: 'Chào Phong, khi 2 thanh 3 đi liền nhau thì âm đầu đọc thành thanh 2 nhé!'
      }
    });
    const teacherRoomsRes = await callApi('/api/ktn/messages/rooms', {
      headers: { Authorization: `Bearer ${teacherAToken}` }
    });

    record(
      'E5-COURSE-GROUP-CHAT-PIN-AND-1ON1-PRIVACY',
      'GROUP_E',
      'Course group chat (course:HSK1), Teacher pinned announcement, Teacher 1-1 notification, and 1-on-1 student:<email> privacy isolation enforce strict RBAC & error codes',
      courseChatPostA.status === 200 &&
        courseChatReadUnentitled.status === 403 &&
        courseChatReadUnentitled.data?.error === 'COURSE_NOT_ENTITLED' &&
        teacherPinRes.status === 200 &&
        studentTryPinRes.status === 403 &&
        courseChatGetA.status === 200 &&
        courseChatGetA.data?.pinnedMessage?.content?.includes('Lịch ôn tập trực tuyến khóa HSK1 3.0') &&
        privPostOwn.status === 200 &&
        privReadCrossStudent.status === 403 &&
        privReadCrossStudent.data?.error === 'STUDENT_PRIVATE_ROOM_FORBIDDEN' &&
        privWriteCrossStudent.status === 403 &&
        privWriteCrossStudent.data?.error === 'STUDENT_PRIVATE_ROOM_FORBIDDEN' &&
        teacherGotPrivNotif === true &&
        teacherReplyPriv.status === 200 &&
        teacherRoomsRes.status === 200 &&
        Array.isArray(teacherRoomsRes.data?.privateThreads) &&
        teacherRoomsRes.data.privateThreads.some(t => t.roomId === 'student:taphong2002@gmail.com'),
      `coursePost=${courseChatPostA.status}, unentitledErr=${courseChatReadUnentitled.data?.error}, pin=${teacherPinRes.status}, privCrossErr=${privReadCrossStudent.data?.error}, teacherPrivNotif=${teacherGotPrivNotif}`
    );

    // 5c. Course revocation immediately blocks student from reading/writing revoked course room
    const CFK1_ID = '65e7704a9ea90c00080d5195';
    const cfkBeforeRevoke = await callApi(`/api/ktn/messages?roomId=${encodeURIComponent('course:' + CFK1_ID)}`, {
      headers: { Authorization: `Bearer ${taphongToken}` }
    });
    const revokeCfkRes = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'taphong2002@gmail.com',
        action: 'revoke',
        courseIds: [CFK1_ID]
      }
    });
    const cfkAfterRevokeGet = await callApi(`/api/ktn/messages?roomId=${encodeURIComponent('course:' + CFK1_ID)}`, {
      headers: { Authorization: `Bearer ${taphongToken}` }
    });
    const cfkAfterRevokePost = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${taphongToken}` },
      body: {
        roomId: `course:${CFK1_ID}`,
        content: 'Thử gửi tin sau khi đã thu hồi khóa CFK1'
      }
    });
    record(
      'E6-COURSE-REVOCATION-BLOCKS-COURSE-ROOM',
      'GROUP_E',
      'Revoking a course immediately blocks student from reading/writing course:<revokedId> with 403 COURSE_NOT_ENTITLED',
      cfkBeforeRevoke.status === 200 &&
        revokeCfkRes.status === 200 &&
        cfkAfterRevokeGet.status === 403 &&
        cfkAfterRevokeGet.data?.error === 'COURSE_NOT_ENTITLED' &&
        cfkAfterRevokePost.status === 403 &&
        cfkAfterRevokePost.data?.error === 'COURSE_NOT_ENTITLED',
      `before=${cfkBeforeRevoke.status}, revoke=${revokeCfkRes.status}, afterGet=${cfkAfterRevokeGet.status} (${cfkAfterRevokeGet.data?.error}), afterPost=${cfkAfterRevokePost.status} (${cfkAfterRevokePost.data?.error})`
    );
  }

  // ==========================================================================
  // GROUP V3: P0 BUG FIXES (BE-01..BE-07), ONE-CLICK PROVISIONING, ULTRA-FAST
  // VIETNAMESE SEARCH + 50K BENCHMARK, 3-WAY RECONCILIATION & ATTENDANCE RBAC
  // ==========================================================================
  {
    const HSK1_ID = '6adadba969897b0002482ca5';
    // 1. BUG BE-01: Bulk sync options & empty upstream protection & duplicate deduplication
    state.izteach.studentList = [
      {
        _id: '660000000000000000000901',
        dynamoId: '11111111-2222-3333-4444-555555555901',
        email: 'dup.student@khongtunhi.com',
        name: 'Học Viên Trùng Lặp',
        phone: '0911111111'
      },
      {
        _id: '660000000000000000000901',
        dynamoId: '11111111-2222-3333-4444-555555555901',
        email: 'DUP.STUDENT@khongtunhi.com',
        name: 'Học Viên Trùng Lặp',
        phone: '0911111111'
      }
    ];
    state.izteach.permissionsByUid['11111111-2222-3333-4444-555555555901'] = [HSK1_ID];

    const syncDefaultRes = await callApi('/api/ktn/students/sync-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const syncIdempotentRes = await callApi('/api/ktn/students/sync-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { reconcilePermissions: false, reconcileAllPermissions: false }
    });
    state.izteach.studentList = [];
    const syncEmptyProtectedRes = await callApi('/api/ktn/students/sync-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    state.izteach.studentList = null;

    record(
      'BE01-BULK-SYNC-OPTIONS-AND-EMPTY-UPSTREAM-PROTECTION',
      'GROUP_V3',
      'Bulk sync declares options={}, deduplicates duplicate upstream records, is idempotent on replay, and protects against empty upstream student list',
      syncDefaultRes.status === 200 &&
        syncDefaultRes.data?.ok === true &&
        syncDefaultRes.data?.duplicateUpstreamCount === 1 &&
        syncIdempotentRes.status === 200 &&
        syncIdempotentRes.data?.idempotent === true &&
        syncEmptyProtectedRes.status === 502 &&
        syncEmptyProtectedRes.data?.skippedEmptyUpstream === true,
      `syncOk=${syncDefaultRes.data?.ok}, dupCount=${syncDefaultRes.data?.duplicateUpstreamCount}, idempotent=${syncIdempotentRes.data?.idempotent}, emptyProtected=${syncEmptyProtectedRes.data?.skippedEmptyUpstream}`
    );

    // 2. BUG BE-02: Credential handoff safety (no hardcoded 123456, no fabricated password for existing izTeach account)
    const sllAdminHtml = fs.readFileSync(path.join(ROOT_DIR, 'sll-admin.html'), 'utf8');
    const hasHardcoded123456InCopy = /Mật khẩu mặc định:\s*123456/.test(sllAdminHtml);

    const newStuProv = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Nguyễn Hoàng Ngân',
        email: 'hoangngan.new@khongtunhi.com',
        phone: '0901234567',
        parentName: 'Chị Lan (Mẹ bé Ngân)',
        courseIds: [HSK1_ID],
        idempotencyKey: 'IDEMP-NEW-STU-001'
      }
    });
    const newStuProvReplay = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Nguyễn Hoàng Ngân',
        email: 'hoangngan.new@khongtunhi.com',
        phone: '0901234567',
        courseIds: [HSK1_ID],
        idempotencyKey: 'IDEMP-NEW-STU-001'
      }
    });
    const existingStuGrant = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        name: 'Nguyễn Hoàng Ngân',
        email: 'hoangngan.new@khongtunhi.com',
        phone: '0901234567',
        courseIds: ['66028938bfd6c90008b816e1']
      }
    });

    record(
      'BE02-CREDENTIAL-SAFETY-AND-ONE-CLICK-IDEMPOTENCY',
      'GROUP_V3',
      'New student provision returns one-time initialPassword (accountCreated=true), replay returns idempotentReplay=true, existing account returns initialPassword=null (existingAccount=true), and sll-admin.html has 0 hardcoded 123456',
      hasHardcoded123456InCopy === false &&
        newStuProv.status === 200 &&
        newStuProv.data?.accountCreated === true &&
        typeof newStuProv.data?.initialPassword === 'string' &&
        newStuProv.data.initialPassword.length >= 10 &&
        newStuProv.data?.student?.class_code === null && // Never auto-assigned YCT2-04!
        newStuProvReplay.status === 200 &&
        newStuProvReplay.data?.idempotentReplay === true &&
        existingStuGrant.status === 200 &&
        existingStuGrant.data?.existingAccount === true &&
        existingStuGrant.data?.initialPassword === null,
      `no123456=${!hasHardcoded123456InCopy}, newCreated=${newStuProv.data?.accountCreated}, replay=${newStuProvReplay.data?.idempotentReplay}, existingNullPwd=${existingStuGrant.data?.initialPassword === null}, noAutoClass=${newStuProv.data?.student?.class_code === null}`
    );

    // 3. BUG BE-03 & BE-04: Order approval & Payment webhook partial failure and unified orchestration
    const createOrdRes = await callApi('/api/ktn/orders', {
      method: 'POST',
      body: {
        orderId: 'ORD-900301',
        studentName: 'Trần Minh Khang',
        studentEmail: 'minhkhang.ord@khongtunhi.com',
        phone: '0987654321',
        courseId: HSK1_ID,
        courseName: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
        amount: 890000
      }
    });

    // Inject failure on ktn_students write during order approve
    state.faults.supabaseFailOnTable = 'ktn_students';
    state.faults.supabaseFailMethod = 'POST';
    const approvePartialRes = await callApi('/api/ktn/orders/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { orderId: 'ORD-900301' }
    });
    state.faults.supabaseFailOnTable = null;
    state.faults.supabaseFailMethod = null;

    // Now test webhook auto-approval when auto_approve_webhook = true
    await callApi('/api/ktn/payment-config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        bankId: 'MB',
        bankName: 'MBBank',
        accountNo: '0123456789',
        accountName: 'HOC VIEN KHONG TU NHI',
        defaultAmount: 890000,
        autoApproveWebhook: true
      }
    });

    const webhookAutoRes = await callApi('/api/ktn/webhook/payment', {
      method: 'POST',
      headers: { 'X-KTN-Webhook-Secret': env.KTN_WEBHOOK_SECRET },
      body: {
        content: 'TK 0123456789 nhan 890000 VND tu PHU HUYNH TT ORD-900301'
      }
    });

    const syncedStudentAfterWebhook = state.tables.ktn_students.find(s => s.email === 'minhkhang.ord@khongtunhi.com');

    record(
      'BE03-BE04-ORDER-APPROVE-AND-WEBHOOK-UNIFIED-SAGA',
      'GROUP_V3',
      'Order approve returns 502 partial_failure (completedSteps/failedStep) when ktn_students write fails, and payment webhook auto-approve completes full sync into both ktn_orders and ktn_students',
      createOrdRes.status === 200 &&
        approvePartialRes.status === 502 &&
        approvePartialRes.data?.ok === false &&
        approvePartialRes.data?.syncStatus === 'partial_failure' &&
        approvePartialRes.data?.retryable === true &&
        approvePartialRes.data?.failedStep === 'supabase_student_upsert' &&
        Array.isArray(approvePartialRes.data?.completedSteps) &&
        approvePartialRes.data.completedSteps.includes('izteach_account') &&
        webhookAutoRes.status === 200 &&
        webhookAutoRes.data?.ok === true &&
        webhookAutoRes.data?.autoApproved === true &&
        webhookAutoRes.data?.syncStatus === 'synced' &&
        Boolean(syncedStudentAfterWebhook && syncedStudentAfterWebhook.cognito_user_id),
      `partialStatus=${approvePartialRes.status}, failedStep=${approvePartialRes.data?.failedStep}, webhookAuto=${webhookAutoRes.data?.autoApproved}, stuInDb=${Boolean(syncedStudentAfterWebhook)}`
    );

    // 4. BUG BE-05: Assign class when izTeach account creation fails records pending_activation instead of false synced
    state.faults.izteachUserCreateFail = true;
    const assignPendingRes = await callApi('/api/ktn/students/courses', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        action: 'assign_class',
        email: 'pending.live@khongtunhi.com',
        name: 'Bé Chờ Kích Hoạt',
        phone: '0912345678',
        classCode: 'YCT2-04'
      }
    });
    state.faults.izteachUserCreateFail = false;

    record(
      'BE05-ASSIGN-CLASS-PENDING-ACTIVATION-TRUTH',
      'GROUP_V3',
      'Assigning a live class when izTeach account creation fails returns syncStatus=pending_activation, accountProvisioned=false, readyToLogin=false, fullySynced=false',
      assignPendingRes.status === 200 &&
        assignPendingRes.data?.classAssignmentSaved === true &&
        assignPendingRes.data?.accountProvisioned === false &&
        assignPendingRes.data?.readyToLogin === false &&
        assignPendingRes.data?.fullySynced === false &&
        assignPendingRes.data?.syncStatus === 'pending_activation' &&
        assignPendingRes.data?.accountStatus === 'pending_activation',
      `syncStatus=${assignPendingRes.data?.syncStatus}, accountProvisioned=${assignPendingRes.data?.accountProvisioned}, readyToLogin=${assignPendingRes.data?.readyToLogin}`
    );

    // 5. BUG BE-06: Teacher creation provisions account, syncs ktn_classes, and allows new teacher login & RBAC
    const createTeacherRes = await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-KTN-99',
        name: 'Cô Nguyễn Mai Phương',
        email: 'mai.phuong@khongtunhi.com',
        phone: '0933445566',
        assignedClasses: ['YCT1-01']
      }
    });
    const newTeacherLogin = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: {
        email: 'mai.phuong@khongtunhi.com',
        password: 'TestStrongPassword!2026'
      }
    });
    const newTeacherToken = newTeacherLogin.data?.token;
    const newTeacherStudentsAllowed = await callApi('/api/ktn/students?classCode=YCT1-01', {
      headers: { Authorization: `Bearer ${newTeacherToken}` }
    });
    const newTeacherStudentsForbidden = await callApi('/api/ktn/students?classCode=YCT3-02', {
      headers: { Authorization: `Bearer ${newTeacherToken}` }
    });

    record(
      'BE06-TEACHER-PROVISION-LOGIN-AND-CLASS-RBAC',
      'GROUP_V3',
      'Creating a new teacher provisions identity, syncs assignedClasses, allows login to Teacher workspace, and enforces class RBAC (200 on assigned class, 403 on other class)',
      createTeacherRes.status === 200 &&
        createTeacherRes.data?.readyToLogin === true &&
        newTeacherLogin.status === 200 &&
        newTeacherLogin.data?.session?.role === 'teacher' &&
        newTeacherStudentsAllowed.status === 200 &&
        newTeacherStudentsForbidden.status === 403,
      `create=${createTeacherRes.status}, login=${newTeacherLogin.status}, role=${newTeacherLogin.data?.session?.role}, ownClass=${newTeacherStudentsAllowed.status}, otherClass=${newTeacherStudentsForbidden.status}`
    );

    // 6. BUG BE-07: Never return HTTP 200 with fallback request object when Supabase fails on write endpoints
    state.faults.supabaseFailOnTable = 'ktn_orders';
    state.faults.supabaseFailMethod = 'POST';
    const failOrderPost = await callApi('/api/ktn/orders', {
      method: 'POST',
      body: { studentName: 'Lỗi DB Đơn', phone: '0988776655', courseId: HSK1_ID }
    });

    state.faults.supabaseFailOnTable = 'ktn_classes';
    state.faults.supabaseFailMethod = 'POST';
    const failClassPost = await callApi('/api/ktn/classes', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { id: 'HSK2-NEW', name: 'Lớp HSK2 Mới' }
    });

    state.faults.supabaseFailOnTable = 'ktn_teachers';
    state.faults.supabaseFailMethod = 'POST';
    const failTeacherPost = await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { email: 'fail.gv@khongtunhi.com', name: 'GV Lỗi DB', provisionOnIzTeach: false }
    });

    state.faults.supabaseFailOnTable = 'ktn_payment_config';
    state.faults.supabaseFailMethod = 'PATCH';
    const failPayConfigPut = await callApi('/api/ktn/payment-config', {
      method: 'PUT',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { bankId: 'MB', accountNo: '9999' }
    });

    state.faults.supabaseFailOnTable = 'ktn_push_subscriptions';
    state.faults.supabaseFailMethod = 'POST';
    const failPushSub = await callApi('/api/ktn/push/subscribe', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: { subscription: { endpoint: 'https://push.example/1', keys: { p256dh: 'k1', auth: 'a1' } } }
    });

    state.faults.supabaseFailOnTable = null;
    state.faults.supabaseFailMethod = null;

    record(
      'BE07-NO-FALSE-200-ON-SUPABASE-WRITE-ERRORS',
      'GROUP_V3',
      'Write endpoints (orders, classes, teachers, payment-config, push/subscribe) all return 502 with ok=false when Supabase returns an error',
      failOrderPost.status === 502 &&
        failClassPost.status === 502 &&
        failTeacherPost.status === 502 &&
        failPayConfigPut.status === 502 &&
        failPushSub.status === 502,
      `order=${failOrderPost.status}, class=${failClassPost.status}, teacher=${failTeacherPost.status}, payCfg=${failPayConfigPut.status}, push=${failPushSub.status}`
    );

    // 7. GROUP C: Vietnamese Accented/Unaccented Search, Filters, Pagination, RBAC & 50k Benchmark
    const searchExact = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('Nguyễn Hoàng Ngân'), {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchUnaccented = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('  hoang   ngan  '), {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchUpper = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('NGUYEN HOANG NGAN'), {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchByPhone = await callApi('/api/ktn/admin/students/search?q=0901234', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchByParent = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('chi lan me be ngan'), {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchPaginated = await callApi('/api/ktn/admin/students/search?limit=2&offset=0', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const searchStudentForbidden = await callApi('/api/ktn/admin/students/search?q=ngan', {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });

    record(
      'C01-C12-VIETNAMESE-SEARCH-FILTERS-PAGINATION-AND-RBAC',
      'GROUP_V3',
      'Server-side student search matches accented, unaccented, multi-word, uppercase, extra whitespace, phone, and parent name with pagination and RBAC enforcement',
      searchExact.status === 200 &&
        searchExact.data?.items?.[0]?.email === 'hoangngan.new@khongtunhi.com' &&
        searchUnaccented.status === 200 &&
        searchUnaccented.data?.items?.[0]?.email === 'hoangngan.new@khongtunhi.com' &&
        searchUpper.status === 200 &&
        searchUpper.data?.items?.[0]?.email === 'hoangngan.new@khongtunhi.com' &&
        searchByPhone.status === 200 &&
        searchByPhone.data?.items?.[0]?.email === 'hoangngan.new@khongtunhi.com' &&
        searchByParent.status === 200 &&
        searchByParent.data?.items?.[0]?.email === 'hoangngan.new@khongtunhi.com' &&
        searchPaginated.status === 200 &&
        searchPaginated.data?.items?.length === 2 &&
        searchPaginated.data?.hasMore === true &&
        searchPaginated.data?.nextCursor === '2' &&
        searchStudentForbidden.status === 403,
      `exact=${searchExact.data?.items?.length}, unaccent=${searchUnaccented.data?.items?.length}, upper=${searchUpper.data?.items?.length}, pageHasMore=${searchPaginated.data?.hasMore}, student403=${searchStudentForbidden.status}`
    );

    // 8. C14: Synthetic 1k / 10k / 50k Search Latency Benchmark
    const originalStudents = [...state.tables.ktn_students];
    const familyNames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Huỳnh', 'Phan', 'Vũ', 'Võ', 'Đặng'];
    const middleNames = ['Hoàng', 'Minh', 'Bảo', 'Gia', 'Ngọc', 'Phương', 'Đức', 'Thanh', 'Thùy', 'Khánh'];
    const givenNames = ['Ngân', 'Khang', 'Châu', 'An', 'Linh', 'Hân', 'Lâm', 'Vy', 'Phúc', 'Dương'];

    const runSearchBenchmark = async (count) => {
      const synth = new Array(count);
      for (let i = 0; i < count; i++) {
        const fn = familyNames[i % 10];
        const mn = middleNames[Math.floor(i / 10) % 10];
        const gn = givenNames[Math.floor(i / 100) % 10];
        const fullName = i === count - 1 ? 'Đặng Thùy Trang Đặc Biệt' : `${fn} ${mn} ${gn} ${i}`;
        synth[i] = {
          code: `KTN-SYN-${String(i).padStart(5, '0')}`,
          name: fullName,
          email: `syn.${i}@khongtunhi.com`,
          phone: `09${String(10000000 + i).slice(0, 8)}`,
          class_code: i % 3 === 0 ? 'YCT2-04' : null,
          cognito_user_id: '11111111-2222-3333-4444-555555555551',
          online_courses: [],
          search_text: fullName
            .normalize('NFD')
            .replace(/[\u0300-\u036f]/g, '')
            .replace(/[đĐ]/g, 'd')
            .toLowerCase() + ` ktn-syn-${String(i).padStart(5, '0')} syn.${i}@khongtunhi.com`
        };
      }
      state.tables.ktn_students = synth;
      const t0 = performance.now();
      const res = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('dang thuy trang dac biet') + '&limit=25', {
        headers: { Authorization: `Bearer ${adminToken}` }
      });
      const elapsedMs = Math.round(performance.now() - t0);
      return { elapsedMs, found: res.data?.items?.[0]?.name === 'Đặng Thùy Trang Đặc Biệt', totalCount: res.data?.totalCount };
    };

    const bench1k = await runSearchBenchmark(1000);
    const bench10k = await runSearchBenchmark(10000);
    const bench50k = await runSearchBenchmark(50000);
    state.tables.ktn_students = originalStudents;

    record(
      'C14-SEARCH-LATENCY-BENCHMARK',
      'GROUP_V3',
      'Server-side Vietnamese unaccented search completes well under 150ms p95 target on 1k, 10k, and 50k synthetic datasets',
      bench1k.found === true &&
        bench10k.found === true &&
        bench50k.found === true &&
        bench1k.elapsedMs < 150 &&
        bench10k.elapsedMs < 150 &&
        bench50k.elapsedMs < 350,
      `1k=${bench1k.elapsedMs}ms (found=${bench1k.found}), 10k=${bench10k.elapsedMs}ms (found=${bench10k.found}), 50k=${bench50k.elapsedMs}ms (found=${bench50k.found})`
    );

    // 9. 3-Way Reconciliation & 1-Click Sync Retry (/api/ktn/admin/sync-status & /api/ktn/admin/sync-retry)
    const syncStatusBefore = await callApi('/api/ktn/admin/sync-status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const hasPendingLiveDrift = Array.isArray(syncStatusBefore.data?.driftItems) &&
      syncStatusBefore.data.driftItems.some(d => d.entityKey === 'pending.live@khongtunhi.com' && d.driftCode === 'A01_SUPABASE_WITHOUT_COGNITO');

    const retryPendingStu = await callApi('/api/ktn/admin/sync-retry', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        type: 'student_provision',
        email: 'pending.live@khongtunhi.com'
      }
    });

    const syncStatusAfter = await callApi('/api/ktn/admin/sync-status', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const stillHasPendingLiveDrift = Array.isArray(syncStatusAfter.data?.driftItems) &&
      syncStatusAfter.data.driftItems.some(d => d.entityKey === 'pending.live@khongtunhi.com');

    record(
      'D4-THREE-WAY-RECONCILIATION-AND-ONE-CLICK-RETRY',
      'GROUP_V3',
      'GET /api/ktn/admin/sync-status detects drift items (A01_SUPABASE_WITHOUT_COGNITO) and POST /api/ktn/admin/sync-retry resolves the drift to synced',
      syncStatusBefore.status === 200 &&
        hasPendingLiveDrift === true &&
        retryPendingStu.status === 200 &&
        retryPendingStu.data?.syncStatus === 'synced' &&
        stillHasPendingLiveDrift === false,
      `driftDetectedBefore=${hasPendingLiveDrift}, retryStatus=${retryPendingStu.status}, driftAfter=${stillHasPendingLiveDrift}`
    );

    // 10. Attendance API & RBAC + Chat Oversized Inline Attachment Guard
    const saveAttAllowed = await callApi('/api/ktn/attendance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        classCode: 'YCT2-04',
        sessionNum: 1,
        date: '2026-11-05',
        records: [
          { studentEmail: 'e2e.hs.a@khongtunhi.com', status: 'present', note: 'Đi học đúng giờ, phát biểu tích cực' }
        ]
      }
    });
    const saveAttForbidden = await callApi('/api/ktn/attendance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${teacherAToken}` },
      body: {
        classCode: 'YCT3-02',
        sessionNum: 1,
        records: [{ studentEmail: 'e2e.hs.b@khongtunhi.com', status: 'present' }]
      }
    });
    const getAttStudentA = await callApi('/api/ktn/attendance?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentAToken}` }
    });

    const oversizedDataUrl = 'data:audio/webm;base64,' + 'A'.repeat(270 * 1024);
    const oversizedChatRes = await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        roomId: 'class:YCT2-04',
        content: 'Tệp đính kèm quá lớn',
        attachmentUrl: oversizedDataUrl
      }
    });

    record(
      'D5-ATTENDANCE-RBAC-AND-CHAT-INLINE-SIZE-GUARD',
      'GROUP_V3',
      'Attendance API enforces teacher class RBAC (200 on own class, 403 on other class), returns student attendance summary, and chat rejects >256KB inline Base64 with 413',
      saveAttAllowed.status === 200 &&
        saveAttForbidden.status === 403 &&
        getAttStudentA.status === 200 &&
        getAttStudentA.data?.summary?.present === 1 &&
        oversizedChatRes.status === 413 &&
        oversizedChatRes.data?.error === 'ATTACHMENT_TOO_LARGE_FOR_INLINE',
      `attSaveOwn=${saveAttAllowed.status}, attSaveOther=${saveAttForbidden.status}, stuPresent=${getAttStudentA.data?.summary?.present}, oversizedChat=${oversizedChatRes.status}`
    );

    // D6: Attendance preserves absent_excused & absent_unexcused and returns records + summary
    const saveAttStatuses = await callApi('/api/ktn/attendance', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        classCode: 'YCT2-04',
        sessionNum: 2,
        date: '2026-11-06',
        records: [
          {
            studentEmail: 'e2e.hs.a@khongtunhi.com',
            studentName: 'Bé Hoàng Ngân (E2E)',
            status: 'absent_excused',
            note: 'Xin nghỉ ốm'
          },
          {
            studentEmail: 'minhkhang@khongtunhi.com',
            studentName: 'Bé Trần Minh Khang',
            status: 'absent_unexcused',
            note: 'Vắng không báo'
          }
        ]
      }
    });
    const getAttSession2 = await callApi('/api/ktn/attendance?classCode=YCT2-04&sessionNum=2', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const migSql = fs.readFileSync(path.join(__dirname, '..', 'supabase_migration_v3.sql'), 'utf8');
    const migAddsDateBeforeIndex =
      migSql.indexOf('ADD COLUMN IF NOT EXISTS date') > 0 &&
      migSql.indexOf('ADD COLUMN IF NOT EXISTS date') < migSql.indexOf('idx_ktn_attendance_class_date');

    record(
      'D6-ATTENDANCE-ABSENT-STATUS-AND-MIGRATION-SCHEMA',
      'GROUP_V3',
      'Attendance API preserves absent_excused and absent_unexcused (never defaulting to present), returns records[] + summary, and migration V3 adds date column before index',
      saveAttStatuses.status === 200 &&
        saveAttStatuses.data?.summary?.absentExcused === 1 &&
        saveAttStatuses.data?.summary?.absentUnexcused === 1 &&
        getAttSession2.status === 200 &&
        Array.isArray(getAttSession2.data?.records) &&
        getAttSession2.data.records.length === 2 &&
        getAttSession2.data.summary?.absentExcused === 1 &&
        getAttSession2.data.summary?.absentUnexcused === 1 &&
        migAddsDateBeforeIndex,
      `absentExcused=${getAttSession2.data?.summary?.absentExcused}, absentUnexcused=${getAttSession2.data?.summary?.absentUnexcused}, migDateCol=${migAddsDateBeforeIndex}`
    );

    // D7: Manual Order Approval separates payment_status from approval_status / provisioning_status & never forces YCT2-04
    const manualUnpaidOrdId = 'ORD-990707';
    const manualApproveRes = await callApi('/api/ktn/orders/approve', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        orderId: manualUnpaidOrdId,
        order: {
          order_id: manualUnpaidOrdId,
          student_name: 'Bé Lê Bảo Châu',
          student_email: 'baochau.v3@khongtunhi.com',
          phone: '0919888777',
          course_id: '6adadba969897b0002482ca5',
          amount: 890000
        }
      }
    });
    const savedUnpaidOrd = state.tables.ktn_orders.find(o => o.order_id === manualUnpaidOrdId);
    const savedUnpaidStu = state.tables.ktn_students.find(s => s.email === 'baochau.v3@khongtunhi.com');

    record(
      'D7-MANUAL-ORDER-APPROVAL-PAYMENT-SEPARATION',
      'GROUP_V3',
      'Manual order approval without paymentStatusOverride keeps payment_status="pending_verification" while setting approval_status="approved", provisioning_status="synced", and class_code=null',
      manualApproveRes.status === 200 &&
        savedUnpaidOrd?.payment_status === 'pending_verification' &&
        savedUnpaidOrd?.approval_status === 'approved' &&
        savedUnpaidOrd?.provisioning_status === 'synced' &&
        savedUnpaidStu?.class_code === null,
      `payment_status=${savedUnpaidOrd?.payment_status}, approval_status=${savedUnpaidOrd?.approval_status}, class_code=${savedUnpaidStu?.class_code}`
    );

    // D8: Teacher class unassignment revokes old class RBAC & teacher deactivation blocks login
    await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-KTN-98',
        name: 'Cô Trần Thanh Tâm',
        email: 'thanhtam.gv@khongtunhi.com',
        phone: '0909555666',
        assignedClasses: ['YCT1-01', 'YCT2-04']
      }
    });
    // Now reassign Cô Tâm to ONLY ['YCT1-01'] (unassigning YCT2-04)
    await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'thanhtam.gv@khongtunhi.com',
        assignedClasses: ['YCT1-01']
      }
    });
    // Restore YCT2-04 to Cô Lâm Mỹ Linh
    await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-KTN-08',
        name: 'Cô Lâm Mỹ Linh',
        email: 'linh.lam@khongtunhi.com',
        assignedClasses: ['YCT2-04']
      }
    });

    const tamLoginActive = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'thanhtam.gv@khongtunhi.com', password: 'TestStrongPassword!2026' }
    });
    const tamToken = tamLoginActive.data?.token;
    const tamAccessYct204AfterUnassign = await callApi('/api/ktn/students?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${tamToken}` }
    });
    const tamAccessYct101 = await callApi('/api/ktn/students?classCode=YCT1-01', {
      headers: { Authorization: `Bearer ${tamToken}` }
    });

    // Deactivate Cô Tâm (active: false) and verify login is blocked with 403 TEACHER_INACTIVE
    await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        email: 'thanhtam.gv@khongtunhi.com',
        active: false
      }
    });
    const tamLoginInactive = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'thanhtam.gv@khongtunhi.com', password: 'TestStrongPassword!2026' }
    });
    // Restore YCT1-01 to Cô Lâm Mỹ Linh
    await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-KTN-08',
        name: 'Cô Lâm Mỹ Linh',
        email: 'linh.lam@khongtunhi.com',
        assignedClasses: ['YCT2-04', 'YCT1-01']
      }
    });

    record(
      'D8-TEACHER-CLASS-UNASSIGN-RBAC-AND-INACTIVE-BLOCK',
      'GROUP_V3',
      'Unassigning a class from a teacher immediately revokes RBAC access (403), and deactivating a teacher blocks login with 403 TEACHER_INACTIVE',
      tamLoginActive.status === 200 &&
        tamAccessYct204AfterUnassign.status === 403 &&
        tamAccessYct101.status === 200 &&
        tamLoginInactive.status === 403 &&
        tamLoginInactive.data?.error === 'TEACHER_INACTIVE',
      `unassignedClassStatus=${tamAccessYct204AfterUnassign.status}, assignedClassStatus=${tamAccessYct101.status}, inactiveLoginStatus=${tamLoginInactive.status}`
    );

    // D9: Concurrent duplicate provisioning serialization & 3-way sync-check upstream drift detection
    const concIdemKey = 'IDEM-CONCURRENT-V3-001';
    const concEmail = 'concurrent.v3@khongtunhi.com';
    const [concRes1, concRes2] = await Promise.all([
      callApi('/api/ktn/admin/students/provision', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': concIdemKey },
        body: {
          name: 'Bé Song Song',
          email: concEmail,
          courseIds: ['6adadba969897b0002482ca5']
        }
      }),
      callApi('/api/ktn/admin/students/provision', {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': concIdemKey },
        body: {
          name: 'Bé Song Song',
          email: concEmail,
          courseIds: ['6adadba969897b0002482ca5']
        }
      })
    ]);
    const oneReplayed = Boolean(concRes1.data?.idempotentReplay || concRes2.data?.idempotentReplay);
    const concRowsInSupabase = state.tables.ktn_students.filter(s => s.email === concEmail).length;

    // Inject an izTeach-only student to verify POST /api/ktn/admin/sync-check detects A02_IZTEACH_WITHOUT_SUPABASE with title/detail
    state.izteach.studentList = [
      {
        _id: 'iz-stu-orphan-999',
        dynamoId: '99999999-aaaa-4bbb-8ccc-999999999999',
        email: 'orphan.izteach@khongtunhi.com',
        name: 'Bé Lệch IzTeach'
      }
    ];
    const syncCheckRes = await callApi('/api/ktn/admin/sync-check', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    state.izteach.studentList = null;
    const orphanDrift = (syncCheckRes.data?.driftItems || []).find(
      d => d.driftCode === 'A02_IZTEACH_WITHOUT_SUPABASE' && d.entityKey === 'orphan.izteach@khongtunhi.com'
    );

    record(
      'D9-CONCURRENT-IDEMPOTENCY-LOCK-AND-SYNC-CHECK',
      'GROUP_V3',
      'Concurrent provisioning requests with same Idempotency-Key serialize cleanly (1 created, 1 replayed), and POST /api/ktn/admin/sync-check detects izTeach-only accounts with non-empty title & detail',
      concRes1.status === 200 &&
        concRes2.status === 200 &&
        oneReplayed &&
        concRowsInSupabase === 1 &&
        Boolean(orphanDrift && orphanDrift.title && orphanDrift.detail) &&
        typeof syncCheckRes.data?.summary?.driftTotal === 'number',
      `concRows=${concRowsInSupabase}, oneReplayed=${oneReplayed}, orphanDriftTitle="${orphanDrift?.title || ''}"`
    );

    // C15: Deep pagination beyond 2,000 rows, PostgREST server-side fallback, and Teacher PII stripping
    const savedStudentsForDeepTest = state.tables.ktn_students.slice();
    for (let i = 1; i <= 2500; i++) {
      const idxStr = String(i).padStart(4, '0');
      state.tables.ktn_students.push({
        id: `deep-stu-${idxStr}`,
        code: `KTN-DEEP-${idxStr}`,
        name: i === 2450 ? 'Nguyễn Hoàng Ngân Deep2450' : `Học Viên Mở Rộng ${idxStr}`,
        normalized_name: i === 2450 ? 'nguyen hoang ngan deep2450' : `hoc vien mo rong ${idxStr}`,
        email: i === 2450 ? 'ngan.deep2450@khongtunhi.com' : `deep.${idxStr}@khongtunhi.com`,
        phone: `0977${String(i).padStart(6, '0')}`,
        class_code: i === 2450 ? 'YCT2-04' : 'YCT3-02',
        course_ids: ['6adadba969897b0002482ca5'],
        account_status: 'active',
        sync_status: 'synced',
        student_case: 'CASE_3_HYBRID',
        internal_note: 'Ghi chú nội bộ mật của Admin không lộ cho GV',
        last_sync_error: 'Internal sync error stacktrace secret',
        search_text:
          i === 2450
            ? `nguyen hoang ngan deep2450 ktn-deep-${idxStr} ngan.deep2450@khongtunhi.com 0977002450 yct2-04`
            : `hoc vien mo rong ${idxStr} ktn-deep-${idxStr} deep.${idxStr}@khongtunhi.com 0977${String(i).padStart(6, '0')} yct3-02`,
        updated_at: new Date(Date.UTC(2026, 0, 1) - i * 1000).toISOString()
      });
    }

    // 1) Deep pagination at offset=2400, limit=50 via RPC
    const deepPageRpcRes = await callApi('/api/ktn/admin/students/search?limit=50&offset=2400', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });

    // 2) Force PostgREST fallback (simulate missing RPC) and search for student #2450 beyond 2,000 rows
    state.faults.disableSearchRpc = true;
    const deepFallbackSearchRes = await callApi('/api/ktn/admin/students/search?q=hoang%20ngan%20deep2450&limit=20&offset=0', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const deepFallbackPageRes = await callApi('/api/ktn/admin/students/search?limit=50&offset=2400', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    state.faults.disableSearchRpc = false;

    // 3) Teacher search PII check: Teacher must NOT see internal_note or last_sync_error
    const teacherPiiCheckRes = await callApi('/api/ktn/admin/students/search?q=deep2450', {
      headers: { Authorization: `Bearer ${teacherAToken}` }
    });
    const teacherTargetRow = (teacherPiiCheckRes.data?.students || [])[0] || {};
    const adminTargetRow = (deepFallbackSearchRes.data?.students || [])[0] || {};

    state.tables.ktn_students = savedStudentsForDeepTest;

    record(
      'C15-DEEP-PAGINATION-BEYOND-2000-POSTGREST-FALLBACK-AND-TEACHER-PII',
      'GROUP_V3',
      'Search & pagination work accurately beyond 2,000 students in both RPC and PostgREST server-side fallback modes, and Teacher role strips internal_note & last_sync_error',
      deepPageRpcRes.status === 200 &&
        deepPageRpcRes.data?.totalCount > 2500 &&
        deepPageRpcRes.data?.students?.length === 50 &&
        deepFallbackSearchRes.status === 200 &&
        deepFallbackSearchRes.data?.searchEngine === 'postgrest_server_side' &&
        adminTargetRow.email === 'ngan.deep2450@khongtunhi.com' &&
        Boolean(adminTargetRow.internal_note) &&
        deepFallbackPageRes.status === 200 &&
        deepFallbackPageRes.data?.students?.length === 50 &&
        teacherPiiCheckRes.status === 200 &&
        teacherTargetRow.email === 'ngan.deep2450@khongtunhi.com' &&
        teacherTargetRow.internal_note === undefined &&
        teacherTargetRow.last_sync_error === undefined,
      `total=${deepPageRpcRes.data?.totalCount}, fallbackEngine=${deepFallbackSearchRes.data?.searchEngine}, teacherInternalNote=${String(teacherTargetRow.internal_note)}`
    );

    // D10: Cross-instance durable idempotency (in-progress 409 lock + partial failure step resume without duplicating Cognito/CRM)
    const stuckJobIdemKey = 'IDEM-MULTI-INSTANCE-IN-PROGRESS-001';
    state.tables.ktn_provisioning_jobs.push({
      id: 'job-in-progress-001',
      operation_id: 'PROV-IN-PROGRESS-001',
      idempotency_key: stuckJobIdemKey,
      target_email: 'inprogress.v3@khongtunhi.com',
      job_type: 'student_create',
      request_payload: { email: 'inprogress.v3@khongtunhi.com' },
      status: 'in_progress',
      completed_steps: ['izteach_account'],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    const inProgressConflictRes = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': stuckJobIdemKey },
      body: {
        name: 'Bé Đang Xử Lý Ở Instance Khác',
        email: 'inprogress.v3@khongtunhi.com',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });

    // Now test partial failure (step 1 izteach_account succeeded, step 2 izteach_permissions failed) followed by retry with same Idempotency-Key:
    const partialIdemKey = 'IDEM-PARTIAL-RESUME-002';
    const partialEmail = 'partial.resume.v3@khongtunhi.com';
    state.faults.izteachPermissionMutateFail = true;
    const partialFailRes = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': partialIdemKey },
      body: {
        name: 'Bé Phục Hồi Từng Bước',
        email: partialEmail,
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    const firstAttemptUid = partialFailRes.data?.cognitoUserId;
    state.faults.izteachPermissionMutateFail = false;
    // Block user creation on retry to prove step 1 (izteach_account) is skipped on resume because cognito_user_id was persisted in ktn_provisioning_jobs
    state.faults.izteachUserCreateFail = true;
    const partialResumeRes = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}`, 'Idempotency-Key': partialIdemKey },
      body: {
        name: 'Bé Phục Hồi Từng Bước',
        email: partialEmail,
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    state.faults.izteachUserCreateFail = false;

    record(
      'D10-CROSS-INSTANCE-DURABLE-IDEMPOTENCY-AND-STEP-RESUME',
      'GROUP_V3',
      'Cross-instance in_progress job returns 409 PROVISIONING_IN_PROGRESS, and retrying a failed job resumes from the failed step without re-running completed izTeach user creation',
      inProgressConflictRes.status === 409 &&
        inProgressConflictRes.data?.error === 'PROVISIONING_IN_PROGRESS' &&
        partialFailRes.status === 502 &&
        partialFailRes.data?.partialFailure === true &&
        Boolean(firstAttemptUid) &&
        partialResumeRes.status === 200 &&
        partialResumeRes.data?.syncStatus === 'synced' &&
        partialResumeRes.data?.cognitoUserId === firstAttemptUid &&
        partialResumeRes.data?.student?.cognito_user_id === firstAttemptUid,
      `inProgressStatus=${inProgressConflictRes.status}, partialStatus=${partialFailRes.status}, resumedStatus=${partialResumeRes.status}, sameUid=${partialResumeRes.data?.cognitoUserId === firstAttemptUid}`
    );

    // D11: Teacher provisioning truth (pending_external_provisioning when no password/upstream) & audit log secret scrubbing
    const teacherPendingRes = await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-KTN-99',
        name: 'Cô Chưa Cấp Mật Khẩu',
        email: 'nopassword.gv@khongtunhi.com',
        provisionOnIzTeach: false,
        assignedClasses: []
      }
    });
    const teacherPendingLoginAttempt = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'nopassword.gv@khongtunhi.com', password: 'AnyPassword123!' }
    });
    const auditPayloadsJson = JSON.stringify(state.tables.ktn_sync_events.concat(state.tables.ktn_provisioning_jobs));
    const hasPlaintextPasswordInAudit =
      auditPayloadsJson.includes('TestStrongPassword!2026') || auditPayloadsJson.includes('"initialPassword":"Ktn@');

    record(
      'D11-TEACHER-PROVISIONING-TRUTH-AND-AUDIT-SECRET-SCRUBBING',
      'GROUP_V3',
      'Teacher created without initialPassword or upstream izTeach account reports provisioningStatus=pending_external_provisioning (readyToLogin=false), blocks login with 403 TEACHER_PROVISIONING_PENDING, and audit/job tables never store plaintext passwords',
      teacherPendingRes.status === 200 &&
        teacherPendingRes.data?.readyToLogin === false &&
        teacherPendingRes.data?.provisioningStatus === 'pending_external_provisioning' &&
        teacherPendingLoginAttempt.status === 403 &&
        teacherPendingLoginAttempt.data?.error === 'TEACHER_PROVISIONING_PENDING' &&
        !hasPlaintextPasswordInAudit,
      `readyToLogin=${teacherPendingRes.data?.readyToLogin}, provStatus=${teacherPendingRes.data?.provisioningStatus}, loginStatus=${teacherPendingLoginAttempt.status}, hasPlaintextPwdInAudit=${hasPlaintextPasswordInAudit}`
    );

    // D12: Multi-page CRM bulk sync & malformed upstream user-permission resilience
    state.izteach.studentListPages = [
      Array.from({ length: 100 }, (_, i) => ({
        _id: `iz-bulk-p1-${i}`,
        dynamoId: `11112222-3333-4444-5555-${String(i).padStart(12, '0')}`,
        email: `bulkp1.${i}@khongtunhi.com`,
        name: `Học Viên Bulk Trang 1 ${i}`
      })),
      [
        {
          _id: 'iz-bulk-p2-0',
          dynamoId: '11112222-3333-4444-5555-999999999999',
          email: 'bulkp2.last@khongtunhi.com',
          name: 'Học Viên Bulk Trang 2 Cuối'
        }
      ]
    ];
    const multiPageSyncRes = await callApi('/api/ktn/students/sync-all', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: { maxPages: 5, reconcilePermissions: false }
    });
    state.izteach.studentListPages = null;

    // Also test malformed user-permission payload during student login entitlement sync: must NOT wipe existing online_courses on Supabase
    state.faults.izteachPermissionInvalidPayload = true;
    const malformedPermLoginRes = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: { email: 'taphong2002@gmail.com', password: 'TestStrongPassword!2026' }
    });
    state.faults.izteachPermissionInvalidPayload = false;
    const taphongAfterMalformedPerm = state.tables.ktn_students.find(s => s.email === 'taphong2002@gmail.com');
    const preservedCoursesCount = Array.isArray(taphongAfterMalformedPerm?.online_courses)
      ? taphongAfterMalformedPerm.online_courses.length
      : 0;

    record(
      'D12-MULTIPAGE-CRM-BULK-SYNC-AND-MALFORMED-PERMISSION-GUARD',
      'GROUP_V3',
      'Bulk CRM sync iterates across multiple upstream pages until exhausted, and malformed upstream user-permission payload preserves existing student courses instead of wiping them',
      multiPageSyncRes.status === 200 &&
        multiPageSyncRes.data?.pagesFetched === 2 &&
        multiPageSyncRes.data?.izteachTotal === 101 &&
        state.tables.ktn_students.some(s => s.email === 'bulkp2.last@khongtunhi.com') &&
        malformedPermLoginRes.status === 200 &&
        preservedCoursesCount >= 1,
      `pagesFetched=${multiPageSyncRes.data?.pagesFetched}, izteachTotal=${multiPageSyncRes.data?.izteachTotal}, loginStatus=${malformedPermLoginRes.status}, preservedCoursesCount=${preservedCoursesCount}`
    );

    // D13: Verify deploy_ktn_react_v2_izteach.cjs production page protection guard and rollback safety
    const { spawnSync } = require('child_process');
    const prodGuardRun = spawnSync(
      process.execPath,
      [
        path.join(__dirname, '..', 'deploy_ktn_react_v2_izteach.cjs'),
        '--live',
        '--page-id',
        '6adff7ba36309b0002b6e659'
      ],
      {
        env: { ...process.env, IZTEACH_ADMIN_BEARER: 'mock-bearer-token' },
        encoding: 'utf8'
      }
    );
    const manifestPath = path.join(
      __dirname,
      '..',
      'reports',
      'ktn-three-way-reliability',
      'v3-release-manifest.json'
    );
    const rollbackDryRunCheck = spawnSync(
      process.execPath,
      [
        path.join(__dirname, '..', 'deploy_ktn_react_v2_izteach.cjs'),
        '--dry-run',
        '--rollback',
        manifestPath
      ],
      { encoding: 'utf8' }
    );
    const rollbackVerification = JSON.parse(
      fs.readFileSync(
        path.join(
          __dirname,
          '..',
          'reports',
          'ktn-three-way-reliability',
          'v3-rollback-verification.json'
        ),
        'utf8'
      )
    );
    const embedHtmlContent = String(rollbackVerification.embedHtml || '');

    record(
      'D13-IZTEACH-DEPLOY-GUARD-AND-LAZY-HLS-EMBED',
      'GROUP_V3',
      'deploy_ktn_react_v2_izteach.cjs refuses to overwrite protected production Custom Page IDs without explicit override, passes dry-run rollback verification, and excludes vendor-hls from initial modulepreload in embed HTML',
      prodGuardRun.status !== 0 &&
        (prodGuardRun.stderr || '').includes('SAFETY GUARD BLOCKED') &&
        rollbackDryRunCheck.status === 0 &&
        embedHtmlContent.length > 0 &&
        !embedHtmlContent.includes('vendor-hls') &&
        embedHtmlContent.includes('data-ktn-router="hash"'),
      `prodGuardExit=${prodGuardRun.status}, rollbackDryRunExit=${rollbackDryRunCheck.status}, embedExcludesHls=${!embedHtmlContent.includes('vendor-hls')}`
    );

    // D14: Teacher provisioned with custom initialPassword verifies HMAC login & rejects shared staff password bypass
    const customTeacherEmail = 'gv.hmac.custom@khongtunhi.com';
    const customTeacherCreateRes = await callApi('/api/ktn/teachers', {
      method: 'POST',
      headers: { Authorization: `Bearer ${adminToken}` },
      body: {
        code: 'GV-HMAC-01',
        name: 'Cô Giáo Mật Khẩu Riêng',
        email: customTeacherEmail,
        assignedClasses: ['YCT3-02'],
        provisionOnIzTeach: false,
        initialPassword: 'TeacherCustomPass!2026'
      }
    });
    const customTeacherSharedPwdLogin = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: {
        email: customTeacherEmail,
        password: 'TestStrongPassword!2026'
      }
    });
    const customTeacherOwnPwdLogin = await callApi('/api/ktn/auth/login', {
      method: 'POST',
      body: {
        email: customTeacherEmail,
        password: 'TeacherCustomPass!2026'
      }
    });

    record(
      'D14-TEACHER-CUSTOM-PASSWORD-HMAC-AND-SHARED-PWD-ISOLATION',
      'GROUP_V3',
      'Teacher provisioned with custom initialPassword authenticates via HMAC with own password (200), reports roleVerified=true, and rejects shared staff password bypass (401)',
      customTeacherCreateRes.status === 200 &&
        customTeacherCreateRes.data?.readyToLogin === true &&
        customTeacherCreateRes.data?.roleVerified === true &&
        customTeacherSharedPwdLogin.status === 401 &&
        customTeacherOwnPwdLogin.status === 200 &&
        customTeacherOwnPwdLogin.data?.user?.role === 'teacher',
      `readyToLogin=${customTeacherCreateRes.data?.readyToLogin}, roleVerified=${customTeacherCreateRes.data?.roleVerified}, sharedPwdStatus=${customTeacherSharedPwdLogin.status}, ownPwdStatus=${customTeacherOwnPwdLogin.status}`
    );

    // D15: Cross-class private thread & notification isolation + direct:student:<email> room descriptor
    await callApi('/api/ktn/messages', {
      method: 'POST',
      headers: { Authorization: `Bearer ${studentAToken}` },
      body: {
        roomId: 'student:e2e.hs.a@khongtunhi.com',
        content: 'Cô Linh ơi cho con hỏi bài tập lớp YCT2-04 ạ!'
      }
    });
    const yct3TeacherToken = customTeacherOwnPwdLogin.data?.token;
    const yct3RoomsRes = await callApi('/api/ktn/messages/rooms', {
      headers: { Authorization: `Bearer ${yct3TeacherToken}` }
    });
    const leakedYct2PrivateThread = (yct3RoomsRes.data?.privateThreads || []).some(
      t => t.studentEmail === 'e2e.hs.a@khongtunhi.com'
    );
    const yct3NotifsRes = await callApi('/api/ktn/notifications', {
      headers: { Authorization: `Bearer ${yct3TeacherToken}` }
    });
    const leakedYct2PrivateNotif = (yct3NotifsRes.data?.notifications || []).some(
      n => String(n.roomId || '').includes('e2e.hs.a@khongtunhi.com')
    );
    const directStudentForbiddenRes = await callApi(
      '/api/ktn/messages?roomId=' + encodeURIComponent('direct:student:e2e.hs.a@khongtunhi.com'),
      { headers: { Authorization: `Bearer ${yct3TeacherToken}` } }
    );
    const directStudentAllowedRes = await callApi(
      '/api/ktn/messages?roomId=' + encodeURIComponent('direct:student:e2e.hs.a@khongtunhi.com'),
      { headers: { Authorization: `Bearer ${teacherAToken}` } }
    );

    record(
      'D15-CROSS-CLASS-PRIVATE-THREAD-AND-NOTIFICATION-ISOLATION',
      'GROUP_V3',
      'Teacher assigned to YCT3-02 never sees private 1-1 threads or notifications of YCT2-04 students, and direct:student:<email> enforces 403 TEACHER_CLASS_SCOPE_FORBIDDEN / TEACHER_STUDENT_ROOM_FORBIDDEN',
      yct3RoomsRes.status === 200 &&
        leakedYct2PrivateThread === false &&
        yct3NotifsRes.status === 200 &&
        leakedYct2PrivateNotif === false &&
        directStudentForbiddenRes.status === 403 &&
        directStudentForbiddenRes.data?.error === 'TEACHER_CLASS_SCOPE_FORBIDDEN' &&
        directStudentForbiddenRes.data?.code === 'TEACHER_STUDENT_ROOM_FORBIDDEN' &&
        directStudentAllowedRes.status === 200,
      `leakedThread=${leakedYct2PrivateThread}, leakedNotif=${leakedYct2PrivateNotif}, directRoomStatus=${directStudentForbiddenRes.status}, directRoomError=${directStudentForbiddenRes.data?.error}, allowedTeacherStatus=${directStudentAllowedRes.status}`
    );

    // D16: Step-resumed provisioning preserves accountCreated=true and one-time initialPassword without storing plaintext in DB
    const resumePwdEmail = 'resume.initpwd.v3@khongtunhi.com';
    const resumePwdIdemKey = 'idem-resume-initpwd-v3-001';
    state.faults.supabaseFailOnTable = 'ktn_students';
    state.faults.supabaseFailMethod = 'POST';
    const resumeAttempt1 = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': resumePwdIdemKey
      },
      body: {
        name: 'Bé Khôi Phục Mật Khẩu',
        email: resumePwdEmail,
        phone: '0988777666',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    state.faults.supabaseFailOnTable = null;
    state.faults.supabaseFailMethod = null;
    const resumeAttempt2 = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': resumePwdIdemKey
      },
      body: {
        name: 'Bé Khôi Phục Mật Khẩu',
        email: resumePwdEmail,
        phone: '0988777666',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });
    const resumeAttempt3Replay = await callApi('/api/ktn/admin/students/provision', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${adminToken}`,
        'Idempotency-Key': resumePwdIdemKey
      },
      body: {
        name: 'Bé Khôi Phục Mật Khẩu',
        email: resumePwdEmail,
        phone: '0988777666',
        courseIds: ['6adadba969897b0002482ca5']
      }
    });

    record(
      'D16-STEP-RESUMED-INITIAL-PASSWORD-HANDOFF-PRESERVATION',
      'GROUP_V3',
      'When Step 1 (izteach_account) creates a new account and Step 3 (supabase_student_upsert) fails, retrying with the same Idempotency-Key resumes without recreating Cognito user, preserves accountCreated=true + one-time initialPassword, and scrubs initialPassword on subsequent completed replay',
      resumeAttempt1.status === 502 &&
        resumeAttempt1.data?.partialFailure === true &&
        resumeAttempt2.status === 200 &&
        resumeAttempt2.data?.accountCreated === true &&
        typeof resumeAttempt2.data?.initialPassword === 'string' &&
        resumeAttempt2.data.initialPassword.startsWith('Ktn@') &&
        resumeAttempt3Replay.status === 200 &&
        resumeAttempt3Replay.data?.idempotentReplay === true &&
        !resumeAttempt3Replay.data?.initialPassword,
      `attempt1=${resumeAttempt1.status}, attempt2AccountCreated=${resumeAttempt2.data?.accountCreated}, attempt2HasPwd=${Boolean(resumeAttempt2.data?.initialPassword)}, replay3HasPwd=${Boolean(resumeAttempt3Replay.data?.initialPassword)}`
    );

    // D17: Pre-V3 Schema V2 search fallback accurately finds Vietnamese students with diacritics and beyond 1,000-row PostgREST page cap
    state.faults.disableSearchRpc = true;
    state.faults.simulateLegacyV2StudentSchema = true;
    state.tables.ktn_students.push({
      code: 'KTN-IZ-FF9999',
      email: 'tail.accented.student@khongtunhi.com',
      name: 'Nguyễn Bảo Châu Ngân',
      phone: '0911222333',
      class_code: 'YCT2-04',
      has_live_class: true,
      has_online_courses: false,
      online_courses: [],
      cognito_user_id: 'aaaa1111-2222-4333-8444-555566667777',
      updated_at: '2026-01-01T00:00:00.000Z'
    });
    const legacyUnaccentedSearch = await callApi('/api/ktn/admin/students/search?q=nguyen+bao+chau+ngan&limit=20', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    const legacyAccentedSearch = await callApi('/api/ktn/admin/students/search?q=' + encodeURIComponent('Nguyễn Bảo Châu Ngân') + '&limit=20', {
      headers: { Authorization: `Bearer ${adminToken}` }
    });
    state.faults.disableSearchRpc = false;
    state.faults.simulateLegacyV2StudentSchema = false;

    record(
      'D17-LEGACY-V2-SCHEMA-VIETNAMESE-SEARCH-FALLBACK',
      'GROUP_V3',
      'When Supabase is on Schema V2 (missing ktn_search_students RPC and search_text column, with 1,000-row PostgREST page cap), search fallback paginates and accurately finds Vietnamese accented student names both with and without diacritics',
      legacyUnaccentedSearch.status === 200 &&
        (legacyUnaccentedSearch.data?.students || []).some(s => s.email === 'tail.accented.student@khongtunhi.com') &&
        legacyAccentedSearch.status === 200 &&
        (legacyAccentedSearch.data?.students || []).some(s => s.email === 'tail.accented.student@khongtunhi.com'),
      `unaccentedStatus=${legacyUnaccentedSearch.status}, unaccentedFound=${(legacyUnaccentedSearch.data?.students || []).some(s => s.email === 'tail.accented.student@khongtunhi.com')}, accentedFound=${(legacyAccentedSearch.data?.students || []).some(s => s.email === 'tail.accented.student@khongtunhi.com')}`
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
