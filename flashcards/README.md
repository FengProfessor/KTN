# Khổng Tử Nhí • Ứng Dụng Flashcard & Luyện Viết Hanzi (Lộ 7)

Ứng dụng Web / PWA học tiếng Trung chuẩn Mobile-First (390x844 px) dành cho trẻ em thương hiệu Khổng Tử Nhí.

---

## 🌟 Tính Năng Nổi Bật

1. **Thẻ Flashcard 3D Chuẩn Thiết Kế Lộ 7 (`flashcard lo 7.pdf`)**:
   - **Mặt trước**: Khung viền hồi văn cổ điển Á Đông, chữ Hán đỏ kích thước lớn ở giữa, hình chibi minh họa đáng yêu và logo Khổng Tử Nhí.
   - **Mặt sau**: Hình chibi phía trên, cách đọc Pinyin kèm **nút loa phát âm ngay bên cạnh**, nghĩa Tiếng Việt & Tiếng Anh, câu ví dụ kèm nút nghe phát âm.
   - Hiệu ứng lật thẻ 3D mượt mà (`rotateY(180deg)`), hỗ trợ chạm thẻ, bấm nút hoặc vuốt (swipe touch gesture trên điện thoại).

2. **Âm Thanh Bản Xứ Chuẩn 100% (Không Dùng AI / TTS)**:
   - Sử dụng kho giọng đọc người bản xứ chuẩn phổ thông Bắc Kinh từ `web-app/public/audio/native/cmn-<word>.mp3`.
   - Kết nối trực tiếp vào các nút loa trên mặt trước, mặt sau và khung luyện viết.
   - Chạy 100% offline và hỗ trợ mở trực tiếp qua `file://`.

3. **Luyện Viết Chữ Hán Ô Mễ Tự Cách (米字格) với HanziWriter**:
   - Khung ô Mễ Tự Cách 270x270 px chuẩn thư pháp Á Đông (trục tung, trục hoành, đường chéo nét đứt, 4 góc thước ngắm).
   - Tự động tách từng ký tự Hán cho các từ ghép (ví dụ `猴子` có tab `[ 猴 ]` và `[ 子 ]`).
   - Chế độ **"Xem nét"** (Animate): Xem thứ tự bút thuận với nét bút lông mực đen, chu sa đỏ cho bộ thủ.
   - Chế độ **"Tập viết"** (Quiz): Bé dùng ngón tay tô theo nét trên màn hình cảm ứng, có chấm điểm, bắt đúng chiều nét, nhắc nhở sau 2 lần vẽ sai và huy hiệu chúc mừng hoàn thành!
   - Nút **"Nét mờ"** (Toggle Outline) và **"Vẽ lại"** (Reset).
   - Tích hợp sẵn 100% dữ liệu nét (`strokes-data.js`) không phụ thuộc CDN hay mạng internet.

4. **Quản Lý Tiến Độ Học Tập & Lưu Trữ Client-Side**:
   - Nút đánh dấu `⚠️ Cần ôn` và `✓ Đã thuộc` lưu trực tiếp vào `localStorage`.
   - Thanh tiến độ động (Progress Bar) và bộ đếm từ (`Từ 1 / 30`).
   - Bộ lọc thẻ tức thì: `Tất cả (30)`, `🐾 Động vật (13)`, `🔢 Đo lường (4)`, `💬 Giao tiếp (13)`, `⚠️ Cần ôn`, `⭐ Đã thuộc`.
   - Ngăn kéo thư viện từ vựng (Word Drawer) giúp bé nhảy đến bất kỳ từ nào chỉ với 1 chạm.

---

## 📁 Cấu Trúc Thư Mục

```
D:\Vibe\khongtunhi-demo\flashcards\
├── index.html                   # Giao diện chính Mobile-First (HTML5/PWA)
├── manifest.json                # Web App Manifest cho cài đặt PWA
├── README.md                    # Tài liệu hướng dẫn dự án
├── assets/
│   ├── css/
│   │   └── style.css            # Toàn bộ CSS phong cách Á Đông hiện đại & 3D Flip
│   ├── js/
│   │   ├── app.js               # Logic điều khiển Flashcard, Audio, Swipe & Quiz
│   │   ├── cards-data.js        # Metadata 30 thẻ từ vựng Lộ 7
│   │   ├── strokes-data.js      # Dữ liệu 46 chữ Hán offline cho HanziWriter
│   │   └── hanzi-writer.min.js  # Thư viện HanziWriter v3.5.0
│   ├── audio/                   # 36 tệp âm thanh bản xứ thật (cmn-*.mp3)
│   ├── images/
│   │   ├── cards/               # Ảnh quét sắc nét 2x mặt trước/sau 30 thẻ Lộ 7
│   │   └── chibi/               # Hình minh họa Chibi cute (khỉ, chó, heo, mèo, thỏ...)
└── screenshots/                 # Ảnh chụp nghiệm thu giao diện trên thiết bị 390x844
```

---

## 🚀 Cách Mở & Chạy Ứng Dụng

- **Cách 1 (Mở trực tiếp - Không cần cài đặt)**: Click đúp vào `index.html` hoặc kéo vào bất kỳ trình duyệt nào (Chrome, Safari, Edge, Cốc Cốc...). Ứng dụng chạy ngay lập tức với đầy đủ hình ảnh, âm thanh và nét vẽ offline.
- **Cách 2 (Mở trên điện thoại qua mạng LAN)**:
  ```powershell
  cd D:\Vibe\khongtunhi-demo\flashcards
  python -m http.server 8080
  ```
  Truy cập `http://<IP_MÁY_TÍNH>:8080` trên trình duyệt điện thoại để trải nghiệm cảm ứng một chạm.
