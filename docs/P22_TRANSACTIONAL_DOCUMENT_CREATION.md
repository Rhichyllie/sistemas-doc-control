# P-22 — Criação Documental Transacional

## Objetivo

A P-22 move para uma única transação PostgreSQL as operações de banco que
compõem a criação documental:

- criação do documento mestre;
- criação da versão inicial, quando existe arquivo;
- codificação automática, por padrão escolhido ou manual;
- auditoria de criação;
- registro dos metadados de política, projeto e sugestão de trâmite.

O upload permanece no frontend porque o Storage não participa da transação do
PostgreSQL.

## Diagnóstico do fluxo anterior

Os dois fluxos já convergiam em `useCreateDocument`:

- a criação comum chamava o hook diretamente;
- `useCreateIntelligentDocument` validava política e inteligência e delegava
  ao mesmo hook;
- o arquivo era enviado ao bucket `documents`;
- o frontend inseria `documents`;
- o frontend chamava as RPCs de código;
- o frontend inseria `document_versions`;
- o frontend inseria `audit_trail`;
- falhas posteriores exigiam exclusão compensatória do documento e arquivo.

Essa coordenação deixava uma janela para documento, versão, código e auditoria
divergirem.

## Migration

Arquivo:

`supabase/migrations/20260630_p22_transactional_document_creation.sql`

Nome no Supabase SQL Editor:

`20_TRAMITA_transactional_document_creation`

Aplicar manualmente depois do ciclo
`19_TRAMITA_document_creation_integration_controls`.

O TRAMITA não executa essa migration automaticamente.

## RPC principal

`public.create_document_transactional(...) returns jsonb`

Entradas principais:

- identidade: título, descrição, tipo e área;
- contexto: projeto, revisão e próxima revisão;
- campos opcionais: confidencialidade, referência, sistema de origem e tags;
- `p_file_metadata`: caminho, nome, tamanho e hash do arquivo já enviado;
- código: modo, padrão escolhido, código manual e justificativa;
- `p_creation_metadata`: política, score, projeto, preview e sugestão de
  trâmite.

Retorno:

```json
{
  "success": true,
  "document_id": "...",
  "code": "TR-ENG-IT-0001",
  "code_result": {},
  "version_id": "...",
  "warnings": [],
  "fallback_used": false,
  "next_action": "open_document_detail"
}
```

Quando há sugestão de trâmite, `next_action` retorna
`review_suggested_tramite`. Isso não inicia uma instância.

## Garantias transacionais

A RPC:

1. valida usuário, organização, permissão e campos obrigatórios;
2. valida que o projeto existe e não pertence a outra organização;
3. insere o documento como `draft`;
4. cria a versão inicial quando recebe metadados de arquivo;
5. aplica o modo de codificação solicitado;
6. confirma que o documento terminou com código;
7. insere `audit_trail` quando o contrato básico está disponível;
8. confirma tudo na mesma transação ou desfaz as operações de banco.

Código manual exige justificativa e usa
`assign_manual_document_code`, incluindo a validação de unicidade e
`document_code_events`.

Padrão escolhido usa `allocate_document_code_for_pattern`. O modo automático
usa `allocate_document_code_automatic` e preserva o gatilho legado como
fallback quando o wrapper não estiver disponível.

## Compatibilidade de schema

A função monta os inserts a partir das colunas realmente existentes:

- campos opcionais de `documents` são usados apenas quando disponíveis;
- `document_versions` aceita o contrato formal ou legado;
- campos formais de versão são incluídos quando existem;
- `audit_trail` é usado somente se tiver `document_id`, `org_id`, `user_id`,
  `action` e `metadata`;
- avisos e `fallback_used` informam recursos omitidos.

O contrato mínimo de `documents` continua obrigatório. Um ambiente sem a
fundação enterprise recebe erro claro em vez de um registro parcial.

## O que permanece fora da transação

O frontend continua responsável por:

1. validar tamanho e tipo do arquivo;
2. calcular o SHA-256;
3. enviar o arquivo ao Storage;
4. chamar a RPC com os metadados;
5. remover o upload se a RPC falhar com rollback confirmado;
6. orientar reconciliação manual quando o resultado remoto for incerto;
7. registrar `document_template_usage_logs` como log complementar não
   bloqueante;
8. redirecionar para o detalhe.

Não há tentativa de transação distribuída entre Storage e PostgreSQL.

## Fallback sem ciclo 20

Se a RPC não existir ou ainda não estiver no cache do PostgREST, o frontend
executa o fluxo P-10B/P-18A anterior:

- insert de `documents`;
- alocação de código;
- versão inicial;
- auditoria;
- compensação de documento e arquivo.

Somente erros de função ausente/cache ativam o fallback. Erros de permissão,
validação, RLS, código ocupado ou padrão incompatível são exibidos e não são
mascarados.

## Sugestão de trâmite

Os metadados aceitos incluem:

- `suggested_tramite_template_id`;
- `suggested_tramite_template_version_id`;
- `suggested_tramite_template_name`;
- motivo da sugestão.

Eles ficam na auditoria e, quando suportado, no metadata do documento. O início
continua explícito no detalhe e depende da P-12.1.

## Queries de conferência

### 20_CHECK_01_transactional_creation_function

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef as security_definer
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'create_document_transactional',
    'document_creation_column_exists',
    'document_creation_audit_supports_contract'
  )
order by proname;
```

### 20_CHECK_02_recent_documents_created_transactionally

```sql
select
  d.id,
  d.org_id,
  d.code,
  d.title,
  d.status,
  d.project_id,
  d.code_generation_mode,
  d.created_at,
  a.metadata->>'source' as creation_source,
  a.metadata->>'requested_code_mode' as requested_code_mode
from public.documents d
left join lateral (
  select metadata
  from public.audit_trail
  where document_id = d.id
    and action = 'created'
    and metadata @> '{"transactional_creation": true}'::jsonb
  order by created_at desc
  limit 1
) a on true
order by d.created_at desc
limit 50;
```

### 20_CHECK_03_recent_document_versions

```sql
select
  id,
  document_id,
  org_id,
  revision,
  file_path,
  file_name,
  file_size,
  file_hash,
  status,
  change_reason,
  metadata,
  uploaded_at
from public.document_versions
order by uploaded_at desc
limit 50;
```

### 20_CHECK_04_recent_code_events

```sql
select
  id,
  org_id,
  document_id,
  pattern_id,
  generated_code,
  mode,
  sequence_key,
  sequence_number,
  metadata,
  created_at
from public.document_code_events
order by created_at desc
limit 50;
```

### 20_CHECK_05_recent_audit_trail

```sql
select
  id,
  document_id,
  org_id,
  user_id,
  action,
  new_status,
  metadata,
  created_at
from public.audit_trail
where action = 'created'
order by created_at desc
limit 50;
```

## Testes manuais

1. Sem ciclo 20, crie um documento comum e confirme o fallback.
2. Sem ciclo 20, crie um documento inteligente.
3. Aplique o ciclo 20 apenas em ambiente de teste.
4. Crie documento comum sem arquivo.
5. Crie documento comum com arquivo.
6. Crie documento inteligente vinculado a projeto.
7. Crie com código automático.
8. Crie escolhendo um padrão específico.
9. Crie com código manual e justificativa.
10. Tente repetir o código manual e confirme erro de unicidade.
11. Crie com trâmite sugerido e confirme que nenhuma instância iniciou.
12. Force erro da RPC após upload e confirme a remoção compensatória.
13. Confirme `document_versions` quando há arquivo.
14. Confirme `audit_trail` com `transactional_creation = true`.
15. Confirme o redirecionamento para `/authenticated/documents/$documentId`.

## Limitações

- Storage e banco não formam uma transação distribuída;
- `document_template_usage_logs` permanece complementar no cliente;
- ambientes sem contrato mínimo de `documents` precisam aplicar os ciclos
  base;
- código manual e padrão escolhido dependem do ciclo 19;
- a RPC não inicia trâmites, aprovações, notificações ou e-mails.

## Próximos passos

- RPC de reconciliação administrativa de uploads com resultado incerto;
- telemetria de fallbacks e compensações;
- teste de integração automatizado contra banco local compatível com Supabase.
