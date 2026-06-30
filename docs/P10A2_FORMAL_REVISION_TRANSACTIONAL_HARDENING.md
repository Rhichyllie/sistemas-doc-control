# P-10A.2 — Hardening Transacional da Revisão Formal

## Problema

A publicação de uma revisão formal era concluída por updates independentes no frontend:

- superar a versão publicada anterior;
- publicar a working version;
- copiar arquivo, hash e número da revisão para o documento mestre;
- trocar `published_version_id`;
- limpar `working_version_id`;
- registrar auditoria.

Uma falha entre essas operações podia deixar versões e documento mestre em estados diferentes. A P-10A.2 move essa unidade de publicação para uma função PL/pgSQL, executada pelo PostgreSQL em uma única transação.

Nenhum SQL desta fase é aplicado automaticamente ao Supabase.

## Migration

Arquivo:

`supabase/migrations/20260629_p10a2_formal_revision_transactional_hardening.sql`

Pré-requisitos lógicos:

1. `09_TRAMITA_enterprise_schema_alignment_bridge`;
2. `10_TRAMITA_decision_and_correction_cycle`;
3. `11_TRAMITA_formal_revision_lifecycle`.

## `publish_formal_revision`

Assinatura:

```sql
public.publish_formal_revision(
  p_document_id uuid,
  p_document_version_id uuid,
  p_actor_id uuid default auth.uid()
) returns jsonb
```

### Validações

- exige usuário autenticado e impede que o cliente informe outro ator;
- exige perfil ativo;
- valida `profiles.org_id`, `documents.org_id` e `current_user_org_id()`;
- bloqueia o documento mestre e a versão com `FOR UPDATE`;
- confirma o vínculo entre documento e versão;
- exige que `documents.working_version_id` aponte para a versão informada;
- aceita versão em `in_review`, `pending_approval` ou `rejected`;
- não permite publicação direta de versão `draft`;
- bloqueia publicação com etapas `pending` ou `waiting`;
- exige que a última etapa da rodada mais recente esteja `approved`;
- autoriza `admin`, `manager`, decisor da última etapa ou responsável elegível por usuário, papel ou grupo.

O parâmetro `p_actor_id` não funciona como impersonação: ele deve ser igual a `auth.uid()`.

### Operações atômicas

Dentro da mesma chamada:

1. localiza a versão publicada anterior pelo ponteiro ou pelo status;
2. marca a anterior como `superseded`;
3. marca a nova versão como `published`;
4. preenche `approved_at` e `published_at`;
5. copia `revision`, `file_path`, `file_name`, `file_size` e `file_hash`;
6. atualiza `published_version_id`;
7. limpa `working_version_id`;
8. restaura `documents.status = published`;
9. preserva o `next_review_at` informado na metadata da versão;
10. registra `formal_revision_superseded` e `formal_revision_published`.

A função aceita repetição após timeout quando a mesma versão já foi publicada corretamente. Nesse caso retorna `idempotent: true` e não duplica a auditoria.

### Retorno

Exemplo:

```json
{
  "success": true,
  "idempotent": false,
  "document_id": "uuid",
  "published_version_id": "uuid",
  "previous_version_id": "uuid",
  "revision": 2
}
```

## `reject_formal_revision`

Assinatura:

```sql
public.reject_formal_revision(
  p_document_id uuid,
  p_document_version_id uuid,
  p_step_id uuid,
  p_comment text,
  p_actor_id uuid default auth.uid()
) returns jsonb
```

A função:

- valida organização, ator, atribuição e comentário;
- bloqueia documento, versão e etapa;
- rejeita a etapa e grava os campos de decisão;
- cancela outras etapas abertas da mesma revisão;
- marca a working version como `rejected`;
- retorna o status técnico do documento para `draft`;
- não altera o arquivo nem o ponteiro da versão publicada;
- mantém `working_version_id`;
- registra `formal_revision_rejected`.

Ela foi versionada como base segura, mas não foi conectada ao frontend nesta fase. O fluxo de rejeição/correção existente continua em uso para evitar uma mudança simultânea no comportamento estabilizado da P-9C.1.

## Reenvio

`resubmit_formal_revision` não foi criado. O reenvio atual precisa recriar as etapas com a configuração visual de papel, usuário, grupo e SLA enviada pelo cliente. Mover essa operação para uma RPC exige um contrato próprio para os steps e fica para um hardening posterior.

## Fallback do frontend

`useApprovalFlow` chama `publish_formal_revision` como caminho principal na última etapa da revisão formal.

O fallback P-10A é usado somente quando o erro indica função ausente ou schema/cache incompatível, incluindo `PGRST202`, `42883`, coluna ausente ou função ainda não exposta pelo PostgREST.

Não há fallback para:

- permissão negada;
- organização diferente;
- etapa ainda pendente;
- versão ou working pointer incompatível;
- retorno inválido da RPC.

Esses erros são mostrados ao usuário, evitando mascarar uma violação de integridade.

## Aplicação manual

No Supabase SQL Editor:

1. confirme que os ciclos 09, 10 e 11 já foram aplicados;
2. abra `supabase/migrations/20260629_p10a2_formal_revision_transactional_hardening.sql`;
3. revise o arquivo completo;
4. execute todo o conteúdo, do `BEGIN;` ao `COMMIT;`;
5. aguarde o `NOTIFY pgrst, 'reload schema'`;
6. execute as queries de conferência abaixo.

## Queries de conferência

### Assinaturas

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'publish_formal_revision',
    'reject_formal_revision',
    'resubmit_formal_revision'
  )
order by proname;
```

Resultado esperado nesta fase: `publish_formal_revision` e `reject_formal_revision`. A ausência de `resubmit_formal_revision` é intencional.

### Tipo e segurança

```sql
select
  routine_name,
  routine_type,
  security_type
from information_schema.routines
where specific_schema = 'public'
  and routine_name in (
    'publish_formal_revision',
    'reject_formal_revision',
    'resubmit_formal_revision'
  )
order by routine_name;
```

As duas funções criadas devem aparecer como `FUNCTION` e `DEFINER`.

### Privilégios de execução

```sql
select
  routine_name,
  grantee,
  privilege_type
from information_schema.routine_privileges
where specific_schema = 'public'
  and routine_name in (
    'publish_formal_revision',
    'reject_formal_revision'
  )
order by routine_name, grantee;
```

O papel `authenticated` deve possuir `EXECUTE`; `PUBLIC` não deve aparecer.

### Estado após publicação

```sql
select
  documents.id,
  documents.status,
  documents.revision,
  documents.published_version_id,
  documents.working_version_id,
  versions.status as published_version_status,
  versions.approved_at,
  versions.published_at
from public.documents as documents
join public.document_versions as versions
  on versions.id = documents.published_version_id
where documents.id = '<DOCUMENT_ID>';
```

### Auditoria transacional

```sql
select
  action,
  old_status,
  new_status,
  user_id,
  metadata,
  created_at
from public.audit_trail
where document_id = '<DOCUMENT_ID>'
  and action in (
    'formal_revision_superseded',
    'formal_revision_published',
    'formal_revision_rejected'
  )
order by created_at desc;
```

## Testes manuais

### Cenário 1 — publicação transacional

1. abra um documento publicado;
2. suba uma revisão;
3. envie para aprovação;
4. aprove a última etapa;
5. confirme `formal_revision_published` com `transactional: true`;
6. confirme a versão anterior em `superseded`;
7. confirme `documents.revision` atualizado;
8. confirme `working_version_id IS NULL`;
9. confirme arquivo, hash e `published_version_id` da nova versão.

### Cenário 2 — ambiente sem RPC

1. use um ambiente onde a migration P-10A.2 ainda não foi aplicada;
2. aprove a última etapa de uma revisão formal;
3. confirme a mensagem de compatibilidade;
4. confirme que o fallback do cliente concluiu a publicação.

### Cenário 3 — isolamento por organização

1. tente chamar a RPC com documento de outra organização;
2. confirme erro de permissão;
3. confirme que nenhuma versão, documento ou auditoria foi alterado.

### Cenário 4 — etapa pendente

1. chame a RPC enquanto a revisão ainda possui etapa `pending`;
2. confirme erro de validação;
3. confirme que a versão publicada anterior continua vigente.

## Limitações e próximos passos

- a decisão da última etapa ocorre antes da chamada de publicação; a unidade versão anterior + nova versão + documento mestre + auditoria é transacional e pode ser repetida após timeout;
- a RPC de rejeição está preparada, mas ainda não é o caminho principal do frontend;
- notificações continuam fora da transação de banco;
- reenvio transacional exigirá um contrato de etapas;
- calendário útil, workflow paralelo, majority approval e ausências continuam fora desta fase.
