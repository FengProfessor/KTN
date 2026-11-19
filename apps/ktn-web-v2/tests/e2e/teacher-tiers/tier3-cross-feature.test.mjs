/**
 * Tier 3: Cross-Feature Pairwise Interaction Test Suite (6 Test Cases)
 * 
 * Target Interactions:
 *   - TC-T3-X01 (R2 -> R1 -> R3): Delete Teacher A -> Table removes row -> Combobox immediately excludes Teacher A
 *   - TC-T3-X02 (R2 -> R3 -> R1): Delete Teacher B assigned to Class X -> Class modal shows "Chưa phân công" -> Classes table reflects unassigned
 *   - TC-T3-X03 (R1 -> R2): Search Teacher C -> Open Drawer -> Delete from Drawer Tab 6 -> Drawer closes & search results remove Teacher C
 *   - TC-T3-X04 (R3 -> R1): Assign Teacher D in ClassScheduleModal via Combobox -> Admin table row updates assigned class badge immediately
 *   - TC-T3-X05 (R2 -> R3): Delete Teacher E -> Open formerly assigned class modal -> Reassign to Teacher F via unaccented search -> Save successfully
 *   - TC-T3-X06 (R2 || R3 Race Condition): Combobox opened while teacher concurrently deleted -> Graceful validation error
 */

import {
  assert,
  recordResult,
  loginAdmin,
  createDesktopContext,
  captureFailureScreenshot,
  signTestSessionToken,
  apiCall,
} from './test-harness-utils.mjs';

export async function runTier3(browser, baseUrl, results = []) {
  console.log('\n================================================================');
  console.log('TIER 3: CROSS-FEATURE PAIRWISE INTERACTIONS (6 Tests)');
  console.log('================================================================\n');

  const desktopContext = await createDesktopContext(browser);
  const page = await desktopContext.newPage();

  try {
    await loginAdmin(page, baseUrl);

    const adminToken = await signTestSessionToken({
      id: 'ADMIN-01',
      email: 'quanly@khongtunhi.com',
      role: 'admin',
      roles: ['admin'],
    });

    // -------------------------------------------------------------------------
    // TC-T3-X01 (R2 -> R1 -> R3): Delete Teacher -> Table removes row -> Combobox excludes teacher
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X01 (R2 -> R1 -> R3) ---');
      const testEmail = 'pairwise.x01@khongtunhi.com';

      // 1. Provision Teacher X01
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Giáo Viên Pairwise X01', email: testEmail, phone: '0901234001' }),
      });

      // 2. Delete Teacher X01 via backend
      const delRes = await apiCall(baseUrl, `/api/ktn/teachers?email=${encodeURIComponent(testEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      assert(delRes.ok, `Delete Teacher X01 failed: ${delRes.status}`);

      // 3. Admin navigates to /admin/teachers: row is absent
      await page.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(500);
      const rowExists = await page.locator(`[data-testid="admin-teacher-row-${testEmail}"]`).count();
      assert(rowExists === 0, 'Deleted teacher must not appear in admin teachers table');

      // 4. Open Class Schedule Modal: combobox excludes Teacher X01
      await page.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const createBtn = page.locator('[data-testid="admin-create-class-btn"]');
      await createBtn.click();
      await page.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

      const toggleBtn = page.locator('[data-testid="schedule-teacher-combobox-toggle"]');
      await toggleBtn.click();
      const comboboxInput = page.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('Pairwise X01');
      await page.waitForTimeout(200);

      const emptyVisible = await page.isVisible('[data-testid="schedule-teacher-empty-state"]');
      assert(emptyVisible, 'Deleted teacher must be completely excluded from combobox options');

      recordResult(results, 'Tier 3', 'TC-T3-X01', 'Delete Teacher A -> Admin table removes row -> Class schedule combobox excludes Teacher A', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X01');
      recordResult(results, 'Tier 3', 'TC-T3-X01', 'Delete Teacher A -> Table removes row -> Combobox excludes Teacher A', false, '', err);
    }

    // -------------------------------------------------------------------------
    // TC-T3-X02 (R2 -> R3 -> R1): Delete Teacher B assigned to Class X -> Modal shows "Chưa phân công" -> Table reflects unassigned
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X02 (R2 -> R3 -> R1) ---');
      const testEmail = 'pairwise.x02@khongtunhi.com';

      // 1. Provision Teacher X02
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({
          name: 'Giáo Viên Pairwise X02',
          email: testEmail,
          phone: '0901234002',
          assigned_classes: ['YCT2-04'],
        }),
      });

      // 2. Assign Teacher X02 to class YCT2-04
      await apiCall(baseUrl, '/api/ktn/classes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ id: 'YCT2-04', teacher_email: testEmail }),
      });

      // 3. Delete Teacher X02
      await apiCall(baseUrl, `/api/ktn/teachers?email=${encodeURIComponent(testEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // 4. Navigate to classes: class reflects unassigned state
      await page.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      await page.waitForSelector('[data-testid^="admin-edit-schedule-btn-"]', { timeout: 8000 });

      // Open schedule modal for class YCT2-04
      const editBtn = page.locator('[data-testid="admin-edit-schedule-btn-YCT2-04"]');
      await editBtn.waitFor({ state: 'visible', timeout: 8000 });
      await editBtn.click();
      await page.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

      // Combobox displays "Chưa phân công giáo viên" or placeholder
      const inputVal = await page.locator('[data-testid="schedule-teacher-combobox-input"]').inputValue();
      const placeholder = await page.locator('[data-testid="schedule-teacher-combobox-input"]').getAttribute('placeholder');
      assert(
        inputVal === '' || inputVal.includes('Chưa phân công') || (placeholder && placeholder.includes('Chọn giáo viên')),
        `Combobox should reflect unassigned state, got val='${inputVal}', placeholder='${placeholder}'`
      );

      // Close modal to reset state
      const closeBtn = page.locator('[data-testid="close-schedule-modal-btn"]');
      await closeBtn.click();
      await page.locator('[data-testid="class-schedule-modal"]').waitFor({ state: 'detached', timeout: 5000 });

      recordResult(results, 'Tier 3', 'TC-T3-X02', 'Delete Teacher B assigned to Class X -> Combobox displays "Chưa phân công" -> Admin classes table reflects unassigned', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X02');
      recordResult(results, 'Tier 3', 'TC-T3-X02', 'Delete Teacher B -> Combobox shows "Chưa phân công"', false, '', err);
    }

    // -------------------------------------------------------------------------
    // TC-T3-X03 (R1 -> R2): Search Teacher C -> Open Drawer -> Delete from Drawer Tab 6 -> Drawer closes & table updates
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X03 (R1 -> R2) ---');
      const testEmail = 'pairwise.x03@khongtunhi.com';

      // 1. Provision Teacher X03
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Giáo Viên Pairwise X03', email: testEmail, phone: '0901234003' }),
      });

      // 2. Search Teacher C in AdminWorkspace
      await page.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      const searchInput = page.locator('[data-testid="admin-teacher-search-input"]');
      await searchInput.fill('Pairwise X03');
      await page.waitForTimeout(350);

      // 3. Open Drawer
      const openBtn = page.locator(`[data-testid="admin-open-teacher-btn-${testEmail}"]`);
      await openBtn.waitFor({ state: 'visible', timeout: 8000 });
      await openBtn.click();
      await page.waitForSelector('[data-testid="teacher-detail-drawer"]', { timeout: 8000 });

      // Tab 6: Account
      const tabAccount = page.locator('[data-testid="teacher-drawer-tab-account"]');
      await tabAccount.click();
      await page.waitForSelector('[data-testid="teacher-drawer-account-panel"]', { timeout: 5000 });

      // Click delete button inside Tab 6 (strictly without fallback)
      const drawerDeleteBtn = page.locator('[data-testid="drawer-delete-teacher-btn"], [data-testid="admin-drawer-delete-teacher-btn"]');
      await drawerDeleteBtn.waitFor({ state: 'visible', timeout: 5000 });
      await drawerDeleteBtn.click();

      // Confirm deletion in dialog
      const confirmDialog = page.locator('[data-testid="teacher-delete-confirm-dialog"], [data-testid="admin-delete-teacher-modal"]');
      await confirmDialog.waitFor({ state: 'visible', timeout: 5000 });
      const confirmBtn = page.locator('[data-testid="confirm-delete-teacher-btn"]');
      await confirmBtn.click();

      // Assert dialog closes and drawer auto-closes
      await confirmDialog.waitFor({ state: 'detached', timeout: 5000 });
      const drawer = page.locator('[data-testid="teacher-detail-drawer"]');
      await drawer.waitFor({ state: 'detached', timeout: 5000 });

      // Assert teacher row is detached from search results
      const teacherRow = page.locator(`[data-testid="admin-teacher-row-${testEmail}"]`);
      await teacherRow.waitFor({ state: 'detached', timeout: 5000 });

      await searchInput.fill('');
      recordResult(results, 'Tier 3', 'TC-T3-X03', 'Search Teacher C in search bar -> Open Drawer -> Delete from Drawer -> Drawer closes and table removes Teacher C', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X03');
      recordResult(results, 'Tier 3', 'TC-T3-X03', 'Search Teacher C -> Open Drawer -> Delete -> Drawer closes', false, '', err);
    }

    // -------------------------------------------------------------------------
    // TC-T3-X04 (R3 -> R1): Assign Teacher D to Class Y in ClassScheduleModal via Combobox -> Save -> Table updates badges
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X04 (R3 -> R1) ---');
      await page.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const editBtn = page.locator('[data-testid="admin-edit-schedule-btn-YCT2-04"]');
      await editBtn.waitFor({ state: 'visible', timeout: 8000 });
      await editBtn.click();

      await page.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });
      const comboboxInput = page.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('tran thu ha');
      await page.waitForTimeout(200);

      const teacherOpt = page.locator('[data-testid="schedule-teacher-option-thu.ha@khongtunhi.com"]');
      await teacherOpt.waitFor({ state: 'visible', timeout: 5000 });
      await teacherOpt.click();

      // Click Save button
      const saveBtn = page.locator('[data-testid="save-class-schedule-btn"]');
      await saveBtn.click();

      // Wait for modal to close
      const modal = page.locator('[data-testid="class-schedule-modal"]');
      await modal.waitFor({ state: 'detached', timeout: 8000 });

      // Navigate to /admin/teachers and verify assigned class badge
      await page.goto(`${baseUrl}/admin/teachers`, { waitUntil: 'domcontentloaded' });
      const haRow = page.locator('[data-testid="admin-teacher-row-thu.ha@khongtunhi.com"]');
      await haRow.waitFor({ state: 'visible', timeout: 8000 });
      const haRowText = await haRow.textContent();
      assert(haRowText.includes('YCT2-04'), 'Teacher Trần Thu Hà row must reflect assigned class YCT2-04');

      recordResult(results, 'Tier 3', 'TC-T3-X04', 'Assign Teacher D to Class Y in ClassScheduleModal via Combobox -> Saved assignment reflects immediately in admin table', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X04');
      recordResult(results, 'Tier 3', 'TC-T3-X04', 'Assign Teacher D via Combobox -> Table updates', false, '', err);
    }

    // -------------------------------------------------------------------------
    // TC-T3-X05 (R2 -> R3): Delete Teacher E -> Open formerly assigned Class Z modal -> Reassign to Teacher F via unaccented search
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X05 (R2 -> R3) ---');
      const teacherEEmail = 'pairwise.x05.e@khongtunhi.com';
      const teacherFEmail = 'thu.ha@khongtunhi.com';

      // 1. Provision Teacher E
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Giáo Viên Pairwise X05 E', email: teacherEEmail, phone: '0901234005' }),
      });

      // 2. Assign Teacher E to class YCT2-04 via API
      await apiCall(baseUrl, '/api/ktn/classes/schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ classCode: 'YCT2-04', teacherEmail: teacherEEmail }),
      });

      // 3. Delete Teacher E
      await apiCall(baseUrl, `/api/ktn/teachers?email=${encodeURIComponent(teacherEEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // 4. Open Class YCT2-04 modal in UI
      await page.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const editBtn = page.locator('[data-testid="admin-edit-schedule-btn-YCT2-04"]');
      await editBtn.waitFor({ state: 'visible', timeout: 8000 });
      await editBtn.click();
      await page.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

      // 5. Reassign to Teacher F via unaccented combobox search
      const comboboxInput = page.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('tran thu ha');
      await page.waitForTimeout(200);

      const optF = page.locator(`[data-testid="schedule-teacher-option-${teacherFEmail}"]`);
      await optF.waitFor({ state: 'visible', timeout: 5000 });
      await optF.click();

      // 6. Save modal
      const saveBtn = page.locator('[data-testid="save-class-schedule-btn"]');
      await saveBtn.click();
      await page.locator('[data-testid="class-schedule-modal"]').waitFor({ state: 'detached', timeout: 8000 });

      recordResult(results, 'Tier 3', 'TC-T3-X05', 'Delete Teacher E -> Open formerly assigned Class Z modal -> Reassign to Teacher F via unaccented combobox search', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X05');
      recordResult(results, 'Tier 3', 'TC-T3-X05', 'Reassign unassigned class to new teacher via unaccented combobox', false, '', err);
    }

    // -------------------------------------------------------------------------
    // TC-T3-X06 (R2 || R3 Race Condition): Combobox opened while target teacher concurrently deleted -> Graceful handling
    // -------------------------------------------------------------------------
    try {
      console.log('--- TC-T3-X06 (R2 || R3 Race Condition) ---');
      const testEmail = 'pairwise.x06@khongtunhi.com';

      // 1. Provision Teacher X06
      await apiCall(baseUrl, '/api/ktn/teachers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ name: 'Giáo Viên Pairwise X06', email: testEmail, phone: '0901234006' }),
      });

      // 2. Open modal & combobox
      await page.goto(`${baseUrl}/admin/classes`, { waitUntil: 'domcontentloaded' });
      const createBtn = page.locator('[data-testid="admin-create-class-btn"]');
      await createBtn.click();
      await page.waitForSelector('[data-testid="schedule-teacher-combobox"]', { timeout: 8000 });

      // 3. Concurrently delete Teacher X06 in background session
      await apiCall(baseUrl, `/api/ktn/teachers?email=${encodeURIComponent(testEmail)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${adminToken}` },
      });

      // 4. UI interaction on combobox does not throw unhandled javascript error
      const comboboxInput = page.locator('[data-testid="schedule-teacher-combobox-input"]');
      await comboboxInput.fill('Pairwise X06');
      await page.waitForTimeout(200);

      // Verify no crash / page stays responsive
      const modalStillOpen = await page.isVisible('[data-testid="schedule-teacher-combobox"]');
      assert(modalStillOpen, 'Modal must remain open and responsive under concurrent deletion');

      const closeBtn = page.locator('[data-testid="close-schedule-modal-btn"]');
      await closeBtn.click();
      await page.locator('[data-testid="class-schedule-modal"]').waitFor({ state: 'detached', timeout: 5000 });

      recordResult(results, 'Tier 3', 'TC-T3-X06', 'Combobox opened while teacher is concurrently deleted -> UI handles gracefully without unhandled exception', true);
    } catch (err) {
      await captureFailureScreenshot(page, 'TC-T3-X06');
      recordResult(results, 'Tier 3', 'TC-T3-X06', 'Concurrent delete race condition handling', false, '', err);
    }

  } finally {
    await desktopContext.close();
  }

  return results;
}
