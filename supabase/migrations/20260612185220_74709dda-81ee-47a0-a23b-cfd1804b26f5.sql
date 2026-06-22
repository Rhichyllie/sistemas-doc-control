
-- Enums
CREATE TYPE public.app_role AS ENUM ('admin','document_controller','coordinator','analyzer','supplier','client');
CREATE TYPE public.project_status AS ENUM ('planning','in_progress','completed','cancelled');
CREATE TYPE public.doc_status AS ENUM ('received','in_analysis','awaiting_revision','approved','approved_with_comments','rejected','cancelled');
CREATE TYPE public.doc_origin AS ENUM ('supplier','client','internal');

-- Profiles
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  position TEXT,
  discipline TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO authenticated;
GRANT ALL ON public.profiles TO service_role;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "profiles_read_all" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- User roles
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.app_role NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "user_roles_read_own_or_admin" ON public.user_roles FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "user_roles_admin_manage" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER trg_profiles_updated BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Auto-create profile + default role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email);
  -- First user becomes admin, others are analyzers by default
  IF NOT EXISTS (SELECT 1 FROM public.user_roles) THEN
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  ELSE
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'analyzer');
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Disciplines
CREATE TABLE public.disciplines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disciplines TO authenticated;
GRANT ALL ON public.disciplines TO service_role;
ALTER TABLE public.disciplines ENABLE ROW LEVEL SECURITY;
CREATE POLICY "disciplines_read_all" ON public.disciplines FOR SELECT TO authenticated USING (true);
CREATE POLICY "disciplines_admin_manage" ON public.disciplines FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller'));

INSERT INTO public.disciplines (name, code) VALUES
  ('Civil','CIV'),('Mecânica','MEC'),('Tubulação','TUB'),('Elétrica','ELE'),
  ('Instrumentação','INS'),('Processo','PRO'),('Automação','AUT'),
  ('Estruturas','EST'),('Arquitetura','ARQ'),('Outras','OUT');

-- Projects
CREATE TABLE public.projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  client TEXT,
  start_date DATE,
  end_date DATE,
  status public.project_status NOT NULL DEFAULT 'planning',
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.projects TO authenticated;
GRANT ALL ON public.projects TO service_role;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "projects_read_all" ON public.projects FOR SELECT TO authenticated USING (true);
CREATE POLICY "projects_manage" ON public.projects FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller') OR public.has_role(auth.uid(),'coordinator'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller') OR public.has_role(auth.uid(),'coordinator'));
CREATE TRIGGER trg_projects_updated BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Documents
CREATE TABLE public.documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code TEXT NOT NULL,
  title TEXT NOT NULL,
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  discipline_id UUID REFERENCES public.disciplines(id),
  doc_type TEXT,
  current_revision TEXT NOT NULL DEFAULT '00',
  origin public.doc_origin NOT NULL DEFAULT 'supplier',
  analyst_id UUID REFERENCES auth.users(id),
  status public.doc_status NOT NULL DEFAULT 'received',
  received_at DATE,
  sent_to_analysis_at DATE,
  returned_from_analysis_at DATE,
  sent_to_designer_at DATE,
  new_revision_received_at DATE,
  analysis_deadline DATE,
  approved_at DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, code)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.documents TO authenticated;
GRANT ALL ON public.documents TO service_role;
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
CREATE POLICY "documents_read_all" ON public.documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "documents_manage" ON public.documents FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(),'client'))
  WITH CHECK (NOT public.has_role(auth.uid(),'client'));
CREATE TRIGGER trg_documents_updated BEFORE UPDATE ON public.documents FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE INDEX idx_documents_project ON public.documents(project_id);
CREATE INDEX idx_documents_discipline ON public.documents(discipline_id);
CREATE INDEX idx_documents_status ON public.documents(status);

-- Document revisions
CREATE TABLE public.document_revisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  revision TEXT NOT NULL,
  status public.doc_status NOT NULL DEFAULT 'received',
  comments TEXT,
  file_path TEXT,
  file_name TEXT,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_revisions TO authenticated;
GRANT ALL ON public.document_revisions TO service_role;
ALTER TABLE public.document_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "revisions_read_all" ON public.document_revisions FOR SELECT TO authenticated USING (true);
CREATE POLICY "revisions_manage" ON public.document_revisions FOR ALL TO authenticated
  USING (NOT public.has_role(auth.uid(),'client'))
  WITH CHECK (NOT public.has_role(auth.uid(),'client'));
CREATE INDEX idx_revisions_document ON public.document_revisions(document_id);

-- Audit log
CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id UUID,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "audit_read_admin" ON public.audit_log FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'document_controller'));
CREATE POLICY "audit_insert_any" ON public.audit_log FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
