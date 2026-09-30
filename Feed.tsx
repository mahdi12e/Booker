import { useCallback, useEffect, useRef, useState } from 'react';
import { api, errorMessage } from './api';
import type { PostSummary, PostType } from './types';
import PostCard from './PostCard';

export default function Feed({ type }: { type: PostType | null }) {
  const [items, setItems] = useState<PostSummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [more, setMore] = useState(false);
  const [error, setError] = useState('');
  const reqId = useRef(0);

  const load = useCallback(
    async (before?: number) => {
      const id = ++reqId.current;
      const params = new URLSearchParams();
      if (type) params.set('type', type);
      if (before) params.set('before', String(before));
      if (before) setMore(true);
      else setState('loading');
      try {
        const d = await api.get<{ posts: PostSummary[]; next: number | null }>(`/api/posts?${params.toString()}`);
        if (id !== reqId.current) return;
        setItems((prev) => (before ? [...prev, ...d.posts] : d.posts));
        setNext(d.next);
        setState('ready');
      } catch (e) {
        if (id !== reqId.current) return;
        setError(errorMessage(e));
        setState('error');
      } finally {
        if (id === reqId.current) setMore(false);
      }
    },
    [type]
  );

  useEffect(() => {
    setItems([]);
    void load();
  }, [load]);

  if (state === 'loading') {
    return (
      <div className="feed" aria-busy="true" role="status" aria-label="Loading writing">
        {[0, 1, 2].map((i) => (
          <div className="card card--skeleton" key={i} />
        ))}
      </div>
    );
  }
  if (state === 'error') {
    return (
      <div className="empty" role="alert">
        <p>{error}</p>
        <button type="button" className="btn" onClick={() => void load()}>
          Try again
        </button>
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="empty">
        <h2>Nothing here yet</h2>
        <p>No one has published in this category. Be the first to put something on the page.</p>
      </div>
    );
  }
  return (
    <>
      <div className="feed">
        {items.map((p) => (
          <PostCard key={p.id} post={p} />
        ))}
      </div>
      {next && (
        <div className="more">
          <button type="button" className="btn" disabled={more} onClick={() => void load(next)}>
            {more ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </>
  );
}
