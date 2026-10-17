import type {
  HelixAgentRunEvent,
  HelixAgentRunEventType,
} from "@shared/contracts/helix-agent-api.v1";
import type { AgentRunObserverChatContext } from "./AgentRunObserverChatContext";

export const AGENT_RUN_OBSERVER_BINDING_RECEIPT_SCHEMA =
  "helix.agent_run_observer.binding_receipt.v1" as const;
export const AGENT_RUN_OBSERVER_EVENTS_PAGE_SCHEMA =
  "helix.agent_run_observer.events_page.v1" as const;
export const AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA =
  "helix.agent_run_observer.terminal_projection.v1" as const;

export type AgentRunObserverBindingStatus =
  "pending_claim" | "active" | "revoked" | "expired";

export type AgentRunObserverBinding = {
  binding_ref: string;
  status: AgentRunObserverBindingStatus;
  claim_expires_at: string | null;
  context_snapshot_ref: string | null;
  context_message_count: number;
  created_at: string;
  updated_at: string;
};

/**
 * A binding response is a receipt only. Its false authority flags are part of
 * the browser contract and must never be interpreted as assistant content.
 */
export type AgentRunObserverBindingReceipt = {
  schema: typeof AGENT_RUN_OBSERVER_BINDING_RECEIPT_SCHEMA;
  ok: true;
  error: null;
  message: string | null;
  binding: AgentRunObserverBinding;
  claim_handle: string | null;
  claim_handle_shown_once: boolean;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type AgentRunObserverCreateBindingInput = {
  chat_session_id: string;
  context?: AgentRunObserverChatContext;
};

export type AgentRunObserverTerminalMessage = {
  message_id: string;
  role: "assistant";
  content: string;
  at: string;
  traceId: string;
  helixAsk: {
    schema: typeof AGENT_RUN_OBSERVER_TERMINAL_PROJECTION_SCHEMA;
    binding_ref: string;
    authority_ref: string;
    terminal_text_hash: string;
  };
};

export type AgentRunObserverEvent = HelixAgentRunEvent;
export type AgentRunObserverEventType = HelixAgentRunEventType;

export type AgentRunObserverEventsPage = {
  schema: typeof AGENT_RUN_OBSERVER_EVENTS_PAGE_SCHEMA;
  binding_ref: string;
  events: AgentRunObserverEvent[];
  next_after_seq: number;
  has_more: boolean;
  terminal_message: AgentRunObserverTerminalMessage | null;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

export type AgentRunObserverFailureCode =
  | "invalid_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "binding_expired"
  | "binding_revoked"
  | "terminal_projection_sensitive_content_rejected"
  | "observer_response_invalid"
  | "observer_request_failed";
