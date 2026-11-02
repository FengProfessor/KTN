# TÀI LIỆU KỸ THUẬT: DANH SÁCH 17 TÀI KHOẢN THẬT, CẤU TRÚC API IZTEACH & CƠ CHẾ PHÂN QUYỀN LỚP HỌC

> **Áp dụng khi**: Kỹ thuật viên / Developer cần tra cứu danh sách 17 tài khoản thật đã đồng bộ trên Backend `izTeach`, cấu trúc API tạo tài khoản & mở khóa học tự động, hoặc cơ chế phân quyền Cô giáo — Lớp học — Học sinh trong mã nguồn.

---

## 1. Thông Số Định Danh Hệ Thống (`izTeach` Backend)

| Thành phần | Giá trị kỹ thuật |
| :--- | :--- |
| **Tên đơn vị (Vendor)** | Học Viện Khổng Tử Nhí (`https://khongtunhi.com`) |
| **Vendor ID (`vendorId`)** | `3529cd2b-7af6-4fda-887c-392a79393d6a` |
| **Client ID (`clientId`)** | `fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9` (Header `ol-client-id`) |
| **Staff / Teacher / Admin API** | `https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Student CRM & Sign-in API** | `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Course Permission API** | `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Course Layout & Units API** | `https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Resource & Presigned S3 API** | `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Homework Submit API** | `https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Homework Query History API** | `https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod` |
| **Video Streaming CDN (HLS)** | `https://media.izteach.vn/{vendorId}/{videoId}/playlist.m3u8` |
| **Tài liệu & Audio CDN** | `https://d21acfi38wn3iy.cloudfront.net` |

### Danh sách Mã Khóa Học Online (`ONLINE_COURSE_IDS`)

1. **`6adadba969897b0002482ca5`** — **Khóa học Tiêu Chuẩn New HSK 1 (3.0)** (31 Unit bài giảng & Video HLS, Section `Chương 1`: `6adadbaf69897b0002482cb5`)
2. `678d14b960eae20002ddf8fe` — Khóa học Tiếng Trung Trẻ Em YCT 1
3. `65e7704a9ea90c00080d5195` — Khóa học Tiếng Trung Trẻ Em YCT 2
4. `6638bd09a7367400085c7ab2` — Khóa học Tiếng Trung Trẻ Em YCT 3
5. `6983672f409cc20002e530b8` — Khóa học Tiếng Trung Trẻ Em YCT 4
6. `65e76a533f5e7c00086715d7` — Khóa học Phát Âm & Giao Tiếp Phản Xạ Cơ Bản
7. `67bebce067dba000027d8119` — Khóa học Hán Tự Tư Duy & Luyện Viết Chữ Hán

---

## 2. Danh Sách 17 Tài Khoản Thật Đã Khởi Tạo Trên `izTeach`

> **Lưu ý bảo mật**: Mật khẩu được quản lý qua biến môi trường `IZTEACH_DEFAULT_PASSWORD` (cho 16 tài khoản Quản lý/Giáo viên/Học viên) và `IZTEACH_ADMIN_PASSWORD` (cho tài khoản Root Admin) trong script [provision_real_izteach_accounts.cjs](file:///d:/Vibe/khongtunhi_sofl_style/provision_real_izteach_accounts.cjs). Khi gửi lên API `izTeach`, mật khẩu được mã hóa `Base64` (`btoa(password)`).

### 2.1. Nhóm Tài Khoản Quản Lý & Giáo Viên (7 Tài Khoản Staff API)

| STT | Email đăng nhập | Họ và tên | Quyền (`roles`) | Mã nội bộ SLL | Ghi chú |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 1 | `hocvienkhongtunhi123@gmail.com` | Học Viện Khổng Tử Nhí | `["admin", "root"]` | `ADMIN-ROOT` | Tài khoản Root Admin chủ sở hữu Vendor |
| 2 | `khongtunhi@gmail.com` | ThS. Ngọc Huyền (Quản lý Trung tâm) | `["admin"]` | `ADMIN-KTN` | Gmail Quản lý Trung tâm |
| 3 | `quanly@khongtunhi.com` | ThS. Ngọc Huyền (Quản lý Trung tâm) | `["admin"]` | `ADMIN-KTN` | Email tên miền Quản lý Trung tâm |
| 4 | `linhlam.ktn@gmail.com` | Lão sư Lâm Mỹ Linh | `["teacher"]` | `GV-KTN-08` | Gmail Giáo viên Lâm Mỹ Linh |
| 5 | `linh.lam@khongtunhi.com` | Lão sư Lâm Mỹ Linh | `["teacher"]` | `GV-KTN-08` | Email tên miền Giáo viên Lâm Mỹ Linh |
| 6 | `lam.mylinh@khongtunhi.com` | Lão sư Lâm Mỹ Linh | `["teacher"]` | `GV-KTN-08` | Email dự phòng Giáo viên Lâm Mỹ Linh |
| 7 | `thu.ha@khongtunhi.com` | Lão sư Trần Thu Hà | `["teacher"]` | `GV-KTN-12` | Email Giáo viên Trần Thu Hà |

### 2.2. Nhóm Tài Khoản Học Viên & Phụ Huynh (10 Tài Khoản Student CRM API — 5 Học Sinh)

Mỗi học sinh có **2 tài khoản thật** (1 tài khoản `@gmail.com` và 1 tài khoản `@khongtunhi.com`) đều đã được kích hoạt sẵn **6/6 khóa học Online**:

| STT | Mã Học Viên | Họ và tên | Email Gmail | Email Tên miền | Lớp SLL Mặc định |
| :---: | :--- | :--- | :--- | :--- | :--- |
| 8–9 | `KTN-2026-089` | **Bé Lê Hoàng Ngân** | `hoangngan.ktn@gmail.com` | `hoangngan@khongtunhi.com` | `YCT2-04` |
| 10–11 | `KTN-2026-090` | **Bé Đắc Hanh** | `dachanh.ktn@gmail.com` | `dachanh@khongtunhi.com` | `YCT2-04` |
| 12–13 | `KTN-2026-091` | **Bé An Mẫn** | `anman.ktn@gmail.com` | `anman@khongtunhi.com` | `YCT2-04` |
| 14–15 | `KTN-2026-092` | **Bé Minh Khang** | `minhkhang.ktn@gmail.com` | `minhkhang@khongtunhi.com` | `YCT3-02` |
| 16–17 | `KTN-2026-095` | **Bé Bảo Châu** | `baochau.ktn@gmail.com` | `baochau@khongtunhi.com` | `YCT3-02` |

### 2.3. Nhóm Tài Khoản Kiểm Thử Phân Quyền Khóa Học (HSK 1 3.0 & Admin Verification)

Các tài khoản phục vụ kiểm thử phân quyền 2 lớp (Client & Backend Gateway):

| STT | Email Đăng Nhập | Mật Khẩu | Họ và Tên | Vai Trò (`roles`) | Cognito `userId` / Student ID | Trạng Thái Phân Quyền Khóa New HSK 1 (3.0) |
| :---: | :--- | :--- | :--- | :--- | :--- | :--- |
| **T1** | `taphong2002@gmail.com` | (CRM Session) | **ta phong vo** | `["student"]` | `userId`: `bc21991c-ce9b-465d-b85f-dbb1821e51a9`<br>`studentId`: `6abb2c0b8b46e30002add37b` | **ĐÃ MUA KHÓA HỌC** (`onlineCourses` chứa `6adadba969897b0002482ca5`). Tải trọn vẹn 31 units bài học, video HLS và tài liệu CDN. |
| **T2** | `taphong2002vip@gmail.com` | `<IZTEACH_ADMIN_PASSWORD>` | **ta phong vo** | `["student"]` | `userId`: `424d2085-8685-4a49-a5e8-8fb63b0c85c5`<br>`studentId`: `6ae188a45c37c700026c151b` | **CHƯA MUA KHÓA HỌC** (`onlineCourses: []` rỗng). Gọi `GET /unit` bị backend chặn **HTTP 403 Forbidden** (`"reason": "UNIT_NOT_ENTITLED"`). |
| **T3** | `hocvienkhongtunhi123@gmail.com` | `<IZTEACH_ADMIN_PASSWORD>` | **Học Viện Khổng Tử Nhí** | `["admin", "root"]` | `id`: `a3dff210-d9ce-4238-a794-f0fb4a624659` | **ROOT ADMIN VENDOR**: Toàn quyền quản trị, xem danh sách bài học, cấp signed URL và chấm bài tập. |

---

## 3. Cấu Trúc API `izTeach` Backend Đầy Đủ (Đã Kiểm Trực Tiếp Trên Live AWS Gateway)

> Chi tiết đặc tả đầy đủ từng schema, request body và response format được lưu tại [IZTEACH_BACKEND_API_SPEC.md](file:///d:/Vibe/khongtunhi_sofl_style/IZTEACH_BACKEND_API_SPEC.md).

### 3.1. API Đăng Nhập & Xác Thực Tài Khoản (Authentication APIs)
- **Đăng nhập Học viên (Student Sign-in)**:
  - **Endpoint**: `POST https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin`
  - **Headers**: `Content-Type: application/json`, `ol-vendor-id: 3529cd2b-7af6-4fda-887c-392a79393d6a`, `ol-client-id: fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9`
  - **Body**: `{ email, password: Base64(password), vendorId }`
  - **Phản hồi 200 OK**: `{ accessToken, accessTokenExpiredAt, id (userId UUID), studentId, name, email, roles: ["student"] }`
- **Đăng nhập Quản lý & Giáo viên (Staff / Admin Sign-in)**:
  - **Endpoint**: `POST https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin`
  - **Body**: `{ email, password: Base64(password), vendorId }`
  - **Phản hồi 200 OK**: `{ accessToken, id, name, roles: ["admin", "root"], email }`
- **Quy tắc mã hóa Base64**: Mật khẩu bắt buộc mã hóa Base64 trước khi gửi (`btoa(unescape(encodeURIComponent(password)))`).

### 3.2. API Phân Quyền Khóa Học (`GET /user-permission`)
- **Endpoint**: `GET https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?userId={userId}&vendorId={vendorId}`
- **LƯU Ý CỐT LÕI VỀ AUTHORIZATION HEADER**:
  - **Bắt buộc dùng Token thô (RAW JWT Token)**: `Authorization: <accessToken>`.
  - **TUYỆT ĐỐI KHÔNG thêm tiền tố `Bearer `**: Truyền `Authorization: Bearer <token>` sẽ bị Lambda Authorizer từ chối trả về **HTTP 401 Unauthorized**!
- **Dữ liệu trả về**: Mảng `onlineCourses`:
  - Tài khoản đã mua (`taphong2002@gmail.com`): Trả về mảng chứa `6adadba969897b0002482ca5`.
  - Tài khoản chưa mua (`taphong2002vip@gmail.com`): Trả về mảng rỗng `[]`.

### 3.3. API Cấu Trúc Khóa Học & 31 Unit Bài Học (`GET /course/layout` & `GET /unit`)
- **Layout chương học**:
  - **Endpoint**: `GET https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/course/layout/{courseId}?vendorId={vendorId}`
  - **Lưu ý**: Bắt buộc phải có query parameter `?vendorId=...`, nếu thiếu backend sẽ báo lỗi 500 do không destructure được `event.queryStringParameters`.
- **Danh sách 31 Unit bài học**:
  - **Endpoint**: `GET https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/unit?course={courseId}&vendorId={vendorId}`
  - **Bảo vệ 2 lớp (Server-side 403)**: Tài khoản chưa mua khóa học (`taphong2002vip`) gọi endpoint này sẽ bị server trả về **HTTP 403 Forbidden** (`"reason": "UNIT_NOT_ENTITLED"`).

### 3.4. Hệ Thống CDN Video Streaming & Tài Liệu Mục 0
- **Video bài giảng HLS Streaming**:
  - Định dạng: Apple HLS (`playlist.m3u8`), phân giải HD sắc nét.
  - Cấu trúc URL phát: `https://media.izteach.vn/{vendorId}/{videoId}/playlist.m3u8`
  - Cấu trúc URL Poster: `https://media.izteach.vn/{vendorId}/{videoId}/thumbnail.jpg`
- **Mục 0: 5 Cuốn Giáo trình PDF bản quyền**:
  - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf` (148 trang, 60.27 MB)
  - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf` (150 trang, 46.78 MB)
  - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf` (137 trang, 2.22 MB)
  - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf` (68 trang, 49.90 MB)
  - `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf` (312 trang, 12.62 MB)
- **Mục 0: 127 Tệp Audio MP3**: 93 audio SGK và 34 audio SBT (bao gồm 1 audio thi thử mô phỏng toàn diện).

### 3.5. API S3 Upload, Nộp Bài Tập & Đồng Bộ Chấm Điểm Đa Chiều (Đổ Về & Đồng Bộ 100% Vào `izTeach`)
- **Bước 0 — Cấp phát Vendor Service Token (`IzTeachPortalClient.getServiceToken`)**:
  - Gateway `xx7swzlhyl` (`/resource/signed-url`, `/resource`) yêu cầu quyền Staff/Vendor Admin (`hocvienkhongtunhi123@gmail.com` qua `POST https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin`). Nếu dùng `accessToken` của học viên hoặc token cũ, API Gateway trả về `HTTP 403 Forbidden`. Do đó Client luôn dùng `fetchWithServiceToken` (tự động refresh & retry khi gặp `401`/`403`) và không gửi custom header `ol-vendor-id` để tránh lỗi CORS preflight.
- **Bước 1 — Xin Presigned S3 URL**: `GET https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url?key=resource/homeworks/{vendorId}/{timestamp}-{cleanName}&contentType={mimeType}`
- **Bước 2 — Upload nhị phân trực tiếp lên AWS S3**: `PUT <signedUrl>` với raw binary `File`/`Blob` (hỗ trợ đính kèm đồng thời cả Ảnh vở viết + File thu âm giọng đọc `MediaRecorder`/`WAV`), phân phối tức thì qua CloudFront `https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/...`.
- **Bước 3 — Đăng ký tài nguyên vào izTeach**: `POST https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource` -> trả về MongoDB `resource._id`.
- **Bước 4 — Nộp bài tập gắn định danh Học viên & Unit**: `POST https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework` với `{ title, notes, vendorId, course: activeCourseId, unit: unitId, userId, name, email, state: "submitted", type: "multiple-files", resources }`.
- **Bước 5 — Đồng bộ tức thì sang Sổ Liên Lạc Giáo Viên / Quản Lý & Chấm Điểm 2 Chiều**:
  - Ngay khi nộp bài, bản ghi được đẩy vào `window.app.state.homeworks` (`status: 'PENDING'`) và đồng bộ lên Cloud State (`ktn-sll-state` qua `PUT /vendor-setting/{vendorId}`).
  - Khi Giáo viên chấm điểm (`app.submitTeacherGrade`), hệ thống gọi `window.IZTEACH_STORAGE.markHomeworkRecord` tạo bản ghi `state: "approved", mark: <score>` trên `POST https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework` và xóa bản chờ chấm cũ (`DELETE /homework/{oldId}`), đồng thời cập nhật điểm và lời phê về Cổng Học Viên.
- **Bước 6 — Lấy lịch sử & lời phê chấm điểm**: `GET https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework?vendorId={vendorId}&course={courseId}`
  - Lọc theo đúng `email` / `userId` của học viên đang đăng nhập, ưu tiên bản ghi mới nhất hoặc đã chấm (`state: "approved"`), đổi bài học sang màu **XANH LÁ** (`.state-completed`), hiển thị khung **Preview tệp CloudFront (`#submitted-resources-preview`)** và điểm số giáo viên chấm (`mark`).

### 3.6. API Quản Trị Cấp Tài Khoản & Mở Khóa Học Online
- **Tạo tài khoản Giáo viên / Quản lý (`POST /signup`)**: `https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signup`
- **Tạo hồ sơ Học sinh trong CRM (`POST /student`)**: `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student`
- **Cấp quyền Khóa học Online cho Học viên (`PUT /user-permission/add-products/:userId`)**:
  - **Endpoint**: `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/add-products/<userId>`
  - **Body JSON**:
    ```json
    {
      "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
      "userId": "<student_user_id>",
      "productIds": [
        "6adadba969897b0002482ca5",
        "678d14b960eae20002ddf8fe",
        "65e7704a9ea90c00080d5195",
        "6638bd09a7367400085c7ab2",
        "6983672f409cc20002e530b8",
        "65e76a533f5e7c00086715d7",
        "67bebce067dba000027d8119"
      ],
      "productType": "online-course"
    }
    ```

---

## 4. Kiến Trúc Phân Quyền Trong Mã Nguồn Sổ Liên Lạc

Toàn bộ logic phân quyền **Cô giáo nào vào Lớp nào** và **Học sinh nào vào Lớp nào** được xử lý trong [so-lien-lac-ux.js](file:///d:/Vibe/khongtunhi_sofl_style/so-lien-lac-ux.js) và [so-lien-lac-auth.js](file:///d:/Vibe/khongtunhi_sofl_style/so-lien-lac-auth.js):

| Hàm trong `window.app` ([so-lien-lac-ux.js](file:///d:/Vibe/khongtunhi_sofl_style/so-lien-lac-ux.js)) | Chức năng kỹ thuật |
| :--- | :--- |
| `app.adminAssignClassTeacher(classId, teacherCode)` | Phê duyệt / gán Giáo viên (`teacherCode`) phụ trách Lớp (`classId`). Tự động cập nhật tên Giáo viên chủ nhiệm cho toàn bộ học sinh thuộc lớp đó và lưu vào `localStorage`. |
| `app.adminAssignStudentClass(studentIdx, newClassCode)` | Phê duyệt Học sinh (`studentIdx`) vào Lớp (`newClassCode`, ví dụ `'YCT2-04'`, `'YCT3-02'`) hoặc chọn `''` để ẩn Sổ Liên Lạc. |
| `app.adminToggleStudentOnline(studentIdx)` | Bật/tắt quyền Khóa học Online cho học sinh `studentIdx` và tự động gọi API `PUT /user-permission/add-products/:userId` khi có `userId` & Admin Token. |
| `app.adminProvisionAccount(customData)` | Cấp tài khoản mới (Học viên hoặc Giáo viên) ngay trên UI Quản lý Trung tâm; đồng thời gọi API `izTeach` nếu có Admin Token. |
| `app.adminCreateClass(customData)` | Mở lớp học mới và gán Giáo viên phụ trách ngay trên Bảng Điều Hành. |
| `app.getTeacherManagedClasses()` | Trả về danh sách các Lớp mà Giáo viên đang đăng nhập được Quản lý phê duyệt phụ trách. |
| `app.getTeacherManagedStudents()` | Chỉ trả về danh sách Học sinh thuộc các Lớp mà Giáo viên đang đăng nhập phụ trách (đảm bảo Cô giáo lớp nào chỉ thấy học sinh lớp đó). |
| `app.getStudentTeacher(stu)` | Trả về thông tin Cô giáo phụ trách lớp hiện tại của Học sinh `stu`. |

---

## 5. Các Lệnh Kiểm Thử & Triển Khai Nhanh (CLI Commands)

Tại thư mục `d:\Vibe\khongtunhi_sofl_style`:

```powershell
# 1. Xem hướng dẫn cấp tài khoản qua CLI:
node .\provision_real_izteach_accounts.cjs --help

# 2. Kiểm thử toàn bộ 3 luồng quản trị (Cấp tài khoản, Phân lớp Cô giáo, Phân lớp Học sinh):
node .\verify_approval_and_provisioning_flows.cjs

# 3. Kiểm thử toàn bộ các ca sử dụng & bảo mật phiên (RBAC, DLP, Chấm điểm):
node --test .\verify_sll_auth.cjs
node .\verify_sll_system_cases.cjs

# 4. Kiểm thử luồng đăng nhập Gmail thật trên cả Local & Live (https://khongtunhi.com):
node .\verify_live_gmail_flows.cjs

# 5. Triển khai bản cập nhật Sổ Liên Lạc lên máy chủ https://khongtunhi.com:
node .\deploy_so_lien_lac_live.cjs

# 6. Kiểm tra xác nhận 100% các endpoint API backend izTeach (Milestone 1 Validation Suite):
node .\validate_izteach_m1_endpoints.cjs
```

