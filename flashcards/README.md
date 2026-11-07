# Khổng Tử Nhí • Web Flashcard & Luyện Viết Chữ Hán (Lộ 1 – Lộ 7)

Ứng dụng học từ vựng tiếng Trung qua thẻ hình (Flashcard) và luyện viết chữ Hán trên ô **Mễ Tự Cách (米字格)** dành cho học viên **Khổng Tử Nhí**.

---

## 1. Tài nguyên đầy đủ 7 Lộ (605 thẻ từ vựng)

| Cấp độ | Số lượng thẻ | Nội dung chính |
|---|---|---|
| **🌱 Lộ 1** | **90 thẻ** | Đại từ, chào hỏi, quốc gia, gia đình, số đếm, thời gian, đồ ăn & đời sống cơ bản |
| **🌿 Lộ 2** | **109 thẻ** | Ngôn ngữ, nhà cửa, nội thất, phương hướng, mua sắm, môn học, thời tiết & cơ thể |
| **🌳 Lộ 3** | **96 thẻ** | Công viên, trang phục, nghệ thuật, du lịch, lễ hội truyền thống, nghề nghiệp & môi trường |
| **🌸 Lộ 4** | **100 thẻ** | Đường phố, thiết bị gia đình, trường học, khám bệnh, nấu ăn, sở thú & thư viện |
| **🏮 Lộ 5** | **92 thẻ** | Tin tức, bảo vệ môi trường, công nghệ, thời gian, phương tiện giao thông & giao tiếp |
| **🐉 Lộ 6** | **88 thẻ** | Động vật, sinh hoạt, thể thao, bốn mùa, ẩm thực & du lịch |
| **🦁 Lộ 7** | **30 thẻ** | 12 con giáp & động vật, phép tính Toán học, giao tiếp & đời sống nâng cao |
| **Tổng cộng** | **605 thẻ** | Đầy đủ hình minh họa mặt trước/sau, Pinyin, nghĩa Việt/Anh, câu ví dụ, âm thanh & nét viết |

---

## 2. Cơ chế ôn tập đơn giản (Không dùng FSRS / SM-2 / Anki)

Học sinh chỉ cần thao tác với 2 nút chính: **“Quên rồi”** và **“Nhớ rồi”**.

- **Khi bấm “Quên rồi” (`🔄 Quên rồi`)**:
  - Thẻ đó tự động xuất hiện lại sau **3–5 thẻ khác** ngay trong phiên học hiện tại (hoặc ở cuối lượt ôn còn lại nếu phiên còn dưới 3 thẻ).
  - Đặt lịch ôn tiếp vào **ngày mai** (`+1 ngày`).
  - Reset bậc nhớ liên tiếp về `reviewStep = 0`.
- **Khi bấm “Nhớ rồi” (`✅ Nhớ rồi`)**:
  - Giãn lịch ôn theo danh sách ngày cố định dựa trên số lần nhớ liên tiếp (`reviewStep`):
    - Lần nhớ 1 (`Step 1`): **sau 1 ngày**
    - Lần nhớ 2 (`Step 2`): **sau 3 ngày**
    - Lần nhớ 3 (`Step 3`): **sau 7 ngày**
    - Lần nhớ 4 (`Step 4`): **sau 14 ngày**
    - Từ lần 5 trở đi (`Step 5+`): **sau 30 ngày**
  - Nếu bất kỳ lúc nào học sinh bấm “Quên rồi”, từ đó quay về lịch ôn ngắn (`reviewStep = 0`, ôn lại ngày mai).
- **Màn hình / Thanh “Ôn hôm nay”**:
  - Hiển thị số từ cần ôn hôm nay, số từ đã nhớ, số từ cần học lại và nút **“Bắt đầu ôn”** (không ép học sinh phải học hết 90 thẻ trong một lần).
- **Lưu tiến độ (`localStorage`)**:
  - Lưu đầy đủ `{ cardId, level, reviewStep, nextReviewDate, lastReviewedAt, status }` tại khóa `ktn_flashcard_srs_v2_<level>`, tự động chuyển đổi dữ liệu cũ từ `ktn_flashcard_progress_<level>` mà không làm mất tiến độ của học viên.

---

## 3. Tối ưu hình ảnh (WebP + Thumbnail + Lazy-load)

| Hạng mục | Trước tối ưu (PNG, chỉ 2 Lộ) | Sau tối ưu (WebP, 2 Lộ: Lộ 1 + 7) | Sau tối ưu (WebP, toàn bộ 7 Lộ = 605 thẻ) |
|---|---|---|---|
| **Số lượng thẻ** | 120 thẻ (240 ảnh PNG) | 120 thẻ (360 ảnh WebP + thumb) | **605 thẻ (1,815 ảnh WebP + thumb)** |
| **Tổng dung lượng** | **82.36 MB** | **6.00 MB** (**giảm 92.7%**) | **36.32 MB** (nhỏ hơn 56% dù gấp 5 lần số thẻ) |
| **Dung lượng trung bình / ảnh thẻ** | ~343 KB / ảnh | ~22 KB / ảnh (`660×940` sắc nét) | ~26 KB / ảnh (`660×940` sắc nét) |
| **Ảnh trong danh sách từ (Thumbnail)** | Tải nguyên ảnh 725 KB | **~3.2 KB / thumb** (`140×200`, `loading="lazy"`) | **~3.2 KB / thumb** (`140×200`, `loading="lazy"`) |

- Chỉ tải ảnh nét đầy đủ cho thẻ đang xem và preload nhẹ 2 thẻ lân cận (`currentIndex - 1`, `currentIndex + 1`).

---

## 4. Âm thanh người bản xứ & Kiểm định minh bạch

- **Không sử dụng TTS máy**: Đã loại bỏ hoàn toàn các tệp 16kHz Baidu TTS (`你好`, `星期天`) và sửa triệt để lỗi trỏ nhầm âm thanh từ ghép của Lộ 7 (`加减` → `cmn-加减.mp3`, `等于` → `cmn-等于.mp3`, `小鸟` → `cmn-小鸟.mp3`).
- Chi tiết nguồn gốc và phân loại từng thẻ (`native_exact` thu nguyên từ vs `native_concat` ghép âm tiết người thật) được ghi đầy đủ trong [AUDIO_AUDIT_REPORT.md](./AUDIO_AUDIT_REPORT.md).

---

## 5. Luyện viết chữ Hán (Mễ Tự Cách) & Chế độ Offline (PWA)

- **Luyện viết chữ Hán**:
  - Hỗ trợ **Xem nét**, **Tập viết** (chấm nét cảm ứng/chuột, nhắc nhẹ khi sai, bật/tắt nét gợi ý) và **Viết lại**.
  - Với từ ghép 2–3 chữ: hỗ trợ viết từng chữ rời hoặc **Ghép cả từ** theo đúng thứ tự.
  - Đóng gói sẵn dữ liệu nét viết offline cho toàn bộ **617 chữ Hán** xuất hiện trong cả 7 Lộ (`assets/js/strokes-data.js`).
- **PWA & Học Offline (`sw.js`)**:
  - Service Worker được giới hạn phạm vi `scope: './'` (chỉ trong `/flashcards/`), dùng tên bộ nhớ đệm riêng `ktn-flashcards-*` để không xung đột với hệ thống KTN chính.
  - Tự động lưu offline khung ứng dụng (App Shell), dữ liệu từ vựng 7 Lộ, dữ liệu 617 chữ Hán và **các thẻ/âm thanh học sinh đã mở xem** (không tải cưỡng bức toàn bộ kho ảnh ngay lần đầu mở trang).
