# 05 — BÁO CÁO ĐÁNH GIÁ BẢO MẬT & PHÂN QUYỀN (SECURITY REVIEW)

> **Hệ thống:** Khổng Tử Nhí (`https://khongtunhi.com`)
> **Phạm vi kiểm toán:** Xác thực phiên (Auth/JWT), Phân quyền theo vai trò & lớp học (RBAC), Lưu trữ tệp S3/CloudFront, Bảo vệ dữ liệu cá nhân (PII), Quản lý bí mật (Secrets).

---

## 1. Ma trận kiểm soát bảo mật (Security Control Matrix)

| Hạng mục bảo mật | Cơ chế bảo vệ trên Production | Bằng chứng kiểm thử tự động | Trạng thái |
|---|---|---|---|
| **Chống giả mạo Token & Header (`X-KTN-User-Email`)** | Mọi API nhạy cảm gọi `resolveAuthenticatedUser(request, env)` xác thực chữ ký HMAC-SHA256 của KTN session token hoặc xác thực trực tiếp izTeach token (`200 OK` tại `/me-setting`). Tuyệt đối không tin `X-KTN-User-Email` hay giải nén payload `eayJ...` không kiểm chữ ký. | `TEST 1`: Gửi token giả + header `X-KTN-User-Email: hocvienkhongtunhi123@gmail.com` và JWT 3 phần `eayJ...` giả mạo -> `401 Unauthorized`. | **PASS** |
| **Vô hiệu hóa mật khẩu mặc định cũ** | Toàn bộ mật khẩu mặc định/cũ đã bị thu hồi; danh sách mật khẩu học sinh/giáo viên chỉ xác thực qua băm SHA-256 + salt hoặc tài khoản izTeach chính thức. | `TEST 2`: Thử đăng nhập bằng mật khẩu cũ trên 9 tài khoản (Admin, Quản lý, Giáo viên A/B, 5 Học sinh) -> Tất cả đều trả `401 Unauthorized`. | **PASS** |
| **Thu hồi phiên nguyên tử khi Đăng xuất (Atomic Session Revocation)** | Khi gọi `POST /api/ktn/auth/logout`, máy chủ xóa cookie `ktn_webapp_token` (`Max-Age=0`) và ghi bản ghi thu hồi nguyên tử `id = 'REVOKED_' + sha256(token)` vào bảng `ktn_dlp_alerts` (`room_id = 'AUTH_REVOKED'`), loại bỏ hoàn toàn race condition khi nhiều người đăng xuất cùng lúc. | `TEST 6`: Kiểm tra đăng xuất đơn và đăng xuất đồng thời (`Promise.all`) 2 token -> Cả 2 token đều bị từ chối `401 Unauthorized` ngay lập tức khi gọi lại `/api/ktn/auth/session`. | **PASS** |
| **Hàng đợi thu hồi phiên khi mất mạng (Offline Logout Resilience)** | Nếu người dùng bấm Đăng xuất lúc rớt mạng, `ktn-webapp-client.js` xóa sạch phiên cục bộ (`localStorage`, `sessionStorage`, `IndexedDB`, `Cookie`) và lưu `ktn_pending_revoke_token` để tự động gọi `/api/ktn/auth/logout` thu hồi bù ngay khi có mạng trở lại. | Đã tích hợp trong [ktn-webapp-client.js](file:///d:/Vibe/khongtunhi_sofl_style/ktn-webapp-client.js#L165-L265) và đồng bộ đa tab (`TEST 10.2`). | **PASS** |
| **Cách ly dữ liệu Học sinh & Lớp học (Cross-Student & Cross-Class Isolation)** | - Server tự suy diễn `id = HW-${studentEmail}-${courseId}-L${lessonNum}`, chặn `403` nếu client gửi ID của học sinh khác.<br>- Học sinh lớp A không thể xem/gửi tin nhắn, xem buổi học, hoặc nộp bài vào lớp B (`403`).<br>- Học sinh B không nhìn thấy bài nộp hay thông báo của Học sinh A. | `TEST 3`, `TEST 4a/4b`, `TEST 9.5`: Toàn bộ phép thử truy cập chéo lớp và chéo học sinh đều bị chặn `403 Forbidden` và `leakedHw: false, leakedNotif: false`. | **PASS** |
| **Cách ly quyền Giáo viên theo lớp phụ trách** | Giáo viên chỉ được xem danh sách bài nộp, buổi học, phòng chat và chấm điểm cho đúng các lớp mình phụ trách (`teacher_email` khớp trong `ktn_classes`). | `TEST 3`, `TEST 5.2a`: Cô Hà (`YCT3-02`) thử xem bài tập, buổi học, tin nhắn và chấm điểm lớp `YCT2-04` của Cô Linh -> `403 Forbidden`. | **PASS** |
| **Quyền sở hữu thư mục S3 & Kiểm tra file tồn tại thật** | - `POST /api/ktn/homeworks/upload-url` cấp đường dẫn S3 tách biệt theo từng học sinh: `resource/homeworks/${vendorId}/${studentFolder}/${timestamp}-${cleanName}`.<br>- Chặn đuôi nguy hiểm (`.html`, `.exe`, `.svg`, `.js`, `.php`...) và giới hạn `<= 50MB`.<br>- `POST /api/ktn/homeworks` kiểm tra `fileUrl` phải nằm trong đúng `${studentFolder}` của người nộp (`403` nếu trỏ sang thư mục học sinh khác) và gọi `HEAD` tới CloudFront xác nhận file tồn tại thật (`200 OK`, `size > 0`). | `TEST 4c–4g`:<br>- Domain ngoài -> `400`<br>- Học sinh B dùng `fileUrl` S3 của Học sinh A -> `403`<br>- URL S3 chưa upload thật -> `400`<br>- File `.html` hoặc `60MB` -> `400`. | **PASS** |
| **Bảo vệ PII & Chặn spam dữ liệu giả** | - Không trả `izteachAccessToken` trong response login.<br>- `GET /api/ktn/classes` ẩn `teacher_email` đối với khách chưa đăng nhập.<br>- `POST /api/ktn/leads` chỉ cho phép `testMode` khi có token Admin hợp lệ (`403` nếu khách thường gửi `testMode`).<br>- Kiểm tra định dạng SĐT Việt Nam trên cả `/api/ktn/leads` và `/api/ktn/orders`. | `TEST 3d`, `TEST 8`:<br>- Guest `/api/ktn/classes` -> `leakedTeacherEmail: false`<br>- Guest `testMode` lead -> `403`<br>- SĐT sai định dạng -> `400`. | **PASS** |

---

## 2. Quản lý khóa bí mật (Secrets Hygiene)
- Không có bất kỳ mật khẩu, `SUPABASE_SERVICE_ROLE_KEY`, hay `IZTEACH_ADMIN_PASSWORD` nào bị hardcode trong mã nguồn client hay bộ kiểm thử [verify_security_and_flow.cjs](file:///d:/Vibe/khongtunhi_sofl_style/verify_security_and_flow.cjs).
- Tệp `.env` được liệt kê trong `.gitignore` và kiểm tra `git status` xác nhận không có tệp nhạy cảm nào bị theo dõi bởi Git.
