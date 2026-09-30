import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api';
import { useAuth } from './client-auth';
import Field from './components/Field';
import Logo from './components/Logo';
import Turnstile, { turnstileEnabled } from './components/Turnstile';
import type { SelfUser } from './types';
import { EMAIL_RE, USERNAME_RE } from './utils';

const GOOGLE_ERRORS: Record<string, string> = {
  google_denied: 'Google sign-in was cancelled.',
  google_expired: 'That sign-in attempt expired. Please try again.',
  google_failed: 'Google sign-in did not work. Please try again.',
  google_conflict: 'This email is already linked to a different Google account.',
  google_unverified: 'Your Google email address is not verified.'
};

export default function Auth({ mode }: { mode: 'login' | 'register' }) {
  const { user, setUser } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [sp] = useSearchParams();
  const from = (loc.state as { from?: string } | null)?.from;
  const isRegister = mode === 'register';

  const [f, setF] = useState({ name: '', username: '', email: '', password: '', confirm: '', identifier: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState(GOOGLE_ERRORS[sp.get('error') ?? ''] ?? '');
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState('');
  const [tsReset, setTsReset] = useState(0);
  const [avail, setAvail] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    document.title = `${isRegister ? 'Create account' : 'Log in'} · Marginalia`;
  }, [isRegister]);

  useEffect(() => {
    if (user) nav(from ?? `/@${user.username}`, { replace: true });
  }, [user, from, nav]);

  // Live username availability while registering.
  useEffect(() => {
    if (!isRegister) return;
    const u = f.username.trim().toLowerCase();
    if (!u) return setAvail(null);
    if (!USERNAME_RE.test(u)) {
      return setAvail({ ok: false, msg: 'Use 3 to 20 letters, numbers or underscores, starting with a letter.' });
    }
    setAvail(null);
    const t = window.setTimeout(() => {
      api
        .get<{ available: boolean; reason?: string }>(`/api/auth/username/${encodeURIComponent(u)}`)
        .then((r) => setAvail({ ok: r.available, msg: r.available ? 'That username is available.' : r.reason ?? 'Unavailable' }))
        .catch(() => setAvail(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [f.username, isRegister]);

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    const errs: Record<string, string> = {};
    if (isRegister) {
      if (!f.name.trim()) errs.name = 'Enter your name.';
      if (!USERNAME_RE.test(f.username.trim().toLowerCase())) errs.username = 'Use 3 to 20 letters, numbers or underscores, starting with a letter.';
      else if (avail && !avail.ok) errs.username = avail.msg;
      if (!EMAIL_RE.test(f.email.trim())) errs.email = 'Enter a valid email address.';
      if (f.password.length < 8) errs.password = 'Use at least 8 characters.';
      if (f.confirm !== f.password) errs.confirm_password = 'The passwords do not match.';
    } else {
      if (!f.identifier.trim()) errs.identifier = 'Enter your email or username.';
      if (!f.password) errs.password = 'Enter your password.';
    }
    if (turnstileEnabled && !token) errs.turnstile = 'Complete the verification below.';
    setErrors(errs);
    if (Object.keys(errs).length) return;

    setBusy(true);
    try {
      const body = isRegister
        ? { name: f.name, username: f.username, email: f.email, password: f.password, confirm_password: f.confirm, turnstile_token: token }
        : { identifier: f.identifier, password: f.password, turnstile_token: token };
      const res = await api.post<{ user: SelfUser }>(isRegister ? '/api/auth/register' : '/api/auth/login', body);
      setUser(res.user); // the effect above redirects to the profile
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      else setFormError(errorMessage(err));
      setTsReset((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setFormError('');
    setBusy(true);
    try {
      const { url } = await api.post<{ url: string }>('/api/auth/google');
      window.location.assign(url);
    } catch (err) {
      setFormError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <div className="page page--narrow">
      <div className="authcard">
        <Logo size={36} />
        <h1>{isRegister ? 'Create your account' : 'Welcome back'}</h1>
        <p className="muted">{isRegister ? 'Your profile is created the moment you sign up.' : 'Log in to keep writing.'}</p>

        <button type="button" className="btn btn--google btn--block" onClick={google} disabled={busy}>
          Continue with Google
        </button>
        <p className="divider">
          <span>or use your email</span>
        </p>

        <form onSubmit={submit} noValidate>
          {isRegister ? (
            <>
              <Field id="a-name" label="Name" error={errors.name}>
                <input id="a-name" className="input" autoComplete="name" value={f.name} maxLength={60} onChange={set('name')} aria-invalid={!!errors.name} />
              </Field>
              <Field id="a-username" label="Username" error={errors.username} hint={avail?.msg}>
                <input
                  id="a-username"
                  className="input"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  value={f.username}
                  maxLength={20}
                  onChange={set('username')}
                  aria-invalid={!!errors.username}
                />
              </Field>
              <Field id="a-email" label="Email" error={errors.email}>
                <input id="a-email" className="input" type="email" autoComplete="email" value={f.email} onChange={set('email')} aria-invalid={!!errors.email} />
              </Field>
              <Field id="a-pass" label="Password" error={errors.password} hint="At least 8 characters.">
                <input id="a-pass" className="input" type="password" autoComplete="new-password" value={f.password} maxLength={128} onChange={set('password')} aria-invalid={!!errors.password} />
              </Field>
              <Field id="a-confirm" label="Confirm password" error={errors.confirm_password}>
                <input id="a-confirm" className="input" type="password" autoComplete="new-password" value={f.confirm} maxLength={128} onChange={set('confirm')} aria-invalid={!!errors.confirm_password} />
              </Field>
            </>
          ) : (
            <>
              <Field id="a-ident" label="Email or username" error={errors.identifier}>
                <input id="a-ident" className="input" autoComplete="username" autoCapitalize="none" value={f.identifier} onChange={set('identifier')} aria-invalid={!!errors.identifier} />
              </Field>
              <Field id="a-pass" label="Password" error={errors.password}>
                <input id="a-pass" className="input" type="password" autoComplete="current-password" value={f.password} maxLength={128} onChange={set('password')} aria-invalid={!!errors.password} />
              </Field>
            </>
          )}

          <Turnstile onToken={setToken} resetKey={tsReset} />
          {errors.turnstile && (
            <p className="field__error" role="alert">
              {errors.turnstile}
            </p>
          )}
          {formError && (
            <p className="form-error" role="alert">
              {formError}
            </p>
          )}
          <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
            {busy ? 'One moment…' : isRegister ? 'Create Account' : 'Log In'}
          </button>
        </form>

        <p className="authcard__alt">
          {isRegister ? (
            <>
              Already have an account? <Link to="/login" state={from ? { from } : undefined}>Log in</Link>
            </>
          ) : (
            <>
              New here? <Link to="/register">Create an account</Link>
            </>
          )}
        </p>
      </div>
    </div>
  );
}
