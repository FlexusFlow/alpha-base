-- Articles table
CREATE TABLE public.articles (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  url TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  summary TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scraping', 'completed', 'failed')),
  error_message TEXT,
  is_truncated BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own articles" ON public.articles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own articles" ON public.articles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own articles" ON public.articles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own articles" ON public.articles FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_articles_user_id ON public.articles(user_id, created_at DESC);
CREATE INDEX idx_articles_status ON public.articles(user_id, status);

-- Article chat messages table
CREATE TABLE public.article_chat_messages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  article_id UUID REFERENCES public.articles(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.article_chat_messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view article messages" ON public.article_chat_messages FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.articles WHERE id = article_id AND user_id = auth.uid()));
CREATE POLICY "Users can insert article messages" ON public.article_chat_messages FOR INSERT
  WITH CHECK (EXISTS (SELECT 1 FROM public.articles WHERE id = article_id AND user_id = auth.uid()));
CREATE POLICY "Users can delete article messages" ON public.article_chat_messages FOR DELETE
  USING (EXISTS (SELECT 1 FROM public.articles WHERE id = article_id AND user_id = auth.uid()));

CREATE INDEX idx_article_chat_messages_article ON public.article_chat_messages(article_id, created_at ASC);
