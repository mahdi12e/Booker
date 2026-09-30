import { Hono } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { AppEnv } from './types';
import { HttpError, isSecure } from './http';
import { b64url, fromB64url, newId, randomBytes, randomToken, sha256Bytes } from './crypto';
import { rateLimit } from './ratelimit';
import { createSession } from './session';
import { RESERVED_USERNAMES, cleanText } from './validate';

const google = new Hono<AppEnv>();

const STATE_COOKIE = 'g_state';
const COOKIE_PATH = '/api/auth/google';

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return JSON.parse(new TextDecoder().decode(fromB64url(parts[1]))) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function digits(n: number): string {
  let out = '';
  for (const b of randomBytes(n)) out += String(b % 10);
  return out;
}

async function pickUsername(db: D1Database, email: string): Promise<string> {
  let base = email
    .split('@')[0]
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/^[^a-z]+/, '')
    .slice(0, 14);
  if (base.length < 3 || RESERVED_USERNAMES.has(base)) base = 'writer';
  for (let i = 0; i < 6; i++) {
    const candidate = i === 0 && base !== 'writer' ? base : `${base}${digits(4)}`;
    const taken = await db.prepare('SELECT 1 FROM users WHERE username = ?').bind(candidate).first();
    if (!taken) return candidate;
  }
  return `writer${digits(8)}`;
}

/** Step 1: returns the Google consent URL (authorization code flow with PKCE). */
google.post('/auth/google', async (c) => {
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = c.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new HttpError(503, 'Google sign-in is not set up on this site yet.');
  }
  await rateLimit(c, 'google-start', 30, 3600);

  const state = randomToken(24);
  const verifier = randomToken(48);
  const challenge = b64url(await sha256Bytes(verifier));
  await c.env.KV.put(`oauth:${state}`, verifier, { expirationTtl: 600 });

  setCookie(c, STATE_COOKIE, state, {
    httpOnly: true,
    secure: isSecure(c.env.APP_URL),
    sameSite: 'Lax',
    path: COOKIE_PATH,
    maxAge: 600
  });

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    redirect_uri: `${c.env.APP_URL}/api/auth/google/callback`,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });
  return c.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

/** Step 2: Google redirects here. Exchange the code server-side, then sign the user in. */
google.get('/auth/google/callback', async (c) => {
  const fail = (code: string) => c.redirect(`/login?error=${code}`);
  const { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET } = c.env;
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) return fail('google_failed');

  const code = c.req.query('code');
  const state = c.req.query('state');
  const cookieState = getCookie(c, STATE_COOKIE);
  deleteCookie(c, STATE_COOKIE, { path: COOKIE_PATH });

  if (c.req.query('error') || !code || !state || !cookieState || state !== cookieState) {
    return fail('google_denied');
  }
  const verifier = await c.env.KV.get(`oauth:${state}`);
  if (!verifier) return fail('google_expired');
  await c.env.KV.delete(`oauth:${state}`);

  let idToken: string | undefined;
  try {
    const res = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: `${c.env.APP_URL}/api/auth/google/callback`,
        grant_type: 'authorization_code',
        code_verifier: verifier
      })
    });
    if (!res.ok) return fail('google_failed');
    idToken = ((await res.json()) as { id_token?: string }).id_token;
  } catch {
    return fail('google_failed');
  }
  if (!idToken) return fail('google_failed');

  // The token came straight from Google's token endpoint over TLS (OIDC Core 3.1.3.7),
  // so signature verification may be skipped; we still validate the claims.
  const claims = decodeJwtPayload(idToken);
  if (
    !claims ||
    (claims.iss !== 'https://accounts.google.com' && claims.iss !== 'accounts.google.com') ||
    claims.aud !== GOOGLE_CLIENT_ID ||
    typeof claims.exp !== 'number' ||
    claims.exp * 1000 < Date.now() ||
    typeof claims.sub !== 'string' ||
    typeof claims.email !== 'string'
  ) {
    return fail('google_failed');
  }
  if (claims.email_verified !== true) return fail('google_unverified');

  const sub = claims.sub;
  const email = claims.email.toLowerCase();
  const db = c.env.DB;
  const now = Date.now();

  let user = await db
    .prepare('SELECT id, username FROM users WHERE google_id = ?')
    .bind(sub)
    .first<{ id: string; username: string }>();

  if (!user) {
    const existing = await db
      .prepare('SELECT id, username, google_id FROM users WHERE email = ?')
      .bind(email)
      .first<{ id: string; username: string; google_id: string | null }>();

    if (existing) {
      if (existing.google_id) return fail('google_conflict');
      // Link the Google identity. Because we do not verify emails on password sign-up, we also
      // drop the old password and sessions so nobody who pre-registered this address keeps access.
      await db.batch([
        db.prepare('UPDATE users SET google_id = ?, password_hash = NULL, updated_at = ? WHERE id = ?').bind(sub, now, existing.id),
        db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(existing.id)
      ]);
      user = { id: existing.id, username: existing.username };
    } else {
      const id = newId(16);
      const username = await pickUsername(db, email);
      const rawName = typeof claims.name === 'string' ? claims.name : email.split('@')[0];
      const name = cleanText(rawName).replace(/\s+/g, ' ').trim().slice(0, 60) || username;
      try {
        await db
          .prepare(
            `INSERT INTO users (id, name, username, email, google_id, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)`
          )
          .bind(id, name, username, email, sub, now, now)
          .run();
      } catch {
        return fail('google_failed');
      }
      user = { id, username };
    }
  }

  await createSession(c, user.id);
  return c.redirect(`/@${user.username}`);
});

export default google;
