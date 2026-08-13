-- =====================================================
-- DELETE GUARDS — Regras de negócio para exclusão (documents/templates)
--
-- Problemas originais que esta migration resolve:
--   1. Templates não podiam ser excluídos (RLS bloqueava DELETE na tabela
--      document_tramite_events — faltava policy FOR DELETE).
--   2. Documentos eram apagados mesmo quando aprovados/publicados ou
--      quando já tinham vínculo com algum fluxo de trâmite (em andamento
--      ou histórico fechado). ON DELETE CASCADE piorava: excluir doc
--      apagava todo o rastro das instâncias.
--   3. Templates publicados podiam ser excluídos caso nunca tivessem sido
--      executados (0 instâncias), violando "publicado → só arquiva".
--
-- Soluções:
--   A) Criar policy `document_tramite_events_delete_manager` (RLS).
--   B) Restringir `document_tramite_templates_delete_manager` a DRAFT apenas.
--   C) Trigger BEFORE DELETE em documents: bloqueia exclusão de docs com
--      status protegido ou qualquer vínculo com trâmite (qualquer status).
--   D) Mudar 5 FKs (document_tramite_instances/steps/edges/evidence/events)
--      de ON DELETE CASCADE para ON DELETE RESTRICT.
--
-- Uso: Cole no Supabase > SQL Editor > RUN. Em produção faça em janela de
--      manutenção, a alteração de FK pega lock ACCESS EXCLUSIVE brevemente.
-- =====================================================
BEGIN;

-- =====================================================
-- (A) Falta de RLS: POLICY FOR DELETE em document_tramite_events
-- =====================================================
DROP POLICY IF EXISTS "document_tramite_events_delete_manager"
  ON public.document_tramite_events;
CREATE POLICY "document_tramite_events_delete_manager"
  ON public.document_tramite_events
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND EXISTS (
      SELECT 1
      FROM public.document_tramite_templates AS template
      WHERE template.id = document_tramite_events.template_id
        AND template.org_id = public.current_user_org_id()
    )
  );

-- =====================================================
-- (B) Templates: só DRAFT pode ser excluído. Publicado/arquivado bloqueia.
-- =====================================================
DROP POLICY IF EXISTS "document_tramite_templates_delete_manager"
  ON public.document_tramite_templates;
CREATE POLICY "document_tramite_templates_delete_manager"
  ON public.document_tramite_templates
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND status = 'draft'
  );

-- =====================================================
-- (C) Trigger BEFORE DELETE em documents
--     Bloqueia exclusão de documentos com status final ou qualquer trâmite.
-- =====================================================
CREATE OR REPLACE FUNCTION public.fn_documents_block_unauthorized_delete()
  RETURNS trigger
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  v_has_any_tramite BOOLEAN;
BEGIN
  -- (C.1) Status protegidos (não pode excluir mesmo sem trâmite).
  IF OLD.status = ANY(ARRAY[
    'approved',
    'approved_with_comments',
    'published',
    'aprovado',
    'received',
    'in_analysis',
    'awaiting_revision'
  ]::text[]) THEN
    RAISE EXCEPTION
      'Não é possível excluir documento com status "%". '
      'Documentos aprovados/publicados/recebidos/em análise/aguardando revisão '
      'não podem ser apagados — preserve a rastreabilidade arquivando ou '
      'marcando como obsoleto.',
      OLD.status;
  END IF;

  -- (C.2) Qualquer vínculo com trâmite (ativo ou histórico) → bloqueia.
  SELECT EXISTS (
    SELECT 1
    FROM public.document_tramite_instances i
    WHERE i.document_id = OLD.id
      AND i.org_id = OLD.org_id
  )
  INTO v_has_any_tramite;

  IF v_has_any_tramite THEN
    RAISE EXCEPTION
      'Documento já está vinculado a um fluxo de trâmite. Para excluí-lo, '
      'primeiro encerre/cancele e depois exclua o(s) fluxo(s) associados.';
  END IF;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_documents_block_unauthorized_delete
  ON public.documents;
CREATE TRIGGER trg_documents_block_unauthorized_delete
  BEFORE DELETE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.fn_documents_block_unauthorized_delete();

-- =====================================================
-- (D) ON DELETE CASCADE → RESTRICT nas 5 FKs de runtime
--     (instances, steps, edges, evidence, instance_events)
-- =====================================================

-- D.1 — document_tramite_instances.document_id
ALTER TABLE public.document_tramite_instances
  DROP CONSTRAINT IF EXISTS document_tramite_instances_document_id_fkey;
ALTER TABLE public.document_tramite_instances
  ADD CONSTRAINT document_tramite_instances_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE RESTRICT;

-- D.2 — document_tramite_instance_steps.document_id
ALTER TABLE public.document_tramite_instance_steps
  DROP CONSTRAINT IF EXISTS document_tramite_instance_steps_document_id_fkey;
ALTER TABLE public.document_tramite_instance_steps
  ADD CONSTRAINT document_tramite_instance_steps_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE RESTRICT;

-- D.3 — document_tramite_instance_edges.document_id
ALTER TABLE public.document_tramite_instance_edges
  DROP CONSTRAINT IF EXISTS document_tramite_instance_edges_document_id_fkey;
ALTER TABLE public.document_tramite_instance_edges
  ADD CONSTRAINT document_tramite_instance_edges_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE RESTRICT;

-- D.4 — document_tramite_instance_evidence.document_id
ALTER TABLE public.document_tramite_instance_evidence
  DROP CONSTRAINT IF EXISTS document_tramite_instance_evidence_document_id_fkey;
ALTER TABLE public.document_tramite_instance_evidence
  ADD CONSTRAINT document_tramite_instance_evidence_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE RESTRICT;

-- D.5 — document_tramite_instance_events.document_id
ALTER TABLE public.document_tramite_instance_events
  DROP CONSTRAINT IF EXISTS document_tramite_instance_events_document_id_fkey;
ALTER TABLE public.document_tramite_instance_events
  ADD CONSTRAINT document_tramite_instance_events_document_id_fkey
  FOREIGN KEY (document_id)
  REFERENCES public.documents(id)
  ON DELETE RESTRICT;

COMMIT;

NOTIFY pgrst, 'reload schema';
