import type { HelixAskConsoleSupplementSurfaceProps } from "./HelixAskConsoleSupplementSurface";
import type { HelixAskContextCapsulePreviewModel } from "./HelixAskContextCapsulePreview";
import { SESSION_CAPSULE_CONFIDENCE_LABEL } from "@/lib/helix/ask-context-capsule-display";
import type { SessionCapsuleState } from "@/lib/helix/ask-context-capsule-ledger";

export type HelixAskContextCapsuleState = Pick<
  HelixAskConsoleSupplementSurfaceProps,
  "contextCapsulePreview" | "contextCapsuleAutoApplied"
>;

export type HelixAskContextCapsuleStateOptions = HelixAskContextCapsuleState;

export type HelixAskActiveContextCapsuleDerivedStateOptions = {
  sessionCapsuleState?: SessionCapsuleState | null;
  contextCapsulePreview?: HelixAskContextCapsulePreviewModel | null;
};

export type HelixAskActiveContextCapsuleDerivedState = HelixAskContextCapsuleState & {
  contextMemoryStatusText: string | null;
};

export function buildHelixAskContextCapsuleState({
  contextCapsulePreview,
  contextCapsuleAutoApplied,
}: HelixAskContextCapsuleStateOptions): HelixAskContextCapsuleState {
  return {
    contextCapsulePreview,
    contextCapsuleAutoApplied,
  };
}

export function buildHelixAskActiveContextCapsuleDerivedState({
  sessionCapsuleState,
  contextCapsulePreview,
}: HelixAskActiveContextCapsuleDerivedStateOptions): HelixAskActiveContextCapsuleDerivedState {
  if (!sessionCapsuleState) {
    return {
      contextCapsulePreview: contextCapsulePreview ?? null,
      contextCapsuleAutoApplied: false,
      contextMemoryStatusText: null,
    };
  }
  return {
    contextCapsulePreview: {
      id: sessionCapsuleState.id,
      loading: false,
      summary: sessionCapsuleState.summary,
      convergence: sessionCapsuleState.summary.convergence,
    },
    contextCapsuleAutoApplied: true,
    contextMemoryStatusText: `Context memory active - ${SESSION_CAPSULE_CONFIDENCE_LABEL[sessionCapsuleState.confidenceBand]}`,
  };
}
