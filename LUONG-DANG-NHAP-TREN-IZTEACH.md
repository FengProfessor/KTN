> Mục đích: luồng triển khai sổ liên lạc dùng hosting, tài khoản và API izTeach; không phụ thuộc gateway Node local khi vận hành.

## Hướng triển khai theo yêu cầu user

- Đưa giao diện sổ lên một trang riêng trong izTeach Site builder; URL cần lấy từ trang đã được tạo, chưa coi URL đề xuất là đang tồn tại.
- Dùng xác thực và API dữ liệu của izTeach. Gateway `so-lien-lac-server.cjs` hiện có chỉ là bản thử kỹ thuật đăng nhập, không phải backend cho phương án này.
- Không chuyển sang Supabase/Vercel hoặc thêm server riêng trừ khi user thay đổi yêu cầu.

## Đã quan sát trên hệ thống thật

| Phần | Có trên hệ thống |
|---|---|
| Trang quản trị | `https://khongtunhi.admin.izteach.vn/` |
| Cấu hình trang | Giao diện website → Cấu hình trang (`/sitebuilder`), có Thêm trang. |
| Cổng học viên | `https://khongtunhi.com/course-online?tab=tieng-trung`, có nút Đăng nhập. |
| Tài khoản nhân sự | API đăng nhập đã được thử với tài khoản quản lý; phân biệt `admin/root` và `teacher`. |
| Tùy chỉnh HTML | Công cụ triển khai sẵn trong workspace dùng `SectionHtml` và cấu hình trang izTeach; chưa triển khai sổ bằng công cụ này. |

Không có tài liệu SSO được xác minh. Cùng tài khoản không đồng nghĩa cùng phiên giữa `khongtunhi.com` và `khongtunhi.admin.izteach.vn`; không đọc localStorage/cookie của tên miền kia hoặc truyền token qua URL.

## Luồng người dùng

1. Người dùng mở Sổ liên lạc từ website của trung tâm.
2. Nếu có phiên hợp lệ tại đúng origin và izTeach hỗ trợ dùng phiên đó, tiếp tục; nếu chưa có, dùng luồng đăng nhập izTeach được hỗ trợ.
3. izTeach xác thực và trả danh tính/vai trò đã được cấp.
4. Quản lý vào cổng quản lý toàn trung tâm. Giáo viên vào lớp/học sinh được phân công. Học sinh vào hồ sơ của mình.
5. Phụ huynh cần quan hệ tài khoản–con được xác minh; không tự coi tài khoản học sinh là tài khoản phụ huynh độc lập.
6. Mỗi lần tải hoặc sửa dữ liệu, API izTeach kiểm tra quyền bằng phiên của người đang thao tác. Không dùng chung token root cho các người dùng.

## Các điều kiện phải xác nhận trước khi vận hành

- Cách lấy/xác minh/refresh/thu hồi phiên tại trang tùy chỉnh; cách giữ địa chỉ quay lại sổ sau đăng nhập.
- CORS và loại token mà API cho phép dùng từ trang sổ đã được host trên izTeach.
- API thông tin người dùng hiện tại, phân công lớp/học sinh cho giáo viên và quan hệ phụ huynh–con.
- API bài tập/nhận xét/tin nhắn/tệp có chặn dữ liệu ngoài phạm vi ngay tại server nguồn.
- Khả năng thêm liên kết sổ từ giao diện nhân sự/quản trị. Quyền quản trị trung tâm không mặc nhiên cho sửa mã nguồn ứng dụng admin của nền tảng.

Nếu thiếu quyền/API nghiệp vụ, cần izTeach bổ sung trên server của họ. HTML/JS tùy chỉnh không thay thế được kiểm soát quyền phía máy chủ. Chưa tạo/publish trang hoặc đổi menu production trong phiên khảo sát này.
