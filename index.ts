import { Hono } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppEnv, Env } from './types';
import { HttpError } from './lib/http';
import { csrf, securityHeaders } from './lib/middleware';
import auth from './routes/auth';
import google from './routes/google';
import profile from './routes/profile';
import posts from './routes/posts';
import drafts from './routes/drafts';

const app = new Hono<AppEnv>();

app.use('*', securityHeaders);
app.use('/api/*', csrf);

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api', auth);
app.route('/api', google);
app.route('/api', profile);
app.route('/api', posts);
app.route('/api', drafts);

app.notFound((c) => c.json({ error: 'Not found.' }, 404));

app.onError((err, c) => {
  if (err instanceof HttpError) {
    return c.json({ error: err.message, field: err.field }, err.status as ContentfulStatusCode);
  }
  // Details go to the Worker logs only, never to the client.
  console.error('Unhandled error', err);
  return c.json({ error: 'Something went wrong. Please try again.' }, 500);
});

export default {
  fetch: app.fetch,
  // Daily cleanup: expired sessions and autosave buffers untouched for 90 days.
  async scheduled(_event, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(
      env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
        env.DB.prepare('DELETE FROM drafts WHERE updated_at < ?').bind(now - 90 * 24 * 60 * 60 * 1000)
      ])
    );
  }
} satisfies ExportedHandler<Env>;
