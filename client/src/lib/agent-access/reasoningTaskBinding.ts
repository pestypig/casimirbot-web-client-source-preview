import { create } from "zustand";

export type BrowserReasoningBinding = Readonly<{
  reasoning_binding_id: string;
  pairing_id?: string;
  helix_conversation_id: string;
  status: "pending_claim" | "active" | "revoked" | "expired" | "superseded";
  continuation_transport: "polling" | "monitor_only" | "unavailable";
  binding_epoch: number;
  run_id?: string | null;
  mission_id?: string | null;
  /** Present on current server projections; optional only for older local snapshots. */
  service_instance_ref?: string;
  /** Present on current server projections; optional only for older local snapshots. */
  expires_at?: string;
}>;

type BrowserReasoningBindingStore = {
  current: BrowserReasoningBinding | null;
  remember: (binding: BrowserReasoningBinding) => void;
};

export const useBrowserReasoningBindingStore = create<BrowserReasoningBindingStore>((set) => ({
  current: null,
  remember: (binding) => set({ current: binding }),
}));

export const HELIX_REASONING_BINDING_STORAGE_KEY = "helix-reasoning-bindings-v1";
export const HELIX_REASONING_BINDING_UPDATED_EVENT =
  "helix:reasoning-binding-updated";
const HELIX_REASONING_BINDING_CHANNEL = "helix-reasoning-binding-v1";

export const resolveReasoningSteeringConversationId = (
  activeChatSessionId: string | null | undefined,
  contextChatSessionId: string | null | undefined,
): string | null =>
  activeChatSessionId?.trim() || contextChatSessionId?.trim() || null;

const isBrowserReasoningBinding = (value: unknown): value is BrowserReasoningBinding => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<BrowserReasoningBinding>;
  return typeof candidate.reasoning_binding_id === "string" &&
    typeof candidate.helix_conversation_id === "string" &&
    Number.isInteger(candidate.binding_epoch) &&
    (candidate.service_instance_ref === undefined ||
      typeof candidate.service_instance_ref === "string") &&
    (candidate.expires_at === undefined ||
      typeof candidate.expires_at === "string") &&
    ["pending_claim", "active", "revoked", "expired", "superseded"].includes(candidate.status ?? "") &&
    ["polling", "monitor_only", "unavailable"].includes(candidate.continuation_transport ?? "");
};

const stored = (): Record<string, BrowserReasoningBinding> => {
  try {
    const value = JSON.parse(window.localStorage.getItem(HELIX_REASONING_BINDING_STORAGE_KEY) ?? "{}");
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, BrowserReasoningBinding] => isBrowserReasoningBinding(entry[1]),
      ),
    );
  } catch {
    return {};
  }
};

const bindingChannel = typeof window !== "undefined" && "BroadcastChannel" in window
  ? new BroadcastChannel(HELIX_REASONING_BINDING_CHANNEL)
  : null;

bindingChannel?.addEventListener("message", (event: MessageEvent<unknown>) => {
  if (!isBrowserReasoningBinding(event.data)) return;
  useBrowserReasoningBindingStore.getState().remember(event.data);
  window.dispatchEvent(new CustomEvent<BrowserReasoningBinding>(
    HELIX_REASONING_BINDING_UPDATED_EVENT,
    { detail: event.data },
  ));
});

export const rememberReasoningBinding = (binding: BrowserReasoningBinding): void => {
  const saved = stored();
  const previous = saved[binding.helix_conversation_id];
  window.localStorage.setItem(HELIX_REASONING_BINDING_STORAGE_KEY, JSON.stringify({
    ...saved,
    [binding.helix_conversation_id]: binding,
  }));
  useBrowserReasoningBindingStore.getState().remember(binding);
  // A read of the current binding is not a binding change. In particular,
  // the Codex conversation reader inspects this binding before every frame;
  // rebroadcasting an identical result cancels that frame and starts another
  // inspection indefinitely.
  if (previous && previous.reasoning_binding_id === binding.reasoning_binding_id &&
    previous.pairing_id === binding.pairing_id &&
    previous.binding_epoch === binding.binding_epoch &&
    previous.status === binding.status &&
    previous.continuation_transport === binding.continuation_transport &&
    previous.run_id === binding.run_id &&
    previous.mission_id === binding.mission_id &&
    previous.service_instance_ref === binding.service_instance_ref &&
    previous.expires_at === binding.expires_at) return;
  window.dispatchEvent(new CustomEvent<BrowserReasoningBinding>(
    HELIX_REASONING_BINDING_UPDATED_EVENT,
    { detail: binding },
  ));
  bindingChannel?.postMessage(binding);
};

export const readReasoningBinding = (
  helixConversationId: string | null | undefined,
): BrowserReasoningBinding | null =>
  helixConversationId ? stored()[helixConversationId] ?? null : null;

export const readLatestReasoningBinding = (): BrowserReasoningBinding | null =>
  Object.values(stored()).reduce<BrowserReasoningBinding | null>(
    (latest, binding) => {
      if (!latest) return binding;
      return binding.binding_epoch > latest.binding_epoch ? binding : latest;
    },
    null,
  );

type BrowserReasoningSteeringEvent = Readonly<{
  steering_event_ref: string;
  delivery_state: "pending" | "acknowledged" | "expired" | "superseded" | "revoked";
  acknowledged_at: string | null;
}>;

const request = async (path: string, init: RequestInit): Promise<Record<string, unknown>> => {
  const response = await fetch(path, {
    ...init,
    credentials: "same-origin",
    cache: "no-store",
    headers: { Accept: "application/json", "Content-Type": "application/json", ...init.headers },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(typeof body.error === "string" ? body.error : "reasoning_binding_request_failed");
  return body;
};

export const issueReasoningBindingClaim = async (input: {
  clientSessionRef: string;
  helixConversationId: string;
  runAssociation?: { run_id: string; verification_ref: string };
}): Promise<{ claim_handle: string; binding: BrowserReasoningBinding }> => {
  const body = await request("/api/account/session/agent-connections/reasoning-bindings/claims", {
    method: "POST",
    body: JSON.stringify({
      client_session_ref: input.clientSessionRef,
      helix_conversation_id: input.helixConversationId,
      ...(input.runAssociation ? {
        run_id: input.runAssociation.run_id,
        run_verification_ref: input.runAssociation.verification_ref,
      } : {}),
    }),
  });
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body as { claim_handle: string; binding: BrowserReasoningBinding };
};

export const inspectReasoningBinding = async (
  bindingId: string,
): Promise<BrowserReasoningBinding> => {
  const body = await request(
    `/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(bindingId)}`,
    { method: "GET" },
  );
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body.binding as BrowserReasoningBinding;
};

export const inspectCurrentReasoningBinding = async (
  helixConversationId: string,
): Promise<BrowserReasoningBinding> => {
  const body = await request(
    "/api/account/session/agent-connections/reasoning-bindings/current" +
      `?helix_conversation_id=${encodeURIComponent(helixConversationId)}`,
    { method: "GET" },
  );
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body.binding as BrowserReasoningBinding;
};

export const inspectLatestReasoningBinding = async (): Promise<BrowserReasoningBinding> => {
  const body = await request(
    "/api/account/session/agent-connections/reasoning-bindings/current",
    { method: "GET" },
  );
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body.binding as BrowserReasoningBinding;
};

export const revokeReasoningBinding = async (
  bindingId: string,
): Promise<BrowserReasoningBinding> => {
  const body = await request(
    `/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(bindingId)}/revoke`,
    { method: "POST" },
  );
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body.binding as BrowserReasoningBinding;
};

export const dispatchReasoningSteering = async (input: {
  bindingId: string;
  bindingEpoch: number;
  clientEventRef: string;
  origin: "typed" | "gpt_live_finalized";
  instructionText: string;
}): Promise<Record<string, unknown>> => request(
  "/api/account/session/agent-connections/reasoning-bindings/steering",
  {
    method: "POST",
    body: JSON.stringify({
      reasoning_binding_id: input.bindingId,
      binding_epoch: input.bindingEpoch,
      client_event_ref: input.clientEventRef,
      origin: input.origin,
      instruction_text: input.instructionText,
    }),
  },
);

export const dispatchCurrentReasoningSteering = async (input: {
  helixConversationId: string;
  bindingId: string;
  bindingEpoch: number;
  runId: string | null;
  clientEventRef: string;
  origin: "typed" | "gpt_live_finalized";
  instructionText: string;
}): Promise<{ binding: BrowserReasoningBinding; event: BrowserReasoningSteeringEvent }> => {
  const body = await request(
    "/api/account/session/agent-connections/reasoning-bindings/steering/current",
    {
      method: "POST",
      body: JSON.stringify({
        helix_conversation_id: input.helixConversationId,
        reasoning_binding_id: input.bindingId,
        binding_epoch: input.bindingEpoch,
        run_id: input.runId,
        client_event_ref: input.clientEventRef,
        origin: input.origin,
        instruction_text: input.instructionText,
      }),
    },
  );
  rememberReasoningBinding(body.binding as BrowserReasoningBinding);
  return body as { binding: BrowserReasoningBinding; event: BrowserReasoningSteeringEvent };
};

export const inspectReasoningSteering = async (input: {
  bindingId: string;
  bindingEpoch: number;
  eventRef: string;
}): Promise<BrowserReasoningSteeringEvent> => {
  const body = await request(
    `/api/account/session/agent-connections/reasoning-bindings/${encodeURIComponent(input.bindingId)}` +
      `/steering/${encodeURIComponent(input.eventRef)}?binding_epoch=${encodeURIComponent(String(input.bindingEpoch))}`,
    { method: "GET" },
  );
  return body.event as BrowserReasoningSteeringEvent;
};
