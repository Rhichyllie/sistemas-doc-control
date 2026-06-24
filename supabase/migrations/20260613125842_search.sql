-- P-8: Full-text search + trigram indexes
CREATE EXTENSION IF NOT EXISTS pg_trgm;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('portuguese',
      COALESCE(code, '') || ' ' ||
      COALESCE(title, '') || ' ' ||
      COALESCE(description, '') || ' ' ||
      COALESCE(area, '') || ' ' ||
      COALESCE(doc_type, '')
    )
  ) STORED;

CREATE INDEX IF NOT EXISTS idx_documents_search_vector
  ON public.documents USING GIN (search_vector);

CREATE INDEX IF NOT EXISTS idx_documents_title_trgm
  ON public.documents USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_documents_code_trgm
  ON public.documents USING GIN (code gin_trgm_ops);
