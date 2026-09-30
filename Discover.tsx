import { useEffect, useState } from 'react';
import Feed from '../components/Feed';
import type { PostType } from '../types';
import { TYPE_PLURAL } from '../utils';

const FILTERS: { value: PostType | null; label: string }[] = [
  { value: null, label: 'All' },
  { value: 'poem', label: TYPE_PLURAL.poem },
  { value: 'story', label: TYPE_PLURAL.story },
  { value: 'book_part', label: TYPE_PLURAL.book_part }
];

export default function Discover() {
  const [type, setType] = useState<PostType | null>(null);
  useEffect(() => {
    document.title = 'Discover · Marginalia';
  }, []);
  return (
    <div className="page">
      <header className="page__head">
        <div>
          <h1>Discover</h1>
          <p className="muted">The newest public writing on Marginalia.</p>
        </div>
      </header>
      <div className="filters" role="group" aria-label="Filter by type">
        {FILTERS.map((f) => (
          <button key={f.label} type="button" className="chip" aria-pressed={type === f.value} onClick={() => setType(f.value)}>
            {f.label}
          </button>
        ))}
      </div>
      <Feed type={type} />
    </div>
  );
}
