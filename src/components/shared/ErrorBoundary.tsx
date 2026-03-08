/**
 * ErrorBoundary — Catches React render errors
 * 
 * Prevents white screen of death. Shows recovery UI with
 * option to reload or return to chat.
 */

import { Component, type ReactNode, type ErrorInfo } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[ErrorBoundary] Caught render error:', error, info.componentStack);
  }

  handleReload = (): void => {
    window.location.reload();
  };

  handleRecover = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.hash = '';
    window.location.pathname = '/';
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            gap: '16px',
            padding: '32px',
            fontFamily: 'var(--font-sans, system-ui)',
            background: 'var(--color-surface-0, #111)',
            color: 'var(--color-text-1, #eee)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: 'var(--color-error-ghost, hsl(354 40% 14%))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
            }}
            aria-hidden="true"
          >
            ⚠
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 600, margin: 0 }}>
            Something went wrong
          </h1>
          <p
            style={{
              fontSize: '0.875rem',
              color: 'var(--color-text-2, #999)',
              maxWidth: 400,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            BYOK Chat encountered an unexpected error. Your conversations are safely stored locally.
          </p>
          {this.state.error && (
            <details
              style={{
                fontSize: '0.75rem',
                color: 'var(--color-text-3, #666)',
                maxWidth: 500,
                padding: '8px 12px',
                background: 'var(--color-surface-1, #1a1a1a)',
                borderRadius: 6,
                border: '1px solid var(--color-border-1, #333)',
              }}
            >
              <summary style={{ cursor: 'pointer', marginBottom: 4 }}>Error details</summary>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0, fontFamily: 'var(--font-mono, monospace)' }}>
                {this.state.error.message}
              </pre>
            </details>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={this.handleRecover}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: '1px solid var(--color-border-2, #444)',
                background: 'var(--color-surface-2, #222)',
                color: 'var(--color-text-1, #eee)',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Return to Chat
            </button>
            <button
              onClick={this.handleReload}
              style={{
                padding: '8px 16px',
                borderRadius: 6,
                border: 'none',
                background: 'var(--color-primary, hsl(8 74% 52%))',
                color: 'white',
                cursor: 'pointer',
                fontSize: '0.875rem',
                fontWeight: 500,
              }}
            >
              Reload App
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
