# P-11 — Codificação Documental Inteligente

## Objetivo

A P-11 adiciona padrões de código configuráveis por organização, preview
explicável e alocação concorrente segura. A criação antiga permanece compatível
com o gatilho legado.

Exemplos suportados:

- `TR-SST-PRO-0001`;
- `TR-ENG-IT-0007`;
- `TR-OPS-REG-2026-0042`;
- `TR-PROJ01-ENG-ET-0003`.

## Situação anterior

O código era gerado exclusivamente no banco por
`public.generate_document_code()`, executada pelo trigger
`documents_generate_code` antes do insert.

Formato legado:

```text
<organizations.code_prefix>-<area>-<doc_type>-<sequência de 4 dígitos>
```

O frontend não enviava `documents.code`. A função calculava a próxima sequência
com `MAX + 1`, por organização, área e tipo. Existe a constraint
`documents_org_code_key UNIQUE (org_id, code)`; instalações originadas no schema
mais antigo também podem conservar `UNIQUE (project_id, code)`.

Riscos anteriores:

- duas criações simultâneas podiam calcular o mesmo `MAX + 1`;
- formato fixo e sem configuração por projeto;
- ausência de preview;
- ausência de evento específico de alocação;
- resultado explicável apenas pela leitura da função SQL.

A P-11 preserva função e trigger, mas serializa o cálculo legado com
`pg_advisory_xact_lock`. Não altera códigos já existentes.

## Migration

Arquivo:

`supabase/migrations/20260629_p11_intelligent_document_coding.sql`

Aplicação manual:

1. abra o arquivo completo;
2. revise prefixos, policies e funções;
3. execute o conteúdo integral no Supabase SQL Editor;
4. execute as queries de conferência deste documento;
5. recarregue o app.

A migration termina com `NOTIFY pgrst, 'reload schema'`. O app não executa SQL
remoto.

## Modelo de dados

### `document_code_patterns`

Armazena nome, escopo, prioridade, contexto, expressão, prefixo, padding,
reinício, exemplo e autoria. Pode ser específico por organização, projeto,
área, tipo ou área + tipo.

### `document_code_sequences`

Mantém o último número por:

```text
(org_id, pattern_id, sequence_key)
```

A alocação usa upsert atômico. O preview nunca incrementa a sequência.

### `document_code_events`

Registra código, padrão, chave, número, modo e ator. Modos:

- `preview`;
- `allocated`;
- `legacy`;
- `manual`;
- `repair`.

O preview atual não grava evento para evitar ruído; o modo existe para uma
evolução futura controlada.

## Segurança e RLS

- padrões: leitura pela própria organização; gestão por `admin`/`manager`;
- sequências: leitura administrativa; escrita somente pela função segura;
- eventos: leitura pela própria organização; escrita somente pela função;
- `service_role`: acesso integral;
- RPCs: validam usuário autenticado e organização;
- alocação: valida autor ou papel administrativo e confere tipo, área, projeto
  e `document_id` persistidos;
- projeto de outra organização é rejeitado.

## Escolha do padrão

Somente padrões ativos e da organização atual participam.

Ordem:

1. menor `priority`;
2. projeto exato;
3. tipo + área;
4. tipo;
5. área;
6. `is_default`;
7. `created_at` e `id`.

Empates são determinísticos.

## Tokens

| Token       | Valor                                  |
| ----------- | -------------------------------------- |
| `{PREFIX}`  | prefixo do padrão                      |
| `{AREA}`    | área normalizada                       |
| `{TYPE}`    | tipo normalizado                       |
| `{PROJECT}` | código do projeto ou `GERAL` no SQL    |
| `{YEAR}`    | ano da data de referência              |
| `{MONTH}`   | mês com dois dígitos                   |
| `{SEQ}`     | número com o padding configurado       |
| `{ORG}`     | `organizations.code_prefix`            |
| `{CUSTOM}`  | token customizado opcional em `tokens` |

Exemplos:

```text
{PREFIX}-{AREA}-{TYPE}-{SEQ}
{PREFIX}-{PROJECT}-{AREA}-{TYPE}-{YEAR}-{SEQ}
{ORG}-{TYPE}-{MONTH}-{SEQ}
```

## Preview e alocação final

### `preview_document_code`

Parâmetros:

- `p_doc_type`;
- `p_area`;
- `p_project_id`;
- `p_reference_date`.

Seleciona o melhor padrão e lê a próxima sequência sem reservá-la. Se não
existir padrão, retorna preview no formato legado.

O preview é uma estimativa. Outra criação pode reservar o número antes.

### `allocate_document_code`

Parâmetros:

- `p_document_id`;
- `p_doc_type`;
- `p_area`;
- `p_project_id`;
- `p_reference_date`.

A função:

1. bloqueia o documento;
2. valida organização, ator e contexto;
3. retorna a alocação existente se a chamada for repetida;
4. preserva código manual não reconhecido como legado;
5. incrementa a sequência com upsert atômico;
6. atualiza `documents.code`;
7. registra `document_code_events`;
8. retorna código, padrão, chave e número.

## Integração com a criação

O Novo Documento Inteligente:

- recalcula o preview quando tipo, área ou projeto mudam;
- mostra padrão, número estimado e explicação;
- conecta política P-10C e código previsto;
- solicita alocação após o insert;
- registra na auditoria:
  - `code_preview`;
  - `code_final`;
  - `code_pattern_id`;
  - `code_generation_mode`.

O diálogo antigo continua sem chamar a P-11 e depende do gatilho legado.

Fallbacks:

- RPC ausente: preview local quando a tabela existe;
- ciclo P-11 ausente: preview legado e trigger legado;
- sem padrão aplicável: código legado preservado;
- falha real de alocação: documento preservado com código legado e aviso ao
  usuário;
- falha de log não apaga o documento.

## Concorrência

A sequência configurada é incrementada no banco por upsert. O trigger legado
usa advisory lock por organização/área/tipo.

Números alocados não são reutilizados. Se uma etapa posterior da criação
falhar e o documento for compensado, pode existir lacuna. Isso é intencional:
reutilizar números prejudicaria rastreabilidade.

## Queries de conferência

### 1. Tabelas

```sql
select to_regclass('public.document_code_patterns') as patterns,
       to_regclass('public.document_code_sequences') as sequences,
       to_regclass('public.document_code_events') as events;
```

### 2. Policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_code_patterns',
    'document_code_sequences',
    'document_code_events'
  )
order by tablename, policyname;
```

### 3. Padrões

```sql
select
  id,
  org_id,
  name,
  is_active,
  is_default,
  priority,
  pattern_scope,
  doc_type,
  area,
  project_id,
  prefix,
  pattern,
  sequence_padding,
  sequence_reset,
  example_output
from public.document_code_patterns
order by priority, name;
```

### 4. Padrão mínimo PRO/SST

Substitua o e-mail antes de executar.

```sql
insert into public.document_code_patterns (
  org_id,
  name,
  description,
  is_active,
  is_default,
  priority,
  pattern_scope,
  doc_type,
  area,
  prefix,
  pattern,
  sequence_padding,
  sequence_reset,
  example_output
)
select
  p.org_id,
  'Padrão PRO/SST',
  'Código para procedimentos de saúde e segurança.',
  true,
  true,
  10,
  'area_type',
  'PRO',
  'SST',
  'TR',
  '{PREFIX}-{AREA}-{TYPE}-{SEQ}',
  4,
  'never',
  'TR-SST-PRO-0001'
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_AQUI')
limit 1
returning id, org_id, name, pattern, example_output;
```

### 5. Preview

No SQL Editor, `auth.uid()` normalmente é nulo fora de uma sessão de usuário.
Teste preferencialmente pelo app autenticado. Para uma sessão com contexto:

```sql
select public.preview_document_code('PRO', 'SST', null, current_date);
```

### 6. Sequências

```sql
select *
from public.document_code_sequences
order by updated_at desc;
```

### 7. Eventos

```sql
select *
from public.document_code_events
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
    'generate_document_code',
    'preview_document_code',
    'allocate_document_code'
  )
order by proname;
```

## Testes manuais

### Sem P-11

1. não aplique a migration;
2. abra `/authenticated/documentos/novo-inteligente`;
3. defina tipo e área;
4. confirme aviso de fallback legado;
5. crie o documento;
6. confirme que o trigger gerou o código.

### Padrão PRO/SST e preview

1. aplique a migration em ambiente de teste;
2. abra `/authenticated/documentos/codificacao`;
3. crie padrão ativo PRO/SST, prioridade 10;
4. use `{PREFIX}-{AREA}-{TYPE}-{SEQ}`;
5. abra o Novo Documento Inteligente;
6. informe “Procedimento de Segurança Operacional”;
7. aplique as sugestões PRO/SST;
8. confirme preview `TR-SST-PRO-0001` ou a próxima sequência livre.

### Geração final

1. crie o documento PRO/SST;
2. confirme `documents.code`;
3. confira incremento em `document_code_sequences`;
4. confira evento `allocated`;
5. confira `code_preview` e `code_final` na auditoria;
6. crie outro documento no mesmo contexto;
7. confirme o próximo número.

### Outros contextos e permissão

1. crie padrão ENG/IT e confirme formato diferente;
2. desative um padrão e confirme que ele deixa de ser aplicado;
3. tente acesso direto como elaborador;
4. confirme a mensagem de acesso restrito;
5. use o diálogo antigo e confirme o código legado.

## Limitações

- a migration precisa ser aplicada manualmente;
- preview não reserva número;
- não há renumeração automática de documentos existentes;
- `{CUSTOM}` aceita um valor normalizado pelo campo de token personalizado;
- `separator`, `include_year` e `include_month` são metadados; o formato efetivo
  é definido explicitamente pela expressão `pattern`;
- instalações com projetos legados sem `org_id` precisam alinhar o schema base;
- a criação ainda coordena Storage, documento, versão e auditoria no cliente;
- compensação posterior pode deixar lacuna de sequência, mas não duplica
  número;
- conflitos entre expressões de padrões diferentes são bloqueados pela
  constraint única de `documents.code` por organização.

## Próximos passos

- RPC transacional para criação mestre, versão, auditoria e código;
- ferramenta de reparo assistido para códigos legados;
- política formal de alteração manual de código;
- reserva temporária de número, se houver requisito regulatório;
- relatórios de consumo e colisão de padrões.
