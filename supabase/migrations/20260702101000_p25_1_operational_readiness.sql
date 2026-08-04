-- P-25.1 - Diagnóstico e prontidão operacional
-- Nome sugerido no Supabase SQL Editor:
-- 24_TRAMITA_operational_readiness
--
-- Migration aditiva e estritamente read-only. A função abaixo não cria
-- notificações, não gera escalonamentos e não altera documentos, etapas,
-- responsáveis, approval_flows ou qualquer configuração da organização.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_operational_readiness()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_actor_role TEXT;
  v_table_name TEXT;
  v_function_name TEXT;
  v_available BOOLEAN;
  v_rls_enabled BOOLEAN;
  v_policy_count INTEGER;
  v_count BIGINT;
  v_created_count BIGINT := 0;
  v_read_count BIGINT := 0;
  v_dismissed_count BIGINT := 0;
  v_generated_count BIGINT := 0;
  v_suppressed_count BIGINT := 0;
  v_escalated_count BIGINT := 0;
  v_tables JSONB := '{}'::JSONB;
  v_functions JSONB := '{}'::JSONB;
  v_configuration JSONB := '{}'::JSONB;
  v_cycles JSONB := '{}'::JSONB;
  v_security JSONB := '{}'::JSONB;
  v_notification_rls_ready BOOLEAN := false;
  v_operational_rls_ready BOOLEAN := false;
  v_direct_notification_insert BOOLEAN := false;
  v_direct_notification_update BOOLEAN := false;
  v_direct_notification_delete BOOLEAN := false;
  v_direct_event_insert BOOLEAN := false;
  v_direct_event_update BOOLEAN := false;
  v_direct_event_delete BOOLEAN := false;
  v_delegated_completion_contract BOOLEAN := false;
  v_timezone_valid BOOLEAN := false;
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

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem executar o diagnóstico operacional.'
      USING ERRCODE = '42501';
  END IF;

  FOREACH v_table_name IN ARRAY ARRAY[
    'organizations',
    'profiles',
    'document_tramite_templates',
    'document_tramite_instances',
    'document_tramite_instance_steps',
    'document_tramite_instance_events',
    'operational_calendars',
    'operational_holidays',
    'document_sla_policies',
    'operational_holiday_import_runs',
    'team_absences',
    'team_delegation_rules',
    'internal_notifications',
    'notification_preferences',
    'notification_events',
    'notification_escalation_rules',
    'notification_delivery_outbox',
    'projects',
    'document_creation_templates',
    'document_creation_rules'
  ]
  LOOP
    v_available :=
      to_regclass(format('public.%I', v_table_name)) IS NOT NULL;
    v_rls_enabled := false;
    v_policy_count := 0;

    IF v_available THEN
      SELECT relation.relrowsecurity
      INTO v_rls_enabled
      FROM pg_catalog.pg_class relation
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = relation.relnamespace
      WHERE namespace.nspname = 'public'
        AND relation.relname = v_table_name;

      SELECT COUNT(*)::INTEGER
      INTO v_policy_count
      FROM pg_catalog.pg_policies policy
      WHERE policy.schemaname = 'public'
        AND policy.tablename = v_table_name;
    END IF;

    v_tables := jsonb_set(
      v_tables,
      ARRAY[v_table_name],
      jsonb_build_object(
        'available', v_available,
        'rls_enabled', COALESCE(v_rls_enabled, false),
        'policy_count', COALESCE(v_policy_count, 0)
      ),
      true
    );
  END LOOP;

  FOREACH v_function_name IN ARRAY ARRAY[
    'current_user_org_id',
    'is_org_role',
    'document_tramite_actor_can_act',
    'start_document_tramite_instance',
    'complete_document_tramite_step',
    'add_document_tramite_evidence',
    'add_business_days',
    'is_user_unavailable',
    'resolve_user_substitute',
    'create_internal_notification',
    'mark_notification_read',
    'dismiss_notification',
    'generate_operational_notifications',
    'resolve_effective_tramite_actor'
  ]
  LOOP
    SELECT EXISTS (
      SELECT 1
      FROM pg_catalog.pg_proc procedure
      JOIN pg_catalog.pg_namespace namespace
        ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'public'
        AND procedure.proname = v_function_name
    )
    INTO v_available;

    v_functions := jsonb_set(
      v_functions,
      ARRAY[v_function_name],
      to_jsonb(v_available),
      true
    );
  END LOOP;

  v_functions := jsonb_set(
    v_functions,
    ARRAY['get_operational_readiness'],
    'true'::JSONB,
    true
  );

  SELECT COALESCE(
    BOOL_OR(
      LOWER(pg_catalog.pg_get_functiondef(procedure.oid))
        LIKE '%delegated_from_user_id%'
      AND LOWER(pg_catalog.pg_get_functiondef(procedure.oid))
        LIKE '%resolve_effective_tramite_actor%'
    ),
    false
  )
  INTO v_delegated_completion_contract
  FROM pg_catalog.pg_proc procedure
  JOIN pg_catalog.pg_namespace namespace
    ON namespace.oid = procedure.pronamespace
  WHERE namespace.nspname = 'public'
    AND procedure.proname = 'complete_document_tramite_step'
    AND procedure.pronargs = 4;

  v_cycles := jsonb_build_object(
    'cycle_18_execution',
      COALESCE((v_tables->'document_tramite_instances'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'document_tramite_instance_steps'->>'available')::BOOLEAN, false)
      AND COALESCE((v_functions->>'complete_document_tramite_step')::BOOLEAN, false),
    'cycle_21_calendar',
      COALESCE((v_tables->'operational_calendars'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'operational_holidays'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'document_sla_policies'->>'available')::BOOLEAN, false)
      AND COALESCE((v_functions->>'add_business_days')::BOOLEAN, false),
    'cycle_22_availability',
      COALESCE((v_tables->'team_absences'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'team_delegation_rules'->>'available')::BOOLEAN, false)
      AND COALESCE((v_functions->>'is_user_unavailable')::BOOLEAN, false)
      AND COALESCE((v_functions->>'resolve_user_substitute')::BOOLEAN, false),
    'cycle_23_notifications',
      COALESCE((v_tables->'internal_notifications'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'notification_preferences'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'notification_events'->>'available')::BOOLEAN, false)
      AND COALESCE((v_tables->'notification_escalation_rules'->>'available')::BOOLEAN, false)
      AND COALESCE((v_functions->>'create_internal_notification')::BOOLEAN, false)
      AND COALESCE((v_functions->>'generate_operational_notifications')::BOOLEAN, false)
      AND COALESCE((v_functions->>'resolve_effective_tramite_actor')::BOOLEAN, false)
  );

  -- Contagens leves por organização. Toda referência a tabela opcional usa
  -- SQL dinâmico para a função continuar instalável em ambientes parciais.
  IF to_regclass('public.projects') IS NOT NULL
     AND EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'projects'
         AND column_name = 'org_id'
     ) THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.projects WHERE org_id = $1'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('projects', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('projects', NULL);
  END IF;

  IF to_regclass('public.document_creation_templates') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_creation_templates
       WHERE org_id = $1 AND is_active = true'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('document_templates', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('document_templates', NULL);
  END IF;

  IF to_regclass('public.document_creation_rules') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_creation_rules
       WHERE org_id = $1 AND is_active = true'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('document_rules', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('document_rules', NULL);
  END IF;

  IF to_regclass('public.document_tramite_templates') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_tramite_templates
       WHERE org_id = $1 AND status = ''published'''
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('published_tramite_templates', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('published_tramite_templates', NULL);
  END IF;

  IF to_regclass('public.document_tramite_instance_steps') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_tramite_instance_steps
       WHERE org_id = $1 AND assignment_type = ''specific_user'''
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('specific_user_steps', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('specific_user_steps', NULL);
  END IF;

  IF to_regclass('public.document_tramite_instance_events') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_tramite_instance_events
       WHERE org_id = $1 AND event_type = ''step_completed'''
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('completed_step_events', v_count);

    EXECUTE
      'SELECT COUNT(*) FROM public.document_tramite_instance_events
       WHERE org_id = $1
         AND event_type = ''step_completed''
         AND COALESCE(metadata->>''delegated_from_user_id'', '''') <> '''''
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('delegated_step_events', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object(
        'completed_step_events', NULL,
        'delegated_step_events', NULL
      );
  END IF;

  IF to_regclass('public.operational_calendars') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.operational_calendars
       WHERE org_id = $1 AND is_default = true'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('default_calendars', v_count);

    EXECUTE
      'SELECT NOT EXISTS (
         SELECT 1
         FROM public.operational_calendars calendar
         WHERE calendar.org_id = $1
           AND calendar.is_default = true
           AND NOT EXISTS (
             SELECT 1
             FROM pg_catalog.pg_timezone_names timezone
             WHERE timezone.name = calendar.timezone
           )
       )'
      INTO v_timezone_valid
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object(
        'default_calendar_timezone_valid',
        v_timezone_valid AND v_count > 0
      );
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object(
        'default_calendars', NULL,
        'default_calendar_timezone_valid', NULL
      );
  END IF;

  IF to_regclass('public.operational_holidays') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.operational_holidays WHERE org_id = $1'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('holidays', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('holidays', NULL);
  END IF;

  IF to_regclass('public.document_sla_policies') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.document_sla_policies
       WHERE org_id = $1 AND active = true'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('active_sla_policies', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('active_sla_policies', NULL);
  END IF;

  IF to_regclass('public.team_absences') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.team_absences
       WHERE org_id = $1
         AND status IN (''scheduled'', ''active'')
         AND ends_at > NOW()'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('active_or_scheduled_absences', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('active_or_scheduled_absences', NULL);
  END IF;

  IF to_regclass('public.team_delegation_rules') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.team_delegation_rules
       WHERE org_id = $1 AND active = true
         AND (starts_at IS NULL OR starts_at <= NOW())
         AND (ends_at IS NULL OR ends_at > NOW())'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('active_delegations', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('active_delegations', NULL);
  END IF;

  IF to_regclass('public.internal_notifications') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.internal_notifications
       WHERE org_id = $1 AND read_at IS NULL AND dismissed_at IS NULL'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('unread_notifications', v_count);

    EXECUTE
      'SELECT COUNT(*) FROM public.internal_notifications
       WHERE org_id = $1 AND read_at IS NULL AND dismissed_at IS NULL
         AND severity IN (''danger'', ''critical'')'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('critical_unread_notifications', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object(
        'unread_notifications', NULL,
        'critical_unread_notifications', NULL
      );
  END IF;

  IF to_regclass('public.notification_events') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.notification_events WHERE org_id = $1'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('notification_events', v_count);

    EXECUTE
      'SELECT
         COUNT(*) FILTER (WHERE event_type = ''notification_created''),
         COUNT(*) FILTER (WHERE event_type = ''notification_read''),
         COUNT(*) FILTER (WHERE event_type = ''notification_dismissed''),
         COUNT(*) FILTER (WHERE event_type = ''notification_generated''),
         COUNT(*) FILTER (WHERE event_type = ''notification_suppressed''),
         COUNT(*) FILTER (WHERE event_type = ''notification_escalated'')
       FROM public.notification_events
       WHERE org_id = $1'
      INTO
        v_created_count,
        v_read_count,
        v_dismissed_count,
        v_generated_count,
        v_suppressed_count,
        v_escalated_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object(
        'notification_created_events', v_created_count,
        'notification_read_events', v_read_count,
        'notification_dismissed_events', v_dismissed_count,
        'notification_generated_events', v_generated_count,
        'notification_suppressed_events', v_suppressed_count,
        'escalation_events', v_escalated_count
      );
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object(
        'notification_events', NULL,
        'notification_created_events', NULL,
        'notification_read_events', NULL,
        'notification_dismissed_events', NULL,
        'notification_generated_events', NULL,
        'notification_suppressed_events', NULL,
        'escalation_events', NULL
      );
  END IF;

  IF to_regclass('public.notification_escalation_rules') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.notification_escalation_rules
       WHERE org_id = $1 AND active = true'
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('active_escalation_rules', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('active_escalation_rules', NULL);
  END IF;

  IF to_regclass('public.notification_delivery_outbox') IS NOT NULL THEN
    EXECUTE
      'SELECT COUNT(*) FROM public.notification_delivery_outbox
       WHERE org_id = $1 AND status = ''pending'''
      INTO v_count
      USING v_org_id;
    v_configuration := v_configuration
      || jsonb_build_object('pending_email_outbox', v_count);
  ELSE
    v_configuration := v_configuration
      || jsonb_build_object('pending_email_outbox', NULL);
  END IF;

  v_notification_rls_ready :=
    COALESCE((v_tables->'internal_notifications'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'internal_notifications'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'notification_preferences'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'notification_preferences'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'notification_events'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'notification_events'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'notification_escalation_rules'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'notification_escalation_rules'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'notification_delivery_outbox'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'notification_delivery_outbox'->>'policy_count')::INTEGER, 0) > 0;

  v_operational_rls_ready :=
    COALESCE((v_tables->'document_tramite_instances'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'document_tramite_instances'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'document_tramite_instance_steps'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'document_tramite_instance_steps'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'document_tramite_instance_events'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'document_tramite_instance_events'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'operational_calendars'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'operational_calendars'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'operational_holidays'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'operational_holidays'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'document_sla_policies'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'document_sla_policies'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'team_absences'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'team_absences'->>'policy_count')::INTEGER, 0) > 0
    AND COALESCE((v_tables->'team_delegation_rules'->>'rls_enabled')::BOOLEAN, false)
    AND COALESCE((v_tables->'team_delegation_rules'->>'policy_count')::INTEGER, 0) > 0;

  IF pg_catalog.to_regrole('authenticated') IS NOT NULL
     AND to_regclass('public.internal_notifications') IS NOT NULL THEN
    v_direct_notification_insert :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.internal_notifications',
        'INSERT'
      );
    v_direct_notification_update :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.internal_notifications',
        'UPDATE'
      );
    v_direct_notification_delete :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.internal_notifications',
        'DELETE'
      );
  END IF;

  IF pg_catalog.to_regrole('authenticated') IS NOT NULL
     AND to_regclass('public.notification_events') IS NOT NULL THEN
    v_direct_event_insert :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_events',
        'INSERT'
      );
    v_direct_event_update :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_events',
        'UPDATE'
      );
    v_direct_event_delete :=
      pg_catalog.has_table_privilege(
        'authenticated',
        'public.notification_events',
        'DELETE'
      );
  END IF;

  v_security := jsonb_build_object(
    'operational_rls_ready', v_operational_rls_ready,
    'notification_rls_ready', v_notification_rls_ready,
    'direct_notification_insert_blocked', NOT v_direct_notification_insert,
    'direct_notification_update_blocked', NOT v_direct_notification_update,
    'direct_notification_delete_blocked', NOT v_direct_notification_delete,
    'direct_event_insert_blocked', NOT v_direct_event_insert,
    'direct_event_update_blocked', NOT v_direct_event_update,
    'direct_event_delete_blocked', NOT v_direct_event_delete,
    'delegated_completion_contract', v_delegated_completion_contract,
    'delegation_specific_user_only', true,
    'delegated_evidence_enabled', false,
    'external_email_delivery_enabled', false,
    'default_escalation_available', true,
    'readiness_rpc_read_error', false,
    'frontend_probe_read_error', false,
    'diagnostic_mutates_data', false,
    'approval_flows_write_enabled', false,
    'work_center_inline_completion_enabled', false
  );

  RETURN jsonb_build_object(
    'version', 'P-25.1',
    'generated_at', NOW(),
    'org_id', v_org_id,
    'actor_role', v_actor_role,
    'cycles', v_cycles,
    'tables', v_tables,
    'functions', v_functions,
    'configuration', v_configuration,
    'security', v_security
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_operational_readiness() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_operational_readiness() TO authenticated;

COMMENT ON FUNCTION public.get_operational_readiness() IS
  'P-25.1: health check read-only para ciclos, configuração, RLS, notificações e delegação auditável.';

NOTIFY pgrst, 'reload schema';

COMMIT;
