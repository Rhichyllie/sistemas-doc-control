# TRAMITA — P-0 Audit Report

## 1. Stack Summary

- Frontend: Vite 8, React 19, TypeScript, TanStack Router, TanStack Query, Tailwind CSS 4, shadcn/ui (`new-york`, `slate`).
- Data/Auth: Supabase JS v2 with generated clients in `src/integrations/supabase/`, duplicate client/types in `src/supabase/`, and an older hardcoded client in `src/lib/supabase.ts`.
- Desktop shells: Electron is configured as the package `main`; Tauri v2 config and Rust source also exist, creating a dual-shell conflict.
- Runtime data layer: `LocalDataProvider` is the central data context; despite its name, it now performs real Supabase reads/writes for most app data after auth.
- Routing: TanStack file routes with a protected `/authenticated` layout and public `/auth` route.

## 2. Critical Flags (things that block P-1)

1. `cloud-auth-js` is present in `dependencies` and must be removed in P-1.
2. Legacy generated integration code was present in legacy generated integration and error-reporting files at audit time.
3. Both Electron and Tauri are present (`electron/`, `src-tauri/`, Tauri scripts and dev dependencies). This must be decided/cleaned before packaging work.
4. `hooks/` exists at repository root and duplicates `src/hooks/`; imports use `@/hooks`, so runtime imports resolve to `src/hooks`, but the root folder should move/remove in P-1.
5. `src/lib/supabase.ts` hardcodes a Supabase URL and anon key, conflicting with env-based clients.
6. Migration/schema mismatch: frontend calls tables/columns not created by migrations (`projetistas`, `team`, `notifications`, `recent_activities`, `approval_*`, many document deadline/origin columns).
7. `src/contexts/local-data-context.tsx` contains a duplicated `documents` field in its interface and relies on many `any` casts.
8. `src/routes/index.tsx` uses local-auth state, while `/auth` and `/authenticated` use Supabase auth state; this can make redirect behavior inconsistent.
9. `src-tauri/Cargo.lock` is currently untracked before this audit; it was not created or modified by this audit.

## 3. Dependency Inventory

### Dependencies

- `@hookform/resolvers` `^5.2.2`
- `cloud-auth-js` `^1.1.2` **FLAG: remove in P-1**
- Radix packages: accordion, alert-dialog, aspect-ratio, avatar, checkbox, collapsible, context-menu, dialog, dropdown-menu, hover-card, label, menubar, navigation-menu, popover, progress, radio-group, scroll-area, select, separator, slider, slot, switch, tabs, toggle, toggle-group, tooltip
- `@supabase/supabase-js` `^2.108.2`
- `@tailwindcss/vite` `^4.2.1`
- `@tanstack/react-query` `^5.83.0`
- `@tanstack/react-router` `^1.168.25`
- UI/utilities: `class-variance-authority`, `clsx`, `cmdk`, `date-fns`, `embla-carousel-react`, `input-otp`, `lucide-react`, `react-day-picker`, `react-resizable-panels`, `recharts`, `sonner`, `tailwind-merge`, `tailwindcss`, `tw-animate-css`, `vaul`, `zod`
- Export/rendering: `dom-to-image-more`, `html2canvas`, `jspdf`, `jspdf-autotable`, `xlsx`
- React: `react` `^19.2.0`, `react-dom` `^19.2.0`, `react-hook-form` `^7.71.2`

### Dev dependencies

- ESLint/format: `@eslint/js`, `eslint`, `eslint-config-prettier`, `eslint-plugin-prettier`, `eslint-plugin-react-hooks`, `eslint-plugin-react-refresh`, `globals`, `prettier`, `typescript-eslint`
- Build/types: `@types/node`, `@types/react`, `@types/react-dom`, `@vitejs/plugin-react`, `typescript`, `vite`, `@tanstack/router-plugin`
- Desktop: `electron`, `electron-builder`, `@tauri-apps/api`, `@tauri-apps/cli` **FLAG: Tauri conflicts with Electron**
- Tooling: `concurrently`, `cross-env`, `wait-on`

### Scripts

- Web: `dev`, `build`, `build:dev`, `preview`, `lint`, `format`
- Tauri: `tauri`, `tauri:dev`, `tauri:build`
- Electron: `electron:dev`, `electron:build`, `electron:build:win`

## 4. Folder Structure

- `src/`: React application source, routes, components, contexts, hooks, Supabase clients, utility modules, global CSS, generated route tree.
- `src/components/`: app layout, auth page, notification panel, and shadcn/ui primitives.
- `src/contexts/`: `LocalDataProvider` for app data and `ThemeProvider` for theme/localStorage state.
- `src/hooks/`: runtime hooks imported via `@/hooks`; includes Supabase auth, local auth, local-data re-export, mobile media query.
- `src/routes/`: TanStack file routes for auth, root redirect, authenticated layout, dashboard and entity screens.
- `src/integrations/`: generated Supabase client/types plus legacy generated edge-function-style code.
- `src/lib/`: labels, exports, status/notification helpers, Supabase hardcoded client, legacy error reporting, class utilities.
- `hooks/`: root-level duplicate hook folder; should be inside `src/` or removed in P-1. It is not reached by `@/hooks` alias.
- `electron/`: Electron main/preload files (`.cjs` and `.js` variants).
- `src-tauri/`: Tauri v2 Rust application scaffold, capabilities, icons, config, Cargo files.
- `supabase/`: Supabase project config, migrations, and one Edge Function.
- `public/`: static `Banner_DOC.png` asset; Electron expects `public/favicon.ico`, but it is not present.
- `Imagem/`: duplicate/banner image asset folder with `Banner_DOC.png`.

## 5. Routes Map

| Route | File | Auth protection | Status |
|---|---|---:|---|
| `/` | `src/routes/index.tsx` | Redirect only; uses local auth state | BROKEN/MOCK auth mismatch |
| `/auth` | `src/routes/auth.tsx` | Redirects away if Supabase session flag exists | REAL auth shell |
| `/authenticated` | `src/routes/authenticated/route.tsx` | Protected by `getAuthState()` from Supabase hook | REAL guard |
| `/authenticated/dashboard` | `src/routes/authenticated/dashboard.tsx` | Inherits `/authenticated` | REAL data via context, with UI calculations |
| `/authenticated/disciplines` | `src/routes/authenticated/disciplines.tsx` | Inherits `/authenticated` | REAL via context |
| `/authenticated/documents` | `src/routes/authenticated/documents.tsx` | Inherits `/authenticated` | REAL via context, schema mismatch risk |
| `/authenticated/equipe` | `src/routes/authenticated/equipe.tsx` | Inherits `/authenticated` | REAL via context, missing migration table |
| `/authenticated/fluxo-de-aprovacao` | `src/routes/authenticated/fluxo-de-aprovacao.tsx` | Inherits `/authenticated` | REAL/SHELL, approval tables/functions missing locally |
| `/authenticated/projects` | `src/routes/authenticated/projects.tsx` | Inherits `/authenticated` | REAL via context |
| `/authenticated/projetistas` | `src/routes/authenticated/projetistas.tsx` | Inherits `/authenticated` | REAL via context, missing migration table |

## 6. Component Inventory (name | file | status: REAL/MOCK/SHELL/BROKEN)

| Name | File | What it does | Status |
|---|---|---|---|
| `AppLayout` | `src/components/app-layout.tsx` | Sidebar/nav, company name/logo localStorage, import/export through data context | REAL/MOCK |
| `AuthPage` | `src/components/auth-page.tsx` | Sign in, sign up, password reset, recovery handling through Supabase auth | REAL |
| `NotificationsPanel` | `src/components/notifications-panel.tsx` | Displays and marks notifications through context | REAL |
| `LocalDataProvider` | `src/contexts/local-data-context.tsx` | Central Supabase read/write/realtime data store | REAL/BROKEN schema risk |
| `ThemeProvider` | `src/contexts/theme-context.tsx` | Theme state persisted in localStorage | MOCK |
| `Dashboard` | `src/routes/authenticated/dashboard.tsx` | Metrics, charts, filters, quick actions, PDF export | REAL/MOCK derived UI |
| `DisciplinesPage` | `src/routes/authenticated/disciplines.tsx` | CRUD disciplines through context | REAL |
| `DocumentsPage` | `src/routes/authenticated/documents.tsx` | CRUD/filter/export documents and revisions through context | REAL/BROKEN schema risk |
| `EquipePage` | `src/routes/authenticated/equipe.tsx` | CRUD team members through context | REAL/BROKEN missing migration |
| `FluxoDeAprovacaoPage` | `src/routes/authenticated/fluxo-de-aprovacao.tsx` | Approval flow UI, steps/comments/history, invokes Edge Function | REAL/BROKEN missing migrations |
| `ProjectsPage` | `src/routes/authenticated/projects.tsx` | CRUD projects through context | REAL |
| `ProjetistasPage` | `src/routes/authenticated/projetistas.tsx` | CRUD projetistas through context | REAL/BROKEN missing migration |
| shadcn/ui primitives | `src/components/ui/*.tsx` | Installed reusable UI building blocks | SHELL |
| Supabase clients/types | `src/integrations/supabase/*`, `src/supabase/*` | Env-based clients and generated DB types | REAL |
| Legacy generated integration | removed legacy generated files | Deno-style function code and error reporting import | BROKEN |
| Export utils | `src/lib/export-utils.ts` | Excel/PDF/dashboard export helpers | SHELL/REAL client utility |
| Labels/status/notification utils | `src/lib/*.ts(x)` | Static mappings and pure helper functions | SHELL |

Installed shadcn components: accordion, alert, alert-dialog, aspect-ratio, autocomplete, avatar, badge, breadcrumb, button, calendar, card, carousel, chart, checkbox, collapsible, command, context-menu, dialog, drawer, dropdown-menu, form, hover-card, input, input-otp, label, menubar, navigation-menu, pagination, popover, progress, radio-group, scroll-area, select, separator, sheet, sidebar, skeleton, slider, sonner, switch, table, tabs, textarea, toggle, toggle-group, tooltip.

## 7. Hooks Inventory (name | file | calls Supabase: yes/no | status)

| Hook/export | File | State managed | Calls Supabase | Used in `src/` | Status |
|---|---|---|---:|---|---|
| `useAuth`, `getAuthState` | `src/hooks/use-auth.ts` | Session, user, roles, loading; login/signup/logout/reset | yes: auth and `user_roles` | `AuthPage`, `LocalDataProvider`, auth routes | REAL |
| `useAuth`, `getAuthState` | `src/hooks/use-local-auth.ts` | localStorage users/session/roles | no | only `src/routes/index.tsx` | MOCK/BROKEN mismatch |
| `useLocalData` | `src/hooks/use-local-data.ts` | re-export of context hook | indirect | many components/routes | REAL |
| `useIsMobile` | `src/hooks/use-mobile.tsx` | media-query boolean | no | no direct route usage found | SHELL |
| `useAuth` | `src/hooks/use-supabase-auth.ts` | Alternate Supabase profile auth | yes: auth and `profiles` | no active usage found | REAL/SHELL orphan |
| root duplicate hooks | `hooks/*.ts(x)` | duplicates of hook files outside alias scope | mixed | no `src/` imports to root path found | BROKEN/P-1 cleanup |

## 8. Supabase Schema (tables, columns, RLS status per table)

Config: `supabase/config.toml` has `project_id = "innurprsztihnndjedvj"`. No local API/db port is defined in the visible config file.

Migrations:

1. `20260612185220_74709dda-81ee-47a0-a23b-cfd1804b26f5.sql`
   - Enums: `app_role`, `project_status`, `doc_status`, `doc_origin`.
   - `profiles`: `id` PK/FK `auth.users`, `full_name`, `email`, `position`, `discipline`, timestamps. RLS enabled.
   - `user_roles`: `id` PK, `user_id` FK `auth.users`, `role`, `created_at`, unique `(user_id, role)`. RLS enabled.
   - `disciplines`: `id` PK, `name` unique, `code`, `created_at`. RLS enabled. Seed inserts Civil/Mecânica/Tubulação/Elétrica/Instrumentação/Processo/Automação/Estruturas/Arquitetura/Outras.
   - `projects`: `id` PK, `code` unique, `name`, `client`, `start_date`, `end_date`, `status`, `created_by`, timestamps. RLS enabled.
   - `documents`: `id` PK, `code`, `title`, `project_id` FK, `discipline_id` FK, `doc_type`, `current_revision`, `origin`, `analyst_id`, `status`, dates for receive/analysis/designer/new revision/approval, `created_by`, timestamps, unique `(project_id, code)`. RLS enabled.
   - `document_revisions`: `id` PK, `document_id` FK, `revision`, `status`, `comments`, `file_path`, `file_name`, `user_id`, `created_at`. RLS enabled.
   - `audit_log`: `id` PK, `user_id` FK, `action`, `entity`, `entity_id`, `details`, `created_at`. RLS enabled.
   - Functions/triggers: `has_role`, `set_updated_at`, `handle_new_user`, profile/project/document updated triggers, auth user trigger.
2. `20260612185258_ac43837e-baf3-407b-81c8-d856c8ec6add.sql`
   - Storage policies for `storage.objects` bucket `documents`; no table creation.
3. `20260612185318_e17bc384-1f24-40a1-8ccc-2d7169579a5f.sql`
   - Function privilege hardening for `has_role` and `handle_new_user`; no table creation.
4. `20260613125837_d7abe671-a848-4221-bf7c-cb76ea1a8dfe.sql`
   - Adds `received_at date` to `document_revisions` if missing.

Edge Functions:

- `supabase/functions/send-approval-email/index.ts`: Deno Supabase function that reads `approval_steps`, `team`, `approval_flows`, `documents`; builds an approval email payload; inserts `approval_notifications`. It is not backed by migrations in this repo.

Seed:

- No `supabase/seed.sql` exists. The only seed data found is the disciplines insert inside the first migration.

## 9. Electron Status

- `electron/main.cjs` is the active package entry (`main` in `package.json`). It creates a `BrowserWindow` sized 1400x900, enables context isolation, disables node integration, sets a menu, loads `http://localhost:5173` in development, opens DevTools in development, and loads `dist/index.html` in production.
- `electron/main.js` duplicates the same behavior but uses `preload.js`; active package entry uses `.cjs`.
- `electron/preload.cjs` and `electron/preload.js` expose an empty `electronAPI` via `contextBridge`.
- Production packaging exists through `electron-builder` scripts/config, but no auto-update configuration or updater code exists.
- Conflict: Tauri scripts/dev dependencies and `src-tauri/` coexist with Electron. Both target desktop packaging and should not remain ambiguous.

## 10. What Works Today (list what a user can actually do in the demo)

Assuming valid Supabase env vars and matching remote schema:

- Sign up, sign in, sign out, reset password using Supabase auth.
- Use the authenticated dashboard after session creation.
- View projects, disciplines, documents, projetistas, team members, notifications, recent activities, and approval flow data loaded through `LocalDataProvider`.
- Create/edit/delete projects, disciplines, projetistas, team members, documents, notifications, approval flows/steps/comments/history through context methods.
- Export documents to Excel/PDF and dashboard to PDF.
- Import/export application data as JSON through layout actions.
- Change company label/logo and theme locally through localStorage.

## 11. What Is Missing (list what exists as UI but has no real backend)

- Migrations for `projetistas`, `team`, `notifications`, `recent_activities`, `approval_flows`, `approval_steps`, `approval_comments`, `approval_history`, `approval_notifications`, and `flow_audit_log`.
- Migrations for many document columns the app reads/writes (`origin_id`, `analysis_days`, `analysis_returned_at`, `sent_to_projetista_at`, `projetista_days`, `projetista_deadline`, `responsible_name`, `responsible_sector`, `external_link`, `file_url` on revisions).
- Real email delivery configuration for `send-approval-email`; function only constructs/inserts notification data in current code.
- Auto-update for Electron.
- One authoritative Supabase client; there are duplicate/hardcoded clients.
- A single authoritative auth hook; local and Supabase auth hooks coexist.
- Public favicon expected by Electron config.
- Supabase seed file for demo users/projects/documents.

## 12. P-1 Readiness Checklist

- [ ] Remove `cloud-auth-js` from dependencies and delete/replace legacy generated code paths.
- [ ] Resolve Electron vs Tauri: keep one desktop target and remove the other scripts/files/dependencies.
- [ ] Move/remove root-level `hooks/`; keep hooks under `src/hooks/` and update imports consistently.
- [ ] Consolidate Supabase clients to env-based `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` only; remove hardcoded keys.
- [ ] Align migrations with frontend tables/columns or adjust frontend to existing schema.
- [ ] Replace local-auth redirect in `/` with the same Supabase auth gate used elsewhere.
- [ ] Add or document seed data strategy.
- [ ] Confirm RLS policies for all tables needed by CRUD screens.
- [ ] Add favicon or update Electron icon path.
- [ ] Decide how approval emails are sent and migrate required approval tables.
