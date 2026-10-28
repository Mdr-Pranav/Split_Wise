import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AuthShell, { ErrorNote } from '../components/AuthShell';

export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await resetPassword(email.trim());
      setSent(true);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell title="Forgot it?" subtitle="Happens to everyone.">
      <form onSubmit={handleSubmit} className="card space-y-5 p-7 sm:p-8">
        {sent ? (
          <p className="text-[15px] leading-relaxed text-slate-600">
            If an account exists for <span className="font-medium text-ink">{email}</span>, a reset link is on its way.
          </p>
        ) : (
          <>
            <ErrorNote>{error}</ErrorNote>
            <div>
              <label htmlFor="email" className="label">Email</label>
              <input id="email" type="email" className="input-field" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
            </div>
            <button type="submit" className="btn-primary h-12 w-full" disabled={loading}>
              {loading ? 'Sending…' : 'Send reset link'}
            </button>
          </>
        )}
        <p className="text-center text-sm text-slate-500">
          <Link to="/login" className="font-medium text-ink underline decoration-brand-500 decoration-2 underline-offset-4 hover:decoration-ink">
            Back to sign in
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
