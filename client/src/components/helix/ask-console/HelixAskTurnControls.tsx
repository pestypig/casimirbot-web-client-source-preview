import React, { type MouseEvent, useState } from "react";
import { AlertCircle, Bug, Copy, Loader2, Pause, Play, RotateCcw, SendHorizontal, Volume2 } from "lucide-react";
import type { ReadAloudPlaybackState } from "@/lib/helix/ask-read-aloud-display";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";
import { extractPostulateEvidenceContextFromText, type PostulateEvidenceContext } from "@/lib/agi/proposals";
import { useDocumentImageRegionStore } from "@/store/useDocumentImageRegionStore";
import { buildScientificEvidenceWorkflowStatus } from "./ScientificEvidenceWorkflowStatus";
import {
  mergeScientificEvidenceWorkflowStatus,
  mergeScientificEvidenceWorkflowStatusRecords,
  readActiveScientificEvidenceWorkflowStatus,
} from "@/store/useScientificEvidenceWorkflowStore";

export type HelixAskTurnControlsProps = {
  onCopyFinal: () => void;
  onDebugCopy: (event: MouseEvent<HTMLButtonElement>) => void;
  onReadAloud: () => void;
  debugScope?: {
    activeTurnId?: string | null;
    clientTurnId?: string | null;
    question?: string | null;
    finalAnswer?: string | null;
    terminalArtifactKind?: string | null;
    modelPolicyDebugSummary?: string | null;
  } | null;
  showDebugCopy?: boolean;
  debugCopyDisabled?: boolean;
  copyFinalTestId?: string;
  debugCopyTestId?: string;
  readAloudTestId?: string;
  readAloudActive?: boolean;
  readAloudState?: ReadAloudPlaybackState;
  readAloudAriaLabel?: string;
  readAloudTitle?: string;
  postulateText?: string | null;
  postulateEvidenceText?: string | null;
  postulateTestId?: string;
  postulateOriginatingSessionId?: string | null;
  postulateOriginatingAnswerId?: string | null;
};

const ReadAloudIcon = ({ state }: { state: ReadAloudPlaybackState }) => {
  if (state === "loading" || state === "resuming") return <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />;
  if (state === "playing") return <Pause className="h-3.5 w-3.5" aria-hidden />;
  if (state === "paused") return <Play className="h-3.5 w-3.5" aria-hidden />;
  if (state === "error" || state === "unavailable") return <AlertCircle className="h-3.5 w-3.5" aria-hidden />;
  if (state === "completed") return <RotateCcw className="h-3.5 w-3.5" aria-hidden />;
  return <Volume2 className="h-3.5 w-3.5" aria-hidden />;
};

const mergePostulateEvidenceContext = (...contexts: Array<PostulateEvidenceContext | null | undefined>): PostulateEvidenceContext => {
  const merge = (key: keyof PostulateEvidenceContext) =>
    Array.from(new Set(contexts.flatMap((context) => context?.[key] ?? []))).slice(0, 24);
  return {
    evidenceSidecarRefs: merge("evidenceSidecarRefs"),
    promotedEquationRowRefs: merge("promotedEquationRowRefs"),
    pageRenderRefs: merge("pageRenderRefs"),
    cropRefs: merge("cropRefs"),
    graphReflectionRefs: merge("graphReflectionRefs"),
    provenanceAuditRefs: merge("provenanceAuditRefs"),
    calculatorCheckRefs: merge("calculatorCheckRefs"),
    uncertaintyReductionRefs: merge("uncertaintyReductionRefs"),
  };
};

const deriveScientificPostulateEvidenceFallbacks = (args: {
  context: PostulateEvidenceContext;
  evidenceText: string;
  originatingAnswerId: string | null;
}): PostulateEvidenceContext => {
  const promotedEquationRowRefs = [...(args.context.promotedEquationRowRefs ?? [])];
  const graphReflectionRefs = [...(args.context.graphReflectionRefs ?? [])];
  const calculatorCheckRefs = [...(args.context.calculatorCheckRefs ?? [])];
  const cropRefs = args.context.cropRefs ?? [];
  const hasExactBlockPromotion = /\bexact_block_promoted\b|\bpromoted\s+exact\s+blocks?\b|\bactive\s+promoted\s+block\s+blockers\s*:\s*`?none/i.test(args.evidenceText);
  const hasExactRowPromotion = /\bexact_row_promoted\b|\bpromoted\s+exact\s+rows?\b|\bactive\s+promoted\s+row\s+blockers\s*:\s*`?none/i.test(args.evidenceText);
  if ((hasExactRowPromotion || hasExactBlockPromotion) && promotedEquationRowRefs.length === 0) {
    const prefix = hasExactBlockPromotion ? "promoted_equation_block" : "promoted_equation_row";
    cropRefs.forEach((ref) => promotedEquationRowRefs.push(`${prefix}:${ref}`));
  }
  if (/\bTheory Badge Graph reflection completed\b|\bdiagnostic graph reflection\b|\bgraph reflection\b/i.test(args.evidenceText) && graphReflectionRefs.length === 0) {
    graphReflectionRefs.push(`graph_reflection:diagnostic:${args.originatingAnswerId ?? "current-ask-context"}`);
  }
  if (/\bcalculator template admissibility\b|\bCalculator status:\s*(?:template_admissible|template_only)\b|\btemplate_admissible\b|\btemplate_only\b/i.test(args.evidenceText) && calculatorCheckRefs.length === 0) {
    calculatorCheckRefs.push("calculator_check:template_admissibility:template_admissible");
  }
  return mergePostulateEvidenceContext(args.context, {
    promotedEquationRowRefs,
    graphReflectionRefs,
    calculatorCheckRefs,
  });
};

const collectCurrentScientificPostulateEvidence = (
  candidateText: string,
  evidenceText = "",
  originatingAnswerId: string | null = null,
): PostulateEvidenceContext => {
  const documentState = useDocumentImageRegionStore.getState();
  const localWorkflowStatus = buildScientificEvidenceWorkflowStatus({
    source: documentState.source,
    cropDraft: documentState.cropDraft,
    lastReceipt: documentState.lastReceipt,
    evidenceContext: mergePostulateEvidenceContext(
      extractPostulateEvidenceContextFromText(candidateText),
      extractPostulateEvidenceContextFromText(evidenceText),
    ),
    evidenceText: `${candidateText}\n${evidenceText}`,
  });
  const storedWorkflowStatus = readActiveScientificEvidenceWorkflowStatus();
  const workflowStatus = storedWorkflowStatus
    ? mergeScientificEvidenceWorkflowStatusRecords(localWorkflowStatus, storedWorkflowStatus)
    : localWorkflowStatus;
  mergeScientificEvidenceWorkflowStatus(workflowStatus, { askThreadId: "helix-ask:desktop" });
  return deriveScientificPostulateEvidenceFallbacks({
    context: mergePostulateEvidenceContext(
      extractPostulateEvidenceContextFromText(candidateText),
      extractPostulateEvidenceContextFromText(evidenceText),
      workflowStatus.postulateReadyRefs,
    ),
    evidenceText: `${candidateText}\n${evidenceText}`,
    originatingAnswerId,
  });
};

export function HelixAskTurnControls({
  onCopyFinal,
  onDebugCopy,
  onReadAloud,
  debugScope,
  showDebugCopy = true,
  debugCopyDisabled = false,
  copyFinalTestId,
  debugCopyTestId,
  readAloudTestId,
  readAloudActive = false,
  readAloudState = "idle",
  readAloudAriaLabel = "Read aloud",
  readAloudTitle = "Read aloud",
  postulateText = null,
  postulateEvidenceText = null,
  postulateTestId,
  postulateOriginatingSessionId = null,
  postulateOriginatingAnswerId = null,
}: HelixAskTurnControlsProps) {
  const [postulateBusy, setPostulateBusy] = useState(false);
  const [postulateStatus, setPostulateStatus] = useState<string | null>(null);
  const turnScopeAttributes = {
    "data-turn-control-active-turn-id": debugScope?.activeTurnId ?? undefined,
    "data-turn-control-client-turn-id": debugScope?.clientTurnId ?? undefined,
    "data-turn-control-question": debugScope?.question ?? undefined,
    "data-turn-control-final-answer": debugScope?.finalAnswer ?? undefined,
    "data-turn-control-terminal-artifact-kind": debugScope?.terminalArtifactKind ?? undefined,
    "data-turn-control-model-policy-debug-summary": debugScope?.modelPolicyDebugSummary ?? undefined,
  };
  const normalizedPostulateText = typeof postulateText === "string" ? postulateText.trim() : "";
  const postulateEnabled = normalizedPostulateText.length > 0;
  const postulateButtonLabel = postulateStatus ?? "Send postulate for review";
  const submitPostulate = () => {
    if (!postulateEnabled || postulateBusy) return;
    setPostulateBusy(true);
    setPostulateStatus(null);
    try {
      const originatingSessionId = postulateOriginatingSessionId ?? debugScope?.activeTurnId ?? null;
      const originatingAnswerId = postulateOriginatingAnswerId ?? debugScope?.clientTurnId ?? null;
      const sourceLines = [
        originatingSessionId ? `Originating session: ${originatingSessionId}` : null,
        originatingAnswerId ? `Originating answer: ${originatingAnswerId}` : null,
      ].filter(Boolean);
      const evidenceContext = collectCurrentScientificPostulateEvidence(
        normalizedPostulateText,
        postulateEvidenceText ?? "",
        originatingAnswerId,
      );
      const localWorkflowStatus = buildScientificEvidenceWorkflowStatus({
        source: useDocumentImageRegionStore.getState().source,
        cropDraft: useDocumentImageRegionStore.getState().cropDraft,
        lastReceipt: useDocumentImageRegionStore.getState().lastReceipt,
        evidenceContext,
        evidenceText: `${normalizedPostulateText}\n${postulateEvidenceText ?? ""}`,
      });
      const storedWorkflowStatus = readActiveScientificEvidenceWorkflowStatus();
      const workflowStatus = storedWorkflowStatus
        ? mergeScientificEvidenceWorkflowStatusRecords(localWorkflowStatus, storedWorkflowStatus)
        : localWorkflowStatus;
      mergeScientificEvidenceWorkflowStatus(workflowStatus, { askThreadId: "helix-ask:desktop" });
      launchHelixAskPrompt({
        question: [
          "/postulate",
          "Review this postulate candidate for Postulate Board submission. Grade it in this chat before any board submission.",
          "",
          "Return JSON only with this shape:",
          "{\"schema\":\"helix.postulate_readiness_review.v1\",\"readinessRating\":0,\"decision\":\"submit|revise|block\",\"reason\":\"...\",\"missingDefinitions\":[],\"missingEvidence\":[],\"claimBoundaryWarnings\":[],\"calculatorStatus\":\"no_template|template_admissible|calculation_ready|solved\",\"boardReadyTitle\":null,\"boardReadyDraft\":null}",
          "",
          "Submit is justified only when the candidate is constructive, diagnostic-only, and evidence refs include a scientific sidecar, promoted page-grounded equation row, page/crop provenance, and diagnostic graph reflection. Do not claim proof, physical viability, certification, badge promotion, or graph mutation.",
          "",
          "Evidence context:",
          JSON.stringify(evidenceContext),
          "",
          "Scientific evidence workflow status:",
          JSON.stringify(workflowStatus),
          "",
          "Candidate postulate:",
          normalizedPostulateText,
          sourceLines.length > 0 ? "" : null,
          ...sourceLines,
        ].filter((line): line is string => line !== null).join("\n"),
        autoSubmit: true,
        forceReasoningDispatch: true,
        requiresBackendAskEntrypoint: true,
        suppressWorkstationPayloadActions: false,
        routeMetadata: {
          schema: "helix.ask.route_metadata.v1",
          source: "postulate_final_answer_button",
          invocationKind: "postulate_final_answer_review",
          sourceTarget: "postulate_board",
          requiredCanonicalGoal: "postulate_runtime_review_then_gated_submit",
          requiredTerminalProductKind: "postulate_runtime_review",
          requiredTerminalArtifactKind: "postulate_runtime_review",
          allowedTerminalProductKinds: ["postulate_runtime_review", "typed_failure"],
          allowedTerminalArtifactKinds: ["postulate_runtime_review", "typed_failure"],
          allowedCapabilities: ["postulate.submit_proposal"],
          forbiddenCapabilities: [],
          evidenceContext,
          scientificEvidenceWorkflowStatus: workflowStatus,
          scientific_evidence_workflow_status: workflowStatus,
          evidenceRefs: Object.values(evidenceContext).flat(),
        },
      });
      setPostulateStatus("Sent to Ask for postulate review");
    } catch (error) {
      setPostulateStatus(error instanceof Error ? error.message : "Postulate review launch failed");
      setPostulateBusy(false);
    } finally {
      window.setTimeout(() => setPostulateBusy(false), 1200);
    }
  };

  return (
    <div
      className="relative z-20 mt-2 flex max-w-fit items-center gap-1 opacity-100 transition-opacity duration-150"
      {...turnScopeAttributes}
    >
      <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-turn-controls.copy-response"
        type="button"
        onClick={onCopyFinal}
        className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
        aria-label="Copy response"
        title="Copy response"
        data-testid={copyFinalTestId}
        {...turnScopeAttributes}
      >
        <Copy className="h-3.5 w-3.5" aria-hidden />
      </button>
      {showDebugCopy ? (
        <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-turn-controls.debug-copy"
          type="button"
          onClick={onDebugCopy}
          disabled={debugCopyDisabled}
          className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Debug copy"
          title="Unified Debug Copy"
          data-testid={debugCopyTestId}
          {...turnScopeAttributes}
          data-debug-copy-active-turn-id={debugScope?.activeTurnId ?? undefined}
          data-debug-copy-client-turn-id={debugScope?.clientTurnId ?? undefined}
          data-debug-copy-question={debugScope?.question ?? undefined}
          data-debug-copy-final-answer={debugScope?.finalAnswer ?? undefined}
          data-debug-copy-terminal-artifact-kind={debugScope?.terminalArtifactKind ?? undefined}
          data-debug-copy-model-policy-debug-summary={debugScope?.modelPolicyDebugSummary ?? undefined}
        >
          <Bug className="h-3.5 w-3.5" aria-hidden />
        </button>
      ) : null}
      <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-turn-controls.on-read-aloud"
        type="button"
        onClick={onReadAloud}
        className={`rounded-full border p-1.5 transition ${
          readAloudActive
            ? "border-amber-300/40 bg-amber-400/10 text-amber-100 hover:bg-amber-400/20"
            : "border-white/10 bg-white/5 text-slate-400 hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100"
        }`}
        aria-label={readAloudAriaLabel}
        title={readAloudTitle}
        data-testid={readAloudTestId}
        data-read-aloud-state={readAloudState}
        {...turnScopeAttributes}
      >
        <ReadAloudIcon state={readAloudState} />
      </button>
      {postulateEnabled ? (
        <>
          <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="helix.ask.helix-ask-turn-controls.submit-postulate"
            type="button"
            onClick={submitPostulate}
            disabled={postulateBusy}
            className="rounded-full border border-white/10 bg-white/5 p-1.5 text-slate-400 transition hover:border-cyan-300/40 hover:bg-cyan-400/10 hover:text-cyan-100 disabled:cursor-not-allowed disabled:opacity-50"
            aria-label={postulateButtonLabel}
            title={postulateButtonLabel}
            data-testid={postulateTestId}
            {...turnScopeAttributes}
          >
            {postulateBusy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <SendHorizontal className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          {postulateStatus ? (
            <span className="sr-only" role="status" aria-live="polite">
              {postulateStatus}
            </span>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
