-- Deep Memory training runs
CREATE TABLE public.deep_memory_training_runs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  status TEXT NOT NULL DEFAULT 'generating' CHECK (status IN ('generating', 'generated', 'training', 'completed', 'failed')),
  total_chunks INT NOT NULL DEFAULT 0,
  processed_chunks INT NOT NULL DEFAULT 0,
  pair_count INT NOT NULL DEFAULT 0,
  deeplake_job_id TEXT,
  metrics JSONB DEFAULT '{}',
  error_message TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deep_memory_training_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own training runs" ON public.deep_memory_training_runs FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own training runs" ON public.deep_memory_training_runs FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own training runs" ON public.deep_memory_training_runs FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own training runs" ON public.deep_memory_training_runs FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_training_runs_user_status ON public.deep_memory_training_runs(user_id, status);

-- Deep Memory training pairs
CREATE TABLE public.deep_memory_training_pairs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  training_run_id UUID REFERENCES public.deep_memory_training_runs(id) ON DELETE CASCADE NOT NULL,
  question_text TEXT NOT NULL,
  chunk_id TEXT NOT NULL,
  chunk_preview TEXT,
  relevance_score FLOAT NOT NULL DEFAULT 1.0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deep_memory_training_pairs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view training pairs via run ownership" ON public.deep_memory_training_pairs FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.deep_memory_training_runs WHERE id = training_run_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert training pairs via run ownership" ON public.deep_memory_training_pairs FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.deep_memory_training_runs WHERE id = training_run_id AND user_id = auth.uid()));
CREATE POLICY "Users can update training pairs via run ownership" ON public.deep_memory_training_pairs FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.deep_memory_training_runs WHERE id = training_run_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete training pairs via run ownership" ON public.deep_memory_training_pairs FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.deep_memory_training_runs WHERE id = training_run_id AND user_id = auth.uid()));

CREATE INDEX idx_training_pairs_run_id ON public.deep_memory_training_pairs(training_run_id);

-- Deep Memory settings (one row per user)
CREATE TABLE public.deep_memory_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  last_trained_at TIMESTAMPTZ,
  last_training_run_id UUID REFERENCES public.deep_memory_training_runs(id),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.deep_memory_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own settings" ON public.deep_memory_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own settings" ON public.deep_memory_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own settings" ON public.deep_memory_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own settings" ON public.deep_memory_settings FOR DELETE USING (auth.uid() = user_id);
