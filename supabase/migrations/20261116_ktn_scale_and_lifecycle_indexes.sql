-- ============================================================================
-- KTN Scale & Lifecycle Composite Indexes (PostgreSQL / Supabase)
-- Defensive & idempotent across Schema V2 (ktn_dlp_alerts) and V3 tables.
-- ============================================================================

DO $$
BEGIN
  -- 1. ktn_students: fast class membership & email lookups
  IF to_regclass('public.ktn_students') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_students' AND column_name = 'class_code') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_students_upper_class_code
        ON public.ktn_students (UPPER(BTRIM(COALESCE(class_code, ''))));
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_students' AND column_name = 'email') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_students_lower_email
        ON public.ktn_students (LOWER(BTRIM(email)));
    END IF;
  END IF;

  -- 2. ktn_homeworks: grading queue & student history scans
  IF to_regclass('public.ktn_homeworks') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'student_email')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'submitted_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_student_submitted
        ON public.ktn_homeworks (student_email, submitted_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'class_code')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_class_status_submitted
        ON public.ktn_homeworks (class_code, status, submitted_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'course_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_homeworks' AND column_name = 'status') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_homeworks_course_status_submitted
        ON public.ktn_homeworks (course_id, status, submitted_at DESC);
    END IF;
  END IF;

  -- 3. ktn_dlp_alerts: notifications, read state, chat pins, lifecycle metadata
  IF to_regclass('public.ktn_dlp_alerts') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_dlp_alerts' AND column_name = 'room_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_dlp_alerts' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_dlp_alerts_room_created
        ON public.ktn_dlp_alerts (room_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_dlp_alerts' AND column_name = 'room_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_dlp_alerts' AND column_name = 'sender_email')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_dlp_alerts' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_dlp_alerts_room_sender_created
        ON public.ktn_dlp_alerts (room_id, sender_email, created_at DESC);
    END IF;
  END IF;

  -- 4. ktn_messages: room timeline pagination
  IF to_regclass('public.ktn_messages') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_messages' AND column_name = 'room_id')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_messages' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_created
        ON public.ktn_messages (room_id, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_messages' AND column_name = 'class_code')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_messages' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_messages_class_created
        ON public.ktn_messages (class_code, created_at DESC);
    END IF;
  END IF;

  -- 5. ktn_class_sessions: lookup by class_code + session_num
  IF to_regclass('public.ktn_class_sessions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_class_sessions' AND column_name = 'class_code')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_class_sessions' AND column_name = 'session_num') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_class_sessions_class_num
        ON public.ktn_class_sessions (class_code, session_num);
    END IF;
  END IF;

  -- 6. ktn_push_subscriptions: push dispatch by email + active state
  IF to_regclass('public.ktn_push_subscriptions') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_push_subscriptions' AND column_name = 'student_email') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_push_subs_student_email
        ON public.ktn_push_subscriptions (student_email);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_push_subscriptions' AND column_name = 'email') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_push_subs_email
        ON public.ktn_push_subscriptions (email);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_push_subscriptions' AND column_name = 'user_email') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_push_subs_user_email
        ON public.ktn_push_subscriptions (user_email);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_push_subscriptions' AND column_name = 'endpoint') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_push_subs_endpoint
        ON public.ktn_push_subscriptions (endpoint);
    END IF;
  END IF;

  -- 7. ktn_notifications (V3 normalized notifications table, if present)
  IF to_regclass('public.ktn_notifications') IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'recipient_email')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'created_at') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_created
        ON public.ktn_notifications (recipient_email, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'recipient_email')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'read') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_unread
        ON public.ktn_notifications (recipient_email, read, created_at DESC);
    END IF;
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'recipient_email')
       AND EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'ktn_notifications' AND column_name = 'is_read') THEN
      CREATE INDEX IF NOT EXISTS idx_ktn_notifications_recipient_is_read_legacy
        ON public.ktn_notifications (recipient_email, is_read, created_at DESC);
    END IF;
  END IF;
END $$;
