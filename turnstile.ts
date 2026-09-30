import type { Ctx } from '../types';
import { HttpError } from './http';

/** Verifies a Turnstile token. Skipped only when TURNSTILE_SECRET is not configured. */
export async function verifyTurnstile(c: Ctx, token: unknown): Promise<void> {
  const secret = c.env.TURNSTILE_SECRET;
  if (!secret) return;
  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    throw new HttpError(400, 'Please complete the verification challenge.');
  }
  const form = new FormData();
  form.append('secret', secret);
  form.append('response', token);
  const ip = c.req.header('CF-Connecting-IP');
  if (ip) form.append('remoteip', ip);

  let ok = false;
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: form
    });
    const data = (await res.json()) as { success?: boolean };
    ok = data.success === true;
  } catch {
    throw new HttpError(503, 'Verification is unavailable right now. Please try again shortly.');
  }
  if (!ok) throw new HttpError(400, 'Verification failed. Please try again.');
}
