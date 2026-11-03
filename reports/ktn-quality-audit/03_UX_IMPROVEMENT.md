# 03 — BÁO CÁO CẢI TIẾN TRẢI NGHIỆM NGƯỜI DÙNG (UX IMPROVEMENT)

> **Hệ thống:** Khổng Tử Nhí (`https://khongtunhi.com`)
> **Đối tượng phục vụ:** Học sinh tiểu học (6–11 tuổi), Phụ huynh, Giáo viên phụ trách lớp, Quản lý trung tâm.

---

## 1. Triết lý thiết kế & Cải tiến theo từng vai trò

### 1.1. Học sinh tiểu học (6–11 tuổi) — Rõ ràng, thân thiện, chống bấm nhầm
| Hạng mục | Trước khi cải tiến | Sau khi cải tiến | File áp dụng |
|---|---|---|---|
| **Nhãn trạng thái bài tập** | Dùng từ kỹ thuật ngắn gọn: `"Chưa nộp"`, `"Đã nộp · Chờ cô chấm"`, `"Cô yêu cầu sửa lại"`, `"Đã hoàn thành · 9.5/10"`. | Ngôn ngữ gần gũi với trẻ nhỏ:<br>- `"Chưa làm bài"`<br>- `"Đang gửi bài..."`<br>- `"Cô đã nhận bài của con · Chờ cô chấm"`<br>- `"Cô muốn con sửa bài này"`<br>- `"Con được 9.5/10 điểm! · Đã hoàn thành"` | [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L4010-L4075) |
| **Nút hành động chính (CTA)** | `"Nộp Bài 1"`, `"Nộp lại Bài 1"` | Rõ hành động theo trạng thái:<br>- Khi chưa nộp: `"Nộp Bài 1 cho cô"`<br>- Khi đang chờ chấm: `"Gửi bản mới Bài 1"`<br>- Khi cô nhắc sửa: `"Sửa và gửi lại Bài 1"` | [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L4110-L4135) |
| **Chống bấm đúp (Double-submit lock)** | Chỉ khóa nút sau khi bắt đầu upload; nếu mạng chậm học sinh bấm liên tiếp có thể gửi trùng. | Khóa tức thời bằng cờ `st.submitting = true`, `btn.disabled = true`, giảm `opacity: 0.7` và đổi nhãn thành `"Đang tải bài của con lên hệ thống..."` ngay ở mili-giây đầu tiên khi chạm nút. | [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L4245-L4295) |
| **Kiểm tra file sớm trên trình duyệt** | Đợi gọi API mới báo lỗi nếu chọn nhầm file. | Kiểm tra ngay khi chọn file (`handleClassExFile`): chặn file rỗng (`0 byte`), file quá `50MB`, hoặc sai định dạng, hiển thị thông báo dễ hiểu cho học sinh & phụ huynh. | [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L4170-L4205) |

### 1.2. Giáo viên (`sll-teacher.html`) — Chấm bài nhanh, không dùng popup gây gián đoạn
| Hạng mục | Trước khi cải tiến | Sau khi cải tiến | File áp dụng |
|---|---|---|---|
| **Thống kê nhanh đầu trang** | Giáo viên phải tự cuộn đếm xem còn bao nhiêu bài chờ chấm. | Thêm thanh **Summary Counter Pills** hiển thị tức thời:<br>- `Chờ cô chấm: X`<br>- `Cần sửa lại: Y`<br>- `Đã hoàn thành: Z` | [sll-teacher.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-teacher.html#L495-L535) |
| **Phản hồi khi lưu điểm / yêu cầu sửa** | Chỉ dùng `alert()` của trình duyệt hoặc đổi chữ trên nút, dễ bấm đúp khi mạng chậm. | Khóa toàn bộ nút trong thẻ bài nộp khi đang lưu (`Đang lưu kết quả chấm bài lên hệ thống...`), hiển thị thanh trạng thái nội tuyến (`#grade-status-<id>`) màu xanh khi lưu thành công hoặc màu đỏ khi có lỗi để cô thử lại ngay mà không mất nhận xét đã gõ. | [sll-teacher.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-teacher.html#L610-L685) |
| **Nguồn dữ liệu bài nộp** | Có nhánh fallback đọc `localStorage.getItem('ktn_local_submitted_homeworks')`, có thể hiển thị nhầm bài lưu cục bộ trên máy dùng chung. | Chỉ đọc dữ liệu chuẩn xác từ API máy chủ `/api/ktn/homeworks`, loại bỏ hoàn toàn dữ liệu tạm trong `localStorage` của trình duyệt. | [sll-teacher.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-teacher.html#L485-L505) |

### 1.3. Hệ thống thông báo (Notifications) — Tinh gọn, đúng ngữ cảnh, giữ trạng thái đã đọc
| Tình huống | Tiêu đề | Nội dung hiển thị | Ghi chú UX |
|---|---|---|---|
| **Khách chưa đăng nhập (Guest)** | *(Ẩn hoàn toàn)* | Không có chuông thông báo giả, không có toast social-proof, không có banner xin quyền push. | Giữ trang chủ và trang giới thiệu sạch 100%. |
| **Cô giáo chấm điểm hoàn tất (`graded`)** | `Cô giáo vừa nhận xét.` | `[Lớp YCT2-04 · Buổi 1] Bài 1 · 9.5đ` | Ngắn gọn, hiển thị rõ số điểm, bấm vào mở đúng bài tập. |
| **Cô giáo yêu cầu sửa lại (`revision_requested`)** | `Cô giáo vừa nhận xét.` | `Cần sửa lại: [Lớp YCT2-04 · Buổi 1] Bài 1` | Giúp phụ huynh và học sinh biết ngay bài nào cần thu âm/nộp lại. |
| **Lưu trạng thái Đã đọc (Read-State Persistence)** | Đồng bộ Canonical ID | `NOTIF-GRADED-${hw.id}-${hw.status}-${hw.score}` | Sau khi bấm đọc hoặc "Đánh dấu đã đọc", tải lại trang (`F5`) không bao giờ bật sáng lại thông báo cũ; chỉ khi cô chấm điểm mới hoặc đổi trạng thái thì mới tạo thông báo mới. |

---

## 2. Kiểm tra khả năng đáp ứng trên thiết bị di động (Mobile Responsive Matrix)

Đã sửa lỗi tràn ngang trên màn hình nhỏ (`360x800`) bằng cách:
- Chuyển `.course-grid` từ `grid-template-columns: repeat(auto-fill, minmax(340px, 400px))` sang `grid-template-columns: repeat(auto-fill, minmax(min(100%, 340px), 400px))` trong [portal_template.html](file:///d:/Vibe/khongtunhi_sofl_style/portal_template.html#L230-L240).
- Đổi `.header-inner` sang `min-height: 68px; flex-wrap: wrap` để thanh điều hướng không bị cắt chữ trên điện thoại nhỏ.
- Bổ sung `overflow-x: hidden` và `flex-wrap: wrap` cho thanh công cụ giáo viên ([sll-teacher.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-teacher.html)) và trang quản trị ([sll-admin.html](file:///d:/Vibe/khongtunhi_sofl_style/sll-admin.html)).

| Thiết bị mô phỏng | Kích thước Viewport | `innerWidth` | `scrollWidth` | Tràn ngang (`overflowPx`) | Kết quả |
|---|---|---|---|---|---|
| Android phổ thông | `360 x 800` | `360` | `360` | `0 px` | **PASS** |
| iPhone SE / Mini | `375 x 812` | `375` | `375` | `0 px` | **PASS** |
| iPhone 13 / 14 | `390 x 844` | `390` | `390` | `0 px` | **PASS** |
| iPhone Pro Max | `430 x 932` | `430` | `430` | `0 px` | **PASS** |
| iPad / Tablet dọc | `768 x 1024` | `768` | `768` | `0 px` | **PASS** |
| Laptop / Desktop | `1280 x 800` | `1280` | `1280` | `0 px` | **PASS** |
