import { Hono } from 'hono';
import type { AppEnv } from './types';
import { HttpError, readJson } from './http';
import { DUMMY_HASH, hashPassword, newId, verifyPassword } from './crypto';
import { rateLimit } from './ratelimit';
import { verifyTurnstile } from './turnstile';
import {
  clearSessionCookie,
  createSession,
  currentSessionHash,
  getSelf,
  loadUser,
  requireUser
} from './session';
import { parseEmail, parseName, parsePassword, parseUsername, usernameProblem } from './validate';

const auth = new Hono<AppEnv>();

export function uniqueViolation(e: unknown): HttpError | null {
  const msg = e instanceof Error ? e.message : String(e);
  if (!msg.includes('UNIQUE')) return null;
  if (msg.includes('users.username')) return new HttpError(409, 'That username is taken.', 'username');
  if (msg.includes('users.email')) return new HttpError(409, 'An account with this email already exists.', 'email');
  return new HttpError(409, 'That value is already in use.');
}

auth.get('/me', async (c) => {
  return c.json({ user: await loadUser(c) });
});

auth.get('/auth/username/:username', async (c) => {
  await rateLimit(c, 'username-check', 60, 60);
  const raw = c.req.param('username').toLowerCase();
  const problem = usernameProblem(raw);
  if (problem) return c.json({ available: false, reason: problem });
  const me = await loadUser(c);
  const row = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(raw).first<{ id: string }>();
  const available = !row || row.id === me?.id;
  return c.json({ available, reason: available ? undefined : 'That username is taken.' });
});

auth.post('/auth/register', async (c) => {
  await rateLimit(c, 'register', 8, 3600);
  const body = await readJson(c, 8 * 1024);
  await verifyTurnstile(c, body.turnstile_token);

  const name = parseName(body.name);
  const username = parseUsername(body.username);
  const email = parseEmail(body.email);
  const password = parsePassword(body.password);
  if (body.confirm_password !== password) {
    throw new HttpError(422, 'Passwords do not match.', 'confirm_password');
  }

  const id = newId(16);
  const now = Date.now();
  const hash = await hashPassword(password);
  try {
    await c.env.DB.prepare(
      `INSERT INTO users (id, name, username, email, password_hash, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(id, name, username, email, hash, now, now)
      .run();
  } catch (e) {
    throw uniqueViolation(e) ?? e;
  }
  await createSession(c, id);
  return c.json({ user: await getSelf(c.env.DB, id) }, 201);
});

auth.post('/auth/login', async (c) => {
  const body = await readJson(c, 4 * 1024);
  const identifier = typeof body.identifier === 'string' ? body.identifier.trim().toLowerCase() : '';
  const password = typeof body.password === 'string' ? body.password : '';
  if (!identifier || identifier.length > 254 || !password || password.length > 128) {
    throw new HttpError(422, 'Enter your email or username and your password.');
  }
  await rateLimit(c, 'login-ip', 20, 900);
  await rateLimit(c, 'login-id', 8, 900, identifier);
  await verifyTurnstile(c, body.turnstile_token);

  const column = identifier.includes('@') ? 'email' : 'username';
  const row = await c.env.DB.prepare(`SELECT id, password_hash FROM users WHERE ${column} = ?`)
    .bind(identifier)
    .first<{ id: string; password_hash: string | null }>();

  const ok = await verifyPassword(password, row?.password_hash ?? DUMMY_HASH);
  if (!row || !row.password_hash || !ok) {
    throw new HttpError(401, 'That email, username or password is not correct.');
  }
  await createSession(c, row.id);
  return c.json({ user: await getSelf(c.env.DB, row.id) });
});

auth.post('/auth/logout', async (c) => {
  const hash = await currentSessionHash(c);
  if (hash) await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(hash).run();
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.post('/auth/logout-all', async (c) => {
  const user = await requireUser(c);
  await c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(user.id).run();
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.put('/auth/password', async (c) => {
  const user = await requireUser(c);
  await rateLimit(c, 'password', 10, 3600, user.id);
  const body = await readJson(c, 4 * 1024);
  const next = parsePassword(body.new_password, 'new_password');

  const row = await c.env.DB.prepare('SELECT password_hash FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string | null }>();
  if (row?.password_hash) {
    const current = typeof body.current_password === 'string' ? body.current_password : '';
    if (!current || !(await verifyPassword(current, row.password_hash))) {
      throw new HttpError(403, 'Your current password is not correct.', 'current_password');
    }
  }
  const hash = await hashPassword(next);
  const keep = await currentSessionHash(c);
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').bind(hash, Date.now(), user.id),
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash <> ?').bind(user.id, keep ?? '')
  ]);
  return c.json({ ok: true });
});

export default auth;
