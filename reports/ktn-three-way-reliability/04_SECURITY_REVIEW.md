# 04 — SECURITY & AUTHORIZATION REVIEW

> **Mục đích:** Báo cáo kiểm toán bảo mật, xác thực phiên (Authentication), thu hồi token (Revocation), kiểm soát truy cập theo vai trò và quyền sở hữu (RBAC & Entitlement) trên toàn bộ các API của Cloudflare Worker và Client SDK.

---

## 1. Xác thực & Quản lý Phiên (Authentication & Session Security)

| Cơ chế bảo vệ | Chi tiết kiểm toán & Củng cố | Trạng thái |
|---|---|---|
| **Chặn mật khẩu mặc định cũ (`123456`)** | Mọi tài khoản thử đăng nhập bằng mật khẩu cũ `123456` đều bị từ chối với mã `401 Unauthorized` ngay tại `/api/ktn/auth/login`. | **PASS (`A5`)** |
| **Chữ ký phiên `HMAC-SHA256`** | Token phiên định dạng `<payloadB64Url>.<hmacSigB64Url>` được ký bằng khóa bí mật máy chủ. Token giả mạo chữ ký hoặc hết hạn (`exp`) bị từ chối `401`. | **PASS (`A5`)** |
| **Thu hồi Token bền vững & Fail-Closed** | Khi gọi `POST /api/ktn/auth/logout`, mã băm SHA-256 của token (`REVOKED-TOKEN-<hash>`) được ghi vào bảng `ktn_dlp_alerts` trên Supabase và xóa khỏi bộ nhớ đệm ` VERIFIED_SESSION_CACHE`. Nếu ghi DB thất bại, API trả về `503` với `revoked: false` để trình duyệt giữ lại `ktn_pending_revoke_token` và tự động thu hồi bù ở request kế tiếp. Khi kiểm tra `isTokenRevoked()`, nếu không truy vấn được bảng thu hồi trên Supabase thì áp dụng nguyên tắc **Fail-Closed** (`return true` → từ chối `401`), tuyệt đối không cho phép token đã đăng xuất lọt qua khi DB chập chờn. | **PASS (`A5`, `C5`, `B5`)** |
| **Sửa lỗi Race Condition `BroadcastChannel` khi Logout** | Trong `ktn-webapp-client.js`, việc phát tín hiệu `LOGOUT` qua `BroadcastChannel` được thực hiện sau khi `fetch('/api/ktn/auth/logout')` hoàn tất, đảm bảo trình duyệt không hủy ngang request thu hồi token trên máy chủ. | **PASS (`B5`)** |

---

## 2. Ma trận Phân quyền API (RBAC & Entitlement Enforcement)

| Endpoint | Học sinh (Student) | Giáo viên (Teacher) | Quản lý (Admin) | Kiểm tra chống leo thang đặc quyền (IDOR / Cross-Class / Cross-Course) |
|---|---|---|---|---|
| `GET /api/ktn/courses/units?courseId=...` | Chỉ được truy cập khi sở hữu `courseId` (kiểm tra trong `ktn_students.online_courses` hoặc đồng bộ từ izTeach) | Chỉ giáo viên đang `active = true` trong `ktn_teachers` | Toàn quyền | Học sinh chưa mua hoặc đã bị thu hồi khóa học nhận ngay `403 COURSE_NOT_ENTITLED`, không thể mượn Admin Token của Worker để lấy link bài giảng. |
| `POST /api/ktn/homeworks` | Chỉ nộp được cho lớp mình đang học (`class_code` khớp) hoặc khóa video mình đang sở hữu (`online_courses` chứa `courseId`) | `403 Forbidden` | `403 Forbidden` | Chặn nộp chéo lớp (`403`), chặn nộp khóa học chưa mua (`403 COURSE_NOT_ENTITLED`), chặn ghép `unitId` của khóa khác (`400 UNIT_COURSE_MISMATCH`), kiểm tra đường dẫn S3 thuộc đúng thư mục email của học sinh nộp bài. |
| `PATCH /api/ktn/homeworks/grade` | `403 Forbidden` | Chỉ chấm được bài tập của các lớp mình chủ nhiệm (`getTeacherAssignedClassCodes`) | Toàn quyền | Giáo viên lớp `YCT3-02` chấm bài của học sinh lớp `YCT2-04` bị chặn với `403`. |
| `POST /api/ktn/students/courses` | `403 Forbidden` | Chỉ được gọi `action = 'assign_class'` cho đúng lớp mình chủ nhiệm và không được chuyển học sinh đang thuộc lớp của giáo viên khác; **cấm** truyền `courseIds` (`403`) | Toàn quyền (`grant`, `revoke`, `set`, `assign_class`) | Giáo viên cố tình gửi `action: 'grant'` hoặc `courseIds: [...]` hoặc lấy học sinh từ lớp giáo viên khác đều bị chặn `403`. |
| `POST /api/ktn/classes` | `403 Forbidden` | Chỉ được cập nhật thông tin lớp mình đang chủ nhiệm; **cấm** tạo lớp mới và **cấm** đổi `teacher_email` / `teacher_code` (`403`) | Toàn quyền | Giáo viên tạo lớp mới hoặc tự gán mình vào lớp khác bị chặn `403`. |
| `GET/POST /api/ktn/class-sessions` | Chỉ đọc được buổi học của đúng lớp mình (`class_code`) | Chỉ đọc/tạo buổi học của lớp mình chủ nhiệm | Toàn quyền | Học sinh hoặc giáo viên lớp khác truy cập buổi học của `YCT2-04` bị chặn `403`. |
| `GET/POST /api/ktn/messages` | Chỉ đọc/gửi tin nhắn trong phòng lớp mình (`class:<MY_CLASS>`) hoặc phòng cá nhân của mình | Chỉ đọc/gửi tin nhắn trong phòng các lớp mình chủ nhiệm | Toàn quyền | Chặn đọc/gửi tin nhắn chéo lớp (`403`) và quét DLP chặn số điện thoại / link Zalo cá nhân. |
| `GET/PATCH /api/ktn/notifications` | Chỉ đọc và đánh dấu đã đọc thông báo của chính mình / lớp mình | Chỉ đọc thông báo của mình / lớp mình | Toàn quyền | Không rò rỉ thông báo giữa các học sinh hoặc giữa các lớp khác nhau (`D3`). |

---

## 3. Kiểm soát Truy cập trên Giao diện Cổng Học sinh (`portal_template.html` / `sll-hocsinh.html`)

- **Chặn điều hướng Hash trực tiếp (`handleStudentHashRoute`)**: Khi học sinh mở trực tiếp đường dẫn `#/khoa/<slug>/bai/<num>` của một khóa học chưa được cấp quyền (ví dụ `#/khoa/ttte2/bai/1`), hàm `handleStudentHashRoute()` kiểm tra `enrolledIds.includes(targetCourseId)` và chặn ngay lập tức, đưa về trang tổng quan kèm bảng cảnh báo `#sibling-permission-guard` (`Bài này chưa được cấp cho tài khoản hiện tại`).
- **Chặn gọi hàm trực tiếp (`enterCourseLearning`)**: Hàm `enterCourseLearning(lessonIdx, targetCourseId)` kiểm tra lại `checkUserCourseAccess(user)` cho đúng `courseToLoad` trước khi nạp bài giảng; nếu không có quyền thì hiển thị `#sibling-permission-guard` và thoát ngay.
- **Thu hồi quyền có hiệu lực tức thì khi tải lại trang**: Khi khóa học bị thu hồi trên máy chủ, `syncLiveStudentProfile()` nhận danh sách `online_courses` mới từ `/api/ktn/students/me`, gắn `_serverSynced: true` và ghi đè `localStorage` — ngăn chặn hoàn toàn việc quyền học cũ hồi sinh từ bộ nhớ đệm trình duyệt.
