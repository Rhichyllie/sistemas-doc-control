-- TRAMITA P-18A — Integração sistêmica de criação, código e trâmites
-- Escolha explícita de padrão e atribuição controlada de código legado/manual.
-- Aplicação exclusivamente manual após os ciclos 15, 16, 17 e 18.
-- Não altera approval_flows, não inicia trâmites e não envia notificações.

BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS manual_code BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS external_code TEXT,
  ADD COLUMN IF NOT EXISTS code_pattern_id UUID,
  ADD COLUMN IF NOT EXISTS code_generation_mode TEXT NOT NULL DEFAULT 'legacy';

DO $$
BEGIN
  IF to_regclass('public.document_code_patterns') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.documents'::REGCLASS
         AND conname = 'documents_code_pattern_id_fkey'
     ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_code_pattern_id_fkey
      FOREIGN KEY (code_pattern_id)
      REFERENCES public.document_code_patterns(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_code_generation_mode_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_code_generation_mode_check
      CHECK (
        code_generation_mode IN (
          'legacy', 'automatic', 'configured',
          'selected_pattern', 'manual'
        )
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_external_code_not_blank_check'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_external_code_not_blank_check
      CHECK (
        external_code IS NULL
        OR LENGTH(BTRIM(external_code)) > 0
      );
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_documents_org_code_pattern
  ON public.documents(org_id, code_pattern_id)
  WHERE code_pattern_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_documents_org_code_generation_mode
  ON public.documents(org_id, code_generation_mode);

CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_org_external_code_unique
  ON public.documents(org_id, external_code)
  WHERE external_code IS NOT NULL AND BTRIM(external_code) <> '';

-- P-18A expõe ano longo (YYYY) e curto (YY) no builder sem invalidar
-- expressões P-11 existentes.
DO $$
BEGIN
  IF to_regclass('public.document_code_patterns') IS NOT NULL THEN
    ALTER TABLE public.document_code_patterns
      DROP CONSTRAINT IF EXISTS document_code_patterns_known_tokens_check;
    ALTER TABLE public.document_code_patterns
      ADD CONSTRAINT document_code_patterns_known_tokens_check
      CHECK (
        REGEXP_REPLACE(
          UPPER(pattern),
          '\{(PREFIX|AREA|TYPE|PROJECT|YEAR|YEAR2|MONTH|SEQ|ORG|CUSTOM)\}',
          '',
          'g'
        ) !~ '[{}]'
      );
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.render_document_code_pattern(
  p_pattern public.document_code_patterns,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_code TEXT,
  p_org_code TEXT,
  p_reference_date DATE,
  p_sequence_number INTEGER
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_custom TEXT := '';
BEGIN
  IF jsonb_typeof(p_pattern.tokens) = 'object' THEN
    v_custom := COALESCE(p_pattern.tokens->>'custom', '');
  END IF;

  v_code := UPPER(p_pattern.pattern);
  v_code := REPLACE(v_code, '{PREFIX}', public.normalize_document_code_token(p_pattern.prefix));
  v_code := REPLACE(v_code, '{AREA}', public.normalize_document_code_token(p_area));
  v_code := REPLACE(v_code, '{TYPE}', public.normalize_document_code_token(p_doc_type));
  v_code := REPLACE(v_code, '{PROJECT}', public.normalize_document_code_token(COALESCE(p_project_code, 'GERAL')));
  v_code := REPLACE(v_code, '{YEAR}', TO_CHAR(p_reference_date, 'YYYY'));
  v_code := REPLACE(v_code, '{YEAR2}', TO_CHAR(p_reference_date, 'YY'));
  v_code := REPLACE(v_code, '{MONTH}', TO_CHAR(p_reference_date, 'MM'));
  v_code := REPLACE(
    v_code,
    '{SEQ}',
    CASE
      WHEN LENGTH(p_sequence_number::TEXT) >= p_pattern.sequence_padding
        THEN p_sequence_number::TEXT
      ELSE LPAD(p_sequence_number::TEXT, p_pattern.sequence_padding, '0')
    END
  );
  v_code := REPLACE(v_code, '{ORG}', public.normalize_document_code_token(p_org_code));
  v_code := REPLACE(v_code, '{CUSTOM}', public.normalize_document_code_token(v_custom));

  IF v_code ~ '[{}]' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Padrão de código inválido: token não reconhecido ou chaves malformadas.',
      DETAIL = 'Expressão configurada: ' || p_pattern.pattern,
      HINT = 'Use somente {PREFIX}, {AREA}, {TYPE}, {PROJECT}, {YEAR}, {YEAR2}, {MONTH}, {SEQ}, {ORG} e {CUSTOM}.';
  END IF;

  RETURN UPPER(BTRIM(v_code));
END;
$$;

-- Mantém o contrato P-11 e aceita uma escolha explícita apenas durante a
-- transação das wrappers P-18A.
CREATE OR REPLACE FUNCTION public.resolve_document_code_pattern(
  p_org_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS SETOF public.document_code_patterns
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requested_pattern_text TEXT :=
    NULLIF(current_setting('tramita.selected_code_pattern_id', true), '');
  v_requested_pattern_id UUID := NULL;
BEGIN
  IF v_requested_pattern_text IS NOT NULL
     AND v_requested_pattern_text ~*
       '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  THEN
    v_requested_pattern_id := v_requested_pattern_text::UUID;
  END IF;

  RETURN QUERY
  SELECT pattern.*
  FROM public.document_code_patterns AS pattern
  WHERE pattern.org_id = p_org_id
    AND pattern.is_active = true
    AND (
      v_requested_pattern_id IS NULL
      OR pattern.id = v_requested_pattern_id
    )
    AND pattern.pattern_scope IN (
      'organization', 'project', 'area', 'type', 'area_type'
    )
    AND (pattern.project_id IS NULL OR pattern.project_id = p_project_id)
    AND (
      pattern.doc_type IS NULL
      OR UPPER(pattern.doc_type) = UPPER(p_doc_type)
    )
    AND (pattern.area IS NULL OR UPPER(pattern.area) = UPPER(p_area))
    AND (pattern.pattern_scope <> 'project' OR pattern.project_id IS NOT NULL)
    AND (pattern.pattern_scope <> 'type' OR pattern.doc_type IS NOT NULL)
    AND (pattern.pattern_scope <> 'area' OR pattern.area IS NOT NULL)
    AND (
      pattern.pattern_scope <> 'area_type'
      OR (pattern.doc_type IS NOT NULL AND pattern.area IS NOT NULL)
    )
  ORDER BY
    CASE WHEN pattern.id = v_requested_pattern_id THEN 0 ELSE 1 END,
    pattern.priority ASC,
    (
      CASE
        WHEN pattern.project_id = p_project_id
          AND p_project_id IS NOT NULL THEN 8 ELSE 0
      END
      + CASE
          WHEN pattern.doc_type IS NOT NULL
            AND pattern.area IS NOT NULL THEN 4 ELSE 0
        END
      + CASE WHEN pattern.doc_type IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN pattern.area IS NOT NULL THEN 1 ELSE 0 END
    ) DESC,
    pattern.is_default DESC,
    pattern.created_at ASC,
    pattern.id ASC
  LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.document_code_pattern_is_applicable(
  p_pattern_id UUID,
  p_org_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.document_code_patterns AS pattern
    WHERE pattern.id = p_pattern_id
      AND pattern.org_id = p_org_id
      AND pattern.is_active = true
      AND pattern.pattern_scope IN (
        'organization', 'project', 'area', 'type', 'area_type'
      )
      AND (pattern.project_id IS NULL OR pattern.project_id = p_project_id)
      AND (
        pattern.doc_type IS NULL
        OR UPPER(pattern.doc_type) = UPPER(p_doc_type)
      )
      AND (pattern.area IS NULL OR UPPER(pattern.area) = UPPER(p_area))
      AND (
        pattern.pattern_scope <> 'project'
        OR pattern.project_id IS NOT NULL
      )
      AND (
        pattern.pattern_scope <> 'type'
        OR pattern.doc_type IS NOT NULL
      )
      AND (
        pattern.pattern_scope <> 'area'
        OR pattern.area IS NOT NULL
      )
      AND (
        pattern.pattern_scope <> 'area_type'
        OR (pattern.doc_type IS NOT NULL AND pattern.area IS NOT NULL)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.preview_document_code_for_pattern(
  p_pattern_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário e organização são obrigatórios para o preview.';
  END IF;

  IF NOT public.document_code_pattern_is_applicable(
    p_pattern_id, v_org_id, p_doc_type, p_area, p_project_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O padrão escolhido está inativo, pertence a outra organização ou não se aplica ao contexto.';
  END IF;

  PERFORM set_config(
    'tramita.selected_code_pattern_id',
    p_pattern_id::TEXT,
    true
  );

  RETURN public.preview_document_code(
    p_doc_type,
    p_area,
    p_project_id,
    p_reference_date
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_document_code_for_pattern(
  p_document_id UUID,
  p_pattern_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_result JSONB;
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário e organização são obrigatórios para alocar o código.';
  END IF;

  IF NOT public.document_code_pattern_is_applicable(
    p_pattern_id, v_org_id, p_doc_type, p_area, p_project_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O padrão escolhido está inativo, pertence a outra organização ou não se aplica ao contexto.';
  END IF;

  PERFORM set_config(
    'tramita.selected_code_pattern_id',
    p_pattern_id::TEXT,
    true
  );

  v_result := public.allocate_document_code(
    p_document_id,
    p_doc_type,
    p_area,
    p_project_id,
    p_reference_date
  );

  IF COALESCE((v_result->>'success')::BOOLEAN, false) THEN
    UPDATE public.documents
    SET
      code_pattern_id = p_pattern_id,
      code_generation_mode = 'selected_pattern',
      manual_code = false,
      external_code = NULL
    WHERE id = p_document_id
      AND org_id = v_org_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'selection_mode', 'selected_pattern',
    'requested_pattern_id', p_pattern_id
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_document_code_automatic(
  p_document_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_result JSONB;
  v_pattern_id UUID;
  v_mode TEXT;
BEGIN
  IF auth.uid() IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário e organização são obrigatórios para alocar o código.';
  END IF;

  v_result := public.allocate_document_code(
    p_document_id,
    p_doc_type,
    p_area,
    p_project_id,
    p_reference_date
  );

  IF NULLIF(v_result->>'pattern_id', '') IS NOT NULL THEN
    v_pattern_id := (v_result->>'pattern_id')::UUID;
  END IF;
  v_mode := CASE
    WHEN v_pattern_id IS NOT NULL THEN 'configured'
    ELSE 'legacy'
  END;

  IF COALESCE((v_result->>'success')::BOOLEAN, false) THEN
    UPDATE public.documents
    SET
      code_pattern_id = v_pattern_id,
      code_generation_mode = v_mode,
      manual_code = false,
      external_code = NULL
    WHERE id = p_document_id
      AND org_id = v_org_id;
  END IF;

  RETURN v_result || jsonb_build_object(
    'selection_mode', 'automatic',
    'recorded_generation_mode', v_mode
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.assign_manual_document_code(
  p_document_id UUID,
  p_code TEXT,
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
  v_document public.documents%ROWTYPE;
  v_code TEXT := NULLIF(BTRIM(p_code), '');
BEGIN
  IF v_actor_id IS NULL OR v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário e organização são obrigatórios para definir código manual.';
  END IF;
  IF v_code IS NULL OR LENGTH(v_code) > 160 OR v_code ~ '[[:cntrl:]]' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe um código manual válido com até 160 caracteres e sem caracteres de controle.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_reason, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe o motivo para usar código manual ou legado.';
  END IF;

  SELECT *
  INTO v_document
  FROM public.documents
  WHERE id = p_document_id
    AND org_id = v_org_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Documento não encontrado na organização atual.';
  END IF;
  IF v_document.author_id <> v_actor_id
     AND NOT public.is_org_role(ARRAY['admin', 'manager']) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Somente o autor, administrador ou gestor pode definir código manual.';
  END IF;
  IF v_document.status <> 'draft' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Código manual só pode ser definido durante a criação do rascunho.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(v_org_id::TEXT || ':manual-code:' || UPPER(v_code), 0)
  );

  IF EXISTS (
    SELECT 1
    FROM public.documents
    WHERE org_id = v_org_id
      AND UPPER(code) = UPPER(v_code)
      AND id <> p_document_id
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23505',
      MESSAGE = 'Este código já está sendo usado por outro documento da organização.';
  END IF;

  UPDATE public.documents
  SET
    code = v_code,
    external_code = v_code,
    manual_code = true,
    code_pattern_id = NULL,
    code_generation_mode = 'manual'
  WHERE id = p_document_id
    AND org_id = v_org_id;

  INSERT INTO public.document_code_events (
    org_id,
    document_id,
    generated_code,
    mode,
    metadata,
    created_by
  ) VALUES (
    v_org_id,
    p_document_id,
    v_code,
    'manual',
    jsonb_build_object(
      'reason', BTRIM(p_reason),
      'previous_code', v_document.code,
      'source', 'document_creation'
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'manual',
    'code', v_code,
    'previous_code', v_document.code,
    'pattern_id', NULL
  );
END;
$$;

REVOKE ALL ON FUNCTION public.document_code_pattern_is_applicable(
  UUID, UUID, TEXT, TEXT, UUID
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.preview_document_code_for_pattern(
  UUID, TEXT, TEXT, UUID, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_document_code_for_pattern(
  UUID, TEXT, TEXT, UUID, DATE
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.allocate_document_code_for_pattern(
  UUID, UUID, TEXT, TEXT, UUID, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code_for_pattern(
  UUID, UUID, TEXT, TEXT, UUID, DATE
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.allocate_document_code_automatic(
  UUID, TEXT, TEXT, UUID, DATE
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code_automatic(
  UUID, TEXT, TEXT, UUID, DATE
) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.assign_manual_document_code(UUID, TEXT, TEXT)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assign_manual_document_code(UUID, TEXT, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
