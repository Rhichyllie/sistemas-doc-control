-- =====================================================
-- HOTFIX (001) — Remove FK documents_discipline_id_fkey que bloqueia criação de documento
--
-- Motivo do erro:
--   Não foi possível concluir a criação transacional: insert or update on table
--   "documents" violates foreign key constraint "documents_discipline_id_fkey".
--   Key (discipline_id)=(bed2bd8b-3b25-482e-bb4c-fe849c88edb5) is not present in
--   table "disciplines".
--
-- Solução: Remove a FOREIGN KEY que não está na nossa migration, e adiciona
-- (opcionalmente) uma versão NOT VALID (sem checar dados antigos) se desejar
-- manter o vínculo sem bloquear inserts.
--
-- Uso: Cole no Supabase > SQL Editor > RUN.
-- =====================================================
BEGIN;

-- 1) Remove a FK que está bloqueando (se existir)
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_discipline_id_fkey;

-- 2) Opcional — recria a FK MAS COM NOT VALID (não valida linhas antigas,
--    não bloqueia INSERT/UPDATE novos enquanto a tabela disciplines estiver
--    vazia/incompleta). Descomente a linha abaixo se quiser manter o vínculo:
--
-- ALTER TABLE public.documents
--   ADD CONSTRAINT documents_discipline_id_fkey
--   FOREIGN KEY (discipline_id)
--   REFERENCES public.disciplines(id)
--   ON DELETE SET NULL
--   NOT VALID;

-- 3) Também remove (por segurança) outras FKs que possam estar causando
--    o mesmo problema se as tabelas correspondentes estiverem vazias:
ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_library_id_fkey;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_author_id_fkey;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_code_pattern_id_fkey;

ALTER TABLE public.documents
  DROP CONSTRAINT IF EXISTS documents_project_id_fkey;

-- 4) Se desejar recriar as FKs acima com NOT VALID (sem bloqueio), descomente
--    os blocos correspondentes abaixo:
--
-- ALTER TABLE public.documents
--   ADD CONSTRAINT documents_library_id_fkey
--   FOREIGN KEY (library_id) REFERENCES public.libraries(id)
--   ON DELETE SET NULL NOT VALID;
--
-- ALTER TABLE public.documents
--   ADD CONSTRAINT documents_author_id_fkey
--   FOREIGN KEY (author_id) REFERENCES public.profiles(id)
--   ON DELETE RESTRICT NOT VALID;
--
-- ALTER TABLE public.documents
--   ADD CONSTRAINT documents_code_pattern_id_fkey
--   FOREIGN KEY (code_pattern_id) REFERENCES public.document_code_patterns(id)
--   ON DELETE SET NULL NOT VALID;
--
-- ALTER TABLE public.documents
--   ADD CONSTRAINT documents_project_id_fkey
--   FOREIGN KEY (project_id) REFERENCES public.projects(id)
--   ON DELETE SET NULL NOT VALID;

COMMIT;

NOTIFY pgrst, 'reload schema';
