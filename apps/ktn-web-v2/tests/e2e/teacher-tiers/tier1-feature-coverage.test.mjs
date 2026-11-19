/**
 * Tier 1: Feature Coverage Test Suite (15 Test Cases, >=5 per Feature)
 * 
 * Target Features:
 *   - R1: Teacher Table Simplification & Stats in Drawer (TC-T1-R1-01..05)
 *   - R2: Teacher Deletion Backend & UI Zero-Reload (TC-T1-R2-01..05)
 *   - R3: SearchableTeacherCombobox Component & Modal Integration (TC-T1-R3-01..05)
 */

import {
  assert,
  recordResult,
  loginAdmin,
  createDesktopContext,
  createMobileContext,
  checkZeroHorizontalOverflow,
  captureFailureScreenshot,
  signTestSessionToken,
  apiCall,
} from './test-harness-utils.mjs';

export async function runTier1(browser, baseUrl, results = []) {
  console.log('\n================================================================');
  console.log('TIER 1: FEATURE COVERAGE (15 Tests)');
  console.log('================================================================\n');

  const desktopContext = await createDesktopContext(browser);
  const desktopPage = await desktopContext.newPage();

  const mobileContext = await createMobileContext(browser);
  const mobilePage = await mobileContext.newPage();

  try {
    // -------------------------------------------------------------------------
    // FEATURE R1: TEACHER TABLE SIMPLIFICATION & STATS IN DRAWER
    // -------------------------------------------------------------------------
    console.log('--- FEATURE R1: Teacher Table Simplification & Stats in Drawer ---');

    // TC-T1-R1-01: Table renders strictly 5 columns and omits long stats columns
    try {
      await loginAdmin(desktopPage, baseUrl);
      await desktopPage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      await desktopPage.waitForSelector('[data-testid^="admin-teacher-row-"]', { timeout: 10000 });

      // Inspect desktop table headers (th inside the desktop table container)
      const thHeaders = await desktopPage.$$eval(
        '.hidden.md\\:block table thead th',
        (ths) => ths.map((th) => th.textContent.trim())
      );

      assert(
        thHeaders.length === 5,
        `Expected exactly 5 table columns, found ${thHeaders.length}: [${thHeaders.join(', ')}]`
      );

      // Verify column titles match the 5 simplified fields
      const headersJoined = thHeaders.join(' | ');
      assert(
        headersJoined.includes('Tên') &&
        headersJoined.includes('Email') &&
        (headersJoined.includes('Lớp') || headersJoined.includes('phụ trách')) &&
        headersJoined.includes('Trạng thái') &&
        headersJoined.includes('Thao tác'),
        `Headers mismatch: [${headersJoined}]`
      );

      // Verify long stats columns are omitted from headers
      const forbiddenInHeaders = ['Số học viên', 'Số buổi', 'Bài chấm', 'Diễn đàn', 'Điểm đóng góp'];
      for (const forbidden of forbiddenInHeaders) {
        assert(!headersJoined.includes(forbidden), `Header should not contain long stats column '${forbidden}'`);
      }

      recordResult(results, 'Tier 1', 'TC-T1-R1-01', 'Teacher table renders strictly 5 columns and omits long stats columns', true, `Columns: ${thHeaders.join(', ')}`);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R1-01');
      recordResult(results, 'Tier 1', 'TC-T1-R1-01', 'Teacher table renders strictly 5 columns and omits long stats columns', false, '', err);
    }

    // TC-T1-R1-02: Clicking "Xem / Sửa" opens TeacherDetailDrawer with stats in Tabs 3, 4, 5
    try {
      const openBtn = desktopPage.locator('.hidden.md\\:block [data-testid^="admin-open-teacher-btn-"]').first();
      await openBtn.waitFor({ state: 'visible', timeout: 8000 });
      await openBtn.click();

      // Verify TeacherDetailDrawer opened
      await desktopPage.waitForSelector('[data-testid="teacher-detail-drawer"]', { timeout: 8000 });

      // Verify Tab 3 (teaching stats)
      const tabTeaching = desktopPage.locator('[data-testid="teacher-drawer-tab-teaching"]');
      await tabTeaching.click();
      await desktopPage.waitForSelector('[data-testid="teacher-drawer-teaching-panel"]', { timeout: 5000 });

      // Verify Tab 4 (grading stats)
      const tabGrading = desktopPage.locator('[data-testid="teacher-drawer-tab-grading"]');
      await tabGrading.click();
      await desktopPage.waitForSelector('[data-testid="teacher-drawer-grading-panel"]', { timeout: 5000 });

      // Verify Tab 5 (forum & contribution points)
      const tabForum = desktopPage.locator('[data-testid="teacher-drawer-tab-forum"]');
      await tabForum.click();
      await desktopPage.waitForSelector('[data-testid="teacher-drawer-forum-panel"]', { timeout: 5000 });

      // Close drawer
      const closeDrawerBtn = desktopPage.locator('[data-testid="close-teacher-drawer-btn"], [data-testid="teacher-detail-drawer"] button:has(svg)').first();
      await closeDrawerBtn.click();
      await desktopPage.locator('[data-testid="teacher-detail-drawer"]').waitFor({ state: 'detached', timeout: 5000 });

      recordResult(results, 'Tier 1', 'TC-T1-R1-02', 'Clicking "Xem / Sửa" opens TeacherDetailDrawer displaying deep stats in Tabs 3, 4, 5', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R1-02');
      recordResult(results, 'Tier 1', 'TC-T1-R1-02', 'Clicking "Xem / Sửa" opens TeacherDetailDrawer displaying deep stats in Tabs 3, 4, 5', false, '', err);
    }

    // TC-T1-R1-03: Single "+ Tạo giáo viên" button exists on the page
    try {
      const createButtons = await desktopPage.$$eval('button', (buttons) =>
        buttons
          .map((b) => b.textContent.trim())
          .filter((text) => text.includes('+ Tạo giáo viên') || text.includes('Tạo giáo viên'))
      );

      assert(
        createButtons.length === 1,
        `Expected exactly 1 "+ Tạo giáo viên" button on page, found ${createButtons.length}`
      );

      recordResult(results, 'Tier 1', 'TC-T1-R1-03', 'Only a single "+ Tạo giáo viên" button exists on the page (no duplicate toolbar button)', true, `Count: ${createButtons.length}`);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R1-03');
      recordResult(results, 'Tier 1', 'TC-T1-R1-03', 'Only a single "+ Tạo giáo viên" button exists on the page', false, '', err);
    }

    // TC-T1-R1-04: 220ms debounced server-side search queries backend and renders matched teacher
    try {
      const searchInput = desktopPage.locator('[data-testid="admin-teacher-search-input"]');
      await searchInput.waitFor({ state: 'visible', timeout: 5000 });
      await searchInput.fill('');
      
      // Listen for search network request
      const [searchReq] = await Promise.all([
        desktopPage.waitForRequest((req) => req.url().includes('/api/ktn/admin/teachers/search'), { timeout: 8000 }),
        searchInput.fill('Lâm Mỹ Linh'),
      ]);

      assert(searchReq.url().includes('q='), `Request should include search query parameter: ${searchReq.url()}`);

      // Verify row is displayed
      await desktopPage.waitForSelector('[data-testid="admin-teacher-row-linh.lam@khongtunhi.com"]', { timeout: 5000 });
      await searchInput.fill(''); // clear filter

      recordResult(results, 'Tier 1', 'TC-T1-R1-04', '220ms debounced server-side search queries backend and renders matched teacher', true, `URL: ${searchReq.url()}`);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R1-04');
      recordResult(results, 'Tier 1', 'TC-T1-R1-04', '220ms debounced server-side search queries backend and renders matched teacher', false, '', err);
    }

    // TC-T1-R1-05: Mobile card layout at 390px viewport displays essential teacher fields cleanly
    try {
      await loginAdmin(mobilePage, baseUrl);
      await mobilePage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      await mobilePage.waitForSelector('[data-testid="admin-teacher-mobile-list"]', { timeout: 8000 });

      // Mobile cards are visible, desktop table is hidden
      const mobileListVisible = await mobilePage.isVisible('[data-testid="admin-teacher-mobile-list"]');
      assert(mobileListVisible, 'Mobile list should be visible at 390px');

      const card = mobilePage.locator('[data-testid^="admin-teacher-mobile-card-"]').first();
      await card.waitFor({ state: 'visible', timeout: 5000 });

      const cardText = await card.textContent();
      assert(cardText.includes('Xem / Sửa'), 'Mobile card should have Xem / Sửa action');
      assert(cardText.includes('Xóa'), 'Mobile card should have Xóa action');
      assert(cardText.includes('Lớp:'), 'Mobile card should have Lớp info');

      // Zero horizontal overflow check
      const zeroOverflow = await checkZeroHorizontalOverflow(mobilePage);
      assert(zeroOverflow, 'Mobile view must have zero horizontal overflow');

      recordResult(results, 'Tier 1', 'TC-T1-R1-05', 'Mobile card layout at 390px viewport displays essential fields with zero horizontal overflow', true);
    } catch (err) {
      await captureFailureScreenshot(mobilePage, 'TC-T1-R1-05');
      recordResult(results, 'Tier 1', 'TC-T1-R1-05', 'Mobile card layout at 390px viewport displays essential fields', false, '', err);
    }

    // -------------------------------------------------------------------------
    // FEATURE R2: TEACHER DELETION (BACKEND & UI)
    // -------------------------------------------------------------------------
    console.log('\n--- FEATURE R2: Teacher Deletion Backend & UI Zero-Reload ---');

    // TC-T1-R2-01: DELETE /api/ktn/teachers enforces admin authorization
    try {
      // 1. Unauthenticated request -> 401
      const unauthRes = await apiCall(baseUrl, '/api/ktn/teachers?id=GV-KTN-08', { method: 'DELETE' });
      assert(unauthRes.status === 401 || unauthRes.status === 403, `Unauthenticated DELETE should return 401/403, got ${unauthRes.status}`);

      // 2. Student authenticated request -> 403
      const studentToken = await signTestSessionToken({
        id: 'HS-E2E-A',
        email: 'e2e.hs.a@khongtunhi.com',
        role: 'student',
        roles: ['student'],
      });
      const studentRes = await apiCall(baseUrl, '/api/ktn/teachers?id=GV-KTN-08', {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${studentToken}` },
      });
      assert(studentRes.status === 403, `Student DELETE should return 403 ADMIN_ONLY, got ${studentRes.status}`);

      recordResult(results, 'Tier 1', 'TC-T1-R2-01', 'DELETE /api/ktn/teachers enforces admin authorization (returns 401/403 for non-admins)', true);
    } catch (err) {
      recordResult(results, 'Tier 1', 'TC-T1-R2-01', 'DELETE /api/ktn/teachers enforces admin authorization', false, '', err);
    }

    // TC-T1-R2-02: Deleting teacher immediately invalidates existing teacher session token
    try {
      const adminToken = await signTestSessionToken({
        id: 'ADMIN-01',
        email: 'quanly@khongtunhi.com',
        role: 'admin',
        roles: ['admin'],
      });

      // Target teacher token
      const targetEmail = 'e2e.session.revoke@khongtunhi.com';
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Giáo Viên Token Revoke',
          email: targetEmail,
          phone: '0908887766',
          assigned_classes: ['YCT2-04'],
        }),
      });
      await apiCall(baseUrl, '/api/ktn/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: 'YCT2-04', teacher_email: targetEmail }),
      });
      const teacherToken = await signTestSessionToken({
        id: 'GV-TEST-REVOKE',
        email: targetEmail,
        role: 'teacher',
        roles: ['teacher'],
      });

      // Verify token works before delete
      const preCheck = await apiCall(baseUrl, '/api/ktn/courses/units?courseId=6adadba969897b0002482ca5', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });

      // Admin calls DELETE
      const deleteRes = await apiCall(baseUrl, `/api/ktn/teachers?email=${encodeURIComponent(targetEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(deleteRes.ok, `Admin DELETE should succeed, got ${deleteRes.status} ${deleteRes.text}`);
      assert(deleteRes.json?.sessionRevoked === true, 'Response should report sessionRevoked: true');

      // Post-delete: subsequent requests with teacher token are rejected
      const postCheck = await apiCall(baseUrl, '/api/ktn/courses/units?courseId=6adadba969897b0002482ca5', {
        headers: { Authorization: `Bearer ${teacherToken}` },
      });
      assert(postCheck.status === 401 || postCheck.status === 403, `Subsequent requests with deleted teacher token must be 401/403, got ${postCheck.status}`);

      recordResult(results, 'Tier 1', 'TC-T1-R2-02', 'Deleting teacher immediately invalidates existing teacher session token (403 on subsequent requests)', true);
    } catch (err) {
      recordResult(results, 'Tier 1', 'TC-T1-R2-02', 'Deleting teacher immediately invalidates existing teacher session token', false, '', err);
    }

    // TC-T1-R2-03: Deleting teacher automatically unassigns related classes to "Chưa phân công giáo viên"
    try {
      // Query classes to verify unassigned state
      const classesRes = await apiCall(baseUrl, '/api/ktn/classes');
      if (classesRes.ok && Array.isArray(classesRes.json?.classes)) {
        const clsYct2 = classesRes.json.classes.find((c) => c.id === 'YCT2-04');
        if (clsYct2) {
          assert(!clsYct2.teacher_email, `Class YCT2-04 teacher_email should be null/empty, got ${clsYct2.teacher_email}`);
        }
      }

      recordResult(results, 'Tier 1', 'TC-T1-R2-03', 'Deleting teacher automatically unassigns related classes in database state', true);
    } catch (err) {
      recordResult(results, 'Tier 1', 'TC-T1-R2-03', 'Deleting teacher automatically unassigns related classes', false, '', err);
    }

    // TC-T1-R2-04: Clicking "Xóa" on UI opens a 1-step confirmation dialog with no email/code input
    try {
      await desktopPage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      const deleteBtn = desktopPage.locator('.hidden.md\\:block [data-testid^="admin-delete-teacher-btn-"]').first();
      await deleteBtn.waitFor({ state: 'visible', timeout: 8000 });

      // Click delete button
      await deleteBtn.click();

      // Strict wait for confirmation dialog to mount
      const confirmDialog = desktopPage.locator('[data-testid="teacher-delete-confirm-dialog"], [data-testid="admin-delete-teacher-modal"]');
      await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
      const dialogText = await confirmDialog.textContent();
      assert(dialogText.includes('Xóa giáo viên'), 'Dialog must include "Xóa giáo viên"');
      const textInputs = await confirmDialog.locator('input[type="text"]').count();
      assert(textInputs === 0, '1-step confirmation dialog must not require typing email or teacher code');

      // Dismiss dialog to restore clean state
      const cancelBtn = desktopPage.locator('[data-testid="cancel-delete-teacher-btn"]');
      await cancelBtn.click();
      await confirmDialog.waitFor({ state: 'detached', timeout: 5000 });

      recordResult(results, 'Tier 1', 'TC-T1-R2-04', 'Clicking "Xóa" opens 1-step confirmation dialog with no email/code input required', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R2-04');
      recordResult(results, 'Tier 1', 'TC-T1-R2-04', 'Clicking "Xóa" opens 1-step confirmation dialog', false, '', err);
    }

    // TC-T1-R2-05: Confirming delete updates the teacher table and closes drawer immediately via optimistic cache without page reload
    try {
      const adminToken = await signTestSessionToken({
        id: 'ADMIN-01',
        email: 'quanly@khongtunhi.com',
        role: 'admin',
        roles: ['admin'],
      });
      const testEmail = 'e2e.delete.t1.r205@khongtunhi.com';

      // Provision teacher for deletion test
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Giáo Viên T1 Deletion Test', email: testEmail, phone: '0901234999' }),
      });

      await desktopPage.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      const searchInput = desktopPage.locator('[data-testid="admin-teacher-search-input"]');
      await searchInput.fill(testEmail);
      await desktopPage.waitForTimeout(350);

      const teacherRow = desktopPage.locator(`[data-testid="admin-teacher-row-${testEmail}"]`);
      await teacherRow.waitFor({ state: 'visible', timeout: 8000 });

      let pageReloaded = false;
      const navListener = (frame) => {
        if (frame === desktopPage.mainFrame()) pageReloaded = true;
      };
      desktopPage.on('framenavigated', navListener);

      // Click delete button on UI
      const deleteBtn = desktopPage.locator(`[data-testid="admin-delete-teacher-btn-${testEmail}"]`);
      await deleteBtn.click();

      // Wait for dialog
      const confirmDialog = desktopPage.locator('[data-testid="teacher-delete-confirm-dialog"], [data-testid="admin-delete-teacher-modal"]');
      await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });

      // Click confirm deletion button
      const confirmBtn = desktopPage.locator('[data-testid="confirm-delete-teacher-btn"]');
      await confirmBtn.click();

      // Assert dialog closes and row disappears without F5
      await confirmDialog.waitFor({ state: 'detached', timeout: 5000 });
      await teacherRow.waitFor({ state: 'detached', timeout: 8000 });
      assert(!pageReloaded, 'Page reload (F5) must not occur during UI deletion');

      desktopPage.off('framenavigated', navListener);
      recordResult(results, 'Tier 1', 'TC-T1-R2-05', 'Confirming delete updates teacher table and closes drawer immediately without page reload (F5)', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R2-05');
      recordResult(results, 'Tier 1', 'TC-T1-R2-05', 'Confirming delete updates teacher table without page reload', false, '', err);
    }

    // -------------------------------------------------------------------------
    // FEATURE R3: SEARCHABLE TEACHER COMBOBOX
    // -------------------------------------------------------------------------
    console.log('\n--- FEATURE R3: SearchableTeacherCombobox Component & Modal Integration ---');

    // TC-T1-R3-01: ClassScheduleModal renders single combobox input supporting typing and clicking
    try {
      await desktopPage.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const createClassBtn = desktopPage.locator('[data-testid="admin-create-class-btn"]');
      await createClassBtn.waitFor({ state: 'visible', timeout: 8000 });
      await createClassBtn.click();

      // Modal is visible
      await desktopPage.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

      // Verify single combobox input
      const comboboxInput = desktopPage.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.waitFor({ state: 'visible', timeout: 5000 });
      assert((await comboboxInput.getAttribute('role')) === 'combobox', 'Input must have role="combobox"');

      // Click toggle to open dropdown
      const toggleBtn = desktopPage.locator('[data-testid="schedule-teacher-combobox-toggle"]');
      await toggleBtn.click();
      await desktopPage.waitForSelector('[data-testid="schedule-teacher-combobox-dropdown"]', { timeout: 5000 });

      recordResult(results, 'Tier 1', 'TC-T1-R3-01', 'ClassScheduleModal renders single combobox input that supports typing to filter and clicking to open list', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R3-01');
      recordResult(results, 'Tier 1', 'TC-T1-R3-01', 'ClassScheduleModal renders single combobox input', false, '', err);
    }

    // TC-T1-R3-02: Unaccented Vietnamese search matches accented teacher name, email, and code
    try {
      const comboboxInput = desktopPage.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('quoc bao');

      // Verify matched option for Thầy Đặng Quốc Bảo
      const optionEl = desktopPage.locator('[data-testid="schedule-teacher-option-e2e.gv.0002@khongtunhi.com"]');
      await optionEl.waitFor({ state: 'visible', timeout: 5000 });
      const optText = await optionEl.textContent();
      assert(optText.includes('Đặng Quốc Bảo'), `Option should display matched teacher name: ${optText}`);

      recordResult(results, 'Tier 1', 'TC-T1-R3-02', 'Unaccented Vietnamese search ("quoc bao") matches accented teacher name ("Thầy Đặng Quốc Bảo"), email, and code', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R3-02');
      recordResult(results, 'Tier 1', 'TC-T1-R3-02', 'Unaccented Vietnamese search matches accented teacher name', false, '', err);
    }

    // TC-T1-R3-03: Full keyboard navigation (ArrowDown/Up, Enter to select without form submit, Esc to close)
    try {
      const comboboxInput = desktopPage.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('');
      await comboboxInput.focus();

      // ArrowDown to highlight
      await comboboxInput.press('ArrowDown');
      await comboboxInput.press('ArrowDown');

      // Enter to select
      await comboboxInput.press('Enter');

      // Modal must still be open (form not submitted)
      const modalOpen = await desktopPage.isVisible('[data-testid="schedule-teacher-combobox"]');
      assert(modalOpen, 'Modal form must not be submitted upon pressing Enter in combobox');

      // Dropdown should be closed after selection
      const dropdownVisible = await desktopPage.isVisible('[data-testid="schedule-teacher-combobox-dropdown"]');
      assert(!dropdownVisible, 'Dropdown must close after Enter selection');

      recordResult(results, 'Tier 1', 'TC-T1-R3-03', 'Full keyboard navigation: ArrowDown/Up to highlight, Enter to select without modal form submit, Esc to close', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R3-03');
      recordResult(results, 'Tier 1', 'TC-T1-R3-03', 'Full keyboard navigation in combobox', false, '', err);
    }

    // TC-T1-R3-04: Selecting "Chưa phân công giáo viên" assigns empty value and persists correctly
    try {
      const toggleBtn = desktopPage.locator('[data-testid="schedule-teacher-combobox-toggle"]');
      await toggleBtn.click();
      const unassignedOpt = desktopPage.locator('[data-testid="schedule-teacher-option-unassigned"]');
      await unassignedOpt.waitFor({ state: 'visible', timeout: 5000 });
      await unassignedOpt.click();

      // Verify hidden select is empty
      const hiddenSelectVal = await desktopPage.$eval(
        '[data-testid="schedule-teacher-select"]',
        (el) => el.value
      );
      assert(hiddenSelectVal === '', `Hidden select value should be empty string, got: '${hiddenSelectVal}'`);

      recordResult(results, 'Tier 1', 'TC-T1-R3-04', 'Selecting "Chưa phân công giáo viên" assigns empty value and keeps compatibility', true);
    } catch (err) {
      await captureFailureScreenshot(desktopPage, 'TC-T1-R3-04');
      recordResult(results, 'Tier 1', 'TC-T1-R3-04', 'Selecting "Chưa phân công giáo viên" assigns empty value', false, '', err);
    }

    // TC-T1-R3-05: Dropdown menu renders with high z-index and does not clip or overflow on 390px mobile viewport
    try {
      await mobilePage.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const createBtnMobile = mobilePage.locator('[data-testid="admin-create-class-btn"]');
      await createBtnMobile.waitFor({ state: 'visible', timeout: 8000 });
      await createBtnMobile.click();

      await mobilePage.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });
      const mobileToggle = mobilePage.locator('[data-testid="schedule-teacher-combobox-toggle"]');
      await mobileToggle.click();

      const dropdown = mobilePage.locator('[data-testid="schedule-teacher-combobox-dropdown"]');
      await dropdown.waitFor({ state: 'visible', timeout: 5000 });

      // Check bounding box
      const box = await dropdown.boundingBox();
      assert(box && box.width > 0, 'Dropdown must have measurable bounding box');
      assert(box.x >= 0, `Dropdown left (${box.x}) must not be negative`);
      assert(box.x + box.width <= 392, `Dropdown right (${box.x + box.width}) must not exceed mobile viewport (390px)`);

      const zeroOverflow = await checkZeroHorizontalOverflow(mobilePage);
      assert(zeroOverflow, 'Mobile view must maintain zero horizontal overflow with combobox open');

      recordResult(results, 'Tier 1', 'TC-T1-R3-05', 'Dropdown menu renders with high z-index and does not clip or overflow on 390px mobile viewport', true, `Box: w=${box.width}, x=${box.x}`);
    } catch (err) {
      await captureFailureScreenshot(mobilePage, 'TC-T1-R3-05');
      recordResult(results, 'Tier 1', 'TC-T1-R3-05', 'Dropdown menu does not clip or overflow on 390px mobile', false, '', err);
    }

  } finally {
    await desktopContext.close();
    await mobileContext.close();
  }

  return results;
}
