# ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG PHÁT HÀNH (`RELEASE_READINESS.md`)

> Tổng kết trạng thái bàn giao kỹ thuật cho thế hệ giao diện mới **KTN UI V2**.

---

## 1. Checklist Nghiệm thu Bàn giao

| Hạng mục | Trạng thái | Bằng chứng xác thực |
|---|---|---|
| Kiểm toán hệ thống cũ & truy vết lỗi Chat | ✅ Hoàn thành | `docs/ui-v2/LEGACY_AUDIT.md` (Xác định & khắc phục `BUG CHAT-01` → `BUG CHAT-07`) |
| Xây dựng ứng dụng React + TypeScript + Vite mới | ✅ Hoàn thành | `apps/ktn-web-v2/` (`tsc -b && vite build` đạt 0 lỗi) |
| Chế độ Interactive Demo tách biệt rõ với Dữ liệu thật | ✅ Hoàn thành | `DemoControlBar.tsx` hiển thị rõ `CHẾ ĐỘ DEMO (MOCK DATA)` vs `DỮ LIỆU THẬT (/api/ktn/* BFF)` |
| Phòng Chat lớp học kiểu Zalo (2 cột Desktop, Fullscreen Mobile) | ✅ Hoàn thành | `src/features/chat/` + Kiểm thử E2E 2 tài khoản đồng thời (`TEST C`) |
| Máy trạng thái gửi tin nhắn (`sending -> sent \| failed` + Retry) | ✅ Hoàn thành | `useSendMessage.ts` + Kiểm thử bơm lỗi 503 & bấm `Thử lại` không nhân đôi (`C4`, `C5`) |
| Phòng học Video HLS + Chặn quyền `403 COURSE_NOT_ENTITLED` | ✅ Hoàn thành | `HlsVideoPlayer.tsx` + Kiểm thử tài khoản có quyền & không có quyền (`B1` → `B4`) |
| Luồng Nộp bài tập (Presigned S3) → Giáo viên chấm → Học sinh xem điểm | ✅ Hoàn thành | `HomeworkPanel.tsx`, `TeacherWorkspace.tsx` + Kiểm thử E2E (`E1` → `E3`) |
| Trung tâm Thông báo đa thiết bị & Đồng bộ trạng thái đã đọc | ✅ Hoàn thành | `NotificationCenter.tsx` + Kiểm thử reload giữ nguyên trạng thái đã đọc (`D1`) |
| Kiểm thử Responsive 5 kích thước (`360px` → `1440px`) & Chụp ảnh | ✅ Hoàn thành | 0px tràn ngang trên mọi viewport + 15 ảnh chụp trong `docs/ui-v2/screenshots/` |
| Không phá vỡ hệ thống cũ & không tự ý đẩy lên Production | ✅ Hoàn thành | `node tests/ktn_three_way_reliability_suite.cjs` đạt **32/32 PASS**; nhánh git riêng `feat/ktn-react-ui-v2` |

---

## 2. Hướng dẫn Chạy và Kiểm thử tại Máy cục bộ

```bash
# 1. Chạy ứng dụng KTN UI V2 (kèm Cloudflare Worker BFF tích hợp sẵn tại /api/ktn/*)
cd apps/ktn-web-v2
npm run dev

# 2. Chạy kiểm thử Unit & State Machine (Vitest)
npm run test:unit

# 3. Chạy kiểm thử Trình duyệt thực E2E & Chụp ảnh đa thiết bị (Playwright)
node tests/e2e/verify-ui-v2.mjs

# 4. Chạy kiểm thử Hồi quy 3 chiều của toàn bộ hệ thống cũ & BFF
cd ../..
node tests/ktn_three_way_reliability_suite.cjs
```

---

## 3. Khuyến nghị Trước Khi Chuyển Đổi Production Chính Thức

1. **Áp dụng Migration SQL:** Chạy tệp `docs/ui-v2/migrations/001_chat_and_notifications_v2.sql` trên Supabase Staging/Production để kích hoạt chỉ mục phân trang con trỏ (`idx_ktn_messages_room_cursor`) và chỉ mục chống trùng lặp (`idx_ktn_messages_room_client_msg_id`).
2. **Triển khai Strangler Beta:** Xuất bản thư mục `apps/ktn-web-v2/dist` lên nhánh preview Cloudflare Pages để đội ngũ Giáo viên chủ nhiệm nghiệm thu thực tế trên lớp `YCT2-04` trước khi bật mặc định cho toàn bộ học viên.
