-- ================================================================
-- Migration P30: Sincronia Automática de Status do Documento com Trâmite (P-12)
-- Data: 2026-08-14
--
-- Estratégia: TRIGGERS pós-transação (AFTER INSERT / AFTER UPDATE)
-- nas tabelas do módulo de tramite. Assim:
--   * Não precisamos modificar NENHUMA das 3 RPCs existentes
--     (start/complete/cancel) que têm 300+ linhas de lógica de atores,
--     calendário operacional, delegação e notificações.
--   * Funciona para SEMPRE, mesmo se alguém iniciar/cancelar trâmite
--     via SQL Editor, integração, Supabase UI ou qualquer hook futuro.
--   * É idempotente: rodar 2x não cria trigger duplicado.
--
-- Mapeamento (tudo inglês na coluna status, como solicitado):
--   • Quando UMA INSTÂNCIA DE TRÂMITE É CRIADA (INSERT na
--     document_tramite_instances, status = 'active') →
--       documents.status ← 'in_review' (Em análise)
--       documents.sent_to_analysis_at ← now()
--
--   • Quando A INSTÂNCIA PASSA para 'completed' (chegou ao nó END) →
--       Procuramos steps de aprovação/revisão dessa instância.
--       Se houver decision = 'reject'/'rejected'/'reprovado' em
--       qualquer step de aprovação/revisão → status = 'rejected'
--       Senão → status = 'approved'
--       documents.approved_at / rejected_at ← now()
--
--   • Quando INSTÂNCIA PASSA para 'cancelled' (cancelamento manual) →
--       documents.status = 'cancelled' + documents.cancelled_at = now()
--
-- Bônus: 4 colunas novas de data de transição (solicitado opção 3).
-- ================================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────────
-- PARTE 1: Colunas novas + CHECK CONSTRAINT expandido
-- ──────────────────────────────────────────────────────────────────

-- 4 novas colunas de data (idempotente)
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS sent_to_analysis_at TIMESTAMPTZ NULL;
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS approved_at        TIMESTAMPTZ NULL;
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS rejected_at        TIMESTAMPTZ NULL;
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS cancelled_at       TIMESTAMPTZ NULL;

COMMENT ON COLUMN public.documents.sent_to_analysis_at
  IS 'Data em que o documento entrou em análise (trâmite P-12 iniciado — status in_review)';
COMMENT ON COLUMN public.documents.approved_at
  IS 'Data em que o tramite foi concluído com aprovação (status approved)';
COMMENT ON COLUMN public.documents.rejected_at
  IS 'Data em que o tramite foi concluído com reprovação (status rejected)';
COMMENT ON COLUMN public.documents.cancelled_at
  IS 'Data em que o tramite foi cancelado manualmente (status cancelled)';

-- Remover check constraint antigo por qualquer um dos 3 nomes usados
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_enterprise_status_check') THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_enterprise_status_check;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_status_check_new') THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_status_check_new;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'documents_status_check') THEN
    ALTER TABLE public.documents DROP CONSTRAINT documents_status_check;
  END IF;
END $$;

-- Novo CHECK com os 7 valores permitidos (5 antigos + 2 de tramite)
ALTER TABLE public.documents
  ADD CONSTRAINT documents_status_check
  CHECK (
    status IN (
      'draft',            -- 0. Rascunho (antes de análise)
      'in_review',        -- 1. Em análise / em tramite
      'pending_approval', -- 2. Aguardando aprovação formal
      'published',        -- 3. Publicado
      'obsolete',         -- 4. Obsoleto (ciclo de vida)
      'rejected',         -- 5. Reprovado no tramite (NOVO)
      'cancelled'         -- 6. Trâmite cancelado (NOVO)
    )
  );

-- ──────────────────────────────────────────────────────────────────
-- PARTE 2: 3 FUNÇÕES de trigger (1 por evento de transição)
-- ──────────────────────────────────────────────────────────────────

-- Função 1: trigger rodada TANTO no INSERT quanto no UPDATE de
-- document_tramite_instances. Detecta mudanças de status da instância
-- e sincroniza com documents do documento alvo.
CREATE OR REPLACE FUNCTION public.fn_tramite_sync_document_status()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_doc_id UUID := NEW.document_id;
  v_org_id UUID := NEW.org_id;
  v_old_status TEXT;
  v_new_status TEXT := NEW.status;
  v_was_active_before BOOLEAN := false;
  v_has_reject BOOLEAN := false;
  v_current_doc_status TEXT;
BEGIN
  -- Segurança básica: sem documento ou org, não faz nada
  IF v_doc_id IS NULL OR v_org_id IS NULL OR v_new_status IS NULL THEN
    RETURN NEW;
  END IF;

  -- Em UPDATE (não INSERT) pegamos valor antigo
  IF TG_OP = 'UPDATE' THEN
    v_old_status := OLD.status;
    -- Se status não mudou, saímos rápido (hot path)
    IF v_old_status IS NOT DISTINCT FROM v_new_status THEN
      RETURN NEW;
    END IF;
    v_was_active_before := (v_old_status = 'active');
  END IF;

  -------------------------------------------------------------------
  -- CASO A) Nova instância ATIVA criada / atualizada para active →
  --         documento vai para in_review (Em análise)
  -------------------------------------------------------------------
  IF v_new_status = 'active' AND (TG_OP = 'INSERT' OR NOT v_was_active_before) THEN
    UPDATE public.documents
    SET status             = 'in_review',
        sent_to_analysis_at = COALESCE(sent_to_analysis_at, NOW())
    WHERE id = v_doc_id
      AND org_id = v_org_id
      -- Não sobrescrevemos status mais avançados (ex: já aprovado)
      AND status IN ('draft', 'received', 'in_review', 'pending_approval');
    RETURN NEW;
  END IF;

  -------------------------------------------------------------------
  -- CASO B) Instância ficou 'completed' → decide 'approved' ou 'rejected'
  -------------------------------------------------------------------
  IF v_new_status = 'completed' AND (v_old_status = 'active' OR TG_OP = 'UPDATE') THEN

    -- Contabiliza se existe QUALQUER step de aprovação/revisão, nesta
    -- mesma instância, com decisão de reprovação (variantes em PT/EN).
    SELECT EXISTS (
      SELECT 1
      FROM public.document_tramite_instance_steps s
      WHERE s.instance_id = NEW.id
        AND s.org_id = v_org_id
        AND s.node_type IN ('approval', 'review')
        AND s.status = 'completed'
        AND lower(COALESCE(s.decision, '')) IN (
          'reject', 'rejected', 'refused', 'refuse',
          'reprovar', 'reprovado', 'rejeitado', 'rejeitar',
          'não', 'nao', 'no', 'negativo'
        )
    ) INTO v_has_reject;

    IF v_has_reject THEN
      UPDATE public.documents
      SET status      = 'rejected',
          rejected_at = NOW()
      WHERE id = v_doc_id
        AND org_id = v_org_id
        AND status <> 'rejected';
    ELSE
      UPDATE public.documents
      SET status      = 'approved'::text,
          approved_at = NOW()
      WHERE id = v_doc_id
        AND org_id = v_org_id
        -- Não sobrescreve cancelamento ou reprovação já gravada
        AND status NOT IN ('rejected', 'cancelled');
    END IF;

    RETURN NEW;
  END IF;

  -------------------------------------------------------------------
  -- CASO C) Instância ficou 'cancelled' → documento = cancelled
  -------------------------------------------------------------------
  IF v_new_status = 'cancelled' AND (v_old_status IS NULL OR v_old_status <> 'cancelled') THEN
    UPDATE public.documents
    SET status       = 'cancelled',
        cancelled_at = NOW()
    WHERE id = v_doc_id
      AND org_id = v_org_id
      AND status <> 'cancelled';
    RETURN NEW;
  END IF;

  -- Qualquer outro caso (ex: failed) não mexe no status do documento.
  RETURN NEW;
END;
$$;

-- ──────────────────────────────────────────────────────────────────
-- PARTE 3: TRIGGERS (AFTER INSERT + AFTER UPDATE em instances)
-- ──────────────────────────────────────────────────────────────────

DROP TRIGGER IF EXISTS trig_tramite_instance_sync_status_insert
  ON public.document_tramite_instances;
CREATE TRIGGER trig_tramite_instance_sync_status_insert
AFTER INSERT ON public.document_tramite_instances
FOR EACH ROW
EXECUTE FUNCTION public.fn_tramite_sync_document_status();

DROP TRIGGER IF EXISTS trig_tramite_instance_sync_status_update
  ON public.document_tramite_instances;
CREATE TRIGGER trig_tramite_instance_sync_status_update
AFTER UPDATE OF status ON public.document_tramite_instances
FOR EACH ROW
EXECUTE FUNCTION public.fn_tramite_sync_document_status();

-- (Note on UPDATE OF status: gatilho só dispara se a coluna status
-- da INSTÂNCIA mudar — não dispara para updates de metadata etc.,
-- evitando load desnecessário.)

-- ──────────────────────────────────────────────────────────────────
-- PARTE 4: Permissões (manter padrão das outras funções P12/P25)
-- ──────────────────────────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fn_tramite_sync_document_status() FROM PUBLIC;
-- Função de trigger executa com privilégios de quem alterou a tabela
-- (sec invoker default, mas triggers rodam no contexto da operação);
-- não precisa grant para authenticated.

COMMIT;
