type ClientErrorPayload = {
  message: string;
  stack?: string;
  url?: string;
  userAgent?: string;
  build?: string;
  context?: Record<string, unknown>;
};

export const reportClientError = (error: Error, context?: Record<string, unknown>) => {
  if (typeof window === "undefined") return;
  const payload: ClientErrorPayload = {
    message: error.message || "Unknown error",
    stack: error.stack,
    url: window.location?.href,
    userAgent: navigator?.userAgent,
    build: (window as any).__APP_WARP_BUILD,
    context,
  };
  const body = JSON.stringify(payload);
  try {
    if (navigator?.sendBeacon) {
      const blob = new Blob([body], { type: "application/json" });
      navigator.sendBeacon("/api/observability/client-error", blob);
      return;
    }
  } catch {
    // ignore sendBeacon failures
  }
  fetch("/api/observability/client-error", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => {
    // ignore reporting failures
  });
};
