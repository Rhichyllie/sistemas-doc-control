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

## P-26.1 — Redesign Enterprise do Cockpit de Indicadores

### Por que foi necessário

A primeira interface da P-26 comprovou o contrato analítico, mas apresentava
muitos cards com o mesmo peso, filtros sempre abertos e blocos densos. O
usuário precisava interpretar números isolados antes de descobrir a saúde
geral e a próxima ação.

### Nova arquitetura visual

A tela foi reorganizada em quatro níveis:

1. header executivo com período, fonte, Central e Diagnóstico;
2. hero de saúde com estado geral, narrativa determinística, três riscos, top
   gargalo e próxima ação;
3. seis KPIs prioritários acima da dobra;
4. abas secundárias para SLA, gargalos, notificações, delegações e qualidade.

Home, Central, Diagnóstico e Indicadores continuam separados. A Home resume, a
Central navega para o trabalho, o Diagnóstico valida implantação e o cockpit
analisa desempenho.

### KPIs acima da dobra

- compliance de SLA;
- etapas vencidas;
- tempo médio de ciclo;
- evidências pendentes;
- notificações críticas;
- ausências impactando etapas.

Cada KPI informa contexto, cálculo em tooltip e ação quando aplicável.

### Gráficos criados

- donut SVG acessível para distribuição de SLA;
- barras horizontais para gargalos por responsável, projeto, área, tipo e
  etapa;
- fluxo operacional em blocos para instâncias, etapas, atraso, vazão e falhas;
- sinal compacto de notificações;
- cobertura comparativa de delegações.

Os gráficos usam SVG e CSS existentes; nenhuma biblioteca adicional foi
instalada.

### Tabelas e recomendações

As tabelas de gargalo, evidência e etapas paradas agora mostram impacto,
exigência/idade e ação. Em telas pequenas, as linhas viram cards.

As recomendações são ordenadas por severidade, exibem até três ações
prioritárias e recolhem ações adicionais.

### Filtros e estados

Os períodos 7/30/90 dias ficam visíveis como chips. Filtros contextuais ficam
em área avançada recolhível e os valores ativos aparecem como badges.

Existem estados específicos para ciclo 25 ausente, fallback limitado, período
sem movimento, escopo pessoal e erro da RPC. Uma operação saudável recebe
narrativa positiva; não é apresentada como tela vazia.

### Responsividade e acessibilidade

- KPIs refluem de seis colunas para uma;
- abas e seletores possuem rolagem horizontal controlada;
- tabelas viram cards no mobile;
- gráficos têm rótulos e `aria-label`, sem depender apenas de cor;
- ações e explicações permanecem legíveis em notebook, tablet e celular.

### Contrato preservado

A P-26.1 não cria migration e não altera
`get_operational_indicators`. Ela é uma evolução exclusivamente frontend/UX
sobre o ciclo `25_TRAMITA_operational_indicators`.

Nenhuma ação mutante foi adicionada: o cockpit não gera notificações, não muda
status, prazo ou responsável, não conclui etapas e não altera
`approval_flows`.

### Testes manuais P-26.1

1. Abra `/authenticated/indicadores`.
2. Confirme hero, seis KPIs, top gargalo e próxima ação.
3. Confirme donut de SLA, ranking e fluxo operacional.
4. Navegue pelas seis abas.
5. Teste período 7/30/90 dias.
6. Abra filtros avançados e depois limpe os filtros.
7. Teste ciclo 25 ausente, fallback, sem dados e erro.
8. Valide desktop, notebook, tablet e mobile.
9. Confirme que Home, Central e Diagnóstico mantêm seus papéis.
10. Confirme que nenhuma mutação ou geração foi introduzida.
11. Execute `bunx tsc --noEmit`.
12. Execute `bun run build`.

### Limitações

- o redesign não adiciona snapshots históricos;
- tendências continuam limitadas ao contrato da RPC P-26;
- projetos legados podem manter rótulo resumido;
- não há exportação formal, IA, OCR ou drill-down histórico.

## P-26.2 — Executive BI Cockpit e Exportação para Reunião

### Objetivo e fronteira com a P-27

A P-26.2 transforma o cockpit em uma visão gerencial própria para reunião,
compartilhamento de tela e investigação operacional. Ela continua usando a
mesma RPC read-only `get_operational_indicators` e não cria migration.

A exportação desta fase é visual e gerencial:

- impressão ou PDF pelo recurso nativo do navegador;
- resumo executivo para clipboard;
- JSON com os dados e o contexto exibidos no painel.

Relatório formal de auditoria, assinatura, dossiê, trilha probatória e
exportação oficial permanecem reservados à P-27.

### Modos de visualização

- **Gestão:** filtros, saúde operacional, KPIs, gráficos, recomendações e
  links para ação.
- **Apresentação:** menos controles, gráficos maiores e leitura apropriada
  para tela compartilhada ou impressão.
- **Análise:** rankings, filtros e tabelas detalhadas para investigação.

O modo selecionado fica somente no `localStorage`, na chave
`tramita.indicators.viewMode`. Nenhuma preferência é persistida no banco.

### Score de governança

O **Operational Governance Score** é calculado no frontend, de 0 a 100, a
partir de penalidades explícitas para:

- distância do compliance de SLA para 100%;
- proporção de etapas ativas vencidas;
- evidências obrigatórias pendentes;
- notificações críticas abertas;
- ausências sem substituto;
- lacunas de código, contexto, SLA e próxima revisão.

O score não é persistido e não constitui certificação. A tela mostra os
principais penalizadores e classifica o recorte como Excelente, Boa, Atenção,
Crítica ou Dados insuficientes.

### Gráficos e composição do cockpit

- donut e barra empilhada de SLA, com valores absolutos;
- comparação real entre período atual e anterior para documentos criados,
  etapas concluídas e instâncias concluídas;
- matriz de risco por impacto e urgência;
- ranking de gargalos por responsável, projeto, área, tipo e etapa;
- risco por responsável com ressalva contra avaliação individual isolada;
- fluxo operacional;
- intensidade visual por projeto ou área;
- signal board de notificações e escalonamentos;
- impacto de ausências e delegações;
- grade de cobertura da qualidade documental.

A RPC já fornece somente três comparações de períodos. Não há snapshot por
dia, portanto a P-26.2 não cria linha temporal, sparkline histórica ou
heatmap cruzado fictício. Projeto e área são rankings independentes, não uma
matriz projeto x área.

### Exportação para reunião

**Imprimir / salvar PDF** chama `window.print()` e usa CSS específico para:

- ocultar menu, banner, filtros e botões;
- imprimir em A4 paisagem;
- manter período, horário de geração, KPIs, gráficos e recomendações;
- evitar cortes de cards quando o navegador respeita
  `break-inside: avoid`;
- usar fundo branco e contraste adequado.

**Copiar resumo executivo** inclui período, saúde, score, SLA, atraso, maior
gargalo, alertas críticos, recomendações e a limitação de leitura atual.

**Exportar dados** gera
`tramita-indicadores-YYYY-MM-DD.json` no navegador, contendo filtros, score,
insights, métricas, rankings, recomendações e limitações. Nenhum backend novo
é chamado.

### Insights executivos

As frases são determinísticas. Exemplos:

- concentração do maior gargalo;
- percentual de itens vencidos ou próximos;
- evidências obrigatórias pendentes;
- etapas sem cobertura de substituição;
- comparação de throughput contra o período anterior;
- aviso de que a leitura não substitui fechamento histórico.

### Testes manuais P-26.2

1. Abra `/authenticated/indicadores`.
2. Confirme o modo Gestão.
3. Ative o modo Apresentação.
4. Ative o modo Análise.
5. Recarregue e confirme a persistência local do modo.
6. Confirme a barra de exportação.
7. Use **Imprimir / salvar PDF** e revise a prévia A4 paisagem.
8. Confirme que menu, banner, filtros e botões não aparecem na impressão.
9. Use **Copiar resumo** e cole em um editor de texto.
10. Use **Exportar dados** e valide o JSON gerado.
11. Confirme score, classificação e penalizadores.
12. Confirme donut e barra empilhada de SLA.
13. Confirme comparação atual/anterior sem série temporal inventada.
14. Confirme matriz de risco.
15. Confirme grade de qualidade documental.
16. Confirme risco por responsável e sua ressalva.
17. Confirme intensidade por projeto e área.
18. Confirme signal board de notificações.
19. Confirme impacto de delegações.
20. Confirme que Gestão mantém filtros e ações.
21. Confirme que Apresentação reduz controles.
22. Confirme que Análise mantém tabelas e rankings.
23. Teste notebook, tablet e mobile.
24. Confirme ausência de mutações, geração de alertas e chamadas externas.
25. Execute `bunx tsc --noEmit` e `bun run build`.

### Limitações P-26.2

- PDF depende do motor de impressão do navegador;
- o JSON é exportação gerencial, não evidência formal;
- comparação anterior existe apenas para as três métricas retornadas pela RPC;
- não há série diária, snapshot histórico, previsão ou tendência por
  regressão;
- não há matriz cruzada projeto x área;
- abas não abertas não são forçadas para a impressão;
- P-27 continua necessária para relatórios formais auditáveis.

## Integração P-27 — Relatórios formais

A P-26.2 permanece gerencial. A P-27 adiciona a rota
`/authenticated/auditoria/relatorios`, manifesto, cobertura, timeline, hash
SHA-256 e histórico append-only. O cockpit não passa a registrar exportações
formais e não assume função probatória.
