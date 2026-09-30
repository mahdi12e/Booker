import type { Context } from 'hono';

export interface Env {
  DB: D1Database;
  KV: KVNamespace;
  APP_URL: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  TURNSTILE_SECRET?: string;
}

export interface SessionUser {
  id: string;
  name: string;
  username: string;
  email: string;
  bio: string;
  avatar: string | null;
  created_at: number;
  has_password: boolean;
  google_linked: boolean;
}

export type AppEnv = {
  Bindings: Env;
  Variables: {
    user?: SessionUser | null;
    userLoaded?: boolean;
  };
};

export type Ctx = Context<AppEnv>;


/* Frontend domain types */
export type SelfUser = SessionUser;

export type PostType = 'poem' | 'story' | 'book_part';
export type Visibility = 'public' | 'private' | 'draft';

export interface PostAuthor {
  id?: string;
  name: string;
  username: string;
  avatar: string | null;
}

export interface Post {
  id: string;
  author_id?: string;
  type: PostType;
  title: string;
  book_title: string | null;
  content: string;
  visibility: Visibility;
  created_at: number;
  updated_at: number;
  published_at: number | null;
  author: PostAuthor;
  is_owner?: boolean;
}

export interface PostSummary {
  id: string;
  type: PostType;
  title: string;
  book_title: string | null;
  excerpt: string;
  visibility: Visibility;
  published_at: number | null;
  updated_at: number;
  sort_ts?: number;
  author: PostAuthor;
}

export interface ProfileData {
  name: string;
  username: string;
  bio: string;
  avatar: string | null;
  created_at: number;
  counts: {
    poem: number;
    story: number;
    book_part: number;
    [key: string]: number;
  };
}
