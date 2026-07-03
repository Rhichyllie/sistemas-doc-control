# P-25 — Notificações Internas, Escalonamento e Ação Delegada

## Objetivo

A P-25 conecta prazo, disponibilidade e execução em uma inbox operacional
auditável. Ela cria notificações internas, escalonamentos sem reatribuição e
conclusão explícita por substituto validado.

Nenhuma rotina muda `assignee_user_id`, `due_at`, status de documento ou
`approval_flows`. A geração é manual/on-demand nesta fase.

## Diagnóstico anterior

Antes da P-25:

- o usuário descobria trabalho pela Central, Home, fila formal e detalhe;
- `due_at` e `next_review_at` alimentavam risco e prioridade;
- a P-24.2 mostrava responsável ausente e substituto apenas como leitura;
- `document_tramite_actor_can_act` aceitava titular, autor, papel, grupo ou
  admin/manager, mas não substituto;
- a P-12.1 registrava eventos de instância, ativação, conclusão, decisão,
  evidência, cancelamento e falha;
- existia `notifications` legado, sem severidade, eventos, preferências ou
  escalonamento;
- existe uma Edge Function legada de e-mail de aprovação, mas a P-25 não a
  chama por não haver contrato de opt-in e entrega adequado.

## Ciclo SQL

Arquivo para revisão e aplicação manual depois do ciclo 22:

`supabase/migrations/20260702_p25_notifications_escalation.sql`

Nome no Supabase SQL Editor:

`23_TRAMITA_notifications_escalation`

## Schema

### `internal_notifications`

Inbox por destinatário, com severidade, entidade, documento, instância, etapa,
URL interna segura, leitura, dispensa, expiração e metadata.

### `notification_preferences`

Preferências pessoais para inbox, preparação de e-mail/digest e horário
silencioso. E-mail e digest não são executados nesta fase.

### `notification_events`

Log append-only de criação, leitura, dispensa, geração, supressão e
escalonamento.

### `notification_escalation_rules`

Regras administrativas por origem, antecedência/atraso e alvo por usuário ou
papel.

### `notification_delivery_outbox`

Outbox passiva para canal `email`. Um registro `pending` não é enviado: não
existe worker, trigger ou integração de entrega na P-25.

## RLS

- destinatário lê somente suas notificações;
- admin/manager pode consultar a visão da própria organização;
- não existe insert/update direto em notificações e eventos para usuários;
- leitura, dispensa e criação usam RPCs;
- preferência é editada somente pelo próprio usuário;
- admin/manager pode ler preferências, mas não sobrescrevê-las;
- regras de escalonamento são geridas por admin/manager;
- outbox é visível somente para admin/manager;
- `service_role` mantém acesso integral.

## RPCs

### `create_internal_notification`

Valida organização, destinatário, entidades, severidade, URL e metadata.
Respeita `notify_in_app`, evita duplicidade em janela de 60 minutos e registra
evento. Se `notify_email` estiver ativo, cria somente outbox passiva.

### `mark_notification_read` e `dismiss_notification`

Alteram somente a notificação do próprio destinatário e geram eventos
append-only. As operações são idempotentes.

### `generate_operational_notifications`

Executada manualmente por admin/manager. Consolida:

- etapa vencida ou próxima do prazo;
- revisão vencida ou próxima;
- responsável ausente sem substituto;
- substituto disponível;
- evidência obrigatória pendente;
- aprovação formal vencida quando o contrato compatível existe;
- escalonamento de etapa/aprovação vencida.

Retorna `created`, `skipped_duplicate`, `suppressed` e `errors`. Não atualiza
os objetos que originaram o alerta.

## Escalonamento

Escalonar significa criar uma notificação adicional para gestor, administrador
ou alvo configurado. A etapa, aprovação e responsabilidade permanecem
inalteradas.

Regras ativas para `tramite_step_overdue` têm prioridade sobre o alvo padrão.
Sem regra, etapas e aprovações vencidas são informadas a admin/manager.

## Ação delegada auditável

`resolve_effective_tramite_actor` mantém a autorização original e só permite
delegação quando:

- etapa e instância estão ativas;
- `assignment_type = specific_user`;
- o titular permanece em `assignee_user_id`;
- `resolve_user_substitute` retorna exatamente o ator autenticado;
- ator e titular pertencem à organização;
- o substituto não está indisponível;
- ausência ou regra de delegação ativa é confirmada.

`complete_document_tramite_step` foi substituída de forma aditiva pelo ciclo 23. Na conclusão delegada:

- `completed_by` recebe o usuário que realmente agiu;
- `assignee_user_id` não muda;
- metadata da etapa, `step_completed`, `decision_recorded` e auditoria inclui
  `delegated_from_user_id`, razão, fonte, ausência/regra e ator efetivo;
- chaves de delegação enviadas pelo frontend são removidas e reconstruídas
  pelo banco;
- grupo e papel não recebem delegação nesta fase.

Evidência P-23 continua usando a autorização original. A P-25 libera a
conclusão delegada, não upload delegado.

## Frontend

- sino mostra contador e últimas notificações sem marcá-las automaticamente;
- `/authenticated/notificacoes` oferece filtros, leitura, dispensa e
  preferências;
- admin/manager pode alternar entre inbox pessoal e visão da organização,
  mantendo leitura/dispensa restrita ao destinatário;
- admin/manager pode executar geração on-demand;
- sem ciclo 23, o hook usa `notifications` legado;
- Home resume críticas e escalonamentos;
- Central mostra badges e apenas navega;
- detalhe exige confirmação antes da conclusão como substituto.

## Queries de conferência

### `23_CHECK_01_notification_tables`

```sql
select
  to_regclass('public.internal_notifications') as internal_notifications,
  to_regclass('public.notification_preferences') as notification_preferences,
  to_regclass('public.notification_events') as notification_events,
  to_regclass('public.notification_escalation_rules') as escalation_rules,
  to_regclass('public.notification_delivery_outbox') as delivery_outbox;
```

### `23_CHECK_02_notification_functions`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'create_internal_notification',
    'mark_notification_read',
    'dismiss_notification',
    'generate_operational_notifications',
    'resolve_effective_tramite_actor',
    'complete_document_tramite_step'
  )
order by proname;
```

### `23_CHECK_03_notification_policies`

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'internal_notifications',
    'notification_preferences',
    'notification_events',
    'notification_escalation_rules',
    'notification_delivery_outbox'
  )
order by tablename, policyname;
```

### `23_CHECK_04_recent_notifications`

```sql
select
  id, recipient_user_id, notification_type, severity, title,
  document_id, tramite_step_id, read_at, dismissed_at, created_at
from public.internal_notifications
order by created_at desc
limit 50;
```

### `23_CHECK_05_recent_notification_events`

```sql
select *
from public.notification_events
order by created_at desc
limit 100;
```

### `23_CHECK_06_unread_by_user`

```sql
select recipient_user_id, severity, count(*) as unread
from public.internal_notifications
where read_at is null
  and dismissed_at is null
group by recipient_user_id, severity
order by recipient_user_id, severity;
```

### `23_CHECK_07_escalation_rules`

```sql
select
  id, org_id, name, source_type, severity,
  trigger_after_minutes, trigger_before_minutes,
  target_role, target_user_id, active
from public.notification_escalation_rules
order by active desc, source_type, name;
```

### `23_CHECK_08_delegated_step_events`

```sql
select
  id, instance_id, step_id, actor_id, event_type,
  metadata->>'delegated_from_user_id' as delegated_from_user_id,
  metadata->>'delegation_reason' as delegation_reason,
  created_at
from public.document_tramite_instance_events
where event_type = 'step_completed'
  and metadata ? 'delegated_from_user_id'
order by created_at desc;
```

### Teste manual de criação

```sql
select public.create_internal_notification(
  auth.uid(),
  'manual_test',
  'Teste de notificação interna',
  'Registro criado manualmente para conferência.',
  'info'
);

select public.generate_operational_notifications(now());
```

## Testes manuais

1. Sem ciclo 23, confirme sino e dados legados.
2. Aplique o ciclo 23 somente em ambiente de teste.
3. Crie notificação pela RPC e confira sino/inbox.
4. Marque como lida e dispense.
5. Salve preferências.
6. Gere notificações operacionais.
7. Confira etapa e revisão vencidas.
8. Confira ausência sem substituto.
9. Confira notificação ao substituto.
10. Configure regra e confira escalonamento.
11. Confirme que nenhum status, prazo ou responsável mudou.
12. Tente concluir como usuário sem delegação.
13. Conclua como substituto válido e confirme aviso.
14. Confira `completed_by` e `delegated_from_user_id`.
15. Confirme titular original em `assignee_user_id`.
16. Confirme isolamento por usuário e organização.
17. Confira resumo na Home e badges na Central.
18. Confirme que nenhum e-mail foi enviado.

## Limitações

- geração depende de ação manual; não há cron/worker;
- deduplicação usa janela de 60 minutos;
- janela padrão de etapa próxima é três dias corridos;
- quiet hours ainda são preferência armazenada, não regra de supressão;
- outbox não possui processador;
- upload de evidência delegado não foi habilitado;
- regras de escalonamento têm administração via banco nesta fase;
- não há WhatsApp, SMS, push externo ou modo auditor completo.

## Próximos passos

- worker/cron opt-in para geração e outbox;
- UI administrativa de regras de escalonamento;
- quiet hours e digest efetivos;
- indicadores de entrega, leitura, tempo de resposta e escalonamento;
- exportação de auditoria e modo auditor.

## P-25.1 — Health check e prontidão operacional

A P-25.1 cria o ciclo read-only
`24_TRAMITA_operational_readiness` e a rota administrativa
`/authenticated/configuracoes/diagnostico`.

O health check diferencia:

- ciclo ausente;
- tabela/função parcial;
- configuração vazia;
- erro de leitura;
- fallback frontend;
- RLS e escrita sensível protegidas.

A Inbox passa a identificar explicitamente ciclo 23 ativo ou fallback legado,
mostra a última geração registrada e preserva o resultado detalhado da geração
executada na sessão. Quando `errors > 0`, ela direciona para o Diagnóstico
Operacional.

O checklist de go-live valida calendário, feriados, SLA, ausência, delegação,
modelo publicado, inbox, eventos, escalonamento e conclusão como substituto.
Ele não executa testes nem altera dados automaticamente.

Sem o ciclo 24, a tela continua funcional por consultas leves, mas não afirma
que policies ou corpos de função foram comprovados. O roteiro completo e os
checks `24_CHECK_*` estão em `docs/P25_1_OPERATIONAL_READINESS.md`.

## Integração P-26 — Leitura analítica

A P-26 lê notificações e eventos para medir não lidas, críticas,
escalonamentos, gerações e supressões no período. A consulta analítica não
chama `generate_operational_notifications`, não cria eventos e não processa a
outbox.
