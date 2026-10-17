import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, Sparkles, X } from "lucide-react";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import { projectResearchPaperToProposalSession } from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import { useHelixWorkflowDemoStore, type HelixWorkflowDemoState } from "@/store/useHelixWorkflowDemoStore";
import { useTheoryExperimentWorkflowStore } from "@/store/useTheoryExperimentWorkflowStore";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { recordWorkstationTimelineEntry } from "@/store/useWorkstationWorkflowTimelineStore";

export type HelixAskWorkflowSuggestionRuntimeProps = {
  latestPayload?: unknown;
  variant?: "inline" | "panel";
};

export function HelixAskWorkflowSuggestionRuntime({
  latestPayload,
  variant = "inline",
}: HelixAskWorkflowSuggestionRuntimeProps) {
  const session = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.session);
  const observePayload = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.observePayload);
  const observeTheoryExperimentPayload = useTheoryExperimentWorkflowStore(
    (state) => state.observePayload,
  );
  const dismissSuggestion = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.dismissSuggestion);
  const recordSuggestionShown = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.recordSuggestionShown);
  const recordPromptInserted = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.recordPromptInserted);
  const pinDemoToChat = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.pinDemoToChat);
  const activeChatId = useAgiChatStore((state) => state.activeId);
  const projection = useMemo(() => projectResearchPaperToProposalSession(session), [session]);
  const qte = projection.qte;
  const originSessionId = session?.originSessionId ?? session?.contextBinding?.sourceSessionId ?? null;
  const activeChatOwnsRun = Boolean(activeChatId && (!originSessionId || originSessionId === activeChatId));
  const [draft, setDraft] = useState(qte?.prompt ?? "");

  useEffect(() => {
    if (latestPayload !== undefined && latestPayload !== null && activeChatId) {
      observePayload(latestPayload, activeChatId);
      void observeTheoryExperimentPayload(latestPayload, activeChatId);
    }
  }, [activeChatId, latestPayload, observePayload, observeTheoryExperimentPayload]);

  useEffect(() => {
    setDraft(qte?.prompt ?? "");
  }, [qte?.runId, qte?.stepId, qte?.prompt]);

  useEffect(() => {
    if (qte?.stepId && activeChatOwnsRun) recordSuggestionShown(qte.stepId, qte.prompt, qte.reason);
  }, [activeChatOwnsRun, qte?.prompt, qte?.reason, qte?.runId, qte?.stepId, recordSuggestionShown]);

  if (!qte || !activeChatId) return null;
  if (!activeChatOwnsRun) {
    if (variant === "panel") return null;
    return (
      <section className="relative z-10 mt-3 rounded-xl border border-amber-300/30 bg-amber-950/70 p-3" data-testid="helix-ask-workflow-chat-mismatch">
        <h3 className="text-xs font-semibold text-amber-100">Workflow QTE paused for this chat</h3>
        <p className="mt-1 text-[11px] leading-5 text-amber-100/70">
          The active run is pinned to another chat, so this chat&apos;s replies cannot advance Step {projection.completedStepCount + 1}.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-workflow-suggestion-runtime.continue-this-run-here" type="button" onClick={() => pinDemoToChat(activeChatId)} className="rounded border border-amber-200/35 bg-amber-300/10 px-2.5 py-1 text-xs text-amber-50 hover:bg-amber-300/20">
            Continue this run here
          </button>
          <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-workflow-suggestion-runtime.open-demo-lab"
            type="button"
            onClick={() => window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "workflow-demo-lab" } }))}
            className="rounded border border-white/15 bg-white/5 px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
          >
            Open Demo Lab
          </button>
        </div>
      </section>
    );
  }

  const usePrompt = () => {
    const question = draft.trim();
    if (!question) return;
    recordPromptInserted({
      stepId: qte.stepId,
      prompt: question,
      templatePrompt: qte.prompt,
      sourceSessionId: activeChatId,
    });
    launchHelixAskPrompt({
      question,
      autoSubmit: false,
      panelId: "workflow-demo-lab",
      suppressWorkstationPayloadActions: true,
      workflowQte: {
        schema: "helix.workflow_qte_launch.v1",
        runId: qte.runId,
        stepId: qte.stepId,
        sourceSessionId: activeChatId,
      },
    });
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: `Workflow QTE inserted: ${qte.title}`,
      detail: question,
      panelId: "workflow-demo-lab",
      traceId: qte.runId,
      step: qte.stepId,
    });
  };

  return (
    <section
      className={variant === "panel"
        ? "rounded-xl border border-cyan-300/25 bg-cyan-950/20 p-3"
        : "relative z-10 mt-3 rounded-xl border border-cyan-300/25 bg-slate-950/85 p-3 shadow-lg shadow-cyan-950/20"}
      data-testid="helix-ask-workflow-qte"
      data-qte-schema={qte.schema}
      data-assistant-answer="false"
      data-terminal-eligible="false"
      data-auto-submit="false"
      data-context-binding-id={qte.contextBindingId}
      data-context-source-kind={qte.contextSourceKind}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-cyan-300/30 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-100">
              <Sparkles className="h-3 w-3" /> Workflow QTE
            </span>
            <span className="text-[10px] text-slate-400">
              Step {projection.completedStepCount + 1} of {projection.steps.length}
            </span>
            <span className="text-[10px] text-slate-500">
              {qte.contextSourceKind === "current_chat" ? "Bound to current chat" : "Bound to custom objective"}
            </span>
          </div>
          <h3 className="mt-2 text-sm font-semibold text-slate-100">{qte.title}</h3>
          <p className="mt-1 text-[11px] leading-5 text-slate-400">{qte.reason}</p>
        </div>
        <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-workflow-suggestion-runtime.dismiss-workflow-suggestion"
          type="button"
          onClick={() => dismissSuggestion(qte.stepId)}
          className="rounded p-1 text-slate-500 hover:bg-white/5 hover:text-slate-200"
          aria-label="Dismiss workflow suggestion"
          title="Dismiss this suggestion"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <textarea data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-workflow-suggestion-runtime.editable-next-workflow-prompt"
        value={draft}
        onChange={(event) => setDraft(event.currentTarget.value)}
        rows={variant === "panel" ? 6 : 3}
        className="mt-3 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-slate-100 outline-none focus:border-cyan-300/50"
        aria-label="Editable next workflow prompt"
      />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[10px] text-slate-500">Editable · inserts into composer · never auto-sends</span>
        <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-workflow-suggestion-runtime.use-next-prompt"
          type="button"
          onClick={usePrompt}
          disabled={!draft.trim()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs font-medium text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Use next prompt <ArrowRight className="h-3.5 w-3.5" />
        </button>
      </div>
    </section>
  );
}
