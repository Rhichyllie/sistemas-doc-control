# P-9C — Correção de Roteamento, SLA por Data e Atividades de Aprovação

## Objetivo

Corrigir o caminho entre a submissão de um documento e sua exibição operacional, mantendo compatibilidade com ambientes que ainda não receberam a migration P-9A.

A fase também acrescenta prazo por data específica ao builder sequencial, sem implementar calendário útil, feriados ou ausências.

## Problema relatado

Um documento atribuído diretamente ao próprio usuário podia não aparecer na Fila de Aprovação nem em Minhas Atividades depois do envio.

## Diagnóstico do fluxo anterior

### Criação das etapas

O ponto real de persistência é `submitForReview`, em `src/hooks/useApprovalFlow.ts`. A função:

1. alterava o documento de `draft` para `in_review`;
2. removia etapas pendentes anteriores;
3. inseria todas as etapas em `approval_flows`;
4. registrava `audit_trail`;
5. notificava o responsável da primeira etapa.

As etapas eram criadas com:

- `document_id` recebido pelo detalhe do documento;
- `org_id` do perfil autenticado;
- `status = pending`;
- `step`, `step_label` e `required_role`;
- campos enterprise quando disponíveis;
- fallback para `assignee_id` no contrato legado.

O documento criado pelo fluxo documental começa em `draft`.

### Causa encontrada

Foram encontrados três pontos concretos no código:

1. A rota da Fila de Aprovação só liberava a tabela para os papéis `admin`, `manager`, `reviewer` e `approver`. Um autor atribuído diretamente por `assignee_user_id` podia ser carregado corretamente pelo hook e, ainda assim, receber a tela de acesso restrito.
2. A atualização `draft` → `in_review` não conferia se alguma linha havia sido realmente alterada. No Supabase, um `UPDATE` que não encontra linha pode terminar sem erro. Como a Fila e Minhas Atividades ignoram documentos em `draft`, uma submissão parcialmente persistida ficaria invisível nas duas telas.
3. Todas as etapas sequenciais eram gravadas como `pending`, mas a fila não distinguia a etapa iniciada das etapas futuras. Isso podia expor etapas fora de ordem e gerar diferenças operacionais.

Minhas Atividades não possui outra consulta de aprovação: `useOperationalCockpit` usa `useApprovalQueue` como fonte dos itens `approval_pending` e dos indicadores da Home. Portanto, um item ausente da fila também fica ausente dessas duas superfícies.

O identificador comparado é `profile.id`. Para compatibilidade, atribuições por usuário consideram `assignee_user_id` e o campo legado `assignee_id`.

## Correções aplicadas

### Submissão e persistência

`useApprovalFlow` agora:

- normaliza cada etapa antes de alterar o documento;
- define `in_review` para uma primeira etapa de revisão e `pending_approval` quando a primeira etapa é de aprovação;
- confirma por retorno da operação que o documento saiu de `draft`;
- interrompe e informa erro caso a transição não tenha ocorrido;
- confirma que a quantidade de etapas inseridas é igual à quantidade configurada;
- grava a primeira etapa com `started_at`;
- grava `metadata.active_step` e a origem do prazo;
- mantém todas as etapas como `pending` para compatibilidade com o schema atual;
- preserva rollback para `draft` quando a criação das etapas falha;
- preserva `audit_trail` e notificações.

Persistência por tipo:

- `role`: `assignment_type = role`, `required_role` preenchido e IDs de usuário/grupo nulos;
- `user`: `assignment_type = user`, `assignee_user_id` preenchido, `assignee_id` espelhado para legado e grupo nulo;
- `group`: `assignment_type = group`, `assignee_group_id` preenchido, usuário nulo e `required_role` preservado como fallback semântico.

### Decisão da Fila de Aprovação

A fila consulta etapas `pending` da organização e aceita somente documentos em:

- `in_review`;
- `pending_approval`.

Ela não mostra `draft`, `published` ou `obsolete`.

Para cada documento, somente a etapa sequencial atual é considerada:

1. etapa pendente com `started_at`, quando o campo está disponível;
2. menor número de etapa pendente como fallback legado.

Depois disso, o item é atribuído ao usuário quando:

- `assignment_type = user` e `assignee_user_id = profile.id`;
- ou `assignee_id = profile.id` no contrato legado;
- ou `assignment_type = role` e `required_role = profile.role`;
- ou `assignment_type = group` e existe vínculo ativo do usuário com o grupo;
- ou o perfil é `admin`/`manager`, que mantém a visão gerencial.

A rota também permite abrir e decidir um item quando o hook retornou atribuição direta, independentemente do papel global do usuário.

### Minhas Atividades e Home

Não foi criada uma segunda regra. `useOperationalCockpit` continua consumindo `useApprovalQueue`, de modo que a mesma etapa atual alimenta:

- `/authenticated/fluxo-de-aprovacao`;
- `/authenticated/atividades`;
- indicadores e resumo de pendências em `/authenticated/dashboard`.

### Detalhe do documento

O detalhe agora carrega, com fallback:

- `assignment_type`;
- usuário atribuído;
- grupo atribuído;
- instruções;
- SLA e metadata.

A seção **Tramitação Atual** mostra:

- status do documento;
- etapa atual;
- tipo de atribuição;
- responsável;
- prazo;
- indicador de vencimento.

Etapas futuras permanecem visíveis no histórico como “aguardando”, mas não liberam ações antes de se tornarem a etapa atual.

## SLA por dias ou data específica

O builder oferece dois modos:

### Quantidade de dias

- salva `due_days`;
- calcula `due_at` a partir do momento da submissão;
- identifica o prazo como calculado em `metadata.due_mode`.

### Data específica

- recebe uma data no calendário;
- salva `due_at` diretamente no fim do dia local;
- grava `due_days = null`;
- identifica o prazo como manual em `metadata.due_mode`.

Os cálculos e rótulos foram centralizados em `src/lib/workflowDates.ts`.

## Compatibilidade com schema anterior

Nenhuma migration nova foi criada. A P-9C reaproveita `due_at`, `due_days`, `started_at`, `assignment_type`, `assignee_user_id`, `assignee_group_id` e `metadata`, já preparados por:

`supabase/migrations/20260629_p9a_workflow_enterprise_foundation.sql`

Se a P-9A ainda não estiver aplicada:

- a submissão tenta o contrato enterprise;
- depois tenta o contrato legado com SLA;
- por fim tenta o contrato base;
- papel e usuário continuam sendo persistidos e localizados por `required_role`/`assignee_id`;
- grupos ficam indisponíveis e a UI informa compatibilidade;
- a fila escolhe a menor etapa pendente quando `started_at` não existe;
- ausência dos relacionamentos enterprise não quebra o detalhe.

No contrato base, data específica, SLA enterprise e grupo não podem ser persistidos. Além disso, a decisão final continua sujeita às policies RLS existentes no ambiente; a policy P-9A é necessária para autorização completa por papel e grupo. Essa perda de capacidade é informada pelo modo de compatibilidade; nenhum dado falso é criado.

## Arquivos criados

- `src/lib/workflowDates.ts`;
- `docs/P9C_ROUTING_SLA_AND_ACTIVITY_FIXES.md`.

## Arquivos alterados

- `src/components/workflow/WorkflowStepRoutingFields.tsx`;
- `src/hooks/useApprovalFlow.ts`;
- `src/hooks/useApprovalQueue.ts`;
- `src/hooks/useDocument.ts`;
- `src/routes/authenticated/documents.$documentId.tsx`;
- `src/routes/authenticated/fluxo-de-aprovacao.tsx`.

## Limitações

- as etapas continuam sequenciais;
- etapas futuras usam `pending` porque o schema atual não formaliza `waiting`;
- SLA por dias usa dias corridos;
- não há feriados, calendário útil, expediente ou timezone organizacional;
- não há substituição por ausência;
- grupos dependem da migration P-9A;
- a data manual é tratada como fim do dia no timezone local do navegador;
- não foram criados testes automatizados de integração com um projeto Supabase.
- os cenários autenticados abaixo dependem de usuários, grupos e documentos reais do ambiente e não foram executados automaticamente durante esta alteração.

## Fases futuras

### P-9D

- encaminhamento simples de etapa;
- devolução administrativa simples;
- auditoria operacional de correções;
- registro de quem encaminhou e por quê.

### P-10

- criação documental inteligente;
- modos rápido, guiado e especialista;
- templates por tipo documental;
- cálculo automático de revisão documental.

### P-12

- calendário útil e feriados;
- férias, licença, ausência e substituição;
- SLA por dias úteis;
- escalonamento automático;
- workflow paralelo/misto;
- majority approval;
- intervenção administrativa append-only completa.

## Testes manuais

### Cenário 1 — usuário específico

1. Criar um documento e abrir seu detalhe.
2. Configurar a primeira etapa como **Usuário**.
3. Selecionar o próprio usuário.
4. Selecionar **Por data específica** e informar uma data futura.
5. Enviar para revisão.
6. Confirmar `in_review` ou `pending_approval` no detalhe.
7. Confirmar a etapa em Fila de Aprovação.
8. Confirmar o mesmo documento em Minhas Atividades.
9. Confirmar a pendência na Home.

### Cenário 2 — papel

1. Enviar um documento com etapa atribuída a um papel.
2. Entrar com usuário de papel compatível.
3. Confirmar a etapa atual na fila, em atividades e no detalhe.

### Cenário 3 — grupo

1. Enviar um documento para um grupo ativo.
2. Confirmar que um membro ativo vê a etapa.
3. Confirmar, quando houver dois usuários de teste, que um não membro não vê a etapa.

### Cenário 4 — estados vazios

1. Usar um usuário sem etapas atribuídas.
2. Abrir Fila de Aprovação.
3. Abrir Minhas Atividades.
4. Confirmar que ambas exibem estado vazio, sem erro.

### Conferência no banco

Após aplicar previamente a P-9A no ambiente de teste, conferir a submissão com:

```sql
select
  id,
  org_id,
  document_id,
  step,
  step_label,
  status,
  assignment_type,
  required_role,
  assignee_id,
  assignee_user_id,
  assignee_group_id,
  due_days,
  due_at,
  started_at,
  metadata
from public.approval_flows
where document_id = '<DOCUMENT_ID>'
order by step;
```

E o status do documento:

```sql
select id, org_id, status, updated_at
from public.documents
where id = '<DOCUMENT_ID>';
```
