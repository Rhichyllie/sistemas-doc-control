-- TRAMITA P-28
-- Campos operacionais complementares para o cadastro inicial de documentos.

BEGIN;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS discipline_id UUID REFERENCES public.disciplines(id),
  ADD COLUMN IF NOT EXISTS received_at DATE,
  ADD COLUMN IF NOT EXISTS analysis_days INTEGER,
  ADD COLUMN IF NOT EXISTS analysis_deadline DATE,
  ADD COLUMN IF NOT EXISTS external_link TEXT,
  ADD COLUMN IF NOT EXISTS register_status TEXT,
  ADD COLUMN IF NOT EXISTS register_revision TEXT;

CREATE INDEX IF NOT EXISTS idx_documents_register_status
  ON public.documents(register_status);

CREATE INDEX IF NOT EXISTS idx_documents_analysis_deadline
  ON public.documents(analysis_deadline);

COMMIT;
