import type { DesktopPanelProposal, DesktopPanelProposalsResponse } from "@shared/jobs";

export type JobsListItem = {
  id: string;
  title: string;
  description?: string;
  kind: "code" | "research" | "agi" | "ops";
  priority: "low" | "medium" | "high";
  source: string;
  rewardTokens: number;
  paths: string[];
  tags: string[];
};

export type JobsListResponse = { jobs: JobsListItem[]; generatedAt: number };

export async function listJobs(): Promise<JobsListResponse> {
  const res = await fetch("/api/jobs/list");
  if (!res.ok) throw new Error(`jobs_list_failed: ${res.status}`);
  return (await res.json()) as JobsListResponse;
}

export type TokenLedgerEntry = {
  id: string;
  at: number;
  delta: number;
  reason: string;
  jobId?: string;
  source?: "job" | "contribution" | "proposal" | "ubi" | "payout" | "adjustment";
  ref?: string;
  evidence?: string;
};
export type TokenBalance = { userId: string; balance: number; dailyBase: number; nextResetAt: number; ledger?: TokenLedgerEntry[] };

export type PayoutKind = "withdrawal" | "ubi";
export type PayoutStatus = "pending" | "completed" | "failed" | "canceled";
export type PayoutRecord = {
  id: string;
  seq: number;
  createdAt: number;
  updatedAt: number;
  userId?: string;
  kind: PayoutKind;
  status: PayoutStatus;
  amount: number;
  reason?: string;
  distributionId?: string;
  destination?: string;
  meta?: Record<string, unknown>;
};

export async function getBudget(): Promise<TokenBalance> {
  const res = await fetch("/api/jobs/budget");
  if (!res.ok) throw new Error(`budget_failed: ${res.status}`);
  return (await res.json()) as TokenBalance;
}

export async function completeJob(jobId: string, evidence?: string): Promise<{ ok: boolean; award: number; balance: TokenBalance }>
{
  const res = await fetch("/api/jobs/complete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId, evidence }),
  });
  if (!res.ok) throw new Error(`complete_failed: ${res.status}`);
  return (await res.json()) as any;
}

export async function listPayouts(): Promise<{ payouts: PayoutRecord[]; total: number; generatedAt: number }> {
  const res = await fetch("/api/jobs/payouts");
  if (!res.ok) throw new Error(`payouts_failed: ${res.status}`);
  return (await res.json()) as any;
}

export async function requestPayout(
  amount: number,
  destination?: string,
  reason?: string,
): Promise<{ ok: boolean; payout?: PayoutRecord; error?: string }> {
  const res = await fetch("/api/jobs/payouts/request", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, destination, reason }),
  });
  if (!res.ok) throw new Error(`payout_request_failed: ${res.status}`);
  return (await res.json()) as any;
}

export async function runUbiDistribution(input?: {
  minBalance?: number;
  minPayout?: number;
  maxUsers?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch("/api/jobs/ubi/run", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });
  if (!res.ok) throw new Error(`ubi_run_failed: ${res.status}`);
  return (await res.json()) as any;
}

export async function fundUbiPool(
  amount: number,
  reason?: string,
): Promise<{ ok: boolean; balance?: TokenBalance; error?: string }> {
  const res = await fetch("/api/jobs/ubi/fund", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ amount, reason }),
  });
  if (!res.ok) throw new Error(`ubi_fund_failed: ${res.status}`);
  return (await res.json()) as any;
}

export type JobProposal = {
  title: string;
  description: string;
  kind?: "code" | "research" | "agi" | "ops";
  priority?: "low" | "medium" | "high";
  paths?: string[];
  tags?: string[];
  traceId?: string;
  rewardTokens?: number;
};

export async function proposeJob(payload: JobProposal): Promise<{ ok: boolean; agreed: boolean; job?: JobsListItem; message?: string }>{
  const res = await fetch("/api/jobs/propose", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`propose_failed: ${res.status}`);
  return (await res.json()) as any;
}

export async function listPanelProposals(): Promise<DesktopPanelProposalsResponse> {
  const res = await fetch("/api/jobs/proposals");
  if (!res.ok) throw new Error(`proposals_failed: ${res.status}`);
  const body = (await res.json()) as DesktopPanelProposalsResponse;
  return body;
}
