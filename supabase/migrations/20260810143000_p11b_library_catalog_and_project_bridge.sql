BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Phase templates used by the library provisioning flow.
CREATE TABLE IF NOT EXISTS public.phase_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  display_name TEXT NOT NULL,
  reference_standard TEXT NOT NULL DEFAULT '',
  workflow_definition JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT phase_templates_code_check
    CHECK (code IN ('project', 'om')),
  CONSTRAINT phase_templates_display_name_not_blank_check
    CHECK (BTRIM(display_name) <> ''),
  CONSTRAINT phase_templates_workflow_definition_object_check
    CHECK (jsonb_typeof(workflow_definition) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS phase_templates_code_unique
  ON public.phase_templates (code);

INSERT INTO public.phase_templates (
  code,
  display_name,
  reference_standard,
  workflow_definition
)
VALUES
  (
    'project',
    'Projeto',
    'ISO 19650-1/2',
    jsonb_build_object(
      'lifecycle', 'linear',
      'statuses', jsonb_build_array('elaboracao', 'verificacao', 'aprovacao', 'emissao')
    )
  ),
  (
    'om',
    'Operacao / O&M',
    'ISO 19650-3 / ISO 55000',
    jsonb_build_object(
      'lifecycle', 'cyclical',
      'statuses', jsonb_build_array('ativo', 'revisao', 'ativo')
    )
  )
ON CONFLICT (code) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  reference_standard = EXCLUDED.reference_standard,
  workflow_definition = EXCLUDED.workflow_definition,
  updated_at = NOW();

CREATE TABLE IF NOT EXISTS public.enterprises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT enterprises_name_not_blank_check
    CHECK (BTRIM(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS enterprises_org_name_unique
  ON public.enterprises (org_id, name);

CREATE INDEX IF NOT EXISTS idx_enterprises_org_created
  ON public.enterprises (org_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.libraries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  enterprise_id UUID NOT NULL REFERENCES public.enterprises(id) ON DELETE CASCADE,
  phase_template_id UUID NOT NULL REFERENCES public.phase_templates(id) ON DELETE RESTRICT,
  name TEXT NOT NULL,
  created_by UUID NULL REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT libraries_name_not_blank_check
    CHECK (BTRIM(name) <> '')
);

CREATE UNIQUE INDEX IF NOT EXISTS libraries_org_enterprise_name_unique
  ON public.libraries (org_id, enterprise_id, name);

CREATE INDEX IF NOT EXISTS idx_libraries_org_created
  ON public.libraries (org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_libraries_enterprise
  ON public.libraries (enterprise_id);

-- Bring legacy projects into the enterprise-compatible contract used by the app.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS library_id UUID,
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS client_name TEXT,
  ADD COLUMN IF NOT EXISTS contract_number TEXT,
  ADD COLUMN IF NOT EXISTS location TEXT,
  ADD COLUMN IF NOT EXISTS project_type TEXT DEFAULT 'project',
  ADD COLUMN IF NOT EXISTS area TEXT,
  ADD COLUMN IF NOT EXISTS responsible_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true;

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

UPDATE public.projects
SET
  project_type = CASE LOWER(COALESCE(NULLIF(BTRIM(project_type), ''), 'project'))
    WHEN 'project' THEN 'project'
    WHEN 'obra' THEN 'obra'
    WHEN 'contrato' THEN 'contrato'
    WHEN 'unidade' THEN 'unidade'
    WHEN 'frente_trabalho' THEN 'frente_trabalho'
    WHEN 'outro' THEN 'outro'
    ELSE 'project'
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
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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
    SELECT 1
    FROM pg_constraint
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
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_code_not_blank_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_code_not_blank_check
      CHECK (code IS NULL OR BTRIM(code) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_name_not_blank_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_name_not_blank_check
      CHECK (BTRIM(name) <> '');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_metadata_object_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_metadata_object_check
      CHECK (jsonb_typeof(metadata) = 'object');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_dates_check'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_dates_check
      CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date)
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
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

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.projects'::REGCLASS
      AND conname = 'projects_library_id_fkey'
  ) THEN
    ALTER TABLE public.projects
      ADD CONSTRAINT projects_library_id_fkey
      FOREIGN KEY (library_id)
      REFERENCES public.libraries(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  v_constraint RECORD;
BEGIN
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
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS projects_library_unique
  ON public.projects(library_id);

CREATE INDEX IF NOT EXISTS idx_projects_library
  ON public.projects(library_id);

CREATE INDEX IF NOT EXISTS idx_projects_org_active
  ON public.projects(org_id, is_active);

CREATE INDEX IF NOT EXISTS idx_projects_org_status
  ON public.projects(org_id, status);

CREATE INDEX IF NOT EXISTS idx_projects_org_name
  ON public.projects(org_id, name);

ALTER TABLE public.phase_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.enterprises ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.libraries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS phase_templates_select_all ON public.phase_templates;
DROP POLICY IF EXISTS enterprises_select_same_org ON public.enterprises;
DROP POLICY IF EXISTS enterprises_insert_manager ON public.enterprises;
DROP POLICY IF EXISTS enterprises_update_manager ON public.enterprises;
DROP POLICY IF EXISTS libraries_select_same_org ON public.libraries;
DROP POLICY IF EXISTS libraries_insert_manager ON public.libraries;
DROP POLICY IF EXISTS libraries_update_manager ON public.libraries;
DROP POLICY IF EXISTS projects_read_all ON public.projects;
DROP POLICY IF EXISTS projects_manage ON public.projects;
DROP POLICY IF EXISTS projects_select_operational ON public.projects;
DROP POLICY IF EXISTS projects_insert_manager ON public.projects;
DROP POLICY IF EXISTS projects_update_manager ON public.projects;

CREATE POLICY phase_templates_select_all
  ON public.phase_templates
  FOR SELECT TO authenticated
  USING (TRUE);

CREATE POLICY enterprises_select_same_org
  ON public.enterprises
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY enterprises_insert_manager
  ON public.enterprises
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY enterprises_update_manager
  ON public.enterprises
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY libraries_select_same_org
  ON public.libraries
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE POLICY libraries_insert_manager
  ON public.libraries
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY libraries_update_manager
  ON public.libraries
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY projects_select_operational
  ON public.projects
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    OR org_id IS NULL
  );

CREATE POLICY projects_insert_manager
  ON public.projects
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND created_by = auth.uid()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE POLICY projects_update_manager
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

GRANT SELECT ON public.phase_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.enterprises TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.libraries TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.projects TO authenticated;
GRANT ALL ON public.phase_templates TO service_role;
GRANT ALL ON public.enterprises TO service_role;
GRANT ALL ON public.libraries TO service_role;
GRANT ALL ON public.projects TO service_role;
REVOKE DELETE ON public.projects FROM authenticated;

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS phase_templates_updated_at ON public.phase_templates;
    CREATE TRIGGER phase_templates_updated_at
      BEFORE UPDATE ON public.phase_templates
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS enterprises_updated_at ON public.enterprises;
    CREATE TRIGGER enterprises_updated_at
      BEFORE UPDATE ON public.enterprises
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS libraries_updated_at ON public.libraries;
    CREATE TRIGGER libraries_updated_at
      BEFORE UPDATE ON public.libraries
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_projects_updated ON public.projects;
    CREATE TRIGGER trg_projects_updated
      BEFORE UPDATE ON public.projects
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.provision_library(
  p_enterprise_id UUID,
  p_phase_code TEXT,
  p_library_name TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_actor_id UUID := auth.uid();
  v_phase_code TEXT := LOWER(BTRIM(COALESCE(p_phase_code, '')));
  v_library_name TEXT := NULLIF(BTRIM(p_library_name), '');
  v_enterprise public.enterprises%ROWTYPE;
  v_phase_template public.phase_templates%ROWTYPE;
  v_library_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não identificada para provisionar a biblioteca.';
  END IF;

  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado não identificado.';
  END IF;

  IF v_role IS DISTINCT FROM 'admin' AND v_role IS DISTINCT FROM 'manager' THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem criar bibliotecas.'
      USING ERRCODE = '42501';
  END IF;

  IF p_enterprise_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um empreendimento para criar a biblioteca.';
  END IF;

  IF v_library_name IS NULL THEN
    RAISE EXCEPTION 'Informe um nome válido para a biblioteca.';
  END IF;

  SELECT *
  INTO v_enterprise
  FROM public.enterprises
  WHERE id = p_enterprise_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Empreendimento não encontrado para a organização atual.';
  END IF;

  SELECT *
  INTO v_phase_template
  FROM public.phase_templates
  WHERE LOWER(BTRIM(code)) = v_phase_code
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Template de fase não encontrado para o código informado.';
  END IF;

  INSERT INTO public.libraries (
    org_id,
    enterprise_id,
    phase_template_id,
    name,
    created_by
  )
  VALUES (
    v_org_id,
    v_enterprise.id,
    v_phase_template.id,
    v_library_name,
    v_actor_id
  )
  ON CONFLICT (org_id, enterprise_id, name)
  DO UPDATE SET
    phase_template_id = EXCLUDED.phase_template_id,
    updated_at = NOW()
  RETURNING id INTO v_library_id;

  INSERT INTO public.projects (
    org_id,
    library_id,
    code,
    name,
    description,
    client_name,
    contract_number,
    location,
    project_type,
    status,
    area,
    responsible_id,
    start_date,
    end_date,
    metadata,
    is_active,
    created_by
  )
  VALUES (
    v_org_id,
    v_library_id,
    NULL,
    v_library_name,
    FORMAT(
      'Projeto gerado automaticamente a partir da biblioteca %s.',
      v_library_name
    ),
    NULL,
    NULL,
    NULL,
    CASE
      WHEN v_phase_template.code = 'project' THEN 'project'
      ELSE 'unidade'
    END,
    'active',
    NULL,
    NULL,
    NULL,
    NULL,
    jsonb_build_object(
      'auto_created_from_library', true,
      'enterprise_id', v_enterprise.id,
      'phase_code', v_phase_template.code,
      'linked_library_id', v_library_id
    ),
    true,
    v_actor_id
  )
  ON CONFLICT (library_id)
  DO UPDATE SET
    org_id = EXCLUDED.org_id,
    name = EXCLUDED.name,
    description = EXCLUDED.description,
    project_type = EXCLUDED.project_type,
    status = EXCLUDED.status,
    metadata = EXCLUDED.metadata,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();

  RETURN v_library_id;
END;
$$;

REVOKE ALL ON FUNCTION public.provision_library(UUID, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_library(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.provision_library(UUID, TEXT, TEXT) TO service_role;

COMMENT ON FUNCTION public.provision_library(UUID, TEXT, TEXT) IS
  'Cria ou reaproveita uma biblioteca e garante o projeto operacional vinculado na tabela projects.';

NOTIFY pgrst, 'reload schema';

COMMIT;
