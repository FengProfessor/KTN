# 02 — ARCHITECTURE & SOURCE-OF-TRUTH MATRIX

> **Mục đích:** Xác định rõ nguồn dữ liệu chính thức (Authoritative Source of Truth) giữa 3 hệ thống: **Sổ Liên Lạc (Frontend Web App)** · **Supabase + Cloudflare Worker (BFF)** · **izTeach (AWS Cognito / LMS / S3)**, cùng quy trình biên dịch từ file nguồn sang file đích.

---

## 1. Kiến trúc 3 cuốn sổ & Ma trận Nguồn dữ liệu chính thức (Source of Truth)

```
┌────────────────────────────────────────────────────────────────────────────┐
│                        CUỐN SỔ 1: SỔ LIÊN LẠC WEB APP                      │
│   - Cổng Học sinh: sll-hocsinh.html (biên dịch từ portal_template.html)    │
│   - Cổng Giáo viên: sll-giaovien.html + so-lien-lac-ux.js + lms.js         │
│   - Cổng Quản lý:   sll-quanly.html   + so-lien-lac-ux.js + lms.js         │
│   - Client SDK:     ktn-webapp-client.js                                   │
└───────────────────────────────────────┬────────────────────────────────────┘
                                        │ HTTPS (/api/ktn/*) + Bearer Token
                                        ▼
┌────────────────────────────────────────────────────────────────────────────┐
│              TRẠM GÁC CỔNG: CLOUDFLARE WORKER (BFF PROXY)                  │
│                     cloudflare-worker-sw-proxy.js                          │
│   - Xác thực HMAC-SHA256 Session Token + Kiểm tra thu hồi (Fail-Closed)    │
│   - Kiểm tra RBAC (Student / Teacher theo lớp / Admin)                     │
│   - Điều phối đồng bộ 3 chiều + Read-After-Write Verification              │
└───────────────────┬────────────────────────────────────┬───────────────────┘
                    │                                    │
                    ▼                                    ▼
┌───────────────────────────────────────┐  ┌─────────────────────────────────┐
│        CUỐN SỔ 2: SUPABASE            │  │       CUỐN SỔ 3: IZTEACH        │
│  - ktn_students (Lớp + Khóa học)      │  │  - Cognito Auth (/signin)       │
│  - ktn_classes, ktn_teachers          │  │  - /prod/user-permission        │
│  - ktn_class_sessions                 │  │  - /prod/unit (346 units)       │
│  - ktn_homeworks (_history, _syncMeta)│  │  - /prod/homework               │
│  - ktn_messages, ktn_notifications    │  │  - /prod/resource/signed-url    │
│  - ktn_dlp_alerts (Revoked Tokens)    │  │  - S3 + CloudFront CDN          │
└───────────────────────────────────────┘  └─────────────────────────────────┘
```

### Bảng phân định Nguồn dữ liệu chính thức (Source-of-Truth Matrix)

| Loại dữ liệu | Nguồn chính thức (Primary SoT) | Nguồn đối chiếu / Bản sao (Secondary / Mirror) | Quy tắc đồng bộ & Xử lý xung đột |
|---|---|---|---|
| **1. Tài khoản & Mật khẩu Học viên / Admin** | **izTeach Cognito** (`/prod/student/signin`, `/prod/signin`) | **Supabase** (`ktn_students`, `ktn_teachers`) + **Worker HMAC Session** | Đăng nhập xác thực mật khẩu qua izTeach (hoặc mật khẩu kiểm thử E2E cô lập), sau đó Worker cấp token phiên `HMAC-SHA256` và đối chiếu danh sách thu hồi trong `ktn_dlp_alerts`. |
| **2. Quyền khóa học Video trực tuyến (`online_courses`)** | **izTeach** (`/prod/user-permission`) **+ Supabase** (`ktn_students.online_courses`) | **Sổ Liên Lạc** (`currentStudentProfile`, `IzTeachStore.entitlement`) | Khi cấp/thu hồi khóa học (`POST /api/ktn/students/courses`), Worker bắt buộc cập nhật trên izTeach trước, thực hiện **Read-After-Write Verification** qua `GET /prod/user-permission`, rồi mới cập nhật `ktn_students.online_courses` trên Supabase. Nếu izTeach lỗi hoặc xác minh lệch, trả về `502` và **không** sửa Supabase. |
| **3. Phân lớp trực tiếp (`class_code`) & Giáo viên chủ nhiệm** | **Supabase** (`ktn_students.class_code`, `ktn_classes`, `ktn_teachers`) | **Sổ Liên Lạc** (`currentStudentProfile.classCode`, `window.app.state`) | Lớp học trực tiếp với cô (`YCT2-04`, `YCT3-02`...) chỉ tồn tại trên Sổ Liên Lạc & Supabase. Trình duyệt khi tải trang phải gọi `/api/ktn/students/me` và gắn `_serverSynced: true`, xóa bỏ mọi `classCode` cũ lưu trong `localStorage` nếu máy chủ trả về `class_code: null`. |
| **4. Danh mục 17 Khóa học & 346 Bài giảng (`unitId`, HLS video)** | **izTeach** (`/prod/unit`) & **Master Curriculum JSON** (`all_courses_lessons_data.json`, `clean_lessons_data.json`) | **Worker** (`COURSE_UNIT_MAP`, `MASTER_PRODUCT_MAPPING`) | Mỗi `(courseId, lessonNum)` ánh xạ 1-1 tới đúng `unitId` 24-hex của khóa đó thông qua `COURSE_UNIT_MAP`. Nghiêm cấm dùng `HSK1_UNIT_MAP` hoặc `DEFAULT_COURSE_ID` cho các khóa khác. |
| **5. Buổi học trên lớp (`ktn_class_sessions`)** | **Supabase** (`ktn_class_sessions`) | **Sổ Liên Lạc** (`renderStudentClassSessions`, `lms.js`) | Giáo viên chủ nhiệm tạo/cập nhật buổi học qua `POST /api/ktn/class-sessions`. Worker chuẩn hóa song song cả 2 trường `exercises` và `assignments` để tương thích 100% giữa giao diện Giáo viên và Học sinh. |
| **6. Bài nộp & Điểm chấm Khóa học Video** | **Supabase** (`ktn_homeworks`) | **izTeach** (`/prod/homework`) | Lưu bền vững vào `ktn_homeworks` trước (`saved_to_supabase`), sau đó đồng bộ sang đúng `(courseId, unitId)` trên izTeach. Kết quả đồng bộ được ghi vào `workbook_answers._syncMeta.syncStatus` (`synced`, `sync_failed`, `mapping_required`). |
| **7. Bài nộp & Điểm chấm Lớp trực tiếp (`CLASS_*`)** | **Supabase** (`ktn_homeworks`) | **Không gửi sang izTeach** (`not_applicable_live_class`) | Bài tập buổi học trên lớp (`CLASS_YCT2-04`...) không có `unitId` khóa video trên izTeach. Worker lưu vào `ktn_homeworks` với `syncStatus = 'not_applicable_live_class'` và tuyệt đối không gửi sang izTeach. |
| **8. Tin nhắn lớp học & Thông báo (`ktn_messages`, `ktn_notifications`)** | **Supabase** (`ktn_messages`, `ktn_notifications`) | **Sổ Liên Lạc** (`localStorage` cache) | Phòng chat tách biệt theo `class:<CLASS_CODE>`. Trạng thái đã đọc thông báo (`read: true`) được lưu bền vững trên Supabase qua `PATCH /api/ktn/notifications/read`. |

---

## 2. Quy trình File Nguồn → File Đích (Build Pipeline)

Để tránh lỗi sửa trực tiếp vào file sinh tự động, hệ thống tuân thủ nghiêm ngặt quy tắc biên dịch sau:

| File Nguồn (Chỉnh sửa tại đây) | Script Biên dịch | File Đích Sinh ra (Không sửa tay) |
|---|---|---|
| `portal_template.html` + `clean_lessons_data.json` + `all_courses_lessons_data.json` | `node build_clean_real_portal.js` | `sll-hocsinh.html` và `demo_hsk1_student_portal.html` |
| `cloudflare-worker-sw-proxy.js` | Chạy trực tiếp trên Cloudflare Worker | Worker BFF API (`/api/ktn/*`) |
| `ktn-webapp-client.js`, `so-lien-lac-ux.js`, `so-lien-lac-lms.js`, `so-lien-lac-auth.js` | Phục vụ trực tiếp (Static JS) | Tải bởi `sll-hocsinh.html`, `sll-giaovien.html`, `sll-quanly.html`, `so-lien-lac.html` |

> **Cổng kiểm soát CI (`.github/workflows/ci-quality-gate.yml`):** Tự động chạy `node build_clean_real_portal.js` và `git diff --exit-code sll-hocsinh.html demo_hsk1_student_portal.html` trên mọi commit/PR để chặn mọi thay đổi lệch giữa `portal_template.html` và các file HTML cổng học sinh.
