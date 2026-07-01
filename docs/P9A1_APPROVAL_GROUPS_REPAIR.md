# P-9A.1 — Repair de Grupos de Aprovação

## Problema encontrado

O ambiente real possui `public.approval_groups` e
`public.approval_group_members`, mas o contrato legado de grupos exige
`approval_groups.code TEXT NOT NULL`. A administração criada na P-9B não
enviava `code`, portanto o insert falhava com:

```text
null value in column "code" of relation "approval_groups" violates not-null constraint
```

Depois do erro, o detector genérico interpretava qualquer mensagem contendo
`approval_groups` como ausência da fundação P-9A. Por isso a tela mostrava
“Modo de compatibilidade” mesmo com as tabelas e policies presentes.

## Contratos encontrados

### Grupos

O frontend agora aceita:

- enterprise: `code`, `is_active`, `scope`, `project_id` e `metadata`;
- legado: `code` e `active`;
- P-9A original sem `code`: somente leitura e diagnóstico
  `schema_incompatible` até a aplicação deste repair.

O contrato mínimo seguro para criar um grupo é:

- `id`;
- `org_id`;
- `name`;
- `code`;
- indicador de atividade (`is_active` ou `active`).

### Membros

Continuam suportados os dois contratos:

- `user_id`, `role`, `is_active`;
- `profile_id`, `role_in_group`, `active`.

O bridge 09 sincroniza esses aliases quando aplicado. Nenhum membro é criado
automaticamente.

## Correção no frontend

- nome e código são obrigatórios;
- o código é sugerido a partir do nome;
- acentos são removidos;
- letras são convertidas para maiúsculas;
- separadores e caracteres inválidos viram hífen;
- o usuário pode editar a sugestão;
- a tela mostra preview;
- duplicidade conhecida na lista e erro `23505` recebem mensagem legível;
- erros de gravação aparecem dentro do modal;
- leitura enterprise, legado e parcial possuem diagnósticos distintos;
- um erro `NOT NULL` não é mais classificado como “migration ausente”.

Exemplos:

- `Engenharia` → `ENGENHARIA`;
- `Aprovação SST` → `APROVACAO-SST`;
- `Gestores da Obra` → `GESTORES-DA-OBRA`.

## Estados de diagnóstico

- `schema_missing`: tabela de grupos ausente;
- `schema_partial`: grupos existem, mas membros estão incompletos;
- `schema_incompatible`: falta coluna essencial, especialmente `code`;
- `available`: contrato completo e dados disponíveis;
- `rls_blocked`: leitura ou gravação negada por policy;
- `empty`: tabelas disponíveis sem grupos cadastrados;
- `legacy_repair_needed`: contrato legado funcional, com repair recomendado.

Grupo continua opcional. Papel e usuário específico permanecem disponíveis no
builder quando nenhum grupo puder ser selecionado.

## Migration criada

Arquivo:

`supabase/migrations/20260630_p9a1_approval_groups_code_repair.sql`

Ela:

- adiciona `code` quando ausente;
- preenche códigos vazios sem apagar códigos válidos;
- corrige duplicidades preexistentes com sufixo;
- torna `code` obrigatório;
- cria normalização e geração defensivas;
- cria trigger para inserts/updates;
- cria índice único por `org_id` e código normalizado;
- recarrega o schema do PostgREST.

O frontend sempre envia `code`. O trigger é uma segunda barreira para clientes
antigos e corridas de gravação. Em uma corrida, o banco preserva a operação
usando um sufixo (`-2`, `-3`); na UI normal, duplicidade já conhecida é
bloqueada antes do insert.

## Aplicação manual

Nenhum SQL foi executado remotamente. Revise e execute no Supabase SQL Editor
o conteúdo integral de:

`supabase/migrations/20260630_p9a1_approval_groups_code_repair.sql`

O repair pressupõe que `approval_groups` já exista. Se ela não existir, aplique
primeiro a fundação P-9A/08.

## Queries de conferência

### Tabelas

```sql
select to_regclass('public.approval_groups') as approval_groups,
       to_regclass('public.approval_group_members') as approval_group_members;
```

### Colunas de grupos

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'approval_groups'
order by ordinal_position;
```

### Policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('approval_groups', 'approval_group_members')
order by tablename, policyname;
```

### Grupos

Esta consulta corresponde ao contrato legado observado:

```sql
select id, org_id, code, name, active, created_at
from public.approval_groups
order by created_at desc
limit 50;
```

Em instalações com contrato enterprise, use `is_active` no lugar de `active`.

### Funções, trigger e índice

```sql
select proname, pg_get_function_arguments(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'normalize_approval_group_code',
    'generate_approval_group_code',
    'set_approval_group_code'
  )
order by proname;

select tgname, pg_get_triggerdef(oid)
from pg_trigger
where tgrelid = 'public.approval_groups'::regclass
  and not tgisinternal;

select indexname, indexdef
from pg_indexes
where schemaname = 'public'
  and tablename = 'approval_groups'
order by indexname;
```

## Testes manuais

1. Abrir `/authenticated/grupos-aprovacao`.
2. Confirmar que tabela legada existente não aparece como P-9A ausente.
3. Criar `Engenharia` e validar `ENGENHARIA`.
4. Criar `Aprovação SST` e validar `APROVACAO-SST`.
5. Tentar repetir um código e validar a mensagem de duplicidade.
6. Criar grupo sem membros e confirmar o estado vazio de membros.
7. Adicionar, remover e reativar membro.
8. Configurar workflow por papel e por usuário sem selecionar grupo.
9. Selecionar grupo somente quando houver grupo ativo.

## Limitações

- RLS que devolve lista vazia, sem erro, é indistinguível de catálogo vazio no
  cliente; as queries acima confirmam o estado real.
- O repair não transforma os aliases de membros; isso continua sendo
  responsabilidade do bridge 09.
- A resolução automática de corrida por código pode criar lacunas de sufixos,
  o que é intencional para preservar unicidade.
