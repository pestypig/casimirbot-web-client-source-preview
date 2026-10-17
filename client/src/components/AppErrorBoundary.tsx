import React from "react";
import { reportClientError } from "@/lib/observability/client-error";

type Props = { children: React.ReactNode };
type State = { hasError: boolean; error?: Error };

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error("[app] render error:", error, info);
    reportClientError(error, { componentStack: info.componentStack });
  }

  handleReload = () => {
    if (typeof window === "undefined") return;
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = this.state.error?.message || "Unexpected error.";
    return (
      <div className="min-h-screen w-full bg-slate-950 text-slate-100 flex items-center justify-center p-8">
        <div className="max-w-lg w-full rounded-2xl border border-white/10 bg-white/5 p-6 shadow-xl">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="mt-2 text-sm text-slate-300">
            The app hit a rendering error. Reload to try again.
          </p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-lg bg-black/40 p-3 text-xs text-slate-300">
            {message}
          </pre>
          <div className="mt-4 flex gap-2">
            <button
              className="rounded-full border border-white/10 bg-white/10 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-100 hover:bg-white/20"
              onClick={this.handleReload}
            >
              Reload
            </button>
          </div>
        </div>
      </div>
    );
  }
}
