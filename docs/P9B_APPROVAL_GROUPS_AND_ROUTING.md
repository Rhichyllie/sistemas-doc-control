# P-9B — Administração de Grupos e Roteamento Visual

## Objetivo

Tornar utilizável a fundação P-9A com:

- administração de grupos de aprovação;
- gestão de membros;
- roteamento sequencial por papel, usuário ou grupo;
- nomes legíveis na Fila de Aprovação;
- fallback para ambientes que ainda não receberam a migration P-9A.

Esta fase não implementa workflow paralelo, votação, majority approval, ausência, férias, licença ou intervenção administrativa avançada.

> **Compatibilidade de schema:** instalações antigas podem usar `profile_id`, `role_in_group` e `active` em `approval_group_members`. O bridge lógico 09 cria aliases sincronizados para `user_id/profile_id`, `role/role_in_group` e `is_active/active`. Os hooks de grupos tentam o contrato enterprise e fazem fallback para o legado quando necessário.

## Arquivos criados

- `src/hooks/useApprovalGroups.ts`
- `src/components/workflow/WorkflowStepRoutingFields.tsx`
- `src/routes/authenticated/grupos-aprovacao.tsx`
- `docs/P9B_APPROVAL_GROUPS_AND_ROUTING.md`

## Arquivos alterados

- `src/components/app-layout.tsx`
- `src/routes/authenticated/documents.$documentId.tsx`
- `src/routes/authenticated/fluxo-de-aprovacao.tsx`
- `src/routeTree.gen.ts`

## Tabelas usadas

### `approval_groups`

Usada para listar, criar, editar, ativar e desativar grupos.

Campos consumidos:

- `id`;
- `org_id`;
- `name`;
- `description`;
- `scope`;
- `project_id`;
- `is_active`;
- `metadata`;
- `created_at`;
- `updated_at`.

### `approval_group_members`

Usada para adicionar, reativar, remover logicamente e alterar o papel de membros.

Campos consumidos:

- `id`;
- `org_id`;
- `group_id`;
- `user_id` ou `profile_id`;
- `role` ou `role_in_group`;
- `is_active` ou `active`;
- `created_at`.

### `profiles`

Fonte real dos usuários da organização. A UI mostra nome, e-mail e papel do sistema quando disponíveis.

### `approval_flows`

O builder salva:

- `assignment_type`;
- `required_role`;
- `assignee_user_id` para usuário;
- `assignee_group_id` para grupo;
- `due_days`;
- `instructions`;
- demais campos de SLA já tratados pelo P-9A.

## Dependência da migration P-9A

P-9B não cria uma migration nova. Ela depende de:

`supabase/migrations/20260629_p9a_workflow_enterprise_foundation.sql`

Se esse SQL ainda não estiver aplicado, a aplicação:

- continua abrindo;
- mantém roteamento por papel e usuário legado;
- mostra aviso de compatibilidade;
- desabilita criação e seleção de grupos;
- mantém a Fila de Aprovação funcional no contrato disponível.

## SQL para aplicação manual

Não existe SQL adicional de P-9B. No Supabase SQL Editor, execute o conteúdo completo e sem alterações do arquivo:

`supabase/migrations/20260629_p9a_workflow_enterprise_foundation.sql`

Esse arquivo:

- adiciona campos de SLA e atribuição em `approval_flows`;
- cria `approval_groups`;
- cria `approval_group_members`;
- complementa tabelas de template apenas quando elas já existem;
- cria `v_approval_sla_status`;
- cria índices, FKs e policies;
- solicita recarga do schema PostgREST.

Nenhum SQL foi executado remotamente nesta fase.

## Queries de conferência

### Confirmar tabelas e view

```sql
select
  to_regclass('public.approval_groups') as approval_groups,
  to_regclass('public.approval_group_members') as approval_group_members,
  to_regclass('public.v_approval_sla_status') as v_approval_sla_status;
```

### Confirmar colunas de atribuição

```sql
select table_name, column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and (
    (table_name = 'approval_flows' and column_name in (
      'assignment_type',
      'assignee_user_id',
      'assignee_group_id',
      'due_at',
      'due_days',
      'started_at',
      'completed_at',
      'instructions'
    ))
    or table_name in ('approval_groups', 'approval_group_members')
  )
order by table_name, ordinal_position;
```

### Confirmar policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'approval_groups',
    'approval_group_members',
    'approval_flows'
  )
order by tablename, policyname;
```

### Conferir grupos e membros por organização

```sql
select
  approval_group.id,
  approval_group.org_id,
  approval_group.name,
  approval_group.scope,
  approval_group.is_active,
  count(member.id) filter (where member.is_active) as active_members
from public.approval_groups as approval_group
left join public.approval_group_members as member
  on member.group_id = approval_group.id
group by
  approval_group.id,
  approval_group.org_id,
  approval_group.name,
  approval_group.scope,
  approval_group.is_active
order by approval_group.name;
```

### Conferir atribuições recentes

```sql
select
  id,
  org_id,
  document_id,
  step,
  step_label,
  assignment_type,
  required_role,
  assignee_user_id,
  assignee_group_id,
  due_at,
  status
from public.approval_flows
order by created_at desc
limit 50;
```

## Administração de grupos

A rota autenticada é:

`/authenticated/grupos-aprovacao`

O menu mostra **Grupos de Aprovação** somente para:

- `admin`;
- `manager`.

O projeto não possui os papéis `gestor` ou `coordenador` no perfil enterprise atual. A checagem usa `profile.role`, seguindo o mesmo padrão do menu de configurações.

O acesso direto não redireciona nem quebra: usuários sem permissão recebem uma mensagem de acesso restrito.

### Operações

- criar grupo;
- editar nome, descrição e escopo;
- ativar ou desativar;
- listar membros ativos;
- adicionar ou reativar membro;
- remover membro por desativação lógica;
- alterar papel interno entre membro, líder e suplente.

Nenhum grupo ou membro é criado automaticamente.

## Roteamento visual

O ponto real de criação de etapas no sistema atual é o diálogo **Configurar Fluxo de Aprovação**, no detalhe de um documento em `draft`.

O builder agora oferece:

### Papel

- seleciona `required_role`;
- limpa usuário e grupo;
- mantém compatibilidade integral com o fluxo anterior.

### Usuário

- seleciona um usuário ativo da organização;
- salva `assignment_type = user`;
- salva `assignee_user_id`;
- mantém `assignee_id` como espelho legado pelo hook P-9A.

### Grupo

- seleciona um grupo ativo;
- salva `assignment_type = group`;
- salva `assignee_group_id`;
- preserva `required_role` como semântica e fallback.

A Fila de Aprovação oferece o atalho **Configurar roteamento**, que leva à lista de documentos. Não foi criado um segundo builder na fila para evitar duas implementações concorrentes de submissão.

## Fila de Aprovação

Cada item mostra:

- tipo de atribuição;
- “Atribuído ao papel”, “Atribuído ao usuário” ou “Atribuído ao grupo”;
- nome legível do ator;
- data do prazo;
- “Sem prazo definido”, prazo restante ou “SLA vencido há N dias”;
- aviso de compatibilidade quando necessário.

Filtros, agrupamento por prazo, ações e estados vazios do P-8.7 foram preservados.

## Fallbacks

- ausência de `approval_groups`: grupos vazios, `canUseGroups = false` e UI desabilitada;
- ausência de `approval_group_members`: grupos permanecem consultáveis, membros ficam vazios e gestão de membros é desabilitada;
- ausência da relação de projeto: nenhum seletor de projeto é exibido;
- ausência da fundação P-9A em `approval_flows`: o hook mantém os fallbacks legados do P-9A;
- grupo indisponível no builder: Papel e Usuário continuam funcionando.

Todas as falhas do Supabase são convertidas com `getErrorMessage`.

## Limitações

- A tabela atual `projects` não possui `org_id`; por isso o vínculo visual de projeto foi ocultado para evitar seleção entre organizações.
- Não existe UI ativa de `approval_templates` ou `approval_template_steps`. A melhoria foi aplicada ao builder real de etapas por documento.
- Remover membro usa `is_active = false`; não há exclusão física.
- Os papéis internos `member`, `lead` e `backup` são classificações administrativas. Todos os membros ativos recebem a atribuição do grupo nesta fase.
- Não há encaminhamento, devolução administrativa, workflow paralelo ou votação.

## Como testar

### Sem migration P-9A

1. abrir `/authenticated/grupos-aprovacao` como administrador ou gestor;
2. confirmar aviso de compatibilidade e ações desabilitadas;
3. abrir um documento em rascunho;
4. confirmar Papel e Usuário disponíveis;
5. confirmar Grupo desabilitado;
6. abrir a fila e confirmar que ela continua carregando.

### Com migration P-9A em ambiente de teste

1. criar um grupo;
2. editar nome e descrição;
3. adicionar dois membros;
4. alterar o papel interno de um membro;
5. remover e readicionar o membro;
6. desativar e reativar o grupo;
7. abrir documento em rascunho;
8. criar etapa por papel;
9. criar etapa por usuário;
10. criar etapa por grupo;
11. preencher SLA e instruções;
12. submeter o documento;
13. entrar como membro do grupo e confirmar o item na fila;
14. confirmar textos de atribuição e SLA;
15. aprovar ou rejeitar e validar auditoria/notificações.

### Validação local

```powershell
bunx tsc --noEmit
bun run build
```

## Reservado para P-9C

- encaminhamento simples;
- devolução administrativa simples;
- persistência formal da caixa de atividades;
- melhoria de auditoria em ações operacionais.

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
- analytics;
- previsibilidade;
- Power BI;
- PowerPoint.
