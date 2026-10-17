import type { TheoryRuntimeContextObservationV1 } from "@shared/contracts/theory-runtime-context.v1";
import {
  buildTheoryRuntimeExplanationRouteMetadataV1,
  THEORY_RUNTIME_CONTEXT_READ_CAPABILITY,
} from "@shared/contracts/theory-runtime-explanation-route.v1";
import { launchHelixAskPrompt } from "@/lib/helix/ask-prompt-launch";

export { THEORY_RUNTIME_CONTEXT_READ_CAPABILITY };

export function launchTheoryRuntimeResultExplanation(context: TheoryRuntimeContextObservationV1): void {
  launchHelixAskPrompt({
    question: `Explain the selected scientific calculator runtime result. Bind the exact request ${context.requestId} and receipt ${context.receiptId}; describe the important scalar and gate outcomes, missing signals, warnings, and claim boundary without overstating scientific maturity.`,
    autoSubmit: true,
    panelId: "scientific-calculator",
    forceReasoningDispatch: true,
    requiresBackendAskEntrypoint: true,
    suppressWorkstationPayloadActions: true,
    routeMetadata: buildTheoryRuntimeExplanationRouteMetadataV1(context),
  });
}
