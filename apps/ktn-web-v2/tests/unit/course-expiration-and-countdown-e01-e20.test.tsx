import React from 'react';
import crypto from 'node:crypto';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
// @ts-ignore
import { createLocalWorkerHarness } from '../../server/local-worker-middleware.mjs';

async function signTestSessionToken(
  payload: Record<string, any>,
  secret = 'ktn-v2-local-hmac-secret-2026'
) {
  const jti =
    payload.jti || 'sess_' + Date.now() + '_' + Math.random().toString(36).slice(2, 10);
  const data = {
    ...payload,
    jti,
    iat: Date.now(),
    exp: Date.now() + 30 * 86400 * 1000,
  };
  const bodyB64 = Buffer.from(JSON.stringify(data)).toString('base64url');
  const sigB64 = crypto.createHmac('sha256', secret).update(bodyB64).digest('base64url');
  return `${bodyB64}.${sigB64}`;
}
import {
  addPresetToCalendarDate,
  computeCourseExpirationInfo,
  getHoChiMinhCalendarDateString,
  toIzTeachExpiresAtIso,
} from '../../src/lib/utils';
import {
  getServerNowMs,
  ktnApi,
  setSimulatedServerNowForTest,
  updateServerClockFromIso,
} from '../../src/services/api/ktnApiClient';
import { StudentDetailDrawer } from '../../src/features/admin/components/StudentDetailDrawer';
import { OrderDetailDrawer } from '../../src/features/admin/components/OrderDetailDrawer';
import { StudentHome } from '../../src/features/dashboard/components/StudentHome';
import { LearningPage } from '../../src/features/learning/components/LearningPage';
import { useAuthStore } from '../../src/stores/useAuthStore';
import { useUiStore } from '../../src/stores/useUiStore';
import { DEMO_CLASSES, DEMO_COURSES } from '../../src/lib/demoData';
import type { KtnOrder, KtnStudentRecord } from '../../src/types/ktn.types';

const COURSE_HSK1_ID = '6adadba969897b0002482ca5';
const COURSE_CFK_ID = '65e7704a9ea90c00080d5195';
const COURSE_MINI1_ID = '65e7636a0a1b61000825c2ef';

describe('KTN × izTeach Course Expiration & Live Countdown Suite (E01–E20)', () => {
  let harness: any;
  let adminToken: string;
  let studentToken: string;
  let queryClient: QueryClient;
  const originalFetch = globalThis.fetch;

  beforeEach(async () => {
    vi.restoreAllMocks();
    setSimulatedServerNowForTest(null);
    harness = createLocalWorkerHarness();
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false, gcTime: 0 },
        mutations: { retry: false },
      },
    });

    adminToken = await signTestSessionToken({
      id: 'ADMIN-E2E-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    studentToken = await signTestSessionToken({
      id: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      cognitoUserId: 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68',
      email: 'hoangngan@khongtunhi.com',
      name: 'Bé Nguyễn Hoàng Ngân',
      role: 'student',
      roles: ['student'],
      onlineCourses: [
        {
          id: COURSE_HSK1_ID,
          code: 'HSK1-30',
          title: 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
          shortTitle: 'HSK1 3.0',
          limitTime: null,
          expiresAt: null,
          isExpired: false,
        },
      ],
    });
  });

  afterEach(() => {
    setSimulatedServerNowForTest(null);
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function callWorker(
    path: string,
    options: {
      method?: string;
      token?: string;
      body?: unknown;
      simulatedNowIso?: string;
    } = {}
  ) {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (options.token) {
      headers.Authorization = `Bearer ${options.token}`;
    }
    if (options.simulatedNowIso) {
      headers['X-KTN-QA-Simulated-Now'] = options.simulatedNowIso;
    }
    const req = new Request(`http://localhost${path}`, {
      method: options.method || 'GET',
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
    const res = await harness.workerModule.fetch(req, harness.env);
    const data = await res.json();
    return { status: res.status, data };
  }

  // =========================================================================
  // E01–E06: 6 DURATION PRESETS (1w, 2w, 1m, 2m, 3m, unlimited)
  // =========================================================================
  it('E01: Grants course with 1 week (1w = 7 calendar days) and syncs with izTeach + Supabase', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        action: 'grant',
        email: 'minhkhang@khongtunhi.com',
        courseIds: [COURSE_HSK1_ID],
        durationPreset: '1w',
        durationMode: 'set_from_now',
      },
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.syncStatus).toBe('synced');
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse).toBeDefined();
    expect(hskCourse.limitTime).toBe('2026-11-18');
    expect(hskCourse.expiresAt).toBe('2026-11-18T23:59:59.999Z');
    expect(hskCourse.durationPreset).toBe('1w');
    expect(hskCourse.isExpired).toBe(false);
    expect(hskCourse.userPermissionId).toBeTruthy();
  });

  it('E02: Grants course with 2 weeks (2w = 14 calendar days)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        action: 'grant',
        email: 'minhkhang@khongtunhi.com',
        courseIds: [COURSE_HSK1_ID],
        durationPreset: '2w',
      },
    });

    expect(status).toBe(200);
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse.limitTime).toBe('2026-11-25');
    expect(hskCourse.durationPreset).toBe('2w');
  });

  it('E03: Grants course with 1 calendar month (1m)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        action: 'grant',
        email: 'minhkhang@khongtunhi.com',
        courseIds: [COURSE_HSK1_ID],
        durationPreset: '1m',
      },
    });

    expect(status).toBe(200);
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse.limitTime).toBe('2026-12-11');
    expect(hskCourse.durationPreset).toBe('1m');
  });

  it('E04: Grants course with 2 calendar months (2m)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        action: 'grant',
        email: 'minhkhang@khongtunhi.com',
        courseIds: [COURSE_HSK1_ID],
        durationPreset: '2m',
      },
    });

    expect(status).toBe(200);
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse.limitTime).toBe('2027-01-11');
    expect(hskCourse.durationPreset).toBe('2m');
  });

  it('E05: Grants course with 3 calendar months (3m)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        action: 'grant',
        email: 'minhkhang@khongtunhi.com',
        courseIds: [COURSE_HSK1_ID],
        durationPreset: '3m',
      },
    });

    expect(status).toBe(200);
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse.limitTime).toBe('2027-02-11');
    expect(hskCourse.durationPreset).toBe('3m');
  });

  it('E06: Grants and resets course to unlimited (limitTime: null, Vĩnh viễn)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    // First set 1m
    await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
      },
    });

    // Then set unlimited
    const { status, data } = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: 'unlimited',
        mode: 'set_from_now',
      },
    });

    expect(status).toBe(200);
    expect(data.ok).toBe(true);
    expect(data.limitTime).toBeNull();
    expect(data.expiresAt).toBeNull();
    const hskCourse = data.student.online_courses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskCourse.limitTime).toBeNull();
    expect(hskCourse.isExpired).toBe(false);
    expect(hskCourse.durationPreset).toBe('unlimited');
  });

  // =========================================================================
  // E07 & E08: ADMIN UPDATES DURATION & EXTENDS EXPIRING COURSE
  // =========================================================================
  it('E07: Admin changes duration via POST /api/ktn/admin/students/course-duration and StudentDetailDrawer UI', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const { status, data } = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '2w',
        mode: 'set_from_now',
        clientRequestId: 'REQ-E07-01',
      },
    });

    expect(status).toBe(200);
    expect(data.limitTime).toBe('2026-11-25');
    expect(data.syncStatus).toBe('synced');

    // Verify Admin StudentDetailDrawer compact display & renewal UI
    setSimulatedServerNowForTest(Date.parse(simulatedNow));
    const onSetCourseDuration = vi.fn().mockResolvedValue({});
    render(
      <StudentDetailDrawer
        student={data.student}
        open={true}
        onClose={vi.fn()}
        catalogCourses={DEMO_COURSES}
        catalogError={false}
        catalogLoading={false}
        onRetryCatalog={vi.fn()}
        classesList={DEMO_CLASSES}
        actionError={null}
        onClearError={vi.fn()}
        isGrantingCourse={false}
        isRevokingCourse={false}
        isSettingCourseDuration={false}
        isAssigningClass={false}
        isReplacingCourses={false}
        isUpdatingProfile={false}
        isResyncing={false}
        onGrantCourses={vi.fn()}
        onRevokeCourse={vi.fn()}
        onSetCourseDuration={onSetCourseDuration}
        onAssignClass={vi.fn()}
        onReplaceAllCourses={vi.fn()}
        onUpdateProfile={vi.fn()}
        onResyncStudent={vi.fn()}
        onCopyEmail={vi.fn()}
      />
    );

    const summaryEl = screen.getByTestId(`drawer-granted-course-summary-${COURSE_HSK1_ID}`);
    expect(summaryEl.textContent).toContain('HSK1 3.0 · Còn 15 ngày');
    expect(screen.getByTestId(`drawer-granted-course-status-${COURSE_HSK1_ID}`).textContent).toBe('Còn hạn');

    // Click "Gia hạn"
    fireEvent.click(screen.getByTestId(`drawer-renew-course-btn-${COURSE_HSK1_ID}`));
    expect(screen.getByTestId(`drawer-renew-panel-${COURSE_HSK1_ID}`)).toBeInTheDocument();
    fireEvent.click(screen.getByTestId(`drawer-renew-preset-${COURSE_HSK1_ID}-1m`));
    fireEvent.click(screen.getByTestId(`drawer-renew-mode-reset-${COURSE_HSK1_ID}`));
    fireEvent.click(screen.getByTestId(`drawer-save-duration-btn-${COURSE_HSK1_ID}`));

    await waitFor(() => {
      expect(onSetCourseDuration).toHaveBeenCalledWith({
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
      });
    });
  });

  it('E08: Extends an expiring course from its current limitTime (extend_from_current) without losing remaining days', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    // Step 1: Set 1 week from 2026-11-11 -> 2026-11-18
    await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1w',
        mode: 'set_from_now',
      },
    });

    // Step 2: Extend by 1m from current limitTime (2026-11-18) -> 2026-12-18
    const { status, data } = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'extend_from_current',
      },
    });

    expect(status).toBe(200);
    expect(data.anchorDate).toBe('2026-11-18');
    expect(data.limitTime).toBe('2026-12-18');
  });

  // =========================================================================
  // E09: STUDENT COUNTDOWN DISPLAY & SERVER-SYNCED CLOCK
  // =========================================================================
  it('E09: Displays exact student countdown formats (>7d, <=7d live HH:MM:SS, unlimited, expired) from server clock without polling API every second', async () => {
    const serverNowMs = Date.parse('2026-11-11T09:37:50.000Z');
    setSimulatedServerNowForTest(serverNowMs);

    // 1. > 7 days remaining (28 days)
    const exp28d = computeCourseExpirationInfo(
      { limitTime: '2026-12-09', expiresAt: '2026-12-09T23:59:59.999Z', isExpired: false },
      getServerNowMs()
    );
    expect(exp28d.studentCardText).toBe('Thời hạn học: còn 29 ngày');

    // 2. <= 7 days remaining (5 days 14:22:09)
    const targetRemainingMs = (5 * 86400 + 14 * 3600 + 22 * 60 + 9) * 1000;
    const customNowMs = Date.parse('2026-11-18T23:59:59.999Z') - targetRemainingMs;
    const expSoon = computeCourseExpirationInfo(
      { limitTime: '2026-11-18', expiresAt: '2026-11-18T23:59:59.999Z', isExpired: false },
      customNowMs
    );
    expect(expSoon.studentCardText).toBe('Sắp hết hạn · 05 ngày 14:22:09');

    // 1 second later -> 05 ngày 14:22:08
    const expSoonNextSec = computeCourseExpirationInfo(
      { limitTime: '2026-11-18', expiresAt: '2026-11-18T23:59:59.999Z', isExpired: false },
      customNowMs + 1000
    );
    expect(expSoonNextSec.studentCardText).toBe('Sắp hết hạn · 05 ngày 14:22:08');

    // 3. Unlimited
    const expUnlimited = computeCourseExpirationInfo(
      { limitTime: null, expiresAt: null, isExpired: false },
      customNowMs
    );
    expect(expUnlimited.studentCardText).toBe('Không giới hạn thời gian');

    // 4. Expired
    const expExpired = computeCourseExpirationInfo(
      { limitTime: '2026-11-10', expiresAt: '2026-11-10T23:59:59.999Z', isExpired: true },
      Date.parse('2026-11-11T10:00:00Z')
    );
    expect(expExpired.studentCardText).toBe('Đã hết hạn · Gia hạn');
  });

  // =========================================================================
  // E10, E11, E12, E13: SERVER-SIDE EXPIRATION BLOCKING, OLD SESSION, NO ADMIN FALLBACK, RENEWAL RECOVERY
  // =========================================================================
  it('E10 & E11 & E12 & E13: Enforces 403 COURSE_EXPIRED on server, blocks old sessions & Admin fallback, and restores access immediately upon renewal while preserving progress & homeworks', async () => {
    const grantTimeIso = '2026-11-11T10:00:00+07:00';
    // Set HSK1 3.0 to 1 week (expires 2026-11-18T23:59:59.999Z)
    const setRes = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: grantTimeIso,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1w',
        mode: 'set_from_now',
      },
    });
    expect(setRes.status).toBe(200);
    expect(setRes.data.limitTime).toBe('2026-11-18');

    // Before expiration (on 2026-11-18 12:00 VN time, inclusive of end date): student can access units
    const beforeExpUnits = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-18T12:00:00+07:00',
      }
    );
    expect(beforeExpUnits.status).toBe(200);
    expect(beforeExpUnits.data.ok).toBe(true);
    expect(Array.isArray(beforeExpUnits.data.units)).toBe(true);
    expect(beforeExpUnits.data.units.length).toBeGreaterThan(0);

    // E10 & E11: After expiration (2026-11-20), using the OLD studentToken (which had isExpired: false in its payload!)
    // Server MUST verify live permission expiration and return 403 COURSE_EXPIRED (E10, E11)
    // And MUST NOT leak full video URLs via Admin token fallback (E12)
    const afterExpUnits = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-20T10:00:00+07:00',
      }
    );
    expect(afterExpUnits.status).toBe(403);
    expect(afterExpUnits.data.ok).toBe(false);
    expect(afterExpUnits.data.code).toBe('COURSE_EXPIRED');
    expect(afterExpUnits.data.units).toBeUndefined();

    // Verify /api/ktn/auth/session also refreshes live expiration status on old session
    const authMeExpired = await callWorker('/api/ktn/auth/session', {
      token: studentToken,
      simulatedNowIso: '2026-11-20T10:00:00+07:00',
    });
    expect(authMeExpired.status).toBe(200);
    const meHsk = authMeExpired.data.user.onlineCourses.find(
      (c: any) => c.id === COURSE_HSK1_ID
    );
    expect(meHsk.isExpired).toBe(true);
    expect(meHsk.limitTime).toBe('2026-11-18');

    // E13: Admin renews course on 2026-11-20 for 1 month -> 2026-12-20
    const renewRes = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: '2026-11-20T10:00:00+07:00',
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
      },
    });
    expect(renewRes.status).toBe(200);
    expect(renewRes.data.limitTime).toBe('2026-12-20');

    // Student with the SAME account/session immediately regains full access without creating a new account
    const reopenedUnits = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-20T10:05:00+07:00',
      }
    );
    expect(reopenedUnits.status).toBe(200);
    expect(reopenedUnits.data.ok).toBe(true);
    expect(reopenedUnits.data.units.length).toBeGreaterThan(0);

    // Existing submitted homeworks are untouched
    const hwRes = await callWorker('/api/ktn/homeworks', {
      token: studentToken,
      simulatedNowIso: '2026-11-20T10:05:00+07:00',
    });
    expect(hwRes.status).toBe(200);
    expect(hwRes.data.homeworks.length).toBeGreaterThan(0);
  });

  // =========================================================================
  // E14 & E15: IZTEACH/SUPABASE FAILURE HANDLING & IDEMPOTENT RETRY
  // =========================================================================
  it('E14 & E15: Never reports false success when izTeach or Supabase fails, records partial_failure, and retries safely without double-adding months', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';

    // E14 Part A: izTeach set-limited-time fails -> returns 502 IZTEACH_SET_LIMITED_TIME_FAILED (never fake 200)
    harness.state.faults.failSetLimitedTime = true;
    const izFailRes = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
      },
    });
    expect(izFailRes.status).toBe(502);
    expect(izFailRes.data.ok).toBe(false);
    expect(izFailRes.data.code).toBe('IZTEACH_SET_LIMITED_TIME_FAILED');
    harness.state.faults.failSetLimitedTime = false;

    // E14 Part B: izTeach succeeds (sets 2026-12-11), but Supabase PATCH fails -> returns 502 partial_failure
    harness.state.faults.failStudentSupabasePatch = true;
    const partialRes = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
        clientRequestId: 'REQ-PARTIAL-E14',
      },
    });
    expect([207, 502]).toContain(partialRes.status);
    expect(partialRes.data.ok).toBe(false);
    expect(partialRes.data.syncStatus).toBe('partial_failure');
    expect(partialRes.data.limitTime).toBe('2026-12-11');

    // E15 Part A: Restore Supabase and retry via sync-retry (type: course_duration) -> reconciles to 2026-12-11, NEVER adds another month to 2027-01-11!
    harness.state.faults.failStudentSupabasePatch = false;
    const retrySyncRes = await callWorker('/api/ktn/admin/sync-retry', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        type: 'course_duration',
        email: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'extend_from_current',
        limitTime: partialRes.data.limitTime,
      },
    });
    expect(retrySyncRes.status).toBe(200);
    expect(retrySyncRes.data.ok).toBe(true);
    expect(retrySyncRes.data.syncStatus).toBe('synced');
    expect(retrySyncRes.data.limitTime).toBe('2026-12-11');

    // E15 Part B: Duplicate clientRequestId with extend_from_current returns idempotent cached result without adding another month
    const firstExtend = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'extend_from_current',
        clientRequestId: 'REQ-IDEMPOTENT-E15',
      },
    });
    expect(firstExtend.status).toBe(200);
    expect(firstExtend.data.limitTime).toBe('2027-01-11');

    const duplicateExtend = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'extend_from_current',
        clientRequestId: 'REQ-IDEMPOTENT-E15',
      },
    });
    expect(duplicateExtend.status).toBe(200);
    expect(duplicateExtend.data.idempotentReplay).toBe(true);
    expect(duplicateExtend.data.limitTime).toBe('2027-01-11');
  });

  // =========================================================================
  // E16: ORDER APPROVAL WITH DURATION PRESET
  // =========================================================================
  it('E16: Approves order with selected durationPreset (2m), sets limitTime on izTeach, and displays Đã cấp thành công (or Cần hoàn tất đồng bộ thời hạn on partial failure)', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    // Create an order for minhkhang@khongtunhi.com
    const createOrd = await callWorker('/api/ktn/orders', {
      method: 'POST',
      simulatedNowIso: simulatedNow,
      body: {
        studentName: 'Bé Trần Minh Khang',
        parentName: 'PH Minh Khang',
        studentEmail: 'minhkhang@khongtunhi.com',
        phone: '0912345604',
        courseId: COURSE_HSK1_ID,
      },
    });
    expect(createOrd.status).toBe(200);
    const orderId = createOrd.data.orderId;

    // Mark order as called + paid so it is ready for activation
    await callWorker('/api/ktn/orders/update', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        orderId,
        contactStatus: 'called',
        contactNote: 'Đã gọi xác nhận gói 2 tháng',
        paymentDetailedStatus: 'verified_paid',
        paymentTxRef: 'VCB-E16-001',
        paymentReceivedAmount: createOrd.data.order.amount,
      },
    });

    // Approve order with durationPreset: '2m'
    const approveRes = await callWorker('/api/ktn/orders/approve', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        orderId,
        confirmActivation: true,
        studentEmail: 'minhkhang@khongtunhi.com',
        durationPreset: '2m',
      },
    });

    expect(approveRes.status).toBe(200);
    expect(approveRes.data.ok).toBe(true);
    expect(approveRes.data.syncStatus).toBe('synced');
    expect(approveRes.data.durationPreset).toBe('2m');
    expect(approveRes.data.limitTime).toBe('2027-01-11');
    expect(approveRes.data.message).toContain('Đã cấp thành công');

    // Verify OrderDetailDrawer UI shows "Cần hoàn tất đồng bộ thời hạn" if provisioning_status is partial_failure
    const partialOrder: KtnOrder = {
      ...createOrd.data.order,
      approval_status: 'approved',
      payment_status: 'paid',
      payment_detailed_status: 'verified_paid',
      contact_status: 'called',
      provisioning_status: 'partial_failure',
      account_detailed_status: 'sync_error',
      duration_preset: '2m',
    };

    render(
      <OrderDetailDrawer
        order={partialOrder}
        open={true}
        onClose={vi.fn()}
        classesList={DEMO_CLASSES}
        isUpdatingOrder={false}
        isApprovingOrder={false}
        actionError={null}
        onClearError={vi.fn()}
        onUpdateOrder={vi.fn()}
        onApproveOrder={vi.fn()}
        onOpenStudentProfile={vi.fn()}
      />
    );

    expect(screen.getByTestId('order-grant-sync-status-badge').textContent).toBe(
      'Cần hoàn tất đồng bộ thời hạn'
    );
  });

  // =========================================================================
  // E17: COURSE ISOLATION (CHANGING COURSE A DOES NOT AFFECT COURSE B)
  // =========================================================================
  it('E17: Changing duration of Course A (HSK1 3.0) preserves Course B (Chinese For Kids) metadata and limitTime untouched', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';
    // Set Course B (CFK) to 3m -> 2027-02-11
    const resB = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_CFK_ID,
        preset: '3m',
        mode: 'set_from_now',
      },
    });
    expect(resB.status).toBe(200);
    expect(resB.data.limitTime).toBe('2027-02-11');

    // Set Course A (HSK1) to 1w -> 2026-11-18
    const resA = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1w',
        mode: 'set_from_now',
      },
    });
    expect(resA.status).toBe(200);
    expect(resA.data.limitTime).toBe('2026-11-18');

    const courses = resA.data.student.online_courses;
    const courseA = courses.find((c: any) => c.id === COURSE_HSK1_ID);
    const courseB = courses.find((c: any) => c.id === COURSE_CFK_ID);

    expect(courseA.limitTime).toBe('2026-11-18');
    expect(courseA.durationPreset).toBe('1w');
    expect(courseB.limitTime).toBe('2027-02-11');
    expect(courseB.durationPreset).toBe('3m');

    // On 2026-11-25: Course A is expired (403 COURSE_EXPIRED), while Course B is still active (200 OK)
    const unitsA = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-25T10:00:00+07:00',
      }
    );
    expect(unitsA.status).toBe(403);
    expect(unitsA.data.code).toBe('COURSE_EXPIRED');

    const unitsB = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_CFK_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-25T10:00:00+07:00',
      }
    );
    expect(unitsB.status).toBe(200);
    expect(unitsB.data.ok).toBe(true);
  });

  // =========================================================================
  // E18: END-OF-MONTH CLAMPING, LEAP YEAR & ASIA/HO_CHI_MINH TIMEZONE
  // =========================================================================
  it('E18: Handles end-of-month (29/30/31), leap year (2028-02-29), and Asia/Ho_Chi_Minh timezone boundaries accurately', async () => {
    // Pure calendar arithmetic checks
    expect(addPresetToCalendarDate('2026-01-31', '1m')).toBe('2026-02-28'); // non-leap year Feb
    expect(addPresetToCalendarDate('2028-01-31', '1m')).toBe('2028-02-29'); // leap year Feb
    expect(addPresetToCalendarDate('2026-03-31', '1m')).toBe('2026-04-30'); // 30-day month
    expect(addPresetToCalendarDate('2026-03-31', '2m')).toBe('2026-05-31'); // 31-day month
    expect(addPresetToCalendarDate('2025-11-30', '3m')).toBe('2026-02-28'); // cross-year to Feb
    expect(addPresetToCalendarDate('2026-01-25', '1w')).toBe('2026-02-01');
    expect(addPresetToCalendarDate('2026-01-25', '2w')).toBe('2026-02-08');

    // Timezone check: 2026-01-30T20:30:00Z is 2026-01-31 03:30:00 in Asia/Ho_Chi_Minh!
    const vnDate = getHoChiMinhCalendarDateString(Date.parse('2026-01-30T20:30:00.000Z'));
    expect(vnDate).toBe('2026-01-31');

    // Backend check at 2026-01-30T20:30:00Z (= 2026-01-31 VN time) + 1m -> 2026-02-28
    const { status, data } = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: '2026-01-30T20:30:00.000Z',
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1m',
        mode: 'set_from_now',
      },
    });
    expect(status).toBe(200);
    expect(data.limitTime).toBe('2026-02-28');
  });

  // =========================================================================
  // E19: MULTIPLE PERMISSIONS FOR THE SAME COURSE
  // =========================================================================
  it('E19: Updates all duplicate permission records for the same course so no leftover permission bypasses expiration', async () => {
    const uid = 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68';
    // Inject a second duplicate permission record for COURSE_HSK1_ID on the same student
    harness.state.izteach.permissionRecordsByUid[uid] = [
      {
        _id: 'perm_dup_1',
        id: 'perm_dup_1',
        userId: uid,
        limitTime: null,
        isExpired: false,
        onlineCourses: [COURSE_HSK1_ID],
      },
      {
        _id: 'perm_dup_2',
        id: 'perm_dup_2',
        userId: uid,
        limitTime: null,
        isExpired: false,
        onlineCourses: [COURSE_HSK1_ID],
      },
    ];

    const simulatedNow = '2026-11-11T10:00:00+07:00';
    const res = await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '1w',
        mode: 'set_from_now',
      },
    });

    expect(res.status).toBe(200);
    expect(res.data.updatedPermissionIds).toEqual(['perm_dup_1', 'perm_dup_2']);

    // Both permission records must now have limitTime 2026-11-18T23:59:59.999Z
    const recs = harness.state.izteach.permissionRecordsByUid[uid];
    expect(recs[0].limitTime).toBe('2026-11-18T23:59:59.999Z');
    expect(recs[1].limitTime).toBe('2026-11-18T23:59:59.999Z');

    // After 2026-11-18, course is strictly expired
    const unitsAfter = await callWorker(
      `/api/ktn/courses/units?courseId=${COURSE_HSK1_ID}`,
      {
        token: studentToken,
        simulatedNowIso: '2026-11-20T10:00:00+07:00',
      }
    );
    expect(unitsAfter.status).toBe(403);
    expect(unitsAfter.data.code).toBe('COURSE_EXPIRED');
  });

  // =========================================================================
  // E20: EXISTING STUDENTS & PROFILE UPDATES PRESERVE DURATION
  // =========================================================================
  it('E20: Existing students with limitTime: null remain unlimited, and Admin profile/class edits never shorten or overwrite course durations', async () => {
    const simulatedNow = '2026-11-11T10:00:00+07:00';

    // 1. Existing student taphong2002@gmail.com has limitTime: null -> treated as unlimited
    const taphongToken = await signTestSessionToken({
      id: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
      cognitoUserId: 'bc21991c-ce9b-465d-b85f-dbb1821e51a9',
      email: 'taphong2002@gmail.com',
      name: 'Tạ Phong Võ',
      role: 'student',
      roles: ['student'],
    });
    const meRes = await callWorker('/api/ktn/auth/session', {
      token: taphongToken,
      simulatedNowIso: '2028-05-01T10:00:00+07:00',
    });
    expect(meRes.status).toBe(200);
    const hskEnt = meRes.data.user.onlineCourses.find((c: any) => c.id === COURSE_HSK1_ID);
    expect(hskEnt.limitTime).toBeNull();
    expect(hskEnt.isExpired).toBe(false);

    // 2. Set hoangngan's HSK1 to 3m (2027-02-11), then Admin updates profile & class -> duration MUST remain 2027-02-11
    await callWorker('/api/ktn/admin/students/course-duration', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: simulatedNow,
      body: {
        studentEmail: 'hoangngan@khongtunhi.com',
        courseId: COURSE_HSK1_ID,
        preset: '3m',
        mode: 'set_from_now',
      },
    });

    const profileRes = await callWorker('/api/ktn/admin/students/provision', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: '2026-11-25T10:00:00+07:00',
      body: {
        email: 'hoangngan@khongtunhi.com',
        name: 'Bé Nguyễn Hoàng Ngân (Cập nhật)',
        phone: '0912345601',
        parentName: 'Chị Lan PH',
      },
    });
    expect(profileRes.status).toBe(200);
    const afterProfileHsk = profileRes.data.student.online_courses.find(
      (c: any) => c.id === COURSE_HSK1_ID
    );
    expect(afterProfileHsk.limitTime).toBe('2027-02-11');
    expect(afterProfileHsk.durationPreset).toBe('3m');

    const assignClassRes = await callWorker('/api/ktn/students/courses', {
      method: 'POST',
      token: adminToken,
      simulatedNowIso: '2026-11-25T10:00:00+07:00',
      body: {
        action: 'assign_class',
        email: 'hoangngan@khongtunhi.com',
        classCode: 'YCT3-02',
      },
    });
    expect(assignClassRes.status).toBe(200);
    const afterClassHsk = assignClassRes.data.student.online_courses.find(
      (c: any) => c.id === COURSE_HSK1_ID
    );
    expect(afterClassHsk.limitTime).toBe('2027-02-11');
  });
});
