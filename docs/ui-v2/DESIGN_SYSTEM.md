# HỆ THỐNG THIẾT KẾ (DESIGN SYSTEM) — KTN UI V2

> **Định hướng thẩm mỹ:** Á Đông hiện đại, ấm áp, học thuật nhưng thân thiện với thiếu nhi và phụ huynh Việt Nam.

---

## 1. Bảng màu chuẩn (Color Tokens)

| Token | Mã Hex | Ứng dụng trong giao diện |
|---|---|---|
| **Primary Crimson** | `#991B1B` (`red-800`) | Thanh điều hướng đang chọn, nút hành động chính (Gửi tin, Nộp bài, Vào học), huy hiệu Giáo viên |
| **Primary Hover** | `#7F1D1D` (`red-900`) | Trạng thái hover/active của nút chính và tiêu đề nhấn mạnh |
| **Imperial Gold** | `#D97706` / `#F59E0B` (`amber-500`) | Huy hiệu thông báo ghim lớp học, nút CTA nổi bật trên nền tối, điểm nhấn thành tích |
| **Warm Ivory Background** | `#FAF8F5` | Nền tổng thể của ứng dụng, giảm mỏi mắt khi học sinh xem video và đọc chữ Hán lâu |
| **Chat Canvas** | `#F3EFEA` | Nền vùng cuộn tin nhắn kiểu Zalo ấm áp, giúp bong bóng tin nhắn trắng nổi bật rõ ràng |
| **Incoming Bubble** | `#FFFFFF` (viền `#E7E2DA`) | Tin nhắn của Giáo viên và các bạn cùng lớp |
| **Outgoing Bubble** | `#FBF1EE` (viền `#E7C8C2`) | Tin nhắn của chính người dùng đang đăng nhập |
| **Semantic Success** | `#15803D` (`emerald-700`) | Huy hiệu hoàn thành bài học, điểm số giáo viên đã chấm (`9.5/10`), trạng thái trực tuyến |
| **Semantic Warning** | `#B45309` (`amber-700`) | Cảnh báo DLP, trạng thái `"Đang gửi..."`, học viên chưa xếp lớp |
| **Semantic Danger** | `#B91C1C` (`red-700`) | Trạng thái `"Chưa gửi được"`, lỗi luồng phát video, yêu cầu nộp lại bài |

---

## 2. Hệ thống Typography (Hỗ trợ Tiếng Việt & Chữ Hán — Pinyin)

- **Heading / Display (`font-display`):** `Plus Jakarta Sans`, `Be Vietnam Pro`, `system-ui` — nét chữ tròn trịa, hiện đại, rõ dấu tiếng Việt ở mọi kích thước.
- **Body & Chat (`font-sans`):** `Be Vietnam Pro`, `Inter`, `Noto Sans SC` — hiển thị đồng thời tiếng Việt, Pinyin (thanh điệu `ā á ǎ à`) và chữ Hán giản thể (`AI小语，你好！`) sắc nét, không lệch dòng.
- **Monospace (`font-mono`):** `JetBrains Mono` — dùng cho mã lớp (`#YCT2-04`), thời lượng thu âm (`00:18`), và mốc giờ tin nhắn (`19:30`).

---

## 3. Quy chuẩn Responsive Đa Thiết Bị

1. **Mobile (`360px` – `390px`):**
   - Thanh điều hướng cố định dưới đáy màn hình (`Bottom Navigation Bar`) với 5 lối tắt chính.
   - Phòng Chat Zalo hoạt động theo luồng 2 bước: Danh sách hội thoại → Chạm mở toàn màn hình hội thoại (kèm nút `←` quay lại).
   - Phòng học Video: Trình phát 16:9 tràn ngang màn hình, ngăn kéo chọn bài học thu gọn (`Danh sách bài`), khung nộp bài tập thao tác 1 chạm.
2. **Tablet (`768px`) & Desktop (`1280px` – `1440px`):**
   - Sidebar cố định bên trái (`256px`).
   - Phòng Chat Zalo hiển thị song song 2 cột: Danh sách lớp học bên trái (`330px`) + Khung hội thoại bên phải.
   - Phòng học Video hiển thị 8 cột trình phát/nội dung bên trái + 4 cột danh sách bài giảng cố định bên phải.
