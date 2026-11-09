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
  ALTER COLUMN class_code DROP NOT NULL;

UPDATE public.ktn_messages
SET room_id = COALESCE(NULLIF(TRIM(room_id), ''), NULLIF(TRIM(class_code), ''), 'GENERAL')
WHERE room_id IS NULL OR TRIM(room_id) = '';

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
  lesson_title_snapshot TEXT NOT NULL DEFAULT '',
  student_id TEXT NOT NULL,
  student_email TEXT NOT NULL DEFAULT '',
  student_name TEXT NOT NULL DEFAULT '',
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  video_timestamp_seconds INTEGER,
  attachments JSONB NOT NULL DEFAULT '[]'::jsonb,
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'answered', 'resolved', 'hidden')),
  claimed_by_teacher_id TEXT,
  claimed_by_teacher_email TEXT,
  claimed_by_teacher_name TEXT,
  claimed_at TIMESTAMPTZ,
  assigned_teacher_id TEXT,
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

CREATE TABLE IF NOT EXISTS idx_ktn_forum_follows_table_placeholder (id INT);
DROP TABLE IF EXISTS idx_ktn_forum_follows_table_placeholder;

CREATE TABLE IF NOT EXISTS public.ktn_forum_follows (
  question_id TEXT NOT NULL REFERENCES public.ktn_forum_questions(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL,
  user_email TEXT NOT NULL DEFAULT '',
  user_role TEXT NOT NULL DEFAULT 'student',
  notify_mode TEXT NOT NULL DEFAULT 'immediate'
    CHECK (notify_mode IN ('immediate', 'digest', 'off')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (question_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.ktn_teacher_contribution_events (
  event_id TEXT PRIMARY KEY,
  teacher_id TEXT NOT NULL,
  teacher_email TEXT NOT NULL DEFAULT '',
  teacher_name TEXT NOT NULL DEFAULT '',
  question_id TEXT,
  answer_id TEXT,
  event_type TEXT NOT NULL
    CHECK (event_type IN (
      'substantive_answer',
      'marked_helpful',
      'accepted_answer',
      'verified_guidance_video',
      'long_pending_resolved',
      'admin_adjustment',
      'admin_revoke'
    )),
  points_delta INTEGER NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  actor_email TEXT NOT NULL DEFAULT '',
  verified_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ktn_teacher_contrib_teacher_created
  ON public.ktn_teacher_contribution_events (teacher_id, created_at DESC);

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

-- ---------------------------------------------------------------------
-- 4. STUDENT LIFECYCLE COLUMNS & AUDIT LOG
-- ---------------------------------------------------------------------
ALTER TABLE public.ktn_students
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS suspended_reason TEXT,
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_reason TEXT,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS deleted_by TEXT,
  ADD COLUMN IF NOT EXISTS created_by_teacher_email TEXT;

CREATE INDEX IF NOT EXISTS idx_ktn_students_account_status
  ON public.ktn_students (account_status);

COMMIT;

-- =====================================================================
-- ROLLBACK REFERENCE (Manual execution only if needed):
-- DROP INDEX IF EXISTS public.idx_ktn_messages_idempotent_client_msg;
-- DROP TABLE IF EXISTS public.ktn_course_grant_requests;
-- DROP TABLE IF EXISTS public.ktn_teacher_contribution_events;
-- DROP TABLE IF EXISTS public.ktn_forum_follows;
-- DROP TABLE IF EXISTS public.ktn_forum_answers;
-- DROP TABLE IF EXISTS public.ktn_forum_questions;
-- =====================================================================
