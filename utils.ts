import type { Post, PostSummary, PostType } from './types';

export const TYPE_NAME: Record<PostType, string> = {
  poem: 'Poem',
  story: 'Story',
  book_part: 'Book Part'
};

export const TYPE_PLURAL: Record<PostType, string> = {
  poem: 'Poems',
  story: 'Stories',
  book_part: 'Book Parts'
};

export function formatDate(ts: number | null | undefined): string {
  if (!ts) return '';
  return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

export function countWords(s: string): number {
  const t = s.trim();
  return t ? t.split(/\s+/).length : 0;
}

export function makeExcerpt(type: PostType, head: string): string {
  if (type === 'poem') {
    const kept = head.split('\n').slice(0, 8).join('\n').slice(0, 420);
    return kept.length < head.length ? `${kept.trimEnd()} …` : kept;
  }
  const flat = head.replace(/\s+/g, ' ').trim();
  if (flat.length <= 280) return flat + (head.length >= 1500 ? ' …' : '');
  const cut = flat.slice(0, 280);
  const space = cut.lastIndexOf(' ');
  return `${(space > 200 ? cut.slice(0, space) : cut).trimEnd()} …`;
}

export function toSummary(p: Post): PostSummary {
  return {
    id: p.id,
    type: p.type,
    title: p.title,
    book_title: p.book_title,
    excerpt: makeExcerpt(p.type, p.content.slice(0, 1500)),
    visibility: p.visibility,
    published_at: p.published_at,
    updated_at: p.updated_at,
    sort_ts: p.published_at ?? p.updated_at,
    author: p.author
  };
}

export const USERNAME_RE = /^[a-z][a-z0-9_]{2,19}$/;
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
