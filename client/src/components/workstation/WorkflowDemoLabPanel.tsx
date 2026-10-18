import React, { useEffect, useMemo, useState } from "react";
import { Check, Circle, FlaskConical, Link2, Pause, Play, RotateCcw } from "lucide-react";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { THEORY_EXPERIMENT_STAGE_IDS } from "@shared/contracts/theory-experiment-procedure.v1";
import { HelixAskWorkflowSuggestionRuntime } from "@/components/helix/ask-console/HelixAskWorkflowSuggestionRuntime";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import {
  RESEARCH_PAPER_TO_PROPOSAL_DEMO,
  projectResearchPaperToProposalSession,
  type ResearchPaperToProposalProjection,
} from "@/lib/helix/workflow-demos/research-paper-to-proposal";
import { useHelixWorkflowDemoStore, type HelixWorkflowDemoState } from "@/store/useHelixWorkflowDemoStore";
import { useTheoryExperimentWorkflowStore } from "@/store/useTheoryExperimentWorkflowStore";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { recordWorkstationTimelineEntry } from "@/store/useWorkstationWorkflowTimelineStore";
import {
  createHelixWorkflowDemoCurrentChatBinding,
  createHelixWorkflowDemoCustomBinding,
  selectHelixWorkflowDemoContextCandidate,
} from "@/lib/helix/workflow-demos/workflow-demo-context";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";

type ContextMode = "current_chat" | "custom" | "blank";

export default function WorkflowDemoLabPanel() {
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(() =>
    readCachedAccountCapabilityPolicy(),
  );
  const [theoryBadgeIds, setTheoryBadgeIds] = useState(
    "study.casimir_dp.evidence_map_stage3",
  );
  const [theoryTarget, setTheoryTarget] = useState(
    "Compare the selected theory badges from first principles and identify the next scientifically admissible checks.",
  );
  const [requestLanyon, setRequestLanyon] = useState(true);
  const isDeveloper = accountPolicy?.account_type === "developer";
  const theoryExperimentSession = useTheoryExperimentWorkflowStore((state) => state.session);
  const startTheoryExperiment = useTheoryExperimentWorkflowStore((state) => state.start);
  const resetTheoryExperiment = useTheoryExperimentWorkflowStore((state) => state.reset);
  const session = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.session);
  const startDemo = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.startResearchPaperToProposalDemo);
  const pauseDemo = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.pauseDemo);
  const resumeDemo = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.resumeDemo);
  const resetDemo = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.resetDemo);
  const bindContext = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.bindContext);
  const pinDemoToChat = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.pinDemoToChat);
  const restoreSuggestion = useHelixWorkflowDemoStore((state: HelixWorkflowDemoState) => state.restoreSuggestion);
  const chatSessions = useAgiChatStore((state) => state.sessions);
  const activeChatId = useAgiChatStore((state) => state.activeId);
  const projection = useMemo(() => projectResearchPaperToProposalSession(session), [session]);
  const runOriginSessionId = session?.originSessionId ?? session?.contextBinding?.sourceSessionId ?? null;
  const activeChatMismatch = Boolean(session && activeChatId && runOriginSessionId && activeChatId !== runOriginSessionId);
  const contextCandidate = useMemo(
    () => selectHelixWorkflowDemoContextCandidate({ sessions: chatSessions, activeId: activeChatId }),
    [activeChatId, chatSessions],
  );
  const [contextMode, setContextMode] = useState<ContextMode>("current_chat");
  const [customObjective, setCustomObjective] = useState("");
  const canEnableDemo = contextMode === "blank" ||
    (contextMode === "current_chat" && Boolean(contextCandidate)) ||
    (contextMode === "custom" && Boolean(customObjective.trim()));

  useEffect(() => {
    if (!contextCandidate && contextMode === "current_chat") setContextMode("custom");
  }, [contextCandidate, contextMode]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      void fetchAccountCapabilityPolicy()
        .then((policy) => {
          if (!cancelled) setAccountPolicy(policy);
        })
        .catch(() => {
          if (!cancelled) setAccountPolicy(readCachedAccountCapabilityPolicy());
        });
    };
    refresh();
    if (typeof window !== "undefined") {
      window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
    }
    return () => {
      cancelled = true;
      if (typeof window !== "undefined") {
        window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, refresh);
      }
    };
  }, []);

  const selectedBinding = () => {
    if (contextMode === "current_chat" && contextCandidate) {
      return createHelixWorkflowDemoCurrentChatBinding(contextCandidate);
    }
    if (contextMode === "custom") return createHelixWorkflowDemoCustomBinding(customObjective);
    return null;
  };

  const handleStart = () => {
    const next = startDemo(selectedBinding(), activeChatId ?? null);
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: "Workflow demo started: Research paper to proposal",
      panelId: "workflow-demo-lab",
      traceId: next.runId,
      step: "paper_lookup",
    });
  };

  const handleBindSelectedContext = () => {
    const binding = selectedBinding();
    if (!binding) return;
    bindContext(binding);
  };

  const handleRebaseFromCurrentChat = () => {
    if (!contextCandidate) return;
    bindContext(createHelixWorkflowDemoCurrentChatBinding(contextCandidate));
  };

  const handleReset = () => {
    resetDemo();
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: "Workflow demo reset",
      panelId: "workflow-demo-lab",
    });
  };

  const handleContinueInActiveChat = () => {
    if (!activeChatId) return;
    pinDemoToChat(activeChatId);
  };

  const handlePrepareTheoryExperiment = () => {
    const selectedBadgeIds = theoryBadgeIds
      .split(/[\s,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      !isDeveloper ||
      !activeChatId ||
      selectedBadgeIds.length === 0 ||
      !theoryTarget.trim()
    ) return;
    const projectedSession = startTheoryExperiment({
      sourceSessionId: activeChatId,
      target: theoryTarget.trim(),
      selectedBadgeIds,
      lanyonRequested: requestLanyon,
    });
    const lanyonClause = requestLanyon
      ? " Set lanyon_requested=true and lanyon_case_id=advection_diffusion_full_1d; report eligibility and blockers, but do not execute it."
      : " Set lanyon_requested=false.";
    const question = [
      "Call theory-experiment-procedure.prepare as a developer-scoped, non-terminal workstation tool.",
      `Use operation=compare, target=${JSON.stringify(theoryTarget.trim())},`,
      `selected_badge_ids=${JSON.stringify(selectedBadgeIds)}.`,
      `Use procedure_id=${JSON.stringify(projectedSession.procedureId)} so the Demo Lab can accept only the causally linked typed observation.`,
      "Bind only same-turn admitted scientific sidecars or semantic-admission receipts.",
      lanyonClause,
      "After the observation re-enters, explain the dependency order, scale checkpoints, congruence/bridge requirements, and exact missing requirements.",
      "Do not claim that preparation, Lanyon generation, Lean checking, or numerical closure has already run.",
    ].join(" ");
    launchHelixAskPrompt({
      question,
      autoSubmit: false,
      panelId: "workflow-demo-lab",
      suppressWorkstationPayloadActions: true,
    });
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: "Theory experiment procedure prompt inserted",
      detail: theoryTarget.trim(),
      panelId: "workflow-demo-lab",
      step: "congruence_procedure",
    });
  };

  const handleContinueTheoryExecutionClosure = () => {
    if (
      !isDeveloper ||
      !activeChatId ||
      !theoryExperimentSession?.procedureArtifactId ||
      !theoryExperimentSession.procedureSha256 ||
      activeChatId !== theoryExperimentSession.sourceSessionId
    ) {
      return;
    }
    const question = [
      "Continue the execution-closure workflow for the prepared Theory Experiment Procedure.",
      "First call theory-experiment-procedure.readmit as a developer-scoped, read-only, non-terminal workstation tool to retrieve the exact server-retained prior procedure.",
      `Use procedure_artifact_ref=${JSON.stringify(theoryExperimentSession.procedureArtifactId)},`,
      `procedure_id=${JSON.stringify(theoryExperimentSession.procedureId)},`,
      `and procedure_sha256=${JSON.stringify(theoryExperimentSession.procedureSha256)}.`,
      "Only after that typed readmission observation re-enters the current turn, call theory-experiment-procedure.evaluate_closure with its fresh current-turn procedure artifact and the same procedure_id and procedure_sha256.",
      "Bind only authentic admitted evidence for this exact procedure.",
      "After the closure observation re-enters, use its supplied ranking order and evidence-axis statuses; do not recalculate the ranking or describe evidence coverage as truth probability.",
      "Reason over open requirements and exact next capability candidates. Any formal or numerical start remains a separate confirmation-gated agent-runtime action.",
      "Do not treat the closure observation, a plan, a receipt, or a certificate as the assistant answer; synthesize only within its stated claim ceiling.",
    ].join(" ");
    launchHelixAskPrompt({
      question,
      autoSubmit: false,
      panelId: "workflow-demo-lab",
      suppressWorkstationPayloadActions: true,
    });
    recordWorkstationTimelineEntry({
      lane: "procedural",
      label: "Theory execution-closure prompt inserted",
      detail: theoryExperimentSession.procedureId,
      panelId: "workflow-demo-lab",
      step: "evidence_reentry_and_synthesis",
    });
  };

  const handleResetForActiveChat = () => {
    if (!activeChatId) return;
    resetDemo();
    const binding = contextCandidate
      ? createHelixWorkflowDemoCurrentChatBinding(contextCandidate)
      : null;
    startDemo(binding, activeChatId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-slate-950 text-slate-100" data-testid="workflow-demo-lab-panel">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <FlaskConical className="h-4 w-4 text-cyan-200" />
              <h1 className="text-sm font-semibold">Workflow Demo Lab</h1>
              <span className="rounded border border-cyan-300/25 bg-cyan-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-cyan-100">
                public demo
              </span>
            </div>
            <p className="mt-1 max-w-2xl text-xs leading-5 text-slate-400">
              Procedural demos suggest editable next prompts. Typed evidence advances the workflow; the suggestion lane never decides that a tool ran or an answer is terminal.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!session ? (
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.enable-demo" type="button" onClick={handleStart} disabled={!canEnableDemo} className="inline-flex items-center gap-1.5 rounded border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40">
                <Play className="h-3.5 w-3.5" /> Enable demo
              </button>
            ) : session.status === "paused" ? (
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.resume" type="button" onClick={resumeDemo} className="inline-flex items-center gap-1.5 rounded border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20">
                <Play className="h-3.5 w-3.5" /> Resume
              </button>
            ) : session.status === "active" ? (
              <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.pause" type="button" onClick={pauseDemo} className="inline-flex items-center gap-1.5 rounded border border-amber-300/35 bg-amber-400/10 px-3 py-1.5 text-xs text-amber-100 hover:bg-amber-400/20">
                <Pause className="h-3.5 w-3.5" /> Pause
              </button>
            ) : null}
            {session ? (
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.reset" type="button" onClick={handleReset} className="inline-flex items-center gap-1.5 rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-300 hover:bg-white/10">
                <RotateCcw className="h-3.5 w-3.5" /> Reset
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        <section
          className="mb-4 rounded-xl border border-violet-300/25 bg-violet-950/20 p-4"
          data-testid="theory-experiment-procedure-launcher"
        >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <FlaskConical className="h-4 w-4 text-violet-200" />
                  <h2 className="text-sm font-semibold">Theory comparison to proposal</h2>
                  <span className="rounded border border-violet-300/25 bg-violet-400/10 px-1.5 py-0.5 text-[9px] uppercase tracking-[0.14em] text-violet-100">
                    {isDeveloper ? "developer controls" : "public projection"}
                  </span>
                </div>
                <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                  The seven-stage Theory Badge, congruence, Lanyon, formal, numerical, and evidence-re-entry procedure remains evidence-only and non-terminal. Codex retains tool execution and bounded final synthesis.
                </p>
              </div>
              {isDeveloper ? (
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.prepare-in-ask"
                  type="button"
                  onClick={handlePrepareTheoryExperiment}
                  disabled={!activeChatId || !theoryBadgeIds.trim() || !theoryTarget.trim()}
                  className="inline-flex items-center gap-1.5 rounded border border-violet-300/35 bg-violet-400/10 px-3 py-1.5 text-xs text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Prepare in Ask
                </button>
              ) : null}
            </div>
            {isDeveloper ? (
              <div className="mt-3 grid gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,0.6fr)]">
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500" htmlFor="theory-experiment-target">
                  Comparison or proposal target
                </label>
                <textarea data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.theory-experiment-target"
                  id="theory-experiment-target"
                  value={theoryTarget}
                  onChange={(event) => setTheoryTarget(event.currentTarget.value)}
                  rows={3}
                  className="mt-1 w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-slate-100 outline-none focus:border-violet-300/50"
                />
              </div>
              <div>
                <label className="text-[10px] uppercase tracking-[0.12em] text-slate-500" htmlFor="theory-experiment-badges">
                  Registered badge ids
                </label>
                <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.theory-experiment-badges"
                  id="theory-experiment-badges"
                  value={theoryBadgeIds}
                  onChange={(event) => setTheoryBadgeIds(event.currentTarget.value)}
                  className="mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs text-slate-100 outline-none focus:border-violet-300/50"
                />
                <label className="mt-3 flex items-center gap-2 text-xs text-slate-300">
                  <input data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.input"
                    type="checkbox"
                    checked={requestLanyon}
                    onChange={(event) => setRequestLanyon(event.currentTarget.checked)}
                  />
                  Evaluate pinned Lanyon eligibility
                </label>
              </div>
              </div>
            ) : (
              <p className="mt-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-[11px] leading-5 text-slate-400">
                Public accounts can inspect the seven-stage projection and admitted closure limits. Preparing or continuing experimental tool work remains available through developer controls.
              </p>
            )}
            <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
              {THEORY_EXPERIMENT_STAGE_IDS.map((stageId, index) => {
                const stageStatus =
                  theoryExperimentSession?.stageStatus[stageId] ?? "awaiting_observation";
                const closureStatus =
                  theoryExperimentSession?.closureStageStatus[stageId] ??
                  "awaiting_observation";
                return (
                <li key={stageId} className="rounded border border-white/10 bg-black/20 px-2.5 py-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[9px] text-violet-200/70">{index + 1}/7</span>
                    <span
                      className={`text-[9px] ${
                        stageStatus === "complete"
                          ? "text-emerald-200"
                          : stageStatus === "blocked"
                            ? "text-amber-200"
                            : stageStatus === "ready"
                              ? "text-cyan-200"
                              : "text-slate-500"
                      }`}
                    >
                      {stageStatus.replaceAll("_", " ")}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[10px] text-slate-300">
                    {stageId.replaceAll("_", " ")}
                  </p>
                  {closureStatus !== "awaiting_observation" ? (
                    <p className="mt-1 text-[9px] text-violet-200/70">
                      closure: {closureStatus.replaceAll("_", " ")}
                    </p>
                  ) : null}
                </li>
                );
              })}
            </ol>
            {theoryExperimentSession ? (
              <div className="mt-3 rounded border border-white/10 bg-black/20 px-3 py-2 text-[10px] text-slate-400">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono">{theoryExperimentSession.procedureId}</span>
                  {isDeveloper ? (
                    <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.reset-projection"
                      type="button"
                      onClick={resetTheoryExperiment}
                      className="text-violet-200 underline decoration-violet-300/30 underline-offset-4"
                    >
                      Reset projection
                    </button>
                  ) : null}
                </div>
                {theoryExperimentSession.observedTurnId ? (
                  <p className="mt-1 text-emerald-200/80">
                    Causally linked typed observation admitted from turn {theoryExperimentSession.observedTurnId}.
                  </p>
                ) : (
                  <p className="mt-1">
                    Awaiting a matching `casimir.theory_experiment_procedure.observation.v1`; prose and unrelated receipts cannot advance this projection.
                  </p>
                )}
                {theoryExperimentSession.missingRequirementCodes.length > 0 ? (
                  <p className="mt-1 text-amber-200/80">
                    Missing: {theoryExperimentSession.missingRequirementCodes.join(", ")}
                  </p>
                ) : null}
                {isDeveloper && theoryExperimentSession.procedureSha256 ? (
                  <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.continue-execution-closure-in-ask"
                    type="button"
                    onClick={handleContinueTheoryExecutionClosure}
                    disabled={
                      !activeChatId ||
                      activeChatId !== theoryExperimentSession.sourceSessionId
                    }
                    className="mt-2 rounded border border-violet-300/35 bg-violet-400/10 px-2.5 py-1 text-[10px] text-violet-100 hover:bg-violet-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    Continue execution closure in Ask
                  </button>
                ) : null}
              </div>
            ) : null}
            {theoryExperimentSession?.closureSha256 ? (
              <div
                className="mt-3 rounded-lg border border-violet-300/20 bg-black/25 p-3"
                data-testid="theory-experiment-execution-closure-projection"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.12em] text-violet-200/70">
                      Execution closure observed
                    </p>
                    <p className="mt-1 text-xs text-slate-200">
                      {theoryExperimentSession.rankingOutcome?.replaceAll("_", " ")}
                      {" / "}
                      {theoryExperimentSession.synthesisReadinessStatus?.replaceAll("_", " ")}
                    </p>
                  </div>
                  <span className="rounded border border-white/10 bg-white/5 px-2 py-1 text-[9px] text-slate-300">
                    claim ceiling: {theoryExperimentSession.claimCeiling?.replaceAll("_", " ")}
                  </span>
                </div>

                <ol className="mt-3 space-y-2" aria-label="Supplied execution-closure candidate order">
                  {theoryExperimentSession.candidates.map((candidate) => (
                    <li
                      key={candidate.candidateId}
                      className="rounded border border-white/10 bg-black/20 px-2.5 py-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="break-all font-mono text-[10px] text-slate-200">
                          {candidate.displayOrdinal}. {candidate.candidateId}
                        </span>
                        <span className="text-[9px] text-cyan-200/80">
                          {candidate.evidenceCoverageScore}% evidence coverage
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {candidate.axes.map((axis) => (
                          <span
                            key={axis.axisId}
                            className={`rounded border px-1.5 py-0.5 text-[8px] ${
                              axis.status === "satisfied"
                                ? "border-emerald-300/25 text-emerald-200/80"
                                : axis.status === "failed" || axis.status === "blocked"
                                  ? "border-amber-300/25 text-amber-200/80"
                                  : "border-white/10 text-slate-400"
                            }`}
                          >
                            {axis.axisId.replaceAll("_", " ")}:{" "}
                            {axis.status.replaceAll("_", " ")}
                          </span>
                        ))}
                      </div>
                    </li>
                  ))}
                </ol>

                <p className="mt-2 text-[9px] leading-4 text-slate-500">
                  This is the validated artifact&apos;s supplied display order. Evidence coverage ranks closure priority, not theory truth or probability.
                </p>
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  <div className="rounded border border-white/10 bg-black/20 px-2.5 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-slate-500">
                      Evidence observations
                    </p>
                    {theoryExperimentSession.evidenceObservations.length > 0 ? (
                      <ul className="mt-1 space-y-1">
                        {theoryExperimentSession.evidenceObservations.map((evidence) => (
                          <li
                            key={`${evidence.kind}:${evidence.artifactRef}`}
                            className="text-[9px] text-slate-300"
                          >
                            {evidence.kind.replaceAll("_", " ")}: {evidence.status}
                            {evidence.scope === "unscoped_current_turn_evidence"
                              ? " / unscoped; not applied to this procedure"
                              : evidence.closureSatisfied
                                ? " / closure satisfied"
                                : " / procedure-scoped but still open"}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-1 text-[9px] text-slate-500">
                        No closure-satisfying evidence observation is admitted yet.
                      </p>
                    )}
                  </div>
                  <div className="rounded border border-white/10 bg-black/20 px-2.5 py-2">
                    <p className="text-[9px] uppercase tracking-[0.1em] text-slate-500">
                      Open limits
                    </p>
                    <p className="mt-1 text-[9px] leading-4 text-slate-300">
                      {theoryExperimentSession.openRequirementCodes.length > 0
                        ? theoryExperimentSession.openRequirementCodes.join(", ")
                        : "No open requirement codes were supplied."}
                    </p>
                    {theoryExperimentSession.closureBlockerCodes.length > 0 ? (
                      <p className="mt-1 text-[9px] leading-4 text-amber-200/80">
                        Blockers: {theoryExperimentSession.closureBlockerCodes.join(", ")}
                      </p>
                    ) : null}
                  </div>
                </div>
                {theoryExperimentSession.synthesisReason ? (
                  <p className="mt-2 text-[9px] leading-4 text-slate-400">
                    {theoryExperimentSession.synthesisReason}
                  </p>
                ) : null}
              </div>
            ) : null}
            <p className="mt-3 text-[10px] leading-4 text-slate-500">
              Scale biomes are localization checkpoints, never execution order. Dependency DAGs and registered bridges determine order; every returned artifact remains evidence-only until current-turn model re-entry.
            </p>
        </section>

        <section className="mb-4 rounded-xl border border-cyan-300/20 bg-cyan-950/15 p-4" data-testid="workflow-demo-context-binding">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <Link2 className="h-4 w-4 text-cyan-200" />
                <h2 className="text-sm font-semibold">Workflow objective</h2>
              </div>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">
                Bind the run to a visible objective. Chat context chooses the topic; only typed evidence advances the steps.
              </p>
            </div>
            {session?.contextBinding ? (
              <span className="rounded-full border border-emerald-300/25 bg-emerald-400/10 px-2.5 py-1 text-[10px] text-emerald-100">
                {session.contextBinding.sourceKind === "current_chat" ? "current chat" : "custom"} · {session.contextBinding.confidence}
              </span>
            ) : (
              <span className="rounded-full border border-amber-300/25 bg-amber-400/10 px-2.5 py-1 text-[10px] text-amber-100">
                context required
              </span>
            )}
          </div>

          {session?.contextBinding ? (
            <div className="mt-3 rounded-lg border border-white/10 bg-black/20 p-3">
              <p className="text-xs leading-5 text-slate-100">{session.contextBinding.objective}</p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[10px] text-slate-500">
                <span>Frozen for this run</span>
                {session.contextBinding.sourceMessageId ? <span className="font-mono">source {session.contextBinding.sourceMessageId}</span> : null}
                {session.contextBinding.sourceTraceId ? <span className="font-mono">turn {session.contextBinding.sourceTraceId}</span> : null}
              </div>
              {contextCandidate && projection.completedStepCount === 0 ? (
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.rebase-from-latest-chat" type="button" onClick={handleRebaseFromCurrentChat} className="mt-3 rounded border border-cyan-300/30 bg-cyan-400/10 px-2.5 py-1 text-xs text-cyan-100 hover:bg-cyan-400/20">
                  Rebase from latest chat
                </button>
              ) : projection.completedStepCount > 0 ? (
                <p className="mt-3 text-[11px] text-amber-200/80">Reset the demo before changing its objective after evidence has advanced a step.</p>
              ) : null}
            </div>
          ) : (
            <div className="mt-3 space-y-3">
              <div className="flex flex-wrap gap-2" role="group" aria-label="Workflow context source">
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.current-chat"
                  type="button"
                  onClick={() => setContextMode("current_chat")}
                  disabled={!contextCandidate}
                  className={`rounded border px-2.5 py-1 text-xs ${contextMode === "current_chat" ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/15 bg-white/5 text-slate-300"} disabled:cursor-not-allowed disabled:opacity-40`}
                >
                  Current chat
                </button>
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.custom-topic"
                  type="button"
                  onClick={() => setContextMode("custom")}
                  className={`rounded border px-2.5 py-1 text-xs ${contextMode === "custom" ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/15 bg-white/5 text-slate-300"}`}
                >
                  Custom topic
                </button>
                <button data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.blank-placeholder"
                  type="button"
                  onClick={() => setContextMode("blank")}
                  className={`rounded border px-2.5 py-1 text-xs ${contextMode === "blank" ? "border-cyan-300/40 bg-cyan-400/15 text-cyan-100" : "border-white/15 bg-white/5 text-slate-300"}`}
                >
                  Blank placeholder
                </button>
              </div>

              {contextMode === "current_chat" && contextCandidate ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3">
                  <p className="text-xs leading-5 text-slate-100">{contextCandidate.objective}</p>
                  <p className="mt-2 text-[10px] text-slate-500">{contextCandidate.reason} Confidence: {contextCandidate.confidence}.</p>
                </div>
              ) : contextMode === "custom" ? (
                <textarea data-helix-interaction-kind="configure" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.custom-workflow-objective"
                  value={customObjective}
                  onChange={(event) => setCustomObjective(event.currentTarget.value)}
                  rows={4}
                  placeholder="Describe the research objective this demo should pursue."
                  aria-label="Custom workflow objective"
                  className="w-full resize-y rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-xs leading-5 text-slate-100 outline-none focus:border-cyan-300/50"
                />
              ) : (
                <p className="rounded-lg border border-amber-300/20 bg-amber-400/5 p-3 text-xs leading-5 text-amber-100/80">
                  The demo can start without a topic, but no QTE will be suggested until you bind a current-chat or custom objective.
                </p>
              )}

              {session ? (
                <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.bind-objective"
                  type="button"
                  onClick={handleBindSelectedContext}
                  disabled={contextMode === "blank" || (contextMode === "custom" && !customObjective.trim()) || (contextMode === "current_chat" && !contextCandidate)}
                  className="rounded border border-cyan-300/35 bg-cyan-400/10 px-3 py-1.5 text-xs text-cyan-100 hover:bg-cyan-400/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Bind objective
                </button>
              ) : null}
            </div>
          )}
        </section>

        {activeChatMismatch ? (
          <section
            className="mb-4 rounded-xl border border-amber-300/30 bg-amber-400/10 p-4"
            data-testid="workflow-demo-chat-mismatch"
          >
            <h2 className="text-sm font-semibold text-amber-100">This workflow is pinned to another chat</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-amber-100/75">
              Its objective and Step {projection.completedStepCount + 1} progress are preserved, but replies in this chat cannot advance it. Continue explicitly here, or reset and derive a fresh objective from this chat.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.continue-this-run-here" type="button" onClick={handleContinueInActiveChat} className="rounded border border-amber-200/35 bg-amber-300/10 px-3 py-1.5 text-xs text-amber-50 hover:bg-amber-300/20">
                Continue this run here
              </button>
              <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.reset-for-this-chat" type="button" onClick={handleResetForActiveChat} className="rounded border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-slate-200 hover:bg-white/10">
                Reset for this chat
              </button>
            </div>
          </section>
        ) : null}

        <section className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold">{RESEARCH_PAPER_TO_PROPOSAL_DEMO.title}</h2>
              <p className="mt-1 max-w-3xl text-xs leading-5 text-slate-400">{RESEARCH_PAPER_TO_PROPOSAL_DEMO.description}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-2.5 py-1 text-[10px] text-slate-300">
              {projection.completedStepCount}/{projection.steps.length} complete
            </span>
          </div>

          <ol className="mt-4 grid gap-2 lg:grid-cols-2">
            {projection.steps.map((step: ResearchPaperToProposalProjection["steps"][number], index: number) => (
              <li
                key={step.id}
                className={`rounded-lg border p-3 ${
                  step.state === "completed"
                    ? "border-emerald-300/25 bg-emerald-400/5"
                    : step.state === "current"
                      ? "border-cyan-300/35 bg-cyan-400/10"
                      : "border-white/10 bg-black/15 opacity-65"
                }`}
              >
                <div className="flex items-start gap-2">
                  {step.state === "completed" ? (
                    <span className="mt-0.5 rounded-full bg-emerald-400/15 p-1 text-emerald-200"><Check className="h-3 w-3" /></span>
                  ) : (
                    <span className="mt-0.5 rounded-full border border-white/15 p-1 text-slate-400"><Circle className="h-3 w-3" /></span>
                  )}
                  <div className="min-w-0">
                    <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">{index + 1}. {step.shortLabel}</p>
                    <h3 className="mt-0.5 text-xs font-semibold text-slate-100">{step.title}</h3>
                    <p className="mt-1 text-[11px] leading-4 text-slate-400">{step.description}</p>
                    {step.evidenceRefs.length > 0 ? (
                      <p className="mt-2 break-all font-mono text-[9px] text-emerald-200/70">{step.evidenceRefs[0]}</p>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </section>

        {session?.dismissedStepId ? (
          <button data-helix-interaction-kind="navigate" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.workflow-demo-lab.workflow-demo-lab-panel.restore-dismissed-next-step-suggestion" type="button" onClick={restoreSuggestion} className="mt-4 text-xs text-cyan-200 underline decoration-cyan-300/30 underline-offset-4">
            Restore dismissed next-step suggestion
          </button>
        ) : null}
        {session?.status === "active" ? <div className="mt-4"><HelixAskWorkflowSuggestionRuntime variant="panel" /></div> : null}
        {session?.status === "completed" ? (
          <div className="mt-4 rounded-xl border border-emerald-300/30 bg-emerald-400/10 p-4 text-sm text-emerald-100">
            Demo complete. A typed postulate submission receipt closed the procedural workflow.
          </div>
        ) : null}
      </div>
    </div>
  );
}
