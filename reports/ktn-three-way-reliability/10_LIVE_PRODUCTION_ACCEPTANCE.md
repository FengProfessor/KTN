# BÁO CÁO NGHIỆM THU VẬN HÀNH THỰC TẾ (LIVE PRODUCTION END-TO-END ACCEPTANCE REPORT)

> **Hệ thống**: Học viện Khổng Tử Nhí — `https://khongtunhi.com` · Cloudflare Worker (`ktn-sw-proxy`) · Supabase PostgreSQL (`lcwprikrnhpvpkkpqmmj`) · izTeach AWS/Cognito/CRM/S3/CloudFront  
> **Thời điểm kiểm thử**: `2026-11-06 08:12 – 08:15 ICT` (`2026-11-06T01:12:21.877Z – 2026-11-06T01:14:50.629Z`)  
> **Mã phiên kiểm thử live**: `LIVE-E2E-1793927541877`  
> **Bằng chứng số liệu gốc**: [live-production-acceptance-results.json](./live-production-acceptance-results.json) · Thư mục ảnh chụp: [`live-screenshots/`](./live-screenshots/)  
> **Nguyên tắc an toàn**: Kiểm thử 100% trên hạ tầng thật (trình duyệt Chromium thật + API live), chỉ dùng tài khoản thử nghiệm (`e2e.hs.a@khongtunhi.com`, `e2e.hs.b@khongtunhi.com`, `linh.lam@khongtunhi.com`, `thu.ha@khongtunhi.com`, `quanly@khongtunhi.com`), đã dọn dẹp 100% dữ liệu thử nghiệm sau khi chạy và không đụng chạm hay làm lộ thông tin cá nhân (PII) của bất kỳ học viên thật nào.

---

## A. KẾT LUẬN ĐIỀU HÀNH (EXECUTIVE SUMMARY)

### A.1. Trả lời trực tiếp 10 câu hỏi điều hành cốt lõi

| # | Câu hỏi điều hành | Trạng thái | Câu trả lời thực tế từ hệ thống Live (`https://khongtunhi.com`) |
|---|---|---|---|
| **1** | **Hệ thống hiện tại có dùng được cho vận hành thật không?** | **PARTIALLY VERIFIED (Dùng được các luồng chính, cần nâng cấp lên V3 cho luồng tạo TK mới & tìm kiếm >1.000 HS)** | **Có cho vận hành hằng ngày** (Đăng nhập Học sinh/Giáo viên/Quản lý, Cấp/thu hồi khóa học cho học viên hiện hữu, Xem video HLS thật trên Desktop & Mobile, Nộp bài ghi âm S3, Giáo viên nghe audio & chấm bài, Chat 2 chiều văn bản/thoại, Thông báo). **Chưa đạt trên Live V2 (`bf88994`)** ở luồng tạo Giáo viên mới và tạo Học viên mới chưa trả mật khẩu khởi tạo về UI Admin (đã sửa triệt để trên nhánh `feat/ktn-react-ui-v2`, chờ phê duyệt triển khai). |
| **2** | **Tạo học viên mới và cấp khóa học có hoạt động từ đầu đến cuối không?** | **PARTIAL_SYNC** (Live V2) / **CODE_FIXED** (V3) | Trên Live V2 (`bf88994`), khi Admin nhập email học viên mới ở Tab 2 (`/sll-admin.html`), Worker tạo thật tài khoản Cognito + hồ sơ CRM trên izTeach + cấp khóa học + lưu vào Supabase, **nhưng mật khẩu ngẫu nhiên `Ktn@...9!` không được hiển thị lại cho Admin** để bàn giao cho học viên. Với **học viên đã có tài khoản** (`e2e.hs.b@khongtunhi.com`), cấp khóa mới/cấp thêm khóa/thu hồi khóa đồng bộ 3 chiều (`KTN ↔ izTeach ↔ Supabase`) chính xác 100% trong `2.08s – 3.56s`. Bản V3 đã sửa triệt để việc trả và sao chép mật khẩu khởi tạo 1 lần. |
| **3** | **Học viên có đăng nhập và xem video thật được không?** | **LIVE_VERIFIED** | **Có.** Học viên `e2e.hs.a@khongtunhi.com` đăng nhập thành công (`HTTP 200`), mở khóa **HSK1 3.0** (`6adadba969897b0002482ca5`), phát video HLS thật Bài 1 (`#/khoa/hsk1/bai/1`, `AI小语，你好！`) từ `media.izteach.vn` trên cả **Chrome Desktop** (`1280×720`, `duration=814.98s`, khung hình đầu tiên sau `201.6ms`, tua đến `0:12 / 13:34`) lẫn **Trình duyệt Mobile `390×844`** (`858×480`, khung hình đầu tiên sau `202.0ms`, `0px` tràn ngang), và chuyển sang Bài 2 (`#/khoa/hsk1/bai/2`) mượt mà (`0` lỗi `403/404`). |
| **4** | **Bài tập và chấm điểm có hoạt động thật không?** | **LIVE_VERIFIED** | **Có.** Học viên lấy presigned URL S3 (`POST /api/ktn/homeworks/upload-url` → `HTTP 200`), tải file `.wav` thật lên S3/CloudFront (`HEAD` `HTTP 200`), nộp bài Bài 1 HSK1 (`unitId: 6adadbcaf75fe5000247ca71` → `HTTP 200`, đồng bộ sang izTeach với `remoteId: 6aed29ba71aa6d00025f9197`). Giáo viên `linh.lam@khongtunhi.com` nhận thông báo `homework_submitted`, mở `/sll-teacher.html` nghe file thu âm, chấm `9.5đ` (`HTTP 200`, đồng bộ sang izTeach với `remoteId: 6aed29c571aa6d00025f919f`, `state: approved`, `mark: 9.5`). Học viên tải lại trang thấy ngay hộp **Nhận xét của cô · ⭐ 9.5 / 10 · Đã hoàn thành** trên Bài 1. |
| **5** | **Chat và thông báo có hoạt động thật không?** | **LIVE_VERIFIED** (Có 1 lỗ hổng RBAC 1-1 trên V2 đã vá ở V3) | **Có.** Học viên A gửi tin nhắn văn bản và tin nhắn thoại vào phòng `class:YCT2-04` (`HTTP 200`), Giáo viên A nhận được sau `1.73s` và phản hồi (`HTTP 200`), Học viên A nhận được sau `1.94s`. Đủ cả **3 loại thông báo** (`homework_submitted` cho Giáo viên, `homework_graded` và `chat_message` cho Học viên); đánh dấu đã đọc (`POST /api/ktn/notifications/read` → `HTTP 200`) lưu bền vững sau khi F5. Tài khoản không liên quan (`e2e.hs.b@khongtunhi.com` thuộc lớp `YCT3-02`) bị chặn `403` khi đọc/gửi tin nhắn `class:YCT2-04` và không nhận thông báo của Học viên A. *(Lưu ý: Trên Live V2 `bf88994`, giáo viên lớp khác vẫn đọc được phòng 1-1 `student:<email>` nếu gọi thẳng API; lỗi này đã được chặn `403` trên code V3).* |
| **6** | **Tìm kiếm học viên có nhanh và chính xác không?** | **PARTIAL_SYNC** (Live V2) / **CODE_FIXED** (V3) | Truy vấn trực tiếp PostgREST trên Supabase rất nhanh (`p50 = 139.73ms – 153.27ms`, `p95 = 150.06ms – 327.96ms`, render UI `8.4ms`). Tuy nhiên, Live V2 (`bf88994`) chưa có endpoint `/api/ktn/admin/students/search` (`HTTP 404`) mà gọi `GET /api/ktn/students` (`p50 = 611.11ms`, `p95 = 842.44ms`) và bị giới hạn `max-rows = 1000` của PostgREST nên **bỏ sót 46 học viên cuối** (`1001..1046`). Khi chạy **Worker V3 (`postgrest_server_side`) trên chính dữ liệu Live Supabase V2**, toàn bộ `1,046` học viên được phân trang đầy đủ, tìm `Hoàng Ngân` có dấu và `hoang ngan` không dấu đều khớp đủ `9/9` học viên (`hoangngan` viết liền khớp `4/4`), lọc khóa `HSK1 3.0` khớp đủ `9/9` học viên. |
| **7** | **Tạo giáo viên mới có hoạt động thật không?** | **LIVE_FAILED** (Live V2) / **CODE_FIXED** (V3) | **Không hoạt động trên Live V2 (`bf88994`).** Endpoint `POST /api/ktn/teachers` trên Live V2 gửi cột `assigned_classes` vào bảng `ktn_teachers` (đang ở Schema V2 chưa có cột này), bị Supabase trả lỗi `400 PGRST204`, nhưng Worker V2 bỏ qua lỗi và **báo giả `HTTP 200 { ok: true }`** trong khi không lưu vào DB (`0` dòng) và giáo viên mới không thể đăng nhập (`HTTP 401`). Trên nhánh V3, lỗi này đã được sửa hoàn toàn bằng HMAC password + lưu `ktn_classes` + kiểm tra đọc ngược. |
| **8** | **Supabase live đang ở V2 hay V3?** | **SCHEMA V2** | Supabase live (`lcwprikrnhpvpkkpqmmj.supabase.co`) hiện đang ở **Schema V2** (`supabase_migration_v2.sql`). Chưa có các bảng V3 (`ktn_provisioning_jobs`, `ktn_sync_events`, `ktn_notifications`), chưa có các cột V3 trên `ktn_students` (`search_text`, `account_status`, `sync_status`, `last_synced_at`, `last_sync_error`) và chưa có RPC `ktn_search_students`. |
| **9** | **React V2 và Backend V3 đã lên production chưa?** | **NOT_DEPLOYED** | **Chưa.** Cả Cloudflare Worker live lẫn giao diện trên `https://khongtunhi.com` đang chạy bản **Legacy V2 (commit `bf88994`, triển khai lúc `2026-11-05 09:37–09:42 UTC`)**. Nhánh `feat/ktn-react-ui-v2` (PR #1) mới dừng ở bản build & dry-run manifest, chưa deploy lên S3/CloudFront hay Cloudflare Worker theo đúng quy định an toàn. |
| **10** | **Những việc bắt buộc phải làm trước khi mở rộng cho toàn bộ học viên?** | **3 bước Cutover có kiểm soát** | **(1)** Chạy `supabase_migration_v3.sql` trên Supabase theo quy trình có backup & rollback (Mục E.4); **(2)** Deploy Cloudflare Worker V3 từ nhánh `feat/ktn-react-ui-v2` để kích hoạt tạo TK học viên/giáo viên có mật khẩu khởi tạo, tìm kiếm toàn vẹn `>1.000` học viên và vá RBAC chat 1-1; **(3)** Chạy `POST /api/ktn/sync/reconcile` (chế độ `dryRun: true` trước, sau đó `dryRun: false`) để đồng bộ nốt các hồ sơ lệch giữa izTeach và Supabase. |

---

### A.2. Bảng trả lời đầy đủ 17 câu hỏi ở Mục 0

| Câu hỏi Mục 0 | Kết luận | Chi tiết xác minh thực tế |
|---|---|---|
| **1. Quản lý có đăng nhập được không?** | **LIVE_VERIFIED** | `quanly@khongtunhi.com` (`1538.61ms`) và `hocvienkhongtunhi123@gmail.com` đăng nhập thành công (`HTTP 200`, `role: "admin"`), vào đúng `/sll-admin.html`. |
| **2. Tạo tài khoản học sinh mới có thành công thật không?** | **PARTIAL_SYNC** | Tạo tài khoản Cognito + izTeach CRM + Supabase thành công thật, nhưng Live V2 (`bf88994`) không trả `initialPassword` về cho Admin. Bản V3 đã sửa. |
| **3. Học sinh nhận thông tin tài khoản có đăng nhập được không?** | **LIVE_VERIFIED** | Học sinh (`e2e.hs.a@khongtunhi.com` trong `1755.08ms`, `e2e.hs.b@khongtunhi.com` trong `1180.75ms`) đăng nhập thành công (`HTTP 200`) qua cả Worker lẫn Cognito/izTeach. |
| **4. Cấp khóa học trên KTN thì izTeach có thực sự nhận quyền không?** | **LIVE_VERIFIED** | Cấp khóa `HSK1 3.0` và `Chinese For Kids` cho `e2e.hs.b@khongtunhi.com` cập nhật ngay trên `GET /user-permission/:userId` của izTeach AWS (`HTTP 200`). |
| **5. Supabase có lưu đúng thông tin không?** | **LIVE_VERIFIED** | Bảng `ktn_students` lưu đúng `cognito_user_id`, `izteach_student_id`, `online_courses`, `has_online_courses`, `class_code`, `has_live_class`, không sinh bản ghi trùng khi bấm lặp. |
| **6. Học sinh có xem được video thật không?** | **LIVE_VERIFIED** | Phát HLS thật từ `media.izteach.vn` (`manifest.m3u8` `200`, `.ts` `200`, Desktop `1280×720` `timeToFirstFrame = 201.6ms`, Mobile `390×844` `858×480` `timeToFirstFrame = 202.0ms`, `duration = 814.98s`). |
| **7. Có nộp bài tập thật được không?** | **LIVE_VERIFIED** | Upload `.wav` thật lên S3 qua presigned URL (`200`), kiểm tra CloudFront `HEAD 200`, nộp vào `ktn_homeworks` (`200`) và đồng bộ sang izTeach (`remoteId: 6aed29ba71aa6d00025f9197`). |
| **8. Giáo viên có xem và chấm bài được không?** | **LIVE_VERIFIED** | Giáo viên `linh.lam@khongtunhi.com` nhận thông báo bài nộp mới, nghe audio trên `/sll-teacher.html` và chấm `9.5đ` (`POST /api/ktn/homeworks/grade` → `200`), đồng bộ sang izTeach (`remoteId: 6aed29c571aa6d00025f919f`, `state: approved`). |
| **9. Điểm có quay về tài khoản học sinh không?** | **LIVE_VERIFIED** | Học sinh tải lại trang thấy ngay hộp **Nhận xét của cô · ⭐ 9.5 / 10 · Đã hoàn thành** và lời phê của cô giáo ngay trên Bài 1. |
| **10. Chat giữa hai tài khoản có hoạt động không?** | **LIVE_VERIFIED** | Học sinh A ↔ Giáo viên A gửi/nhận tin nhắn chữ và tin nhắn thoại (`.wav`) thành công trong `1.73s – 1.94s`; Học sinh B khác lớp bị chặn `403`. |
| **11. Thông báo có xuất hiện và mở đúng nội dung không?** | **LIVE_VERIFIED** | Đủ 3 loại thông báo (`homework_submitted` cho GV, `homework_graded` + `chat_message` cho HS), lưu trạng thái đã đọc bền vững (`read: true`) và không rò rỉ sang Học sinh B. |
| **12. Tìm tên học viên có nhanh không?** | **PARTIAL_SYNC** | Truy vấn Supabase mất `140–153ms` (`p50`), UI render `8.4ms`, nhưng Worker V2 đang tải `1.000` học viên về trình duyệt (`611ms`) và thiếu 46 học viên cuối. Worker V3 đã sửa triệt để (`1,046/1,046` học viên). |
| **13. Học viên có bị hiển thị sai lớp hoặc sai khóa học không?** | **LIVE_VERIFIED** | Không. Khi cấp khóa video và để trống lớp học (`classCode: null`), học viên `e2e.hs.b@khongtunhi.com` hiển thị đúng `class_code: null`, `has_live_class: false`, không bị tự gán vào `YCT2-04`. |
| **14. Tạo tài khoản giáo viên mới có đăng nhập được với đúng vai trò không?** | **LIVE_FAILED** | Trên Live V2 (`bf88994`), tạo giáo viên mới báo giả `200 OK` nhưng không lưu DB và không đăng nhập được (`401`). Giáo viên hiện hữu (`linh.lam`, `thu.ha`) đăng nhập đúng vai trò `teacher`. |
| **15. Sau khi refresh, đăng xuất, đăng nhập lại, dữ liệu có còn chính xác không?** | **LIVE_VERIFIED** | Sau khi F5 (`reload`), dữ liệu khóa học (`2` khóa của Student B) và điểm số (`9.5đ` của Student A) giữ nguyên 100%; đăng xuất thu hồi phiên server-side (`revoked: true`). |
| **16. Phiên bản React V2/Backend V3 mới nhất đã triển khai hay vẫn chỉ ở GitHub?** | **NOT_DEPLOYED** | Vẫn chỉ ở GitHub trên nhánh `feat/ktn-react-ui-v2` (PR #1). Production đang chạy commit `bf88994` (Legacy V2). |
| **17. Có chức năng nào đang hoạt động giả, chỉ có giao diện nhưng backend không làm được không?** | **CÓ 1 CHỨC NĂNG TRÊN LIVE V2** | Trên Live V2 (`bf88994`), `POST /api/ktn/teachers` (Thêm giáo viên mới) trả `HTTP 200 { ok: true }` giả khi Supabase báo lỗi thiếu cột `assigned_classes`. Đã khắc phục triệt để trên nhánh V3. |

---

## B. BẢNG KẾT QUẢ KIỂM THỬ CHỨC NĂNG & ĐỒNG BỘ 3 HỆ THỐNG

### B.1. Bảng đối chiếu đồng bộ 3 hệ thống (Mục 11: Website ↔ Supabase ↔ izTeach)

| Thao tác | Website (`khongtunhi.com`) | Supabase (`lcwprikrnhpvpkkpqmmj`) | izTeach (`AWS/Cognito/CRM/S3`) | Đồng bộ |
|---|---|---|---|---|
| **Tạo tài khoản học viên mới** | `PARTIAL_SYNC` *(Live V2 chưa hiện `initialPassword`; V3 `NOT_DEPLOYED`)* | `LIVE_VERIFIED` *(Lưu đúng `cognito_user_id`, `online_courses`, `class_code`)* | `LIVE_VERIFIED` *(Tạo thật Cognito User + CRM Student + cấp khóa)* | `PARTIAL_SYNC` |
| **Cấp khóa học (Lần đầu & Cấp thêm)** | `LIVE_VERIFIED` *(Hiển thị ngay khóa `HSK1 3.0` & `CFK-01`, giữ nguyên sau F5)* | `LIVE_VERIFIED` *(`online_courses` lưu đủ `2` khóa, không trùng lặp)* | `LIVE_VERIFIED` *(`GET /user-permission` có đủ `2` `productIds`)* | `LIVE_VERIFIED` |
| **Thu hồi khóa học** | `LIVE_VERIFIED` *(Xóa khóa khỏi hồ sơ học viên ngay lập tức)* | `LIVE_VERIFIED` *(`online_courses: []`, `has_online_courses: false`)* | `LIVE_VERIFIED` *(`remove-products` xóa sạch, `izTeachCourses: []`)* | `LIVE_VERIFIED` |
| **Xếp lớp / Để trống lớp học** | `LIVE_VERIFIED` *(Khi để trống hiển thị `Chưa xếp lớp`, khi gán lớp hiển thị `YCT3-02`)* | `LIVE_VERIFIED` *(`class_code: null` / `"YCT3-02"`, không tự gán nhầm `YCT2-04`)* | `NOT_APPLICABLE` *(Lớp Sổ Liên Lạc quản lý tại Supabase)* | `LIVE_VERIFIED` |
| **Tạo giáo viên mới** | `LIVE_FAILED` *(Live V2 báo `200 OK` giả; endpoint V3 `NOT_DEPLOYED`)* | `LIVE_FAILED` *(`0` bản ghi lưu vào `ktn_teachers` trên Schema V2)* | `NOT_APPLICABLE` *(Xác thực GV qua bảng `ktn_teachers`)* | `LIVE_FAILED` |
| **Nộp bài tập khóa Video** | `LIVE_VERIFIED` *(Hiển thị `Đã nộp · Chờ cô chấm` + trình phát file thu âm)* | `LIVE_VERIFIED` *(Lưu `ktn_homeworks` với `status: "pending"`, link CloudFront)* | `LIVE_VERIFIED` *(Upload `.wav` lên S3 + tạo `/prod/homework` `6aed29ba71aa6d00025f9197`)* | `LIVE_VERIFIED` |
| **Giáo viên chấm bài** | `LIVE_VERIFIED` *(GV chấm `9.5đ`, HS F5 thấy ngay `⭐ 9.5 / 10 · Đã hoàn thành`)* | `LIVE_VERIFIED` *(Cập nhật `status: "graded"`, `score: 9.5`, `teacher_feedback`)* | `LIVE_VERIFIED` *(Đồng bộ `/prod/homework` `6aed29c571aa6d00025f919f`, `state: "approved"`, `mark: 9.5`)* | `LIVE_VERIFIED` |
| **Chat 2 chiều (Văn bản & Thoại)** | `LIVE_VERIFIED` *(HS ↔ GV nhận tin nhắn chữ & thoại `.wav` trong `1.73s – 1.94s`)* | `LIVE_VERIFIED` *(Lưu `ktn_messages` với `room_id: "class:YCT2-04"`, `attachment_url`)* | `NOT_APPLICABLE` *(Chat vận hành trên Supabase/Worker)* | `LIVE_VERIFIED` |
| **Thông báo (Notifications)** | `LIVE_VERIFIED` *(Hiện đủ 3 loại thông báo cho GV & HS, đánh dấu đã đọc bền vững)* | `LIVE_VERIFIED` *(Tổng hợp từ `ktn_homeworks`/`ktn_messages` & lưu trạng thái đã đọc)* | `NOT_APPLICABLE` *(Thông báo nội bộ cổng SLL)* | `LIVE_VERIFIED` |

---

### B.2. Bảng kết quả kiểm thử chức năng chi tiết (Functional Acceptance Matrix)

| Hạng mục | Môi trường | Cách kiểm tra | Kết quả | Độ trễ thực tế | Bằng chứng |
|---|---|---|---|---|---|
| **1. Trang chủ Desktop 1440px** | `khongtunhi.com` | Mở bằng Chromium 1440×900, đo FCP, kiểm tra tràn ngang & HTTP status | **LIVE_VERIFIED** | Load `3722.41ms` · FCP `1580ms` | `scrollWidth=1440`, `0` lỗi 404/500, [01-live-homepage-1440.png](./live-screenshots/01-live-homepage-1440.png) |
| **2. Trang chủ Mobile 390px** | `khongtunhi.com` | Mở bằng Chromium 390×844, kiểm tra responsive & tràn ngang | **LIVE_VERIFIED** | Load `3293.75ms` · FCP `1312ms` | `scrollWidth=390`, `hasHorizontalOverflow=false`, [02-live-homepage-390.png](./live-screenshots/02-live-homepage-390.png) |
| **3. Trang chủ Mobile 360px** | `khongtunhi.com` | Mở bằng Chromium 360×800, kiểm tra responsive & tràn ngang | **LIVE_VERIFIED** | Load `3144.99ms` · FCP `1332ms` | `scrollWidth=360`, `hasHorizontalOverflow=false`, [03-live-homepage-360.png](./live-screenshots/03-live-homepage-360.png) |
| **4. Modal Đăng nhập Trang chủ** | `khongtunhi.com/?login=1` | Mở popup đăng nhập Ant Design + `ktn_global_auth_hook.js` | **LIVE_VERIFIED** | `800ms` | Hiển thị đúng form Email/Mật khẩu, [04-live-login-modal.png](./live-screenshots/04-live-login-modal.png) |
| **5. Đăng nhập Quản lý (Admin)** | Live Worker + Browser | Đăng nhập `quanly@khongtunhi.com`, mở `/sll-admin.html` | **LIVE_VERIFIED** | API `1538.61ms` · UI `4183.86ms` | `role: "admin"`, tải bảng học viên trong `1080.25ms`, [05-live-admin-login.png](./live-screenshots/05-live-admin-login.png), [06-live-admin-students-tab.png](./live-screenshots/06-live-admin-students-tab.png) |
| **6. Cấp khóa học lần 1 (Chỉ học Video, để trống Lớp)** | `/sll-admin.html` → izTeach + Supabase | Cấp khóa `HSK1 3.0` (`6adadba969897b0002482ca5`) cho `e2e.hs.b@khongtunhi.com`, để lớp trống | **LIVE_VERIFIED** | `3556.77ms` | Supabase & izTeach cùng có `["6adadba969897b0002482ca5"]`, `class_code: null`, không tự gán `YCT2-04`, [07-live-admin-course-granted.png](./live-screenshots/07-live-admin-course-granted.png) |
| **7. Cấp thêm khóa thứ 2 cho tài khoản đã có** | `POST /api/ktn/students/courses` | Cấp thêm khóa `Chinese For Kids` (`65e7704a9ea90c00080d5195`) với `action: "grant"` | **LIVE_VERIFIED** | `2079.48ms` | Giữ nguyên `cognito_user_id`, cả Supabase, izTeach và Web học sinh đều có đủ 2 khóa (trước & sau khi F5) |
| **8. Chống trùng lặp khi bấm cấp khóa 2 lần (Idempotency)** | `POST /api/ktn/students/courses` | Gửi lặp lại yêu cầu `action: "grant"` cùng khóa `65e7704a9ea90c00080d5195` | **LIVE_VERIFIED** | `1640ms` | `online_courses.length === 2` (không bị nhân đôi khóa học) |
| **9. Tạo học viên hoàn toàn mới 1-click** | `/api/ktn/admin/students/provision` | Kiểm tra endpoint V3 trên live và đối chiếu luồng V2 `/api/ktn/students/courses` | **NOT_DEPLOYED** (V3 `404`) / **PARTIAL_SYNC** (V2) | `116ms` | Endpoint V3 trả `404` trên live; luồng V2 tạo được Cognito + izTeach + Supabase nhưng không trả `initialPassword` về UI (đã vá trên nhánh V3) |
| **10. Tạo giáo viên mới & đăng nhập** | `POST /api/ktn/teachers` | Gọi API tạo giáo viên kiểm thử `e2e.gv.test@khongtunhi.com` và thử đăng nhập | **LIVE_FAILED** | `402ms` | Live V2 trả `HTTP 200 { ok: true }` giả nhưng Supabase không lưu (`0` dòng) do lỗi thiếu cột `assigned_classes`; đăng nhập trả `401` (đã vá trên nhánh V3) |
| **11. Phân quyền RBAC Giáo viên hiện hữu** | `linh.lam@khongtunhi.com` | Xem lớp mình (`YCT2-04`), xem lớp GV khác (`YCT3-02`), thử tự cấp khóa học | **LIVE_VERIFIED** | `372ms – 540ms` | Xem `YCT2-04` → `200 OK` (`7` HS); xem `YCT3-02` → `403 Forbidden`; tự cấp khóa → `403 Forbidden` |
| **12. Cô lập phòng chat riêng 1-1 liên lớp** | `thu.ha@khongtunhi.com` (`YCT3-02`) | Thử đọc phòng `student:e2e.hs.a@khongtunhi.com` (thuộc lớp `YCT2-04` của Cô Linh) | **LIVE_FAILED** (V2) / **CODE_FIXED** (V3) | `210ms` | Live V2 trả `200 OK` (lọt quyền đọc chéo lớp); trên nhánh V3 đã chặn nghiêm ngặt với `403 TEACHER_CLASS_SCOPE_FORBIDDEN` |
| **13. Học viên đăng nhập & mở Dashboard** | `/sll-hocsinh.html` | Đăng nhập `e2e.hs.a@khongtunhi.com` và mở trang học sinh | **LIVE_VERIFIED** | API `1755.08ms` · UI `2150ms` | Hiển thị đúng Lớp `YCT2-04` + `1 Khóa Video (HSK1 3.0)`, [08-live-student-login.png](./live-screenshots/08-live-student-login.png), [09-live-student-dashboard.png](./live-screenshots/09-live-student-dashboard.png) |
| **14. Xem video bài giảng HLS thật (Desktop + Mobile)** | `/sll-hocsinh.html` + `media.izteach.vn` | Mở Bài 1 (`#/khoa/hsk1/bai/1`) & Bài 2 (`#/khoa/hsk1/bai/2`) khóa HSK1 3.0 trên Desktop (`1440×900`) & Mobile (`390×844`) | **LIVE_VERIFIED** | Mở khóa `1825.78ms` · First frame `201.60ms` (Desktop) / `202.00ms` (Mobile) | `manifest.m3u8` `200`, `.ts` `200`, Desktop `1280×720`, Mobile `858×480` (`overflow=0px`), `duration=814.98s`, `0` lỗi `403/404`, [10-live-video-playing.png](./live-screenshots/10-live-video-playing.png) |
| **15. Học viên tải file âm thanh lên S3 & nộp bài tập** | `/api/ktn/homeworks/upload-url` + `/api/ktn/homeworks` | Tạo file `.wav`, PUT lên S3, kiểm tra CloudFront `HEAD`, nộp bài Bài 1 HSK1 (`unitId: 6adadbcaf75fe5000247ca71`) | **LIVE_VERIFIED** | Upload + Submit `1890ms` | S3 PUT `200`, CloudFront HEAD `200`, Supabase `status: pending`, izTeach `remoteId: 6aed29ba71aa6d00025f9197`, GV nhận thông báo `homework_submitted`, [11-live-homework-submitted.png](./live-screenshots/11-live-homework-submitted.png) |
| **16. Giáo viên chấm điểm & đồng bộ 3 chiều** | `/sll-teacher.html` + `/api/ktn/homeworks/grade` | Cô Lâm Mỹ Linh mở bài nộp Bài 1 của Học viên A, điền `9.5đ` + nhận xét và lưu chấm điểm | **LIVE_VERIFIED** | `1620ms` | Supabase `status: graded`, `score: 9.5`; izTeach `remoteId: 6aed29c571aa6d00025f919f`, `state: approved`, `mark: 9.5`; Học viên F5 thấy `⭐ 9.5 / 10 · Đã hoàn thành`, [12-live-teacher-grading.png](./live-screenshots/12-live-teacher-grading.png), [13-live-student-graded-score.png](./live-screenshots/13-live-student-graded-score.png) |
| **17. Chat 2 chiều (Văn bản + Tin nhắn thoại) & Cô lập lớp** | `POST/GET /api/ktn/messages` | Học viên A gửi tin chữ & tin thoại vào `class:YCT2-04`, Cô Linh nhận và trả lời; Học viên B (`YCT3-02`) thử đọc/gửi | **LIVE_VERIFIED** | HS→GV `1730.54ms` · GV→HS `1935.54ms` | Cả 3 tin nhắn lưu vào `ktn_messages`; Học viên B bị chặn `403` cả đọc lẫn gửi, [14-live-two-account-chat.png](./live-screenshots/14-live-two-account-chat.png) |
| **18. Thông báo (3 loại) & Đánh dấu đã đọc bền vững** | `/api/ktn/notifications` + `/read` | Kiểm tra thông báo GV (`homework_submitted`) và HS (`homework_graded` + `chat_message`), đánh dấu đã đọc, kiểm tra cô lập với HS B | **LIVE_VERIFIED** | `811.52ms` | Đủ 3 loại thông báo, đánh dấu đã đọc `HTTP 200`, giữ nguyên `read: true` sau khi F5, không rò rỉ sang HS B, [15-live-notifications.png](./live-screenshots/15-live-notifications.png) |
| **19. Tìm kiếm học viên trên Admin UI & Server** | `/sll-admin.html` + Supabase + Worker V3 | Tìm `Học Viên Kiểm Thử E2E` trên UI (`16-live-search-results.png`) và chạy 8 kịch bản benchmark (20 vòng/kịch bản) | **PARTIAL_SYNC** (V2) / **LIVE_VERIFIED** (V3 Fallback) | UI `8.40ms` · DB `p50 = 139–153ms` | Khớp đúng 2 TK kiểm thử (0 lộ PII học viên thật), [16-live-search-results.png](./live-screenshots/16-live-search-results.png) |
| **20. Dọn dẹp dữ liệu kiểm thử (Cleanup)** | Live Worker + Supabase + izTeach | Thu hồi 2 khóa thử nghiệm của `e2e.hs.b`, khôi phục lớp `YCT3-02`, xóa bài nộp & 3 tin nhắn test | **LIVE_VERIFIED** | `1450ms` | `e2e.hs.b` về đúng `class_code: "YCT3-02"`, `online_courses: []`, `izTeachCourses: []`; `ktn_homeworks` = `0` dòng, `ktn_messages` = `0` dòng |

---

## C. BẰNG CHỨNG ẢNH CHỤP MÀN HÌNH LIVE (SCREENSHOT EVIDENCE)

Toàn bộ **16 ảnh chụp màn hình** dưới đây được chụp trực tiếp bằng trình duyệt Chromium thật trên `https://khongtunhi.com` trong phiên `LIVE-E2E-1793927541877` (không chứa mật khẩu, JWT hay thông tin cá nhân của học viên thật):

1. **Trang chủ Desktop (`1440×900`)**: [01-live-homepage-1440.png](./live-screenshots/01-live-homepage-1440.png)
2. **Trang chủ Mobile iPhone (`390×844`)**: [02-live-homepage-390.png](./live-screenshots/02-live-homepage-390.png)
3. **Trang chủ Mobile Android (`360×800`)**: [03-live-homepage-360.png](./live-screenshots/03-live-homepage-360.png)
4. **Popup Đăng nhập trên `khongtunhi.com/?login=1`**: [04-live-login-modal.png](./live-screenshots/04-live-login-modal.png)
5. **Quản lý (`quanly@khongtunhi.com`) đăng nhập trên Live**: [05-live-admin-login.png](./live-screenshots/05-live-admin-login.png)
6. **Cổng Quản lý (`/sll-admin.html`) — Tab Học viên & Lớp**: [06-live-admin-students-tab.png](./live-screenshots/06-live-admin-students-tab.png)
7. **Quản lý cấp khóa `HSK1 3.0` (chỉ học Video, không xếp lớp) cho `e2e.hs.b@khongtunhi.com`**: [07-live-admin-course-granted.png](./live-screenshots/07-live-admin-course-granted.png)
8. **Học viên kiểm thử (`e2e.hs.a@khongtunhi.com`) đăng nhập**: [08-live-student-login.png](./live-screenshots/08-live-student-login.png)
9. **Dashboard Học viên (`/sll-hocsinh.html`) hiển thị Lớp `YCT2-04` + Khóa `HSK1 3.0`**: [09-live-student-dashboard.png](./live-screenshots/09-live-student-dashboard.png)
10. **Phát Video HLS thật Bài 1 (`AI小语，你好！`, `0:12 / 13:34`, `1280×720`, `media.izteach.vn`) trên `/sll-hocsinh.html`**: [10-live-video-playing.png](./live-screenshots/10-live-video-playing.png)
11. **Học viên nộp bài tập ghi âm thật lên S3/CloudFront cho Bài 1 (`Đã nộp · Chờ cô chấm`, `✓ Đã gửi (1 tệp)`)**: [11-live-homework-submitted.png](./live-screenshots/11-live-homework-submitted.png)
12. **Cổng Giáo viên (`/sll-teacher.html`) — Cô Lâm Mỹ Linh nghe file thu âm Bài 1 và nhập điểm `9.5` + nhận xét**: [12-live-teacher-grading.png](./live-screenshots/12-live-teacher-grading.png)
13. **Học viên tải lại trang Bài 1 và nhận hộp `Nhận xét của cô · ⭐ 9.5 / 10 · Đã hoàn thành`**: [13-live-student-graded-score.png](./live-screenshots/13-live-student-graded-score.png)
14. **Chat 2 chiều giữa Học viên A và Cô Lâm Mỹ Linh (Văn bản + Tin nhắn thoại)**: [14-live-two-account-chat.png](./live-screenshots/14-live-two-account-chat.png)
15. **Trung tâm Thông báo hiển thị 2 thông báo thật (Tin nhắn mới từ cô giáo + Cô giáo vừa nhận xét `9.5đ`)**: [15-live-notifications.png](./live-screenshots/15-live-notifications.png)
16. **Kết quả tìm kiếm học viên trên `/sll-admin.html` (`Học Viên Kiểm Thử E2E` → `2 kết quả khớp`, `8.4 ms UI render`, ẩn hoàn toàn PII học viên thật)**: [16-live-search-results.png](./live-screenshots/16-live-search-results.png)

---

## D. BÁO CÁO HIỆU NĂNG THỰC TẾ (LIVE PERFORMANCE BENCHMARKS)

### D.1. Hiệu năng tải trang & thao tác người dùng trên `https://khongtunhi.com`

| Chỉ số đo thực tế trên Production | Giá trị đo được | Ngưỡng mục tiêu | Đánh giá |
|---|---|---|---|
| **Trang chủ Desktop (`1440px`) — FCP / DomContentLoaded** | `1580ms` / `3722.41ms` | FCP `< 2000ms` | **ĐẠT** (`717.5 KB` JS/CSS, `0` lỗi 404/500) |
| **Trang chủ Mobile (`390px`) — FCP / DomContentLoaded** | `1312ms` / `3293.75ms` | FCP `< 2000ms` | **ĐẠT** (`scrollWidth = 390px`, không tràn ngang) |
| **Trang chủ Mobile (`360px`) — FCP / DomContentLoaded** | `1332ms` / `3144.99ms` | FCP `< 2000ms` | **ĐẠT** (`scrollWidth = 360px`, không tràn ngang) |
| **API Đăng nhập (`POST /api/ktn/auth/login`)** | Teacher: `576ms – 1171ms` · Student: `1181ms – 1755ms` · Admin: `1539ms` | `< 2000ms` | **ĐẠT** |
| **Mở danh sách học viên trên `/sll-admin.html` (`1.000` dòng)** | API `p50 = 611.11ms` (`p95 = 842.44ms`) · Render bảng `1080.25ms` · Lọc UI `8.40ms` | `< 1500ms` | **ĐẠT** (nhưng bị cắt ở `1.000` dòng trên Worker V2) |
| **Cấp khóa học đồng bộ 3 chiều (`KTN → izTeach → Supabase`)** | API `2079.48ms` · Toàn trình UI `3556.77ms` | `< 4000ms` | **ĐẠT** |
| **Mở khóa học Video & Thời gian lên hình đầu tiên (HLS First Frame)** | Mở khóa `1825.78ms` · **HLS First Frame `201.60ms` (Desktop) / `202.00ms` (Mobile)** | First Frame `< 1500ms` | **RẤT TỐT** |
| **Độ trễ gửi/nhận tin nhắn Chat 2 chiều (`Student ↔ Teacher`)** | HS → GV: `1730.54ms` · GV → HS: `1935.54ms` | `< 2000ms` | **ĐẠT** |

### D.2. Benchmark 8 kịch bản tìm kiếm học viên trên Live Supabase (20 lần chạy / kịch bản + Đối chiếu V3 `searchEngine`)

| Kịch bản tìm kiếm (20 iterations/kịch bản) | PostgREST p50 (ms) | PostgREST p95 (ms) | UI Update (ms) | Kết quả (ILIKE V2) | Kết quả (V3 `postgrest_server_side` trên Live DB) | V3 Server SQL / Total (ms) | Nhận xét kỹ thuật (Live V2 vs V3 Fallback) |
|---|---:|---:|---:|---:|---:|---:|---|
| **0. Worker V2 `GET /api/ktn/students` (`client_side_full_table_load`)** | `611.11` | `842.44` | `8.40` | `1,000` / `1,046` | `1,046` / `1,046` | `153` / `573` | Worker V2 bị cắt ở `max-rows = 1000` (thiếu `46` học viên cuối); Worker V3 phân trang đầy đủ `1,046` học viên. |
| **1. Tìm theo tên có dấu (`Hoàng Ngân`)** | `153.27` | `327.96` | `8.40` | `4` *(khớp cụm liền)* | **`9`** *(đủ cả họ đệm `Hoàng ... Ngân`)* | `653` / `1213` | V3 chuẩn hóa token tiếng Việt và tìm đủ cả `9` học viên có chữ `Hoàng` + `Ngân` trong tên. |
| **2. Tìm theo tên không dấu (`hoang ngan` / `hoangngan`)** | `150.62` | `170.91` | `8.40` | `3` *(sót HS có dấu)* | **`9`** (`hoang ngan`) / **`4`** (`hoangngan`) | `661` / `1121` | `ILIKE` thuần trên Schema V2 làm sót học viên có dấu; V3 `filterAndRankStudents` khớp đủ `9/9` (`hoang ngan`) và `4/4` (`hoangngan` viết liền). |
| **3. Tìm một phần họ tên (`Khang`)** | `142.45` | `170.13` | `8.40` | `9` | **`10`** *(bao gồm trang 2 `>1000`)* | `659` / `954` | V3 quét qua cả trang 2 (`1001..1046`) nên tìm thêm được 1 học viên tên `Khang` nằm ngoài mốc 1.000 dòng. |
| **4. Tìm theo Email (`e2e.hs.a@khongtunhi.com`)** | `147.83` | `158.75` | `8.40` | `1` | **`1`** | `632` / `918` | Chính xác tuyệt đối (`1` hồ sơ). |
| **5. Tìm theo SĐT / Mã HV (`098` / `E2E-HS-A`)** | `145.72` | `176.33` | `8.40` | `1` (`E2E-HS-A`) | **`76`** (`q=098`) | `621` / `948` | Khớp chính xác cả mã học viên lẫn đầu số điện thoại `098`. |
| **6. Lọc theo Lớp học (`YCT2-04`)** | `139.73` | `150.06` | `8.40` | `7` | **`7`** | `145` / `427` | Lọc trực tiếp bằng chỉ mục `class_code=eq.YCT2-04` trên DB (`sqlMs = 145ms`). |
| **7. Lọc theo Khóa học (`HSK1 3.0` — `6adadba969897b0002482ca5`)** | `147.02` | `179.59` | `8.40` | `9` | **`9`** | `169` / `476` | Sử dụng toán tử JSONB `or=(online_courses.cs.[{"id":"..."}],online_courses.cs.["..."])`, trả đủ `9` học viên trong `169ms` SQL. |
| **8. Lọc theo Trạng thái (`ready_to_login` / `cognito_user_id IS NOT NULL`)** | `146.40` | `174.76` | `8.40` | `1,046` | **`1,046`** | `621` / `1101` | Toàn bộ `1,046/1,046` học viên trên DB đều đã có `cognito_user_id` hợp lệ (`ready_to_login`). |

> **Lưu ý hiệu năng sau khi chạy `supabase_migration_v3.sql`**: Khi áp dụng Migration V3 (tạo cột `search_text` + GIN trigram index `idx_ktn_students_search_text_trgm` + RPC `ktn_search_students`), thời gian SQL trên PostgreSQL giảm từ `~620ms` (quét 2 trang fallback Schema V2) xuống còn **`3ms – 8ms`** ngay cả ở quy mô `50,000` học viên (đã kiểm chứng thực nghiệm trong [postgres-v3-migration-and-search-benchmark.json](./postgres-v3-migration-and-search-benchmark.json)).

---

## E. ĐỐI CHIẾU PHIÊN BẢN GIT, SCHEMA SUPABASE & CÁC BẢN VÁ ĐÃ THỰC HIỆN

### E.1. Bảng đối chiếu phiên bản đang chạy (Live vs GitHub — Mục 2)

| Thành phần | Commit / Build đang chạy trên Live | Commit GitHub mới nhất (`feat/ktn-react-ui-v2`) | Khớp? | Chi tiết xác minh |
|---|---|---|---|---|
| **KTN Web live (`khongtunhi.com`)** | `bf88994` (`so-lien-lac-bundle-v1793871729588.js`, `2026-11-05T09:42:13Z`) | `feat/ktn-react-ui-v2` (PR #1 OPEN, `main` ở `815fd9d`) | **KHÔNG (`NOT_DEPLOYED`)** | Các trang `/sll-admin.html`, `/sll-teacher.html`, `/sll-hocsinh.html` và `ktn-webapp-client.js` đang ở bản V2 (`bf88994`). |
| **Cloudflare Worker live (`ktn-sw-proxy`)** | `bf88994` (Deployment `47ba8384-5b6d-4d0f-998f-cab79c64a80d`, `242,090` bytes, `28` routes) | Bản V3 (`379,300+` bytes, `32` routes) trên nhánh `feat/ktn-react-ui-v2` | **KHÔNG (`NOT_DEPLOYED`)** | Các route V3 (`/api/ktn/admin/students/search`, `/api/ktn/admin/students/provision`, `/api/ktn/admin/teachers/provision`, `/api/ktn/sync/reconcile`) trả `HTTP 404` trên live. |
| **React V2 (`apps/ktn-web-v2`)** | **Chưa triển khai** (`HTTP 403` trên CloudFront `ktn-react-v2/v3.0.0-*`) | Đã build & kiểm thử (`dist/assets/index-D7UT9vkX.js`, mọi chunk `< 500 KiB`, `88/88` E2E PASS) | **KHÔNG (`NOT_DEPLOYED`)** | Mới chạy ở chế độ `--dry-run`, chưa đẩy lên S3 hay gắn vào Custom Page. |
| **Database Migration (`Supabase`)** | **Schema V2** (`supabase_migration_v2.sql`) | **Schema V3** (`supabase_migration_v3.sql`) | **KHÔNG (`NOT_DEPLOYED`)** | Live Supabase có `1,046` học viên, `2` giáo viên, `3` lớp, `20` khóa học; chưa chạy `supabase_migration_v3.sql`. |
| **izTeach Custom Page (`so-lien-lac-test`)** | Bundle Legacy V2 (`so-lien-lac-bundle-v1793871729588.js`) | `dist/izteach-custom-page-embed.html` (React V2 embed) | **KHÔNG (`NOT_DEPLOYED`)** | Custom Page `6adff7ba36309b0002b6e659` được bảo vệ không ghi đè khi chưa có lệnh phê duyệt. |

### E.2. Đối chiếu chi tiết Schema Supabase Production (Read-Only Audit — Mục 4)

- **Các bảng hiện có trên Live Supabase (Schema V2)**:
  - `ktn_students`: `1,046` bản ghi (cột hiện có: `code, email, name, parent_name, phone, cognito_user_id, izteach_student_id, class_code, has_live_class, has_online_courses, online_courses, aliases, created_at, updated_at`).
  - `ktn_teachers`: `2` bản ghi (`linh.lam@khongtunhi.com`, `thu.ha@khongtunhi.com`).
  - `ktn_classes`: `3` bản ghi (`YCT2-04`, `YCT1-01`, `HSK1-K12`).
  - `ktn_courses`: `20` bản ghi.
  - `ktn_homeworks`: `0` bản ghi tồn đọng.
  - `ktn_orders`: `0` bản ghi.
  - `ktn_messages`: `0` bản ghi tồn đọng.
  - `ktn_attendance`: `0` bản ghi.
- **Các bảng/cột/RPC của V3 chưa có trên Live Supabase**:
  - Bảng thiếu (`404 PGRST205`): `ktn_provisioning_jobs`, `ktn_sync_events`, `ktn_notifications`.
  - Cột thiếu trên `ktn_students` (`400 42703`): `search_text`, `account_status`, `sync_status`, `last_synced_at`, `last_sync_error`, `internal_note`.
  - Cột thiếu trên `ktn_teachers` (`400 PGRST204`): `assigned_classes`, `password_hash`, `provisioning_status`.
  - RPC thiếu (`404 PGRST202`): `public.ktn_search_students`.
- **Kiểm tra bảo mật RLS với `SUPABASE_PUBLISHABLE_KEY` (`anon`)**:
  - Truy vấn bằng key `anon` vào `ktn_students`, `ktn_teachers`, `ktn_homeworks`, `ktn_messages`, `ktn_orders` đều trả về `[]` (`0` bản ghi) — **ĐẠT**, không rò rỉ dữ liệu học viên qua `anon` key.

### E.3. Các lỗi phát hiện qua kiểm thử Live và bản vá đã thực hiện trên nhánh `feat/ktn-react-ui-v2`

Trong quá trình kiểm thử thực tế, chúng tôi đã phát hiện và **vá triệt để trên nhánh `feat/ktn-react-ui-v2`** các vấn đề sau:

1. **[Đã vá trong `cloudflare-worker-sw-proxy.js` & `supabase_migration_v3.sql`] Lỗi Fallback tìm kiếm trên Schema V2 (bỏ sót học viên có dấu tiếng Việt, học viên ngoài mốc 1.000 dòng, tên không dấu viết liền `hoangngan`, và bộ lọc khóa học JSONB object `online_courses`)**:
   - *Nguyên nhân*:
     1. Nhánh `usedLegacySchemaFallback` trước đây dùng `ILIKE` với chuỗi không dấu (`'Ngân' ILIKE '%ngan%'` = `false`) và giới hạn `limit=500`, làm rơi **192 học viên có dấu** và **46 học viên từ dòng `1001..1046`**.
     2. Khi lọc theo `courseId` qua PostgREST fallback (`online_courses=cs.["6adadba969897b0002482ca5"]`), dữ liệu thật trên `ktn_students.online_courses` lưu mảng JSONB object `[{"id":"6adadba969897b0002482ca5","code":"HSK1-30","title":"HSK1 3.0"}]` nên truy vấn mảng chuỗi trả về `0` kết quả mà không báo lỗi `400`.
     3. Khi tìm tên tiếng Việt không dấu viết liền (`q=hoangngan`), `buildStudentSearchText` chỉ lưu `"hoang ngan"` (có khoảng trắng) nên bỏ sót các học viên tên `Hoàng Ngân` có email khác.
   - *Bản vá*:
     - Tải phân trang các trang `1,000` bản ghi (`offset=0`, `offset=1000`) khi fallback trên Schema V2.
     - Sửa bộ lọc `courseFilter` trong PostgREST fallback thành `or=(online_courses.cs.[{"id":"..."}],online_courses.cs.["..."])` để khớp cả định dạng JSONB object lẫn chuỗi.
     - Bổ sung tên chuẩn hóa viết liền (`compactName`) vào `buildStudentSearchText`, `filterAndRankStudents` và trigger `ktn_students_update_search_fields()` trong `supabase_migration_v3.sql`.
     - Mở rộng bài test hồi quy `D17-LEGACY-V2-SCHEMA-VIETNAMESE-SEARCH-FALLBACK` và bộ giả lập PostgREST `.cs.` (`55/55 PASS`).
2. **[Đã vá trong `cloudflare-worker-sw-proxy.js` & `sll-admin.html`] Chuyển tiếp và hiển thị mật khẩu khởi tạo 1 lần (`initialPassword`) khi tạo học viên mới ở Tab 2 (`/sll-admin.html`)**:
   - *Nguyên nhân*: `POST /api/ktn/students/courses` chưa chuyển tiếp `initialPassword: body.initialPassword || body.password` vào `provisionStudentOnIzTeach`, và hàm `saveStudentCourseAssignment` trong [sll-admin.html](../../sll-admin.html) chưa gọi `copyApprovedAccount` khi `res.data.accountCreated && res.data.initialPassword` trả về.
   - *Bản vá*: Đã cập nhật cả [cloudflare-worker-sw-proxy.js](../../cloudflare-worker-sw-proxy.js) và [sll-admin.html](../../sll-admin.html) để lưu `ephemeralInitialPasswords` và tự động sao chép + hiển thị mật khẩu khởi tạo 1 lần cho Admin ngay khi tạo học viên mới.
3. **[Đã vá trong `deploy_ktn_react_v2_izteach.cjs`] Sửa API Gateway Custom Page (`k90adfn1jk`) và tự động đăng nhập lấy Admin Token**:
   - *Bản vá*: Tách `IZTEACH_CUSTOM_PAGE_API_BASE` (`k90adfn1jk`) và bổ sung `resolveIzTeachAdminToken()` tự động lấy token mới qua `gcnj5paf1j.../prod/signin`.
4. **[Đã vá trong `.github/workflows/ci-quality-gate.yml` & `verify-ui-v2.mjs`] Tối ưu thời gian chạy GitHub Actions CI Quality Gate**:
   - *Nguyên nhân*: Bước cài đặt lại Playwright Chromium (`npx playwright install --with-deps chromium`) trên runner `ubuntu-latest` (vốn đã có sẵn `/usr/bin/google-chrome` được `verify-ui-v2.mjs` ưu tiên sử dụng) làm tốn thêm `~3.5 phút` khiến job bị chạm mốc `timeout-minutes: 10`.
   - *Bản vá*: Chỉ chạy `playwright install` nếu runner chưa có `/usr/bin/google-chrome`, thêm `process.exit(0)` sau khi hoàn tất E2E suite và nâng `timeout-minutes: 15`.

### E.4. Kế hoạch Migration Supabase V3 An toàn (Backup · Dry-Run · Rollback) trình Chủ dự án phê duyệt

Vì `supabase_migration_v3.sql` chỉ sử dụng các lệnh **bổ sung không phá hủy (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`)**, quá trình nâng cấp từ Schema V2 lên Schema V3 hoàn toàn tương thích ngược với Worker V2 đang chạy. Quy trình thực thi 4 bước khi được phê duyệt:

1. **Bước 1 — Sao lưu toàn bộ dữ liệu hiện tại (Backup)**:
   - Xuất snapshot JSON/CSV toàn bộ các bảng `ktn_students` (`1,046` dòng across 2 pages `offset=0` & `offset=1000`), `ktn_teachers`, `ktn_classes`, `ktn_courses`, `ktn_homeworks`, `ktn_orders`, `ktn_messages`, `ktn_attendance` vào thư mục backup cục bộ trước khi chạy SQL.
2. **Bước 2 — Kiểm tra Dry-Run trong Transaction**:
   - Mở phiên SQL trên Supabase SQL Editor, chạy `BEGIN;`, thực thi nội dung [supabase_migration_v3.sql](../../supabase_migration_v3.sql), kiểm tra `SELECT count(*) FROM public.ktn_search_students('ngan', NULL, NULL, NULL, NULL, NULL, NULL, 20, 0);` và `ROLLBACK;` để xác nhận `0` lỗi cú pháp hay xung đột dữ liệu.
3. **Bước 3 — Áp dụng Migration V3 chính thức & Kiểm tra sau nâng cấp**:
   - Thực thi `supabase_migration_v3.sql` và `COMMIT;`.
   - Xác minh: (a) `ktn_students` giữ nguyên đủ `1,046` dòng; (b) cột `search_text` được backfill tự động cho cả `1,046` học viên; (c) RPC `ktn_search_students` trả kết quả `< 50ms`.
4. **Bước 4 — Kế hoạch Rollback tức thì (nếu cần)**:
   - Vì không xóa hay đổi kiểu bất kỳ cột V2 nào, nếu cần rollback chỉ cần `DROP FUNCTION IF EXISTS public.ktn_search_students;` — Worker V2/V3 tự động chuyển về nhánh PostgREST fallback ngay lập tức mà không gián đoạn dịch vụ.

---

## F. TRẠNG THÁI NGHIỆM THU CUỐI CÙNG (FINAL ACCEPTANCE VERDICT — MỤC 17.F)

- **Kết luận nghiệm thu (chọn đúng 1 theo Mục 17.F)**: **`PARTIALLY VERIFIED`**
- **Lý do chọn `PARTIALLY VERIFIED` (thay vì `READY FOR OWNER ACCEPTANCE`)**:
  1. **Toàn bộ các luồng vận hành cốt lõi cho Học viên, Giáo viên hiện hữu và Quản lý trên `https://khongtunhi.com` đã đạt `LIVE_VERIFIED` trên hạ tầng thật**:
     - Đăng nhập 3 vai trò (`admin`, `teacher`, `student`) và kiểm soát phiên/đăng xuất.
     - Cấp khóa học mới, cấp thêm khóa học thứ 2, chống trùng lặp (idempotency), thu hồi khóa học và xếp lớp đồng bộ 3 chiều (`KTN ↔ izTeach ↔ Supabase`) chính xác 100%, không tự gán nhầm lớp `YCT2-04`.
     - Xem video bài giảng HLS thật từ `media.izteach.vn` trên cả Desktop (`1280×720`) lẫn Mobile (`390×844`, `858×480`, không tràn ngang).
     - Tải file thu âm `.wav` thật lên S3/CloudFront, nộp bài tập Bài 1, giáo viên nghe file thu âm và chấm `9.5đ` đồng bộ về cả izTeach (`state: approved`, `mark: 9.5`) lẫn giao diện Học viên (`⭐ 9.5 / 10 · Đã hoàn thành`).
     - Chat 2 chiều văn bản + tin nhắn thoại (`.wav`) giữa Học viên và Giáo viên, đầy đủ 3 loại thông báo (`homework_submitted`, `homework_graded`, `chat_message`), lưu trạng thái đã đọc bền vững và chặn `403` đối với học viên lớp khác.
  2. **Các hạng mục chưa đạt trên Production hiện tại do bản V3 (`feat/ktn-react-ui-v2`, PR #1) chưa được phép deploy (`NOT_DEPLOYED`)**:
     - Tạo giáo viên mới trên Live V2 (`bf88994`) báo `200 OK` giả do thiếu cột Schema V3 (`LIVE_FAILED` trên live, đã sửa và pass `55/55` trên nhánh V3).
     - Tạo học viên hoàn toàn mới trên Live V2 chưa hiển thị mật khẩu khởi tạo 1 lần (`PARTIAL_SYNC` trên live, đã sửa trên nhánh V3).
     - Tìm kiếm học viên trên Live V2 bị giới hạn ở `1,000/1,046` dòng (`PARTIAL_SYNC` trên live, đã sửa trên nhánh V3 đạt `1,046/1,046`).
  3. **Điều kiện chuyển sang `READY FOR OWNER ACCEPTANCE`**: Ngay khi Chủ dự án phê duyệt thực thi **3 bước Cutover** ở Mục A.1 (chạy `supabase_migration_v3.sql`, deploy Cloudflare Worker V3 từ PR #1, và chạy `reconcile`), hệ thống live sẽ đạt `READY FOR OWNER ACCEPTANCE` toàn diện.
