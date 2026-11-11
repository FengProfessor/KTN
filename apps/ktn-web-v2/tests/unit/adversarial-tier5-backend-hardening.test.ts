// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
// @ts-ignore
import { signTestSessionToken } from '../e2e/teacher-tiers/test-harness-utils.mjs';
import {
  ktnApi,
  KtnApiClient,
  KtnApiError,
  filterAndPaginateTeachersClientSide,
  normalizeViSearchText,
} from '../../src/services/api/ktnApiClient';
import { normalizeVietnameseText } from '../../src/lib/utils';
import type { KtnTeacherRecord } from '../../src/types/ktn.types';

describe('Tier 5 Adversarial Coverage Hardening: Backend & API Resilience', () => {
  let harness: any;
  let adminToken: string;
  let teacherToken: string;
  let studentToken: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
    harness = createLocalWorkerHarness();

    adminToken = await signTestSessionToken({
      id: 'ADMIN-HARDENING-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    teacherToken = await signTestSessionToken({
      id: 'TEACHER-HARDENING-01',
      email: 'linh.lam@khongtunhi.com',
      role: 'teacher',
      roles: ['teacher'],
    });

    studentToken = await signTestSessionToken({
      id: 'STUDENT-HARDENING-01',
      email: 'hoangngan@khongtunhi.com',
      role: 'student',
      roles: ['student'],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  // =========================================================================
  // SUITE 1: DELETE ROUTE — AUTH & ROLE SPOOFING ADVERSARIAL BOUNDARIES
  // =========================================================================
  describe('Suite 1: DELETE Route — Authentication & Role Boundaries', () => {
    it('TC-T5-DEL-AUTH-01: Rejects deletion request with completely missing Authorization and Cookie (401 ADMIN_ONLY)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-02: Rejects deletion request with malformed or empty Bearer token (401 ADMIN_ONLY)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer   ' },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-03: Rejects expired session token (exp timestamp in the past) (401 ADMIN_ONLY)', async () => {
      // Create manually expired token
      const expiredPayload = {
        id: 'EXPIRED-ADMIN',
        email: 'quanly@khongtunhi.com',
        role: 'admin',
        iat: Date.now() - 100000,
        exp: Date.now() - 1000, // Expired 1 second ago
      };
      const bodyB64 = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
      const cryptoKey = await crypto.subtle.importKey(
        'raw',
        new TextEncoder().encode(harness.env.KTN_SESSION_SECRET),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign']
      );
      const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, new TextEncoder().encode(bodyB64));
      const expiredToken = `${bodyB64}.${Buffer.from(sigBuf).toString('base64url')}`;

      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${expiredToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-04: Rejects session token with tampered HMAC signature (401 ADMIN_ONLY)', async () => {
      const parts = adminToken.split('.');
      const tamperedToken = `${parts[0]}.TAMPERED_INVALID_SIGNATURE_HASH_00000`;

      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${tamperedToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(401);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-05: Rejects role spoofing: Student role cannot call DELETE (403 ADMIN_ONLY)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-06: Rejects role spoofing: Teacher role cannot call DELETE (403 ADMIN_ONLY)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(403);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('ADMIN_ONLY');
    });

    it('TC-T5-DEL-AUTH-07: Rejects role spoofing: Arbitrary/custom role strings cannot call DELETE (403 ADMIN_ONLY)', async () => {
      for (const arbitraryRole of ['superuser', 'root', 'manager', 'guest', 'auditor']) {
        const token = await signTestSessionToken({
          id: `FORGED-${arbitraryRole}`,
          email: 'attacker@khongtunhi.com',
          role: arbitraryRole,
        });
        const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
        const res = await harness.workerModule.fetch(req, harness.env);
        const data = await res.json();

        expect(res.status).toBe(403);
        expect(data.error).toBe('ADMIN_ONLY');
      }
    });

    it('TC-T5-DEL-AUTH-08: Prevents self-deletion: Admin cannot delete their own account (400 CANNOT_DELETE_SELF)', async () => {
      const adminSelfToken = await signTestSessionToken({
        id: 'ADMIN-LINH',
        email: 'linh.lam@khongtunhi.com',
        role: 'admin',
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminSelfToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('CANNOT_DELETE_SELF');
    });

    it('TC-T5-DEL-AUTH-09: Authenticates via ktn_webapp_token cookie when Authorization header is absent', async () => {
      // Target a dedicated teacher
      harness.state.tables.ktn_teachers.push({
        code: 'GV-COOKIE-01',
        email: 'cookie.target@khongtunhi.com',
        name: 'Giáo Viên Cookie Target',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=cookie.target@khongtunhi.com', {
        method: 'DELETE',
        headers: {
          Cookie: `ktn_webapp_token=${encodeURIComponent(adminToken)}; other_cookie=123`,
        },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.deleted).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 2: DELETE ROUTE — PARAMETER PERMUTATIONS & PRECEDENCE
  // =========================================================================
  describe('Suite 2: DELETE Route — Parameter Permutations & Identifier Resolution', () => {
    it('TC-T5-DEL-PARAM-01: Rejects deletion when identifier is completely missing in query and body (400 MISSING_TEACHER_IDENTIFIER)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('MISSING_TEACHER_IDENTIFIER');
    });

    it('TC-T5-DEL-PARAM-02: Rejects whitespace-only identifier (400 MISSING_TEACHER_IDENTIFIER)', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=%20%20%20', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ code: '   ' }),
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(400);
      expect(data.error).toBe('MISSING_TEACHER_IDENTIFIER');
    });

    it('TC-T5-DEL-PARAM-03: Successfully deletes teacher via query param email', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-Q-EMAIL',
        email: 'qemail@khongtunhi.com',
        name: 'Giáo Viên Q Email',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=qemail@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherEmail).toBe('qemail@khongtunhi.com');
    });

    it('TC-T5-DEL-PARAM-04: Successfully deletes teacher via query param code', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-Q-CODE',
        email: 'qcode@khongtunhi.com',
        name: 'Giáo Viên Q Code',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?code=GV-Q-CODE', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherId).toBe('GV-Q-CODE');
    });

    it('TC-T5-DEL-PARAM-05: Successfully deletes teacher via query param teacherId', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-Q-TEACHERID',
        email: 'qteacherid@khongtunhi.com',
        name: 'Giáo Viên TeacherId',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?teacherId=GV-Q-TEACHERID', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
    });

    it('TC-T5-DEL-PARAM-06: Successfully deletes teacher via JSON body', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-BODY-01',
        email: 'bodytarget@khongtunhi.com',
        name: 'Giáo Viên Body Target',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'bodytarget@khongtunhi.com' }),
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherEmail).toBe('bodytarget@khongtunhi.com');
    });

    it('TC-T5-DEL-PARAM-07: Query param takes precedence over conflicting JSON body', async () => {
      harness.state.tables.ktn_teachers.push(
        {
          code: 'GV-PREC-01',
          email: 'query.priority@khongtunhi.com',
          name: 'Giáo Viên Query Priority',
          active: true,
        },
        {
          code: 'GV-PREC-02',
          email: 'body.secondary@khongtunhi.com',
          name: 'Giáo Viên Body Secondary',
          active: true,
        }
      );

      const req = new Request('http://localhost/api/ktn/teachers?email=query.priority@khongtunhi.com', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: 'body.secondary@khongtunhi.com' }),
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherEmail).toBe('query.priority@khongtunhi.com');

      // Verify secondary body target is untouched
      const secondary = harness.state.tables.ktn_teachers.find(
        (t: any) => t.email === 'body.secondary@khongtunhi.com'
      );
      expect(secondary.active).toBe(true);
    });

    it('TC-T5-DEL-PARAM-08: Gracefully handles malformed JSON body when query param is present', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-MALFORM-01',
        email: 'malformed.body@khongtunhi.com',
        name: 'Giáo Viên Malformed Body',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=malformed.body@khongtunhi.com', {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${adminToken}`,
          'Content-Type': 'application/json',
        },
        body: '{ malformed json unclosed string ...',
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherEmail).toBe('malformed.body@khongtunhi.com');
    });

    it('TC-T5-DEL-PARAM-09: Returns 404 TEACHER_NOT_FOUND when teacher does not exist', async () => {
      const req = new Request('http://localhost/api/ktn/teachers?email=nonexistent.random.999@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(404);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('TEACHER_NOT_FOUND');
    });
  });

  // =========================================================================
  // SUITE 3: DELETE ROUTE — SOFT-DELETE INTEGRITY & RECORD CORRUPTION
  // =========================================================================
  describe('Suite 3: DELETE Route — Soft-Delete State Transitions & Class Unassignment', () => {
    it('TC-T5-DEL-STATE-01: Correctly performs soft-delete: active=false, empty assignments, and aliases audit flags', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-STATE-01',
        email: 'state.audit@khongtunhi.com',
        name: 'Giáo Viên State Audit',
        active: true,
        aliases: ['alias_1'],
        assigned_classes: ['YCT1-01'],
        assigned_courses: ['crs-01'],
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=state.audit@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);

      const updated = harness.state.tables.ktn_teachers.find(
        (t: any) => t.email === 'state.audit@khongtunhi.com'
      );
      expect(updated.active).toBe(false);
      expect(updated.assigned_classes).toEqual([]);
      expect(updated.assigned_courses).toEqual([]);
      expect(updated.aliases).toContain('__status:deleted');
      expect(updated.aliases.some((a: string) => a.startsWith('__deleted_at:'))).toBe(true);
      expect(updated.aliases).toContain('__deleted_by:quanly@khongtunhi.com');
    });

    it('TC-T5-DEL-STATE-02: Multi-class unassignment: Clears teacher_code and teacher_email across all classes', async () => {
      const multiEmail = 'multiclass.target@khongtunhi.com';
      const multiCode = 'GV-MULTI-CLS';

      harness.state.tables.ktn_teachers.push({
        code: multiCode,
        email: multiEmail,
        name: 'Giáo Viên Multi Class',
        active: true,
        assigned_classes: ['CLS-01', 'CLS-02', 'CLS-03'],
      });

      harness.state.tables.ktn_classes.push(
        { id: 'CLS-01', name: 'Lớp 1', teacher_email: multiEmail, teacher_code: multiCode, active: true },
        { id: 'CLS-02', name: 'Lớp 2', teacher_email: multiEmail, teacher_code: null, active: true },
        { id: 'CLS-03', name: 'Lớp 3', teacher_email: null, teacher_code: multiCode, active: true }
      );

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(multiEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.unassignedClassesCount).toBe(3);
      expect(data.unassignedClasses).toContain('CLS-01');
      expect(data.unassignedClasses).toContain('CLS-02');
      expect(data.unassignedClasses).toContain('CLS-03');

      // Verify database state: all classes reset to null teacher
      for (const cid of ['CLS-01', 'CLS-02', 'CLS-03']) {
        const cls = harness.state.tables.ktn_classes.find((c: any) => c.id === cid);
        expect(cls.teacher_email).toBeNull();
        expect(cls.teacher_code).toBeNull();
      }
    });

    it('TC-T5-DEL-STATE-03: Multi-course unassignment: Clears teacher_email in ktn_courses', async () => {
      const courseEmail = 'course.target@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-CRS-01',
        email: courseEmail,
        name: 'Giáo Viên Course Target',
        active: true,
        assigned_courses: ['6adadba969897b0002482ca5'],
      });

      harness.state.tables.ktn_courses.push({
        course_id: '6adadba969897b0002482ca5',
        title: 'Khóa Học Tiêu Chuẩn',
        teacher_email: courseEmail,
      });

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(courseEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.unassignedCoursesCount).toBeGreaterThanOrEqual(1);

      const crs = harness.state.tables.ktn_courses.find(
        (c: any) => c.course_id === '6adadba969897b0002482ca5'
      );
      expect(crs.teacher_email).toBeNull();
    });

    it('TC-T5-DEL-STATE-04: Resilient to corrupted teacher record: null aliases, null assignments, null name', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-CORRUPT-NULLS',
        email: 'corrupt.nulls@khongtunhi.com',
        name: null,
        aliases: null,
        assigned_classes: null,
        assigned_courses: null,
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=corrupt.nulls@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherName).toBe('corrupt.nulls@khongtunhi.com');
    });

    it('TC-T5-DEL-STATE-05: Resilient to teacher record with null code and null id (resolves via email)', async () => {
      harness.state.tables.ktn_teachers.push({
        code: null,
        id: null,
        email: 'nocode.id@khongtunhi.com',
        name: 'Giáo Viên No Code',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/teachers?email=nocode.id@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.teacherEmail).toBe('nocode.id@khongtunhi.com');
    });

    it('TC-T5-DEL-STATE-06: Historical student chat, homework, and accounts are 100% preserved', async () => {
      const initialMessagesCount = harness.state.tables.ktn_messages.length;
      const initialHomeworksCount = harness.state.tables.ktn_homeworks.length;
      const initialStudentsCount = harness.state.tables.ktn_students.length;

      const req = new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      expect(res.status).toBe(200);

      // Verify zero loss on historical data
      expect(harness.state.tables.ktn_messages.length).toBe(initialMessagesCount);
      expect(harness.state.tables.ktn_homeworks.length).toBe(initialHomeworksCount);
      expect(harness.state.tables.ktn_students.length).toBe(initialStudentsCount);
    });

    it('TC-T5-DEL-STATE-07: Production pre-V3 schema fallback (PGRST204 missing assigned_classes/assigned_courses): falls back to active+aliases+updated_at and strips __class:/__course: tags', async () => {
      harness.state.faults.strictPreV3TeacherSchema = true;
      const prodEmail = 'prod.schema.qa@khongtunhi.com';
      const prodCode = 'GV-PROD-SCHEMA';

      harness.state.tables.ktn_teachers.push({
        code: prodCode,
        email: prodEmail,
        name: 'Giáo Viên Prod Schema',
        active: true,
        aliases: [
          '__status:ready_to_login',
          '__class:QA-PROD-CLS',
          '__course:6adadba969897b0002482ca5',
          'nickname_gv',
        ],
      });
      harness.state.tables.ktn_classes.push({
        id: 'QA-PROD-CLS',
        name: 'Lớp QA Prod Schema',
        teacher_code: prodCode,
        teacher_email: prodEmail,
        active: true,
      });

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(prodEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.deleted).toBe(true);
      expect(data.unassignedClasses).toContain('QA-PROD-CLS');
      expect(data.unassignedCourses).toContain('6adadba969897b0002482ca5');

      const updated = harness.state.tables.ktn_teachers.find((t: any) => t.email === prodEmail);
      expect(updated.active).toBe(false);
      expect(updated.aliases).toContain('__status:deleted');
      expect(updated.aliases).toContain('nickname_gv');
      expect(updated.aliases.some((a: string) => a.startsWith('__class:'))).toBe(false);
      expect(updated.aliases.some((a: string) => a.startsWith('__course:'))).toBe(false);

      const cls = harness.state.tables.ktn_classes.find((c: any) => c.id === 'QA-PROD-CLS');
      expect(cls.teacher_email).toBeNull();
      expect(cls.teacher_code).toBeNull();
    });

    it('TC-T5-DEL-STATE-08: Rejects PATCH HTTP 200 with 0 updated rows as SUPABASE_TEACHER_SOFT_DELETE_FAILED (ZERO_ROWS_UPDATED)', async () => {
      harness.state.faults.zeroRowsTeacherPatch = true;
      const zeroEmail = 'zero.rows.qa@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-ZERO-01',
        email: zeroEmail,
        name: 'Giáo Viên Zero Rows',
        active: true,
      });

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(zeroEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(502);
      expect(data.ok).toBe(false);
      expect(data.error).toBe('SUPABASE_TEACHER_SOFT_DELETE_FAILED');
      expect(data.supabaseErrorCode).toBe('ZERO_ROWS_UPDATED');
    });

    it('TC-T5-DEL-STATE-09: Does NOT use stale assignment metadata on deleted teacher to wipe classes or courses belonging to another teacher', async () => {
      const staleTeacherEmail = 'stale.teacher@khongtunhi.com';
      const otherTeacherEmail = 'thu.ha@khongtunhi.com';

      // YCT1-01 in ktn_classes is currently owned by thu.ha@khongtunhi.com (GV-KTN-12)
      // Give staleTeacher stale metadata pointing to YCT1-01 and course 6adadba969897b0002482ca5 (owned by thu.ha)
      harness.state.tables.ktn_teachers.push({
        code: 'GV-STALE-01',
        email: staleTeacherEmail,
        name: 'Giáo Viên Stale Metadata',
        active: true,
        assigned_classes: ['YCT1-01'],
        assigned_courses: ['6adadba969897b0002482ca5'],
        aliases: ['__class:YCT1-01', '__course:6adadba969897b0002482ca5'],
      });
      harness.state.tables.ktn_courses.push({
        course_id: '6adadba969897b0002482ca5',
        title: 'HSK 1',
        teacher_email: otherTeacherEmail,
      });

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(staleTeacherEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.unassignedClasses).not.toContain('YCT1-01');
      expect(data.unassignedCourses).not.toContain('6adadba969897b0002482ca5');

      // Verify other teacher's class & course were NOT unassigned
      const otherCls = harness.state.tables.ktn_classes.find((c: any) => c.id === 'YCT1-01');
      expect(otherCls.teacher_email).toBe(otherTeacherEmail);
      expect(otherCls.teacher_code).toBe('GV-KTN-12');

      const otherCrs = harness.state.tables.ktn_courses.find(
        (c: any) => c.course_id === '6adadba969897b0002482ca5'
      );
      expect(otherCrs.teacher_email).toBe(otherTeacherEmail);
    });

    it('TC-T5-DEL-STATE-10: Idempotent repeated DELETE on already soft-deleted teacher succeeds without duplicating audit tags or corrupting data', async () => {
      const idemEmail = 'idem.delete@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-IDEM-01',
        email: idemEmail,
        name: 'Giáo Viên Idempotent',
        active: true,
        aliases: ['custom_tag'],
      });

      const req1 = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(idemEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res1 = await harness.workerModule.fetch(req1, harness.env);
      expect(res1.status).toBe(200);

      const req2 = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(idemEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res2 = await harness.workerModule.fetch(req2, harness.env);
      const data2 = await res2.json();
      expect(res2.status).toBe(200);
      expect(data2.deleted).toBe(true);

      const updated = harness.state.tables.ktn_teachers.find((t: any) => t.email === idemEmail);
      expect(updated.active).toBe(false);
      expect(updated.aliases.filter((a: string) => a === '__status:deleted').length).toBe(1);
      expect(updated.aliases.filter((a: string) => a.startsWith('__deleted_at:')).length).toBe(1);
    });
  });

  // =========================================================================
  // SUITE 4: DELETE ROUTE — SESSION REVOCATION & DLP BARRIER
  // =========================================================================
  describe('Suite 4: DELETE Route — Token Invalidation & Session Revocation', () => {
    it('TC-T5-DEL-SESS-01: Adds REVOKED_EMAIL_ to ktn_dlp_alerts table and in-memory revocation set', async () => {
      const victimEmail = 'victim.session@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-VICTIM-01',
        email: victimEmail,
        name: 'Giáo Viên Bị Xóa',
        active: true,
      });

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(victimEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      expect(res.status).toBe(200);

      const dlpEntry = harness.state.tables.ktn_dlp_alerts.find(
        (a: any) => a.id === `REVOKED_EMAIL_${victimEmail}`
      );
      expect(dlpEntry).toBeDefined();
      expect(dlpEntry.room_id).toBe('AUTH_REVOKED');
      expect(dlpEntry.sender_name).toBe('Giáo Viên Bị Xóa');
      expect(dlpEntry.sender_role).toBe('teacher');
      expect(dlpEntry.reason).toBe('TEACHER_SOFT_DELETED_REVOKED');
    });

    it('TC-T5-DEL-SESS-02: Revoked teacher session token is immediately rejected on /api/ktn/auth/session (401)', async () => {
      const victimEmail = 'linh.lam@khongtunhi.com';
      // First verify teacher token was valid before deletion
      const beforeReq = new Request('http://localhost/api/ktn/auth/session', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const beforeRes = await harness.workerModule.fetch(beforeReq, harness.env);
      const beforeData = await beforeRes.json();
      expect(beforeData.authenticated).toBe(true);

      // Delete teacher
      const delReq = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(victimEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const delRes = await harness.workerModule.fetch(delReq, harness.env);
      expect(delRes.status).toBe(200);

      // Verify token is rejected immediately
      const afterReq = new Request('http://localhost/api/ktn/auth/session', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const afterRes = await harness.workerModule.fetch(afterReq, harness.env);
      const afterData = await afterRes.json();

      expect(afterRes.status).toBe(401);
      expect(afterData.authenticated).toBe(false);
    });

    it('TC-T5-DEL-SESS-03: Revoked teacher session is blocked on /api/ktn/teachers/search (403)', async () => {
      // First delete teacher to revoke session
      await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        harness.env
      );

      const searchReq = new Request('http://localhost/api/ktn/teachers/search', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const searchRes = await harness.workerModule.fetch(searchReq, harness.env);
      expect(searchRes.status).toBe(403);
    });

    it('TC-T5-DEL-SESS-04: Revoked/Inactive teacher session is blocked on /api/ktn/courses/units (401 or 403 TEACHER_INACTIVE)', async () => {
      // First delete teacher to revoke session
      await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/teachers?email=linh.lam@khongtunhi.com', {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${adminToken}` },
        }),
        harness.env
      );

      const unitsReq = new Request('http://localhost/api/ktn/courses/units?courseId=6adadba969897b0002482ca5', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const unitsRes = await harness.workerModule.fetch(unitsReq, harness.env);
      expect([401, 403]).toContain(unitsRes.status);
    });
  });

  // =========================================================================
  // SUITE 5: DELETE ROUTE — CONCURRENCY & RACE CONDITIONS
  // =========================================================================
  describe('Suite 5: DELETE Route — Concurrency Lock & Idempotent Deduplication', () => {
    it('TC-T5-DEL-RACE-01: Serializes concurrent deletion requests without deadlock or 500 crashes', async () => {
      const raceEmail = 'race.test@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-RACE-01',
        email: raceEmail,
        name: 'Giáo Viên Race Test',
        active: true,
        assigned_classes: ['YCT1-01'],
      });

      // Fire 3 simultaneous delete requests
      const [r1, r2, r3] = await Promise.all([
        harness.workerModule.fetch(
          new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(raceEmail)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          harness.env
        ),
        harness.workerModule.fetch(
          new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(raceEmail)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          harness.env
        ),
        harness.workerModule.fetch(
          new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(raceEmail)}`, {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          harness.env
        ),
      ]);

      const statuses = [r1.status, r2.status, r3.status];
      expect(statuses).not.toContain(500);
      expect(statuses.includes(200) || statuses.includes(404)).toBe(true);

      // Verify final state: teacher is deleted
      const updated = harness.state.tables.ktn_teachers.find((t: any) => t.email === raceEmail);
      expect(updated.active).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 6: DELETE ROUTE — IZTEACH UPSTREAM SYNC GRACEFUL FALLBACK
  // =========================================================================
  describe('Suite 6: DELETE Route — izTeach Upstream Sync Graceful Fallback', () => {
    it('TC-T5-DEL-SYNC-01: Falls back gracefully with syncStatus="needs_sync" when izTeach upstream fails', async () => {
      const syncFailEmail = 'syncfail@khongtunhi.com';
      harness.state.tables.ktn_teachers.push({
        code: 'GV-SYNC-FAIL',
        email: syncFailEmail,
        name: 'Giáo Viên Sync Fail',
        active: true,
        assigned_courses: ['6adadba969897b0002482ca5'],
      });

      // Break izTeach credentials to simulate external failure
      harness.env.IZTEACH_ADMIN_PASSWORD = 'INVALID_PASSWORD_TRIGGER_FAIL';

      const req = new Request(`http://localhost/api/ktn/teachers?email=${encodeURIComponent(syncFailEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.deleted).toBe(true);
      expect(data.syncStatus).toBe('needs_sync');
      expect(data.message).toContain('đồng bộ izTeach cần kiểm tra lại');

      // Local soft-delete must still succeed completely
      const updated = harness.state.tables.ktn_teachers.find((t: any) => t.email === syncFailEmail);
      expect(updated.active).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 7: SEARCH ROUTE — UNICODE ACCENTS & DIACRITICS INVARIANCE
  // =========================================================================
  describe('Suite 7: Search Route — Unicode Accents, Diacritics & Case Invariance', () => {
    beforeEach(() => {
      // Ensure known teachers exist in harness
      if (!harness.state.tables.ktn_teachers.some((t: any) => t.email === 'linh.lam@khongtunhi.com')) {
        harness.state.tables.ktn_teachers.push({
          code: 'GV-KTN-08',
          email: 'linh.lam@khongtunhi.com',
          name: 'Cô Lâm Mỹ Linh',
          phone: '0901112233',
          specialty: 'Chuyên gia YCT & Hán tự',
          assigned_classes: ['YCT2-04'],
          active: true,
        });
      }
      if (!harness.state.tables.ktn_teachers.some((t: any) => t.email === 'thu.ha@khongtunhi.com')) {
        harness.state.tables.ktn_teachers.push({
          code: 'GV-KTN-02',
          email: 'thu.ha@khongtunhi.com',
          name: 'Cô Nguyễn Thu Hà',
          phone: '0904445566',
          specialty: 'Chuyên gia HSK 1 - 3',
          assigned_classes: ['HSK1-01'],
          active: true,
        });
      }
    });

    it('TC-T5-SRCH-UNI-01: Unaccented Vietnamese query (my linh) matches accented teacher (Cô Lâm Mỹ Linh)', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?q=my%20linh', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.some((t: any) => t.email === 'linh.lam@khongtunhi.com')).toBe(true);
    });

    it('TC-T5-SRCH-UNI-02: Unicode NFD (decomposed) and NFC (composed) normalized forms match identically', async () => {
      const nfcQuery = 'Lâm Mỹ Linh'.normalize('NFC');
      const nfdQuery = 'Lâm Mỹ Linh'.normalize('NFD');

      const [resNfc, resNfd] = await Promise.all([
        harness.workerModule.fetch(
          new Request(`http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(nfcQuery)}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          harness.env
        ),
        harness.workerModule.fetch(
          new Request(`http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(nfdQuery)}`, {
            headers: { Authorization: `Bearer ${adminToken}` },
          }),
          harness.env
        ),
      ]);

      const dataNfc = await resNfc.json();
      const dataNfd = await resNfd.json();

      expect(dataNfc.totalCount).toBe(dataNfd.totalCount);
      expect(dataNfc.items[0]?.email).toBe(dataNfd.items[0]?.email);
    });

    it('TC-T5-SRCH-UNI-03: Case insensitivity: lowercase, uppercase, and mixed case yield identical matches', async () => {
      for (const q of ['cô lâm mỹ linh', 'CÔ LÂM MỸ LINH', 'cÔ lÂm MỸ LiNh']) {
        const req = new Request(`http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(q)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const res = await harness.workerModule.fetch(req, harness.env);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.items.some((t: any) => t.email === 'linh.lam@khongtunhi.com')).toBe(true);
      }
    });

    it('TC-T5-SRCH-UNI-04: Vietnamese special consonants (đ/Đ normalized to d) match correctly', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-DANG-BAO',
        email: 'dangbao@khongtunhi.com',
        name: 'Thầy Đặng Quốc Bảo',
        active: true,
      });

      const req = new Request('http://localhost/api/ktn/admin/teachers/search?q=dang%20quoc%20bao', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.some((t: any) => t.email === 'dangbao@khongtunhi.com')).toBe(true);
    });

    it('TC-T5-SRCH-UNI-05: Multi-token permutations (Linh Cô) match (Cô Lâm Mỹ Linh)', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?q=Linh%20C%C3%B4', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.some((t: any) => t.email === 'linh.lam@khongtunhi.com')).toBe(true);
    });

    it('TC-T5-SRCH-UNI-06: Teacher code query matches with top rank score (1000)', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?q=GV-KTN-08', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items[0]?.code).toBe('GV-KTN-08');
    });

    it('TC-T5-SRCH-UNI-07: Phone number digits query matches teacher record', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?q=0901112233', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.some((t: any) => t.email === 'linh.lam@khongtunhi.com')).toBe(true);
    });
  });

  // =========================================================================
  // SUITE 8: SEARCH ROUTE — SQL & XSS INJECTION RESILIENCE
  // =========================================================================
  describe('Suite 8: Search Route — SQL & XSS Injection Resilience & Zero-Result Handling', () => {
    it('TC-T5-SRCH-INJ-01: SQL injection strings do not break syntax or leak unauthorized data', async () => {
      for (const injection of [
        "' OR '1'='1",
        "'; DROP TABLE ktn_teachers; --",
        "admin'--",
        "UNION SELECT * FROM ktn_students",
      ]) {
        const req = new Request(
          `http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(injection)}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        const res = await harness.workerModule.fetch(req, harness.env);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
        expect(Array.isArray(data.items)).toBe(true);
      }
    });

    it('TC-T5-SRCH-INJ-02: XSS payloads are handled safely as plain search strings without execution', async () => {
      for (const xss of [
        '<script>alert(1)</script>',
        '"><img src=x onerror=alert(1)>',
        '<svg onload=alert(document.domain)>',
      ]) {
        const req = new Request(`http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(xss)}`, {
          headers: { Authorization: `Bearer ${adminToken}` },
        });
        const res = await harness.workerModule.fetch(req, harness.env);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
      }
    });

    it('TC-T5-SRCH-INJ-03: Malformed regex syntax characters in query do not crash with RegExp SyntaxError', async () => {
      for (const regexAttack of ['[[[[[', '(((((((', '(a+)+$', '*+?{}', '\\\\']) {
        const req = new Request(
          `http://localhost/api/ktn/admin/teachers/search?q=${encodeURIComponent(regexAttack)}`,
          { headers: { Authorization: `Bearer ${adminToken}` } }
        );
        const res = await harness.workerModule.fetch(req, harness.env);
        const data = await res.json();

        expect(res.status).toBe(200);
        expect(data.ok).toBe(true);
      }
    });

    it('TC-T5-SRCH-INJ-04: Non-matching random query returns ok:true, items:[], totalCount:0, hasMore:false', async () => {
      const req = new Request(
        'http://localhost/api/ktn/admin/teachers/search?q=XYZ_TOTALLY_NONEXISTENT_QUERY_987654',
        { headers: { Authorization: `Bearer ${adminToken}` } }
      );
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.ok).toBe(true);
      expect(data.items).toEqual([]);
      expect(data.totalCount).toBe(0);
      expect(data.hasMore).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 9: SEARCH ROUTE — EXTREME PAGINATION & PERMISSION BOUNDARIES
  // =========================================================================
  describe('Suite 9: Search Route — Extreme Pagination, Clamping & Permission Boundaries', () => {
    it('TC-T5-SRCH-PAG-01: Negative limit and negative offset are clamped to safe non-negative defaults', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?limit=-10&offset=-5', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.limit).toBeGreaterThan(0);
      expect(data.offset).toBe(0);
    });

    it('TC-T5-SRCH-PAG-02: Extreme limit (limit=999999) is clamped to maximum allowable limit (100)', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?limit=999999', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.limit).toBeLessThanOrEqual(100);
    });

    it('TC-T5-SRCH-PAG-03: Out-of-bounds offset (offset=99999) returns empty items list without crash', async () => {
      const req = new Request('http://localhost/api/ktn/admin/teachers/search?offset=99999', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items).toEqual([]);
      expect(data.hasMore).toBe(false);
    });

    it('TC-T5-SRCH-PAG-04: Non-admin teacher role session is strictly restricted to active teachers only', async () => {
      // Add inactive teacher
      harness.state.tables.ktn_teachers.push({
        code: 'GV-LOCKED-01',
        email: 'locked@khongtunhi.com',
        name: 'Giáo Viên Bị Khóa',
        active: false,
        status: 'locked',
      });

      const req = new Request('http://localhost/api/ktn/teachers/search?status=all', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      // Teacher role must NOT see locked/inactive teachers
      expect(data.items.some((t: any) => t.email === 'locked@khongtunhi.com')).toBe(false);
    });

    it('TC-T5-SRCH-PAG-05: Soft-deleted teachers (__status:deleted in aliases) are strictly excluded from search even under status=all', async () => {
      harness.state.tables.ktn_teachers.push({
        code: 'GV-DELETED-AUDIT',
        email: 'deleted.audit@khongtunhi.com',
        name: 'Giáo Viên Đã Xóa',
        active: false,
        aliases: ['__status:deleted', '__deleted_at:2026-11-11T00:00:00Z'],
      });

      const req = new Request('http://localhost/api/ktn/admin/teachers/search?status=all', {
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      const res = await harness.workerModule.fetch(req, harness.env);
      const data = await res.json();

      expect(res.status).toBe(200);
      expect(data.items.some((t: any) => t.email === 'deleted.audit@khongtunhi.com')).toBe(false);
    });
  });

  // =========================================================================
  // SUITE 10: CLIENT-SIDE ktnApiClient — ADVERSARIAL BOUNDARY HARDENING
  // =========================================================================
  describe('Suite 10: Client-side ktnApiClient — Adversarial Boundary Hardening', () => {
    it('TC-T5-CLI-01: ktnApi.deleteTeacher validates empty input client-side and throws KtnApiError without network call', async () => {
      const mockFetch = vi.fn();
      globalThis.fetch = mockFetch;

      await expect(ktnApi.deleteTeacher({ teacherId: '', code: '   ', email: '' })).rejects.toThrow(
        KtnApiError
      );
      expect(mockFetch).not.toHaveBeenCalled();

      try {
        await ktnApi.deleteTeacher({});
      } catch (err: any) {
        expect(err.status).toBe(400);
        expect(err.code).toBe('MISSING_TEACHER_IDENTIFIER');
      }
    });

    it('TC-T5-CLI-02: ktnApi.searchAdminTeachers with AbortSignal cancellation rethrows AbortError without fallback', async () => {
      const controller = new AbortController();
      controller.abort(); // Pre-aborted signal

      const getTeachersSpy = vi.spyOn(ktnApi, 'getTeachers');

      await expect(
        ktnApi.searchAdminTeachers({ q: 'test' }, { signal: controller.signal })
      ).rejects.toThrow();

      // Legacy fallback must NOT be called on abort
      expect(getTeachersSpy).not.toHaveBeenCalled();
    });

    it('TC-T5-CLI-03: filterAndPaginateTeachersClientSide handles empty dataset, accents, and excludes deleted teachers', () => {
      const sampleTeachers: any[] = [
        {
          code: 'GV-01',
          name: 'Cô Lâm Mỹ Linh',
          email: 'linh.lam@khongtunhi.com',
          phone: '0901112233',
          specialty: 'YCT',
          assigned_classes: ['YCT2-04'],
          assigned_courses: [],
          active: true,
          status: 'active',
        },
        {
          code: 'GV-DEL',
          name: 'Giáo Viên Đã Xóa',
          email: 'deleted@khongtunhi.com',
          phone: '0909999999',
          specialty: 'HSK',
          assigned_classes: [],
          assigned_courses: [],
          active: false,
          status: 'inactive',
          aliases: ['__status:deleted'],
        },
      ];

      // Unaccented match
      const res = filterAndPaginateTeachersClientSide(sampleTeachers, { q: 'my linh' });
      expect(res.totalCount).toBe(1);
      expect(res.items[0]?.email).toBe('linh.lam@khongtunhi.com');

      // Exclude soft deleted
      const resAll = filterAndPaginateTeachersClientSide(sampleTeachers, { status: 'ALL' });
      expect(resAll.items.some((t) => t.email === 'deleted@khongtunhi.com')).toBe(false);

      // Empty dataset
      const resEmpty = filterAndPaginateTeachersClientSide([], { q: 'anything' });
      expect(resEmpty.totalCount).toBe(0);
      expect(resEmpty.items).toEqual([]);
    });

    it('TC-T5-CLI-04: searchAdminTeachers propagates 401/403 authorization errors directly without swallowing them in fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({ ok: false, error: 'ADMIN_ONLY', message: 'Forbidden' }),
      });
      globalThis.fetch = mockFetch;

      const getTeachersSpy = vi.spyOn(ktnApi, 'getTeachers');

      await expect(ktnApi.searchAdminTeachers({ q: 'test' })).rejects.toThrow(KtnApiError);
      expect(getTeachersSpy).not.toHaveBeenCalled();
    });
  });
});
