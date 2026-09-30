import type { MiddlewareHandler } from 'hono';
import type { AppEnv } from './types';
import { HttpError } from './http';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const securityHeaders: MiddlewareHandler<AppEnv> = async (c, next) => {
  await next();
  c.res.headers.set('X-Content-Type-Options', 'nosniff');
  c.res.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  c.res.headers.set('X-Frame-Options', 'DENY');
  if (!c.res.headers.has('Cache-Control')) c.res.headers.set('Cache-Control', 'no-store');
};

/**
 * CSRF defence for cookie sessions: every state-changing request must come from
 * our own origin AND carry a custom header that cross-site forms cannot set.
 */
export const csrf: MiddlewareHandler<AppEnv> = async (c, next) => {
  if (!SAFE_METHODS.has(c.req.method)) {
    const allowed = new URL(c.env.APP_URL).origin;
    if (c.req.header('Origin') !== allowed || c.req.header('X-Requested-With') !== 'fetch') {
      throw new HttpError(403, 'This request was blocked for your safety. Reload the page and try again.');
    }
  }
  await next();
};
