# BÁO CÁO KIỂM THỬ TOÀN DIỆN (`TEST_REPORT.md`)

> Tất cả kết quả dưới đây được ghi nhận từ việc thực thi trực tiếp các bộ kiểm thử tự động trên mã nguồn thật (Vitest, Playwright Real-Browser Chromium, và Node BFF Reliability Suite).

---

## 1. Tổng hợp Kết quả Thực thi

| Bộ kiểm thử | Lệnh thực thi | Số lượng Test | Kết quả | Thời gian |
|---|---|---|---|---|
| **Legacy & BFF Three-Way Reliability Suite** | `node tests/ktn_three_way_reliability_suite.cjs` | 32 tests | **32 / 32 PASS (100%)** | ~2.1s |
| **KTN UI V2 Unit & Role-Isolation Suite** | `npm run test:unit` (`vitest run`) | 12 tests | **12 / 12 PASS (100%)** | ~1.9s |
| **KTN UI V2 TypeScript Strict & Production Build** | `npm run build` (`tsc -b && vite build`) | 1684 modules | **PASS (Exit code 0)** | ~10.9s |
| **KTN UI V2 Real-Browser E2E & Role/Mobile Audit** | `npm run test:e2e` (`node tests/e2e/verify-ui-v2.mjs`) | 81 checks (TEST A → I) | **81 / 81 PASS (100%)** | ~55s |

---

## 2. Chi tiết Các Nhóm Kiểm Thử E2E Trình Duyệt Thực (`verify-ui-v2.mjs`)

### TEST A — Xác thực, Phân quyền Route Guard & Phiên đăng nhập
- **A1 (`PASS`):** Nhập sai mật khẩu hiển thị cảnh báo lỗi rõ ràng (`[data-testid="login-error-alert"]`, `role="alert"`).
- **A2 (`PASS`):** Đăng nhập tài khoản học viên `hoangngan@khongtunhi.com` tải đúng `StudentHome` (`Bé Nguyễn Hoàng Ngân`).
- **A3 (`PASS`):** Tải lại trình duyệt (`page.reload()`) giữ nguyên phiên đăng nhập hợp lệ.
- **A4 (`PASS`):** RBAC Route Guard (`[data-testid="role-forbidden-guard"]`, `role="alert"`) chặn Học sinh truy cập trực tiếp `/teacher` và `/admin`.
- **A5 (`PASS`):** Đăng xuất thu hồi phiên, xóa sạch bản nháp/trạng thái hội thoại của người dùng trước trong `localStorage`, và điều hướng về `/login`.
- **A6 (`PASS`):** Đăng nhập tài khoản Quản lý (`quanly@khongtunhi.com`) tải đúng `AdminHome` (`/`) và `AdminWorkspace` (`/admin`).

### TEST B — Phòng học Video HLS, Bảo vệ Bản quyền Khóa học & Học viên chưa xếp lớp
- **B1 (`PASS`):** Học viên đã mở khóa (`hoangngan@khongtunhi.com`) thấy rõ tách biệt Khóa học Video vs Lớp học và tải trình phát HLS (`[data-testid="hls-video-element"]`) cùng giáo trình `Bài 1: AI小语，你好！`.
- **B2 (`PASS`):** Chuyển sang `Bài 2: 我叫李文` cập nhật trình phát video và đánh dấu hoàn thành bài học.
- **B3 (`PASS`):** Học viên chưa xếp lớp (`taphong2002vip@gmail.com`) hiển thị trung thực `"Học viên tự học / Chưa xếp lớp"`, tuyệt đối không gán giả vào lớp `YCT2-04`.
- **B4 (`PASS`):** Học viên chưa mở khóa (`taphong2002vip@gmail.com`) bị chặn bởi màn hình `403 COURSE_NOT_ENTITLED` (`[data-testid="video-unentitled-guard"]`) trên `/learning`.
- **B5 (`PASS`):** Học viên chưa xếp lớp trực tiếp nhìn thấy trạng thái trống trung thực (`[data-testid="unassigned-class-empty-state"]`) trên `/classrooms`.

### TEST C — Phòng Chat Lớp Học Kiểu Zalo (2 Tài Khoản + Voice + Bơm Lỗi Mạng + Idempotent Retry)
- **C1 (`PASS`):** Hiển thị thanh ghim thông báo lớp học gọn 1 dòng (`[data-testid="pinned-announcement-banner"]`).
- **C2 (`PASS`):** Bộ lọc an toàn học đường DLP phát hiện số điện thoại cá nhân (`0912345678`), hiện cảnh báo (`role="alert"`) và khóa nút Gửi.
- **C3 (`PASS`):** Học sinh gửi tin nhắn trong phòng `class:YCT2-04` → Giáo viên (`linh.lam@khongtunhi.com`) nhận được tin nhắn trên trình duyệt thứ 2 → Học sinh reload trang tin nhắn vẫn còn nguyên từ DB.
- **C4 (`PASS`):** Bơm lỗi `503 Simulated DB Error` vào `POST /api/ktn/messages` → Giao diện chuyển sang trạng thái `"Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị."` (`[data-testid="msg-status-failed"]`, `role="alert"`) và giữ nguyên bản nháp.
- **C5 (`PASS`):** Gỡ lỗi mạng và bấm nút `"Thử lại"` (`[data-testid="retry-failed-message-btn"]`) → Gửi lại thành công với cùng `clientMessageId` và chỉ xuất hiện **đúng 1 tin nhắn**.
- **C6 (`PASS`):** Thu âm và gửi tin nhắn thoại (`VoiceRecorder`) lưu bền vững dưới dạng `data:audio/wav;base64,...`, giữ nguyên sau khi tải lại trang và phát lại được ngay trên trình duyệt của Giáo viên (`[data-testid="chat-audio-player"]`).
- **C7 (`PASS`):** Cách ly quyền truy cập RBAC: Học viên lớp `YCT3-02` (`minhkhang@khongtunhi.com`) gọi API đọc tin nhắn lớp `YCT2-04` bị chặn với mã `HTTP 403`.

### TEST D — Trung tâm Thông báo, Sự kiện Giao bài Buổi học & Điều hướng Deep-Link
- **D1 (`PASS`):** Giáo viên giao bài tập buổi học mới (`POST /api/ktn/class-sessions` cho `YCT2-04` Buổi 2) tạo thông báo thật `homework_assigned` cho Học sinh trong `/notifications`.
- **D2 (`PASS`):** Bấm vào thông báo `homework_assigned` tự động đánh dấu đã đọc và điều hướng chính xác tới `/classrooms?class=YCT2-04&session=2`.
- **D3 (`PASS`):** Học viên bấm `"Đọc tất cả"`, tải lại trang (`page.reload()`) và trạng thái `0 chưa đọc` được giữ nguyên từ máy chủ (`PATCH /api/ktn/notifications/read`).

### TEST E — Luồng Nộp Bài Tập (Lớp Trực Tiếp & Khóa Video) → Yêu cầu Sửa bài → Chấm Điểm 10/10
- **E1 (`PASS`):** Bài tập lớp trực tiếp (`/classrooms`) được cách ly hoàn toàn với bài tập khóa học video (`course_id = 'CLASS_YCT2-04'`, `lesson_num = 101`) và hỗ trợ nộp bài trực tiếp ngay tại từng buổi học.
- **E2 (`PASS`):** Học viên nộp bài tập khóa video Bài 2 qua Presigned S3 URL + `POST /api/ktn/homeworks` → Trạng thái chuyển sang `"Chờ chấm"`.
- **E3 (`PASS`):** Giáo viên yêu cầu sửa lại bài (`revision_requested`) → Học viên nhìn thấy lời phê và thực hiện nộp lại bài sửa thành công.
- **E4 (`PASS`):** Giáo viên chấm bài nộp lại đạt `10/10` → Học viên bấm vào thông báo chấm bài trong `/notifications`, được điều hướng thẳng tới `/learning?courseId=6adadba969897b0002482ca5&lesson=2&tab=homework` và thấy ngay `Điểm: 10 / 10` cùng nhận xét.

### TEST F & G — Kiểm thử Đa Thiết Bị (8 Kích Thước Màn Hình: `360px` → `1440px`) & Accessibility
- **F1..F32 (`PASS`):** Kiểm tra `document.documentElement.scrollWidth - window.innerWidth === 0px` (không tràn ngang) trên toàn bộ 8 kích thước màn hình (`360px`, `375px`, `390px`, `430px`, `768px`, `1024px`, `1280px`, `1440px`) cho cả 4 phân hệ chính.
- **G1 (`PASS`):** Kiểm thử Accessibility tự động: điều hướng bàn phím `Tab`, `0` nút icon thiếu nhãn `aria-label`/`title`, và quy tắc `@media (prefers-reduced-motion: reduce)` hoạt động.
- **G2 (`PASS`):** Chụp thành công 15 ảnh màn hình thực tế tại `390px`, `768px`, `1440px` lưu trong `docs/ui-v2/screenshots/`.

### TEST H — Kiểm thử Phân tách Tuyệt đối 3 Vai trò (`StudentHome`, `TeacherHome`, `AdminHome`)
- **H1 (`PASS`):** Học sinh mở `/` hiển thị `StudentHome` (`[data-testid="student-home-view"]`), nút `Học tiếp` nằm ngay trong viewport đầu tiên (`above the fold`), header hiển thị `"Chào Hoàng Ngân 👋"`, không lộ nút quản trị hay chấm bài.
- **H2 (`PASS`):** Giáo viên mở `/` hiển thị `TeacherHome` (`[data-testid="teacher-home-view"]`), thẻ ưu tiên bài chờ chấm và danh sách lớp phụ trách, header hiển thị `"Chào Cô Lâm Mỹ Linh"`, tuyệt đối không render `StudentDashboard`.
- **H3 (`PASS`):** Quản lý mở `/` hiển thị `AdminHome` (`[data-testid="admin-home-view"]`), 3 thẻ KPI nhỏ gọn và danh sách việc cần xử lý, header hiển thị `"Quản lý học vụ"`, tuyệt đối không render `StudentDashboard`.
- **H4 (`PASS`):** Thanh điều hướng đáy trên điện thoại (`RoleBottomNavigation`) hiển thị đúng 5 mục riêng biệt cho từng vai trò (`S=Trang chủ|Học|Lớp|Tin nhắn|Thông báo`, `T=Tổng quan|Lớp|Chấm bài|Tin nhắn|Thông báo`, `A=Tổng quan|Học viên|Lớp|Đơn hàng|Thêm`) và bấm chuyển trang chính xác cả 15 nút.
- **H5 (`PASS`):** Bấm nút biểu tượng KTN trên Header (`[data-testid="header-home-btn"]`) đưa từng vai trò về đúng trang chủ của vai trò đó (`StudentHome` / `TeacherHome` / `AdminHome`).
- **H6 (`PASS`):** Reload trang `/` khi đang đăng nhập Giáo viên hoặc Quản lý giữ nguyên phiên và trang chủ theo đúng vai trò, không chớp sang giao diện Học sinh.
- **H7 (`PASS`):** Chuyển đổi tuần tự `Teacher -> Logout -> Student -> Logout -> Admin -> Logout -> Teacher` xóa sạch cache/drafts, không rò rỉ menu hoặc dữ liệu của tài khoản trước.
- **H8 (`PASS`):** Bảo vệ đường dẫn theo vai trò: Giáo viên bị chặn khỏi `/admin`, Học sinh bị chặn khỏi `/teacher` và `/admin`.
- **H9 (`PASS`):** `DemoControlBar` ẩn hoàn toàn ở chế độ Live (`!isDemoMode`), và khi đăng nhập thật thất bại không bao giờ tự động rơi về `demoUser`.

### TEST I — Kiểm toán Mobile Compact Đa Khung Nhìn (`360px`, `375px`, `390px`, `430px`) & 12 Ảnh Chụp Role-Audit
- **I-student/teacher/admin (`360px`, `375px`, `390px`, `430px` — `12/12 PASS`):** Chiều cao Header đạt đúng `48px <= 56px`, `overflowDelta = 0px`, không rò rỉ chuỗi kỹ thuật (`undefined`, `null`, `[object Object]`, `NaN`), và CTA chính nằm trọn trong màn hình đầu tiên.
- **I-chat-composer-390px (`PASS`):** Khung nhập tin nhắn trên điện thoại (`390x844`) nằm hoàn toàn phía trên thanh điều hướng đáy (`composerBottom: 757px < bottomNavTop: 788px`), không bị che khuất.
- **Bộ 12 ảnh chụp `docs/ui-v2/screenshots/role-audit/`:** Đã xuất đầy đủ `student-mobile-390.png`, `teacher-mobile-390.png`, `admin-mobile-390.png`, `student-mobile-360.png`, `teacher-mobile-360.png`, `admin-mobile-360.png`, `student-desktop-1440.png`, `teacher-desktop-1440.png`, `admin-desktop-1440.png`, `chat-mobile-390.png`, `learning-mobile-390.png`, `notifications-mobile-390.png`.
