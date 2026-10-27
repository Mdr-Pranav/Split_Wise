import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../hooks/useTheme';
import { api } from '../lib/api';
import Avatar from '../components/Avatar';
import Segmented from '../components/Segmented';

export default function Settings() {
  const { user, profile, name, refreshProfile, updatePassword, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const [displayName, setDisplayName] = useState(name);
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState('');

  useEffect(() => setDisplayName(name), [name]);

  const saveName = async (e) => {
    e.preventDefault();
    setBusy('name');
    try {
      await api.updateDisplayName(user.id, displayName);
      await refreshProfile();
      toast.success('Name updated');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy('password');
    try {
      await updatePassword(password);
      setPassword('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy('');
    }
  };

  return (
    <div className="mx-auto max-w-xl space-y-5">
      <div className="flex items-center gap-4">
        <Avatar id={user.id} name={name} size="lg" className="!h-16 !w-16 !text-[24px]" />
        <div className="min-w-0">
          <h1 className="truncate text-[30px] font-semibold leading-tight text-ink sm:text-[36px]">{name}</h1>
          <p className="truncate text-[15px] text-slate-500">{profile?.email || user.email}</p>
        </div>
      </div>

      <form onSubmit={saveName} className="card space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Display name</h2>
        <p className="-mt-2 text-[14px] text-slate-600">What everyone in your groups sees.</p>
        <div className="flex gap-2">
          <input aria-label="Display name" className="input-field" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} required />
          <button type="submit" disabled={busy === 'name' || displayName.trim() === name} className="btn-primary flex-shrink-0">Save</button>
        </div>
      </form>

      <div className="card flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-[17px] font-semibold text-ink">Appearance</h2>
          <p className="text-[14px] text-slate-600">Follows your device until you pick one.</p>
        </div>
        <Segmented
          label="Theme"
          value={theme}
          onChange={(v) => v !== theme && toggleTheme()}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
        />
      </div>

      <form onSubmit={savePassword} className="card space-y-4">
        <h2 className="text-[17px] font-semibold text-ink">Change password</h2>
        <div className="flex gap-2">
          <input aria-label="New password" type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required placeholder="New password" autoComplete="new-password" />
          <button type="submit" disabled={busy === 'password'} className="btn-primary flex-shrink-0">Update</button>
        </div>
      </form>

      <button
        type="button"
        onClick={async () => {
          await signOut();
          navigate('/login');
        }}
        className="btn-secondary w-full !text-rose-600"
      >
        Sign out
      </button>
    </div>
  );
}
