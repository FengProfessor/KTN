# 06 — AUTOMATED TEST RESULTS (GROUPS A, B, C, D)

> **Mục đích:** Tổng hợp kết quả thực thi thực tế của toàn bộ các bộ kiểm thử tự động (Unit, Integration, Browser E2E trên Headless Chromium, Failure Injection và 3-Role Flows). Tất cả các bài kiểm thử đều chạy cô lập 100% trên môi trường local/harness, không ghi dữ liệu rác lên production.

---

## 1. Tổng hợp Kết quả Kiểm thử

| Nhóm Kiểm thử | File Script | Số lượng Test | Kết quả | Thời gian chạy |
|---|---|:---:|:---:|:---:|
| **Group A:** Unit, Integration, RBAC & Curriculum Integrity | `tests/ktn_three_way_reliability_suite.cjs` | 18 | **18/18 PASS (100%)** | ~1.5s |
| **Group B:** Real Browser E2E (Headless Chromium via Puppeteer) | `tests/ktn_browser_e2e_local.cjs` | 5 | **5/5 PASS (100%)** | ~6.8s |
| **Group C:** Upstream Failure Injection & Partial-Failure Handling | `tests/ktn_three_way_reliability_suite.cjs` | 5 | **5/5 PASS (100%)** | ~0.8s |
| **Group D:** 3-Role E2E Flows, Class Sessions, Chat & Notifications | `tests/ktn_three_way_reliability_suite.cjs` | 3 | **3/3 PASS (100%)** | ~0.5s |
| **Group E:** Pre-Deploy Hardening (Spoofed Mirror Flag, Concurrent Race, Uncatalogued Unit, >25 Bulk Sync) | `tests/ktn_three_way_reliability_suite.cjs` | 4 | **4/4 PASS (100%)** | ~0.7s |
| **Tổng cộng** | | **35** | **35/35 PASS (100%)** | **~10.3s** |

---

## 2. Chi tiết 30 Bài kiểm thử trong `tests/ktn_three_way_reliability_suite.cjs` (Groups A, C, D, E)

Lệnh chạy:
```bash
node tests/ktn_three_way_reliability_suite.cjs
```

| Mã Test | Nhóm | Nội dung kiểm chứng | Bằng chứng đầu ra | Trạng thái |
|---|:---:|---|---|:---:|
| `A1-CURRICULUM-346` | A | 17 khóa / 346 bài học có `unitId` 24-hex duy nhất, 100% HLS `.m3u8`, 0 bài tập tự chế | `courses=17, lessons=346, uniqueUnits=346, fabricated=0` | **PASS** |
| `A2-LIVE-CLASS-NO-HSK1-LEAK` | A | Bài tập lớp trực tiếp (`CLASS_YCT2-04`) lưu Supabase với `not_applicable_live_class` và 0 request sang izTeach | `status=200, syncStatus=not_applicable_live_class, izPostsDelta=0` | **PASS** |
| `A2-CFK-EXACT-UNIT-MAPPING` | A | Bài tập khóa `CFK1` Bài 3 ánh xạ chính xác tới `unitId = 663e2cb6d87762000820b409` trên izTeach | `course=65e7704a9ea90c00080d5195, unit=663e2cb6d87762000820b409` | **PASS** |
| `A2-BLOCK-UNENTITLED-COURSE-SUBMIT` | A | Học sinh chưa được cấp khóa học bị chặn nộp bài vào khóa đó (`403 COURSE_NOT_ENTITLED`) | `status=403, error=COURSE_NOT_ENTITLED` | **PASS** |
| `A2-BLOCK-CROSS-COURSE-UNIT-MISMATCH` | A | Gửi `unitId` của HSK1 kèm `courseId` của CFK1 bị từ chối với `400 UNIT_COURSE_MISMATCH` | `status=400, error=UNIT_COURSE_MISMATCH` | **PASS** |
| `A2-UNMAPPED-LESSON-NO-FALLBACK` | A | Bài học ngoài phạm vi khóa học gắn `syncStatus=mapping_required`, không fallback về Bài 1 | `syncStatus=mapping_required` | **PASS** |
| `A3-SUBMIT-IDEMPOTENCY` | A | Bấm đúp nộp bài trả về `idempotentReplay=true` mà không tạo bản ghi trùng trên izTeach | `idempotentReplay=true` | **PASS** |
| `A3-TEACHER-GRADE-SYNC` | A | Giáo viên chấm điểm cập nhật Supabase và đồng bộ bản ghi `approved` sang đúng `unitId` trên izTeach | `score=9.5, syncStatus=synced` | **PASS** |
| `A3-GRADE-IDEMPOTENCY` | A | Bấm đúp chấm điểm trả về `idempotentReplay=true` mà không gửi trùng sang izTeach | `idempotentReplay=true` | **PASS** |
| `A3-RESUBMIT-VERSION-HISTORY` | A | Học sinh nộp lại bài sau khi đã chấm lưu điểm cũ (`9.5`) vào `_history`, tăng `submissionCount=2` và đặt lại `status=pending` | `status=pending, historyLen=1, prevScore=9.5, submissionCount=2` | **PASS** |
| `A4-COURSE-GRANT-THREE-WAY` | A | Cấp khóa học cập nhật izTeach, xác minh Read-After-Write và cập nhật `online_courses` trên Supabase | `izPerms=["6adadba9...","66028938..."], sbCourses=[...]` | **PASS** |
| `A4-UNITS-ALLOWED-WHEN-ENTITLED` | A | Học sinh đã được cấp quyền gọi `/api/ktn/courses/units` thành công (`200`) | `status=200, units=1` | **PASS** |
| `A4-COURSE-REVOKE-THREE-WAY` | A | Thu hồi khóa học gỡ sản phẩm trên izTeach, xác minh Read-After-Write và xóa khỏi Supabase | `izPerms=["6adadba969897b0002482ca5"], sbCourses=["6adadba969897b0002482ca5"]` | **PASS** |
| `A4-REVOKED-COURSE-IMMEDIATE-ENFORCEMENT` | A | Ngay sau khi thu hồi khóa học, học sinh bị chặn khỏi `/api/ktn/courses/units` (`403`) và `/api/ktn/homeworks` (`403`) | `unitsStatus=403, hwStatus=403` | **PASS** |
| `A4-NO-SKIPPED-TRUE-FALSE-SUCCESS` | A | Thu hồi khóa học của tài khoản chưa có Cognito UID trả về `502 sync_failed` (không bao giờ coi `skipped: true` là thành công) | `status=502, syncStatus=sync_failed` | **PASS** |
| `A5-FORGED-TOKEN-AND-LEGACY-PWD-BLOCKED` | A | Token giả mạo chữ ký và mật khẩu cũ `123456` đều bị chặn với `401` | `forged=401, legacyPwd=401` | **PASS** |
| `A5-TEACHER-RBAC-BOUNDARIES` | A | Giáo viên bị chặn tạo lớp mới, đổi chủ nhiệm lớp, cấp/thu hồi khóa học, chuyển học sinh lớp khác, tạo buổi học lớp khác (`403`) | `createClass=403, changeOwner=403, grantCourse=403, stealStudent=403, crossSession=403` | **PASS** |
| `A5-LOGOUT-TOKEN-REVOCATION` | A | Token đã đăng xuất bị thu hồi bền vững và bị từ chối `401` trên `/auth/session` & `/students/me` | `before=200, logout=200, afterSession=401, afterMe=401` | **PASS** |
| `C1-IZTEACH-DOWN-ON-HOMEWORK-SUBMIT` | C | Khi izTeach `/prod/homework` lỗi `503`, bài nộp vẫn được lưu vào Supabase với `syncStatus=sync_failed`, `mirroredToIzTeach=false` | `status=200, syncStatus=sync_failed, mirrored=false` | **PASS** |
| `C2-IZTEACH-DOWN-ON-TEACHER-GRADE` | C | Khi izTeach `/prod/homework` lỗi `503` lúc chấm bài, điểm vẫn được lưu vào Supabase với `syncStatus=sync_failed` | `status=200, syncStatus=sync_failed, score=8.5` | **PASS** |
| `C3-IZTEACH-FAILURE-OR-VERIFY-MISMATCH-BLOCKS-SUPABASE-MUTATION` | C | Khi `remove-products` lỗi `500` hoặc Read-After-Write phát hiện khóa học vẫn còn trên izTeach, trả về `502` và không sửa Supabase | `http500=502, verifyMismatch=502 (REVOKE_VERIFICATION_MISMATCH)` | **PASS** |
| `C4-PARTIAL-FAILURE-SUPABASE-DOWN-AFTER-IZTEACH` | C | Khi izTeach cấp quyền thành công nhưng Supabase lỗi ghi dữ liệu, trả về `502` kèm `partialFailure=true, syncStatus=partial_failure_supabase` | `status=502, syncStatus=partial_failure_supabase` | **PASS** |
| `C5-LOGOUT-PERSIST-FAILURE-AND-REVOCATION-FAIL-CLOSED` | C | Khi bảng `ktn_dlp_alerts` mất kết nối, logout trả về `503 (revoked: false)` và kiểm tra token áp dụng Fail-Closed (`401`) | `logoutStatus=503, sessionWhenDbDown=401` | **PASS** |
| `D1-CLASS-SESSION-SCHEMA-AND-ISOLATION` | D | Giáo viên giao bài chuẩn hóa cả `exercises[]` và `assignments[]`, học sinh cùng lớp đọc được (`200`), học sinh lớp khác bị chặn (`403`) | `studentA=200, exercises=1, studentB=403` | **PASS** |
| `D2-CLASS-CHAT-RBAC-ISOLATION` | D | Phòng chat lớp `YCT2-04` cho phép học sinh và giáo viên của lớp trao đổi, chặn học sinh lớp B (`403`) và giáo viên lớp B (`403`) | `sendA=200, crossSendB=403, readTeacherA=200, readTeacherB=403` | **PASS** |
| `D3-NOTIFICATION-READ-PERSISTENCE` | D | Đánh dấu đã đọc thông báo lưu bền vững trên Supabase sau khi tải lại trang, 0 thông báo chưa đọc hồi sinh, 0 rò rỉ chéo học sinh | `marked=1, stillUnreadAfterReload=0` | **PASS** |
| `E1-CLIENT-SPOOF-MIRROR-REJECTED` | E | Máy chủ loại bỏ hoàn toàn cờ `mirroredToIzTeach: true` tự khai từ trình duyệt: trả `sync_failed` khi izTeach sập và tự đẩy bản ghi thật lên izTeach khi chưa xác minh được biên nhận | `downSubmitSync=sync_failed, downGradeSync=sync_failed, realPostsAdded=1` | **PASS** |
| `E2-CONCURRENT-SUBMIT-AND-GRADE-DEDUP` | E | Hai yêu cầu nộp bài hoặc chấm điểm đến đồng thời (`Promise.all([req1, req2])`) được khóa in-flight (`runWithHomeworkConcurrencyLock`) và chỉ tạo đúng **1** bản ghi trên izTeach | `submitPostsDelta=1, gradePostsDelta=1` | **PASS** |
| `E3-UNCATALOGUED-UNIT-STRICT-VERIFICATION` | E | Từ chối `unitId` ngoài danh mục trên khóa học đã định nghĩa (`400`) và từ chối `unitId` chưa xác minh trên khóa mới (`400`); chỉ chấp nhận khi đối chiếu khớp trực tiếp với `GET /prod/unit` trên izTeach | `bogusCat=400, bogusUncat=400, verifiedUncat=200 (synced)` | **PASS** |
| `E4-BULK-SYNC-UNLIMITED-PERMISSIONS` | E | Đồng bộ hàng loạt (`/api/ktn/students/sync-all`) lấy đầy đủ quyền `user-permission` cho toàn bộ 30 học viên mới (gỡ giới hạn 25 học viên) và trích xuất chuẩn cả định dạng mảng lẫn object | `syncedStudents=30/30, allHaveHSK1=true` | **PASS** |

---

## 3. Chi tiết 5 Bài kiểm thử Trình duyệt Thật (`tests/ktn_browser_e2e_local.cjs` — Group B)

Lệnh chạy:
```bash
node tests/ktn_browser_e2e_local.cjs
```

| Mã Test | Nhóm | Nội dung kiểm chứng trên Headless Chromium | Bằng chứng đầu ra | Trạng thái |
|---|:---:|---|---|:---:|
| `B1-TAPHON-NO-FALSE-CLASS-AND-COURSE-CLICKABLE` | B | `taphong2002@gmail.com` mở `sll-hocsinh.html` (kể cả khi `localStorage` cũ còn lưu `classCode: 'YCT2-04'`) → đồng bộ `classCode = null` từ máy chủ, không hiện thẻ `Lớp YCT2-04` sai, bấm mở khóa `Chinese For Kids` mượt mà | `classCode=null, hasCfk1=true, activeCourse=65e7704a9ea90c00080d5195` | **PASS** |
| `B2-UNENTITLED-HASH-ROUTE-BLOCKED` | B | Học sinh chỉ có khóa HSK1 điều hướng tới `#/khoa/ttte2/bai/1` bị chặn bởi `#sibling-permission-guard` | `canAccessTtte2=false, guardVisible=true` | **PASS** |
| `B3-COURSE-REVOKE-REFLECTED-ON-RELOAD` | B | Sau khi Admin thu hồi `Chinese For Kids` của `taphong2002@gmail.com`, học sinh tải lại trình duyệt → khóa học bị gỡ ngay khỏi phiên làm việc và chặn truy cập `#/khoa/cfk1/bai/1` | `revokeStatus=200, hasCfk1AfterRevoke=false, guardVisible=true` | **PASS** |
| `B4-STUDENT-SUBMIT-AND-TEACHER-GRADE-E2E-UI` | B | Học sinh lớp `YCT2-04` bấm nút thu âm thật (`#btn-class-mic-YCT2-04_1_1`), thử kịch bản mạng lỗi `503` (hiện thông báo "Gửi lại" và giữ nguyên bản thu âm), bấm `#btn-class-submit-YCT2-04_1_1` nộp thành công → Giáo viên mở `so-lien-lac.html` trên Chromium chấm `9.5/10` qua popup giao diện thật → Học sinh tải lại thấy `9.5/10` và lời cô nhận xét | `retryPreserved=true, submitted=true, teacherUi=true, dbScore=9.5` | **PASS** |
| `B5-LOGOUT-REVOKES-TOKEN-AND-CLEARS-BROWSER-STORAGE` | B | Học sinh bấm đăng xuất trên trình duyệt → `KtnWebApp.logout()` thu hồi token trên máy chủ (`serverRevoked=true`), xóa sạch `localStorage`, và mọi request dùng lại token cũ bị chặn `401` | `serverRevoked=true, persistentAuth=null, reuseStatus=401` | **PASS** |
