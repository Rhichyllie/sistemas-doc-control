-- TRAMITA P-12 — Modelador de Trâmites Documentais
-- Modelos versionados, grafo visual, validação e publicação controlada.
-- Aplicação exclusivamente manual após revisão no Supabase SQL Editor.
-- Não cria approval_flows nem executa trâmites em documentos.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.document_tramite_templates (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id             UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  code               TEXT NOT NULL,
  name               TEXT NOT NULL,
  description        TEXT,
  status             TEXT NOT NULL DEFAULT 'draft',
  template_scope     TEXT NOT NULL DEFAULT 'organization',
  doc_type           TEXT,
  area               TEXT,
  project_id         UUID,
  is_default         BOOLEAN NOT NULL DEFAULT false,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  current_version_id UUID,
  created_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  updated_by         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at       TIMESTAMPTZ,
  metadata           JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_templates_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT document_tramite_templates_scope_check
    CHECK (template_scope IN ('organization', 'project', 'area', 'type', 'area_type')),
  CONSTRAINT document_tramite_templates_code_check
    CHECK (LENGTH(BTRIM(code)) > 0),
  CONSTRAINT document_tramite_templates_name_check
    CHECK (LENGTH(BTRIM(name)) > 0),
  CONSTRAINT document_tramite_templates_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_tramite_templates_org_code_key UNIQUE (org_id, code)
);

CREATE TABLE IF NOT EXISTS public.document_tramite_template_versions (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id    UUID NOT NULL REFERENCES public.document_tramite_templates(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL DEFAULT 1,
  status         TEXT NOT NULL DEFAULT 'draft',
  graph          JSONB NOT NULL DEFAULT '{"nodes":[],"edges":[]}'::JSONB,
  validation     JSONB NOT NULL DEFAULT '{}'::JSONB,
  nodes_count    INTEGER NOT NULL DEFAULT 0,
  edges_count    INTEGER NOT NULL DEFAULT 0,
  created_by     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_by   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  published_at   TIMESTAMPTZ,
  metadata       JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_versions_status_check
    CHECK (status IN ('draft', 'published', 'archived')),
  CONSTRAINT document_tramite_versions_number_check
    CHECK (version_number >= 1),
  CONSTRAINT document_tramite_versions_graph_check
    CHECK (jsonb_typeof(graph) = 'object'),
  CONSTRAINT document_tramite_versions_validation_check
    CHECK (jsonb_typeof(validation) = 'object'),
  CONSTRAINT document_tramite_versions_nodes_count_check
    CHECK (nodes_count >= 0),
  CONSTRAINT document_tramite_versions_edges_count_check
    CHECK (edges_count >= 0),
  CONSTRAINT document_tramite_versions_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object'),
  CONSTRAINT document_tramite_versions_template_number_key
    UNIQUE (template_id, version_number)
);

CREATE TABLE IF NOT EXISTS public.document_tramite_nodes (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id          UUID NOT NULL REFERENCES public.document_tramite_templates(id) ON DELETE CASCADE,
  version_id           UUID REFERENCES public.document_tramite_template_versions(id) ON DELETE CASCADE,
  node_key             TEXT NOT NULL,
  node_type            TEXT NOT NULL,
  label                TEXT NOT NULL,
  description          TEXT,
  position_x           NUMERIC NOT NULL DEFAULT 0,
  position_y           NUMERIC NOT NULL DEFAULT 0,
  assignment_type      TEXT,
  assignee_user_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  assignee_group_id    UUID,
  due_days             INTEGER,
  required_evidence    BOOLEAN NOT NULL DEFAULT false,
  required_file        BOOLEAN NOT NULL DEFAULT false,
  require_comment      BOOLEAN NOT NULL DEFAULT false,
  allow_correction     BOOLEAN NOT NULL DEFAULT true,
  metadata             JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_nodes_type_check
    CHECK (node_type IN (
      'start', 'draft', 'review', 'approval', 'correction', 'evidence',
      'mandatory_reading', 'publication', 'end', 'decision', 'custom'
    )),
  CONSTRAINT document_tramite_nodes_assignment_check
    CHECK (
      assignment_type IS NULL
      OR assignment_type IN (
        'none', 'author', 'document_owner', 'specific_user',
        'approval_group', 'role'
      )
    ),
  CONSTRAINT document_tramite_nodes_due_days_check
    CHECK (due_days IS NULL OR due_days BETWEEN 0 AND 3650),
  CONSTRAINT document_tramite_nodes_label_check
    CHECK (LENGTH(BTRIM(label)) > 0),
  CONSTRAINT document_tramite_nodes_key_check
    CHECK (LENGTH(BTRIM(node_key)) > 0),
  CONSTRAINT document_tramite_nodes_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_tramite_edges (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id      UUID NOT NULL REFERENCES public.document_tramite_templates(id) ON DELETE CASCADE,
  version_id       UUID REFERENCES public.document_tramite_template_versions(id) ON DELETE CASCADE,
  edge_key         TEXT NOT NULL,
  source_node_key  TEXT NOT NULL,
  target_node_key  TEXT NOT NULL,
  label            TEXT,
  condition_type   TEXT NOT NULL DEFAULT 'always',
  condition_value  TEXT,
  priority         INTEGER NOT NULL DEFAULT 100,
  metadata         JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_edges_condition_check
    CHECK (condition_type IN (
      'always', 'approved', 'rejected', 'needs_correction',
      'expired', 'evidence_missing', 'custom'
    )),
  CONSTRAINT document_tramite_edges_distinct_nodes_check
    CHECK (source_node_key <> target_node_key),
  CONSTRAINT document_tramite_edges_key_check
    CHECK (LENGTH(BTRIM(edge_key)) > 0),
  CONSTRAINT document_tramite_edges_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_tramite_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id UUID REFERENCES public.document_tramite_templates(id) ON DELETE SET NULL,
  version_id  UUID REFERENCES public.document_tramite_template_versions(id) ON DELETE SET NULL,
  event_type  TEXT NOT NULL,
  actor_id    UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_tramite_events_type_check
    CHECK (event_type IN (
      'created', 'updated', 'validated', 'published', 'archived',
      'duplicated', 'simulated', 'repaired'
    )),
  CONSTRAINT document_tramite_events_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

DO $$
BEGIN
  IF to_regclass('public.projects') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.document_tramite_templates'::REGCLASS
         AND conname = 'document_tramite_templates_project_id_fkey'
     ) THEN
    ALTER TABLE public.document_tramite_templates
      ADD CONSTRAINT document_tramite_templates_project_id_fkey
      FOREIGN KEY (project_id) REFERENCES public.projects(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF to_regclass('public.approval_groups') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.document_tramite_nodes'::REGCLASS
         AND conname = 'document_tramite_nodes_assignee_group_id_fkey'
     ) THEN
    ALTER TABLE public.document_tramite_nodes
      ADD CONSTRAINT document_tramite_nodes_assignee_group_id_fkey
      FOREIGN KEY (assignee_group_id) REFERENCES public.approval_groups(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.document_tramite_templates'::REGCLASS
      AND conname = 'document_tramite_templates_current_version_id_fkey'
  ) THEN
    ALTER TABLE public.document_tramite_templates
      ADD CONSTRAINT document_tramite_templates_current_version_id_fkey
      FOREIGN KEY (current_version_id)
      REFERENCES public.document_tramite_template_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_org_status
  ON public.document_tramite_templates(org_id, status);
CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_org_active
  ON public.document_tramite_templates(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_org_code
  ON public.document_tramite_templates(org_id, code);
CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_org_scope
  ON public.document_tramite_templates(org_id, template_scope);
CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_context
  ON public.document_tramite_templates(org_id, doc_type, area, project_id);
CREATE INDEX IF NOT EXISTS idx_document_tramite_templates_created_by
  ON public.document_tramite_templates(created_by);
CREATE INDEX IF NOT EXISTS idx_document_tramite_versions_template
  ON public.document_tramite_template_versions(org_id, template_id, status);
CREATE INDEX IF NOT EXISTS idx_document_tramite_nodes_version
  ON public.document_tramite_nodes(org_id, template_id, version_id);
CREATE INDEX IF NOT EXISTS idx_document_tramite_edges_version
  ON public.document_tramite_edges(org_id, template_id, version_id);
CREATE INDEX IF NOT EXISTS idx_document_tramite_events_template
  ON public.document_tramite_events(org_id, template_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tramite_nodes_version_key
  ON public.document_tramite_nodes(
    template_id,
    COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::UUID),
    node_key
  );
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_tramite_edges_version_key
  ON public.document_tramite_edges(
    template_id,
    COALESCE(version_id, '00000000-0000-0000-0000-000000000000'::UUID),
    edge_key
  );

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS document_tramite_templates_updated_at ON public.document_tramite_templates';
    EXECUTE '
      CREATE TRIGGER document_tramite_templates_updated_at
      BEFORE UPDATE ON public.document_tramite_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
    EXECUTE 'DROP TRIGGER IF EXISTS document_tramite_nodes_updated_at ON public.document_tramite_nodes';
    EXECUTE '
      CREATE TRIGGER document_tramite_nodes_updated_at
      BEFORE UPDATE ON public.document_tramite_nodes
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
    EXECUTE 'DROP TRIGGER IF EXISTS document_tramite_edges_updated_at ON public.document_tramite_edges';
    EXECUTE '
      CREATE TRIGGER document_tramite_edges_updated_at
      BEFORE UPDATE ON public.document_tramite_edges
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END;
$$;

ALTER TABLE public.document_tramite_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_edges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_tramite_events ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  v_table TEXT;
BEGIN
  FOREACH v_table IN ARRAY ARRAY[
    'document_tramite_templates',
    'document_tramite_template_versions',
    'document_tramite_nodes',
    'document_tramite_edges',
    'document_tramite_events'
  ]
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_select_org', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (org_id = public.current_user_org_id())',
      v_table || '_select_org',
      v_table
    );

    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_insert_manager', v_table);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
        org_id = public.current_user_org_id()
        AND public.is_org_role(ARRAY[''admin'', ''manager''])
      )',
      v_table || '_insert_manager',
      v_table
    );

    IF v_table <> 'document_tramite_events' THEN
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_update_manager', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
          org_id = public.current_user_org_id()
          AND public.is_org_role(ARRAY[''admin'', ''manager''])
        ) WITH CHECK (
          org_id = public.current_user_org_id()
          AND public.is_org_role(ARRAY[''admin'', ''manager''])
        )',
        v_table || '_update_manager',
        v_table
      );

      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', v_table || '_delete_manager', v_table);
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR DELETE TO authenticated USING (
          org_id = public.current_user_org_id()
          AND public.is_org_role(ARRAY[''admin'', ''manager''])
        )',
        v_table || '_delete_manager',
        v_table
      );
    END IF;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.validate_document_tramite_graph(p_graph JSONB)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SET search_path = public
AS $$
DECLARE
  v_errors JSONB := '[]'::JSONB;
  v_warnings JSONB := '[]'::JSONB;
  v_start_count INTEGER := 0;
  v_end_count INTEGER := 0;
  v_nodes_count INTEGER := 0;
  v_edges_count INTEGER := 0;
  v_has_path BOOLEAN := false;
BEGIN
  IF p_graph IS NULL OR jsonb_typeof(p_graph) <> 'object' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'publishable', false,
      'errors', jsonb_build_array('O grafo precisa ser um objeto JSON.'),
      'warnings', '[]'::JSONB
    );
  END IF;

  IF jsonb_typeof(p_graph->'nodes') <> 'array'
     OR jsonb_typeof(p_graph->'edges') <> 'array' THEN
    RETURN jsonb_build_object(
      'valid', false,
      'publishable', false,
      'errors', jsonb_build_array('O grafo precisa conter arrays nodes e edges.'),
      'warnings', '[]'::JSONB
    );
  END IF;

  v_nodes_count := jsonb_array_length(p_graph->'nodes');
  v_edges_count := jsonb_array_length(p_graph->'edges');

  SELECT COUNT(*) FILTER (WHERE node->>'node_type' = 'start'),
         COUNT(*) FILTER (WHERE node->>'node_type' = 'end')
  INTO v_start_count, v_end_count
  FROM jsonb_array_elements(p_graph->'nodes') AS node;

  IF v_start_count <> 1 THEN
    v_errors := v_errors || jsonb_build_array('O trâmite precisa ter exatamente um Início.');
  END IF;
  IF v_end_count < 1 THEN
    v_errors := v_errors || jsonb_build_array('O trâmite precisa ter ao menos um Fim.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_graph->'nodes') AS node
    WHERE NULLIF(BTRIM(node->>'label'), '') IS NULL
  ) THEN
    v_errors := v_errors || jsonb_build_array('Todas as etapas precisam ter nome.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_graph->'edges') AS edge
    WHERE edge->>'source' = edge->>'target'
  ) THEN
    v_errors := v_errors || jsonb_build_array('Uma etapa não pode apontar para si mesma.');
  END IF;
  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(p_graph->'edges') AS edge
    WHERE NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_graph->'nodes') AS node
      WHERE node->>'id' = edge->>'source'
    )
    OR NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_graph->'nodes') AS node
      WHERE node->>'id' = edge->>'target'
    )
  ) THEN
    v_errors := v_errors || jsonb_build_array('Há conexões apontando para etapas inexistentes.');
  END IF;

  WITH RECURSIVE walk(node_id, visited) AS (
    SELECT node->>'id', ARRAY[node->>'id']
    FROM jsonb_array_elements(p_graph->'nodes') AS node
    WHERE node->>'node_type' = 'start'
    UNION ALL
    SELECT edge->>'target', walk.visited || (edge->>'target')
    FROM walk
    JOIN LATERAL jsonb_array_elements(p_graph->'edges') AS edge
      ON edge->>'source' = walk.node_id
    WHERE NOT (edge->>'target' = ANY(walk.visited))
  )
  SELECT EXISTS (
    SELECT 1
    FROM walk
    JOIN LATERAL jsonb_array_elements(p_graph->'nodes') AS node
      ON node->>'id' = walk.node_id
    WHERE node->>'node_type' = 'end'
  ) INTO v_has_path;

  IF NOT v_has_path THEN
    v_errors := v_errors || jsonb_build_array('Não existe caminho completo entre Início e Fim.');
  END IF;

  RETURN jsonb_build_object(
    'valid', jsonb_array_length(v_errors) = 0,
    'publishable', jsonb_array_length(v_errors) = 0,
    'errors', v_errors,
    'warnings', v_warnings,
    'nodes_count', v_nodes_count,
    'edges_count', v_edges_count
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.publish_document_tramite_template(
  p_template_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_template public.document_tramite_templates%ROWTYPE;
  v_version public.document_tramite_template_versions%ROWTYPE;
  v_validation JSONB;
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF NOT public.is_org_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem publicar trâmites.';
  END IF;

  SELECT *
  INTO v_template
  FROM public.document_tramite_templates
  WHERE id = p_template_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Modelo de trâmite não encontrado nesta organização.';
  END IF;

  SELECT *
  INTO v_version
  FROM public.document_tramite_template_versions
  WHERE template_id = p_template_id
    AND org_id = v_org_id
    AND status = 'draft'
  ORDER BY version_number DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Nenhuma versão em rascunho disponível para publicação.';
  END IF;

  v_validation := public.validate_document_tramite_graph(v_version.graph);
  IF COALESCE((v_validation->>'publishable')::BOOLEAN, false) IS NOT TRUE THEN
    RAISE EXCEPTION 'O trâmite possui erros de validação: %',
      COALESCE(v_validation->'errors', '[]'::JSONB)::TEXT;
  END IF;

  UPDATE public.document_tramite_template_versions
  SET status = 'archived'
  WHERE template_id = p_template_id
    AND org_id = v_org_id
    AND status = 'published'
    AND id <> v_version.id;

  UPDATE public.document_tramite_template_versions
  SET status = 'published',
      validation = v_validation,
      published_by = v_actor_id,
      published_at = NOW()
  WHERE id = v_version.id;

  UPDATE public.document_tramite_templates
  SET status = 'published',
      current_version_id = v_version.id,
      published_by = v_actor_id,
      published_at = NOW(),
      updated_by = v_actor_id,
      updated_at = NOW()
  WHERE id = p_template_id;

  INSERT INTO public.document_tramite_events (
    org_id, template_id, version_id, event_type, actor_id, metadata
  ) VALUES (
    v_org_id,
    p_template_id,
    v_version.id,
    'published',
    v_actor_id,
    jsonb_build_object(
      'version_number', v_version.version_number,
      'nodes_count', v_version.nodes_count,
      'edges_count', v_version.edges_count
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'template_id', p_template_id,
    'version_id', v_version.id,
    'version_number', v_version.version_number,
    'status', 'published'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.validate_document_tramite_graph(JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.validate_document_tramite_graph(JSONB)
  TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.publish_document_tramite_template(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.publish_document_tramite_template(UUID)
  TO authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_tramite_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_tramite_template_versions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_tramite_nodes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_tramite_edges TO authenticated;
GRANT SELECT, INSERT
  ON public.document_tramite_events TO authenticated;

GRANT ALL ON public.document_tramite_templates TO service_role;
GRANT ALL ON public.document_tramite_template_versions TO service_role;
GRANT ALL ON public.document_tramite_nodes TO service_role;
GRANT ALL ON public.document_tramite_edges TO service_role;
GRANT ALL ON public.document_tramite_events TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
