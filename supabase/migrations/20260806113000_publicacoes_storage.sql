BEGIN;

INSERT INTO storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
VALUES (
  'publicacoes',
  'publicacoes',
  TRUE,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "publicacoes_storage_insert_admin" ON storage.objects;
DROP POLICY IF EXISTS "publicacoes_storage_update_admin" ON storage.objects;
DROP POLICY IF EXISTS "publicacoes_storage_delete_admin" ON storage.objects;

CREATE POLICY "publicacoes_storage_insert_admin"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'publicacoes'
    AND public.is_org_role(ARRAY['admin'])
    AND (storage.foldername(name))[1] = public.current_user_org_id()::TEXT
  );

CREATE POLICY "publicacoes_storage_update_admin"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'publicacoes'
    AND public.is_org_role(ARRAY['admin'])
    AND (storage.foldername(name))[1] = public.current_user_org_id()::TEXT
  )
  WITH CHECK (
    bucket_id = 'publicacoes'
    AND public.is_org_role(ARRAY['admin'])
    AND (storage.foldername(name))[1] = public.current_user_org_id()::TEXT
  );

CREATE POLICY "publicacoes_storage_delete_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'publicacoes'
    AND public.is_org_role(ARRAY['admin'])
    AND (storage.foldername(name))[1] = public.current_user_org_id()::TEXT
  );

COMMIT;
