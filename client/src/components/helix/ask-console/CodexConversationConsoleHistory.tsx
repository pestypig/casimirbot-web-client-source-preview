import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { helixCodexConsoleFrameSchema, type HelixCodexConsoleFrame } from "@shared/helix-codex-mirror-frame";
import { HELIX_REASONING_BINDING_UPDATED_EVENT, inspectCurrentReasoningBinding,
  type BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
import { HelixAskFinalAnswer } from "./HelixAskFinalAnswer";

/** Private local preview of stored user-visible turns from the exact paired
 * Codex task. Neither the browser nor this view can send a Codex turn. */
export function CodexConversationConsoleHistory({ helixConversationId }: {
  helixConversationId?: string | null;
}) {
  const [frame, setFrame] = useState<HelixCodexConsoleFrame | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "reconnecting" | "unavailable">("loading");
  const [unavailableCode, setUnavailableCode] = useState<string | null>(null);
  const historyRef = useRef<HTMLDivElement>(null);
  const followingLatestRef = useRef(true);

  useEffect(() => {
    followingLatestRef.current = true;
    const history = historyRef.current;
    const scroller = history?.closest<HTMLElement>(".helix-console-conversations__body--scroll");
    if (!history || !scroller) return;
    const onScroll = () => {
      // The receipts drawer follows this history in the same scroll region.
      // Measure against the conversation's end, not the drawer's end.
      followingLatestRef.current = history.getBoundingClientRect().bottom -
        scroller.getBoundingClientRect().bottom <= 72;
    };
    scroller.addEventListener("scroll", onScroll, { passive: true });
    return () => scroller.removeEventListener("scroll", onScroll);
  }, [helixConversationId]);

  useLayoutEffect(() => {
    if (!frame?.turns.length || state !== "ready" && state !== "reconnecting" ||
        !followingLatestRef.current) return;
    const history = historyRef.current;
    const scroller = history?.closest<HTMLElement>(".helix-console-conversations__body--scroll");
    if (!history || !scroller) return;
    scroller.scrollTop += history.getBoundingClientRect().bottom -
      scroller.getBoundingClientRect().bottom;
  }, [frame, state]);

  useEffect(() => {
    let stopped = false;
    let generation = 0;
    let timer: number | undefined;
    let observedBindingKey: string | null = null;
    let lastVerifiedAt = 0;
    setFrame(null);
    setState("loading");
    setUnavailableCode(null);
    if (!helixConversationId || !window.casimirDesktop?.readCodexMirror) {
      setUnavailableCode(!helixConversationId ? "chat_not_selected" : "mirror_not_installed");
      setState("unavailable");
      return;
    }
    const read = async () => {
      const currentGeneration = ++generation;
      try {
        const binding = await inspectCurrentReasoningBinding(helixConversationId);
        if (stopped || currentGeneration !== generation) return;
        if (binding.status !== "active" || binding.helix_conversation_id !== helixConversationId)
          throw new Error("codex_mirror_binding_unavailable");
        observedBindingKey = `${binding.reasoning_binding_id}:${binding.binding_epoch}`;
        const result = await window.casimirDesktop?.readCodexMirror?.({
          bindingId: binding.reasoning_binding_id, helixConversationId,
        }) as { status?: unknown; frame?: unknown; code?: unknown } | undefined;
        if (stopped || currentGeneration !== generation) return;
        const parsed = helixCodexConsoleFrameSchema.safeParse(result?.frame);
        if (result?.status === "retryable" && lastVerifiedAt > 0 &&
            Date.now() - lastVerifiedAt < 120_000) {
          // Native rechecked the same owner grant. Keep the previous visible
          // turns, labelled as stale, only while that bounded check holds.
          setUnavailableCode(typeof result.code === "string" ? result.code : null);
          setState("reconnecting");
          return;
        }
        if (result?.status !== "ready") throw new Error(typeof result?.code === "string" &&
          /^codex_mirror_[a-z0-9_]{3,70}$/.test(result.code)
          ? result.code : "codex_mirror_reader_unavailable");
        if (!parsed.success) throw new Error("codex_mirror_invalid_frame");
        lastVerifiedAt = Date.now();
        setFrame(parsed.data);
        setUnavailableCode(null);
        setState("ready");
      } catch (error) {
        if (!stopped && currentGeneration === generation) {
          setFrame(null);
          lastVerifiedAt = 0;
          const rawCode = error instanceof Error ? error.message : "";
          setUnavailableCode(/^[a-z][a-z0-9_]{2,80}$/.test(rawCode)
            ? rawCode : "mirror_request_failed");
          setState("unavailable");
        }
      } finally {
        if (!stopped && currentGeneration === generation)
          timer = window.setTimeout(() => void read(), 5_000);
      }
    };
    const clear = () => {
      generation += 1;
      if (timer !== undefined) window.clearTimeout(timer);
      setFrame(null);
      lastVerifiedAt = 0;
      setUnavailableCode(null);
      setState("unavailable");
    };
    const onBindingChange = (event: Event) => {
      const binding = (event as CustomEvent<BrowserReasoningBinding>).detail;
      if (binding?.helix_conversation_id !== helixConversationId) return;
      if (binding.status === "active") {
        const nextKey = `${binding.reasoning_binding_id}:${binding.binding_epoch}`;
        // inspectCurrentReasoningBinding may publish the same active binding
        // synchronously. Do not cancel the read that caused that event.
        if (observedBindingKey === null) { observedBindingKey = nextKey; return; }
        if (observedBindingKey === nextKey) return;
        observedBindingKey = nextKey;
      } else {
        observedBindingKey = null;
      }
      clear();
      if (binding.status === "active") void read();
    };
    window.addEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingChange);
    void read();
    return () => {
      stopped = true;
      generation += 1;
      if (timer !== undefined) window.clearTimeout(timer);
      window.removeEventListener(HELIX_REASONING_BINDING_UPDATED_EVENT, onBindingChange);
    };
  }, [helixConversationId]);

  return <div ref={historyRef} role="log" aria-label="Codex conversation history" className="space-y-3 py-3 text-sm">
    <p className="text-[11px] text-slate-400">Recent stored turns from the paired Codex task · private local preview · scroll for history</p>
    {frame?.taskId ? <p className="break-all text-[11px] text-cyan-200">Paired Codex task: {frame.taskId}</p> : null}
    {state === "loading" ? <p role="status" className="text-slate-400">Reading the paired conversation…</p> : null}
    {state === "reconnecting" ? <p role="status" className="text-amber-200">
      Codex reader reconnecting. Showing the last verified turns; no new update is claimed.
    </p> : null}
    {state === "unavailable" ? <p role="status" className="text-amber-200">
      {unavailableCode === "reasoning_binding_not_found"
        ? "No current Codex task connection. If Agent Access shows an accepted pairing, ask that same task to recover it through CasimirBot MCP; no new invitation is needed."
        : unavailableCode === "codex_mirror_binding_unavailable" || unavailableCode === "chat_not_selected"
        ? "Conversation unavailable. Check the exact task pairing in Agent Access."
        : "Conversation unavailable. The paired task could not be read; check the connection diagnostics."}
      {unavailableCode ? <span className="ml-1 text-xs text-amber-300/80">({unavailableCode})</span> : null}
    </p> : null}
    {(state === "ready" || state === "reconnecting") && frame?.turns.length === 0 ? <p className="text-slate-400">No visible turns were found.</p> : null}
    {state === "ready" || state === "reconnecting" ? frame?.turns.map(turn => <article key={turn.id}
      className="rounded-lg border border-cyan-300/15 bg-cyan-400/5 p-3">
      {turn.user ? <div>
        <div className="mb-1 text-[11px] font-semibold text-cyan-200">You</div>
        <div className="whitespace-pre-wrap break-words text-slate-100">{turn.user}</div>
      </div> : null}
      {turn.updates?.length ? <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
        {turn.updates.map((update, index) => <div key={`${turn.id}:update:${index}`}>
          <div className="mb-1 text-[11px] font-semibold text-sky-200">Codex · update</div>
          <HelixAskFinalAnswer text={update} />
        </div>)}
      </div> : null}
      {turn.assistant ? <div className={turn.user ? "mt-3 border-t border-white/10 pt-3" : ""}>
        <div className="mb-1 text-[11px] font-semibold text-emerald-200">Codex · {turn.assistantPhase === "final_answer" ? "answer" : "update"}</div>
        <HelixAskFinalAnswer text={turn.assistant} />
      </div> : <p className="mt-2 text-xs text-slate-400">{turn.status === "working" ? "Codex is working." : "No visible Codex answer in this turn."}</p>}
    </article>) : null}
  </div>;
}
