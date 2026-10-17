export type HelixAskComposerDestinationKind =
  | "helix_ask"
  | "bound_agent"
  | "operator_note";
export type HelixAskComposerDeliveryState =
  | "ready"
  | "queued"
  | "saving"
  | "saved"
  | "awaiting_agent_pickup"
  | "unavailable";

export type HelixAskComposerDestinationModel = {
  kind: HelixAskComposerDestinationKind;
  destinationLabel: string;
  transportLabel: string;
  actionLabel: "Ask" | "Queue" | "Save operator note";
  deliveryState: HelixAskComposerDeliveryState;
  providerDeliveryClaimed: boolean;
};

export const shouldAutomaticallySelectBoundAgent = (input: {
  bindingStatus: "pending_claim" | "active" | "revoked" | "expired" | "superseded";
  operatorSelectedDestination: boolean;
}): boolean =>
  input.bindingStatus === "active" && !input.operatorSelectedDestination;

export type HelixAskComposerDrafts = Record<HelixAskComposerDestinationKind, string>;

/** A destination change never carries unsent text to another recipient. */
export const transitionHelixAskComposerDraft = (input: {
  drafts: HelixAskComposerDrafts;
  from: HelixAskComposerDestinationKind;
  to: HelixAskComposerDestinationKind;
  currentText: string;
}): { drafts: HelixAskComposerDrafts; nextText: string } => {
  if (input.from === input.to) return { drafts: input.drafts, nextText: input.currentText };
  const drafts = { ...input.drafts, [input.from]: input.currentText };
  return { drafts, nextText: drafts[input.to] };
};

export const shouldClearBoundAgentComposerAfterSend = (input: {
  accepted: boolean;
  currentDestination: HelixAskComposerDestinationKind;
  currentText: string;
  sentText: string;
}): boolean => input.accepted && input.currentDestination === "bound_agent" &&
  input.currentText === input.sentText;

export const buildHelixAskComposerDestinationModel = (input: {
  kind: HelixAskComposerDestinationKind;
  runtimeLabel?: string | null;
  busy?: boolean;
  noteState?: "idle" | "saving" | "saved" | "unavailable";
  boundAgentState?: "active" | "awaiting_agent_pickup" | "unavailable";
}): HelixAskComposerDestinationModel => {
  if (input.kind === "operator_note") {
    const state = input.noteState ?? "idle";
    return {
      kind: "operator_note",
      destinationLabel: "This Helix workspace",
      transportLabel: "Local operator note",
      actionLabel: "Save operator note",
      deliveryState:
        state === "idle" ? "ready" : state,
      providerDeliveryClaimed: false,
    };
  }
  if (input.kind === "bound_agent") {
    const state = input.boundAgentState ?? "unavailable";
    return {
      kind: "bound_agent",
      destinationLabel: "Bound external AI task",
      transportLabel: state === "active"
        ? "Exact MCP polling binding"
        : "No active exact-task binding",
      actionLabel: state === "active" ? "Queue" : "Ask",
      deliveryState: state === "active" ? "ready" : state,
      providerDeliveryClaimed: false,
    };
  }
  const runtime = input.runtimeLabel?.trim() || "configured agent";
  return {
    kind: "helix_ask",
    destinationLabel: runtime,
    transportLabel: "Helix Ask governed turn",
    actionLabel: input.busy ? "Queue" : "Ask",
    deliveryState: input.busy ? "queued" : "ready",
    providerDeliveryClaimed: false,
  };
};

export type HelixOperatorNote = {
  note_id: string;
  text: string;
  created_at: string;
  delivery_state: "saved_locally";
  provider_delivery_claimed: false;
};

const OPERATOR_NOTE_STORAGE_KEY = "helix-operator-notes-v1";

export const saveHelixOperatorNote = (
  text: string,
  storage: Pick<Storage, "getItem" | "setItem"> = window.localStorage,
  now = new Date(),
): HelixOperatorNote => {
  const normalized = text.trim();
  if (!normalized) throw new Error("operator_note_empty");
  if (normalized.length > 20_000) throw new Error("operator_note_too_large");
  let prior: HelixOperatorNote[] = [];
  try {
    const parsed = JSON.parse(storage.getItem(OPERATOR_NOTE_STORAGE_KEY) ?? "[]");
    if (Array.isArray(parsed)) prior = parsed.slice(-199) as HelixOperatorNote[];
  } catch {
    prior = [];
  }
  const note: HelixOperatorNote = {
    note_id: `operator_note:${crypto.randomUUID()}`,
    text: normalized,
    created_at: now.toISOString(),
    delivery_state: "saved_locally",
    provider_delivery_claimed: false,
  };
  storage.setItem(OPERATOR_NOTE_STORAGE_KEY, JSON.stringify([...prior, note]));
  return note;
};
