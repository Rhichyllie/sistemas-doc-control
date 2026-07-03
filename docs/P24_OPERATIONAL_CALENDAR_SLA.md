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

A rota `/authenticated/configuracoes/calendario` oferece configuração para
administradores e gestores e permite:

- configurar o calendário padrão;
- escolher os dias úteis e horários;
- cadastrar e remover feriados;
- criar políticas para revisão documental ou etapa de trâmite;
- ativar e desativar políticas.

Usuários comuns continuam podendo ler os resultados permitidos por RLS, mas
não recebem controles administrativos.

## P-24.1 — Hardening de rota e UI

A navegação administrativa foi separada explicitamente:

- o menu usa o caminho absoluto
  `/authenticated/configuracoes/calendario`;
- `/authenticated/configuracoes` continua renderizando a página geral de
  Configurações;
- a rota pai renderiza `Outlet` quando uma filha está ativa, portanto
  `/authenticated/configuracoes/calendario` renderiza somente Calendário e
  SLA;
- os itens **Configurações** e **Calendário e SLA** não recebem destaque ativo
  simultâneo;
- usuários autenticados podem abrir a página em modo de leitura quando o RLS
  permitir;
- somente `admin` e `manager` recebem controles de escrita habilitados.

A tela diferencia visualmente **Instalado**, **Sem calendário padrão**,
**Não instalado** e **Atenção**. Sem o ciclo 21, nenhum formulário morto é
mostrado: a página orienta a aplicar
`21_TRAMITA_operational_calendar_sla` e mantém o fallback por data simples.

Testes de rota:

1. abra `/authenticated/configuracoes` e confirme a página geral;
2. clique **Calendário e SLA** no menu;
3. confirme a URL `/authenticated/configuracoes/calendario`;
4. confirme que a URL não contém
   `/authenticated/configuracoes/authenticated/calendario`;
5. confirme o título **Calendário e SLA**;
6. sem ciclo 21, confirme a orientação de instalação;
7. com ciclo 21, confirme calendário, feriados e políticas;
8. com usuário comum, confirme leitura sem controles de escrita;
9. com admin/manager, confirme os controles habilitados.

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

## P-24.2 — Calendário Enterprise, Feriados Globais e Substituições

### Objetivo e diagnóstico

A P-24.2 transforma a configuração básica em um módulo operacional:

- o menu lateral pode ser recolhido e preserva a preferência local;
- a tela foi separada em Visão geral, Calendário padrão, Feriados, Políticas
  SLA, Ausências e substituições e Diagnóstico;
- o fuso deixa de ser texto livre e passa a aceitar somente identificadores
  IANA;
- feriados podem ser cadastrados manualmente ou importados sob demanda;
- ausências e delegações passam a compor o contexto da Home, da Central e do
  detalhe da execução.

A implementação anterior concentrava calendário, feriados e SLA em uma única
área extensa, sem navegação interna, usava um `input` livre para timezone e
não tinha origem de feriado nem indisponibilidade temporária de pessoas.

### Migration aditiva

Arquivo para revisão e aplicação manual, depois do ciclo 21:

`supabase/migrations/20260702_p24_2_calendar_enterprise_hardening.sql`

Nome no SQL Editor:

`22_TRAMITA_calendar_enterprise_hardening`

A migration não reescreve
`20260630_p24_operational_calendar_sla.sql`. Ela adiciona:

- origem, país, subdivisão, tipo e ano aos feriados;
- `operational_holiday_import_runs`;
- `team_absences`;
- `team_delegation_rules`;
- `is_valid_iana_timezone`;
- `is_user_unavailable`;
- `resolve_user_substitute`.

As funções de disponibilidade são read-only. Nenhuma delas reatribui etapa,
muda documento, recalcula `due_at` ou altera `approval_flows`.

### Menu e navegação

O menu expandido mostra ícone e texto. Recolhido, mantém somente ícones,
tooltip, indicação ativa e amplia a área principal. A preferência é salva em
`tramita.sidebar.collapsed`; se o armazenamento local falhar, o estado React
continua funcional.

Os caminhos são absolutos:

- `/authenticated/configuracoes`;
- `/authenticated/configuracoes/calendario`.

### Fuso horário IANA

O seletor usa `Intl.supportedValuesOf('timeZone')` quando disponível e uma
lista curada como fallback. Antes de salvar, o frontend valida o valor; a
migration também protege novas escritas com uma constraint `NOT VALID`, para
não bloquear dados legados já existentes.

Um valor legado inválido é exibido com orientação para correção e não pode ser
salvo novamente. Existem presets para Brasil padrão, operação 6x1 e operação
24/7. Os horários ficam preparados para evolução em horas úteis; o cálculo
atual continua baseado em dias.

### Importação de feriados

A importação é sempre manual e persiste os dados no banco para uso posterior
sem dependência contínua da fonte.

Providers implementados:

- **BR_LOCAL_PACK:** calendário nacional brasileiro calculado localmente,
  incluindo Sexta-feira Santa; Carnaval e Corpus Christi entram somente
  quando observâncias opcionais forem solicitadas;
- **NAGER_DATE_API:** consulta sob demanda a
  `https://date.nager.at/api/v4/Holidays/{CountryCode}/{Year}`.

Países expostos: Brasil, Argentina, Bolívia, Canadá, Chile, Colômbia, Equador,
Espanha, França, Reino Unido, México, Angola, Peru, Paraguai, Portugal,
Estados Unidos, Uruguai e Venezuela. Somente Brasil possui pack local nesta
fase; os demais usam Nager.Date quando suportados pela fonte.

Reimportações são protegidas por identidade de organização, calendário, data,
nome, país e subdivisão. A interface informa incluídos e ignorados. Falha da
API não remove feriados existentes; falha no log de importação não desfaz os
feriados já gravados.

### Ausências e substituições

`team_absences` representa férias, licença, afastamento, viagem, treinamento
ou indisponibilidade. `team_delegation_rules` define substituto geral ou por
projeto, tipo documental, área ou tipo de etapa.

Usuários leem o contexto da própria organização. Admin/manager gerencia todos;
um usuário comum pode cadastrar sua própria ausência futura e sua própria
delegação. Policies validam titular, substituto e organização.

`resolve_user_substitute` prioriza o substituto da ausência e depois a regra
ativa mais específica e de menor prioridade numérica. Um substituto ausente,
de outra organização ou em ciclo direto com o titular não é retornado.

Home, Central e detalhe mostram a substituição sem modificar o responsável
persistido. O substituto **não pode agir pela autorização original nesta
fase**: a P-12.1 não foi alterada. Autorização delegada auditável, eventos e
escalonamento pertencem à P-25.

### Queries de conferência

#### `22_CHECK_01_calendar_enterprise_columns`

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'operational_holidays'
  and column_name in (
    'country_code', 'subdivision_code', 'source', 'source_id',
    'imported_year', 'holiday_type', 'observed', 'optional'
  )
order by ordinal_position;
```

#### `22_CHECK_02_holiday_import_runs`

```sql
select to_regclass(
  'public.operational_holiday_import_runs'
) as operational_holiday_import_runs;

select *
from public.operational_holiday_import_runs
order by created_at desc
limit 50;
```

#### `22_CHECK_03_team_absence_tables`

```sql
select
  to_regclass('public.team_absences') as team_absences,
  to_regclass('public.team_delegation_rules') as team_delegation_rules;
```

#### `22_CHECK_04_availability_functions`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'is_valid_iana_timezone',
    'is_user_unavailable',
    'resolve_user_substitute'
  )
order by proname;
```

#### `22_CHECK_05_active_absences`

```sql
select
  id, org_id, user_id, absence_type, starts_at, ends_at,
  status, substitute_user_id, reason
from public.team_absences
where status in ('scheduled', 'active')
  and now() >= starts_at
  and now() < ends_at
order by starts_at;
```

#### `22_CHECK_06_delegation_rules`

```sql
select
  id, org_id, owner_user_id, substitute_user_id, scope,
  project_id, doc_type, area, step_type, starts_at, ends_at,
  priority, active
from public.team_delegation_rules
where active
order by priority, created_at;
```

#### `22_CHECK_07_holidays_by_country`

```sql
select
  holiday_date, name, country_code, subdivision_code, source,
  imported_year, holiday_type, observed, optional
from public.operational_holidays
where country_code = 'BR'
  and imported_year = extract(year from current_date)::integer
order by holiday_date, name;
```

#### `22_CHECK_08_rls_policies`

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'operational_holiday_import_runs',
    'team_absences',
    'team_delegation_rules'
  )
order by tablename, policyname;
```

### Testes manuais P-24.2

1. Recolha e expanda o menu.
2. Recarregue a página e confirme a preferência preservada.
3. Abra **Calendário e SLA** e confirme a URL absoluta.
4. Confirme que nenhuma URL relativa duplicada é produzida.
5. Tente salvar timezone inválido e confirme o bloqueio.
6. Salve `America/Sao_Paulo`.
7. Teste os presets Brasil, 6x1 e 24/7.
8. Cadastre um feriado manual.
9. Importe o pack Brasil local.
10. Importe outro país por Nager.Date.
11. Reimporte país/ano e confirme duplicatas ignoradas.
12. Confira o histórico da importação.
13. Crie ausência futura com substituto.
14. Confirme a resolução no período.
15. Tente titular e substituto iguais.
16. Tente pessoa de outra organização.
17. Crie e pause uma delegação.
18. Confira badge de ausência/substituição na Central.
19. Confira risco de ausência sem substituto na Home.
20. Confira o aviso no detalhe de uma etapa atribuída.
21. Confirme que `assignee_user_id` não mudou.
22. Confirme que `approval_flows` não mudou.
23. Crie documento, inicie trâmite e anexe evidência P-23.
24. Abra Home e Central sem ciclo 22 e confirme fallback.

### Limitações P-24.2

- somente o Brasil possui provider local;
- Nager.Date depende de rede e cobertura da fonte;
- subdivisões são filtradas quando fornecidas pela API, sem catálogo local;
- horários úteis ainda não entram no cálculo fino;
- ausências não reatribuem etapas;
- substitutos ainda não recebem autorização para concluir etapas;
- não há notificações, e-mails ou escalonamento;
- a atualização não é em tempo real.

### Próximo passo

A P-25 deve consumir disponibilidade e substituição com autorização explícita,
evento `delegated_from_user_id`, notificações internas e escalonamento
auditável, sem reatribuição silenciosa.

## Integração P-25

O ciclo 23 consome os cálculos e a disponibilidade da P-24.2 para gerar
notificações e validar conclusão delegada. O calendário e as tabelas de equipe
continuam read-only em relação às etapas: nenhuma rotina muda prazo,
responsável ou status.

O substituto pode concluir somente etapa `specific_user`, com confirmação no
frontend e validação final no banco. A trilha registra o ator real e
`delegated_from_user_id`.

## Integração P-25.1 — Validação de prontidão

O Diagnóstico Operacional verifica como requisitos de piloto:

- calendário padrão configurado;
- timezone IANA reconhecido;
- feriados cadastrados ou importados;
- política SLA ativa;
- ausência ou delegação de teste;
- funções `is_user_unavailable` e `resolve_user_substitute`.

O health check apenas lê configuração e catálogos. Ele não recalcula
`due_at`, não altera disponibilidade, não cria notificação e não executa
substituição. Sem o ciclo 24 de readiness, essas verificações usam fallback
frontend e não afirmam que RLS ou funções foram comprovadas.
