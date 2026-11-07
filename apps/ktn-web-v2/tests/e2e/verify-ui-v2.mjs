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
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
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
    const draftBeforeLogout = await studentPage.evaluate(() =>
      localStorage.getItem('ktn_v2_chat_draft_class:YCT2-04')
    );
    await studentPage.click('[data-testid="logout-btn"]');
    await studentPage.waitForSelector('[data-testid="login-page"]', { timeout: 8000 });
    const storageAfterLogout = await studentPage.evaluate(() => {
      const remainingDraftKeys = [];
      for (let i = 0; i < localStorage.length; i += 1) {
        const k = localStorage.key(i);
        if (k && k.startsWith('ktn_v2_chat_draft_')) remainingDraftKeys.push(k);
      }
      return {
        sessionRaw: localStorage.getItem('ktn_v2_auth_session'),
        remainingDraftKeys,
      };
    });
    recordTest(
      'TEST A',
      'A5',
      'Logout revokes session, clears room drafts in storage, and redirects to /login',
      draftBeforeLogout === 'Bản nháp riêng của Hoàng Ngân' &&
        storageAfterLogout.sessionRaw === null &&
        storageAfterLogout.remainingDraftKeys.length === 0,
      `draftBefore="${draftBeforeLogout}", remainingDrafts=${storageAfterLogout.remainingDraftKeys.length}`
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

    // H8: Role protection via URL & API (Teacher blocked from /admin and /learning; API RBAC enforced)
    await teacherPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    await teacherPage.goto(`${baseUrl}/learning`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="role-forbidden-guard"]', { timeout: 8000 });
    await teacherPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 8000 });

    const studentRbacApi = await studentPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const gradeRes = await fetch('/api/ktn/homeworks/grade', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ id: 'HW-1', score: 10, status: 'graded' }),
      });
      const orderRes = await fetch('/api/ktn/orders/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ order_id: 'ORD-1' }),
      });
      return { gradeStatus: gradeRes.status, orderStatus: orderRes.status };
    });

    const teacherRbacApi = await teacherPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      const orderRes = await fetch('/api/ktn/orders/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ order_id: 'ORD-1' }),
      });
      const courseRes = await fetch('/api/ktn/students/courses', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'grant', email: 'a@b.c', course_ids: ['1'] }),
      });
      return { orderStatus: orderRes.status, courseStatus: courseRes.status };
    });

    recordTest(
      'TEST H',
      'H8',
      'Role protection blocks unauthorized routes and enforces 403 RBAC on grading/orders/course APIs',
      studentRbacApi.gradeStatus === 403 &&
        studentRbacApi.orderStatus === 403 &&
        teacherRbacApi.orderStatus === 403 &&
        teacherRbacApi.courseStatus === 403,
      `student(grade=${studentRbacApi.gradeStatus},order=${studentRbacApi.orderStatus}) teacher(order=${teacherRbacApi.orderStatus},course=${teacherRbacApi.courseStatus})`
    );

    // H9: Demo / Live isolation (DemoControlBar hidden in Live mode; failed live login never falls back to demoUser)
    const demoBarVisibleInLive = await studentPage.isVisible('[data-testid="mode-indicator-bar"]');
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
            bodyText.includes('DEMO-MODE-ONLY') ||
            bodyText.includes('undefined') ||
            bodyText.includes('VIDEO HLS') ||
            bodyText.includes('403 COURSE_NOT_ENTITLED');
          const visibleNavBars = Array.from(document.querySelectorAll('nav')).filter((el) => {
            const st = window.getComputedStyle(el);
            return st.display !== 'none' && st.visibility !== 'hidden' && el.offsetHeight > 0;
          }).length;
          const primaryBtn = document.querySelector(
            '[data-testid="dashboard-continue-learning-btn"], [data-testid="teacher-home-grade-btn"], [data-testid="admin-quick-orders"]'
          );
          const ctaAboveFold = primaryBtn
            ? primaryBtn.getBoundingClientRect().bottom <= window.innerHeight - 52
            : false;
          return {
            headerHeight,
            overflow,
            hasLeakedTokens,
            visibleNavBars,
            ctaAboveFold,
          };
        });

        recordTest(
          'TEST I',
          `I-${rp.role}-${mw.width}px`,
          `Compact mobile layout for ${rp.role} at ${mw.width}px (header=${metrics.headerHeight}px <= 56px, navBars=${metrics.visibleNavBars}, ctaAboveFold=${metrics.ctaAboveFold}, overflow=${metrics.overflow}px)`,
          metrics.headerHeight <= 56 &&
            metrics.overflow <= 2 &&
            !metrics.hasLeakedTokens &&
            metrics.visibleNavBars === 1 &&
            metrics.ctaAboveFold,
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

    if (!fs.existsSync(path.join(SCREENSHOT_DIR, 'student-home-before-390.png'))) {
      await studentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
      await studentPage.waitForTimeout(300);
      await studentPage.screenshot({
        path: path.join(SCREENSHOT_DIR, 'student-home-before-390.png'),
        fullPage: true,
      });
      await studentPage.goto(`${baseUrl}/classrooms?class=YCT2-04&session=1`, {
        waitUntil: 'domcontentloaded',
      });
      await studentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
      await studentPage.waitForTimeout(300);
      await studentPage.screenshot({
        path: path.join(SCREENSHOT_DIR, 'classrooms-before-390.png'),
        fullPage: true,
      });
      await studentPage.setViewportSize({ width: 1440, height: 900 });
      await studentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
      await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 8000 });
      await studentPage.waitForTimeout(300);
      await studentPage.screenshot({
        path: path.join(SCREENSHOT_DIR, 'student-home-before-1440.png'),
        fullPage: true,
      });
      await studentPage.goto(`${baseUrl}/classrooms?class=YCT2-04&session=1`, {
        waitUntil: 'domcontentloaded',
      });
      await studentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
      await studentPage.waitForTimeout(300);
      await studentPage.screenshot({
        path: path.join(SCREENSHOT_DIR, 'classrooms-before-1440.png'),
        fullPage: true,
      });
      await studentPage.setViewportSize({ width: 390, height: 844 });
    }

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

    // =========================================================================
    // TEST J — V3 ONE-CLICK PROVISIONING, VIETNAMESE SEARCH, 3-WAY SYNC & ATTENDANCE
    // =========================================================================
    await adminAuditPage.setViewportSize({ width: 1440, height: 900 });
    await adminAuditPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await adminAuditPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 8000 });

    // J1: One-click Student Provisioning without selecting a class -> class_code is '' (never YCT2-04) + ephemeral credential banner
    await adminAuditPage.click('[data-testid="admin-open-create-student-btn"]');
    await adminAuditPage.waitForSelector('[data-testid="admin-create-student-modal"]', { timeout: 5000 });
    const v3Email = `dangnam.v3.${Date.now()}@khongtunhi.com`;
    await adminAuditPage.fill('[data-testid="provision-student-name-input"]', 'Bé Đặng Nhật Nam');
    await adminAuditPage.fill('[data-testid="provision-student-email-input"]', v3Email);
    await adminAuditPage.fill('[data-testid="provision-student-phone-input"]', '0905112233');
    await adminAuditPage.fill('[data-testid="provision-student-parent-input"]', 'Chị Đặng Thu Hà');
    await adminAuditPage.click('[data-testid="provision-student-submit-btn"]');

    await adminAuditPage.waitForSelector('[data-testid="admin-credential-handoff-banner"]', {
      timeout: 10000,
    });
    const bannerText = await adminAuditPage.textContent('[data-testid="admin-credential-handoff-banner"]');
    recordTest(
      'TEST J',
      'J1',
      'Admin 1-click student provisioning creates student without default YCT2-04 and displays one-time credential handoff banner',
      Boolean(bannerText && bannerText.includes(v3Email) && !bannerText.includes('123456')),
      `Provisioned: ${v3Email}`
    );

    // J2: Server-side Vietnamese unaccented search ("dang nhat nam") finds "Bé Đặng Nhật Nam"
    await adminAuditPage.fill('[data-testid="admin-search-input"]', 'dang nhat nam');
    await adminAuditPage.waitForTimeout(450);
    const searchBody = await adminAuditPage.textContent('[data-testid="admin-workspace-page"]');
    recordTest(
      'TEST J',
      'J2',
      'Admin server-side Vietnamese unaccented search ("dang nhat nam") matches "Bé Đặng Nhật Nam" with zero default YCT2-04',
      Boolean(
        searchBody &&
          searchBody.includes('Bé Đặng Nhật Nam') &&
          searchBody.includes('Chưa xếp lớp')
      ),
      'Matched unaccented search + Chưa xếp lớp'
    );

    // J3: 3-System Sync Health panel is visible and refreshes cleanly
    await adminAuditPage.goto(`${baseUrl}/admin/more`, { waitUntil: 'domcontentloaded' });
    await adminAuditPage.waitForSelector('[data-testid="admin-sync-health-card"]', { timeout: 8000 });
    await adminAuditPage.click('[data-testid="admin-sync-retry-all-btn"]');
    const syncHealthText = await adminAuditPage.textContent('[data-testid="admin-sync-health-card"]');
    recordTest(
      'TEST J',
      'J3',
      'Admin 3-System Reconciliation & Sync Health panel renders and refreshes sync status',
      Boolean(syncHealthText && syncHealthText.includes('Đồng bộ 3 hệ thống')),
      'Sync health verified'
    );

    // J4: Teacher Attendance saving on /teacher/classes persists to ktn_attendance and reflects on Student /classrooms
    await teacherPage.setViewportSize({ width: 1440, height: 900 });
    await teacherPage.goto(`${baseUrl}/teacher/classes`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-save-attendance-btn"]', { timeout: 8000 });
    await teacherPage.click('[data-testid="teacher-save-attendance-btn"]');
    await teacherPage.waitForTimeout(500);

    await studentPage.setViewportSize({ width: 1440, height: 900 });
    await studentPage.goto(`${baseUrl}/classrooms?class=YCT2-04&session=1`, {
      waitUntil: 'domcontentloaded',
    });
    await studentPage.waitForSelector('[data-testid="student-attendance-summary-badge"]', { timeout: 8000 });
    const attBadgeText = await studentPage.textContent('[data-testid="student-attendance-summary-badge"]');
    recordTest(
      'TEST J',
      'J4',
      'Teacher saves classroom attendance -> Student immediately sees attendance badge on /classrooms',
      Boolean(attBadgeText && attBadgeText.includes('Chuyên cần')),
      attBadgeText?.trim() || ''
    );

    await adminAuditContext.close();
    await studentContext.close();
    await teacherContext.close();

    // =========================================================================
    // TEST K — PRODUCTION READINESS V3: LAZY HLS, SERVER PAGINATION, REAL VIDEO PLAYBACK & HASH ROUTER
    // =========================================================================
    const perfContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const perfPage = await perfContext.newPage();
    const adminSessionRequests = [];
    perfPage.on('request', (req) => {
      adminSessionRequests.push(req.url());
    });

    await perfPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await perfPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await perfPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await perfPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await perfPage.waitForSelector('[data-testid="admin-workspace-page"]', { timeout: 10000 });
    await perfPage.waitForTimeout(400);

    const hlsRequestsOnNonVideoPages = adminSessionRequests.filter((u) =>
      /hls\.js|vendor-hls|node_modules\/hls/i.test(u)
    );
    const searchRequestsOnAdmin = adminSessionRequests.filter((u) =>
      u.includes('/api/ktn/admin/students/search')
    );
    const hasSmallPageLimit = searchRequestsOnAdmin.some((u) => u.includes('limit=20'));
    const hasBloatedPageLimit = searchRequestsOnAdmin.some((u) =>
      /limit=(100|150|2000)\b/.test(u)
    );

    recordTest(
      'TEST K',
      'K1',
      'Non-video pages (/login, /, /admin) make 0 HLS chunk requests and paginate student search with limit=20',
      hlsRequestsOnNonVideoPages.length === 0 && hasSmallPageLimit && !hasBloatedPageLimit,
      `hlsReqs=${hlsRequestsOnNonVideoPages.length}, searchReqs=${searchRequestsOnAdmin.length}, limit20=${hasSmallPageLimit}`
    );

    // K2 & K3: HashRouter embed mode + Real HLS stream decoding & playback (currentTime > 0)
    const embedContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const embedPage = await embedContext.newPage();
    await embedPage.goto(`${baseUrl}/?router=hash#/login`, { waitUntil: 'domcontentloaded' });
    await embedPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await embedPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    await embedPage.click('[data-testid="nav-learning"]');
    await embedPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 10000 });
    await embedPage.waitForSelector('[data-testid="hls-video-element"]', { timeout: 10000 });

    const hashBeforeReload = new URL(embedPage.url()).hash;
    await embedPage.reload({ waitUntil: 'domcontentloaded' });
    await embedPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 10000 });
    const hashAfterReload = new URL(embedPage.url()).hash;

    recordTest(
      'TEST K',
      'K2',
      'Custom Page HashRouter embed mode (?router=hash#/...) navigates and survives reload without 404',
      hashBeforeReload.startsWith('#/learning') && hashAfterReload.startsWith('#/learning'),
      `hash=${hashAfterReload}`
    );

    const playbackStats = await embedPage.evaluate(async () => {
      const video = document.querySelector('[data-testid="hls-video-element"]');
      if (!video) return { ok: false, reason: 'no_video_element' };
      video.muted = true;
      const deadline = Date.now() + 12000;
      while (Date.now() < deadline && video.readyState < 2) {
        await new Promise((r) => setTimeout(r, 200));
      }
      try {
        await video.play();
      } catch {
        // ignore initial play interruption if stream is still buffering
      }
      const playDeadline = Date.now() + 8000;
      while (Date.now() < playDeadline && video.currentTime <= 0.05) {
        if (video.paused) {
          try {
            await video.play();
          } catch {
            // ignore
          }
        }
        await new Promise((r) => setTimeout(r, 250));
      }
      const stats = {
        readyState: video.readyState,
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        duration: Number.isFinite(video.duration) ? Math.round(video.duration) : 0,
        currentTime: Number(video.currentTime.toFixed(2)),
      };
      video.pause();
      return {
        ok: stats.readyState >= 2 && stats.videoWidth > 0 && stats.currentTime > 0,
        ...stats,
      };
    });

    recordTest(
      'TEST K',
      'K3',
      'Real HLS stream on /learning decodes video frames and advances playback currentTime > 0',
      Boolean(playbackStats.ok),
      `readyState=${playbackStats.readyState}, res=${playbackStats.videoWidth}x${playbackStats.videoHeight}, duration=${playbackStats.duration}s, currentTime=${playbackStats.currentTime}s`
    );

    await perfContext.close();
    await embedContext.close();

    // =========================================================================
    // TEST L — UNIFIED STUDENT MANAGEMENT UX (ALL 13 MANDATORY SCENARIOS)
    // =========================================================================
    const unifiedAdminContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const unifiedAdminPage = await unifiedAdminContext.newPage();
    const studentCoursesPayloads = [];
    unifiedAdminPage.on('request', (req) => {
      if (req.url().includes('/api/ktn/students/courses') && req.method() === 'POST') {
        try {
          studentCoursesPayloads.push(JSON.parse(req.postData() || '{}'));
        } catch {
          // ignore
        }
      }
    });

    await unifiedAdminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await unifiedAdminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await unifiedAdminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });

    // L1 (Scenarios 1 & 7): Opening /admin/students has neutral defaults (no auto-selected student, no HSK1, no YCT2-04)
    await unifiedAdminPage.goto(`${baseUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
    await unifiedAdminPage.waitForSelector('[data-testid="admin-students-section"]', {
      timeout: 10000,
    });
    const drawerOpenOnLoad = await unifiedAdminPage.isVisible(
      '[data-testid="student-detail-drawer"]'
    );
    await unifiedAdminPage.click('[data-testid="admin-open-create-student-btn"]');
    await unifiedAdminPage.waitForSelector('[data-testid="admin-create-student-modal"]', {
      timeout: 5000,
    });
    const defaultStuClass = await unifiedAdminPage.inputValue(
      '[data-testid="provision-student-class-select"]'
    );
    const createModalText = await unifiedAdminPage.textContent(
      '[data-testid="admin-create-student-modal"]'
    );
    await unifiedAdminPage.click('[aria-label="Đóng cửa sổ tạo học viên"]');

    await unifiedAdminPage.click('[data-testid="admin-open-create-teacher-btn"]');
    await unifiedAdminPage.waitForSelector('[data-testid="admin-create-teacher-modal"]', {
      timeout: 5000,
    });
    const createTeacherText = await unifiedAdminPage.textContent(
      '[data-testid="admin-create-teacher-modal"]'
    );
    await unifiedAdminPage.click('[aria-label="Đóng cửa sổ tạo giáo viên"]');

    recordTest(
      'TEST L',
      'L1',
      'Opening /admin/students starts in neutral state (no auto-selected student, — Chưa xếp lớp —, — Chưa chọn khóa học —)',
      !drawerOpenOnLoad &&
        defaultStuClass === '' &&
        Boolean(createModalText?.includes('— Chưa xếp lớp —')) &&
        Boolean(createModalText?.includes('— Chưa chọn khóa học —')) &&
        Boolean(createTeacherText?.includes('— Chưa xếp lớp —')),
      `drawerOpen=${drawerOpenOnLoad}, defaultClass="${defaultStuClass}"`
    );

    // L2 (Scenario 2 & P2 table polish): Search across 1,047+ students, max 2 course badges (+N khóa), legacy class badge
    await unifiedAdminPage.fill('[data-testid="admin-search-input"]', 'e2e.hs.000');
    await unifiedAdminPage.waitForTimeout(450);
    await unifiedAdminPage.waitForSelector(
      '[data-testid="admin-student-row-e2e.hs.0001@khongtunhi.com"]',
      { timeout: 8000 }
    );
    const extraCoursesBadgeText = await unifiedAdminPage.textContent(
      '[data-testid="student-extra-courses-badge-e2e.hs.0001@khongtunhi.com"]'
    );
    const legacyBadgeOnTable = await unifiedAdminPage.isVisible(
      '[data-testid="student-legacy-class-badge-e2e.hs.0002@khongtunhi.com"]'
    );

    // Capture Desktop Student Roster Screenshot (filtered to synthetic e2e.hs. accounts — zero real PII)
    await unifiedAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-students-unified-desktop.png'),
      fullPage: false,
    });

    await unifiedAdminPage.fill('[data-testid="admin-search-input"]', 'tran bao ngoc 0999');
    await unifiedAdminPage.waitForTimeout(450);
    await unifiedAdminPage.waitForSelector(
      '[data-testid="admin-student-row-e2e.hs.0999@khongtunhi.com"]',
      { timeout: 8000 }
    );
    const tabStudentsText = await unifiedAdminPage.textContent('[data-testid="admin-tab-students"]');

    recordTest(
      'TEST L',
      'L2',
      'Server-side search across >1,000 students finds target by unaccented name and enforces max 2 course badges (+N khóa)',
      Boolean(
        extraCoursesBadgeText?.includes('+1 khóa') &&
          legacyBadgeOnTable &&
          tabStudentsText
      ),
      `extraBadge="${extraCoursesBadgeText?.trim()}", legacyBadge=${legacyBadgeOnTable}`
    );

    // L3 (Scenarios 3 & 8): Click student row -> opens drawer with real profile/entitlements & disables Grant when no course selected
    await unifiedAdminPage.click('[data-testid="admin-student-row-e2e.hs.0999@khongtunhi.com"]');
    await unifiedAdminPage.waitForSelector('[data-testid="student-detail-drawer"]', {
      timeout: 5000,
    });
    const drawerName = await unifiedAdminPage.textContent('[data-testid="drawer-student-name"]');
    const drawerIdentityEmail = await unifiedAdminPage.textContent(
      '[data-testid="drawer-identity-email"]'
    );
    const drawerClassInitial = await unifiedAdminPage.textContent(
      '[data-testid="drawer-current-class-badge"]'
    );
    const hasInitialHsk1 = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-granted-course-6adadba969897b0002482ca5"]'
    );
    const courseSelectDefault = await unifiedAdminPage.inputValue(
      '[data-testid="drawer-course-select"]'
    );
    const grantDisabledWhenEmpty = await unifiedAdminPage.isDisabled(
      '[data-testid="drawer-grant-course-submit-btn"]'
    );
    const statusAccountText = await unifiedAdminPage.textContent(
      '[data-testid="drawer-status-account"]'
    );
    const statusCoursesText = await unifiedAdminPage.textContent(
      '[data-testid="drawer-status-courses"]'
    );
    const statusClassText = await unifiedAdminPage.textContent(
      '[data-testid="drawer-status-class"]'
    );

    // Capture Desktop Drawer Screenshot
    await unifiedAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-student-drawer-desktop.png'),
      fullPage: false,
    });

    recordTest(
      'TEST L',
      'L3',
      'Clicking student row opens StudentDetailDrawer with exact profile/entitlements, 3-part sync status, and disabled Grant button when empty',
      Boolean(
        drawerName?.includes('Trần Bảo Ngọc 0999') &&
          drawerIdentityEmail?.includes('e2e.hs.0999@khongtunhi.com') &&
          drawerClassInitial?.includes('YCT1-01') &&
          hasInitialHsk1 &&
          courseSelectDefault === '' &&
          grantDisabledWhenEmpty &&
          statusAccountText &&
          statusCoursesText &&
          statusClassText
      ),
      `name="${drawerName?.trim()}", class="${drawerClassInitial?.trim()}", grantDisabled=${grantDisabledWhenEmpty}`
    );

    // L4 (Scenario 4): Grant an additional course -> class_code remains unchanged, payload omits class_code
    studentCoursesPayloads.length = 0;
    await unifiedAdminPage.click(
      '[data-testid="drawer-course-option-65e7704a9ea90c00080d5195"]'
    );
    await unifiedAdminPage.waitForSelector('[data-testid="drawer-grant-preview"]', {
      timeout: 3000,
    });
    await unifiedAdminPage.click('[data-testid="drawer-grant-course-submit-btn"]');
    await unifiedAdminPage.waitForSelector(
      '[data-testid="drawer-granted-course-65e7704a9ea90c00080d5195"]',
      { timeout: 8000 }
    );
    const grantPayload = studentCoursesPayloads[studentCoursesPayloads.length - 1] || {};
    const classAfterGrant = await unifiedAdminPage.textContent(
      '[data-testid="drawer-current-class-badge"]'
    );

    recordTest(
      'TEST L',
      'L4',
      'Granting a course sends action="grant" without classCode/class_code, adds course, and keeps live class unchanged',
      grantPayload.action === 'grant' &&
        !('class_code' in grantPayload) &&
        !('classCode' in grantPayload) &&
        Array.isArray(grantPayload.courseIds || grantPayload.course_ids) &&
        (grantPayload.courseIds || grantPayload.course_ids).includes('65e7704a9ea90c00080d5195') &&
        Boolean(classAfterGrant?.includes('YCT1-01')),
      `payload=${JSON.stringify(grantPayload)}, classAfter="${classAfterGrant?.trim()}"`
    );

    // L5 (Scenario 5): Revoke a single course (with confirmation) -> class_code and other courses remain intact
    studentCoursesPayloads.length = 0;
    await unifiedAdminPage.click(
      '[data-testid="drawer-revoke-course-btn-65e7704a9ea90c00080d5195"]'
    );
    await unifiedAdminPage.waitForSelector('[data-testid="drawer-revoke-confirm-box"]', {
      timeout: 3000,
    });
    await unifiedAdminPage.click('[data-testid="drawer-confirm-revoke-btn"]');
    await unifiedAdminPage.waitForFunction(
      () =>
        !document.querySelector(
          '[data-testid="drawer-granted-course-65e7704a9ea90c00080d5195"]'
        ),
      null,
      { timeout: 8000 }
    );
    const revokePayload = studentCoursesPayloads[studentCoursesPayloads.length - 1] || {};
    const stillHasHsk1AfterRevoke = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-granted-course-6adadba969897b0002482ca5"]'
    );
    const classAfterRevoke = await unifiedAdminPage.textContent(
      '[data-testid="drawer-current-class-badge"]'
    );

    recordTest(
      'TEST L',
      'L5',
      'Revoking a course requires confirmation, sends action="revoke" without classCode/class_code, and preserves other courses + live class',
      revokePayload.action === 'revoke' &&
        !('class_code' in revokePayload) &&
        !('classCode' in revokePayload) &&
        stillHasHsk1AfterRevoke &&
        Boolean(classAfterRevoke?.includes('YCT1-01')),
      `payload=${JSON.stringify(revokePayload)}, stillHasHsk1=${stillHasHsk1AfterRevoke}`
    );

    // L6 (Scenario 6): Assign / Change live class -> online_courses remain unchanged, payload omits course_ids
    studentCoursesPayloads.length = 0;
    await unifiedAdminPage.selectOption('[data-testid="drawer-class-select"]', 'YCT3-02');
    await unifiedAdminPage.waitForSelector('[data-testid="drawer-class-change-preview"]', {
      timeout: 3000,
    });
    await unifiedAdminPage.click('[data-testid="drawer-save-class-btn"]');
    await unifiedAdminPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="drawer-current-class-badge"]')
          ?.textContent?.includes('YCT3-02'),
      null,
      { timeout: 8000 }
    );
    const assignClassPayload = studentCoursesPayloads[studentCoursesPayloads.length - 1] || {};
    const stillHasHsk1AfterClassChange = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-granted-course-6adadba969897b0002482ca5"]'
    );

    recordTest(
      'TEST L',
      'L6',
      'Changing live class sends action="assign_class" without courseIds/course_ids and preserves video course entitlements',
      assignClassPayload.action === 'assign_class' &&
        (assignClassPayload.classCode || assignClassPayload.class_code) === 'YCT3-02' &&
        !('course_ids' in assignClassPayload) &&
        !('courseIds' in assignClassPayload) &&
        stillHasHsk1AfterClassChange,
      `payload=${JSON.stringify(assignClassPayload)}`
    );

    // L7 (Scenario 11): API failure displays real error alert in drawer and never reports fake success
    await fetch(`${baseUrl}/api/ktn/test/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failStudentCoursesPost: true }),
    });
    await unifiedAdminPage.click(
      '[data-testid="drawer-course-option-65e7704a9ea90c00080d5195"]'
    );
    await unifiedAdminPage.click('[data-testid="drawer-grant-course-submit-btn"]');
    await unifiedAdminPage.waitForSelector('[data-testid="drawer-action-error-alert"]', {
      timeout: 8000,
    });
    const drawerErrAlertText = await unifiedAdminPage.textContent(
      '[data-testid="drawer-action-error-alert"]'
    );
    const falselyGrantedOnError = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-granted-course-65e7704a9ea90c00080d5195"]'
    );
    await fetch(`${baseUrl}/api/ktn/test/fault`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ failStudentCoursesPost: false }),
    });

    recordTest(
      'TEST L',
      'L7',
      'When POST /api/ktn/students/courses fails, StudentDetailDrawer displays real error alert and does not mutate entitlements',
      Boolean(
        drawerErrAlertText &&
          drawerErrAlertText.includes('Thao tác chưa hoàn tất') &&
          !falselyGrantedOnError
      ),
      drawerErrAlertText?.replace(/\s+/g, ' ').trim().slice(0, 90) || ''
    );

    // L8 (Scenario 9 + Legacy URL redirect + Legacy class code warning): Closing drawer preserves search/filter; /admin/more?email=... redirects to drawer
    await unifiedAdminPage.click('[data-testid="drawer-close-btn"]');
    await unifiedAdminPage.waitForFunction(
      () => !document.querySelector('[data-testid="student-detail-drawer"]'),
      null,
      { timeout: 5000 }
    );
    const preservedSearchVal = await unifiedAdminPage.inputValue(
      '[data-testid="admin-search-input"]'
    );

    // Test legacy URL /admin/more?email=e2e.hs.0002@khongtunhi.com redirect & legacy class code warning
    await unifiedAdminPage.goto(
      `${baseUrl}/admin/more?email=${encodeURIComponent('e2e.hs.0002@khongtunhi.com')}`,
      { waitUntil: 'domcontentloaded' }
    );
    await unifiedAdminPage.waitForSelector('[data-testid="student-detail-drawer"]', {
      timeout: 8000,
    });
    const redirectedUrl = unifiedAdminPage.url();
    const legacyWarningVisible = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-legacy-class-warning"]'
    );
    const legacyClassKept = await unifiedAdminPage.textContent(
      '[data-testid="drawer-current-class-badge"]'
    );

    recordTest(
      'TEST L',
      'L8',
      'Closing drawer preserves search state, /admin/more?email=... redirects to /admin/students drawer, and legacy class code shows warning without deleting data',
      preservedSearchVal === 'tran bao ngoc 0999' &&
        redirectedUrl.includes('/admin/students') &&
        legacyWarningVisible &&
        Boolean(legacyClassKept?.includes('LEGACY-2023')),
      `search="${preservedSearchVal}", legacyClass="${legacyClassKept?.trim()}"`
    );

    // L9 (Scenarios 10 & 12): Mobile 390x844 full-screen drawer, profile edit, close via Quay lại, and persistence after F5 reload
    await unifiedAdminPage.setViewportSize({ width: 390, height: 844 });
    await unifiedAdminPage.goto(`${baseUrl}/admin/students`, { waitUntil: 'domcontentloaded' });
    await unifiedAdminPage.waitForSelector('[data-testid="admin-students-section"]', {
      timeout: 8000,
    });
    await unifiedAdminPage.fill('[data-testid="admin-search-input"]', 'e2e.hs.0999');
    await unifiedAdminPage.waitForTimeout(450);
    await unifiedAdminPage.waitForSelector(
      '[data-testid="admin-mobile-open-student-btn-e2e.hs.0999@khongtunhi.com"]',
      { timeout: 8000 }
    );

    // Capture Mobile Student Roster Screenshot (filtered to synthetic e2e.hs.0999)
    await unifiedAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-students-unified-mobile.png'),
      fullPage: false,
    });

    await unifiedAdminPage.click(
      '[data-testid="admin-mobile-open-student-btn-e2e.hs.0999@khongtunhi.com"]'
    );
    await unifiedAdminPage.waitForSelector('[data-testid="student-detail-drawer"]', {
      timeout: 5000,
    });
    const mobileBackBtnVisible = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-back-btn"]'
    );

    // Capture Mobile Drawer Screenshot
    await unifiedAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-student-drawer-mobile.png'),
      fullPage: false,
    });

    // Edit student phone in Section A
    await unifiedAdminPage.click('[data-testid="drawer-edit-profile-btn"]');
    await unifiedAdminPage.fill('[data-testid="drawer-profile-phone-input"]', '0978999888');
    await unifiedAdminPage.click('[data-testid="drawer-save-profile-btn"]');
    await unifiedAdminPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="drawer-info-phone"]')
          ?.textContent?.includes('0978999888'),
      null,
      { timeout: 8000 }
    );

    // Close mobile drawer via Quay lại button
    await unifiedAdminPage.click('[data-testid="drawer-back-btn"]');
    await unifiedAdminPage.waitForFunction(
      () => !document.querySelector('[data-testid="student-detail-drawer"]'),
      null,
      { timeout: 5000 }
    );

    // Reload (F5) and verify class YCT3-02, course HSK1, and phone 0978999888 persisted
    await unifiedAdminPage.reload({ waitUntil: 'domcontentloaded' });
    await unifiedAdminPage.waitForSelector('[data-testid="admin-students-section"]', {
      timeout: 8000,
    });
    await unifiedAdminPage.fill('[data-testid="admin-search-input"]', 'e2e.hs.0999');
    await unifiedAdminPage.waitForTimeout(450);
    await unifiedAdminPage.click(
      '[data-testid="admin-mobile-open-student-btn-e2e.hs.0999@khongtunhi.com"]'
    );
    await unifiedAdminPage.waitForSelector('[data-testid="student-detail-drawer"]', {
      timeout: 5000,
    });
    const phoneAfterF5 = await unifiedAdminPage.textContent('[data-testid="drawer-info-phone"]');
    const classAfterF5 = await unifiedAdminPage.textContent(
      '[data-testid="drawer-current-class-badge"]'
    );
    const courseAfterF5 = await unifiedAdminPage.isVisible(
      '[data-testid="drawer-granted-course-6adadba969897b0002482ca5"]'
    );

    recordTest(
      'TEST L',
      'L9',
      'Mobile 390x844 opens full-width StudentDetailDrawer, saves profile edits, closes via Quay lại, and persists all changes after F5 reload',
      mobileBackBtnVisible &&
        Boolean(phoneAfterF5?.includes('0978999888')) &&
        Boolean(classAfterF5?.includes('YCT3-02')) &&
        courseAfterF5,
      `mobileBack=${mobileBackBtnVisible}, phone="${phoneAfterF5?.trim()}", class="${classAfterF5?.trim()}"`
    );

    await unifiedAdminContext.close();

    // =========================================================================
    // TEST M — STUDENT MOBILE UX CLEANUP: STREAMLINED HOME, PURE CLASSROOMS, DEEP-LINKS & NOTIFICATION SETTINGS (M1..M6)
    // =========================================================================
    const uxStudentContext = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const uxStudentPage = await uxStudentContext.newPage();
    await uxStudentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await uxStudentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await uxStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 10000,
    });
    await uxStudentPage.waitForTimeout(350);

    // M1: StudentHome has no duplicate greeting strip, no 4-tile grid, compact Discovery cards, and captures after screenshots
    const hasDuplicateGreeting =
      (await uxStudentPage.locator('[data-testid="student-greeting-strip"]').count()) > 0;
    const hasDuplicateFourGrid =
      (await uxStudentPage.locator('[data-testid="student-quick-courses"]').count()) > 0;
    const hasNextClassOnHome = await uxStudentPage.isVisible(
      '[data-testid="student-next-class-card"]'
    );
    const hasContinueOnHome = await uxStudentPage.isVisible(
      '[data-testid="student-continue-learning-card"]'
    );
    const hasFlashcardOnHome = await uxStudentPage.isVisible(
      '[data-testid="discovery-card-flashcard"]'
    );

    await uxStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'student-home-after-390.png'),
      fullPage: true,
    });
    await uxStudentPage.setViewportSize({ width: 1440, height: 900 });
    await uxStudentPage.waitForTimeout(250);
    await uxStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'student-home-after-1440.png'),
      fullPage: true,
    });

    recordTest(
      'TEST M',
      'M1',
      'StudentHome removes duplicate greeting strip and 4-tile nav grid while keeping compact Next Class, Continue Learning, and Discovery cards',
      !hasDuplicateGreeting &&
        !hasDuplicateFourGrid &&
        hasNextClassOnHome &&
        hasContinueOnHome &&
        hasFlashcardOnHome,
      `greetingStrip=${hasDuplicateGreeting}, fourGrid=${hasDuplicateFourGrid}`
    );

    // M2: ClassroomsPage has ZERO video-courses-summary-card, compact mobile session selector, no horizontal overflow, and captures after screenshots
    await uxStudentPage.setViewportSize({ width: 390, height: 844 });
    await uxStudentPage.goto(`${baseUrl}/classrooms`, { waitUntil: 'domcontentloaded' });
    await uxStudentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
    await uxStudentPage.waitForTimeout(350);

    const hasVideoSummaryOnClassrooms =
      (await uxStudentPage.locator('[data-testid="video-courses-summary-card"]').count()) > 0;
    const classroomsOverflow390 = await uxStudentPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    const sessionSelectorHeightMobile = await uxStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="classroom-session-selector"]');
      return el ? Math.round(el.getBoundingClientRect().height) : 999;
    });

    await uxStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'classrooms-after-390.png'),
      fullPage: true,
    });
    await uxStudentPage.setViewportSize({ width: 1440, height: 900 });
    await uxStudentPage.waitForTimeout(250);
    await uxStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'classrooms-after-1440.png'),
      fullPage: true,
    });

    recordTest(
      'TEST M',
      'M2',
      'ClassroomsPage removes video-courses-summary-card completely and renders compact horizontal session selector on mobile without overflow',
      !hasVideoSummaryOnClassrooms &&
        classroomsOverflow390 <= 2 &&
        sessionSelectorHeightMobile <= 80,
      `videoCard=${hasVideoSummaryOnClassrooms}, overflow=${classroomsOverflow390}px, mobileSessionHeight=${sessionSelectorHeightMobile}px`
    );

    // M3: Unassigned student on /classrooms sees ONLY "Em chưa được xếp vào lớp học trực tiếp." and "Liên hệ Học vụ"
    const unassignedCheckContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const unassignedCheckPage = await unassignedCheckContext.newPage();
    await unassignedCheckPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await unassignedCheckPage.click('[data-testid="quick-login-taphong2002vip@gmail.com"]');
    await unassignedCheckPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 8000,
    });
    await unassignedCheckPage.goto(`${baseUrl}/classrooms`, { waitUntil: 'domcontentloaded' });
    await unassignedCheckPage.waitForSelector('[data-testid="unassigned-class-empty-state"]', {
      timeout: 8000,
    });
    const unassignedEmptyText = await unassignedCheckPage.textContent(
      '[data-testid="unassigned-class-empty-state"]'
    );
    const unassignedHasVideoCard =
      (await unassignedCheckPage.locator('[data-testid="video-courses-summary-card"]').count()) > 0;
    await unassignedCheckContext.close();

    recordTest(
      'TEST M',
      'M3',
      'Unassigned student on /classrooms sees "Em chưa được xếp vào lớp học trực tiếp." and "Liên hệ Học vụ" with zero video course promo',
      Boolean(
        unassignedEmptyText?.includes('Em chưa được xếp vào lớp học trực tiếp.') &&
          unassignedEmptyText?.includes('Liên hệ Học vụ') &&
          !unassignedHasVideoCard
      ),
      `text="${unassignedEmptyText?.replace(/\s+/g, ' ').trim()}"`
    );

    // M4: Live classroom homework (course_id = CLASS_YCT2-04) clicked on StudentHome opens /classrooms?class=YCT2-04&session=1&exercise=101 (never /learning)
    await uxStudentPage.setViewportSize({ width: 390, height: 844 });
    await uxStudentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await uxStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 8000,
    });
    await uxStudentPage.waitForSelector('[data-testid^="dashboard-hw-item-"]', {
      timeout: 8000,
    });
    const classHwItem = uxStudentPage
      .locator('[data-testid^="dashboard-hw-item-"]')
      .filter({ hasText: 'YCT2-04' })
      .first();
    await classHwItem.click();
    await uxStudentPage.waitForSelector('[data-testid="classrooms-page"]', { timeout: 8000 });
    await uxStudentPage.waitForSelector('[data-testid="homework-submission-panel"]', {
      timeout: 8000,
    });
    const hwDeepLinkUrl = uxStudentPage.url();
    const hwPanelOpenedOnClassrooms = await uxStudentPage.isVisible(
      '[data-testid="homework-submission-panel"]'
    );

    recordTest(
      'TEST M',
      'M4',
      'Clicking CLASS_YCT2-04 homework on StudentHome navigates directly to /classrooms with exact session & exercise and opens HomeworkPanel',
      hwDeepLinkUrl.includes('/classrooms') &&
        hwDeepLinkUrl.includes('class=YCT2-04') &&
        hwDeepLinkUrl.includes('exercise=101') &&
        !hwDeepLinkUrl.includes('/learning') &&
        hwPanelOpenedOnClassrooms,
      `url=${hwDeepLinkUrl}, hwPanelOpen=${hwPanelOpenedOnClassrooms}`
    );

    // M5: LearningPage displays entitled video courses switcher and opens video homework via deep-link
    await uxStudentPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=1&tab=homework`,
      { waitUntil: 'domcontentloaded' }
    );
    await uxStudentPage.waitForSelector('[data-testid="video-learning-page"]', { timeout: 8000 });
    await uxStudentPage.waitForSelector('[data-testid="homework-submission-panel"]', {
      timeout: 8000,
    });
    const hasCourseSwitcherOnLearning = await uxStudentPage.isVisible(
      '[data-testid="learning-course-switcher-header"]'
    );
    const hasHwPanelOnLearning = await uxStudentPage.isVisible(
      '[data-testid="homework-submission-panel"]'
    );

    recordTest(
      'TEST M',
      'M5',
      'LearningPage displays video course switcher header and opens HomeworkPanel when deep-linked with tab=homework',
      hasCourseSwitcherOnLearning && hasHwPanelOnLearning,
      `courseSwitcher=${hasCourseSwitcherOnLearning}, hwPanel=${hasHwPanelOnLearning}`
    );

    // M6: NotificationCenter displays Cài đặt thông báo with device push status, iPhone PWA guide, and toggles for Tin nhắn, Bài tập, Điểm số, Lịch học
    await uxStudentPage.goto(`${baseUrl}/notifications`, { waitUntil: 'domcontentloaded' });
    await uxStudentPage.waitForSelector('[data-testid="notification-center-page"]', {
      timeout: 8000,
    });
    const hasNotifPrefsCard = await uxStudentPage.isVisible(
      '[data-testid="notification-preferences-card"]'
    );
    const deviceStatusBadgeText = await uxStudentPage.textContent(
      '[data-testid="device-push-status-badge"]'
    );
    const hasIphoneGuide = await uxStudentPage.isVisible(
      '[data-testid="iphone-pwa-push-guide"]'
    );
    const hasEnablePushBtn = await uxStudentPage.isVisible(
      '[data-testid="enable-web-push-btn"]'
    );
    const hasPrefToggles =
      (await uxStudentPage.isVisible('[data-testid="notif-pref-chat"]')) &&
      (await uxStudentPage.isVisible('[data-testid="notif-pref-homework"]')) &&
      (await uxStudentPage.isVisible('[data-testid="notif-pref-grades"]')) &&
      (await uxStudentPage.isVisible('[data-testid="notif-pref-schedule"]'));

    recordTest(
      'TEST M',
      'M6',
      'NotificationCenter displays Cài đặt thông báo with device push status, iPhone PWA guide, push opt-in button, and Tin nhắn/Bài tập/Điểm số/Lịch học toggles',
      hasNotifPrefsCard &&
        Boolean(deviceStatusBadgeText?.trim()) &&
        hasIphoneGuide &&
        hasEnablePushBtn &&
        hasPrefToggles,
      `deviceStatus="${deviceStatusBadgeText?.trim()}", toggles=${hasPrefToggles}`
    );

    await uxStudentContext.close();
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
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('[KTN-UI-V2 E2E] Fatal failure:', err);
  process.exit(1);
});
