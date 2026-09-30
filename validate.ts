import { HttpError } from './http';

export const POST_TYPES = ['poem', 'story', 'book_part'] as const;
export type PostType = (typeof POST_TYPES)[number];
export const VISIBILITIES = ['public', 'private', 'draft'] as const;
export type Visibility = (typeof VISIBILITIES)[number];

export const TITLE_MAX = 150;
export const BIO_MAX = 500;
export const CONTENT_MAX: Record<PostType, number> = {
  poem: 20_000,
  story: 150_000,
  book_part: 250_000
};
/** 250k characters of 4-byte UTF-8 plus JSON overhead. */
export const MAX_POST_BODY = 1_200_000;

const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const ID_RE = /^[A-Za-z0-9_-]{6,32}$/;

export const RESERVED_USERNAMES = new Set([
  'admin', 'administrator', 'api', 'app', 'auth', 'about', 'help', 'support', 'root', 'system',
  'login', 'logout', 'register', 'signup', 'signin', 'settings', 'write', 'discover', 'explore',
  'home', 'profile', 'post', 'posts', 'me', 'user', 'users', 'null', 'undefined', 'marginalia',
  'staff', 'moderator', 'terms', 'privacy', 'static', 'assets'
]);

/** Normalises newlines and strips control and bidi-override characters. */
export function cleanText(s: string): string {
  return s
    .normalize('NFC')
    .replace(/\r\n?/g, '\n')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F\u200B\u200E\u200F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g, '');
}

function str(v: unknown, field: string, label: string): string {
  if (typeof v !== 'string') throw new HttpError(422, `${label} is required.`, field);
  return v;
}

export function parseName(v: unknown): string {
  const s = cleanText(str(v, 'name', 'Name')).replace(/\s+/g, ' ').trim();
  if (s.length < 1 || s.length > 60) throw new HttpError(422, 'Name must be 1 to 60 characters.', 'name');
  return s;
}

export function usernameProblem(raw: string): string | null {
  const u = raw.trim().toLowerCase();
  if (!USERNAME_RE.test(u)) {
    return 'Use 3 to 20 characters: letters, numbers and underscores, starting with a letter.';
  }
  if (RESERVED_USERNAMES.has(u)) return 'That username is reserved.';
  return null;
}

export function parseUsername(v: unknown): string {
  const u = str(v, 'username', 'Username').trim().toLowerCase();
  const problem = usernameProblem(u);
  if (problem) throw new HttpError(422, problem, 'username');
  return u;
}

export function parseEmail(v: unknown): string {
  const e = str(v, 'email', 'Email').trim().toLowerCase();
  if (e.length > 254 || !EMAIL_RE.test(e)) throw new HttpError(422, 'Enter a valid email address.', 'email');
  return e;
}

export function parsePassword(v: unknown, field = 'password'): string {
  const p = str(v, field, 'Password');
  if (p.length < 8) throw new HttpError(422, 'Password must be at least 8 characters.', field);
  if (p.length > 128) throw new HttpError(422, 'Password must be 128 characters or fewer.', field);
  if (p.trim().length === 0) throw new HttpError(422, 'Password cannot be only spaces.', field);
  return p;
}

export function parseBio(v: unknown): string {
  const b = cleanText(typeof v === 'string' ? v : '').trim();
  if (b.length > BIO_MAX) throw new HttpError(422, `Bio must be ${BIO_MAX} characters or fewer.`, 'bio');
  return b;
}

export interface ValidPost {
  type: PostType;
  title: string;
  book_title: string | null;
  content: string;
  visibility: Visibility;
}

export function validatePost(input: {
  type: unknown;
  title: unknown;
  book_title: unknown;
  content: unknown;
  visibility: unknown;
}): ValidPost {
  if (!POST_TYPES.includes(input.type as PostType)) throw new HttpError(422, 'Choose a valid content type.', 'type');
  if (!VISIBILITIES.includes(input.visibility as Visibility)) {
    throw new HttpError(422, 'Choose who can see this.', 'visibility');
  }
  const type = input.type as PostType;
  const visibility = input.visibility as Visibility;

  const title = cleanText(str(input.title, 'title', 'Title')).replace(/\s+/g, ' ').trim();
  if (title.length < 1 || title.length > TITLE_MAX) {
    throw new HttpError(422, `Title must be 1 to ${TITLE_MAX} characters.`, 'title');
  }

  let bookTitle: string | null = null;
  if (type === 'book_part') {
    bookTitle = cleanText(str(input.book_title, 'book_title', 'Book title')).replace(/\s+/g, ' ').trim();
    if (bookTitle.length < 1 || bookTitle.length > TITLE_MAX) {
      throw new HttpError(422, `Book title must be 1 to ${TITLE_MAX} characters.`, 'book_title');
    }
  }

  const raw = input.content === undefined || input.content === null ? '' : input.content;
  const content = cleanText(str(raw, 'content', 'Content')).replace(/^(\s*\n)+/, '').replace(/\s+$/, '');
  if (visibility !== 'draft' && content.trim().length === 0) {
    throw new HttpError(422, 'Content cannot be empty.', 'content');
  }
  if (content.length > CONTENT_MAX[type]) {
    throw new HttpError(422, `That is longer than the ${CONTENT_MAX[type].toLocaleString('en-US')} character limit.`, 'content');
  }
  return { type, title, book_title: bookTitle, content, visibility };
}

export function isValidId(v: string): boolean {
  return ID_RE.test(v);
}

export function parseDraftKey(v: unknown): string {
  return typeof v === 'string' && (v === 'new' || ID_RE.test(v)) ? v : 'new';
}

export function parseTypeFilter(v: string | undefined): PostType | null {
  return v && POST_TYPES.includes(v as PostType) ? (v as PostType) : null;
}

export function parseLimit(v: string | undefined, fallback = 20): number {
  const n = parseInt(v ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(Math.max(n, 1), 30);
}

export function parseCursor(v: string | undefined): number | null {
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}
