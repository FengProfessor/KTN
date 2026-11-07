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

-- 2. Hàm chuẩn hóa tiếng Việt không dấu, chữ thường, gộp khoảng trắng (Immutable & Parallel Safe)
CREATE OR REPLACE FUNCTION public.ktn_normalize_vi(input_text TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE PARALLEL SAFE
AS $$
DECLARE
  res TEXT;
BEGIN
  IF input_text IS NULL THEN
    RETURN '';
  END IF;
  res := TRIM(input_text);
  res := TRANSLATE(
    res,
    'ÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐàáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'
  );
  res := LOWER(res);
  res := REGEXP_REPLACE(res, E'[\\u0300-\\u036f]+', '', 'g');
  res := REGEXP_REPLACE(res, '\s+', ' ', 'g');
  RETURN TRIM(res);
END;
$$;

-- 3. Nâng cấp bảng ktn_students (Bổ sung cột trạng thái tài khoản, đồng bộ & search_text)
ALTER TABLE public.ktn_students
  ADD COLUMN IF NOT EXISTS parent_name TEXT,
  ADD COLUMN IF NOT EXISTS izteach_student_id TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'YCT 1',
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb,
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
    REPLACE(public.ktn_normalize_vi(COALESCE(NEW.name, '')), ' ', '') || ' ' ||
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

-- Backfill search_text cho toàn bộ học viên hiện có (kể cả các bản ghi chưa chuẩn hóa chữ hoa/NFD)
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
    REPLACE(public.ktn_normalize_vi(COALESCE(name, '')), ' ', '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(phone, '') || ' ' ||
    COALESCE(parent_name, '') || ' ' ||
    COALESCE(class_code, '')
  )
WHERE search_text IS NULL
   OR search_text = ''
   OR search_text IS DISTINCT FROM public.ktn_normalize_vi(
        COALESCE(code, '') || ' ' ||
        COALESCE(name, '') || ' ' ||
        REPLACE(public.ktn_normalize_vi(COALESCE(name, '')), ' ', '') || ' ' ||
        COALESCE(email, '') || ' ' ||
        COALESCE(phone, '') || ' ' ||
        COALESCE(parent_name, '') || ' ' ||
        COALESCE(class_code, '')
      );

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
WHERE search_text IS NULL
   OR search_text = ''
   OR search_text IS DISTINCT FROM public.ktn_normalize_vi(
        COALESCE(code, '') || ' ' ||
        COALESCE(name, '') || ' ' ||
        COALESCE(email, '') || ' ' ||
        COALESCE(phone, '') || ' ' ||
        COALESCE(specialty, '')
      );

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

-- 6. Nâng cấp bảng ktn_homeworks & ktn_attendance (Bảo toàn 100% lịch sử điểm danh cũ)
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

-- Backfill dữ liệu lịch sử điểm danh từ các cột V1/V2 sang cột V3 mà không làm mất trạng thái cũ
UPDATE public.ktn_attendance a
SET
  session_num = CASE
    WHEN (a.session_num IS NULL OR a.session_num = 1) AND a.lesson_num IS NOT NULL AND a.lesson_num > 1 THEN a.lesson_num
    ELSE COALESCE(a.session_num, a.lesson_num, 1)
  END,
  note = CASE
    WHEN (a.note IS NULL OR a.note = '') AND a.teacher_note IS NOT NULL AND a.teacher_note <> '' THEN a.teacher_note
    ELSE COALESCE(a.note, '')
  END,
  date = CASE
    WHEN a.date IS NULL OR a.date = '' THEN COALESCE(SUBSTRING(a.recorded_at::text FROM 1 FOR 10), CURRENT_DATE::text)
    ELSE a.date
  END,
  updated_by = COALESCE(a.updated_by, a.recorded_by),
  updated_at = COALESCE(a.updated_at, a.recorded_at, NOW())
WHERE a.session_num IS NULL
   OR (a.session_num = 1 AND a.lesson_num IS NOT NULL AND a.lesson_num > 1)
   OR ((a.note IS NULL OR a.note = '') AND a.teacher_note IS NOT NULL AND a.teacher_note <> '')
   OR a.date IS NULL
   OR a.date = ''
   OR (a.updated_by IS NULL AND a.recorded_by IS NOT NULL);

UPDATE public.ktn_attendance a
SET
  student_email = COALESCE(a.student_email, s.email),
  student_name = CASE WHEN a.student_name IS NULL OR a.student_name = '' THEN COALESCE(s.name, '') ELSE a.student_name END
FROM public.ktn_students s
WHERE a.student_code IS NOT NULL
  AND s.code = a.student_code
  AND (a.student_email IS NULL OR a.student_name IS NULL OR a.student_name = '');

ALTER TABLE public.ktn_attendance DROP CONSTRAINT IF EXISTS ktn_attendance_status_check;
ALTER TABLE public.ktn_attendance ADD CONSTRAINT ktn_attendance_status_check
  CHECK (status IN ('present', 'late', 'excused', 'absent', 'absent_excused', 'absent_unexcused'));

-- 7. Bảng lưu dấu vết điều phối & Idempotency bền vững (ktn_provisioning_jobs)
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

ALTER TABLE public.ktn_provisioning_jobs
  ADD COLUMN IF NOT EXISTS target_role TEXT DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS cognito_user_id TEXT,
  ADD COLUMN IF NOT EXISTS izteach_student_id TEXT,
  ADD COLUMN IF NOT EXISTS result_summary JSONB DEFAULT '{}'::jsonb;

-- 8. Bảng nhật ký đối soát 3 bên & sự kiện đồng bộ (ktn_sync_events)
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

ALTER TABLE public.ktn_sync_events
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN entity_type SET DEFAULT 'student',
  ALTER COLUMN sync_status SET DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS target_system TEXT DEFAULT 'three_way',
  ADD COLUMN IF NOT EXISTS entity_key TEXT,
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'info',
  ADD COLUMN IF NOT EXISTS error_code TEXT,
  ADD COLUMN IF NOT EXISTS created_by TEXT;

-- 9. Hệ thống Index tối ưu tìm kiếm học viên < 150ms & phân trang ổn định (Loại bỏ index trùng lặp)
DROP INDEX IF EXISTS public.idx_ktn_students_class;
DROP INDEX IF EXISTS public.idx_ktn_students_class_code;
DROP INDEX IF EXISTS public.idx_ktn_students_email;
DROP INDEX IF EXISTS public.idx_ktn_students_name_trgm;
DROP INDEX IF EXISTS public.idx_ktn_students_search_text_trgm;

CREATE INDEX IF NOT EXISTS idx_ktn_students_email_lower ON public.ktn_students (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ktn_students_code_lower ON public.ktn_students (LOWER(code));
CREATE INDEX IF NOT EXISTS idx_ktn_students_phone ON public.ktn_students (phone);
CREATE INDEX IF NOT EXISTS idx_ktn_students_cognito_uid ON public.ktn_students (cognito_user_id);
CREATE INDEX IF NOT EXISTS idx_ktn_students_updated_email ON public.ktn_students (updated_at DESC NULLS LAST, email ASC);
CREATE INDEX IF NOT EXISTS idx_ktn_students_sync_status ON public.ktn_students (sync_status, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ktn_students_account_status ON public.ktn_students (account_status, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ktn_students_class_updated ON public.ktn_students (class_code, updated_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_ktn_students_search_text_trgm ON public.ktn_students USING GIN (search_text gin_trgm_ops) WITH (fastupdate = off);
CREATE INDEX IF NOT EXISTS idx_ktn_students_online_courses_gin ON public.ktn_students USING GIN (online_courses);

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_email_lower ON public.ktn_teachers (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_ktn_teachers_search_trgm ON public.ktn_teachers USING GIN (search_text gin_trgm_ops) WITH (fastupdate = off);
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

-- 10. Hàm RPC tìm kiếm, lọc, xếp hạng & phân trang học viên trực tiếp tại PostgreSQL
CREATE OR REPLACE FUNCTION public.ktn_search_students(
  p_query TEXT DEFAULT '',
  p_class_code TEXT DEFAULT '',
  p_course_id TEXT DEFAULT '',
  p_account_status TEXT DEFAULT '',
  p_sync_status TEXT DEFAULT '',
  p_student_case TEXT DEFAULT '',
  p_allowed_classes TEXT[] DEFAULT NULL,
  p_limit INTEGER DEFAULT 50,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  code TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  parent_name TEXT,
  class_code TEXT,
  level TEXT,
  online_courses JSONB,
  aliases JSONB,
  xp INTEGER,
  streak INTEGER,
  cognito_user_id TEXT,
  izteach_student_id TEXT,
  has_live_class BOOLEAN,
  has_online_courses BOOLEAN,
  account_status TEXT,
  sync_status TEXT,
  last_synced_at TIMESTAMPTZ,
  last_sync_error TEXT,
  internal_note TEXT,
  updated_at TIMESTAMPTZ,
  match_score INTEGER,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE PARALLEL SAFE
AS $$
DECLARE
  v_raw_q TEXT := LOWER(TRIM(COALESCE(p_query, '')));
  v_norm_q TEXT := public.ktn_normalize_vi(COALESCE(p_query, ''));
  v_digits_q TEXT := REGEXP_REPLACE(COALESCE(p_query, ''), '\D', '', 'g');
  v_tokens TEXT[];
  v_tok TEXT;
  v_where_clauses TEXT[] := ARRAY['TRUE'];
  v_where_sql TEXT;
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 250));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
  v_total BIGINT := 0;
  v_sql TEXT;
BEGIN
  IF p_allowed_classes IS NOT NULL THEN
    IF CARDINALITY(p_allowed_classes) = 0 THEN
      RETURN;
    END IF;
    v_where_clauses := ARRAY_APPEND(
      v_where_clauses,
      FORMAT(
        'LOWER(COALESCE(s.class_code, '''')) = ANY(SELECT LOWER(unnest(%L::text[])))',
        p_allowed_classes
      )
    );
  END IF;

  IF p_class_code IS NOT NULL AND TRIM(p_class_code) <> '' AND LOWER(TRIM(p_class_code)) <> 'all' THEN
    IF LOWER(TRIM(p_class_code)) IN ('none', 'unassigned', '__unassigned__') THEN
      v_where_clauses := ARRAY_APPEND(
        v_where_clauses,
        '(s.class_code IS NULL OR TRIM(s.class_code) = '''')'
      );
    ELSE
      v_where_clauses := ARRAY_APPEND(
        v_where_clauses,
        FORMAT('LOWER(COALESCE(s.class_code, '''')) = LOWER(%L)', TRIM(p_class_code))
      );
    END IF;
  END IF;

  IF p_course_id IS NOT NULL AND TRIM(p_course_id) <> '' AND LOWER(TRIM(p_course_id)) <> 'all' THEN
    v_where_clauses := ARRAY_APPEND(
      v_where_clauses,
      FORMAT(
        '(COALESCE(s.online_courses, ''[]''::jsonb) @> to_jsonb(ARRAY[%L]::text[]) OR COALESCE(s.online_courses, ''[]''::jsonb) @> jsonb_build_array(jsonb_build_object(''id'', %L)))',
        TRIM(p_course_id),
        TRIM(p_course_id)
      )
    );
  END IF;

  IF p_account_status IS NOT NULL AND TRIM(p_account_status) <> '' AND LOWER(TRIM(p_account_status)) <> 'all' THEN
    v_where_clauses := ARRAY_APPEND(
      v_where_clauses,
      FORMAT('LOWER(COALESCE(s.account_status, ''ready_to_login'')) = LOWER(%L)', TRIM(p_account_status))
    );
  END IF;

  IF p_sync_status IS NOT NULL AND TRIM(p_sync_status) <> '' AND LOWER(TRIM(p_sync_status)) <> 'all' THEN
    v_where_clauses := ARRAY_APPEND(
      v_where_clauses,
      FORMAT('LOWER(COALESCE(s.sync_status, ''synced'')) = LOWER(%L)', TRIM(p_sync_status))
    );
  END IF;

  IF p_student_case IS NOT NULL AND TRIM(p_student_case) <> '' AND LOWER(TRIM(p_student_case)) <> 'all' THEN
    CASE LOWER(TRIM(p_student_case))
      WHEN 'video_only', 'online_only' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, '(COALESCE(s.has_online_courses, false) = true AND COALESCE(s.has_live_class, false) = false)');
      WHEN 'live_only', 'sll_only' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, '(COALESCE(s.has_live_class, false) = true AND COALESCE(s.has_online_courses, false) = false)');
      WHEN 'hybrid', 'both' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, '(COALESCE(s.has_live_class, false) = true AND COALESCE(s.has_online_courses, false) = true)');
      WHEN 'unassigned', 'none' THEN
        v_where_clauses := ARRAY_APPEND(v_where_clauses, '(COALESCE(s.has_live_class, false) = false AND COALESCE(s.has_online_courses, false) = false)');
      ELSE
        NULL;
    END CASE;
  END IF;

  IF v_norm_q <> '' THEN
    v_tokens := REGEXP_SPLIT_TO_ARRAY(v_norm_q, '\s+');
    FOREACH v_tok IN ARRAY v_tokens LOOP
      IF v_tok <> '' THEN
        v_where_clauses := ARRAY_APPEND(
          v_where_clauses,
          FORMAT('s.search_text LIKE %L', '%' || v_tok || '%')
        );
      END IF;
    END LOOP;
  END IF;

  v_where_sql := ARRAY_TO_STRING(v_where_clauses, ' AND ');

  IF v_norm_q = '' THEN
    EXECUTE FORMAT('SELECT COUNT(*)::BIGINT FROM public.ktn_students s WHERE %s', v_where_sql)
      INTO v_total;
    IF v_total = 0 THEN
      RETURN;
    END IF;

    v_sql := FORMAT(
      $q$
      SELECT
        s.code,
        s.name,
        s.email,
        s.phone,
        s.parent_name,
        s.class_code,
        s.level,
        COALESCE(s.online_courses, '[]'::jsonb) AS online_courses,
        COALESCE(s.aliases, '[]'::jsonb) AS aliases,
        COALESCE(s.xp, 0)::INTEGER AS xp,
        COALESCE(s.streak, 0)::INTEGER AS streak,
        s.cognito_user_id,
        s.izteach_student_id,
        COALESCE(s.has_live_class, false) AS has_live_class,
        COALESCE(s.has_online_courses, false) AS has_online_courses,
        COALESCE(s.account_status, 'ready_to_login') AS account_status,
        COALESCE(s.sync_status, 'synced') AS sync_status,
        s.last_synced_at,
        s.last_sync_error,
        s.internal_note,
        s.updated_at,
        0::INTEGER AS match_score,
        %L::BIGINT AS total_count
      FROM public.ktn_students s
      WHERE %s
      ORDER BY s.updated_at DESC NULLS LAST, s.email ASC
      LIMIT %s OFFSET %s
      $q$,
      v_total,
      v_where_sql,
      v_limit,
      v_offset
    );

    RETURN QUERY EXECUTE v_sql;
    RETURN;
  END IF;

  v_sql := FORMAT(
    $q$
    WITH matched AS (
      SELECT
        s.code,
        s.name,
        s.email,
        s.phone,
        s.parent_name,
        s.class_code,
        s.level,
        COALESCE(s.online_courses, '[]'::jsonb) AS online_courses,
        COALESCE(s.aliases, '[]'::jsonb) AS aliases,
        COALESCE(s.xp, 0)::INTEGER AS xp,
        COALESCE(s.streak, 0)::INTEGER AS streak,
        s.cognito_user_id,
        s.izteach_student_id,
        COALESCE(s.has_live_class, false) AS has_live_class,
        COALESCE(s.has_online_courses, false) AS has_online_courses,
        COALESCE(s.account_status, 'ready_to_login') AS account_status,
        COALESCE(s.sync_status, 'synced') AS sync_status,
        s.last_synced_at,
        s.last_sync_error,
        s.internal_note,
        s.updated_at,
        (
          CASE WHEN LOWER(COALESCE(s.email, '')) = $1 THEN 1200
               WHEN LOWER(COALESCE(s.email, '')) LIKE $1 || '%%' THEN 760
               WHEN LOWER(COALESCE(s.email, '')) LIKE '%%' || $1 || '%%' THEN 420
               ELSE 0 END
          + CASE WHEN LOWER(COALESCE(s.code, '')) = $1 THEN 1150
                 WHEN LOWER(COALESCE(s.code, '')) LIKE $1 || '%%' THEN 720
                 ELSE 0 END
          + CASE WHEN LENGTH($3) >= 4 AND REGEXP_REPLACE(COALESCE(s.phone, ''), '\D', '', 'g') = $3 THEN 1100
                 WHEN LENGTH($3) >= 4 AND REGEXP_REPLACE(COALESCE(s.phone, ''), '\D', '', 'g') LIKE '%%' || $3 || '%%' THEN 540
                 ELSE 0 END
          + CASE WHEN LOWER(COALESCE(s.name, '')) = $1 THEN 1000
                 WHEN public.ktn_normalize_vi(COALESCE(s.name, '')) = $2 THEN 950
                 WHEN public.ktn_normalize_vi(COALESCE(s.name, '')) LIKE $2 || '%%' THEN 680
                 WHEN public.ktn_normalize_vi(COALESCE(s.name, '')) LIKE '%%' || $2 || '%%' THEN 520
                 ELSE 0 END
          + CASE WHEN LOWER(COALESCE(s.class_code, '')) = $1 THEN 360 ELSE 0 END
          + CASE WHEN COALESCE(s.account_status, 'ready_to_login') = 'ready_to_login' THEN 180 ELSE 0 END
          + CASE WHEN COALESCE(s.sync_status, 'synced') = 'synced' THEN 20 ELSE 0 END
        )::INTEGER AS match_score,
        COUNT(*) OVER()::BIGINT AS total_count
      FROM public.ktn_students s
      WHERE %s
    )
    SELECT *
    FROM matched
    ORDER BY match_score DESC, updated_at DESC NULLS LAST, email ASC
    LIMIT %s OFFSET %s
    $q$,
    v_where_sql,
    v_limit,
    v_offset
  );

  RETURN QUERY EXECUTE v_sql USING v_raw_q, v_norm_q, v_digits_q;
END;
$$;

-- 11. RLS & Service Role Policies chặt chẽ (Chặn hoàn toàn anon / authenticated đọc bảng quản trị)
ALTER TABLE public.ktn_students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_homeworks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_provisioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_sync_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ktn_provisioning_jobs FROM PUBLIC;
REVOKE ALL ON TABLE public.ktn_sync_events FROM PUBLIC;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
      NULL;
    END;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ktn_provisioning_jobs, public.ktn_sync_events FROM anon';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    EXECUTE 'REVOKE ALL ON TABLE public.ktn_provisioning_jobs, public.ktn_sync_events FROM authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    EXECUTE 'GRANT ALL ON TABLE public.ktn_provisioning_jobs, public.ktn_sync_events TO service_role';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.ktn_search_students(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, INTEGER) TO service_role';
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

-- =================================================================================
-- KẾ HOẠCH ROLLBACK AN TOÀN (Chỉ chạy khi cần hoàn tác Migration V3)
-- =================================================================================
-- DROP FUNCTION IF EXISTS public.ktn_search_students(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT[], INTEGER, INTEGER);
-- DROP TRIGGER IF EXISTS trg_ktn_students_search_fields ON public.ktn_students;
-- DROP TRIGGER IF EXISTS trg_ktn_teachers_search_fields ON public.ktn_teachers;
-- DROP FUNCTION IF EXISTS public.ktn_students_update_search_fields();
-- DROP FUNCTION IF EXISTS public.ktn_teachers_update_search_fields();
-- DROP INDEX IF EXISTS public.idx_ktn_students_search_text_trgm;
-- DROP INDEX IF EXISTS public.idx_ktn_students_updated_email;
-- DROP TABLE IF EXISTS public.ktn_sync_events;
-- DROP TABLE IF EXISTS public.ktn_provisioning_jobs;

