-- TRAMITA P-2 — Performance indexes for enterprise schema

CREATE INDEX IF NOT EXISTS idx_profiles_org_role
  ON public.profiles(org_id, role);

CREATE INDEX IF NOT EXISTS idx_documents_org_status
  ON public.documents(org_id, status);

CREATE INDEX IF NOT EXISTS idx_documents_org_type
  ON public.documents(org_id, doc_type);

CREATE INDEX IF NOT EXISTS idx_documents_next_review
  ON public.documents(org_id, next_review_at)
  WHERE status = 'published';

CREATE INDEX IF NOT EXISTS idx_documents_author
  ON public.documents(author_id);

CREATE INDEX IF NOT EXISTS idx_approvals_document
  ON public.approval_flows(document_id, step);

CREATE INDEX IF NOT EXISTS idx_approvals_assignee_pending
  ON public.approval_flows(assignee_id, status)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_audit_document
  ON public.audit_trail(document_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_org_date
  ON public.audit_trail(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, read)
  WHERE read = false;

CREATE INDEX IF NOT EXISTS idx_versions_document
  ON public.document_versions(document_id, revision DESC);
