import React, {
  Component,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import ReactDOM from 'react-dom/client';

import App from './App';

import './index.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class AppErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  public state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(
    error: Error,
  ): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  public componentDidCatch(
    error: Error,
    errorInfo: ErrorInfo,
  ): void {
    console.error(
      'EDITOR X application error:',
      error,
      errorInfo,
    );
  }

  private handleReload = (): void => {
    window.location.reload();
  };

  public render(): ReactNode {
    if (!this.state.hasError) {
      return this.props.children;
    }

    const errorMessage =
      this.state.error?.message ||
      'An unexpected application error occurred.';

    return (
      <div className="min-h-screen bg-gray-950 text-white flex items-center justify-center p-6">
        <main
          className="w-full max-w-xl rounded-xl border border-gray-800 bg-gray-900 p-6 shadow-2xl"
          role="alert"
          aria-labelledby="editor-x-error-title"
        >
          <div className="mb-5">
            <div className="mb-3 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500/10 text-red-400">
                <span
                  className="text-lg font-bold"
                  aria-hidden="true"
                >
                  !
                </span>
              </div>

              <div>
                <h1
                  id="editor-x-error-title"
                  className="text-base font-semibold"
                >
                  EDITOR X encountered an error
                </h1>

                <p className="mt-1 text-sm text-gray-400">
                  The workspace could not continue safely.
                </p>
              </div>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-gray-800 bg-black/30 p-3">
            <p className="break-words font-mono text-xs leading-5 text-gray-400">
              {errorMessage}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              type="button"
              onClick={this.handleReload}
              className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-900"
            >
              Reload EDITOR X
            </button>

            <p className="text-xs text-gray-500">
              Reloading recreates the application runtime.
            </p>
          </div>
        </main>
      </div>
    );
  }
}

const rootElement =
  document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'EDITOR X: root element was not found.',
  );
}

const root =
  ReactDOM.createRoot(rootElement);

root.render(
  <React.StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </React.StrictMode>,
);