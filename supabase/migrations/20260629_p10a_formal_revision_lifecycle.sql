-- TRAMITA P-10A — Ciclo Formal de Revisão Documental
-- Mantém documents como mestre e document_versions como revisões formais.

BEGIN;

ALTER TABLE public.document_versions
  ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS change_reason TEXT,
  ADD COLUMN IF NOT EXISTS created_from_version_id UUID,
  ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS superseded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW();

ALTER TABLE public.document_versions
  ALTER COLUMN status SET DEFAULT 'draft',
  ALTER COLUMN metadata SET DEFAULT '{}'::JSONB,
  ALTER COLUMN created_at SET DEFAULT NOW();

UPDATE public.document_versions
SET
  status = COALESCE(status, 'draft'),
  metadata = COALESCE(metadata, '{}'::JSONB),
  created_at = COALESCE(created_at, uploaded_at, NOW());

ALTER TABLE public.approval_flows
  ADD COLUMN IF NOT EXISTS document_version_id UUID,
  ADD COLUMN IF NOT EXISTS revision_number INTEGER;

ALTER TABLE public.documents
  ADD COLUMN IF NOT EXISTS published_version_id UUID,
  ADD COLUMN IF NOT EXISTS working_version_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_versions'::REGCLASS
      AND conname = 'document_versions_created_from_version_id_fkey'
  ) THEN
    ALTER TABLE public.document_versions
      ADD CONSTRAINT document_versions_created_from_version_id_fkey
      FOREIGN KEY (created_from_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.approval_flows'::REGCLASS
      AND conname = 'approval_flows_document_version_id_fkey'
  ) THEN
    ALTER TABLE public.approval_flows
      ADD CONSTRAINT approval_flows_document_version_id_fkey
      FOREIGN KEY (document_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_published_version_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_published_version_id_fkey
      FOREIGN KEY (published_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.documents'::REGCLASS
      AND conname = 'documents_working_version_id_fkey'
  ) THEN
    ALTER TABLE public.documents
      ADD CONSTRAINT documents_working_version_id_fkey
      FOREIGN KEY (working_version_id)
      REFERENCES public.document_versions(id)
      ON DELETE SET NULL NOT VALID;
  END IF;
END;
$$;

DO $$
DECLARE
  status_constraint RECORD;
BEGIN
  FOR status_constraint IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.document_versions'::REGCLASS
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ~* '\mstatus\M'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.document_versions DROP CONSTRAINT %I',
      status_constraint.conname
    );
  END LOOP;

  ALTER TABLE public.document_versions
    ADD CONSTRAINT document_versions_status_check
    CHECK (status IN (
      'draft',
      'in_review',
      'pending_approval',
      'published',
      'rejected',
      'superseded',
      'obsolete'
    )) NOT VALID;
END;
$$;

-- Backfill somente quando a versão corrente é inferível por document_id + revision.
UPDATE public.document_versions AS version
SET
  status = 'published',
  published_at = COALESCE(version.published_at, document.published_at, version.uploaded_at)
FROM public.documents AS document
WHERE document.status = 'published'
  AND version.document_id = document.id
  AND version.revision = document.revision;

UPDATE public.document_versions AS version
SET
  status = 'superseded',
  superseded_at = COALESCE(version.superseded_at, document.published_at, NOW())
FROM public.documents AS document
WHERE document.status = 'published'
  AND version.document_id = document.id
  AND version.revision < document.revision
  AND version.status = 'draft';

UPDATE public.documents AS document
SET published_version_id = version.id
FROM public.document_versions AS version
WHERE document.status = 'published'
  AND document.published_version_id IS NULL
  AND version.document_id = document.id
  AND version.revision = document.revision
  AND version.status = 'published';

CREATE INDEX IF NOT EXISTS idx_document_versions_document_revision
  ON public.document_versions(document_id, revision);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_status
  ON public.document_versions(document_id, status);

CREATE INDEX IF NOT EXISTS idx_document_versions_document_published_at
  ON public.document_versions(document_id, published_at);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_document_version
  ON public.approval_flows(org_id, document_version_id);

CREATE INDEX IF NOT EXISTS idx_approval_flows_org_document_revision
  ON public.approval_flows(org_id, document_id, revision_number);

-- Autor da versão, gestores e atores do workflow podem atualizar o estado da
-- revisão. A UI restringe edição de conteúdo ao autor/gestor.
DROP POLICY IF EXISTS "versions_update_formal_revision" ON public.document_versions;
CREATE POLICY "versions_update_formal_revision"
  ON public.document_versions FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND (
      (
        uploaded_by = auth.uid()
        AND status IN ('draft', 'rejected')
      )
      OR public.is_org_role(ARRAY['admin', 'manager'])
      OR EXISTS (
        SELECT 1
        FROM public.approval_flows AS flow
        WHERE flow.document_version_id = document_versions.id
          AND flow.org_id = document_versions.org_id
          AND (
            flow.assignee_id = auth.uid()
            OR flow.assignee_user_id = auth.uid()
            OR (
              COALESCE(flow.assignment_type, 'role') = 'role'
              AND flow.required_role = public.current_user_role()
            )
            OR (
              COALESCE(flow.assignment_type, 'role') = 'group'
              AND EXISTS (
                SELECT 1
                FROM public.approval_group_members AS member
                WHERE member.org_id = flow.org_id
                  AND member.group_id = flow.assignee_group_id
                  AND member.user_id = auth.uid()
                  AND member.is_active = true
              )
            )
          )
      )
      OR EXISTS (
        SELECT 1
        FROM public.documents AS document
        JOIN public.approval_flows AS flow
          ON flow.document_id = document.id
         AND flow.document_version_id = document.working_version_id
        WHERE document.published_version_id = document_versions.id
          AND document.org_id = document_versions.org_id
          AND flow.decided_by = auth.uid()
          AND flow.status = 'approved'
      )
    )
  )
  WITH CHECK (org_id = public.current_user_org_id());

-- Necessária para o ator da etapa concluir a publicação no documento mestre.
DROP POLICY IF EXISTS "docs_update_formal_revision_actor" ON public.documents;
CREATE POLICY "docs_update_formal_revision_actor"
  ON public.documents FOR UPDATE
  USING (
    org_id = public.current_user_org_id()
    AND EXISTS (
      SELECT 1
      FROM public.approval_flows AS flow
      WHERE flow.document_id = documents.id
        AND flow.org_id = documents.org_id
        AND flow.document_version_id IS NOT NULL
        AND (
          flow.assignee_id = auth.uid()
          OR flow.assignee_user_id = auth.uid()
          OR (
            COALESCE(flow.assignment_type, 'role') = 'role'
            AND flow.required_role = public.current_user_role()
          )
          OR (
            COALESCE(flow.assignment_type, 'role') = 'group'
            AND EXISTS (
              SELECT 1
              FROM public.approval_group_members AS member
              WHERE member.org_id = flow.org_id
                AND member.group_id = flow.assignee_group_id
                AND member.user_id = auth.uid()
                AND member.is_active = true
            )
          )
        )
    )
  )
  WITH CHECK (org_id = public.current_user_org_id());

NOTIFY pgrst, 'reload schema';

COMMIT;
