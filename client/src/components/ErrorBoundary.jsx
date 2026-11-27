// Catches a crash anywhere in the page tree and shows the crash screen instead of a blank page
import { Component } from 'react';
import { House, RotateCw } from 'lucide-react';
import ErrorScreen from './ErrorScreen';

// Home of the app: "/" locally, the bucket's index.html in the Floci build (# links)
const homeUrl = () => (import.meta.env.VITE_ROUTER === 'hash' ? window.location.pathname : '/');

export default class ErrorBoundary extends Component {
  state = { error: null };

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[OfficeOurs] page crashed:', error, info?.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;
    return (
      <ErrorScreen
        variant="crash"
        code="Oops"
        kicker="well, that was not supposed to happen,"
        title="This page tripped over its own shoelaces"
        text="Something broke while showing this page. Reloading usually fixes it, and your bookings and requests are safe."
        details={error?.message || String(error)}
      >
        <button type="button" className="btn btn-primary" onClick={() => window.location.reload()}>
          <RotateCw size={18} aria-hidden="true" /> Reload the page
        </button>
        <button type="button" className="btn" onClick={() => window.location.assign(homeUrl())}>
          <House size={18} aria-hidden="true" /> Go home
        </button>
      </ErrorScreen>
    );
  }
}
