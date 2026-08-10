BEGIN;

CREATE TABLE IF NOT EXISTS public.operational_indicator_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  snapshot_kind TEXT NOT NULL,
  snapshot_date DATE NOT NULL,
  period_from DATE NOT NULL,
  period_to DATE NOT NULL,
  scope TEXT NOT NULL DEFAULT 'org',
  project_id UUID NULL,
  doc_type TEXT NULL,
  area TEXT NULL,
  responsible_user_id UUID NULL,
  severity TEXT NULL,
  status TEXT NULL,
  snapshot_signature TEXT NOT NULL,
  source_version TEXT NOT NULL DEFAULT 'P-26',
  snapshot_source TEXT NOT NULL DEFAULT 'get_operational_indicators',
  report_generated_at TIMESTAMPTZ NULL,
  report JSONB NOT NULL,
  summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID NULL,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT operational_indicator_snapshots_kind_check
    CHECK (snapshot_kind IN ('daily', 'monthly')),
  CONSTRAINT operational_indicator_snapshots_scope_check
    CHECK (scope IN ('org', 'mine')),
  CONSTRAINT operational_indicator_snapshots_period_check
    CHECK (period_to >= period_from),
  CONSTRAINT operational_indicator_snapshots_report_check
    CHECK (jsonb_typeof(report) = 'object'),
  CONSTRAINT operational_indicator_snapshots_summary_check
    CHECK (jsonb_typeof(summary) = 'object'),
  CONSTRAINT operational_indicator_snapshots_org_signature_key
    UNIQUE (org_id, snapshot_signature)
);

CREATE INDEX IF NOT EXISTS idx_operational_indicator_snapshots_org_kind_date
  ON public.operational_indicator_snapshots (
    org_id,
    snapshot_kind,
    snapshot_date DESC,
    captured_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_operational_indicator_snapshots_org_scope_date
  ON public.operational_indicator_snapshots (
    org_id,
    scope,
    snapshot_date DESC,
    captured_at DESC
  );

CREATE INDEX IF NOT EXISTS idx_operational_indicator_snapshots_org_project_date
  ON public.operational_indicator_snapshots (
    org_id,
    project_id,
    snapshot_date DESC
  );

CREATE OR REPLACE FUNCTION public.set_operational_indicator_snapshot_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_operational_indicator_snapshots_updated_at
  ON public.operational_indicator_snapshots;

CREATE TRIGGER trg_operational_indicator_snapshots_updated_at
BEFORE UPDATE ON public.operational_indicator_snapshots
FOR EACH ROW
EXECUTE FUNCTION public.set_operational_indicator_snapshot_updated_at();

ALTER TABLE public.operational_indicator_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS operational_indicator_snapshots_select
  ON public.operational_indicator_snapshots;
DROP POLICY IF EXISTS operational_indicator_snapshots_manage
  ON public.operational_indicator_snapshots;

CREATE POLICY operational_indicator_snapshots_select
  ON public.operational_indicator_snapshots
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR (
        scope = 'mine'
        AND responsible_user_id = auth.uid()
      )
    )
  );

CREATE POLICY operational_indicator_snapshots_manage
  ON public.operational_indicator_snapshots
  FOR ALL
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.current_user_role() IN ('admin', 'manager')
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.current_user_role() IN ('admin', 'manager')
  );

GRANT SELECT ON public.operational_indicator_snapshots TO authenticated;

CREATE OR REPLACE FUNCTION public.build_operational_indicator_snapshot_signature(
  p_snapshot_kind TEXT,
  p_snapshot_date DATE,
  p_period_from DATE,
  p_period_to DATE,
  p_scope TEXT,
  p_project_id UUID DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_responsible_user_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT CONCAT_WS(
    '|',
    LOWER(BTRIM(COALESCE(p_snapshot_kind, ''))),
    COALESCE(TO_CHAR(p_snapshot_date, 'YYYYMMDD'), ''),
    COALESCE(TO_CHAR(p_period_from, 'YYYYMMDD'), ''),
    COALESCE(TO_CHAR(p_period_to, 'YYYYMMDD'), ''),
    LOWER(BTRIM(COALESCE(p_scope, ''))),
    COALESCE(p_project_id::TEXT, ''),
    UPPER(BTRIM(COALESCE(p_doc_type, ''))),
    UPPER(BTRIM(COALESCE(p_area, ''))),
    COALESCE(p_responsible_user_id::TEXT, ''),
    LOWER(BTRIM(COALESCE(p_severity, ''))),
    LOWER(BTRIM(COALESCE(p_status, '')))
  );
$$;

CREATE OR REPLACE FUNCTION public.capture_operational_indicator_snapshot(
  p_snapshot_kind TEXT DEFAULT 'daily',
  p_snapshot_date DATE DEFAULT CURRENT_DATE,
  p_scope TEXT DEFAULT 'org',
  p_project_id UUID DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_responsible_user_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_actor_role TEXT := public.current_user_role();
  v_snapshot_kind TEXT := LOWER(BTRIM(COALESCE(p_snapshot_kind, 'daily')));
  v_scope TEXT := LOWER(BTRIM(COALESCE(p_scope, 'org')));
  v_snapshot_date DATE := COALESCE(p_snapshot_date, CURRENT_DATE);
  v_period_from DATE;
  v_period_to DATE;
  v_responsible_user_id UUID := p_responsible_user_id;
  v_report JSONB;
  v_signature TEXT;
  v_snapshot_id UUID;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório para capturar snapshots.';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não identificada para capturar snapshots.';
  END IF;

  IF v_snapshot_kind NOT IN ('daily', 'monthly') THEN
    RAISE EXCEPTION 'Tipo de snapshot deve ser daily ou monthly.';
  END IF;

  IF v_scope NOT IN ('org', 'mine') THEN
    RAISE EXCEPTION 'Escopo do snapshot deve ser org ou mine.';
  END IF;

  IF v_snapshot_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'Snapshot não pode ser capturado para uma data futura.';
  END IF;

  IF v_scope = 'org' AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem capturar snapshots da organização.'
      USING ERRCODE = '42501';
  END IF;

  IF v_scope = 'mine' THEN
    v_responsible_user_id := COALESCE(v_responsible_user_id, v_actor_id);
    IF v_responsible_user_id IS DISTINCT FROM v_actor_id THEN
      RAISE EXCEPTION
        'No escopo pessoal, o responsável do snapshot deve ser o usuário atual.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_snapshot_kind = 'daily' THEN
    v_period_from := v_snapshot_date;
    v_period_to := v_snapshot_date;
  ELSE
    v_period_from := DATE_TRUNC('month', v_snapshot_date)::DATE;
    v_period_to := LEAST(
      (DATE_TRUNC('month', v_snapshot_date) + INTERVAL '1 month - 1 day')::DATE,
      v_snapshot_date,
      CURRENT_DATE
    );
  END IF;

  IF to_regprocedure(
    'public.get_operational_indicators(date,date,text,uuid,text,text,uuid,text,text)'
  ) IS NULL THEN
    RAISE EXCEPTION 'A função get_operational_indicators não está instalada.';
  END IF;

  SELECT public.get_operational_indicators(
    v_period_from,
    v_period_to,
    v_scope,
    p_project_id,
    NULLIF(BTRIM(p_doc_type), ''),
    NULLIF(BTRIM(p_area), ''),
    v_responsible_user_id,
    NULLIF(LOWER(BTRIM(p_severity)), ''),
    NULLIF(LOWER(BTRIM(p_status)), '')
  )
  INTO v_report;

  IF v_report IS NULL OR jsonb_typeof(v_report) <> 'object' THEN
    RAISE EXCEPTION 'O snapshot não pôde ser gerado a partir da RPC de indicadores.';
  END IF;

  v_signature := public.build_operational_indicator_snapshot_signature(
    v_snapshot_kind,
    v_snapshot_date,
    v_period_from,
    v_period_to,
    v_scope,
    p_project_id,
    NULLIF(BTRIM(p_doc_type), ''),
    NULLIF(BTRIM(p_area), ''),
    v_responsible_user_id,
    NULLIF(LOWER(BTRIM(p_severity)), ''),
    NULLIF(LOWER(BTRIM(p_status)), '')
  );

  INSERT INTO public.operational_indicator_snapshots (
    org_id,
    snapshot_kind,
    snapshot_date,
    period_from,
    period_to,
    scope,
    project_id,
    doc_type,
    area,
    responsible_user_id,
    severity,
    status,
    snapshot_signature,
    source_version,
    report_generated_at,
    report,
    summary,
    created_by
  )
  VALUES (
    v_org_id,
    v_snapshot_kind,
    v_snapshot_date,
    v_period_from,
    v_period_to,
    v_scope,
    p_project_id,
    NULLIF(BTRIM(p_doc_type), ''),
    NULLIF(BTRIM(p_area), ''),
    v_responsible_user_id,
    NULLIF(LOWER(BTRIM(p_severity)), ''),
    NULLIF(LOWER(BTRIM(p_status)), ''),
    v_signature,
    COALESCE(NULLIF(BTRIM(v_report->>'version'), ''), 'P-26'),
    CASE
      WHEN NULLIF(BTRIM(v_report->>'generated_at'), '') IS NULL THEN NULL
      ELSE (v_report->>'generated_at')::TIMESTAMPTZ
    END,
    v_report,
    COALESCE(v_report->'summary', '{}'::JSONB),
    v_actor_id
  )
  ON CONFLICT (org_id, snapshot_signature)
  DO UPDATE SET
    snapshot_date = EXCLUDED.snapshot_date,
    period_from = EXCLUDED.period_from,
    period_to = EXCLUDED.period_to,
    scope = EXCLUDED.scope,
    project_id = EXCLUDED.project_id,
    doc_type = EXCLUDED.doc_type,
    area = EXCLUDED.area,
    responsible_user_id = EXCLUDED.responsible_user_id,
    severity = EXCLUDED.severity,
    status = EXCLUDED.status,
    source_version = EXCLUDED.source_version,
    report_generated_at = EXCLUDED.report_generated_at,
    report = EXCLUDED.report,
    summary = EXCLUDED.summary,
    created_by = EXCLUDED.created_by,
    captured_at = NOW()
  RETURNING id INTO v_snapshot_id;

  RETURN v_snapshot_id;
END;
$$;

REVOKE ALL ON FUNCTION public.capture_operational_indicator_snapshot(
  TEXT, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.capture_operational_indicator_snapshot(
  TEXT, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) TO authenticated;

CREATE OR REPLACE FUNCTION public.list_operational_indicator_snapshots(
  p_snapshot_kind TEXT DEFAULT NULL,
  p_scope TEXT DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_limit INTEGER DEFAULT 24
)
RETURNS TABLE (
  id UUID,
  snapshot_kind TEXT,
  snapshot_date DATE,
  period_from DATE,
  period_to DATE,
  scope TEXT,
  project_id UUID,
  doc_type TEXT,
  area TEXT,
  responsible_user_id UUID,
  severity TEXT,
  status TEXT,
  source_version TEXT,
  report_generated_at TIMESTAMPTZ,
  captured_at TIMESTAMPTZ,
  summary JSONB,
  report JSONB
)
LANGUAGE SQL
STABLE
SET search_path = public, pg_catalog
AS $$
  SELECT
    snapshot.id,
    snapshot.snapshot_kind,
    snapshot.snapshot_date,
    snapshot.period_from,
    snapshot.period_to,
    snapshot.scope,
    snapshot.project_id,
    snapshot.doc_type,
    snapshot.area,
    snapshot.responsible_user_id,
    snapshot.severity,
    snapshot.status,
    snapshot.source_version,
    snapshot.report_generated_at,
    snapshot.captured_at,
    snapshot.summary,
    snapshot.report
  FROM public.operational_indicator_snapshots snapshot
  WHERE snapshot.org_id = public.current_user_org_id()
    AND (
      public.current_user_role() IN ('admin', 'manager')
      OR (
        snapshot.scope = 'mine'
        AND snapshot.responsible_user_id = auth.uid()
      )
    )
    AND (
      NULLIF(LOWER(BTRIM(COALESCE(p_snapshot_kind, ''))), '') IS NULL
      OR snapshot.snapshot_kind = LOWER(BTRIM(p_snapshot_kind))
    )
    AND (
      NULLIF(LOWER(BTRIM(COALESCE(p_scope, ''))), '') IS NULL
      OR snapshot.scope = LOWER(BTRIM(p_scope))
    )
    AND (
      p_project_id IS NULL
      OR snapshot.project_id = p_project_id
    )
  ORDER BY snapshot.snapshot_date DESC, snapshot.captured_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 24), 1), 120);
$$;

REVOKE ALL ON FUNCTION public.list_operational_indicator_snapshots(
  TEXT, TEXT, UUID, INTEGER
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.list_operational_indicator_snapshots(
  TEXT, TEXT, UUID, INTEGER
) TO authenticated;

COMMENT ON TABLE public.operational_indicator_snapshots IS
  'Snapshots analíticos de indicadores operacionais, preservando o retrato do recorte em data de captura.';

COMMENT ON FUNCTION public.capture_operational_indicator_snapshot(
  TEXT, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) IS
  'Captura snapshot diário ou mensal dos indicadores operacionais a partir da RPC get_operational_indicators.';

COMMENT ON FUNCTION public.list_operational_indicator_snapshots(
  TEXT, TEXT, UUID, INTEGER
) IS
  'Lista snapshots de indicadores operacionais disponíveis para a organização e escopo do usuário.';

NOTIFY pgrst, 'reload schema';

COMMIT;
