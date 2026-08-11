-- =========================================================
-- Migration: Setup Completo para Tabela documents (P-2 + P-18a + P-22)
--
-- Objetivo: quando a aplicação cria documento via "Novo Documento",
-- o registro tem que CAIR na tabela public.documents e aparecer na tela.
--
-- Pré-requisitos:
--   - Ter rodado a migration create_documents_table.sql antes (opcional,
--     pois tudo aqui é IF NOT EXISTS).
--   - Bucket "documents" criado em Storage (não dá pra fazer via SQL).
-- =========================================================
--
-- Como usar:
--   1) Vá no Supabase > SQL Editor > New query
--   2) Cole TODO esse arquivo (ele é grande, mas é tudo 1 script)
--   3) Clique em RUN
--   4) Depois volte na página /documentos, dê Ctrl+F5 e crie 1 documento.
--      Ele TEM que aparecer na tabela public.documents agora.
-- =========================================================

BEGIN;

-- 1) EXTENSÕES OBRIGATÓRIAS
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2) FUNÇÕES BASE (Atualizado set_updated_at + P2)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

-- ORGANIZATIONS
CREATE TABLE IF NOT EXISTS public.organizations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  sector       TEXT NOT NULL DEFAULT 'industrial',
  code_prefix  TEXT NOT NULL DEFAULT 'ORG',
  plan         TEXT NOT NULL DEFAULT 'pilot'
               CHECK (plan IN ('pilot', 'starter', 'professional', 'enterprise')),
  settings     JSONB NOT NULL DEFAULT '{}',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- PROFILES (tabela já existia, só adicionar colunas faltantes)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN full_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check') THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin','manager','approver','reviewer','author','viewer'));
  END IF;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3) HELPERS DE RLS (functions current_user_org_id e is_org_role)
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_role(_roles TEXT[])
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND org_id IS NOT NULL
      AND role = ANY(_roles)
  )
$$;

-- Policies ORGANIZATIONS
DROP POLICY IF EXISTS "org_select_own" ON public.organizations;
DROP POLICY IF EXISTS "org_update_admin" ON public.organizations;
CREATE POLICY "org_select_own" ON public.organizations FOR SELECT
  USING (id = public.current_user_org_id());
CREATE POLICY "org_update_admin" ON public.organizations FOR UPDATE
  USING (id = public.current_user_org_id() AND public.current_user_role() = 'admin')
  WITH CHECK (id = public.current_user_org_id() AND public.current_user_role() = 'admin');

-- Policies PROFILES
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_same_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin_manager" ON public.profiles;

CREATE POLICY "profiles_select_same_org" ON public.profiles FOR SELECT
  USING (org_id = public.current_user_org_id());
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND org_id = public.current_user_org_id());
CREATE POLICY "profiles_insert_admin_manager" ON public.profiles FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin','manager'])
  );

-- Trigger handle_new_user seguro (não quebra se profiles for diferente)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN RETURN NEW; END;
$$;

-- Triggers updated_at
DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 4) TABELA public.documents + TODAS as colunas usadas no código
CREATE TABLE IF NOT EXISTS public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

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
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS code_generation_mode TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS manual_code BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS external_code TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS created_by UUID NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS confidentiality TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS external_reference TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS source_system TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}'::TEXT[];
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::JSONB;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS file_hash TEXT NULL;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS review_period_months INTEGER NULL;

-- UNIQUE constraints + checks (idempotentes)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_schema = 'public' AND table_name = 'documents' AND constraint_name = 'documents_code_org_uniq'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_code_org_uniq UNIQUE (org_id, code);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documents'::REGCLASS AND conname = 'documents_code_generation_mode_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_code_generation_mode_check
      CHECK (code_generation_mode IN ('legacy','automatic','configured','selected_pattern','manual','local_fallback','configured_reconciled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documents'::REGCLASS AND conname = 'documents_external_code_not_blank_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_external_code_not_blank_check
      CHECK (external_code IS NULL OR LENGTH(BTRIM(external_code)) > 0);
  END IF;
END;
$$;

-- FKs (se existir tabela correspondente)
DO $$
BEGIN
  IF to_regclass('public.libraries') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documents'::REGCLASS AND conname = 'documents_library_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_library_id_fkey
      FOREIGN KEY (library_id) REFERENCES public.libraries(id) ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documents'::REGCLASS AND conname = 'documents_author_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.documents
        ADD CONSTRAINT documents_author_id_fkey
        FOREIGN KEY (author_id) REFERENCES public.profiles(id) ON DELETE RESTRICT;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping documents_author_id_fkey: %', SQLERRM;
    END;
  END IF;

  IF to_regclass('public.document_code_patterns') IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conrelid = 'public.documents'::REGCLASS AND conname = 'documents_code_pattern_id_fkey'
  ) THEN
    BEGIN
      ALTER TABLE public.documents
        ADD CONSTRAINT documents_code_pattern_id_fkey
        FOREIGN KEY (code_pattern_id) REFERENCES public.document_code_patterns(id) ON DELETE SET NULL NOT VALID;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Skipping documents_code_pattern_id_fkey: %', SQLERRM;
    END;
  END IF;
END;
$$;

-- Índices
CREATE INDEX IF NOT EXISTS documents_org_id_idx ON public.documents (org_id);
CREATE INDEX IF NOT EXISTS documents_org_library_idx ON public.documents (org_id, library_id);
CREATE INDEX IF NOT EXISTS documents_status_idx ON public.documents (org_id, status);
CREATE INDEX IF NOT EXISTS documents_project_idx ON public.documents (project_id);
CREATE INDEX IF NOT EXISTS documents_author_idx ON public.documents (author_id);
CREATE INDEX IF NOT EXISTS documents_code_idx ON public.documents (code);
CREATE INDEX IF NOT EXISTS documents_title_idx ON public.documents (title);
CREATE INDEX IF NOT EXISTS idx_documents_org_code_pattern ON public.documents (org_id, code_pattern_id) WHERE code_pattern_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_documents_org_code_generation_mode ON public.documents (org_id, code_generation_mode);
CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_external_code_unique ON public.documents (org_id, external_code)
  WHERE external_code IS NOT NULL AND BTRIM(external_code) <> '';

-- Trigger updated_at
DROP TRIGGER IF EXISTS trg_documents_updated ON public.documents;
CREATE TRIGGER trg_documents_updated
  BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 5) GRANTS + RLS de documents (ESSENCIAL — sem isso INSERT/UPDATE falha)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_document_manager(_user_id UUID)
RETURNS BOOLEAN LANGUAGE plpgsql STABLE SET search_path = public AS $$
DECLARE
  _role TEXT;
  _has_legacy_admin BOOLEAN := FALSE;
BEGIN
  BEGIN SELECT role INTO _role FROM public.profiles WHERE id = _user_id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN _role := NULL; END;

  BEGIN SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role IN ('admin','document_controller','coordinator')
  ) INTO _has_legacy_admin;
  EXCEPTION WHEN OTHERS THEN _has_legacy_admin := FALSE; END;

  RETURN COALESCE(_role IN ('admin','manager'), FALSE) OR _has_legacy_admin OR public.is_org_role(ARRAY['admin','manager']);
END;
$$;

DROP POLICY IF EXISTS documents_read_org ON public.documents;
CREATE POLICY documents_read_org ON public.documents FOR SELECT TO authenticated
  USING (
    org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
    OR org_id IS NOT DISTINCT FROM auth.uid()
    OR org_id = public.current_user_org_id()
  );

DROP POLICY IF EXISTS documents_write_own_or_admin ON public.documents;
CREATE POLICY documents_write_own_or_admin ON public.documents FOR ALL TO authenticated
  USING (
    (
      org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
      OR org_id IS NOT DISTINCT FROM auth.uid()
      OR org_id = public.current_user_org_id()
    )
    AND (author_id = auth.uid() OR public.is_document_manager(auth.uid()))
  )
  WITH CHECK (
    (
      org_id = (SELECT COALESCE(p.org_id, auth.uid()) FROM public.profiles p WHERE p.id = auth.uid())
      OR org_id IS NOT DISTINCT FROM auth.uid()
      OR org_id = public.current_user_org_id()
    )
    AND (author_id = auth.uid() OR public.is_document_manager(auth.uid()))
  );

-- 6) FUNÇÕES P-18a (allocate_document_code_automatic + assign_manual_document_code)
--    + allocate_document_code (fallback leve) para não dar erro.
DROP FUNCTION IF EXISTS public.normalize_document_code_token(text);
CREATE OR REPLACE FUNCTION public.normalize_document_code_token(p_token TEXT)
RETURNS TEXT LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
BEGIN
  RETURN UPPER(BTRIM(COALESCE(p_token, '')));
END;
$$;

DROP FUNCTION IF EXISTS public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE);
CREATE OR REPLACE FUNCTION public.allocate_document_code(
  p_document_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_prefix TEXT;
  v_year_seq INTEGER;
  v_code TEXT;
  v_area_tok TEXT := public.normalize_document_code_token(p_area);
  v_type_tok TEXT := public.normalize_document_code_token(p_doc_type);
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário e organização são obrigatórios para alocar código.';
  END IF;

  SELECT COALESCE(code_prefix, 'ORG') INTO v_prefix
  FROM public.organizations
  WHERE id = v_org_id LIMIT 1;

  v_prefix := UPPER(BTRIM(COALESCE(v_prefix, 'ORG')));
  IF v_area_tok = '' THEN v_area_tok := 'GERAL'; END IF;
  IF v_type_tok = '' THEN v_type_tok := 'DOC'; END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org_id::TEXT || ':allocate-code', 0));

  SELECT COALESCE(MAX(CASE
      WHEN code ~ ('^' || v_prefix || '-' || v_area_tok || '-' || v_type_tok || '-[0-9]{2}/[0-9]{4}$')
      THEN SUBSTRING(code FROM '([0-9]{2})/[0-9]{4}$')::INTEGER
      ELSE 0 END), 0) + 1
    INTO v_year_seq
  FROM public.documents
  WHERE org_id = v_org_id;

  v_code := FORMAT('%s-%s-%s-%02d/%s',
    v_prefix, v_area_tok, v_type_tok,
    LEAST(v_year_seq, 99),
    TO_CHAR(p_reference_date, 'YYYY'));

  IF EXISTS (SELECT 1 FROM public.documents WHERE org_id = v_org_id AND code = v_code) THEN
    v_code := v_code || '-' || REPLACE(gen_random_uuid()::TEXT, '-', '')::VARCHAR(4);
  END IF;

  UPDATE public.documents SET code = v_code, manual_code = false WHERE id = p_document_id AND org_id = v_org_id;
  RETURN jsonb_build_object('success', true, 'code', v_code, 'pattern_id', NULL, 'mode', 'legacy');
END;
$$;

DROP FUNCTION IF EXISTS public.allocate_document_code_automatic(UUID, TEXT, TEXT, UUID, DATE);
CREATE OR REPLACE FUNCTION public.allocate_document_code_automatic(
  p_document_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário e organização são obrigatórios para alocar o código.';
  END IF;

  v_result := public.allocate_document_code(p_document_id, p_doc_type, p_area, p_project_id, p_reference_date);

  IF COALESCE((v_result->>'success')::BOOLEAN, false) THEN
    UPDATE public.documents SET
      code_pattern_id = NULL,
      code_generation_mode = 'legacy',
      manual_code = false,
      external_code = NULL
    WHERE id = p_document_id AND org_id = v_org_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'selection_mode', 'automatic',
    'recorded_generation_mode', 'legacy'
  );
END;
$$;

DROP FUNCTION IF EXISTS public.assign_manual_document_code(UUID, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.assign_manual_document_code(
  p_document_id UUID,
  p_code TEXT,
  p_reason TEXT
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_code TEXT := NULLIF(BTRIM(p_code), '');
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário e organização são obrigatórios para definir código manual.';
  END IF;
  IF v_code IS NULL OR LENGTH(v_code) > 160 OR v_code ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe um código manual válido com até 160 caracteres e sem caracteres de controle.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe o motivo para usar código manual ou legado.';
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.documents WHERE id = p_document_id AND org_id = v_org_id) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Documento não encontrado na organização atual.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_org_id::TEXT || ':manual-code:' || UPPER(v_code), 0));
  IF EXISTS (SELECT 1 FROM public.documents WHERE org_id = v_org_id AND UPPER(code) = UPPER(v_code) AND id <> p_document_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23505', MESSAGE = 'Este código já está sendo usado por outro documento da organização.';
  END IF;

  UPDATE public.documents SET
    code = v_code,
    external_code = v_code,
    manual_code = true,
    code_pattern_id = NULL,
    code_generation_mode = 'manual'
  WHERE id = p_document_id AND org_id = v_org_id;

  RETURN jsonb_build_object(
    'success', true, 'mode', 'manual',
    'code', v_code, 'pattern_id', NULL
  );
END;
$$;

-- Permissões para P-18a
REVOKE ALL ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.allocate_document_code_automatic(UUID, TEXT, TEXT, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code_automatic(UUID, TEXT, TEXT, UUID, DATE) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.assign_manual_document_code(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_manual_document_code(UUID, TEXT, TEXT) TO authenticated, service_role;

-- 7) FUNÇÃO PRINCIPAL — create_document_transactional (Ciclo P22)
--    O app CHAMA ESSA RPC PRIMEIRO. Ela que faz o INSERT real em public.documents.
DROP FUNCTION IF EXISTS public.document_creation_column_exists(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.document_creation_column_exists(
  p_table_name TEXT, p_column_name TEXT
)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = p_table_name AND column_name = p_column_name
  );
$$;

DROP FUNCTION IF EXISTS public.create_document_transactional(
  TEXT,TEXT,TEXT,TEXT,UUID,UUID,INTEGER,INTEGER,DATE,TEXT,TEXT,TEXT,TEXT[],JSONB,TEXT,UUID,TEXT,TEXT,JSONB
);
CREATE OR REPLACE FUNCTION public.create_document_transactional(
  p_title TEXT,
  p_description TEXT,
  p_doc_type TEXT,
  p_area TEXT,
  p_library_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_revision INTEGER DEFAULT 0,
  p_review_period_months INTEGER DEFAULT NULL,
  p_next_review_at DATE DEFAULT NULL,
  p_confidentiality TEXT DEFAULT NULL,
  p_external_reference TEXT DEFAULT NULL,
  p_source_system TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_file_metadata JSONB DEFAULT NULL,
  p_code_mode TEXT DEFAULT 'automatic',
  p_code_pattern_id UUID DEFAULT NULL,
  p_manual_code TEXT DEFAULT NULL,
  p_manual_code_reason TEXT DEFAULT NULL,
  p_creation_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_document_id UUID;
  v_code TEXT;
  v_code_mode TEXT := LOWER(COALESCE(NULLIF(BTRIM(p_code_mode), ''), 'automatic'));
  v_warnings JSONB := '[]'::JSONB;
  v_file_path TEXT;
  v_file_name TEXT;
  v_file_size BIGINT;
  v_file_hash TEXT;
  v_insert_columns TEXT;
  v_insert_values TEXT;
  v_payload JSONB;
  v_sql TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Usuário autenticado é obrigatório para criar documento.';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'O usuário não possui organização válida para criar documento.';
  END IF;
  IF NOT public.is_org_role(ARRAY['admin','manager','approver','reviewer','author','viewer']) THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'Seu perfil não possui permissão para criar documentos.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe o título do documento.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_doc_type, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe o tipo documental.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_area, '')), '') IS NULL THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Informe a área do documento.';
  END IF;
  IF p_revision IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'A revisão inicial de um novo documento deve ser 0.';
  END IF;
  IF p_review_period_months IS NOT NULL AND (p_review_period_months < 1 OR p_review_period_months > 120) THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'O período de revisão deve estar entre 1 e 120 meses.';
  END IF;
  IF v_code_mode NOT IN ('automatic','selected_pattern','manual') THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Modo de codificação inválido.';
  END IF;

  -- Arquivo enviado
  IF p_file_metadata IS NOT NULL THEN
    IF jsonb_typeof(p_file_metadata) <> 'object' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Os metadados do arquivo devem ser um objeto JSON válido.';
    END IF;
    v_file_path := NULLIF(BTRIM(p_file_metadata->>'file_path'), '');
    v_file_name := NULLIF(BTRIM(p_file_metadata->>'file_name'), '');
    v_file_hash := NULLIF(BTRIM(p_file_metadata->>'file_hash'), '');
    IF v_file_path IS NULL OR v_file_name IS NULL OR LEFT(v_file_path,1) = '/' THEN
      RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'Caminho ou nome de arquivo inválido.';
    END IF;
    IF NULLIF(BTRIM(p_file_metadata->>'file_size'), '') IS NOT NULL THEN
      BEGIN v_file_size := (p_file_metadata->>'file_size')::BIGINT;
      EXCEPTION WHEN OTHERS THEN v_file_size := NULL; END;
    END IF;
  END IF;

  -- Monta o payload (só com colunas que existem hoje, evitando erro 42703)
  v_payload := jsonb_strip_nulls(jsonb_build_object(
    'org_id', v_org_id,
    'library_id', p_library_id,
    'title', BTRIM(p_title),
    'description', NULLIF(BTRIM(COALESCE(p_description,'')), ''),
    'doc_type', UPPER(BTRIM(p_doc_type)),
    'area', UPPER(BTRIM(p_area)),
    'project_id', p_project_id,
    'status', 'draft',
    'revision', p_revision,
    'author_id', v_actor_id,
    'created_by', v_actor_id,
    'review_period_months', p_review_period_months,
    'next_review_at', p_next_review_at,
    'confidentiality', NULLIF(BTRIM(COALESCE(p_confidentiality,'')), ''),
    'external_reference', NULLIF(BTRIM(COALESCE(p_external_reference,'')), ''),
    'source_system', NULLIF(BTRIM(COALESCE(p_source_system,'')), ''),
    'tags', to_jsonb(COALESCE(p_tags, '{}'::TEXT[])),
    'metadata', COALESCE(p_creation_metadata, '{}'::JSONB),
    'file_path', v_file_path,
    'file_name', v_file_name,
    'file_size', v_file_size,
    'file_hash', v_file_hash
  ));

  SELECT
    STRING_AGG(FORMAT('%I', payload_key), ', ' ORDER BY payload_key),
    STRING_AGG(FORMAT('populated.%I', payload_key), ', ' ORDER BY payload_key)
  INTO v_insert_columns, v_insert_values
  FROM jsonb_object_keys(v_payload) AS payload(payload_key)
  JOIN information_schema.columns AS cols
    ON cols.table_schema = 'public'
   AND cols.table_name = 'documents'
   AND cols.column_name = payload.payload_key;

  IF COALESCE(v_insert_columns, '') = '' THEN
    RAISE EXCEPTION USING ERRCODE = '55000', MESSAGE = 'A tabela public.documents não tem colunas compatíveis. Rode a migration completa.';
  END IF;

  v_sql := FORMAT(
    'INSERT INTO public.documents (%s)
     SELECT %s
     FROM jsonb_populate_record(NULL::public.documents, $1) AS populated
     RETURNING id, COALESCE(code, ''''::TEXT)',
    v_insert_columns, v_insert_values
  );

  EXECUTE v_sql INTO v_document_id, v_code USING v_payload;

  -- Codificação (depois do INSERT)
  IF v_code_mode = 'manual' THEN
    DECLARE
      _r JSONB;
    BEGIN
      _r := public.assign_manual_document_code(v_document_id, p_manual_code, p_manual_code_reason);
      v_code := COALESCE(_r->>'code', v_code);
    EXCEPTION WHEN OTHERS THEN
      v_warnings := v_warnings || jsonb_build_array(
        'Criação concluída, mas a codificação manual falhou: ' || SQLERRM
      );
    END;
  ELSIF v_code_mode = 'automatic' OR (v_code_mode = 'selected_pattern' AND p_code_pattern_id IS NULL) THEN
    DECLARE
      _r JSONB;
    BEGIN
      _r := public.allocate_document_code_automatic(v_document_id, p_doc_type, p_area, p_project_id, CURRENT_DATE);
      IF COALESCE((_r->>'success')::BOOLEAN, false) THEN
        v_code := COALESCE(_r->>'code', v_code);
      ELSE
        v_warnings := v_warnings || jsonb_build_array('Código não alocado automaticamente. Atribua manualmente depois.');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_warnings := v_warnings || jsonb_build_array('Falha na alocação automática de código: ' || SQLERRM);
    END;
  ELSIF v_code_mode = 'selected_pattern' AND p_code_pattern_id IS NOT NULL THEN
    -- Em setup simples, o selected_pattern cai no allocate automatic.
    DECLARE
      _r JSONB;
    BEGIN
      _r := public.allocate_document_code_automatic(v_document_id, p_doc_type, p_area, p_project_id, CURRENT_DATE);
      IF COALESCE((_r->>'success')::BOOLEAN, false) THEN
        v_code := COALESCE(_r->>'code', v_code);
        UPDATE public.documents SET
          code_pattern_id = p_code_pattern_id,
          code_generation_mode = 'selected_pattern'
        WHERE id = v_document_id;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END IF;

  -- Atualiza o code final na linha (se ficou em branco)
  IF NULLIF(BTRIM(v_code), '') IS NULL THEN
    SELECT code INTO v_code FROM public.documents WHERE id = v_document_id LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'document_id', v_document_id,
    'code', v_code,
    'warnings', v_warnings
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_document_transactional(
  TEXT,TEXT,TEXT,TEXT,UUID,UUID,INTEGER,INTEGER,DATE,TEXT,TEXT,TEXT,TEXT[],JSONB,TEXT,UUID,TEXT,TEXT,JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_document_transactional(
  TEXT,TEXT,TEXT,TEXT,UUID,UUID,INTEGER,INTEGER,DATE,TEXT,TEXT,TEXT,TEXT[],JSONB,TEXT,UUID,TEXT,TEXT,JSONB
) TO authenticated, service_role;

-- 8) Notifica o PostgREST para recarregar schema (importante)
NOTIFY pgrst, 'reload schema';

COMMIT;
