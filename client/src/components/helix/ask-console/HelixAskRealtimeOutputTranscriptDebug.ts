import { sha256Hex } from "@/utils/sha";

export const HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA =
  "helix.ask.realtime.completed_output_transcript.v1" as const;

const MAX_ACCUMULATED_TRANSCRIPT_CHARS = 64_000;
const MAX_SANITIZED_TRANSCRIPT_CHARS = 4_000;

export type HelixAskRealtimeCompletedOutputTranscript = {
  schema: typeof HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA;
  capture_source: "browser_data_channel";
  capture_status: "captured" | "empty";
  completed_event_ref: string;
  provider_event_type: string;
  provider_response_ref: string | null;
  provider_item_ref: string | null;
  provider_content_index: number | null;
  helix_response_purpose: string | null;
  helix_relay_id: string | null;
  helix_provisional_response_id: string | null;
  helix_handoff_id: string | null;
  helix_worker_admission_id: string | null;
  helix_utterance_code: string | null;
  correlation_source: "provider_response_created_metadata" | null;
  transcript_text_hash: string | null;
  transcript_text_char_count: number;
  sanitized_transcript_text: string | null;
  sanitized_transcript_char_count: number;
  sanitized_transcript_included: boolean;
  transcript_redacted: boolean;
  transcript_truncated: boolean;
  transcript_delta_count: number;
  transcript_accumulator_truncated: boolean;
  observed_at_ms: number;
  provider_payload_included: false;
  raw_provider_metadata_included: false;
  output_audio_transcript_deltas_included: false;
  answer_authority: false;
  assistant_answer: false;
  terminal_eligible: false;
  raw_content_included: false;
};

type TranscriptAccumulatorEntry = {
  text: string;
  deltaCount: number;
  truncated: boolean;
};

const readRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const readIdentifier = (value: unknown): string | null =>
  typeof value === "string" && value.trim()
    ? value.trim().slice(0, 240)
    : null;

const readInteger = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 0
    ? value
    : null;

const normalizeTranscript = (value: string): string =>
  value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim();

const sanitizeTranscript = (value: string): {
  text: string;
  redacted: boolean;
  truncated: boolean;
} => {
  const redactedText = value
    .replace(/\b(?:sk|sess|key)-[A-Za-z0-9_-]{12,}\b/g, "[redacted credential]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, "Bearer [redacted]")
    .replace(
      /\b(api[_-]?key|authorization|password|secret|token|cookie)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]",
    );
  if (redactedText.length <= MAX_SANITIZED_TRANSCRIPT_CHARS) {
    return {
      text: redactedText,
      redacted: redactedText !== value,
      truncated: false,
    };
  }
  const candidate = redactedText.slice(0, MAX_SANITIZED_TRANSCRIPT_CHARS);
  const boundary = Math.max(
    candidate.lastIndexOf(". "),
    candidate.lastIndexOf("? "),
    candidate.lastIndexOf("! "),
    candidate.lastIndexOf("\n"),
  );
  const text = boundary >= Math.floor(MAX_SANITIZED_TRANSCRIPT_CHARS * 0.55)
    ? candidate.slice(0, boundary + 1).trimEnd()
    : candidate.trimEnd();
  return {
    text,
    redacted: redactedText !== value,
    truncated: true,
  };
};

export const isHelixAskRealtimeOutputTranscriptEvent = (type: string): boolean =>
  /^response\.(?:output_audio_transcript|audio_transcript)\.(?:delta|done)$/.test(type);

const isCompletedTranscriptEvent = (type: string): boolean => type.endsWith(".done");

const transcriptIdentity = (event: Record<string, unknown>): {
  providerResponseRef: string | null;
  providerItemRef: string | null;
  providerContentIndex: number | null;
  key: string;
} => {
  const response = readRecord(event.response);
  const providerResponseRef = readIdentifier(
    event.response_id ?? event.responseId ?? response?.id,
  );
  const providerItemRef = readIdentifier(event.item_id ?? event.itemId);
  const providerContentIndex = readInteger(event.content_index ?? event.contentIndex);
  return {
    providerResponseRef,
    providerItemRef,
    providerContentIndex,
    key: [
      providerResponseRef ?? "response:unknown",
      providerItemRef ?? "item:unknown",
      providerContentIndex ?? "content:unknown",
    ].join("|"),
  };
};

export const createHelixAskRealtimeOutputTranscriptTracker = () => {
  const entries = new Map<string, TranscriptAccumulatorEntry>();

  return {
    observe: async (input: {
      event: Record<string, unknown>;
      type: string;
      eventRef: string;
      observedAtMs: number;
    }): Promise<HelixAskRealtimeCompletedOutputTranscript | null> => {
      if (!isHelixAskRealtimeOutputTranscriptEvent(input.type)) return null;
      const identity = transcriptIdentity(input.event);
      const existing = entries.get(identity.key) ?? {
        text: "",
        deltaCount: 0,
        truncated: false,
      };
      if (!isCompletedTranscriptEvent(input.type)) {
        const delta = typeof input.event.delta === "string" ? input.event.delta : "";
        const room = Math.max(0, MAX_ACCUMULATED_TRANSCRIPT_CHARS - existing.text.length);
        entries.set(identity.key, {
          text: `${existing.text}${delta.slice(0, room)}`,
          deltaCount: existing.deltaCount + 1,
          truncated: existing.truncated || delta.length > room,
        });
        return null;
      }

      entries.delete(identity.key);
      const completedText = typeof input.event.transcript === "string"
        ? input.event.transcript
        : existing.text;
      const normalized = normalizeTranscript(completedText);
      if (!normalized) {
        return {
          schema: HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA,
          capture_source: "browser_data_channel",
          capture_status: "empty",
          completed_event_ref: input.eventRef,
          provider_event_type: input.type,
          provider_response_ref: identity.providerResponseRef,
          provider_item_ref: identity.providerItemRef,
          provider_content_index: identity.providerContentIndex,
          helix_response_purpose: null,
          helix_relay_id: null,
          helix_provisional_response_id: null,
          helix_handoff_id: null,
          helix_worker_admission_id: null,
          helix_utterance_code: null,
          correlation_source: null,
          transcript_text_hash: null,
          transcript_text_char_count: 0,
          sanitized_transcript_text: null,
          sanitized_transcript_char_count: 0,
          sanitized_transcript_included: false,
          transcript_redacted: false,
          transcript_truncated: false,
          transcript_delta_count: existing.deltaCount,
          transcript_accumulator_truncated: existing.truncated,
          observed_at_ms: input.observedAtMs,
          provider_payload_included: false,
          raw_provider_metadata_included: false,
          output_audio_transcript_deltas_included: false,
          answer_authority: false,
          assistant_answer: false,
          terminal_eligible: false,
          raw_content_included: false,
        };
      }

      const sanitized = sanitizeTranscript(normalized);
      return {
        schema: HELIX_ASK_REALTIME_COMPLETED_OUTPUT_TRANSCRIPT_SCHEMA,
        capture_source: "browser_data_channel",
        capture_status: "captured",
        completed_event_ref: input.eventRef,
        provider_event_type: input.type,
        provider_response_ref: identity.providerResponseRef,
        provider_item_ref: identity.providerItemRef,
        provider_content_index: identity.providerContentIndex,
        helix_response_purpose: null,
        helix_relay_id: null,
        helix_provisional_response_id: null,
        helix_handoff_id: null,
        helix_worker_admission_id: null,
        helix_utterance_code: null,
        correlation_source: null,
        transcript_text_hash: `sha256:${await sha256Hex(normalized)}`,
        transcript_text_char_count: normalized.length,
        sanitized_transcript_text: sanitized.text,
        sanitized_transcript_char_count: sanitized.text.length,
        sanitized_transcript_included: true,
        transcript_redacted: sanitized.redacted,
        transcript_truncated: sanitized.truncated,
        transcript_delta_count: existing.deltaCount,
        transcript_accumulator_truncated: existing.truncated,
        observed_at_ms: input.observedAtMs,
        provider_payload_included: false,
        raw_provider_metadata_included: false,
        output_audio_transcript_deltas_included: false,
        answer_authority: false,
        assistant_answer: false,
        terminal_eligible: false,
        raw_content_included: false,
      };
    },
  };
};
