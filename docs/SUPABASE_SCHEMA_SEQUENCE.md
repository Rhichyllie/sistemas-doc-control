# Sequência oficial do schema Supabase

## Execução

O schema do Supabase é aplicado manualmente pelo usuário no SQL Editor. O frontend e as migrations deste repositório não executam alterações automaticamente no ambiente remoto.

A sequência lógica oficial é:

1. `00_TRAMITA_repair_duplicates_and_constraints`
2. `01_TRAMITA_foundation_schema`
3. `02_TRAMITA_operational_config`
4. `03_TRAMITA_storage_and_rls`
5. `04_TRAMITA_triggers_and_repairs`
6. `05_TRAMITA_demo_seed_and_verification`
7. `06_TRAMITA_enterprise_hardening`
8. `07_TRAMITA_workflow_cascade_sla`
9. `08_TRAMITA_workflow_repair_and_groups_schema`
10. `09_TRAMITA_enterprise_schema_alignment_bridge`
11. `10_TRAMITA_decision_and_correction_cycle`
12. `11_TRAMITA_formal_revision_lifecycle`
13. `12_TRAMITA_formal_revision_transactional_hardening`
14. `13_TRAMITA_schema_doctor`
15. `14_TRAMITA_document_templates_and_rules`
16. `15_TRAMITA_intelligent_document_coding`

No repositório, os sete últimos ciclos correspondem a:

- `supabase/migrations/20260629_09_tramita_enterprise_schema_alignment_bridge.sql`;
- `supabase/migrations/20260629_p9c1_decision_and_correction_cycle.sql`;
- `supabase/migrations/20260629_p10a_formal_revision_lifecycle.sql`;
- `supabase/migrations/20260629_p10a2_formal_revision_transactional_hardening.sql`;
- `supabase/migrations/20260629_p10a3_schema_doctor.sql`.
- `supabase/migrations/20260629_p10c_document_templates_and_rules.sql`.
- `supabase/migrations/20260629_p11_intelligent_document_coding.sql`.

O ciclo 13 instala apenas a RPC de diagnóstico e a permissão controlada de execução. O Schema Doctor não aplica SQL corretivo, não cria os itens que diagnostica e não altera dados do ambiente.

O ciclo 14 é a primeira camada configurável de regras da criação documental. Ele cria templates, políticas e logs de uso com RLS. Sem esse ciclo, a P-10B continua usando as heurísticas locais e não interrompe a criação.

### Hardening P-10C.1

A P-10C.1 não adiciona um novo ciclo SQL. Ela endurece diagnóstico, leitura, confirmação de escrita, mensagens de RLS/org e resolução determinística de conflitos no frontend. O ciclo oficial continua sendo o 14.

As queries administrativas de conferência e manutenção estão em `docs/P10C_DOCUMENT_TEMPLATES_AND_RULES.md`.

### Orientação P-10C.2

A P-10C.2 também não adiciona ciclo SQL. Ela acrescenta orientação, explicabilidade, destaque de campos obrigatórios e simulação administrativa sobre as tabelas do ciclo 14.

## P-11 — Codificação Documental Inteligente

O ciclo 15 cria padrões, sequências e eventos de código, além das RPCs de
preview e alocação final. Ele preserva o trigger legado e endurece seu cálculo
contra concorrência. Sem o ciclo 15, a criação continua usando o formato
automático legado.

### Hardening P-11.1

A P-11.1 não cria novo ciclo. Como o ciclo 15 ainda não havia sido aplicado, o
hardening foi incorporado diretamente em
`20260629_p11_intelligent_document_coding.sql`. Ele adiciona detecção e salto
de colisões, aviso no preview, compatibilidade dinâmica com catálogos legados
de projetos e validação defensiva de tokens.

## P-10B — Criação Documental Inteligente

A P-10B não exige migration obrigatória. Ela usa o schema existente e aplica fallbacks locais quando tabelas de configuração ou campos opcionais não estão disponíveis.

Para a experiência completa, o ambiente deve estar alinhado com os ciclos base 01 a 13. A criação continua gerando documentos `draft` e não altera a sequência manual do Supabase.

## Por que o bridge 09 existe

Instalações anteriores chegaram ao workflow enterprise com contratos diferentes:

- `approval_group_members.profile_id`, `role_in_group` e `active` no schema legado;
- `approval_group_members.user_id`, `role` e `is_active` no código enterprise;
- campos de atribuição, SLA, decisão e revisão formal ausentes em partes de `approval_flows`;
- ponteiros de revisão ausentes em `documents`;
- ciclo formal incompleto em `document_versions`.

O bridge 09 adiciona os dois nomes de cada campo de membro, copia os valores existentes e instala um trigger para manter os aliases sincronizados. Também prepara os campos, FKs, índices e policies necessários antes dos ciclos 10 e 11.

O 09 deve ser aplicado depois do 08 e antes do 10/11. Em especial, se `user_id/profile_id`, `role/role_in_group` ou `is_active/active` divergirem, o 09 deve ser executado antes das migrations de decisão e revisão formal.

Migrations futuras devem continuar aceitando o schema legado durante a transição. Adicionar uma coluna com `IF NOT EXISTS` não basta quando a tabela já existe com outro nome de campo: consultas, backfills, FKs, índices e policies também precisam considerar os aliases.

## Checklist de conferência

As consultas abaixo são somente para conferência manual após a aplicação dos scripts.

### 1. Colunas esperadas

```sql
WITH expected_columns (table_name, column_name) AS (
  VALUES
    ('approval_group_members', 'profile_id'),
    ('approval_group_members', 'user_id'),
    ('approval_group_members', 'role_in_group'),
    ('approval_group_members', 'role'),
    ('approval_group_members', 'active'),
    ('approval_group_members', 'is_active'),
    ('approval_flows', 'due_at'),
    ('approval_flows', 'due_days'),
    ('approval_flows', 'started_at'),
    ('approval_flows', 'completed_at'),
    ('approval_flows', 'escalation_user_id'),
    ('approval_flows', 'escalation_notified_at'),
    ('approval_flows', 'metadata'),
    ('approval_flows', 'assignment_type'),
    ('approval_flows', 'assignee_user_id'),
    ('approval_flows', 'assignee_group_id'),
    ('approval_flows', 'instructions'),
    ('approval_flows', 'comment'),
    ('approval_flows', 'decided_by'),
    ('approval_flows', 'decided_at'),
    ('approval_flows', 'correction_round'),
    ('approval_flows', 'resubmitted_from_step_id'),
    ('approval_flows', 'document_version_id'),
    ('approval_flows', 'revision_number'),
    ('documents', 'published_version_id'),
    ('documents', 'working_version_id'),
    ('document_versions', 'status'),
    ('document_versions', 'change_reason'),
    ('document_versions', 'created_from_version_id'),
    ('document_versions', 'submitted_at'),
    ('document_versions', 'approved_at'),
    ('document_versions', 'published_at'),
    ('document_versions', 'superseded_at'),
    ('document_versions', 'metadata')
)
SELECT
  expected.table_name,
  expected.column_name,
  columns.data_type,
  CASE WHEN columns.column_name IS NULL THEN 'MISSING' ELSE 'OK' END AS result
FROM expected_columns AS expected
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
ORDER BY expected.table_name, expected.column_name;
```

### 2. Resumo por tabela

```sql
WITH expected_columns (table_name, column_name) AS (
  VALUES
    ('approval_group_members', 'profile_id'),
    ('approval_group_members', 'user_id'),
    ('approval_group_members', 'role_in_group'),
    ('approval_group_members', 'role'),
    ('approval_group_members', 'active'),
    ('approval_group_members', 'is_active'),
    ('approval_flows', 'assignment_type'),
    ('approval_flows', 'assignee_user_id'),
    ('approval_flows', 'assignee_group_id'),
    ('approval_flows', 'due_at'),
    ('approval_flows', 'metadata'),
    ('approval_flows', 'decided_by'),
    ('approval_flows', 'decided_at'),
    ('approval_flows', 'correction_round'),
    ('approval_flows', 'document_version_id'),
    ('approval_flows', 'revision_number'),
    ('documents', 'published_version_id'),
    ('documents', 'working_version_id'),
    ('document_versions', 'status'),
    ('document_versions', 'change_reason'),
    ('document_versions', 'created_from_version_id'),
    ('document_versions', 'metadata')
)
SELECT
  expected.table_name,
  COUNT(*) AS expected_columns,
  COUNT(columns.column_name) AS available_columns,
  ARRAY_AGG(expected.column_name ORDER BY expected.column_name)
    FILTER (WHERE columns.column_name IS NULL) AS missing_columns
FROM expected_columns AS expected
LEFT JOIN information_schema.columns AS columns
  ON columns.table_schema = 'public'
 AND columns.table_name = expected.table_name
 AND columns.column_name = expected.column_name
GROUP BY expected.table_name
ORDER BY expected.table_name;
```

### 3. Policies principais

```sql
SELECT
  schemaname,
  tablename,
  policyname,
  cmd,
  roles,
  qual,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'approval_groups',
    'approval_group_members',
    'approval_flows',
    'document_versions'
  )
ORDER BY tablename, policyname;
```

### 4. Grupos e aliases de membros

```sql
SELECT
  groups.id AS group_id,
  groups.name AS group_name,
  members.id AS member_id,
  members.profile_id,
  members.user_id,
  COALESCE(members.user_id, members.profile_id) AS effective_user_id,
  members.role_in_group,
  members.role,
  COALESCE(members.role, members.role_in_group, 'member') AS effective_role,
  members.active,
  members.is_active,
  COALESCE(members.is_active, members.active, true) AS effective_active
FROM public.approval_groups AS groups
LEFT JOIN public.approval_group_members AS members
  ON members.group_id = groups.id
 AND members.org_id = groups.org_id
ORDER BY groups.name, members.created_at;
```

Linhas em que os pares de aliases não coincidem indicam que o bridge 09 precisa ser reaplicado ou que houve escrita fora do trigger.

### 5. Revisão formal

```sql
SELECT
  documents.id AS document_id,
  documents.code,
  documents.status AS document_status,
  documents.revision AS published_revision,
  documents.published_version_id,
  documents.working_version_id,
  versions.id AS version_id,
  versions.revision AS version_revision,
  versions.status AS version_status,
  versions.created_from_version_id,
  versions.submitted_at,
  versions.approved_at,
  versions.published_at,
  versions.superseded_at
FROM public.documents AS documents
LEFT JOIN public.document_versions AS versions
  ON versions.document_id = documents.id
ORDER BY documents.code, versions.revision DESC, versions.created_at DESC;
```

Após o ciclo 11, um documento publicado deve apontar para sua versão vigente em `published_version_id`. Durante uma revisão formal, `working_version_id` pode apontar para a versão em preparação ou aprovação sem substituir a publicada.
