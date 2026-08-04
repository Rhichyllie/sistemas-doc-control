-- P-26 — Indicadores Operacionais, SLA, Gargalos e Performance Documental
-- Nome no Supabase SQL Editor: 25_TRAMITA_operational_indicators
--
-- Migration aditiva e estritamente analítica. A função abaixo não insere,
-- atualiza ou remove dados operacionais e não chama geração de notificações.

BEGIN;

DO $indexes$
BEGIN
  IF to_regclass('public.documents') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'documents'
         AND column_name = 'next_review_at'
     ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_documents_org_status_review
      ON public.documents(org_id, status, next_review_at)';
  END IF;

  IF to_regclass('public.documents') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'documents'
         AND column_name = 'project_id'
     ) THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_documents_org_context
      ON public.documents(org_id, project_id, area, doc_type)';
  END IF;

  IF to_regclass('public.document_tramite_instance_steps') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_tramite_steps_org_status_type
      ON public.document_tramite_instance_steps(
        org_id, status, node_type, updated_at DESC
      )';
  END IF;

  IF to_regclass('public.document_tramite_instances') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_tramite_instances_org_completed
      ON public.document_tramite_instances(
        org_id, status, completed_at DESC
      )';
  END IF;

  IF to_regclass('public.document_tramite_instance_events') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_tramite_events_org_type_created
      ON public.document_tramite_instance_events(
        org_id, event_type, created_at DESC
      )';
  END IF;

  IF to_regclass('public.notification_events') IS NOT NULL THEN
    EXECUTE '
      CREATE INDEX IF NOT EXISTS idx_p26_notification_events_org_type_created
      ON public.notification_events(org_id, event_type, created_at DESC)';
  END IF;
END;
$indexes$;

CREATE OR REPLACE FUNCTION public.get_operational_indicators(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_scope TEXT DEFAULT 'org',
  p_project_id UUID DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
  p_responsible_user_id UUID DEFAULT NULL,
  p_severity TEXT DEFAULT NULL,
  p_status TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_actor_role TEXT;
  v_scope TEXT := LOWER(BTRIM(COALESCE(p_scope, 'org')));
  v_from DATE := COALESCE(p_from, CURRENT_DATE - 30);
  v_to DATE := COALESCE(p_to, CURRENT_DATE);
  v_period_days INTEGER;
  v_previous_from DATE;
  v_previous_to DATE;
  v_due_soon_date DATE := CURRENT_DATE + 3;

  v_documents_available BOOLEAN :=
    to_regclass('public.documents') IS NOT NULL;
  v_projects_available BOOLEAN :=
    to_regclass('public.projects') IS NOT NULL;
  v_instances_available BOOLEAN :=
    to_regclass('public.document_tramite_instances') IS NOT NULL;
  v_steps_available BOOLEAN :=
    to_regclass('public.document_tramite_instance_steps') IS NOT NULL;
  v_events_available BOOLEAN :=
    to_regclass('public.document_tramite_instance_events') IS NOT NULL;
  v_evidence_available BOOLEAN :=
    to_regclass('public.document_tramite_instance_evidence') IS NOT NULL;
  v_calendar_available BOOLEAN :=
    to_regclass('public.operational_calendars') IS NOT NULL
    AND to_regclass('public.document_sla_policies') IS NOT NULL;
  v_availability_available BOOLEAN :=
    to_regclass('public.team_absences') IS NOT NULL
    AND to_regclass('public.team_delegation_rules') IS NOT NULL;
  v_notifications_available BOOLEAN :=
    to_regclass('public.internal_notifications') IS NOT NULL
    AND to_regclass('public.notification_events') IS NOT NULL;
  v_audit_available BOOLEAN :=
    to_regclass('public.audit_trail') IS NOT NULL;
  v_approvals_available BOOLEAN :=
    to_regclass('public.approval_flows') IS NOT NULL;
  v_substitute_functions_available BOOLEAN :=
    to_regprocedure(
      'public.is_user_unavailable(uuid,uuid,timestamp with time zone)'
    ) IS NOT NULL
    AND to_regprocedure(
      'public.resolve_user_substitute(uuid,uuid,timestamp with time zone,uuid,text,text,text)'
    ) IS NOT NULL;

  v_documents JSONB := jsonb_build_object(
    'active_documents', NULL,
    'drafts', NULL,
    'without_code', NULL,
    'without_project', NULL,
    'without_next_review', NULL,
    'with_review_overdue', NULL,
    'with_review_due_soon', NULL,
    'created_in_period', NULL,
    'created_previous_period', NULL
  );
  v_tramites JSONB := jsonb_build_object(
    'active_instances', NULL,
    'completed_instances_in_period', NULL,
    'failed_instances_in_period', NULL,
    'completion_rate', NULL,
    'completed_steps_in_period', NULL,
    'average_step_cycle_hours', NULL,
    'average_instance_cycle_hours', NULL,
    'active_steps', NULL,
    'overdue_steps', NULL,
    'due_soon_steps', NULL,
    'stalled_active_steps', NULL,
    'active_steps_without_due_date', NULL,
    'completed_steps_previous_period', NULL,
    'completed_instances_previous_period', NULL
  );
  v_notifications JSONB := jsonb_build_object(
    'unread', NULL,
    'critical_unread', NULL,
    'open_escalations', NULL,
    'created_in_period', NULL,
    'generated_in_period', NULL,
    'escalated_in_period', NULL,
    'suppressed_in_period', NULL,
    'last_generation_at', NULL,
    'last_generation_errors', NULL
  );
  v_delegations JSONB := jsonb_build_object(
    'active_absences', NULL,
    'active_delegations', NULL,
    'delegated_step_completions', NULL,
    'unavailable_responsibles_with_active_steps', NULL,
    'active_steps_with_substitute_available', NULL,
    'active_steps_without_substitute', NULL
  );
  v_sla JSONB;
  v_quality JSONB;
  v_bottlenecks JSONB := jsonb_build_object(
    'by_project', '[]'::JSONB,
    'by_area', '[]'::JSONB,
    'by_doc_type', '[]'::JSONB,
    'by_step_type', '[]'::JSONB,
    'by_responsible', '[]'::JSONB,
    'evidence_pending', '[]'::JSONB,
    'longest_stalled_steps', '[]'::JSONB
  );
  v_dimensions JSONB := jsonb_build_object(
    'projects', '[]'::JSONB,
    'areas', '[]'::JSONB,
    'doc_types', '[]'::JSONB,
    'responsibles', '[]'::JSONB,
    'statuses', '[]'::JSONB
  );
  v_recommendations JSONB := '[]'::JSONB;

  v_doc_due_total INTEGER := 0;
  v_doc_due_on_time INTEGER := 0;
  v_doc_due_soon INTEGER := 0;
  v_doc_due_overdue INTEGER := 0;
  v_step_due_total INTEGER := 0;
  v_step_due_on_time INTEGER := 0;
  v_step_due_soon INTEGER := 0;
  v_step_due_overdue INTEGER := 0;
  v_pending_evidence INTEGER := NULL;
  v_without_sla INTEGER := NULL;
  v_suggested_without_instance INTEGER := NULL;
  v_unavailable_steps INTEGER := NULL;
  v_steps_with_substitute INTEGER := NULL;
  v_steps_without_substitute INTEGER := NULL;
  v_delegated_completions INTEGER := NULL;
  v_critical_notifications INTEGER := 0;
  v_open_escalations INTEGER := 0;

  v_by_project JSONB := '[]'::JSONB;
  v_by_area JSONB := '[]'::JSONB;
  v_by_doc_type JSONB := '[]'::JSONB;
  v_by_step_type JSONB := '[]'::JSONB;
  v_by_responsible JSONB := '[]'::JSONB;
  v_evidence_pending_rows JSONB := '[]'::JSONB;
  v_longest_stalled JSONB := '[]'::JSONB;
  v_areas_dimension JSONB := '[]'::JSONB;
  v_doc_types_dimension JSONB := '[]'::JSONB;
  v_statuses_dimension JSONB := '[]'::JSONB;
  v_responsibles_dimension JSONB := '[]'::JSONB;
  v_projects_dimension JSONB := '[]'::JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório.';
  END IF;

  SELECT profile.org_id, profile.role::TEXT
  INTO v_org_id, v_actor_role
  FROM public.profiles profile
  WHERE profile.id = v_actor_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Perfil ou organização não encontrados.';
  END IF;

  IF v_scope NOT IN ('org', 'mine') THEN
    RAISE EXCEPTION 'Escopo deve ser org ou mine.';
  END IF;

  IF v_scope = 'org' AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem consultar indicadores da organização.'
      USING ERRCODE = '42501';
  END IF;

  IF v_scope = 'mine'
     AND p_responsible_user_id IS NOT NULL
     AND p_responsible_user_id <> v_actor_id THEN
    RAISE EXCEPTION
      'No escopo pessoal, o responsável deve ser o usuário atual.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to < v_from THEN
    RAISE EXCEPTION 'A data final deve ser igual ou posterior à data inicial.';
  END IF;

  IF (v_to - v_from) > 365 THEN
    RAISE EXCEPTION 'O período máximo para indicadores é 365 dias.';
  END IF;

  IF v_from > CURRENT_DATE + 1 OR v_to > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'O período não pode estar no futuro.';
  END IF;

  IF p_severity IS NOT NULL
     AND LOWER(BTRIM(p_severity)) NOT IN (
       'info', 'success', 'warning', 'danger', 'critical'
     ) THEN
    RAISE EXCEPTION 'Severidade inválida.';
  END IF;

  v_period_days := (v_to - v_from) + 1;
  v_previous_to := v_from - 1;
  v_previous_from := v_previous_to - (v_period_days - 1);

  IF to_regprocedure(
    'public.add_business_days(uuid,date,integer,uuid)'
  ) IS NOT NULL THEN
    BEGIN
      EXECUTE
        'SELECT public.add_business_days($1, $2, $3, $4)'
      INTO v_due_soon_date
      USING v_org_id, CURRENT_DATE, 3, NULL::UUID;
    EXCEPTION WHEN OTHERS THEN
      v_due_soon_date := CURRENT_DATE + 3;
    END;
  END IF;

  IF v_documents_available THEN
    SELECT jsonb_build_object(
      'active_documents', COUNT(*) FILTER (
        WHERE LOWER(d.status) NOT IN ('obsolete', 'archived')
      ),
      'drafts', COUNT(*) FILTER (WHERE LOWER(d.status) = 'draft'),
      'without_code', COUNT(*) FILTER (
        WHERE LOWER(d.status) NOT IN ('obsolete', 'archived')
          AND NULLIF(BTRIM(COALESCE(d.code, '')), '') IS NULL
      ),
      'without_project', COUNT(*) FILTER (
        WHERE LOWER(d.status) NOT IN ('obsolete', 'archived')
          AND d.project_id IS NULL
      ),
      'without_next_review', COUNT(*) FILTER (
        WHERE LOWER(d.status) = 'published' AND d.next_review_at IS NULL
      ),
      'with_review_overdue', COUNT(*) FILTER (
        WHERE LOWER(d.status) = 'published'
          AND d.next_review_at < CURRENT_DATE
      ),
      'with_review_due_soon', COUNT(*) FILTER (
        WHERE LOWER(d.status) = 'published'
          AND d.next_review_at BETWEEN CURRENT_DATE AND v_due_soon_date
      ),
      'created_in_period', COUNT(*) FILTER (
        WHERE d.created_at >= v_from
          AND d.created_at < (v_to + 1)
      ),
      'created_previous_period', COUNT(*) FILTER (
        WHERE d.created_at >= v_previous_from
          AND d.created_at < (v_previous_to + 1)
      )
    )
    INTO v_documents
    FROM public.documents d
    WHERE d.org_id = v_org_id
      AND (p_project_id IS NULL OR d.project_id = p_project_id)
      AND (
        NULLIF(BTRIM(p_doc_type), '') IS NULL
        OR UPPER(d.doc_type) = UPPER(BTRIM(p_doc_type))
      )
      AND (
        NULLIF(BTRIM(p_area), '') IS NULL
        OR UPPER(d.area) = UPPER(BTRIM(p_area))
      )
      AND (
        p_responsible_user_id IS NULL
        OR d.author_id = p_responsible_user_id
      )
      AND (v_scope = 'org' OR d.author_id = v_actor_id)
      AND (
        NULLIF(BTRIM(p_status), '') IS NULL
        OR LOWER(d.status) = LOWER(BTRIM(p_status))
      );

    SELECT
      COUNT(*) FILTER (WHERE d.next_review_at IS NOT NULL),
      COUNT(*) FILTER (
        WHERE d.next_review_at > v_due_soon_date
      ),
      COUNT(*) FILTER (
        WHERE d.next_review_at BETWEEN CURRENT_DATE AND v_due_soon_date
      ),
      COUNT(*) FILTER (
        WHERE d.next_review_at < CURRENT_DATE
      )
    INTO
      v_doc_due_total,
      v_doc_due_on_time,
      v_doc_due_soon,
      v_doc_due_overdue
    FROM public.documents d
    WHERE d.org_id = v_org_id
      AND LOWER(d.status) = 'published'
      AND (p_project_id IS NULL OR d.project_id = p_project_id)
      AND (
        NULLIF(BTRIM(p_doc_type), '') IS NULL
        OR UPPER(d.doc_type) = UPPER(BTRIM(p_doc_type))
      )
      AND (
        NULLIF(BTRIM(p_area), '') IS NULL
        OR UPPER(d.area) = UPPER(BTRIM(p_area))
      )
      AND (
        p_responsible_user_id IS NULL
        OR d.author_id = p_responsible_user_id
      )
      AND (v_scope = 'org' OR d.author_id = v_actor_id);

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'label'), '[]'::JSONB)
    INTO v_areas_dimension
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'value', COALESCE(NULLIF(BTRIM(d.area), ''), 'Sem área'),
        'label', COALESCE(NULLIF(BTRIM(d.area), ''), 'Sem área')
      ) AS item
      FROM public.documents d
      WHERE d.org_id = v_org_id
        AND (v_scope = 'org' OR d.author_id = v_actor_id)
    ) areas;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'label'), '[]'::JSONB)
    INTO v_doc_types_dimension
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'value', UPPER(d.doc_type),
        'label', UPPER(d.doc_type)
      ) AS item
      FROM public.documents d
      WHERE d.org_id = v_org_id
        AND (v_scope = 'org' OR d.author_id = v_actor_id)
    ) types;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'label'), '[]'::JSONB)
    INTO v_statuses_dimension
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'value', d.status,
        'label', d.status
      ) AS item
      FROM public.documents d
      WHERE d.org_id = v_org_id
        AND (v_scope = 'org' OR d.author_id = v_actor_id)
    ) statuses;

    SELECT COALESCE(jsonb_agg(item ORDER BY item->>'label'), '[]'::JSONB)
    INTO v_projects_dimension
    FROM (
      SELECT DISTINCT jsonb_build_object(
        'value', d.project_id,
        'label', 'Projeto ' || LEFT(d.project_id::TEXT, 8)
      ) AS item
      FROM public.documents d
      WHERE d.org_id = v_org_id
        AND d.project_id IS NOT NULL
        AND (v_scope = 'org' OR d.author_id = v_actor_id)
    ) projects;
  END IF;

  SELECT COALESCE(jsonb_agg(item ORDER BY item->>'label'), '[]'::JSONB)
  INTO v_responsibles_dimension
  FROM (
    SELECT jsonb_build_object(
      'value', profile.id,
      'label', COALESCE(
        NULLIF(BTRIM(profile.full_name), ''),
        'Usuário ' || LEFT(profile.id::TEXT, 8)
      )
    ) AS item
    FROM public.profiles profile
    WHERE profile.org_id = v_org_id
      AND (v_scope = 'org' OR profile.id = v_actor_id)
  ) responsibles;

  v_dimensions := jsonb_build_object(
    'projects', v_projects_dimension,
    'areas', v_areas_dimension,
    'doc_types', v_doc_types_dimension,
    'responsibles', v_responsibles_dimension,
    'statuses', v_statuses_dimension
  );

  IF v_documents_available
     AND v_instances_available
     AND v_steps_available THEN
    EXECUTE $sql$
      WITH filtered_steps AS (
        SELECT s.*, d.project_id, d.area, d.doc_type, d.author_id,
               d.status AS document_status
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1
          AND d.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND (
            $5::UUID IS NULL
            OR s.assignee_user_id = $5
            OR s.completed_by = $5
          )
          AND (
            $6::TEXT = 'org'
            OR s.assignee_user_id = $7
            OR (
              s.assignment_type IN ('author', 'document_owner')
              AND d.author_id = $7
            )
            OR (
              s.assignment_type = 'role'
              AND s.required_role = $8
            )
          )
          AND ($9::TEXT IS NULL OR LOWER(d.status) = LOWER($9))
      ),
      filtered_instances AS (
        SELECT i.*
        FROM public.document_tramite_instances i
        JOIN public.documents d ON d.id = i.document_id
        WHERE i.org_id = $1
          AND d.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($9::TEXT IS NULL OR LOWER(d.status) = LOWER($9))
          AND (
            $5::UUID IS NULL
            OR i.started_by = $5
            OR d.author_id = $5
            OR EXISTS (
              SELECT 1
              FROM public.document_tramite_instance_steps rs
              WHERE rs.instance_id = i.id
                AND (rs.assignee_user_id = $5 OR rs.completed_by = $5)
            )
          )
          AND (
            $6::TEXT = 'org'
            OR i.started_by = $7
            OR d.author_id = $7
            OR EXISTS (
              SELECT 1
              FROM public.document_tramite_instance_steps ms
              WHERE ms.instance_id = i.id
                AND (
                  ms.assignee_user_id = $7
                  OR (
                    ms.assignment_type = 'role'
                    AND ms.required_role = $8
                  )
                )
            )
          )
      )
      SELECT jsonb_build_object(
        'active_instances',
          (SELECT COUNT(*) FROM filtered_instances WHERE status = 'active'),
        'completed_instances_in_period',
          (SELECT COUNT(*) FROM filtered_instances
           WHERE status = 'completed'
             AND completed_at >= $10::DATE
             AND completed_at < ($11::DATE + 1)),
        'failed_instances_in_period',
          (SELECT COUNT(*) FROM filtered_instances
           WHERE status = 'failed'
             AND updated_at >= $10::DATE
             AND updated_at < ($11::DATE + 1)),
        'completion_rate',
          (
            SELECT CASE
              WHEN COUNT(*) FILTER (
                WHERE status IN ('completed', 'failed')
                  AND COALESCE(completed_at, updated_at) >= $10::DATE
                  AND COALESCE(completed_at, updated_at) < ($11::DATE + 1)
              ) = 0 THEN NULL
              ELSE ROUND(
                (
                  COUNT(*) FILTER (
                    WHERE status = 'completed'
                      AND completed_at >= $10::DATE
                      AND completed_at < ($11::DATE + 1)
                  )::NUMERIC
                  / COUNT(*) FILTER (
                    WHERE status IN ('completed', 'failed')
                      AND COALESCE(completed_at, updated_at) >= $10::DATE
                      AND COALESCE(completed_at, updated_at) < ($11::DATE + 1)
                  )
                ) * 100,
                1
              )
            END
            FROM filtered_instances
          ),
        'completed_steps_in_period',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'completed'
             AND completed_at >= $10::DATE
             AND completed_at < ($11::DATE + 1)),
        'average_step_cycle_hours',
          (SELECT ROUND(AVG(
             EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600
           )::NUMERIC, 2)
           FROM filtered_steps
           WHERE status = 'completed'
             AND started_at IS NOT NULL
             AND completed_at >= $10::DATE
             AND completed_at < ($11::DATE + 1)),
        'average_instance_cycle_hours',
          (SELECT ROUND(AVG(
             EXTRACT(EPOCH FROM (completed_at - started_at)) / 3600
           )::NUMERIC, 2)
           FROM filtered_instances
           WHERE status = 'completed'
             AND completed_at >= $10::DATE
             AND completed_at < ($11::DATE + 1)),
        'active_steps',
          (SELECT COUNT(*) FROM filtered_steps WHERE status = 'active'),
        'overdue_steps',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'active' AND due_at < NOW()),
        'due_soon_steps',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'active'
             AND due_at >= NOW()
             AND due_at < ($12::DATE + 1)),
        'stalled_active_steps',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'active'
             AND COALESCE(started_at, updated_at, created_at)
                 < NOW() - INTERVAL '72 hours'),
        'active_steps_without_due_date',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'active' AND due_at IS NULL),
        'completed_steps_previous_period',
          (SELECT COUNT(*) FROM filtered_steps
           WHERE status = 'completed'
             AND completed_at >= $13::DATE
             AND completed_at < ($14::DATE + 1)),
        'completed_instances_previous_period',
          (SELECT COUNT(*) FROM filtered_instances
           WHERE status = 'completed'
             AND completed_at >= $13::DATE
             AND completed_at < ($14::DATE + 1))
      )
    $sql$
    INTO v_tramites
    USING
      v_org_id,
      p_project_id,
      NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''),
      p_responsible_user_id,
      v_scope,
      v_actor_id,
      v_actor_role,
      NULLIF(BTRIM(p_status), ''),
      v_from,
      v_to,
      v_due_soon_date,
      v_previous_from,
      v_previous_to;

    EXECUTE $sql$
      WITH filtered AS (
        SELECT s.*
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1
          AND s.status = 'active'
          AND d.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
          AND ($8::TEXT IS NULL OR LOWER(d.status) = LOWER($8))
      )
      SELECT
        COUNT(*) FILTER (WHERE due_at IS NOT NULL),
        COUNT(*) FILTER (WHERE due_at > ($9::DATE + 1)),
        COUNT(*) FILTER (
          WHERE due_at >= NOW() AND due_at < ($9::DATE + 1)
        ),
        COUNT(*) FILTER (WHERE due_at < NOW())
      FROM filtered
    $sql$
    INTO
      v_step_due_total,
      v_step_due_on_time,
      v_step_due_soon,
      v_step_due_overdue
    USING
      v_org_id,
      p_project_id,
      NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''),
      p_responsible_user_id,
      v_scope,
      v_actor_id,
      NULLIF(BTRIM(p_status), ''),
      v_due_soon_date;

    EXECUTE $sql$
      WITH filtered AS (
        SELECT s.id, s.label, s.node_type, s.document_id, s.due_at,
               s.assignee_user_id, d.code, d.title
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND s.status = 'active'
          AND d.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
      )
      SELECT COALESCE(jsonb_agg(item ORDER BY item->>'age_hours' DESC),
                      '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'id', f.id,
          'label', f.label,
          'step_type', f.node_type,
          'document_id', f.document_id,
          'document_code', f.code,
          'document_title', f.title,
          'due_at', f.due_at,
          'age_hours', ROUND(EXTRACT(EPOCH FROM (
            NOW() - COALESCE(f.due_at, NOW())
          )) / 3600)
        ) AS item
        FROM filtered f
        ORDER BY COALESCE(f.due_at, NOW()) ASC
        LIMIT 10
      ) ranked
    $sql$
    INTO v_longest_stalled
    USING
      v_org_id,
      p_project_id,
      NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''),
      p_responsible_user_id,
      v_scope,
      v_actor_id;

    EXECUTE $sql$
      WITH risks AS (
        SELECT
          COALESCE(d.project_id::TEXT, 'sem-projeto') AS key,
          CASE WHEN d.project_id IS NULL
            THEN 'Sem projeto'
            ELSE 'Projeto ' || LEFT(d.project_id::TEXT, 8)
          END AS label,
          COUNT(*) AS count
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active' AND s.due_at < NOW()
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
        GROUP BY d.project_id
        ORDER BY count DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) ORDER BY count DESC), '[]'::JSONB)
      FROM risks
    $sql$
    INTO v_by_project
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;

    EXECUTE $sql$
      WITH risks AS (
        SELECT
          COALESCE(NULLIF(BTRIM(d.area), ''), 'Sem área') AS key,
          COALESCE(NULLIF(BTRIM(d.area), ''), 'Sem área') AS label,
          COUNT(*) AS count
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active' AND s.due_at < NOW()
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
        GROUP BY d.area
        ORDER BY count DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) ORDER BY count DESC), '[]'::JSONB) FROM risks
    $sql$
    INTO v_by_area
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;

    EXECUTE $sql$
      WITH risks AS (
        SELECT UPPER(d.doc_type) AS key, UPPER(d.doc_type) AS label,
               COUNT(*) AS count
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active' AND s.due_at < NOW()
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
        GROUP BY d.doc_type
        ORDER BY count DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) ORDER BY count DESC), '[]'::JSONB) FROM risks
    $sql$
    INTO v_by_doc_type
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;

    EXECUTE $sql$
      WITH risks AS (
        SELECT s.node_type AS key, s.node_type AS label, COUNT(*) AS count
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active' AND s.due_at < NOW()
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
        GROUP BY s.node_type
        ORDER BY count DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) ORDER BY count DESC), '[]'::JSONB) FROM risks
    $sql$
    INTO v_by_step_type
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;

    EXECUTE $sql$
      WITH risks AS (
        SELECT
          COALESCE(s.assignee_user_id::TEXT, 'sem-responsavel') AS key,
          COALESCE(
            NULLIF(BTRIM(profile.full_name), ''),
            CASE WHEN s.assignee_user_id IS NULL
              THEN 'Sem responsável'
              ELSE 'Usuário ' || LEFT(s.assignee_user_id::TEXT, 8)
            END
          ) AS label,
          COUNT(*) AS count
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        LEFT JOIN public.profiles profile ON profile.id = s.assignee_user_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active' AND s.due_at < NOW()
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
        GROUP BY s.assignee_user_id, profile.full_name
        ORDER BY count DESC
        LIMIT 8
      )
      SELECT COALESCE(jsonb_agg(jsonb_build_object(
        'key', key, 'label', label, 'count', count
      ) ORDER BY count DESC), '[]'::JSONB) FROM risks
    $sql$
    INTO v_by_responsible
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;
  END IF;

  IF v_documents_available
     AND v_steps_available
     AND v_evidence_available THEN
    EXECUTE $sql$
      WITH pending AS (
        SELECT s.id, s.label, s.document_id, d.code, d.title, s.required_file
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active'
          AND (s.required_evidence OR s.required_file)
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
          AND ($6::TEXT = 'org' OR s.assignee_user_id = $7)
          AND NOT EXISTS (
            SELECT 1
            FROM public.document_tramite_instance_evidence evidence
            WHERE evidence.step_id = s.id
              AND (
                NOT s.required_file
                OR evidence.evidence_type = 'file'
              )
          )
      )
      SELECT
        (SELECT COUNT(*) FROM pending),
        (
          SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', id,
            'label', label,
            'document_id', document_id,
            'document_code', code,
            'document_title', title,
            'required_file', required_file
          )), '[]'::JSONB)
          FROM (SELECT * FROM pending ORDER BY label LIMIT 10) limited
        )
    $sql$
    INTO v_pending_evidence, v_evidence_pending_rows
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;
  END IF;

  IF v_notifications_available THEN
    EXECUTE $sql$
      WITH filtered_notifications AS (
        SELECT notification.*
        FROM public.internal_notifications notification
        LEFT JOIN public.documents d ON d.id = notification.document_id
        WHERE notification.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND (
            $5::UUID IS NULL
            OR notification.recipient_user_id = $5
          )
          AND (
            $6::TEXT = 'org'
            OR notification.recipient_user_id = $7
          )
          AND ($8::TEXT IS NULL OR notification.severity = $8)
          AND ($9::TEXT IS NULL OR LOWER(d.status) = LOWER($9))
      ),
      filtered_events AS (
        SELECT event.*
        FROM public.notification_events event
        LEFT JOIN public.documents d ON d.id = event.document_id
        WHERE event.org_id = $1
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND (
            $5::UUID IS NULL
            OR event.recipient_user_id = $5
            OR event.actor_user_id = $5
          )
          AND (
            $6::TEXT = 'org'
            OR event.recipient_user_id = $7
            OR event.actor_user_id = $7
          )
          AND ($9::TEXT IS NULL OR LOWER(d.status) = LOWER($9))
      )
      SELECT jsonb_build_object(
        'unread', (SELECT COUNT(*) FROM filtered_notifications
          WHERE read_at IS NULL AND dismissed_at IS NULL),
        'critical_unread', (SELECT COUNT(*) FROM filtered_notifications
          WHERE read_at IS NULL AND dismissed_at IS NULL
            AND severity IN ('danger', 'critical')),
        'open_escalations', (SELECT COUNT(*) FROM filtered_notifications
          WHERE read_at IS NULL AND dismissed_at IS NULL
            AND (
              notification_type = 'notification_escalated'
              OR metadata->>'source' IN (
                'escalation_rule', 'default_escalation'
              )
            )),
        'created_in_period', (SELECT COUNT(*) FROM filtered_notifications
          WHERE created_at >= $10::DATE AND created_at < ($11::DATE + 1)),
        'generated_in_period', (SELECT COUNT(*) FROM filtered_events
          WHERE event_type = 'notification_generated'
            AND created_at >= $10::DATE AND created_at < ($11::DATE + 1)),
        'escalated_in_period', (SELECT COUNT(*) FROM filtered_events
          WHERE event_type = 'notification_escalated'
            AND created_at >= $10::DATE AND created_at < ($11::DATE + 1)),
        'suppressed_in_period', (SELECT COUNT(*) FROM filtered_events
          WHERE event_type = 'notification_suppressed'
            AND created_at >= $10::DATE AND created_at < ($11::DATE + 1)),
        'last_generation_at', (SELECT MAX(created_at) FROM filtered_events
          WHERE event_type = 'notification_generated'),
        'last_generation_errors', NULL
      )
    $sql$
    INTO v_notifications
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id, NULLIF(LOWER(BTRIM(p_severity)), ''),
      NULLIF(LOWER(BTRIM(p_status)), ''), v_from, v_to;

    v_critical_notifications :=
      COALESCE((v_notifications->>'critical_unread')::INTEGER, 0);
    v_open_escalations :=
      COALESCE((v_notifications->>'open_escalations')::INTEGER, 0);
  END IF;

  IF v_availability_available THEN
    EXECUTE $sql$
      SELECT jsonb_build_object(
        'active_absences', (
          SELECT COUNT(*)
          FROM public.team_absences absence
          WHERE absence.org_id = $1
            AND absence.status IN ('scheduled', 'active')
            AND absence.starts_at <= NOW()
            AND absence.ends_at > NOW()
            AND ($2::UUID IS NULL OR absence.user_id = $2)
            AND (
              $3::TEXT = 'org'
              OR absence.user_id = $4
              OR absence.substitute_user_id = $4
            )
        ),
        'active_delegations', (
          SELECT COUNT(*)
          FROM public.team_delegation_rules delegation
          WHERE delegation.org_id = $1
            AND delegation.active = true
            AND (
              delegation.starts_at IS NULL
              OR delegation.starts_at <= NOW()
            )
            AND (
              delegation.ends_at IS NULL
              OR delegation.ends_at > NOW()
            )
            AND (
              $2::UUID IS NULL
              OR delegation.owner_user_id = $2
              OR delegation.substitute_user_id = $2
            )
            AND (
              $3::TEXT = 'org'
              OR delegation.owner_user_id = $4
              OR delegation.substitute_user_id = $4
            )
        )
      )
    $sql$
    INTO v_delegations
    USING v_org_id, p_responsible_user_id, v_scope, v_actor_id;
  END IF;

  IF v_events_available AND v_documents_available THEN
    EXECUTE $sql$
      SELECT COUNT(*)
      FROM public.document_tramite_instance_events event
      JOIN public.documents d ON d.id = event.document_id
      WHERE event.org_id = $1
        AND event.event_type = 'step_completed'
        AND NULLIF(
          BTRIM(COALESCE(event.metadata->>'delegated_from_user_id', '')),
          ''
        ) IS NOT NULL
        AND event.created_at >= $2::DATE
        AND event.created_at < ($3::DATE + 1)
        AND ($4::UUID IS NULL OR d.project_id = $4)
        AND ($5::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($5))
        AND ($6::TEXT IS NULL OR UPPER(d.area) = UPPER($6))
        AND (
          $7::UUID IS NULL
          OR event.actor_id = $7
          OR event.metadata->>'delegated_from_user_id' = $7::TEXT
        )
        AND (
          $8::TEXT = 'org'
          OR event.actor_id = $9
          OR event.metadata->>'delegated_from_user_id' = $9::TEXT
        )
    $sql$
    INTO v_delegated_completions
    USING
      v_org_id, v_from, v_to, p_project_id,
      NULLIF(BTRIM(p_doc_type), ''), NULLIF(BTRIM(p_area), ''),
      p_responsible_user_id, v_scope, v_actor_id;
  END IF;

  v_delegations := v_delegations || jsonb_build_object(
    'delegated_step_completions', v_delegated_completions
  );

  IF v_documents_available
     AND v_steps_available
     AND v_availability_available
     AND v_substitute_functions_available THEN
    EXECUTE $sql$
      WITH resolved AS MATERIALIZED (
        SELECT
          s.assignee_user_id,
          public.is_user_unavailable(
            s.org_id, s.assignee_user_id, NOW()
          ) AS unavailable,
          public.resolve_user_substitute(
            s.org_id, s.assignee_user_id, NOW(),
            d.project_id, d.doc_type, d.area, s.node_type
          ) AS substitute_user_id
        FROM public.document_tramite_instance_steps s
        JOIN public.documents d ON d.id = s.document_id
        WHERE s.org_id = $1 AND d.org_id = $1
          AND s.status = 'active'
          AND s.assignment_type = 'specific_user'
          AND s.assignee_user_id IS NOT NULL
          AND ($2::UUID IS NULL OR d.project_id = $2)
          AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
          AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
          AND ($5::UUID IS NULL OR s.assignee_user_id = $5)
      ),
      scoped AS (
        SELECT * FROM resolved
        WHERE $6::TEXT = 'org'
          OR assignee_user_id = $7
          OR substitute_user_id = $7
      )
      SELECT
        COUNT(*) FILTER (WHERE unavailable),
        COUNT(*) FILTER (WHERE unavailable AND substitute_user_id IS NOT NULL),
        COUNT(*) FILTER (WHERE unavailable AND substitute_user_id IS NULL)
      FROM scoped
    $sql$
    INTO
      v_unavailable_steps,
      v_steps_with_substitute,
      v_steps_without_substitute
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), p_responsible_user_id,
      v_scope, v_actor_id;

    v_delegations := v_delegations || jsonb_build_object(
      'unavailable_responsibles_with_active_steps', v_unavailable_steps,
      'active_steps_with_substitute_available', v_steps_with_substitute,
      'active_steps_without_substitute', v_steps_without_substitute
    );
  END IF;

  IF v_calendar_available AND v_documents_available THEN
    SELECT COUNT(*)
    INTO v_without_sla
    FROM public.documents d
    WHERE d.org_id = v_org_id
      AND LOWER(d.status) NOT IN ('obsolete', 'archived')
      AND (p_project_id IS NULL OR d.project_id = p_project_id)
      AND (
        NULLIF(BTRIM(p_doc_type), '') IS NULL
        OR UPPER(d.doc_type) = UPPER(BTRIM(p_doc_type))
      )
      AND (
        NULLIF(BTRIM(p_area), '') IS NULL
        OR UPPER(d.area) = UPPER(BTRIM(p_area))
      )
      AND (v_scope = 'org' OR d.author_id = v_actor_id)
      AND NOT EXISTS (
        SELECT 1
        FROM public.document_sla_policies policy
        WHERE policy.org_id = v_org_id
          AND policy.active = true
          AND (policy.project_id IS NULL OR policy.project_id = d.project_id)
          AND (
            policy.doc_type IS NULL
            OR UPPER(policy.doc_type) = UPPER(d.doc_type)
          )
          AND (
            policy.area IS NULL
            OR UPPER(policy.area) = UPPER(d.area)
          )
      );
  END IF;

  IF v_audit_available
     AND v_documents_available
     AND v_instances_available
     AND (
       SELECT COUNT(DISTINCT column_name) = 4
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'audit_trail'
         AND column_name IN ('org_id', 'document_id', 'metadata', 'created_at')
     ) THEN
    EXECUTE $sql$
      SELECT COUNT(DISTINCT audit.document_id)
      FROM public.audit_trail audit
      JOIN public.documents d ON d.id = audit.document_id
      WHERE audit.org_id = $1
        AND d.org_id = $1
        AND NULLIF(BTRIM(COALESCE(
          audit.metadata->>'suggested_tramite_template_id',
          audit.metadata->>'suggested_tramite_id'
        )), '') IS NOT NULL
        AND ($2::UUID IS NULL OR d.project_id = $2)
        AND ($3::TEXT IS NULL OR UPPER(d.doc_type) = UPPER($3))
        AND ($4::TEXT IS NULL OR UPPER(d.area) = UPPER($4))
        AND ($5::TEXT = 'org' OR d.author_id = $6)
        AND NOT EXISTS (
          SELECT 1
          FROM public.document_tramite_instances instance
          WHERE instance.org_id = $1
            AND instance.document_id = audit.document_id
            AND instance.template_id::TEXT = COALESCE(
              audit.metadata->>'suggested_tramite_template_id',
              audit.metadata->>'suggested_tramite_id'
            )
        )
    $sql$
    INTO v_suggested_without_instance
    USING
      v_org_id, p_project_id, NULLIF(BTRIM(p_doc_type), ''),
      NULLIF(BTRIM(p_area), ''), v_scope, v_actor_id;
  END IF;

  v_sla := jsonb_build_object(
    'total_items_with_due_date', v_doc_due_total + v_step_due_total,
    'on_time', v_doc_due_on_time + v_step_due_on_time,
    'due_soon', v_doc_due_soon + v_step_due_soon,
    'overdue', v_doc_due_overdue + v_step_due_overdue,
    'compliance_rate', CASE
      WHEN (v_doc_due_total + v_step_due_total) = 0 THEN NULL
      ELSE ROUND(
        (
          (v_doc_due_on_time + v_step_due_on_time)::NUMERIC
          / (v_doc_due_total + v_step_due_total)
        ) * 100,
        1
      )
    END,
    'without_sla_policy', v_without_sla,
    'deadline_mode', CASE
      WHEN v_calendar_available THEN 'operational_calendar'
      ELSE 'simple_date'
    END,
    'explanation',
      'Compliance é um retrato dos itens com prazo: dentro do prazo dividido pelo total com vencimento.'
  );

  v_quality := jsonb_build_object(
    'documents_without_code', v_documents->'without_code',
    'documents_without_context', v_documents->'without_project',
    'documents_with_suggested_tramite_not_started',
      v_suggested_without_instance,
    'active_steps_without_due_date',
      v_tramites->'active_steps_without_due_date',
    'documents_without_sla_policy', v_without_sla,
    'documents_without_next_review', v_documents->'without_next_review',
    'pending_evidence_steps', v_pending_evidence
  );

  v_bottlenecks := jsonb_build_object(
    'by_project', v_by_project,
    'by_area', v_by_area,
    'by_doc_type', v_by_doc_type,
    'by_step_type', v_by_step_type,
    'by_responsible', v_by_responsible,
    'evidence_pending', v_evidence_pending_rows,
    'longest_stalled_steps', v_longest_stalled
  );

  IF COALESCE((v_tramites->>'overdue_steps')::INTEGER, 0) > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(
      jsonb_build_object(
        'id', 'overdue_steps',
        'severity', 'critical',
        'title', 'Priorize etapas vencidas',
        'explanation', 'Há etapas ativas além do prazo operacional.',
        'action_label', 'Abrir Central Documental',
        'action_url', '/authenticated/documentos/central'
      )
    );
  END IF;

  IF COALESCE(v_without_sla, 0) > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(
      jsonb_build_object(
        'id', 'without_sla',
        'severity', 'warning',
        'title', 'Configure política SLA',
        'explanation', 'Existem documentos sem uma política de prazo aplicável.',
        'action_label', 'Configurar Calendário e SLA',
        'action_url', '/authenticated/configuracoes/calendario'
      )
    );
  END IF;

  IF COALESCE(v_steps_without_substitute, 0) > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(
      jsonb_build_object(
        'id', 'absence_without_substitute',
        'severity', 'warning',
        'title', 'Revise responsáveis ausentes sem substituto',
        'explanation', 'Há etapas ativas sem cobertura durante uma ausência.',
        'action_label', 'Abrir Equipe',
        'action_url', '/authenticated/equipe'
      )
    );
  END IF;

  IF COALESCE(v_pending_evidence, 0) > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(
      jsonb_build_object(
        'id', 'pending_evidence',
        'severity', 'warning',
        'title', 'Trate evidências obrigatórias pendentes',
        'explanation', 'Etapas ativas aguardam evidência ou arquivo obrigatório.',
        'action_label', 'Abrir Central Documental',
        'action_url', '/authenticated/documentos/central'
      )
    );
  END IF;

  IF v_critical_notifications > 0 OR v_open_escalations > 0 THEN
    v_recommendations := v_recommendations || jsonb_build_array(
      jsonb_build_object(
        'id', 'critical_notifications',
        'severity', 'critical',
        'title', 'Verifique escalonamentos críticos',
        'explanation', 'Existem notificações críticas ou escalonamentos abertos.',
        'action_label', 'Abrir Notificações',
        'action_url', '/authenticated/notificacoes'
      )
    );
  END IF;

  IF jsonb_array_length(v_recommendations) = 0 THEN
    v_recommendations := jsonb_build_array(
      jsonb_build_object(
        'id', 'stable_operation',
        'severity', 'info',
        'title', 'A operação está estável',
        'explanation', 'Nenhum gargalo crítico foi detectado nos dados disponíveis.',
        'action_label', 'Revisar Central Documental',
        'action_url', '/authenticated/documentos/central'
      )
    );
  END IF;

  RETURN jsonb_build_object(
    'version', 'P-26',
    'generated_at', NOW(),
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'scope', v_scope,
    'filters', jsonb_build_object(
      'project_id', p_project_id,
      'doc_type', NULLIF(BTRIM(p_doc_type), ''),
      'area', NULLIF(BTRIM(p_area), ''),
      'responsible_user_id', p_responsible_user_id,
      'severity', NULLIF(LOWER(BTRIM(p_severity)), ''),
      'status', NULLIF(LOWER(BTRIM(p_status)), '')
    ),
    'capabilities', jsonb_build_object(
      'documents', v_documents_available,
      'projects', v_projects_available,
      'tramites', v_instances_available AND v_steps_available,
      'tramite_events', v_events_available,
      'evidence', v_evidence_available,
      'calendar_sla', v_calendar_available,
      'notifications', v_notifications_available,
      'availability', v_availability_available,
      'audit_trail', v_audit_available,
      'formal_approvals', v_approvals_available,
      'historical_snapshots', false,
      'notification_generation_error_history', false
    ),
    'summary', jsonb_build_object(
      'active_documents', v_documents->'active_documents',
      'active_tramite_instances', v_tramites->'active_instances',
      'active_steps', v_tramites->'active_steps',
      'overdue_steps', v_tramites->'overdue_steps',
      'due_soon_steps', v_tramites->'due_soon_steps',
      'overdue_reviews', v_documents->'with_review_overdue',
      'due_soon_reviews', v_documents->'with_review_due_soon',
      'critical_unread_notifications',
        v_notifications->'critical_unread',
      'open_escalations', v_notifications->'open_escalations',
      'pending_evidence_steps', v_pending_evidence,
      'unavailable_responsibles_with_active_steps',
        v_delegations->'unavailable_responsibles_with_active_steps'
    ),
    'sla', v_sla,
    'tramites', v_tramites,
    'documents', v_documents,
    'notifications', v_notifications,
    'delegations', v_delegations,
    'bottlenecks', v_bottlenecks,
    'quality', v_quality,
    'trends', jsonb_build_object(
      'documents_created_current', v_documents->'created_in_period',
      'documents_created_previous', v_documents->'created_previous_period',
      'steps_completed_current', v_tramites->'completed_steps_in_period',
      'steps_completed_previous',
        v_tramites->'completed_steps_previous_period',
      'instances_completed_current',
        v_tramites->'completed_instances_in_period',
      'instances_completed_previous',
        v_tramites->'completed_instances_previous_period'
    ),
    'dimensions', v_dimensions,
    'recommendations', v_recommendations,
    'limitations', jsonb_build_array(
      'Sem snapshots históricos: métricas de estado são um retrato atual.',
      'Erros de gerações passadas não são persistidos pela P-25.',
      'Compliance usa prazos persistidos e não altera due_at ou next_review_at.'
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.get_operational_indicators(
  DATE, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_operational_indicators(
  DATE, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) TO authenticated;

COMMENT ON FUNCTION public.get_operational_indicators(
  DATE, DATE, TEXT, UUID, TEXT, TEXT, UUID, TEXT, TEXT
) IS
  'P-26: consolida indicadores operacionais read-only, com escopo por organização ou usuário.';

NOTIFY pgrst, 'reload schema';

COMMIT;
