-- KTN x Zalo OA, Unified CRM & SePay Reconciliation Migration
-- Additive, idempotent, backwards-compatible with 20261114 & 20261115.
-- Do NOT apply to live Supabase without user approval.

BEGIN;

-- 0. DEFENSIVE ROLE CHECK
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    BEGIN
      CREATE ROLE service_role NOLOGIN;
    EXCEPTION WHEN insufficient_privilege OR duplicate_object THEN NULL;
    END;
  END IF;
END $$;

-- 1. EXTEND ktn_advisors
ALTER TABLE IF EXISTS public.ktn_advisors
  ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'advisor',
  ADD COLUMN IF NOT EXISTS ktn_user_id text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ktn_advisors'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.ktn_advisors DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
  ALTER TABLE public.ktn_advisors
    ADD CONSTRAINT ktn_advisors_role_check CHECK (role IN ('advisor', 'manager'));
END $$;

-- 2. EXTEND ktn_consultations
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.ktn_consultations'::regclass AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%channel%'
  LOOP
    EXECUTE format('ALTER TABLE public.ktn_consultations DROP CONSTRAINT IF EXISTS %I', r.conname);
  END LOOP;
  ALTER TABLE public.ktn_consultations
    ADD CONSTRAINT ktn_consultations_channel_check CHECK (channel IN ('web', 'messenger', 'zalo_oa'));
END $$;

ALTER TABLE IF EXISTS public.ktn_consultations
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text,
  ADD COLUMN IF NOT EXISTS zalo_user_id text,
  ADD COLUMN IF NOT EXISTS source_tag text,
  ADD COLUMN IF NOT EXISTS lead_meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS student_code text REFERENCES public.ktn_students(code) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ktn_consultations_channel_status_idx
  ON public.ktn_consultations (channel, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS ktn_consultations_zalo_user_idx
  ON public.ktn_consultations (zalo_user_id) WHERE zalo_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS ktn_consultations_customer_phone_idx
  ON public.ktn_consultations (customer_phone) WHERE customer_phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS ktn_consultations_student_code_idx
  ON public.ktn_consultations (student_code) WHERE student_code IS NOT NULL;

ALTER TABLE IF EXISTS public.ktn_consultation_messages
  ADD COLUMN IF NOT EXISTS client_request_id text;

CREATE UNIQUE INDEX IF NOT EXISTS ktn_consultation_messages_client_req_uidx
  ON public.ktn_consultation_messages (consultation_id, client_request_id)
  WHERE client_request_id IS NOT NULL;

-- 3. EXTEND ktn_orders & ktn_students
ALTER TABLE IF EXISTS public.ktn_orders
  ADD COLUMN IF NOT EXISTS source text DEFAULT 'website',
  ADD COLUMN IF NOT EXISTS assigned_advisor text,
  ADD COLUMN IF NOT EXISTS consultation_id uuid REFERENCES public.ktn_consultations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ktn_orders_consultation_id
  ON public.ktn_orders (consultation_id) WHERE consultation_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ktn_orders_source_created
  ON public.ktn_orders (source, created_at DESC);

ALTER TABLE IF EXISTS public.ktn_students
  ADD COLUMN IF NOT EXISTS lead_source text,
  ADD COLUMN IF NOT EXISTS zalo_user_id text,
  ADD COLUMN IF NOT EXISTS consultation_id uuid REFERENCES public.ktn_consultations(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ktn_students_zalo_user_id
  ON public.ktn_students (zalo_user_id) WHERE zalo_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ktn_students_consultation_id
  ON public.ktn_students (consultation_id) WHERE consultation_id IS NOT NULL;

-- 4. CREATE ktn_zalo_oa_events
CREATE TABLE IF NOT EXISTS public.ktn_zalo_oa_events (
  event_id text PRIMARY KEY,
  event_name text NOT NULL,
  zalo_user_id text,
  consultation_id uuid REFERENCES public.ktn_consultations(id) ON DELETE SET NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'processed'
    CHECK (status IN ('received', 'processed', 'duplicate', 'ignored', 'failed')),
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ktn_zalo_oa_events_user_idx
  ON public.ktn_zalo_oa_events (zalo_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ktn_zalo_oa_events_thread_idx
  ON public.ktn_zalo_oa_events (consultation_id, created_at DESC) WHERE consultation_id IS NOT NULL;

-- 5. CREATE ktn_sepay_reconciliation_logs
CREATE TABLE IF NOT EXISTS public.ktn_sepay_reconciliation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_id text NOT NULL UNIQUE,
  order_id text REFERENCES public.ktn_orders(order_id) ON DELETE SET NULL,
  claimed_order_code text,
  consultation_id uuid REFERENCES public.ktn_consultations(id) ON DELETE SET NULL,
  kind text NOT NULL
    CHECK (kind IN ('unmatched', 'unknown_order', 'account_mismatch', 'mismatch', 'duplicate', 'needs_review', 'accepted')),
  amount bigint NOT NULL,
  expected_amount bigint,
  account_number text,
  transfer_content text,
  raw_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolution_status text NOT NULL DEFAULT 'open'
    CHECK (resolution_status IN ('open', 'resolved', 'ignored')),
  resolved_by text,
  resolved_at timestamptz,
  resolution_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ktn_sepay_recon_status_created_idx
  ON public.ktn_sepay_reconciliation_logs (resolution_status, created_at DESC);
CREATE INDEX IF NOT EXISTS ktn_sepay_recon_order_idx
  ON public.ktn_sepay_reconciliation_logs (order_id) WHERE order_id IS NOT NULL;

-- 6. RLS LOCKDOWN FOR NEW TABLES
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['ktn_zalo_oa_events', 'ktn_sepay_reconciliation_logs'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM PUBLIC', t);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON TABLE public.%I FROM authenticated', t);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.%I TO service_role', t);
      EXECUTE format('DROP POLICY IF EXISTS service_role_only_%I ON public.%I', t, t);
      EXECUTE format(
        'CREATE POLICY service_role_only_%I ON public.%I AS PERMISSIVE FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t, t
      );
    END IF;
  END LOOP;
END $$;

-- 7. EXTEND ktn_consultation_inbox VIEW (preserve 16 original columns first, append 6 new columns)
DROP VIEW IF EXISTS public.ktn_consultation_inbox;
CREATE VIEW public.ktn_consultation_inbox WITH (security_invoker = true) AS
SELECT
  c.id, c.channel, c.external_id, c.owner_email, c.status, c.outcome,
  c.follow_up_at, c.queued_at, c.first_reply_at, c.last_customer_at,
  c.last_reply_at, c.next_review_at, c.created_at, c.updated_at,
  coalesce(c.last_customer_at > coalesce(c.last_reply_at, '-infinity'), false) AS reply_pending,
  exists (
    SELECT 1 FROM public.ktn_consultation_orders l
    JOIN public.ktn_orders o USING (order_id)
    WHERE l.consultation_id = c.id AND o.payment_status = 'paid' AND o.approval_status <> 'approved'
  ) AS has_paid_pending,
  c.customer_name, c.customer_phone, c.zalo_user_id, c.source_tag, c.lead_meta, c.student_code
FROM public.ktn_consultations c
WHERE c.last_customer_at IS NOT NULL
   OR c.last_reply_at IS NOT NULL
   OR exists (SELECT 1 FROM public.ktn_consultation_orders l WHERE l.consultation_id = c.id);

REVOKE ALL ON public.ktn_consultation_inbox FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON public.ktn_consultation_inbox FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON public.ktn_consultation_inbox FROM authenticated;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
    GRANT SELECT ON public.ktn_consultation_inbox TO service_role;
  END IF;
END $$;

-- 8. UPDATE EXISTING RPCs FOR ZALO OA BACKWARDS COMPATIBILITY
CREATE OR REPLACE FUNCTION public.ktn_consultation_action(
  p_id uuid, p_action text, p_actor text DEFAULT NULL, p_admin boolean DEFAULT false,
  p_payload jsonb DEFAULT '{}'
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  c public.ktn_consultations;
  m public.ktn_consultation_messages;
  target text;
  text_body text := nullif(btrim(p_payload->>'body'), '');
  sender_type text;
  delivery_state text;
  v_client_req_id text;
  v_msg_ext_id text;
  clock_time timestamptz := now();
BEGIN
  SELECT * INTO c FROM public.ktn_consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;

  IF p_action = 'customer' THEN
    IF c.channel IN ('messenger', 'zalo_oa') AND nullif(p_payload->>'external_id', '') IS NULL THEN
      RETURN jsonb_build_object('error', 'invalid');
    END IF;
    sender_type := 'customer';
  ELSIF p_action = 'external' THEN
    IF c.channel NOT IN ('messenger', 'zalo_oa') OR nullif(p_payload->>'external_id', '') IS NULL THEN
      RETURN jsonb_build_object('error', 'invalid');
    END IF;
    sender_type := 'external';
    UPDATE public.ktn_consultation_messages
      SET delivery = 'failed',
          delivery_note = CASE WHEN c.channel = 'zalo_oa' THEN 'Đã có phản hồi từ Zalo OA' ELSE 'Đã có phản hồi từ Fanpage' END
      WHERE consultation_id = c.id AND sender = 'bot' AND delivery = 'queued';
  ELSIF p_action = 'bot' THEN
    IF c.status <> 'bot' OR c.owner_email IS NOT NULL OR
       (p_payload->>'after_id') IS DISTINCT FROM (
         SELECT id::text FROM public.ktn_consultation_messages
         WHERE consultation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
       ) THEN RETURN jsonb_build_object('error', 'conflict'); END IF;
    sender_type := 'bot';
  ELSIF p_action = 'queue' THEN
    IF c.status <> 'bot' OR c.owner_email IS NOT NULL OR (p_payload->>'after_id') IS DISTINCT FROM (
      SELECT id::text FROM public.ktn_consultation_messages
      WHERE consultation_id = c.id ORDER BY created_at DESC, id DESC LIMIT 1
    ) THEN RETURN jsonb_build_object('error', 'conflict'); END IF;
    UPDATE public.ktn_consultations
      SET status = 'waiting', queued_at = coalesce(queued_at, clock_time), updated_at = clock_time
      WHERE id = c.id RETURNING * INTO c;
    IF text_body IS NOT NULL THEN
      INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
        VALUES (c.id, 'system', text_body, CASE WHEN c.channel IN ('messenger', 'zalo_oa') THEN 'queued' ELSE 'sent' END);
    END IF;
    INSERT INTO public.ktn_consultation_events (consultation_id, kind) VALUES (c.id, 'queued');
    RETURN jsonb_build_object('conversation', to_jsonb(c));
  ELSE
    IF NOT p_admin AND (p_actor IS NULL OR NOT exists (SELECT 1 FROM public.ktn_advisors WHERE email = p_actor AND active)) THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF p_action = 'claim' OR p_action = 'assign' THEN
      IF (p_action = 'assign' AND NOT p_admin) OR c.status = 'closed' OR
         (p_action = 'claim' AND c.owner_email IS NOT NULL) THEN
        RETURN jsonb_build_object('error', 'conflict');
      END IF;
      target := CASE WHEN p_action = 'claim' THEN p_actor ELSE nullif(p_payload->>'email', '') END;
      IF target IS NOT NULL AND NOT exists (SELECT 1 FROM public.ktn_advisors WHERE email = target AND active) THEN
        RETURN jsonb_build_object('error', 'invalid');
      END IF;
      INSERT INTO public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
        VALUES (c.id, p_actor, 'assigned', jsonb_build_object('from', c.owner_email, 'to', target));
      UPDATE public.ktn_consultation_messages
        SET delivery = 'failed', delivery_note = 'Đã chuyển cho tư vấn viên'
        WHERE consultation_id = c.id AND sender = 'bot' AND delivery = 'queued';
      UPDATE public.ktn_consultations
        SET owner_email = target,
            status = CASE WHEN target IS NULL THEN 'waiting' ELSE 'open' END,
            queued_at = coalesce(queued_at, clock_time),
            updated_at = clock_time
        WHERE id = c.id RETURNING * INTO c;
      RETURN jsonb_build_object('conversation', to_jsonb(c));
    END IF;
    IF NOT p_admin AND c.owner_email IS DISTINCT FROM p_actor THEN
      RETURN jsonb_build_object('error', 'forbidden');
    END IF;
    IF p_action IN ('note', 'follow_up', 'close', 'reopen') THEN
      IF p_action = 'note' AND text_body IS NULL THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
      IF p_action = 'close' AND coalesce(p_payload->>'outcome', '') NOT IN ('registered', 'declined', 'no_response', 'other') THEN
        RETURN jsonb_build_object('error', 'invalid');
      END IF;
      IF p_action = 'close' THEN
        UPDATE public.ktn_consultation_messages SET delivery = 'failed', delivery_note = 'Đã đóng ca'
          WHERE consultation_id = c.id AND sender = 'bot' AND delivery = 'queued';
      END IF;
      IF p_action = 'follow_up' AND c.status = 'closed' THEN
        RETURN jsonb_build_object('error', 'conflict');
      END IF;
      UPDATE public.ktn_consultations SET
        follow_up_at = CASE WHEN p_action = 'follow_up' THEN (p_payload->>'at')::timestamptz WHEN p_action = 'close' THEN NULL ELSE follow_up_at END,
        outcome = CASE WHEN p_action = 'close' THEN p_payload->>'outcome' WHEN p_action = 'reopen' THEN NULL ELSE outcome END,
        status = CASE WHEN p_action = 'close' THEN 'closed' WHEN p_action = 'reopen' THEN CASE WHEN owner_email IS NULL THEN 'waiting' ELSE 'open' END ELSE status END,
        updated_at = clock_time
      WHERE id = c.id RETURNING * INTO c;
      INSERT INTO public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
        VALUES (c.id, p_actor, p_action, p_payload);
      RETURN jsonb_build_object('conversation', to_jsonb(c));
    END IF;
    IF p_action <> 'reply' OR c.status = 'closed' OR c.status = 'bot' THEN
      RETURN jsonb_build_object('error', 'conflict');
    END IF;
    sender_type := CASE WHEN p_admin THEN 'manager' ELSE 'advisor' END;
  END IF;

  IF text_body IS NULL OR length(text_body) > 4000 THEN RETURN jsonb_build_object('error', 'invalid'); END IF;
  IF c.channel = 'messenger' AND sender_type IN ('advisor', 'manager', 'bot') THEN
    IF c.last_customer_at IS NULL OR c.last_customer_at < clock_time - interval '24 hours' THEN
      RETURN jsonb_build_object('error', 'window_closed');
    END IF;
    delivery_state := 'queued';
  ELSIF c.channel = 'zalo_oa' AND sender_type IN ('advisor', 'manager', 'bot') THEN
    delivery_state := 'queued';
  ELSE
    delivery_state := 'sent';
  END IF;

  v_client_req_id := coalesce(
    nullif(btrim(p_payload->>'client_request_id'), ''),
    CASE WHEN coalesce(p_payload->>'external_id', '') LIKE 'staff:%' THEN p_payload->>'external_id' ELSE NULL END
  );
  v_msg_ext_id := nullif(p_payload->>'external_id', '');

  INSERT INTO public.ktn_consultation_messages (consultation_id, sender, actor_email, body, external_id, client_request_id, delivery)
  VALUES (c.id, sender_type, p_actor, text_body, v_msg_ext_id, v_client_req_id, delivery_state)
  ON CONFLICT DO NOTHING RETURNING * INTO m;
  IF m.id IS NULL THEN RETURN jsonb_build_object('duplicate', true); END IF;

  UPDATE public.ktn_consultations SET
    last_customer_at = CASE WHEN sender_type = 'customer' THEN greatest(last_customer_at, least(clock_time, coalesce((p_payload->>'at')::timestamptz, clock_time))) ELSE last_customer_at END,
    status = CASE WHEN sender_type = 'customer' AND status = 'closed' THEN CASE WHEN owner_email IS NULL THEN 'waiting' ELSE 'open' END
                  WHEN sender_type = 'external' AND status = 'bot' THEN 'waiting' ELSE status END,
    outcome = CASE WHEN sender_type = 'customer' AND status = 'closed' THEN NULL ELSE outcome END,
    queued_at = CASE WHEN status = 'waiting' OR (sender_type = 'customer' AND status = 'closed') OR sender_type = 'external' THEN coalesce(queued_at, clock_time) ELSE queued_at END,
    first_reply_at = CASE WHEN sender_type IN ('advisor', 'manager') AND delivery_state = 'sent' THEN coalesce(first_reply_at, clock_time) ELSE first_reply_at END,
    last_reply_at = CASE WHEN delivery_state = 'sent' AND sender_type IN ('advisor', 'manager', 'bot', 'external') THEN clock_time ELSE last_reply_at END,
    next_review_at = CASE WHEN sender_type IN ('advisor', 'manager') AND delivery_state = 'sent' THEN clock_time ELSE next_review_at END,
    updated_at = clock_time
  WHERE id = c.id RETURNING * INTO c;

  RETURN jsonb_build_object('conversation', to_jsonb(c), 'message', to_jsonb(m));
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_create_order(
  p_id uuid, p_request_id uuid, p_order jsonb, p_qr_base text
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  c public.ktn_consultations;
  o public.ktn_orders;
  candidate text;
  v_source text;
  v_advisor text;
BEGIN
  SELECT * INTO c FROM public.ktn_consultations WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'not_found'); END IF;
  SELECT ord.* INTO o
  FROM public.ktn_orders ord
  JOIN public.ktn_consultation_orders l ON l.order_id = ord.order_id
  WHERE l.consultation_id = p_id AND l.request_id = p_request_id;
  IF FOUND THEN RETURN to_jsonb(o); END IF;

  v_source := coalesce(
    nullif(p_order->>'source', ''),
    CASE c.channel
      WHEN 'zalo_oa' THEN 'zalo_oa'
      WHEN 'web' THEN 'web_chat'
      WHEN 'messenger' THEN 'messenger'
      ELSE 'consultation'
    END
  );
  v_advisor := coalesce(nullif(btrim(p_order->>'assigned_advisor'), ''), c.owner_email);

  FOR counter IN 1..10 LOOP
    candidate := 'ORD-' || (100000 + floor(random() * 900000)::int)::text;
    INSERT INTO public.ktn_orders (
      order_id, student_name, student_email, phone, course_id, course_name, amount, note,
      source, assigned_advisor, consultation_id
    )
    VALUES (
      candidate, p_order->>'student_name', p_order->>'student_email', p_order->>'phone',
      p_order->>'course_id', p_order->>'course_name', (p_order->>'amount')::int, p_order->>'note',
      v_source, v_advisor, c.id
    )
    ON CONFLICT (order_id) DO NOTHING RETURNING * INTO o;
    EXIT WHEN o.order_id IS NOT NULL;
  END LOOP;
  IF o.order_id IS NULL THEN RAISE EXCEPTION 'Unable to allocate order ID'; END IF;

  INSERT INTO public.ktn_consultation_orders (order_id, consultation_id, request_id, owner_email, payment_info)
    VALUES (o.order_id, p_id, p_request_id, c.owner_email, p_order->'payment_info');
  INSERT INTO public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
    VALUES (p_id, v_advisor, 'order', jsonb_build_object('order_id', o.order_id, 'source', v_source));
  UPDATE public.ktn_consultations SET updated_at = now() WHERE id = c.id;

  IF (c.channel = 'messenger' AND c.last_customer_at > now() - interval '24 hours')
     OR c.channel = 'zalo_oa' THEN
    INSERT INTO public.ktn_consultation_messages (consultation_id, sender, body, delivery)
      VALUES (c.id, 'system', 'Đơn ' || o.order_id || ' · ' || o.course_name || E'\nVietQR: ' ||
        replace(coalesce(p_qr_base, ''), 'ORDER_CODE', o.order_id), 'queued');
  END IF;
  RETURN to_jsonb(o);
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_take_outbox(p_id uuid DEFAULT NULL)
RETURNS SETOF public.ktn_consultation_messages LANGUAGE sql SET search_path = public, pg_temp AS $$
  UPDATE public.ktn_consultation_messages m SET
    delivery = CASE
      WHEN (c.channel <> 'messenger' OR c.last_customer_at > now() - interval '24 hours')
        AND (m.sender <> 'bot' OR c.status = 'bot')
      THEN 'sending' ELSE 'failed' END,
    claimed_at = now(),
    delivery_note = CASE
      WHEN c.channel = 'messenger' AND (c.last_customer_at IS NULL OR c.last_customer_at <= now() - interval '24 hours')
      THEN 'Ngoài cửa sổ Messenger'
      WHEN m.sender = 'bot' AND c.status <> 'bot' THEN 'Đã chuyển cho tư vấn viên'
    END
  FROM public.ktn_consultations c
  WHERE m.consultation_id = c.id AND m.id IN (
    SELECT id FROM public.ktn_consultation_messages
    WHERE delivery = 'queued' AND (p_id IS NULL OR consultation_id = p_id)
    ORDER BY created_at, id LIMIT 10 FOR UPDATE SKIP LOCKED
  ) RETURNING m.*;
$$;

-- 9. NEW RPCs FOR ZALO OA INBOUND DEDUP, SEPAY RECONCILIATION & STUDENT LINKING
CREATE OR REPLACE FUNCTION public.ktn_consultation_upsert_zalo_inbound(
  p_event_id text, p_event_name text, p_zalo_user_id text, p_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_event public.ktn_zalo_oa_events;
  v_conv public.ktn_consultations;
  v_action_res jsonb;
  v_bot_enabled boolean := false;
  v_is_echo boolean := lower(coalesce(nullif(btrim(p_payload->>'is_echo'), ''), 'false')) IN ('true', 't', '1');
  v_body text := nullif(btrim(p_payload->>'body'), '');
  v_name text := nullif(btrim(p_payload->>'customer_name'), '');
  v_phone text := nullif(btrim(p_payload->>'customer_phone'), '');
  v_source_tag text := nullif(btrim(p_payload->>'source_tag'), '');
  v_lead_meta jsonb := CASE WHEN jsonb_typeof(p_payload->'lead_meta') = 'object' THEN p_payload->'lead_meta' ELSE '{}'::jsonb END;
BEGIN
  IF nullif(btrim(p_event_id), '') IS NULL OR nullif(btrim(p_zalo_user_id), '') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  INSERT INTO public.ktn_zalo_oa_events (event_id, event_name, zalo_user_id, payload, status)
  VALUES (p_event_id, coalesce(nullif(btrim(p_event_name), ''), 'unknown'), p_zalo_user_id, coalesce(p_payload, '{}'::jsonb), 'received')
  ON CONFLICT (event_id) DO NOTHING RETURNING * INTO v_event;

  IF v_event.event_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'event_id', p_event_id);
  END IF;

  SELECT bot_enabled INTO v_bot_enabled FROM public.ktn_consultation_guidance WHERE id = 'default';

  INSERT INTO public.ktn_consultations (
    channel, external_id, zalo_user_id, customer_name, customer_phone, source_tag, lead_meta, status
  )
  VALUES (
    'zalo_oa', p_zalo_user_id, p_zalo_user_id, v_name, v_phone, coalesce(v_source_tag, 'zalo_oa'), v_lead_meta,
    CASE WHEN coalesce(v_bot_enabled, false) AND NOT v_is_echo THEN 'bot' ELSE 'waiting' END
  )
  ON CONFLICT (channel, external_id) DO UPDATE SET
    zalo_user_id = coalesce(public.ktn_consultations.zalo_user_id, EXCLUDED.zalo_user_id),
    customer_name = coalesce(nullif(EXCLUDED.customer_name, ''), public.ktn_consultations.customer_name),
    customer_phone = coalesce(nullif(EXCLUDED.customer_phone, ''), public.ktn_consultations.customer_phone),
    source_tag = coalesce(v_source_tag, public.ktn_consultations.source_tag, 'zalo_oa'),
    lead_meta = coalesce(public.ktn_consultations.lead_meta, '{}'::jsonb) || EXCLUDED.lead_meta,
    updated_at = now()
  RETURNING * INTO v_conv;

  UPDATE public.ktn_zalo_oa_events SET consultation_id = v_conv.id, status = 'processed' WHERE event_id = p_event_id;

  IF v_body IS NOT NULL THEN
    v_action_res := public.ktn_consultation_action(
      v_conv.id, CASE WHEN v_is_echo THEN 'external' ELSE 'customer' END, NULL, false,
      jsonb_build_object('external_id', 'zalo:' || p_event_id, 'body', v_body, 'at', coalesce(nullif(btrim(p_payload->>'at'), ''), now()::text))
    );
    IF v_action_res ? 'error' THEN
      UPDATE public.ktn_zalo_oa_events
        SET status = 'failed', error = v_action_res->>'error'
        WHERE event_id = p_event_id;
      RETURN jsonb_build_object(
        'ok', false,
        'error', v_action_res->>'error',
        'event_id', p_event_id,
        'conversation', to_jsonb(v_conv)
      );
    END IF;
    IF (v_action_res->>'duplicate')::boolean IS TRUE THEN
      UPDATE public.ktn_zalo_oa_events SET status = 'duplicate' WHERE event_id = p_event_id;
      RETURN jsonb_build_object('ok', true, 'duplicate', true, 'event_id', p_event_id, 'conversation', to_jsonb(v_conv));
    END IF;
    RETURN jsonb_build_object('ok', true, 'duplicate', false, 'event_id', p_event_id,
      'conversation', coalesce(v_action_res->'conversation', to_jsonb(v_conv)), 'message', v_action_res->'message');
  END IF;

  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'event_id', p_event_id, 'conversation', to_jsonb(v_conv));
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_log_sepay_reconciliation(
  p_transaction_id text, p_kind text, p_amount bigint, p_order_id text DEFAULT NULL,
  p_claimed_order_code text DEFAULT NULL, p_expected_amount bigint DEFAULT NULL,
  p_account_number text DEFAULT NULL, p_transfer_content text DEFAULT NULL, p_raw_payload jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_order_id_in text := nullif(btrim(p_order_id), '');
  v_valid_order_id text;
  v_consultation_id uuid;
  v_row public.ktn_sepay_reconciliation_logs;
BEGIN
  IF nullif(btrim(p_transaction_id), '') IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'invalid'); END IF;
  IF coalesce(p_kind, '') NOT IN ('unmatched', 'unknown_order', 'account_mismatch', 'mismatch', 'duplicate', 'needs_review', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  IF v_order_id_in IS NOT NULL THEN
    SELECT o.order_id, coalesce(o.consultation_id, l.consultation_id)
      INTO v_valid_order_id, v_consultation_id
    FROM public.ktn_orders o
    LEFT JOIN public.ktn_consultation_orders l ON l.order_id = o.order_id
    WHERE o.order_id = v_order_id_in;
  END IF;

  INSERT INTO public.ktn_sepay_reconciliation_logs (
    transaction_id, order_id, claimed_order_code, consultation_id, kind,
    amount, expected_amount, account_number, transfer_content, raw_payload
  )
  VALUES (
    p_transaction_id, v_valid_order_id, coalesce(nullif(btrim(p_claimed_order_code), ''), v_order_id_in), v_consultation_id, p_kind,
    p_amount, p_expected_amount, p_account_number, p_transfer_content, coalesce(p_raw_payload, '{}'::jsonb)
  )
  ON CONFLICT (transaction_id) DO NOTHING RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    SELECT * INTO v_row FROM public.ktn_sepay_reconciliation_logs WHERE transaction_id = p_transaction_id;
    RETURN jsonb_build_object('ok', true, 'duplicate', true, 'log', to_jsonb(v_row));
  END IF;
  RETURN jsonb_build_object('ok', true, 'duplicate', false, 'log', to_jsonb(v_row));
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_list_sepay_reconciliation(
  p_resolution_status text DEFAULT NULL,
  p_kind text DEFAULT NULL,
  p_limit int DEFAULT 50,
  p_offset int DEFAULT 0
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_limit int := greatest(1, least(coalesce(p_limit, 50), 200));
  v_offset int := greatest(0, coalesce(p_offset, 0));
  v_status text := nullif(btrim(p_resolution_status), '');
  v_kind text := nullif(btrim(p_kind), '');
  v_total bigint := 0;
  v_items jsonb := '[]'::jsonb;
BEGIN
  IF v_status IS NOT NULL AND v_status NOT IN ('open', 'resolved', 'ignored') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  IF v_kind IS NOT NULL AND v_kind NOT IN ('unmatched', 'unknown_order', 'account_mismatch', 'mismatch', 'duplicate', 'needs_review', 'accepted') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;

  SELECT count(*)::bigint INTO v_total
  FROM public.ktn_sepay_reconciliation_logs r
  WHERE (v_status IS NULL OR r.resolution_status = v_status)
    AND (v_kind IS NULL OR r.kind = v_kind);

  SELECT coalesce(jsonb_agg(to_jsonb(sub)), '[]'::jsonb) INTO v_items
  FROM (
    SELECT r.*
    FROM public.ktn_sepay_reconciliation_logs r
    WHERE (v_status IS NULL OR r.resolution_status = v_status)
      AND (v_kind IS NULL OR r.kind = v_kind)
    ORDER BY r.created_at DESC, r.id DESC
    LIMIT v_limit OFFSET v_offset
  ) sub;

  RETURN jsonb_build_object(
    'ok', true,
    'items', v_items,
    'total', v_total,
    'limit', v_limit,
    'offset', v_offset
  );
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_resolve_sepay_reconciliation(
  p_transaction_id text, p_resolution_status text, p_actor text,
  p_note text DEFAULT NULL, p_order_id text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_row public.ktn_sepay_reconciliation_logs;
  v_consultation_id uuid;
  v_order_id text := nullif(btrim(p_order_id), '');
  v_actor text := nullif(btrim(p_actor), '');
  v_note text := nullif(btrim(p_note), '');
BEGIN
  IF coalesce(p_resolution_status, '') NOT IN ('open', 'resolved', 'ignored') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid');
  END IF;
  SELECT * INTO v_row FROM public.ktn_sepay_reconciliation_logs WHERE transaction_id = p_transaction_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  IF v_order_id IS NOT NULL THEN
    SELECT o.consultation_id INTO v_consultation_id FROM public.ktn_orders o WHERE o.order_id = v_order_id;
    IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'order_not_found'); END IF;
    IF v_consultation_id IS NULL THEN
      SELECT consultation_id INTO v_consultation_id FROM public.ktn_consultation_orders WHERE order_id = v_order_id;
    END IF;
  END IF;

  UPDATE public.ktn_sepay_reconciliation_logs SET
    resolution_status = p_resolution_status,
    resolved_by = CASE WHEN p_resolution_status = 'open' THEN NULL ELSE v_actor END,
    resolved_at = CASE WHEN p_resolution_status = 'open' THEN NULL ELSE now() END,
    resolution_note = coalesce(v_note, resolution_note),
    order_id = coalesce(v_order_id, order_id),
    consultation_id = coalesce(v_consultation_id, consultation_id),
    updated_at = now()
  WHERE id = v_row.id RETURNING * INTO v_row;

  IF v_row.consultation_id IS NOT NULL THEN
    INSERT INTO public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
    VALUES (v_row.consultation_id, v_actor, 'sepay_reconciliation', jsonb_build_object(
      'transaction_id', p_transaction_id, 'resolution_status', p_resolution_status, 'order_id', v_row.order_id
    ));
  END IF;
  RETURN jsonb_build_object('ok', true, 'log', to_jsonb(v_row));
END
$$;

CREATE OR REPLACE FUNCTION public.ktn_consultation_link_student(
  p_consultation_id uuid, p_student_code text, p_actor text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_conv public.ktn_consultations;
  v_stu public.ktn_students;
BEGIN
  SELECT * INTO v_conv FROM public.ktn_consultations WHERE id = p_consultation_id FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT * INTO v_stu FROM public.ktn_students WHERE code = p_student_code FOR UPDATE;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'student_not_found'); END IF;

  UPDATE public.ktn_consultations SET
    student_code = v_stu.code,
    customer_name = coalesce(nullif(customer_name, ''), v_stu.name),
    customer_phone = coalesce(nullif(customer_phone, ''), nullif(v_stu.phone, '')),
    updated_at = now()
  WHERE id = v_conv.id RETURNING * INTO v_conv;

  UPDATE public.ktn_students SET
    consultation_id = v_conv.id,
    zalo_user_id = coalesce(nullif(zalo_user_id, ''), v_conv.zalo_user_id),
    lead_source = coalesce(nullif(lead_source, ''), coalesce(nullif(v_conv.source_tag, ''), v_conv.channel)),
    updated_at = now()
  WHERE code = v_stu.code;

  INSERT INTO public.ktn_consultation_events (consultation_id, actor_email, kind, detail)
  VALUES (v_conv.id, p_actor, 'student_linked', jsonb_build_object('student_code', v_stu.code));
  RETURN jsonb_build_object('ok', true, 'conversation', to_jsonb(v_conv), 'student_code', v_stu.code);
END
$$;

-- 10. REVOKE / GRANT FUNCTION EXECUTE PRIVILEGES
DO $$
DECLARE signature text;
BEGIN
  FOREACH signature IN ARRAY ARRAY[
    'ktn_consultation_action(uuid,text,text,boolean,jsonb)',
    'ktn_consultation_create_order(uuid,uuid,jsonb,text)',
    'ktn_consultation_take_outbox(uuid)',
    'ktn_consultation_upsert_zalo_inbound(text,text,text,jsonb)',
    'ktn_consultation_log_sepay_reconciliation(text,text,bigint,text,text,bigint,text,text,jsonb)',
    'ktn_consultation_list_sepay_reconciliation(text,text,int,int)',
    'ktn_consultation_resolve_sepay_reconciliation(text,text,text,text,text)',
    'ktn_consultation_link_student(uuid,text,text)'
  ] LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || signature || ' FROM PUBLIC';
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.' || signature || ' FROM anon';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE 'REVOKE ALL ON FUNCTION public.' || signature || ' FROM authenticated';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || signature || ' TO service_role';
    END IF;
  END LOOP;
END $$;

-- 11. HARDEN ktn_consultation_protect_order FOR LEGITIMATE PROVISIONING UPDATES
CREATE OR REPLACE FUNCTION public.ktn_consultation_protect_order() RETURNS trigger
LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE
  v_is_legit_provisioning boolean := false;
BEGIN
  IF old.note LIKE '%"source":"consultation"%'
     AND (new.note IS NULL OR new.note NOT LIKE '%"source":"consultation"%')
     AND exists (SELECT 1 FROM public.ktn_consultation_orders l WHERE l.order_id = old.order_id)
  THEN
    v_is_legit_provisioning :=
      exists (
        SELECT 1 FROM public.ktn_consultation_orders l
        WHERE l.order_id = old.order_id
          AND (old.consultation_id IS NULL OR new.consultation_id IS NOT DISTINCT FROM old.consultation_id)
      )
      AND coalesce(new.source, '') IN ('zalo_oa', 'web_chat', 'messenger', 'consultation')
      AND new.note LIKE '%<!--KTN_ORDER_META:%'
      AND (
        new.note LIKE '%"source":"zalo_oa"%'
        OR new.note LIKE '%"source":"web_chat"%'
        OR new.note LIKE '%"source":"messenger"%'
      )
      AND lower(coalesce(new.student_email, '')) = lower(coalesce(old.student_email, ''))
      AND (
        new.approval_status IS DISTINCT FROM old.approval_status
        OR new.payment_status IS DISTINCT FROM old.payment_status
        OR new.assigned_user_id IS DISTINCT FROM old.assigned_user_id
        OR new.assigned_student_id IS DISTINCT FROM old.assigned_student_id
      );

    IF NOT v_is_legit_provisioning THEN
      RAISE EXCEPTION 'Consultation order cannot be replaced';
    END IF;
  END IF;
  RETURN new;
END
$$;

REVOKE ALL ON FUNCTION public.ktn_consultation_protect_order() FROM PUBLIC;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON FUNCTION public.ktn_consultation_protect_order() FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON FUNCTION public.ktn_consultation_protect_order() FROM authenticated;
  END IF;
END $$;

COMMIT;
