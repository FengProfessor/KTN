# MA TRẬN TƯƠNG THÍCH API (`API_COMPATIBILITY.md`)

> Bảng đối chiếu toàn bộ các endpoint `/api/ktn/*` trên `cloudflare-worker-sw-proxy.js` phục vụ đồng thời cả cổng HTML cũ (`sll-hocsinh.html`, `sll-teacher.html`, `sll-admin.html`) và ứng dụng React mới (`apps/ktn-web-v2`).

---

## 1. Bảng tương thích Endpoint

| Endpoint | Phương thức | Màn hình cũ sử dụng | KTN UI V2 sử dụng | Thay đổi / Mở rộng tương thích ngược |
|---|---|---|---|---|
| `/api/ktn/auth/login` | `POST` | `ktn-webapp-client.js` | `ktnApi.login` (`useAuthStore`) | Giữ nguyên 100% cấu trúc `session` + `token` HMAC-SHA256 |
| `/api/ktn/auth/session` | `GET` | `ktn-webapp-client.js` | `ktnApi.verifySession` | Giữ nguyên 100% |
| `/api/ktn/auth/logout` | `POST` | `ktn-webapp-client.js` | `ktnApi.logout` | Thu hồi token phía server & xóa phiên local |
| `/api/ktn/courses` | `GET` | `portal_template.html` | `ktnApi.getCourses` | Giữ nguyên 100% |
| `/api/ktn/courses/units` | `GET` | `portal_template.html` | `ktnApi.getCourseUnits` | Kiểm tra quyền khóa học; trả `403 COURSE_NOT_ENTITLED` nếu học viên chưa mở khóa |
| `/api/ktn/classes` | `GET` | `so-lien-lac-lms.js` | `ktnApi.getClasses` | Giữ nguyên 100% |
| `/api/ktn/class-sessions` | `GET` / `POST` | `so-lien-lac-lms.js` | `ktnApi.getClassSessions` / `saveClassSession` | Giữ nguyên 100%, tự động phát sinh thông báo khi GV giao bài |
| `/api/ktn/homeworks/upload-url` | `POST` | `portal_template.html` | `ktnApi.uploadHomeworkFile` | Cấp Presigned S3 URL cho audio/ảnh bài tập |
| `/api/ktn/homeworks` | `GET` / `POST` | `portal_template.html`, `sll-teacher.html` | `ktnApi.getHomeworks` / `submitHomework` | Kiểm tra định dạng CloudFront URL + `HEAD` check dung lượng > 0 |
| `/api/ktn/homeworks/grade` | `PATCH` | `sll-teacher.html` | `ktnApi.gradeHomework` | Hỗ trợ điểm `0–10` bước `0.5` và trạng thái `graded` / `revision_requested` |
| `/api/ktn/messages/rooms` | `GET` | `so-lien-lac-lms.js` | `chatApi.getRooms` | **Mở rộng:** Bổ sung `unreadCount`, `lastMessageId`, `lastReadMessageId` theo từng tài khoản |
| `/api/ktn/messages` | `GET` | `so-lien-lac-lms.js` | `chatApi.getMessages` | **Mở rộng:** Bổ sung phân trang con trỏ (`limit`, `before`) và trả thêm object `pagination` |
| `/api/ktn/messages` | `POST` | `so-lien-lac-lms.js` | `chatApi.sendMessage` | **Mở rộng:** Nhận `clientMessageId` để khử trùng lặp idempotent và trả `serverMessageId` |
| `/api/ktn/messages/read` | `POST` / `PATCH` | *(Mới)* | `chatApi.markRoomRead` | **Mới:** Lưu mốc đã đọc theo từng phòng cho từng tài khoản |
| `/api/ktn/messages/pin` | `POST` | `so-lien-lac-lms.js` | `chatApi.pinAnnouncement` | Ghim thông báo quan trọng đầu phòng chat lớp |
| `/api/ktn/notifications` | `GET` | `so-lien-lac-lms.js` | `ktnApi.getNotifications` | Tổng hợp thông báo chấm bài, bài tập mới, tin nhắn mới kèm `read: boolean` |
| `/api/ktn/notifications/read` | `PATCH` | `so-lien-lac-lms.js` | `ktnApi.markNotificationsRead` | Đồng bộ trạng thái đã đọc xuyên thiết bị |
| `/api/ktn/students` | `GET` | `sll-teacher.html`, `sll-admin.html` | `ktnApi.getStudents` | Giữ nguyên 100% |
| `/api/ktn/students/courses` | `POST` | `sll-admin.html` | `ktnApi.manageStudentCourses` | Mở/thu hồi khóa học video & xếp lớp trực tiếp |
| `/api/ktn/orders` & `/approve` | `GET` / `POST` | `sll-admin.html` | `ktnApi.getOrders` / `approveOrder` | Duyệt đơn hàng 1 chạm |

---

## 2. Kiểm chứng Hồi quy Tương thích Ngược

Bộ kiểm thử hồi quy 3 chiều của hệ thống cũ (`node tests/ktn_three_way_reliability_suite.cjs`) đã được chạy lại sau khi nâng cấp `cloudflare-worker-sw-proxy.js` và đạt **32/32 PASS (100%)**.
