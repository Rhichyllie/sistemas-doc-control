# P-20 — Central Operacional Documental

## Objetivo

A Central Documental responde à pergunta operacional: **o que eu preciso fazer
agora?**

Ela consolida fontes existentes sem criar outro mecanismo de workflow e sem
executar ações automaticamente.

Rota:

`/authenticated/documentos/central`

> **Separação P-21:** a Home em `/authenticated/dashboard` mostra saúde,
> maturidade e riscos executivos. A Central permanece a caixa operacional com
> os itens que precisam de navegação e ação no detalhe.

> **Integração P-23:** a Central continua somente como cockpit e navegação.
> Arquivos de evidência são enviados e registrados no detalhe do documento,
> dentro da etapa ativa.

## Diagnóstico anterior

O TRAMITA já possuía:

- Home Operacional em `/authenticated/dashboard`;
- Minhas Atividades em `/authenticated/atividades`;
- documentos em `/authenticated/documents`;
- detalhe em `/authenticated/documents/$documentId`;
- Fila de Aprovação em `/authenticated/fluxo-de-aprovacao`;
- modelador em `/authenticated/documentos/tramites`;
- execução P-12.1 dentro do detalhe do documento.

A Home e Minhas Atividades consolidavam aprovações, notificações e revisões,
mas não exibiam instâncias e etapas P-12.1 nem documentos com modelo aplicável
sem execução. A Central foi criada como cockpit documental complementar, sem
substituir essas telas.

## Fontes consolidadas

### Documents

`useDocuments` fornece:

- documentos recentes;
- rascunhos;
- projeto;
- próxima revisão;
- revisão formal em preparação;
- correção solicitada;
- fallback quando relações de projeto ou revisão ainda não existem.

### Approval flows

`useApprovalQueue` fornece as etapas formais pendentes e mantém os fallbacks
por usuário, papel, grupo e schema legado.

### Execução P-12.1

`useDocumentTramiteInstances` foi ampliado para carregar todas as etapas das
instâncias ativas quando usado pela Central. A leitura usa as policies
multi-tenant existentes do ciclo 18.

### Modelos e sugestões

Modelos publicados e a trilha de auditoria identificam documentos com trâmite
sugerido ou aplicável ainda não iniciado.

### Projetos

`useProjectOptions` fornece o filtro de projeto e mantém compatibilidade com o
catálogo legado.

## O que a Central mostra

- minhas etapas ativas de trâmite;
- aprovações formais pendentes;
- trâmites em execução e progresso;
- rascunhos;
- correções;
- revisões formais em preparação;
- revisões documentais próximas ou atrasadas;
- documentos sem código legível;
- documentos com trâmite sugerido sem execução;
- documentos recentes.

Os filtros cobrem:

- escopo pessoal ou organização;
- atraso;
- projeto;
- tipo documental;
- área;
- status;
- origem.

Usuários comuns permanecem no escopo pessoal. Admin e manager podem alternar
para toda a organização.

## Ações

A Central é somente um cockpit de leitura e navegação:

- etapas e instâncias abrem o detalhe com foco no painel de execução;
- aprovações abrem o documento;
- rascunhos e correções abrem o detalhe;
- revisões próximas abrem o documento;
- sugestões levam ao painel em que o usuário confirma o início.

Nenhuma etapa é concluída na Central. Nenhum trâmite é iniciado
automaticamente.

## Compatibilidade

### Sem ciclo 18

A tela informa:

> Execução de trâmites ainda não instalada. A Central mostra documentos e
> revisões disponíveis.

Documentos, rascunhos, revisões e aprovações continuam disponíveis.

### Sem ciclo 19

A tela informa:

> Controles avançados de criação/codificação ainda não instalados.

O código legado continua legível e a Central não depende dos campos novos.

### Sem approval_flows

O bloco formal fica sem itens e a tela mostra aviso de fonte indisponível.

### Sem projetos

O filtro de projetos é ocultado. Documento, código, tipo e área continuam
visíveis.

## SQL

A P-20 não cria migration. As tabelas atuais já oferecem leitura por
organização, e os hooks existentes resolvem os fallbacks necessários.

Não existe ciclo `20_TRAMITA_document_work_center` nesta fase.

## Testes manuais

1. Abra a Central sem o ciclo 18 e confirme o aviso e os documentos.
2. Com o ciclo 18, confirme instâncias e etapas ativas.
3. Crie um documento `draft` e confirme sua entrada na caixa.
4. Crie documento com trâmite sugerido e não iniciado.
5. Inicie o trâmite e confirme a troca da sugestão pela execução.
6. Conclua uma etapa no detalhe, atualize a Central e confira o progresso.
7. Configure `due_at` passado e confirme prioridade crítica.
8. Filtre por projeto.
9. Filtre por tipo, área, status e origem.
10. Confirme que usuário comum permanece em **Minhas pendências**.
11. Confirme que admin/manager pode selecionar **Toda a organização**.
12. Confirme que nenhum CTA inicia ou conclui trâmite automaticamente.

## Limitações

- a Central carrega até 500 instâncias recentes para identificar execuções e
  históricos iniciados;
- a necessidade obrigatória de projeto não é inferida sem uma política
  documental explícita;
- conclusão de etapa, aprovação e correção continuam nas telas de detalhe;
- a Central exibe notificações, mas não as gera e não executa ações inline;
- não há e-mails, tarefas ou automações externas;
- não há paginação server-side da caixa nesta fase;
- a segurança final das mutações permanece nas RPCs e RLS dos módulos de
  origem.

## Próximos passos

- paginação e consulta incremental para organizações com grande volume;
- caixa operacional persistida e preferências de filtros;
- indicador de política que exige projeto;
- atualização em tempo real por eventos de banco;
- métricas de throughput e gargalos sem alterar o workflow.

## Integração P-24 — Calendário e SLA

A Central preserva `due_at` e `next_review_at` quando já existem. Com o ciclo
21 instalado e configurado, a janela de atenção usa dias úteis e feriados.
Quando uma etapa ou revisão não possui prazo persistido, uma política SLA
aplicável pode fornecer uma sugestão identificada como **não persistida**.

Sem o ciclo 21, a Central mantém o comportamento anterior por comparação
simples de datas. Nenhum prazo, status ou etapa é alterado pela tela.

## Integração P-24.2 — Disponibilidade da equipe

Quando o ciclo 22 está disponível, a Central cruza etapas atribuídas a usuário
específico com ausências e delegações da organização. Ela pode exibir:

- **Responsável ausente**;
- **Substituição ativa** e o nome do substituto;
- **Ausência sem substituto**, como atenção operacional;
- prazos próximos cujo responsável está indisponível.

Esse cruzamento é somente leitura. A Central não muda `assignee_user_id`, não
conclui etapas e não concede ao substituto autorização para agir. Sem o ciclo
22, a caixa continua funcionando sem esses badges.

## Integração P-25 — Notificações e escalonamentos

A Central mostra contagem de notificações, escalonamento e quando o usuário
atual pode agir como substituto auditável. Os CTAs abrem a inbox ou o detalhe
do documento; nenhuma conclusão ocorre inline.

Sem o ciclo 23, os badges são omitidos e a Central mantém todas as fontes
anteriores.

## Integração P-25.1 — Saúde operacional

A Central identifica de forma sutil quando notificações enterprise estão
ativas, em fallback legado ou indisponíveis. Falhas do ciclo 23 direcionam o
administrador ao Diagnóstico Operacional; abrir ou atualizar a Central não
executa `generate_operational_notifications`.

O checklist também confirma que a Central permanece cockpit de navegação:
conclusão, evidência e ação delegada continuam no detalhe do documento.
