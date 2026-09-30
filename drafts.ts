import { Hono } from 'hono';
import type { AppEnv } from './types';
import { HttpError, readJson } from './http';
import { newId } from './crypto';
import { rateLimit } from './ratelimit';
import { requireUser } from './session';
import {
  CONTENT_MAX,
  MAX_POST_BODY,
  POST_TYPES,
  TITLE_MAX,
  cleanText,
  parseDraftKey,
  type PostType
} from './validate';

const drafts = new Hono<AppEnv>();
const MAX_DRAFT_ROWS = 300;

function typeOf(v: unknown): PostType {
  if (!POST_TYPES.includes(v as PostType)) throw new HttpError(422, 'Choose a valid content type.', 'type');
  return v as PostType;
}

drafts.get('/drafts', async (c) => {
  const user = await requireUser(c);
  const type = typeOf(c.req.query('type'));
  const key = parseDraftKey(c.req.query('key'));
  const draft = await c.env.DB.prepare(
    'SELECT title, book_title, content, updated_at FROM drafts WHERE user_id = ? AND type = ? AND draft_key = ?'
  )
    .bind(user.id, type, key)
    .first();
  return c.json({ draft: draft ?? null });
});

drafts.put('/drafts', async (c) => {
  const user = await requireUser(c);
  await rateLimit(c, 'autosave', 240, 3600, user.id);
  const body = await readJson(c, MAX_POST_BODY);
  const type = typeOf(body.type);
  const key = parseDraftKey(body.draft_key);

  const title = cleanText(typeof body.title === 'string' ? body.title : '').slice(0, TITLE_MAX);
  const bookTitle = type === 'book_part' ? cleanText(typeof body.book_title === 'string' ? body.book_title : '').slice(0, TITLE_MAX) : null;
  const content = cleanText(typeof body.content === 'string' ? body.content : '');
  if (content.length > CONTENT_MAX[type]) throw new HttpError(422, 'That is longer than the character limit.', 'content');

  const count = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM drafts WHERE user_id = ?').bind(user.id).first<{ n: number }>();
  if ((count?.n ?? 0) >= MAX_DRAFT_ROWS) {
    throw new HttpError(429, 'You have a lot of unsaved drafts. Publish or discard some first.');
  }

  const now = Date.now();
  await c.env.DB.prepare(
    `INSERT INTO drafts (id, user_id, type, draft_key, title, book_title, content, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, type, draft_key) DO UPDATE SET
       title = excluded.title, book_title = excluded.book_title,
       content = excluded.content, updated_at = excluded.updated_at`
  )
    .bind(newId(8), user.id, type, key, title, bookTitle, content, now)
    .run();
  return c.json({ ok: true, updated_at: now });
});

drafts.delete('/drafts', async (c) => {
  const user = await requireUser(c);
  const type = typeOf(c.req.query('type'));
  const key = parseDraftKey(c.req.query('key'));
  await c.env.DB.prepare('DELETE FROM drafts WHERE user_id = ? AND type = ? AND draft_key = ?').bind(user.id, type, key).run();
  return c.json({ ok: true });
});

export default drafts;
