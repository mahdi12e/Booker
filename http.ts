import type { Ctx } from '../types';

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
    public field?: string
  ) {
    super(message);
  }
}

/** Reads a JSON object body, enforcing a hard byte limit while streaming. */
export async function readJson(c: Ctx, maxBytes: number): Promise<Record<string, unknown>> {
  const declared = Number(c.req.header('content-length') ?? '0');
  if (declared > maxBytes) throw new HttpError(413, 'That request is too large.');
  const reader = c.req.raw.body?.getReader();
  if (!reader) throw new HttpError(400, 'The request body is missing.');

  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw new HttpError(413, 'That request is too large.');
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(merged));
  } catch {
    throw new HttpError(400, 'The request body is not valid JSON.');
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new HttpError(400, 'The request body must be a JSON object.');
  }
  return parsed as Record<string, unknown>;
}

export function isSecure(appUrl: string): boolean {
  return appUrl.startsWith('https://');
}
