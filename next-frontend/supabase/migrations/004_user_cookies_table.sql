-- Create user_cookies table for cookie file metadata
CREATE TABLE public.user_cookies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  domain TEXT NOT NULL,
  filename TEXT NOT NULL,
  file_path TEXT NOT NULL,
  earliest_expiry TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (user_id, domain)
);

ALTER TABLE public.user_cookies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own cookies" ON public.user_cookies
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own cookies" ON public.user_cookies
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own cookies" ON public.user_cookies
  FOR DELETE USING (auth.uid() = user_id);
