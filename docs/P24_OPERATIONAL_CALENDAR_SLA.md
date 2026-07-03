# P-24 — Calendário Inteligente, Prazos e SLA Documental

## Objetivo

A P-24 cria uma referência operacional única para dias úteis, feriados e
políticas de prazo por organização. O ciclo calcula datas e melhora a leitura
de risco na Central, na Home e na execução de trâmites.

O calendário não altera status, não conclui etapas, não inicia trâmites e não
reescreve `due_at` ou `next_review_at`. Datas persistidas continuam sendo a
fonte principal; uma data calculada para campo ausente é identificada na
interface como sugestão não persistida.

## Diagnóstico anterior

Antes da P-24:

- `documents.next_review_at` era lido como uma data simples na lista,
  detalhe, Central e Home;
- `document_tramite_instance_steps.due_at` era persistido pelo ciclo 18;
- quando `due_days` existia, a P-12.1 somava dias corridos com
  `make_interval`;
- a Central classificava atraso comparando diretamente a data com o horário
  atual;
- a Home consolidava revisões e etapas atrasadas a partir da Central;
- não havia calendário, feriado ou política SLA multi-organização;
- o helper local de dias úteis não representava configuração da organização.

## Ciclo SQL

Arquivo para revisão e aplicação manual:

`supabase/migrations/20260630_p24_operational_calendar_sla.sql`

Nome sugerido no Supabase SQL Editor:

`21_TRAMITA_operational_calendar_sla`

A migration é aditiva e cria somente estruturas de configuração e funções de
cálculo.

## Schema

### `operational_calendars`

Mantém o calendário da organização:

- fuso horário;
- semana útil em `workweek`;
- início e fim da jornada;
- indicação de calendário padrão;
- metadados e rastreabilidade de criação.

Existe no máximo um calendário marcado como padrão por organização.

### `operational_holidays`

Mantém feriados da organização ou de um calendário:

- data e nome;
- escopo;
- repetição anual opcional;
- vínculo ao calendário.

Feriados de organização (`calendar_id` nulo) valem para todos os calendários
da organização. Feriados vinculados valem somente para o calendário indicado.

### `document_sla_policies`

Define prazo em dias úteis por contexto:

- tipo documental;
- área;
- projeto;
- tipo de etapa;
- prazo de revisão;
- prazo da etapa;
- antecedência do alerta;
- severidade e prioridade.

Campos de contexto nulos funcionam como regra geral. Menor `priority` vence;
em empate, a política mais específica vence.

## RLS

- usuários autenticados leem calendários, feriados e políticas da própria
  organização;
- apenas `admin` e `manager` podem inserir, atualizar ou excluir;
- calendários vinculados são validados contra a mesma organização;
- `service_role` mantém acesso integral;
- nenhuma policy concede escrita em documentos, etapas ou `approval_flows`.

## Funções de cálculo

### `is_business_day`

Verifica se uma data é útil no calendário informado. Sem calendário
configurado, usa segunda a sexta.

### `add_business_days`

Soma dias úteis a partir da data-base. A data inicial não consome um dia; zero
retorna a própria data. Fins de semana e feriados são pulados e lacunas são
esperadas.

### `calculate_document_due_date`

Resolve a melhor política de revisão aplicável e calcula a data em dias úteis.
Retorna `null` quando nenhuma política se aplica.

### `calculate_tramite_step_due_date`

Resolve a melhor política de etapa aplicável e calcula a data em dias úteis.
Retorna `null` quando nenhuma política se aplica.

As quatro funções são somente leitura. Elas não atualizam `documents`,
`document_tramite_instance_steps` nem qualquer status.

## Administração

A rota `/authenticated/configuracoes/calendario` está disponível para
administradores e gestores e permite:

- configurar o calendário padrão;
- escolher os dias úteis e horários;
- cadastrar e remover feriados;
- criar políticas para revisão documental ou etapa de trâmite;
- ativar e desativar políticas.

Usuários comuns continuam podendo ler os resultados permitidos por RLS, mas
não recebem controles administrativos.

## Integração com a Central Documental

A Central mantém datas persistidas como prioridade:

1. usa `due_at` quando a etapa já possui prazo;
2. usa `next_review_at` quando o documento já possui revisão programada;
3. quando o campo está ausente e existe política, calcula uma sugestão;
4. identifica visualmente sugestão, política e modo de cálculo;
5. usa dias úteis para a janela de atenção quando um calendário está ativo.

O texto diferencia:

- **Prazo calculado por calendário operacional**;
- **Prazo calculado por data simples**;
- **Prazo sugerido · não persistido**.

## Integração com a Home

A Home continua resumida e não replica a Central. O radar passa a considerar:

- revisões vencidas;
- etapas vencidas;
- etapas dentro da janela de atenção;
- documentos publicados sem política de revisão aplicável.

A maturidade operacional inclui a capacidade **Calendário e SLA**. Os cards
apenas navegam; nenhuma ação é executada na Home.

## Integração com execução P-12.1

A RPC de conclusão não foi alterada.

Quando uma etapa ativa já possui `due_at`, o painel exibe o prazo persistido.
Quando não possui e uma política se aplica, exibe prazo sugerido e informa que
ele não foi gravado. A P-24 não persiste automaticamente essa sugestão.

A P-12.1 continua calculando seus próprios `due_at` de acordo com o snapshot
do modelo. Evoluir a ativação transacional para dias úteis exige uma fase
específica e não foi feito silenciosamente neste ciclo.

## Fallback sem ciclo 21

Se as tabelas não existirem:

- Home e Central continuam carregando;
- atrasos usam comparação simples de datas;
- execução mantém `due_at` existente;
- a rota administrativa explica que a migration ainda não foi aplicada;
- nenhum fluxo de criação, evidência ou trâmite é interrompido.

Se o ciclo existir sem calendário cadastrado, o cálculo local usa segunda a
sexta e a interface pede configuração do calendário padrão.

## Queries de conferência

### `21_CHECK_01_calendar_tables`

```sql
select
  to_regclass('public.operational_calendars') as operational_calendars,
  to_regclass('public.operational_holidays') as operational_holidays,
  to_regclass('public.document_sla_policies') as document_sla_policies;
```

### `21_CHECK_02_calendar_functions`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'is_business_day',
    'add_business_days',
    'calculate_document_due_date',
    'calculate_tramite_step_due_date'
  )
order by proname;
```

### `21_CHECK_03_calendar_policies`

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'operational_calendars',
    'operational_holidays',
    'document_sla_policies'
  )
order by tablename, policyname;
```

### `21_CHECK_04_default_calendars`

```sql
select
  id,
  org_id,
  name,
  timezone,
  workweek,
  default_start_time,
  default_end_time,
  is_default,
  updated_at
from public.operational_calendars
order by org_id, is_default desc, name;
```

### `21_CHECK_05_sla_policies`

```sql
select
  id,
  org_id,
  name,
  doc_type,
  area,
  project_id,
  step_type,
  calendar_id,
  review_due_days,
  step_due_days,
  warning_before_days,
  severity,
  priority,
  active
from public.document_sla_policies
order by org_id, priority, name;
```

### `21_CHECK_06_business_day_calculation`

Substitua os UUIDs pelos valores do ambiente:

```sql
select public.is_business_day(
  'ORGANIZATION_ID'::uuid,
  current_date,
  null
) as today_is_business_day;

select public.add_business_days(
  'ORGANIZATION_ID'::uuid,
  current_date,
  5,
  null
) as five_business_days_from_today;

select public.calculate_document_due_date(
  'ORGANIZATION_ID'::uuid,
  current_date,
  'PRO',
  'ENG',
  null
) as document_due_date;

select public.calculate_tramite_step_due_date(
  'ORGANIZATION_ID'::uuid,
  current_date,
  'approval',
  'PRO',
  'ENG',
  null
) as step_due_date;
```

## Testes manuais

1. Sem o ciclo 21, abra Home e Central e confirme o fallback de data simples.
2. Aplique o ciclo 21 somente em ambiente de teste.
3. Acesse `/authenticated/configuracoes/calendario`.
4. Salve calendário padrão de segunda a sexta.
5. Cadastre um feriado em dia útil.
6. Execute `add_business_days` atravessando um fim de semana.
7. Execute novamente atravessando o feriado e confirme o salto.
8. Crie política de revisão por tipo documental.
9. Crie política de etapa para `approval`.
10. Confirme revisão/etapa próxima no radar da Home.
11. Confirme atraso e origem do prazo na Central.
12. Em etapa sem `due_at`, confirme a sugestão não persistida no detalhe.
13. Confirme que nenhum status foi alterado.
14. Confirme que `approval_flows` permaneceu inalterada.
15. Anexe evidência P-23 e confirme que o fluxo continua funcional.
16. Confirme leitura por usuário comum e escrita apenas por admin/manager.
17. Remova o calendário do ambiente de teste e confirme fallback segunda a
    sexta.

## Limitações

- a P-24 não recalcula nem migra `due_at` já persistido;
- sugestões não são gravadas automaticamente;
- não há feriados importados de fonte externa;
- não há jornada parcial, horas úteis ou fuso por projeto;
- não há notificações, escalonamento ou alteração automática de status;
- a UI administrativa mantém um calendário padrão por organização nesta fase;
- `approval_flows` permanece somente como fonte de leitura na Central;
- grandes volumes ainda dependem do carregamento consolidado atual da Central.

## Próximos passos

- RPC explícita para aplicar uma sugestão de prazo em etapa sem `due_at`;
- cálculo em horas úteis e calendários por projeto/unidade;
- versionamento de políticas e auditoria administrativa;
- consulta consolidada/paginada para grandes organizações;
- alertas e notificações somente em fase própria e opt-in.
