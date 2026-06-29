# P-8.7 — Cockpit Operacional do TRAMITA

## Objetivo

Esta fase transforma a tela inicial autenticada em uma central de comando operacional, sem migrations e sem introduzir a arquitetura enterprise completa. A entrega prioriza pendências do usuário, fila de aprovação, revisões documentais, alertas e movimentações recentes com os dados já disponíveis.

## Entregas

- Home Operacional em `/authenticated/dashboard`.
- Caixa consolidada em `/authenticated/atividades`.
- Indicadores analíticos anteriores preservados em `/authenticated/indicadores`.
- KPIs acionáveis para pendências, aprovações, atrasos, revisões e correções.
- Fila de Aprovação com filtros por prazo, projeto e tipo documental.
- Separação visual da fila entre atrasados, no prazo e sem prazo.
- Estados vazios e erros tratados sem confundir lista vazia com falha.
- Atividades Recentes da organização na Home.
- Atividades Recentes do documento em seu detalhe.
- Fallback de compatibilidade quando relação de projeto ou campos opcionais de SLA não estiverem disponíveis.

## Arquivos alterados

### Novos

- `src/hooks/useOperationalCockpit.ts`
- `src/components/operational/OperationalHome.tsx`
- `src/components/operational/OperationalKpiCards.tsx`
- `src/components/operational/ActivityInboxPreview.tsx`
- `src/components/operational/RecentActivityList.tsx`
- `src/components/operational/EmptyState.tsx`
- `src/routes/authenticated/atividades.tsx`
- `src/routes/authenticated/indicadores.tsx`
- `docs/P87_OPERATIONAL_COCKPIT.md`

### Atualizados

- `src/components/app-layout.tsx`
- `src/hooks/useApprovalFlow.ts`
- `src/hooks/useApprovalQueue.ts`
- `src/hooks/useDashboard.ts`
- `src/hooks/useDocuments.ts`
- `src/routes/authenticated/dashboard.tsx`
- `src/routes/authenticated/documents.$documentId.tsx`
- `src/routes/authenticated/fluxo-de-aprovacao.tsx`
- `src/routeTree.gen.ts` (regenerado pelo plugin do TanStack Router)

## Fontes de dados

| Informação | Fonte principal | Fallback |
| --- | --- | --- |
| Aprovações do usuário | `approval_flows` por organização, papel e responsável | Consulta sem `due_at` e sem relação de projeto |
| Notificações e menções | `notifications` do usuário | Item omitido quando não existe dado real |
| Correções após reprovação | `notifications.type = document_rejected` e documento em `draft` | `documents.status = rejected`, caso exista em outro ambiente |
| Revisões próximas ou atrasadas | `documents.next_review_at` em documentos publicados | Sem item quando não há data |
| Atividades gerais | `audit_trail` da organização | Documentos ordenados por `updated_at` |
| Atividades do documento | `audit_trail` filtrado por `document_id` | Estado vazio explícito |
| Projeto e área | Relação `documents.project_id -> projects` e `documents.area` | Área permanece; projeto fica indisponível |

## Decisões

1. A agregação operacional fica em `useOperationalCockpit`, reaproveitando `useApprovalQueue`, `useNotifications`, `useAuditTrail` e `useDocuments`.
2. A caixa de atividades ganhou rota própria para permitir filtros sem sobrecarregar a Home.
3. A Home usa cards e listas curtas; os gráficos analíticos anteriores foram preservados na rota **Indicadores** para não sobrecarregar a entrada autenticada.
4. A rota da fila exige autenticação e a própria tela informa quando o papel não pode decidir. Revisores e aprovadores conseguem abrir a fila, inclusive vazia.
5. As ações existentes de Aprovar e Rejeitar foram preservadas.
6. O projeto só aparece quando a relação já existe e possui valor. Nenhum dado artificial é criado.
7. Falha na trilha de auditoria não bloqueia a Home: documentos recentes passam a ser a fonte de atividade.
8. Foi incluída a constante defensiva de status bloqueados usada pelo fluxo existente. Sem ela, a ação de aprovação poderia gerar erro em tempo de execução.

## Limitações

- O schema versionado aceita `draft`, `in_review`, `pending_approval`, `published` e `obsolete`. A reprovação atual retorna o documento para `draft`; por isso a caixa identifica correções pela notificação `document_rejected` enquanto o documento continua em rascunho.
- `useNotifications` carrega as 20 notificações mais recentes. Uma reprovação mais antiga pode não entrar na caixa se já estiver fora dessa janela.
- Não existe uma tabela específica de inbox. Os itens são agregados no cliente e não possuem estado independente de conclusão.
- Não existe entidade de comentários nesta fase. Eventos aparecem apenas quando foram registrados em `audit_trail`.
- Os campos `due_at`, `due_days`, `started_at`, `completed_at` e `escalation_user_id` são usados pelo workflow atual, mas não aparecem nas migrations versionadas do repositório. A leitura da fila possui fallback sem SLA; criação e evolução completa do workflow continuam dependentes do ambiente já possuir esses campos.
- O vínculo de projeto é opcional. Quando a relação não está disponível, os filtros e textos por projeto são omitidos sem impedir a carga dos documentos.
- Não foi criada nem executada migration.

## Itens reservados para P-9

- Consolidação do workflow enterprise completo.
- Grupos avançados e distribuição por grupo.
- Ausência, férias, licença e substituição de responsáveis.
- Encaminhamento e devolução administrativa avançada.
- Persistência própria da caixa de atividades e regras formais de conclusão.
- Revisão versionada dos campos de SLA atualmente existentes apenas em alguns ambientes.
- Máscara inteligente de código.

## Itens reservados para P-12/P-14

Conforme priorização futura do roadmap:

- Ambientes e administração avançada da plataforma.
- Billing, planos comerciais e controles de assinatura.
- SSO e webhooks.
- Integrações analíticas e executivas, incluindo Power BI e PowerPoint.

Nenhum desses itens foi iniciado nesta fase.

## Como testar manualmente

1. Entrar com um usuário autenticado e confirmar o redirecionamento para `/authenticated/dashboard`.
2. Verificar os KPIs e os atalhos da Home.
3. Abrir **Minhas Atividades** e testar filtros de tipo e prioridade.
4. Abrir **Indicadores** e confirmar métricas, tabela de revisões e gráficos por tipo e área.
5. Confirmar o estado vazio com um usuário sem pendências.
6. Entrar como revisor, aprovador, gestor ou administrador e abrir **Fila de Aprovação**.
7. Testar os filtros **Todos**, **Atrasados**, **No prazo**, **Sem prazo**, projeto e tipo.
8. Confirmar que uma fila vazia abre e mostra “Nenhuma aprovação pendente”.
9. Em um item real, abrir o documento e validar código, tipo, área/projeto, etapa, responsável, status e prazo.
10. Executar Aprovar e Rejeitar em um ambiente de teste e confirmar que os diálogos e validações existentes continuam funcionando.
11. Abrir um documento e verificar **Atividades Recentes do Documento**.
12. Simular indisponibilidade dos campos opcionais de SLA em ambiente compatível e confirmar o aviso de modo de compatibilidade.
13. Executar:

```powershell
bunx tsc --noEmit
bun run build
```

O aviso sobre Node.js 20.17.0 versus 20.19+ pode ser ignorado temporariamente; o build deve terminar com sucesso.
