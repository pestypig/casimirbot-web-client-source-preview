import {
  isDocEquationContextArtifactV1,
  type DocEquationContextArtifactV1,
} from "@shared/contracts/doc-equation-context.v1";
import {
  emitHelixAskLiveEvent,
  type HelixAskLiveEventBusPayload,
} from "@/lib/helix/liveEventsBus";
import { HELIX_ASK_CONTEXT_ID } from "@/lib/helix/voice-surface-contract";
import { useDocEquationContextStore } from "@/store/useDocEquationContextStore";

export const DOC_EQUATION_CONTEXT_EVENT = "helix-doc-equation-context" as const;

type DispatchTarget = {
  dispatchEvent: (event: Event) => boolean;
};

type EmitDocEquationContextOptions = {
  target?: DispatchTarget | null;
  contextId?: string;
  emitLocalEvent?: boolean;
  emitLiveEvent?: boolean;
  recordStore?: boolean;
};

const fallbackEventTarget = (): DispatchTarget | null =>
  typeof window === "undefined" ? null : window;

function makeCustomEvent<T>(type: string, detail: T): Event {
  if (typeof CustomEvent === "function") {
    return new CustomEvent<T>(type, { detail });
  }
  const event = new Event(type) as Event & { detail?: T };
  Object.defineProperty(event, "detail", {
    configurable: false,
    enumerable: true,
    value: detail,
  });
  return event;
}

const clip = (value: string, max = 180): string => {
  const trimmed = value.trim();
  return trimmed.length <= max ? trimmed : `${trimmed.slice(0, max - 1)}...`;
};

const scopeLabel = (artifact: DocEquationContextArtifactV1): string =>
  artifact.commentaryHints.scope.replace(/_/g, " ");

const preferredEvidenceTarget = (artifact: DocEquationContextArtifactV1): string =>
  artifact.preferredBadgeId ?? artifact.calculatorPayloadRef?.badgeId ?? artifact.badgeIds[0] ?? "no badge target";

export function summarizeDocEquationContext(artifact: DocEquationContextArtifactV1): string {
  const preferred = preferredEvidenceTarget(artifact);
  const scope = scopeLabel(artifact);
  const note = artifact.actionClaimBoundaryNote ?? artifact.claimBoundaryNotes[0] ?? "Diagnostic context only.";
  return `Doc equation context: ${artifact.equationLabel} -> ${preferred}. Scope: ${scope}. ${clip(note, 140)}`;
}

export function buildDocEquationContextNarration(artifact: DocEquationContextArtifactV1): string {
  const source = artifact.uri ?? `${artifact.docPath}#${artifact.anchor ?? artifact.equationId}`;
  const target = preferredEvidenceTarget(artifact);
  const panels = artifact.openedPanels.length ? artifact.openedPanels.join(", ") : "no panel recorded";
  const calculator = artifact.calculatorPayloadRef
    ? `Calculator payload: ${artifact.calculatorPayloadRef.badgeId}/${artifact.calculatorPayloadRef.payloadId}.`
    : "Calculator payload: none; use runtime/evidence artifact status when available.";
  const boundary = artifact.actionClaimBoundaryNote ?? artifact.claimBoundaryNotes[0] ?? "Diagnostic context only.";
  const focus = artifact.commentaryHints.suggestedExplanationFocus.slice(0, 4).join("; ");

  return [
    `Doc equation context: ${artifact.equationLabel}.`,
    `Source URI: ${source}.`,
    `Scope: ${scopeLabel(artifact)}; preferred evidence target: ${target}.`,
    `Workstation path: opens ${panels}. ${calculator}`,
    `Claim boundary: ${boundary}`,
    `Explanation focus: ${focus || "explain source, scope, and blockers"}.`,
    "This receipt is observation-only and not terminal answer authority.",
  ].join("\n");
}

export function buildDocEquationContextAskPrompt(artifact: DocEquationContextArtifactV1): string {
  const prohibitedClaims = artifact.commentaryHints.prohibitedClaims.join(", ");
  const boundary = artifact.actionClaimBoundaryNote ?? artifact.claimBoundaryNotes[0] ?? "Diagnostic context only.";
  return [
    "Explain the active doc equation context as workspace evidence.",
    `Use this exact source URI: ${artifact.uri ?? `${artifact.docPath}#${artifact.anchor ?? artifact.equationId}`}`,
    `Equation: ${artifact.equationLabel}`,
    `LaTeX: ${artifact.latex}`,
    `Scope: ${scopeLabel(artifact)}`,
    `Preferred evidence target: ${preferredEvidenceTarget(artifact)}`,
    `Panels opened by the action: ${artifact.openedPanels.join(", ") || "none recorded"}`,
    `Claim boundary: ${boundary}`,
    `Explain what the equation opens, which calculator or runtime artifact is relevant, and which blockers or proxy limits remain.`,
    `Avoid these promotional claims unless a separate terminal proof gate supplies them: ${prohibitedClaims}.`,
  ].join("\n");
}

export function buildDocEquationContextLiveEventPayload(
  artifact: DocEquationContextArtifactV1,
  contextId = HELIX_ASK_CONTEXT_ID.desktop,
): HelixAskLiveEventBusPayload {
  return {
    contextId,
    traceId: `doc-equation-context:${artifact.equationId}:${artifact.actionId}`,
    entry: {
      id: `doc-equation-context:${artifact.equationId}:${artifact.actionId}:${Date.now()}`,
      text: summarizeDocEquationContext(artifact),
      tool: "docs-viewer.doc_equation_context",
      ts: artifact.generatedAt,
      meta: {
        kind: "doc_equation_context",
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
        narration: buildDocEquationContextNarration(artifact),
        artifact,
      },
    },
  };
}

export function emitDocEquationContextArtifact(
  artifact: DocEquationContextArtifactV1,
  options: EmitDocEquationContextOptions = {},
): DocEquationContextArtifactV1 | null {
  if (!isDocEquationContextArtifactV1(artifact)) return null;

  if (options.recordStore !== false) {
    useDocEquationContextStore.getState().recordContext(artifact);
  }

  if (options.emitLocalEvent !== false) {
    const target = options.target ?? fallbackEventTarget();
    if (target) {
      target.dispatchEvent(makeCustomEvent(DOC_EQUATION_CONTEXT_EVENT, artifact));
    }
  }

  if (options.emitLiveEvent !== false) {
    emitHelixAskLiveEvent(buildDocEquationContextLiveEventPayload(
      artifact,
      options.contextId ?? HELIX_ASK_CONTEXT_ID.desktop,
    ));
  }

  return artifact;
}
