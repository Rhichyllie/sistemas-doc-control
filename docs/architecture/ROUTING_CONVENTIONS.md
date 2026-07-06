# Convenções de Rotas

O TRAMITA usa file-based routing do TanStack Router.

## Idioma e compatibilidade

1. Rotas novas devem preferir português.
2. Rotas antigas em inglês podem continuar por compatibilidade.
3. Não renomear `documents`, `projects`, `dashboard` ou outras rotas legadas sem plano de redirecionamento.
4. Uma migração de URL precisa considerar links internos, favoritos, documentos e integrações externas.

## Arquivo gerado

`src/routeTree.gen.ts` é produzido pelo plugin do TanStack Router.

- Não editar manualmente.
- Não formatar manualmente.
- Alterar o arquivo de rota correspondente e deixar a geração ocorrer pelo fluxo normal do projeto.
- Revisar mudanças geradas separadamente quando aparecerem no diff.

## Responsabilidade das rotas

- Rotas compõem página, parâmetros e guards.
- Regras de negócio reutilizáveis pertencem a hooks ou libs.
- Componentes de domínio não devem depender do nome físico do arquivo de rota.
- Cada rota nova de produto precisa ter documentação do módulo.

## Permissões

- Rotas administrativas preservam checagem de perfil e autorização.
- Ocultar item de menu não substitui RLS ou validação de RPC.
- Admin/manager podem receber visão organizacional quando o contrato permitir.
- Usuário comum deve permanecer limitado ao escopo pessoal permitido.

## Navegação principal

O catálogo do menu vive em `src/app/navigation/navigation-items.ts`. A filtragem visual por papel vive em `src/app/navigation/navigation-permissions.ts`. Paths, ordem, labels e badges devem ser alterados de forma intencional e revisável.
