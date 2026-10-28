import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell, { ErrorNote } from '../components/AuthShell';

export default function Signup() {
  const { signUp } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const { needsConfirmation } = await signUp(email.trim(), password, name.trim());
      if (needsConfirmation) setSentTo(email.trim());
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (sentTo) {
    return (
      <AuthShell title="Check your inbox." subtitle="One click to go.">
        <div className="card space-y-4 p-7 text-center sm:p-8">
          <p className="text-[15px] leading-relaxed text-slate-600">
            We sent a confirmation link to <span className="font-medium text-ink">{sentTo}</span>. Open it on this device to finish signing up.
          </p>
          <Link to="/login" className="btn-secondary w-full">Back to sign in</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Split anything." subtitle="With anyone." tagline="Create your account to start a group.">
      <form onSubmit={handleSubmit} className="card space-y-5 p-7 sm:p-8">
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label htmlFor="name" className="label">Your name</label>
          <input id="name" className="input-field" value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} autoComplete="name" placeholder="What friends call you" />
        </div>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <label htmlFor="password" className="label">Password</label>
          <input id="password" type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" placeholder="At least 6 characters" />
        </div>
        <button type="submit" className="btn-primary h-12 w-full" disabled={loading}>
          {loading ? 'Creating account…' : 'Create account'}
        </button>
        <p className="text-center text-sm text-slate-500">
          Have an account?{' '}
          <Link to="/login" className="font-medium text-ink underline decoration-brand-500 decoration-2 underline-offset-4 hover:decoration-ink">
            Sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
