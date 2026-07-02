-- TRAMITA P-12.1 — Execução Segura de Trâmites Documentais
-- Instâncias documentais, etapas, evidências e eventos append-only.
-- Aplicação exclusivamente manual após o ciclo 17/P-12.
-- Não cria approval_flows, tarefas, notificações ou e-mails.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.document_tramite_instances (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id         UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version_id UUID,
  template_id         UUID NOT NULL REFERENCES public.document_tramite_templates(id) ON DELETE RESTRICT,
  template_version_id UUID NOT NULL REFERENCES public.document_tramite_template_versions(id) ON DELETE RESTRICT,
  code                TEXT,
  status              TEXT NOT NULL DEFAULT 'active',
  current_node_keys   TEXT[] NOT NULL DEFAULT '{}'::TEXT[],
  started_by          UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  cancelled_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  completed_by        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  started_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at        TIMESTAMPTZ,
  completed_at        TIMESTAMPTZ,
  due_at              TIMESTAMPTZ,
  cancellation_reason TEXT,
  graph_snapshot      JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::JSONB,
  validation_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  metadata            JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_instances_status_check
    CHECK (status IN ('active', 'completed', 'cancelled', 'failed')),
  CONSTRAINT document_tramite_instances_code_check
    CHECK (code IS NULL OR LENGTH(BTRIM(code)) > 0),
  CONSTRAINT document_tramite_instances_graph_check
    CHECK (jsonb_typeof(graph_snapshot) = 'object'),
  CONSTRAINT document_tramite_instances_validation_check
    CHECK (jsonb_typeof(validation_snapshot) = 'object'),
  CONSTRAINT document_tramite_instances_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_tramite_instance_steps (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id          UUID NOT NULL REFERENCES public.document_tramite_instances(id) ON DELETE CASCADE,
  document_id          UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  template_id          UUID NOT NULL REFERENCES public.document_tramite_templates(id) ON DELETE RESTRICT,
  template_version_id  UUID NOT NULL REFERENCES public.document_tramite_template_versions(id) ON DELETE RESTRICT,
  node_key             TEXT NOT NULL,
  node_type            TEXT NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  status               TEXT NOT NULL DEFAULT 'pending',
  assignment_type      TEXT,
  assignee_user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_group_id    UUID,
  required_role        TEXT,
  due_days             INTEGER,
  due_at               TIMESTAMPTZ,
  required_evidence    BOOLEAN NOT NULL DEFAULT false,
  required_file        BOOLEAN NOT NULL DEFAULT false,
  require_comment      BOOLEAN NOT NULL DEFAULT false,
  allow_correction     BOOLEAN NOT NULL DEFAULT true,
  decision             TEXT,
  comment              TEXT,
  started_at           TIMESTAMPTZ,
  completed_at         TIMESTAMPTZ,
  completed_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_instance_steps_type_check
    CHECK (node_type IN (
      'start', 'draft', 'review', 'approval', 'correction', 'evidence',
      'mandatory_reading', 'publication', 'end', 'decision', 'custom'
    )),
  CONSTRAINT document_tramite_instance_steps_status_check
    CHECK (status IN (
      'pending', 'active', 'completed', 'skipped', 'blocked', 'cancelled'
    )),
  CONSTRAINT document_tramite_instance_steps_assignment_check
    CHECK (
      assignment_type IS NULL
      OR assignment_type IN (
        'none', 'author', 'document_owner', 'specific_user',
        'approval_group', 'role'
      )
    ),
  CONSTRAINT document_tramite_instance_steps_decision_check
    CHECK (
      decision IS NULL
      OR decision IN (
        'approved', 'rejected', 'needs_correction', 'completed',
        'acknowledged', 'attached', 'skipped'
      )
    ),
  CONSTRAINT document_tramite_instance_steps_due_check
    CHECK (due_days IS NULL OR due_days BETWEEN 0 AND 3650),
  CONSTRAINT document_tramite_instance_steps_label_check
    CHECK (LENGTH(BTRIM(label)) > 0),
  CONSTRAINT document_tramite_instance_steps_key_check
    CHECK (LENGTH(BTRIM(node_key)) > 0),
  CONSTRAINT document_tramite_instance_steps_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_tramite_instance_steps_instance_key
    UNIQUE (instance_id, node_key)
);

CREATE TABLE IF NOT EXISTS public.document_tramite_instance_edges (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id            UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id       UUID NOT NULL REFERENCES public.document_tramite_instances(id) ON DELETE CASCADE,
  document_id       UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  edge_key          TEXT NOT NULL,
  source_node_key   TEXT NOT NULL,
  target_node_key   TEXT NOT NULL,
  label             TEXT,
  condition_type    TEXT NOT NULL DEFAULT 'always',
  condition_value   TEXT,
  priority          INTEGER NOT NULL DEFAULT 100,
  metadata          JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_instance_edges_condition_check
    CHECK (condition_type IN (
      'always', 'approved', 'rejected', 'needs_correction',
      'expired', 'evidence_missing', 'custom'
    )),
  CONSTRAINT document_tramite_instance_edges_distinct_check
    CHECK (source_node_key <> target_node_key),
  CONSTRAINT document_tramite_instance_edges_key_check
    CHECK (LENGTH(BTRIM(edge_key)) > 0),
  CONSTRAINT document_tramite_instance_edges_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_tramite_instance_edges_instance_key
    UNIQUE (instance_id, edge_key)
);

CREATE TABLE IF NOT EXISTS public.document_tramite_instance_evidence (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id   UUID NOT NULL REFERENCES public.document_tramite_instances(id) ON DELETE CASCADE,
  step_id       UUID NOT NULL REFERENCES public.document_tramite_instance_steps(id) ON DELETE CASCADE,
  document_id   UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  evidence_type TEXT NOT NULL DEFAULT 'note',
  file_path     TEXT,
  file_name     TEXT,
  file_size     BIGINT,
  file_hash     TEXT,
  note          TEXT,
  uploaded_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata      JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_instance_evidence_type_check
    CHECK (evidence_type IN ('note', 'file', 'link', 'external_reference')),
  CONSTRAINT document_tramite_instance_evidence_payload_check
    CHECK (
      (evidence_type = 'file' AND NULLIF(BTRIM(file_path), '') IS NOT NULL)
      OR (
        evidence_type IN ('note', 'link', 'external_reference')
        AND NULLIF(BTRIM(note), '') IS NOT NULL
      )
    ),
  CONSTRAINT document_tramite_instance_evidence_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_tramite_instance_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  instance_id UUID REFERENCES public.document_tramite_instances(id) ON DELETE CASCADE,
  step_id     UUID REFERENCES public.document_tramite_instance_steps(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  event_type  TEXT NOT NULL,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_instance_events_type_check
    CHECK (event_type IN (
      'instance_started', 'step_activated', 'step_completed', 'step_blocked',
      'evidence_added', 'decision_recorded', 'instance_completed',
      'instance_cancelled', 'instance_failed', 'repaired'
    )),
  CONSTRAINT document_tramite_instance_events_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

DO $$
BEGIN
  IF to_regclass('public.document_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.document_tramite_instances'::REGCLASS
         AND conname = 'document_tramite_instances_document_version_id_fkey'
     ) THEN
    ALTER TABLE public.document_tramite_instances
      ADD CONSTRAINT document_tramite_instances_document_version_id_fkey
      FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF to_regclass('public.approval_groups') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conrelid = 'public.document_tramite_instance_steps'::REGCLASS
         AND conname = 'document_tramite_instance_steps_assignee_group_id_fkey'
     ) THEN
    ALTER TABLE public.document_tramite_instance_steps
      ADD CONSTRAINT document_tramite_instance_steps_assignee_group_id_fkey
      FOREIGN KEY (assignee_group_id) REFERENCES public.approval_groups(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tramite_instances_active_unique
  ON public.document_tramite_instances(
    org_id, document_id, template_id, template_version_id
  )
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_document_tramite_instances_org_document
  ON public.document_tramite_instances(org_id, document_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_tramite_instances_org_status
  ON public.document_tramite_instances(org_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_document_tramite_steps_instance_status
  ON public.document_tramite_instance_steps(instance_id, status);
CREATE INDEX IF NOT EXISTS idx_document_tramite_steps_org_user
  ON public.document_tramite_instance_steps(org_id, assignee_user_id, status);
CREATE INDEX IF NOT EXISTS idx_document_tramite_steps_org_group
  ON public.document_tramite_instance_steps(org_id, assignee_group_id, status);
CREATE INDEX IF NOT EXISTS idx_document_tramite_steps_org_due
  ON public.document_tramite_instance_steps(org_id, due_at)
  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_document_tramite_edges_instance
  ON public.document_tramite_instance_edges(instance_id, priority);
CREATE INDEX IF NOT EXISTS idx_document_tramite_evidence_step
  ON public.document_tramite_instance_evidence(instance_id, step_id, created_at);
CREATE INDEX IF NOT EXISTS idx_document_tramite_execution_events
  ON public.document_tramite_instance_events(org_id, instance_id, created_at DESC);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS document_tramite_instances_updated_at ON public.document_tramite_instances';
    EXECUTE '
      CREATE TRIGGER document_tramite_instances_updated_at
      BEFORE UPDATE ON public.document_tramite_instances
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
    EXECUTE 'DROP TRIGGER IF EXISTS document_tramite_instance_steps_updated_at ON public.document_tramite_instance_steps';
    EXECUTE '
      CREATE TRIGGER document_tramite_instance_steps_updated_at
      BEFORE UPDATE ON public.document_tramite_instance_steps
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END;
$$;

ALTER TABLE public.document_tramite_instances ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_instance_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_instance_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_instance_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_instance_events ENABLE ROW LEVEL SECURITY;

-- Leitura é multi-tenant. Não há policies de escrita: mutações usam RPC.
DROP POLICY IF EXISTS "document_tramite_instances_select_org"
  ON public.document_tramite_instances;
CREATE POLICY "document_tramite_instances_select_org"
  ON public.document_tramite_instances
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_tramite_instance_steps_select_org"
  ON public.document_tramite_instance_steps;
CREATE POLICY "document_tramite_instance_steps_select_org"
  ON public.document_tramite_instance_steps
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_tramite_instance_edges_select_org"
  ON public.document_tramite_instance_edges;
CREATE POLICY "document_tramite_instance_edges_select_org"
  ON public.document_tramite_instance_edges
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_tramite_instance_evidence_select_org"
  ON public.document_tramite_instance_evidence;
CREATE POLICY "document_tramite_instance_evidence_select_org"
  ON public.document_tramite_instance_evidence
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_tramite_instance_events_select_org"
  ON public.document_tramite_instance_events;
CREATE POLICY "document_tramite_instance_events_select_org"
  ON public.document_tramite_instance_events
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

CREATE OR REPLACE FUNCTION public.tramita_audit_trail_supports_basic_contract()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supported BOOLEAN := false;
BEGIN
  IF to_regclass('public.audit_trail') IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    COUNT(DISTINCT column_name) = 5
    AND BOOL_AND(
      CASE
        WHEN column_name = 'metadata' THEN data_type IN ('json', 'jsonb')
        ELSE true
      END
    )
  INTO v_supported
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'audit_trail'
    AND column_name IN (
      'document_id', 'org_id', 'user_id', 'action', 'metadata'
    );

  RETURN COALESCE(v_supported, false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_tramite_actor_can_act(
  p_step_id UUID,
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_step public.document_tramite_instance_steps%ROWTYPE;
  v_author_id UUID;
  v_is_member BOOLEAN := false;
  v_user_expression TEXT;
  v_active_expression TEXT;
  v_has_user_id BOOLEAN := false;
  v_has_profile_id BOOLEAN := false;
  v_profile_active_expression TEXT;
  v_has_required_role BOOLEAN := false;
BEGIN
  IF p_actor_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT *
  INTO v_step
  FROM public.document_tramite_instance_steps
  WHERE id = p_step_id;

  IF NOT FOUND OR v_step.org_id <> public.current_user_org_id() THEN
    RETURN false;
  END IF;

  IF public.is_org_role(ARRAY['admin', 'manager']) THEN
    RETURN true;
  END IF;

  SELECT author_id
  INTO v_author_id
  FROM public.documents
  WHERE id = v_step.document_id
    AND org_id = v_step.org_id;

  IF COALESCE(v_step.assignment_type, 'none') IN (
    'none', 'author', 'document_owner'
  ) THEN
    RETURN v_author_id = p_actor_id;
  END IF;

  IF v_step.assignment_type = 'specific_user' THEN
    RETURN v_step.assignee_user_id = p_actor_id;
  END IF;

  IF v_step.assignment_type = 'role' THEN
    v_profile_active_expression := CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'active'
          AND data_type = 'boolean'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'is_active'
          AND data_type = 'boolean'
      ) THEN 'COALESCE(profile.active, profile.is_active, true)'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'active'
          AND data_type = 'boolean'
      ) THEN 'COALESCE(profile.active, true)'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'profiles'
          AND column_name = 'is_active'
          AND data_type = 'boolean'
      ) THEN 'COALESCE(profile.is_active, true)'
      ELSE 'true'
    END;

    EXECUTE format(
      'SELECT EXISTS (
        SELECT 1
        FROM public.profiles AS profile
        WHERE profile.id = $1
          AND profile.org_id = $2
          AND profile.role = $3
          AND %s
      )',
      v_profile_active_expression
    )
    INTO v_has_required_role
    USING p_actor_id, v_step.org_id, v_step.required_role;

    RETURN v_has_required_role;
  END IF;

  IF v_step.assignment_type = 'approval_group'
     AND v_step.assignee_group_id IS NOT NULL
     AND to_regclass('public.approval_group_members') IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'approval_group_members'
        AND column_name = 'user_id'
    ) INTO v_has_user_id;
    SELECT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'approval_group_members'
        AND column_name = 'profile_id'
    ) INTO v_has_profile_id;

    IF NOT v_has_user_id AND NOT v_has_profile_id THEN
      RETURN false;
    END IF;

    v_user_expression := CASE
      WHEN v_has_user_id AND v_has_profile_id
        THEN 'COALESCE(member.user_id, member.profile_id)'
      WHEN v_has_user_id THEN 'member.user_id'
      ELSE 'member.profile_id'
    END;

    v_active_expression := CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_group_members'
          AND column_name = 'is_active'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_group_members'
          AND column_name = 'active'
      ) THEN 'COALESCE(member.is_active, member.active, true)'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_group_members'
          AND column_name = 'is_active'
      ) THEN 'COALESCE(member.is_active, true)'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_group_members'
          AND column_name = 'active'
      ) THEN 'COALESCE(member.active, true)'
      ELSE 'true'
    END;

    EXECUTE format(
      'SELECT EXISTS (
        SELECT 1
        FROM public.approval_group_members AS member
        WHERE member.group_id = $1
          AND member.org_id = $2
          AND %s = $3
          AND %s
      )',
      v_user_expression,
      v_active_expression
    )
    INTO v_is_member
    USING v_step.assignee_group_id, v_step.org_id, p_actor_id;
  END IF;

  RETURN v_is_member;
END;
$$;

CREATE OR REPLACE FUNCTION public.start_document_tramite_instance(
  p_document_id UUID,
  p_template_id UUID DEFAULT NULL,
  p_template_version_id UUID DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_document public.documents%ROWTYPE;
  v_template public.document_tramite_templates%ROWTYPE;
  v_version public.document_tramite_template_versions%ROWTYPE;
  v_instance_id UUID := gen_random_uuid();
  v_instance_code TEXT;
  v_validation JSONB;
  v_start_id TEXT;
  v_start_key TEXT;
  v_active_keys TEXT[] := '{}'::TEXT[];
  v_node JSONB;
  v_node_key TEXT;
  v_node_label TEXT;
  v_edge JSONB;
  v_edge_key TEXT;
  v_source_key TEXT;
  v_target_key TEXT;
  v_target RECORD;
  v_document_version_id UUID := NULL;
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata da execução precisa ser um objeto JSON.';
  END IF;

  SELECT *
  INTO v_document
  FROM public.documents
  WHERE id = p_document_id
    AND org_id = v_org_id
  FOR SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado nesta organização.';
  END IF;
  IF NOT (
    public.is_org_role(ARRAY['admin', 'manager'])
    OR v_document.author_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Somente o autor, administrador ou gestor pode iniciar o trâmite.';
  END IF;

  IF p_template_version_id IS NOT NULL THEN
    SELECT template.*
    INTO v_template
    FROM public.document_tramite_templates AS template
    JOIN public.document_tramite_template_versions AS version
      ON version.template_id = template.id
    WHERE version.id = p_template_version_id
      AND version.org_id = v_org_id
      AND version.status = 'published'
      AND template.org_id = v_org_id
      AND template.status = 'published'
      AND template.is_active = true
      AND template.current_version_id = version.id
      AND (p_template_id IS NULL OR template.id = p_template_id);
  ELSIF p_template_id IS NOT NULL THEN
    SELECT *
    INTO v_template
    FROM public.document_tramite_templates
    WHERE id = p_template_id
      AND org_id = v_org_id
      AND status = 'published'
      AND is_active = true
      AND current_version_id IS NOT NULL;
  ELSE
    SELECT *
    INTO v_template
    FROM public.document_tramite_templates AS template
    WHERE template.org_id = v_org_id
      AND template.status = 'published'
      AND template.is_active = true
      AND template.current_version_id IS NOT NULL
      AND (template.project_id IS NULL OR template.project_id = v_document.project_id)
      AND (
        template.doc_type IS NULL
        OR UPPER(template.doc_type) = UPPER(v_document.doc_type)
      )
      AND (
        template.area IS NULL
        OR UPPER(template.area) = UPPER(v_document.area)
      )
    ORDER BY
      CASE
        WHEN template.project_id = v_document.project_id
          AND template.project_id IS NOT NULL THEN 8 ELSE 0
      END
      + CASE
          WHEN template.doc_type IS NOT NULL
            AND template.area IS NOT NULL THEN 4 ELSE 0
        END
      + CASE WHEN template.doc_type IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN template.area IS NOT NULL THEN 1 ELSE 0 END DESC,
      CASE
        WHEN COALESCE(template.metadata->>'priority', '') ~ '^[0-9]+$'
          THEN (template.metadata->>'priority')::INTEGER
        ELSE 100
      END ASC,
      template.is_default DESC,
      template.updated_at ASC,
      template.id ASC
    LIMIT 1;
  END IF;

  IF NOT FOUND OR v_template.id IS NULL THEN
    RAISE EXCEPTION 'Nenhum modelo publicado aplicável foi encontrado.';
  END IF;

  SELECT *
  INTO v_version
  FROM public.document_tramite_template_versions
  WHERE id = COALESCE(p_template_version_id, v_template.current_version_id)
    AND template_id = v_template.id
    AND org_id = v_org_id
    AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'A versão publicada do modelo não está disponível.';
  END IF;

  v_validation := public.validate_document_tramite_graph(v_version.graph);
  IF COALESCE((v_validation->>'publishable')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'O modelo publicado não passou na validação: %',
      COALESCE(v_validation->'errors', '[]'::JSONB)::TEXT;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_org_id::TEXT || p_document_id::TEXT
      || v_template.id::TEXT || v_version.id::TEXT,
      0
    )
  );

  IF EXISTS (
    SELECT 1
    FROM public.document_tramite_instances
    WHERE org_id = v_org_id
      AND document_id = p_document_id
      AND template_id = v_template.id
      AND template_version_id = v_version.id
      AND status = 'active'
  ) THEN
    RAISE EXCEPTION 'Já existe uma execução ativa deste modelo para o documento.';
  END IF;

  SELECT
    NULLIF(BTRIM(node->>'id'), ''),
    COALESCE(
      NULLIF(BTRIM(node->>'node_key'), ''),
      NULLIF(BTRIM(node->>'id'), '')
    )
  INTO v_start_id, v_start_key
  FROM jsonb_array_elements(v_version.graph->'nodes') AS node
  WHERE node->>'node_type' = 'start'
  LIMIT 1;

  IF v_start_key IS NULL THEN
    RAISE EXCEPTION 'O modelo não possui etapa Início válida.';
  END IF;
  IF NOT EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_version.graph->'edges') AS edge
    WHERE edge->>'source' IN (v_start_id, v_start_key)
      AND COALESCE(NULLIF(edge->>'condition_type', ''), 'always') = 'always'
  ) THEN
    RAISE EXCEPTION 'A etapa Início precisa de ao menos um caminho de saída sem condição.';
  END IF;

  IF to_regclass('public.document_versions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'documents'
         AND column_name = 'working_version_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'documents'
         AND column_name = 'published_version_id'
     ) THEN
    EXECUTE '
      SELECT COALESCE(working_version_id, published_version_id)
      FROM public.documents
      WHERE id = $1
    '
    INTO v_document_version_id
    USING p_document_id;
  END IF;

  v_instance_code := 'TRM-' || UPPER(SUBSTRING(REPLACE(v_instance_id::TEXT, '-', '') FROM 1 FOR 10));

  INSERT INTO public.document_tramite_instances (
    id, org_id, document_id, document_version_id,
    template_id, template_version_id, code, status,
    started_by, graph_snapshot, validation_snapshot, metadata
  ) VALUES (
    v_instance_id, v_org_id, p_document_id, v_document_version_id,
    v_template.id, v_version.id, v_instance_code, 'active',
    v_actor_id, v_version.graph, v_validation, p_metadata
  );

  FOR v_node IN
    SELECT value FROM jsonb_array_elements(v_version.graph->'nodes')
  LOOP
    v_node_key := COALESCE(
      NULLIF(BTRIM(v_node->>'node_key'), ''),
      NULLIF(BTRIM(v_node->>'id'), '')
    );
    IF v_node_key IS NULL THEN
      RAISE EXCEPTION
        'O grafo contém uma etapa sem node_key e sem id. Corrija o modelo antes de iniciar.';
    END IF;

    v_node_label := COALESCE(
      NULLIF(BTRIM(v_node->>'label'), ''),
      NULLIF(INITCAP(REPLACE(v_node->>'node_type', '_', ' ')), ''),
      'Etapa ' || LEFT(v_node_key, 12)
    );

    INSERT INTO public.document_tramite_instance_steps (
      org_id, instance_id, document_id, template_id, template_version_id,
      node_key, node_type, label, description, status,
      assignment_type, assignee_user_id, assignee_group_id, required_role,
      due_days, required_evidence, required_file, require_comment,
      allow_correction, started_at, completed_at, completed_by, decision,
      metadata
    ) VALUES (
      v_org_id, v_instance_id, p_document_id, v_template.id, v_version.id,
      v_node_key,
      v_node->>'node_type',
      v_node_label,
      NULLIF(v_node->>'description', ''),
      CASE WHEN v_node->>'node_type' = 'start' THEN 'completed' ELSE 'pending' END,
      COALESCE(NULLIF(v_node->>'assignment_type', ''), 'none'),
      NULLIF(v_node->>'assignee_user_id', '')::UUID,
      NULLIF(v_node->>'assignee_group_id', '')::UUID,
      COALESCE(
        NULLIF(v_node->>'required_role', ''),
        NULLIF(v_node->'metadata'->>'required_role', '')
      ),
      NULLIF(v_node->>'due_days', '')::INTEGER,
      LOWER(COALESCE(v_node->>'required_evidence', 'false')) IN ('true', 't', '1'),
      LOWER(COALESCE(v_node->>'required_file', 'false')) IN ('true', 't', '1'),
      LOWER(COALESCE(v_node->>'require_comment', 'false')) IN ('true', 't', '1'),
      LOWER(COALESCE(v_node->>'allow_correction', 'true')) IN ('true', 't', '1'),
      CASE WHEN v_node->>'node_type' = 'start' THEN NOW() ELSE NULL END,
      CASE WHEN v_node->>'node_type' = 'start' THEN NOW() ELSE NULL END,
      CASE WHEN v_node->>'node_type' = 'start' THEN v_actor_id ELSE NULL END,
      CASE WHEN v_node->>'node_type' = 'start' THEN 'completed' ELSE NULL END,
      COALESCE(v_node->'metadata', '{}'::JSONB)
        || jsonb_build_object(
          'instructions', COALESCE(v_node->>'instructions', ''),
          'source_node_id', v_node->>'id'
        )
    );
  END LOOP;

  FOR v_edge IN
    SELECT value FROM jsonb_array_elements(v_version.graph->'edges')
  LOOP
    v_edge_key := COALESCE(
      NULLIF(BTRIM(v_edge->>'edge_key'), ''),
      NULLIF(BTRIM(v_edge->>'id'), '')
    );
    IF v_edge_key IS NULL THEN
      RAISE EXCEPTION
        'O grafo contém uma conexão sem edge_key e sem id. Corrija o modelo antes de iniciar.';
    END IF;

    SELECT COALESCE(
      NULLIF(BTRIM(node->>'node_key'), ''),
      NULLIF(BTRIM(node->>'id'), '')
    )
    INTO v_source_key
    FROM jsonb_array_elements(v_version.graph->'nodes') AS node
    WHERE node->>'id' = v_edge->>'source'
       OR node->>'node_key' = v_edge->>'source'
    ORDER BY CASE WHEN node->>'id' = v_edge->>'source' THEN 0 ELSE 1 END
    LIMIT 1;
    v_source_key := COALESCE(
      v_source_key,
      NULLIF(BTRIM(v_edge->>'source'), '')
    );

    SELECT COALESCE(
      NULLIF(BTRIM(node->>'node_key'), ''),
      NULLIF(BTRIM(node->>'id'), '')
    )
    INTO v_target_key
    FROM jsonb_array_elements(v_version.graph->'nodes') AS node
    WHERE node->>'id' = v_edge->>'target'
       OR node->>'node_key' = v_edge->>'target'
    ORDER BY CASE WHEN node->>'id' = v_edge->>'target' THEN 0 ELSE 1 END
    LIMIT 1;
    v_target_key := COALESCE(
      v_target_key,
      NULLIF(BTRIM(v_edge->>'target'), '')
    );

    IF v_source_key IS NULL OR v_target_key IS NULL THEN
      RAISE EXCEPTION
        'A conexão % não possui origem e destino válidos.',
        v_edge_key;
    END IF;

    INSERT INTO public.document_tramite_instance_edges (
      org_id, instance_id, document_id, edge_key,
      source_node_key, target_node_key, label,
      condition_type, condition_value, priority, metadata
    ) VALUES (
      v_org_id, v_instance_id, p_document_id,
      v_edge_key,
      v_source_key,
      v_target_key,
      NULLIF(v_edge->>'label', ''),
      COALESCE(NULLIF(v_edge->>'condition_type', ''), 'always'),
      NULLIF(v_edge->>'condition_value', ''),
      COALESCE(NULLIF(v_edge->>'priority', '')::INTEGER, 100),
      COALESCE(v_edge->'metadata', '{}'::JSONB)
    );
  END LOOP;

  FOR v_target IN
    SELECT DISTINCT target_step.id, target_step.node_key, target_step.node_type,
                    target_step.due_days
    FROM public.document_tramite_instance_edges AS edge
    JOIN public.document_tramite_instance_steps AS target_step
      ON target_step.instance_id = edge.instance_id
     AND target_step.node_key = edge.target_node_key
    WHERE edge.instance_id = v_instance_id
      AND edge.source_node_key = v_start_key
      AND edge.condition_type = 'always'
  LOOP
    IF v_target.node_type = 'end' THEN
      UPDATE public.document_tramite_instance_steps
      SET status = 'completed',
          started_at = NOW(),
          completed_at = NOW(),
          completed_by = v_actor_id,
          decision = 'completed'
      WHERE id = v_target.id;
    ELSE
      UPDATE public.document_tramite_instance_steps
      SET status = 'active',
          started_at = NOW(),
          due_at = CASE
            WHEN v_target.due_days IS NULL THEN NULL
            ELSE NOW() + make_interval(days => v_target.due_days)
          END
      WHERE id = v_target.id;
      v_active_keys := array_append(v_active_keys, v_target.node_key);

      INSERT INTO public.document_tramite_instance_events (
        org_id, instance_id, step_id, document_id,
        event_type, actor_id, metadata
      ) VALUES (
        v_org_id, v_instance_id, v_target.id, p_document_id,
        'step_activated', v_actor_id,
        jsonb_build_object('node_key', v_target.node_key, 'automatic', true)
      );
    END IF;
  END LOOP;

  IF COALESCE(array_length(v_active_keys, 1), 0) = 0 THEN
    UPDATE public.document_tramite_instances
    SET status = 'completed',
        current_node_keys = '{}'::TEXT[],
        completed_by = v_actor_id,
        completed_at = NOW()
    WHERE id = v_instance_id;
  ELSE
    UPDATE public.document_tramite_instances
    SET current_node_keys = v_active_keys
    WHERE id = v_instance_id;
  END IF;

  INSERT INTO public.document_tramite_instance_events (
    org_id, instance_id, document_id, event_type, actor_id, metadata
  ) VALUES (
    v_org_id, v_instance_id, p_document_id, 'instance_started', v_actor_id,
    jsonb_build_object(
      'template_id', v_template.id,
      'template_version_id', v_version.id,
      'active_steps', to_jsonb(v_active_keys)
    )
  );

  IF COALESCE(array_length(v_active_keys, 1), 0) = 0 THEN
    INSERT INTO public.document_tramite_instance_events (
      org_id, instance_id, document_id, event_type, actor_id, metadata
    ) VALUES (
      v_org_id, v_instance_id, p_document_id,
      'instance_completed', v_actor_id,
      jsonb_build_object('automatic', true)
    );
  END IF;

  IF public.tramita_audit_trail_supports_basic_contract() THEN
    BEGIN
      INSERT INTO public.audit_trail (
        document_id, org_id, user_id, action, metadata
      ) VALUES (
        p_document_id, v_org_id, v_actor_id,
        'document_tramite_started',
        jsonb_build_object(
          'instance_id', v_instance_id,
          'template_id', v_template.id,
          'template_version_id', v_version.id
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'instance_id', v_instance_id,
    'template_id', v_template.id,
    'template_version_id', v_version.id,
    'active_steps', to_jsonb(v_active_keys),
    'status', CASE
      WHEN COALESCE(array_length(v_active_keys, 1), 0) = 0
        THEN 'completed'
      ELSE 'active'
    END
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.complete_document_tramite_step(
  p_step_id UUID,
  p_decision TEXT DEFAULT 'completed',
  p_comment TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_step public.document_tramite_instance_steps%ROWTYPE;
  v_instance public.document_tramite_instances%ROWTYPE;
  v_evidence_count INTEGER := 0;
  v_activated_keys TEXT[] := '{}'::TEXT[];
  v_current_keys TEXT[] := '{}'::TEXT[];
  v_target RECORD;
  v_matching_edges INTEGER := 0;
  v_has_completed_end BOOLEAN := false;
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata da conclusão precisa ser um objeto JSON.';
  END IF;

  SELECT *
  INTO v_step
  FROM public.document_tramite_instance_steps
  WHERE id = p_step_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa não encontrada nesta organização.';
  END IF;

  SELECT *
  INTO v_instance
  FROM public.document_tramite_instances
  WHERE id = v_step.instance_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND OR v_instance.status <> 'active' THEN
    RAISE EXCEPTION 'A instância não está ativa.';
  END IF;
  IF v_step.status <> 'active' THEN
    RAISE EXCEPTION 'Somente uma etapa ativa pode ser concluída.';
  END IF;
  IF NOT public.document_tramite_actor_can_act(p_step_id, v_actor_id) THEN
    RAISE EXCEPTION 'Você não é responsável por esta etapa.';
  END IF;
  IF v_step.require_comment
     AND NULLIF(BTRIM(COALESCE(p_comment, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Esta etapa exige comentário.';
  END IF;

  IF v_step.node_type IN ('review', 'approval')
     AND p_decision NOT IN ('approved', 'rejected', 'needs_correction') THEN
    RAISE EXCEPTION 'Revisão e aprovação exigem decisão aprovada, rejeitada ou correção.';
  ELSIF v_step.node_type = 'evidence'
     AND p_decision NOT IN ('attached', 'completed') THEN
    RAISE EXCEPTION 'Etapa de evidência exige decisão attached ou completed.';
  ELSIF v_step.node_type = 'mandatory_reading'
     AND p_decision <> 'acknowledged' THEN
    RAISE EXCEPTION 'Ciência obrigatória exige decisão acknowledged.';
  ELSIF v_step.node_type NOT IN (
    'review', 'approval', 'evidence', 'mandatory_reading'
  ) AND p_decision NOT IN ('completed', 'needs_correction', 'skipped') THEN
    RAISE EXCEPTION 'Decisão incompatível com o tipo da etapa.';
  END IF;

  SELECT COUNT(*)
  INTO v_evidence_count
  FROM public.document_tramite_instance_evidence
  WHERE step_id = p_step_id
    AND instance_id = v_instance.id
    AND org_id = v_org_id;

  IF p_decision <> 'rejected'
     AND (v_step.required_evidence OR v_step.required_file)
     AND v_evidence_count = 0 THEN
    RAISE EXCEPTION 'Registre a evidência obrigatória antes de concluir.';
  END IF;
  IF p_decision <> 'rejected'
     AND v_step.required_file
     AND NOT EXISTS (
       SELECT 1
       FROM public.document_tramite_instance_evidence
       WHERE step_id = p_step_id
         AND evidence_type = 'file'
     ) THEN
    RAISE EXCEPTION 'Esta etapa exige evidência do tipo arquivo.';
  END IF;

  UPDATE public.document_tramite_instance_steps
  SET status = 'completed',
      decision = p_decision,
      comment = NULLIF(BTRIM(COALESCE(p_comment, '')), ''),
      completed_at = NOW(),
      completed_by = v_actor_id,
      metadata = metadata || p_metadata
  WHERE id = p_step_id;

  INSERT INTO public.document_tramite_instance_events (
    org_id, instance_id, step_id, document_id,
    event_type, actor_id, metadata
  ) VALUES (
    v_org_id, v_instance.id, p_step_id, v_step.document_id,
    'step_completed', v_actor_id,
    jsonb_build_object(
      'node_key', v_step.node_key,
      'decision', p_decision,
      'comment', NULLIF(BTRIM(COALESCE(p_comment, '')), '')
    ) || p_metadata
  );

  IF public.tramita_audit_trail_supports_basic_contract() THEN
    BEGIN
      INSERT INTO public.audit_trail (
        document_id, org_id, user_id, action, metadata
      ) VALUES (
        v_step.document_id, v_org_id, v_actor_id,
        'document_tramite_step_completed',
        jsonb_build_object(
          'instance_id', v_instance.id,
          'step_id', p_step_id,
          'node_key', v_step.node_key,
          'node_type', v_step.node_type,
          'decision', p_decision
        ) || p_metadata
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  IF p_decision IN ('approved', 'rejected', 'needs_correction', 'acknowledged', 'attached') THEN
    INSERT INTO public.document_tramite_instance_events (
      org_id, instance_id, step_id, document_id,
      event_type, actor_id, metadata
    ) VALUES (
      v_org_id, v_instance.id, p_step_id, v_step.document_id,
      'decision_recorded', v_actor_id,
      jsonb_build_object('decision', p_decision)
    );
  END IF;

  FOR v_target IN
    SELECT target_step.id, target_step.node_key,
           target_step.node_type, target_step.due_days
    FROM public.document_tramite_instance_edges AS edge
    JOIN public.document_tramite_instance_steps AS target_step
      ON target_step.instance_id = edge.instance_id
     AND target_step.node_key = edge.target_node_key
    WHERE edge.instance_id = v_instance.id
      AND edge.source_node_key = v_step.node_key
      AND edge.condition_type <> 'custom'
      AND (
        edge.condition_type = 'always'
        OR (edge.condition_type = 'approved' AND p_decision = 'approved')
        OR (edge.condition_type = 'rejected' AND p_decision = 'rejected')
        OR (
          edge.condition_type = 'needs_correction'
          AND p_decision = 'needs_correction'
        )
        OR (
          edge.condition_type = 'evidence_missing'
          AND v_evidence_count = 0
        )
        OR (
          edge.condition_type = 'expired'
          AND v_step.due_at IS NOT NULL
          AND v_step.due_at < NOW()
        )
      )
    GROUP BY target_step.id, target_step.node_key,
             target_step.node_type, target_step.due_days
    ORDER BY MIN(edge.priority), target_step.node_key
  LOOP
    v_matching_edges := v_matching_edges + 1;
    IF v_target.node_type = 'end' THEN
      UPDATE public.document_tramite_instance_steps
      SET status = 'completed',
          started_at = NOW(),
          completed_at = NOW(),
          completed_by = v_actor_id,
          decision = 'completed'
      WHERE id = v_target.id;
      v_has_completed_end := true;
    ELSE
      UPDATE public.document_tramite_instance_steps
      SET status = 'active',
          started_at = NOW(),
          completed_at = NULL,
          completed_by = NULL,
          decision = NULL,
          comment = NULL,
          due_at = CASE
            WHEN v_target.due_days IS NULL THEN NULL
            ELSE NOW() + make_interval(days => v_target.due_days)
          END,
          metadata = jsonb_set(
            metadata,
            '{activation_count}',
            to_jsonb(COALESCE((metadata->>'activation_count')::INTEGER, 0) + 1),
            true
          )
      WHERE id = v_target.id
        AND status <> 'active';

      IF FOUND THEN
        v_activated_keys := array_append(v_activated_keys, v_target.node_key);
        INSERT INTO public.document_tramite_instance_events (
          org_id, instance_id, step_id, document_id,
          event_type, actor_id, metadata
        ) VALUES (
          v_org_id, v_instance.id, v_target.id, v_step.document_id,
          'step_activated', v_actor_id,
          jsonb_build_object(
            'node_key', v_target.node_key,
            'from_node_key', v_step.node_key
          )
        );
      END IF;
    END IF;
  END LOOP;

  IF v_matching_edges = 0 THEN
    UPDATE public.document_tramite_instances
    SET status = 'failed',
        current_node_keys = '{}'::TEXT[],
        metadata = metadata || jsonb_build_object(
          'failure_reason', 'no_applicable_edge',
          'failed_after_node', v_step.node_key
        )
    WHERE id = v_instance.id;

    INSERT INTO public.document_tramite_instance_events (
      org_id, instance_id, step_id, document_id,
      event_type, actor_id, metadata
    ) VALUES (
      v_org_id, v_instance.id, p_step_id, v_step.document_id,
      'instance_failed', v_actor_id,
      jsonb_build_object(
        'reason', 'Nenhum caminho aplicável após a etapa.',
        'node_key', v_step.node_key
      )
    );

    RETURN jsonb_build_object(
      'success', false,
      'instance_id', v_instance.id,
      'completed_step_id', p_step_id,
      'activated_steps', '[]'::JSONB,
      'instance_status', 'failed',
      'current_node_keys', '[]'::JSONB,
      'message', 'Nenhum caminho aplicável foi encontrado.'
    );
  END IF;

  SELECT COALESCE(array_agg(node_key ORDER BY node_key), '{}'::TEXT[])
  INTO v_current_keys
  FROM public.document_tramite_instance_steps
  WHERE instance_id = v_instance.id
    AND status = 'active';

  IF COALESCE(array_length(v_current_keys, 1), 0) = 0
     AND v_has_completed_end THEN
    UPDATE public.document_tramite_instances
    SET status = 'completed',
        current_node_keys = '{}'::TEXT[],
        completed_by = v_actor_id,
        completed_at = NOW()
    WHERE id = v_instance.id;

    UPDATE public.document_tramite_instance_steps
    SET status = 'skipped',
        decision = COALESCE(decision, 'skipped')
    WHERE instance_id = v_instance.id
      AND status = 'pending';

    INSERT INTO public.document_tramite_instance_events (
      org_id, instance_id, document_id, event_type, actor_id, metadata
    ) VALUES (
      v_org_id, v_instance.id, v_step.document_id,
      'instance_completed', v_actor_id,
      jsonb_build_object('last_step_id', p_step_id)
    );

    IF public.tramita_audit_trail_supports_basic_contract() THEN
      BEGIN
        INSERT INTO public.audit_trail (
          document_id, org_id, user_id, action, metadata
        ) VALUES (
          v_step.document_id, v_org_id, v_actor_id,
          'document_tramite_completed',
          jsonb_build_object('instance_id', v_instance.id)
        );
      EXCEPTION
        WHEN OTHERS THEN
          NULL;
      END;
    END IF;
  ELSE
    UPDATE public.document_tramite_instances
    SET current_node_keys = v_current_keys
    WHERE id = v_instance.id;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'instance_id', v_instance.id,
    'completed_step_id', p_step_id,
    'activated_steps', to_jsonb(v_activated_keys),
    'instance_status', CASE
      WHEN COALESCE(array_length(v_current_keys, 1), 0) = 0
        AND v_has_completed_end THEN 'completed'
      ELSE 'active'
    END,
    'current_node_keys', to_jsonb(v_current_keys)
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.add_document_tramite_evidence(
  p_step_id UUID,
  p_evidence_type TEXT,
  p_note TEXT DEFAULT NULL,
  p_file_path TEXT DEFAULT NULL,
  p_file_name TEXT DEFAULT NULL,
  p_file_size BIGINT DEFAULT NULL,
  p_file_hash TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_step public.document_tramite_instance_steps%ROWTYPE;
  v_instance_status TEXT;
  v_evidence_id UUID;
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF p_metadata IS NULL OR jsonb_typeof(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata da evidência precisa ser um objeto JSON.';
  END IF;
  IF p_evidence_type NOT IN ('note', 'file', 'link', 'external_reference') THEN
    RAISE EXCEPTION 'Tipo de evidência inválido.';
  END IF;
  IF p_evidence_type = 'file'
     AND NULLIF(BTRIM(COALESCE(p_file_path, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Evidência de arquivo exige file_path.';
  END IF;
  IF p_evidence_type IN ('note', 'link', 'external_reference')
     AND NULLIF(BTRIM(COALESCE(p_note, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe a nota, link ou referência externa.';
  END IF;

  SELECT *
  INTO v_step
  FROM public.document_tramite_instance_steps
  WHERE id = p_step_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Etapa não encontrada nesta organização.';
  END IF;

  SELECT status
  INTO v_instance_status
  FROM public.document_tramite_instances
  WHERE id = v_step.instance_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instância não encontrada nesta organização.';
  END IF;
  IF v_instance_status <> 'active' OR v_step.status <> 'active' THEN
    RAISE EXCEPTION 'Evidências só podem ser registradas em etapa ativa.';
  END IF;
  IF NOT public.document_tramite_actor_can_act(p_step_id, v_actor_id) THEN
    RAISE EXCEPTION 'Você não é responsável por esta etapa.';
  END IF;

  INSERT INTO public.document_tramite_instance_evidence (
    org_id, instance_id, step_id, document_id,
    evidence_type, file_path, file_name, file_size, file_hash,
    note, uploaded_by, metadata
  ) VALUES (
    v_org_id, v_step.instance_id, p_step_id, v_step.document_id,
    p_evidence_type, NULLIF(BTRIM(COALESCE(p_file_path, '')), ''),
    NULLIF(BTRIM(COALESCE(p_file_name, '')), ''), p_file_size,
    NULLIF(BTRIM(COALESCE(p_file_hash, '')), ''),
    NULLIF(BTRIM(COALESCE(p_note, '')), ''), v_actor_id, p_metadata
  )
  RETURNING id INTO v_evidence_id;

  INSERT INTO public.document_tramite_instance_events (
    org_id, instance_id, step_id, document_id,
    event_type, actor_id, metadata
  ) VALUES (
    v_org_id, v_step.instance_id, p_step_id, v_step.document_id,
    'evidence_added', v_actor_id,
    jsonb_build_object(
      'evidence_id', v_evidence_id,
      'evidence_type', p_evidence_type,
      'file_name', NULLIF(BTRIM(COALESCE(p_file_name, '')), '')
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'evidence_id', v_evidence_id,
    'instance_id', v_step.instance_id,
    'step_id', p_step_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_document_tramite_instance(
  p_instance_id UUID,
  p_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_instance public.document_tramite_instances%ROWTYPE;
  v_author_id UUID;
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Informe o motivo do cancelamento.';
  END IF;

  SELECT *
  INTO v_instance
  FROM public.document_tramite_instances
  WHERE id = p_instance_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Instância não encontrada nesta organização.';
  END IF;
  IF v_instance.status <> 'active' THEN
    RAISE EXCEPTION 'Somente uma instância ativa pode ser cancelada.';
  END IF;

  SELECT author_id
  INTO v_author_id
  FROM public.documents
  WHERE id = v_instance.document_id
    AND org_id = v_org_id;

  IF NOT (
    public.is_org_role(ARRAY['admin', 'manager'])
    OR v_author_id = v_actor_id
  ) THEN
    RAISE EXCEPTION 'Somente o autor, administrador ou gestor pode cancelar.';
  END IF;

  UPDATE public.document_tramite_instances
  SET status = 'cancelled',
      current_node_keys = '{}'::TEXT[],
      cancelled_by = v_actor_id,
      cancelled_at = NOW(),
      cancellation_reason = BTRIM(p_reason)
  WHERE id = p_instance_id;

  UPDATE public.document_tramite_instance_steps
  SET status = 'cancelled'
  WHERE instance_id = p_instance_id
    AND status IN ('pending', 'active', 'blocked');

  INSERT INTO public.document_tramite_instance_events (
    org_id, instance_id, document_id, event_type, actor_id, metadata
  ) VALUES (
    v_org_id, p_instance_id, v_instance.document_id,
    'instance_cancelled', v_actor_id,
    jsonb_build_object('reason', BTRIM(p_reason))
  );

  IF public.tramita_audit_trail_supports_basic_contract() THEN
    BEGIN
      INSERT INTO public.audit_trail (
        document_id, org_id, user_id, action, metadata
      ) VALUES (
        v_instance.document_id, v_org_id, v_actor_id,
        'document_tramite_cancelled',
        jsonb_build_object(
          'instance_id', p_instance_id,
          'reason', BTRIM(p_reason)
        )
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'instance_id', p_instance_id,
    'status', 'cancelled'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.tramita_audit_trail_supports_basic_contract()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_tramite_actor_can_act(UUID, UUID)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.start_document_tramite_instance(
  UUID, UUID, UUID, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.start_document_tramite_instance(
  UUID, UUID, UUID, JSONB
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.complete_document_tramite_step(
  UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_document_tramite_step(
  UUID, TEXT, TEXT, JSONB
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.add_document_tramite_evidence(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_document_tramite_evidence(
  UUID, TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, JSONB
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_document_tramite_instance(UUID, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_document_tramite_instance(UUID, TEXT)
  TO authenticated, service_role;

GRANT SELECT ON public.document_tramite_instances TO authenticated;
GRANT SELECT ON public.document_tramite_instance_steps TO authenticated;
GRANT SELECT ON public.document_tramite_instance_edges TO authenticated;
GRANT SELECT ON public.document_tramite_instance_evidence TO authenticated;
GRANT SELECT ON public.document_tramite_instance_events TO authenticated;

REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.document_tramite_instances,
     public.document_tramite_instance_steps,
     public.document_tramite_instance_edges,
     public.document_tramite_instance_evidence,
     public.document_tramite_instance_events
  FROM authenticated;

GRANT ALL ON public.document_tramite_instances TO service_role;
GRANT ALL ON public.document_tramite_instance_steps TO service_role;
GRANT ALL ON public.document_tramite_instance_edges TO service_role;
GRANT ALL ON public.document_tramite_instance_evidence TO service_role;
GRANT ALL ON public.document_tramite_instance_events TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
