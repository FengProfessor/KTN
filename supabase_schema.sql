-- ============================================================================
-- KHỔNG TỬ NHÍ — SUPABASE POSTGRESQL SCHEMA & REALTIME SETUP
-- Mục đích: Thay thế hoàn toàn cơ chế lưu JSON trong ô "Mô tả SEO" của izTeach.
-- Phối hợp: File nặng (Video HLS, PDF, MP3, File bài tập S3) vẫn lưu trên izTeach.
-- ============================================================================

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto extension not required on PostgreSQL 13+ (gen_random_uuid is built-in).';
END $$;


-- 1. BẢNG CẤU HÌNH BẢNG GIÁ & THANH TOÁN VIETQR (HỖ TRỢ DUYỆT TAY + BẬT TỰ ĐỘNG)
CREATE TABLE IF NOT EXISTS public.ktn_payment_config (
  id TEXT PRIMARY KEY DEFAULT 'default',
  bank_id TEXT NOT NULL DEFAULT 'MB',
  bank_name TEXT NOT NULL DEFAULT 'MBBank',
  account_no TEXT NOT NULL DEFAULT '',
  account_name TEXT NOT NULL DEFAULT 'HOC VIEN KHONG TU NHI',
  default_amount INTEGER NOT NULL DEFAULT 890000,
  auto_approve_webhook BOOLEAN NOT NULL DEFAULT FALSE,
  course_prices JSONB NOT NULL DEFAULT '{
    "6adadba969897b0002482ca5": { "title": "Khóa học Tiêu Chuẩn New HSK 1 (3.0)", "price": 890000 },
    "65e7704a9ea90c00080d5195": { "title": "Chinese For Kids (Khóa học cho bé 5–6 tuổi)", "price": 890000 },
    "678d14b960eae20002ddf8fe": { "title": "Tiếng Trung Trẻ Em 4 (Lộ trình 7–13 tuổi)", "price": 1290000 }
  }'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

INSERT INTO public.ktn_payment_config (id)
VALUES ('default')
ON CONFLICT (id) DO NOTHING;

-- 2. BẢNG ĐƠN HÀNG ĐĂNG KÝ KHÓA HỌC (TỪ TRANG CHỦ -> QUẢN LÝ DUYỆT 1 CHẠM)
CREATE TABLE IF NOT EXISTS public.ktn_orders (
  order_id TEXT PRIMARY KEY,
  student_name TEXT NOT NULL,
  student_email TEXT NOT NULL,
  phone TEXT NOT NULL,
  course_id TEXT NOT NULL DEFAULT '6adadba969897b0002482ca5',
  course_name TEXT NOT NULL DEFAULT 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)',
  amount INTEGER NOT NULL DEFAULT 890000,
  payment_method TEXT NOT NULL DEFAULT 'VietQR',
  -- pending_verification: Khách mới điền form, chờ Sale gọi / Kế toán đối soát
  -- paid: Đã xác nhận chuyển khoản (qua Webhook hoặc Kế toán xác nhận)
  payment_status TEXT NOT NULL DEFAULT 'pending_verification'
    CHECK (payment_status IN ('pending_verification', 'paid', 'refunded', 'cancelled')),
  -- pending: Chờ duyệt mở khóa | approved: Đã duyệt & cấp tài khoản izTeach
  approval_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  note TEXT DEFAULT '',
  assigned_user_id TEXT,      -- AWS Cognito UUID bên izTeach
  assigned_student_id TEXT,   -- Student ID bên izTeach / KTN
  approved_at TIMESTAMPTZ,
  approved_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_orders_status ON public.ktn_orders (approval_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_orders_phone ON public.ktn_orders (phone);

-- 3. BẢNG GIÁO VIÊN (PHÂN QUYỀN TRANG sll-teacher)
CREATE TABLE IF NOT EXISTS public.ktn_teachers (
  code TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  phone TEXT DEFAULT '',
  specialty TEXT DEFAULT 'Tiếng Trung Trẻ Em YCT / HSK',
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ktn_teachers (code, email, name, specialty, aliases)
VALUES
  ('GV-KTN-08', 'linh.lam@khongtunhi.com', 'Cô Lâm Mỹ Linh', 'Chuyên gia YCT & Phản xạ Giao tiếp', '["linhlm", "colinh", "mylinh", "giaovien"]'::jsonb),
  ('GV-KTN-12', 'thu.ha@khongtunhi.com', 'Cô Trần Thu Hà', 'Chuyên gia HSK & Hán tự tư duy', '["hatt", "coha"]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 4. BẢNG LỚP HỌC & PHÂN CÔNG GIÁO VIÊN CHỦ NHIỆM
CREATE TABLE IF NOT EXISTS public.ktn_classes (
  id TEXT PRIMARY KEY, -- Ví dụ: YCT2-04, YCT3-02
  name TEXT NOT NULL,
  teacher_code TEXT REFERENCES public.ktn_teachers(code) ON DELETE SET NULL,
  teacher_email TEXT,
  schedule TEXT NOT NULL DEFAULT '19:30 Thứ 3 & Thứ 6',
  total_lessons INTEGER NOT NULL DEFAULT 25,
  current_lesson INTEGER NOT NULL DEFAULT 1,
  lesson_assignments JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ktn_classes (id, name, teacher_code, teacher_email, schedule, total_lessons, current_lesson)
VALUES
  ('YCT2-04', 'Lớp YCT 2 — Ca tối Thứ 3 & Thứ 6', 'GV-KTN-08', 'linh.lam@khongtunhi.com', '19:30 Thứ 3 & Thứ 6', 25, 18),
  ('YCT3-02', 'Lớp YCT 3 — Ca tối Thứ 4 & Chủ Nhật', 'GV-KTN-12', 'thu.ha@khongtunhi.com', '19:30 Thứ 4 & Chủ Nhật', 25, 12)
ON CONFLICT (id) DO NOTHING;

-- 5. BẢNG DANH MỤC KHÓA HỌC & GÓI COMBO (ĐỒNG BỘ TỰ ĐỘNG VỚI IZTEACH)
CREATE TABLE IF NOT EXISTS public.ktn_courses (
  course_id TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  short_title TEXT NOT NULL,
  badge TEXT NOT NULL DEFAULT 'KHÓA HỌC CHUẨN',
  age_group TEXT DEFAULT '5 – 15 tuổi',
  lessons_count INTEGER NOT NULL DEFAULT 20,
  price INTEGER NOT NULL DEFAULT 890000,
  old_price INTEGER NOT NULL DEFAULT 1500000,
  thumb_url TEXT DEFAULT '',
  is_bundle BOOLEAN NOT NULL DEFAULT FALSE,
  bundle_course_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 10,
  synced_from_izteach_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.ktn_courses (course_id, code, title, short_title, badge, age_group, lessons_count, price, old_price, is_bundle, bundle_course_ids, sort_order)
VALUES
  ('6adadba969897b0002482ca5', 'HSK1-30', 'Khóa học Tiêu Chuẩn New HSK 1 (3.0)', 'HSK1 3.0', 'TIÊU CHUẨN MỚI 3.0', 'Mọi lứa tuổi', 15, 890000, 1500000, FALSE, '[]'::jsonb, 1),
  ('65e7704a9ea90c00080d5195', 'CFK-01', 'Chinese For Kids (Khóa học cho bé 5 – 6 tuổi)', 'Chinese For Kids', 'SONG NGỮ MẦM NON', '5 – 6 tuổi', 20, 890000, 1500000, FALSE, '[]'::jsonb, 2),
  ('6638bd09a7367400085c7ab2', 'KIDS-03', 'Tiếng Trung Trẻ Em 3 (Mini vỡ lòng 5 – 6 tuổi)', 'Tiếng Trung Trẻ Em 3', 'CẤP ĐỘ 03', '5 – 6 tuổi', 20, 890000, 1500000, FALSE, '[]'::jsonb, 3),
  ('678d14b960eae20002ddf8fe', 'KIDS-04', 'Tiếng Trung Trẻ Em 4 (Lộ trình 7 – 13 tuổi)', 'Tiếng Trung Trẻ Em 4', 'CẤP ĐỘ 04', '7 – 13 tuổi', 18, 890000, 1500000, FALSE, '[]'::jsonb, 4),
  ('67a7290a5fdc26000238b4e9', 'KIDS-05', 'Tiếng Trung Trẻ Em 5 (Lộ trình 8 – 14 tuổi)', 'Tiếng Trung Trẻ Em 5', 'CẤP ĐỘ 05', '8 – 14 tuổi', 20, 890000, 1500000, FALSE, '[]'::jsonb, 5),
  ('67a869302ecb9c000257d966', 'KIDS-06', 'Tiếng Trung Trẻ Em 6 (Lộ trình 9 – 15 tuổi)', 'Tiếng Trung Trẻ Em 6', 'CẤP ĐỘ 06', '9 – 15 tuổi', 20, 890000, 1500000, FALSE, '[]'::jsonb, 6),
  ('6983672f409cc20002e530b8', 'YCT-04', 'Khóa học Tiếng Trung Trẻ Em YCT 4', 'Tiếng Trung YCT 4', 'CHỨNG CHỈ YCT 4', '9 – 15 tuổi', 20, 1290000, 2000000, FALSE, '[]'::jsonb, 7),
  ('65e76a533f5e7c00086715d7', 'PRON-01', 'Khóa học Phát Âm & Giao Tiếp Phản Xạ Cơ Bản', 'Phát Âm & Phản Xạ', 'GIAO TIẾP PHẢN XẠ', 'Mọi lứa tuổi', 19, 690000, 1200000, FALSE, '[]'::jsonb, 8),
  ('67bebce067dba000027d8119', 'HANZI-01', 'Khóa học Hán Tự Tư Duy & Luyện Viết Chữ Hán', 'Hán Tự Tư Duy', 'HÁN TỰ TƯ DUY', '6 – 15 tuổi', 20, 690000, 1200000, FALSE, '[]'::jsonb, 9),
  ('BUNDLE_YCT_ALL', 'COMBO-6', 'Trọn Bộ 6 Khóa Học Trực Tuyến (Lộ trình 5 – 15 tuổi)', 'Trọn Bộ 6 Khóa', 'COMBO ƯU ĐÃI 50%', '5 – 15 tuổi', 113, 2990000, 6000000, TRUE, '["6adadba969897b0002482ca5","65e7704a9ea90c00080d5195","6638bd09a7367400085c7ab2","678d14b960eae20002ddf8fe","67a7290a5fdc26000238b4e9","67a869302ecb9c000257d966"]'::jsonb, 0)
ON CONFLICT (course_id) DO NOTHING;

-- 6. BẢNG HỌC VIÊN & QUYỀN KHÓA HỌC / XẾP LỚP (PHÂN QUYỀN TRANG sll-hocsinh)
CREATE TABLE IF NOT EXISTS public.ktn_students (
  code TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  parent_name TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  cognito_user_id TEXT,       -- AWS Cognito UUID trên izTeach
  izteach_student_id TEXT,    -- Mongo ID trên izTeach
  class_code TEXT REFERENCES public.ktn_classes(id) ON DELETE SET NULL,
  has_live_class BOOLEAN NOT NULL DEFAULT FALSE,
  has_online_courses BOOLEAN NOT NULL DEFAULT FALSE,
  online_courses JSONB NOT NULL DEFAULT '[]'::jsonb,
  aliases JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_students_class ON public.ktn_students (class_code);
CREATE INDEX IF NOT EXISTS idx_ktn_students_email ON public.ktn_students (email);

INSERT INTO public.ktn_students (code, email, name, cognito_user_id, izteach_student_id, class_code, has_live_class, has_online_courses, online_courses)
VALUES
  ('KTN-2026-TAPHON', 'taphong2002@gmail.com', 'Tạ Phong Võ', 'bc21991c-ce9b-465d-b85f-dbb1821e51a9', '6abb2c0b8b46e30002add37b', NULL, FALSE, TRUE, '[{"id":"6adadba969897b0002482ca5","title":"HSK1 3.0"}]'::jsonb),
  ('KTN-2026-089', 'hoangngan@khongtunhi.com', 'Bé Nguyễn Hoàng Ngân', 'a5782fcf-a0a5-469c-89bc-ed79cd2c1f68', NULL, 'YCT2-04', TRUE, TRUE, '[{"id":"6adadba969897b0002482ca5","title":"HSK1 3.0"}]'::jsonb),
  ('KTN-2026-102', 'minhkhang@khongtunhi.com', 'Bé Trần Minh Khang', NULL, NULL, 'YCT2-04', TRUE, FALSE, '[]'::jsonb),
  ('KTN-2026-VIP', 'taphong2002vip@gmail.com', 'Tạ Phong VIP', '424d2085-8685-4a49-a5e8-8fb63b0c85c5', NULL, NULL, FALSE, FALSE, '[]'::jsonb)
ON CONFLICT (code) DO NOTHING;

-- 6. BẢNG ĐIỂM DANH THEO BUỔI HỌC (THAY THẾ CHUỖI TEXT TĨNH CŨ)
CREATE TABLE IF NOT EXISTS public.ktn_attendance (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  class_code TEXT NOT NULL REFERENCES public.ktn_classes(id) ON DELETE CASCADE,
  student_code TEXT REFERENCES public.ktn_students(code) ON DELETE CASCADE,
  student_email TEXT,
  student_name TEXT DEFAULT '',
  lesson_num INTEGER NOT NULL DEFAULT 1,
  session_num INTEGER DEFAULT 1,
  date TEXT DEFAULT CURRENT_DATE::text,
  status TEXT NOT NULL DEFAULT 'present'
    CHECK (status IN ('present', 'late', 'excused', 'absent', 'absent_excused', 'absent_unexcused')),
  note TEXT DEFAULT '',
  teacher_note TEXT DEFAULT '',
  recorded_by TEXT,
  updated_by TEXT,
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (class_code, student_code, lesson_num)
);

-- 7. BẢNG BÀI TẬP NỘP & CHẤM ĐIỂM (FILE NẶNG LƯU S3 IZTEACH, ĐIỂM & LỜI PHÊ LƯU SUPABASE)
CREATE TABLE IF NOT EXISTS public.ktn_homeworks (
  id TEXT PRIMARY KEY,
  student_code TEXT,
  student_email TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_code TEXT,
  course_id TEXT NOT NULL DEFAULT '6adadba969897b0002482ca5',
  lesson_num INTEGER NOT NULL DEFAULT 1,
  lesson_title TEXT NOT NULL DEFAULT '',
  -- Đường dẫn file Video/Ảnh/Audio đã tải lên kho S3 miễn phí của izTeach
  file_url TEXT NOT NULL,
  file_type TEXT NOT NULL DEFAULT 'video',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  izteach_resource_id TEXT,
  workbook_answers JSONB NOT NULL DEFAULT '{}'::jsonb,
  student_note TEXT DEFAULT '',
  -- pending: Mới nộp, chờ cô chấm (CHƯA tính là hoàn thành bài học)
  -- revision_requested: Cô yêu cầu con sửa lại bài (Cần sửa)
  -- graded: Cô đã chấm đạt / hoàn thành
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'graded', 'revision_requested')),
  score NUMERIC(4, 2),
  teacher_feedback TEXT DEFAULT '',
  teacher_audio_url TEXT DEFAULT '',
  graded_by TEXT,
  graded_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_student ON public.ktn_homeworks (student_email, course_id, lesson_num);
CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_class_status ON public.ktn_homeworks (class_code, status, submitted_at DESC);

-- Migration an toàn cho database cũ đã tồn tại bảng ktn_homeworks từ phiên bản trước
ALTER TABLE public.ktn_homeworks ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;
UPDATE public.ktn_homeworks SET status = 'revision_requested' WHERE status = 'needs_revision';
ALTER TABLE public.ktn_homeworks DROP CONSTRAINT IF EXISTS ktn_homeworks_status_check;
ALTER TABLE public.ktn_homeworks ADD CONSTRAINT ktn_homeworks_status_check CHECK (status IN ('pending', 'graded', 'revision_requested'));

-- 7B. BẢNG BUỔI HỌC & BÀI TẬP THEO LỚP CÔ GIÁO (BUỔI 1, BUỔI 2...)
CREATE TABLE IF NOT EXISTS public.ktn_class_sessions (
  id TEXT PRIMARY KEY,
  class_code TEXT NOT NULL REFERENCES public.ktn_classes(id) ON DELETE CASCADE,
  session_num INTEGER NOT NULL DEFAULT 1,
  session_title TEXT NOT NULL DEFAULT '',
  exercises JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (class_code, session_num)
);

CREATE INDEX IF NOT EXISTS idx_ktn_class_sessions_class ON public.ktn_class_sessions (class_code, session_num ASC);

-- 8. BẢNG TIN NHẮN TRAO ĐỔI CÔ GIÁO <-> HỌC VIÊN/PHỤ HUYNH (REALTIME CHAT)
CREATE TABLE IF NOT EXISTS public.ktn_messages (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL, -- Ví dụ: class:YCT2-04 hoặc student:hoangngan@khongtunhi.com
  class_code TEXT,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL CHECK (sender_role IN ('student', 'teacher', 'admin')),
  content TEXT NOT NULL,
  attachment_url TEXT DEFAULT '',
  dlp_flagged BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_messages_room ON public.ktn_messages (room_id, created_at ASC);

-- 9. BẢNG CẢNH BÁO AN TOÀN LIÊN LẠC (DLP ALERTS CHO ADMIN)
CREATE TABLE IF NOT EXISTS public.ktn_dlp_alerts (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  sender_email TEXT NOT NULL,
  sender_name TEXT NOT NULL,
  sender_role TEXT NOT NULL,
  blocked_content TEXT NOT NULL,
  reason TEXT NOT NULL,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 10. BẢNG THIẾT BỊ NHẬN CHUÔNG THÔNG BÁO PWA (KHÔNG GIỚI HẠN 30 NGƯỜI)
CREATE TABLE IF NOT EXISTS public.ktn_push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  user_role TEXT NOT NULL CHECK (user_role IN ('student', 'teacher', 'admin')),
  class_code TEXT,
  endpoint TEXT UNIQUE NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  notify_settings JSONB NOT NULL DEFAULT '{
    "remindClass": true,
    "onGraded": true,
    "onSubmitted": true,
    "onAssignedOrChat": true
  }'::jsonb,
  user_agent TEXT DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_push_email ON public.ktn_push_subscriptions (user_email);
CREATE INDEX IF NOT EXISTS idx_ktn_push_class ON public.ktn_push_subscriptions (class_code, user_role);

-- BẬT SUPABASE REALTIME CHO ĐƠN HÀNG, BÀI TẬP, TIN NHẮN & CẢNH BÁO DLP
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ktn_orders; EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ktn_homeworks; EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ktn_messages; EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL; END;
    BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.ktn_dlp_alerts; EXCEPTION WHEN DUPLICATE_OBJECT THEN NULL; END;
  END IF;
END $$;

-- 11. NÂNG CẤP V3: BẢNG ĐIỀU PHỐI TÀI KHOẢN & NHẬT KÝ ĐỐI SOÁT 3 BÊN
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.ktn_students
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS izteach_student_id TEXT,
  ADD COLUMN IF NOT EXISTS has_live_class BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_online_courses BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ready_to_login',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS search_text TEXT;

ALTER TABLE public.ktn_teachers
  ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cognito_user_id TEXT,
  ADD COLUMN IF NOT EXISTS izteach_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'ready_to_login',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS search_text TEXT;

ALTER TABLE public.ktn_orders
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS operation_id TEXT,
  ADD COLUMN IF NOT EXISTS class_code TEXT,
  ADD COLUMN IF NOT EXISTS approved_by TEXT,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_steps JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS failed_step TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

ALTER TABLE public.ktn_homeworks
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS izteach_remote_id TEXT,
  ADD COLUMN IF NOT EXISTS unit_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

ALTER TABLE public.ktn_attendance
  ALTER COLUMN id TYPE TEXT USING id::text,
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN student_code DROP NOT NULL,
  ALTER COLUMN lesson_num SET DEFAULT 1,
  ADD COLUMN IF NOT EXISTS student_email TEXT,
  ADD COLUMN IF NOT EXISTS student_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS session_num INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS date TEXT DEFAULT CURRENT_DATE::text,
  ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.ktn_attendance DROP CONSTRAINT IF EXISTS ktn_attendance_status_check;
ALTER TABLE public.ktn_attendance ADD CONSTRAINT ktn_attendance_status_check
  CHECK (status IN ('present', 'late', 'excused', 'absent', 'absent_excused', 'absent_unexcused'));

CREATE TABLE IF NOT EXISTS public.ktn_provisioning_jobs (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  job_type TEXT NOT NULL,
  target_email TEXT NOT NULL,
  target_role TEXT DEFAULT 'student',
  actor_email TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  sync_status TEXT DEFAULT 'pending',
  retryable BOOLEAN DEFAULT true,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  failed_step TEXT,
  cognito_user_id TEXT,
  izteach_student_id TEXT,
  request_payload JSONB DEFAULT '{}'::jsonb,
  response_payload JSONB DEFAULT '{}'::jsonb,
  result_summary JSONB DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ktn_sync_events (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  operation_id TEXT,
  event_type TEXT NOT NULL,
  target_system TEXT DEFAULT 'three_way',
  source_system TEXT DEFAULT 'worker_bff',
  entity_type TEXT NOT NULL DEFAULT 'student',
  entity_id TEXT,
  entity_key TEXT,
  status TEXT DEFAULT 'info',
  sync_status TEXT NOT NULL DEFAULT 'info',
  error_code TEXT,
  drift_code TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

DROP INDEX IF EXISTS public.idx_ktn_students_class;
DROP INDEX IF EXISTS public.idx_ktn_students_class_code;
DROP INDEX IF EXISTS public.idx_ktn_students_email;
DROP INDEX IF EXISTS public.idx_ktn_students_name_trgm;
CREATE INDEX IF NOT EXISTS idx_ktn_students_email_lower ON public.ktn_students (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ktn_students_code_lower ON public.ktn_students (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_ktn_students_phone ON public.ktn_students (phone);
CREATE INDEX IF NOT EXISTS idx_ktn_students_updated_email ON public.ktn_students (updated_at DESC NULLS LAST, email ASC);
CREATE INDEX IF NOT EXISTS idx_ktn_students_class_updated ON public.ktn_students (class_code, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ktn_students_search_text_trgm ON public.ktn_students USING GIN (search_text gin_trgm_ops) WITH (fastupdate = off);
CREATE INDEX IF NOT EXISTS idx_ktn_attendance_class_date ON public.ktn_attendance (class_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_attendance_student_date ON public.ktn_attendance (student_code, date DESC);

ALTER TABLE public.ktn_provisioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_sync_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.ktn_provisioning_jobs, public.ktn_sync_events FROM PUBLIC;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
      NULL;
    END;
  END IF;
END $$;
DROP POLICY IF EXISTS "Allow all for service role" ON public.ktn_provisioning_jobs;
DROP POLICY IF EXISTS "service_role_only_ktn_provisioning_jobs" ON public.ktn_provisioning_jobs;
CREATE POLICY "service_role_only_ktn_provisioning_jobs"
  ON public.ktn_provisioning_jobs
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for service role" ON public.ktn_sync_events;
DROP POLICY IF EXISTS "service_role_only_ktn_sync_events" ON public.ktn_sync_events;
CREATE POLICY "service_role_only_ktn_sync_events"
  ON public.ktn_sync_events
  AS PERMISSIVE
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

