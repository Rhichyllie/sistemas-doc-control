-- TRAMITA P-29
-- Publicações editoriais da organização para a home de bibliotecas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.publicacoes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  titulo TEXT NOT NULL,
  categoria TEXT NOT NULL
    CHECK (categoria IN ('procedimento', 'manual', 'seguranca_saude', 'comunicado')),
  imagem_url TEXT,
  resumo TEXT,
  documento_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  data_publicacao TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  autor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_publicacoes_org_data_publicacao
  ON public.publicacoes(org_id, data_publicacao DESC);

CREATE INDEX IF NOT EXISTS idx_publicacoes_org_categoria
  ON public.publicacoes(org_id, categoria);

CREATE INDEX IF NOT EXISTS idx_publicacoes_documento_id
  ON public.publicacoes(documento_id);

ALTER TABLE public.publicacoes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "publicacoes_select_same_org" ON public.publicacoes;
DROP POLICY IF EXISTS "publicacoes_insert_admin" ON public.publicacoes;
DROP POLICY IF EXISTS "publicacoes_update_admin" ON public.publicacoes;
DROP POLICY IF EXISTS "publicacoes_delete_admin" ON public.publicacoes;

CREATE POLICY "publicacoes_select_same_org"
  ON public.publicacoes FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "publicacoes_insert_admin"
  ON public.publicacoes FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin'])
  );

CREATE POLICY "publicacoes_update_admin"
  ON public.publicacoes FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin'])
  );

CREATE POLICY "publicacoes_delete_admin"
  ON public.publicacoes FOR DELETE
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin'])
  );

DROP TRIGGER IF EXISTS publicacoes_updated_at ON public.publicacoes;
CREATE TRIGGER publicacoes_updated_at
  BEFORE UPDATE ON public.publicacoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

COMMIT;
