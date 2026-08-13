-- P-29 — OCR e Leitura Documental Base
-- Nome no Supabase SQL Editor: 29_TRAMITA_document_ocr_base
--
-- Camada aditiva de leitura técnica. As únicas escritas são nas tabelas
-- próprias de OCR. Não altera documentos, versões, revisões, trâmites,
-- evidências, aprovações, notificações, prazos, responsáveis ou status.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.document_ocr_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  document_version_id UUID,
  evidence_id UUID,
  source_table TEXT,
  source_id UUID,
  source_storage_bucket TEXT,
  source_storage_path TEXT,
  source_file_name TEXT,
  source_mime_type TEXT,
  source_size_bytes BIGINT,
  source_checksum TEXT,
  requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'queued',
  method TEXT NOT NULL DEFAULT 'unavailable',
  language_hint TEXT,
  page_count INTEGER,
  processed_page_count INTEGER NOT NULL DEFAULT 0,
  extracted_text_length INTEGER NOT NULL DEFAULT 0,
  average_confidence NUMERIC,
  started_at TIMESTAMPTZ,
  finished_at TIMESTAMPTZ,
  error_code TEXT,
  error_message TEXT,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  limitations JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_ocr_jobs_status_check
    CHECK (
      status IN (
        'queued',
        'processing',
        'completed',
        'completed_with_warnings',
        'partial',
        'failed',
        'canceled',
        'unsupported',
        'unavailable'
      )
    ),
  CONSTRAINT document_ocr_jobs_method_check
    CHECK (
      method IN (
        'text_layer',
        'browser_extraction',
        'manual_text',
        'external_ocr_placeholder',
        'unavailable'
      )
    ),
  CONSTRAINT document_ocr_jobs_source_table_check
    CHECK (
      source_table IS NULL
      OR source_table IN (
        'documents',
        'document_versions',
        'document_revisions',
        'document_tramite_instance_evidence',
        'storage'
      )
    ),
  CONSTRAINT document_ocr_jobs_page_count_check
    CHECK (page_count IS NULL OR page_count >= 0),
  CONSTRAINT document_ocr_jobs_processed_page_count_check
    CHECK (processed_page_count >= 0),
  CONSTRAINT document_ocr_jobs_extracted_text_length_check
    CHECK (extracted_text_length >= 0),
  CONSTRAINT document_ocr_jobs_average_confidence_check
    CHECK (
      average_confidence IS NULL
      OR (average_confidence >= 0 AND average_confidence <= 1)
    ),
  CONSTRAINT document_ocr_jobs_source_size_check
    CHECK (source_size_bytes IS NULL OR source_size_bytes >= 0),
  CONSTRAINT document_ocr_jobs_warnings_array
    CHECK (JSONB_TYPEOF(warnings) = 'array'),
  CONSTRAINT document_ocr_jobs_limitations_array
    CHECK (JSONB_TYPEOF(limitations) = 'array'),
  CONSTRAINT document_ocr_jobs_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object'),
  CONSTRAINT document_ocr_jobs_storage_path_safe
    CHECK (
      source_storage_path IS NULL
      OR (
        LENGTH(source_storage_path) <= 1024
        AND source_storage_path !~ '[[:cntrl:]]'
        AND source_storage_path NOT LIKE '/%'
        AND source_storage_path NOT LIKE '%..%'
      )
    ),
  CONSTRAINT document_ocr_jobs_file_name_safe
    CHECK (
      source_file_name IS NULL
      OR (
        LENGTH(source_file_name) <= 255
        AND source_file_name !~ '[[:cntrl:]]'
      )
    ),
  CONSTRAINT document_ocr_jobs_checksum_safe
    CHECK (
      source_checksum IS NULL
      OR (
        LENGTH(source_checksum) <= 256
        AND source_checksum !~ '[[:cntrl:]]'
      )
    )
);

CREATE TABLE IF NOT EXISTS public.document_ocr_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.document_ocr_jobs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number INTEGER NOT NULL,
  status TEXT NOT NULL,
  method TEXT NOT NULL,
  raw_text TEXT,
  normalized_text TEXT,
  text_hash TEXT,
  confidence NUMERIC,
  width NUMERIC,
  height NUMERIC,
  rotation NUMERIC,
  warnings JSONB NOT NULL DEFAULT '[]'::JSONB,
  errors JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_ocr_pages_page_number_check
    CHECK (page_number > 0),
  CONSTRAINT document_ocr_pages_status_check
    CHECK (
      status IN (
        'pending',
        'extracted',
        'empty_text_layer',
        'ocr_extracted',
        'unreadable',
        'failed',
        'skipped',
        'unsupported'
      )
    ),
  CONSTRAINT document_ocr_pages_method_check
    CHECK (
      method IN (
        'text_layer',
        'browser_extraction',
        'manual_text',
        'external_ocr_placeholder',
        'unavailable'
      )
    ),
  CONSTRAINT document_ocr_pages_confidence_check
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  CONSTRAINT document_ocr_pages_warnings_array
    CHECK (JSONB_TYPEOF(warnings) = 'array'),
  CONSTRAINT document_ocr_pages_errors_array
    CHECK (JSONB_TYPEOF(errors) = 'array'),
  CONSTRAINT document_ocr_pages_metadata_object
    CHECK (JSONB_TYPEOF(metadata) = 'object'),
  CONSTRAINT document_ocr_pages_text_hash_check
    CHECK (
      text_hash IS NULL
      OR text_hash ~ '^[0-9a-fA-F]{64}$'
    )
);

DO $constraints$
BEGIN
  IF to_regclass('public.document_versions') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.document_ocr_jobs'::REGCLASS
         AND conname = 'document_ocr_jobs_document_version_id_fkey'
     ) THEN
    ALTER TABLE public.document_ocr_jobs
      ADD CONSTRAINT document_ocr_jobs_document_version_id_fkey
      FOREIGN KEY (document_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;

  IF to_regclass('public.document_tramite_instance_evidence') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1
       FROM pg_constraint
       WHERE conrelid = 'public.document_ocr_jobs'::REGCLASS
         AND conname = 'document_ocr_jobs_evidence_id_fkey'
     ) THEN
    ALTER TABLE public.document_ocr_jobs
      ADD CONSTRAINT document_ocr_jobs_evidence_id_fkey
      FOREIGN KEY (evidence_id)
      REFERENCES public.document_tramite_instance_evidence(id)
      ON DELETE SET NULL
      NOT VALID;
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_document_ocr_pages_job_page
  ON public.document_ocr_pages(job_id, page_number);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_org_document_created
  ON public.document_ocr_jobs(org_id, document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_org_status
  ON public.document_ocr_jobs(org_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_requested_by
  ON public.document_ocr_jobs(org_id, requested_by, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_document_version
  ON public.document_ocr_jobs(org_id, document_version_id, created_at DESC)
  WHERE document_version_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_ocr_jobs_source_id
  ON public.document_ocr_jobs(org_id, source_id, created_at DESC)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_document_ocr_pages_org_document
  ON public.document_ocr_pages(org_id, document_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_document_ocr_jobs_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS document_ocr_jobs_touch_updated_at
  ON public.document_ocr_jobs;

CREATE TRIGGER document_ocr_jobs_touch_updated_at
  BEFORE UPDATE ON public.document_ocr_jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_document_ocr_jobs_updated_at();

ALTER TABLE public.document_ocr_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_ocr_pages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS document_ocr_jobs_select_scope
  ON public.document_ocr_jobs;
DROP POLICY IF EXISTS document_ocr_jobs_service_role
  ON public.document_ocr_jobs;
DROP POLICY IF EXISTS document_ocr_pages_select_scope
  ON public.document_ocr_pages;
DROP POLICY IF EXISTS document_ocr_pages_service_role
  ON public.document_ocr_pages;

CREATE POLICY document_ocr_jobs_select_scope
  ON public.document_ocr_jobs
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR EXISTS (
        SELECT 1
        FROM public.documents document
        WHERE document.id = document_ocr_jobs.document_id
          AND document.org_id = document_ocr_jobs.org_id
          AND document.author_id = auth.uid()
      )
    )
  );

CREATE POLICY document_ocr_jobs_service_role
  ON public.document_ocr_jobs
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

CREATE POLICY document_ocr_pages_select_scope
  ON public.document_ocr_pages
  FOR SELECT
  TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND (
      public.is_org_role(ARRAY['admin', 'manager'])
      OR EXISTS (
        SELECT 1
        FROM public.documents document
        WHERE document.id = document_ocr_pages.document_id
          AND document.org_id = document_ocr_pages.org_id
          AND document.author_id = auth.uid()
      )
    )
  );

CREATE POLICY document_ocr_pages_service_role
  ON public.document_ocr_pages
  FOR ALL
  TO service_role
  USING (TRUE)
  WITH CHECK (TRUE);

REVOKE ALL ON public.document_ocr_jobs FROM PUBLIC;
REVOKE ALL ON public.document_ocr_pages FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.document_ocr_jobs
  FROM authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE
  ON public.document_ocr_pages
  FROM authenticated;

GRANT SELECT ON public.document_ocr_jobs TO authenticated;
GRANT SELECT ON public.document_ocr_pages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ocr_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_ocr_pages TO service_role;

CREATE OR REPLACE FUNCTION public.document_ocr_allowed_job_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT p_status IN (
    'queued',
    'processing',
    'completed',
    'completed_with_warnings',
    'partial',
    'failed',
    'canceled',
    'unsupported',
    'unavailable'
  );
$function$;

CREATE OR REPLACE FUNCTION public.document_ocr_allowed_page_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT p_status IN (
    'pending',
    'extracted',
    'empty_text_layer',
    'ocr_extracted',
    'unreadable',
    'failed',
    'skipped',
    'unsupported'
  );
$function$;

CREATE OR REPLACE FUNCTION public.document_ocr_allowed_method(p_method TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
SET search_path = public, pg_catalog
AS $function$
  SELECT p_method IN (
    'text_layer',
    'browser_extraction',
    'manual_text',
    'external_ocr_placeholder',
    'unavailable'
  );
$function$;

CREATE OR REPLACE FUNCTION public.document_ocr_current_profile()
RETURNS TABLE(actor_id UUID, org_id UUID, role TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Usuário autenticado é obrigatório para leitura documental.'
      USING ERRCODE = '28000';
  END IF;

  RETURN QUERY
  SELECT profile.id, profile.org_id, profile.role
  FROM public.profiles profile
  WHERE profile.id = auth.uid()
    AND COALESCE(profile.active, TRUE) = TRUE
    AND profile.org_id IS NOT NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Perfil ativo com organização é obrigatório para leitura documental.'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.document_ocr_actor_can_access_document(
  p_document_id UUID,
  p_actor_id UUID,
  p_org_id UUID,
  p_actor_role TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_can_access BOOLEAN := FALSE;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.documents document
    WHERE document.id = p_document_id
      AND document.org_id = p_org_id
      AND (
        p_actor_role IN ('admin', 'manager')
        OR document.author_id = p_actor_id
      )
  )
  INTO v_can_access;

  RETURN COALESCE(v_can_access, FALSE);
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_document_ocr_job(
  p_document_id UUID,
  p_document_version_id UUID DEFAULT NULL,
  p_source_table TEXT DEFAULT NULL,
  p_source_id UUID DEFAULT NULL,
  p_source_storage_bucket TEXT DEFAULT NULL,
  p_source_storage_path TEXT DEFAULT NULL,
  p_source_file_name TEXT DEFAULT NULL,
  p_source_mime_type TEXT DEFAULT NULL,
  p_source_size_bytes BIGINT DEFAULT NULL,
  p_source_checksum TEXT DEFAULT NULL,
  p_method TEXT DEFAULT 'unavailable',
  p_language_hint TEXT DEFAULT 'pt-BR'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID;
  v_org_id UUID;
  v_actor_role TEXT;
  v_document RECORD;
  v_job public.document_ocr_jobs%ROWTYPE;
  v_status TEXT := 'queued';
  v_limitations JSONB := '[]'::JSONB;
  v_warnings JSONB := '[]'::JSONB;
  v_source_table TEXT := NULLIF(BTRIM(p_source_table), '');
  v_method TEXT := COALESCE(NULLIF(BTRIM(p_method), ''), 'unavailable');
  v_version_matches BOOLEAN := FALSE;
  v_evidence_matches BOOLEAN := FALSE;
BEGIN
  SELECT profile.actor_id, profile.org_id, profile.role
  INTO v_actor_id, v_org_id, v_actor_role
  FROM public.document_ocr_current_profile() profile;

  IF NOT public.document_ocr_allowed_method(v_method) THEN
    RAISE EXCEPTION 'Método de leitura documental inválido: %.', v_method
      USING ERRCODE = '22023';
  END IF;

  IF v_source_table IS NOT NULL
     AND v_source_table NOT IN (
       'documents',
       'document_versions',
       'document_revisions',
       'document_tramite_instance_evidence',
       'storage'
     ) THEN
    RAISE EXCEPTION 'Fonte de leitura documental inválida: %.', v_source_table
      USING ERRCODE = '22023';
  END IF;

  IF p_source_size_bytes IS NOT NULL AND p_source_size_bytes < 0 THEN
    RAISE EXCEPTION 'Tamanho do arquivo de origem inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_storage_path IS NOT NULL
     AND (
       LENGTH(p_source_storage_path) > 1024
       OR p_source_storage_path ~ '[[:cntrl:]]'
       OR p_source_storage_path LIKE '/%'
       OR p_source_storage_path LIKE '%..%'
     ) THEN
    RAISE EXCEPTION 'Caminho do arquivo inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_file_name IS NOT NULL
     AND (
       LENGTH(p_source_file_name) > 255
       OR p_source_file_name ~ '[[:cntrl:]]'
     ) THEN
    RAISE EXCEPTION 'Nome do arquivo inválido.'
      USING ERRCODE = '22023';
  END IF;

  IF p_source_checksum IS NOT NULL
     AND (
       LENGTH(p_source_checksum) > 256
       OR p_source_checksum ~ '[[:cntrl:]]'
     ) THEN
    RAISE EXCEPTION 'Hash do arquivo inválido.'
      USING ERRCODE = '22023';
  END IF;

  SELECT document.id,
         document.org_id,
         document.author_id,
         document.title,
         document.code,
         document.file_path,
         document.file_name,
         document.file_size,
         document.file_hash
  INTO v_document
  FROM public.documents document
  WHERE document.id = p_document_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Documento não encontrado para leitura documental.'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_document.org_id <> v_org_id THEN
    RAISE EXCEPTION 'Documento pertence a outra organização.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.document_ocr_actor_can_access_document(
    p_document_id,
    v_actor_id,
    v_org_id,
    v_actor_role
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode solicitar leitura deste documento.'
      USING ERRCODE = '42501';
  END IF;

  IF p_document_version_id IS NOT NULL THEN
    IF to_regclass('public.document_versions') IS NULL THEN
      RAISE EXCEPTION 'Versões formais não estão disponíveis neste ambiente.'
        USING ERRCODE = '42P01';
    END IF;

    EXECUTE
      'SELECT EXISTS (
         SELECT 1
         FROM public.document_versions version
         WHERE version.id = $1
           AND version.document_id = $2
           AND version.org_id = $3
       )'
      INTO v_version_matches
      USING p_document_version_id, p_document_id, v_org_id;

    IF NOT COALESCE(v_version_matches, FALSE) THEN
      RAISE EXCEPTION 'Versão documental não pertence ao documento informado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_source_table = 'document_tramite_instance_evidence'
     AND p_source_id IS NOT NULL THEN
    IF to_regclass('public.document_tramite_instance_evidence') IS NULL THEN
      RAISE EXCEPTION 'Evidências de trâmite não estão disponíveis neste ambiente.'
        USING ERRCODE = '42P01';
    END IF;

    EXECUTE
      'SELECT EXISTS (
         SELECT 1
         FROM public.document_tramite_instance_evidence evidence
         WHERE evidence.id = $1
           AND evidence.document_id = $2
           AND evidence.org_id = $3
       )'
      INTO v_evidence_matches
      USING p_source_id, p_document_id, v_org_id;

    IF NOT COALESCE(v_evidence_matches, FALSE) THEN
      RAISE EXCEPTION 'Evidência não pertence ao documento informado.'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_method IN ('unavailable', 'external_ocr_placeholder') THEN
    v_status := 'unavailable';
    v_limitations := v_limitations || jsonb_build_array(
      'Nenhuma engine de OCR foi executada por esta RPC. A solicitação registra apenas o contrato de leitura.'
    );
    IF v_method = 'external_ocr_placeholder' THEN
      v_limitations := v_limitations || jsonb_build_array(
        'OCR externo é placeholder nesta fase e requer configuração explícita futura.'
      );
    END IF;
  ELSE
    v_status := 'queued';
    v_warnings := v_warnings || jsonb_build_array(
      'A solicitação foi registrada; o texto só será confiável após resultado armazenado com método e origem explícitos.'
    );
  END IF;

  INSERT INTO public.document_ocr_jobs (
    org_id,
    document_id,
    document_version_id,
    evidence_id,
    source_table,
    source_id,
    source_storage_bucket,
    source_storage_path,
    source_file_name,
    source_mime_type,
    source_size_bytes,
    source_checksum,
    requested_by,
    status,
    method,
    language_hint,
    warnings,
    limitations,
    metadata
  )
  VALUES (
    v_org_id,
    p_document_id,
    p_document_version_id,
    CASE
      WHEN v_source_table = 'document_tramite_instance_evidence' THEN p_source_id
      ELSE NULL
    END,
    v_source_table,
    p_source_id,
    NULLIF(BTRIM(p_source_storage_bucket), ''),
    NULLIF(BTRIM(p_source_storage_path), ''),
    NULLIF(BTRIM(p_source_file_name), ''),
    NULLIF(BTRIM(p_source_mime_type), ''),
    p_source_size_bytes,
    NULLIF(BTRIM(p_source_checksum), ''),
    v_actor_id,
    v_status,
    v_method,
    NULLIF(BTRIM(p_language_hint), ''),
    v_warnings,
    v_limitations,
    jsonb_build_object(
      'anti_hallucination_contract',
      'P-29 armazena texto observado/extraído/manual com origem explícita e não interpreta conteúdo.',
      'source_document',
      jsonb_build_object(
        'id', v_document.id,
        'code', v_document.code,
        'title', v_document.title
      )
    )
  )
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'success', TRUE,
    'job', to_jsonb(v_job),
    'next_action',
    CASE
      WHEN v_status = 'unavailable'
        THEN 'Configure uma engine futura ou registre texto manual explicitamente marcado como manual_text.'
      ELSE 'Armazene o resultado observado via store_document_ocr_result quando houver leitura real.'
    END,
    'limitations', v_limitations,
    'warnings', v_warnings
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_document_ocr_overview(
  p_document_id UUID DEFAULT NULL,
  p_status TEXT DEFAULT NULL,
  p_limit INTEGER DEFAULT 50
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID;
  v_org_id UUID;
  v_actor_role TEXT;
  v_limit INTEGER := LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100);
  v_counts JSONB := '{}'::JSONB;
  v_jobs JSONB := '[]'::JSONB;
  v_totals RECORD;
BEGIN
  SELECT profile.actor_id, profile.org_id, profile.role
  INTO v_actor_id, v_org_id, v_actor_role
  FROM public.document_ocr_current_profile() profile;

  IF p_status IS NOT NULL
     AND NOT public.document_ocr_allowed_job_status(p_status) THEN
    RAISE EXCEPTION 'Status de leitura documental inválido: %.', p_status
      USING ERRCODE = '22023';
  END IF;

  IF p_document_id IS NOT NULL
     AND NOT public.document_ocr_actor_can_access_document(
       p_document_id,
       v_actor_id,
       v_org_id,
       v_actor_role
     ) THEN
    RAISE EXCEPTION 'Seu perfil não pode consultar OCR deste documento.'
      USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(jsonb_object_agg(status, total), '{}'::JSONB)
  INTO v_counts
  FROM (
    SELECT job.status, COUNT(*)::INTEGER AS total
    FROM public.document_ocr_jobs job
    JOIN public.documents document
      ON document.id = job.document_id
     AND document.org_id = job.org_id
    WHERE job.org_id = v_org_id
      AND (p_document_id IS NULL OR job.document_id = p_document_id)
      AND (p_status IS NULL OR job.status = p_status)
      AND (
        v_actor_role IN ('admin', 'manager')
        OR document.author_id = v_actor_id
      )
    GROUP BY job.status
  ) counts;

  SELECT COUNT(*)::INTEGER AS total_jobs,
         COALESCE(SUM(job.processed_page_count), 0)::INTEGER AS processed_pages,
         COALESCE(SUM(job.extracted_text_length), 0)::INTEGER AS extracted_text_length,
         AVG(job.average_confidence) FILTER (WHERE job.average_confidence IS NOT NULL) AS average_confidence
  INTO v_totals
  FROM public.document_ocr_jobs job
  JOIN public.documents document
    ON document.id = job.document_id
   AND document.org_id = job.org_id
  WHERE job.org_id = v_org_id
    AND (p_document_id IS NULL OR job.document_id = p_document_id)
    AND (p_status IS NULL OR job.status = p_status)
    AND (
      v_actor_role IN ('admin', 'manager')
      OR document.author_id = v_actor_id
    );

  SELECT COALESCE(jsonb_agg(row_payload ORDER BY created_at DESC), '[]'::JSONB)
  INTO v_jobs
  FROM (
    SELECT job.created_at,
           jsonb_build_object(
             'id', job.id,
             'document_id', job.document_id,
             'document_version_id', job.document_version_id,
             'evidence_id', job.evidence_id,
             'document', jsonb_build_object(
               'id', document.id,
               'code', document.code,
               'title', document.title,
               'doc_type', document.doc_type,
               'area', document.area
             ),
             'source_table', job.source_table,
             'source_id', job.source_id,
             'source_storage_bucket', job.source_storage_bucket,
             'source_storage_path', job.source_storage_path,
             'source_file_name', job.source_file_name,
             'source_mime_type', job.source_mime_type,
             'source_size_bytes', job.source_size_bytes,
             'source_checksum', job.source_checksum,
             'requested_by', job.requested_by,
             'status', job.status,
             'method', job.method,
             'language_hint', job.language_hint,
             'page_count', job.page_count,
             'processed_page_count', job.processed_page_count,
             'extracted_text_length', job.extracted_text_length,
             'average_confidence', job.average_confidence,
             'started_at', job.started_at,
             'finished_at', job.finished_at,
             'error_code', job.error_code,
             'error_message', job.error_message,
             'warnings', job.warnings,
             'limitations', job.limitations,
             'metadata', job.metadata,
             'created_at', job.created_at,
             'updated_at', job.updated_at
           ) AS row_payload
    FROM public.document_ocr_jobs job
    JOIN public.documents document
      ON document.id = job.document_id
     AND document.org_id = job.org_id
    WHERE job.org_id = v_org_id
      AND (p_document_id IS NULL OR job.document_id = p_document_id)
      AND (p_status IS NULL OR job.status = p_status)
      AND (
        v_actor_role IN ('admin', 'manager')
        OR document.author_id = v_actor_id
      )
    ORDER BY job.created_at DESC
    LIMIT v_limit
  ) rows;

  RETURN jsonb_build_object(
    'version', 'P-29',
    'generated_at', NOW(),
    'feature', jsonb_build_object(
      'status', 'available',
      'external_ocr', 'unavailable',
      'manual_text', TRUE,
      'text_layer_contract', TRUE,
      'notice', 'A P-29 registra leitura técnica e não interpreta conteúdo.'
    ),
    'filters', jsonb_build_object(
      'document_id', p_document_id,
      'status', p_status,
      'limit', v_limit
    ),
    'counts_by_status', v_counts,
    'totals', jsonb_build_object(
      'jobs', COALESCE(v_totals.total_jobs, 0),
      'processed_pages', COALESCE(v_totals.processed_pages, 0),
      'extracted_text_length', COALESCE(v_totals.extracted_text_length, 0),
      'average_confidence', v_totals.average_confidence
    ),
    'jobs', v_jobs,
    'limitations', jsonb_build_array(
      'OCR externo não é executado nesta fase.',
      'Texto ausente não significa documento vazio.',
      'Leitura documental não altera validade, status, prazo ou aprovação do documento.'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_document_ocr_job(p_job_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID;
  v_org_id UUID;
  v_actor_role TEXT;
  v_job RECORD;
  v_pages JSONB := '[]'::JSONB;
BEGIN
  SELECT profile.actor_id, profile.org_id, profile.role
  INTO v_actor_id, v_org_id, v_actor_role
  FROM public.document_ocr_current_profile() profile;

  SELECT job.*, document.code, document.title, document.doc_type, document.area
  INTO v_job
  FROM public.document_ocr_jobs job
  JOIN public.documents document
    ON document.id = job.document_id
   AND document.org_id = job.org_id
  WHERE job.id = p_job_id
    AND job.org_id = v_org_id
    AND (
      v_actor_role IN ('admin', 'manager')
      OR document.author_id = v_actor_id
    );

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job de leitura documental não encontrado ou sem permissão.'
      USING ERRCODE = 'P0002';
  END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(page) ORDER BY page.page_number), '[]'::JSONB)
  INTO v_pages
  FROM public.document_ocr_pages page
  WHERE page.job_id = p_job_id
    AND page.org_id = v_org_id;

  RETURN jsonb_build_object(
    'job', to_jsonb(v_job),
    'document', jsonb_build_object(
      'id', v_job.document_id,
      'code', v_job.code,
      'title', v_job.title,
      'doc_type', v_job.doc_type,
      'area', v_job.area
    ),
    'pages', v_pages,
    'anti_hallucination', jsonb_build_object(
      'does_not_interpret', TRUE,
      'does_not_infer_fields', TRUE,
      'requires_method_origin', TRUE,
      'notice', 'OCR pode conter erros e deve ser conferido contra o arquivo original.'
    )
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.store_document_ocr_result(
  p_job_id UUID,
  p_status TEXT,
  p_method TEXT,
  p_page_count INTEGER,
  p_pages JSONB,
  p_average_confidence NUMERIC DEFAULT NULL,
  p_warnings JSONB DEFAULT '[]'::JSONB,
  p_limitations JSONB DEFAULT '[]'::JSONB,
  p_metadata JSONB DEFAULT '{}'::JSONB,
  p_error_code TEXT DEFAULT NULL,
  p_error_message TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID;
  v_org_id UUID;
  v_actor_role TEXT;
  v_job public.document_ocr_jobs%ROWTYPE;
  v_page JSONB;
  v_page_number INTEGER;
  v_page_status TEXT;
  v_page_method TEXT;
  v_raw_text TEXT;
  v_normalized_text TEXT;
  v_confidence NUMERIC;
  v_text_hash TEXT;
  v_processed_page_count INTEGER := 0;
  v_extracted_text_length INTEGER := 0;
  v_inserted_pages INTEGER := 0;
  v_final_statuses CONSTANT TEXT[] := ARRAY[
    'completed',
    'completed_with_warnings',
    'partial',
    'failed',
    'canceled',
    'unsupported',
    'unavailable'
  ];
BEGIN
  SELECT profile.actor_id, profile.org_id, profile.role
  INTO v_actor_id, v_org_id, v_actor_role
  FROM public.document_ocr_current_profile() profile;

  IF v_actor_role NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION 'Somente administradores e gestores podem armazenar resultado OCR nesta fase.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.document_ocr_allowed_job_status(p_status) THEN
    RAISE EXCEPTION 'Status final de leitura documental inválido: %.', p_status
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.document_ocr_allowed_method(p_method) THEN
    RAISE EXCEPTION 'Método de leitura documental inválido: %.', p_method
      USING ERRCODE = '22023';
  END IF;

  IF p_page_count IS NOT NULL AND p_page_count < 0 THEN
    RAISE EXCEPTION 'Quantidade de páginas inválida.'
      USING ERRCODE = '22023';
  END IF;

  IF p_average_confidence IS NOT NULL
     AND (p_average_confidence < 0 OR p_average_confidence > 1) THEN
    RAISE EXCEPTION 'Confiança média deve estar entre 0 e 1.'
      USING ERRCODE = '22023';
  END IF;

  IF JSONB_TYPEOF(COALESCE(p_pages, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Páginas OCR devem ser enviadas como array JSON.'
      USING ERRCODE = '22023';
  END IF;

  IF JSONB_ARRAY_LENGTH(COALESCE(p_pages, '[]'::JSONB)) > 500 THEN
    RAISE EXCEPTION 'Resultado OCR excede o limite de 500 páginas por job nesta fase.'
      USING ERRCODE = '54000';
  END IF;

  IF JSONB_TYPEOF(COALESCE(p_warnings, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Warnings devem ser array JSON.'
      USING ERRCODE = '22023';
  END IF;

  IF JSONB_TYPEOF(COALESCE(p_limitations, '[]'::JSONB)) <> 'array' THEN
    RAISE EXCEPTION 'Limitações devem ser array JSON.'
      USING ERRCODE = '22023';
  END IF;

  IF JSONB_TYPEOF(COALESCE(p_metadata, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'Metadados devem ser objeto JSON.'
      USING ERRCODE = '22023';
  END IF;

  SELECT *
  INTO v_job
  FROM public.document_ocr_jobs job
  WHERE job.id = p_job_id
    AND job.org_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Job de leitura documental não encontrado.'
      USING ERRCODE = 'P0002';
  END IF;

  IF NOT public.document_ocr_actor_can_access_document(
    v_job.document_id,
    v_actor_id,
    v_org_id,
    v_actor_role
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode armazenar resultado deste documento.'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.document_ocr_pages
  WHERE job_id = p_job_id
    AND org_id = v_org_id;

  FOR v_page IN
    SELECT value
    FROM jsonb_array_elements(COALESCE(p_pages, '[]'::JSONB))
  LOOP
    IF JSONB_TYPEOF(v_page) <> 'object' THEN
      RAISE EXCEPTION 'Cada página OCR deve ser objeto JSON.'
        USING ERRCODE = '22023';
    END IF;

    IF COALESCE(v_page->>'page_number', '') !~ '^[0-9]+$' THEN
      RAISE EXCEPTION 'Cada página OCR precisa de page_number positivo.'
        USING ERRCODE = '22023';
    END IF;

    v_page_number := (v_page->>'page_number')::INTEGER;
    v_page_status := COALESCE(NULLIF(BTRIM(v_page->>'status'), ''), 'pending');
    v_page_method := COALESCE(NULLIF(BTRIM(v_page->>'method'), ''), p_method);
    v_raw_text := v_page->>'raw_text';
    v_normalized_text := v_page->>'normalized_text';

    IF v_page_number <= 0 THEN
      RAISE EXCEPTION 'Cada página OCR precisa de page_number positivo.'
        USING ERRCODE = '22023';
    END IF;

    IF NOT public.document_ocr_allowed_page_status(v_page_status) THEN
      RAISE EXCEPTION 'Status de página OCR inválido: %.', v_page_status
        USING ERRCODE = '22023';
    END IF;

    IF NOT public.document_ocr_allowed_method(v_page_method) THEN
      RAISE EXCEPTION 'Método de página OCR inválido: %.', v_page_method
        USING ERRCODE = '22023';
    END IF;

    IF (v_page ? 'confidence')
       AND NULLIF(v_page->>'confidence', '') IS NOT NULL THEN
      v_confidence := (v_page->>'confidence')::NUMERIC;
      IF v_confidence < 0 OR v_confidence > 1 THEN
        RAISE EXCEPTION 'Confiança de página deve estar entre 0 e 1.'
          USING ERRCODE = '22023';
      END IF;
    ELSE
      v_confidence := NULL;
    END IF;

    IF JSONB_TYPEOF(COALESCE(v_page->'warnings', '[]'::JSONB)) <> 'array' THEN
      RAISE EXCEPTION 'Warnings de página devem ser array JSON.'
        USING ERRCODE = '22023';
    END IF;

    IF JSONB_TYPEOF(COALESCE(v_page->'errors', '[]'::JSONB)) <> 'array' THEN
      RAISE EXCEPTION 'Erros de página devem ser array JSON.'
        USING ERRCODE = '22023';
    END IF;

    IF JSONB_TYPEOF(COALESCE(v_page->'metadata', '{}'::JSONB)) <> 'object' THEN
      RAISE EXCEPTION 'Metadados de página devem ser objeto JSON.'
        USING ERRCODE = '22023';
    END IF;

    IF v_page_status IN ('extracted', 'ocr_extracted')
       AND NULLIF(BTRIM(COALESCE(v_raw_text, v_normalized_text, '')), '') IS NULL THEN
      RAISE EXCEPTION 'Página marcada como extraída precisa conter texto observado.'
        USING ERRCODE = '22023';
    END IF;

    IF NULLIF(COALESCE(v_raw_text, v_normalized_text), '') IS NOT NULL THEN
      v_text_hash := encode(
        digest(COALESCE(v_raw_text, v_normalized_text), 'sha256'),
        'hex'
      );
      v_extracted_text_length :=
        v_extracted_text_length + LENGTH(COALESCE(v_raw_text, v_normalized_text));
    ELSE
      v_text_hash := NULL;
    END IF;

    IF v_page_status NOT IN ('pending', 'skipped') THEN
      v_processed_page_count := v_processed_page_count + 1;
    END IF;

    INSERT INTO public.document_ocr_pages (
      org_id,
      job_id,
      document_id,
      page_number,
      status,
      method,
      raw_text,
      normalized_text,
      text_hash,
      confidence,
      width,
      height,
      rotation,
      warnings,
      errors,
      metadata
    )
    VALUES (
      v_org_id,
      p_job_id,
      v_job.document_id,
      v_page_number,
      v_page_status,
      v_page_method,
      v_raw_text,
      v_normalized_text,
      v_text_hash,
      v_confidence,
      CASE
        WHEN NULLIF(v_page->>'width', '') IS NULL THEN NULL
        ELSE (v_page->>'width')::NUMERIC
      END,
      CASE
        WHEN NULLIF(v_page->>'height', '') IS NULL THEN NULL
        ELSE (v_page->>'height')::NUMERIC
      END,
      CASE
        WHEN NULLIF(v_page->>'rotation', '') IS NULL THEN NULL
        ELSE (v_page->>'rotation')::NUMERIC
      END,
      COALESCE(v_page->'warnings', '[]'::JSONB),
      COALESCE(v_page->'errors', '[]'::JSONB),
      COALESCE(v_page->'metadata', '{}'::JSONB)
    );

    v_inserted_pages := v_inserted_pages + 1;
  END LOOP;

  UPDATE public.document_ocr_jobs
  SET status = p_status,
      method = p_method,
      page_count = COALESCE(p_page_count, v_inserted_pages),
      processed_page_count = v_processed_page_count,
      extracted_text_length = v_extracted_text_length,
      average_confidence = p_average_confidence,
      started_at = COALESCE(started_at, NOW()),
      finished_at = CASE
        WHEN p_status = ANY(v_final_statuses) THEN NOW()
        ELSE finished_at
      END,
      error_code = NULLIF(BTRIM(p_error_code), ''),
      error_message = NULLIF(BTRIM(p_error_message), ''),
      warnings = COALESCE(p_warnings, '[]'::JSONB),
      limitations = COALESCE(p_limitations, '[]'::JSONB),
      metadata = COALESCE(metadata, '{}'::JSONB)
        || COALESCE(p_metadata, '{}'::JSONB)
        || jsonb_build_object(
          'stored_by', v_actor_id,
          'stored_at', NOW(),
          'anti_hallucination_notice',
          'Resultado armazenado como texto observado/extraído/manual; sem interpretação semântica.'
        )
  WHERE id = p_job_id
    AND org_id = v_org_id
  RETURNING *
  INTO v_job;

  RETURN jsonb_build_object(
    'success', TRUE,
    'job_id', p_job_id,
    'status', v_job.status,
    'method', v_job.method,
    'page_count', v_job.page_count,
    'processed_page_count', v_job.processed_page_count,
    'extracted_text_length', v_job.extracted_text_length,
    'average_confidence', v_job.average_confidence,
    'inserted_pages', v_inserted_pages,
    'warnings', v_job.warnings,
    'limitations', v_job.limitations
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_document_ocr_text(
  p_document_id UUID,
  p_job_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $function$
DECLARE
  v_actor_id UUID;
  v_org_id UUID;
  v_actor_role TEXT;
  v_job public.document_ocr_jobs%ROWTYPE;
  v_pages JSONB := '[]'::JSONB;
  v_text TEXT;
BEGIN
  SELECT profile.actor_id, profile.org_id, profile.role
  INTO v_actor_id, v_org_id, v_actor_role
  FROM public.document_ocr_current_profile() profile;

  IF NOT public.document_ocr_actor_can_access_document(
    p_document_id,
    v_actor_id,
    v_org_id,
    v_actor_role
  ) THEN
    RAISE EXCEPTION 'Seu perfil não pode consultar texto OCR deste documento.'
      USING ERRCODE = '42501';
  END IF;

  IF p_job_id IS NULL THEN
    SELECT *
    INTO v_job
    FROM public.document_ocr_jobs job
    WHERE job.org_id = v_org_id
      AND job.document_id = p_document_id
      AND job.status IN ('completed', 'completed_with_warnings', 'partial')
    ORDER BY job.created_at DESC
    LIMIT 1;
  ELSE
    SELECT *
    INTO v_job
    FROM public.document_ocr_jobs job
    WHERE job.id = p_job_id
      AND job.org_id = v_org_id
      AND job.document_id = p_document_id;
  END IF;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'document_id', p_document_id,
      'job_id', p_job_id,
      'status', 'unavailable',
      'pages', '[]'::JSONB,
      'text', NULL,
      'warnings', jsonb_build_array('Nenhum resultado textual concluído foi encontrado para este documento.'),
      'limitations', jsonb_build_array('Texto ausente não significa documento vazio.')
    );
  END IF;

  SELECT COALESCE(jsonb_agg(
           jsonb_build_object(
             'page_number', page.page_number,
             'status', page.status,
             'method', page.method,
             'raw_text', page.raw_text,
             'normalized_text', page.normalized_text,
             'text_hash', page.text_hash,
             'confidence', page.confidence,
             'warnings', page.warnings,
             'errors', page.errors
           )
           ORDER BY page.page_number
         ), '[]'::JSONB),
         STRING_AGG(
           FORMAT(
             '--- Página %s (%s) ---%s%s',
             page.page_number,
             page.status,
             E'\n',
             COALESCE(
               NULLIF(page.raw_text, ''),
               NULLIF(page.normalized_text, ''),
               '[sem texto extraído; confira o arquivo original]'
             )
           ),
           E'\n\n'
           ORDER BY page.page_number
         )
  INTO v_pages, v_text
  FROM public.document_ocr_pages page
  WHERE page.job_id = v_job.id
    AND page.org_id = v_org_id;

  RETURN jsonb_build_object(
    'document_id', p_document_id,
    'job_id', v_job.id,
    'status', v_job.status,
    'method', v_job.method,
    'average_confidence', v_job.average_confidence,
    'warnings', v_job.warnings,
    'limitations', v_job.limitations,
    'pages', v_pages,
    'text', v_text,
    'notice', 'Texto OCR é leitura técnica e pode conter erros. Não há interpretação, resumo ou extração de campos nesta fase.'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.touch_document_ocr_jobs_updated_at() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_ocr_allowed_job_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_ocr_allowed_page_status(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_ocr_allowed_method(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_ocr_current_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.document_ocr_actor_can_access_document(UUID, UUID, UUID, TEXT) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.create_document_ocr_job(
  UUID,
  UUID,
  TEXT,
  UUID,
  TEXT,
  TEXT,
  TEXT,
  TEXT,
  BIGINT,
  TEXT,
  TEXT,
  TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_document_ocr_overview(UUID, TEXT, INTEGER)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_document_ocr_job(UUID)
  TO authenticated;

GRANT EXECUTE ON FUNCTION public.store_document_ocr_result(
  UUID,
  TEXT,
  TEXT,
  INTEGER,
  JSONB,
  NUMERIC,
  JSONB,
  JSONB,
  JSONB,
  TEXT,
  TEXT
) TO authenticated;

GRANT EXECUTE ON FUNCTION public.get_document_ocr_text(UUID, UUID)
  TO authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
