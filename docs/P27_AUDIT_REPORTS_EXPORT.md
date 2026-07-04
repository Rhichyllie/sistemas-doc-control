# P-27 — Relatórios e Exportação Formal de Auditoria

## Diagnóstico anterior à implementação

### 1. Tabelas de auditoria e eventos existentes

O repositório possui fontes com contratos diferentes:

- `audit_trail`: trilha documental enterprise canônica, isolada por
  `org_id`, com ação, usuário, transição de status, hash e metadata;
- `document_tramite_instance_events`: eventos append-only da execução P-12.1;
- `document_tramite_events`: eventos administrativos do modelador P-12;
- `notification_events`: eventos append-only de criação, leitura, dispensa,
  escalonamento, geração e supressão;
- `document_code_events`: histórico do motor de codificação;
- `audit_log`: auditoria legada sem contrato tenant homogêneo;
- `flow_audit_log`: auditoria legada de fluxos, também sem contrato
  organizacional uniforme.

A P-27 inclui `audit_trail`, eventos da execução e resumos protegidos de
notificações. Fontes legadas sem isolamento seguro aparecem na cobertura como
limitadas e não são agregadas silenciosamente.

### 2. Documento, versão e revisão

- `documents` é a entidade mestre;
- `document_versions` é a fonte canônica do ciclo formal P-10A;
- `document_revisions` é legado e continua coexistindo para compatibilidade;
- `approval_flows` mantém aprovações formais ligadas ao documento e, quando
  disponível, à versão;
- `working_version_id` e `published_version_id` apontam o estado formal no
  documento mestre.

`document_versions` e `document_revisions` não são tratados como equivalentes:
o manifesto declara a primeira como canônica e a segunda como fonte legada.

### 3. Fontes utilizáveis agora

O pacote pode usar, quando instaladas:

- documentos;
- versões formais e revisões legadas;
- aprovações;
- instâncias, etapas, eventos e evidências de trâmite;
- `audit_trail`;
- resumo de notificações sem corpo ou destinatário;
- SLA consolidado pela RPC P-26;
- projetos como filtro.

Ausência ou incompatibilidade de tabela vira capability `false`, cobertura
`unavailable` e limitação textual. A função não inventa zero.

### 4. Fontes limitadas

- `audit_log` e `flow_audit_log`: não agregadas por falta de contrato tenant
  homogêneo;
- notificações: somente contagens para reduzir exposição de destinatário e
  conteúdo;
- `document_revisions`: compatibilidade legada;
- histórico: não existem snapshots periódicos;
- arquivos: o relatório exporta referência e hash, não o binário do Storage.

### 5. Tela existente

`/authenticated/trilha-de-auditoria` já consulta `audit_trail` e possui
exportação simples em PDF. Essa tela continua sendo consulta operacional. A
P-27 cria uma rota separada para pacote formal, manifesto, cobertura,
limitações, hash e histórico append-only.

### 6. Bibliotecas disponíveis

O projeto já possui `jspdf`, `jspdf-autotable`, `xlsx`, `recharts`,
`html2canvas` e utilitários CSV. Nenhuma dependência foi adicionada. A P-27
usa:

- Web Crypto API para SHA-256;
- `Blob` para JSON/CSV;
- `window.print()` para PDF via navegador.

### 7. Necessidade de migration

A migration é necessária para:

- aplicar isolamento e autorização no servidor;
- consolidar fontes opcionais em uma leitura defensiva;
- registrar exportações em histórico append-only;
- impedir que o frontend rotule uma leitura parcial como pacote formal.

### 8. Fronteiras futuras

- **P-27.1:** exceções, reconciliação, verificação posterior de hash e
  tratamento formal de divergências;
- **P-28:** pesquisa inteligente sobre dados autorizados;
- **P-29:** OCR e leitura de arquivos;
- **P-30:** inteligência documental com IA;
- **P-35:** dossiês, ZIPs e pacotes documentais complexos.

## Objetivo

Gerar um pacote formal e explicável com manifesto, organização, gerador,
período, filtros, cobertura, registros, timeline, contagens, limitações e hash
técnico. A única escrita é o registro append-only da exportação.

## Fronteira com a P-26.2

P-26.2 é cockpit gerencial para reunião. P-27 é pacote formal:

| P-26.2                       | P-27                          |
| ---------------------------- | ----------------------------- |
| score e gráficos gerenciais  | manifesto e fontes declaradas |
| exportação do cockpit        | pacote completo de auditoria  |
| resumo para decisão          | timeline e registros formais  |
| sem histórico de exportações | histórico append-only         |
| não probatório               | integridade técnica declarada |

O hash P-27 não equivale a assinatura digital ou certificação.

## Rota

`/authenticated/auditoria/relatorios`

O menu **Relatórios de Auditoria** fica disponível para perfis com
`report:view`. Admin/manager podem usar escopo organizacional. Demais perfis
ficam limitados ao escopo pessoal pelo banco.

## Tipos de relatório

1. `operational` — auditoria operacional por período;
2. `document` — histórico do documento selecionado;
3. `sla` — SLA e prazos, dependente da P-26;
4. `evidence_workflow` — execução, etapas, decisões e evidências.

Tipos 3 e 4 continuam disponíveis com cobertura explícita. Se a fonte não
estiver instalada, o pacote informa a limitação.

## Migration

Arquivo:

`supabase/migrations/20260704_p27_audit_reports_export.sql`

Nome no SQL Editor:

`26_TRAMITA_audit_reports_export`

Aplicação exclusivamente manual depois do ciclo 25.

## `audit_report_exports`

Registra:

- organização e solicitante;
- tipo, formato e escopo;
- período, documento, projeto e filtros;
- manifesto;
- contagens;
- cobertura;
- limitações;
- SHA-256;
- nome do arquivo;
- data/hora.

Não há grant de `INSERT`, `UPDATE` ou `DELETE` para usuários autenticados.
Insert ocorre somente pela RPC. Trigger bloqueia `UPDATE` e `DELETE`, inclusive
tentativas administrativas comuns.

## RPC `get_audit_report_package`

Função `STABLE`, `SECURITY DEFINER`, com `search_path` fixo. Ela:

- exige `auth.uid()`;
- resolve perfil e organização;
- exige admin/manager para `scope = org`;
- limita período a 365 dias;
- valida documento e projeto;
- verifica contratos mínimos pelo catálogo PostgreSQL;
- consulta fontes somente quando compatíveis;
- limita volume retornado e declara truncamento;
- usa P-26 para resumo SLA/operacional quando disponível;
- não escreve nenhum dado.

O retorno contém:

- `manifest`;
- `organization`;
- `generated_by`;
- `report_type`;
- `report_period`;
- `filters`;
- `capabilities`;
- `source_coverage`;
- `operational_summary`;
- `document_summary`;
- `timeline`;
- `documents`;
- `versions`;
- `revisions`;
- `approval_flows`;
- `tramite_instances`;
- `tramite_steps`;
- `tramite_events`;
- `evidences`;
- `notifications_summary`;
- `sla_summary`;
- `audit_events`;
- `record_counts`;
- `limitations`.

Limites do pacote:

- 500 documentos;
- 1.000 versões;
- 1.000 revisões;
- 1.000 aprovações;
- 500 instâncias;
- 2.000 etapas;
- 3.000 eventos de trâmite;
- 1.000 evidências;
- 3.000 eventos de auditoria/timeline.

`record_counts` diferencia total e retornado.

## RPC `register_audit_report_export`

Valida usuário, organização, escopo, período, documento, projeto, JSONs, nome
do arquivo e hash hexadecimal SHA-256. Insere somente uma linha em
`audit_report_exports` e retorna o UUID.

Ela não altera nenhuma entidade operacional.

## RLS

- admin/manager leem exportações da organização;
- usuário comum lê apenas exportações próprias;
- insert direto autenticado é bloqueado;
- update/delete não possuem grants nem policies;
- trigger garante append-only;
- `service_role` mantém leitura/insert para operação técnica, mas o trigger
  também bloqueia reescrita do histórico.

## Preview formal

O preview mostra:

- manifesto;
- hash técnico;
- sumário;
- cobertura;
- SLA e notificações resumidas;
- timeline;
- documentos;
- versões/revisões/aprovações;
- etapas;
- evidências;
- limitações;
- assinatura técnica.

Não usa gráficos decorativos nem linguagem de certificação.

## Hash técnico de integridade

`canonicalizeAuditPackage` ordena chaves recursivamente e ignora campos
voláteis:

- `integrity_hash`;
- `technical_signature`;
- `exported_at`;
- `registered_export_id`.

`calculateAuditPackageHash` usa Web Crypto SHA-256. O JSON exportado recebe:

- algoritmo;
- versão da canonicalização;
- hash;
- aviso obrigatório.

> Este hash técnico ajuda a verificar integridade do pacote exportado. Ele não
> substitui assinatura digital ICP-Brasil.

## Exportações

### JSON oficial

`tramita-auditoria-YYYY-MM-DD.json`

Contém o pacote completo, assinatura técnica, hash e horário da exportação.

### CSV

- `tramita-auditoria-timeline-YYYY-MM-DD.csv`;
- `tramita-auditoria-evidencias-YYYY-MM-DD.csv`.

### PDF

`window.print()` usa A4 retrato e oculta menu, banner, builder, botões e
histórico. O PDF é produzido pelo navegador.

### Resumo

Copia tipo, período, escopo, organização, contagens, principais eventos,
limitações e hash.

Toda ação tenta registrar o histórico. Sem a RPC, a exportação local continua
e a tela informa que o registro não ocorreu.

## Histórico de exportações

Lista somente leitura com:

- tipo e formato;
- solicitante;
- data/hora;
- período;
- documento;
- hash;
- arquivo.

Sem a tabela, a página mostra fallback controlado.

## Limitações

- não inclui binários de evidência;
- não assina com ICP-Brasil;
- não cria snapshot histórico;
- fontes incompatíveis são omitidas;
- arquivos CSV cobrem timeline e evidências nesta fase;
- PDF depende do navegador;
- o hash comprova igualdade técnica do conteúdo canônico, não autoria legal;
- sem ciclo 26, a trilha atual permanece disponível, mas não é chamada de
  relatório formal.

## Queries de conferência

### Funções

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result,
  prosecdef,
  provolatile
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_audit_report_package',
    'register_audit_report_export'
  )
order by proname;
```

Esperado: `get_audit_report_package` com `provolatile = 's'`.

### Tabela

```sql
select to_regclass('public.audit_report_exports');
```

### RLS

```sql
select relname, relrowsecurity
from pg_class
where oid = 'public.audit_report_exports'::regclass;
```

### Colunas

```sql
select column_name, data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'audit_report_exports'
order by ordinal_position;
```

### Conferir ausência de mutação operacional

```sql
select pg_get_functiondef(oid)
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'get_audit_report_package',
    'register_audit_report_export'
  );
```

Revisar manualmente e confirmar ausência de:

- `update documents`;
- `update approval_flows`;
- `update document_tramite_instance_steps`;
- `update due_at`;
- `update next_review_at`;
- `update assignee_user_id`;
- `perform generate_operational_notifications`;
- `net.http`;
- `pg_net`.

O único `insert` permitido é em `audit_report_exports`, dentro de
`register_audit_report_export`.

## Testes manuais

1. Abra `/authenticated/auditoria/relatorios` como admin/manager.
2. Gere relatório operacional de 30 dias.
3. Gere relatório de documento.
4. Valide `source_coverage`.
5. Valide limitações.
6. Valide manifesto.
7. Valide timeline.
8. Valide evidências.
9. Valide workflow/etapas.
10. Exporte JSON.
11. Exporte timeline e evidências em CSV.
12. Imprima/salve PDF.
13. Copie o resumo.
14. Confirme SHA-256.
15. Confirme registro em `audit_report_exports`.
16. Confirme histórico.
17. Como usuário comum, confirme ausência de escopo organizacional.
18. Compare documentos antes/depois e confirme ausência de mutação.
19. Compare `approval_flows` antes/depois.
20. Confirme que notificações não foram geradas.
21. Sem ciclo 26, confirme fallback para a trilha atual.
22. Teste desktop, notebook e mobile.
23. Execute `bunx tsc --noEmit`.
24. Execute `bun run build`.

## Resultado técnico esperado

- typecheck sem erros;
- build concluído;
- warning conhecido do Node 20.17.0 permitido;
- nenhuma chamada Supabase executada durante desenvolvimento local.

## Próximo passo

P-27.1 deve tratar reconciliação, verificação posterior do hash, exceções e
prova de completude. Não ampliar esta fase para OCR, IA ou dossiês.
