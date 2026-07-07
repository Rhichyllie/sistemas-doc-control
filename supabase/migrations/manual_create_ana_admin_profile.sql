-- Manual helper: create or promote Ana Magno to admin in the current Supabase project.
-- Run this in the Supabase SQL Editor if MCP remote integration is unavailable.

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
    RAISE EXCEPTION 'Usuário auth.users com email % não encontrado. Crie a conta primeiro pela tela de cadastro.', 'anamagno.assis@gmail.com';
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
