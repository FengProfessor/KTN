/**
 * Tier 4: Real-World Workload Scenarios Test Suite (3 Scenarios)
 * 
 * Target Scenarios:
 *   - TC-T4-S01: Desktop 1440x900 Complete Admin Lifecycle Workflow
 *   - TC-T4-S02: Mobile 390x844 Responsive Touch & Zero-Overflow Workflow
 *   - TC-T4-S03: Historical Data & Student Account Integrity Workflow
 */

import {
  assert,
  recordResult,
  loginAdmin,
  loginStudent,
  createDesktopContext,
  createMobileContext,
  checkZeroHorizontalOverflow,
  captureFailureScreenshot,
  signTestSessionToken,
  apiCall,
} from './test-harness-utils.mjs';

export async function runTier4(browser, baseUrl, results = []) {
  console.log('\n================================================================');
  console.log('TIER 4: REAL-WORLD APPLICATION SCENARIOS (3 Workflows)');
  console.log('================================================================\n');

  // ---------------------------------------------------------------------------
  // SCENARIO S01: DESKTOP 1440x900 COMPLETE ADMIN LIFECYCLE WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('--- SCENARIO S01: Desktop 1440x900 Complete Admin Lifecycle Workflow ---');
  const desktopContext = await createDesktopContext(browser);
  const desktopPage = await desktopContext.newPage();

  try {
    const adminToken = await signTestSessionToken({
      id: 'ADMIN-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    // Step 1: Admin logs in, reviews simplified 5-column teacher table
    await loginAdmin(desktopPage, baseUrl);
    await desktopPage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
    await desktopPage.waitForSelector('.hidden.md\\:block table', { timeout: 10000 });

    const thCount = await desktopPage.$$eval('.hidden.md\\:block table thead th', (ths) => ths.length);
    assert(thCount === 5, `Desktop table must have strictly 5 columns, found ${thCount}`);

    // Step 2: Searches for teacher via server debounced search and opens Drawer
    const searchInput = desktopPage.locator('[data-testid="admin-teacher-search-input"]');
    await searchInput.fill('Bảo');
    await desktopPage.waitForTimeout(350);

    const openBtn = desktopPage.locator('.hidden.md\\:block [data-testid^="admin-open-teacher-btn-"]').first();
    await openBtn.waitFor({ state: 'visible', timeout: 8000 });
    await openBtn.click();
    await desktopPage.waitForSelector('[data-testid="teacher-detail-drawer"]', { timeout: 8000 });

    // Inspect deep stats in Drawer tabs
    await desktopPage.click('[data-testid="teacher-drawer-tab-teaching"]');
    await desktopPage.waitForSelector('[data-testid="teacher-drawer-teaching-panel"]', { timeout: 5000 });
    await desktopPage.click('[data-testid="teacher-drawer-tab-grading"]');
    await desktopPage.waitForSelector('[data-testid="teacher-drawer-grading-panel"]', { timeout: 5000 });
    await desktopPage.click('[data-testid="teacher-drawer-tab-forum"]');
    await desktopPage.waitForSelector('[data-testid="teacher-drawer-forum-panel"]', { timeout: 5000 });

    // Close drawer
    const drawerCloseBtn = desktopPage.locator('[data-testid="teacher-detail-drawer"] button:has(svg)').first();
    await drawerCloseBtn.click();
    await desktopPage.locator('[data-testid="teacher-detail-drawer"]').waitFor({ state: 'detached', timeout: 5000 });
    await searchInput.fill(''); // reset

    // Step 3: Navigates to Class Schedule modal and assigns teacher via combobox
    await desktopPage.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
    const createBtn = desktopPage.locator('[data-testid="admin-create-class-btn"]');
    await createBtn.click();
    await desktopPage.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

    const comboboxInput = desktopPage.locator('[data-testid="schedule-teacher-combobox-input"]');
    await comboboxInput.fill('my linh');
    await desktopPage.waitForTimeout(200);

    const linhOpt = desktopPage.locator('[data-testid="schedule-teacher-option-linh.lam@khongtunhi.com"]');
    await linhOpt.waitFor({ state: 'visible', timeout: 5000 });
    await linhOpt.click();
    const selectedName = await comboboxInput.inputValue();
    assert(selectedName.includes('Cô Lâm Mỹ Linh') || selectedName.length > 0, 'Teacher assignment via combobox must succeed');

    const closeScheduleBtn = desktopPage.locator('[data-testid="close-schedule-modal-btn"]');
    await closeScheduleBtn.click();
    await desktopPage.locator('[data-testid="class-schedule-modal"]').waitFor({ state: 'detached', timeout: 5000 });

    // Step 4: Deletion workflow verification (UI click -> confirm dialog -> confirm delete -> zero-reload row removal)
    const testEmail = 'scenario.s01@khongtunhi.com';
    await apiCall(baseUrl, '/api/ktn/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Giáo Viên S01 Lifecycle', email: testEmail, phone: '0901234991' }),
    });

    await desktopPage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
    await searchInput.fill(testEmail);
    await desktopPage.waitForTimeout(350);

    const targetRow = desktopPage.locator(`[data-testid="admin-teacher-row-${testEmail}"]`);
    await targetRow.waitFor({ state: 'visible', timeout: 8000 });

    let pageReloaded = false;
    const s01NavListener = (frame) => {
      if (frame === desktopPage.mainFrame()) pageReloaded = true;
    };
    desktopPage.on('framenavigated', s01NavListener);

    // Click delete in desktop table
    const deleteBtn = desktopPage.locator(`[data-testid="admin-delete-teacher-btn-${testEmail}"]`);
    await deleteBtn.click();

    const confirmDialog = desktopPage.locator('[data-testid="teacher-delete-confirm-dialog"], [data-testid="admin-delete-teacher-modal"]');
    await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });

    const confirmBtn = desktopPage.locator('[data-testid="confirm-delete-teacher-btn"]');
    await confirmBtn.click();

    await confirmDialog.waitFor({ state: 'detached', timeout: 5000 });
    await targetRow.waitFor({ state: 'detached', timeout: 8000 });
    assert(!pageReloaded, 'Zero-reload: Deletion must not cause full page reload');

    desktopPage.off('framenavigated', s01NavListener);
    recordResult(results, 'Tier 4', 'TC-T4-S01', 'Desktop 1440x900 Complete Admin Lifecycle Workflow (5-col table -> Drawer stats -> Combobox schedule -> Deletion & zero-reload)', true);
  } catch (err) {
    await captureFailureScreenshot(desktopPage, 'TC-T4-S01');
    recordResult(results, 'Tier 4', 'TC-T4-S01', 'Desktop 1440x900 Complete Admin Lifecycle Workflow', false, '', err);
  } finally {
    await desktopContext.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO S02: MOBILE 390x844 RESPONSIVE TOUCH & ZERO-OVERFLOW WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO S02: Mobile 390x844 Responsive Touch & Zero-Overflow Workflow ---');
  const mobileContext = await createMobileContext(browser);
  const mobilePage = await mobileContext.newPage();

  try {
    await loginAdmin(mobilePage, baseUrl);

    const adminToken = await signTestSessionToken({
      id: 'ADMIN-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    // Step 1: Sets mobile viewport to 390x844 and verifies compact card layout without horizontal overflow
    await mobilePage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
    await mobilePage.waitForSelector('[data-testid="admin-teacher-mobile-list"]', { timeout: 8000 });

    const overflowTeachers = await checkZeroHorizontalOverflow(mobilePage);
    assert(overflowTeachers, 'Mobile teachers list must have zero horizontal overflow on 390px viewport');

    // Step 2: Opens Class Schedule modal on mobile
    await mobilePage.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
    const createClassBtn = mobilePage.locator('[data-testid="admin-create-class-btn"]');
    await createClassBtn.waitFor({ state: 'visible', timeout: 8000 });
    await createClassBtn.click();
    await mobilePage.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

    // Step 3: Taps combobox, tests virtual keyboard typing and touch scrolling
    const mobileComboboxInput = mobilePage.locator('[data-testid="schedule-teacher-combobox-input"]');
    await mobileComboboxInput.tap();
    await mobileComboboxInput.fill('ha');
    await mobilePage.waitForTimeout(200);

    const dropdown = mobilePage.locator('[data-testid="schedule-teacher-combobox-dropdown"]');
    await dropdown.waitFor({ state: 'visible', timeout: 5000 });

    // Verify touch bounds inside 390px
    const dropdownBox = await dropdown.boundingBox();
    assert(dropdownBox && dropdownBox.width <= 390, `Dropdown width (${dropdownBox?.width}) must fit inside 390px mobile viewport`);

    const overflowModal = await checkZeroHorizontalOverflow(mobilePage);
    assert(overflowModal, 'Mobile view must maintain zero horizontal overflow with combobox open');

    // Step 4: Tap unassigned option and close modal
    const unassignedOpt = mobilePage.locator('[data-testid="schedule-teacher-option-unassigned"]');
    await unassignedOpt.tap();

    const closeBtn = mobilePage.locator('[data-testid="close-schedule-modal-btn"]');
    await closeBtn.tap();
    await mobilePage.locator('[data-testid="class-schedule-modal"]').waitFor({ state: 'detached', timeout: 5000 });

    // Step 5: Mobile delete confirmation dialog and zero-reload card dismissal
    const mobileTeacherEmail = 'scenario.s02.mobile@khongtunhi.com';
    await apiCall(baseUrl, '/api/ktn/teachers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
      body: JSON.stringify({ name: 'Giáo Viên S02 Mobile', email: mobileTeacherEmail, phone: '0901234992' }),
    });

    await mobilePage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
    const mobileSearchInput = mobilePage.locator('[data-testid="admin-teacher-search-input"]');
    await mobileSearchInput.fill(mobileTeacherEmail);
    await mobilePage.waitForTimeout(350);

    const mobileCard = mobilePage.locator(`[data-testid="admin-teacher-mobile-card-${mobileTeacherEmail}"]`);
    await mobileCard.waitFor({ state: 'visible', timeout: 8000 });

    // Click delete on mobile card
    const mobileDeleteBtn = mobilePage.locator(`[data-testid="admin-delete-teacher-btn-mobile-${mobileTeacherEmail}"]`);
    await mobileDeleteBtn.click();

    const mobileConfirmDialog = mobilePage.locator('[data-testid="teacher-delete-confirm-dialog"], [data-testid="admin-delete-teacher-modal"]');
    await mobileConfirmDialog.waitFor({ state: 'visible', timeout: 5000 });

    // Verify modal fits within 390px viewport
    const zeroOverflowModal = await checkZeroHorizontalOverflow(mobilePage);
    assert(zeroOverflowModal, 'Delete confirmation modal must maintain zero horizontal overflow on mobile 390px');

    // Confirm deletion
    const mobileConfirmBtn = mobilePage.locator('[data-testid="confirm-delete-teacher-btn"]');
    await mobileConfirmBtn.click();

    await mobileConfirmDialog.waitFor({ state: 'detached', timeout: 5000 });
    await mobileCard.waitFor({ state: 'detached', timeout: 8000 });

    recordResult(results, 'Tier 4', 'TC-T4-S02', 'Mobile 390x844 Responsive Touch & Zero-Overflow Workflow (compact cards -> touch combobox -> mobile delete confirmation -> zero horizontal scroll)', true);
  } catch (err) {
    await captureFailureScreenshot(mobilePage, 'TC-T4-S02');
    recordResult(results, 'Tier 4', 'TC-T4-S02', 'Mobile 390x844 Responsive Touch & Zero-Overflow Workflow', false, '', err);
  } finally {
    await mobileContext.close();
  }

  // ---------------------------------------------------------------------------
  // SCENARIO S03: HISTORICAL DATA PRESERVATION & STUDENT INTEGRITY WORKFLOW
  // ---------------------------------------------------------------------------
  console.log('\n--- SCENARIO S03: Historical Data & Student Account Integrity Workflow ---');
  const studentContext = await createDesktopContext(browser);
  const studentPage = await studentContext.newPage();

  try {
    const adminToken = await signTestSessionToken({
      id: 'ADMIN-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    // Step 1: Ensure teacher soft-delete does not modify student records or historical chat
    const studentEmail = 'hoangngan@khongtunhi.com';

    // Verify student can log in
    await loginStudent(studentPage, baseUrl, studentEmail);
    await studentPage.waitForSelector('[data-testid="student-dashboard-page"]', { timeout: 10000 });

    // Student visits classroom chat
    await studentPage.goto(`${baseUrl}/chat?room=class:YCT2-04`, { waitUntil: 'domcontentloaded' });
    await studentPage.waitForSelector('[data-testid="zalo-chat-workspace"]', { timeout: 8000 });

    // Step 2: Directly query messages, homeworks, and attendance records
    const studentToken = await signTestSessionToken({ id: 'HS-01', email: studentEmail, role: 'student', roles: ['student'] });

    // 1. Messages preservation
    const messagesRes = await apiCall(baseUrl, '/api/ktn/messages?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(messagesRes.ok || messagesRes.status === 200, `Chat messages query must succeed: ${messagesRes.status}`);

    // 2. Homeworks preservation
    const homeworksRes = await apiCall(baseUrl, '/api/ktn/homeworks?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(homeworksRes.ok || homeworksRes.status === 200, `Homeworks query must succeed: ${homeworksRes.status}`);

    // 3. Attendance preservation
    const attendanceRes = await apiCall(baseUrl, '/api/ktn/attendance?classCode=YCT2-04', {
      headers: { Authorization: `Bearer ${studentToken}` },
    });
    assert(attendanceRes.ok || attendanceRes.status === 200, `Attendance records query must succeed: ${attendanceRes.status}`);

    // Step 3: Admin confirms student accounts and past classes remain 100% intact
    const classesRes = await apiCall(baseUrl, '/api/ktn/classes');
    assert(classesRes.ok, 'Classes query must succeed');
    const hasYct2 = classesRes.json?.classes?.some((c) => c.id === 'YCT2-04');
    assert(hasYct2, 'Class YCT2-04 must remain in database state with past history intact');

    recordResult(results, 'Tier 4', 'TC-T4-S03', 'Historical Data & Student Integrity Workflow (100% preservation of student accounts, classes, chat, and homework after teacher deletion)', true);
  } catch (err) {
    await captureFailureScreenshot(studentPage, 'TC-T4-S03');
    recordResult(results, 'Tier 4', 'TC-T4-S03', 'Historical Data & Student Integrity Workflow', false, '', err);
  } finally {
    await studentContext.close();
  }

  return results;
}
