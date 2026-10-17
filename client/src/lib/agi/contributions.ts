import { apiRequest } from "@/lib/queryClient";
import type {
  ContributionDraftRecord,
} from "@shared/contributions/contribution-storage.schema";
import type {
  ContributionKind,
  ContributionReceipt,
  PrivacyShareLevel,
  TruthFunctionStage,
} from "@shared/contributions/contributions.schema";

export type ReceiptStatus = "cooldown" | "minted" | "revoked" | "rejected";

export type ContributionReviewRole = "peer" | "steward" | "arbiter";

export type ContributionReviewSummary = {
  required: number;
  approvals: number;
  rejections: number;
  roleCounts?: Record<ContributionReviewRole, number>;
  roleMinimums?: Record<ContributionReviewRole, number>;
  openDisputes?: number;
  totalDisputes?: number;
  ok: boolean;
};

export type ContributionReview = {
  id: string;
  reviewerId: string;
  createdAt: string;
  decision: "approve" | "reject";
  role?: ContributionReviewRole;
  notes?: string;
};

export type ContributionReceiptDisclosure = {
  id: string;
  status: ReceiptStatus;
  createdAt: string;
  updatedAt: string;
  mintedAt?: string;
  revokedAt?: string;
  draftId?: string;
  contributorId?: string;
  contributorRef?: string;
  nodeIds?: string[];
  truthFunctionIds?: string[];
  reviewSummary?: ContributionReviewSummary;
  disputeSummary?: {
    total: number;
    open: number;
    latestUpdatedAt?: string;
  };
  reviews?: ContributionReview[];
  revocations?: Array<{
    id: string;
    revokedAt: string;
    actorId?: string;
    reason?: string;
    source: "manual" | "dispute" | "policy" | "ledger";
  }>;
  verification?: ContributionReceipt["verification"];
  cooldown?: ContributionReceipt["cooldown"];
  payout?: ContributionReceipt["payout"];
  privacy?: ContributionReceipt["privacy"];
};

export type ContributionLedgerResult = {
  ok?: boolean;
  minted?: boolean;
  award?: number;
  planned?: number;
  capped?: boolean;
  reason?: string;
  reviewSummary?: ContributionReviewSummary;
  policy?: {
    windowMs: number;
    hardCap: number;
    softCap: number;
    diminishRate: number;
  };
  window?: {
    mintedSoFar: number;
    remainingHardCap: number;
    remainingSoftCap: number;
  };
  receipt?: ContributionReceiptDisclosure;
};

type DraftListResponse = { drafts?: ContributionDraftRecord[] };
type DraftResponse = { draft?: ContributionDraftRecord };
type ReceiptListResponse = { receipts?: ContributionReceiptDisclosure[] };
type ReceiptResponse = {
  receipt?: ContributionReceiptDisclosure;
  ledger?: ContributionLedgerResult;
  reviewSummary?: ContributionReviewSummary;
};

const readError = async (res: Response): Promise<string> => {
  try {
    const payload = (await res.json()) as { error?: string; message?: string };
    return payload?.error ?? payload?.message ?? res.statusText;
  } catch {
    return res.statusText;
  }
};

const ensureOk = async (res: Response, label: string): Promise<Response> => {
  if (res.ok) return res;
  const message = await readError(res);
  throw new Error(`${label}:${res.status}:${message}`);
};

export async function fetchContributionDrafts(params?: {
  includeAll?: boolean;
  limit?: number;
}): Promise<ContributionDraftRecord[]> {
  const search = new URLSearchParams();
  if (params?.includeAll) search.set("includeAll", "true");
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  const res = await apiRequest(
    "GET",
    `/api/agi/contributions/drafts${qs ? `?${qs}` : ""}`,
  );
  await ensureOk(res, "draft_list_failed");
  const payload = (await res.json()) as DraftListResponse;
  return Array.isArray(payload.drafts) ? payload.drafts : [];
}

export async function fetchContributionDraft(
  id: string,
): Promise<ContributionDraftRecord | null> {
  const res = await apiRequest(
    "GET",
    `/api/agi/contributions/drafts/${encodeURIComponent(id)}`,
  );
  if (!res.ok) return null;
  const payload = (await res.json()) as DraftResponse;
  return payload?.draft ?? null;
}

export async function ingestContribution(input: {
  text: string;
  nodeIds: string[];
  contributorId?: string;
  kind?: ContributionKind;
  stage?: TruthFunctionStage;
  allowUnknownRefs?: boolean;
}): Promise<ContributionDraftRecord> {
  const res = await apiRequest("POST", "/api/agi/contributions/ingest", input);
  await ensureOk(res, "draft_create_failed");
  const payload = (await res.json()) as DraftResponse;
  if (!payload?.draft) {
    throw new Error("draft_create_failed:missing_draft");
  }
  return payload.draft;
}

export async function verifyContributionDraft(
  id: string,
  input?: { allowUnknownRefs?: boolean },
): Promise<ContributionDraftRecord> {
  const res = await apiRequest(
    "POST",
    `/api/agi/contributions/drafts/${encodeURIComponent(id)}/verify`,
    input ?? {},
  );
  await ensureOk(res, "draft_verify_failed");
  const payload = (await res.json()) as DraftResponse;
  if (!payload?.draft) {
    throw new Error("draft_verify_failed:missing_draft");
  }
  return payload.draft;
}

export async function createContributionReceipt(
  id: string,
  input?: {
    kind?: ContributionKind;
    shareLevel?: PrivacyShareLevel;
    cooldownDays?: number;
    cooldownHours?: number;
    cooldownSeconds?: number;
    vcu?: number;
    capped?: boolean;
  },
): Promise<ReceiptResponse> {
  const res = await apiRequest(
    "POST",
    `/api/agi/contributions/drafts/${encodeURIComponent(id)}/receipt`,
    input ?? {},
  );
  await ensureOk(res, "receipt_create_failed");
  return (await res.json()) as ReceiptResponse;
}

export async function fetchContributionReceipts(params?: {
  includeAll?: boolean;
  status?: ReceiptStatus | "all";
  limit?: number;
}): Promise<ContributionReceiptDisclosure[]> {
  const search = new URLSearchParams();
  if (params?.includeAll) search.set("includeAll", "true");
  if (params?.status && params.status !== "all") {
    search.set("status", params.status);
  }
  if (params?.limit) search.set("limit", String(params.limit));
  const qs = search.toString();
  const res = await apiRequest(
    "GET",
    `/api/agi/contributions/receipts${qs ? `?${qs}` : ""}`,
  );
  await ensureOk(res, "receipt_list_failed");
  const payload = (await res.json()) as ReceiptListResponse;
  return Array.isArray(payload.receipts) ? payload.receipts : [];
}

export async function fetchContributionReceipt(
  id: string,
): Promise<ContributionReceiptDisclosure | null> {
  const res = await apiRequest(
    "GET",
    `/api/agi/contributions/receipts/${encodeURIComponent(id)}`,
  );
  if (!res.ok) return null;
  const payload = (await res.json()) as ReceiptResponse;
  return payload?.receipt ?? null;
}

export async function reviewContributionReceipt(
  id: string,
  input: {
    decision: "approve" | "reject";
    notes?: string;
    role?: ContributionReviewRole;
  },
): Promise<ReceiptResponse> {
  const res = await apiRequest(
    "POST",
    `/api/agi/contributions/receipts/${encodeURIComponent(id)}/review`,
    input,
  );
  await ensureOk(res, "receipt_review_failed");
  return (await res.json()) as ReceiptResponse;
}

export async function mintContributionReceipt(
  id: string,
): Promise<ReceiptResponse> {
  const res = await apiRequest(
    "POST",
    `/api/agi/contributions/receipts/${encodeURIComponent(id)}/mint`,
    {},
  );
  await ensureOk(res, "receipt_mint_failed");
  return (await res.json()) as ReceiptResponse;
}

export async function revokeContributionReceipt(
  id: string,
  reason?: string,
): Promise<ReceiptResponse> {
  const res = await apiRequest(
    "POST",
    `/api/agi/contributions/receipts/${encodeURIComponent(id)}/revoke`,
    { reason },
  );
  await ensureOk(res, "receipt_revoke_failed");
  return (await res.json()) as ReceiptResponse;
}
