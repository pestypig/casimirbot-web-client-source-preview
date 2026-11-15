import React from "react";
import { RefreshCw, Send } from "lucide-react";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";

type Allowance = { sourceKind: "subscription" | "developer";
  processorMode: "test" | "live" | "unknown";
  state: "active" | "paused"; remainingMicros: number;
  minimumTextReservationMicros?: number; periodEndsAt: string };
type Connection = { phase: "unlinked" | "pending" | "linked" | "unavailable";
  detail: string; managedTextAuthorized?: boolean; allowance?: Allowance };
type TextResult = { ok?: boolean; code?: string; requestId?: string;
  answer?: { requestId?: string; text?: string; payer?: string;
    remainingMicros?: number | null } };
type Turn = { id: string; question: string; answer: string };

const isConnection = (value: unknown): value is Connection => Boolean(value &&
  typeof value === "object" && typeof (value as Connection).detail === "string" &&
  ["unlinked", "pending", "linked", "unavailable"].includes((value as Connection).phase));

/** Session-only transcript; each funded request is independent and server-authorized. */
export function ManagedAiTextConsole({ active }: { active: boolean }) {
  const link = window.casimirDesktop?.managedAiDeviceLink;
  const ask = window.casimirDesktop?.managedAiTextTurn;
  const [connection, setConnection] = React.useState<Connection | null>(null);
  const [draft, setDraft] = React.useState("");
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [checking, setChecking] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState<string | null>(null);
  const [unconfirmedQuestion, setUnconfirmedQuestion] = React.useState<string | null>(null);
  const generation = React.useRef(0);
  const checkGeneration = React.useRef(0);
  const sendingRef = React.useRef(false);
  const activeRef = React.useRef(active);
  activeRef.current = active;

  const refresh = React.useCallback(async () => {
    if (!link) return;
    const epoch = ++checkGeneration.current;
    setChecking(true);
    try {
      const result = await link("check");
      if (epoch === checkGeneration.current)
        setConnection(isConnection(result) ? result : { phase: "unavailable", detail: "Connection status unavailable." });
    } catch {
      if (epoch === checkGeneration.current)
        setConnection({ phase: "unavailable", detail: "Could not check the website connection." });
    } finally { if (epoch === checkGeneration.current) setChecking(false); }
  }, [link]);

  React.useEffect(() => {
    if (active) void refresh();
  }, [active, refresh]);

  React.useEffect(() => {
    const accountChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ account_profile_changed?: boolean;
        account_profile_identity_known?: boolean }>).detail;
      if (detail?.account_profile_changed === false &&
          detail.account_profile_identity_known === true) {
        if (activeRef.current) void refresh();
        return;
      }
      ++generation.current; ++checkGeneration.current; sendingRef.current = false;
      setConnection(null); setDraft(""); setTurns([]); setMessage(null);
      setUnconfirmedQuestion(null); setSending(false);
      if (activeRef.current) void refresh();
    };
    window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged);
    return () => { ++generation.current; ++checkGeneration.current;
      window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, accountChanged); };
  }, [refresh]);

  const allowance = connection?.allowance;
  const minimumReservation = allowance?.minimumTextReservationMicros;
  const ready = Boolean(ask && connection?.phase === "linked" &&
    connection.managedTextAuthorized && allowance?.state === "active" &&
    Number.isSafeInteger(minimumReservation) && minimumReservation! > 0 &&
    allowance.remainingMicros >= minimumReservation! &&
    (allowance.sourceKind === "developer" ||
      allowance.processorMode !== "unknown"));
  const send = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!ask || !ready || sendingRef.current || !draft.trim() ||
        draft.trim() === unconfirmedQuestion) return;
    const question = draft.trim();
    if (new TextEncoder().encode(question).length > 4096) {
      setMessage("Question exceeds the 4,096-byte limit."); return;
    }
    const epoch = generation.current;
    sendingRef.current = true;
    setSending(true); setMessage(null);
    try {
      const result = await ask(question) as TextResult;
      if (epoch !== generation.current) return;
      if (result?.ok && result.answer?.payer === "casimirbot_managed" &&
          typeof result.answer.text === "string" && result.answer.text.trim()) {
        setTurns(current => [...current, { id: result.answer?.requestId ?? crypto.randomUUID(),
          question, answer: result.answer!.text! }]);
        setDraft("");
        void refresh();
      } else if (result?.code === "outcome_unconfirmed") {
        setUnconfirmedQuestion(question);
        setMessage(`Result unconfirmed. Do not resend this question. Reference: ${result.requestId ?? "unavailable"}.`);
      } else {
        setMessage(result?.code === "text_not_approved" ? "Approve managed text for this installation on the website." :
          result?.code === "allowance_unavailable" ? "No funded capacity is available for this request. Check usage and connection status." :
          result?.code === "not_connected" ? "Connect this installation in Account & Sessions." :
          "The funded text request could not be completed. No own API key was used.");
        void refresh();
      }
    } catch { if (epoch === generation.current) {
      setUnconfirmedQuestion(question);
      setMessage("The funded text result could not be confirmed. Check usage before asking a different question.");
    } }
    finally { if (epoch === generation.current) { sendingRef.current = false; setSending(false); } }
  };

  return <section aria-label="Managed AI text" className="flex min-h-64 flex-col gap-3 text-xs">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-medium text-slate-100">CasimirBot-funded text</p>
        <p className="mt-1 text-slate-400">Each question is independent. This mode does not use your own API key or control Codex and MCP tools.</p>
      </div>
      <button data-helix-control-id="helix.ask.managed-ai-text-console.recheck-managed-ai-allowance" data-helix-interaction-kind="human_only" data-helix-authority-state="client_local" type="button" title="Recheck website connection and allowance" aria-label="Recheck managed AI allowance"
        disabled={!link || checking || sending} onClick={() => void refresh()}
        className="rounded border border-white/20 p-2 text-slate-200 hover:bg-white/10 disabled:opacity-50">
        <RefreshCw className="h-4 w-4" aria-hidden="true" />
      </button>
    </div>
    <p role="status" className={ready ? "text-emerald-200" : "text-amber-200"}>
      {checking ? "Checking allowance…" : ready && allowance
        ? `${allowance.sourceKind === "developer" ? "Developer test" : allowance.processorMode === "test" ? "Stripe test" : "Managed AI"} allowance · $${(allowance.remainingMicros / 1_000_000).toFixed(4)} unreserved through ${new Date(allowance.periodEndsAt).toLocaleDateString()}`
        : connection?.phase === "linked" && !connection.managedTextAuthorized
          ? "Managed text is not approved for this installation. Review it on the website."
        : connection?.phase === "linked" && allowance?.state === "paused"
          ? "This allowance is paused."
        : connection?.phase === "linked" && allowance?.state === "active" &&
          minimumReservation === undefined
          ? "Text capacity cannot be confirmed. Recheck the website connection."
        : connection?.phase === "linked" && allowance?.state === "active" &&
          minimumReservation !== undefined &&
          allowance.remainingMicros < minimumReservation
          ? "This allowance cannot cover another text request."
        : connection?.detail ?? "Connect your website account in Account & Sessions."}
    </p>
    <div role="log" aria-label="Managed AI text history" className="flex-1 space-y-3">
      {turns.map(turn => <div key={turn.id} className="border-b border-white/10 pb-3">
        <p className="font-medium text-slate-200">You</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-300">{turn.question}</p>
        <p className="mt-2 font-medium text-cyan-100">Managed AI</p><p className="mt-1 whitespace-pre-wrap break-words text-slate-100">{turn.answer}</p>
      </div>)}
    </div>
    <form data-helix-control-id="helix.ask.managed-ai-text-console.event-void-send-event" data-helix-interaction-kind="act" data-helix-authority-state="client_local" onSubmit={event => { void send(event); }} className="border-t border-white/10 pt-3">
      <label htmlFor="managed-ai-console-question" className="sr-only">Ask managed AI</label>
      <textarea data-helix-control-id="helix.ask.managed-ai-text-console.managed-ai-console-question" data-helix-interaction-kind="configure" data-helix-authority-state="client_local" id="managed-ai-console-question" rows={3} value={draft}
        onChange={event => setDraft(event.target.value)} disabled={!ready || sending}
        placeholder="Ask a bounded text question…"
        className="w-full resize-y rounded border border-white/20 bg-slate-950 p-2 text-slate-100 placeholder:text-slate-500 disabled:opacity-60" />
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="text-slate-400">4,096 bytes maximum</span>
        <button data-helix-control-id="helix.ask.managed-ai-text-console.button" data-helix-interaction-kind="act" data-helix-authority-state="client_local" type="submit" disabled={!ready || sending || !draft.trim() ||
          draft.trim() === unconfirmedQuestion}
          className="inline-flex items-center gap-2 rounded border border-cyan-300/40 bg-cyan-400/10 px-3 py-2 font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:opacity-50">
          <Send className="h-4 w-4" aria-hidden="true" />{sending ? "Checking answer…" : "Ask"}
        </button>
      </div>
      {message ? <p role="alert" className="mt-2 text-amber-200">{message}</p> : null}
    </form>
  </section>;
}
