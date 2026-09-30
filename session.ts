import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import type { Ctx, Env, SessionUser } from './types';
import { HttpError, isSecure } from './http';
import { randomToken, sha256Hex } from './crypto';

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const SELF_COLS = `u.id, u.name, u.username, u.email, u.bio, u.avatar, u.created_at,
  (u.password_hash IS NOT NULL) AS has_password, (u.google_id IS NOT NULL) AS google_linked`;

export function cookieName(env: Env): string {
  return isSecure(env.APP_URL) ? '__Host-sid' : 'sid';
}

function toSelf(row: Record<string, unknown>): SessionUser {
  return {
    id: row.id as string,
    name: row.name as string,
    username: row.username as string,
    email: row.email as string,
    bio: row.bio as string,
    avatar: (row.avatar as string | null) ?? null,
    created_at: row.created_at as number,
    has_password: Number(row.has_password) === 1,
    google_linked: Number(row.google_linked) === 1
  };
}

export async function getSelf(db: D1Database, userId: string): Promise<SessionUser | null> {
  const row = await db
    .prepare(`SELECT ${SELF_COLS} FROM users u WHERE u.id = ?`)
    .bind(userId)
    .first<Record<string, unknown>>();
  return row ? toSelf(row) : null;
}

export async function createSession(c: Ctx, userId: string): Promise<void> {
  const token = randomToken(32);
  const hash = await sha256Hex(token);
  const now = Date.now();
  await c.env.DB.prepare(
    'INSERT INTO sessions (token_hash, user_id, created_at, expires_at, user_agent) VALUES (?, ?, ?, ?, ?)'
  )
    .bind(hash, userId, now, now + SESSION_TTL_MS, (c.req.header('User-Agent') ?? '').slice(0, 200))
    .run();
  setCookie(c, cookieName(c.env), token, {
    httpOnly: true,
    secure: isSecure(c.env.APP_URL),
    sameSite: 'Lax',
    path: '/',
    maxAge: SESSION_TTL_MS / 1000
  });
}

export function clearSessionCookie(c: Ctx): void {
  deleteCookie(c, cookieName(c.env), { path: '/', secure: isSecure(c.env.APP_URL) });
}

export async function currentSessionHash(c: Ctx): Promise<string | null> {
  const token = getCookie(c, cookieName(c.env));
  if (!token || !/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
  return sha256Hex(token);
}

/** Loads the signed-in user once per request. Returns null for anonymous visitors. */
export async function loadUser(c: Ctx): Promise<SessionUser | null> {
  if (c.get('userLoaded')) return c.get('user') ?? null;
  c.set('userLoaded', true);
  c.set('user', null);
  const hash = await currentSessionHash(c);
  if (!hash) return null;
  const row = await c.env.DB.prepare(
    `SELECT ${SELF_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ? AND s.expires_at > ?`
  )
    .bind(hash, Date.now())
    .first<Record<string, unknown>>();
  if (!row) return null;
  const user = toSelf(row);
  c.set('user', user);
  return user;
}

export async function requireUser(c: Ctx): Promise<SessionUser> {
  const user = await loadUser(c);
  if (!user) throw new HttpError(401, 'Please log in to continue.');
  return user;
}
