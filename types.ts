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
