# P-26 — Indicadores Operacionais, SLA, Gargalos e Performance Documental

## Objetivo

A P-26 transforma dados já produzidos pelo TRAMITA em leitura operacional
acionável. O painel responde onde a operação está atrasada, qual contexto
concentra risco, quanto tempo os trâmites levam e qual ação de gestão deve ser
priorizada.

Indicadores são somente leitura. Eles não mudam status, responsável, prazo,
documento ou trâmite; não concluem etapas; não geram notificações; não enviam
e-mail; não alteram `approval_flows`.

## Separação entre módulos

- **Home:** resumo executivo, poucos riscos e próximo movimento.
- **Central Documental:** caixa operacional e navegação para o trabalho.
- **Diagnóstico Operacional:** instalação, RLS, saúde técnica e go-live.
- **Indicadores Operacionais:** análise por período, contexto, SLA, gargalos e
  performance.

A Central não calcula rankings pesados e o painel de Indicadores não executa
ações operacionais.

## Migration e RPC

Migration:

`supabase/migrations/20260702_p26_operational_indicators.sql`

Nome no SQL Editor:

`25_TRAMITA_operational_indicators`

A migration adiciona índices de leitura e a RPC:

```sql
public.get_operational_indicators(
  p_from date default null,
  p_to date default null,
  p_scope text default 'org',
  p_project_id uuid default null,
  p_doc_type text default null,
  p_area text default null,
  p_responsible_user_id uuid default null,
  p_severity text default null,
  p_status text default null
) returns jsonb
```

A função é `STABLE`, `SECURITY DEFINER`, possui `search_path` fixo, valida
`auth.uid()` e organização, limita o período a 365 dias e exige admin/manager
para `p_scope = 'org'`. Usuários comuns consultam apenas `p_scope = 'mine'`.

O retorno possui:

- `capabilities`: fontes realmente disponíveis;
- `summary`: KPIs principais;
- `sla`: prazo e compliance;
- `tramites`: execução e tempo de ciclo;
- `documents`: saúde do acervo;
- `notifications`: leitura da P-25;
- `delegations`: disponibilidade e ações delegadas;
- `bottlenecks`: rankings;
- `quality`: lacunas de governança;
- `trends`: comparação com o período anterior;
- `dimensions`: opções para filtros;
- `recommendations`: ações determinísticas;
- `limitations`: limites explícitos da leitura.

Se uma fonte opcional não existir, a capability correspondente é `false` e as
métricas dependentes retornam `null` ou lista vazia. A função não consulta
serviços externos.

## KPIs

O painel apresenta:

- documentos ativos;
- revisões vencidas e próximas;
- instâncias e etapas ativas;
- etapas vencidas e próximas do vencimento;
- compliance de SLA;
- tempo médio de etapa e de instância;
- evidências obrigatórias pendentes;
- notificações críticas;
- escalonamentos abertos;
- responsáveis ausentes impactando etapas;
- documentos sem código, contexto, próxima revisão ou política SLA.

Valores `null` significam que a fonte não foi comprovada. O frontend mostra
`—`; ele não transforma ausência de schema em zero.

## SLA e compliance

O compliance inicial é um retrato dos documentos publicados e etapas ativas
que possuem prazo persistido:

`itens no prazo / total de itens com prazo * 100`

Quando o ciclo 21 está disponível, a janela “próximo do vencimento” usa
`add_business_days`. Sem ele, usa comparação simples de três dias. A P-26 não
recalcula nem persiste `due_at` ou `next_review_at`.

Essa métrica não substitui snapshot histórico. Para comprovar o SLA exatamente
como estava em cada fechamento, uma fase futura deverá persistir snapshots ou
eventos de alteração de prazo.

## Gargalos

Rankings são formados por etapas ativas vencidas e agrupados por projeto,
área, tipo documental, tipo de etapa e responsável.

O painel também lista etapas paradas e exigências de evidência não satisfeitas.
Os rankings explicam concentração de risco; não representam avaliação de
desempenho individual isolada e não reatribuem trabalho.

## Notificações, escalonamento e delegação

A P-26 lê `internal_notifications`, `notification_events`, ausências,
delegações e eventos de conclusão. Ela mostra:

- não lidas e críticas abertas;
- notificações criadas;
- eventos gerados, escalonados e suprimidos;
- ausências e delegações ativas;
- conclusões com `delegated_from_user_id`;
- etapas de titular ausente com ou sem substituto.

Ela não chama `generate_operational_notifications`. A P-25 não persiste um
resumo de erros de cada geração, por isso `last_generation_errors` permanece
indisponível.

## Filtros e fallback

Filtros disponíveis:

- 7, 30, 90 dias ou período personalizado;
- minha operação ou organização;
- projeto;
- área;
- tipo documental;
- responsável;
- severidade;
- status.

Sem ciclo 25, o hook usa contagens locais limitadas para documentos, etapas,
instâncias e notificações quando as respectivas tabelas permitem leitura. O
fallback não inventa compliance, tempo de ciclo, delegações ou rankings.

## Segurança e performance

- escopo organizacional somente para admin/manager;
- escopo pessoal restringe documentos/autoria, etapas atribuídas e inbox;
- intervalo máximo de 365 dias;
- agregações retornam somente contagens e top 8/10 nos rankings;
- índices aditivos suportam filtros por organização, status, prazo e contexto;
- nenhuma query dispara mutação ou canal externo;
- nenhuma leitura atualiza `approval_flows`.

Para organizações com volume muito alto, o próximo passo técnico é snapshot
analítico incremental, não aumentar indefinidamente o intervalo da RPC.

## Queries de conferência

### 25_CHECK_01_indicators_function

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer,
  provolatile
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_operational_indicators';
```

Resultado esperado: `security_definer = true` e `provolatile = 's'`.

### 25_CHECK_02_indicators_result

```sql
select public.get_operational_indicators();
```

### 25_CHECK_03_no_mutation

```sql
select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname = 'get_operational_indicators';
```

Revise o corpo e confirme ausência de:

- `insert`;
- `update`;
- `delete`;
- `perform public.generate_operational_notifications`;
- `net.http` ou `pg_net`;
- atualização de `approval_flows`, `documents` ou etapas.

Os únicos comandos fora da função são índices aditivos, grant da RPC e reload
do schema PostgREST.

### 25_CHECK_04_basic_metrics

```sql
select jsonb_object_keys(
  public.get_operational_indicators(
    current_date - 29,
    current_date,
    'org'
  )
);
```

Confirme as chaves `summary`, `sla`, `tramites`, `documents`,
`notifications`, `delegations`, `bottlenecks`, `quality` e
`recommendations`.

## Testes manuais

1. Sem ciclo 25, abra `/authenticated/indicadores` e confirme o fallback.
2. Aplique o ciclo 25 somente em ambiente de teste.
3. Confirme carregamento via RPC.
4. Como usuário comum, confirme que o escopo organização é recusado.
5. Como admin/manager, selecione o escopo organização.
6. Teste períodos de 7, 30, 90 dias e personalizado.
7. Teste projeto, área, tipo e responsável.
8. Confirme etapas e revisões vencidas.
9. Confirme evidências pendentes.
10. Confirme notificações críticas e escalonamentos.
11. Confirme dados de delegação.
12. Confirme rankings por responsável, projeto, área e etapa.
13. Abra a Home e confirme somente a capacidade resumida.
14. Abra a Central e confirme somente o link para indicadores.
15. Abra o Diagnóstico e confirme o ciclo 25 como recomendável.
16. Inspecione dados antes/depois e confirme ausência de mutação.
17. Execute `bunx tsc --noEmit`.
18. Execute `bun run build`.

## Limitações

- não há snapshots históricos;
- o compliance é um retrato atual dos prazos persistidos;
- mudanças passadas de prazo não possuem série temporal própria;
- erros de geração da P-25 não são historizados como execução consolidada;
- `approval_flows` pode ser identificado como capability, mas não entra em
  todos os rankings por falta de contrato homogêneo entre schemas;
- projetos legados sem catálogo completo aparecem pelo identificador;
- não há exportação formal, PDF, IA, OCR ou BI externo.

## Próximos passos

O próximo passo recomendado é P-27, com relatórios e exportação formal de
auditoria baseados em contratos já comprovados. Para grande volume, avaliar
snapshot analítico incremental e política de retenção.

Roadmap futuro: **P-29.1 — Intelligent Document Intake**, para leitura,
extração de campos e lotes. Essa capacidade não faz parte da P-26.
