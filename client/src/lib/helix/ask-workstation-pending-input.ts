import { asNonEmptyString, asObjectRecord } from "@/lib/helix/ask-value-normalization";
import type { HelixWorkstationAction } from "@/lib/workstation/workstationActionContract";

export type PendingDocTopicResolutionMeta = {
  status: "weak" | "ambiguous";
  confidence: number;
  topic: string | null;
  candidates: string[];
};

export function parseWorkstationConfirmationReply(reply: string): boolean | null {
  const normalized = reply.trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === "true" || normalized === "1") return true;
  if (normalized === "false" || normalized === "0") return false;
  if (/^(?:yes|y|confirm|confirmed|proceed|do it|go ahead|ok|okay|sure)\b/.test(normalized)) return true;
  if (/^(?:no|n|cancel|stop|don'?t|do not)\b/.test(normalized)) return false;
  return null;
}

export function extractPendingArgFromReply(arg: string, reply: string): string | null {
  const trimmed = reply.trim();
  if (!trimmed) return null;
  const quoted = trimmed.match(/"([^"]+)"/) ?? trimmed.match(/'([^']+)'/);
  switch (arg) {
    case "text":
      return trimmed;
    case "path": {
      const pathLike = trimmed.match(/([A-Za-z]:\\[^\s]+|\/[^\s]+|(?:docs|client|server)\/[^\s]+|[^\s]+\.md)\b/);
      return pathLike?.[1]?.trim() ?? null;
    }
    default:
      return (quoted?.[1] ?? trimmed).trim() || null;
  }
}

export function cloneRunPanelActionWithArgs(
  action: HelixWorkstationAction,
  args: Record<string, unknown>,
): HelixWorkstationAction {
  if (action.action !== "run_panel_action") return action;
  return {
    ...action,
    args,
  };
}

export function readDocTopicResolutionMeta(action: HelixWorkstationAction): PendingDocTopicResolutionMeta | null {
  if (action.action !== "run_panel_action" || action.panel_id !== "docs-viewer") return null;
  const actionArgs = asObjectRecord(action.args) ?? {};
  const statusRaw = String(actionArgs._doc_resolution_status ?? "").trim().toLowerCase();
  const status = statusRaw === "ambiguous" || statusRaw === "weak" ? statusRaw : null;
  if (!status) return null;
  const confidenceRaw = Number(actionArgs._doc_resolution_confidence);
  const confidence = Number.isFinite(confidenceRaw) ? Math.max(0, Math.min(1, confidenceRaw)) : 0;
  const topic = asNonEmptyString(actionArgs._doc_resolution_topic);
  const candidates = Array.isArray(actionArgs._doc_resolution_candidates)
    ? actionArgs._doc_resolution_candidates
        .map((candidate) => (typeof candidate === "string" ? candidate.trim() : ""))
        .filter((candidate) => candidate.length > 0)
        .slice(0, 3)
    : [];
  return {
    status,
    confidence,
    topic,
    candidates,
  };
}

export function stripDocTopicResolutionMetaFromArgs(args: Record<string, unknown>): Record<string, unknown> {
  const nextArgs = { ...args };
  delete nextArgs._doc_resolution_status;
  delete nextArgs._doc_resolution_confidence;
  delete nextArgs._doc_resolution_topic;
  delete nextArgs._doc_resolution_candidates;
  return nextArgs;
}
