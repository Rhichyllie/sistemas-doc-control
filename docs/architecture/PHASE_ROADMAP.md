# Roadmap Estrutural e de Produto

Este documento resume as fases operacionais mais recentes e mantém a próxima fronteira explícita.

| Fase | Estado | Papel |
| --- | --- | --- |
| P-20 | Entregue | Central Documental e caixa operacional. |
| P-21 | Entregue | Home Operacional com visão executiva. |
| P-24 | Entregue | Calendário operacional e políticas de SLA. |
| P-25 | Entregue | Notificações, escalonamento e delegação auditável. |
| P-25.1 | Entregue | Diagnóstico Operacional e prontidão de go-live. |
| P-26 | Entregue | Indicadores operacionais read-only. |
| P-26.1 | Entregue | Redesign enterprise do cockpit. |
| P-26.2 | Entregue | Cockpit executivo e exportação gerencial. |
| P-27 | Entregue | Relatórios formais de auditoria e histórico append-only. |
| P-27.1 | Entregue | Central de Exceções e Reconciliação sem mutação operacional. |

## Sequência estrutural antes da P-27.1

- R0 cria guardrails e documentação.
- R1 extrai a navegação do shell sem mudança visual.
- R2 reduz responsabilidades do `AppLayout`.
- R3 e R4 organizam domínios e contratos de forma gradual.
- R5 prepara exceções, reconciliação e hardening de piloto.

P-27.1 cria controle de exceções; correção automática de dados continua fora
do escopo.
