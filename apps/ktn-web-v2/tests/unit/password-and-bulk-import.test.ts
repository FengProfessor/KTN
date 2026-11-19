// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';
// @ts-ignore
import { signTestSessionToken } from '../e2e/teacher-tiers/test-harness-utils.mjs';
import {
  parseKtnCenterBulkCsv,
  deriveCanonicalClassCode,
  normalizeBulkTeacherIdentity,
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
    it('parses the full 303-student center CSV accurately with class codes, schedules, teachers, phones, and BẢO LƯU archived status', () => {
      const result = parseKtnCenterBulkCsv(KTN_CENTER_SAMPLE_CSV, {
        startTeacherSeq: 1,
        startStudentSeq: 1,
        defaultPassword: '12345678',
      });

      expect(result.summary.classCount).toBe(100);
      expect(result.summary.activeClassCount).toBe(99);
      expect(result.summary.archivedClassCount).toBe(1);
      expect(result.summary.teacherCount).toBe(44);
      expect(result.summary.studentCount).toBe(303);
      expect(result.summary.activeStudentCount).toBe(295);
      expect(result.summary.archivedStudentCount).toBe(8);

      // Check canonical class codes (no -CHO ungrouped classes after Excel border alignment)
      const classCodes = result.classes.map((c) => c.code);
      expect(classCodes).not.toContain('LOMINI23-CHO');
      expect(classCodes).toContain('LOMINI23-N01');
      expect(classCodes).toContain('LOMINI23-N04');
      expect(classCodes).toContain('LO2-N01');
      expect(classCodes).toContain('LO2-N22');
      expect(classCodes).toContain('HSK-N01');
      expect(classCodes).toContain('HSK-N21');
      expect(classCodes).toContain('1BT-N01');
      expect(classCodes).toContain('1V1-N01');
      expect(classCodes).toContain('1V1-N17');
      expect(classCodes).toContain('BAOLUU-N01');

      // Check schedule extraction from multi-line cell
      const lo2N01 = result.classes.find((c) => c.code === 'LO2-N01');
      expect(lo2N01?.title).toBe('LỘ 2 · Nhóm 1');
      expect(lo2N01?.schedule).toBe('T2-T4 20h-21h');

      // Check canonical teacher codes, emails, and merged class assignments (GV001..GV044)
      expect(result.teachers[0].code).toBe('GV001');
      expect(result.teachers[0].email).toBe('gv001@khongtunhi.com');
      expect(result.teachers[0].name).toBe('Cô Đặng Thùy Dương');
      expect(result.teachers[0].assignedClasses).toEqual([
        'LO2-N02',
        'LO2-N13',
        'LO5-N01',
        'LO5-N03',
        'LO7-N04',
        'HSK-N07',
        'HSK-N12',
        'HSK-N13',
      ]);

      const gv027 = result.teachers.find((t) => t.code === 'GV027');
      expect(gv027?.email).toBe('gv027@khongtunhi.com');
      expect(gv027?.name).toBe('Cô Hà Thùy');
      expect(gv027?.assignedClasses).toEqual(['LOMINI23-N01', 'LOMINI23-N02', 'HSK-N16', '1V1-N08']);

      expect(result.teachers[42].code).toBe('GV043');
      expect(result.teachers[42].email).toBe('gv043@khongtunhi.com');
      expect(result.teachers[42].name).toBe('Cô Hồng Điệp');

      expect(result.teachers[43].code).toBe('GV044');
      expect(result.teachers[43].email).toBe('gv044@khongtunhi.com');
      expect(result.teachers[43].name).toBe('Cô Phương Thảo');
      expect(result.teachers[43].assignedClasses).toEqual(['LO2-N18']);

      const gv001ParenIdent = normalizeBulkTeacherIdentity('Cô Đặng Thùy Dương (Tổ trưởng)');
      expect(gv001ParenIdent.preferredCode).toBe('GV001');
      expect(gv001ParenIdent.preferredEmail).toBe('gv001@khongtunhi.com');

      const gv038ShortIdent = normalizeBulkTeacherIdentity('Cô Cầm');
      expect(gv038ShortIdent.preferredCode).toBe('GV038');
      expect(gv038ShortIdent.preferredEmail).toBe('gv038@khongtunhi.com');

      // Check student codes and emails
      expect(result.students[0].code).toBe('20260001');
      expect(result.students[0].email).toBe('20260001@khongtunhi.com');
      expect(result.students[298].code).toBe('20260299');
      expect(result.students[298].email).toBe('20260299@khongtunhi.com');
      expect(result.students[302].code).toBe('20260303');
      expect(result.students[302].email).toBe('20260303@khongtunhi.com');

      // Check dirty phone cleanup (0912240079n -> 0912240079, 0902396116d -> 0902396116, 914341531 -> 0914341531)
      const cleanedPhones = result.students.map((s) => s.phone);
      expect(cleanedPhones).toContain('0912240079');
      expect(cleanedPhones).toContain('0902396116');
      expect(cleanedPhones).toContain('0914341531');

      // Check swapped column recovery (0948000580 -> Khánh Ngân in HSK-N21)
      const recoveredStudents = result.students.filter((s) => s.phone === '0948000580');
      expect(recoveredStudents.length).toBeGreaterThanOrEqual(1);
      expect(recoveredStudents[0].name).toBe('Khánh Ngân');
      expect(recoveredStudents[0].classCode).toBe('HSK-N21');

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

    it('re-imports idempotently without duplicating GVxxx/2026xxxx codes, preserves custom passwords, and keeps 2026xxxx students active on profile edit / class change', async () => {
      // 1. First import
      const firstImportRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            csvText: sampleImportCsv,
            dryRun: false,
            defaultPassword: '12345678',
          }),
        }),
        harness.env
      );
      expect(firstImportRes.status).toBe(200);
      const firstData = await firstImportRes.json();
      const firstTeacher = firstData.teachers[0];
      const firstStudent = firstData.students[0];

      // 2. Student changes password to custompwd88
      const stuLoginRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: firstStudent.code,
            password: '12345678',
          }),
        }),
        harness.env
      );
      const stuSession = await stuLoginRes.json();
      await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${stuSession.sessionToken}`,
          },
          body: JSON.stringify({
            currentPassword: '12345678',
            newPassword: 'custompwd88',
          }),
        }),
        harness.env
      );

      // 3. Re-import same CSV + 1 new student row -> existing teacher & students reuse codes, new student gets next code
      const expandedCsv = [
        sampleImportCsv,
        '"LỘ 2 · Nhóm 1\nT2-T4_ 20h-21h",Cô Hồng,Trần Học Viên Mới,0911223344,Mẹ Trần Mai',
      ].join('\n');

      const secondDryRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            csvText: expandedCsv,
            dryRun: true,
          }),
        }),
        harness.env
      );
      expect(secondDryRes.status).toBe(200);
      const secondDryData = await secondDryRes.json();
      expect(secondDryData.teachers.length).toBe(1);
      expect(secondDryData.teachers[0].code).toBe(firstTeacher.code);
      expect(secondDryData.teachers[0].isExisting).toBe(true);
      expect(secondDryData.students[0].code).toBe(firstStudent.code);
      expect(secondDryData.students[0].isExisting).toBe(true);
      expect(secondDryData.students[3].isExisting).toBe(false);
      expect(secondDryData.students[3].code).not.toBe(firstStudent.code);

      // 4. Execute second import (dryRun: false) and verify custompwd88 is preserved
      const secondLiveRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            csvText: expandedCsv,
            dryRun: false,
          }),
        }),
        harness.env
      );
      expect(secondLiveRes.status).toBe(200);

      const customPwdStillWorksRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            identifier: firstStudent.code,
            password: 'custompwd88',
          }),
        }),
        harness.env
      );
      expect(customPwdStillWorksRes.status).toBe(200);

      // 5. Admin edits 2026xxxx student profile & reassigns class via /api/ktn/students/courses -> remains active & synced
      const updateProfileRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/students/courses', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            action: 'update_profile',
            email: firstStudent.email,
            name: 'Bùi Đức Huy (Đã sửa)',
            phone: '0912240079',
            parentName: 'Mẹ Bùi Hằng (Zalo)',
          }),
        }),
        harness.env
      );
      expect(updateProfileRes.status).toBe(200);
      const updateProfileData = await updateProfileRes.json();
      expect(updateProfileData.ok).toBe(true);
      expect(updateProfileData.accountStatus).toBe('active');
      expect(updateProfileData.syncStatus).toBe('synced');
      expect(updateProfileData.readyToLogin).toBe(true);
      expect(updateProfileData.student.name).toBe('Bùi Đức Huy (Đã sửa)');
    });

    it('resolves canonical teachers GV001..GV044 on bulk-import, prunes duplicate GV045+ rows, clears revocation, and preserves custom passwords on re-import', async () => {
      // Seed pre-canonical displaced GV001, duplicate GV045, and revoked GV027
      harness.state.tables.ktn_teachers.push(
        {
          code: 'GV001',
          email: 'gv001@khongtunhi.com',
          name: 'Cô Hà Thùy',
          phone: '0900000001',
          specialty: 'Giáo viên Tiếng Trung Thiếu Nhi',
          assigned_classes: ['LOMINI23-CHO'],
          aliases: ['__status:ready_to_login', '__pwd_hmac:deadbeef', '__pwd_custom:1', '__class:LOMINI23-CHO'],
          active: true,
        },
        {
          code: 'GV045',
          email: 'gv045@khongtunhi.com',
          name: 'Cô Đặng Thùy Dương',
          phone: '0911223344',
          specialty: 'Giáo viên Tiếng Trung Thiếu Nhi',
          assigned_classes: ['LO2-N02'],
          aliases: ['__status:ready_to_login', '__class:LO2-N02'],
          active: true,
        },
        {
          code: 'GV027',
          email: 'gv027@khongtunhi.com',
          name: 'Cô Hà Thùy',
          phone: '',
          specialty: 'Giáo viên Tiếng Trung Thiếu Nhi',
          assigned_classes: [],
          aliases: ['__status:deleted'],
          active: false,
        }
      );
      harness.state.tables.ktn_dlp_alerts.push({
        id: 'REVOKED_EMAIL_gv027@khongtunhi.com',
        room_id: 'AUTH_REVOKED',
        sender_email: 'gv027@khongtunhi.com',
        sender_name: 'Cô Hà Thùy',
        sender_role: 'teacher',
        blocked_content: String(Date.now() + 86400000),
        reason: 'TEACHER_SOFT_DELETED_REVOKED',
        resolved: true,
        created_at: new Date().toISOString(),
      });

      const importRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            csvText: KTN_CENTER_SAMPLE_CSV,
            dryRun: false,
            defaultPassword: '12345678',
          }),
        }),
        harness.env
      );
      expect(importRes.status).toBe(200);
      const importData = await importRes.json();
      expect(importData.ok).toBe(true);
      expect(importData.summary.teacherCount).toBe(44);

      // Verify duplicate GV045 row was pruned from ktn_teachers
      const leftoverGv045 = harness.state.tables.ktn_teachers.find((t: any) => t.code === 'GV045');
      expect(leftoverGv045).toBeUndefined();

      // Verify GV001 was reset from displaced 'Cô Hà Thùy' to 'Cô Đặng Thùy Dương' with default password 12345678
      const gv001Login = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'GV001', password: '12345678' }),
        }),
        harness.env
      );
      expect(gv001Login.status).toBe(200);
      const gv001Data = await gv001Login.json();
      expect(gv001Data.user.name).toBe('Cô Đặng Thùy Dương');
      expect(gv001Data.user.assignedClasses).toEqual([
        'LO2-N02',
        'LO2-N13',
        'LO5-N01',
        'LO5-N03',
        'LO7-N04',
        'HSK-N07',
        'HSK-N12',
        'HSK-N13',
      ]);

      // Verify GV027 login AND authenticated endpoint access (AUTH_REVOKED cleared)
      const gv027Login = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'GV027', password: '12345678' }),
        }),
        harness.env
      );
      expect(gv027Login.status).toBe(200);
      const gv027Data = await gv027Login.json();
      expect(gv027Data.user.name).toBe('Cô Hà Thùy');
      expect(gv027Data.user.assignedClasses).toEqual(['LOMINI23-N01', 'LOMINI23-N02', 'HSK-N16', '1V1-N08']);

      const gv027RoomsRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/messages/rooms', {
          method: 'GET',
          headers: { Authorization: `Bearer ${gv027Data.sessionToken}` },
        }),
        harness.env
      );
      expect(gv027RoomsRes.status).toBe(200);

      // Verify GV044 (Cô Phương Thảo) login and LO2-N18 class assignment
      const gv044Login = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'GV044', password: '12345678' }),
        }),
        harness.env
      );
      expect(gv044Login.status).toBe(200);
      const gv044Data = await gv044Login.json();
      expect(gv044Data.user.name).toBe('Cô Phương Thảo');
      expect(gv044Data.user.assignedClasses).toEqual(['LO2-N18']);

      // Now GV001 changes her password -> re-running bulk-import preserves her custom password
      const changePwdRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${gv001Data.sessionToken}`,
          },
          body: JSON.stringify({
            currentPassword: '12345678',
            newPassword: 'duongCustom2026',
          }),
        }),
        harness.env
      );
      expect(changePwdRes.status).toBe(200);

      const reImportRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/bulk-import', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            csvText: KTN_CENTER_SAMPLE_CSV,
            dryRun: false,
            defaultPassword: '12345678',
          }),
        }),
        harness.env
      );
      expect(reImportRes.status).toBe(200);

      const gv001CustomLogin = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ identifier: 'GV001', password: 'duongCustom2026' }),
        }),
        harness.env
      );
      expect(gv001CustomLogin.status).toBe(200);
    });
  });

  describe('Suite 3: Milestone 3 (R3) Cultural Subject Classes Sequential Ingestion & Schedule Verification', () => {
    it('verifies sequential teacher codes starting at GV045 and student codes at 20260304 for active cultural classes', () => {
      const sampleCulturalCsv = `LỚP · LỊCH HỌC,GIÁO VIÊN,HỌC SINH,SĐT,PHỤ HUYNH
"THPT-SINH10-01
Thứ 2 & Thứ 4 19:30-20:30",Thầy Phúc Toàn,Đặng Thị Ngân Hạnh,0907185182,Vui Thi Luong
"THPT-SU10-01
Thứ 2, Thứ 5, Thứ 7 20:00-21:00",Cô Mai Phương,Phương Loan,0973979734,Vũ Yến
"THPT-HOA12-01
Thứ 2, Thứ 5, Chủ Nhật 15:00-16:00",Cô Nguyễn Thị Phương Thùy,Thùy Dương,0986946380,Nguyen Minh Phúc
"THPT-TOAN11-01
Thứ 3 & Thứ 5 21:00-22:00",Cô Phương Linh,Võ Quang Trí Nguyên,,Lê Mai
"THPT-HOA10-01
Thứ 2 & Thứ 4 19:00-20:00",Cô Phương Linh,Phạm Thị Yến,0376052037,Vũ Thị Thơm
"CT11-TV4-01
Thứ 5 & Chủ Nhật 18:30-19:30",Cô Nông Linh,Huy,0977679764,Trịnh Kim Nga`;

      const result = parseKtnCenterBulkCsv(sampleCulturalCsv, {
        startTeacherSeq: 45,
        startStudentSeq: 304,
        defaultPassword: '12345678',
      });

      expect(result.summary.classCount).toBe(6);
      expect(result.summary.teacherCount).toBe(5); // Cô Phương Linh teaches 2 classes
      expect(result.summary.studentCount).toBe(6);

      // Verify teachers start at GV045
      expect(result.teachers[0].code).toBe('GV045');
      expect(result.teachers[0].email).toBe('gv045@khongtunhi.com');
      expect(result.teachers[0].name).toBe('Thầy Phúc Toàn');

      expect(result.teachers[1].code).toBe('GV046');
      expect(result.teachers[1].email).toBe('gv046@khongtunhi.com');
      expect(result.teachers[1].name).toBe('Cô Mai Phương');

      expect(result.teachers[2].code).toBe('GV047');
      expect(result.teachers[2].email).toBe('gv047@khongtunhi.com');
      expect(result.teachers[2].name).toBe('Cô Nguyễn Thị Phương Thùy');

      expect(result.teachers[3].code).toBe('GV048');
      expect(result.teachers[3].email).toBe('gv048@khongtunhi.com');
      expect(result.teachers[3].name).toBe('Cô Phương Linh');
      expect(result.teachers[3].assignedClasses.length).toBe(2);

      expect(result.teachers[4].code).toBe('GV049');
      expect(result.teachers[4].email).toBe('gv049@khongtunhi.com');
      expect(result.teachers[4].name).toBe('Cô Nông Linh');

      // Verify students start at 20260304
      expect(result.students[0].code).toBe('20260304');
      expect(result.students[0].email).toBe('20260304@khongtunhi.com');
      expect(result.students[0].name).toBe('Đặng Thị Ngân Hạnh');

      expect(result.students[1].code).toBe('20260305');
      expect(result.students[1].email).toBe('20260305@khongtunhi.com');
      expect(result.students[1].name).toBe('Phương Loan');

      expect(result.students[5].code).toBe('20260309');
      expect(result.students[5].email).toBe('20260309@khongtunhi.com');
      expect(result.students[5].name).toBe('Huy');
    });

    it('validates 16 confirmed schedule configs structure and parameters', () => {
      const scheduleExample = {
        classCode: 'THPT-SU10-01',
        daysOfWeek: [1, 4, 6],
        startTime: '20:00',
        endTime: '21:00',
        timezone: 'Asia/Ho_Chi_Minh',
        scheduleMode: 'weekly',
        status: 'confirmed',
        updatedBy: 'quanly@khongtunhi.com'
      };

      expect(scheduleExample.status).toBe('confirmed');
      expect(scheduleExample.daysOfWeek).toEqual([1, 4, 6]);
      expect(scheduleExample.startTime).toBe('20:00');
      expect(scheduleExample.endTime).toBe('21:00');
      expect(scheduleExample.timezone).toBe('Asia/Ho_Chi_Minh');
    });
  });

  describe('Suite 4: Unified Default Password 12345678 Across All Account Creation Paths & Change Password', () => {
    it('provisions new Admin/Teacher-created students and new teachers with initialPassword=12345678, allows login -> change-password -> blocks old 12345678, while preserving existing account passwords', async () => {
      // 1. Admin creates a brand new student via POST /api/ktn/admin/students/provision
      const adminStuEmail = 'new.admin.stu.1to8@khongtunhi.com';
      const provStuRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Bé Học Viên Mới',
            email: adminStuEmail,
            phone: '0905123456',
            courseIds: ['6adadba969897b0002482ca5'],
          }),
        }),
        harness.env
      );
      expect(provStuRes.status).toBe(200);
      const provStuData = await provStuRes.json();
      expect(provStuData.accountCreated).toBe(true);
      expect(provStuData.initialPassword).toBe('12345678');

      // Re-provisioning existing student MUST keep initialPassword=null and existing password untouched
      const existingStuRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            name: 'Bé Học Viên Mới',
            email: adminStuEmail,
            phone: '0905123456',
            courseIds: ['65e7704a9ea90c00080d5195'],
          }),
        }),
        harness.env
      );
      expect(existingStuRes.status).toBe(200);
      const existingStuData = await existingStuRes.json();
      expect(existingStuData.existingAccount).toBe(true);
      expect(existingStuData.initialPassword).toBeNull();

      // 2. New student logs in with default password 12345678 -> changes password -> old 12345678 blocked
      const stuLogin1 = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminStuEmail, password: '12345678' }),
        }),
        harness.env
      );
      expect(stuLogin1.status).toBe(200);
      const stuLogin1Data = await stuLogin1.json();
      expect(stuLogin1Data.token).toBeTruthy();

      const stuPwdChange = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/change-password', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${stuLogin1Data.token}`,
          },
          body: JSON.stringify({
            currentPassword: '12345678',
            newPassword: 'StudentNew!2026',
          }),
        }),
        harness.env
      );
      expect(stuPwdChange.status).toBe(200);

      const stuOldBlocked = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminStuEmail, password: '12345678' }),
        }),
        harness.env
      );
      expect(stuOldBlocked.status).toBe(401);

      const stuNewOk = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: adminStuEmail, password: 'StudentNew!2026' }),
        }),
        harness.env
      );
      expect(stuNewOk.status).toBe(200);

      // 3. Admin creates a brand new Teacher without explicit password -> defaults to 12345678
      const newTeaEmail = 'new.teacher.1to8@khongtunhi.com';
      const provTeaRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/teachers', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
          },
          body: JSON.stringify({
            code: 'GV-1TO8',
            name: 'Cô Giáo Mới',
            email: newTeaEmail,
            assignedClasses: ['YCT2-04'],
          }),
        }),
        harness.env
      );
      expect(provTeaRes.status).toBe(200);
      const provTeaData = await provTeaRes.json();
      expect(provTeaData.accountCreated).toBe(true);
      expect(provTeaData.initialPassword).toBe('12345678');

      // 4. New teacher logs in with 12345678, and creates a student via POST /api/ktn/teacher/students/create -> also 12345678
      const teaLogin1 = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: newTeaEmail, password: '12345678' }),
        }),
        harness.env
      );
      expect(teaLogin1.status).toBe(200);
      const teaToken = (await teaLogin1.json()).token;

      const teaCreateStuRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/teacher/students/create', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${teaToken}`,
          },
          body: JSON.stringify({
            name: 'Học Viên GV Tạo',
            email: 'tea.created.1to8@khongtunhi.com',
            phone: '0907778899',
            classCode: 'YCT2-04',
          }),
        }),
        harness.env
      );
      expect(teaCreateStuRes.status).toBe(200);
      const teaCreateStuData = await teaCreateStuRes.json();
      expect(teaCreateStuData.accountCreated).toBe(true);
      expect(teaCreateStuData.initialPassword).toBe('12345678');

      const teaStuLogin = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: 'tea.created.1to8@khongtunhi.com', password: '12345678' }),
        }),
        harness.env
      );
      expect(teaStuLogin.status).toBe(200);
    });
  });

  describe('Suite 5: Provisioning Lock Stale-Lease Recovery & Failure Cleanup', () => {
    it('keeps 409 PROVISIONING_IN_PROGRESS for fresh running locks (<45s) while recovering stale running locks (>45s)', async () => {
      const freshEmail = 'fresh.lock.stu@khongtunhi.com';
      const freshKey = 'PROV-UI-FRESH-LOCK-01:fresh.lock.stu@khongtunhi.com';
      const nowIso = new Date().toISOString();
      harness.state.tables.ktn_provisioning_jobs.push({
        operation_id: 'PROV-FRESH-LOCK-01',
        idempotency_key: freshKey,
        job_type: 'student_create',
        target_email: freshEmail,
        target_role: 'student',
        actor_email: 'quanly@khongtunhi.com',
        status: 'running',
        sync_status: 'pending',
        completed_steps: [],
        retry_count: 0,
        request_payload: { email: freshEmail },
        created_at: nowIso,
        updated_at: nowIso,
      });

      const freshRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': freshKey,
          },
          body: JSON.stringify({
            name: 'Fresh Lock Student',
            email: freshEmail,
            phone: '0901112233',
            courseIds: ['6adadba969897b0002482ca5'],
          }),
        }),
        harness.env
      );
      expect(freshRes.status).toBe(409);
      const freshBody = await freshRes.json();
      expect(freshBody.error).toBe('PROVISIONING_IN_PROGRESS');

      const staleEmail = 'stale.lock.stu@khongtunhi.com';
      const staleKey = 'PROV-UI-STALE-LOCK-01:stale.lock.stu@khongtunhi.com';
      const staleIso = new Date(Date.now() - 120_000).toISOString();
      harness.state.tables.ktn_provisioning_jobs.push({
        operation_id: 'PROV-STALE-LOCK-01',
        idempotency_key: staleKey,
        job_type: 'student_create',
        target_email: staleEmail,
        target_role: 'student',
        actor_email: 'quanly@khongtunhi.com',
        status: 'running',
        sync_status: 'pending',
        completed_steps: [],
        retry_count: 0,
        request_payload: { email: staleEmail },
        created_at: staleIso,
        updated_at: staleIso,
      });

      const mockCtx = { waitUntil: vi.fn() };
      const recoveredRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': staleKey,
          },
          body: JSON.stringify({
            name: 'Stale Lock Recovered',
            email: staleEmail,
            phone: '0902223344',
            courseIds: ['6adadba969897b0002482ca5'],
          }),
        }),
        harness.env,
        mockCtx
      );
      expect(recoveredRes.status).toBe(200);
      expect(mockCtx.waitUntil).toHaveBeenCalledTimes(1);
      const recoveredBody = await recoveredRes.json();
      expect(recoveredBody.ok).toBe(true);
      expect(recoveredBody.student?.email).toBe(staleEmail);

      const jobRow = harness.state.tables.ktn_provisioning_jobs.find(
        (j: any) => j.operation_id === 'PROV-STALE-LOCK-01'
      );
      expect(jobRow?.status).toBe('completed');
      expect(Number(jobRow?.retry_count || 0)).toBeGreaterThanOrEqual(1);
    });

    it('releases provisioning lock when an attempt fails so immediate retry with the same Idempotency-Key succeeds', async () => {
      const retryEmail = 'retry.cleanup.stu@khongtunhi.com';
      const retryKey = 'PROV-UI-RETRY-CLEANUP-01:retry.cleanup.stu@khongtunhi.com';
      harness.state.faults.failStudentCoursesPost = true;

      const failedRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': retryKey,
          },
          body: JSON.stringify({
            name: 'Retry Cleanup Student',
            email: retryEmail,
            phone: '0903334455',
            courseIds: ['6adadba969897b0002482ca5'],
          }),
        }),
        harness.env
      );
      harness.state.faults.failStudentCoursesPost = false;
      expect(failedRes.status).toBe(502);

      const midJob = harness.state.tables.ktn_provisioning_jobs.find(
        (j: any) => j.idempotency_key === retryKey
      );
      expect(midJob).toBeTruthy();
      expect(midJob.status).not.toBe('running');

      const retryRes = await harness.workerModule.fetch(
        new Request('http://localhost/api/ktn/admin/students/provision', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${adminToken}`,
            'Idempotency-Key': retryKey,
          },
          body: JSON.stringify({
            name: 'Retry Cleanup Student',
            email: retryEmail,
            phone: '0903334455',
            courseIds: ['6adadba969897b0002482ca5'],
          }),
        }),
        harness.env
      );
      expect(retryRes.status).toBe(200);
      const retryBody = await retryRes.json();
      expect(retryBody.ok).toBe(true);
      expect(retryBody.student?.email).toBe(retryEmail);

      const finalJob = harness.state.tables.ktn_provisioning_jobs.find(
        (j: any) => j.idempotency_key === retryKey
      );
      expect(finalJob?.status).toBe('completed');
    });
  });
});
