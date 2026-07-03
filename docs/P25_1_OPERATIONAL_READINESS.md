# P-25.1 — Diagnóstico e Prontidão Operacional

## Objetivo

A P-25.1 endurece a implantação de notificações, escalonamento e delegação
auditável antes do início da P-26. Ela não cria indicadores históricos nem
automação: fornece health check read-only, diagnóstico explicável, checklist de
go-live e roteiro de validação do piloto.

## Por que esta fase existe

A P-25 acrescentou operações sensíveis:

- inbox interna por destinatário;
- severidade e escalonamento;
- preferências pessoais;
- eventos append-only;
- outbox passiva;
- geração operacional on-demand;
- conclusão por substituto em etapa `specific_user`.

Esses recursos precisam ser comprovados no ambiente real. Tabela existente não
significa configuração concluída; consulta vazia também não prova RLS correta.
Por isso, a P-25.1 separa instalação, configuração, erro de leitura e fallback.

## Dependências

### Ciclo 18 — execução de trâmites

Fornece instâncias, etapas, eventos, autorização original e a RPC de conclusão.
Sem ele não existe ação delegada.

### Ciclo 21 — calendário e SLA

Fornece calendário, feriados, políticas e `add_business_days`. Sem ele Home e
Central mantêm comparação simples, mas a geração P-25 não deve ser considerada
pronta para produção.

### Ciclo 22 — ausências e delegações

Fornece `team_absences`, `team_delegation_rules`, `is_user_unavailable` e
`resolve_user_substitute`. Sem ele o substituto não pode ser comprovado.

### Ciclo 23 — notificações e escalonamento

Fornece as cinco tabelas enterprise, RPCs da inbox, geração on-demand,
escalonamento e `resolve_effective_tramite_actor`.

Sem o ciclo 23, sino e inbox usam `notifications` legado quando disponível.
Não há severidade, eventos, regras de escalonamento ou conclusão delegada.

## Ciclo SQL P-25.1

Arquivo:

`supabase/migrations/20260702_p25_1_operational_readiness.sql`

Nome no Supabase SQL Editor:

`24_TRAMITA_operational_readiness`

Aplicar manualmente depois do ciclo 23.

O ciclo cria somente:

```sql
public.get_operational_readiness()
```

A função:

- é `STABLE`, `SECURITY DEFINER` e read-only;
- exige usuário autenticado com papel `admin` ou `manager`;
- resolve a organização pelo perfil;
- usa `to_regclass`, catálogo de funções e `pg_policies`;
- executa apenas contagens leves da organização;
- não cria notificação;
- não chama geração operacional;
- não altera documento, etapa, responsável, prazo ou `approval_flows`;
- declara explicitamente que entrega externa está desativada.

## Diagnóstico Operacional

Rota:

`/authenticated/configuracoes/diagnostico`

Nome no menu:

**Diagnóstico Operacional**

A área é admin/manager-first e complementa o Schema Doctor:

- **Schema Doctor:** compatibilidade estrutural histórica do schema;
- **Diagnóstico Operacional:** prontidão integrada dos ciclos 18, 21, 22 e 23,
  configuração mínima e evidências de piloto.

Sem o ciclo 24, a tela executa consultas frontend leves e seguras. Esse modo
identifica tabelas ausentes e configuração vazia, mas marca policies e
contratos de função como **Somente fallback**, pois não pode comprová-los pelo
catálogo.

## Estados

- **OK:** requisito confirmado;
- **Atenção:** funciona, mas exige revisão;
- **Ausente:** contrato parcial ou item essencial faltando;
- **Não instalado:** ciclo/tabela indisponível;
- **Não configurado:** schema existe, mas não há configuração;
- **Erro de leitura:** o health check não conseguiu ler o contrato;
- **Somente fallback:** sinal frontend disponível, sem confirmação completa do
  banco.

## O que é validado

### Schema e ciclos

- ciclo 18 e RPC de conclusão;
- ciclo 21 e cálculo de dias úteis;
- ciclo 22 e resolução de substituto;
- ciclo 23 e RPCs de notificações;
- ciclo 24 e health check read-only.

### Notificações

- `internal_notifications`;
- `notification_preferences`;
- `notification_events`;
- `notification_escalation_rules`;
- `notification_delivery_outbox`;
- consulta de não lidas;
- eventos gerados;
- regra de escalonamento ou fallback padrão;
- outbox sem processador externo.

Uma notificação é rastreada por `notification_events`:

- `notification_created`;
- `notification_read`;
- `notification_dismissed`;
- `notification_generated`;
- `notification_suppressed`;
- `notification_escalated`.

O evento `notification_escalated` comprova o escalonamento. Ele não representa
reatribuição.

### Delegação

- `resolve_user_substitute`;
- `resolve_effective_tramite_actor`;
- contrato delegado de `complete_document_tramite_step`;
- limite a `assignment_type = specific_user`;
- titular preservado em `assignee_user_id`;
- ator real em `completed_by`;
- `delegated_from_user_id` na metadata;
- evidência delegada continua desabilitada.

### Calendário e SLA

- calendário padrão;
- timezone IANA reconhecido pelo PostgreSQL;
- feriados cadastrados/importados;
- política SLA ativa;
- ausência e delegação de teste.

### Segurança

- RLS nas cinco tabelas P-25;
- número de policies por tabela;
- INSERT direto bloqueado em notificações e eventos;
- mutações sensíveis por RPC;
- usuário comum sem health check organizacional;
- Central sem conclusão inline;
- nenhum write em `approval_flows`;
- nenhum canal externo ativo.

## Checklist de go-live

A tela organiza o checklist em:

1. Fundação.
2. Documentos e regras.
3. Trâmites.
4. Calendário e SLA.
5. Ausências e substituições.
6. Notificações e escalonamento.
7. Auditoria.
8. Segurança.
9. Treinamento.
10. Piloto.

Cada item contém estado, evidência observada, impacto e link para correção. O
índice percentual ajuda a priorizar, mas não substitui os testes manuais.

## Roteiro guiado de delegação

1. Crie usuário titular e substituto na mesma organização.
2. Cadastre ausência ativa/futura do titular.
3. Defina o substituto e confirme que ele está disponível.
4. Crie documento e inicie trâmite publicado.
5. Garanta etapa `active`, `specific_user`, atribuída ao titular.
6. Entre como substituto.
7. Confirme o aviso de ação delegada.
8. Conclua explicitamente no detalhe.
9. Confirme `completed_by = substituto`.
10. Confirme `assignee_user_id = titular`.
11. Confirme `metadata.delegated = true`.
12. Confirme `delegated_from_user_id = titular`.
13. Confirme evento `step_completed`.
14. Confirme `audit_trail`, quando o contrato estiver disponível.

Não use grupo ou papel para este teste. A P-25 não delega essas atribuições.

## Inbox endurecida

A Inbox informa:

- ciclo 23 ativo ou fallback legado;
- não lidas;
- críticas;
- escalonamentos;
- última geração registrada em `notification_events`;
- resultado detalhado da geração executada na sessão;
- `created`, `skipped_duplicate`, `suppressed` e `errors`.

Se `errors > 0`, a UI direciona para o Diagnóstico Operacional. A geração
continua manual; abrir Home, Central ou Inbox não gera alertas
automaticamente.

## E-mail real

A P-25.1 não envia e-mail. `notify_email` apenas permite preparar registro na
outbox passiva. Não existe worker, cron ou chamada de provider nos ciclos 23 e
24.

A Edge Function legada de aprovação permanece fora do fluxo P-25.

## Queries de conferência

### `24_CHECK_01_readiness_function`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer,
  provolatile
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_operational_readiness';
```

Esperado: `security_definer = true` e `provolatile = 's'`.

### `24_CHECK_02_readiness_result`

```sql
select public.get_operational_readiness();
```

Executar autenticado como admin/manager da organização.

### `24_CHECK_03_no_mutation`

```sql
select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_operational_readiness';
```

Revise que a função contém somente `SELECT`, inspeção de catálogo e contagens.
Ela não contém `INSERT`, `UPDATE`, `DELETE` nem chamada de geração.

### `24_CHECK_04_required_tables`

```sql
select
  to_regclass('public.organizations') as organizations,
  to_regclass('public.profiles') as profiles,
  to_regclass('public.document_tramite_instances') as tramite_instances,
  to_regclass('public.document_tramite_instance_steps') as tramite_steps,
  to_regclass('public.operational_calendars') as calendars,
  to_regclass('public.document_sla_policies') as sla_policies,
  to_regclass('public.team_absences') as team_absences,
  to_regclass('public.team_delegation_rules') as delegation_rules,
  to_regclass('public.internal_notifications') as notifications,
  to_regclass('public.notification_preferences') as preferences,
  to_regclass('public.notification_events') as notification_events,
  to_regclass('public.notification_escalation_rules') as escalation_rules,
  to_regclass('public.notification_delivery_outbox') as delivery_outbox;
```

### `24_CHECK_05_required_functions`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'current_user_org_id',
    'is_org_role',
    'add_business_days',
    'is_user_unavailable',
    'resolve_user_substitute',
    'create_internal_notification',
    'mark_notification_read',
    'dismiss_notification',
    'generate_operational_notifications',
    'resolve_effective_tramite_actor',
    'complete_document_tramite_step',
    'get_operational_readiness'
  )
order by proname;
```

## Testes manuais

1. Sem ciclo 23, abra o diagnóstico e confirme fallback legado.
2. Com ciclo 23, confirme as cinco tabelas.
3. Confirme `generate_operational_notifications`.
4. Confirme inbox enterprise.
5. Salve preferências pessoais.
6. Confirme outbox passiva.
7. Confirme que nenhum e-mail foi enviado.
8. Confirme calendário padrão.
9. Confirme timezone válido.
10. Confirme feriados.
11. Confirme política SLA.
12. Confirme ausência/delegação.
13. Confirme regra de escalonamento ou fallback padrão.
14. Confirme modelo de trâmite publicado.
15. Confirme etapa `specific_user`.
16. Conclua como titular.
17. Execute o roteiro de substituto.
18. Confirme que a Central não conclui inline.
19. Confirme que a Home não replica a Inbox.
20. Confirme que usuário comum não abre o diagnóstico completo.
21. Confirme visão organizacional para admin/manager.
22. Execute `bunx tsc --noEmit`.
23. Execute `bun run build`.

## Limitações

- não existe persistência de marcação manual do checklist;
- a comprovação de treinamento continua manual;
- não há cron/worker para geração;
- não há processador da outbox;
- não há UI administrativa completa para regras de escalonamento;
- evidência delegada, grupos e papéis continuam fora da delegação;
- o fallback frontend não comprova RLS nem corpo de funções;
- não existem indicadores históricos da P-26.

## Próximo passo

Aplicar os ciclos 21, 22, 23 e 24 em ambiente de teste, resolver os bloqueios
do checklist e executar um piloto controlado com titular e substituto. Somente
depois dessa evidência deve começar a P-26.
