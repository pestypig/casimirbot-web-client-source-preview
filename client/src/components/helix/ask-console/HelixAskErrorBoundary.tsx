import React, { Component, type ErrorInfo, type ReactNode } from "react";
import { reportClientError } from "@/lib/observability/client-error";

type HelixAskErrorBoundaryState = { hasError: boolean; error?: Error };

export class HelixAskErrorBoundary extends Component<{ children: ReactNode }, HelixAskErrorBoundaryState> {
  state: HelixAskErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(error: Error): HelixAskErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("[helix-ask] render error:", error, info);
    reportClientError(error, { componentStack: info.componentStack, scope: "helix-ask" });
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: undefined });
  };

  handleReload = () => {
    if (typeof window === "undefined") return;
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;
    const message = this.state.error?.message || "Unexpected Helix Ask error.";
    return (
      <div className="pointer-events-auto rounded-2xl border border-amber-200/30 bg-amber-500/10 p-4 text-xs text-amber-100">
        <p className="text-[11px] uppercase tracking-[0.2em] text-amber-200">Helix Ask paused</p>
        <p className="mt-2">
          The Helix Ask panel hit a rendering error. You can retry or reload the page.
        </p>
        <pre className="mt-2 max-h-24 overflow-auto rounded bg-black/40 p-2 text-[10px] text-amber-100/80">
          {message}
        </pre>
        <div className="mt-2 flex gap-2">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-error-boundary.retry"
            className="rounded-full border border-amber-200/40 bg-amber-200/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-200/20"
            onClick={this.handleRetry}
            type="button"
          >
            Retry
          </button>
          <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-error-boundary.reload"
            className="rounded-full border border-amber-200/40 bg-amber-200/10 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-amber-100 hover:bg-amber-200/20"
            onClick={this.handleReload}
            type="button"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }
}
