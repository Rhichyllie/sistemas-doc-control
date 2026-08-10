-- Permite salvar as configurações gerais da organização com verificação explícita
-- de papel, sem expor atualização ampla da tabela organizations para gestores.

CREATE OR REPLACE FUNCTION public.update_general_org_settings(
  p_default_review_months INTEGER,
  p_alert_days INTEGER[]
)
RETURNS public.organizations
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_settings JSONB;
  v_updated public.organizations%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Usuário autenticado é obrigatório para salvar as configurações gerais.';
  END IF;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Perfil sem organização vinculada.';
  END IF;

  IF COALESCE(v_role, '') NOT IN ('admin', 'manager') THEN
    RAISE EXCEPTION USING
      ERRCODE = '42501',
      MESSAGE = 'Apenas administradores e gestores podem salvar os prazos padrão.';
  END IF;

  v_settings := jsonb_build_object(
    'default_review_months',
    GREATEST(COALESCE(p_default_review_months, 24), 1),
    'alert_days',
    COALESCE(
      (
        SELECT to_jsonb(array_agg(day ORDER BY day DESC))
        FROM (
          SELECT DISTINCT day
          FROM unnest(COALESCE(p_alert_days, ARRAY[]::INTEGER[])) AS day
          WHERE day IS NOT NULL AND day > 0
        ) AS unique_days
      ),
      '[]'::jsonb
    )
  );

  UPDATE public.organizations
  SET
    settings = COALESCE(settings, '{}'::jsonb) || v_settings,
    updated_at = NOW()
  WHERE id = v_org_id
  RETURNING * INTO v_updated;

  IF v_updated.id IS NULL THEN
    RAISE EXCEPTION USING
      ERRCODE = 'P0002',
      MESSAGE = 'Organização não encontrada para atualização.';
  END IF;

  RETURN v_updated;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_general_org_settings(INTEGER, INTEGER[]) TO authenticated;
