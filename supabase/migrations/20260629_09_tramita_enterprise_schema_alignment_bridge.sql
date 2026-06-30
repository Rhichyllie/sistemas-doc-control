-- 09_TRAMITA_enterprise_schema_alignment_bridge
-- Alinha instalações legadas e enterprise antes dos ciclos 10 e 11.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── APPROVAL GROUP MEMBERS: ALIASES LEGADO/ENTERPRISE ─────
ALTER TABLE public.approval_group_members
  ADD COLUMN IF NOT EXISTS profile_id UUID,
  ADD COLUMN IF NOT EXISTS user_id UUID,
  ADD COLUMN IF NOT EXISTS role_in_group TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN;

UPDATE public.approval_group_members
SET
  user_id = COALESCE(user_id, profile_id),
  profile_id = COALESCE(profile_id, user_id),
  role = COALESCE(NULLIF(role, ''), NULLIF(role_in_group, ''), 'member'),
  role_in_group = COALESCE(NULLIF(role_in_group, ''), NULLIF(role, ''), 'member'),
  is_active = COALESCE(is_active, active, true),
  active = COALESCE(active, is_active, true);

ALTER TABLE public.approval_group_members
  ALTER COLUMN role SET DEFAULT 'member',
  ALTER COLUMN role_in_group SET DEFAULT 'member',
  ALTER COLUMN is_active SET DEFAULT true,
  ALTER COLUMN active SET DEFAULT true;

CREATE OR REPLACE FUNCTION public.sync_approval_group_member_aliases()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS NULL AND NEW.profile_id IS NOT NULL THEN
      -- Escrita pelo contrato legado: os campos legados são a fonte.
      NEW.user_id := NEW.profile_id;
      NEW.role := COALESCE(NULLIF(NEW.role_in_group, ''), NULLIF(NEW.role, ''), 'member');
      NEW.is_active := COALESCE(NEW.active, NEW.is_active, true);
    ELSIF NEW.profile_id IS NULL AND NEW.user_id IS NOT NULL THEN
      -- Escrita pelo contrato enterprise: os campos enterprise são a fonte.
      NEW.profile_id := NEW.user_id;
      NEW.role_in_group := COALESCE(NULLIF(NEW.role, ''), NULLIF(NEW.role_in_group, ''), 'member');
      NEW.active := COALESCE(NEW.is_active, NEW.active, true);
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id AND NEW.user_id IS NOT NULL THEN
      NEW.profile_id := NEW.user_id;
    ELSIF NEW.profile_id IS DISTINCT FROM OLD.profile_id AND NEW.profile_id IS NOT NULL THEN
      NEW.user_id := NEW.profile_id;
    END IF;

    IF NEW.role IS DISTINCT FROM OLD.role AND NULLIF(NEW.role, '') IS NOT NULL THEN
      NEW.role_in_group := NEW.role;
    ELSIF NEW.role_in_group IS DISTINCT FROM OLD.role_in_group
      AND NULLIF(NEW.role_in_group, '') IS NOT NULL
    THEN
      NEW.role := NEW.role_in_group;
    END IF;

    IF NEW.is_active IS DISTINCT FROM OLD.is_active THEN
      NEW.active := NEW.is_active;
    ELSIF NEW.active IS DISTINCT FROM OLD.active THEN
      NEW.is_active := NEW.active;
    END IF;
  END IF;

  NEW.user_id := COALESCE(NEW.user_id, NEW.profile_id);
  NEW.profile_id := COALESCE(NEW.profile_id, NEW.user_id);
  NEW.role := COALESCE(NULLIF(NEW.role, ''), NULLIF(NEW.role_in_group, ''), 'member');
  NEW.role_in_group := COALESCE(NULLIF(NEW.role_in_group, ''), NEW.role, 'member');
  NEW.is_active := COALESCE(NEW.is_active, NEW.active, true);
  NEW.active := COALESCE(NEW.active, NEW.is_active, true);

  IF NEW.user_id IS NULL OR NEW.profile_id IS NULL THEN
    RAISE EXCEPTION 'approval_group_members requires user_id/profile_id';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS approval_group_members_sync_aliases
  ON public.approval_group_members;
CREATE TRIGGER approval_group_members_sync_aliases
  BEFORE INSERT OR UPDATE ON public.approval_group_members
  FOR EACH ROW EXECUTE FUNCTION public.sync_approval_group_member_aliases();

-- ── APPROVAL FLOWS: FUNDAÇÃO ENTERPRISE COMPLETA ──────────
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
  ADD COLUMN IF NOT EXISTS instructions TEXT,
  ADD COLUMN IF NOT EXISTS comment TEXT,
  ADD COLUMN IF NOT EXISTS decided_by UUID,
  ADD COLUMN IF NOT EXISTS decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS correction_round INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS resubmitted_from_step_id UUID,
  ADD COLUMN IF NOT EXISTS document_version_id UUID,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER;

ALTER TABLE public.approval_flows
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN assignment_type SET DEFAULT 'role',
  ALTER COLUMN correction_round SET DEFAULT 0;

UPDATE public.approval_flows
SET
  metadata = COALESCE(metadata, '{}'::JSONB),
  correction_round = COALESCE(correction_round, 0),
  assignment_type = CASE
    WHEN assignee_group_id IS NOT NULL THEN 'group'
    WHEN COALESCE(assignee_user_id, assignee_id) IS NOT NULL THEN 'user'
    ELSE COALESCE(assignment_type, 'role')
  END,
  assignee_user_id = COALESCE(assignee_user_id, assignee_id);

-- ── DOCUMENT MASTER POINTERS ───────────────────────────────
ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS working_version_id UUID;

-- ── FORMAL DOCUMENT VERSIONS ───────────────────────────────
ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_from_version_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.document_versions
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE public.document_versions
SET
  status = COALESCE(status, 'draft'),
  metadata = COALESCE(metadata, '{}'::JSONB),
  created_at = COALESCE(created_at, uploaded_at, NOW());

-- ── FOREIGN KEYS DEFENSIVAS ────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_group_members'::REGCLASS
      AND conname = 'approval_group_members_user_id_fkey'
  ) THEN
    ALTER TABLE public.approval_group_members
      ADD CONSTRAINT approval_group_members_user_id_fkey
      FOREIGN KEY (user_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_group_members'::REGCLASS
      AND conname = 'approval_group_members_profile_id_fkey'
  ) THEN
    ALTER TABLE public.approval_group_members
      ADD CONSTRAINT approval_group_members_profile_id_fkey
      FOREIGN KEY (profile_id) REFERENCES public.profiles(id)
      ON DELETE CASCADE NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignee_user_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignee_user_id_fkey
      FOREIGN KEY (assignee_user_id) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignee_group_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignee_group_id_fkey
      FOREIGN KEY (assignee_group_id) REFERENCES public.approval_groups(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_decided_by_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_decided_by_fkey
      FOREIGN KEY (decided_by) REFERENCES public.profiles(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_resubmitted_from_step_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_resubmitted_from_step_id_fkey
      FOREIGN KEY (resubmitted_from_step_id) REFERENCES public.approval_flows(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_document_version_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_document_version_id_fkey
      FOREIGN KEY (document_version_id) REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_versions'::REGCLASS
      AND conname = 'document_versions_created_from_version_id_fkey'
  ) THEN
    ALTER TABLE public.document_versions
      ADD CONSTRAINT document_versions_created_from_version_id_fkey
      FOREIGN KEY (created_from_version_id) REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_published_version_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_published_version_id_fkey
      FOREIGN KEY (published_version_id) REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_working_version_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_working_version_id_fkey
      FOREIGN KEY (working_version_id) REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

-- ── CHECKS DEFENSIVOS ──────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_assignment_type_check'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_assignment_type_check
      CHECK (assignment_type IN ('role', 'user', 'group')) NOT VALID;
  END IF;
END;
$$;

-- ── ÍNDICES ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_approval_group_members_org_user
  ON public.approval_group_members(org_id, user_id);
CREATE INDEX IF NOT EXISTS idx_approval_group_members_org_profile
  ON public.approval_group_members(org_id, profile_id);
CREATE INDEX IF NOT EXISTS idx_approval_group_members_org_group
  ON public.approval_group_members(org_id, group_id);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_assignee_user
  ON public.approval_flows(org_id, assignee_user_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_org_assignee_group
  ON public.approval_flows(org_id, assignee_group_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_org_correction_round
  ON public.approval_flows(org_id, document_id, correction_round);
CREATE INDEX IF NOT EXISTS idx_approval_flows_resubmitted_from_step
  ON public.approval_flows(resubmitted_from_step_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_org_document_version
  ON public.approval_flows(org_id, document_version_id);
CREATE INDEX IF NOT EXISTS idx_approval_flows_org_document_revision
  ON public.approval_flows(org_id, document_id, revision_number);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_revision
  ON public.document_versions(document_id, revision);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_status
  ON public.document_versions(document_id, status);
CREATE INDEX IF NOT EXISTS idx_document_versions_document_published_at
  ON public.document_versions(document_id, published_at);

-- ── RLS/POLICIES COMPATÍVEIS COM ALIASES ───────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.approval_group_members TO authenticated;
GRANT ALL ON public.approval_group_members TO service_role;
ALTER TABLE public.approval_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "approval_group_members_select_org"
  ON public.approval_group_members;
DROP POLICY IF EXISTS "approval_group_members_manage_org"
  ON public.approval_group_members;

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
    AND COALESCE(user_id, profile_id) IS NOT NULL
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

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
            AND COALESCE(member.user_id, member.profile_id) = auth.uid()
            AND COALESCE(member.is_active, member.active, true) = true
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
            AND COALESCE(member.user_id, member.profile_id) = auth.uid()
            AND COALESCE(member.is_active, member.active, true) = true
        )
      )
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

NOTIFY pgrst, 'reload schema';

COMMIT;
