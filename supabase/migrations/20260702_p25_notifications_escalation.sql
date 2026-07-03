-- 23_TRAMITA_notifications_escalation
-- P-25 - Notificações Internas, Escalonamento e Ação Delegada Auditável
--
-- Migration aditiva. Não envia e-mail, não altera approval_flows,
-- assignee_user_id, due_at ou status de documentos.

BEGIN;

CREATE TABLE IF NOT EXISTS public.internal_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  recipient_user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  notification_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  body TEXT,
  entity_type TEXT,
  entity_id UUID,
  document_id UUID REFERENCES public.documents(id) ON DELETE CASCADE,
  tramite_instance_id UUID REFERENCES public.document_tramite_instances(id) ON DELETE CASCADE,
  tramite_step_id UUID REFERENCES public.document_tramite_instance_steps(id) ON DELETE CASCADE,
  action_url TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  read_at TIMESTAMPTZ,
  dismissed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ,
  CONSTRAINT internal_notifications_type_not_empty
    CHECK (NULLIF(BTRIM(notification_type), '') IS NOT NULL),
  CONSTRAINT internal_notifications_severity_valid
    CHECK (severity IN ('info', 'success', 'warning', 'danger', 'critical')),
  CONSTRAINT internal_notifications_title_not_empty
    CHECK (NULLIF(BTRIM(title), '') IS NOT NULL),
  CONSTRAINT internal_notifications_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object'),
  CONSTRAINT internal_notifications_action_url_safe
    CHECK (
      action_url IS NULL
      OR (
        action_url !~ '[[:cntrl:]]'
        AND LEFT(action_url, 15) = '/authenticated/'
      )
    ),
  CONSTRAINT internal_notifications_expiry_valid
    CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE TABLE IF NOT EXISTS public.notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  notify_in_app BOOLEAN NOT NULL DEFAULT true,
  notify_email BOOLEAN NOT NULL DEFAULT false,
  daily_digest BOOLEAN NOT NULL DEFAULT false,
  quiet_hours_start TIME,
  quiet_hours_end TIME,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_preferences_org_user_unique UNIQUE (org_id, user_id),
  CONSTRAINT notification_preferences_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.notification_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id UUID REFERENCES public.internal_notifications(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  recipient_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  document_id UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  tramite_instance_id UUID REFERENCES public.document_tramite_instances(id) ON DELETE SET NULL,
  tramite_step_id UUID REFERENCES public.document_tramite_instance_steps(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_events_type_valid
    CHECK (
      event_type IN (
        'notification_created',
        'notification_read',
        'notification_dismissed',
        'notification_escalated',
        'notification_generated',
        'notification_suppressed'
      )
    ),
  CONSTRAINT notification_events_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

CREATE TABLE IF NOT EXISTS public.notification_escalation_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  source_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  trigger_after_minutes INTEGER,
  trigger_before_minutes INTEGER,
  target_role TEXT,
  target_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_escalation_rules_name_not_empty
    CHECK (NULLIF(BTRIM(name), '') IS NOT NULL),
  CONSTRAINT notification_escalation_rules_source_valid
    CHECK (
      source_type IN (
        'tramite_step_due_soon',
        'tramite_step_overdue',
        'document_review_due_soon',
        'document_review_overdue',
        'responsible_unavailable',
        'substitute_available',
        'approval_overdue',
        'evidence_pending'
      )
    ),
  CONSTRAINT notification_escalation_rules_severity_valid
    CHECK (severity IN ('info', 'warning', 'danger', 'critical')),
  CONSTRAINT notification_escalation_rules_after_valid
    CHECK (trigger_after_minutes IS NULL OR trigger_after_minutes >= 0),
  CONSTRAINT notification_escalation_rules_before_valid
    CHECK (trigger_before_minutes IS NULL OR trigger_before_minutes >= 0),
  CONSTRAINT notification_escalation_rules_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object')
);

-- Outbox passiva: nenhum trigger ou worker envia estes registros nesta fase.
CREATE TABLE IF NOT EXISTS public.notification_delivery_outbox (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  notification_id UUID NOT NULL REFERENCES public.internal_notifications(id) ON DELETE CASCADE,
  channel TEXT NOT NULL DEFAULT 'email',
  status TEXT NOT NULL DEFAULT 'pending',
  provider TEXT,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  scheduled_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT notification_delivery_outbox_channel_valid
    CHECK (channel IN ('email')),
  CONSTRAINT notification_delivery_outbox_status_valid
    CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  CONSTRAINT notification_delivery_outbox_attempts_valid
    CHECK (attempts >= 0),
  CONSTRAINT notification_delivery_outbox_payload_object
    CHECK (JSONB_TYPEOF(payload) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_internal_notifications_recipient_created
  ON public.internal_notifications(org_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_internal_notifications_recipient_unread
  ON public.internal_notifications(org_id, recipient_user_id, severity, created_at DESC)
  WHERE read_at IS NULL AND dismissed_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_internal_notifications_document
  ON public.internal_notifications(org_id, document_id, created_at DESC)
  WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_internal_notifications_step
  ON public.internal_notifications(org_id, tramite_step_id, created_at DESC)
  WHERE tramite_step_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_notification_events_notification_created
  ON public.notification_events(org_id, notification_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_events_recipient_created
  ON public.notification_events(org_id, recipient_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notification_escalation_rules_source
  ON public.notification_escalation_rules(org_id, source_type, active);
CREATE INDEX IF NOT EXISTS idx_notification_outbox_pending
  ON public.notification_delivery_outbox(org_id, status, scheduled_at)
  WHERE status = 'pending';

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS trg_notification_preferences_updated_at
      ON public.notification_preferences;
    CREATE TRIGGER trg_notification_preferences_updated_at
      BEFORE UPDATE ON public.notification_preferences
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

    DROP TRIGGER IF EXISTS trg_notification_escalation_rules_updated_at
      ON public.notification_escalation_rules;
    CREATE TRIGGER trg_notification_escalation_rules_updated_at
      BEFORE UPDATE ON public.notification_escalation_rules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END;
$$;

ALTER TABLE public.internal_notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_escalation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_delivery_outbox ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "internal_notifications_select_scoped"
  ON public.internal_notifications;
CREATE POLICY "internal_notifications_select_scoped"
  ON public.internal_notifications
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      recipient_user_id = auth.uid()
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

DROP POLICY IF EXISTS "notification_preferences_select_scoped"
  ON public.notification_preferences;
CREATE POLICY "notification_preferences_select_scoped"
  ON public.notification_preferences
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      user_id = auth.uid()
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

DROP POLICY IF EXISTS "notification_preferences_insert_own"
  ON public.notification_preferences;
CREATE POLICY "notification_preferences_insert_own"
  ON public.notification_preferences
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.profiles profile
      WHERE profile.id = notification_preferences.user_id
        AND profile.org_id = public.current_user_org_id()
    )
  );

DROP POLICY IF EXISTS "notification_preferences_update_own"
  ON public.notification_preferences;
CREATE POLICY "notification_preferences_update_own"
  ON public.notification_preferences
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND user_id = auth.uid()
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = auth.uid()
  );

DROP POLICY IF EXISTS "notification_events_select_scoped"
  ON public.notification_events;
CREATE POLICY "notification_events_select_scoped"
  ON public.notification_events
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      recipient_user_id = auth.uid()
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

DROP POLICY IF EXISTS "notification_escalation_rules_select_org"
  ON public.notification_escalation_rules;
CREATE POLICY "notification_escalation_rules_select_org"
  ON public.notification_escalation_rules
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      active
      OR public.is_org_role(ARRAY['admin', 'manager'])
    )
  );

DROP POLICY IF EXISTS "notification_escalation_rules_insert_manager"
  ON public.notification_escalation_rules;
CREATE POLICY "notification_escalation_rules_insert_manager"
  ON public.notification_escalation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (created_by IS NULL OR created_by = auth.uid())
    AND (
      target_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiles target_profile
        WHERE target_profile.id = notification_escalation_rules.target_user_id
          AND target_profile.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "notification_escalation_rules_update_manager"
  ON public.notification_escalation_rules;
CREATE POLICY "notification_escalation_rules_update_manager"
  ON public.notification_escalation_rules
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
    AND (
      target_user_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.profiles target_profile
        WHERE target_profile.id = notification_escalation_rules.target_user_id
          AND target_profile.org_id = public.current_user_org_id()
      )
    )
  );

DROP POLICY IF EXISTS "notification_escalation_rules_delete_manager"
  ON public.notification_escalation_rules;
CREATE POLICY "notification_escalation_rules_delete_manager"
  ON public.notification_escalation_rules
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "notification_outbox_select_manager"
  ON public.notification_delivery_outbox;
CREATE POLICY "notification_outbox_select_manager"
  ON public.notification_delivery_outbox
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

CREATE OR REPLACE FUNCTION public.create_internal_notification(
  p_recipient_user_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT DEFAULT NULL,
  p_severity TEXT DEFAULT 'info',
  p_document_id UUID DEFAULT NULL,
  p_tramite_instance_id UUID DEFAULT NULL,
  p_tramite_step_id UUID DEFAULT NULL,
  p_entity_type TEXT DEFAULT NULL,
  p_entity_id UUID DEFAULT NULL,
  p_action_url TEXT DEFAULT NULL,
  p_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_notification_id UUID;
  v_notify_in_app BOOLEAN := true;
  v_notify_email BOOLEAN := false;
  v_system_context BOOLEAN :=
    current_setting('tramita.notification_system_context', true) = 'on';
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_notification_type, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Tipo da notificação é obrigatório.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Título da notificação é obrigatório.';
  END IF;
  IF p_severity NOT IN ('info', 'success', 'warning', 'danger', 'critical') THEN
    RAISE EXCEPTION 'Severidade da notificação é inválida.';
  END IF;
  IF p_metadata IS NULL OR JSONB_TYPEOF(p_metadata) <> 'object' THEN
    RAISE EXCEPTION 'Metadata da notificação precisa ser um objeto JSON.';
  END IF;
  IF p_action_url IS NOT NULL AND (
    p_action_url ~ '[[:cntrl:]]'
    OR LEFT(p_action_url, 15) <> '/authenticated/'
  ) THEN
    RAISE EXCEPTION 'URL de ação da notificação é inválida.';
  END IF;
  IF NOT (
    p_recipient_user_id = v_actor_id
    OR public.is_org_role(ARRAY['admin', 'manager'])
    OR v_system_context
  ) THEN
    RAISE EXCEPTION 'Você não pode criar notificação para outro usuário.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles recipient
    WHERE recipient.id = p_recipient_user_id
      AND recipient.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Destinatário não pertence à organização atual.';
  END IF;
  IF p_document_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.documents document
    WHERE document.id = p_document_id
      AND document.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Documento não pertence à organização atual.';
  END IF;
  IF p_tramite_instance_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.document_tramite_instances instance
    WHERE instance.id = p_tramite_instance_id
      AND instance.org_id = v_org_id
  ) THEN
    RAISE EXCEPTION 'Instância de trâmite não pertence à organização atual.';
  END IF;
  IF p_tramite_step_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.document_tramite_instance_steps step
    WHERE step.id = p_tramite_step_id
      AND step.org_id = v_org_id
      AND (p_tramite_instance_id IS NULL OR step.instance_id = p_tramite_instance_id)
  ) THEN
    RAISE EXCEPTION 'Etapa de trâmite não pertence ao contexto informado.';
  END IF;

  SELECT preference.notify_in_app, preference.notify_email
  INTO v_notify_in_app, v_notify_email
  FROM public.notification_preferences preference
  WHERE preference.org_id = v_org_id
    AND preference.user_id = p_recipient_user_id;

  v_notify_in_app := COALESCE(v_notify_in_app, true);
  v_notify_email := COALESCE(v_notify_email, false);

  IF NOT v_notify_in_app THEN
    INSERT INTO public.notification_events (
      org_id, event_type, actor_user_id, recipient_user_id,
      document_id, tramite_instance_id, tramite_step_id, metadata
    ) VALUES (
      v_org_id, 'notification_suppressed', v_actor_id, p_recipient_user_id,
      p_document_id, p_tramite_instance_id, p_tramite_step_id,
      jsonb_build_object(
        'notification_type', p_notification_type,
        'reason', 'notify_in_app_disabled'
      ) || p_metadata
    );
    RETURN NULL;
  END IF;

  SELECT notification.id
  INTO v_notification_id
  FROM public.internal_notifications notification
  WHERE notification.org_id = v_org_id
    AND notification.recipient_user_id = p_recipient_user_id
    AND notification.notification_type = BTRIM(p_notification_type)
    AND notification.title = BTRIM(p_title)
    AND notification.document_id IS NOT DISTINCT FROM p_document_id
    AND notification.tramite_instance_id IS NOT DISTINCT FROM p_tramite_instance_id
    AND notification.tramite_step_id IS NOT DISTINCT FROM p_tramite_step_id
    AND notification.entity_type IS NOT DISTINCT FROM NULLIF(BTRIM(COALESCE(p_entity_type, '')), '')
    AND notification.entity_id IS NOT DISTINCT FROM p_entity_id
    AND notification.dismissed_at IS NULL
    AND (notification.expires_at IS NULL OR notification.expires_at > NOW())
    AND notification.created_at >= NOW() - INTERVAL '60 minutes'
  ORDER BY notification.created_at DESC
  LIMIT 1;

  IF v_notification_id IS NOT NULL THEN
    RETURN v_notification_id;
  END IF;

  INSERT INTO public.internal_notifications (
    org_id, recipient_user_id, actor_user_id,
    notification_type, severity, title, body,
    entity_type, entity_id, document_id,
    tramite_instance_id, tramite_step_id,
    action_url, metadata
  ) VALUES (
    v_org_id, p_recipient_user_id, v_actor_id,
    BTRIM(p_notification_type), p_severity, BTRIM(p_title),
    NULLIF(BTRIM(COALESCE(p_body, '')), ''),
    NULLIF(BTRIM(COALESCE(p_entity_type, '')), ''), p_entity_id,
    p_document_id, p_tramite_instance_id, p_tramite_step_id,
    NULLIF(BTRIM(COALESCE(p_action_url, '')), ''), p_metadata
  )
  RETURNING id INTO v_notification_id;

  INSERT INTO public.notification_events (
    org_id, notification_id, event_type, actor_user_id,
    recipient_user_id, document_id, tramite_instance_id,
    tramite_step_id, metadata
  ) VALUES (
    v_org_id, v_notification_id, 'notification_created', v_actor_id,
    p_recipient_user_id, p_document_id, p_tramite_instance_id,
    p_tramite_step_id, p_metadata
  );

  IF v_notify_email THEN
    INSERT INTO public.notification_delivery_outbox (
      org_id, notification_id, channel, status, payload
    ) VALUES (
      v_org_id, v_notification_id, 'email', 'pending',
      jsonb_build_object(
        'recipient_user_id', p_recipient_user_id,
        'title', BTRIM(p_title),
        'body', NULLIF(BTRIM(COALESCE(p_body, '')), ''),
        'action_url', NULLIF(BTRIM(COALESCE(p_action_url, '')), ''),
        'delivery_disabled', true
      )
    );
  END IF;

  RETURN v_notification_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_notification_read(
  p_notification_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification public.internal_notifications%ROWTYPE;
BEGIN
  SELECT *
  INTO v_notification
  FROM public.internal_notifications
  WHERE id = p_notification_id
    AND org_id = public.current_user_org_id()
    AND recipient_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notificação não encontrada para o usuário atual.';
  END IF;
  IF v_notification.read_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.internal_notifications
  SET read_at = NOW()
  WHERE id = p_notification_id;

  INSERT INTO public.notification_events (
    org_id, notification_id, event_type, actor_user_id,
    recipient_user_id, document_id, tramite_instance_id,
    tramite_step_id
  ) VALUES (
    v_notification.org_id, v_notification.id, 'notification_read', auth.uid(),
    v_notification.recipient_user_id, v_notification.document_id,
    v_notification.tramite_instance_id, v_notification.tramite_step_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.dismiss_notification(
  p_notification_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_notification public.internal_notifications%ROWTYPE;
BEGIN
  SELECT *
  INTO v_notification
  FROM public.internal_notifications
  WHERE id = p_notification_id
    AND org_id = public.current_user_org_id()
    AND recipient_user_id = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Notificação não encontrada para o usuário atual.';
  END IF;
  IF v_notification.dismissed_at IS NOT NULL THEN
    RETURN;
  END IF;

  UPDATE public.internal_notifications
  SET dismissed_at = NOW(),
      read_at = COALESCE(read_at, NOW())
  WHERE id = p_notification_id;

  INSERT INTO public.notification_events (
    org_id, notification_id, event_type, actor_user_id,
    recipient_user_id, document_id, tramite_instance_id,
    tramite_step_id
  ) VALUES (
    v_notification.org_id, v_notification.id, 'notification_dismissed', auth.uid(),
    v_notification.recipient_user_id, v_notification.document_id,
    v_notification.tramite_instance_id, v_notification.tramite_step_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_effective_tramite_actor(
  p_step_id UUID,
  p_actor_id UUID DEFAULT auth.uid(),
  p_at TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_step public.document_tramite_instance_steps%ROWTYPE;
  v_instance_status TEXT;
  v_project_id UUID;
  v_doc_type TEXT;
  v_area TEXT;
  v_substitute_id UUID;
  v_absence_id UUID;
  v_delegation_id UUID;
BEGIN
  IF p_actor_id IS NULL OR v_org_id IS NULL OR p_at IS NULL THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'missing_context');
  END IF;
  IF p_actor_id IS DISTINCT FROM auth.uid() THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'actor_must_match_authenticated_user'
    );
  END IF;

  SELECT *
  INTO v_step
  FROM public.document_tramite_instance_steps
  WHERE id = p_step_id
    AND org_id = v_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'step_not_found');
  END IF;

  SELECT instance.status, document.project_id, document.doc_type, document.area
  INTO v_instance_status, v_project_id, v_doc_type, v_area
  FROM public.document_tramite_instances instance
  JOIN public.documents document
    ON document.id = instance.document_id
   AND document.org_id = instance.org_id
  WHERE instance.id = v_step.instance_id
    AND instance.org_id = v_org_id;

  IF v_step.status <> 'active' OR v_instance_status <> 'active' THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'inactive_context');
  END IF;

  IF public.document_tramite_actor_can_act(p_step_id, p_actor_id) THEN
    RETURN jsonb_build_object(
      'allowed', true,
      'delegated', false,
      'actor_user_id', p_actor_id,
      'original_user_id', v_step.assignee_user_id,
      'reason', 'original_assignment'
    );
  END IF;

  IF v_step.assignment_type <> 'specific_user'
     OR v_step.assignee_user_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'delegated', false,
      'reason', 'delegation_requires_specific_user'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.profiles actor
    WHERE actor.id = p_actor_id
      AND actor.org_id = v_org_id
  ) OR public.is_user_unavailable(v_org_id, p_actor_id, p_at) THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'delegated', false,
      'reason', 'substitute_unavailable_or_outside_org'
    );
  END IF;

  v_substitute_id := public.resolve_user_substitute(
    v_org_id,
    v_step.assignee_user_id,
    p_at,
    v_project_id,
    v_doc_type,
    v_area,
    v_step.node_type
  );

  IF v_substitute_id IS DISTINCT FROM p_actor_id THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'delegated', false,
      'reason', 'no_active_delegation'
    );
  END IF;

  SELECT absence.id
  INTO v_absence_id
  FROM public.team_absences absence
  WHERE absence.org_id = v_org_id
    AND absence.user_id = v_step.assignee_user_id
    AND absence.substitute_user_id = p_actor_id
    AND absence.status IN ('scheduled', 'active')
    AND p_at >= absence.starts_at
    AND p_at < absence.ends_at
  ORDER BY
    CASE absence.status WHEN 'active' THEN 0 ELSE 1 END,
    absence.starts_at DESC,
    absence.id
  LIMIT 1;

  IF v_absence_id IS NULL THEN
    SELECT delegation.id
    INTO v_delegation_id
    FROM public.team_delegation_rules delegation
    WHERE delegation.org_id = v_org_id
      AND delegation.owner_user_id = v_step.assignee_user_id
      AND delegation.substitute_user_id = p_actor_id
      AND delegation.active
      AND (delegation.starts_at IS NULL OR p_at >= delegation.starts_at)
      AND (delegation.ends_at IS NULL OR p_at < delegation.ends_at)
      AND (
        delegation.scope = 'all'
        OR (
          delegation.scope = 'project'
          AND delegation.project_id IS NOT NULL
          AND delegation.project_id = v_project_id
        )
        OR (
          delegation.scope = 'document_type'
          AND NULLIF(BTRIM(delegation.doc_type), '') IS NOT NULL
          AND UPPER(delegation.doc_type) = UPPER(v_doc_type)
        )
        OR (
          delegation.scope = 'area'
          AND NULLIF(BTRIM(delegation.area), '') IS NOT NULL
          AND UPPER(delegation.area) = UPPER(v_area)
        )
        OR (
          delegation.scope = 'step_type'
          AND NULLIF(BTRIM(delegation.step_type), '') IS NOT NULL
          AND LOWER(delegation.step_type) = LOWER(v_step.node_type)
        )
      )
    ORDER BY
      CASE delegation.scope
        WHEN 'project' THEN 0
        WHEN 'step_type' THEN 1
        WHEN 'document_type' THEN 2
        WHEN 'area' THEN 3
        ELSE 4
      END,
      delegation.priority,
      delegation.created_at,
      delegation.id
    LIMIT 1;
  END IF;

  IF v_absence_id IS NULL AND v_delegation_id IS NULL THEN
    RETURN jsonb_build_object(
      'allowed', false,
      'delegated', false,
      'reason', 'delegation_source_not_confirmed'
    );
  END IF;

  RETURN jsonb_build_object(
    'allowed', true,
    'delegated', true,
    'actor_user_id', p_actor_id,
    'original_user_id', v_step.assignee_user_id,
    'delegated_from_user_id', v_step.assignee_user_id,
    'reason', CASE WHEN v_absence_id IS NOT NULL THEN 'absence' ELSE 'delegation_rule' END,
    'source', CASE WHEN v_absence_id IS NOT NULL THEN 'absence' ELSE 'delegation_rule' END,
    'absence_id', v_absence_id,
    'delegation_rule_id', v_delegation_id
  );
END;
$$;

-- Helper privado para geração on-demand com deduplicação observável.
CREATE OR REPLACE FUNCTION public.p25_emit_generated_notification(
  p_recipient_user_id UUID,
  p_notification_type TEXT,
  p_title TEXT,
  p_body TEXT,
  p_severity TEXT,
  p_document_id UUID,
  p_tramite_instance_id UUID,
  p_tramite_step_id UUID,
  p_entity_type TEXT,
  p_entity_id UUID,
  p_action_url TEXT,
  p_metadata JSONB
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_existing_id UUID;
  v_notification_id UUID;
BEGIN
  SELECT notification.id
  INTO v_existing_id
  FROM public.internal_notifications notification
  WHERE notification.org_id = v_org_id
    AND notification.recipient_user_id = p_recipient_user_id
    AND notification.notification_type = p_notification_type
    AND notification.document_id IS NOT DISTINCT FROM p_document_id
    AND notification.tramite_step_id IS NOT DISTINCT FROM p_tramite_step_id
    AND notification.entity_type IS NOT DISTINCT FROM p_entity_type
    AND notification.entity_id IS NOT DISTINCT FROM p_entity_id
    AND notification.dismissed_at IS NULL
    AND (notification.expires_at IS NULL OR notification.expires_at > NOW())
    AND notification.created_at >= NOW() - INTERVAL '60 minutes'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    INSERT INTO public.notification_events (
      org_id, notification_id, event_type, actor_user_id,
      recipient_user_id, document_id, tramite_instance_id,
      tramite_step_id, metadata
    ) VALUES (
      v_org_id, v_existing_id, 'notification_suppressed', auth.uid(),
      p_recipient_user_id, p_document_id, p_tramite_instance_id,
      p_tramite_step_id,
      jsonb_build_object('reason', 'duplicate_window') || p_metadata
    );
    RETURN 'duplicate';
  END IF;

  v_notification_id := public.create_internal_notification(
    p_recipient_user_id,
    p_notification_type,
    p_title,
    p_body,
    p_severity,
    p_document_id,
    p_tramite_instance_id,
    p_tramite_step_id,
    p_entity_type,
    p_entity_id,
    p_action_url,
    p_metadata
  );

  IF v_notification_id IS NULL THEN
    RETURN 'suppressed';
  END IF;

  INSERT INTO public.notification_events (
    org_id, notification_id, event_type, actor_user_id,
    recipient_user_id, document_id, tramite_instance_id,
    tramite_step_id, metadata
  ) VALUES (
    v_org_id, v_notification_id, 'notification_generated', auth.uid(),
    p_recipient_user_id, p_document_id, p_tramite_instance_id,
    p_tramite_step_id, p_metadata
  );
  IF p_notification_type = 'notification_escalated' THEN
    INSERT INTO public.notification_events (
      org_id, notification_id, event_type, actor_user_id,
      recipient_user_id, document_id, tramite_instance_id,
      tramite_step_id, metadata
    ) VALUES (
      v_org_id, v_notification_id, 'notification_escalated', auth.uid(),
      p_recipient_user_id, p_document_id, p_tramite_instance_id,
      p_tramite_step_id, p_metadata
    );
  END IF;
  RETURN 'created';
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_operational_notifications(
  p_now TIMESTAMPTZ DEFAULT NOW()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_created INTEGER := 0;
  v_skipped INTEGER := 0;
  v_suppressed INTEGER := 0;
  v_errors INTEGER := 0;
  v_result TEXT;
  v_item RECORD;
  v_target RECORD;
  v_substitute_id UUID;
  v_notification_type TEXT;
  v_severity TEXT;
  v_title TEXT;
  v_body TEXT;
  v_rule_count INTEGER;
  v_assignee_expression TEXT;
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado e organização são obrigatórios.';
  END IF;
  IF NOT public.is_org_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem gerar alertas operacionais.';
  END IF;
  IF p_now IS NULL THEN
    RAISE EXCEPTION 'A data de referência é obrigatória.';
  END IF;

  PERFORM set_config('tramita.notification_system_context', 'on', true);

  FOR v_item IN
    SELECT
      step.id AS step_id,
      step.instance_id,
      step.document_id,
      step.label,
      step.node_type,
      step.assignee_user_id,
      step.due_at,
      step.required_evidence,
      step.required_file,
      document.title AS document_title,
      document.code AS document_code,
      document.project_id,
      document.doc_type,
      document.area
    FROM public.document_tramite_instance_steps step
    JOIN public.document_tramite_instances instance
      ON instance.id = step.instance_id
     AND instance.org_id = step.org_id
     AND instance.status = 'active'
    JOIN public.documents document
      ON document.id = step.document_id
     AND document.org_id = step.org_id
    WHERE step.org_id = v_org_id
      AND step.status = 'active'
      AND step.assignment_type = 'specific_user'
      AND step.assignee_user_id IS NOT NULL
  LOOP
    BEGIN
      IF v_item.due_at IS NOT NULL
         AND v_item.due_at::DATE <= public.add_business_days(
           v_org_id,
           p_now::DATE,
           3,
           NULL
         ) THEN
        IF v_item.due_at <= p_now THEN
          v_notification_type := 'tramite_step_overdue';
          v_severity := 'danger';
          v_title := 'Etapa de trâmite vencida';
          v_body := format(
            '%s · %s está vencida.',
            COALESCE(v_item.document_code, v_item.document_title),
            v_item.label
          );
        ELSE
          v_notification_type := 'tramite_step_due_soon';
          v_severity := 'warning';
          v_title := 'Etapa próxima do vencimento';
          v_body := format(
            '%s · %s vence em breve.',
            COALESCE(v_item.document_code, v_item.document_title),
            v_item.label
          );
        END IF;

        v_result := public.p25_emit_generated_notification(
          v_item.assignee_user_id, v_notification_type, v_title, v_body,
          v_severity, v_item.document_id, v_item.instance_id, v_item.step_id,
          'tramite_step', v_item.step_id,
          '/authenticated/documents/' || v_item.document_id::TEXT,
          jsonb_build_object('source', 'operational_generator', 'due_at', v_item.due_at)
        );
        IF v_result = 'created' THEN v_created := v_created + 1;
        ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
        ELSE v_suppressed := v_suppressed + 1;
        END IF;
      END IF;

      IF public.is_user_unavailable(v_org_id, v_item.assignee_user_id, p_now) THEN
        v_substitute_id := public.resolve_user_substitute(
          v_org_id, v_item.assignee_user_id, p_now,
          v_item.project_id, v_item.doc_type, v_item.area, v_item.node_type
        );

        IF v_substitute_id IS NOT NULL THEN
          v_result := public.p25_emit_generated_notification(
            v_substitute_id, 'substitute_available',
            'Você é substituto em uma etapa ativa',
            format(
              '%s · %s está atribuída a um responsável ausente.',
              COALESCE(v_item.document_code, v_item.document_title),
              v_item.label
            ),
            'warning', v_item.document_id, v_item.instance_id, v_item.step_id,
            'tramite_step', v_item.step_id,
            '/authenticated/documents/' || v_item.document_id::TEXT,
            jsonb_build_object(
              'source', 'operational_generator',
              'delegated_from_user_id', v_item.assignee_user_id
            )
          );
          IF v_result = 'created' THEN v_created := v_created + 1;
          ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
          ELSE v_suppressed := v_suppressed + 1;
          END IF;
        ELSE
          FOR v_target IN
            SELECT profile.id
            FROM public.profiles profile
            WHERE profile.org_id = v_org_id
              AND profile.role IN ('admin', 'manager')
          LOOP
            v_result := public.p25_emit_generated_notification(
              v_target.id, 'responsible_unavailable',
              'Responsável ausente sem substituto',
              format(
                '%s · %s precisa de cobertura operacional.',
                COALESCE(v_item.document_code, v_item.document_title),
                v_item.label
              ),
              'danger', v_item.document_id, v_item.instance_id, v_item.step_id,
              'tramite_step', v_item.step_id,
              '/authenticated/documents/' || v_item.document_id::TEXT,
              jsonb_build_object(
                'source', 'operational_generator',
                'original_user_id', v_item.assignee_user_id
              )
            );
            IF v_result = 'created' THEN v_created := v_created + 1;
            ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
            ELSE v_suppressed := v_suppressed + 1;
            END IF;
          END LOOP;
        END IF;
      END IF;

      IF (v_item.required_evidence OR v_item.required_file)
         AND NOT EXISTS (
           SELECT 1
           FROM public.document_tramite_instance_evidence evidence
           WHERE evidence.org_id = v_org_id
             AND evidence.step_id = v_item.step_id
             AND (
               NOT v_item.required_file
               OR evidence.evidence_type = 'file'
             )
         ) THEN
        v_result := public.p25_emit_generated_notification(
          v_item.assignee_user_id, 'evidence_pending',
          'Evidência obrigatória pendente',
          format(
            '%s · %s exige evidência antes da conclusão.',
            COALESCE(v_item.document_code, v_item.document_title),
            v_item.label
          ),
          'warning', v_item.document_id, v_item.instance_id, v_item.step_id,
          'tramite_step', v_item.step_id,
          '/authenticated/documents/' || v_item.document_id::TEXT,
          jsonb_build_object(
            'source', 'operational_generator',
            'required_file', v_item.required_file
          )
        );
        IF v_result = 'created' THEN v_created := v_created + 1;
        ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
        ELSE v_suppressed := v_suppressed + 1;
        END IF;
      END IF;

      IF v_item.due_at IS NOT NULL AND v_item.due_at <= p_now THEN
        v_rule_count := 0;
        FOR v_target IN
          SELECT DISTINCT target.id, rule.severity, rule.id AS rule_id
          FROM public.notification_escalation_rules rule
          JOIN public.profiles target
            ON target.org_id = rule.org_id
           AND (
             target.id = rule.target_user_id
             OR (
               rule.target_user_id IS NULL
               AND target.role = COALESCE(rule.target_role, 'manager')
             )
           )
          WHERE rule.org_id = v_org_id
            AND rule.active
            AND rule.source_type = 'tramite_step_overdue'
            AND (
              rule.trigger_after_minutes IS NULL
              OR v_item.due_at + make_interval(mins => rule.trigger_after_minutes) <= p_now
            )
        LOOP
          v_rule_count := v_rule_count + 1;
          v_result := public.p25_emit_generated_notification(
            v_target.id, 'notification_escalated',
            'Escalonamento: etapa vencida',
            format(
              '%s · %s permanece vencida.',
              COALESCE(v_item.document_code, v_item.document_title),
              v_item.label
            ),
            v_target.severity, v_item.document_id, v_item.instance_id, v_item.step_id,
            'tramite_step', v_item.step_id,
            '/authenticated/documents/' || v_item.document_id::TEXT,
            jsonb_build_object(
              'source', 'escalation_rule',
              'rule_id', v_target.rule_id,
              'reason', 'overdue'
            )
          );
          IF v_result = 'created' THEN
            v_created := v_created + 1;
          ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
          ELSE v_suppressed := v_suppressed + 1;
          END IF;
        END LOOP;

        IF v_rule_count = 0 THEN
          FOR v_target IN
            SELECT profile.id
            FROM public.profiles profile
            WHERE profile.org_id = v_org_id
              AND profile.role IN ('admin', 'manager')
          LOOP
            v_result := public.p25_emit_generated_notification(
              v_target.id, 'notification_escalated',
              'Escalonamento: etapa vencida',
              format(
                '%s · %s permanece vencida.',
                COALESCE(v_item.document_code, v_item.document_title),
                v_item.label
              ),
              'danger', v_item.document_id, v_item.instance_id, v_item.step_id,
              'tramite_step', v_item.step_id,
              '/authenticated/documents/' || v_item.document_id::TEXT,
              jsonb_build_object('source', 'default_escalation', 'reason', 'overdue')
            );
            IF v_result = 'created' THEN v_created := v_created + 1;
            ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
            ELSE v_suppressed := v_suppressed + 1;
            END IF;
          END LOOP;
        END IF;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
    END;
  END LOOP;

  FOR v_item IN
    SELECT
      document.id AS document_id,
      document.author_id,
      document.title,
      document.code,
      document.next_review_at
    FROM public.documents document
    WHERE document.org_id = v_org_id
      AND document.author_id IS NOT NULL
      AND document.next_review_at IS NOT NULL
      AND document.next_review_at <= (p_now::DATE + 30)
  LOOP
    BEGIN
      IF v_item.next_review_at < p_now::DATE THEN
        v_notification_type := 'document_review_overdue';
        v_severity := 'danger';
        v_title := 'Revisão documental vencida';
      ELSE
        v_notification_type := 'document_review_due_soon';
        v_severity := 'warning';
        v_title := 'Revisão documental próxima';
      END IF;
      v_result := public.p25_emit_generated_notification(
        v_item.author_id, v_notification_type, v_title,
        format(
          '%s precisa de revisão em %s.',
          COALESCE(v_item.code, v_item.title),
          TO_CHAR(v_item.next_review_at, 'DD/MM/YYYY')
        ),
        v_severity, v_item.document_id, NULL, NULL,
        'document', v_item.document_id,
        '/authenticated/documents/' || v_item.document_id::TEXT,
        jsonb_build_object(
          'source', 'operational_generator',
          'next_review_at', v_item.next_review_at
        )
      );
      IF v_result = 'created' THEN v_created := v_created + 1;
      ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
      ELSE v_suppressed := v_suppressed + 1;
      END IF;
    EXCEPTION
      WHEN OTHERS THEN
        v_errors := v_errors + 1;
    END;
  END LOOP;

  IF to_regclass('public.approval_flows') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'approval_flows'
         AND column_name = 'due_at'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'approval_flows'
         AND column_name = 'status'
     ) THEN
    v_assignee_expression := CASE
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_flows'
          AND column_name = 'assignee_user_id'
      ) AND EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_flows'
          AND column_name = 'assignee_id'
      ) THEN 'COALESCE(flow.assignee_user_id, flow.assignee_id)'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_flows'
          AND column_name = 'assignee_user_id'
      ) THEN 'flow.assignee_user_id'
      WHEN EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'approval_flows'
          AND column_name = 'assignee_id'
      ) THEN 'flow.assignee_id'
      ELSE 'NULL::UUID'
    END;

    FOR v_item IN EXECUTE format(
      'SELECT
         flow.id AS flow_id,
         flow.document_id,
         flow.due_at,
         %s AS recipient_user_id,
         document.title,
         document.code
       FROM public.approval_flows flow
       JOIN public.documents document
         ON document.id = flow.document_id
        AND document.org_id = flow.org_id
       WHERE flow.org_id = $1
         AND flow.due_at IS NOT NULL
         AND flow.due_at < $2
         AND flow.status IN (''pending'', ''in_progress'')',
      v_assignee_expression
    ) USING v_org_id, p_now
    LOOP
      BEGIN
        IF v_item.recipient_user_id IS NOT NULL THEN
          v_result := public.p25_emit_generated_notification(
            v_item.recipient_user_id, 'approval_overdue',
            'Aprovação formal vencida',
            format(
              '%s possui uma aprovação pendente fora do prazo.',
              COALESCE(v_item.code, v_item.title)
            ),
            'danger', v_item.document_id, NULL, NULL,
            'approval_flow', v_item.flow_id,
            '/authenticated/documents/' || v_item.document_id::TEXT,
            jsonb_build_object(
              'source', 'operational_generator',
              'approval_flow_id', v_item.flow_id,
              'due_at', v_item.due_at
            )
          );
          IF v_result = 'created' THEN v_created := v_created + 1;
          ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
          ELSE v_suppressed := v_suppressed + 1;
          END IF;
        END IF;
        FOR v_target IN
          SELECT profile.id
          FROM public.profiles profile
          WHERE profile.org_id = v_org_id
            AND profile.role IN ('admin', 'manager')
        LOOP
          v_result := public.p25_emit_generated_notification(
            v_target.id, 'notification_escalated',
            'Escalonamento: aprovação formal vencida',
            format(
              '%s possui uma aprovação parada fora do prazo.',
              COALESCE(v_item.code, v_item.title)
            ),
            'danger', v_item.document_id, NULL, NULL,
            'approval_flow', v_item.flow_id,
            '/authenticated/documents/' || v_item.document_id::TEXT,
            jsonb_build_object(
              'source', 'default_escalation',
              'approval_flow_id', v_item.flow_id,
              'reason', 'approval_overdue'
            )
          );
          IF v_result = 'created' THEN v_created := v_created + 1;
          ELSIF v_result = 'duplicate' THEN v_skipped := v_skipped + 1;
          ELSE v_suppressed := v_suppressed + 1;
          END IF;
        END LOOP;
      EXCEPTION
        WHEN OTHERS THEN
          v_errors := v_errors + 1;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'created', v_created,
    'skipped_duplicate', v_skipped,
    'suppressed', v_suppressed,
    'errors', v_errors,
    'generated_at', p_now
  );
END;
$$;

-- A definição transacional de complete_document_tramite_step é substituída
-- abaixo para enriquecer metadata somente quando a delegação for validada.
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
  v_actor_resolution JSONB;
  v_effective_metadata JSONB := '{}'::JSONB;
  v_is_delegated BOOLEAN := false;
  v_delegated_from_user_id UUID;
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

  v_actor_resolution := public.resolve_effective_tramite_actor(
    p_step_id,
    v_actor_id,
    NOW()
  );
  IF NOT COALESCE((v_actor_resolution->>'allowed')::BOOLEAN, false) THEN
    RAISE EXCEPTION 'Você não é responsável nem substituto válido para esta etapa.';
  END IF;

  v_is_delegated :=
    COALESCE((v_actor_resolution->>'delegated')::BOOLEAN, false);
  v_delegated_from_user_id :=
    NULLIF(v_actor_resolution->>'delegated_from_user_id', '')::UUID;
  v_effective_metadata :=
    p_metadata
    - 'delegated'
    - 'delegated_from_user_id'
    - 'delegation_reason'
    - 'delegation_source'
    - 'absence_id'
    - 'delegation_rule_id';

  IF v_is_delegated THEN
    IF v_step.assignment_type <> 'specific_user'
       OR v_delegated_from_user_id IS DISTINCT FROM v_step.assignee_user_id THEN
      RAISE EXCEPTION 'A delegação não corresponde ao responsável persistido.';
    END IF;
    v_effective_metadata := v_effective_metadata || jsonb_build_object(
      'delegated', true,
      'delegated_from_user_id', v_delegated_from_user_id,
      'delegation_reason', v_actor_resolution->>'reason',
      'delegation_source', v_actor_resolution->>'source',
      'absence_id', v_actor_resolution->'absence_id',
      'delegation_rule_id', v_actor_resolution->'delegation_rule_id',
      'effective_actor_user_id', v_actor_id
    );
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
      metadata = metadata || v_effective_metadata
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
    ) || v_effective_metadata
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
        ) || v_effective_metadata
      );
    EXCEPTION
      WHEN OTHERS THEN
        NULL;
    END;
  END IF;

  IF p_decision IN (
    'approved', 'rejected', 'needs_correction', 'acknowledged', 'attached'
  ) THEN
    INSERT INTO public.document_tramite_instance_events (
      org_id, instance_id, step_id, document_id,
      event_type, actor_id, metadata
    ) VALUES (
      v_org_id, v_instance.id, p_step_id, v_step.document_id,
      'decision_recorded', v_actor_id,
      jsonb_build_object('decision', p_decision) || v_effective_metadata
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
      ) || v_effective_metadata
    );

    RETURN jsonb_build_object(
      'success', false,
      'instance_id', v_instance.id,
      'completed_step_id', p_step_id,
      'activated_steps', '[]'::JSONB,
      'instance_status', 'failed',
      'current_node_keys', '[]'::JSONB,
      'delegated', v_is_delegated,
      'delegated_from_user_id', v_delegated_from_user_id,
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
        || v_effective_metadata
    );

    IF public.tramita_audit_trail_supports_basic_contract() THEN
      BEGIN
        INSERT INTO public.audit_trail (
          document_id, org_id, user_id, action, metadata
        ) VALUES (
          v_step.document_id, v_org_id, v_actor_id,
          'document_tramite_completed',
          jsonb_build_object('instance_id', v_instance.id)
            || v_effective_metadata
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
    'current_node_keys', to_jsonb(v_current_keys),
    'delegated', v_is_delegated,
    'delegated_from_user_id', v_delegated_from_user_id
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_internal_notification(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_notification_read(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.dismiss_notification(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_operational_notifications(TIMESTAMPTZ)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_effective_tramite_actor(
  UUID, UUID, TIMESTAMPTZ
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.complete_document_tramite_step(
  UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.p25_emit_generated_notification(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_internal_notification(
  UUID, TEXT, TEXT, TEXT, TEXT, UUID, UUID, UUID, TEXT, UUID, TEXT, JSONB
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dismiss_notification(UUID)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_operational_notifications(TIMESTAMPTZ)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.resolve_effective_tramite_actor(
  UUID, UUID, TIMESTAMPTZ
) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.complete_document_tramite_step(
  UUID, TEXT, TEXT, JSONB
) TO authenticated, service_role;

GRANT SELECT ON public.internal_notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.notification_preferences TO authenticated;
GRANT SELECT ON public.notification_events TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.notification_escalation_rules TO authenticated;
GRANT SELECT ON public.notification_delivery_outbox TO authenticated;

GRANT ALL ON public.internal_notifications TO service_role;
GRANT ALL ON public.notification_preferences TO service_role;
GRANT ALL ON public.notification_events TO service_role;
GRANT ALL ON public.notification_escalation_rules TO service_role;
GRANT ALL ON public.notification_delivery_outbox TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
