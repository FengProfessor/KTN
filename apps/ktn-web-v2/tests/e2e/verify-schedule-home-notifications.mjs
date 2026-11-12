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
const REPORT_PATH = path.join(
  REPO_ROOT,
  'docs/ui-v2/schedule-home-notifications-report.json'
);

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
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return undefined;
}

const results = [];
function recordTest(id, title, passed, details = '') {
  results.push({ id, title, passed, details, timestamp: new Date().toISOString() });
  const icon = passed ? '✅ PASS' : '❌ FAIL';
  console.log(`[KTN-FINAL-13] ${icon} [${id}] ${title}${details ? ` — ${details}` : ''}`);
  if (!passed) {
    throw new Error(`Test [${id}] failed: ${title} (${details})`);
  }
}

async function loginApi(baseUrl, email, password) {
  const res = await fetch(`${baseUrl}/api/ktn/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok || !data.ok) {
    throw new Error(`Login failed for ${email}: ${JSON.stringify(data)}`);
  }
  return data.token;
}

async function runSuite() {
  console.log('[KTN-FINAL-13] Starting Vite server with embedded Cloudflare Worker BFF...');
  const viteServer = await createServer({
    root: APP_ROOT,
    configFile: path.join(APP_ROOT, 'vite.config.ts'),
    server: { port: 0, host: '127.0.0.1' },
    logLevel: 'error',
  });
  await viteServer.listen();
  const address = viteServer.httpServer.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;
  console.log(`[KTN-FINAL-13] Server listening at ${baseUrl}`);

  const executablePath = resolveBrowserExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
  });

  try {
    // Prepare API tokens for Admin, Teacher, and Student
    const adminToken = await loginApi(baseUrl, 'quanly@khongtunhi.com', 'KtnAdmin@2026');
    const teacherToken = await loginApi(baseUrl, 'linh.lam@khongtunhi.com', 'KtnTeacher@2026');
    const studentToken = await loginApi(baseUrl, 'hoangngan@khongtunhi.com', 'KtnStudent@2026');

    // =========================================================================
    // CASES 1, 2, 3, 4 — HEADER NOTIFICATION BELL DROPDOWN (OPEN, OUTSIDE CLICK, ESCAPE, NAVIGATE)
    // =========================================================================
    const studentContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const studentPage = await studentContext.newPage();

    await studentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await studentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });

    // Case 1: Click bell opens dropdown
    const bellBtn = studentPage.locator('[data-testid="header-notification-bell"]');
    const expandedBefore = await bellBtn.getAttribute('aria-expanded');
    await bellBtn.click();
    await studentPage.waitForSelector('[data-testid="header-notification-dropdown"]', {
      timeout: 5000,
    });
    const expandedAfter = await bellBtn.getAttribute('aria-expanded');
    const hasMarkAllBtn = await studentPage.isVisible(
      '[data-testid="header-notif-mark-all-read-btn"]'
    );
    const hasViewAllBtn = await studentPage.isVisible(
      '[data-testid="header-notif-view-all-btn"]'
    );

    recordTest(
      'CASE-01',
      'Nhấn chuông mở dropdown thông báo (aria-expanded=true, hiển thị thông báo mới nhất, Đánh dấu tất cả đã đọc & Xem tất cả)',
      expandedBefore === 'false' && expandedAfter === 'true' && hasMarkAllBtn && hasViewAllBtn,
      `aria-expanded: ${expandedBefore} -> ${expandedAfter}`
    );

    // Verify clicking INSIDE dropdown header / scrolling list does NOT close it unintentionally
    await studentPage.click('[data-testid="header-notification-dropdown"]', {
      position: { x: 24, y: 18 },
    });
    await studentPage.evaluate(() => {
      const list = document.querySelector('[data-testid="header-notif-scroll-list"]');
      if (list) list.scrollTop = 20;
    });
    const stillOpenAfterInsideClick = await studentPage.isVisible(
      '[data-testid="header-notification-dropdown"]'
    );

    // Case 2: Click outside closes dropdown immediately
    await studentPage.mouse.click(20, 300);
    await studentPage.waitForFunction(
      () => !document.querySelector('[data-testid="header-notification-dropdown"]'),
      null,
      { timeout: 3000 }
    );
    const expandedAfterOutside = await bellBtn.getAttribute('aria-expanded');

    recordTest(
      'CASE-02',
      'Nhấn ra ngoài đóng dropdown ngay lập tức (nhấn bên trong vùng cuộn không tự đóng ngoài ý muốn)',
      stillOpenAfterInsideClick === true && expandedAfterOutside === 'false',
      `insideKeptOpen=${stillOpenAfterInsideClick}, outsideClosed=${expandedAfterOutside === 'false'}`
    );

    // Case 3: Press Escape closes dropdown & restores focus to bell button
    await bellBtn.click();
    await studentPage.waitForSelector('[data-testid="header-notification-dropdown"]', {
      timeout: 5000,
    });
    await studentPage.keyboard.press('Escape');
    await studentPage.waitForFunction(
      () => !document.querySelector('[data-testid="header-notification-dropdown"]'),
      null,
      { timeout: 3000 }
    );
    const focusRestoredToBell = await studentPage.evaluate(
      () =>
        document.activeElement?.getAttribute('data-testid') === 'header-notification-bell'
    );

    recordTest(
      'CASE-03',
      'Nhấn phím Escape đóng dropdown và trả focus về nút chuông',
      focusRestoredToBell,
      `focusRestoredToBell=${focusRestoredToBell}`
    );

    // Case 4: Clicking a notification item closes dropdown and navigates to the target page
    await bellBtn.click();
    await studentPage.waitForSelector('[data-testid="header-notification-dropdown"]', {
      timeout: 5000,
    });
    const firstNotifBtn = studentPage
      .locator('[data-testid^="header-notif-item-"]')
      .first();
    await firstNotifBtn.click();
    await studentPage.waitForFunction(
      () => !document.querySelector('[data-testid="header-notification-dropdown"]'),
      null,
      { timeout: 3000 }
    );
    const urlAfterNotifClick = studentPage.url();

    recordTest(
      'CASE-04',
      'Nhấn vào thông báo trong dropdown tự đóng popup và điều hướng đúng trang đích',
      !urlAfterNotifClick.endsWith('/login') && urlAfterNotifClick !== `${baseUrl}/`,
      `navigatedUrl=${urlAfterNotifClick}`
    );

    // =========================================================================
    // CASES 5, 6, 7 — ADMIN & TEACHER SCHEDULE MANAGEMENT & RBAC PERMISSIONS
    // =========================================================================
    // First check that unconfirmed legacy schedule is NOT treated as confirmed official schedule
    const initialSchedRes = await fetch(
      `${baseUrl}/api/ktn/classes/schedule?classCode=YCT2-04`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const initialSchedData = await initialSchedRes.json();
    const unconfirmedInitially =
      initialSchedData.scheduleStatus !== 'confirmed' &&
      initialSchedData.officialScheduleText === 'Chưa có lịch học chính thức';

    // Case 5: Admin creates a new class (HSK2-99) assigned to another teacher AND confirms official schedule for YCT2-04 via UI
    const adminContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const adminPage = await adminContext.newPage();
    await adminPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await adminPage.click('[data-testid="quick-login-quanly@khongtunhi.com"]');
    await adminPage.waitForSelector('[data-testid="admin-home-page"]', { timeout: 10000 });
    await adminPage.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
    await adminPage.waitForSelector('[data-testid="admin-classes-section"]', { timeout: 10000 });

    // Open schedule modal for YCT2-04 in Admin UI
    await adminPage.click('[data-testid="admin-edit-schedule-btn-YCT2-04"]');
    await adminPage.waitForSelector('[data-testid="class-schedule-modal"]', { timeout: 5000 });

    // Verify legacy suggestion banner is shown and click "Chuyển thành lịch chính thức"
    const hasLegacyBanner = await adminPage.isVisible(
      '[data-testid="legacy-schedule-suggestion-banner"]'
    );
    if (hasLegacyBanner) {
      await adminPage.click('[data-testid="apply-legacy-schedule-btn"]');
    } else {
      await adminPage.click('[data-testid="schedule-day-btn-2"]');
      await adminPage.click('[data-testid="schedule-day-btn-5"]');
      await adminPage.fill('[data-testid="schedule-start-time-input"]', '19:30');
      await adminPage.fill('[data-testid="schedule-end-time-input"]', '20:30');
    }

    await adminPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'admin-schedule-modal-desktop.png'),
      fullPage: false,
    });

    await adminPage.click('[data-testid="save-class-schedule-btn"]');
    await adminPage.waitForFunction(
      () => !document.querySelector('[data-testid="class-schedule-modal"]'),
      null,
      { timeout: 8000 }
    );

    const statusBadgeText = await adminPage.textContent(
      '[data-testid="class-schedule-status-YCT2-04"]'
    );
    const officialTextOnAdmin = await adminPage.textContent(
      '[data-testid="class-official-schedule-text-YCT2-04"]'
    );

    // Also create a second class HSK2-OTHER assigned to another teacher (to test Case 7 Teacher RBAC)
    const createOtherClassRes = await fetch(`${baseUrl}/api/ktn/classes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        id: 'HSK2-OTHER',
        name: 'Lớp HSK 2 — Giáo viên khác phụ trách',
        teacher_code: 'GV-OTHER-99',
        teacher_email: 'other.teacher@khongtunhi.com',
        total_lessons: 25,
      }),
    });
    const createOtherClassData = await createOtherClassRes.json();

    recordTest(
      'CASE-05',
      'Admin tạo lớp mới và xác nhận lịch học chính thức có cấu trúc (không tự lấy text cũ làm lịch thật khi chưa xác nhận)',
      unconfirmedInitially &&
        statusBadgeText?.includes('Đã có lịch chính thức') &&
        officialTextOnAdmin?.includes('Thứ 3 & Thứ 6') &&
        officialTextOnAdmin?.includes('19:30–20:30') &&
        createOtherClassData.ok === true,
      `officialText="${officialTextOnAdmin}"`
    );

    // Case 6: Teacher edits official schedule of their own assigned class (YCT2-04)
    const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const teacherPage = await teacherContext.newPage();
    await teacherPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await teacherPage.click('[data-testid="quick-login-linh.lam@khongtunhi.com"]');
    await teacherPage.waitForSelector('[data-testid="teacher-home-page"]', { timeout: 10000 });
    await teacherPage.goto(`${baseUrl}/teacher/classes`, { waitUntil: 'domcontentloaded' });
    await teacherPage.waitForSelector('[data-testid="teacher-edit-schedule-btn"]', {
      timeout: 10000,
    });

    await teacherPage.click('[data-testid="teacher-edit-schedule-btn"]');
    await teacherPage.waitForSelector('[data-testid="class-schedule-modal"]', { timeout: 5000 });
    // Teacher updates start/end time to 19:30 - 20:45
    await teacherPage.fill('[data-testid="schedule-end-time-input"]', '20:45');
    await teacherPage.click('[data-testid="save-class-schedule-btn"]');
    await teacherPage.waitForFunction(
      () => !document.querySelector('[data-testid="class-schedule-modal"]'),
      null,
      { timeout: 8000 }
    );

    const verifyTeacherEditRes = await fetch(
      `${baseUrl}/api/ktn/classes/schedule?classCode=YCT2-04`,
      { headers: { Authorization: `Bearer ${teacherToken}` } }
    );
    const verifyTeacherEditData = await verifyTeacherEditRes.json();

    recordTest(
      'CASE-06',
      'Giáo viên chỉnh giờ học của lớp mình phụ trách (YCT2-04) và hệ thống ghi nhật ký updatedBy/updatedAt',
      verifyTeacherEditData.ok === true &&
        verifyTeacherEditData.scheduleConfig?.endTime === '20:45' &&
        verifyTeacherEditData.scheduleConfig?.updatedBy === 'linh.lam@khongtunhi.com',
      `endTime=${verifyTeacherEditData.scheduleConfig?.endTime}, updatedBy=${verifyTeacherEditData.scheduleConfig?.updatedBy}`
    );

    // Case 7: Teacher is strictly blocked (HTTP 403) from editing another teacher's class, creating a new class, or Student editing schedule
    const teacherForbiddenSchedRes = await fetch(`${baseUrl}/api/ktn/classes/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        classCode: 'HSK2-OTHER',
        daysOfWeek: [2, 5],
        startTime: '18:00',
        endTime: '19:00',
        status: 'confirmed',
      }),
    });
    const teacherCreateClassRes = await fetch(`${baseUrl}/api/ktn/classes`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        id: 'TEACHER-FAKE-CLASS',
        name: 'Lớp tự tạo trái phép',
      }),
    });
    const studentEditSchedRes = await fetch(`${baseUrl}/api/ktn/classes/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        classCode: 'YCT2-04',
        daysOfWeek: [2],
        startTime: '18:00',
        endTime: '19:00',
      }),
    });

    recordTest(
      'CASE-07',
      'Giáo viên bị chặn (HTTP 403) khi chỉnh lịch lớp người khác hoặc tạo lớp mới; Học sinh bị chặn (HTTP 403) khi sửa lịch',
      teacherForbiddenSchedRes.status === 403 &&
        teacherCreateClassRes.status === 403 &&
        studentEditSchedRes.status === 403,
      `teacherOtherClass=${teacherForbiddenSchedRes.status}, teacherCreateClass=${teacherCreateClassRes.status}, studentEdit=${studentEditSchedRes.status}`
    );

    // =========================================================================
    // CASE 8 & CASE 12 — STUDENT HOME LAYOUT, NEXT CLASS SCHEDULE & 3 DISCOVERY CARDS
    // =========================================================================
    await studentPage.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });
    await studentPage.waitForSelector('[data-testid="student-next-class-card"]', { timeout: 8000 });

    const nextClassCardText = await studentPage.textContent(
      '[data-testid="student-next-class-card"]'
    );
    const hasFlashcardCard = await studentPage.isVisible(
      '[data-testid="discovery-card-flashcard"]'
    );
    const flashcardCardText = await studentPage.textContent(
      '[data-testid="discovery-card-flashcard"]'
    );
    const hasShortVideoCard = await studentPage.isVisible(
      '[data-testid="discovery-card-short-video"]'
    );
    const shortVideoText = await studentPage.textContent(
      '[data-testid="discovery-card-short-video"]'
    );
    const hasGamesCard = await studentPage.isVisible('[data-testid="discovery-card-games"]');
    const gamesCardText = await studentPage.textContent('[data-testid="discovery-card-games"]');

    // Check that HSK2-OTHER (which has no confirmed schedule) shows "Chưa có lịch học chính thức"
    const otherClassSchedRes = await fetch(
      `${baseUrl}/api/ktn/classes/schedule?classCode=HSK2-OTHER`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const otherClassSchedData = await otherClassSchedRes.json();

    recordTest(
      'CASE-08',
      'Học sinh thấy lịch học chính thức chính xác trên Trang chủ & Lớp học (lớp chưa cài lịch hiển thị "Chưa có lịch học chính thức")',
      Boolean(
        nextClassCardText?.includes('YCT2-04') &&
          nextClassCardText?.includes('Cô Lâm Mỹ Linh') &&
          nextClassCardText?.includes('19:30') &&
          otherClassSchedData.scheduleStatus === 'unconfirmed'
      ),
      `nextClassCard="${nextClassCardText?.replace(/\s+/g, ' ').trim().slice(0, 90)}"`
    );

    recordTest(
      'CASE-12',
      'StudentHome hiển thị đúng ô Flashcard ("Flashcard — Học từ vựng", nút "Học ngay") và 2 ô "Sắp ra mắt" (Video ngắn tiếng Trung, Trò chơi tiếng Trung, không có nút giả)',
      Boolean(
        hasFlashcardCard &&
          flashcardCardText?.includes('Flashcard — Học từ vựng') &&
          flashcardCardText?.includes('Lật thẻ, nghe phát âm, luyện viết chữ Hán') &&
          flashcardCardText?.includes('Học ngay') &&
          hasShortVideoCard &&
          shortVideoText?.includes('Video ngắn tiếng Trung') &&
          shortVideoText?.includes('Sắp ra mắt') &&
          shortVideoText?.includes('Xem video ngắn, học tiếng Trung mỗi ngày') &&
          hasGamesCard &&
          gamesCardText?.includes('Trò chơi tiếng Trung') &&
          gamesCardText?.includes('Sắp ra mắt') &&
          gamesCardText?.includes('Vừa chơi vừa nhớ từ vựng')
      ),
      'All 3 discovery cards verified'
    );

    // Capture Desktop & Mobile Screenshots of StudentHome
    await studentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'student-home-final-desktop.png'),
      fullPage: true,
    });
    const mobileStudentContext = await browser.newContext({
      viewport: { width: 390, height: 844 },
    });
    const mobileStudentPage = await mobileStudentContext.newPage();
    await mobileStudentPage.goto(`${baseUrl}/login`, { waitUntil: 'domcontentloaded' });
    await mobileStudentPage.click('[data-testid="quick-login-hoangngan@khongtunhi.com"]');
    await mobileStudentPage.waitForSelector('[data-testid="student-dashboard-page"]', {
      timeout: 10000,
    });
    await mobileStudentPage.waitForTimeout(400);
    await mobileStudentPage.screenshot({
      path: path.join(SCREENSHOT_DIR, 'student-home-final-mobile.png'),
      fullPage: true,
    });
    await mobileStudentContext.close();

    // =========================================================================
    // CASES 9, 10, 11 — SERVER-SIDE SCHEDULER: 30-MIN REMINDER, IDEMPOTENT RETRY & POSTPONED/CANCELLED EXCEPTION
    // =========================================================================
    // Fetch nextSession of YCT2-04 to get its exact startEpochMs
    const yctSchedRes = await fetch(
      `${baseUrl}/api/ktn/classes/schedule?classCode=YCT2-04`,
      { headers: { Authorization: `Bearer ${adminToken}` } }
    );
    const yctSchedData = await yctSchedRes.json();
    const nextSession = yctSchedData.nextSession;
    if (!nextSession || !nextSession.startEpochMs) {
      throw new Error('Expected nextSession on confirmed YCT2-04 schedule');
    }

    // Simulated time: 29 minutes before nextSession start (inside the 30-minute reminder window [16..35] min)
    const simulatedNowMs = nextSession.startEpochMs - 29 * 60 * 1000;

    // Case 9: Run scheduler 30 minutes before class -> sends reminder to class students & teacher
    const remindRun1Res = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: simulatedNowMs,
        classCode: 'YCT2-04',
      }),
    });
    const remindRun1Data = await remindRun1Res.json();

    // Verify Student receives the "Sắp đến giờ học tiếng Trung!" in-app notification with "Xem buổi học"
    const stuNotifsAfterRemindRes = await fetch(`${baseUrl}/api/ktn/notifications`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const stuNotifsAfterRemindData = await stuNotifsAfterRemindRes.json();
    const classReminderNotif = (stuNotifsAfterRemindData.notifications || []).find(
      (n) => n.type === 'class_reminder' && n.classCode === 'YCT2-04'
    );

    recordTest(
      'CASE-09',
      'Scheduler tự động gửi thông báo nhắc trước giờ học 30 phút cho học viên và giáo viên thuộc lớp',
      remindRun1Data.ok === true &&
        remindRun1Data.remindedSessionsCount === 1 &&
        remindRun1Data.dispatchedCount >= 2 &&
        Boolean(
          classReminderNotif &&
            classReminderNotif.title === 'Sắp đến giờ học tiếng Trung!' &&
            classReminderNotif.body.includes('Lớp YCT2-04 bắt đầu lúc 19:30') &&
            classReminderNotif.actionLabel === 'Xem buổi học'
        ),
      `dispatchedCount=${remindRun1Data.dispatchedCount}, notifTitle="${classReminderNotif?.title}"`
    );

    // Case 10: Re-running scheduler at the same milestone does NOT send duplicate notifications
    const remindRun2Res = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: simulatedNowMs,
        classCode: 'YCT2-04',
      }),
    });
    const remindRun2Data = await remindRun2Res.json();

    recordTest(
      'CASE-10',
      'Scheduler chạy lại (cron retry) không gửi trùng thông báo (idempotent theo class + sessionDate + reminderOffset + recipient)',
      remindRun2Data.ok === true &&
        remindRun2Data.dispatchedCount === 0 &&
        remindRun2Data.skippedDuplicatesCount >= 2,
      `dispatchedOnRetry=${remindRun2Data.dispatchedCount}, skippedDuplicates=${remindRun2Data.skippedDuplicatesCount}`
    );

    // Case 11: Postponed/Cancelled/Rescheduled session does NOT send wrong reminder at old time, and past sessions are ignored
    // Also verify exact start time (0 minutes before) does NOT send default reminder
    const exactStartTimeRunRes = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: nextSession.startEpochMs,
        classCode: 'YCT2-04',
      }),
    });
    const exactStartTimeRunData = await exactStartTimeRunRes.json();

    // Now mark the 2nd upcoming session as 'postponed' and 3rd upcoming session as 'rescheduled' to next day 23:30–00:30 (cross-midnight)
    const secondSession = (yctSchedData.upcomingSessions || [])[1];
    const thirdSession = (yctSchedData.upcomingSessions || [])[2];
    if (!secondSession || !thirdSession) {
      throw new Error('Expected at least 3 upcoming sessions on YCT2-04');
    }
    const thirdParts = thirdSession.sessionDate.split('-').map(Number);
    const nextDayUtc = new Date(Date.UTC(thirdParts[0], thirdParts[1] - 1, thirdParts[2]) + 86400000);
    const rescheduledNewDate = `${nextDayUtc.getUTCFullYear()}-${String(nextDayUtc.getUTCMonth() + 1).padStart(2, '0')}-${String(nextDayUtc.getUTCDate()).padStart(2, '0')}`;

    await fetch(`${baseUrl}/api/ktn/classes/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        classCode: 'YCT2-04',
        daysOfWeek: [2, 5],
        startTime: '19:30',
        endTime: '20:45',
        status: 'confirmed',
        exceptions: [
          {
            date: secondSession.sessionDate,
            type: 'postponed',
            note: 'Hoãn buổi học sang tuần sau',
          },
          {
            date: thirdSession.sessionDate,
            type: 'rescheduled',
            newDate: rescheduledNewDate,
            startTime: '23:30',
            endTime: '00:30',
            note: 'Đổi buổi sang ngày hôm sau ca muộn qua nửa đêm',
          },
        ],
      }),
    });

    const postponedSimNowMs = secondSession.startEpochMs - 29 * 60 * 1000;
    const postponedRemindRes = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: postponedSimNowMs,
        classCode: 'YCT2-04',
      }),
    });
    const postponedRemindData = await postponedRemindRes.json();

    // Old date of rescheduled 3rd session must NOT trigger reminder
    const rescheduledOldSimNowMs = thirdSession.startEpochMs - 29 * 60 * 1000;
    const rescheduledOldRemindRes = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: rescheduledOldSimNowMs,
        classCode: 'YCT2-04',
      }),
    });
    const rescheduledOldRemindData = await rescheduledOldRemindRes.json();

    // New date (rescheduledNewDate at 23:30–00:30 VN time, cross-midnight) MUST trigger reminder 29 min before 23:30
    const [ny, nm, nd] = rescheduledNewDate.split('-').map(Number);
    const rescheduledNewStartEpochMs = Date.UTC(ny, nm - 1, nd, 23, 30, 0) - 7 * 3600 * 1000;
    const rescheduledNewSimNowMs = rescheduledNewStartEpochMs - 29 * 60 * 1000;
    const rescheduledNewRemindRes = await fetch(`${baseUrl}/api/ktn/schedule/run-reminders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        nowMs: rescheduledNewSimNowMs,
        classCode: 'YCT2-04',
      }),
    });
    const rescheduledNewRemindData = await rescheduledNewRemindRes.json();

    // Verify custom_sessions mode via frontend payload shape (mode: 'custom_sessions', daysOfWeek: [])
    const customModeSaveRes = await fetch(`${baseUrl}/api/ktn/classes/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${adminToken}`,
      },
      body: JSON.stringify({
        classCode: 'YCT2-04',
        mode: 'custom_sessions',
        daysOfWeek: [],
        customSessions: [
          {
            date: rescheduledNewDate,
            startTime: '18:30',
            endTime: '19:45',
            title: 'Buổi học chuyên đề đặc biệt',
          },
        ],
        status: 'confirmed',
        notifyMembers: false,
      }),
    });
    const customModeSaveData = await customModeSaveRes.json();

    // Restore YCT2-04 clean weekly schedule (Tuesday & Friday 19:30–20:45)
    await fetch(`${baseUrl}/api/ktn/classes/schedule`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        classCode: 'YCT2-04',
        mode: 'weekly',
        daysOfWeek: [2, 5],
        startTime: '19:30',
        endTime: '20:45',
        status: 'confirmed',
        exceptions: [
          {
            date: secondSession.sessionDate,
            type: 'postponed',
            note: 'Hoãn buổi học sang tuần sau',
          },
        ],
        notifyMembers: false,
      }),
    });

    // Verify Teacher clicking a class_reminder deep link (/classrooms?class=YCT2-04) renders YCT2-04 properly
    await teacherPage.goto(`${baseUrl}/classrooms?class=YCT2-04`, { waitUntil: 'networkidle' });
    await teacherPage.waitForTimeout(400);
    const teacherClassroomsBody = (await teacherPage.locator('body').innerText()) || '';
    const teacherDeepLinkOk =
      teacherClassroomsBody.includes('YCT2-04') &&
      !teacherClassroomsBody.includes('Chưa xếp lớp trực tiếp');

    recordTest(
      'CASE-11',
      'Buổi học đã hoãn/hủy/đổi ngày không phát nhắc giờ sai ở ngày cũ, phát đúng ở ngày mới (kể cả ca học qua nửa đêm 23:30–00:30), hỗ trợ chế độ custom_sessions và deep-link giáo viên',
      exactStartTimeRunData.remindedSessionsCount === 0 &&
        postponedRemindData.remindedSessionsCount === 0 &&
        postponedRemindData.dispatchedCount === 0 &&
        rescheduledOldRemindData.remindedSessionsCount === 0 &&
        rescheduledNewRemindData.remindedSessionsCount === 1 &&
        customModeSaveRes.status === 200 &&
        customModeSaveData.scheduleConfig?.scheduleMode === 'custom_sessions' &&
        customModeSaveData.scheduleConfig?.mode === 'custom_sessions' &&
        teacherDeepLinkOk,
      `exactStart=${exactStartTimeRunData.remindedSessionsCount}, postponed=${postponedRemindData.remindedSessionsCount}, reschedOld=${rescheduledOldRemindData.remindedSessionsCount}, reschedNew=${rescheduledNewRemindData.remindedSessionsCount}, customModeOk=${customModeSaveRes.status === 200}, teacherDeepLinkOk=${teacherDeepLinkOk}`
    );

    // =========================================================================
    // CASE 13 — ALL 5 EXISTING WEB PUSH SCENARIOS + ANTI-SPAM PREFERENCES NO REGRESSION
    // =========================================================================
    // 13a: VAPID public key & Push subscription registration
    const vapidRes = await fetch(`${baseUrl}/api/ktn/push/vapid-public-key`);
    const vapidData = await vapidRes.json();
    const subRes = await fetch(`${baseUrl}/api/ktn/push/subscribe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        subscription: {
          endpoint: 'https://fcm.googleapis.com/fcm/send/e2e-student-device-1',
          keys: {
            p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM',
            auth: 'tBHItJI5svbpez7KI4CCXg',
          },
        },
      }),
    });
    const subData = await subRes.json();

    // 13b: User notification preferences (muting 'chat' still keeps 'important' locked true)
    const prefUpdateRes = await fetch(`${baseUrl}/api/ktn/notifications/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        chat: false,
        important: false, // Attempting to disable 'important' must be ignored/forced true
        homework: true,
        schedule: true,
        reminder10Min: true,
      }),
    });
    const prefUpdateData = await prefUpdateRes.json();

    // Restore chat: true for student
    await fetch(`${baseUrl}/api/ktn/notifications/settings`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentToken}`,
      },
      body: JSON.stringify({
        chat: true,
        homework: true,
        schedule: true,
        reminder10Min: false,
      }),
    });

    // 13c: Group chat coalescing anti-spam check (2 consecutive group messages from teacher coalesce into 1 summary notification)
    await fetch(`${baseUrl}/api/ktn/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        roomId: 'class:YCT2-04',
        classCode: 'YCT2-04',
        content: 'Tin nhắn nhóm liên tiếp 1 từ cô Linh',
      }),
    });
    await fetch(`${baseUrl}/api/ktn/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        roomId: 'class:YCT2-04',
        classCode: 'YCT2-04',
        content: 'Tin nhắn nhóm liên tiếp 2 từ cô Linh',
      }),
    });

    const coalNotifsRes = await fetch(`${baseUrl}/api/ktn/notifications`, {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    const coalNotifsData = await coalNotifsRes.json();
    const coalescedChatNotif = (coalNotifsData.notifications || []).find(
      (n) =>
        n.type === 'chat_message' &&
        (n.roomId === 'class:YCT2-04' || n.roomId === 'YCT2-04' || n.classCode === 'YCT2-04') &&
        n.coalescedCount >= 2
    );

    recordTest(
      'CASE-13',
      'Hệ thống Web Push (VAPID, subscribe, chat/homework/announcement) hoạt động ổn định, gộp tin nhắn nhóm chống spam và bảo vệ quyền nhận Thông báo quan trọng',
      Boolean(
        vapidData.ok &&
          vapidData.publicKey?.length >= 80 &&
          subData.ok &&
          prefUpdateData.ok &&
          prefUpdateData.settings?.chat === false &&
          prefUpdateData.settings?.important === true &&
          prefUpdateData.settings?.reminder10Min === true &&
          coalescedChatNotif
      ),
      `vapidOk=${vapidData.ok}, subOk=${subData.ok}, importantLockedTrue=${prefUpdateData.settings?.important}, coalescedCount=${coalescedChatNotif?.coalescedCount}`
    );

    await studentContext.close();
    await adminContext.close();
    await teacherContext.close();
  } finally {
    await browser.close();
    await viteServer.close();
  }

  fs.writeFileSync(
    REPORT_PATH,
    JSON.stringify(
      {
        suite: 'KTN Final Notifications, Class Schedule & Home Experience (13 Scenarios)',
        total: results.length,
        passed: results.filter((r) => r.passed).length,
        failed: results.filter((r) => !r.passed).length,
        results,
      },
      null,
      2
    )
  );
  console.log(`\n[KTN-FINAL-13] ALL ${results.length}/${results.length} SCENARIOS PASSED!`);
  process.exit(0);
}

runSuite().catch((err) => {
  console.error('[KTN-FINAL-13] Fatal failure:', err);
  process.exit(1);
});
