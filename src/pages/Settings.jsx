import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useTheme } from '../hooks/useTheme';
import { useInstall } from '../hooks/useInstall';
import { api } from '../lib/api';
import { isValidUpi } from '../lib/upi';
import { APP_NAME } from '../lib/brand';
import Icon from '../components/Icon';
import Avatar from '../components/Avatar';
import Segmented from '../components/Segmented';
import { IosSteps } from '../components/InstallApp';
import AvatarPicker from '../components/AvatarPicker';

// iOS Settings building blocks: a captioned group of rows on glass
function Group({ title, footer, children, className = '' }) {
  return (
    <section className={className}>
      {title && <h2 className="mb-1.5 px-4 text-[12px] font-medium uppercase tracking-[0.04em] text-slate-500">{title}</h2>}
      <div className="glass overflow-hidden rounded-[22px]">{children}</div>
      {footer && <p className="mt-1.5 px-4 text-[12px] leading-snug text-slate-500">{footer}</p>}
    </section>
  );
}

const TILE = {
  blue: 'bg-[#007aff]',
  green: 'bg-[#34c759]',
  indigo: 'bg-[#5856d6]',
  orange: 'bg-[#ff9500]',
  gray: 'bg-[#8e8e93]',
};

// One row: coloured icon tile, label, and whatever sits on the right.
// Every row but the first gets a hairline that starts after the icon, like iOS.
function Row({ icon, tile = 'blue', label, children, onClick, sub }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`relative flex min-h-[48px] w-full items-center gap-3 px-4 py-2 text-left [&:not(:first-child)]:before:absolute [&:not(:first-child)]:before:left-[58px] [&:not(:first-child)]:before:right-0 [&:not(:first-child)]:before:top-0 [&:not(:first-child)]:before:h-px [&:not(:first-child)]:before:bg-[rgb(var(--line)/0.12)] ${
        onClick ? 'transition-colors duration-200 active:bg-[rgb(var(--line)/0.08)]' : ''
      }`}
    >
      <span className={`flex h-[30px] w-[30px] flex-shrink-0 items-center justify-center rounded-[8px] text-white ${TILE[tile]}`}>
        <Icon name={icon} className="h-[17px] w-[17px]" strokeWidth={2.1} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] text-ink">{label}</span>
        {sub && <span className="block text-[12px] text-slate-500">{sub}</span>}
      </span>
      {children}
    </Tag>
  );
}

// Animated expand/collapse for content tucked under a row
function Reveal({ open, children }) {
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-500 ease-ios ${open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className="overflow-hidden">{children}</div>
    </div>
  );
}

// Text field on the right of a row; saves on Enter or when focus leaves
function InlineField({ value, onSave, placeholder, invalid, label, ...rest }) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  const bad = Boolean(invalid?.(draft));
  const commit = () => draft.trim() !== value && !bad && onSave(draft.trim());
  return (
    <input
      aria-label={label}
      aria-invalid={bad}
      value={draft}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
      className={`w-[55%] min-w-0 rounded-lg bg-transparent px-1.5 py-1 text-right text-[15px] outline-none transition-colors duration-200 placeholder:text-slate-400 focus:bg-[rgb(var(--line)/0.06)] ${
        bad ? 'text-rose-600' : 'text-slate-500 focus:text-ink'
      }`}
      {...rest}
    />
  );
}

export default function Settings() {
  const { user, profile, name, refreshProfile, updatePassword, signOut } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const { theme, toggleTheme } = useTheme();
  const { installed, canPrompt, iosSteps, install } = useInstall();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(''); // expanded row: emoji | password | install

  const upiBad = (v) => v.trim() !== '' && !isValidUpi(v);
  const toggle = (row) => setOpen((o) => (o === row ? '' : row));

  const saveName = async (value) => {
    if (!value) return toast.error('Name can’t be empty');
    try {
      await api.updateDisplayName(user.id, value);
      await refreshProfile();
      toast.success('Name updated');
    } catch (err) {
      toast.error(err.message);
    }
  };

  const saveAvatar = async (look) => {
    try {
      await api.updateAvatar(user.id, look);
      await refreshProfile();
      toast.success('Profile picture updated');
    } catch {
      toast.error('Couldn’t save that. Pick a single emoji.');
    }
  };

  const saveUpi = async (value) => {
    try {
      await api.updateUpi(user.id, value);
      await refreshProfile();
      toast.success(value ? 'UPI ID saved' : 'UPI ID removed');
    } catch {
      toast.error('Couldn’t save that UPI ID. Check it looks like name@bank.');
    }
  };

  const savePassword = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      await updatePassword(password);
      setPassword('');
      setOpen('');
      toast.success('Password changed');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto grid max-w-4xl items-start gap-5 lg:grid-cols-2 lg:gap-6">
      <div className="space-y-5">
        {/* Account header, like the Apple ID row */}
        <div className="glass flex items-center gap-3.5 rounded-[22px] px-4 py-3.5">
          <Avatar id={user.id} name={name} size="lg" className="!h-14 !w-14 !text-[22px]" />
          <div className="min-w-0">
            <h1 className="truncate text-[22px] font-semibold leading-tight text-ink">{name}</h1>
            <p className="truncate text-[13px] text-slate-500">{profile?.email || user.email}</p>
          </div>
        </div>

        <Group title="Profile" footer="Your picture and UPI ID are seen by people in your groups.">
          <Row icon="sparkle" tile="orange" label="Profile picture" onClick={() => toggle('emoji')}>
            <Avatar id={user.id} name={name} size="sm" />
            <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-ios ${open === 'emoji' ? 'rotate-90' : ''}`} />
          </Row>
          <Reveal open={open === 'emoji'}>
            <AvatarPicker id={user.id} name={name} emoji={profile?.avatar_emoji || ''} color={profile?.avatar_color || ''} onSave={saveAvatar} />
          </Reveal>
          <Row icon="users" tile="blue" label="Name">
            <InlineField label="Name" value={name} onSave={saveName} maxLength={60} />
          </Row>
          <Row icon="bolt" tile="green" label="UPI ID" sub={!profile?.upi_id ? 'Not added yet' : undefined}>
            <InlineField
              label="UPI ID"
              value={profile?.upi_id || ''}
              onSave={saveUpi}
              invalid={upiBad}
              placeholder="name@bank"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
            />
          </Row>
        </Group>
      </div>

      <div className="space-y-5">
        <Group title="App">
          <Row icon="sparkle" tile="indigo" label="Appearance">
            <Segmented
              size="sm"
              label="Theme"
              value={theme}
              onChange={(v) => v !== theme && toggleTheme()}
              options={[
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
            />
          </Row>
          <Row
            icon="download"
            tile="blue"
            label={installed ? `${APP_NAME} is installed` : `Install ${APP_NAME}`}
            onClick={!installed && !canPrompt ? () => toggle('install') : undefined}
          >
            {installed ? (
              <Icon name="check" className="h-5 w-5 text-[#34c759]" strokeWidth={2.4} />
            ) : canPrompt ? (
              <span role="button" tabIndex={0} onClick={install} onKeyDown={(e) => e.key === 'Enter' && install()} className="btn-primary h-8 !px-3.5 !text-[13px]">
                Install
              </span>
            ) : (
              <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-ios ${open === 'install' ? 'rotate-90' : ''}`} />
            )}
          </Row>
          <Reveal open={open === 'install'}>
            <div className="px-4 pb-3.5 pl-[58px]">
              {iosSteps ? (
                <IosSteps />
              ) : (
                <p className="text-[13px] text-slate-500">Open {APP_NAME} in Chrome, Edge or Safari and choose “Install” or “Add to Home Screen”.</p>
              )}
            </div>
          </Reveal>
        </Group>

        <Group title="Security">
          <Row icon="key" tile="orange" label="Change password" onClick={() => toggle('password')}>
            <Icon name="chevron" className={`h-4 w-4 text-slate-400 transition-transform duration-300 ease-ios ${open === 'password' ? 'rotate-90' : ''}`} />
          </Row>
          <Reveal open={open === 'password'}>
            <form onSubmit={savePassword} className="flex gap-2 px-4 pb-3.5 pl-[58px]">
              <input
                aria-label="New password"
                type="password"
                className="input-field !py-2 text-[14px]"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                minLength={6}
                required
                placeholder="New password"
                autoComplete="new-password"
                tabIndex={open === 'password' ? 0 : -1}
              />
              <button type="submit" disabled={busy} className="btn-primary h-9 flex-shrink-0 !px-3.5 !text-[13px]" tabIndex={open === 'password' ? 0 : -1}>
                Update
              </button>
            </form>
          </Reveal>
        </Group>

        <Group>
          <button
            type="button"
            onClick={async () => {
              await signOut();
              navigate('/login');
            }}
            className="flex min-h-[48px] w-full items-center justify-center text-[15px] font-medium text-[#ff3b30] transition-colors duration-200 active:bg-[rgb(var(--line)/0.08)] dark:text-[#ff453a]"
          >
            Sign out
          </button>
        </Group>
      </div>
    </div>
  );
}
