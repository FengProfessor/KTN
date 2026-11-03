# 07 — KẾ HOẠCH VẬN HÀNH & BƯỚC TIẾP THEO (NEXT ACTIONS)

> **Hệ thống:** Khổng Tử Nhí (`https://khongtunhi.com`)
> **Mục tiêu:** Duy trì độ ổn định, bảo mật và trải nghiệm mượt mà khi số lượng học sinh và lớp học tiếp tục tăng.

---

## 1. Các hạng mục đã hoàn tất 100% trong đợt này
- [x] Khắc phục triệt để 6 nhóm lỗi bảo mật, đồng시성 (concurrency), xác thực bài nộp S3, đồng bộ trạng thái thông báo và giao diện di động (`BUG-01` → `BUG-06`).
- [x] Đồng bộ toàn bộ **1.046/1.046 học sinh** từ izTeach sang Supabase (`ktn_students`) với cơ chế đối chiếu diff thực tế (`idempotent: true`).
- [x] Mở rộng bộ kiểm thử hồi quy tự động [verify_security_and_flow.cjs](file:///d:/Vibe/khongtunhi_sofl_style/verify_security_and_flow.cjs) lên **10 bộ kiểm thử toàn diện** (API + Concurrency + S3 Ownership + Puppeteer Real Browser + Mobile Viewport Matrix `360x800`..`1280x800` + Multi-Tab Sync).
- [x] Triển khai đồng bộ lên Cloudflare Worker (`ktn-prod-v2026.11.03`), CloudFront/S3 và đẩy mã nguồn sạch lên GitHub `main`.

---

## 2. Khuyến nghị vận hành định kỳ (Operations Playbook)

| Chu kỳ | Hành động khuyến nghị | Lệnh / Công cụ kiểm tra |
|---|---|---|
| **Sau mỗi lần sửa mã nguồn hoặc giao diện** | Chạy bộ kiểm thử hồi quy 10 bước trước và sau khi deploy để đảm bảo không phát sinh lỗi hồi quy. | `node verify_security_and_flow.cjs` |
| **Khi mở lớp mới hoặc đổi giáo viên phụ trách** | 1) Cập nhật mã lớp và email giáo viên trong trang Quản trị (`sll-admin.html` / bảng `ktn_classes`).<br>2) Giao buổi học và bài tập qua công cụ quản lý buổi học để học sinh nộp bài đúng mã bài tập đã giao. | `GET /api/ktn/classes` & `GET /api/ktn/class-sessions?classCode=<MÃ_LỚP>` |
| **Định kỳ hàng tuần** | Kiểm tra đồng bộ danh sách học viên từ izTeach sang Supabase (ngoài cơ chế tự động đồng bộ khi xếp lớp và đăng nhập đã chạy sẵn). | `POST /api/ktn/students/sync-all` (với quyền Admin) |

---

## 3. Đề xuất cải tiến giai đoạn tiếp theo (Optional Backlog — P3)
1. **Nén âm thanh tự động trên trình duyệt (Client-side Audio Compression):**
   - Hiện tại hệ thống đã nâng giới hạn file lên `50MB` và hỗ trợ đầy đủ `.wav`, `.mp3`, `.m4a`, `.webm`. Trong tương lai có thể tích hợp bộ mã hóa nhẹ trên trình duyệt để chuyển bản thu âm dài (>5 phút) sang định dạng nén `.mp3`/`.webm` giúp học sinh dùng mạng 3G/4G tải lên nhanh hơn nữa.
2. **Báo cáo tổng hợp tiến độ tuần gửi Phụ huynh:**
   - Tự động tổng hợp số bài đã hoàn thành và điểm trung bình hàng tuần của từng bé trong Sổ Liên Lạc để phụ huynh theo dõi nhanh trên điện thoại.
