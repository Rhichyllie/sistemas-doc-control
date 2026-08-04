# Setup do Ambiente Supabase

Este projeto ja possui a estrutura base para banco, migrations, seed e Edge Functions do Supabase.

## O que ja existe no repositorio

- Cliente web do Supabase em `src/lib/supabase.ts`
- Configuracao do projeto local em `supabase/config.toml`
- Migrations versionadas em `supabase/migrations`
- Seed de demonstracao em `supabase/seed.sql`
- Edge Functions em `supabase/functions`

## Variaveis do app web

Preencha o `.env` a partir do `.env.example`:

```env
SUPABASE_PROJECT_ID=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_URL=
VITE_SUPABASE_PROJECT_ID=
VITE_SUPABASE_PUBLISHABLE_KEY=
VITE_SUPABASE_URL=
```

Observacoes:

- Use a URL base do projeto, por exemplo `https://seu-projeto.supabase.co`
- Nao use URL com `/rest/v1/`
- O frontend depende de `VITE_SUPABASE_URL` e `VITE_SUPABASE_PUBLISHABLE_KEY`

## Secrets das Edge Functions

As funcoes atuais exigem os seguintes secrets no Supabase:

### Todas ou quase todas

```txt
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
```

### `create-team-member`

```txt
SUPABASE_ANON_KEY
```

### `send-approval-email`

```txt
APP_BASE_URL
RESEND_API_KEY
```

## Ordem recomendada de setup local

1. Preencher o `.env`
2. Subir a stack local do Supabase
3. Aplicar migrations e seed
4. Subir o app web
5. Se necessario, servir as Edge Functions localmente

Comandos:

```powershell
npm run supabase:start
npm run supabase:db:reset
npm run dev
```

Para servir Edge Functions localmente:

```powershell
npm run supabase:functions:serve
```

## Ordem recomendada para projeto remoto

1. Confirmar credenciais do projeto Supabase
2. Executar `supabase link`
3. Aplicar schema com `db push`
4. Cadastrar os secrets das funcoes
5. Fazer deploy das Edge Functions

Comandos base:

```powershell
supabase link --project-ref SEU_PROJECT_REF
npm run supabase:db:push
supabase secrets set SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=...
supabase functions deploy create-team-member
supabase functions deploy review-alerts
supabase functions deploy extract-pdf-metadata
supabase functions deploy send-approval-email
```

## Observacoes importantes da revisao

- O projeto local do Supabase ja esta referenciado em `supabase/config.toml`
- O app quebra na inicializacao se `VITE_SUPABASE_URL` ou `VITE_SUPABASE_PUBLISHABLE_KEY` nao estiverem definidos
- `seed.sql` cria organizacoes, usuarios demo, perfis e documentos de exemplo
- Existe uma migration/manual extra: `supabase/migrations/manual_create_ana_admin_profile.sql`
  - trate este arquivo como ajuste manual, nao como parte normal do fluxo automatico

## Checklist rapido

- [ ] `.env` preenchido
- [ ] URL do Supabase sem `/rest/v1/`
- [ ] `supabase start` executado
- [ ] `supabase db reset` ou `supabase db push` executado
- [ ] secrets das Edge Functions configurados
- [ ] funcoes publicadas quando usar ambiente remoto
