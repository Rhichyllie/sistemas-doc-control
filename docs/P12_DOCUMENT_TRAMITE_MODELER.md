# P-12 — Modelador de Trâmites Documentais

## Objetivo

A P-12 cria uma camada versionada para modelar, validar, simular e publicar
trâmites documentais reutilizáveis. O foco é o caminho operacional de um
documento — elaboração, revisão, aprovação, correção, evidência, ciência e
publicação — e não processos genéricos de BPM.

O modelador não cria `approval_flows`, não altera documentos, não cria tarefas,
não envia notificações e não executa ações irreversíveis.

## Diagnóstico do workflow anterior

`approval_flows` armazena etapas reais de uma instância de aprovação vinculada
a um documento ou revisão formal. Seus registros possuem status operacional,
responsável por papel/usuário/grupo, prazo, decisão e histórico.

A separação adotada é:

- **P-12:** modelo versionado e publicável;
- **`approval_flows`:** execução real de aprovação existente;
- **fase posterior:** criação transacional de instâncias a partir do modelo.

## Canvas

O canvas usa `@xyflow/react` com nós personalizados, handles, conexões, zoom,
`MiniMap`, controles, movimento e organização automática. O grafo persistido
usa tipos próprios do TRAMITA; o formato do banco não depende dos tipos
internos do React Flow.

## Schema e aplicação manual

Migration:

`supabase/migrations/20260630_p12_document_tramite_modeler.sql`

Aplicação:

1. revise o arquivo completo;
2. confirme os ciclos base e as funções `current_user_org_id()` e
   `is_org_role()`;
3. execute o conteúdo integral manualmente no Supabase SQL Editor;
4. execute as queries deste documento;
5. recarregue o app.

Tabelas:

- `document_tramite_templates`: documento mestre, escopo e versão publicada;
- `document_tramite_template_versions`: grafo e validação de cada versão;
- `document_tramite_nodes`: projeção relacional das etapas;
- `document_tramite_edges`: projeção relacional das conexões;
- `document_tramite_events`: auditoria da administração dos modelos.

O campo `graph` da versão é a fonte canônica. Nós e conexões são sincronizados
para consultas e evoluções futuras.

## Compatibilidade

- a FK de projeto só é criada quando `public.projects` existe;
- a FK de grupo só é criada quando `public.approval_groups` existe;
- grupo não é obrigatório: autor, dono, usuário e papel continuam disponíveis;
- sem P-11A, o modelador funciona sem escopo de projeto;
- sem P-12, a rota apresenta estado de compatibilidade e o restante do app
  continua funcionando.

## RLS

- leitura por membros da organização;
- gestão e publicação por `admin`/`manager`;
- eventos limitados à organização;
- `service_role` com acesso integral;
- a RPC de publicação valida autenticação, organização e papel.

## Tipos de etapa

| Tipo                | Uso documental                     |
| ------------------- | ---------------------------------- |
| Início              | ponto inicial único                |
| Elaboração          | preparação ou complementação       |
| Revisão             | validação técnica                  |
| Aprovação           | decisão formal                     |
| Correção            | retorno controlado                 |
| Evidência           | arquivo ou comprovação obrigatória |
| Ciência obrigatória | confirmação de leitura             |
| Publicação          | disponibilização formal            |
| Decisão             | ramificação condicional            |
| Fim                 | encerramento                       |
| Personalizada       | etapa específica da organização    |

As condições de conexão são: sempre, aprovado, rejeitado, precisa correção,
vencido, evidência ausente e personalizada.

## Presets

1. Aprovação simples;
2. Revisão técnica;
3. Documento com evidência;
4. Ciência obrigatória;
5. Trâmite completo;
6. Dossiê/obra futuro.

O preset de dossiê apenas prepara a modelagem; RDO/RDL e dossiês não foram
implementados.

## Validação

O frontend verifica:

- exatamente um Início e ao menos um Fim;
- nomes, responsáveis e conexões válidas;
- Início sem entrada e Fim sem saída;
- ausência de etapas órfãs;
- caminho completo entre Início e Fim;
- revisão/aprovação antes da publicação;
- correção com retorno;
- ciclos sem condição de saída.

`validate_document_tramite_graph()` repete as verificações estruturais críticas
no banco durante a publicação.

## Simulação

A simulação local considera decisão aprovada/rejeitada, arquivo e evidência.
Ela apresenta caminho, tarefas conceituais, responsáveis, prazos e bloqueios,
sem gravar dados ou criar instâncias.

## Publicação e versionamento

`publish_document_tramite_template(p_template_id)`:

1. valida ator, organização e papel;
2. bloqueia template e versão draft;
3. valida o grafo;
4. arquiva a versão publicada anterior;
5. publica a versão draft;
6. atualiza `current_version_id`;
7. registra evento `published`.

Ao editar um modelo publicado, uma nova versão draft é criada. A versão
publicada continua vigente até a nova publicação.

## Integração com criação inteligente

O Novo Documento Inteligente pode mostrar modelo publicado compatível, número
de etapas e primeira ação. A sugestão não bloqueia e não executa o modelo.
Gravar a sugestão na auditoria e gerar instâncias fica para P-12.1.

## Relação com TRAMITA e MYCELIA

O TRAMITA mantém a semântica documental e a rastreabilidade. Uma camada
MYCELIA poderá futuramente recomendar ou orquestrar modelos, mas não é
dependência desta entrega. Nenhum serviço externo ou IA foi adicionado.

## Evoluções futuras

- gerar instâncias e tarefas de forma transacional;
- mapear etapas compatíveis para `approval_flows`;
- notificações, e-mail e escalonamentos;
- RDO/RDL e dossiês;
- evidências append-only;
- calendário útil e ausências.

## Queries de conferência

### 1. Ver tabelas

```sql
select to_regclass('public.document_tramite_templates') as templates,
       to_regclass('public.document_tramite_template_versions') as versions,
       to_regclass('public.document_tramite_nodes') as nodes,
       to_regclass('public.document_tramite_edges') as edges,
       to_regclass('public.document_tramite_events') as events;
```

### 2. Ver colunas

```sql
select table_name, column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'document_tramite_templates',
    'document_tramite_template_versions',
    'document_tramite_nodes',
    'document_tramite_edges',
    'document_tramite_events'
  )
order by table_name, ordinal_position;
```

### 3. Ver policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_tramite_templates',
    'document_tramite_template_versions',
    'document_tramite_nodes',
    'document_tramite_edges',
    'document_tramite_events'
  )
order by tablename, policyname;
```

### 4. Ver templates

```sql
select id, org_id, code, name, status, template_scope, doc_type, area, project_id,
       is_active, is_default, current_version_id, created_at, updated_at
from public.document_tramite_templates
order by updated_at desc
limit 50;
```

### 5. Ver versões

```sql
select id, template_id, version_number, status, nodes_count, edges_count,
       published_at, created_at
from public.document_tramite_template_versions
order by created_at desc
limit 50;
```

### 6. Ver grafo publicado

```sql
select
  t.name,
  t.code,
  v.version_number,
  v.status,
  v.graph,
  v.validation
from public.document_tramite_templates t
join public.document_tramite_template_versions v on v.id = t.current_version_id
where t.status = 'published'
order by t.updated_at desc
limit 10;
```

### 7. Eventos

```sql
select event_type, template_id, version_id, actor_id, metadata, created_at
from public.document_tramite_events
order by created_at desc
limit 50;
```

### 8. Funções

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'validate_document_tramite_graph',
    'publish_document_tramite_template'
  )
order by proname;
```

## Testes manuais

### Cenário 1 — Sem P-12

1. não aplique a migration;
2. abra `/authenticated/documentos/tramites`;
3. confirme a mensagem de ciclo indisponível;
4. confirme o restante do app funcionando.

### Cenário 2 — Criar trâmite

1. aplique a migration em teste;
2. crie “Revisão técnica padrão”;
3. escolha o preset Revisão técnica;
4. salve o rascunho.

### Cenário 3 — Canvas

1. adicione uma Aprovação;
2. conecte-a à Publicação;
3. mova e renomeie a etapa;
4. defina grupo e prazo de três dias;
5. salve e reabra.

### Cenário 4 — Validação

1. remova o Fim e confira o erro;
2. restaure e conecte o Fim;
3. confirme “Pronto para publicar”.

### Cenário 5 — Simulação

1. simule rejeição e confira o caminho de correção;
2. simule aprovação e confira a publicação;
3. remova arquivo/evidência e confira bloqueios.

### Cenário 6 — Publicação

1. publique um trâmite válido;
2. confira status, `current_version_id` e evento;
3. edite novamente e confira nova versão draft.

### Cenário 7 — Regressão

1. crie documento inteligente;
2. confira a sugestão quando aplicável;
3. confirme que nenhum workflow ou tarefa foi criado.

## Limitações

- não executa modelos, tarefas, notificações ou e-mails;
- importação JSON fica local até salvar;
- não há colaboração simultânea;
- não há calendário útil;
- correção simulada pode terminar em aviso de ciclo;
- auditoria da sugestão fica para P-12.1.
