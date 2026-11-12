# Báo Cáo Kiểm Định Chất Lượng Âm Thanh 605 Thẻ Từ Vựng (Phase 1 & Phase 2 Audio Quality Audit)

> Áp dụng cho toàn bộ **605 thẻ từ vựng (Lộ 1 → Lộ 7)** của ứng dụng **KTN Flashcard**.
> Dữ liệu kiểm định chi tiết từng thẻ được xuất tại:
> - [`audio-quality-audit.csv`](./audio-quality-audit.csv) (Bảng kiểm định đầy đủ 16 cột cho toàn bộ 605 thẻ)
> - [`audio-quality-audit.json`](./audio-quality-audit.json) (Dữ liệu JSON cấu trúc phục vụ đối soát tự động & công cụ duyệt)
> - [`recording-needed-list.csv`](./recording-needed-list.csv) (Danh sách 121 thẻ cần thu âm nguyên từ / duyệt nghe bởi giáo viên tiếng Trung, phân theo mức ưu tiên `P0` và `P1`)
> - [`audio-review.html`](./audio-review.html) (Trang công cụ nội bộ nghe duyệt liên tiếp 605 thẻ, chấm `Đạt / Cần sửa / Chưa xác minh` và xuất báo cáo)

---

## 1. Nguồn gốc, Bản quyền & Điều kiện Ghi công (License & Attribution)

| Nguồn thu âm | Tần số mẫu & Định dạng | Giấy phép (License) | Điều kiện ghi công (Attribution) | Trạng thái sử dụng |
|---|---|---|---|---|
| **Shtooka Project Mandarin Collection (`cmn-*.mp3`, `File:Zh-*.ogg`)** | `22,050 Hz` Mono, `64 kbps` MP3 | **CC BY 2.0 fr / CC BY-SA 3.0 / 4.0** | Ghi công: *Shtooka Project — Wei Gao, Vion Nicolas (via Wikimedia Commons / shtooka.net)*. Cho phép xuất bản công khai, chia sẻ và phục vụ học tập. | **Đang sử dụng chính** (`484` thẻ đạt chuẩn `APPROVED` + `63` thẻ ghép cùng giọng chờ duyệt `PENDING_REVIEW`) |
| **Chinese-Lessons Studio Syllable Corpus (2006) (`pinyin/*.mp3`)** | `44,100 Hz` → `22,050 Hz` Mono | **Free Educational Use** | Bộ âm tiết đơn đọc rời phục vụ học tập phi thương mại. Khi ghép chéo với Shtooka tạo sự lệch màu giọng giữa các âm tiết. | **Tạm khóa phát tự động (`NEEDS_REPLACEMENT`)** — Đưa vào danh sách thu âm lại nguyên từ |
| **Baidu TTS / Máy đọc tự động (`words/*.mp3`, `16,000 Hz`)** | — | **ĐÃ LOẠI BỎ 100%** | Tuyệt đối không sử dụng bất kỳ tệp TTS máy nào và không gắn nhãn TTS là giọng người bản xứ. | **0 thẻ (Cấm tuyệt đối)** |

---

## 2. Thống kê Tổng quan: Phân loại Nguồn (`audio_type`) vs Trạng thái Kiểm định (`audit_status`)

> **Nguyên tắc minh bạch (Phase 1.1 & 1.4):**
> - Giữ nguyên phân loại nguồn **`484 native_exact`** và **`121 native_concat`** (tuyệt đối không đổi nhãn `native_concat` thành `native_exact` để làm đẹp bảng thống kê).
> - Không coi việc file tồn tại và `> 1 KB` là bằng chứng phát âm đúng.
> - Trên ứng dụng học viên (`index.html`), **chỉ tự động phát âm thanh cho các thẻ `APPROVED` (`484` thẻ)**. Các thẻ thuộc diện `NEEDS_REPLACEMENT` (`58` thẻ) và `PENDING_REVIEW` (`63` thẻ) vẫn học hình ảnh, nghĩa, lật thẻ và luyện viết chữ Hán bình thường, nhưng nút nghe hiển thị rõ trạng thái **“Đang cập nhật phát âm”** để tránh dạy sai tiếng Trung cho học sinh.

| Lộ | Tổng số thẻ | `native_exact` (Thu nguyên từ) | `native_concat` (Ghép âm tiết) | ✅ `APPROVED` (Đạt chuẩn phát live) | ❌ `NEEDS_REPLACEMENT` (Cần thu/thay mới - P0) | ⏳ `PENDING_REVIEW` (Chờ GV duyệt ngữ điệu - P1) |
|---|---:|---:|---:|---:|---:|---:|
| **Lộ 1** | 90 | 70 | 20 | **71** | 13 | 6 |
| **Lộ 2** | 109 | 104 | 5 | **104** | 3 | 2 |
| **Lộ 3** | 96 | 69 | 27 | **69** | 12 | 15 |
| **Lộ 4** | 100 | 75 | 25 | **74** | 6 | 20 |
| **Lộ 5** | 92 | 73 | 19 | **73** | 8 | 11 |
| **Lộ 6** | 88 | 65 | 23 | **65** | 15 | 8 |
| **Lộ 7** | 30 | 28 | 2 | **28** | 1 | 1 |
| **Tổng cộng** | **605** | **484** | **121** | **484** | **58** | **63** |

---

## 3. Kết quả Kiểm tra Chuyên sâu các Từ Trọng điểm (Mục 1.3)

| Lộ & ID | Từ vựng | Pinyin | Loại nguồn | Kết quả kiểm tra âm học & ngữ âm | Trạng thái (`audit_status`) | Hướng xử lý |
|---|---|---|---|---|---|---|
| **LO6 #53** | `凉爽` | `Liángshuǎng` | `native_concat` | File `cmn-凉爽.mp3` (`8,776 bytes`, `0.85s`) thực chất chỉ chứa `cmn-凉.mp3` (1 âm tiết `liáng`), **thiếu hoàn toàn âm tiết thứ 2 `爽` (`shuǎng`)**. Không ghép chắp vá âm tiết khác giọng để che lỗi cũ. | ❌ `NEEDS_REPLACEMENT` | Khóa phát âm sai trên UI (báo *“Đang cập nhật phát âm”*), đưa vào danh sách thu âm P0. |
| **LO1 #17** | `哪儿` | `nǎr` | `native_concat` | File cũ chỉ đọc `nǎ` (thiếu âm cuốn lưỡi `r`). Đã thay thế bằng bản thu nguyên từ 1 lần đọc **`File:Zh-nǎr.ogg`** từ Shtooka Project (người đọc: *Wei Gao*, Bắc Kinh, `0.80s`, `CC BY 2.0 fr`), phát âm chuẩn âm cuốn lưỡi `nǎr`. Giữ nguyên nhãn `native_concat` theo quy tắc 1.1. | ✅ `APPROVED` | Đã khắc phục bằng bản thu nguyên từ Shtooka chính gốc. |
| **LO1 #3** | `你好` | `nǐ hǎo` | `native_concat` | Ghép từ `cmn-泥.mp3` (`ní` thanh 2) + `cmn-好.mp3` (`hǎo` thanh 3). Dù đúng quy tắc biến điệu `3+3 → 2+3`, giữa hai chữ có khoảng ngắt `80ms` (`dur=1.26s`), thiếu ngữ điệu chào hỏi liền mạch tự nhiên. | ❌ `NEEDS_REPLACEMENT` | Khóa phát tự động bản ghép, đưa vào danh sách thu âm nguyên từ P0. |
| **LO7 #30** | `小鸟` | `xiǎo niǎo` | `native_concat` | Ghép chéo 2 giọng đọc khác nhau: `pinyin/xiao2.mp3` (Chinese-Lessons Studio) + `cmn-鸟.mp3` (Shtooka), thời lượng kéo dài `1.81s`, đổi màu giọng rõ rệt giữa từ. | ❌ `NEEDS_REPLACEMENT` | Khóa phát tự động bản ghép, đưa vào danh sách thu âm nguyên từ P0. |
| **LO7 #15** | `加减` | `jiā jiǎn` | `native_concat` | Ghép từ 2 bản thu cùng giọng Shtooka `cmn-加.mp3` (`jiā`) + `cmn-减.mp3` (`jiǎn`), đọc đủ cả 2 chữ (`1.26s`, `-18.3 dBFS`), không vi phạm biến điệu. Tuy nhiên là file nối 2 âm tiết rời nên cần giáo viên duyệt độ mượt trước khi mở live. | ⏳ `PENDING_REVIEW` | Tạm ẩn phát tự động cho tới khi giáo viên bấm duyệt `APPROVED` trên `audio-review.html`. |
| **LO4 #24** | `去` *(进去)* | `jìn qù` | `native_exact` | Thẻ có Pinyin `jìn qù` và nghĩa Việt `Đi vào` (2 âm tiết `进去`), nhưng mặt trước PDF in thiếu chữ `进` và file `cmn-去.mp3` chỉ đọc 1 âm tiết `qù` (**thiếu âm tiết `jìn`**). Đã tải sẵn bản thu nguyên từ Shtooka `File:Zh-jìnqù.ogg` (`assets/audio/cmn-进去.mp3`) làm file thay thế ứng viên. | ❌ `NEEDS_REPLACEMENT` | Không tự ý sửa chữ Hán/Pinyin của thẻ; khóa phát file `cmn-去.mp3` thiếu âm tiết và gắn sẵn file ứng viên `cmn-进去.mp3` trong công cụ duyệt. |
| **LO5 #86** | `长胖` | `zhǎng pàng` | `native_concat` | **Lỗi chữ đa âm (`多音字`)**: Chữ `长` trong `长胖` (béo lên/tăng cân) phải đọc là `zhǎng` (thanh 3), nhưng bản ghép dùng `cmn-长.mp3` đọc là `cháng` (thanh 2, giống trong `长城 cháng chéng`). | ❌ `NEEDS_REPLACEMENT` | Khóa phát âm sai ngay lập tức, đưa vào danh sách thu âm P0. |
| **LO6 #75** | `一双` | `yī shuāng` | `native_concat` | **Lỗi biến điệu chữ `一`**: Đứng trước thanh 1 (`shuāng`), chữ `一` bắt buộc đọc biến điệu thành thanh 4 (`yì shuāng`), nhưng bản ghép nối `cmn-一.mp3` (thanh 1 gốc `yī`) + `cmn-双.mp3`. | ❌ `NEEDS_REPLACEMENT` | Khóa phát âm sai, đưa vào danh sách thu âm P0. |
| **LO6 #13** | `洗手间` | `xǐ shǒu jiān` | `native_concat` | **Lỗi biến điệu thanh 3 + từ 3 âm tiết**: Ghép 3 chữ rời `cmn-洗.mp3 + cmn-手.mp3 + cmn-间.mp3` (`1.86s`), chữ `洗` giữ thanh 3 gốc thay vì biến điệu `xí shǒu jiān`, nhịp đọc rời rạc. | ❌ `NEEDS_REPLACEMENT` | Khóa phát âm sai, đưa vào danh sách thu âm P0. |
| **Các từ thanh nhẹ (`轻声`)** | `你们的`, `寒冷的`, `站着`, `坐着`, `除了`, `粽子` | `nǐ men de`, `hán lěng de`, `zhàn zhe`, `zuò zhe`, `chú le`, `zòng zi` | `native_concat` | Các trợ từ/hậu tố thanh nhẹ (`的 de`, `着 zhe`, `了 le`, `子 zi`) khi ghép từ file chữ đơn bị nhấn nguyên thanh điệu gốc hoặc có khoảng lặng trước âm tiết nhẹ. | ❌ `NEEDS_REPLACEMENT` | Khóa phát tự động toàn bộ 7 thẻ ghép thanh nhẹ chưa tự nhiên, đưa vào danh sách thu âm P0. |
| **Các từ 3 âm tiết ghép** | `星期一`..`星期天`, `运动场`, `卫生间`, `老年人`, `年轻人`, `音乐会`, `市中心`, `中秋节`, `纪念品`, `零用钱`, `十百千`, `堆雪人`, `巧克力` | 3 âm tiết | `native_concat` | Các từ 3 âm tiết ghép từ 2–3 file rời có khoảng ngắt nội bộ `>= 80ms` giữa các âm tiết, thiếu nhịp điệu từ ghép 3 chữ tự nhiên. | ❌ `NEEDS_REPLACEMENT` | Khóa phát tự động, đưa vào danh sách thu âm nguyên từ P0. |

---

## 4. Quy trình Nghe Duyệt Nhanh & Thu âm Bổ sung (Phase 2)

1. Mở trang nội bộ **`flashcards/audio-review.html`** (trên local hoặc `https://fengprofessor.github.io/KTN/flashcards/audio-review.html`).
2. Mặc định bộ lọc hiển thị **121 thẻ `native_concat`** để giáo viên tiếng Trung kiểm duyệt liên tiếp:
   - Bấm **`▶️ Nghe liên tiếp tự động`** hoặc phím `Space` để nghe từng từ.
   - Bấm phím `1` (`✅ Đạt`), `2` (`❌ Cần sửa`), hoặc `3` (`⏳ Chưa xác minh`).
   - Bấm **`📥 Xuất audio-quality-audit.csv`** hoặc **`🎙️ Xuất DS cần thu âm (.csv)`** để tải ngay báo cáo cập nhật.
