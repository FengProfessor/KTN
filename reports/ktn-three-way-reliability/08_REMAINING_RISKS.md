# 08 — REMAINING RISKS & OPERATIONAL RECOMMENDATIONS

> **Mục đích:** Báo cáo trung thực các giới hạn kiến trúc bên ngoài (izTeach / Supabase), trạng thái chưa triển khai lên production, và khuyến nghị vận hành dài hạn.

---

## 1. Phân định Rõ ràng: Đã Xác minh Local/Harness vs. Chờ Triển khai Production

| Hạng mục | Trạng thái trên Local & In-Process/Chromium Harness | Trạng thái trên Live Production (`https://khongtunhi.com`) |
|---|---|---|
| Mã nguồn sửa lỗi (`cloudflare-worker-sw-proxy.js`, `portal_template.html`, `sll-hocsinh.html`, `ktn-webapp-client.js`, `so-lien-lac-ux.js`, `so-lien-lac-lms.js`) | **ĐÃ HOÀN TẤT & KIỂM THỬ 100% (31/31 PASS)** | **CHƯA DEPLOY** (Tuân thủ nghiêm ngặt quy tắc an toàn không tự ý ghi/deploy lên production khi chưa có lệnh phê duyệt phát hành). |
| Kiểm thử ghi dữ liệu (Nộp bài, chấm điểm, cấp/thu hồi khóa học, thu hồi token) | **ĐÃ XÁC MINH** trên bộ giả lập chuẩn xác + trình duyệt Headless Chromium (`tests/ktn_three_way_reliability_suite.cjs` & `tests/ktn_browser_e2e_local.cjs`). | **KHÔNG CHẠY TRÊN PRODUCTION** để bảo vệ tuyệt đối dữ liệu học sinh thật. |

> **Lưu ý vận hành quan trọng:** Vì mã sửa lỗi hiện nằm trên nhánh `main` tại máy local và chưa chạy `npx wrangler deploy` / `node deploy_so_lien_lac_live.cjs`, nếu bạn mở `https://khongtunhi.com/custom-page/so-lien-lac-test#/` ngay lúc này trước khi deploy thì trình duyệt vẫn đang tải bản cũ trên máy chủ. Sau khi chạy 2 lệnh deploy trong `07_RELEASE_READINESS.md` và làm mới trang (`Ctrl+F5`), các bản sửa lỗi sẽ có hiệu lực trên `khongtunhi.com`.

---

## 2. Các Rủi ro Phụ thuộc Bên ngoài (External Dependencies) & Cách Hệ thống Giảm thiểu

1. **Rủi ro 1 — Độ trễ hoặc gián đoạn tạm thời của API izTeach (`/prod/homework`, `/prod/user-permission`):**
   - **Hiện tượng:** Khi AWS API Gateway / Lambda của izTeach phản hồi chậm hoặc trả lỗi `502`/`503`.
   - **Cơ chế giảm thiểu đã triển khai:**
     - Với bài nộp & điểm chấm: Worker luôn lưu bền vững vào bảng `ktn_homeworks` trên Supabase trước, sau đó mới gọi sang izTeach và ghi nhận `syncStatus: 'sync_failed'` + `mirroredToIzTeach: false` nếu izTeach lỗi, giúp học sinh không bao giờ mất bài thu âm và giáo viên không mất điểm đã chấm.
     - Với cấp/thu hồi quyền học: Worker thực hiện Read-After-Write Verification; nếu izTeach lỗi thì chặn cập nhật Supabase và trả về `502` để Quản lý bấm thử lại, tránh lệch quyền giữa 2 hệ thống.

2. **Rủi ro 2 — Bài tập Lớp học trực tiếp (`CLASS_*`) không có khóa học tương ứng trên izTeach:**
   - **Hiện tượng:** Các buổi học trực tiếp với cô (`Lớp YCT2-04`, `Lớp YCT3-02`...) được tạo linh hoạt trên Sổ Liên Lạc và không có mã `courseId`/`unitId` 24-hex cố định trên izTeach.
   - **Cơ chế giảm thiểu đã triển khai:** Hệ thống phân tách rõ ràng bằng `syncStatus = 'not_applicable_live_class'` — toàn bộ việc giao bài, nộp bài thu âm/ảnh lên S3 và chấm điểm diễn ra trọn vẹn giữa Sổ Liên Lạc và Supabase, không đẩy sang izTeach để tránh làm hỏng dữ liệu khóa học HSK1.

3. **Rủi ro 3 — Thêm khóa học mới thứ 18+ trên izTeach trong tương lai:**
   - **Hiện tượng:** Khi trung tâm xuất bản khóa học thứ 18 trên izTeach, `COURSE_UNIT_MAP` tĩnh trong Worker sẽ chưa có danh sách `unitId` của khóa mới đó.
   - **Cơ chế giảm thiểu đã triển khai:** Hàm `resolveCourseUnitId()` không đoán mò `unitId`, mà gắn cờ `syncStatus = 'mapping_required'` để bài nộp vẫn được lưu an toàn trên Supabase. Khi thêm khóa mới, chỉ cần bổ sung danh sách `unitId` của khóa đó vào `all_courses_lessons_data.json` và `COURSE_UNIT_MAP`.
