import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api';
import Avatar from './Avatar';
import NotFound from './NotFound';
import type { Post } from './types';
import { TYPE_NAME, formatDate } from './utils';

export default function PostPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [post, setPost] = useState<Post | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [note, setNote] = useState('');

  useEffect(() => {
    let dead = false;
    setStatus('loading');
    api
      .get<{ post: Post }>(`/api/posts/${encodeURIComponent(id ?? '')}`)
      .then((d) => {
        if (dead) return;
        setPost(d.post);
        setStatus('ready');
        document.title = `${d.post.title} by ${d.post.author.name} · Marginalia`;
      })
      .catch((e) => {
        if (dead) return;
        setStatus(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
      });
    return () => {
      dead = true;
    };
  }, [id]);

  useEffect(() => {
    if (!note) return;
    const t = window.setTimeout(() => setNote(''), 3000);
    return () => window.clearTimeout(t);
  }, [note]);

  if (status === 'loading') return <div className="page-loading" role="status">Loading…</div>;
  if (status === 'missing') return <NotFound />;
  if (status === 'error' || !post) {
    return (
      <div className="page page--narrow empty" role="alert">
        <p>We could not load this piece.</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const share = async () => {
    const url = `${window.location.origin}/post/${post.id}`;
    try {
      if (navigator.share) await navigator.share({ title: post.title, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote('Link copied.');
      }
    } catch {
      /* the share sheet was dismissed */
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this piece for good? This cannot be undone.')) return;
    try {
      await api.del(`/api/posts/${post.id}`);
      nav(`/@${post.author.username}`, { replace: true });
    } catch (e) {
      setNote(errorMessage(e));
    }
  };

  const date = formatDate(post.published_at ?? post.updated_at);
  const paragraphs = post.content.split(/\n{2,}/);

  return (
    <div className="page page--reading">
      <article className={`reading reading--${post.type}`}>
        <header className="reading__head">
          <p className="card__tags">
            <span className="tag">{TYPE_NAME[post.type]}</span>
            {post.visibility !== 'public' && <span className="tag tag--warn">{post.visibility === 'draft' ? 'Draft' : 'Private'}</span>}
          </p>
          {post.type === 'book_part' && <p className="reading__book">{post.book_title}</p>}
          <h1>{post.title}</h1>
          <p className="byline">
            <Avatar name={post.author.name} src={post.author.avatar} size={32} />
            <Link to={`/@${post.author.username}`}>{post.author.name}</Link>
            <span className="muted">@{post.author.username}</span>
            <time className="muted" dateTime={new Date(post.published_at ?? post.updated_at).toISOString()}>
              {post.visibility === 'draft' ? `Saved ${date}` : date}
            </time>
          </p>
        </header>

        <div className="reading__body">
          {post.type === 'poem' ? (
            <div className="poem-text">{post.content}</div>
          ) : (
            paragraphs.map((p, i) => <p key={i}>{p}</p>)
          )}
        </div>

        <footer className="reading__foot">
          {post.visibility === 'public' && (
            <button type="button" className="btn" onClick={share}>
              Share
            </button>
          )}
          {post.is_owner && (
            <>
              <Link className="btn" to={`/write?edit=${post.id}`}>
                Edit
              </Link>
              <button type="button" className="btn btn--danger" onClick={remove}>
                Delete
              </button>
            </>
          )}
        </footer>
      </article>
      {note && (
        <div className="toast" role="status">
          {note}
        </div>
      )}
    </div>
  );
}
