
CREATE POLICY "PDFs select por empresa" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'financial-pdfs' AND public.user_has_empresa_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "PDFs insert por empresa" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'financial-pdfs' AND public.user_has_empresa_access(((storage.foldername(name))[1])::uuid));
CREATE POLICY "PDFs delete por empresa" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'financial-pdfs' AND public.user_has_empresa_access(((storage.foldername(name))[1])::uuid));
