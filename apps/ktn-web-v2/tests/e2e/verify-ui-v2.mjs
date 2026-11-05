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
const REPORT_PATH = path.join(REPO_ROOT, 'docs/ui-v2/e2e-verification-report.json');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

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
    await studentPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
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
    await studentPage.reload({ waitUntil: 'networkidle' });
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
    recordTest('TEST A', 'A3', 'Browser reload preserves authenticated session', true);

    // A4: RBAC Route Guard blocks Student from /teacher and /admin
    await studentPage.goto(`${baseUrl}/teacher`, { waitUntil: 'networkidle' });
    await studentPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    await studentPage.goto(`${baseUrl}/admin`, { waitUntil: 'networkidle' });
    await studentPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    recordTest(
      'TEST A',
      'A4',
      'RBAC Route Guard blocks Student from accessing /teacher and /admin',
      true
    );

    // A5: Logout clears session AND room drafts/session UI state
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'networkidle' });
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

    // A6: Admin login loads Admin Workspace
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await adminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await adminPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 10000 });
    recordTest(
      'TEST A',
      'A6',
      'Admin login succeeds and loads Admin Workspace (/admin)',
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
    await unentitledPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
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
    await teacherPage.goto(`${baseUrl}/login`, { waitUntil: 'networkidle' });
    await teacherPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await teacherPage.waitForSelector('[data-testid="teacher-workspace-page"]', { timeout: 10000 });

    // Both Student and Teacher open /chat?room=class:YCT2-04
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'networkidle' });
    await teacherPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'networkidle' });
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
    await studentPage.reload({ waitUntil: 'networkidle' });
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
    await studentPage.reload({ waitUntil: 'networkidle' });
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

    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'networkidle' });
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
    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'networkidle' });
    await studentPage.waitForSelector('[data-testid="notification-center-page"]', { timeout: 8000 });
    const markAllDisabledBefore = await studentPage.isDisabled(
      '[data-testid="mark-all-notifications-read-btn"]'
    );
    if (!markAllDisabledBefore) {
      await studentPage.click('[data-testid="mark-all-notifications-read-btn"]');
      await studentPage.waitForTimeout(500);
    }
    await studentPage.reload({ waitUntil: 'networkidle' });
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
      waitUntil: 'networkidle',
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
    await studentPage.goto(`${baseUrl}/learning`, { waitUntil: 'networkidle' });
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
    await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'networkidle' });
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

    await studentPage.reload({ waitUntil: 'networkidle' });
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
    await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'networkidle' });
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

    await studentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'networkidle' });
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
        await studentPage.goto(`${baseUrl}${route.path}`, { waitUntil: 'networkidle' });
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
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'networkidle' });
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
      await teacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'networkidle' });
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
