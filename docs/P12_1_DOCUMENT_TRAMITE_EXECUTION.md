# P-12.1 — Execução Segura de Trâmites Documentais

> **Integração P-23:** evidências do tipo arquivo agora podem ser enviadas ao
> bucket privado e registradas pela RPC existente. Etapas `required_file` são
> liberadas somente após evidência `file`; a conclusão continua explícita e
> separada do upload.

## Objetivo

A P-12.1 transforma um modelo P-12 publicado em uma instância documental
rastreável. A execução mantém snapshot do grafo, etapas, conexões, decisões,
evidências e eventos sem transformar o TRAMITA em BPM genérico.

Fluxo:

`documento → modelo publicado → instância → etapas ativas → decisão/evidência → conclusão`

## Modelo versus execução

- P-12 administra modelos e versões. O grafo canônico fica em
  `document_tramite_template_versions.graph`.
- Um modelo disponível para execução tem template ativo e `published`, com
  `current_version_id` apontando para uma versão `published`.
- P-12.1 cria uma instância imutavelmente ligada ao template e à versão
  publicada, copiando o grafo para `graph_snapshot`.
- `approval_flows` continua sendo o workflow formal preexistente. A P-12.1
  não cria, altera nem substitui registros dessa tabela.

Antes desta fase, a criação inteligente apenas sugeria um modelo compatível.
Não existia instância real de trâmite. O início continua explícito no detalhe
do documento; criar um documento não inicia execução automaticamente.

## Migration e aplicação manual

Arquivo:

`supabase/migrations/20260630_p12_1_document_tramite_execution.sql`

Nome sugerido para salvar no SQL Editor:

`18_TRAMITA_document_tramite_execution`

Aplicação:

1. aplique e confira primeiro o ciclo `17_TRAMITA_document_tramite_modeler`;
2. revise integralmente a migration P-12.1;
3. execute seu conteúdo manualmente no Supabase SQL Editor;
4. execute as queries de conferência deste documento;
5. recarregue o app.

O repositório e o frontend não aplicam SQL remoto.

## P-12.1.1 — Hardening antes da aplicação

Como o ciclo 18 ainda não havia sido aplicado, o hardening foi incorporado
diretamente em
`supabase/migrations/20260630_p12_1_document_tramite_execution.sql`, sem criar
uma nova migration ou um novo ciclo SQL.

Os ajustes são:

- atribuição por papel detecta dinamicamente `profiles.active` ou
  `profiles.is_active`; quando nenhuma das colunas existe, valida somente
  usuário, organização e papel;
- cada etapa usa `node_key` e recorre a `id` quando o identificador operacional
  está ausente ou vazio;
- labels vazias recebem fallback seguro pelo tipo da etapa ou identificador;
- conexões aceitam origem/destino serializados por `id` ou `node_key` e são
  normalizadas para a chave efetivamente persistida;
- nós sem `node_key` e sem `id`, ou conexões sem identificadores válidos,
  geram erro legível antes dos inserts;
- `audit_trail` é complementar: a função
  `tramita_audit_trail_supports_basic_contract()` verifica a tabela e as
  colunas mínimas antes do insert;
- mesmo com contrato básico detectado, falhas específicas do log ficam
  isoladas e não desfazem a execução do trâmite;
- eventos em `document_tramite_instance_events` continuam obrigatórios e são a
  trilha canônica da execução.

## Schema

| Tabela                               | Finalidade                                       |
| ------------------------------------ | ------------------------------------------------ |
| `document_tramite_instances`         | instância do modelo aplicada ao documento        |
| `document_tramite_instance_steps`    | etapas executáveis geradas dos nós               |
| `document_tramite_instance_edges`    | snapshot das conexões e condições                |
| `document_tramite_instance_evidence` | notas, links, referências e metadados de arquivo |
| `document_tramite_instance_events`   | log append-only da execução                      |

Uma restrição única parcial impede duas instâncias ativas do mesmo
documento/template/versão. Instâncias concluídas ou canceladas não são
reutilizadas.

## RPCs

### `start_document_tramite_instance`

Valida autenticação, organização, documento, ator, modelo publicado e grafo.
Quando nenhum template é informado, seleciona o modelo compatível mais
específico por projeto, tipo, área e default. A função:

- obtém lock transacional para evitar início concorrente;
- cria instância, etapas e conexões;
- conclui o nó Início;
- ativa suas próximas etapas;
- não altera o documento;
- não cria `approval_flows`;
- registra eventos e `audit_trail`.

### `complete_document_tramite_step`

Aceita apenas etapa ativa de instância ativa. Valida o responsável por autor,
dono, usuário, papel ou grupo e trata aliases legados de membros. Comentário e
evidência são exigidos conforme o snapshot. A decisão escolhe conexões
`always`, `approved`, `rejected`, `needs_correction`, `expired` ou
`evidence_missing`. Condições `custom` não são executadas automaticamente.

Ao chegar ao Fim sem outras etapas ativas, a instância é concluída. Ausência
de caminho aplicável marca a instância como `failed`, preservando os eventos.

### `add_document_tramite_evidence`

Registra evidência somente em etapa ativa e por ator autorizado. A P-12.1
expõe nota, link e referência externa. O contrato de arquivo já existe, mas
não há upload de storage novo nesta fase.

### `cancel_document_tramite_instance`

Autor, administrador ou gestor pode cancelar instância ativa com motivo
obrigatório. Etapas abertas são canceladas e o histórico permanece.

## Segurança

- `authenticated` recebe somente `SELECT` nas cinco tabelas;
- não há policy nem grant de escrita direta para usuários autenticados;
- todas as mutações passam por RPCs `SECURITY DEFINER` com
  `search_path=public`;
- cada RPC valida `auth.uid()`, `current_user_org_id()` e as relações da
  instância;
- `service_role` mantém acesso integral;
- grupo aceita `user_id/profile_id` e `is_active/active`;
- atribuição por papel aceita `profiles.active`, `profiles.is_active` ou
  ausência de ambos;
- conclusão de etapa inativa, instância encerrada ou ator incorreto é
  bloqueada;
- eventos próprios são obrigatórios; `audit_trail`, quando compatível,
  complementa início, conclusão de etapa, conclusão e cancelamento sem poder
  interromper a RPC.

## Lifecycle

Instância:

- `active`: possui uma ou mais etapas ativas;
- `completed`: alcançou Fim e não há outra etapa ativa;
- `cancelled`: encerrada explicitamente com motivo;
- `failed`: não havia caminho executável após uma etapa.

Etapa:

- `pending`: aguardando ativação;
- `active`: disponível para o responsável;
- `completed`: concluída com decisão;
- `skipped`: não utilizada ao encerrar a instância;
- `blocked`: reservada para reparo/diagnóstico;
- `cancelled`: encerrada junto com a instância.

Decisões:

- revisão/aprovação: `approved`, `rejected`, `needs_correction`;
- evidência: `attached` ou `completed`;
- ciência obrigatória: `acknowledged`;
- demais etapas: `completed`.

## Integração no documento

O detalhe do documento exibe **Execução de Trâmite**:

- modelos publicados aplicáveis;
- início explícito;
- execução ativa e histórico;
- progresso e timeline;
- ações das etapas atribuídas ao usuário;
- evidências;
- eventos e cancelamento.

O painel usa fallback amigável quando o ciclo 18 não existe. Dashboard,
criação antiga, criação inteligente e `approval_flows` continuam funcionando.
Não foi criada rota global de execuções nesta fase; o acesso é contextual pelo
documento.

## Queries de conferência

### `18_CHECK_01_execution_tables`

```sql
select to_regclass('public.document_tramite_instances') as instances,
       to_regclass('public.document_tramite_instance_steps') as steps,
       to_regclass('public.document_tramite_instance_edges') as edges,
       to_regclass('public.document_tramite_instance_evidence') as evidence,
       to_regclass('public.document_tramite_instance_events') as events;
```

### `18_CHECK_02_execution_columns`

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'document_tramite_instances',
    'document_tramite_instance_steps',
    'document_tramite_instance_edges',
    'document_tramite_instance_evidence',
    'document_tramite_instance_events'
  )
order by table_name, ordinal_position;
```

### `18_CHECK_03_execution_policies`

```sql
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_tramite_instances',
    'document_tramite_instance_steps',
    'document_tramite_instance_edges',
    'document_tramite_instance_evidence',
    'document_tramite_instance_events'
  )
order by tablename, policyname;
```

### `18_CHECK_04_execution_functions`

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'start_document_tramite_instance',
    'complete_document_tramite_step',
    'add_document_tramite_evidence',
    'cancel_document_tramite_instance',
    'tramita_audit_trail_supports_basic_contract'
  )
order by proname;
```

### `18_CHECK_05_execution_recent_instances`

```sql
select
  i.id,
  i.document_id,
  i.template_id,
  i.template_version_id,
  i.status,
  i.current_node_keys,
  i.started_by,
  i.started_at,
  i.completed_at,
  i.cancelled_at
from public.document_tramite_instances i
order by i.created_at desc
limit 50;
```

### `18_CHECK_06_execution_steps`

```sql
select
  s.instance_id,
  s.node_key,
  s.node_type,
  s.label,
  s.status,
  s.assignment_type,
  s.assignee_user_id,
  s.assignee_group_id,
  s.due_at,
  s.decision,
  s.completed_by,
  s.completed_at
from public.document_tramite_instance_steps s
order by s.created_at desc
limit 100;
```

### `18_CHECK_07_execution_events`

```sql
select
  event_type,
  instance_id,
  step_id,
  document_id,
  actor_id,
  metadata,
  created_at
from public.document_tramite_instance_events
order by created_at desc
limit 100;
```

## Testes manuais

### 1. Sem P-12.1

1. não aplique o ciclo 18;
2. abra modelador, criação antiga e criação inteligente;
3. confirme funcionamento normal;
4. abra um documento e confira o aviso de execução não instalada.

### 2. Iniciar execução

1. publique um modelo P-12;
2. abra um documento compatível;
3. clique **Iniciar trâmite** e escolha o modelo;
4. confirme instância e etapas iniciais ativas.

### 3. Concluir etapa simples

1. abra a etapa ativa;
2. informe comentário quando exigido;
3. conclua;
4. confira próxima etapa e evento `step_completed`.

### 4. Aprovação rejeitada

1. escolha `rejected` ou `needs_correction`;
2. confirme o caminho para Correção;
3. conclua a Correção;
4. confirme o retorno previsto no modelo.

### 5. Evidência obrigatória

1. tente concluir uma etapa de evidência sem registro;
2. confirme o bloqueio;
3. registre uma nota;
4. conclua quando a etapa não exigir arquivo;
5. confira `evidence_added`.

### 6. Ciência obrigatória

1. abra etapa `mandatory_reading`;
2. registre `acknowledged`;
3. confirme avanço.

### 7. Cancelamento

1. inicie uma execução;
2. cancele com motivo;
3. confirme instância e etapas canceladas;
4. confira `instance_cancelled`.

### 8. Segurança

1. tente concluir etapa inativa;
2. tente agir como usuário/grupo diferente;
3. tente iniciar duplicidade ativa;
4. confirme bloqueios.

### 9. Regressão

1. crie documento pelo diálogo antigo;
2. crie pelo Novo Documento Inteligente;
3. confirme ausência de início automático;
4. confirme funcionamento sem ciclo 18.

## Limitações

- não cria ou sincroniza `approval_flows`;
- não muda status, versão, arquivo ou publicação do documento;
- não envia notificações, e-mails ou integrações;
- condição `custom` não é avaliada;
- upload de arquivo de evidência não foi implementado; etapas com
  `required_file` continuam bloqueadas até um arquivo ser registrado por
  integração futura;
- não há caixa global de execuções nem reparo administrativo;
- não há calendário útil, escalonamento, tarefas ou RDO/RDL;
- `audit_trail` pode ser ignorado quando o schema local não oferece o contrato
  mínimo; os eventos próprios permanecem obrigatórios;
- o painel faz checagem local para UX, mas a RPC é a autoridade final.

## Integração P-18A

O painel de execução está na rota real
`/authenticated/documents/$documentId`. Ele prioriza o modelo sugerido na
criação, lista execuções existentes e permite escolher outro modelo publicado.

Sem o ciclo 18, o painel informa que a execução ainda não está instalada e que
o modelo foi apenas sugerido. Nenhuma criação inicia trâmite automaticamente.

## Integração P-20

A Central Documental consolida instâncias e etapas ativas P-12.1 em
`/authenticated/documentos/central`. O hook de instâncias pode carregar as
etapas de todas as execuções ativas para calcular responsável, prazo e
progresso.

A Central é somente leitura. Conclusão, evidência e cancelamento permanecem no
detalhe do documento e continuam protegidos pelas RPCs do ciclo 18.

## Integração P-24 — Prazo operacional

A P-24 não altera as RPCs de início ou conclusão do ciclo 18. O `due_at`
persistido continua sendo a fonte principal da etapa.

Quando uma etapa ativa não possui `due_at`, o detalhe pode calcular e exibir
uma sugestão com base no calendário e na política SLA aplicável. A sugestão é
marcada como não persistida e não muda etapa, documento, `approval_flows` ou
status automaticamente. Sem o ciclo 21, o painel preserva os prazos existentes
e omite a sugestão.

## Integração P-24.2 — Ausências e substituições

O painel de execução pode informar que o responsável original está ausente e
mostrar o substituto resolvido pelo ciclo 22. A informação não altera
`assignee_user_id` e não modifica a autoria dos eventos.

Nesta fase, `document_tramite_actor_can_act` continua sendo a autoridade e não
foi ampliada para substitutos. Portanto, a substituição é informativa. A
autorização delegada para concluir etapas exige validação e auditoria próprias
e ficou reservada à P-25. `approval_flows` permanece inalterado.

## Integração P-25 — Conclusão delegada auditável

O ciclo 23 implementa a evolução prevista. A autorização original continua
válida e `resolve_effective_tramite_actor` acrescenta somente substituto
confirmado por P-24.2 para etapa ativa com `assignment_type = specific_user`.

O titular permanece em `assignee_user_id`; `completed_by` registra quem agiu.
Etapa, eventos e auditoria recebem `delegated_from_user_id`, razão e fonte da
delegação. Chaves reservadas enviadas pelo cliente são descartadas e
reconstruídas pelo banco. Grupo e papel não possuem ação delegada.
