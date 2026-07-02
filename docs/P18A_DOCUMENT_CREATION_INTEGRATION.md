# P-18A — Integração sistêmica de criação, codificação e trâmites

## Objetivo

A P-18A conecta criação, contexto operacional, codificação e execução de
trâmites sem iniciar processos automaticamente. O documento continua nascendo
como `draft` e o usuário confirma o próximo passo no detalhe.

## Diagnóstico anterior

- A rota real de detalhe é
  `/authenticated/documents/$documentId`.
- A criação comum e o Novo Documento Inteligente já redirecionavam para essa
  rota.
- O modelo de trâmite era calculado e exibido durante a criação, mas não era
  registrado para ser priorizado no detalhe.
- O detalhe já continha o painel de execução P-12.1, porém ele não recebia a
  sugestão feita durante a criação.
- A criação comum já aceitava `project_id` no hook, mas o formulário não
  permitia selecioná-lo.
- O motor P-11 escolhia o melhor padrão automaticamente. As RPCs de preview e
  alocação não aceitavam `pattern_id`.
- `documents.code` era preenchido pelo trigger legado ou reconciliado pela
  P-11. Não existia operação segura e auditável para um código oficial legado.

## Fluxo integrado

### Contexto operacional

Os dois fluxos de criação usam `useProjectOptions`. Projetos selecionáveis
recalculam políticas, preview de código e sugestão de trâmite. A criação comum
também mostra cliente, contrato e local quando disponíveis.

### Codificação

A seção **Codificação do documento** oferece:

1. **Automática recomendada**: o banco escolhe o melhor padrão aplicável ou
   mantém o trigger legado.
2. **Escolher padrão**: mostra todos os padrões ativos, identifica os não
   aplicáveis e usa explicitamente o selecionado no preview e na alocação.
3. **Código legado/manual**: exige código e motivo, valida unicidade por
   organização e registra evento.

O preview não reserva sequência. O código final continua sendo confirmado
durante a criação. O ciclo 19 também adiciona `{YEAR2}` para ano em formato
`YY`; `{YEAR}` permanece em `YYYY`.

### Trâmite

A criação registra na auditoria o ID, a versão e o nome do modelo sugerido. O
detalhe lê esse registro e:

- destaca o modelo sugerido;
- oferece **Iniciar trâmite sugerido**;
- permite **Escolher outro trâmite**;
- permite ver todos os modelos publicados;
- lista execuções existentes.

Nenhum trâmite é iniciado automaticamente. Sem o ciclo 18, o detalhe informa
que o modelo foi apenas sugerido.

## Migration

Arquivo:

`supabase/migrations/20260630_p18a_document_creation_integration_controls.sql`

Nome recomendado no SQL Editor:

`19_TRAMITA_document_creation_integration_controls`

Aplicar somente depois dos ciclos 15, 16, 17 e 18.

A migration adiciona em `documents`:

- `manual_code`;
- `external_code`;
- `code_pattern_id`;
- `code_generation_mode`.

Ela adiciona as RPCs:

- `preview_document_code_for_pattern`;
- `allocate_document_code_for_pattern`;
- `allocate_document_code_automatic`;
- `assign_manual_document_code`.

Também atualiza o resolvedor P-11 para respeitar uma seleção explícita dentro
da transação e amplia o renderer para `{YEAR2}`. Não altera `approval_flows` e
não inicia trâmites.

## P-19.1 — Hardening antes da aplicação

A P-19.1 não cria outro ciclo SQL. O hardening foi incorporado diretamente em
`20260630_p18a_document_creation_integration_controls.sql` antes da primeira
aplicação:

- `assign_manual_document_code` não depende mais de `current_user_role`;
- autor, administrador e gestor continuam autorizados enquanto o documento
  estiver em `draft`, usando `is_org_role` para a verificação administrativa;
- a seleção explícita valida os mesmos escopos do resolvedor P-11;
- escopos `project`, `type`, `area` e `area_type` exigem seus respectivos
  campos de contexto;
- escopos desconhecidos ou malformados não podem ser escolhidos
  explicitamente.

## Integração P-20

A Central Documental usa projeto, código e sugestão de trâmite registrados
durante a criação para apresentar o próximo passo operacional. Documentos com
modelo aplicável sem execução aparecem como **Aguardando próximo passo**.

Sem o ciclo 19, a Central continua funcionando com o código legado e apenas
informa que os controles avançados de codificação ainda não estão instalados.

## Conferência

```sql
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'documents'
  and column_name in (
    'manual_code',
    'external_code',
    'code_pattern_id',
    'code_generation_mode'
  )
order by column_name;
```

```sql
select
  proname,
  pg_get_function_arguments(oid) as arguments,
  pg_get_function_result(oid) as result
from pg_proc
where pronamespace = 'public'::regnamespace
  and proname in (
    'preview_document_code_for_pattern',
    'allocate_document_code_for_pattern',
    'allocate_document_code_automatic',
    'assign_manual_document_code'
  )
order by proname;
```

```sql
select
  id,
  org_id,
  code,
  external_code,
  manual_code,
  code_pattern_id,
  code_generation_mode,
  project_id
from public.documents
order by created_at desc
limit 50;
```

```sql
select
  document_id,
  pattern_id,
  generated_code,
  mode,
  metadata,
  created_at
from public.document_code_events
order by created_at desc
limit 50;
```

## Testes manuais

1. Crie um documento pelo diálogo comum escolhendo um projeto; confira
   `documents.project_id` e o redirecionamento para o detalhe.
2. Crie um documento inteligente com projeto; confira contexto, políticas,
   código e trâmite recalculados.
3. Crie um documento inteligente com modelo sugerido; no detalhe, confirme
   **Iniciar trâmite sugerido**.
4. No detalhe, use **Escolher outro trâmite** e confirme que nada inicia antes
   da confirmação.
5. Escolha um padrão de código específico; confira preview, código final,
   `code_pattern_id` e evento.
6. Troque o padrão e confira a atualização do preview.
7. Crie um padrão com texto fixo, separador próprio, `{YEAR2}` e `{SEQ}`.
8. Use código manual com motivo; confira `external_code`, modo `manual` e
   evento.
9. Em ambiente sem ciclo 18, confirme o aviso no detalhe.
10. Em ambiente sem ciclo 15, confirme o fallback legado.
11. Confirme que a criação comum sem projeto continua funcionando.
12. Confirme que nenhuma criação iniciou execução automaticamente.

## Limitações

- o ciclo 19 precisa ser aplicado para escolha explícita e código manual;
- sem ciclo 19, ambos os fluxos permanecem em modo automático;
- `{CUSTOM}` representa um valor customizado seguro; tokens dinâmicos
  arbitrários de metadata ainda não fazem parte do renderer SQL;
- a sugestão é registrada em `audit_trail`, não como vínculo obrigatório;
- um modelo removido ou despublicado deixa de ser iniciável;
- o Storage permanece fora da transação PostgreSQL e continua exigindo
  compensação.

## Integração P-22

O ciclo 20 adiciona `create_document_transactional` para coordenar documento,
versão inicial, código e auditoria. O upload ocorre antes da RPC e é removido
pelo cliente quando a transação falha. Em ambientes sem ciclo 20, o fluxo
P-18A anterior permanece como fallback.

## Próximo passo recomendado

Validar a criação transacional com código automático, padrão escolhido e
código manual em um ambiente de teste antes da aplicação em produção.
