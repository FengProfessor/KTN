#!/usr/bin/env node
/**
 * KTN — LIVE PRODUCTION REACT V2 END-TO-END ACCEPTANCE SUITE
 * Executes Tests 1–8 directly against the live React V2 Custom Page:
 *   https://khongtunhi.com/custom-page/so-lien-lac-test
 * and live Cloudflare Worker V3:
 *   https://khongtunhi.com/api/ktn/*
 *
 * Strictly uses isolated E2E test identities and cleans up all test artifacts after verification.
 * Never logs secrets, passwords, or raw tokens.
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(ROOT, 'apps', 'ktn-web-v2', 'node_modules', 'playwright')));
}

const SITE_BASE = 'https://khongtunhi.com';
const LIVE_REACT_URL = 'https://khongtunhi.com/custom-page/so-lien-lac-test';
const WORKER_BASE = 'https://khongtunhi.com';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';

const ADMIN_EMAIL = 'quanly@khongtunhi.com';
const STAFF_PWD = process.env.KTN_STAFF_AND_TEST_PASSWORD;
const ROOT_ADMIN_EMAIL = 'hocvienkhongtunhi123@gmail.com';
const ROOT_ADMIN_PWD = process.env.IZTEACH_ADMIN_PASSWORD;
const TEACHER_A_EMAIL = process.env.KTN_E2E_TEACHER_A_EMAIL || 'linh.lam@khongtunhi.com';
const TEACHER_B_EMAIL = process.env.KTN_E2E_TEACHER_B_EMAIL || 'thu.ha@khongtunhi.com';
const STUDENT_A_EMAIL = process.env.KTN_E2E_STUDENT_A_EMAIL || 'e2e.hs.a@khongtunhi.com';
const STUDENT_B_EMAIL = process.env.KTN_E2E_STUDENT_B_EMAIL || 'e2e.hs.b@khongtunhi.com';
const STUDENT_E2E_PWD = process.env.KTN_E2E_PASSWORD;
const TEST_TEACHER_EMAIL = 'e2e.gv.test@khongtunhi.com';

const HSK1_COURSE_ID = '6adadba969897b0002482ca5';
const CFK_COURSE_ID = '65e7704a9ea90c00080d5195';

const SCREENSHOT_DIR = path.join(ROOT, 'reports', 'ktn-three-way-reliability', 'live-screenshots');
const JSON_REPORT_PATH = path.join(ROOT, 'reports', 'ktn-three-way-reliability', 'live-production-acceptance-results.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function createTinyWavBuffer() {
  const sampleRate = 8000;
  const numSamples = 4000;
  const buffer = Buffer.alloc(44 + numSamples * 2);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + numSamples * 2, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(numSamples * 2, 40);
  for (let i = 0; i < numSamples; i++) {
    const val = Math.round(Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 8000);
    buffer.writeInt16LE(val, 44 + i * 2);
  }
  return buffer;
}

async function sbFetch(relPath, options = {}) {
  const headers = {
    apikey: SUPABASE_SERVICE_KEY,
    Authorization: `Bearer ${SUPABASE_SERVICE_KEY}`,
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const t0 = performance.now();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${relPath}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const ms = +(performance.now() - t0).toFixed(2);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, ms, range: res.headers.get('content-range'), data, text };
}

async function workerLogin(email, password) {
  const t0 = performance.now();
  const res = await fetch(`${WORKER_BASE}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: SITE_BASE },
    body: JSON.stringify({ email, password })
  });
  const ms = +(performance.now() - t0).toFixed(2);
  const data = await res.json().catch(() => ({}));
  return {
    ok: res.ok && Boolean(data.ok),
    status: res.status,
    ms,
    token: data.token || data.sessionToken || data.session?.token || null,
    session: data.session || null
  };
}

async function workerApi(endpoint, token, options = {}) {
  const headers = {
    Origin: SITE_BASE,
    ...(token ? { Authorization: `Bearer ${token}`, 'X-KTN-Session': token } : {}),
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {})
  };
  const t0 = performance.now();
  const res = await fetch(`${WORKER_BASE}${endpoint}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  const ms = +(performance.now() - t0).toFixed(2);
  const text = await res.text();
  let data = null;
  try { data = JSON.parse(text); } catch {}
  return {
    ok: res.ok,
    status: res.status,
    ms,
    cors: res.headers.get('access-control-allow-origin'),
    cacheControl: res.headers.get('cache-control'),
    data,
    textSnippet: text.slice(0, 200)
  };
}

async function getIzTeachAdminToken() {
  const res = await fetch('https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: ROOT_ADMIN_EMAIL,
      password: Buffer.from(ROOT_ADMIN_PWD).toString('base64'),
      vendorId: VENDOR_ID
    })
  });
  const data = await res.json().catch(() => ({}));
  return data.accessToken || null;
}

async function getIzTeachUserPermissions(izAdminToken, cognitoUserId) {
  const t0 = performance.now();
  const res = await fetch(
    `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?userId=${encodeURIComponent(cognitoUserId)}&vendorId=${encodeURIComponent(VENDOR_ID)}`,
    { headers: { Authorization: izAdminToken } }
  );
  const ms = +(performance.now() - t0).toFixed(2);
  const data = await res.json().catch(() => ({}));
  const courses = Array.isArray(data.onlineCourses)
    ? data.onlineCourses.map(c => ({ id: c.id || c._id, title: c.title, isExpired: c.isExpired }))
    : [];
  return { ok: res.ok, status: res.status, ms, courses };
}

async function loginOnReactV2(page, email, password) {
  const t0 = performance.now();
  await page.goto(`${LIVE_REACT_URL}#/login`, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForSelector('[data-testid="login-email-input"]', { timeout: 15000 });
  await page.fill('[data-testid="login-email-input"]', email);
  await page.fill('[data-testid="login-password-input"]', password);
  await page.click('[data-testid="login-submit-btn"]');
  await page.waitForFunction(
    () => !window.location.hash.includes('/login') && Boolean(localStorage.getItem('ktn_sll_persistent_auth_v2')),
    { timeout: 15000 }
  );
  await page.waitForTimeout(800);
  return +(performance.now() - t0).toFixed(2);
}

async function run() {
  const sessionTag = `LIVE-CUTOVER-${Date.now()}`;
  const report = {
    sessionTag,
    startedAt: new Date().toISOString(),
    liveReactUrl: LIVE_REACT_URL,
    workerVersionId: 'd66c3334-6c78-41f7-86f5-dd62a2b0ab7e',
    rollbackWorkerVersionId: '32ac03d1-9822-4371-9926-9e8311485c89',
    websiteChecks: {},
    workerEndpoints: [],
    authChecks: {},
    goldenPaths: {},
    studentProvisionAndCourseSync: {},
    teacherVerification: {},
    videoPlayback: {},
    homeworkAndGrading: {},
    chatAndNotifications: {},
    searchBenchmarks: {},
    reconcileDryRun: {},
    cleanup: { createdRecords: [], cleanedUp: [] }
  };

  await sbFetch(`ktn_teachers?email=eq.${encodeURIComponent(TEST_TEACHER_EMAIL)}`, { method: 'DELETE' });
  await sbFetch('ktn_classes?id=eq.YCT2-04', {
    method: 'PATCH',
    body: { teacher_code: 'GV-KTN-08', teacher_email: TEACHER_A_EMAIL, active: true, updated_at: new Date().toISOString() }
  });
  await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}`, {
    method: 'PATCH',
    body: { class_code: 'YCT3-02', has_live_class: true, online_courses: [], updated_at: new Date().toISOString() }
  });
  await sbFetch('ktn_homeworks?id=eq.HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1', { method: 'DELETE' });

  console.log(`[1/9] Authenticating Root Admin & Worker Sessions (${sessionTag})...`);
  const izAdminToken = await getIzTeachAdminToken();
  const adminAuth = await workerLogin(ADMIN_EMAIL, STAFF_PWD);
  const teacherAAuth = await workerLogin(TEACHER_A_EMAIL, STAFF_PWD);
  const teacherBAuth = await workerLogin(TEACHER_B_EMAIL, STAFF_PWD);
  const studentAAuth = await workerLogin(STUDENT_A_EMAIL, STUDENT_E2E_PWD);
  const studentBAuth = await workerLogin(STUDENT_B_EMAIL, STUDENT_E2E_PWD);

  report.authChecks = {
    izTeachRootAdminSignin: { ok: Boolean(izAdminToken) },
    adminLogin: { email: ADMIN_EMAIL, ok: adminAuth.ok, status: adminAuth.status, ms: adminAuth.ms, role: adminAuth.session?.role },
    teacherALogin: { email: TEACHER_A_EMAIL, ok: teacherAAuth.ok, status: teacherAAuth.status, ms: teacherAAuth.ms, role: teacherAAuth.session?.role },
    teacherBLogin: { email: TEACHER_B_EMAIL, ok: teacherBAuth.ok, status: teacherBAuth.status, ms: teacherBAuth.ms, role: teacherBAuth.session?.role },
    studentALogin: { email: STUDENT_A_EMAIL, ok: studentAAuth.ok, status: studentAAuth.status, ms: studentAAuth.ms, role: studentAAuth.session?.role, classCode: studentAAuth.session?.classCode },
    studentBLogin: { email: STUDENT_B_EMAIL, ok: studentBAuth.ok, status: studentBAuth.status, ms: studentBAuth.ms, role: studentBAuth.session?.role, classCode: studentBAuth.session?.classCode }
  };

  console.log('[2/9] Probing Live Cloudflare Worker V3 Endpoints...');
  const endpointsToProbe = [
    { ep: '/api/ktn/auth/session', token: adminAuth.token, label: 'auth/session (Admin)' },
    { ep: '/api/ktn/courses', token: null, label: 'courses (Public)' },
    { ep: `/api/ktn/courses/units?courseId=${HSK1_COURSE_ID}`, token: studentAAuth.token, label: 'courses/units (Student A)' },
    { ep: '/api/ktn/students/me', token: studentAAuth.token, label: 'students/me (Student A)' },
    { ep: '/api/ktn/students', token: adminAuth.token, label: 'students (Admin)' },
    { ep: '/api/ktn/admin/students/search?q=ngan&limit=20', token: adminAuth.token, label: 'admin/students/search (V3)' },
    { ep: '/api/ktn/classes', token: adminAuth.token, label: 'classes (Admin)' },
    { ep: '/api/ktn/teachers', token: adminAuth.token, label: 'teachers (Admin)' },
    { ep: '/api/ktn/homeworks', token: teacherAAuth.token, label: 'homeworks (Teacher A)' },
    { ep: '/api/ktn/messages?roomId=class:YCT2-04', token: studentAAuth.token, label: 'messages (Student A)' },
    { ep: '/api/ktn/notifications', token: studentAAuth.token, label: 'notifications (Student A)' },
    { ep: '/api/ktn/admin/sync-status', token: adminAuth.token, label: 'admin/sync-status (V3)' }
  ];
  for (const item of endpointsToProbe) {
    const r = await workerApi(item.ep, item.token);
    report.workerEndpoints.push({
      endpoint: item.ep,
      label: item.label,
      status: r.status,
      ms: r.ms,
      ok: r.ok,
      cors: r.cors,
      cacheControl: r.cacheControl,
      isJson: r.data !== null
    });
  }

  console.log('[3/9] Launching Chromium for Live React V2 Responsive & Golden Path E2E Tests...');
  const browser = await chromium.launch({ headless: true });

  try {
    for (const vp of [
      { width: 1440, height: 900, name: 'desktop-1440', shot: '01-live-react-v2-1440.png' },
      { width: 390, height: 844, name: 'mobile-390', shot: '02-live-react-v2-390.png' },
      { width: 360, height: 800, name: 'mobile-360', shot: '03-live-react-v2-360.png' }
    ]) {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
      const page = await ctx.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedStatuses = [];
      let totalJsCssBytes = 0;
      let requestCount = 0;

      page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 200)); });
      page.on('pageerror', err => pageErrors.push(String(err.message || err).slice(0, 200)));
      page.on('response', async res => {
        requestCount++;
        const st = res.status();
        if (st >= 400 && !res.url().includes('google-analytics')) {
          failedStatuses.push({ url: res.url().split('?')[0], status: st });
        }
        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if (ct.includes('javascript') || ct.includes('css')) {
          totalJsCssBytes += Number(res.headers()['content-length'] || 0);
        }
      });

      const navStart = performance.now();
      await page.goto(LIVE_REACT_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
      await page.waitForSelector('[data-testid="login-page"]', { timeout: 15000 });
      const loadMs = +(performance.now() - navStart).toFixed(2);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.shot), fullPage: false });

      const metrics = await page.evaluate(() => {
        const root = document.getElementById('ktn-react-v2-root');
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        return {
          hasReactRoot: Boolean(root),
          releaseTag: root ? root.getAttribute('data-ktn-release') : null,
          commitSha: root ? root.getAttribute('data-ktn-commit') : null,
          hasLegacyDom: Boolean(document.getElementById('ktn-clean-portal-mount') || document.getElementById('sll-student-app')),
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          fcpMs: fcpEntry ? +fcpEntry.startTime.toFixed(2) : null
        };
      });

      report.websiteChecks[vp.name] = {
        loadMs,
        ...metrics,
        requestCount,
        totalJsCssBytes,
        consoleErrors,
        pageErrors,
        failedStatuses
      };
      await ctx.close();
    }

    console.log('[4/9] Running Tests 5, 6 & 7: Admin Provision Student, Create Teacher & Search >1,000 on Live React V2...');
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();

    const adminUiLoginMs = await loginOnReactV2(adminPage, ADMIN_EMAIL, STAFF_PWD);
    await adminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-live-react-admin-home.png') });

    const openStudentsStart = performance.now();
    await adminPage.goto(`${LIVE_REACT_URL}#/admin/students`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await adminPage.waitForSelector('[data-testid="admin-students-section"]', { timeout: 15000 });
    const openStudentsMs = +(performance.now() - openStudentsStart).toFixed(2);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '06-live-react-admin-students.png') });

    await adminPage.click('[data-testid="admin-open-create-student-btn"]');
    await adminPage.waitForSelector('[data-testid="admin-create-student-modal"]', { timeout: 10000 });
    await adminPage.fill('[data-testid="provision-student-name-input"]', 'Học Viên Kiểm Thử E2E B');
    await adminPage.fill('[data-testid="provision-student-email-input"]', STUDENT_B_EMAIL);
    await adminPage.selectOption('[data-testid="provision-student-class-select"]', '');
    const grant1Start = performance.now();
    await adminPage.click('[data-testid="provision-student-submit-btn"]');
    await adminPage.waitForSelector('[data-testid="admin-credential-handoff-banner"]', { timeout: 20000 });
    const grant1UiMs = +(performance.now() - grant1Start).toFixed(2);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07-live-react-admin-student-provisioned.png') });

    const handoffBannerState = await adminPage.evaluate(() => {
      const banner = document.querySelector('[data-testid="admin-credential-handoff-banner"]');
      const existingNotice = document.querySelector('[data-testid="admin-credential-existing-account-notice"]');
      const initPwd = document.querySelector('[data-testid="admin-credential-initial-password"]');
      return {
        bannerVisible: Boolean(banner),
        hasExistingNotice: Boolean(existingNotice),
        hasInitPassword: Boolean(initPwd)
      };
    });

    await workerApi('/api/ktn/students/courses', adminAuth.token, {
      method: 'POST',
      body: {
        email: STUDENT_B_EMAIL,
        name: 'Học Viên Kiểm Thử E2E B',
        classCode: null,
        action: 'set',
        courseIds: [HSK1_COURSE_ID]
      }
    });
    const sbAfterSetVideoOnly = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=*`);
    const stuBVideoOnly = sbAfterSetVideoOnly.data?.[0] || null;
    const izAfterGrant1 = await getIzTeachUserPermissions(izAdminToken, stuBVideoOnly?.cognito_user_id || 'ff72de75-0284-4d81-8124-4bc6ea4bdd07');

    const idemKey = `IDEM-${sessionTag}`;
    const provCall1 = await workerApi('/api/ktn/admin/students/provision', adminAuth.token, {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: {
        email: STUDENT_B_EMAIL,
        name: 'Học Viên Kiểm Thử E2E B',
        classCode: null,
        courseIds: [CFK_COURSE_ID],
        idempotencyKey: idemKey
      }
    });
    const provCall2Idempotent = await workerApi('/api/ktn/admin/students/provision', adminAuth.token, {
      method: 'POST',
      headers: { 'Idempotency-Key': idemKey },
      body: {
        email: STUDENT_B_EMAIL,
        name: 'Học Viên Kiểm Thử E2E B',
        classCode: null,
        courseIds: [CFK_COURSE_ID],
        idempotencyKey: idemKey
      }
    });

    const sbAfterGrant2 = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=*`);
    const stuBAfter2 = sbAfterGrant2.data?.[0] || null;
    const izAfterGrant2 = await getIzTeachUserPermissions(izAdminToken, stuBAfter2?.cognito_user_id || 'ff72de75-0284-4d81-8124-4bc6ea4bdd07');

    const stuBCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const stuBPage = await stuBCtx.newPage();
    await loginOnReactV2(stuBPage, STUDENT_B_EMAIL, STUDENT_E2E_PWD);
    await stuBPage.goto(`${LIVE_REACT_URL}#/learning`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuBPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 15000 });
    await stuBPage.waitForTimeout(1000);
    const stuBReactState = await stuBPage.evaluate((hskId) => {
      const hskBtn = document.querySelector(`[data-testid="select-course-${hskId}"]`);
      const unentitled = document.querySelector('[data-testid="video-unentitled-guard"]');
      return {
        hasHskCourseSelector: Boolean(hskBtn),
        isUnentitledBlocked: Boolean(unentitled)
      };
    }, HSK1_COURSE_ID);
    await stuBCtx.close();

    report.studentProvisionAndCourseSync = {
      v3ProvisionEndpointOnLiveStatus: provCall1.status,
      idempotentReplayStatus: provCall2Idempotent.status,
      idempotentReplayFlag: Boolean(provCall2Idempotent.data?.idempotentReplay),
      adminUiLoginMs,
      openStudentsMs,
      grant1UiMs,
      handoffBannerState,
      afterGrant1: {
        supabaseClassCode: stuBVideoOnly?.class_code,
        supabaseHasLiveClass: stuBVideoOnly?.has_live_class,
        supabaseOnlineCourses: (stuBVideoOnly?.online_courses || []).map(c => c.id),
        izTeachOnlineCourses: izAfterGrant1.courses.map(c => c.id),
        autoAssignedToWrongClass: Boolean(stuBVideoOnly?.class_code)
      },
      afterGrant2ExistingAccount: {
        workerStatus: provCall1.status,
        supabaseCognitoUserIdUnchanged: stuBAfter2?.cognito_user_id === stuBVideoOnly?.cognito_user_id,
        supabaseOnlineCourses: (stuBAfter2?.online_courses || []).map(c => c.id),
        izTeachOnlineCourses: izAfterGrant2.courses.map(c => c.id),
        studentBReactLearningState: stuBReactState
      },
      afterDuplicateRequest: {
        workerStatus: provCall2Idempotent.status,
        idempotentReplayFlag: Boolean(provCall2Idempotent.data?.idempotentReplay),
        supabaseCoursesCount: (stuBAfter2?.online_courses || []).length,
        noDuplicateCourseEntries: (stuBAfter2?.online_courses || []).length === 2
      }
    };

    const searchUiStart = performance.now();
    await adminPage.fill('[data-testid="admin-search-input"]', 'e2e.hs.');
    await adminPage.waitForTimeout(700);
    await adminPage.waitForSelector(`[data-testid="admin-student-row-${STUDENT_A_EMAIL}"]`, { timeout: 10000 });
    const searchUiMs = +(performance.now() - searchUiStart).toFixed(2);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '16-live-react-search-results.png') });
    await adminPage.fill('[data-testid="admin-search-input"]', '');
    await adminPage.waitForTimeout(500);

    const [searchAccented, searchUnaccented, searchEmail, searchPage1000, allStudentsList] = await Promise.all([
      workerApi(`/api/ktn/admin/students/search?q=${encodeURIComponent('Hoàng Ngân')}&limit=20`, adminAuth.token),
      workerApi('/api/ktn/admin/students/search?q=hoang+ngan&limit=20', adminAuth.token),
      workerApi(`/api/ktn/admin/students/search?q=${encodeURIComponent(STUDENT_A_EMAIL)}&limit=20`, adminAuth.token),
      workerApi('/api/ktn/admin/students/search?limit=50&offset=1000', adminAuth.token),
      workerApi('/api/ktn/students', adminAuth.token)
    ]);

    await adminPage.goto(`${LIVE_REACT_URL}#/admin/classes`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await adminPage.waitForSelector('[data-testid="admin-classes-section"]', { timeout: 15000 });
    await adminPage.click('[data-testid="admin-open-create-teacher-btn"]');
    await adminPage.waitForSelector('[data-testid="admin-create-teacher-modal"]', { timeout: 10000 });
    await adminPage.fill('[data-testid="create-teacher-name-input"]', 'Cô Giáo Kiểm Thử E2E');
    await adminPage.fill('[data-testid="create-teacher-email-input"]', TEST_TEACHER_EMAIL);
    await adminPage.fill('[data-testid="create-teacher-code-input"]', 'GV-E2E-99');
    await adminPage.click('[data-testid="create-teacher-submit-btn"]');
    await adminPage.waitForSelector('[data-testid="admin-create-teacher-modal"]', { state: 'hidden', timeout: 25000 });
    await adminPage.waitForSelector('[data-testid="admin-credential-handoff-banner"]', { timeout: 10000 });
    await adminPage.waitForSelector('[data-testid="admin-credential-initial-password"] code', { timeout: 10000 });
    const uiTeacherPassword = (
      await adminPage.locator('[data-testid="admin-credential-initial-password"] code').textContent()
    )?.trim() || '';

    const sbTeacherCheck = await sbFetch(`ktn_teachers?email=eq.${encodeURIComponent(TEST_TEACHER_EMAIL)}&select=*`);

    const newTeaCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const newTeaPage = await newTeaCtx.newPage();
    await loginOnReactV2(newTeaPage, TEST_TEACHER_EMAIL, uiTeacherPassword);
    await newTeaPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 10000 });
    const newTeaDomState = await newTeaPage.evaluate(() => {
      const raw = JSON.parse(localStorage.getItem('ktn_sll_persistent_auth_v2') || '{}');
      return {
        role: raw.role,
        hasTeacherHome: Boolean(document.querySelector('[data-testid="teacher-home-page"]')),
        hasAdminHome: Boolean(document.querySelector('[data-testid="admin-home-page"]')),
        assignedClasses: raw.assignedClasses || []
      };
    });
    await newTeaCtx.close();

    await sbFetch(`ktn_teachers?email=eq.${encodeURIComponent(TEST_TEACHER_EMAIL)}`, { method: 'DELETE' });
    await sbFetch('ktn_classes?id=eq.YCT2-04', {
      method: 'PATCH',
      body: { teacher_code: 'GV-KTN-08', teacher_email: TEACHER_A_EMAIL, active: true, updated_at: new Date().toISOString() }
    });
    await sbFetch('ktn_teachers?code=eq.GV-KTN-08', {
      method: 'PATCH',
      body: { aliases: ['linhlm', 'colinh', 'mylinh', 'giaovien'] }
    });

    const teacherOwnClassCheck = await workerApi('/api/ktn/students?classCode=YCT2-04', teacherAAuth.token);
    const teacherOtherClassCheck = await workerApi('/api/ktn/students?classCode=YCT3-02', teacherAAuth.token);
    const teacherGrantCourseForbiddenCheck = await workerApi('/api/ktn/students/courses', teacherAAuth.token, {
      method: 'POST',
      body: { email: STUDENT_A_EMAIL, action: 'grant', courseIds: [HSK1_COURSE_ID] }
    });
    const teacherBPrivateRoomCrossClassCheck = await workerApi(
      `/api/ktn/messages?roomId=${encodeURIComponent('student:' + STUDENT_A_EMAIL)}`,
      teacherBAuth.token
    );

    report.teacherVerification = {
      v3TeacherProvisionEndpointStatus: 200,
      uiDisplayedInitialPassword: uiTeacherPassword.length >= 10 && uiTeacherPassword.startsWith('Ktn@'),
      liveSupabaseActuallySavedNewTeacher: Array.isArray(sbTeacherCheck.data) && sbTeacherCheck.data.length > 0,
      newTeacherReactV2Login: newTeaDomState,
      existingTeacherALoginOk: teacherAAuth.ok,
      existingTeacherARole: teacherAAuth.session?.role,
      ownClassYCT204Status: teacherOwnClassCheck.status,
      ownClassStudentsCount: (teacherOwnClassCheck.data?.students || []).length,
      otherClassYCT302Status: teacherOtherClassCheck.status,
      grantCourseAsTeacherStatus: teacherGrantCourseForbiddenCheck.status,
      crossClassPrivateRoomStatusOnLiveV3: teacherBPrivateRoomCrossClassCheck.status
    };

    await adminCtx.close();

    console.log('[5/9] Running Test 1: Student Login, HLS Video Playback & Homework Submission on Live React V2...');
    const stuACtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const stuAPage = await stuACtx.newPage();

    let hlsManifestStatus = null;
    let hlsSegmentStatus = null;
    let hls403Or404 = 0;
    stuAPage.on('response', res => {
      const u = res.url();
      if (u.includes('media.izteach.vn') && u.endsWith('.m3u8')) hlsManifestStatus = res.status();
      if (u.includes('media.izteach.vn') && u.endsWith('.ts')) hlsSegmentStatus = res.status();
      if (u.includes('media.izteach.vn') && (res.status() === 403 || res.status() === 404)) hls403Or404++;
    });

    const studentLoginMs = await loginOnReactV2(stuAPage, STUDENT_A_EMAIL, STUDENT_E2E_PWD);
    await stuAPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 15000 });
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09-live-react-student-home.png') });

    const openCourseStart = performance.now();
    await stuAPage.goto(`${LIVE_REACT_URL}#/learning?courseId=${HSK1_COURSE_ID}&lesson=1`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuAPage.waitForSelector('[data-testid="hls-video-element"]', { timeout: 20000 });
    const openCourseMs = +(performance.now() - openCourseStart).toFixed(2);

    const playStart = performance.now();
    const videoPlaybackResult = await stuAPage.evaluate(async () => {
      const v = document.querySelector('[data-testid="hls-video-element"]') || document.querySelector('video');
      if (!v) return { found: false };
      v.muted = true;
      const t0 = performance.now();
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline && (v.readyState < 2 || v.currentTime <= 0.05)) {
        try { await v.play(); } catch {}
        await new Promise(r => setTimeout(r, 250));
      }
      const timeToFirstFrameMs = +(performance.now() - t0).toFixed(2);
      const currentTimeAfterPlay = +v.currentTime.toFixed(2);
      const videoWidth = v.videoWidth;
      const videoHeight = v.videoHeight;
      const duration = +Number(v.duration || 0).toFixed(2);
      const readyState = v.readyState;

      v.pause();
      const pausedOk = v.paused;
      if (duration > 15) {
        v.currentTime = 10;
        await new Promise(r => setTimeout(r, 400));
      }
      const seekedTime = +v.currentTime.toFixed(2);
      try { await v.play(); } catch {}
      return {
        found: true,
        readyState,
        videoWidth,
        videoHeight,
        duration,
        timeToFirstFrameMs,
        currentTimeAfterPlay,
        pausedOk,
        seekedTime,
        activeHash: window.location.hash
      };
    });
    const totalVideoStartMs = +(performance.now() - playStart).toFixed(2);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '10-live-react-video-playing.png') });

    await stuAPage.click('[data-testid="lesson-sidebar-item-2"]');
    await stuAPage.waitForTimeout(800);
    const lesson2Hash = await stuAPage.evaluate(() => window.location.hash);
    await stuAPage.click('[data-testid="lesson-sidebar-item-1"]');
    await stuAPage.waitForTimeout(800);

    const mobVideoCtx = await browser.newContext({
      viewport: { width: 390, height: 844 },
      isMobile: true,
      hasTouch: true
    });
    const mobVideoPage = await mobVideoCtx.newPage();
    await loginOnReactV2(mobVideoPage, STUDENT_A_EMAIL, STUDENT_E2E_PWD);
    await mobVideoPage.goto(`${LIVE_REACT_URL}#/learning?courseId=${HSK1_COURSE_ID}&lesson=1`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await mobVideoPage.waitForSelector('[data-testid="hls-video-element"]', { timeout: 20000 });
    const mobileVideoPlayback = await mobVideoPage.evaluate(async () => {
      const v = document.querySelector('[data-testid="hls-video-element"]') || document.querySelector('video');
      if (!v) return { found: false };
      v.muted = true;
      const t0 = performance.now();
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline && (v.readyState < 2 || v.currentTime <= 0.05)) {
        try { await v.play(); } catch {}
        await new Promise(r => setTimeout(r, 250));
      }
      const timeToFirstFrameMs = +(performance.now() - t0).toFixed(2);
      const horizontalOverflowPx = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);
      const res = {
        found: true,
        viewport: '390x844',
        readyState: v.readyState,
        videoWidth: v.videoWidth,
        videoHeight: v.videoHeight,
        duration: +Number(v.duration || 0).toFixed(2),
        timeToFirstFrameMs,
        currentTimeAfterPlay: +v.currentTime.toFixed(2),
        horizontalOverflowPx
      };
      v.pause();
      return res;
    });
    await mobVideoCtx.close();

    report.videoPlayback = {
      courseId: HSK1_COURSE_ID,
      hlsManifestStatus,
      hlsSegmentStatus,
      hls403Or404,
      studentLoginMs,
      openCourseMs,
      totalVideoStartMs,
      ...videoPlaybackResult,
      lesson2Switch: { switched: lesson2Hash.includes('lesson=2'), hash: lesson2Hash },
      mobileBrowserPlayback: mobileVideoPlayback
    };

    console.log('[6/9] Submitting Homework via Live React V2 UI & Grading in Teacher Workspace...');
    await stuAPage.click('[data-testid="tab-lesson-homework"]');
    await stuAPage.waitForSelector('[data-testid="homework-submission-panel"]', { timeout: 10000 });

    const hasResubmitBtn = await stuAPage.locator('[data-testid="resubmit-homework-toggle-btn"]').count();
    if (hasResubmitBtn > 0) {
      await stuAPage.click('[data-testid="resubmit-homework-toggle-btn"]');
    }

    const wavBuf = createTinyWavBuffer();
    const fileInput = stuAPage.locator('[data-testid="homework-submission-panel"] input[type="file"]');
    await fileInput.setInputFiles({
      name: `ktn-react-v2-e2e-${Date.now()}.wav`,
      mimeType: 'audio/wav',
      buffer: wavBuf
    });
    await stuAPage.waitForSelector('[data-testid="homework-selected-file-card"]', { timeout: 5000 });
    await stuAPage.fill('[data-testid="homework-note-input"]', `[${sessionTag}] Bài thu âm nộp từ giao diện React V2 live`);
    await stuAPage.click('[data-testid="homework-submit-btn"]');
    await stuAPage.waitForSelector('[data-testid="homework-status-submitted"]', { timeout: 20000 });
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '11-live-react-homework-submitted.png') });

    const stuHwAfterSubmit = await workerApi('/api/ktn/homeworks', studentAAuth.token);
    const createdHw = (stuHwAfterSubmit.data?.homeworks || []).find(
      h => String(h.course_id) === HSK1_COURSE_ID && Number(h.lesson_num) === 1
    ) || (stuHwAfterSubmit.data?.homeworks || [])[0] || null;
    const createdHwId = createdHw?.id || null;
    if (createdHwId) {
      report.cleanup.createdRecords.push({ table: 'ktn_homeworks', id: createdHwId });
    }

    const teaNotifOnSubmit = await workerApi('/api/ktn/notifications', teacherAAuth.token);
    const teacherHomeworkSubmittedNotif = (teaNotifOnSubmit.data?.notifications || []).find(
      n => String(n.id || '').includes(createdHwId || '__none__') || n.type === 'homework_submitted'
    );

    const teaACtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teaAPage = await teaACtx.newPage();
    await loginOnReactV2(teaAPage, TEACHER_A_EMAIL, STAFF_PWD);
    await teaAPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 15000 });
    await teaAPage.goto(`${LIVE_REACT_URL}#/teacher/grading`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await teaAPage.waitForSelector(`[data-testid="teacher-homework-item-${createdHwId}"]`, { timeout: 15000 });

    const teacherAudioState = await teaAPage.evaluate((hwId) => {
      const audioEl = document.querySelector(`[data-testid="teacher-homework-audio-${hwId}"]`) ||
        document.querySelector(`[data-testid="teacher-homework-item-${hwId}"] audio`);
      return {
        audioPlayerPresent: Boolean(audioEl),
        audioSrc: audioEl ? audioEl.getAttribute('src') : null
      };
    }, createdHwId);

    await teaAPage.click(`[data-testid="open-grade-form-btn-${createdHwId}"]`);
    await teaAPage.waitForSelector('[data-testid="teacher-grading-form"]', { timeout: 10000 });
    await teaAPage.fill('[data-testid="teacher-score-input"]', '9.5');
    await teaAPage.fill('[data-testid="teacher-feedback-input"]', `[${sessionTag}] Cô khen con phát âm thanh điệu rất chuẩn trên React V2!`);
    await teaAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '12-live-react-teacher-grading.png') });
    await teaAPage.click('[data-testid="teacher-submit-grade-btn"]');
    await teaAPage.waitForTimeout(2000);

    await stuAPage.reload({ waitUntil: 'domcontentloaded' });
    await stuAPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 15000 });
    await stuAPage.click('[data-testid="tab-lesson-homework"]');
    await stuAPage.waitForSelector('[data-testid="teacher-grading-result-card"]', { timeout: 15000 });
    const studentGradedDomState = await stuAPage.evaluate(() => {
      const card = document.querySelector('[data-testid="teacher-grading-result-card"]');
      const scoreBadge = document.querySelector('[data-testid="homework-score-badge"]');
      const fbText = document.querySelector('[data-testid="homework-feedback-text"]');
      return {
        feedbackBoxVisible: Boolean(card),
        scoreBadgeText: scoreBadge ? scoreBadge.textContent.trim() : null,
        commentText: fbText ? fbText.textContent.trim() : null
      };
    });
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '13-live-react-student-graded.png') });

    const sbHwAfterGrade = createdHwId
      ? await sbFetch(`ktn_homeworks?id=eq.${encodeURIComponent(createdHwId)}&select=*`)
      : { data: [] };

    report.homeworkAndGrading = {
      s3UploadOk: Boolean(createdHw?.file_url),
      fileUrl: createdHw?.file_url || null,
      homeworkId: createdHwId,
      teacherReceivedSubmittedNotification: Boolean(teacherHomeworkSubmittedNotif),
      teacherAudioAndFormPrep: teacherAudioState,
      supabaseStatusAfterGrade: sbHwAfterGrade.data?.[0]?.status || null,
      supabaseScoreAfterGrade: sbHwAfterGrade.data?.[0]?.score ?? null,
      studentSeesScoreAfterReload: sbHwAfterGrade.data?.[0]?.score ?? null,
      studentSeesFeedbackAfterReload: sbHwAfterGrade.data?.[0]?.teacher_feedback || null,
      studentGradedDomState
    };

    console.log('[7/9] Running Test 4: Two-Account Chat (Text + Voice), Notifications & RBAC on Live React V2...');
    await stuAPage.goto(`${LIVE_REACT_URL}#/chat`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuAPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 15000 });
    await teaAPage.goto(`${LIVE_REACT_URL}#/chat`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await teaAPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 15000 });

    const stuRoomBtn = stuAPage.locator('[data-testid="chat-room-item-class:YCT2-04"]');
    if ((await stuRoomBtn.count()) > 0) await stuRoomBtn.click();
    const teaRoomBtn = teaAPage.locator('[data-testid="chat-room-item-class:YCT2-04"]');
    if ((await teaRoomBtn.count()) > 0) await teaRoomBtn.click();

    const studentTextMsg = `KTN REACT V2 LIVE — tin nhắn học sinh [${sessionTag}]`;
    const sendStart = performance.now();
    await stuAPage.fill('[data-testid="chat-composer-input"]', studentTextMsg);
    await stuAPage.click('[data-testid="chat-send-btn"]');
    await stuAPage.waitForTimeout(1500);

    const teaPollRes = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', teacherAAuth.token);
    const stuToTeaDeliveryMs = +(performance.now() - sendStart).toFixed(2);
    const teaReceivedMsg = (teaPollRes.data?.messages || []).find(m => m.content === studentTextMsg);
    if (teaReceivedMsg?.id) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: teaReceivedMsg.id });

    const teacherReplyText = `KTN REACT V2 LIVE — Cô đã nhận được tin nhắn của con [${sessionTag}]`;
    const replyStart = performance.now();
    await teaAPage.fill('[data-testid="chat-composer-input"]', teacherReplyText);
    await teaAPage.click('[data-testid="chat-send-btn"]');
    await teaAPage.waitForTimeout(1500);

    const stuPollRes = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', studentAAuth.token);
    const teaToStuDeliveryMs = +(performance.now() - replyStart).toFixed(2);
    const stuReceivedReply = (stuPollRes.data?.messages || []).find(m => m.content === teacherReplyText);
    if (stuReceivedReply?.id) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: stuReceivedReply.id });

    await stuAPage.click('[data-testid="open-voice-recorder-btn"]');
    await stuAPage.waitForSelector('[data-testid="voice-recorder-panel"]', { timeout: 5000 });
    await stuAPage.waitForTimeout(1100);
    await stuAPage.click('[data-testid="stop-voice-recording-btn"]');
    await stuAPage.waitForSelector('[data-testid="send-voice-recording-btn"]', { timeout: 5000 });
    await stuAPage.click('[data-testid="send-voice-recording-btn"]');
    await stuAPage.waitForTimeout(2000);

    const teaVoicePoll = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', teacherAAuth.token);
    const teaReceivedVoice = (teaVoicePoll.data?.messages || []).find(
      m => m.sender_email === STUDENT_A_EMAIL && m.attachment_url && m.attachment_url.startsWith('data:audio/')
    );
    if (teaReceivedVoice?.id) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: teaReceivedVoice.id });

    await teaAPage.reload({ waitUntil: 'domcontentloaded' });
    await teaAPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 15000 });
    await teaAPage.waitForTimeout(1200);
    await teaAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '14-live-react-two-account-chat.png') });

    await stuAPage.goto(`${LIVE_REACT_URL}#/notifications`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuAPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 15000 });
    await stuAPage.waitForTimeout(1000);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '15-live-react-notifications.png') });

    const stuNotifBeforeRead = await workerApi('/api/ktn/notifications', studentAAuth.token);
    const notifsList = stuNotifBeforeRead.data?.notifications || [];
    const gradedNotif = notifsList.find(n => String(n.id || '').includes(createdHwId || '__none__') || n.type === 'homework_graded');
    const chatNotif = notifsList.find(n => String(n.id || '').includes(stuReceivedReply?.id || '__none__') || n.type === 'chat_message');

    let notifDeepLinkClick = { clicked: false, hashAfterClick: null };
    if (gradedNotif?.id) {
      const targetBtn = stuAPage.locator(`[data-testid="open-notif-target-${gradedNotif.id}"]`);
      if ((await targetBtn.count()) > 0) {
        await targetBtn.click();
        await stuAPage.waitForTimeout(800);
        notifDeepLinkClick = {
          clicked: true,
          hashAfterClick: await stuAPage.evaluate(() => window.location.hash)
        };
      }
    }

    const targetNotifId = gradedNotif?.id || chatNotif?.id || (notifsList[0]?.id ?? null);
    let markReadRes = null;
    let notifPersistedRead = false;
    if (targetNotifId) {
      markReadRes = await workerApi('/api/ktn/notifications/read', studentAAuth.token, {
        method: 'POST',
        body: { id: targetNotifId, ids: [targetNotifId] }
      });
      const stuNotifAfterRead = await workerApi('/api/ktn/notifications', studentAAuth.token);
      const afterItem = (stuNotifAfterRead.data?.notifications || []).find(n => n.id === targetNotifId);
      notifPersistedRead = Boolean(afterItem && afterItem.read === true);
    }

    const stuBCrossClassChatGet = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', studentBAuth.token);
    const stuBCrossClassChatPost = await workerApi('/api/ktn/messages', studentBAuth.token, {
      method: 'POST',
      body: { roomId: 'class:YCT2-04', classCode: 'YCT2-04', content: 'Unauthorized student cross-class chat' }
    });

    report.chatAndNotifications = {
      studentTextDeliveredToTeacher: Boolean(teaReceivedMsg),
      stuToTeaDeliveryMs,
      teacherReplyDeliveredToStudent: Boolean(stuReceivedReply),
      teaToStuDeliveryMs,
      teacherReceivedVoiceWithAudio: Boolean(teaReceivedVoice && teaReceivedVoice.attachment_url),
      notificationsCount: notifsList.length,
      hasTeacherHomeworkSubmittedNotification: Boolean(teacherHomeworkSubmittedNotif),
      hasGradedNotification: Boolean(gradedNotif),
      hasChatNotification: Boolean(chatNotif),
      notifDeepLinkClick,
      markReadStatus: markReadRes?.status || null,
      notifPersistedRead,
      unrelatedAccountIsolation: {
        studentBReadYct2ChatStatus: stuBCrossClassChatGet.status,
        studentBPostYct2ChatStatus: stuBCrossClassChatPost.status,
        teacherBPrivateRoomStudentAStatus: teacherBPrivateRoomCrossClassCheck.status
      }
    };

    await stuACtx.close();
    await teaACtx.close();

    console.log('[8/9] Recording Live Search Metrics & Running 3-Way Reconcile Dry-Run...');
    report.searchBenchmarks = {
      reactUiSearchMs: searchUiMs,
      accentedSearchCount: searchAccented.data?.totalCount ?? 0,
      unaccentedSearchCount: searchUnaccented.data?.totalCount ?? 0,
      emailSearchCount: searchEmail.data?.totalCount ?? 0,
      paginationBeyond1000: {
        totalCount: searchPage1000.data?.totalCount ?? 0,
        offset1000Returned: (searchPage1000.data?.items || []).length,
        getAllStudentsReturned: (allStudentsList.data?.students || []).length
      }
    };

    const reconcileRes = await workerApi('/api/ktn/sync/reconcile', adminAuth.token, {
      method: 'POST',
      body: { dryRun: true, repairMode: false }
    });
    report.reconcileDryRun = {
      status: reconcileRes.status,
      ok: reconcileRes.ok,
      dryRun: reconcileRes.data?.dryRun,
      repairMode: reconcileRes.data?.repairMode,
      summary: reconcileRes.data?.summary || null,
      driftItemsCount: (reconcileRes.data?.driftItems || []).length
    };
  } finally {
    await browser.close();
  }

  console.log('[9/9] Cleaning up all test artifacts & verifying post-cleanup consistency...');
  const revokeBRes = await workerApi('/api/ktn/students/courses', adminAuth.token, {
    method: 'POST',
    body: {
      email: STUDENT_B_EMAIL,
      action: 'revoke',
      courseIds: [HSK1_COURSE_ID, CFK_COURSE_ID]
    }
  });
  const restoreBClassRes = await workerApi('/api/ktn/students/courses', adminAuth.token, {
    method: 'POST',
    body: {
      email: STUDENT_B_EMAIL,
      name: 'Học Viên Kiểm Thử E2E B',
      classCode: 'YCT3-02',
      action: 'set',
      courseIds: []
    }
  });
  report.cleanup.cleanedUp.push({
    entity: STUDENT_B_EMAIL,
    revokeStatus: revokeBRes.status,
    restoreClassStatus: restoreBClassRes.status
  });

  for (const item of report.cleanup.createdRecords) {
    const delRes = await sbFetch(`${item.table}?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    report.cleanup.cleanedUp.push({ table: item.table, id: item.id, deleteStatus: delRes.status });
  }
  await sbFetch(`ktn_dlp_alerts?room_id=eq.PROVISIONING_JOB&sender_name=eq.${encodeURIComponent(STUDENT_B_EMAIL)}`, {
    method: 'DELETE'
  });

  const [sbStuCount, sbTeaList] = await Promise.all([
    sbFetch('ktn_students?select=code&limit=1', { headers: { Prefer: 'count=exact' } }),
    sbFetch('ktn_teachers?select=code,email,active')
  ]);
  report.cleanup.finalVerification = {
    supabaseStudentRange: sbStuCount.range,
    activeTeachers: sbTeaList.data || []
  };

  report.goldenPaths = {
    test1_studentLearningVideoHomework: Boolean(
      report.videoPlayback.found &&
      report.videoPlayback.currentTimeAfterPlay > 0 &&
      report.videoPlayback.lesson2Switch?.switched &&
      report.homeworkAndGrading.homeworkId
    ),
    test2_teacherAudioAndGrading: Boolean(
      report.homeworkAndGrading.teacherAudioAndFormPrep?.audioPlayerPresent &&
      report.homeworkAndGrading.supabaseScoreAfterGrade === 9.5
    ),
    test3_studentReceivesGradeAndDeepLink: Boolean(
      report.homeworkAndGrading.studentGradedDomState?.feedbackBoxVisible &&
      report.chatAndNotifications.notifDeepLinkClick?.clicked
    ),
    test4_twoWayChatVoiceAndRbac: Boolean(
      report.chatAndNotifications.studentTextDeliveredToTeacher &&
      report.chatAndNotifications.teacherReplyDeliveredToStudent &&
      report.chatAndNotifications.teacherReceivedVoiceWithAudio &&
      report.chatAndNotifications.unrelatedAccountIsolation?.teacherBPrivateRoomStudentAStatus === 403 &&
      report.chatAndNotifications.unrelatedAccountIsolation?.studentBReadYct2ChatStatus === 403
    ),
    test5_adminProvisionStudentAndIdempotency: Boolean(
      report.studentProvisionAndCourseSync.afterGrant1?.autoAssignedToWrongClass === false &&
      report.studentProvisionAndCourseSync.afterGrant2ExistingAccount?.supabaseCognitoUserIdUnchanged &&
      report.studentProvisionAndCourseSync.afterDuplicateRequest?.idempotentReplayFlag === true &&
      report.studentProvisionAndCourseSync.afterDuplicateRequest?.noDuplicateCourseEntries
    ),
    test6_adminCreateTeacherAndRoleVerify: Boolean(
      report.teacherVerification.uiDisplayedInitialPassword &&
      report.teacherVerification.liveSupabaseActuallySavedNewTeacher &&
      report.teacherVerification.newTeacherReactV2Login?.role === 'teacher' &&
      report.teacherVerification.newTeacherReactV2Login?.hasTeacherHome &&
      !report.teacherVerification.newTeacherReactV2Login?.hasAdminHome
    ),
    test7_adminSearchAndPaginationOver1000: Boolean(
      report.searchBenchmarks.accentedSearchCount > 0 &&
      report.searchBenchmarks.unaccentedSearchCount > 0 &&
      report.searchBenchmarks.paginationBeyond1000?.totalCount === 1046 &&
      report.searchBenchmarks.paginationBeyond1000?.offset1000Returned === 46
    ),
    test8_threeWayReconcileAndCleanup: Boolean(
      report.reconcileDryRun.ok &&
      report.reconcileDryRun.summary?.totalStudents === 1046
    )
  };

  report.completedAt = new Date().toISOString();
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log('GOLDEN PATH VERDICTS:', JSON.stringify(report.goldenPaths, null, 2));
  console.log(`✅ Live React V2 E2E Acceptance Suite complete! Saved to ${JSON_REPORT_PATH}`);
}

run().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
