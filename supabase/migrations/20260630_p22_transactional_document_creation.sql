-- TRAMITA P-22
-- 20_TRAMITA_transactional_document_creation
-- Criação documental transacional após upload prévio no Storage.

BEGIN;

CREATE OR REPLACE FUNCTION public.document_creation_column_exists(
  p_table_name TEXT,
  p_column_name TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = p_table_name
      AND column_name = p_column_name
  );
$$;

CREATE OR REPLACE FUNCTION public.document_creation_audit_supports_contract()
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_supported BOOLEAN := false;
BEGIN
  IF to_regclass('public.audit_trail') IS NULL THEN
    RETURN false;
  END IF;

  SELECT
    COUNT(DISTINCT column_name) = 5
    AND BOOL_AND(
      CASE
        WHEN column_name = 'metadata' THEN data_type IN ('json', 'jsonb')
        ELSE true
      END
    )
  INTO v_supported
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'audit_trail'
    AND column_name IN (
      'document_id', 'org_id', 'user_id', 'action', 'metadata'
    );

  IF NOT COALESCE(v_supported, false) THEN
    RETURN false;
  END IF;

  SELECT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'audit_trail'
      AND is_nullable = 'NO'
      AND column_default IS NULL
      AND is_identity = 'NO'
      AND is_generated = 'NEVER'
      AND column_name NOT IN (
        'document_id', 'org_id', 'user_id', 'action', 'metadata', 'new_status'
      )
  )
  INTO v_supported;

  RETURN COALESCE(v_supported, false);
EXCEPTION
  WHEN OTHERS THEN
    RETURN false;
END;
$$;

CREATE OR REPLACE FUNCTION public.create_document_transactional(
  p_title TEXT,
  p_description TEXT,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_revision INTEGER DEFAULT 0,
  p_review_period_months INTEGER DEFAULT NULL,
  p_next_review_at DATE DEFAULT NULL,
  p_confidentiality TEXT DEFAULT NULL,
  p_external_reference TEXT DEFAULT NULL,
  p_source_system TEXT DEFAULT NULL,
  p_tags TEXT[] DEFAULT '{}'::TEXT[],
  p_file_metadata JSONB DEFAULT NULL,
  p_code_mode TEXT DEFAULT 'automatic',
  p_code_pattern_id UUID DEFAULT NULL,
  p_manual_code TEXT DEFAULT NULL,
  p_manual_code_reason TEXT DEFAULT NULL,
  p_creation_metadata JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID := public.current_user_org_id();
  v_document_id UUID;
  v_version_id UUID;
  v_code TEXT;
  v_code_mode TEXT := LOWER(COALESCE(NULLIF(BTRIM(p_code_mode), ''), 'automatic'));
  v_code_result JSONB := '{}'::JSONB;
  v_warnings JSONB := '[]'::JSONB;
  v_fallback_used BOOLEAN := false;
  v_project_valid BOOLEAN := false;
  v_has_required_document_contract BOOLEAN := false;
  v_has_version_contract BOOLEAN := false;
  v_document_payload JSONB;
  v_version_payload JSONB;
  v_audit_payload JSONB;
  v_document_metadata JSONB := '{}'::JSONB;
  v_creation_context JSONB := '{}'::JSONB;
  v_file_path TEXT;
  v_file_name TEXT;
  v_file_size BIGINT;
  v_file_hash TEXT;
  v_insert_columns TEXT;
  v_insert_values TEXT;
  v_sql TEXT;
  v_next_action TEXT := 'open_document_detail';
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário autenticado é obrigatório para criar documento.';
  END IF;
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'O usuário não possui organização válida para criar documento.';
  END IF;
  IF NOT public.is_org_role(
    ARRAY['admin', 'manager', 'approver', 'reviewer', 'author']
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Seu perfil não possui permissão para criar documentos.';
  END IF;

  IF NULLIF(BTRIM(COALESCE(p_title, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe o título do documento.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_doc_type, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe o tipo documental.';
  END IF;
  IF NULLIF(BTRIM(COALESCE(p_area, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe a área do documento.';
  END IF;
  IF p_revision IS NULL OR p_revision < 0 THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'A revisão inicial deve ser um número inteiro maior ou igual a zero.';
  END IF;
  IF p_review_period_months IS NOT NULL
     AND (p_review_period_months < 1 OR p_review_period_months > 1200) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O período de revisão deve estar entre 1 e 1200 meses.';
  END IF;
  IF v_code_mode NOT IN ('automatic', 'selected_pattern', 'manual') THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Modo de codificação inválido. Use automatic, selected_pattern ou manual.';
  END IF;
  IF v_code_mode = 'selected_pattern' AND p_code_pattern_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Escolha um padrão para usar codificação por padrão específico.';
  END IF;
  IF v_code_mode = 'manual'
     AND (
       NULLIF(BTRIM(COALESCE(p_manual_code, '')), '') IS NULL
       OR NULLIF(BTRIM(COALESCE(p_manual_code_reason, '')), '') IS NULL
     ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Código manual e justificativa são obrigatórios.';
  END IF;
  IF p_creation_metadata IS NULL
     OR jsonb_typeof(p_creation_metadata) <> 'object' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Os metadados de criação devem ser um objeto JSON válido.';
  END IF;

  SELECT COUNT(DISTINCT column_name) = 8
  INTO v_has_required_document_contract
  FROM information_schema.columns
  WHERE table_schema = 'public'
    AND table_name = 'documents'
    AND column_name IN (
      'id', 'org_id', 'code', 'title', 'doc_type', 'area', 'status', 'author_id'
    );

  IF NOT v_has_required_document_contract THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'A tabela documents não possui o contrato mínimo enterprise. Aplique os ciclos base antes do ciclo 20.';
  END IF;

  IF p_project_id IS NOT NULL THEN
    IF to_regclass('public.projects') IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'O projeto informado não pode ser validado porque o catálogo de projetos não existe.';
    END IF;

    IF public.document_creation_column_exists('projects', 'org_id') THEN
      EXECUTE
        'SELECT EXISTS (
           SELECT 1
           FROM public.projects
           WHERE id = $1
             AND (org_id = $2 OR org_id IS NULL)
         )'
      INTO v_project_valid
      USING p_project_id, v_org_id;
    ELSE
      EXECUTE
        'SELECT EXISTS (
           SELECT 1 FROM public.projects WHERE id = $1
         )'
      INTO v_project_valid
      USING p_project_id;
    END IF;

    IF NOT v_project_valid THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'O projeto informado não existe ou pertence a outra organização.';
    END IF;
  END IF;

  IF p_file_metadata IS NOT NULL THEN
    IF jsonb_typeof(p_file_metadata) <> 'object' THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'Os metadados do arquivo devem ser um objeto JSON válido.';
    END IF;

    v_file_path := NULLIF(BTRIM(p_file_metadata->>'file_path'), '');
    v_file_name := NULLIF(BTRIM(p_file_metadata->>'file_name'), '');
    v_file_hash := NULLIF(BTRIM(p_file_metadata->>'file_hash'), '');

    IF v_file_path IS NULL OR v_file_name IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '22023',
        MESSAGE = 'file_path e file_name são obrigatórios quando há arquivo enviado.';
    END IF;

    IF NULLIF(BTRIM(p_file_metadata->>'file_size'), '') IS NOT NULL THEN
      BEGIN
        v_file_size := (p_file_metadata->>'file_size')::BIGINT;
      EXCEPTION
        WHEN INVALID_TEXT_REPRESENTATION OR NUMERIC_VALUE_OUT_OF_RANGE THEN
          RAISE EXCEPTION USING
            ERRCODE = '22023',
            MESSAGE = 'file_size deve ser um número inteiro válido.';
      END;
      IF v_file_size < 0 THEN
        RAISE EXCEPTION USING
          ERRCODE = '22023',
          MESSAGE = 'file_size não pode ser negativo.';
      END IF;
    END IF;
  END IF;

  IF jsonb_typeof(p_creation_metadata->'document_metadata') = 'object' THEN
    v_document_metadata := p_creation_metadata->'document_metadata';
  END IF;
  v_creation_context := p_creation_metadata - 'document_metadata';
  IF v_creation_context <> '{}'::JSONB THEN
    v_document_metadata := v_document_metadata || jsonb_build_object(
      'creation_context', v_creation_context
    );
  END IF;

  v_document_payload := jsonb_strip_nulls(jsonb_build_object(
    'org_id', v_org_id,
    'title', BTRIM(p_title),
    'doc_type', UPPER(BTRIM(p_doc_type)),
    'area', UPPER(BTRIM(p_area)),
    'description', NULLIF(BTRIM(COALESCE(p_description, '')), ''),
    'project_id', p_project_id,
    'status', 'draft',
    'revision', p_revision,
    'author_id', v_actor_id,
    'created_by', v_actor_id,
    'review_period_months', p_review_period_months,
    'next_review_at', p_next_review_at,
    'confidentiality', NULLIF(BTRIM(COALESCE(p_confidentiality, '')), ''),
    'external_reference', NULLIF(BTRIM(COALESCE(p_external_reference, '')), ''),
    'source_system', NULLIF(BTRIM(COALESCE(p_source_system, '')), ''),
    'tags', to_jsonb(COALESCE(p_tags, '{}'::TEXT[])),
    'metadata', v_document_metadata,
    'file_path', v_file_path,
    'file_name', v_file_name,
    'file_size', v_file_size,
    'file_hash', v_file_hash
  ));

  IF p_project_id IS NOT NULL
     AND NOT public.document_creation_column_exists('documents', 'project_id') THEN
    v_warnings := v_warnings || jsonb_build_array(
      'O schema atual não possui documents.project_id; o vínculo com projeto não foi persistido.'
    );
    v_fallback_used := true;
  END IF;
  IF p_file_metadata IS NOT NULL
     AND NOT public.document_creation_column_exists('documents', 'file_path') THEN
    v_warnings := v_warnings || jsonb_build_array(
      'O schema atual não possui ponteiro de arquivo em documents; a versão inicial será a referência principal.'
    );
    v_fallback_used := true;
  END IF;

  SELECT
    STRING_AGG(FORMAT('%I', payload_key), ', ' ORDER BY payload_key),
    STRING_AGG(FORMAT('populated.%I', payload_key), ', ' ORDER BY payload_key)
  INTO v_insert_columns, v_insert_values
  FROM jsonb_object_keys(v_document_payload) AS payload(payload_key)
  JOIN information_schema.columns AS columns
    ON columns.table_schema = 'public'
   AND columns.table_name = 'documents'
   AND columns.column_name = payload.payload_key;

  v_sql := FORMAT(
    'INSERT INTO public.documents (%s)
     SELECT %s
     FROM jsonb_populate_record(NULL::public.documents, $1) AS populated
     RETURNING id, code',
    v_insert_columns,
    v_insert_values
  );
  EXECUTE v_sql
  INTO v_document_id, v_code
  USING v_document_payload;

  IF p_file_metadata IS NOT NULL THEN
    IF to_regclass('public.document_versions') IS NULL THEN
      v_warnings := v_warnings || jsonb_build_array(
        'document_versions não existe; o arquivo ficou registrado apenas no documento mestre.'
      );
      v_fallback_used := true;
    ELSE
      SELECT COUNT(DISTINCT column_name) = 4
      INTO v_has_version_contract
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'document_versions'
        AND column_name IN ('document_id', 'revision', 'file_path', 'file_name');

      IF NOT v_has_version_contract THEN
        v_warnings := v_warnings || jsonb_build_array(
          'document_versions não possui o contrato mínimo; a versão inicial não foi criada.'
        );
        v_fallback_used := true;
      ELSE
        v_version_payload := jsonb_strip_nulls(jsonb_build_object(
          'document_id', v_document_id,
          'org_id', v_org_id,
          'revision', p_revision,
          'file_path', v_file_path,
          'file_name', v_file_name,
          'file_size', v_file_size,
          'file_hash', v_file_hash,
          'uploaded_by', v_actor_id,
          'change_summary', 'Versão inicial',
          'status', 'draft',
          'change_reason', 'Criação inicial do documento',
          'metadata', jsonb_build_object(
            'creation_mode', COALESCE(p_creation_metadata->>'creation_mode', 'standard'),
            'source', COALESCE(p_creation_metadata->>'source', 'transactional_creation'),
            'initial_upload', true
          )
        ));

        SELECT
          STRING_AGG(FORMAT('%I', payload_key), ', ' ORDER BY payload_key),
          STRING_AGG(FORMAT('populated.%I', payload_key), ', ' ORDER BY payload_key)
        INTO v_insert_columns, v_insert_values
        FROM jsonb_object_keys(v_version_payload) AS payload(payload_key)
        JOIN information_schema.columns AS columns
          ON columns.table_schema = 'public'
         AND columns.table_name = 'document_versions'
         AND columns.column_name = payload.payload_key;

        v_sql := FORMAT(
          'INSERT INTO public.document_versions (%s)
           SELECT %s
           FROM jsonb_populate_record(
             NULL::public.document_versions, $1
           ) AS populated
           RETURNING id',
          v_insert_columns,
          v_insert_values
        );
        EXECUTE v_sql
        INTO v_version_id
        USING v_version_payload;
      END IF;
    END IF;
  END IF;

  IF p_file_metadata IS NOT NULL
     AND v_version_id IS NULL
     AND NOT public.document_creation_column_exists('documents', 'file_path') THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'O schema atual não oferece document_versions nem ponteiro de arquivo em documents. O upload não pode ser associado com segurança.';
  END IF;

  IF v_code_mode = 'manual' THEN
    IF to_regprocedure(
      'public.assign_manual_document_code(uuid,text,text)'
    ) IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'Código manual exige o ciclo 19 com assign_manual_document_code.';
    END IF;

    EXECUTE
      'SELECT public.assign_manual_document_code($1, $2, $3)'
    INTO v_code_result
    USING v_document_id, BTRIM(p_manual_code), BTRIM(p_manual_code_reason);
  ELSIF v_code_mode = 'selected_pattern' THEN
    IF to_regprocedure(
      'public.allocate_document_code_for_pattern(uuid,uuid,text,text,uuid,date)'
    ) IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '55000',
        MESSAGE = 'A escolha explícita de padrão exige o ciclo 19.';
    END IF;

    EXECUTE
      'SELECT public.allocate_document_code_for_pattern(
         $1, $2, $3, $4, $5, $6
       )'
    INTO v_code_result
    USING
      v_document_id,
      p_code_pattern_id,
      UPPER(BTRIM(p_doc_type)),
      UPPER(BTRIM(p_area)),
      p_project_id,
      CURRENT_DATE;
  ELSE
    IF to_regprocedure(
      'public.allocate_document_code_automatic(uuid,text,text,uuid,date)'
    ) IS NOT NULL THEN
      EXECUTE
        'SELECT public.allocate_document_code_automatic(
           $1, $2, $3, $4, $5
         )'
      INTO v_code_result
      USING
        v_document_id,
        UPPER(BTRIM(p_doc_type)),
        UPPER(BTRIM(p_area)),
        p_project_id,
        CURRENT_DATE;
    ELSE
      v_code_result := jsonb_build_object(
        'success', true,
        'mode', 'legacy_trigger',
        'code', v_code,
        'pattern_id', NULL
      );
      v_warnings := v_warnings || jsonb_build_array(
        'Alocação P-11/P-19 indisponível; o código foi gerado pelo gatilho legado.'
      );
      v_fallback_used := true;
    END IF;
  END IF;

  IF NOT COALESCE((v_code_result->>'success')::BOOLEAN, false) THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'A codificação não confirmou a criação do documento.';
  END IF;

  SELECT code
  INTO v_code
  FROM public.documents
  WHERE id = v_document_id
    AND org_id = v_org_id;

  IF NULLIF(BTRIM(COALESCE(v_code, '')), '') IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '55000',
      MESSAGE = 'Nenhum mecanismo de codificação produziu um código para o documento.';
  END IF;

  IF public.document_creation_audit_supports_contract() THEN
    v_audit_payload := jsonb_strip_nulls(jsonb_build_object(
      'document_id', v_document_id,
      'org_id', v_org_id,
      'user_id', v_actor_id,
      'action', 'created',
      'new_status', 'draft',
      'file_hash', v_file_hash,
      'metadata', p_creation_metadata || jsonb_build_object(
        'source', COALESCE(
          p_creation_metadata->>'source',
          'transactional_creation'
        ),
        'transactional_creation', true,
        'code_final', v_code,
        'code_pattern_id', COALESCE(
          v_code_result->'pattern_id',
          to_jsonb(p_code_pattern_id)
        ),
        'code_generation_mode', COALESCE(
          v_code_result->>'mode',
          v_code_mode
        ),
        'requested_code_mode', v_code_mode,
        'manual_code_reason', CASE
          WHEN v_code_mode = 'manual' THEN BTRIM(p_manual_code_reason)
          ELSE NULL
        END,
        'has_file', p_file_metadata IS NOT NULL,
        'file_hash', v_file_hash,
        'version_id', v_version_id
      )
    ));

    SELECT
      STRING_AGG(FORMAT('%I', payload_key), ', ' ORDER BY payload_key),
      STRING_AGG(FORMAT('populated.%I', payload_key), ', ' ORDER BY payload_key)
    INTO v_insert_columns, v_insert_values
    FROM jsonb_object_keys(v_audit_payload) AS payload(payload_key)
    JOIN information_schema.columns AS columns
      ON columns.table_schema = 'public'
     AND columns.table_name = 'audit_trail'
     AND columns.column_name = payload.payload_key;

    v_sql := FORMAT(
      'INSERT INTO public.audit_trail (%s)
       SELECT %s
       FROM jsonb_populate_record(NULL::public.audit_trail, $1) AS populated',
      v_insert_columns,
      v_insert_values
    );
    EXECUTE v_sql USING v_audit_payload;
  ELSE
    v_warnings := v_warnings || jsonb_build_array(
      'audit_trail não possui o contrato básico; o log complementar não foi registrado.'
    );
    v_fallback_used := true;
  END IF;

  IF NULLIF(
    p_creation_metadata->>'suggested_tramite_template_id',
    ''
  ) IS NOT NULL THEN
    v_next_action := 'review_suggested_tramite';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'document_id', v_document_id,
    'code', v_code,
    'code_result', v_code_result,
    'version_id', v_version_id,
    'warnings', v_warnings,
    'fallback_used', v_fallback_used,
    'next_action', v_next_action
  );
END;
$$;

REVOKE ALL ON FUNCTION public.document_creation_column_exists(TEXT, TEXT)
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_creation_audit_supports_contract()
  FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_document_transactional(
  TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, INTEGER, DATE, TEXT, TEXT, TEXT,
  TEXT[], JSONB, TEXT, UUID, TEXT, TEXT, JSONB
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_document_transactional(
  TEXT, TEXT, TEXT, TEXT, UUID, INTEGER, INTEGER, DATE, TEXT, TEXT, TEXT,
  TEXT[], JSONB, TEXT, UUID, TEXT, TEXT, JSONB
) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
