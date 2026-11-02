> Mục đích: chạy bản thử đăng nhập thật izTeach cho sổ liên lạc trên máy này.

## Ranh giới quản lý trung tâm và giáo viên

| Vai trò | Phạm vi | Quyền |
|---|---|---|
| Quản lý trung tâm | Toàn bộ trung tâm được xác thực, không vượt sang trung tâm khác | Nắm tất cả lớp, học sinh, giáo viên, học vụ, liên lạc, báo cáo, học phí; phân công lớp/học sinh và quản lý quyền tài khoản. |
| Giáo viên | Lớp được giao hoặc học sinh được giao trực tiếp | Dạy học, điểm danh, chấm bài và trao đổi đúng phạm vi. Không tự giao lớp/học sinh, quản lý nhân sự/tài khoản hoặc xem tài chính/toàn trung tâm. |

- `admin/root` là quản lý trung tâm; tài khoản đồng thời có nhãn `teacher` vẫn mở cổng quản lý trung tâm.
- `so-lien-lac-permissions.cjs` là bộ chính sách kiểm tra hành động và tài nguyên có chủ sở hữu được máy chủ xác định.
- Phân công giáo viên lấy qua `loadTeacherAssignments({vendorId, teacherId})` phía máy chủ, đọc lại ở mỗi yêu cầu. Chưa có nguồn đã xác minh thì trả danh sách rỗng và chặn dữ liệu. Không nhận phân công từ trình duyệt.
- Adapter phân công izTeach thực tế vẫn chưa được nối. Kiểm tra phạm vi ở tài nguyên đang dùng dữ liệu giả lập trong test; mọi API bài tập thật vẫn tắt.
- `/api/izteach/admin/overview` chỉ dành cho quản lý; `/api/izteach/teacher/assignments` chỉ dành cho giáo viên. Quản lý có quyền đọc bài nhưng nhận `503 DATA_NOT_CONNECTED` khi dữ liệu chưa nối, thay vì bị báo thiếu quyền. Giáo viên chưa có phân công được xác minh nhận `403`.
- Trong bản mẫu, quản lý xem hồ sơ học sinh bằng dialog tại cổng quản trị, không chuyển sang vai trò giáo viên.

## Chạy thử

1. Nháy đúp `Chay-so-lien-lac.cmd` trong thư mục này. Máy đã có Node.js 24; không cần cài thư viện.
2. Trình duyệt mở `http://127.0.0.1:4173/so-lien-lac.html`.
3. Chọn **Nhân sự trung tâm**, nhập tài khoản izTeach đã được cấp. Quyền quản lý trung tâm hoặc giáo viên được lấy riêng từ phản hồi đăng nhập của izTeach.
4. Tài khoản quản lý mở **Không gian quản lý**; nút **Kiểm tra quyền quản lý** gọi API được bảo vệ ở máy chủ local.
5. **Xem dữ liệu mẫu** mở phần UI bốn vai trò. Dữ liệu mẫu không thuộc tài khoản vừa đăng nhập.
6. Bấm **Đăng xuất** khi xong. Ctrl+C trong cửa sổ máy chủ để dừng; dừng máy chủ sẽ xóa mọi phiên local.

Mở trực tiếp `file:///.../so-lien-lac.html` chỉ dùng để xem mẫu. Đăng nhập thật cần máy chủ HTTP ở bước 1. Nếu cổng 4173 đang được chương trình khác dùng, dừng chương trình đó hoặc đặt `PORT` khác trước khi chạy Node.

## Đã làm và kiểm chứng

| Phần | Kết quả |
|---|---|
| Đăng nhập quản lý | Đã thử thật qua API izTeach và giao diện local, HTTP 200, nhận quyền quản lý. |
| Token | Chỉ giữ trong bộ nhớ máy chủ. API trả trình duyệt không chứa access/refresh token. |
| Phiên | Cookie HttpOnly, SameSite=Strict; xoay mã phiên khi đăng nhập; giới hạn 1 giờ và 20 phút không hoạt động. Cookie HTTP phục vụ thử nghiệm loopback, chưa phải cấu hình production HTTPS. |
| Quyền | Vai trò từ izTeach; bỏ qua vai trò/trung tâm do trình duyệt tự gửi. Chặn endpoint quản lý với tài khoản không được cấp quyền. |
| Đăng xuất | Đã thử thật, phiên cũ trả 401 sau đăng xuất. |
| Kiểm thử | 13 nhóm Auth/API/UI/chính sách; kiểm thử responsive và nghiệp vụ mẫu chạy riêng. Giáo viên/học viên được kiểm thử bằng API giả lập, chưa có phiên thử thật tương ứng. |

## Giới hạn bản thử

- Chưa bật đọc/ghi bài tập, chat và dữ liệu học sinh thật. `/api/izteach/homeworks` chủ động từ chối đến khi xác minh được phạm vi dữ liệu.
- Chưa có liên kết phụ huynh–con. Không tự suy ra vai trò phụ huynh từ tài khoản học viên.
- Nhánh học viên kiểm tra `studentId`, trung tâm, trạng thái và thời hạn từ phản hồi đăng nhập; phản hồi khác hợp đồng sẽ bị từ chối.
- Chưa có refresh token tự động; hết hạn thì đăng nhập lại.
- Đây là gateway thử nghiệm chỉ bind `127.0.0.1`, không phải hệ thống production. Trước deploy cần HTTPS, kho phiên bền vững, cấu hình cookie Secure, kiểm tra thu hồi quyền và hợp đồng API dữ liệu theo lớp.
- Bản demo trên máy chủ không dùng token legacy trong localStorage để gọi API thật.

## File chính

| File | Vai trò |
|---|---|
| `so-lien-lac-server.cjs` | Xác thực upstream, phiên, kiểm tra quyền, phục vụ file cho phép. |
| `so-lien-lac-auth.js` / `.css` | Form đăng nhập, không gian tài khoản, đăng xuất và tách chế độ mẫu. |
| `verify_sll_auth.cjs` | Kiểm thử từ chối truy cập, phiên, API và giao diện. |

```powershell
node --check .\so-lien-lac-server.cjs
node --check .\so-lien-lac-auth.js
node --test .\verify_sll_auth.cjs
node .\verify_sll_ux.cjs
node .\verify_sll_responsive.cjs
```

Không lưu tài khoản, mật khẩu hoặc token vào mã nguồn, báo cáo hay file cấu hình.
