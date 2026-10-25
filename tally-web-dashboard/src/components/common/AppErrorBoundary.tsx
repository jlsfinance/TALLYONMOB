import React from 'react';
import { AlertTriangle, LifeBuoy, RefreshCw, ShieldCheck } from 'lucide-react';
import { APP_INFO } from '../../config/appInfo';

interface AppErrorBoundaryProps {
    children: React.ReactNode;
}

interface AppErrorBoundaryState {
    hasError: boolean;
    errorMessage: string;
}

export default class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
    state: AppErrorBoundaryState = {
        hasError: false,
        errorMessage: '',
    };

    static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
        return {
            hasError: true,
            errorMessage: error?.message || 'Unexpected application error',
        };
    }

    componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
        console.error('AppErrorBoundary caught a rendering error', {
            message: error?.message,
            stack: error?.stack,
            componentStack: errorInfo.componentStack,
        });
    }

    private handleRetry = () => {
        this.setState({ hasError: false, errorMessage: '' });
    };

    private handleReload = () => {
        window.location.reload();
    };

    render() {
        if (!this.state.hasError) {
            return this.props.children;
        }

        return (
            <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(14,165,233,0.12),transparent_32%),var(--background)] px-4 py-10 text-[var(--on-background)] sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl rounded-[32px] border border-[var(--border)] bg-[var(--surface)]/95 p-8 shadow-[var(--shadow-xl)]">
                    <div className="inline-flex items-center gap-2 rounded-full bg-[var(--error-bg)] px-4 py-2 text-xs font-black uppercase tracking-[0.22em] text-[var(--error)]">
                        <AlertTriangle size={16} />
                        Protected recovery mode
                    </div>

                    <h1 className="mt-5 text-4xl font-black tracking-[-0.04em] text-[var(--on-surface)]">
                        The app hit an unexpected state.
                    </h1>
                    <p className="mt-4 text-sm leading-7 text-[var(--on-surface-variant)] sm:text-base">
                        We added a hard fallback so a rendering crash does not leave users on a blank screen. You can retry the session, reload the app, or contact support.
                    </p>

                    <div className="mt-6 rounded-[24px] border border-[var(--border)] bg-[var(--background)]/80 p-4 text-sm text-[var(--on-surface-variant)]">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[var(--text-muted)]">Last error</p>
                        <p className="mt-2 break-words font-medium text-[var(--on-surface)]">{this.state.errorMessage || 'Unknown rendering failure'}</p>
                    </div>

                    <div className="mt-6 grid gap-3 sm:grid-cols-3">
                        <button onClick={this.handleRetry} className="inline-flex items-center justify-center gap-2 rounded-full bg-[var(--primary)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-primary)] transition-transform hover:scale-[1.01]">
                            <RefreshCw size={16} />
                            Retry
                        </button>
                        <button onClick={this.handleReload} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                            <ShieldCheck size={16} />
                            Reload app
                        </button>
                        <a href={`mailto:${APP_INFO.supportEmail}`} className="inline-flex items-center justify-center gap-2 rounded-full border border-[var(--border)] px-5 py-3 text-sm font-black uppercase tracking-[0.16em] text-[var(--on-surface)] transition-colors hover:bg-[var(--surface-hover)]">
                            <LifeBuoy size={16} />
                            Contact support
                        </a>
                    </div>
                </div>
            </div>
        );
    }
}
