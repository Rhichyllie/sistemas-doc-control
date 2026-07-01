-- TRAMITA P-11A — Projetos, Obras e Contextos Operacionais
-- Cadastro documental/operacional compatível com a tabela projects legada.
-- Aplicação exclusivamente manual após revisão no Supabase SQL Editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

DO $$
BEGIN
  IF to_regclass('public.projects') IS NULL THEN
    CREATE TABLE public.projects (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      org_id          UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
      code            TEXT,
      name            TEXT NOT NULL,
      description     TEXT,
      client_name     TEXT,
      contract_number TEXT,
      location        TEXT,
      project_type    TEXT NOT NULL DEFAULT 'project',
      status          TEXT NOT NULL DEFAULT 'active',
      area            TEXT,
      responsible_id  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      start_date      DATE,
      end_date        DATE,
      metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
      is_active       BOOLEAN NOT NULL DEFAULT true,
      created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  END IF;
END;
$$;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS id UUID DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS code TEXT,
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS start_date DATE,
  ADD COLUMN IF NOT EXISTS end_date DATE,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

UPDATE public.projects
SET id = gen_random_uuid()
WHERE id IS NULL;

UPDATE public.projects
SET name = 'Projeto legado ' || UPPER(SUBSTRING(REPLACE(id::TEXT, '-', '') FROM 1 FOR 8))
WHERE name IS NULL OR BTRIM(name) = '';

UPDATE public.projects
SET
  project_type = CASE LOWER(COALESCE(NULLIF(BTRIM(project_type), ''), 'project'))
    WHEN 'project' THEN 'project'
    WHEN 'obra' THEN 'obra'
    WHEN 'contrato' THEN 'contrato'
    WHEN 'unidade' THEN 'unidade'
    WHEN 'frente_trabalho' THEN 'frente_trabalho'
    WHEN 'outro' THEN 'outro'
    ELSE 'outro'
  END,
  metadata = CASE
    WHEN metadata IS NULL THEN '{}'::JSONB
    WHEN jsonb_typeof(metadata) = 'object' THEN metadata
    ELSE jsonb_build_object('legacy_value', metadata)
  END,
  is_active = COALESCE(is_active, true),
  created_at = COALESCE(created_at, NOW()),
  updated_at = COALESCE(updated_at, NOW());

UPDATE public.projects
SET code = NULL
WHERE code IS NOT NULL AND BTRIM(code) = '';

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'projects'
      AND column_name = 'client'
  ) THEN
    EXECUTE '
      UPDATE public.projects
      SET client_name = COALESCE(NULLIF(BTRIM(client_name), ''''), NULLIF(BTRIM(client::TEXT), ''''))
      WHERE client_name IS NULL OR BTRIM(client_name) = ''''
    ';
  END IF;
END;
$$;

-- O schema inicial usava enum planning/in_progress/completed/cancelled.
-- A conversão para TEXT preserva os dados e permite o ciclo operacional novo.
DO $$
DECLARE
  v_status_type TEXT;
BEGIN
  SELECT data_type
  INTO v_status_type
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'projects'
    AND column_name = 'status';

  IF v_status_type IS NULL THEN
    ALTER TABLE public.projects ADD COLUMN status TEXT DEFAULT 'active';
  ELSIF v_status_type <> 'text' THEN
    ALTER TABLE public.projects ALTER COLUMN status DROP DEFAULT;
    ALTER TABLE public.projects
      ALTER COLUMN status TYPE TEXT USING status::TEXT;
  END IF;
END;
$$;

UPDATE public.projects
SET status = CASE LOWER(COALESCE(status, 'active'))
  WHEN 'planning' THEN 'planning'
  WHEN 'in_progress' THEN 'active'
  WHEN 'completed' THEN 'closed'
  WHEN 'active' THEN 'active'
  WHEN 'paused' THEN 'paused'
  WHEN 'closed' THEN 'closed'
  WHEN 'cancelled' THEN 'cancelled'
  WHEN 'archived' THEN 'archived'
  ELSE 'active'
END;

UPDATE public.projects
SET is_active = false
WHERE status IN ('closed', 'cancelled', 'archived');

ALTER TABLE public.projects
  ALTER COLUMN id SET DEFAULT gen_random_uuid(),
  ALTER COLUMN id SET NOT NULL,
  ALTER COLUMN name SET NOT NULL,
  ALTER COLUMN project_type SET DEFAULT 'project',
  ALTER COLUMN project_type SET NOT NULL,
  ALTER COLUMN status SET DEFAULT 'active',
  ALTER COLUMN status SET NOT NULL,
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN metadata SET NOT NULL,
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN is_active SET NOT NULL,
  ALTER COLUMN created_at SET DEFAULT NOW(),
  ALTER COLUMN created_at SET NOT NULL,
  ALTER COLUMN updated_at SET DEFAULT NOW(),
  ALTER COLUMN updated_at SET NOT NULL,
  ALTER COLUMN code DROP NOT NULL;

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
  -- Remove somente a unicidade global legada de projects.code.
  FOR v_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND contype = 'u'
      AND pg_get_constraintdef(oid) ~* '^UNIQUE \(code\)'
  LOOP
    EXECUTE FORMAT(
      'ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS %I',
      v_constraint.conname
    );
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND contype = 'p'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_pkey PRIMARY KEY (id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_project_type_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_project_type_check
      CHECK (
        project_type IN (
          'project',
          'obra',
          'contrato',
          'unidade',
          'frente_trabalho',
          'outro'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_operational_status_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_operational_status_check
      CHECK (
        status IN (
          'planning',
          'active',
          'paused',
          'closed',
          'cancelled',
          'archived'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_code_not_blank_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_code_not_blank_check
      CHECK (code IS NULL OR BTRIM(code) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_name_not_blank_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_name_not_blank_check
      CHECK (BTRIM(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_metadata_object_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_metadata_object_check
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_dates_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_dates_check
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_created_by_profile_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_created_by_profile_fkey
      FOREIGN KEY (created_by)
      REFERENCES public.profiles(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.projects
    WHERE org_id IS NOT NULL
      AND code IS NOT NULL
      AND BTRIM(code) <> ''
    GROUP BY org_id, UPPER(BTRIM(code))
    HAVING COUNT(*) > 1
  ) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS projects_org_code_unique
      ON public.projects(org_id, UPPER(BTRIM(code)))
      WHERE org_id IS NOT NULL
        AND code IS NOT NULL
        AND BTRIM(code) <> '';
  ELSE
    RAISE WARNING
      'projects_org_code_unique não foi criado: existem códigos duplicados na mesma organização.';
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_projects_org_active
  ON public.projects(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_projects_org_status
  ON public.projects(org_id, status);
CREATE INDEX IF NOT EXISTS idx_projects_org_code
  ON public.projects(org_id, code);
CREATE INDEX IF NOT EXISTS idx_projects_org_name
  ON public.projects(org_id, name);
CREATE INDEX IF NOT EXISTS idx_projects_responsible
  ON public.projects(responsible_id);
CREATE INDEX IF NOT EXISTS idx_projects_type
  ON public.projects(project_type);

CREATE OR REPLACE FUNCTION public.normalize_project_code(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    BTRIM(
      REGEXP_REPLACE(
        UPPER(
          TRANSLATE(
            BTRIM(COALESCE(p_value, '')),
            'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
            'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
          )
        ),
        '[^A-Z0-9]+',
        '-',
        'g'
      ),
      '-'
    ),
    ''
  )
$$;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_projects_updated ON public.projects;
    CREATE TRIGGER trg_projects_updated
      BEFORE UPDATE ON public.projects
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "projects_read_all" ON public.projects;
DROP POLICY IF EXISTS "projects_manage" ON public.projects;
DROP POLICY IF EXISTS "projects_select_operational" ON public.projects;
DROP POLICY IF EXISTS "projects_insert_manager" ON public.projects;
DROP POLICY IF EXISTS "projects_update_manager" ON public.projects;

CREATE POLICY "projects_select_operational"
  ON public.projects
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    OR org_id IS NULL
  );

CREATE POLICY "projects_insert_manager"
  ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND created_by = auth.uid()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY "projects_update_manager"
  ON public.projects
  FOR UPDATE TO authenticated
  USING (
    public.is_org_role(ARRAY['admin', 'manager'])
    AND (
      org_id = public.current_user_org_id()
      OR org_id IS NULL
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

REVOKE DELETE ON public.projects FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;

REVOKE ALL ON FUNCTION public.normalize_project_code(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.normalize_project_code(TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
