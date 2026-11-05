# BÁO CÁO KIỂM THỬ TOÀN DIỆN (`TEST_REPORT.md`)

> Tất cả kết quả dưới đây được ghi nhận từ việc thực thi trực tiếp các bộ kiểm thử tự động trên mã nguồn thật (Vitest, Playwright Real-Browser Chromium, và Node BFF Reliability Suite).

---

## 1. Tổng hợp Kết quả Thực thi

| Bộ kiểm thử | Lệnh thực thi | Số lượng Test | Kết quả | Thời gian |
|---|---|---|---|---|
| **Legacy & BFF Three-Way Reliability Suite** | `node tests/ktn_three_way_reliability_suite.cjs` | 32 tests | **32 / 32 PASS (100%)** | ~2.1s |
| **KTN UI V2 Unit & State-Machine Suite** | `npm run test:unit` (`vitest run`) | 9 tests | **9 / 9 PASS (100%)** | ~1.5s |
| **KTN UI V2 TypeScript Strict & Production Build** | `npm run build` (`tsc -b && vite build`) | 1676 modules | **PASS (Exit code 0)** | ~5.3s |
| **KTN UI V2 Real-Browser E2E & Responsive Suite** | `npm run test:e2e` (`node tests/e2e/verify-ui-v2.mjs`) | 59 checks (TEST A → G) | **59 / 59 PASS (100%)** | ~150s |

---

## 2. Chi tiết Các Nhóm Kiểm Thử E2E Trình Duyệt Thực (`verify-ui-v2.mjs`)

### TEST A — Xác thực, Phân quyền Route Guard & Phiên đăng nhập
- **A1 (`PASS`):** Nhập sai mật khẩu hiển thị cảnh báo lỗi rõ ràng (`[data-testid="login-error-alert"]`, `role="alert"`), không treo màn hình.
- **A2 (`PASS`):** Đăng nhập tài khoản học viên `hoangngan@khongtunhi.com` tải đúng trang Tổng quan Học sinh (`Bé Nguyễn Hoàng Ngân`).
- **A3 (`PASS`):** Tải lại trình duyệt (`page.reload()`) giữ nguyên phiên đăng nhập hợp lệ.
- **A4 (`PASS`):** RBAC Route Guard (`[data-testid="role-forbidden-guard"]`, `role="alert"`) chặn Học sinh truy cập trực tiếp `/teacher` và `/admin`.
- **A5 (`PASS`):** Đăng xuất thu hồi phiên, xóa sạch bản nháp/trạng thái hội thoại của người dùng trước trong `localStorage`, và điều hướng về `/login`.
- **A6 (`PASS`):** Đăng nhập tài khoản Quản lý (`quanly@khongtunhi.com`) tải đúng không gian làm việc Quản lý Học vụ (`/admin`).

### TEST B — Phòng học Video HLS, Bảo vệ Bản quyền Khóa học & Học viên chưa xếp lớp
- **B1 (`PASS`):** Học viên đã mở khóa (`hoangngan@khongtunhi.com`) thấy rõ 2 khối tách biệt (`Khóa học Video Tự Học` vs `Lớp Học Trực Tiếp Cùng Lão Sư`) và tải trình phát HLS (`[data-testid="hls-video-element"]`) cùng giáo trình `Bài 1: AI小语，你好！`.
- **B2 (`PASS`):** Chuyển sang `Bài 2: 我叫李文` cập nhật trình phát video và đánh dấu hoàn thành bài học (`Đã hoàn thành bài học`).
- **B3 (`PASS`):** Học viên chưa xếp lớp (`taphong2002vip@gmail.com`) hiển thị trung thực `"Học viên tự học / Chưa xếp lớp"` trên sidebar và trang chủ, tuyệt đối không gán giả vào lớp `YCT2-04`.
- **B4 (`PASS`):** Học viên chưa mở khóa (`taphong2002vip@gmail.com`) bị chặn bởi màn hình `403 COURSE_NOT_ENTITLED` (`[data-testid="video-unentitled-guard"]`) trên `/learning`.
- **B5 (`PASS`):** Học viên chưa xếp lớp trực tiếp nhìn thấy trạng thái trống trung thực (`[data-testid="unassigned-class-empty-state"]`) trên `/classrooms`.

### TEST C — Phòng Chat Lớp Học Kiểu Zalo (2 Tài Khoản + Voice + Bơm Lỗi Mạng + Idempotent Retry)
- **C1 (`PASS`):** Hiển thị thanh ghim thông báo lớp học (`[data-testid="pinned-announcement-banner"]`).
- **C2 (`PASS`):** Bộ lọc an toàn học đường DLP phát hiện số điện thoại cá nhân (`0912345678`), hiện cảnh báo (`role="alert"`) và khóa nút Gửi.
- **C3 (`PASS`):** Học sinh gửi tin nhắn trong phòng `class:YCT2-04` → Giáo viên (`linh.lam@khongtunhi.com`) nhận được tin nhắn trên trình duyệt thứ 2 → Học sinh reload trang tin nhắn vẫn còn nguyên từ DB.
- **C4 (`PASS`):** Bơm lỗi `503 Simulated DB Error` vào `POST /api/ktn/messages` → Giao diện chuyển sang trạng thái `"Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị."` (`[data-testid="msg-status-failed"]`, `role="alert"`) và giữ nguyên bản nháp trong ô nhập.
- **C5 (`PASS`):** Gỡ lỗi mạng và bấm nút `"Thử lại"` (`[data-testid="retry-failed-message-btn"]`) → Gửi lại thành công với cùng `clientMessageId` và chỉ xuất hiện **đúng 1 tin nhắn** (không bị nhân đôi).
- **C6 (`PASS`):** Thu âm và gửi tin nhắn thoại (`VoiceRecorder`) lưu bền vững dưới dạng `data:audio/wav;base64,...`, giữ nguyên sau khi tải lại trang và phát lại được ngay trên trình duyệt của Giáo viên (`[data-testid="chat-audio-player"]`).
- **C7 (`PASS`):** Cách ly quyền truy cập RBAC: Học viên lớp `YCT3-02` (`minhkhang@khongtunhi.com`) gọi API đọc tin nhắn lớp `YCT2-04` bị chặn với mã `HTTP 403`.

### TEST D — Trung tâm Thông báo, Sự kiện Giao bài Buổi học & Điều hướng Deep-Link
- **D1 (`PASS`):** Giáo viên giao bài tập buổi học mới (`POST /api/ktn/class-sessions` cho `YCT2-04` Buổi 2) tạo thông báo thật `homework_assigned` cho Học sinh trong `/notifications`.
- **D2 (`PASS`):** Bấm vào thông báo `homework_assigned` tự động đánh dấu đã đọc và điều hướng chính xác tới `/classrooms?class=YCT2-04&session=2`.
- **D3 (`PASS`):** Học viên bấm `"Đánh dấu đã đọc tất cả"`, tải lại trang (`page.reload()`) và trạng thái `0 chưa đọc` được giữ nguyên từ máy chủ (`PATCH /api/ktn/notifications/read`).

### TEST E — Luồng Nộp Bài Tập (Lớp Trực Tiếp & Khóa Video) → Yêu cầu Sửa bài → Chấm Điểm 10/10
- **E1 (`PASS`):** Bài tập lớp trực tiếp (`/classrooms`) được cách ly hoàn toàn với bài tập khóa học video (`course_id = 'CLASS_YCT2-04'`, `lesson_num = 101`) và hỗ trợ nộp bài trực tiếp ngay tại từng buổi học.
- **E2 (`PASS`):** Học viên nộp bài tập khóa video Bài 2 qua Presigned S3 URL + `POST /api/ktn/homeworks` → Trạng thái chuyển sang `"Đã nộp • Đang chờ Lão sư chấm"`.
- **E3 (`PASS`):** Giáo viên yêu cầu sửa lại bài (`revision_requested`) → Học viên nhìn thấy trạng thái `"Cần nộp lại theo nhận xét giáo viên"` kèm lời phê và thực hiện nộp lại bài sửa thành công.
- **E4 (`PASS`):** Giáo viên chấm bài nộp lại đạt `10/10` → Học viên bấm vào thông báo chấm bài trong `/notifications`, được điều hướng thẳng tới `/learning?courseId=6adadba969897b0002482ca5&lesson=2&tab=homework` và thấy ngay `Điểm: 10 / 10` cùng nhận xét.

### TEST F & G — Kiểm thử Đa Thiết Bị (8 Kích Thước Màn Hình: `360px` → `1440px`) & Accessibility
- **F1..F32 (`PASS`):** Kiểm tra `document.documentElement.scrollWidth - window.innerWidth === 0px` (không tràn ngang) trên toàn bộ 8 kích thước màn hình (`360px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1280px`, `1440px`) cho cả 4 phân hệ chính.
- **G1 (`PASS`):** Kiểm thử Accessibility tự động: điều hướng bàn phím `Tab`, `0` nút icon thiếu nhãn `aria-label`/`title`, và quy tắc `@media (prefers-reduced-motion: reduce)` hoạt động.
- **G2 (`PASS`):** Chụp thành công 15 ảnh màn hình thực tế tại `390px`, `768px`, `1440px` lưu trong `docs/ui-v2/screenshots/`.
