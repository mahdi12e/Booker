import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api';
import Wheel from '../components/Wheel';
import type { PostType } from '../types';

const SAMPLES: Record<PostType, { title: string; kicker?: string; body: string }> = {
  poem: {
    title: 'Kettle',
    body: 'The kettle ticks its small applause,\nthe window keeps the last of light,\nand I, who owe the day no cause,\nwrite down the quiet of the night.'
  },
  story: {
    title: 'The Keeper',
    body: 'The lighthouse keeper had not seen a ship in eleven years, but every evening he polished the lamp anyway, in case the sea remembered him.'
  },
  book_part: {
    title: 'The Salt Road',
    kicker: 'The Long Caravan, part three',
    body: 'By the time the caravan reached the coast, Amara had memorised every lie she would need, and forgotten the one truth that mattered.'
  }
};

function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.1C12.4 13.6 17.7 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.6 5.9c4.4-4.1 7-10.1 7-17.6z" />
      <path fill="#FBBC05" d="M10.5 28.7A14.5 14.5 0 0 1 9.5 24c0-1.6.3-3.2.8-4.7l-7.9-6.1A24 24 0 0 0 0 24c0 3.9.9 7.5 2.6 10.8l7.9-6.1z" />
      <path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.6-5.9c-2.1 1.4-4.9 2.3-8.3 2.3-6.3 0-11.6-4.1-13.5-9.8l-7.9 6.1C6.5 42.6 14.6 48 24 48z" />
    </svg>
  );
}

export default function Landing() {
  const [type, setType] = useState<PostType>('poem');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const sample = SAMPLES[type];

  useEffect(() => {
    document.title = 'Marginalia: poems, stories and books in progress';
  }, []);

  const google = async () => {
    setError('');
    setBusy(true);
    try {
      const { url } = await api.post<{ url: string }>('/api/auth/google');
      window.location.assign(url);
    } catch (e) {
      setError(errorMessage(e));
      setBusy(false);
    }
  };

  return (
    <div className="landing">
      <section className="hero">
        <div className="hero__copy">
          <h1>Write it here. Let it be read.</h1>
          <p className="hero__lede">
            Marginalia is a home for poems, stories and books in progress. Publish a line, a tale or a chapter, and find the people who read the way you write.
          </p>
          <div className="hero__cta">
            <Link className="btn btn--primary btn--big" to="/register">
              Create Account
            </Link>
            <Link className="btn btn--big" to="/login">
              Log In
            </Link>
          </div>
          <button type="button" className="btn btn--google btn--big" onClick={google} disabled={busy}>
            <GoogleMark />
            Continue with Google
          </button>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
          <p className="hero__more">
            Just looking? <Link to="/discover">Read what people are publishing.</Link>
          </p>
        </div>

        <div className="hero__stage">
          <Wheel value={type} onChange={setType} label="Preview a kind of writing" />
          <article className={`sample sample--${type}`} aria-live="polite">
            {sample.kicker && <p className="sample__kicker">{sample.kicker}</p>}
            <h2 className="sample__title">{sample.title}</h2>
            <p className="sample__body">{sample.body}</p>
          </article>
          <p className="hero__hint">Drag the dial, swipe it, or use the arrow keys.</p>
        </div>
      </section>
    </div>
  );
}
