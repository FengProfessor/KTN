-- ============================================================================
-- KTN LOG INGESTION OPTIMIZATION MIGRATION (2026-11-18)
-- Goal: Cut Supabase Log Ingestion & API Gateway roundtrips by ~85-90% without
-- changing any authorization/RBAC rule (Worker evaluates all business rules).
--   1. Suppress redundant authenticator statement logging (log errors & >= 2s).
--   2. Add ktn_canonical_course_id(text) matching Worker COURSE_CHAT_ALIASES.
--   3. Add ktn_get_notification_bundle(...) 1-trip raw-data bundle RPC for
--      student, teacher, and admin roles, locked down strictly to service_role.
-- Idempotent: safe to run multiple times on Live Supabase & PGlite.
-- ============================================================================

BEGIN;

-- 1. Suppress noisy statement logs on PostgREST authenticator role
DO $$
BEGIN
  EXECUTE 'ALTER ROLE authenticator SET log_statement = ''none''';
  EXECUTE 'ALTER ROLE authenticator SET log_min_duration_statement = ''2s''';
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Skipping authenticator log settings: %', SQLERRM;
END $$;

-- 2. Canonical course ID mapper (mirrors Worker COURSE_CHAT_ALIASES)
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

-- 3. Single-roundtrip notification data bundler (returns raw rows only)
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

  -- Student locals
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

  -- Teacher locals
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

  -- Admin locals
  v_adm_classes JSONB := '[]'::jsonb;
  v_adm_orders JSONB := '[]'::jsonb;
  v_adm_homeworks JSONB := '[]'::jsonb;
  v_adm_messages JSONB := '[]'::jsonb;
BEGIN
  IF v_email = '' THEN
    RETURN jsonb_build_object('version', 1, 'error', 'MISSING_EMAIL');
  END IF;

  -- Common per-user alerts + global schedule/forum events
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

  -- Role 1: Student
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

  -- Role 2: Teacher
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

  -- Role 3: Admin
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

-- 4. Lock down execution strictly to service_role
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
