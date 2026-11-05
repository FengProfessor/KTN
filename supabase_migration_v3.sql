-- =================================================================================
-- KTN BACKEND V3 — IDEMPOTENT MIGRATION (SEARCH, INDEXES, PROVISIONING & SYNC SAGA)
-- Chạy an toàn nhiều lần trên Supabase SQL Editor (Idempotent DDL)
-- =================================================================================

-- 1. Extensions cho tìm kiếm cực nhanh (Trigram & Unaccent)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'unaccent extension not available or requires superuser; using ktn_normalize_vi fallback.';
END $$;

-- 2. Hàm chuẩn hóa tiếng Việt không dấu, chữ thường, gộp khoảng trắng (Immutable)
CREATE OR REPLACE FUNCTION public.ktn_normalize_vi(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  res TEXT;
BEGIN
  IF input_text IS NULL THEN
    RETURN '';
  END IF;
  res := LOWER(TRIM(input_text));
  res := TRANSLATE(
    res,
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );
  res := REGEXP_REPLACE(res, '\s+', ' ', 'g');
  RETURN res;
END;
$$;

-- 3. Nâng cấp bảng ktn_students (Bổ sung cột trạng thái tài khoản, đồng bộ & search_text)
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

-- Trigger tự động cập nhật search_text và cờ has_live_class / has_online_courses
CREATE OR REPLACE FUNCTION public.ktn_students_update_search_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.has_live_class := (NEW.class_code IS NOT NULL AND LENGTH(TRIM(NEW.class_code)) > 0);
  NEW.has_online_courses := (
    NEW.online_courses IS NOT NULL
    AND jsonb_typeof(NEW.online_courses) = 'array'
    AND jsonb_array_length(NEW.online_courses) > 0
  );
  NEW.search_text := public.ktn_normalize_vi(
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.email, '') || ' ' ||
    COALESCE(NEW.phone, '') || ' ' ||
    COALESCE(NEW.parent_name, '') || ' ' ||
    COALESCE(NEW.class_code, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ktn_students_search_fields ON public.ktn_students;
CREATE TRIGGER trg_ktn_students_search_fields
  BEFORE INSERT OR UPDATE ON public.ktn_students
  FOR EACH ROW
  EXECUTE FUNCTION public.ktn_students_update_search_fields();

-- Backfill search_text cho toàn bộ học viên hiện có
UPDATE public.ktn_students
SET
  has_live_class = (class_code IS NOT NULL AND LENGTH(TRIM(class_code)) > 0),
  has_online_courses = (
    online_courses IS NOT NULL
    AND jsonb_typeof(online_courses) = 'array'
    AND jsonb_array_length(online_courses) > 0
  ),
  search_text = public.ktn_normalize_vi(
    COALESCE(code, '') || ' ' ||
    COALESCE(name, '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(phone, '') || ' ' ||
    COALESCE(parent_name, '') || ' ' ||
    COALESCE(class_code, '')
  )
WHERE search_text IS NULL OR search_text = '';

-- 4. Nâng cấp bảng ktn_teachers
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

CREATE OR REPLACE FUNCTION public.ktn_teachers_update_search_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.search_text := public.ktn_normalize_vi(
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    COALESCE(NEW.email, '') || ' ' ||
    COALESCE(NEW.phone, '') || ' ' ||
    COALESCE(NEW.specialty, '')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ktn_teachers_search_fields ON public.ktn_teachers;
CREATE TRIGGER trg_ktn_teachers_search_fields
  BEFORE INSERT OR UPDATE ON public.ktn_teachers
  FOR EACH ROW
  EXECUTE FUNCTION public.ktn_teachers_update_search_fields();

UPDATE public.ktn_teachers
SET search_text = public.ktn_normalize_vi(
  COALESCE(code, '') || ' ' ||
  COALESCE(name, '') || ' ' ||
  COALESCE(email, '') || ' ' ||
  COALESCE(phone, '') || ' ' ||
  COALESCE(specialty, '')
)
WHERE search_text IS NULL OR search_text = '';

-- 5. Nâng cấp bảng ktn_orders (Tách bạch payment_status và provisioning/sync_status)
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

-- 6. Nâng cấp bảng ktn_homeworks & ktn_attendance
ALTER TABLE public.ktn_homeworks
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS izteach_remote_id TEXT,
  ADD COLUMN IF NOT EXISTS unit_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

ALTER TABLE public.ktn_attendance
  ADD COLUMN IF NOT EXISTS student_email TEXT,
  ADD COLUMN IF NOT EXISTS session_num INTEGER,
  ADD COLUMN IF NOT EXISTS updated_by TEXT,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- 7. Bảng lưu dấu vết điều phối & Idempotency bền vững (ktn_provisioning_jobs)
CREATE TABLE IF NOT EXISTS public.ktn_provisioning_jobs (
  operation_id TEXT PRIMARY KEY,
  idempotency_key TEXT UNIQUE,
  job_type TEXT NOT NULL,
  target_email TEXT NOT NULL,
  actor_email TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress',
  retryable BOOLEAN DEFAULT true,
  completed_steps JSONB DEFAULT '[]'::jsonb,
  failed_step TEXT,
  request_payload JSONB DEFAULT '{}'::jsonb,
  response_payload JSONB DEFAULT '{}'::jsonb,
  error_code TEXT,
  error_message TEXT,
  retry_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Bảng nhật ký đối soát 3 bên & sự kiện đồng bộ (ktn_sync_events)
CREATE TABLE IF NOT EXISTS public.ktn_sync_events (
  id TEXT PRIMARY KEY,
  operation_id TEXT,
  event_type TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  source_system TEXT DEFAULT 'worker_bff',
  sync_status TEXT NOT NULL,
  drift_code TEXT,
  details JSONB DEFAULT '{}'::jsonb,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Hệ thống Index tối ưu tìm kiếm học viên < 150ms & phân trang ổn định
CREATE INDEX IF NOT EXISTS idx_ktn_students_email_lower ON public.ktn_students (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ktn_students_code_lower ON public.ktn_students (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_ktn_students_class_code ON public.ktn_students (class_code);
CREATE INDEX IF NOT EXISTS idx_ktn_students_phone ON public.ktn_students (phone);
CREATE INDEX IF NOT EXISTS idx_ktn_students_cognito_uid ON public.ktn_students (cognito_user_id);
CREATE INDEX IF NOT EXISTS idx_ktn_students_sync_status ON public.ktn_students (sync_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_students_account_status ON public.ktn_students (account_status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_students_class_updated ON public.ktn_students (class_code, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_students_name_trgm ON public.ktn_students USING GIN (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ktn_students_search_text_trgm ON public.ktn_students USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ktn_students_online_courses_gin ON public.ktn_students USING GIN (online_courses);

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_email_lower ON public.ktn_teachers (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ktn_teachers_search_trgm ON public.ktn_teachers USING GIN (search_text gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_ktn_teachers_assigned_classes_gin ON public.ktn_teachers USING GIN (assigned_classes);

CREATE INDEX IF NOT EXISTS idx_ktn_orders_status_created ON public.ktn_orders (approval_status, payment_status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_orders_student_email_lower ON public.ktn_orders (LOWER(student_email));
CREATE INDEX IF NOT EXISTS idx_ktn_orders_idempotency ON public.ktn_orders (idempotency_key);

CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_class_status ON public.ktn_homeworks (class_code, status, submitted_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_student_course ON public.ktn_homeworks (LOWER(student_email), course_id, lesson_num);

CREATE INDEX IF NOT EXISTS idx_ktn_attendance_class_date ON public.ktn_attendance (class_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_attendance_student_date ON public.ktn_attendance (student_code, date DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_attendance_email_date ON public.ktn_attendance (LOWER(student_email), date DESC);

CREATE INDEX IF NOT EXISTS idx_ktn_prov_jobs_target ON public.ktn_provisioning_jobs (LOWER(target_email), created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_prov_jobs_status ON public.ktn_provisioning_jobs (status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_ktn_sync_events_type_time ON public.ktn_sync_events (event_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_sync_events_entity ON public.ktn_sync_events (entity_type, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_sync_events_status ON public.ktn_sync_events (sync_status, created_at DESC);

-- 10. RLS & Service Role Policies cho bảng mới
ALTER TABLE public.ktn_provisioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_sync_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for service role" ON public.ktn_provisioning_jobs;
CREATE POLICY "Allow all for service role" ON public.ktn_provisioning_jobs FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow all for service role" ON public.ktn_sync_events;
CREATE POLICY "Allow all for service role" ON public.ktn_sync_events FOR ALL USING (true) WITH CHECK (true);

-- =================================================================================
-- KẾ HOẠCH ROLLBACK AN TOÀN (Chỉ chạy khi cần hoàn tác Migration V3)
-- =================================================================================
-- DROP TRIGGER IF EXISTS trg_ktn_students_search_fields ON public.ktn_students;
-- DROP TRIGGER IF EXISTS trg_ktn_teachers_search_fields ON public.ktn_teachers;
-- DROP FUNCTION IF EXISTS public.ktn_students_update_search_fields();
-- DROP FUNCTION IF EXISTS public.ktn_teachers_update_search_fields();
-- DROP INDEX IF EXISTS idx_ktn_students_search_text_trgm;
-- DROP INDEX IF EXISTS idx_ktn_students_name_trgm;
-- DROP TABLE IF EXISTS public.ktn_sync_events;
-- DROP TABLE IF EXISTS public.ktn_provisioning_jobs;
