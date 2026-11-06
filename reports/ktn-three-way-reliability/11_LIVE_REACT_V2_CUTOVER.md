# 11. BÁO CÁO NGHIỆM THU CHUYỂN ĐỔI LIVE PRODUCTION REACT V2 & BACKEND V3 (LIVE CUTOVER)

- **Ngày thực hiện**: `06/11/2026`
- **Phiên kiểm thử nghiệm thu**: `LIVE-CUTOVER-1793938015540`
- **Môi trường đích**: Production (`https://khongtunhi.com`)
- **Trạng thái cuối**: **HOÀN TẤT CHUYỂN ĐỔI LIVE & NGHIỆM THU 8/8 GOLDEN PATHS (`PASS`)**

---

## 1. Executive Verdict

Hệ thống **Sổ Liên Lạc Điện Tử Học Viện Khổng Tử Nhí (KTN)** đã được chuyển đổi có kiểm soát từ giao diện HTML Legacy V2 sang **giao diện React V2 (`apps/ktn-web-v2`) + Cloudflare Worker V3 (`cloudflare-worker-sw-proxy.js`)** trực tiếp trên trang Custom Page thật của izTeach (`https://khongtunhi.com/custom-page/so-lien-lac-test`).

Toàn bộ **8/8 kịch bản Golden Path** trên trình duyệt Chromium thực tế (Desktop `1440×900` và Mobile `390×844` / `360×800`) cho cả 3 vai trò (**Học viên, Giáo viên, Quản lý**) cùng **55/55 bài kiểm thử độ tin cậy Backend V3** đều đạt **100% PASS**. Dữ liệu của **1.046 học viên** và **2 giáo viên đang hoạt động** trên Supabase được bảo toàn nguyên vẹn 100%, không có bất kỳ dữ liệu rác kiểm thử nào còn tồn đọng sau khi kết thúc phiên nghiệm thu.

---

## 2. Live URLs, Release & Deployment IDs

| Thành phần | Giá trị thực tế trên Production |
|---|---|
| **Live React V2 Custom Page URL** | `https://khongtunhi.com/custom-page/so-lien-lac-test` |
| **izTeach Custom Page ID / Slug** | `6adff7ba36309b0002b6e659` (`so-lien-lac-test`) |
| **React V2 Root Element** | `#ktn-react-v2-root` (`data-ktn-release="v3.0.0"`, `data-ktn-commit="aa1225d"`) |
| **CloudFront CDN Asset Prefix** | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/ktn-react-v2/v3.0.0-aa1225d/assets/` |
| **Cloudflare Worker Name** | `ktn-sw-proxy` (`https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev` & `https://khongtunhi.com/api/ktn/*`) |
| **Active Worker Version ID (V3)** | `74672361-45dd-46e8-902d-db59312d337b` |
| **Rollback Worker Version ID (V2)** | `32ac03d1-9822-4371-9926-9e8311485c89` |
| **Supabase Project ID** | `lcwprikrnhpvpkkpqmmj` (`1.046` học viên, `2` giáo viên active) |

---

## 3. Kết Quả Thực Hiện Theo Từng Pha (Phase A – Phase F)

| Pha | Nội dung thực hiện | Kết quả |
|---|---|---|
| **Phase A — Preflight & Backup** | Kiểm tra nhánh `feat/ktn-react-ui-v2`, ghi nhận Worker Version ID cũ (`32ac03d1-9822-4371-9926-9e8311485c89`), sao lưu toàn bộ 12 bảng Supabase (`1.046` học viên), cấu hình Custom Page `6adff7ba36309b0002b6e659` và `vendor-setting` vào thư mục local đã gitignore (`backups/cutover-2026-11-06/`). | **PASS** |
| **Phase B — Supabase Schema & Search** | Do môi trường chỉ cấp khóa REST PostgREST (`SUPABASE_SERVICE_ROLE_KEY`) mà không có mật khẩu kết nối PostgreSQL trực tiếp (`DATABASE_URL`), tuân thủ quy tắc an toàn không vượt quyền và kích hoạt cơ chế tương thích kép V3/V2 trong Worker V3. Kiểm thử 5 kịch bản tìm kiếm (email, tên có dấu, tên không dấu, phân trang vượt mốc `1.000` trả đủ `1.046` dòng, chặn giáo viên tìm học viên lớp khác `403`). | **PASS** |
| **Phase C — Cloudflare Worker V3** | Bổ sung chuẩn hóa danh sách bài giảng `/api/ktn/courses/units` (`streamUrl` `.m3u8`), tương thích ngược bảng `ktn_attendance`, phân trang đa trang (`>1.000` dòng) cho `/api/ktn/students` và `/api/ktn/sync/reconcile`, cố định khóa chính `existingTeaRow.code` khi cập nhật giáo viên theo email, và gắn cờ bảo vệ phiên trên `/custom-page/so-lien-lac*`. Chạy `55/55` bài kiểm thử reliability và deploy Worker Version `74672361-45dd-46e8-902d-db59312d337b`. | **PASS** |
| **Phase D — React V2 Build & Cutover** | Bổ sung trình phát `<audio controls>` trực tiếp trên màn hình chấm bài của Giáo viên (`TeacherWorkspace.tsx`), chuẩn hóa `getCourseUnits` (`ktnApiClient.ts`), cập nhật script deploy `deploy_ktn_react_v2_izteach.cjs` theo đúng cấu trúc `viewData` của izTeach API `k90adfn1jk`. Upload 8 gói bundle lên S3/CloudFront (kiểm tra khớp 100% SHA-256) và gắn vào Custom Page `6adff7ba36309b0002b6e659`. | **PASS** |
| **Phase E — Live E2E Acceptance (3 Roles)** | Thực thi trọn vẹn 8 kịch bản Golden Path bằng trình duyệt thật trên `https://khongtunhi.com/custom-page/so-lien-lac-test` ở cả Desktop (`1440×900`) và Mobile (`390×844`, `360×800`, tràn ngang `0px`). | **PASS (8/8)** |
| **Phase F — Reconcile, Cleanup & Handover** | Chạy đối soát `POST /api/ktn/sync/reconcile` (`dryRun: true`), dọn sạch toàn bộ bản ghi kiểm thử (`ktn_homeworks`, `ktn_messages`, tài khoản giáo viên kiểm thử), khôi phục trạng thái gốc của tài khoản kiểm thử và xuất báo cáo nghiệm thu. | **PASS** |

---

## 4. Bảng Kết Quả Nghiệm Thu 8 Kịch Bản Golden Path Thực Tế

| # | Kịch bản kiểm thử (Live React V2) | Vai trò | Bằng chứng & Chỉ số thực tế | Kết quả |
|---|---|---|---|---|
| **Test 1** | Đăng nhập Học viên, mở khóa `HSK1 3.0`, phát video HLS thật (`.m3u8` / `.ts`), chuyển bài 1↔2, tải tệp `.wav` lên S3 & nộp bài tập | Student (`e2e.hs.a@khongtunhi.com`) | Manifest `.m3u8` `200`, Segment `.ts` `200`, `readyState=4`, `858×480`, TTFF Desktop `887 ms` / Mobile `2.515 ms`, nộp bài `.wav` thành công (`HW-e2e.hs.a@khongtunhi.com-6adadba969897b0002482ca5-L1`). | **PASS** |
| **Test 2** | Giáo viên đăng nhập, mở `#/teacher/grading`, nghe trình phát `<audio controls>` ngay trên màn hình, chấm `9.5/10` + nhận xét | Teacher (`linh.lam@khongtunhi.com`) | `[data-testid^="teacher-homework-audio-"]` hiển thị (`audioPlayerPresent=true`), chấm `9.5/10` đồng bộ Supabase (`status="graded"`, `score=9.5`). | **PASS** |
| **Test 3** | Học viên nhận điểm `9.5/10` & nhận xét của giáo viên, nhận thông báo chấm bài, bấm thông báo mở đúng bài tập (`deep-link`), F5 giữ nguyên | Student (`e2e.hs.a@khongtunhi.com`) | Hiển thị `Điểm: 9.5 / 10` (`feedbackBoxVisible=true`), bấm thông báo điều hướng chính xác tới `#/learning?courseId=6adadba969897b0002482ca5&lesson=1&tab=homework`. | **PASS** |
| **Test 4** | Chat 2 chiều thời gian thực (văn bản + thu âm giọng nói `.wav`), đồng bộ đã đọc thông báo & kiểm tra chặn RBAC chéo lớp | Student A ↔ Teacher A / Teacher B / Student B | Tin nhắn văn bản (`~2,1s`) & tin nhắn thoại (`data:audio/wav`) hiển thị kèm trình phát âm thanh; Giáo viên lớp khác (`thu.ha`) và Học viên lớp khác (`e2e.hs.b`) bị chặn `403 Forbidden`. | **PASS** |
| **Test 5** | Admin cấp quyền học viên mới / hiện có trên `#/admin/students`, không tự gán nhầm vào lớp `YCT2-04`, bàn giao thông tin đăng nhập & chống trùng lặp (Idempotency) | Admin (`quanly@khongtunhi.com`) | Modal tạo học viên hoạt động trên React V2, `class_code=null` (`autoAssignedToWrongClass=false`), mở khóa `HSK1 3.0` + `CFK` đồng bộ cả 3 nơi, gọi lặp không nhân đôi khóa học (`supabaseCoursesCount=2`). | **PASS** |
| **Test 6** | Admin tạo giáo viên mới trên `#/admin/classes`, lưu thật vào `ktn_teachers`, đăng nhập đúng vai trò `teacher` (không bị nâng quyền nhầm thành `admin`) | Admin & New Teacher (`e2e.gv.test@khongtunhi.com`) | Lưu thật vào `ktn_teachers` (`liveSupabaseActuallySavedNewTeacher=true`), đăng nhập vào React V2 nhận đúng `role="teacher"`, `hasTeacherHome=true`, `hasAdminHome=false`. | **PASS** |
| **Test 7** | Tìm kiếm học viên tiếng Việt có dấu / không dấu / email & phân trang vượt mốc `1.000` dòng | Admin (`quanly@khongtunhi.com`) | Tìm `"Hoàng Ngân"` (`9` kết quả) = `"hoang ngan"` (`9` kết quả), tìm email `1` kết quả; phân trang `offset=1000&limit=50` trả về `46` dòng cuối (`totalCount=1046`), `GET /api/ktn/students` trả đủ `1.046` dòng. | **PASS** |
| **Test 8** | Đối soát 3 hệ thống (`POST /api/ktn/sync/reconcile` dry-run) & dọn dẹp sạch dữ liệu kiểm thử | Admin (`quanly@khongtunhi.com`) | `totalStudents=1046`, `healthyCount=1046`, xóa sạch bài tập/tin nhắn/giáo viên kiểm thử (`HTTP 204`), khôi phục nguyên trạng `1.046` học viên và `2` giáo viên. | **PASS** |

---

## 5. Các Lỗi Tồn Đọng Đã Được Khắc Phục Triệt Để

1. **Chuyển hướng cưỡng bức về `/?login=1` khi mở `/custom-page/so-lien-lac-test`**: Global script cũ trong `vendor-setting` tự chuyển hướng người dùng chưa có phiên Legacy về trang chủ. Đã khắc phục trong Worker V3 bằng cách tiêm cờ `window.__ktnSllAuthHookedV8=true; window.__ktnAllowLogout=true; window.__KTN_EMBED_MODE__=true;` vào `<head>` của các route `/custom-page/so-lien-lac*` mà không làm ảnh hưởng trang khác.
2. **Tạo giáo viên mới thất bại ngầm hoặc xung đột khóa chính `code` khi cập nhật theo `email`**: Worker V3 đã lưu metadata xác thực HMAC & lớp phụ trách tương thích cả Schema V2/V3 và ưu tiên giữ `existingTeaRow.code` khi cập nhật hồ sơ giáo viên đã tồn tại.
3. **Giới hạn cứng 1.000/1.046 học viên của PostgREST**: Đã triển khai ghép trang server-side (`offset=0` + `offset=1000`) cho cả `/api/ktn/admin/students/search`, `/api/ktn/students` và `/api/ktn/sync/reconcile`, trả đủ `1.046/1.046` học viên.
4. **Danh sách bài giảng `/api/ktn/courses/units` thiếu `streamUrl` HLS hoặc `num`**: Đã chuẩn hóa tại Worker V3 và `ktnApiClient.ts`, tự động ánh xạ `videoId` sang luồng HLS `https://media.izteach.vn/<vendorId>/<videoId>/playlist.m3u8`.
5. **Giáo viên thiếu trình phát `<audio controls>` trực tiếp trên thẻ chấm bài React V2**: Đã bổ sung `<audio controls preload="metadata">` vào `TeacherWorkspace.tsx`.
6. **Chặn RBAC phòng chat riêng chéo lớp**: Giáo viên lớp `YCT3-02` (`thu.ha@khongtunhi.com`) truy cập phòng chat riêng của học viên lớp `YCT2-04` bị chặn `403 Forbidden`.

---

## 6. Rủi Ro Còn Lại (Remaining Risks)

- **DDL Migration `supabase_migration_v3.sql`**: Do máy trạm triển khai chỉ có khóa REST PostgREST (`SUPABASE_SERVICE_ROLE_KEY`) mà chưa có mật khẩu kết nối PostgreSQL trực tiếp (`DATABASE_URL`), các câu lệnh DDL tạo bảng `ktn_provisioning_jobs`, `ktn_sync_events` và RPC `ktn_search_students` chưa chạy trực tiếp trên PostgreSQL. Tuy nhiên, Worker V3 đã có cơ chế fallback server-side hoàn chỉnh trên Schema V2 (đạt 5/5 bài kiểm thử tìm kiếm, phân trang `1.046` dòng và điểm danh). Khi có `DATABASE_URL`, có thể chạy `supabase_migration_v3.sql` bất kỳ lúc nào mà không cần sửa code Worker hay UI.
- **Thông báo Firebase Cloud Messaging của khung Next.js izTeach**: Khi chạy trên trình duyệt headless chặn quyền Notification, script của khung izTeach ghi log `messaging/permission-blocked` trên console nhưng không ảnh hưởng tới hoạt động của ứng dụng React V2.

---

## 7. Trạng Thái & Quy Trình Rollback Tức Thì

Hệ thống hiện hoạt động ổn định nên **không cần kích hoạt rollback**. Trong trường hợp cần khôi phục khẩn cấp:

1. **Rollback giao diện Custom Page (`< 30 giây`)**:
   ```bash
   node deploy_ktn_react_v2_izteach.cjs --rollback --backup backups/cutover-2026-11-06/custom-page-backup-6adff7ba36309b0002b6e659.json --live --allow-prod-page-overwrite
   ```
2. **Rollback Cloudflare Worker về bản V2 trước cutover (`< 30 giây`)**:
   ```bash
   npx wrangler rollback 32ac03d1-9822-4371-9926-9e8311485c89 --config wrangler.toml
   ```
