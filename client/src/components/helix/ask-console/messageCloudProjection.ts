import type { HelixMessageCloudFrame } from "@shared/helix-message-cloud";
import type { BoundTaskConsoleMessage, MessageProgress } from "./BoundTaskConsoleHistory";

const clip = (text: string, limit: number): string => {
  const chars = Array.from(text.trim());
  return chars.length <= limit ? chars.join("") : `${chars.slice(0, limit - 1).join("")}…`;
};

/** The cloud is a glanceable preview; exact provenance stays in Message Codex. */
const preview = (text: string, limit: number): string => clip(text
  .replace(/\b(?:mcp_evidence_observation|reasoning_steering|typed):[\w:.-]+/giu, "")
  .replace(/\bEvidence(?: references?)?:\s*(?=[.;\s]|$)/giu, "")
  .replace(/,?\s*observed\s+\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z/giu, "")
  .replace(/^\s{0,3}#{1,6}\s+/gmu, "")
  .replace(/\[([^\]]+)\]\([^)]+\)/gu, "$1")
  .replace(/\*\*|`/gu, "")
  .replace(/\s+\.(?=\s|$)/gu, ".")
  .replace(/\s+/gu, " "), limit);

export function projectMessageCloudFrame(helixConversationId: string,
  messages: readonly BoundTaskConsoleMessage[], progress: Readonly<Record<string, MessageProgress>>,
): HelixMessageCloudFrame {
  return {
    schema: "helix.message_cloud_frame.v1",
    helixConversationId,
    turns: messages.slice(-3).map(message => {
      const current = message.traceId ? progress[message.traceId] : undefined;
      return {
        id: message.id.slice(0, 160),
        prompt: current?.report ? "" : preview(message.content, 180) || "Request sent to Codex.",
        delivery: current?.report ? "reported" as const
          : current?.delivery === "acknowledged" ? "picked_up" as const : "queued" as const,
        report: current?.report ? {
          status: current.report.status,
          text: preview(current.report.text, 260) || "Report available in Message Codex.",
        } : null,
      };
    }),
  };
}
