# ĐÁNH GIÁ GIAO DIỆN & TRẢI NGHIỆM NGƯỜI DÙNG (`UI_REVIEW.md`)

> Đối chiếu trực quan từ bộ ảnh chụp màn hình trình duyệt thực tế tại `docs/ui-v2/screenshots/role-audit/` và `docs/ui-v2/screenshots/` trên các kích thước chuẩn: Điện thoại (`360x780`, `390x844`), Máy tính bảng (`768x1024`) và Máy tính bàn (`1440x900`).

---

## 1. Bộ Ảnh Nghiệm Thu Phân Tách 3 Vai Trò & Mobile Compact (`docs/ui-v2/screenshots/role-audit/`)

| Vai trò / Màn hình | Mobile (`390x844`) | Mobile nhỏ (`360x780`) | Desktop (`1440x900`) |
|---|---|---|---|
| **1. Học sinh (`StudentHome`)** | `student-mobile-390.png` | `student-mobile-360.png` | `student-desktop-1440.png` |
| **2. Giáo viên (`TeacherHome`)** | `teacher-mobile-390.png` | `teacher-mobile-360.png` | `teacher-desktop-1440.png` |
| **3. Quản lý Học vụ (`AdminHome`)** | `admin-mobile-390.png` | `admin-mobile-360.png` | `admin-desktop-1440.png` |
| **4. Phòng Chat Zalo Lớp học** | `chat-mobile-390.png` | — | `../03-zalo-classroom-chat-1440px.png` |
| **5. Phòng học Video HLS & Bài tập** | `learning-mobile-390.png` | — | `../02-video-learning-1440px.png` |
| **6. Trung tâm Thông báo** | `notifications-mobile-390.png` | — | `../04-notification-center-1440px.png` |

---

## 2. Kiến Trúc Tách Biệt 3 Vai Trò (`Student` / `Teacher` / `Admin`)

| Tiêu chí | Học sinh (`student`) | Giáo viên (`teacher`) | Quản lý Học vụ (`admin`) |
|---|---|---|---|
| **Component Trang chủ (`/`)** | `StudentHome.tsx` | `TeacherHome.tsx` | `AdminHome.tsx` |
| **Tiêu đề Header (`48px`)** | `Chào Hoàng Ngân 👋` | `Chào Cô Lâm Mỹ Linh` | `Quản lý học vụ` |
| **Hành động ưu tiên số 1** | Nút **Học tiếp** + tiến độ khóa học (`PrimaryActionCard`) | Nút **Chấm bài** + số bài chờ chấm & bộ lọc lớp phụ trách | 3 KPI nhỏ gọn (`Đơn chờ duyệt`, `Chưa xếp lớp`, `Lớp hoạt động`) + danh sách việc cần xử lý |
| **Bottom Navigation (Mobile)** | `Trang chủ \| Học \| Lớp \| Tin nhắn \| Thông báo` | `Tổng quan \| Lớp \| Chấm bài \| Tin nhắn \| Thông báo` | `Tổng quan \| Học viên \| Lớp \| Đơn hàng \| Thêm` |
| **Quick Actions (`2x2` Mobile)** | `Khóa học`, `Bài tập`, `Tin nhắn`, `Lớp học` | `Lớp của tôi`, `Chấm bài`, `Giao bài`, `Tin nhắn` | `Học viên`, `Lớp học`, `Đơn hàng`, `Phân quyền` |

---

## 3. Tối Ưu Mobile Compact (`390x844` & `360x780`)

1. **Header đỉnh cao chuẩn `48px` (`<= 56px`):** Gồm biểu tượng KTN (về trang chủ theo đúng role), tiêu đề động ngắn gọn 1 dòng + phụ đề lớp/vai trò, chuông thông báo và nút Đăng xuất truy cập 1 chạm.
2. **Loại bỏ Hero Banner cao & câu giới thiệu dài:** Thay bằng 1 dải thông tin lớp học/bộ lọc lớp siêu gọn + 1 thẻ `PrimaryActionCard` có CTA chính nổi bật ngay trong nửa trên màn hình đầu tiên (`above the fold`).
3. **Lưới tác vụ nhanh `2x2` (`QuickActionTile`) & Danh sách 1 dòng (`CompactListItem`):** Hiển thị đầy đủ 4 lối tắt trọng tâm và danh sách hoạt động gần đây trên cùng một màn hình `390x844` mà không bị tràn ngang (`0px overflow`).
4. **Phòng Chat & Phòng học Video gọn nhẹ:** Thanh ghim thông báo 1 dòng (mở rộng khi chạm), bong bóng thu âm vừa khít khung di động, bộ chọn bài học dạng ngăn kéo thu gọn (`Chọn bài`), và khung nhập tin nhắn luôn nằm trọn vẹn phía trên thanh điều hướng đáy (`composerBottom: 757px < bottomNavTop: 788px`).
