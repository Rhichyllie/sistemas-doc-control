-- TRAMITA P-9A.1 — Repair de código dos grupos de aprovação
-- Aplicação manual. Não altera o caráter opcional dos grupos no workflow.

BEGIN;

CREATE OR REPLACE FUNCTION public.normalize_approval_group_code(p_value TEXT)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
SET search_path = public
AS $$
  SELECT NULLIF(
    BTRIM(
      REGEXP_REPLACE(
        TRANSLATE(
          UPPER(BTRIM(COALESCE(p_value, ''))),
          'ÁÀÂÃÄÉÈÊËÍÌÎÏÓÒÔÕÖÚÙÛÜÇÑ',
          'AAAAAEEEEIIIIOOOOOUUUUCN'
        ),
        '[^A-Z0-9]+',
        '-',
        'g'
      ),
      '-'
    ),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.generate_approval_group_code(
  p_org_id UUID,
  p_name TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INTEGER := 2;
BEGIN
  v_base := COALESCE(public.normalize_approval_group_code(p_name), 'GRUPO');
  v_candidate := v_base;

  IF to_regclass('public.approval_groups') IS NULL THEN
    RETURN v_candidate;
  END IF;

  WHILE EXISTS (
    SELECT 1
    FROM public.approval_groups AS approval_group
    WHERE approval_group.org_id IS NOT DISTINCT FROM p_org_id
      AND UPPER(BTRIM(approval_group.code)) = UPPER(BTRIM(v_candidate))
  ) LOOP
    v_candidate := v_base || '-' || v_suffix::TEXT;
    v_suffix := v_suffix + 1;
  END LOOP;

  RETURN v_candidate;
END;
$$;

DO $repair$
DECLARE
  v_group RECORD;
BEGIN
  IF to_regclass('public.approval_groups') IS NULL THEN
    RAISE NOTICE 'approval_groups não existe; aplique primeiro a fundação P-9A/08.';
    RETURN;
  END IF;

  ALTER TABLE public.approval_groups
    ADD COLUMN IF NOT EXISTS code TEXT;

  FOR v_group IN
    SELECT id, org_id, name
    FROM public.approval_groups
    WHERE code IS NULL OR BTRIM(code) = ''
    ORDER BY id
  LOOP
    UPDATE public.approval_groups
    SET code = public.generate_approval_group_code(v_group.org_id, v_group.name)
    WHERE id = v_group.id;
  END LOOP;

  -- Preserva o código mais antigo e corrige somente repetições que impediriam
  -- a proteção única por organização.
  FOR v_group IN
    SELECT duplicate_group.id, duplicate_group.org_id, duplicate_group.code
    FROM (
      SELECT
        approval_group.id,
        approval_group.org_id,
        approval_group.code,
        ROW_NUMBER() OVER (
          PARTITION BY approval_group.org_id, UPPER(BTRIM(approval_group.code))
          ORDER BY approval_group.created_at NULLS LAST, approval_group.id
        ) AS duplicate_position
      FROM public.approval_groups AS approval_group
    ) AS duplicate_group
    WHERE duplicate_group.duplicate_position > 1
    ORDER BY duplicate_group.org_id, duplicate_group.code, duplicate_group.id
  LOOP
    UPDATE public.approval_groups
    SET code = public.generate_approval_group_code(v_group.org_id, v_group.code)
    WHERE id = v_group.id;
  END LOOP;

  ALTER TABLE public.approval_groups
    ALTER COLUMN code SET NOT NULL;
END;
$repair$;

CREATE OR REPLACE FUNCTION public.set_approval_group_code()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_base TEXT;
  v_candidate TEXT;
  v_suffix INTEGER := 2;
BEGIN
  v_base := COALESCE(
    public.normalize_approval_group_code(NEW.code),
    public.normalize_approval_group_code(NEW.name),
    'GRUPO'
  );
  v_candidate := v_base;

  WHILE EXISTS (
    SELECT 1
    FROM public.approval_groups AS approval_group
    WHERE approval_group.org_id IS NOT DISTINCT FROM NEW.org_id
      AND approval_group.id IS DISTINCT FROM NEW.id
      AND UPPER(BTRIM(approval_group.code)) = UPPER(BTRIM(v_candidate))
  ) LOOP
    v_candidate := v_base || '-' || v_suffix::TEXT;
    v_suffix := v_suffix + 1;
  END LOOP;

  NEW.code := v_candidate;
  RETURN NEW;
END;
$$;

DO $trigger$
BEGIN
  IF to_regclass('public.approval_groups') IS NULL THEN
    RETURN;
  END IF;

  DROP TRIGGER IF EXISTS approval_groups_set_code
    ON public.approval_groups;
  CREATE TRIGGER approval_groups_set_code
    BEFORE INSERT OR UPDATE OF code, name, org_id
    ON public.approval_groups
    FOR EACH ROW
    EXECUTE FUNCTION public.set_approval_group_code();
END;
$trigger$;

DO $index$
BEGIN
  IF to_regclass('public.approval_groups') IS NULL THEN
    RETURN;
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS idx_approval_groups_org_code_unique
    ON public.approval_groups (org_id, UPPER(BTRIM(code)))
    WHERE org_id IS NOT NULL;
END;
$index$;

GRANT EXECUTE ON FUNCTION public.normalize_approval_group_code(TEXT)
  TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.generate_approval_group_code(UUID, TEXT)
  TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
