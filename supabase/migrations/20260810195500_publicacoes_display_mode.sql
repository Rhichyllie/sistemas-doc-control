BEGIN;

ALTER TABLE public.publicacoes
  ADD COLUMN IF NOT EXISTS modo_exibicao TEXT NOT NULL DEFAULT 'padrao';

UPDATE public.publicacoes
SET modo_exibicao = 'padrao'
WHERE modo_exibicao IS NULL
   OR BTRIM(modo_exibicao) = '';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'publicacoes_modo_exibicao_check'
  ) THEN
    ALTER TABLE public.publicacoes
      ADD CONSTRAINT publicacoes_modo_exibicao_check
      CHECK (modo_exibicao IN ('padrao', 'destaque', 'secundaria'));
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.create_publicacao(
  p_titulo TEXT,
  p_categoria TEXT,
  p_resumo TEXT DEFAULT NULL,
  p_documento_id UUID DEFAULT NULL,
  p_data_publicacao TIMESTAMPTZ DEFAULT NULL,
  p_modo_exibicao TEXT DEFAULT 'padrao'
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
  v_modo_exibicao TEXT := COALESCE(NULLIF(BTRIM(p_modo_exibicao), ''), 'padrao');
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

  IF v_modo_exibicao NOT IN ('padrao', 'destaque', 'secundaria') THEN
    RAISE EXCEPTION 'Modo de exibição da publicação inválido.';
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
    autor_id,
    modo_exibicao
  )
  VALUES (
    v_org_id,
    v_titulo,
    v_categoria,
    NULLIF(BTRIM(p_resumo), ''),
    p_documento_id,
    COALESCE(p_data_publicacao, NOW()),
    auth.uid(),
    v_modo_exibicao
  )
  RETURNING id INTO v_publicacao_id;

  RETURN v_publicacao_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_publicacao(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, TEXT) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_publicacao(
  p_publicacao_id UUID,
  p_titulo TEXT,
  p_categoria TEXT,
  p_resumo TEXT DEFAULT NULL,
  p_documento_id UUID DEFAULT NULL,
  p_modo_exibicao TEXT DEFAULT 'padrao'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_id UUID := public.current_user_org_id();
  v_role TEXT := public.current_user_role();
  v_titulo TEXT := NULLIF(BTRIM(p_titulo), '');
  v_categoria TEXT := NULLIF(BTRIM(p_categoria), '');
  v_modo_exibicao TEXT := COALESCE(NULLIF(BTRIM(p_modo_exibicao), ''), 'padrao');
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

  IF v_titulo IS NULL THEN
    RAISE EXCEPTION 'Informe um título para a publicação.';
  END IF;

  IF v_categoria IS NULL
    OR v_categoria NOT IN ('procedimento', 'manual', 'seguranca_saude', 'comunicado') THEN
    RAISE EXCEPTION 'Categoria de publicação inválida.';
  END IF;

  IF v_modo_exibicao NOT IN ('padrao', 'destaque', 'secundaria') THEN
    RAISE EXCEPTION 'Modo de exibição da publicação inválido.';
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

  UPDATE public.publicacoes
  SET
    titulo = v_titulo,
    categoria = v_categoria,
    resumo = NULLIF(BTRIM(p_resumo), ''),
    documento_id = p_documento_id,
    modo_exibicao = v_modo_exibicao
  WHERE id = p_publicacao_id
    AND org_id = v_org_id
  RETURNING id INTO v_publicacao_id;

  IF v_publicacao_id IS NULL THEN
    RAISE EXCEPTION 'Publicação não encontrada para a organização atual.';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.update_publicacao(UUID, TEXT, TEXT, TEXT, UUID, TEXT) TO authenticated;

COMMIT;
