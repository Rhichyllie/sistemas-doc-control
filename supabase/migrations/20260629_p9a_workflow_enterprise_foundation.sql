-- TRAMITA P-9A — Workflow Enterprise Foundation
-- Versiona SLA, atores de aprovação e grupos sem remover o contrato legado.
-- Esta migration deve ser aplicada manualmente após revisão; o app possui fallback
-- para ambientes que ainda não tenham recebido estas estruturas.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── APPROVAL FLOWS: SLA E ATRIBUIÇÃO ──────────────────────
ALTER TABLE public.approval_flows
  ADD COLUMN IF NOT EXISTS due_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS due_days INTEGER,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS escalation_user_id UUID,
  ADD COLUMN IF NOT EXISTS escalation_notified_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'role',
  ADD COLUMN IF NOT EXISTS assignee_user_id UUID,
  ADD COLUMN IF NOT EXISTS assignee_group_id UUID,
  ADD COLUMN IF NOT EXISTS instructions TEXT;

ALTER TABLE public.approval_flows
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN assignment_type SET DEFAULT 'role';

UPDATE public.approval_flows
SET assignment_type = 'role'
WHERE assignment_type IS NULL;

-- O campo assignee_id é o contrato legado de atribuição direta. O espelhamento
-- preserva filas existentes e explicita sua semântica no novo modelo.
UPDATE public.approval_flows
SET
  assignment_type = 'user',
  assignee_user_id = assignee_id
WHERE assignee_id IS NOT NULL
  AND assignee_user_id IS NULL
  AND COALESCE(assignment_type, 'role') = 'role';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignment_type_check'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignment_type_check
      CHECK (assignment_type IN ('role', 'user', 'group')) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignee_user_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignee_user_id_fkey
      FOREIGN KEY (assignee_user_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_escalation_user_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_escalation_user_id_fkey
      FOREIGN KEY (escalation_user_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

-- ── GRUPOS DE APROVAÇÃO ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  scope       TEXT NOT NULL DEFAULT 'organization',
  project_id  UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  metadata    JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.approval_group_members (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id   UUID NOT NULL REFERENCES public.approval_groups(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       TEXT NOT NULL DEFAULT 'member',
  is_active  BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, user_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignee_group_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignee_group_id_fkey
      FOREIGN KEY (assignee_group_id) REFERENCES public.approval_groups(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS approval_groups_updated_at ON public.approval_groups;
CREATE TRIGGER approval_groups_updated_at
  BEFORE UPDATE ON public.approval_groups
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── TEMPLATES OPCIONAIS ───────────────────────────────────
-- As tabelas de template não fazem parte das migrations atuais. Se existirem no
-- ambiente de destino, recebem a fundação P-9A; caso contrário, nada é criado.
DO $$
BEGIN
  IF to_regclass('public.approval_template_steps') IS NOT NULL THEN
    EXECUTE $ddl$
      ALTER TABLE public.approval_template_steps
        ADD COLUMN IF NOT EXISTS assignment_type TEXT DEFAULT 'role',
        ADD COLUMN IF NOT EXISTS assignee_user_id UUID,
        ADD COLUMN IF NOT EXISTS assignee_group_id UUID,
        ADD COLUMN IF NOT EXISTS due_days INTEGER,
        ADD COLUMN IF NOT EXISTS is_required BOOLEAN DEFAULT true,
        ADD COLUMN IF NOT EXISTS instructions TEXT,
        ADD COLUMN IF NOT EXISTS escalation_user_id UUID,
        ADD COLUMN IF NOT EXISTS escalation_group_id UUID,
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.approval_template_steps
        ALTER COLUMN assignment_type SET DEFAULT 'role',
        ALTER COLUMN is_required SET DEFAULT true,
        ALTER COLUMN metadata SET DEFAULT '{}'::JSONB
    $ddl$;

    EXECUTE $ddl$
      UPDATE public.approval_template_steps
      SET assignment_type = 'role'
      WHERE assignment_type IS NULL
    $ddl$;
  END IF;

  IF to_regclass('public.approval_templates') IS NOT NULL THEN
    EXECUTE $ddl$
      ALTER TABLE public.approval_templates
        ADD COLUMN IF NOT EXISTS mode TEXT DEFAULT 'sequential',
        ADD COLUMN IF NOT EXISTS default_due_days INTEGER,
        ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB
    $ddl$;

    EXECUTE $ddl$
      ALTER TABLE public.approval_templates
        ALTER COLUMN mode SET DEFAULT 'sequential',
        ALTER COLUMN metadata SET DEFAULT '{}'::JSONB
    $ddl$;

    EXECUTE $ddl$
      UPDATE public.approval_templates
      SET mode = 'sequential'
      WHERE mode IS NULL
    $ddl$;
  END IF;
END;
$$;

DO $$
BEGIN
  IF to_regclass('public.approval_template_steps') IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_template_steps'::REGCLASS
        AND conname = 'approval_template_steps_assignment_type_check'
    ) THEN
      EXECUTE $ddl$
        ALTER TABLE public.approval_template_steps
          ADD CONSTRAINT approval_template_steps_assignment_type_check
          CHECK (assignment_type IN ('role', 'user', 'group')) NOT VALID
      $ddl$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_template_steps'::REGCLASS
        AND conname = 'approval_template_steps_assignee_user_id_fkey'
    ) THEN
      EXECUTE $ddl$
        ALTER TABLE public.approval_template_steps
          ADD CONSTRAINT approval_template_steps_assignee_user_id_fkey
          FOREIGN KEY (assignee_user_id) REFERENCES public.profiles(id)
          ON DELETE SET NULL NOT VALID
      $ddl$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_template_steps'::REGCLASS
        AND conname = 'approval_template_steps_assignee_group_id_fkey'
    ) THEN
      EXECUTE $ddl$
        ALTER TABLE public.approval_template_steps
          ADD CONSTRAINT approval_template_steps_assignee_group_id_fkey
          FOREIGN KEY (assignee_group_id) REFERENCES public.approval_groups(id)
          ON DELETE SET NULL NOT VALID
      $ddl$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_template_steps'::REGCLASS
        AND conname = 'approval_template_steps_escalation_user_id_fkey'
    ) THEN
      EXECUTE $ddl$
        ALTER TABLE public.approval_template_steps
          ADD CONSTRAINT approval_template_steps_escalation_user_id_fkey
          FOREIGN KEY (escalation_user_id) REFERENCES public.profiles(id)
          ON DELETE SET NULL NOT VALID
      $ddl$;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_template_steps'::REGCLASS
        AND conname = 'approval_template_steps_escalation_group_id_fkey'
    ) THEN
      EXECUTE $ddl$
        ALTER TABLE public.approval_template_steps
          ADD CONSTRAINT approval_template_steps_escalation_group_id_fkey
          FOREIGN KEY (escalation_group_id) REFERENCES public.approval_groups(id)
          ON DELETE SET NULL NOT VALID
      $ddl$;
    END IF;
  END IF;

  IF to_regclass('public.approval_templates') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.approval_templates'::REGCLASS
        AND conname = 'approval_templates_mode_check'
    )
  THEN
    EXECUTE $ddl$
      ALTER TABLE public.approval_templates
        ADD CONSTRAINT approval_templates_mode_check
        CHECK (mode IN ('sequential', 'parallel', 'mixed')) NOT VALID
    $ddl$;
  END IF;
END;
$$;

-- ── ÍNDICES ───────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_approval_flows_org_document
  ON public.approval_flows(org_id, document_id);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_status
  ON public.approval_flows(org_id, status);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_assignee_user
  ON public.approval_flows(org_id, assignee_user_id);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_assignee_group
  ON public.approval_flows(org_id, assignee_group_id);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_due_at
  ON public.approval_flows(org_id, due_at);

CREATE INDEX IF NOT EXISTS idx_approval_group_members_org_user
  ON public.approval_group_members(org_id, user_id);

CREATE INDEX IF NOT EXISTS idx_approval_group_members_org_group
  ON public.approval_group_members(org_id, group_id);

DO $$
BEGIN
  IF to_regclass('public.approval_template_steps') IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'approval_template_steps'
        AND column_name = 'template_id'
    )
  THEN
    IF EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'approval_template_steps'
        AND column_name = 'org_id'
    ) THEN
      EXECUTE '
        CREATE INDEX IF NOT EXISTS idx_approval_template_steps_org_template
        ON public.approval_template_steps(org_id, template_id)
      ';
    ELSE
      EXECUTE '
        CREATE INDEX IF NOT EXISTS idx_approval_template_steps_template
        ON public.approval_template_steps(template_id)
      ';
    END IF;
  END IF;
END;
$$;

-- ── VIEW DE SLA ────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_approval_sla_status
WITH (security_invoker = true)
AS
SELECT
  approval_flow.id AS approval_flow_id,
  approval_flow.org_id,
  approval_flow.document_id,
  approval_flow.step,
  approval_flow.status,
  approval_flow.due_at,
  approval_flow.completed_at,
  (
    approval_flow.due_at IS NOT NULL
    AND COALESCE(approval_flow.completed_at, NOW()) > approval_flow.due_at
  ) AS is_overdue,
  CASE
    WHEN approval_flow.due_at IS NULL
      OR COALESCE(approval_flow.completed_at, NOW()) <= approval_flow.due_at
      THEN 0
    ELSE FLOOR(
      EXTRACT(EPOCH FROM (COALESCE(approval_flow.completed_at, NOW()) - approval_flow.due_at))
      / 86400
    )::INTEGER
  END AS days_overdue,
  COALESCE(approval_flow.assignment_type, 'role') AS assignment_type,
  approval_flow.assignee_user_id,
  approval_flow.assignee_group_id
FROM public.approval_flows AS approval_flow;

GRANT SELECT ON public.v_approval_sla_status TO authenticated;
GRANT SELECT ON public.v_approval_sla_status TO service_role;

-- ── RLS ────────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_groups TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_group_members TO authenticated;
GRANT ALL ON public.approval_groups TO service_role;
GRANT ALL ON public.approval_group_members TO service_role;

ALTER TABLE public.approval_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.approval_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_groups_select_org" ON public.approval_groups;
DROP POLICY IF EXISTS "approval_groups_manage_org" ON public.approval_groups;

CREATE POLICY "approval_groups_select_org"
  ON public.approval_groups FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "approval_groups_manage_org"
  ON public.approval_groups FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "approval_group_members_select_org" ON public.approval_group_members;
DROP POLICY IF EXISTS "approval_group_members_manage_org" ON public.approval_group_members;

CREATE POLICY "approval_group_members_select_org"
  ON public.approval_group_members FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "approval_group_members_manage_org"
  ON public.approval_group_members FOR ALL
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

-- Atualiza a policy legada para reconhecer papel, usuário e grupo.
DROP POLICY IF EXISTS "approvals_update_assignee" ON public.approval_flows;

CREATE POLICY "approvals_update_assignee"
  ON public.approval_flows FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND (
      assignee_id = auth.uid()
      OR assignee_user_id = auth.uid()
      OR (
        COALESCE(assignment_type, 'role') = 'role'
        AND required_role = public.current_user_role()
      )
      OR (
        COALESCE(assignment_type, 'role') = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.approval_group_members AS member
          WHERE member.org_id = approval_flows.org_id
            AND member.group_id = approval_flows.assignee_group_id
            AND member.user_id = auth.uid()
            AND member.is_active = true
        )
      )
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      assignee_id = auth.uid()
      OR assignee_user_id = auth.uid()
      OR (
        COALESCE(assignment_type, 'role') = 'role'
        AND required_role = public.current_user_role()
      )
      OR (
        COALESCE(assignment_type, 'role') = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.approval_group_members AS member
          WHERE member.org_id = approval_flows.org_id
            AND member.group_id = approval_flows.assignee_group_id
            AND member.user_id = auth.uid()
            AND member.is_active = true
        )
      )
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
