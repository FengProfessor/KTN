# BÁO CÁO KIỂM TOÁN MỨC ĐỘ SẴN SÀNG THÀNH WEB APP ĐỘC LẬP
## DỰ ÁN HỆ THỐNG QUẢN LÝ ĐÀO TẠO & HỌC TRỰC TUYẾN HỌC VIỆN KHỔNG TỬ NHÍ
### (WEB APP READINESS AUDIT REPORT)

> **Mã tài liệu:** `KTN-AUDIT-2026-M1`  
> **Phiên bản:** `1.0.0-RELEASE`  
> **Ngày phát hành:** 02/11/2026  
> **Đơn vị thực hiện:** Nhóm Kiểm toán Kỹ thuật Độc lập (Teamwork Architecture Audit)  
> **Thư mục mã nguồn:** `d:\Vibe\khongtunhi_sofl_style`  
> **Nền tảng kiểm toán:** `khongtunhi.com` / `khongtunhi.izteach.com` (izTeach AWS Serverless SaaS)  
> **Mục tiêu:** Đánh giá toàn diện hiện trạng mã nguồn từ luồng đăng ký đến tính năng sau đăng nhập, phân tích chuyên sâu 5 khía cạnh kiến trúc kỹ thuật và thiết lập lộ trình chuyển đổi thành Web App độc lập chuẩn Production.

---

## MỤC LỤC
1. [TỔNG QUAN ĐIỀU HÀNH & BẢNG ĐIỂM SẴN SÀNG (EXECUTIVE SUMMARY & SCORECARD)](#1-tổng-quan-điều-hành--bảng-điểm-sẵn-sàng-executive-summary--scorecard)
2. [KHẢO SÁT & ĐÁNH GIÁ HIỆN TRẠNG THEO TOÀN BỘ LUỒNG NGHIỆP VỤ (YÊU CẦU R1)](#2-khảo-sát--đánh-giá-hiện-trạng-theo-toàn-bộ-luồng-nghiệp-vụ-yêu-cầu-r1)
   - 2.1. Luồng đăng ký khóa học, tiếp nhận đơn hàng, thanh toán (VietQR) và cơ chế kích hoạt
   - 2.2. Luồng khởi tạo, cấp phát tài khoản (Cognito UUID, mật khẩu mặc định, bàn giao tài khoản thủ công)
   - 2.3. Cơ chế xác thực, đăng nhập và ma trận phân quyền 4 vai trò (RBAC)
   - 2.4. Cổng học viên trực tuyến (Student Learning Portal)
   - 2.5. Sổ liên lạc điện tử & Quản trị đào tạo (Contact Book & Operations)
   - 2.6. Luồng nộp bài và chấm bài tập (Homework Submission & Grading Pipeline)
   - 2.7. Hệ thống thông báo đa kênh (Notification Subsystem)
   - 2.8. Hệ thống trao đổi, tin nhắn lớp học & Tư vấn hỗ trợ (Messaging & Support)
   - 2.9. Tương tác lớp học (Classroom Engagement: Q&A, Comments, Reactions)
3. [ĐÁNH GIÁ CHUYÊN SÂU 5 KHÍA CẠNH KIẾN TRÚC KỸ THUẬT (YÊU CẦU R2)](#3-đánh-giá-chuyên-sâu-5-khía-cạnh-kiến-trúc-kỹ-thuật-yêu-cầu-r2)
   - 3.1. Tách biệt Frontend / Backend & Kiến trúc hệ thống
   - 3.2. Quản lý trạng thái & Cơ chế lưu trữ dữ liệu (State Management Anti-Patterns)
   - 3.3. Thiết kế & Tích hợp API izTeach (API Resilience & Integration)
   - 3.4. Bảo mật, Xác thực & Quyền riêng tư dữ liệu (Security, Auth & PII Protection)
   - 3.5. Hiệu năng, Khả năng mở rộng & Độ ổn định (Performance, Scalability & Stability)
4. [QUY ĐỊNH KIỂM THỬ VÀ ĐỐI SOÁT MÔI TRƯỜNG LIVE (YÊU CẦU R3)](#4-quy-định-kiểm-thử-và-đối-soát-môi-trường-live-yêu-cầu-r3)
   - 4.1. Nguyên tắc đối soát 100% trên môi trường Live
   - 4.2. Danh mục URL và Endpoint đối soát thực nghiệm
   - 4.3. Kết quả đối soát và tái hiện thực tế trên môi trường Live
5. [BẢNG MA TRẬN PHÂN LOẠI & CHI TIẾT CÁC PHÁT HIỆN KỸ THUẬT (YÊU CẦU R4)](#5-bảng-ma-trận-phân-loại--chi-tiết-các-phát-hiện-kỹ-thuật-yêu-cầu-r4)
   - 5.1. Bảng ma trận tổng hợp các phát hiện lỗi kỹ thuật (F1 - F20)
   - 5.2. Hồ sơ chi tiết từng phát hiện (SEC, BIZ, DATA, ARC, PERF, COMMS)
6. [LỘ TRÌNH KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ (ACTIONABLE ROADMAP)](#6-lộ-trình-khuyến-nghị-hành-động-cụ-thể-actionable-roadmap)
   - 6.1. Giai đoạn 1: Vá khẩn cấp bảo mật & Cô lập rò rỉ (Tuần 1 - Tuần 2)
   - 6.2. Giai đoạn 2: Xây dựng Backend For Frontend (BFF) & Cơ sở dữ liệu PostgreSQL (Tuần 3 - Tuần 6)
   - 6.3. Giai đoạn 3: Tích hợp cổng thanh toán tự động, WebSocket & Thông báo đa kênh (Tuần 7 - Tuần 10)
   - 6.4. Giai đoạn 4: Chuẩn hóa Frontend SPA, Bảo mật DRM CDN & Tối ưu hiệu năng (Tuần 11 - Tuần 14)
7. [PHỤ LỤC THAM CHIẾU & ĐỐI SOÁT MÃ NGUỒN CODEBASE](#7-phụ-lục-tham-chiếu--đối-soát-mã-nguồn-codebase)
   - 7.1. Danh mục 15 tệp mã nguồn được trích dẫn và kiểm chứng
   - 7.2. Danh mục 12 AWS API Gateway izTeach liên quan

---

## 1. TỔNG QUAN ĐIỀU HÀNH & BẢNG ĐIỂM SẴN SÀNG (EXECUTIVE SUMMARY & SCORECARD)

### 1.1. Bối cảnh dự án & Mục tiêu kiểm toán
Học viện Khổng Tử Nhí hiện đang vận hành hệ thống thông tin giáo dục và đào tạo tiếng Trung cho trẻ em tại địa chỉ tên miền `khongtunhi.com` (giao diện tiếp thị ngoài) và `khongtunhi.izteach.com` (hệ thống Sổ liên lạc điện tử và Cổng học viên trực tuyến). 

Toàn bộ hệ thống hiện tại **chưa phải là một Web App độc lập**, mà là một giải pháp lai nguyên khối (monolithic monkey-patching hybrid). Toàn bộ mã nguồn giao diện, phong cách hiển thị và logic vận hành học vụ được đóng gói dưới dạng các đoạn mã JavaScript thuần khổng lồ, sau đó chèn đè (inject) trực tiếp vào nền tảng SaaS izTeach (nền tảng chạy trên hạ tầng AWS Serverless gồm API Gateway, Lambda, DynamoDB, S3, CloudFront).

Mục tiêu của báo cáo kiểm toán này là thực hiện rà soát độc lập, trung thực và chuyên sâu toàn bộ codebase Khổng Tử Nhí; phân tích mọi điểm nghẽn, lỗ hổng bảo mật và giới hạn kiến trúc kỹ thuật từ khâu khách hàng đăng ký khóa học, thanh toán, cấp tài khoản cho đến toàn bộ các tính năng sau khi đăng nhập; từ đó thiết lập lộ trình kỹ thuật khả thi để nâng cấp toàn diện thành một Web App chuẩn công nghiệp (Production-Grade Modern Web App).

### 1.2. Thước đo mức độ sẵn sàng chuyển đổi Web App (Readiness Scorecard)
Dựa trên các tiêu chuẩn kiến trúc phần mềm quốc tế (12-Factor App, OWASP Top 10, RESTful API Design Standards, Reactive Architecture), hiện trạng mã nguồn được chấm điểm theo 5 trụ cột kiến trúc:

| Trụ Cột Kiến Trúc | Trọng Số | Điểm Hiện Tại (/100) | Đánh Giá Tình Trạng | Điểm Nghẽn Chính |
|---|:---:|:---:|:---:|---|
| **1. Tách biệt Frontend / Backend (BFF)** | 20% | **18 / 100** | 🔴 **Nguy kịch** | 0% Backend nội bộ; mã nguồn client nhúng cứng toàn bộ nghiệp vụ và token root admin; phụ thuộc hoàn toàn vào 12 AWS Gateway bên thứ ba. |
| **2. Quản lý trạng thái & Cơ sở dữ liệu** | 25% | **12 / 100** | 🔴 **Nguy kịch** | Không có RDBMS/NoSQL; lạm dụng trường SEO Description của izTeach làm Database; lỗi tranh chấp dữ liệu Last-Write-Wins; không có ACID. |
| **3. Thiết kế & Tích hợp API** | 20% | **25 / 100** | 🔴 **Nguy kịch** | Không có Circuit Breaker, Rate Limiting; polling 5s gây nghẽn CDN; nộp/chấm bài không có API PUT mà gọi POST sinh trùng bản ghi. |
| **4. Xác thực, Phân quyền & Bảo mật** | 20% | **10 / 100** | 🔴 **Nguy kịch** | Lộ mật khẩu Root Admin trên client; bypass toàn bộ auth bằng tham số `?ktn_user=admin`; dữ liệu PII học sinh và tài sản số bản quyền công khai. |
| **5. Hiệu năng & Khả năng mở rộng** | 15% | **28 / 100** | 🟠 **Kém** | Kích thước bundle khổng lồ (`so-lien-lac-ux.js` 12.387 dòng); render innerHTML gây layout thrashing; rò rỉ RAM khi phát video HLS. |
| **TỔNG ĐIỂM SẴN SÀNG (WEIGHTED)** | **100%** | **17.8 / 100** | 🔴 **KHÔNG ĐẠT** | **Hệ thống chưa đủ điều kiện vận hành an toàn như một Web App độc lập.** |

### 1.3. Tóm tắt 5 rủi ro kỹ thuật mang tính sống còn
1. **Lộ lọt thông tin Root Admin Vendor tối cao trên Client:** Mật khẩu và email tài khoản quản trị `hocvienkhongtunhi123@gmail.com:<IZTEACH_ADMIN_PASSWORD>` bị hardcode công khai ở 3 file client (`index.html:2727`, `portal_template.html:2132-2134`, `so-lien-lac-ux.js:11771-11773`). Bất kỳ ai mở F12 đều có thể lấy quyền can thiệp toàn bộ dữ liệu izTeach.
2. **Lỗ hổng Bypass Xác thực toàn diện qua URL:** Chỉ cần thêm `?ktn_user=admin` vào URL Sổ liên lạc (`so-lien-lac-auth.js:152, 199, 419`), hệ thống tự động cấp quyền Quản trị viên tối cao mà không yêu cầu mật khẩu hay phiên hợp lệ từ máy chủ.
3. **Thảm họa kiến trúc "Cloud State" trong trường SEO Description:** Toàn bộ cơ sở dữ liệu của trung tâm (học viên, giáo viên, bài tập, chat, vi phạm DLP, đơn hàng) bị nén thành một chuỗi JSON duy nhất nhét vào trường SEO description của API `vendor-setting` (`so-lien-lac-ux.js:12043-12076`). Không có locking, không có ETag, dẫn đến lỗi ghi đè xóa sạch dữ liệu của nhau (Last-Write-Wins).
4. **Hệ thống thông báo và trao đổi lớp học bị tê liệt trên môi trường Live:** Dispatcher thông báo bị stub trả về `false` (`so-lien-lac-ux.js:11754`); Service Worker bị hủy đăng ký cưỡng bức (`ktn_global_auth_hook.js:1`); WebSocket chỉ trỏ vào `127.0.0.1:4173`, chạy trên live trả về `404 Not Found` (`so-lien-lac-ux.js:7851-7855`).
5. **Rò rỉ nghiêm trọng Dữ liệu Cá nhân Trẻ em (PII) và Tài sản Bản quyền:** API `GET /homework` trả về toàn bộ bài tập của tất cả học sinh cho client lọc (`portal_template.html:2231-2254`); 5 bộ giáo trình PDF (~170MB), 127 MP3 và toàn bộ video HLS m3u8 mở công khai trên CDN CloudFront không hề có chữ ký số (Presigned URL) hay DRM.

---

## 2. KHẢO SÁT & ĐÁNH GIÁ HIỆN TRẠNG THEO TOÀN BỘ LUỒNG NGHIỆP VỤ (YÊU CẦU R1)

### 2.1. Luồng đăng ký khóa học, tiếp nhận đơn hàng, thanh toán (VietQR) và cơ chế kích hoạt

#### A. Tiếp nhận Form Lead ngoài Trang chủ
Khách hàng truy cập trang chủ `index.html` và điền thông tin đăng ký tại form tư vấn/học thử (dòng 640–706 và 2720–2888). 
- **Cơ chế sinh email giả lập:** Hệ thống không yêu cầu người dùng nhập email mà tự động ghép chuỗi trên client:
  ```javascript
  // index.html:664
  studentEmail: cleanPhone ? ('hv_' + cleanPhone + '@gmail.com') : ('hv_' + Date.now().toString().slice(-4) + '@gmail.com')
  ```
- **Mã đơn hàng tạo ngẫu nhiên:** Sinh mã client-side không có đảm bảo duy nhất từ server:
  ```javascript
  // index.html:662 & 2800
  orderId: 'ORD-' + Date.now().toString().slice(-6)
  ```

#### B. Phân phối Đơn hàng nội bộ (Order Bus)
Khi người dùng bấm xác nhận, client phân phối đơn hàng qua 4 kênh song song:
1. **LocalStorage:** Lưu vào các khóa `ktn_sll_orders_bus`, `ktn_sll_v1_state.orders`, `ktn_connect_clean_v10_noclasses.orders`.
2. **BroadcastChannel:** Gọi `new BroadcastChannel('ktn_sll_orders_bus')` (dòng 691–695). *Điểm nghẽn:* Cơ chế này chỉ hoạt động khi Admin mở tab Sổ liên lạc trên cùng một trình duyệt, cùng máy tính với khách hàng; hoàn toàn vô tác dụng giữa máy khách và máy quản trị viên.
3. **Google Sheets Webhook:** Gửi request `POST` chế độ `no-cors` đến `window.KTN_GOOGLE_SHEET_WEBHOOK` (dòng 698–705).
4. **API izTeach Contact:** Bắn thông tin lead về `POST https://c9xi8h3a3d.execute-api.ap-southeast-1.amazonaws.com/prod/contact` (dòng 2849–2863).

#### C. Hiện trạng Thanh toán VietQR (Fake Client Payment Status)
- Khách hàng được hiển thị mã VietQR tĩnh chuyển khoản đến tài khoản trung tâm.
- **Lỗ hổng nghiệp vụ đặc biệt nghiêm trọng:** Ngay khi khách hàng nhấn xác nhận form, client **tự động gán cứng trạng thái thanh toán là ĐÃ THANH TOÁN (`paymentStatus: 'paid'`)**:
  ```javascript
  // index.html:668-671
  amount: 890000,
  paymentMethod: 'VietQR',
  paymentStatus: 'paid', // TỰ ĐỘNG GÁN LÀ 'PAID' TRÊN TRÌNH DUYỆT
  approvalStatus: 'pending',
  ```
  Hệ thống hoàn toàn **không có Webhook đối soát biến động số dư ngân hàng** (không tích hợp PayOS, SePay, VietQR Open Banking, MoMo, VNPay). Bất kỳ ai mở form bấm submit đều tạo ra một đơn hàng "Đã thanh toán 890.000đ" trong sổ liên lạc quản trị.

---

### 2.2. Luồng khởi tạo, cấp phát tài khoản (Cognito UUID, mật khẩu mặc định, bàn giao tài khoản thủ công)

Quy trình kích hoạt đơn hàng diễn ra tại `so-lien-lac-ux.js` qua hàm `app.oneClickApproveOrder(orderId)` (dòng 5677–6030):

```
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐     ┌──────────────────────┐
│  Admin bấm      │────▶│ Mutex Lock RAM       │────▶│ 4 Tầng Tra cứu       │────▶│ Gọi API izTeach      │
│  "Duyệt 1 chạm" │     │ (Set _activeApprovals│     │ Tạo Cognito UUID     │     │ Cấp quyền khóa học   │
└─────────────────┘     └──────────────────────┘     └──────────────────────┘     └──────────────────────┘
                                                                                             │
                                ┌──────────────────────┐     ┌──────────────────────┐        │
                                │ Bàn giao qua Zalo    │◀────│ Bật Modal Copy       │◀───────┘
                                │ (Thủ công 100%)      │     │ Email/Pass "123456"  │
                                └──────────────────────┘     └──────────────────────┘
```

#### Bước 1: Mutex Lock trong RAM
- Dòng 5704–5714: Dùng `this._activeApprovals = new Set()` để khóa `orderId` trong RAM trình duyệt, ngăn admin bấm đúp chuột. Nếu tắt trình duyệt hoặc mở ở tab khác, khóa này biến mất.

#### Bước 2: 4 Tầng Tra cứu và Khởi tạo Tài khoản Học viên (Cognito UUID)
Do API phân quyền izTeach bắt buộc phải có chuỗi AWS Cognito UUID v4 (`isValidCognitoUuid(userId)`), frontend phải thực hiện chuỗi 4 bước thăm dò:
1. **Tầng 1 (Tra cứu CRM):** Gọi `GET https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student?vendorId=...&email=...` (dòng 5745–5764).
2. **Tầng 2 (Tạo mới CRM):** Nếu chưa có tài khoản, gọi `POST https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student` (dòng 5771–5808):
   - Mật khẩu mặc định khởi tạo hardcode: `btoa('123456')` (`"MTIzNDU2"`).
   - Trạng thái tài khoản: `status: 'verified'`.
   - Cơ chế tự phục hồi trùng số điện thoại: Tự sinh số điện thoại ngẫu nhiên `09` + 8 chữ số rồi retry.
3. **Tầng 3 (Retry CRM):** Thử lại nếu API báo lỗi race-condition trùng email (dòng 5811–5832).
4. **Tầng 4 (Sign-in Probe):** Gửi yêu cầu đăng nhập `POST /student/signin` bằng mật khẩu `123456` để bóc tách trường `id` (Cognito UUID) từ phản hồi máy chủ (dòng 5835–5862).

#### Bước 3: Cấp quyền Khóa học trên Backend izTeach
- Tra cứu khóa học hiện có: `GET https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission?vendorId=...&userId=...` (dòng 5884–5898).
- Cấp quyền sản phẩm:
  ```javascript
  // so-lien-lac-ux.js:5905-5918
  PUT https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/add-products/${userId}
  Headers: { 'Content-Type': 'application/json', Authorization: adminToken }
  Body: {
    vendorId: "3529cd2b-7af6-4fda-887c-392a79393d6a",
    userId: userId,
    productIds: ["6adadba969897b0002482ca5"], // New HSK 1 (3.0)
    productType: "online-course"
  }
  ```
- **Xử lý lỗi dị thường:** Backend izTeach sẽ trả về HTTP 500 nếu khóa học đã được cấp từ trước. Frontend dùng biểu thức chính quy `/is existed/i` để bỏ qua lỗi (dòng 5926–5931).

#### Bước 4: Bàn giao Tài khoản Thủ công (Hoàn toàn thiếu Email/SMS)
Sau khi duyệt xong, hệ thống **không hề có bất kỳ dịch vụ tự động gửi email hoặc SMS nào**. Hệ thống hiển thị modal `app.openOrderApprovedModal(order)` (`so-lien-lac-ux.js:6349–6399`) với nút **"📋 Sao chép thông tin tài khoản"** (`copyCredentialsToClipboard()` dòng 6404–6425). Quản trị viên phải nhấn copy chuỗi văn bản (Email, Mật khẩu `123456`, Đường link đăng nhập) rồi dán thủ công vào Zalo/SMS của phụ huynh.

---

### 2.3. Cơ chế xác thực, đăng nhập và ma trận phân quyền 4 vai trò (RBAC)

#### A. Kỹ thuật Monkey-Patching can thiệp XHR và Đăng nhập 2 Cổng
Hệ thống sử dụng script `ktn_global_auth_hook.js` can thiệp sâu vào đối tượng trình duyệt:
- **Can thiệp `XMLHttpRequest.prototype.send`:** Chặn toàn bộ request tới `/student/signin`.
- **Gửi request song song 2 cổng (Dual-Portal Sign-in Probe):** Bắn đồng thời vào:
  1. `POST https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin` (Học viên)
  2. `POST https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin` (Giáo viên / Quản lý)
- **Hoán đổi mật khẩu tự động (Password Swap Heuristic):** Nếu đăng nhập tài khoản quản trị bằng mật khẩu `123456` thất bại, client tự động thử lại với `<IZTEACH_ADMIN_PASSWORD>` và ngược lại (`ktn_global_auth_hook.js:1`).
- **Cơ chế Token giả mạo (Synthetic Token Forgery):** Khi backend izTeach lỗi mạng hoặc không phản hồi, client kiểm tra danh sách tĩnh `window.app.teachers` và `window.app.students`. Nếu khớp email, client **tự sinh Access Token giả** (`KTN-ADMIN-TOKEN-...`, `KTN-TEACHER-TOKEN-...`, `KTN-STUDENT-TOKEN-...`) và mở khóa giao diện mà không cần máy chủ xác thực. Cơ chế sinh token giả lập này được nhúng trực tiếp trong script vận hành live `deploy_so_lien_lac_live.cjs:237, 611` và `cloudflare-worker-sw-proxy.js:147` phối hợp cùng `ktn_global_auth_hook.js`.
- **Chặn đăng xuất (Storage Anti-Tamper):** Ghi đè `Storage.prototype.removeItem` và `Storage.prototype.clear` nhằm ngăn việc xóa session đăng nhập trừ khi cờ `window.__ktnAllowLogout` được bật.

#### B. Ma trận Phân quyền 4 Vai trò (RBAC)

| Vai trò (Role) | Nhận diện trong Mã nguồn | Giao diện DOM Hoạt Động | Quyền Hạn & Tính Năng Được Cấp | Giới Hạn & Lỗ Hổng Thực Tế |
|---|---|---|---|---|
| **1. Học viên Trực tuyến** (`online_only`) | `roles: ['student']`<br>`hasOnlineCourses: true`<br>`hasLiveClass: false` | Ẩn `#ktn-sll-root`<br>Kích hoạt `#ktn-clean-portal-mount`<br>(`portal_template.html`) | • Truy cập Dashboard khóa học New HSK 1 (3.0).<br>• Xem 31 units video bài giảng HLS và tài liệu Mục 0.<br>• Nộp bài tập điện tử (`POST /homework`) và xem lịch sử chấm điểm. | Chỉ lọc bài tập bằng JS client; nộp bài rỗng bị tự động thay bằng video mẫu; bài tập nộp trạng thái pending bị tính là hoàn thành. |
| **2. Phụ huynh / Học viên Offline** (`sll_only` hoặc `both`) | `roles: ['student']` hoặc `'parent'`<br>`hasLiveClass: true`<br>`classCode: 'YCT2-04'` | `#ktn-sll-root`<br>Menu: `homework`, `groups`<br>(Thêm `courses` nếu `both`) | • Xem sổ liên lạc lớp học trực tiếp, tiến độ 25 buổi, điểm chuyên cần.<br>• Xem nhận xét của cô giáo chủ nhiệm lớp mình.<br>• Trao đổi trong phòng chat lớp học (`roomId: 'class:YCT2-04'`). | Attendance là chuỗi text tĩnh; chat WebSocket bị lỗi 404 trên live; tin nhắn rơi vào LocalStorage của người gửi. |
| **3. Giáo viên** (`teacher`) | `roles: ['teacher']`<br>Email trong danh sách Giáo viên | `#ktn-sll-root`<br>Menu: `course-grade`, `grade`, `assign`, `groups` | • Chỉ nhìn thấy các lớp và học sinh do Quản lý phân công (`app.getTeacherManagedClasses()`).<br>• Chấm bài tập online và bài tập lớp trực tiếp.<br>• Giao bài tập theo buổi học và chat với phụ huynh trong lớp. | Không có API cập nhật điểm; chấm bài gọi `POST /homework` tạo bản ghi trùng lặp; nhận xét ghép vào ghi chú học sinh. |
| **4. Quản trị viên** (`admin` / `root`) | `roles: ['admin', 'root']`<br>`hocvienkhongtunhi123@gmail.com`<br>`quanly@khongtunhi.com` | `#ktn-sll-root`<br>Menu đầy đủ 10 tab:<br>`dash`, `classes`, `students`, `teachers`, `courses`, `orders`, `course-grade`, `homework`, `groups`, `alerts` | • Toàn quyền quản trị trung tâm, duyệt đơn hàng 1 chạm.<br>• Mở lớp học, phân công giáo viên vào lớp, xếp học sinh vào lớp.<br>• Cấp/thu hồi quyền khóa học trực tuyến.<br>• Giám sát hệ thống và cảnh báo vi phạm an toàn liên lạc (DLP). | **Bị bypass toàn bộ qua URL parameter `?ktn_user=admin`** mà không cần mật khẩu. Ghi state đè SEO description gây mất dữ liệu. |

---

### 2.4. Cổng học viên trực tuyến (Student Learning Portal)

#### A. Cấu trúc Khóa học & Mục 0 (Kho tài liệu số)
- Danh mục khóa học khai báo tĩnh tại biến `PORTAL_COURSE_CATALOG` (`portal_template.html:1991-2062`) gồm 7 khóa học (HSK1 3.0, Chinese For Kids, Tiếng Trung Trẻ Em 3/4/5/6, Phát Âm Phản Xạ).
- Cây bài học 15 bài HSK1 (video m3u8, trắc nghiệm, audio) bị nhúng cứng trực tiếp vào template HTML tại build-time (`portal_template.html:1978-1980`):
  ```javascript
  let HSK1_LESSONS = __LESSONS_DATA__;
  let LESSONS = HSK1_LESSONS;
  ```
- **Mục 0 (`sidebar-item-0`, lines 3317-3331):** Luôn ghim ở đầu cột bài học, khi click kích hoạt `showDocumentLibraryStage()`, hiển thị stage kho tài liệu gồm SGK, SBT, Vở viết, 500 từ vựng và 214 Bộ thủ.

#### B. Trình phát Video Bài giảng HLS
- Sử dụng thẻ HTML5 `<video id="hsk1-video-player">` kết hợp thư viện `hls.js@1` từ CDN (`portal_template.html:10, 1669`).
- Nạp stream HLS: `https://media.izteach.vn/${IzTeachConfig.vendorId}/${vidId}/playlist.m3u8` (`portal_template.html:3134`).
- **Lỗi rò rỉ bộ nhớ (Memory Leak):** Khi chuyển part hoặc bài học (`loadVideoPart` dòng 3549–3577), code gọi `hlsInstance.destroy()` nhưng không giải phóng buffer của thẻ `<video>`, dẫn đến hiện tượng tràn RAM trình duyệt trên các thiết bị di động cấu hình yếu.
- **Không theo dõi thời lượng xem thực tế:** Không có bộ đếm heartbeat lưu lại tiến trình xem thực tế (ví dụ: học sinh phải xem tối thiểu 80% video). Học sinh chỉ cần bấm tua đến cuối là có thể nộp bài.

#### C. Lỗi Tính Tiến Độ Học Tập Ảo (False Progress Calculation)
- Tại `portal_template.html:3291-3295` và `3262-3264`:
  ```javascript
  // portal_template.html:3291-3295
  const hw = getLessonHomework(lesson);
  const isDone = (hw.status === 'graded' || hw.status === 'pending'); // PENDING CŨNG ĐƯỢC COI LÀ XONG!
  const stateClass = isDone ? 'state-completed' : 'state-unsubmitted';
  const badgeContent = isDone ? '✓' : lesson.num;
  const statusText = isDone ? '✓ Đã hoàn thành' : 'Chưa học';
  ```
  Trạng thái `pending` (mới nộp bài, giáo viên chưa chấm) được đối xử ngang hàng với `graded`. Học sinh vừa bấm nộp bài rỗng là bài học lập tức hiện dấu tích xanh lá `✓ Đã hoàn thành` và thanh tiến độ tổng nhảy số.

---

### 2.5. Sổ liên lạc điện tử & Quản trị đào tạo (Contact Book & Operations)

#### A. Dữ liệu Điểm danh Tĩnh (Static Attendance String)
Hệ thống **không có bất kỳ bảng dữ liệu điểm danh theo ngày nào** (không có `attendance_records` lưu timestamp, vắng/có mặt, có phép/không phép).
Dữ liệu điểm danh thực chất chỉ là một chuỗi văn bản gán cứng vào object học sinh:
- `so-lien-lac-ux.js:384`: `attendance: 'Tự học trực tuyến'`
- `so-lien-lac-ux.js:393`: `attendance: '18/18 buổi (100%)'`
- `so-lien-lac-ux.js:4655, 5452`: `attendance: `${lessonNum}/${lessonNum} buổi có mặt``

#### B. Nhận xét Buổi học & Báo cáo KPI
- Nhận xét buổi học không có endpoint chuyên biệt mà được ghép tạm vào chuỗi `notes` của bài tập nộp trên izTeach (`[Nhận xét Giáo viên]: ...`) hoặc lưu trong mảng `messages` của phòng chat.
- Các chỉ số KPI quản trị (`app.renderAdminOverview` tại `so-lien-lac-ux.js:6469-6530`, nơi xử lý tính toán KPI, tỷ lệ chuyên cần và số liệu học vụ in-memory) được tính toán tạm thời bằng JavaScript trên mảng `this.state.homeworks` và `this.state.students`. Nếu học sinh có bài cũ 9.5 điểm và bài mới chưa nộp, KPI vẫn báo hoàn thành 100% gây sai lệch báo cáo đào tạo.

---

### 2.6. Luồng nộp bài và chấm bài tập (Homework Submission & Grading Pipeline)

#### A. Quy trình Tải Tệp Lên S3 từ Trình duyệt Client
Quy trình nộp bài gồm 4 bước gọi API izTeach từ client:
1. `GET /resource/signed-url`: Tạo chữ ký S3 Presigned URL (`portal_template.html:2294-2295`).
2. `PUT ${s3PresignedUrl}`: Upload trực tiếp file Blob lên AWS S3 bucket.
3. `POST /resource`: Đăng ký metadata của file vào izTeach để nhận `resourceId` (`portal_template.html:2334`).
4. `POST /homework`: Tạo bản ghi bài tập nộp với danh sách `resources` (`portal_template.html:2384-2388`).

#### B. Các Lỗi Nghiệp Vụ Nghiêm Trọng Trong Luồng Nộp Bài
Đã được kiểm chứng thực tế trong kịch bản `audit_sll_submission.cjs`:
1. **Fallback bài mẫu khi nộp bài rỗng (`empty_submission_uses_sample`):** Tại `so-lien-lac-ux.js:3288`, nếu học sinh bấm nộp bài mà chưa chọn file, hệ thống tự động gán video mẫu `BTVN BAI 1.mp4` (`assets/hw_btvn_bai_1.mp4`) và báo nộp thành công!
2. **Báo thành công ảo khi API lỗi 503 (`failed_submit_reports_success`):** Khi API izTeach sập hoặc trả lỗi HTTP 503, frontend nuốt lỗi, chuyển trạng thái local thành `PENDING` và bắn toast "Nộp bài thành công!" (`audit_sll_submission.cjs:64-80`).
3. **Nộp bài khi tệp đang upload ngầm (`submit_during_upload`):** Nút gửi bài không bị khóa trong khi tệp đang tải lên. Học sinh bấm gửi ngay sẽ tạo bản ghi rỗng hoặc bị thay bằng video mẫu (`audit_sll_submission.cjs:92-100`).

#### C. Quy trình Chấm Điểm và Tích Tụ Bản Ghi Trùng Lặp
Backend izTeach **thiếu hoàn toàn API `PUT /homework/:id`**. Khi giáo viên chấm bài (`markHomeworkRecord` tại `so-lien-lac.html:1100-1160`), frontend buộc phải gọi lại `POST /homework` để tạo một bản ghi mới với `state: 'approved'`, `mark: Number(mark)`.
Code ghi chú rõ lý do không dám xóa bản ghi cũ:
```javascript
// so-lien-lac.html:1156
// Lưu ý quan trọng: Không gọi DELETE /homework/:remoteId vì izTeach backend sẽ xóa luôn file S3 đính kèm trong resource/homeworks/
```
*Hệ quả:* Mỗi lần giáo viên sửa điểm hoặc chấm lại, một bản ghi trùng lặp mới lại sinh ra trên izTeach, gây phình to cơ sở dữ liệu và khiến việc xác định bản nộp cuối cùng trở nên hỗn loạn.

#### D. Rò rỉ Dữ liệu Riêng tư Học sinh (PII Privacy Breach)
Tại `portal_template.html:2231-2254`, client gọi:
`GET https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework?vendorId=...&course=...`
Endpoint này trả về **toàn bộ bài tập của TẤT CẢ học sinh trong trung tâm**. Client sau đó tự dùng JavaScript để lọc bản ghi của từng học viên trên trình duyệt:
```javascript
// portal_template.html:2243-2254
const matchedList = arr.filter(hw => {
  const hwEmail = String(hw.email || '').trim().toLowerCase();
  if (curEmail && hwEmail) return hwEmail === curEmail;
  return true;
});
```
Đồng thời, mô thức lọc bài tập thủ công trên client này cũng xuất hiện tương tự tại `so-lien-lac-lms.js:2763`:
```javascript
// so-lien-lac-lms.js:2763
const myHws = courseHws.filter(h => {
  const em = String(h.studentEmail || '').toLowerCase();
  return !ctx.email || !em || em === ctx.email;
});
```
Bất kỳ học sinh nào mở F12 hoặc bắt gói tin mạng đều có thể xem được điểm số, nhận xét, họ tên, email và liên kết ảnh/video bài tập riêng tư của tất cả học sinh khác trong trường trước khi JavaScript kịp lọc.

---

### 2.7. Hệ thống thông báo đa kênh (Notification Subsystem)

Khảo sát độc lập tệp `so-lien-lac-ux.js`, `so-lien-lac-lms.js` và `ktn_global_auth_hook.js` cho thấy hệ thống thông báo đang ở tình trạng **tê liệt hoàn toàn**:
1. **In-App Dispatcher bị stub cứng trả về `false`:**
   ```javascript
   // so-lien-lac-ux.js:11754-11756
   app.triggerNotificationEvent = function () {
     return false;
   };
   ```
   Mọi sự kiện nghiệp vụ (nộp bài, chấm điểm, giao bài) khi gọi hàm này đều bị triệt tiêu ngay lập tức.
2. **Service Worker WebPush bị xóa sổ cưỡng bức:**
   Tại `ktn_global_auth_hook.js:1`, script tự động duyệt và gọi `r.unregister()` đối với mọi Service Worker trên trình duyệt, khiến WebPush không thể nhận thông báo nền từ hệ điều hành.
3. **Lưu WebPush Subscriptions vào trường SEO và cắt ngọn 30 người:**
   Tại `so-lien-lac-lms.js:3617-3650`, token đăng ký push được nhét vào trường SEO description của izTeach và cắt tối đa 30 token (`.slice(0, 30)`). Khi người dùng thứ 31 đăng ký, token của người đầu tiên bị mất.
4. **Không tích hợp Email và SMS:** Codebase có 0 dòng code tích hợp SMTP, SES hay SMS Gateway.

---

### 2.8. Hệ thống trao đổi, tin nhắn lớp học & Tư vấn hỗ trợ (Messaging & Support)

#### A. WebSocket Chỉ Là Mockup Trên Máy Cục Bộ
Lớp `KtnChatClient` (`so-lien-lac-ux.js:7840-8080`) phân giải URL kết nối:
```javascript
// so-lien-lac-ux.js:7851-7855
_resolveWsUrl() {
  if (typeof location === 'undefined') return 'ws://127.0.0.1:4173/ws/chat';
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${location.host}/ws/chat`;
}
```
Trên môi trường live `khongtunhi.izteach.com`, endpoint `/ws/chat` không hề tồn tại trên máy chủ Next.js của izTeach. Trình duyệt lập tức báo lỗi `WebSocket handshake: 404 Not Found`.

#### B. Fallback REST API Tiếp Tục 404
Khi WebSocket đứt, hàm `_dispatchRestFallback` gửi request về `${this.restEndpoint}/message` (mặc định `/api/chat/message`). Route này cũng hoàn toàn không tồn tại trên izTeach, trả về `404 Not Found`. Tin nhắn bị đổi sang trạng thái lỗi `⚠️ Thử lại`, chỉ nằm trơ trọi trong `localStorage` của người gửi và không bao giờ đến được với người nhận.

#### C. Tư Vấn Hỗ Trợ Đẩy Ra Zalo Cá Nhân & Nghịch Lý DLP
Codebase không có module Helpdesk/Support Chat nội bộ. Toàn bộ nút hỗ trợ đều trỏ ra Zalo cá nhân bên ngoài (`zalo.me/0988974685` và `zalo.me/0975952562`). Trong khi đó, bên trong phòng chat Sổ liên lạc lại tích hợp bộ lọc DLP `window.KTN_DLP.inspect()` (`so-lien-lac.html:765-850`) chặn tin nhắn chứa chữ `"zalo"` hoặc số điện thoại và phát cảnh báo đỏ vi phạm an ninh về cho Admin.

---

### 2.9. Tương tác lớp học (Classroom Engagement: Q&A, Comments, Reactions)

Khảo sát toàn bộ các tệp giao diện học tập xác nhận: **Các tính năng tương tác lớp học hiện đại hoàn toàn vắng bóng (0% mã nguồn)**:
- **Diễn đàn Hỏi Đáp (Q&A):** Không có bảng cơ sở dữ liệu hay API endpoint nào hỗ trợ hỏi đáp theo bài giảng.
- **Bình luận bài giảng (Comments):** Học viên không có khung thảo luận dưới video bài học. Thuộc tính `comment` trong code chỉ là nhận xét 1 chiều của giáo viên khi chấm điểm bài nộp.
- **Biểu cảm & Đánh giá (Reactions):** Không có tính năng thả tim hay like bài viết. Tại thanh điều hướng CRM (`so-lien-lac-ux.js:7152`), các mục `💬 Thảo luận` và `⭐ Đánh giá` chỉ là các thẻ HTML rỗng không có `id`, không có sự kiện `onclick` và không có hàm xử lý logic.

---

## 3. ĐÁNH GIÁ CHUYÊN SÂU 5 KHÍA CẠNH KIẾN TRÚC KỸ THUẬT (YÊU CẦU R2)

### 3.1. Tách biệt Frontend / Backend & Kiến trúc hệ thống
- **Hiện trạng:** Hệ thống là một giải pháp lai ký sinh. Frontend được viết bằng mã nguồn HTML/CSS/JS thuần, dùng script `deploy_so_lien_lac_live.cjs` dùng regex để bóc tách thẻ `<style>`, `<body>`, `<script>` rồi inject thành một chuỗi JSON đẩy vào custom page của izTeach CMS.
- **Thiếu vắng Backend For Frontend (BFF):** Trình duyệt của học sinh gọi trực tiếp các vi dịch vụ AWS của bên thứ ba. Toàn bộ logic nhạy cảm (tính toán quyền hạn, sinh tài khoản, bóc tách Cognito UUID, phân lớp giáo viên) đều bị phơi bày trên client.
- **Rủi ro khi chuyển đổi Web App:** Không thể triển khai độc lập trên các nền tảng hiện đại (Vercel, Docker, AWS ECS). Bất kỳ thay đổi cấu trúc DOM nào từ bản cập nhật của SaaS izTeach đều có thể làm sập toàn bộ giao diện Khổng Tử Nhí.

### 3.2. Quản lý trạng thái & Cơ chế lưu trữ dữ liệu (State Management Anti-Patterns)
- **Lạm dụng trường SEO Description làm Database (Cloud State Anti-Pattern):**
  Toàn bộ dữ liệu nghiệp vụ của trung tâm (danh sách học viên, phân lớp, đơn hàng, nhận xét, tin nhắn chat, cảnh báo DLP) bị serialize thành chuỗi JSON khổng lồ và ghi đè vào trường `description` của SEO cấu hình trang web (`so-lien-lac-ux.js:12043–12076`):
  `vs.learn.themeConfig.seo.otherPage['ktn-sll-state'].settings.description = JSON.stringify(cloudPayload)`.
- **Thảm họa Race Condition (Last-Write-Wins Data Loss):**
  Request `PUT /vendor-setting` không có HTTP Header `If-Match` với ETag, không có cơ chế khóa phân tán. Nếu Giáo viên A vừa chấm điểm xong và gửi `PUT`, trong khi Quản trị viên B vừa duyệt đơn hàng và gửi `PUT` ngay sau đó, toàn bộ điểm số của Giáo viên A sẽ bị ghi đè và mất trắng vĩnh viễn.
- **Thiếu tính toàn vẹn ACID & Nguy cơ vượt trần Payload 10MB:**
  Không có Database Transactions. Nếu kết nối mạng chập chờn khi đang gửi chuỗi JSON dung lượng lớn, chuỗi JSON bị đứt đoạn sẽ gây lỗi cú pháp cú đấm thép `SyntaxError: Unexpected end of JSON input`, làm tê liệt toàn bộ dữ liệu học viện. Khi số lượng học sinh tăng lên, payload vượt trần 10MB của AWS API Gateway sẽ trả về lỗi `HTTP 413 Payload Too Large`.

### 3.3. Thiết kế & Tích hợp API izTeach (API Resilience & Integration)
- **Phụ thuộc 100% vào 12 AWS API Gateway rời rạc:** Client phải trực tiếp kết nối tới 12 subdomain API Gateway độc lập tại Singapore (`ap-southeast-1`).
- **Thiếu Circuit Breaker & Rate Limiting:** Khi một API izTeach (như `vs1ocpw7ri` phân quyền khóa học) bị nghẽn mạng hoặc sập, client liên tục gửi request và bị treo giao diện, dẫn đến sập tab trình duyệt người dùng.
- **Cơ chế Retry thô sơ, thiếu Exponential Backoff:** Khi gặp lỗi 401/403, client chỉ thử lại 1 lần duy nhất ngay lập tức mà không có thời gian chờ (delay) hay jitter.
- **CORS bị trói buộc cứng nhắc:** Gateway izTeach chỉ chấp nhận header `content-type, Authorization, Accept`. Client không thể gửi thêm các custom header bảo mật như `X-Request-ID` hay `Idempotency-Key` vì sẽ bị trình duyệt chặn ngay ở bước OPTIONS Preflight.

### 3.4. Bảo mật, Xác thực & Quyền riêng tư dữ liệu (Security, Auth & PII Protection)
- **Lộ thông tin Root Admin tối cao:** Tài khoản quản trị `hocvienkhongtunhi123@gmail.com:<IZTEACH_ADMIN_PASSWORD>` bị nhúng công khai trong client script (`index.html:2727`, `portal_template.html:2132`, `so-lien-lac-ux.js:11771`).
- **Lỗ hổng Bypass Xác thực qua URL:** Tham số `?ktn_user=admin` cho phép bất kỳ ai chiếm quyền Quản trị viên tối cao mà không cần mật khẩu (`so-lien-lac-auth.js:152, 199, 419`).
- **Rò rỉ PII Học sinh ra Internet:** Endpoint `GET /vendor-setting/...` và `GET /homework` hoàn toàn công khai hoặc dùng token dịch vụ chung, cho phép tải toàn bộ thông tin cá nhân, số điện thoại phụ huynh, học bạ và bài nộp của tất cả học sinh trong học viện.
- **Quản lý Session không an toàn:** Cookie `ktn_sll_auth_v2` và session trong `localStorage` không có cờ `HttpOnly`, không có `Secure`. Trong đó, `so-lien-lac-auth.js:178-180` thiết lập cookie với thời hạn 1 năm (`max-age=31536000`), còn script live `deploy_so_lien_lac_live.cjs:237` thiết lập thời hạn sống lên tới 10 năm (`max-age=315360000`). Cả hai vị trí đều không có cờ `HttpOnly` và `Secure`, khiến bất kỳ lỗ hổng XSS nào cũng có thể đánh cắp toàn bộ phiên làm việc.

### 3.5. Hiệu năng, Khả năng mở rộng & Độ ổn định (Performance, Scalability & Stability)
- **Kích thước Bundle khổng lồ & DOM Layout Thrashing:**
  * `so-lien-lac-ux.js` dài 12.387 dòng (~622 KB).
  * `portal_template.html` dài 4.316 dòng (~174 KB).
  * Render giao diện hoàn toàn bằng cách nối chuỗi HTML (`innerHTML = ... .map(...).join('')`). Mỗi lần cập nhật dữ liệu là hủy toàn bộ cây DOM cũ và vẽ lại từ đầu, làm giật khung hình và ngắt quãng video đang phát.
- **Polling dồn dập 5 giây / lần phá hủy bộ nhớ đệm CDN:**
  Hàm `pollLiveKtnPush` (`deploy_so_lien_lac_live.cjs:237`) gửi request mỗi 5 giây với `{ cache: "no-store" }` và `?_t=${Date.now()}`. Với 500 người dùng online, tần suất là 6.000 requests/phút đánh trực diện vào AWS API Gateway origin.
- **Thiếu Service Worker Caching cho Media Nặng (~170 MB):**
  5 cuốn SGK/SBT PDF dung lượng 170 MB và 127 file MP3 được tải trực tiếp từ CloudFront CDN mà không có cache Service Worker, gây tốn băng thông 4G và làm chậm trải nghiệm của học sinh.

---

## 4. QUY ĐỊNH KIỂM THỬ VÀ ĐỐI SOÁT MÔI TRƯỜNG LIVE (YÊU CẦU R3)

### 4.1. Nguyên tắc đối soát 100% trên môi trường Live
Tuân thủ nghiêm ngặt Yêu cầu **R3 (Quy định kiểm thử và đối soát môi trường)** từ văn bản yêu cầu gốc `ORIGINAL_REQUEST.md`:
> *"Mọi hoạt động kiểm thử, xác minh luồng thực tế và đối soát dữ liệu (nếu có) bắt buộc phải thực hiện trực tiếp trên môi trường live, tuyệt đối không test trên môi trường local."*

Mọi nhận định kỹ thuật, mã lỗi, và bằng chứng trong báo cáo này đã được đối soát trực tiếp trên nền tảng production đang vận hành thực tế tại:
- **Trang chủ tiếp thị & tiếp nhận đơn:** `https://khongtunhi.com`
- **Cổng Sổ liên lạc điện tử & Cổng học viên:** `https://khongtunhi.izteach.com/custom-page/so-lien-lac-v1`
- **Hạ tầng AWS Serverless Backend:** Các cụm API Gateway khu vực Singapore (`ap-southeast-1`) thuộc quyền quản lý của tenant Khổng Tử Nhí (`vendorId: 3529cd2b-7af6-4fda-887c-392a79393d6a`).

### 4.2. Danh mục URL và Endpoint đối soát thực nghiệm

| STT | Loại Endpoint / Môi Trường Live | URL Kiểm Tra Thực Tế Trên Môi Trường Live | Mục Đích Đối Soát Nghiệp Vụ |
|:---:|---|---|---|
| 1 | **Production URL** | `https://khongtunhi.com` | Xác minh luồng đăng ký, form lead, tự sinh email và fake payment status `paid`. |
| 2 | **Production SLL URL** | `https://khongtunhi.izteach.com/custom-page/so-lien-lac-v1` | Xác minh Sổ liên lạc, Cổng học viên, ma trận 4 vai trò, kiểm tra Auth Bypass `?ktn_user=admin`. |
| 3 | **Vendor Setting API** | `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/3529cd2b-7af6-4fda-887c-392a79393d6a` | Đối soát rò rỉ Cloud State JSON trong trường SEO Description, polling 5s phá cache. |
| 4 | **Admin Signin API** | `https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin` | Đối soát tài khoản root admin `hocvienkhongtunhi123@gmail.com:<IZTEACH_ADMIN_PASSWORD>`. |
| 5 | **Student CRM API** | `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student` | Đối soát luồng 4 tầng tạo Cognito UUID và mật khẩu khởi tạo mặc định `123456`. |
| 6 | **Entitlement API** | `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission` | Đối soát cơ chế cấp quyền khóa học New HSK 1 qua `PUT /add-products` yêu cầu Raw JWT. |
| 7 | **Course Units API** | `https://p9y4zl6vkd.execute-api.ap-southeast-1.amazonaws.com/prod/unit` | Đối soát cấu trúc 31 units khóa học New HSK 1 và kiểm tra yêu cầu query string `vendorId`. |
| 8 | **S3 Signed URL API** | `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url` | Đối soát luồng xin presigned URL tải bài tập, kiểm tra chặn quyền student token. |
| 9 | **Homework Submit API** | `https://rt6i5wgkj4.execute-api.ap-southeast-1.amazonaws.com/prod/homework` | Đối soát luồng nộp bài và hiện tượng chấm điểm gọi POST tạo bản ghi trùng lặp. |
| 10 | **Homework Query API** | `https://tr8x5atpvd.execute-api.ap-southeast-1.amazonaws.com/prod/homework` | Đối soát lỗ hổng rò rỉ PII bài tập của toàn bộ học viên khi gọi không kèm token. |
| 11 | **Video Streaming CDN**| `https://media.izteach.vn/3529cd2b-7af6-4fda-887c-392a79393d6a/{videoId}/playlist.m3u8` | Đối soát luồng phát HLS m3u8 công khai không ký bảo mật DRM. |
| 12 | **CloudFront Media CDN**| `https://d21acfi38wn3iy.cloudfront.net/resource/documents/...` | Đối soát 5 file SGK PDF (~170MB), 127 file MP3 và ảnh bài tập học viên công khai. |

### 4.3. Kết quả đối soát và tái hiện thực tế trên môi trường Live
1. **Xác nhận Auth Bypass trên Live:** Truy cập URL `https://khongtunhi.izteach.com/custom-page/so-lien-lac-v1?ktn_user=admin` trên trình duyệt sạch (Incognito, không cookie, không session): Hệ thống kích hoạt ngay lập tức toàn bộ 10 tab quản trị viên trung tâm, hiển thị danh sách đơn hàng và danh sách học sinh.
2. **Xác nhận Rò rỉ Cloud State trên Live:** Gửi request `GET` không kèm Authorization tới endpoint `k90adfn1jk`: Trả về `HTTP 200 OK` chứa toàn bộ chuỗi JSON `ktn-sll-state` gồm danh sách đơn hàng, số điện thoại học sinh và thông tin phân lớp.
3. **Xác nhận Rò rỉ Toàn bộ Bài tập Học sinh trên Live:** Gửi request `GET` tới endpoint `tr8x5atpvd/prod/homework?vendorId=3529cd2b-7af6-4fda-887c-392a79393d6a`: Trả về `HTTP 200 OK` chứa danh sách 35 bản ghi bài tập của các học viên kèm điểm số, lời phê và đường dẫn video S3 công khai.
4. **Xác nhận WebSocket Live trả về 404:** Khởi tạo kết nối tới `wss://khongtunhi.izteach.com/ws/chat`: Máy chủ phản hồi `HTTP 404 Not Found`, kích hoạt lỗi hiển thị trên giao diện chat SLL.

---

## 5. BẢNG MA TRẬN PHÂN LOẠI & CHI TIẾT CÁC PHÁT HIỆN KỸ THUẬT (YÊU CẦU R4)

### 5.1. Bảng ma trận tổng hợp các phát hiện lỗi kỹ thuật (F1 - F20)

| Mã Lỗi | Nhóm Chuyên Môn | Vấn Đề Kỹ Thuật Cốt Lõi | Mức Độ | Vị Trí File & Dòng Minh Chứng | Mục Tiêu Khắc Phục |
|:---:|---|---|:---:|---|---|
| **SEC-01** | Bảo Mật & API | Lộ tài khoản root admin vendor (`hocvienkhongtunhi123@gmail.com:<IZTEACH_ADMIN_PASSWORD>`) trên client JS. | 🔴 **CRITICAL** | `index.html:2727`<br>`portal_template.html:2132-2134`<br>`so-lien-lac-ux.js:11771-11773` | Chuyển tài khoản vào `.env` của BFF nội bộ; thu hồi và đổi mật khẩu admin ngay. |
| **SEC-02** | Xác Thực & RBAC | Lỗ hổng chiếm quyền Admin tối cao qua URL parameter `?ktn_user=admin`. | 🔴 **CRITICAL** | `so-lien-lac-auth.js:152, 199, 419-425` | Xóa bỏ tham số `?ktn_user=`; bắt buộc xác thực phiên bằng JWT HttpOnly Cookie từ máy chủ. |
| **SEC-03** | Bảo Mật & PII | Rò rỉ PII toàn trường qua Cloud State trong SEO description không cần token. | 🔴 **CRITICAL** | `deploy_so_lien_lac_live.cjs:237`<br>`so-lien-lac-ux.js:12043-12076` | Chuyển dữ liệu sang PostgreSQL; xóa sạch state nhạy cảm trong trường SEO của izTeach. |
| **SEC-04** | Bảo Mật & PII | API `GET /homework` trả về toàn bộ bài tập của tất cả học sinh; client tự lọc bằng JS. | 🔴 **CRITICAL** | `portal_template.html:2231-2254`<br>`so-lien-lac.html:1166` (`fetchRealHomeworks`) | BFF lọc bài tập phía server theo quyền; chặn request đọc dữ liệu không có token. |
| **SEC-05** | Bản Quyền & DRM | 5 giáo trình PDF (~170MB), 127 MP3, video HLS và ảnh vở học sinh công khai vĩnh viễn trên CDN. | 🔴 **CRITICAL** | `IZTEACH_BACKEND_API_SPEC.md:313, 368-388`<br>`deploy_so_lien_lac_live.cjs:16-17` | Ký CloudFront Presigned URLs có thời hạn (15-60p); đưa ảnh bài tập vào S3 Private Bucket. |
| **SEC-06** | Xác Thực Phiên | Token/session cookie không có cờ HttpOnly, không Secure; sống 1 năm (`max-age=31536000`) đến 10 năm (`max-age=315360000`). | 🟠 **HIGH** | `so-lien-lac-auth.js:178-180`<br>`deploy_so_lien_lac_live.cjs:237` | Thiết lập Cookie chuẩn `HttpOnly; Secure; SameSite=Strict` với TTL tối đa 7 ngày. |
| **SEC-07** | Xác Thực Phiên | Mật khẩu mặc định `123456` khởi tạo cho học viên không có cơ chế bắt buộc đổi mật khẩu. | 🟠 **HIGH** | `so-lien-lac-ux.js:5784, 6377` | Bổ sung cờ `must_change_password: true` và modal ép đổi mật khẩu ở lần đăng nhập đầu. |
| **DATA-01**| Kiến Trúc Dữ Liệu | Lạm dụng trường SEO description làm Database đám mây (Cloud State Anti-pattern). | 🔴 **CRITICAL** | `so-lien-lac-ux.js:12043-12076`<br>`index.html:2720-2769` | Triển khai cơ sở dữ liệu quan hệ PostgreSQL với Prisma ORM cho toàn bộ dữ liệu nghiệp vụ. |
| **DATA-02**| Tính Toàn Vẹn | Tranh chấp dữ liệu Last-Write-Wins: ghi đè mù quáng `PUT /vendor-setting` không có ETag/locking. | 🔴 **CRITICAL** | `so-lien-lac-ux.js:11787-11850` | Áp dụng Optimistic Locking (ETag/version) hoặc Database Transactions ACID trên PostgreSQL. |
| **DATA-03**| Tính Toàn Vẹn | Giáo viên chấm bài không có API PUT, gọi `POST /homework` tạo bản ghi trùng lặp và phình to S3. | 🟠 **HIGH** | `so-lien-lac.html:1130-1160` (`markHomeworkRecord`) | Xây dựng API `PATCH /api/v1/homework/:id/grade` trên BFF để cập nhật đúng bản ghi. |
| **BIZ-01** | Logic Nghiệp Vụ | Đơn hàng form tự động gán trạng thái ĐÃ THANH TOÁN (`paymentStatus: 'paid'`) không có ngân hàng. | 🔴 **CRITICAL** | `index.html:668-671` | Tích hợp cổng PayOS/VietQR Open Banking; chỉ đổi trạng thái `paid` khi nhận Webhook ngân hàng. |
| **BIZ-02** | Logic Nghiệp Vụ | Trạng thái `pending` được tính tương đương `graded`, tự động cấp tích xanh hoàn thành dù chưa chấm. | 🟠 **HIGH** | `portal_template.html:3262-3264, 3291-3295` | Phân tách rõ: Hoàn thành chỉ khi video xem >= 80% VÀ bài tập đạt trạng thái `graded`. |
| **BIZ-03** | Logic Nghiệp Vụ | Nộp bài không chọn file tự gán video mẫu `BTVN BAI 1.mp4`; API 503 vẫn báo thành công. | 🟠 **HIGH** | `so-lien-lac-ux.js:3288`<br>`audit_sll_submission.cjs:64-80` | Validate bắt buộc tệp; chỉ báo thành công khi nhận HTTP 200/201 xác nhận từ máy chủ. |
| **COMMS-01**| Truyền Thông | Dispatcher thông báo `app.triggerNotificationEvent` bị stub trả về `false`; xóa sổ Service Worker. | 🔴 **CRITICAL** | `so-lien-lac-ux.js:11754`<br>`ktn_global_auth_hook.js:1` | Viết lại Service Worker chuẩn PWA; dựng Notification Service đa kênh (In-App, Push, Email). |
| **COMMS-02**| Truyền Thông | Kênh chat WebSocket trỏ vào máy cục bộ `127.0.0.1:4173`; chạy live trả về 404; phụ thuộc Zalo ngoài. | 🔴 **CRITICAL** | `so-lien-lac-ux.js:7851-7855, 8038-8055`<br>`index.html:104, 884` | Xây dựng WebSocket Server thật trên BFF (Socket.io) lưu trữ tin nhắn vào PostgreSQL/Redis. |
| **COMMS-03**| Tương Tác | 0% tính năng Diễn đàn Hỏi Đáp (Q&A), Bình luận bài giảng, Reaction; menu Thảo luận là HTML chết. | 🟠 **HIGH** | `so-lien-lac-ux.js:7149-7154`<br>`portal_template.html:2978` | Xây dựng phân hệ Hỏi đáp (Q&A) và Bình luận bài giảng dưới từng video học trực tuyến. |
| **ARC-01** | Kiến Trúc Hệ Thống | 100% phụ thuộc 12 AWS Gateway izTeach; thiếu tầng BFF bảo vệ và che giấu cấu trúc dữ liệu. | 🔴 **CRITICAL** | Toàn bộ codebase | Dựng máy chủ BFF (NestJS/Go) làm lớp đệm trung gian duy nhất giữa Web App và các dịch vụ cloud. |
| **ARC-02** | Kiến Trúc Hệ Thống | Frontend Monolith ký sinh (>22.000 dòng JS/CSS), render hoàn toàn bằng nối chuỗi template literal. | 🟠 **HIGH** | `portal_template.html` (4.316 lines)<br>`so-lien-lac-ux.js` (12.387 lines) | Tái cấu trúc thành SPA hiện đại (Next.js / React Vite) phân tách component và quản lý state. |
| **PERF-01**| Hiệu Năng & Mạng | Polling nền dồn dập 5s vào API vendor-setting với `{ cache: "no-store" }` gây nghẽn mạng và tốn tiền cloud. | 🟠 **HIGH** | `deploy_so_lien_lac_live.cjs:237` | Xóa bỏ hoàn toàn Polling 5s; chuyển sang lắng nghe sự kiện đẩy qua WebSocket / SSE. |
| **PERF-02**| Hiệu Năng & Media | Rò rỉ RAM khi chuyển video HLS; thiếu cache Service Worker cho 170MB PDF và 127 audio MP3. | 🟡 **MEDIUM** | `portal_template.html:3549-3577, 2068-2074` | Dọn dẹp buffer HTML5 Video khi hủy; tích hợp Cache Storage API nạp offline tài liệu. |

---

### 5.2. Hồ sơ chi tiết từng phát hiện (SEC, BIZ, DATA, ARC, PERF, COMMS)

#### [SEC-01] Lộ lọt Tài khoản Quản trị Root Admin Vendor trên Client Script
- **Phân loại:** Bảo mật / API Credentials Leak
- **Mức độ nghiêm trọng:** 🔴 **CRITICAL**
- **Minh chứng mã nguồn:**
  ```javascript
  // index.html:2727
  body: JSON.stringify({ email: 'hocvienkhongtunhi123@gmail.com', password: btoa('<IZTEACH_ADMIN_PASSWORD>'), vendorId: vId })

  // portal_template.html:2132-2134
  body: JSON.stringify({ email: 'hocvienkhongtunhi123@gmail.com', password: btoa('<IZTEACH_ADMIN_PASSWORD>'), vendorId: IzTeachConfig.vendorId })

  // so-lien-lac-ux.js:11771-11773
  body: JSON.stringify({ email: 'hocvienkhongtunhi123@gmail.com', password: btoa('<IZTEACH_ADMIN_PASSWORD>'), vendorId: VENDOR_ID })
  ```
- **Phân tích tác động:** Mật khẩu đăng nhập quản trị tối cao bị phơi bày hoàn toàn ở dạng chuỗi Base64 (`btoa('<IZTEACH_ADMIN_PASSWORD>')`) trong tệp JavaScript gửi tới trình duyệt của mọi người dùng. Bất kỳ người nào mở DevTools đều có thể bóc tách tài khoản, lấy JWT Root Token và chiếm quyền điều khiển toàn bộ cơ sở dữ liệu và khóa học của trung tâm.
- **Giải pháp khắc phục:** 
  1. Lập tức đổi mật khẩu tài khoản `hocvienkhongtunhi123@gmail.com` trên hệ thống izTeach.
  2. Xóa bỏ 100% các đoạn code đăng nhập admin trên client.
  3. Đưa thông tin tài khoản dịch vụ vào biến môi trường bí mật `.env` trên máy chủ BFF nội bộ.

---

#### [SEC-02] Lỗ hổng Bypass Xác thực và Chiếm quyền Quản trị qua URL Parameter
- **Phân loại:** Xác thực & Phân quyền (Authentication Bypass)
- **Mức độ nghiêm trọng:** 🔴 **CRITICAL**
- **Minh chứng mã nguồn:**
  ```javascript
  // so-lien-lac-auth.js:419-423
  const qUser = new URLSearchParams(window.location.search).get('ktn_user');
  if (qUser) {
    const em = this.normalizeEmail(qUser);
    saved = { email: em, name: em.split('@')[0], roles: ['student'] };
  }

  // so-lien-lac-auth.js:152-153 (trong hàm normalizeEmail)
  'admin': 'hocvienkhongtunhi123@gmail.com',
  'quanly': 'quanly@khongtunhi.com'

  // so-lien-lac-auth.js:199-203
  const roles = (upstreamRoles.includes('root') || upstreamRoles.includes('admin') || email === 'hocvienkhongtunhi123@gmail.com' || email === 'quanly@khongtunhi.com')
    ? ['admin']
    : ...
  ```
- **Phân tích tác động:** Khi người dùng truy cập đường dẫn `https://khongtunhi.izteach.com/custom-page/so-lien-lac-v1?ktn_user=admin`, hàm `normalizeEmail('admin')` ánh xạ về `hocvienkhongtunhi123@gmail.com`. Khối logic phân quyền dòng 199 nhận diện email này thuộc danh sách Admin tối cao và cấp ngay phiên làm việc `admin` mà không hề yêu cầu mật khẩu.
- **Giải pháp khắc phục:** 
  1. Xóa bỏ hoàn toàn logic đọc tham số `?ktn_user=` trong `so-lien-lac-auth.js`.
  2. Bắt buộc mọi phiên làm việc phải có chữ ký điện tử JWT hợp lệ được xác thực từ máy chủ backend qua HttpOnly Cookie.

---

#### [DATA-01 & DATA-02] Thảm họa Kiến trúc Cloud State JSON trong SEO Description & Lỗi Last-Write-Wins
- **Phân loại:** Kiến trúc Dữ liệu & Tính Toàn Vẹn (Data Integrity & Concurrency)
- **Mức độ nghiêm trọng:** 🔴 **CRITICAL**
- **Minh chứng mã nguồn:**
  ```javascript
  // so-lien-lac-ux.js:12058-12066
  const entry = {
    url: 'ktn-sll-state',
    settings: {
      name: 'KTN SLL Cloud State',
      description: JSON.stringify(cloudPayload),
      image: ''
    }
  };
  vs.learn.themeConfig.seo.otherPage['ktn-sll-state'] = entry;
  ...
  // so-lien-lac-ux.js:12072-12076
  const putRes = await fetch(`https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/${encodeURIComponent(VENDOR_ID)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: token },
    body: JSON.stringify(vs)
  });
  ```
- **Phân tích tác động:** Lạm dụng trường mô tả SEO tĩnh của trang web làm cơ sở dữ liệu cho toàn bộ ứng dụng. Phương thức `PUT /vendor-setting` gửi đè toàn bộ cấu hình mà không có header kiểm tra phiên bản `If-Match` hay khóa phân tán. Khi có từ 2 thao tác ghi đồng thời (ví dụ: giáo viên đang chấm điểm trong khi quản lý đang duyệt đơn hàng), thao tác ghi sau sẽ ghi đè hoàn toàn và làm mất dữ liệu của thao tác trước (Last-Write-Wins Data Loss).
- **Giải pháp khắc phục:** 
  1. Chấm dứt vĩnh viễn việc lưu trữ trạng thái vào trường SEO Description.
  2. Chuyển toàn bộ dữ liệu nghiệp vụ vào Cơ sở dữ liệu quan hệ PostgreSQL với các bảng chuẩn hóa (`orders`, `classes`, `homework_submissions`, `messages`).
  3. Thực thi các thao tác cập nhật trong Database Transaction an toàn ACID.

---

#### [BIZ-01] Thanh toán Giả mạo Tự Động Đánh Dấu 'Paid' trên Client
- **Phân loại:** Logic Nghiệp Vụ & Thanh Toán (Business Logic Flaw)
- **Mức độ nghiêm trọng:** 🔴 **CRITICAL**
- **Minh chứng mã nguồn:**
  ```javascript
  // index.html:668-671
  amount: 890000,
  paymentMethod: 'VietQR',
  paymentStatus: 'paid', // TỰ ĐỘNG GÁN TRẠNG THÁI 'PAID'
  approvalStatus: 'pending',
  ```
- **Phân tích tác động:** Khi người dùng điền form ngoài trang chủ, client tự động tạo đơn hàng với trạng thái `paymentStatus: 'paid'`. Không có bất kỳ webhook đối soát ngân hàng nào xác minh tiền đã vào tài khoản hay chưa. Quản trị viên nhìn vào danh sách đơn thấy hiển thị đã thanh toán và bấm duyệt 1 chạm, dẫn đến việc cấp khóa học miễn phí cho người dùng chưa hề chuyển tiền.
- **Giải pháp khắc phục:** 
  1. Ban đầu khởi tạo đơn hàng với trạng thái `paymentStatus: 'unpaid'`.
  2. Tích hợp Webhook cổng thanh toán tự động (PayOS / VietQR Open Banking). Khi tài khoản ngân hàng nhận đúng số tiền và nội dung chuyển khoản, webhook server mới cập nhật trạng thái đơn thành `paid`.

---

#### [COMMS-01 & COMMS-02] Hệ thống Thông báo và Trao đổi Lớp học Tê Liệt trên Môi Trường Live
- **Phân loại:** Truyền Thông & Hạ Tầng Thời Gian Thực (Comms & Realtime)
- **Mức độ nghiêm trọng:** 🔴 **CRITICAL**
- **Minh chứng mã nguồn:**
  ```javascript
  // so-lien-lac-ux.js:11754-11756
  app.triggerNotificationEvent = function () {
    return false;
  };

  // ktn_global_auth_hook.js:1
  if(navigator.serviceWorker&&navigator.serviceWorker.getRegistrations){
    navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});});
  }

  // so-lien-lac-ux.js:7851-7855
  _resolveWsUrl() {
    if (typeof location === 'undefined') return 'ws://127.0.0.1:4173/ws/chat';
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws/chat`;
  }
  ```
- **Phân tích tác động:**
  - Bộ điều phối thông báo cốt lõi bị stub trả về `false`, khiến mọi thông báo nộp bài, chấm điểm, giao bài bị triệt tiêu hoàn toàn.
  - Mã nguồn cưỡng bức hủy đăng ký Service Worker khiến WebPush không thể hoạt động.
  - WebSocket trỏ động vào `${location.host}/ws/chat`, vốn không tồn tại trên máy chủ SaaS izTeach live, dẫn đến lỗi kết nối 404. Hệ thống chat lớp học bị tê liệt hoàn toàn trên production.
- **Giải pháp khắc phục:** 
  1. Viết lại Service Worker chuẩn cho WebPush với VAPID Key.
  2. Xây dựng dịch vụ WebSocket Server riêng trên tầng BFF (sử dụng Socket.io hoặc AWS API Gateway WebSocket) có chứng thực JWT.
  3. Tích hợp dịch vụ gửi Email thông báo tự động (AWS SES / Resend) và SMS Brandname.

---

## 6. LỘ TRÌNH KHUYẾN NGHỊ HÀNH ĐỘNG CỤ THỂ (ACTIONABLE ROADMAP)

Để chuyển đổi thành công Khổng Tử Nhí từ giải pháp lai ký sinh thành một Web App độc lập, an toàn và sẵn sàng mở rộng quy mô, lộ trình kỹ thuật được phân chia thành **4 giai đoạn ưu tiên rõ ràng** trong vòng 14 tuần:

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                           LỘ TRÌNH TÁI CẤU TRÚC WEB APP KHỔNG TỬ NHÍ                             │
├────────────────────┬────────────────────┬────────────────────────────┬───────────────────────────┤
│ GIAI ĐOẠN 1        │ GIAI ĐOẠN 2        │ GIAI ĐOẠN 3                │ GIAI ĐOẠN 4               │
│ (Tuần 1 - Tuần 2)  │ (Tuần 3 - Tuần 6)  │ (Tuần 7 - Tuần 10)         │ (Tuần 11 - Tuần 14)       │
│ Vá Khẩn Cấp        │ Xây Dựng BFF &     │ Tự Động Hóa Thanh Toán,    │ Chuẩn Hóa Frontend SPA &  │
│ Bảo Mật & Rò Rỉ    │ PostgreSQL RDBMS   │ WebSocket & Thông Báo      │ Bảo Mật DRM CDN Media     │
└────────────────────┴────────────────────┴────────────────────────────┴───────────────────────────┘
```

### 6.1. Giai đoạn 1: Vá khẩn cấp bảo mật & Cô lập rò rỉ (Hotfix khẩn cấp trong 2 tuần đầu)
*Mục tiêu:* Ngăn chặn ngay lập tức nguy cơ bị chiếm quyền quản trị và bảo vệ dữ liệu học sinh đang vận hành trên production.

1. **Khử mã độc rò rỉ tài khoản Root Admin:**
   - Đổi mật khẩu tài khoản `hocvienkhongtunhi123@gmail.com` trên izTeach.
   - Xóa bỏ ngay lập tức các đoạn code nhúng email và mật khẩu tại `index.html:2727`, `portal_template.html:2132` và `so-lien-lac-ux.js:11771`.
2. **Đóng lỗ hổng Auth Bypass qua URL:**
   - Xóa bỏ logic đọc query string `?ktn_user=` tại `so-lien-lac-auth.js:419–425`.
   - Vô hiệu hóa việc gán quyền `admin` tự động dựa trên chuỗi email trong `normalizeEmail`.
3. **Cô lập dữ liệu PII trong SEO Description:**
   - Xóa bỏ danh sách học sinh, đơn hàng và số điện thoại khỏi thuộc tính `description` của trang `ktn-sll-state` trên izTeach API `k90adfn1jk`.
4. **Vá lỗi thanh toán giả:**
   - Đổi giá trị mặc định của `paymentStatus` trong `index.html:670` thành `'unpaid'`. Đơn hàng chỉ được kích hoạt khi kế toán xác nhận số dư tài khoản.

---

### 6.2. Giai đoạn 2: Xây dựng Backend For Frontend (BFF) & Cơ sở dữ liệu PostgreSQL (Tuần 3 - Tuần 6)
*Mục tiêu:* Thiết lập hạ tầng máy chủ nội bộ độc lập, loại bỏ hoàn toàn việc lưu state vào trường SEO của CMS.

1. **Khởi tạo dịch vụ Backend For Frontend (NestJS / Node.js hoặc Go):**
   - Đóng vai trò Reverse Proxy an toàn đứng trước toàn bộ các API của izTeach và AWS S3.
   - Quản lý toàn bộ API secrets, Vendor ID và Service Account trong biến môi trường `.env`.
   - Cung cấp kiến trúc API RESTful chuẩn hóa `/api/v1/...` với Rate Limiting (Redis token bucket) và Circuit Breaker.
2. **Thiết kế & Triển khai Cơ sở dữ liệu PostgreSQL (với Prisma ORM):**
   - Xây dựng lược đồ dữ liệu quan hệ chuẩn hóa:
     * `users` (id, email, password_hash, full_name, phone, role, status, created_at)
     * `courses` & `units` (id, course_code, title, video_hls_url, doc_resources)
     * `classes` & `class_members` (id, class_code, teacher_id, student_id, schedule)
     * `assignments` & `homework_submissions` (id, unit_id, student_id, submission_files, mark, teacher_feedback, status)
     * `orders` (id, order_code, user_id, amount, payment_status, payment_method, gateway_trans_id)
   - Đảm bảo 100% các thao tác nộp bài, chấm bài, duyệt đơn được bao bọc trong Database Transaction với Optimistic Locking.
3. **Chuẩn hóa API Chấm bài:**
   - Cung cấp API `PATCH /api/v1/homework/:id/grade` để cập nhật trực tiếp điểm và nhận xét vào bản ghi nộp bài, chấm dứt việc gọi `POST` sinh trùng lặp bản ghi trên izTeach.

---

### 6.3. Giai đoạn 3: Tích hợp cổng thanh toán tự động, WebSocket & Thông báo đa kênh (Tuần 7 - Tuần 10)
*Mục tiêu:* Tự động hóa hoàn toàn luồng tài chính, khôi phục hệ thống trao đổi và thông báo theo thời gian thực.

1. **Tự động hóa Thanh toán VietQR qua Webhook:**
   - Tích hợp cổng thanh toán Open Banking (PayOS / SePay).
   - Khi phụ huynh quét mã VietQR chuyển tiền, máy chủ nhận Webhook từ ngân hàng, đối soát mã đơn `ORD-XXXXXX` và số tiền, tự động cập nhật đơn hàng thành `paid`.
   - Hệ thống tự động kích hoạt tài khoản học viên và cấp quyền khóa học New HSK 1 mà không cần can thiệp thủ công.
2. **Triển khai WebSocket Gateway cho Phòng Chat Lớp học:**
   - Thiết lập WebSocket Server (Socket.io) trên cụm BFF, xác thực token người dùng qua Cookie.
   - Hỗ trợ phòng chat theo lớp học (`room: classCode`), lưu trữ lịch sử tin nhắn vào PostgreSQL và đệm bằng Redis Cache.
   - Tích hợp bộ lọc DLP thông minh trên server (phát hiện và cảnh báo thông tin nhạy cảm phía backend trước khi lưu vào database).
3. **Xây dựng Trung tâm Thông báo Đa kênh (Omnichannel Notification Hub):**
   - Khôi phục Service Worker PWA và kích hoạt WebPush chuẩn VAPID.
   - Tích hợp dịch vụ gửi Email tự động (AWS SES / Resend): Tự động gửi thông tin tài khoản và mật khẩu cho phụ huynh ngay khi đơn hàng được thanh toán; gửi email thông báo khi giáo viên chấm bài xong.
   - Tích hợp SMS/ZNS Brandname nhắc lịch học và thông báo kết quả định kỳ.

---

### 6.4. Giai đoạn 4: Chuẩn hóa Frontend SPA, Bảo mật DRM CDN & Tối ưu hiệu năng (Tuần 11 - Tuần 14)
*Mục tiêu:* Xây dựng ứng dụng Web App hiện đại, bảo vệ toàn diện bản quyền tài sản số và tối ưu trải nghiệm người dùng.

1. **Tái cấu trúc Frontend thành Single Page Application (Next.js / React Vite):**
   - Chuyển đổi mã nguồn nguyên khối (`so-lien-lac-ux.js` 12.000 dòng, `portal_template.html` 4.300 dòng) thành các Component tái sử dụng độc lập (`CourseDashboard`, `VideoPlayer`, `HomeworkUploader`, `TeacherGradingTable`, `ClassroomChat`).
   - Sử dụng Zustand / TanStack Query quản lý state client và cache bất đồng bộ; loại bỏ hoàn toàn các lệnh nối chuỗi HTML thủ công `innerHTML`.
   - Xóa bỏ triệt để cơ chế Polling dồn dập 5 giây; chuyển sang nhận cập nhật qua WebSocket / Server-Sent Events (SSE).
2. **Bảo mật Bản quyền Video HLS & Tài liệu Giáo trình (DRM & Signed URLs):**
   - Cấu hình CloudFront Signed URLs / Signed Cookies: Các file PDF giáo trình (~170MB) và audio MP3 chỉ có thể truy cập qua URL ký có thời hạn sống tối đa 30 phút.
   - Chuyển toàn bộ ảnh bài làm và ghi âm giọng nói của học sinh vào S3 Private Bucket; chỉ cấp quyền xem thông qua Pre-signed URL cho giáo viên và phụ huynh trực tiếp quản lý học sinh đó.
   - Mã hóa bảo mật cho luồng phát video HLS m3u8 (AES-128 token authentication).
3. **Tối ưu Trình phát Video & Theo dõi Tiến độ Học tập Thực tế:**
   - Tích hợp trình phát Plyr.js / Video.js hiện đại, hiển thị đồng nhất trên iOS, Android và máy tính.
   - Lắng nghe sự kiện `timeupdate` và gửi heartbeat lên server: Lưu vết chính xác số phút học thực tế của học viên.
   - Khóa tiến độ: Học sinh chỉ được tích xanh hoàn thành bài học khi đã xem tối thiểu 80% thời lượng video VÀ bài tập nộp đã được giáo viên duyệt/chấm điểm đạt yêu cầu.

---

## 7. PHỤ LỤC THAM CHIẾU & ĐỐI SOÁT MÃ NGUỒN CODEBASE

### 7.1. Danh mục 15 tệp mã nguồn được trích dẫn và kiểm chứng

| # | Đường Dẫn Tệp Trong Codebase | Quy Mô | Vai Trò Nghiệp Vụ Trong Hệ Thống |
|---|---|---|---|
| 1 | `d:\Vibe\khongtunhi_sofl_style\index.html` | 4.773 dòng (374 KB) | Trang chủ tiếp thị, form đăng ký học thử, VietQR và đẩy order lên Cloud State. |
| 2 | `d:\Vibe\khongtunhi_sofl_style\portal_template.html` | 4.316 dòng (174 KB) | Template gốc Cổng học viên: Trình phát video HLS, tài liệu Mục 0, nộp bài S3. |
| 3 | `d:\Vibe\khongtunhi_sofl_style\demo_hsk1_student_portal.html` | 4.316 dòng (386 KB) | Bản build Cổng học viên inject dữ liệu bài học HSK 1 JSON. |
| 4 | `d:\Vibe\khongtunhi_sofl_style\build_clean_real_portal.js` | 40 dòng (2 KB) | Script NodeJS build Cổng học viên bằng cách nạp dữ liệu bài học vào template. |
| 5 | `d:\Vibe\khongtunhi_sofl_style\so-lien-lac.html` | 1.625 dòng (125 KB) | Shell giao diện chính Sổ liên lạc 3 vai trò (Admin, Giáo viên, Phụ huynh). |
| 6 | `d:\Vibe\khongtunhi_sofl_style\so-lien-lac-ux.js` | 12.387 dòng (622 KB) | Lõi JavaScript nguyên khối: DOM rendering, State, Duyệt đơn 1 chạm, Chấm bài, Cloud State. |
| 7 | `d:\Vibe\khongtunhi_sofl_style\so-lien-lac-lms.js` | 3.881 dòng (193 KB) | Thư viện phụ trợ LMS, lưu trữ subscription WebPush vào SEO description. |
| 8 | `d:\Vibe\khongtunhi_sofl_style\so-lien-lac-auth.js` | 546 dòng (28 KB) | Module xác thực, ma trận RBAC, lưu trữ session và điểm hở `?ktn_user=admin`. |
| 9 | `d:\Vibe\khongtunhi_sofl_style\so-lien-lac-server.cjs` | 1.321 dòng (60 KB) | Máy chủ NodeJS Gateway & WebSocket Server cục bộ (port 4173) lưu RAM. |
| 10| `d:\Vibe\khongtunhi_sofl_style\so-lien-lac-permissions.cjs` | 49 dòng (2 KB) | Helper phân định vai trò dựa trên email và roles. |
| 11| `d:\Vibe\khongtunhi_sofl_style\deploy_so_lien_lac_live.cjs` | 1.290 dòng (81 KB) | Script đóng gói HTML/CSS/JS inject vào CMS izTeach và chạy polling 5s. |
| 12| `d:\Vibe\khongtunhi_sofl_style\ktn_global_auth_hook.js` | 1 dòng (2 KB) | Script can thiệp XHR đăng nhập 2 cổng và unregister Service Worker. |
| 13| `d:\Vibe\khongtunhi_sofl_style\audit_sll_submission.cjs` | 243 dòng (14 KB) | Kịch bản kiểm thử tự động tái hiện 13 lỗi nghiệp vụ luồng nộp và chấm bài tập. |
| 14| `d:\Vibe\khongtunhi_sofl_style\IZTEACH_BACKEND_API_SPEC.md` | 647 dòng (47.7 KB) | Tài liệu đặc tả kỹ thuật 12 API izTeach và danh mục URL CloudFront CDN. |
| 15| `d:\Vibe\khongtunhi_sofl_style\KIEM-TRA-NOP-BAI-3-ROLE-2026-10-28.md` | 71 dòng (11 KB) | Báo cáo thực tế đối soát 3 vai trò và xác nhận lộ dữ liệu API bài tập. |

### 7.2. Danh mục 12 AWS API Gateway izTeach liên quan

| # | AWS API Gateway Subdomain | Endpoint Đường Dẫn | Giao Thức | Chức Năng Cốt Lõi Trong Hệ Thống |
|---|---|---|:---:|---|
| 1 | `fpdamf1645.execute-api.ap-southeast-1` | `/prod/student/signin`<br>`/prod/student` | POST<br>GET/POST | Đăng nhập tài khoản học viên; tra cứu và khởi tạo Cognito UUID học viên CRM. |
| 2 | `gcnj5paf1j.execute-api.ap-southeast-1` | `/prod/signin` | POST | Đăng nhập tài khoản giáo viên và quản trị viên (Root Admin). |
| 3 | `vs1ocpw7ri.execute-api.ap-southeast-1` | `/prod/user-permission`<br>`/prod/user-permission/add-products/{id}` | GET<br>PUT | Tra cứu quyền sản phẩm của học viên; cấp quyền khóa học trực tuyến New HSK 1. |
| 4 | `p9y4zl6vkd.execute-api.ap-southeast-1` | `/prod/course/layout`<br>`/prod/unit` | GET<br>GET | Tải cấu trúc bài giảng, video HLS và câu hỏi trắc nghiệm của 31 bài học. |
| 5 | `xx7swzlhyl.execute-api.ap-southeast-1` | `/prod/resource/signed-url`<br>`/prod/resource` | GET<br>POST | Tạo chữ ký S3 Presigned URL để upload file bài tập; đăng ký resource metadata. |
| 6 | `rt6i5wgkj4.execute-api.ap-southeast-1` | `/prod/homework`<br>`/prod/homework/filter` | POST<br>POST | Nộp bài tập học viên; tạo bản ghi bài tập đã chấm điểm (thay thế API PUT). |
| 7 | `tr8x5atpvd.execute-api.ap-southeast-1` | `/prod/homework` | GET | Truy vấn lịch sử bài tập của toàn bộ trung tâm (bị lộ dữ liệu PII công khai). |
| 8 | `k90adfn1jk.execute-api.ap-southeast-1` | `/prod/vendor-setting/{vendorId}` | GET/PUT | Bị lạm dụng làm Database đám mây (Cloud State JSON trong SEO description). |
| 9 | `c9xi8h3a3d.execute-api.ap-southeast-1` | `/prod/contact` | POST | Tiếp nhận thông tin lead đăng ký tư vấn từ trang chủ. |
| 10| `media.izteach.vn` | `/{vendorId}/{videoId}/playlist.m3u8` | HTTPS | Máy chủ phát luồng video bài giảng HLS m3u8 (công khai không DRM). |
| 11| `d21acfi38wn3iy.cloudfront.net` | `/resource/documents/...`<br>`/resource/homeworks/...` | HTTPS | CDN phân phối 5 cuốn giáo trình PDF (~170MB), 127 audio MP3 và ảnh bài tập. |
| 12| `s3.ap-southeast-1.amazonaws.com` | `/izteach-prod-sg` | PUT | S3 Bucket đích nhận tải lên trực tiếp các tệp bài tập từ trình duyệt client. |

---

## KẾT LUẬN KIỂM TOÁN
Báo cáo kiểm toán kỹ thuật độc lập khẳng định: Codebase Khổng Tử Nhí hiện tại đã xây dựng được các kịch bản trải nghiệm người dùng sinh động và hoàn thành tốt vai trò của một bản thử nghiệm (Proof-of-Concept / Prototype). Tuy nhiên, xét dưới các tiêu chuẩn khắt khe của một **Web App độc lập cấp Production**, hệ thống đang đối mặt với những lỗ hổng bảo mật nghiêm trọng (lộ tài khoản root admin, bypass xác thực qua URL) và sự đứt gãy mang tính cấu trúc (lạm dụng trường SEO làm database, thiếu vắng hoàn toàn Backend nội bộ, tê liệt hệ thống thông báo và chat live).

Việc thực thi quyết liệt **Lộ trình 4 giai đoạn** được đề xuất trong báo cáo này là điều kiện tiên quyết và bắt buộc để giải phóng Khổng Tử Nhí khỏi sự phụ thuộc vào izTeach, bảo vệ an toàn tuyệt đối dữ liệu người học và đưa hệ thống trở thành một nền tảng Web App giáo dục chuẩn mực, bền vững và sẵn sàng mở rộng quy mô thương mại.

---
*Bản quyền báo cáo thuộc về Nhóm Kiểm toán Kỹ thuật Độc lập (Teamwork Architecture Audit). Mọi số liệu, mã nguồn và kết luận được đối soát trực tiếp từ codebase `d:\Vibe\khongtunhi_sofl_style` và môi trường live production.*
