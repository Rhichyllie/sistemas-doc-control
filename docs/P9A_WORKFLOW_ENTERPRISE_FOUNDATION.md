# P-9A — Workflow Enterprise Foundation

## Objetivo

Versionar a fundação enterprise do workflow documental do TRAMITA sem remover o contrato atual e sem exigir que o banco remoto receba a migration antes do deploy do frontend.

A fase prepara atribuição por papel, usuário ou grupo, SLA versionado, instruções por etapa, dados de escalonamento futuro e compatibilidade com a fila e com o builder de fluxo existentes.

> **Compatibilidade posterior:** alguns ambientes já possuíam `approval_group_members` com `profile_id`, `role_in_group` e `active`. O bridge lógico 09 adiciona e sincroniza os aliases `user_id/profile_id`, `role/role_in_group` e `is_active/active`. O frontend mantém fallback para o contrato legado quando o bridge ainda não estiver disponível.

## Auditoria do estado anterior

### Tabelas existentes nas migrations

As migrations anteriores à P-9A versionavam:

- `organizations`;
- `profiles`;
- `projects`;
- `documents`;
- `document_versions`;
- `approval_flows`;
- `audit_trail`;
- `notifications`;
- tabelas legadas de disciplinas, revisões e auditoria.

Somente `approval_flows` existia como estrutura versionada de workflow enterprise.

### `approval_flows` antes da P-9A

A migration `20260613125840_approval_and_audit.sql` criava:

- `id`;
- `document_id`;
- `org_id`;
- `step`;
- `step_label`;
- `required_role`;
- `assignee_id`;
- `status`;
- `comment`;
- `decided_at`;
- `decided_by`;
- `created_at`.

O código já tentava usar os campos não versionados:

- `due_at`;
- `due_days`;
- `started_at`;
- `completed_at`;
- `escalation_user_id`;
- `metadata`.

Portanto, o build passava porque o cliente Supabase não está tipado pelo schema remoto, mas ambientes criados apenas pelas migrations poderiam falhar em runtime.

### Templates

Não há criação de `approval_templates` ou `approval_template_steps` nas migrations atuais. Também não há hook ou tela ativa lendo essas tabelas.

O documento `P85_WORKFLOW_CASCADE.md` mencionava campos futuros de template, mas eles não estavam implementados no repositório. A migration P-9A altera essas tabelas somente se elas já existirem no ambiente de destino. Ela não cria um modelo de templates sem conhecer suas colunas-base.

Campos condicionais preparados em `approval_template_steps`:

- `assignment_type`;
- `assignee_user_id`;
- `assignee_group_id`;
- `due_days`;
- `is_required`;
- `instructions`;
- `escalation_user_id`;
- `escalation_group_id`;
- `metadata`.

Campos condicionais preparados em `approval_templates`:

- `mode`;
- `default_due_days`;
- `metadata`.

### Fila anterior

`useApprovalQueue` consultava etapas com `status = pending` e, para usuários que não fossem administradores ou gestores, exigia simultaneamente:

- `required_role` igual ao papel do perfil;
- `assignee_id` igual ao usuário ou vazio.

Depois da consulta, itens sem documento relacionado eram removidos. O P-8.7 já possuía fallback sem `due_at` e sem relação de projeto, mas ainda não conhecia usuário enterprise ou grupo.

A P-9A passa a carregar as etapas pendentes da organização e filtra no cliente:

- atribuição por papel compatível;
- atribuição direta ao usuário;
- atribuição a grupo ativo do qual o usuário é membro.

Documentos em `draft`, `published` ou `obsolete`, além de relações órfãs, não entram na fila.

### Aprovação e rejeição anteriores

`useApprovalFlow` implementava:

1. `draft` → `in_review` ao submeter;
2. criação sequencial das etapas;
3. aprovação de etapa e início da próxima;
4. publicação quando não restam etapas;
5. rejeição para `draft`;
6. registro em `audit_trail`;
7. notificações por responsável direto ou papel;
8. bloqueio para o autor aprovar a etapa final do próprio documento.

O código já escrevia SLA, mas não possuía fallback de inserção quando essas colunas faltavam.

### Grupos antes da P-9A

Não existiam tabelas, hooks ou componentes ativos para grupos de aprovação. O único agrupamento encontrado no código era relacionado a dados legados ou apresentação, não a atores do workflow.

## Migration criada

Arquivo:

`supabase/migrations/20260629_p9a_workflow_enterprise_foundation.sql`

A migration não foi aplicada automaticamente.

### Campos adicionados em `approval_flows`

- `due_at timestamptz`;
- `due_days integer`;
- `started_at timestamptz`;
- `completed_at timestamptz`;
- `escalation_user_id uuid`;
- `escalation_notified_at timestamptz`;
- `metadata jsonb`;
- `assignment_type text`;
- `assignee_user_id uuid`;
- `assignee_group_id uuid`;
- `instructions text`.

O campo legado `assignee_id` foi preservado. Registros existentes com `assignee_id` são espelhados em `assignee_user_id` e classificados como atribuição por usuário.

### Tabelas adicionadas

`approval_groups`:

- identificação e organização;
- nome e descrição;
- escopo organizacional ou futuro escopo por projeto;
- projeto opcional;
- estado ativo;
- metadata;
- timestamps.

`approval_group_members`:

- organização;
- grupo;
- usuário;
- papel interno no grupo;
- estado ativo;
- unicidade por grupo e usuário.

### Constraints

Foram preparadas constraints para:

- `approval_flows.assignment_type`: `role`, `user`, `group`;
- `approval_template_steps.assignment_type`: `role`, `user`, `group`, quando a tabela existir;
- `approval_templates.mode`: `sequential`, `parallel`, `mixed`, quando a tabela existir;
- FKs de usuário, grupo e escalonamento.

Constraints adicionadas sobre estruturas potencialmente preexistentes usam `NOT VALID`. Novas gravações são verificadas sem impedir a migration por dados legados ainda não validados.

### Índices

- `approval_flows(org_id, document_id)`;
- `approval_flows(org_id, status)`;
- `approval_flows(org_id, assignee_user_id)`;
- `approval_flows(org_id, assignee_group_id)`;
- `approval_flows(org_id, due_at)`;
- `approval_group_members(org_id, user_id)`;
- `approval_group_members(org_id, group_id)`;
- índice de `approval_template_steps` por organização e template, ou somente template, quando a tabela e as colunas existirem.

### View de SLA

`v_approval_sla_status` expõe:

- identificador da etapa;
- organização e documento;
- número da etapa e status;
- prazo e conclusão;
- indicador de atraso;
- dias de atraso;
- tipo de atribuição;
- usuário ou grupo atribuído.

A view usa `security_invoker`, preservando o RLS de `approval_flows`.

### RLS

`approval_groups` e `approval_group_members` possuem:

- leitura limitada à organização atual;
- escrita limitada a `admin` e `manager`.

A policy de atualização de `approval_flows` foi ampliada para reconhecer:

- `assignee_id` legado;
- `assignee_user_id`;
- papel compatível;
- membro ativo de `assignee_group_id`;
- administradores e gestores.

## Decisões de arquitetura

1. `assignee_id` não foi removido. Ele é necessário para deploy gradual e fallback.
2. `required_role` continua obrigatório como semântica da etapa, fallback e definição do próximo status documental.
3. `assignment_type` define o ator primário: `role`, `user` ou `group`.
4. A execução continua sequencial. Valores `parallel` e `mixed` são apenas preparados para templates futuros.
5. Grupos não são criados automaticamente e não existem dados artificiais.
6. Administração de grupos não faz parte desta fase.
7. O frontend consulta dados enterprise primeiro e reduz capacidade de forma explícita quando o schema ainda não está disponível.

## Hook de atores

`useWorkflowActors` retorna:

- usuários ativos da organização;
- grupos ativos;
- membros ativos;
- papéis usados pelo workflow;
- carregamento e erro;
- `canUseGroups`;
- mensagem de compatibilidade.

Se as tabelas de grupo não existirem, usuários e papéis continuam disponíveis, grupos ficam vazios e `canUseGroups` é `false`.

## Fallback do frontend

### Leitura da fila

Ordem das consultas:

1. schema enterprise com projeto;
2. schema enterprise sem relação de projeto;
3. schema legado com SLA;
4. schema legado base.

Em modo legado, atribuição por grupo não pode ser resolvida. A fila continua por papel ou `assignee_id`.

### Criação do fluxo

Ordem de persistência:

1. campos enterprise completos;
2. contrato legado com SLA;
3. contrato legado base.

No fallback:

- atribuição por usuário usa `assignee_id`;
- atribuição por papel usa `required_role`;
- atribuição por grupo degrada para `required_role`;
- instruções e associação de grupo só persistem no modo enterprise;
- SLA só persiste quando suas colunas existirem.

Se todas as inserções falharem, o documento é devolvido defensivamente para `draft`.

### Notificações

- usuário: notificação direta;
- grupo: todos os membros ativos, quando P-9A estiver disponível;
- papel ou fallback de grupo: usuários ativos daquele papel.

## Como aplicar manualmente

Antes de qualquer aplicação:

1. revisar o SQL;
2. criar backup do banco;
3. testar em ambiente local ou homologação;
4. validar dados legados antes de validar constraints `NOT VALID`.

Aplicação local com Supabase CLI:

```powershell
supabase start
supabase migration up
```

Aplicação em projeto vinculado, somente após aprovação operacional:

```powershell
supabase link --project-ref SEU_PROJECT_REF
supabase db push
```

Também é possível executar manualmente o conteúdo do arquivo no SQL Editor do Supabase. Nenhum desses comandos foi executado nesta fase.

## Como testar

### Sem aplicar a migration

1. abrir Home, Minhas Atividades e Fila de Aprovação;
2. confirmar a mensagem de compatibilidade;
3. confirmar fila por papel ou usuário legado;
4. submeter fluxo com responsável específico;
5. validar fallback com SLA ou base, conforme o ambiente;
6. aprovar e rejeitar uma etapa;
7. confirmar auditoria e notificações.

### Depois de aplicar em ambiente de teste

1. criar manualmente um grupo e membros autorizados;
2. consultar `useWorkflowActors` e confirmar `canUseGroups = true`;
3. inserir ou submeter uma etapa `assignment_type = group`;
4. entrar como membro e confirmar a etapa na fila;
5. entrar como não membro e confirmar que a etapa não aparece;
6. validar notificação dos membros;
7. validar atribuição por usuário sem depender do papel;
8. validar atribuição por papel;
9. consultar `v_approval_sla_status`;
10. confirmar que documentos `draft`, `published` e `obsolete` não aparecem na fila.

Validações locais:

```powershell
bunx tsc --noEmit
bun run build
```

## Limitações conhecidas

- As tabelas-base de templates não existem nas migrations atuais; a P-9A apenas as complementa quando presentes.
- O builder atual permite escolher papel ou usuário. A escolha visual de grupos fica para P-9B.
- Antes da migration, grupo degrada para papel e não mantém identidade própria.
- Não há fluxo paralelo, votação, majority approval ou tratamento completo de ausência.
- A migration não valida automaticamente constraints legadas marcadas como `NOT VALID`.
- Não há administração visual de grupos nesta fase.

## Reservado para P-9B

- tela de administração de grupos;
- criação e edição de grupos;
- gestão de membros;
- escolha visual de grupo, usuário ou papel nos templates;
- encaminhamento;
- devolução administrativa simples;
- testes manuais completos de fluxo com grupo.

## Reservado para P-10

- criação documental inteligente;
- modo rápido, guiado e especialista;
- templates de criação;
- cálculo automático de revisão.

## Reservado para P-12

- workflow paralelo e misto;
- ausência, férias e licença;
- escalonamento automático;
- majority approval;
- intervenção administrativa append-only completa.

## Reservado para P-14

- dashboards premium;
- analytics e previsibilidade;
- Power BI;
- PowerPoint.
