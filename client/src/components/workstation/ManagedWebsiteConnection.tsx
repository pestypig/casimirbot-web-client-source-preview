import React from "react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from
  "@/lib/workstation/accountCapabilityPolicy";

type View = { phase: "unlinked" | "pending" | "linked" | "unavailable";
  detail: string; expiresAt?: string; fingerprint?: string;
  managedTextAuthorized?: boolean;
  allowance?: { sourceKind: "subscription" | "developer";
    planTier: "ai_5" | "ai_10" | null;
    processorMode: "test" | "live" | "unknown";
    state: "active" | "paused"; remainingMicros: number;
    periodEndsAt: string };
  next?: "connect" | "check" | "disconnect" | "none" };
type CappedStatus = { state: "inactive" | "active";
  textCallsEnabled: boolean; agentProbeEnabled?: boolean;
  currency?: string; capMinor?: number;
  remainingMinor?: number; includedProviderRemainingMicrosUsd?: number;
  periodEndsAt?: string };
const valid = (value: unknown): value is View => Boolean(value && typeof value === "object" &&
  ["unlinked", "pending", "linked", "unavailable"].includes((value as View).phase) &&
  typeof (value as View).detail === "string");
const checkTimeoutMs = 20_000;
const bounded = async <T,>(work: Promise<T>, timeoutMs: number): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try { return await Promise.race([work, new Promise<T>((_resolve, reject) => {
    timer = setTimeout(() => reject(Error("connection_check_timeout")), timeoutMs);
  })]); }
  finally { if (timer) clearTimeout(timer); }
};

/** Publisher account link. Optional text consent never grants program authority. */
export function ManagedWebsiteConnection({ signedIn }: { signedIn: boolean }) {
  const bridge = window.casimirDesktop?.managedAiDeviceLink;
  const textBridge = window.casimirDesktop?.managedAiTextTurn;
  const cappedStatusBridge = window.casimirDesktop?.cappedMembershipStatus;
  const cappedTextBridge = window.casimirDesktop?.cappedMembershipTextTurn;
  const cappedAgentProbeBridge = window.casimirDesktop?.cappedMembershipAgentProbe;
  const [view, setView] = React.useState<View | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [textBusy, setTextBusy] = React.useState(false);
  const [textResult, setTextResult] = React.useState<string | null>(null);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [cappedStatus, setCappedStatus] = React.useState<CappedStatus | null>(null);
  const [cappedPrompt, setCappedPrompt] = React.useState("");
  const [cappedBusy, setCappedBusy] = React.useState(false);
  const [cappedResult, setCappedResult] = React.useState<string | null>(null);
  const [cappedError, setCappedError] = React.useState<string | null>(null);
  const [agentProbeApproved, setAgentProbeApproved] = React.useState(false);
  const [agentProbeAttempted, setAgentProbeAttempted] = React.useState(false);
  const [agentProbeMessage, setAgentProbeMessage] = React.useState<string | null>(null);
  const cappedStatusEpoch = React.useRef(0);
  const cappedTurnEpoch = React.useRef(0);
  const [autoCheckPaused, setAutoCheckPaused] = React.useState(false);
  const inFlight = React.useRef(false);
  const connectionEpoch = React.useRef(0);
  const privateTextEpoch = React.useRef(0);
  const resetAccountView = React.useCallback(() => {
    ++connectionEpoch.current; ++privateTextEpoch.current;
    ++cappedStatusEpoch.current; ++cappedTurnEpoch.current;
    inFlight.current = false;
    setBusy(false); setView(null); setError(null); setAutoCheckPaused(false);
    setTextBusy(false); setTextResult(null); setTextError(null); setPrompt("");
    setCappedBusy(false); setCappedStatus(null); setCappedResult(null);
    setCappedError(null); setCappedPrompt("");
    setAgentProbeApproved(false); setAgentProbeAttempted(false); setAgentProbeMessage(null);
  }, []);
  const invoke = React.useCallback(async (action: "inspect" | "start" | "check" | "disconnect") => {
    if (!bridge || !signedIn || inFlight.current) return;
    const epoch = connectionEpoch.current;
    inFlight.current = true;
    if (action !== "inspect") setAutoCheckPaused(false);
    setBusy(true); setError(null);
    try {
      const result = action === "check" || action === "start"
        ? await bounded(bridge(action), checkTimeoutMs) : await bridge(action);
      if (epoch !== connectionEpoch.current) return;
      if (!valid(result)) throw Error("invalid_status");
      setView(result);
      if (action === "disconnect" || action === "start") {
        setTextResult(null); setTextError(null); setPrompt("");
      }
    } catch (cause) {
      if (epoch !== connectionEpoch.current) return;
      if ((action === "check" || action === "start") && cause instanceof Error &&
          cause.message === "connection_check_timeout") {
        // The native operation may have stored a pending request or claimed a
        // grant before its IPC reply stalled. Read secure local state without
        // creating another request or repeating the one-time claim.
        let recovered = false;
        try {
          const stored = await bounded(bridge("inspect"), 5_000);
          if (epoch !== connectionEpoch.current) return;
          if (valid(stored)) {
            setView(stored);
            recovered = action === "start" ? stored.phase === "pending" : stored.phase === "linked";
          }
        } catch { /* Keep the last observed state and release the controls. */ }
        if (epoch !== connectionEpoch.current) return;
        setAutoCheckPaused(action === "check");
        setError(recovered ? null : action === "start"
          ? "Website connection took too long. Check for an open approval page before starting another request."
          : "Website check took too long. The installed connection may already be saved; use Check connection to retry.");
      } else setError("Could not check the website connection. Try again.");
    }
    finally {
      if (epoch === connectionEpoch.current) { inFlight.current = false; setBusy(false); }
    }
  }, [bridge, signedIn]);
  React.useEffect(() => {
    resetAccountView();
    if (bridge && signedIn) void invoke("check");
    return () => {
      // Native work may already be submitted. Invalidate its UI callbacks;
      // this does not cancel the provider operation or replay its request.
      ++connectionEpoch.current; ++privateTextEpoch.current;
      ++cappedStatusEpoch.current; ++cappedTurnEpoch.current;
      inFlight.current = false;
    };
  }, [bridge, signedIn, invoke, resetAccountView]);
  React.useEffect(() => {
    if (!bridge || !signedIn || view?.phase !== "unavailable") return;
    const retry = () => { if (!inFlight.current) void invoke("inspect"); };
    window.addEventListener("focus", retry);
    return () => window.removeEventListener("focus", retry);
  }, [bridge, signedIn, view?.phase, invoke]);
  React.useEffect(() => {
    if (view?.phase !== "pending" || !signedIn || autoCheckPaused) return;
    const timer = window.setInterval(() => { void invoke("check"); }, 3000);
    return () => window.clearInterval(timer);
  }, [view?.phase, signedIn, autoCheckPaused, invoke]);
  const refreshCapped = React.useCallback(async () => {
    const epoch = ++cappedStatusEpoch.current;
    if (!signedIn || !cappedStatusBridge) { setCappedStatus(null); return; }
    try {
      const result = await cappedStatusBridge() as {
        ok?: boolean; status?: CappedStatus };
      if (epoch !== cappedStatusEpoch.current) return;
      const status = result?.ok ? result.status : null;
      setCappedStatus(status?.state === "active" &&
        status.currency === "USD" &&
        Number.isSafeInteger(status.capMinor) &&
        Number.isSafeInteger(status.remainingMinor) &&
        Number.isSafeInteger(status.includedProviderRemainingMicrosUsd)
        ? status : null);
    } catch { if (epoch === cappedStatusEpoch.current) setCappedStatus(null); }
  }, [signedIn, cappedStatusBridge]);
  React.useEffect(() => {
    if (view?.phase === "linked" && signedIn) void refreshCapped();
    else { ++cappedStatusEpoch.current; ++cappedTurnEpoch.current;
      setCappedStatus(null); setCappedResult(null);
      setCappedError(null); setCappedPrompt(""); }
    if (view?.phase !== "linked" || !signedIn) {
      setAgentProbeApproved(false); setAgentProbeAttempted(false);
      setAgentProbeMessage(null);
    }
  }, [view, signedIn, refreshCapped]);
  React.useEffect(() => {
    const accountChanged = () => {
      resetAccountView();
      if (signedIn) void invoke("check");
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
      accountChanged);
    return () => window.removeEventListener(
      HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
  }, [signedIn, invoke, resetAccountView]);
  const privateTextTest = Boolean(textBridge && signedIn && view?.phase === "linked" &&
    view.managedTextAuthorized && (view.allowance?.processorMode === "test" ||
      view.allowance?.sourceKind === "developer") &&
    view.allowance.state === "active" && view.allowance.remainingMicros > 0);
  const askManagedText = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!privateTextTest || !textBridge || textBusy) return;
    if (!prompt.trim() || new TextEncoder().encode(prompt).length > 4096) {
      setTextError("Enter a question of at most 4,096 bytes."); return;
    }
    setTextBusy(true); setTextResult(null); setTextError(null);
    const epoch = privateTextEpoch.current;
    try {
      const response = await textBridge(prompt) as {
        ok?: boolean; answer?: { text?: string; payer?: string;
          remainingMicros?: number | null }; code?: string; requestId?: string };
      if (epoch !== privateTextEpoch.current) return;
      if (response?.ok && typeof response.answer?.text === "string" &&
          response.answer.payer === "casimirbot_managed") {
        setTextResult(response.answer.text);
        setPrompt("");
        void invoke("check");
      } else if (response?.code === "outcome_unconfirmed") {
        setTextError(`The provider result is unconfirmed. Do not resend this request. Reference: ${response.requestId ?? "unavailable"}.`);
      } else {
        const reason = response?.code === "allowance_unavailable" ?
          "The AI allowance is unavailable. Check the website account." :
          response?.code === "text_not_approved" ?
          "Approve managed text for this installation on the website." :
          "The private managed-text test is unavailable. No own key was used.";
        setTextError(reason);
      }
    } catch {
      if (epoch === privateTextEpoch.current)
        setTextError("The private managed-text test is unavailable. No own key was used.");
    } finally { if (epoch === privateTextEpoch.current) setTextBusy(false); }
  };
  const askCappedText = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!cappedTextBridge || cappedBusy || !cappedStatus?.textCallsEnabled ||
        !view?.managedTextAuthorized || !cappedPrompt.trim() ||
        new TextEncoder().encode(cappedPrompt).length > 4096) return;
    const question = cappedPrompt.trim();
    const turnEpoch = cappedTurnEpoch.current;
    setCappedBusy(true); setCappedResult(null); setCappedError(null);
    try {
      const response = await cappedTextBridge(question) as {
        ok?: boolean; answer?: { text?: string; remainingMinor?: number | null };
        code?: string; requestId?: string };
      if (turnEpoch !== cappedTurnEpoch.current) return;
      if (response?.ok && typeof response.answer?.text === "string" &&
          response.answer.text.trim()) {
        setCappedResult(response.answer.text);
        setCappedPrompt("");
        void refreshCapped();
      } else if (response?.code === "outcome_unconfirmed") {
        setCappedError(`Result unconfirmed. Do not resend this question. Reference: ${response.requestId ?? "unavailable"}.`);
      } else {
        setCappedError(response?.code === "allowance_unavailable" ?
          "The capped period cannot fund this request. Check usage on the website." :
          "This private capped-text test is unavailable. No personal API key was used.");
        void refreshCapped();
      }
    } catch {
      if (turnEpoch !== cappedTurnEpoch.current) return;
      setCappedError("Result unconfirmed. Check your account before trying another question.");
    } finally { if (turnEpoch === cappedTurnEpoch.current) setCappedBusy(false); }
  };
  const runCappedAgentProbe = async () => {
    if (!cappedAgentProbeBridge || !agentProbeApproved || agentProbeAttempted ||
        cappedStatus?.agentProbeEnabled !== true ||
        !view?.managedTextAuthorized) return;
    const turnEpoch = cappedTurnEpoch.current;
    setAgentProbeAttempted(true);
    setAgentProbeMessage("Running one fixed no-tool Responses check…");
    try {
      const response = await cappedAgentProbeBridge() as {
        ok?: boolean; answer?: { answerMatchesProbe?: boolean;
          measuredProviderMicrosUsd?: number };
        code?: string; requestId?: string };
      if (turnEpoch !== cappedTurnEpoch.current) return;
      if (response?.ok && response.answer?.answerMatchesProbe === true &&
          Number.isSafeInteger(response.answer.measuredProviderMicrosUsd)) {
        setAgentProbeMessage("The no-tool Responses check settled with a provider usage receipt. Review the updated account ledger.");
        void refreshCapped();
      } else if (response?.code === "outcome_unconfirmed" || response?.ok) {
        setAgentProbeMessage(`The result is unconfirmed. Do not repeat this check before reviewing the ledger. Reference: ${response?.requestId ?? "unavailable"}.`);
      } else {
        setAgentProbeMessage(response?.code === "allowance_unavailable" ?
          "The capped period cannot fund this check. Review usage in Account." :
          "This private Responses check is unavailable; no personal API key was used.");
        void refreshCapped();
      }
    } catch {
      if (turnEpoch === cappedTurnEpoch.current)
        setAgentProbeMessage("The result is unconfirmed. Review the ledger before trying another check.");
    }
  };
  if (!bridge) return null;
  return <section className="mb-3 rounded-lg border border-cyan-300/20 bg-cyan-300/[0.055] p-4"
    aria-label="Website account connection" data-helix-guidance-target="managed-website-connection">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="text-sm font-semibold text-white">Connect website account</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-300">
          Use your CasimirBot website account on this installation without entering a provider API key.
          Personal tools and your own connections stay independent.
        </p>
      </div>
      {view?.phase === "linked" ? <span className="rounded-full border border-emerald-300/30 bg-emerald-300/10 px-2 py-1 text-xs text-emerald-200">Connected</span> : null}
    </div>
    <p role="status" className={`mt-3 text-xs ${view?.phase === "unavailable" || error ? "text-amber-200" : "text-cyan-100"}`}>
      {!signedIn ? "Sign in to the harness first." : error ??
        (view?.phase === "linked" && cappedStatus?.state === "active" &&
          view.detail.includes("No single current funded text allowance was confirmed")
          ? "Website account connected. Active capped Stripe sandbox period confirmed below."
          : view?.detail) ?? "Checking this installation…"}
    </p>
    {view?.phase === "linked" && view.allowance ? <p className="mt-2 text-xs leading-5 text-slate-300">
      {view.allowance.sourceKind === "developer" ? "Private developer test · " :
        view.allowance.processorMode === "test" ? "Stripe test · " :
        view.allowance.processorMode === "unknown" ? "Unverified source · " : ""}
      {view.allowance.sourceKind === "developer" ? "AI allowance" :
        view.allowance.planTier === "ai_5" ? "$5 AI plan" :
        view.allowance.planTier === "ai_10" ? "$10 AI plan" : "AI subscription"}
      {` ${view.allowance.state}. Recorded unreserved capacity $${(view.allowance.remainingMicros / 1_000_000).toFixed(4)} through ${new Date(view.allowance.periodEndsAt).toLocaleDateString()}. Managed answers are not enabled by this status check.`}
    </p> : null}
    {view?.phase === "linked" && view.managedTextAuthorized ?
      <p className="mt-2 text-xs leading-5 text-amber-100">Managed text permission approved for this installation. Answers still require an active allowance and an available service.</p> : null}
    {view?.fingerprint ? <p className="mt-1 font-mono text-[11px] text-slate-500">
      Device fingerprint: {view.fingerprint.slice(0, 16)}…{view.fingerprint.slice(-8)}</p> : null}
    {view?.expiresAt ? <p className="mt-1 text-[11px] text-slate-400">
      {view.phase === "pending" ? "Approval expires" : "Connection expires"}: {new Date(view.expiresAt).toLocaleString()}</p> : null}
    <div className="mt-3 flex flex-wrap gap-2">
      {(view?.phase === "unlinked" || view?.phase === "pending" || view?.next === "connect" || !view) ?
        <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.void-invoke-start" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={!signedIn || busy || textBusy}
        onClick={() => void invoke("start")}
        className="rounded border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-50">
        {view?.phase === "pending" ? "Start a new request" : "Connect in browser"}
      </button> : null}
      {view?.phase === "pending" || view?.phase === "linked" || view?.next === "check" ? <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.check-connection" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || textBusy}
        onClick={() => void invoke("check")}
        className="rounded border border-white/20 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50">
        Check connection
      </button> : null}
      {view?.phase === "linked" || view?.next === "disconnect" ? <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.disconnect-this-app" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={busy || textBusy}
        onClick={() => void invoke("disconnect")}
        className="rounded border border-amber-300/40 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/10 disabled:opacity-50">
        Disconnect this app
      </button> : null}
      <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.manage-on-website" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" onClick={() => { void window.casimirDesktop?.openPublisherAccount?.(); }}
        className="rounded border border-white/20 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">
        Manage on website
      </button>
    </div>
    {privateTextTest ? <details className="mt-3 rounded-lg border border-amber-300/20 bg-slate-950/40 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-amber-100">Private managed-text qualification</summary>
      <p className="mt-2 leading-5 text-slate-300">Send one bounded text question using this installation’s approved website connection and its private test AI allowance. This is a stateless provider check, not Cloud Agent DM, GPT Live, Codex task control, or a public subscription benefit. No own API key is used.</p>
      <form data-helix-control-id="workstation.panel.account-session.managed-website-connection.event-void-ask-managed-text-event" data-helix-interaction-kind="act" data-helix-authority-state="client_local" className="mt-2 space-y-2" onSubmit={event => { void askManagedText(event); }}>
        <label htmlFor="managed-ai-private-text-question" className="block text-slate-200">Question</label>
        <textarea data-helix-control-id="workstation.panel.account-session.managed-website-connection.managed-ai-private-text-question" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" id="managed-ai-private-text-question" value={prompt}
          onChange={event => setPrompt(event.target.value)} disabled={textBusy}
          maxLength={4096} rows={3} placeholder="Ask one short question…"
          className="w-full rounded border border-white/20 bg-slate-950 p-2 text-slate-100 placeholder:text-slate-500" />
        <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.button" data-helix-interaction-kind="act" data-helix-authority-state="client_local" type="submit" disabled={textBusy || !prompt.trim()}
          className="rounded border border-amber-300/40 bg-amber-300/10 px-3 py-2 font-medium text-amber-100 disabled:opacity-50">
          {textBusy ? "Checking answer…" : "Run private text check"}
        </button>
      </form>
      {textResult ? <p role="status" className="mt-3 whitespace-pre-wrap text-slate-100">{textResult}</p> : null}
      {textError ? <p role="alert" className="mt-3 text-amber-200">{textError}</p> : null}
    </details> : null}
    {cappedStatus?.state === "active" && cappedTextBridge ?
      <details className="mt-3 rounded-lg border border-cyan-300/20 bg-slate-950/40 p-3 text-xs">
        <summary className="cursor-pointer font-medium text-cyan-100">Private capped-membership text check</summary>
        <p className="mt-2 leading-5 text-slate-300">Stripe sandbox period · $5 monthly base · $1 included provider cost · 2× measured-cost overage within your ${((cappedStatus.capMinor ?? 0) / 100).toFixed(2)} all-in cap. Included provider cost left: ${((cappedStatus.includedProviderRemainingMicrosUsd ?? 0) / 1_000_000).toFixed(4)}; additional cap room: ${((cappedStatus.remainingMinor ?? 0) / 100).toFixed(2)}. This is one independent text answer, not managed GPT Live or agent actions.</p>
        {!cappedStatus.textCallsEnabled || !view?.managedTextAuthorized ?
          <p role="status" className="mt-2 text-amber-200">Provider calls need the separate private text gate and this installation’s managed-text approval.</p> :
          <form data-helix-control-id="workstation.panel.account-session.managed-website-connection.event-void-ask-capped-text-event" data-helix-interaction-kind="act" data-helix-authority-state="client_local" className="mt-2 space-y-2" onSubmit={event => { void askCappedText(event); }}>
            <label htmlFor="capped-membership-private-question" className="block text-slate-200">Question</label>
            <textarea data-helix-control-id="workstation.panel.account-session.managed-website-connection.capped-membership-private-question" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" id="capped-membership-private-question" value={cappedPrompt}
              onChange={event => setCappedPrompt(event.target.value)}
              disabled={cappedBusy} maxLength={4096} rows={3}
              placeholder="Ask one bounded question…"
              className="w-full rounded border border-white/20 bg-slate-950 p-2 text-slate-100 placeholder:text-slate-500" />
            <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.button.2" data-helix-interaction-kind="act" data-helix-authority-state="client_local" type="submit" disabled={cappedBusy || !cappedPrompt.trim()}
              className="rounded border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 font-medium text-cyan-100 disabled:opacity-50">
              {cappedBusy ? "Checking answer…" : "Run private capped-text check"}
            </button>
          </form>}
        {cappedResult ? <p role="status" className="mt-3 whitespace-pre-wrap text-slate-100">{cappedResult}</p> : null}
        {cappedError ? <p role="alert" className="mt-3 text-amber-200">{cappedError}</p> : null}
      </details> : null}
    {cappedStatus?.state === "active" &&
      cappedStatus.agentProbeEnabled === true && cappedAgentProbeBridge ?
      <details className="mt-3 rounded-lg border border-cyan-300/20 bg-slate-950/40 p-3 text-xs">
        <summary className="cursor-pointer font-medium text-cyan-100">Private managed Responses billing check</summary>
        <p className="mt-2 leading-5 text-slate-300">One fixed GPT-6 Luna question, at most 64 output tokens, billed to this Stripe sandbox period. It uses CasimirBot's server-held key. It cannot run a tool, control your program, or authorize a Codex task.</p>
        {!view?.managedTextAuthorized ?
          <p role="status" className="mt-2 text-amber-200">Approve managed text for this installation before this provider check.</p> :
          <>
            <label className="mt-2 flex items-start gap-2 text-slate-200">
              <input data-helix-control-id="workstation.panel.account-session.managed-website-connection.input" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" type="checkbox" checked={agentProbeApproved}
                disabled={agentProbeAttempted}
                onChange={event => setAgentProbeApproved(event.target.checked)} />
              I approve one bounded Responses sandbox call using my membership allowance.
            </label>
            <button data-helix-control-id="workstation.panel.account-session.managed-website-connection.run-one-installed-responses-check" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" disabled={!agentProbeApproved || agentProbeAttempted}
              onClick={() => void runCappedAgentProbe()}
              className="mt-2 rounded border border-cyan-300/40 bg-cyan-300/10 px-3 py-2 font-medium text-cyan-100 disabled:opacity-50">
              Run one installed Responses check
            </button>
          </>}
        {agentProbeMessage ? <p role="status" className="mt-3 text-slate-200">{agentProbeMessage}</p> : null}
      </details> : null}
    <p className="mt-3 text-[11px] leading-5 text-slate-400">
      Account linking alone does not unlock managed AI, an agent task, rooms, or actions in your programs.
    </p>
  </section>;
}
