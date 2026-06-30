# P-10A.3 — Schema Doctor e Diagnóstico Enterprise

## Objetivo

O Schema Doctor verifica se o Supabase possui as tabelas, colunas, policies e RPCs exigidas pelos módulos enterprise do TRAMITA.

Ele foi criado após divergências reais entre schemas legados e o código enterprise, principalmente nos membros de grupos, workflow, correção, revisão formal e publicação transacional.

O diagnóstico não altera dados, não cria campos e não aplica ciclos SQL.

## Migration

Arquivo:

`supabase/migrations/20260629_p10a3_schema_doctor.sql`

A migration cria:

```sql
public.get_schema_doctor_report() returns jsonb
```

Características:

- `SECURITY DEFINER`;
- `search_path = public`;
- execução concedida a `authenticated`;
- validação interna para `admin` e `manager`;
- leitura de `information_schema` e catálogos `pg_catalog`;
- nenhuma alteração em dados ou schema durante o diagnóstico.

## Checks implementados

### Workflow Enterprise

- tabelas `approval_flows`, `audit_trail` e `notifications`;
- atribuição por tipo, usuário e grupo;
- SLA por data e por dias;
- metadata enterprise;
- policy de decisão do ator enterprise.

Para compatibilidade com instalações existentes, a policy é considerada disponível quando existe como `approval_update_enterprise_actor` ou pelo nome equivalente `approvals_update_assignee`.

### Grupos de Aprovação

- `approval_groups`;
- `approval_group_members`;
- aliases `profile_id/user_id`;
- aliases `role_in_group/role`;
- aliases `active/is_active`.

### Correção/Reenvio

- `comment`;
- `decided_by`;
- `decided_at`;
- `correction_round`;
- `resubmitted_from_step_id`.

### Revisão Formal

- ponteiros `published_version_id` e `working_version_id`;
- vínculo do workflow com `document_version_id` e `revision_number`;
- campos do ciclo formal em `document_versions`;
- policies de atualização da versão e do documento mestre.

### Publicação Transacional

- `publish_formal_revision`;
- `reject_formal_revision`.

## Interpretação

### `ok`

**Schema enterprise pronto.**

Todos os checks registrados foram encontrados.

### `warning`

**Alguns recursos possuem fallback, mas o ambiente não está completo.**

Há item ausente classificado como compatível com fallback ou evolução gradual, por exemplo alias enterprise, SLA complementar ou RPC transacional.

### `critical`

**Recursos enterprise podem falhar. Aplique os ciclos indicados antes de testar.**

Há tabela, campo de integridade ou policy essencial ausente.

O relatório também retorna capacidades independentes:

- `canUseWorkflowEnterprise`;
- `canUseGroups`;
- `canUseCorrectionCycle`;
- `canUseFormalRevision`;
- `canUseTransactionalPublish`.

## Ciclos recomendados

| Item | Ciclo |
|---|---|
| Tabelas base de documentos, workflow e auditoria | `01_TRAMITA_foundation_schema` |
| Tabelas de grupos | `08_TRAMITA_workflow_repair_and_groups_schema` |
| Aliases de membros, atribuição e SLA | `09_TRAMITA_enterprise_schema_alignment_bridge` |
| Decisão, rejeição e reenvio | `10_TRAMITA_decision_and_correction_cycle` |
| Revisão formal e ponteiros | `11_TRAMITA_formal_revision_lifecycle` |
| RPCs transacionais | `12_TRAMITA_formal_revision_transactional_hardening` |

O ciclo 13 instala somente o diagnóstico; ele não substitui nenhum ciclo anterior.

## Aplicação manual

No Supabase SQL Editor:

1. abra `supabase/migrations/20260629_p10a3_schema_doctor.sql`;
2. revise o conteúdo completo;
3. execute do `BEGIN;` ao `COMMIT;`;
4. aguarde o `NOTIFY pgrst, 'reload schema'`;
5. execute as queries de conferência;
6. acesse `/authenticated/schema-doctor` com um perfil `admin` ou `manager`.

Nenhum SQL desta fase é executado automaticamente pelo frontend.

## Queries de conferência

### Conferir a função

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_schema_doctor_report';
```

### Testar no SQL Editor

```sql
select public.get_schema_doctor_report();
```

No SQL Editor, a chamada pode não possuir o contexto JWT de um usuário autenticado. Como a função exige `auth.uid()` e papel `admin/manager`, o teste funcional completo deve ser feito pela tela autenticada. Não enfraqueça essa validação para facilitar testes.

### Conferir segurança e privilégio

```sql
select
  routine_name,
  security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name = 'get_schema_doctor_report';

select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name = 'get_schema_doctor_report'
order by grantee;
```

Esperado:

- `security_type = DEFINER`;
- `authenticated` com `EXECUTE`;
- ausência de `PUBLIC`.

## Testes manuais

### Ambiente completo

1. entre como `admin` ou `manager`;
2. abra **Schema Doctor**;
3. atualize o diagnóstico;
4. confirme status geral `ok`;
5. confirme as cinco capacidades disponíveis.

### RPC ainda não instalada

1. abra a tela em ambiente sem o ciclo P-10A.3;
2. confirme a mensagem orientando aplicar o ciclo ou usar a documentação;
3. confirme que a tela não tenta consultar `information_schema` diretamente.

### Acesso restrito

1. acesse a URL diretamente com perfil sem permissão;
2. confirme a mensagem **Acesso restrito. Esta área é para administradores e gestores.**;
3. confirme que a RPC não é chamada;
4. confirme que o item não aparece no menu.

### Item ausente

1. use um ambiente de teste com algum ciclo incompleto;
2. confirme o item como `missing`;
3. confira impacto, severidade e ciclo sugerido;
4. confirme a capacidade relacionada como indisponível.

## Limitações

- verifica existência, não a qualidade dos dados armazenados;
- não valida semanticamente todas as expressões de policies;
- não valida constraints, triggers ou índices que não estejam na lista de checks;
- não executa uma publicação ou rejeição real para testar as RPCs;
- o relatório é um retrato do catálogo no momento da execução;
- depende da própria RPC P-10A.3 para acesso seguro aos catálogos;
- a consulta direta no SQL Editor exige contexto de autenticação compatível.

## Próximos passos

Evoluções futuras podem adicionar:

- checks de constraints e FKs;
- checks de storage e buckets;
- versão registrada do schema;
- histórico append-only dos diagnósticos;
- exportação de relatório para suporte;
- testes controlados de RLS sem exposição de dados.
