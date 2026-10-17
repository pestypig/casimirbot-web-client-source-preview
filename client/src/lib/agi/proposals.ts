import { useEffect, useState } from "react";
import type {
  EssenceProposal,
  ProposalListResponse,
  ProposalSafetyStatus,
  ProposalStatus,
  ProposalKind,
  ProposalPromptPreset,
} from "@shared/proposals";

type FetchParams = {
  status?: ProposalStatus;
  safetyStatus?: ProposalSafetyStatus;
  kind?: ProposalKind;
  day?: string;
};

export async function fetchProposals(params: FetchParams = {}): Promise<EssenceProposal[]> {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.safetyStatus) search.set("safety", params.safetyStatus);
  if (params.kind) search.set("kind", params.kind);
  if (params.day) search.set("day", params.day);
  const qs = search.toString();
  const res = await fetch(`/api/proposals${qs ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`proposals_list_failed:${res.status}`);
  }
  const body = (await res.json()) as ProposalListResponse;
  return Array.isArray(body.proposals) ? body.proposals : [];
}

export async function actOnProposal(
  id: string,
  action: "approve" | "deny",
  note?: string,
): Promise<EssenceProposal> {
  const res = await fetch(`/api/proposals/${encodeURIComponent(id)}/action`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, note }),
  });
  if (!res.ok) {
    throw new Error(`proposal_action_failed:${res.status}`);
  }
  const payload = (await res.json()) as { proposal: EssenceProposal };
  if (!payload?.proposal) {
    throw new Error("proposal_action_missing_payload");
  }
  return payload.proposal;
}

export type ProposalProgressEvent = {
  type: "proposal-progress";
  proposalId: string;
  jobId?: string | null;
  status: ProposalStatus;
  safetyStatus: ProposalSafetyStatus;
  safetyScore?: number;
  progress?: number;
  phase?: string;
};

export type ProposalChatEvent = {
  type: "proposal-chat";
  proposalId: string;
  jobId?: string | null;
  role: "builder" | "user";
  message: string;
  ts: string;
};

const MAX_CHAT_EVENTS = 50;

export function useProposalEvents(proposalId?: string | null): {
  progress: ProposalProgressEvent | null;
  chats: ProposalChatEvent[];
} {
  const [progress, setProgress] = useState<ProposalProgressEvent | null>(null);
  const [chats, setChats] = useState<ProposalChatEvent[]>([]);

  useEffect(() => {
    if (!proposalId || typeof window === "undefined" || typeof EventSource === "undefined") {
      setProgress(null);
      setChats([]);
      return;
    }
    const source = new EventSource("/api/essence/events");
    const handleMessage = (event: MessageEvent<string>) => {
      if (!event.data) return;
      let payload: ProposalProgressEvent | ProposalChatEvent | null = null;
      try {
        payload = JSON.parse(event.data) as ProposalProgressEvent | ProposalChatEvent;
      } catch {
        return;
      }
      if (!payload || payload.proposalId !== proposalId) {
        return;
      }
      if (payload.type === "proposal-progress") {
        setProgress(payload);
      } else if (payload.type === "proposal-chat") {
        setChats((current) => {
          const next = [...current, payload as ProposalChatEvent];
          if (next.length > MAX_CHAT_EVENTS) {
            return next.slice(next.length - MAX_CHAT_EVENTS);
          }
          return next;
        });
      }
    };
    source.addEventListener("message", handleMessage as EventListener);
    source.onerror = () => {
      // swallow errors; UI will retry when refetched
    };
    return () => {
      source.removeEventListener("message", handleMessage as EventListener);
      source.close();
      setProgress(null);
      setChats([]);
    };
  }, [proposalId]);

  return { progress, chats };
}

export async function createIdentityMix(label?: string): Promise<{ mixId: string; summary: string }> {
  const res = await fetch("/api/essence/mix/create", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ mode: "proposal-identity", label }),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `mix_failed_${res.status}`);
  }
  const payload = (await res.json()) as { mixId: string; summary: string };
  return payload;
}

export async function synthesizeNightlyProposals(params?: {
  hours?: number;
  minScore?: number;
  limit?: number;
  dryRun?: boolean;
}): Promise<EssenceProposal[]> {
  const res = await fetch("/api/essence/proposals/synth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params ?? {}),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `proposal_synth_failed:${res.status}`);
  }
  const payload = (await res.json()) as {
    proposals?: EssenceProposal[];
  };
  return Array.isArray(payload?.proposals) ? payload.proposals.filter(Boolean) : [];
}

export async function fetchProposalPrompts(
  id: string,
  options?: { ideologyPressures?: string[] },
): Promise<ProposalPromptPreset[]> {
  const params = new URLSearchParams();
  if (options?.ideologyPressures?.length) {
    params.set("ideologyPressures", options.ideologyPressures.join(","));
  }
  const query = params.toString();
  const res = await fetch(`/api/proposals/${encodeURIComponent(id)}/prompts${query ? `?${query}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `proposal_prompts_failed:${res.status}`);
  }
  const payload = (await res.json()) as { presets?: ProposalPromptPreset[]; evidenceHints?: string[] };
  return Array.isArray(payload?.presets) ? payload.presets : [];
}

export async function submitPostulateProposal(input: {
  proposalText: string;
  userComment?: string | null;
  originatingSessionId?: string | null;
  originatingAnswerId?: string | null;
  evidenceContext?: PostulateEvidenceContext | null;
}): Promise<{ proposal: EssenceProposal; receiptId: string }> {
  const res = await fetch("/api/proposals/postulate", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `postulate_submit_failed:${res.status}`);
  }
  const payload = (await res.json()) as { proposal?: EssenceProposal; receiptId?: string };
  if (!payload?.proposal || !payload.receiptId) {
    throw new Error("postulate_submit_missing_payload");
  }
  return { proposal: payload.proposal, receiptId: payload.receiptId };
}

export type PostulateEvidenceContext = {
  evidenceSidecarRefs?: string[];
  promotedEquationRowRefs?: string[];
  pageRenderRefs?: string[];
  cropRefs?: string[];
  graphReflectionRefs?: string[];
  provenanceAuditRefs?: string[];
  calculatorCheckRefs?: string[];
  uncertaintyReductionRefs?: string[];
};

const uniqueRefMatches = (text: string, patterns: RegExp[]): string[] => {
  const refs = new Set<string>();
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const ref = String(match[1] ?? match[0] ?? "").replace(/[),.;`\]]+$/g, "").trim();
      if (ref) refs.add(ref.slice(0, 240));
    }
  }
  return Array.from(refs).slice(0, 24);
};

export function extractPostulateEvidenceContextFromText(text: string): PostulateEvidenceContext {
  const source = typeof text === "string" ? text : "";
  return {
    evidenceSidecarRefs: uniqueRefMatches(source, [
      /\b(scientific[_-]image[_-]sidecar[:#][a-z0-9_.:/-]+)/gi,
      /\b(evidence[_-]sidecar[:#][a-z0-9_.:/-]+)/gi,
      /\b(ask:[^\s`",\]}]+scientific_image_evidence_sidecar[^\s`",\]}]*)/gi,
      /\bsidecar\s*:\s*`?([^`",\]\n]*scientific_image_evidence_sidecar[^`",\]\s]*)/gi,
      /"sidecar_id"\s*:\s*"([^"]*scientific_image_evidence_sidecar[^"]*)"/gi,
    ]),
    promotedEquationRowRefs: uniqueRefMatches(source, [
      /\b(promoted[_-]equation[_-]row[:#][a-z0-9_.:/-]+)/gi,
      /\b(exact[_-]row[_-]promotion[:#][a-z0-9_.:/-]+)/gi,
      /"(?:packet_ref|exact_evidence_ref|promoted_equation_ref|promoted_equation_row_ref)"\s*:\s*"([^"]+)"/gi,
      /"evidence_id"\s*:\s*"(promoted_scientific_image_evidence:[^"]+)"/gi,
    ]),
    pageRenderRefs: uniqueRefMatches(source, [
      /\b(page[_-]render[:#][a-z0-9_.:/-]+)/gi,
      /\b(pdf[_-]page[:#][a-z0-9_.:/-]+)/gi,
      /\bimage\s+lens\s+source\s*:\s*`?(pdf-page-render:[a-z0-9_.:/-]+)/gi,
      /"source_id"\s*:\s*"(pdf-page-render:[^"]+)"/gi,
      /"source_hash"\s*:\s*"(sha256:[a-f0-9]+)"/gi,
    ]),
    cropRefs: uniqueRefMatches(source, [
      /\b(crop[:#][a-z0-9_.:/-]+)/gi,
      /\b(equation[_-]crop[:#][a-z0-9_.:/-]+)/gi,
      /\bcrop\s+ref\s*:\s*`?(sha256:[a-f0-9]+#crop=[0-9,]+)/gi,
      /"crop_ref"\s*:\s*"(sha256:[a-f0-9]+#crop=[0-9,]+)"/gi,
    ]),
    graphReflectionRefs: uniqueRefMatches(source, [
      /\b(graph[_-]reflection[:#][a-z0-9_.:/-]+)/gi,
      /\b(theory[_-]context[_-]reflection[:#][a-z0-9_.:/-]+)/gi,
      /"(?:reflection_id|selected_reflection_id)"\s*:\s*"([^"]*(?:graph_reflection|theory_context_reflection|scientific_evidence_graph_reflection)[^"]*)"/gi,
    ]),
    provenanceAuditRefs: uniqueRefMatches(source, [
      /\b(provenance[_-]audit[:#][a-z0-9_.:/-]+)/gi,
      /\b(audit[:#][a-z0-9_.:/-]+)/gi,
    ]),
    calculatorCheckRefs: uniqueRefMatches(source, [
      /\b(calculator[_-]check[:#][a-z0-9_.:/-]+)/gi,
      /\b(dimensional[_-]check[:#][a-z0-9_.:/-]+)/gi,
      /\b(scientific-calculator-receipt[:#][a-z0-9_.:/-]+)/gi,
      /"receipt_id"\s*:\s*"([^"]*(?:scientific-calculator-receipt|calculator_receipt)[^"]*)"/gi,
    ]),
    uncertaintyReductionRefs: uniqueRefMatches(source, [
      /\b(uncertainty[_-]reduction[:#][a-z0-9_.:/-]+)/gi,
      /\b(congruence[_-]delta[:#][a-z0-9_.:/-]+)/gi,
    ]),
  };
}

export type ClaimablePostulateReceipt = {
  proposalId: string;
  receiptId: string;
  receiptIssuedAt?: string | null;
  receiptIntegrityHash?: string | null;
  title: string;
  score?: number | null;
  rewardTokens: number;
  createdAt: string;
  status: "claim_pending" | "claimed" | "issued";
};

const CLAIMABLE_POSTULATE_RECEIPTS_KEY = "helix:postulate:claimable-receipts:v1";
export const CLAIMABLE_POSTULATE_RECEIPTS_EVENT = "helix-postulate-claimable-receipts-changed";
export const POSTULATE_BOARD_EVENT = "helix-postulate-board-changed";

const notifyClaimablePostulateReceiptsChanged = (receipts: ClaimablePostulateReceipt[]): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLAIMABLE_POSTULATE_RECEIPTS_EVENT, { detail: { receipts } }));
};

export const notifyPostulateBoardChanged = (proposal?: EssenceProposal | null): void => {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(POSTULATE_BOARD_EVENT, { detail: { proposal } }));
};

const readPostulateMeta = (proposal: EssenceProposal): Record<string, unknown> => {
  const postulate = proposal.metadata?.postulate;
  return postulate && typeof postulate === "object" && !Array.isArray(postulate)
    ? postulate as Record<string, unknown>
    : {};
};

export function buildClaimablePostulateReceipt(
  proposal: EssenceProposal,
  receiptId?: string | null,
): ClaimablePostulateReceipt | null {
  if (proposal.kind !== "postulate") return null;
  const postulate = readPostulateMeta(proposal);
  const resolvedReceiptId = receiptId ?? (typeof postulate.receiptId === "string" ? postulate.receiptId : "");
  if (!resolvedReceiptId) return null;
  const rewardCreditStatus = typeof postulate.rewardCreditStatus === "string"
    ? postulate.rewardCreditStatus
    : "none";
  const receiptClaimStatus = typeof postulate.receiptClaimStatus === "string"
    ? postulate.receiptClaimStatus
    : "unclaimed";
  const isAnonymousReceipt = !proposal.ownerId;
  if (rewardCreditStatus !== "claim_pending" && rewardCreditStatus !== "issued" && !isAnonymousReceipt) return null;
  return {
    proposalId: proposal.id,
    receiptId: resolvedReceiptId,
    receiptIssuedAt: typeof postulate.receiptIssuedAt === "string" ? postulate.receiptIssuedAt : null,
    receiptIntegrityHash: typeof postulate.receiptIntegrityHash === "string" ? postulate.receiptIntegrityHash : null,
    title: proposal.title,
    score: typeof proposal.safetyScore === "number" ? proposal.safetyScore : null,
    rewardTokens: proposal.rewardTokens ?? 0,
    createdAt: proposal.createdAt,
    status: rewardCreditStatus === "issued" ? "issued" : receiptClaimStatus === "claimed" ? "claimed" : "claim_pending",
  };
}

export function readClaimablePostulateReceipts(): ClaimablePostulateReceipt[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(CLAIMABLE_POSTULATE_RECEIPTS_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.filter((entry): entry is ClaimablePostulateReceipt =>
          Boolean(entry && typeof entry.proposalId === "string" && typeof entry.receiptId === "string"),
        )
      : [];
  } catch {
    return [];
  }
}

export function rememberClaimablePostulateReceipt(receipt: ClaimablePostulateReceipt): void {
  if (typeof window === "undefined") return;
  const current = readClaimablePostulateReceipts();
  const next = [receipt, ...current.filter((entry) => entry.proposalId !== receipt.proposalId)].slice(0, 20);
  window.localStorage.setItem(CLAIMABLE_POSTULATE_RECEIPTS_KEY, JSON.stringify(next));
  notifyClaimablePostulateReceiptsChanged(next);
}

const readProposalRecord = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;

export function ingestPostulateReviewReceiptsFromAskPayload(payload: unknown): void {
  const seen = new Set<string>();
  const visit = (value: unknown, depth = 0): void => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      value.slice(0, 80).forEach((entry) => visit(entry, depth + 1));
      return;
    }
    const record = readProposalRecord(value);
    if (!record) return;
    if (record.schema === "helix.ask.postulate_review_result.v1") {
      const proposalRecord = readProposalRecord(record.proposal);
      const receiptId =
        typeof record.receiptId === "string"
          ? record.receiptId
          : typeof record.receipt_id === "string"
            ? record.receipt_id
            : undefined;
      if (proposalRecord?.kind === "postulate") {
        const proposal = proposalRecord as unknown as EssenceProposal;
        notifyPostulateBoardChanged(proposal);
        const claimableReceipt = buildClaimablePostulateReceipt(proposal, receiptId);
        if (claimableReceipt?.status === "claim_pending" && !seen.has(claimableReceipt.proposalId)) {
          seen.add(claimableReceipt.proposalId);
          rememberClaimablePostulateReceipt(claimableReceipt);
        }
      }
    }
    Object.values(record).slice(0, 120).forEach((entry) => visit(entry, depth + 1));
  };
  visit(payload);
}

export function updateClaimablePostulateReceiptStatus(
  proposalId: string,
  status: ClaimablePostulateReceipt["status"],
  patch: Partial<Pick<ClaimablePostulateReceipt, "receiptIssuedAt" | "receiptIntegrityHash">> = {},
): void {
  if (typeof window === "undefined") return;
  const next = readClaimablePostulateReceipts().map((entry) =>
    entry.proposalId === proposalId ? { ...entry, ...patch, status } : entry,
  );
  window.localStorage.setItem(CLAIMABLE_POSTULATE_RECEIPTS_KEY, JSON.stringify(next));
  notifyClaimablePostulateReceiptsChanged(next);
}

export async function claimPostulateReceipt(input: {
  proposalId: string;
  receiptId: string;
}): Promise<EssenceProposal> {
  const res = await fetch(`/api/proposals/postulate/${encodeURIComponent(input.proposalId)}/claim`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ receiptId: input.receiptId }),
  });
  if (!res.ok) {
    const message = await res.text().catch(() => res.statusText);
    throw new Error(message || `postulate_claim_failed:${res.status}`);
  }
  const payload = (await res.json()) as { proposal?: EssenceProposal };
  if (!payload?.proposal) {
    throw new Error("postulate_claim_missing_payload");
  }
  const postulate = readPostulateMeta(payload.proposal);
  const rewardCreditStatus = typeof postulate.rewardCreditStatus === "string"
    ? postulate.rewardCreditStatus
    : "none";
  const nextStatus = rewardCreditStatus === "issued" && (payload.proposal.rewardTokens ?? 0) > 0
    ? "issued"
    : "claimed";
  updateClaimablePostulateReceiptStatus(input.proposalId, nextStatus, {
    receiptIssuedAt: typeof postulate.receiptIssuedAt === "string" ? postulate.receiptIssuedAt : null,
    receiptIntegrityHash: typeof postulate.receiptIntegrityHash === "string" ? postulate.receiptIntegrityHash : null,
  });
  notifyPostulateBoardChanged(payload.proposal);
  return payload.proposal;
}

export async function fetchPostulateBoard(params: { day?: string } = {}): Promise<EssenceProposal[]> {
  const search = new URLSearchParams();
  if (params.day) search.set("day", params.day);
  const qs = search.toString();
  const res = await fetch(`/api/proposals/postulate/board${qs ? `?${qs}` : ""}`, {
    headers: { Accept: "application/json" },
  });
  if (!res.ok) {
    throw new Error(`postulate_board_failed:${res.status}`);
  }
  const body = (await res.json()) as ProposalListResponse;
  return Array.isArray(body.proposals) ? body.proposals : [];
}
