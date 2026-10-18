import React, { useCallback, useEffect, useMemo, useState } from "react";
import clsx from "clsx";
import { Clipboard, MessageSquare, RefreshCw, ShieldCheck } from "lucide-react";
import type { EssenceProposal } from "@shared/proposals";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import { fetchPostulateBoard, POSTULATE_BOARD_EVENT } from "@/lib/agi/proposals";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";

const formatPercent = (value: unknown): string => {
  const numeric = typeof value === "number" ? value : Number.NaN;
  if (!Number.isFinite(numeric)) return "not scored";
  return `${Math.round(numeric * 100)}%`;
};

const readPostulateMeta = (proposal: EssenceProposal): Record<string, unknown> => {
  const metadata = proposal.metadata;
  const postulate = metadata?.postulate;
  return postulate && typeof postulate === "object" && !Array.isArray(postulate)
    ? postulate as Record<string, unknown>
    : {};
};

const readString = (record: Record<string, unknown>, key: string, fallback = ""): string => {
  const value = record[key];
  return typeof value === "string" ? value : fallback;
};

const readNumber = (record: Record<string, unknown>, key: string): number | null => {
  const value = record[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

const readStringArray = (record: Record<string, unknown>, key: string): string[] => {
  const value = record[key];
  return Array.isArray(value) ? value.map(String) : [];
};

const shortId = (value: string): string => {
  if (!value) return "none";
  return value.length > 18 ? `${value.slice(0, 10)}...${value.slice(-6)}` : value;
};

const readRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

export default function PostulateBoardPanel() {
  const [proposals, setProposals] = useState<EssenceProposal[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [copiedReviewId, setCopiedReviewId] = useState<string | null>(null);
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(() =>
    readCachedAccountCapabilityPolicy(),
  );
  const isDeveloper = accountPolicy?.account_type === "developer";

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const board = await fetchPostulateBoard();
      setProposals(board);
      setLastLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load postulates");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBoard();
  }, [loadBoard]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handleBoardChanged = () => {
      void loadBoard();
    };
    window.addEventListener(POSTULATE_BOARD_EVENT, handleBoardChanged);
    return () => window.removeEventListener(POSTULATE_BOARD_EVENT, handleBoardChanged);
  }, [loadBoard]);

  useEffect(() => {
    let active = true;
    const handlePolicyChange = (event: Event) => {
      const policy = (event as CustomEvent<{ account_policy?: HelixAccountCapabilityPolicy | null }>).detail
        ?.account_policy;
      setAccountPolicy(policy ?? readCachedAccountCapabilityPolicy());
    };
    if (typeof window !== "undefined") {
      window.addEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange as EventListener);
    }
    fetchAccountCapabilityPolicy()
      .then((policy) => {
        if (active) setAccountPolicy(policy);
      })
      .catch(() => {
        if (active) setAccountPolicy(readCachedAccountCapabilityPolicy());
      });
    return () => {
      active = false;
      if (typeof window !== "undefined") {
        window.removeEventListener(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT, handlePolicyChange as EventListener);
      }
    };
  }, []);

  const sorted = useMemo(
    () => [...proposals].sort((left, right) => {
      const leftScore = typeof left.safetyScore === "number" ? left.safetyScore : -1;
      const rightScore = typeof right.safetyScore === "number" ? right.safetyScore : -1;
      if (leftScore !== rightScore) return rightScore - leftScore;
      return String(right.createdAt).localeCompare(String(left.createdAt));
    }),
    [proposals],
  );

  const copyGraphReviewPacket = useCallback(async (proposal: EssenceProposal, postulate: Record<string, unknown>) => {
    const reviewTask = readRecord(postulate["graphPatchReviewTask"]);
    const packet = {
      schema: "helix.postulate_graph_review_packet.v1",
      proposalId: proposal.id,
      status: proposal.status,
      receiptId: readString(postulate, "receiptId", proposal.id),
      receiptIssuedAt: readString(postulate, "receiptIssuedAt"),
      receiptIntegrityHash: readString(postulate, "receiptIntegrityHash"),
      domain: readString(postulate, "domain", "physics"),
      reviewScore: proposal.safetyScore ?? null,
      congruenceScore: readNumber(postulate, "congruenceScore"),
      constructivenessScore: readNumber(postulate, "constructivenessScore"),
      evidenceDepthScore: readNumber(postulate, "evidenceDepthScore"),
      calculatorCheckScore: readNumber(postulate, "calculatorCheckScore"),
      graphCongruenceScore: readNumber(postulate, "graphCongruenceScore"),
      uncertaintyReductionScore: readNumber(postulate, "uncertaintyReductionScore"),
      claimBoundaryScore: readNumber(postulate, "claimBoundaryScore"),
      evidenceRefs: readStringArray(postulate, "evidenceRefs"),
      evidenceContext: readRecord(postulate["evidenceContext"]),
      locatorRefs: readStringArray(postulate, "badgeGraphLocatorRefs"),
      proposalText: readString(postulate, "proposalText", proposal.summary),
      userComment: readString(postulate, "userComment"),
      graphPatchReviewTask: reviewTask,
      claimBoundary: readString(postulate, "claimBoundary"),
      graphMutationAuthorized: false,
    };
    const text = JSON.stringify(packet, null, 2);
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(text);
      setCopiedReviewId(proposal.id);
    }
  }, []);

  return (
    <div className="flex h-full flex-col bg-[#05070d] text-slate-100">
      <header className="border-b border-white/10 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-md border border-cyan-300/20 bg-cyan-400/10 p-2 text-cyan-100">
              <MessageSquare className="h-4 w-4" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm font-semibold text-white">Postulate board</h2>
              <p className="mt-1 text-xs text-slate-400">
                Accepted review candidates from Helix final answers
              </p>
            </div>
          </div>
          <button data-helix-interaction-kind="observe" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.postulate-board.postulate-board-panel.void-load-board"
            type="button"
            onClick={() => void loadBoard()}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-md border border-white/15 px-3 py-1.5 text-xs font-semibold text-slate-100 hover:border-cyan-300/60 disabled:opacity-50"
          >
            <RefreshCw className={clsx("h-3.5 w-3.5", loading && "animate-spin")} aria-hidden="true" />
            <span>Refresh</span>
          </button>
        </div>
        {lastLoadedAt ? (
          <p className="mt-2 text-[11px] text-slate-500">Updated {new Date(lastLoadedAt).toLocaleTimeString()}</p>
        ) : null}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5">
        {error ? (
          <div className="rounded-md border border-rose-300/20 bg-rose-500/10 p-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}
        {!loading && !error && sorted.length === 0 ? (
          <div className="rounded-md border border-white/10 bg-white/[0.03] p-4 text-sm text-slate-400">
            No accepted postulates are visible yet.
          </div>
        ) : null}
        <div className="space-y-4">
          {sorted.map((proposal) => {
            const postulate = readPostulateMeta(proposal);
            const domain = readString(
              postulate,
              "domain",
              proposal.target.type === "postulate-board"
                ? proposal.target.domain
                : "other",
            );
            const receiptId = readString(postulate, "receiptId", proposal.id);
            const receiptIntegrityHash = readString(postulate, "receiptIntegrityHash");
            const receiptIssuedAt = readString(postulate, "receiptIssuedAt");
            const graphIntegration = readString(postulate, "graphIntegration", "not_applicable");
            const graphPatchReviewTask = readRecord(postulate["graphPatchReviewTask"]);
            const graphTaskStatus = readString(graphPatchReviewTask, "status");
            const rewardCreditStatus = readString(postulate, "rewardCreditStatus", "none");
            const promptLabel = readString(postulate, "promptLabel", "Send this postulate to be reviewed");
            const evidenceContext = readRecord(postulate["evidenceContext"]);
            const evidenceContextRefs = [
              ...readStringArray(evidenceContext, "evidenceSidecarRefs"),
              ...readStringArray(evidenceContext, "promotedEquationRowRefs"),
              ...readStringArray(evidenceContext, "pageRenderRefs"),
              ...readStringArray(evidenceContext, "cropRefs"),
              ...readStringArray(evidenceContext, "graphReflectionRefs"),
              ...readStringArray(evidenceContext, "provenanceAuditRefs"),
              ...readStringArray(evidenceContext, "calculatorCheckRefs"),
              ...readStringArray(evidenceContext, "uncertaintyReductionRefs"),
            ];
            const claimBoundary = readString(
              postulate,
              "claimBoundary",
              "accepted means constructive review candidate, not proof or certification",
            );
            const originatingSessionId = readString(postulate, "originatingSessionId");
            const originatingAnswerId = readString(postulate, "originatingAnswerId");
            const submittedByAgentId = readString(postulate, "submittedByAgentId", "helix-postulate-gate");
            const accountType = readString(postulate, "accountType", "user");
            const createdTime = new Date(proposal.createdAt).toLocaleString();
            const highCongruence = proposal.status === "accepted_rewarded" || (proposal.rewardTokens ?? 0) > 0;
            const postulateLocatorRefs = readStringArray(postulate, "badgeGraphLocatorRefs");
            const locatorRefs = postulateLocatorRefs.length > 0
              ? postulateLocatorRefs
              : proposal.target.type === "postulate-board"
                ? proposal.target.badgeGraphLocatorRefs
                : [];
            return (
              <article
                key={proposal.id}
                className="grid gap-3 md:grid-cols-[2.25rem_minmax(0,1fr)]"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-300/25 bg-cyan-400/10 text-cyan-100">
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                </div>
                <div className="min-w-0 rounded-md border border-white/10 bg-white/[0.045] shadow-[0_8px_28px_rgba(0,0,0,0.22)]">
                  <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/10 px-4 py-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md border border-cyan-300/20 bg-cyan-400/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-100">
                          {domain}
                        </span>
                        <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-slate-400">
                          {proposal.status.replace(/_/g, " ")}
                        </span>
                        {highCongruence ? (
                          <span className="rounded-md border border-amber-300/25 bg-amber-400/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-amber-100">
                            high congruence
                          </span>
                        ) : null}
                        <span className="rounded-md border border-white/10 bg-black/30 px-2 py-0.5 text-[10px] text-slate-400">
                          {createdTime}
                        </span>
                      </div>
                      <h3 className="mt-2 break-words text-sm font-semibold text-white [overflow-wrap:anywhere]">
                        {proposal.title}
                      </h3>
                      <p className="mt-1 text-xs text-slate-400">{promptLabel}</p>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-semibold text-cyan-100">{formatPercent(proposal.safetyScore)}</div>
                      <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">review score</div>
                    </div>
                  </div>
                  <div className="px-4 py-3">
                    <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-200 [overflow-wrap:anywhere]">
                      {proposal.summary}
                    </p>
                    <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs leading-5 text-amber-100">
                      <span className="font-semibold">Review boundary:</span>{" "}
                      {claimBoundary}
                    </div>
                    <dl className="mt-4 grid gap-3 text-xs text-slate-300 sm:grid-cols-2 lg:grid-cols-4">
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Congruence</dt>
                        <dd className="mt-1 text-slate-100">{formatPercent(readNumber(postulate, "congruenceScore"))}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Constructive</dt>
                        <dd className="mt-1 text-slate-100">{formatPercent(readNumber(postulate, "constructivenessScore"))}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Evidence depth</dt>
                        <dd className="mt-1 text-slate-100">{formatPercent(readNumber(postulate, "evidenceDepthScore"))}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Reward</dt>
                        <dd className="mt-1 text-slate-100">{rewardCreditStatus.replace(/_/g, " ")}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Receipt</dt>
                        <dd className="mt-1 break-all font-mono text-[11px] text-slate-100">{receiptId}</dd>
                      </div>
                    </dl>
                    <div className="mt-4 rounded-md border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
                      <div>
                        <span className="text-slate-500">Board author:</span>{" "}
                        {submittedByAgentId}
                      </div>
                      <div className="mt-1">
                        <span className="text-slate-500">Source:</span>{" "}
                        Helix final answer
                        {originatingAnswerId ? ` / answer ${shortId(originatingAnswerId)}` : ""}
                      </div>
                    </div>
                    {locatorRefs.length > 0 ? (
                      <div className="mt-4">
                        <div className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Badge graph locators</div>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {locatorRefs.map((ref) => (
                            <span key={ref} className="rounded-md border border-white/10 bg-black/30 px-2 py-1 font-mono text-[11px] text-slate-200">
                              {ref}
                            </span>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    {graphIntegration !== "not_applicable" ? (
                      <div className="mt-4 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                        {graphIntegration.replace(/_/g, " ")}
                      </div>
                    ) : null}
                    {isDeveloper ? (
                      <div className="mt-4 space-y-3 rounded-md border border-violet-300/20 bg-violet-400/10 p-3">
                        <div className="grid gap-2 font-mono text-[11px] text-violet-50 sm:grid-cols-2">
                          <span>proposal={proposal.id}</span>
                          <span>agent={submittedByAgentId}</span>
                          <span>session={shortId(originatingSessionId)}</span>
                          <span>answer={shortId(originatingAnswerId)}</span>
                          <span>account={accountType}</span>
                          <span>receiptHash={shortId(receiptIntegrityHash)}</span>
                          <span>issued={receiptIssuedAt || "unknown"}</span>
                          <span>trace={formatPercent(readNumber(postulate, "traceabilityScore"))}</span>
                          <span>novelty={formatPercent(readNumber(postulate, "noveltyScore"))}</span>
                          <span>safety={formatPercent(readNumber(postulate, "safetyScore"))}</span>
                          <span>calculator={formatPercent(readNumber(postulate, "calculatorCheckScore"))}</span>
                          <span>graph={formatPercent(readNumber(postulate, "graphCongruenceScore"))}</span>
                          <span>uncertainty={formatPercent(readNumber(postulate, "uncertaintyReductionScore"))}</span>
                          <span>boundary={formatPercent(readNumber(postulate, "claimBoundaryScore"))}</span>
                        </div>
                        {evidenceContextRefs.length > 0 ? (
                          <div className="border-t border-violet-200/10 pt-3">
                            <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-violet-100/70">
                              Evidence context refs
                            </div>
                            <div className="mt-2 flex flex-wrap gap-2">
                              {evidenceContextRefs.map((ref) => (
                                <span key={ref} className="rounded border border-violet-200/20 bg-black/20 px-2 py-1 font-mono text-[10px] text-violet-50">
                                  {ref}
                                </span>
                              ))}
                            </div>
                          </div>
                        ) : null}
                        {graphTaskStatus ? (
                          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-violet-200/10 pt-3 text-xs text-violet-50">
                            <div className="min-w-0">
                              <div className="font-semibold">Graph patch review task: {graphTaskStatus}</div>
                              <div className="mt-1 text-violet-100/70">
                                Developer review packet only. Graph mutation is not authorized from this board.
                              </div>
                            </div>
                            <button data-helix-interaction-kind="act" data-helix-authority-state="client_local" data-helix-control-id="workstation.panel.postulate-board.postulate-board-panel.void-copy-graph-review-packet-proposal-postulate"
                              type="button"
                              onClick={() => void copyGraphReviewPacket(proposal, postulate)}
                              className="inline-flex shrink-0 items-center gap-2 rounded-md border border-violet-200/30 px-2.5 py-1.5 text-xs font-semibold text-violet-50 hover:bg-violet-200/10"
                            >
                              <Clipboard className="h-3.5 w-3.5" aria-hidden="true" />
                              {copiedReviewId === proposal.id ? "Copied" : "Copy review packet"}
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}
