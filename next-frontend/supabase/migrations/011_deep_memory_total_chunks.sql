-- Cache total chunk count in deep_memory_settings to avoid DeepLake round-trips
ALTER TABLE public.deep_memory_settings
  ADD COLUMN total_chunks INT NOT NULL DEFAULT 0;
