-- Add last_scraped_at to channels for scrape-once caching
ALTER TABLE public.channels ADD COLUMN last_scraped_at TIMESTAMPTZ DEFAULT NULL;
