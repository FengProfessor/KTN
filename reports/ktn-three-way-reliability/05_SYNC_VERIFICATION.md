# 05 — THREE-WAY SYNCHRONIZATION & CURRICULUM VERIFICATION

> **Mục đích:** Báo cáo chi tiết cơ chế đồng bộ 3 chiều (**Sổ Liên Lạc ↔ Supabase ↔ izTeach**), trạng thái đồng bộ (`syncStatus`), kiểm chứng Read-After-Write và kết quả kiểm toán toàn bộ 17 khóa học / 346 bài giảng.

---

## 1. Máy trạng thái Đồng bộ Bài nộp & Điểm chấm (`syncStatus` State Machine)

Mỗi bản ghi bài tập trong bảng `ktn_homeworks` trên Supabase lưu trữ siêu dữ liệu đồng bộ trong `workbook_answers._syncMeta` và lịch sử phiên bản trong `workbook_answers._history`:

| Trạng thái (`syncStatus`) | Ý nghĩa kỹ thuật | Hành vi của Hệ thống & Giao diện |
|---|---|---|
| `saved_to_supabase` | Đã lưu an toàn vào bảng `ktn_homeworks` trên Supabase, chuẩn bị đồng bộ sang izTeach. | Dữ liệu bài làm/điểm số của học sinh và giáo viên đã được bảo toàn trên Supabase. |
| `synced` | Đã đồng bộ thành công sang đúng `(courseId, unitId)` trên izTeach (`POST /prod/homework` trả về `200` + `_id`). | Lưu `izteachRemoteId`, `lastSyncedSignature`, `lastSyncedAt`. Nếu gửi lặp cùng nội dung sẽ trả về `idempotentReplay: true`. |
| `not_applicable_live_class` | Bài tập thuộc buổi học trên lớp trực tiếp (`CLASS_YCT2-04`, `CLASS_YCT3-02`...). | Chỉ lưu trên Supabase & Sổ Liên Lạc; **tuyệt đối không** đẩy sang izTeach để tránh ghi nhầm vào khóa HSK1. |
| `mapping_required` | Khóa học video chưa có ánh xạ `unitId` cho `lessonNum` tương ứng trong `COURSE_UNIT_MAP`. | Lưu an toàn trên Supabase, gắn cờ `mapping_required` và **không** đoán mò `unitId` của bài khác hay khóa khác. |
| `sync_failed` | Đã lưu thành công trên Supabase (`ok: true`, `mirroredToIzTeach: false`) nhưng izTeach tạm thời không phản hồi (`503`/`500`). | Giao diện Giáo viên (`lmsSaveGrade`) hiện thông báo rõ: *"Đã lưu điểm trên Sổ Liên Lạc (Supabase), nhưng chưa đồng bộ sang izTeach"*, không báo thành công giả tạo 3 chiều. |

---

## 2. Cơ chế Đồng bộ Quyền học 3 chiều & Read-After-Write Verification

### 2.1. Cấp quyền khóa học (`action: 'grant'` hoặc `'set'`)
1. Worker gọi `provisionStudentOnIzTeach()` → tạo/lấy `cognitoUserId` và gọi `PUT /prod/user-permission/add-products/:cognitoUserId`.
2. **Read-After-Write Verification:** Gọi ngay `GET /prod/user-permission?userId=:cognitoUserId&vendorId=:vendorId`, trích xuất danh sách khóa học qua `extractIzTeachOnlineCourseIds()` và kiểm tra mọi `courseId` vừa cấp đều có mặt trên izTeach.
3. Nếu xác minh khớp, Worker gọi `mergeAndUpsertStudentCourses()` để cập nhật `ktn_students.online_courses` trên Supabase.
4. Nếu izTeach thành công nhưng Supabase lỗi (`503`), Worker trả về `502` kèm `{ ok: false, partialFailure: true, syncStatus: 'partial_failure_supabase', izteachUpdated: true, supabaseUpdated: false }` để Quản lý biết chính xác trạng thái và bấm đồng bộ lại.

### 2.2. Thu hồi quyền khóa học (`action: 'revoke'`)
1. Worker gọi `revokeStudentCoursesOnIzTeach()` → nếu không tìm thấy `cognitoUserId` trên cả Supabase lẫn izTeach CRM, trả về `{ ok: false, skipped: true, reason: 'COGNITO_USER_NOT_FOUND' }` và Worker trả về ngay `502` (**không bao giờ** coi `skipped: true` là thu hồi thành công).
2. Gọi `PUT /prod/user-permission/remove-products/:cognitoUserId`.
3. **Read-After-Write Verification:** Gọi `GET /prod/user-permission` và kiểm tra không còn bất kỳ `courseId` nào trong danh sách cần thu hồi tồn tại trên izTeach. Nếu vẫn còn sót, trả về `{ ok: false, reason: 'REVOKE_VERIFICATION_MISMATCH' }` (`HTTP 502`) và giữ nguyên Supabase để không lệch trạng thái.
4. Chỉ khi izTeach xác nhận đã gỡ sạch quyền học thì mới cập nhật `ktn_students.online_courses` trên Supabase.

---

## 3. Kiểm toán Toàn bộ 17 Khóa học & 346 Bài giảng (`A1-CURRICULUM-346`)

Đã kiểm toán tự động toàn bộ `clean_lessons_data.json` (1 khóa HSK1 3.0) và `all_courses_lessons_data.json` (16 khóa học mở rộng):

| STT | Mã Khóa học (`courseId`) | Mã ngắn | Tên Khóa học | Số bài học | `unitId` 24-hex duy nhất | Video HLS (`.m3u8`) | Bài tập tự chế (Fabricated) |
|---|---|---|---|:---:|:---:|:---:|:---:|
| 1 | `6adadba969897b0002482ca5` | `HSK1-30` | Khóa học Tiêu Chuẩn New HSK 1 (3.0) | 15 | 15/15 | 15/15 (100%) | 0 |
| 2 | `65e7704a9ea90c00080d5195` | `CFK1` | Chinese For Kids (5 – 6 tuổi) | 20 | 20/20 | 20/20 (100%) | 0 |
| 3 | `661528ea42af880008944573` | `CFK3` | Chinese For Kids 3 | 20 | 20/20 | 20/20 (100%) | 0 |
| 4 | `66028938bfd6c90008b816e1` | `TTTE2` | Tiếng Trung Trẻ Em 2 | 20 | 20/20 | 20/20 (100%) | 0 |
| 5 | `669a3420a883ec0008e29688` | `YCT1` | Chinh Phục YCT 1 | 21 | 21/21 | 21/21 (100%) | 0 |
| 6 | `669a342ba883ec0008e29689` | `YCT2` | Chinh Phục YCT 2 | 25 | 25/25 | 25/25 (100%) | 0 |
| 7 | `669a3438a883ec0008e2968a` | `YCT3` | Chinh Phục YCT 3 | 25 | 25/25 | 25/25 (100%) | 0 |
| 8 | `66b1ba4fa883ec0008e29c19` | `YCT4` | Chinh Phục YCT 4 | 25 | 25/25 | 25/25 (100%) | 0 |
| 9 | `66e80643a883ec0008e2aa4c` | `HSK1-KIDS` | HSK 1 Dành Cho Trẻ Em | 20 | 20/20 | 20/20 (100%) | 0 |
| 10 | `66e80655a883ec0008e2aa4d` | `HSK2` | Chinh Phục HSK 2 | 20 | 20/20 | 20/20 (100%) | 0 |
| 11 | `66e80664a883ec0008e2aa4e` | `HSK3` | Chinh Phục HSK 3 | 20 | 20/20 | 20/20 (100%) | 0 |
| 12 | `66e80673a883ec0008e2aa4f` | `HSK4` | Chinh Phục HSK 4 | 25 | 25/25 | 25/25 (100%) | 0 |
| 13 | `67063ccba883ec0008e2b20c` | `GT-CB` | Tiếng Trung Giao Tiếp Cơ Bản | 20 | 20/20 | 20/20 (100%) | 0 |
| 14 | `67063cdda883ec0008e2b20d` | `GT-NC` | Tiếng Trung Giao Tiếp Nâng Cao | 20 | 20/20 | 20/20 (100%) | 0 |
| 15 | `67063ceea883ec0008e2b20e` | `PINYIN` | Làm Chủ Ngữ Âm Pinyin | 15 | 15/15 | 15/15 (100%) | 0 |
| 16 | `67063d00a883ec0008e2b20f` | `HANZI` | Tuyệt Chiêu Nhớ Chữ Hán | 20 | 20/20 | 20/20 (100%) | 0 |
| 17 | `67063d12a883ec0008e2b210` | `LUYENTHI-YCT` | Luyện Đề Thực Chiến YCT | 15 | 15/15 | 15/15 (100%) | 0 |
| **Tổng** | **17 Khóa học** | | | **346** | **346/346 (100%)** | **346/346 (100%)** | **0 (Nguyên bản)** |
