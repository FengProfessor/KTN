# 04 — BÁO CÁO KẾT QUẢ KIỂM THỬ TỰ ĐỘNG (TEST RESULTS)

> **Tập lệnh kiểm thử:** [verify_security_and_flow.cjs](file:///d:/Vibe/khongtunhi_sofl_style/verify_security_and_flow.cjs)
> **Môi trường kiểm thử:** Production (`https://khongtunhi.com`)
> **Phiên bản Worker:** `ktn-prod-v2026.11.03` (`fd41f96b-28f8-41a0-82a2-ca8dc4cf0c3e`)
> **Tài khoản E2E cô lập:** `e2e.hs.a@khongtunhi.com` (Lớp `YCT2-04`), `e2e.hs.b@khongtunhi.com` (Lớp `YCT3-02`)
> **Kết quả tổng thể:** **10 / 10 BỘ KIỂM THỬ PASS (`Exit Code: 0`)**

---

## 1. Bảng tổng hợp 10 bộ kiểm thử (Test Suites Summary)

| Bộ kiểm thử | Nội dung kiểm tra | Kết quả |
|---|---|---|
| **TEST 1** | Chặn Token giả mạo, Header `X-KTN-User-Email` giả mạo, JWT 3 phần `eayJ` giả mạo (`401`/`403`) & xác nhận `X-KTN-Worker-Version: ktn-prod-v2026.11.03`. | **PASS** |
| **TEST 2** | Kiểm tra mật khẩu mặc định cũ đã thu hồi trên toàn bộ 9 tài khoản (Admin, Quản lý, Giáo viên A/B, 5 Học sinh) -> Tất cả trả `401`. | **PASS** |
| **TEST 3** | Phân quyền Phòng chat (`/api/ktn/messages`), Buổi học (`/api/ktn/class-sessions`), Bài tập (`/api/ktn/homeworks`), Push Subscribe (`/api/ktn/push/subscribe`), và ẩn `teacher_email` cho khách ở `/api/ktn/classes`. | **PASS** |
| **TEST 4** | Kiểm soát sở hữu bài nộp & S3:<br>- Chặn giả mạo ID học sinh khác (`403`)<br>- Chặn nộp chéo lớp (`403`)<br>- Chặn URL ngoài CloudFront (`400`)<br>- Chặn bài tập chưa giao `lessonNum=901` & `99999` (`400`)<br>- Chặn Học sinh B dùng URL S3 của Học sinh A (`403`)<br>- Chặn URL S3 chưa upload thật (`400`)<br>- Chặn file `.html` và file `60MB` trên `/upload-url` (`400`). | **PASS** |
| **TEST 5** | Luồng S3 Audio Upload thật (`16.044 bytes`, header `RIFF/WAVE`) cho bài đã giao (`201` — Buổi 2 Bài 1):<br>`pending` → chặn Giáo viên B chấm chéo (`403`) → chặn điểm ngoài thang `15, -1, 9.3` (`400`) → Giáo viên A yêu cầu sửa (`revision_requested`) → Học sinh A thu âm mới & nộp lại (`pending`) → Giáo viên A chấm `9.5/10` (`graded`). | **PASS** |
| **TEST 6** | Thu hồi phiên phía máy chủ khi Đăng xuất (`Max-Age=0`, `401` khi dùng lại Bearer token) & Kiểm thử **Đăng xuất đồng thời (`Promise.all`)** không xảy ra race condition (`status1: 401, status2: 401`). | **PASS** |
| **TEST 7** | Đồng bộ toàn bộ **1.046/1.046 học sinh** từ izTeach sang Supabase (`createdCount: 0, updatedCount: 0, unchangedCount: 1046, failedCount: 0, idempotent: true`) & Nộp bài khóa học video trực tuyến Bài 1, Bài 2 (`200 OK`). | **PASS** |
| **TEST 8** | Chặn thông báo cho khách (`401`), `0` thông báo tự sinh (`"Đã đến giờ học."` / `"Cần nộp bài tập."`), chặn `testMode` cho khách (`403`), cho phép `testMode` cho Admin (`200`), và chặn SĐT sai định dạng trên `/leads` & `/orders` (`400`). | **PASS** |
| **TEST 9** | **Puppeteer Real Browser E2E:**<br>- Khách mở `/` và `/custom-page/so-lien-lac-test`: sạch 100% (`notifCount: 0`, `hasSocialProof: false`).<br>- Học sinh A đăng nhập, thu âm thật bằng `MediaRecorder` cho Bài 1, chọn ảnh `.png` qua `<input type="file">` cho Bài 2, nộp bài và reload giữ nguyên trạng thái.<br>- Giáo viên A mở `/sll-teacher.html` chấm `9.5/10` trực tiếp trên giao diện.<br>- Học sinh A reload thấy `9.5/10`, nhận đúng 1 thông báo `"Cô giáo vừa nhận xét."`, đánh dấu đã đọc và reload giữ nguyên `unreadCount: 0`.<br>- Học sinh B không thấy bài nộp hay thông báo của Học sinh A (`leakedHw: false, leakedNotif: false`). | **PASS** |
| **TEST 10** | **Mobile Viewport Matrix & Multi-Tab Logout Sync:**<br>- Kiểm tra 6 kích thước màn hình (`360x800`, `375x812`, `390x844`, `430x932`, `768x1024`, `1280x800`) đều có `overflowPx = 0`.<br>- Đăng xuất ở Tab 1 tự động xóa sạch phiên ở Tab 2 (`hasPersistentAuth: false, hasLocalHw: false`).<br>- Dọn sạch dữ liệu kiểm thử (`Remaining E2E test rows in ktn_homeworks: 0`). | **PASS** |

---

## 2. Nhật ký thực thi chi tiết (Raw Execution Log)

```text
Target Base URL: https://khongtunhi.com | Git Commit: ece1873
Isolated E2E Accounts: StudentA=e2e.hs.a@khongtunhi.com (YCT2-04) | StudentB=e2e.hs.b@khongtunhi.com (YCT3-02)

=== [TEST 1] Forged Token + Admin Email Header Must Return 401 & Verify Worker Version ===
GET /api/ktn/auth/session with forged token + admin email -> status: 401 | Worker Version: ktn-prod-v2026.11.03
GET /api/ktn/auth/session with forged 3-part eayJ admin JWT -> status: 401
GET /api/ktn/orders with forged token + admin email -> status: 403

=== [TEST 2] Revoked Legacy Password Must Return 401 Across Admin, Teachers & Students ===
POST /api/ktn/auth/login (hocvienkhongtunhi123@gmail.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (quanly@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (linh.lam@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (thu.ha@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (hoangngan@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (dachanh@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (minhkhang@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (e2e.hs.a@khongtunhi.com + revoked legacy password) -> status: 401
POST /api/ktn/auth/login (e2e.hs.b@khongtunhi.com + revoked legacy password) -> status: 401

=== [TEST 3] Class & Chat Room Authorization (Messages, Class-Sessions, Homeworks, Push Subscribe) ===
Student A (e2e.hs.a@khongtunhi.com - YCT2-04) login OK | No raw izteachAccessToken leaked
Student B (e2e.hs.b@khongtunhi.com - YCT3-02) login OK
Teacher A (Cô Linh - YCT2-04) login OK -> role: teacher
Teacher B (Cô Hà - YCT3-02) login OK -> role: teacher
Student A GET /api/ktn/messages (no roomId) -> status: 400
Student A (YCT2-04) GET /api/ktn/messages?roomId=YCT3-02 -> status: 403
Student A (YCT2-04) POST /api/ktn/messages (roomId=YCT3-02) -> status: 403
Teacher B (YCT3-02) GET /api/ktn/messages?roomId=YCT2-04 -> status: 403
Student A (YCT2-04) GET /api/ktn/messages?roomId=YCT2-04 -> status: 200
Unauthenticated GET /api/ktn/class-sessions -> status: 401
Student A (YCT2-04) GET /api/ktn/class-sessions?classCode=YCT3-02 -> status: 403
Teacher B GET /api/ktn/homeworks?classCode=YCT2-04 -> status: 403
Teacher B GET /api/ktn/class-sessions?classCode=YCT2-04 -> status: 403
Unauthenticated POST /api/ktn/push/subscribe -> status: 401
Guest GET /api/ktn/classes -> status: 200 | leakedTeacherEmail: false

=== [TEST 4] Homework Ownership, Class Enrollment, fileUrl Domain & Score Validation Guards ===
S3 PUT recording #1 status: 200 | bytes: 16044
Student A POST /api/ktn/homeworks with Student B ID -> status: 403
Student A POST /api/ktn/homeworks with Class YCT3-02 -> status: 403
Student A POST /api/ktn/homeworks with external fileUrl -> status: 400
Student A POST /api/ktn/homeworks with unassigned/invalid lessonNum 99999 -> status: 400
Student A POST /api/ktn/homeworks with unassigned/invalid lessonNum 901 -> status: 400
Student B POST /api/ktn/homeworks referencing Student A S3 fileUrl -> status: 403
Student A POST /api/ktn/homeworks with unuploaded S3 fileUrl -> status: 400
Student A POST /api/ktn/homeworks/upload-url with .html extension -> status: 400
Student A POST /api/ktn/homeworks/upload-url with 60MB fileSize -> status: 400

=== [TEST 5] Real S3 Audio Upload + Assigned Exercise (201) Flow + Score Range Check + CloudFront Playback ===
Step 5.1a: Server derived canonical ID -> HW-e2e.hs.a@khongtunhi.com-CLASS_YCT2-04-L201 | status: pending
Step 5.1b: Teacher A fetched audio #1 from CloudFront -> status: 200 | bytes: 16044 | header: RIFF/WAVE
Step 5.2a: Teacher B PATCH /api/ktn/homeworks/grade on Class A homework -> status: 403
Step 5.2b: Teacher A PATCH /api/ktn/homeworks/grade with invalid score=15 -> status: 400
Step 5.2b: Teacher A PATCH /api/ktn/homeworks/grade with invalid score=-1 -> status: 400
Step 5.2b: Teacher A PATCH /api/ktn/homeworks/grade with invalid score=9.3 -> status: 400
Step 5.3: Teacher A requested revision -> status in Supabase: revision_requested
Step 5.4: Student A resubmitted recording #2 -> status reset to: pending
Step 5.5: Teacher A graded resubmission -> status: graded score: 9.5
Cleanup DELETE test row status: 204

=== [TEST 6] Server-Side Session Revocation on Logout + Unified Client Logout ===
GET /api/ktn/auth/session BEFORE logout -> status: 200
POST /api/ktn/auth/logout -> status: 200 | revoked: true | Set-Cookie: ktn_webapp_token=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax
GET /api/ktn/auth/session AFTER logout with revoked Bearer token -> status: 401
Concurrent Logout Revocation Check -> status1: 401 | status2: 401

=== [TEST 7] Full Student Bulk Sync (Unbounded Pagination + Real Diff Idempotency) + Online Course Homework ===
Admin login OK -> role: admin
POST /api/ktn/students/sync-all (Run #1) -> {"ok":true,"izteachTotal":1046,"supabaseBefore":1046,"syncedCount":1046,"createdCount":0,"updatedCount":0,"unchangedCount":1046,"skippedCount":0,"skippedReasons":[],"failedCount":0,"withOnlineCoursesCount":932,"withLiveClassCount":8,"idempotent":true}
POST /api/ktn/students/sync-all (Run #2 Idempotency Check) -> {"ok":true,"izteachTotal":1046,"supabaseBefore":1046,"syncedCount":1046,"createdCount":0,"updatedCount":0,"unchangedCount":1046,"skippedCount":0,"skippedReasons":[],"failedCount":0,"withOnlineCoursesCount":932,"withLiveClassCount":8,"idempotent":true}
Online Course Homework Submit (Lesson 1) -> status: 200 | id: HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1
Online Course Homework Submit (Lesson 2) -> status: 200 | id: HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L2

=== [TEST 8] Zero Synthetic Notifications ("Đã đến giờ học." / "Cần nộp bài tập.") & Admin-Only Lead TestMode ===
Unauthenticated GET /api/ktn/notifications -> status: 401
Student A GET /api/ktn/notifications -> status: 200 | count: 0 | forbiddenSynthetic: 0
Unauthenticated POST /api/ktn/leads (testMode=true) -> status: 403
Admin POST /api/ktn/leads (testMode=true) -> status: 200 | body: {"ok":true,"testMode":true,"lead":{"name":"Admin Kiểm thử E2E","phone":"0988974685","courseLabel":"Tiểu học (7–11t)","createdAt":"2026-11-03T12:36:22.763Z"}}
Invalid Phone Validation -> leads status: 400 | orders status: 400

=== [TEST 9] Real Browser (Puppeteer) E2E: Fake MediaStream Mic Recording + <input type=file> Upload + Teacher UI Grading ===
Step 9.1a: Guest Homepage UI Audit -> {"hasSocialProof":false,"hasPushBanner":false,"hasToast":false,"hasOpenDrawer":false,"usesLeadApi":true}
Step 9.1b: Guest SLL Redirect & Notification Audit -> {"url":"https://khongtunhi.com/","hasPushBanner":false,"hasToast":false,"notifCount":0}
Step 9.2a: Real getUserMedia + MediaRecorder recorded audio in browser for Bài 1.
Step 9.2b: Real <input type="file"> uploaded PNG image in browser for Bài 2.
Step 9.2c: Browser Submit Bài 1 & Bài 2 both transitioned to "Cô đã nhận bài của con · Chờ cô chấm".
Step 9.3: Student Browser Reloaded -> Both Bài 1 & Bài 2 persisted "Chờ cô chấm".
Step 9.4a: Teacher A graded Student A Bài 1 directly on /sll-teacher.html UI -> "Đã hoàn thành · 9.5/10".
Step 9.4b: Student Browser Reload after Teacher UI Grade -> 9.5đ rendered | Notifications: {"ok":true,"count":1,"hasDuplicates":false,"hasGradedNotif":true,"hasSyntheticApi":false,"hasSyntheticUi":false,"titles":["Cô giáo vừa nhận xét."]}
Step 9.4c: Notification Read-State Persistence Across Reload -> {"totalVisible":0,"unreadCount":0}
Step 9.5: Cross-Student Isolation (e2e.hs.b@khongtunhi.com vs e2e.hs.a@khongtunhi.com) -> leakedHw: false | leakedNotif: false

=== [TEST 10] Mobile Viewport Matrix (360x800..1280x800) & Multi-Tab Logout Sync ===
Viewport Android Compact 360x800 -> innerWidth=360, scrollWidth=360, overflowPx=0
Viewport iPhone SE/Mini 375x812 -> innerWidth=375, scrollWidth=375, overflowPx=0
Viewport iPhone 13/14 390x844 -> innerWidth=390, scrollWidth=390, overflowPx=0
Viewport iPhone Pro Max 430x932 -> innerWidth=430, scrollWidth=430, overflowPx=0
Viewport iPad Portrait 768x1024 -> innerWidth=768, scrollWidth=768, overflowPx=0
Viewport Desktop 1280x800 -> innerWidth=1280, scrollWidth=1280, overflowPx=0
Step 10.2: Multi-Tab Logout Sync -> Tab 2 state after Tab 1 logout: {"hasPersistentAuth":false,"hasLocalHw":false}
Step 10.3: Isolated E2E Cleanup Complete -> Remaining E2E test rows in ktn_homeworks: 0

ALL 10 SECURITY, CONCURRENCY, S3-OWNERSHIP, BULK-SYNC, VIEWPORT & BROWSER E2E TESTS PASSED!
```
