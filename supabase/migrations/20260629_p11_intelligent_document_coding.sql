-- TRAMITA P-11 — Codificação Documental Inteligente
-- Padrões configuráveis, preview e alocação concorrente segura.
-- Aplicação exclusivamente manual após revisão no Supabase SQL Editor.
-- O trigger legado generate_document_code() é preservado como fallback.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.document_code_patterns (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  description      TEXT,
  is_active        BOOLEAN NOT NULL DEFAULT true,
  is_default       BOOLEAN NOT NULL DEFAULT false,
  priority         INTEGER NOT NULL DEFAULT 100,
  pattern_scope    TEXT NOT NULL DEFAULT 'organization',
  doc_type         TEXT,
  area             TEXT,
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  prefix           TEXT NOT NULL DEFAULT 'TR',
  pattern          TEXT NOT NULL,
  separator        TEXT NOT NULL DEFAULT '-',
  sequence_padding INTEGER NOT NULL DEFAULT 4,
  sequence_reset   TEXT NOT NULL DEFAULT 'never',
  sequence_start   INTEGER NOT NULL DEFAULT 1,
  include_year     BOOLEAN NOT NULL DEFAULT false,
  include_month    BOOLEAN NOT NULL DEFAULT false,
  tokens           JSONB NOT NULL DEFAULT '[]'::JSONB,
  example_output   TEXT,
  created_by       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_code_patterns_scope_check
    CHECK (pattern_scope IN ('organization', 'project', 'area', 'type', 'area_type')),
  CONSTRAINT document_code_patterns_reset_check
    CHECK (sequence_reset IN ('never', 'yearly', 'monthly', 'project', 'area', 'type', 'area_type')),
  CONSTRAINT document_code_patterns_padding_check
    CHECK (sequence_padding BETWEEN 2 AND 8),
  CONSTRAINT document_code_patterns_start_check
    CHECK (sequence_start >= 0),
  CONSTRAINT document_code_patterns_priority_check
    CHECK (priority >= 0),
  CONSTRAINT document_code_patterns_pattern_check
    CHECK (LENGTH(BTRIM(pattern)) > 0),
  CONSTRAINT document_code_patterns_sequence_token_check
    CHECK (POSITION('{SEQ}' IN UPPER(pattern)) > 0),
  CONSTRAINT document_code_patterns_tokens_check
    CHECK (jsonb_typeof(tokens) IN ('array', 'object'))
);

CREATE TABLE IF NOT EXISTS public.document_code_sequences (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id       UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  pattern_id   UUID NOT NULL REFERENCES public.document_code_patterns(id) ON DELETE CASCADE,
  sequence_key TEXT NOT NULL,
  last_number  INTEGER NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_code_sequences_number_check CHECK (last_number >= 0),
  CONSTRAINT document_code_sequences_org_pattern_key
    UNIQUE (org_id, pattern_id, sequence_key)
);

CREATE TABLE IF NOT EXISTS public.document_code_events (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id     UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  pattern_id      UUID REFERENCES public.document_code_patterns(id) ON DELETE SET NULL,
  generated_code  TEXT NOT NULL,
  sequence_key    TEXT,
  sequence_number INTEGER,
  mode            TEXT NOT NULL DEFAULT 'allocated',
  metadata        JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by      UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_code_events_mode_check
    CHECK (mode IN ('preview', 'allocated', 'legacy', 'manual', 'repair')),
  CONSTRAINT document_code_events_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_document_code_patterns_org_active
  ON public.document_code_patterns(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_document_code_patterns_org_context
  ON public.document_code_patterns(org_id, doc_type, area, project_id);
CREATE INDEX IF NOT EXISTS idx_document_code_patterns_org_priority
  ON public.document_code_patterns(org_id, priority);
CREATE INDEX IF NOT EXISTS idx_document_code_sequences_lookup
  ON public.document_code_sequences(org_id, pattern_id, sequence_key);
CREATE INDEX IF NOT EXISTS idx_document_code_events_document
  ON public.document_code_events(org_id, document_id);
CREATE INDEX IF NOT EXISTS idx_document_code_events_code
  ON public.document_code_events(generated_code);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS document_code_patterns_updated_at ON public.document_code_patterns';
    EXECUTE '
      CREATE TRIGGER document_code_patterns_updated_at
      BEFORE UPDATE ON public.document_code_patterns
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';

    EXECUTE 'DROP TRIGGER IF EXISTS document_code_sequences_updated_at ON public.document_code_sequences';
    EXECUTE '
      CREATE TRIGGER document_code_sequences_updated_at
      BEFORE UPDATE ON public.document_code_sequences
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END;
$$;

ALTER TABLE public.document_code_patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_code_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_code_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_code_patterns_select_org"
  ON public.document_code_patterns;
CREATE POLICY "document_code_patterns_select_org"
  ON public.document_code_patterns
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_code_patterns_insert_manager"
  ON public.document_code_patterns;
CREATE POLICY "document_code_patterns_insert_manager"
  ON public.document_code_patterns
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_code_patterns_update_manager"
  ON public.document_code_patterns;
CREATE POLICY "document_code_patterns_update_manager"
  ON public.document_code_patterns
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_code_patterns_delete_manager"
  ON public.document_code_patterns;
CREATE POLICY "document_code_patterns_delete_manager"
  ON public.document_code_patterns
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_code_sequences_select_manager"
  ON public.document_code_sequences;
CREATE POLICY "document_code_sequences_select_manager"
  ON public.document_code_sequences
  FOR SELECT TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_code_events_select_org"
  ON public.document_code_events;
CREATE POLICY "document_code_events_select_org"
  ON public.document_code_events
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_code_patterns TO authenticated;
GRANT SELECT ON public.document_code_sequences TO authenticated;
GRANT SELECT ON public.document_code_events TO authenticated;

GRANT ALL ON public.document_code_patterns TO service_role;
GRANT ALL ON public.document_code_sequences TO service_role;
GRANT ALL ON public.document_code_events TO service_role;

-- Preserva o contrato e o formato legado, eliminando a corrida MAX+1
-- entre inserts simultâneos do mesmo contexto.
CREATE OR REPLACE FUNCTION public.generate_document_code()
RETURNS TRIGGER
LANGUAGE PLPGSQL
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_seq INTEGER;
BEGIN
  IF NEW.code IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT code_prefix INTO v_prefix
  FROM public.organizations
  WHERE id = NEW.org_id;

  IF v_prefix IS NULL THEN
    RAISE EXCEPTION 'Cannot generate document code: organization % was not found', NEW.org_id;
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended(
      NEW.org_id::TEXT || ':' || UPPER(NEW.area) || ':' || UPPER(NEW.doc_type),
      0
    )
  );

  SELECT COALESCE(MAX(SUBSTRING(code FROM '([0-9]+)$')::INTEGER), 0) + 1
  INTO v_seq
  FROM public.documents
  WHERE org_id = NEW.org_id
    AND UPPER(area) = UPPER(NEW.area)
    AND UPPER(doc_type) = UPPER(NEW.doc_type)
    AND code LIKE v_prefix || '-' || NEW.area || '-' || NEW.doc_type || '-%'
    AND code ~ '[0-9]+$';

  NEW.code :=
    v_prefix
    || '-'
    || NEW.area
    || '-'
    || NEW.doc_type
    || '-'
    || CASE
      WHEN LENGTH(v_seq::TEXT) >= 4 THEN v_seq::TEXT
      ELSE LPAD(v_seq::TEXT, 4, '0')
    END;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.normalize_document_code_token(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT UPPER(
    REGEXP_REPLACE(
      TRANSLATE(
        COALESCE(p_value, ''),
        'áàâãäéèêëíìîïóòôõöúùûüçñÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
        'aaaaaeeeeiiiiooooouuuucnAAAAAEEEEIIIIOOOOOUUUUCN'
      ),
      '[^A-Za-z0-9]+',
      '',
      'g'
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.resolve_document_code_pattern(
  p_org_id UUID,
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS SETOF public.document_code_patterns
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT pattern.*
  FROM public.document_code_patterns AS pattern
  WHERE pattern.org_id = p_org_id
    AND pattern.is_active = true
    AND (pattern.project_id IS NULL OR pattern.project_id = p_project_id)
    AND (pattern.doc_type IS NULL OR UPPER(pattern.doc_type) = UPPER(p_doc_type))
    AND (pattern.area IS NULL OR UPPER(pattern.area) = UPPER(p_area))
    AND (pattern.pattern_scope <> 'project' OR pattern.project_id IS NOT NULL)
    AND (pattern.pattern_scope <> 'type' OR pattern.doc_type IS NOT NULL)
    AND (pattern.pattern_scope <> 'area' OR pattern.area IS NOT NULL)
    AND (
      pattern.pattern_scope <> 'area_type'
      OR (pattern.doc_type IS NOT NULL AND pattern.area IS NOT NULL)
    )
  ORDER BY
    pattern.priority ASC,
    (
      CASE WHEN pattern.project_id = p_project_id AND p_project_id IS NOT NULL THEN 8 ELSE 0 END
      + CASE WHEN pattern.doc_type IS NOT NULL AND pattern.area IS NOT NULL THEN 4 ELSE 0 END
      + CASE WHEN pattern.doc_type IS NOT NULL THEN 2 ELSE 0 END
      + CASE WHEN pattern.area IS NOT NULL THEN 1 ELSE 0 END
    ) DESC,
    pattern.is_default DESC,
    pattern.created_at ASC,
    pattern.id ASC
  LIMIT 1
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
LANGUAGE PLPGSQL
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

  IF v_code ~ '\{[A-Za-z_]+\}' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'O padrão contém tokens não reconhecidos.';
  END IF;

  RETURN UPPER(BTRIM(v_code));
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_document_code(
  p_doc_type TEXT,
  p_area TEXT,
  p_project_id UUID DEFAULT NULL,
  p_reference_date DATE DEFAULT CURRENT_DATE
)
RETURNS JSONB
LANGUAGE PLPGSQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_id UUID := auth.uid();
  v_org_id UUID;
  v_org_code TEXT;
  v_project_code TEXT;
  v_pattern public.document_code_patterns%ROWTYPE;
  v_sequence_key TEXT;
  v_next_number INTEGER;
  v_code TEXT;
BEGIN
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário autenticado é obrigatório para prever o código.';
  END IF;

  v_org_id := public.current_user_org_id();
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil sem organização para prever o código documental.';
  END IF;

  IF NULLIF(BTRIM(p_doc_type), '') IS NULL OR NULLIF(BTRIM(p_area), '') IS NULL THEN
    RETURN jsonb_build_object(
      'available', false,
      'mode', 'legacy_fallback',
      'code', NULL,
      'explanation', jsonb_build_array('Defina tipo e área para visualizar o código previsto.')
    );
  END IF;

  SELECT code_prefix INTO v_org_code
  FROM public.organizations
  WHERE id = v_org_id;

  IF p_project_id IS NOT NULL THEN
    SELECT code INTO v_project_code
    FROM public.projects
    WHERE id = p_project_id
      AND org_id = v_org_id;

    IF v_project_code IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Projeto não encontrado na organização atual.';
    END IF;
  END IF;

  SELECT * INTO v_pattern
  FROM public.resolve_document_code_pattern(v_org_id, p_doc_type, p_area, p_project_id);

  IF v_pattern.id IS NULL THEN
    SELECT COALESCE(MAX(SUBSTRING(code FROM '([0-9]+)$')::INTEGER), 0) + 1
    INTO v_next_number
    FROM public.documents
    WHERE org_id = v_org_id
      AND UPPER(doc_type) = UPPER(p_doc_type)
      AND UPPER(area) = UPPER(p_area)
      AND code LIKE v_org_code || '-' || p_area || '-' || p_doc_type || '-%'
      AND code ~ '[0-9]+$';

    v_code :=
      public.normalize_document_code_token(v_org_code)
      || '-'
      || public.normalize_document_code_token(p_area)
      || '-'
      || public.normalize_document_code_token(p_doc_type)
      || '-'
      || CASE
        WHEN LENGTH(v_next_number::TEXT) >= 4 THEN v_next_number::TEXT
        ELSE LPAD(v_next_number::TEXT, 4, '0')
      END;

    RETURN jsonb_build_object(
      'available', true,
      'mode', 'legacy_fallback',
      'pattern_id', NULL,
      'pattern_name', 'Padrão legado',
      'code', v_code,
      'sequence_key', UPPER(p_area) || ':' || UPPER(p_doc_type),
      'next_number', v_next_number,
      'tokens', jsonb_build_object(
        'ORG', v_org_code,
        'AREA', UPPER(p_area),
        'TYPE', UPPER(p_doc_type),
        'SEQ', v_next_number
      ),
      'explanation', jsonb_build_array(
        'Nenhum padrão P-11 corresponde ao contexto.',
        'Preview baseado no trigger legado; o número final é definido no insert.'
      )
    );
  END IF;

  v_sequence_key := CASE v_pattern.sequence_reset
    WHEN 'yearly' THEN 'year:' || TO_CHAR(p_reference_date, 'YYYY')
    WHEN 'monthly' THEN 'month:' || TO_CHAR(p_reference_date, 'YYYY-MM')
    WHEN 'project' THEN 'project:' || COALESCE(p_project_id::TEXT, 'none')
    WHEN 'area' THEN 'area:' || UPPER(p_area)
    WHEN 'type' THEN 'type:' || UPPER(p_doc_type)
    WHEN 'area_type' THEN 'area:' || UPPER(p_area) || '|type:' || UPPER(p_doc_type)
    ELSE 'global'
  END;

  SELECT COALESCE(sequence.last_number + 1, v_pattern.sequence_start)
  INTO v_next_number
  FROM (SELECT 1) AS seed
  LEFT JOIN public.document_code_sequences AS sequence
    ON sequence.org_id = v_org_id
   AND sequence.pattern_id = v_pattern.id
   AND sequence.sequence_key = v_sequence_key;

  v_code := public.render_document_code_pattern(
    v_pattern,
    p_doc_type,
    p_area,
    v_project_code,
    v_org_code,
    p_reference_date,
    v_next_number
  );

  RETURN jsonb_build_object(
    'available', true,
    'mode', 'configured',
    'pattern_id', v_pattern.id,
    'pattern_name', v_pattern.name,
    'code', v_code,
    'sequence_key', v_sequence_key,
    'next_number', v_next_number,
    'tokens', jsonb_build_object(
      'PREFIX', v_pattern.prefix,
      'ORG', v_org_code,
      'PROJECT', v_project_code,
      'AREA', UPPER(p_area),
      'TYPE', UPPER(p_doc_type),
      'YEAR', TO_CHAR(p_reference_date, 'YYYY'),
      'MONTH', TO_CHAR(p_reference_date, 'MM'),
      'SEQ', v_next_number
    ),
    'explanation', jsonb_build_array(
      'Padrão "' || v_pattern.name || '" selecionado por prioridade e contexto.',
      'O preview não reserva o número; criações concorrentes podem alterar o código final.'
    )
  );
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
  v_document public.documents%ROWTYPE;
  v_pattern public.document_code_patterns%ROWTYPE;
  v_existing_event public.document_code_events%ROWTYPE;
  v_sequence_key TEXT;
  v_sequence_number INTEGER;
  v_generated_code TEXT;
  v_legacy_regex TEXT;
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
      'idempotent', true
    );
  END IF;

  SELECT code_prefix INTO v_org_code
  FROM public.organizations
  WHERE id = v_org_id;

  IF p_project_id IS NOT NULL THEN
    SELECT code INTO v_project_code
    FROM public.projects
    WHERE id = p_project_id
      AND org_id = v_org_id;

    IF v_project_code IS NULL THEN
      RAISE EXCEPTION USING
        ERRCODE = '42501',
        MESSAGE = 'Projeto não encontrado na organização atual.';
    END IF;
  END IF;

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
      'sequence_number', NULL
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
      'sequence_number', NULL
    );
  END IF;

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

  v_generated_code := public.render_document_code_pattern(
    v_pattern,
    p_doc_type,
    p_area,
    v_project_code,
    v_org_code,
    p_reference_date,
    v_sequence_number
  );

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
      'project_id', p_project_id
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
    'previous_code', v_document.code,
    'idempotent', false
  );
END;
$$;

REVOKE ALL ON FUNCTION public.resolve_document_code_pattern(UUID, TEXT, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.render_document_code_pattern(
  public.document_code_patterns,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  DATE,
  INTEGER
) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.normalize_document_code_token(TEXT) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.preview_document_code(TEXT, TEXT, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_document_code(TEXT, TEXT, UUID, DATE)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.allocate_document_code(UUID, TEXT, TEXT, UUID, DATE)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
