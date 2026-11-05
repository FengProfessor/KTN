# ĐÁNH GIÁ GIAO DIỆN & TRẢI NGHIỆM NGƯỜI DÙNG (`UI_REVIEW.md`)

> Đối chiếu trực quan từ bộ ảnh chụp màn hình trình duyệt thực tế tại `docs/ui-v2/screenshots/` trên 3 kích thước chuẩn: Điện thoại (`390px`), Máy tính bảng (`768px`) và Máy tính bàn (`1440px`).

---

## 1. Danh mục Ảnh chụp Nghiệm thu (`docs/ui-v2/screenshots/`)

| Phân hệ | Mobile (`390x844`) | Tablet (`768x1024`) | Desktop (`1440x900`) |
|---|---|---|---|
| **1. Tổng quan Học sinh** | `01-student-dashboard-390px.png` | `01-student-dashboard-768px.png` | `01-student-dashboard-1440px.png` |
| **2. Phòng học Video HLS & Bài tập** | `02-video-learning-390px.png` | `02-video-learning-768px.png` | `02-video-learning-1440px.png` |
| **3. Phòng Chat Lớp học kiểu Zalo** | `03-zalo-classroom-chat-390px.png` | `03-zalo-classroom-chat-768px.png` | `03-zalo-classroom-chat-1440px.png` |
| **4. Trung tâm Thông báo** | `04-notification-center-390px.png` | `04-notification-center-768px.png` | `04-notification-center-1440px.png` |
| **5. Cổng Giáo viên Chủ nhiệm** | `05-teacher-workspace-390px.png` | `05-teacher-workspace-768px.png` | `05-teacher-workspace-1440px.png` |

---

## 2. Nhận xét Chi tiết theo 5 Câu hỏi Trọng tâm của Phụ huynh & Học sinh

1. **"Hôm nay con học gì?"**
   - Ngay đầu trang Tổng quan (`01-student-dashboard`), banner Crimson–Gold hiển thị rõ mã lớp (`YCT2-04`), lịch học cố định (`Thứ 3 & Thứ 6 19:30`), và nút hành động lớn **"Vào phòng học Video HLS"**.
2. **"Video bài giảng xem ở đâu?"**
   - Màn hình `/learning` (`02-video-learning`) đặt trình phát HLS 16:9 ở vị trí trung tâm, kèm bộ điều khiển tốc độ (`0.75x` – `1.5x`), danh sách bài học có thanh tiến độ xanh lá và tab nghe file MP3 chuẩn giọng Bắc Kinh.
3. **"Bài tập nào cần làm và cô đã chấm chưa?"**
   - Khung **Bài tập thực hành** nằm ngay dưới trình phát video, tích hợp bộ thu âm trực tiếp trên trình duyệt, đính kèm tệp và thẻ điểm số/nhận xét nổi bật của Lão sư (`Điểm: 9.5 / 10` và `10 / 10`).
4. **"Giáo viên vừa nhắn gì trong lớp?"**
   - Màn hình `/chat` (`03-zalo-classroom-chat`) mang lại trải nghiệm quen thuộc như Zalo: thông báo ghim ở đầu phòng, phân biệt rõ bong bóng tin nhắn của Giáo viên (huy hiệu `Giáo viên` màu đỏ son) và Học sinh, hỗ trợ thả cảm xúc (`👍 ❤️ 👏 🎉`), trả lời trích dẫn và gửi thu âm giọng đọc.
5. **"Có thông báo mới không?"**
   - Chuông thông báo trên thanh Header và trang `/notifications` (`04-notification-center`) hiển thị số lượng tin chưa đọc theo thời gian thực, cho phép bấm vào từng thông báo để nhảy thẳng tới bài tập vừa chấm hoặc phòng chat lớp.
