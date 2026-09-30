import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api';
import { useAuth } from './client-auth';
import Avatar from './Avatar';
import Composer from './Composer';
import EditProfile from './EditProfile';
import PostCard from './PostCard';
import Wheel from './Wheel';
import NotFound from './NotFound';
import type { Post, PostSummary, PostType, ProfileData } from './types';
import { TYPE_NAME, TYPE_PLURAL, formatDate, toSummary } from './utils';

export default function ProfilePage() {
  const { handle, username: routeUsername } = useParams();
  const username = (routeUsername ?? (handle?.startsWith('@') ? handle.slice(1) : '')).toLowerCase();
  const { user: me } = useAuth();
  const nav = useNavigate();

  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [isMe, setIsMe] = useState(false);
  const [status, setStatus] = useState<'loading' | 'ready' | 'missing' | 'error'>('loading');
  const [type, setType] = useState<PostType>('poem');
  const [showAll, setShowAll] = useState(false);
  const [editing, setEditing] = useState(false);
  const [composerKey, setComposerKey] = useState(0);
  const [toast, setToast] = useState('');

  const [items, setItems] = useState<PostSummary[]>([]);
  const [next, setNext] = useState<number | null>(null);
  const [listState, setListState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [listError, setListError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const reqId = useRef(0);

  useEffect(() => {
    if (!username) {
      setStatus('missing');
      return;
    }
    let dead = false;
    setStatus('loading');
    api
      .get<{ profile: ProfileData; is_me: boolean }>(`/api/profile/${encodeURIComponent(username)}`)
      .then((d) => {
        if (dead) return;
        setProfile(d.profile);
        setIsMe(d.is_me);
        setStatus('ready');
        document.title = `${d.profile.name} (@${d.profile.username}) · Marginalia`;
      })
      .catch((e) => {
        if (dead) return;
        setStatus(e instanceof ApiError && e.status === 404 ? 'missing' : 'error');
      });
    return () => {
      dead = true;
    };
  }, [username, me?.username]);

  const loadWorks = useCallback(
    async (before?: number) => {
      const id = ++reqId.current;
      const params = new URLSearchParams();
      if (!showAll) params.set('type', type);
      if (before) params.set('before', String(before));
      if (before) setLoadingMore(true);
      else setListState('loading');
      try {
        const d = await api.get<{ posts: PostSummary[]; next: number | null }>(
          `/api/users/${encodeURIComponent(username)}/posts?${params.toString()}`
        );
        if (id !== reqId.current) return;
        setItems((prev) => (before ? [...prev, ...d.posts] : d.posts));
        setNext(d.next);
        setListState('ready');
      } catch (e) {
        if (id !== reqId.current) return;
        setListError(errorMessage(e));
        setListState('error');
      } finally {
        if (id === reqId.current) setLoadingMore(false);
      }
    },
    [username, type, showAll]
  );

  useEffect(() => {
    if (status === 'ready') void loadWorks();
  }, [status, isMe, loadWorks]);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const onSaved = (post: Post, kind: 'published' | 'draft' | 'updated') => {
    setToast(kind === 'published' ? 'Published.' : kind === 'draft' ? 'Draft saved.' : 'Changes saved.');
    if (showAll || post.type === type) {
      const s = toSummary(post);
      setItems((prev) => (prev.some((p) => p.id === s.id) ? prev.map((p) => (p.id === s.id ? s : p)) : [s, ...prev]));
      setListState('ready');
    }
    if (kind === 'published') {
      setProfile((p) => (p && post.visibility === 'public' ? { ...p, counts: { ...p.counts, [post.type]: p.counts[post.type] + 1 } } : p));
      setComposerKey((k) => k + 1);
    }
  };

  const remove = async (id: string) => {
    if (!window.confirm('Delete this piece for good? This cannot be undone.')) return;
    try {
      await api.del(`/api/posts/${id}`);
      setItems((prev) => prev.filter((p) => p.id !== id));
      setToast('Deleted.');
    } catch (e) {
      setToast(errorMessage(e));
    }
  };

  if (status === 'loading') return <div className="page-loading" role="status">Loading profile…</div>;
  if (status === 'missing') return <NotFound />;
  if (status === 'error' || !profile) {
    return (
      <div className="page page--narrow empty" role="alert">
        <p>We could not load this profile.</p>
        <button type="button" className="btn" onClick={() => window.location.reload()}>
          Try again
        </button>
      </div>
    );
  }

  const total = profile.counts.poem + profile.counts.story + profile.counts.book_part;

  return (
    <div className="page profile">
      <header className="profile__head">
        <div className="profile__info">
          <Avatar name={profile.name} src={profile.avatar} size={84} />
          <h1 className="profile__name">{profile.name}</h1>
          <p className="profile__handle">@{profile.username}</p>
          {profile.bio ? (
            <p className="profile__bio">{profile.bio}</p>
          ) : (
            isMe && <p className="profile__bio muted">Add a short bio so readers know who you are.</p>
          )}
          <dl className="profile__stats">
            <div>
              <dt>Poems</dt>
              <dd>{profile.counts.poem}</dd>
            </div>
            <div>
              <dt>Stories</dt>
              <dd>{profile.counts.story}</dd>
            </div>
            <div>
              <dt>Book parts</dt>
              <dd>{profile.counts.book_part}</dd>
            </div>
          </dl>
          <p className="muted small">Joined {formatDate(profile.created_at)}</p>
          {isMe && (
            <button type="button" className="btn" onClick={() => setEditing(true)}>
              Edit Profile
            </button>
          )}
        </div>
        <div className="profile__wheel">
          <Wheel value={type} onChange={setType} label={isMe ? 'Choose what to write' : 'Choose which writing to show'} />
        </div>
      </header>

      {isMe && (
        <section className="desk" aria-labelledby="desk-h">
          <h2 id="desk-h">Write a {TYPE_NAME[type].toLowerCase()}</h2>
          <Composer key={`${type}-${composerKey}`} type={type} onSaved={onSaved} />
        </section>
      )}

      <section className="works" aria-labelledby="works-h">
        <div className="works__head">
          <h2 id="works-h">{showAll ? 'All writing' : TYPE_PLURAL[type]}</h2>
          <label className="check">
            <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
            Show all types
          </label>
        </div>

        {listState === 'loading' && (
          <div className="feed" aria-busy="true" role="status" aria-label="Loading writing">
            {[0, 1].map((i) => (
              <div className="card card--skeleton" key={i} />
            ))}
          </div>
        )}
        {listState === 'error' && (
          <div className="empty" role="alert">
            <p>{listError}</p>
            <button type="button" className="btn" onClick={() => void loadWorks()}>
              Try again
            </button>
          </div>
        )}
        {listState === 'ready' && items.length === 0 && (
          <div className="empty">
            {isMe ? (
              <p>Nothing here yet. Turn the dial to choose a form and write your first {showAll ? 'piece' : TYPE_NAME[type].toLowerCase()} above.</p>
            ) : (
              <p>{total === 0 ? `${profile.name} has not published anything yet.` : 'No writing of this kind yet. Turn the dial to see other kinds.'}</p>
            )}
          </div>
        )}
        {listState === 'ready' && items.length > 0 && (
          <>
            <div className="feed">
              {items.map((p) => (
                <PostCard key={p.id} post={p} owner={isMe} showAuthor={false} onDelete={isMe ? remove : undefined} />
              ))}
            </div>
            {next && (
              <div className="more">
                <button type="button" className="btn" disabled={loadingMore} onClick={() => void loadWorks(next)}>
                  {loadingMore ? 'Loading…' : 'Load more'}
                </button>
              </div>
            )}
          </>
        )}
      </section>

      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
      {editing && (
        <EditProfile
          onClose={() => setEditing(false)}
          onSaved={(u) => {
            setEditing(false);
            setToast('Profile updated.');
            if (u.username !== username) nav(`/@${u.username}`, { replace: true });
            else setProfile((p) => (p ? { ...p, name: u.name, bio: u.bio, avatar: u.avatar } : p));
          }}
        />
      )}
    </div>
  );
}
