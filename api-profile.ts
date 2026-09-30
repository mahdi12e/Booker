import { Hono } from 'hono';
import type { AppEnv } from './types';
import { HttpError, readJson } from './http';
import { rateLimit } from './ratelimit';
import { getSelf, loadUser, requireUser } from './session';
import { parseBio, parseName, parseUsername } from './validate';
import { uniqueViolation } from './auth';

const profile = new Hono<AppEnv>();

/**
 * Get a public profile
 *
 * GET /api/profile/:username
 */
profile.get('/profile/:username', async (c) => {
  const username = c.req
    .param('username')
    .replace(/^@/, '')
    .toLowerCase();

  if (!/^[a-z][a-z0-9_]{2,19}$/.test(username)) {
    throw new HttpError(404, 'Profile not found.');
  }

  const user = await c.env.DB.prepare(
    `
    SELECT
      id,
      name,
      username,
      bio,
      created_at
    FROM users
    WHERE username = ?
    `
  )
    .bind(username)
    .first<{
      id: string;
      name: string;
      username: string;
      bio: string;
      created_at: number;
    }>();

  if (!user) {
    throw new HttpError(404, 'Profile not found.');
  }

  const { results } = await c.env.DB.prepare(
    `
    SELECT
      type,
      COUNT(*) AS n
    FROM posts
    WHERE author_id = ?
      AND visibility = 'public'
    GROUP BY type
    `
  )
    .bind(user.id)
    .all<{
      type: string;
      n: number;
    }>();

  const counts: Record<string, number> = {
    poem: 0,
    story: 0,
    book_part: 0
  };

  for (const row of results) {
    counts[row.type] = row.n;
  }

  const me = await loadUser(c);

  return c.json({
    profile: {
      name: user.name,
      username: user.username,
      bio: user.bio,

      // R2/avatar removed.
      avatar: null,

      created_at: user.created_at,
      counts
    },

    is_me: me?.id === user.id
  });
});


/**
 * Update current user's profile
 *
 * PATCH /api/profile
 */
profile.patch('/profile', async (c) => {
  const user = await requireUser(c);

  await rateLimit(
    c,
    'profile-edit',
    30,
    3600,
    user.id
  );

  const body = await readJson(c, 8 * 1024);

  const name =
    body.name !== undefined
      ? parseName(body.name)
      : user.name;

  const bio =
    body.bio !== undefined
      ? parseBio(body.bio)
      : user.bio;

  let username = user.username;

  if (body.username !== undefined) {
    const requested = parseUsername(body.username);

    if (requested !== user.username) {
      await rateLimit(
        c,
        'username-change',
        5,
        86400,
        user.id
      );

      username = requested;
    }
  }

  try {
    await c.env.DB.prepare(
      `
      UPDATE users
      SET
        name = ?,
        username = ?,
        bio = ?,
        updated_at = ?
      WHERE id = ?
      `
    )
      .bind(
        name,
        username,
        bio,
        Date.now(),
        user.id
      )
      .run();
  } catch (e) {
    throw uniqueViolation(e) ?? e;
  }

  return c.json({
    user: await getSelf(c.env.DB, user.id)
  });
});


export default profile;