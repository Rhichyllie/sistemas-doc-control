BEGIN;

CREATE OR REPLACE FUNCTION public.create_publicacao(
  p_titulo TEXT,
  p_categoria TEXT,
  p_resumo TEXT DEFAULT NULL,
  p_documento_id UUID DEFAULT NULL,
  p_data_publicacao TIMESTAMPTZ DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_titulo TEXT := NULLIF(BTRIM(p_titulo), '');
  v_categoria TEXT := NULLIF(BTRIM(p_categoria), '');
  v_publicacao_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não identificada para criar a publicação.';
  END IF;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem criar publicações.';
  END IF;

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Informe um título para a publicação.';
  END IF;

  IF v_categoria IS NULL
    OR v_categoria NOT IN ('procedimento', 'manual', 'seguranca_saude', 'comunicado') THEN
    RAISE EXCEPTION 'Categoria de publicação inválida.';
  END IF;

  IF p_documento_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents document_row
      WHERE document_row.id = p_documento_id
        AND document_row.org_id = v_org_id
    ) THEN
    RAISE EXCEPTION 'O documento informado não pertence à organização atual.';
  END IF;

  INSERT INTO public.publicacoes (
    org_id,
    titulo,
    categoria,
    resumo,
    documento_id,
    data_publicacao,
    autor_id
  )
  VALUES (
    v_org_id,
    v_titulo,
    v_categoria,
    NULLIF(BTRIM(p_resumo), ''),
    p_documento_id,
    COALESCE(p_data_publicacao, NOW()),
    auth.uid()
  )
  RETURNING id INTO v_publicacao_id;

  RETURN v_publicacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_publicacao(
  TEXT,
  TEXT,
  TEXT,
  UUID,
  TIMESTAMPTZ
) TO authenticated;

CREATE OR REPLACE FUNCTION public.set_publicacao_image(
  p_publicacao_id UUID,
  p_imagem_url TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_publicacao_id UUID;
BEGIN
  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organização não identificada para atualizar a publicação.';
  END IF;

  IF v_role IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'Apenas administradores podem atualizar publicações.';
  END IF;

  IF p_publicacao_id IS NULL THEN
    RAISE EXCEPTION 'A publicação informada é inválida.';
  END IF;

  UPDATE public.publicacoes
  SET imagem_url = NULLIF(BTRIM(p_imagem_url), '')
  WHERE id = p_publicacao_id
    AND org_id = v_org_id
  RETURNING id INTO v_publicacao_id;

  IF v_publicacao_id IS NULL THEN
    RAISE EXCEPTION 'Publicação não encontrada para a organização atual.';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_publicacao_image(UUID, TEXT) TO authenticated;

COMMIT;
