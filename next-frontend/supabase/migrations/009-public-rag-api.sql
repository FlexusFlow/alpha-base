-- ZIP-006: Public RAG API — Supabase migrations
-- Run in Supabase SQL editor

-- ============================================
-- Table: api_keys
-- ============================================
CREATE TABLE public.api_keys (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  key_hash     TEXT NOT NULL UNIQUE,
  key_prefix   TEXT NOT NULL,
  name         TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  last_used_at TIMESTAMPTZ,
  is_active    BOOLEAN DEFAULT TRUE,

  CONSTRAINT api_keys_name_length CHECK (char_length(name) <= 100)
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_keys_select" ON public.api_keys
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "own_keys_insert" ON public.api_keys
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own_keys_update" ON public.api_keys
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "own_keys_delete" ON public.api_keys
  FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_api_keys_hash ON public.api_keys(key_hash);
CREATE INDEX idx_api_keys_user_active ON public.api_keys(user_id, is_active);


-- ============================================
-- Table: api_usage_logs
-- ============================================
CREATE TABLE public.api_usage_logs (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  api_key_id   UUID REFERENCES public.api_keys(id) ON DELETE SET NULL,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  endpoint     TEXT NOT NULL,
  status_code  INT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.api_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_logs_select" ON public.api_usage_logs
  FOR SELECT USING (auth.uid() = user_id);

CREATE INDEX idx_usage_logs_key_ts ON public.api_usage_logs(api_key_id, created_at);
CREATE INDEX idx_usage_logs_user_ts ON public.api_usage_logs(user_id, created_at);
