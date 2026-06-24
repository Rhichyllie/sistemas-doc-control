-- TRAMITA P-2 — Organizations and enterprise profiles
-- Adds tenant isolation primitives on top of the P-0 baseline schema.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── ORGANIZATIONS ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name         TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  logo_url     TEXT,
  sector       TEXT NOT NULL DEFAULT 'industrial',
  code_prefix  TEXT NOT NULL DEFAULT 'ORG',
  plan         TEXT NOT NULL DEFAULT 'pilot'
               CHECK (plan IN ('pilot', 'starter', 'professional', 'enterprise')),
  settings     JSONB NOT NULL DEFAULT '{}',
  active       BOOLEAN NOT NULL DEFAULT true,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- ── PROFILES ───────────────────────────────────────────────
-- The baseline migration already creates public.profiles; extend it instead
-- of replacing it so existing installs can migrate forward.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.profiles
  ALTER COLUMN full_name SET NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin','manager','approver','reviewer','author','viewer'));
  END IF;
END;
$$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- ── RLS HELPERS ────────────────────────────────────────────
-- SECURITY DEFINER helpers avoid recursive RLS lookups on public.profiles.
CREATE OR REPLACE FUNCTION public.current_user_org_id()
RETURNS UUID
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT org_id FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid() LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.is_org_role(_roles TEXT[])
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.profiles
    WHERE id = auth.uid()
      AND org_id IS NOT NULL
      AND role = ANY(_roles)
  )
$$;

-- ── RLS POLICIES — ORGANIZATIONS ───────────────────────────
DROP POLICY IF EXISTS "org_select_own" ON public.organizations;
DROP POLICY IF EXISTS "org_update_admin" ON public.organizations;

CREATE POLICY "org_select_own"
  ON public.organizations FOR SELECT
  USING (id = public.current_user_org_id());

CREATE POLICY "org_update_admin"
  ON public.organizations FOR UPDATE
  USING (id = public.current_user_org_id() AND public.current_user_role() = 'admin')
  WITH CHECK (id = public.current_user_org_id() AND public.current_user_role() = 'admin');

-- ── RLS POLICIES — PROFILES ────────────────────────────────
DROP POLICY IF EXISTS "profiles_read_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_select_same_org" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_admin_manager" ON public.profiles;

CREATE POLICY "profiles_select_same_org"
  ON public.profiles FOR SELECT
  USING (org_id = public.current_user_org_id());

CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid() AND org_id = public.current_user_org_id());

CREATE POLICY "profiles_insert_admin_manager"
  ON public.profiles FOR INSERT
  WITH CHECK (
    org_id = public.current_user_org_id()
    AND public.is_org_role(ARRAY['admin','manager'])
  );

-- ── TRIGGER: create profile on auth.users insert ───────────
-- NOTE: This trigger requires tenant selection. Demo profiles are seeded in
-- seed.sql. Production profile creation moves to the signup Edge Function in P-8.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN NEW;
END;
$$;

-- ── UPDATED_AT triggers ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_updated_at ON public.organizations;
CREATE TRIGGER organizations_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS profiles_updated_at ON public.profiles;
CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
