-- Add cookie failure tracking columns to user_cookies
ALTER TABLE public.user_cookies
  ADD COLUMN status TEXT DEFAULT NULL CHECK (status IS NULL OR status = 'failed'),
  ADD COLUMN failed_at TIMESTAMPTZ DEFAULT NULL,
  ADD COLUMN failure_reason TEXT DEFAULT NULL;

-- Add UPDATE RLS policy (existing policies cover SELECT, INSERT, DELETE)
CREATE POLICY "Users can update own cookies"
  ON public.user_cookies
  FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
