# P-10C — Templates e Regras Documentais Enterprise

## Objetivo

A P-10C adiciona governança configurável à criação documental inteligente. A organização pode definir templates e políticas por tipo documental, área, projeto ou contexto geral sem substituir a criação antiga e sem depender de IA externa.

O Novo Documento Inteligente continua funcionando com as heurísticas P-10B quando o ciclo 14 não estiver instalado.

## Migration

Arquivo:

`supabase/migrations/20260629_p10c_document_templates_and_rules.sql`

A migration deve ser revisada e executada manualmente no Supabase SQL Editor. O frontend não aplica SQL.

Ela cria:

### `document_creation_templates`

Armazena padrões de criação, incluindo:

- escopo organizacional, por projeto, área ou tipo;
- prioridade;
- período padrão de revisão;
- campos obrigatórios e recomendados;
- descrição e metadados sugeridos;
- perfil de risco;
- estado ativo e template padrão.

### `document_creation_rules`

Armazena condições e efeitos simples em JSONB:

```json
{
  "doc_type": "PRO",
  "area": "SST"
}
```

```json
{
  "required_fields": ["description", "file"],
  "review_period_months": 12,
  "risk_level": "high",
  "recommendations": [
    "Procedimentos de SST devem conter evidência de validação técnica."
  ]
}
```

Condições reconhecidas pelo cliente:

- `doc_type`;
- `area`;
- `project_id`;
- `tags_contains`;
- `metadata_contains`.

Condições desconhecidas não são aplicadas. Esse comportamento evita que um JSON novo ou inválido libere uma política por engano.

### `document_template_usage_logs`

Registra:

- template utilizado;
- documento criado;
- usuário;
- modo de criação;
- regras aplicadas;
- score de governança;
- origem da criação.

O log é complementar. Sua ausência ou indisponibilidade não invalida um documento criado corretamente.

## RLS

As três tabelas usam RLS:

- leitura limitada à organização atual;
- templates e regras somente podem ser criados, alterados ou removidos por `admin` ou `manager`;
- usuários autenticados podem inserir logs apenas para sua organização e com seu próprio `user_id`;
- logs são somente leitura e inserção no frontend;
- `service_role` mantém acesso administrativo.

As policies usam `current_user_org_id()` e `is_org_role(...)`, seguindo o padrão enterprise existente.

## Prioridade de decisão

A criação resolve configurações nesta ordem:

1. regra obrigatória aplicável;
2. template selecionado;
3. `default_review_months` de `document_types`;
4. heurística local P-10B;
5. fallback seguro.

Regras são avaliadas por prioridade crescente. Em templates, a prioridade vem antes da especificidade; em empate, projeto, tipo e área aumentam a especificidade e `is_default` desempata.

Campos obrigatórios de todas as regras aplicáveis são combinados. Risco nunca é reduzido por uma regra: prevalece o maior nível entre heurística, template e regras.

## Motor de regras

`src/lib/documentTemplateRules.ts` concentra funções puras:

- seleção do melhor template;
- avaliação segura das condições;
- normalização dos efeitos;
- combinação com heurísticas;
- checklist de obrigatoriedade;
- score de governança;
- explicações legíveis.

JSON inválido, campos desconhecidos e valores fora do intervalo são descartados de forma defensiva.

## Integração com a criação

O painel inteligente mostra, quando disponível:

- template recomendado;
- regras aplicadas;
- impacto das regras;
- checklist de campos obrigatórios;
- score de governança;
- risco crítico;
- período de revisão obrigatório.

Uma regra pode bloquear a criação quando:

- um campo obrigatório estiver ausente;
- o período de revisão não corresponder ao período obrigatório.

O botão **Aplicar sugestões** aplica o prazo resolvido e pode preencher a descrição e os metadados padrão do template quando esses campos estão vazios.

O score de governança é separado do score de completude.

## Auditoria e uso

`audit_trail.action = created` continua sendo usado. A metadata passa a incluir:

- `template_id`;
- `template_name`;
- `applied_rule_ids`;
- `governance_score`;
- `required_fields_missing`;
- `source = intelligent_creation`.

Quando existe template ou regra aplicada, o cliente tenta inserir também em `document_template_usage_logs`.

Se a tabela ainda não existir, a criação termina normalmente. Se a tabela existir, mas uma policy impedir o log, o documento é preservado e a interface mostra um alerta não bloqueante.

## Administração

Rota:

`/authenticated/documentos/regras`

Nome no menu:

**Regras Documentais**

Somente `admin` e `manager` visualizam o item. O acesso direto por outro papel mostra uma mensagem de acesso restrito.

A tela permite:

- listar templates e regras ativos ou inativos;
- criar e editar;
- ativar e desativar;
- escolher tipo, área e projeto;
- definir prioridade;
- selecionar campos obrigatórios;
- definir prazo e risco;
- cadastrar recomendações sem escrever JSON.

## Fallbacks

Sem a migration P-10C:

- `canUseTemplates = false`;
- `canUseRules = false`;
- as listas ficam vazias;
- a tela administrativa orienta a aplicação do ciclo 14;
- o Novo Documento Inteligente continua usando P-10B;
- a criação antiga permanece inalterada.

Se apenas uma das tabelas estiver disponível, o recurso correspondente continua operando e o outro permanece em fallback.

## Aplicação manual

1. abra o arquivo `supabase/migrations/20260629_p10c_document_templates_and_rules.sql`;
2. revise tabelas, FKs, checks, índices, triggers, grants e policies;
3. copie o conteúdo integral;
4. execute no Supabase SQL Editor do ambiente desejado;
5. execute as queries de conferência abaixo;
6. atualize o navegador antes de testar a administração.

## Queries de conferência

### Tabelas

```sql
select to_regclass('public.document_creation_templates') as document_creation_templates,
       to_regclass('public.document_creation_rules') as document_creation_rules,
       to_regclass('public.document_template_usage_logs') as document_template_usage_logs;
```

### Policies

```sql
select schemaname, tablename, policyname, cmd
from pg_policies
where schemaname = 'public'
  and tablename in (
    'document_creation_templates',
    'document_creation_rules',
    'document_template_usage_logs'
  )
order by tablename, policyname;
```

### Colunas

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name in (
    'document_creation_templates',
    'document_creation_rules',
    'document_template_usage_logs'
  )
order by table_name, ordinal_position;
```

### Configurações ativas

```sql
select id, name, doc_type, area, project_id, priority, risk_profile, required_fields
from public.document_creation_templates
where is_active = true
order by priority, name;

select id, name, priority, severity, condition, effects
from public.document_creation_rules
where is_active = true
order by priority, name;
```

### Uso na criação

```sql
select
  logs.created_at,
  logs.document_id,
  logs.template_id,
  logs.user_id,
  logs.creation_mode,
  logs.applied_rules,
  logs.metadata
from public.document_template_usage_logs as logs
order by logs.created_at desc
limit 50;
```

## Testes manuais

### Cenário 1 — ambiente sem P-10C

1. não aplique a migration;
2. abra `/authenticated/documentos/novo-inteligente`;
3. confirme o aviso de modo compatível;
4. confirme inferência, score e criação P-10B.

### Cenário 2 — template PRO/SST

1. aplique P-10C em ambiente de teste;
2. acesse **Regras Documentais** como admin/manager;
3. crie template para `PRO` e `SST`;
4. exija descrição e arquivo;
5. digite “Procedimento de Segurança Operacional”;
6. aplique as sugestões;
7. confirme template recomendado;
8. confirme bloqueio sem descrição ou arquivo.

### Cenário 3 — regra IT/MNT

1. crie regra para `IT` e `MNT`;
2. defina revisão em 12 meses e risco médio;
3. abra a criação inteligente;
4. selecione tipo e área;
5. confirme prazo, risco e explicação no painel.

### Cenário 4 — auditoria

1. crie documento com template e regra;
2. confira `audit_trail.metadata`;
3. confira `document_template_usage_logs`;
4. confirme `template_id`, regras e score.

### Cenário 5 — acesso

1. acesse `/authenticated/documentos/regras` com papel diferente de admin/manager;
2. confirme a mensagem de acesso restrito;
3. confirme que o item não aparece no menu.

## Limitações

- o motor suporta condições JSON simples, sem linguagem de expressão arbitrária;
- regras não executam workflow automaticamente;
- templates não geram DOCX/PDF;
- não existe leitura do conteúdo do arquivo;
- o log de uso é complementar e não transacional com Storage;
- alterações de regra não reprocessam documentos já criados;
- o catálogo legado de projetos não possui `org_id`; a seleção segue o mesmo acesso global já usado pelo módulo de projetos;
- não há calendário útil ou dias úteis;
- não há versionamento histórico formal das regras nesta fase.

## Próximos passos

- versionamento e vigência de políticas;
- simulação de impacto antes de ativar regra;
- templates setoriais;
- vínculo opcional com templates de workflow;
- calendário útil e regras temporais;
- analytics de aderência documental.

## Hardening P-10C.1

### Diagnóstico do problema relatado

A revisão não encontrou incompatibilidade estrutural que exija uma migration de reparo. O ciclo 14 usa os mesmos helpers de organização e papel já adotados pelas migrations enterprise.

Os sintomas observados são compatíveis com uma destas situações:

1. as tabelas existem, mas não receberam registros;
2. o insert foi bloqueado por RLS;
3. `profiles.org_id` não corresponde ao `org_id` consultado;
4. o papel do perfil não é `admin` ou `manager`;
5. a tela está conectada a outro ambiente Supabase;
6. existem registros, mas estão inativos;
7. existem registros ativos, mas seus códigos de tipo/área não correspondem ao input atual.

Também havia uma falha de UX confirmada: erros de insert eram exibidos na página administrativa atrás do modal. Quando RLS bloqueava o save, o diálogo permanecia aberto sem apresentar o motivo no próprio formulário. A P-10C.1 mostra o erro dentro do modal e exige que insert/update retorne o `id` persistido.

O frontend agora separa explicitamente:

- ciclo ausente;
- schema parcial;
- tabelas vazias;
- leitura bloqueada por RLS;
- perfil ou organização ausentes;
- papel sem permissão administrativa;
- registros ativos e inativos;
- registros existentes, mas não aplicáveis;
- falha de insert ou update.

Inserts e updates usam retorno do banco para confirmar que o registro realmente foi persistido e ficou visível pela policy de leitura.

### Estados apresentados

- **Templates e regras ainda não foram cadastrados:** tabelas disponíveis e vazias;
- **Ciclo P-10C não instalado:** tabelas ausentes ou fora do schema cache;
- **Schema P-10C incompleto:** somente parte das tabelas existe;
- **Leitura bloqueada por RLS:** tabela existe, mas o usuário não consegue consultar;
- **Acesso restrito:** usuário não é admin/manager;
- **Governança disponível:** registros carregados com contagem de ativos e inativos.

Se um elaborador acessar diretamente a rota administrativa, nenhum hook administrativo é carregado. Se o próprio usuário perdeu o papel de admin/manager, apenas outro administrador ou uma manutenção controlada no Supabase pode restaurá-lo.

### Prioridade e conflitos

- templates e regras inativos nunca são aplicados;
- dados de outra organização são rejeitados;
- condições desconhecidas não são aplicadas;
- efeitos desconhecidos são ignorados sem quebrar a criação;
- prioridade numérica menor vence;
- empates usam `created_at`, `id` e nome para decisão determinística;
- campos obrigatórios são a união das regras aplicáveis;
- risco nunca é reduzido;
- conflitos de período usam a regra de maior prioridade e geram alerta visível.

### Queries de diagnóstico

As queries desta seção são operações de manutenção administrativa. Revise o ambiente e substitua `SEU_EMAIL_AQUI` antes de executar qualquer escrita.

#### 1. Ver tabelas

```sql
select to_regclass('public.document_creation_templates') as templates,
       to_regclass('public.document_creation_rules') as rules,
       to_regclass('public.document_template_usage_logs') as logs;
```

#### 2. Ver templates

```sql
select
  id,
  org_id,
  name,
  doc_type,
  area,
  project_id,
  priority,
  is_active,
  is_default,
  template_scope,
  required_fields,
  default_review_months,
  risk_profile
from public.document_creation_templates
order by priority, name;
```

#### 3. Ver regras

```sql
select
  id,
  org_id,
  name,
  priority,
  is_active,
  severity,
  condition,
  effects
from public.document_creation_rules
order by priority, name;
```

#### 4. Ver perfil atual

```sql
select
  p.id,
  p.org_id,
  p.role,
  u.email
from public.profiles p
join auth.users u on u.id = p.id
where u.id = auth.uid();
```

No SQL Editor executado como administrador, `auth.uid()` pode ser nulo. Nesse caso, use a consulta por e-mail.

#### 5. Ver perfil por e-mail

```sql
select
  p.id,
  p.org_id,
  p.role,
  u.email
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_AQUI');
```

#### 6. Restaurar admin por e-mail

Use somente em manutenção controlada e depois de confirmar organização e identidade.

```sql
update public.profiles p
set role = 'admin',
    updated_at = now()
from auth.users u
where u.id = p.id
  and lower(u.email) = lower('SEU_EMAIL_AQUI')
returning p.id, u.email, p.org_id, p.role, p.updated_at;
```

#### 7. Inserir template PRO/SST mínimo

Use apenas para diagnóstico quando a administração pela interface estiver indisponível.

```sql
insert into public.document_creation_templates (
  org_id,
  name,
  description,
  doc_type,
  area,
  is_active,
  is_default,
  priority,
  template_scope,
  default_review_months,
  required_fields,
  recommended_fields,
  risk_profile
)
select
  p.org_id,
  'Procedimento SST',
  'Template mínimo para procedimento de saúde e segurança.',
  'PRO',
  'SST',
  true,
  true,
  10,
  'organization',
  12,
  '["description", "file"]'::jsonb,
  '["project_id", "next_review_at"]'::jsonb,
  'high'
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_AQUI')
limit 1
returning id, org_id, name, doc_type, area, required_fields;
```

#### 8. Inserir regra PRO/SST mínima

```sql
insert into public.document_creation_rules (
  org_id,
  name,
  description,
  is_active,
  priority,
  condition,
  effects,
  severity
)
select
  p.org_id,
  'Regra PRO/SST obrigatória',
  'Exige descrição e arquivo para procedimentos de saúde e segurança.',
  true,
  10,
  '{"doc_type": "PRO", "area": "SST"}'::jsonb,
  '{"required_fields": ["description", "file"], "review_period_months": 12, "risk_level": "high", "recommendations": ["Procedimentos de SST devem conter evidência de validação técnica."]}'::jsonb,
  'critical'
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = lower('SEU_EMAIL_AQUI')
limit 1
returning id, org_id, name, condition, effects;
```

### Testes manuais P-10C.1

1. sem ciclo 14, abra o Novo Documento Inteligente e confirme o fallback P-10B;
2. com ciclo 14 e tabelas vazias, confirme o estado vazio explícito;
3. como admin, crie um template PRO/SST e confirme atualização imediata da lista;
4. crie uma regra PRO/SST e confirme atualização imediata da lista;
5. na criação, confirme template, regra, prazo de 12 meses e bloqueio por descrição/arquivo;
6. como elaborador, acesse `/authenticated/documentos/regras` e confirme acesso restrito;
7. desative template/regra e confirme que deixam de ser aplicados;
8. crie condition desconhecida por manutenção e confirme que não aplica nem quebra;
9. bloqueie o insert no log de uso em ambiente de teste e confirme que o documento é preservado com alerta não bloqueante.

### Limitações remanescentes

- o diagnóstico usa selects nas próprias tabelas e não consulta `information_schema`;
- o frontend não consegue diferenciar tabela vazia de linhas invisíveis por uma policy que retorna zero registros sem erro;
- a confirmação definitiva de RLS/org exige as queries administrativas;
- não há simulação de policy antes de salvar;
- não há histórico versionado das alterações de regra.

## P-10C.2 — Orientação e explicabilidade de políticas

### Objetivo

A P-10C.2 transforma o bloqueio técnico em orientação operacional. O usuário passa a entender:

- qual template foi selecionado;
- quais regras foram aplicadas;
- por que cada regra corresponde ao documento;
- quais campos são obrigatórios;
- quem exige cada campo;
- o que ainda falta;
- quais exigências podem ser aplicadas automaticamente;
- quando o documento está em conformidade.

Essa fase não cria migration. Ela opera sobre o ciclo 14 existente.

### Modelo de orientação

`src/lib/documentPolicyGuidance.ts` recebe formulário, template, regras, checklist, score, conflitos e validações. O retorno usa quatro estados:

- `fallback`: nenhuma política disponível ou aplicável;
- `needs_attention`: política aplicada com orientações não bloqueantes;
- `blocked`: há requisito ou validação impeditiva;
- `ready`: documento em conformidade com as políticas aplicadas.

Cada item obrigatório possui:

- campo e label;
- template/regra que o tornou obrigatório;
- estado atendido ou pendente;
- motivo documental;
- ação prática;
- severidade.

### Painel de conformidade

O painel do Novo Documento Inteligente apresenta:

1. política aplicada e score de governança;
2. nomes do template e regras;
3. explicações curtas de correspondência e prioridade;
4. checklist com motivo de cada requisito;
5. bloqueios explícitos;
6. próximas ações;
7. estado final de conformidade.

Fallbacks são tratados como modo operacional, não como erro:

- sem políticas: inteligência local P-10B;
- ciclo 14 ausente: modo heurístico;
- leitura bloqueada: heurísticas locais com aviso de permissão;
- políticas existentes, mas não aplicáveis: fallback para o contexto atual.

### Campos obrigatórios no formulário

Descrição, arquivo, tipo, área, projeto, revisão, confidencialidade e referência externa recebem indicação contextual quando exigidos por template/regra.

O campo mostra:

- badge **Obrigatório por política**;
- origem da exigência;
- motivo;
- ação necessária;
- microfeedback positivo quando atendido.

Requisitos básicos do TRAMITA continuam válidos, mas não são apresentados como política enterprise quando não vierem de template/regra.

### Aplicar exigências

Quando há política aplicável, o botão passa a se chamar **Aplicar exigências**.

Ele pode:

- aplicar tipo e área sugeridos;
- aplicar período obrigatório;
- recalcular próxima revisão;
- preencher descrição padrão quando vazia;
- aplicar metadados padrão.

Ele nunca:

- anexa arquivo;
- escolhe projeto;
- define confidencialidade sem configuração;
- inventa referências externas.

Após a ação, o feedback informa quais itens ainda exigem intervenção manual.

### Simulação administrativa

A tela **Regras Documentais** possui uma simulação sem persistência.

Entradas:

- título;
- tipo;
- área;
- projeto;
- descrição;
- arquivo sim/não;
- opção de incluir políticas inativas.

Saídas:

- template selecionado;
- regras aplicadas;
- risco;
- período;
- checklist;
- bloqueios;
- explicação de regras aplicadas ou não aplicadas.

Incluir políticas inativas permite avaliar o comportamento antes de ativá-las. A simulação não cria documento, template, regra ou log.

Os formulários de template e regra também exibem uma prévia imediata do impacto antes do save, incluindo contexto, campos que bloquearão a criação, risco e período.

### Exemplo PRO/SST

Para template/regra PRO/SST exigindo descrição, arquivo e revisão em 12 meses:

- título “Procedimento de Segurança Operacional” sugere PRO/SST;
- painel identifica template e regra;
- descrição e arquivo recebem destaque;
- período diferente de 12 meses gera bloqueio e orientação;
- **Aplicar exigências** corrige o prazo e descrição padrão disponível;
- arquivo continua como ação manual;
- após completar os requisitos, o painel mostra **Documento em conformidade**.

### Testes manuais P-10C.2

#### Cenário 1 — orientação PRO/SST

1. mantenha template/regra PRO/SST ativos;
2. abra o Novo Documento Inteligente;
3. digite “Procedimento de Segurança Operacional”;
4. confirme política aplicada;
5. confirme descrição e arquivo como obrigatórios;
6. confirme motivo de bloqueio junto aos campos e ao botão;
7. preencha descrição;
8. confirme que somente arquivo permanece pendente;
9. anexe arquivo;
10. confirme **Documento em conformidade**.

#### Cenário 2 — aplicar exigências

1. use período diferente de 12 meses;
2. clique **Aplicar exigências**;
3. confirme período de 12 meses e próxima revisão recalculada;
4. confira o feedback sobre itens manuais restantes.

#### Cenário 3 — sem políticas

1. desative templates e regras;
2. abra a criação inteligente;
3. confirme inteligência local P-10B sem estado de erro.

#### Cenário 4 — simulação administrativa

1. abra **Regras Documentais**;
2. use os valores PRO/SST pré-preenchidos;
3. alterne descrição e arquivo;
4. confirme checklist, bloqueios, risco e período;
5. ative **Incluir políticas inativas** para avaliar configurações desativadas.

#### Cenário 5 — criação antiga

1. abra `/authenticated/documents`;
2. use o diálogo antigo;
3. confirme validação P-10B.1;
4. confirme ausência de bloqueios P-10C.

### Limitações P-10C.2

- simulação usa metadados informados, sem ler conteúdo do arquivo;
- não há sandbox SQL ou simulação real de RLS;
- aplicação automática não preenche campos que exigem decisão humana;
- regras complexas continuam limitadas ao motor JSON simples da P-10C;
- o score é explicativo e não substitui aprovação documental.

## Integração P-11

Quando uma política ou template altera tipo, área ou projeto, a P-11 recalcula
o preview do código. O painel conecta a política aplicada ao padrão documental
previsto, sem transformar a ausência do ciclo 15 em bloqueio.

Sem P-11, templates e regras P-10C continuam funcionando e o código é gerado
pelo trigger legado.
