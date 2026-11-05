# KIẾN TRÚC KỸ THUẬT — KTN UI V2 (`apps/ktn-web-v2`)

> **Dự án:** Học Viện Khổng Tử Nhí (KTN)  
> **Mô hình chuyển đổi:** Strangler Migration (Giữ nguyên Backend Cloudflare Workers + Supabase PostgreSQL + izTeach/AWS, nâng cấp tầng Frontend lên React + TypeScript + Vite).

---

## 1. Tổng quan Kiến trúc 3 Tầng Dữ liệu

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   KTN UI V2 (React 18 + TypeScript + Vite)                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Student App  │  │ Zalo-like    │  │ Video HLS    │  │ Teacher & Admin │  │
│  │ & Dashboard  │  │ Class Chat   │  │ & Homework   │  │ Workspaces      │  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘  └────────┬────────┘  │
│         └─────────────────┴────────┬────────┴───────────────────┘           │
│                     TanStack Query + Zustand + BroadcastChannel             │
└────────────────────────────────────┼────────────────────────────────────────┘
                                     │ HTTPS (/api/ktn/* + Bearer Token)
                                     ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│              CLOUDFLARE WORKER BFF (cloudflare-worker-sw-proxy.js)          │
│  • Xác thực phiên HMAC-SHA256 & phân quyền RBAC (Student / Teacher / Admin) │
│  • Kiểm tra quyền khóa học (403 COURSE_NOT_ENTITLED)                        │
│  • Kiểm duyệt an toàn học đường DLP (chặn SĐT / link ngoài trong Chat)     │
│  • Idempotency deduplication theo clientMessageId + Cursor Pagination       │
└──────────────────┬──────────────────────────────────────┬───────────────────┘
                   │                                      │
                   ▼                                      ▼
┌─────────────────────────────────────┐  ┌────────────────────────────────────┐
│     SUPABASE POSTGRESQL (SLL DB)    │  │        izTeach / AWS S3 / CDN      │
│  • ktn_students, ktn_teachers       │  │  • Quản lý quyền khóa học online   │
│  • ktn_classes, ktn_class_sessions  │  │  • Luồng phát video HLS (.m3u8)    │
│  • ktn_messages (Chat Zalo lớp)     │  │  • Presigned S3 URL nộp bài tập    │
│  • ktn_homeworks, ktn_orders        │  │  • CloudFront CDN tài liệu/audio   │
└─────────────────────────────────────┘  └────────────────────────────────────┘
```

---

## 2. Phân tách trách nhiệm State Management

| Thành phần | Công nghệ | Trách nhiệm | Nguyên tắc bảo toàn |
|---|---|---|---|
| **Server State** | `@tanstack/react-query` | Danh sách khóa học, bài giảng, buổi học lớp trực tiếp, tin nhắn lớp học, bài nộp, thông báo | Không lưu trữ giả lập làm nguồn sự thật; tự động invalidate khi có sự kiện mới |
| **Client UI State** | `zustand` (`useUiStore`, `useAuthStore`) | Trạng thái đóng/mở sidebar, phòng chat đang chọn, bản nháp tin nhắn theo từng phòng (`draftByRoom`), hàng đợi `sending` và `failed`, chế độ Demo/Live | Lưu bản nháp và hàng đợi lỗi xuống `localStorage` để học sinh không bao giờ mất nội dung khi rớt mạng |
| **Authoritative Backend** | `cloudflare-worker-sw-proxy.js` | Xác thực, phân quyền lớp học, ghi cơ sở dữ liệu Supabase, đồng bộ izTeach | Frontend **không bao giờ** nhúng `SUPABASE_SERVICE_ROLE_KEY` hoặc ghi thẳng vào DB bỏ qua Worker |

---

## 3. Cấu trúc thư mục `apps/ktn-web-v2`

```
apps/ktn-web-v2/
├── server/
│   └── local-worker-middleware.mjs   # Môi trường BFF thực thi trực tiếp cloudflare-worker-sw-proxy.js
├── src/
│   ├── app/
│   │   ├── layouts/AppShell.tsx      # Responsive Desktop Sidebar + Mobile Bottom Nav + Header Bell
│   │   ├── providers/AppProviders.tsx
│   │   └── router/AppRouter.tsx      # Điều hướng phân quyền & chế độ Interactive Demo
│   ├── components/
│   │   ├── shared/DemoControlBar.tsx # Thanh chuyển đổi minh bạch giữa Dữ liệu thật & Demo States
│   │   └── ui/ToastViewport.tsx
│   ├── features/
│   │   ├── auth/                     # Đăng nhập Zod + React Hook Form + Quick 1-click BFF Accounts
│   │   ├── dashboard/                # Trang tổng quan Học sinh ("Hôm nay con học gì?")
│   │   ├── learning/                 # HlsVideoPlayer (hls.js) + Lesson Sidebar + HomeworkPanel
│   │   ├── classrooms/               # Tách bạch Lớp trực tiếp có GV & Khóa học Video tự học
│   │   ├── chat/                     # Giao diện Chat lớp học kiểu Zalo (2 cột Desktop, Fullscreen Mobile)
│   │   ├── notifications/            # Trung tâm thông báo đa thiết bị + Web Push opt-in
│   │   ├── teacher/                  # Cổng Giáo viên: Chấm điểm 0–10, giao bài buổi học, nhắn phụ huynh
│   │   └── admin/                    # Cổng Quản lý: Duyệt đơn, mở khóa học phần, xếp lớp
│   ├── services/api/ktnApiClient.ts  # Client HTTP chuẩn hóa gọi /api/ktn/*
│   ├── stores/                       # useAuthStore.ts, useUiStore.ts
│   └── types/ktn.types.ts            # Định nghĩa kiểu dữ liệu TypeScript strict
└── tests/
    ├── unit/utils-and-chat.test.tsx  # Vitest unit & state-machine tests
    └── e2e/verify-ui-v2.mjs          # Kiểm thử trình duyệt thật Playwright + chụp ảnh đa thiết bị
```
