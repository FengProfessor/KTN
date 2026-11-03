# 02 — BÁO CÁO KIỂM TOÁN LỖI & BẰNG CHỨNG SỬA LỖI (BUG AUDIT)

> **Hệ thống:** Khổng Tử Nhí (`https://khongtunhi.com`)
> **Baseline bắt đầu:** `ece1873b163888537200017cc25b044738e07984`
> **Phiên bản Worker sau sửa:** `ktn-prod-v2026.11.03` (`fd41f96b-28f8-41a0-82a2-ca8dc4cf0c3e`)

---

## Bảng tổng hợp các lỗi phát hiện từ Baseline `ece1873`

| Mã lỗi | Mức độ | Khu vực | Mô tả vấn đề | Nguyên nhân gốc | Cách sửa | Trạng thái |
|---|---|---|---|---|---|---|
| **BUG-01** | **P0 (Critical)** | Homework Upload & S3 Ownership | 1) Học sinh A có thể lấy URL file trên CloudFront của học sinh B để nộp vào bài mình.<br>2) Có thể gọi `POST /api/ktn/homeworks` với một URL trên CloudFront chưa từng được upload thật.<br>3) Chưa chặn định dạng nguy hiểm (`.html`, `.exe`, `.svg`, `.js`) và dung lượng vượt mức (>50MB) tại `/api/ktn/homeworks/upload-url`. | `upload-url` lưu tất cả file chung vào `resource/homeworks/${vendorId}/` không tách thư mục theo học sinh; `POST /api/ktn/homeworks` chỉ kiểm tra prefix domain CloudFront mà không kiểm tra quyền sở hữu thư mục S3 hay `HEAD` kiểm tra file tồn tại thật. | 1) Scoped S3 key theo thư mục định danh riêng của từng học sinh (`resource/homeworks/${vendorId}/${studentFolder}/...`).<br>2) Kiểm tra allowlist đuôi file (`.wav`, `.mp3`, `.m4a`, `.webm`, `.ogg`, `.aac`, `.mp4`, `.mov`, `.jpg`, `.jpeg`, `.png`, `.webp`, `.gif`, `.pdf`), chặn đuôi nguy hiểm và giới hạn `<= 50MB`.<br>3) Thực hiện `HEAD` request tới CloudFront xác nhận `200 OK` và `content-length > 0` trước khi ghi vào `ktn_homeworks`. | **FIXED & VERIFIED** |
| **BUG-02** | **P1 (High)** | Auth / Session Revocation | Thu hồi phiên đăng nhập khi bấm Đăng xuất có nguy cơ **race condition** khi nhiều người dùng đăng xuất đồng thời trên các Cloudflare Worker isolate khác nhau. | `revokeSessionTokenServerSide()` đọc mảng JSON trong 1 dòng duy nhất `ktn_payment_config?id=eq.revoked_sessions`, nối thêm hash ở bộ nhớ Worker rồi `PATCH` đè lại. Ngoài ra việc lưu chung bảng cấu hình thanh toán làm bẩn schema. | Chuyển sang lưu **atomic từng dòng độc lập** cho mỗi token bị thu hồi trong bảng `ktn_dlp_alerts` (`id = 'REVOKED_' + tokenHash`, `room_id = 'AUTH_REVOKED'`), dùng `Prefer: resolution=merge-duplicates` và tự động dọn các dòng quá 30 ngày. Xóa bỏ hoàn toàn dòng `revoked_sessions` khỏi `ktn_payment_config`. | **FIXED & VERIFIED** |
| **BUG-03** | **P1 (High)** | Homework Assignment Validation | Học sinh thuộc lớp `YCT2-04` có thể gửi API `POST /api/ktn/homeworks` với `lessonNum` bất kỳ (ví dụ `901` — Buổi 9 Bài 1) dù giáo viên chưa giao buổi/bài đó. | Máy chủ chỉ kiểm tra `1 <= lessonNum <= 10000` mà chưa đối chiếu danh sách buổi học & bài tập thực tế của lớp trong `getMergedClassSessions(targetClass)`. | Đưa `DEFAULT_SESSIONS_BY_CLASS` và `getMergedClassSessions(targetClassCode)` lên phạm vi dùng chung trong Worker; khi nộp bài lớp (`CLASS_<classCode>`), đối chiếu `lessonNum = sessionNumber * 100 + exIdx` với danh sách bài tập đã giao của lớp, trả `400` nếu bài tập không tồn tại. | **FIXED & VERIFIED** |
| **BUG-04** | **P1 (High)** | Notification Read-State & Deduplication | Khi giáo viên chấm điểm, học sinh đánh dấu "Đã đọc" thông báo nhưng khi tải lại trang có thể xuất hiện lại trạng thái chưa đọc hoặc lệch ID giữa local và cloud. | `cloudflare-worker-sw-proxy.js` sinh ID thông báo có đuôi thời gian `${hw.graded_at \|\| hw.submitted_at}`, trong khi `so-lien-lac-lms.js` sinh ID `NOTIF-GRADED-${h.id}-${h.status}-${h.score}` và gộp cả 2 nguồn. | Chuẩn hóa ID thông báo duy nhất (canonical ID) giữa Worker và Client: `NOTIF-GRADED-${canonicalHwId}-${normStatus}-${score}`, khử trùng lặp theo `(courseId, lessonNum)` và tách rõ thông điệp khi `revision_requested` (`Cần sửa lại: ...`) so với `graded` (`... · 9.5đ`). | **FIXED & VERIFIED** |
| **BUG-05** | **P2 (Medium)** | Privacy & Input Validation (`/classes`, `/orders`, Push Subscribe) | 1) Khách chưa đăng nhập gọi `GET /api/ktn/classes` nhìn thấy `teacher_email`.<br>2) `POST /api/ktn/orders` chưa kiểm tra định dạng SĐT Việt Nam ở tầng Worker.<br>3) `savePushSubscriptionToCloud` ở client vẫn gọi `PUT /vendor-setting`. | 1) `/api/ktn/classes` trả nguyên bản ghi từ `ktn_classes` cho cả guest.<br>2) `/api/ktn/orders` chỉ kiểm tra `!customerPhone` mà thiếu regex SĐT.<br>3) Hàm push cũ ở client chưa trỏ sang endpoint `/api/ktn/push/subscribe`. | 1) Ẩn `teacher_email` khi người gọi `/api/ktn/classes` chưa đăng nhập.<br>2) Áp dụng regex `/^(0\|\+84)(3\|5\|7\|8\|9)[0-9]{8}$/` cho `POST /api/ktn/orders` (`400` nếu sai).<br>3) Cập nhật `savePushSubscriptionToCloud()` gọi `POST /api/ktn/push/subscribe` có xác thực. | **FIXED & VERIFIED** |
| **BUG-06** | **P2 (Medium)** | UX / Mobile Overflow (`360x800`) & Cross-Account Cache | 1) Trên màn hình điện thoại nhỏ `360x800`, lưới lớp học (`minmax(340px, 400px)` với padding `24px`) gây tràn ngang.<br>2) `sll-teacher.html` đọc cả `ktn_local_submitted_homeworks` trong `localStorage` của trình duyệt.<br>3) Khi mất mạng lúc bấm Đăng xuất, token chưa kịp thu hồi trên server. | 1) CSS grid cố định `340px` vượt quá `360px - 48px = 312px`.<br>2) Code fallback cũ trong `sll-teacher.html` gộp `localStorage`.<br>3) `logout()` bỏ qua lỗi mạng mà không lưu hàng đợi thu hồi bù. | 1) Sửa CSS thành `minmax(min(100%, 340px), 400px)` và thêm `overflow-x: hidden`.<br>2) Xóa bỏ việc đọc `ktn_local_submitted_homeworks` trong `sll-teacher.html` và xóa sạch key này khi `logout()`.<br>3) Thêm cơ chế `ktn_pending_revoke_token`: nếu mất mạng khi đăng xuất, tự động thu hồi bù ở request kế tiếp khi có mạng lại. | **FIXED & VERIFIED** |

---

## Chi tiết từng lỗi theo chuẩn Audit

### 1. BUG-01 — Ràng buộc quyền sở hữu file S3, kiểm tra file tồn tại thật và chặn định dạng nguy hiểm
- **File & dòng liên quan:** [cloudflare-worker-sw-proxy.js](file:///d:/Vibe/khongtunhi_sofl_style/cloudflare-worker-sw-proxy.js#L2528-L2698), [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L4170-L4330)
- **Bước tái hiện trước khi sửa:**
  1. Học sinh A gọi `POST /api/ktn/homeworks/upload-url` để lấy `fileUrl`.
  2. Học sinh B dùng `fileUrl` của Học sinh A gửi vào `POST /api/ktn/homeworks` cho bài tập của B, hoặc Học sinh A gửi `fileUrl` giả dưới cùng thư mục CloudFront mà chưa từng `PUT` file lên S3.
- **Kết quả thực tế sau khi sửa:**
  - Học sinh B gửi `fileUrl` của Học sinh A -> `403 Forbidden` (`File bài nộp không thuộc thư mục tài khoản của học sinh này`).
  - Học sinh A gửi `fileUrl` chưa upload thật lên S3 -> `400 Bad Request` (`File bài nộp chưa được tải lên hệ thống hoặc đường dẫn file không tồn tại`).
  - Gửi file `.html` hoặc `fileSize: 60MB` lên `/api/ktn/homeworks/upload-url` -> `400 Bad Request`.

### 2. BUG-02 — Thu hồi phiên đăng nhập nguyên tử (Atomic Session Revocation)
- **File & dòng liên quan:** [cloudflare-worker-sw-proxy.js](file:///d:/Vibe/khongtunhi_sofl_style/cloudflare-worker-sw-proxy.js#L261-L320)
- **Bước tái hiện trước khi sửa:**
  - Hai tài khoản gọi `POST /api/ktn/auth/logout` cùng lúc (`Promise.all`). Nếu cả hai đọc cùng mảng JSON `revoked_sessions` trước khi ghi đè, một trong hai token có thể bị ghi đè mất khỏi danh sách thu hồi.
- **Kết quả thực tế sau khi sửa:**
  - Mỗi token bị thu hồi được `POST` thành một bản ghi độc lập `id = 'REVOKED_' + key` trong `ktn_dlp_alerts` (`room_id = 'AUTH_REVOKED'`).
  - Kiểm thử `Promise.all` thu hồi đồng thời 2 token trong `TEST 6` xác nhận cả hai đều trả `401 Unauthorized` ngay lập tức trên `/api/ktn/auth/session`.

### 3. BUG-03 — Chặn nộp bài tập vào buổi/bài chưa được giao của lớp
- **File & dòng liên quan:** [cloudflare-worker-sw-proxy.js](file:///d:/Vibe/khongtunhi_sofl_style/cloudflare-worker-sw-proxy.js#L857-L953), [cloudflare-worker-sw-proxy.js](file:///d:/Vibe/khongtunhi_sofl_style/cloudflare-worker-sw-proxy.js#L2665-L2690)
- **Kết quả thực tế sau khi sửa:**
  - Khi học sinh lớp `YCT2-04` gửi `lessonNum: 901` (Buổi 9 · Bài 1 chưa được giao trong lớp `YCT2-04`), API trả `400 Bad Request` (`Bài tập (mã 901) chưa được giao hoặc không tồn tại trong lớp YCT2-04`).
  - Khi gửi đúng bài đã giao (`101`, `102`, `201`, `202`, `301`), hệ thống cho phép nộp và sinh ID chuẩn `HW-<email>-CLASS_YCT2-04-L<lessonNum>`.
