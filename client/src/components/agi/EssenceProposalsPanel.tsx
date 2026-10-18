import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import type { EssenceProposal, ProposalPromptPreset, ProposalStatus } from "@shared/proposals";
import {
  actOnProposal,
  createIdentityMix,
  fetchProposals,
  fetchProposalPrompts,
  synthesizeNightlyProposals,
  useProposalEvents,
} from "@/lib/agi/proposals";
import { useAgiChatStore } from "@/store/useAgiChatStore";
import { shallow } from "zustand/shallow";
import type { TPhaseProfile } from "@shared/essence-activity";
import type { HelixAccountCapabilityPolicy } from "@shared/helix-account-session";
import {
  HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT,
  fetchAccountCapabilityPolicy,
  readCachedAccountCapabilityPolicy,
} from "@/lib/workstation/accountCapabilityPolicy";

const STATUS_FILTERS: Array<{ label: string; value: ProposalStatus | "all" }> = [
  { label: "New", value: "new" },
  { label: "Accepted", value: "accepted" },
  { label: "Graph review", value: "queued_for_graph_review" },
  { label: "Building", value: "building" },
  { label: "Applied", value: "applied" },
  { label: "Denied", value: "denied" },
  { label: "All", value: "all" },
];

const formatScore = (score?: number) => {
  if (!Number.isFinite(score)) return "—";
  return `${(Number(score) * 100).toFixed(1)}%`;
};

export function EssenceProposalsPanel() {
  const [statusFilter, setStatusFilter] = useState<ProposalStatus | "all">("new");
  const [proposals, setProposals] = useState<EssenceProposal[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<number | null>(null);
  const [mixing, setMixing] = useState(false);
  const [mixStatus, setMixStatus] = useState<string | null>(null);
  const [synthLoading, setSynthLoading] = useState(false);
  const [synthStatus, setSynthStatus] = useState<string | null>(null);
  const [promptPresets, setPromptPresets] = useState<ProposalPromptPreset[]>([]);
  const [promptLoading, setPromptLoading] = useState(false);
  const [promptError, setPromptError] = useState<string | null>(null);
  const [copyStatus, setCopyStatus] = useState<string | null>(null);
  const [accountPolicy, setAccountPolicy] = useState<HelixAccountCapabilityPolicy | null>(() =>
    readCachedAccountCapabilityPolicy(),
  );
  const isDeveloper = accountPolicy?.account_type === "developer";
  const openPromptPanel = useCallback(() => {
    if (typeof window === "undefined") return;
    window.dispatchEvent(new CustomEvent("open-helix-panel", { detail: { id: "essence-prompt-panel" } }));
  }, []);
  const { ensureContextSession, addContextMessage } = useAgiChatStore(
    useCallback(
      (state) => ({
        ensureContextSession: state.ensureContextSession,
        addContextMessage: state.addContextMessage,
      }),
      []
    ),
    shallow,
  );

  const contextId = selectedId ? `proposal:${selectedId}` : null;
  const builderThread = useAgiChatStore(
    useCallback(
      (state) => (contextId ? state.getThreadForContext(contextId) : undefined),
      [contextId],
    ),
  );

  const loadProposals = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const payload =
        statusFilter === "all" ? await fetchProposals() : await fetchProposals({ status: statusFilter });
      setProposals(payload);
      setLastLoadedAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadProposals();
  }, [loadProposals]);

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

  useEffect(() => {
    if (!proposals.length) {
      setSelectedId(null);
      return;
    }
    if (!selectedId || !proposals.some((p) => p.id === selectedId)) {
      setSelectedId(proposals[0].id);
    }
  }, [proposals, selectedId]);

  const selected = useMemo(
    () => proposals.find((p) => p.id === selectedId) ?? (proposals.length ? proposals[0] : null),
    [proposals, selectedId],
  );

  useEffect(() => {
    if (!selected) return;
    ensureContextSession(`proposal:${selected.id}`, selected.title);
  }, [selected, ensureContextSession]);

  useEffect(() => {
    setPromptPresets([]);
    setPromptError(null);
    setCopyStatus(null);
    if (!selected || selected.patchKind !== "code-diff") {
      setPromptLoading(false);
      return;
    }
    let cancelled = false;
    setPromptLoading(true);
    fetchProposalPrompts(selected.id)
      .then((presets) => {
        if (!cancelled) {
          setPromptPresets(presets);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setPromptError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) {
          setPromptLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.patchKind]);

  useEffect(() => {
    if (!copyStatus) return;
    const timer = setTimeout(() => setCopyStatus(null), 1800);
    return () => clearTimeout(timer);
  }, [copyStatus]);

  const { progress, chats } = useProposalEvents(selected?.id ?? null);
  const lastChatKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastChatKeyRef.current = null;
  }, [selected?.id]);

  useEffect(() => {
    if (!selected || !chats.length) return;
    const latest = chats[chats.length - 1];
    const cacheKey = `${latest.ts}:${latest.role}:${latest.message.length}`;
    if (lastChatKeyRef.current === cacheKey) {
      return;
    }
    lastChatKeyRef.current = cacheKey;
    addContextMessage(
      `proposal:${selected.id}`,
      {
        role: latest.role === "builder" ? "assistant" : "user",
        content: latest.message,
        traceId: latest.jobId ?? undefined,
      },
      selected.title,
    );
  }, [chats, selected, addContextMessage]);

  const postulateActionRequiresDeveloper = selected?.kind === "postulate";
  const actionAllowed = !postulateActionRequiresDeveloper || isDeveloper;
  const actionable = selected?.status === "new" && actionAllowed;

  const handleAction = useCallback(
    async (id: string, action: "approve" | "deny") => {
      setBusyId(id);
      setError(null);
      try {
        const updated = await actOnProposal(id, action);
        setProposals((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusyId(null);
      }
    },
    [],
  );

  const handleIdentityMix = useCallback(async () => {
    setMixStatus("Creating identity mix...");
    setMixing(true);
    try {
      const payload = await createIdentityMix();
      setMixStatus(`Mix created: ${payload.mixId}`);
    } catch (err) {
      setMixStatus(err instanceof Error ? err.message : "Unable to create mix.");
    } finally {
      setMixing(false);
    }
  }, []);

  const handleSynthNightly = useCallback(async () => {
    setSynthLoading(true);
    setSynthStatus("Synthesizing nightly desktop...");
    try {
      const created = await synthesizeNightlyProposals();
      setSynthStatus(
        created.length ? `Synthesized ${created.length} proposal${created.length === 1 ? "" : "s"}.` : "No new phases detected.",
      );
      await loadProposals();
    } catch (err) {
      setSynthStatus(err instanceof Error ? err.message : "Nightly synthesis failed.");
    } finally {
      setSynthLoading(false);
    }
  }, [loadProposals]);

  const handleCopyPrompt = useCallback(
    async (text: string) => {
      if (!text) return;
      try {
        const hasClipboard = typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText;
        if (!hasClipboard) {
          setCopyStatus("Clipboard unavailable");
          return;
        }
        await navigator.clipboard.writeText(text);
        setCopyStatus("Prompt copied");
      } catch (err) {
        setCopyStatus(err instanceof Error ? err.message : "Copy failed");
      }
    },
    [],
  );

  return (
    <div className="flex h-full bg-[#05060c] text-white">
      <aside className="w-72 border-r border-white/5 bg-black/30">
        <header className="border-b border-white/10 px-4 py-3">
          <div className="text-sm font-semibold">Essence proposals</div>
          <div className="mt-1 text-[11px] text-slate-400">
            {lastLoadedAt ? `Updated ${new Date(lastLoadedAt).toLocaleTimeString()}` : "Waiting for data"}
          </div>
        </header>
        <div className="flex flex-wrap gap-2 px-4 py-3">
          {STATUS_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={clsx(
                "rounded-full px-3 py-1 text-[11px]",
                statusFilter === filter.value
                  ? "bg-sky-500/80 text-white"
                  : "bg-white/10 text-slate-200 hover:bg-white/20",
              )}
              onClick={() => setStatusFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="px-4 pb-3 space-y-2">
          <button
            onClick={() => loadProposals()}
            className="w-full rounded border border-white/15 px-3 py-1 text-[11px] text-slate-100 hover:border-white/40"
          >
            Refresh
          </button>
          <button
            onClick={() => void handleIdentityMix()}
            disabled={mixing}
            className={clsx(
              "w-full rounded border px-3 py-1 text-[11px]",
              mixing ? "border-slate-500 bg-slate-700/40 text-slate-400" : "border-white/15 text-slate-100 hover:border-white/40",
            )}
          >
            {mixing ? "Mixing..." : "Create identity mix"}
          </button>
          <button
            onClick={() => void handleSynthNightly()}
            disabled={synthLoading}
            className={clsx(
              "w-full rounded border px-3 py-1 text-[11px]",
              synthLoading ? "border-slate-500 bg-slate-700/40 text-slate-400" : "border-sky-500/50 text-slate-100 hover:border-sky-300",
            )}
          >
            {synthLoading ? "Synthesizing..." : "Nightly template"}
          </button>
          <button
            onClick={openPromptPanel}
            className="w-full rounded border border-cyan-400/40 bg-cyan-500/15 px-3 py-1 text-[11px] text-cyan-50 hover:border-cyan-300"
          >
            Open prompt panel
          </button>
          {mixStatus && <div className="text-[11px] text-slate-400">{mixStatus}</div>}
          {synthStatus && <div className="text-[11px] text-slate-400">{synthStatus}</div>}
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-4">
          {loading && <div className="px-2 py-2 text-[12px] text-slate-300">Loading proposals...</div>}
          {error && <div className="px-2 py-2 text-[12px] text-rose-300">{error}</div>}
          {!loading && !error && proposals.length === 0 && (
            <div className="px-2 py-2 text-[12px] text-slate-400">No proposals match this filter.</div>
          )}
          {proposals.map((proposal) => (
            <button
              key={proposal.id}
              className={clsx(
                "mb-2 w-full rounded-lg border px-3 py-2 text-left text-[12px]",
                proposal.id === selected?.id
                  ? "border-sky-400/60 bg-sky-400/10"
                  : "border-white/10 bg-white/5 hover:border-white/30",
              )}
              onClick={() => setSelectedId(proposal.id)}
            >
              <div className="flex items-center justify-between">
                <div className="font-semibold text-white">{proposal.title}</div>
                <StatusPill status={proposal.status} />
              </div>
              <div className="mt-1 line-clamp-2 text-[11px] text-slate-300">{proposal.summary}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-[10px] text-slate-400">
                <span className="rounded bg-black/40 px-2 py-0.5">{proposal.kind}</span>
                <span className="rounded bg-black/40 px-2 py-0.5">{proposal.target.type}</span>
              </div>
            </button>
          ))}
        </div>
      </aside>
      <section className="flex flex-1 flex-col">
        {selected ? (
          <>
            <div className="flex items-start justify-between border-b border-white/10 px-6 py-4">
              <div>
                <div className="text-[12px] uppercase tracking-wide text-slate-400">Proposal</div>
                <h2 className="text-xl font-semibold">{selected.title}</h2>
                <p className="mt-2 max-w-3xl text-sm text-slate-200 whitespace-pre-line">{selected.summary}</p>
              </div>
              <div className="flex flex-col items-end gap-2">
                <div className="flex gap-2">
                  <button
                    className="rounded border border-white/20 px-4 py-1 text-sm text-slate-200 hover:border-white/50 disabled:opacity-40"
                    disabled={!actionable || busyId === selected.id}
                    onClick={() => handleAction(selected.id, "deny")}
                  >
                    Deny
                  </button>
                  <button
                    className="rounded bg-sky-500 px-4 py-1 text-sm font-semibold text-white hover:bg-sky-400 disabled:opacity-40"
                    disabled={!actionable || busyId === selected.id}
                    onClick={() => handleAction(selected.id, "approve")}
                  >
                    Approve
                  </button>
                </div>
                {postulateActionRequiresDeveloper && !isDeveloper ? (
                  <div className="max-w-xs text-right text-[11px] text-slate-400">
                    Postulate moderation is developer-only.
                  </div>
                ) : null}
              </div>
            </div>
            <div className="grid flex-1 grid-cols-1 gap-4 p-6 sm:grid-cols-2">
              <div className="flex flex-col gap-4">
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-slate-200">Status</div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <StatusPill status={selected.status} />
                    <SafetyPill status={selected.safetyStatus} score={selected.safetyScore} />
                  </div>
                  <div className="mt-3 grid grid-cols-1 gap-3 text-sm text-slate-300 sm:grid-cols-2">
                    <div>
                      <div className="text-[11px] uppercase text-slate-500">Safety score</div>
                      <div className="mt-1 text-base text-white">{formatScore(selected.safetyScore)}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-slate-500">Eval gate</div>
                      <div className="mt-1 text-base text-white">≥ 99%</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-slate-500">Job</div>
                      <div className="mt-1 font-mono text-xs text-slate-200">{selected.jobId ?? "—"}</div>
                    </div>
                    <div>
                      <div className="text-[11px] uppercase text-slate-500">Phase</div>
                      <div className="mt-1 text-white">
                        {progress?.phase ?? selected.status}
                        {typeof progress?.progress === "number" && (
                          <span className="ml-2 text-slate-300">{Math.round(progress.progress * 100)}%</span>
                        )}
                      </div>
                    </div>
                  </div>
                  {selected.safetyReport && (
                    <div className="mt-3 rounded border border-rose-400/20 bg-rose-500/5 p-3 text-xs text-rose-100">
                      {selected.safetyReport}
                    </div>
                  )}
                </div>
                <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-slate-200">Target</div>
                  <TargetDetails proposal={selected} />
                </div>
                {selected.patchKind === "code-diff" ? (
                  <div className="rounded-xl border border-white/10 bg-white/5 p-4">
                    <div className="flex items-center justify-between">
                      <div className="text-sm font-semibold text-slate-200">Patch prompt presets</div>
                      {promptLoading && <div className="text-[11px] text-slate-400">Refreshing...</div>}
                    </div>
                    {promptError && <div className="mt-2 text-[12px] text-rose-300">{promptError}</div>}
                    {!promptLoading && !promptError && promptPresets.length === 0 && (
                      <div className="mt-2 text-[12px] text-slate-400">No presets yet for this patch.</div>
                    )}
                    <div className="mt-3 space-y-3">
                      {promptPresets.map((preset) => (
                        <div key={preset.id} className="rounded-lg border border-white/10 bg-black/30 p-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="text-sm font-semibold text-white">{preset.label}</div>
                              {preset.context ? <div className="mt-1 text-[11px] text-slate-400">{preset.context}</div> : null}
                              <div className="mt-2 whitespace-pre-wrap text-[12px] leading-relaxed text-slate-100">
                                {preset.prompt}
                              </div>
                            </div>
                            <button
                              type="button"
                              className="shrink-0 rounded border border-white/15 px-2 py-1 text-[11px] text-slate-100 hover:border-white/40"
                              onClick={() => void handleCopyPrompt(preset.prompt)}
                              title="Copy prompt to clipboard"
                            >
                              Copy
                            </button>
                          </div>
                          <div className="mt-2 text-[10px] uppercase tracking-wide text-slate-500">
                            Updated {new Date(preset.updatedAt).toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>
                    {copyStatus && <div className="mt-2 text-[11px] text-slate-400">{copyStatus}</div>}
                  </div>
                ) : null}
              </div>
              <div className="flex flex-col rounded-xl border border-white/10 bg-white/5">
                <div className="border-b border-white/10 px-4 py-3">
                  <div className="text-sm font-semibold text-slate-200">Builder updates</div>
                  <div className="text-[11px] text-slate-400">
                    Streaming from {selected.jobId ? `job ${selected.jobId}` : "Essence runtime"}
                  </div>
                </div>
                <div className="flex flex-1 flex-col px-4 py-3">
                  <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {builderThread && builderThread.messages.length > 0 ? (
                      builderThread.messages.map((msg) => (
                        <div
                          key={msg.id}
                          className={clsx(
                            "rounded-lg px-3 py-2 text-xs",
                            msg.role === "assistant"
                              ? "bg-sky-500/20 text-sky-50"
                              : "bg-white/10 text-slate-50",
                          )}
                        >
                          <div className="text-[10px] uppercase tracking-wide text-slate-400">
                            {msg.role === "assistant" ? "Builder" : "You"}
                          </div>
                          <div className="mt-1 whitespace-pre-line text-[12px]">{msg.content}</div>
                        </div>
                      ))
                    ) : (
                      <div className="text-[12px] text-slate-400">No builder thoughts yet.</div>
                    )}
                  </div>
                  <div className="mt-3 rounded border border-white/10 bg-black/30 px-3 py-2 text-[11px] text-slate-400">
                    Chat is read-only for now. Approvals stream AGI plan, diff, and eval notes into this thread.
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center text-sm text-slate-400">
            No proposals available.
          </div>
        )}
      </section>
    </div>
  );
}

function StatusPill({ status }: { status: ProposalStatus }) {
  const palette: Record<ProposalStatus, string> = {
    new: "bg-slate-500/30 text-slate-100",
    submitted: "bg-cyan-500/20 text-cyan-100",
    screening: "bg-cyan-500/20 text-cyan-100",
    approved: "bg-blue-500/30 text-blue-100",
    accepted: "bg-emerald-500/25 text-emerald-100",
    accepted_rewarded: "bg-amber-400/25 text-amber-100",
    queued_for_graph_review: "bg-violet-500/25 text-violet-100",
    denied: "bg-rose-500/30 text-rose-100",
    rejected: "bg-rose-500/30 text-rose-100",
    building: "bg-amber-500/30 text-amber-100",
    applied: "bg-emerald-500/30 text-emerald-100",
    implemented: "bg-emerald-600/30 text-emerald-100",
    claimed: "bg-sky-500/30 text-sky-100",
    error: "bg-rose-700/30 text-rose-100",
  };
  return (
    <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold uppercase", palette[status])}>
      {status}
    </span>
  );
}

function SafetyPill({ status, score }: { status: EssenceProposal["safetyStatus"]; score?: number }) {
  const palette: Record<EssenceProposal["safetyStatus"], string> = {
    unknown: "bg-slate-500/20 text-slate-200",
    pending: "bg-amber-500/20 text-amber-100",
    "running-evals": "bg-sky-500/20 text-sky-100",
    passed: "bg-emerald-500/30 text-emerald-100",
    failed: "bg-rose-600/30 text-rose-100",
  };
  return (
    <span className={clsx("rounded-full px-3 py-1 text-xs font-semibold uppercase", palette[status])}>
      {status} {typeof score === "number" ? `· ${formatScore(score)}` : null}
    </span>
  );
}

function TargetDetails({ proposal }: { proposal: EssenceProposal }) {
  if (proposal.target.type === "panel-seed") {
    return (
      <div className="text-sm text-slate-200">
        <div className="text-[11px] uppercase text-slate-500">Component</div>
        <div className="mt-1 font-mono text-xs text-white">{proposal.target.componentPath}</div>
        {Array.isArray(proposal.metadata?.dataSources) && proposal.metadata?.dataSources?.length > 0 && (
          <div className="mt-3">
            <div className="text-[11px] uppercase text-slate-500">Data sources</div>
            <ul className="mt-1 list-outside list-disc pl-4 text-xs text-slate-300">
              {(proposal.metadata?.dataSources as string[]).map((src) => (
                <li key={src}>{src}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }
  if (proposal.target.type === "backend-file") {
    return (
      <div>
        <div className="text-[11px] uppercase text-slate-500">File</div>
        <div className="mt-1 font-mono text-xs text-white">{proposal.target.path}</div>
      </div>
    );
  }
  if (proposal.target.type === "backend-multi") {
    return (
      <div>
        <div className="text-[11px] uppercase text-slate-500">Files</div>
        <ul className="mt-1 list-outside list-disc pl-4 text-xs text-slate-300">
          {proposal.target.paths.map((path) => (
            <li key={path}>{path}</li>
          ))}
        </ul>
      </div>
    );
  }
  if (proposal.target.type === "environment") {
    const template = proposal.metadata?.proposalTemplate as
      | {
          changes?: {
            openPanels?: Array<{ id: string; layout?: string }>;
            pinFiles?: string[];
            consoleTabs?: string[];
            setEnv?: Record<string, string | number | boolean>;
          };
        }
      | undefined;
    const profile = proposal.metadata?.phaseProfile as TPhaseProfile | undefined;
    const envEntries = template?.changes?.setEnv ? Object.entries(template.changes.setEnv) : [];
    return (
      <div className="space-y-3 text-sm text-slate-200">
        <div>
          <div className="text-[11px] uppercase text-slate-500">Scope</div>
          <div className="mt-1 font-semibold capitalize text-white">{proposal.target.scope.replace("-", " ")}</div>
        </div>
        {profile && (
          <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs text-slate-300">
            <div className="flex justify-between text-[11px] uppercase text-slate-500">
              <span>Phase</span>
              <span>{(profile.score * 100).toFixed(1)}%</span>
            </div>
            <div className="mt-1 font-semibold text-slate-100">{profile.id}</div>
            {profile.rationale && <div className="mt-1 text-slate-400">{profile.rationale}</div>}
          </div>
        )}
        {template?.changes?.openPanels?.length ? (
          <div>
            <div className="text-[11px] uppercase text-slate-500">Panels</div>
            <ul className="mt-1 list-outside list-disc pl-4 text-xs text-slate-300">
              {template.changes.openPanels.map((panel) => (
                <li key={panel.id}>
                  {panel.id}
                  {panel.layout ? <span className="text-slate-500"> · {panel.layout}</span> : null}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {template?.changes?.pinFiles?.length ? (
          <div>
            <div className="text-[11px] uppercase text-slate-500">Pinned files</div>
            <ul className="mt-1 list-outside list-disc pl-4 text-xs text-slate-300">
              {template.changes.pinFiles.map((file) => (
                <li key={file}>{file}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {template?.changes?.consoleTabs?.length ? (
          <div>
            <div className="text-[11px] uppercase text-slate-500">Console tabs</div>
            <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-300">
              {template.changes.consoleTabs.map((tab) => (
                <span key={tab} className="rounded-full bg-black/40 px-2 py-0.5">
                  {tab}
                </span>
              ))}
            </div>
          </div>
        ) : null}
        {envEntries.length ? (
          <div>
            <div className="text-[11px] uppercase text-slate-500">Env hints</div>
            <dl className="mt-1 grid grid-cols-1 gap-2 text-xs text-slate-300 sm:grid-cols-2">
              {envEntries.map(([key, value]) => (
                <div key={key} className="rounded border border-white/10 bg-black/30 p-2">
                  <dt className="text-[10px] uppercase text-slate-500">{key}</dt>
                  <dd className="mt-1 font-mono text-[11px] text-white">{String(value)}</dd>
                </div>
              ))}
            </dl>
          </div>
        ) : null}
      </div>
    );
  }
  if (proposal.target.type === "postulate-board") {
    const meta = proposal.metadata?.postulate as Record<string, unknown> | undefined;
    const locatorRefs = Array.isArray(meta?.badgeGraphLocatorRefs)
      ? meta.badgeGraphLocatorRefs.map(String)
      : proposal.target.badgeGraphLocatorRefs;
    return (
      <div className="space-y-3 text-sm text-slate-200">
        <div>
          <div className="text-[11px] uppercase text-slate-500">Board</div>
          <div className="mt-1 font-semibold text-white">{proposal.target.boardId}</div>
        </div>
        <div>
          <div className="text-[11px] uppercase text-slate-500">Domain</div>
          <div className="mt-1 text-white">{proposal.target.domain}</div>
        </div>
        {locatorRefs.length ? (
          <div>
            <div className="text-[11px] uppercase text-slate-500">Badge graph locators</div>
            <ul className="mt-1 list-outside list-disc pl-4 text-xs text-slate-300">
              {locatorRefs.map((ref) => (
                <li key={ref}>{ref}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }
  return (
    <div>
      <div className="text-[11px] uppercase text-slate-500">Target</div>
      <div className="mt-1 text-sm text-slate-200">{proposal.target.type}</div>
    </div>
  );
}
