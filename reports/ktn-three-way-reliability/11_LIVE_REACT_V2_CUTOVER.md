# 11. BÁO CÁO NGHIỆM THU CHUYỂN ĐỔI LIVE PRODUCTION REACT V2 & BACKEND V3 (LIVE CUTOVER)

- **Ngày thực hiện**: `06/11/2026`
- **Phiên kiểm thử nghiệm thu**: `LIVE-CUTOVER-1793941938951`
- **Môi trường đích**: Production (`https://khongtunhi.com`)
- **Trạng thái cuối**: **HOÀN TẤT CHUYỂN ĐỔI LIVE & NGHIỆM THU 8/8 GOLDEN PATHS (`LIVE PASS`)**

---

## 1. Executive Verdict

Hệ thống **Sổ Liên Lạc Điện Tử Học Viện Khổng Tử Nhí (KTN)** đã được chuyển đổi có kiểm soát từ giao diện HTML Legacy V2 sang **giao diện React V2 (`apps/ktn-web-v2`) + Cloudflare Worker V3 (`cloudflare-worker-sw-proxy.js`)** trực tiếp trên trang Custom Page thật của izTeach (`https://khongtunhi.com/custom-page/so-lien-lac-test`).

Toàn bộ **8/8 kịch bản Golden Path** trên trình duyệt Chromium thực tế (Desktop `1440×900` và Mobile `390×844` / `360×800`) cho cả 3 vai trò (**Học viên, Giáo viên, Quản lý**), **55/55 bài kiểm thử độ tin cậy Backend V3**, và **15/15 bài kiểm thử đơn vị React V2** đều đạt **100% PASS**. Dữ liệu của **1.046 học viên** và **2 giáo viên đang hoạt động** trên Supabase được bảo toàn nguyên vẹn 100%, không có bất kỳ dữ liệu rác kiểm thử hay thông tin cá nhân học viên thật (PII) nào lộ trong ảnh chụp nghiệm thu.

---

## 12.A. Trạng thái triển khai

| Thành phần | Trước | Sau | Kết quả |
|---|---|---|---|
| **Supabase** | V2 | V2 (Tương thích V3 qua PostgREST; chờ DATABASE_URL để chạy DDL V3) | **PASS** |
| **Cloudflare Worker** | V2 (`32ac03d1-9822-4371-9926-9e8311485c89`) | V3 (`d66c3334-6c78-41f7-86f5-dd62a2b0ab7e`) | **PASS** |
| **Custom Page** | HTML cũ (`6adff7ba36309b0002b6e659` / `353.513` bytes) | React V2 (`v3.0.0-b1cb988` / `#ktn-react-v2-root`) | **PASS** |
| **Student UI** | Legacy | React V2 | **PASS** |
| **Teacher UI** | Legacy | React V2 | **PASS** |
| **Admin UI** | Legacy | React V2 | **PASS** |

### Chi tiết 6 pha chuyển đổi (Phase A – Phase F)

| Pha | Nội dung | Đã chạy thật | Kết quả | Bằng chứng |
|---|---|---|---|---|
| **Phase A: Git, backup, inventory** | Kiểm tra nhánh `feat/ktn-react-ui-v2`, ghi nhận Worker Version ID cũ (`32ac03d1-9822-4371-9926-9e8311485c89`), sao lưu toàn bộ 12 bảng Supabase (`1.046` học viên), cấu hình Custom Page `6adff7ba36309b0002b6e659` (`353.513` bytes) và `vendor-setting` vào thư mục local đã gitignore (`backups/cutover-2026-11-06/`). | **CÓ** | **PASS** | `backups/cutover-2026-11-06/backup-manifest.json`, `custom-page-backup-6adff7ba36309b0002b6e659.json` |
| **Phase B: Supabase V3 migration & search** | Môi trường chỉ cấp khóa REST PostgREST (`SUPABASE_SERVICE_ROLE_KEY`) mà không có mật khẩu kết nối PostgreSQL trực tiếp (`DATABASE_URL`); kích hoạt cơ chế tương thích kép V3/V2 trong Worker V3 (tìm kiếm có dấu/không dấu, phân trang vượt `1.000` dòng trả đủ `1.046` dòng, chống trùng lặp `Idempotency-Key` bền vững qua `ktn_dlp_alerts` khi bảng `ktn_provisioning_jobs` chưa tạo). | **CÓ** | **PASS** | `searchBenchmarks` trong `live-production-acceptance-results.json` (`accented=9`, `unaccented=9`, `email=1`, `offset1000Returned=46`, `total=1046`) |
| **Phase C: Cloudflare Worker V3** | Bổ sung chuẩn hóa `/api/ktn/courses/units` (`streamUrl` `.m3u8`), tương thích ngược `ktn_attendance`, ghép trang `>1.000` dòng cho `/api/ktn/students` & `/api/ktn/sync/reconcile`, bảo toàn `Idempotency-Key` trên Schema V2, cấp mật khẩu khởi tạo 1 lần (`Ktn@...`) khi tạo giáo viên mới trên `#/admin/classes`, cố định khóa chính `existingTeaRow.code`, và tiêm cờ bảo vệ phiên trên `/custom-page/so-lien-lac*`. Chạy `55/55` bài kiểm thử reliability và deploy Worker Version `d66c3334-6c78-41f7-86f5-dd62a2b0ab7e`. | **CÓ** | **PASS** | Worker Version ID `d66c3334-6c78-41f7-86f5-dd62a2b0ab7e`, `12/12` endpoint smoke tests `200 OK` |
| **Phase D: React V2 upload & Custom Page** | Đồng bộ tham số URL (`#/learning?courseId=...&lesson=2`) khi chuyển bài giảng trên `LearningPage.tsx`, bổ sung `<audio controls>` trực tiếp trên thẻ chấm bài của Giáo viên (`TeacherWorkspace.tsx`), chuẩn hóa `getCourseUnits` (`ktnApiClient.ts`), hỗ trợ rollback trực tiếp từ cả manifest V3 lẫn file backup `viewData` gốc trong `deploy_ktn_react_v2_izteach.cjs`. Upload 8 gói bundle lên S3/CloudFront (khớp 100% SHA-256) và gắn vào Custom Page `6adff7ba36309b0002b6e659`. | **CÓ** | **PASS** | `reports/ktn-three-way-reliability/v3-release-manifest.json` (`8/8` gói CDN SHA-256 verified) |
| **Phase E: Live E2E 3 roles** | Thực thi trọn vẹn 8 kịch bản Golden Path bằng trình duyệt Chromium thật trên `https://khongtunhi.com/custom-page/so-lien-lac-test` ở cả Desktop (`1440×900`) và Mobile (`390×844`, `360×800`, tràn ngang `0px`), kèm ẩn danh toàn bộ PII học viên thật trong ảnh chụp. | **CÓ** | **PASS (8/8)** | `reports/ktn-three-way-reliability/live-production-acceptance-results.json` & `14` ảnh chụp React V2 trong `reports/ktn-three-way-reliability/live-screenshots/` |
| **Phase F: Reconcile, cleanup & handover** | Chạy đối soát `POST /api/ktn/sync/reconcile` (`dryRun: true`), dọn sạch toàn bộ bản ghi kiểm thử (`ktn_homeworks`, `ktn_messages`, `ktn_dlp_alerts`, tài khoản giáo viên kiểm thử), khôi phục trạng thái gốc của tài khoản kiểm thử và xác minh trạng thái sau dọn dẹp (`1.046` học viên, `2` giáo viên). | **CÓ** | **PASS** | `reconcileDryRun` & `cleanup.finalVerification` trong `live-production-acceptance-results.json` |

---

## 12.B. Kiểm thử

| Chức năng | LIVE PASS/FAIL |
|---|---|
| Student đăng nhập | **LIVE PASS** |
| Video phát thật | **LIVE PASS** |
| Nộp bài | **LIVE PASS** |
| Teacher nghe bài | **LIVE PASS** |
| Teacher chấm bài qua UI | **LIVE PASS** |
| Student xem điểm | **LIVE PASS** |
| Chat | **LIVE PASS** |
| Thông báo deep-link | **LIVE PASS** |
| Admin tìm học viên | **LIVE PASS** |
| Admin tạo học viên | **LIVE PASS** |
| Admin tạo giáo viên | **LIVE PASS** |
| izTeach đồng bộ | **LIVE PASS** |
| Mobile | **LIVE PASS** |

### Ghi chú kỹ thuật chi tiết cho từng chức năng

| Chức năng | Trạng thái | Ghi chú & Chỉ số thực tế |
|---|---|---|
| **Giao diện React V2 trên URL live** | **LIVE PASS** | `https://khongtunhi.com/custom-page/so-lien-lac-test` hiển thị `#ktn-react-v2-root`, ẩn hoàn toàn khung HTML cũ (`hasLegacyDom=false`), tải đầy đủ 8 gói bundle từ CloudFront (`200 OK`). |
| **Student / Teacher / Admin đăng nhập** | **LIVE PASS** | Đăng nhập thành công cả 3 vai trò trên giao diện React V2, lưu phiên `ktn_sll_persistent_auth_v2`, F5 giữ nguyên phiên, không bị script ngoài tự đẩy về `/?login=1`. |
| **Video phát thật** | **LIVE PASS** | Phát luồng HLS thật (`.m3u8` `200`, `.ts` `200`, `0` lỗi `403/404`), `readyState=4`, `858×480`, TTFF Desktop `959,8 ms` / Mobile `1.065,1 ms`, chuyển bài 1↔2 cập nhật đúng hash `#/learning?courseId=6adadba969897b0002482ca5&lesson=2`. |
| **Nộp bài, Teacher nghe bài & chấm bài qua UI, Student xem điểm** | **LIVE PASS** | Học viên tải tệp `.wav` lên S3 (`200 OK`) & nộp bài (`HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1`); Giáo viên nghe `<audio controls>` ngay trên `#/teacher/grading` (`audioPlayerPresent=true`), chấm `9.5/10` + nhận xét; Học viên thấy điểm `9.5 / 10` và thẻ `NHẬN XÉT GIÁO VIÊN` sau khi tải lại. |
| **Chat & Thông báo deep-link** | **LIVE PASS** | Chat 2 chiều thời gian thực (`~2,0–2,3s`) gồm văn bản + tin nhắn thoại `.wav`; bấm thông báo chấm bài điều hướng đúng `#/learning?courseId=6adadba969897b0002482ca5&lesson=1&tab=homework`; đánh dấu đã đọc bền vững sau F5; chặn RBAC chéo lớp `403 Forbidden`. |
| **Admin tạo học viên & izTeach đồng bộ** | **LIVE PASS** | Tạo/cấp khóa trên `#/admin/students` giữ `class_code=null` (`autoAssignedToWrongClass=false`), hiển thị đúng thông báo tài khoản hiện có, đồng bộ khóa `HSK1 3.0` + `CFK` cả 3 nơi, gọi lặp cùng `Idempotency-Key` trả `idempotentReplayFlag=true` và không nhân đôi khóa học (`supabaseCoursesCount=2`). |
| **Admin tạo giáo viên** | **LIVE PASS** | Tạo giáo viên trên `#/admin/classes` hiển thị mật khẩu khởi tạo 1 lần (`uiDisplayedInitialPassword=true`), lưu thật vào `ktn_teachers`, đăng nhập ngay vào React V2 với đúng `role="teacher"`, `hasTeacherHome=true`, `hasAdminHome=false`. |
| **Admin tìm học viên (> 1.000 dòng)** | **LIVE PASS** | Tìm `"Hoàng Ngân"` (`9` kết quả) = `"hoang ngan"` (`9` kết quả), tìm email `1` kết quả; phân trang `offset=1000&limit=50` trả về `46` dòng cuối (`totalCount=1046`), `GET /api/ktn/students` trả đủ `1.046` dòng. |
| **Mobile viewport** | **LIVE PASS** | Kiểm thử thực tế trên `390×844` và `360×800`: tràn ngang `0px` (`horizontalOverflowPx=0`), phát video HLS mượt (`readyState=4`, TTFF `1.065,1 ms`), ngăn kéo bài giảng và thanh điều hướng dưới hoạt động tốt. |

---

## C. BẰNG CHỨNG BẮT BUỘC (MANDATORY EVIDENCE)

### 1. URL trang KTN live đã chuyển sang React V2
- **Production Custom Page URL**: `https://khongtunhi.com/custom-page/so-lien-lac-test`
- **izTeach Custom Page ID / Slug**: `6adff7ba36309b0002b6e659` (`so-lien-lac-test`)
- **DOM Mount Element**: `#ktn-react-v2-root` (`data-ktn-router="hash"`, `data-ktn-release="v3.0.0"`, `data-ktn-commit="b1cb988"`)

### 2. Commit SHA được triển khai
- **Branch**: `origin/feat/ktn-react-ui-v2`
- **Static Bundle Release Prefix (CDN & `#ktn-react-v2-root[data-ktn-commit]`)**: `v3.0.0-b1cb988` (`b1cb988b0720a10ab097d2b92bad5e69119660fa`)
- **Worker V3 & Cutover Implementation Commit SHA**: `bfe6e8f` (`bfe6e8f0b6fabe0b78de21912c90621ae239e853`)
- **Live E2E Acceptance & Screenshot PII Redaction Commit SHAs**: `a148ba3` (`a148ba3b57c709c3078323589e77111477446b3f`), `9fe93ea`, `b266b09` (`b266b095c250e82ffed4533a320b779d7b646349`)

### 3. Worker deployment ID mới và cũ
- **Cloudflare Worker Name**: `ktn-sw-proxy` (`https://khongtunhi.com/api/ktn/*` & `https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev`)
- **Active Worker Version ID (V3 mới)**: `d66c3334-6c78-41f7-86f5-dd62a2b0ab7e`
- **Previous Worker Version ID (V3 bản đầu)**: `74672361-45dd-46e8-902d-db59312d337b`
- **Rollback Worker Version ID (Legacy V2 trước cutover)**: `32ac03d1-9822-4371-9926-9e8311485c89`

### 4. Trạng thái migration Supabase V3
- **Supabase Project ID**: `lcwprikrnhpvpkkpqmmj`
- **Trạng thái**: `V2 (Tương thích V3 qua PostgREST; chờ DATABASE_URL để chạy DDL V3)`. Máy trạm triển khai chỉ được cấp khóa REST PostgREST (`SUPABASE_SERVICE_ROLE_KEY`) mà không có mật khẩu kết nối PostgreSQL trực tiếp (`DATABASE_URL`). Tuân thủ nguyên tắc trung thực tuyệt đối (*"Không ghi 'Sau: V3' nếu bước đó chưa thực hiện"*), Worker V3 vận hành ở **chế độ tương thích kép V3/V2**:
  - Tìm kiếm tiếng Việt có dấu/không dấu và phân trang vượt `1.000` dòng (`1.046` học viên) hoạt động đầy đủ qua bộ lọc chuẩn hóa dấu kết hợp phân trang đa trang (`offset=0` + `offset=1000`).
  - Trạng thái chống trùng lặp `Idempotency-Key` của `/api/ktn/admin/students/provision` được lưu bền vững vào bảng `ktn_dlp_alerts` (`room_id='PROVISIONING_JOB'`, `reason='IDEM:<key>'`) khi bảng `ktn_provisioning_jobs` chưa được tạo, đảm bảo tính đúng đắn xuyên suốt các Worker isolate.
  - Khi chủ dự án cấp `DATABASE_URL`, có thể chạy trực tiếp `supabase_migration_v3.sql` mà không cần sửa đổi bất kỳ dòng code nào trên Worker hay UI.

### 5. Release manifest của React V2
- **File manifest**: `reports/ktn-three-way-reliability/v3-release-manifest.json`
- **CloudFront CDN Prefix**: `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/ktn-react-v2/v3.0.0-b1cb988/assets/`
- **Danh sách 8 gói bundle (tất cả `< 500 KiB`, khớp 100% SHA-256 trên CDN)**:
  - `assets/index-C06KEZrM.js` (`242.39 KiB`, SHA-256 `358b428356aa...`)
  - `assets/index-Ds3XXIwL.css` (`40.20 KiB`, SHA-256 `91570c1509e4...`)
  - `assets/LearningPage-BtLmkCOg.js` (`24.00 KiB`, SHA-256 `638a9c610a03...`)
  - `assets/TeacherWorkspace-CrzK7ZpW.js` (`18.71 KiB`, SHA-256 `c2fb586b8858...`)
  - `assets/AdminWorkspace-CTivl58Z.js` (`36.70 KiB`, SHA-256 `3d604615359c...`)
  - `assets/vendor-hls-Dy2NRv67.js` (`366.48 KiB`, SHA-256 `0fd24ea438c5...`, lazy-loaded)
  - `assets/vendor-icons-D9EkkmGI.js` (`28.54 KiB`, SHA-256 `13fa662103d5...`)
  - `assets/vendor-react-zGRsKWYw.js` (`237.97 KiB`, SHA-256 `8ee1a27bf9a7...`)

### 6. Kết quả 8 kịch bản kiểm thử chính (Golden Paths)

| # | Kịch bản kiểm thử (Live React V2) | Vai trò | Bằng chứng & Chỉ số thực tế | Kết quả |
|---|---|---|---|---|
| **Test 1** | Đăng nhập Học viên, mở khóa `HSK1 3.0`, phát video HLS thật (`.m3u8` / `.ts`), chuyển bài 1↔2 cập nhật hash URL, tải tệp `.wav` lên S3 & nộp bài tập | Student (`e2e.hs.a@khongtunhi.com`) | Manifest `.m3u8` `200`, Segment `.ts` `200`, `readyState=4`, `858×480`, TTFF Desktop `959,8 ms` / Mobile `1.065,1 ms`, `lesson2Switch.hash="#/learning?courseId=6adadba969897b0002482ca5&lesson=2"`, nộp bài `.wav` thành công (`HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1`). | **PASS** |
| **Test 2** | Giáo viên đăng nhập, mở `#/teacher/grading`, nghe trình phát `<audio controls>` ngay trên màn hình, chấm `9.5/10` + nhận xét | Teacher (`linh.lam@khongtunhi.com`) | `[data-testid^="teacher-homework-audio-"]` hiển thị (`audioPlayerPresent=true`), chấm `9.5/10` đồng bộ Supabase (`status="graded"`, `score=9.5`). | **PASS** |
| **Test 3** | Học viên nhận điểm `9.5/10` & nhận xét của giáo viên, nhận thông báo chấm bài, bấm thông báo mở đúng bài tập (`deep-link`), F5 giữ nguyên | Student (`e2e.hs.a@khongtunhi.com`) | Hiển thị thẻ `NHẬN XÉT GIÁO VIÊN` & `Điểm: 9.5 / 10` (`feedbackBoxVisible=true`), bấm thông báo điều hướng chính xác tới `#/learning?courseId=6adadba969897b0002482ca5&lesson=1&tab=homework`. | **PASS** |
| **Test 4** | Chat 2 chiều thời gian thực (văn bản + thu âm giọng nói `.wav`), đồng bộ đã đọc thông báo & kiểm tra chặn RBAC chéo lớp | Student A ↔ Teacher A / Teacher B / Student B | Tin nhắn văn bản (`~2,0–2,3s`) & tin nhắn thoại (`data:audio/wav`) hiển thị kèm trình phát âm thanh (`[data-testid="chat-message-bubble"]`); Giáo viên lớp khác (`thu.ha`) và Học viên lớp khác (`e2e.hs.b`) bị chặn `403 Forbidden`. | **PASS** |
| **Test 5** | Admin cấp quyền học viên mới / hiện có trên `#/admin/students`, không tự gán nhầm vào lớp `YCT2-04`, bàn giao thông tin đăng nhập & chống trùng lặp (`Idempotency-Key`) | Admin (`quanly@khongtunhi.com`) | Modal tạo học viên hoạt động trên React V2, `class_code=null` (`autoAssignedToWrongClass=false`), mở khóa `HSK1 3.0` + `CFK` đồng bộ cả 3 nơi, gọi lặp trả `idempotentReplayFlag=true` và không nhân đôi khóa học (`supabaseCoursesCount=2`). | **PASS** |
| **Test 6** | Admin tạo giáo viên mới trên `#/admin/classes`, hiển thị mật khẩu khởi tạo 1 lần, lưu thật vào `ktn_teachers`, đăng nhập đúng vai trò `teacher` | Admin & New Teacher (`e2e.gv.test@khongtunhi.com`) | Hiển thị mật khẩu khởi tạo 1 lần (`uiDisplayedInitialPassword=true`), lưu thật vào `ktn_teachers` (`liveSupabaseActuallySavedNewTeacher=true`), đăng nhập vào React V2 bằng mật khẩu trên giao diện nhận đúng `role="teacher"`, `hasTeacherHome=true`, `hasAdminHome=false`. | **PASS** |
| **Test 7** | Tìm kiếm học viên tiếng Việt có dấu / không dấu / email & phân trang vượt mốc `1.000` dòng | Admin (`quanly@khongtunhi.com`) | Tìm `"Hoàng Ngân"` (`9` kết quả) = `"hoang ngan"` (`9` kết quả), tìm email `1` kết quả; phân trang `offset=1000&limit=50` trả về `46` dòng cuối (`totalCount=1046`), `GET /api/ktn/students` trả đủ `1.046` dòng. | **PASS** |
| **Test 8** | Đối soát 3 hệ thống (`POST /api/ktn/sync/reconcile` dry-run) & dọn dẹp sạch dữ liệu kiểm thử | Admin (`quanly@khongtunhi.com`) | `totalStudents=1046`, `healthyCount=1046`, xóa sạch bài tập/tin nhắn/bản ghi idempotency/giáo viên kiểm thử (`HTTP 204`), khôi phục nguyên trạng `1.046` học viên và `2` giáo viên. | **PASS** |

### 7. Ảnh chụp giao diện React V2 live cho Student, Teacher, Admin và Mobile
Toàn bộ ảnh chụp màn hình thực tế từ phiên nghiệm thu (đã ẩn danh 100% PII của học viên thật ngoài tập test) được lưu tại `reports/ktn-three-way-reliability/live-screenshots/` (đồng thời sao lưu tại `reports/ktn-three-way-reliability/screenshots/live-cutover/`):
- `01-live-react-v2-1440.png` (Giao diện đăng nhập React V2 Desktop `1440×900`)
- `02-live-react-v2-390.png` (Giao diện đăng nhập React V2 Mobile `390×844`)
- `03-live-react-v2-360.png` (Giao diện đăng nhập React V2 Mobile `360×800`)
- `05-live-react-admin-home.png` (Trang chủ Quản lý / Admin — đã ẩn danh toàn bộ PII học viên trong `Việc cần xử lý`)
- `06-live-react-admin-students.png` (Danh sách `1.046` học viên trên Admin React V2 — đã ẩn danh PII)
- `07-live-react-admin-student-provisioned.png` (Admin cấp quyền học viên & banner bàn giao tài khoản — đã ẩn danh PII)
- `09-live-react-student-home.png` (Trang chủ Học viên `Học Viên Kiểm Thử E2E A`)
- `10-live-react-video-playing.png` (Học viên phát video bài giảng HLS thật trên Desktop `858×480`, `readyState=4`)
- `11-live-react-homework-submitted.png` (Học viên tải tệp `.wav` lên S3 và nộp bài tập thành công)
- `12-live-react-teacher-grading.png` (Giáo viên nghe `<audio controls>` trực tiếp và chấm `9.5/10`)
- `13-live-react-student-graded.png` (Học viên xem thẻ `NHẬN XÉT GIÁO VIÊN`, điểm `9.5/10` và lời phê của giáo viên sau khi tải lại)
- `14-live-react-two-account-chat.png` (Phòng chat lớp `YCT2-04` 2 chiều hiển thị đầy đủ bong bóng tin nhắn `[data-testid="chat-message-bubble"]` + tin nhắn thoại `.wav`, không có khung xương loading và đã ẩn phòng 1-1 ngoài tập test)
- `15-live-react-notifications.png` (Trung tâm thông báo & điều hướng deep-link của Học viên)
- `16-live-react-search-results.png` (Tìm kiếm học viên `e2e.hs.` trực tiếp trên giao diện Admin React V2)

### 8. Danh sách dữ liệu test đã tạo và đã dọn
- **Bản ghi đã tạo trong phiên E2E và đã xóa hoàn toàn (`HTTP 204`)**:
  - `ktn_homeworks`: `HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1` (`DELETE 204`)
  - `ktn_messages`: `MSG-1793942028510-hkto`, `MSG-1793942030785-zi5i`, `MSG-1793942033907-1ck9` (`DELETE 204`)
  - `ktn_teachers`: `e2e.gv.test@khongtunhi.com` (`GV-E2E-99`, `DELETE 204`, khôi phục lớp `YCT2-04` về `GV-KTN-08`)
  - `ktn_dlp_alerts`: Bản ghi `room_id=PROVISIONING_JOB` của `e2e.hs.b@khongtunhi.com` (`DELETE 204`)
- **Tài khoản kiểm thử đã khôi phục trạng thái gốc**:
  - `e2e.hs.b@khongtunhi.com`: Thu hồi 2 khóa thử nghiệm (`revokeStatus: 200`) và khôi phục `class_code: 'YCT3-02'`, `online_courses: []` (`restoreClassStatus: 200`).
- **Kiểm chứng hậu nghiệm**: `supabaseStudentRange: "0-0/1046"` (`1.046` học viên), `activeTeachers`: `2` (`GV-KTN-12` & `GV-KTN-08`).

### 9. Những rủi ro còn lại
- **DDL Migration `supabase_migration_v3.sql`**: Do môi trường triển khai chưa có biến `DATABASE_URL` (kết nối PostgreSQL trực tiếp), các lệnh DDL tạo bảng `ktn_provisioning_jobs`, `ktn_sync_events` và RPC `ktn_search_students` chưa chạy trực tiếp trên PostgreSQL. Tuy nhiên, Worker V3 đã có cơ chế fallback hoàn chỉnh trên Schema V2 (bao gồm lưu trạng thái `Idempotency-Key` bền vững vào `ktn_dlp_alerts`, tìm kiếm bỏ dấu tiếng Việt và ghép trang vượt `1.000` dòng). Khi có `DATABASE_URL`, có thể chạy `supabase_migration_v3.sql` bất kỳ lúc nào mà không cần sửa code.
- **Log console của khung Next.js izTeach**: Khi chạy trên trình duyệt headless chặn quyền Notification, script của khung izTeach ghi log `messaging/permission-blocked` trên console nhưng không ảnh hưởng tới ứng dụng React V2.

### 10. Trạng thái Rollback
- **Trạng thái hiện tại**: **KHÔNG CẦN KÍCH HOẠT ROLLBACK** (hệ thống mới đạt `8/8` Golden Paths và hoạt động ổn định).
- **Quy trình khôi phục khẩn cấp (đã xác minh `--dry-run` thành công)**:
  1. **Rollback giao diện Custom Page về bản HTML Legacy V2 gốc (`< 30 giây`)**:
     ```bash
     KTN_ALLOW_PROD_CUSTOM_PAGE_OVERWRITE=true node deploy_ktn_react_v2_izteach.cjs --rollback --backup backups/cutover-2026-11-06/custom-page-backup-6adff7ba36309b0002b6e659.json --live --allow-prod-page-overwrite
     ```
  2. **Rollback Cloudflare Worker về bản V2 trước cutover (`< 30 giây`)**:
     ```bash
     npx wrangler rollback 32ac03d1-9822-4371-9926-9e8311485c89 --config wrangler.toml
     ```
