import { asObjectRecord } from "@/lib/helix/ask-value-normalization";
import { safeJsonStringify } from "@/lib/helix/ask-debug-event-display";

export const HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY =
  "helix.ask.contextResumeFrame.v1";
export const HELIX_ASK_CONTEXT_RESUME_FRAME_SCHEMA =
  "helix.pasted_text_attachment_resume_frame.v1";

export type HelixAskContextCompactionResumeFrameStorage = Pick<Storage, "getItem" | "setItem">;

function resolveHelixAskContextCompactionResumeFrameStorage():
  | HelixAskContextCompactionResumeFrameStorage
  | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage;
}

export function isHelixAskContextCompactionResumeFrame(
  value: unknown,
): value is Record<string, unknown> {
  return (
    Boolean(value) &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).schema === HELIX_ASK_CONTEXT_RESUME_FRAME_SCHEMA
  );
}

export function isHelixAskContextCompactionPauseText(text: string | null | undefined): boolean {
  return /\b(?:context_compaction|context\s+is\s+compacting|active\s+context\s+page\s+file|pasted_text_attachment_resume_frame)\b/i.test(
    text ?? "",
  );
}

export function extractHelixAskContextCompactionResumeFrame(...values: unknown[]): Record<string, unknown> | null {
  const candidates: unknown[] = [];
  for (const value of values) {
    const record = asObjectRecord(value);
    if (!record) continue;
    candidates.push(record.resume_frame);
    for (const key of ["pending_server_request", "pending_request"]) {
      const pending = asObjectRecord(record[key]);
      if (pending) candidates.push(pending.resume_frame);
    }
    const debug = asObjectRecord(record.debug);
    if (debug) {
      candidates.push(debug.resume_frame);
      for (const key of ["pending_server_request", "pending_request"]) {
        const pending = asObjectRecord(debug[key]);
        if (pending) candidates.push(pending.resume_frame);
      }
    }
  }
  for (const candidate of candidates) {
    const frame = asObjectRecord(candidate);
    if (isHelixAskContextCompactionResumeFrame(frame)) return frame;
  }
  return null;
}

export function extractLatestHelixAskContextCompactionResumeFrameFromReplies(
  replies: readonly unknown[],
): Record<string, unknown> | null {
  for (let index = replies.length - 1; index >= 0; index -= 1) {
    const reply = asObjectRecord(replies[index]);
    const frame = extractHelixAskContextCompactionResumeFrame(reply, reply?.debug, reply?.envelope);
    if (frame) return frame;
  }
  return null;
}

export function isHelixAskContextCompactionPausePendingReply(reply: unknown): boolean {
  const replyRecord = asObjectRecord(reply);
  if (!replyRecord) return false;
  const debug = asObjectRecord(replyRecord.debug);
  const agentLoop = asObjectRecord(debug?.agentLoop ?? debug?.agent_loop);
  const contentText = typeof replyRecord.content === "string" ? replyRecord.content : "";
  const pendingCandidates = [
    replyRecord.pending_server_request,
    debug?.pending_server_request,
    debug?.pending_request,
    agentLoop?.pending_request,
    agentLoop?.pending_server_request,
  ]
    .map((value) => asObjectRecord(value))
    .filter((value): value is Record<string, unknown> => Boolean(value));
  const pendingText = pendingCandidates.map((value) => safeJsonStringify(value)).join("\n");
  const replyText = `${contentText}\n${pendingText}`;
  const hasCompactionPauseText = isHelixAskContextCompactionPauseText(replyText);
  if (!hasCompactionPauseText) return false;
  if (pendingCandidates.length > 0) return true;
  return /\bcontext\s+is\s+compacting\s+before\s+the\s+next\s+ask\s+turn\b/i.test(contentText);
}

export function readStoredHelixAskContextCompactionResumeFrame(
  storage: HelixAskContextCompactionResumeFrameStorage | null =
    resolveHelixAskContextCompactionResumeFrameStorage(),
): Record<string, unknown> | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return isHelixAskContextCompactionResumeFrame(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredHelixAskContextCompactionResumeFrame(
  frame: Record<string, unknown> | null,
  storage: HelixAskContextCompactionResumeFrameStorage | null =
    resolveHelixAskContextCompactionResumeFrameStorage(),
): void {
  if (!storage || !isHelixAskContextCompactionResumeFrame(frame)) return;
  try {
    storage.setItem(HELIX_ASK_CONTEXT_RESUME_FRAME_STORAGE_KEY, JSON.stringify(frame));
  } catch {
    // Session storage is a handoff cache only; Ask must continue to use server authority.
  }
}
