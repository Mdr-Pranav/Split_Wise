import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isDemo } from '../lib/auth';
import AuthShell, { ErrorNote } from '../components/AuthShell';

export default function Login() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState(isDemo ? 'pranav@demo.app' : '');
  const [password, setPassword] = useState(isDemo ? 'demo' : '');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Welcome back." subtitle="Let's settle up." tagline="Split bills with friends, minus the awkward maths.">
      <form onSubmit={handleSubmit} className="card space-y-5 p-7 sm:p-8">
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </div>
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label htmlFor="password" className="label mb-0">Password</label>
            <Link to="/forgot-password" className="text-[13px] font-medium text-brand-600 hover:text-brand-700">
              Forgot password?
            </Link>
          </div>
          <input id="password" type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
        </div>
        <button type="submit" className="btn-primary h-12 w-full" disabled={loading}>
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <p className="text-center text-sm text-slate-500">
          No account?{' '}
          <Link to="/signup" className="font-medium text-ink underline decoration-brand-500 decoration-2 underline-offset-4 hover:decoration-ink">
            Create one
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
