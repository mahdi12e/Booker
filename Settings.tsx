import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { api, ApiError, errorMessage } from './api';
import { useAuth } from './client-auth';
import Field from './components/Field';

export default function Settings() {
  const { user, loading, setUser, logout } = useAuth();
  const nav = useNavigate();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    document.title = 'Settings · Marginalia';
  }, []);

  if (loading) return <div className="page-loading" role="status">Loading…</div>;
  if (!user) return <Navigate to="/login" replace state={{ from: '/settings' }} />;

  const changePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    const errs: Record<string, string> = {};
    if (user.has_password && !current) errs.current_password = 'Enter your current password.';
    if (next.length < 8) errs.new_password = 'Use at least 8 characters.';
    if (confirm !== next) errs.confirm = 'The passwords do not match.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    try {
      await api.put('/api/auth/password', { current_password: current, new_password: next });
      setUser({ ...user, has_password: true });
      setCurrent('');
      setNext('');
      setConfirm('');
      setMsg(user.has_password ? 'Password changed. Other devices were logged out.' : 'Password set.');
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      else setErrors({ form: errorMessage(err) });
    } finally {
      setBusy(false);
    }
  };

  const logoutEverywhere = async () => {
    try {
      await api.post('/api/auth/logout-all');
      setUser(null);
      nav('/login');
    } catch (e) {
      setErrors({ form: errorMessage(e) });
    }
  };

  return (
    <div className="page page--narrow">
      <header className="page__head">
        <h1>Settings</h1>
      </header>

      <section className="panel" aria-labelledby="s-account">
        <h2 id="s-account">Account</h2>
        <dl className="kv">
          <div>
            <dt>Email</dt>
            <dd>{user.email}</dd>
          </div>
          <div>
            <dt>Username</dt>
            <dd>@{user.username}</dd>
          </div>
          <div>
            <dt>Google</dt>
            <dd>{user.google_linked ? 'Linked' : 'Not linked'}</dd>
          </div>
        </dl>
        <Link className="btn" to={`/@${user.username}`}>
          Edit profile
        </Link>
      </section>

      <section className="panel" aria-labelledby="s-pass">
        <h2 id="s-pass">{user.has_password ? 'Change password' : 'Set a password'}</h2>
        {!user.has_password && <p className="muted">You sign in with Google. Add a password if you also want to log in with your email.</p>}
        <form onSubmit={changePassword} noValidate>
          {user.has_password && (
            <Field id="s-current" label="Current password" error={errors.current_password}>
              <input id="s-current" className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} />
            </Field>
          )}
          <Field id="s-new" label="New password" error={errors.new_password} hint="At least 8 characters.">
            <input id="s-new" className="input" type="password" autoComplete="new-password" value={next} maxLength={128} onChange={(e) => setNext(e.target.value)} />
          </Field>
          <Field id="s-confirm" label="Confirm new password" error={errors.confirm}>
            <input id="s-confirm" className="input" type="password" autoComplete="new-password" value={confirm} maxLength={128} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          {errors.form && (
            <p className="form-error" role="alert">
              {errors.form}
            </p>
          )}
          {msg && (
            <p className="notice" role="status">
              {msg}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : user.has_password ? 'Change password' : 'Set password'}
          </button>
        </form>
      </section>

      <section className="panel" aria-labelledby="s-sess">
        <h2 id="s-sess">Sessions</h2>
        <div className="row">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              await logout();
              nav('/');
            }}
          >
            Log out
          </button>
          <button type="button" className="btn btn--danger" onClick={logoutEverywhere}>
            Log out everywhere
          </button>
        </div>
      </section>
    </div>
  );
}
