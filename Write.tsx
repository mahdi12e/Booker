import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError } from './api';
import { useAuth } from './client-auth';
import Composer from './Composer';
import type { Post, PostType } from './types';

export default function Write() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [params] = useSearchParams();
  const editId = params.get('edit');
  const [type, setType] = useState<PostType>('poem');
  const [post, setPost] = useState<Post | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');

  useEffect(() => {
    if (!editId) { setState('ready'); return; }
    let dead = false;
    api.get<{ post: Post }>(`/api/posts/${encodeURIComponent(editId)}`)
      .then(({ post: p }) => { if (!dead) { setPost(p); setType(p.type); setState('ready'); } })
      .catch((e) => { if (!dead) setState(e instanceof ApiError && e.status === 404 ? 'missing' : 'error'); });
    return () => { dead = true; };
  }, [editId]);

  if (loading) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: editId ? `/write?edit=${editId}` : '/write' }} />;
  if (state === 'loading') return <div className="page-loading" role="status">Loading editor…</div>;
  if (state === 'missing') return <div className="page page--narrow empty"><p>That piece could not be found.</p></div>;
  if (state === 'error') return <div className="page page--narrow empty"><p>We could not load the editor.</p></div>;

  return (
    <div className="page page--reading">
      <header className="page__head">
        <h1>{post ? 'Edit your writing' : 'Write'}</h1>
        {!post && (
          <div className="filters" role="group" aria-label="Choose type">
            {(['poem', 'story', 'book_part'] as PostType[]).map((v) => (
              <button key={v} type="button" className="chip" aria-pressed={type === v} onClick={() => setType(v)}>
                {v === 'book_part' ? 'Book Part' : v[0].toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
        )}
      </header>
      <Composer type={type} post={post} onSaved={(p, kind) => {
        if (kind === 'published' || kind === 'updated') nav(`/post/${p.id}`);
      }} />
    </div>
  );
}
