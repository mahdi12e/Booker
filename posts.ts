import { Hono } from 'hono';
import type { AppEnv, Ctx, Env } from '../types';
import { HttpError, readJson } from '../lib/http';
import { newId } from '../lib/crypto';
import { rateLimit } from '../lib/ratelimit';
import { loadUser, requireUser } from '../lib/session';
import { makeExcerpt } from '../lib/excerpt';
import {
  MAX_POST_BODY,
  isValidId,
  parseCursor,
  parseDraftKey,
  parseLimit,
  parseTypeFilter,
  validatePost,
  type PostType,
  type Visibility
} from '../lib/validate';

const posts = new Hono<AppEnv>();

interface PostRow {
  id: string;
  author_id: string;
  type: PostType;
  title: string;
  book_title: string | null;
  content: string;
  visibility: Visibility;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
}

interface SummaryRow {
  id: string;
  type: PostType;
  title: string;
  book_title: string | null;
  head: string;
  visibility: Visibility;
  published_at: number | null;
  updated_at: number;
  sort_ts: number;
  author_name: string;
  author_username: string;
  author_avatar: string | null;
}

const POST_COLS = `p.id, p.author_id, p.type, p.title, p.book_title, p.content, p.visibility,
  p.created_at, p.updated_at, p.published_at,
  u.name AS author_name, u.username AS author_username, u.avatar AS author_avatar`;

const SUMMARY_COLS = `p.id, p.type, p.title, p.book_title, substr(p.content, 1, 1500) AS head, p.visibility,
  p.published_at, p.updated_at, COALESCE(p.published_at, p.updated_at) AS sort_ts,
  u.name AS author_name, u.username AS author_username, u.avatar AS author_avatar`;

const author = (r: { author_name: string; author_username: string; author_avatar: string | null }) => ({
  name: r.author_name,
  username: r.author_username,
  avatar: r.author_avatar
});

function toPost(r: PostRow, viewerId: string | null) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    book_title: r.book_title,
    content: r.content,
    visibility: r.visibility,
    created_at: r.created_at,
    updated_at: r.updated_at,
    published_at: r.published_at,
    author: author(r),
    is_owner: viewerId !== null && r.author_id === viewerId
  };
}

function toSummary(r: SummaryRow) {
  return {
    id: r.id,
    type: r.type,
    title: r.title,
    book_title: r.book_title,
    excerpt: makeExcerpt(r.type, r.head),
    visibility: r.visibility,
    published_at: r.published_at,
    updated_at: r.updated_at,
    sort_ts: r.sort_ts,
    author: author(r)
  };
}

async function runSummaries(db: D1Database, sql: string, args: unknown[], limit: number) {
  const { results } = await db.prepare(sql).bind(...args).all<SummaryRow>();
  const more = results.length > limit;
  const rows = more ? results.slice(0, limit) : results;
  return { posts: rows.map(toSummary), next: more ? rows[rows.length - 1].sort_ts : null };
}

function bustFeed(c: Ctx): void {
  const env: Env = c.env;
  const keys = ['all', 'poem', 'story', 'book_part'].map((k) => `feed:${k}`);
  c.executionCtx.waitUntil(Promise.all(keys.map((k) => env.KV.delete(k))));
}

function requirePostId(id: string): void {
  if (!isValidId(id)) throw new HttpError(404, 'That piece could not be found.');
}

// Public discover feed.
posts.get('/posts', async (c) => {
  const type = parseTypeFilter(c.req.query('type'));
  const before = parseCursor(c.req.query('before'));
  const limit = parseLimit(c.req.query('limit'));
  const cacheKey = !before && limit === 20 ? `feed:${type ?? 'all'}` : null;

  if (cacheKey) {
    const hit = await c.env.KV.get(cacheKey);
    if (hit) return c.body(hit, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' });
  }

  let sql = `SELECT ${SUMMARY_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.visibility = 'public'`;
  const args: unknown[] = [];
  if (type) {
    sql += ' AND p.type = ?';
    args.push(type);
  }
  if (before) {
    sql += ' AND p.published_at < ?';
    args.push(before);
  }
  sql += ' ORDER BY p.published_at DESC LIMIT ?';
  args.push(limit + 1);

  const payload = await runSummaries(c.env.DB, sql, args, limit);
  if (cacheKey) {
    const text = JSON.stringify(payload);
    c.executionCtx.waitUntil(c.env.KV.put(cacheKey, text, { expirationTtl: 60 }));
    return c.body(text, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=15' });
  }
  return c.json(payload);
});

// A user's works. Owners see everything; everyone else sees public work only.
posts.get('/users/:username/posts', async (c) => {
  const username = c.req.param('username').replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) throw new HttpError(404, 'Profile not found.');
  const target = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
  if (!target) throw new HttpError(404, 'Profile not found.');

  const viewer = await loadUser(c);
  const isOwner = viewer?.id === target.id;
  const type = parseTypeFilter(c.req.query('type'));
  const before = parseCursor(c.req.query('before'));
  const limit = parseLimit(c.req.query('limit'));

  let sql = `SELECT ${SUMMARY_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.author_id = ?`;
  const args: unknown[] = [target.id];
  if (!isOwner) sql += " AND p.visibility = 'public'";
  if (type) {
    sql += ' AND p.type = ?';
    args.push(type);
  }
  if (before) {
    sql += ' AND COALESCE(p.published_at, p.updated_at) < ?';
    args.push(before);
  }
  sql += ' ORDER BY COALESCE(p.published_at, p.updated_at) DESC LIMIT ?';
  args.push(limit + 1);

  return c.json(await runSummaries(c.env.DB, sql, args, limit));
});

posts.get('/posts/:id', async (c) => {
  const id = c.req.param('id');
  requirePostId(id);
  const viewer = await loadUser(c);
  const row = await c.env.DB.prepare(
    `SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ?`
  )
    .bind(id)
    .first<PostRow>();
  // Non-public work answers 404 (not 403) for everyone except its author, so its existence never leaks.
  if (!row || (row.visibility !== 'public' && row.author_id !== viewer?.id)) {
    throw new HttpError(404, 'That piece could not be found.');
  }
  return c.json({ post: toPost(row, viewer?.id ?? null) });
});

posts.post('/posts', async (c) => {
  const user = await requireUser(c);
  await rateLimit(c, 'post-write', 60, 3600, user.id);
  const body = await readJson(c, MAX_POST_BODY);
  const input = validatePost({
    type: body.type,
    title: body.title,
    book_title: body.book_title,
    content: body.content,
    visibility: body.visibility
  });

  const id = newId(8);
  const now = Date.now();
  const publishedAt = input.visibility === 'draft' ? null : now;
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO posts (id, author_id, type, title, book_title, content, visibility, created_at, updated_at, published_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, user.id, input.type, input.title, input.book_title, input.content, input.visibility, now, now, publishedAt),
    c.env.DB.prepare('DELETE FROM drafts WHERE user_id = ? AND type = ? AND draft_key = ?').bind(
      user.id,
      input.type,
      parseDraftKey(body.draft_key)
    )
  ]);
  if (input.visibility === 'public') bustFeed(c);

  const row = await c.env.DB.prepare(
    `SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.author_id = ?`
  )
    .bind(id, user.id)
    .first<PostRow>();
  if (!row) throw new HttpError(500, 'Something went wrong. Please try again.');
  return c.json({ post: toPost(row, user.id) }, 201);
});

posts.patch('/posts/:id', async (c) => {
  const user = await requireUser(c);
  const id = c.req.param('id');
  requirePostId(id);
  await rateLimit(c, 'post-write', 60, 3600, user.id);
  const body = await readJson(c, MAX_POST_BODY);

  // The author check lives in the query itself, so another user's id can never match.
  const existing = await c.env.DB.prepare(
    `SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.author_id = ?`
  )
    .bind(id, user.id)
    .first<PostRow>();
  if (!existing) throw new HttpError(404, 'That piece could not be found.');
  if (body.type !== undefined && body.type !== existing.type) {
    throw new HttpError(422, 'The type of a piece cannot be changed.', 'type');
  }

  const input = validatePost({
    type: existing.type,
    title: body.title ?? existing.title,
    book_title: body.book_title ?? existing.book_title,
    content: body.content ?? existing.content,
    visibility: body.visibility ?? existing.visibility
  });

  const now = Date.now();
  const publishedAt = existing.published_at ?? (input.visibility === 'draft' ? null : now);
  const [update] = await c.env.DB.batch([
    c.env.DB.prepare(
      `UPDATE posts SET title = ?, book_title = ?, content = ?, visibility = ?, published_at = ?, updated_at = ?
       WHERE id = ? AND author_id = ?`
    ).bind(input.title, input.book_title, input.content, input.visibility, publishedAt, now, id, user.id),
    c.env.DB.prepare('DELETE FROM drafts WHERE user_id = ? AND type = ? AND draft_key = ?').bind(user.id, existing.type, id)
  ]);
  if (!update.meta.changes) throw new HttpError(404, 'That piece could not be found.');
  if (existing.visibility === 'public' || input.visibility === 'public') bustFeed(c);

  const row = await c.env.DB.prepare(
    `SELECT ${POST_COLS} FROM posts p JOIN users u ON u.id = p.author_id WHERE p.id = ? AND p.author_id = ?`
  )
    .bind(id, user.id)
    .first<PostRow>();
  if (!row) throw new HttpError(404, 'That piece could not be found.');
  return c.json({ post: toPost(row, user.id) });
});

posts.delete('/posts/:id', async (c) => {
  const user = await requireUser(c);
  const id = c.req.param('id');
  requirePostId(id);
  const result = await c.env.DB.prepare('DELETE FROM posts WHERE id = ? AND author_id = ?').bind(id, user.id).run();
  if (!result.meta.changes) throw new HttpError(404, 'That piece could not be found.');
  await c.env.DB.prepare('DELETE FROM drafts WHERE user_id = ? AND draft_key = ?').bind(user.id, id).run();
  bustFeed(c);
  return c.json({ ok: true });
});

export default posts;
