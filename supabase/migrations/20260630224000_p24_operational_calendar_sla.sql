-- 21_TRAMITA_operational_calendar_sla
-- P-24 - Calendário Inteligente, Prazos e SLA Documental
--
-- Migration aditiva e idempotente. Ela não altera approval_flows, documentos,
-- etapas ou status: apenas mantém calendários/políticas e calcula datas.

BEGIN;

CREATE TABLE IF NOT EXISTS public.operational_calendars (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  workweek JSONB NOT NULL DEFAULT
    '{"mon":true,"tue":true,"wed":true,"thu":true,"fri":true,"sat":false,"sun":false}'::JSONB,
  default_start_time TIME NOT NULL DEFAULT '08:00',
  default_end_time TIME NOT NULL DEFAULT '18:00',
  is_default BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operational_calendars_name_not_blank
    CHECK (BTRIM(name) <> ''),
  CONSTRAINT operational_calendars_timezone_not_blank
    CHECK (BTRIM(timezone) <> ''),
  CONSTRAINT operational_calendars_workweek_object
    CHECK (JSONB_TYPEOF(workweek) = 'object'),
  CONSTRAINT operational_calendars_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object'),
  CONSTRAINT operational_calendars_workday_order
    CHECK (default_end_time > default_start_time)
);

CREATE TABLE IF NOT EXISTS public.operational_holidays (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  calendar_id UUID REFERENCES public.operational_calendars(id) ON DELETE CASCADE,
  holiday_date DATE NOT NULL,
  name TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'organization',
  repeats_yearly BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operational_holidays_name_not_blank
    CHECK (BTRIM(name) <> ''),
  CONSTRAINT operational_holidays_scope_valid
    CHECK (scope IN ('organization', 'calendar')),
  CONSTRAINT operational_holidays_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_sla_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  doc_type TEXT,
  area TEXT,
  project_id UUID,
  step_type TEXT,
  calendar_id UUID REFERENCES public.operational_calendars(id) ON DELETE SET NULL,
  review_due_days INTEGER,
  step_due_days INTEGER,
  warning_before_days INTEGER NOT NULL DEFAULT 3,
  severity TEXT NOT NULL DEFAULT 'medium',
  priority INTEGER NOT NULL DEFAULT 100,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_sla_policies_name_not_blank
    CHECK (BTRIM(name) <> ''),
  CONSTRAINT document_sla_policies_review_days_positive
    CHECK (review_due_days IS NULL OR review_due_days > 0),
  CONSTRAINT document_sla_policies_step_days_positive
    CHECK (step_due_days IS NULL OR step_due_days > 0),
  CONSTRAINT document_sla_policies_warning_days_nonnegative
    CHECK (warning_before_days >= 0),
  CONSTRAINT document_sla_policies_has_deadline
    CHECK (review_due_days IS NOT NULL OR step_due_days IS NOT NULL),
  CONSTRAINT document_sla_policies_severity_valid
    CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT document_sla_policies_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conname = 'document_sla_policies_project_id_fkey'
        AND conrelid = 'public.document_sla_policies'::regclass
    )
  THEN
    ALTER TABLE public.document_sla_policies
      ADD CONSTRAINT document_sla_policies_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_operational_calendars_org
  ON public.operational_calendars(org_id);
CREATE INDEX IF NOT EXISTS idx_operational_calendars_org_default
  ON public.operational_calendars(org_id, is_default);
CREATE UNIQUE INDEX IF NOT EXISTS uq_operational_calendars_default_per_org
  ON public.operational_calendars(org_id)
  WHERE is_default;

CREATE INDEX IF NOT EXISTS idx_operational_holidays_org_date
  ON public.operational_holidays(org_id, holiday_date);
CREATE INDEX IF NOT EXISTS idx_operational_holidays_calendar_date
  ON public.operational_holidays(calendar_id, holiday_date);

CREATE INDEX IF NOT EXISTS idx_document_sla_policies_org_active_priority
  ON public.document_sla_policies(org_id, active, priority);
CREATE INDEX IF NOT EXISTS idx_document_sla_policies_context
  ON public.document_sla_policies(org_id, project_id, doc_type, area, step_type);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_operational_calendars_updated_at
      ON public.operational_calendars;
    CREATE TRIGGER trg_operational_calendars_updated_at
      BEFORE UPDATE ON public.operational_calendars
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_document_sla_policies_updated_at
      ON public.document_sla_policies;
    CREATE TRIGGER trg_document_sla_policies_updated_at
      BEFORE UPDATE ON public.document_sla_policies
      FOR EACH ROW
      EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.operational_calendars ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_sla_policies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "operational_calendars_select_org"
  ON public.operational_calendars;
CREATE POLICY "operational_calendars_select_org"
  ON public.operational_calendars
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "operational_calendars_insert_manager"
  ON public.operational_calendars;
CREATE POLICY "operational_calendars_insert_manager"
  ON public.operational_calendars
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (created_by IS NULL OR created_by = auth.uid())
  );

DROP POLICY IF EXISTS "operational_calendars_update_manager"
  ON public.operational_calendars;
CREATE POLICY "operational_calendars_update_manager"
  ON public.operational_calendars
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "operational_calendars_delete_manager"
  ON public.operational_calendars;
CREATE POLICY "operational_calendars_delete_manager"
  ON public.operational_calendars
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "operational_holidays_select_org"
  ON public.operational_holidays;
CREATE POLICY "operational_holidays_select_org"
  ON public.operational_holidays
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "operational_holidays_insert_manager"
  ON public.operational_holidays;
CREATE POLICY "operational_holidays_insert_manager"
  ON public.operational_holidays
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
        WHERE calendar.id = operational_holidays.calendar_id
          AND calendar.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "operational_holidays_update_manager"
  ON public.operational_holidays;
CREATE POLICY "operational_holidays_update_manager"
  ON public.operational_holidays
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (
      calendar_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.operational_calendars calendar
        WHERE calendar.id = operational_holidays.calendar_id
          AND calendar.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "operational_holidays_delete_manager"
  ON public.operational_holidays;
CREATE POLICY "operational_holidays_delete_manager"
  ON public.operational_holidays
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_sla_policies_select_org"
  ON public.document_sla_policies;
CREATE POLICY "document_sla_policies_select_org"
  ON public.document_sla_policies
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_sla_policies_insert_manager"
  ON public.document_sla_policies;
CREATE POLICY "document_sla_policies_insert_manager"
  ON public.document_sla_policies
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
        WHERE calendar.id = document_sla_policies.calendar_id
          AND calendar.org_id = public.current_user_org_id()
      )
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects project
        WHERE project.id = document_sla_policies.project_id
          AND (
            project.org_id = public.current_user_org_id()
            OR project.org_id IS NULL
          )
      )
    )
  );

DROP POLICY IF EXISTS "document_sla_policies_update_manager"
  ON public.document_sla_policies;
CREATE POLICY "document_sla_policies_update_manager"
  ON public.document_sla_policies
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (
      calendar_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.operational_calendars calendar
        WHERE calendar.id = document_sla_policies.calendar_id
          AND calendar.org_id = public.current_user_org_id()
      )
    )
    AND (
      project_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.projects project
        WHERE project.id = document_sla_policies.project_id
          AND (
            project.org_id = public.current_user_org_id()
            OR project.org_id IS NULL
          )
      )
    )
  );

DROP POLICY IF EXISTS "document_sla_policies_delete_manager"
  ON public.document_sla_policies;
CREATE POLICY "document_sla_policies_delete_manager"
  ON public.document_sla_policies
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE OR REPLACE FUNCTION public.is_business_day(
  p_org_id UUID,
  p_date DATE,
  p_calendar_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_calendar_id UUID;
  v_workweek JSONB;
  v_day_key TEXT;
  v_default_workday BOOLEAN;
  v_workday_value TEXT;
BEGIN
  IF p_org_id IS NULL OR p_date IS NULL THEN
    RAISE EXCEPTION 'Organização e data são obrigatórias.';
  END IF;

  IF auth.uid() IS NOT NULL
    AND p_org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION 'Acesso negado ao calendário de outra organização.';
  END IF;

  IF p_calendar_id IS NOT NULL THEN
    SELECT calendar.id, calendar.workweek
      INTO v_calendar_id, v_workweek
    FROM public.operational_calendars calendar
    WHERE calendar.id = p_calendar_id
      AND calendar.org_id = p_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Calendário não encontrado para a organização informada.';
    END IF;
  ELSE
    SELECT calendar.id, calendar.workweek
      INTO v_calendar_id, v_workweek
    FROM public.operational_calendars calendar
    WHERE calendar.org_id = p_org_id
    ORDER BY calendar.is_default DESC, calendar.created_at, calendar.id
    LIMIT 1;
  END IF;

  v_day_key := CASE EXTRACT(ISODOW FROM p_date)::INTEGER
    WHEN 1 THEN 'mon'
    WHEN 2 THEN 'tue'
    WHEN 3 THEN 'wed'
    WHEN 4 THEN 'thu'
    WHEN 5 THEN 'fri'
    WHEN 6 THEN 'sat'
    ELSE 'sun'
  END;
  v_default_workday := EXTRACT(ISODOW FROM p_date)::INTEGER BETWEEN 1 AND 5;

  IF v_calendar_id IS NOT NULL THEN
    v_workday_value := LOWER(COALESCE(v_workweek ->> v_day_key, ''));
    IF v_workday_value = 'true' THEN
      v_default_workday := true;
    ELSIF v_workday_value = 'false' THEN
      v_default_workday := false;
    END IF;
  END IF;

  IF NOT v_default_workday THEN
    RETURN false;
  END IF;

  RETURN NOT EXISTS (
    SELECT 1
    FROM public.operational_holidays holiday
    WHERE holiday.org_id = p_org_id
      AND (
        holiday.calendar_id IS NULL
        OR (
          v_calendar_id IS NOT NULL
          AND holiday.calendar_id = v_calendar_id
        )
      )
      AND (
        holiday.holiday_date = p_date
        OR (
          holiday.repeats_yearly
          AND EXTRACT(MONTH FROM holiday.holiday_date) =
            EXTRACT(MONTH FROM p_date)
          AND EXTRACT(DAY FROM holiday.holiday_date) =
            EXTRACT(DAY FROM p_date)
        )
      )
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_business_days(
  p_org_id UUID,
  p_start_date DATE,
  p_days INTEGER,
  p_calendar_id UUID DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date DATE := p_start_date;
  v_added INTEGER := 0;
  v_iterations INTEGER := 0;
BEGIN
  IF p_org_id IS NULL OR p_start_date IS NULL OR p_days IS NULL THEN
    RAISE EXCEPTION 'Organização, data inicial e quantidade de dias são obrigatórias.';
  END IF;

  IF p_days < 0 THEN
    RAISE EXCEPTION 'A quantidade de dias úteis não pode ser negativa.';
  END IF;

  IF p_days = 0 THEN
    RETURN v_date;
  END IF;

  WHILE v_added < p_days LOOP
    v_date := v_date + 1;
    v_iterations := v_iterations + 1;

    IF v_iterations > 10000 THEN
      RAISE EXCEPTION 'Não foi possível calcular o prazo no calendário informado.';
    END IF;

    IF public.is_business_day(p_org_id, v_date, p_calendar_id) THEN
      v_added := v_added + 1;
    END IF;
  END LOOP;

  RETURN v_date;
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_document_due_date(
  p_org_id UUID,
  p_base_date DATE,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.document_sla_policies%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_base_date IS NULL THEN
    RAISE EXCEPTION 'Organização e data-base são obrigatórias.';
  END IF;

  IF auth.uid() IS NOT NULL
    AND p_org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION 'Acesso negado à política de outra organização.';
  END IF;

  SELECT policy.*
    INTO v_policy
  FROM public.document_sla_policies policy
  WHERE policy.org_id = p_org_id
    AND policy.active
    AND policy.review_due_days IS NOT NULL
    AND policy.step_type IS NULL
    AND (policy.project_id IS NULL OR policy.project_id = p_project_id)
    AND (policy.doc_type IS NULL OR UPPER(policy.doc_type) = UPPER(p_doc_type))
    AND (policy.area IS NULL OR UPPER(policy.area) = UPPER(p_area))
  ORDER BY
    policy.priority ASC,
    (policy.project_id IS NOT NULL) DESC,
    (policy.doc_type IS NOT NULL) DESC,
    (policy.area IS NOT NULL) DESC,
    policy.created_at ASC,
    policy.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.add_business_days(
    p_org_id,
    p_base_date,
    v_policy.review_due_days,
    v_policy.calendar_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.calculate_tramite_step_due_date(
  p_org_id UUID,
  p_base_date DATE,
  p_step_type TEXT DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS DATE
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_policy public.document_sla_policies%ROWTYPE;
BEGIN
  IF p_org_id IS NULL OR p_base_date IS NULL THEN
    RAISE EXCEPTION 'Organização e data-base são obrigatórias.';
  END IF;

  IF auth.uid() IS NOT NULL
    AND p_org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION 'Acesso negado à política de outra organização.';
  END IF;

  SELECT policy.*
    INTO v_policy
  FROM public.document_sla_policies policy
  WHERE policy.org_id = p_org_id
    AND policy.active
    AND policy.step_due_days IS NOT NULL
    AND (policy.project_id IS NULL OR policy.project_id = p_project_id)
    AND (policy.doc_type IS NULL OR UPPER(policy.doc_type) = UPPER(p_doc_type))
    AND (policy.area IS NULL OR UPPER(policy.area) = UPPER(p_area))
    AND (
      policy.step_type IS NULL
      OR LOWER(policy.step_type) = LOWER(p_step_type)
    )
  ORDER BY
    policy.priority ASC,
    (policy.project_id IS NOT NULL) DESC,
    (policy.step_type IS NOT NULL) DESC,
    (policy.doc_type IS NOT NULL) DESC,
    (policy.area IS NOT NULL) DESC,
    policy.created_at ASC,
    policy.id ASC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  RETURN public.add_business_days(
    p_org_id,
    p_base_date,
    v_policy.step_due_days,
    v_policy.calendar_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.is_business_day(UUID, DATE, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_business_days(UUID, DATE, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_document_due_date(
  UUID, DATE, TEXT, TEXT, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.calculate_tramite_step_due_date(
  UUID, DATE, TEXT, TEXT, TEXT, UUID
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.is_business_day(UUID, DATE, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.add_business_days(UUID, DATE, INTEGER, UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_document_due_date(
  UUID, DATE, TEXT, TEXT, UUID
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.calculate_tramite_step_due_date(
  UUID, DATE, TEXT, TEXT, TEXT, UUID
) TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_calendars
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_holidays
  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_sla_policies
  TO authenticated;

GRANT ALL ON public.operational_calendars TO service_role;
GRANT ALL ON public.operational_holidays TO service_role;
GRANT ALL ON public.document_sla_policies TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
