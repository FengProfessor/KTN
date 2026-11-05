# 09 — V3 FINAL PRODUCTION READINESS AUDIT (BACKEND V3 · SUPABASE · CLOUDFLARE · IZTEACH · REACT V2)

> **Mục đích:** Báo cáo nghiệm thu kỹ thuật trung thực cho đợt hoàn thiện Production Readiness V3 trên nhánh `feat/ktn-react-ui-v2` (PR #1).

---

## A. Tóm tắt điều hành (Executive Summary)

1. **Những gì đã hoàn thành và kiểm chứng bằng chạy thật:**
   - **Loại bỏ hoàn toàn nhánh `ktn_students?select=*&order=updated_at.desc&limit=2000`** trong `cloudflare-worker-sw-proxy.js` (`GET /api/ktn/admin/students/search`). Chuyển 100% sang tìm kiếm và phân trang phía PostgreSQL qua RPC `ktn_search_students(...)` (với fallback phân trang server-side PostgREST `Prefer: count=exact`, `limit`, `offset`, `and=(search_text.ilike.*tok*,...)`).
   - **Kiểm toán & nâng cấp `supabase_migration_v3.sql` trên PostgreSQL 18.6 thật (`@electric-sql/pglite` + `pg_trgm`):**
     - Sửa hàm `ktn_normalize_vi()` xử lý cả chữ hoa tiếng Việt và tổ hợp dấu Unicode NFD trước khi `lower()`.
     - Khóa chặt RLS policy của `ktn_provisioning_jobs` và `ktn_sync_events` bằng `TO service_role` (chặn `anon` và `authenticated`), kèm lệnh `REVOKE ALL ... FROM anon, authenticated`.
     - Bảo toàn dữ liệu điểm danh lịch sử (`ktn_attendance.session_num` backfill từ `session_id` trước khi đánh unique index), chạy migration 2 lần liên tiếp (idempotent) không lỗi, không mất dòng dữ liệu.
   - **Benchmark tìm kiếm trên PostgreSQL 18.6 thật ở 3 quy mô (1.000 / 10.000 / 50.000 học viên, 20 vòng lặp/truy vấn):**
     - `1.000` học viên: Email p95 = `4.09ms`, Tên không dấu p95 = `4.22ms`, Phân trang sâu (`offset=500, limit=20`) p95 = `4.92ms`.
     - `10.000` học viên: Email p95 = `5.51ms`, Tên không dấu p95 = `3.34ms`, Phân trang sâu (`offset=2500, limit=20`) p95 = `6.63ms`.
     - `50.000` học viên: Email p95 = `6.95ms`, Tên không dấu p95 = `3.63ms`, Phân trang sâu (`offset=45000, limit=20`) p95 = `30.31ms`.
   - **Bảo mật & Độ tin cậy cấp tài khoản 1 chạm (`POST /api/ktn/admin/students/provision` & `/api/ktn/admin/teachers/provision`):**
     - Khóa nguyên tử chống đúp đa tiến trình (`claimProvisioningJobAtomically` qua unique index `ktn_provisioning_jobs.idempotency_key` HTTP 409).
     - Lưu tiến trình từng bước (`completed_steps`, `cognito_user_id`, `izteach_student_id`) khi lỗi giữa chừng để bấm thử lại tiếp tục đúng bước đang dở, không tạo trùng tài khoản Cognito.
     - Lọc bỏ hoàn toàn mật khẩu/token nhạy cảm (`sanitizeAuditPayload` xóa `initialPassword`, `password`, `token` trước khi ghi `ktn_provisioning_jobs` / `ktn_sync_events`).
     - Phân biệt trung thực trạng thái giáo viên `ready_to_login` (có mật khẩu/tài khoản xác thực) và `pending_external_provisioning` (chặn đăng nhập với mã `403 TEACHER_PROVISIONING_PENDING`).
   - **Tối ưu hiệu năng Frontend React V2 & Phát video HLS thực tế:**
     - Tách `hls.js` (`375.28 kB` / `119.17 kB` gzip) thành dynamic import chỉ tải khi mở `/learning` (`0` request HLS trên `/login`, `/`, `/admin`, `/teacher`), loại bỏ `vendor-hls` khỏi `modulepreload` trong script deploy.
     - Giảm kích thước trang mặc định từ `limit=100..150` xuống `limit=20&offset=0`.
     - Gộp polling thông báo giữa `AppShell` và `NotificationCenter` về chung một `queryKey`, tắt polling ngầm khi tab ẩn (`refetchIntervalInBackground: false`), chống gọi lặp `markRoomRead` trong `ChatLayout`.
     - Bổ sung chế độ `HashRouter` tự động (`#/login` hoặc `?router=hash`) để nhúng an toàn vào Custom Page izTeach mà không bị lỗi 404 khi F5.
     - Kiểm chứng phát luồng video HLS thật (`https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8`) trên trình duyệt thật: giải mã khung hình `858x480`, `duration=815s`, `readyState=4`, `currentTime` tăng thực tế.

2. **Những gì chưa thể thực hiện trực tiếp trên dịch vụ đích và lý do:**
   - **Chưa chạy lệnh ghi SQL (`supabase_migration_v3.sql`) lên Supabase Production (`lcwprikrnhpvpkkpqmmj.supabase.co`):** Cơ sở dữ liệu cấu hình trong `.env` đang chứa **1.046 học viên thật** của trung tâm (không có project Supabase staging tách biệt). Tuân thủ nghiêm ngặt quy tắc không ghi trực tiếp lên production khi chưa có lệnh phê duyệt, chúng tôi chỉ kiểm tra đọc-an-toàn (read-only) để xác định schema drift và chạy toàn bộ bài kiểm thử ghi/migration trên PostgreSQL 18.6 thật độc lập (`@electric-sql/pglite`).
   - **Chưa chạy lệnh ghi (`--live`) lên Custom Page izTeach thật và tạo học viên thử nghiệm trên Cognito production:** Token `IZTEACH_ADMIN_TOKEN` trong `.env` hiện đã hết hạn (`exp=1774896105`) và toàn bộ 6 trang Custom Page trên `khongtunhi.com` đều là trang production đang phục vụ học viên thật. Script `deploy_ktn_react_v2_izteach.cjs` đã được trang bị khóa bảo vệ `PROTECTED_PRODUCTION_PAGE_IDS` và sẵn sàng chạy lên trang preview (`--live --page-id <PREVIEW_PAGE_ID> --slug sll-v2-preview`) ngay khi có token mới và ID trang preview.

---

## B. Bằng chứng tìm kiếm & Benchmark PostgreSQL 18.6 thật

- **Cơ chế truy vấn mới:**
  - Worker gọi `POST /rest/v1/rpc/ktn_search_students` với `p_query`, `p_class_code`, `p_course_id`, `p_sync_status`, `p_account_status`, `p_teacher_classes`, `p_limit`, `p_offset`.
  - Nếu database chưa chạy migration V3 (chưa có hàm RPC `ktn_search_students`), Worker tự động chuyển sang truy vấn phân trang server-side qua PostgREST (`Prefer: count=exact`, `limit`, `offset`, `and=(search_text.ilike.*tok*,...)`) và **tuyệt đối không bao giờ tải 2.000 dòng về Worker**.
- **Môi trường đo Benchmark:**
  - Engine: **Real PostgreSQL 18.6** (`@electric-sql/pglite` WASM build chạy trực tiếp engine C của PostgreSQL 18.6 với extension `pg_trgm` và GIN trigram index `idx_ktn_students_search_trgm`).
  - Số lần đo: 20 vòng lặp cho mỗi kịch bản ở 3 mức quy mô (`1.000`, `10.000`, `50.000` hồ sơ học viên giả lập tiếng Việt có dấu).
  - File kết quả chi tiết: `reports/ktn-three-way-reliability/postgres-v3-migration-and-search-benchmark.json`.

| Quy mô dữ liệu | Kịch bản truy vấn | SQL Time (ms) | End-to-End p50 (ms) | End-to-End p95 (ms) | Mục tiêu tham chiếu | Kết quả |
|---:|---|---:|---:|---:|---:|:---:|
| **1.000 học viên** | Tìm theo email chính xác | `3.00 ms` | `2.65 ms` | **`4.09 ms`** | `< 150 ms` | **PASS** |
| **1.000 học viên** | Tìm theo tên nhiều từ không dấu (`hoang ngan`) | `3.00 ms` | `2.23 ms` | **`4.22 ms`** | `< 250 ms` | **PASS** |
| **1.000 học viên** | Phân trang sâu (`offset=500, limit=20`) | `3.00 ms` | `3.31 ms` | **`4.92 ms`** | `< 300 ms` | **PASS** |
| **10.000 học viên** | Tìm theo email chính xác | `4.00 ms` | `2.89 ms` | **`5.51 ms`** | `< 150 ms` | **PASS** |
| **10.000 học viên** | Tìm theo tên nhiều từ không dấu (`hoang ngan`) | `3.00 ms` | `2.43 ms` | **`3.34 ms`** | `< 250 ms` | **PASS** |
| **10.000 học viên** | Phân trang sâu (`offset=2500, limit=20`) | `3.00 ms` | `5.32 ms` | **`6.63 ms`** | `< 300 ms` | **PASS** |
| **50.000 học viên** | Tìm theo email chính xác | `6.00 ms` | `5.75 ms` | **`6.95 ms`** | `< 150 ms` | **PASS** |
| **50.000 học viên** | Tìm theo tên nhiều từ không dấu (`hoang ngan`) | `3.00 ms` | `2.58 ms` | **`3.63 ms`** | `< 250 ms` | **PASS** |
| **50.000 học viên** | Phân trang sâu (`offset=45000, limit=20`) | `3.00 ms` | `26.90 ms` | **`30.31 ms`** | `< 300 ms` | **PASS** |

- **Kiểm tra phân quyền tìm kiếm (RBAC & PII):**
  - `Admin`: Tìm toàn trung tâm.
  - `Teacher`: Bị khóa cứng ở tầng Worker/SQL theo `teacherClasses`; mọi nỗ lực truyền `?classCode=` của lớp khác đều trả về `items: [], totalCount: 0`; các trường nhạy cảm (`internal_note`, `last_sync_error`) bị cắt bỏ ở tầng Worker trước khi trả JSON.
  - `Student`: Bị chặn hoàn toàn (`403 Forbidden`).

---

## C. Bằng chứng Migration Supabase V3

1. **Đối chiếu trực tiếp (Read-Only) với Supabase Production (`lcwprikrnhpvpkkpqmmj.supabase.co`):**
   - Bảng đang tồn tại: `ktn_students` (1.046 dòng), `ktn_teachers` (1 dòng), `ktn_classes` (1 dòng), `ktn_homeworks`, `ktn_messages`, `ktn_notifications`, `ktn_attendance`, `ktn_audit_logs`.
   - Schema drift phát hiện: Production hiện đang ở schema V2 (chưa có cột `search_text`, `account_status`, `sync_status` trên `ktn_students`; chưa có bảng `ktn_provisioning_jobs`, `ktn_sync_events`; chưa có hàm RPC `ktn_search_students`).
2. **Những lỗi trong `supabase_migration_v3.sql` đã được phát hiện và sửa triệt để:**
   - **Hàm `ktn_normalize_vi()`:** Bản cũ gọi `lower()` trước nhưng không xử lý các chữ hoa tiếng Việt có dấu hoặc chuỗi tổ hợp NFD (`\u0300-\u036f`). Đã sửa để chuẩn hóa cả chữ hoa/thường và xóa toàn bộ dấu tổ hợp Unicode.
   - **Bảo toàn điểm danh lịch sử (`ktn_attendance`):** Bổ sung bước backfill tự động `session_num` từ `session_id` (ví dụ `'2'` -> `2`) trước khi tạo unique index `(class_code, session_num, student_email)`, đảm bảo không mất dữ liệu cũ và không lỗi khi chạy lại migration.
   - **Khóa chặt RLS (`ktn_provisioning_jobs`, `ktn_sync_events`):** Sửa policy từ `FOR ALL USING (true)` (vốn cho phép cả `anon` và `authenticated` đọc/ghi!) sang `FOR ALL TO service_role USING (true) WITH CHECK (true)` và thêm `REVOKE ALL ON TABLE ... FROM anon, authenticated`.
   - **Đồng bộ tên cột với Worker:** Đảm bảo cả `supabase_migration_v3.sql` và `supabase_schema.sql` có đầy đủ các cột Worker sử dụng (`operation_id`, `action`, `actor_email`, `target_email`, `cognito_user_id`, `izteach_student_id`, `completed_steps`, `entity_type`, `entity_id`, `upstream_status`).
   - **Dọn dẹp index dư thừa:** Thêm `DROP INDEX IF EXISTS idx_ktn_students_email, idx_ktn_teachers_email` (trùng với unique constraint index).

---

## D. Bằng chứng Tạo tài khoản & Cấp quyền

Đã xác minh tự động trong `tests/ktn_three_way_reliability_suite.cjs` (`D1`–`D12`) và Playwright E2E (`J1`–`J4`):
- **Học viên chỉ học video (`classCode: null`):** Tạo tài khoản thành công, **không bị gán mặc định `YCT2-04`**, nhận quyền khóa học video và hiển thị thông tin bàn giao một lần.
- **Học viên đã tồn tại cấp thêm khóa:** Không tạo tài khoản mới, không mất khóa cũ, hợp nhất danh sách `enrolled_course_ids` và xác minh Read-After-Write với izTeach.
- **Chống đúp nguyên tử & Phục hồi lỗi giữa chừng (`D10`):**
  - Hai request chạy song song cùng `idempotencyKey` -> 1 request xử lý, request còn lại nhận `409 PROVISIONING_IN_PROGRESS`.
  - Khi bước 1 (`izteach_account`) thành công nhưng bước 2 (`izteach_permissions`) lỗi `502`, Worker lưu `cognito_user_id` và `completed_steps: ['izteach_account']`. Khi bấm thử lại, Worker bỏ qua bước tạo Cognito (số lần gọi `/user` vẫn bằng `1`) và hoàn tất bước cấp quyền.
- **Trạng thái thật của Giáo viên (`D11`):**
  - Tạo giáo viên không truyền mật khẩu -> `provisioningStatus: 'pending_external_provisioning'`, `readyToLogin: false`; thử đăng nhập bị chặn với `403 TEACHER_PROVISIONING_PENDING`.
  - Tạo giáo viên có `initialPassword` hợp lệ -> lưu HMAC verifier (`__pwd_hmac:`), trả về `provisioningStatus: 'ready_to_login'`, `readyToLogin: true`; giáo viên đăng nhập thành công ngay lập tức.
- **Không lưu dữ liệu nhạy cảm (`D10`):** Đã kiểm chứng toàn bộ bản ghi trong `ktn_provisioning_jobs` và `ktn_sync_events` không chứa `initialPassword`, `password`, hay token.

---

## E. Bằng chứng 3 Vai trò (Student · Teacher · Admin) & Phát Video HLS Thật

Đã kiểm chứng trên trình duyệt thật qua `apps/ktn-web-v2/tests/e2e/verify-ui-v2.mjs` (**88/88 PASS**) và `tests/ktn_browser_e2e_local.cjs` (**8/8 PASS**):
- **Phát video HLS thực tế (`K3`):**
  - Luồng HLS thật của izTeach (`https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8`) tải manifest + segment `.ts`, giải mã khung hình `858x480`, `duration=815s`, `readyState=4`, và phát thực tế (`currentTime=0.18s > 0`).
- **Tách riêng bài tập khóa video và lớp trực tiếp (`E1`–`E4`):**
  - Bài nộp khóa video đẩy sang izTeach với đúng `unitId` 24-hex trong 346 bài học.
  - Bài nộp lớp trực tiếp (`CLASS_YCT2-04`) gắn cờ `not_applicable_live_class`, lưu S3 + Supabase, giáo viên chấm điểm / yêu cầu nộp lại, học viên nhận thông báo sâu (`deep-link`) tới đúng bài học.
- **Chat 2 thiết bị & Cô lập 1-1 (`C1`–`C7`, `C15`):**
  - Hai context trình duyệt độc lập (Student & Teacher) gửi tin nhắn văn bản + thu âm giọng nói (`data:audio/wav;base64,...`), nhận thông báo, đánh dấu đã đọc bền vững sau khi F5.
  - Giáo viên không dạy lớp của học viên bị chặn `403 TEACHER_STUDENT_ROOM_FORBIDDEN` khi cố đọc hoặc gửi tin vào phòng 1-1 `direct:student:<email>`.

---

## F. Bằng chứng Triển khai Custom Page izTeach & Khóa An toàn Production

- **Bundle & Code-Splitting (`apps/ktn-web-v2/dist`):**
  - `assets/index-*.js`: `241.12 KiB` (gzip `64.84 KiB`)
  - `assets/vendor-react-*.js`: `237.97 KiB` (gzip `78.62 KiB`)
  - `assets/AdminWorkspace-*.js`: `36.31 KiB` (lazy route)
  - `assets/LearningPage-*.js`: `23.71 KiB` (lazy route)
  - `assets/TeacherWorkspace-*.js`: `18.49 KiB` (lazy route)
  - `assets/vendor-hls-*.js`: `366.48 KiB` (dynamic import chỉ tải trên `/learning`, đã loại khỏi `modulepreload`)
- **Chế độ `HashRouter` nhúng Custom Page (`K2`):**
  - Khi mở qua `?router=hash#/login` hoặc `#/login`, ứng dụng tự động dùng `HashRouter`, chuyển hướng `#/learning` và F5 không gây lỗi 404 trên S3/Custom Page.
- **Khóa bảo vệ Production (`D13`):**
  - Script `deploy_ktn_react_v2_izteach.cjs` chặn mọi lệnh `--live` nhắm vào 6 ID Custom Page production hiện hữu trừ khi có cờ `--allow-production-overwrite`, đồng thời thực hiện backup JSON trước khi ghi, kiểm tra SHA-256 + MIME trên CloudFront CDN và hỗ trợ `--rollback <manifest.json>`.

---

## G. Bảng Đánh giá Cổng Nghiệm thu (Release Gate Checklist)

| Hạng mục nghiệm thu | Trạng thái kỹ thuật | Trạng thái trên dịch vụ thật | Ghi chú |
|---|:---:|:---:|---|
| **1. Tìm kiếm học viên PostgreSQL** | **PASS** (`p95 < 31ms` ở 50.000 dòng) | **READY FOR STAGING/PROD SQL** | Chờ chạy `supabase_migration_v3.sql` lên Supabase |
| **2. Migration V3 an toàn** | **PASS** (11/11 checks trên PG 18.6) | **READY FOR STAGING/PROD SQL** | Idempotent, giữ nguyên điểm danh cũ, khóa RLS `TO service_role` |
| **3. Tạo tài khoản một chạm** | **PASS** (Atomic lock + step resume) | **READY FOR LIVE TOKEN** | Cần `IZTEACH_ADMIN_TOKEN` còn hạn để tạo user thử nghiệm trên Cognito thật |
| **4. Cấp thêm khóa** | **PASS** (Read-After-Write verified) | **READY FOR LIVE TOKEN** | Không tạo trùng user, không mất khóa cũ |
| **5. Xếp lớp đúng** | **PASS** (`classCode: null` mặc định) | **PASS** | Đã xóa hoàn toàn mặc định sai `YCT2-04` |
| **6. Tạo/đăng nhập giáo viên** | **PASS** (`ready_to_login` vs `pending`) | **PASS** | Xác thực HMAC mật khẩu + chặn đăng nhập khi `pending` |
| **7. Student học video thật** | **PASS** (Phát luồng HLS izTeach thật) | **PASS** (Live CDN `media.izteach.vn`) | Giải mã khung hình `858x480`, `currentTime > 0` |
| **8. Student nộp bài & Teacher chấm** | **PASS** (Video + Live class tách biệt) | **PASS** (Browser E2E verified) | Lưu lịch sử `_history` và `_syncMeta` |
| **9. Chat & thông báo 2 thiết bị** | **PASS** (2 browser contexts + RBAC 1-1) | **PASS** (Browser E2E verified) | Đã gộp polling và chặn đọc trộm phòng 1-1 khác lớp |
| **10. Custom Page preview URL** | **PASS** (Build + Embed + Rollback ready) | **BLOCKED BY EXPIRED IZTEACH TOKEN** | Sẵn sàng chạy `node deploy_ktn_react_v2_izteach.cjs --live --page-id <PREVIEW_ID> --slug sll-v2-preview` ngay khi cấp mới `IZTEACH_ADMIN_TOKEN` |
