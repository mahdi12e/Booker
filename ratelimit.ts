import type { Ctx } from './types';
import { HttpError } from './http';

/**
 * Fixed-window limiter on KV. KV is eventually consistent and not atomic, so this is a
 * best-effort brake against abuse, not an exact counter. Add a Cloudflare WAF rate-limiting
 * rule for hard guarantees on /api/auth/*.
 */
export async function rateLimit(
  c: Ctx,
  name: string,
  limit: number,
  windowSec: number,
  key?: string
): Promise<void> {
  const subject = (key ?? c.req.header('CF-Connecting-IP') ?? 'unknown').slice(0, 120);
  const bucket = Math.floor(Date.now() / (windowSec * 1000));
  const kvKey = `rl:${name}:${subject}:${bucket}`;
  const current = parseInt((await c.env.KV.get(kvKey)) ?? '0', 10) || 0;
  if (current >= limit) {
    throw new HttpError(429, 'Too many attempts. Please wait a little while and try again.');
  }
  await c.env.KV.put(kvKey, String(current + 1), { expirationTtl: Math.max(windowSec, 60) });
}
