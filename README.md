# Marginalia

A social writing platform for poems, stories and book parts, built to run entirely on Cloudflare (Workers, D1, R2, KV, Turnstile). Its signature element is the rotating POEM / STORY / BOOK PART dial. See `docs/ARCHITECTURE.md` for the design.

Requirements: Node 20+, a Cloudflare account, and (optionally) a Google Cloud project.

## 1. Install dependencies
```bash
npm install
```

## 2. Log in and create the Cloudflare resources
```bash
npx wrangler login

# 3. D1 database (copy the database_id it prints)
npx wrangler d1 create marginalia-db

# KV namespace (copy the id it prints)
npx wrangler kv namespace create KV

# R2 bucket for avatars
npx wrangler r2 bucket create marginalia-avatars
```
Open `wrangler.jsonc` and paste the D1 `database_id` and the KV `id` over the `PASTE-...` values. If you rename the D1 database, also update the `db:migrate:*` scripts in `package.json`.

## 4. Migrations
Migrations live in `migrations/`. To add one later: `npx wrangler d1 migrations create marginalia-db add_something`.

## 5. Apply migrations
```bash
npm run db:migrate:local     # local development database
npm run db:migrate:remote    # production database (run before first deploy)
```

## 6. Environment variables and secrets
`APP_URL` is a plain variable in `wrangler.jsonc` and must be the exact public origin, with no trailing slash (for example `https://marginalia.your-subdomain.workers.dev` or your custom domain). It is used for the CSRF origin check and the OAuth redirect.

Secrets (stored encrypted, never in code):
```bash
npx wrangler secret put GOOGLE_CLIENT_ID
npx wrangler secret put GOOGLE_CLIENT_SECRET
npx wrangler secret put TURNSTILE_SECRET
```
If `TURNSTILE_SECRET` is not set, the bot check is skipped. Set it in production.

For local work: `cp .dev.vars.example .dev.vars` and `cp .env.example .env`.

## 7. Configure Google OAuth
1. Google Cloud Console, then APIs and Services, then OAuth consent screen: configure it (External) and add the `openid`, `email` and `profile` scopes.
2. Credentials, then Create credentials, then OAuth client ID, type Web application.
3. Authorized redirect URIs (add both): `http://localhost:5173/api/auth/google/callback` and `https://YOUR-DOMAIN/api/auth/google/callback`.
4. Put the client ID and secret into `.dev.vars` (local) and `wrangler secret put` (production).

## 8. Configure Turnstile
1. Cloudflare dashboard, then Turnstile, then Add widget. Add your domain (and `localhost` if you want to test with real keys).
2. Put the **secret key** in `TURNSTILE_SECRET` (secret).
3. Put the **site key** in `.env` as `VITE_TURNSTILE_SITE_KEY`. It is public and is baked in at build time, so set it before `npm run build`.
The example files use Cloudflare's always-pass test keys.

## 9. Run locally
Use two terminals:
```bash
npm run dev:api    # Worker + D1/KV/R2 on http://localhost:8787
npm run dev:web    # Vite on http://localhost:5173, proxying /api to the Worker
```
Open http://localhost:5173. `APP_URL` in `.dev.vars` must be `http://localhost:5173`.

## 10. Test
```bash
npm run typecheck   # TypeScript for the frontend and the Worker
npm test            # API smoke test (needs npm run dev:api running)
```
The smoke test covers registration, duplicate usernames, public/private/draft visibility, other users' edit and delete attempts (IDOR), CSRF blocking, and logout.

## 11. Deploy
```bash
npm run db:migrate:remote
npm run deploy      # typechecks, builds the frontend, deploys the Worker
```
Set `APP_URL` in `wrangler.jsonc` to the deployed origin first (and add that origin's callback URL in Google).

## 12. Connect a custom domain
1. Add your domain to Cloudflare (DNS).
2. Workers and Pages, then `marginalia`, then Settings, then Domains and Routes, then Add, then Custom Domain. Or add to `wrangler.jsonc`: `"routes": [{ "pattern": "yourdomain.com", "custom_domain": true }]`.
3. Change `APP_URL` to `https://yourdomain.com`, add the new Google redirect URI and Turnstile hostname, then `npm run deploy`.
4. Recommended: a WAF rate-limiting rule on `/api/auth/*`.

## Notes and limits
- Content is plain text by design (the safest way to rule out stored XSS). There is no rich text.
- Signing in with Google to an email that already has a password account links the two and removes the old password (there is no email verification on password sign-up). The user can set a new one in Settings.
- Shared links do not yet carry rich social previews (Open Graph), which would need server-side HTML for `/post/:id`.
- Profiles are always public; posts are public, private or draft.
