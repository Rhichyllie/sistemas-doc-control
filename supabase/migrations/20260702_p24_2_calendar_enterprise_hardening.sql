-- 22_TRAMITA_calendar_enterprise_hardening
-- P-24.2 - Calendário Enterprise, Feriados Globais, Ausências e Substituições
--
-- Migration aditiva. Não altera approval_flows, assignees, documentos,
-- due_at ou autorização de conclusão da P-12.1.

BEGIN;

CREATE OR REPLACE FUNCTION public.is_valid_iana_timezone(p_timezone TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT
    NULLIF(BTRIM(p_timezone), '') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM pg_timezone_names
      WHERE name = BTRIM(p_timezone)
    )
$$;

ALTER TABLE public.operational_holidays
  ADD COLUMN IF NOT EXISTS country_code TEXT,
  ADD COLUMN IF NOT EXISTS subdivision_code TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT,
  ADD COLUMN IF NOT EXISTS source_id TEXT,
  ADD COLUMN IF NOT EXISTS imported_year INTEGER,
  ADD COLUMN IF NOT EXISTS holiday_type TEXT,
  ADD COLUMN IF NOT EXISTS observed BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS optional BOOLEAN NOT NULL DEFAULT false;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.operational_calendars'::regclass
      AND conname = 'operational_calendars_timezone_iana'
  ) THEN
    ALTER TABLE public.operational_calendars
      ADD CONSTRAINT operational_calendars_timezone_iana
      CHECK (public.is_valid_iana_timezone(timezone))
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.operational_holidays'::regclass
      AND conname = 'operational_holidays_country_code_valid'
  ) THEN
    ALTER TABLE public.operational_holidays
      ADD CONSTRAINT operational_holidays_country_code_valid
      CHECK (
        country_code IS NULL
        OR country_code ~ '^[A-Z]{2}$'
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.operational_holidays'::regclass
      AND conname = 'operational_holidays_imported_year_valid'
  ) THEN
    ALTER TABLE public.operational_holidays
      ADD CONSTRAINT operational_holidays_imported_year_valid
      CHECK (
        imported_year IS NULL
        OR imported_year BETWEEN 1900 AND 2200
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.operational_holidays'::regclass
      AND conname = 'operational_holidays_source_valid'
  ) THEN
    ALTER TABLE public.operational_holidays
      ADD CONSTRAINT operational_holidays_source_valid
      CHECK (
        source IS NULL
        OR source IN ('manual', 'br_local_pack', 'nager_date_api')
      );
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.operational_holiday_import_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  calendar_id UUID REFERENCES public.operational_calendars(id) ON DELETE SET NULL,
  country_code TEXT NOT NULL,
  subdivision_code TEXT,
  provider TEXT NOT NULL,
  year INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'completed',
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operational_holiday_import_runs_country_valid
    CHECK (country_code ~ '^[A-Z]{2}$'),
  CONSTRAINT operational_holiday_import_runs_provider_valid
    CHECK (provider IN ('br_local_pack', 'nager_date_api')),
  CONSTRAINT operational_holiday_import_runs_year_valid
    CHECK (year BETWEEN 1900 AND 2200),
  CONSTRAINT operational_holiday_import_runs_counts_valid
    CHECK (imported_count >= 0 AND skipped_count >= 0),
  CONSTRAINT operational_holiday_import_runs_status_valid
    CHECK (status IN ('completed', 'partial', 'failed')),
  CONSTRAINT operational_holiday_import_runs_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.team_absences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  absence_type TEXT NOT NULL DEFAULT 'vacation',
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  status TEXT NOT NULL DEFAULT 'scheduled',
  reason TEXT,
  substitute_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_absences_period_valid
    CHECK (ends_at > starts_at),
  CONSTRAINT team_absences_type_valid
    CHECK (
      absence_type IN (
        'vacation', 'sick_leave', 'leave', 'travel',
        'training', 'unavailable', 'other'
      )
    ),
  CONSTRAINT team_absences_status_valid
    CHECK (status IN ('scheduled', 'active', 'cancelled', 'completed')),
  CONSTRAINT team_absences_substitute_distinct
    CHECK (substitute_user_id IS NULL OR user_id <> substitute_user_id),
  CONSTRAINT team_absences_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.team_delegation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  owner_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  substitute_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  scope TEXT NOT NULL DEFAULT 'all',
  project_id UUID,
  doc_type TEXT,
  area TEXT,
  step_type TEXT,
  starts_at TIMESTAMPTZ,
  ends_at TIMESTAMPTZ,
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT team_delegation_rules_users_distinct
    CHECK (owner_user_id <> substitute_user_id),
  CONSTRAINT team_delegation_rules_scope_valid
    CHECK (
      scope IN (
        'all', 'project', 'document_type', 'area',
        'step_type', 'custom'
      )
    ),
  CONSTRAINT team_delegation_rules_period_valid
    CHECK (
      ends_at IS NULL
      OR starts_at IS NULL
      OR ends_at > starts_at
    ),
  CONSTRAINT team_delegation_rules_priority_valid
    CHECK (priority >= 0),
  CONSTRAINT team_delegation_rules_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'public.team_delegation_rules'::regclass
        AND conname = 'team_delegation_rules_project_id_fkey'
    )
  THEN
    ALTER TABLE public.team_delegation_rules
      ADD CONSTRAINT team_delegation_rules_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_operational_holidays_org_country_date
  ON public.operational_holidays(org_id, country_code, holiday_date);
CREATE INDEX IF NOT EXISTS idx_operational_holidays_org_year_source
  ON public.operational_holidays(org_id, imported_year, source);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_holidays_imported_identity
  ON public.operational_holidays (
    org_id,
    COALESCE(calendar_id, '00000000-0000-0000-0000-000000000000'::UUID),
    holiday_date,
    LOWER(BTRIM(name)),
    COALESCE(UPPER(country_code), ''),
    COALESCE(UPPER(subdivision_code), '')
  )
  WHERE source IN ('br_local_pack', 'nager_date_api');

CREATE INDEX IF NOT EXISTS idx_operational_holiday_runs_org_created
  ON public.operational_holiday_import_runs(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_team_absences_org_period
  ON public.team_absences(org_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_team_absences_user_period
  ON public.team_absences(user_id, starts_at, ends_at);
CREATE INDEX IF NOT EXISTS idx_team_absences_substitute
  ON public.team_absences(substitute_user_id, starts_at, ends_at)
  WHERE substitute_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_team_delegations_owner_active
  ON public.team_delegation_rules(org_id, owner_user_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_team_delegations_substitute_active
  ON public.team_delegation_rules(org_id, substitute_user_id, active);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_team_absences_updated_at
      ON public.team_absences;
    CREATE TRIGGER trg_team_absences_updated_at
      BEFORE UPDATE ON public.team_absences
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_team_delegation_rules_updated_at
      ON public.team_delegation_rules;
    CREATE TRIGGER trg_team_delegation_rules_updated_at
      BEFORE UPDATE ON public.team_delegation_rules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.operational_holiday_import_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_absences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_delegation_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "holiday_import_runs_select_org"
  ON public.operational_holiday_import_runs;
CREATE POLICY "holiday_import_runs_select_org"
  ON public.operational_holiday_import_runs
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "holiday_import_runs_insert_manager"
  ON public.operational_holiday_import_runs;
CREATE POLICY "holiday_import_runs_insert_manager"
  ON public.operational_holiday_import_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (created_by IS NULL OR created_by = auth.uid())
    AND (
      calendar_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.operational_calendars calendar
        WHERE calendar.id = operational_holiday_import_runs.calendar_id
          AND calendar.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "holiday_import_runs_delete_manager"
  ON public.operational_holiday_import_runs;
CREATE POLICY "holiday_import_runs_delete_manager"
  ON public.operational_holiday_import_runs
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "team_absences_select_org"
  ON public.team_absences;
CREATE POLICY "team_absences_select_org"
  ON public.team_absences
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "team_absences_insert_scoped"
  ON public.team_absences;
CREATE POLICY "team_absences_insert_scoped"
  ON public.team_absences
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR (
        user_id = auth.uid()
        AND status = 'scheduled'
        AND starts_at > NOW()
      )
    )
    AND (created_by IS NULL OR created_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles owner_profile
      WHERE owner_profile.id = team_absences.user_id
        AND owner_profile.org_id = public.current_user_org_id()
    )
    AND (
      substitute_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiles substitute_profile
        WHERE substitute_profile.id = team_absences.substitute_user_id
          AND substitute_profile.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "team_absences_update_scoped"
  ON public.team_absences;
CREATE POLICY "team_absences_update_scoped"
  ON public.team_absences
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR (
        user_id = auth.uid()
        AND status = 'scheduled'
        AND starts_at > NOW()
      )
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR (
        user_id = auth.uid()
        AND status IN ('scheduled', 'cancelled')
        AND starts_at > NOW()
      )
    )
    AND (
      substitute_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiles substitute_profile
        WHERE substitute_profile.id = team_absences.substitute_user_id
          AND substitute_profile.org_id = public.current_user_org_id()
      )
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles owner_profile
      WHERE owner_profile.id = team_absences.user_id
        AND owner_profile.org_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS "team_absences_delete_scoped"
  ON public.team_absences;
CREATE POLICY "team_absences_delete_scoped"
  ON public.team_absences
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR (
        user_id = auth.uid()
        AND status = 'scheduled'
        AND starts_at > NOW()
      )
    )
  );

DROP POLICY IF EXISTS "team_delegations_select_org"
  ON public.team_delegation_rules;
CREATE POLICY "team_delegations_select_org"
  ON public.team_delegation_rules
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "team_delegations_insert_scoped"
  ON public.team_delegation_rules;
CREATE POLICY "team_delegations_insert_scoped"
  ON public.team_delegation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR owner_user_id = auth.uid()
    )
    AND (created_by IS NULL OR created_by = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles owner_profile
      WHERE owner_profile.id = team_delegation_rules.owner_user_id
        AND owner_profile.org_id = public.current_user_org_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles substitute_profile
      WHERE substitute_profile.id = team_delegation_rules.substitute_user_id
        AND substitute_profile.org_id = public.current_user_org_id()
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects project
        WHERE project.id = team_delegation_rules.project_id
          AND (
            project.org_id = public.current_user_org_id()
            OR project.org_id IS NULL
          )
      )
    )
  );

DROP POLICY IF EXISTS "team_delegations_update_scoped"
  ON public.team_delegation_rules;
CREATE POLICY "team_delegations_update_scoped"
  ON public.team_delegation_rules
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR owner_user_id = auth.uid()
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR owner_user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles substitute_profile
      WHERE substitute_profile.id = team_delegation_rules.substitute_user_id
        AND substitute_profile.org_id = public.current_user_org_id()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles owner_profile
      WHERE owner_profile.id = team_delegation_rules.owner_user_id
        AND owner_profile.org_id = public.current_user_org_id()
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.projects project
        WHERE project.id = team_delegation_rules.project_id
          AND (
            project.org_id = public.current_user_org_id()
            OR project.org_id IS NULL
          )
      )
    )
  );

DROP POLICY IF EXISTS "team_delegations_delete_scoped"
  ON public.team_delegation_rules;
CREATE POLICY "team_delegations_delete_scoped"
  ON public.team_delegation_rules
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR owner_user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.is_user_unavailable(
  p_org_id UUID,
  p_user_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_org_id IS NULL OR p_user_id IS NULL OR p_at IS NULL THEN
    RETURN false;
  END IF;
  IF auth.uid() IS NOT NULL
    AND p_org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION 'Acesso negado à disponibilidade de outra organização.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles profile
    WHERE profile.id = p_user_id
      AND profile.org_id = p_org_id
  ) THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1
    FROM public.team_absences absence
    WHERE absence.org_id = p_org_id
      AND absence.user_id = p_user_id
      AND absence.status IN ('scheduled', 'active')
      AND p_at >= absence.starts_at
      AND p_at < absence.ends_at
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_user_substitute(
  p_org_id UUID,
  p_user_id UUID,
  p_at TIMESTAMPTZ DEFAULT NOW(),
  p_project_id UUID DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_step_type TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate UUID;
BEGIN
  IF p_org_id IS NULL OR p_user_id IS NULL OR p_at IS NULL THEN
    RETURN NULL;
  END IF;
  IF auth.uid() IS NOT NULL
    AND p_org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION 'Acesso negado à substituição de outra organização.';
  END IF;

  SELECT absence.substitute_user_id
  INTO v_candidate
  FROM public.team_absences absence
  WHERE absence.org_id = p_org_id
    AND absence.user_id = p_user_id
    AND absence.substitute_user_id IS NOT NULL
    AND absence.status IN ('scheduled', 'active')
    AND p_at >= absence.starts_at
    AND p_at < absence.ends_at
  ORDER BY
    CASE absence.status WHEN 'active' THEN 0 ELSE 1 END,
    absence.starts_at DESC,
    absence.id
  LIMIT 1;

  IF v_candidate IS NOT NULL
    AND v_candidate <> p_user_id
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = v_candidate
        AND profile.org_id = p_org_id
    )
    AND NOT public.is_user_unavailable(p_org_id, v_candidate, p_at)
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_absences reverse_absence
      WHERE reverse_absence.org_id = p_org_id
        AND reverse_absence.user_id = v_candidate
        AND reverse_absence.substitute_user_id = p_user_id
        AND reverse_absence.status IN ('scheduled', 'active')
        AND p_at >= reverse_absence.starts_at
        AND p_at < reverse_absence.ends_at
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.team_delegation_rules reverse_delegation
      WHERE reverse_delegation.org_id = p_org_id
        AND reverse_delegation.owner_user_id = v_candidate
        AND reverse_delegation.substitute_user_id = p_user_id
        AND reverse_delegation.active
        AND (reverse_delegation.starts_at IS NULL OR p_at >= reverse_delegation.starts_at)
        AND (reverse_delegation.ends_at IS NULL OR p_at < reverse_delegation.ends_at)
    )
  THEN
    RETURN v_candidate;
  END IF;

  v_candidate := NULL;
  SELECT delegation.substitute_user_id
  INTO v_candidate
  FROM public.team_delegation_rules delegation
  WHERE delegation.org_id = p_org_id
    AND delegation.owner_user_id = p_user_id
    AND delegation.active
    AND (delegation.starts_at IS NULL OR p_at >= delegation.starts_at)
    AND (delegation.ends_at IS NULL OR p_at < delegation.ends_at)
    AND (
      delegation.scope = 'all'
      OR (
        delegation.scope = 'project'
        AND delegation.project_id IS NOT NULL
        AND delegation.project_id = p_project_id
      )
      OR (
        delegation.scope = 'document_type'
        AND NULLIF(BTRIM(delegation.doc_type), '') IS NOT NULL
        AND UPPER(delegation.doc_type) = UPPER(p_doc_type)
      )
      OR (
        delegation.scope = 'area'
        AND NULLIF(BTRIM(delegation.area), '') IS NOT NULL
        AND UPPER(delegation.area) = UPPER(p_area)
      )
      OR (
        delegation.scope = 'step_type'
        AND NULLIF(BTRIM(delegation.step_type), '') IS NOT NULL
        AND LOWER(delegation.step_type) = LOWER(p_step_type)
      )
    )
    AND delegation.substitute_user_id <> p_user_id
  ORDER BY
    CASE delegation.scope
      WHEN 'project' THEN 0
      WHEN 'step_type' THEN 1
      WHEN 'document_type' THEN 2
      WHEN 'area' THEN 3
      ELSE 4
    END,
    delegation.priority ASC,
    delegation.created_at,
    delegation.id
  LIMIT 1;

  IF v_candidate IS NULL
    OR NOT EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = v_candidate
        AND profile.org_id = p_org_id
    )
    OR public.is_user_unavailable(p_org_id, v_candidate, p_at)
    OR EXISTS (
      SELECT 1
      FROM public.team_absences reverse_absence
      WHERE reverse_absence.org_id = p_org_id
        AND reverse_absence.user_id = v_candidate
        AND reverse_absence.substitute_user_id = p_user_id
        AND reverse_absence.status IN ('scheduled', 'active')
        AND p_at >= reverse_absence.starts_at
        AND p_at < reverse_absence.ends_at
    )
    OR EXISTS (
      SELECT 1
      FROM public.team_delegation_rules reverse_delegation
      WHERE reverse_delegation.org_id = p_org_id
        AND reverse_delegation.owner_user_id = v_candidate
        AND reverse_delegation.substitute_user_id = p_user_id
        AND reverse_delegation.active
        AND (reverse_delegation.starts_at IS NULL OR p_at >= reverse_delegation.starts_at)
        AND (reverse_delegation.ends_at IS NULL OR p_at < reverse_delegation.ends_at)
    )
  THEN
    RETURN NULL;
  END IF;

  RETURN v_candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.is_valid_iana_timezone(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.is_user_unavailable(UUID, UUID, TIMESTAMPTZ)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_user_substitute(
  UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_valid_iana_timezone(TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_user_unavailable(UUID, UUID, TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_user_substitute(
  UUID, UUID, TIMESTAMPTZ, UUID, TEXT, TEXT, TEXT
) TO authenticated, service_role;

GRANT SELECT, INSERT, DELETE ON public.operational_holiday_import_runs
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_absences
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.team_delegation_rules
  TO authenticated;

GRANT ALL ON public.operational_holiday_import_runs TO service_role;
GRANT ALL ON public.team_absences TO service_role;
GRANT ALL ON public.team_delegation_rules TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
