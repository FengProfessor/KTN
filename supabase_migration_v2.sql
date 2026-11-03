-- ============================================================================
-- KHỔNG TỬ NHÍ — MIGRATION V2 (NÂNG CẤP AN TOÀN TỪ DATABASE CŨ)
-- ============================================================================
-- Chạy trong Supabase SQL Editor cho các dự án đã tạo bảng từ phiên bản V1.
-- Không xóa dữ liệu cũ, tự động bổ sung cột attachments, trạng thái revision_requested
-- và bảng ktn_class_sessions.
-- ============================================================================

ALTER TABLE public.ktn_homeworks
  ADD COLUMN IF NOT EXISTS attachments JSONB NOT NULL DEFAULT '[]'::jsonb;

UPDATE public.ktn_homeworks
  SET status = 'revision_requested'
  WHERE status = 'needs_revision';

ALTER TABLE public.ktn_homeworks
  DROP CONSTRAINT IF EXISTS ktn_homeworks_status_check;

ALTER TABLE public.ktn_homeworks
  ADD CONSTRAINT ktn_homeworks_status_check
  CHECK (status IN ('pending', 'graded', 'revision_requested'));

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

CREATE INDEX IF NOT EXISTS idx_ktn_class_sessions_class
  ON public.ktn_class_sessions (class_code, session_num ASC);

INSERT INTO public.ktn_students (code, email, name, class_code, has_live_class, has_online_courses, online_courses)
VALUES
  ('KTN-2026-090', 'dachanh@khongtunhi.com', 'Bé Đắc Hanh', 'YCT2-04', TRUE, FALSE, '[]'::jsonb),
  ('KTN-2026-091', 'anman@khongtunhi.com', 'Bé An Mẫn', 'YCT2-04', TRUE, FALSE, '[]'::jsonb),
  ('KTN-2026-095', 'baochau@khongtunhi.com', 'Bé Bảo Châu', 'YCT3-02', TRUE, TRUE, '[{"id":"6adadba969897b0002482ca5","title":"HSK1 3.0"}]'::jsonb),
  ('KTN-2026-096', 'giabao@khongtunhi.com', 'Bé Gia Bảo', 'YCT2-04', TRUE, FALSE, '[]'::jsonb)
ON CONFLICT (code) DO UPDATE SET
  class_code = EXCLUDED.class_code,
  has_live_class = EXCLUDED.has_live_class;

