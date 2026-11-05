# ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG PHÁT HÀNH (`RELEASE_READINESS.md`)

> Tổng kết trạng thái bàn giao kỹ thuật cho thế hệ giao diện mới **KTN UI V2 — Mobile Compact Redesign & Complete 3-Role UX Separation**.

---

## 1. Checklist Nghiệm thu Bàn giao

| Hạng mục | Trạng thái | Bằng chứng xác thực |
|---|---|---|
| Kiểm toán hệ thống cũ & truy vết lỗi Chat | ✅ Hoàn thành | `docs/ui-v2/LEGACY_AUDIT.md` (Xác định & khắc phục `BUG CHAT-01` → `BUG CHAT-07`) |
| Tách biệt hoàn toàn 3 vai trò (`StudentHome`, `TeacherHome`, `AdminHome`) | ✅ Hoàn thành | `RoleHome.tsx`, `navigationConfig.ts`, `RoleBottomNavigation.tsx`, `RoleDesktopNavigation.tsx` + `TEST H (H1 → H9 PASS)` |
| Thiết kế lại Mobile Compact (`48px` Header, 0 Hero cao, 2x2 Quick Actions) | ✅ Hoàn thành | `CompactUi.tsx`, `AppShell.tsx` + `TEST I (13/13 PASS trên 360px, 375px, 390px, 430px)` |
| Cách ly tuyệt đối `authUser` (Live) và `demoUser` (Demo) | ✅ Hoàn thành | `useAuthStore.ts`, `ktnApiClient.ts`, `DemoControlBar.tsx` + Unit Test & `TEST H9 PASS` |
| Phòng Chat lớp học kiểu Zalo (2 cột Desktop, Fullscreen Mobile gọn nhẹ) | ✅ Hoàn thành | `src/features/chat/` + Kiểm thử E2E 2 tài khoản đồng thời (`TEST C` & `I-chat-composer-390px`) |
| Máy trạng thái gửi tin nhắn (`sending -> sent \| failed` + Retry) | ✅ Hoàn thành | `useSendMessage.ts` + Kiểm thử bơm lỗi 503 & bấm `Thử lại` không nhân đôi (`C4`, `C5`) |
| Phòng học Video HLS + Chặn quyền `403 COURSE_NOT_ENTITLED` | ✅ Hoàn thành | `HlsVideoPlayer.tsx`, `LearningPage.tsx` + Kiểm thử tài khoản có quyền & không có quyền (`B1` → `B4`) |
| Luồng Nộp bài tập (Presigned S3) → Giáo viên chấm → Học sinh xem điểm | ✅ Hoàn thành | `HomeworkPanel.tsx`, `TeacherWorkspace.tsx` + Kiểm thử E2E (`E1` → `E4`) |
| Trung tâm Thông báo đa thiết bị & Đồng bộ trạng thái đã đọc | ✅ Hoàn thành | `NotificationCenter.tsx` + Kiểm thử reload giữ nguyên trạng thái đã đọc (`D1` → `D3`) |
| Kiểm thử Responsive (`360px` → `1440px`) & 27 Ảnh chụp nghiệm thu | ✅ Hoàn thành | 0px tràn ngang trên mọi viewport + 15 ảnh trong `docs/ui-v2/screenshots/` + 12 ảnh trong `docs/ui-v2/screenshots/role-audit/` |
| Không phá vỡ hệ thống cũ & không tự ý đẩy lên Production | ✅ Hoàn thành | `node tests/ktn_three_way_reliability_suite.cjs` đạt **32/32 PASS**; nhánh git riêng `feat/ktn-react-ui-v2` |

---

## 2. Hướng dẫn Chạy và Kiểm thử tại Máy cục bộ

```bash
# 1. Chạy ứng dụng KTN UI V2 (kèm Cloudflare Worker BFF tích hợp sẵn tại /api/ktn/*)
cd apps/ktn-web-v2
npm run dev

# 2. Kiểm tra TypeScript Strict & Chạy kiểm thử Unit (Vitest)
npm run typecheck
npm run test:unit

# 3. Build Production Bundle
npm run build

# 4. Chạy kiểm thử Trình duyệt thực E2E (81 checks) & Chụp ảnh đa thiết bị (Playwright)
npm run test:e2e

# 5. Chạy kiểm thử Hồi quy 3 chiều của toàn bộ hệ thống cũ & BFF (32 checks)
cd ../..
node tests/ktn_three_way_reliability_suite.cjs
```

---

## 3. Khuyến nghị Trước Khi Chuyển Đổi Production Chính Thức

1. **Áp dụng Migration SQL:** Chạy tệp `docs/ui-v2/migrations/001_chat_and_notifications_v2.sql` trên Supabase Staging/Production để kích hoạt chỉ mục phân trang con trỏ (`idx_ktn_messages_room_cursor`) và chỉ mục chống trùng lặp (`idx_ktn_messages_room_client_msg_id`).
2. **Triển khai Strangler Beta:** Xuất bản thư mục `apps/ktn-web-v2/dist` lên nhánh preview Cloudflare Pages để đội ngũ Giáo viên chủ nhiệm và Quản lý Học vụ nghiệm thu thực tế trên 3 vai trò trước khi bật mặc định cho toàn bộ học viên.
