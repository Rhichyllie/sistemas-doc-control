-- TRAMITA P-10C — Templates e Regras Documentais Enterprise
-- Cria governança configurável para a criação documental inteligente.
-- Aplicação exclusivamente manual após revisão no Supabase SQL Editor.

BEGIN;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.document_creation_templates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  description           TEXT,
  doc_type              TEXT,
  area                  TEXT,
  project_id            UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  is_active             BOOLEAN NOT NULL DEFAULT true,
  is_default            BOOLEAN NOT NULL DEFAULT false,
  priority              INTEGER NOT NULL DEFAULT 100,
  template_scope        TEXT NOT NULL DEFAULT 'organization',
  default_title_pattern TEXT,
  default_description   TEXT,
  default_review_months INTEGER,
  required_fields       JSONB NOT NULL DEFAULT '[]'::JSONB,
  recommended_fields    JSONB NOT NULL DEFAULT '[]'::JSONB,
  default_metadata      JSONB NOT NULL DEFAULT '{}'::JSONB,
  governance_hints      JSONB NOT NULL DEFAULT '{}'::JSONB,
  risk_profile          TEXT NOT NULL DEFAULT 'medium',
  created_by            UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_creation_templates_scope_check
    CHECK (template_scope IN ('organization', 'project', 'area', 'type')),
  CONSTRAINT document_creation_templates_risk_check
    CHECK (risk_profile IN ('low', 'medium', 'high', 'critical')),
  CONSTRAINT document_creation_templates_priority_check
    CHECK (priority >= 0),
  CONSTRAINT document_creation_templates_review_months_check
    CHECK (default_review_months IS NULL OR default_review_months BETWEEN 1 AND 120),
  CONSTRAINT document_creation_templates_required_fields_check
    CHECK (jsonb_typeof(required_fields) = 'array'),
  CONSTRAINT document_creation_templates_recommended_fields_check
    CHECK (jsonb_typeof(recommended_fields) = 'array'),
  CONSTRAINT document_creation_templates_default_metadata_check
    CHECK (jsonb_typeof(default_metadata) = 'object'),
  CONSTRAINT document_creation_templates_governance_hints_check
    CHECK (jsonb_typeof(governance_hints) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_creation_rules (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT,
  is_active   BOOLEAN NOT NULL DEFAULT true,
  priority    INTEGER NOT NULL DEFAULT 100,
  condition   JSONB NOT NULL DEFAULT '{}'::JSONB,
  effects     JSONB NOT NULL DEFAULT '{}'::JSONB,
  severity    TEXT NOT NULL DEFAULT 'info',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_creation_rules_severity_check
    CHECK (severity IN ('info', 'warning', 'critical')),
  CONSTRAINT document_creation_rules_priority_check
    CHECK (priority >= 0),
  CONSTRAINT document_creation_rules_condition_check
    CHECK (jsonb_typeof(condition) = 'object'),
  CONSTRAINT document_creation_rules_effects_check
    CHECK (jsonb_typeof(effects) = 'object')
);

CREATE TABLE IF NOT EXISTS public.document_template_usage_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_id   UUID REFERENCES public.document_creation_templates(id) ON DELETE SET NULL,
  document_id   UUID REFERENCES public.documents(id) ON DELETE SET NULL,
  user_id       UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  creation_mode TEXT,
  applied_rules JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata      JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_template_usage_rules_check
    CHECK (jsonb_typeof(applied_rules) = 'array'),
  CONSTRAINT document_template_usage_metadata_check
    CHECK (jsonb_typeof(metadata) = 'object')
);

CREATE INDEX IF NOT EXISTS idx_document_creation_templates_org
  ON public.document_creation_templates(org_id);
CREATE INDEX IF NOT EXISTS idx_document_creation_templates_org_doc_type
  ON public.document_creation_templates(org_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_document_creation_templates_org_area
  ON public.document_creation_templates(org_id, area);
CREATE INDEX IF NOT EXISTS idx_document_creation_templates_org_active
  ON public.document_creation_templates(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_document_creation_templates_org_priority
  ON public.document_creation_templates(org_id, priority);

CREATE INDEX IF NOT EXISTS idx_document_creation_rules_org
  ON public.document_creation_rules(org_id);
CREATE INDEX IF NOT EXISTS idx_document_creation_rules_org_active
  ON public.document_creation_rules(org_id, is_active);
CREATE INDEX IF NOT EXISTS idx_document_creation_rules_org_priority
  ON public.document_creation_rules(org_id, priority);

CREATE INDEX IF NOT EXISTS idx_document_template_usage_org
  ON public.document_template_usage_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_document_template_usage_document
  ON public.document_template_usage_logs(org_id, document_id);
CREATE INDEX IF NOT EXISTS idx_document_template_usage_template
  ON public.document_template_usage_logs(org_id, template_id);

DO $$
BEGIN
  IF to_regprocedure('public.set_updated_at()') IS NOT NULL THEN
    EXECUTE 'DROP TRIGGER IF EXISTS document_creation_templates_updated_at ON public.document_creation_templates';
    EXECUTE '
      CREATE TRIGGER document_creation_templates_updated_at
      BEFORE UPDATE ON public.document_creation_templates
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';

    EXECUTE 'DROP TRIGGER IF EXISTS document_creation_rules_updated_at ON public.document_creation_rules';
    EXECUTE '
      CREATE TRIGGER document_creation_rules_updated_at
      BEFORE UPDATE ON public.document_creation_rules
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()
    ';
  END IF;
END;
$$;

ALTER TABLE public.document_creation_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_creation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_template_usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "document_creation_templates_select_org"
  ON public.document_creation_templates;
CREATE POLICY "document_creation_templates_select_org"
  ON public.document_creation_templates
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_creation_templates_insert_manager"
  ON public.document_creation_templates;
CREATE POLICY "document_creation_templates_insert_manager"
  ON public.document_creation_templates
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_creation_templates_update_manager"
  ON public.document_creation_templates;
CREATE POLICY "document_creation_templates_update_manager"
  ON public.document_creation_templates
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_creation_templates_delete_manager"
  ON public.document_creation_templates;
CREATE POLICY "document_creation_templates_delete_manager"
  ON public.document_creation_templates
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_creation_rules_select_org"
  ON public.document_creation_rules;
CREATE POLICY "document_creation_rules_select_org"
  ON public.document_creation_rules
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_creation_rules_insert_manager"
  ON public.document_creation_rules;
CREATE POLICY "document_creation_rules_insert_manager"
  ON public.document_creation_rules
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_creation_rules_update_manager"
  ON public.document_creation_rules;
CREATE POLICY "document_creation_rules_update_manager"
  ON public.document_creation_rules
  FOR UPDATE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  )
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_creation_rules_delete_manager"
  ON public.document_creation_rules;
CREATE POLICY "document_creation_rules_delete_manager"
  ON public.document_creation_rules
  FOR DELETE TO authenticated
  USING (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin', 'manager'])
  );

DROP POLICY IF EXISTS "document_template_usage_logs_select_org"
  ON public.document_template_usage_logs;
CREATE POLICY "document_template_usage_logs_select_org"
  ON public.document_template_usage_logs
  FOR SELECT TO authenticated
  USING (org_id = public.current_user_org_id());

DROP POLICY IF EXISTS "document_template_usage_logs_insert_org"
  ON public.document_template_usage_logs;
CREATE POLICY "document_template_usage_logs_insert_org"
  ON public.document_template_usage_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND user_id = auth.uid()
  );

GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_creation_templates TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE
  ON public.document_creation_rules TO authenticated;
GRANT SELECT, INSERT
  ON public.document_template_usage_logs TO authenticated;

GRANT ALL ON public.document_creation_templates TO service_role;
GRANT ALL ON public.document_creation_rules TO service_role;
GRANT ALL ON public.document_template_usage_logs TO service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
