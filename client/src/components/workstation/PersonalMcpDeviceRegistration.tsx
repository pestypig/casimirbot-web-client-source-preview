import { useEffect, useRef, useState } from "react";
import { Plug, ShieldCheck } from "lucide-react";
import { personalMcpP1UnavailableMessage } from
  "@/lib/workstation/personalMcpP1Availability";
import { AGENT_CONNECTION_INVALIDATED_EVENT } from
  "@/lib/agent-access/connectionObservation";

type Result = { available?: boolean; checkAvailable?: boolean;
  stage?: string;
  phase?: "ready" | "browser_opened" | "busy" | "account_required" |
    "approved" | "not_approved" | "unavailable" | "build_unavailable" |
    "codex_unavailable" | "website_unavailable" | "device_required" |
    "approval_required" | "reconnected" };

type Completion = { phase?: unknown; stage?: unknown } | null;

const connectionConflictMessage = "A conflicting CasimirBot connection prevents setup for this account. Review the CasimirBot MCP entries in Codex and restore this account's separate entry, then choose Reconnect Codex. Keep the other account's connection if you still use it.";

function completionMessage(state: Completion): string | null {
  if (state?.phase !== "configured" && state?.phase !== "approval_failed")
    return null;
  if (state.phase === "approval_failed" && state.stage === "codex_registration_conflict")
    return connectionConflictMessage;
  const failureStage = typeof state.stage === "string" && ["handoff", "owner_check",
    "local_service", "codex_registration", "binding_recheck",
    "codex_confirmation", "pending_cleanup", "codex_rollback"].includes(state.stage)
    ? ` (stage: ${state.stage})` : "";
  return state.phase === "configured"
    ? "Codex local access is configured. Keep CasimirBot open. Restart Codex to load its MCP server, then return to this same chat and check its tools. You do not need to repeat computer approval."
    : `Codex approval did not complete${failureStage}. Check the browser result and connection status before retrying.`;
}

export function PersonalMcpDeviceRegistration({ sessionId }: { sessionId: string }) {
  const [available, setAvailable] = useState(false);
  const [p1Available, setP1Available] = useState(false);
  const [p1Phase, setP1Phase] = useState<Result["phase"]>(undefined);
  const [checkAvailable, setCheckAvailable] = useState(false);
  const [inspectionVersion, setInspectionVersion] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const completionReceived = useRef(false);
  const completionGeneration = useRef(0);
  const completionPoll = useRef<ReturnType<typeof setInterval> | null>(null);
  const completionPollBusy = useRef(false);
  const stopCompletionPoll = () => {
    if (completionPoll.current !== null) clearInterval(completionPoll.current);
    completionPoll.current = null;
  };
  const showCompletion = (state: Completion) => {
    const nextMessage = completionMessage(state);
    if (!nextMessage) return;
    completionReceived.current = true;
    stopCompletionPoll();
    setMessage(nextMessage);
  };
  const readCompletion = async () => {
    if (completionPollBusy.current || completionReceived.current) return;
    const generation = completionGeneration.current;
    completionPollBusy.current = true;
    try {
      const result = await window.casimirDesktop?.personalMcpP1Connection?.("completion") as
        { completion?: Completion } | undefined;
      if (generation === completionGeneration.current)
        showCompletion(result?.completion ?? null);
    } catch { /* A missed read is retried while approval is pending. */ }
    finally { completionPollBusy.current = false; }
  };
  useEffect(() => {
    let cancelled = false;
    completionGeneration.current += 1;
    completionReceived.current = false;
    setAvailable(false);
    setP1Available(false);
    setP1Phase(undefined);
    setCheckAvailable(false);
    setMessage(null);
    setBusy(false);
    void window.casimirDesktop?.personalMcpDeviceRegistration?.("inspect")
      .then(result => {
        if (!cancelled) {
          setAvailable((result as Result)?.available === true);
          setCheckAvailable((result as Result)?.checkAvailable === true);
        }
      }).catch(() => undefined);
    void window.casimirDesktop?.personalMcpP1Connection?.("inspect")
      .then(result => {
        if (!cancelled) {
          setP1Available((result as Result)?.available === true);
          setP1Phase((result as Result)?.phase);
        }
      }).catch(() => undefined);
    void readCompletion();
    const remove = window.casimirDesktop?.onPersonalMcpP1Completion?.(state => {
      if (cancelled) return;
      showCompletion(state as Completion);
    });
    return () => {
      cancelled = true;
      completionGeneration.current += 1;
      stopCompletionPoll();
      remove?.();
    };
  }, [sessionId, inspectionVersion]);
  const unavailableMessage = personalMcpP1UnavailableMessage(p1Phase);
  if (!available && !p1Available && !unavailableMessage) return null;
  const start = async () => {
    const generation = completionGeneration.current;
    setBusy(true); setMessage(null);
    try {
      const result = await window.casimirDesktop?.personalMcpDeviceRegistration?.("start") as Result | undefined;
      if (generation !== completionGeneration.current) return;
      setMessage(result?.phase === "browser_opened"
        ? "Finish approval in the browser."
        : result?.phase === "account_required"
          ? "Sign in with a verified CasimirBot account first."
          : "Device approval is unavailable. Try again shortly.");
    } catch { if (generation === completionGeneration.current) setMessage("Device approval is unavailable. Try again shortly."); }
    finally { if (generation === completionGeneration.current) setBusy(false); }
  };
  const check = async () => {
    const generation = completionGeneration.current;
    setBusy(true); setMessage(null);
    try {
      const result = await window.casimirDesktop?.personalMcpDeviceRegistration?.("check") as Result | undefined;
      if (generation !== completionGeneration.current) return;
      if (result?.phase === "approved" || result?.phase === "not_approved")
        window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT));
      setMessage(result?.phase === "approved"
        ? "This computer is approved on your CasimirBot account. Check the Codex connection separately; if it is not configured, choose Connect Codex locally."
        : result?.phase === "not_approved"
          ? "This computer is not approved yet. Finish the browser request or start a new one."
          : result?.phase === "account_required"
            ? "Sign in with a verified CasimirBot account first."
            : "Approval could not be confirmed. Try again shortly.");
    } catch { if (generation === completionGeneration.current) setMessage("Approval could not be confirmed. Try again shortly."); }
    finally { if (generation === completionGeneration.current) setBusy(false); }
  };
  const connectCodex = async () => {
    completionGeneration.current += 1;
    const generation = completionGeneration.current;
    completionReceived.current = false;
    stopCompletionPoll();
    setBusy(true); setMessage(null);
    try {
      const result = await window.casimirDesktop?.personalMcpP1Connection?.("start") as
        Result | undefined;
      if (generation !== completionGeneration.current || completionReceived.current) return;
      if (result?.phase === "browser_opened") {
        const deadline = Date.now() + 10 * 60_000;
        completionPoll.current = setInterval(() => {
          if (Date.now() >= deadline) {
            stopCompletionPoll();
            setMessage("Codex approval outcome was not received. Check the browser result and connection status before retrying.");
          } else void readCompletion();
        }, 2_000);
      }
      setMessage(result?.stage === "personal_mcp_codex_entry_conflict"
        ? connectionConflictMessage
        : result?.phase === "browser_opened"
        ? "Finish the separate Codex access approval in the browser."
        : result?.phase === "reconnected"
          ? "Codex local access is restored with its saved scopes. Keep CasimirBot open; if this chat lacks personal MCP tools, restart Codex and return to this same chat. For expanded room and environment access, use Connect Codex locally for a fresh approval."
        : result?.phase === "device_required"
          ? "Approve this computer first, then connect Codex."
          : result?.phase === "account_required"
            ? "Sign in with a verified CasimirBot account first."
            : result?.phase === "busy"
              ? "Another approval is in progress."
              : "Codex connection is unavailable. Check this computer's approval and try again.");
    } catch { if (generation === completionGeneration.current) setMessage("Codex connection is unavailable. Try again shortly."); }
    finally { if (generation === completionGeneration.current) setBusy(false); }
  };
  const reconnectCodex = async () => {
    const generation = completionGeneration.current;
    setBusy(true); setMessage(null);
    try {
      const result = await window.casimirDesktop?.personalMcpP1Connection?.("resume") as
        Result | undefined;
      if (generation !== completionGeneration.current) return;
      if (result?.phase === "reconnected")
        window.dispatchEvent(new Event(AGENT_CONNECTION_INVALIDATED_EVENT));
      setMessage(result?.stage === "personal_mcp_codex_entry_conflict"
        ? connectionConflictMessage
        : result?.phase === "reconnected"
        ? "Codex local access is restored with its saved scopes. Keep CasimirBot open; if this chat lacks personal MCP tools, restart Codex and return to this same chat. For expanded room and environment access, use Connect Codex locally for a fresh approval."
        : result?.phase === "approval_required"
          ? "No saved approval for this profile. Connect Codex locally to approve access."
          : result?.phase === "device_required"
            ? "Approve this computer first, then reconnect Codex."
            : result?.phase === "account_required"
              ? "Sign in with a verified CasimirBot account first."
              : `Codex reconnection could not be confirmed${
                result?.stage && (["account_identity", "account_identity_retry",
                  "account_identity_parse", "device_key", "native_device_sync",
                  "native_binding", "owner_check", "pending_recovery",
                  "native_binding_request", "native_binding_response",
                  "native_binding_body", "native_binding_binding",
                  "codex_inspection", "credential_read", "service_resume",
                  "final_owner_check", "codex_registration",
                  "personal_mcp_codex_inspect_failed", "personal_mcp_codex_cli_unavailable",
                  "personal_mcp_codex_entry_conflict",
                  "personal_mcp_codex_configuration_invalid"].includes(result.stage) ||
                  /^(?:account_identity_http_[1-5]\d\d|owner_check_(?:window|request|response|account|profile|session|subject|window_recheck)|service_resume_(?:binding|grant|path|request|request_retry|response|receipt|binding_recheck))$/u.test(result.stage))
                  ? ` (stage: ${result.stage})` : ""}.`);
    } catch { if (generation === completionGeneration.current) setMessage("Codex reconnection could not be confirmed. Try again shortly."); }
    finally { if (generation === completionGeneration.current) setBusy(false); }
  };
  return <section className="mt-3 border-t border-white/10 pt-3"
    data-helix-guidance-target="personal-mcp-device-approval">
    {!p1Available && unavailableMessage ?
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <p role="status" className="text-xs text-slate-400">{unavailableMessage}</p>
        <button data-helix-control-id="workstation.panel.account-session.personal-mcp-device-registration.retry-setup-check" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => setInspectionVersion(value => value + 1)}
          className="rounded border border-white/20 px-2 py-1 text-xs text-slate-200 hover:bg-white/5">
          Retry setup check
        </button>
      </div> : null}
    <div className="flex flex-wrap gap-2">
      {available ? <button data-helix-control-id="workstation.panel.account-session.personal-mcp-device-registration.approve-this-computer" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => void start()} disabled={busy}
        className="inline-flex items-center gap-2 rounded border border-cyan-300/40 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
        <ShieldCheck className="h-4 w-4" aria-hidden /> Approve this computer
      </button> : null}
      {available && checkAvailable ? <button data-helix-control-id="workstation.panel.account-session.personal-mcp-device-registration.check-approval" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => void check()} disabled={busy}
        className="rounded border border-white/20 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
        Check approval
      </button> : null}
      {p1Available ? <button data-helix-control-id="workstation.panel.account-session.personal-mcp-device-registration.connect-codex-locally" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => void connectCodex()} disabled={busy}
        data-helix-guidance-target="personal-mcp-local-connection"
        className="inline-flex items-center gap-2 rounded border border-cyan-300/40 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/10 disabled:opacity-50">
        <Plug className="h-4 w-4" aria-hidden /> Connect Codex locally
      </button> : null}
      {p1Available ? <button data-helix-control-id="workstation.panel.account-session.personal-mcp-device-registration.reconnect-codex" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => void reconnectCodex()} disabled={busy}
        className="inline-flex items-center gap-2 rounded border border-white/20 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-white/5 disabled:opacity-50">
        <Plug className="h-4 w-4" aria-hidden /> Reconnect Codex
      </button> : null}
    </div>
    {message ? <p role="status" className="mt-2 text-xs text-slate-300">{message}</p> : null}
  </section>;
}
