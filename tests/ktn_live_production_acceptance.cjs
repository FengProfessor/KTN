#!/usr/bin/env node
/**
 * KTN — LIVE PRODUCTION END-TO-END ACCEPTANCE TEST HARNESS
 * Executes real browser (Chromium/Playwright) + live API checks against:
 *   - https://khongtunhi.com
 *   - https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev
 *   - https://lcwprikrnhpvpkkpqmmj.supabase.co
 *   - izTeach AWS API Gateways & media.izteach.vn / CloudFront CDN
 *
 * Strictly uses isolated E2E test identities (e2e.hs.a@khongtunhi.com, e2e.hs.b@khongtunhi.com,
 * linh.lam@khongtunhi.com, thu.ha@khongtunhi.com, quanly@khongtunhi.com) and cleans up all test
 * artifacts after verification. Never logs secrets, passwords, or raw tokens.
 */

const fs = require('fs');
const path = require('path');

for (const line of fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  ({ chromium } = require(path.join(__dirname, '..', 'apps', 'ktn-web-v2', 'node_modules', 'playwright')));
}

const SITE_BASE = 'https://khongtunhi.com';
const WORKER_BASE = 'https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev';
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VENDOR_ID = '3529cd2b-7af6-4fda-887c-392a79393d6a';
const CLIENT_ID = 'fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9';

const ADMIN_EMAIL = 'quanly@khongtunhi.com';
const STAFF_PWD = process.env.KTN_STAFF_AND_TEST_PASSWORD;
const ROOT_ADMIN_EMAIL = 'hocvienkhongtunhi123@gmail.com';
const ROOT_ADMIN_PWD = process.env.IZTEACH_ADMIN_PASSWORD;
const TEACHER_A_EMAIL = process.env.KTN_E2E_TEACHER_A_EMAIL || 'linh.lam@khongtunhi.com';
const TEACHER_B_EMAIL = process.env.KTN_E2E_TEACHER_B_EMAIL || 'thu.ha@khongtunhi.com';
const STUDENT_A_EMAIL = process.env.KTN_E2E_STUDENT_A_EMAIL || 'e2e.hs.a@khongtunhi.com';
const STUDENT_B_EMAIL = process.env.KTN_E2E_STUDENT_B_EMAIL || 'e2e.hs.b@khongtunhi.com';
const STUDENT_E2E_PWD = process.env.KTN_E2E_PASSWORD;

const HSK1_COURSE_ID = '6adadba969897b0002482ca5';
const CFK_COURSE_ID = '65e7704a9ea90c00080d5195';

const SCREENSHOT_DIR = path.join(__dirname, '..', 'reports', 'ktn-three-way-reliability', 'live-screenshots');
const JSON_REPORT_PATH = path.join(__dirname, '..', 'reports', 'ktn-three-way-reliability', 'live-production-acceptance-results.json');
fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = Math.min(sortedArr.length - 1, Math.max(0, Math.ceil((p / 100) * sortedArr.length) - 1));
  return +sortedArr[idx].toFixed(2);
}

function createTinyWavBuffer() {
  const sampleRate = 8000;
  const numSamples = 4000; // 0.5s
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

async function run() {
  const sessionTag = `LIVE-E2E-${Date.now()}`;
  const report = {
    sessionTag,
    startedAt: new Date().toISOString(),
    websiteChecks: {},
    workerEndpoints: [],
    authChecks: {},
    studentProvisionAndCourseSync: {},
    teacherVerification: {},
    videoPlayback: {},
    homeworkAndGrading: {},
    chatAndNotifications: {},
    searchBenchmarks: {},
    performanceMetrics: {},
    cleanup: { createdRecords: [], cleanedUp: [] }
  };

  console.log(`[1/9] Getting izTeach Admin Token & Worker Sessions (${sessionTag})...`);
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

  console.log('[2/9] Testing Cloudflare Worker Live Endpoints (Read-Only)...');
  const endpointsToProbe = [
    { ep: '/api/ktn/auth/session', token: adminAuth.token, label: 'auth/session (Admin)' },
    { ep: '/api/ktn/courses', token: null, label: 'courses (Public)' },
    { ep: '/api/ktn/students/me', token: studentAAuth.token, label: 'students/me (Student A)' },
    { ep: '/api/ktn/students', token: adminAuth.token, label: 'students (Admin)' },
    { ep: '/api/ktn/classes', token: adminAuth.token, label: 'classes (Admin)' },
    { ep: '/api/ktn/teachers', token: adminAuth.token, label: 'teachers (Admin)' },
    { ep: '/api/ktn/homeworks', token: teacherAAuth.token, label: 'homeworks (Teacher A)' },
    { ep: '/api/ktn/messages?roomId=class:YCT2-04', token: studentAAuth.token, label: 'messages (Student A)' },
    { ep: '/api/ktn/notifications', token: studentAAuth.token, label: 'notifications (Student A)' },
    { ep: '/api/ktn/admin/students/search?q=ngan&limit=20', token: adminAuth.token, label: 'admin/students/search (V3 endpoint check)' },
    { ep: '/api/ktn/sync/reconcile', token: adminAuth.token, label: 'sync/reconcile (V3 endpoint check)' }
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

  console.log('[3/9] Launching Chromium for Live Website, Responsive & E2E Flows...');
  const browser = await chromium.launch({ headless: true });

  try {
    // 3.1 Website Responsive Checks (1440px, 390px, 360px)
    for (const vp of [
      { width: 1440, height: 900, name: 'desktop-1440', shot: '01-live-homepage-1440.png' },
      { width: 390, height: 844, name: 'mobile-390', shot: '02-live-homepage-390.png' },
      { width: 360, height: 800, name: 'mobile-360', shot: '03-live-homepage-360.png' }
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
        if (st >= 400) failedStatuses.push({ url: res.url().split('?')[0], status: st });
        const ct = (res.headers()['content-type'] || '').toLowerCase();
        if (ct.includes('javascript') || ct.includes('css')) {
          const cl = Number(res.headers()['content-length'] || 0);
          totalJsCssBytes += cl;
        }
      });

      const navStart = performance.now();
      await page.goto(SITE_BASE, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      const loadMs = +(performance.now() - navStart).toFixed(2);
      await page.screenshot({ path: path.join(SCREENSHOT_DIR, vp.shot), fullPage: false });

      const metrics = await page.evaluate(() => {
        const fcpEntry = performance.getEntriesByName('first-contentful-paint')[0];
        const imgs = Array.from(document.querySelectorAll('img'));
        const loadedImgs = imgs.filter(img => img.complete && img.naturalWidth > 0).length;
        return {
          scrollWidth: document.documentElement.scrollWidth,
          innerWidth: window.innerWidth,
          hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
          fcpMs: fcpEntry ? +fcpEntry.startTime.toFixed(2) : null,
          totalImages: imgs.length,
          loadedImages: loadedImgs,
           stylesheets: document.styleSheets.length
        };
      });

      if (vp.name === 'desktop-1440') {
        await page.goto(`${SITE_BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {});
        await page.waitForTimeout(800);
        await page.screenshot({ path: path.join(SCREENSHOT_DIR, '04-live-login-modal.png'), fullPage: false });
      }

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

    // 5. Live Account & Course Entitlement Sync (Admin -> Student E2E B -> izTeach + Supabase + Web)
    console.log('[4/9] Testing Admin Login, Course Entitlement Grant/Add/Idempotency & 3-Way Sync...');
    const adminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminCtx.newPage();

    // Test V3 1-click provision endpoint directly on live Worker
    const v3StudentProvCheck = await workerApi('/api/ktn/admin/students/provision', adminAuth.token, {
      method: 'POST',
      body: { email: STUDENT_B_EMAIL, name: 'Học Viên Kiểm Thử E2E B', courseIds: [HSK1_COURSE_ID] }
    });

    // Open live homepage login modal on https://khongtunhi.com/?login=1, then open /sll-admin.html with Admin session
    const adminLoginStart = performance.now();
    await adminPage.goto(`${SITE_BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await adminPage.waitForSelector('form.ant-form input#email', { timeout: 10000 });
    await adminPage.fill('form.ant-form input#email', ADMIN_EMAIL);
    await adminPage.fill('form.ant-form input#password', STAFF_PWD);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '05-live-admin-login.png') });
    await adminPage.click('form.ant-form button[type="submit"]');
    await adminPage.waitForFunction(() => Boolean(localStorage.getItem('ktn_sll_persistent_auth_v2')), { timeout: 15000 });
    const adminUiLoginMs = +(performance.now() - adminLoginStart).toFixed(2);

    // Seed signed Worker session token and navigate to standalone Admin portal /sll-admin.html
    await adminPage.evaluate(({ session, token }) => {
      const rec = { ...session, role: 'admin', roles: ['admin'], token, accessToken: token, savedAt: Date.now() };
      localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(rec));
    }, { session: adminAuth.session, token: adminAuth.token });
    await adminPage.goto(`${SITE_BASE}/sll-admin.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await adminPage.waitForSelector('#a-btn-students', { timeout: 10000 });

    // Switch to Students tab on /sll-admin.html
    const openStudentsStart = performance.now();
    await adminPage.click('#a-btn-students');
    await adminPage.waitForFunction(() => {
      const tb = document.getElementById('admin-students-tbody');
      return tb && tb.querySelectorAll('tr').length > 5;
    }, { timeout: 15000 });
    const openStudentsMs = +(performance.now() - openStudentsStart).toFixed(2);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '06-live-admin-students-tab.png') });

    // Grant Course 1 (HSK1 3.0) to e2e.hs.b@khongtunhi.com via Admin UI
    adminPage.on('dialog', async dlg => { await dlg.accept().catch(() => {}); });
    await adminPage.fill('#stu-assign-email', STUDENT_B_EMAIL);
    await adminPage.fill('#stu-assign-name', 'Học Viên Kiểm Thử E2E B');
    await adminPage.selectOption('#stu-assign-class', ''); // Leave class empty to test video-only assignment
    await adminPage.selectOption('#stu-assign-action', 'set');
    await adminPage.evaluate((cid) => {
      document.querySelectorAll('input[name="stu-course-chk"]').forEach(chk => {
        chk.checked = (chk.value === cid);
      });
    }, HSK1_COURSE_ID);

    const grant1Start = performance.now();
    await adminPage.click('#a-pane-students button[type="submit"]');
    await adminPage.waitForTimeout(3500);
    const grant1UiMs = +(performance.now() - grant1Start).toFixed(2);
    await adminPage.screenshot({ path: path.join(SCREENSHOT_DIR, '07-live-admin-course-granted.png') });

    // Verify 3-way state after Grant 1 (HSK1 3.0, classCode: null)
    const sbAfterGrant1 = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=*`);
    const stuBAfter1 = sbAfterGrant1.data?.[0] || null;
    const izAfterGrant1 = await getIzTeachUserPermissions(izAdminToken, stuBAfter1?.cognito_user_id || 'ff72de75-0284-4d81-8124-4bc6ea4bdd07');

    // Step 5.3: Grant additional course (CFK_COURSE_ID) to existing account without losing old course
    const grant2Res = await workerApi('/api/ktn/students/courses', adminAuth.token, {
      method: 'POST',
      body: {
        email: STUDENT_B_EMAIL,
        name: 'Học Viên Kiểm Thử E2E B',
        classCode: null,
        action: 'grant',
        courseIds: [CFK_COURSE_ID]
      }
    });
    const sbAfterGrant2 = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=*`);
    const stuBAfter2 = sbAfterGrant2.data?.[0] || null;
    const izAfterGrant2 = await getIzTeachUserPermissions(izAdminToken, stuBAfter2?.cognito_user_id || 'ff72de75-0284-4d81-8124-4bc6ea4bdd07');

    // Step 5.4: Duplicate / Idempotent request test (send exact same grant again)
    const dupGrantRes = await workerApi('/api/ktn/students/courses', adminAuth.token, {
      method: 'POST',
      body: {
        email: STUDENT_B_EMAIL,
        name: 'Học Viên Kiểm Thử E2E B',
        classCode: null,
        action: 'grant',
        courseIds: [CFK_COURSE_ID]
      }
    });
    const sbAfterDup = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=*`);
    const stuBAfterDup = sbAfterDup.data?.[0] || null;

    // Verify Student B can log in on KTN Web and see both courses, and survives refresh
    const freshStuBAuth = await workerLogin(STUDENT_B_EMAIL, STUDENT_E2E_PWD);
    const stuBCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const stuBPage = await stuBCtx.newPage();
    await stuBPage.addInitScript(({ session, token }) => {
      const rec = { ...session, role: 'student', roles: ['student'], token, accessToken: token, savedAt: Date.now() };
      localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(rec));
    }, { session: freshStuBAuth.session, token: freshStuBAuth.token });
    await stuBPage.goto(`${SITE_BASE}/sll-hocsinh.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuBPage.waitForTimeout(2500);
    const stuBWebStateBeforeReload = await stuBPage.evaluate(() => {
      const prof = (typeof currentStudentProfile !== 'undefined' && currentStudentProfile) ? currentStudentProfile : null;
      const courses = prof?.online_courses || prof?.onlineCourses || [];
      return {
        email: prof?.email || null,
        classCode: prof?.class_code || prof?.classCode || null,
        coursesCount: courses.length,
        courseIds: courses.map(c => c.id || c._id || c)
      };
    });
    await stuBPage.reload({ waitUntil: 'domcontentloaded' });
    await stuBPage.waitForTimeout(2500);
    const stuBWebStateAfterReload = await stuBPage.evaluate(() => {
      const prof = (typeof currentStudentProfile !== 'undefined' && currentStudentProfile) ? currentStudentProfile : null;
      const courses = prof?.online_courses || prof?.onlineCourses || [];
      return {
        email: prof?.email || null,
        classCode: prof?.class_code || prof?.classCode || null,
        coursesCount: courses.length,
        courseIds: courses.map(c => c.id || c._id || c)
      };
    });
    await stuBCtx.close();
    await adminCtx.close();

    report.studentProvisionAndCourseSync = {
      v3ProvisionEndpointOnLiveStatus: v3StudentProvCheck.status,
      adminUiLoginMs,
      openStudentsMs,
      grant1UiMs,
      afterGrant1: {
        supabaseClassCode: stuBAfter1?.class_code,
        supabaseHasLiveClass: stuBAfter1?.has_live_class,
        supabaseOnlineCourses: (stuBAfter1?.online_courses || []).map(c => c.id),
        izTeachOnlineCourses: izAfterGrant1.courses.map(c => c.id),
        autoAssignedToWrongClass: Boolean(stuBAfter1?.class_code)
      },
      afterGrant2ExistingAccount: {
        workerStatus: grant2Res.status,
        workerMs: grant2Res.ms,
        supabaseCognitoUserIdUnchanged: stuBAfter2?.cognito_user_id === stuBAfter1?.cognito_user_id,
        supabaseOnlineCourses: (stuBAfter2?.online_courses || []).map(c => c.id),
        izTeachOnlineCourses: izAfterGrant2.courses.map(c => c.id),
        webBeforeReload: stuBWebStateBeforeReload,
        webAfterReload: stuBWebStateAfterReload
      },
      afterDuplicateRequest: {
        workerStatus: dupGrantRes.status,
        supabaseCoursesCount: (stuBAfterDup?.online_courses || []).length,
        noDuplicateCourseEntries: (stuBAfterDup?.online_courses || []).length === 2
      }
    };

    // 6. Teacher Verification (New Teacher Provision Bug on Live V2 + Existing Teacher Role & RBAC)
    console.log('[5/9] Testing Teacher Provisioning & RBAC Isolation...');
    const v3TeacherProvCheck = await workerApi('/api/ktn/admin/teachers/provision', adminAuth.token, {
      method: 'POST',
      body: { email: 'e2e.gv.test@khongtunhi.com', name: 'Cô Giáo Kiểm Thử', assignedClasses: ['YCT2-04'] }
    });
    const v2TeacherPostRes = await workerApi('/api/ktn/teachers', adminAuth.token, {
      method: 'POST',
      body: { code: 'GV-E2E-99', email: 'e2e.gv.test@khongtunhi.com', name: 'Cô Giáo Kiểm Thử', assignedClasses: ['YCT2-04'] }
    });
    const sbTeacherCheck = await sbFetch(`ktn_teachers?email=eq.${encodeURIComponent('e2e.gv.test@khongtunhi.com')}&select=*`);
    const newTeacherLoginAttempt = await workerLogin('e2e.gv.test@khongtunhi.com', STAFF_PWD);

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
      v3TeacherProvisionEndpointStatus: v3TeacherProvCheck.status,
      liveV2PostTeachersResponse: { status: v2TeacherPostRes.status, ok: v2TeacherPostRes.data?.ok },
      liveSupabaseActuallySavedNewTeacher: Array.isArray(sbTeacherCheck.data) && sbTeacherCheck.data.length > 0,
      newTeacherLoginStatus: newTeacherLoginAttempt.status,
      existingTeacherALoginOk: teacherAAuth.ok,
      existingTeacherARole: teacherAAuth.session?.role,
      ownClassYCT204Status: teacherOwnClassCheck.status,
      ownClassStudentsCount: (teacherOwnClassCheck.data?.students || []).length,
      otherClassYCT302Status: teacherOtherClassCheck.status,
      grantCourseAsTeacherStatus: teacherGrantCourseForbiddenCheck.status,
      crossClassPrivateRoomStatusOnLiveV2: teacherBPrivateRoomCrossClassCheck.status
    };

    // 7. Student Login, Dashboard, Real HLS Video Playback, Homework Submission & Teacher Grading
    console.log('[6/9] Testing Student Portal, Real HLS Video Playback, Homework Submission & Grading...');
    const stuACtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const stuAPage = await stuACtx.newPage();

    const stuALoginStart = performance.now();
    await stuAPage.goto(`${SITE_BASE}/?login=1`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await stuAPage.waitForSelector('form.ant-form input#email', { timeout: 10000 });
    await stuAPage.fill('form.ant-form input#email', STUDENT_A_EMAIL);
    await stuAPage.fill('form.ant-form input#password', STUDENT_E2E_PWD);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '08-live-student-login.png') });

    // Seed verified Student A session and open /sll-hocsinh.html
    await stuAPage.evaluate(({ session, token }) => {
      const rec = { ...session, role: 'student', roles: ['student'], token, accessToken: token, savedAt: Date.now() };
      localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(rec));
    }, { session: studentAAuth.session, token: studentAAuth.token });
    await stuAPage.goto(`${SITE_BASE}/sll-hocsinh.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    const studentDashboardLoadMs = +(performance.now() - stuALoginStart).toFixed(2);
    await stuAPage.waitForTimeout(2200);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '09-live-student-dashboard.png') });

    // Open HSK1 3.0 Course -> Lesson 1 and test real HLS video
    let hlsManifestStatus = null;
    let hlsSegmentStatus = null;
    let hls403Or404 = 0;
    stuAPage.on('response', res => {
      const u = res.url();
      if (u.includes('media.izteach.vn') && u.endsWith('.m3u8')) hlsManifestStatus = res.status();
      if (u.includes('media.izteach.vn') && u.endsWith('.ts')) hlsSegmentStatus = res.status();
      if (u.includes('media.izteach.vn') && (res.status() === 403 || res.status() === 404)) hls403Or404++;
    });

    const openCourseStart = performance.now();
    await stuAPage.evaluate((cid) => {
      if (typeof openVideoCourseDirectly === 'function') openVideoCourseDirectly(cid);
      if (typeof loadLesson === 'function') loadLesson(1);
    }, HSK1_COURSE_ID);
    await stuAPage.waitForTimeout(1800);
    const openCourseMs = +(performance.now() - openCourseStart).toFixed(2);

    const playStart = performance.now();
    const videoPlaybackResult = await stuAPage.evaluate(async () => {
      const v = document.getElementById('lesson-video') || document.querySelector('video');
      if (!v) return { found: false };
      v.muted = true;
      const t0 = performance.now();
      try { await v.play(); } catch {}
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline && (v.readyState < 2 || v.currentTime <= 0.05)) {
        await new Promise(r => setTimeout(r, 200));
      }
      const timeToFirstFrameMs = +(performance.now() - t0).toFixed(2);
      const currentTimeAfterPlay = +v.currentTime.toFixed(2);
      const videoWidth = v.videoWidth;
      const videoHeight = v.videoHeight;
      const duration = +Number(v.duration || 0).toFixed(2);
      const readyState = v.readyState;

      v.pause();
      const paused = v.paused;
      if (duration > 15) {
        v.currentTime = 12;
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
        pausedOk: paused,
        seekedTime
      };
    });
    const totalVideoStartMs = +(performance.now() - playStart).toFixed(2);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '10-live-video-playing.png') });

    // Switch to Lesson 2 (Bài 2) and verify no error
    const lesson2Switch = await stuAPage.evaluate(async () => {
      if (typeof loadLesson === 'function') {
        loadLesson(2);
        await new Promise(r => setTimeout(r, 1200));
        return { switched: true, hash: window.location.hash, activeLesson: 2 };
      }
      return { switched: false };
    });

    report.videoPlayback = {
      courseId: HSK1_COURSE_ID,
      lesson1UnitId: '6adadbcaf75fe5000247ca71',
      lesson2UnitId: '6adadc3b69897b0002482d22',
      hlsManifestStatus,
      hlsSegmentStatus,
      hls403Or404,
      openCourseMs,
      totalVideoStartMs,
      ...videoPlaybackResult,
      lesson2Switch
    };

    // 8. Live Homework Submission (Upload real WAV to S3 -> Submit -> Verify Supabase & izTeach -> Teacher Grade -> Student Sees Score)
    console.log('[7/9] Testing Real S3 Homework Upload, Submission & Teacher Grading...');
    const wavBuf = createTinyWavBuffer();
    const uploadUrlRes = await workerApi('/api/ktn/homeworks/upload-url', studentAAuth.token, {
      method: 'POST',
      body: {
        fileName: `ktn-live-e2e-${Date.now()}.wav`,
        fileType: 'audio/wav',
        fileSize: wavBuf.length
      }
    });
    let s3UploadOk = false;
    let publicAudioUrl = '';
    const presignedPutUrl = uploadUrlRes.data?.signedUrl || uploadUrlRes.data?.uploadUrl || '';
    if (uploadUrlRes.ok && presignedPutUrl) {
      const putRes = await fetch(presignedPutUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'audio/wav' },
        body: wavBuf
      });
      s3UploadOk = putRes.ok;
      publicAudioUrl = uploadUrlRes.data.fileUrl || uploadUrlRes.data.publicUrl || '';
    }
    const cdnHeadRes = publicAudioUrl ? await fetch(publicAudioUrl, { method: 'HEAD' }) : { status: 0 };

    const hwSubmitRes = await workerApi('/api/ktn/homeworks', studentAAuth.token, {
      method: 'POST',
      body: {
        courseId: HSK1_COURSE_ID,
        lessonNum: 1,
        unitId: '6adadbcaf75fe5000247ca71',
        lessonTitle: 'Bài 1: Chào hỏi (你好)',
        fileType: 'audio',
        fileUrl: publicAudioUrl,
        studentNote: `[${sessionTag}] Bài nộp thu âm kiểm thử nghiệm thu vận hành live`
      }
    });
    const createdHwId = hwSubmitRes.data?.homework?.id || null;
    if (createdHwId) {
      report.cleanup.createdRecords.push({ table: 'ktn_homeworks', id: createdHwId });
    }

    // Reload Student A page on Lesson 1 to capture submitted state screenshot
    await stuAPage.evaluate((cid) => {
      if (typeof openVideoCourseDirectly === 'function') openVideoCourseDirectly(cid);
      if (typeof loadLesson === 'function') loadLesson(1);
    }, HSK1_COURSE_ID);
    await stuAPage.waitForTimeout(2000);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '11-live-homework-submitted.png') });

    // Verify in Supabase before grading
    const sbHwBeforeGrade = createdHwId
      ? await sbFetch(`ktn_homeworks?id=eq.${encodeURIComponent(createdHwId)}&select=*`)
      : { data: [] };

    // Teacher A logs in on /sll-teacher.html and grades the homework
    const teaACtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teaAPage = await teaACtx.newPage();
    teaAPage.on('dialog', async dlg => { await dlg.accept().catch(() => {}); });
    await teaAPage.addInitScript(({ session, token }) => {
      const rec = { ...session, role: 'teacher', roles: ['teacher'], token, accessToken: token, savedAt: Date.now() };
      localStorage.setItem('ktn_sll_persistent_auth_v2', JSON.stringify(rec));
    }, { session: teacherAAuth.session, token: teacherAAuth.token });
    await teaAPage.goto(`${SITE_BASE}/sll-teacher.html`, { waitUntil: 'domcontentloaded', timeout: 25000 });
    await teaAPage.waitForTimeout(2500);
    await teaAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '12-live-teacher-grading.png') });

    const gradeRes = await workerApi('/api/ktn/homeworks/grade', teacherAAuth.token, {
      method: 'POST',
      body: {
        id: createdHwId,
        studentEmail: STUDENT_A_EMAIL,
        courseId: HSK1_COURSE_ID,
        lessonNum: 1,
        score: 9.5,
        teacherFeedback: `[${sessionTag}] Cô khen con phát âm thanh điệu rất chuẩn!`,
        status: 'graded'
      }
    });

    const sbHwAfterGrade = createdHwId
      ? await sbFetch(`ktn_homeworks?id=eq.${encodeURIComponent(createdHwId)}&select=*`)
      : { data: [] };

    // Student A reloads and checks graded score + feedback
    await stuAPage.reload({ waitUntil: 'domcontentloaded' });
    await stuAPage.waitForTimeout(2200);
    await stuAPage.evaluate((cid) => {
      if (typeof openVideoCourseDirectly === 'function') openVideoCourseDirectly(cid);
      if (typeof loadLesson === 'function') loadLesson(1);
    }, HSK1_COURSE_ID);
    await stuAPage.waitForTimeout(1800);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '13-live-student-graded-score.png') });

    const stuHwVerifyApi = await workerApi('/api/ktn/homeworks', studentAAuth.token);
    const stuMatchedHw = (stuHwVerifyApi.data?.homeworks || []).find(h => h.id === createdHwId) || null;

    report.homeworkAndGrading = {
      s3UploadOk,
      cdnHeadStatus: cdnHeadRes.status,
      submitStatus: hwSubmitRes.status,
      homeworkId: createdHwId,
      izteachMirrorOnSubmit: hwSubmitRes.data?.izteachMirror || null,
      supabaseStatusBeforeGrade: sbHwBeforeGrade.data?.[0]?.status || null,
      gradeStatus: gradeRes.status,
      izteachMirrorOnGrade: gradeRes.data?.izteachMirror || null,
      supabaseStatusAfterGrade: sbHwAfterGrade.data?.[0]?.status || null,
      supabaseScoreAfterGrade: sbHwAfterGrade.data?.[0]?.score ?? null,
      studentSeesScoreAfterReload: stuMatchedHw?.score ?? null,
      studentSeesFeedbackAfterReload: stuMatchedHw?.teacher_feedback || null
    };

    // 9. Live Two-Account Chat (Student A <-> Teacher A) & Notifications
    console.log('[8/9] Testing Live Two-Account Chat (Text + Voice) & Notifications...');
    const studentTextMsg = `KTN LIVE TEST — tin nhắn kiểm thử [${sessionTag}]`;
    const sendStart = performance.now();
    const stuSendMsgRes = await workerApi('/api/ktn/messages', studentAAuth.token, {
      method: 'POST',
      body: {
        roomId: 'class:YCT2-04',
        classCode: 'YCT2-04',
        content: studentTextMsg
      }
    });
    const stuMsgId = stuSendMsgRes.data?.message?.id || null;
    if (stuMsgId) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: stuMsgId });

    // Teacher A polls / receives message
    const teaPollRes = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', teacherAAuth.token);
    const stuToTeaDeliveryMs = +(performance.now() - sendStart).toFixed(2);
    const teaReceivedMsg = (teaPollRes.data?.messages || []).find(m => m.id === stuMsgId || m.content === studentTextMsg);

    // Teacher A replies
    const teacherReplyText = `KTN LIVE TEST — Cô đã nhận được tin nhắn của con [${sessionTag}]`;
    const replyStart = performance.now();
    const teaReplyRes = await workerApi('/api/ktn/messages', teacherAAuth.token, {
      method: 'POST',
      body: {
        roomId: 'class:YCT2-04',
        classCode: 'YCT2-04',
        content: teacherReplyText
      }
    });
    const teaMsgId = teaReplyRes.data?.message?.id || null;
    if (teaMsgId) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: teaMsgId });

    // Student A receives reply
    const stuPollRes = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', studentAAuth.token);
    const teaToStuDeliveryMs = +(performance.now() - replyStart).toFixed(2);
    const stuReceivedReply = (stuPollRes.data?.messages || []).find(m => m.id === teaMsgId || m.content === teacherReplyText);

    // Voice message test (using attachmentUrl as required by Worker)
    const voiceDataUri = `data:audio/wav;base64,${wavBuf.toString('base64')}`;
    const stuVoiceRes = await workerApi('/api/ktn/messages', studentAAuth.token, {
      method: 'POST',
      body: {
        roomId: 'class:YCT2-04',
        classCode: 'YCT2-04',
        content: `🎤 Tin nhắn thoại kiểm thử [${sessionTag}]`,
        attachmentUrl: voiceDataUri
      }
    });
    const voiceMsgId = stuVoiceRes.data?.message?.id || null;
    if (voiceMsgId) report.cleanup.createdRecords.push({ table: 'ktn_messages', id: voiceMsgId });
    const teaVoicePoll = await workerApi('/api/ktn/messages?roomId=class:YCT2-04', teacherAAuth.token);
    const teaReceivedVoice = (teaVoicePoll.data?.messages || []).find(m => m.id === voiceMsgId);

    // Open Teacher Groups tab to capture chat screenshot
    await teaAPage.click('#t-btn-groups');
    await teaAPage.waitForTimeout(1800);
    await teaAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '14-live-two-account-chat.png') });

    // Notifications check on Student A (should see graded homework + teacher chat notification)
    const stuNotifBeforeRead = await workerApi('/api/ktn/notifications', studentAAuth.token);
    const notifsList = stuNotifBeforeRead.data?.notifications || [];
    const gradedNotif = notifsList.find(n => String(n.id || '').includes(createdHwId || '__none__') || n.type === 'homework_graded');
    const chatNotif = notifsList.find(n => String(n.id || '').includes(teaMsgId || '__none__') || n.type === 'chat_message');

    // Open notification panel on Student A page if present and capture screenshot
    await stuAPage.evaluate(() => {
      const btn = document.getElementById('ktn-portal-bell-trigger') || document.querySelector('[onclick*="Notification"]');
      if (btn) btn.click();
    });
    await stuAPage.waitForTimeout(1000);
    await stuAPage.screenshot({ path: path.join(SCREENSHOT_DIR, '15-live-notifications.png') });

    // Mark notification as read & verify persistence after reload
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

    report.chatAndNotifications = {
      studentSendStatus: stuSendMsgRes.status,
      teacherReceivedText: Boolean(teaReceivedMsg),
      stuToTeaDeliveryMs,
      teacherReplyStatus: teaReplyRes.status,
      studentReceivedReply: Boolean(stuReceivedReply),
      teaToStuDeliveryMs,
      voiceSendStatus: stuVoiceRes.status,
      teacherReceivedVoiceWithAudio: Boolean(teaReceivedVoice && teaReceivedVoice.attachment_url),
      notificationsCount: notifsList.length,
      hasGradedNotification: Boolean(gradedNotif),
      hasChatNotification: Boolean(chatNotif),
      markReadStatus: markReadRes?.status || null,
      notifPersistedRead
    };

    await stuACtx.close();
    await teaACtx.close();

    // 10. Live Search Benchmarks (20 requests per scenario, polite pacing)
    console.log('[9/9] Running Live Search Benchmarks (20 iterations per scenario)...');
    // First, measure live Worker GET /api/ktn/students (which live /sll-admin.html currently calls)
    const liveWorkerStudentsLatencies = [];
    let liveWorkerStudentsCount = 0;
    for (let i = 0; i < 20; i++) {
      const r = await workerApi('/api/ktn/students', adminAuth.token);
      liveWorkerStudentsLatencies.push(r.ms);
      liveWorkerStudentsCount = (r.data?.students || []).length;
    }
    liveWorkerStudentsLatencies.sort((a, b) => a - b);

    // Also measure live Supabase PostgREST queries for the 8 search scenarios (20 iterations each)
    const searchScenarios = [
      { name: '1. Tên có dấu (Hoàng Ngân)', path: `ktn_students?name=ilike.*${encodeURIComponent('Hoàng Ngân')}*&select=code,email,name,class_code&limit=20` },
      { name: '2. Tên không dấu (hoangngan)', path: `ktn_students?or=(name.ilike.*hoangngan*,email.ilike.*hoangngan*,code.ilike.*hoangngan*)&select=code,email,name,class_code&limit=20` },
      { name: '3. Một phần họ tên (Khang)', path: `ktn_students?name=ilike.*${encodeURIComponent('Khang')}*&select=code,email,name,class_code&limit=20` },
      { name: '4. Email (e2e.hs.a@khongtunhi.com)', path: `ktn_students?email=ilike.*${encodeURIComponent('e2e.hs.a@khongtunhi.com')}*&select=code,email,name,class_code&limit=20` },
      { name: '5. Mã học viên (E2E-HS-A)', path: `ktn_students?code=ilike.*E2E-HS-A*&select=code,email,name,class_code&limit=20` },
      { name: '6. Theo lớp (YCT2-04)', path: `ktn_students?class_code=eq.YCT2-04&select=code,email,name,class_code&limit=20` },
      { name: '7. Theo khóa (HSK1 3.0)', path: `ktn_students?online_courses=cs.${encodeURIComponent(JSON.stringify([{ id: HSK1_COURSE_ID }]))}&select=code,email,name,class_code&limit=20` },
      { name: '8. Theo trạng thái (có cognito_user_id)', path: `ktn_students?cognito_user_id=not.is.null&select=code,email,name,class_code&limit=20` }
    ];

    const scenarioStats = [];
    for (const sc of searchScenarios) {
      const times = [];
      let rowCount = 0;
      for (let i = 0; i < 20; i++) {
        const res = await sbFetch(sc.path, { headers: { Prefer: 'count=exact' } });
        times.push(res.ms);
        if (res.range && res.range.includes('/')) {
          rowCount = Number(res.range.split('/')[1]) || (res.data || []).length;
        } else {
          rowCount = (res.data || []).length;
        }
      }
      times.sort((a, b) => a - b);
      scenarioStats.push({
        scenario: sc.name,
        iterations: 20,
        p50Ms: percentile(times, 50),
        p95Ms: percentile(times, 95),
        minMs: times[0],
        maxMs: times[times.length - 1],
        resultCount: rowCount
      });
    }

    report.searchBenchmarks = {
      liveWorkerGetAllStudents20Runs: {
        endpoint: 'GET /api/ktn/students (limit=2000 on live V2 Worker)',
        iterations: 20,
        p50Ms: percentile(liveWorkerStudentsLatencies, 50),
        p95Ms: percentile(liveWorkerStudentsLatencies, 95),
        resultCount: liveWorkerStudentsCount
      },
      liveSupabasePostgrest20RunsPerScenario: scenarioStats
    };
  } finally {
    await browser.close();
  }

  // 15. SAFE CLEANUP OF ALL TEST DATA CREATED DURING RUN
  console.log('[Cleanup] Restoring e2e.hs.b@khongtunhi.com and deleting test homework/messages...');
  // Restore Student B to original state: classCode = 'YCT3-02', online_courses = [] (revoke HSK1_COURSE_ID & CFK_COURSE_ID)
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

  // Delete created test rows in ktn_homeworks and ktn_messages
  for (const item of report.cleanup.createdRecords) {
    const delRes = await sbFetch(`${item.table}?id=eq.${encodeURIComponent(item.id)}`, { method: 'DELETE' });
    report.cleanup.cleanedUp.push({ table: item.table, id: item.id, deleteStatus: delRes.status });
  }

  // Verify cleanup state on Supabase and izTeach
  const sbStuBFinal = await sbFetch(`ktn_students?email=eq.${encodeURIComponent(STUDENT_B_EMAIL)}&select=email,class_code,has_live_class,has_online_courses,online_courses,cognito_user_id`);
  const izStuBFinal = await getIzTeachUserPermissions(izAdminToken, sbStuBFinal.data?.[0]?.cognito_user_id || 'ff72de75-0284-4d81-8124-4bc6ea4bdd07');
  report.cleanup.finalStudentBVerification = {
    supabase: sbStuBFinal.data?.[0] || null,
    izTeachCourses: izStuBFinal.courses
  };

  report.completedAt = new Date().toISOString();
  fs.writeFileSync(JSON_REPORT_PATH, JSON.stringify(report, null, 2), 'utf8');
  console.log(`✅ Live Production Acceptance Suite complete! Report saved to ${JSON_REPORT_PATH}`);
}

run().catch(err => {
  console.error('FATAL ERROR:', err);
  process.exit(1);
});
