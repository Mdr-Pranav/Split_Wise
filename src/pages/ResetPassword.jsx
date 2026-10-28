import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell, { ErrorNote } from '../components/AuthShell';

// Landing page for the emailed reset link; Supabase signs the user in from the URL
export default function ResetPassword() {
  const { session, loading: authLoading, updatePassword, setRecovering } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await updatePassword(password);
      setRecovering(false);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (!authLoading && !session) {
    return (
      <AuthShell title="Link expired." subtitle="Try again.">
        <div className="card p-7 text-center sm:p-8">
          <Link to="/forgot-password" className="btn-primary w-full">Request a new link</Link>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="New password." subtitle="Make it a good one.">
      <form onSubmit={handleSubmit} className="card space-y-5 p-7 sm:p-8">
        <ErrorNote>{error}</ErrorNote>
        <div>
          <label htmlFor="password" className="label">New password</label>
          <input id="password" type="password" className="input-field" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6} autoComplete="new-password" />
        </div>
        <button type="submit" className="btn-primary h-12 w-full" disabled={loading}>
          {loading ? 'Saving…' : 'Save password'}
        </button>
      </form>
    </AuthShell>
  );
}
