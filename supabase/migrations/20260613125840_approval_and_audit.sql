-- TRAMITA P-2 — Approval flows, audit trail, and notifications

-- ── APPROVAL FLOWS ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.approval_flows (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id     UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  org_id          UUID NOT NULL REFERENCES public.organizations(id),
  step            INTEGER NOT NULL,
  step_label      TEXT NOT NULL,
  required_role   TEXT NOT NULL,
  assignee_id     UUID REFERENCES public.profiles(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','skipped')),
  comment         TEXT,
  decided_at      TIMESTAMPTZ,
  decided_by      UUID REFERENCES public.profiles(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.approval_flows ENABLE ROW LEVEL SECURITY;

-- ── AUDIT TRAIL ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_trail (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  document_id  UUID NOT NULL REFERENCES public.documents(id),
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  action       TEXT NOT NULL,
  old_status   TEXT,
  new_status   TEXT,
  file_hash    TEXT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.audit_trail ENABLE ROW LEVEL SECURITY;

-- ── NOTIFICATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id),
  user_id      UUID NOT NULL REFERENCES public.profiles(id),
  document_id  UUID REFERENCES public.documents(id),
  type         TEXT NOT NULL,
  title        TEXT NOT NULL,
  body         TEXT,
  read         BOOLEAN NOT NULL DEFAULT false,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- ── RLS — APPROVAL FLOWS ───────────────────────────────────
DROP POLICY IF EXISTS "approvals_select_org" ON public.approval_flows;
DROP POLICY IF EXISTS "approvals_insert_system" ON public.approval_flows;
DROP POLICY IF EXISTS "approvals_update_assignee" ON public.approval_flows;

CREATE POLICY "approvals_select_org"
  ON public.approval_flows FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "approvals_insert_system"
  ON public.approval_flows FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin','manager','approver','reviewer','author'])
  );

CREATE POLICY "approvals_update_assignee"
  ON public.approval_flows FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND (
      assignee_id = auth.uid()
      OR public.is_org_role(ARRAY['admin','manager'])
    )
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND (
      assignee_id = auth.uid()
      OR public.is_org_role(ARRAY['admin','manager'])
    )
  );

-- ── RLS — AUDIT TRAIL ──────────────────────────────────────
DROP POLICY IF EXISTS "audit_select_org" ON public.audit_trail;
DROP POLICY IF EXISTS "audit_insert_authenticated" ON public.audit_trail;

CREATE POLICY "audit_select_org"
  ON public.audit_trail FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "audit_insert_authenticated"
  ON public.audit_trail FOR INSERT
  WITH CHECK (org_id = public.current_user_org_id());

-- No UPDATE or DELETE policies: audit_trail is append-only and immutable.

-- ── RLS — NOTIFICATIONS ────────────────────────────────────
DROP POLICY IF EXISTS "notif_select_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_update_own" ON public.notifications;
DROP POLICY IF EXISTS "notif_insert_system" ON public.notifications;

CREATE POLICY "notif_select_own"
  ON public.notifications FOR SELECT
  USING (user_id = auth.uid() AND org_id = public.current_user_org_id());

CREATE POLICY "notif_update_own"
  ON public.notifications FOR UPDATE
  USING (user_id = auth.uid() AND org_id = public.current_user_org_id())
  WITH CHECK (user_id = auth.uid() AND org_id = public.current_user_org_id());

CREATE POLICY "notif_insert_system"
  ON public.notifications FOR INSERT
  WITH CHECK (org_id = public.current_user_org_id());

-- ── TRIGGER: auto-log document status changes to audit_trail ──
CREATE OR REPLACE FUNCTION public.log_document_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
BEGIN
  IF OLD.status IS DISTINCT FROM NEW.status THEN
    v_user_id := COALESCE(auth.uid(), NEW.author_id, OLD.author_id);

    INSERT INTO public.audit_trail (
      document_id, org_id, user_id,
      action, old_status, new_status, file_hash
    ) VALUES (
      NEW.id, NEW.org_id, v_user_id,
      'status_changed', OLD.status, NEW.status, NEW.file_hash
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_audit_status ON public.documents;
CREATE TRIGGER documents_audit_status
  AFTER UPDATE ON public.documents
  FOR EACH ROW EXECUTE FUNCTION public.log_document_status_change();
