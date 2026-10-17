export const HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT =
  "helix:bound-agent-steering-request";
export const HELIX_BOUND_AGENT_STEERING_RESULT_EVENT =
  "helix:bound-agent-steering-result";

export type HelixBoundAgentSteeringRequest = Readonly<{
  requestId: string;
  instructionText: string;
  origin: "typed" | "gpt_live_finalized";
  source: "minecraft_play_activation" | "managed_conversation_review" |
    "managed_conversation_agent_handoff";
}>;

export type HelixBoundAgentSteeringResult = Readonly<{
  requestId: string;
  deliveryState:
    | "queued"
    | "acknowledged"
    | "rejected"
    | "expired"
    | "superseded"
    | "revoked"
    | "unavailable";
  steeringEventRef?: string;
  reasoningBindingId?: string;
  bindingEpoch?: number;
  helixConversationId?: string;
}>;

export type HelixBoundAgentSteeringDispatch = (
  instructionText: string,
  origin: HelixBoundAgentSteeringRequest["origin"],
  requestId: string,
) => Promise<boolean>;

export const requestBoundAgentSteering = (
  request: HelixBoundAgentSteeringRequest,
): void => {
  window.dispatchEvent(
    new CustomEvent<HelixBoundAgentSteeringRequest>(
      HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
      { detail: request },
    ),
  );
};

export const publishBoundAgentSteeringResult = (
  result: HelixBoundAgentSteeringResult,
): void => {
  window.dispatchEvent(
    new CustomEvent<HelixBoundAgentSteeringResult>(
      HELIX_BOUND_AGENT_STEERING_RESULT_EVENT,
      { detail: result },
    ),
  );
};

export const publishBoundAgentSteeringProgress = (
  requestId: string,
  deliveryState: HelixBoundAgentSteeringResult["deliveryState"],
  target?: Pick<HelixBoundAgentSteeringResult,
    "steeringEventRef" | "reasoningBindingId" | "bindingEpoch" | "helixConversationId">,
): boolean => {
  if (!requestId.startsWith("minecraft-play:") && !requestId.startsWith("managed-chat:")) return false;
  publishBoundAgentSteeringResult({ requestId, deliveryState, ...target });
  return true;
};

export const publishMinecraftPlaySteeringResult = publishBoundAgentSteeringProgress;

export const subscribeBoundAgentSteeringRequests = (
  dispatch: HelixBoundAgentSteeringDispatch,
): (() => void) => {
  const handleRequest = (event: Event): void => {
    const detail = (event as CustomEvent<HelixBoundAgentSteeringRequest>).detail;
    if (
      !detail ||
      (detail.source !== "minecraft_play_activation" && detail.source !== "managed_conversation_review" &&
        detail.source !== "managed_conversation_agent_handoff") ||
      !detail.requestId?.trim() ||
      !detail.instructionText?.trim()
    ) return;
    let progressObserved = false;
    const onProgress = (resultEvent: Event) => {
      if ((resultEvent as CustomEvent<HelixBoundAgentSteeringResult>).detail?.requestId === detail.requestId)
        progressObserved = true;
    };
    window.addEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onProgress);
    void dispatch(
      detail.instructionText,
      detail.origin,
      detail.requestId,
    ).then((accepted) => {
      if (!progressObserved) publishBoundAgentSteeringResult({
        requestId: detail.requestId, deliveryState: accepted ? "queued" : "rejected",
      });
    }).catch(() => {
      if (!progressObserved) publishBoundAgentSteeringResult({
        requestId: detail.requestId, deliveryState: "rejected",
      });
    }).finally(() => window.removeEventListener(HELIX_BOUND_AGENT_STEERING_RESULT_EVENT, onProgress));
  };
  window.addEventListener(HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT, handleRequest);
  return () => window.removeEventListener(
    HELIX_BOUND_AGENT_STEERING_REQUEST_EVENT,
    handleRequest,
  );
};
