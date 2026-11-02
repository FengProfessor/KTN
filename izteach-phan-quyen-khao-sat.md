> Mục đích: ghi nhận kiểm tra giao diện quản trị izTeach ngày 26/10/2026 và phạm vi tích hợp sổ liên lạc.

## Kết quả đã quan sát trực tiếp

| Mục | Đường dẫn | Kết quả |
|---|---|---|
| Tài khoản quản trị | `/admin-management-account` | Tài khoản được cung cấp hiển thị vai trò `admin,root`. Có danh sách admin và form tạo admin. Form đã xem không có bộ chọn quyền chi tiết. |
| Giảng viên | `/teachers` | Có tài khoản giảng viên riêng và trang chi tiết. |
| Phân công giảng viên | Tab `KHOÁ HỌC ĐƯỢC PHÂN CÔNG` trong chi tiết giảng viên | Có danh sách khóa học đang giao, bộ chọn khóa học và nút thêm. Đã quan sát một giảng viên có khóa học được giao; không thay đổi phân công. |
| Kiểm tra | Tab `BÀI KIỂM TRA ĐƯỢC PHÂN CÔNG` | Có tab trong hồ sơ giảng viên; chưa kiểm tra nội dung/quyền API. |
| Nhóm học viên | `/student-group` | Có nhóm, số học viên và số khóa học. Chưa xác nhận nhóm tương đương lớp vận hành hoặc giới hạn quyền theo nhóm. |
| Liên hệ | `/temp-user` | Mở mục Đơn liên hệ, có tab Đơn hàng/Liên hệ; đây không phải trang cấp quyền. |
| Phụ huynh | Menu đã kiểm tra | Chưa thấy mục riêng liên kết tài khoản phụ huynh với con. Chưa đủ cơ sở kết luận nền tảng không hỗ trợ. |

## Cách triển khai đề xuất

1. Giữ tài khoản và ID học viên/giảng viên/khóa học của izTeach làm dữ liệu nguồn nếu API xác thực, phạm vi truy cập đáp ứng yêu cầu.
2. Sổ liên lạc lấy danh tính đã được xác minh từ phía máy chủ; loại bỏ chuyển vai trò tùy ý ở bản vận hành. Người nhiều vai trò chỉ chọn trong danh sách đã được cấp.
3. Kiểm tra phạm vi khóa học hiện tại của giảng viên. Nếu cần giới hạn theo lớp nhỏ hơn khóa học, bổ sung bảng phân công lớp; không suy ra quyền xem tất cả học viên cùng khóa.
4. Xác định cơ chế phụ huynh–con. Nếu izTeach chưa cung cấp, thêm backend riêng cho liên kết này và dữ liệu sổ liên lạc.
5. Mọi yêu cầu xem/nộp/chấm bài, gửi tin và lấy đường dẫn tệp đều kiểm tra tài khoản, trung tâm và phạm vi học sinh/lớp tại máy chủ.
6. Quyền đọc/ghi vẫn phải được bảo vệ ở API nguồn. Backend phụ không khắc phục được việc API nguồn trả dữ liệu ngoài phạm vi cho người gọi trực tiếp.

## Chưa được xác minh

- Hợp đồng API đăng nhập, xác minh/refresh/thu hồi token và API thông tin tài khoản hiện tại.
- Quyền thực tế của phiên giáo viên/học viên; chưa có tài khoản thử tương ứng.
- API nguồn có chặn truy cập chéo tài khoản, trung tâm, khóa học và sửa ID bản ghi hay không.
- Phân biệt quyền quản trị trong tenant với quyền sửa mã nguồn/backend nền tảng: vai trò `root` trên giao diện không chứng minh quyền sửa backend.
- Hỗ trợ SSO, tài khoản phụ huynh, lớp độc lập và chat riêng theo học sinh.

## Kiểm thử cần có trước vận hành

- Học viên A không đọc/sửa bài của B khi thay ID.
- Phụ huynh chỉ truy cập các con đã liên kết; không sửa điểm.
- Giáo viên chỉ xem/chấm phạm vi được giao; gỡ phân công sẽ chặn các yêu cầu tiếp theo theo chính sách đã chọn.
- Tệp riêng tư không có đường dẫn công khai lâu dài; kiểm tra quyền trước khi cấp URL xem/tải.

## Phạm vi phiên kiểm tra

Chỉ đăng nhập, xem menu/danh sách và mở form để đọc cấu hình. Không tạo tài khoản, đổi mật khẩu, lưu cấu hình, cấp/gỡ quyền, phân công, xuất danh sách hay thay đổi dữ liệu production. Không lưu mật khẩu/token vào mã nguồn hoặc báo cáo.
