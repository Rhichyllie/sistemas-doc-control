# P-29 — OCR e Leitura Documental Base

## Diagnóstico inicial

Arquivos documentais no TRAMITA hoje não ficam em uma tabela única de arquivos. Eles aparecem ligados a fontes diferentes:

- `documents`: documento canônico, com `file_path`, `file_name`, `file_size`, `file_hash`, `author_id`, `org_id`, código, tipo, área e contexto.
- `document_versions`: versão formal, com `document_id`, `org_id`, `revision`, arquivo, hash e dados de revisão/publicação.
- `document_revisions`: revisão legada que ainda convive com a versão formal.
- `document_tramite_instance_evidence`: evidências de trâmite, incluindo arquivo, nota, link e referência externa.

A P-29 cria uma camada própria de leitura técnica para não alterar essas entidades. O detalhe do documento é grande e sensível; por isso esta fase entrega uma rota dedicada em `/authenticated/documentos/leitura` e não modifica o fluxo documental existente.

## Objetivo

Registrar, acompanhar e consultar leitura/OCR documental de forma auditável:

- solicitação de leitura por documento/arquivo;
- status do job;
- resultado por página;
- método de leitura;
- confiança quando disponível;
- warnings, erros e limitações;
- texto bruto e normalizado leve;
- hash técnico do texto por página quando armazenado.

## Fronteira da fase

A P-29 é leitura técnica. Ela não faz interpretação.

Não implementa:

- busca semântica;
- embeddings;
- IA generativa;
- extração inteligente de campos;
- classificação documental;
- resumo;
- preenchimento de formulários;
- validação jurídica;
- OCR externo real;
- alteração de documento, versão, revisão, trâmite, aprovação, evidência, notificação, prazo, responsável ou status.

## Contrato anti-alucinação

Regras do módulo:

1. Texto extraído sempre tem método e origem.
2. Cada página tem status próprio.
3. Resultado parcial é permitido e marcado como parcial.
4. Página não lida não vira texto vazio silencioso.
5. Ausência de texto não significa documento vazio.
6. OCR falho não significa documento inválido.
7. Texto manual é marcado como `manual_text`.
8. OCR externo é apenas placeholder nesta fase.
9. Texto bruto não é corrigido, resumido nem interpretado.
10. Campos desconhecidos ficam nulos, indisponíveis ou não detectados.

## Migration

Arquivo:

`supabase/migrations/20260709_p29_document_ocr_base.sql`

Nome no Supabase SQL Editor:

`29_TRAMITA_document_ocr_base`

A migration é aditiva e cria somente objetos próprios da P-29.

## Tabelas

### `document_ocr_jobs`

Registra a solicitação e o manifesto da leitura:

- organização;
- documento;
- versão/evidência/fonte, quando informadas;
- storage path e metadados de arquivo;
- solicitante;
- status;
- método;
- contagens;
- confiança média;
- warnings;
- limitações;
- erro técnico;
- metadados.

### `document_ocr_pages`

Registra resultado por página:

- página;
- status;
- método;
- texto bruto;
- texto normalizado leve;
- hash técnico do texto;
- confiança;
- warnings;
- erros;
- metadados.

## Status do job

- `queued`
- `processing`
- `completed`
- `completed_with_warnings`
- `partial`
- `failed`
- `canceled`
- `unsupported`
- `unavailable`

## Status da página

- `pending`
- `extracted`
- `empty_text_layer`
- `ocr_extracted`
- `unreadable`
- `failed`
- `skipped`
- `unsupported`

## Métodos

- `text_layer`
- `browser_extraction`
- `manual_text`
- `external_ocr_placeholder`
- `unavailable`

Nenhum método chama API externa nesta fase.

## RPCs

### `create_document_ocr_job`

Cria o job de leitura. Não processa OCR, não altera documento e não cria texto.

### `get_document_ocr_overview`

Retorna lista e contagens de jobs visíveis ao usuário.

### `get_document_ocr_job`

Retorna job, documento, páginas, warnings, limitações e metadados.

### `store_document_ocr_result`

Armazena resultado em tabelas OCR. Nesta fase, é restrita a admin/manager. Pode substituir páginas do próprio job, mas não altera entidades operacionais.

### `get_document_ocr_text`

Retorna texto agregado por página, preservando separadores e status.

## RLS, permissões e grants

- RLS habilitado em `document_ocr_jobs` e `document_ocr_pages`.
- Admin/manager veem OCR da organização.
- Usuário comum pode ver OCR de documentos de seu escopo quando a política permitir.
- `authenticated` não recebe `INSERT`, `UPDATE` ou `DELETE` direto nas tabelas.
- Escritas ocorrem via RPC `SECURITY DEFINER`.
- `service_role` mantém acesso total.

## Escritas permitidas

Somente:

- criar job OCR;
- atualizar job OCR com resultado;
- inserir/substituir páginas OCR daquele job.

## Escritas proibidas

A migration não deve conter mutação em:

- `documents`;
- `document_versions`;
- `document_revisions`;
- `approval_flows`;
- `document_tramite_instances`;
- `document_tramite_instance_steps`;
- `document_tramite_instance_evidence`;
- `internal_notifications`;
- `audit_trail`.

## Frontend

Rota:

`/authenticated/documentos/leitura`

Menu:

`Leitura Documental`

A tela mostra:

- estado do módulo;
- cards de jobs, concluídos, parciais, falhos, aguardando e confiança média;
- filtros por documento e status;
- lista de jobs;
- manifesto do job;
- warnings/limitações;
- texto por página;
- copiar texto;
- baixar `.txt`;
- registro de texto manual como `manual_text`.

## Fallbacks

- Sem ciclo 29: tela informa que a migration precisa ser aplicada.
- OCR externo indisponível: job pode ficar `unavailable`.
- Arquivo ilegível: página deve ser `unreadable`, `failed` ou `unsupported`.
- Texto ausente: não é tratado como documento vazio.
- RLS/permissão: mensagem específica de acesso.

## Como aplicar

Aplicar manualmente no Supabase SQL Editor com o nome:

`29_TRAMITA_document_ocr_base`

Não aplicar por CLI neste repositório.

## Queries de pós-check

### 1. Tabelas

```sql
select to_regclass('public.document_ocr_jobs'),
       to_regclass('public.document_ocr_pages');
```

### 2. RLS

```sql
select relname, relrowsecurity
from pg_class
where oid in (
  'public.document_ocr_jobs'::regclass,
  'public.document_ocr_pages'::regclass
);
```

### 3. Funções

```sql
select proname, prosecdef, provolatile, proconfig
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname like '%document_ocr%';
```

### 4. Grants

```sql
select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('document_ocr_jobs', 'document_ocr_pages');
```

### 5. Conferir ausência de mutação operacional

Revisar a migration e confirmar ausência de mutações em tabelas operacionais:

```sql
select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'create_document_ocr_job',
    'get_document_ocr_overview',
    'get_document_ocr_job',
    'store_document_ocr_result',
    'get_document_ocr_text'
  );
```

Procurar ausência de:

- `update public.documents`;
- `update public.document_versions`;
- `update public.document_revisions`;
- `update public.approval_flows`;
- `update public.document_tramite_instance_steps`;
- `update public.internal_notifications`;
- `insert into public.documents`;
- `delete from public.documents`;
- `net.http`;
- `pg_net`;
- chamadas a IA ou OCR externo.

### 6. Criar job de teste

Substitua o UUID por um documento real da organização:

```sql
select public.create_document_ocr_job(
  p_document_id := '00000000-0000-0000-0000-000000000000',
  p_method := 'unavailable',
  p_language_hint := 'pt-BR'
);
```

### 7. Consultar overview

```sql
select public.get_document_ocr_overview(
  p_document_id := null,
  p_status := null,
  p_limit := 20
);
```

### 8. Armazenar resultado mínimo controlado

Usar somente em ambiente de teste:

```sql
select public.store_document_ocr_result(
  p_job_id := '00000000-0000-0000-0000-000000000000',
  p_status := 'completed_with_warnings',
  p_method := 'manual_text',
  p_page_count := 1,
  p_pages := '[{
    "page_number": 1,
    "status": "extracted",
    "method": "manual_text",
    "raw_text": "Texto observado manualmente.",
    "normalized_text": "Texto observado manualmente.",
    "warnings": ["Texto manual conferido pelo usuário."],
    "errors": [],
    "metadata": {"source": "manual_test"}
  }]'::jsonb,
  p_average_confidence := null,
  p_warnings := '["Texto manual não é OCR automático."]'::jsonb,
  p_limitations := '["Sem interpretação semântica."]'::jsonb,
  p_metadata := '{"test": true}'::jsonb
);
```

## Testes manuais

1. Admin acessa `/authenticated/documentos/leitura`.
2. Estado vazio aparece quando não há jobs.
3. Criar solicitação para documento existente.
4. Confirmar job `queued`, `unavailable` ou `manual_text`, conforme método.
5. Visualizar detalhe do job.
6. Registrar texto manual somente como `manual_text`.
7. Confirmar página sem texto como `unreadable`/`empty_text_layer`/`failed`, não sucesso silencioso.
8. Usuário comum não acessa visão administrativa.
9. RLS não vaza OCR entre organizações.
10. Documento original não muda.
11. Status documental não muda.
12. Relatórios P-27 continuam funcionando.
13. Exceções P-27.1 continuam funcionando.
14. `bun run validate:structure` passa.
15. `bunx tsc --noEmit` passa.
16. `bun run build` passa.

## Riscos e limitações

- Não há engine OCR real nesta fase.
- `manual_text` depende de usuário autorizado e deve ser conferido contra o original.
- O painel não foi embutido no detalhe grande do documento para evitar risco funcional.
- OCR de evidências e versões formais está previsto por contrato, mas deve ser testado após aplicação do ciclo.
- Busca textual, busca semântica e extração de campos ficam para fases futuras.

## Próximos passos

- P-29.1: intake controlado, leitura de lotes e integração segura de engine.
- P-28: pesquisa textual/semântica usando texto OCR como fonte, sem inventar conteúdo.
- P-30: inteligência documental com IA, somente depois de governança, origem e limites estarem maduros.
