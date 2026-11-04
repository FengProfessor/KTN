# 07 — RELEASE READINESS & DEPLOYMENT GATE

> **Mục đích:** Đánh giá điều kiện sẵn sàng phát hành (Release Gate), danh sách kiểm tra trước khi triển khai (Pre-Deployment Checklist), quy trình triển khai chuẩn và phương án khôi phục (Rollback Plan).

---

## 1. Bảng Đánh giá Cổng Phát hành (Release Gate Checklist)

| Tiêu chí Cổng Phát hành | Yêu cầu | Kết quả hiện tại | Trạng thái |
|---|---|---|:---:|
| **1. Không thay đổi giao diện sang UI V2** | Giữ nguyên thiết kế hiện tại; chỉ sửa lỗi chức năng, hiển thị trạng thái và đồng bộ | Đã tuân thủ 100% | **PASS** |
| **2. Không phá dữ liệu Production** | Không chạy test ghi/xóa trên production `khongtunhi.com`; bổ sung khóa chặn `ALLOW_PRODUCTION_WRITE_TESTS` trong `verify_security_and_flow.cjs` và CI | Đã khóa an toàn | **PASS** |
| **3. Kiểm tra cú pháp JS (`node --check`)** | Tất cả file Worker, Client SDK, LMS/UX và Test Suite không có lỗi cú pháp | 9/9 file đạt `node --check` | **PASS** |
| **4. Đồng nhất File Nguồn ↔ File Đích** | `node build_clean_real_portal.js` sinh ra `sll-hocsinh.html` và `demo_hsk1_student_portal.html` khớp 100% (`git diff --exit-code` = 0) | Không lệch byte nào | **PASS** |
| **5. Bộ kiểm thử Đồng bộ 3 chiều & Failure Injection** | 100% PASS trên Groups A, C, D (`tests/ktn_three_way_reliability_suite.cjs`) | **26/26 PASS** | **PASS** |
| **6. Bộ kiểm thử Trình duyệt Thật (Chromium E2E)** | 100% PASS trên Group B (`tests/ktn_browser_e2e_local.cjs`) | **5/5 PASS** | **PASS** |
| **7. Triển khai lên Production (`khongtunhi.com`)** | Chỉ triển khai khi Quản lý/Chủ dự án phê duyệt lệnh deploy | **PENDING DEPLOY APPROVAL** | **READY** |

---

## 2. Quy trình Triển khai An toàn (Khi được phê duyệt)

Khi bạn sẵn sàng đẩy bản cập nhật này lên môi trường Production (`https://khongtunhi.com`), thực hiện lần lượt 3 bước sau:

### Bước 1: Chạy lại cổng kiểm tra chất lượng tại máy local
```powershell
cd D:\Vibe\khongtunhi_sofl_style
node build_clean_real_portal.js
node tests/ktn_three_way_reliability_suite.cjs
node tests/ktn_browser_e2e_local.cjs
```

### Bước 2: Triển khai Cloudflare Worker (`cloudflare-worker-sw-proxy.js`)
```powershell
npx wrangler deploy
```
- Kiểm tra ngay endpoint sức khỏe sau khi deploy:
  ```powershell
  Invoke-RestMethod -Uri "https://khongtunhi.com/api/ktn/courses" -Method GET
  ```

### Bước 3: Triển khai các trang Sổ Liên Lạc (`sll-hocsinh.html`, `ktn-webapp-client.js`, `so-lien-lac-ux.js`, `so-lien-lac-lms.js`)
```powershell
node deploy_so_lien_lac_live.cjs
```

---

## 3. Phương án Khôi phục Khẩn cấp (Rollback Plan)

Nếu phát hiện bất kỳ dấu hiệu bất thường nào sau khi triển khai lên Production:

1. **Khôi phục Cloudflare Worker về phiên bản trước:**
   ```powershell
   npx wrangler rollback
   ```
2. **Khôi phục mã nguồn Git về commit baseline `9327c241cc80651e15e77bdf385eaa7812b7d3c1` (hoặc commit liền trước) và đẩy lại trang tĩnh:**
   ```powershell
   git checkout 9327c241cc80651e15e77bdf385eaa7812b7d3c1 -- cloudflare-worker-sw-proxy.js ktn-webapp-client.js portal_template.html sll-hocsinh.html demo_hsk1_student_portal.html so-lien-lac-ux.js so-lien-lac-lms.js
   node deploy_so_lien_lac_live.cjs
   ```
