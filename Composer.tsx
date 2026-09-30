import { useCallback, useEffect, useId, useMemo, useReducer, useRef, useState } from 'react';
import { api, ApiError } from '../api';
import type { Post, PostType, Visibility } from '../types';
import { TYPE_NAME, countWords } from '../utils';

interface Fields {
  title: string;
  bookTitle: string;
  content: string;
}
interface DraftDto {
  title: string;
  book_title: string | null;
  content: string;
  updated_at: number;
}
type SavedKind = 'published' | 'draft' | 'updated';

const LIMITS: Record<PostType, number> = { poem: 20_000, story: 150_000, book_part: 250_000 };
const HINTS: Record<PostType, { content: string; title: string }> = {
  poem: { content: 'Line breaks and indentation are kept exactly as you type them.', title: 'Give the poem a title' },
  story: { content: 'Start a new paragraph with a blank line.', title: 'Give the story a title' },
  book_part: { content: 'Start a new paragraph with a blank line.', title: 'Name this chapter or part' }
};

interface Props {
  type: PostType;
  post?: Post | null;
  onSaved: (post: Post, kind: SavedKind) => void;
}

export default function Composer({ type, post, onSaved }: Props) {
  const uid = useId();
  const initial = useMemo<Fields>(
    () => ({ title: post?.title ?? '', bookTitle: post?.book_title ?? '', content: post?.content ?? '' }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [current, setCurrent] = useState<Post | null>(post ?? null);
  const [fields, setFields] = useState<Fields>(initial);
  const fieldsRef = useRef<Fields>(initial);
  const [visibility, setVisibility] = useState<Visibility>(post && post.visibility !== 'draft' ? post.visibility : 'public');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');
  const [full, setFull] = useState(false);
  const [restored, setRestored] = useState(false);
  const [, force] = useReducer((x: number) => x + 1, 0);

  const hist = useRef<{ stack: Fields[]; idx: number }>({ stack: [initial], idx: 0 });
  const snapTimer = useRef<number>();
  const saveTimer = useRef<number>();
  const dirty = useRef(false);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  const isPublished = !!current && current.visibility !== 'draft';
  const draftKey = current?.id ?? 'new';

  // ---- history (undo / redo) ----
  const commitSnapshot = useCallback((f: Fields) => {
    const h = hist.current;
    const top = h.stack[h.idx];
    if (top.title === f.title && top.bookTitle === f.bookTitle && top.content === f.content) return;
    h.stack = h.stack.slice(0, h.idx + 1);
    h.stack.push(f);
    if (h.stack.length > 100) h.stack.shift();
    h.idx = h.stack.length - 1;
    force();
  }, []);

  // ---- autosave buffer ----
  const saveBuffer = useCallback(async () => {
    const f = fieldsRef.current;
    if (!f.title && !f.bookTitle && !f.content) return;
    try {
      await api.put('/api/drafts', {
        type,
        draft_key: draftKey,
        title: f.title,
        book_title: type === 'book_part' ? f.bookTitle : null,
        content: f.content
      });
      dirty.current = false;
      setStatus(`Autosaved at ${new Date().toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}`);
    } catch {
      setStatus('Autosave failed. Your text is still here.');
    }
  }, [type, draftKey]);
  const saveRef = useRef(saveBuffer);
  saveRef.current = saveBuffer;

  const apply = (next: Fields, snapshot: boolean) => {
    fieldsRef.current = next;
    setFields(next);
    dirty.current = true;
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => void saveRef.current(), 2000);
    if (snapshot) {
      window.clearTimeout(snapTimer.current);
      snapTimer.current = window.setTimeout(() => commitSnapshot(fieldsRef.current), 450);
    }
  };
  const update = (patch: Partial<Fields>) => apply({ ...fieldsRef.current, ...patch }, true);

  const undo = () => {
    window.clearTimeout(snapTimer.current);
    commitSnapshot(fieldsRef.current);
    const h = hist.current;
    if (h.idx > 0) {
      h.idx -= 1;
      apply(h.stack[h.idx], false);
      force();
    }
  };
  const redo = () => {
    const h = hist.current;
    if (h.idx < h.stack.length - 1) {
      h.idx += 1;
      apply(h.stack[h.idx], false);
      force();
    }
  };
  const canUndo = hist.current.idx > 0 || JSON.stringify(hist.current.stack[hist.current.idx]) !== JSON.stringify(fields);
  const canRedo = hist.current.idx < hist.current.stack.length - 1;

  // ---- restore autosaved text on mount ----
  useEffect(() => {
    let dead = false;
    api
      .get<{ draft: DraftDto | null }>(`/api/drafts?type=${type}&key=${post ? post.id : 'new'}`)
      .then(({ draft }) => {
        if (dead || !draft) return;
        const cur = fieldsRef.current;
        if (post) {
          if (draft.updated_at <= post.updated_at) return;
        } else if (cur.title || cur.content || cur.bookTitle) {
          return;
        }
        const f: Fields = { title: draft.title, bookTitle: draft.book_title ?? '', content: draft.content };
        fieldsRef.current = f;
        setFields(f);
        hist.current = { stack: [f], idx: 0 };
        setRestored(true);
      })
      .catch(() => undefined);
    return () => {
      dead = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Flush any pending autosave when leaving (for example when the wheel switches type).
  useEffect(
    () => () => {
      window.clearTimeout(snapTimer.current);
      window.clearTimeout(saveTimer.current);
      if (dirty.current) void saveRef.current();
    },
    []
  );

  // ---- fullscreen ----
  useEffect(() => {
    if (!full) return;
    document.body.style.overflow = 'hidden';
    contentRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFull(false);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', onKey);
    };
  }, [full]);

  const discardRestored = async () => {
    const f: Fields = { title: post?.title ?? '', bookTitle: post?.book_title ?? '', content: post?.content ?? '' };
    fieldsRef.current = f;
    setFields(f);
    hist.current = { stack: [f], idx: 0 };
    dirty.current = false;
    setRestored(false);
    try {
      await api.del(`/api/drafts?type=${type}&key=${draftKey}`);
    } catch {
      /* the local text is already reset */
    }
  };

  // ---- save / publish ----
  const submit = async (vis: Visibility) => {
    setError('');
    const f = fieldsRef.current;
    const asDraft = vis === 'draft';
    if (!asDraft) {
      if (!f.title.trim()) return setError('Add a title before publishing.');
      if (type === 'book_part' && !f.bookTitle.trim()) return setError('Add the book title before publishing.');
      if (!f.content.trim()) return setError('There is nothing to publish yet. Write something first.');
    }
    window.clearTimeout(saveTimer.current);
    dirty.current = false;
    setBusy(true);
    try {
      const body = {
        type,
        title: f.title.trim() || 'Untitled',
        book_title: type === 'book_part' ? f.bookTitle.trim() || 'Untitled book' : null,
        content: f.content,
        visibility: vis,
        draft_key: draftKey
      };
      const res = current
        ? await api.patch<{ post: Post }>(`/api/posts/${current.id}`, body)
        : await api.post<{ post: Post }>('/api/posts', body);
      const wasPublished = !!current && current.visibility !== 'draft';
      setCurrent(res.post);
      setRestored(false);
      setStatus(asDraft ? 'Draft saved' : wasPublished ? 'Changes saved' : 'Published');
      onSaved(res.post, asDraft ? 'draft' : wasPublished ? 'updated' : 'published');
    } catch (e) {
      dirty.current = true;
      setError(e instanceof ApiError ? e.message : 'Could not save. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const k = e.key.toLowerCase();
    if (k === 'z') {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
    } else if (k === 'y') {
      e.preventDefault();
      redo();
    } else if (k === 's') {
      e.preventDefault();
      void submit(isPublished ? visibility : 'draft');
    }
  };

  const words = useMemo(() => countWords(fields.content), [fields.content]);
  const chars = useMemo(() => Array.from(fields.content).length, [fields.content]);
  const name = TYPE_NAME[type];
  const visOptions: Visibility[] = isPublished ? ['public', 'private', 'draft'] : ['public', 'private'];
  const visLabel: Record<Visibility, string> = { public: 'Public', private: 'Private', draft: 'Draft' };
  const chapterLabel = type === 'book_part' ? 'Chapter or part title' : `${name} title`;

  return (
    <section
      className={`composer composer--${type}${full ? ' composer--full' : ''}`}
      aria-label={`${name} editor`}
      onKeyDown={onKeyDown}
    >
      <div className="composer__bar" role="toolbar" aria-label="Editor tools">
        <button type="button" className="tool" onClick={undo} disabled={!canUndo}>
          Undo
        </button>
        <button type="button" className="tool" onClick={redo} disabled={!canRedo}>
          Redo
        </button>
        <button type="button" className="tool tool--right" aria-pressed={full} onClick={() => setFull((v) => !v)}>
          {full ? 'Exit fullscreen' : 'Fullscreen'}
        </button>
      </div>

      {restored && (
        <p className="notice" role="status">
          We restored your autosaved text.{' '}
          <button type="button" className="link" onClick={discardRestored}>
            Discard it
          </button>
        </p>
      )}

      <div className="composer__fields">
        {type === 'book_part' && (
          <div className="field">
            <label htmlFor={`${uid}-book`}>Book title</label>
            <input
              id={`${uid}-book`}
              className="input input--title"
              value={fields.bookTitle}
              maxLength={150}
              placeholder="The name of your book"
              onChange={(e) => update({ bookTitle: e.target.value })}
            />
          </div>
        )}
        <div className="field">
          <label htmlFor={`${uid}-title`}>{chapterLabel}</label>
          <input
            id={`${uid}-title`}
            className="input input--title"
            value={fields.title}
            maxLength={150}
            placeholder={HINTS[type].title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </div>
        <div className="field field--grow">
          <label htmlFor={`${uid}-content`}>{type === 'poem' ? 'Poem' : type === 'story' ? 'Story' : 'Chapter text'}</label>
          <textarea
            id={`${uid}-content`}
            ref={contentRef}
            className="input input--body"
            value={fields.content}
            maxLength={LIMITS[type]}
            spellCheck
            aria-describedby={`${uid}-hint`}
            placeholder={type === 'poem' ? 'Begin your first line…' : 'Once upon a…'}
            onChange={(e) => update({ content: e.target.value })}
          />
          <p className="field__hint" id={`${uid}-hint`}>
            {HINTS[type].content}
          </p>
        </div>
      </div>

      <div className="composer__foot">
        <p className="composer__meta">
          <span>{words.toLocaleString()} words</span>
          <span>{chars.toLocaleString()} characters</span>
          <span role="status" aria-live="polite">
            {status}
          </span>
        </p>
        <div className="composer__actions">
          <div className="seg" role="radiogroup" aria-label="Who can see this">
            {visOptions.map((v) => (
              <button
                key={v}
                type="button"
                role="radio"
                aria-checked={visibility === v}
                className="seg__opt"
                onClick={() => setVisibility(v)}
              >
                {visLabel[v]}
              </button>
            ))}
          </div>
          {!isPublished && (
            <button type="button" className="btn" disabled={busy} onClick={() => void submit('draft')}>
              Save Draft
            </button>
          )}
          <button
            type="button"
            className="btn btn--primary"
            disabled={busy}
            onClick={() => void submit(visibility)}
          >
            {busy ? 'Saving…' : isPublished ? 'Save Changes' : `Publish ${name}`}
          </button>
        </div>
      </div>
      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
