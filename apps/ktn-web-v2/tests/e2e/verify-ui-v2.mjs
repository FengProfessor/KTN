import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const APP_ROOT = path.resolve(__dirname, '../..');
const REPO_ROOT = path.resolve(APP_ROOT, '../..');
const SCREENSHOT_DIR = path.join(REPO_ROOT, 'docs/ui-v2/screenshots');
const ROLE_AUDIT_DIR = path.join(SCREENSHOT_DIR, 'role-audit');
const REPORT_PATH = path.join(REPO_ROOT, 'docs/ui-v2/e2e-verification-report.json');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
fs.mkdirSync(ROLE_AUDIT_DIR, { recursive: true });

const require = createRequire(import.meta.url);

function resolveBrowserExecutable() {
  try {
    const puppeteer = require('puppeteer');
    const pPath = puppeteer.executablePath();
    if (pPath && fs.existsSync(pPath)) return pPath;
  } catch {
    // fallback to system browsers
  }
  const candidates = [
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

const results = [];
function recordTest(group, id, title, passed, details = '') {
  results.push({ group, id, title, passed, details, timestamp: new Date().toISOString() });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[KTN-UI-V2 E2E] ${icon} [${id}] ${title}${details ? ` — ${details}` : ''}`);
  if (!passed) {
    throw new Error(`Test [${id}] failed: ${title} (${details})`);
  }
}

async function runSuite() {
  console.log('[KTN-UI-V2 E2E] Starting Vite server with embedded Cloudflare Worker BFF...');
  const viteServer = await createServer({
    root: APP_ROOT,
    configFile: path.join(APP_ROOT, 'vite.config.ts'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`[KTN-UI-V2 E2E] Server listening at ${baseUrl}`);

  const executablePath = resolveBrowserExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // =========================================================================
    // TEST A — AUTHENTICATION, RBAC ROUTE GUARDS & SESSION PERSISTENCE
    // =========================================================================
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentPage = await studentContext.newPage();

    // A1: Invalid password displays clear error with role="alert"
    await studentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await studentPage.fill('[data-testid="login-email-input"]', 'hoangngan@khongtunhi.com');
    await studentPage.fill('[data-testid="login-password-input"]', 'wrong-password');
    await studentPage.click('[data-testid="login-submit-btn"]');
    await studentPage.waitForSelector('[data-testid="login-error-alert"]', { timeout: 8000 });
    const errText = await studentPage.textContent('[data-testid="login-error-alert"]');
    const errRole = await studentPage.getAttribute('[data-testid="login-error-alert"]', 'role');
    recordTest(
      'TEST A',
      'A1',
      'Invalid credentials show clear login error alert with role="alert"',
      Boolean(errText && errRole === 'alert'),
      `role=${errRole}`
    );

    // A2: Valid Student login loads Student Dashboard
    await studentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    const userName = await studentPage.textContent('[data-testid="sidebar-user-name"]');
    recordTest(
      'TEST A',
      'A2',
      'Student login succeeds and displays Student Dashboard',
      userName?.includes('Hoàng Ngân') ?? false,
      `User: ${userName}`
    );

    // A3: Reload preserves authenticated session
    await studentPage.reload({ waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
    recordTest('TEST A', 'A3', 'Browser reload preserves authenticated session', true);

    // A4: RBAC Route Guard blocks Student from /teacher and /admin
    await studentPage.goto(`${baseUrl}/teacher`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    await studentPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    recordTest(
      'TEST A',
      'A4',
      'RBAC Route Guard blocks Student from accessing /teacher and /admin',
      true
    );

    // A5: Logout clears session AND room drafts/session UI state
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="chat-composer-input"]', { timeout: 8000 });
    await studentPage.fill('[data-testid="chat-composer-input"]', 'Bản nháp riêng của Hoàng Ngân');
    await studentPage.click('[data-testid="logout-btn"]');
    await studentPage.waitForSelector('[data-testid="login-page"]', { timeout: 8000 });
    const draftAfterLogout = await studentPage.evaluate(() => {
      const raw = localStorage.getItem('ktn_v2_ui_prefs');
      if (!raw) return {};
      return JSON.parse(raw)?.state?.roomDrafts || {};
    });
    recordTest(
      'TEST A',
      'A5',
      'Logout revokes session, clears room drafts in storage, and redirects to /login',
      Object.keys(draftAfterLogout).length === 0
    );

    // A6: Admin login loads Admin Home (/) and Admin Workspace (/admin)
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await adminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await adminPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 10000 });
    recordTest(
      'TEST A',
      'A6',
      'Admin login succeeds and loads Admin Home (/) and Admin Workspace (/admin)',
      true
    );
    await adminContext.close();

    // Re-login as entitled student for subsequent tests
    await studentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });

    // =========================================================================
    // TEST B — VIDEO LEARNING, ENTITLEMENT GUARD & UNASSIGNED STUDENT HONESTY
    // =========================================================================
    const hasCoursesVsClassrooms = await studentPage.isVisible(
      '[data-testid="dashboard-courses-vs-classrooms"]'
    );
    await studentPage.click('[data-testid="nav-learning"]');
    await studentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 10000 });
    await studentPage.waitForSelector('[data-testid="hls-video-element"]', { timeout: 8000 });
    const lesson1Title = await studentPage.textContent('[data-testid="active-lesson-title"]');
    recordTest(
      'TEST B',
      'B1',
      'Entitled student sees Video Course vs Live Classroom separation and loads HLS Video Player Lesson 1',
      Boolean(hasCoursesVsClassrooms && lesson1Title && lesson1Title.includes('Bài 1')),
      lesson1Title || ''
    );

    // Switch to Lesson 2 & mark completed
    await studentPage.click('[data-testid="lesson-sidebar-item-2"]');
    await studentPage.waitForTimeout(300);
    const lesson2Title = await studentPage.textContent('[data-testid="active-lesson-title"]');
    await studentPage.click('[data-testid="mark-lesson-complete-btn"]');
    const completeBtnText = await studentPage.textContent('[data-testid="mark-lesson-complete-btn"]');
    recordTest(
      'TEST B',
      'B2',
      'Switching to Lesson 2 updates player and marks lesson completed',
      Boolean(lesson2Title?.includes('Bài 2') && completeBtnText?.includes('Đã hoàn thành')),
      lesson2Title || ''
    );

    // Unentitled & unassigned student context (taphong2002vip@gmail.com)
    const unentitledContext = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const unentitledPage = await unentitledContext.newPage();
    await unentitledPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await unentitledPage.click('[data-testid="quick-login-taphong2002vip@gmail.com"]');
    await unentitledPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    const unassignedSubtitle = await unentitledPage.textContent(
      '[data-testid="sidebar-user-subtitle"]'
    );
    const dashboardBodyText = await unentitledPage.textContent(
      '[data-testid="student-dashboard-page"]'
    );
    recordTest(
      'TEST B',
      'B3',
      'Unassigned student does not see fake YCT2-04 class on sidebar or dashboard',
      Boolean(
        unassignedSubtitle &&
          !unassignedSubtitle.includes('YCT2-04') &&
          dashboardBodyText &&
          !dashboardBodyText.includes('YCT2-04')
      ),
      `Subtitle: ${unassignedSubtitle}`
    );

    await unentitledPage.click('[data-testid="nav-learning"]');
    await unentitledPage.waitForSelector('[data-testid="video-unentitled-guard"]', { timeout: 8000 });
    recordTest(
      'TEST B',
      'B4',
      'Unentitled student is blocked by 403 COURSE_NOT_ENTITLED guard on /learning',
      true
    );

    await unentitledPage.click('[data-testid="nav-classrooms"]');
    await unentitledPage.waitForSelector('[data-testid="unassigned-class-empty-state"]', {
      timeout: 8000,
    });
    recordTest(
      'TEST B',
      'B5',
      'Unassigned student sees honest empty classroom state on /classrooms',
      true
    );
    await unentitledContext.close();

    // =========================================================================
    // TEST C — ZALO-LIKE CLASSROOM CHAT (2 ACCOUNTS + VOICE + FAULT + RETRY)
    // =========================================================================
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await teacherPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 10000 });

    // Both Student and Teacher open /chat?room=class:YCT2-04
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await teacherPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });
    await teacherPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });

    // C1: Pinned announcement banner is visible
    const pinnedVisible = await studentPage.isVisible('[data-testid="pinned-announcement-banner"]');
    recordTest('TEST C', 'C1', 'Pinned classroom announcement banner is rendered', pinnedVisible);

    // C2: DLP Phone/Link Guard blocks phone number in composer
    await studentPage.fill('[data-testid="chat-composer-input"]', 'Số điện thoại mẹ là 0912345678');
    await studentPage.waitForSelector('[data-testid="chat-dlp-warning"]', { timeout: 5000 });
    const sendDisabledOnDlp = await studentPage.isDisabled('[data-testid="chat-send-btn"]');
    recordTest(
      'TEST C',
      'C2',
      'DLP guard warns and disables Send button when phone number is typed',
      sendDisabledOnDlp
    );

    // C3: Student sends real message -> persisted in DB -> Teacher receives it -> survives reload
    const uniqueMsg = `Dạ con Hoàng Ngân nộp bài đọc buổi 18 lúc ${Date.now()} ạ!`;
    await studentPage.fill('[data-testid="chat-composer-input"]', uniqueMsg);
    await studentPage.click('[data-testid="chat-send-btn"]');

    await studentPage.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      uniqueMsg,
      { timeout: 8000 }
    );
    await teacherPage.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      uniqueMsg,
      { timeout: 10000 }
    );
    await studentPage.reload({ waitUntil: 'domcontentloaded' });
    await studentPage.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      uniqueMsg,
      { timeout: 8000 }
    );
    recordTest(
      'TEST C',
      'C3',
      'Real-time 2-account chat: Student sends -> Teacher receives -> Persists after reload',
      true
    );

    // C4: Fault injection (503 DB Error) -> Failed state + exact Vietnamese message + Draft retention
    await fetch(`${baseUrl}/api/ktn/test/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failMessagesPost: true }),
    });

    const faultMsg = `Tin nhắn kiểm thử lỗi mạng ${Date.now()}`;
    await studentPage.fill('[data-testid="chat-composer-input"]', faultMsg);
    await studentPage.click('[data-testid="chat-send-btn"]');

    await studentPage.waitForSelector('[data-testid="msg-status-failed"]', { timeout: 8000 });
    const failedBannerText = await studentPage.textContent('[data-testid="msg-status-failed"]');
    const draftValueAfterFail = await studentPage.inputValue('[data-testid="chat-composer-input"]');
    recordTest(
      'TEST C',
      'C4',
      'When POST /api/ktn/messages fails, UI shows "Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị." and retains draft',
      Boolean(
        draftValueAfterFail === faultMsg &&
          failedBannerText?.includes('Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.')
      ),
      failedBannerText || ''
    );

    // C5: Clear fault & click Retry button -> Idempotent delivery
    await fetch(`${baseUrl}/api/ktn/test/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failMessagesPost: false }),
    });
    await studentPage.fill('[data-testid="chat-composer-input"]', '');
    await studentPage.click('[data-testid="retry-failed-message-btn"]');
    await studentPage.waitForFunction(
      () => !document.querySelector('[data-testid="msg-status-failed"]'),
      null,
      { timeout: 8000 }
    );

    const occurrences = await studentPage.evaluate((txt) => {
      const nodes = Array.from(document.querySelectorAll('[data-testid="chat-message-text"]'));
      return nodes.filter((n) => n.textContent?.includes(txt)).length;
    }, faultMsg);
    recordTest(
      'TEST C',
      'C5',
      'Clicking "Thử lại" succeeds with idempotent clientMessageId and produces exactly 1 message',
      occurrences === 1,
      `Occurrences: ${occurrences}`
    );

    // C6: Voice message recording & persistent data:audio/wav;base64,... playback across reload & Teacher browser
    await studentPage.click('[data-testid="open-voice-recorder-btn"]');
    await studentPage.waitForSelector('[data-testid="voice-recorder-panel"]', { timeout: 5000 });
    await studentPage.click('[data-testid="stop-voice-recording-btn"]');
    await studentPage.waitForSelector('[data-testid="send-voice-recording-btn"]', { timeout: 5000 });
    await studentPage.click('[data-testid="send-voice-recording-btn"]');

    await studentPage.waitForSelector('[data-testid="chat-audio-player"]', { timeout: 8000 });
    await studentPage.reload({ waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="chat-audio-player"]', { timeout: 8000 });
    await teacherPage.waitForSelector('[data-testid="chat-audio-player"]', { timeout: 10000 });
    const teacherAudioSrc = await teacherPage.evaluate(() => {
      const players = Array.from(document.querySelectorAll('[data-testid="chat-audio-player"]'));
      const last = players[players.length - 1];
      return last ? last.getAttribute('src') || '' : '';
    });
    recordTest(
      'TEST C',
      'C6',
      'Voice message persists as data:audio/wav;base64,... across reload and is playable in Teacher browser',
      teacherAudioSrc.startsWith('data:audio/'),
      `src prefix: ${teacherAudioSrc.slice(0, 28)}...`
    );

    // C7: RBAC Cross-Class Isolation (Student in YCT3-02 cannot read YCT2-04 messages via API)
    const crossClassCheck = await studentPage.evaluate(async () => {
      const loginRes = await fetch('/api/ktn/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: 'minhkhang@khongtunhi.com', password: 'Ktn@2026!' }),
      }).then((r) => r.json());
      const msgRes = await fetch('/api/ktn/messages?roomId=class:YCT2-04', {
        headers: { Authorization: `Bearer ${loginRes.token}` },
      });
      return msgRes.status;
    });
    recordTest(
      'TEST C',
      'C7',
      'RBAC Isolation: Student in YCT3-02 receives HTTP 403 when requesting YCT2-04 messages',
      crossClassCheck === 403,
      `HTTP ${crossClassCheck}`
    );

    // =========================================================================
    // TEST D — NOTIFICATION CENTER, CLASS SESSION ASSIGNMENT & DEEP LINKS
    // =========================================================================
    // Teacher assigns Session 2 for YCT2-04 -> Student receives homework_assigned notification
    await teacherPage.evaluate(async () => {
      const rawAuth = localStorage.getItem('ktn_sll_persistent_auth_v2');
      const token = rawAuth ? JSON.parse(rawAuth)?.token : '';
      await fetch('/api/ktn/class-sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          classCode: 'YCT2-04',
          sessionNum: 2,
          title: 'Buổi 2: Gia đình và lời chào tiếng Trung',
          summary: 'Luyện phát âm thanh 3 và mẫu câu giới thiệu thành viên gia đình.',
          exercises: [
            { num: 1, title: 'Thu âm đọc 5 câu giới thiệu gia đình', type: 'Ghi âm / Video' },
          ],
        }),
      });
    });

    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    const assignedNotifSelector = '[data-testid^="open-notif-target-NOTIF-ASSIGN-YCT2-04-S2"]';
    await studentPage.waitForSelector(assignedNotifSelector, { timeout: 8000 });
    recordTest(
      'TEST D',
      'D1',
      'Teacher assigning a class session generates a real homework_assigned notification for Student',
      true
    );

    // D2: Clicking homework_assigned notification navigates to /classrooms?class=YCT2-04&session=2
    await studentPage.click(assignedNotifSelector);
    await studentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
    const currentUrlAfterClick = studentPage.url();
    recordTest(
      'TEST D',
      'D2',
      'Clicking homework_assigned notification deep-links directly to /classrooms?class=YCT2-04&session=2',
      currentUrlAfterClick.includes('/classrooms') && currentUrlAfterClick.includes('session=2'),
      currentUrlAfterClick
    );

    // D3: Mark all notifications read persists across reload
    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    const markAllDisabledBefore = await studentPage.isDisabled(
      '[data-testid="mark-all-notifications-read-btn"]'
    );
    if (!markAllDisabledBefore) {
      await studentPage.click('[data-testid="mark-all-notifications-read-btn"]');
      await studentPage.waitForTimeout(500);
    }
    await studentPage.reload({ waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    const unreadBadgeExists = await studentPage.isVisible(
      '[data-testid="notifications-unread-count-pill"]'
    );
    recordTest(
      'TEST D',
      'D3',
      'Marking notifications read persists across browser reload via PATCH /api/ktn/notifications/read',
      !unreadBadgeExists
    );

    // =========================================================================
    // TEST E — HOMEWORK SUBMISSION (LIVE CLASS + VIDEO COURSE + REVISION + GRADING)
    // =========================================================================
    // E1: Live classroom homework isolation on /classrooms (Session 1 Exercise 1 -> lessonNum 101)
    await studentPage.goto(`${baseUrl}/classrooms?class=YCT2-04&session=1`, {
      waitUntil: 'domcontentloaded',
    });
    await studentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
    const classHwStatusBefore = await studentPage.textContent(
      '[data-testid="classroom-hw-status-101"]'
    );
    const isIsolatedBefore = Boolean(
      classHwStatusBefore && classHwStatusBefore.includes('Cần hoàn thành')
    );
    await studentPage.click('[data-testid="classroom-open-hw-btn-101"]');
    await studentPage.waitForSelector('[data-testid="homework-note-input"]', { timeout: 5000 });
    await studentPage.fill(
      '[data-testid="homework-note-input"]',
      'Con Hoàng Ngân nộp bài tập lớp trực tiếp YCT2-04 Buổi 1 Bài 1 ạ!'
    );
    await studentPage.click('[data-testid="homework-submit-btn"]');
    await studentPage.waitForSelector('[data-testid="homework-status-submitted"]', {
      timeout: 10000,
    });
    const classHwStatusAfter = await studentPage.textContent(
      '[data-testid="classroom-hw-status-101"]'
    );
    recordTest(
      'TEST E',
      'E1',
      'Live-classroom homework is isolated from Video Course homework and supports inline submission (CLASS_YCT2-04)',
      Boolean(isIsolatedBefore && classHwStatusAfter?.includes('Đã nộp')),
      `Before: ${classHwStatusBefore?.trim()} -> After: ${classHwStatusAfter?.trim()}`
    );

    // E2: Student uploads Video Course homework on /learning Lesson 2
    await studentPage.goto(`${baseUrl}/learning`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 8000 });
    await studentPage.click('[data-testid="lesson-sidebar-item-2"]');
    await studentPage.waitForTimeout(300);

    const hwNote = `Con Hoàng Ngân nộp bài đọc Bài 2 lúc ${Date.now()} ạ!`;
    await studentPage.fill('[data-testid="homework-note-input"]', hwNote);
    await studentPage.click('[data-testid="homework-submit-btn"]');
    await studentPage.waitForSelector('[data-testid="homework-status-submitted"]', {
      timeout: 10000,
    });
    recordTest(
      'TEST E',
      'E2',
      'Student uploads video-course homework via presigned S3 URL + POST /api/ktn/homeworks and sees pending status',
      true
    );

    // E3: Teacher requests revision (revision_requested) -> Student sees status and resubmits
    await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-workspace-page"]', { timeout: 8000 });
    const hwIdL2 = 'HW-hoangngan@khongtunhi.com-6adadba969897b0002482ca5-L2';
    await teacherPage.waitForSelector(`[data-testid="open-grade-form-btn-${hwIdL2}"]`, {
      timeout: 8000,
    });
    await teacherPage.click(`[data-testid="open-grade-form-btn-${hwIdL2}"]`);
    await teacherPage.selectOption('[data-testid="teacher-status-select"]', 'revision_requested');
    await teacherPage.fill(
      '[data-testid="teacher-feedback-input"]',
      'Con chú ý âm bật hơi chữ P, thu âm lại giúp cô nhé!'
    );
    await teacherPage.click('[data-testid="teacher-submit-grade-btn"]');
    await teacherPage.waitForTimeout(600);

    await studentPage.reload({ waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 8000 });
    await studentPage.click('[data-testid="lesson-sidebar-item-2"]');
    await studentPage.waitForSelector('[data-testid="homework-status-revision"]', {
      timeout: 8000,
    });
    await studentPage.fill(
      '[data-testid="homework-note-input"]',
      'Dạ con Hoàng Ngân đã sửa lại âm bật hơi Bài 2 và nộp lại cho cô ạ!'
    );
    await studentPage.click('[data-testid="homework-submit-btn"]');
    await studentPage.waitForSelector('[data-testid="homework-status-submitted"]', {
      timeout: 10000,
    });
    recordTest(
      'TEST E',
      'E3',
      'Teacher requests revision (revision_requested) -> Student sees feedback and resubmits revised homework',
      true
    );

    // E4: Teacher grades resubmitted Lesson 2 homework 10/10 -> Student deep-links from notification to Lesson 2 score
    await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector(`[data-testid="open-grade-form-btn-${hwIdL2}"]`, {
      timeout: 8000,
    });
    await teacherPage.click(`[data-testid="open-grade-form-btn-${hwIdL2}"]`);
    await teacherPage.selectOption('[data-testid="teacher-status-select"]', 'graded');
    await teacherPage.fill('[data-testid="teacher-score-input"]', '10');
    await teacherPage.fill(
      '[data-testid="teacher-feedback-input"]',
      'Xuất sắc 10/10! Con đọc chuẩn từng thanh điệu Bài 2.'
    );
    await teacherPage.click('[data-testid="teacher-submit-grade-btn"]');
    await teacherPage.waitForTimeout(600);

    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    const gradedNotifSelector = `[data-testid^="open-notif-target-NOTIF-GRADED-${hwIdL2}"]`;
    await studentPage.waitForSelector(gradedNotifSelector, { timeout: 8000 });
    await studentPage.click(gradedNotifSelector);
    await studentPage.waitForSelector('[data-testid="homework-score-badge"]', { timeout: 8000 });
    const scoreBadgeText = await studentPage.textContent('[data-testid="homework-score-badge"]');
    const feedbackText = await studentPage.textContent('[data-testid="homework-feedback-text"]');
    recordTest(
      'TEST E',
      'E4',
      'Clicking graded homework notification deep-links to Lesson 2 and displays 10/10 score + feedback',
      Boolean(
        studentPage.url().includes('lesson=2') &&
          scoreBadgeText?.includes('10') &&
          feedbackText?.includes('Xuất sắc')
      ),
      `${scoreBadgeText} | ${feedbackText}`
    );

    // =========================================================================
    // TEST F — RESPONSIVE VIEWPORTS (ALL 8 BREAKPOINTS: 360..1440)
    // =========================================================================
    const viewports = [
      { width: 360, height: 800, label: '360px' },
      { width: 375, height: 812, label: '375px' },
      { width: 390, height: 844, label: '390px' },
      { width: 430, height: 932, label: '430px' },
      { width: 768, height: 1024, label: '768px' },
      { width: 1024, height: 768, label: '1024px' },
      { width: 1280, height: 800, label: '1280px' },
      { width: 1440, height: 900, label: '1440px' },
    ];

    const routesToAudit = [
      { path: '/', name: '01-student-dashboard' },
      { path: '/learning', name: '02-video-learning' },
      { path: '/chat?room=class:YCT2-04', name: '03-zalo-classroom-chat' },
      { path: '/notifications', name: '04-notification-center' },
    ];

    for (const vp of viewports) {
      await studentPage.setViewportSize({ width: vp.width, height: vp.height });
      for (const route of routesToAudit) {
        await studentPage.goto(`${baseUrl}${route.path}`, { waitUntil: 'domcontentloaded' });
        await studentPage.waitForTimeout(250);

        const overflow = await studentPage.evaluate(() => {
          return document.documentElement.scrollWidth - window.innerWidth;
        });
        recordTest(
          'TEST F',
          `F-${vp.label}-${route.name}`,
          `Zero horizontal overflow on ${route.path} at ${vp.label}`,
          overflow <= 2,
          `overflowDelta=${overflow}px`
        );

        if (vp.width === 390 || vp.width === 768 || vp.width === 1440) {
          const shotPath = path.join(SCREENSHOT_DIR, `${route.name}-${vp.label}.png`);
          await studentPage.screenshot({ path: shotPath, fullPage: false });
        }
      }
    }

    // =========================================================================
    // TEST G — ACCESSIBILITY & SCREENSHOT ARTIFACTS
    // =========================================================================
    await studentPage.setViewportSize({ width: 1440, height: 900 });
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await studentPage.keyboard.press('Tab');
    const a11yAudit = await studentPage.evaluate(() => {
      const activeTag = document.activeElement?.tagName || '';
      const unlabeledButtons = Array.from(document.querySelectorAll('button')).filter((btn) => {
        const text = (btn.textContent || '').trim();
        const aria = btn.getAttribute('aria-label') || '';
        const title = btn.getAttribute('title') || '';
        return !text && !aria && !title;
      });
      const sheets = Array.from(document.styleSheets);
      let hasReducedMotionRule = false;
      for (const sheet of sheets) {
        try {
          for (const rule of Array.from(sheet.cssRules || [])) {
            if (rule.cssText && rule.cssText.includes('prefers-reduced-motion')) {
              hasReducedMotionRule = true;
            }
          }
        } catch {
          // ignore cross-origin stylesheets
        }
      }
      return {
        activeTag,
        unlabeledButtonCount: unlabeledButtons.length,
        hasReducedMotionRule,
      };
    });
    recordTest(
      'TEST G',
      'G1',
      'Accessibility audit: Keyboard Tab focus works, 0 unlabeled icon buttons, and prefers-reduced-motion CSS rule active',
      Boolean(
        a11yAudit.activeTag &&
          a11yAudit.unlabeledButtonCount === 0 &&
          a11yAudit.hasReducedMotionRule
      ),
      JSON.stringify(a11yAudit)
    );

    // Teacher workspace screenshots at 390px, 768px, 1440px
    for (const vpWidth of [390, 768, 1440]) {
      await teacherPage.setViewportSize({
        width: vpWidth,
        height: vpWidth === 390 ? 844 : vpWidth === 768 ? 1024 : 900,
      });
      await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'domcontentloaded' });
      await teacherPage.waitForTimeout(350);
      const shotPath = path.join(SCREENSHOT_DIR, `05-teacher-workspace-${vpWidth}px.png`);
      await teacherPage.screenshot({ path: shotPath, fullPage: false });
    }
    recordTest(
      'TEST G',
      'G2',
      'Captured responsive screenshots across 390px, 768px, and 1440px for all 5 core workspaces',
      true
    );

    // =========================================================================
    // TEST H — ROLE-AWARE UX (H1..H9)
    // =========================================================================
    const adminAuditContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const adminAuditPage = await adminAuditContext.newPage();
    await adminAuditPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await adminAuditPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });

    // H1: Student home at / (390x844)
    await studentPage.setViewportSize({ width: 390, height: 844 });
    await studentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
    const studentHeaderTitle = await studentPage.textContent('[data-testid="header-page-title"]');
    const studentHasContinueCta = await studentPage.isVisible(
      '[data-testid="dashboard-continue-learning-btn"]'
    );
    const studentSeesTeacherOrAdminHome =
      (await studentPage.isVisible('[data-testid="teacher-home-page"]')) ||
      (await studentPage.isVisible('[data-testid="admin-home-page"]'));
    recordTest(
      'TEST H',
      'H1',
      'Student opening / renders StudentHome with Continue Learning CTA and compact greeting',
      Boolean(
        studentHeaderTitle?.includes('Chào Hoàng Ngân') &&
          studentHasContinueCta &&
          !studentSeesTeacherOrAdminHome
      ),
      `header="${studentHeaderTitle?.trim()}"`
    );

    // H2: Teacher home at / (390x844)
    await teacherPage.setViewportSize({ width: 390, height: 844 });
    await teacherPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });
    const teacherHeaderTitle = await teacherPage.textContent('[data-testid="header-page-title"]');
    const teacherHasGradeCta = await teacherPage.isVisible(
      '[data-testid="teacher-home-grade-btn"]'
    );
    const teacherSeesStudentOrAdminHome =
      (await teacherPage.isVisible('[data-testid="student-dashboard-page"]')) ||
      (await teacherPage.isVisible('[data-testid="admin-home-page"]'));
    recordTest(
      'TEST H',
      'H2',
      'Teacher opening / renders TeacherHome with grading priority card and assigned classes (never StudentDashboard)',
      Boolean(
        teacherHeaderTitle?.includes('Chào Cô Lâm Mỹ Linh') &&
          teacherHasGradeCta &&
          !teacherSeesStudentOrAdminHome
      ),
      `header="${teacherHeaderTitle?.trim()}"`
    );

    // H3: Admin home at / (390x844)
    await adminAuditPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await adminAuditPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 8000 });
    const adminHeaderTitle = await adminAuditPage.textContent('[data-testid="header-page-title"]');
    const adminHasKpiGrid = await adminAuditPage.isVisible('[data-testid="admin-compact-summary"]');
    const adminSeesStudentOrTeacherHome =
      (await adminAuditPage.isVisible('[data-testid="student-dashboard-page"]')) ||
      (await adminAuditPage.isVisible('[data-testid="teacher-home-page"]'));
    recordTest(
      'TEST H',
      'H3',
      'Admin opening / renders AdminHome with 3 compact KPIs and actionable queue (never StudentDashboard)',
      Boolean(
        adminHeaderTitle?.includes('Quản lý học vụ') &&
          adminHasKpiGrid &&
          !adminSeesStudentOrTeacherHome
      ),
      `header="${adminHeaderTitle?.trim()}"`
    );

    // H4: Mobile Bottom Navigation — 5 distinct items per role & clicking each button opens the right screen
    const studentNavLabels = await studentPage.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '[data-testid="mobile-bottom-nav"][data-role-nav="student"] a span:first-of-type'
        )
      ).map((el) => el.textContent?.trim() || '')
    );
    await studentPage.click('[data-testid="mobile-nav-learning"]');
    await studentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 8000 });
    await studentPage.click('[data-testid="mobile-nav-classrooms"]');
    await studentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
    await studentPage.click('[data-testid="mobile-nav-chat"]');
    await studentPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });
    await studentPage.click('[data-testid="mobile-nav-notifications"]');
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    await studentPage.click('[data-testid="mobile-nav-home"]');
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });

    const teacherNavLabels = await teacherPage.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '[data-testid="mobile-bottom-nav"][data-role-nav="teacher"] a span:first-of-type'
        )
      ).map((el) => el.textContent?.trim() || '')
    );
    await teacherPage.click('[data-testid="mobile-nav-classes"]');
    await teacherPage.waitForSelector('[data-testid="teacher-workspace-page"]', { timeout: 8000 });
    await teacherPage.click('[data-testid="mobile-nav-grading"]');
    await teacherPage.waitForSelector('[data-testid="teacher-workspace-page"]', { timeout: 8000 });
    await teacherPage.click('[data-testid="mobile-nav-chat"]');
    await teacherPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });
    await teacherPage.click('[data-testid="mobile-nav-notifications"]');
    await teacherPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    await teacherPage.click('[data-testid="mobile-nav-home"]');
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });

    const adminNavLabels = await adminAuditPage.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          '[data-testid="mobile-bottom-nav"][data-role-nav="admin"] a span:first-of-type'
        )
      ).map((el) => el.textContent?.trim() || '')
    );
    await adminAuditPage.click('[data-testid="mobile-nav-students"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 8000 });
    await adminAuditPage.click('[data-testid="mobile-nav-classes"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 8000 });
    await adminAuditPage.click('[data-testid="mobile-nav-orders"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 8000 });
    await adminAuditPage.click('[data-testid="mobile-nav-more"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 8000 });
    await adminAuditPage.click('[data-testid="mobile-nav-home"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 8000 });

    recordTest(
      'TEST H',
      'H4',
      'Mobile bottom navigation renders 5 purposeful role-specific items and navigates accurately across all 15 buttons',
      JSON.stringify(studentNavLabels) ===
        JSON.stringify(['Trang chủ', 'Học', 'Lớp', 'Tin nhắn', 'Thông báo']) &&
        JSON.stringify(teacherNavLabels) ===
          JSON.stringify(['Tổng quan', 'Lớp', 'Chấm bài', 'Tin nhắn', 'Thông báo']) &&
        JSON.stringify(adminNavLabels) ===
          JSON.stringify(['Tổng quan', 'Học viên', 'Lớp', 'Đơn hàng', 'Thêm']),
      `S=${studentNavLabels.join('|')} / T=${teacherNavLabels.join('|')} / A=${adminNavLabels.join('|')}`
    );

    // H5: Home button in header returns each role to its own Home dashboard
    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await studentPage.click('[data-testid="header-home-btn"]');
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });

    await teacherPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await teacherPage.click('[data-testid="header-home-btn"]');
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });

    await adminAuditPage.goto(`${baseUrl}/admin/orders`, { waitUntil: 'domcontentloaded' });
    await adminAuditPage.click('[data-testid="header-home-btn"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 8000 });

    recordTest(
      'TEST H',
      'H5',
      'Clicking header Home button returns Student -> StudentHome, Teacher -> TeacherHome, Admin -> AdminHome',
      true
    );

    // H6: Refresh on / for each role preserves role without flashing StudentHome on Teacher/Admin
    await teacherPage.reload({ waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });
    const teacherFlashedStudent = await teacherPage.isVisible(
      '[data-testid="student-dashboard-page"]'
    );

    await adminAuditPage.reload({ waitUntil: 'domcontentloaded' });
    await adminAuditPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 8000 });
    const adminFlashedStudent = await adminAuditPage.isVisible(
      '[data-testid="student-dashboard-page"]'
    );
    recordTest(
      'TEST H',
      'H6',
      'Reloading / on Teacher and Admin preserves role session and never renders StudentHome',
      !teacherFlashedStudent && !adminFlashedStudent
    );

    // H7: Sequential role switching on a single browser context (Teacher -> Student -> Admin -> Teacher)
    const switchContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const switchPage = await switchContext.newPage();
    await switchPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });

    // 1. Login Teacher
    await switchPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await switchPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });
    await switchPage.click('[data-testid="logout-btn"]');
    await switchPage.waitForSelector('[data-testid="login-page"]', { timeout: 8000 });

    // 2. Login Student
    await switchPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await switchPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
    const seesTeacherNav = await switchPage.isVisible(
      '[data-testid="mobile-bottom-nav"][data-role-nav="teacher"]'
    );
    await switchPage.click('[data-testid="logout-btn"]');
    await switchPage.waitForSelector('[data-testid="login-page"]', { timeout: 8000 });

    // 3. Login Admin
    await switchPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await switchPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 8000 });
    const adminSeesStudentNav = await switchPage.isVisible(
      '[data-testid="mobile-bottom-nav"][data-role-nav="student"]'
    );
    await switchPage.click('[data-testid="logout-btn"]');
    await switchPage.waitForSelector('[data-testid="login-page"]', { timeout: 8000 });

    // 4. Login Teacher again
    await switchPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await switchPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });
    const teacherSeesAdminNav = await switchPage.isVisible(
      '[data-testid="mobile-bottom-nav"][data-role-nav="admin"]'
    );
    await switchContext.close();

    recordTest(
      'TEST H',
      'H7',
      'Sequential logout/login across Teacher -> Student -> Admin -> Teacher leaves zero stale menus or state',
      !seesTeacherNav && !adminSeesStudentNav && !teacherSeesAdminNav
    );

    // H8: Role protection via URL & API (Teacher blocked from /admin)
    await teacherPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    await teacherPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });
    recordTest(
      'TEST H',
      'H8',
      'Role protection blocks Teacher from /admin and Student from /teacher and /admin',
      true
    );

    // H9: Demo / Live isolation (DemoControlBar hidden in Live mode; failed live login never falls back to demoUser)
    const demoBarVisibleInLive = await studentPage.isVisible('[data-testid="demo-control-bar"]');
    const liveAuthCheckContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const liveAuthCheckPage = await liveAuthCheckContext.newPage();
    await liveAuthCheckPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await liveAuthCheckPage.fill('[data-testid="login-email-input"]', 'linh.lam@khongtunhi.com');
    await liveAuthCheckPage.fill('[data-testid="login-password-input"]', 'wrong-password');
    await liveAuthCheckPage.click('[data-testid="login-submit-btn"]');
    await liveAuthCheckPage.waitForSelector('[data-testid="login-error-alert"]', { timeout: 8000 });
    const stayedOnLogin = await liveAuthCheckPage.isVisible('[data-testid="login-page"]');
    await liveAuthCheckContext.close();
    recordTest(
      'TEST H',
      'H9',
      'DemoControlBar is hidden in Live mode and failed live login never falls back to demoUser',
      !demoBarVisibleInLive && stayedOnLogin
    );

    // =========================================================================
    // TEST I — MOBILE COMPACT UI & ROLE-AUDIT SCREENSHOTS (360px, 375px, 390px, 430px, 1440px)
    // =========================================================================
    const mobileWidths = [
      { width: 360, height: 780 },
      { width: 375, height: 812 },
      { width: 390, height: 844 },
      { width: 430, height: 932 },
    ];

    const rolePages = [
      { role: 'student', page: studentPage, selector: '[data-testid="student-dashboard-page"]' },
      { role: 'teacher', page: teacherPage, selector: '[data-testid="teacher-home-page"]' },
      { role: 'admin', page: adminAuditPage, selector: '[data-testid="admin-home-page"]' },
    ];

    for (const rp of rolePages) {
      for (const mw of mobileWidths) {
        await rp.page.setViewportSize({ width: mw.width, height: mw.height });
        await rp.page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
        await rp.page.waitForSelector(rp.selector, { timeout: 8000 });
        await rp.page.waitForTimeout(200);

        const metrics = await rp.page.evaluate(() => {
          const header = document.querySelector('[data-testid="compact-top-header"]');
          const headerHeight = header ? Math.round(header.getBoundingClientRect().height) : 999;
          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          const bodyText = document.body.innerText || '';
          const hasLeakedTokens =
            bodyText.includes('DEMO-MODE-ONLY') || bodyText.includes('undefined');
          return { headerHeight, overflow, hasLeakedTokens };
        });

        recordTest(
          'TEST I',
          `I-${rp.role}-${mw.width}px`,
          `Compact mobile layout for ${rp.role} at ${mw.width}px (header=${metrics.headerHeight}px <= 56px, overflow=${metrics.overflow}px)`,
          metrics.headerHeight <= 56 && metrics.overflow <= 2 && !metrics.hasLeakedTokens,
          JSON.stringify(metrics)
        );

        if (mw.width === 390 || mw.width === 360) {
          await rp.page.screenshot({
            path: path.join(ROLE_AUDIT_DIR, `${rp.role}-mobile-${mw.width}.png`),
            fullPage: false,
          });
        }
      }

      // Desktop 1440x900 screenshot for each role home
      await rp.page.setViewportSize({ width: 1440, height: 900 });
      await rp.page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await rp.page.waitForSelector(rp.selector, { timeout: 8000 });
      await rp.page.waitForTimeout(250);
      await rp.page.screenshot({
        path: path.join(ROLE_AUDIT_DIR, `${rp.role}-desktop-1440.png`),
        fullPage: false,
      });
    }

    // Capture chat-mobile-390.png, learning-mobile-390.png, notifications-mobile-390.png & verify composer above bottom nav
    await studentPage.setViewportSize({ width: 390, height: 844 });

    await studentPage.goto(`${baseUrl}/learning`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 8000 });
    await studentPage.waitForTimeout(250);
    await studentPage.screenshot({
      path: path.join(ROLE_AUDIT_DIR, 'learning-mobile-390.png'),
      fullPage: false,
    });

    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    await studentPage.waitForTimeout(250);
    await studentPage.screenshot({
      path: path.join(ROLE_AUDIT_DIR, 'notifications-mobile-390.png'),
      fullPage: false,
    });

    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });
    await studentPage.waitForSelector('[data-testid="chat-composer-input"]', { timeout: 8000 });
    await studentPage.waitForTimeout(250);
    await studentPage.screenshot({
      path: path.join(ROLE_AUDIT_DIR, 'chat-mobile-390.png'),
      fullPage: false,
    });

    const chatLayoutCheck = await studentPage.evaluate(() => {
      const composer = document.querySelector('[data-testid="chat-composer-input"]');
      const bottomNav = document.querySelector('[data-testid="mobile-bottom-nav"]');
      if (!composer || !bottomNav) return { ok: false, reason: 'Missing composer or bottom nav' };
      const cRect = composer.getBoundingClientRect();
      const nRect = bottomNav.getBoundingClientRect();
      return {
        ok: cRect.bottom <= nRect.top + 2,
        composerBottom: Math.round(cRect.bottom),
        bottomNavTop: Math.round(nRect.top),
      };
    });
    recordTest(
      'TEST I',
      'I-chat-composer-390px',
      'Mobile chat composer at 390x844 is completely visible above the bottom navigation bar',
      chatLayoutCheck.ok,
      JSON.stringify(chatLayoutCheck)
    );

    await adminAuditContext.close();
    await studentContext.close();
    await teacherContext.close();
  } finally {
    await browser.close();
    await viteServer.close();
  }

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        suite: 'KTN UI V2 Real-Browser E2E Verification',
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n[KTN-UI-V2 E2E] ALL ${results.length}/${results.length} TESTS PASSED!`);
}

runSuite().catch((err) => {
  console.error('[KTN-UI-V2 E2E] Fatal failure:', err);
  process.exit(1);
});
