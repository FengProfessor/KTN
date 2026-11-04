# 03 — BUG AUDIT (INSPECT → REPRODUCE → ROOT CAUSE → FIX → VERIFY)

> **Mục đích:** Danh mục toàn bộ các lỗi chức năng, đồng bộ dữ liệu và phân quyền được phát hiện qua kiểm toán mã nguồn và kiểm thử tự động, kèm bước tái hiện, nguyên nhân gốc, giải pháp khắc phục và bằng chứng kiểm thử.

---

## BUG-01: Ghép sai bài tập lớp trực tiếp (`CLASS_*`) và các khóa ngoài HSK1 vào khóa/bài `HSK1` trên izTeach

- **Mức độ ảnh hưởng:** **CRITICAL (Làm bẩn dữ liệu khóa học trên izTeach)**
- **Mô tả:** Khi học sinh nộp bài tập buổi học trên lớp (`CLASS_YCT2-04`) hoặc nộp bài thuộc một trong 16 khóa học video khác (như `Chinese For Kids` `65e7704a9ea90c00080d5195`), hàm `mirrorHomeworkToIzTeach()` trong `cloudflare-worker-sw-proxy.js` tự động fallback `courseId` về `DEFAULT_COURSE_ID` (`6adadba969897b0002482ca5` — HSK1) và tra cứu `unitId` trong `HSK1_UNIT_MAP` (hoặc lấy `HSK1_UNIT_MAP[1]` khi `lessonNum = 101`).
- **Bước tái hiện:**
  1. Học sinh lớp `YCT2-04` nộp bài tập Buổi 1 (`courseId = 'CLASS_YCT2-04'`, `lessonNum = 101`).
  2. Hoặc học sinh khóa `Chinese For Kids` nộp Bài 3 (`courseId = '65e7704a9ea90c00080d5195'`, `lessonNum = 3`).
  3. Kiểm tra payload gửi tới `POST /prod/homework` trên izTeach.
- **Nguyên nhân gốc:** `mirrorHomeworkToIzTeach()` chỉ có `HSK1_UNIT_MAP` (15 bài) và dòng lệnh `const courseId = /^[0-9a-f]{24}$/i.test(rawCourse) ? rawCourse : DEFAULT_COURSE_ID;` kết hợp với `HSK1_UNIT_MAP[lessonNum] || HSK1_UNIT_MAP[1]`.
- **Thay đổi thực hiện:**
  - Nhúng toàn bộ `COURSE_UNIT_MAP` (17 khóa học, 346 bài học) và `UNIT_TO_COURSE_MAP` vào `cloudflare-worker-sw-proxy.js`.
  - Xây dựng hàm `resolveCourseUnitId(courseId, lessonNum, explicitUnitId)`:
    - Nếu `courseId` bắt đầu bằng `CLASS_` hoặc có `classCode` mà không thuộc khóa học 24-hex: trả về `{ valid: false, isLiveClass: true, reason: 'not_applicable_live_class' }` → lưu Supabase bình thường nhưng **không** gọi `POST /prod/homework` sang izTeach.
    - Nếu `explicitUnitId` thuộc khóa học khác với `courseId`: từ chối ngay với `400 UNIT_COURSE_MISMATCH`.
    - Nếu `lessonNum` không tồn tại trong `COURSE_UNIT_MAP[courseId]`: gắn `syncStatus = 'mapping_required'` và tuyệt đối không đoán mò về Bài 1 hay HSK1.
- **Kết quả Trước & Sau:**
  - **Trước:** Bài tập `CLASS_YCT2-04` và `CFK1` bị đẩy nhầm vào `HSK1` trên izTeach.
  - **Sau:** `CLASS_YCT2-04` có `syncStatus = 'not_applicable_live_class'` (0 request sang izTeach); `CFK1` Bài 3 ánh xạ chính xác tới `unitId = 663e2cb6d87762000820b409`.
- **Bằng chứng kiểm thử:** `PASS` tại `A2-LIVE-CLASS-NO-HSK1-LEAK`, `A2-CFK-EXACT-UNIT-MAPPING`, `A2-BLOCK-CROSS-COURSE-UNIT-MISMATCH`, `A2-UNMAPPED-LESSON-NO-FALLBACK`.

---

## BUG-02: Tài khoản `taphong2002@gmail.com` hiện nhầm `Lớp YCT2-04`, lỗi khi nộp bài lớp YCT2-04 và không bấm vào được khóa học ở giữa

- **Mức độ ảnh hưởng:** **HIGH (Trải nghiệm người dùng & Sai lệch hiển thị quyền học)**
- **Mô tả:** Như người dùng phản ánh trong 2 ảnh chụp màn hình (`media_1793712358433_147df2cc.png` và `media_1793712415901_94f6a22f.png`), khi đăng nhập bằng `taphong2002@gmail.com`, màn hình hiện thẻ `Lớp YCT2-04` (dù tài khoản này không thuộc lớp `YCT2-04`), bấm vào khóa ở giữa bị vướng kiểm tra quyền, và khi thử thu âm nộp bài trong `Lớp YCT2-04` thì báo lỗi đỏ `"Chưa gửi được bài lên máy chủ"`.
- **Bước tái hiện:**
  1. Đăng nhập tài khoản `taphong2002@gmail.com` trên cổng học sinh `sll-hocsinh.html`.
  2. Quan sát kệ khóa học hiện thẻ `Lớp YCT2-04` và thử bấm nộp bài tập Buổi 1 của `Lớp YCT2-04`.
- **Nguyên nhân gốc:**
  1. Trong `portal_template.html`, `BUILTIN_STUDENT_PROFILES['taphong2002@gmail.com']` bị gán cứng `classCode: 'YCT2-04'` và `enrolledCourseIds: ['6adadba969897b0002482ca5']`.
  2. `normalizePortalUser()` ghi đè dữ liệu người dùng bằng `BUILTIN_STUDENT_PROFILES` ngay cả khi máy chủ đã trả về `class_code: null`.
  3. Khi `taphong2002@gmail.com` bấm nộp bài trong `Lớp YCT2-04`, Worker kiểm tra `ktn_students` thấy `class_code = null` nên trả về `403 Forbidden`, làm giao diện hiện thông báo lỗi đỏ.
- **Thay đổi thực hiện:**
  - Cập nhật `BUILTIN_STUDENT_PROFILES['taphong2002@gmail.com']` trong `portal_template.html` với `class_code: null` và danh sách khóa học thực tế (`HSK1 3.0`, `Chinese For Kids`).
  - Sửa `normalizePortalUser()`, `syncLiveStudentProfile()`, `getLocalEnrolledCourseIds()`, `checkUserCourseAccess()` để khi máy chủ phản hồi (`/api/ktn/students/me`), cờ `_serverSynced: true` được thiết lập và xóa sạch mọi `classCode` hoặc `onlineCourses` cũ trong `localStorage`.
  - Biên dịch lại `sll-hocsinh.html` và `demo_hsk1_student_portal.html` qua `node build_clean_real_portal.js`.
- **Kết quả Trước & Sau:**
  - **Trước:** `taphong2002@gmail.com` hiện `Lớp YCT2-04` giả và bị lỗi 403 khi nộp bài trong lớp đó; khóa học ở giữa không đồng bộ quyền đầy đủ.
  - **Sau:** `taphong2002@gmail.com` có `classCode = null` (không hiện thẻ `Lớp YCT2-04`), hiển thị và bấm vào học ngay được cả `HSK1 3.0` và `Chinese For Kids`.
- **Bằng chứng kiểm thử:** `PASS` tại `B1-TAPHON-NO-FALSE-CLASS-AND-COURSE-CLICKABLE` và `B3-COURSE-REVOKE-REFLECTED-ON-RELOAD`.

---

## BUG-03: Thu hồi khóa học (`revoke`) coi `skipped: true` hoặc thiếu xác minh Read-After-Write là thành công

- **Mức độ ảnh hưởng:** **CRITICAL (Lệch quyền học giữa izTeach và Supabase)**
- **Mô tả:** Khi Quản lý thu hồi khóa học của học viên (`POST /api/ktn/students/courses` với `action: 'revoke'`), nếu học viên chưa có `cognitoUserId` hoặc API `PUT /prod/user-permission/remove-products/:uid` không thực sự gỡ khóa học trên izTeach, mã cũ vẫn tiếp tục xóa khóa học trong Supabase và trả về `200 OK`. Ngoài ra, API `GET /prod/user-permission` trên izTeach có thể trả về mảng `[{ onlineCourses: [...] }]` nhưng Worker chỉ kiểm tra `Array.isArray(permData?.onlineCourses)` dẫn tới bỏ sót kiểm tra.
- **Bước tái hiện:**
  1. Gọi `POST /api/ktn/students/courses` (`action: 'revoke'`) cho học viên chưa liên kết Cognito UID hoặc khi izTeach vẫn giữ nguyên khóa học sau lệnh `remove-products`.
- **Nguyên nhân gốc:**
  - `revokeStudentCoursesOnIzTeach()` trả về `{ ok: true, skipped: true }` khi không tìm thấy `cognitoUserId`.
  - Thiếu bước đọc lại (`GET /prod/user-permission`) sau khi gọi `add-products` / `remove-products` và chưa hỗ trợ cấu trúc mảng `[{ onlineCourses }]` từ izTeach.
- **Thay đổi thực hiện:**
  - Bổ sung helper `extractIzTeachOnlineCourseIds(permData)` hỗ trợ cả cấu trúc mảng và object từ `/prod/user-permission`.
  - Trong `revokeStudentCoursesOnIzTeach()` và `provisionStudentOnIzTeach()`, bổ sung bước **Read-After-Write Verification**: gọi `GET /prod/user-permission` ngay sau khi cập nhật để xác nhận khóa học đã thực sự được thêm hoặc gỡ bỏ.
  - Trong `POST /api/ktn/students/courses`, nếu `!izteachRevokeResult.ok || izteachRevokeResult.skipped`, trả về `502 Bad Gateway` (`syncStatus: 'sync_failed'`) và **không** cập nhật Supabase để tránh lệch dữ liệu.
  - Trên giao diện Quản lý (`so-lien-lac-ux.js`), hoàn tác (rollback) trạng thái nút gạt nếu máy chủ trả lỗi.
- **Kết quả Trước & Sau:**
  - **Trước:** Supabase bị xóa khóa học dù trên izTeach học viên vẫn còn quyền học.
  - **Sau:** Chỉ khi izTeach xác nhận đã gỡ quyền qua Read-After-Write Verification thì Supabase mới cập nhật; nếu lỗi trả về `502` và giữ nguyên trạng thái nhất quán.
- **Bằng chứng kiểm thử:** `PASS` tại `A4-COURSE-GRANT-THREE-WAY`, `A4-COURSE-REVOKE-THREE-WAY`, `A4-NO-SKIPPED-TRUE-FALSE-SUCCESS`, `C3-IZTEACH-FAILURE-OR-VERIFY-MISMATCH-BLOCKS-SUPABASE-MUTATION`, `C4-PARTIAL-FAILURE-SUPABASE-DOWN-AFTER-IZTEACH`.

---

## BUG-04: Bấm đúp nộp bài / chấm bài tạo bản ghi trùng trên izTeach và nộp lại làm mất lịch sử điểm cũ

- **Mức độ ảnh hưởng:** **HIGH (Toàn vẹn dữ liệu bài tập & điểm số)**
- **Mô tả:** Khi học sinh bấm đúp nút "Nộp bài" hoặc giáo viên bấm đúp nút "Lưu điểm", Worker gửi lặp nhiều request `POST /prod/homework` sang izTeach. Khi học sinh nộp lại bài đã được cô chấm trước đó, điểm và nhận xét của lần chấm thứ nhất bị ghi đè mất dấu vết, hoặc giao diện Giáo viên (`so-lien-lac-lms.js`) vẫn ưu tiên hiển thị bản ghi `GRADED` cũ thay vì bài `PENDING` mới nộp lại.
- **Thay đổi thực hiện:**
  - Bổ sung kiểm tra Idempotency trong `POST /api/ktn/homeworks` và `PATCH /api/ktn/homeworks/grade`: nếu cùng payload được gửi lại khi đã đồng bộ, trả về ngay `{ ok: true, idempotent: true, idempotentReplay: true }` mà không tạo bản ghi mới trên izTeach.
  - Lưu trữ lịch sử các phiên bản trước vào mảng `workbook_answers._history` (`submission_superseded`, `grade_superseded`) và theo dõi `version`, `submissionCount`, `syncStatus` trong `workbook_answers._syncMeta`.
  - Sửa logic gộp bài tập trong `so-lien-lac-lms.js` và `loadStudentContactBook()` trong `portal_template.html` để so sánh theo thời gian cập nhật (`updatedAtMs`), đảm bảo khi học sinh nộp lại bài mới (`PENDING`), giáo viên thấy ngay trạng thái cần chấm lại và khi cô chấm xong, học sinh thấy ngay điểm mới trên cả thẻ buổi học lẫn danh sách bài nộp.
- **Bằng chứng kiểm thử:** `PASS` tại `A3-SUBMIT-IDEMPOTENCY`, `A3-TEACHER-GRADE-SYNC`, `A3-GRADE-IDEMPOTENCY`, `A3-RESUBMIT-VERSION-HISTORY`, `B4-STUDENT-SUBMIT-AND-TEACHER-GRADE-E2E-UI`.

---

## BUG-05: Race condition của `BroadcastChannel` khi đăng xuất (`KtnWebApp.logout`) làm hủy sớm request thu hồi token `/api/ktn/auth/logout`

- **Mức độ ảnh hưởng:** **HIGH (Bảo mật phiên đăng nhập trên trình duyệt thực tế)**
- **Mô tả:** Phát hiện bởi kịch bản kiểm thử trình duyệt thật Headless Chromium (`B5`): trong `ktn-webapp-client.js`, hàm `KtnWebApp.logout()` tạo một instance thứ hai `new BroadcastChannel('ktn_auth_bus')` và gọi `bc.postMessage({ type: 'LOGOUT' })` **trước khi** gọi `fetch('/api/ktn/auth/logout')`. Theo chuẩn HTML5, hai instance `BroadcastChannel` cùng tên trong cùng một tab sẽ nhận được message của nhau, khiến listener `bc.onmessage` ở cuối file `ktn-webapp-client.js` chạy `window.location.replace('/?login=1')` ngay lập tức khi `clearSessionFromIdb()` đang chờ — làm hủy request `POST /api/ktn/auth/logout` trước khi gửi lên máy chủ!
- **Thay đổi thực hiện:**
  - Trong `ktn-webapp-client.js`, chuyển khối phát tín hiệu `BroadcastChannel('ktn_auth_bus')` xuống **sau khi** `await fetch(this.getApiBase() + '/api/ktn/auth/logout')` đã hoàn tất.
  - Bổ sung điều kiện `if (window.__ktnAllowLogout) return;` trong `bc.onmessage` để tab đang chủ động thực hiện đăng xuất không tự ngắt luồng của chính nó trước khi thu hồi token xong.
- **Bằng chứng kiểm thử:** `PASS` tại `B5-LOGOUT-REVOKES-TOKEN-AND-CLEARS-BROWSER-STORAGE` (trên Chromium thật) và `A5-LOGOUT-TOKEN-REVOCATION`, `C5-LOGOUT-PERSIST-FAILURE-AND-REVOCATION-FAIL-CLOSED`.

---

## BUG-06: Lệch tên trường `assignments` vs `exercises` trong Buổi học trên lớp và Trạng thái đã đọc Thông báo bị mất khi tải lại trang

- **Mức độ ảnh hưởng:** **MEDIUM (Đồng bộ giao diện Giáo viên ↔ Học sinh)**
- **Mô tả:**
  1. Giao diện Giáo viên (`so-lien-lac-ux.js`) gửi danh sách bài tập buổi học trong trường `assignments` hoặc `exercises`, trong khi Cổng Học sinh (`portal_template.html`) đọc `exercises`.
  2. Trạng thái đã đọc thông báo (`read: true`) trước đây chỉ lưu trong `localStorage` của trình duyệt nên khi tải lại hoặc mở trên thiết bị khác, thông báo cũ lại hiện số đỏ chưa đọc.
- **Thay đổi thực hiện:**
  - Chuẩn hóa song song cả `exercises` và `assignments` trong `POST /api/ktn/class-sessions`, `GET /api/ktn/class-sessions` (`cloudflare-worker-sw-proxy.js`) và `syncClassSessionToServer()` (`so-lien-lac-ux.js`).
  - Bổ sung kiểm tra `read_by` / `is_read` trong `GET /api/ktn/notifications` và endpoint `PATCH /api/ktn/notifications/read` lưu bền vững trạng thái đã đọc vào bảng `ktn_notifications` trên Supabase.
- **Bằng chứng kiểm thử:** `PASS` tại `D1-CLASS-SESSION-SCHEMA-AND-ISOLATION`, `D2-CLASS-CHAT-RBAC-ISOLATION`, `D3-NOTIFICATION-READ-PERSISTENCE`.
