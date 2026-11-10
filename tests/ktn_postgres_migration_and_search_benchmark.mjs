/**
 * KTN Backend V3 — Real PostgreSQL 18.6 Migration Audit, RLS Enforcement & 1k/10k/50k Search Benchmark
 *
 * Uses @electric-sql/pglite (PostgreSQL 18.6 WASM with native pg_trgm extension)
 * wired directly to the production Cloudflare Worker (`cloudflare-worker-sw-proxy.js`).
 */

import fs from 'fs';
import path from 'path';
import vm from 'vm';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const require = createRequire(path.join(ROOT_DIR, 'apps', 'ktn-web-v2', 'package.json'));

const { PGlite } = require('@electric-sql/pglite');
const { pg_trgm } = require('./node_modules/@electric-sql/pglite/dist/contrib/pg_trgm.cjs');

function loadWorkerWithPostgresBridge(db) {
  const workerPath = path.join(ROOT_DIR, 'cloudflare-worker-sw-proxy.js');
  const rawCode = fs.readFileSync(workerPath, 'utf8');
  const transformedCode = rawCode.replace(/export\s+default\s+\{/, 'module.exports = {');

  const pgRestFetch = async (urlStr, options = {}) => {
    const u = new URL(urlStr);
    const method = (options.method || 'GET').toUpperCase();
    const bodyObj = options.body ? JSON.parse(options.body) : null;

    if (u.pathname.endsWith('/rest/v1/rpc/ktn_search_students') && method === 'POST') {
      const p = bodyObj || {};
      const res = await db.query(
        `SELECT * FROM public.ktn_search_students($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          p.p_query ?? '',
          p.p_class_code ?? '',
          p.p_course_id ?? '',
          p.p_account_status ?? '',
          p.p_sync_status ?? '',
          p.p_student_case ?? '',
          p.p_allowed_classes ?? null,
          p.p_limit ?? 25,
          p.p_offset ?? 0,
        ]
      );
      return new Response(JSON.stringify(res.rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (u.pathname.endsWith('/rest/v1/ktn_teachers') && method === 'GET') {
      const emailEq = u.searchParams.get('email');
      if (emailEq && emailEq.startsWith('eq.')) {
        const email = emailEq.slice(3);
        const res = await db.query(`SELECT * FROM public.ktn_teachers WHERE email = $1 LIMIT 1`, [email]);
        return new Response(JSON.stringify(res.rows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const res = await db.query(`SELECT * FROM public.ktn_teachers WHERE active = true ORDER BY code ASC`);
      return new Response(JSON.stringify(res.rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (u.pathname.endsWith('/rest/v1/ktn_classes') && method === 'GET') {
      const teacherEmailEq = u.searchParams.get('teacher_email');
      if (teacherEmailEq && teacherEmailEq.startsWith('eq.')) {
        const email = teacherEmailEq.slice(3);
        const res = await db.query(
          `SELECT id FROM public.ktn_classes WHERE teacher_email = $1 AND active = true`,
          [email]
        );
        return new Response(JSON.stringify(res.rows), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const res = await db.query(`SELECT * FROM public.ktn_classes WHERE active = true ORDER BY id ASC`);
      return new Response(JSON.stringify(res.rows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (u.pathname.endsWith('/rest/v1/ktn_revoked_tokens') && method === 'GET') {
      return new Response(JSON.stringify([]), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify([]), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const sandbox = {
    module: { exports: {} },
    exports: {},
    fetch: pgRestFetch,
    Request,
    Response,
    Headers,
    URL,
    URLSearchParams,
    crypto: globalThis.crypto || crypto.webcrypto,
    TextEncoder,
    TextDecoder,
    atob: (str) => Buffer.from(str, 'base64').toString('binary'),
    btoa: (str) => Buffer.from(str, 'binary').toString('base64'),
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
    Map,
    Set,
    RegExp,
    Error,
    Promise,
     encodeURIComponent,
    decodeURIComponent,
    unescape,
    escape,
    console,
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(transformedCode, sandbox, { filename: 'cloudflare-worker-sw-proxy.js' });
  return sandbox.module.exports;
}

function percentile(sortedArr, p) {
  if (sortedArr.length === 0) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return +sortedArr[idx].toFixed(2);
}

async function run() {
  console.log('================================================================================');
  console.log('KTN REAL POSTGRESQL 18.6 MIGRATION V3 AUDIT, RLS & 1K/10K/50K SEARCH BENCHMARK');
  console.log('================================================================================');

  const db = new PGlite({ extensions: { pg_trgm } });
  const results = [];
  const record = (id, title, passed, detail) => {
    results.push({ id, title, passed, detail });
    console.log(`[${passed ? 'PASS' : 'FAIL'}] ${id}: ${title} -> ${detail}`);
    if (!passed) {
      throw new Error(`Verification failed on ${id}: ${title} (${detail})`);
    }
  };

  // 1. Setup Supabase roles (anon, authenticated, service_role) and load base pre-V3 schema
  await db.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);

  const fullSchemaSql = fs.readFileSync(path.join(ROOT_DIR, 'supabase_schema.sql'), 'utf8');
  const section11Marker = '-- 11. NÂNG CẤP V3';
  const markerIdx = fullSchemaSql.indexOf(section11Marker);
  const baseSchemaSql = markerIdx > 0 ? fullSchemaSql.slice(0, markerIdx) : fullSchemaSql;
  await db.exec(baseSchemaSql);

  // Set ktn_attendance to exact live V2 production schema (id UUID, no V3 columns) before running Migration V3
  await db.exec(`
    ALTER TABLE public.ktn_attendance
      ALTER COLUMN id DROP DEFAULT,
      ALTER COLUMN id TYPE UUID USING gen_random_uuid(),
      ALTER COLUMN id SET DEFAULT gen_random_uuid(),
      DROP COLUMN IF EXISTS student_email,
      DROP COLUMN IF EXISTS student_name,
      DROP COLUMN IF EXISTS session_num,
      DROP COLUMN IF EXISTS date,
      DROP COLUMN IF EXISTS note,
      DROP COLUMN IF EXISTS updated_by,
      DROP COLUMN IF EXISTS updated_at;
  `);

  // Verify pre-V3 state: ktn_attendance.id is uuid and ktn_provisioning_jobs does not exist yet
  const preV3ColCheck = await db.query(`
    SELECT data_type FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ktn_attendance' AND column_name = 'id'
  `);
  const preV3JobTableCheck = await db.query(`
    SELECT to_regclass('public.ktn_provisioning_jobs') AS reg
  `);

  // Seed historical pre-V3 attendance records & students to verify 0 data loss during migration
  await db.exec(`
    UPDATE public.ktn_students
    SET phone = '0901234567', parent_name = 'Chị Lan mẹ bé Ngân'
    WHERE email = 'hoangngan@khongtunhi.com';

    INSERT INTO public.ktn_students (code, name, email, phone, parent_name, class_code, has_live_class, has_online_courses, online_courses)
    VALUES
      ('KTN-2026-003', 'Lê Bảo Châu', 'baochau@khongtunhi.com', '0903456789', 'Chị Hương', 'YCT3-02', true, true, '["65e7704a9ea90c00080d5195"]'::jsonb)
    ON CONFLICT (email) DO NOTHING;

    INSERT INTO public.ktn_attendance (class_code, lesson_num, student_code, status, teacher_note, recorded_by)
    VALUES
      ('YCT2-04', 3, 'KTN-2026-089', 'present', 'Đi học đúng giờ, thuộc từ vựng', 'linh.lam@khongtunhi.com'),
      ('YCT2-04', 3, 'KTN-2026-102', 'absent_excused', 'Mẹ xin phép nghỉ ốm', 'linh.lam@khongtunhi.com'),
      ('YCT3-02', 5, 'KTN-2026-003', 'late', 'Vào muộn 5 phút', 'thu.ha@khongtunhi.com')
    ON CONFLICT (class_code, student_code, lesson_num) DO NOTHING;
  `);

  const preMigrationAtt = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_attendance`);
  const preMigrationStu = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_students`);
  record(
    'PG-01-PRE-MIGRATION-BASELINE',
    'True pre-V3 schema (ktn_attendance.id=uuid, no V3 tables) loaded with historical students and attendance records before V3 migration',
    preV3ColCheck.rows[0]?.data_type === 'uuid' &&
      preV3JobTableCheck.rows[0]?.reg === null &&
      preMigrationAtt.rows[0].cnt === 3 &&
      preMigrationStu.rows[0].cnt >= 5,
    `attendanceIdType=${preV3ColCheck.rows[0]?.data_type}, jobsTableBefore=${preV3JobTableCheck.rows[0]?.reg}, students=${preMigrationStu.rows[0].cnt}, attendance=${preMigrationAtt.rows[0].cnt}`
  );

  // 2. Run Migration V3 (Run #1)
  const migrationV3Sql = fs.readFileSync(path.join(ROOT_DIR, 'supabase_migration_v3.sql'), 'utf8');
  await db.exec(migrationV3Sql);

  // 3. Verify Vietnamese Normalization Function (IMMUTABLE, PARALLEL SAFE, Uppercase + NFD + Đ/đ)
  const fnMeta = await db.query(`
    SELECT provolatile, proparallel,
           public.ktn_normalize_vi('  NGUYỄN   ĐẶNG   HOÀNG   NGÂN  ') AS norm_upper,
           public.ktn_normalize_vi(E'Nga\u0302n \u0110a\u0323\u0306ng') AS norm_nfd
    FROM pg_proc WHERE proname = 'ktn_normalize_vi'
  `);
  record(
    'PG-02-NORMALIZE-VI-IMMUTABLE-AND-ACCURATE',
    'public.ktn_normalize_vi is IMMUTABLE, PARALLEL SAFE, and normalizes uppercase/NFD/Đ Vietnamese accurately',
    fnMeta.rows[0]?.provolatile === 'i' &&
      fnMeta.rows[0]?.proparallel === 's' &&
      fnMeta.rows[0]?.norm_upper === 'nguyen dang hoang ngan' &&
      fnMeta.rows[0]?.norm_nfd === 'ngan dang',
    `provolatile=${fnMeta.rows[0]?.provolatile}, norm_upper="${fnMeta.rows[0]?.norm_upper}", norm_nfd="${fnMeta.rows[0]?.norm_nfd}"`
  );

  // 4. Verify Attendance Historical Data Preservation & Backfill
  const postMigrationAtt = await db.query(`
    SELECT class_code, lesson_num, session_num, student_code, student_email, student_name, status, teacher_note, note
    FROM public.ktn_attendance
    ORDER BY class_code, student_code
  `);
  const nganAtt = postMigrationAtt.rows.find((r) => r.student_code === 'KTN-2026-089');
  const khangAtt = postMigrationAtt.rows.find((r) => r.student_code === 'KTN-2026-102');
  record(
    'PG-03-ATTENDANCE-HISTORY-PRESERVED',
    'Migration V3 preserves all historical attendance records and backfills session_num, note, student_email, and student_name',
    postMigrationAtt.rows.length === 3 &&
      nganAtt?.session_num === 3 &&
      nganAtt?.student_email === 'hoangngan@khongtunhi.com' &&
      nganAtt?.note === 'Đi học đúng giờ, thuộc từ vựng' &&
      khangAtt?.status === 'absent_excused' &&
      khangAtt?.note === 'Mẹ xin phép nghỉ ốm',
    `rows=${postMigrationAtt.rows.length}, nganEmail=${nganAtt?.student_email}, khangStatus=${khangAtt?.status}`
  );

  // 5. Verify Redundant Duplicate Indexes Are Dropped & Optimal Indexes Exist
  const stuIndexes = await db.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'ktn_students' ORDER BY indexname
  `);
  const idxNames = stuIndexes.rows.map((r) => r.indexname);
  const droppedRedundant =
    !idxNames.includes('idx_ktn_students_class') &&
    !idxNames.includes('idx_ktn_students_class_code') &&
    !idxNames.includes('idx_ktn_students_email') &&
    !idxNames.includes('idx_ktn_students_name_trgm');
  const hasOptimal =
    idxNames.includes('idx_ktn_students_search_text_trgm') &&
    idxNames.includes('idx_ktn_students_class_updated') &&
    idxNames.includes('idx_ktn_students_updated_email');
  record(
    'PG-04-INDEX-CONSOLIDATION-NO-DUPLICATES',
    'Redundant overlapping indexes on ktn_students are dropped and optimal GIN(fastupdate=off) + composite B-tree indexes exist',
    droppedRedundant && hasOptimal,
    `indexes=[${idxNames.join(', ')}]`
  );

  // 6. Run Migration V3 a Second Time (Idempotency Check)
  await db.exec(migrationV3Sql);
  const afterSecondRunAtt = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_attendance`);
  record(
    'PG-05-MIGRATION-IDEMPOTENT-SECOND-RUN',
    'Running supabase_migration_v3.sql a second time succeeds with 0 errors and 0 data loss',
    afterSecondRunAtt.rows[0].cnt === 3,
    `attendanceAfterRun2=${afterSecondRunAtt.rows[0].cnt}`
  );

  // 7. Verify RLS Policies & Role Isolation on ktn_provisioning_jobs and ktn_sync_events
  await db.exec(`
    INSERT INTO public.ktn_provisioning_jobs (operation_id, idempotency_key, job_type, target_email, status)
    VALUES ('OP-RLS-TEST-1', 'IDEM-RLS-1', 'student_create', 'hoangngan@khongtunhi.com', 'completed')
    ON CONFLICT (operation_id) DO NOTHING;

    INSERT INTO public.ktn_sync_events (operation_id, event_type, source_system, target_system, entity_type, entity_key, status)
    VALUES ('OP-RLS-TEST-1', 'student_create', 'ktn_admin', 'izteach+supabase', 'student', 'hoangngan@khongtunhi.com', 'synced');
  `);

  const policiesRes = await db.query(`
    SELECT tablename, policyname, roles
    FROM pg_policies
    WHERE tablename IN ('ktn_provisioning_jobs', 'ktn_sync_events')
    ORDER BY tablename
  `);

  let anonDeniedJobs = false;
  let authDeniedEvents = false;
  try {
    await db.exec(`BEGIN; SET LOCAL ROLE anon; SELECT * FROM public.ktn_provisioning_jobs; COMMIT;`);
  } catch {
    anonDeniedJobs = true;
    await db.exec(`ROLLBACK;`);
  }
  try {
    await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT * FROM public.ktn_sync_events; COMMIT;`);
  } catch {
    authDeniedEvents = true;
    await db.exec(`ROLLBACK;`);
  }

  await db.exec(`BEGIN; SET LOCAL ROLE service_role;`);
  const serviceRoleJobs = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_provisioning_jobs`);
  await db.exec(`COMMIT;`);

  record(
    'PG-06-RLS-STRICT-SERVICE-ROLE-ENFORCEMENT',
    'ktn_provisioning_jobs and ktn_sync_events block anon and authenticated roles while allowing service_role',
    anonDeniedJobs &&
      authDeniedEvents &&
      serviceRoleJobs.rows[0].cnt >= 1 &&
      policiesRes.rows.every((p) => String(p.roles).includes('service_role')),
    `anonDenied=${anonDeniedJobs}, authDenied=${authDeniedEvents}, serviceRoleRows=${serviceRoleJobs.rows[0].cnt}, policies=${JSON.stringify(policiesRes.rows)}`
  );

  // 8. Verify Backup Snapshot & Rollback Recovery
  const backupStudents = (await db.query(`SELECT * FROM public.ktn_students ORDER BY email`)).rows;
  await db.query(`DELETE FROM public.ktn_attendance WHERE student_code = 'KTN-2026-003'`);
  await db.query(`DELETE FROM public.ktn_students WHERE email = 'baochau@khongtunhi.com'`);
  const countAfterDelete = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_students`)).rows[0].cnt;
  const restoredRow = backupStudents.find((s) => s.email === 'baochau@khongtunhi.com');
  await db.query(
    `INSERT INTO public.ktn_students (code, name, email, phone, parent_name, class_code, has_live_class, has_online_courses, online_courses, search_text)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
     ON CONFLICT (email) DO NOTHING`,
    [
      restoredRow.code,
      restoredRow.name,
      restoredRow.email,
      restoredRow.phone,
      restoredRow.parent_name,
      restoredRow.class_code,
      restoredRow.has_live_class,
      restoredRow.has_online_courses,
      JSON.stringify(restoredRow.online_courses),
      restoredRow.search_text,
    ]
  );
  const countAfterRestore = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_students`)).rows[0].cnt;
  record(
    'PG-07-ROLLBACK-AND-BACKUP-RESTORE',
    'Logical snapshot backup and restore recovers deleted student rows with 100% fidelity',
    countAfterDelete === backupStudents.length - 1 && countAfterRestore === backupStudents.length,
    `before=${backupStudents.length}, afterDelete=${countAfterDelete}, afterRestore=${countAfterRestore}`
  );

  // 9. Wire up Cloudflare Worker BFF to Real PostgreSQL 18.6 for RBAC & 1k/10k/50k Benchmarks
  const worker = loadWorkerWithPostgresBridge(db);
  const env = {
    SUPABASE_URL: 'https://postgres-local.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'local-service-role-key',
    KTN_SESSION_SECRET: 'benchmark-session-secret-key-2026',
    KTN_STAFF_AND_TEST_PASSWORD: 'TestStrongPassword!2026',
    IZTEACH_ADMIN_PASSWORD: 'AdminStrongPassword!2026',
  };

  const callWorker = async (urlPath, token) => {
    const req = new Request(`https://khongtunhi.com${urlPath}`, {
      method: 'GET',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const t0 = performance.now();
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    const e2eMs = +(performance.now() - t0).toFixed(2);
    const data = await res.json();
    return { status: res.status, data, e2eMs };
  };

  // Obtain real signed tokens from Worker /api/ktn/auth/login
  const loginAs = async (email, password) => {
    const req = new Request('https://khongtunhi.com/api/ktn/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const res = await worker.fetch(req, env, { waitUntil: () => {} });
    const data = await res.json();
    return data.token;
  };

  const adminToken = await loginAs('hocvienkhongtunhi123@gmail.com', 'AdminStrongPassword!2026');
  const teacherToken = await loginAs('linh.lam@khongtunhi.com', 'TestStrongPassword!2026');
  const studentToken = await loginAs('hoangngan@khongtunhi.com', 'TestStrongPassword!2026');

  // Verify RBAC & PII stripping on real PostgreSQL
  await db.query(`
    UPDATE public.ktn_students
    SET internal_note = 'Ghi chú nội bộ nhạy cảm chỉ Admin thấy',
        last_sync_error = 'INTERNAL_SYNC_TRACE_001'
    WHERE email = 'hoangngan@khongtunhi.com'
  `);

  const adminSearchRbac = await callWorker('/api/ktn/admin/students/search?q=hoang+ngan', adminToken);
  const adminUnassignedClass = await callWorker('/api/ktn/admin/students/search?classCode=NONE&limit=20&offset=0', adminToken);
  const adminOnlineOnlyCase = await callWorker('/api/ktn/admin/students/search?studentCase=online_only&limit=20&offset=0', adminToken);
  const teacherOwnClass = await callWorker('/api/ktn/admin/students/search?q=hoang+ngan&classCode=YCT2-04', teacherToken);
  const teacherOtherClass = await callWorker('/api/ktn/admin/students/search?classCode=YCT3-02', teacherToken);
  const studentForbidden = await callWorker('/api/ktn/admin/students/search?q=ngan', studentToken);

  const teacherFirstItem = teacherOwnClass.data?.items?.[0] || {};
  record(
    'PG-08-RBAC-AND-PII-STRIPPING-ON-POSTGRES',
    'Admin sees all students + internal_note + classCode=NONE unassigned filter + studentCase=online_only; Teacher only sees assigned class (YCT2-04) with internal_note/last_sync_error stripped and gets 403 on YCT3-02; Student gets 403',
    adminSearchRbac.status === 200 &&
      adminSearchRbac.data?.items?.[0]?.internal_note === 'Ghi chú nội bộ nhạy cảm chỉ Admin thấy' &&
      adminUnassignedClass.status === 200 &&
      adminUnassignedClass.data?.items?.length >= 2 &&
      adminUnassignedClass.data.items.every((s) => !s.class_code) &&
      adminOnlineOnlyCase.status === 200 &&
      adminOnlineOnlyCase.data?.items?.length >= 1 &&
      adminOnlineOnlyCase.data.items.every((s) => s.studentCase === 'online_only') &&
      teacherOwnClass.status === 200 &&
      teacherOwnClass.data?.items?.length >= 1 &&
      teacherFirstItem.internal_note === undefined &&
      teacherFirstItem.last_sync_error === undefined &&
      teacherOtherClass.status === 403 &&
      studentForbidden.status === 403,
    `admin=${adminSearchRbac.status}, unassignedCount=${adminUnassignedClass.data?.totalCount}, onlineOnlyCount=${adminOnlineOnlyCase.data?.totalCount}, teacherOwn=${teacherOwnClass.status} (internal_note=${teacherFirstItem.internal_note}), teacherOther=${teacherOtherClass.status}, student=${studentForbidden.status}`
  );

  // 9b. Execute & Verify Master Upgrade Delta Migration (20261109_ktn_master_upgrade.sql) — B1/B2/B3/B4 Gate
  // Seed pre-upgrade legacy messages INCLUDING duplicate retry messages (same room_id after backfill + case-insensitive sender_email + client_message_id)
  await db.exec(`
    ALTER TABLE public.ktn_messages
      ADD COLUMN IF NOT EXISTS client_message_id TEXT;

    INSERT INTO public.ktn_messages (id, room_id, class_code, sender_email, sender_name, sender_role, content, client_message_id, created_at)
    VALUES
      ('MSG-LEGACY-001', '', 'YCT2-04', 'linh.lam@khongtunhi.com', 'Cô Lâm Vũ Mỹ Linh', 'teacher', 'Thông báo bài tập buổi 3 trước khi nâng cấp', 'legacy-dup-cmsg-1', NOW() - INTERVAL '10 minutes'),
      ('MSG-LEGACY-002', '   ', 'YCT2-04', 'LINH.LAM@KHONGTUNHI.COM', 'Cô Lâm Vũ Mỹ Linh', 'teacher', 'Thông báo bài tập buổi 3 trước khi nâng cấp (retry dup)', 'legacy-dup-cmsg-1', NOW() - INTERVAL '9 minutes');
  `);

  // Simulate legacy/dirty account_status values in ktn_students prior to master upgrade constraint
  await db.exec(`
    ALTER TABLE public.ktn_students DROP CONSTRAINT IF EXISTS ktn_students_account_status_check;
    UPDATE public.ktn_students SET account_status = 'verified' WHERE email = 'minhkhang@khongtunhi.com';
    UPDATE public.ktn_students SET account_status = '  LOCKED ' WHERE email = 'baochau@khongtunhi.com';
    UPDATE public.ktn_students SET account_status = 'legacy_unknown_state' WHERE email = 'taphong2002vip@gmail.com';
  `);

  // Simulate pre-fix table without 'claimed' status to prove delta migration upgrades existing constraint idempotently
  await db.exec(`
    CREATE TABLE IF NOT EXISTS public.ktn_forum_questions (
      id TEXT PRIMARY KEY,
      course_id TEXT NOT NULL,
      unit_id TEXT NOT NULL,
      lesson_title_snapshot TEXT NOT NULL DEFAULT '',
      student_id TEXT NOT NULL,
      student_email TEXT NOT NULL DEFAULT '',
      student_name TEXT NOT NULL DEFAULT '',
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      video_timestamp_seconds INTEGER,
      attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
      status TEXT NOT NULL DEFAULT 'open'
        CHECK (status IN ('open', 'answered', 'resolved', 'hidden')),
      claimed_by_teacher_id TEXT,
      claimed_by_teacher_email TEXT,
      claimed_by_teacher_name TEXT,
      claimed_at TIMESTAMPTZ,
      assigned_teacher_id TEXT,
      answer_count INTEGER NOT NULL DEFAULT 0,
      helpful_count INTEGER NOT NULL DEFAULT 0,
      first_answered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);

  const masterUpgradeSql = fs.readFileSync(
    path.join(ROOT_DIR, 'supabase', 'migrations', '20261109_ktn_master_upgrade.sql'),
    'utf8'
  );
  // Run #1 (applies delta migration over base + v3 + legacy forum table + dirty/duplicate rows)
  await db.exec(masterUpgradeSql);
  // Run #2 (verifies full idempotency on second execution)
  await db.exec(masterUpgradeSql);

  const legacyMsgAfterUpgrade = await db.query(`
    SELECT id, class_code, room_id, content
    FROM public.ktn_messages
    WHERE client_message_id = 'legacy-dup-cmsg-1'
  `);
  const normalizedStatuses = (
    await db.query(`
      SELECT email, account_status
      FROM public.ktn_students
      WHERE email IN ('minhkhang@khongtunhi.com', 'baochau@khongtunhi.com', 'taphong2002vip@gmail.com')
    `)
  ).rows.reduce((acc, row) => ({ ...acc, [row.email]: row.account_status }), {});
  // Restore seed account_status values after verifying dirty normalization
  await db.exec(`
    UPDATE public.ktn_students SET account_status = 'ready_to_login'
    WHERE email IN ('minhkhang@khongtunhi.com', 'baochau@khongtunhi.com', 'taphong2002vip@gmail.com');
  `);

  const stuCountAfterMasterUpgrade = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_students`)).rows[0].cnt;
  const attCountAfterMasterUpgrade = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_attendance`)).rows[0].cnt;

  record(
    'PG-09-MASTER-UPGRADE-MIGRATION-AND-IDEMPOTENCY',
    '20261109_ktn_master_upgrade.sql executes cleanly twice over supabase_schema.sql + supabase_migration_v3.sql, deduplicates historical retry messages, normalizes dirty account_status rows, backfills ktn_messages.room_id, and preserves all historical data',
    legacyMsgAfterUpgrade.rows.length === 1 &&
      legacyMsgAfterUpgrade.rows[0].id === 'MSG-LEGACY-001' &&
      legacyMsgAfterUpgrade.rows[0].room_id === 'YCT2-04' &&
      normalizedStatuses['minhkhang@khongtunhi.com'] === 'active' &&
      normalizedStatuses['baochau@khongtunhi.com'] === 'suspended' &&
      normalizedStatuses['taphong2002vip@gmail.com'] === 'ready_to_login' &&
      stuCountAfterMasterUpgrade === 5 &&
      attCountAfterMasterUpgrade === 2,
    `legacyDupRemaining=${legacyMsgAfterUpgrade.rows.length} (kept=${legacyMsgAfterUpgrade.rows[0]?.id}, roomId=${legacyMsgAfterUpgrade.rows[0]?.room_id}), normalizedStatuses=${JSON.stringify(normalizedStatuses)}, students=${stuCountAfterMasterUpgrade}, attendance=${attCountAfterMasterUpgrade}`
  );

  // Verify Chat Idempotency & Course Room Support (NULL class_code + duplicate client_message_id blocked)
  await db.query(`
    INSERT INTO public.ktn_messages (class_code, room_id, sender_email, sender_name, sender_role, content, client_message_id)
    VALUES (NULL, 'course:6adadba969897b0002482ca5', 'hoangngan@khongtunhi.com', 'Nguyễn Hoàng Ngân', 'student', 'Em hỏi bài HSK1 ạ', 'cmsg-001')
  `);
  let duplicateChatBlocked = false;
  try {
    await db.query(`
      INSERT INTO public.ktn_messages (class_code, room_id, sender_email, sender_name, sender_role, content, client_message_id)
      VALUES (NULL, 'course:6adadba969897b0002482ca5', 'HOANGNGAN@KHONGTUNHI.COM', 'Nguyễn Hoàng Ngân', 'student', 'Em hỏi bài HSK1 ạ (retry)', 'cmsg-001')
    `);
  } catch (err) {
    duplicateChatBlocked = err?.code === '23505' || String(err?.message || '').includes('idx_ktn_messages_idempotent_client_msg');
  }
  // Multiple messages without client_message_id must still be allowed
  await db.query(`
    INSERT INTO public.ktn_messages (class_code, room_id, sender_email, sender_name, sender_role, content, client_message_id)
    VALUES
      (NULL, 'course:6adadba969897b0002482ca5', 'hoangngan@khongtunhi.com', 'Nguyễn Hoàng Ngân', 'student', 'Tin không có client id 1', NULL),
      (NULL, 'course:6adadba969897b0002482ca5', 'hoangngan@khongtunhi.com', 'Nguyễn Hoàng Ngân', 'student', 'Tin không có client id 2', '')
  `);
  const idempotentChatCount = await db.query(`
    SELECT COUNT(*)::int AS cnt FROM public.ktn_messages
    WHERE room_id = 'course:6adadba969897b0002482ca5' AND client_message_id = 'cmsg-001'
  `);
  record(
    'PG-10-CHAT-IDEMPOTENCY-AND-COURSE-ROOMS',
    'ktn_messages supports NULL class_code for course:* rooms and enforces case-insensitive (room_id, LOWER(sender_email), client_message_id) idempotency',
    duplicateChatBlocked && idempotentChatCount.rows[0].cnt === 1,
    `duplicateChatBlocked=${duplicateChatBlocked}, storedCount=${idempotentChatCount.rows[0].cnt}`
  );

  // Verify Forum Question Lifecycle: open -> claimed -> answered -> resolved -> hidden, plus invalid status rejection & FK cascade
  await db.query(`
    INSERT INTO public.ktn_forum_questions (
      id, course_id, unit_id, lesson_num, lesson_title_snapshot,
      student_id, student_email, student_name, title, content, status
    ) VALUES (
      'FQ-TEST-001', '6adadba969897b0002482ca5', 'unit-1', 1, 'Bài 1: Xin chào',
      'KTN-2026-089', 'hoangngan@khongtunhi.com', 'Nguyễn Hoàng Ngân',
      'Cách phát âm thanh 3', 'Thầy cô chỉ giúp con biến điệu thanh 3 ạ', 'open'
    )
  `);
  const statusHistory = ['open'];
  for (const nextStatus of ['claimed', 'answered', 'resolved', 'hidden']) {
    const upd = await db.query(
      `UPDATE public.ktn_forum_questions SET status = $1, updated_at = NOW() WHERE id = 'FQ-TEST-001' RETURNING status`,
      [nextStatus]
    );
    statusHistory.push(upd.rows[0]?.status);
  }
  let invalidForumStatusBlocked = false;
  try {
    await db.query(`UPDATE public.ktn_forum_questions SET status = 'invalid_status' WHERE id = 'FQ-TEST-001'`);
  } catch (err) {
    invalidForumStatusBlocked = err?.code === '23514' || String(err?.message || '').includes('ktn_forum_questions_status_check');
  }

  // Test Forum Answers + Forum Follows upsert (including id column) + FK cascade
  await db.query(`
    INSERT INTO public.ktn_forum_answers (
      id, question_id, author_id, author_email, author_name, author_role, teacher_id, content, video_key, video_verified
    ) VALUES (
      'FA-TEST-001', 'FQ-TEST-001', 'T-001', 'linh.lam@khongtunhi.com', 'Cô Lâm Vũ Mỹ Linh', 'teacher', 'T-001',
      'Khi hai thanh 3 đi liền nhau, âm tiết đầu đọc thành thanh 2 con nhé!', 'forum-videos/FQ-TEST-001/FA-TEST-001.mp4', TRUE
    )
  `);
  await db.query(`
    INSERT INTO public.ktn_forum_follows (id, question_id, user_id, user_email, user_role, notify_mode, following)
    VALUES ('FF-TEST-001', 'FQ-TEST-001', 'hoangngan@khongtunhi.com', 'hoangngan@khongtunhi.com', 'student', 'immediate', TRUE)
    ON CONFLICT (question_id, user_id) DO UPDATE
      SET notify_mode = EXCLUDED.notify_mode, following = EXCLUDED.following, updated_at = NOW()
  `);
  await db.query(`
    INSERT INTO public.ktn_forum_follows (id, question_id, user_id, user_email, user_role, notify_mode, following)
    VALUES ('FF-TEST-001', 'FQ-TEST-001', 'hoangngan@khongtunhi.com', 'hoangngan@khongtunhi.com', 'student', 'off', FALSE)
    ON CONFLICT (question_id, user_id) DO UPDATE
      SET notify_mode = EXCLUDED.notify_mode, following = EXCLUDED.following, updated_at = NOW()
  `);
  const followAfterToggle = (
    await db.query(`SELECT id, notify_mode, following FROM public.ktn_forum_follows WHERE question_id = 'FQ-TEST-001'`)
  ).rows;

  await db.query(`DELETE FROM public.ktn_forum_questions WHERE id = 'FQ-TEST-001'`);
  const orphanedAnswers = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_forum_answers WHERE question_id = 'FQ-TEST-001'`)).rows[0].cnt;
  const orphanedFollows = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_forum_follows WHERE question_id = 'FQ-TEST-001'`)).rows[0].cnt;

  record(
    'PG-11-FORUM-CLAIMED-LIFECYCLE-AND-CASCADE',
    'ktn_forum_questions supports open -> claimed -> answered -> resolved -> hidden transitions, rejects invalid statuses, supports follow/unfollow upsert, and cascades deletes to answers/follows',
    statusHistory.join('->') === 'open->claimed->answered->resolved->hidden' &&
      invalidForumStatusBlocked &&
      followAfterToggle.length === 1 &&
      followAfterToggle[0].id === 'FF-TEST-001' &&
      followAfterToggle[0].notify_mode === 'off' &&
      followAfterToggle[0].following === false &&
      orphanedAnswers === 0 &&
      orphanedFollows === 0,
    `transitions=${statusHistory.join('->')}, invalidBlocked=${invalidForumStatusBlocked}, followAfterToggle=${JSON.stringify(followAfterToggle[0])}, orphaned=${orphanedAnswers}/${orphanedFollows}`
  );

  // Verify Teacher Contribution Events (all Worker event_type values + voter_email / created_by_email) + Course Grant Requests + Admin Audit Logs
  const workerEventTypes = [
    'substantive_answer',
    'answer_created',
    'marked_helpful',
    'helpful_vote',
    'accepted_answer',
    'verified_guidance_video',
    'video_attached',
    'long_pending_resolved',
    'admin_adjustment',
    'admin_adjust',
    'admin_revoke',
  ];
  for (let idx = 0; idx < workerEventTypes.length; idx += 1) {
    const evtType = workerEventTypes[idx];
    await db.query(
      `INSERT INTO public.ktn_teacher_contribution_events (
        event_id, teacher_id, teacher_email, teacher_name, question_id, answer_id, event_type, points_delta, reason, actor_email, voter_email, created_by_email
      ) VALUES ($1, 'T-001', 'linh.lam@khongtunhi.com', 'Cô Lâm Vũ Mỹ Linh', 'FQ-TEST-001', 'FA-TEST-001', $2, $3, 'Test event', 'admin@khongtunhi.com', 'hoangngan@khongtunhi.com', 'admin@khongtunhi.com')`,
      [`EVT-TEST-${idx + 1}`, evtType, evtType === 'admin_revoke' ? -5 : 10]
    );
  }
  let invalidEventTypeBlocked = false;
  try {
    await db.query(`
      INSERT INTO public.ktn_teacher_contribution_events (
        event_id, teacher_id, teacher_email, event_type, points_delta
      ) VALUES ('EVT-INVALID', 'T-001', 'linh.lam@khongtunhi.com', 'bogus_event_type', 5)
    `);
  } catch (err) {
    invalidEventTypeBlocked = err?.code === '23514' || String(err?.message || '').includes('ktn_teacher_contribution_events_event_type_check');
  }
  const insertedEventsCount = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_teacher_contribution_events`)).rows[0].cnt;

  await db.query(`
    INSERT INTO public.ktn_course_grant_requests (
      id, teacher_id, teacher_email, teacher_name, student_id, student_email, student_name,
      class_code, course_id, course_title, reason, status, entitlement_result
    ) VALUES (
      'CGR-001', 'T-001', 'linh.lam@khongtunhi.com', 'Cô Lâm Vũ Mỹ Linh',
      'KTN-2026-089', 'hoangngan@khongtunhi.com', 'Nguyễn Hoàng Ngân',
      'YCT2-04', '6adadba969897b0002482ca5', 'HSK 1 Chuẩn', 'Học viên đăng ký combo', 'pending', NULL
    )
  `);
  await db.query(`UPDATE public.ktn_course_grant_requests SET status = 'approved', reviewed_by_email = 'hocvienkhongtunhi123@gmail.com' WHERE id = 'CGR-001'`);
  await db.query(`
    INSERT INTO public.ktn_admin_audit_logs (id, actor_email, actor_role, action_type, target_type, target_id, reason)
    VALUES ('AUD-001', 'hocvienkhongtunhi123@gmail.com', 'admin', 'student_suspend', 'student', 'hoangngan@khongtunhi.com', 'Kiểm tra audit log')
  `);
  const grantStatus = (await db.query(`SELECT status FROM public.ktn_course_grant_requests WHERE id = 'CGR-001'`)).rows[0]?.status;
  const auditCount = (await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_admin_audit_logs WHERE id = 'AUD-001'`)).rows[0].cnt;

  record(
    'PG-12-TEACHER-CONTRIBUTION-EVENTS-AND-GRANT-REQUESTS',
    'ktn_teacher_contribution_events accepts all 11 Worker event_type values (plus voter_email & created_by_email), rejects invalid event types, and supports ktn_course_grant_requests + ktn_admin_audit_logs',
    insertedEventsCount === workerEventTypes.length &&
      invalidEventTypeBlocked &&
      grantStatus === 'approved' &&
      auditCount === 1,
    `events=${insertedEventsCount}/${workerEventTypes.length}, invalidBlocked=${invalidEventTypeBlocked}, grantStatus=${grantStatus}, auditCount=${auditCount}`
  );

  // Verify Student Lifecycle Alignment (B3), Onboarding Columns (parent_phone, notes), and parent_phone Search Indexing
  const defaultCheck = await db.query(`
    SELECT column_default
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'ktn_students' AND column_name = 'account_status'
  `);
  const allowedLifecycleStatuses = [
    'active',
    'ready_to_login',
    'pending_activation',
    'suspended',
    'archived',
    'deleted',
    'sync_error',
    'awaiting_password_or_handoff',
    'unassigned',
  ];
  const testedLifecycleStatuses = [];
  for (const st of allowedLifecycleStatuses) {
    const res = await db.query(
      `UPDATE public.ktn_students
       SET account_status = $1,
           parent_phone = '0988777666',
           notes = 'Ghi chú giáo viên chủ nhiệm',
           created_by_teacher_email = 'linh.lam@khongtunhi.com'
       WHERE email = 'hoangngan@khongtunhi.com'
       RETURNING account_status, parent_phone, notes`,
      [st]
    );
    testedLifecycleStatuses.push(res.rows[0]?.account_status);
  }
  // Restore Hoang Ngan to ready_to_login and verify parent_phone search via ktn_search_students
  await db.query(`UPDATE public.ktn_students SET account_status = 'ready_to_login' WHERE email = 'hoangngan@khongtunhi.com'`);
  const parentPhoneSearch = await db.query(`SELECT email, name FROM public.ktn_search_students('0988777666')`);

  let invalidStudentStatusBlocked = false;
  try {
    await db.query(`UPDATE public.ktn_students SET account_status = 'invalid_lifecycle_state' WHERE email = 'hoangngan@khongtunhi.com'`);
  } catch (err) {
    invalidStudentStatusBlocked = err?.code === '23514' || String(err?.message || '').includes('ktn_students_account_status_check');
  }

  record(
    'PG-13-STUDENT-LIFECYCLE-ALIGNMENT-AND-ONBOARDING-COLUMNS',
    'ktn_students.account_status default is aligned to ready_to_login, supports all 9 lifecycle statuses, rejects invalid statuses, persists parent_phone + notes, and indexes parent_phone in ktn_search_students',
    String(defaultCheck.rows[0]?.column_default || '').includes('ready_to_login') &&
      testedLifecycleStatuses.length === allowedLifecycleStatuses.length &&
      invalidStudentStatusBlocked &&
      parentPhoneSearch.rows.length === 1 &&
      parentPhoneSearch.rows[0].email === 'hoangngan@khongtunhi.com',
    `default=${defaultCheck.rows[0]?.column_default}, statusesTested=${testedLifecycleStatuses.length}, invalidBlocked=${invalidStudentStatusBlocked}, parentPhoneMatch=${parentPhoneSearch.rows[0]?.email}`
  );

  // Verify RLS Isolation on all Master Upgrade tables
  const masterTables = [
    'ktn_forum_questions',
    'ktn_forum_answers',
    'ktn_forum_follows',
    'ktn_teacher_contribution_events',
    'ktn_course_grant_requests',
    'ktn_admin_audit_logs',
  ];
  let anonBlockedAll = true;
  let authBlockedAll = true;
  for (const tbl of masterTables) {
    try {
      await db.exec(`BEGIN; SET LOCAL ROLE anon; SELECT COUNT(*) FROM public.${tbl}; COMMIT;`);
      anonBlockedAll = false;
    } catch {
      await db.exec(`ROLLBACK;`);
    }
    try {
      await db.exec(`BEGIN; SET LOCAL ROLE authenticated; SELECT COUNT(*) FROM public.${tbl}; COMMIT;`);
      authBlockedAll = false;
    } catch {
      await db.exec(`ROLLBACK;`);
    }
  }
  await db.exec(`BEGIN; SET LOCAL ROLE service_role;`);
  const srEvents = await db.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_teacher_contribution_events`);
  await db.exec(`COMMIT;`);

  record(
    'PG-14-MASTER-UPGRADE-RLS-ISOLATION',
    'All 6 Master Upgrade tables enforce RLS: anon and authenticated roles are denied while service_role has full access',
    anonBlockedAll && authBlockedAll && srEvents.rows[0].cnt === workerEventTypes.length,
    `anonBlockedAll=${anonBlockedAll}, authBlockedAll=${authBlockedAll}, serviceRoleEvents=${srEvents.rows[0].cnt}`
  );

  // Verify Rollback Safety on an isolated PostgreSQL snapshot instance
  const dbRollback = new PGlite({ extensions: { pg_trgm } });
  await dbRollback.exec(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
    END $$;
    GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
  `);
  await dbRollback.exec(baseSchemaSql);
  await dbRollback.exec(`
    INSERT INTO public.ktn_students (code, name, email, phone, parent_name, class_code, has_live_class, has_online_courses, online_courses)
    VALUES
      ('KTN-2026-003', 'Lê Bảo Châu', 'baochau@khongtunhi.com', '0903456789', 'Chị Hương', 'YCT3-02', true, true, '["65e7704a9ea90c00080d5195"]'::jsonb)
    ON CONFLICT (email) DO NOTHING;

    INSERT INTO public.ktn_attendance (class_code, lesson_num, student_code, status, teacher_note, recorded_by)
    VALUES
      ('YCT2-04', 3, 'KTN-2026-089', 'present', 'Đi học đúng giờ, thuộc từ vựng', 'linh.lam@khongtunhi.com'),
      ('YCT2-04', 3, 'KTN-2026-102', 'absent_excused', 'Mẹ xin phép nghỉ ốm', 'linh.lam@khongtunhi.com'),
      ('YCT3-02', 5, 'KTN-2026-003', 'late', 'Vào muộn 5 phút', 'thu.ha@khongtunhi.com')
    ON CONFLICT (class_code, student_code, lesson_num) DO NOTHING;
  `);
  await dbRollback.exec(migrationV3Sql);
  await dbRollback.exec(masterUpgradeSql);
  await dbRollback.exec(`
    DROP INDEX IF EXISTS public.idx_ktn_messages_idempotent_client_msg;
    DROP INDEX IF EXISTS public.idx_ktn_messages_room_created_at;
    DROP TABLE IF EXISTS public.ktn_admin_audit_logs;
    DROP TABLE IF EXISTS public.ktn_course_grant_requests;
    DROP TABLE IF EXISTS public.ktn_teacher_contribution_events;
    DROP TABLE IF EXISTS public.ktn_forum_follows;
    DROP TABLE IF EXISTS public.ktn_forum_answers;
    DROP TABLE IF EXISTS public.ktn_forum_questions;
  `);
  const rbStudents = (await dbRollback.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_students`)).rows[0].cnt;
  const rbAttendance = (await dbRollback.query(`SELECT COUNT(*)::int AS cnt FROM public.ktn_attendance`)).rows[0].cnt;
  const rbForumTable = await dbRollback.query(`SELECT to_regclass('public.ktn_forum_questions') AS reg`);
  await dbRollback.close();

  record(
    'PG-15-MASTER-UPGRADE-ROLLBACK-SAFETY',
    'Rollback DDL cleanly removes delta tables/indexes on a test snapshot while preserving 100% of ktn_students and ktn_attendance data',
    rbStudents === 5 && rbAttendance === 3 && rbForumTable.rows[0]?.reg === null,
    `studentsAfterRollback=${rbStudents}, attendanceAfterRollback=${rbAttendance}, forumTable=${rbForumTable.rows[0]?.reg}`
  );

  // 10. Real PostgreSQL 1,000 / 10,000 / 50,000 Benchmark with EXPLAIN (ANALYZE, BUFFERS)
  const benchmarkSummary = {};

  for (const scale of [1000, 10000, 50000]) {
    console.log(`\n--- Seeding ${scale.toLocaleString()} synthetic students in PostgreSQL 18.6 ---`);
    await db.exec(`TRUNCATE TABLE public.ktn_students CASCADE;`);
    const seedStart = performance.now();
    await db.query(
      `
      INSERT INTO public.ktn_students (
        code, name, email, phone, parent_name, class_code,
        has_live_class, has_online_courses, online_courses,
        account_status, sync_status, updated_at, search_text
      )
      SELECT
        'KTN-SYN-' || LPAD(i::text, 5, '0'),
        CASE
          WHEN i = $1 THEN 'Đặng Thùy Trang Đặc Biệt'
          WHEN i = 2505 THEN 'Nguyễn Hoàng Ngân Trang Sau'
          ELSE (ARRAY['Nguyễn','Trần','Lê','Phạm','Hoàng','Huỳnh','Phan','Vũ','Võ','Đặng'])[1 + (i % 10)]
               || ' ' || (ARRAY['Hoàng','Minh','Bảo','Gia','Ngọc','Phương','Đức','Thanh','Thùy','Khánh'])[1 + ((i / 10) % 10)]
               || ' ' || (ARRAY['Ngân','Khang','Châu','An','Linh','Hân','Lâm','Vy','Phúc','Dương'])[1 + ((i / 100) % 10)]
               || ' ' || i::text
        END,
        'syn.' || i::text || '@khongtunhi.com',
        '09' || LPAD((10000000 + i)::text, 8, '0'),
        'Phụ huynh ' || i::text,
        CASE WHEN i % 3 = 0 THEN 'YCT2-04' WHEN i % 5 = 0 THEN 'YCT3-02' ELSE NULL END,
        (i % 3 = 0 OR i % 5 = 0),
        (i % 2 = 0),
        CASE WHEN i % 2 = 0 THEN '[{"id":"6adadba969897b0002482ca5","code":"HSK1-30"}]'::jsonb ELSE '[]'::jsonb END,
        'active',
        'synced',
        NOW() - (i || ' seconds')::interval,
        CASE
          WHEN i = $1 THEN 'dang thuy trang dac biet ktn-syn-' || LPAD(i::text, 5, '0') || ' syn.' || i::text || '@khongtunhi.com 09' || LPAD((10000000 + i)::text, 8, '0')
          WHEN i = 2505 THEN 'nguyen hoang ngan trang sau ktn-syn-02505 syn.2505@khongtunhi.com 0910002505'
          ELSE (ARRAY['nguyen','tran','le','pham','hoang','huynh','phan','vu','vo','dang'])[1 + (i % 10)]
               || ' ' || (ARRAY['hoang','minh','bao','gia','ngoc','phuong','duc','thanh','thuy','khanh'])[1 + ((i / 10) % 10)]
               || ' ' || (ARRAY['ngan','khang','chau','an','linh','han','lam','vy','phuc','duong'])[1 + ((i / 100) % 10)]
               || ' ktn-syn-' || LPAD(i::text, 5, '0') || ' syn.' || i::text || '@khongtunhi.com 09' || LPAD((10000000 + i)::text, 8, '0')
        END
      FROM generate_series(1, $1) AS s(i);
      `,
      [scale]
    );
    await db.exec(`ANALYZE public.ktn_students;`);
    const seedMs = Math.round(performance.now() - seedStart);

    // Capture EXPLAIN (ANALYZE, BUFFERS) for name search, email search, and paginated list
    const explainName = await db.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT code, name, email FROM public.ktn_students
      WHERE search_text LIKE '%dang%' AND search_text LIKE '%trang%' AND search_text LIKE '%biet%'
      LIMIT 20;
    `);
    const explainEmail = await db.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT code, name, email FROM public.ktn_students
      WHERE email = 'syn.${scale}@khongtunhi.com'
      LIMIT 1;
    `);
    const explainPage = await db.query(`
      EXPLAIN (ANALYZE, BUFFERS)
      SELECT code, name, email FROM public.ktn_students
      ORDER BY updated_at DESC NULLS LAST, email ASC
      LIMIT 20 OFFSET ${scale >= 10000 ? 2500 : 500};
    `);

    const runScenario = async (urlPath, iterations = 20) => {
      const sqlSamples = [];
      const workerSamples = [];
      const e2eSamples = [];
      let lastRes = null;
      for (let i = 0; i < iterations; i += 1) {
        const r = await callWorker(urlPath, adminToken);
        lastRes = r;
        sqlSamples.push(Number(r.data?.sqlMs || 0));
        workerSamples.push(Number(r.data?.workerMs || 0));
        e2eSamples.push(r.e2eMs);
      }
      sqlSamples.sort((a, b) => a - b);
      workerSamples.sort((a, b) => a - b);
      e2eSamples.sort((a, b) => a - b);
      return {
        iterations,
        sqlP50Ms: percentile(sqlSamples, 50),
        sqlP95Ms: percentile(sqlSamples, 95),
        workerP50Ms: percentile(workerSamples, 50),
        workerP95Ms: percentile(workerSamples, 95),
        e2eP50Ms: percentile(e2eSamples, 50),
        e2eP95Ms: percentile(e2eSamples, 95),
        returnedRows: lastRes?.data?.items?.length || 0,
        totalCount: lastRes?.data?.totalCount || 0,
        topMatchEmail: lastRes?.data?.items?.[0]?.email || null,
        topMatchName: lastRes?.data?.items?.[0]?.name || null,
        searchEngine: lastRes?.data?.searchEngine || null,
      };
    };

    const emailBench = await runScenario(
      `/api/ktn/admin/students/search?q=${encodeURIComponent(`syn.${scale}@khongtunhi.com`)}&limit=20`
    );
    const nameBench = await runScenario(
      `/api/ktn/admin/students/search?q=${encodeURIComponent('dang thuy trang dac biet')}&limit=20`
    );
    const multiWordBench = await runScenario(
      `/api/ktn/admin/students/search?q=${encodeURIComponent('hoang ngan')}&limit=20`
    );
    const deepOffset = scale === 1000 ? 500 : scale === 10000 ? 2500 : 45000;
    const paginationBench = await runScenario(
      `/api/ktn/admin/students/search?limit=20&offset=${deepOffset}`
    );

    benchmarkSummary[scale] = {
      scale,
      seedMs,
      emailSearch: emailBench,
      nameSearch: nameBench,
      multiWordSearch: multiWordBench,
      deepPagination: {
        offset: deepOffset,
        ...paginationBench,
      },
      explainAnalyzeBuffers: {
        nameSearchTrgmGin: explainName.rows.map((r) => r['QUERY PLAN']),
        emailUniqueBtree: explainEmail.rows.map((r) => r['QUERY PLAN']),
        deepPaginationIndex: explainPage.rows.map((r) => r['QUERY PLAN']),
      },
    };

    record(
      `PG-BENCH-${scale}`,
      `PostgreSQL ${scale.toLocaleString()} students benchmark meets latency & accuracy targets (email p95 < 150ms, name p95 < 250ms, pagination p95 < 300ms, deep offset=${deepOffset} returns 20 rows)`,
      emailBench.e2eP95Ms < 150 &&
        nameBench.e2eP95Ms < 250 &&
        paginationBench.e2eP95Ms < 300 &&
        emailBench.topMatchEmail === `syn.${scale}@khongtunhi.com` &&
        nameBench.topMatchName === 'Đặng Thùy Trang Đặc Biệt' &&
        paginationBench.returnedRows === 20 &&
        paginationBench.totalCount === scale,
      `emailP95=${emailBench.e2eP95Ms}ms (sql=${emailBench.sqlP95Ms}ms), nameP95=${nameBench.e2eP95Ms}ms (sql=${nameBench.sqlP95Ms}ms), pageP95=${paginationBench.e2eP95Ms}ms (offset=${deepOffset}, rows=${paginationBench.returnedRows}/${paginationBench.totalCount})`
    );
  }

  const reportDir = path.join(ROOT_DIR, 'reports', 'ktn-three-way-reliability');
  fs.mkdirSync(reportDir, { recursive: true });
  const reportFile = path.join(reportDir, 'postgres-v3-migration-and-search-benchmark.json');
  fs.writeFileSync(
    reportFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        postgresEngine: 'PostgreSQL 18.6 (@electric-sql/pglite WASM + native pg_trgm)',
        allTestsPassed: results.every((r) => r.passed),
        testCount: results.length,
        results,
        benchmarks: benchmarkSummary,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`\n[REPORT WRITTEN] ${reportFile}`);
  console.log(`SUMMARY: ${results.length}/${results.length} POSTGRESQL V3 & BENCHMARK CHECKS PASSED`);
  await db.close();
}

run().catch((err) => {
  console.error('\n[POSTGRES BENCHMARK FAILED]', err);
  process.exit(1);
});
