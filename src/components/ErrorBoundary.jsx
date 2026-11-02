import { Component } from 'react';
import Logo from './Logo';

// Catches a crash while drawing a screen so the app shows a way out instead
// of a blank page. resetKey (the current path) clears it on navigation.
export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error(error, info?.componentStack);
  }

  componentDidUpdate(prev) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    // After a new deploy an old tab can ask for files that are gone
    const stale = /dynamically imported module|Loading chunk|Importing a module script failed/i.test(error.message || '');
    return (
      <div className="flex min-h-[70vh] items-center justify-center px-4">
        <div className="card w-full max-w-md py-10 text-center">
          <Logo className="mx-auto mb-4 h-10 w-10" />
          <h1 className="text-[22px] font-semibold text-ink">{stale ? 'A new version is out' : 'Something went wrong'}</h1>
          <p className="mt-2 text-[15px] text-slate-600">
            {stale ? 'Reload to get it.' : 'This screen hit a problem. Your data is safe; reloading usually fixes it.'}
          </p>
          <div className="mt-6 flex justify-center gap-2">
            <button type="button" className="btn-primary" onClick={() => window.location.reload()}>
              Reload
            </button>
            <a href="/" className="btn-secondary">
              Go home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
