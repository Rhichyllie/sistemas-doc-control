# Debug Session: publication-save-missing
- **Status**: [OPEN]
- **Issue**: Ao criar publicação com imagem e notícia, após atualizar a página os dados somem e não aparecem salvos no Supabase.
- **Debug Server**: pending
- **Log File**: .dbg/trae-debug-log-publication-save-missing.ndjson

## Reproduction Steps
1. Abrir a área de organização/notícias.
2. Criar uma nova publicação.
3. Informar título, categoria, resumo e imagem.
4. Salvar a publicação.
5. Atualizar a página.
6. Observar que publicação e imagem somem e não estão persistidas no Supabase.

## Hypotheses & Verification
| ID | Hypothesis | Likelihood | Effort | Evidence |
|----|------------|------------|--------|----------|
| A | O insert em `publicacoes` falha por RLS/permissão. | High | Low | Pending |
| B | O upload da imagem falha no bucket `publicacoes`. | High | Low | Pending |
| C | `profile.org_id` ou `profile.id` chega inválido no fluxo de criação. | Medium | Low | Pending |
| D | O diálogo captura erro sem feedback claro e aparenta sucesso. | Medium | Low | Pending |
| E | A gravação ocorre, mas a leitura pós-refresh falha e zera a lista. | Medium | Medium | Pending |

## Log Evidence
- `npx supabase migration list` confirmou que as migrations de `publicacoes` e `publicacoes_storage` já estavam aplicadas no banco remoto.
- `npx supabase inspect db table-stats --linked` confirmou que `public.publicacoes` existe no projeto remoto correto `ibnscyxzofgvavcwwoej` e permanece com `0` registros.
- O fluxo anterior do frontend fazia `insert/update` direto em `public.publicacoes`, uma tabela protegida por RLS com escrita restrita a admin.
- A correção aplicada substituiu a escrita direta por RPCs `create_publicacao` e `set_publicacao_image`, já publicadas no remoto em `20260806210500_publicacoes_write_rpcs.sql`.
- O fluxo do diálogo foi reordenado para persistir primeiro a publicação e anexar a imagem em seguida.
- O Debug Server da sessão `publication-save-missing` foi reiniciado para a próxima reprodução.

## Verification Conclusion
Fix aplicado e aguardando validação do usuário no app.
