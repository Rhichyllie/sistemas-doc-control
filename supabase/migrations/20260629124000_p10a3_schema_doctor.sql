-- TRAMITA P-10A.3 — Schema Doctor e diagnóstico enterprise
-- Função somente leitura. Não aplica nem corrige schema.

BEGIN;

CREATE OR REPLACE FUNCTION public.get_schema_doctor_report()
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role TEXT;
  v_checks JSONB := '[]'::JSONB;
  v_missing_items JSONB := '[]'::JSONB;
  v_recommendations JSONB := '[]'::JSONB;
  v_overall_status TEXT := 'ok';
  v_can_use_workflow_enterprise BOOLEAN := false;
  v_can_use_groups BOOLEAN := false;
  v_can_use_correction_cycle BOOLEAN := false;
  v_can_use_formal_revision BOOLEAN := false;
  v_can_use_transactional_publish BOOLEAN := false;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Schema Doctor requer um usuário autenticado.';
  END IF;

  v_role := public.current_user_role();
  IF v_role IS NULL OR v_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Acesso restrito. O Schema Doctor é exclusivo para administradores e gestores.';
  END IF;

  WITH expected_checks (
    module_name,
    check_type,
    table_name,
    check_name,
    alternative_name,
    cycle,
    impact,
    severity
  ) AS (
    VALUES
      -- Tabelas fundamentais
      ('Workflow Enterprise', 'table', 'approval_flows', 'approval_flows', NULL, '01', 'Fila e decisões de aprovação podem falhar', 'critical'),
      ('Workflow Enterprise', 'table', 'audit_trail', 'audit_trail', NULL, '01', 'Ações enterprise podem ficar sem auditoria', 'critical'),
      ('Workflow Enterprise', 'table', 'notifications', 'notifications', NULL, '01', 'Notificações do workflow podem falhar', 'warning'),
      ('Grupos de Aprovação', 'table', 'approval_groups', 'approval_groups', NULL, '08', 'Administração e roteamento por grupo ficam indisponíveis', 'critical'),
      ('Grupos de Aprovação', 'table', 'approval_group_members', 'approval_group_members', NULL, '08', 'Membros de grupos não podem ser resolvidos', 'critical'),
      ('Revisão Formal', 'table', 'documents', 'documents', NULL, '01', 'Documento mestre não está disponível', 'critical'),
      ('Revisão Formal', 'table', 'document_versions', 'document_versions', NULL, '01', 'Histórico de revisões formais fica indisponível', 'critical'),

      -- Aliases de grupos normalizados pelo ciclo 09
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'profile_id', NULL, '09', 'Compatibilidade com membros do schema legado pode falhar', 'warning'),
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'user_id', NULL, '09', 'Código enterprise não consegue identificar o membro', 'warning'),
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'role_in_group', NULL, '09', 'Papel legado do membro não fica sincronizado', 'warning'),
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'role', NULL, '09', 'Papel enterprise do membro pode falhar', 'warning'),
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'active', NULL, '09', 'Ativação do membro no schema legado pode divergir', 'warning'),
      ('Grupos de Aprovação', 'column', 'approval_group_members', 'is_active', NULL, '09', 'Filtro enterprise de membros ativos pode falhar', 'warning'),

      -- Workflow, atribuição e SLA
      ('Workflow Enterprise', 'column', 'approval_flows', 'assignment_type', NULL, '09', 'Roteamento por papel, usuário ou grupo pode falhar', 'warning'),
      ('Workflow Enterprise', 'column', 'approval_flows', 'assignee_user_id', NULL, '09', 'Atribuição direta por usuário pode falhar', 'warning'),
      ('Workflow Enterprise', 'column', 'approval_flows', 'assignee_group_id', NULL, '09', 'Atribuição por grupo pode falhar', 'warning'),
      ('Workflow Enterprise', 'column', 'approval_flows', 'due_at', NULL, '09', 'Prazo por data específica fica indisponível', 'warning'),
      ('Workflow Enterprise', 'column', 'approval_flows', 'due_days', NULL, '09', 'SLA calculado por dias fica indisponível', 'warning'),
      ('Workflow Enterprise', 'column', 'approval_flows', 'metadata', NULL, '09', 'Fallbacks e contexto enterprise não podem ser persistidos', 'warning'),

      -- Decisão e correção
      ('Correção/Reenvio', 'column', 'approval_flows', 'comment', NULL, '10', 'Motivo da rejeição pode não ser registrado', 'critical'),
      ('Correção/Reenvio', 'column', 'approval_flows', 'decided_by', NULL, '10', 'Autor da decisão não pode ser auditado', 'critical'),
      ('Correção/Reenvio', 'column', 'approval_flows', 'decided_at', NULL, '10', 'Data da decisão não pode ser auditada', 'critical'),
      ('Correção/Reenvio', 'column', 'approval_flows', 'correction_round', NULL, '10', 'Rodadas de correção podem perder rastreabilidade', 'warning'),
      ('Correção/Reenvio', 'column', 'approval_flows', 'resubmitted_from_step_id', NULL, '10', 'Reenvio não pode referenciar a rejeição anterior', 'warning'),

      -- Revisão formal
      ('Revisão Formal', 'column', 'approval_flows', 'document_version_id', NULL, '11', 'Workflow não consegue identificar a revisão formal', 'critical'),
      ('Revisão Formal', 'column', 'approval_flows', 'revision_number', NULL, '11', 'Número da revisão não acompanha o workflow', 'critical'),
      ('Revisão Formal', 'column', 'documents', 'published_version_id', NULL, '11', 'Versão publicada atual não possui ponteiro seguro', 'critical'),
      ('Revisão Formal', 'column', 'documents', 'working_version_id', NULL, '11', 'Revisão em andamento não possui ponteiro seguro', 'critical'),
      ('Revisão Formal', 'column', 'document_versions', 'org_id', NULL, '11', 'Revisões não podem ser isoladas por organização', 'critical'),
      ('Revisão Formal', 'column', 'document_versions', 'status', NULL, '11', 'Ciclo formal de status fica indisponível', 'critical'),
      ('Revisão Formal', 'column', 'document_versions', 'change_reason', NULL, '11', 'Motivo da revisão não pode ser registrado', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'created_from_version_id', NULL, '11', 'Origem da revisão não pode ser rastreada', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'submitted_at', NULL, '11', 'Envio da revisão não pode ser datado', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'approved_at', NULL, '11', 'Aprovação da revisão não pode ser datada', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'published_at', NULL, '11', 'Publicação da revisão não pode ser datada', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'superseded_at', NULL, '11', 'Supersessão da revisão anterior não pode ser datada', 'warning'),
      ('Revisão Formal', 'column', 'document_versions', 'metadata', NULL, '11', 'Contexto complementar da revisão não pode ser persistido', 'warning'),

      -- RPCs transacionais
      ('Publicação Transacional', 'rpc', NULL, 'publish_formal_revision', NULL, '12', 'Publicação formal volta ao fallback não transacional do cliente', 'warning'),
      ('Publicação Transacional', 'rpc', NULL, 'reject_formal_revision', NULL, '12', 'Rejeição transacional não está disponível para integração futura', 'warning'),

      -- Policies principais. O ciclo 09 aceita o nome legado equivalente.
      ('Workflow Enterprise', 'policy', 'approval_flows', 'approval_update_enterprise_actor', 'approvals_update_assignee', '09', 'Atores enterprise podem não conseguir decidir etapas com segurança', 'critical'),
      ('Revisão Formal', 'policy', 'document_versions', 'versions_update_formal_revision', NULL, '11', 'Atualização do ciclo formal pode falhar por RLS', 'critical'),
      ('Revisão Formal', 'policy', 'documents', 'docs_update_formal_revision_actor', NULL, '11', 'Publicação no documento mestre pode falhar por RLS', 'critical')
  ),
  evaluated_checks AS (
    SELECT
      expected.*,
      CASE expected.check_type
        WHEN 'table' THEN
          to_regclass(format('public.%I', expected.check_name)) IS NOT NULL
        WHEN 'column' THEN
          EXISTS (
            SELECT 1
            FROM information_schema.columns AS columns
            WHERE columns.table_schema = 'public'
              AND columns.table_name = expected.table_name
              AND columns.column_name = expected.check_name
          )
        WHEN 'rpc' THEN
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_proc AS procedure
            JOIN pg_catalog.pg_namespace AS namespace
              ON namespace.oid = procedure.pronamespace
            WHERE namespace.nspname = 'public'
              AND procedure.proname = expected.check_name
              AND procedure.prokind = 'f'
          )
        WHEN 'policy' THEN
          EXISTS (
            SELECT 1
            FROM pg_catalog.pg_policies AS policy
            WHERE policy.schemaname = 'public'
              AND policy.tablename = expected.table_name
              AND (
                policy.policyname = expected.check_name
                OR (
                  expected.alternative_name IS NOT NULL
                  AND policy.policyname = expected.alternative_name
                )
              )
          )
        ELSE false
      END AS is_present
    FROM expected_checks AS expected
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'module', evaluated.module_name,
        'type', evaluated.check_type,
        'table', evaluated.table_name,
        'name', evaluated.check_name,
        'status', CASE WHEN evaluated.is_present THEN 'ok' ELSE 'missing' END,
        'cycle', evaluated.cycle,
        'impact', evaluated.impact,
        'severity', evaluated.severity
      )
      ORDER BY evaluated.module_name, evaluated.check_type, evaluated.table_name, evaluated.check_name
    ),
    '[]'::JSONB
  )
  INTO v_checks
  FROM evaluated_checks AS evaluated;

  SELECT COALESCE(jsonb_agg(item), '[]'::JSONB)
  INTO v_missing_items
  FROM jsonb_array_elements(v_checks) AS item
  WHERE item->>'status' = 'missing';

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_missing_items) AS item
    WHERE item->>'severity' = 'critical'
  ) THEN
    v_overall_status := 'critical';
  ELSIF jsonb_array_length(v_missing_items) > 0 THEN
    v_overall_status := 'warning';
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_checks) AS item
    WHERE item->>'module' = 'Workflow Enterprise'
      AND item->>'status' = 'missing'
  ) INTO v_can_use_workflow_enterprise;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_checks) AS item
    WHERE item->>'module' = 'Grupos de Aprovação'
      AND item->>'status' = 'missing'
  ) INTO v_can_use_groups;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_checks) AS item
    WHERE item->>'module' = 'Correção/Reenvio'
      AND item->>'status' = 'missing'
  ) INTO v_can_use_correction_cycle;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_checks) AS item
    WHERE item->>'module' = 'Revisão Formal'
      AND item->>'status' = 'missing'
  ) INTO v_can_use_formal_revision;

  SELECT NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_checks) AS item
    WHERE item->>'module' = 'Publicação Transacional'
      AND item->>'name' = 'publish_formal_revision'
      AND item->>'status' = 'missing'
  ) INTO v_can_use_transactional_publish;

  SELECT COALESCE(jsonb_agg(recommendation ORDER BY cycle), '[]'::JSONB)
  INTO v_recommendations
  FROM (
    SELECT
      missing_cycle.cycle,
      to_jsonb(
        CASE missing_cycle.cycle
          WHEN '01' THEN 'Aplique o ciclo 01_TRAMITA_foundation_schema.'
          WHEN '08' THEN 'Aplique o ciclo 08_TRAMITA_workflow_repair_and_groups_schema.'
          WHEN '09' THEN 'Aplique o ciclo 09_TRAMITA_enterprise_schema_alignment_bridge.'
          WHEN '10' THEN 'Aplique o ciclo 10_TRAMITA_decision_and_correction_cycle.'
          WHEN '11' THEN 'Aplique o ciclo 11_TRAMITA_formal_revision_lifecycle.'
          WHEN '12' THEN 'Aplique o ciclo 12_TRAMITA_formal_revision_transactional_hardening.'
          ELSE format('Revise o ciclo %s da sequência oficial do Supabase.', missing_cycle.cycle)
        END
      ) AS recommendation
    FROM (
      SELECT DISTINCT item->>'cycle' AS cycle
      FROM jsonb_array_elements(v_missing_items) AS item
    ) AS missing_cycle
  ) AS recommendations;

  RETURN jsonb_build_object(
    'overallStatus', v_overall_status,
    'generatedAt', transaction_timestamp(),
    'checks', v_checks,
    'missingItems', v_missing_items,
    'capabilities', jsonb_build_object(
      'canUseWorkflowEnterprise', v_can_use_workflow_enterprise,
      'canUseGroups', v_can_use_groups,
      'canUseCorrectionCycle', v_can_use_correction_cycle,
      'canUseFormalRevision', v_can_use_formal_revision,
      'canUseTransactionalPublish', v_can_use_transactional_publish
    ),
    'recommendations', v_recommendations
  );
END;
$$;

COMMENT ON FUNCTION public.get_schema_doctor_report() IS
  'Diagnostica, sem alterar dados, a prontidão do schema enterprise do TRAMITA.';

REVOKE ALL ON FUNCTION public.get_schema_doctor_report() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_schema_doctor_report() TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
