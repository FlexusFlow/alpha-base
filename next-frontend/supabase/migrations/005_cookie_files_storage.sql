-- Create private storage bucket for cookie files
INSERT INTO storage.buckets (id, name, public) VALUES ('cookie-files', 'cookie-files', false);

-- Storage policies scoped to user's own folder
CREATE POLICY "Users can upload cookie files" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can view own cookie files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "Users can delete own cookie files" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'cookie-files'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
