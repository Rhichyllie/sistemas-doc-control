BEGIN;

ALTER TABLE public.publicacoes
  ADD COLUMN IF NOT EXISTS imagem_foco TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'publicacoes_imagem_foco_check'
  ) THEN
    ALTER TABLE public.publicacoes
      ADD CONSTRAINT publicacoes_imagem_foco_check
      CHECK (
        imagem_foco IS NULL
        OR imagem_foco IN (
          'left top',
          'center top',
          'right top',
          'left center',
          'center center',
          'right center',
          'left bottom',
          'center bottom',
          'right bottom'
        )
      );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public.set_publicacao_image_focus(
  p_publicacao_id UUID,
  p_imagem_foco TEXT DEFAULT NULL
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
  v_imagem_foco TEXT := NULLIF(BTRIM(p_imagem_foco), '');
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

  IF v_imagem_foco IS NOT NULL
    AND v_imagem_foco NOT IN (
      'left top',
      'center top',
      'right top',
      'left center',
      'center center',
      'right center',
      'left bottom',
      'center bottom',
      'right bottom'
    ) THEN
    RAISE EXCEPTION 'Enquadramento da imagem inválido.';
  END IF;

  UPDATE public.publicacoes
  SET imagem_foco = COALESCE(v_imagem_foco, 'center center')
  WHERE id = p_publicacao_id
    AND org_id = v_org_id
  RETURNING id INTO v_publicacao_id;

  IF v_publicacao_id IS NULL THEN
    RAISE EXCEPTION 'Publicação não encontrada para a organização atual.';
  END IF;

  RETURN TRUE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_publicacao_image_focus(UUID, TEXT) TO authenticated;

COMMIT;
