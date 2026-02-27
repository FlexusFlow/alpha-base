-- Documentation collections table
CREATE TABLE public.doc_collections (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  entry_url TEXT NOT NULL,
  site_name TEXT,
  scope_path TEXT NOT NULL,
  total_pages INTEGER NOT NULL DEFAULT 0,
  successful_pages INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'discovering' CHECK (status IN ('discovering', 'pending_confirmation', 'scraping', 'completed', 'partial', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.doc_collections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own doc_collections" ON public.doc_collections FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own doc_collections" ON public.doc_collections FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own doc_collections" ON public.doc_collections FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own doc_collections" ON public.doc_collections FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_doc_collections_user_id ON public.doc_collections(user_id, created_at DESC);
CREATE INDEX idx_doc_collections_status ON public.doc_collections(user_id, status);

-- Documentation pages table
CREATE TABLE public.doc_pages (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  collection_id UUID REFERENCES public.doc_collections(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  page_url TEXT NOT NULL,
  title TEXT,
  content_markdown TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'scraping', 'completed', 'failed')),
  error_message TEXT,
  is_truncated BOOLEAN NOT NULL DEFAULT false,
  display_order INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

ALTER TABLE public.doc_pages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own doc_pages" ON public.doc_pages FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own doc_pages" ON public.doc_pages FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own doc_pages" ON public.doc_pages FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own doc_pages" ON public.doc_pages FOR DELETE USING (auth.uid() = user_id);

CREATE INDEX idx_doc_pages_collection ON public.doc_pages(collection_id, display_order);
CREATE INDEX idx_doc_pages_status ON public.doc_pages(collection_id, status);

-- Auto-update updated_at trigger for doc_collections
CREATE OR REPLACE FUNCTION public.update_doc_collections_updated_at()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER doc_collections_updated_at
  BEFORE UPDATE ON public.doc_collections
  FOR EACH ROW
  EXECUTE FUNCTION public.update_doc_collections_updated_at();
