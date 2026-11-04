# 01 — EXECUTIVE SUMMARY (KTN THREE-WAY SYNC, SECURITY & PRODUCTION RELIABILITY)

> **Dự án:** Học Viện Khổng Tử Nhí — Sổ Liên Lạc Điện Tử (`https://khongtunhi.com`)
> **Repository:** `https://github.com/FengProfessor/KTN` (`main`)
> **Baseline đối chiếu:** `9327c241cc80651e15e77bdf385eaa7812b7d3c1`
> **Mục tiêu đợt kiểm toán & khắc phục:** **DATA INTEGRITY + AUTHORIZATION + RELIABLE SYNCHRONIZATION + E2E VERIFICATION** (Không triển khai UI V2; không chạy kiểm thử phá hủy trên production).

---

## 1. Tổng quan kết quả thực hiện

Đợt kiểm toán và nâng cấp độ tin cậy đồng bộ ba chiều (**Sổ Liên Lạc Web App ↔ Cloudflare Worker + Supabase ↔ izTeach AWS**) đã hoàn tất toàn bộ 10 Phase theo đúng quy trình `INSPECT → REPRODUCE → ROOT CAUSE → FIX → TEST → REVIEW → REPORT`.

| Hạng mục trọng tâm | Trạng thái | Kết quả đạt được |
|---|---|---|
| **1. Đồng bộ Bài nộp & Điểm số (Homework & Grade Sync)** | **PASS (Verified)** | Loại bỏ hoàn toàn fallback `DEFAULT_COURSE_ID` (`HSK1`) và `HSK1_UNIT_MAP`. Nhúng bảng ánh xạ chính xác `COURSE_UNIT_MAP` cho toàn bộ **17 khóa / 346 bài học** (`unitId` 24-hex duy nhất). Bài tập lớp trực tiếp (`CLASS_*`) gắn trạng thái `not_applicable_live_class` và tuyệt đối không ghi nhầm sang HSK1 trên izTeach. |
| **2. Chống gửi trùng & Lưu lịch sử nộp lại (Idempotency & Versioning)** | **PASS (Verified)** | Hỗ trợ chống bấm đúp (`idempotentReplay: true`) cho cả luồng Học sinh nộp bài (`POST /api/ktn/homeworks`) và Giáo viên chấm điểm (`PATCH /api/ktn/homeworks/grade`). Lưu vết lịch sử các lần nộp/chấm trước trong `workbook_answers._history` và trạng thái đồng bộ chi tiết trong `workbook_answers._syncMeta`. |
| **3. Đồng bộ Quyền học 3 chiều (Entitlement Grant & Revoke)** | **PASS (Verified)** | Không bao giờ coi `skipped: true` hoặc lỗi HTTP upstream là thu hồi/cấp quyền thành công. Bổ sung **Read-After-Write Verification** đối chiếu trực tiếp `GET /prod/user-permission` trên izTeach sau mỗi thao tác cấp/thu hồi, đồng thời xử lý chuẩn cả hai định dạng mảng `[{ onlineCourses }]` và object `{ onlineCourses }`. |
| **4. Khắc phục lỗi hiển thị sai lớp & khóa học của `taphong2002@gmail.com`** | **PASS (Verified)** | Xóa bỏ `classCode: 'YCT2-04'` bị gán cứng trong `BUILTIN_STUDENT_PROFILES` và sửa `normalizePortalUser` / `syncLiveStudentProfile` / `checkUserCourseAccess` để tôn trọng dữ liệu máy chủ (`_serverSynced: true`), giúp tài khoản `taphong2002@gmail.com` không còn hiện nhầm thẻ `Lớp YCT2-04` (nguyên nhân gây lỗi 403 khi nộp bài lớp YCT2-04) và bấm vào học mượt mà khóa ở giữa (`Chinese For Kids` / `HSK1 3.0`). |
| **5. Phân quyền API & Thu hồi phiên đăng xuất (RBAC & Session Revocation)** | **PASS (Verified)** | Khóa chặt `GET /api/ktn/courses/units` theo quyền sở hữu khóa học; chặn Giáo viên tự tạo lớp, đổi giáo viên chủ nhiệm hoặc tự cấp/thu hồi khóa học video; sửa lỗi race condition của `BroadcastChannel` trong `KtnWebApp.logout()` khiến trình duyệt chuyển trang trước khi kịp gọi `/api/ktn/auth/logout`; áp dụng cơ chế **fail-closed** khi kiểm tra token đã thu hồi. |
| **6. Chat theo lớp & Lưu trạng thái đã đọc Thông báo** | **PASS (Verified)** | Cô lập phòng chat theo đúng lớp (`class:<CODE>`), hỗ trợ cả `?classCode=` và `?roomId=`, bổ sung lưu trạng thái `read: true` bền vững trên Supabase (`PATCH /api/ktn/notifications/read`) để không tái hiện thông báo chưa đọc sau khi tải lại trang. |
| **7. Kiểm toán 17 Khóa học / 346 Bài giảng** | **PASS (Verified)** | 17/17 khóa học (346/346 bài giảng) có `unitId` 24-hex hợp lệ và duy nhất, 100% bài học có luồng video HLS `.m3u8`, 0 bài tập tự chế sai giáo trình. |
| **8. Bộ kiểm thử tự động (Groups A, B, C, D) & CI Gate** | **PASS (31/31 Tests)** | **26/26** bài kiểm thử Unit/Integration/Failure-Injection/3-Role (`tests/ktn_three_way_reliability_suite.cjs`) và **5/5** bài kiểm thử trình duyệt thật Headless Chromium (`tests/ktn_browser_e2e_local.cjs`) đạt **100% PASS**. Thiết lập `.github/workflows/ci-quality-gate.yml`. |

---

## 2. Giải thích trực tiếp 2 lỗi người dùng phản ánh bằng ảnh chụp màn hình

1. **Lỗi 1 (`media_1793712358433_147df2cc.png`): Tài khoản `taphong2002@gmail.com` hiện thẻ `Lớp YCT2-04` và không bấm vào được khóa học ở giữa:**
   - **Nguyên nhân gốc:** Trong `portal_template.html`, `BUILTIN_STUDENT_PROFILES['taphong2002@gmail.com']` bị gán cứng `classCode: 'YCT2-04'` và chỉ có 1 khóa `HSK1`. Ngoài ra, `normalizePortalUser()` ưu tiên đọc `BUILTIN_STUDENT_PROFILES` trước dữ liệu thực từ máy chủ.
   - **Khắc phục:** Đặt `class_code: null` cho `taphong2002@gmail.com`, cập nhật `normalizePortalUser()`, `syncLiveStudentProfile()`, `getLocalEnrolledCourseIds()` và `checkUserCourseAccess()` để đồng bộ chính xác danh sách khóa học từ `/api/ktn/students/me` và `/api/ktn/courses/my`, đồng thời gắn cờ `_serverSynced: true`.

2. **Lỗi 2 (`media_1793712415901_94f6a22f.png`): Thông báo đỏ `"Chưa gửi được bài lên máy chủ. Bài thu âm/tệp của con vẫn được giữ nguyên — con bấm Gửi lại nhé"` khi `taphong2002@gmail.com` nộp bài trong `Buổi 1 - Lớp YCT2-04`:**
   - **Nguyên nhân gốc:** Trên cơ sở dữ liệu Supabase (`ktn_students`), `taphong2002@gmail.com` có `class_code = null` (không thuộc lớp `YCT2-04`). Do giao diện cũ hiển thị nhầm thẻ `Lớp YCT2-04`, khi người dùng bấm thu âm và nộp bài vào `YCT2-04`, Cloudflare Worker kiểm tra phân quyền lớp học và từ chối với mã `403 Forbidden` (`Học viên thuộc lớp khác nên không được nộp bài vào lớp YCT2-04`), dẫn tới thông báo lỗi đỏ trên màn hình.
   - **Khắc phục:** Khi `syncLiveStudentProfile()` đồng bộ đúng `class_code: null` từ máy chủ, thẻ `Lớp YCT2-04` không còn hiển thị sai cho `taphong2002@gmail.com`; đồng thời với học sinh thực sự thuộc lớp `YCT2-04` (đã kiểm chứng bằng kịch bản E2E `B4`), luồng thu âm → tải tệp S3 → nộp bài → cô giáo chấm điểm `9.5/10` → học sinh xem điểm hoạt động thông suốt 100%.
