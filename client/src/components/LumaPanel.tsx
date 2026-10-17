import React, { useEffect, useRef, useState } from "react";
import { openLumaStream, type ChatMsg } from "@/lib/luma-client";
import { buildContext } from "@/lib/luma/compose-context";
import { interpretSurfaceIntent, type SurfacePlanResult } from "@/lib/orchestrator";
import { executeHelixPlan, type PlanExecutionRecord } from "@/lib/helix-plan-executor";
import type { HelixPlanAction } from "@shared/helix-plan";

type ConversationMessage = { role: "user" | "assistant"; content: string };
type PanelMode = "local" | "surface";

export function LumaPanel() {
  const [mode, setMode] = useState<PanelMode>("local");
  const [messages, setMessages] = useState<ConversationMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPlan, setLastPlan] = useState<SurfacePlanResult | null>(null);
  const [lastPlanRecord, setLastPlanRecord] = useState<PlanExecutionRecord | null>(null);
  const [planStatus, setPlanStatus] = useState<string | null>(null);
  const streamRef = useRef<{ abort?: () => void } | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    return () => {
      streamRef.current?.abort?.();
      streamRef.current = null;
    };
  }, []);

  useEffect(() => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [messages]);

  const handleSurfaceIntent = async (utterance: string) => {
    setBusy(true);
    setLastPlan(null);
    setLastPlanRecord(null);
    setPlanStatus(null);
    try {
      const plan = await interpretSurfaceIntent(utterance);
      setLastPlan(plan);
      const record = await executeHelixPlan(plan.planId, plan.plan, {
        broadcast: true,
        requireConfirmation: confirmMoveBubble,
      });
      setLastPlanRecord(record);
      setPlanStatus(formatExecutionStatus(record));
      const summary = formatSurfaceResponse(plan, record);
      setMessages((prev) => [...prev, { role: "assistant", content: summary }]);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Surface interpreter failed.";
      setError(message);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `[surface] ${message}` },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || busy) return;

    streamRef.current?.abort?.();
    streamRef.current = null;
    setError(null);
    setInput("");

    if (mode === "surface") {
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      await handleSurfaceIntent(text);
      return;
    }

    const priorMessages: ChatMsg[] = messages.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
    const userMessage: ConversationMessage = { role: "user", content: text };
    const userTurnChat: ChatMsg = { role: "user", content: text };

    setLastPlan(null);
    setLastPlanRecord(null);
    setPlanStatus(null);

    setMessages((prev) => [...prev, userMessage, { role: "assistant", content: "" }]);
    setBusy(true);

    let buffer = "";

    const handleDelta = (delta: string) => {
      buffer += delta;
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = { role: "assistant", content: buffer };
        } else {
          next.push({ role: "assistant", content: buffer });
        }
        return next;
      });
    };

    const handleDone = () => {
      setBusy(false);
      streamRef.current = null;
      buffer = "";
    };

    const handleStreamError = (err: Error) => {
      const message = err.message;
      setBusy(false);
      setError(message);
      streamRef.current = null;
      setMessages((prev) => {
        if (prev.length === 0) return prev;
        const next = [...prev];
        const last = next[next.length - 1];
        if (last?.role === "assistant") {
          next[next.length - 1] = {
            role: "assistant",
            content: last.content || `[error] ${message}`,
          };
        } else {
          next.push({ role: "assistant", content: `[error] ${message}` });
        }
        return next;
      });
    };

    let remoteMessages = [...priorMessages];
    try {
      const { context, refsMeta } = await buildContext(text, 4, 4);
      const hasContext = refsMeta.docIds.length > 0 || refsMeta.codeChunks.length > 0;
      const trimmed = context.trim();
      if (hasContext && trimmed) {
        remoteMessages.push({
          role: "system",
          content: [
            "Context (documents + code) follows. Answer using this material where possible, cite references using [Dx]/[Cx], and include a References section listing the labels you relied on.",
            trimmed,
          ].join("\n\n"),
        });
      }
    } catch (err) {
      console.warn("[LumaPanel] Failed to build context; continuing without code index search.", err);
    }

    remoteMessages.push(userTurnChat);

    const remoteHandle = openLumaStream(
      { messages: remoteMessages },
      {
        onDelta: handleDelta,
        onDone: handleDone,
        onError: (err) => handleStreamError(err instanceof Error ? err : new Error(String(err))),
      },
    );
    streamRef.current = { abort: remoteHandle.abort };
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    void sendMessage();
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-4xl flex-col gap-4 rounded-3xl border border-slate-800 bg-slate-950/40 p-6 shadow-lg ring-1 ring-black/40 backdrop-blur">
      <div className="flex items-center justify-between rounded-2xl bg-slate-900/40 px-4 py-3 text-sm text-slate-300">
        <span className="font-medium text-slate-200">Interpreter</span>
        <div className="inline-flex rounded-full bg-slate-950/60 p-1 text-xs text-slate-300">
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("local")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              mode === "local" ? "bg-slate-800 text-slate-100" : "text-slate-400 hover:text-slate-100"
            } ${busy ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Local stream
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode("surface")}
            className={`rounded-full px-3 py-1 font-medium transition ${
              mode === "surface" ? "bg-blue-500/30 text-blue-100" : "text-slate-400 hover:text-blue-100"
            } ${busy ? "cursor-not-allowed opacity-70" : ""}`}
          >
            Surface plan
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-hidden rounded-2xl bg-slate-950/20 p-4 shadow-inner">
        <div ref={scrollRef} className="flex h-full flex-col gap-4 overflow-y-auto pr-2 text-sm text-slate-100">
          {messages.length === 0 ? (
            <div className="m-auto text-center text-slate-400">
              <p className="text-base font-medium text-slate-200">Ask Luma anything.</p>
              <p className="text-sm text-slate-400">Your conversation will appear here.</p>
            </div>
          ) : (
            messages.map((msg, idx) => (
              <article
                key={`${msg.role}-${idx}`}
                className={`max-w-3xl rounded-2xl bg-slate-950/0 px-5 py-4 text-slate-100 ${
                  msg.role === "user" ? "self-end text-right text-blue-100" : "self-start text-left text-slate-100"
                }`}
              >
                <p className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
              </article>
            ))
          )}
        </div>
      </div>
      {error ? <p className="text-xs text-rose-300">{error}</p> : null}
      {planStatus ? <p className="text-xs text-slate-400">{planStatus}</p> : null}
      <form onSubmit={handleSubmit} className="w-full">
        <label htmlFor="luma-input" className="sr-only">
          Ask Luma
        </label>
        <div className="flex w-full items-center gap-2 rounded-full bg-slate-900/60 px-5 py-3 shadow-inner transition focus-within:ring-2 focus-within:ring-blue-400">
          <input
            id="luma-input"
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={busy ? "Luma is thinking..." : "Ask Luma"}
            className="flex-1 border-0 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none"
            disabled={busy}
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="text-sm font-semibold text-blue-300 transition hover:text-blue-200 disabled:cursor-not-allowed disabled:text-slate-500"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}

export default LumaPanel;

function formatSurfaceResponse(plan: SurfacePlanResult, record: PlanExecutionRecord | null) {
  const header = `Plan ${plan.planId} (${plan.plan.actions.length} action${
    plan.plan.actions.length === 1 ? "" : "s"
  }) via ${plan.model}`;
  const intent = plan.plan.intent ? `Intent: ${plan.plan.intent}` : null;
  const actions =
    plan.plan.actions.length > 0
      ? plan.plan.actions
          .map((action, idx) => `${idx + 1}. ${describeAction(action)}`)
          .join("\n")
      : "No actions.";
  const execution =
    record?.results && record.results.length > 0
      ? `Execution: ${record.results
          .map((result) => `${result.status} ${result.action.op}${result.detail ? ` (${result.detail})` : ""}`)
          .join("; ")}`
      : null;
  return [header, intent, actions, execution].filter(Boolean).join("\n\n");
}

function formatExecutionStatus(record: PlanExecutionRecord | null) {
  if (!record) return null;
  const applied = record.results.filter((res) => res.status === "applied").length;
  const skipped = record.results.filter((res) => res.status === "skipped").length;
  const errored = record.results.filter((res) => res.status === "error").length;
  return `Executed plan ${record.planId.slice(0, 8)} — applied ${applied}, skipped ${skipped}, errors ${errored}.`;
}

function describeAction(action: HelixPlanAction) {
  switch (action.op) {
    case "set_peaks":
      return `set_peaks (${action.mode ?? "absolute"}) -> ${action.peaks
        .map((peak) => `${Math.round(peak.f)}Hz x${peak.gain.toFixed(2)}`)
        .join(", ")}`;
    case "set_rc":
      return `set_rc -> rc=${action.rc.toFixed(3)}`;
    case "set_T":
      return `set_T -> T=${action.T.toFixed(3)}`;
    case "move_bubble":
      return `move_bubble -> dx=${action.dx.toFixed(2)}, dy=${action.dy.toFixed(2)}, speed=${(action.speed ?? 0).toFixed(2)}${
        action.confirm ? " (requires confirm)" : ""
      }`;
    case "sweep":
      return `sweep ${action.param} -> [${action.values.map((value) => value.toFixed(3)).join(", ")}], measure ${
        action.measure ?? "PSD"
      }`;
    case "explain":
      return `explain -> ${action.why}`;
    default:
      return "unknown action";
  }
}
function confirmMoveBubble(action: Extract<HelixPlanAction, { op: "move_bubble" }>) {
  if (typeof window === "undefined" || typeof window.confirm !== "function") return false;
  const dx = action.dx.toFixed(2);
  const dy = action.dy.toFixed(2);
  const speed = (action.speed ?? 0).toFixed(2);
  return window.confirm(`Execute move_bubble? dx=${dx}, dy=${dy}, speed=${speed}`);
}
