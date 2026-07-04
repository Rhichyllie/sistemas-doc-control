# P-21 — Home Operacional Inteligente

## Objetivo

A Home responde às perguntas executivas:

- como está a operação documental hoje;
- onde existe risco;
- quais capacidades precisam de configuração ou atenção;
- qual é o próximo movimento recomendado.

Ela não substitui a Central Documental. A Home resume a saúde da operação e
encaminha o usuário; a Central responde **o que eu preciso fazer agora?** com
itens operacionais navegáveis.

Rota:

`/authenticated/dashboard`

## Diagnóstico anterior

A Home anterior usava o cockpit operacional para exibir indicadores, alertas e
uma prévia de atividades. Depois da P-20, a prévia de tarefas passou a competir
com a caixa de trabalho da Central Documental.

A P-21 remove essa duplicação. A Home não exibe uma lista extensa de tarefas,
não conclui etapas e não inicia trâmites. Os riscos são consolidados em no
máximo cinco sinais executivos, com navegação para a Central ou para o módulo
responsável.

## Fontes usadas

O hook `useOperationalHome` resume dados já protegidos pelas RLS e hooks dos
módulos existentes:

- `documents`: documentos ativos, rascunhos, ausência de código e projeto;
- `useDocumentWorkCenter`: pendências críticas, revisões, aprovações,
  sugestões e execuções de trâmite;
- `document_code_patterns`: disponibilidade e configuração da codificação;
- `document_creation_templates` e `document_creation_rules`: políticas
  documentais ativas;
- modelos P-12 e instâncias P-12.1: maturidade e execução dos trâmites;
- projetos/contextos operacionais disponíveis.

Nenhuma fonte é alterada pela Home.

## Estrutura da Home

### Cabeçalho operacional

Exibe saudação, organização, data, estado geral e acesso direto à Central
Documental.

### Saúde documental

Cards resumidos e navegáveis:

- documentos ativos;
- pendências críticas;
- trâmites em andamento;
- revisões próximas;
- rascunhos aguardando avanço;
- itens sem próximo passo.

### Radar de risco

Mostra no máximo cinco riscos consolidados:

- etapas de trâmite atrasadas;
- revisões vencidas;
- aprovações formais paradas;
- documentos sem código ou com código legado;
- trâmites sugeridos ainda não iniciados.

### Jornada rápida

Atalhos para criação comum e inteligente, Central, projetos e, para
admin/manager, modelador, codificação e regras documentais.

### Maturidade da operação

Cada capacidade recebe um estado:

- **Disponível**;
- **Precisa configurar**;
- **Não instalado**;
- **Atenção**, quando há restrição ou erro de leitura.

As capacidades avaliadas são criação, codificação, projetos, políticas,
modelagem de trâmites, execução e Central operacional.

### Próximo movimento recomendado

A recomendação é local e determinística. A prioridade é:

1. etapas de trâmite atrasadas;
2. revisões vencidas;
3. aprovações formais vencidas;
4. trâmites sugeridos ainda não iniciados;
5. codificação instalada sem padrão;
6. documentos sem contexto de projeto;
7. operação estável.

Não há IA externa nem automação.

## Diferença entre Home e Central

| Home Operacional              | Central Documental                        |
| ----------------------------- | ----------------------------------------- |
| Visão executiva e saúde       | Caixa de trabalho operacional             |
| Indicadores resumidos         | Itens e instâncias navegáveis             |
| Até cinco riscos agregados    | Filtros e detalhes das pendências         |
| Recomenda o próximo movimento | Leva ao documento que exige ação          |
| Não executa ações             | Também não executa inline; abre o detalhe |

## Compatibilidade e fallbacks

- **Sem ciclo 18:** informa que a execução de trâmites não está instalada e
  mantém documentos, revisões e demais indicadores.
- **Sem ciclo 19:** informa que os controles avançados de codificação não
  estão instalados.
- **Sem projetos:** marca a capacidade como indisponível e mantém os demais
  indicadores.
- **Sem `approval_flows`:** não apresenta aprovações formais como risco.
- **Sem modelos P-12:** marca o modelador como não instalado.
- **Sem padrões P-11 ou políticas P-10C:** diferencia tabela ausente de módulo
  instalado sem configuração.
- **RLS ou leitura restrita:** usa o estado **Atenção**, sem confundir com
  migration ausente.

## SQL

A P-21 não cria migration nem novo ciclo SQL. Ela é uma integração de
frontend/produto sobre hooks e políticas existentes.

## Integração P-22

A criação transacional do ciclo 20 não altera as fontes da Home. Documentos
criados pela RPC aparecem nos mesmos indicadores, e ambientes sem o ciclo 20
continuam usando o fluxo compatível sem afetar a visão operacional.

## Testes manuais

1. Abra `/authenticated/dashboard` sem o ciclo 18 e confirme o fallback.
2. Com o ciclo 18, confirme o total de trâmites e riscos de etapas.
3. Com o ciclo 19, confirme a maturidade da codificação.
4. Confirme que a Home não replica a caixa de trabalho da Central.
5. Abra cada card de saúde e valide a rota de destino.
6. Gere mais de cinco tipos de risco e confirme o limite do radar.
7. Valide a recomendação com etapa atrasada, revisão vencida e operação estável.
8. Abra `/authenticated/documentos/central` e confirme a Central intacta.
9. Valide os atalhos visíveis para usuário comum e admin/manager.
10. Teste em larguras de celular, tablet e desktop.

## Limitações

- os números refletem os limites e a visibilidade das fontes consolidadas pela
  Central;
- não há série histórica, tendência temporal ou comparação entre períodos;
- a maturidade mede disponibilidade/configuração, não qualidade de processo;
- não há atualização em tempo real, envio de e-mails ou automações externas;
- notificações são resumidas, nunca geradas pela Home;
- nenhuma ação é executada diretamente pela Home.

## Próximos passos

- indicadores históricos de throughput e tempo de ciclo;
- metas operacionais configuráveis;
- comparação por projeto/área para admin e manager;
- atualização incremental por eventos, preservando a Home como visão resumida.

## Integração P-24 — Calendário e SLA

A Home inclui a capacidade **Calendário e SLA** na maturidade operacional. O
radar resume etapas vencidas, etapas próximas do vencimento, revisões vencidas
e documentos sem política de revisão aplicável. Os detalhes e ações continuam
na Central Documental.

Sem o ciclo 21, os indicadores permanecem disponíveis por comparação simples
de datas e a Home informa o modo de compatibilidade sem tratar ausência de
schema como falha crítica.

## Integração P-24.2 — Risco de disponibilidade

A Home resume, sem copiar a caixa da Central:

- responsáveis ausentes sem substituto;
- substituições ativas;
- prazos próximos com responsável indisponível;
- disponibilidade do módulo de ausências e delegações.

Os indicadores são locais e determinísticos. Eles não reatribuem etapas, não
alteram documentos e desaparecem de forma controlada quando o ciclo 22 não
está instalado.

## Integração P-25 — Saúde das notificações

A Home resume notificações críticas não lidas e escalonamentos abertos e
recomenda abrir a inbox. Ela não replica a lista completa nem executa ações.
Sem ciclo 23, a capacidade aparece como não instalada ou usa o fallback legado.

## Integração P-25.1 — Maturidade de notificações

A capacidade da Home passa a se chamar **Notificações e escalonamento**. Com
ciclo 23 ativo e sem críticas abertas, ela aparece disponível; notificações
críticas ou escalonamentos mudam o estado para atenção. Sem ciclo 23, o estado
é não instalado ou fallback.

A Home não executa o health check completo nem duplica a Inbox. Administradores
e gestores usam `/authenticated/configuracoes/diagnostico` para validar RLS,
funções e o checklist de go-live.

## Integração P-26 — Capacidade analítica

A Home mostra a capacidade **Indicadores Operacionais** com os estados não
instalado, precisa configurar, disponível ou atenção. Ela faz somente uma
sondagem resumida e direciona para `/authenticated/indicadores`; rankings,
filtros, SLA e gargalos permanecem no painel P-26.

### Separação preservada na P-26.1

O redesign do cockpit não replica gráficos ou rankings na Home. A Home
continua respondendo “como está a operação?” com poucos sinais e direciona a
análise detalhada para Indicadores Operacionais.

### Separação preservada na P-26.2

Os modos Gestão, Apresentação e Análise, o Governance Score e as exportações
gerenciais vivem somente em `/authenticated/indicadores`. A Home continua
mostrando poucos sinais executivos e o próximo movimento recomendado; ela não
incorpora gráficos BI nem controles de impressão.
