# P-10B — Criação Documental Inteligente

## Objetivo

Transformar a criação de documentos em uma experiência assistida, mantendo a persistência, o workflow e o schema existentes.

A inteligência desta fase é local e determinística. Não usa LLM, serviço externo, chave de API ou backend adicional.

## Como acessar

1. abra **Documentos**;
2. clique em **Novo Documento Inteligente**;
3. escolha o modo Rápido, Guiado ou Especialista.

Rota:

`/authenticated/documentos/novo-inteligente`

A criação antiga em **Novo Documento** foi preservada.

## Criação anterior

Antes da P-10B:

- o formulário ficava em um diálogo de `documents.tsx`;
- `useCreateDocument` fazia upload no bucket `documents`;
- o documento era inserido como `draft`, revisão `0`;
- o código era gerado pelo trigger `generate_document_code`;
- com arquivo, uma linha inicial era criada em `document_versions`;
- `audit_trail.action = created` registrava a criação.

A P-10B reutiliza esse fluxo e endurece sua verificação de erros.

## Modos

### Rápido

Campos principais:

- título;
- tipo documental;
- área;
- projeto, quando disponível;
- descrição curta;
- arquivo opcional.

O painel lateral sugere tipo, área, período e próxima revisão. O documento é criado como `draft`.

### Guiado

Wizard com cinco etapas:

1. identidade;
2. classificação;
3. governança;
4. arquivo;
5. revisão final.

Cada etapa valida somente o necessário para avançar. Não há persistência intermediária no banco.

### Especialista

Exibe:

- identidade e classificação completas;
- período e data da próxima revisão;
- revisão inicial controlada;
- projeto;
- confidencialidade;
- referência externa;
- sistema de origem;
- tags;
- observações de governança.

Campos avançados aparecem somente quando uma leitura defensiva confirma que a coluna existe em `documents`.

Nesta fase, todo documento novo continua nascendo como `draft`, revisão `0`. Importação direta como publicado não foi habilitada.

## Heurísticas

O módulo `src/lib/documentIntelligence.ts` contém funções puras.

### Tipo documental

| Sinais                                | Sugestão |
| ------------------------------------- | -------- |
| procedimento, processo, norma         | `PRO`    |
| instrução, passo a passo, operacional | `IT`     |
| especificação, requisito técnico      | `ET`     |
| desenho, planta, layout               | `DRW`    |
| não conformidade, RNC, desvio         | `RNC`    |
| plano, programa                       | `PLN`    |
| registro, evidência, checklist        | `REG`    |
| manual, guia de uso                   | `MAN`    |

### Área

Título, descrição e nome do projeto são comparados com sinais de:

- `SGI`;
- `ENG`;
- `OPS`;
- `MNT`;
- `SST`;
- `MA`.

Sem correspondência, a área já selecionada é preservada; o fallback final é `SGI`.

### Revisão

Períodos locais:

| Tipo | Meses |
| ---- | ----: |
| RNC  |     6 |
| IT   |    12 |
| PLN  |    12 |
| PRO  |    24 |
| ET   |    24 |
| DRW  |    36 |
| REG  |    60 |
| MAN  |    36 |

Se `document_types.default_review_months` estiver disponível, o valor configurado tem prioridade.

A próxima revisão é calculada em data de calendário, preservando o dia quando possível. Calendário útil e feriados continuam fora desta fase.

### Completude

O score de 0 a 100 considera:

- título;
- tipo;
- área;
- descrição;
- projeto;
- arquivo;
- próxima revisão;
- autor;
- metadados críticos.

Projeto e arquivo continuam opcionais para criação. Sua ausência reduz o score e gera orientação, mas não bloqueia o rascunho.

### Risco

O risco aumenta com:

- confidencialidade restrita ou confidencial;
- ausência de próxima revisão;
- `RNC`, `PRO` ou `IT` com descrição pobre;
- ausência de arquivo;
- revisão inicial incomum.

Resultados:

- `low`;
- `medium`;
- `high`.

## Configurações e fallbacks

O hook `useDocumentCreationIntelligence` tenta carregar:

- `document_types`;
- `document_areas`;
- `projects`.

Se `document_types` ou `document_areas` não existirem, usa constantes locais reais do TRAMITA.

Se projetos não estiverem disponíveis ou sua leitura falhar, o campo é ocultado.

As capacidades avançadas são verificadas com selects vazios e seguros na própria tabela `documents`. O frontend não consulta `information_schema`.

## Upload e persistência

`useCreateDocument` foi endurecido:

1. calcula SHA-256 quando `crypto.subtle` está disponível;
2. envia o arquivo ao bucket privado `documents`;
3. insere o documento mestre como `draft`;
4. cria a versão inicial;
5. registra a auditoria `created`;
6. retorna o `document_id`;
7. redireciona para o detalhe.

Se o schema formal estiver disponível, a versão inicial recebe:

- `status = draft`;
- `change_reason = Criação inicial do documento`;
- metadata com o modo de criação.

Sem os campos formais, o insert usa o contrato legado de `document_versions`.

Em falha:

- upload anterior ao insert é removido;
- se o documento já existir, o hook tenta excluir o registro parcial e então remover o arquivo;
- se a exclusão for bloqueada por RLS, o arquivo é preservado para não quebrar a referência e a mensagem orienta revisar o registro parcial.

O processo cobre compensação cliente/banco, mas não é uma transação única entre Storage e PostgreSQL.

## Auditoria

`audit_trail.action = created` inclui:

- modo de criação;
- score de completude;
- risco;
- projeto;
- período e próxima revisão;
- presença de arquivo;
- hash do arquivo, quando calculado.

## Workflow

Após criar:

- o documento permanece `draft`;
- nenhuma etapa é criada automaticamente;
- o detalhe continua usando o builder existente;
- correção, revisão formal e publicação transacional não foram alteradas.

## Testes manuais

### Cenário 1 — criação rápida

1. abra o modo Rápido;
2. informe `Procedimento de Segurança Operacional`;
3. confirme sugestão `PRO`;
4. confirme área `SST` ou, conforme contexto adicional, `OPS`;
5. aplique as sugestões;
6. crie sem publicar;
7. confirme o detalhe do mesmo documento.

### Cenário 2 — IT com arquivo

1. selecione ou sugira `IT`;
2. anexe um arquivo;
3. crie o documento;
4. confirme `documents.file_*` e `file_hash`;
5. confirme versão inicial em `document_versions`.

### Cenário 3 — sem arquivo

1. crie um documento sem arquivo;
2. confirme o alerta de cadastro preliminar;
3. confirme que o rascunho é permitido;
4. confirme ausência de versão inicial de arquivo.

### Cenário 4 — guiado com score baixo

1. preencha apenas os campos obrigatórios;
2. avance até a revisão final;
3. confira score, itens faltantes e recomendações;
4. volte uma etapa, complemente os dados e confira a atualização do painel.

### Cenário 5 — especialista e schema variável

1. abra o modo Especialista;
2. confirme somente os campos suportados pelo ambiente;
3. preencha metadados avançados, quando disponíveis;
4. confirme que a tela permanece funcional quando as colunas opcionais não existem.

### Regressão

1. use o diálogo antigo **Novo Documento**;
2. crie com e sem arquivo;
3. confirme que o fluxo existente continua funcionando;
4. envie um documento criado para o workflow atual.

## Limitações

- não lê conteúdo do arquivo;
- não usa IA generativa;
- não cria DOCX ou PDF;
- não salva progresso intermediário do wizard;
- não publica nem envia automaticamente para aprovação;
- não oferece calendário útil;
- projetos ainda dependem do contrato/RLS existente;
- campos avançados são ocultados quando não há suporte no schema;
- Storage e banco não compartilham uma transação distribuída.

## Hardening P-10B.1

### Contrato único de validação

`documentCreationValidation.ts` centraliza as regras usadas pelo diálogo antigo e pelo Novo Documento Inteligente:

- título obrigatório com ao menos 3 caracteres;
- tipo documental reconhecido;
- área obrigatória;
- revisão inicial obrigatoriamente `0`;
- período de revisão inteiro entre 1 e 120 meses;
- data real no formato `YYYY-MM-DD`;
- identificador de projeto válido;
- projeto ainda disponível na lista carregada;
- arquivo permitido e dentro do limite.

O wrapper inteligente continua responsável por mapear capacidades e campos avançados, enquanto upload, insert, versão, auditoria e compensação permanecem centralizados em `useCreateDocument`.

### Arquivos

O limite conhecido do bucket é aplicado antes do upload:

- máximo de 50 MB;
- PDF;
- DOC/DOCX;
- DWG;
- XLS/XLSX;
- PNG;
- JPG/JPEG.

Arquivos vazios, extensões não permitidas, MIME incompatível ou tamanho excessivo são rejeitados com mensagem específica. O seletor de arquivo usa o mesmo contrato de formatos.

### Prevenção de concorrência

Um lock local impede dois envios simultâneos pelo mesmo hook. Botões de criação e troca de modo ficam desabilitados durante a operação.

Na tela inteligente, o botão também permanece desabilitado enquanto:

- configurações estão carregando;
- existe erro de validação;
- o projeto selecionado não está mais disponível.

A primeira pendência é mostrada junto à ação de criação.

### Compensação de falhas

| Falha                         | Comportamento                                                                              |
| ----------------------------- | ------------------------------------------------------------------------------------------ |
| Upload                        | Nenhum documento é criado                                                                  |
| Insert de `documents`         | O upload é removido                                                                        |
| Insert de `document_versions` | O documento parcial é removido quando permitido; o upload é removido depois                |
| Insert de `audit_trail`       | Documento e versão são compensados quando permitido                                        |
| Exclusão bloqueada por RLS    | O arquivo é preservado para não quebrar a referência e o `document_id` parcial é informado |
| Remoção do Storage falha      | O caminho possivelmente órfão é informado para limpeza manual                              |

Não existe exclusão silenciosa de arquivo ainda referenciado. Também não existe falha de limpeza silenciosa quando o Storage retorna erro.

### Auditoria

`audit_trail.action = created` foi preservado para os dois fluxos.

Metadata da criação inteligente:

- `creation_mode`;
- `source = intelligent_creation`;
- `completeness_score`;
- `risk_level`;
- `has_file`;
- `file_hash`;
- `review_period_months`;
- `next_review_at`;
- `project_id`.

A criação antiga usa `source = standard_creation` e mantém compatibilidade com relatórios existentes baseados em `action = created`.

### Versão inicial

Com arquivo, a versão inicial persiste:

- `document_id`;
- `org_id`;
- `revision = 0`;
- caminho, nome, tamanho e hash;
- `change_summary = Versão inicial`;
- `uploaded_by`.

No schema formal também persiste:

- `status = draft`;
- `change_reason = Criação inicial do documento`;
- metadata com modo e origem da criação.

Se os campos formais não existirem, o fallback legado permanece ativo.

### UX

- score recebeu maior destaque visual;
- risco agora possui explicação operacional;
- botão de sugestões confirma quando os valores foram aplicados;
- resumo final mostra status `Rascunho`, código automático, tamanho do arquivo e data formatada;
- arquivo inválido é rejeitado no momento da seleção;
- ações exibem loading e motivos para bloqueio.

### Casos heurísticos e de validação

O projeto ainda não possui runner de testes unitários configurado. Para evitar uma dependência pesada apenas nesta fase, os casos foram validados de forma table-driven:

| Entrada                                          | Resultado esperado     |
| ------------------------------------------------ | ---------------------- |
| Procedimento de Segurança Operacional            | `PRO`, `SST`, 24 meses |
| Instrução de trabalho para manutenção preventiva | `IT`, `MNT`, 12 meses  |
| Relatório RNC de desvio ambiental                | `RNC`, `MA`, 6 meses   |
| Planta e layout da engenharia                    | `DRW`, `ENG`, 36 meses |
| Base 31/01/2026 + 1 mês                          | 28/02/2026             |
| Data 29/02/2028                                  | válida                 |
| Data 29/02/2027                                  | inválida               |

### Testes manuais adicionais

1. tente criar com título vazio, tipo ausente e área ausente;
2. selecione arquivo acima de 50 MB;
3. selecione extensão não permitida;
4. informe período `0`, decimal ou acima de `120`;
5. simule projeto removido após carregar a tela;
6. clique rapidamente duas vezes em criar;
7. teste falha de insert após upload e confira a limpeza;
8. teste ambiente sem campos formais de `document_versions`;
9. confira `source`, `file_hash` e demais campos na auditoria;
10. confirme que o diálogo antigo usa as mesmas validações.

### Limitações restantes

- a compensação depende das policies de exclusão e do acesso ao Storage;
- se a exclusão for bloqueada, o registro parcial exige revisão manual;
- hash SHA-256 depende de `crypto.subtle`;
- não há transação distribuída entre Storage e PostgreSQL;
- não existe teste automatizado de falhas RLS sem um ambiente Supabase de teste;
- conteúdo e assinatura real do arquivo não são inspecionados.

## Próximos passos

- templates de criação por setor;
- presets por tipo documental;
- persistência de wizard incompleto;
- RPC transacional para criação mestre + versão + auditoria;
- importação formal controlada;
- explicabilidade detalhada das sugestões;
- integração opcional futura com IA, sem substituir as heurísticas locais.

## Integração P-10C

A P-10C adiciona templates e regras documentais configuráveis sobre a base da P-10B.

Quando o ciclo 14 está disponível:

- regras obrigatórias têm precedência sobre templates e heurísticas;
- templates podem sugerir descrição, prazo, metadados e perfil de risco;
- o painel mostra checklist e score de governança;
- campos obrigatórios ausentes bloqueiam a criação;
- auditoria e log registram template e regras aplicadas.

Sem a migration P-10C, o carregamento usa fallback defensivo e toda a experiência P-10B/P-10B.1 continua funcional.

A P-10C.1 diferencia schema ausente, tabelas vazias, bloqueio por RLS e políticas não aplicáveis. Esses estados não alteram as heurísticas locais: quando nenhuma regra aplicável é encontrada, a P-10B permanece como fallback.

A P-10C.2 apresenta esse fallback como modo heurístico e adiciona orientação de conformidade apenas à criação inteligente. O diálogo antigo continua usando somente o contrato de validação P-10B.1.

## Integração P-11

A P-11 adiciona preview e governança configurável de código ao Novo Documento
Inteligente. Tipo, área e projeto recalculam o padrão previsto, e a auditoria
registra preview, código final, padrão e modo de geração.

Sem a P-11, a criação permanece funcional: o banco usa o trigger legado e a
interface informa que o código será confirmado automaticamente. O diálogo
antigo não depende da P-11.
