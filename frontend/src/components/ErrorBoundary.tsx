import { Component, type ErrorInfo, type ReactNode } from 'react';
import { AlertTriangle, RotateCcw, Home } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught application error:', error, errorInfo);
  }

  private handleReload = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  private handleGoHome = () => {
    this.setState({ hasError: false, error: null });
    window.location.href = '/dashboard';
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div
          style={{
            minHeight: '100vh',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
            background: 'var(--bg-base, #08090d)',
            color: '#f8fafc',
            fontFamily: "'Inter', sans-serif",
          }}
        >
          <div
            className="studio-card"
            style={{
              maxWidth: 520,
              width: '100%',
              padding: 36,
              background: 'rgba(14, 18, 28, 0.95)',
              border: '1px solid rgba(244, 63, 94, 0.3)',
              borderRadius: 16,
              textAlign: 'center',
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
            }}
          >
            <div
              style={{
                width: 56,
                height: 56,
                borderRadius: 14,
                background: 'rgba(244, 63, 94, 0.12)',
                border: '1px solid rgba(244, 63, 94, 0.3)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#f43f5e',
                marginBottom: 16,
              }}
            >
              <AlertTriangle size={28} />
            </div>

            <h2
              style={{
                fontSize: 20,
                fontWeight: 700,
                fontFamily: "'Space Grotesk', sans-serif",
                color: '#f8fafc',
                marginBottom: 8,
              }}
            >
              Application Interface Recovered
            </h2>

            <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.6, marginBottom: 20 }}>
              An unexpected render anomaly occurred. Your interview audio session data and ledger are safely preserved in SQLite.
            </p>

            {this.state.error && (
              <div
                style={{
                  background: 'rgba(0, 0, 0, 0.4)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                  borderRadius: 8,
                  padding: 12,
                  marginBottom: 24,
                  fontSize: 11,
                  fontFamily: "'JetBrains Mono', monospace",
                  color: '#fda4af',
                  textAlign: 'left',
                  maxHeight: 120,
                  overflowY: 'auto',
                  wordBreak: 'break-all',
                }}
              >
                {this.state.error.message || String(this.state.error)}
              </div>
            )}

            <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
              <button
                type="button"
                onClick={this.handleReload}
                className="btn-primary"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                }}
              >
                <RotateCcw size={14} />
                <span>Reload Page</span>
              </button>

              <button
                type="button"
                onClick={this.handleGoHome}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '10px 18px',
                  fontSize: 13,
                  background: 'rgba(255, 255, 255, 0.06)',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: 8,
                  color: '#f8fafc',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                <Home size={14} />
                <span>Go to Dashboard</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
