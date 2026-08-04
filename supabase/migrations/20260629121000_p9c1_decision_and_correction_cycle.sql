-- TRAMITA P-9C.1 — Decision Schema + Correction Resubmission Flow
-- Versiona o hotfix de decisão e prepara novas rodadas de correção sem criar
-- uma revisão documental formal.

BEGIN;

ALTER TABLE public.approval_flows
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS decided_by UUID,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS correction_round INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resubmitted_from_step_id UUID;

ALTER TABLE public.approval_flows
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN correction_round SET DEFAULT 0;

UPDATE public.approval_flows
SET metadata = '{}'::JSONB
WHERE metadata IS NULL;

UPDATE public.approval_flows
SET correction_round = 0
WHERE correction_round IS NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_decided_by_fkey'
      AND pg_get_constraintdef(oid) NOT ILIKE '%ON DELETE SET NULL%'
  ) THEN
    ALTER TABLE public.approval_flows
      DROP CONSTRAINT approval_flows_decided_by_fkey;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_decided_by_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_decided_by_fkey
      FOREIGN KEY (decided_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_resubmitted_from_step_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_resubmitted_from_step_id_fkey
      FOREIGN KEY (resubmitted_from_step_id) REFERENCES public.approval_flows(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

-- Substitui somente checks que validam a coluna status. O novo check é NOT
-- VALID para não bloquear a aplicação por dados históricos fora do contrato;
-- novas escritas passam a aceitar o conjunto usado pelo workflow sequencial.
DO $$
DECLARE
  status_constraint RECORD;
BEGIN
  FOR status_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mstatus\M'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.approval_flows DROP CONSTRAINT %I',
      status_constraint.conname
    );
  END LOOP;

  ALTER TABLE public.approval_flows
    ADD CONSTRAINT approval_flows_status_check
    CHECK (status IN (
      'pending',
      'approved',
      'rejected',
      'skipped',
      'cancelled',
      'waiting'
    )) NOT VALID;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_decided_by
  ON public.approval_flows(org_id, decided_by);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_decided_at
  ON public.approval_flows(org_id, decided_at);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_correction_round
  ON public.approval_flows(org_id, document_id, correction_round);

CREATE INDEX IF NOT EXISTS idx_approval_flows_resubmitted_from_step
  ON public.approval_flows(resubmitted_from_step_id);

NOTIFY pgrst, 'reload schema';

COMMIT;
