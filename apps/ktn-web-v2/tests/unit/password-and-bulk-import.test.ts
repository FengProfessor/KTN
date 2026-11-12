// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
// @ts-ignore
import { signTestSessionToken } from '../e2e/teacher-tiers/test-harness-utils.mjs';
import {
  parseKtnCenterBulkCsv,
  deriveCanonicalClassCode,
  cleanBulkPhoneValue,
  KTN_CENTER_SAMPLE_CSV,
} from '../../src/lib/bulkImportParser';

describe('KTN Two-Way Password Change, Admin Reset & Center Bulk Import', () => {
  let harness: any;
  let adminToken: string;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
    harness = createLocalWorkerHarness();

    adminToken = await signTestSessionToken({
      id: 'ADMIN-BULK-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Suite 1: Multi-line 5-column Center CSV Parser (parseKtnCenterBulkCsv)', () => {
    it('parses the full 299-student center CSV accurately with class codes, schedules, teachers, phones, and BẢO LƯU archived status', () => {
      const result = parseKtnCenterBulkCsv(KTN_CENTER_SAMPLE_CSV, {
        startTeacherSeq: 1,
        startStudentSeq: 1,
        defaultPassword: '12345678',
      });

      expect(result.summary.classCount).toBe(100);
      expect(result.summary.activeClassCount).toBe(99);
      expect(result.summary.archivedClassCount).toBe(1);
      expect(result.summary.teacherCount).toBe(54);
      expect(result.summary.studentCount).toBe(299);
      expect(result.summary.activeStudentCount).toBe(291);
      expect(result.summary.archivedStudentCount).toBe(8);

      // Check canonical class codes
      const classCodes = result.classes.map((c) => c.code);
      expect(classCodes).toContain('LOMINI23-CHO');
      expect(classCodes).toContain('LOMINI23-N01');
      expect(classCodes).toContain('LO2-CHO');
      expect(classCodes).toContain('LO2-N01');
      expect(classCodes).toContain('LO2-N22');
      expect(classCodes).toContain('HSK-N01');
      expect(classCodes).toContain('HSK-N21');
      expect(classCodes).toContain('1BT-N01');
      expect(classCodes).toContain('1V1-CHO');
      expect(classCodes).toContain('1V1-N01');
      expect(classCodes).toContain('BAOLUU-N01');

      // Check schedule extraction from multi-line cell
      const lo2N01 = result.classes.find((c) => c.code === 'LO2-N01');
      expect(lo2N01?.title).toBe('LỘ 2 · Nhóm 1');
      expect(lo2N01?.schedule).toBe('T2-T4 20h-21h');

      // Check teacher codes and emails
      expect(result.teachers[0].code).toBe('GV001');
      expect(result.teachers[0].email).toBe('gv001@khongtunhi.com');
      expect(result.teachers[53].code).toBe('GV054');
      expect(result.teachers[53].email).toBe('gv054@khongtunhi.com');

      // Check student codes and emails
      expect(result.students[0].code).toBe('20260001');
      expect(result.students[0].email).toBe('20260001@khongtunhi.com');
      expect(result.students[298].code).toBe('20260299');
      expect(result.students[298].email).toBe('20260299@khongtunhi.com');

      // Check dirty phone cleanup (0912240079n -> 0912240079, 0902396116d -> 0902396116, 914341531 -> 0914341531)
      const cleanedPhones = result.students.map((s) => s.phone);
      expect(cleanedPhones).toContain('0912240079');
      expect(cleanedPhones).toContain('0902396116');
      expect(cleanedPhones).toContain('0914341531');

      // Check phone-in-student-name recovery (0948000580 in HSK-N20 / HSK-N21)
      const recoveredStudents = result.students.filter((s) => s.phone === '0948000580');
      expect(recoveredStudents.length).toBeGreaterThanOrEqual(1);
      expect(recoveredStudents[0].name).toContain('Học viên (PH');

      // Check BẢO LƯU students are marked archived
      const archivedStudents = result.students.filter((s) => s.status === 'archived');
      expect(archivedStudents.length).toBe(8);
      expect(archivedStudents.every((s) => s.classCode.startsWith('BAOLUU-'))).toBe(true);
    });

    it('derives canonical class codes and cleans dirty phones accurately', () => {
      expect(deriveCanonicalClassCode('LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h')?.code).toBe('LO2-N01');
      expect(deriveCanonicalClassCode('HSK · Nhóm 15\nT3-T5 19h-20h')?.code).toBe('HSK-N15');
      expect(deriveCanonicalClassCode('LỚP 1 BUỔI-TUẦN · Nhóm 1')?.code).toBe('1BT-N01');
      expect(deriveCanonicalClassCode('LỚP 1-1 · Chưa rõ nhóm')?.code).toBe('1V1-CHO');
      expect(deriveCanonicalClassCode('BẢO LƯU · Nhóm 3')?.isArchived).toBe(true);

      expect(cleanBulkPhoneValue('0912240079n').phone).toBe('0912240079');
      expect(cleanBulkPhoneValue('914341531').phone).toBe('0914341531');
    });
  });

  describe('Suite 2: Bulk Import API + Login by Code + Two-Way Password Change + Admin Reset', () => {
    const sampleImportCsv = [
      'LỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH',
      '"LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h",Cô Hồng,Bùi Đức Huy,0912240079n,Mẹ Bùi Hằng',
      ',,Nguyễn Bảo An,914341531,Mẹ Nguyễn Lan',
      '"BẢO LƯU · Nhóm 1\nChưa có lịch",Chưa phân công,Lê Tạm Nghỉ,0988777666,Mẹ Lê Hoa',
    ].join('\n');

    it('rejects non-admin calls to /api/ktn/admin/bulk-import and /api/ktn/admin/users/reset-password', async () => {
      const studentToken = await signTestSessionToken({
        id: 'STU-NON-ADM',
        email: 'hoangngan@khongtunhi.com',
        role: 'student',
        roles: ['student'],
      });
      const resBulk = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({ csvText: sampleImportCsv, dryRun: true }),
        }),
        harness.env
      );
      expect(resBulk.status).toBe(403);

      const resReset = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/users/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${studentToken}`,
          },
          body: JSON.stringify({ email: '20260001@khongtunhi.com' }),
        }),
        harness.env
      );
      expect(resReset.status).toBe(403);
    });

    it('executes dryRun: true and dryRun: false bulk import, then verifies student/teacher login, self password change, and admin password reset', async () => {
      // 1. Dry-run preview
      const previewRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ csvText: sampleImportCsv, dryRun: true }),
        }),
        harness.env
      );
      expect(previewRes.status).toBe(200);
      const previewData = await previewRes.json();
      expect(previewData.ok).toBe(true);
      expect(previewData.dryRun).toBe(true);
      expect(previewData.summary.classCount).toBe(2);
      expect(previewData.summary.teacherCount).toBe(1);
      expect(previewData.summary.studentCount).toBe(3);

      // 2. Execute actual import (dryRun: false)
      const importRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({ csvText: sampleImportCsv, dryRun: false }),
        }),
        harness.env
      );
      expect(importRes.status).toBe(200);
      const importData = await importRes.json();
      expect(importData.ok).toBe(true);
      expect(importData.dryRun).toBe(false);

      const createdTeacher = importData.teachers[0];
      const activeStudent = importData.students[0];
      const archivedStudent = importData.students[2];

      expect(createdTeacher.code).toMatch(/^GV\d{3}$/);
      expect(activeStudent.code).toMatch(/^2026\d{4}$/);
      expect(activeStudent.phone).toBe('0912240079');
      expect(archivedStudent.status).toBe('archived');

      // 3. Student logs in using code (e.g. 2026xxxx) and default password 12345678
      const stuLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: activeStudent.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(stuLoginRes.status).toBe(200);
      const stuLoginData = await stuLoginRes.json();
      expect(stuLoginData.ok).toBe(true);
      expect(stuLoginData.user.role).toBe('student');
      expect(stuLoginData.user.email).toBe(activeStudent.email);
      const stuSessionToken = stuLoginData.sessionToken;
      expect(stuSessionToken).toBeTruthy();

      // 4. Archived (BẢO LƯU) student is blocked from logging in
      const archivedLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: archivedStudent.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(archivedLoginRes.status).toBe(403);

      // 5. Student changes their own password via POST /api/ktn/auth/change-password
      const stuChangePwdRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${stuSessionToken}`,
          },
          body: JSON.stringify({
            currentPassword: '12345678',
            newPassword: 'hocvien2026',
          }),
        }),
        harness.env
      );
      expect(stuChangePwdRes.status).toBe(200);
      const stuChangePwdData = await stuChangePwdRes.json();
      expect(stuChangePwdData.ok).toBe(true);

      // 6. Student old password (12345678) MUST be rejected now
      const stuOldPwdLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: activeStudent.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(stuOldPwdLoginRes.status).toBe(401);

      // 7. Student new password (hocvien2026) succeeds
      const stuNewPwdLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: activeStudent.email,
            password: 'hocvien2026',
          }),
        }),
        harness.env
      );
      expect(stuNewPwdLoginRes.status).toBe(200);

      // 8. Admin resets student password back to default 12345678
      const adminResetStuRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/users/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            email: activeStudent.email,
            role: 'student',
          }),
        }),
        harness.env
      );
      expect(adminResetStuRes.status).toBe(200);
      const adminResetStuData = await adminResetStuRes.json();
      expect(adminResetStuData.ok).toBe(true);
      expect(adminResetStuData.newPassword).toBe('12345678');

      // 9. Student logs in again with 12345678
      const stuAfterResetLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: activeStudent.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(stuAfterResetLoginRes.status).toBe(200);

      // 10. Teacher logs in using code (GVxxx) and default password 12345678
      const gvLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: createdTeacher.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(gvLoginRes.status).toBe(200);
      const gvLoginData = await gvLoginRes.json();
      expect(gvLoginData.ok).toBe(true);
      expect(gvLoginData.user.role).toBe('teacher');
      const gvSessionToken = gvLoginData.sessionToken;

      // 11. Teacher changes their own password via POST /api/ktn/auth/change-password
      const gvChangePwdRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gvSessionToken}`,
          },
          body: JSON.stringify({
            currentPassword: '12345678',
            newPassword: 'cohong2026',
          }),
        }),
        harness.env
      );
      expect(gvChangePwdRes.status).toBe(200);

      // 12. Teacher old password (12345678) is rejected, new password (cohong2026) succeeds
      const gvOldLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: createdTeacher.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(gvOldLoginRes.status).toBe(401);

      const gvNewLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: createdTeacher.code,
            password: 'cohong2026',
          }),
        }),
        harness.env
      );
      expect(gvNewLoginRes.status).toBe(200);

      // 13. Admin resets teacher password back to 12345678
      const adminResetGvRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/users/reset-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            email: createdTeacher.email,
            role: 'teacher',
          }),
        }),
        harness.env
      );
      expect(adminResetGvRes.status).toBe(200);

      const gvAfterResetRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: createdTeacher.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      expect(gvAfterResetRes.status).toBe(200);
    });
  });
});
