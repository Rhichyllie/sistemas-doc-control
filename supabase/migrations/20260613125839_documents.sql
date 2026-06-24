-- TRAMITA P-2 — Enterprise documents and immutable versions

-- ── DOCUMENTS ──────────────────────────────────────────────
-- The baseline migration already creates public.documents; extend and reshape it.
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS file_path TEXT,
  ADD COLUMN IF NOT EXISTS file_name TEXT,
  ADD COLUMN IF NOT EXISTS file_size INTEGER,
  ADD COLUMN IF NOT EXISTS file_hash TEXT,
  ADD COLUMN IF NOT EXISTS next_review_at DATE,
  ADD COLUMN IF NOT EXISTS review_period_months INTEGER NOT NULL DEFAULT 24,
  ADD COLUMN IF NOT EXISTS author_id UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS obsoleted_at TIMESTAMPTZ;

ALTER TABLE public.documents
  ALTER COLUMN code DROP NOT NULL,
  ALTER COLUMN project_id DROP NOT NULL,
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE TEXT USING status::TEXT,
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN doc_type SET NOT NULL,
  ALTER COLUMN area SET NOT NULL,
  ALTER COLUMN org_id SET NOT NULL,
  ALTER COLUMN author_id SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_doc_type_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_doc_type_check
      CHECK (doc_type IN ('PRO','IT','ET','DRW','RNC','PLN','REG','MAN'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_enterprise_status_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_enterprise_status_check
      CHECK (status IN ('draft','in_review','pending_approval','published','obsolete'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'documents_org_code_key'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_org_code_key UNIQUE (org_id, code);
  END IF;
END;
$$;

ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;

-- ── DOCUMENT VERSIONS ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_versions (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  revision        INTEGER NOT NULL,
  file_path       TEXT NOT NULL,
  file_name       TEXT NOT NULL,
  file_size       INTEGER,
  file_hash       TEXT,
  change_summary  TEXT,
  uploaded_by     UUID NOT NULL REFERENCES public.profiles(id),
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(document_id, revision)
);

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

-- ── AUTO DOCUMENT CODE TRIGGER ─────────────────────────────
CREATE OR REPLACE FUNCTION public.generate_document_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_seq    INTEGER;
  v_code   TEXT;
BEGIN
  IF NEW.code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT code_prefix INTO v_prefix
  FROM public.organizations
  WHERE id = NEW.org_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Cannot generate document code: organization % was not found', NEW.org_id;
  END IF;

  SELECT COALESCE(MAX(CAST(SPLIT_PART(code, '-', 4) AS INTEGER)), 0) + 1
  INTO v_seq
  FROM public.documents
  WHERE org_id = NEW.org_id
    AND area = NEW.area
    AND doc_type = NEW.doc_type
    AND code IS NOT NULL
    AND code ~ '^\\w+-\\w+-\\w+-\\d+$';

  v_code := v_prefix || '-' || NEW.area || '-' || NEW.doc_type || '-' || LPAD(v_seq::TEXT, 4, '0');

  NEW.code := v_code;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_generate_code ON public.documents;
CREATE TRIGGER documents_generate_code
  BEFORE INSERT ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.generate_document_code();

DROP TRIGGER IF EXISTS documents_updated_at ON public.documents;
CREATE TRIGGER documents_updated_at
  BEFORE UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS POLICIES — DOCUMENTS ───────────────────────────────
DROP POLICY IF EXISTS "documents_read_all" ON public.documents;
DROP POLICY IF EXISTS "documents_manage" ON public.documents;
DROP POLICY IF EXISTS "docs_select_org" ON public.documents;
DROP POLICY IF EXISTS "docs_insert_authors" ON public.documents;
DROP POLICY IF EXISTS "docs_update_own_or_manager" ON public.documents;

CREATE POLICY "docs_select_org"
  ON public.documents FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "docs_insert_authors"
  ON public.documents FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND author_id = auth.uid()
    AND public.is_org_role(ARRAY['admin','manager','approver','reviewer','author'])
  );

CREATE POLICY "docs_update_own_or_manager"
  ON public.documents FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND (
      author_id = auth.uid()
      OR public.is_org_role(ARRAY['admin','manager'])
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      author_id = auth.uid()
      OR public.is_org_role(ARRAY['admin','manager'])
    )
  );

-- ── RLS POLICIES — DOCUMENT VERSIONS ──────────────────────
DROP POLICY IF EXISTS "versions_select_org" ON public.document_versions;
DROP POLICY IF EXISTS "versions_insert_authors" ON public.document_versions;

CREATE POLICY "versions_select_org"
  ON public.document_versions FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "versions_insert_authors"
  ON public.document_versions FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND uploaded_by = auth.uid()
    AND public.is_org_role(ARRAY['admin','manager','approver','reviewer','author'])
  );
