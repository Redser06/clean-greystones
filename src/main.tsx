import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

class AppErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; errorMessage: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: unknown) {
    return {
      hasError: true,
      errorMessage: error instanceof Error ? error.message : 'Unexpected render error',
    };
  }

  componentDidCatch(error: unknown, info: React.ErrorInfo) {
    console.error('Clean Greystones UI Error Boundary caught error:', error, info);
  }

  handleResetCacheAndReload = () => {
    try {
      localStorage.removeItem('clean-greystones.reports.v1');
      localStorage.removeItem('clean-greystones.events.v1');
      localStorage.removeItem('clean-greystones.bins.v1');
    } catch {
      // ignore storage errors
    }
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f8faf8] p-6 text-[#0b1c30] font-sans">
          <div className="max-w-md w-full bg-white border border-[#d6e0da] rounded-2xl p-6 shadow-md space-y-4 text-center">
            <img src="/logo.svg" alt="Clean Greystones" className="w-12 h-12 mx-auto" />
            <h1 className="text-lg font-bold">Clean Greystones encountered a display error</h1>
            <p className="text-xs text-[#4b5e54]">
              A cached map record could not be rendered ({this.state.errorMessage}). Resetting the local map cache will restore the live view.
            </p>
            <button
              type="button"
              onClick={this.handleResetCacheAndReload}
              className="w-full py-2.5 px-4 rounded-xl bg-[#006948] text-white text-xs font-bold hover:opacity-95"
            >
              Reset Local Cache &amp; Reload Map
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

if (typeof window !== 'undefined' && 'serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => {
        console.log('Clean Greystones PWA Service Worker registered:', reg.scope);
      })
      .catch((err) => {
        console.warn('PWA Service Worker registration failed:', err);
      });
  });
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>
);

