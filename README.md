# TRAMITA

Plataforma SaaS enterprise de governança documental operacional. O TRAMITA conecta documentos, versões, revisões, aprovações, trâmites, evidências, calendário/SLA, notificações, indicadores e auditoria formal.

## Stack

- React 19, TypeScript e Vite
- TanStack Router e TanStack Query
- Tailwind CSS e componentes Radix UI
- Supabase para autenticação, banco, RLS, Storage e RPCs
- Bun para scripts e build
- Electron para empacotamento desktop

## Desenvolvimento

```bash
bun install
bun run dev
```

Scripts principais:

- `bun run typecheck`: valida os tipos sem gerar arquivos.
- `bun run build`: gera o build de produção.
- `bun run repo:doctor`: apresenta o diagnóstico estrutural do repositório.
- `bun run validate:structure`: confere os guardrails arquiteturais obrigatórios.
- `bun run verify`: executa typecheck, validação estrutural e build.

## Arquitetura

A documentação estrutural começa em:

- [Arquitetura do repositório](docs/architecture/REPOSITORY_ARCHITECTURE.md)
- [Fronteiras dos módulos](docs/architecture/MODULE_BOUNDARIES.md)
- [Plano de organização gradual](docs/architecture/STRUCTURAL_CLEANUP_PLAN.md)
- [Roadmap de fases](docs/architecture/PHASE_ROADMAP.md)
- [Convenções de rotas](docs/architecture/ROUTING_CONVENTIONS.md)

## Guardrails

- As migrations do Supabase são revisadas e aplicadas manualmente pelo SQL Editor. Scripts locais não devem executar SQL remoto implicitamente.
- `src/routeTree.gen.ts` é gerado pelo plugin do TanStack Router e não deve ser editado manualmente.
- A organização estrutural é gradual: módulos estáveis não são movidos em massa.
- Antes de entregar uma alteração, execute `bun run verify`.
