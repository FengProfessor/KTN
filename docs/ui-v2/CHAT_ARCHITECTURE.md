# KIẾN TRÚC PHÒNG CHAT LỚP HỌC KIỂU ZALO (`CHAT_ARCHITECTURE.md`)

> Giải quyết triệt để các lỗi `BUG CHAT-01` đến `BUG CHAT-07` từ hệ thống cũ và thiết lập máy trạng thái tin cậy cho Học sinh — Phụ huynh — Giáo viên.

---

## 1. Máy trạng thái gửi tin nhắn (Message Delivery State Machine)

Tuyệt đối tuân thủ nguyên tắc **"Không tạo thành công giả"**:

```
[Người dùng bấm Gửi]
        │
        ▼
1. Sinh `clientMessageId` duy nhất (`cmsg_<timestamp>_<random>`)
2. Đưa tin nhắn vào `sendingMessagesByRoom` với trạng thái `status = 'sending'` ("Đang gửi...")
3. Gọi `POST /api/ktn/messages` (kèm `clientMessageId`, `roomId`, `content`, `attachmentUrl`)
        │
        ├──► [HTTP 200/201 + persisted: true]
        │       • Xóa khỏi `sendingMessagesByRoom`
        │       • Cập nhật `status = 'sent'` ("Đã gửi" + `serverMessageId`)
        │       • Phát tín hiệu `BroadcastChannel` sang các tab đang mở
        │
        └──► [Lỗi mạng / HTTP 5xx / Offline]
                • Chuyển sang `failedMessagesByRoom` với `status = 'failed'` ("Chưa gửi được")
                • Khôi phục nội dung vào ô nhập (`draftByRoom`) để học sinh không bao giờ mất chữ
                • Hiển thị nút "Thử lại" gửi lại đúng `clientMessageId` đó
```

---

## 2. Xử lý Idempotency & Chống nhân đôi tin nhắn

Trên `cloudflare-worker-sw-proxy.js` (`POST /api/ktn/messages`):
- Kiểm tra `clientMessageId` trong bộ nhớ phiên làm việc (`__ktnClientMessageIdMap`) và kiểm tra bản ghi trùng nội dung của cùng `sender_email` trong cửa sổ 4 giây gần nhất.
- Nếu học sinh bấm `"Thử lại"` sau khi gói tin trước đã lưu thành công vào DB nhưng rớt mạng ở chiều trả về, Worker trả về ngay bản ghi đã lưu (`idempotent: true`) mà không tạo dòng trùng lặp.

---

## 3. Phân trang con trỏ (Cursor Pagination) & Đồng bộ Đã đọc (`CHAT_READ_STATE`)

1. **Cursor Pagination (`GET /api/ktn/messages`):**
   - Hỗ trợ tham số `limit` và `before` (timestamp hoặc ID tin nhắn cũ nhất đang hiển thị).
   - Trả về `pagination: { hasMore, nextCursor, oldestCreatedAt, limit, totalAvailable }`.
   - Khắc phục hoàn toàn lỗi cũ cắt cứng `limit=100` từ đầu lịch sử lớp học.
2. **Đồng bộ Trạng thái Đã đọc (`POST /api/ktn/messages/read`):**
   - Lưu mốc đọc theo từng tài khoản và từng phòng (`CHAT_READ_STATE|<email>|<roomId>`).
   - `GET /api/ktn/messages/rooms` tính toán chính xác `unreadCount` cho từng phòng học và kênh trao đổi 1-1.
