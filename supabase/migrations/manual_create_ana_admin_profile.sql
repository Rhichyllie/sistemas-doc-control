-- Manual helper: create the minimum auth schema and promote Ana Magno to admin.
-- Run this in the Supabase SQL Editor when the remote project does not yet have
-- public.profiles / public.organizations.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  logo_url TEXT,
  sector TEXT NOT NULL DEFAULT 'industrial',
  code_prefix TEXT NOT NULL DEFAULT 'ORG',
  plan TEXT NOT NULL DEFAULT 'enterprise',
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  org_id UUID REFERENCES public.organizations(id),
  full_name TEXT NOT NULL,
  email TEXT,
  role TEXT NOT NULL DEFAULT 'viewer',
  department TEXT,
  avatar_url TEXT,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.organizations(id),
  ADD COLUMN IF NOT EXISTS full_name TEXT,
  ADD COLUMN IF NOT EXISTS email TEXT,
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'viewer',
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS avatar_url TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS logo_url TEXT,
  ADD COLUMN IF NOT EXISTS sector TEXT NOT NULL DEFAULT 'industrial',
  ADD COLUMN IF NOT EXISTS code_prefix TEXT NOT NULL DEFAULT 'ORG',
  ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'enterprise',
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'profiles'
      AND column_name = 'full_name'
  ) THEN
    EXECUTE 'UPDATE public.profiles SET full_name = COALESCE(full_name, email, ''Usuario'') WHERE full_name IS NULL';
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN full_name SET NOT NULL';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_role_check
      CHECK (role IN ('admin','manager','approver','reviewer','author','viewer'));
  END IF;
END
$$;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_select_own" ON public.organizations;
CREATE POLICY "org_select_own"
  ON public.organizations FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.profiles p
      WHERE p.id = auth.uid()
        AND p.org_id = organizations.id
    )
  );

DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;
CREATE POLICY "profiles_select_own"
  ON public.profiles FOR SELECT TO authenticated
  USING (id = auth.uid());

DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
CREATE POLICY "profiles_update_own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

DO $$
DECLARE
  target_user_id UUID;
  target_org_id UUID;
BEGIN
  SELECT id
    INTO target_user_id
  FROM auth.users
  WHERE email = 'anamagno.assis@gmail.com'
  LIMIT 1;

  IF target_user_id IS NULL THEN
    RAISE EXCEPTION 'Usuario auth.users com email % nao encontrado. Crie a conta primeiro pela tela de cadastro.', 'anamagno.assis@gmail.com';
  END IF;

  SELECT id
    INTO target_org_id
  FROM public.organizations
  WHERE active IS TRUE
  ORDER BY created_at NULLS LAST, name
  LIMIT 1;

  IF target_org_id IS NULL THEN
    INSERT INTO public.organizations (name, slug, sector, code_prefix, plan, active)
    VALUES (
      'Organizacao Principal',
      'org-principal',
      'industrial',
      'ORG',
      'enterprise',
      TRUE
    )
    RETURNING id INTO target_org_id;
  END IF;

  UPDATE auth.users
  SET
    email_confirmed_at = COALESCE(email_confirmed_at, NOW()),
    raw_user_meta_data = COALESCE(raw_user_meta_data, '{}'::jsonb) || jsonb_build_object('full_name', 'Ana Magno')
  WHERE id = target_user_id;

  INSERT INTO public.profiles (id, org_id, full_name, email, role, active)
  VALUES (
    target_user_id,
    target_org_id,
    'Ana Magno',
    'anamagno.assis@gmail.com',
    'admin',
    TRUE
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    full_name = EXCLUDED.full_name,
    email = EXCLUDED.email,
    role = EXCLUDED.role,
    active = EXCLUDED.active,
    updated_at = NOW();

  IF to_regclass('public.user_roles') IS NOT NULL THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (target_user_id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;
END
$$;
