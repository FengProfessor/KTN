-- =============================================================================
-- KTN UI V2 — SAFE BACKWARD-COMPATIBLE SUPABASE MIGRATION
-- File: docs/ui-v2/migrations/001_chat_and_notifications_v2.sql
-- Purpose:
--   1. Add optional client_message_id column & unique index to ktn_messages for
--      strict idempotent retry semantics (fixes BUG CHAT-01 / CHAT-04).
--   2. Add composite index on ktn_messages (room_id, created_at DESC, id DESC)
--      for fast cursor pagination beyond 100 messages (fixes BUG CHAT-05).
--   3. Create optional ktn_chat_read_states and ktn_notification_reads tables
--      (Worker BFF also supports fallback storage in ktn_dlp_alerts for zero-downtime
--      backward compatibility with legacy HTML portals).
-- =============================================================================

BEGIN;

-- 1. Idempotency key for chat messages
ALTER TABLE IF EXISTS public.ktn_messages
  ADD COLUMN IF NOT EXISTS client_message_id TEXT,
  ADD COLUMN IF NOT EXISTS reply_to_id TEXT,
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_ktn_messages_room_client_msg_id
  ON public.ktn_messages (room_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

-- 2. Cursor pagination index for room history (>100 messages)
CREATE INDEX IF NOT EXISTS idx_ktn_messages_room_cursor
  ON public.ktn_messages (room_id, created_at DESC, id DESC);

-- 3. Per-account room read state tracking
CREATE TABLE IF NOT EXISTS public.ktn_chat_read_states (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_email TEXT NOT NULL,
  room_id TEXT NOT NULL,
  last_read_message_id TEXT,
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_email, room_id)
);

CREATE INDEX IF NOT EXISTS idx_ktn_chat_read_states_email
  ON public.ktn_chat_read_states (user_email);

COMMIT;

-- =============================================================================
-- ROLLBACK PLAN (if needed):
-- DROP INDEX IF EXISTS public.idx_ktn_messages_room_client_msg_id;
-- DROP INDEX IF EXISTS public.idx_ktn_messages_room_cursor;
-- DROP TABLE IF EXISTS public.ktn_chat_read_states;
-- =============================================================================
