# KIỂM TOÁN HỆ THỐNG CŨ (LEGACY AUDIT) — KTN UI V2

> **Dự án**: Học Viện Khổng Tử Nhí (KTN)  
> **Nhánh triển khai**: `feat/ktn-react-ui-v2`  
> **Mục đích**: Truy vết toàn diện từ giao diện (UI) → cổng API (`/api/ktn/*` trên Cloudflare Workers) → cơ sở dữ liệu (Supabase PostgreSQL & izTeach AWS) trước khi chuyển đổi theo mô hình **Strangler Migration** sang React + Vite + TypeScript.

---

## 1. TỔNG QUAN KIẾN TRÚC HIỆN TẠI (BA THÀNH PHẦN DỮ LIỆU)

| Thành phần | Công nghệ / Định danh | Trách nhiệm dữ liệu chuẩn (Source of Truth) |
|---|---|---|
| **1. Lớp Trung Gian (BFF Proxy)** | Cloudflare Workers (`cloudflare-worker-sw-proxy.js`) | Xác thực phiên (`HMAC-SHA256` 2-part token), kiểm tra phân quyền theo vai trò (`student`, `teacher`, `admin`), kiểm duyệt DLP, định tuyến `/api/ktn/*`, ký S3 upload URL và đồng bộ 3 chiều. |
| **2. Cơ Sở Dữ Liệu Nghiệp Vụ** | Supabase PostgreSQL (`supabase_schema.sql`, 11 bảng) | Nguồn chuẩn cho: hồ sơ học viên (`ktn_students`), lớp học (`ktn_classes`), buổi học (`ktn_class_sessions`), bài tập & chấm điểm (`ktn_homeworks`), tin nhắn (`ktn_messages`), cảnh báo DLP & trạng thái đọc (`ktn_dlp_alerts`), đơn hàng (`ktn_orders`), thiết bị Web Push (`ktn_push_subscriptions`). |
| **3. Kho Nội Dung & Cấp Quyền Khóa Học** | izTeach / AWS CloudFront (`*.execute-api.ap-southeast-1.amazonaws.com`, `media.izteach.vn`, `d21acfi38wn3iy.cloudfront.net`) | Nguồn chuẩn cho: danh mục 17 khóa học video (346 bài học HLS `.m3u8`), quyền sở hữu khóa học (`user-permission`), tài khoản Cognito UUID và kho lưu trữ tệp bài tập S3. |

---

## 2. KIỂM TOÁN 4 LUỒNG NGHIỆP VỤ THỰC TẾ

### 2.1. Luồng Học Sinh — Khóa Học Video Tự Học
`Đăng nhập → Tải hồ sơ → Tải khóa học → Chọn bài → Xem video → Nộp bài → Xem kết quả`

| Hạng mục | Chi tiết kiểm toán thực tế |
|---|---|
| **File / Component hiện tại** | `index.html` (Popup đăng nhập) → `ktn-webapp-client.js` (`saveSession`, `enforceRolePage`) → `sll-hocsinh.html` (sinh từ `portal_template.html` + `build_clean_real_portal.js`) + dữ liệu bài học `clean_lessons_data.json` / `all_courses_lessons_data.json`. |
| **API liên quan** | • `POST /api/ktn/auth/login` & `GET /api/ktn/auth/session`<br>• `GET /api/ktn/students/me?sync=1`<br>• `GET /api/ktn/courses`<br>• `GET /api/ktn/courses/units?courseId=<24-hex>`<br>• `POST /api/ktn/homeworks/upload-url` → `PUT <S3 Presigned URL>`<br>• `POST /api/ktn/homeworks` & `GET /api/ktn/homeworks` |
| **Nguồn dữ liệu chuẩn** | • Quyền khóa học: `ktn_students.online_courses` đối soát 2 chiều với izTeach `GET /prod/user-permission`.<br>• Video HLS: `media.izteach.vn/<vendorId>/<videoId>/playlist.m3u8` + `all_courses_lessons_data.json`.<br>• Bài tập & điểm: `ktn_homeworks` trên Supabase (đồng bộ bản sao sang izTeach `POST /prod/homework`). |
| **Quyền truy cập (RBAC)** | • Học sinh chỉ mở được khóa học nằm trong `online_courses` của mình. Nếu chưa mua (`taphong2002vip@gmail.com`) hoặc đã bị thu hồi, `/api/ktn/courses/units` và `/api/ktn/homeworks` trả về `403 COURSE_NOT_ENTITLED`. |
| **Xử lý lỗi & Fallback** | • Nếu izTeach `/prod/homework` lỗi `503`, Worker vẫn lưu bài tập vào Supabase với `syncStatus: 'sync_failed'` và `mirroredToIzTeach: false` (không mất bài của học sinh).<br>• Kiểm tra `HEAD` trên CloudFront/S3 đảm bảo tệp nộp có dung lượng `> 0 byte` và `<= 50MB`. |
| **Test hiện có** | `tests/ktn_three_way_reliability_suite.cjs` (`A1`, `A2`, `A3`, `A4`, `C1`, `E1`, `E3`) & `tests/ktn_browser_e2e_local.cjs` (`B1`, `B2`, `B3`). |
| **Nguy cơ khi chuyển sang React** | • Nguy cơ làm lộ URL/token hoặc cho phép mở khóa học khi chỉ kiểm tra ở client.<br>• Nguy cơ mất bản thu âm (`Blob`) khi upload S3 hoặc gọi API nộp bài thất bại.<br>• Nguy cơ gửi nhầm `unitId` của khóa HSK1 sang khóa khác (gây lỗi `400 UNIT_COURSE_MISMATCH`). |

---

### 2.2. Luồng Lớp Trực Tiếp (Live Class)
`Đăng nhập → Xem lớp → Xem buổi học → Xem bài được giao → Nộp bài → Giáo viên chấm`

| Hạng mục | Chi tiết kiểm toán thực tế |
|---|---|
| **File / Component hiện tại** | • Học sinh: `sll-hocsinh.html` (`renderLiveClassRoomView`, `#/lop/<classCode>/buoi/<sessionNum>`).<br>• Giáo viên: `sll-teacher.html` + `so-lien-lac-lms.js` + `so-lien-lac-ux.js` (tab `assign` Giao bài, tab `grade` Chấm bài). |
| **API liên quan** | • `GET /api/ktn/classes`<br>• `GET /api/ktn/class-sessions?classCode=<code_lop>`<br>• `POST /api/ktn/class-sessions` (Giáo viên giao bài theo buổi)<br>• `POST /api/ktn/homeworks` (với `courseId: 'CLASS_<classCode>'`, `lessonNum: sessionNum * 100 + exNum`)<br>• `PATCH /api/ktn/homeworks/grade` (Giáo viên chấm điểm `0–10` bước `0.5` hoặc `revision_requested`) |
| **Nguồn dữ liệu chuẩn** | • Danh sách lớp: `ktn_classes` (`YCT2-04`, `YCT3-02`, `YCT1-01`).<br>• Nội dung buổi học & bài giao: `ktn_class_sessions` kết hợp `DEFAULT_SESSIONS_BY_CLASS`.<br>• Bài nộp lớp trực tiếp: `ktn_homeworks` với `course_id = 'CLASS_<classCode>'` và `syncStatus = 'not_applicable_live_class'` (tuyệt đối không đẩy nhầm sang khóa video HSK1 trên izTeach). |
| **Quyền truy cập (RBAC)** | • Học sinh chỉ xem/nộp được buổi học của đúng `class_code` mình đang xếp (`403` nếu truy cập lớp khác).<br>• Giáo viên chỉ giao bài và chấm bài cho các lớp mình chủ nhiệm (`getTeacherAssignedClassCodes`). |
| **Test hiện có** | `tests/ktn_three_way_reliability_suite.cjs` (`A2-LIVE-CLASS-NO-HSK1-LEAK`, `A5-TEACHER-RBAC-BOUNDARIES`, `D1-CLASS-SESSION-SCHEMA-AND-ISOLATION`) & `tests/ktn_browser_e2e_local.cjs` (`B4`). |
| **Nguy cơ khi chuyển sang React** | • Không phân biệt rõ `course_id = 'CLASS_<classCode>'` (lớp trực tiếp) với `course_id = '<24-hex>'` (khóa học video).<br>• Không hiển thị lịch sử nộp lại (`workbook_answers._history`) hoặc trạng thái `revision_requested` ("Cần sửa lại"). |

---

### 2.3. Luồng Chat Nhóm Lớp & Trao Đổi Cô Giáo — Phụ Huynh
`Đăng nhập → Xác định lớp → Tải tin nhắn → Gửi tin → Lưu database → Người nhận thấy tin → Cập nhật thông báo`

| Hạng mục | Chi tiết kiểm toán thực tế |
|---|---|
| **File / Component hiện tại** | • Học sinh: `sll-hocsinh.html` (`loadStudentMessages`, `sendStudentChatMessage`, `selectStudentGroupRoom`, `switchStudentChatMode`).<br>• Giáo viên / Admin: `so-lien-lac-lms.js` (`P.groups`, `lmsSyncRoomMessages`, `lmsSendGroup`, `lmsPinRoomAnnouncement`) & `so-lien-lac-ux.js` (`KtnChatClient`). |
| **API liên quan** | • `GET /api/ktn/messages/rooms`<br>• `GET /api/ktn/messages?roomId=<roomId>`<br>• `POST /api/ktn/messages`<br>• `POST /api/ktn/messages/pin` |
| **Nguồn dữ liệu chuẩn** | Bảng `public.ktn_messages` trên Supabase PostgreSQL (`room_id` dạng `YCT2-04`, `course:<courseId>`, `student:<email>`). Thông báo ghim lưu tại `ktn_dlp_alerts` (`room_id = 'PINNED_MSG|<room>'`). |
| **Quyền truy cập (RBAC)** | Hàm `canAccessChatRoom` trong Worker kiểm tra nghiêm ngặt:<br>• `class:<code_lop>`: Học sinh phải thuộc lớp đó; Giáo viên phải phụ trách lớp đó.<br>• `course:<courseId>`: Học sinh phải có quyền khóa học đó.<br>• `student:<email>`: Học sinh chỉ vào được phòng `student:<chính_mình>`. |
| **Kiểm toán 7 lỗi Chat cũ (BUG CHAT-01 → CHAT-07)** | Xem bảng phân tích chi tiết tại Mục 3 bên dưới. |

---

### 2.4. Luồng Thông Báo (Notifications & PWA Push)
`Phát sinh sự kiện → Lưu sự kiện → Xác định người nhận → Cập nhật danh sách → Đánh dấu đã đọc → Đồng bộ trạng thái`

| Hạng mục | Chi tiết kiểm toán thực tế |
|---|---|
| **File / Component hiện tại** | `sll-hocsinh.html` & `so-lien-lac-lms.js` (`window.KTN_NOTIF`), `ktn-webapp-client.js` (`registerPwaNotifications`), Worker `/sw.js`. |
| **API liên quan** | • `GET /api/ktn/notifications`<br>• `PATCH /api/ktn/notifications/read`<br>• `POST /api/ktn/push/subscribe` |
| **Nguồn dữ liệu chuẩn** | • Sự kiện tổng hợp trực tiếp từ dữ liệu thật trên Supabase (`ktn_homeworks` đã chấm/cần sửa/mới nộp, `ktn_messages` mới từ cô giáo/học sinh, `ktn_orders` chờ duyệt).<br>• Trạng thái đã đọc lưu trên Supabase tại `ktn_dlp_alerts` (`room_id = 'NOTIF_READ_STATE'`, `sender_email = session.email`). |
| **Quyền truy cập (RBAC)** | Mỗi tài khoản chỉ nhận thông báo lọc theo đúng `session.email` và `assignedClasses` của mình; `readIds` lưu tách biệt theo `sender_email`. |
| **Nguy cơ khi chuyển sang React** | • Điều hướng sai khi bấm vào thông báo (cần map chính xác bài tập lớp trực tiếp vs khóa học video vs phòng chat).<br>• Xin quyền Web Push ngay khi mới tải trang (vi phạm UX & bị trình duyệt chặn). |

---

## 3. PHÂN TÍCH CHI TIẾT CÁC VẤN ĐỀ CHAT CŨ (BUG CHAT-01 → CHAT-07)

| Mã lỗi | Hiện trạng trong code cũ | Giải pháp khắc phục trong KTN UI V2 & BFF |
|---|---|---|
| **BUG CHAT-01**<br>*(Thành công giả / Thiếu trạng thái Đang gửi)* | `lmsSendGroup()` (`so-lien-lac-lms.js:2683`) và `sendStudentChatMessage()` (`sll-hocsinh.html:6858`) chặn nút gửi rồi đợi API, nhưng không tạo `clientMessageId` để hiển thị bong bóng trạng thái **"Đang gửi..."** hoặc nút **"Gửi lại"** trên từng tin nhắn khi mất mạng. Trong khi đó `KtnChatClient.sendMessage()` (`so-lien-lac-ux.js:8193`) lại phát `OPTIMISTIC_SEND` qua BroadcastChannel trước khi server xác nhận. | Thiết kế state machine chuẩn cho từng tin nhắn:<br>`sending` (có `clientMessageId`, hiển thị "Đang gửi...") → gọi `POST /api/ktn/messages` kèm `clientMessageId` → chỉ khi HTTP 200 & `data.ok && data.message.id` mới chuyển sang `sent` ("Đã gửi"). Nếu lỗi: chuyển sang `failed` ("Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị.") kèm nút **Thử lại** dùng cùng `clientMessageId` chống trùng. |
| **BUG CHAT-02**<br>*(Tin nhắn giả)* | Trong các phiên bản trước của `sll-hocsinh.html` và `so-lien-lac-server.cjs` (`INITIAL_CHAT_MESSAGES`), hệ thống từng chèn tin nhắn mẫu của giáo viên khi mảng rỗng. Hiện `sll-hocsinh.html:6831` đã hiện gợi ý trống nhưng câu chữ chưa thống nhất. | Trong UI V2 (chế độ dữ liệu thật), khi phòng chưa có tin nhắn từ API, hiển thị đúng Empty State chuẩn: *"Chưa có tin nhắn trong lớp. Hãy gửi lời chào đầu tiên!"* — tuyệt đối không sinh tin nhắn giả của giáo viên. |
| **BUG CHAT-03**<br>*(LocalStorage fallback)* | `loadStudentMessages()` (`sll-hocsinh.html:6825`) đọc `localStorage.getItem('ktn_sll_chat_' + roomId)` khi không tải được từ server mà không gắn nhãn đang ngoại tuyến; bản nháp khi gửi lỗi chưa được lưu bền vững theo từng phòng. | Lưu bản nháp (`draftByRoom`) và hàng đợi tin gửi lỗi (`failedQueueByRoom`) vào store cục bộ nhưng hiển thị cảnh báo rõ ràng: *"Chưa gửi được. Tin nhắn vẫn đang được giữ trên thiết bị."* Tuyệt đối không báo "Đã gửi" nếu chỉ mới lưu ở `localStorage`. |
| **BUG CHAT-04**<br>*(API lưu tin & Idempotency)* | `POST /api/ktn/messages` (`cloudflare-worker-sw-proxy.js:4692`) đã kiểm tra `savedRow.id` và chống trùng 4 giây theo nội dung, nhưng chưa nhận và đối soát `clientMessageId` tường minh khi client retry sau >4 giây. | Nâng cấp `POST /api/ktn/messages` hỗ trợ `clientMessageId` (idempotency key), đối soát chống ghi trùng khi retry, và trả lại `clientMessageId` + `serverMessageId` (`message.id`) khi Supabase xác nhận lưu thành công. |
| **BUG CHAT-05**<br>*(Giới hạn 100 tin tăng dần)* | `GET /api/ktn/messages` (`cloudflare-worker-sw-proxy.js:4663`) đang gọi `order=created_at.asc&limit=100`. Nếu lớp có >100 tin nhắn, các tin từ #101 trở đi (tin mới nhất!) bị mất hoàn toàn và không có cơ chế phân trang tải tin cũ. | Nâng cấp `GET /api/ktn/messages` sang **Cursor-based Pagination**: lấy các tin mới nhất trước, sắp xếp ổn định theo `(created_at ASC, id ASC)`, hỗ trợ tham số `limit` và `before` (cursor) để cuộn lên tải lịch sử cũ mà không mất tin sau tin thứ 100, đồng thời giữ nguyên cấu trúc `messages` tương thích ngược với giao diện cũ. |
| **BUG CHAT-06**<br>*(Realtime cũ `/ws/chat`)* | `KtnChatClient` (`so-lien-lac-ux.js:8005-8300`) kết nối tới `wss://<host>/ws/chat`, `/api/chat/message`, `/api/chat/history`. Các endpoint này chỉ tồn tại trong `so-lien-lac-server.cjs` (local dev server cũ), **KHÔNG tồn tại** trên Cloudflare Worker production (`cloudflare-worker-sw-proxy.js`). | 1) Trong `so-lien-lac-ux.js`: tắt kết nối mặc định tới `/ws/chat`, bỏ phát `OPTIMISTIC_SEND` trước khi server xác nhận, và chuyển toàn bộ `sendMessage` / `fetchChatHistory` sang `/api/ktn/messages`.<br>2) Trong UI V2: dịch vụ `chatRealtime.ts` kết hợp BroadcastChannel đồng bộ tức thời giữa các tab và Adaptive Smart Polling qua `/api/ktn/messages` mà không gọi `/ws/chat`. |
| **BUG CHAT-07**<br>*(Thông báo chưa đọc theo localStorage)* | Giao diện cũ tính `unread` dựa trên `localStorage` theo role/room cục bộ trên 1 trình duyệt, dẫn tới lệch số chưa đọc khi mở trên thiết bị khác hoặc sau khi xóa bộ nhớ trình duyệt. | Bổ sung cơ chế lưu trạng thái đọc trên máy chủ (`POST /api/ktn/messages/read` & `GET /api/ktn/messages/rooms`) định danh theo `(session.email, roomId, lastReadMessageId, lastReadAt)` trên Supabase, kết hợp tính toán chính xác số tin nhắn chưa đọc (`unreadCount`) cho từng hội thoại. |

---

## 4. KẾ HOẠCH CHUYỂN ĐỔI AN TOÀN (STRANGLER MIGRATION)

1. **Giữ nguyên 100% các trang hiện hành**: `index.html`, `sll-hocsinh.html`, `sll-teacher.html`, `sll-admin.html`, `so-lien-lac.html` không bị xóa hay thay đổi hành vi.
2. **Xây dựng ứng dụng mới độc lập tại `apps/ktn-web-v2/`**:
   - Sử dụng React + Vite + TypeScript (strict mode) + Tailwind CSS + shadcn/ui patterns + Zustand + TanStack Query + HLS.js.
   - Tích hợp trực tiếp với các endpoint `/api/ktn/*` của `cloudflare-worker-sw-proxy.js`.
3. **Chế độ Kép (Dual Mode — Phân tách minh bạch)**:
   - **Chế độ Dữ liệu thật (Real API Mode)**: Kết nối trực tiếp `/api/ktn/*` (xác thực thật, phân quyền thật, gửi/nhận tin nhắn liên tài khoản thật, mở khóa học & nộp/chấm bài thật).
   - **Chế độ Demo Tương tác (`DEMO MODE`)**: Gắn nhãn `CHẾ ĐỘ DEMO — DỮ LIỆU MÔ PHỎNG` rõ ràng trên thanh trạng thái, cho phép kiểm tra trực quan mọi trạng thái biên (Empty, Sending, Failed, Unread, Image/PDF/Voice, Video Loading/Playing/Paused/Error/Unentitled, Homework Pending/Submitted/Graded) mà tuyệt đối không ghi dữ liệu giả vào lớp thật hay báo thành công giả.
