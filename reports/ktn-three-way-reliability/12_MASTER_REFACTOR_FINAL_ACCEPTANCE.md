# KTN MASTER REFACTOR — FINAL ACCEPTANCE REPORT (2026-11-16, Round 3 Release)

> Nhánh: `feat/ktn-react-ui-v2`
> Commit gốc trước đợt refactor (`BASE SHA`): `940f5a03010a0c64e9ffe6cc21da5d95544b8b34` (`PRIOR_SESSION_HEAD`: `b42d532cee5d3507ea3375a211a8125221b27784`)
> Release trước (`Round 2`): code `20ca462d3f442b3ef2525eb9b231402d96102ca6` (`20ca462`), docs `0a73eee9a1084200ab116c71f33d80f779eba506`
> **PRODUCTION CODE SHA (`NEW SHA`):** `525b0ac6e704044aa30f7e891d904711f625006f` (`525b0ac`)

---

## 1. Xác nhận GitHub Actions CI & Triển khai Production

### GitHub Actions CI (`525b0ac`)
- `KTN Three-Way Sync & Security Quality Gate` (`push`, Run ID `43760835996`, `5m40s`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43760835996
- `KTN Three-Way Sync & Security Quality Gate` (`pull_request`, Run ID `43760841291`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43760841291
- `KTN Flashcards & Hanzi Writing Quality Gate` (`push`, Run ID `43760836054`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43760836054
- `KTN Flashcards & Hanzi Writing Quality Gate` (`pull_request`, Run ID `43760841299`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43760841299

### Cloudflare Worker (`ktn-sw-proxy`)
- **Version trước (`Round 2`, rollback target):** `b60a42b7-6472-463f-81ab-245e440fba82` (Deployment `166ca326-cf4c-457c-a0fa-9227914c3ad5`, `2026-11-15T20:03:17.473709Z`; phiên bản cũ hơn nữa `9d8222ff-4fdc-4cb1-abf9-798c3d7256c4`)
- **Version mới (live 100%):** `af9146c2-5873-40fb-a29b-6b28119e3243` (Deployment `2d82e129-46ba-46ff-b520-ebfede64037d`, `2026-11-15T21:02:39.031637Z`, Upload `1445.03 KiB` / gzip `374.48 KiB`, Startup `2 ms`, Crons `*/5 * * * *`, `0 3 * * *`)

### Frontend React V2 (S3/CloudFront & izTeach Custom Page)
- **Custom Page ID:** `6adff7ba36309b0002b6e659` (`so-lien-lac-test`) — **KHÔNG** chỉnh sửa V1 `/custom-page/so-lien-lac` (`696f7bb3d8cb3100021fd870`)
- **S3 Prefix:** `resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/ktn-react-v2/v3.0.0-525b0ac` (`19` assets, `2,526,486` B, toàn bộ chunk `< 500 KiB`, không preload `vendor-hls` ở shell khởi tạo, toàn bộ 19 asset xác minh HTTP 200 + SHA-256 trên CloudFront)
- **Backups đã lưu trước deploy Round 3:**
  - `reports/backups/20261116-pre-round3-deploy/v3-release-manifest.20ca462.json`
  - `reports/backups/20261116-pre-round3-deploy/ktn-sw-proxy.live-backup.js`
  - `reports/backups/20261116-pre-round3-deploy/ktn-sw-proxy.settings-backup.json`
  - `reports/backups/20261116-pre-round3-deploy/so-lien-lac-test.live-backup.html`
  - `reports/backups/20261116-pre-round3-deploy/sw.live-backup.js`
  - `backups/cutover-2026-11-06/custom-page-prev-react-6adff7ba36309b0002b6e659.json`

### Lệnh Rollback Khẩn Cấp (về Round 2 `20ca462`)
```powershell
npx wrangler rollback b60a42b7-6472-463f-81ab-245e440fba82 --config wrangler.toml
$env:KTN_ALLOW_PROD_CUSTOM_PAGE_OVERWRITE = "true"
node deploy_ktn_react_v2_izteach.cjs --rollback reports/backups/20261116-pre-round3-deploy/v3-release-manifest.20ca462.json --live --allow-prod-page-overwrite
```
*(Dự phòng nếu không có file backup untracked: lấy manifest `20ca462` từ `git show 0a73eee:reports/ktn-three-way-reliability/v3-release-manifest.json` hoặc khôi phục viewData từ `backups/cutover-2026-11-06/custom-page-prev-react-6adff7ba36309b0002b6e659.json`.)*

---

## 2. Kết quả Toàn bộ Test Suite Đã Chạy Lại Trên `525b0ac`

| Suite | Kết quả |
|---|---|
| `node --check` (16 scripts Worker/SDK/LMS/Deploy/Tests) | **PASS** |
| `build_clean_real_portal.js` + `git diff --exit-code sll-hocsinh.html` | **PASS** (0 drift) |
| `tests/ktn_three_way_reliability_suite.cjs` | **PASS (64/64)** |
| `tests/ktn_lifecycle_n01_n20_acceptance.cjs` | **PASS (30/30 — N01–N30)** |
| `tests/ktn_class_notification_matrix_n01_n33.cjs` | **PASS (33/33 — N01–N33)** |
| `tests/ktn_ux_and_performance_upgrade_suite.cjs` | **PASS (23/23 — T01–T07, C01–C08, F01–F08)** |
| `tests/ktn_postgres_migration_and_search_benchmark.mjs` | **PASS (21/21 — PG-01..15 + 1k/10k/50k)** |
| `tests/ktn_scale_benchmark.mjs` | **PASS (0 errors @ 20/100/300/500 concurrent)** |
| `apps/ktn-web-v2`: `npm run typecheck` + `npm run test:unit` + `npm run build` | **PASS (19 files, 375 tests)** |
| `apps/ktn-web-v2`: `npm run test:e2e` (`verify-ui-v2.mjs`) | **PASS (133/133)** |
| `tests/ktn_browser_e2e_local.cjs` | **PASS (8/8 — B1–B8)** |
| `flashcards/tests/verify-flashcards.mjs` | **PASS** |
| `deploy_ktn_react_v2_izteach.cjs --dry-run --rollback` (`20ca462` target) | **PASS** |

---

## 3. Trạng thái Checklist (`N01–N30`, `H01–H15`, `P01–P12`)

- **`N01–N30` (Class Lifecycle, Support Center Routing, SW & V1/V2 Isolation, Same-Origin `/api/ktn/vocab`, Teacher 1-1 Scoping):** **PASS 30/30** (kèm **33/33** ở `N01–N33`). Push trên **thiết bị vật lý đóng app** (Android/iOS): **`NOT VERIFIED`** (môi trường CLI không có máy thật; `PUSH_SERVICE_ACCEPTED` và `SERVICE_WORKER_DISPLAYED` qua `/api/ktn/push/ack` đã PASS).
- **`H01–H15` (Teacher Homework UX sạch, sửa bài bảo toàn bài cũ, 409 conflict, chuyển lớp):**
  - `H01–H15` đều có test định danh trực tiếp trong `apps/ktn-web-v2/tests/unit/ktn-master-refactor.test.tsx`: **PASS**, kết hợp `U3`/`V2` (`133/133` E2E) và kiểm tra live `#/teacher?tab=sessions` form trống hoàn toàn (`classVal=""`, `sessionSelectVal=""`, `titleVal=""`, `promptVal=""`).
- **`P01–P12` (Scale 5k–50k & Desktop PWA):**
  - `P01`, `P11`, `D3 & CORS` trong `ktn-master-refactor.test.tsx` + `N17–N20`, `N24`, `N27–N30`, `V1` E2E, `ktn_scale_benchmark.mjs`, và live `/manifest.json`, `/sw.js`, PNG icons, `/api/ktn/push/vapid-public-key`, nút **`Cài Khổng Tử Nhí`**: **PASS**.
  - Cài app PWA qua dialog hệ điều hành Windows/macOS thật & nhận toast push OS khi đóng hoàn toàn trình duyệt: **`NOT VERIFIED`** (cần QA thủ công trên Windows 10/11 & macOS + Chrome/Edge thật).

---

## 4. Baseline vs After (Mô phỏng 5k–50k & Production Thực Tế)

### Mô hình Scale PGlite 18.6 (`ktn_scale_benchmark.mjs`, 5.000 HS / 10k alerts+msgs)
- `class_students_lookup`: p50 `4.06ms` (p95 `5.67ms`) -> p50 `0.73ms` (p95 `1.11ms`)
- `alerts_room_feed`: p50 `2.26ms` (p95 `2.79ms`) -> p50 `0.87ms` (p95 `1.66ms`)
- `messages_room_timeline`: p50 `2.52ms` (p95 `2.91ms`) -> p50 `0.74ms` (p95 `1.46ms`)
- `notifications_recipient_unread`: p50 `1.6ms` (p95 `2.49ms`) -> p50 `0.34ms` (p95 `0.75ms`)
- **Concurrency 20 / 100 / 300 / 500:** `0` errors (`0%` error rate); `classesLite` p95 `431.64ms` @ 500 concurrent (`1043.8 RPS`); `notificationsSummary` p95 `542.08ms` @ 500 concurrent (`849.7 RPS`).
- **Mô hình 1.000 tab treo idle:** `15,000 req/min` (`15.13 MB/min`) -> `2,000 req/min` (`0.45 MB/min`) (**-86.7% requests**, **-97% bandwidth**).

### Production Thực Tế (`https://khongtunhi.com`, đọc tuần tự 3 mẫu/endpoint, không stress-test)
- `/api/ktn/classes` (`467,449 B`, p50 `483.12ms`) vs `/api/ktn/classes?lite=1` (`97,675 B`, p50 `325.09ms`): giảm **-79.1% payload**.
- `/api/ktn/teachers` (`168,526 B`): p50 `563.21ms`.
- `/api/ktn/admin/teachers/search?q=linh&limit=20` (`24,392 B`): p50 `546.88ms`.
- `/api/ktn/admin/students/search?q=ngan&limit=20` (`50,787 B`): p50 `1,038.57ms` (chạy qua PostgREST fallback Schema V2 vì SQL migration chưa chạy live).
- `/api/ktn/notifications?limit=50&offset=0` Student (`2,177 B`, p50 `839.07ms`) vs `/api/ktn/notifications/summary` Student (`242 B`, p50 `851.52ms`): giảm **-88.9% payload**, unread parity `1 == 1`.
- `/api/ktn/notifications?limit=50&offset=0` Teacher `gv001` (`1,942 B`, p50 `1,141.51ms`) vs `/summary` (`237 B`, p50 `1,164.38ms`): unread parity `4 == 4`.
- `/api/ktn/notifications` Admin `quanly` (`5,817 B`, `11` items) vs `/summary` (`243 B`): unread parity `4 == 4`.
- `/api/ktn/messages/rooms` Student (`10,919 B`): p50 `749.62ms`.
- `/api/ktn/messages?roomId=class%3AYCT2-04` (cross-class `403`, `186 B`): p50 `265.14ms`.
- `/api/ktn/notifications` (unauth `401`, `49 B`): p50 `34.06ms`.
- `/api/ktn/vocab?level=hsk1` (same-origin + `Origin: https://khongtunhi.com`): HTTP `200`, body `[]`, `Access-Control-Allow-Origin: *`.

---

## 5. Trạng thái SQL Migrations & Hạn mức Hạ tầng

- **SQL Migrations (`NOT APPLIED LIVE — MANUAL SUPABASE SQL EDITOR REQUIRED`):**
  - Đã kiểm tra trực tiếp trên Supabase PostgREST live (`2026-11-15T21:04Z`): `ktn_students` (1382), `ktn_teachers` (68), `ktn_classes` (135), `ktn_class_sessions` (9), `ktn_homeworks` (3), `ktn_messages` (57), `ktn_dlp_alerts` (1514), `ktn_push_subscriptions` (35).
  - Các bảng/RPC mới vẫn trả HTTP `404`: `ktn_provisioning_jobs`, `ktn_sync_events`, `ktn_class_schedules`, `ktn_notifications`, `rpc/ktn_search_students`.
  - Do `.env` không có `DATABASE_URL` hay Supabase Management PAT (`sbp_...`), chủ hệ thống cần chạy thủ công trong **Supabase SQL Editor** theo thứ tự:
    1. `supabase_migration_v3.sql`
    2. `supabase/migrations/20261116_ktn_scale_and_lifecycle_indexes.sql`
- **Hạn mức hạ tầng:**
  - Cloudflare Zone `khongtunhi.com`: **`Free Website`** (`free`); Worker `usage_model: "standard"`, `compatibility_date: "2024-11-01"`.
  - Cloudflare Workers Paid/Free subscription: **`UNKNOWN`** (không có quyền billing API).
  - Supabase Plan & izTeach AWS API Gateway/S3/CloudFront Plan: **`UNKNOWN`**.
  - Kết luận nâng cấp: **NO** (chưa cần mua gói phần cứng/server; ưu tiên áp dụng 2 file SQL migration trên để mở khóa `ktn_notifications` & `pg_trgm` RPC giảm latency fallback ~805–1164ms xuống mức index scan).

---

## 6. Xác minh Live Không Phá Dữ Liệu (Playwright + API)

- **V1 `/custom-page/so-lien-lac`:** HTTP `200`, HTML từ Worker **đã gỡ sạch** `<link rel="manifest">` và V2 apple-icon (`hasManifest: false`, `hasAppleIcon: false`, `hasV2Mount: false`). Custom Page `696f7bb3d8cb3100021fd870` không bị sửa đổi. *(Lưu ý kỹ thuật: mã JS legacy của chính V1 vẫn tự chèn thẻ manifest/icon `sofl-remake/logo.png` ở client sau hydration.)*
- **V2 `/custom-page/so-lien-lac-test`:** Render đúng commit **`525b0ac`** (`#ktn-react-v2-root[data-ktn-commit="525b0ac"]`), `/manifest.json` (`200`, `start_url: "/custom-page/so-lien-lac-test"`, `display: "standalone"`), 4 PNG icons thật (`89504e47`), `/sw.js` active scope `/` (`ktn-pwa-v3`, có `openWindow` & route `homework_graded`, khớp strict `/custom-page/so-lien-lac-test`, **không còn `anyClient.navigate`**), `/api/ktn/push/vapid-public-key` (`200`).
- **Bảo toàn animation, game & i18n:**
  - `#/games?game=zombie-defender` mount `<ZombieDefenderGame />` & `<JiangshiPuppet />` bình thường (`77` SVGs / `144` SVG nodes), `/api/ktn/vocab?level=hsk1` trả `200 []` kèm `Access-Control-Allow-Origin: *`, **0 lỗi CORS, 0 lỗi 404, 0 `pageerror`**.
  - Toggle `VI | EN` (`vi <-> en`) hoạt động mượt trên cả 3 vai trò: Student (`e2e.hs.a@khongtunhi.com`, `e2e.hs.b@khongtunhi.com`), Teacher (`gv001@khongtunhi.com`), Admin (`quanly@khongtunhi.com`).
  - Nút **`Cài Khổng Tử Nhí`** hiển thị nhất quán trong header ở cả 3 vai trò.
  - Học viên chưa xếp lớp (`e2e.hs.b@khongtunhi.com`, `classCode: null`) mở `#/chat?room=student:e2e.hs.b@khongtunhi.com` hiển thị đích **`Học vụ Khổng Tử Nhí`**, không có fallback `"Nhắn riêng Cô"`.
  - Teacher `#/teacher?tab=sessions` (`gv001@khongtunhi.com`) mở form tạo bài mới sạch hoàn toàn (`classVal=""`, `sessionSelectVal=""`, `titleVal=""`, `promptVal=""`), 0 lỗi ghi dư dữ liệu QA.
