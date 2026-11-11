-- =====================================================================
-- KTN MASTER UPGRADE MIGRATION (2026-11-09)
-- Modules:
--   1. P0 Chat Durable Idempotency & Course Room Support (Agent A+B)
--   2. Per-Lesson Q&A Forum & Teacher Contribution Events (Agent C+D)
--   3. Teacher Student Onboarding & Course Grant Requests (Agent E)
--   4. Student Lifecycle Management & Teacher Performance (Agent F)
-- =====================================================================

BEGIN;

-- ---------------------------------------------------------------------
-- 1. P0 CHAT IDEMPOTENCY & ONLINE COURSE ROOM SUPPORT
-- ---------------------------------------------------------------------
ALTER TABLE public.ktn_messages
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS attachments JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::jsonb;

-- Allow class_code to be NULL for online course rooms (course:*) and direct student rooms (student:*)
ALTER TABLE public.ktn_messages
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ALTER COLUMN class_code DROP NOT NULL;

UPDATE public.ktn_messages
SET room_id = COALESCE(NULLIF(TRIM(room_id), ''), NULLIF(TRIM(class_code), ''), 'GENERAL')
WHERE room_id IS NULL OR TRIM(room_id) = '';

-- Deduplicate any pre-existing historical retry duplicates before creating the unique index
DELETE FROM public.ktn_messages m
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY room_id, LOWER(COALESCE(sender_email, '')), client_message_id
           ORDER BY created_at ASC NULLS FIRST, id ASC
         ) AS rn
  FROM public.ktn_messages
  WHERE client_message_id IS NOT NULL AND TRIM(client_message_id) <> ''
) dup
WHERE m.id = dup.id
  AND dup.rn > 1;

-- Conditional unique constraint by (room_id, sender_email, client_message_id)
CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_messages_idempotent_client_msg
  ON public.ktn_messages (room_id, LOWER(sender_email), client_message_id)
  WHERE client_message_id IS NOT NULL AND TRIM(client_message_id) <> '';

CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_created_at
  ON public.ktn_messages (room_id, created_at DESC);

-- ---------------------------------------------------------------------
-- 2. LESSON FORUM TABLES (PER-LESSON Q&A + TEACHER CONTRIBUTION)
-- ---------------------------------------------------------------------
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
    CONSTRAINT ktn_forum_questions_status_check
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

ALTER TABLE public.ktn_forum_questions
  ADD COLUMN IF NOT EXISTS lesson_num INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS skipped_by_emails JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS claimed_by_teacher_id TEXT,
  ADD COLUMN IF NOT EXISTS claimed_by_teacher_email TEXT,
  ADD COLUMN IF NOT EXISTS claimed_by_teacher_name TEXT,
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS assigned_teacher_id TEXT,
  ADD COLUMN IF NOT EXISTS answer_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS helpful_count INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS first_answered_at TIMESTAMPTZ;

UPDATE public.ktn_forum_questions
SET status = CASE
  WHEN LOWER(TRIM(COALESCE(status, ''))) IN ('open', 'claimed', 'answered', 'resolved', 'hidden')
    THEN LOWER(TRIM(status))
  ELSE 'open'
END
WHERE status IS NULL
   OR status NOT IN ('open', 'claimed', 'answered', 'resolved', 'hidden');

ALTER TABLE public.ktn_forum_questions
  DROP CONSTRAINT IF EXISTS ktn_forum_questions_status_check;

ALTER TABLE public.ktn_forum_questions
  ADD CONSTRAINT ktn_forum_questions_status_check
  CHECK (status IN ('open', 'claimed', 'answered', 'resolved', 'hidden'));

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
    CONSTRAINT ktn_forum_answers_author_role_check
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
    CONSTRAINT ktn_forum_answers_status_check
    CHECK (status IN ('visible', 'hidden')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ktn_forum_answers
  ADD COLUMN IF NOT EXISTS video_key TEXT,
  ADD COLUMN IF NOT EXISTS helpful_voter_emails JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.ktn_forum_answers
  DROP CONSTRAINT IF EXISTS ktn_forum_answers_author_role_check;

ALTER TABLE public.ktn_forum_answers
  ADD CONSTRAINT ktn_forum_answers_author_role_check
  CHECK (author_role IN ('teacher', 'admin', 'student'));

ALTER TABLE public.ktn_forum_answers
  DROP CONSTRAINT IF EXISTS ktn_forum_answers_status_check;

ALTER TABLE public.ktn_forum_answers
  ADD CONSTRAINT ktn_forum_answers_status_check
  CHECK (status IN ('visible', 'hidden'));

CREATE INDEX IF NOT EXISTS idx_ktn_forum_answers_question
  ON public.ktn_forum_answers (question_id, created_at ASC);

CREATE TABLE IF NOT EXISTS public.ktn_forum_follows (
  id TEXT,
  question_id TEXT NOT NULL REFERENCES public.ktn_forum_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL DEFAULT '',
  user_email TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT 'student',
  notify_mode TEXT NOT NULL DEFAULT 'immediate'
    CONSTRAINT ktn_forum_follows_notify_mode_check
    CHECK (notify_mode IN ('immediate', 'digest', 'off')),
  following BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, user_id)
);

ALTER TABLE public.ktn_forum_follows
  ADD COLUMN IF NOT EXISTS id TEXT,
  ADD COLUMN IF NOT EXISTS following BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ALTER COLUMN user_id SET DEFAULT '';

ALTER TABLE public.ktn_forum_follows
  DROP CONSTRAINT IF EXISTS ktn_forum_follows_notify_mode_check;

ALTER TABLE public.ktn_forum_follows
  ADD CONSTRAINT ktn_forum_follows_notify_mode_check
  CHECK (notify_mode IN ('immediate', 'digest', 'off'));

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
    CONSTRAINT ktn_teacher_contribution_events_event_type_check
    CHECK (event_type IN (
      'substantive_answer',
      'answer_created',
      'marked_helpful',
      'helpful_vote',
      'accepted_answer',
      'verified_guidance_video',
      'video_attached',
      'long_pending_resolved',
      'admin_adjustment',
      'admin_adjust',
      'admin_revoke'
    )),
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  voter_email TEXT NOT NULL DEFAULT '',
  created_by_email TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ktn_teacher_contribution_events
  ADD COLUMN IF NOT EXISTS voter_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS created_by_email TEXT NOT NULL DEFAULT '';

ALTER TABLE public.ktn_teacher_contribution_events
  DROP CONSTRAINT IF EXISTS ktn_teacher_contribution_events_event_type_check;

ALTER TABLE public.ktn_teacher_contribution_events
  ADD CONSTRAINT ktn_teacher_contribution_events_event_type_check
  CHECK (event_type IN (
    'substantive_answer',
    'answer_created',
    'marked_helpful',
    'helpful_vote',
    'accepted_answer',
    'verified_guidance_video',
    'video_attached',
    'long_pending_resolved',
    'admin_adjustment',
    'admin_adjust',
    'admin_revoke'
  ));

CREATE INDEX IF NOT EXISTS idx_ktn_teacher_contrib_teacher_created
  ON public.ktn_teacher_contribution_events (teacher_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ktn_teacher_contrib_email_created
  ON public.ktn_teacher_contribution_events (LOWER(teacher_email), created_at DESC);

-- ---------------------------------------------------------------------
-- 3. COURSE GRANT REQUESTS (TEACHER -> ADMIN APPROVAL)
-- ---------------------------------------------------------------------
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
    CONSTRAINT ktn_course_grant_requests_status_check
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled')),
  reviewed_by_email TEXT,
  reviewed_at TIMESTAMPTZ,
  review_note TEXT NOT NULL DEFAULT '',
  entitlement_result JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.ktn_course_grant_requests
  DROP CONSTRAINT IF EXISTS ktn_course_grant_requests_status_check;

ALTER TABLE public.ktn_course_grant_requests
  ADD CONSTRAINT ktn_course_grant_requests_status_check
  CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_ktn_course_grant_requests_status
  ON public.ktn_course_grant_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ktn_course_grant_requests_student
  ON public.ktn_course_grant_requests (LOWER(student_email), status);

CREATE INDEX IF NOT EXISTS idx_ktn_course_grant_requests_teacher
  ON public.ktn_course_grant_requests (LOWER(teacher_email), created_at DESC);

-- ---------------------------------------------------------------------
-- 4. STUDENT LIFECYCLE COLUMNS, ONBOARDING FIELDS & AUDIT LOG
-- ---------------------------------------------------------------------
ALTER TABLE public.ktn_students
  ADD COLUMN IF NOT EXISTS parent_phone TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS notes TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS account_status TEXT DEFAULT 'ready_to_login',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT,
  ADD COLUMN IF NOT EXISTS created_by_teacher_email TEXT;

-- Align account_status default with supabase_migration_v3.sql ('ready_to_login')
ALTER TABLE public.ktn_students
  ALTER COLUMN account_status SET DEFAULT 'ready_to_login';

-- Normalize NULL, empty, uppercase, whitespace, or legacy account_status values before adding CHECK constraint
UPDATE public.ktn_students
SET account_status = CASE
  WHEN account_status IS NULL OR TRIM(account_status) = '' THEN 'ready_to_login'
  WHEN LOWER(TRIM(account_status)) IN (
    'active',
    'ready_to_login',
    'pending_activation',
    'suspended',
    'archived',
    'deleted',
    'sync_error',
    'awaiting_password_or_handoff',
    'unassigned'
  ) THEN LOWER(TRIM(account_status))
  WHEN LOWER(TRIM(account_status)) IN ('verified', 'activated', 'existing_account', 'credentials_handed_off') THEN 'active'
  WHEN LOWER(TRIM(account_status)) IN ('pending', 'pending_creation', 'creating') THEN 'pending_activation'
  WHEN LOWER(TRIM(account_status)) IN ('locked', 'disabled', 'blocked', 'inactive') THEN 'suspended'
  WHEN LOWER(TRIM(account_status)) IN ('no_account', 'none') THEN 'unassigned'
  WHEN LOWER(TRIM(account_status)) IN ('error', 'failed') THEN 'sync_error'
  ELSE 'ready_to_login'
END
WHERE account_status IS NULL
   OR account_status NOT IN (
     'active',
     'ready_to_login',
     'pending_activation',
     'suspended',
     'archived',
     'deleted',
     'sync_error',
     'awaiting_password_or_handoff',
     'unassigned'
   );

ALTER TABLE public.ktn_students
  DROP CONSTRAINT IF EXISTS ktn_students_account_status_check;

ALTER TABLE public.ktn_students
  ADD CONSTRAINT ktn_students_account_status_check
  CHECK (account_status IN (
    'active',
    'ready_to_login',
    'pending_activation',
    'suspended',
    'archived',
    'deleted',
    'sync_error',
    'awaiting_password_or_handoff',
    'unassigned'
  ));

CREATE INDEX IF NOT EXISTS idx_ktn_students_account_status
  ON public.ktn_students (account_status, updated_at DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_ktn_students_parent_phone
  ON public.ktn_students (parent_phone);

-- Upgrade ktn_students_update_search_fields() trigger to include parent_phone in search_text
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'ktn_normalize_vi')
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ktn_students' AND column_name = 'search_text'
     ) THEN
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

    UPDATE public.ktn_students
    SET search_text = public.ktn_normalize_vi(
      COALESCE(code, '') || ' ' ||
      COALESCE(name, '') || ' ' ||
      REPLACE(public.ktn_normalize_vi(COALESCE(name, '')), ' ', '') || ' ' ||
      COALESCE(email, '') || ' ' ||
      COALESCE(phone, '') || ' ' ||
      COALESCE(parent_phone, '') || ' ' ||
      COALESCE(parent_name, '') || ' ' ||
      COALESCE(class_code, '')
    )
    WHERE COALESCE(TRIM(parent_phone), '') <> '';
  END IF;
END $$;

ALTER TABLE public.ktn_teachers
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS assigned_classes JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS assigned_courses JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS aliases JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS search_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS search_text_norm TEXT DEFAULT '';

ALTER TABLE public.ktn_courses
  ADD COLUMN IF NOT EXISTS teacher_email TEXT;

-- Ensure extensions & Vietnamese accent normalizer exist for fast teacher search (Agent A - A1)
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'unaccent extension not available; using ktn_normalize_vi translate fallback.';
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

CREATE OR REPLACE FUNCTION public.ktn_teachers_update_search_fields()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $fn$
DECLARE
  v_norm text;
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

DROP TRIGGER IF EXISTS trg_ktn_teachers_search_fields ON public.ktn_teachers;
CREATE TRIGGER trg_ktn_teachers_search_fields
BEFORE INSERT OR UPDATE ON public.ktn_teachers
FOR EACH ROW
EXECUTE FUNCTION public.ktn_teachers_update_search_fields();

UPDATE public.ktn_teachers
SET
  search_text = public.ktn_normalize_vi(
    COALESCE(code, '') || ' ' ||
    COALESCE(name, '') || ' ' ||
    REPLACE(public.ktn_normalize_vi(COALESCE(name, '')), ' ', '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(phone, '') || ' ' ||
    COALESCE(specialty, '') || ' ' ||
    COALESCE(assigned_classes::text, '') || ' ' ||
    COALESCE(assigned_courses::text, '')
  ),
  search_text_norm = public.ktn_normalize_vi(
    COALESCE(code, '') || ' ' ||
    COALESCE(name, '') || ' ' ||
    REPLACE(public.ktn_normalize_vi(COALESCE(name, '')), ' ', '') || ' ' ||
    COALESCE(email, '') || ' ' ||
    COALESCE(phone, '') || ' ' ||
    COALESCE(specialty, '') || ' ' ||
    COALESCE(assigned_classes::text, '') || ' ' ||
    COALESCE(assigned_courses::text, '')
  )
WHERE COALESCE(search_text_norm, '') = '' OR COALESCE(search_text, '') = '';

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_search_trgm
  ON public.ktn_teachers USING GIN (search_text gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_search_text_norm_trgm
  ON public.ktn_teachers USING GIN (search_text_norm gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_active_code
  ON public.ktn_teachers (active, code ASC);

CREATE INDEX IF NOT EXISTS idx_ktn_teachers_email_lower
  ON public.ktn_teachers (LOWER(email));

CREATE OR REPLACE FUNCTION public.ktn_search_teachers(
  p_query text DEFAULT '',
  p_status text DEFAULT NULL,
  p_class_code text DEFAULT NULL,
  p_course_id text DEFAULT NULL,
  p_limit integer DEFAULT 25,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  code text,
  name text,
  email text,
  phone text,
  specialty text,
  assigned_classes jsonb,
  assigned_courses jsonb,
  aliases jsonb,
  active boolean,
  is_active boolean,
  updated_at timestamptz,
  rank_score numeric,
  total_count bigint
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_q text := public.ktn_normalize_vi(p_query);
  v_q_nospace text := replace(public.ktn_normalize_vi(p_query), ' ', '');
  v_status text := lower(trim(coalesce(p_status, '')));
  v_class text := upper(trim(coalesce(p_class_code, '')));
  v_course text := trim(coalesce(p_course_id, ''));
  v_limit integer := greatest(1, least(coalesce(p_limit, 25), 100));
  v_offset integer := greatest(0, coalesce(p_offset, 0));
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT
      t.code,
      t.name,
      t.email,
      t.phone,
      t.specialty,
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
            SELECT 1
            FROM jsonb_array_elements_text(t.assigned_classes) AS cls_elem
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
            SELECT 1
            FROM jsonb_array_elements_text(t.assigned_courses) AS crs_elem
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
    f.code,
    f.name,
    f.email,
    f.phone,
    f.specialty,
    f.assigned_classes,
    f.assigned_courses,
    f.aliases,
    f.active,
    f.is_active,
    f.updated_at,
    f.score AS rank_score,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.score DESC, f.active DESC, f.code ASC
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ktn_search_teachers(text, text, text, text, integer, integer) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.ktn_get_rooms_latest_messages(
  p_room_ids text[] DEFAULT NULL,
  p_room_prefix text DEFAULT NULL
)
RETURNS TABLE (
  id text,
  room_id text,
  class_code text,
  sender_email text,
  sender_name text,
  sender_role text,
  content text,
  attachment_url text,
  created_at timestamptz
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

GRANT EXECUTE ON FUNCTION public.ktn_get_rooms_latest_messages(text[], text) TO anon, authenticated, service_role;

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

-- ---------------------------------------------------------------------
-- 4B. DURABLE NOTIFICATIONS & EVENT_ID DEDUPLICATION (AGENT B)
-- ---------------------------------------------------------------------
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

ALTER TABLE public.ktn_notifications
  ALTER COLUMN id SET DEFAULT gen_random_uuid()::text,
  ADD COLUMN IF NOT EXISTS event_id TEXT,
  ADD COLUMN IF NOT EXISTS recipient_email TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS user_email TEXT,
  ADD COLUMN IF NOT EXISTS target_email TEXT,
  ADD COLUMN IF NOT EXISTS sender_email TEXT,
  ADD COLUMN IF NOT EXISTS recipient_role TEXT NOT NULL DEFAULT 'student',
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'class_announcement',
  ADD COLUMN IF NOT EXISTS class_code TEXT,
  ADD COLUMN IF NOT EXISTS room_id TEXT,
  ADD COLUMN IF NOT EXISTS message_id TEXT,
  ADD COLUMN IF NOT EXISTS homework_id TEXT,
  ADD COLUMN IF NOT EXISTS course_id TEXT,
  ADD COLUMN IF NOT EXISTS unit_id TEXT,
  ADD COLUMN IF NOT EXISTS question_id TEXT,
  ADD COLUMN IF NOT EXISTS lesson_num INTEGER,
  ADD COLUMN IF NOT EXISTS session_num INTEGER,
  ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS body TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS action_url TEXT NOT NULL DEFAULT '/notifications',
  ADD COLUMN IF NOT EXISTS action_label TEXT,
  ADD COLUMN IF NOT EXISTS priority TEXT NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS read BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE public.ktn_notifications
SET event_id = COALESCE(NULLIF(TRIM(event_id), ''), id),
    recipient_email = LOWER(COALESCE(
      NULLIF(TRIM(recipient_email), ''),
      NULLIF(TRIM(user_email), ''),
      NULLIF(TRIM(target_email), ''),
      ''
    )),
    user_email = LOWER(COALESCE(
      NULLIF(TRIM(user_email), ''),
      NULLIF(TRIM(recipient_email), ''),
      NULLIF(TRIM(target_email), '')
    )),
    target_email = LOWER(COALESCE(
      NULLIF(TRIM(target_email), ''),
      NULLIF(TRIM(recipient_email), ''),
      NULLIF(TRIM(user_email), '')
    ))
WHERE id IS NOT NULL;

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

-- Deduplicate any pre-existing historical notification rows with identical (event_id, recipient_email)
DELETE FROM public.ktn_notifications n
USING (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY event_id, LOWER(COALESCE(recipient_email, ''))
           ORDER BY created_at ASC NULLS FIRST, id ASC
         ) AS rn
  FROM public.ktn_notifications
  WHERE event_id IS NOT NULL AND TRIM(event_id) <> ''
) dup
WHERE n.id = dup.id
  AND dup.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_notifications_idempotent_event
  ON public.ktn_notifications (event_id, LOWER(COALESCE(recipient_email, '')))
  WHERE event_id IS NOT NULL AND TRIM(event_id) <> '';

CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_created
  ON public.ktn_notifications (LOWER(recipient_email), created_at DESC);

CREATE INDEX IF NOT EXISTS idx_ktn_notifications_class_created
  ON public.ktn_notifications (class_code, created_at DESC);

DO $$
BEGIN
  IF to_regclass('public.ktn_messages') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_created_at_id ON public.ktn_messages (room_id, created_at DESC, id DESC)';
  END IF;
  IF to_regclass('public.ktn_dlp_alerts') IS NOT NULL THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_ktn_dlp_alerts_room_sender_created ON public.ktn_dlp_alerts (room_id, LOWER(sender_email), created_at DESC)';
  END IF;
END $$;

-- ---------------------------------------------------------------------
-- 5. ROW-LEVEL SECURITY (RLS) & ROLE GRANTS (WORKER BFF ARCHITECTURE)
-- ---------------------------------------------------------------------
ALTER TABLE public.ktn_forum_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_forum_answers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_forum_follows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_teacher_contribution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_course_grant_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ktn_notifications ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.ktn_forum_questions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_forum_answers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_forum_follows FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_teacher_contribution_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_course_grant_requests FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_admin_audit_logs FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.ktn_notifications FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.ktn_forum_questions TO service_role;
GRANT ALL ON TABLE public.ktn_forum_answers TO service_role;
GRANT ALL ON TABLE public.ktn_forum_follows TO service_role;
GRANT ALL ON TABLE public.ktn_teacher_contribution_events TO service_role;
GRANT ALL ON TABLE public.ktn_course_grant_requests TO service_role;
GRANT ALL ON TABLE public.ktn_admin_audit_logs TO service_role;
GRANT ALL ON TABLE public.ktn_notifications TO service_role;

DROP POLICY IF EXISTS service_role_only_ktn_forum_questions ON public.ktn_forum_questions;
CREATE POLICY service_role_only_ktn_forum_questions ON public.ktn_forum_questions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_forum_answers ON public.ktn_forum_answers;
CREATE POLICY service_role_only_ktn_forum_answers ON public.ktn_forum_answers
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_forum_follows ON public.ktn_forum_follows;
CREATE POLICY service_role_only_ktn_forum_follows ON public.ktn_forum_follows
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_teacher_contribution_events ON public.ktn_teacher_contribution_events;
CREATE POLICY service_role_only_ktn_teacher_contribution_events ON public.ktn_teacher_contribution_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_course_grant_requests ON public.ktn_course_grant_requests;
CREATE POLICY service_role_only_ktn_course_grant_requests ON public.ktn_course_grant_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_admin_audit_logs ON public.ktn_admin_audit_logs;
CREATE POLICY service_role_only_ktn_admin_audit_logs ON public.ktn_admin_audit_logs
  FOR ALL TO service_role USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS service_role_only_ktn_notifications ON public.ktn_notifications;
CREATE POLICY service_role_only_ktn_notifications ON public.ktn_notifications
  FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMIT;

-- =====================================================================
-- ROLLBACK REFERENCE (Manual execution only if needed):
-- DROP INDEX IF EXISTS public.idx_ktn_messages_idempotent_client_msg;
-- DROP INDEX IF EXISTS public.idx_ktn_messages_room_created_at;
-- DROP INDEX IF EXISTS public.idx_ktn_notifications_idempotent_event;
-- DROP INDEX IF EXISTS public.idx_ktn_notifications_recipient_created;
-- DROP INDEX IF EXISTS public.idx_ktn_notifications_class_created;
-- DROP INDEX IF EXISTS public.idx_ktn_dlp_alerts_room_sender_created;
-- DROP TABLE IF EXISTS public.ktn_notifications;
-- DROP TABLE IF EXISTS public.ktn_admin_audit_logs;
-- DROP TABLE IF EXISTS public.ktn_course_grant_requests;
-- DROP TABLE IF EXISTS public.ktn_teacher_contribution_events;
-- DROP TABLE IF EXISTS public.ktn_forum_follows;
-- DROP TABLE IF EXISTS public.ktn_forum_answers;
-- DROP TABLE IF EXISTS public.ktn_forum_questions;
-- =====================================================================


