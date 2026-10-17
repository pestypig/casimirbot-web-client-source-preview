export type HelixAskRealtimeFailurePresentation = {
  code: string;
  label: string;
  detail: string;
  retryable: boolean;
};

const FALLBACK_CODE = "realtime_session_start_failed";

const normalizeFailureCode = (value: unknown): string => {
  if (typeof value !== "string") return FALLBACK_CODE;
  const normalized = value.trim().toLowerCase();
  return /^[a-z0-9_.:-]{1,180}$/.test(normalized) ? normalized : FALLBACK_CODE;
};

export const describeHelixAskRealtimeFailure = (
  value: unknown,
): HelixAskRealtimeFailurePresentation | null => {
  if (typeof value !== "string" || !value.trim()) return null;
  const code = normalizeFailureCode(value);

  if (
    code.includes("authentication_failed") ||
    code.includes("invalid_api_key") ||
    /(?:^|_)provider_http_401(?:_|$)/.test(code)
  ) {
    return {
      code,
      label: "OpenAI rejected the Realtime credential",
      detail:
        "Open Voice connection to replace and test your OpenAI API key in the desktop harness. Browser users should check their server's OpenAI connection.",
      retryable: false,
    };
  }
  if (code.includes("access_forbidden") || code.includes("provider_http_403")) {
    return {
      code,
      label: "OpenAI denied Realtime access",
      detail:
        "Check the OpenAI project, billing, and Realtime model permissions for the configured server credential.",
      retryable: false,
    };
  }
  if (code.includes("rate_limited") || code.includes("provider_http_429")) {
    return {
      code,
      label: "OpenAI Realtime is rate limited",
      detail: "Wait for the provider retry window, then start GPT Live again.",
      retryable: true,
    };
  }
  if (code.includes("transport_timeout") || code.includes("transport_network_error")) {
    return {
      code,
      label: "OpenAI Realtime could not be reached",
      detail: "Check network or proxy access to api.openai.com, then start GPT Live again.",
      retryable: true,
    };
  }
  if (code.includes("microphone_permission_denied")) {
    return {
      code,
      label: "Microphone permission was denied",
      detail: "Allow microphone access for this local app, then start GPT Live again.",
      retryable: true,
    };
  }
  if (code.includes("browser_media_api_unavailable")) {
    return {
      code,
      label: "Microphone capture is unavailable in this browser",
      detail: "Open CasimirBot in Chrome or Edge, or use a desktop host that enables microphone capture.",
      retryable: false,
    };
  }
  if (code.includes("microphone_not_found")) {
    return {
      code,
      label: "No microphone was found",
      detail: "Connect or enable a microphone, then start GPT Live again.",
      retryable: true,
    };
  }
  if (code.includes("provider_http_400") || code.includes("invalid_request")) {
    return {
      code,
      label: "OpenAI rejected the Realtime session setup",
      detail: "The server credential was accepted far enough to evaluate the request, but the session contract was rejected.",
      retryable: false,
    };
  }

  return {
    code,
    label: "GPT Live could not start",
    detail: "Review the typed Realtime failure in Helix diagnostics, then retry after correcting it.",
    retryable: false,
  };
};
