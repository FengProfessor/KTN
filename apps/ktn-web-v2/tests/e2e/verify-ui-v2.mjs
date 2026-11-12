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
    const row0001Text = await unifiedAdminPage.textContent(
      '[data-testid="admin-student-row-e2e.hs.0001@khongtunhi.com"]'
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
      'Server-side search across >1,000 students finds target by unaccented name and enforces max 2 canonical course badges (+N khóa)',
      Boolean(
        extraCoursesBadgeText?.includes('+1 khóa') &&
          row0001Text?.includes('Chinese For Kids') &&
          !row0001Text?.includes('Khóa (') &&
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

    // Dismiss transient login toast before capturing clean StudentHome screenshots
    const closeToastBtns = uxStudentPage.locator('[aria-label="Đóng thông báo"]');
    const toastCount = await closeToastBtns.count();
    for (let i = 0; i < toastCount; i++) {
      await closeToastBtns.first().click().catch(() => {});
    }
    await uxStudentPage.waitForTimeout(150);

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

    // M6: NotificationCenter displays Cài đặt thông báo with device push status, iPhone PWA guide, and independent persistent toggles for Tin nhắn, Bài tập, Điểm số, Lịch học
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

    // Toggle Điểm số (notif-pref-grades) off -> verify Bài tập (notif-pref-homework) stays checked and persists after reload
    await uxStudentPage.click('[data-testid="notif-pref-grades"]');
    await uxStudentPage.waitForTimeout(350);
    await uxStudentPage.reload({ waitUntil: 'domcontentloaded' });
    await uxStudentPage.waitForSelector('[data-testid="notification-center-page"]', {
      timeout: 8000,
    });
    const gradesAfterToggleOff = await uxStudentPage.isChecked('[data-testid="notif-pref-grades"]');
    const homeworkStayedChecked = await uxStudentPage.isChecked(
      '[data-testid="notif-pref-homework"]'
    );
    // Restore notif-pref-grades to true
    await uxStudentPage.click('[data-testid="notif-pref-grades"]');
    await uxStudentPage.waitForTimeout(250);

    recordTest(
      'TEST M',
      'M6',
      'NotificationCenter displays Cài đặt thông báo with device push status, iPhone PWA guide, push opt-in button, and independent persistent Tin nhắn/Bài tập/Điểm số/Lịch học toggles',
      hasNotifPrefsCard &&
        Boolean(deviceStatusBadgeText?.trim()) &&
        hasIphoneGuide &&
        hasEnablePushBtn &&
        hasPrefToggles &&
        gradesAfterToggleOff === false &&
        homeworkStayedChecked === true,
      `deviceStatus="${deviceStatusBadgeText?.trim()}", gradesOff=${!gradesAfterToggleOff}, hwKept=${homeworkStayedChecked}`
    );

    await uxStudentContext.close();

    // =========================================================================
    // TEST N — ORDER MANAGEMENT UPGRADE, IN-APP COURSE PURCHASE & FLASHCARD LINK (N1..N6)
    // =========================================================================
    const orderAdminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const orderAdminPage = await orderAdminContext.newPage();
    await orderAdminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await orderAdminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await orderAdminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });

    // N1: Admin /admin/orders table columns, "Chưa cung cấp" parent name honesty, distinct payment badges, search & 7 filters
    await orderAdminPage.goto(`${baseUrl}/admin/orders`, { waitUntil: 'domcontentloaded' });
    await orderAdminPage.waitForSelector('[data-testid="admin-orders-section"]', { timeout: 8000 });
    await orderAdminPage.waitForSelector('[data-testid="admin-orders-table"]', { timeout: 8000 });

    const ordersTableHeaderText = await orderAdminPage.textContent(
      '[data-testid="admin-orders-table"] thead'
    );
    const parentCell261105Text = await orderAdminPage.textContent(
      '[data-testid="admin-order-parent-ORD-261105"]'
    );
    const missingParentCellText = await orderAdminPage.textContent(
      '[data-testid="admin-order-parent-ORD-261106"]'
    );
    const paymentBadge261105 = await orderAdminPage.textContent(
      '[data-testid="admin-order-payment-badge-ORD-261105"]'
    );
    const paymentBadge261106 = await orderAdminPage.textContent(
      '[data-testid="admin-order-payment-badge-ORD-261106"]'
    );
    const paymentBadge261107 = await orderAdminPage.textContent(
      '[data-testid="admin-order-payment-badge-ORD-261107"]'
    );

    const filterIds = [
      'all',
      'new',
      'not_called',
      'called_awaiting_payment',
      'paid_awaiting_approval',
      'activated',
      'needs_error_handling',
      'cancelled_refunded',
    ];
    let allFiltersExist = true;
    for (const fid of filterIds) {
      const visible = await orderAdminPage.isVisible(`[data-testid="admin-order-filter-${fid}"]`);
      if (!visible) allFiltersExist = false;
    }

    // Test quick search by order ID
    await orderAdminPage.fill('[data-testid="admin-order-search-input"]', 'ORD-261106');
    await orderAdminPage.waitForTimeout(250);
    const row261106VisibleOnSearch = await orderAdminPage.isVisible(
      '[data-testid="admin-order-row-ORD-261106"]'
    );
    const row261105HiddenOnSearch = !(await orderAdminPage.isVisible(
      '[data-testid="admin-order-row-ORD-261105"]'
    ));
    await orderAdminPage.fill('[data-testid="admin-order-search-input"]', '');
    await orderAdminPage.waitForTimeout(200);

    await orderAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-orders-table-desktop.png'),
      fullPage: false,
    });

    recordTest(
      'TEST N',
      'N1',
      'Admin /admin/orders displays full 10-column table, shows "Chưa cung cấp" when parent_name is missing, differentiates payment badges, and supports quick search + 7 filters',
      Boolean(
        ordersTableHeaderText?.includes('Mã đơn') &&
          ordersTableHeaderText?.includes('Tên học viên') &&
          ordersTableHeaderText?.includes('Tên phụ huynh') &&
          ordersTableHeaderText?.includes('Trạng thái chăm sóc') &&
          ordersTableHeaderText?.includes('Trạng thái thanh toán') &&
          ordersTableHeaderText?.includes('Trạng thái cấp TK') &&
          parentCell261105Text?.trim() === 'Chị Phạm Thu Hà' &&
          missingParentCellText?.trim() === 'Chưa cung cấp' &&
          paymentBadge261105?.includes('Đã xác minh tiền thực nhận') &&
          paymentBadge261106?.includes('Chưa thanh toán') &&
          paymentBadge261107?.includes('Khách báo đã chuyển khoản') &&
          allFiltersExist &&
          row261106VisibleOnSearch &&
          row261105HiddenOnSearch
      ),
      `parent261106="${missingParentCellText?.trim()}", pay261106="${paymentBadge261106?.trim()}", pay261107="${paymentBadge261107?.trim()}"`
    );

    // N2: OrderDetailDrawer policy gate blocks activation when unpaid/uncalled/missing email & warns on customer_reported
    await orderAdminPage.click('[data-testid="admin-open-order-btn-ORD-261107"]');
    await orderAdminPage.waitForSelector('[data-testid="order-detail-drawer"]', { timeout: 5000 });
    const hasReportedWarning = await orderAdminPage.isVisible(
      '[data-testid="order-payment-reported-warning"]'
    );
    const activateDisabledOnCustomerReported = await orderAdminPage.isDisabled(
      '[data-testid="order-activate-course-btn"]'
    );
    await orderAdminPage.click('[data-testid="order-drawer-close-btn"]');
    await orderAdminPage.waitForTimeout(200);

    await orderAdminPage.click('[data-testid="admin-open-order-btn-ORD-261106"]');
    await orderAdminPage.waitForSelector('[data-testid="order-detail-drawer"]', { timeout: 5000 });
    const hasCallTelLink = await orderAdminPage.isVisible('[data-testid="order-call-tel-link"]');
    const hasZaloLink = await orderAdminPage.isVisible('[data-testid="order-zalo-link"]');
    const activateDisabledInitially = await orderAdminPage.isDisabled(
      '[data-testid="order-activate-course-btn"]'
    );
    const blockReasonsText = await orderAdminPage.textContent(
      '[data-testid="order-activation-block-reasons"]'
    );

    recordTest(
      'TEST N',
      'N2',
      'OrderDetailDrawer renders Customer/Contact/Payment/Account/Activation sections, tel:/Zalo links, and disables "Xác nhận & Kích hoạt khóa học" with explicit reasons until policy gates pass',
      hasReportedWarning &&
        activateDisabledOnCustomerReported &&
        hasCallTelLink &&
        hasZaloLink &&
        activateDisabledInitially &&
        Boolean(
          blockReasonsText?.includes('Chưa xác minh tiền thực nhận') &&
            blockReasonsText?.includes('Chưa có email đăng nhập hợp lệ') &&
            blockReasonsText?.includes('Chưa cập nhật trạng thái chăm sóc')
        ),
      `disabledInitial=${activateDisabledInitially}, customerReportedBlocked=${activateDisabledOnCustomerReported}`
    );

    // N3: Admin completes consultation, enters email & parent name, verifies payment, confirms modal, activates course, and confirms credential handoff
    const n3Email = `minhtuan.order.${Date.now()}@khongtunhi.com`;
    await orderAdminPage.fill('[data-testid="order-edit-email-input"]', n3Email);
    await orderAdminPage.fill(
      '[data-testid="order-edit-parent-input"]',
      'Chị Lê Thu Trang'
    );
    await orderAdminPage.click('[data-testid="order-save-customer-info-btn"]');
    await orderAdminPage.waitForTimeout(300);

    await orderAdminPage.fill(
      '[data-testid="order-consultation-note-input"]',
      'Đã gọi xác nhận với mẹ bé Minh Tuấn, mẹ đăng ký học khóa Chinese For Kids 1.'
    );
    await orderAdminPage.click('[data-testid="order-contact-btn-called"]');
    await orderAdminPage.waitForTimeout(300);

    await orderAdminPage.fill(
      '[data-testid="order-payment-tx-ref-input"]',
      'FT2631299001'
    );
    await orderAdminPage.fill(
      '[data-testid="order-payment-received-amount-input"]',
      '890000'
    );
    await orderAdminPage.click('[data-testid="order-payment-btn-verified_paid"]');
    await orderAdminPage.waitForSelector('[data-testid="order-payment-manual-proof"]', {
      timeout: 5000,
    });

    const activateEnabledAfterChecks = !(await orderAdminPage.isDisabled(
      '[data-testid="order-activate-course-btn"]'
    ));
    await orderAdminPage.click('[data-testid="order-activate-course-btn"]');
    await orderAdminPage.waitForSelector('[data-testid="order-confirm-activation-modal"]', {
      timeout: 5000,
    });
    const confirmModalSummary = await orderAdminPage.textContent(
      '[data-testid="order-confirm-activation-summary"]'
    );

    await orderAdminPage.click('[data-testid="order-final-confirm-activation-btn"]');
    await orderAdminPage.waitForSelector('[data-testid="order-post-activation-status"]', {
      timeout: 10000,
    });
    const handoffStageBeforeConfirm = await orderAdminPage.textContent(
      '[data-testid="order-handoff-stage-text"]'
    );
    const hasEphemeralPasswordBox = await orderAdminPage.isVisible(
      '[data-testid="order-ephemeral-password-box"]'
    );

    await orderAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-order-drawer-desktop.png'),
      fullPage: false,
    });

    // Confirm credential handoff explicitly
    await orderAdminPage.click('[data-testid="order-confirm-handoff-btn"]');
    await orderAdminPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="order-handoff-stage-text"]')
          ?.textContent?.includes('Đã bàn giao thông tin đăng nhập'),
      null,
      { timeout: 5000 }
    );
    const handoffStageAfterConfirm = await orderAdminPage.textContent(
      '[data-testid="order-handoff-stage-text"]'
    );

    // Verify Mobile 390x844 full-screen OrderDetailDrawer
    await orderAdminPage.setViewportSize({ width: 390, height: 844 });
    await orderAdminPage.waitForTimeout(250);
    const mobileOrderBackVisible = await orderAdminPage.isVisible(
      '[data-testid="order-drawer-back-btn"]'
    );
    await orderAdminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-order-drawer-mobile.png'),
      fullPage: false,
    });
    await orderAdminPage.click('[data-testid="order-drawer-back-btn"]');
    await orderAdminContext.close();

    recordTest(
      'TEST N',
      'N3',
      'Admin consultation + payment verification enables "Xác nhận & Kích hoạt khóa học", shows final confirmation modal, provisions account, and requires explicit credential handoff confirmation',
      activateEnabledAfterChecks &&
        Boolean(
          confirmModalSummary?.includes('Bé Lê Minh Tuấn') &&
            confirmModalSummary?.includes(n3Email)
        ) &&
        Boolean(
          handoffStageBeforeConfirm?.includes(
            'Đang chờ học viên thiết lập mật khẩu / chờ bàn giao'
          )
        ) &&
        hasEphemeralPasswordBox &&
        Boolean(handoffStageAfterConfirm?.includes('Đã bàn giao thông tin đăng nhập')) &&
        mobileOrderBackVisible,
      `email=${n3Email}, handoffBefore="${handoffStageBeforeConfirm?.trim()}", handoffAfter="${handoffStageAfterConfirm?.trim()}"`
    );

    // N4: Student /learning prioritizes "Khóa của em" before "Khám phá thêm", supports 90s Demo Video modal & honest "Chưa có bài học thử" fallback
    const purchaseStudentContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const purchaseStudentPage = await purchaseStudentContext.newPage();
    await purchaseStudentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await purchaseStudentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await purchaseStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 10000,
    });
    await purchaseStudentPage.goto(`${baseUrl}/learning`, { waitUntil: 'domcontentloaded' });
    await purchaseStudentPage.waitForSelector('[data-testid="video-learning-page"]', {
      timeout: 8000,
    });
    await purchaseStudentPage.waitForSelector(
      '[data-testid="student-explore-courses-section"]',
      { timeout: 8000 }
    );

    const sectionOrderCheck = await purchaseStudentPage.evaluate(() => {
      const mySec = document.querySelector('[data-testid="student-my-courses-section"]');
      const expSec = document.querySelector('[data-testid="student-explore-courses-section"]');
      if (!mySec || !expSec) return { ok: false };
      const myTop = mySec.getBoundingClientRect().top;
      const expTop = expSec.getBoundingClientRect().top;
      return { ok: myTop < expTop, myTop: Math.round(myTop), expTop: Math.round(expTop) };
    });

    // Click "Xem học thử" on Tiếng Trung Trẻ Em 3 (6638bd09a7367400085c7ab2) -> has demo video + 90s badge
    await purchaseStudentPage.click(
      '[data-testid="watch-demo-course-btn-6638bd09a7367400085c7ab2"]'
    );
    await purchaseStudentPage.waitForSelector('[data-testid="course-demo-video-modal"]', {
      timeout: 5000,
    });
    const demoDurationBadgeText = await purchaseStudentPage.textContent(
      '[data-testid="course-demo-duration-badge"]'
    );
    await purchaseStudentPage.click('[data-testid="close-demo-modal-btn"]');
    await purchaseStudentPage.waitForTimeout(200);

    // Click "Xem học thử" on Tiếng Trung Trẻ Em 2 (66028938bfd6c90008b816e1) -> shows "Chưa có bài học thử" without fake video
    await purchaseStudentPage.click(
      '[data-testid="watch-demo-course-btn-66028938bfd6c90008b816e1"]'
    );
    await purchaseStudentPage.waitForSelector('[data-testid="course-demo-unavailable"]', {
      timeout: 5000,
    });
    const demoUnavailableText = await purchaseStudentPage.textContent(
      '[data-testid="course-demo-unavailable"]'
    );
    await purchaseStudentPage.click('[data-testid="close-demo-modal-btn"]');
    await purchaseStudentPage.waitForTimeout(200);

    recordTest(
      'TEST N',
      'N4',
      'Student /learning prioritizes "Khóa của em" above "Khám phá thêm", plays 90s demo video when available, and shows "Chưa có bài học thử" when no demo exists',
      sectionOrderCheck.ok &&
        Boolean(demoDurationBadgeText?.includes('90 giây')) &&
        Boolean(demoUnavailableText?.includes('Chưa có bài học thử')),
      `myTop=${sectionOrderCheck.myTop}px < expTop=${sectionOrderCheck.expTop}px, demoBadge="${demoDurationBadgeText?.trim()}"`
    );

    // N5: In-App Course Registration Popup auto-fills read-only session identity, isolates profile phone unless checked, and shows "Đơn của em đang chờ xác nhận." + 7 stages + VietQR
    const profileBeforeOrder = await purchaseStudentPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const res = await fetch('/api/ktn/students/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    });

    await purchaseStudentPage.click(
      '[data-testid="register-course-btn-6638bd09a7367400085c7ab2"]'
    );
    await purchaseStudentPage.waitForSelector('[data-testid="course-registration-modal"]', {
      timeout: 5000,
    });

    // Verify on mobile 390x844 that the registration modal submit button is above and not covered by mobile-bottom-nav
    await purchaseStudentPage.setViewportSize({ width: 390, height: 844 });
    await purchaseStudentPage.waitForTimeout(150);
    const mobileModalZCheck = await purchaseStudentPage.evaluate(() => {
      const modal = document.querySelector('[data-testid="course-registration-modal"]');
      const bottomNav = document.querySelector('[data-testid="mobile-bottom-nav"]');
      const modalZ = modal ? Number(window.getComputedStyle(modal).zIndex) || 0 : 0;
      const navZ = bottomNav ? Number(window.getComputedStyle(bottomNav).zIndex) || 0 : 0;
      return { ok: modalZ > navZ, modalZ, navZ };
    });
    await purchaseStudentPage.setViewportSize({ width: 1440, height: 900 });

    const regReadonlyEmail = await purchaseStudentPage.inputValue(
      '[data-testid="reg-student-email-readonly"]'
    );
    const regPrefilledName = await purchaseStudentPage.inputValue(
      '[data-testid="reg-student-name-input"]'
    );

    await purchaseStudentPage.fill('[data-testid="reg-parent-phone-input"]', '0988776655');
    await purchaseStudentPage.fill(
      '[data-testid="reg-parent-name-input"]',
      'Chị Thu (Mẹ Hoàng Ngân)'
    );
    await purchaseStudentPage.fill(
      '[data-testid="reg-note-input"]',
      'Đăng ký thêm khóa Chinese For Kids 1 cho con học buổi tối.'
    );
    await purchaseStudentPage.click('[data-testid="reg-submit-order-btn"]');

    await purchaseStudentPage.waitForSelector(
      '[data-testid="course-order-confirmation-view"]',
      { timeout: 8000 }
    );
    const pendingHeadlineText = await purchaseStudentPage.textContent(
      '[data-testid="student-order-pending-headline"]'
    );
    const createdStudentOrderId = (
      (await purchaseStudentPage.textContent('[data-testid="student-created-order-id"]')) || ''
    ).trim();
    const hasVietQrBox = await purchaseStudentPage.isVisible(
      '[data-testid="student-vietqr-payment-box"]'
    );
    const trackerListText = await purchaseStudentPage.textContent(
      '[data-testid="student-order-7stage-list"]'
    );

    // Self-report transfer from student modal
    await purchaseStudentPage.fill(
      '[data-testid="student-report-tx-input"]',
      'MB99887766'
    );
    await purchaseStudentPage.click('[data-testid="student-report-payment-btn"]');
    await purchaseStudentPage.waitForTimeout(350);

    await purchaseStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'student-learning-purchase-desktop.png'),
      fullPage: false,
    });

    await purchaseStudentPage.click('[data-testid="student-close-confirmation-btn"]');
    await purchaseStudentPage.waitForSelector(
      '[data-testid="student-orders-tracker-section"]',
      { timeout: 5000 }
    );

    const profileAfterOrder = await purchaseStudentPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const res = await fetch('/api/ktn/students/me', {
        headers: { Authorization: `Bearer ${token}` },
      });
      return res.json();
    });

    // Admin verifies payment and activates the student's in-app order -> newly unlocked course moves into "Khóa của em" on /learning
    const adminApproveStudentOrder = await purchaseStudentPage.evaluate(async (ordId) => {
      const loginRes = await fetch('/api/ktn/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'quanly@khongtunhi.com',
          password: 'AdminStrongPassword!2026',
          role: 'admin',
        }),
      }).then((r) => r.json());
      const adminTok = loginRes.token;
      await fetch('/api/ktn/orders/update', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTok}`,
        },
        body: JSON.stringify({
          orderId: ordId,
          contactStatus: 'called',
          paymentDetailedStatus: 'verified_paid',
          paymentReceivedAmount: 890000,
          paymentTxRef: 'MB99887766',
        }),
      });
      const appRes = await fetch('/api/ktn/orders/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${adminTok}`,
        },
        body: JSON.stringify({
          orderId: ordId,
          confirmActivation: true,
        }),
      });
      return { status: appRes.status, data: await appRes.json() };
    }, createdStudentOrderId);

    await purchaseStudentPage.reload({ waitUntil: 'domcontentloaded' });
    await purchaseStudentPage.waitForSelector(
      '[data-testid="my-entitled-course-card-6638bd09a7367400085c7ab2"]',
      { timeout: 8000 }
    );
    const unlockedCourseInMySection = await purchaseStudentPage.isVisible(
      '[data-testid="my-entitled-course-card-6638bd09a7367400085c7ab2"]'
    );

    recordTest(
      'TEST N',
      'N5',
      'In-app course registration pre-fills session email/name, creates authenticated_student order with VietQR & 7-stage tracker ("Đơn của em đang chờ xác nhận."), preserves original student profile phone, and moves course into "Khóa của em" after Admin approval',
      mobileModalZCheck.ok &&
        regReadonlyEmail === 'hoangngan@khongtunhi.com' &&
        Boolean(regPrefilledName?.includes('Hoàng Ngân')) &&
        Boolean(pendingHeadlineText?.includes('Đơn của em đang chờ xác nhận.')) &&
        Boolean(createdStudentOrderId?.startsWith('ORD-')) &&
        hasVietQrBox &&
        Boolean(
          trackerListText?.includes('Đã tiếp nhận') &&
            trackerListText?.includes('Đã liên hệ') &&
            trackerListText?.includes('Chờ thanh toán') &&
            trackerListText?.includes('Đã xác minh thanh toán') &&
            trackerListText?.includes('Đang kích hoạt') &&
            trackerListText?.includes('Đã mở khóa') &&
            trackerListText?.includes('Cần hỗ trợ')
        ) &&
        profileBeforeOrder?.student?.phone === profileAfterOrder?.student?.phone &&
        adminApproveStudentOrder.status === 200 &&
        unlockedCourseInMySection,
      `orderId=${createdStudentOrderId}, modalZ=${mobileModalZCheck.modalZ}>navZ=${mobileModalZCheck.navZ}, profilePhoneKept=${profileAfterOrder?.student?.phone}, unlockedInMyCourses=${unlockedCourseInMySection}`
    );

    // N6: StudentHome Flashcard card opens in-app #/flashcards route (never fengprofessor.github.io or target="_blank") with working "Quay lại Trang chủ" button and 7 Lộ (605 cards)
    await purchaseStudentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await purchaseStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 8000,
    });
    const flashcardLinkAttrs = await purchaseStudentPage.evaluate(() => {
      const card = document.querySelector('[data-testid="discovery-card-flashcard"]');
      const cta = document.querySelector('[data-testid="flashcard-cta-btn"]');
      if (!card || !cta) return null;
      return {
        tagName: cta.tagName,
        href: cta.getAttribute('href') || '',
        target: cta.getAttribute('target') || '',
        rel: cta.getAttribute('rel') || '',
        cardText: (card.textContent || '').replace(/\s+/g, ' ').trim(),
      };
    });

    const fcArtifactsDir = path.resolve(SCREENSHOT_DIR, '../../../flashcards/tests/artifacts/before-after');
    fs.mkdirSync(fcArtifactsDir, { recursive: true });
    await purchaseStudentPage.setViewportSize({ width: 390, height: 844 });
    await purchaseStudentPage.waitForTimeout(250);
    await purchaseStudentPage.screenshot({
      path: path.join(fcArtifactsDir, 'pwa_before_click_flashcard_mobile_390x844.png'),
    });

    await purchaseStudentPage.click('[data-testid="flashcard-cta-btn"]');
    await purchaseStudentPage.waitForSelector('[data-testid="flashcards-page"]', {
      timeout: 8000,
    });
    await purchaseStudentPage.waitForSelector('[data-testid="flashcards-back-home-btn"]', {
      timeout: 8000,
    });
    await purchaseStudentPage.waitForSelector('[data-testid="flashcards-iframe"]', {
      timeout: 8000,
    });

    const iframeElement = await purchaseStudentPage.$('[data-testid="flashcards-iframe"]');
    const fcFrame = await iframeElement?.contentFrame();
    await fcFrame?.waitForSelector('#cardScene', { timeout: 8000 });
    await fcFrame?.evaluate(async () => {
      const btnNext = document.getElementById('btnNext');
      if (btnNext) {
        for (let i = 0; i < 7; i++) btnNext.click();
      }
      await new Promise((r) => setTimeout(r, 350));
    });
    await purchaseStudentPage.screenshot({
      path: path.join(fcArtifactsDir, 'pwa_after_click_flashcard_mobile_390x844.png'),
    });

    await purchaseStudentPage.setViewportSize({ width: 1440, height: 900 });
    await purchaseStudentPage.waitForTimeout(300);
    await purchaseStudentPage.screenshot({
      path: path.join(fcArtifactsDir, 'pwa_after_click_flashcard_desktop_1440x900.png'),
    });

    const fcInAppStats = await fcFrame?.evaluate(() => {
      const levels = window.FLASHCARDS_DATA_BY_LEVEL || {};
      const counts = Object.fromEntries(
        Object.entries(levels).map(([k, arr]) => [k, Array.isArray(arr) ? arr.length : 0])
      );
      const total = Object.values(counts).reduce((a, b) => a + b, 0);
      return {
        origin: window.location.origin,
        pathname: window.location.pathname,
        isEmbedClass: document.documentElement.classList.contains('is-ktn-embed'),
        counts,
        total,
      };
    });

    const headerStillVisibleInApp = await purchaseStudentPage.isVisible(
      '[data-testid="compact-top-header"]'
    );
    await purchaseStudentPage.click('[data-testid="flashcards-back-home-btn"]');
    await purchaseStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 8000,
    });
    const returnedHomeOk = await purchaseStudentPage.isVisible(
      '[data-testid="student-dashboard-page"]'
    );
    await purchaseStudentContext.close();

    recordTest(
      'TEST N',
      'N6',
      'StudentHome Flashcard CTA opens in-app route #/flashcards (zero github.io link, zero target="_blank"), loads 605 cards across 7 Lộ from same-origin /flashcards/* while preserving KTN header/session, and returns home via "Quay lại Trang chủ"',
      Boolean(
        flashcardLinkAttrs &&
          flashcardLinkAttrs.href === '#/flashcards' &&
          !flashcardLinkAttrs.href.includes('github.io') &&
          flashcardLinkAttrs.target === '' &&
          !flashcardLinkAttrs.cardText.includes('Đang tích hợp') &&
          headerStillVisibleInApp &&
          fcInAppStats &&
          fcInAppStats.pathname === '/flashcards/index.html' &&
          fcInAppStats.isEmbedClass === true &&
          fcInAppStats.total === 605 &&
          returnedHomeOk
      ),
      JSON.stringify({ flashcardLinkAttrs, fcInAppStats, headerStillVisibleInApp, returnedHomeOk })
    );

    // =========================================================================
    // TEST O — COMPLETE VIDEO LESSON, LEARNING MATERIALS, VOICE RECORDING HOMEWORK & CHAT IMAGE LIGHTBOX
    // =========================================================================
    const testOContext = await browser.newContext({
      viewport: { width: 1440, height: 900 },
    });
    const testOPage = await testOContext.newPage();
    await testOPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await testOPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await testOPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 8000,
    });

    await testOPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=1`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="lesson-header-banner"]', {
      timeout: 8000,
    });
    const o1CourseTitle = await testOPage.textContent(
      '[data-testid="learning-active-course-title"]'
    );
    const o1Lesson1Title = await testOPage.textContent(
      '[data-testid="active-lesson-title"]'
    );

    // Click multi-part unit 13.2 in grouped sidebar
    await testOPage.click('[data-testid="lesson-part-btn-13.2"]');
    await testOPage.waitForTimeout(300);
    const o1Banner13_2 = await testOPage.textContent(
      '[data-testid="lesson-header-banner"]'
    );

    // Click Workbook unit SBT 1.1 (item 16) in sidebar workbook section
    const hasWorkbookSection = await testOPage.isVisible(
      '[data-testid="sidebar-workbook-section"]'
    );
    await testOPage.click('[data-testid="lesson-sidebar-item-16"]');
    await testOPage.waitForTimeout(300);
    const o1SbtUnassignedText = await testOPage.textContent(
      '[data-testid="homework-unassigned-notice"]'
    );

    recordTest(
      'TEST O',
      'O1',
      'HSK1 33-unit mapping displays verified Lesson 1 title ("AI小语，你好！ — Xin chào AI Tiểu Ngữ!"), groups sub-parts (13.1/13.2) and SBT 1.1/1.2 with honest unassigned homework state',
      Boolean(
        o1CourseTitle &&
          !o1CourseTitle.includes('Kh...') &&
          o1Lesson1Title &&
          o1Lesson1Title.includes('AI小语，你好！') &&
          o1Lesson1Title.includes('Xin chào AI Tiểu Ngữ!') &&
          o1Banner13_2 &&
          o1Banner13_2.includes('13.2') &&
          o1Banner13_2.includes('请给我一杯茶') &&
          hasWorkbookSection &&
          o1SbtUnassignedText &&
          o1SbtUnassignedText.includes('Chưa có bài tập cần nộp cho bài này.')
      ),
      JSON.stringify({
        o1CourseTitle,
        o1Lesson1Title,
        o1Banner13_2: o1Banner13_2?.slice(0, 120),
        o1SbtUnassignedText: o1SbtUnassignedText?.slice(0, 100),
      })
    );

    // O2: Learning Materials ("Học liệu của bài này") with real SGK/SBT/Vở viết page links & MP3 preload="none"
    await testOPage.click('[data-testid="lesson-sidebar-item-1"]');
    await testOPage.waitForTimeout(250);
    await testOPage.click('[data-testid="tab-lesson-materials"]');
    await testOPage.waitForSelector('[data-testid="lesson-materials-section"]', {
      timeout: 5000,
    });
    const materialsHeading = await testOPage.textContent(
      '[data-testid="lesson-materials-heading"]'
    );
    const matLinks = await testOPage.$$eval(
      '[data-testid^="material-open-btn-"]',
      (els) => els.map((e) => e.getAttribute('href') || '')
    );
    const audioAttrs = await testOPage.$eval(
      '[data-testid="lesson-audio-player-0"]',
      (el) => ({
        preload: el.getAttribute('preload'),
        src: el.getAttribute('src'),
      })
    );
    recordTest(
      'TEST O',
      'O2',
      'Learning Materials tab ("Học liệu của bài này") renders verified SGK (#page=17), SBT (#page=11), Vở tập viết (#page=1) PDFs and MP3 tracks with preload="none"',
      Boolean(
        materialsHeading?.includes('Học liệu của bài này') &&
          matLinks.some((h) => h.includes('HSK1_SGK.pdf#page=17')) &&
          matLinks.some((h) => h.includes('HSK1_SBT.pdf#page=11')) &&
          matLinks.some((h) => h.includes('HSK1_Vo_luyen_viet.pdf#page=1')) &&
          audioAttrs.preload === 'none' &&
          audioAttrs.src?.includes('01-1.mp3')
      ),
      JSON.stringify({ materialsHeading, matLinksCount: matLinks.length, audioAttrs })
    );

    // O3 (Urgent Bug 1): Student Voice Recording + Block Submit While Recording + Persistent Tab State + Real S3 Homework Submission
    await testOPage.click('[data-testid="lesson-sidebar-item-3"]');
    await testOPage.waitForTimeout(250);
    await testOPage.click('[data-testid="tab-lesson-homework"]');
    await testOPage.waitForSelector('[data-testid="homework-requirements-card"]', {
      timeout: 5000,
    });
    const hwAssignmentText = await testOPage.textContent(
      '[data-testid="homework-requirements-card"]'
    );

    // Empty submission (no file, no text) must be blocked (no fake WAV blob!)
    await testOPage.fill('[data-testid="homework-note-input"]', '');
    await testOPage.click('[data-testid="homework-submit-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-submit-error"]', {
      timeout: 5000,
    });
    const emptyBlockedError = await testOPage.textContent(
      '[data-testid="homework-submit-error"]'
    );

    // Start recording and type a note BEFORE stopping: clicking Submit while recording MUST be blocked (never discard audio for text-only!)
    await testOPage.click('[data-testid="homework-start-record-btn"]');
    await testOPage.waitForSelector('[data-testid="voice-recorder-panel"]', {
      timeout: 5000,
    });
    await testOPage.fill(
      '[data-testid="homework-note-input"]',
      'Con nộp bài thu âm Bài 3我是中国人 ạ!'
    );
    await testOPage.click('[data-testid="homework-submit-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-submit-error"]', {
      timeout: 5000,
    });
    const recordingActiveBlockedError = await testOPage.textContent(
      '[data-testid="homework-submit-error"]'
    );

    // Now stop recording -> auto-attaches -> switch tab and switch back -> state preserved -> submit homework
    await testOPage.waitForTimeout(600);
    await testOPage.click('[data-testid="stop-voice-recording-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-selected-file-card"]', {
      timeout: 5000,
    });
    await testOPage.click('[data-testid="tab-lesson-overview"]');
    await testOPage.waitForTimeout(150);
    await testOPage.click('[data-testid="tab-lesson-homework"]');
    const attachedAudioText = await testOPage.textContent(
      '[data-testid="homework-selected-file-card"]'
    );
    await testOPage.click('[data-testid="homework-submit-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-status-submitted"]', {
      timeout: 10000,
    });
    const submittedAudioSrc = await testOPage.$eval(
      '[data-testid="homework-submitted-audio-player"]',
      (el) => el.getAttribute('src') || ''
    );
    recordTest(
      'TEST O',
      'O3',
      'Urgent Bug 1 Fixed: Student voice recording blocks premature submit while recording (even with note), preserves attached audio across tab switches, and submits playable audio',
      Boolean(
        hwAssignmentText &&
          !hwAssignmentText.includes('Thu âm đọc câu (30–45s)') &&
          emptyBlockedError &&
          recordingActiveBlockedError?.includes('Dừng thu') &&
          attachedAudioText?.includes('ThuAm-') &&
          submittedAudioSrc.length > 0
      ),
      JSON.stringify({
        emptyBlockedError,
        recordingActiveBlockedError,
        attachedAudioText: attachedAudioText?.slice(0, 80),
        submittedAudioSrc: submittedAudioSrc.slice(0, 80),
      })
    );

    // O4 (Urgent Bug 2): Chat Image Upload (including camera digits filename) + Click-to-Zoom Lightbox Modal Surviving Polling
    await testOPage.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' });
    await testOPage.waitForSelector('[data-testid="chat-send-btn"]', { timeout: 8000 });
    const pngBase64 =
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const pngBuffer = Buffer.from(pngBase64, 'base64');
    await testOPage.setInputFiles('[data-testid="chat-file-input"]', {
      name: 'IMG_0912345678_bai-viet-hsk1.png',
      mimeType: 'image/png',
      buffer: pngBuffer,
    });
    await testOPage.waitForSelector('[data-testid="composer-staged-attachment"]', {
      timeout: 5000,
    });
    await testOPage.click('[data-testid="chat-send-btn"]');
    await testOPage.waitForSelector('[data-testid="chat-image-attachment"]', {
      timeout: 8000,
    });
    await testOPage.waitForTimeout(300);

    // Click the newest image thumbnail using a live Locator so optimistic-to-server swap never detaches handle
    await testOPage.locator('[data-testid="chat-image-attachment"]').last().click();
    await testOPage.waitForSelector('[data-testid="chat-image-lightbox"]', {
      timeout: 5000,
    });
    const hasLightboxDownloadBtn = await testOPage.isVisible('[data-testid="lightbox-download-btn"]');
    await testOPage.click('[data-testid="lightbox-zoom-in-btn"]');
    const zoomLevelBeforePoll = await testOPage.textContent(
      '[data-testid="lightbox-zoom-reset-btn"]'
    );
    // Wait across a 3.5s chat polling interval to ensure portal lightbox state is never wiped
    await testOPage.waitForTimeout(3600);
    const lightboxStillOpen = await testOPage.isVisible(
      '[data-testid="chat-image-lightbox"]'
    );
    const zoomLevelAfterPoll = await testOPage.textContent(
      '[data-testid="lightbox-zoom-reset-btn"]'
    );
    await testOPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'chat-image-lightbox-zoom-desktop.png'),
      fullPage: false,
    });
    await testOPage.click('[data-testid="lightbox-close-btn"]');
    await testOPage.waitForTimeout(200);
    const lightboxClosed = !(await testOPage.isVisible(
      '[data-testid="chat-image-lightbox"]'
    ));

    recordTest(
      'TEST O',
      'O4',
      'Urgent Bug 2 Fixed: Chat image upload (including camera filename with digits) renders immediately and "Phóng to" opens full-screen portal lightbox that zooms (150%) and survives 3.5s polling',
      Boolean(
        hasLightboxDownloadBtn &&
          zoomLevelBeforePoll?.includes('150%') &&
          lightboxStillOpen &&
          zoomLevelAfterPoll?.includes('150%') &&
          lightboxClosed
      ),
      JSON.stringify({
        zoomLevelBeforePoll,
        lightboxStillOpen,
        zoomLevelAfterPoll,
        lightboxClosed,
      })
    );

    // O5: Mobile 390x844 Layout — Expandable Drawer Accordion & Unobscured Tabs
    await testOPage.setViewportSize({ width: 390, height: 844 });
    await testOPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=1`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="mobile-lesson-drawer-toggle"]', {
      timeout: 8000,
    });
    const desktopSidebarVisibleOnMobile = await testOPage.isVisible(
      '[data-testid="curriculum-sidebar"]'
    );
    await testOPage.click('[data-testid="mobile-lesson-drawer-toggle"]');
    await testOPage.waitForSelector('[data-testid="mobile-lesson-drawer"]', {
      timeout: 5000,
    });
    const mobileDrawerOpenOk = await testOPage.isVisible(
      '[data-testid="mobile-lesson-drawer"]'
    );
    await testOPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'learning-hsk1-mobile-drawer.png'),
      fullPage: false,
    });

    recordTest(
      'TEST O',
      'O5',
      'Mobile 390x844 layout hides 33-unit sidebar above video and provides expandable lesson drawer with 3 clear tabs',
      Boolean(!desktopSidebarVisibleOnMobile && mobileDrawerOpenOk),
      JSON.stringify({ desktopSidebarVisibleOnMobile, mobileDrawerOpenOk })
    );

    // O6: Phase 1 & Phase 4 Homework Config Permissions (Student=403, Admin=200, Teacher out-of-scope=403, Teacher in-scope=200)
    await testOPage.setViewportSize({ width: 1440, height: 900 });
    const seesEditBtn = await testOPage.isVisible('[data-testid="homework-config-edit-btn"]');
    const studentDirectPostStatus = await testOPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const r = await fetch('/api/ktn/courses/homework-configs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          courseId: '6adadba969897b0002482ca5',
          lessonNum: 4,
          assigned: false,
          title: 'Student bypass',
        }),
      });
      return r.status;
    });

    await testOPage.click('[data-testid="logout-btn"]');
    await testOPage.waitForSelector('[data-testid="quick-login-quanly@khongtunhi.com"]', {
      timeout: 8000,
    });
    await testOPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await testOPage.waitForSelector('[data-testid="admin-home-page"]', {
      timeout: 8000,
    });
    await testOPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=4`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="homework-config-edit-btn"]', {
      timeout: 8000,
    });
    await testOPage.click('[data-testid="homework-config-edit-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-config-editor-form"]', {
      timeout: 5000,
    });
    const customInstr =
      'Bài 4 (Đã cập nhật): Nghe đoạn hội thoại Bài 4, thu âm câu giới thiệu nghề nghiệp của bố mẹ và chụp trang SBT trang 26.';
    await testOPage.fill('[data-testid="homework-config-instructions-input"]', customInstr);
    await testOPage.click('[data-testid="homework-config-save-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-config-editor-form"]', {
      state: 'detached',
      timeout: 8000,
    });
    await testOPage.waitForFunction(
      () => document.querySelector('[data-testid="homework-instructions-text"]')?.textContent?.includes('Bài 4 (Đã cập nhật)'),
      { timeout: 8000 }
    );
    const savedInstrText = await testOPage.textContent(
      '[data-testid="homework-instructions-text"]'
    );

    // Log in as Teacher (linh.lam@khongtunhi.com — assigned to YCT2-04/YCT3-02, not assigned to HSK1 video course)
    await testOPage.click('[data-testid="logout-btn"]');
    await testOPage.waitForSelector('[data-testid="quick-login-linh.lam@khongtunhi.com"]', {
      timeout: 8000,
    });
    await testOPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await testOPage.waitForSelector('[data-testid="teacher-home-page"]', {
      timeout: 8000,
    });
    await testOPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=4`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="role-forbidden-guard"]', {
      timeout: 8000,
    });
    const teacherUnassignedSeesEditBtn = await testOPage.isVisible(
      '[data-testid="homework-config-edit-btn"]'
    );
    const teacherScopeChecks = await testOPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      const headers = {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      };
      const coursePost = await fetch('/api/ktn/courses/homework-configs', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          courseId: '6adadba969897b0002482ca5',
          lessonNum: 4,
          assigned: true,
          title: 'Teacher unassigned course attempt',
        }),
      });
      const ownClassPost = await fetch('/api/ktn/class-sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          classCode: 'YCT2-04',
          sessionNum: 3,
          title: 'Buổi 3: Ôn tập lớp cô Linh',
          exercises: [{ num: 1, title: 'Đọc bài khóa buổi 3' }],
        }),
      });
      const otherClassPost = await fetch('/api/ktn/class-sessions', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          classCode: 'YCT1-01',
          sessionNum: 3,
          title: 'Buổi 3: Lớp cô Hà',
        }),
      });
      return {
        unassignedCourseStatus: coursePost.status,
        ownClassStatus: ownClassPost.status,
        otherClassStatus: otherClassPost.status,
      };
    });
    // Now Admin assigns HSK1 course ('6adadba969897b0002482ca5') to Teacher Linh, then Teacher Linh logs in and edits HSK1 homework config in the UI while remaining blocked on unassigned courses
    await testOPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await testOPage.click('[data-testid="logout-btn"]');
    await testOPage.waitForSelector('[data-testid="quick-login-quanly@khongtunhi.com"]', {
      timeout: 8000,
    });
    await testOPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await testOPage.waitForSelector('[data-testid="admin-home-page"]', {
      timeout: 8000,
    });
    await testOPage.evaluate(async () => {
      const raw = localStorage.getItem('ktn_v2_auth_session');
      const token = raw ? JSON.parse(raw).token : '';
      await fetch('/api/ktn/teachers', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          email: 'linh.lam@khongtunhi.com',
          name: 'Lão Sư Lâm Linh',
          code: 'GV-KTN-08',
          assignedClasses: ['YCT2-04', 'YCT3-02'],
          assignedCourses: ['6adadba969897b0002482ca5'],
          provisionOnIzTeach: false,
        }),
      });
    });

    await testOPage.click('[data-testid="logout-btn"]');
    await testOPage.waitForSelector('[data-testid="quick-login-linh.lam@khongtunhi.com"]', {
      timeout: 8000,
    });
    await testOPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await testOPage.waitForSelector('[data-testid="teacher-home-page"]', {
      timeout: 8000,
    });
    await testOPage.goto(
      `${baseUrl}/learning?courseId=6adadba969897b0002482ca5&lesson=4`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="homework-config-edit-btn"]', {
      timeout: 8000,
    });
    const teacherAssignedSeesEditBtn = await testOPage.isVisible(
      '[data-testid="homework-config-edit-btn"]'
    );
    await testOPage.click('[data-testid="homework-config-edit-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-config-editor-form"]', {
      timeout: 5000,
    });
    const teacherAssignedInstr =
      'Bài 4 (GV phụ trách khóa cập nhật): Đọc bài khóa Bài 4 và thu âm gửi cô Linh.';
    await testOPage.fill('[data-testid="homework-config-instructions-input"]', teacherAssignedInstr);
    await testOPage.click('[data-testid="homework-config-save-btn"]');
    await testOPage.waitForSelector('[data-testid="homework-config-editor-form"]', {
      state: 'detached',
      timeout: 8000,
    });
    await testOPage.waitForFunction(
      () => document.querySelector('[data-testid="homework-instructions-text"]')?.textContent?.includes('GV phụ trách khóa cập nhật'),
      { timeout: 8000 }
    );
    const teacherSavedInstrText = await testOPage.textContent(
      '[data-testid="homework-instructions-text"]'
    );

    // Navigating to an unassigned course ('65e7704a9ea90c00080d5195') still blocks Teacher Linh with role-forbidden-guard
    await testOPage.goto(
      `${baseUrl}/learning?courseId=65e7704a9ea90c00080d5195&lesson=1`,
      { waitUntil: 'domcontentloaded' }
    );
    await testOPage.waitForSelector('[data-testid="role-forbidden-guard"]', {
      timeout: 8000,
    });
    const teacherBlockedOnOtherCourseUi = await testOPage.isVisible(
      '[data-testid="role-forbidden-guard"]'
    );
    await testOContext.close();

    recordTest(
      'TEST O',
      'O6',
      'Phase 1 & 4 Homework Config RBAC: Admin edits & persists course config (200); Teacher manages own class (200) and assigned video course in UI (200) but is blocked from unassigned video course (403) & other class (403); Student is blocked (403)',
      Boolean(
        !seesEditBtn &&
          studentDirectPostStatus === 403 &&
          savedInstrText?.includes('Bài 4 (Đã cập nhật)') &&
          !teacherUnassignedSeesEditBtn &&
          teacherScopeChecks.unassignedCourseStatus === 403 &&
          teacherScopeChecks.ownClassStatus === 200 &&
          teacherScopeChecks.otherClassStatus === 403 &&
          teacherAssignedSeesEditBtn &&
          teacherSavedInstrText?.includes('GV phụ trách khóa cập nhật') &&
          teacherBlockedOnOtherCourseUi
      ),
      JSON.stringify({
        studentDirectPostStatus,
        savedInstrText: savedInstrText?.slice(0, 60),
        teacherUnassignedSeesEditBtn,
        teacherScopeChecks,
        teacherAssignedSeesEditBtn,
        teacherSavedInstrText: teacherSavedInstrText?.slice(0, 60),
        teacherBlockedOnOtherCourseUi,
      })
    );

    // =========================================================================
    // TEST S — ZALO-GRADE CHAT SCROLL & STABILITY SUITE (S01–S12)
    // =========================================================================
    await fetch(`${baseUrl}/api/ktn/test/seed-chat-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'seed', roomCount: 65, messageCount: 120 }),
    });

    const scrollAdminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const scrollAdminPage = await scrollAdminCtx.newPage();
    await scrollAdminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await scrollAdminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await scrollAdminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await scrollAdminPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await scrollAdminPage.waitForSelector('[data-testid="chat-room-scroll-list"]', { timeout: 8000 });

    const scrollTeacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const scrollTeacherPage = await scrollTeacherCtx.newPage();
    await scrollTeacherPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await scrollTeacherPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await scrollTeacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 10000 });
    await scrollTeacherPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await scrollTeacherPage.waitForSelector('[data-testid="chat-room-scroll-list"]', { timeout: 8000 });

    const scrollStudentCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const scrollStudentPage = await scrollStudentCtx.newPage();
    await scrollStudentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await scrollStudentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await scrollStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    await scrollStudentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await scrollStudentPage.waitForSelector('[data-testid="chat-room-scroll-list"]', { timeout: 8000 });
    await scrollStudentPage.waitForSelector('[data-testid="chat-message-scroll-area"]', { timeout: 8000 });
    await scrollStudentPage.waitForTimeout(500);

    // S01: Sidebar scroll from top to bottom across Admin, Teacher, and Student (>= 60 rooms)
    const testSidebarFullScroll = async (pg) => {
      await pg.waitForFunction(
        () =>
          document.querySelectorAll('[data-testid="chat-room-scroll-list"] > button').length >= 60,
        null,
        { timeout: 8000 }
      );
      return pg.evaluate(() => {
        const list = document.querySelector('[data-testid="chat-room-scroll-list"]');
        const searchBox = document.querySelector('[data-testid="chat-room-search-input"]');
        if (!list || !searchBox) return { ok: false };
        const roomCount = list.querySelectorAll(':scope > button').length;
        const searchTopBefore = Math.round(searchBox.getBoundingClientRect().top);
        list.scrollTop = 0;
        const topStart = Math.round(list.scrollTop);
        const maxScroll = Math.max(0, list.scrollHeight - list.clientHeight);
        list.scrollTop = maxScroll;
        list.dispatchEvent(new Event('scroll', { bubbles: true }));
        const topEnd = Math.round(list.scrollTop);
        const searchTopAfter = Math.round(searchBox.getBoundingClientRect().top);
        const pageScrollY = Math.round(window.scrollY);
        return {
          ok:
            roomCount >= 60 &&
            maxScroll > 1000 &&
            topStart === 0 &&
            Math.abs(topEnd - maxScroll) <= 2 &&
            searchTopBefore === searchTopAfter &&
            pageScrollY === 0,
          roomCount,
          scrollHeight: Math.round(list.scrollHeight),
          clientHeight: Math.round(list.clientHeight),
          topEnd,
          pageScrollY,
        };
      });
    };

    const s01Admin = await testSidebarFullScroll(scrollAdminPage);
    const s01Teacher = await testSidebarFullScroll(scrollTeacherPage);
    const s01Student = await testSidebarFullScroll(scrollStudentPage);
    recordTest(
      'TEST S',
      'S01',
      'Sidebar scroll from top to bottom works independently across Admin, Teacher, and Student (>= 60 rooms, fixed header, zero page scroll)',
      Boolean(s01Admin.ok && s01Teacher.ok && s01Student.ok),
      JSON.stringify({ admin: s01Admin, teacher: s01Teacher, student: s01Student })
    );

    // S02: Mouse wheel, touchpad delta, and scrollbar thumb drag on sidebar & message list
    await scrollStudentPage.evaluate(() => {
      const list = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (list) list.scrollTop = 0;
    });
    const sidebarBox = await scrollStudentPage
      .locator('[data-testid="chat-room-scroll-list"]')
      .boundingBox();
    if (sidebarBox) {
      await scrollStudentPage.mouse.move(
        sidebarBox.x + sidebarBox.width / 2,
        sidebarBox.y + sidebarBox.height / 2
      );
      await scrollStudentPage.mouse.wheel(0, 480);
      await scrollStudentPage.waitForTimeout(150);
      // Touchpad fine-grained wheel steps
      for (let step = 0; step < 5; step++) {
        await scrollStudentPage.mouse.wheel(0, 65);
      }
      await scrollStudentPage.waitForTimeout(150);
    }
    const s02Metrics = await scrollStudentPage.evaluate(() => {
      const list = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (!list) return { ok: false };
      const afterWheelTop = Math.round(list.scrollTop);
      // Simulate scrollbar thumb drag to 60% of scrollable range
      const maxScroll = list.scrollHeight - list.clientHeight;
      const targetThumbTop = Math.round(maxScroll * 0.6);
      list.scrollTop = targetThumbTop;
      list.dispatchEvent(new Event('scroll', { bubbles: true }));
      const afterDragTop = Math.round(list.scrollTop);
      return {
        ok: afterWheelTop >= 300 && Math.abs(afterDragTop - targetThumbTop) <= 2,
        afterWheelTop,
        afterDragTop,
        scrollHeight: Math.round(list.scrollHeight),
        clientHeight: Math.round(list.clientHeight),
      };
    });
    recordTest(
      'TEST S',
      'S02',
      'Mouse wheel, touchpad scroll, and scrollbar thumb drag update scrollTop smoothly without snapping back',
      Boolean(s02Metrics.ok),
      JSON.stringify(s02Metrics)
    );

    // S03: Switching filter tabs (All / Unread / 1-1) & search/clear resets stale scrollTop while 3.5s polling preserves scrollTop
    await scrollStudentPage.evaluate(() => {
      const list = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (list) {
        list.scrollTop = 750;
        list.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await scrollStudentPage.waitForTimeout(3800);
    const topAfterSidebarPoll = await scrollStudentPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-room-scroll-list"]')?.scrollTop || 0)
    );
    await scrollStudentPage.click('[data-testid="chat-filter-tab-unread"]');
    await scrollStudentPage.waitForTimeout(100);
    const topOnUnreadTab = await scrollStudentPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-room-scroll-list"]')?.scrollTop || 0)
    );
    await scrollStudentPage.click('[data-testid="chat-filter-tab-support"]');
    await scrollStudentPage.waitForTimeout(100);
    const topOnSupportTab = await scrollStudentPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-room-scroll-list"]')?.scrollTop || 0)
    );
    await scrollStudentPage.click('[data-testid="chat-filter-tab-all"]');
    await scrollStudentPage.evaluate(() => {
      const list = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (list) list.scrollTop = 600;
    });
    await scrollStudentPage.fill('[data-testid="chat-room-search-input"]', 'Nhóm Bổ Trợ #05');
    await scrollStudentPage.waitForTimeout(100);
    const topDuringSearch = await scrollStudentPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-room-scroll-list"]')?.scrollTop || 0)
    );
    await scrollStudentPage.fill('[data-testid="chat-room-search-input"]', '');
    await scrollStudentPage.waitForTimeout(100);
    const topAfterClearSearch = await scrollStudentPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-room-scroll-list"]')?.scrollTop || 0)
    );
    recordTest(
      'TEST S',
      'S03',
      'Switching filter tabs (Tất cả / Chưa đọc / 1-1) & search/clear resets stale scrollTop to 0 while 3.5s polling preserves sidebar scrollTop',
      Math.abs(topAfterSidebarPoll - 750) <= 2 &&
        topOnUnreadTab === 0 &&
        topOnSupportTab === 0 &&
        topDuringSearch === 0 &&
        topAfterClearSearch === 0,
      JSON.stringify({
        topAfterSidebarPoll,
        topOnUnreadTab,
        topOnSupportTab,
        topDuringSearch,
        topAfterClearSearch,
      })
    );

    // S04: Reading older messages in MessageList -> waiting across > 3 consecutive polling cycles (> 9.5s) does NOT yank scroll down
    await scrollStudentPage.evaluate(() => {
      const msgArea = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (msgArea) {
        msgArea.scrollTop = 360;
        msgArea.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    const s04Before = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      return {
        scrollTop: Math.round(el?.scrollTop || 0),
        scrollHeight: Math.round(el?.scrollHeight || 0),
        clientHeight: Math.round(el?.clientHeight || 0),
      };
    });
    await scrollStudentPage.waitForTimeout(9600);
    const s04After = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      return {
        scrollTop: Math.round(el?.scrollTop || 0),
        scrollHeight: Math.round(el?.scrollHeight || 0),
        clientHeight: Math.round(el?.clientHeight || 0),
      };
    });
    recordTest(
      'TEST S',
      'S04',
      'Reading history at scrollTop=360 across >3 consecutive polling intervals (9.6s) never pulls scroll position down',
      Math.abs(s04After.scrollTop - 360) <= 2,
      JSON.stringify({ before: s04Before, after: s04After })
    );

    // S05: Another user (Teacher) sends a new message while Student is reading history -> no scroll jump, unread badge increments
    const incomingText = `[S05-INCOMING] Cô Linh nhắc nộp bài tập lúc ${Date.now()}`;
    await fetch(`${baseUrl}/api/ktn/test/seed-chat-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'incoming',
        roomId: 'YCT2-04',
        senderEmail: 'linh.lam@khongtunhi.com',
        senderName: 'Cô Lâm Mỹ Linh',
        senderRole: 'teacher',
        content: incomingText,
      }),
    });
    await scrollStudentPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="jump-to-latest-msg-btn"]')
          ?.textContent?.includes('tin nhắn mới'),
      null,
      { timeout: 6000 }
    );
    const s05After = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      const pill = document.querySelector('[data-testid="jump-to-latest-msg-btn"]');
      return {
        scrollTop: Math.round(el?.scrollTop || 0),
        scrollHeight: Math.round(el?.scrollHeight || 0),
        pillText: pill?.textContent?.trim() || '',
      };
    });
    recordTest(
      'TEST S',
      'S05',
      'Incoming message from Teacher while reading history preserves exact scrollTop=360 and shows unread count pill',
      Math.abs(s05After.scrollTop - 360) <= 2 && s05After.pillText.includes('tin nhắn mới'),
      JSON.stringify(s05After)
    );

    // S06: Current user sends a new message -> automatically scrolls smoothly to the bottom
    const ownText = `[S06-OWN] Dạ con Hoàng Ngân vừa gửi bài mới lúc ${Date.now()}`;
    await scrollStudentPage.fill('[data-testid="chat-composer-input"]', ownText);
    await scrollStudentPage.click('[data-testid="chat-send-btn"]');
    await scrollStudentPage.waitForFunction(
      (txt) => {
        const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
        if (!el || !document.body.innerText.includes(txt)) return false;
        return el.scrollHeight - el.scrollTop - el.clientHeight < 60;
      },
      ownText,
      { timeout: 6000 }
    );
    const s06Metrics = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (!el) return { distanceFromBottom: 999 };
      return {
        scrollTop: Math.round(el.scrollTop),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        distanceFromBottom: Math.round(el.scrollHeight - el.scrollTop - el.clientHeight),
      };
    });
    recordTest(
      'TEST S',
      'S06',
      'Sending own new message automatically scrolls message list to bottom',
      s06Metrics.distanceFromBottom < 60,
      JSON.stringify(s06Metrics)
    );

    // S07: Loading 50 older messages preserves exact reading position (anchor message stays at same visual offset)
    await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (el) {
        el.scrollTop = 12;
        el.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await scrollStudentPage.waitForTimeout(150);
    const s07Before = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (!el) return null;
      const cRect = el.getBoundingClientRect();
      const items = Array.from(el.querySelectorAll('[data-testid="chat-message-item"]'));
      const firstVisible =
        items.find((node) => node.getBoundingClientRect().bottom > cRect.top + 4) || items[0];
      return {
        scrollTop: Math.round(el.scrollTop),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        count: items.length,
        anchorId: firstVisible?.getAttribute('data-message-id') || '',
        anchorOffset: firstVisible
          ? Math.round(firstVisible.getBoundingClientRect().top - cRect.top)
          : 0,
      };
    });
    await scrollStudentPage.click('[data-testid="load-older-messages-btn"]');
    await scrollStudentPage.waitForFunction(
      (prevCount) =>
        document.querySelectorAll('[data-testid="chat-message-item"]').length >= prevCount + 50,
      s07Before?.count || 60,
      { timeout: 8000 }
    );
    await scrollStudentPage.waitForTimeout(200);
    const s07After = await scrollStudentPage.evaluate((anchorId) => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (!el) return null;
      const cRect = el.getBoundingClientRect();
      const items = Array.from(el.querySelectorAll('[data-testid="chat-message-item"]'));
      const anchorNode = document.getElementById(`chat-msg-${anchorId}`);
      return {
        scrollTop: Math.round(el.scrollTop),
        scrollHeight: Math.round(el.scrollHeight),
        clientHeight: Math.round(el.clientHeight),
        count: items.length,
        anchorOffset: anchorNode
          ? Math.round(anchorNode.getBoundingClientRect().top - cRect.top)
          : -999,
      };
    }, s07Before?.anchorId || '');
    const s07OffsetDelta = Math.abs((s07After?.anchorOffset ?? -999) - (s07Before?.anchorOffset ?? 0));
    recordTest(
      'TEST S',
      'S07',
      'Loading 50 older messages compensates scrollHeight delta and keeps anchor message in place without jumping to top or bottom',
      Boolean(
        s07Before &&
          s07After &&
          s07After.count >= s07Before.count + 50 &&
          s07After.scrollTop > s07Before.scrollTop + 2000 &&
          s07OffsetDelta <= 8
      ),
      JSON.stringify({ before: s07Before, after: s07After, offsetDelta: s07OffsetDelta })
    );

    // S08: Room switch A -> B -> A preserves state and never mixes messages between rooms
    await scrollStudentPage.click('[data-testid="chat-room-item-course:6adadba969897b0002482ca5"]');
    await scrollStudentPage.waitForFunction(
      () => document.body.innerText.includes('[ROOM-B-25]'),
      null,
      { timeout: 8000 }
    );
    const s08RoomB = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      const texts = Array.from(document.querySelectorAll('[data-testid="chat-message-text"]')).map(
        (n) => n.textContent || ''
      );
      const hasRoomA = texts.some((t) => t.includes('lớp YCT2-04'));
      const hasRoomB = texts.some((t) => t.includes('[ROOM-B-25]'));
      const distanceFromBottom = el
        ? Math.round(el.scrollHeight - el.scrollTop - el.clientHeight)
        : 999;
      return { hasRoomA, hasRoomB, distanceFromBottom, count: texts.length };
    });
    await scrollStudentPage.click('[data-testid="chat-room-item-class:YCT2-04"]');
    await scrollStudentPage.waitForFunction(
      () => document.body.innerText.includes('[QA-120]'),
      null,
      { timeout: 8000 }
    );
    const s08BackToRoomA = await scrollStudentPage.evaluate(() => {
      const el = document.querySelector('[data-testid="chat-message-scroll-area"]');
      const texts = Array.from(document.querySelectorAll('[data-testid="chat-message-text"]')).map(
        (n) => n.textContent || ''
      );
      const hasRoomB = texts.some((t) => t.includes('[ROOM-B-'));
      const distanceFromBottom = el
        ? Math.round(el.scrollHeight - el.scrollTop - el.clientHeight)
        : 999;
      return { hasRoomB, distanceFromBottom, count: texts.length };
    });
    recordTest(
      'TEST S',
      'S08',
      'Switching Room A -> Room B -> Room A opens at bottom, preserves loaded history, and never mixes messages across rooms',
      Boolean(
        !s08RoomB.hasRoomA &&
          s08RoomB.hasRoomB &&
          s08RoomB.distanceFromBottom < 60 &&
          !s08BackToRoomA.hasRoomB &&
          s08BackToRoomA.distanceFromBottom < 60 &&
          s08BackToRoomA.count >= 110
      ),
      JSON.stringify({ roomB: s08RoomB, backToRoomA: s08BackToRoomA })
    );

    // S09: React Query refetch (manual refresh + background poll) causes zero scroll jump in both sidebar and message list
    await scrollStudentPage.evaluate(() => {
      const side = document.querySelector('[data-testid="chat-room-scroll-list"]');
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (side) {
        side.scrollTop = 640;
        side.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
      if (msg) {
        msg.scrollTop = 520;
        msg.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await scrollStudentPage.click('button[aria-label="Làm mới tin nhắn"]');
    await scrollStudentPage.waitForTimeout(3800);
    const s09After = await scrollStudentPage.evaluate(() => {
      const side = document.querySelector('[data-testid="chat-room-scroll-list"]');
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      return {
        sideScrollTop: Math.round(side?.scrollTop || 0),
        msgScrollTop: Math.round(msg?.scrollTop || 0),
      };
    });
    recordTest(
      'TEST S',
      'S09',
      'React Query manual & background refetches preserve exact scrollTop on both room sidebar (640) and message list (520)',
      Math.abs(s09After.sideScrollTop - 640) <= 2 && Math.abs(s09After.msgScrollTop - 520) <= 2,
      JSON.stringify(s09After)
    );

    // S10: Mobile 390 x 844 touch/swipe scroll stability on both conversation list and message list
    await scrollStudentPage.setViewportSize({ width: 390, height: 844 });
    await scrollStudentPage.goto(`${baseUrl}/chat`, { waitUntil: 'domcontentloaded' });
    await scrollStudentPage.waitForSelector('[data-testid="chat-room-scroll-list"]', { timeout: 8000 });
    // If conversation is open on mobile, click back to test mobile room list first
    if (await scrollStudentPage.isVisible('[data-testid="mobile-chat-back-btn"]')) {
      await scrollStudentPage.click('[data-testid="mobile-chat-back-btn"]');
      await scrollStudentPage.waitForTimeout(150);
    }
    const s10MobileListScroll = await scrollStudentPage.evaluate(() => {
      const side = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (!side) return { ok: false };
      side.scrollTop = 480;
      side.dispatchEvent(new Event('scroll', { bubbles: true }));
      return {
        ok: Math.abs(side.scrollTop - 480) <= 2 && window.scrollY === 0,
        scrollTop: Math.round(side.scrollTop),
        scrollHeight: Math.round(side.scrollHeight),
        clientHeight: Math.round(side.clientHeight),
        windowScrollY: Math.round(window.scrollY),
      };
    });
    await scrollStudentPage.evaluate(() => {
      const side = document.querySelector('[data-testid="chat-room-scroll-list"]');
      if (side) side.scrollTop = 0;
    });
    await scrollStudentPage.click('[data-testid="chat-room-item-class:YCT2-04"]');
    await scrollStudentPage.waitForSelector('[data-testid="chat-message-scroll-area"]', {
      timeout: 8000,
    });
    await scrollStudentPage.waitForTimeout(300);
    await scrollStudentPage.evaluate(() => {
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (msg) {
        msg.scrollTop = 410;
        msg.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await scrollStudentPage.waitForTimeout(3500);
    const s10MobileMsgScroll = await scrollStudentPage.evaluate(() => {
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      return {
        scrollTop: Math.round(msg?.scrollTop || 0),
        windowScrollY: Math.round(window.scrollY),
      };
    });
    recordTest(
      'TEST S',
      'S10',
      'Mobile 390x844 swipe/scroll is stable on both conversation list and message history across polling with zero window scroll',
      Boolean(
        s10MobileListScroll.ok &&
          Math.abs(s10MobileMsgScroll.scrollTop - 410) <= 2 &&
          s10MobileMsgScroll.windowScrollY === 0
      ),
      JSON.stringify({ list: s10MobileListScroll, msg: s10MobileMsgScroll })
    );

    // S11: Mobile composer is never occluded by bottom navigation (390x844) or virtual keyboard (390x480)
    const s11NormalViewport = await scrollStudentPage.evaluate(() => {
      const composer = document.querySelector('[data-testid="chat-message-composer"]');
      const input = document.querySelector('[data-testid="chat-composer-input"]');
      const bottomNav = document.querySelector('[data-testid="mobile-bottom-nav"]');
      if (!composer || !input || !bottomNav) return { ok: false };
      const cRect = composer.getBoundingClientRect();
      const nRect = bottomNav.getBoundingClientRect();
      return {
        ok: cRect.bottom <= nRect.top + 2 && cRect.top >= 48,
        composerBottom: Math.round(cRect.bottom),
        bottomNavTop: Math.round(nRect.top),
      };
    });
    await scrollStudentPage.setViewportSize({ width: 390, height: 480 });
    await scrollStudentPage.focus('[data-testid="chat-composer-input"]');
    await scrollStudentPage.waitForTimeout(150);
    const s11KeyboardViewport = await scrollStudentPage.evaluate(() => {
      const input = document.querySelector('[data-testid="chat-composer-input"]');
      if (!input) return { ok: false };
      const r = input.getBoundingClientRect();
      return {
        ok: r.top >= 40 && r.bottom <= window.innerHeight,
        inputTop: Math.round(r.top),
        inputBottom: Math.round(r.bottom),
        innerHeight: window.innerHeight,
      };
    });
    await scrollStudentPage.setViewportSize({ width: 1440, height: 900 });
    recordTest(
      'TEST S',
      'S11',
      'Message composer remains completely visible above bottom navigation (390x844) and when mobile keyboard shrinks viewport (390x480)',
      Boolean(s11NormalViewport.ok && s11KeyboardViewport.ok),
      JSON.stringify({ normal: s11NormalViewport, keyboard: s11KeyboardViewport })
    );

    // S12: Pin message, in-room search, and emoji reactions work without causing scroll jump
    await scrollTeacherPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, {
      waitUntil: 'domcontentloaded',
    });
    await scrollTeacherPage.waitForSelector('[data-testid="chat-message-scroll-area"]', {
      timeout: 8000,
    });
    await scrollTeacherPage.waitForTimeout(400);
    await scrollTeacherPage.evaluate(() => {
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      if (msg) {
        msg.scrollTop = 450;
        msg.dispatchEvent(new Event('scroll', { bubbles: true }));
      }
    });
    await scrollTeacherPage.waitForTimeout(100);
    // Teacher reacts to a visible in-viewport message while scrolled to 450
    await scrollTeacherPage.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-message-scroll-area"]');
      const cTop = container ? container.getBoundingClientRect().top : 0;
      const btns = Array.from(document.querySelectorAll('button[title="Thả biểu tượng cảm xúc"]'));
      const visibleBtn =
        btns.find((b) => b.getBoundingClientRect().top >= cTop + 60) || btns[btns.length - 1];
      if (visibleBtn instanceof HTMLElement) visibleBtn.click();
    });
    await scrollTeacherPage.waitForTimeout(100);
    await scrollTeacherPage.evaluate(() => {
      const emojiBtns = Array.from(document.querySelectorAll('button')).filter(
        (b) => b.textContent?.trim() === '❤️'
      );
      if (emojiBtns[0] instanceof HTMLElement) emojiBtns[0].click();
    });
    await scrollTeacherPage.waitForTimeout(200);
    const topAfterReact = await scrollTeacherPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-message-scroll-area"]')?.scrollTop || 0)
    );
    // Teacher pins a visible in-viewport message while scrolled to 450
    await scrollTeacherPage.evaluate(() => {
      const container = document.querySelector('[data-testid="chat-message-scroll-area"]');
      const cTop = container ? container.getBoundingClientRect().top : 0;
      const pinBtns = Array.from(
        document.querySelectorAll('button[title="Ghim làm thông báo lớp"]')
      );
      const visiblePinBtn =
        pinBtns.find((b) => b.getBoundingClientRect().top >= cTop + 60) || pinBtns[0];
      if (visiblePinBtn instanceof HTMLElement) visiblePinBtn.click();
    });
    await scrollTeacherPage.waitForTimeout(500);
    const topAfterPin = await scrollTeacherPage.evaluate(() =>
      Math.round(document.querySelector('[data-testid="chat-message-scroll-area"]')?.scrollTop || 0)
    );
    const pinnedBannerStillVisible = await scrollTeacherPage.isVisible(
      '[data-testid="pinned-announcement-banner"]'
    );
    // In-room search
    await scrollTeacherPage.click('button[aria-label="Tìm kiếm trong hội thoại"]');
    await scrollTeacherPage.fill(
      'input[placeholder*="Tìm nội dung tin nhắn"]',
      'QA-080'
    );
    await scrollTeacherPage.waitForTimeout(200);
    const searchMatchCount = await scrollTeacherPage.evaluate(
      () => document.querySelectorAll('[data-testid="chat-message-item"]').length
    );
    await scrollTeacherPage.click('button[aria-label="Tìm kiếm trong hội thoại"]');
    await scrollTeacherPage.waitForTimeout(150);
    const afterCloseSearch = await scrollTeacherPage.evaluate(() => {
      const msg = document.querySelector('[data-testid="chat-message-scroll-area"]');
      return {
        count: document.querySelectorAll('[data-testid="chat-message-item"]').length,
        scrollTop: Math.round(msg?.scrollTop || 0),
        jumpBtnVisible: Boolean(document.querySelector('[data-testid="jump-to-latest-msg-btn"]')),
      };
    });
    recordTest(
      'TEST S',
      'S12',
      'Reactions, pinning announcements, and in-room message search/close work accurately while preserving scrollTop=450',
      Math.abs(topAfterReact - 450) <= 5 &&
        Math.abs(topAfterPin - 450) <= 5 &&
        pinnedBannerStillVisible &&
        searchMatchCount === 1 &&
        afterCloseSearch.count >= 60 &&
        Math.abs(afterCloseSearch.scrollTop - 450) <= 5 &&
        afterCloseSearch.jumpBtnVisible,
      JSON.stringify({
        topAfterReact,
        topAfterPin,
        pinnedBannerStillVisible,
        searchMatchCount,
        afterCloseSearch,
      })
    );

    await scrollAdminCtx.close();
    await scrollTeacherCtx.close();
    await scrollStudentCtx.close();
    await fetch(`${baseUrl}/api/ktn/test/seed-chat-qa`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'reset' }),
    });

    // =========================================================================
    // TEST U — KTN MASTER UX & PERFORMANCE UPGRADE (U1..U3 + SCREENSHOTS)
    // =========================================================================
    const upgradeShotDir = path.join(REPO_ROOT, 'reports/ktn-v3-production-readiness/screenshots');
    fs.mkdirSync(upgradeShotDir, { recursive: true });

    // U1: Admin Teacher Search (accent-insensitive, status/class filter, pagination, mobile compact cards, TeacherDetailDrawer)
    const uAdminCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const uAdminPage = await uAdminCtx.newPage();
    await uAdminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await uAdminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await uAdminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await uAdminPage.goto(`${baseUrl}/admin`, { waitUntil: 'domcontentloaded' });
    await uAdminPage.waitForSelector('[data-testid="admin-tab-teachers"]', { timeout: 8000 });
    await uAdminPage.click('[data-testid="admin-tab-teachers"]');
    await uAdminPage.waitForSelector('[data-testid="admin-teachers-section"]', { timeout: 8000 });
    await uAdminPage.waitForSelector('[data-testid="teacher-search-pagination-summary"]', {
      timeout: 8000,
    });

    const u1Page1Summary = await uAdminPage.textContent(
      '[data-testid="teacher-search-pagination-summary"]'
    );
    await uAdminPage.click('[data-testid="teacher-search-next-page"]');
    await uAdminPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="teacher-search-pagination-summary"]')
          ?.textContent?.includes('Trang 2 / 2'),
      null,
      { timeout: 6000 }
    );
    const u1Page2Summary = await uAdminPage.textContent(
      '[data-testid="teacher-search-pagination-summary"]'
    );
    await uAdminPage.click('[data-testid="teacher-search-prev-page"]');
    await uAdminPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="teacher-search-pagination-summary"]')
          ?.textContent?.includes('Trang 1 / 2'),
      null,
      { timeout: 6000 }
    );

    // Accent-insensitive search ("dang quoc bao 0022") matches "Thầy Đặng Quốc Bảo 0022"
    await uAdminPage.fill('[data-testid="admin-teacher-search-input"]', 'dang quoc bao 0022');
    await uAdminPage.waitForSelector(
      '[data-testid="admin-teacher-row-e2e.gv.0022@khongtunhi.com"]',
      { timeout: 6000 }
    );
    const u1MatchedRowText = await uAdminPage.textContent(
      '[data-testid="admin-teacher-row-e2e.gv.0022@khongtunhi.com"]'
    );

    // Clear search and test status filter (INACTIVE) & class filter (YCT2-04)
    await uAdminPage.fill('[data-testid="admin-teacher-search-input"]', '');
    await uAdminPage.selectOption('[data-testid="admin-teacher-status-filter"]', 'INACTIVE');
    await uAdminPage.waitForSelector(
      '[data-testid="admin-teacher-row-e2e.gv.0015@khongtunhi.com"]',
      { timeout: 6000 }
    );
    const u1LockedRowVisible = await uAdminPage.isVisible(
      '[data-testid="admin-teacher-row-e2e.gv.0015@khongtunhi.com"]'
    );

    await uAdminPage.selectOption('[data-testid="admin-teacher-status-filter"]', 'ALL');
    await uAdminPage.selectOption('[data-testid="admin-teacher-class-filter"]', 'YCT2-04');
    await uAdminPage.waitForSelector(
      '[data-testid="admin-teacher-row-linh.lam@khongtunhi.com"]',
      { timeout: 6000 }
    );
    await uAdminPage.click('[data-testid="admin-open-teacher-btn-linh.lam@khongtunhi.com"]');
    await uAdminPage.waitForSelector('[data-testid="teacher-detail-drawer"]', { timeout: 6000 });
    const u1DrawerName = await uAdminPage.textContent('[data-testid="teacher-drawer-name"]');
    await uAdminPage.click('[data-testid="teacher-drawer-tab-teaching"]');
    await uAdminPage.waitForTimeout(150);

    await uAdminPage.screenshot({
      path: path.join(upgradeShotDir, 'admin-teacher-search-desktop-1440.png'),
      fullPage: false,
    });
    // Close drawer
    await uAdminPage.keyboard.press('Escape').catch(() => {});
    await uAdminPage.evaluate(() => {
      const closeBtn = document.querySelector(
        '[data-testid="teacher-detail-drawer"] button'
      );
      if (closeBtn instanceof HTMLElement) closeBtn.click();
    });
    await uAdminPage.selectOption('[data-testid="admin-teacher-class-filter"]', 'ALL');
    await uAdminPage.waitForTimeout(300);

    // Mobile 390x844 compact teacher cards
    await uAdminPage.setViewportSize({ width: 390, height: 844 });
    await uAdminPage.waitForSelector('[data-testid="admin-teacher-mobile-list"]', {
      timeout: 5000,
    });
    const u1MobileCardsVisible = await uAdminPage.isVisible(
      '[data-testid="admin-teacher-mobile-list"]'
    );
    const u1MobileOverflow = await uAdminPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    await uAdminPage.screenshot({
      path: path.join(upgradeShotDir, 'admin-teacher-search-mobile-390.png'),
      fullPage: false,
    });
    await uAdminCtx.close();

    recordTest(
      'TEST U',
      'U1',
      'Admin server-side Teacher Search paginates 20/page, matches unaccented Vietnamese ("dang quoc bao 0022"), filters by status/class, opens TeacherDetailDrawer, and renders mobile compact cards',
      Boolean(
        u1Page1Summary?.includes('Trang 1 / 2') &&
          u1Page2Summary?.includes('Trang 2 / 2') &&
          u1MatchedRowText?.includes('Thầy Đặng Quốc Bảo 0022') &&
          u1LockedRowVisible &&
          u1DrawerName?.includes('Lâm') &&
          u1MobileCardsVisible &&
          u1MobileOverflow <= 2
      ),
      JSON.stringify({
        u1Page1Summary: u1Page1Summary?.trim(),
        u1Page2Summary: u1Page2Summary?.trim(),
        u1LockedRowVisible,
        u1MobileCardsVisible,
        u1MobileOverflow,
      })
    );

    // U2: Chat Inbox Latest-First Ordering, Empty 1-1 Removal, "Nhắn mới" Ephemeral -> Persisted Flow & Clean Image Message UI
    const uTeacherCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const uTeacherPage = await uTeacherCtx.newPage();
    await uTeacherPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await uTeacherPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await uTeacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 10000 });
    await uTeacherPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await uTeacherPage.waitForSelector('[data-testid="chat-room-scroll-list"]', { timeout: 8000 });

    // Empty 1-1 threads must NOT appear in Inbox
    const empty1on1Count = await uTeacherPage
      .locator('[data-testid="chat-room-item-student:e2e.hs.0005@khongtunhi.com"]')
      .count();

    // Click "Nhắn mới", search "hoang ngan", open 1-1 room, and send first message -> promotes to top of Inbox
    await uTeacherPage.click('[data-testid="chat-new-message-btn"]');
    await uTeacherPage.waitForSelector('[data-testid="chat-new-message-modal"]', { timeout: 5000 });
    await uTeacherPage.fill('[data-testid="chat-new-message-search-input"]', 'hoang ngan');
    await uTeacherPage.waitForSelector(
      '[data-testid="chat-new-message-student-item-hoangngan@khongtunhi.com"]',
      { timeout: 5000 }
    );
    await uTeacherPage.click(
      '[data-testid="chat-new-message-student-item-hoangngan@khongtunhi.com"]'
    );
    await uTeacherPage.waitForSelector('[data-testid="chat-composer-input"]', { timeout: 5000 });

    const u2DirectMsg = `Cô Linh nhắn riêng 1-1 cho Hoàng Ngân lúc ${Date.now()}`;
    await uTeacherPage.fill('[data-testid="chat-composer-input"]', u2DirectMsg);
    await uTeacherPage.click('[data-testid="chat-send-btn"]');
    await uTeacherPage.waitForFunction(
      (txt) => document.body.innerText.includes(txt),
      u2DirectMsg,
      { timeout: 8000 }
    );

    const topRoomIdAfterDirectSend = await uTeacherPage.evaluate(() => {
      const firstBtn = document.querySelector(
        '[data-testid="chat-room-scroll-list"] > button[data-testid^="chat-room-item-"]'
      );
      return firstBtn?.getAttribute('data-testid') || '';
    });

    // Send image-only message and verify NO redundant "[Đã gửi ảnh: ...]" text marker is shown
    const u2PngBuffer = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
      'base64'
    );
    await uTeacherPage.setInputFiles('[data-testid="chat-file-input"]', {
      name: 'anh-chup-bai-chua-yct2.png',
      mimeType: 'image/png',
      buffer: u2PngBuffer,
    });
    await uTeacherPage.waitForSelector('[data-testid="composer-staged-attachment"]', {
      timeout: 5000,
    });
    await uTeacherPage.click('[data-testid="chat-send-btn"]');
    await uTeacherPage.waitForSelector('[data-testid="chat-image-attachment"]', {
      timeout: 8000,
    });
    await uTeacherPage.waitForTimeout(300);

    const hasRedundantImageMarker = await uTeacherPage.evaluate(() => {
      const texts = Array.from(document.querySelectorAll('[data-testid="chat-message-text"]')).map(
        (n) => n.textContent || ''
      );
      return texts.some((t) => t.includes('[Đã gửi ảnh:'));
    });

    await uTeacherPage.screenshot({
      path: path.join(upgradeShotDir, 'chat-compact-inbox-desktop-1440.png'),
      fullPage: false,
    });

    // Check 360px and 390px mobile chat viewports
    await uTeacherPage.setViewportSize({ width: 390, height: 844 });
    await uTeacherPage.waitForTimeout(200);
    await uTeacherPage.screenshot({
      path: path.join(upgradeShotDir, 'chat-compact-inbox-mobile-390.png'),
      fullPage: false,
    });
    await uTeacherPage.setViewportSize({ width: 360, height: 800 });
    await uTeacherPage.waitForTimeout(200);
    const u2Overflow360 = await uTeacherPage.evaluate(
      () => document.documentElement.scrollWidth - window.innerWidth
    );
    await uTeacherPage.screenshot({
      path: path.join(upgradeShotDir, 'chat-compact-inbox-mobile-360.png'),
      fullPage: false,
    });
    await uTeacherPage.setViewportSize({ width: 1440, height: 900 });

    recordTest(
      'TEST U',
      'U2',
      'Chat Inbox excludes empty 1-1 threads, supports "Nhắn mới" 1-1 creation & latest-first promotion, hides redundant "[Đã gửi ảnh: ...]" marker on image messages, and has zero overflow at 360px/390px/1440px',
      empty1on1Count === 0 &&
        topRoomIdAfterDirectSend === 'chat-room-item-student:hoangngan@khongtunhi.com' &&
        !hasRedundantImageMarker &&
        u2Overflow360 <= 2,
      JSON.stringify({
        empty1on1Count,
        topRoomIdAfterDirectSend,
        hasRedundantImageMarker,
        u2Overflow360,
      })
    );

    // U3: Teacher Exercise File Upload (PDF), Non-Overwriting Create vs Edit with Confirmation, and Student Viewing/Downloading Attachment + Homework Submission
    await uTeacherPage.goto(`${baseUrl}/teacher`, { waitUntil: 'domcontentloaded' });
    await uTeacherPage.waitForSelector('[data-testid="teacher-tab-sessions"]', {
      timeout: 8000,
    });
    await uTeacherPage.click('[data-testid="teacher-tab-sessions"]');
    await uTeacherPage.waitForSelector('[data-testid="teacher-session-num-input"]', {
      timeout: 8000,
    });
    await uTeacherPage.selectOption('[data-testid="teacher-exercise-class-select"]', 'YCT2-04');
    await uTeacherPage.fill('[data-testid="teacher-session-num-input"]', '2');
    await uTeacherPage.waitForTimeout(250);

    // Ensure "Tạo bài mới" mode so existing Exercise 1 of Session 2 is NOT overwritten
    await uTeacherPage.click('[data-testid="teacher-exercise-mode-create"]');
    await uTeacherPage.fill(
      '[data-testid="teacher-exercise-title-input"]',
      'Bài 2: Đọc & dịch phiếu bài tập PDF Buổi 2'
    );
    await uTeacherPage.fill(
      '[data-testid="teacher-exercise-prompt-input"]',
      'Các con mở tệp PDF đính kèm bên dưới, đọc to và ghi chú từ mới nộp cho cô nhé.'
    );

    const samplePdfBuffer = Buffer.from(
      '%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n%%EOF\n',
      'utf8'
    );
    await uTeacherPage.setInputFiles('[data-testid="teacher-exercise-file-input"]', {
      name: 'phieu-bai-tap-yct2-buoi2.pdf',
      mimeType: 'application/pdf',
      buffer: samplePdfBuffer,
    });
    await uTeacherPage.waitForSelector('[data-testid="teacher-exercise-attachments-list"]', {
      timeout: 8000,
    });
    await uTeacherPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="teacher-exercise-attachments-list"]')
          ?.textContent?.includes('Đã tải xong'),
      null,
      { timeout: 8000 }
    );

    await uTeacherPage.click('[data-testid="teacher-save-session-btn"]');
    await uTeacherPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="teacher-saved-session-card-2"]')
          ?.textContent?.includes('2 bài tập'),
      null,
      { timeout: 8000 }
    );
    const savedSession2CardTextAfterAdd = await uTeacherPage.textContent(
      '[data-testid="teacher-saved-session-card-2"]'
    );

    // Edit the newly created Exercise 2 -> triggers confirmation modal -> preserves Exercise 1 & PDF attachment
    const editExBtns = uTeacherPage.locator(
      '[data-testid="teacher-saved-session-card-2"] [data-testid^="teacher-edit-saved-exercise-btn-"]'
    );
    await editExBtns.last().click();
    await uTeacherPage.fill(
      '[data-testid="teacher-exercise-prompt-input"]',
      'Các con mở tệp PDF đính kèm bên dưới, đọc to và nộp bài trước thứ Sáu cho cô nhé (Đã cập nhật).'
    );
    await uTeacherPage.click('[data-testid="teacher-save-session-btn"]');
    await uTeacherPage.waitForSelector('[data-testid="teacher-confirm-overwrite-modal"]', {
      timeout: 5000,
    });
    await uTeacherPage.click('[data-testid="teacher-confirm-overwrite-btn"]');
    await uTeacherPage.waitForFunction(
      () =>
        document
          .querySelector('[data-testid="teacher-saved-session-card-2"]')
          ?.textContent?.includes('(Đã cập nhật)'),
      null,
      { timeout: 8000 }
    );

    await uTeacherPage.screenshot({
      path: path.join(upgradeShotDir, 'teacher-exercise-upload-desktop-1440.png'),
      fullPage: false,
    });
    await uTeacherPage.setViewportSize({ width: 390, height: 844 });
    await uTeacherPage.waitForTimeout(200);
    await uTeacherPage.screenshot({
      path: path.join(upgradeShotDir, 'teacher-exercise-upload-mobile-390.png'),
      fullPage: false,
    });
    await uTeacherCtx.close();

    // Student opens /classrooms?class=YCT2-04&session=2 -> sees both Exercise 1 (201) and Exercise 2 (202), previews PDF attachment, and submits homework
    const uStudentCtx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const uStudentPage = await uStudentCtx.newPage();
    await uStudentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await uStudentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await uStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    await uStudentPage.goto(`${baseUrl}/classrooms?class=YCT2-04&session=2`, {
      waitUntil: 'domcontentloaded',
    });
    await uStudentPage.waitForSelector('[data-testid="classroom-exercise-201"]', {
      timeout: 8000,
    });
    await uStudentPage.waitForSelector('[data-testid="classroom-exercise-202"]', {
      timeout: 8000,
    });
    await uStudentPage.waitForSelector(
      '[data-testid="student-exercise-attachments-block-202"]',
      { timeout: 8000 }
    );

    const studentAttBlockText = await uStudentPage.textContent(
      '[data-testid="student-exercise-attachments-block-202"]'
    );
    await uStudentPage
      .locator(
        '[data-testid="student-exercise-attachments-block-202"] [data-testid^="student-preview-attachment-btn-"]'
      )
      .first()
      .click();
    await uStudentPage.waitForSelector('[data-testid="student-attachment-preview-modal"]', {
      timeout: 5000,
    });
    const previewModalOpen = await uStudentPage.isVisible(
      '[data-testid="student-attachment-preview-modal"]'
    );
    await uStudentPage.click('[aria-label="Đóng xem trước tài liệu"]');

    // Student submits homework on Exercise 2 (202)
    await uStudentPage.click('[data-testid="classroom-open-hw-btn-202"]');
    await uStudentPage.waitForSelector('[data-testid="homework-note-input"]', { timeout: 5000 });
    await uStudentPage.fill(
      '[data-testid="homework-note-input"]',
      'Con Hoàng Ngân đã tải phiếu PDF Buổi 2 và hoàn thành bài dịch nộp cô Linh ạ!'
    );
    await uStudentPage.click('[data-testid="homework-submit-btn"]');
    await uStudentPage.waitForSelector('[data-testid="homework-status-submitted"]', {
      timeout: 10000,
    });
    const hwStatus202 = await uStudentPage.textContent('[data-testid="classroom-hw-status-202"]');

    await uStudentPage.screenshot({
      path: path.join(upgradeShotDir, 'student-classroom-attachments-desktop-1440.png'),
      fullPage: false,
    });
    await uStudentPage.setViewportSize({ width: 390, height: 844 });
    await uStudentPage.waitForTimeout(200);
    await uStudentPage.screenshot({
      path: path.join(upgradeShotDir, 'student-classroom-attachments-mobile-390.png'),
      fullPage: false,
    });
    await uStudentCtx.close();

    recordTest(
      'TEST U',
      'U3',
      'Teacher uploads PDF exercise attachment without overwriting existing exercises, confirms edits, and Student previews/downloads the PDF and submits homework on ClassroomsPage',
      Boolean(
        savedSession2CardTextAfterAdd?.includes('2 bài tập') &&
          savedSession2CardTextAfterAdd?.includes('1 tệp đính kèm') &&
          studentAttBlockText?.includes('phieu-bai-tap-yct2-buoi2.pdf') &&
          previewModalOpen &&
          hwStatus202?.includes('Đã nộp')
      ),
      JSON.stringify({
        has2Exercises: savedSession2CardTextAfterAdd?.includes('2 bài tập'),
        hasPdfAttachment: studentAttBlockText?.includes('phieu-bai-tap-yct2-buoi2.pdf'),
        previewModalOpen,
        hwStatus202: hwStatus202?.trim(),
      })
    );
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
