-- Core schema: users, sessions, posts, drafts.
-- Timestamps are unix epoch milliseconds (INTEGER).

CREATE TABLE users (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL CHECK (length(name) BETWEEN 1 AND 60),
  username      TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (length(username) BETWEEN 3 AND 20),
  email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT,
  google_id     TEXT UNIQUE,
  bio           TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 500),
  avatar        TEXT,
  created_at    INTEGER NOT NULL,
  updated_at    INTEGER NOT NULL,
  CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL)
);

CREATE TABLE sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  user_agent TEXT
);
CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

CREATE TABLE posts (
  id           TEXT PRIMARY KEY,
  author_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL CHECK (type IN ('poem', 'story', 'book_part')),
  title        TEXT NOT NULL CHECK (length(title) BETWEEN 1 AND 150),
  book_title   TEXT CHECK (book_title IS NULL OR length(book_title) BETWEEN 1 AND 150),
  content      TEXT NOT NULL DEFAULT '',
  visibility   TEXT NOT NULL CHECK (visibility IN ('public', 'private', 'draft')),
  created_at   INTEGER NOT NULL,
  updated_at   INTEGER NOT NULL,
  published_at INTEGER,
  CHECK ((type = 'book_part') = (book_title IS NOT NULL)),
  CHECK (visibility = 'draft' OR published_at IS NOT NULL)
);
CREATE INDEX idx_posts_author_vis   ON posts(author_id, visibility, published_at DESC);
CREATE INDEX idx_posts_author_upd   ON posts(author_id, updated_at DESC);
CREATE INDEX idx_posts_feed         ON posts(visibility, published_at DESC);
CREATE INDEX idx_posts_feed_type    ON posts(visibility, type, published_at DESC);

-- Autosave buffer. draft_key is 'new' for an unsaved piece, or a post id when editing one.
CREATE TABLE drafts (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type       TEXT NOT NULL CHECK (type IN ('poem', 'story', 'book_part')),
  draft_key  TEXT NOT NULL,
  title      TEXT NOT NULL DEFAULT '',
  book_title TEXT,
  content    TEXT NOT NULL DEFAULT '',
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, type, draft_key)
);
CREATE INDEX idx_drafts_updated ON drafts(updated_at);
