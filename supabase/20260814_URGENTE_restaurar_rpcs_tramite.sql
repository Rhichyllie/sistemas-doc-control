-- ================================================================
-- 🔥 SCRIPT DE URGÊNCIA — RESTAURAR AS 3 RPCs DE TRÂMITE QUEBRADAS
-- ================================================================
--
-- CONTEXTO: A versão anterior da migration P30 sobrescreveu 3 funções
-- do módulo P-12 com um corpo placeholder (incompleto). Esse script
-- restaura O CORPO ORIGINAL DAS MIGRATIONS P12 (20260630121000) +
-- permissões corretas (mesmo padrão do arquivo original).
--
-- COMO USAR (1 vez só, no Supabase):
--   1. Abra o painel → SQL Editor → New Query
--   2. Copie TODO este arquivo (CTRL+A) e cole lá
--   3. Clique ▶ RUN (vai levar ~3s — Success)
--   4. Depois, abra o APP e teste APROVAR NOVAMENTE uma etapa de
--      tramite — VAI VOLTAR A FUNCIONAR EXATAMENTE COMO ANTES!
--   5. (opcional) Aplique depois o arquivo
--      20260814000000_p30_document_status_sync.sql CORRIGIDO
--      (este NÃO toca nas 3 RPCs) para ativar a sincronia de status.
-- ================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- RPC 1/3: start_document_tramite_instance (criar instância)
-- ──────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────
-- RPC 2/3: complete_document_tramite_step (aprovar/reprovar step)
-- ──────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────
-- RPC 3/3: cancel_document_tramite_instance (cancelar tramite)
-- ──────────────────────────────────────────────────────────────────
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

-- ──────────────────────────────────────────────────────────────────
-- PERMISSÕES (mesmo padrão da migration P12 original)
-- ──────────────────────────────────────────────────────────────────
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

REVOKE ALL ON FUNCTION public.cancel_document_tramite_instance(UUID, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_document_tramite_instance(UUID, TEXT)
  TO authenticated, service_role;

-- Pedir pro PostgREST recarregar o schema (importante pro Supabase REST)
NOTIFY pgrst, 'reload schema';

COMMIT;
