import { useEffect, useRef, useState } from 'react';
import { api, ApiError, errorMessage } from './api';
import { useAuth } from './client-auth';
import type { SelfUser } from './types';
import { USERNAME_RE } from './utils';
import Avatar from './Avatar';
import Field from './Field';

async function squareResize(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const side = Math.min(bmp.width, bmp.height);
  const out = Math.min(max, side);
  const canvas = document.createElement('canvas');
  canvas.width = out;
  canvas.height = out;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas unavailable');
  ctx.drawImage(bmp, (bmp.width - side) / 2, (bmp.height - side) / 2, side, side, 0, 0, out, out);
  bmp.close();
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not process image'))), 'image/webp', 0.86)
  );
}

export default function EditProfile({ onClose, onSaved }: { onClose: () => void; onSaved: (u: SelfUser) => void }) {
  const { user, setUser } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [name, setName] = useState(user?.name ?? '');
  const [username, setUsername] = useState(user?.username ?? '');
  const [bio, setBio] = useState(user?.bio ?? '');
  const [avatarBlob, setAvatarBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(user?.avatar ?? null);
  const [removeAvatar, setRemoveAvatar] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const [avail, setAvail] = useState<{ ok: boolean; msg: string } | null>(null);

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    const u = username.trim().toLowerCase();
    if (!user || u === user.username) return setAvail(null);
    if (!USERNAME_RE.test(u)) {
      return setAvail({ ok: false, msg: 'Use 3 to 20 letters, numbers or underscores, starting with a letter.' });
    }
    setAvail(null);
    const t = window.setTimeout(() => {
      api
        .get<{ available: boolean; reason?: string }>(`/api/auth/username/${encodeURIComponent(u)}`)
        .then((r) => setAvail({ ok: r.available, msg: r.available ? 'Available' : r.reason ?? 'Unavailable' }))
        .catch(() => setAvail(null));
    }, 400);
    return () => window.clearTimeout(t);
  }, [username, user]);

  useEffect(
    () => () => {
      if (preview?.startsWith('blob:')) URL.revokeObjectURL(preview);
    },
    [preview]
  );

  const pickFile = async (file: File | undefined) => {
    if (!file) return;
    setFormError('');
    if (!/^image\/(png|jpeg|webp)$/.test(file.type)) return setFormError('Use a PNG, JPEG or WebP image.');
    try {
      const blob = await squareResize(file);
      setAvatarBlob(blob);
      setRemoveAvatar(false);
      setPreview(URL.createObjectURL(blob));
    } catch {
      setFormError('That image could not be read. Try a different file.');
    }
  };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setFormError('');
    if (!name.trim()) return setErrors({ name: 'Enter your name.' });
    if (avail && !avail.ok) return setErrors({ username: avail.msg });
    setBusy(true);
    try {
      if (avatarBlob) {
        const form = new FormData();
        form.append('avatar', avatarBlob, 'avatar.webp');
        await api.post('/api/profile/avatar', form);
      } else if (removeAvatar && user?.avatar) {
        await api.del('/api/profile/avatar');
      }
      const res = await api.patch<{ user: SelfUser }>('/api/profile', {
        name: name.trim(),
        username: username.trim().toLowerCase(),
        bio
      });
      setUser(res.user);
      onSaved(res.user);
    } catch (err) {
      if (err instanceof ApiError && err.field) setErrors({ [err.field]: err.message });
      else setFormError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <dialog ref={dialog} className="dialog" aria-labelledby="ep-title" onClose={onClose} onCancel={onClose}>
      <form onSubmit={save} noValidate>
        <h2 id="ep-title">Edit profile</h2>

        <div className="avatar-edit">
          <Avatar name={name || 'You'} src={removeAvatar ? null : preview} size={72} />
          <div>
            <label className="btn btn--small">
              Change photo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="sr-only"
                onChange={(e) => void pickFile(e.target.files?.[0])}
              />
            </label>
            {(preview || user?.avatar) && !removeAvatar && (
              <button
                type="button"
                className="link link--danger"
                onClick={() => {
                  setRemoveAvatar(true);
                  setAvatarBlob(null);
                  setPreview(null);
                }}
              >
                Remove
              </button>
            )}
          </div>
        </div>

        <Field id="ep-name" label="Name" error={errors.name}>
          <input id="ep-name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-invalid={!!errors.name} />
        </Field>
        <Field id="ep-username" label="Username" error={errors.username} hint={avail ? avail.msg : 'Letters, numbers and underscores.'}>
          <input
            id="ep-username"
            className="input"
            value={username}
            maxLength={20}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => setUsername(e.target.value)}
            aria-invalid={!!errors.username || (avail ? !avail.ok : false)}
            aria-describedby={errors.username ? 'ep-username-err' : 'ep-username-hint'}
          />
        </Field>
        <Field id="ep-bio" label="Bio" error={errors.bio} hint={`${bio.length} of 500`}>
          <textarea id="ep-bio" className="input" rows={4} value={bio} maxLength={500} onChange={(e) => setBio(e.target.value)} />
        </Field>

        {formError && (
          <p className="form-error" role="alert">
            {formError}
          </p>
        )}
        <div className="dialog__actions">
          <button type="button" className="btn" onClick={() => dialog.current?.close()}>
            Cancel
          </button>
          <button type="submit" className="btn btn--primary" disabled={busy}>
            {busy ? 'Saving…' : 'Save changes'}
          </button>
        </div>
      </form>
    </dialog>
  );
}
