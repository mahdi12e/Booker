import { Hono } from 'hono';
import type { AppEnv } from '../types';
import { HttpError, readJson } from '../lib/http';
import { newId } from '../lib/crypto';
import { rateLimit } from '../lib/ratelimit';
import { getSelf, loadUser, requireUser } from '../lib/session';
import { parseBio, parseName, parseUsername } from '../lib/validate';
import { uniqueViolation } from './auth';

const profile = new Hono<AppEnv>();

const AVATAR_PREFIX = '/api/avatars/';
const MAX_AVATAR_BYTES = 2_000_000;

function sniffImage(b: Uint8Array): { type: string; ext: string } | null {
  if (b.length > 12 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { type: 'image/png', ext: 'png' };
  }
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { type: 'image/jpeg', ext: 'jpg' };
  if (
    b.length > 12 &&
    b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
    b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50
  ) {
    return { type: 'image/webp', ext: 'webp' };
  }
  return null;
}

async function deleteOldAvatar(c: Parameters<typeof requireUser>[0], userId: string, avatar: string | null) {
  if (!avatar || !avatar.startsWith(AVATAR_PREFIX)) return;
  const key = `avatars/${avatar.slice(AVATAR_PREFIX.length)}`;
  if (key.startsWith(`avatars/${userId}/`)) await c.env.AVATARS.delete(key);
}

profile.get('/profile/:username', async (c) => {
  const username = c.req.param('username').replace(/^@/, '').toLowerCase();
  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) throw new HttpError(404, 'Profile not found.');

  const user = await c.env.DB.prepare(
    'SELECT id, name, username, bio, avatar, created_at FROM users WHERE username = ?'
  )
    .bind(username)
    .first<{ id: string; name: string; username: string; bio: string; avatar: string | null; created_at: number }>();
  if (!user) throw new HttpError(404, 'Profile not found.');

  const { results } = await c.env.DB.prepare(
    "SELECT type, COUNT(*) AS n FROM posts WHERE author_id = ? AND visibility = 'public' GROUP BY type"
  )
    .bind(user.id)
    .all<{ type: string; n: number }>();
  const counts = { poem: 0, story: 0, book_part: 0 } as Record<string, number>;
  for (const r of results) counts[r.type] = r.n;

  const me = await loadUser(c);
  return c.json({
    profile: {
      name: user.name,
      username: user.username,
      bio: user.bio,
      avatar: user.avatar,
      created_at: user.created_at,
      counts
    },
    is_me: me?.id === user.id
  });
});

profile.patch('/profile', async (c) => {
  const user = await requireUser(c);
  await rateLimit(c, 'profile-edit', 30, 3600, user.id);
  const body = await readJson(c, 8 * 1024);

  const name = body.name !== undefined ? parseName(body.name) : user.name;
  const bio = body.bio !== undefined ? parseBio(body.bio) : user.bio;
  let username = user.username;
  if (body.username !== undefined) {
    const requested = parseUsername(body.username);
    if (requested !== user.username) {
      await rateLimit(c, 'username-change', 5, 86400, user.id);
      username = requested;
    }
  }

  try {
    await c.env.DB.prepare('UPDATE users SET name = ?, username = ?, bio = ?, updated_at = ? WHERE id = ?')
      .bind(name, username, bio, Date.now(), user.id)
      .run();
  } catch (e) {
    throw uniqueViolation(e) ?? e;
  }
  return c.json({ user: await getSelf(c.env.DB, user.id) });
});

profile.post('/profile/avatar', async (c) => {
  const user = await requireUser(c);
  await rateLimit(c, 'avatar', 10, 3600, user.id);

  const declared = Number(c.req.header('content-length') ?? '0');
  if (!declared || declared > MAX_AVATAR_BYTES + 100_000) {
    throw new HttpError(413, 'That image is too large. The limit is 2 MB.');
  }
  const form = await c.req.formData().catch(() => null);
  const file = form?.get('avatar');
  if (!(file instanceof File)) throw new HttpError(422, 'Choose an image to upload.', 'avatar');
  if (file.size > MAX_AVATAR_BYTES) throw new HttpError(413, 'That image is too large. The limit is 2 MB.');

  const bytes = new Uint8Array(await file.arrayBuffer());
  const kind = sniffImage(bytes);
  if (!kind) throw new HttpError(415, 'Use a PNG, JPEG or WebP image.', 'avatar');

  const key = `${user.id}/${newId(9)}.${kind.ext}`;
  await c.env.AVATARS.put(`avatars/${key}`, bytes, { httpMetadata: { contentType: kind.type } });
  const url = `${AVATAR_PREFIX}${key}`;
  await c.env.DB.prepare('UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?').bind(url, Date.now(), user.id).run();
  await deleteOldAvatar(c, user.id, user.avatar);
  return c.json({ avatar: url });
});

profile.delete('/profile/avatar', async (c) => {
  const user = await requireUser(c);
  await c.env.DB.prepare('UPDATE users SET avatar = NULL, updated_at = ? WHERE id = ?').bind(Date.now(), user.id).run();
  await deleteOldAvatar(c, user.id, user.avatar);
  return c.json({ ok: true });
});

profile.get('/avatars/:uid/:file', async (c) => {
  const { uid, file } = c.req.param();
  if (!/^[A-Za-z0-9_-]{16,32}$/.test(uid) || !/^[A-Za-z0-9_-]{6,24}\.(png|jpg|webp)$/.test(file)) {
    return c.json({ error: 'Not found.' }, 404);
  }
  const object = await c.env.AVATARS.get(`avatars/${uid}/${file}`);
  if (!object) return c.json({ error: 'Not found.' }, 404);
  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  headers.set('Content-Security-Policy', "default-src 'none'; sandbox");
  return new Response(object.body, { headers });
});

export default profile;
