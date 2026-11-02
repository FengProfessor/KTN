# LỘ TRÌNH PHÁT TRIỂN & DANH MỤC TÍNH NĂNG TƯƠNG LAI
## HỆ THỐNG SỔ LIÊN LẠC & QUẢN TRỊ ĐÀO TẠO — HỌC VIỆN KHỔNG TỬ NHÍ
### (Product Roadmap & Prioritized Future Capabilities Backlog)

---

## 1. TỔNG QUAN TẦM NHÌN CHIẾN LƯỢC (EXECUTIVE PRODUCT VISION)

Hệ thống Sổ Liên Lạc & Quản Trị Đào Tạo của Học Viện Khổng Tử Nhí không chỉ dừng lại ở vai trò một công cụ quản lý hành chính và sổ điểm điện tử, mà được định hướng phát triển thành **Hệ sinh thái Giáo dục Trực tuyến Thông minh Đa Nền Tảng chuyên sâu về Tiếng Trung Trẻ Em số 1 tại Việt Nam**.

Tài liệu này xác lập lộ trình mở rộng gồm 5 giai đoạn chiến lược nhằm chuẩn bị năng lực kỹ thuật, quy hoạch kiến trúc và định lượng giá trị sản phẩm, đảm bảo sự phát triển bền vững và khả năng mở rộng không giới hạn cho hệ thống.

---

## 2. MA TRẬN LỘ TRÌNH 5 GIAI ĐOẠN (5-PHASE ROADMAP MATRIX)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               KHỔNG TỬ NHÍ LMS ROADMAP (2026 - 2028)                             │
├──────────────────┬──────────────────┬──────────────────┬──────────────────┬──────────────────────┤
│     GIAI ĐOẠN 1  │     GIAI ĐOẠN 2  │     GIAI ĐOẠN 3  │     GIAI ĐOẠN 4  │      GIAI ĐOẠN 5     │
│    (HIỆN HÀNH)   │  (TƯƠNG TÁC CAO) │   (TRỢ LÝ AI)    │ (LỚP HỌC ẢO LIVE)│  (ENTERPRISE CRM)    │
├──────────────────┼──────────────────┼──────────────────┼──────────────────┼──────────────────────┤
│ • Tái cấu trúc   │ • Tin nhắn thoại │ • AI chấm phát   │ • Lớp học video  │ • Đa cơ sở chi nhánh │
│   Admin Form LMS │   (Voice Notes)  │   âm thanh điệu  │   WebRTC 1-kèm-6 │   (Multi-campus CRM) │
│ • Quản lý izTeach│ • Mini-Quiz &    │ • AI nhận diện   │ • Bảng trắng ảo  │ • Thanh toán tự động │
│   Student CRM    │   Bình chọn chat │   nét chữ Hán    │   tương tác vẽ chữ│   học phí VietQR     │
│ • Chat Realtime  │ • Web Push PWA   │ • Gợi ý nhận xét │ • Điểm danh nhận │ • AI dự đoán học sinh│
│   theo Mã Lớp    │   thông báo App  │   sư phạm tự động│   diện khuôn mặt │   có nguy cơ bỏ học  │
│ • DLP An toàn    │ • Trạng thái     │ • Từ điển tương  │ • Ghi hình tự    │ • Báo cáo tài chính  │
│   thông tin      │   typing & read  │   tác thông minh │   động buổi học  │   học vụ chuyên sâu  │
└──────────────────┴──────────────────┴──────────────────┴──────────────────┴──────────────────────┘
```

---

## 3. ĐẶC TẢ CHI TIẾT TÍNH NĂNG CÁC GIAI ĐOẠN TƯƠNG LAI (PHASED BACKLOG)

### 3.1. GIAI ĐOẠN 2: NÂNG CAO TRẢI NGHIỆM TƯƠNG TÁC LỚP HỌC (INTERACTIVE CLASSROOM ENGAGEMENT)

#### FS-02.1: Tin Nhắn Thoại Trong Phòng Chat (Audio Voice Notes in Class Chat)
- **Mô tả**: Giáo viên và học sinh có thể ghi âm trực tiếp phát âm tiếng Trung ngắn (15s – 60s) ngay trong khung chat và gửi đi mà không cần quay video.
- **Giá trị sư phạm**: Cực kỳ quan trọng đối với trẻ em mầm non và tiểu học khi các con chưa gõ thạo bàn phím pinyin trên máy tính/điện thoại nhưng phát âm rất tự nhiên.
- **Đặc tả kỹ thuật**:
  - Giao diện: Nút giữ để ghi âm (`Hold to Record`) có hiệu ứng sóng âm thanh động và thời gian đếm ngược.
  - Xử lý âm thanh: Trình duyệt sử dụng `MediaRecorder API` thu âm thanh định dạng `.m4a` / `audio/webm;codecs=opus` với tần số lấy mẫu 44.1kHz.
  - Tải lên & Lưu trữ: Gửi qua AWS S3 Presigned URL, nén dung lượng < 500KB/phút.
  - Trình phát: Trình phát sóng nhạc mini (Audio Waveform Player) với nút tua nhanh 0.8x (để nghe cô phát âm chậm), 1.0x, 1.2x.
  - An toàn DLP: Chuyển âm thanh thành văn bản ngầm (Speech-to-Text) để kiểm tra vi phạm chia sẻ số điện thoại trước khi lưu trữ.

#### FS-02.2: Bình Chọn & Đố Vui Mini Trong Khung Chat (In-Chat Interactive Polls & Quizzes)
- **Mô tả**: Cô giáo có thể khởi tạo câu hỏi trắc nghiệm tiếng Trung 4 đáp án trực tiếp trong phòng chat lớp học.
- **Đặc tả kỹ thuật**:
  - Dạng tin nhắn đặc biệt `poll_card` hiển thị câu hỏi chữ Hán/Pinyin và 4 ô chọn đáp án.
  - Học sinh chạm vào đáp án -> Hệ thống tính điểm và cập nhật tỷ lệ % bình chọn tức thì qua WebSocket.
  - Tích hợp hiệu ứng pháo hoa chúc mừng khi học sinh chọn đúng đáp án.

#### FS-02.3: Hệ Thống Đẩy Thông Báo Mobile PWA (Web Push Notifications)
- **Mô tả**: Gửi thông báo đẩy về thiết bị điện thoại của phụ huynh ngay cả khi trình duyệt đang đóng.
- **Đặc tả kỹ thuật**:
  - Sử dụng Web Push API và Service Worker (`sw.js`).
  - Quản lý khóa VAPID trên Gateway Server.
  - Các kịch bản đẩy tự động:
    - *Nhắc giờ học*: Đẩy trước 30 phút trước khi ca học trực tiếp bắt đầu.
    - *Thông báo bài tập mới*: Khi giáo viên đăng bài học hoặc dặn dò vào phòng chat.
    - *Thông báo có điểm*: Khi bài tập của bé đã được cô giáo nhận xét và chấm điểm.
    - *Thông báo cài App*: Banner hướng dẫn thêm ứng dụng vào màn hình chính (Add to Home Screen) trên iOS và Android.

#### FS-02.4: Chỉ Báo Trạng Thái Thời Gian Thực (Typing Indicator & Read Receipts)
- **Mô tả**: Hiển thị dòng trạng thái *"Cô Lâm Mỹ Linh đang soạn tin..."* và huy hiệu *"Đã xem"* bên dưới tin nhắn quan trọng của lớp.

---

### 3.2. GIAI ĐOẠN 3: TRỢ LÝ GIÁO DỤC THÔNG MINH AI (AI-POWERED PEDAGOGICAL ASSISTANT)

#### FS-03.1: AI Chấm Điểm Phát Âm & 4 Thanh Điệu Tiếng Trung (Mandarin Speech & Tone Assessment)
- **Mô tả**: Sử dụng mô hình học máy phân tích âm vị (Acoustic Phonetic Model) để chấm điểm phát âm tiếng Trung của trẻ nhỏ.
- **Đặc tả kỹ thuật**:
  - Học sinh bấm thu âm đọc một từ hoặc câu chữ Hán mẫu.
  - AI bóc tách thanh mẫu, vận mẫu và phân tích đường cong cao độ (Pitch Contour) của 4 thanh điệu (Thanh 1 - Ngang cao; Thanh 2 - Sắc lên; Thanh 3 - Lượn trầm; Thanh 4 - Rơi dứt khoát).
  - Phản hồi trực quan: Đổi màu chữ pinyin thành Xanh lá (Chuẩn xác 90-100%), Vàng (Cần tròn vành rõ chữ hơn), Đỏ (Sai thanh điệu) kèm âm thanh mẫu chuẩn để bé đọc lại.

#### FS-03.2: AI Nhận Diện Quy Tắc & Thứ Tự Nét Chữ Hán (Handwriting & Stroke-Order AI)
- **Mô tả**: Học sinh chụp ảnh vở viết chữ Hán nộp bài, AI tự động phát hiện nét chữ và thứ tự viết bút thuận.
- **Đặc tả kỹ thuật**:
  - Tích hợp mô hình thị giác máy tính nhận dạng ký tự quang học (OCR chuyên biệt cho chữ viết tay thiếu nhi).
  - So sánh tỷ lệ khung chữ (kết cấu vuông vắn, cân đối giữa bộ thủ và thân chữ).
  - Phát hiện các lỗi sai phổ biến: Thừa nét chấm, thiếu nét phẩy, sai quy tắc *"ngang trước sổ sau, trên trước dưới sau"*.
  - Xuất báo cáo trực quan đánh dấu vùng nét cần cải thiện trực tiếp lên ảnh bài nộp của bé.

#### FS-03.3: AI Gợi Ý Lời Nhận Xét Sư Phạm Cho Giáo Viên (AI Teacher Feedback Co-Pilot)
- **Mô tả**: Trợ lý ngôn ngữ lớn (LLM) hỗ trợ giáo viên soạn thảo lời nhận xét học vụ nhanh chóng, mang tính khích lệ tâm lý tích cực.
- **Đặc tả kỹ thuật**:
  - Đầu vào: Điểm số bài làm, lịch sử nộp bài 5 buổi gần nhất, những lỗi phát âm thường gặp.
  - Đầu ra: Gợi ý 3 mẫu nhận xét ấm áp, chuẩn phương pháp giáo dục sớm cho trẻ em. Giáo viên chỉ cần 1 click để áp dụng hoặc chỉnh sửa tùy ý, giúp tiết kiệm 70% thời gian chấm bài hàng đêm của giáo viên.

---

### 3.3. GIAI ĐOẠN 4: PHÒNG HỌC TRỰC TUYẾN TÍCH HỢP (INTEGRATED VIRTUAL LIVE CLASSROOM)

#### FS-04.1: Lớp Học Video WebRTC Tương Tác Trực Tiếp (Native WebRTC Live Classroom)
- **Mô tả**: Tích hợp phòng học trực tuyến 1 giáo viên - 6 học sinh ngay trên nền tảng web Sổ Liên Lạc mà không cần chuyển sang ứng dụng ngoài (Zoom, Google Meet).
- **Đặc tả kỹ thuật**:
  - Kiến trúc SFU (Selective Forwarding Unit) kết hợp công nghệ WebRTC băng thông thích ứng (Adaptive Bitrate).
  - Giao diện lớp học chuyên biệt: Khung camera giáo viên ở vị trí trung tâm, 6 khung camera học sinh xếp gọn bên cạnh, tích hợp nút giơ tay phát biểu, thả tim và tặng sticker ngôi sao điểm thưởng.

#### FS-04.2: Bảng Trắng Tương Tác Đa Điểm Viết Chữ Hán (Interactive Calligraphy Whiteboard)
- **Mô tả**: Không gian bảng vẽ kỹ thuật số chia sẻ thời gian thực giữa cô và trò.
- **Đặc tả kỹ thuật**:
  - Cô giáo viết chữ Hán nét cọ mẫu trên bảng; học sinh có thể dùng ngón tay (trên iPad/điện thoại) hoặc bút cảm ứng đồ theo nét chữ trực tiếp.
  - Công cụ hiển thị lưới chữ điền (田字格) và lưới chữ mễ (米字格) chuẩn chữ Hán tiêu chuẩn.

#### FS-04.3: Điểm Danh & Phân Tích Cảm Xúc Khuôn Mặt Tự Động (Automated Facial Attendance)
- **Mô tả**: Tự động nhận diện khuôn mặt học sinh khi bước vào phòng học để tích điểm danh tự động vào Sổ Liên Lạc; cảnh báo cô giáo khi trẻ có dấu hiệu buồn ngủ hoặc mất tập trung quá 5 phút.

---

### 3.4. GIAI ĐOẠN 5: QUẢN TRỊ CHUỖI NHƯỢNG QUYỀN & TÀI CHÍNH (ENTERPRISE FRANCHISE CRM & BILLING)

#### FS-05.1: Kiến Trúc Đa Cơ Sở Chi Nhánh (Multi-Tenant Campus Architecture)
- **Mô tả**: Cho phép Học Viện Khổng Tử Nhí mở rộng quản lý đồng thời hàng chục cơ sở trung tâm nhượng quyền (Hà Nội, TP.HCM, Đà Nẵng, Hải Phòng...) trên một nền tảng duy nhất.
- **Đặc tả kỹ thuật**:
  - Dữ liệu học sinh, giáo viên, học phí được phân vùng độc lập (Tenant Partitioning).
  - Tài khoản Giám đốc học vụ trung tâm có dashboard tổng hợp toàn quốc, đối soát tỷ lệ lấp đầy lớp và xếp hạng chất lượng giảng dạy giữa các chi nhánh.

#### FS-05.2: Cổng Đóng Học Phí Tự Động VietQR & Webhook Ngân Hàng
- **Mô tả**: Tự động sinh mã VietQR động theo từng kỳ đóng học phí của học sinh.
- **Đặc tả kỹ thuật**:
  - Mã QR chứa sẵn: Số tiền học phí, Số tài khoản trung tâm, Nội dung chuyển khoản chuẩn hóa (`KTN <MãHọcViên> <MãLớp>`).
  - Kết nối Webhook biến động số dư ngân hàng: Khi phụ huynh chuyển khoản thành công, hệ thống tự động gạch nợ, gửi thông báo xác nhận vào chat và gia hạn buổi học trong SLL trong vòng 3 giây.

#### FS-05.3: Hệ Thống Dự Báo Nguy Cơ Bỏ Học Sớm (Predictive Student Churn AI)
- **Mô tả**: Thuật toán máy học phân tích hành vi học tập (tần suất nộp bài trễ, số buổi vắng học, điểm số giảm sút) để gắn cờ cảnh báo *"Học sinh có nguy cơ gián đoạn khóa học"*, giúp bộ phận chăm sóc khách hàng chủ động tư vấn phụ huynh kịp thời.

---

## 4. MA TRẬN ĐỘ ƯU TIÊN & NGUYÊN TẮC QUYẾT ĐỊNH (PRIORITIZATION & MOSCOW MATRIX)

| Giai đoạn | Tính năng (Feature) | Độ ưu tiên (MoSCoW) | Giá trị học vụ | Độ phức tạp kỹ thuật | Rủi ro triển khai |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **P2** | Tin nhắn thoại trong chat (Voice Notes) | **MUST HAVE** | Rất cao | Trung bình | Thấp (đã có S3) |
| **P2** | Web Push Notification & PWA Mobile App | **MUST HAVE** | Cao | Trung bình | Thấp (iOS Safari APNs) |
| **P2** | Mini-Quiz & Thăm dò ý kiến trong lớp | **SHOULD HAVE**| Trung bình | Thấp | Rất thấp |
| **P3** | AI chấm phát âm 4 thanh điệu tiếng Trung| **MUST HAVE** | Rất cao | Cao | Trung bình (mô hình AI) |
| **P3** | AI nhận diện nét bút chữ Hán viết tay | **SHOULD HAVE**| Rất cao | Rất cao | Trung bình (độ chính xác nét) |
| **P3** | AI gợi ý nhận xét sư phạm cho giáo viên | **COULD HAVE** | Trung bình | Thấp | Rất thấp (LLM API) |
| **P4** | Lớp học Video WebRTC 1-kèm-6 tích hợp | **SHOULD HAVE**| Rất cao | Rất cao | Cao (băng thông & SFU) |
| **P4** | Bảng trắng tương tác viết chữ Hán | **COULD HAVE** | Cao | Cao | Trung bình (độ trễ canvas) |
| **P5** | Quản trị đa chi nhánh nhượng quyền | **MUST HAVE** | Rất cao (Kinh doanh)| Trung bình | Thấp (Database index) |
| **P5** | Cổng thanh toán học phí VietQR tự động | **MUST HAVE** | Cao (Tài chính) | Trung bình | Thấp (Webhook ngân hàng) |
| **P5** | Dự báo nguy cơ bỏ học (Churn Prediction)| **COULD HAVE** | Trung bình | Cao | Thấp |

---

## 5. RÀNG BUỘC PHỤ THUỘC KIẾN TRÚC (ARCHITECTURAL DEPENDENCY GRAPH)

```
[ MILESTONE 1: NỀN TẢNG ]
 ├── Chuẩn hóa Schema & IEEE 830 SRS (M1)
 ├── Tái cấu trúc Admin LMS & Quản lý izTeach CRM (M1)
 └── Native Realtime Chat Engine theo Mã Lớp (M1)
        │
        ├──────────────────────────────────────────┐
        ▼                                          ▼
[ GIAI ĐOẠN 2: TƯƠNG TÁC CAO ]             [ GIAI ĐOẠN 5: ENTERPRISE ]
 ├── Voice Notes (Phụ thuộc Room Chat)      ├── Đa chi nhánh (Phụ thuộc CRM)
 ├── PWA Web Push (Phụ thuộc Gateway)       └── VietQR Billing (Phụ thuộc CRM)
 └── Mini-Quiz (Phụ thuộc WS Protocol)
        │
        ▼
[ GIAI ĐOẠN 3: TRỢ LÝ AI ]
 ├── AI Chấm Thanh Điệu (Phụ thuộc Voice Notes P2)
 ├── AI Nhận Diện Chữ Hán (Phụ thuộc HW S3 Upload P1)
 └── AI Gợi Ý Lời Nhận Xét (Phụ thuộc Grading Matrix P1)
        │
        ▼
[ GIAI ĐOẠN 4: LỚP HỌC ẢO LIVE ]
 ├── Native WebRTC 1-kèm-6 (Phụ thuộc Socket Gateway P1 & PWA P2)
 └── Bảng Trắng Tương Tác Chữ Hán (Phụ thuộc WebRTC Room)
```

---