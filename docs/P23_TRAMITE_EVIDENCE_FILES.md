# P-23 — Evidências e Arquivos na Execução de Trâmite

## Objetivo

A P-23 conecta o upload real de arquivos às evidências das etapas P-12.1.
Arquivo, nota, link e referência externa permanecem ações explícitas e
independentes da conclusão da etapa.

## Diagnóstico anterior

O ciclo 18 já criava:

- `document_tramite_instance_evidence`;
- campos `file_path`, `file_name`, `file_size` e `file_hash`;
- `metadata` para informações complementares;
- `uploaded_by` e `created_at`;
- RPC `add_document_tramite_evidence`;
- evento `evidence_added`;
- validação de ator, organização, instância e etapa ativa;
- bloqueio server-side da conclusão quando `required_file` não possui
  evidência do tipo `file`.

O painel carregava as evidências e permitia nota, link ou referência externa,
mas mostrava apenas a quantidade. O contrato de banco já era suficiente; o
upload e a apresentação do arquivo estavam ausentes no frontend.

## SQL

A P-23 não cria migration nem novo ciclo SQL. Ela reutiliza integralmente o
ciclo `18_TRAMITA_document_tramite_execution`.

Não existe migration `20260630_p23_tramite_evidence_files.sql` nesta fase.
MIME e bucket são gravados em `metadata`, enquanto `created_at` representa o
momento do registro.

## Storage

O upload reutiliza o bucket privado `documents`.

Formato do caminho:

```text
{orgId}/evidence/{documentId}/{instanceId}/{stepId}/{timestamp}-{id}-{safeFileName}
```

O `orgId` permanece no primeiro segmento para compatibilidade com a policy
organizacional já usada pelos documentos.

Formatos permitidos:

- PDF;
- DOC e DOCX;
- XLS e XLSX;
- PNG;
- JPG e JPEG;
- DWG.

O limite é 50 MB. Extensão, MIME disponível, nome e tamanho são validados antes
do upload. SHA-256 é calculado quando `crypto.subtle` está disponível.

## Fluxo de upload

1. O usuário abre uma etapa ativa e escolhe **Arquivo**.
2. O frontend valida o arquivo.
3. O arquivo é enviado ao Storage.
4. A RPC `add_document_tramite_evidence` registra caminho, nome, tamanho, hash,
   descrição e metadata.
5. A RPC grava `evidence_added`.
6. A lista da etapa é atualizada.
7. O usuário conclui a etapa separadamente.

O upload nunca chama `complete_document_tramite_step`.

## Compensação

Se o Storage falhar, nenhuma evidência é registrada.

Se o upload funcionar e a RPC falhar:

- o frontend tenta remover o objeto;
- se a remoção funcionar, informa que o upload parcial foi desfeito;
- se a remoção for bloqueada, informa o caminho exato para limpeza manual.

Nenhuma evidência falsa é inserida para representar um upload malsucedido.

## Segurança

- o bucket permanece privado;
- a abertura usa URL assinada temporária;
- o registro continua passando pela RPC SECURITY DEFINER da P-12.1;
- a RPC valida organização, instância ativa, etapa ativa e ator elegível;
- insert direto na tabela continua revogado;
- upload não altera documento, `approval_flows` ou status da execução.

## Etapas `required_file`

A conclusão permanece bloqueada no frontend e no banco enquanto não existir
evidência `file` para a etapa.

Depois do upload, a interface informa:

> Evidência registrada. Agora você pode concluir a etapa quando os demais
> requisitos estiverem atendidos.

Rejeições continuam seguindo a exceção já prevista pela P-12.1.

## Compatibilidade e fallback

- **Sem ciclo 18:** permanece o fallback atual do painel de execução.
- **Contrato de arquivo ausente:** o seletor de arquivo é ocultado e a tela
  informa que notas e links continuam disponíveis.
- **RLS ou Storage restrito:** o upload fica indisponível com mensagem
  específica.
- **Nota/link/referência:** continuam usando a RPC original e não dependem do
  upload.

## Testes manuais

1. Sem ciclo 18, confirme o fallback do painel.
2. Em etapa ativa, registre uma nota.
3. Em etapa ativa, registre um link.
4. Em etapa ativa, envie um arquivo válido.
5. Em `required_file`, tente concluir sem arquivo e confirme o bloqueio.
6. Anexe o arquivo e conclua manualmente depois.
7. Tente uma extensão não permitida.
8. Tente arquivo acima de 50 MB.
9. Force falha da RPC após upload e confira a compensação.
10. Tente anexar como usuário não responsável.
11. Teste admin/manager autorizado.
12. Confirme que a Central apenas abre o detalhe.
13. Confira o evento `evidence_added`.
14. Confirme que upload não inicia nem conclui outro trâmite.
15. Confirme que `approval_flows` não foi alterada.

## Limitações

- o Storage não participa da transação PostgreSQL;
- a limpeza depende da policy de DELETE do bucket;
- não há antivírus, OCR ou inspeção do conteúdo;
- não há versionamento ou substituição de evidência;
- não há remoção de evidência nesta fase;
- URLs assinadas exigem acesso online ao Supabase.

## Próximo passo

Validar as policies do bucket para que responsáveis elegíveis consigam remover
somente uploads próprios durante compensação, sem ampliar leitura entre
organizações.
