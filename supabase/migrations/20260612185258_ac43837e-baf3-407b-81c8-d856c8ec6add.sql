
-- Fix search_path on functions
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Storage policies for documents bucket
CREATE POLICY "doc_files_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "doc_files_insert" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'documents');
CREATE POLICY "doc_files_update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'documents');
CREATE POLICY "doc_files_delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'documents' AND (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller')));
