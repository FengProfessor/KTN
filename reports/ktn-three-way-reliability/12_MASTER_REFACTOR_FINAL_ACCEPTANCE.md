# KTN MASTER REFACTOR — FINAL ACCEPTANCE REPORT (2026-11-16)

> Nhánh: `feat/ktn-react-ui-v2`
> Commit trước đợt refactor: `940f5a03010a0c64e9ffe6cc21da5d95544b8b34` (`PRIOR_SESSION_HEAD`: `b42d532cee5d3507ea3375a211a8125221b27784`)
> **PRODUCTION CODE SHA:** `20ca462d3f442b3ef2525eb9b231402d96102ca6` (`20ca462`)

---

## 1. Xác nhận GitHub Actions CI & Triển khai Production

### GitHub Actions CI (`20ca462`)
- `KTN Three-Way Sync & Security Quality Gate` (`push`, Run ID `43755309693`, `4m49s`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43755309693
- `KTN Three-Way Sync & Security Quality Gate` (`pull_request`, Run ID `43755314858`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43755314858
- `KTN Flashcards & Hanzi Writing Quality Gate` (`pull_request`, Run ID `43755314687`): **`success`** — https://github.com/FengProfessor/KTN/actions/runs/43755314687

### Cloudflare Worker (`ktn-sw-proxy`)
- **Version cũ (rollback target):** `9d8222ff-4fdc-4cb1-abf9-798c3d7256c4` (Deployment `d32d8979-1df4-463d-9a56-f456a3b34439`)
- **Version mới (live 100%):** `b60a42b7-6472-463f-81ab-245e440fba82` (Deployment `166ca326-cf4c-457c-a0fa-9227914c3ad5`, `2026-11-15T20:03:17.473709Z`, Upload `1439.54 KiB` / gzip `373.60 KiB`, Startup `1 ms`)

### Frontend React V2 (S3/CloudFront & izTeach Custom Page)
- **Custom Page ID:** `6adff7ba36309b0002b6e659` (`so-lien-lac-test`) — **KHÔNG** chỉnh sửa V1 `/custom-page/so-lien-lac` (`696f7bb3d8cb3100021fd870`)
- **S3 Prefix:** `resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/ktn-react-v2/v3.0.0-20ca462` (`19` assets, `2,526,155` B, toàn bộ chunk `< 500 KiB`, không preload `vendor-hls` ở shell khởi tạo)
- **Backups đã lưu trước deploy:**
  - `reports/backups/20261116-pre-deploy/ktn-sw-proxy.live-backup.js`
  - `reports/backups/20261116-pre-deploy/ktn-sw-proxy.settings-backup.json`
  - `reports/backups/20261116-pre-deploy/so-lien-lac-test.live-backup.html`
  - `backups/cutover-2026-11-06/custom-page-prev-react-6adff7ba36309b0002b6e659.json`

### Lệnh Rollback Khẩn Cấp
```powershell
npx wrangler rollback 9d8222ff-4fdc-4cb1-abf9-798c3d7256c4 --config wrangler.toml
$env:KTN_ALLOW_PROD_CUSTOM_PAGE_OVERWRITE = "true"
node deploy_ktn_react_v2_izteach.cjs --rollback reports/ktn-three-way-reliability/v3-release-manifest.json --live --allow-prod-page-overwrite
```

---

## 2. Kết quả Toàn bộ Test Suite Đã Chạy Lại

| Suite | Kết quả |
|---|---|
| `node --check` (4 file Worker/SW/Deploy) | **PASS** |
| `build_clean_real_portal.js` + `git diff sll-hocsinh.html` | **PASS** (0 drift) |
| `tests/ktn_three_way_reliability_suite.cjs` | **PASS (64/64)** |
| `tests/ktn_lifecycle_n01_n20_acceptance.cjs` | **PASS (28/28 — N01–N28)** |
| `tests/ktn_class_notification_matrix_n01_n33.cjs` | **PASS (33/33 — N01–N33)** |
| `tests/ktn_ux_and_performance_upgrade_suite.cjs` | **PASS (23/23 — T01–T07, C01–C08, F01–F08)** |
| `tests/ktn_postgres_migration_and_search_benchmark.mjs` | **PASS (21/21 — PG-01..15 + 1k/10k/50k)** |
| `tests/ktn_scale_benchmark.mjs` | **PASS (0 errors @ 20/100/300/500 concurrent)** |
| `npm run typecheck` + `npm run test:unit` + `npm run build` | **PASS (19 files, 372 tests)** |
| `npm run test:e2e` (`verify-ui-v2.mjs`) | **PASS (133/133)** |
| `tests/ktn_browser_e2e_local.cjs` | **PASS (8/8 — B1–B8)** |
| `deploy_ktn_react_v2_izteach.cjs --dry-run` & `--rollback --dry-run` | **PASS** |

---

## 3. Trạng thái Checklist (`N01–N28`, `H01–H15`, `P01–P12`)

- **`N01–N28` (Class Lifecycle, Support Center Routing, SW & V1/V2 Isolation):** **PASS 28/28** (kèm **33/33** ở `N01–N33`). Push trên **thiết bị vật lý đóng app** (Android/iOS): **`NOT VERIFIED`** (môi trường CLI không có máy thật; `PUSH_SERVICE_ACCEPTED` và `SERVICE_WORKER_DISPLAYED` qua `/api/ktn/push/ack` đã PASS).
- **`H01–H15` (Teacher Homework UX sạch, không mẫu tự điền):**
  - `H01–H11` (có mã định danh trực tiếp trong `ktn-master-refactor.test.tsx`): **PASS**.
  - Các mục `H12–H15` (không đánh số `H12–H15` riêng trong file test): hành vi tương ứng được kiểm qua `N13–N16`, `F01–F08`, `U3`/`V2` (E2E 133/133) và kiểm tra live `#/teacher?tab=sessions` form trống hoàn toàn (`classVal=""`, `titleVal=""`, `promptVal=""`) -> **PASS (theo ánh xạ test)**.
- **`P01–P12` (Scale 5k–50k & Desktop PWA):**
  - `P01`, `P11` trong `ktn-master-refactor.test.tsx`: **PASS**.
  - Các mục PWA & Scale (`N17–N20`, `N24`, `N27–N28`, `V1` E2E, `ktn_scale_benchmark.mjs`, và live `/manifest.json`, `/sw.js`, PNG icons, `/api/ktn/push/vapid-public-key`): **PASS**.
  - Cài app PWA qua dialog hệ điều hành Windows/macOS thật & nhận toast push OS khi đóng hoàn toàn trình duyệt: **`NOT VERIFIED`** (cần test thủ công trên Windows/macOS thật).

---

## 4. Baseline vs After (Mô phỏng 5k–50k & Production Thực Tế)

### Mô hình Scale PGlite 18.6 (`ktn_scale_benchmark.mjs`, 5.000 HS / 10k alerts+msgs)
- `class_students_lookup`: p50 `3.98ms` (p95 `9.13ms`) -> p50 `0.73ms` (p95 `1.3ms`)
- `alerts_room_feed`: p50 `2.09ms` (p95 `2.9ms`) -> p50 `0.88ms` (p95 `1.44ms`)
- `messages_room_timeline`: p50 `2.26ms` (p95 `3.59ms`) -> p50 `0.75ms` (p95 `1.29ms`)
- `notifications_recipient_unread`: p50 `1.73ms` (p95 `2.57ms`) -> p50 `0.45ms` (p95 `0.72ms`)
- **Mô hình 1.000 tab treo idle:** `15,000 req/min` (`15.13 MB/min`) -> `2,000 req/min` (`0.45 MB/min`) (**-86.7% requests**, **-97% bandwidth**).

### Production Thực Tế (`https://khongtunhi.com`, đọc tuần tự 3 mẫu, không stress-test)
- `/api/ktn/classes` (`467,449 B`) vs `/api/ktn/classes?lite=1` (`97,675 B`): giảm **-79.1% payload**, p50 AFTER `305.18ms` (BEFORE `322.84ms`).
- `/api/ktn/notifications` (`2,177 B`) vs `/summary` (`242 B`): giảm **-88.9% payload**, p50 AFTER `819.24ms` / `821.49ms` (BEFORE `881.3ms` / `848.57ms`).
- `/api/ktn/admin/students/search?q=ngan&limit=20` (`50,787 B`): p50 AFTER `991.09ms` (BEFORE `1018.08ms`).
- `/api/ktn/admin/teachers/search?q=linh&limit=20` (`24,392 B`): p50 AFTER `523.35ms` (BEFORE `548.1ms`).
- `/api/ktn/messages/rooms` (`10,919 B`): p50 AFTER `728.54ms` (BEFORE `740.98ms`).
- `/api/ktn/messages?roomId=class%3AYCT2-04` (cross-class `403`): p50 AFTER `244.98ms` (BEFORE `263.09ms`).

---

## 5. Trạng thái SQL Migrations & Hạn mức Hạ tầng

- **SQL Migrations (`NOT APPLIED LIVE — MANUAL SUPABASE SQL EDITOR REQUIRED`):**
  - Đã kiểm tra trực tiếp trên Supabase PostgREST live: `ktn_students` (1382), `ktn_teachers` (68), `ktn_classes` (135), `ktn_class_sessions` (9), `ktn_homeworks` (3), `ktn_messages` (57), `ktn_dlp_alerts` (1514), `ktn_push_subscriptions` (35).
  - Các bảng/RPC mới trả HTTP `404`: `ktn_provisioning_jobs`, `ktn_sync_events`, `ktn_class_schedules`, `ktn_notifications`, `rpc/ktn_search_students`.
  - Do `.env` không có `DATABASE_URL` hay Supabase Management PAT, chủ hệ thống cần chạy thủ công trong **Supabase SQL Editor** theo thứ tự:
    1. `supabase_migration_v3.sql`
    2. `supabase/migrations/20261116_ktn_scale_and_lifecycle_indexes.sql`
  - Đây cũng là lý do `/api/ktn/admin/students/search` và `/api/ktn/notifications` trên production hiện chạy qua fallback Schema V2 (`~805–991ms`).
- **Hạn mức hạ tầng:**
  - Cloudflare Zone `khongtunhi.com`: **`Free Website`** (`free`); Worker `usage_model: "standard"`, `compatibility_date: "2024-11-01"`.
  - Cloudflare Workers Paid/Free subscription: **`UNKNOWN`** (`/subscriptions` trả HTTP `403`).
  - Supabase Plan & izTeach AWS API Gateway/S3/CloudFront Plan: **`UNKNOWN`**.

---

## 6. Xác minh Live Không Phá Dữ Liệu (Playwright + API)

- **V1 `/custom-page/so-lien-lac`:** HTML từ Worker **đã gỡ sạch** `<link rel="manifest">` và V2 apple-icon (`hasManifest: false`, `hasAppleIcon: false`).
- **V2 `/custom-page/so-lien-lac-test`:** Phục vụ đúng commit **`20ca462`**, có `/manifest.json` (`200`, `start_url: "/custom-page/so-lien-lac-test"`, `display: "standalone"`), 4 PNG icons thật (`89504e47`), `/sw.js` active scope `/` (`ktn-pwa-v3`, route `homework_graded`, khớp strict `/custom-page/so-lien-lac-test`), `/api/ktn/push/vapid-public-key` (`200`).
- **Bảo toàn animation & i18n:** Zombie Defense (`<JiangshiPuppet />`) mount bình thường (`88` SVGs, 0 `pageerror`); toggle `VI | EN` hoạt động mượt qua Student, Teacher (`gv001@khongtunhi.com`), Admin (`quanly@khongtunhi.com`); nút **`Cài Desktop`** hiển thị trong header.
- **Lỗi console không chặn luồng (CORS):** Khi vào `#/games`, `vocabularyService.ts` gọi `https://ktn-sw-proxy.hocvienkhongtunhi123.workers.dev/api/ktn/vocab?level=hsk1` từ origin `https://khongtunhi.com` bị CORS block và fallback về bộ từ vựng đóng gói sẵn (game vẫn chạy bình thường).
