# Arquitetura do Repositório TRAMITA

## Visão do produto

O TRAMITA é uma plataforma SaaS enterprise de governança documental operacional. O produto conecta a entidade documental ao seu contexto, codificação, ciclo de revisão, aprovação, trâmite, evidências, prazos, notificações, indicadores e auditoria formal.

A arquitetura deve sustentar rastreabilidade e evolução incremental. Organização de pastas não pode alterar regras de negócio, permissões, RLS ou contratos SQL já aplicados.

## Estrutura atual

| Área | Papel |
| --- | --- |
| `src/routes` | Entradas de navegação e composição das páginas pelo TanStack Router. |
| `src/components` | Componentes visuais gerais e componentes agrupados por domínio. |
| `src/hooks` | Orquestração de estado, React Query, Supabase e fallbacks de schema. |
| `src/lib` | Tipos, regras puras, normalização, serialização e utilitários. |
| `src/contexts` | Estado transversal de autenticação, tema e compatibilidade local. |
| `docs` | Contratos de produto, ciclos SQL, testes e decisões arquiteturais. |
| `supabase/migrations` | Histórico aditivo e revisável do schema e das RPCs. |
| `scripts` | Diagnóstico e validações locais sem mutação de produto. |

Hoje há domínios reconhecíveis, porém parte da lógica ainda convive em diretórios horizontais. Também coexistem rotas legadas em inglês e rotas mais novas em português.

## Estrutura alvo gradual

Novos trabalhos podem convergir gradualmente para uma organização por domínio:

```text
src/
  app/
    navigation/
    shell/
  features/
    documents/
    tramites/
    notifications/
    indicators/
    audit/
  components/
    ui/
  integrations/
    supabase/
```

Essa estrutura é uma direção, não uma autorização para mover tudo. Cada migração estrutural precisa ser pequena, verificável e compatível com os imports, as rotas e os contratos existentes.

## Regras estruturais

1. Não mover módulos estáveis em massa.
2. Não misturar refactor estrutural com mudança funcional.
3. Preservar rotas antigas até existir plano de redirecionamento.
4. `src/routeTree.gen.ts` é gerado pelo plugin do TanStack Router e não deve ser editado manualmente.
5. Migrations aplicadas são histórico imutável. Hardening posterior usa migration aditiva.
6. A aplicação de SQL no Supabase é manual, revisada e feita pelo SQL Editor.
7. Módulos read-only, como Indicadores e Relatórios de Auditoria, devem permanecer sem mutações operacionais.
8. Hooks podem coordenar acesso a dados, mas regras determinísticas devem preferir funções puras em `src/lib`.
9. Routes devem compor páginas e guards; componentes de domínio não devem depender da estrutura física das rotas.
10. Documentação acompanha cada módulo e cada ciclo de schema.

## Responsabilidades por camada

### Routes

Definem URL, guards e composição da página. Não devem concentrar consultas extensas nem regras complexas.

### Components

Apresentam estado e capturam intenção do usuário. Componentes de domínio podem coordenar subcomponentes, mas não devem duplicar autorização do banco.

### Hooks

Encapsulam consultas, mutações explícitas, cache e fallbacks por ausência de ciclo. Devem distinguir schema ausente, RLS, vazio e erro real.

### Lib

Contém contratos, transformações e cálculos puros. Não deve depender de renderização React quando a regra puder ser reutilizada.

### Docs

Registram objetivo, fronteira, dependências, limitações, checks SQL e testes manuais. Esta pasta é parte do contrato de implantação.

### Migrations

São aditivas, idempotentes quando aplicável e aplicadas manualmente. RPCs sensíveis devem validar autenticação, organização, papel e manter `search_path` seguro.
