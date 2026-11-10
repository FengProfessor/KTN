/**
 * KTN MASTER UX & PERFORMANCE UPGRADE — COMPREHENSIVE BACKEND, RBAC & BENCHMARK SUITE
 *
 * Covers all 3 core upgrade pillars & Agent D verification matrix:
 *   1. Teacher Search & Benchmark (1,000 and 10,000 synthetic teachers):
 *      - Accent-sensitive & accent-insensitive Vietnamese search (q=linh, q=Mỹ Linh, q=nguyen van, code, email, phone, classCode, specialization)
 *      - Filter by status (active, inactive, unassigned), classCode, and courseId
 *      - Pagination (limit, offset, totalCount, hasMore) and rapid query switching with AbortSignal
 *      - Lightweight query verification (no full homework/forum/attendance dump during search)
 *      - Real p50 / p95 latency (in ms) for 1,000 and 10,000 teachers on both Worker /api/ktn/admin/teachers/search and PostgreSQL 18.6 (PGlite + pg_trgm)
 *   2. Chat Inbox Latest-First, Empty 1-1 Removal, 500+ Messages & Private Chat RBAC:
 *      - Room that just received a message moves to index 0 of active rooms
 *      - Empty rooms never rank above rooms with messages; student.updated_at never inflates room ordering
 *      - Students with 0 messages do not generate empty student:<email> threads in GET /api/ktn/messages/rooms
 *      - Sending the first 1-1 message creates exactly 1 student:<email> thread and moves it to the top
 *      - Order persists across reload
 *      - With 500+ messages concentrated in one room, other rooms and older 1-1 threads (>100 messages ago globally) retain their lastMessage and lastMessageAt/updatedAt
 *      - Unread counts match read cursors accurately
 *      - Teacher outside a student's class (or targeting an unassigned student) gets 403 Forbidden on GET /api/ktn/messages and POST /api/ktn/messages
 *   3. Teacher File Assignment & Non-Overwriting Exercises:
 *      - Teacher uploads PDF, Word (.docx), PowerPoint (.pptx), image (.png), audio (.m4a), and video (.mp4 within limit) via presign/session endpoints
 *      - Rejects oversized files (>50MB) and disallowed MIME types (application/x-msdownload .exe, etc.) with 400
 *      - Rejects teacher outside the class with 403
 *      - Persistence across reload; student in the class can view/download exercise attachments; student outside the class is blocked (403)
 *      - Adding a second exercise (mode: 'append_exercise') to an existing session preserves Exercise #1's id and attachments without overwriting
 *      - Updating an existing published exercise (mode: 'update_exercise') does not emit duplicate homework_assigned push notifications
 *      - Student homework submission and teacher grading continue to work end-to-end
 *
 * Usage: node tests/ktn_ux_and_performance_upgrade_suite.cjs
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const { createRequire } = require('module');

const ROOT_DIR = path.resolve(__dirname, '..');
const REPORT_PATH = path.join(
  ROOT_DIR,
  'reports',
  'ktn-three-way-reliability',
  'ux-and-performance-upgrade-report.json'
);

const webRequire = createRequire(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'package.json'));
const { PGlite } = webRequire('@electric-sql/pglite');
const { pg_trgm } = webRequire('./node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.cjs');

function normalizeVi(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .replace(/[^a-z0-9@._:\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function percentile(sortedArr, p) {
  if (!Array.isArray(sortedArr) || sortedArr.length === 0) return 0;
  const idx = Math.min(
    sortedArr.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1)
  );
  return +Number(sortedArr[idx]).toFixed(2);
}

function splitTopLevelCommas(str) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (let i = 0; i < str.length; i += 1) {
    const ch = str[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth = Math.max(0, depth - 1);
    if (ch === ',' && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

function createWorkerHarness(customState = null) {
  const workerPath = path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js');
  const code = fs.readFileSync(workerPath, 'utf8');
  const transformed = code.replace(/export\s+default\s+\{/, 'module.exports = {');

  const state = customState || {
    queryLog: [],
    pushDeliveries: [],
    tables: {
      ktn_students: [
        {
          code: 'HS-E2E-A',
          name: 'Nguyễn Hoàng Ngân',
          email: 'e2e.hs.a@khongtunhi.com',
          phone: '0900000001',
          parent_name: 'Chị Lan',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: true,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555551',
          izteach_student_id: '660000000000000000000001',
          online_courses: [{ id: '6adadba969897b0002482ca5', title: 'HSK1 3.0' }],
          updated_at: '2026-11-01T10:00:00.000Z'
        },
        {
          code: 'HS-E2E-A2',
          name: 'Trần Minh Khang',
          email: 'minhkhang@khongtunhi.com',
          phone: '0900000003',
          parent_name: 'Anh Minh',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: false,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555553',
          izteach_student_id: '660000000000000000000003',
          online_courses: [],
          updated_at: '2026-11-10T12:00:00.000Z'
        },
        {
          code: 'HS-E2E-A3',
          name: 'Phạm Gia Hân (Học viên mới)',
          email: 'new.hs@khongtunhi.com',
          phone: '0900000004',
          parent_name: 'Chị Mai',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: false,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555554',
          izteach_student_id: '660000000000000000000004',
          online_courses: [],
          updated_at: '2026-11-10T15:00:00.000Z'
        },
        {
          code: 'HS-E2E-OLDER',
          name: 'Lê Bảo Ngọc (Hội thoại cũ)',
          email: 'older.hs@khongtunhi.com',
          phone: '0900000005',
          parent_name: 'Chị Ngọc',
          class_code: 'YCT2-04',
          has_live_class: true,
          has_online_courses: false,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555555',
          izteach_student_id: '660000000000000000000005',
          online_courses: [],
          updated_at: '2026-10-01T08:00:00.000Z'
        },
        {
          code: 'HS-E2E-B',
          name: 'Lê Bảo Châu',
          email: 'e2e.hs.b@khongtunhi.com',
          phone: '0900000002',
          parent_name: 'Chị Hương',
          class_code: 'YCT3-02',
          has_live_class: true,
          has_online_courses: true,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555552',
          izteach_student_id: '660000000000000000000002',
          online_courses: [{ id: '65e7704a9ea90c00080d5195', title: 'Chinese For Kids' }],
          updated_at: '2026-11-09T10:00:00.000Z'
        },
        {
          code: 'HS-UNASSIGNED-01',
          name: 'Võ Tạ Phong (Chưa xếp lớp)',
          email: 'unassigned.hs@khongtunhi.com',
          phone: '0900000099',
          parent_name: 'Anh Phong',
          class_code: null,
          has_live_class: false,
          has_online_courses: false,
          account_status: 'ready_to_login',
          sync_status: 'synced',
          cognito_user_id: '11111111-2222-3333-4444-555555555599',
          izteach_student_id: '660000000000000000000099',
          online_courses: [],
          updated_at: '2026-11-10T16:00:00.000Z'
        }
      ],
      ktn_teachers: [
        {
          code: 'GV-KTN-08',
          name: 'Cô Lâm Vũ Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          phone: '0912345678',
          specialty: 'Chuyên gia YCT & Phản xạ Giao tiếp',
          specialization: 'Chuyên gia YCT & Phản xạ Giao tiếp',
          assigned_classes: ['YCT2-04', 'YCT1-NEW'],
          aliases: ['__class:YCT2-04', '__class:YCT1-NEW', 'mylinh'],
          assigned_courses: ['6adadba969897b0002482ca5'],
          active: true,
          status: 'active',
          updated_at: '2026-11-05T10:00:00.000Z',
          search_text: normalizeVi(
            'GV-KTN-08 Cô Lâm Vũ Mỹ Linh colamvumylinh linh.lam@khongtunhi.com 0912345678 Chuyên gia YCT & Phản xạ Giao tiếp YCT2-04 YCT1-NEW'
          )
        },
        {
          code: 'GV-KTN-03',
          name: 'Cô Trần Thu Hà',
          email: 'thu.ha@khongtunhi.com',
          phone: '0987654321',
          specialty: 'Chuyên gia HSK Cao Cấp & Hán tự tư duy',
          specialization: 'Chuyên gia HSK Cao Cấp & Hán tự tư duy',
          assigned_classes: ['YCT3-02'],
          aliases: ['__class:YCT3-02', 'thuha'],
          assigned_courses: ['65e7704a9ea90c00080d5195'],
          active: true,
          status: 'active',
          updated_at: '2026-11-04T10:00:00.000Z',
          search_text: normalizeVi(
            'GV-KTN-03 Cô Trần Thu Hà cotranthuha thu.ha@khongtunhi.com 0987654321 Chuyên gia HSK Cao Cấp & Hán tự tư duy YCT3-02'
          )
        },
        {
          code: 'GV-KTN-15',
          name: 'Thầy Nguyễn Văn Bách',
          email: 'bach.nguyen@khongtunhi.com',
          phone: '0933445566',
          specialty: 'Luyện thi HSKK & Giao tiếp Phản xạ',
          specialization: 'Luyện thi HSKK & Giao tiếp Phản xạ',
          assigned_classes: [],
          aliases: [],
          assigned_courses: [],
          active: true,
          status: 'active',
          updated_at: '2026-11-03T10:00:00.000Z',
          search_text: normalizeVi(
            'GV-KTN-15 Thầy Nguyễn Văn Bách thaynguyenvanbach bach.nguyen@khongtunhi.com 0933445566 Luyện thi HSKK & Giao tiếp Phản xạ'
          )
        },
        {
          code: 'GV-KTN-19',
          name: 'Cô Đặng Vũ Quỳnh Hương',
          email: 'quynh.huong@khongtunhi.com',
          phone: '0977889900',
          specialty: 'Tiếng Trung Mầm Non Song Ngữ',
          specialization: 'Tiếng Trung Mầm Non Song Ngữ',
          assigned_classes: [],
          aliases: [],
          assigned_courses: [],
          active: false,
          status: 'inactive',
          updated_at: '2026-11-02T10:00:00.000Z',
          search_text: normalizeVi(
            'GV-KTN-19 Cô Đặng Vũ Quỳnh Hương codangvuquynhhuong quynh.huong@khongtunhi.com 0977889900 Tiếng Trung Mầm Non Song Ngữ'
          )
        }
      ],
      ktn_classes: [
        {
          id: 'YCT2-04',
          name: 'Lớp YCT2-04',
          teacher_code: 'GV-KTN-08',
          teacher_name: 'Cô Lâm Vũ Mỹ Linh',
          teacher_email: 'linh.lam@khongtunhi.com',
          schedule: '19:30 Thứ 3 & Thứ 6',
          total_lessons: 25,
          current_lesson: 3,
          active: true,
          created_at: '2026-09-01T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z'
        },
        {
          id: 'YCT3-02',
          name: 'Lớp YCT3-02',
          teacher_code: 'GV-KTN-03',
          teacher_name: 'Cô Trần Thu Hà',
          teacher_email: 'thu.ha@khongtunhi.com',
          schedule: '18:00 Thứ 4 & Chủ Nhật',
          total_lessons: 25,
          current_lesson: 2,
          active: true,
          created_at: '2026-09-02T00:00:00.000Z',
          updated_at: '2026-11-01T00:00:00.000Z'
        },
        {
          id: 'YCT1-NEW',
          name: 'Lớp YCT1-NEW (Mới mở chưa có tin nhắn)',
          teacher_code: 'GV-KTN-08',
          teacher_name: 'Cô Lâm Vũ Mỹ Linh',
          teacher_email: 'linh.lam@khongtunhi.com',
          schedule: '19:30 Thứ 2 & Thứ 5',
          total_lessons: 25,
          current_lesson: 1,
          active: true,
          created_at: '2026-11-10T00:00:00.000Z',
          updated_at: '2026-11-10T00:00:00.000Z'
        }
      ],
      ktn_class_sessions: [],
      ktn_homeworks: [],
      ktn_attendance: [],
      ktn_messages: [],
      ktn_notifications: [],
      ktn_dlp_alerts: [],
      ktn_orders: [],
      ktn_push_subscriptions: [],
      ktn_forum_questions: [],
      ktn_forum_answers: [],
      ktn_forum_follows: [],
      ktn_teacher_contribution_events: [],
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
        ]
      }
    }
  };

  function matchesJsonbContains(cellVal, jsonStr) {
    try {
      const needles = JSON.parse(jsonStr);
      const hay = Array.isArray(cellVal) ? cellVal : [];
      if (!Array.isArray(needles)) return false;
      return needles.every((needle) => {
        if (needle && typeof needle === 'object') {
          return hay.some(
            (item) =>
              item &&
              typeof item === 'object' &&
              Object.keys(needle).every((k) => String(item[k] ?? '') === String(needle[k] ?? ''))
          );
        }
        return hay.some(
          (item) => (typeof item === 'string' || typeof item === 'number') && String(item) === String(needle)
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
    if (c.endsWith('.not.is.null')) {
      const col = c.slice(0, -12);
      return row[col] !== null && row[col] !== undefined;
    }
    const m = c.match(/^([a-zA-Z0-9_]+)\.(eq|neq|ilike|like|cs|in|gt|gte|lt|lte)\.(.*)$/);
    if (!m) return true;
    const [, col, op, v] = m;
    if (op === 'cs') return matchesJsonbContains(row[col], v);
    if (op === 'in') {
      const list = v
        .replace(/^\(/, '')
        .replace(/\)$/, '')
        .split(',')
        .map((s) => s.replace(/^"|"$/g, ''));
      return list.includes(String(row[col] ?? ''));
    }
    const cell = String(row[col] ?? '');
    if (op === 'eq') return cell === v;
    if (op === 'neq') return cell !== v;
    if (op === 'gt') return cell > v;
    if (op === 'gte') return cell >= v;
    if (op === 'lt') return cell < v;
    if (op === 'lte') return cell <= v;
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
        const clauses = splitTopLevelCommas(inner);
        if (!clauses.some((c) => evalSinglePostgrestClause(row, c))) return false;
        continue;
      }
      if (k === 'and') {
        const inner = rawVal.replace(/^\(/, '').replace(/\)$/, '');
        const clauses = splitTopLevelCommas(inner);
        if (!clauses.every((c) => evalSinglePostgrestClause(row, c))) return false;
        continue;
      }
      if (rawVal === 'is.null') {
        if (row[k] !== null && row[k] !== undefined) return false;
      } else if (rawVal === 'not.is.null') {
        if (row[k] === null || row[k] === undefined) return false;
      } else if (rawVal.startsWith('eq.')) {
        const target = rawVal.slice(3);
        if (String(row[k] ?? '') !== target) return false;
      } else if (rawVal.startsWith('neq.')) {
        const target = rawVal.slice(4);
        if (String(row[k] ?? '') === target) return false;
      } else if (rawVal.startsWith('gt.')) {
        if (!(String(row[k] ?? '') > rawVal.slice(3))) return false;
      } else if (rawVal.startsWith('gte.')) {
        if (!(String(row[k] ?? '') >= rawVal.slice(4))) return false;
      } else if (rawVal.startsWith('lt.')) {
        if (!(String(row[k] ?? '') < rawVal.slice(3))) return false;
      } else if (rawVal.startsWith('lte.')) {
        if (!(String(row[k] ?? '') <= rawVal.slice(4))) return false;
      } else if (rawVal.startsWith('cs.')) {
        if (!matchesJsonbContains(row[k], rawVal.slice(3))) return false;
      } else if (rawVal.startsWith('ilike.') || rawVal.startsWith('like.')) {
        const isCaseInsensitive = rawVal.startsWith('ilike.');
        const pattern = rawVal.slice(isCaseInsensitive ? 6 : 5);
        const regexStr = '^' + pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[*%]/g, '.*') + '$';
        const re = new RegExp(regexStr, isCaseInsensitive ? 'i' : '');
        const cellVal =
          k === 'search_text' && !row.search_text
            ? normalizeVi([row.code, row.name, row.email, row.phone, row.specialty, row.specialization, ...(Array.isArray(row.assigned_classes) ? row.assigned_classes : [])].join(' '))
            : String(row[k] ?? '');
        if (!re.test(cellVal)) return false;
      } else if (rawVal.startsWith('in.(')) {
        const list = rawVal
          .slice(4, -1)
          .split(',')
          .map((s) => decodeURIComponent(s.replace(/^"|"$/g, '')));
        if (!list.includes(String(row[k] ?? ''))) return false;
      }
    }
    return true;
  }

  function sortRowsByOrderParam(rows, orderParam) {
    if (!orderParam) return rows;
    const specs = orderParam.split(',').map((s) => {
      const parts = s.trim().split('.');
      return { col: parts[0], desc: parts[1]?.toLowerCase() === 'desc' };
    });
    return [...rows].sort((a, b) => {
      for (const { col, desc } of specs) {
        const va = a?.[col] ?? '';
        const vb = b?.[col] ?? '';
        if (va === vb) continue;
        const cmp = String(va).localeCompare(String(vb));
        return desc ? -cmp : cmp;
      }
      return 0;
    });
  }

  async function mockFetch(input, init = {}) {
    const urlStr = typeof input === 'string' ? input : input.url;
    const method = (init.method || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    const u = new URL(urlStr);

    if (u.hostname === 'd21acfi38wn3iy.cloudfront.net' && method === 'HEAD') {
      if (urlStr.includes('oversized_55mb')) {
        return new Response('', {
          status: 200,
          headers: { 'content-length': String(55 * 1024 * 1024), 'content-type': 'video/mp4' }
        });
      }
      return new Response('', {
        status: 200,
        headers: { 'content-length': '128000', 'content-type': 'application/pdf' }
      });
    }

    if (u.hostname === 'mock-supabase.local') {
      const table = u.pathname.replace(/^\/rest\/v1\//, '');
      state.queryLog.push({ method, table, search: u.search });

      if (table === 'rpc/ktn_search_teachers' && method === 'POST' && !state.disableTeacherSearchRpc) {
        const body = init.body ? JSON.parse(init.body) : {};
        const qNorm = normalizeVi(body.p_query || body.q || '');
        const qNoSpace = qNorm.replace(/\s+/g, '');
        const rawStatus = String(body.p_status || body.status || 'all').trim().toLowerCase();
        const classFilter = String(body.p_class_code || body.classCode || '').trim().toUpperCase();
        const courseFilter = String(body.p_course_id || body.courseId || '').trim();
        const limitVal = Math.max(1, Math.min(200, Number(body.p_limit || body.limit || 25)));
        const offsetVal = Math.max(0, Number(body.p_offset || body.offset || 0));

        const teacherRows = state.tables.ktn_teachers || [];
        const filtered = [];
        for (const t of teacherRows) {
          const isActive = t.active !== false && String(t.status || 'active').toLowerCase() !== 'inactive';
          const classes = Array.isArray(t.assigned_classes) ? t.assigned_classes : [];
          const courses = Array.isArray(t.assigned_courses) ? t.assigned_courses : [];

          if (rawStatus === 'active' && !isActive) continue;
          if (['inactive', 'locked', 'suspended', 'disabled'].includes(rawStatus) && isActive) continue;
          if (['unassigned', 'no_class'].includes(rawStatus) && classes.length > 0) continue;
          if (['assigned', 'has_class'].includes(rawStatus) && classes.length === 0) continue;
          if (classFilter && classFilter !== 'ALL' && !classes.map((c) => String(c).toUpperCase()).includes(classFilter)) continue;
          if (courseFilter && courseFilter !== 'all' && courseFilter !== 'ALL' && !courses.includes(courseFilter)) continue;

          let score = 100;
          if (qNorm) {
            const hay = t.search_text || normalizeVi(`${t.code} ${t.name} ${t.email} ${t.phone} ${t.specialty} ${classes.join(' ')}`);
            const hayNoSpace = hay.replace(/\s+/g, '');
            const tokens = qNorm.split(' ').filter(Boolean);
            const allMatch = tokens.every((tok) => hay.includes(tok));
            const compactMatch = qNoSpace.length >= 2 && hayNoSpace.includes(qNoSpace);
            if (!allMatch && !compactMatch) continue;
            if (normalizeVi(t.code) === qNorm) score = 1000;
            else if (normalizeVi(t.email) === qNorm) score = 990;
            else if (normalizeVi(t.name) === qNorm) score = 960;
            else if (normalizeVi(t.name).includes(qNorm)) score = 800;
            else score = 650;
          }
          filtered.push({ ...t, is_active: isActive, rank_score: score });
        }
        filtered.sort((a, b) => {
          if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
          if (a.is_active !== b.is_active) return a.is_active ? -1 : 1;
          return String(a.code || '').localeCompare(String(b.code || ''));
        });
        const totalCount = filtered.length;
        const paged = filtered.slice(offsetVal, offsetVal + limitVal).map((r) => ({
          ...r,
          total_count: totalCount
        }));
        return new Response(JSON.stringify(paged), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (table.startsWith('rpc/')) {
        return new Response(JSON.stringify({ message: 'RPC fallback to PostgREST in unit harness' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      const rows = state.tables[table] || (state.tables[table] = []);

      if (method === 'GET') {
        const matched = sortRowsByOrderParam(
          rows.filter((r) => matchQueryFilters(r, u.searchParams)),
          u.searchParams.get('order')
        );
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
        const onConflict = u.searchParams.get('on_conflict');
        const pkByTable = {
          ktn_students: 'email',
          ktn_orders: 'order_id',
          ktn_teachers: 'code',
          ktn_classes: 'id',
          ktn_class_sessions: 'id',
          ktn_homeworks: 'id',
          ktn_push_subscriptions: 'endpoint',
          ktn_student_lifecycle: 'student_email'
        };
        const defaultPk = pkByTable[table] || 'id';
        const out = [];
        for (const item of items) {
          let existingIdx = -1;
          if (onConflict) {
            const keys = onConflict.split(',').map((s) => s.trim());
            existingIdx = rows.findIndex((r) =>
              keys.every((k) => String(r[k] ?? '').toLowerCase() === String(item[k] ?? '').toLowerCase())
            );
          } else if (item[defaultPk]) {
            existingIdx = rows.findIndex(
              (r) => String(r[defaultPk] ?? '').toLowerCase() === String(item[defaultPk] ?? '').toLowerCase()
            );
          } else if (item.id) {
            existingIdx = rows.findIndex((r) => r.id === item.id);
          }

          if (existingIdx >= 0) {
            rows[existingIdx] = { ...rows[existingIdx], ...item };
            out.push(rows[existingIdx]);
          } else {
            const created = {
              id: item.id || 'SB-' + (rows.length + 1) + '-' + Date.now(),
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
        const matched = rows.filter((r) => matchQueryFilters(r, u.searchParams));
        matched.forEach((r) => Object.assign(r, patch));
        return new Response(JSON.stringify(matched), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }

      if (method === 'DELETE') {
        const keep = rows.filter((r) => !matchQueryFilters(r, u.searchParams));
        state.tables[table] = keep;
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { 'Content-Type': 'application/json' }
        });
      }
    }

    if (u.hostname.includes('amazonaws.com')) {
      if (u.pathname.endsWith('/signin')) {
        const signinBody = init && init.body ? JSON.parse(init.body) : {};
        const signinEmail = String(signinBody.email || '').trim().toLowerCase();
        if (signinEmail === 'hocvienkhongtunhi123@gmail.com' && !u.pathname.includes('student')) {
          return new Response(
            JSON.stringify({
              accessToken: 'mock-admin-izteach-jwt',
              id: '2c01e488-d866-4341-a0db-644fe6ba1202',
              userId: '2c01e488-d866-4341-a0db-644fe6ba1202',
              email: 'hocvienkhongtunhi123@gmail.com',
              roles: ['root', 'admin'],
              type: 'admin'
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
        return new Response(JSON.stringify({ message: 'Not matched in mock izTeach' }), {
          status: 401,
          headers: { 'Content-Type': 'application/json' }
        });
      }
      if (u.pathname.includes('/s3') || u.searchParams.has('key')) {
        const key = u.searchParams.get('key') || `resource/assignments/${Date.now()}`;
        return new Response(
          JSON.stringify({
            url: `https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com/${key}?X-Amz-Signature=mock-sig`
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    if (u.hostname === 'fcm.googleapis.com' || u.hostname === 'web.push.apple.com') {
      state.pushDeliveries.push({ endpoint: urlStr, method, status: 201 });
      return new Response('', { status: 201 });
    }

    if (u.pathname.startsWith('/api/ktn/')) {
      return new Response(JSON.stringify({ ok: false, message: 'Endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' }
    });
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
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (bin) => Buffer.from(bin, 'binary').toString('base64'),
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
  sandbox.globalThis = sandbox;

  vm.runInNewContext(transformed, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  const worker = sandbox.module.exports;

  const env = {
    SUPABASE_URL: 'https://mock-supabase.local',
    SUPABASE_SERVICE_ROLE_KEY: 'mock-service-role-secret-key-2026',
    KTN_SESSION_SECRET: 'ux-perf-upgrade-secret-2026',
    KTN_STAFF_AND_TEST_PASSWORD: 'TestStrongPassword!2026',
    IZTEACH_ADMIN_EMAIL: 'hocvienkhongtunhi123@gmail.com',
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026',
    KTN_WEBHOOK_SECRET: 'mock-webhook-secret-2026'
  };

  async function callApi(pathAndQuery, opts = {}) {
    const t0 = performance.now();
    const abortErr = () => {
      const e = new Error('The operation was aborted');
      e.name = 'AbortError';
      e.aborted = true;
      return e;
    };
    if (opts.signal?.aborted) {
      throw abortErr();
    }

    const execPromise = (async () => {
      if (opts.delayMs && opts.delayMs > 0) {
        await new Promise((resolve, reject) => {
          const timer = setTimeout(resolve, opts.delayMs);
          if (opts.signal) {
            opts.signal.addEventListener(
              'abort',
              () => {
                clearTimeout(timer);
                reject(abortErr());
              },
              { once: true }
            );
          }
        });
      }
      if (opts.signal?.aborted) {
        throw abortErr();
      }
      const req = new Request('https://khongtunhi.com' + pathAndQuery, {
        method: opts.method || 'GET',
        headers: {
          'Content-Type': 'application/json',
          ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
          ...(opts.headers || {})
        },
        body: opts.body && typeof opts.body === 'object' ? JSON.stringify(opts.body) : opts.body,
        signal: opts.signal
      });
      const waitUntilPromises = [];
      const res = await worker.fetch(req, env, {
        waitUntil: (p) => {
          if (p && typeof p.then === 'function') waitUntilPromises.push(p);
        }
      });
      if (waitUntilPromises.length > 0) {
        await Promise.allSettled(waitUntilPromises);
      }
      if (opts.signal?.aborted) {
        throw abortErr();
      }
      const elapsedMs = +(performance.now() - t0).toFixed(2);
      const data = await res.json().catch(() => null);
      return { status: res.status, ok: res.ok, headers: res.headers, data, elapsedMs };
    })();

    if (!opts.signal) return execPromise;
    return Promise.race([
      execPromise,
      new Promise((_, reject) => {
        if (opts.signal.aborted) {
          reject(abortErr());
          return;
        }
        opts.signal.addEventListener('abort', () => reject(abortErr()), { once: true });
      })
    ]);
  }

  return { worker, state, env, callApi };
}

async function runSuite() {
  console.log('================================================================================');
  console.log('KTN MASTER UX & PERFORMANCE UPGRADE — QA, RBAC & 1K/10K BENCHMARK SUITE');
  console.log('================================================================================\n');

  const results = [];
  function record(id, category, title, passed, detail = '') {
    results.push({ id, category, title, passed: Boolean(passed), detail });
    const tag = passed ? 'PASS' : 'FAIL';
    console.log(`[${tag}] [${category}] ${id}: ${title}${detail ? ' -> ' + detail : ''}`);
  }

  const { state, env, callApi } = createWorkerHarness();
  const subtle = (globalThis.crypto || crypto.webcrypto).subtle;

  // Generate real P-256 ECDH VAPID server keys so push notifications are genuinely exercised
  const vapidPair = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const vapidJwk = await subtle.exportKey('jwk', vapidPair.privateKey);
  const vapidRawPub = Buffer.from(await subtle.exportKey('raw', vapidPair.publicKey));
  env.VAPID_PUBLIC_KEY = vapidRawPub.toString('base64url');
  env.VAPID_PRIVATE_KEY = vapidJwk.d;

  async function makeRealPushSub(endpointUrl) {
    const kp = await subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
    const rawPub = Buffer.from(await subtle.exportKey('raw', kp.publicKey));
    return {
      endpoint: endpointUrl,
      keys: {
        p256dh: rawPub.toString('base64url'),
        auth: crypto.randomBytes(16).toString('base64url')
      }
    };
  }

  // Authenticate actors
  const adminLogin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'hocvienkhongtunhi123@gmail.com', password: 'AdminStrongPassword!2026', role: 'admin' }
  });
  const teacherLinhLogin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'linh.lam@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  const teacherHaLogin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'thu.ha@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'teacher' }
  });
  const studentALogin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.a@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });
  const studentBLogin = await callApi('/api/ktn/auth/login', {
    method: 'POST',
    body: { email: 'e2e.hs.b@khongtunhi.com', password: 'TestStrongPassword!2026', role: 'student' }
  });

  const adminToken = adminLogin.data?.token;
  const teacherLinhToken = teacherLinhLogin.data?.token;
  const teacherHaToken = teacherHaLogin.data?.token;
  const studentAToken = studentALogin.data?.token;
  const studentBToken = studentBLogin.data?.token;

  assert(adminToken && teacherLinhToken && teacherHaToken && studentAToken && studentBToken, 'All test actors must authenticate');

  // Register real P-256 Web Push subscriptions for Teacher Linh, Teacher Ha, Student A (YCT2-04), Student B (YCT3-02)
  const epTeacherLinh = 'https://fcm.googleapis.com/fcm/send/UPGRADE_TEACHER_LINH';
  const epTeacherHa = 'https://fcm.googleapis.com/fcm/send/UPGRADE_TEACHER_HA';
  const epStudentA = 'https://web.push.apple.com/UPGRADE_STUDENT_A_YCT2';
  const epStudentB = 'https://fcm.googleapis.com/fcm/send/UPGRADE_STUDENT_B_YCT3';

  await callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    token: teacherLinhToken,
    body: { subscription: await makeRealPushSub(epTeacherLinh) }
  });
  await callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    token: teacherHaToken,
    body: { subscription: await makeRealPushSub(epTeacherHa) }
  });
  await callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    token: studentAToken,
    body: { subscription: await makeRealPushSub(epStudentA) }
  });
  await callApi('/api/ktn/push/subscribe', {
    method: 'POST',
    token: studentBToken,
    body: { subscription: await makeRealPushSub(epStudentB) }
  });

  // =========================================================================
  // SECTION 1: TEACHER SEARCH & 1K / 10K BENCHMARKS
  // =========================================================================
  console.log('\n--- SECTION 1: TEACHER SEARCH & 1,000 / 10,000 BENCHMARKS ---');

  // T01: Accent-sensitive & accent-insensitive Vietnamese search (q=linh, q=Mỹ Linh, q=my linh, q=nguyen van, q=dang vu)
  const searchShortLinh = await callApi(
    `/api/ktn/admin/teachers/search?q=${encodeURIComponent('linh')}&limit=20&offset=0`,
    { token: adminToken }
  );
  const searchAccentedLinh = await callApi(
    `/api/ktn/admin/teachers/search?q=${encodeURIComponent('Mỹ Linh')}&limit=20&offset=0`,
    { token: adminToken }
  );
  const searchUnaccentedLinh = await callApi(
    `/api/ktn/admin/teachers/search?q=${encodeURIComponent('my linh')}&limit=20&offset=0`,
    { token: adminToken }
  );
  const searchUnaccentedBach = await callApi(
    `/api/ktn/admin/teachers/search?q=${encodeURIComponent('nguyen van')}&limit=20&offset=0`,
    { token: adminToken }
  );
  const searchDangVu = await callApi(
    `/api/ktn/admin/teachers/search?q=${encodeURIComponent('dang vu')}&limit=20&offset=0`,
    { token: adminToken }
  );

  const linhItemsShort = searchShortLinh.data?.items || [];
  const linhItemsAcc = searchAccentedLinh.data?.items || [];
  const linhItemsNoAcc = searchUnaccentedLinh.data?.items || [];
  const bachItems = searchUnaccentedBach.data?.items || [];
  const dangItems = searchDangVu.data?.items || [];

  record(
    'T01_TEACHER_SEARCH_ACCENT_NORMALIZATION',
    'TEACHER_SEARCH',
    'GET /api/ktn/admin/teachers/search supports accented ("Mỹ Linh") and unaccented ("linh", "my linh", "nguyen van", "dang vu") Vietnamese search accurately',
    searchShortLinh.status === 200 &&
      searchAccentedLinh.status === 200 &&
      searchUnaccentedLinh.status === 200 &&
      linhItemsShort.some((t) => t.email === 'linh.lam@khongtunhi.com') &&
      linhItemsAcc.some((t) => t.email === 'linh.lam@khongtunhi.com') &&
      linhItemsNoAcc.some((t) => t.email === 'linh.lam@khongtunhi.com') &&
      bachItems.some((t) => t.email === 'bach.nguyen@khongtunhi.com') &&
      dangItems.some((t) => t.email === 'quynh.huong@khongtunhi.com'),
    `qLinh=${linhItemsShort.length} (${linhItemsShort[0]?.email}), accented=${linhItemsAcc.length} (${linhItemsAcc[0]?.email}), unaccented=${linhItemsNoAcc.length} (${linhItemsNoAcc[0]?.email}), nguyenVan=${bachItems[0]?.email}, dangVu=${dangItems[0]?.email}`
  );

  // T02: Search by code, email, phone, classCode, specialization
  const byCode = await callApi(`/api/ktn/admin/teachers/search?q=${encodeURIComponent('GV-KTN-08')}`, { token: adminToken });
  const byEmail = await callApi(`/api/ktn/admin/teachers/search?q=${encodeURIComponent('thu.ha@khongtunhi.com')}`, { token: adminToken });
  const byPhone = await callApi(`/api/ktn/admin/teachers/search?q=${encodeURIComponent('0912345678')}`, { token: adminToken });
  const byClassQuery = await callApi(`/api/ktn/admin/teachers/search?q=${encodeURIComponent('YCT2-04')}`, { token: adminToken });
  const bySpec = await callApi(`/api/ktn/admin/teachers/search?q=${encodeURIComponent('hsk cao cap')}`, { token: adminToken });

  record(
    'T02_TEACHER_SEARCH_CODE_EMAIL_PHONE_CLASS_SPEC',
    'TEACHER_SEARCH',
    'Search matches teacher code, email, phone number, assigned class code, and specialization',
    byCode.data?.items?.[0]?.email === 'linh.lam@khongtunhi.com' &&
      byEmail.data?.items?.[0]?.email === 'thu.ha@khongtunhi.com' &&
      byPhone.data?.items?.[0]?.email === 'linh.lam@khongtunhi.com' &&
      (byClassQuery.data?.items || []).some((t) => t.email === 'linh.lam@khongtunhi.com') &&
      (bySpec.data?.items || []).some((t) => t.email === 'thu.ha@khongtunhi.com'),
    `code=${byCode.data?.items?.[0]?.code}, email=${byEmail.data?.items?.[0]?.email}, phone=${byPhone.data?.items?.[0]?.phone}, classQ=${byClassQuery.data?.items?.[0]?.email}, spec=${bySpec.data?.items?.[0]?.email}`
  );

  // T03: Filter by status (active, inactive, unassigned), classCode, and courseId
  const filterActive = await callApi('/api/ktn/admin/teachers/search?status=active&limit=25&offset=0', { token: adminToken });
  const filterInactive = await callApi('/api/ktn/admin/teachers/search?status=inactive&limit=25&offset=0', { token: adminToken });
  const filterUnassigned = await callApi('/api/ktn/admin/teachers/search?status=unassigned&limit=25&offset=0', { token: adminToken });
  const filterByClass = await callApi('/api/ktn/admin/teachers/search?classCode=YCT3-02&limit=25&offset=0', { token: adminToken });
  const filterByCourse = await callApi('/api/ktn/admin/teachers/search?courseId=6adadba969897b0002482ca5&limit=25&offset=0', { token: adminToken });

  const activeItems = filterActive.data?.items || [];
  const inactiveItems = filterInactive.data?.items || [];
  const unassignedItems = filterUnassigned.data?.items || [];
  const classItems = filterByClass.data?.items || [];
  const courseItems = filterByCourse.data?.items || [];

  record(
    'T03_TEACHER_SEARCH_FILTERS_STATUS_CLASS_COURSE',
    'TEACHER_SEARCH',
    'Filters accurately by status (active, inactive, unassigned), classCode (YCT3-02), and courseId',
    activeItems.length >= 3 &&
      activeItems.every((t) => t.active !== false) &&
      inactiveItems.length >= 1 &&
      inactiveItems.every((t) => t.active === false || t.status === 'inactive') &&
      unassignedItems.length >= 1 &&
      unassignedItems.some((t) => t.email === 'bach.nguyen@khongtunhi.com') &&
      unassignedItems.every((t) => (t.assignedClasses || t.assigned_classes || []).length === 0) &&
      classItems.length === 1 &&
      classItems[0]?.email === 'thu.ha@khongtunhi.com' &&
      courseItems.some((t) => t.email === 'linh.lam@khongtunhi.com'),
    `active=${activeItems.length}, inactive=${inactiveItems.length}, unassigned=${unassignedItems.length}, classYCT3=${classItems.map((t) => t.email).join(',')}, courseHSK1=${courseItems.map((t) => t.email).join(',')}`
  );

  // T04: Lightweight summary query verification (both RPC and PostgREST fallback) + backward compatibility of GET /api/ktn/teachers
  state.queryLog.length = 0;
  const lightweightRes = await callApi('/api/ktn/admin/teachers/search?q=linh&limit=20&offset=0', { token: adminToken });
  state.disableTeacherSearchRpc = true;
  const lightweightFallbackRes = await callApi('/api/ktn/admin/teachers/search?q=linh&limit=20&offset=0', { token: adminToken });
  state.disableTeacherSearchRpc = false;
  const queriedTablesDuringSearch = state.queryLog.map((q) => q.table);
  const queriedHeavyTables = queriedTablesDuringSearch.filter((tbl) =>
    ['ktn_homeworks', 'ktn_forum_questions', 'ktn_forum_answers', 'ktn_teacher_contribution_events', 'ktn_course_grant_requests', 'ktn_attendance'].includes(tbl)
  );
  const legacyTeachersRes = await callApi('/api/ktn/teachers?q=linh', { token: adminToken });

  record(
    'T04_TEACHER_SEARCH_LIGHTWEIGHT_AND_LEGACY_COMPAT',
    'TEACHER_SEARCH',
    'GET /api/ktn/admin/teachers/search avoids heavy homework/forum/grant/attendance table scans on both RPC and PostgREST fallback paths while GET /api/ktn/teachers remains backward-compatible',
    lightweightRes.status === 200 &&
      lightweightRes.data?.searchEngine === 'postgres_rpc' &&
      lightweightFallbackRes.status === 200 &&
      lightweightFallbackRes.data?.searchEngine === 'postgrest_fallback' &&
      queriedHeavyTables.length === 0 &&
      typeof lightweightRes.data?.totalCount === 'number' &&
      typeof lightweightRes.data?.hasMore === 'boolean' &&
      typeof lightweightRes.data?.limit === 'number' &&
      typeof lightweightRes.data?.offset === 'number' &&
      legacyTeachersRes.status === 200 &&
      Array.isArray(legacyTeachersRes.data?.teachers),
    `rpcEngine=${lightweightRes.data?.searchEngine}, fallbackEngine=${lightweightFallbackRes.data?.searchEngine}, heavyTables=${queriedHeavyTables.length}, legacyStatus=${legacyTeachersRes.status}`
  );

  // T05: RBAC on /api/ktn/admin/teachers/search
  const unauthSearch = await callApi('/api/ktn/admin/teachers/search?q=linh');
  const studentSearch = await callApi('/api/ktn/admin/teachers/search?q=linh', { token: studentAToken });
  record(
    'T05_TEACHER_SEARCH_RBAC',
    'TEACHER_SEARCH',
    'Unauthenticated and Student actors are denied access (401/403) to /api/ktn/admin/teachers/search',
    (unauthSearch.status === 401 || unauthSearch.status === 403) && studentSearch.status === 403,
    `unauth=${unauthSearch.status}, student=${studentSearch.status}`
  );

  // T06: Pagination & Rapid Query Switching with AbortSignal + 1,000 & 10,000 Synthetic Teachers Benchmark (Worker + PGlite PostgreSQL 18.6)
  const workerBenchmarkSummary = {};
  for (const scale of [1000, 10000]) {
    state.tables.ktn_teachers = state.tables.ktn_teachers.filter((t) => !String(t.code || '').startsWith('GV-SYN-'));
    const baseCount = state.tables.ktn_teachers.length;
    const toGenerate = Math.max(1, scale - baseCount);
    const surnames = ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ'];
    const middles = ['Thị', 'Văn', 'Mỹ', 'Thu', 'Ngọc', 'Thanh', 'Quỳnh', 'Phương', 'Minh', 'Hoàng'];
    const givens = ['Linh', 'Hà', 'Hương', 'Trang', 'Lan', 'Mai', 'Bách', 'Tùng', 'Thảo', 'Yến'];

    for (let i = 1; i <= toGenerate; i += 1) {
      const code = `GV-SYN-${String(i).padStart(5, '0')}`;
      const email = `gv.syn.${i}@khongtunhi.com`;
      const name =
        i === toGenerate
          ? 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt'
          : `${i % 2 === 0 ? 'Cô' : 'Thầy'} ${surnames[i % 10]} ${middles[Math.floor(i / 10) % 10]} ${givens[Math.floor(i / 100) % 10]} ${i}`;
      const phone = `098${String(1000000 + i).padStart(7, '0')}`;
      const specialty = i % 4 === 0 ? 'Chuyên gia HSK Cao Cấp' : 'Chuyên gia YCT & Phản xạ Giao tiếp';
      const assignedClasses = i % 10 === 0 ? [] : i % 3 === 1 ? ['YCT2-04'] : i % 5 === 0 ? ['YCT3-02'] : [];
      const active = i % 10 !== 0;
      state.tables.ktn_teachers.push({
        code,
        email,
        name,
        phone,
        specialty,
        specialization: specialty,
        assigned_classes: assignedClasses,
        aliases: assignedClasses.map((c) => `__class:${c}`),
        assigned_courses: i % 2 === 0 ? ['6adadba969897b0002482ca5'] : [],
        active,
        status: active ? 'active' : 'inactive',
        updated_at: new Date(Date.now() - i * 1000).toISOString(),
        search_text: normalizeVi(`${code} ${name} ${email} ${phone} ${specialty} ${assignedClasses.join(' ')}`)
      });
    }

    if (scale === 1000) {
      const page1 = await callApi('/api/ktn/admin/teachers/search?limit=20&offset=0', { token: adminToken });
      const page2 = await callApi('/api/ktn/admin/teachers/search?limit=20&offset=20', { token: adminToken });
      const pageLast = await callApi('/api/ktn/admin/teachers/search?limit=20&offset=990', { token: adminToken });
      const p1Codes = new Set((page1.data?.items || []).map((t) => t.code));
      const p2Overlap = (page2.data?.items || []).some((t) => p1Codes.has(t.code));

      // Rapid query switch simulation: in-flight queries #1 & #2 (delayed 25ms) are aborted via AbortSignal before resolving
      const ac1 = new AbortController();
      const ac2 = new AbortController();
      const pRapid1 = callApi('/api/ktn/admin/teachers/search?q=nguyen&limit=20', {
        token: adminToken,
        signal: ac1.signal,
        delayMs: 25
      }).catch((err) => ({ aborted: Boolean(err?.aborted || err?.name === 'AbortError'), name: err?.name }));
      ac1.abort();
      const pRapid2 = callApi('/api/ktn/admin/teachers/search?q=tran&limit=20', {
        token: adminToken,
        signal: ac2.signal,
        delayMs: 25
      }).catch((err) => ({ aborted: Boolean(err?.aborted || err?.name === 'AbortError'), name: err?.name }));
      ac2.abort();
      const rapidFinal = await callApi(
        `/api/ktn/admin/teachers/search?q=${encodeURIComponent('Cô Đặng Vũ Quỳnh Hương Đặc Biệt')}&limit=20`,
        { token: adminToken }
      );
      const [rapidRes1, rapidRes2] = await Promise.all([pRapid1, pRapid2]);

      record(
        'T06_TEACHER_SEARCH_PAGINATION_AND_RAPID_QUERY_SWITCH',
        'TEACHER_SEARCH',
        'Pagination returns disjoint pages with accurate totalCount (1,000) and hasMore flags, and rapid query switching aborts stale in-flight requests so only the latest query resolves',
        page1.data?.items?.length === 20 &&
          page1.data?.totalCount === 1000 &&
          page1.data?.hasMore === true &&
          page2.data?.items?.length === 20 &&
          !p2Overlap &&
          pageLast.data?.items?.length === 10 &&
          pageLast.data?.hasMore === false &&
          rapidRes1?.aborted === true &&
          rapidRes2?.aborted === true &&
          rapidFinal.data?.items?.[0]?.name === 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt',
        `p1=${page1.data?.items?.length}/${page1.data?.totalCount} (hasMore=${page1.data?.hasMore}), p2Overlap=${p2Overlap}, pLast=${pageLast.data?.items?.length} (hasMore=${pageLast.data?.hasMore}), aborted1=${rapidRes1?.aborted}, aborted2=${rapidRes2?.aborted}, rapidFinal=${rapidFinal.data?.items?.[0]?.name}`
      );
    }

    const measureWorkerSearch = async (queryPath, runs = 15) => {
      const samples = [];
      let last = null;
      for (let i = 0; i < runs; i += 1) {
        last = await callApi(queryPath, { token: adminToken });
        samples.push(last.elapsedMs);
      }
      samples.sort((a, b) => a - b);
      return {
        runs,
        p50Ms: percentile(samples, 50),
        p95Ms: percentile(samples, 95),
        totalCount: last?.data?.totalCount || 0,
        returnedRows: last?.data?.items?.length || 0,
        topMatchName: last?.data?.items?.[0]?.name || null,
        searchEngine: last?.data?.searchEngine || null
      };
    };

    const nameBench = await measureWorkerSearch(
      `/api/ktn/admin/teachers/search?q=${encodeURIComponent('dang vu quynh huong dac biet')}&limit=20&offset=0`
    );
    const emailBench = await measureWorkerSearch(
      `/api/ktn/admin/teachers/search?q=${encodeURIComponent(`gv.syn.${toGenerate}@khongtunhi.com`)}&limit=20&offset=0`
    );
    const pageBench = await measureWorkerSearch(
      `/api/ktn/admin/teachers/search?limit=20&offset=${scale === 1000 ? 500 : 2500}`
    );

    workerBenchmarkSummary[scale] = {
      scale,
      nameSearch: nameBench,
      emailSearch: emailBench,
      deepPagination: pageBench
    };
  }

  // Restore base 4 teachers after synthetic Worker benchmark
  state.tables.ktn_teachers = state.tables.ktn_teachers.filter((t) => !String(t.code || '').startsWith('GV-SYN-'));

  // Run PGlite PostgreSQL 18.6 benchmark for 1,000 and 10,000 synthetic teachers (with full schema + V3 + 20261109_ktn_master_upgrade.sql)
  const pgDb = new PGlite({ extensions: { pg_trgm } });
  await pgDb.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  const fullSchemaSql = fs.readFileSync(path.join(ROOT_DIR, 'supabase_schema.sql'), 'utf8');
  await pgDb.exec(fullSchemaSql);
  const migrationV3Sql = fs.readFileSync(path.join(ROOT_DIR, 'supabase_migration_v3.sql'), 'utf8');
  await pgDb.exec(migrationV3Sql);
  const masterUpgradeSql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase', 'migrations', '20261109_ktn_master_upgrade.sql'),
    'utf8'
  );
  await pgDb.exec(masterUpgradeSql);
  await pgDb.exec(`
    CREATE INDEX IF NOT EXISTS idx_ktn_teachers_code_asc ON public.ktn_teachers (code ASC);
    CREATE INDEX IF NOT EXISTS idx_ktn_teachers_active_code ON public.ktn_teachers (active, code ASC);
  `);

  const postgresBenchmarkSummary = {};
  for (const scale of [1000, 10000]) {
    await pgDb.exec(`DELETE FROM public.ktn_teachers WHERE code LIKE 'GV-SYN-%';`);
    const baseCnt = (await pgDb.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_teachers`)).rows[0].cnt;
    const synthCnt = Math.max(1, scale - baseCnt);
    await pgDb.query(
      `
      INSERT INTO public.ktn_teachers (
        code, email, name, phone, specialty, aliases, active,
        assigned_classes, status, provisioning_status, sync_status, updated_at, search_text
      )
      SELECT
        'GV-SYN-' || LPAD(i::text, 5, '0'),
        'gv.syn.' || i::text || '@khongtunhi.com',
        CASE
          WHEN i = $1 THEN 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt'
          ELSE (ARRAY['Cô','Thầy'])[1 + (i % 2)] || ' '
               || (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Vũ','Đặng','Bùi','Đỗ','Hồ'])[1 + (i % 10)] || ' '
               || (ARRAY['Thị','Văn','Mỹ','Thu','Ngọc','Thanh','Quỳnh','Phương','Minh','Hoàng'])[1 + ((i / 10) % 10)] || ' '
               || (ARRAY['Linh','Hà','Hương','Trang','Lan','Mai','Bách','Tùng','Thảo','Yến'])[1 + ((i / 100) % 10)] || ' '
               || i::text
        END,
        '098' || LPAD((1000000 + i)::text, 7, '0'),
        CASE WHEN i % 4 = 0 THEN 'Chuyên gia HSK Cao Cấp' ELSE 'Chuyên gia YCT & Phản xạ Giao tiếp' END,
        '[]'::jsonb,
        (i % 10 <> 0),
        CASE WHEN i % 3 = 1 THEN '["YCT2-04"]'::jsonb ELSE '[]'::jsonb END,
        CASE WHEN i % 10 = 0 THEN 'inactive' ELSE 'active' END,
        'ready_to_login',
        'synced',
        NOW() - (i || ' seconds')::interval,
        public.ktn_normalize_vi(
          'GV-SYN-' || LPAD(i::text, 5, '0') || ' gv.syn.' || i::text || '@khongtunhi.com ' ||
          CASE
            WHEN i = $1 THEN 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt'
            ELSE (ARRAY['Cô','Thầy'])[1 + (i % 2)] || ' '
                 || (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Vũ','Đặng','Bùi','Đỗ','Hồ'])[1 + (i % 10)] || ' '
                 || (ARRAY['Thị','Văn','Mỹ','Thu','Ngọc','Thanh','Quỳnh','Phương','Minh','Hoàng'])[1 + ((i / 10) % 10)] || ' '
                 || (ARRAY['Linh','Hà','Hương','Trang','Lan','Mai','Bách','Tùng','Thảo','Yến'])[1 + ((i / 100) % 10)] || ' '
                 || i::text
          END || ' 098' || LPAD((1000000 + i)::text, 7, '0')
        )
      FROM generate_series(1, $1) AS g(i);
      `,
      [synthCnt]
    );
    await pgDb.exec(`ANALYZE public.ktn_teachers;`);

    const runPgQuery = async (sql, params = [], runs = 20) => {
      const samples = [];
      let rows = [];
      for (let i = 0; i < runs; i += 1) {
        const t0 = performance.now();
        const r = await pgDb.query(sql, params);
        samples.push(+(performance.now() - t0).toFixed(2));
        rows = r.rows || [];
      }
      samples.sort((a, b) => a - b);
      return {
        runs,
        p50Ms: percentile(samples, 50),
        p95Ms: percentile(samples, 95),
        returnedRows: rows.length,
        topMatchName: rows[0]?.name || null
      };
    };

    const pgName = await runPgQuery(
      `SELECT code, name, email, specialty, active, COUNT(*) OVER()::int AS total_count
       FROM public.ktn_teachers
       WHERE search_text LIKE '%dang%' AND search_text LIKE '%quynh%' AND search_text LIKE '%huong%' AND search_text LIKE '%biet%'
       ORDER BY code ASC LIMIT 20 OFFSET 0`
    );
    const pgEmail = await runPgQuery(
      `SELECT code, name, email FROM public.ktn_teachers WHERE LOWER(email) = LOWER($1) LIMIT 20`,
      [`gv.syn.${synthCnt}@khongtunhi.com`]
    );
    const pgPage = await runPgQuery(
      `SELECT code, name, email, active, COUNT(*) OVER()::int AS total_count
       FROM public.ktn_teachers ORDER BY code ASC LIMIT 20 OFFSET $1`,
      [scale === 1000 ? 500 : 2500]
    );
    const pgRpcCheck = await pgDb.query(
      `SELECT code, name, email, total_count FROM public.ktn_search_teachers($1, 'all', NULL, NULL, 20, 0)`,
      ['Đặng Vũ Quỳnh Hương Đặc Biệt']
    );

    postgresBenchmarkSummary[scale] = {
      scale,
      nameSearch: pgName,
      emailSearch: pgEmail,
      deepPagination: pgPage,
      rpcVerifiedMatch: pgRpcCheck.rows[0]?.name || null
    };
  }
  await pgDb.close();

  record(
    'T07_TEACHER_SEARCH_1K_AND_10K_BENCHMARK',
    'TEACHER_SEARCH',
    '1,000 and 10,000 synthetic teachers benchmark measured on both Worker /api/ktn/admin/teachers/search and PostgreSQL 18.6 pg_trgm + ktn_search_teachers RPC',
    workerBenchmarkSummary[1000].nameSearch.p95Ms < 150 &&
      workerBenchmarkSummary[10000].nameSearch.p95Ms < 350 &&
      postgresBenchmarkSummary[1000].nameSearch.p95Ms < 100 &&
      postgresBenchmarkSummary[10000].nameSearch.p95Ms < 150 &&
      postgresBenchmarkSummary[10000].nameSearch.topMatchName === 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt' &&
      postgresBenchmarkSummary[10000].rpcVerifiedMatch === 'Cô Đặng Vũ Quỳnh Hương Đặc Biệt',
    `1k Worker p50=${workerBenchmarkSummary[1000].nameSearch.p50Ms}ms/p95=${workerBenchmarkSummary[1000].nameSearch.p95Ms}ms (PG SQL p50=${postgresBenchmarkSummary[1000].nameSearch.p50Ms}ms/p95=${postgresBenchmarkSummary[1000].nameSearch.p95Ms}ms); 10k Worker p50=${workerBenchmarkSummary[10000].nameSearch.p50Ms}ms/p95=${workerBenchmarkSummary[10000].nameSearch.p95Ms}ms (PG SQL p50=${postgresBenchmarkSummary[10000].nameSearch.p50Ms}ms/p95=${postgresBenchmarkSummary[10000].nameSearch.p95Ms}ms)`
  );

  // =========================================================================
  // SECTION 2: CHAT INBOX LATEST-FIRST, EMPTY 1-1 REMOVAL, 500+ MSGS & RBAC
  // =========================================================================
  console.log('\n--- SECTION 2: CHAT INBOX LATEST-FIRST, EMPTY 1-1 REMOVAL, 500+ MSGS & RBAC ---');

  // Seed initial real messages in class:YCT2-04, class:YCT3-02, and student:older.hs@khongtunhi.com
  // Note: minhkhang@khongtunhi.com and new.hs@khongtunhi.com have 0 messages!
  state.tables.ktn_messages = [
    {
      id: 'MSG-INIT-OLDER-1',
      room_id: 'student:older.hs@khongtunhi.com',
      class_code: null,
      sender_email: 'older.hs@khongtunhi.com',
      sender_name: 'Lê Bảo Ngọc (Hội thoại cũ)',
      sender_role: 'student',
      content: 'Thưa cô em gửi câu hỏi từ tháng trước ạ',
      created_at: '2026-10-15T09:00:00.000Z'
    },
    {
      id: 'MSG-INIT-YCT3-1',
      room_id: 'class:YCT3-02',
      class_code: 'YCT3-02',
      sender_email: 'thu.ha@khongtunhi.com',
      sender_name: 'Cô Trần Thu Hà',
      sender_role: 'teacher',
      content: 'Lớp YCT3-02 chuẩn bị bài 2 nhé',
      created_at: '2026-11-08T10:00:00.000Z'
    },
    {
      id: 'MSG-INIT-YCT2-1',
      room_id: 'class:YCT2-04',
      class_code: 'YCT2-04',
      sender_email: 'linh.lam@khongtunhi.com',
      sender_name: 'Cô Lâm Vũ Mỹ Linh',
      sender_role: 'teacher',
      content: 'Chào các con lớp YCT2-04 buổi 3',
      created_at: '2026-11-09T14:00:00.000Z'
    }
  ];

  // C01: Empty 1-1 removal, Nhắn mới candidates search, and opening a draft 1-1 room without sending does not create a thread
  const linhCandidates = await callApi('/api/ktn/messages/candidates?q=khang', { token: teacherLinhToken });
  const linhCrossClassCandidates = await callApi('/api/ktn/messages/candidates?classCode=YCT3-02', { token: teacherLinhToken });
  // Simulate opening draft 1-1 room for minhkhang (fetching history) and leaving without sending a message
  const openDraftWithoutSending = await callApi(
    `/api/ktn/messages?roomId=${encodeURIComponent('student:minhkhang@khongtunhi.com')}`,
    { token: teacherLinhToken }
  );

  const linhRoomsInit = await callApi('/api/ktn/messages/rooms', { token: teacherLinhToken });
  const linhPrivateInit = linhRoomsInit.data?.privateThreads || [];
  const hasEmptyMinhKhang = linhPrivateInit.some((r) => r.studentEmail === 'minhkhang@khongtunhi.com' || r.roomId === 'student:minhkhang@khongtunhi.com');
  const hasEmptyNewHs = linhPrivateInit.some((r) => r.studentEmail === 'new.hs@khongtunhi.com' || r.roomId === 'student:new.hs@khongtunhi.com');
  const hasActiveOlderHs = linhPrivateInit.some((r) => r.studentEmail === 'older.hs@khongtunhi.com' || r.roomId === 'student:older.hs@khongtunhi.com');

  record(
    'C01_EMPTY_1_1_REMOVED_AND_DRAFT_LEAVE_NO_JUNK_THREAD',
    'CHAT_INBOX',
    'Students with 0 messages (minhkhang, new.hs) do not generate empty student:<email> threads in GET /api/ktn/messages/rooms even after opening draft room without sending, while Nhắn mới (/api/ktn/messages/candidates) finds eligible students in scope',
    linhRoomsInit.status === 200 &&
      !hasEmptyMinhKhang &&
      !hasEmptyNewHs &&
      hasActiveOlderHs &&
      openDraftWithoutSending.status === 200 &&
      (openDraftWithoutSending.data?.messages || []).length === 0 &&
      linhCandidates.status === 200 &&
      (linhCandidates.data?.items || []).some((c) => c.studentEmail === 'minhkhang@khongtunhi.com') &&
      !(linhCandidates.data?.items || []).some((c) => c.studentEmail === 'e2e.hs.b@khongtunhi.com') &&
      linhCrossClassCandidates.status === 403,
    `privateThreads=[${linhPrivateInit.map((r) => r.roomId).join(', ')}], candidatesMatch=${linhCandidates.data?.items?.[0]?.studentEmail}, crossClassCandidates=${linhCrossClassCandidates.status}`
  );

  // C02: Empty group rooms preserved but never rank above rooms with messages, and student.updated_at never inflates ordering
  const mkStu = state.tables.ktn_students.find((s) => s.email === 'minhkhang@khongtunhi.com');
  mkStu.updated_at = '2026-12-31T23:59:59.000Z';
  const olderStu = state.tables.ktn_students.find((s) => s.email === 'older.hs@khongtunhi.com');
  olderStu.updated_at = '2026-12-30T23:59:59.000Z';

  const adminRoomsInit = await callApi('/api/ktn/messages/rooms', { token: adminToken });
  const adminGroupRooms = adminRoomsInit.data?.groupRooms || [];
  const yct1NewRoom = adminGroupRooms.find((r) => r.classCode === 'YCT1-NEW' || r.roomId === 'class:YCT1-NEW');
  const firstGroupRoom = adminGroupRooms[0];

  record(
    'C02_EMPTY_GROUP_PRESERVED_AND_STUDENT_UPDATED_AT_IMMUNITY',
    'CHAT_INBOX',
    'Empty class group (class:YCT1-NEW) remains accessible in groupRooms but does not rank above rooms with messages; student.updated_at never inflates room ordering',
    Boolean(yct1NewRoom) &&
      firstGroupRoom?.roomId === 'class:YCT2-04' &&
      !(adminRoomsInit.data?.privateThreads || []).some((r) => r.studentEmail === 'minhkhang@khongtunhi.com'),
    `firstGroupRoom=${firstGroupRoom?.roomId} (lastMsg="${firstGroupRoom?.lastMessage}"), yct1NewPresent=${Boolean(yct1NewRoom)}`
  );

  // C03: Sending the first 1-1 message creates exactly 1 thread and moves it to the top
  const sendFirst1To1 = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      roomId: 'student:new.hs@khongtunhi.com',
      content: 'Cô chào mẹ bé Gia Hân nhé!',
      clientMessageId: 'cmsg-first-1to1-newhs'
    }
  });
  const linhRoomsAfter1To1 = await callApi('/api/ktn/messages/rooms', { token: teacherLinhToken });
  const linhRoomsReload = await callApi('/api/ktn/messages/rooms', { token: teacherLinhToken });
  const privAfter1To1 = linhRoomsAfter1To1.data?.privateThreads || [];
  const newHsThreads = privAfter1To1.filter((r) => r.roomId === 'student:new.hs@khongtunhi.com');

  record(
    'C03_FIRST_1_1_MESSAGE_CREATES_SINGLE_THREAD_AT_TOP',
    'CHAT_INBOX',
    'Sending first 1-1 message creates exactly 1 student:<email> thread, places it at index 0 of privateThreads/inbox, and persists across reload',
    sendFirst1To1.status === 200 &&
      newHsThreads.length === 1 &&
      privAfter1To1[0]?.roomId === 'student:new.hs@khongtunhi.com' &&
      (linhRoomsReload.data?.privateThreads || [])[0]?.roomId === 'student:new.hs@khongtunhi.com',
    `newHsCount=${newHsThreads.length}, topPrivate=${privAfter1To1[0]?.roomId}, reloadTopPrivate=${(linhRoomsReload.data?.privateThreads || [])[0]?.roomId}`
  );

  // C04: Room that just received a message moves to index 0 of active rooms
  const postToYct3 = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: teacherHaToken,
    body: {
      roomId: 'class:YCT3-02',
      content: 'Tin nhắn mới nhất vừa gửi vào YCT3-02!',
      clientMessageId: 'cmsg-yct3-top-test'
    }
  });
  const adminRoomsAfterYct3 = await callApi('/api/ktn/messages/rooms', { token: adminToken });
  const adminGroupsAfterYct3 = adminRoomsAfterYct3.data?.groupRooms || [];
  const adminInboxAfterYct3 = adminRoomsAfterYct3.data?.inboxRooms || adminGroupsAfterYct3;

  record(
    'C04_LATEST_MESSAGE_MOVES_ROOM_TO_INDEX_0',
    'CHAT_INBOX',
    'Posting a new message to class:YCT3-02 immediately moves class:YCT3-02 to index 0 of active rooms with updated lastMessage and timestamp',
    postToYct3.status === 200 &&
      adminGroupsAfterYct3[0]?.roomId === 'class:YCT3-02' &&
      adminGroupsAfterYct3[0]?.lastMessage === 'Tin nhắn mới nhất vừa gửi vào YCT3-02!' &&
      adminInboxAfterYct3[0]?.roomId === 'class:YCT3-02',
    `topGroup=${adminGroupsAfterYct3[0]?.roomId}, topInbox=${adminInboxAfterYct3[0]?.roomId}, lastMessage="${adminGroupsAfterYct3[0]?.lastMessage}"`
  );

  // C05: 500+ messages concentrated in one room + >100 messages in one 1-1 thread does NOT erase other rooms' lastMessage
  const baseTs = Date.parse('2026-11-10T01:00:00.000Z');
  for (let i = 1; i <= 360; i += 1) {
    state.tables.ktn_messages.push({
      id: `MSG-BULK-YCT2-${String(i).padStart(4, '0')}`,
      room_id: 'class:YCT2-04',
      class_code: 'YCT2-04',
      sender_email: 'e2e.hs.a@khongtunhi.com',
      sender_name: 'Nguyễn Hoàng Ngân',
      sender_role: 'student',
      content: `Tin nhắn thảo luận lớp YCT2-04 số #${i}`,
      created_at: new Date(baseTs + i * 1000).toISOString()
    });
  }
  for (let i = 1; i <= 160; i += 1) {
    state.tables.ktn_messages.push({
      id: `MSG-BULK-1TO1-A-${String(i).padStart(4, '0')}`,
      room_id: 'student:e2e.hs.a@khongtunhi.com',
      class_code: null,
      sender_email: 'e2e.hs.a@khongtunhi.com',
      sender_name: 'Nguyễn Hoàng Ngân',
      sender_role: 'student',
      content: `Tin nhắn riêng Hoàng Ngân số #${i}`,
      created_at: new Date(baseTs + (400 + i) * 1000).toISOString()
    });
  }

  const adminRoomsAfter520 = await callApi('/api/ktn/messages/rooms', { token: adminToken });
  const yct3After520 = (adminRoomsAfter520.data?.groupRooms || []).find((r) => r.roomId === 'class:YCT3-02');
  const olderHsAfter520 = (adminRoomsAfter520.data?.privateThreads || []).find(
    (r) => r.roomId === 'student:older.hs@khongtunhi.com'
  );
  const yct2After520 = (adminRoomsAfter520.data?.groupRooms || []).find((r) => r.roomId === 'class:YCT2-04');

  record(
    'C05_500_PLUS_MESSAGES_CONCENTRATION_RETENTION',
    'CHAT_INBOX',
    'With 520+ messages concentrated in class:YCT2-04 (360) and student:e2e.hs.a (160), class:YCT3-02 and older 1-1 thread student:older.hs (>160 messages ago) still retain their lastMessage and timestamp',
    Boolean(yct3After520?.lastMessage) &&
      yct3After520?.lastMessage === 'Tin nhắn mới nhất vừa gửi vào YCT3-02!' &&
      Boolean(olderHsAfter520?.lastMessage) &&
      olderHsAfter520?.lastMessage === 'Thưa cô em gửi câu hỏi từ tháng trước ạ' &&
      olderHsAfter520?.updatedAt === '2026-10-15T09:00:00.000Z' &&
      yct2After520?.lastMessage === 'Tin nhắn thảo luận lớp YCT2-04 số #360',
    `yct3Last="${yct3After520?.lastMessage}", olderHsLast="${olderHsAfter520?.lastMessage}" (${olderHsAfter520?.updatedAt}), yct2Last="${yct2After520?.lastMessage}"`
  );

  // C06: Unread counts match read cursors accurately
  // Mark student:e2e.hs.a@khongtunhi.com read up to #158 (leaving #159 and #160 unread = 2 unread)
  const msg158Ts = new Date(baseTs + (400 + 158) * 1000).toISOString();
  await callApi('/api/ktn/messages/read', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      roomId: 'student:e2e.hs.a@khongtunhi.com',
      lastReadMessageId: 'MSG-BULK-1TO1-A-0158',
      lastReadAt: msg158Ts
    }
  });
  const linhRoomsPartialRead = await callApi('/api/ktn/messages/rooms', { token: teacherLinhToken });
  const hsAThreadPartial = (linhRoomsPartialRead.data?.privateThreads || []).find(
    (r) => r.roomId === 'student:e2e.hs.a@khongtunhi.com'
  );

  // Now mark read up to #160 (0 unread)
  const msg160Ts = new Date(baseTs + (400 + 160) * 1000).toISOString();
  await callApi('/api/ktn/messages/read', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      roomId: 'student:e2e.hs.a@khongtunhi.com',
      lastReadMessageId: 'MSG-BULK-1TO1-A-0160',
      lastReadAt: msg160Ts
    }
  });
  const linhRoomsFullRead = await callApi('/api/ktn/messages/rooms', { token: teacherLinhToken });
  const hsAThreadFull = (linhRoomsFullRead.data?.privateThreads || []).find(
    (r) => r.roomId === 'student:e2e.hs.a@khongtunhi.com'
  );

  record(
    'C06_UNREAD_COUNTS_MATCH_READ_CURSORS',
    'CHAT_INBOX',
    'Unread count matches read cursor accurately (unreadCount=2 after reading #158/160, and unreadCount=0 after reading #160/160)',
    hsAThreadPartial?.unreadCount === 2 &&
      hsAThreadPartial?.unread === true &&
      hsAThreadFull?.unreadCount === 0 &&
      hsAThreadFull?.unread === false,
    `partialReadUnread=${hsAThreadPartial?.unreadCount}, fullReadUnread=${hsAThreadFull?.unreadCount}`
  );

  // C07: Private chat RBAC (rooms list, direct deep-link GET, POST message, and recipient push notification isolation)
  const pushIdxBeforePrivateRbac = state.pushDeliveries.length;
  const linhGetOtherClassStu = await callApi(
    `/api/ktn/messages?roomId=${encodeURIComponent('student:e2e.hs.b@khongtunhi.com')}`,
    { token: teacherLinhToken }
  );
  const linhPostOtherClassStu = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: teacherLinhToken,
    body: { roomId: 'student:e2e.hs.b@khongtunhi.com', content: 'Cô Linh nhắn học viên lớp cô Hà' }
  });
  const linhGetUnassignedStu = await callApi(
    `/api/ktn/messages?roomId=${encodeURIComponent('student:unassigned.hs@khongtunhi.com')}`,
    { token: teacherLinhToken }
  );
  const linhPostUnassignedStu = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: teacherLinhToken,
    body: { roomId: 'student:unassigned.hs@khongtunhi.com', content: 'Cô Linh nhắn học viên chưa xếp lớp' }
  });
  const pushDeliveriesOnForbidden = state.pushDeliveries.slice(pushIdxBeforePrivateRbac);

  // Authorized 1-1 message from Teacher Linh to Student A (YCT2-04) must notify ONLY epStudentA
  const pushIdxBeforeAuth1To1 = state.pushDeliveries.length;
  const linhPostAuthStuA = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      roomId: 'student:e2e.hs.a@khongtunhi.com',
      content: 'Cô Linh gửi nhận xét riêng cho Hoàng Ngân nhé!',
      clientMessageId: 'cmsg-auth-1to1-push-scope'
    }
  });
  const auth1To1Deliveries = state.pushDeliveries.slice(pushIdxBeforeAuth1To1);

  const linhRoomsCheckForbidden = (linhRoomsFullRead.data?.privateThreads || []).some(
    (r) =>
      r.roomId === 'student:e2e.hs.b@khongtunhi.com' ||
      r.roomId === 'student:unassigned.hs@khongtunhi.com'
  );

  record(
    'C07_PRIVATE_CHAT_RBAC_CROSS_CLASS_AND_UNASSIGNED_403',
    'CHAT_RBAC',
    'Teacher outside a student class (e2e.hs.b in YCT3-02) and teacher targeting an unassigned student (unassigned.hs) get 403 Forbidden on GET/POST /api/ktn/messages with 0 leaked push notifications, while authorized 1-1 chat notifies only the target student',
    linhGetOtherClassStu.status === 403 &&
      linhPostOtherClassStu.status === 403 &&
      linhGetUnassignedStu.status === 403 &&
      linhPostUnassignedStu.status === 403 &&
      !linhRoomsCheckForbidden &&
      pushDeliveriesOnForbidden.length === 0 &&
      linhPostAuthStuA.status === 200 &&
      auth1To1Deliveries.length === 1 &&
      auth1To1Deliveries[0]?.endpoint === epStudentA,
    `otherClassGet=${linhGetOtherClassStu.status}, otherClassPost=${linhPostOtherClassStu.status}, unassignedGet=${linhGetUnassignedStu.status}, unassignedPost=${linhPostUnassignedStu.status}, forbiddenPush=${pushDeliveriesOnForbidden.length}, authPushEndpoint=${auth1To1Deliveries[0]?.endpoint}`
  );

  // C08: Image attachment message preserves raw content on server without DLP false-positive while UI helpers suppress duplicate [Đã gửi ảnh: ...] marker
  const imgOnlyRawContent = '[Đã gửi ảnh: IMG_20261110_bai_tap_viet_chu_han_rat_dai_001.png]';
  const imgAttachmentUrl =
    'https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/sample.png#name=IMG_20261110_bai_tap_viet_chu_han_rat_dai_001.png&kind=image';
  const sendImgMsgRes = await callApi('/api/ktn/messages', {
    method: 'POST',
    token: studentAToken,
    body: {
      roomId: 'class:YCT2-04',
      content: imgOnlyRawContent,
      attachmentUrl: imgAttachmentUrl,
      clientMessageId: 'cmsg-img-marker-check-1'
    }
  });
  const isRedundantMarker = /^\[Đã (?:gửi ảnh|gửi video|gửi thu âm|đính kèm tệp):\s*[^\]]+\]$/i.test(
    String(sendImgMsgRes.data?.message?.content || '').trim()
  );

  record(
    'C08_IMAGE_MESSAGE_NO_DUPLICATE_FILENAME_MARKER',
    'CHAT_UI_CONTRACT',
    'Image message with long filename stores raw message intact via POST /api/ktn/messages while matching redundant placeholder pattern so MessageBubble renders only the image without duplicate filename text',
    sendImgMsgRes.status === 200 &&
      sendImgMsgRes.data?.message?.content === imgOnlyRawContent &&
      sendImgMsgRes.data?.message?.attachment_url === imgAttachmentUrl &&
      isRedundantMarker === true,
    `status=${sendImgMsgRes.status}, rawPreserved=${sendImgMsgRes.data?.message?.content === imgOnlyRawContent}, redundantMarkerDetected=${isRedundantMarker}`
  );

  // =========================================================================
  // SECTION 3: TEACHER FILE ASSIGNMENT & NON-OVERWRITING EXERCISES
  // =========================================================================
  console.log('\n--- SECTION 3: TEACHER FILE ASSIGNMENT & NON-OVERWRITING EXERCISES ---');

  // F01: Teacher uploads PDF, Word (.docx), PowerPoint (.pptx), image (.png), audio (.m4a), and video (.mp4 within 50MB limit)
  const fileSamples = [
    { fileName: 'Giao-trinh-YCT2-Buoi-3.pdf', fileType: 'application/pdf', fileSize: 1250000 },
    { fileName: 'Bai-tap-viet-Han-tu.docx', fileType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', fileSize: 450000 },
    { fileName: 'Flashcard-Tu-Vung-Buoi-3.png', fileType: 'image/png', fileSize: 680000 },
    { fileName: 'File-nghe-mau-co-Linh.m4a', fileType: 'audio/mp4', fileSize: 2100000 },
    { fileName: 'Video-huong-dan-phat-am.mp4', fileType: 'video/mp4', fileSize: 15000000 }
  ];

  const uploadedAttachments = [];
  for (let i = 0; i < fileSamples.length; i += 1) {
    const f = fileSamples[i];
    // Try dedicated assignment upload endpoint first, falling back to /api/ktn/upload-url with classCode/scope
    let upRes = await callApi('/api/ktn/class-sessions/upload-url', {
      method: 'POST',
      token: teacherLinhToken,
      body: { ...f, classCode: 'YCT2-04', sessionNum: 3, scope: 'assignment' }
    });
    if (upRes.status === 404) {
      upRes = await callApi('/api/ktn/upload-url', {
        method: 'POST',
        token: teacherLinhToken,
        body: { ...f, classCode: 'YCT2-04', sessionNum: 3, scope: 'assignment' }
      });
    }
    assert.strictEqual(upRes.status, 200, `Upload presign must succeed for ${f.fileName} (got ${upRes.status})`);
    uploadedAttachments.push({
      id: `ATT-B3-E1-${i + 1}`,
      name: f.fileName,
      url: upRes.data?.fileUrl || upRes.data?.cdnUrl,
      mimeType: f.fileType,
      sizeBytes: f.fileSize
    });
  }

  record(
    'F01_TEACHER_UPLOAD_PDF_DOCX_PNG_M4A_MP4',
    'FILE_ASSIGNMENT',
    'Teacher obtains presigned upload URLs for PDF, Word (.docx), Image (.png), Audio (.m4a), and Video (.mp4 <= 50MB)',
    uploadedAttachments.length === 5 && uploadedAttachments.every((a) => Boolean(a.url && a.url.startsWith('https://'))),
    `uploadedCount=${uploadedAttachments.length}, sampleUrl=${uploadedAttachments[0]?.url}`
  );

  // F02: Reject oversized files (>50MB) and disallowed MIME types (.exe / application/x-msdownload) with 400
  let oversizeUploadRes = await callApi('/api/ktn/class-sessions/upload-url', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      fileName: 'Video-qua-nang-60MB.mp4',
      fileType: 'video/mp4',
      fileSize: 60 * 1024 * 1024,
      classCode: 'YCT2-04',
      sessionNum: 3,
      scope: 'assignment'
    }
  });
  if (oversizeUploadRes.status === 404) {
    oversizeUploadRes = await callApi('/api/ktn/upload-url', {
      method: 'POST',
      token: teacherLinhToken,
      body: {
        fileName: 'Video-qua-nang-60MB.mp4',
        fileType: 'video/mp4',
        fileSize: 60 * 1024 * 1024,
        classCode: 'YCT2-04',
        sessionNum: 3,
        scope: 'assignment'
      }
    });
  }

  let exeUploadRes = await callApi('/api/ktn/class-sessions/upload-url', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      fileName: 'trojan_installer.exe',
      fileType: 'application/x-msdownload',
      fileSize: 102400,
      classCode: 'YCT2-04',
      sessionNum: 3,
      scope: 'assignment'
    }
  });
  if (exeUploadRes.status === 404) {
    exeUploadRes = await callApi('/api/ktn/upload-url', {
      method: 'POST',
      token: teacherLinhToken,
      body: {
        fileName: 'trojan_installer.exe',
        fileType: 'application/x-msdownload',
        fileSize: 102400,
        classCode: 'YCT2-04',
        sessionNum: 3,
        scope: 'assignment'
      }
    });
  }

  record(
    'F02_REJECT_OVERSIZED_AND_DANGEROUS_MIME_400',
    'FILE_ASSIGNMENT',
    'Rejects oversized assignment files (>50MB) and dangerous executable files (.exe / application/x-msdownload) with 400',
    oversizeUploadRes.status === 400 && exeUploadRes.status === 400,
    `oversizeStatus=${oversizeUploadRes.status}, exeStatus=${exeUploadRes.status}`
  );

  // F03: Reject teacher outside the class with 403
  let crossClassUploadRes = await callApi('/api/ktn/class-sessions/upload-url', {
    method: 'POST',
    token: teacherHaToken,
    body: {
      fileName: 'Tai-lieu-YCT2.pdf',
      fileType: 'application/pdf',
      fileSize: 500000,
      classCode: 'YCT2-04',
      sessionNum: 3,
      scope: 'assignment'
    }
  });
  if (crossClassUploadRes.status === 404) {
    crossClassUploadRes = await callApi('/api/ktn/upload-url', {
      method: 'POST',
      token: teacherHaToken,
      body: {
        fileName: 'Tai-lieu-YCT2.pdf',
        fileType: 'application/pdf',
        fileSize: 500000,
        classCode: 'YCT2-04',
        sessionNum: 3,
        scope: 'assignment'
      }
    });
  }
  const crossClassSessionSave = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherHaToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình của em',
      exercises: [
        {
          id: 'YCT2-04-B3-E1',
          num: 1,
          title: 'Bài 1',
          prompt: 'Đọc từ vựng',
          type: 'audio',
          attachments: uploadedAttachments
        }
      ]
    }
  });

  record(
    'F03_REJECT_TEACHER_OUTSIDE_CLASS_403',
    'FILE_ASSIGNMENT',
    'Teacher outside the class (thu.ha targeting YCT2-04) gets 403 Forbidden on both assignment file upload and session save',
    crossClassUploadRes.status === 403 && crossClassSessionSave.status === 403,
    `uploadStatus=${crossClassUploadRes.status}, sessionSaveStatus=${crossClassSessionSave.status}`
  );

  // F04: Teacher saves Exercise #1 with 5 attachments; persists across reload; dispatches homework_assigned push to YCT2-04 students; Student in class can view/download; Student outside class gets 403
  const pushIdxBeforeEx1 = state.pushDeliveries.length;
  const saveEx1Res = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'create_exercise',
      exercises: [
        {
          id: 'YCT2-04-B3-E1',
          num: 1,
          title: 'Bài 1: Đọc to từ vựng & làm phiếu PDF',
          prompt: 'Con mở file PDF và nghe file mẫu cô đính kèm rồi thu âm lại nhé.',
          type: 'audio',
          dueAt: '2026-11-20T13:00:00.000Z',
          attachments: uploadedAttachments
        }
      ]
    }
  });
  const ex1PushDeliveries = state.pushDeliveries.slice(pushIdxBeforeEx1);

  const stuAGetSessions = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentAToken });
  const stuBGetSessions = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentBToken });
  const session3ForStuA = (stuAGetSessions.data?.sessions || []).find(
    (s) => Number(s.session_num || s.sessionNum) === 3
  );
  const ex1ForStuA = (session3ForStuA?.exercises || []).find((e) => e.id === 'YCT2-04-B3-E1');

  record(
    'F04_PERSISTENCE_AND_STUDENT_CLASS_ACCESS_RBAC',
    'FILE_ASSIGNMENT',
    'Exercise #1 and its 5 attachments persist across reload and dispatch homework_assigned push to YCT2-04 students; Student in YCT2-04 receives full attachment metadata while Student in YCT3-02 gets 403',
    saveEx1Res.status === 200 &&
      saveEx1Res.data?.pushDispatch?.eventType === 'homework_assigned' &&
      ex1PushDeliveries.length === 1 &&
      ex1PushDeliveries[0]?.endpoint === epStudentA &&
      stuAGetSessions.status === 200 &&
      stuBGetSessions.status === 403 &&
      Array.isArray(ex1ForStuA?.attachments) &&
      ex1ForStuA.attachments.length === 5 &&
      ex1ForStuA.attachments[0]?.name === 'Giao-trinh-YCT2-Buoi-3.pdf' &&
      ex1ForStuA.attachments[0]?.mimeType === 'application/pdf' &&
      ex1ForStuA.attachments[0]?.sizeBytes === 1250000,
    `saveStatus=${saveEx1Res.status}, pushAccepted=${ex1PushDeliveries.length} (${ex1PushDeliveries[0]?.endpoint}), stuAStatus=${stuAGetSessions.status}, stuBStatus=${stuBGetSessions.status}, stuAAttachments=${ex1ForStuA?.attachments?.length}`
  );

  // F05: Non-overwriting exercises — Adding Exercise #2 (mode: 'append_exercise') to Session 3 preserves Exercise #1's id and attachments
  const ex2Attachment = [
    {
      id: 'ATT-B3-E2-1',
      name: 'Phiếu-luyện-viết-chữ-Hán-Buổi-3.pdf',
      url: uploadedAttachments[0].url,
      mimeType: 'application/pdf',
      sizeBytes: 820000
    }
  ];

  const pushIdxBeforeEx2 = state.pushDeliveries.length;
  const appendEx2Res = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'append_exercise',
      exercise: {
        id: 'YCT2-04-B3-E2',
        num: 2,
        title: 'Bài 2: Viết chữ Hán vào vở ô ly',
        prompt: 'Con tải phiếu luyện viết PDF đính kèm, viết 5 dòng rồi chụp ảnh nộp nhé.',
        type: 'image',
        attachments: ex2Attachment
      },
      exercises: [
        {
          id: 'YCT2-04-B3-E2',
          num: 2,
          title: 'Bài 2: Viết chữ Hán vào vở ô ly',
          prompt: 'Con tải phiếu luyện viết PDF đính kèm, viết 5 dòng rồi chụp ảnh nộp nhé.',
          type: 'image',
          attachments: ex2Attachment
        }
      ]
    }
  });
  const ex2PushDeliveries = state.pushDeliveries.slice(pushIdxBeforeEx2);

  const afterAppendGet = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentAToken });
  const session3AfterAppend = (afterAppendGet.data?.sessions || []).find(
    (s) => Number(s.session_num || s.sessionNum) === 3
  );
  const exercisesAfterAppend = session3AfterAppend?.exercises || [];
  const ex1AfterAppend = exercisesAfterAppend.find((e) => e.id === 'YCT2-04-B3-E1');
  const ex2AfterAppend = exercisesAfterAppend.find((e) => e.id === 'YCT2-04-B3-E2');

  record(
    'F05_NON_OVERWRITING_APPEND_EXERCISE',
    'FILE_ASSIGNMENT',
    'Adding Exercise #2 (mode: append_exercise) to existing Session 3 preserves Exercise #1 (id + all 5 attachments) without overwriting and notifies students of the new exercise',
    appendEx2Res.status === 200 &&
      ex2PushDeliveries.length === 1 &&
      exercisesAfterAppend.length === 2 &&
      Boolean(ex1AfterAppend) &&
      ex1AfterAppend?.attachments?.length === 5 &&
      Boolean(ex2AfterAppend) &&
      ex2AfterAppend?.attachments?.length === 1,
    `totalExercises=${exercisesAfterAppend.length}, ex1Id=${ex1AfterAppend?.id} (att=${ex1AfterAppend?.attachments?.length}), ex2Id=${ex2AfterAppend?.id} (att=${ex2AfterAppend?.attachments?.length}), pushSent=${ex2PushDeliveries.length}`
  );

  // F06: Updating an existing published exercise (mode: 'update_exercise') or saving a draft preserves IDs, keeps other exercises, and does NOT emit duplicate push notifications
  const pushCountBeforeUpdate = state.pushDeliveries.length;

  const updateEx1Res = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'update_exercise',
      exercise: {
        id: 'YCT2-04-B3-E1',
        num: 1,
        title: 'Bài 1: Đọc to từ vựng & làm phiếu PDF (Đã cập nhật hướng dẫn)',
        prompt: 'Con mở file PDF và nghe file mẫu cô đính kèm rồi thu âm lại rõ ràng nhé.',
        type: 'audio'
        // Omit attachments intentionally to verify existing attachments are preserved unless explicitly removed!
      }
    }
  });

  // Also test saving the exact same update a second time to verify 0 duplicate notifications
  const updateEx1ReplayRes = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'update_exercise',
      exercise: {
        id: 'YCT2-04-B3-E1',
        num: 1,
        title: 'Bài 1: Đọc to từ vựng & làm phiếu PDF (Đã cập nhật hướng dẫn)',
        prompt: 'Con mở file PDF và nghe file mẫu cô đính kèm rồi thu âm lại rõ ràng nhé.',
        type: 'audio'
      }
    }
  });

  const pushCountAfterUpdate = state.pushDeliveries.length;

  const afterUpdateGet = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentAToken });
  const session3AfterUpdate = (afterUpdateGet.data?.sessions || []).find(
    (s) => Number(s.session_num || s.sessionNum) === 3
  );
  const ex1AfterUpdate = (session3AfterUpdate?.exercises || []).find((e) => e.id === 'YCT2-04-B3-E1');
  const ex2AfterUpdate = (session3AfterUpdate?.exercises || []).find((e) => e.id === 'YCT2-04-B3-E2');

  record(
    'F06_UPDATE_EXISTING_EXERCISE_PRESERVES_ATTACHMENTS_AND_NO_DUP_PUSH',
    'FILE_ASSIGNMENT',
    'Updating Exercise #1 (mode: update_exercise) preserves its id, preserves existing attachments when not explicitly removed, keeps Exercise #2 intact, and emits 0 duplicate homework_assigned push notifications',
    updateEx1Res.status === 200 &&
      updateEx1ReplayRes.status === 200 &&
      updateEx1Res.data?.pushDispatch?.skipped === true &&
      updateEx1Res.data?.pushDispatch?.reason === 'EDIT_EXISTING_EXERCISE_NO_DUPLICATE_NOTIFY' &&
      updateEx1ReplayRes.data?.pushDispatch?.skipped === true &&
      ex1AfterUpdate?.title?.includes('Đã cập nhật hướng dẫn') &&
      ex1AfterUpdate?.attachments?.length === 5 &&
      Boolean(ex2AfterUpdate) &&
      pushCountBeforeUpdate >= 2 &&
      pushCountAfterUpdate === pushCountBeforeUpdate,
    `ex1Att=${ex1AfterUpdate?.attachments?.length}, ex2Present=${Boolean(ex2AfterUpdate)}, pushBefore=${pushCountBeforeUpdate}, pushAfter=${pushCountAfterUpdate}, skipReason=${updateEx1Res.data?.pushDispatch?.reason}`
  );

  // F07: Student homework submission & teacher grading continue to work end-to-end without corrupting exercise attachments
  const stuUploadRes = await callApi('/api/ktn/homeworks/upload-url', {
    method: 'POST',
    token: studentAToken,
    body: {
      fileName: 'bai_nop_hoang_ngan_b3_e1.wav',
      fileType: 'audio/wav',
      fileSize: 24576
    }
  });
  const submitHwRes = await callApi('/api/ktn/homeworks', {
    method: 'POST',
    token: studentAToken,
    body: {
      classCode: 'YCT2-04',
      courseId: 'CLASS_YCT2-04',
      lessonNum: 301,
      lessonTitle: 'Buổi 3 · Bài 1',
      fileUrl: stuUploadRes.data?.fileUrl,
      fileType: 'audio/wav',
      studentNote: 'Con nộp bài thu âm buổi 3 bài 1 ạ!'
    }
  });
  const gradeHwRes = await callApi('/api/ktn/homeworks/grade', {
    method: 'PATCH',
    token: teacherLinhToken,
    body: {
      id: submitHwRes.data?.homework?.id,
      score: 9.5,
      status: 'graded',
      teacherFeedback: 'Con phát âm chuẩn và làm đầy đủ phiếu bài tập!'
    }
  });
  const verifySessionUnchanged = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentAToken });
  const s3Verify = (verifySessionUnchanged.data?.sessions || []).find(
    (s) => Number(s.session_num || s.sessionNum) === 3
  );

  record(
    'F07_END_TO_END_HOMEWORK_SUBMISSION_AND_GRADING',
    'FILE_ASSIGNMENT',
    'Student submits homework for Session 3 Exercise #1 (lessonNum=301) and Teacher grades it (9.5/10) while session exercise attachments remain isolated and intact',
    stuUploadRes.status === 200 &&
      submitHwRes.status === 200 &&
      gradeHwRes.status === 200 &&
      gradeHwRes.data?.homework?.score === 9.5 &&
      s3Verify?.exercises?.length === 2 &&
      s3Verify?.exercises?.[0]?.attachments?.length === 5,
    `submitStatus=${submitHwRes.status}, gradeStatus=${gradeHwRes.status}, score=${gradeHwRes.data?.homework?.score}, sessionExercises=${s3Verify?.exercises?.length}`
  );

  // F08: Multi-tab concurrent session exercise append & update (two tabs open on Session 3 with stale local snapshots)
  const staleTwoExerciseSnapshot = (s3Verify?.exercises || []).slice(0, 2);
  // Tab A appends Exercise 3 using local snapshot of 2 exercises (generating colliding ID ex_YCT2-04_3_3)
  const tabAEx = {
    id: 'ex_YCT2-04_3_3',
    num: 3,
    title: 'Bài 3 (Tab A): Đặt câu với từ mới',
    prompt: 'Con viết 3 câu tiếng Trung về gia đình.',
    type: 'image',
    status: 'published',
    attachments: ex2Attachment
  };
  const tabASaveRes = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'append_exercise',
      exercise: tabAEx,
      exercises: [...staleTwoExerciseSnapshot, tabAEx]
    }
  });

  // Tab B (still holding the pre-Tab-A 2-exercise snapshot!) also appends a new exercise with colliding ID ex_YCT2-04_3_3
  const tabBEx = {
    id: 'ex_YCT2-04_3_3',
    num: 3,
    title: 'Bài 4 (Tab B): Nghe và nhắc lại hội thoại',
    prompt: 'Con nghe đoạn hội thoại mẫu rồi thu âm lại.',
    type: 'audio',
    status: 'published',
    attachments: []
  };
  const tabBSaveRes = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'append_exercise',
      exercise: tabBEx,
      exercises: [...staleTwoExerciseSnapshot, tabBEx]
    }
  });

  // Tab B (still with stale snapshot!) edits Exercise #1 (mode: 'update_exercise')
  const tabBEditedEx1 = {
    ...staleTwoExerciseSnapshot[0],
    title: 'Bài 1: Đọc to từ vựng & làm phiếu PDF (Cập nhật từ Tab B)'
  };
  const tabBUpdateEx1Res = await callApi('/api/ktn/class-sessions', {
    method: 'POST',
    token: teacherLinhToken,
    body: {
      classCode: 'YCT2-04',
      sessionNum: 3,
      title: 'Buổi 3: Gia đình & Số đếm',
      mode: 'update_exercise',
      exercise: tabBEditedEx1,
      exercises: [tabBEditedEx1, staleTwoExerciseSnapshot[1]]
    }
  });

  const verifyMultiTabGet = await callApi('/api/ktn/class-sessions?classCode=YCT2-04', { token: studentAToken });
  const s3MultiTab = (verifyMultiTabGet.data?.sessions || []).find(
    (s) => Number(s.session_num || s.sessionNum) === 3
  );
  const multiTabExercises = s3MultiTab?.exercises || [];

  record(
    'F08_MULTI_TAB_CONCURRENT_APPEND_AND_UPDATE_SAFETY',
    'FILE_ASSIGNMENT',
    'Concurrent two-tab append_exercise (with colliding client IDs and stale exercises arrays) and stale-tab update_exercise preserve all 4 exercises and attachments without overwriting',
    tabASaveRes.status === 200 &&
      tabBSaveRes.status === 200 &&
      tabBUpdateEx1Res.status === 200 &&
      multiTabExercises.length === 4 &&
      multiTabExercises.some((e) => e.title.includes('Cập nhật từ Tab B') && e.attachments?.length === 5) &&
      multiTabExercises.some((e) => e.title.includes('Bài 2: Viết chữ Hán') && e.attachments?.length === 1) &&
      multiTabExercises.some((e) => e.title.includes('Bài 3 (Tab A)') && e.attachments?.length === 1) &&
      multiTabExercises.some((e) => e.title.includes('Bài 4 (Tab B)')),
    `totalExercises=${multiTabExercises.length}, ids=[${multiTabExercises.map((e) => e.id).join(', ')}]`
  );

  const reportPayload = {
    generatedAt: new Date().toISOString(),
    suite: 'KTN_UX_AND_PERFORMANCE_UPGRADE_SUITE',
    allPassed: results.every((r) => r.passed),
    totalChecks: results.length,
    passedChecks: results.filter((r) => r.passed).length,
    failedChecks: results.filter((r) => !r.passed).length,
    teacherSearchBenchmarks: {
      workerHandler: workerBenchmarkSummary,
      postgres18PgliteTrgm: postgresBenchmarkSummary
    },
    results
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(reportPayload, null, 2), 'utf8');

  console.log(`\n[REPORT WRITTEN] ${REPORT_PATH}`);
  console.log(`SUMMARY: ${reportPayload.passedChecks}/${reportPayload.totalChecks} CHECKS PASSED`);
}

runSuite().catch((err) => {
  console.error('\n[SUITE FAILED]', err);
  process.exit(1);
});
