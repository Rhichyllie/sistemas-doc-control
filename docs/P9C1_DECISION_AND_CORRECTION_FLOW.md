# P-9C.1 — Decision Schema + Correction Resubmission Flow

## Objetivo

Versionar o schema usado nas decisões de aprovação/rejeição e implementar um ciclo de **Correção Solicitada** no mesmo documento e na mesma revisão formal.

## Problema

Depois de uma rejeição, o workflow já devolvia o documento para `draft`, mas a aplicação interpretava esse estado como um rascunho comum:

- não diferenciava uma correção de um documento novo;
- não apresentava o motivo da rejeição como orientação operacional;
- não oferecia edição e anexação no mesmo documento;
- não possuía uma operação explícita de reenvio;
- não identificava formalmente a nova rodada do workflow.

Além disso, parte do schema de decisão havia sido ajustada manualmente no banco real e precisava ser versionada no repositório.

## Regra de produto

Uma rejeição anterior à publicação abre um ciclo de correção no mesmo documento:

1. a etapa rejeitada preserva comentário, decisor e data;
2. o documento volta tecnicamente para `draft`;
3. a UI apresenta **Correção Solicitada**;
4. autor ou gestor ajusta campos permitidos;
5. um arquivo pode ser anexado quando estava ausente;
6. o documento é reenviado sem criar outro documento;
7. uma nova rodada de `approval_flows` é criada;
8. a revisão formal do documento não é incrementada.

Documento `published` não entra neste fluxo. Alterações posteriores à publicação continuam reservadas ao mecanismo de nova revisão formal.

## Causa corrigida

O retorno para `draft` existia, mas não havia semântica persistida nem detecção de correção na UI. O botão de envio tratava qualquer `draft` da mesma forma e a tela não oferecia edição segura.

Também havia uma fragilidade histórica: etapas abertas eram removidas na submissão. A P-9C.1 não apaga mais etapas pendentes; tenta encerrá-las como `cancelled` e usa `skipped` como fallback compatível.

## Migration

Arquivo:

`supabase/migrations/20260629_p9c1_decision_and_correction_cycle.sql`

Nenhum SQL foi executado automaticamente no Supabase.

## Arquivos

### Criados

- `supabase/migrations/20260629_p9c1_decision_and_correction_cycle.sql`;
- `src/lib/documentCorrection.ts`;
- `src/hooks/useDocumentCorrection.ts`;
- `docs/P9C1_DECISION_AND_CORRECTION_FLOW.md`.

### Alterados

- `src/hooks/useApprovalFlow.ts`;
- `src/hooks/useApprovalQueue.ts`;
- `src/hooks/useDocument.ts`;
- `src/hooks/useDocuments.ts`;
- `src/hooks/useOperationalCockpit.ts`;
- `src/lib/workflowCompatibility.ts`;
- `src/routes/authenticated/documents.$documentId.tsx`;
- `src/routes/authenticated/documents.tsx`;
- `src/routes/authenticated/fluxo-de-aprovacao.tsx`;
- `docs/P9C_ROUTING_SLA_AND_ACTIVITY_FIXES.md`.

### Colunas garantidas em `approval_flows`

- `comment TEXT`;
- `decided_by UUID`;
- `decided_at TIMESTAMPTZ`;
- `completed_at TIMESTAMPTZ`;
- `metadata JSONB DEFAULT '{}'::JSONB`;
- `correction_round INTEGER DEFAULT 0`;
- `resubmitted_from_step_id UUID`.

### Foreign keys

- `approval_flows_decided_by_fkey`;
- `approval_flows_resubmitted_from_step_id_fkey`.

As duas são criadas com `ON DELETE SET NULL NOT VALID` para não bloquear a aplicação por dados históricos.
Se a FK legada de `decided_by` existir com outra ação de exclusão, ela é substituída defensivamente pela definição acima.

### Status aceitos

- `pending`;
- `approved`;
- `rejected`;
- `skipped`;
- `cancelled`;
- `waiting`.

A migration remove somente constraints `CHECK` que validam a coluna `status` e cria `approval_flows_status_check` como `NOT VALID`.

### Índices

- `idx_approval_flows_org_decided_by`;
- `idx_approval_flows_org_decided_at`;
- `idx_approval_flows_org_correction_round`;
- `idx_approval_flows_resubmitted_from_step`.

## Aplicação manual

No Supabase SQL Editor:

1. abra `supabase/migrations/20260629_p9c1_decision_and_correction_cycle.sql`;
2. copie o conteúdo completo;
3. execute o script completo uma vez;
4. aguarde o `NOTIFY pgrst, 'reload schema'`;
5. execute as queries de conferência abaixo.

O script é idempotente. A constraint de status é recriada de forma determinística em execuções posteriores.

## Como a correção é detectada

`src/lib/documentCorrection.ts` considera um documento em correção quando:

- o status técnico é `draft`;
- existe uma etapa `rejected`;
- essa etapa possui comentário;
- não existe etapa `pending` mais recente que a rejeição.

O motivo, a data e a rodada são derivados da etapa rejeitada mais recente.

## Rejeição

Ao rejeitar:

- a etapa recebe `status = rejected`;
- `comment`, `decided_by`, `decided_at` e `completed_at` são preenchidos quando disponíveis;
- o documento volta para `draft`;
- demais pendências são encerradas sem apagar histórico;
- `audit_trail.action = correction_requested`;
- metadata registra comentário, etapa, ID da etapa, status anterior e retorno ao autor;
- o autor recebe notificação `correction_requested`.

## Correção e reenvio

`resubmitAfterCorrection`:

- valida documento, organização, rejeição e permissão;
- mantém o mesmo `documents.id`;
- não altera `documents.revision`;
- preserva etapas aprovadas/rejeitadas anteriores;
- cria uma nova rodada de etapas;
- preenche `correction_round`;
- vincula `resubmitted_from_step_id`;
- mantém os mesmos fallbacks de papel, usuário e grupo;
- registra `resubmitted_after_correction`;
- notifica novamente o primeiro responsável.

Se os campos P-9C.1 ainda não existirem, rodada, vínculo e resposta são gravados em `metadata` quando esse campo estiver disponível.

Para evitar que uma pendência antiga interfira em uma nova rodada em ambientes com RLS legado, a seleção da próxima etapa e a fila priorizam o lote mais recente de `approval_flows`.

## Edição e arquivo

Podem corrigir:

- autor do documento;
- `admin`;
- `manager`.

Campos liberados:

- título;
- descrição;
- próxima data de revisão documental.

Área e tipo documental não são alterados porque participam da semântica do código já gerado.

Quando o documento não possui arquivo, a UI reutiliza o bucket `documents` e cria a entrada da revisão formal atual em `document_versions`. Isso resolve o cenário de arquivo ausente sem incrementar a revisão.

A substituição de arquivo já existente não foi implementada: a tabela atual impõe unicidade por `(document_id, revision)` e as versões são tratadas como imutáveis. Uma substituição segura exige a arquitetura de revisão formal futura.

## Lista, Home e atividades

- a lista de documentos mostra badge âmbar **Correção Solicitada**;
- o detalhe apresenta motivo, decisor e data;
- `useOperationalCockpit` reconhece notificações `correction_requested`;
- a detecção por `approval_flows` funciona como fallback quando a notificação não está disponível;
- após o reenvio, o documento volta para a Fila, Minhas Atividades e Home do responsável.

## Fallbacks

- sem `completed_at`, a decisão tenta persistir os demais campos;
- sem os campos de decisão, o status ainda pode ser atualizado, mas o motivo não pode ser reconstruído pela UI;
- sem `correction_round` e `resubmitted_from_step_id`, os dados usam `metadata`;
- sem `metadata`, o reenvio ainda cria etapas pelo contrato base, mas a numeração de rodadas fica limitada;
- sem FK do decisor, o detalhe abre sem o nome relacionado;
- grupos continuam dependendo da migration P-9A.

Para a experiência completa de correção, a migration P-9C.1 deve ser aplicada.

## Queries de conferência

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
AND table_name = 'approval_flows'
AND column_name IN (
'comment',
'decided_by',
'decided_at',
'completed_at',
'metadata',
'correction_round',
'resubmitted_from_step_id',
'status'
)
ORDER BY column_name;
```

```sql
SELECT
conname,
pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.approval_flows'::REGCLASS
AND conname IN (
'approval_flows_decided_by_fkey',
'approval_flows_resubmitted_from_step_id_fkey',
'approval_flows_status_check'
)
ORDER BY conname;
```

Conferir uma rodada:

```sql
SELECT
  id,
  document_id,
  step,
  step_label,
  status,
  comment,
  decided_by,
  decided_at,
  completed_at,
  correction_round,
  resubmitted_from_step_id,
  metadata,
  created_at
FROM public.approval_flows
WHERE document_id = '<DOCUMENT_ID>'
ORDER BY correction_round, created_at, step;
```

## Testes manuais

### Cenário 1 — falta de arquivo

1. Criar documento sem arquivo.
2. Enviar para revisão.
3. Rejeitar com “não tem documento anexado”.
4. Confirmar badge e banner **Correção Solicitada**.
5. Entrar como autor.
6. Abrir **Corrigir e Reenviar**.
7. Anexar o arquivo e responder ao revisor.
8. Reenviar.
9. Confirmar o mesmo `documents.id` e a mesma revisão formal.
10. Confirmar nova rodada na fila e histórico anterior preservado.

### Cenário 2 — metadado

1. Rejeitar um documento por título ou descrição incorreta.
2. Alterar o metadado permitido.
3. Usar **Salvar correções** e conferir permanência em correção.
4. Usar **Corrigir e Reenviar**.
5. Confirmar ausência de nova revisão formal.

### Cenário 3 — publicado

1. Abrir um documento `published`.
2. Confirmar que **Corrigir e Reenviar** não aparece.
3. Manter o comportamento atual de revisão formal.

### Cenário 4 — permissões

1. Confirmar edição pelo autor.
2. Confirmar edição por `admin`/`manager`.
3. Confirmar ausência dos controles para revisor/aprovador sem essas permissões.

## Limitações e próximos passos

- substituição segura de arquivo existente depende da revisão formal futura;
- não há comentários encadeados ou issues;
- não há workflow paralelo, majority approval ou escalonamento;
- P-9D permanece responsável por encaminhamento, devolução administrativa e auditoria operacional avançada;
- P-10 permanece responsável pela criação documental inteligente;
- P-12 permanece responsável por governança avançada, calendário útil e revisão formal completa.
