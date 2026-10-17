import React from "react";

type View = { phase: "unlinked" | "pending" | "linked" | "unavailable";
  detail: string; expiresAt?: string; fingerprint?: string;
  managedTextAuthorized?: boolean;
  allowance?: { sourceKind: "subscription" | "developer";
    planTier: "ai_5" | "ai_10" | null;
    processorMode: "test" | "live" | "unknown";
    state: "active" | "paused"; remainingMicros: number;
    periodEndsAt: string };
  next?: "connect" | "check" | "disconnect" | "none" };
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
  const [view, setView] = React.useState<View | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [prompt, setPrompt] = React.useState("");
  const [textBusy, setTextBusy] = React.useState(false);
  const [textResult, setTextResult] = React.useState<string | null>(null);
  const [textError, setTextError] = React.useState<string | null>(null);
  const [autoCheckPaused, setAutoCheckPaused] = React.useState(false);
  const inFlight = React.useRef(false);
  const invoke = React.useCallback(async (action: "inspect" | "start" | "check" | "disconnect") => {
    if (!bridge || !signedIn || inFlight.current) return;
    inFlight.current = true;
    if (action !== "inspect") setAutoCheckPaused(false);
    setBusy(true); setError(null);
    try {
      const result = action === "check" || action === "start"
        ? await bounded(bridge(action), checkTimeoutMs) : await bridge(action);
      if (!valid(result)) throw Error("invalid_status");
      setView(result);
      if (action === "disconnect" || action === "start") {
        setTextResult(null); setTextError(null); setPrompt("");
      }
    } catch (cause) {
      if ((action === "check" || action === "start") && cause instanceof Error &&
          cause.message === "connection_check_timeout") {
        // The native operation may have stored a pending request or claimed a
        // grant before its IPC reply stalled. Read secure local state without
        // creating another request or repeating the one-time claim.
        let recovered = false;
        try {
          const stored = await bounded(bridge("inspect"), 5_000);
          if (valid(stored)) {
            setView(stored);
            recovered = action === "start" ? stored.phase === "pending" : stored.phase === "linked";
          }
        } catch { /* Keep the last observed state and release the controls. */ }
        setAutoCheckPaused(action === "check");
        setError(recovered ? null : action === "start"
          ? "Website connection took too long. Check for an open approval page before starting another request."
          : "Website check took too long. The installed connection may already be saved; use Check connection to retry.");
      } else setError("Could not check the website connection. Try again.");
    }
    finally { inFlight.current = false; setBusy(false); }
  }, [bridge, signedIn]);
  React.useEffect(() => { if (bridge && signedIn) void invoke("check");
    else setView(null); }, [bridge, signedIn, invoke]);
  React.useEffect(() => {
    if (view?.phase !== "pending" || !signedIn || autoCheckPaused) return;
    const timer = window.setInterval(() => { void invoke("check"); }, 3000);
    return () => window.clearInterval(timer);
  }, [view?.phase, signedIn, autoCheckPaused, invoke]);
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
    try {
      const response = await textBridge(prompt) as {
        ok?: boolean; answer?: { text?: string; payer?: string;
          remainingMicros?: number | null }; code?: string; requestId?: string };
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
    } catch { setTextError("The private managed-text test is unavailable. No own key was used."); }
    finally { setTextBusy(false); }
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
      {!signedIn ? "Sign in to the harness first." : error ?? view?.detail ?? "Checking this installation…"}
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
        <button type="button" disabled={!signedIn || busy || textBusy}
        onClick={() => void invoke("start")}
        className="rounded border border-cyan-300/50 bg-cyan-300/10 px-3 py-2 text-xs font-medium text-cyan-100 hover:bg-cyan-300/20 disabled:opacity-50">
        {view?.phase === "pending" ? "Start a new request" : "Connect in browser"}
      </button> : null}
      {view?.phase === "pending" || view?.phase === "linked" || view?.next === "check" ? <button type="button" disabled={busy || textBusy}
        onClick={() => void invoke("check")}
        className="rounded border border-white/20 px-3 py-2 text-xs text-slate-200 hover:bg-white/10 disabled:opacity-50">
        Check connection
      </button> : null}
      {view?.phase === "linked" || view?.next === "disconnect" ? <button type="button" disabled={busy || textBusy}
        onClick={() => void invoke("disconnect")}
        className="rounded border border-amber-300/40 px-3 py-2 text-xs text-amber-100 hover:bg-amber-300/10 disabled:opacity-50">
        Disconnect this app
      </button> : null}
      <button type="button" onClick={() => { void window.casimirDesktop?.openPublisherAccount?.(); }}
        className="rounded border border-white/20 px-3 py-2 text-xs text-slate-200 hover:bg-white/10">
        Manage on website
      </button>
    </div>
    {privateTextTest ? <details className="mt-3 rounded-lg border border-amber-300/20 bg-slate-950/40 p-3 text-xs">
      <summary className="cursor-pointer font-medium text-amber-100">Private managed-text qualification</summary>
      <p className="mt-2 leading-5 text-slate-300">Send one bounded text question using this installation’s approved website connection and its private test AI allowance. This is a stateless provider check, not Cloud Agent DM, GPT Live, Codex task control, or a public subscription benefit. No own API key is used.</p>
      <form className="mt-2 space-y-2" onSubmit={event => { void askManagedText(event); }}>
        <label htmlFor="managed-ai-private-text-question" className="block text-slate-200">Question</label>
        <textarea id="managed-ai-private-text-question" value={prompt}
          onChange={event => setPrompt(event.target.value)} disabled={textBusy}
          maxLength={4096} rows={3} placeholder="Ask one short question…"
          className="w-full rounded border border-white/20 bg-slate-950 p-2 text-slate-100 placeholder:text-slate-500" />
        <button type="submit" disabled={textBusy || !prompt.trim()}
          className="rounded border border-amber-300/40 bg-amber-300/10 px-3 py-2 font-medium text-amber-100 disabled:opacity-50">
          {textBusy ? "Checking answer…" : "Run private text check"}
        </button>
      </form>
      {textResult ? <p role="status" className="mt-3 whitespace-pre-wrap text-slate-100">{textResult}</p> : null}
      {textError ? <p role="alert" className="mt-3 text-amber-200">{textError}</p> : null}
    </details> : null}
    <p className="mt-3 text-[11px] leading-5 text-slate-400">
      Account linking alone does not unlock managed AI, an agent task, rooms, or actions in your programs.
    </p>
  </section>;
}
