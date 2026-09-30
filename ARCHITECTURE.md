# Marginalia architecture

## 1. Technology stack
- **One Cloudflare Worker** (Hono) serves the JSON API under `/api/*`. Static assets (the built React app) are served by Workers Assets with single-page-app fallback, so `/@username` and `/post/:id` deep links work.
- **Frontend:** Vite, React 18, React Router. Every route is lazy-loaded. No UI, animation or editor libraries.
- **Data:** D1 (relational data), R2 (avatars), KV (rate limits, OAuth state, discover-feed cache).
- **Bot protection:** Turnstile on register and login. **Sessions:** server-side, cookie-based.
- **Runtime dependencies:** hono, react, react-dom, react-router-dom.

## 2. System architecture
```
Browser --(HTTPS)--> Cloudflare edge
                      |-- /api/*  -> Worker (Hono) -> D1, KV, R2
                      '-- other   -> Workers Assets (dist/, SPA fallback, _headers for CSP)
Cron (daily 03:00 UTC) -> Worker scheduled() -> purge expired sessions / stale autosaves
```

## 3. Database schema (D1)
`users`, `sessions`, `posts`, `drafts` are in `migrations/0001_init.sql`. `likes`, `comments`, `follows`, `notifications`, `reports` are prepared in `0002_social_ready.sql`.
- `users.username` and `users.email` are `UNIQUE COLLATE NOCASE`; `google_id` is `UNIQUE` and nullable; every user must have a password hash or a Google id.
- `posts.type` is constrained to `poem | story | book_part`; `visibility` to `public | private | draft`; book parts must have a `book_title`; non-drafts must have `published_at`.
- `drafts` is the autosave buffer, one row per `(user, type, draft_key)`.
- Indexes serve the two hot queries: the public feed `(visibility, [type,] published_at DESC)` and a user's works `(author_id, visibility, published_at DESC)`.
- IDs are random base64url strings, so public URLs are not enumerable. Timestamps are epoch milliseconds.

## 4. Authentication
- Passwords: PBKDF2-SHA256, 100,000 iterations (the maximum Workers allows), 16-byte random salt, constant-time compare. Login does a dummy hash for unknown accounts to keep timing similar.
- Sessions: 32 random bytes in an `HttpOnly; Secure; SameSite=Lax; Path=/` cookie (`__Host-sid` over HTTPS). Only the SHA-256 of the token is stored. 30-day expiry, revocable (logout, log out everywhere, password change).

## 5. Google OAuth flow
1. `POST /api/auth/google`: Worker creates `state` and a PKCE verifier, stores the verifier in KV (10 min), sets a `g_state` cookie, returns the Google consent URL.
2. Google redirects to `GET /api/auth/google/callback?code&state`.
3. Worker checks `state` against the cookie and KV, exchanges the code (with the client secret and PKCE verifier) server-side, and validates the ID token claims (`iss`, `aud`, `exp`, `email_verified`).
4. Existing `google_id` signs in. A matching email is linked (old password and sessions are revoked, to defeat pre-registration takeover). Otherwise a user is created with a unique username. A session is created and the browser is redirected to `/@username`.

## 6. API
| Method | Path | Auth |
|---|---|---|
| POST | /api/auth/register, /login, /logout, /logout-all, /google | public / session |
| GET | /api/auth/google/callback, /api/auth/username/:u | public |
| PUT | /api/auth/password | session |
| GET | /api/me | public (returns `user: null` when signed out) |
| PATCH | /api/profile | session |
| POST / DELETE | /api/profile/avatar | session |
| GET | /api/profile/:username, /api/avatars/:uid/:file | public |
| GET | /api/posts (discover feed), /api/posts/:id, /api/users/:username/posts | public, visibility enforced in SQL |
| POST | /api/posts | session |
| PATCH / DELETE | /api/posts/:id | session, owner only |
| GET / PUT / DELETE | /api/drafts | session |

## 7. Folder structure
```
worker/   index.ts, lib/ (crypto, session, validate, ratelimit, turnstile, http, middleware), routes/
src/      main, App, api, auth, components/ (Wheel, Composer, Nav, PostCard, Feed, EditProfile, ...), pages/, styles/
migrations/  SQL
public/   favicon, _headers (CSP and caching for static assets)
scripts/  smoke.sh
```

## 8. UI structure
Landing, Login/Register, Home, Discover/Explore, Write, Profile (`/@username`, `/profile/:username`), Post (`/post/:id`), Settings. Top bar on desktop; the same `<nav>` becomes a bottom tab bar on phones.
The dial (`Wheel`) is a radiogroup of three radio buttons positioned by pointer-driven transforms. It rotates continuously, snaps on release, accepts mouse, touch, flick and arrow keys, honours `prefers-reduced-motion`, and updates the DOM directly (no React re-renders per frame).

## 9. Security model
- **XSS:** content is plain text, stored and rendered as text nodes (`white-space` does the formatting). Control and bidi-override characters are stripped. A strict CSP is set on static assets and API responses carry `nosniff`.
- **SQL injection:** prepared statements only; the few dynamic SQL strings are assembled from fixed fragments.
- **IDOR / authorization:** every write has `AND author_id = ?` in the SQL. Non-public posts return 404 to everyone but the author.
- **CSRF:** SameSite cookies, exact `Origin` match against `APP_URL`, and a required `X-Requested-With` header on every non-GET request.
- **Rate limits:** KV fixed windows on register, login (per IP and per identifier), username checks, writes, autosave, avatars. Add a Cloudflare WAF rate-limit rule on `/api/auth/*` for hard guarantees.
- **Limits:** streaming body caps (8 KB auth, 1.2 MB posts, 2 MB avatars), field length limits, image magic-byte sniffing, avatars served with `CSP: sandbox`.
- **Secrets:** only `wrangler secret` / `.dev.vars`. The only value in frontend code is the public Turnstile site key.
- **Errors:** users get short messages; details go to Worker logs.

## 10. Cloudflare deployment architecture
One Worker named `marginalia` with bindings `DB` (D1), `KV`, `AVATARS` (R2), vars `APP_URL`, secrets `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `TURNSTILE_SECRET`, a cron trigger, and static assets from `dist/`.
