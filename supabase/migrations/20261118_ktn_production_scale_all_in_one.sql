-- ============================================================================
-- KTN PRODUCTION SCALE & SECURITY ALL-IN-ONE MIGRATION (2026-11-18)
-- Idempotent migration unifying V3, Master Upgrade, Consultations, Scale Indexes,
-- Multi-Class Enrollments, Cross-Device Lesson Progress, Atomic RPCs, and Full RLS Lockdown.
-- Safe to run multiple times in Supabase SQL Editor and PGlite tests.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. EXTENSIONS & VIETNAMESE TEXT NORMALIZER
-- ----------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pgcrypto;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgcrypto not required or unavailable: %', SQLERRM;
END $$;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'unaccent unavailable; using ktn_normalize_vi translate fallback.';
END $$;

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

-- ----------------------------------------------------------------------------
-- 2. CORE & V3+ SCHEMA RECONCILIATION (DEFENSIVE ALTERS & NEW TABLES)
-- ----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.ktn_students
  ADD COLUMN IF NOT EXISTS parent_name TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS parent_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS izteach_student_id TEXT,
  ADD COLUMN IF NOT EXISTS level TEXT DEFAULT 'YCT 1',
  ADD COLUMN IF NOT EXISTS xp INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS streak INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS enrolled_classes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS has_live_class BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_online_courses BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ready_to_login',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS last_synced_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT,
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT,
  ADD COLUMN IF NOT EXISTS created_by_teacher_email TEXT,
  ADD COLUMN IF NOT EXISTS search_text TEXT;

ALTER TABLE IF EXISTS public.ktn_teachers
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_courses JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS cognito_user_id TEXT,
  ADD COLUMN IF NOT EXISTS izteach_staff_id TEXT,
  ADD COLUMN IF NOT EXISTS provisioning_status TEXT DEFAULT 'ready_to_login',
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'teacher',
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS internal_note TEXT,
  ADD COLUMN IF NOT EXISTS search_text TEXT DEFAULT '';

ALTER TABLE IF EXISTS public.ktn_orders
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

ALTER TABLE IF EXISTS public.ktn_homeworks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS sync_status TEXT DEFAULT 'synced',
  ADD COLUMN IF NOT EXISTS izteach_remote_id TEXT,
  ADD COLUMN IF NOT EXISTS unit_id TEXT,
  ADD COLUMN IF NOT EXISTS last_sync_error TEXT;

ALTER TABLE IF EXISTS public.ktn_messages
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_id TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF to_regclass('public.ktn_messages') IS NOT NULL THEN
    ALTER TABLE public.ktn_messages ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
    ALTER TABLE public.ktn_messages ALTER COLUMN class_code DROP NOT NULL;
  END IF;
END $$;

ALTER TABLE IF EXISTS public.ktn_courses
  ADD COLUMN IF NOT EXISTS teacher_email TEXT;

-- Fix KIDS-04 catalog, seed HSK2-30 & sync default payment config prices (890,000 VND / 16 lessons)
DO $$
BEGIN
  IF to_regclass('public.ktn_courses') IS NOT NULL THEN
    UPDATE public.ktn_courses
    SET lessons_count = 16, price = 890000, updated_at = NOW()
    WHERE course_id = '678d14b960eae20002ddf8fe' AND (lessons_count <> 16 OR price <> 890000);

    INSERT INTO public.ktn_courses (
      course_id, code, title, short_title, badge, age_group,
      lessons_count, price, old_price, thumb_url, is_bundle, bundle_course_ids, active, sort_order, updated_at
    ) VALUES (
      '6af2d9719a8b000002ad4bc0', 'HSK2-30', 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)', 'HSK2 3.0',
      'TIÊU CHUẨN MỚI 3.0', 'Mọi lứa tuổi', 11, 890000, 1500000, '', FALSE, '[]'::jsonb, TRUE, 2, NOW()
    )
    ON CONFLICT (course_id) DO UPDATE SET
      code = EXCLUDED.code,
      title = EXCLUDED.title,
      short_title = EXCLUDED.short_title,
      badge = EXCLUDED.badge,
      lessons_count = EXCLUDED.lessons_count,
      price = EXCLUDED.price,
      old_price = EXCLUDED.old_price,
      active = TRUE,
      updated_at = NOW();
  END IF;

  IF to_regclass('public.ktn_payment_config') IS NOT NULL THEN
    UPDATE public.ktn_payment_config
    SET
      course_prices = COALESCE(course_prices, '{}'::jsonb) || jsonb_build_object(
        '678d14b960eae20002ddf8fe', jsonb_build_object('price', 890000, 'title', 'Tiếng Trung Trẻ Em 4 (Lộ trình 7–13 tuổi)'),
        '6af2d9719a8b000002ad4bc0', jsonb_build_object('price', 890000, 'title', 'Khóa học Tiêu Chuẩn New HSK 2 (3.0)')
      ),
      updated_at = NOW()
    WHERE id = 'default';
  END IF;
END $$;

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

CREATE TABLE IF NOT EXISTS public.ktn_class_schedules (
  class_code TEXT PRIMARY KEY,
  day_of_week TEXT DEFAULT '',
  days_of_week JSONB DEFAULT '[]'::jsonb,
  schedule_slots JSONB DEFAULT '[]'::jsonb,
  start_time TEXT NOT NULL DEFAULT '19:30',
  end_time TEXT NOT NULL DEFAULT '20:30',
  timezone TEXT NOT NULL DEFAULT 'Asia/Ho_Chi_Minh',
  effective_from TEXT DEFAULT CURRENT_DATE::text,
  effective_until TEXT,
  mode TEXT NOT NULL DEFAULT 'weekly',
  meeting_url TEXT DEFAULT '',
  custom_sessions JSONB DEFAULT '[]'::jsonb,
  exceptions JSONB DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'unconfirmed',
  updated_by TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.ktn_class_schedules
  ADD COLUMN IF NOT EXISTS schedule_slots JSONB DEFAULT '[]'::jsonb;

CREATE TABLE IF NOT EXISTS public.ktn_chat_read_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_read_message_id TEXT,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, room_id)
);

CREATE TABLE IF NOT EXISTS public.ktn_notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  event_id TEXT,
  recipient_email TEXT NOT NULL DEFAULT '',
  user_email TEXT,
  target_email TEXT,
  sender_email TEXT,
  recipient_role TEXT NOT NULL DEFAULT 'student',
  type TEXT NOT NULL DEFAULT 'class_announcement',
  class_code TEXT,
  room_id TEXT,
  message_id TEXT,
  homework_id TEXT,
  course_id TEXT,
  unit_id TEXT,
  question_id TEXT,
  lesson_num INTEGER,
  session_num INTEGER,
  title TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  action_url TEXT NOT NULL DEFAULT '/notifications',
  action_label TEXT,
  priority TEXT NOT NULL DEFAULT 'normal',
  read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- 3. MULTI-CLASS ENROLLMENTS & DURABLE LESSON PROGRESS TABLES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ktn_class_enrollments (
  class_code TEXT NOT NULL REFERENCES public.ktn_classes(id) ON DELETE RESTRICT,
  student_code TEXT NOT NULL REFERENCES public.ktn_students(code) ON DELETE CASCADE,
  student_email TEXT NOT NULL,
  role_in_class TEXT NOT NULL DEFAULT 'student',
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'paused', 'completed', 'transferred', 'dropped')),
  enrolled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  left_at TIMESTAMPTZ,
  updated_by TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (class_code, student_code)
);

CREATE INDEX IF NOT EXISTS idx_ktn_enrollments_student_active
  ON public.ktn_class_enrollments (LOWER(student_email), status);
CREATE INDEX IF NOT EXISTS idx_ktn_enrollments_class_active
  ON public.ktn_class_enrollments (class_code, status);

-- Backfill existing primary enrollments safely
DO $$
BEGIN
  IF to_regclass('public.ktn_students') IS NOT NULL AND to_regclass('public.ktn_classes') IS NOT NULL THEN
    INSERT INTO public.ktn_class_enrollments (class_code, student_code, student_email, is_primary, status, enrolled_at, updated_at)
    SELECT c.id, s.code, LOWER(BTRIM(s.email)), TRUE, 'active', COALESCE(s.created_at, NOW()), NOW()
    FROM public.ktn_students s
    JOIN public.ktn_classes c ON UPPER(BTRIM(c.id)) = UPPER(BTRIM(s.class_code))
    WHERE s.class_code IS NOT NULL
      AND BTRIM(s.class_code) <> ''
      AND COALESCE(s.account_status, 'ready_to_login') NOT IN ('deleted', 'archived')
    ON CONFLICT (class_code, student_code) DO NOTHING;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ktn_lesson_progress (
  user_email TEXT NOT NULL,
  lesson_key TEXT NOT NULL,
  course_id TEXT NOT NULL DEFAULT '',
  unit_id TEXT NOT NULL DEFAULT '',
  lesson_num INTEGER NOT NULL DEFAULT 1,
  watched_seconds INTEGER NOT NULL DEFAULT 0,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  completed BOOLEAN NOT NULL DEFAULT TRUE,
  completed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_email, lesson_key)
);

ALTER TABLE IF EXISTS public.ktn_lesson_progress
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS lesson_key TEXT,
  ADD COLUMN IF NOT EXISTS course_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS unit_id TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS lesson_num INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS watched_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS duration_seconds INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS completed BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

CREATE INDEX IF NOT EXISTS idx_ktn_lesson_progress_course
  ON public.ktn_lesson_progress (course_id, completed);
CREATE INDEX IF NOT EXISTS idx_ktn_lesson_progress_email_course
  ON public.ktn_lesson_progress (LOWER(user_email), course_id, updated_at DESC);

-- ----------------------------------------------------------------------------
-- 4. PROTECT ATTENDANCE & CLASS SESSIONS FROM ON DELETE CASCADE DATA LOSS
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ktn_attendance') IS NOT NULL THEN
    ALTER TABLE public.ktn_attendance DROP CONSTRAINT IF EXISTS ktn_attendance_class_code_fkey;
    ALTER TABLE public.ktn_attendance
      ADD CONSTRAINT ktn_attendance_class_code_fkey
      FOREIGN KEY (class_code) REFERENCES public.ktn_classes(id) ON DELETE RESTRICT;

    ALTER TABLE public.ktn_attendance DROP CONSTRAINT IF EXISTS ktn_attendance_student_code_fkey;
    ALTER TABLE public.ktn_attendance
      ADD CONSTRAINT ktn_attendance_student_code_fkey
      FOREIGN KEY (student_code) REFERENCES public.ktn_students(code) ON DELETE SET NULL;
  END IF;

  IF to_regclass('public.ktn_class_sessions') IS NOT NULL THEN
    ALTER TABLE public.ktn_class_sessions DROP CONSTRAINT IF EXISTS ktn_class_sessions_class_code_fkey;
    ALTER TABLE public.ktn_class_sessions
      ADD CONSTRAINT ktn_class_sessions_class_code_fkey
      FOREIGN KEY (class_code) REFERENCES public.ktn_classes(id) ON DELETE RESTRICT;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 5. DROP REDUNDANT BLOATED INDEXES & ADD HOT-PATH COMPOSITE INDEXES
-- ----------------------------------------------------------------------------
DROP INDEX IF EXISTS public.idx_ktn_messages_room;
DROP INDEX IF EXISTS public.idx_ktn_messages_room_created_at;
DROP INDEX IF EXISTS public.idx_ktn_messages_room_created;
DROP INDEX IF EXISTS public.idx_ktn_messages_room_cursor;
DROP INDEX IF EXISTS public.idx_ktn_teachers_search_text_norm_trgm;
DROP INDEX IF EXISTS public.idx_ktn_homeworks_class_status_submitted;
DROP INDEX IF EXISTS public.idx_ktn_class_sessions_class;
DROP INDEX IF EXISTS public.idx_ktn_class_sessions_class_num;
DROP INDEX IF EXISTS public.idx_ktn_push_subs_endpoint;
DROP INDEX IF EXISTS public.idx_ktn_push_subs_user_email;

DO $$
BEGIN
  IF to_regclass('public.ktn_messages') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_eq_created_id
      ON public.ktn_messages (room_id, created_at DESC, id DESC);
    CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_pattern_created_id
      ON public.ktn_messages (room_id text_pattern_ops, created_at DESC, id DESC);
  END IF;

  IF to_regclass('public.ktn_dlp_alerts') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_dlp_alerts_room_plain_sender_created
      ON public.ktn_dlp_alerts (room_id, sender_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ktn_dlp_alerts_room_created
      ON public.ktn_dlp_alerts (room_id, created_at DESC);
  END IF;

  IF to_regclass('public.ktn_classes') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_classes_teacher_code
      ON public.ktn_classes (teacher_code);
    CREATE INDEX IF NOT EXISTS idx_ktn_classes_teacher_email_lower
      ON public.ktn_classes (LOWER(teacher_email));
    CREATE INDEX IF NOT EXISTS idx_ktn_classes_active_created
      ON public.ktn_classes (active, created_at ASC, id ASC);
  END IF;

  IF to_regclass('public.ktn_homeworks') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_student_updated
      ON public.ktn_homeworks (student_email, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_updated
      ON public.ktn_homeworks (updated_at DESC);
  END IF;

  IF to_regclass('public.ktn_orders') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_orders_student_email_created
      ON public.ktn_orders (student_email, created_at DESC);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_orders_idempotency_uniq
      ON public.ktn_orders (idempotency_key)
      WHERE idempotency_key IS NOT NULL AND BTRIM(idempotency_key) <> '';
  END IF;

  IF to_regclass('public.ktn_students') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_students_upper_class_code
      ON public.ktn_students (UPPER(BTRIM(COALESCE(class_code, ''))));
    CREATE INDEX IF NOT EXISTS idx_ktn_students_lower_email
      ON public.ktn_students (LOWER(BTRIM(email)));
    CREATE INDEX IF NOT EXISTS idx_ktn_students_izteach_id
      ON public.ktn_students (izteach_student_id)
      WHERE izteach_student_id IS NOT NULL;
  END IF;

  IF to_regclass('public.ktn_notifications') IS NOT NULL THEN
    CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_plain_created
      ON public.ktn_notifications (recipient_email, created_at DESC);
    CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_unread
      ON public.ktn_notifications (recipient_email, read, created_at DESC);
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 6. ATOMIC PL/pgSQL RPCs (ELIMINATE MULTI-ISOLATE RACE CONDITIONS)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ktn_upsert_chat_read_state(
  p_email TEXT,
  p_room_id TEXT,
  p_msg_id TEXT DEFAULT NULL,
  p_read_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TABLE (
  user_email TEXT,
  room_id TEXT,
  last_read_message_id TEXT,
  last_read_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_email TEXT := LOWER(BTRIM(COALESCE(p_email, '')));
  v_room TEXT := BTRIM(COALESCE(p_room_id, ''));
  v_ts TIMESTAMPTZ := COALESCE(p_read_at, NOW());
BEGIN
  IF v_email = '' OR v_room = '' THEN
    RETURN;
  END IF;

  INSERT INTO public.ktn_chat_read_states (user_email, room_id, last_read_message_id, last_read_at, updated_at)
  VALUES (v_email, v_room, p_msg_id, v_ts, NOW())
  ON CONFLICT (user_email, room_id) DO UPDATE
  SET
    last_read_message_id = CASE
      WHEN ktn_chat_read_states.last_read_at <= EXCLUDED.last_read_at
      THEN COALESCE(EXCLUDED.last_read_message_id, ktn_chat_read_states.last_read_message_id)
      ELSE ktn_chat_read_states.last_read_message_id
    END,
    last_read_at = GREATEST(ktn_chat_read_states.last_read_at, EXCLUDED.last_read_at),
    updated_at = NOW();

  RETURN QUERY
  SELECT c.user_email, c.room_id, c.last_read_message_id, c.last_read_at
  FROM public.ktn_chat_read_states c
  WHERE c.user_email = v_email AND c.room_id = v_room;
END;
$$;

CREATE OR REPLACE FUNCTION public.ktn_grade_homework_atomic(
  p_hw_id TEXT,
  p_status TEXT,
  p_score NUMERIC,
  p_feedback TEXT,
  p_audio_url TEXT,
  p_graded_by TEXT,
  p_expected_file_url TEXT DEFAULT NULL
)
RETURNS TABLE (
  ok BOOLEAN,
  conflict BOOLEAN,
  row_id TEXT,
  current_file_url TEXT,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_row public.ktn_homeworks%ROWTYPE;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT * INTO v_row
  FROM public.ktn_homeworks
  WHERE id = p_hw_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, FALSE, p_hw_id, NULL::TEXT, NULL::TIMESTAMPTZ;
    RETURN;
  END IF;

  IF p_expected_file_url IS NOT NULL AND BTRIM(p_expected_file_url) <> '' AND COALESCE(v_row.file_url, '') <> p_expected_file_url THEN
    RETURN QUERY SELECT FALSE, TRUE, v_row.id, v_row.file_url, v_row.updated_at;
    RETURN;
  END IF;

  UPDATE public.ktn_homeworks
  SET
    status = p_status,
    score = p_score,
    teacher_feedback = COALESCE(p_feedback, ''),
    teacher_audio_url = COALESCE(p_audio_url, ''),
    graded_by = p_graded_by,
    graded_at = v_now,
    updated_at = v_now
  WHERE id = p_hw_id;

  RETURN QUERY SELECT TRUE, FALSE, v_row.id, v_row.file_url, v_now;
END;
$$;

-- ----------------------------------------------------------------------------
-- 6B. COMPLETE V3+ TABLES, ATTENDANCE UPGRADE, SEARCH TRIGGERS & SEARCH/CHAT RPCs
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.ktn_attendance') IS NOT NULL THEN
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
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.ktn_messages') IS NOT NULL THEN
    UPDATE public.ktn_messages
    SET room_id = COALESCE(NULLIF(TRIM(room_id), ''), NULLIF(TRIM(class_code), ''), 'GENERAL')
    WHERE room_id IS NULL OR TRIM(room_id) = '';

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_messages_idempotent_client_msg
      ON public.ktn_messages (room_id, LOWER(sender_email), client_message_id)
      WHERE client_message_id IS NOT NULL AND TRIM(client_message_id) <> '';
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS public.ktn_forum_questions (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL,
  unit_id TEXT NOT NULL,
  lesson_num INTEGER NOT NULL DEFAULT 1,
  lesson_title_snapshot TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL,
  student_email TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  video_timestamp_seconds INTEGER,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'claimed', 'answered', 'resolved', 'hidden')),
  claimed_by_teacher_id TEXT,
  claimed_by_teacher_email TEXT,
  claimed_by_teacher_name TEXT,
  claimed_at TIMESTAMPTZ,
  assigned_teacher_id TEXT,
  skipped_by_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  answer_count INTEGER NOT NULL DEFAULT 0,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  first_answered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_forum_questions_course_unit
  ON public.ktn_forum_questions (course_id, unit_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_forum_questions_status
  ON public.ktn_forum_questions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_forum_questions_student_email
  ON public.ktn_forum_questions (LOWER(student_email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.ktn_forum_answers (
  id TEXT PRIMARY KEY,
  question_id TEXT NOT NULL REFERENCES public.ktn_forum_questions(id) ON DELETE CASCADE,
  author_id TEXT NOT NULL,
  author_email TEXT NOT NULL DEFAULT '',
  author_name TEXT NOT NULL DEFAULT '',
  author_role TEXT NOT NULL DEFAULT 'teacher'
    CHECK (author_role IN ('teacher', 'admin', 'student')),
  teacher_id TEXT,
  content TEXT NOT NULL DEFAULT '',
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  video_url TEXT,
  video_key TEXT,
  video_duration_seconds INTEGER,
  video_size_bytes BIGINT,
  video_verified BOOLEAN NOT NULL DEFAULT FALSE,
  is_accepted BOOLEAN NOT NULL DEFAULT FALSE,
  helpful_count INTEGER NOT NULL DEFAULT 0,
  helpful_voter_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'visible'
    CHECK (status IN ('visible', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_forum_answers_question
  ON public.ktn_forum_answers (question_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.ktn_forum_follows (
  id TEXT,
  question_id TEXT NOT NULL REFERENCES public.ktn_forum_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT 'student',
  notify_mode TEXT NOT NULL DEFAULT 'immediate'
    CHECK (notify_mode IN ('immediate', 'digest', 'off')),
  following BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_ktn_forum_follows_question_email
  ON public.ktn_forum_follows (question_id, LOWER(user_email));

CREATE TABLE IF NOT EXISTS public.ktn_teacher_contribution_events (
  event_id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_email TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  question_id TEXT,
  answer_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'substantive_answer', 'answer_created', 'marked_helpful', 'helpful_vote',
      'accepted_answer', 'verified_guidance_video', 'video_attached',
      'long_pending_resolved', 'admin_adjustment', 'admin_adjust', 'admin_revoke'
    )),
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  voter_email TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_teacher_contrib_teacher_created
  ON public.ktn_teacher_contribution_events (teacher_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_teacher_contrib_email_created
  ON public.ktn_teacher_contribution_events (LOWER(teacher_email), created_at DESC);

CREATE TABLE IF NOT EXISTS public.ktn_course_grant_requests (
  id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_email TEXT NOT NULL,
  teacher_name TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL,
  student_email TEXT NOT NULL,
  student_name TEXT NOT NULL DEFAULT '',
  class_code TEXT NOT NULL DEFAULT '',
  course_id TEXT NOT NULL,
  course_title TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT NOT NULL DEFAULT '',
  entitlement_result JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_course_grant_requests_status
  ON public.ktn_course_grant_requests (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ktn_course_grant_requests_student
  ON public.ktn_course_grant_requests (LOWER(student_email), status);

CREATE TABLE IF NOT EXISTS public.ktn_admin_audit_logs (
  id TEXT PRIMARY KEY,
  actor_email TEXT NOT NULL DEFAULT '',
  actor_role TEXT NOT NULL DEFAULT 'admin',
  action_type TEXT NOT NULL,
  target_type TEXT NOT NULL DEFAULT '',
  target_id TEXT NOT NULL DEFAULT '',
  reason TEXT NOT NULL DEFAULT '',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_admin_audit_logs_created
  ON public.ktn_admin_audit_logs (created_at DESC);

-- Notifications sync trigger & idempotency index
CREATE OR REPLACE FUNCTION public.ktn_notifications_sync_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_email TEXT;
BEGIN
  IF NEW.id IS NULL OR TRIM(NEW.id) = '' THEN
    NEW.id := COALESCE(NULLIF(TRIM(NEW.event_id), ''), gen_random_uuid()::text);
  END IF;
  IF NEW.event_id IS NULL OR TRIM(NEW.event_id) = '' THEN
    NEW.event_id := NEW.id;
  END IF;
  v_email := LOWER(COALESCE(
    NULLIF(TRIM(NEW.recipient_email), ''),
    NULLIF(TRIM(NEW.user_email), ''),
    NULLIF(TRIM(NEW.target_email), ''),
    ''
  ));
  NEW.recipient_email := v_email;
  IF v_email <> '' THEN
    NEW.user_email := COALESCE(NULLIF(LOWER(TRIM(NEW.user_email)), ''), v_email);
    NEW.target_email := COALESCE(NULLIF(LOWER(TRIM(NEW.target_email)), ''), v_email);
  END IF;
  IF NEW.updated_at IS NULL THEN
    NEW.updated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ktn_notifications_sync_fields ON public.ktn_notifications;
CREATE TRIGGER trg_ktn_notifications_sync_fields
  BEFORE INSERT OR UPDATE ON public.ktn_notifications
  FOR EACH ROW
  EXECUTE FUNCTION public.ktn_notifications_sync_fields();

CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_notifications_idempotent_event
  ON public.ktn_notifications (event_id, LOWER(COALESCE(recipient_email, '')))
  WHERE event_id IS NOT NULL AND TRIM(event_id) <> '';

-- Student & Teacher Vietnamese accent-insensitive search triggers + indexes + RPCs
ALTER TABLE IF EXISTS public.ktn_teachers
  ADD COLUMN IF NOT EXISTS search_text_norm TEXT DEFAULT '';

CREATE OR REPLACE FUNCTION public.ktn_students_update_search_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
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
    COALESCE(NEW.parent_phone, '') || ' ' ||
    COALESCE(NEW.parent_name, '') || ' ' ||
    COALESCE(NEW.class_code, '')
  );
  RETURN NEW;
END;
$fn$;

DO $$
BEGIN
  IF to_regclass('public.ktn_students') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_ktn_students_search_fields ON public.ktn_students;
    CREATE TRIGGER trg_ktn_students_search_fields
      BEFORE INSERT OR UPDATE ON public.ktn_students
      FOR EACH ROW
      EXECUTE FUNCTION public.ktn_students_update_search_fields();

    UPDATE public.ktn_students
    SET search_text = ''
    WHERE search_text IS NULL OR search_text = '';

    CREATE INDEX IF NOT EXISTS idx_ktn_students_search_text_trgm
      ON public.ktn_students USING GIN (search_text gin_trgm_ops) WITH (fastupdate = off);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.ktn_teachers_update_search_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_norm TEXT;
BEGIN
  v_norm := public.ktn_normalize_vi(
    COALESCE(NEW.code, '') || ' ' ||
    COALESCE(NEW.name, '') || ' ' ||
    REPLACE(public.ktn_normalize_vi(COALESCE(NEW.name, '')), ' ', '') || ' ' ||
    COALESCE(NEW.email, '') || ' ' ||
    COALESCE(NEW.phone, '') || ' ' ||
    COALESCE(NEW.specialty, '') || ' ' ||
    COALESCE(NEW.assigned_classes::text, '') || ' ' ||
    COALESCE(NEW.assigned_courses::text, '')
  );
  NEW.search_text := v_norm;
  NEW.search_text_norm := v_norm;
  RETURN NEW;
END;
$fn$;

DO $$
BEGIN
  IF to_regclass('public.ktn_teachers') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_ktn_teachers_search_fields ON public.ktn_teachers;
    CREATE TRIGGER trg_ktn_teachers_search_fields
      BEFORE INSERT OR UPDATE ON public.ktn_teachers
      FOR EACH ROW
      EXECUTE FUNCTION public.ktn_teachers_update_search_fields();

    UPDATE public.ktn_teachers
    SET search_text = ''
    WHERE search_text IS NULL OR search_text = '' OR search_text_norm IS NULL OR search_text_norm = '';

    CREATE INDEX IF NOT EXISTS idx_ktn_teachers_search_trgm
      ON public.ktn_teachers USING GIN (search_text gin_trgm_ops) WITH (fastupdate = off);
  END IF;
END $$;

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
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));
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
        '(LOWER(COALESCE(s.class_code, '''')) = ANY(SELECT LOWER(unnest(%L::text[]))) OR EXISTS (SELECT 1 FROM unnest(%L::text[]) AS ac WHERE COALESCE(s.enrolled_classes, ''[]''::jsonb) @> to_jsonb(UPPER(TRIM(ac))) OR COALESCE(s.aliases, ''[]''::jsonb) @> to_jsonb(''__class:'' || UPPER(TRIM(ac)))))',
        p_allowed_classes,
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
        FORMAT(
          '(LOWER(COALESCE(s.class_code, '''')) = LOWER(%L) OR COALESCE(s.enrolled_classes, ''[]''::jsonb) @> to_jsonb(UPPER(TRIM(%L))) OR COALESCE(s.aliases, ''[]''::jsonb) @> to_jsonb(''__class:'' || UPPER(TRIM(%L))))',
          TRIM(p_class_code),
          TRIM(p_class_code),
          TRIM(p_class_code)
        )
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
        s.code, s.name, s.email, s.phone, s.parent_name, s.class_code, s.level,
        COALESCE(s.online_courses, '[]'::jsonb) AS online_courses,
        COALESCE(s.aliases, '[]'::jsonb) AS aliases,
        COALESCE(s.xp, 0)::INTEGER AS xp,
        COALESCE(s.streak, 0)::INTEGER AS streak,
        s.cognito_user_id, s.izteach_student_id,
        COALESCE(s.has_live_class, false) AS has_live_class,
        COALESCE(s.has_online_courses, false) AS has_online_courses,
        COALESCE(s.account_status, 'ready_to_login') AS account_status,
        COALESCE(s.sync_status, 'synced') AS sync_status,
        s.last_synced_at, s.last_sync_error, s.internal_note, s.updated_at,
        0::INTEGER AS match_score,
        %L::BIGINT AS total_count
      FROM public.ktn_students s
      WHERE %s
      ORDER BY s.updated_at DESC NULLS LAST, s.email ASC
      LIMIT %s OFFSET %s
      $q$,
      v_total, v_where_sql, v_limit, v_offset
    );

    RETURN QUERY EXECUTE v_sql;
    RETURN;
  END IF;

  v_sql := FORMAT(
    $q$
    WITH matched AS (
      SELECT
        s.code, s.name, s.email, s.phone, s.parent_name, s.class_code, s.level,
        COALESCE(s.online_courses, '[]'::jsonb) AS online_courses,
        COALESCE(s.aliases, '[]'::jsonb) AS aliases,
        COALESCE(s.xp, 0)::INTEGER AS xp,
        COALESCE(s.streak, 0)::INTEGER AS streak,
        s.cognito_user_id, s.izteach_student_id,
        COALESCE(s.has_live_class, false) AS has_live_class,
        COALESCE(s.has_online_courses, false) AS has_online_courses,
        COALESCE(s.account_status, 'ready_to_login') AS account_status,
        COALESCE(s.sync_status, 'synced') AS sync_status,
        s.last_synced_at, s.last_sync_error, s.internal_note, s.updated_at,
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
    v_where_sql, v_limit, v_offset
  );

  RETURN QUERY EXECUTE v_sql USING v_raw_q, v_norm_q, v_digits_q;
END;
$$;

CREATE OR REPLACE FUNCTION public.ktn_search_teachers(
  p_query TEXT DEFAULT '',
  p_status TEXT DEFAULT NULL,
  p_class_code TEXT DEFAULT NULL,
  p_course_id TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 25,
  p_offset INTEGER DEFAULT 0
)
RETURNS TABLE (
  code TEXT,
  name TEXT,
  email TEXT,
  phone TEXT,
  specialty TEXT,
  assigned_classes JSONB,
  assigned_courses JSONB,
  aliases JSONB,
  active BOOLEAN,
  is_active BOOLEAN,
  updated_at TIMESTAMPTZ,
  rank_score NUMERIC,
  total_count BIGINT
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_q TEXT := public.ktn_normalize_vi(p_query);
  v_q_nospace TEXT := REPLACE(public.ktn_normalize_vi(p_query), ' ', '');
  v_status TEXT := LOWER(TRIM(COALESCE(p_status, '')));
  v_class TEXT := UPPER(TRIM(COALESCE(p_class_code, '')));
  v_course TEXT := TRIM(COALESCE(p_course_id, ''));
  v_limit INTEGER := GREATEST(1, LEAST(COALESCE(p_limit, 25), 500));
  v_offset INTEGER := GREATEST(0, COALESCE(p_offset, 0));
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      t.code, t.name, t.email, t.phone, t.specialty,
      COALESCE(t.assigned_classes, '[]'::jsonb) AS assigned_classes,
      COALESCE(t.assigned_courses, '[]'::jsonb) AS assigned_courses,
      COALESCE(t.aliases, '[]'::jsonb) AS aliases,
      COALESCE(t.active, true) AS active,
      COALESCE(t.active, true) AS is_active,
      t.updated_at,
      CASE
        WHEN v_q = '' THEN 100::numeric
        WHEN lower(coalesce(t.code, '')) = v_q THEN 1000::numeric
        WHEN lower(coalesce(t.email, '')) = v_q THEN 990::numeric
        WHEN regexp_replace(coalesce(t.phone, ''), '\D', '', 'g') = v_q_nospace AND length(v_q_nospace) >= 6 THEN 980::numeric
        WHEN public.ktn_normalize_vi(t.name) = v_q THEN 960::numeric
        WHEN replace(public.ktn_normalize_vi(t.name), ' ', '') = v_q_nospace THEN 940::numeric
        WHEN lower(coalesce(t.code, '')) LIKE v_q || '%' THEN 900::numeric
        WHEN lower(coalesce(t.email, '')) LIKE v_q || '%' THEN 880::numeric
        WHEN public.ktn_normalize_vi(t.name) LIKE v_q || '%' THEN 860::numeric
        WHEN replace(public.ktn_normalize_vi(t.name), ' ', '') LIKE v_q_nospace || '%' THEN 840::numeric
        WHEN public.ktn_normalize_vi(t.name) LIKE '% ' || v_q || '%' THEN 810::numeric
        WHEN public.ktn_normalize_vi(t.name) LIKE '%' || v_q || '%' THEN 760::numeric
        WHEN replace(public.ktn_normalize_vi(t.name), ' ', '') LIKE '%' || v_q_nospace || '%' THEN 730::numeric
        WHEN public.ktn_normalize_vi(t.specialty) LIKE '%' || v_q || '%' THEN 700::numeric
        WHEN COALESCE(t.search_text_norm, t.search_text, '') LIKE '%' || v_q || '%' THEN 650::numeric
        ELSE round((similarity(COALESCE(t.search_text_norm, t.search_text, ''), v_q) * 500)::numeric, 2)
      END AS score
    FROM public.ktn_teachers t
    WHERE
      NOT (COALESCE(t.aliases, '[]'::jsonb) @> '["__status:deleted"]'::jsonb)
      AND (
        v_status = '' OR v_status = 'all'
        OR (v_status = 'active' AND COALESCE(t.active, true) = true)
        OR (v_status IN ('inactive', 'locked', 'suspended', 'disabled') AND COALESCE(t.active, true) = false)
        OR (
          v_status IN ('unassigned', 'no_class')
          AND (
            COALESCE(t.active, true) = false
            OR t.assigned_classes IS NULL
            OR jsonb_typeof(t.assigned_classes) <> 'array'
            OR jsonb_array_length(t.assigned_classes) = 0
          )
        )
        OR (
          v_status IN ('assigned', 'has_class')
          AND COALESCE(t.active, true) = true
          AND t.assigned_classes IS NOT NULL
          AND jsonb_typeof(t.assigned_classes) = 'array'
          AND jsonb_array_length(t.assigned_classes) > 0
        )
      )
      AND (
        v_class = '' OR v_class = 'ALL'
        OR (
          COALESCE(t.active, true) = true
          AND t.assigned_classes IS NOT NULL
          AND jsonb_typeof(t.assigned_classes) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(t.assigned_classes) AS cls_elem
            WHERE upper(trim(cls_elem)) = v_class
          )
        )
      )
      AND (
        v_course = '' OR v_course = 'all'
        OR (
          t.assigned_courses IS NOT NULL
          AND jsonb_typeof(t.assigned_courses) = 'array'
          AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(t.assigned_courses) AS crs_elem
            WHERE trim(crs_elem) = v_course
          )
        )
      )
      AND (
        v_q = ''
        OR COALESCE(t.search_text_norm, t.search_text, '') LIKE '%' || v_q || '%'
        OR replace(COALESCE(t.search_text_norm, t.search_text, ''), ' ', '') LIKE '%' || v_q_nospace || '%'
        OR (length(v_q) >= 3 AND COALESCE(t.search_text_norm, t.search_text, '') % v_q)
      )
  )
  SELECT
    f.code, f.name, f.email, f.phone, f.specialty,
    f.assigned_classes, f.assigned_courses, f.aliases,
    f.active, f.is_active, f.updated_at,
    f.score AS rank_score,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.score DESC, f.active DESC, f.code ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

CREATE OR REPLACE FUNCTION public.ktn_get_rooms_latest_messages(
  p_room_ids TEXT[] DEFAULT NULL,
  p_room_prefix TEXT DEFAULT NULL
)
RETURNS TABLE (
  id TEXT,
  room_id TEXT,
  class_code TEXT,
  sender_email TEXT,
  sender_name TEXT,
  sender_role TEXT,
  content TEXT,
  attachment_url TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT ON (COALESCE(NULLIF(TRIM(m.room_id), ''), NULLIF(TRIM(m.class_code), '')))
    m.id::text,
    COALESCE(NULLIF(TRIM(m.room_id), ''), NULLIF(TRIM(m.class_code), '')) AS room_id,
    m.class_code,
    m.sender_email,
    m.sender_name,
    m.sender_role,
    m.content,
    m.attachment_url,
    m.created_at
  FROM public.ktn_messages m
  WHERE
    (
      p_room_ids IS NULL
      OR COALESCE(NULLIF(TRIM(m.room_id), ''), NULLIF(TRIM(m.class_code), '')) = ANY(p_room_ids)
    )
    AND (
      p_room_prefix IS NULL OR p_room_prefix = ''
      OR LOWER(COALESCE(NULLIF(TRIM(m.room_id), ''), NULLIF(TRIM(m.class_code), ''), '')) LIKE LOWER(p_room_prefix) || '%'
    )
  ORDER BY
    COALESCE(NULLIF(TRIM(m.room_id), ''), NULLIF(TRIM(m.class_code), '')),
    m.created_at DESC NULLS LAST,
    m.id DESC;
$$;

-- ----------------------------------------------------------------------------
-- 7. FULL RLS LOCKDOWN & REALTIME WAL DETACHMENT
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  t TEXT;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH t IN ARRAY ARRAY['ktn_orders', 'ktn_homeworks', 'ktn_messages', 'ktn_dlp_alerts'] LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE public.%I', t);
      EXCEPTION WHEN undefined_table OR undefined_object THEN
        NULL;
      END;
    END LOOP;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN
      NULL;
    END;
  END IF;

  FOREACH t IN ARRAY ARRAY[
    'ktn_payment_config', 'ktn_orders', 'ktn_teachers', 'ktn_classes',
    'ktn_courses', 'ktn_students', 'ktn_attendance', 'ktn_homeworks',
    'ktn_class_sessions', 'ktn_messages', 'ktn_dlp_alerts',
    'ktn_push_subscriptions', 'ktn_chat_read_states',
    'ktn_provisioning_jobs', 'ktn_sync_events', 'ktn_class_schedules',
    'ktn_forum_questions', 'ktn_forum_answers', 'ktn_forum_follows',
    'ktn_teacher_contribution_events', 'ktn_course_grant_requests',
    'ktn_admin_audit_logs', 'ktn_notifications',
    'ktn_class_enrollments', 'ktn_lesson_progress'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
        EXECUTE format('GRANT ALL ON TABLE public.%I TO service_role', t);
        EXECUTE format('DROP POLICY IF EXISTS service_role_only_%I ON public.%I', t, t);
        EXECUTE format(
          'CREATE POLICY service_role_only_%I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
          t, t
        );
      END IF;
    END IF;
  END LOOP;
END $$;

-- Revoke public/anon execution on privileged RPCs
DO $$
BEGIN
  IF to_regprocedure('public.ktn_search_students(text,text,text,text,text,text,text[],integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_search_students(text,text,text,text,text,text,text[],integer,integer) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_search_students(text,text,text,text,text,text,text[],integer,integer) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_search_students(text,text,text,text,text,text,text[],integer,integer) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_search_students(text,text,text,text,text,text,text[],integer,integer) TO service_role;
    END IF;
  END IF;

  IF to_regprocedure('public.ktn_search_teachers(text,text,text,text,integer,integer)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_search_teachers(text,text,text,text,integer,integer) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_search_teachers(text,text,text,text,integer,integer) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_search_teachers(text,text,text,text,integer,integer) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_search_teachers(text,text,text,text,integer,integer) TO service_role;
    END IF;
  END IF;

  IF to_regprocedure('public.ktn_get_rooms_latest_messages(text[],text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_get_rooms_latest_messages(text[],text) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_get_rooms_latest_messages(text[],text) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_get_rooms_latest_messages(text[],text) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_get_rooms_latest_messages(text[],text) TO service_role;
    END IF;
  END IF;

  IF to_regprocedure('public.ktn_upsert_chat_read_state(text,text,text,timestamptz)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_upsert_chat_read_state(text,text,text,timestamptz) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_upsert_chat_read_state(text,text,text,timestamptz) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_upsert_chat_read_state(text,text,text,timestamptz) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_upsert_chat_read_state(text,text,text,timestamptz) TO service_role;
    END IF;
  END IF;

  IF to_regprocedure('public.ktn_grade_homework_atomic(text,text,numeric,text,text,text,text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_grade_homework_atomic(text,text,numeric,text,text,text,text) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_grade_homework_atomic(text,text,numeric,text,text,text,text) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_grade_homework_atomic(text,text,numeric,text,text,text,text) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_grade_homework_atomic(text,text,numeric,text,text,text,text) TO service_role;
    END IF;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 8. LOG INGESTION OPTIMIZATION: AUTHENTICATOR LOGS & 1-TRIP NOTIFICATION RPC
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  EXECUTE 'ALTER ROLE authenticator SET log_statement = ''none''';
  EXECUTE 'ALTER ROLE authenticator SET log_min_duration_statement = ''2s''';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping authenticator log settings: %', SQLERRM;
END $$;

CREATE OR REPLACE FUNCTION public.ktn_canonical_course_id(p_raw TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT CASE LOWER(BTRIM(COALESCE(p_raw, '')))
    WHEN 'hsk1' THEN '6adadba969897b0002482ca5'
    WHEN 'hsk1-30' THEN '6adadba969897b0002482ca5'
    WHEN 'hsk2' THEN '6af2d9719a8b000002ad4bc0'
    WHEN 'hsk2-30' THEN '6af2d9719a8b000002ad4bc0'
    WHEN 'hsk2-3.0' THEN '6af2d9719a8b000002ad4bc0'
    WHEN 'cfk1' THEN '65e7704a9ea90c00080d5195'
    WHEN 'cfk-01' THEN '65e7704a9ea90c00080d5195'
    WHEN 'cfk' THEN '65e7704a9ea90c00080d5195'
    WHEN '65e7688d524c58000836593b' THEN '65e7704a9ea90c00080d5195'
    WHEN 'cfk-03' THEN '661528ea42af880008944573'
    WHEN 'mini-01' THEN '65e7636a0a1b61000825c2ef'
    WHEN 'mini-02' THEN '6600fa477c18b80008c53c88'
    WHEN 'mini-03' THEN '6600fa7da2bfe10008834e13'
    WHEN 'yct1' THEN '65e769bd637339000870618f'
    WHEN 'kids-01' THEN '65e769bd637339000870618f'
    WHEN 'kids-02' THEN '66028938bfd6c90008b816e1'
    WHEN 'kids-03' THEN '6638bd09a7367400085c7ab2'
    WHEN 'kids-04' THEN '678d14b960eae20002ddf8fe'
    WHEN 'kids-05' THEN '67a7290a5fdc26000238b4e9'
    WHEN 'kids-06' THEN '67a869302ecb9c000257d966'
    WHEN 'junior-01' THEN '65e772a1767c56000829518e'
    WHEN 'junior-03' THEN '6638c76dfac274000876cd13'
    WHEN 'yct-04' THEN '6983672f409cc20002e530b8'
    WHEN 'pron-01' THEN '65e76a533f5e7c00086715d7'
    WHEN 'hanzi-01' THEN '67bebce067dba000027d8119'
    ELSE LOWER(BTRIM(COALESCE(p_raw, '')))
  END;
$$;

CREATE OR REPLACE FUNCTION public.ktn_get_notification_bundle(
  p_email TEXT,
  p_role TEXT DEFAULT 'student',
  p_session_classes TEXT[] DEFAULT '{}',
  p_session_courses TEXT[] DEFAULT '{}'
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email TEXT := LOWER(BTRIM(COALESCE(p_email, '')));
  v_role TEXT := LOWER(BTRIM(COALESCE(p_role, 'student')));
  v_user_alerts JSONB := '[]'::jsonb;
  v_schedule_events JSONB := '[]'::jsonb;
  v_forum_questions_tbl JSONB := '[]'::jsonb;
  v_forum_questions_alerts JSONB := '[]'::jsonb;

  v_stu public.ktn_students%ROWTYPE;
  v_classes TEXT[] := '{}';
  v_courses TEXT[] := '{}';
  v_rooms TEXT[] := '{}';
  v_stu_classes JSONB := '[]'::jsonb;
  v_stu_homeworks JSONB := '[]'::jsonb;
  v_stu_sessions JSONB := '[]'::jsonb;
  v_stu_messages JSONB := '[]'::jsonb;
  v_stu_teachers JSONB := '[]'::jsonb;
  v_stu_courses JSONB := '[]'::jsonb;
  v_forum_follows_tbl JSONB := '[]'::jsonb;
  v_forum_follows_alerts JSONB := '[]'::jsonb;
  v_forum_answers_tbl JSONB := '[]'::jsonb;
  v_forum_answers_alerts JSONB := '[]'::jsonb;

  v_tea public.ktn_teachers%ROWTYPE;
  v_tea_active BOOLEAN := FALSE;
  v_assigned_classes TEXT[] := '{}';
  v_assigned_courses TEXT[] := '{}';
  v_tea_rooms TEXT[] := '{}';
  v_tea_classes JSONB := '[]'::jsonb;
  v_tea_courses JSONB := '[]'::jsonb;
  v_tea_homeworks JSONB := '[]'::jsonb;
  v_tea_group_msgs JSONB := '[]'::jsonb;
  v_tea_class_students JSONB := '[]'::jsonb;
  v_tea_class_stu_rooms TEXT[] := '{}';
  v_tea_class_priv_msgs JSONB := '[]'::jsonb;
  v_tea_course_priv_msgs JSONB := '[]'::jsonb;
  v_priv_student_emails TEXT[] := '{}';
  v_tea_extra_priv_students JSONB := '[]'::jsonb;
  v_grant_reqs_tbl JSONB := '[]'::jsonb;
  v_grant_reqs_alerts JSONB := '[]'::jsonb;

  v_adm_classes JSONB := '[]'::jsonb;
  v_adm_orders JSONB := '[]'::jsonb;
  v_adm_homeworks JSONB := '[]'::jsonb;
  v_adm_messages JSONB := '[]'::jsonb;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('version', 1, 'error', 'MISSING_EMAIL');
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_user_alerts
  FROM (
    SELECT *
    FROM public.ktn_dlp_alerts
    WHERE room_id IN ('NOTIF_PREFS', 'KTN_LIFECYCLE_NOTIFICATION', 'CLASS_REMINDER_LOG', 'NOTIF_READ_STATE')
      AND LOWER(BTRIM(COALESCE(sender_email, ''))) = v_email
    ORDER BY created_at DESC NULLS LAST
    LIMIT 200
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_schedule_events
  FROM (
    SELECT *
    FROM public.ktn_dlp_alerts
    WHERE room_id = 'CLASS_SCHEDULE_EVENT'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 20
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_forum_questions_alerts
  FROM (
    SELECT *
    FROM public.ktn_dlp_alerts
    WHERE room_id = 'FORUM_QUESTION'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 500
  ) t;

  IF to_regclass('public.ktn_forum_questions') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_forum_questions_tbl
    FROM (
      SELECT *
      FROM public.ktn_forum_questions
      ORDER BY created_at DESC NULLS LAST
      LIMIT 500
    ) t;
  END IF;

  IF v_role = 'student' THEN
    SELECT *
    INTO v_stu
    FROM public.ktn_students
    WHERE LOWER(BTRIM(email)) = v_email
    LIMIT 1;

    IF v_stu.email IS NOT NULL THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT cls_item), '{}')
      INTO v_classes
      FROM (
        SELECT UPPER(BTRIM(v_stu.class_code)) AS cls_item
        WHERE v_stu.class_code IS NOT NULL AND BTRIM(v_stu.class_code) <> ''
        UNION ALL
        SELECT UPPER(BTRIM(elem))
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(to_jsonb(v_stu)->'enrolled_classes') = 'array'
               THEN to_jsonb(v_stu)->'enrolled_classes' ELSE '[]'::jsonb END
        ) AS elem
        WHERE BTRIM(elem) <> ''
        UNION ALL
        SELECT UPPER(BTRIM(SUBSTRING(elem FROM 9)))
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(to_jsonb(v_stu)->'aliases') = 'array'
               THEN to_jsonb(v_stu)->'aliases' ELSE '[]'::jsonb END
        ) AS elem
        WHERE LOWER(elem) LIKE '__class:%' AND BTRIM(SUBSTRING(elem FROM 9)) <> ''
      ) c_src
      WHERE cls_item IS NOT NULL AND cls_item <> '';

      SELECT COALESCE(ARRAY_AGG(DISTINCT cid_norm), '{}')
      INTO v_courses
      FROM (
        SELECT public.ktn_canonical_course_id(
          CASE
            WHEN jsonb_typeof(elem) = 'string' THEN elem #>> '{}'
            WHEN jsonb_typeof(elem) = 'object' THEN COALESCE(elem->>'id', elem->>'_id', '')
            ELSE ''
          END
        ) AS cid_norm
        FROM jsonb_array_elements(
          CASE WHEN jsonb_typeof(to_jsonb(v_stu)->'online_courses') = 'array'
               THEN to_jsonb(v_stu)->'online_courses' ELSE '[]'::jsonb END
        ) AS elem
      ) oc_src
      WHERE cid_norm <> '';
    END IF;

    SELECT COALESCE(ARRAY_AGG(DISTINCT r), '{}')
    INTO v_rooms
    FROM (
      SELECT 'student:' || v_email AS r
      UNION ALL
      SELECT c FROM unnest(v_classes) AS c
      UNION ALL
      SELECT 'class:' || c FROM unnest(v_classes) AS c
      UNION ALL
      SELECT 'course:' || cid FROM unnest(v_courses) AS cid
    ) rm;

    IF CARDINALITY(v_classes) > 0 THEN
      SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      INTO v_stu_classes
      FROM (
        SELECT id, active, teacher_email, teacher_code
        FROM public.ktn_classes
        WHERE UPPER(BTRIM(id)) = ANY(v_classes)
      ) t;

      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST), '[]'::jsonb)
      INTO v_stu_sessions
      FROM (
        SELECT *
        FROM public.ktn_class_sessions
        WHERE UPPER(BTRIM(class_code)) = ANY(v_classes)
        ORDER BY updated_at DESC NULLS LAST
        LIMIT 10
      ) t;
    END IF;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_stu_homeworks
    FROM (
      SELECT id, student_email, student_name, class_code, course_id, lesson_num, lesson_title, status, score, graded_at, submitted_at, updated_at
      FROM public.ktn_homeworks
      WHERE LOWER(BTRIM(COALESCE(student_email, ''))) = v_email
      ORDER BY updated_at DESC NULLS LAST
      LIMIT 20
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_stu_messages
    FROM (
      SELECT *
      FROM public.ktn_messages
      WHERE room_id = ANY(v_rooms)
        AND LOWER(BTRIM(COALESCE(sender_email, ''))) <> v_email
      ORDER BY created_at DESC NULLS LAST
      LIMIT 10
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_stu_teachers
    FROM (
      SELECT
        code,
        email,
        active,
        aliases,
        COALESCE((to_jsonb(ktn_teachers)->'assigned_courses'), '[]'::jsonb) AS assigned_courses
      FROM public.ktn_teachers
      WHERE COALESCE(active, true) = true
      LIMIT 1000
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_stu_courses
    FROM (
      SELECT
        course_id,
        code,
        (to_jsonb(ktn_courses)->>'teacher_email') AS teacher_email
      FROM public.ktn_courses
    ) t;

    IF CARDINALITY(v_courses) > 0 THEN
      IF to_regclass('public.ktn_forum_follows') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
        INTO v_forum_follows_tbl
        FROM (
          SELECT *
          FROM public.ktn_forum_follows
          WHERE LOWER(BTRIM(COALESCE(user_email, ''))) = v_email
          ORDER BY created_at DESC NULLS LAST
          LIMIT 500
        ) t;
      END IF;

      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
      INTO v_forum_follows_alerts
      FROM (
        SELECT *
        FROM public.ktn_dlp_alerts
        WHERE room_id = 'FORUM_FOLLOW'
          AND LOWER(BTRIM(COALESCE(sender_email, ''))) = v_email
        ORDER BY created_at DESC NULLS LAST
        LIMIT 500
      ) t;

      IF to_regclass('public.ktn_forum_answers') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
        INTO v_forum_answers_tbl
        FROM (
          SELECT *
          FROM public.ktn_forum_answers
          ORDER BY created_at DESC NULLS LAST
          LIMIT 1000
        ) t;
      END IF;

      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
      INTO v_forum_answers_alerts
      FROM (
        SELECT *
        FROM public.ktn_dlp_alerts
        WHERE room_id = 'FORUM_ANSWER'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 1000
      ) t;
    END IF;

    RETURN jsonb_build_object(
      'version', 1,
      'role', 'student',
      'user_alerts', v_user_alerts,
      'schedule_events', v_schedule_events,
      'student', CASE WHEN v_stu.email IS NOT NULL THEN to_jsonb(v_stu) ELSE NULL END,
      'classes', v_stu_classes,
      'homeworks', v_stu_homeworks,
      'class_sessions', v_stu_sessions,
      'messages', v_stu_messages,
      'teachers', v_stu_teachers,
      'courses', v_stu_courses,
      'forum_questions_tbl', v_forum_questions_tbl,
      'forum_questions_alerts', v_forum_questions_alerts,
      'forum_follows_tbl', v_forum_follows_tbl,
      'forum_follows_alerts', v_forum_follows_alerts,
      'forum_answers_tbl', v_forum_answers_tbl,
      'forum_answers_alerts', v_forum_answers_alerts
    );
  END IF;

  IF v_role = 'teacher' THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_tea_classes
    FROM (
      SELECT id, active, teacher_email, teacher_code
      FROM public.ktn_classes
      ORDER BY created_at ASC, id ASC
      LIMIT 2000
    ) t;

    SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
    INTO v_tea_courses
    FROM (
      SELECT
        course_id,
        code,
        active,
        (to_jsonb(ktn_courses)->>'teacher_email') AS teacher_email
      FROM public.ktn_courses
    ) t;

    SELECT *
    INTO v_tea
    FROM public.ktn_teachers
    WHERE LOWER(BTRIM(email)) = v_email
    LIMIT 1;

    v_tea_active := (v_tea.email IS NOT NULL AND COALESCE(v_tea.active, true) = true);

    IF v_tea_active THEN
      SELECT COALESCE(ARRAY_AGG(DISTINCT UPPER(BTRIM(c.id))), '{}')
      INTO v_assigned_classes
      FROM public.ktn_classes c
      WHERE COALESCE(c.active, true) = true
        AND (
          LOWER(BTRIM(COALESCE(c.teacher_email, ''))) = v_email
          OR (
            BTRIM(COALESCE(c.teacher_email, '')) = ''
            AND v_tea.code IS NOT NULL
            AND BTRIM(v_tea.code) <> ''
            AND UPPER(BTRIM(COALESCE(c.teacher_code, ''))) = UPPER(BTRIM(v_tea.code))
          )
        );

      SELECT COALESCE(ARRAY_AGG(DISTINCT cid_item), '{}')
      INTO v_assigned_courses
      FROM (
        SELECT LOWER(BTRIM(elem)) AS cid_item
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(to_jsonb(v_tea)->'assigned_courses') = 'array'
               THEN to_jsonb(v_tea)->'assigned_courses' ELSE '[]'::jsonb END
        ) AS elem
        WHERE BTRIM(elem) <> ''
        UNION ALL
        SELECT LOWER(BTRIM(SUBSTRING(elem FROM 10)))
        FROM jsonb_array_elements_text(
          CASE WHEN jsonb_typeof(to_jsonb(v_tea)->'aliases') = 'array'
               THEN to_jsonb(v_tea)->'aliases' ELSE '[]'::jsonb END
        ) AS elem
        WHERE LOWER(elem) LIKE '__course:%' AND BTRIM(SUBSTRING(elem FROM 10)) <> ''
        UNION ALL
        SELECT LOWER(BTRIM(crs.course_id))
        FROM public.ktn_courses crs
        WHERE COALESCE(crs.active, true) = true
          AND LOWER(BTRIM(COALESCE((to_jsonb(crs)->>'teacher_email'), ''))) = v_email
      ) cs_src
      WHERE cid_item <> '';

      SELECT COALESCE(ARRAY_AGG(DISTINCT r), '{}')
      INTO v_tea_rooms
      FROM (
        SELECT c AS r FROM unnest(v_assigned_classes) AS c
        UNION ALL
        SELECT 'class:' || c FROM unnest(v_assigned_classes) AS c
        UNION ALL
        SELECT 'course:' || cid FROM unnest(v_assigned_courses) AS cid
        UNION ALL
        SELECT 'course:' || public.ktn_canonical_course_id(cid) FROM unnest(v_assigned_courses) AS cid
      ) trm;

      IF CARDINALITY(v_assigned_classes) > 0 THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.submitted_at DESC NULLS LAST), '[]'::jsonb)
        INTO v_tea_homeworks
        FROM (
          SELECT id, student_email, student_name, class_code, course_id, lesson_num, lesson_title, status, submitted_at, updated_at
          FROM public.ktn_homeworks
          WHERE UPPER(BTRIM(COALESCE(class_code, ''))) = ANY(v_assigned_classes)
            AND status = 'pending'
          ORDER BY submitted_at DESC NULLS LAST
          LIMIT 15
        ) t;

        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        INTO v_tea_class_students
        FROM (
          SELECT *
          FROM public.ktn_students
          WHERE UPPER(BTRIM(COALESCE(class_code, ''))) = ANY(v_assigned_classes)
          LIMIT 500
        ) t;

        SELECT COALESCE(ARRAY_AGG(DISTINCT 'student:' || LOWER(BTRIM(s->>'email'))), '{}')
        INTO v_tea_class_stu_rooms
        FROM jsonb_array_elements(v_tea_class_students) AS s
        WHERE BTRIM(COALESCE(s->>'email', '')) <> ''
          AND COALESCE(LOWER(BTRIM(s->>'account_status')), COALESCE(LOWER(BTRIM(s->>'status')), '')) NOT IN ('deleted', 'archived', 'suspended', 'locked');

        IF CARDINALITY(v_tea_class_stu_rooms) > 0 THEN
          SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
          INTO v_tea_class_priv_msgs
          FROM (
            SELECT *
            FROM public.ktn_messages
            WHERE room_id = ANY(v_tea_class_stu_rooms[1:400])
              AND sender_role = 'student'
            ORDER BY created_at DESC NULLS LAST
            LIMIT 30
          ) t;
        END IF;
      END IF;

      IF CARDINALITY(v_tea_rooms) > 0 THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
        INTO v_tea_group_msgs
        FROM (
          SELECT *
          FROM public.ktn_messages
          WHERE room_id = ANY(v_tea_rooms)
          ORDER BY created_at DESC NULLS LAST
          LIMIT 15
        ) t;
      END IF;

      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
      INTO v_tea_course_priv_msgs
      FROM (
        SELECT *
        FROM public.ktn_messages
        WHERE room_id LIKE 'student:%'
          AND sender_role = 'student'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 50
      ) t;

      SELECT COALESCE(ARRAY_AGG(DISTINCT pe.s_em), '{}')
      INTO v_priv_student_emails
      FROM (
        SELECT CASE
          WHEN (m->>'room_id') ILIKE 'student:%' THEN LOWER(BTRIM(SUBSTRING(m->>'room_id' FROM 9)))
          ELSE LOWER(BTRIM(COALESCE(m->>'sender_email', '')))
        END AS s_em
        FROM jsonb_array_elements(v_tea_class_priv_msgs || v_tea_course_priv_msgs) AS m
      ) pe
      WHERE pe.s_em <> '';

      IF CARDINALITY(v_priv_student_emails) > 0 THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
        INTO v_tea_extra_priv_students
        FROM (
          SELECT *
          FROM public.ktn_students
          WHERE LOWER(BTRIM(email)) = ANY(v_priv_student_emails)
        ) t;
      END IF;

      IF to_regclass('public.ktn_course_grant_requests') IS NOT NULL THEN
        SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
        INTO v_grant_reqs_tbl
        FROM (
          SELECT *
          FROM public.ktn_course_grant_requests
          ORDER BY created_at DESC NULLS LAST
          LIMIT 500
        ) t;
      END IF;

      SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
      INTO v_grant_reqs_alerts
      FROM (
        SELECT *
        FROM public.ktn_dlp_alerts
        WHERE room_id = 'COURSE_GRANT_REQUEST'
        ORDER BY created_at DESC NULLS LAST
        LIMIT 500
      ) t;
    END IF;

    RETURN jsonb_build_object(
      'version', 1,
      'role', 'teacher',
      'user_alerts', v_user_alerts,
      'schedule_events', v_schedule_events,
      'teacher', CASE WHEN v_tea.email IS NOT NULL THEN to_jsonb(v_tea) ELSE NULL END,
      'teacher_active', v_tea_active,
      'classes', v_tea_classes,
      'courses', v_tea_courses,
      'homeworks', v_tea_homeworks,
      'group_messages', v_tea_group_msgs,
      'class_students', v_tea_class_students,
      'class_priv_messages', v_tea_class_priv_msgs,
      'course_priv_messages', v_tea_course_priv_msgs,
      'extra_priv_students', v_tea_extra_priv_students,
      'forum_questions_tbl', v_forum_questions_tbl,
      'forum_questions_alerts', v_forum_questions_alerts,
      'course_grant_requests_tbl', v_grant_reqs_tbl,
      'course_grant_requests_alerts', v_grant_reqs_alerts
    );
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
  INTO v_adm_classes
  FROM (
    SELECT id, active, teacher_email, teacher_code
    FROM public.ktn_classes
    LIMIT 2000
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_adm_orders
  FROM (
    SELECT order_id, student_name, student_email, course_name, approval_status, created_at
    FROM public.ktn_orders
    ORDER BY created_at DESC NULLS LAST
    LIMIT 10
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.updated_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_adm_homeworks
  FROM (
    SELECT id, student_email, student_name, class_code, lesson_num, lesson_title, status, graded_at, submitted_at, updated_at
    FROM public.ktn_homeworks
    ORDER BY updated_at DESC NULLS LAST
    LIMIT 5
  ) t;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_adm_messages
  FROM (
    SELECT *
    FROM public.ktn_messages
    ORDER BY created_at DESC NULLS LAST
    LIMIT 5
  ) t;

  IF to_regclass('public.ktn_course_grant_requests') IS NOT NULL THEN
    SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_grant_reqs_tbl
    FROM (
      SELECT *
      FROM public.ktn_course_grant_requests
      ORDER BY created_at DESC NULLS LAST
      LIMIT 500
    ) t;
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC NULLS LAST), '[]'::jsonb)
  INTO v_grant_reqs_alerts
  FROM (
    SELECT *
    FROM public.ktn_dlp_alerts
    WHERE room_id = 'COURSE_GRANT_REQUEST'
    ORDER BY created_at DESC NULLS LAST
    LIMIT 500
  ) t;

  RETURN jsonb_build_object(
    'version', 1,
    'role', 'admin',
    'user_alerts', v_user_alerts,
    'schedule_events', v_schedule_events,
    'classes', v_adm_classes,
    'orders', v_adm_orders,
    'homeworks', v_adm_homeworks,
    'messages', v_adm_messages,
    'forum_questions_tbl', v_forum_questions_tbl,
    'forum_questions_alerts', v_forum_questions_alerts,
    'course_grant_requests_tbl', v_grant_reqs_tbl,
    'course_grant_requests_alerts', v_grant_reqs_alerts
  );
END;
$$;

DO $$
BEGIN
  IF to_regprocedure('public.ktn_canonical_course_id(text)') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_canonical_course_id(text) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_canonical_course_id(text) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_canonical_course_id(text) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_canonical_course_id(text) TO service_role;
    END IF;
  END IF;

  IF to_regprocedure('public.ktn_get_notification_bundle(text,text,text[],text[])') IS NOT NULL THEN
    REVOKE ALL ON FUNCTION public.ktn_get_notification_bundle(text,text,text[],text[]) FROM PUBLIC;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      REVOKE ALL ON FUNCTION public.ktn_get_notification_bundle(text,text,text[],text[]) FROM anon;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      REVOKE ALL ON FUNCTION public.ktn_get_notification_bundle(text,text,text[],text[]) FROM authenticated;
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      GRANT EXECUTE ON FUNCTION public.ktn_get_notification_bundle(text,text,text[],text[]) TO service_role;
    END IF;
  END IF;
END $$;

COMMIT;
