# P-10A — Ciclo Formal de Revisão Documental

## Objetivo

Implementar **Subir Revisão** para documentos publicados, mantendo o mesmo `documents.id`, o mesmo código e a revisão publicada anterior vigente até a aprovação da nova revisão.

## Correção versus revisão formal

### Correção Solicitada

- ocorre antes da publicação da revisão em trabalho;
- mantém o mesmo número de revisão;
- preserva a rejeição e cria nova rodada do workflow;
- não cria outra linha de revisão formal.

### Subir Revisão

- parte de um documento publicado;
- cria uma linha nova em `document_versions`;
- usa `documents.revision + 1`;
- não altera imediatamente `documents.revision` nem `documents.file_*`;
- passa por workflow próprio;
- somente após aprovação final substitui o ponteiro publicado.

Se a nova revisão for rejeitada, ela entra em Correção Solicitada e é reenviada com o mesmo `document_version_id` e o mesmo número.

## Auditoria do modelo anterior

### `documents`

Antes da P-10A:

- `revision` representava a revisão publicada atual;
- `file_path`, `file_name` e `file_size` eram o ponteiro usado no detalhe e download;
- `published_at` registrava a publicação do documento;
- não existiam ponteiros explícitos para versão publicada e versão em trabalho.

### `document_versions`

O modelo anterior possuía:

- `document_id`;
- `revision`;
- arquivo e hash;
- `change_summary`;
- autor/data de upload;
- `UNIQUE(document_id, revision)`.

Não possuía status, motivo, datas do ciclo formal ou vínculo com a versão de origem.

### `approval_flows`

O workflow era ligado somente a `document_id`. Isso não distinguia aprovação inicial de aprovação de uma revisão formal específica.

## Decisão de arquitetura

`documents` continua sendo o mestre e mantém os ponteiros da publicação atual.

`document_versions` passa a representar cada revisão formal.

Foram adicionados em `documents`:

- `published_version_id`: versão publicada vigente;
- `working_version_id`: revisão em preparação, aprovação ou correção.

Esses ponteiros permitem que o status técnico do documento participe da fila sem sobrescrever o arquivo publicado anterior.

## Migration

Arquivo:

`supabase/migrations/20260629_p10a_formal_revision_lifecycle.sql`

Nenhum SQL foi executado remotamente.

### Pré-requisito de alinhamento

A P-10A depende do ciclo lógico `09_TRAMITA_enterprise_schema_alignment_bridge`, versionado em `supabase/migrations/20260629_09_tramita_enterprise_schema_alignment_bridge.sql`.

O bridge deve ser aplicado antes da migration P-10A. Ele normaliza os aliases de `approval_group_members`, completa os campos enterprise de `approval_flows` e prepara os ponteiros de revisão. Se o ambiente tiver `profile_id` sem `user_id`, ou qualquer divergência entre `user_id/profile_id`, execute primeiro o 09.

A ordem manual completa está em `docs/SUPABASE_SCHEMA_SEQUENCE.md`.

### Campos em `document_versions`

- `status`;
- `change_reason`;
- `created_from_version_id`;
- `submitted_at`;
- `approved_at`;
- `published_at`;
- `superseded_at`;
- `metadata`;
- `created_at`.

Status aceitos:

- `draft`;
- `in_review`;
- `pending_approval`;
- `published`;
- `rejected`;
- `superseded`;
- `obsolete`.

### Campos em `approval_flows`

- `document_version_id`;
- `revision_number`.

### Campos em `documents`

- `published_version_id`;
- `working_version_id`.

### Foreign keys

- `document_versions_created_from_version_id_fkey`;
- `approval_flows_document_version_id_fkey`;
- `documents_published_version_id_fkey`;
- `documents_working_version_id_fkey`.

Todas são defensivas e `NOT VALID`.

### Backfill

Somente documentos `published` cuja versão é inferível por `(document_id, revision)` são atualizados:

- a versão corrente vira `published`;
- versões numericamente anteriores em `draft` viram `superseded`;
- `published_version_id` recebe a versão corrente.

Estados ambíguos não são inventados.

### RLS

A migration adiciona policies para:

- autor/gestor atualizar a revisão em trabalho;
- ator atribuído no workflow atualizar o status da revisão;
- ator da aprovação final atualizar o documento mestre;
- marcar a versão publicada anterior como superada.

## Hook

`src/hooks/useDocumentRevisions.ts` oferece:

- `versions`;
- `currentPublishedVersion`;
- `workingVersion`;
- `canStartRevision`;
- `startRevision`;
- `uploadRevisionFile`;
- `submitRevisionForApproval`;
- `refresh`.

Sem a migration P-10A, o hook mantém a tela aberta e desabilita a criação de revisão formal com mensagem de compatibilidade.

## Iniciar revisão

1. valida documento `published`;
2. valida autor, `admin` ou `manager`;
3. impede outra revisão ativa;
4. cria `revision = documents.revision + 1`;
5. vincula `created_from_version_id`;
6. reutiliza o arquivo publicado se nenhum novo arquivo for enviado;
7. preenche `working_version_id`;
8. mantém `documents.revision`, `documents.file_*` e a versão publicada sem alteração;
9. registra `formal_revision_started`.

Se um documento publicado legado não possuir linha em `document_versions`, o ponteiro publicado atual é incorporado como baseline antes da criação da revisão seguinte.

## Enviar para aprovação

Ao enviar:

- `approval_flows.document_id` mantém o documento mestre;
- `document_version_id` identifica a revisão em trabalho;
- `revision_number` registra o número;
- `document_versions.status` vira `in_review` ou `pending_approval`;
- `submitted_at` é preenchido;
- o documento técnico entra no status compatível com a Fila;
- a versão publicada e `documents.file_*` não são substituídos;
- registra `formal_revision_submitted`.

## Aprovar e publicar

Na última etapa:

1. a versão publicada anterior vira `superseded`;
2. `superseded_at` é preenchido;
3. a revisão aprovada vira `published`;
4. `approved_at` e `published_at` são preenchidos;
5. `documents.revision` recebe o novo número;
6. `documents.file_*` passa a apontar para o arquivo aprovado;
7. `published_version_id` recebe a nova versão;
8. `working_version_id` volta para `NULL`;
9. `documents.status` volta para `published`;
10. são registrados `formal_revision_superseded` e `formal_revision_published`.

## Rejeitar e corrigir

Ao rejeitar:

- a versão em trabalho vira `rejected`;
- o documento técnico volta para `draft`;
- o ponteiro e arquivo publicados permanecem inalterados;
- o banner **Correção Solicitada** identifica a revisão formal;
- o arquivo da versão em trabalho pode ser substituído;
- o reenvio usa o mesmo `document_version_id` e `revision_number`;
- não é criada outra revisão formal;
- registra `formal_revision_rejected`.

## Interface

No detalhe:

- documento publicado sem revisão ativa mostra **Subir Revisão**;
- revisão `draft` mostra **Enviar revisão para aprovação**;
- revisão em análise mantém indicação da versão publicada atual;
- o card **Revisões do Documento** mostra status, arquivo, motivo, resumo e data;
- a revisão rejeitada reutiliza o ciclo P-9C.1.

Na lista:

- não é criada linha duplicada;
- o documento permanece visível;
- publicação com working version mostra **Publicado** e indicador da revisão em andamento;
- Correção Solicitada continua com prioridade visual.

## Auditoria

Eventos:

- `formal_revision_started`;
- `formal_revision_submitted`;
- `formal_revision_file_updated`;
- `formal_revision_rejected`;
- `formal_revision_superseded`;
- `formal_revision_published`.

Metadata inclui documento, versão, revisão anterior/nova, ator, motivo e arquivo quando aplicável.

## Aplicação manual

No Supabase SQL Editor:

1. abra `supabase/migrations/20260629_p10a_formal_revision_lifecycle.sql`;
2. execute o conteúdo completo;
3. aguarde o reload do PostgREST;
4. execute as queries abaixo.

## Queries de conferência

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'document_versions'
AND column_name IN (
'status',
'change_reason',
'created_from_version_id',
'submitted_at',
'approved_at',
'published_at',
'superseded_at',
'metadata'
)
ORDER BY column_name;
```

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'approval_flows'
AND column_name IN (
'document_version_id',
'revision_number'
)
ORDER BY column_name;
```

```sql
SELECT
id,
document_id,
revision,
status,
file_name,
change_summary,
change_reason,
submitted_at,
approved_at,
published_at,
superseded_at,
created_at
FROM public.document_versions
WHERE document_id = '<DOCUMENT_ID>'
ORDER BY revision DESC, created_at DESC;
```

Conferir ponteiros:

```sql
SELECT
  id,
  code,
  status,
  revision,
  published_version_id,
  working_version_id,
  file_name,
  published_at
FROM public.documents
WHERE id = '<DOCUMENT_ID>';
```

## Testes manuais

### Publicar nova revisão

1. Abrir documento publicado.
2. Clicar **Subir Revisão**.
3. Informar motivo, resumo e arquivo.
4. Confirmar o mesmo `document_id`.
5. Confirmar que `documents.revision` ainda não mudou.
6. Enviar a revisão para aprovação.
7. Confirmar item na Fila e Minhas Atividades.
8. Aprovar todas as etapas.
9. Confirmar revisão nova `published`.
10. Confirmar revisão anterior `superseded`.
11. Confirmar atualização de `documents.revision` e `documents.file_*`.

### Rejeitar e corrigir

1. Criar e enviar revisão formal.
2. Rejeitar com comentário.
3. Confirmar Correção Solicitada.
4. Substituir o arquivo da revisão em trabalho.
5. Reenviar.
6. Confirmar que o ID e número da revisão em trabalho foram mantidos.

### Impedir duplicidade

1. Manter revisão em `draft`, `in_review`, `pending_approval` ou `rejected`.
2. Tentar iniciar outra revisão.
3. Confirmar “Já existe uma revisão em andamento.”

### Documento não publicado

1. Abrir documento novo, em análise ou correção.
2. Confirmar ausência de **Subir Revisão**.

## Limitações

- não há múltiplas revisões simultâneas;
- não há branch/merge documental;
- publicação envolve atualizações coordenadas no cliente, não uma RPC transacional única;
- arquivos substituídos enquanto a working version está em preparação permanecem no storage, mas deixam de ser referenciados;
- não há calendário útil, workflow paralelo ou majority approval;
- a experiência completa depende das migrations P-9A, P-9C.1 e P-10A.
