-- =====================================================
-- Migration: Tabela public.documents (versão robusta / idempotente)
--
-- Correções aplicadas (erro 42703 "library_id does not exist"):
--   1) Usa CREATE TABLE IF NOT EXISTS + ALTER TABLE ADD COLUMN IF NOT EXISTS
--      para todas as colunas (não quebra se tabela documents já existia com
--      menos colunas).
--   2) Garante coluna role em public.profiles (necessária para RLS).
--   3) Remove índices GIN (evita erro se pg_trgm não estiver ativo).
--   4) Validação prévia de FKs com tratamento de erro.
--
-- Uso: cole tudo no Supabase > SQL Editor e clique em RUN.
-- =====================================================

-- 1) Helper básico (updated_at)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- 2) Garante extensão pgcrypto (UUIDs) e que profiles tem coluna role
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN role TEXT NOT NULL DEFAULT 'viewer';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'org_id'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN org_id UUID NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'department'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN department TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'avatar_url'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN avatar_url TEXT NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'active'
  ) THEN
    ALTER TABLE public.profiles ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
END $$;

-- 3) Cria tabela documents se não existir
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 4) Garante TODAS as colunas da tabela documents (ADD COLUMN IF NOT EXISTS)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS org_id UUID NOT NULL DEFAULT (auth.uid())::UUID;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS library_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS code TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS project_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS discipline_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS area TEXT NOT NULL DEFAULT '';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS register_status TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS register_revision TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS description TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_path TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_name TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_size BIGINT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS next_review_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS received_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS analysis_days INTEGER NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS analysis_deadline TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS analysis_returned_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS sent_to_projetista_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS projetista_days INTEGER NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS projetista_deadline TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS responsible_name TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS responsible_sector TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS external_link TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS author_id UUID NOT NULL DEFAULT (auth.uid());
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS published_version_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS working_version_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS code_pattern_id UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS code_generation_mode TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS manual_code BOOLEAN NOT NULL DEFAULT FALSE;

-- 5) Constraint UNIQUE (org_id, code) — idempotente
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'documents' AND constraint_name = 'documents_code_org_uniq'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_code_org_uniq UNIQUE (org_id, code);
  END IF;
END $$;

-- 6) Índices B-tree (sem pg_trgm, funciona sempre)
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON public.documents (org_id);
CREATE INDEX IF NOT EXISTS documents_org_library_idx ON public.documents (org_id, library_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents (org_id, status);
CREATE INDEX IF NOT EXISTS documents_project_idx ON public.documents (project_id);
CREATE INDEX IF NOT EXISTS documents_author_idx ON public.documents (author_id);
CREATE INDEX IF NOT EXISTS documents_code_idx ON public.documents (code);
CREATE INDEX IF NOT EXISTS documents_title_idx ON public.documents (title);

-- 7) FKs (idempotentes, usa BEGIN ... EXCEPTION para não quebrar se profiles tiver tipo incompatível)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'documents' AND constraint_name = 'documents_author_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.documents
        ADD CONSTRAINT documents_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping FK documents_author_id_fkey: %', SQLERRM;
    END;
  END IF;
END $$;

-- 8) Trigger de updated_at
DROP TRIGGER IF EXISTS trg_documents_updated ON public.documents;
CREATE TRIGGER trg_documents_updated
BEFORE UPDATE ON public.documents
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9) Grants
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

-- 10) RLS + Policies
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- Helper: user é admin/manager?
CREATE OR REPLACE FUNCTION public.is_document_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _role TEXT;
  _has_legacy_admin BOOLEAN := FALSE;
BEGIN
  BEGIN
    SELECT role INTO _role FROM public.profiles WHERE id = _user_id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    _role := NULL;
  END;

  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id AND role IN ('admin','document_controller','coordinator')
    ) INTO _has_legacy_admin;
  EXCEPTION WHEN OTHERS THEN
    _has_legacy_admin := FALSE;
  END;

  RETURN COALESCE(_role IN ('admin','manager'), FALSE) OR _has_legacy_admin;
END;
$$;

-- RLS: leitura da mesma org
DROP POLICY IF EXISTS documents_read_org ON public.documents;
CREATE POLICY documents_read_org ON public.documents
  FOR SELECT
  TO authenticated
  USING (
    org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
    OR org_id IS NOT DISTINCT FROM auth.uid()
  );

-- RLS: escrita (autor ou gestor(a) da mesma org)
DROP POLICY IF EXISTS documents_write_own_or_admin ON public.documents;
CREATE POLICY documents_write_own_or_admin ON public.documents
  FOR ALL
  TO authenticated
  USING (
    (
      org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
      OR org_id IS NOT DISTINCT FROM auth.uid()
    )
    AND (author_id = auth.uid() OR public.is_document_manager(auth.uid()))
  )
  WITH CHECK (
    (
      org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
      OR org_id IS NOT DISTINCT FROM auth.uid()
    )
    AND (author_id = auth.uid() OR public.is_document_manager(auth.uid()))
  );

-- 11) Comentários
COMMENT ON TABLE public.documents IS 'Documentos cadastrados na org, com metadados de controle e ciclo de vida';
COMMENT ON COLUMN public.documents.external_link IS 'Link externo (Drive/Sharepoint/etc) para visualização do documento';
COMMENT ON COLUMN public.documents.status IS 'draft | in_review | pending_approval | published | archived | cancelled';
