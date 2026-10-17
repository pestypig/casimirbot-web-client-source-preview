import React, { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from "@/lib/agent-access/connectionObservation";
import {
  CircleAlert,
  ExternalLink,
  Link2,
  LoaderCircle,
  RefreshCw,
  Unlink,
  UserRoundX,
} from "lucide-react";
import {
  DESKTOP_AUTH0_ACCOUNT_LINK_START_PATH,
  parseDesktopAuth0AccountLinkCompletion,
  parseDesktopAuth0AccountLinkStartReceipt,
} from "@shared/desktop-auth0-account-link";

export const AGENT_ACCOUNT_BINDINGS_ENDPOINT =
  "/api/account/session/agent-bindings";

export type SanitizedAgentAccountBinding = {
  provider: string;
  issuer: string;
  status: "active" | "revoked";
  tenantRef: string;
};

export type AgentAccountBindingReadinessState =
  | {
      kind: "loading";
      bindings: readonly [];
    }
  | {
      kind: "linked";
      bindings: readonly SanitizedAgentAccountBinding[];
    }
  | {
      kind: "not_linked";
      bindings: readonly SanitizedAgentAccountBinding[];
    }
  | {
      kind: "signed_out";
      bindings: readonly [];
    }
  | {
      kind: "unavailable";
      bindings: readonly [];
    };

type RecordLike = Record<string, unknown>;

const EMPTY_BINDINGS = [] as const;

const isRecord = (value: unknown): value is RecordLike =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const sanitizedDisplayText = (
  value: unknown,
  maxLength: number,
): string | null => {
  if (typeof value !== "string") return null;
  const normalized = value
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
  return normalized || null;
};

const sanitizedIssuer = (value: unknown): string | null => {
  const candidate = sanitizedDisplayText(value, 512);
  if (!candidate) return null;
  try {
    const parsed = new URL(candidate);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password) {
      return null;
    }
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
};

const sanitizedTenantRef = (value: unknown): string | null => {
  const candidate = sanitizedDisplayText(value, 96);
  return candidate && /^tenant:sha256:[a-f0-9]{8,64}$/i.test(candidate)
    ? candidate
    : null;
};

const sanitizedProvider = (value: unknown): string | null => {
  const candidate = sanitizedDisplayText(value, 80);
  return candidate && /^[a-z0-9][a-z0-9._: -]*$/i.test(candidate)
    ? candidate
    : null;
};

const sanitizedBinding = (
  value: unknown,
): SanitizedAgentAccountBinding | null => {
  if (!isRecord(value)) return null;
  if (value.subject_included !== false || value.bearer_included !== false) {
    return null;
  }
  const provider = sanitizedProvider(value.provider);
  const issuer = sanitizedIssuer(value.issuer);
  const tenantRef = sanitizedTenantRef(value.tenant_ref);
  const status =
    value.status === "active" || value.status === "revoked"
      ? value.status
      : null;
  if (!provider || !issuer || !tenantRef || !status) return null;
  return {
    provider,
    issuer,
    status,
    tenantRef,
  };
};

export const parseAgentAccountBindingReadiness = (
  value: unknown,
): Exclude<
  AgentAccountBindingReadinessState,
  { kind: "loading" | "signed_out" | "unavailable" }
> | null => {
  if (
    !isRecord(value) ||
    value.schema !== "helix.agent_account_bindings.v1" ||
    typeof value.oauth_ready !== "boolean" ||
    !Array.isArray(value.bindings)
  ) {
    return null;
  }
  const bindings = value.bindings
    .map(sanitizedBinding)
    .filter(
      (binding): binding is SanitizedAgentAccountBinding => binding !== null,
    );
  const hasActiveBinding = bindings.some(
    (binding) => binding.status === "active",
  );
  if (value.oauth_ready !== hasActiveBinding) return null;
  return {
    kind: hasActiveBinding ? "linked" : "not_linked",
    bindings,
  };
};

const stateCopy = (
  state: AgentAccountBindingReadinessState,
): {
  title: string;
  body: string;
  badge: string;
  icon: typeof Link2;
  tone: string;
} => {
  switch (state.kind) {
    case "linked":
      return {
        title: "Account linked for agent access",
        body: "This signed-in profile has an active, server-verified OAuth account link. This does not bind a Helix chat to a particular AI task; complete the separate exact-task binding step below.",
        badge: "Active account link",
        icon: Link2,
        tone: "border-emerald-300/25 bg-emerald-400/10 text-emerald-100",
      };
    case "not_linked":
      return {
        title: "No active agent binding",
        body: "This signed-in profile has no active OAuth agent binding. This read-only panel cannot create, reactivate, or authorize one.",
        badge: "Not linked",
        icon: Unlink,
        tone: "border-amber-300/25 bg-amber-400/10 text-amber-100",
      };
    case "signed_out":
      return {
        title: "Sign in to check binding status",
        body: "A workstation account session is required to inspect agent bindings. Signing in does not add the MCP endpoint or grant an AI client access.",
        badge: "Signed out",
        icon: UserRoundX,
        tone: "border-slate-300/20 bg-slate-400/10 text-slate-200",
      };
    case "unavailable":
      return {
        title: "Binding readiness unavailable",
        body: "The account-binding status service is unavailable or not configured. No agent access has been inferred.",
        badge: "Configuration unavailable",
        icon: CircleAlert,
        tone: "border-rose-300/25 bg-rose-400/10 text-rose-100",
      };
    case "loading":
      return {
        title: "Checking account binding",
        body: "Reading the current workstation account's sanitized agent-binding projection.",
        badge: "Checking",
        icon: LoaderCircle,
        tone: "border-cyan-300/25 bg-cyan-400/10 text-cyan-100",
      };
  }
};

export function AgentAccountBindingReadiness() {
  const [state, setState] = useState<AgentAccountBindingReadinessState>({
    kind: "loading",
    bindings: EMPTY_BINDINGS,
  });
  const [linkBusy, setLinkBusy] = useState(false);
  const [awaitingCallback, setAwaitingCallback] = useState(false);
  const [linkDeadline, setLinkDeadline] = useState<number | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const activeRequest = useRef<AbortController | null>(null);
  const linkWaitGeneration = useRef(0);
  const linkStartRequest = useRef<AbortController | null>(null);

  const refresh = useCallback((): void => {
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    setState({ kind: "loading", bindings: EMPTY_BINDINGS });
    const deadline = window.setTimeout(() => {
      if (activeRequest.current !== controller) return;
      controller.abort();
      activeRequest.current = null;
      setState({ kind: "unavailable", bindings: EMPTY_BINDINGS });
    }, 15_000);
    controller.signal.addEventListener("abort", () => window.clearTimeout(deadline), { once: true });

    void fetch(AGENT_ACCOUNT_BINDINGS_ENDPOINT, {
      method: "GET",
      credentials: "same-origin",
      cache: "no-store",
      headers: {
        Accept: "application/json",
      },
      signal: controller.signal,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return;
        if (response.status === 401) {
          setState({ kind: "signed_out", bindings: EMPTY_BINDINGS });
          return;
        }
        if (!response.ok) {
          setState({ kind: "unavailable", bindings: EMPTY_BINDINGS });
          return;
        }
        const parsed = parseAgentAccountBindingReadiness(await response.json());
        if (controller.signal.aborted || activeRequest.current !== controller) return;
        setState(parsed ?? { kind: "unavailable", bindings: EMPTY_BINDINGS });
      })
      .catch((error: unknown) => {
        if (
          controller.signal.aborted ||
          (error instanceof DOMException && error.name === "AbortError")
        ) {
          return;
        }
        setState({ kind: "unavailable", bindings: EMPTY_BINDINGS });
      })
      .finally(() => {
        window.clearTimeout(deadline);
        if (activeRequest.current === controller) {
          activeRequest.current = null;
        }
      });
  }, []);

  useEffect(() => {
    refresh();
    window.addEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, refresh);
    return () => {
      window.removeEventListener(AGENT_CONNECTION_INVALIDATED_EVENT, refresh);
      linkWaitGeneration.current += 1;
      linkStartRequest.current?.abort();
      activeRequest.current?.abort();
      activeRequest.current = null;
    };
  }, [refresh]);

  useEffect(() => {
    if (!linkBusy || !awaitingCallback || linkDeadline === null) return;
    const timer = window.setTimeout(() => {
      linkWaitGeneration.current += 1;
      linkStartRequest.current?.abort();
      setLinkBusy(false);
      setAwaitingCallback(false);
      setLinkError("The authorization wait reached its deadline on this device. Checking account status; close the old authorization page before retrying. No access has been inferred.");
      refresh();
    }, Math.max(0, Math.min(600_000, linkDeadline - Date.now())));
    return () => window.clearTimeout(timer);
  }, [linkBusy, awaitingCallback, linkDeadline, refresh]);

  useEffect(() => {
    const subscribe = window.casimirDesktop?.onAuth0AccountLinkCompletion;
    if (!subscribe) return;
    return subscribe((candidate) => {
      const completion = parseDesktopAuth0AccountLinkCompletion(candidate);
      linkWaitGeneration.current += 1;
      linkStartRequest.current?.abort();
      setLinkBusy(false);
      setAwaitingCallback(false);
      if (!completion) {
        setLinkError(
          "The desktop host returned an invalid account-link receipt.",
        );
        return;
      }
      if (!completion.ok) {
        const message =
          completion.error === "signed_tenant_claim_missing"
            ? "Auth0 signed in, but its access token is missing the CasimirBot tenant claim. Check the Auth0 post-login Action and try again."
            : completion.error === "verified_identity_mismatch"
              ? "Auth0 signed in, but CasimirBot could not verify the issued access token for this profile."
              : completion.error === "token_exchange_failed"
                ? "Auth0 authorized the link, but its token exchange failed. Try again."
                : completion.error === "link_intent_expired"
                  ? "The Auth0 link request expired. Start a new link."
                  : "Auth0 account linking did not complete. You can try again.";
        setLinkError(message);
        return;
      }
      setLinkError(null);
      refresh();
    });
  }, [refresh]);

  const startAccountLink = useCallback(async (): Promise<void> => {
    const open = window.casimirDesktop?.openAuth0AccountLink;
    if (!open) return;
    const generation = ++linkWaitGeneration.current;
    linkStartRequest.current?.abort();
    const startController = new AbortController();
    linkStartRequest.current = startController;
    setLinkBusy(true);
    // Bound preparation as well as the later browser callback wait.
    setLinkDeadline(Date.now() + 15_000);
    setAwaitingCallback(true);
    setLinkError(null);
    try {
      const response = await fetch(DESKTOP_AUTH0_ACCOUNT_LINK_START_PATH, {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { Accept: "application/json" },
        signal: startController.signal,
      });
      const body = await response.json().catch(() => null);
      if (generation !== linkWaitGeneration.current) return;
      if (!response.ok) {
        throw new Error("start failed");
      }
      const receipt = parseDesktopAuth0AccountLinkStartReceipt(body);
      if (!receipt) throw new Error("invalid receipt");
      setLinkDeadline(Date.parse(receipt.expires_at));
      // The native bridge may never settle. Recovery must cover that wait too.
      setAwaitingCallback(true);
      await open(receipt.authorization_url);
      // Remain busy until the private loopback callback is completed or the user
      // explicitly retries. No OAuth credential is returned to this renderer.
    } catch (caught) {
      if (generation !== linkWaitGeneration.current) return;
      setLinkBusy(false);
      setAwaitingCallback(false);
      setLinkError(
        caught instanceof Error && caught.message.includes("desktop_auth0_callback_port_unavailable")
          ? "CasimirBot cannot reserve its private Auth0 return port on this device. Close any other active CasimirBot authentication attempt, then retry."
          : caught instanceof Error && caught.message.includes("desktop_auth0_callback_route_unavailable")
          ? "This CasimirBot instance cannot receive its Auth0 callback because the desktop protocol is not routed to this exact profile. Use the registered installation or repair the protocol association before retrying."
          : "Auth0 account linking is unavailable or not configured in this desktop build.",
      );
    } finally {
      if (linkStartRequest.current === startController) linkStartRequest.current = null;
    }
  }, []);

  const copy = stateCopy(state);
  const StateIcon = copy.icon;
  const canStartLink =
    state.kind === "not_linked" &&
    typeof window.casimirDesktop?.openAuth0AccountLink === "function";
  const body = canStartLink
    ? "This signed-in profile has no active OAuth agent binding. Link Auth0 in the native app before Codex can receive an authorized Device Check identity."
    : copy.body;

  return (
    <section
      className="rounded-xl border border-white/10 bg-slate-950/80 p-4 shadow-[0_18px_70px_-48px_rgba(34,211,238,0.65)]"
      aria-labelledby="agent-account-binding-readiness-title"
      data-agent-binding-readiness={state.kind}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <div className={`rounded-lg border p-2 ${copy.tone}`}>
            <StateIcon
              className={`h-5 w-5 ${
                state.kind === "loading" ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-cyan-300">
              OAuth account readiness
            </p>
            <h2
              id="agent-account-binding-readiness-title"
              className="mt-1 text-base font-semibold text-white"
            >
              {copy.title}
            </h2>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${copy.tone}`}
          >
            {copy.badge}
          </span>
          <button
            data-helix-control-id="workstation.panel.agent-access.agent-account-binding-readiness.refresh-binding-status"
            data-helix-interaction-kind="observe"
            data-helix-authority-state="client_local"
            type="button"
            onClick={refresh}
            disabled={state.kind === "loading"}
            className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-slate-200 transition hover:bg-white/10 disabled:cursor-wait disabled:opacity-50"
            aria-label="Refresh binding status"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${
                state.kind === "loading" ? "animate-spin" : ""
              }`}
              aria-hidden="true"
            />
            Refresh
          </button>
          {canStartLink ? (
            <button
              data-helix-guidance-target="auth0-account-link"
              data-helix-guidance-label="Choose Link Auth0 to open the secure native sign-in window."
              data-helix-control-id="workstation.panel.agent-access.agent-account-binding-readiness.void-start-account-link"
              data-helix-interaction-kind="act"
              data-helix-authority-state="client_local"
              type="button"
              onClick={() => void startAccountLink()}
              disabled={linkBusy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/25 bg-cyan-400/10 px-2.5 py-1.5 text-[11px] font-medium text-cyan-100 transition hover:bg-cyan-400/20 disabled:cursor-wait disabled:opacity-50"
            >
              {linkBusy ? (
                <LoaderCircle
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {linkBusy ? "Waiting for Auth0" : "Link Auth0"}
            </button>
          ) : null}
          {linkBusy && awaitingCallback ? (
            <button
              type="button"
              onClick={() => {
                linkWaitGeneration.current += 1;
                linkStartRequest.current?.abort();
                setAwaitingCallback(false);
                setLinkBusy(false);
                setLinkError("Stopped waiting here. Close the previous authorization page before choosing Link Auth0 again. This does not cancel an authorization already submitted.");
                refresh();
              }}
              className="rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-slate-200"
            >
              Stop waiting
            </button>
          ) : null}
        </div>
      </div>

      <p
        className="mt-3 text-xs leading-5 text-slate-300"
        role="status"
        aria-live="polite"
      >
        {body}
      </p>

      {linkError ? (
        <p className="mt-2 text-xs text-rose-200" role="alert">
          {linkError}
        </p>
      ) : null}

      {state.bindings.length > 0 ? (
        <div className="mt-4 space-y-2" aria-label="Sanitized agent bindings">
          {state.bindings.map((binding, index) => (
            <dl
              key={`${binding.issuer}:${binding.tenantRef}:${index}`}
              className="grid gap-2 rounded-lg border border-white/10 bg-black/20 p-3 text-[11px] sm:grid-cols-2"
            >
              <div className="min-w-0">
                <dt className="text-slate-500">Provider</dt>
                <dd className="mt-0.5 break-words text-slate-200">
                  {binding.provider}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Status</dt>
                <dd className="mt-0.5 text-slate-200">{binding.status}</dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Issuer</dt>
                <dd className="mt-0.5 break-all font-mono text-cyan-100/80">
                  {binding.issuer}
                </dd>
              </div>
              <div className="min-w-0">
                <dt className="text-slate-500">Tenant reference</dt>
                <dd className="mt-0.5 break-all font-mono text-slate-300">
                  {binding.tenantRef}
                </dd>
              </div>
            </dl>
          ))}
        </div>
      ) : null}

      <p className="mt-3 text-[10px] leading-4 text-slate-500">
        Status remains read-only on the website. The native app may start a
        public-client PKCE link; account subjects and credentials are never
        exposed here.
      </p>
    </section>
  );
}

export default AgentAccountBindingReadiness;
