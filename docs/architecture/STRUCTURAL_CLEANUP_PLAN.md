# Plano de Organização Estrutural

O plano é incremental. Cada etapa deve preservar comportamento, passar typecheck/build e ser entregue separadamente de mudanças de produto.

## R0 — Guardrails, documentação e scripts

- Padronizar encoding e finais de linha.
- Proteger arquivos gerados do formatador.
- Documentar arquitetura, fronteiras e rotas.
- Adicionar `repo:doctor`, `validate:structure` e `verify`.
- Não mover módulos de produto.

## R1 — Extrair navegação do AppLayout

- Mover catálogo, tipos e ordem do menu para `src/app/navigation`.
- Centralizar a regra visual `managerOnly`.
- Preservar paths, labels, ícones, badges e classes.
- Manter o comportamento do shell inalterado.

## R2 — Separar shell, sidebar, topbar e settings dialog

- Extrair componentes internos pequenos do `AppLayout`.
- Preservar tema, sidebar recolhível, importação/exportação e diálogos.
- Evitar alterar o layout enquanto as responsabilidades são separadas.

## R3 — Organizar features por domínio

- Aplicar organização por domínio primeiro em código novo.
- Mover componentes existentes somente quando houver benefício concreto.
- Usar etapas pequenas por domínio, com imports atualizados e regressão validada.

## R4 — Centralizar contratos Supabase e formatters

- Mapear contratos duplicados entre hooks e libs.
- Consolidar detecção de schema ausente.
- Resolver duplicidades como formatters e utilitários com nomes concorrentes.
- Não substituir tipos gerados por tipos manuais menos precisos.

## R5 — Preparar P-27.1

- Definir contrato de exceção e reconciliação antes de criar UI ou SQL.
- Reutilizar Auditoria, Diagnóstico e eventos existentes.
- Manter exceção separada de indicador, notificação e mutação automática.

## R6 — Snapshots e retenção

- Introduzir snapshots somente quando tendências históricas exigirem.
- Definir retenção, custo, privacidade e reconstrução antes do schema.
- Não inferir histórico a partir de retrato atual.

## Critérios por refactor

1. Escopo funcional inalterado.
2. Worktree inicial conhecida.
3. Diff pequeno e revisável.
4. `bun run validate:structure`.
5. `bun run typecheck`.
6. `bun run build`.
7. Teste manual proporcional ao risco.
