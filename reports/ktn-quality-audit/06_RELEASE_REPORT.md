# 06 — BÁO CÁO TRIỂN KHAI & ĐỐI CHIẾU PRODUCTION (RELEASE REPORT)

> **Hệ thống:** Khổng Tử Nhí (`https://khongtunhi.com`)
> **Repository:** `https://github.com/FengProfessor/KTN`
> **Baseline trước khi triển khai:** `ece1873b163888537200017cc25b044738e07984`

---

## 1. Thông tin bản phát hành trên Production

| Thành phần hạ tầng | Định danh / Đường dẫn Production | Trạng thái |
|---|---|---|
| **Cloudflare Worker (`ktn-sw-proxy`)** | - **Version ID:** `fd41f96b-28f8-41a0-82a2-ca8dc4cf0c3e`<br>- **Header xác minh:** `X-KTN-Worker-Version: ktn-prod-v2026.11.03`<br>- **Routes:** `khongtunhi.com/*`, `www.khongtunhi.com/*` | **LIVE & VERIFIED** |
| **CloudFront / S3 Static Assets** | - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/sofl-remake/so-lien-lac-bundle-v1793705308062.js` (`1,353,142 bytes`)<br>- `.../so-lien-lac-bundle-v1793454892901.css` (`178,212 bytes`)<br>- `.../ktn-webapp-client.js` (`20,134 bytes`)<br>- `.../sll-hocsinh.html` (`496,859 bytes`)<br>- `.../sll-teacher.html` (`32,465 bytes`)<br>- `.../sll-admin.html` (`38,133 bytes`) | **LIVE & VERIFIED** |
| **izTeach Custom Page & Vendor Setting** | - Custom Page `6adff7ba36309b0002b6e659` (`PUT /custom-page-vendor-setting -> 200 OK`)<br>- Global Auth Hook `externalScript[1]` (`PUT /vendor-setting -> 200 OK`) | **LIVE & VERIFIED** |
| **Supabase Database (`ktn_*`)** | - `ktn_students`: `1,046 / 1,046` học viên đồng bộ (`idempotent: true`)<br>- `ktn_dlp_alerts`: lưu trữ nguyên tử các token đã thu hồi (`room_id = 'AUTH_REVOKED'`)<br>- `ktn_payment_config`: đã dọn sạch dòng tạm `revoked_sessions` | **LIVE & VERIFIED** |

---

## 2. Danh sách tệp tin thay đổi trong đợt phát hành

1. [cloudflare-worker-sw-proxy.js](file:///d:/Vibe/khongtunhi_sofl_style/cloudflare-worker-sw-proxy.js):
   - Bổ sung header `X-KTN-Worker-Version: ktn-prod-v2026.11.03`.
   - Chuyển cơ chế thu hồi token sang atomic per-row insert/lookup trên `ktn_dlp_alerts`.
   - Ràng buộc quyền sở hữu thư mục S3 theo từng học sinh (`studentFolder`), kiểm tra allowlist định dạng file, giới hạn `50MB`, và `HEAD` request xác nhận file tồn tại thật trên CloudFront trước khi ghi `ktn_homeworks`.
   - Kiểm tra `lessonNum` thuộc đúng buổi học & bài tập đã giao của lớp (`getMergedClassSessions`).
   - Chuẩn hóa canonical ID thông báo chấm bài (`NOTIF-GRADED-${hw.id}-${hw.status}-${hw.score ?? ''}`).
   - Ẩn `teacher_email` khi khách gọi `GET /api/ktn/classes` và kiểm tra regex SĐT trên `POST /api/ktn/orders`.
2. [ktn-webapp-client.js](file:///d:/Vibe/khongtunhi_sofl_style/ktn-webapp-client.js):
   - Dọn sạch toàn bộ cache bài nộp và thông báo cục bộ khi `logout()`.
   - Thêm hàng đợi `ktn_pending_revoke_token` đảm bảo thu hồi token bù nếu người dùng đăng xuất khi mất mạng.
3. [so-lien-lac-lms.js](file:///d:/Vibe/khongtunhi_sofl_style/so-lien-lac-lms.js):
   - Đồng bộ canonical ID thông báo chấm bài và khử trùng lặp theo `(courseId, lessonNum)`.
   - Chuyển `savePushSubscriptionToCloud()` sang gọi `/api/ktn/push/subscribe`.
4. [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html), [sll-teacher.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-teacher.html), [sll-admin.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-admin.html):
   - Cải thiện ngôn ngữ thân thiện cho học sinh tiểu học, khóa chống bấm đúp, kiểm tra file ngay khi chọn, bổ sung bộ đếm trạng thái cho giáo viên, và sửa lỗi tràn ngang trên màn hình `360x800`.
5. [verify_security_and_flow.cjs](file:///d:/Vibe/khongtunhi_sofl_style/verify_security_and_flow.cjs):
   - Mở rộng lên 10 bộ kiểm thử hồi quy toàn diện.

---

## 3. Hướng dẫn khôi phục nhanh (Rollback Plan)
Nếu cần quay lại phiên bản trước đó bất kỳ lúc nào:
1. **Khôi phục mã nguồn Git:**
   ```bash
   git checkout ece1873b163888537200017cc25b044738e07984
   ```
2. **Khôi phục Cloudflare Worker:**
   ```bash
   npx wrangler deploy
   ```
3. **Khôi phục gói giao diện S3/CloudFront:**
   ```bash
   node deploy_so_lien_lac_live.cjs
   ```
