-- Salva as informacoes principais da organizacao a partir da tela Geral.
-- Mantem a tabela organizations como fonte unica de verdade e encapsula
-- a gravacao em uma RPC com verificacao de papel.

CREATE OR REPLACE FUNCTION public.update_organization_profile(
  p_name TEXT,
  p_sector TEXT,
  p_code_prefix TEXT
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_name TEXT := NULLIF(BTRIM(p_name), '');
  v_sector TEXT := NULLIF(BTRIM(p_sector), '');
  v_code_prefix TEXT := LEFT(REGEXP_REPLACE(COALESCE(UPPER(p_code_prefix), ''), '[^A-Z0-9]', '', 'g'), 4);
  v_updated public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuario autenticado e obrigatorio para atualizar a organizacao.';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil sem organizacao vinculada.';
  END IF;

  IF COALESCE(v_role, '') <> 'admin' THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Apenas administradores podem atualizar as informacoes da organizacao.';
  END IF;

  IF v_name IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe um nome valido para a organizacao.';
  END IF;

  IF v_sector IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe um setor valido para a organizacao.';
  END IF;

  IF v_code_prefix = '' THEN
    RAISE EXCEPTION USING
      ERRCODE = '22023',
      MESSAGE = 'Informe um prefixo valido para a organizacao.';
  END IF;

  UPDATE public.organizations
  SET
    name = v_name,
    sector = v_sector,
    code_prefix = v_code_prefix,
    updated_at = NOW()
  WHERE id = v_org_id
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Organizacao nao encontrada para atualizacao.';
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_organization_profile(TEXT, TEXT, TEXT) TO authenticated;
