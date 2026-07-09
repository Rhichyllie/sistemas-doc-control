-- P-27.1 — Central de Exceções e Reconciliação
-- Nome no Supabase SQL Editor: 27_TRAMITA_audit_exceptions_reconciliation
--
-- Camada aditiva de controle e reconciliação. As únicas escritas são em
-- tabelas próprias de runs/exceções. Não altera documentos, versões,
-- aprovações, trâmites, evidências, notificações, prazos ou responsáveis.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.audit_reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  scope TEXT NOT NULL,
  period_from DATE,
  period_to DATE,
  status TEXT NOT NULL DEFAULT 'completed',
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at TIMESTAMPTZ,
  source_coverage JSONB NOT NULL DEFAULT '{}'::JSONB,
  record_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  exception_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  limitations JSONB NOT NULL DEFAULT '[]'::JSONB,
  package_hash TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_reconciliation_runs_scope_check
    CHECK (scope IN ('org', 'mine')),
  CONSTRAINT audit_reconciliation_runs_status_check
    CHECK (status IN ('completed', 'completed_with_limitations', 'failed')),
  CONSTRAINT audit_reconciliation_runs_period_check
    CHECK (
      period_from IS NULL
      OR period_to IS NULL
      OR period_to >= period_from
    ),
  CONSTRAINT audit_reconciliation_runs_coverage_object
    CHECK (JSONB_TYPEOF(source_coverage) = 'object'),
  CONSTRAINT audit_reconciliation_runs_counts_object
    CHECK (JSONB_TYPEOF(record_counts) = 'object'),
  CONSTRAINT audit_reconciliation_runs_exception_counts_object
    CHECK (JSONB_TYPEOF(exception_counts) = 'object'),
  CONSTRAINT audit_reconciliation_runs_limitations_array
    CHECK (JSONB_TYPEOF(limitations) = 'array'),
  CONSTRAINT audit_reconciliation_runs_hash_check
    CHECK (
      package_hash IS NULL
      OR package_hash ~ '^[0-9a-fA-F]{64}$'
    )
);

CREATE TABLE IF NOT EXISTS public.audit_reconciliation_exceptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  run_id UUID REFERENCES public.audit_reconciliation_runs(id) ON DELETE SET NULL,
  exception_type TEXT NOT NULL,
  severity TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  source TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id UUID,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  project_id UUID,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  recommendation TEXT,
  evidence JSONB NOT NULL DEFAULT '{}'::JSONB,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  acknowledged_at TIMESTAMPTZ,
  ignored_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ignored_at TIMESTAMPTZ,
  resolution_note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_reconciliation_exceptions_type_not_empty
    CHECK (NULLIF(BTRIM(exception_type), '') IS NOT NULL),
  CONSTRAINT audit_reconciliation_exceptions_severity_check
    CHECK (severity IN ('critical', 'high', 'medium', 'low', 'info')),
  CONSTRAINT audit_reconciliation_exceptions_status_check
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'ignored')),
  CONSTRAINT audit_reconciliation_exceptions_source_check
    CHECK (
      source IN (
        'documents',
        'document_versions',
        'document_revisions',
        'approval_flows',
        'document_tramite_instances',
        'document_tramite_instance_steps',
        'document_tramite_instance_events',
        'document_tramite_instance_evidence',
        'internal_notifications',
        'notification_events',
        'audit_trail',
        'audit_report_exports',
        'completeness'
      )
    ),
  CONSTRAINT audit_reconciliation_exceptions_entity_not_empty
    CHECK (NULLIF(BTRIM(entity_type), '') IS NOT NULL),
  CONSTRAINT audit_reconciliation_exceptions_title_not_empty
    CHECK (NULLIF(BTRIM(title), '') IS NOT NULL),
  CONSTRAINT audit_reconciliation_exceptions_description_not_empty
    CHECK (NULLIF(BTRIM(description), '') IS NOT NULL),
  CONSTRAINT audit_reconciliation_exceptions_evidence_object
    CHECK (JSONB_TYPEOF(evidence) = 'object')
);

DO $constraints$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.audit_reconciliation_exceptions'::REGCLASS
         AND conname = 'audit_reconciliation_exceptions_project_id_fkey'
     ) THEN
    ALTER TABLE public.audit_reconciliation_exceptions
      ADD CONSTRAINT audit_reconciliation_exceptions_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS idx_audit_reconciliation_runs_org_created
  ON public.audit_reconciliation_runs(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_reconciliation_runs_requested
  ON public.audit_reconciliation_runs(requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_reconciliation_exceptions_org_status
  ON public.audit_reconciliation_exceptions(org_id, status, severity, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_reconciliation_exceptions_document
  ON public.audit_reconciliation_exceptions(document_id, status)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_audit_reconciliation_exceptions_run
  ON public.audit_reconciliation_exceptions(run_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_audit_reconciliation_open_identity
  ON public.audit_reconciliation_exceptions (
    org_id,
    exception_type,
    source,
    entity_type,
    COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(document_id, '00000000-0000-0000-0000-000000000000'::UUID)
  )
  WHERE status = 'open';

CREATE OR REPLACE FUNCTION public.guard_audit_reconciliation_runs_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'Execuções de reconciliação são append-only e não podem ser alteradas ou removidas.'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS audit_reconciliation_runs_append_only
  ON public.audit_reconciliation_runs;

CREATE TRIGGER audit_reconciliation_runs_append_only
  BEFORE UPDATE OR DELETE ON public.audit_reconciliation_runs
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_audit_reconciliation_runs_append_only();

ALTER TABLE public.audit_reconciliation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_reconciliation_exceptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_reconciliation_runs_select_scope
  ON public.audit_reconciliation_runs;
DROP POLICY IF EXISTS audit_reconciliation_runs_service_role
  ON public.audit_reconciliation_runs;
DROP POLICY IF EXISTS audit_reconciliation_exceptions_select_scope
  ON public.audit_reconciliation_exceptions;
DROP POLICY IF EXISTS audit_reconciliation_exceptions_service_role
  ON public.audit_reconciliation_exceptions;

CREATE POLICY audit_reconciliation_runs_select_scope
  ON public.audit_reconciliation_runs
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      requested_by = auth.uid()
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

CREATE POLICY audit_reconciliation_runs_service_role
  ON public.audit_reconciliation_runs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY audit_reconciliation_exceptions_select_scope
  ON public.audit_reconciliation_exceptions
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR (
        document_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = audit_reconciliation_exceptions.document_id
            AND document.org_id = audit_reconciliation_exceptions.org_id
            AND document.author_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY audit_reconciliation_exceptions_service_role
  ON public.audit_reconciliation_exceptions
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.audit_reconciliation_runs FROM PUBLIC;
REVOKE ALL ON public.audit_reconciliation_exceptions FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.audit_reconciliation_runs
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.audit_reconciliation_exceptions
  FROM authenticated;

GRANT SELECT ON public.audit_reconciliation_runs TO authenticated;
GRANT SELECT ON public.audit_reconciliation_exceptions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_reconciliation_runs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.audit_reconciliation_exceptions TO service_role;

CREATE OR REPLACE FUNCTION public.audit_reconciliation_source_coverage(
  p_org_id UUID,
  p_from DATE,
  p_to DATE
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_coverage JSONB := '{}'::JSONB;
  v_count BIGINT := 0;
  v_from_ts TIMESTAMPTZ := p_from::TIMESTAMPTZ;
  v_to_ts TIMESTAMPTZ := (p_to + 1)::TIMESTAMPTZ;
BEGIN
  v_coverage := jsonb_build_object(
    'documents', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.documents') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Fonte base da entidade documental.'
    ),
    'document_versions', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.document_versions') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Fonte canônica de versões formais quando instalada.'
    ),
    'document_revisions', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.document_revisions') IS NULL THEN 'unavailable' ELSE 'limited' END,
      'canonical', FALSE,
      'records', NULL,
      'note', 'Fonte legada; usada apenas para compatibilidade.'
    ),
    'approval_flows', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.approval_flows') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Aprovações formais são lidas sem alteração.'
    ),
    'tramite_execution', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.document_tramite_instances') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Instâncias, etapas, eventos e evidências de trâmite.'
    ),
    'notifications', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.internal_notifications') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Notificações internas e eventos de escalonamento.'
    ),
    'audit_trail', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.audit_trail') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Trilha complementar de auditoria documental.'
    ),
    'audit_report_exports', jsonb_build_object(
      'status', CASE WHEN to_regclass('public.audit_report_exports') IS NULL THEN 'unavailable' ELSE 'available' END,
      'canonical', TRUE,
      'records', NULL,
      'note', 'Histórico formal append-only de exportações P-27.'
    )
  );

  IF to_regclass('public.documents') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.documents document
    WHERE document.org_id = p_org_id
      AND document.created_at >= v_from_ts
      AND document.created_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{documents,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.document_versions') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.document_versions version
    WHERE version.org_id = p_org_id
      AND version.uploaded_at >= v_from_ts
      AND version.uploaded_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{document_versions,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.document_revisions') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.document_revisions revision
    JOIN public.documents document
      ON document.id = revision.document_id
    WHERE document.org_id = p_org_id
      AND revision.created_at >= v_from_ts
      AND revision.created_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{document_revisions,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.approval_flows') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.approval_flows approval
    WHERE approval.org_id = p_org_id
      AND approval.created_at >= v_from_ts
      AND approval.created_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{approval_flows,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.document_tramite_instances') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.document_tramite_instances instance
    WHERE instance.org_id = p_org_id
      AND instance.started_at >= v_from_ts
      AND instance.started_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{tramite_execution,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.internal_notifications') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.internal_notifications notification
    WHERE notification.org_id = p_org_id
      AND notification.created_at >= v_from_ts
      AND notification.created_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{notifications,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.audit_trail') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.audit_trail audit
    WHERE audit.org_id = p_org_id
      AND audit.created_at >= v_from_ts
      AND audit.created_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{audit_trail,records}', TO_JSONB(v_count), TRUE);
  END IF;

  IF to_regclass('public.audit_report_exports') IS NOT NULL THEN
    SELECT COUNT(*)
    INTO v_count
    FROM public.audit_report_exports report_export
    WHERE report_export.org_id = p_org_id
      AND report_export.generated_at >= v_from_ts
      AND report_export.generated_at < v_to_ts;
    v_coverage := jsonb_set(v_coverage, '{audit_report_exports,records}', TO_JSONB(v_count), TRUE);
  END IF;

  RETURN v_coverage;
END;
$function$;

CREATE OR REPLACE FUNCTION public.audit_reconciliation_detect_exceptions(
  p_org_id UUID,
  p_actor_id UUID,
  p_actor_role TEXT,
  p_from DATE,
  p_to DATE,
  p_scope TEXT DEFAULT 'org',
  p_document_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_exceptions JSONB := '[]'::JSONB;
  v_found JSONB := '[]'::JSONB;
  v_from_ts TIMESTAMPTZ := p_from::TIMESTAMPTZ;
  v_to_ts TIMESTAMPTZ := (p_to + 1)::TIMESTAMPTZ;
  v_versions_available BOOLEAN := to_regclass('public.document_versions') IS NOT NULL;
  v_revisions_available BOOLEAN := to_regclass('public.document_revisions') IS NOT NULL;
  v_approvals_available BOOLEAN := to_regclass('public.approval_flows') IS NOT NULL;
  v_instances_available BOOLEAN := to_regclass('public.document_tramite_instances') IS NOT NULL;
  v_steps_available BOOLEAN := to_regclass('public.document_tramite_instance_steps') IS NOT NULL;
  v_events_available BOOLEAN := to_regclass('public.document_tramite_instance_events') IS NOT NULL;
  v_evidence_available BOOLEAN := to_regclass('public.document_tramite_instance_evidence') IS NOT NULL;
  v_notifications_available BOOLEAN := to_regclass('public.internal_notifications') IS NOT NULL;
  v_notification_events_available BOOLEAN := to_regclass('public.notification_events') IS NOT NULL;
  v_audit_available BOOLEAN := to_regclass('public.audit_trail') IS NOT NULL;
  v_exports_available BOOLEAN := to_regclass('public.audit_report_exports') IS NOT NULL;
  v_projects_available BOOLEAN := to_regclass('public.projects') IS NOT NULL;
  v_approval_due_available BOOLEAN := FALSE;
  v_version_status_available BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_flows'
      AND column_name = 'due_at'
  ) INTO v_approval_due_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_versions'
      AND column_name = 'status'
  ) INTO v_version_status_available;

  IF to_regclass('public.documents') IS NULL THEN
    RETURN jsonb_build_array(
      jsonb_build_object(
        'exception_type', 'COMPLETENESS_CANONICAL_SOURCE_MISSING',
        'severity', 'critical',
        'source', 'completeness',
        'entity_type', 'schema',
        'entity_id', NULL,
        'document_id', NULL,
        'project_id', NULL,
        'title', 'Fonte canônica de documentos ausente',
        'description', 'A tabela documents não está disponível; a reconciliação formal não pode validar a entidade documental.',
        'recommendation', 'Aplicar e conferir os ciclos base antes do piloto.',
        'evidence', jsonb_build_object('missing_table', 'documents')
      )
    );
  END IF;

  IF v_versions_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'DOCUMENT_WITHOUT_CANONICAL_VERSION',
        'severity', 'high',
        'source', 'documents',
        'entity_type', 'document',
        'entity_id', document.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Documento sem versão formal canônica',
        'description', 'O documento existe, mas não possui registro correspondente em document_versions.',
        'recommendation', 'Investigar se o documento foi criado por fluxo legado ou se a versão inicial não foi registrada.',
        'evidence', jsonb_build_object(
          'document_code', document.code,
          'status', document.status,
          'created_at', document.created_at
        )
      ) AS exception
      FROM public.documents document
      WHERE document.org_id = p_org_id
        AND document.created_at >= v_from_ts
        AND document.created_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.document_versions version
          WHERE version.document_id = document.id
            AND version.org_id = document.org_id
        )
      ORDER BY document.created_at DESC
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  ELSE
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'COMPLETENESS_CANONICAL_VERSION_SOURCE_MISSING',
        'severity', 'high',
        'source', 'completeness',
        'entity_type', 'schema',
        'entity_id', NULL,
        'document_id', NULL,
        'project_id', NULL,
        'title', 'Fonte canônica de versões ausente',
        'description', 'document_versions não está disponível; a completude formal de versões não pode ser comprovada.',
        'recommendation', 'Aplicar o ciclo formal de versões antes de usar o relatório como evidência probatória completa.',
        'evidence', jsonb_build_object('missing_table', 'document_versions')
      ) AS exception
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_audit_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'DOCUMENT_WITHOUT_AUDIT_TRAIL',
        'severity', 'medium',
        'source', 'audit_trail',
        'entity_type', 'document',
        'entity_id', document.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Documento sem evento auditável compatível',
        'description', 'Não foi encontrado evento em audit_trail para o documento no recorte analisado.',
        'recommendation', 'Validar se a criação ou movimentação ocorreu antes do contrato atual de auditoria.',
        'evidence', jsonb_build_object(
          'document_code', document.code,
          'created_at', document.created_at
        )
      ) AS exception
      FROM public.documents document
      WHERE document.org_id = p_org_id
        AND document.created_at >= v_from_ts
        AND document.created_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.audit_trail audit
          WHERE audit.document_id = document.id
            AND audit.org_id = document.org_id
        )
      ORDER BY document.created_at DESC
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  ELSE
    v_exceptions := v_exceptions || jsonb_build_array(
      jsonb_build_object(
        'exception_type', 'COMPLETENESS_AUDIT_TRAIL_SOURCE_MISSING',
        'severity', 'high',
        'source', 'completeness',
        'entity_type', 'schema',
        'entity_id', NULL,
        'document_id', NULL,
        'project_id', NULL,
        'title', 'Trilha audit_trail ausente',
        'description', 'A fonte audit_trail não está disponível; eventos auditáveis complementares não podem ser conciliados.',
        'recommendation', 'Conferir o ciclo base de auditoria antes do piloto.',
        'evidence', jsonb_build_object('missing_table', 'audit_trail')
      )
    );
  END IF;

  SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
  INTO v_found
  FROM (
    SELECT jsonb_build_object(
      'exception_type', 'DOCUMENT_WITHOUT_CODE',
      'severity', 'medium',
      'source', 'documents',
      'entity_type', 'document',
      'entity_id', document.id,
      'document_id', document.id,
      'project_id', document.project_id,
      'title', 'Documento sem código documental',
      'description', 'O documento não possui code preenchido. Em operação enterprise, isso reduz rastreabilidade.',
      'recommendation', 'Verificar se a codificação automática, escolhida ou manual foi aplicada corretamente.',
      'evidence', jsonb_build_object(
        'title', document.title,
        'status', document.status,
        'code', document.code
      )
    ) AS exception
    FROM public.documents document
    WHERE document.org_id = p_org_id
      AND document.created_at >= v_from_ts
      AND document.created_at < v_to_ts
      AND (p_document_id IS NULL OR document.id = p_document_id)
      AND (p_project_id IS NULL OR document.project_id = p_project_id)
      AND (p_scope = 'org' OR document.author_id = p_actor_id)
      AND NULLIF(BTRIM(COALESCE(document.code, '')), '') IS NULL
    ORDER BY document.created_at DESC
    LIMIT 200
  ) row;
  v_exceptions := v_exceptions || v_found;

  IF v_projects_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'DOCUMENT_WITH_ORPHAN_PROJECT',
        'severity', 'high',
        'source', 'documents',
        'entity_type', 'document',
        'entity_id', document.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Documento referencia projeto inexistente',
        'description', 'O document.project_id não possui correspondência válida em projects.',
        'recommendation', 'Investigar contexto operacional antes de exportar auditoria formal.',
        'evidence', jsonb_build_object('project_id', document.project_id)
      ) AS exception
      FROM public.documents document
      LEFT JOIN public.projects project
        ON project.id = document.project_id
      WHERE document.org_id = p_org_id
        AND document.project_id IS NOT NULL
        AND project.id IS NULL
        AND document.created_at >= v_from_ts
        AND document.created_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_revisions_available AND v_versions_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'LEGACY_REVISION_WITHOUT_CANONICAL_VERSION',
        'severity', 'medium',
        'source', 'document_revisions',
        'entity_type', 'document_revision',
        'entity_id', revision.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Revisão legada sem versão canônica',
        'description', 'Existe revisão em document_revisions, mas não há versão equivalente em document_versions.',
        'recommendation', 'Planejar reconciliação manual entre legado e ciclo formal.',
        'evidence', jsonb_build_object(
          'revision', revision.revision,
          'legacy_status', revision.status,
          'created_at', revision.created_at
        )
      ) AS exception
      FROM public.document_revisions revision
      JOIN public.documents document
        ON document.id = revision.document_id
      WHERE document.org_id = p_org_id
        AND revision.created_at >= v_from_ts
        AND revision.created_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.document_versions version
          WHERE version.document_id = revision.document_id
            AND version.revision::TEXT = revision.revision::TEXT
        )
      ORDER BY revision.created_at DESC
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_versions_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'VERSION_WITHOUT_DOCUMENT',
        'severity', 'critical',
        'source', 'document_versions',
        'entity_type', 'document_version',
        'entity_id', version.id,
        'document_id', version.document_id,
        'project_id', NULL,
        'title', 'Versão sem documento correspondente',
        'description', 'document_versions referencia documento ausente ou fora da organização.',
        'recommendation', 'Investigar integridade referencial antes do piloto.',
        'evidence', jsonb_build_object(
          'document_id', version.document_id,
          'revision', version.revision
        )
      ) AS exception
      FROM public.document_versions version
      LEFT JOIN public.documents document
        ON document.id = version.document_id
       AND document.org_id = version.org_id
      WHERE version.org_id = p_org_id
        AND version.uploaded_at >= v_from_ts
        AND version.uploaded_at < v_to_ts
        AND document.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'VERSION_WITHOUT_FILE_HASH',
        'severity', 'low',
        'source', 'document_versions',
        'entity_type', 'document_version',
        'entity_id', version.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Versão sem hash de arquivo',
        'description', 'A versão formal não possui file_hash preenchido.',
        'recommendation', 'Confirmar se o arquivo foi criado antes da exigência de hash ou recalcular em processo manual futuro.',
        'evidence', jsonb_build_object(
          'file_name', version.file_name,
          'revision', version.revision,
          'uploaded_at', version.uploaded_at
        )
      ) AS exception
      FROM public.document_versions version
      JOIN public.documents document
        ON document.id = version.document_id
       AND document.org_id = version.org_id
      WHERE version.org_id = p_org_id
        AND version.uploaded_at >= v_from_ts
        AND version.uploaded_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NULLIF(BTRIM(COALESCE(version.file_hash, '')), '') IS NULL
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_versions_available AND v_version_status_available THEN
    EXECUTE $sql$
      SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'exception_type', 'VERSION_STATUS_OUT_OF_CONTRACT',
          'severity', 'medium',
          'source', 'document_versions',
          'entity_type', 'document_version',
          'entity_id', version.id,
          'document_id', document.id,
          'project_id', document.project_id,
          'title', 'Versão com status fora do contrato esperado',
          'description', 'A versão possui status não reconhecido pelo ciclo formal.',
          'recommendation', 'Validar o status antes de usar a versão em auditoria formal.',
          'evidence', jsonb_build_object('status', version.status, 'revision', version.revision)
        ) AS exception
        FROM public.document_versions version
        JOIN public.documents document
          ON document.id = version.document_id
         AND document.org_id = version.org_id
        WHERE version.org_id = $1
          AND version.uploaded_at >= $2
          AND version.uploaded_at < $3
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND ($6 = 'org' OR document.author_id = $7)
          AND version.status NOT IN ('draft', 'in_review', 'approved', 'published', 'superseded', 'archived')
        LIMIT 200
      ) row
    $sql$
    INTO v_found
    USING p_org_id, v_from_ts, v_to_ts, p_document_id, p_project_id, p_scope, p_actor_id;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_instances_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'TRAMITE_INSTANCE_WITHOUT_DOCUMENT',
        'severity', 'critical',
        'source', 'document_tramite_instances',
        'entity_type', 'tramite_instance',
        'entity_id', instance.id,
        'document_id', instance.document_id,
        'project_id', NULL,
        'title', 'Instância de trâmite sem documento válido',
        'description', 'A instância de trâmite não encontra documento correspondente na organização.',
        'recommendation', 'Investigar integridade da execução antes de reconciliar workflow.',
        'evidence', jsonb_build_object('instance_status', instance.status)
      ) AS exception
      FROM public.document_tramite_instances instance
      LEFT JOIN public.documents document
        ON document.id = instance.document_id
       AND document.org_id = instance.org_id
      WHERE instance.org_id = p_org_id
        AND instance.started_at >= v_from_ts
        AND instance.started_at < v_to_ts
        AND document.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_instances_available AND v_steps_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'TRAMITE_INSTANCE_WITHOUT_STEPS',
        'severity', 'high',
        'source', 'document_tramite_instances',
        'entity_type', 'tramite_instance',
        'entity_id', instance.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Instância de trâmite sem etapas',
        'description', 'A instância foi iniciada, mas não possui etapas registradas.',
        'recommendation', 'Verificar falha na inicialização do trâmite.',
        'evidence', jsonb_build_object('instance_status', instance.status, 'started_at', instance.started_at)
      ) AS exception
      FROM public.document_tramite_instances instance
      JOIN public.documents document
        ON document.id = instance.document_id
       AND document.org_id = instance.org_id
      WHERE instance.org_id = p_org_id
        AND instance.started_at >= v_from_ts
        AND instance.started_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.document_tramite_instance_steps step
          WHERE step.instance_id = instance.id
            AND step.org_id = instance.org_id
        )
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'TRAMITE_STEP_WITHOUT_INSTANCE',
        'severity', 'critical',
        'source', 'document_tramite_instance_steps',
        'entity_type', 'tramite_step',
        'entity_id', step.id,
        'document_id', step.document_id,
        'project_id', document.project_id,
        'title', 'Etapa sem instância de trâmite',
        'description', 'A etapa referencia instância ausente ou divergente.',
        'recommendation', 'Investigar integridade entre etapa e instância.',
        'evidence', jsonb_build_object('instance_id', step.instance_id, 'node_key', step.node_key)
      ) AS exception
      FROM public.document_tramite_instance_steps step
      LEFT JOIN public.document_tramite_instances instance
        ON instance.id = step.instance_id
       AND instance.org_id = step.org_id
      LEFT JOIN public.documents document
        ON document.id = step.document_id
       AND document.org_id = step.org_id
      WHERE step.org_id = p_org_id
        AND step.created_at >= v_from_ts
        AND step.created_at < v_to_ts
        AND instance.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'TRAMITE_STEP_OVERDUE_OPEN',
        'severity', 'high',
        'source', 'document_tramite_instance_steps',
        'entity_type', 'tramite_step',
        'entity_id', step.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Etapa vencida sem conclusão',
        'description', 'A etapa possui due_at vencido e ainda não foi concluída.',
        'recommendation', 'Investigar responsável, evidência pendente ou bloqueio operacional.',
        'evidence', jsonb_build_object(
          'label', step.label,
          'status', step.status,
          'due_at', step.due_at,
          'assignment_type', step.assignment_type,
          'assignee_user_id', step.assignee_user_id
        )
      ) AS exception
      FROM public.document_tramite_instance_steps step
      JOIN public.documents document
        ON document.id = step.document_id
       AND document.org_id = step.org_id
      WHERE step.org_id = p_org_id
        AND step.created_at >= v_from_ts
        AND step.created_at < v_to_ts
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND step.due_at IS NOT NULL
        AND step.due_at < NOW()
        AND step.status NOT IN ('completed', 'skipped', 'cancelled')
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_steps_available AND v_evidence_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'COMPLETED_REQUIRED_EVIDENCE_STEP_WITHOUT_EVIDENCE',
        'severity', 'high',
        'source', 'document_tramite_instance_steps',
        'entity_type', 'tramite_step',
        'entity_id', step.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Etapa concluída sem evidência obrigatória',
        'description', 'A etapa exige evidência ou arquivo, mas não há evidência registrada.',
        'recommendation', 'Validar execução antes de usar o trâmite como prova formal.',
        'evidence', jsonb_build_object(
          'label', step.label,
          'required_evidence', step.required_evidence,
          'required_file', step.required_file,
          'completed_at', step.completed_at
        )
      ) AS exception
      FROM public.document_tramite_instance_steps step
      JOIN public.documents document
        ON document.id = step.document_id
       AND document.org_id = step.org_id
      WHERE step.org_id = p_org_id
        AND step.completed_at >= v_from_ts
        AND step.completed_at < v_to_ts
        AND (step.required_evidence OR step.required_file)
        AND step.status = 'completed'
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
        AND NOT EXISTS (
          SELECT 1
          FROM public.document_tramite_instance_evidence evidence
          WHERE evidence.step_id = step.id
            AND evidence.org_id = step.org_id
            AND (
              NOT step.required_file
              OR evidence.evidence_type = 'file'
            )
        )
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_events_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'TRAMITE_EVENT_ORPHAN',
        'severity', 'medium',
        'source', 'document_tramite_instance_events',
        'entity_type', 'tramite_event',
        'entity_id', event.id,
        'document_id', event.document_id,
        'project_id', document.project_id,
        'title', 'Evento de trâmite órfão',
        'description', 'O evento referencia instância ou documento ausente.',
        'recommendation', 'Reconciliar eventos de execução antes de auditoria formal do workflow.',
        'evidence', jsonb_build_object(
          'event_type', event.event_type,
          'instance_id', event.instance_id,
          'step_id', event.step_id
        )
      ) AS exception
      FROM public.document_tramite_instance_events event
      LEFT JOIN public.document_tramite_instances instance
        ON instance.id = event.instance_id
       AND instance.org_id = event.org_id
      LEFT JOIN public.documents document
        ON document.id = event.document_id
       AND document.org_id = event.org_id
      WHERE event.org_id = p_org_id
        AND event.created_at >= v_from_ts
        AND event.created_at < v_to_ts
        AND (
          (event.instance_id IS NOT NULL AND instance.id IS NULL)
          OR (event.document_id IS NOT NULL AND document.id IS NULL)
        )
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_approvals_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'APPROVAL_WITHOUT_DOCUMENT',
        'severity', 'critical',
        'source', 'approval_flows',
        'entity_type', 'approval_flow',
        'entity_id', approval.id,
        'document_id', approval.document_id,
        'project_id', NULL,
        'title', 'Aprovação sem documento',
        'description', 'approval_flows referencia documento ausente ou fora da organização.',
        'recommendation', 'Investigar integridade das aprovações formais.',
        'evidence', jsonb_build_object('status', approval.status, 'step', approval.step)
      ) AS exception
      FROM public.approval_flows approval
      LEFT JOIN public.documents document
        ON document.id = approval.document_id
       AND document.org_id = approval.org_id
      WHERE approval.org_id = p_org_id
        AND approval.created_at >= v_from_ts
        AND approval.created_at < v_to_ts
        AND document.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'APPROVAL_DECIDED_WITHOUT_ACTOR',
        'severity', 'high',
        'source', 'approval_flows',
        'entity_type', 'approval_flow',
        'entity_id', approval.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Aprovação concluída sem decisor',
        'description', 'A aprovação foi concluída, mas decided_by está vazio.',
        'recommendation', 'Conferir trilha de decisão antes de considerar a aprovação probatória.',
        'evidence', jsonb_build_object('status', approval.status, 'decided_at', approval.decided_at)
      ) AS exception
      FROM public.approval_flows approval
      JOIN public.documents document
        ON document.id = approval.document_id
       AND document.org_id = approval.org_id
      WHERE approval.org_id = p_org_id
        AND approval.created_at >= v_from_ts
        AND approval.created_at < v_to_ts
        AND approval.status IN ('approved', 'rejected')
        AND approval.decided_by IS NULL
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'APPROVAL_DECIDED_BEFORE_CREATED',
        'severity', 'medium',
        'source', 'approval_flows',
        'entity_type', 'approval_flow',
        'entity_id', approval.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Aprovação com decisão anterior à criação',
        'description', 'decided_at é anterior a created_at, indicando possível divergência temporal.',
        'recommendation', 'Verificar importação ou ajuste manual de datas.',
        'evidence', jsonb_build_object('created_at', approval.created_at, 'decided_at', approval.decided_at)
      ) AS exception
      FROM public.approval_flows approval
      JOIN public.documents document
        ON document.id = approval.document_id
       AND document.org_id = approval.org_id
      WHERE approval.org_id = p_org_id
        AND approval.created_at >= v_from_ts
        AND approval.created_at < v_to_ts
        AND approval.decided_at IS NOT NULL
        AND approval.decided_at < approval.created_at
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_approvals_available AND v_approval_due_available THEN
    EXECUTE $sql$
      SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
      FROM (
        SELECT jsonb_build_object(
          'exception_type', 'APPROVAL_OVERDUE_PENDING',
          'severity', 'high',
          'source', 'approval_flows',
          'entity_type', 'approval_flow',
          'entity_id', approval.id,
          'document_id', document.id,
          'project_id', document.project_id,
          'title', 'Aprovação pendente fora do SLA',
          'description', 'A aprovação possui due_at vencido e continua pendente.',
          'recommendation', 'Avaliar gargalo de aprovação antes do piloto.',
          'evidence', jsonb_build_object('due_at', approval.due_at, 'status', approval.status)
        ) AS exception
        FROM public.approval_flows approval
        JOIN public.documents document
          ON document.id = approval.document_id
         AND document.org_id = approval.org_id
        WHERE approval.org_id = $1
          AND approval.created_at >= $2
          AND approval.created_at < $3
          AND approval.status = 'pending'
          AND approval.due_at IS NOT NULL
          AND approval.due_at < NOW()
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND ($6 = 'org' OR document.author_id = $7)
        LIMIT 200
      ) row
    $sql$
    INTO v_found
    USING p_org_id, v_from_ts, v_to_ts, p_document_id, p_project_id, p_scope, p_actor_id;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_evidence_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'FILE_EVIDENCE_WITHOUT_FILE_NAME',
        'severity', 'medium',
        'source', 'document_tramite_instance_evidence',
        'entity_type', 'evidence',
        'entity_id', evidence.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Evidência de arquivo sem nome',
        'description', 'A evidência do tipo arquivo não possui file_name.',
        'recommendation', 'Verificar o registro do upload antes de usar como prova.',
        'evidence', jsonb_build_object('file_path', evidence.file_path, 'created_at', evidence.created_at)
      ) AS exception
      FROM public.document_tramite_instance_evidence evidence
      JOIN public.documents document
        ON document.id = evidence.document_id
       AND document.org_id = evidence.org_id
      WHERE evidence.org_id = p_org_id
        AND evidence.created_at >= v_from_ts
        AND evidence.created_at < v_to_ts
        AND evidence.evidence_type = 'file'
        AND NULLIF(BTRIM(COALESCE(evidence.file_name, '')), '') IS NULL
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'FILE_EVIDENCE_WITHOUT_FILE_HASH',
        'severity', 'low',
        'source', 'document_tramite_instance_evidence',
        'entity_type', 'evidence',
        'entity_id', evidence.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Evidência de arquivo sem hash',
        'description', 'A evidência do tipo arquivo não possui file_hash.',
        'recommendation', 'Confirmar se o arquivo foi registrado antes da exigência de hash.',
        'evidence', jsonb_build_object('file_name', evidence.file_name, 'file_path', evidence.file_path)
      ) AS exception
      FROM public.document_tramite_instance_evidence evidence
      JOIN public.documents document
        ON document.id = evidence.document_id
       AND document.org_id = evidence.org_id
      WHERE evidence.org_id = p_org_id
        AND evidence.created_at >= v_from_ts
        AND evidence.created_at < v_to_ts
        AND evidence.evidence_type = 'file'
        AND NULLIF(BTRIM(COALESCE(evidence.file_hash, '')), '') IS NULL
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_notifications_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'NOTIFICATION_WITHOUT_RECIPIENT',
        'severity', 'high',
        'source', 'internal_notifications',
        'entity_type', 'notification',
        'entity_id', notification.id,
        'document_id', notification.document_id,
        'project_id', document.project_id,
        'title', 'Notificação sem destinatário válido',
        'description', 'A notificação não encontra profile destinatário na organização.',
        'recommendation', 'Investigar integridade de destinatários antes de ativar piloto operacional.',
        'evidence', jsonb_build_object(
          'recipient_user_id', notification.recipient_user_id,
          'notification_type', notification.notification_type
        )
      ) AS exception
      FROM public.internal_notifications notification
      LEFT JOIN public.profiles profile
        ON profile.id = notification.recipient_user_id
       AND profile.org_id = notification.org_id
      LEFT JOIN public.documents document
        ON document.id = notification.document_id
       AND document.org_id = notification.org_id
      WHERE notification.org_id = p_org_id
        AND notification.created_at >= v_from_ts
        AND notification.created_at < v_to_ts
        AND profile.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'NOTIFICATION_DOCUMENT_MISSING',
        'severity', 'medium',
        'source', 'internal_notifications',
        'entity_type', 'notification',
        'entity_id', notification.id,
        'document_id', notification.document_id,
        'project_id', NULL,
        'title', 'Notificação relacionada a documento inexistente',
        'description', 'A notificação aponta para document_id sem documento correspondente.',
        'recommendation', 'Conferir rastreabilidade entre notificação e documento.',
        'evidence', jsonb_build_object('notification_type', notification.notification_type)
      ) AS exception
      FROM public.internal_notifications notification
      LEFT JOIN public.documents document
        ON document.id = notification.document_id
       AND document.org_id = notification.org_id
      WHERE notification.org_id = p_org_id
        AND notification.document_id IS NOT NULL
        AND notification.created_at >= v_from_ts
        AND notification.created_at < v_to_ts
        AND document.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_notification_events_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'NOTIFICATION_EVENT_ORPHAN',
        'severity', 'medium',
        'source', 'notification_events',
        'entity_type', 'notification_event',
        'entity_id', event.id,
        'document_id', event.document_id,
        'project_id', NULL,
        'title', 'Evento de notificação órfão',
        'description', 'notification_events referencia notificação inexistente.',
        'recommendation', 'Verificar se houve limpeza manual indevida de notificações.',
        'evidence', jsonb_build_object(
          'notification_id', event.notification_id,
          'event_type', event.event_type
        )
      ) AS exception
      FROM public.notification_events event
      LEFT JOIN public.internal_notifications notification
        ON notification.id = event.notification_id
       AND notification.org_id = event.org_id
      WHERE event.org_id = p_org_id
        AND event.notification_id IS NOT NULL
        AND event.created_at >= v_from_ts
        AND event.created_at < v_to_ts
        AND notification.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_audit_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'AUDIT_TRAIL_WITHOUT_DOCUMENT',
        'severity', 'high',
        'source', 'audit_trail',
        'entity_type', 'audit_event',
        'entity_id', audit.id,
        'document_id', audit.document_id,
        'project_id', NULL,
        'title', 'Evento audit_trail sem documento',
        'description', 'audit_trail referencia documento ausente ou de outra organização.',
        'recommendation', 'Investigar integridade da trilha antes de exportação probatória.',
        'evidence', jsonb_build_object('action', audit.action, 'created_at', audit.created_at)
      ) AS exception
      FROM public.audit_trail audit
      LEFT JOIN public.documents document
        ON document.id = audit.document_id
       AND document.org_id = audit.org_id
      WHERE audit.org_id = p_org_id
        AND audit.created_at >= v_from_ts
        AND audit.created_at < v_to_ts
        AND document.id IS NULL
        AND p_scope = 'org'
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'AUDIT_STATUS_CHANGE_INCOMPLETE',
        'severity', 'medium',
        'source', 'audit_trail',
        'entity_type', 'audit_event',
        'entity_id', audit.id,
        'document_id', document.id,
        'project_id', document.project_id,
        'title', 'Evento de mudança de status incompleto',
        'description', 'A ação status_changed não contém old_status e new_status completos.',
        'recommendation', 'Validar se a mudança de status ocorreu antes do contrato atual de auditoria.',
        'evidence', jsonb_build_object(
          'action', audit.action,
          'old_status', audit.old_status,
          'new_status', audit.new_status
        )
      ) AS exception
      FROM public.audit_trail audit
      JOIN public.documents document
        ON document.id = audit.document_id
       AND document.org_id = audit.org_id
      WHERE audit.org_id = p_org_id
        AND audit.created_at >= v_from_ts
        AND audit.created_at < v_to_ts
        AND audit.action = 'status_changed'
        AND (audit.old_status IS NULL OR audit.new_status IS NULL)
        AND (p_document_id IS NULL OR document.id = p_document_id)
        AND (p_project_id IS NULL OR document.project_id = p_project_id)
        AND (p_scope = 'org' OR document.author_id = p_actor_id)
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  END IF;

  IF v_exports_available THEN
    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'AUDIT_EXPORT_WITHOUT_HASH',
        'severity', 'medium',
        'source', 'audit_report_exports',
        'entity_type', 'audit_report_export',
        'entity_id', report_export.id,
        'document_id', report_export.document_id,
        'project_id', report_export.project_id,
        'title', 'Exportação formal sem hash técnico',
        'description', 'A exportação foi registrada sem integrity_hash.',
        'recommendation', 'Reemitir o pacote quando hash técnico estiver disponível.',
        'evidence', jsonb_build_object('report_type', report_export.report_type, 'report_format', report_export.report_format)
      ) AS exception
      FROM public.audit_report_exports report_export
      WHERE report_export.org_id = p_org_id
        AND report_export.generated_at >= v_from_ts
        AND report_export.generated_at < v_to_ts
        AND (p_document_id IS NULL OR report_export.document_id = p_document_id)
        AND (p_project_id IS NULL OR report_export.project_id = p_project_id)
        AND (p_scope = 'org' OR report_export.requested_by = p_actor_id)
        AND report_export.integrity_hash IS NULL
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;

    SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
    INTO v_found
    FROM (
      SELECT jsonb_build_object(
        'exception_type', 'AUDIT_EXPORT_INCOMPLETE_MANIFEST',
        'severity', 'low',
        'source', 'audit_report_exports',
        'entity_type', 'audit_report_export',
        'entity_id', report_export.id,
        'document_id', report_export.document_id,
        'project_id', report_export.project_id,
        'title', 'Exportação formal com manifesto incompleto',
        'description', 'Manifesto, contagens, cobertura ou limitações foram registrados vazios.',
        'recommendation', 'Revisar o pacote exportado e registrar nova exportação se necessário.',
        'evidence', jsonb_build_object(
          'manifest', report_export.manifest,
          'record_counts', report_export.record_counts,
          'source_coverage', report_export.source_coverage,
          'limitations', report_export.limitations
        )
      ) AS exception
      FROM public.audit_report_exports report_export
      WHERE report_export.org_id = p_org_id
        AND report_export.generated_at >= v_from_ts
        AND report_export.generated_at < v_to_ts
        AND (p_document_id IS NULL OR report_export.document_id = p_document_id)
        AND (p_project_id IS NULL OR report_export.project_id = p_project_id)
        AND (p_scope = 'org' OR report_export.requested_by = p_actor_id)
        AND (
          report_export.manifest = '{}'::JSONB
          OR report_export.record_counts = '{}'::JSONB
          OR report_export.source_coverage = '{}'::JSONB
          OR report_export.limitations = '[]'::JSONB
        )
      LIMIT 200
    ) row;
    v_exceptions := v_exceptions || v_found;
  ELSE
    v_exceptions := v_exceptions || jsonb_build_array(
      jsonb_build_object(
        'exception_type', 'COMPLETENESS_AUDIT_EXPORT_SOURCE_MISSING',
        'severity', 'high',
        'source', 'completeness',
        'entity_type', 'schema',
        'entity_id', NULL,
        'document_id', NULL,
        'project_id', NULL,
        'title', 'Histórico formal de exportações ausente',
        'description', 'audit_report_exports não está disponível; exportações formais não podem ser reconciliadas.',
        'recommendation', 'Aplicar o ciclo 26_TRAMITA_audit_reports_export antes de validar P-27.1.',
        'evidence', jsonb_build_object('missing_table', 'audit_report_exports')
      )
    );
  END IF;

  RETURN v_exceptions;
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_audit_reconciliation_overview(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_scope TEXT DEFAULT 'org',
  p_document_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
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
  v_from DATE := COALESCE(p_from, CURRENT_DATE - 29);
  v_to DATE := COALESCE(p_to, CURRENT_DATE);
  v_source_coverage JSONB;
  v_counts_by_severity JSONB := '{}'::JSONB;
  v_counts_by_status JSONB := '{}'::JSONB;
  v_counts_by_type JSONB := '{}'::JSONB;
  v_counts_by_source JSONB := '{}'::JSONB;
  v_exceptions JSONB := '[]'::JSONB;
  v_runs JSONB := '[]'::JSONB;
  v_latest_run JSONB := NULL;
  v_limitations JSONB := jsonb_build_array(
    'A reconciliação não corrige dados automaticamente.',
    'Hash técnico não substitui assinatura digital ICP-Brasil.',
    'Fontes ausentes ou incompatíveis são declaradas como limitações, não como zeros.'
  );
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

  IF v_scope = 'org'
     AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem ver reconciliação organizacional.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to < v_from THEN
    RAISE EXCEPTION 'Período de reconciliação inválido.';
  END IF;

  IF (v_to - v_from) > 365 THEN
    RAISE EXCEPTION 'O período máximo da reconciliação é 365 dias.';
  END IF;

  v_source_coverage := public.audit_reconciliation_source_coverage(
    v_org_id, v_from, v_to
  );

  SELECT COALESCE(JSONB_OBJECT_AGG(severity, total), '{}'::JSONB)
  INTO v_counts_by_severity
  FROM (
    SELECT exception.severity, COUNT(*) AS total
    FROM public.audit_reconciliation_exceptions exception
    WHERE exception.org_id = v_org_id
      AND exception.created_at::DATE BETWEEN v_from AND v_to
      AND (p_document_id IS NULL OR exception.document_id = p_document_id)
      AND (p_project_id IS NULL OR exception.project_id = p_project_id)
      AND (
        v_scope = 'org'
        OR exception.document_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = exception.document_id
            AND document.author_id = v_actor_id
        )
      )
    GROUP BY exception.severity
  ) grouped;

  SELECT COALESCE(JSONB_OBJECT_AGG(status, total), '{}'::JSONB)
  INTO v_counts_by_status
  FROM (
    SELECT exception.status, COUNT(*) AS total
    FROM public.audit_reconciliation_exceptions exception
    WHERE exception.org_id = v_org_id
      AND exception.created_at::DATE BETWEEN v_from AND v_to
      AND (p_document_id IS NULL OR exception.document_id = p_document_id)
      AND (p_project_id IS NULL OR exception.project_id = p_project_id)
      AND (
        v_scope = 'org'
        OR exception.document_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = exception.document_id
            AND document.author_id = v_actor_id
        )
      )
    GROUP BY exception.status
  ) grouped;

  SELECT COALESCE(JSONB_OBJECT_AGG(exception_type, total), '{}'::JSONB)
  INTO v_counts_by_type
  FROM (
    SELECT exception.exception_type, COUNT(*) AS total
    FROM public.audit_reconciliation_exceptions exception
    WHERE exception.org_id = v_org_id
      AND exception.created_at::DATE BETWEEN v_from AND v_to
      AND (p_document_id IS NULL OR exception.document_id = p_document_id)
      AND (p_project_id IS NULL OR exception.project_id = p_project_id)
      AND (
        v_scope = 'org'
        OR exception.document_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = exception.document_id
            AND document.author_id = v_actor_id
        )
      )
    GROUP BY exception.exception_type
    ORDER BY total DESC
    LIMIT 20
  ) grouped;

  SELECT COALESCE(JSONB_OBJECT_AGG(source, total), '{}'::JSONB)
  INTO v_counts_by_source
  FROM (
    SELECT exception.source, COUNT(*) AS total
    FROM public.audit_reconciliation_exceptions exception
    WHERE exception.org_id = v_org_id
      AND exception.created_at::DATE BETWEEN v_from AND v_to
      AND (p_document_id IS NULL OR exception.document_id = p_document_id)
      AND (p_project_id IS NULL OR exception.project_id = p_project_id)
      AND (
        v_scope = 'org'
        OR exception.document_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = exception.document_id
            AND document.author_id = v_actor_id
        )
      )
    GROUP BY exception.source
  ) grouped;

  SELECT COALESCE(JSONB_AGG(row.exception), '[]'::JSONB)
  INTO v_exceptions
  FROM (
    SELECT jsonb_build_object(
      'id', exception.id,
      'run_id', exception.run_id,
      'exception_type', exception.exception_type,
      'severity', exception.severity,
      'status', exception.status,
      'source', exception.source,
      'entity_type', exception.entity_type,
      'entity_id', exception.entity_id,
      'document_id', exception.document_id,
      'project_id', exception.project_id,
      'title', exception.title,
      'description', exception.description,
      'recommendation', exception.recommendation,
      'evidence', exception.evidence,
      'first_seen_at', exception.first_seen_at,
      'last_seen_at', exception.last_seen_at,
      'resolved_at', exception.resolved_at,
      'acknowledged_at', exception.acknowledged_at,
      'ignored_at', exception.ignored_at,
      'resolution_note', exception.resolution_note
    ) AS exception
    FROM public.audit_reconciliation_exceptions exception
    WHERE exception.org_id = v_org_id
      AND exception.created_at::DATE BETWEEN v_from AND v_to
      AND (p_document_id IS NULL OR exception.document_id = p_document_id)
      AND (p_project_id IS NULL OR exception.project_id = p_project_id)
      AND (
        v_scope = 'org'
        OR exception.document_id IS NULL
        OR EXISTS (
          SELECT 1
          FROM public.documents document
          WHERE document.id = exception.document_id
            AND document.author_id = v_actor_id
        )
      )
    ORDER BY
      CASE exception.severity
        WHEN 'critical' THEN 1
        WHEN 'high' THEN 2
        WHEN 'medium' THEN 3
        WHEN 'low' THEN 4
        ELSE 5
      END,
      exception.last_seen_at DESC
    LIMIT 100
  ) row;

  SELECT COALESCE(JSONB_AGG(row.run), '[]'::JSONB)
  INTO v_runs
  FROM (
    SELECT jsonb_build_object(
      'id', run.id,
      'scope', run.scope,
      'period_from', run.period_from,
      'period_to', run.period_to,
      'status', run.status,
      'started_at', run.started_at,
      'finished_at', run.finished_at,
      'source_coverage', run.source_coverage,
      'record_counts', run.record_counts,
      'exception_counts', run.exception_counts,
      'limitations', run.limitations,
      'package_hash', run.package_hash,
      'requested_by', run.requested_by,
      'created_at', run.created_at
    ) AS run
    FROM public.audit_reconciliation_runs run
    WHERE run.org_id = v_org_id
      AND (
        v_scope = 'org'
        OR run.requested_by = v_actor_id
      )
    ORDER BY run.created_at DESC
    LIMIT 10
  ) row;

  v_latest_run := CASE
    WHEN jsonb_array_length(v_runs) > 0 THEN v_runs->0
    ELSE NULL
  END;

  RETURN jsonb_build_object(
    'version', 'P-27.1',
    'generated_at', NOW(),
    'scope', v_scope,
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'filters', jsonb_build_object(
      'document_id', p_document_id,
      'project_id', p_project_id
    ),
    'source_coverage', v_source_coverage,
    'counts', jsonb_build_object(
      'by_severity', v_counts_by_severity,
      'by_status', v_counts_by_status,
      'by_type', v_counts_by_type,
      'by_source', v_counts_by_source
    ),
    'exceptions', v_exceptions,
    'latest_run', v_latest_run,
    'runs', v_runs,
    'limitations', v_limitations
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.run_audit_reconciliation(
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_scope TEXT DEFAULT 'org',
  p_document_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_actor_role TEXT;
  v_scope TEXT := LOWER(BTRIM(COALESCE(p_scope, 'org')));
  v_from DATE := COALESCE(p_from, CURRENT_DATE - 29);
  v_to DATE := COALESCE(p_to, CURRENT_DATE);
  v_started_at TIMESTAMPTZ := NOW();
  v_finished_at TIMESTAMPTZ;
  v_run_id UUID := gen_random_uuid();
  v_source_coverage JSONB;
  v_record_counts JSONB := '{}'::JSONB;
  v_exception_counts JSONB;
  v_limitations JSONB := jsonb_build_array(
    'A reconciliação não altera dados operacionais.',
    'A comparação de hash usa pacote atual calculado no banco e não substitui assinatura digital ICP-Brasil.'
  );
  v_package JSONB := NULL;
  v_package_hash TEXT := NULL;
  v_exceptions JSONB := '[]'::JSONB;
  v_exception JSONB;
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

  IF v_scope = 'org'
     AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem executar reconciliação organizacional.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to < v_from THEN
    RAISE EXCEPTION 'Período de reconciliação inválido.';
  END IF;

  IF (v_to - v_from) > 365 THEN
    RAISE EXCEPTION 'O período máximo da reconciliação é 365 dias.';
  END IF;

  IF p_document_id IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM public.documents document
       WHERE document.id = p_document_id
         AND document.org_id = v_org_id
         AND (
           v_scope = 'org'
           OR document.author_id = v_actor_id
         )
     ) THEN
    RAISE EXCEPTION
      'Documento inexistente ou indisponível para o escopo solicitado.'
      USING ERRCODE = '42501';
  END IF;

  v_source_coverage := public.audit_reconciliation_source_coverage(
    v_org_id, v_from, v_to
  );

  IF to_regprocedure(
    'public.get_audit_report_package(text,date,date,text,uuid,uuid,text,text,text)'
  ) IS NOT NULL THEN
    BEGIN
      v_package := public.get_audit_report_package(
        'operational',
        v_from,
        v_to,
        v_scope,
        p_document_id,
        p_project_id,
        NULL,
        NULL,
        NULL
      );
      v_record_counts := COALESCE(v_package->'record_counts', '{}'::JSONB);
      v_package_hash := encode(digest(v_package::TEXT, 'sha256'), 'hex');
    EXCEPTION
      WHEN OTHERS THEN
        v_limitations := v_limitations || jsonb_build_array(
          'get_audit_report_package não pôde ser reaproveitada nesta execução: ' || SQLERRM
        );
    END;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'RPC get_audit_report_package não encontrada; cobertura P-27 limitada.'
    );
  END IF;

  v_exceptions := public.audit_reconciliation_detect_exceptions(
    v_org_id,
    v_actor_id,
    v_actor_role,
    v_from,
    v_to,
    v_scope,
    p_document_id,
    p_project_id
  );

  SELECT jsonb_build_object(
    'total', jsonb_array_length(v_exceptions),
    'by_severity', COALESCE((
      SELECT JSONB_OBJECT_AGG(severity, total)
      FROM (
        SELECT value->>'severity' AS severity, COUNT(*) AS total
        FROM jsonb_array_elements(v_exceptions) value
        GROUP BY value->>'severity'
      ) grouped
    ), '{}'::JSONB),
    'by_type', COALESCE((
      SELECT JSONB_OBJECT_AGG(exception_type, total)
      FROM (
        SELECT value->>'exception_type' AS exception_type, COUNT(*) AS total
        FROM jsonb_array_elements(v_exceptions) value
        GROUP BY value->>'exception_type'
      ) grouped
    ), '{}'::JSONB),
    'by_source', COALESCE((
      SELECT JSONB_OBJECT_AGG(source, total)
      FROM (
        SELECT value->>'source' AS source, COUNT(*) AS total
        FROM jsonb_array_elements(v_exceptions) value
        GROUP BY value->>'source'
      ) grouped
    ), '{}'::JSONB)
  ) INTO v_exception_counts;

  v_finished_at := NOW();

  INSERT INTO public.audit_reconciliation_runs (
    id,
    org_id,
    requested_by,
    scope,
    period_from,
    period_to,
    status,
    started_at,
    finished_at,
    source_coverage,
    record_counts,
    exception_counts,
    limitations,
    package_hash
  )
  VALUES (
    v_run_id,
    v_org_id,
    v_actor_id,
    v_scope,
    v_from,
    v_to,
    CASE
      WHEN jsonb_array_length(v_limitations) > 2
        THEN 'completed_with_limitations'
      ELSE 'completed'
    END,
    v_started_at,
    v_finished_at,
    v_source_coverage,
    v_record_counts,
    v_exception_counts,
    v_limitations,
    v_package_hash
  );

  FOR v_exception IN
    SELECT value
    FROM jsonb_array_elements(v_exceptions) value
  LOOP
    INSERT INTO public.audit_reconciliation_exceptions (
      org_id,
      run_id,
      exception_type,
      severity,
      status,
      source,
      entity_type,
      entity_id,
      document_id,
      project_id,
      title,
      description,
      recommendation,
      evidence,
      first_seen_at,
      last_seen_at
    )
    VALUES (
      v_org_id,
      v_run_id,
      v_exception->>'exception_type',
      v_exception->>'severity',
      'open',
      v_exception->>'source',
      v_exception->>'entity_type',
      NULLIF(v_exception->>'entity_id', '')::UUID,
      NULLIF(v_exception->>'document_id', '')::UUID,
      NULLIF(v_exception->>'project_id', '')::UUID,
      v_exception->>'title',
      v_exception->>'description',
      NULLIF(v_exception->>'recommendation', ''),
      COALESCE(v_exception->'evidence', '{}'::JSONB),
      NOW(),
      NOW()
    )
    ON CONFLICT (
      org_id,
      exception_type,
      source,
      entity_type,
      COALESCE(entity_id, '00000000-0000-0000-0000-000000000000'::UUID),
      COALESCE(document_id, '00000000-0000-0000-0000-000000000000'::UUID)
    )
    WHERE status = 'open'
    DO UPDATE SET
      run_id = EXCLUDED.run_id,
      severity = EXCLUDED.severity,
      title = EXCLUDED.title,
      description = EXCLUDED.description,
      recommendation = EXCLUDED.recommendation,
      evidence = EXCLUDED.evidence,
      project_id = EXCLUDED.project_id,
      last_seen_at = NOW();
  END LOOP;

  RETURN jsonb_build_object(
    'success', TRUE,
    'run_id', v_run_id,
    'scope', v_scope,
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    'source_coverage', v_source_coverage,
    'record_counts', v_record_counts,
    'exception_counts', v_exception_counts,
    'exceptions', v_exceptions,
    'limitations', v_limitations,
    'package_hash', v_package_hash
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_audit_exception_status(
  p_exception_id UUID,
  p_status TEXT,
  p_note TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_actor_role TEXT;
  v_status TEXT := LOWER(BTRIM(COALESCE(p_status, '')));
  v_exception public.audit_reconciliation_exceptions%ROWTYPE;
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
      'Somente administradores e gestores podem alterar status de exceção.'
      USING ERRCODE = '42501';
  END IF;

  IF v_status NOT IN ('acknowledged', 'ignored', 'resolved') THEN
    RAISE EXCEPTION 'Status permitido: acknowledged, ignored ou resolved.';
  END IF;

  UPDATE public.audit_reconciliation_exceptions exception
  SET
    status = v_status,
    acknowledged_by = CASE
      WHEN v_status = 'acknowledged' THEN v_actor_id
      ELSE exception.acknowledged_by
    END,
    acknowledged_at = CASE
      WHEN v_status = 'acknowledged' THEN NOW()
      ELSE exception.acknowledged_at
    END,
    ignored_by = CASE
      WHEN v_status = 'ignored' THEN v_actor_id
      ELSE exception.ignored_by
    END,
    ignored_at = CASE
      WHEN v_status = 'ignored' THEN NOW()
      ELSE exception.ignored_at
    END,
    resolved_at = CASE
      WHEN v_status = 'resolved' THEN NOW()
      ELSE exception.resolved_at
    END,
    resolution_note = NULLIF(BTRIM(COALESCE(p_note, '')), '')
  WHERE exception.id = p_exception_id
    AND exception.org_id = v_org_id
  RETURNING *
  INTO v_exception;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exceção não encontrada para a organização atual.';
  END IF;

  RETURN jsonb_build_object(
    'success', TRUE,
    'exception_id', v_exception.id,
    'status', v_exception.status,
    'updated_by', v_actor_id,
    'updated_at', NOW(),
    'note', v_exception.resolution_note
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_audit_exception_detail(
  p_exception_id UUID
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
  v_exception public.audit_reconciliation_exceptions%ROWTYPE;
  v_document JSONB := NULL;
  v_run JSONB := NULL;
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

  SELECT *
  INTO v_exception
  FROM public.audit_reconciliation_exceptions exception
  WHERE exception.id = p_exception_id
    AND exception.org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Exceção não encontrada para a organização atual.';
  END IF;

  IF v_actor_role NOT IN ('admin', 'manager')
     AND (
       v_exception.document_id IS NULL
       OR NOT EXISTS (
         SELECT 1
         FROM public.documents document
         WHERE document.id = v_exception.document_id
           AND document.author_id = v_actor_id
       )
     ) THEN
    RAISE EXCEPTION
      'Seu perfil não pode acessar esta exceção.'
      USING ERRCODE = '42501';
  END IF;

  IF v_exception.document_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', document.id,
      'code', document.code,
      'title', document.title,
      'status', document.status,
      'doc_type', document.doc_type,
      'area', document.area,
      'project_id', document.project_id,
      'created_at', document.created_at
    )
    INTO v_document
    FROM public.documents document
    WHERE document.id = v_exception.document_id
      AND document.org_id = v_org_id;
  END IF;

  IF v_exception.run_id IS NOT NULL THEN
    SELECT jsonb_build_object(
      'id', run.id,
      'scope', run.scope,
      'period_from', run.period_from,
      'period_to', run.period_to,
      'status', run.status,
      'source_coverage', run.source_coverage,
      'record_counts', run.record_counts,
      'exception_counts', run.exception_counts,
      'limitations', run.limitations,
      'package_hash', run.package_hash,
      'created_at', run.created_at
    )
    INTO v_run
    FROM public.audit_reconciliation_runs run
    WHERE run.id = v_exception.run_id
      AND run.org_id = v_org_id;
  END IF;

  RETURN jsonb_build_object(
    'id', v_exception.id,
    'run_id', v_exception.run_id,
    'exception_type', v_exception.exception_type,
    'severity', v_exception.severity,
    'status', v_exception.status,
    'source', v_exception.source,
    'entity_type', v_exception.entity_type,
    'entity_id', v_exception.entity_id,
    'document_id', v_exception.document_id,
    'project_id', v_exception.project_id,
    'title', v_exception.title,
    'description', v_exception.description,
    'recommendation', v_exception.recommendation,
    'evidence', v_exception.evidence,
    'first_seen_at', v_exception.first_seen_at,
    'last_seen_at', v_exception.last_seen_at,
    'resolved_at', v_exception.resolved_at,
    'acknowledged_by', v_exception.acknowledged_by,
    'acknowledged_at', v_exception.acknowledged_at,
    'ignored_by', v_exception.ignored_by,
    'ignored_at', v_exception.ignored_at,
    'resolution_note', v_exception.resolution_note,
    'document', v_document,
    'run', v_run,
    'write_contract', jsonb_build_object(
      'allowed', jsonb_build_array('acknowledged', 'ignored', 'resolved'),
      'forbidden', jsonb_build_array(
        'documents',
        'document_versions',
        'approval_flows',
        'document_tramite_instances',
        'document_tramite_instance_steps',
        'internal_notifications',
        'audit_trail'
      )
    )
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.audit_reconciliation_source_coverage(UUID, DATE, DATE)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.audit_reconciliation_detect_exceptions(
  UUID, UUID, TEXT, DATE, DATE, TEXT, UUID, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_audit_reconciliation_overview(
  DATE, DATE, TEXT, UUID, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.run_audit_reconciliation(
  DATE, DATE, TEXT, UUID, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_audit_exception_status(UUID, TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_audit_exception_detail(UUID)
  FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_audit_reconciliation_overview(
  DATE, DATE, TEXT, UUID, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.run_audit_reconciliation(
  DATE, DATE, TEXT, UUID, UUID
) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_audit_exception_status(UUID, TEXT, TEXT)
  TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_audit_exception_detail(UUID)
  TO authenticated;

COMMENT ON TABLE public.audit_reconciliation_runs IS
  'P-27.1: histórico append-only de execuções de reconciliação de auditoria.';

COMMENT ON TABLE public.audit_reconciliation_exceptions IS
  'P-27.1: exceções operacionais/auditáveis detectadas sem alteração automática da operação.';

COMMENT ON FUNCTION public.get_audit_reconciliation_overview(
  DATE, DATE, TEXT, UUID, UUID
) IS
  'P-27.1: visão consolidada read-only das exceções e cobertura de reconciliação.';

COMMENT ON FUNCTION public.run_audit_reconciliation(
  DATE, DATE, TEXT, UUID, UUID
) IS
  'P-27.1: calcula e registra run/exceções em tabelas próprias, sem alterar entidades operacionais.';

COMMENT ON FUNCTION public.update_audit_exception_status(UUID, TEXT, TEXT) IS
  'P-27.1: altera somente status/nota de exceção própria da reconciliação.';

COMMENT ON FUNCTION public.get_audit_exception_detail(UUID) IS
  'P-27.1: detalha exceção e evidências técnicas sem escrita.';

NOTIFY pgrst, 'reload schema';

COMMIT;
