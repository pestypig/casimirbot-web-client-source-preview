import {
  AGENT_RUN_OBSERVER_BINDING_RECEIPT_SCHEMA,
  AGENT_RUN_OBSERVER_EVENTS_PAGE_SCHEMA,
  AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA,
  type AgentRunObserverBinding,
  type AgentRunObserverBindingReceipt,
  type AgentRunObserverBindingStatus,
  type AgentRunObserverCreateBindingInput,
  type AgentRunObserverEvent,
  type AgentRunObserverEventsPage,
  type AgentRunObserverFailureCode,
  type AgentRunObserverTerminalMessage,
} from "./AgentRunObserverContracts";

export const AGENT_RUN_OBSERVER_API_PATH =
  "/api/agi/agent-run-observer" as const;

type UnknownRecord = Record<string, unknown>;

const EVENT_TYPES = new Set([
  "run_started",
  "runtime_recovered",
  "continuation_received",
  "evidence_reentered",
  "issues_resolved",
  "input_requested",
  "terminal_authority_evaluated",
  "run_waiting",
  "run_completed",
  "run_blocked",
  "run_failed",
  "run_cancelled",
  "budget_exhausted",
]);

const BINDING_STATUSES = new Set<AgentRunObserverBindingStatus>([
  "pending_claim",
  "active",
  "revoked",
  "expired",
]);

const isRecord = (value: unknown): value is UnknownRecord =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const nonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

const nullableString = (value: unknown): value is string | null =>
  value === null || typeof value === "string";

const hasFalseAuthorityEnvelope = (value: UnknownRecord): boolean =>
  value.answer_authority === false &&
  value.assistant_answer === false &&
  value.terminal_eligible === false &&
  value.raw_content_included === false;

const parseBinding = (value: unknown): AgentRunObserverBinding | null => {
  if (!isRecord(value)) return null;
  if (
    !nonEmptyString(value.binding_ref) ||
    !BINDING_STATUSES.has(value.status as AgentRunObserverBindingStatus) ||
    !nullableString(value.claim_expires_at) ||
    !nullableString(value.context_snapshot_ref) ||
    !Number.isInteger(value.context_message_count) ||
    (value.context_message_count as number) < 0 ||
    !nonEmptyString(value.created_at) ||
    !nonEmptyString(value.updated_at)
  ) {
    return null;
  }
  return value as AgentRunObserverBinding;
};

const parseBindingReceipt = (
  value: unknown,
  expectOneTimeClaimHandle: boolean,
): AgentRunObserverBindingReceipt | null => {
  if (!isRecord(value)) return null;
  const binding = parseBinding(value.binding);
  const claimHandle =
    value.claim_handle === undefined ? null : value.claim_handle;
  const claimHandleShownOnce =
    value.claim_handle_shown_once === undefined && !expectOneTimeClaimHandle
      ? false
      : value.claim_handle_shown_once;
  if (
    value.schema !== AGENT_RUN_OBSERVER_BINDING_RECEIPT_SCHEMA ||
    value.ok !== true ||
    value.error !== null ||
    !nullableString(value.message) ||
    !binding ||
    !nullableString(claimHandle) ||
    claimHandleShownOnce !== expectOneTimeClaimHandle ||
    !hasFalseAuthorityEnvelope(value)
  ) {
    return null;
  }
  if (expectOneTimeClaimHandle && !nonEmptyString(claimHandle)) return null;
  if (!expectOneTimeClaimHandle && claimHandle !== null) return null;
  return {
    ...(value as Omit<
      AgentRunObserverBindingReceipt,
      "claim_handle" | "claim_handle_shown_once"
    >),
    binding,
    claim_handle: claimHandle,
    claim_handle_shown_once: claimHandleShownOnce,
  };
};

const parseEvent = (value: unknown): AgentRunObserverEvent | null => {
  if (!isRecord(value)) return null;
  if (
    value.schema !== "helix.agent_run.event.v1" ||
    !nonEmptyString(value.event_id) ||
    !nonEmptyString(value.run_id) ||
    !Number.isInteger(value.seq) ||
    (value.seq as number) <= 0 ||
    !EVENT_TYPES.has(String(value.event_type)) ||
    !isRecord(value.payload) ||
    !nonEmptyString(value.created_at) ||
    !hasFalseAuthorityEnvelope(value)
  ) {
    return null;
  }
  return value as AgentRunObserverEvent;
};

const parseTerminalMessage = (
  value: unknown,
  bindingRef: string,
): AgentRunObserverTerminalMessage | null => {
  if (!isRecord(value) || !isRecord(value.helixAsk)) return null;
  const metadata = value.helixAsk;
  if (
    !nonEmptyString(value.message_id) ||
    value.role !== "assistant" ||
    !nonEmptyString(value.content) ||
    !nonEmptyString(value.at) ||
    !nonEmptyString(value.traceId) ||
    metadata.schema !== AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA ||
    metadata.binding_ref !== bindingRef ||
    !nonEmptyString(metadata.authority_ref) ||
    !nonEmptyString(metadata.terminal_text_hash)
  ) {
    return null;
  }
  return value as AgentRunObserverTerminalMessage;
};

const parseEventsPage = (
  value: unknown,
  expectedBindingRef: string,
): AgentRunObserverEventsPage | null => {
  if (!isRecord(value)) return null;
  if (
    value.schema !== AGENT_RUN_OBSERVER_EVENTS_PAGE_SCHEMA ||
    value.binding_ref !== expectedBindingRef ||
    !Array.isArray(value.events) ||
    !Number.isInteger(value.next_after_seq) ||
    (value.next_after_seq as number) < 0 ||
    typeof value.has_more !== "boolean" ||
    !hasFalseAuthorityEnvelope(value)
  ) {
    return null;
  }
  const events = value.events.map(parseEvent);
  if (events.some((event) => !event)) return null;
  const terminalMessage =
    value.terminal_message === null
      ? null
      : parseTerminalMessage(value.terminal_message, expectedBindingRef);
  if (value.terminal_message !== null && !terminalMessage) return null;
  return {
    ...(value as Omit<
      AgentRunObserverEventsPage,
      "events" | "terminal_message"
    >),
    events: events as AgentRunObserverEvent[],
    terminal_message: terminalMessage,
  };
};

const readErrorShape = (
  value: unknown,
): { code?: AgentRunObserverFailureCode; message?: string } => {
  if (!isRecord(value)) return {};
  return {
    code:
      typeof value.error === "string"
        ? (value.error as AgentRunObserverFailureCode)
        : typeof value.code === "string"
          ? (value.code as AgentRunObserverFailureCode)
          : undefined,
    message: typeof value.message === "string" ? value.message : undefined,
  };
};

export class AgentRunObserverApiError extends Error {
  readonly code: AgentRunObserverFailureCode;
  readonly status: number;

  constructor(input: {
    code?: AgentRunObserverFailureCode;
    message?: string;
    status: number;
  }) {
    super(input.message?.trim() || "External agent observer request failed.");
    this.name = "AgentRunObserverApiError";
    this.code = input.code ?? "observer_request_failed";
    this.status = input.status;
  }
}

const requestJson = async (
  path: string,
  init: RequestInit = {},
): Promise<{ response: Response; payload: unknown }> => {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: {
      Accept: "application/json",
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = readErrorShape(payload);
    throw new AgentRunObserverApiError({
      code: failure.code,
      message: failure.message,
      status: response.status,
    });
  }
  return { response, payload };
};

const invalidResponse = (): AgentRunObserverApiError =>
  new AgentRunObserverApiError({
    code: "observer_response_invalid",
    message: "The external agent observer returned an invalid safe projection.",
    status: 502,
  });

export type AgentRunObserverApi = {
  createBinding(
    input: AgentRunObserverCreateBindingInput,
    options?: { signal?: AbortSignal },
  ): Promise<AgentRunObserverBindingReceipt>;
  getBinding(
    bindingRef: string,
    options?: { signal?: AbortSignal },
  ): Promise<AgentRunObserverBindingReceipt>;
  disconnectBinding(
    bindingRef: string,
    options?: { signal?: AbortSignal },
  ): Promise<AgentRunObserverBindingReceipt>;
  listEvents(
    bindingRef: string,
    input?: { afterSeq?: number; limit?: number; signal?: AbortSignal },
  ): Promise<AgentRunObserverEventsPage>;
};

const bindingPath = (bindingRef: string, suffix = ""): string =>
  `${AGENT_RUN_OBSERVER_API_PATH}/bindings/${encodeURIComponent(bindingRef)}${suffix}`;

export const agentRunObserverApi: AgentRunObserverApi = {
  async createBinding(input, options) {
    const chatSessionId = input.chat_session_id.trim();
    if (!chatSessionId) {
      throw new AgentRunObserverApiError({
        code: "invalid_request",
        message: "A selected chat session is required.",
        status: 400,
      });
    }
    const { payload } = await requestJson(
      `${AGENT_RUN_OBSERVER_API_PATH}/bindings`,
      {
        method: "POST",
        signal: options?.signal,
        body: JSON.stringify({
          chat_session_id: chatSessionId,
          ...(input.context ? { context: input.context } : {}),
        }),
      },
    );
    const receipt = parseBindingReceipt(payload, true);
    if (!receipt) throw invalidResponse();
    return receipt;
  },

  async getBinding(bindingRef, options) {
    const { payload } = await requestJson(bindingPath(bindingRef.trim()), {
      signal: options?.signal,
    });
    const receipt = parseBindingReceipt(payload, false);
    if (!receipt || receipt.binding.binding_ref !== bindingRef.trim()) {
      throw invalidResponse();
    }
    return receipt;
  },

  async disconnectBinding(bindingRef, options) {
    const normalizedBindingRef = bindingRef.trim();
    const { payload } = await requestJson(bindingPath(normalizedBindingRef), {
      method: "DELETE",
      signal: options?.signal,
    });
    const receipt = parseBindingReceipt(payload, false);
    if (
      !receipt ||
      receipt.binding.binding_ref !== normalizedBindingRef ||
      receipt.binding.status !== "revoked"
    ) {
      throw invalidResponse();
    }
    return receipt;
  },

  async listEvents(bindingRef, input = {}) {
    const normalizedBindingRef = bindingRef.trim();
    const afterSeq =
      Number.isInteger(input.afterSeq) && (input.afterSeq ?? 0) >= 0
        ? Math.floor(input.afterSeq ?? 0)
        : 0;
    const limit =
      Number.isInteger(input.limit) && (input.limit ?? 0) > 0
        ? Math.min(100, Math.floor(input.limit ?? 100))
        : 100;
    const query = new URLSearchParams({
      after_seq: String(afterSeq),
      limit: String(limit),
    });
    const { payload } = await requestJson(
      `${bindingPath(normalizedBindingRef, "/events")}?${query.toString()}`,
      { signal: input.signal },
    );
    const page = parseEventsPage(payload, normalizedBindingRef);
    if (!page) throw invalidResponse();
    return page;
  },
};
