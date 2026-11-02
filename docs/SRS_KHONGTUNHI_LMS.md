# ĐẶC TẢ YÊU CẦU PHẦN MỀM (SRS)
## HỆ THỐNG SỔ LIÊN LẠC & QUẢN TRỊ ĐÀO TẠO THỜI GIAN THỰC — HỌC VIỆN KHỔNG TỬ NHÍ
### (Software Requirements Specification — IEEE 830 / ISO/IEC/IEEE 29148:2018 Compliant)

---

## 1. GIỚI THIỆU (INTRODUCTION)

### 1.1. Mục Đích Tài Liệu (Document Purpose)
Tài liệu Đặc tả Yêu cầu Phần mềm (SRS) này xác lập toàn bộ các yêu cầu chức năng (Functional Requirements), yêu cầu phi chức năng (Non-Functional Requirements), thiết kế luồng nghiệp vụ, ranh giới dữ liệu và giao thức tích hợp cho hệ thống Sổ Liên Lạc Điện Tử (SLL) và Cổng Quản Trị Đào Tạo của Học Viện Khổng Tử Nhí (`khongtunhi.com`). 
Tài liệu đóng vai trò là hợp đồng kỹ thuật và căn cứ nghiệm thu giữa Đội ngũ Phát triển, Đội ngũ Kiểm thử (QA/QC) và Ban Giám hiệu / Quản lý Trung tâm. Mục tiêu cốt lõi là chuẩn hóa toàn diện luồng nghiệp vụ, loại bỏ các lỗi suy thoái (regression risks) và giảm thiểu thời gian khắc phục sự cố (MTTR) trong vận hành thực tế.

### 1.2. Quy Ước Tài Liệu (Document Conventions)
- Tài liệu tuân thủ cấu trúc chuẩn **IEEE 830-1998** và **ISO/IEC/IEEE 29148:2018**.
- Các từ khóa chuẩn hóa tuân thủ theo **RFC 2119**:
  - **BẮT BUỘC (MUST / SHALL)**: Yêu cầu bắt buộc tuyệt đối phải tuân thủ để được nghiệm thu.
  - **KHÔNG ĐƯỢC PHÉP (MUST NOT)**: Hành vi hoặc triển khai bị cấm tuyệt đối.
  - **NÊN (SHOULD)**: Khuyến nghị thực hiện trừ khi có lý do kỹ thuật chính đáng.
  - **CÓ THỂ (MAY)**: Tính năng tùy chọn.
- Mã định danh yêu cầu:
  - `FR-xx.y`: Yêu cầu chức năng (Functional Requirement).
  - `NFR-xx.y`: Yêu cầu phi chức năng (Non-Functional Requirement).
  - `INT-xx.y`: Giao diện hệ thống & API (Interface Requirement).

### 1.3. Đối Tượng Độc Giả (Intended Audience)
- **Kỹ sư Phát triển (Frontend & Backend Engineers)**: Sử dụng làm hướng dẫn triển khai giao diện, cấu trúc state, kết nối REST API upstream và WebSocket Gateway.
- **Kỹ sư Kiểm thử (QA / Test Engineers)**: Sử dụng để lập ma trận kịch bản kiểm thử (Test Matrix), kiểm thử E2E và kiểm thử xâm nhập bảo mật (Penetration Testing).
- **Quản lý Học vụ & Quản trị viên Trung tâm**: Sử dụng để đối chiếu quy trình nghiệp vụ đào tạo thực tế tại các chi nhánh.

### 1.4. Phạm Vi Sản Phẩm (Product Scope)
Hệ thống bao gồm 4 phân hệ chính:
1. **Phân Hệ Sổ Quản Lý Admin (Admin Management Book)**: Trung tâm điều hành quản lý lớp học, phân công giáo viên, giám sát KPI đào tạo và kiểm soát an toàn dữ liệu học vụ.
2. **Phân Hệ Quản Lý Học Sinh izTeach (izTeach Student CRM & Multi-Tier Sync)**: Đồng bộ danh sách học sinh hai chiều trực tiếp với AWS REST API và Cloud State (`ktn-sll-state`), tích hợp bộ lọc trạng thái và chức năng Nhập/Xuất Excel/CSV.
3. **Phân Hệ Phòng Chat Realtime Theo Mã Lớp (Class-Code Realtime Chat Engine)**: Kênh trao đổi trực tuyến thời gian thực tự động khởi tạo theo mã lớp (`class:<classCode>`), kiểm soát phân quyền nghiêm ngặt, hỗ trợ đính kèm bài học và tích hợp bộ lọc DLP ngăn chặn rò rỉ thông tin cá nhân.
4. **Phân Hệ Giáo Viên & Học Sinh Tinh Gọn (Streamlined Teacher & Student Portals)**: Giao diện nộp bài tập đa phương tiện, trình chiếu media zoom, chấm điểm sư phạm và quản lý tiến độ khóa học trực quan.

### 1.5. Thuật Ngữ & Từ Viết Tắt (Definitions & Acronyms)
| Thuật ngữ / Viết tắt | Định nghĩa chi tiết |
| :--- | :--- |
| **SLL** | Sổ Liên Lạc Điện Tử (Electronic Contact Book & LMS Platform). |
| **LMS** | Learning Management System (Hệ thống Quản lý Học tập). |
| **KTN** | Học Viện Khổng Tử Nhí (Khong Tu Nhi Academy). |
| **RBAC** | Role-Based Access Control (Kiểm soát truy cập dựa trên vai trò). |
| **DLP** | Data Loss Prevention (Bảo vệ dữ liệu & phòng chống lôi kéo học riêng). |
| **Class Code** | Mã lớp học chuẩn hóa (VD: `YCT2-04`, `YCT3-02`, `PINYIN-01`). |
| **Cloud State** | Kho lưu trữ dữ liệu JSON ngầm được gắn vào SEO description của izTeach Vendor Setting (`ktn-sll-state`). |
| **Presigned URL** | Chữ ký số tạm thời của AWS S3 cho phép client tải tệp bài tập trực tiếp lên đám mây. |
| **BroadcastChannel** | API trình duyệt cho phép giao tiếp thời gian thực tức thì (0ms) giữa các tab cùng nguồn gốc (same-origin). |

---

## 2. MÔ TẢ TỔNG QUAN (OVERALL DESCRIPTION)

### 2.1. Bối Cảnh Sản Phẩm & Mô Hình Kiến Trúc (Product Perspective)
Hệ thống hoạt động dưới hình thức ứng dụng đơn trang (Single Page Application - SPA) đa nền tảng, tích hợp với hệ thống máy chủ Node.js Gateway cục bộ và các dịch vụ đám mây AWS serverless của izTeach:

```
[ BROWSER CLIENTS ]
 ├── Admin Portal (view-admin)
 ├── Teacher Portal (view-teacher)
 └── Student Portal (view-parent)
        │
        ├──────────────────────────────────────────────────────┐
        ▼ (Local Fast-Path / Same-Origin)                     ▼ (Realtime WebSocket)
 ┌──────────────────────────────────────┐             ┌──────────────────────────────────┐
 │  NODE.JS GATEWAY SERVER              │             │  WS CHAT ENGINE (/ws/chat)       │
 │  (so-lien-lac-server.cjs:4173)       │             │  - Room Pub/Sub (class:<code>)   │
 │  - Session Auth Guard (HttpOnly)     │             │  - DLP Pre-flight Guard          │
 │  - Static Files & Media Streaming    │             │  - BroadcastChannel Bridge       │
 └──────────────────┬───────────────────┘             └────────────────┬─────────────────┘
                    │                                                  │
                    ▼ (Upstream HTTPS Proxy)                           ▼ (Cloud State Storage)
 ┌───────────────────────────────────────────────────────────────────────────────────────┐
 │                                AWS API GATEWAY & IZTEACH BACKEND                      │
 │  - Staff Auth: gcnj5paf1j.execute-api.../signin                                       │
 │  - Student CRM: fpdamf1645.execute-api.../student (1,038+ học viên thật)              │
 │  - Cloud State Store: k90adfn1jk.execute-api.../vendor-setting/:vendorId               │
 │  - Online Courses Permission: vs1ocpw7ri.execute-api.../user-permission/add-products │
 │  - S3 Presigned URL & Resource: xx7swzlhyl.execute-api.../signed-url                  │
 │  - S3 Storage & CloudFront CDN: d21acfi38wn3iy.cloudfront.net                         │
 └───────────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Tác Nhân Hệ Thống (User Classes & Characteristics)

| Tác nhân (Actor) | Trình độ kỹ thuật | Quyền hạn và Trách nhiệm chính |
| :--- | :--- | :--- |
| **Quản trị viên Trung tâm (Root Admin / Academic Manager)** | Trung bình | Toàn quyền quản trị: giám sát 5 chỉ số KPI, mở lớp học mới, phân công giáo viên, gán học viên vào lớp, đồng bộ CRM izTeach, nhập/xuất danh sách Excel, giám sát an toàn thông tin DLP toàn hệ thống. |
| **Giáo viên Chủ nhiệm (Class Teacher)** | Cơ bản | Quản trị học vụ các lớp được phân công: giao bài học theo buổi, xem bài tập nộp (ảnh/video), chấm điểm và viết nhận xét sư phạm, quản trị trao đổi trong phòng chat lớp học. |
| **Học sinh & Phụ huynh (Student & Parent)** | Cơ bản (Phụ huynh kèm trẻ 4-15 tuổi) | Theo dõi lịch học và tiến độ 25 buổi, nộp bài tập đa phương tiện (ảnh chụp vở viết, video đọc bài), trao đổi trong phòng chat lớp, tham gia 6 khóa học video trực tuyến. |

### 2.3. Môi Trường Vận Hành (Operating Environment)
- **Client Runtime**: Các trình duyệt tiêu chuẩn hiện đại hỗ trợ ECMAScript 2020+ (Google Chrome 100+, Apple Safari 15+, Microsoft Edge 100+, Mozilla Firefox 100+; Trình duyệt di động iOS Safari & Android Chrome).
- **Gateway Server**: Node.js v18.0.0 LTS trở lên (yêu cầu module `ws` cho realtime chat).
- **Mạng truyền dẫn**: Băng thông khuyến nghị tối thiểu 2 Mbps (tối ưu hóa cho truyền tải video mp4 và nộp ảnh bài tập).

### 2.4. Ràng Buộc Thiết Kế & Thực Thi (Design Constraints)
- **Tính Độc Lập Của Form Admin**: Form của phân hệ Admin PHẢI ĐƯỢC xây dựng hoàn toàn độc lập dưới dạng Modal/Drawer chuyên biệt; KHÔNG ĐƯỢC sao chép, chia sẻ hoặc dùng chung cấu trúc form với trang Giáo viên hay Học sinh.
- **Loại Bỏ Hoàn Toàn Phần Tử Thừa**: KHÔNG ĐƯỢC để tồn tại các thanh điều hướng demo, nút test giả lập DLP (`btn-sim-*`), hoặc các trường input sửa inline vụn vặt trong các ô bảng.
- **Động Cơ Chat Native Thời Gian Thực**: Chat PHẢI ĐƯỢC chạy native qua WebSocket Node.js và `BroadcastChannel`; KHÔNG ĐƯỢC phụ thuộc vào API hoặc SDK bên thứ ba như Zalo Chat SDK hay Firebase.
- **An Toàn Bí Mật Tuyệt Đối**: KHÔNG ĐƯỢC hardcode bất kỳ API key, token bí mật hay mật khẩu nào trong mã nguồn giao diện client; cookie phiên làm việc bắt buộc có cờ `HttpOnly` và `SameSite=Strict`.

---

## 3. CÁC YÊU CẦU CHỨC NĂNG CHI TIẾT (FUNCTIONAL REQUIREMENTS)

### 3.1. FR-01: Phân Hệ Sổ Quản Lý Admin (Admin Management Book)

#### FR-01.1: Bảng Điều Khiển Tổng Quan (Executive KPI Dashboard)
- **Mô tả**: Khi Admin truy cập hệ thống, giao diện PHẢI hiển thị dải 5 thẻ chỉ số đo lường hiệu suất (KPI Cards Strip) ở vị trí cố định trên cùng:
  1. *Quy mô Lớp học*: Tổng số lớp đang mở và trạng thái vận hành.
  2. *Học viên Kích hoạt*: Tổng số học viên trên hệ thống (phân tách học viên Sổ Liên Lạc vs. Khóa Online).
  3. *Tỷ lệ Nộp bài*: Tỷ lệ phần trăm (%) học sinh nộp bài tập đúng hạn trong 7 ngày gần nhất.
  4. *Hàng đợi Chấm bài*: Số lượng bài tập học sinh đã nộp đang chờ giáo viên chấm điểm.
  5. *Cảnh báo An toàn (DLP)*: Số lượng vi phạm an toàn thông tin chưa được xử lý.
- **Dữ liệu đầu vào**: Trạng thái hệ thống tổng hợp từ `state.classes`, `state.students`, `state.homeworks`, `state.dlpAlerts`.
- **Hành vi khi có cập nhật**: Các thẻ KPI PHẢI tự động cập nhật lại số liệu ngay lập tức khi có sự kiện nộp bài, chấm điểm, hoặc mở lớp mới mà không cần tải lại toàn bộ trang.

#### FR-01.2: Kiến Trúc Bố Cục Độc Lập & Thanh Điều Hướng Tab
- **Mô tả**: Bố cục Admin PHẢI ĐƯỢC tách biệt thành container chuyên biệt (`#admin-container`), độc lập hoàn toàn với `parent-container`. Thanh điều hướng tab gồm:
  - Tab 1: `🏢 Quản lý Lớp học & Đào tạo` (Overview & Classes).
  - Tab 2: `👨‍🎓 Quản lý Học sinh (izTeach CRM)` (Student CRM Grid).
  - Tab 3: `👩‍🏫 Quản lý Giáo viên` (Teacher Assignments).
  - Tab 4: `🛡️ Giám sát An toàn & DLP` (Security Infractions Audit).

#### FR-01.3: Form Mở Lớp Học Mới Độc Lập (Class Provisioning Drawer)
- **Mô tả**: Thao tác mở lớp mới PHẢI mở qua một Modal/Drawer độc lập (`#admin-modal-new-class`), KHÔNG ĐƯỢC chèn form tạm thời vào dòng bảng.
- **Các trường dữ liệu**:
  - `classCode`: Mã lớp học (Bắt buộc, chữ in hoa, ví dụ: `YCT2-04`). Tự động chuẩn hóa viết hoa và loại bỏ khoảng trắng.
  - `courseTitle`: Tên khóa học (Bắt buộc, chọn từ danh mục chuẩn hoặc nhập tự do).
  - `schedule`: Lịch học trong tuần (Bắt buộc, ví dụ: `"Thứ 3 & Thứ 6 (19:30 - 20:30)"`).
  - `totalLessons`: Tổng số buổi học của khóa (Mặc định 25, khoảng cho phép: 10 đến 60).
  - `teacherId`: Giáo viên chủ nhiệm phân công (Dropdown chọn từ danh sách giáo viên đang hoạt động).
  - `enableChat`: Checkbox tự động kích hoạt phòng chat thời gian thực cho lớp (Mặc định được tích chọn).
- **Xác thực**:
  - Kiểm tra trùng lặp `classCode`. Nếu trùng, báo lỗi Toast cảnh báo và không ghi đè dữ liệu.
  - Khi tạo thành công: Tự động khởi tạo kênh chat `class:<classCode>`, cập nhật bảng lớp học, đẩy dữ liệu vào Cloud State và hiển thị thông báo thành công.

#### FR-01.4: Phân Bổ Học Sinh & Quản Trị Danh Sách Lớp
- **Mô tả**: Thao tác thêm học sinh vào lớp được thực hiện qua Modal phân lớp độc lập (`#admin-modal-assign-student`), cung cấp 2 chế độ:
  1. *Gán học viên có sẵn*: Ô tìm kiếm nhanh học sinh từ danh sách izTeach -> Chọn lớp đích -> Xác nhận.
  2. *Thêm nhanh học sinh mới*: Họ tên, Email/Tài khoản, Số điện thoại, Buổi học bắt đầu (mặc định 1), Gán lớp ngay và tự động mở khóa học trực tuyến.
- **Loại bỏ**: Tuyệt đối KHÔNG sử dụng các trường input inline nằm rải rác bên trong từng dòng bảng con của lớp học.

#### FR-01.5: Dọn Dẹp Yếu Tố Thừa Thãi (Clutter Elimination)
- **Mô tả**: Loại bỏ triệt để các phần tử thừa khỏi mã HTML và DOM hiển thị:
  - Loại bỏ hoàn toàn thanh thông báo demo (`#demo-auth-bar`).
  - Loại bỏ các nút test giả lập DLP (`#btn-sim-phone`, `#btn-sim-poach`, `#btn-sim-qr`, `#btn-sim-reset`).
  - Loại bỏ bộ tab đổi vai trò công khai trên header (`#header-role-switcher-wrap`).
  - Rút gọn toàn bộ các văn bản hướng dẫn rườm rà trong các nhãn form thành placeholder ngắn gọn và tooltip ngữ cảnh.

---

### 3.2. FR-02: Phân Hệ Quản Lý Học Sinh izTeach (izTeach Student CRM & Multi-Tier Sync)

#### FR-02.1: Bảng Quản Lý Học Sinh Chuẩn izTeach (7-Column Table Grid)
- **Mô tả**: Bảng danh sách học sinh PHẢI tái hiện đầy đủ cấu trúc giao diện chuẩn của hệ thống izTeach Admin (`khongtunhi.admin.izteach.vn/students`), bao gồm 7 cột dữ liệu:
  1. **Ô Chọn (Checkbox)**: Cho phép chọn từng dòng hoặc chọn tất cả (`Select All`) để thực hiện tác vụ hàng loạt.
  2. **Họ và tên học viên**: Căn trái, in đậm họ tên, nhấp vào để mở Drawer xem chi tiết hồ sơ.
  3. **Email**: Căn trái, hiển thị địa chỉ Gmail hoặc email tên miền Khổng Tử Nhí.
  4. **Số điện thoại**: Căn trái, chuẩn hóa số điện thoại 10 chữ số Việt Nam.
  5. **Ngày tạo**: Căn trái, định dạng chuẩn `HH:mm - DD/MM/YYYY`.
  6. **Tự đăng ký**: Căn giữa. Nếu học sinh tự đăng ký từ web, hiển thị huy hiệu:
     - Xanh lá: "Đã kích hoạt" (`verified`).
     - Cam: "Chưa kích hoạt" (`unverified`), nhấp vào kích hoạt nhanh.
  7. **Trạng thái**: Căn giữa.
     - Nếu tài khoản bị khóa (`isBlock === true`): Hiển thị icon ổ khóa kèm nhãn "Đang bị khoá".
     - Nếu hoạt động bình thường: Để trống trang nhã, không hiển thị chữ thừa.
  8. **Thao tác (Action ⋮)**: Nút menu ngữ cảnh 3 chấm dọc cung cấp các tác vụ:
     - *Chỉnh sửa*: Mở Drawer cập nhật thông tin học viên.
     - *Khoá / Mở khoá*: Hộp thoại xác nhận đổi trạng thái `isBlock`.
     - *Kích hoạt*: Kích hoạt nhanh tài khoản chưa xác minh.
     - *Xoá học viên*: Xác nhận xoá bản ghi khỏi hệ thống.

#### FR-02.2: Thanh 3-Tab Lọc Trạng Thái Nhanh (TabFilter Bar)
- **Mô tả**: Nằm trực tiếp dưới tiêu đề phân hệ, gồm 3 tab độc quyền:
  1. `TẤT CẢ` (Mặc định): Hiển thị toàn bộ học sinh không phân biệt trạng thái.
  2. `CHƯA KÍCH HOẠT`: Lọc các học sinh có `state === 'unverified'`.
  3. `ĐANG BỊ KHOÁ`: Lọc các học sinh có `isBlock === true`.
- **Hành vi**: Chuyển đổi giữa các tab PHẢI thực hiện lọc tức thì (< 50ms) trên tập dữ liệu đã tải trong bộ nhớ đệm và hỗ trợ phân trang máy chủ khi truy vấn trực tiếp API.

#### FR-02.3: Công Cụ Tìm Kiếm & Lọc Nâng Cao (Search & Filter Toolbar)
- **Mô tả**:
  - **Ô tìm kiếm từ khóa**: Tìm kiếm tức thì với cơ chế debounce 300ms. Thuật toán PHẢI chuẩn hóa loại bỏ dấu tiếng Việt (`clearUnicode` / `foldText`) để tìm kiếm đồng nhất theo: Họ tên, Email, Số điện thoại và Mã học viên.
  - **Nút "Bộ lọc ▾"**: Cho phép mở rộng tiêu chí lọc: theo Lớp học (`classCode`), theo Nhóm học viên (`group`), theo Khoảng ngày tạo (`fromDate` đến `toDate`).

#### FR-02.4: Nhập & Xuất Dữ Liệu Excel / CSV (Import & Export Protocols)
- **Tải file mẫu (Download Template)**:
  - Cung cấp file mẫu `template-list-student.xlsx` chuẩn gồm 5 cột: `Họ và tên học viên`, `Email`, `Mật khẩu`, `Ngày sinh`, `Số điện thoại`.
- **Quy trình nhập dữ liệu (Import)**:
  - Kiểm tra tính hợp lệ của tệp (chỉ chấp nhận `.xlsx`, `.xls`, dung lượng < 5MB).
  - Hiển thị thanh tiến trình xử lý (`ProgressBar`) theo tỷ lệ phần trăm (%).
  - Tự động mã hóa mật khẩu sang Base64 và gọi API `POST /student` nạp dữ liệu tuần tự.
  - Hiển thị báo cáo kết thúc: Số bản ghi thành công và danh sách các dòng lỗi kèm lý do cụ thể.
- **Quy trình xuất dữ liệu (Export)**:
  - Xuất dữ liệu ra file `export-list-student-DD-MM-YYYY.xlsx` bảo toàn các trường theo kết quả lọc hiện tại.

#### FR-02.5: Giao Thức Đồng Bộ Dữ Liệu 3 Tầng (3-Tier Sync Protocol)
- **Tầng 1 (Live REST API Sync)**: Khi người dùng là Admin có Token hợp lệ, hệ thống gọi trực tiếp AWS izTeach API `GET /student?vendorId=3529cd2b-7af6-4fda-887c-392a79393d6a` để tải danh sách 1,038+ học viên thật.
- **Tầng 2 (Cloud State Fallback)**: Khi API upstream tạm thời quá tải hoặc gặp sự cố, hệ thống tự động đọc/ghi dữ liệu từ snapshot `ktn-sll-state` lưu trong AWS Vendor Setting.
- **Tầng 3 (Local Storage Resilience)**: Khi mất kết nối mạng hoàn toàn, mọi thao tác tạo mới/sửa đổi được lưu tạm vào `localStorage` kèm cờ `pendingSync`. Khi có mạng trở lại, tiến trình chạy ngầm tự động đẩy các thay đổi lên Cloud.

#### FR-02.6: Cấp Quyền Gói 6 Khóa Học Video Online
- **Mô tả**: Tích hợp nút tác vụ gán quyền 6 khóa học YCT trực tuyến bản quyền cho học viên qua API `PUT /user-permission/add-products/:userId`.

---

### 3.3. FR-03: Phân Hệ Phòng Chat Realtime Theo Mã Lớp & DLP (Realtime Class-Code Chat Engine)

#### FR-03.1: Cơ Chế Tự Động Khởi Tạo Kênh Chat (Auto-Provisioning)
- **Mô tả**: Mỗi khi một lớp học tồn tại trong hệ thống (VD: `YCT2-04`, `YCT3-02`), máy chủ và client PHẢI tự động khởi tạo và liên kết một định danh phòng chat tương ứng:
  $$\text{RoomId} = \text{class:} + \text{classCode} \quad (\text{VD: } \texttt{class:YCT2-04})$$
- Tuyệt đối KHÔNG yêu cầu giáo viên hoặc học sinh phải tạo nhóm chat thủ công.

#### FR-03.2: Kiểm Soát Phân Quyền Truy Cập Nghiêm Ngặt (Strict Room RBAC)
- **Mô tả**: Quyền tham gia và tương tác trong phòng chat PHẢI ĐƯỢC kiểm soát chặt chẽ cả ở Client và Server:
  - **Giáo viên**: Chỉ được quyền truy cập phòng chat của những lớp mà mình được phân công phụ trách (`teacher.code === class.teacherCode`).
  - **Học sinh**: Chỉ được quyền truy cập phòng chat của lớp mà mình được xếp vào (`student.classCode === class.id`).
  - **Quản trị viên (Admin)**: Có quyền giám sát, đọc và xử lý vi phạm trong tất cả các phòng chat.
  - **Ranh giới an toàn**: Học sinh lớp này KHÔNG ĐƯỢC PHÉP nhìn thấy hoặc gửi tin vào phòng chat của lớp khác (Server phản hồi `403 FORBIDDEN` nếu có yêu cầu trái phép).

#### FR-03.3: Hạ Tầng Thời Gian Thực Đa Kênh (Multi-Transport Realtime Engine)
- **Mô tả**:
  - **WebSocket Gateway (`/ws/chat`)**: Máy chủ Node.js Gateway duy trì kết nối hai chiều liên tục với client. Độ trễ phát tin (dispatch latency) PHẢI đạt < 100ms.
  - **BroadcastChannel Client-Side Bridge**: Kích hoạt `new BroadcastChannel('ktn_class_chat_' + classCode)` để đồng bộ tin nhắn tức thì (0ms latency) giữa các tab trình duyệt mở song song của cùng một người dùng.
  - **Dự phòng (Fallback)**: Tự động chuyển đổi sang HTTP Long-Polling hoặc Server-Sent Events khi mạng khách hàng chặn kết nối WebSocket.

#### FR-03.4: Cấu Trúc Dữ Liệu Tin Nhắn Đa Phương Tiện (Rich Message Schema)
- **Mô tả**: Tin nhắn trong phòng chat hỗ trợ đầy đủ các loại hình nội dung học tập:
  1. *Tin nhắn văn bản*: Văn bản tiếng Việt/tiếng Trung có dấu, xuống dòng, emoji.
  2. *Thẻ Bài Học (Lesson Card)*: Hiển thị số buổi, tựa đề bài học, tài liệu đính kèm kèm nút tải/xem nhanh.
  3. *Tệp Đính Kèm Bài Tập (Homework Attachment)*: Hỗ trợ ảnh chụp bài viết (`.jpg`, `.png`), video phát âm (`.mp4`), tài liệu PDF lưu trữ trên AWS S3 / CloudFront CDN với trình xem phóng to (Media Zoom Lightbox) tích hợp.
  4. *Thông Báo Ghim (Pinned Classroom Announcement)*: Dải banner ghim trên đầu phòng chat hiển thị lịch học hoặc bài tập trọng tâm.

#### FR-03.5: Bộ Lọc An Toàn Dữ Liệu Tự Động (DLP Pre-Flight Safety Filter)
- **Mô tả**: Trước khi bất kỳ tin nhắn nào được gửi ra ngoài qua WebSocket, nội dung PHẢI ĐƯỢC quét tự động qua bộ lọc `window.KTN_DLP.inspect()`:
  - Tự động phát hiện và chặn: Số điện thoại dạng số (`09...`), số điện thoại viết bằng chữ tiếng Việt (VD: *"không chín bảy..."*), từ khóa kéo học riêng ngoài trung tâm, tài khoản Zalo cá nhân, link độc hại bên ngoài.
  - Nếu phát hiện vi phạm: Hệ thống chặn gửi tin nhắn ngay tại client, cảnh báo người gửi, đồng thời tự động ghi nhận một bản ghi vi phạm vào phân hệ `🛡️ Giám sát An toàn & DLP` của Admin.

---

### 3.4. FR-04: Phân Hệ Giáo Viên & Học Sinh Tinh Gọn (Streamlined Teacher & Student Portals)

#### FR-04.1: Tinh Chỉnh Cổng Giáo Viên (Teacher Portal Refinement)
- **Mô tả**:
  - Dải chọn lớp học nhanh dạng nút bấm (Class Pills) cho phép giáo viên chuyển đổi tức thời giữa các lớp phụ trách.
  - Trình chấm điểm bài tập độc lập:
    - Xem video bài làm hoặc ảnh bài tập của học sinh với trình phát và bộ công cụ phóng to/xoay chiều (Media Zoom Lightbox).
    - Form chấm điểm chuyên nghiệp: Thang điểm 1 đến 10 (bước 0.5), dropdown chọn nhanh mẫu nhận xét sư phạm giàu tính khích lệ, textarea nhận xét chi tiết.
  - Tích hợp tab phòng chat lớp học trực tiếp trong không gian làm việc của giáo viên.

#### FR-04.2: Tinh Chỉnh Cổng Học Sinh & Phụ Huynh (Student Portal Refinement)
- **Mô tả**:
  - Thanh thông tin lớp học (Class Header): Hiển thị ảnh giáo viên chủ nhiệm, mã lớp, buổi học hiện tại và lịch học trong tuần.
  - Dải buổi học tương tác (Lesson Strip): Thanh cuộn ngang 25 buổi học có mã màu trạng thái trực quan (*Xanh lá = Đã chấm điểm; Vàng cam = Đang chờ cô chấm; Xám = Buổi học sắp tới*).
  - Form nộp bài tập đa phương tiện: Chọn video/ảnh từ máy, xem trước tức thì và tải lên AWS S3 với thanh tiến trình trực quan (`upload-progress`).
  - Tích hợp tab phòng chat lớp học và khu vực 6 khóa học video trực tuyến (Courses Hub).

---

## 4. CÁC YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

### 4.1. NFR-01: Hiệu Năng & Độ Trễ (Performance & Latency)
- **NFR-01.1**: Thời gian tải trang ban đầu (First Contentful Paint - FCP) PHẢI đạt dưới **1.2 giây**; Thời gian sẵn sàng tương tác (Time to Interactive - TTI) PHẢI đạt dưới **1.8 giây** trên mạng 4G tiêu chuẩn.
- **NFR-01.2**: Độ trễ phát tin nhắn thời gian thực trong phòng chat qua WebSocket PHẢI đạt dưới **100ms**; qua BroadcastChannel giữa các tab cùng trình duyệt đạt **dưới 10ms (0ms lý tưởng)**.
- **NFR-01.3**: Tốc độ tìm kiếm và lọc dữ liệu học sinh trong danh sách 1,000+ bản ghi PHẢI phản hồi ngay lập tức dưới **50ms**.
- **NFR-01.4**: Tốc độ nhập dữ liệu hàng loạt từ Excel đạt tối thiểu **100 bản ghi/phút**.

### 4.2. NFR-02: Bảo Mật, Xác Thực & Phân Quyền (Security & RBAC)
- **NFR-02.1**: Toàn bộ phiên làm việc của người dùng PHẢI ĐƯỢC duy trì qua Cookie máy chủ `ktn_sll_session` thiết lập đầy đủ các cờ `HttpOnly`, `SameSite=Strict` và `Secure` (khi chạy HTTPS).
- **NFR-02.2**: Mật khẩu người dùng trước khi gửi lên API upstream izTeach bắt buộc được mã hóa chuẩn hóa Base64 (`btoa(pwd)`); tuyệt đối không log mật khẩu dạng plain text vào console hoặc file log hệ thống.
- **NFR-02.3**: Toàn bộ nội dung tin nhắn chat và nhận xét bài tập PHẢI ĐƯỢC làm sạch (Sanitize) để triệt tiêu hoàn toàn nguy cơ tấn công XSS (Cross-Site Scripting) và Injection.
- **NFR-02.4**: Kiểm tra phân quyền truy cập phòng chat đa tầng cả ở Client UI và WebSocket Handshake/Event Handler.

### 4.3. NFR-03: Toàn Vẹn Dữ Liệu & Khả Năng Phục Hồi (Data Integrity & Resilience)
- **NFR-03.1**: Thuật toán hợp nhất dữ liệu hai chiều (`_mergeCloudAndLocalState`) PHẢI sử dụng dấu thời gian `_updatedAt` (ISO 8601) để so sánh và giải quyết xung đột dữ liệu.
- **NFR-03.2**: Trong trường hợp xảy ra xung đột trạng thái bài tập, hệ thống bắt buộc ưu tiên giữ trạng thái giai đoạn cuối (VD: bài tập đã có điểm `GRADED` không bao giờ bị ghi đè ngược về `PENDING`).
- **NFR-03.3**: Hệ thống duy trì cơ chế lưu trữ bền vững tại `localStorage` (`ktn_connect_clean_v10_noclasses`) để đảm bảo người dùng không bị mất dữ liệu ngay cả khi đột ngột mất kết nối Internet.

### 4.4. NFR-04: Tính Khả Dụng & Thiết Kế Gọn Gàng (Usability & Clean UI)
- **NFR-04.1**: Giao diện tuân thủ bảng mã màu nhận diện thương hiệu Khổng Tử Nhí: Màu đỏ chủ đạo (`--primary: #CB3D30`), Xanh dương hoàng gia (`--secondary: #1A56DB`), Slate tối (`#0F172A`), Nền xám nhạt (`#F8FAFC`).
- **NFR-04.2**: Giao diện tương thích hoàn hảo và tự động co giãn tối ưu trên cả 3 chuẩn thiết bị: Desktop (1366x768, 1920x1080), Tablet (768x1024, iPad), Mobile (360px - 430px, iOS Safari / Android Chrome).
- **NFR-04.3**: Độ tương phản màu sắc đáp ứng tiêu chuẩn tiếp cận Web **WCAG 2.1 Level AA**.
- **NFR-04.4**: Loại bỏ 100% các nút bấm vô tác dụng, các trường dữ liệu thừa và văn bản giải thích dài dòng gây rối mắt.

---

## 5. ĐẶC TẢ GIAO DIỆN HỆ THỐNG & API (SYSTEM INTERFACES)

### 5.1. Danh Mục REST API AWS / izTeach Upstream

| Endpoint & URL | Phương thức | Xác thực | Tham số / Payload | Mô tả chức năng |
| :--- | :---: | :--- | :--- | :--- |
| `https://gcnj5paf1j.execute-api.ap-southeast-1.amazonaws.com/prod/signin` | `POST` | Public | `{"email": "...", "password": "<btoa>", "vendorId": "<vendorId>"}` | Đăng nhập cán bộ/giáo viên/admin; trả về JWT token và roles. |
| `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/signin` | `POST` | Public | `{"email": "...", "password": "<btoa>", "vendorId": "<vendorId>"}` | Đăng nhập học sinh; trả về student token và studentId. |
| `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student` | `GET` | Bearer Admin | Query: `?vendorId=<vendorId>&_limit=100&_skip=0` | Truy vấn danh sách 1,038+ học viên từ CRM izTeach. |
| `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student` | `POST` | Bearer Admin | `{"vendorId": "...", "name": "...", "email": "...", "phone": "...", "password": "<btoa>", "status": "verified"}` | Tạo mới hồ sơ học viên vào CRM izTeach. |
| `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/:id` | `PUT` | Bearer Admin | `{"isBlock": true \| false}` hoặc `{"name": "...", "phone": "..."}` | Cập nhật hồ sơ hoặc khóa/mở khóa tài khoản học viên. |
| `https://fpdamf1645.execute-api.ap-southeast-1.amazonaws.com/prod/student/:id` | `DELETE` | Bearer Admin | Path param `:id` | Xóa học viên khỏi hệ thống. |
| `https://vs1ocpw7ri.execute-api.ap-southeast-1.amazonaws.com/prod/user-permission/add-products/:userId` | `PUT` | Bearer Admin | `{"vendorId": "...", "userId": "...", "productIds": [...], "productType": "online-course"}` | Cấp quyền truy cập 6 khóa học trực tuyến YCT cho học viên. |
| `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod/vendor-setting/:vendorId` | `GET / PUT`| Bearer Admin | Body: Đối tượng `vs.learn.themeConfig.seo.otherPage['ktn-sll-state']` | Đọc và ghi Cloud Key-Value State của trung tâm Khổng Tử Nhí. |
| `https://xx7swzlhyl.execute-api.ap-southeast-1.amazonaws.com/prod/resource/signed-url` | `GET` | Bearer Token | Query: `?fileName=...&mimeType=...` | Tạo Presigned URL cho phép tải tệp bài tập trực tiếp lên S3. |

### 5.2. Lược Đồ Dữ Liệu Cloud State Schema (`ktn-sll-state` v10)
Cấu trúc JSON lưu trữ tại `vendor-setting`:

```json
{
  "_schemaVersion": 10,
  "_updatedAt": "2026-10-29T05:30:00.000Z",
  "classes": [
    {
      "id": "YCT2-04",
      "title": "Lớp YCT 2 - Khóa 04",
      "teacherId": "staff-teacher-08",
      "teacherName": "Cô Lâm Mỹ Linh",
      "schedule": "Thứ 3 & Thứ 6 (19:30 - 20:30)",
      "totalLessons": 25,
      "currentLesson": 18,
      "studentIds": ["stu-001", "stu-002", "stu-003"],
      "chatRoomId": "class:YCT2-04"
    }
  ],
  "studentEntitlements": {
    "stu-001": {
      "classCode": "YCT2-04",
      "hasLiveClass": true,
      "hasOnlineCourses": true,
      "courseIds": ["c1", "c2", "c3", "c4", "c5", "c6"]
    }
  },
  "homeworks": [
    {
      "id": "hw-18-stu-001",
      "classCode": "YCT2-04",
      "lessonNumber": 18,
      "studentId": "stu-001",
      "studentName": "Bé Lê Hoàng Ngân",
      "videoUrl": "https://d21acfi38wn3iy.cloudfront.net/.../hw_18.mp4",
      "imageUrl": "https://d21acfi38wn3iy.cloudfront.net/.../vo_viet_18.jpg",
      "submittedAt": "2026-10-28T14:20:00.000Z",
      "status": "GRADED",
      "score": 9.5,
      "feedback": "Con phát âm thanh 4 rất chuẩn, nét chữ Hán đều và đẹp!",
      "gradedAt": "2026-10-28T16:00:00.000Z"
    }
  ],
  "classMessages": {
    "class:YCT2-04": [
      {
        "id": "msg_001",
        "senderId": "staff-teacher-08",
        "senderName": "Cô Lâm Mỹ Linh",
        "senderRole": "teacher",
        "timestamp": "2026-10-29T05:00:00.000Z",
        "text": "Các con chuẩn bị ôn bài 18 nhé!",
        "attachment": null
      }
    ]
  },
  "dlpAlerts": []
}
```

### 5.3. Giao Thức Kết Nối & Khung Tin Nhắn Realtime WebSocket (`/ws/chat`)

#### 5.3.1. Các Sự Kiện WebSocket (Client ↔ Server)
```typescript
type WsEventType = 
  | 'auth'             // Client gửi token xác thực khi mở kết nối
  | 'join_room'        // Client yêu cầu vào phòng 'class:<classCode>'
  | 'leave_room'       // Client rời phòng
  | 'chat_message'     // Client gửi tin nhắn vào phòng
  | 'broadcast_message'// Server phát tin nhắn đến các thành viên trong phòng
  | 'ack'              // Server phản hồi xác nhận tin đã nhận
  | 'error';           // Server báo lỗi (403, 400, DLP_BLOCKED)
```

#### 5.3.2. Cấu Trúc Khung Tin Nhắn Chat Payload
```typescript
interface ClassChatMessagePayload {
  id: string;                      // 'msg_' + timestamp + random
  classCode: string;               // 'YCT2-04'
  roomId: string;                  // 'class:YCT2-04'
  senderId: string;                // User ID / Student ID
  senderName: string;              // 'Cô Lâm Mỹ Linh' hoặc 'Mẹ Bé Hoàng Ngân'
  senderRole: 'teacher' | 'student' | 'admin';
  timestamp: string;               // ISO 8601
  text: string;                    // Nội dung tin nhắn văn bản
  attachment?: {
    type: 'lesson' | 'homework' | 'image' | 'document';
    lessonNumber?: number;
    title: string;
    url: string;
    size?: string;
  };
}
```

### 5.4. Định Nghĩa TypeScript Interface Cho Hệ Thống
```typescript
export interface IzTeachStudent {
  id: string;
  userId?: string;
  vendorId: string;
  name: string;
  email: string;
  phone: string;
  password?: string;
  birthdate?: string;
  createdAt: string;
  createdFrom: 'admin' | 'web' | 'student' | 'import';
  state: 'verified' | 'unverified';
  isBlock: boolean;
  classCode?: string;
  hasLiveClass?: boolean;
  hasOnlineCourses?: boolean;
  courseIds?: string[];
  progress?: string;
}

export interface ClassRecord {
  id: string;                      // Mã lớp (VD: 'YCT2-04')
  title: string;                   // Tên hiển thị lớp
  teacherId: string;               // ID giáo viên
  teacherName: string;             // Tên giáo viên
  schedule: string;                // Lịch học trong tuần
  totalLessons: number;            // 25
  currentLesson: number;           // Buổi hiện tại
  studentIds: string[];            // Danh sách ID học viên
  chatRoomId: string;              // 'class:YCT2-04'
  createdAt: string;
}
```

---

## 6. MA TRẬN TRUY XUẤT NGUỒN GỐC YÊU CẦU (REQUIREMENTS TRACEABILITY MATRIX)

| Mã Yêu Cầu SRS | Mô Tả Yêu Cầu | Nguồn Gốc (Original Request) | Thành Phần Mã Nguồn Liên Quan | Kịch Bản Kiểm Thử Xác Nhận |
| :--- | :--- | :--- | :--- | :--- |
| **FR-01.1** | Thẻ KPI Dashboard Admin | ORIGINAL_REQUEST §R2 | `so-lien-lac-ux.js` (`renderAdminKpi`) | `verify_admin_kpi_dashboard()` |
| **FR-01.2** | Layout Admin & Navigation Tab độc lập | ORIGINAL_REQUEST §R2 | `so-lien-lac.html` (`#admin-container`) | `verify_admin_independent_layout()` |
| **FR-01.3** | Modal tạo lớp độc lập | ORIGINAL_REQUEST §R2 | `so-lien-lac-ux.js` (`#admin-modal-new-class`)| `verify_admin_class_modal()` |
| **FR-01.5** | Loại bỏ hoàn toàn clutter & text thừa | ORIGINAL_REQUEST §R2 | `so-lien-lac.html` (Dọn demo bar, button)| `verify_zero_clutter_elements()` |
| **FR-02.1** | Bảng Quản lý Học sinh izTeach 7 cột | ORIGINAL_REQUEST §R3 | `so-lien-lac-ux.js` (`renderIzTeachTable`) | `verify_izteach_table_structure()` |
| **FR-02.2** | Bộ lọc 3 Tab Trạng thái izTeach | ORIGINAL_REQUEST §R3 | `so-lien-lac-ux.js` (`filterStudentByTab`) | `verify_izteach_tab_filters()` |
| **FR-02.3** | Tìm kiếm từ khóa Debounced không dấu | ORIGINAL_REQUEST §R3 | `so-lien-lac-ux.js` (`searchStudents`) | `verify_student_search_unicode()` |
| **FR-02.4** | Nhập/Xuất Excel chuẩn mẫu | ORIGINAL_REQUEST §R3 | `so-lien-lac-ux.js` (`import/exportExcel`) | `verify_excel_import_export()` |
| **FR-02.5** | Đồng bộ 3 tầng API / Cloud State | ORIGINAL_REQUEST §R3 | `so-lien-lac-ux.js` & `server.cjs` | `verify_3tier_sync_resilience()` |
| **FR-03.1** | Tự động tạo Room Chat `class:<code>` | ORIGINAL_REQUEST §R4 | `so-lien-lac-server.cjs` & `ux.js` | `verify_class_chat_provisioning()` |
| **FR-03.2** | Phân quyền Room Chat nghiêm ngặt | ORIGINAL_REQUEST §R4 | `so-lien-lac-permissions.cjs` | `verify_room_chat_rbac_isolation()`|
| **FR-03.3** | Kênh Realtime WebSocket + Broadcast | ORIGINAL_REQUEST §R4 | `so-lien-lac-server.cjs` (`/ws/chat`) | `verify_realtime_chat_delivery()` |
| **FR-03.4** | Thẻ bài học & Đính kèm tệp bài tập | ORIGINAL_REQUEST §R4 | `so-lien-lac-ux.js` (`renderChatStream`)| `verify_rich_message_attachment()` |
| **FR-03.5** | Bộ lọc an toàn dữ liệu KTN_DLP | ORIGINAL_REQUEST §R4 | `so-lien-lac.html` (`window.KTN_DLP`) | `verify_in_flight_dlp_safety()` |
| **FR-04.1** | Tinh chỉnh Cổng Giáo viên | ORIGINAL_REQUEST §R5 | `so-lien-lac.html` (`view-teacher`) | `verify_teacher_portal_polish()` |
| **FR-04.2** | Tinh chỉnh Cổng Học sinh & Phụ huynh | ORIGINAL_REQUEST §R5 | `so-lien-lac.html` (`view-parent`) | `verify_student_portal_polish()` |

---