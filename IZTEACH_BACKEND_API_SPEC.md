# TÀI LIỆU ĐẶC TẢ KỸ THUẬT TOÀN DIỆN HỆ THỐNG API BACKEND IZTEACH
## Dành Cho Cổng Học Viên New HSK 1 (3.0) — Học Viện Khổng Tử Nhí

> **Phiên bản tài liệu:** 1.0.0 (Chuẩn hóa thực nghiệm Milestone 1 — Stream 1, 2, 3)  
> **Hệ thống mục tiêu:** izTeach LMS Backend (AWS Serverless Architecture: API Gateway, Lambda, DynamoDB, S3, CloudFront CDN, Media Streaming)  
> **Mục tiêu áp dụng:** Thay thế toàn bộ cơ chế lưu trữ tạm bợ qua `localStorage`, kết nối trực tiếp 100% dữ liệu xác thực, phân quyền khóa học, bài học 31 units, video HLS, tài liệu CloudFront, đồng bộ tiến độ và nộp bài tập về backend izTeach.

---

## MỤC LỤC TÀI LIỆU

1. [Phần 1: Tổng Quan Kiến Trúc & Các Tham Số Hệ Thống](#phần-1-tổng-quan-kiến-trúc--các-tham-số-hệ-thống)
2. [Phần 2: Xác Thực & Quản Lý Phiên (Authentication & Session Management)](#phần-2-xác-thực--quản-lý-phiên)
3. [Phần 3: Phân Quyền Khóa Học Học Viên (Course Entitlements & Access Control)](#phần-3-phân-quyền-khóa-học-học-viên)
4. [Phần 4: Cấu Trúc Khóa Học, 31 Unit Bài Học & Video HLS Streaming](#phần-4-cấu-trúc-khóa-học-31-unit-bài-học--video-hls-streaming)
5. [Phần 5: Mục 0 Thư Viện Tài Liệu Đính Kèm Trên CloudFront CDN](#phần-5-mục-0-thư-viện-tài-liệu-đính-kèm-trên-cloudfront-cdn)
6. [Phần 6: Đồng Bộ Tiến Độ Học Tập (Progress Tracking & Completion Synchronization)](#phần-6-đồng-bộ-tiến-độ-học-tập)
7. [Phần 7: Quy Trình Nộp Bài Tập & Lịch Sử Bài Làm (S3 Storage & Homework Submission)](#phần-7-quy-trình-nộp-bài-tập--lịch-sử-bài-làm)
8. [Phần 8: Bảng Mã Lỗi & Xử Lý Ngoại Lệ (Error Handling Matrix)](#phần-8-bảng-mã-lỗi--xử-lý-ngoại-lệ)

---

## PHẦN 1: TỔNG QUAN KIẾN TRÚC & CÁC THAM SỐ HỆ THỐNG

### 1.1. Sơ Đồ Kiến Trúc Hệ Thống (Architecture Map)

Hệ thống backend izTeach được xây dựng theo mô hình vi dịch vụ Serverless trên nền tảng AWS (ap-southeast-1, Singapore):

```
                                  ┌────────────────────────────────────────────────────────┐
                                  │                  AWS CLOUDFRONT CDN                    │
                                  │           d21acfi38wn3iy.cloudfront.net                │
                                  └───────────▲──────────────────────────────▲─────────────┘
                                              │                              │
                                     [PDF Books (5 files)]          [MP3 Audios (127 files)]
                                              │                              │
┌────────────────────────┐        ┌───────────┴──────────┐        ┌──────────┴─────────────┐
│  CỔNG HỌC VIÊN WEB UI   │        │     AWS S3 BUCKET    │        │   HLS STREAMING MEDIA  │
│ (portal_template.html) │        │ (Source & Homework)  │        │     media.izteach.vn   │
└───────────┬────────────┘        └───────────▲──────────┘        └──────────▲─────────────┘
            │                                 │ PUT Binary Files                     │ .m3u8 / .ts
            │                                 │ (Signed URL)                         │
            ▼                                 │                                      │
┌─────────────────────────────────────────────┴──────────────────────────────────────┴─────┐
│                             AWS API GATEWAY MICROSERVICES (PROD)                         │
├──────────────────────────┬─────────────────────────────┬─────────────────────────────────┤
│ Gateway: fpdamf1645      │ Gateway: vs1ocpw7ri         │ Gateway: p9y4zl6vkd             │
│ - POST /student/signin   │ - GET /user-permission      │ - GET /course/layout/{courseId} │
│ - GET  /student          │   (Raw JWT Header Check)    │ - GET /unit (Enforced 403)      │
├──────────────────────────┼─────────────────────────────┼─────────────────────────────────┤
│ Gateway: gcnj5paf1j      │ Gateway: xx7swzlhyl         │ Gateway: rt6i5wgkj4 & tr8x5atpvd│
│ - POST /signin           │ - GET /resource/signed-url  │ - POST /homework (Submit)       │
│   (Admin & Teacher)      │ - POST /resource (Metadata) │ - GET  /homework (History)      │
└──────────────────────────┴─────────────────────────────┴─────────────────────────────────┘
```

### 1.2. Bảng Hằng Số Định Danh Hệ Thống (System Constants)

| Tên Hằng Số | Giá Trị Kỹ Thuật | Phạm Vi Sử Dụng |
| :--- | :--- | :--- |
| **`VENDOR_ID`** | `3529cd2b-7af6-4fda-887c-392a79393d6a` | Định danh Học Viện Khổng Tử Nhí trên toàn bộ database và API izTeach |
| **`CLIENT_ID`** | `fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9` | Client ID bắt buộc trong Header `ol-client-id` của cổng Web |
| **`HSK1_COURSE_ID`** | `6adadba969897b0002482ca5` | Khóa học Tiêu Chuẩn New HSK 1 (3.0) — 31 units, 15 bài |
| **`HSK1_SECTION_ID`**| `6adadbaf69897b0002482cb5` | Section duy nhất ("Chương 1") chứa toàn bộ 31 bài học |
| **`MEDIA_CDN_HOST`** | `media.izteach.vn` | Máy chủ phát video streaming phân giải cao định dạng HLS m3u8 |
| **`DOC_CDN_HOST`**   | `d21acfi38wn3iy.cloudfront.net` | Mạng phân phối nội dung toàn cầu lưu trữ 5 sách PDF & 127 audio MP3 |

### 1.3. Danh Mục Các Cụm API Gateway Chính

| Cụm Dịch Vụ Backend | AWS Host Base URL | Chức Năng |
| :--- | :--- | :--- |
| **Student Auth & CRM** | `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod` | Đăng nhập học sinh, tra cứu hồ sơ học viên |
| **Staff & Admin Auth** | `https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod` | Đăng nhập Quản lý Trung tâm (`admin`, `root`) và Giáo viên |
| **Entitlements API**   | `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod` | Tra cứu quyền sở hữu khóa học (`user-permission`) |
| **Course & Unit LMS**  | `https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod` | Layout chương học, danh sách 31 bài giảng |
| **S3 Resource API**    | `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod` | Xin Presigned S3 URL và đăng ký metadata tệp |
| **Homework Submit API**| `https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod` | Tiếp nhận bản ghi bài tập của học viên |
| **Homework Query API** | `https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod` | Lấy lịch sử bài tập, trạng thái chấm điểm và lời phê |

---

## PHẦN 2: XÁC THỰC & QUẢN LÝ PHIÊN

### 2.1. Quy Chuẩn Mã Hóa Mật Khẩu (Base64 Encoding)

Mọi mật khẩu trước khi gửi lên API Gateway **bắt buộc** phải được mã hóa Base64:
- **Node.js**:
  ```javascript
  const b64Password = Buffer.from(password, 'utf8').toString('base64');
  ```
- **Trình duyệt Web (Browser JavaScript)**:
  ```javascript
  const b64Password = btoa(unescape(encodeURIComponent(password)));
  ```
- **Ví dụ**: Mật khẩu `<IZTEACH_ADMIN_PASSWORD>` -> Mã hóa thành `MTIzMTIz`; mật khẩu `123456` -> Mã hóa thành `MTIzNDU2`.

### 2.2. Đăng Nhập Học Viên (Student Sign-in)

- **Endpoint**: `POST https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin`
- **Headers Bắt Buộc**:
  ```http
  Content-Type: application/json
  ol-vendor-id: 3529cd2b-7af6-4fda-887c-392a79393d6a
  ol-client-id: fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9
  ```
- **Request Body (JSON)**:
  ```json
  {
    "email": "taphong2002vip@gmail.com",
    "password": "MTIzMTIz",
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a"
  }
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiredAt": 1796094036921,
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "refreshTokenExpiredAt": 1799118036921,
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
    "id": "424d2085-8685-4a49-a5e8-8fb63b0c85c5",
    "studentId": "6ae188a45c37c700026c151b",
    "email": "taphong2002vip@gmail.com",
    "name": "ta phong vo",
    "phone": "0949317037",
    "roles": ["student"],
    "state": "verified",
    "dataType": "user-profile"
  }
  ```
- **Các Trường Trả Về Quan Trọng**:
  - `accessToken`: JWT Token có hiệu lực 30 ngày (tương ứng trường `accessTokenExpiredAt`).
  - `id`: Định danh UUID của người dùng trên AWS Cognito/DynamoDB (còn gọi là `userId`). **Dùng trường này để truyền vào query parameter `userId` của endpoint `/user-permission`**.
  - `studentId`: MongoDB ObjectId của học sinh trong CRM (dùng liên kết lớp học và sổ điểm).
  - `roles`: Mảng vai trò, mặc định `["student"]`.

### 2.3. Đăng Nhập Quản Trị & Giáo Viên (Staff / Admin Sign-in)

- **Endpoint**: `POST https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin`
- **Headers Bắt Buộc**:
  ```http
  Content-Type: application/json
  ol-vendor-id: 3529cd2b-7af6-4fda-887c-392a79393d6a
  ol-client-id: fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9
  ```
- **Request Body (JSON)**:
  ```json
  {
    "email": "hocvienkhongtunhi123@gmail.com",
    "password": "MTIzMTIz",
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a"
  }
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  ```json
  {
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "accessTokenExpiredAt": 1798686037604,
    "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
    "id": "a3dff210-d9ce-4238-a794-f0fb4a624659",
    "roles": ["admin", "root"],
    "email": "hocvienkhongtunhi123@gmail.com",
    "name": "Khổng Tử Nhí",
    "state": "verified"
  }
  ```

### 2.4. Quy Tắc Auth Headers — Bắt Buộc Sử Dụng Raw Token (No "Bearer " Prefix)

> ⚠️ **CẢNH BÁO KỸ THUẬT SỐNG CÒN (CRITICAL CONTRACT)**:  
> Khi gọi API Tra cứu Quyền Khóa học (`vs1ocpw7ri/prod/user-permission`), Lambda Authorizer nội bộ của AWS API Gateway giải mã trực tiếp chuỗi JWT:
> - **ĐÚNG**: `Authorization: <accessToken>` (Token thô, không tiền tố) -> **HTTP 200 OK**!
> - **SAI**: `Authorization: Bearer <accessToken>` -> **HTTP 401 Unauthorized** (`{"message":"Unauthorized"}`)!
> Khi lập trình HTTP client, luôn truyền token trực tiếp:
> ```javascript
> headers: {
>   'Authorization': session.accessToken, // Tuyệt đối không thêm 'Bearer '
>   'ol-vendor-id': '3529cd2b-7af6-4fda-887c-392a79393d6a',
>   'ol-client-id': 'fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9'
> }
> ```

---

## PHẦN 3: PHÂN QUYỀN KHÓA HỌC HỌC VIÊN

### 3.1. Endpoint Tra Cứu Quyền Khóa Học (`GET /user-permission`)

- **Endpoint**: `GET https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?userId={userId}&vendorId={vendorId}`
- **Query Parameters**:
  - `userId`: Chuỗi UUID lấy từ `session.id` (ví dụ `bc21991c-ce9b-465d-b85f-dbb1821e51a9`).
  - `vendorId`: `3529cd2b-7af6-4fda-887c-392a79393d6a`.
- **Headers**:
  ```http
  Authorization: <accessToken>
  ol-vendor-id: 3529cd2b-7af6-4fda-887c-392a79393d6a
  ol-client-id: fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9
  ```
- **Response Format (HTTP 200 OK)**:
  ```json
  {
    "offlineCourses": [],
    "onlineCourses": [
      {
        "id": "6adadba969897b0002482ca5",
        "title": "HSK1 3.0",
        "previewImg": "https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/1793019372729-hsk1_gemini_thumb.png",
        "authors": [],
        "permissions": [
          {
            "userPermissionId": "6ae45f8a1344eb0002807e20",
            "sourceType": "default",
            "sourceName": null,
            "createdAt": "2026-10-30T09:12:42.137Z",
            "limitTime": null
          }
        ],
        "isExpired": false,
        "link": null,
        "progress": null
      }
    ],
    "books": []
  }
  ```

### 3.2. So Sánh Thực Nghiệm 2 Trạng Thái Tài Khoản

| Tiêu Chí Đối Soát | Tài Khoản ĐÃ MUA KHÓA HỌC (`taphong2002@gmail.com`) | Tài Khoản CHƯA MUA KHÓA HỌC (`taphong2002vip@gmail.com`) |
| :--- | :--- | :--- |
| **Cognito User ID (`userId`)** | `bc21991c-ce9b-465d-b85f-dbb1821e51a9` | `424d2085-8685-4a49-a5e8-8fb63b0c85c5` |
| **Student CRM ID (`_id`)** | `6abb2c0b8b46e30002add37b` | `6ae188a45c37c700026c151b` |
| **Kết quả `GET /user-permission`** | Trả về 2 khóa học (`onlineCourses.length === 2`), bao gồm HSK 1 3.0 (`6adadba969897b0002482ca5`) và Chinese For Kids | Trả về mảng rỗng `onlineCourses: []` |
| **Gọi trực tiếp `GET /unit`** | **HTTP 200 OK** (tải trọn vẹn 31 bài học) | **HTTP 403 Forbidden** (`"reason": "UNIT_NOT_ENTITLED"`) |
| **Trải nghiệm trên Cổng học viên**| Mở khóa toàn bộ 15 bài học, phát video HLS m3u8, mở tài liệu mục 0 và nộp bài | Khóa toàn bộ nội dung, hiển thị Empty State thông báo tài khoản chưa kích hoạt |

### 3.3. Cơ Chế Chặn Quyền Phía Server (Server-Side 403 Enforcement)

Không chỉ phân quyền ở phía giao diện trình duyệt, hệ thống AWS Lambda izTeach trên Gateway `p9y4zl6vkd` kích hoạt kiểm tra token ở tầng backend:
- Khi học viên chưa mua khóa gọi `GET /prod/unit?course=6adadba969897b0002482ca5&vendorId=3529cd2b-7af6-4fda-887c-392a79393d6a`:
  ```json
  {
    "errorMessage": "Bạn chưa có quyền truy cập nội dung của khóa học này",
    "errorType": "Error",
    "code": 403,
    "reason": "UNIT_NOT_ENTITLED"
  }
  ```
- Điều này bảo đảm an toàn dữ liệu 2 lớp (Defense-in-depth): cả Client-side Routing và Backend API Gateway đều bảo vệ quyền truy cập.

---

## PHẦN 4: CẤU TRÚC KHÓA HỌC, 31 UNIT BÀI HỌC & VIDEO HLS STREAMING

### 4.1. Endpoint Layout Khóa Học (`GET /course/layout`)

> ⚠️ **LƯU Ý BẮT BUỘC VỀ QUERY STRING**:  
> Endpoint này yêu cầu tham số query string `?vendorId={vendorId}`. Nếu không truyền, Lambda backend sẽ trả về lỗi `500 Cannot destructure property 'vendorId' of 'event.queryStringParameters' as it is null`.

- **Endpoint**: `GET https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/course/layout/{courseId}?vendorId={vendorId}`
- **Headers**:
  ```http
  Authorization: <accessToken>
  ol-vendor-id: 3529cd2b-7af6-4fda-887c-392a79393d6a
  ol-client-id: fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  ```json
  [
    {
      "_id": "6adadbaf69897b0002482cb5",
      "title": "Chương 1",
      "course": "6adadba969897b0002482ca5",
      "index": 0,
      "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
      "tags": "chuong-1",
      "createdAt": "2026-10-23T03:59:43.000Z"
    }
  ]
  ```

### 4.2. Endpoint Danh Sách Bài Học (`GET /unit`)

- **Endpoint**: `GET https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/unit?course={courseId}&vendorId={vendorId}`
- **Headers**: Standard Auth Headers với `ol-vendor-id` và `ol-client-id`.
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  Trả về mảng gồm đúng **31 đối tượng bài học**, mỗi đối tượng chứa cấu trúc:
  ```json
  {
    "_id": "6adadbcaf75fe5000247ca71",
    "title": "HSK1_Bài 1",
    "course": "6adadba969897b0002482ca5",
    "section": "6adadbaf69897b0002482cb5",
    "index": 0,
    "type": "video",
    "resources": [
      {
        "_id": "6adadc45f8c3c60002a2b3c1",
        "title": "HSK1_Bài 1.mov",
        "type": "video",
        "provider": "VSTORAGE",
        "link": "3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8"
      }
    ]
  }
  ```

### 4.3. Quy Tắc Sinh Link HLS Video Streaming & Poster

Khi tài nguyên video có provider `VSTORAGE`:
1. **Link phát luồng HLS m3u8**:
   ```
   https://media.izteach.vn/{vendorId}/{videoId}/playlist.m3u8
   ```
   *Ví dụ*: `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8`
2. **Link ảnh bìa / Thumbnail Video (Poster)**:
   ```
   https://media.izteach.vn/{vendorId}/{videoId}/thumbnail.jpg
   ```
   *Ví dụ*: `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/thumbnail.jpg`

### 4.4. Bảng Ánh Xạ Toàn Diện 31 Unit Vào 15 Bài Học Tiêu Chuẩn

| Buổi / Bài | Tên Bài Học Tiêu Chuẩn | Unit ID Backend (`unitId`) | Video Resource ID (`videoId`) | HLS Stream URL (`media.izteach.vn`) |
| :---: | :--- | :--- | :--- | :--- |
| **Bài 1** | Bài 1: AI小语，你好！ (Xin chào AI Tiểu Ngữ!) | `6adadbcaf75fe5000247ca71` | `6adadc45f8c3c60002a2b3c1` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadc45f8c3c60002a2b3c1/playlist.m3u8` |
| **Bài 2** | Bài 2: 我叫李文 (Mình tên là Lý Văn) | `6adadc3b69897b0002482d22` | `6adadd60f8c3c60002a2b3c2` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adadd60f8c3c60002a2b3c2/playlist.m3u8` |
| **Bài 3.1** | Bài 3.1: 我是中国人 (Từ mới & Cấu trúc Quốc tịch) | `6adae08769897b000248340a` | `6adf16b358da95000267ef60` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf16b358da95000267ef60/playlist.m3u8` |
| **Bài 3.2** | Bài 3.2: 我是中国人 (Hội thoại & Luyện nghe) | `6adf1a4fe2681300028de082` | `6adf188558da95000267ef62` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf188558da95000267ef62/playlist.m3u8` |
| **Bài 4.1** | Bài 4.1: 这是我的一家 (Gia đình & Đại từ sở hữu) | `6adf1b51e2681300028de363` | `6adf1a87edf12a00022cde3c` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1a87edf12a00022cde3c/playlist.m3u8` |
| **Bài 4.2** | Bài 4.2: 这是我的一家 (Số lượng & Lượng từ 个) | `6adf1c22e2681300028de711` | `6adf1b8aedf12a00022cde3f` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1b8aedf12a00022cde3f/playlist.m3u8` |
| **Bài 4.3** | Bài 4.3: 这是我的一家 (Luyện phát âm & Ngữ điệu) | `6adf1d00e2681300028de9a6` | `6adf1c5cedf12a00022cde43` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1c5cedf12a00022cde43/playlist.m3u8` |
| **Bài 4.4** | Bài 4.4: 这是我的一家 (Ôn tập tổng kết & Thực hành)| `6adf1e12e5b2290002718830` | `6adf1d4258da95000267ef72` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1d4258da95000267ef72/playlist.m3u8` |
| **Bài 5.1** | Bài 5.1: 今天我休息 (Thứ & Ngày trong tuần) | `6adf1fade5b2290002718df9` | `6adf1e7cedf12a00022cde53` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf1e7cedf12a00022cde53/playlist.m3u8` |
| **Bài 5.2** | Bài 5.2: 今天我休息 (Hoạt động & Nghỉ ngơi) | `6adf2171e5b22900027194df` | `6adf2015ff3e240002282e5e` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf2015ff3e240002282e5e/playlist.m3u8` |
| **Bài 6.1** | Bài 6.1: 你的手机号是多少？ (Số đếm & Số điện thoại)| `6adf22e9e5b22900027199e7` | `6adf21dbff3e240002282e6c` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf21dbff3e240002282e6c/playlist.m3u8` |
| **Bài 6.2** | Bài 6.2: 你的手机号是多少？ (Hỏi thông tin liên lạc)| `6adf3932e8e0af00026814ef` | `6adf384637e34400025dfc49` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf384637e34400025dfc49/playlist.m3u8` |
| **Bài 7.1** | Bài 7.1: 我晚上六点半下班 (Giờ giấc & Mốc thời gian)| `6adf3578b3cfe60002ab5a55` | `6adf34321d93990002196230` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf34321d93990002196230/playlist.m3u8` |
| **Bài 7.2** | Bài 7.2: 我晚上六点半下班 (Lịch trình sinh hoạt) | `6adf3633b3cfe60002ab5cf4` | `6adf359b1d9399000219623e` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf359b1d9399000219623e/playlist.m3u8` |
| **Bài 8.1** | Bài 8.1: 我爸爸也在医院工作 (Nghề nghiệp & Nơi làm)| `6adf3707b3cfe60002ab5fd6` | `6adf366037e34400025dfc39` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf366037e34400025dfc39/playlist.m3u8` |
| **Bài 8.2** | Bài 8.2: 我爸爸也在医院工作 (Phó từ 也 & Giới thiệu) | `6adf37f61d600a0002d466ae` | `6adf374337e34400025dfc3f` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6adf374337e34400025dfc3f/playlist.m3u8` |
| **Bài 9.1** | Bài 9.1: 我明天上午在学校学习 (Buổi & Địa điểm học) | `6ae52ef17b101100026bb5d7` | `6ae52a57a6947f0002b2407a` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52a57a6947f0002b2407a/playlist.m3u8` |
| **Bài 9.2** | Bài 9.2: 我明天上午在学校学习 (Trật tự câu thời gian)| `6ae532927b101100026bb9f3` | `6ae52f6af9f5190002993c47` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae52f6af9f5190002993c47/playlist.m3u8` |
| **Bài 10.1** | Bài 10.1: 这儿的苹果真便宜！ (Mua sắm hoa quả & 真) | `6ae546eaa1908400020410e3` | `6ae53844f133e40002a7083d` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae53844f133e40002a7083d/playlist.m3u8` |
| **Bài 10.2** | Bài 10.2: 这儿的苹果真便宜！ (Hỏi giá & Mua bán) | `6ae547d1a1908400020412fd` | `6ae54742f133e40002a70842` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54742f133e40002a70842/playlist.m3u8` |
| **Bài 11.1** | Bài 11.1: 我读大学呢 (Học vấn & Hành động tiếp diễn)| `6ae54a51fab31400021bee3b` | `6ae54811f133e40002a70843` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54811f133e40002a70843/playlist.m3u8` |
| **Bài 11.2** | Bài 11.2: 我读大学呢 (Hội thoại hỏi thăm việc học) | `6ae54abdfab31400021befb0` | `6ae54a7d238c0700028dced8` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54a7d238c0700028dced8/playlist.m3u8` |
| **Bài 12.1** | Bài 12.1: 昨天下了雪了 (Hiện tượng thời tiết & Mùa) | `6ae54f37a1908400020426c9` | `6ae54af4a8aec300024f0915` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54af4a8aec300024f0915/playlist.m3u8` |
| **Bài 12.2** | Bài 12.2: 昨天下了雪了 (Trợ từ ngữ khí & Biến đổi 了)| `6ae54fe0a1908400020428a5` | `6ae54f7b4b62f10002342205` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54f7b4b62f10002342205/playlist.m3u8` |
| **Bài 12.3** | Bài 12.3: 昨天下了雪了 (Tổng hợp đàm thoại thời tiết)| `6ae5504aa1908400020429c9` | `6ae54ffc4b62f1000234220b` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae54ffc4b62f1000234220b/playlist.m3u8` |
| **Bài 13.1** | Bài 13.1: 请给我一杯茶 (Đồ uống & Lượng từ 杯, 瓶)| `6ae550b3a190840002042a62` | `6ae55062a8aec300024f0936` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55062a8aec300024f0936/playlist.m3u8` |
| **Bài 13.2** | Bài 13.2: 请给我一杯茶 (Câu cầu khiến & Quán nước) | `6ae550fefab31400021bff7a` | `6ae550d34b62f10002342211` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae550d34b62f10002342211/playlist.m3u8` |
| **Bài 14.1** | Bài 14.1: 我看了一个电影 (Giải trí & Động thái 了)| `6ae558d7fab31400021c1676` | `6ae55149a8aec300024f0945` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae55149a8aec300024f0945/playlist.m3u8` |
| **Bài 14.2** | Bài 14.2: 我看了一个电影 (Kể lại trải nghiệm đã qua) | `6ae56b19b734640002ce823d` | `6ae56486e8c772000259fd59` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56486e8c772000259fd59/playlist.m3u8` |
| **Bài 15.1** | Bài 15.1: 大兴机场见！ (Phương tiện & Hẹn gặp) | `6ae56d92b734640002ce863a` | `6ae56bb4e8c772000259fd66` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56bb4e8c772000259fd66/playlist.m3u8` |
| **Bài 15.2** | Bài 15.2: 大兴机场见！ (Tạm biệt & Ôn tập New HSK 1)| `6ae56f7f9902f90002d5ebdc` | `6ae56ddde8c772000259fd6d` | `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/6ae56ddde8c772000259fd6d/playlist.m3u8` |

---

## PHẦN 5: MỤC 0 THƯ VIỆN TÀI LIỆU ĐÍNH KÈM TRÊN CLOUDFRONT CDN

### 5.1. 5 Cuốn Giáo Trình PDF Bản Quyền

Tất cả 5 file PDF giáo trình đều được lưu trữ trực tiếp trên AWS S3 và phân phối qua CloudFront CDN toàn cầu hỗ trợ HTTP Range Requests (`Accept-Ranges: bytes`):

| STT | Tên Sách Hiển Thị Trên Cổng Học Viên | Tên Tệp Lưu Trữ | Số Trang | Dung Lượng | CloudFront CDN URL Hoàn Chỉnh |
| :---: | :--- | :--- | :---: | :---: | :--- |
| **1** | **Sách Giáo Khoa New HSK 1 (3.0)** | `HSK1_SGK.pdf` | 148 | 60.27 MB | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SGK.pdf` |
| **2** | **Sách Bài Tập New HSK 1 (3.0)** | `HSK1_SBT.pdf` | 150 | 46.78 MB | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_SBT.pdf` |
| **3** | **Vở Luyện Viết HSK 1 (3.0)** | `HSK1_Vo_luyen_viet.pdf` | 137 | 2.22 MB | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/HSK1_Vo_luyen_viet.pdf` |
| **4** | **214 Bộ Thủ Tiếng Trung Thường Dùng** | `Bo_thu_tieng_trung.pdf` | 68 | 49.90 MB | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Bo_thu_tieng_trung.pdf` |
| **5** | **Từ Vựng New HSK 1 - HSK 5 (3.0)** | `Tu_vung_New_HSK1_HSK5.pdf` | 312 | 12.62 MB | `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/docs/Tu_vung_New_HSK1_HSK5.pdf` |

### 5.2. 127 Tệp Audio MP3 Bài Khóa & Bài Tập

1. **93 Tệp Audio Sách Giáo Khoa (SGK)**:
   - Đường dẫn gốc: `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sgk/{xx}-{y}.mp3`
   - Bài 1, 2, 3: Mỗi bài 7 files (`01-1.mp3` -> `01-7.mp3`).
   - Bài 4 đến 15 (12 bài): Mỗi bài 6 files (`{xx}-1.mp3` -> `{xx}-6.mp3`).
   - Tổng cộng: $7 \times 3 + 12 \times 6 = 21 + 72 = 93$ tệp.
2. **34 Tệp Audio Sách Bài Tập (SBT)**:
   - Đường dẫn gốc: `https://d21acfi38wn3iy.cloudfront.net/resource/documents/3529cd2b-7af6-4fda-887c-392a79393d6a/hsk1-3.0/audio/sbt/...`
   - 33 tệp nghe chia theo từng thư mục `第01课/` đến `第15课/` (luyện phát âm, bài tập trắc nghiệm, bài nghe).
   - 1 tệp đề thi mô phỏng: `模拟测试——HSK(一级）模拟试卷 听力.mp3` (Đề thi thử toàn diện cuối cấp độ).
   - Tổng cộng: $33 + 1 = 34$ tệp.
3. **Tổng cộng tài nguyên âm thanh số hóa**: $93 + 34 = 127$ tệp audio MP3.

---

## PHẦN 6: ĐỒNG BỘ TIẾN ĐỘ HỌC TẬP

### 6.1. Kiến Trúc Đồng Bộ Hai Tầng (Course Level vs Unit Level)

Hệ thống izTeach quản lý tiến độ học tập qua 2 tầng độc lập:
1. **Tầng Tổng Quan Khóa Học (Course-Level Aggregate)**:
   - Lưu trữ trong trường `onlineCourses[i].progress` trả về từ `GET /user-permission`.
   - Chứa tỷ lệ hoàn thành (`percentage`), số unit đã hoàn thành trên tổng số unit.
2. **Tầng Trạng Thái Bài Học (Unit-Level Completion State)**:
   - Được gắn kết trực tiếp với lịch sử nộp bài tập của học viên qua API backend `GET /homework`.
   - Mỗi khi học viên nộp bài thành công cho một unit (`POST /homework` với `unit: unitId`), một bản ghi tồn tại vĩnh viễn trong MongoDB của izTeach.
   - Khi Cổng học viên tải trang (kể cả sau khi đăng xuất / đăng nhập lại trên thiết bị khác), Cổng gọi API truy vấn lịch sử `GET /homework` để phục hồi trạng thái:
     - Nếu có bài nộp: Hiển thị bài học ở trạng thái **XANH LÁ (`.state-completed`)** và gắn nhãn `✓ Đã học & nộp bài`.
     - Nếu giáo viên đã chấm: Hiển thị điểm số (`mark: 10/10`) và lời nhận xét sư phạm (`notes`).
     - Nếu chưa có bài nộp: Giữ màu **TRẮNG MẶC ĐỊNH (`.state-unsubmitted`)**.

### 6.2. Phân Tích Routing & Thăm Dò Kỹ Thuật `PUT /unit/progress`

Qua khảo sát thực nghiệm trên AWS API Gateway:
- Tuyến đường `PUT /prod/unit/{id}` trên Gateway `p9y4zl6vkd` được gắn trực tiếp vào model Mongoose của Unit.
- Khi gửi request `PUT /unit/progress/{id}`, Mongoose cố parse chuỗi `"progress"` thành ObjectId và báo lỗi cú pháp.
- **Giải pháp chuẩn hóa bền vững (Best Practice)**: Cơ chế nộp bài tập qua `POST /homework` là nguồn chân lý duy nhất (Single Source of Truth) được lưu trữ bền vững trên backend izTeach, độc lập hoàn toàn với `localStorage`.

---

## PHẦN 7: QUY TRÌNH NỘP BÀI TẬP, CHẤM ĐIỂM & ĐỒNG BỘ ĐA CHIỀU (S3 + IZTEACH + SỔ LIÊN LẠC)

### 7.1. Sơ Đồ 6 Bước Kỹ Thuật Nộp Bài Tập & Đồng Bộ Live Toàn Hệ Thống

```
[Học viên đính kèm Ảnh vở viết / Thu âm giọng đọc (MediaRecorder / WAV) + Làm SBT tương tác]
             │
             ▼
[Bước 0: IzTeachPortalClient.getServiceToken()]
  └─▶ Lấy/làm mới Vendor Service Token từ POST gcnj5paf1j.../prod/signin
      (Tránh tuyệt đối lỗi HTTP 403 Forbidden khi dùng Student Token trên xx7swzlhyl)
             │
             ▼
[Bước 1: GET xx7swzlhyl.../prod/resource/signed-url] ──▶ AWS cấp Presigned S3 PUT URL (HTTP 200)
             │
             ▼
[Bước 2: PUT <signedUrl>] ─────────────────────────────▶ Đẩy trực tiếp Binary File lên AWS S3 Bucket (HTTP 200)
                                                         (Phân phối tức thì qua CloudFront d21acfi38wn3iy.cloudfront.net)
             │
             ▼
[Bước 3: POST xx7swzlhyl.../prod/resource] ────────────▶ Đăng ký Metadata tệp vào MongoDB izTeach (trả về resource._id)
             │
             ▼
[Bước 4: POST rt6i5wgkj4.../prod/homework] ────────────▶ Tạo bản ghi bài tập trên izTeach gắn đúng:
                                                         { course, unit, userId, name, email, state: "submitted", resources }
             │
             ▼
[Bước 5: Đồng bộ tức thì sang Sổ Liên Lạc Giáo Viên / Quản Lý & Cloud State (ktn-sll-state)]
  ├─▶ Cập nhật IzTeachStore.homeworkMap[unitId] -> Đổi bài học sang XANH LÁ & hiển thị Preview tệp CloudFront
  ├─▶ Đẩy bản ghi vào window.app.state.homeworks (status: 'PENDING') + PUT vendor-setting (ktn-sll-state)
  └─▶ Khi Giáo viên chấm điểm: POST rt6i5wgkj4.../prod/homework (state: "approved", mark: 9.5) + DELETE bản cũ
```

> ⚠️ **QUY TẮC BẮT BUỘC CHỐNG LỖI `HTTP 403 FORBIDDEN` TRÊN GATEWAY `xx7swzlhyl`**:
> 1. Custom Authorizer của AWS API Gateway `xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod` (`/resource/signed-url` và `/resource`) **chỉ cấp quyền cho Vendor Service Token (`roles: ["admin", "root"]`)**. Nếu truyền `accessToken` của học viên (`roles: ["student"]`) hoặc token cũ hết hạn trong `localStorage`, API Gateway sẽ trả về **`HTTP 403 Forbidden`** (`Không thể tạo S3 Presigned URL (HTTP 403)`).
> 2. Do đó, `IzTeachPortalClient.fetchWithServiceToken(url, options)` luôn lấy `serviceToken` từ `POST https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin` (tự động refresh và retry nếu gặp `401`/`403`).
> 3. **Tuyệt đối không gửi custom header `ol-vendor-id` / `ol-client-id` trong request браузер (`fetch`) tới `xx7swzlhyl` và `rt6i5wgkj4`**, chỉ truyền `Authorization: <rawServiceToken>` và `Content-Type: application/json` để vượt qua kiểm tra CORS Preflight của trình duyệt.

### 7.2. Bước 1: Xin S3 Presigned URL (`GET /resource/signed-url`)

- **Endpoint**: `GET https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url`
- **Query Parameters**:
  - `key`: Đường dẫn lưu tệp trên S3.  
    *Quy tắc chuẩn izTeach*: `resource/homeworks/{vendorId}/{timestamp}-{cleanFilename}`  
    *Ví dụ*: `resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-vo_viet_chu_han.png`
  - `contentType`: MIME type của tệp (`image/png`, `image/jpeg`, `audio/wav`, `audio/webm`, `video/mp4`, v.v.).
- **Headers (Browser CORS-Safe)**:
  ```http
  Authorization: <vendorServiceToken>
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  Trả về chuỗi URL presigned của S3 có thời hạn:
  ```json
  "https://online-learning-izteach-6-aws-source-bucket.s3.ap-southeast-1.amazonaws.com/resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-vo_viet_chu_han.png?AWSAccessKeyId=...&Signature=...&Expires=..."
  ```

### 7.3. Bước 2: Tải Tệp Nhị Phân Trực Tiếp Lên S3 (`PUT <signedUrl>`)

- **Endpoint**: URL nhận được từ Bước 1.
- **Method**: `PUT`
- **Headers**: `Content-Type: <mimeType>`
- **Body**: Dữ liệu nhị phân thô (`File`, `Blob`, `Buffer`) từ `<input type="file">` hoặc bộ thu âm giọng nói (`MediaRecorder` / `WAV Synthesizer`).
- **Phản Hồi**: `HTTP 200 OK` (hoặc `204 No Content`). Ngay sau khi `PUT` thành công, tệp có thể truy cập công khai tức thì qua CloudFront CDN tại:
  `https://d21acfi38wn3iy.cloudfront.net/resource/homeworks/{vendorId}/{timestamp}-{cleanFilename}`

### 7.4. Bước 3: Đăng Ký Tài Nguyên Vào Hệ Thống (`POST /resource`)

- **Endpoint**: `POST https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: <vendorServiceToken>
  ```
- **Request Body (JSON)**:
  ```json
  {
    "title": "Screenshot 2023-03-27 180933.png",
    "size": 34816,
    "dataType": "resource",
    "link": "resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-Screenshot_2023-03-27_180933.png",
    "provider": "S3",
    "type": "homework",
    "subType": "file",
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
    "origin": {
      "link": "resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-Screenshot_2023-03-27_180933.png",
      "size": 34816,
      "type": "homework",
      "mimeType": "image/png",
      "bucket": "https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com"
    }
  }
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  Trả về đối tượng tài nguyên đã lưu trong MongoDB izTeach, bao gồm `_id` (ví dụ `"6ae7136a2d8ae00002c94646"`). Hỗ trợ lặp qua mảng tệp để đính kèm đồng thời cả **Ảnh chụp vở viết** lẫn **File ghi âm phát âm** trong cùng 1 lần nộp bài.

### 7.5. Bước 4: Tạo Bản Ghi Nộp Bài Tập Có Định Danh Học Viên (`POST /homework`)

- **Endpoint**: `POST https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework`
- **Headers**:
  ```http
  Content-Type: application/json
  Authorization: <vendorServiceToken>
  ```
- **Request Body (JSON)**:
  > **Lưu ý quan trọng**: Phải truyền đầy đủ `course` (`activeCourseId` của khóa học đang mở, ví dụ `65e7704a9ea90c00080d5195` cho *Chinese For Kids* hoặc `6adadba969897b0002482ca5` cho *New HSK 1 3.0*), `unit` (`unitId` thật của bài học đó trên izTeach), và bộ 3 định danh học viên (`userId`, `name`, `email`) để dữ liệu đổ về izTeach phân biệt chính xác từng học viên.
  ```json
  {
    "title": "Bài tập Chinese For Kids - Bài 2: 我叫李文",
    "notes": "Con đã hoàn thành bài tập nghe và viết chữ Hán. [Kết quả SBT tương tác: Nghe Đ/S C1: Đúng · Trắc nghiệm C1: B]",
    "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
    "course": "65e7704a9ea90c00080d5195",
    "unit": "663e2cb3ef5f220008fee283",
    "userId": "bc21991c-ce9b-465d-b85f-dbb1821e51a9",
    "name": "Tạ Phong Võ",
    "email": "taphong2002@gmail.com",
    "state": "submitted",
    "type": "multiple-files",
    "resources": [
      {
        "_id": "6ae7136a2d8ae00002c94646",
        "title": "Screenshot 2023-03-27 180933.png",
        "size": 34816,
        "dataType": "resource",
        "link": "resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-Screenshot_2023-03-27_180933.png",
        "provider": "S3",
        "type": "homework",
        "subType": "file",
        "vendorId": "3529cd2b-7af6-4fda-887c-392a79393d6a",
        "origin": {
          "link": "resource/homeworks/3529cd2b-7af6-4fda-887c-392a79393d6a/1793502442244-Screenshot_2023-03-27_180933.png",
          "size": 34816,
          "type": "homework",
          "mimeType": "image/png",
          "bucket": "https://online-learning-izteach-6-aws-source-bucket.s3-ap-southeast-1.amazonaws.com"
        }
      }
    ]
  }
  ```
- **Phản Hồi Thành Công (HTTP 200 OK)**:
  ```json
  {
    "_id": "6ae7148d4a8e7d00027fcb75",
    "title": "Bài tập Chinese For Kids - Bài 2: 我叫李文",
    "course": "65e7704a9ea90c00080d5195",
    "unit": "663e2cb3ef5f220008fee283",
    "userId": "bc21991c-ce9b-465d-b85f-dbb1821e51a9",
    "name": "Tạ Phong Võ",
    "email": "taphong2002@gmail.com",
    "state": "submitted",
    "type": "multiple-files",
    "resources": [...],
    "createdAt": "2026-11-01T10:29:33.518Z"
  }
  ```

### 7.6. Bước 5: Đồng Bộ Chấm Điểm Từ Giáo Viên Về izTeach & Cổng Học Viên

- **Cơ chế lưu điểm và lời phê trên izTeach (`window.IZTEACH_STORAGE.markHomeworkRecord`)**:
  - Do route `PUT /homework/mark/:id` bị giới hạn quyền (`403 token not allowed`), khi Giáo viên chấm điểm trên Cổng Giáo Viên (`app.submitTeacherGrade`), hệ thống đồng bộ điểm số (`mark`) và lời phê (`notes`) về thẳng MongoDB của izTeach thông qua:
    1. `POST https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework` với `state: "approved"`, `mark: <score>`, `notes: "<studentNote>\n[Nhận xét Giáo viên]: <teacherFeedback>"`, giữ nguyên `course`, `unit`, `userId`, `name`, `email`, và `resources`.
    2. `DELETE https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework/{oldSubmittedId}` để dọn bản ghi chờ chấm cũ, đảm bảo mỗi buổi học chỉ giữ bản ghi mới nhất đã duyệt (`state: "approved"`).
    3. Đồng thời cập nhật `window.app.state.homeworks` (`status: 'GRADED'`, `score`, `teacherFeedback`) và đẩy lên Cloud State (`PUT https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/3529cd2b-7af6-4fda-887c-392a79393d6a`).

### 7.7. Bước 6: Truy Vấn Lịch Sử & Đối Soát Theo Từng Học Viên (`GET /homework`)

- **Endpoint**: `GET https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework?vendorId={vendorId}&course={courseId}`
- **Headers**: `Authorization: <vendorServiceToken>`
- **Quy Tắc Lọc & Ưu Tiên Bản Ghi Mới Nhất (`IzTeachPortalClient.getHomeworkHistory`)**:
  - API trả về danh sách bài nộp của khóa học theo thứ tự **mới nhất ở đầu mảng (`index 0`)**.
  - Client lọc các bản ghi khớp với `email` hoặc `userId` của học viên đang đăng nhập (tránh hiện nhầm tiến độ của học viên khác), và ưu tiên bản ghi mới nhất hoặc bản ghi đã có điểm (`state === "approved"` / `mark != null`).
  - Hàm `getLessonHomework(lesson)` hợp nhất dữ liệu từ cả `IzTeachStore.homeworkMap[unitId]` và `window.app.state.homeworks`, hiển thị khung **Preview tệp CloudFront đã nộp (`#submitted-resources-preview`)** kèm trạng thái `✓ Đã nộp bài (Đang chờ cô chấm)` hoặc `✓ Đã chấm: X / 10 điểm`.

### 7.8. Hệ Thống Chấm Bài Theo Khóa Học Online Dành Cho Học Viên Tự Do (`course-grade`)

- **Bối cảnh nghiệp vụ**: Học viên mua khóa học trực tuyến trên website (`HSK1 3.0`, `Chinese For Kids`, `Tiếng Trung Tổng Hợp`) thường là **học viên tự học (`Học viên tự do · Không thuộc lớp`, `classCode: ''`)**, không nằm trong các lớp Zoom/Offline cố định (`YCT2-04`, `YCT3-02`, ...).
- **Cơ chế đồng bộ và chấm bài theo Khóa học (`so-lien-lac-lms.js`)**:
  1. **API truy vấn toàn bộ bài nộp Khóa học Online**:
     - `app.lmsFetchCourseHomeworks(force)` gọi trực tiếp:
       `GET https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework/filter?vendorId=3529cd2b-7af6-4fda-887c-392a79393d6a&_limit=500&_sort=createdAt:DESC`
     - Tự động ánh xạ từng bản ghi theo `courseId` (`6adadba969897b0002482ca5` — *HSK1 3.0*, `65e7704a9ea90c00080d5195` — *Chinese For Kids*, `65e733b0e3317300084c5ce4` — *Tiếng Trung Tổng Hợp*), `unitId`, `lessonNum`, và thông tin học viên (`studentName`, `studentEmail`, `userId`) mà **không yêu cầu học viên phải thuộc bất kỳ lớp học nào**.
  2. **Phân hệ giao diện `Chấm bài Khóa học` (`pageCourseGrade`)**:
     - Hiển thị trên thanh điều hướng của cả **Giáo viên (`teacher`)** và **Quản lý trung tâm (`admin`)** kèm thanh chuyển đổi nhanh (`🎓 Chấm bài theo Khóa học Online (Học viên tự do)` ↔ `🏫 Chấm bài theo Lớp học cố định`).
     - Hỗ trợ lọc theo từng khóa học (`Tất cả khóa học (3)`, `📘 HSK1 3.0`, `🧒 Chinese For Kids`, `📗 Tiếng Trung Tổng Hợp`), theo từng bài giảng (`Bài 1` → `Bài 15`), và theo trạng thái (`Chờ chấm`, `Đã chấm`, `Tất cả`).
     - Ngăn kéo chấm bài (`lmsOpenGrade` / `lmsSaveGrade`) bóc tách riêng **Kết quả Sách Bài Tập Tương Tác (`🎯 Kết quả Sách Bài Tập Tương Tác`)**, **Ảnh vở viết chữ Hán trên S3/CloudFront**, và **Trình phát âm thanh `<audio controls>` trực tiếp cho file thu âm phát âm**, đồng bộ điểm số `mark` + lời phê `state: 'approved'` về thẳng izTeach Backend.

---

## PHẦN 8: BẢNG MÃ LỖI & XỬ LÝ NGOẠI LỆ

| HTTP Code | Endpoint Liên Quan | Tình Huống Gốc Phát Sinh | Nội Dung Phản Hồi Từ AWS izTeach | Hành Vi Xử Lý Chuẩn Của Client |
| :---: | :--- | :--- | :--- | :--- |
| **200 OK** | Tất cả các endpoint | Yêu cầu hợp lệ, xác thực thành công | JSON payload kết quả | Parse dữ liệu và cập nhật State giao diện |
| **401 Unauthorized** | `/user-permission`, `/unit`, `/homework` | Thiếu token, token hết hạn (sau 30 ngày), hoặc **truyền thừa tiền tố `Bearer `** | `{"message": "Unauthorized"}` | Hiển thị thông báo phiên hết hạn, xóa session và mở Modal Đăng Nhập |
| **403 Forbidden** | `GET /unit` | Học viên chưa mua khóa học (`taphong2002vip@gmail.com`) gọi lấy nội dung | `{"code": 403, "reason": "UNIT_NOT_ENTITLED", "errorMessage": "Bạn chưa có quyền truy cập..."}` | Chặn truy cập nội dung bài học, hiển thị màn hình Empty State tư vấn khóa học |
| **403 Forbidden** | `/user-permission/user/:id` | Gọi nhầm route nội bộ IAM của izTeach | `{"message": "User is not authorized to access this resource"}` | Bắt lỗi cấu hình, chuyển sang dùng query params `?userId=...` |
| **500 Internal Error** | `/student/signin`, `/signin` | Sai mật khẩu hoặc tài khoản chưa đăng ký trong CRM | `{"code": 500, "data": "Thông tin tài khoản không đúng"}` | Báo lỗi đỏ trên form: "Email hoặc mật khẩu không chính xác" |
| **500 Internal Error** | `/course/layout/:id` | Gọi endpoint layout nhưng **thiếu query `?vendorId=...`** | `{"message": "Cannot destructure property 'vendorId' of 'event.queryStringParameters' as it is null."}` | Luôn gắn `?vendorId=3529cd2b-7af6-4fda-887c-392a79393d6a` vào URL |
| **Network Error** | Bất kỳ endpoint nào | Mất kết nối internet hoặc timeout | `TypeError: Failed to fetch` | Hiển thị Toast thông báo mất mạng và kích hoạt Retry |

---

## TỔNG KẾT BẢN ĐỒ TRIỂN KHAI CHO CỔNG HỌC VIÊN (MILESTONE 2)

```javascript
/**
 * Mô hình IzTeachPortalClient chuẩn hóa sẵn sàng tích hợp vào portal_template.html
 */
const IzTeachConfig = {
  vendorId: '3529cd2b-7af6-4fda-887c-392a79393d6a',
  clientId: 'fa3421bc-ba67-4fa7-b935-b2a8fb6ce1a9',
  courseId: '6adadba969897b0002482ca5',
  endpoints: {
    studentSignin: 'https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin',
    adminSignin: 'https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin',
    permission: 'https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission',
    layout: 'https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/course/layout',
    unit: 'https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/unit',
    signedUrl: 'https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url',
    resource: 'https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource',
    homeworkSubmit: 'https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework',
    homeworkQuery: 'https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework'
  },
  cdn: {
    media: 'https://media.izteach.vn',
    docs: 'https://d21acfi38wn3iy.cloudfront.net'
  }
};
```
