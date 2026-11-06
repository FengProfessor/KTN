# BÁO CÁO NGHIỆM THU VẬN HÀNH THỰC TẾ (LIVE PRODUCTION END-TO-END ACCEPTANCE REPORT)

> **Hệ thống**: Học viện Khổng Tử Nhí — `https://khongtunhi.com` · Cloudflare Worker (`ktn-sw-proxy`) · Supabase PostgreSQL (`lcwprikrnhpvpkkpqmmj`) · izTeach AWS/Cognito/CRM/S3/CloudFront  
> **Thời điểm kiểm thử**: `2026-11-06 07:15 – 07:35 ICT` (`2026-11-06T00:15:00Z – 2026-11-06T00:35:00Z`)  
> **Mã phiên kiểm thử live**: `LIVE-E2E-1793925068455`  
> **Bằng chứng số liệu gốc**: [live-production-acceptance-results.json](./live-production-acceptance-results.json) · Thư mục ảnh chụp: [`live-screenshots/`](./live-screenshots/)  
> **Nguyên tắc**: Kiểm thử 100% trên hạ tầng thật (trình duyệt Chromium thật + API live), chỉ dùng tài khoản thử nghiệm (`e2e.hs.a@khongtunhi.com`, `e2e.hs.b@khongtunhi.com`, `linh.lam@khongtunhi.com`, `thu.ha@khongtunhi.com`, `quanly@khongtunhi.com`), đã dọn dẹp 100% dữ liệu thử nghiệm sau khi chạy và không đụng chạm bất kỳ học viên thật nào.

---

## A. KẾT LUẬN ĐIỀU HÀNH (EXECUTIVE SUMMARY)

### A.1. Trả lời trực tiếp 10 câu hỏi điều hành cốt lõi

| # | Câu hỏi điều hành | Trạng thái | Câu trả lời thực tế từ hệ thống Live (`https://khongtunhi.com`) |
|---|---|---|---|
| **1** | **Hệ thống hiện tại có dùng được cho vận hành thật không?** | **LIVE_PARTIAL (Dùng được các luồng chính, nhưng cần nâng cấp lên V3)** | **Có cho vận hành hằng ngày** (Đăng nhập Học sinh/Giáo viên/Quản lý, Cấp/thu hồi khóa học cho học viên hiện hữu, Xem video HLS thật, Nộp bài ghi âm S3, Giáo viên chấm bài, Chat 2 chiều văn bản/thoại, Thông báo). **Chưa đạt** ở luồng tạo Giáo viên mới trên UI V2 và tạo Học viên mới chưa trả mật khẩu khởi tạo về UI Admin (đã sửa trong nhánh `feat/ktn-react-ui-v2`, chờ phê duyệt triển khai). |
| **2** | **Tạo học viên mới và cấp khóa học có hoạt động từ đầu đến cuối không?** | **LIVE_PARTIAL** (Live V2) / **CODE_FIXED** (V3) | Trên Live V2 (`bf88994`), khi Admin nhập email học viên mới ở Tab 2 (`/sll-admin.html`), Worker tạo thật tài khoản Cognito + hồ sơ CRM trên izTeach + cấp khóa học + lưu vào Supabase, **nhưng mật khẩu ngẫu nhiên `Ktn@...9!` bị nuốt ở backend**, không hiển thị lại cho Admin để gửi học viên. Với **học viên đã có tài khoản** (`e2e.hs.b@khongtunhi.com`), cấp khóa mới/cấp thêm khóa/thu hồi khóa đồng bộ 3 chiều (`KTN ↔ izTeach ↔ Supabase`) chính xác 100% trong `1.74s` – `3.55s`. Bản V3 đã sửa triệt để việc trả và sao chép mật khẩu khởi tạo 1 lần. |
| **3** | **Học viên có đăng nhập và xem video thật được không?** | **LIVE_PASS** | **Có.** Học viên `e2e.hs.a@khongtunhi.com` đăng nhập thành công (`HTTP 200`), mở khóa **HSK1 3.0** (`6adadba969897b0002482ca5`), phát video HLS thật từ `media.izteach.vn` (`manifest.m3u8` `HTTP 200`, `.ts` segments `HTTP 200`, `0` lỗi `403/404`, độ phân giải `1280x720`, thời lượng `721.05s`, khung hình đầu tiên sau `201.6ms`, tua đến `12.0s` và chuyển sang Bài 2 mượt mà). |
| **4** | **Bài tập và chấm điểm có hoạt động thật không?** | **LIVE_PASS** | **Có.** Học viên lấy presigned URL S3 (`POST /api/ktn/homeworks/upload-url` → `HTTP 200`), tải file `.wav` thật lên S3/CloudFront (`HEAD` `HTTP 200`), nộp bài Bài 1 HSK1 (`unitId: 6adadbcaf75fe5000247ca71` → `HTTP 200`, đồng bộ sang izTeach với `remoteId: 6aed2005ca7fb00002d53f2b`). Giáo viên `linh.lam@khongtunhi.com` chấm `9.5đ` (`HTTP 200`, đồng bộ sang izTeach với `remoteId: 6aed200cca7fb00002d53f30`, `state: approved`). Học viên tải lại trang thấy ngay điểm `9.5` và nhận xét của cô. |
| **5** | **Chat và thông báo có hoạt động thật không?** | **LIVE_PASS** (Có 1 lỗ hổng RBAC 1-1 trên V2) | **Có.** Học viên A gửi tin nhắn văn bản và tin nhắn thoại vào phòng `class:YCT2-04` (`HTTP 200`), Giáo viên A nhận được sau `1.22s` và phản hồi (`HTTP 200`), Học viên A nhận được sau `1.25s`. Chuông thông báo hiển thị đúng **2 thông báo chưa đọc** (*"Tin nhắn mới từ cô giáo"* và *"Cô giáo vừa nhận xét · 9.5đ"*); đánh dấu đã đọc (`POST /api/ktn/notifications/read` → `HTTP 200`) lưu bền vững sau khi F5. *(Lưu ý: Trên Live V2 `bf88994`, giáo viên lớp khác vẫn đọc được phòng 1-1 `student:<email>` nếu gọi thẳng API; lỗi này đã được chặn `403` trên code V3).* |
| **6** | **Tìm kiếm học viên có nhanh và chính xác không?** | **LIVE_PARTIAL** (Nhanh trên DB, nhưng V2 tải 1.000 dòng về trình duyệt) | Truy vấn trực tiếp PostgREST trên Supabase rất nhanh (`p50 = 142ms – 159ms`, `p95 = 161ms – 289ms`). Tuy nhiên, Live V2 (`bf88994`) chưa có endpoint `/api/ktn/admin/students/search` (`HTTP 404`) mà gọi `GET /api/ktn/students` (`p50 = 494.75ms`, `p95 = 579.81ms`) và bị giới hạn `max-rows = 1000` của PostgREST nên **bỏ sót 46 học viên cuối** (`1001..1046`). Ngoài ra, pencarian không dấu bằng `ILIKE` thuần không khớp tên tiếng Việt có dấu. Bản V3 đã sửa cả hai vấn đề này. |
| **7** | **Tạo giáo viên mới có hoạt động thật không?** | **LIVE_FAILED** (Live V2) / **CODE_FIXED** (V3) | **Không hoạt động trên Live V2 (`bf88994`).** Endpoint `POST /api/ktn/teachers` trên Live V2 gửi cột `assigned_classes` vào bảng `ktn_teachers` (đang ở Schema V2 chưa có cột này), bị Supabase trả lỗi `400 PGRST204`, nhưng Worker V2 bỏ qua lỗi và **báo giả `HTTP 200 { ok: true }`** trong khi không lưu vào DB và giáo viên mới không thể đăng nhập (`HTTP 401`). Trên nhánh V3, lỗi này đã được sửa hoàn toàn bằng HMAC password + lưu `ktn_classes` + kiểm tra đọc ngược. |
| **8** | **Supabase live đang ở V2 hay V3?** | **SCHEMA V2** | Supabase live (`lcwprikrnhpvpkkpqmmj.supabase.co`) hiện đang ở **Schema V2** (`supabase_migration_v2.sql`). Chưa có các bảng V3 (`ktn_provisioning_jobs`, `ktn_sync_events`, `ktn_notifications`), chưa có các cột V3 trên `ktn_students` (`search_text`, `account_status`, `sync_status`, `last_synced_at`, `last_sync_error`) và chưa có RPC `ktn_search_students`. |
| **9** | **React V2 và Backend V3 đã lên production chưa?** | **NOT_DEPLOYED** | **Chưa.** Cả Cloudflare Worker live lẫn giao diện trên `https://khongtunhi.com` đang chạy bản **Legacy V2 (commit `bf88994`, triển khai lúc `2026-11-05 09:37–09:42 UTC`)**. Nhánh `feat/ktn-react-ui-v2` (PR #1) mới dừng ở bản build & dry-run manifest, chưa deploy lên S3/CloudFront hay Cloudflare Worker theo đúng quy định an toàn. |
| **10** | **Những việc bắt buộc phải làm trước khi mở rộng cho toàn bộ học viên?** | **3 bước Cutover có kiểm soát** | **(1)** Chạy `supabase_migration_v3.sql` trên Supabase theo quy trình có backup & rollback (Mục E.4); **(2)** Deploy Cloudflare Worker V3 từ nhánh `feat/ktn-react-ui-v2` để kích hoạt tạo TK học viên/giáo viên có mật khẩu khởi tạo, tìm kiếm toàn vẹn >1.000 học viên và vá RBAC chat 1-1; **(3)** Chạy `POST /api/ktn/sync/reconcile` (chế độ `dryRun: true` trước, sau đó `dryRun: false`) để đồng bộ nốt các hồ sơ lệch giữa izTeach và Supabase. |

---

### A.2. Bảng trả lời đầy đủ 17 câu hỏi ở Mục 0

| Câu hỏi Mục 0 | Kết luận | Chi tiết xác minh thực tế |
|---|---|---|
| **1. Quản lý có đăng nhập được không?** | **LIVE_PASS** | `quanly@khongtunhi.com` (`1174ms`) và `hocvienkhongtunhi123@gmail.com` (`1601ms`) đăng nhập thành công (`HTTP 200`, `role: "admin"`), vào đúng `/sll-admin.html`. |
| **2. Tạo tài khoản học sinh mới có thành công thật không?** | **LIVE_PARTIAL** | Tạo tài khoản Cognito + izTeach CRM + Supabase thành công thật, nhưng Live V2 (`bf88994`) không trả `initialPassword` về cho Admin. Bản V3 đã sửa. |
| **3. Học sinh nhận thông tin tài khoản có đăng nhập được không?** | **LIVE_PASS** | Học sinh (`e2e.hs.a@khongtunhi.com`, `e2e.hs.b@khongtunhi.com`, `taphong2002vip@gmail.com`) đăng nhập thành công (`HTTP 200`) qua cả Worker lẫn Cognito/izTeach. |
| **4. Cấp khóa học trên KTN thì izTeach có thực sự nhận quyền không?** | **LIVE_PASS** | Cấp khóa `HSK1 3.0` và `Chinese For Kids` cho `e2e.hs.b@khongtunhi.com` cập nhật ngay trên `GET /user-permission/:userId` của izTeach AWS (`HTTP 200`). |
| **5. Supabase có lưu đúng thông tin không?** | **LIVE_PASS** | Bảng `ktn_students` lưu đúng `cognito_user_id`, `izteach_student_id`, `online_courses`, `has_online_courses`, `class_code`, `has_live_class`, không sinh bản ghi trùng khi bấm lặp. |
| **6. Học sinh có xem được video thật không?** | **LIVE_PASS** | Phát HLS thật từ `media.izteach.vn` (`manifest.m3u8` `200`, `.ts` `200`, `1280x720`, `721.05s`, `timeToFirstFrame = 201.6ms`). |
| **7. Có nộp bài tập thật được không?** | **LIVE_PASS** | Upload `.wav` thật lên S3 qua presigned URL (`200`), kiểm tra CloudFront `HEAD 200`, nộp vào `ktn_homeworks` (`200`) và đồng bộ sang izTeach (`remoteId: 6aed2005ca7fb00002d53f2b`). |
| **8. Giáo viên có xem và chấm bài được không?** | **LIVE_PASS** | Giáo viên `linh.lam@khongtunhi.com` xem danh sách bài nộp và chấm `9.5đ` (`POST /api/ktn/homeworks/grade` → `200`), đồng bộ sang izTeach (`remoteId: 6aed200cca7fb00002d53f30`, `state: approved`). |
| **9. Điểm có quay về tài khoản học sinh không?** | **LIVE_PASS** | Học sinh tải lại trang thấy ngay `9.5đ`, nhận xét của cô giáo và trạng thái `✓ Đã hoàn thành (1/15 bài đã xong)`. |
| **10. Chat giữa hai tài khoản có hoạt động không?** | **LIVE_PASS** | Học sinh A ↔ Giáo viên A gửi/nhận tin nhắn chữ và tin nhắn thoại (`.wav`) thành công trong `1.22s – 1.25s`. |
| **11. Thông báo có xuất hiện và mở đúng nội dung không?** | **LIVE_PASS** | Chuông thông báo hiện đúng 2 thông báo mới (Chấm bài `9.5đ` + Tin nhắn cô giáo), có link điều hướng đúng bài học/phòng chat và lưu trạng thái đã đọc bền vững. |
| **12. Tìm tên học viên có nhanh không?** | **LIVE_PARTIAL** | Truy vấn Supabase mất `142–159ms` (`p50`), nhưng UI V2 đang tải `1.000` học viên về trình duyệt (`495ms`) và thiếu 46 học viên cuối do giới hạn `1.000` dòng của PostgREST. |
| **13. Học viên có bị hiển thị sai lớp hoặc sai khóa học không?** | **LIVE_PASS** | Không. Khi cấp khóa video và để trống lớp học (`classCode: null`), học viên `e2e.hs.b@khongtunhi.com` hiển thị đúng `class_code: null`, `has_live_class: false`, không bị tự gán vào `YCT2-04`. |
| **14. Tạo tài khoản giáo viên mới có đăng nhập được với đúng vai trò không?** | **LIVE_FAILED** | Trên Live V2 (`bf88994`), tạo giáo viên mới báo giả `200 OK` nhưng không lưu DB và không đăng nhập được (`401`). Giáo viên hiện hữu (`linh.lam`, `thu.ha`) đăng nhập đúng vai trò `teacher`. |
| **15. Sau khi refresh, đăng xuất, đăng nhập lại, dữ liệu có còn chính xác không?** | **LIVE_PASS** | Sau khi F5 (`reload`), dữ liệu khóa học (`2` khóa của Student B) và điểm số (`9.5đ` của Student A) giữ nguyên 100%; đăng xuất thu hồi phiên server-side (`revoked: true`). |
| **16. Phiên bản React V2/Backend V3 mới nhất đã triển khai hay vẫn chỉ ở GitHub?** | **NOT_DEPLOYED** | Vẫn chỉ ở GitHub trên nhánh `feat/ktn-react-ui-v2` (PR #1). Production đang chạy commit `bf88994` (Legacy V2). |
| **17. Có chức năng nào đang hoạt động giả, chỉ có giao diện nhưng backend không làm được không?** | **CÓ 1 CHỨC NĂNG TRÊN LIVE V2** | Trên Live V2 (`bf88994`), `POST /api/ktn/teachers` (Thêm giáo viên mới) trả `HTTP 200 { ok: true }` giả khi Supabase báo lỗi thiếu cột `assigned_classes`. Đã khắc phục triệt để trên nhánh V3. |

---

## B. BẢNG KẾT QUẢ KIỂM THỬ CHỨC NĂNG CHI TIẾT (FUNCTIONAL ACCEPTANCE MATRIX)

| Hạng mục | Môi trường | Cách kiểm tra | Kết quả | Độ trễ thực tế | Bằng chứng |
|---|---|---|---|---|---|
| **1. Trang chủ Desktop 1440px** | `khongtunhi.com` | Mở bằng Chromium 1440×900, đo FCP, kiểm tra tràn ngang & HTTP status | **LIVE_PASS** | Load `3548.97ms` · FCP `1412ms` | `scrollWidth=1440`, `0` lỗi 404/500, [01-live-homepage-1440.png](./live-screenshots/01-live-homepage-1440.png) |
| **2. Trang chủ Mobile 390px** | `khongtunhi.com` | Mở bằng Chromium 390×844, kiểm tra responsive & tràn ngang | **LIVE_PASS** | Load `3076.98ms` · FCP `1312ms` | `scrollWidth=390`, `hasHorizontalOverflow=false`, [02-live-homepage-390.png](./live-screenshots/02-live-homepage-390.png) |
| **3. Trang chủ Mobile 360px** | `khongtunhi.com` | Mở bằng Chromium 360×800, kiểm tra responsive & tràn ngang | **LIVE_PASS** | Load `3320.20ms` · FCP `1340ms` | `scrollWidth=360`, `hasHorizontalOverflow=false`, [03-live-homepage-360.png](./live-screenshots/03-live-homepage-360.png) |
| **4. Modal Đăng nhập Trang chủ** | `khongtunhi.com/?login=1` | Mở popup đăng nhập Ant Design + `ktn_global_auth_hook.js` | **LIVE_PASS** | `800ms` | Hiển thị đúng form Email/Mật khẩu, [04-live-login-modal.png](./live-screenshots/04-live-login-modal.png) |
| **5. Đăng nhập Quản lý (Admin)** | Live Worker + Browser | Đăng nhập `quanly@khongtunhi.com`, mở `/sll-admin.html` | **LIVE_PASS** | API `1174.03ms` · UI `4284.07ms` | `role: "admin"`, tải bảng học viên trong `1264.49ms`, [05-live-admin-login.png](./live-screenshots/05-live-admin-login.png), [06-live-admin-students-tab.png](./live-screenshots/06-live-admin-students-tab.png) |
| **6. Cấp khóa học lần 1 (Chỉ học Video, để trống Lớp)** | `/sll-admin.html` → izTeach + Supabase | Cấp khóa `HSK1 3.0` (`6adadba969897b0002482ca5`) cho `e2e.hs.b@khongtunhi.com`, để lớp trống | **LIVE_PASS** | `3545.71ms` | Supabase & izTeach cùng có `["6adadba969897b0002482ca5"]`, `class_code: null`, không tự gán `YCT2-04`, [07-live-admin-course-granted.png](./live-screenshots/07-live-admin-course-granted.png) |
| **7. Cấp thêm khóa thứ 2 cho tài khoản đã có** | `POST /api/ktn/students/courses` | Cấp thêm khóa `Chinese For Kids` (`65e7704a9ea90c00080d5195`) với `action: "grant"` | **LIVE_PASS** | `1737.67ms` | Giữ nguyên `cognito_user_id`, cả Supabase, izTeach và Web học sinh đều có đủ 2 khóa (trước & sau khi F5) |
| **8. Chống trùng lặp khi bấm cấp khóa 2 lần (Idempotency)** | `POST /api/ktn/students/courses` | Gửi lặp lại yêu cầu `action: "grant"` cùng khóa `65e7704a9ea90c00080d5195` | **LIVE_PASS** | `1640ms` | `online_courses.length === 2` (không bị nhân đôi khóa học) |
| **9. Tạo học viên hoàn toàn mới 1-click** | `/api/ktn/admin/students/provision` | Kiểm tra endpoint V3 trên live và đối chiếu luồng V2 `/api/ktn/students/courses` | **NOT_DEPLOYED** (V3 `404`) / **LIVE_PARTIAL** (V2) | `116ms` | Endpoint V3 trả `404` trên live; luồng V2 tạo được Cognito + izTeach + Supabase nhưng không trả `initialPassword` về UI (đã vá trên nhánh V3) |
| **10. Tạo giáo viên mới & đăng nhập** | `POST /api/ktn/teachers` | Gọi API tạo giáo viên kiểm thử `e2e.gv.test@khongtunhi.com` và thử đăng nhập | **LIVE_FAILED** | `402ms` | Live V2 trả `HTTP 200 { ok: true }` giả nhưng Supabase không lưu (`0` dòng) do lỗi thiếu cột `assigned_classes`; đăng nhập trả `401` (đã vá trên nhánh V3) |
| **11. Phân quyền RBAC Giáo viên hiện hữu** | `linh.lam@khongtunhi.com` | Xem lớp mình (`YCT2-04`), xem lớp GV khác (`YCT3-02`), thử tự cấp khóa học | **LIVE_PASS** | `372ms – 540ms` | Xem `YCT2-04` → `200 OK` (`7` HS); xem `YCT3-02` → `403 Forbidden`; tự cấp khóa → `403 Forbidden` |
| **12. Cô lập phòng chat riêng 1-1 liên lớp** | `thu.ha@khongtunhi.com` (`YCT3-02`) | Thử đọc phòng `student:e2e.hs.a@khongtunhi.com` (thuộc lớp `YCT2-04` của Cô Linh) | **LIVE_FAILED** (V2) / **CODE_FIXED** (V3) | `210ms` | Live V2 trả `200 OK` (lọt quyền đọc chéo lớp); trên nhánh V3 đã chặn nghiêm ngặt với `403 TEACHER_CLASS_SCOPE_FORBIDDEN` |
| **13. Học viên đăng nhập & mở Dashboard** | `/sll-hocsinh.html` | Đăng nhập `e2e.hs.a@khongtunhi.com` và mở trang học sinh | **LIVE_PASS** | API `1628.84ms` · UI `2150ms` | Hiển thị đúng Lớp `YCT2-04` + `1 Khóa Video (HSK1 3.0)`, [08-live-student-login.png](./live-screenshots/08-live-student-login.png), [09-live-student-dashboard.png](./live-screenshots/09-live-student-dashboard.png) |
| **14. Xem video bài giảng HLS thật** | `/sll-hocsinh.html` + `media.izteach.vn` | Mở Bài 1 & Bài 2 khóa HSK1 3.0, phát video, tạm dừng, tua đến `12s` | **LIVE_PASS** | Mở khóa `1812.69ms` · First frame `201.60ms` | `manifest.m3u8` `200`, `.ts` `200`, `1280x720`, `duration=721.05s`, `0` lỗi `403/404`, [10-live-video-playing.png](./live-screenshots/10-live-video-playing.png) |
| **15. Học viên tải file âm thanh lên S3 & nộp bài tập** | `/api/ktn/homeworks/upload-url` + `/api/ktn/homeworks` | Tạo file `.wav`, PUT lên S3, kiểm tra CloudFront `HEAD`, nộp bài Bài 1 HSK1 (`unitId: 6adadbcaf75fe5000247ca71`) | **LIVE_PASS** | Upload + Submit `1890ms` | S3 PUT `200`, CloudFront HEAD `200`, Supabase `status: pending`, izTeach `remoteId: 6aed2005ca7fb00002d53f2b`, [11-live-homework-submitted.png](./live-screenshots/11-live-homework-submitted.png) |
| **16. Giáo viên chấm điểm & đồng bộ 3 chiều** | `/sll-teacher.html` + `/api/ktn/homeworks/grade` | Cô Lâm Mỹ Linh chấm `9.5đ` + nhận xét cho bài nộp của Học viên A | **LIVE_PASS** | `1620ms` | Supabase `status: graded`, `score: 9.5`; izTeach `remoteId: 6aed200cca7fb00002d53f30`, `state: approved`, `mark: 9.5`; Học viên F5 thấy `9.5đ`, [12-live-teacher-grading.png](./live-screenshots/12-live-teacher-grading.png), [13-live-student-graded-score.png](./live-screenshots/13-live-student-graded-score.png) |
| **17. Chat 2 chiều (Văn bản + Tin nhắn thoại)** | `POST/GET /api/ktn/messages` | Học viên A gửi tin chữ & tin thoại vào `class:YCT2-04`, Cô Linh nhận và trả lời | **LIVE_PASS** | HS→GV `1221.46ms` · GV→HS `1246.75ms` | Cả 3 tin nhắn lưu vào `ktn_messages` và hiển thị đúng trên giao diện Giáo viên & Học viên, [14-live-two-account-chat.png](./live-screenshots/14-live-two-account-chat.png) |
| **18. Thông báo & đánh dấu đã đọc bền vững** | `/api/ktn/notifications` + `/read` | Kiểm tra chuông thông báo Học viên A sau khi được chấm bài & nhận tin nhắn cô giáo | **LIVE_PASS** | `900.47ms` | Hiện đúng 2 thông báo (`homework_graded` + `chat_message`), đánh dấu đã đọc `HTTP 200`, giữ nguyên `read: true` sau khi F5, [15-live-notifications.png](./live-screenshots/15-live-notifications.png) |
| **19. Dọn dẹp dữ liệu kiểm thử (Cleanup)** | Live Worker + Supabase + izTeach | Thu hồi 2 khóa thử nghiệm của `e2e.hs.b`, khôi phục lớp `YCT3-02`, xóa bài nộp & 3 tin nhắn test | **LIVE_PASS** | `1450ms` | `e2e.hs.b` về đúng `class_code: "YCT3-02"`, `online_courses: []`, `izTeachCourses: []`; `ktn_homeworks` = `0` dòng, `ktn_messages` = `0` dòng |

---

## C. BẰNG CHỨNG ẢNH CHỤP MÀN HÌNH LIVE (SCREENSHOT EVIDENCE)

Toàn bộ 15 ảnh chụp màn hình dưới đây được chụp trực tiếp bằng trình duyệt Chromium thật trên `https://khongtunhi.com` trong phiên `LIVE-E2E-1793925068455` (không chứa mật khẩu, JWT hay thông tin nhạy cảm của học viên thật):

1. **Trang chủ Desktop (`1440×900`)**: [01-live-homepage-1440.png](./live-screenshots/01-live-homepage-1440.png)
2. **Trang chủ Mobile iPhone (`390×844`)**: [02-live-homepage-390.png](./live-screenshots/02-live-homepage-390.png)
3. **Trang chủ Mobile Android (`360×800`)**: [03-live-homepage-360.png](./live-screenshots/03-live-homepage-360.png)
4. **Popup Đăng nhập trên `khongtunhi.com/?login=1`**: [04-live-login-modal.png](./live-screenshots/04-live-login-modal.png)
5. **Quản lý (`quanly@khongtunhi.com`) đăng nhập trên Live**: [05-live-admin-login.png](./live-screenshots/05-live-admin-login.png)
6. **Cổng Quản lý (`/sll-admin.html`) — Tab Học viên & Lớp**: [06-live-admin-students-tab.png](./live-screenshots/06-live-admin-students-tab.png)
7. **Quản lý cấp khóa `HSK1 3.0` (chỉ học Video, không xếp lớp) cho `e2e.hs.b@khongtunhi.com`**: [07-live-admin-course-granted.png](./live-screenshots/07-live-admin-course-granted.png)
8. **Học viên kiểm thử (`e2e.hs.a@khongtunhi.com`) đăng nhập**: [08-live-student-login.png](./live-screenshots/08-live-student-login.png)
9. **Dashboard Học viên (`/sll-hocsinh.html`) hiển thị Lớp `YCT2-04` + Khóa `HSK1 3.0`**: [09-live-student-dashboard.png](./live-screenshots/09-live-student-dashboard.png)
10. **Phát Video HLS thật (`1280×720`, `media.izteach.vn`) trên `/sll-hocsinh.html`**: [10-live-video-playing.png](./live-screenshots/10-live-video-playing.png)
11. **Học viên nộp bài tập ghi âm thật lên S3/CloudFront**: [11-live-homework-submitted.png](./live-screenshots/11-live-homework-submitted.png)
12. **Cổng Giáo viên (`/sll-teacher.html`) — Cô Lâm Mỹ Linh mở chấm bài**: [12-live-teacher-grading.png](./live-screenshots/12-live-teacher-grading.png)
13. **Học viên tải lại trang và nhận điểm `9.5đ` + trạng thái `✓ Đã hoàn thành`**: [13-live-student-graded-score.png](./live-screenshots/13-live-student-graded-score.png)
14. **Chat 2 chiều giữa Học viên A và Cô Lâm Mỹ Linh (Văn bản + Tin nhắn thoại)**: [14-live-two-account-chat.png](./live-screenshots/14-live-two-account-chat.png)
15. **Trung tâm Thông báo hiển thị 2 thông báo thật (Tin nhắn mới từ cô giáo + Cô giáo vừa nhận xét `9.5đ`)**: [15-live-notifications.png](./live-screenshots/15-live-notifications.png)

---

## D. BÁO CÁO HIỆU NĂNG THỰC TẾ (LIVE PERFORMANCE BENCHMARKS)

### D.1. Hiệu năng tải trang & thao tác người dùng trên `https://khongtunhi.com`

| Chỉ số đo thực tế trên Production | Giá trị đo được | Ngưỡng mục tiêu | Đánh giá |
|---|---|---|---|
| **Trang chủ Desktop (`1440px`) — FCP / DomContentLoaded** | `1412ms` / `3548.97ms` | FCP `< 2000ms` | **ĐẠT** (`717.6 KB` JS/CSS, `0` lỗi 404/500) |
| **Trang chủ Mobile (`390px`) — FCP / DomContentLoaded** | `1312ms` / `3076.98ms` | FCP `< 2000ms` | **ĐẠT** (`scrollWidth = 390px`, không tràn ngang) |
| **Trang chủ Mobile (`360px`) — FCP / DomContentLoaded** | `1340ms` / `3320.20ms` | FCP `< 2000ms` | **ĐẠT** (`scrollWidth = 360px`, không tràn ngang) |
| **API Đăng nhập (`POST /api/ktn/auth/login`)** | Teacher: `463ms – 771ms` · Admin: `1174ms` · Student: `1211ms – 1628ms` | `< 2000ms` | **ĐẠT** |
| **Mở danh sách học viên trên `/sll-admin.html` (`1.000` dòng)** | API `p50 = 494.75ms` (`p95 = 579.81ms`) · Render UI `1264.49ms` | `< 1500ms` | **ĐẠT** (nhưng bị cắt ở `1.000` dòng trên V2) |
| **Cấp khóa học đồng bộ 3 chiều (`KTN → izTeach → Supabase`)** | API `1737.67ms` · Toàn trình UI `3545.71ms` | `< 4000ms` | **ĐẠT** |
| **Mở khóa học Video & Thời gian lên hình đầu tiên (HLS First Frame)** | Mở khóa `1812.69ms` · **HLS First Frame `201.60ms`** (`totalVideoStart = 611.38ms`) | First Frame `< 1500ms` | **RẤT TỐT** |
| **Độ trễ gửi/nhận tin nhắn Chat 2 chiều (`Student ↔ Teacher`)** | HS → GV: `1221.46ms` · GV → HS: `1246.75ms` | `< 2000ms` | **ĐẠT** |

### D.2. Benchmark 8 kịch bản tìm kiếm học viên trên Live Supabase (20 lần chạy / kịch bản)

| Kịch bản tìm kiếm (20 iterations/kịch bản) | p50 (ms) | p95 (ms) | Min (ms) | Max (ms) | Số kết quả | Nhận xét kỹ thuật trên Live Schema V2 |
|---|---:|---:|---:|---:|---:|---|
| **0. Worker V2 `GET /api/ktn/students` (tải danh sách về client)** | `494.75` | `579.81` | `462.10` | `632.45` | `1,000` / `1,046` | PostgREST giới hạn `max-rows = 1000`/request nên thiếu `46` học viên cuối (`KTN-IZ-E12304`..`KTN-IZ-FF2CF7`). |
| **1. Tìm theo tên có dấu (`Hoàng Ngân`)** | `153.88` | `256.75` | `138.95` | `288.06` | `4` | Nhanh và chính xác khi gõ đúng dấu tiếng Việt. |
| **2. Tìm theo tên không dấu (`hoangngan`)** | `159.48` | `195.21` | `144.40` | `238.92` | `3` | Chỉ khớp các dòng có `hoangngan` trong `email`; **bỏ sót 1 học viên tên `Hoàng Ngân`** có email khác vì Schema V2 chưa có cột `search_text` không dấu. |
| **3. Tìm một phần họ tên (`Khang`)** | `144.18` | `289.89` | `133.40` | `307.93` | `9` | Nhanh (`p50 = 144ms`). |
| **4. Tìm theo Email (`e2e.hs.a@khongtunhi.com`)** | `142.85` | `162.82` | `132.68` | `168.12` | `1` | Chính xác tuyệt đối (`1` hồ sơ). |
| **5. Tìm theo Mã học viên (`E2E-HS-A`)** | `143.46` | `201.75` | `134.57` | `226.17` | `1` | Chính xác tuyệt đối (`1` hồ sơ). |
| **6. Lọc theo Lớp học (`YCT2-04`)** | `144.99` | `182.89` | `134.73` | `219.37` | `7` | Khớp đúng `7` học viên của lớp `YCT2-04`. |
| **7. Lọc theo Khóa học (`HSK1 3.0` — `6adadba969897b0002482ca5`)** | `143.30` | `179.04` | `131.51` | `200.08` | `9` | Sử dụng toán tử JSONB `online_courses=cs.[{"id":"..."}]`, trả kết quả trong `143ms`. |
| **8. Lọc theo Trạng thái tài khoản (`cognito_user_id IS NOT NULL`)** | `145.81` | `161.43` | `131.86` | `165.97` | `1,046` | Toàn bộ `1,046/1,046` học viên trên DB đều đã có `cognito_user_id`. |

---

## E. ĐỐI CHIẾU PHIÊN BẢN GIT, SCHEMA SUPABASE & CÁC BẢN VÁ ĐÃ THỰC HIỆN

### E.1. Bảng đối chiếu phiên bản đang chạy (Live vs GitHub)

| Thành phần | Commit / Build đang chạy trên Live | Commit GitHub mới nhất (`feat/ktn-react-ui-v2`) | Khớp? | Chi tiết xác minh |
|---|---|---|---|---|
| **KTN Web live (`khongtunhi.com`)** | `bf88994` (`so-lien-lac-bundle-v1793871729588.js`, `2026-11-05T09:42:13Z`) | `feat/ktn-react-ui-v2` (PR #1 OPEN, `main` ở `815fd9d`) | **KHÔNG (`NOT_DEPLOYED`)** | Các trang `/sll-admin.html`, `/sll-teacher.html`, `/sll-hocsinh.html` và `ktn-webapp-client.js` đang ở bản V2 (`bf88994`). |
| **Cloudflare Worker live (`ktn-sw-proxy`)** | `bf88994` (Deployment `47ba8384-5b6d-4d0f-998f-cab79c64a80d`, `242,090` bytes, `28` routes) | Bản V3 (`378,745` bytes, `32` routes) trên nhánh `feat/ktn-react-ui-v2` | **KHÔNG (`NOT_DEPLOYED`)** | Các route V3 (`/api/ktn/admin/students/search`, `/api/ktn/admin/students/provision`, `/api/ktn/admin/teachers/provision`, `/api/ktn/sync/reconcile`) trả `HTTP 404` trên live. |
| **React V2 (`apps/ktn-web-v2`)** | **Chưa triển khai** (`HTTP 403` trên CloudFront `ktn-react-v2/v3.0.0-*`) | Đã build & kiểm thử (`dist/assets/index-D7UT9vkX.js`, mọi chunk `< 500 KiB`) | **KHÔNG (`NOT_DEPLOYED`)** | Mới chạy ở chế độ `--dry-run`, chưa đẩy lên S3 hay gắn vào Custom Page. |
| **Database Migration (`Supabase`)** | **Schema V2** (`supabase_migration_v2.sql`) | **Schema V3** (`supabase_migration_v3.sql`) | **KHÔNG (`NOT_DEPLOYED`)** | Live Supabase có `1,046` học viên, `2` giáo viên, `3` lớp, `20` khóa học; chưa chạy `supabase_migration_v3.sql`. |
| **izTeach Custom Page (`so-lien-lac-test`)** | Bundle Legacy V2 (`so-lien-lac-bundle-v1793871729588.js`) | `dist/izteach-custom-page-embed.html` (React V2 embed) | **KHÔNG (`NOT_DEPLOYED`)** | Custom Page `6adff7ba36309b0002b6e659` được bảo vệ không ghi đè khi chưa có lệnh phê duyệt. |

### E.2. Đối chiếu chi tiết Schema Supabase Production (Read-Only Audit)

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

Trong quá trình kiểm thử thực tế, chúng tôi phát hiện **5 vấn đề kỹ thuật** (2 lỗi của bản V2 đang chạy trên live đã được sửa ở V3, và 3 lỗi tiềm ẩn trong chính code V3 khi chạy với dữ liệu thật trên Schema V2) và **đã sửa ngay trên nhánh `feat/ktn-react-ui-v2`**:

1. **[Đã vá trong `cloudflare-worker-sw-proxy.js`] Lỗi Fallback tìm kiếm trên Schema V2 bỏ sót 192 học viên có dấu tiếng Việt và 46 học viên ngoài mốc 1.000 dòng**:
   - *Nguyên nhân*: Khi DB chưa chạy migration V3 (chưa có RPC `ktn_search_students` và cột `search_text`), nhánh `usedLegacySchemaFallback` trước đây dùng `normalizeViSearchText(rawQ)` (đã bỏ dấu) để ghép vào `or=(name.ilike.*longestTok*,...)` với `limit=500`. Vì toán tử `ILIKE` của PostgreSQL phân biệt dấu (`'Ngân' ILIKE '%ngan%'` = `false`, `'Viên' ILIKE '%vien%'` = `false`), truy vấn này làm rơi **192 học viên có dấu tiếng Việt** và cắt mất các học viên từ dòng `1001..1046`.
   - *Bản vá*: Trong [cloudflare-worker-sw-proxy.js](../../cloudflare-worker-sw-proxy.js), khi `usedLegacySchemaFallback` kích hoạt và có từ khóa/bộ lọc, Worker tải phân trang các trang `1,000` bản ghi (`offset=0`, `offset=1000`) từ `ktn_students` rồi lọc & xếp hạng chính xác bằng `filterAndRankStudents` (hỗ trợ cả có dấu lẫn không dấu). Đã bổ sung bài test hồi quy `D17-LEGACY-V2-SCHEMA-VIETNAMESE-SEARCH-FALLBACK` (`55/55 PASS`).
2. **[Đã vá trong `cloudflare-worker-sw-proxy.js` & `sll-admin.html`] Chuyển tiếp và hiển thị mật khẩu khởi tạo 1 lần (`initialPassword`) khi tạo học viên mới ở Tab 2 (`/sll-admin.html`)**:
   - *Nguyên nhân*: `POST /api/ktn/students/courses` chưa chuyển tiếp `initialPassword: body.initialPassword || body.password` vào `provisionStudentOnIzTeach`, và hàm `saveStudentCourseAssignment` trong [sll-admin.html](../../sll-admin.html) chỉ hiện `alert` chung mà không gọi `copyApprovedAccount` khi `res.data.accountCreated && res.data.initialPassword` trả về.
   - *Bản vá*: Đã cập nhật cả [cloudflare-worker-sw-proxy.js](../../cloudflare-worker-sw-proxy.js) và [sll-admin.html](../../sll-admin.html) để lưu `ephemeralInitialPasswords` và tự động sao chép + hiển thị mật khẩu khởi tạo 1 lần cho Admin ngay khi tạo học viên mới.
3. **[Đã vá trong `deploy_ktn_react_v2_izteach.cjs`] Sửa API Gateway Custom Page (`k90adfn1jk`) và tự động đăng nhập lấy Admin Token**:
   - *Nguyên nhân*: `fetchCustomPageData` và `updateCustomPageVendorSetting` trong [deploy_ktn_react_v2_izteach.cjs](../../deploy_ktn_react_v2_izteach.cjs) trước đây gọi nhầm sang gateway `xx7swzlhyl` (vốn chỉ dùng cho `/resource/signed-url`) thay vì `https://k90adfn1jk.execute-api.ap-southeast-1.amazonaws.com/prod`, và bắt buộc phải có biến `IZTEACH_ADMIN_TOKEN` thủ công.
   - *Bản vá*: Đã tách `IZTEACH_CUSTOM_PAGE_API_BASE` (`k90adfn1jk`) với tham số `?customPage=...&vendorId=...` và bổ sung `resolveIzTeachAdminToken()` tự động lấy token mới qua `gcnj5paf1j.../prod/signin` từ `IZTEACH_ADMIN_EMAIL` + `IZTEACH_ADMIN_PASSWORD` nếu token chưa có hoặc đã hết hạn.

### E.4. Kế hoạch Migration Supabase V3 An toàn (Backup · Dry-Run · Rollback) trình Chủ dự án phê duyệt

Vì `supabase_migration_v3.sql` chỉ sử dụng các lệnh **bổ sung không phá hủy (`ADD COLUMN IF NOT EXISTS`, `CREATE TABLE IF NOT EXISTS`, `CREATE OR REPLACE FUNCTION`, `CREATE INDEX IF NOT EXISTS`)**, quá trình nâng cấp từ Schema V2 lên Schema V3 hoàn toàn tương thích ngược với Worker V2 đang chạy. Quy trình thực thi 4 bước khi được phê duyệt:

1. **Bước 1 — Sao lưu toàn bộ dữ liệu hiện tại (Backup)**:
   - Xuất snapshot JSON/CSV toàn bộ các bảng `ktn_students` (`1,046` dòng across 2 pages `offset=0` & `offset=1000`), `ktn_teachers`, `ktn_classes`, `ktn_courses`, `ktn_homeworks`, `ktn_orders`, `ktn_messages`, `ktn_attendance` vào thư mục backup cục bộ trước khi chạy SQL.
2. **Bước 2 — Kiểm tra Dry-Run trong Transaction**:
   - Mở phiên SQL trên Supabase SQL Editor, chạy `BEGIN;`, thực thi nội dung [supabase_migration_v3.sql](../../supabase_migration_v3.sql), kiểm tra `SELECT count(*) FROM public.ktn_search_students('ngan', NULL, NULL, NULL, NULL, NULL, 20, 0);` và `ROLLBACK;` để xác nhận `0` lỗi cú pháp hay xung đột dữ liệu.
3. **Bước 3 — Áp dụng Migration V3 chính thức & Kiểm tra sau nâng cấp**:
   - Thực thi `supabase_migration_v3.sql` và `COMMIT;`.
   - Xác minh: (a) `ktn_students` giữ nguyên đủ `1,046` dòng; (b) cột `search_text` được backfill tự động cho cả `1,046` học viên; (c) RPC `ktn_search_students` trả kết quả `< 50ms`.
4. **Bước 4 — Kế hoạch Rollback tức thì (nếu cần)**:
   - Vì không xóa hay đổi kiểu bất kỳ cột V2 nào, nếu cần rollback chỉ cần `DROP FUNCTION IF EXISTS public.ktn_search_students;` — Worker V2/V3 tự động chuyển về nhánh PostgREST fallback ngay lập tức mà không gián đoạn dịch vụ.

---

## F. TRẠNG THÁI NGHIỆM THU CUỐI CÙNG (FINAL ACCEPTANCE VERDICT)

- **Trạng thái nghiệm thu tổng thể**: **ĐẠT CÓ ĐIỀU KIỆN — CẦN TRIỂN KHAI BẢN VÁ V3 (CONDITIONAL PASS — AWAITING V3 PRODUCTION CUTOVER APPROVAL)**
- **Tóm tắt**:
  - **Các luồng vận hành cốt lõi cho Học viên, Giáo viên hiện hữu và Quản lý trên `https://khongtunhi.com` đều đang hoạt động thật (`LIVE_PASS`)**: Đăng nhập, cấp/thu hồi khóa học đồng bộ 3 chiều (`KTN ↔ izTeach ↔ Supabase`), xem video bài giảng HLS `1280×720` từ `media.izteach.vn`, tải bài tập ghi âm lên S3/CloudFront, nộp bài, giáo viên chấm điểm `9.5đ` đồng bộ về cả izTeach lẫn Học viên, chat 2 chiều văn bản/thoại và thông báo đẩy trong ứng dụng.
  - **Toàn bộ các điểm hạn chế của bản Live V2 (`bf88994`)** (tạo giáo viên mới báo `200 OK` giả do thiếu cột Schema V3, tạo học viên mới chưa hiển thị mật khẩu khởi tạo 1 lần, tìm kiếm thiếu học viên ngoài mốc 1.000 dòng, và phân quyền phòng chat riêng 1-1 liên lớp) **đã được khắc phục và kiểm chứng 100% (`55/55 PASS`) trên nhánh `feat/ktn-react-ui-v2` (PR #1)**.
  - Ngay khi Chủ dự án phê duyệt chạy Migration V3 và deploy Cloudflare Worker V3 từ PR #1, toàn bộ 17/17 hạng mục vận hành sẽ đạt trạng thái `LIVE_PASS` hoàn chỉnh.
