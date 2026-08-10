BEGIN;

ALTER TABLE IF EXISTS public.document_code_patterns
  DROP CONSTRAINT IF EXISTS document_code_patterns_known_tokens_check;

ALTER TABLE IF EXISTS public.document_code_patterns
  ADD CONSTRAINT document_code_patterns_known_tokens_check
  CHECK (
    REGEXP_REPLACE(
      UPPER(pattern),
      '\{(PREFIX|AREA|DISCIPLINE|TYPE|PROJECT|YEAR|YEAR2|MONTH|SEQ|ORG|CUSTOM)\}',
      '',
      'g'
    ) !~ '[{}]'
  );

CREATE OR REPLACE FUNCTION public.resolve_document_discipline_code(
  p_discipline_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
BEGIN
  IF p_discipline_id IS NULL OR to_regclass('public.disciplines') IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COALESCE(
    NULLIF(BTRIM(code), ''),
    NULLIF(BTRIM(name), ''),
    'DISC' || UPPER(SUBSTRING(REPLACE(p_discipline_id::TEXT, '-', '') FROM 1 FOR 6))
  )
  INTO v_code
  FROM public.disciplines
  WHERE id = p_discipline_id;

  RETURN v_code;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_document_discipline_from_metadata()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_row JSONB;
  v_metadata JSONB;
  v_discipline_text TEXT;
BEGIN
  IF NEW.discipline_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_row := to_jsonb(NEW);
  v_metadata := CASE
    WHEN jsonb_typeof(v_row->'metadata') = 'object' THEN v_row->'metadata'
    ELSE '{}'::JSONB
  END;

  v_discipline_text := NULLIF(
    BTRIM(
      COALESCE(
        v_metadata->'creation_context'->'document_register'->>'discipline_id',
        v_metadata->'document_register'->>'discipline_id',
        ''
      )
    ),
    ''
  );

  IF v_discipline_text IS NULL THEN
    RETURN NEW;
  END IF;

  BEGIN
    NEW.discipline_id := v_discipline_text::UUID;
  EXCEPTION
    WHEN invalid_text_representation THEN
      NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS documents_sync_discipline_from_metadata
  ON public.documents;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'documents'
      AND column_name = 'metadata'
  ) THEN
    EXECUTE '
      CREATE TRIGGER documents_sync_discipline_from_metadata
      BEFORE INSERT OR UPDATE OF metadata, discipline_id
      ON public.documents
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_document_discipline_from_metadata()
    ';
  ELSE
    EXECUTE '
      CREATE TRIGGER documents_sync_discipline_from_metadata
      BEFORE INSERT OR UPDATE OF discipline_id
      ON public.documents
      FOR EACH ROW
      EXECUTE FUNCTION public.sync_document_discipline_from_metadata()
    ';
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
STABLE
SET search_path = public
AS $$
DECLARE
  v_code TEXT;
  v_custom TEXT := '';
  v_discipline TEXT := NULLIF(
    current_setting('tramita.selected_discipline_code', true),
    ''
  );
BEGIN
  IF jsonb_typeof(p_pattern.tokens) = 'object' THEN
    v_custom := COALESCE(p_pattern.tokens->>'custom', '');
  END IF;

  v_code := UPPER(p_pattern.pattern);
  v_code := REPLACE(v_code, '{PREFIX}', public.normalize_document_code_token(p_pattern.prefix));
  v_code := REPLACE(v_code, '{AREA}', public.normalize_document_code_token(p_area));
  v_code := REPLACE(v_code, '{DISCIPLINE}', public.normalize_document_code_token(v_discipline));
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
      HINT = 'Use somente {PREFIX}, {AREA}, {DISCIPLINE}, {TYPE}, {PROJECT}, {YEAR}, {YEAR2}, {MONTH}, {SEQ}, {ORG} e {CUSTOM}.';
  END IF;

  RETURN UPPER(BTRIM(v_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_document_code(
  p_document_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE PLPGSQL
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_actor_role TEXT;
  v_org_id UUID;
  v_org_code TEXT;
  v_project_code TEXT;
  v_discipline_code TEXT;
  v_document public.documents%ROWTYPE;
  v_pattern public.document_code_patterns%ROWTYPE;
  v_existing_event public.document_code_events%ROWTYPE;
  v_sequence_key TEXT;
  v_sequence_number INTEGER;
  v_generated_code TEXT;
  v_legacy_regex TEXT;
  v_code_in_use BOOLEAN := false;
  v_collision_skips INTEGER := 0;
  v_skipped_codes JSONB := '[]'::JSONB;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário autenticado é obrigatório para alocar o código.';
  END IF;

  v_org_id := public.current_user_org_id();
  v_actor_role := public.current_user_role();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil sem organização para alocar o código documental.';
  END IF;

  SELECT * INTO v_document
  FROM public.documents
  WHERE id = p_document_id
  FOR UPDATE;

  IF v_document.id IS NULL OR v_document.org_id <> v_org_id THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Documento não encontrado na organização atual.';
  END IF;

  IF v_document.author_id <> v_actor_id
    AND COALESCE(v_actor_role, '') NOT IN ('admin', 'manager')
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Somente o autor, administrador ou gestor pode alocar o código.';
  END IF;

  IF UPPER(v_document.doc_type) <> UPPER(p_doc_type)
    OR UPPER(v_document.area) <> UPPER(p_area)
    OR v_document.project_id IS DISTINCT FROM p_project_id
  THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O contexto informado não corresponde ao documento persistido.';
  END IF;

  SELECT * INTO v_existing_event
  FROM public.document_code_events
  WHERE document_id = p_document_id
    AND org_id = v_org_id
    AND mode IN ('allocated', 'legacy', 'manual')
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_event.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'mode', CASE v_existing_event.mode
        WHEN 'allocated' THEN 'configured'
        WHEN 'legacy' THEN 'legacy_fallback'
        ELSE 'manual'
      END,
      'code', v_existing_event.generated_code,
      'pattern_id', v_existing_event.pattern_id,
      'sequence_key', v_existing_event.sequence_key,
      'sequence_number', v_existing_event.sequence_number,
      'collision_warning', COALESCE(
        (v_existing_event.metadata->>'collision_warning')::BOOLEAN,
        false
      ),
      'collision_skips', COALESCE(
        (v_existing_event.metadata->>'collision_skips')::INTEGER,
        0
      ),
      'idempotent', true
    );
  END IF;

  SELECT code_prefix INTO v_org_code
  FROM public.organizations
  WHERE id = v_org_id;

  IF p_project_id IS NOT NULL THEN
    v_project_code := public.resolve_document_project_code(
      p_project_id,
      v_org_id
    );
  END IF;

  v_discipline_code := public.resolve_document_discipline_code(
    v_document.discipline_id
  );
  PERFORM set_config(
    'tramita.selected_discipline_code',
    COALESCE(v_discipline_code, ''),
    true
  );

  SELECT * INTO v_pattern
  FROM public.resolve_document_code_pattern(v_org_id, p_doc_type, p_area, p_project_id);

  IF v_pattern.id IS NULL THEN
    INSERT INTO public.document_code_events (
      org_id,
      document_id,
      generated_code,
      sequence_key,
      mode,
      metadata,
      created_by
    ) VALUES (
      v_org_id,
      p_document_id,
      v_document.code,
      UPPER(p_area) || ':' || UPPER(p_doc_type),
      'legacy',
      jsonb_build_object('reason', 'Nenhum padrão P-11 aplicável; código legado preservado.'),
      v_actor_id
    );

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'legacy_fallback',
      'code', v_document.code,
      'pattern_id', NULL,
      'sequence_key', UPPER(p_area) || ':' || UPPER(p_doc_type),
      'sequence_number', NULL,
      'collision_warning', false,
      'collision_skips', 0
    );
  END IF;

  v_legacy_regex :=
    '^'
    || public.normalize_document_code_token(v_org_code)
    || '-'
    || public.normalize_document_code_token(p_area)
    || '-'
    || public.normalize_document_code_token(p_doc_type)
    || '-[0-9]+$';

  IF v_document.code IS NOT NULL AND v_document.code !~ v_legacy_regex THEN
    INSERT INTO public.document_code_events (
      org_id,
      document_id,
      pattern_id,
      generated_code,
      mode,
      metadata,
      created_by
    ) VALUES (
      v_org_id,
      p_document_id,
      v_pattern.id,
      v_document.code,
      'manual',
      jsonb_build_object('reason', 'Código existente não corresponde ao fallback legado e foi preservado.'),
      v_actor_id
    );

    RETURN jsonb_build_object(
      'success', true,
      'mode', 'manual',
      'code', v_document.code,
      'pattern_id', v_pattern.id,
      'sequence_key', NULL,
      'sequence_number', NULL,
      'collision_warning', false,
      'collision_skips', 0
    );
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      v_org_id::TEXT || ':' || UPPER(p_area) || ':' || UPPER(p_doc_type),
      0
    )
  );

  v_sequence_key := CASE v_pattern.sequence_reset
    WHEN 'yearly' THEN 'year:' || TO_CHAR(p_reference_date, 'YYYY')
    WHEN 'monthly' THEN 'month:' || TO_CHAR(p_reference_date, 'YYYY-MM')
    WHEN 'project' THEN 'project:' || COALESCE(p_project_id::TEXT, 'none')
    WHEN 'area' THEN 'area:' || UPPER(p_area)
    WHEN 'type' THEN 'type:' || UPPER(p_doc_type)
    WHEN 'area_type' THEN 'area:' || UPPER(p_area) || '|type:' || UPPER(p_doc_type)
    ELSE 'global'
  END;

  INSERT INTO public.document_code_sequences (
    org_id,
    pattern_id,
    sequence_key,
    last_number
  ) VALUES (
    v_org_id,
    v_pattern.id,
    v_sequence_key,
    v_pattern.sequence_start
  )
  ON CONFLICT (org_id, pattern_id, sequence_key)
  DO UPDATE SET
    last_number = public.document_code_sequences.last_number + 1,
    updated_at = NOW()
  RETURNING last_number INTO v_sequence_number;

  LOOP
    v_generated_code := public.render_document_code_pattern(
      v_pattern,
      p_doc_type,
      p_area,
      v_project_code,
      v_org_code,
      p_reference_date,
      v_sequence_number
    );

    PERFORM pg_advisory_xact_lock(
      hashtextextended(
        v_org_id::TEXT || ':document-code:' || v_generated_code,
        0
      )
    );

    SELECT EXISTS (
      SELECT 1
      FROM public.documents
      WHERE org_id = v_org_id
        AND code = v_generated_code
        AND id <> p_document_id
    ) INTO v_code_in_use;

    EXIT WHEN NOT v_code_in_use;

    v_collision_skips := v_collision_skips + 1;
    v_skipped_codes := v_skipped_codes || jsonb_build_array(v_generated_code);

    IF v_collision_skips > 100000 THEN
      RAISE EXCEPTION USING
        ERRCODE = '54000',
        MESSAGE = 'Não foi possível encontrar um código documental livre.',
        HINT = 'Revise o padrão, a chave de sequência e os códigos existentes.';
    END IF;

    UPDATE public.document_code_sequences
    SET
      last_number = last_number + 1,
      updated_at = NOW()
    WHERE org_id = v_org_id
      AND pattern_id = v_pattern.id
      AND sequence_key = v_sequence_key
    RETURNING last_number INTO v_sequence_number;
  END LOOP;

  UPDATE public.documents
  SET code = v_generated_code
  WHERE id = p_document_id
    AND org_id = v_org_id;

  INSERT INTO public.document_code_events (
    org_id,
    document_id,
    pattern_id,
    generated_code,
    sequence_key,
    sequence_number,
    mode,
    metadata,
    created_by
  ) VALUES (
    v_org_id,
    p_document_id,
    v_pattern.id,
    v_generated_code,
    v_sequence_key,
    v_sequence_number,
    'allocated',
    jsonb_build_object(
      'pattern_name', v_pattern.name,
      'previous_code', v_document.code,
      'doc_type', UPPER(p_doc_type),
      'area', UPPER(p_area),
      'discipline', v_discipline_code,
      'project_id', p_project_id,
      'collision_warning', v_collision_skips > 0,
      'collision_skips', v_collision_skips,
      'skipped_codes', v_skipped_codes
    ),
    v_actor_id
  );

  RETURN jsonb_build_object(
    'success', true,
    'mode', 'configured',
    'code', v_generated_code,
    'pattern_id', v_pattern.id,
    'pattern_name', v_pattern.name,
    'sequence_key', v_sequence_key,
    'sequence_number', v_sequence_number,
    'collision_warning', v_collision_skips > 0,
    'collision_skips', v_collision_skips,
    'skipped_codes', v_skipped_codes,
    'previous_code', v_document.code,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_document_discipline_code(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.resolve_document_discipline_code(UUID)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.render_document_code_pattern(
  public.document_code_patterns,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  INTEGER
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.render_document_code_pattern(
  public.document_code_patterns,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  INTEGER
) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
