-- TRAMITA P-10A.2 — Hardening transacional da revisão formal
-- Pré-requisitos:
--   09_TRAMITA_enterprise_schema_alignment_bridge
--   10_TRAMITA_decision_and_correction_cycle
--   11_TRAMITA_formal_revision_lifecycle

BEGIN;

CREATE OR REPLACE FUNCTION public.publish_formal_revision(
  p_document_id UUID,
  p_document_version_id UUID,
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := transaction_timestamp();
  v_caller_id UUID := auth.uid();
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_document public.documents%ROWTYPE;
  v_version public.document_versions%ROWTYPE;
  v_previous_version public.document_versions%ROWTYPE;
  v_last_flow public.approval_flows%ROWTYPE;
  v_authorized BOOLEAN := false;
  v_old_status TEXT;
  v_next_review_at DATE;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O ator da publicação formal é obrigatório.';
  END IF;

  -- Impede impersonação via parâmetro em uma função SECURITY DEFINER.
  IF v_caller_id IS NULL OR p_actor_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'O ator informado não corresponde ao usuário autenticado.';
  END IF;

  SELECT profile.org_id, profile.role
  INTO v_actor_org_id, v_actor_role
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id
    AND COALESCE(profile.active, true) = true;

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil ativo e organização do ator não foram encontrados.';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Documento mestre não encontrado.';
  END IF;

  IF v_document.org_id IS DISTINCT FROM v_actor_org_id
    OR v_document.org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Não é permitido publicar revisão de outra organização.';
  END IF;

  SELECT version.*
  INTO v_version
  FROM public.document_versions AS version
  WHERE version.id = p_document_version_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Revisão formal não encontrada.';
  END IF;

  IF v_version.document_id IS DISTINCT FROM p_document_id
    OR v_version.org_id IS DISTINCT FROM v_document.org_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A revisão formal não pertence ao documento e à organização informados.';
  END IF;

  -- Estabiliza as etapas existentes enquanto a publicação é validada.
  PERFORM 1
  FROM public.approval_flows AS flow
  WHERE flow.document_id = p_document_id
    AND flow.document_version_id = p_document_version_id
    AND flow.org_id = v_document.org_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM public.approval_flows AS pending_flow
    WHERE pending_flow.document_id = p_document_id
      AND pending_flow.document_version_id = p_document_version_id
      AND pending_flow.org_id = v_document.org_id
      AND pending_flow.status IN ('pending', 'waiting')
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A revisão ainda possui etapas de aprovação pendentes.';
  END IF;

  SELECT flow.*
  INTO v_last_flow
  FROM public.approval_flows AS flow
  WHERE flow.document_id = p_document_id
    AND flow.document_version_id = p_document_version_id
    AND flow.org_id = v_document.org_id
  ORDER BY
    COALESCE(flow.correction_round, 0) DESC,
    flow.step DESC,
    flow.created_at DESC
  LIMIT 1;

  IF NOT FOUND OR v_last_flow.status IS DISTINCT FROM 'approved' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A última etapa da revisão formal não está aprovada.';
  END IF;

  v_authorized := COALESCE((
      v_actor_role IN ('admin', 'manager')
      OR v_last_flow.decided_by = p_actor_id
      OR v_last_flow.assignee_id = p_actor_id
      OR v_last_flow.assignee_user_id = p_actor_id
      OR (
        COALESCE(v_last_flow.assignment_type, 'role') = 'role'
        AND v_last_flow.required_role = v_actor_role
      )
      OR (
        COALESCE(v_last_flow.assignment_type, 'role') = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.approval_group_members AS member
          WHERE member.org_id = v_document.org_id
            AND member.group_id = v_last_flow.assignee_group_id
            AND COALESCE(member.user_id, member.profile_id) = p_actor_id
            AND COALESCE(member.is_active, member.active, true) = true
        )
      )
    ), false);

  IF NOT v_authorized THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'O usuário não está autorizado a publicar esta revisão formal.';
  END IF;

  -- Repetição segura após timeout: não duplica auditoria nem supersessão.
  IF v_document.published_version_id = p_document_version_id
    AND v_document.working_version_id IS NULL
    AND v_version.status = 'published'
    AND v_document.revision = v_version.revision
  THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'document_id', p_document_id,
      'published_version_id', p_document_version_id,
      'previous_version_id', NULL,
      'revision', v_version.revision
    );
  END IF;

  IF v_document.working_version_id IS DISTINCT FROM p_document_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A revisão informada não é a working_version_id atual do documento.';
  END IF;

  IF v_version.status IS NULL
    OR v_version.status NOT IN ('in_review', 'pending_approval', 'rejected')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = format(
        'Status %s não permite publicação formal.',
        COALESCE(v_version.status, '<null>')
      );
  END IF;

  IF v_document.published_version_id IS NOT NULL
    AND v_document.published_version_id <> p_document_version_id
  THEN
    SELECT version.*
    INTO v_previous_version
    FROM public.document_versions AS version
    WHERE version.id = v_document.published_version_id
      AND version.document_id = p_document_id
      AND version.org_id = v_document.org_id
    FOR UPDATE;
  END IF;

  IF v_previous_version.id IS NULL THEN
    SELECT version.*
    INTO v_previous_version
    FROM public.document_versions AS version
    WHERE version.document_id = p_document_id
      AND version.org_id = v_document.org_id
      AND version.id <> p_document_version_id
      AND version.status = 'published'
    ORDER BY version.revision DESC, version.published_at DESC NULLS LAST
    LIMIT 1
    FOR UPDATE;
  END IF;

  v_old_status := v_document.status;

  IF v_previous_version.id IS NOT NULL THEN
    UPDATE public.document_versions
    SET
      status = 'superseded',
      superseded_at = v_now
    WHERE id = v_previous_version.id;

    INSERT INTO public.audit_trail (
      document_id,
      org_id,
      user_id,
      action,
      old_status,
      new_status,
      metadata
    ) VALUES (
      p_document_id,
      v_document.org_id,
      p_actor_id,
      'formal_revision_superseded',
      'published',
      'superseded',
      jsonb_build_object(
        'document_id', p_document_id,
        'document_version_id', v_previous_version.id,
        'previous_revision', v_document.revision,
        'new_revision', v_version.revision,
        'actor', p_actor_id
      )
    );
  END IF;

  UPDATE public.document_versions
  SET
    status = 'published',
    approved_at = v_now,
    published_at = v_now,
    superseded_at = NULL
  WHERE id = p_document_version_id;

  BEGIN
    IF COALESCE(v_version.metadata->>'next_review_at', '') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      v_next_review_at := (v_version.metadata->>'next_review_at')::DATE;
    END IF;
  EXCEPTION
    WHEN invalid_datetime_format OR datetime_field_overflow THEN
      v_next_review_at := NULL;
  END;

  UPDATE public.documents
  SET
    revision = v_version.revision,
    file_path = v_version.file_path,
    file_name = v_version.file_name,
    file_size = v_version.file_size,
    file_hash = v_version.file_hash,
    published_version_id = p_document_version_id,
    working_version_id = NULL,
    status = 'published',
    published_at = v_now,
    next_review_at = COALESCE(v_next_review_at, next_review_at),
    updated_at = v_now
  WHERE id = p_document_id;

  INSERT INTO public.audit_trail (
    document_id,
    org_id,
    user_id,
    action,
    old_status,
    new_status,
    file_hash,
    metadata
  ) VALUES (
    p_document_id,
    v_document.org_id,
    p_actor_id,
    'formal_revision_published',
    v_old_status,
    'published',
    v_version.file_hash,
    jsonb_build_object(
      'document_id', p_document_id,
      'document_version_id', p_document_version_id,
      'previous_published_version_id', v_previous_version.id,
      'previous_revision', v_document.revision,
      'revision_number', v_version.revision,
      'new_revision', v_version.revision,
      'change_reason', v_version.change_reason,
      'actor', p_actor_id,
      'file_name', v_version.file_name,
      'transactional', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'document_id', p_document_id,
    'published_version_id', p_document_version_id,
    'previous_version_id', v_previous_version.id,
    'revision', v_version.revision
  );
END;
$$;

COMMENT ON FUNCTION public.publish_formal_revision(UUID, UUID, UUID) IS
  'Publica atomicamente a working revision aprovada, supera a versão anterior, atualiza o documento mestre e registra auditoria.';

CREATE OR REPLACE FUNCTION public.reject_formal_revision(
  p_document_id UUID,
  p_document_version_id UUID,
  p_step_id UUID,
  p_comment TEXT,
  p_actor_id UUID DEFAULT auth.uid()
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now TIMESTAMPTZ := transaction_timestamp();
  v_caller_id UUID := auth.uid();
  v_actor_org_id UUID;
  v_actor_role TEXT;
  v_document public.documents%ROWTYPE;
  v_version public.document_versions%ROWTYPE;
  v_step public.approval_flows%ROWTYPE;
  v_authorized BOOLEAN := false;
  v_old_status TEXT;
BEGIN
  IF p_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O ator da rejeição formal é obrigatório.';
  END IF;

  IF v_caller_id IS NULL OR p_actor_id IS DISTINCT FROM v_caller_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'O ator informado não corresponde ao usuário autenticado.';
  END IF;

  IF NULLIF(BTRIM(p_comment), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O motivo da rejeição é obrigatório.';
  END IF;

  SELECT profile.org_id, profile.role
  INTO v_actor_org_id, v_actor_role
  FROM public.profiles AS profile
  WHERE profile.id = p_actor_id
    AND COALESCE(profile.active, true) = true;

  IF v_actor_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil ativo e organização do ator não foram encontrados.';
  END IF;

  SELECT document.*
  INTO v_document
  FROM public.documents AS document
  WHERE document.id = p_document_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Documento mestre não encontrado.';
  END IF;

  IF v_document.org_id IS DISTINCT FROM v_actor_org_id
    OR v_document.org_id IS DISTINCT FROM public.current_user_org_id()
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Não é permitido rejeitar revisão de outra organização.';
  END IF;

  SELECT version.*
  INTO v_version
  FROM public.document_versions AS version
  WHERE version.id = p_document_version_id
    AND version.document_id = p_document_id
    AND version.org_id = v_document.org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'Revisão formal não encontrada para este documento.';
  END IF;

  IF v_document.working_version_id IS DISTINCT FROM p_document_version_id THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A revisão informada não é a working_version_id atual do documento.';
  END IF;

  SELECT flow.*
  INTO v_step
  FROM public.approval_flows AS flow
  WHERE flow.id = p_step_id
    AND flow.document_id = p_document_id
    AND flow.document_version_id = p_document_version_id
    AND flow.org_id = v_document.org_id
  FOR UPDATE;

  IF NOT FOUND OR v_step.status IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0001',
      MESSAGE = 'A etapa informada não está pendente para esta revisão formal.';
  END IF;

  v_authorized := COALESCE((
      v_actor_role IN ('admin', 'manager')
      OR v_step.assignee_id = p_actor_id
      OR v_step.assignee_user_id = p_actor_id
      OR (
        COALESCE(v_step.assignment_type, 'role') = 'role'
        AND v_step.required_role = v_actor_role
      )
      OR (
        COALESCE(v_step.assignment_type, 'role') = 'group'
        AND EXISTS (
          SELECT 1
          FROM public.approval_group_members AS member
          WHERE member.org_id = v_document.org_id
            AND member.group_id = v_step.assignee_group_id
            AND COALESCE(member.user_id, member.profile_id) = p_actor_id
            AND COALESCE(member.is_active, member.active, true) = true
        )
      )
    ), false);

  IF NOT v_authorized THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'O usuário não está autorizado a rejeitar esta etapa.';
  END IF;

  v_old_status := v_document.status;

  UPDATE public.approval_flows
  SET
    status = 'rejected',
    comment = BTRIM(p_comment),
    decided_by = p_actor_id,
    decided_at = v_now,
    completed_at = v_now
  WHERE id = p_step_id;

  UPDATE public.approval_flows
  SET
    status = 'cancelled',
    completed_at = v_now
  WHERE document_id = p_document_id
    AND document_version_id = p_document_version_id
    AND org_id = v_document.org_id
    AND id <> p_step_id
    AND status IN ('pending', 'waiting');

  UPDATE public.document_versions
  SET status = 'rejected'
  WHERE id = p_document_version_id;

  UPDATE public.documents
  SET
    status = 'draft',
    updated_at = v_now
  WHERE id = p_document_id;

  INSERT INTO public.audit_trail (
    document_id,
    org_id,
    user_id,
    action,
    old_status,
    new_status,
    metadata
  ) VALUES (
    p_document_id,
    v_document.org_id,
    p_actor_id,
    'formal_revision_rejected',
    v_old_status,
    'draft',
    jsonb_build_object(
      'document_id', p_document_id,
      'document_version_id', p_document_version_id,
      'revision_number', v_version.revision,
      'rejected_step', v_step.step,
      'rejected_step_id', p_step_id,
      'comment', BTRIM(p_comment),
      'correction_required', true,
      'returned_to_author', true,
      'actor', p_actor_id,
      'transactional', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'document_id', p_document_id,
    'document_version_id', p_document_version_id,
    'step_id', p_step_id,
    'revision', v_version.revision,
    'status', 'rejected'
  );
END;
$$;

COMMENT ON FUNCTION public.reject_formal_revision(UUID, UUID, UUID, TEXT, UUID) IS
  'Rejeita atomicamente uma etapa de revisão formal, mantém a publicação vigente e abre correção na working revision.';

REVOKE ALL ON FUNCTION public.publish_formal_revision(UUID, UUID, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reject_formal_revision(UUID, UUID, UUID, TEXT, UUID) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.publish_formal_revision(UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_formal_revision(UUID, UUID, UUID, TEXT, UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
