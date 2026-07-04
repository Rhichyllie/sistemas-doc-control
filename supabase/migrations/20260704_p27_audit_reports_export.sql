-- P-27 — Relatórios e Exportação Formal de Auditoria
-- Nome no Supabase SQL Editor: 26_TRAMITA_audit_reports_export
--
-- Migration aditiva. A única escrita criada é o registro append-only de
-- exportações. A RPC de pacote é estritamente read-only e não altera
-- documentos, versões, aprovações, trâmites, notificações ou prazos.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.audit_report_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  report_type TEXT NOT NULL,
  report_format TEXT NOT NULL,
  scope TEXT NOT NULL,
  period_from DATE,
  period_to DATE,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  project_id UUID,
  filters JSONB NOT NULL DEFAULT '{}'::JSONB,
  manifest JSONB NOT NULL DEFAULT '{}'::JSONB,
  record_counts JSONB NOT NULL DEFAULT '{}'::JSONB,
  source_coverage JSONB NOT NULL DEFAULT '{}'::JSONB,
  limitations JSONB NOT NULL DEFAULT '[]'::JSONB,
  integrity_hash TEXT,
  file_name TEXT,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT audit_report_exports_type_check
    CHECK (
      report_type IN ('operational', 'document', 'sla', 'evidence_workflow')
    ),
  CONSTRAINT audit_report_exports_format_check
    CHECK (report_format IN ('json', 'csv', 'pdf', 'summary')),
  CONSTRAINT audit_report_exports_scope_check
    CHECK (scope IN ('org', 'mine')),
  CONSTRAINT audit_report_exports_period_check
    CHECK (
      period_from IS NULL
      OR period_to IS NULL
      OR period_to >= period_from
    ),
  CONSTRAINT audit_report_exports_filters_object
    CHECK (JSONB_TYPEOF(filters) = 'object'),
  CONSTRAINT audit_report_exports_manifest_object
    CHECK (JSONB_TYPEOF(manifest) = 'object'),
  CONSTRAINT audit_report_exports_counts_object
    CHECK (JSONB_TYPEOF(record_counts) = 'object'),
  CONSTRAINT audit_report_exports_coverage_object
    CHECK (JSONB_TYPEOF(source_coverage) = 'object'),
  CONSTRAINT audit_report_exports_limitations_array
    CHECK (JSONB_TYPEOF(limitations) = 'array'),
  CONSTRAINT audit_report_exports_hash_check
    CHECK (
      integrity_hash IS NULL
      OR integrity_hash ~ '^[0-9a-fA-F]{64}$'
    ),
  CONSTRAINT audit_report_exports_file_name_check
    CHECK (
      file_name IS NULL
      OR (
        LENGTH(file_name) <= 255
        AND file_name !~ '[[:cntrl:]]'
      )
    )
);

DO $constraints$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.audit_report_exports'::REGCLASS
         AND conname = 'audit_report_exports_project_id_fkey'
     ) THEN
    ALTER TABLE public.audit_report_exports
      ADD CONSTRAINT audit_report_exports_project_id_fkey
      FOREIGN KEY (project_id)
      REFERENCES public.projects(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$constraints$;

CREATE INDEX IF NOT EXISTS idx_audit_report_exports_org_generated
  ON public.audit_report_exports(org_id, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_report_exports_requester_generated
  ON public.audit_report_exports(requested_by, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_report_exports_report_type
  ON public.audit_report_exports(org_id, report_type, generated_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_report_exports_document
  ON public.audit_report_exports(document_id, generated_at DESC)
  WHERE document_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.guard_audit_report_exports_append_only()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  RAISE EXCEPTION
    'O histórico de exportações de auditoria é append-only e não pode ser alterado ou removido.'
    USING ERRCODE = '55000';
END;
$function$;

DROP TRIGGER IF EXISTS audit_report_exports_append_only
  ON public.audit_report_exports;

CREATE TRIGGER audit_report_exports_append_only
  BEFORE UPDATE OR DELETE ON public.audit_report_exports
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_audit_report_exports_append_only();

ALTER TABLE public.audit_report_exports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_report_exports_select_scope
  ON public.audit_report_exports;
DROP POLICY IF EXISTS audit_report_exports_service_role
  ON public.audit_report_exports;

CREATE POLICY audit_report_exports_select_scope
  ON public.audit_report_exports
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      requested_by = auth.uid()
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

CREATE POLICY audit_report_exports_service_role
  ON public.audit_report_exports
  FOR SELECT
  TO service_role
  USING (TRUE);

REVOKE ALL ON public.audit_report_exports FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.audit_report_exports
  FROM authenticated;
GRANT SELECT ON public.audit_report_exports TO authenticated;
GRANT SELECT, INSERT ON public.audit_report_exports TO service_role;

CREATE OR REPLACE FUNCTION public.get_audit_report_package(
  p_report_type TEXT DEFAULT 'operational',
  p_from DATE DEFAULT NULL,
  p_to DATE DEFAULT NULL,
  p_scope TEXT DEFAULT 'org',
  p_document_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_doc_type TEXT DEFAULT NULL,
  p_area TEXT DEFAULT NULL,
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
  v_actor_name TEXT;
  v_org_name TEXT;
  v_org_slug TEXT;
  v_org_prefix TEXT;
  v_report_type TEXT := LOWER(BTRIM(COALESCE(p_report_type, 'operational')));
  v_scope TEXT := LOWER(BTRIM(COALESCE(p_scope, 'org')));
  v_from DATE := COALESCE(p_from, CURRENT_DATE - 29);
  v_to DATE := COALESCE(p_to, CURRENT_DATE);
  v_generated_at TIMESTAMPTZ := NOW();

  v_versions_available BOOLEAN := FALSE;
  v_revisions_available BOOLEAN := FALSE;
  v_approvals_available BOOLEAN := FALSE;
  v_instances_available BOOLEAN := FALSE;
  v_steps_available BOOLEAN := FALSE;
  v_tramite_events_available BOOLEAN := FALSE;
  v_evidence_available BOOLEAN := FALSE;
  v_notifications_available BOOLEAN := FALSE;
  v_notification_events_available BOOLEAN := FALSE;
  v_audit_available BOOLEAN := FALSE;
  v_legacy_audit_available BOOLEAN :=
    to_regclass('public.audit_log') IS NOT NULL
    OR to_regclass('public.flow_audit_log') IS NOT NULL;
  v_projects_available BOOLEAN := to_regclass('public.projects') IS NOT NULL;
  v_indicators_available BOOLEAN :=
    to_regprocedure(
      'public.get_operational_indicators(date,date,text,uuid,text,text,uuid,text,text)'
    ) IS NOT NULL;

  v_documents JSONB := '[]'::JSONB;
  v_versions JSONB := '[]'::JSONB;
  v_revisions JSONB := '[]'::JSONB;
  v_approvals JSONB := '[]'::JSONB;
  v_instances JSONB := '[]'::JSONB;
  v_steps JSONB := '[]'::JSONB;
  v_tramite_events JSONB := '[]'::JSONB;
  v_evidences JSONB := '[]'::JSONB;
  v_audit_events JSONB := '[]'::JSONB;
  v_timeline JSONB := '[]'::JSONB;
  v_timeline_part JSONB := '[]'::JSONB;
  v_notifications_summary JSONB := '{}'::JSONB;
  v_operational_summary JSONB := '{}'::JSONB;
  v_document_summary JSONB := '{}'::JSONB;
  v_sla_summary JSONB := '{}'::JSONB;
  v_capabilities JSONB;
  v_source_coverage JSONB;
  v_record_counts JSONB;
  v_limitations JSONB := jsonb_build_array(
    'O hash técnico é calculado no frontend e não substitui assinatura digital ICP-Brasil.',
    'O pacote não cria snapshots históricos e reflete os registros disponíveis no momento da consulta.'
  );

  v_document_total BIGINT := 0;
  v_version_total BIGINT := 0;
  v_revision_total BIGINT := 0;
  v_approval_total BIGINT := 0;
  v_instance_total BIGINT := 0;
  v_step_total BIGINT := 0;
  v_tramite_event_total BIGINT := 0;
  v_evidence_total BIGINT := 0;
  v_audit_total BIGINT := 0;
  v_notification_total BIGINT := 0;
  v_project_allowed BOOLEAN := FALSE;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório.';
  END IF;

  SELECT
    profile.org_id,
    profile.role::TEXT,
    profile.full_name,
    organization.name,
    organization.slug,
    organization.code_prefix
  INTO
    v_org_id,
    v_actor_role,
    v_actor_name,
    v_org_name,
    v_org_slug,
    v_org_prefix
  FROM public.profiles profile
  JOIN public.organizations organization
    ON organization.id = profile.org_id
  WHERE profile.id = v_actor_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Perfil ou organização não encontrados.';
  END IF;

  IF v_report_type NOT IN (
    'operational', 'document', 'sla', 'evidence_workflow'
  ) THEN
    RAISE EXCEPTION 'Tipo de relatório inválido.';
  END IF;

  IF v_scope NOT IN ('org', 'mine') THEN
    RAISE EXCEPTION 'Escopo deve ser org ou mine.';
  END IF;

  IF v_scope = 'org'
     AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem gerar relatório da organização.'
      USING ERRCODE = '42501';
  END IF;

  IF v_to < v_from THEN
    RAISE EXCEPTION
      'A data final deve ser igual ou posterior à data inicial.';
  END IF;

  IF (v_to - v_from) > 365 THEN
    RAISE EXCEPTION 'O período máximo do relatório é 365 dias.';
  END IF;

  IF v_to > CURRENT_DATE + 1 THEN
    RAISE EXCEPTION 'O período não pode estar no futuro.';
  END IF;

  IF v_report_type = 'document' AND p_document_id IS NULL THEN
    RAISE EXCEPTION 'Selecione um documento para o relatório documental.';
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
           OR document.created_by = v_actor_id
         )
     ) THEN
    RAISE EXCEPTION
      'Documento inexistente ou indisponível para o escopo solicitado.'
      USING ERRCODE = '42501';
  END IF;

  IF p_project_id IS NOT NULL THEN
    IF NOT v_projects_available THEN
      RAISE EXCEPTION 'Catálogo de projetos indisponível para validar o filtro.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'org_id'
    ) THEN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1
           FROM public.projects project
           WHERE project.id = $1
             AND (project.org_id = $2 OR project.org_id IS NULL)
         )'
      INTO v_project_allowed
      USING p_project_id, v_org_id;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.documents document
        WHERE document.org_id = v_org_id
          AND document.project_id = p_project_id
      ) INTO v_project_allowed;
    END IF;

    IF NOT v_project_allowed THEN
      RAISE EXCEPTION
        'Projeto inexistente ou indisponível para a organização.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_versions'
      AND column_name IN (
        'id', 'document_id', 'revision', 'status', 'created_at'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 5
  ) INTO v_versions_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_revisions'
      AND column_name IN ('id', 'document_id', 'revision', 'created_at')
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 4
  ) INTO v_revisions_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'approval_flows'
      AND column_name IN (
        'id', 'document_id', 'status', 'created_at', 'decided_at',
        'completed_at', 'step', 'step_label', 'comment', 'decided_by'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 10
  ) INTO v_approvals_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_tramite_instances'
      AND column_name IN (
        'id', 'org_id', 'document_id', 'status', 'created_at'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 5
  ) INTO v_instances_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_tramite_instance_steps'
      AND column_name IN (
        'id', 'org_id', 'instance_id', 'document_id', 'status', 'created_at'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 6
  ) INTO v_steps_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_tramite_instance_events'
      AND column_name IN (
        'id', 'org_id', 'document_id', 'event_type', 'created_at',
        'instance_id', 'step_id', 'actor_id', 'metadata'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 9
  ) INTO v_tramite_events_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_tramite_instance_evidence'
      AND column_name IN (
        'id', 'org_id', 'document_id', 'evidence_type', 'created_at',
        'instance_id', 'step_id', 'uploaded_by', 'file_name', 'file_hash'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 10
  ) INTO v_evidence_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'internal_notifications'
      AND column_name IN (
        'id', 'org_id', 'recipient_user_id', 'severity', 'created_at',
        'read_at', 'dismissed_at', 'document_id'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 8
  ) INTO v_notifications_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'notification_events'
      AND column_name IN ('id', 'org_id', 'event_type', 'created_at')
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 4
  ) INTO v_notification_events_available;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_trail'
      AND column_name IN (
        'id', 'org_id', 'document_id', 'user_id', 'action', 'created_at',
        'old_status', 'new_status', 'file_hash', 'metadata'
      )
    GROUP BY table_name
    HAVING COUNT(DISTINCT column_name) = 10
  ) INTO v_audit_available;

  SELECT COUNT(*)
  INTO v_document_total
  FROM public.documents document
  WHERE document.org_id = v_org_id
    AND (
      v_scope = 'org'
      OR document.author_id = v_actor_id
      OR document.created_by = v_actor_id
    )
    AND (p_document_id IS NULL OR document.id = p_document_id)
    AND (p_project_id IS NULL OR document.project_id = p_project_id)
    AND (
      NULLIF(BTRIM(p_doc_type), '') IS NULL
      OR LOWER(document.doc_type) = LOWER(BTRIM(p_doc_type))
    )
    AND (
      NULLIF(BTRIM(p_area), '') IS NULL
      OR LOWER(document.area) = LOWER(BTRIM(p_area))
    )
    AND (
      NULLIF(BTRIM(p_status), '') IS NULL
      OR LOWER(document.status) = LOWER(BTRIM(p_status))
    )
    AND (
      v_report_type = 'document'
      OR (
        document.created_at >= v_from
        AND document.created_at < (v_to + 1)
      )
    );

  SELECT COALESCE(
    JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
    '[]'::JSONB
  )
  INTO v_documents
  FROM (
    SELECT document.*
    FROM public.documents document
    WHERE document.org_id = v_org_id
      AND (
        v_scope = 'org'
        OR document.author_id = v_actor_id
        OR document.created_by = v_actor_id
      )
      AND (p_document_id IS NULL OR document.id = p_document_id)
      AND (p_project_id IS NULL OR document.project_id = p_project_id)
      AND (
        NULLIF(BTRIM(p_doc_type), '') IS NULL
        OR LOWER(document.doc_type) = LOWER(BTRIM(p_doc_type))
      )
      AND (
        NULLIF(BTRIM(p_area), '') IS NULL
        OR LOWER(document.area) = LOWER(BTRIM(p_area))
      )
      AND (
        NULLIF(BTRIM(p_status), '') IS NULL
        OR LOWER(document.status) = LOWER(BTRIM(p_status))
      )
      AND (
        v_report_type = 'document'
        OR (
          document.created_at >= v_from
          AND document.created_at < (v_to + 1)
        )
      )
    ORDER BY document.created_at DESC
    LIMIT 500
  ) filtered;

  v_document_summary := jsonb_build_object(
    'total_records', v_document_total,
    'returned_records', jsonb_array_length(v_documents),
    'truncated', v_document_total > jsonb_array_length(v_documents),
    'report_document_id', p_document_id,
    'canonical_version_source',
      CASE
        WHEN v_versions_available THEN 'document_versions'
        WHEN v_revisions_available THEN 'document_revisions_legacy'
        ELSE NULL
      END
  );

  IF v_versions_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_versions version
      JOIN public.documents document
        ON document.id = version.document_id
      WHERE document.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR document.id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (version.created_at >= $9 AND version.created_at < ($10 + 1))
        )
    $query$
    INTO v_version_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT version.*
        FROM public.document_versions version
        JOIN public.documents document
          ON document.id = version.document_id
        WHERE document.org_id = $1
          AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (version.created_at >= $9 AND version.created_at < ($10 + 1))
          )
        ORDER BY version.created_at DESC
        LIMIT 1000
      ) filtered
    $query$
    INTO v_versions
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'document_versions indisponível ou incompatível; versões formais não foram incluídas.'
    );
  END IF;

  IF v_revisions_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_revisions revision
      JOIN public.documents document
        ON document.id = revision.document_id
      WHERE document.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR document.id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (revision.created_at >= $9 AND revision.created_at < ($10 + 1))
        )
    $query$
    INTO v_revision_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT revision.*
        FROM public.document_revisions revision
        JOIN public.documents document
          ON document.id = revision.document_id
        WHERE document.org_id = $1
          AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (revision.created_at >= $9 AND revision.created_at < ($10 + 1))
          )
        ORDER BY revision.created_at DESC
        LIMIT 1000
      ) filtered
    $query$
    INTO v_revisions
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    v_limitations := v_limitations || jsonb_build_array(
      'document_revisions é uma fonte legada; document_versions permanece canônico para o ciclo formal.'
    );
  END IF;

  IF v_approvals_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.approval_flows approval
      JOIN public.documents document
        ON document.id = approval.document_id
      WHERE document.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR document.id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (approval.created_at >= $9 AND approval.created_at < ($10 + 1))
        )
    $query$
    INTO v_approval_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT approval.*
        FROM public.approval_flows approval
        JOIN public.documents document
          ON document.id = approval.document_id
        WHERE document.org_id = $1
          AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (approval.created_at >= $9 AND approval.created_at < ($10 + 1))
          )
        ORDER BY approval.created_at DESC
        LIMIT 1000
      ) filtered
    $query$
    INTO v_approvals
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'approval_flows indisponível ou incompatível; aprovações formais não foram incluídas.'
    );
  END IF;

  IF v_instances_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_tramite_instances instance
      JOIN public.documents document
        ON document.id = instance.document_id
      WHERE instance.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR document.id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (instance.created_at >= $9 AND instance.created_at < ($10 + 1))
        )
    $query$
    INTO v_instance_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT instance.*
        FROM public.document_tramite_instances instance
        JOIN public.documents document
          ON document.id = instance.document_id
        WHERE instance.org_id = $1
          AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (instance.created_at >= $9 AND instance.created_at < ($10 + 1))
          )
        ORDER BY instance.created_at DESC
        LIMIT 500
      ) filtered
    $query$
    INTO v_instances
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'Execução de trâmites indisponível; instâncias não foram incluídas.'
    );
  END IF;

  IF v_steps_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_tramite_instance_steps step
      JOIN public.documents document
        ON document.id = step.document_id
      WHERE step.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR document.id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (step.created_at >= $9 AND step.created_at < ($10 + 1))
        )
    $query$
    INTO v_step_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT step.*
        FROM public.document_tramite_instance_steps step
        JOIN public.documents document
          ON document.id = step.document_id
        WHERE step.org_id = $1
          AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
          AND ($4 IS NULL OR document.id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (step.created_at >= $9 AND step.created_at < ($10 + 1))
          )
        ORDER BY step.created_at DESC
        LIMIT 2000
      ) filtered
    $query$
    INTO v_steps
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'Etapas de trâmite indisponíveis ou incompatíveis.'
    );
  END IF;

  IF v_tramite_events_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_tramite_instance_events event
      LEFT JOIN public.documents document
        ON document.id = event.document_id
      WHERE event.org_id = $1
        AND (
          $2 = 'org'
          OR document.author_id = $3
          OR document.created_by = $3
          OR event.actor_id = $3
        )
        AND ($4 IS NULL OR event.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (event.created_at >= $9 AND event.created_at < ($10 + 1))
        )
    $query$
    INTO v_tramite_event_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT event.*
        FROM public.document_tramite_instance_events event
        LEFT JOIN public.documents document
          ON document.id = event.document_id
        WHERE event.org_id = $1
          AND (
            $2 = 'org'
            OR document.author_id = $3
            OR document.created_by = $3
            OR event.actor_id = $3
          )
          AND ($4 IS NULL OR event.document_id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (event.created_at >= $9 AND event.created_at < ($10 + 1))
          )
        ORDER BY event.created_at DESC
        LIMIT 3000
      ) filtered
    $query$
    INTO v_tramite_events
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'source', 'document_tramite_instance_events',
            'event_type', event.event_type,
            'occurred_at', event.created_at,
            'document_id', event.document_id,
            'entity_id', event.id,
            'instance_id', event.instance_id,
            'step_id', event.step_id,
            'actor_id', event.actor_id,
            'details', event.metadata
          )
          ORDER BY event.created_at DESC
        ),
        '[]'::JSONB
      )
      FROM public.document_tramite_instance_events event
      LEFT JOIN public.documents document
        ON document.id = event.document_id
      WHERE event.org_id = $1
        AND (
          $2 = 'org'
          OR document.author_id = $3
          OR document.created_by = $3
          OR event.actor_id = $3
        )
        AND ($4 IS NULL OR event.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          $11 = 'document'
          OR (event.created_at >= $9 AND event.created_at < ($10 + 1))
        )
    $query$
    INTO v_timeline_part
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    v_timeline := v_timeline || v_timeline_part;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'Eventos próprios de execução de trâmite não estão disponíveis.'
    );
  END IF;

  IF v_evidence_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.document_tramite_instance_evidence evidence
      JOIN public.documents document
        ON document.id = evidence.document_id
      WHERE evidence.org_id = $1
        AND (
          $2 = 'org'
          OR document.author_id = $3
          OR document.created_by = $3
          OR evidence.uploaded_by = $3
        )
        AND ($4 IS NULL OR evidence.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (evidence.created_at >= $9 AND evidence.created_at < ($10 + 1))
        )
    $query$
    INTO v_evidence_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT evidence.*
        FROM public.document_tramite_instance_evidence evidence
        JOIN public.documents document
          ON document.id = evidence.document_id
        WHERE evidence.org_id = $1
          AND (
            $2 = 'org'
            OR document.author_id = $3
            OR document.created_by = $3
            OR evidence.uploaded_by = $3
          )
          AND ($4 IS NULL OR evidence.document_id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (evidence.created_at >= $9 AND evidence.created_at < ($10 + 1))
          )
        ORDER BY evidence.created_at DESC
        LIMIT 1000
      ) filtered
    $query$
    INTO v_evidences
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'source', 'document_tramite_instance_evidence',
            'event_type', 'evidence_registered',
            'occurred_at', evidence.created_at,
            'document_id', evidence.document_id,
            'entity_id', evidence.id,
            'instance_id', evidence.instance_id,
            'step_id', evidence.step_id,
            'actor_id', evidence.uploaded_by,
            'details', JSONB_BUILD_OBJECT(
              'evidence_type', evidence.evidence_type,
              'file_name', evidence.file_name,
              'file_hash', evidence.file_hash
            )
          )
          ORDER BY evidence.created_at DESC
        ),
        '[]'::JSONB
      )
      FROM public.document_tramite_instance_evidence evidence
      JOIN public.documents document
        ON document.id = evidence.document_id
      WHERE evidence.org_id = $1
        AND (
          $2 = 'org'
          OR document.author_id = $3
          OR document.created_by = $3
          OR evidence.uploaded_by = $3
        )
        AND ($4 IS NULL OR evidence.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          $11 = 'document'
          OR (evidence.created_at >= $9 AND evidence.created_at < ($10 + 1))
        )
    $query$
    INTO v_timeline_part
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    v_timeline := v_timeline || v_timeline_part;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'Evidências de execução não estão disponíveis.'
    );
  END IF;

  IF v_audit_available THEN
    EXECUTE $query$
      SELECT COUNT(*)
      FROM public.audit_trail audit
      JOIN public.documents document
        ON document.id = audit.document_id
      WHERE audit.org_id = $1
        AND (
          $2 = 'org'
          OR audit.user_id = $3
          OR document.author_id = $3
          OR document.created_by = $3
        )
        AND ($4 IS NULL OR audit.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND (
          $11 = 'document'
          OR (audit.created_at >= $9 AND audit.created_at < ($10 + 1))
        )
    $query$
    INTO v_audit_total
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(TO_JSONB(filtered) ORDER BY filtered.created_at DESC),
        '[]'::JSONB
      )
      FROM (
        SELECT audit.*
        FROM public.audit_trail audit
        JOIN public.documents document
          ON document.id = audit.document_id
        WHERE audit.org_id = $1
          AND (
            $2 = 'org'
            OR audit.user_id = $3
            OR document.author_id = $3
            OR document.created_by = $3
          )
          AND ($4 IS NULL OR audit.document_id = $4)
          AND ($5 IS NULL OR document.project_id = $5)
          AND (
            NULLIF(BTRIM($6), '') IS NULL
            OR LOWER(document.doc_type) = LOWER(BTRIM($6))
          )
          AND (
            NULLIF(BTRIM($7), '') IS NULL
            OR LOWER(document.area) = LOWER(BTRIM($7))
          )
          AND (
            NULLIF(BTRIM($8), '') IS NULL
            OR LOWER(document.status) = LOWER(BTRIM($8))
          )
          AND (
            $11 = 'document'
            OR (audit.created_at >= $9 AND audit.created_at < ($10 + 1))
          )
        ORDER BY audit.created_at DESC
        LIMIT 3000
      ) filtered
    $query$
    INTO v_audit_events
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'source', 'audit_trail',
            'event_type', audit.action,
            'occurred_at', audit.created_at,
            'document_id', audit.document_id,
            'entity_id', audit.id,
            'actor_id', audit.user_id,
            'details', JSONB_BUILD_OBJECT(
              'old_status', audit.old_status,
              'new_status', audit.new_status,
              'file_hash', audit.file_hash,
              'metadata', audit.metadata
            )
          )
          ORDER BY audit.created_at DESC
        ),
        '[]'::JSONB
      )
      FROM public.audit_trail audit
      JOIN public.documents document
        ON document.id = audit.document_id
      WHERE audit.org_id = $1
        AND (
          $2 = 'org'
          OR audit.user_id = $3
          OR document.author_id = $3
          OR document.created_by = $3
        )
        AND ($4 IS NULL OR audit.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          $11 = 'document'
          OR (audit.created_at >= $9 AND audit.created_at < ($10 + 1))
        )
    $query$
    INTO v_timeline_part
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    v_timeline := v_timeline || v_timeline_part;
  ELSE
    v_limitations := v_limitations || jsonb_build_array(
      'audit_trail indisponível ou incompatível; a trilha documental canônica não foi incluída.'
    );
  END IF;

  IF v_approvals_available THEN
    EXECUTE $query$
      SELECT COALESCE(
        JSONB_AGG(
          JSONB_BUILD_OBJECT(
            'source', 'approval_flows',
            'event_type', 'approval_' || LOWER(approval.status),
            'occurred_at', COALESCE(
              approval.decided_at,
              approval.completed_at,
              approval.created_at
            ),
            'document_id', approval.document_id,
            'entity_id', approval.id,
            'actor_id', approval.decided_by,
            'details', JSONB_BUILD_OBJECT(
              'step', approval.step,
              'step_label', approval.step_label,
              'status', approval.status,
              'comment', approval.comment
            )
          )
          ORDER BY COALESCE(
            approval.decided_at,
            approval.completed_at,
            approval.created_at
          ) DESC
        ),
        '[]'::JSONB
      )
      FROM public.approval_flows approval
      JOIN public.documents document
        ON document.id = approval.document_id
      WHERE document.org_id = $1
        AND ($2 = 'org' OR document.author_id = $3 OR document.created_by = $3)
        AND ($4 IS NULL OR approval.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          $11 = 'document'
          OR (
            COALESCE(
              approval.decided_at,
              approval.completed_at,
              approval.created_at
            ) >= $9
            AND COALESCE(
              approval.decided_at,
              approval.completed_at,
              approval.created_at
            ) < ($10 + 1)
          )
        )
    $query$
    INTO v_timeline_part
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;

    v_timeline := v_timeline || v_timeline_part;
  END IF;

  IF v_notifications_available THEN
    EXECUTE $query$
      SELECT
        COUNT(*),
        JSONB_BUILD_OBJECT(
          'total', COUNT(*),
          'unread', COUNT(*) FILTER (
            WHERE notification.read_at IS NULL
              AND notification.dismissed_at IS NULL
          ),
          'critical', COUNT(*) FILTER (
            WHERE notification.severity IN ('danger', 'critical')
          ),
          'dismissed', COUNT(*) FILTER (
            WHERE notification.dismissed_at IS NOT NULL
          ),
          'by_severity', COALESCE(
            (
              SELECT JSONB_OBJECT_AGG(grouped.severity, grouped.total)
              FROM (
                SELECT nested.severity, COUNT(*) AS total
                FROM public.internal_notifications nested
                LEFT JOIN public.documents nested_document
                  ON nested_document.id = nested.document_id
                WHERE nested.org_id = $1
                  AND ($2 = 'org' OR nested.recipient_user_id = $3)
                  AND ($4 IS NULL OR nested.document_id = $4)
                  AND ($5 IS NULL OR nested_document.project_id = $5)
                  AND (
                    NULLIF(BTRIM($6), '') IS NULL
                    OR LOWER(nested_document.doc_type) = LOWER(BTRIM($6))
                  )
                  AND (
                    NULLIF(BTRIM($7), '') IS NULL
                    OR LOWER(nested_document.area) = LOWER(BTRIM($7))
                  )
                  AND (
                    NULLIF(BTRIM($8), '') IS NULL
                    OR LOWER(nested_document.status) = LOWER(BTRIM($8))
                  )
                  AND nested.created_at >= $9
                  AND nested.created_at < ($10 + 1)
                GROUP BY nested.severity
              ) grouped
            ),
            '{}'::JSONB
          ),
          'privacy_note',
            'O pacote inclui somente contagens de notificações, sem corpo ou destinatários.'
        )
      FROM public.internal_notifications notification
      LEFT JOIN public.documents document
        ON document.id = notification.document_id
      WHERE notification.org_id = $1
        AND ($2 = 'org' OR notification.recipient_user_id = $3)
        AND ($4 IS NULL OR notification.document_id = $4)
        AND ($5 IS NULL OR document.project_id = $5)
        AND (
          NULLIF(BTRIM($6), '') IS NULL
          OR LOWER(document.doc_type) = LOWER(BTRIM($6))
        )
        AND (
          NULLIF(BTRIM($7), '') IS NULL
          OR LOWER(document.area) = LOWER(BTRIM($7))
        )
        AND (
          NULLIF(BTRIM($8), '') IS NULL
          OR LOWER(document.status) = LOWER(BTRIM($8))
        )
        AND notification.created_at >= $9
        AND notification.created_at < ($10 + 1)
    $query$
    INTO v_notification_total, v_notifications_summary
    USING
      v_org_id, v_scope, v_actor_id, p_document_id, p_project_id,
      p_doc_type, p_area, p_status, v_from, v_to, v_report_type;
  ELSE
    v_notifications_summary := jsonb_build_object(
      'total', NULL,
      'unread', NULL,
      'critical', NULL,
      'dismissed', NULL,
      'privacy_note',
        'Fonte de notificações indisponível; nenhum zero foi presumido.'
    );
    v_limitations := v_limitations || jsonb_build_array(
      'Notificações internas indisponíveis; o resumo retorna valores nulos.'
    );
  END IF;

  IF v_indicators_available
     AND v_report_type IN ('operational', 'sla', 'evidence_workflow') THEN
    BEGIN
      EXECUTE
        'SELECT public.get_operational_indicators($1,$2,$3,$4,$5,$6,$7,$8,$9)'
      INTO v_operational_summary
      USING
        v_from,
        v_to,
        v_scope,
        p_project_id,
        p_doc_type,
        p_area,
        CASE WHEN v_scope = 'mine' THEN v_actor_id ELSE NULL::UUID END,
        NULL::TEXT,
        p_status;

      v_sla_summary := COALESCE(
        v_operational_summary->'sla',
        jsonb_build_object('available', FALSE)
      );
    EXCEPTION WHEN OTHERS THEN
      v_operational_summary := jsonb_build_object(
        'available', FALSE,
        'error', 'A consolidação P-26 não pôde ser lida.'
      );
      v_sla_summary := jsonb_build_object(
        'available', FALSE,
        'error', 'SLA consolidado indisponível.'
      );
      v_limitations := v_limitations || jsonb_build_array(
        'A RPC P-26 existe, mas não pôde fornecer o resumo operacional para este recorte.'
      );
    END;
  ELSE
    v_operational_summary := jsonb_build_object(
      'available', FALSE,
      'reason',
        CASE
          WHEN NOT v_indicators_available
            THEN 'get_operational_indicators não está instalada.'
          ELSE 'Resumo P-26 não é usado no relatório documental.'
        END
    );
    v_sla_summary := jsonb_build_object(
      'available', FALSE,
      'reason', 'Resumo SLA consolidado não disponível para esta consulta.'
    );
  END IF;

  SELECT COALESCE(JSONB_AGG(item ORDER BY item->>'occurred_at' DESC), '[]'::JSONB)
  INTO v_timeline
  FROM (
    SELECT item
    FROM JSONB_ARRAY_ELEMENTS(v_timeline) item
    ORDER BY item->>'occurred_at' DESC
    LIMIT 3000
  ) ordered_timeline;

  IF v_legacy_audit_available THEN
    v_limitations := v_limitations || jsonb_build_array(
      'audit_log e/ou flow_audit_log legados foram detectados, mas não foram agregados por não possuírem contrato tenant homogêneo.'
    );
  END IF;

  IF v_document_total > 500
     OR v_version_total > 1000
     OR v_revision_total > 1000
     OR v_approval_total > 1000
     OR v_instance_total > 500
     OR v_step_total > 2000
     OR v_tramite_event_total > 3000
     OR v_evidence_total > 1000
     OR v_audit_total > 3000 THEN
    v_limitations := v_limitations || jsonb_build_array(
      'Uma ou mais fontes excederam o limite de linhas do pacote. record_counts informa o total e o volume retornado.'
    );
  END IF;

  v_capabilities := jsonb_build_object(
    'documents', TRUE,
    'document_versions', v_versions_available,
    'document_revisions_legacy', v_revisions_available,
    'approval_flows', v_approvals_available,
    'tramite_instances', v_instances_available,
    'tramite_steps', v_steps_available,
    'tramite_events', v_tramite_events_available,
    'evidences', v_evidence_available,
    'internal_notifications_summary', v_notifications_available,
    'notification_events', v_notification_events_available,
    'audit_trail', v_audit_available,
    'legacy_audit_sources', v_legacy_audit_available,
    'operational_indicators', v_indicators_available,
    'projects', v_projects_available,
    'historical_snapshots', FALSE,
    'digital_signature_icp_brasil', FALSE
  );

  v_record_counts := jsonb_build_object(
    'documents', jsonb_build_object(
      'total', v_document_total,
      'returned', jsonb_array_length(v_documents)
    ),
    'versions', jsonb_build_object(
      'total', v_version_total,
      'returned', jsonb_array_length(v_versions)
    ),
    'revisions', jsonb_build_object(
      'total', v_revision_total,
      'returned', jsonb_array_length(v_revisions)
    ),
    'approval_flows', jsonb_build_object(
      'total', v_approval_total,
      'returned', jsonb_array_length(v_approvals)
    ),
    'tramite_instances', jsonb_build_object(
      'total', v_instance_total,
      'returned', jsonb_array_length(v_instances)
    ),
    'tramite_steps', jsonb_build_object(
      'total', v_step_total,
      'returned', jsonb_array_length(v_steps)
    ),
    'tramite_events', jsonb_build_object(
      'total', v_tramite_event_total,
      'returned', jsonb_array_length(v_tramite_events)
    ),
    'evidences', jsonb_build_object(
      'total', v_evidence_total,
      'returned', jsonb_array_length(v_evidences)
    ),
    'audit_events', jsonb_build_object(
      'total', v_audit_total,
      'returned', jsonb_array_length(v_audit_events)
    ),
    'notifications_summary_total', v_notification_total,
    'timeline_returned', jsonb_array_length(v_timeline)
  );

  v_source_coverage := jsonb_build_object(
    'documents', jsonb_build_object(
      'status', 'available',
      'canonical', TRUE,
      'records', v_document_total
    ),
    'document_versions', jsonb_build_object(
      'status', CASE WHEN v_versions_available THEN 'available' ELSE 'unavailable' END,
      'canonical', TRUE,
      'records', CASE WHEN v_versions_available THEN v_version_total ELSE NULL END
    ),
    'document_revisions', jsonb_build_object(
      'status', CASE WHEN v_revisions_available THEN 'limited' ELSE 'unavailable' END,
      'canonical', FALSE,
      'records', CASE WHEN v_revisions_available THEN v_revision_total ELSE NULL END,
      'note', 'Fonte legada; document_versions é canônico.'
    ),
    'approval_flows', jsonb_build_object(
      'status', CASE WHEN v_approvals_available THEN 'available' ELSE 'unavailable' END,
      'records', CASE WHEN v_approvals_available THEN v_approval_total ELSE NULL END
    ),
    'tramite_execution', jsonb_build_object(
      'status',
        CASE
          WHEN v_instances_available AND v_steps_available
            THEN 'available'
          ELSE 'unavailable'
        END,
      'instances', CASE WHEN v_instances_available THEN v_instance_total ELSE NULL END,
      'steps', CASE WHEN v_steps_available THEN v_step_total ELSE NULL END
    ),
    'tramite_events', jsonb_build_object(
      'status', CASE WHEN v_tramite_events_available THEN 'available' ELSE 'unavailable' END,
      'records', CASE WHEN v_tramite_events_available THEN v_tramite_event_total ELSE NULL END
    ),
    'evidences', jsonb_build_object(
      'status', CASE WHEN v_evidence_available THEN 'available' ELSE 'unavailable' END,
      'records', CASE WHEN v_evidence_available THEN v_evidence_total ELSE NULL END
    ),
    'notifications', jsonb_build_object(
      'status', CASE WHEN v_notifications_available THEN 'summary_only' ELSE 'unavailable' END,
      'records', CASE WHEN v_notifications_available THEN v_notification_total ELSE NULL END,
      'note', 'Somente contagens; corpos e destinatários não são exportados.'
    ),
    'audit_trail', jsonb_build_object(
      'status', CASE WHEN v_audit_available THEN 'available' ELSE 'unavailable' END,
      'canonical', TRUE,
      'records', CASE WHEN v_audit_available THEN v_audit_total ELSE NULL END
    ),
    'legacy_audit_sources', jsonb_build_object(
      'status', CASE WHEN v_legacy_audit_available THEN 'limited' ELSE 'unavailable' END,
      'included', FALSE,
      'note', 'Contrato tenant insuficiente para agregação segura.'
    ),
    'sla', jsonb_build_object(
      'status', CASE WHEN v_indicators_available THEN 'available' ELSE 'unavailable' END,
      'source', 'get_operational_indicators'
    )
  );

  RETURN jsonb_build_object(
    'manifest', jsonb_build_object(
      'package_version', 'P-27.0',
      'generated_at', v_generated_at,
      'report_type', v_report_type,
      'scope', v_scope,
      'formal_export_contract', TRUE,
      'append_only_registration', TRUE,
      'integrity_algorithm', 'SHA-256',
      'integrity_hash_generated_by', 'frontend_web_crypto',
      'digital_signature', FALSE
    ),
    'organization', jsonb_build_object(
      'id', v_org_id,
      'name', v_org_name,
      'slug', v_org_slug,
      'code_prefix', v_org_prefix
    ),
    'generated_by', jsonb_build_object(
      'id', v_actor_id,
      'full_name', v_actor_name,
      'role', v_actor_role
    ),
    'report_type', v_report_type,
    'report_period', jsonb_build_object(
      'from', v_from,
      'to', v_to,
      'maximum_days', 365
    ),
    'filters', jsonb_build_object(
      'scope', v_scope,
      'document_id', p_document_id,
      'project_id', p_project_id,
      'doc_type', NULLIF(BTRIM(p_doc_type), ''),
      'area', NULLIF(BTRIM(p_area), ''),
      'status', NULLIF(BTRIM(p_status), '')
    ),
    'capabilities', v_capabilities,
    'source_coverage', v_source_coverage,
    'operational_summary', v_operational_summary,
    'document_summary', v_document_summary,
    'timeline', v_timeline,
    'documents', v_documents,
    'versions', v_versions,
    'revisions', v_revisions,
    'approval_flows', v_approvals,
    'tramite_instances', v_instances,
    'tramite_steps', v_steps,
    'tramite_events', v_tramite_events,
    'evidences', v_evidences,
    'notifications_summary', v_notifications_summary,
    'sla_summary', v_sla_summary,
    'audit_events', v_audit_events,
    'record_counts', v_record_counts,
    'limitations', v_limitations
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.register_audit_report_export(
  p_report_type TEXT,
  p_report_format TEXT,
  p_scope TEXT,
  p_period_from DATE DEFAULT NULL,
  p_period_to DATE DEFAULT NULL,
  p_document_id UUID DEFAULT NULL,
  p_project_id UUID DEFAULT NULL,
  p_filters JSONB DEFAULT '{}'::JSONB,
  p_manifest JSONB DEFAULT '{}'::JSONB,
  p_record_counts JSONB DEFAULT '{}'::JSONB,
  p_source_coverage JSONB DEFAULT '{}'::JSONB,
  p_limitations JSONB DEFAULT '[]'::JSONB,
  p_integrity_hash TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_actor_role TEXT;
  v_report_type TEXT := LOWER(BTRIM(COALESCE(p_report_type, '')));
  v_report_format TEXT := LOWER(BTRIM(COALESCE(p_report_format, '')));
  v_scope TEXT := LOWER(BTRIM(COALESCE(p_scope, '')));
  v_export_id UUID;
  v_project_allowed BOOLEAN := FALSE;
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

  IF v_report_type NOT IN (
    'operational', 'document', 'sla', 'evidence_workflow'
  ) THEN
    RAISE EXCEPTION 'Tipo de relatório inválido.';
  END IF;

  IF v_report_format NOT IN ('json', 'csv', 'pdf', 'summary') THEN
    RAISE EXCEPTION 'Formato de exportação inválido.';
  END IF;

  IF v_report_type = 'document' AND p_document_id IS NULL THEN
    RAISE EXCEPTION 'Relatório documental exige document_id.';
  END IF;

  IF v_scope NOT IN ('org', 'mine') THEN
    RAISE EXCEPTION 'Escopo deve ser org ou mine.';
  END IF;

  IF v_scope = 'org'
     AND v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION
      'Somente administradores e gestores podem registrar exportação da organização.'
      USING ERRCODE = '42501';
  END IF;

  IF p_project_id IS NOT NULL THEN
    IF to_regclass('public.projects') IS NULL THEN
      RAISE EXCEPTION 'Catálogo de projetos indisponível.';
    END IF;

    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'projects'
        AND column_name = 'org_id'
    ) THEN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1
           FROM public.projects project
           WHERE project.id = $1
             AND (project.org_id = $2 OR project.org_id IS NULL)
         )'
      INTO v_project_allowed
      USING p_project_id, v_org_id;
    ELSE
      SELECT EXISTS (
        SELECT 1
        FROM public.documents document
        WHERE document.org_id = v_org_id
          AND document.project_id = p_project_id
      ) INTO v_project_allowed;
    END IF;

    IF NOT v_project_allowed THEN
      RAISE EXCEPTION
        'Projeto inexistente ou indisponível para a organização.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_period_from IS NOT NULL
     AND p_period_to IS NOT NULL
     AND p_period_to < p_period_from THEN
    RAISE EXCEPTION 'Período de exportação inválido.';
  END IF;

  IF p_period_from IS NOT NULL
     AND p_period_to IS NOT NULL
     AND (p_period_to - p_period_from) > 365 THEN
    RAISE EXCEPTION 'O período máximo da exportação é 365 dias.';
  END IF;

  IF JSONB_TYPEOF(COALESCE(p_filters, '{}'::JSONB)) <> 'object'
     OR JSONB_TYPEOF(COALESCE(p_manifest, '{}'::JSONB)) <> 'object'
     OR JSONB_TYPEOF(COALESCE(p_record_counts, '{}'::JSONB)) <> 'object'
     OR JSONB_TYPEOF(COALESCE(p_source_coverage, '{}'::JSONB)) <> 'object'
     OR JSONB_TYPEOF(COALESCE(p_limitations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Metadados da exportação possuem formato inválido.';
  END IF;

  IF p_integrity_hash IS NOT NULL
     AND p_integrity_hash !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'Hash técnico de integridade inválido.';
  END IF;

  IF p_file_name IS NOT NULL
     AND (
       LENGTH(p_file_name) > 255
       OR p_file_name ~ '[[:cntrl:]]'
     ) THEN
    RAISE EXCEPTION 'Nome do arquivo de exportação inválido.';
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
           OR document.created_by = v_actor_id
         )
     ) THEN
    RAISE EXCEPTION
      'Documento inexistente ou indisponível para o escopo solicitado.'
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_report_exports (
    org_id,
    requested_by,
    report_type,
    report_format,
    scope,
    period_from,
    period_to,
    document_id,
    project_id,
    filters,
    manifest,
    record_counts,
    source_coverage,
    limitations,
    integrity_hash,
    file_name
  )
  VALUES (
    v_org_id,
    v_actor_id,
    v_report_type,
    v_report_format,
    v_scope,
    p_period_from,
    p_period_to,
    p_document_id,
    p_project_id,
    COALESCE(p_filters, '{}'::JSONB),
    COALESCE(p_manifest, '{}'::JSONB),
    COALESCE(p_record_counts, '{}'::JSONB),
    COALESCE(p_source_coverage, '{}'::JSONB),
    COALESCE(p_limitations, '[]'::JSONB),
    LOWER(p_integrity_hash),
    NULLIF(BTRIM(p_file_name), '')
  )
  RETURNING id INTO v_export_id;

  RETURN v_export_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_audit_report_package(
  TEXT, DATE, DATE, TEXT, UUID, UUID, TEXT, TEXT, TEXT
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.register_audit_report_export(
  TEXT, TEXT, TEXT, DATE, DATE, UUID, UUID,
  JSONB, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_audit_report_package(
  TEXT, DATE, DATE, TEXT, UUID, UUID, TEXT, TEXT, TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.register_audit_report_export(
  TEXT, TEXT, TEXT, DATE, DATE, UUID, UUID,
  JSONB, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) TO authenticated;

COMMENT ON TABLE public.audit_report_exports IS
  'P-27: histórico append-only das exportações formais de auditoria.';

COMMENT ON FUNCTION public.get_audit_report_package(
  TEXT, DATE, DATE, TEXT, UUID, UUID, TEXT, TEXT, TEXT
) IS
  'P-27: monta pacote formal de auditoria read-only com cobertura e limitações explícitas.';

COMMENT ON FUNCTION public.register_audit_report_export(
  TEXT, TEXT, TEXT, DATE, DATE, UUID, UUID,
  JSONB, JSONB, JSONB, JSONB, JSONB, TEXT, TEXT
) IS
  'P-27: registra append-only uma exportação formal sem alterar dados operacionais.';

NOTIFY pgrst, 'reload schema';

COMMIT;
