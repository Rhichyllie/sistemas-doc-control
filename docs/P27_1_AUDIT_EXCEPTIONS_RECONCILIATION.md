# P-27.1 — Central de Exceções e Reconciliação

## Objetivo

Criar uma camada de controle para detectar, explicar, agrupar e acompanhar
inconsistências operacionais/auditáveis antes do piloto. A Central responde o
que está inconsistente, onde está a falha, qual fonte está ausente ou
incompleta e qual investigação é recomendada.

## Fronteira

A P-27.1 não corrige dados automaticamente. Ela não altera documentos,
versões, aprovações, trâmites, evidências, notificações, prazos, responsáveis
ou status operacional.

Escritas permitidas:

- registrar execução de reconciliação;
- registrar exceções detectadas;
- atualizar status da exceção para `acknowledged`, `ignored` ou `resolved`;
- registrar nota de resolução.

Escritas proibidas:

- `update documents`;
- `update document_versions`;
- `update approval_flows`;
- `update document_tramite_instances`;
- `update document_tramite_instance_steps`;
- `update internal_notifications`;
- `update audit_trail`;
- qualquer `delete` em entidade operacional;
- geração automática de notificação;
- envio externo.

## Diagnóstico inicial

Fontes reais já existentes no produto:

- `documents`;
- `document_versions`;
- `document_revisions`;
- `approval_flows`;
- `document_tramite_instances`;
- `document_tramite_instance_steps`;
- `document_tramite_instance_events`;
- `document_tramite_instance_evidence`;
- `internal_notifications`;
- `notification_events`;
- `audit_trail`;
- `audit_report_exports`.

Fontes opcionais ou limitadas herdadas da P-27:

- `document_revisions` é legado;
- notificações podem estar ausentes sem ciclo 23;
- execução de trâmite depende do ciclo 18;
- `audit_report_exports` depende do ciclo 26;
- P-27.1 reaproveita `get_audit_report_package` quando disponível para
  contagens e hash técnico do pacote atual.

Riscos de incompatibilidade:

- tabelas opcionais não instaladas;
- colunas de hardening adicionadas em ciclos posteriores;
- revisões legadas convivendo com versões formais;
- ambientes com dados criados antes do contrato transacional;
- exportações antigas sem hash técnico.

## Migration

Arquivo:

`supabase/migrations/20260709_p27_1_audit_exceptions_reconciliation.sql`

Nome no Supabase SQL Editor:

`27_TRAMITA_audit_exceptions_reconciliation`

## Tabelas

### `audit_reconciliation_runs`

Histórico append-only de execuções de reconciliação.

Campos principais:

- organização;
- usuário solicitante;
- escopo;
- período;
- status;
- cobertura de fontes;
- contagens;
- limitações;
- hash técnico do pacote atual quando calculável.

### `audit_reconciliation_exceptions`

Exceções detectadas pela reconciliação.

Campos principais:

- tipo de exceção;
- severidade;
- status;
- fonte;
- entidade;
- documento/projeto relacionado;
- descrição;
- recomendação;
- evidência técnica JSON;
- primeira e última ocorrência;
- reconhecimento, ignorar, resolução e nota.

## RPCs

### `get_audit_reconciliation_overview`

Read-only. Retorna:

- cobertura das fontes;
- contagens por severidade, status, tipo e fonte;
- exceções recentes;
- últimas execuções;
- limitações.

### `run_audit_reconciliation`

Calcula exceções e registra:

- uma linha em `audit_reconciliation_runs`;
- exceções em `audit_reconciliation_exceptions`;
- atualização de `last_seen_at` apenas em exceções abertas equivalentes.

Não altera operação.

### `update_audit_exception_status`

Atualiza somente a exceção P-27.1:

- `acknowledged`;
- `ignored`;
- `resolved`;
- nota de resolução.

### `get_audit_exception_detail`

Read-only. Retorna detalhe, evidência técnica, documento relacionado e run.

## Tipos de exceção cobertos

### Documentos

- documento sem versão formal canônica;
- documento sem trilha auditável compatível;
- documento sem código;
- documento com projeto órfão.

### Versões e revisões

- versão sem documento;
- versão sem hash;
- versão com status fora do contrato;
- revisão legada sem versão canônica.

### Trâmites

- instância sem documento;
- instância sem etapas;
- etapa sem instância;
- etapa vencida sem conclusão;
- etapa concluída sem evidência obrigatória;
- evento de trâmite órfão.

### Aprovações

- aprovação sem documento;
- aprovação pendente fora do SLA quando `due_at` existe;
- aprovação concluída sem `decided_by`;
- aprovação com `decided_at` anterior à criação.

### Evidências

- evidência de arquivo sem `file_name`;
- evidência de arquivo sem `file_hash`.

### Notificações

- notificação sem destinatário válido;
- notificação relacionada a documento inexistente;
- evento de notificação órfão.

### Auditoria e exportação formal

- `audit_trail` sem documento;
- mudança de status incompleta;
- exportação formal sem hash;
- exportação formal com manifesto, contagens, cobertura ou limitações vazias.

### Completude

- fonte canônica ausente;
- fonte opcional ausente;
- cobertura insuficiente declarada como limitação.

## Severidades

- `critical`;
- `high`;
- `medium`;
- `low`;
- `info`.

## Status

- `open`;
- `acknowledged`;
- `resolved`;
- `ignored`.

## RLS, permissões e grants

- Admin/manager podem ver e executar reconciliação organizacional.
- Usuário comum pode acessar somente escopo pessoal quando permitido.
- Escrita direta de authenticated nas tabelas é revogada.
- Escritas passam pelas RPCs `SECURITY DEFINER`.
- Service role mantém acesso total para suporte controlado.

## Rota

`/authenticated/auditoria/excecoes`

Menu:

`Central de Exceções`

## Fallbacks da tela

A UI diferencia:

- migration ausente;
- RPC ausente;
- RLS/permissão;
- nenhuma exceção;
- reconciliação nunca executada;
- erro real;
- fonte ausente ou limitada.

## Queries de conferência

### 27_CHECK_01_tables

```sql
select to_regclass('public.audit_reconciliation_runs') as runs,
       to_regclass('public.audit_reconciliation_exceptions') as exceptions;
```

### 27_CHECK_02_rls

```sql
select relname, relrowsecurity
from pg_class
where oid in (
  'public.audit_reconciliation_runs'::regclass,
  'public.audit_reconciliation_exceptions'::regclass
);
```

### 27_CHECK_03_policies

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'audit_reconciliation_runs',
    'audit_reconciliation_exceptions'
  )
order by tablename, policyname;
```

### 27_CHECK_04_functions

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef,
  provolatile
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_audit_reconciliation_overview',
    'run_audit_reconciliation',
    'update_audit_exception_status',
    'get_audit_exception_detail'
  )
order by proname;
```

### 27_CHECK_05_search_path

```sql
select
  proname,
  proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_audit_reconciliation_overview',
    'run_audit_reconciliation',
    'update_audit_exception_status',
    'get_audit_exception_detail'
  );
```

Esperado: `search_path=public, pg_catalog`.

### 27_CHECK_06_grants

```sql
select
  routine_name,
  privilege_type,
  grantee
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'get_audit_reconciliation_overview',
    'run_audit_reconciliation',
    'update_audit_exception_status',
    'get_audit_exception_detail'
  )
order by routine_name, grantee;
```

### 27_CHECK_07_no_operational_mutation

```sql
select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_audit_reconciliation_overview',
    'run_audit_reconciliation',
    'update_audit_exception_status',
    'get_audit_exception_detail'
  );
```

Revisar manualmente ausência de:

- `update public.documents`;
- `update public.document_versions`;
- `update public.approval_flows`;
- `update public.document_tramite_instances`;
- `update public.document_tramite_instance_steps`;
- `update public.internal_notifications`;
- `update public.audit_trail`;
- `delete from public.documents`;
- `perform public.generate_operational_notifications`;
- `net.http`;
- `pg_net`.

### 27_CHECK_08_counts

```sql
select severity, status, count(*)
from public.audit_reconciliation_exceptions
where org_id = public.current_user_org_id()
group by severity, status
order by severity, status;
```

### 27_CHECK_09_run

```sql
select public.run_audit_reconciliation(
  current_date - 29,
  current_date,
  'org',
  null,
  null
);
```

### 27_CHECK_10_overview

```sql
select public.get_audit_reconciliation_overview(
  current_date - 29,
  current_date,
  'org',
  null,
  null
);
```

## Testes manuais

1. Admin acessa `/authenticated/auditoria/excecoes`.
2. Admin executa reconciliação de 30 dias.
3. Lista mostra exceções ou estado vazio correto.
4. Cobertura diferencia fonte disponível, ausente e incompatível.
5. Ação reconhecer altera somente `audit_reconciliation_exceptions`.
6. Ação ignorar altera somente `audit_reconciliation_exceptions`.
7. Ação resolver aceita nota e não altera documento.
8. Usuário comum não acessa visão `org`.
9. RLS bloqueia dados de outra organização.
10. Relatórios P-27 continuam funcionando.
11. Indicadores P-26 continuam funcionando.
12. `bun run validate:structure` passa.
13. `bunx tsc --noEmit` passa.
14. `bun run build` passa.

## Limitações

- A reconciliação não corrige dados; ela orienta investigação.
- A comparação de hash usa leitura atual e não é assinatura digital.
- Não há snapshots históricos.
- Algumas regras são limitadas quando colunas/tabelas opcionais não existem.
- A lista de exceções por run é limitada para evitar carga excessiva.

## Próximo passo

Após aplicar e validar a P-27.1 em ambiente de teste, o próximo passo natural é
um hardening de reconciliação com deduplicação mais rica, notas históricas e
rotina de revisão assistida para piloto.
