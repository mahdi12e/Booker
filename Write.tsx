import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../api';
import { useAuth } from '../auth';
import Composer from '../components/Composer';
import Wheel from '../components/Wheel';
import type { Post, PostType } from '../types';
import { TYPE_NAME } from '../utils';

export default function Write() {
  const { user, loading } = useAuth();
  const [sp] = useSearchParams();
  const nav = useNavigate();
  const editId = sp.get('edit');

  const [type, setType] = useState<PostType>('poem');
  const [post, setPost] = useState<Post | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');

  useEffect(() => {
    document.title = `${editId ? 'Edit' : 'Write'} · Marginalia`;
  }, [editId]);

  useEffect(() => {
    if (!editId || !user) {
      setPost(null);
      return;
    }
    let dead = false;
    setStatus('loading');
    api
      .get<{ post: Post }>(`/api/posts/${encodeURIComponent(editId)}`)
      .then((d) => {
        if (dead) return;
        if (!d.post.is_owner) {
          setError('You can only edit your own writing.');
          setStatus('error');
          return;
        }
        setPost(d.post);
        setType(d.post.type);
        setStatus('idle');
      })
      .catch((e) => {
        if (dead) return;
        setError(errorMessage(e));
        setStatus('error');
      });
    return () => {
      dead = true;
    };
  }, [editId, user]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  if (loading) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: `/write${editId ? `?edit=${editId}` : ''}` }} />;

  if (editId && status === 'loading') return <div className="page-loading" role="status">Loading your piece…</div>;
  if (editId && status === 'error') {
    return (
      <div className="page page--narrow empty" role="alert">
        <p>{error}</p>
        <Link className="btn" to={`/@${user.username}`}>
          Back to your profile
        </Link>
      </div>
    );
  }

  const onSaved = (saved: Post, kind: 'published' | 'draft' | 'updated') => {
    if (kind === 'draft') setToast('Draft saved.');
    else nav(`/post/${saved.id}`);
  };

  return (
    <div className="page page--write">
      <header className="page__head">
        <div>
          <h1>{post ? `Edit ${TYPE_NAME[post.type].toLowerCase()}` : 'Write'}</h1>
          <p className="muted">{post ? 'Your changes are autosaved as you type.' : 'Turn the dial to choose what you are writing.'}</p>
        </div>
      </header>
      {!post && <Wheel value={type} onChange={setType} label="Choose what to write" />}
      <Composer key={post ? post.id : type} type={type} post={post} onSaved={onSaved} />
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </div>
  );
}
