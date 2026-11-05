# KẾ HOẠCH CHUYỂN ĐỔI STRANGLER (`MIGRATION_PLAN.md`)

> Triển khai an toàn thế hệ giao diện mới **KTN UI V2** mà không làm gián đoạn việc học hàng ngày của học viên Học Viện Khổng Tử Nhí.

---

## 1. Chiến lược Strangler Migration 4 Giai đoạn

### Giai đoạn 1 — Chạy song song & Kiểm thử nội bộ (Đã hoàn tất)
- Giữ nguyên toàn bộ các trang HTML hiện hữu (`index.html`, `sll-hocsinh.html`, `sll-teacher.html`, `sll-admin.html`, `so-lien-lac.html`).
- Ứng dụng React mới nằm độc lập trong `apps/ktn-web-v2/`, sử dụng chung tầng BFF `/api/ktn/*` trên `cloudflare-worker-sw-proxy.js`.
- Đã vá đồng thời các lỗi Chat (`BUG CHAT-01` → `BUG CHAT-07`) cho cả ứng dụng mới và cổng HTML cũ.

### Giai đoạn 2 — Beta Opt-in cho Giáo viên & Lớp tiêu điểm (`YCT2-04`)
- Triển khai bản build tĩnh của `apps/ktn-web-v2/dist` dưới đường dẫn `/v2/*` (hoặc subdomain `app.khongtunhi.com`).
- Thêm nút chuyển đổi *"Trải nghiệm Giao diện KTN V2 Mới"* trên cổng học sinh/giáo viên cũ và nút *"Quay về giao diện cổ điển"* nếu phụ huynh cần đối chiếu.
- Vì cả V1 và V2 cùng đọc/ghi qua `/api/ktn/*` và Supabase PostgreSQL, tin nhắn gửi từ V2 hiển thị tức thì trên V1 và ngược lại.

### Giai đoạn 3 — Chuyển hướng mặc định theo từng Module
1. **Tuần 1:** Chuyển mặc định **Phòng Chat Zalo Lớp Học** & **Trung tâm Thông báo** sang UI V2.
2. **Tuần 2:** Chuyển mặc định **Phòng Học Video HLS & Nộp Bài Tập** sang UI V2.
3. **Tuần 3:** Chuyển mặc định **Cổng Giáo Viên (`/teacher`)** & **Cổng Quản Lý (`/admin`)** sang UI V2.

### Giai đoạn 4 — Thu hồi mã nguồn cũ sau nghiệm thu
- Sau 30 ngày vận hành ổn định không phát sinh lỗi hồi quy trên Production, lưu trữ các tệp HTML/JS cũ vào nhánh archive và đặt UI V2 làm giao diện chính tại `/`.

---

## 2. Phương án Rollback Tức Thì (< 60 giây)

- **Tầng Frontend:** Vì các tệp `sll-hocsinh.html`, `sll-teacher.html`, `sll-admin.html` không bị xóa và dữ liệu phiên đăng nhập (`ktn_sll_persistent_auth_v2`) tương thích hai chiều, việc rollback chỉ cần trỏ route về lại tệp HTML cũ.
- **Tầng Backend/Database:** Mọi mở rộng trong `cloudflare-worker-sw-proxy.js` (`pagination`, `clientMessageId`, `unreadCount`) đều là trường bổ sung (additive fields), không phá vỡ cấu trúc JSON mà code cũ đang đọc.
