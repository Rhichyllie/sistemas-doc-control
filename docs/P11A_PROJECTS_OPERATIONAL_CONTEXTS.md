# P-11A — Projetos, Obras e Contextos Operacionais

## Objetivo

A P-11A cria o cadastro operacional usado para organizar documentos,
políticas, códigos, fluxos, dossiês e auditoria.

Não é um gerenciador de tarefas, cronograma ou financeiro. Projeto representa
o contexto documental de uma iniciativa, obra, contrato, unidade ou frente de
trabalho.

## Estado anterior

O repositório já possuía `public.projects` no schema inicial com:

- `id`;
- `code` obrigatório e globalmente único;
- `name`;
- `client`;
- `start_date`;
- `end_date`;
- `status` no enum legado `planning/in_progress/completed/cancelled`;
- `created_by`, datas e RLS.

As policies antigas permitiam leitura global para autenticados e gestão por
papéis do modelo anterior. Uma rota `/authenticated/projects` também existia,
mas trabalha com dados locais e foi preservada.

Migrations posteriores adicionaram `projects.org_id`, mas instalações reais
podem não possuir essa coluna. O frontend já consumia principalmente:

- `projects.id/code/name/status` na criação inteligente;
- relação `documents.project_id`;
- `document_code_patterns.project_id`;
- templates e regras por projeto;
- nomes de projeto na fila de aprovação.

Riscos anteriores:

- contrato Supabase e rota local divergentes;
- código globalmente único em vez de único por organização;
- enum incompatível com status operacionais atuais;
- ausência de cliente estruturado, contrato, local, tipo e responsável;
- consultas rígidas a `org_id/code/status`;
- projetos cancelados ou arquivados disponíveis para novos documentos.

## Migration

Arquivo:

`supabase/migrations/20260630_p11a_projects_operational_contexts.sql`

Aplicação manual:

1. revise o arquivo completo;
2. execute no Supabase SQL Editor;
3. execute as queries de conferência;
4. recarregue o app.

A migration não é executada pelo frontend.

## Compatibilidade com legado

A migration:

- cria `projects` somente se ela não existir;
- adiciona colunas com `IF NOT EXISTS`;
- não remove colunas antigas;
- preserva `client` e copia seu valor para `client_name`;
- converte o enum legado de status para texto;
- converte `in_progress` em `active`;
- converte `completed` em `closed`;
- mantém projetos sem `org_id` como legados/globais;
- substitui a unicidade global de `code` por índice parcial por organização;
- não exclui projetos nem documentos.

Projetos legados sem código explícito recebem apenas no frontend o fallback
`PROJ` + seis caracteres do UUID. O banco não reescreve códigos antigos.

## Schema operacional

Campos principais:

- `org_id`;
- `code`;
- `name`;
- `description`;
- `client_name`;
- `contract_number`;
- `location`;
- `project_type`;
- `status`;
- `area`;
- `responsible_id`;
- `start_date/end_date`;
- `metadata`;
- `is_active`;
- autoria e datas.

### Tipos

- `project`;
- `obra`;
- `contrato`;
- `unidade`;
- `frente_trabalho`;
- `outro`.

### Status

- `planning`;
- `active`;
- `paused`;
- `closed`;
- `cancelled`;
- `archived`.

Projetos `closed`, `cancelled`, `archived` ou inativos não são oferecidos na
criação de novos documentos. Documentos já vinculados continuam íntegros.

## RLS

- leitura: projetos da organização e legados com `org_id IS NULL`;
- insert: `admin/manager` da própria organização;
- update: `admin/manager`; projeto legado precisa ser associado à organização
  ao ser atualizado;
- delete: removido do papel `authenticated`;
- `service_role`: acesso integral.

Projetos legados globais são somente um mecanismo de transição. A ausência de
`org_id` reduz o isolamento e deve ser saneada administrativamente.

## Biblioteca e hooks

`projectOperationalContext.ts` centraliza:

- normalização e sugestão de código;
- validação de nome, tipo, status, datas e metadata;
- labels;
- seletividade;
- descrição e busca.

`useProjects` oferece leitura, criação, edição, ativação, pausa, encerramento e
arquivamento. Ele diferencia schema enterprise, legado, ausente, RLS bloqueada
e erro genérico.

`useProjectOptions` oferece somente projetos selecionáveis para documentos e
codificação, com fallback para o contrato legado.

## Interface

Rota:

`/authenticated/projetos`

Todos os usuários autenticados podem consultar quando RLS permitir.
`admin/manager` podem:

- criar e editar;
- ativar ou pausar;
- encerrar;
- arquivar;
- buscar e filtrar;
- conferir quantidade de documentos.

A rota legada `/authenticated/projects` não foi removida.

## Integração documental

Ao selecionar projeto no Novo Documento Inteligente:

- políticas P-10C são reavaliadas;
- preview P-11 é recalculado;
- código explícito ou fallback é enviado ao preview;
- cliente, contrato, local e status aparecem no painel;
- `project_id`, código, nome, cliente e contrato são registrados no metadata da
  auditoria de criação.

Projetos arquivados/cancelados não aparecem para novos documentos.

## Integração com codificação P-11

A administração de padrões usa `useProjectOptions`.

Quando `{PROJECT}` é usado:

- projeto com código explícito usa esse código;
- projeto sem código usa `PROJxxxxxx`;
- o formulário avisa sobre fallback;
- o preview mostra o contexto disponível.

## Queries de conferência

### 1. Tabela

```sql
select to_regclass('public.projects') as projects;
```

### 2. Colunas

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'projects'
order by ordinal_position;
```

### 3. Policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename = 'projects'
order by policyname;
```

### 4. Projetos

```sql
select
  id,
  org_id,
  code,
  name,
  project_type,
  status,
  is_active,
  client_name,
  contract_number,
  location,
  responsible_id,
  created_at
from public.projects
order by created_at desc
limit 50;
```

### 5. Projeto mínimo por e-mail

Substitua o e-mail antes de executar.

```sql
insert into public.projects (
  org_id,
  code,
  name,
  description,
  project_type,
  status,
  is_active,
  created_by
)
select
  p.org_id,
  'OBRA-MARINA',
  'Obra Marina Itajaí',
  'Projeto operacional para testes documentais.',
  'obra',
  'active',
  true,
  p.id
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_AQUI')
limit 1
returning id, org_id, code, name, project_type, status;
```

### 6. Documentos por projeto

```sql
select
  d.id,
  d.code,
  d.title,
  d.status,
  d.project_id,
  p.code as project_code,
  p.name as project_name
from public.documents d
left join public.projects p on p.id = d.project_id
order by d.created_at desc
limit 50;
```

## Testes manuais

### Sem P-11A

1. abra a criação inteligente;
2. confirme que o catálogo legado continua carregando;
3. confirme a mensagem de compatibilidade;
4. crie documento sem depender dos campos novos.

### Criar projeto

1. aplique a migration em ambiente de teste;
2. acesse `/authenticated/projetos` como admin/manager;
3. crie “Obra Marina Itajaí”;
4. informe `OBRA-MARINA`, tipo `obra` e status `active`;
5. confirme o card e os filtros.

### Documento com projeto

1. abra o Novo Documento Inteligente;
2. selecione `OBRA-MARINA`;
3. confirme cliente, contrato e local;
4. confirme reavaliação de políticas e código;
5. crie o documento e confira `project_id` e metadata da auditoria.

### Código com projeto

1. abra Codificação Documental;
2. crie padrão por projeto com `{PROJECT}`;
3. selecione `OBRA-MARINA`;
4. confirme o token no preview;
5. teste também um projeto sem código explícito e confirme `PROJxxxxxx`.

### Status e permissões

1. arquive um projeto;
2. confirme que ele some das opções de novos documentos;
3. confirme que documentos existentes continuam abrindo;
4. acesse Projetos como elaborador;
5. confirme leitura sem botões de gestão.

## Limitações

- a migration precisa ser aplicada manualmente;
- projetos legados `org_id IS NULL` são visíveis como globais quando RLS
  permitir;
- contagem de documentos é calculada no cliente;
- não há página de detalhe dedicada nesta fase;
- não há tarefas, cronograma, financeiro ou apontamentos;
- não há RDO/RDL;
- a rota antiga local permanece separada para compatibilidade;
- metadata não é editada como JSON cru.

## Próximos passos

- detalhe de projeto com documentos, padrões e eventos;
- dossiês por projeto/contrato;
- RDO/RDL;
- saneamento assistido de projetos globais;
- permissões específicas por responsável;
- analytics operacionais e executivos.
