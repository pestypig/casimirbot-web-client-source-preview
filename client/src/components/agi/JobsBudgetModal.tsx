import React, { useEffect, useMemo, useState } from "react";
import { listJobs, getBudget, completeJob, proposeJob, listPanelProposals, type JobsListItem, type TokenBalance } from "@/lib/agi/jobs";
import type { DesktopPanelProposal } from "@shared/jobs";

export function JobsBudgetModal({ open, onClose, onInsertPrompt }: { open: boolean; onClose: () => void; onInsertPrompt?: (text: string) => void }) {
  const [jobs, setJobs] = useState<JobsListItem[]>([]);
  const [generatedAt, setGeneratedAt] = useState<number>(Date.now());
  const [budget, setBudget] = useState<TokenBalance | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({ title: "", description: "", kind: "code", priority: "medium" as "low" | "medium" | "high" });
  const [proposeBusy, setProposeBusy] = useState(false);
  const [proposeMsg, setProposeMsg] = useState<string | null>(null);
  const [panelProposals, setPanelProposals] = useState<DesktopPanelProposal[]>([]);
  const [proposalScanAt, setProposalScanAt] = useState<number | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    let canceled = false;
    setBusy(true);
    setProposalError(null);
    Promise.all([listJobs(), getBudget()])
      .then(([jobRes, budgetRes]) => {
        if (canceled) return;
        setJobs(jobRes.jobs);
        setGeneratedAt(jobRes.generatedAt);
        setBudget(budgetRes);
      })
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setBusy(false));
    listPanelProposals()
      .then((res) => {
        if (canceled) return;
        setPanelProposals(res.proposals);
        setProposalScanAt(res.generatedAt);
      })
      .catch((err) => {
        if (canceled) return;
        setProposalError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      canceled = true;
    };
  }, [open]);

  const sorted = useMemo(() => {
    return jobs.slice().sort((a, b) => {
      const prio = (v: JobsListItem["priority"]) => (v === "high" ? 2 : v === "medium" ? 1 : 0);
      const da = prio(b.priority) - prio(a.priority);
      if (da !== 0) return da;
      return (b.rewardTokens || 0) - (a.rewardTokens || 0);
    });
  }, [jobs]);

  const adoptProposal = (proposal: DesktopPanelProposal) => {
    const lines = [
      proposal.summary,
      `Component: ${proposal.componentPath}`,
      `Suggested panel id: ${proposal.panelId}`,
    ];
    if (proposal.dataSources.length) {
      lines.push(`Data sources:\n${proposal.dataSources.map((src) => `- ${src}`).join("\n")}`);
    }
    setForm((current) => ({
      ...current,
      title: proposal.title,
      description: lines.join("\n\n"),
    }));
    setProposeMsg("Draft loaded from Essence proposal. Edit before submitting.");
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <div className="relative z-10 flex w-[920px] max-h-[85vh] flex-col overflow-y-auto rounded-xl border border-white/15 bg-[#0b1226] shadow-xl">
        <div className="flex items-center justify-between border-b border-white/10 px-5 py-3">
          <div className="flex flex-col">
            <span className="font-semibold">Budget & Daily Jobs</span>
            <span className="text-[11px] text-slate-400">Refreshed {new Date(generatedAt).toLocaleString()}</span>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="rounded-full border border-white/15 bg-black/40 px-3 py-1 text-white">
              Balance: <span className="font-semibold">{budget?.balance ?? 0}</span> tok
            </span>
            <button className="underline opacity-80 hover:opacity-100" onClick={onClose}>close</button>
          </div>
        </div>
        {error && <div className="px-5 py-2 text-xs text-rose-300">{error}</div>}
        <div className="grid grid-cols-3 gap-4 p-5">
          <div className="col-span-2 space-y-3 overflow-auto pr-2" style={{ maxHeight: "60vh" }}>
            {busy && <div className="text-sm text-slate-400">Loading...</div>}
            {!busy && sorted.length === 0 && <div className="text-sm text-slate-400">No jobs found.</div>}
            {sorted.map((job) => (
              <JobCard key={job.id} job={job} onInsertPrompt={onInsertPrompt} onCompleted={async () => {
                try {
                  setBusy(true);
                  const res = await completeJob(job.id);
                  setBudget(res.balance);
                } catch (err) {
                  setError(err instanceof Error ? err.message : String(err));
                } finally {
                  setBusy(false);
                }
              }} />
            ))}
          </div>
          <div className="col-span-1 space-y-3">
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <div className="font-semibold mb-1">How this works</div>
              <ol className="list-decimal pl-4 space-y-1">
                <li>Pick a job from today’s list.</li>
                <li>Click “Open in console” to prefill a prompt.</li>
                <li>Solve it; when done, click “Mark completed”.</li>
                <li>Earn token rewards to increase your budget.</li>
              </ol>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs space-y-2">
              <div className="font-semibold">Propose a job</div>
              <input
                className="w-full rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
                placeholder="Short title"
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
              />
              <textarea
                className="w-full min-h-[96px] rounded border border-white/10 bg-black/30 px-2 py-1 text-sm text-white focus:border-sky-500 focus:outline-none"
                placeholder="Describe the problem or task. Include file paths if relevant."
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              />
              <div className="flex items-center gap-2">
                <label>Kind</label>
                <select className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs" value={form.kind}
                  onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value }))}>
                  <option value="code">code</option>
                  <option value="research">research</option>
                  <option value="agi">agi</option>
                  <option value="ops">ops</option>
                </select>
                <label>Priority</label>
                <select className="rounded border border-white/10 bg-black/30 px-2 py-1 text-xs" value={form.priority}
                  onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value as any }))}>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <button
                  className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-emerald-100 hover:bg-emerald-500/30"
                  disabled={proposeBusy || form.title.trim().length < 6 || form.description.trim().length < 20}
                  onClick={async () => {
                    setProposeBusy(true);
                    setProposeMsg(null);
                    try {
                      const resp = await proposeJob({ title: form.title.trim(), description: form.description.trim(), kind: form.kind as any, priority: form.priority });
                      if (resp?.ok && resp.job) {
                        // refresh list
                        setJobs((items) => [resp.job!, ...items]);
                        setProposeMsg(resp.agreed ? "Posted (agreed)" : "Posted (awaiting review)");
                        setForm({ title: "", description: "", kind: form.kind, priority: form.priority });
                      } else {
                        setProposeMsg(resp?.message || "Unable to post");
                      }
                    } catch (err) {
                      setProposeMsg(err instanceof Error ? err.message : String(err));
                    } finally {
                      setProposeBusy(false);
                    }
                  }}
                >
                  {proposeBusy ? "Submitting..." : "Propose job"}
                </button>
                {proposeMsg && <span className="text-[11px] text-slate-300">{proposeMsg}</span>}
              </div>
            </div>
            <div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-semibold">Essence proposals</div>
                  <div className="text-[11px] text-slate-300">New repo-to-UI parallels spotted today.</div>
                </div>
                {proposalScanAt && (
                  <span className="text-[10px] text-slate-400 whitespace-nowrap">Scan {new Date(proposalScanAt).toLocaleTimeString()}</span>
                )}
              </div>
              {proposalError && <div className="mt-2 text-[11px] text-rose-300">{proposalError}</div>}
              {!proposalError && (
                <div className="mt-2 space-y-2 max-h-[26vh] overflow-auto pr-1">
                  {panelProposals.length === 0 ? (
                    <div className="text-[11px] text-slate-400">Essence is still searching for unused panels.</div>
                  ) : (
                    panelProposals.map((proposal) => (
                      <ProposalCard key={proposal.id} proposal={proposal} onAdopt={() => adoptProposal(proposal)} />
                    ))
                  )}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs">
              <div className="font-semibold mb-1">Daily refill</div>
              <div>Base tokens per day: {budget?.dailyBase ?? 0}</div>
              <div>
                Next reset: {budget?.nextResetAt ? new Date(budget.nextResetAt).toLocaleString() : "—"}
              </div>
            </div>
            <div className="rounded-lg border border-white/10 bg-black/30 p-3 text-xs max-h-[28vh] overflow-auto">
              <div className="font-semibold mb-1">Ledger</div>
              {budget?.ledger && budget.ledger.length > 0 ? (
                <div className="space-y-1">
                  {budget.ledger.slice().reverse().map((e) => (
                    <div key={e.id} className="flex items-center justify-between">
                      <div className="truncate" title={e.reason}>{e.reason}</div>
                      <div className={e.delta >= 0 ? "text-emerald-300" : "text-rose-300"}>{e.delta >= 0 ? "+" : ""}{e.delta}</div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-slate-400">No activity yet.</div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ProposalCard({ proposal, onAdopt }: { proposal: DesktopPanelProposal; onAdopt: () => void }) {
  return (
    <div className="rounded-md border border-sky-400/30 bg-sky-500/10 px-2 py-2 text-[11px] text-slate-100">
      <div className="flex items-start justify-between gap-2">
        <div className="font-semibold text-xs text-white">{proposal.title}</div>
        <button className="rounded border border-sky-400/40 bg-sky-600/20 px-2 py-0.5 text-[10px] text-sky-100 hover:bg-sky-600/40" onClick={onAdopt}>
          Adopt
        </button>
      </div>
      <div className="mt-1 text-[11px] text-slate-200">{proposal.summary}</div>
      <div className="mt-1 flex flex-wrap gap-1 text-[10px]">
        <span className="rounded bg-sky-400/20 px-2 py-0.5 text-sky-100">#{proposal.panelId}</span>
        <span className="rounded bg-white/10 px-2 py-0.5 text-slate-200" title={proposal.componentPath}>{proposal.componentPath}</span>
        {proposal.dataSources.map((src) => (
          <span key={src} className="rounded bg-emerald-500/15 px-2 py-0.5 text-emerald-100" title={src}>
            {src}
          </span>
        ))}
      </div>
    </div>
  );
}

function JobCard({ job, onInsertPrompt, onCompleted }: { job: JobsListItem; onInsertPrompt?: (text: string) => void; onCompleted: () => void }) {
  const badge = job.priority === "high" ? "bg-rose-500/20 text-rose-200 border-rose-400/30" : job.priority === "medium" ? "bg-amber-500/20 text-amber-100 border-amber-400/30" : "bg-white/5 text-slate-200 border-white/10";
  const prompt = `Help me tackle this job from the daily queue.\n\nTitle: ${job.title}\nKind: ${job.kind}\nPriority: ${job.priority}\nSource: ${job.source}\nPaths: ${job.paths.join(", ")}\nReward: ${job.rewardTokens} tokens\n\nInstructions:\n- Summarize the problem and propose a minimal plan.\n- Link to relevant files.\n- Suggest validation steps or tests.\n- After you propose, wait for my approval.`;
  return (
    <div className="rounded-lg border border-white/10 bg-black/30 p-3">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white truncate pr-3" title={job.title}>{job.title}</div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className={`rounded-full border px-2 py-0.5 ${badge}`}>{job.priority}</span>
          <span className="rounded-full border border-white/15 bg-white/5 px-2 py-0.5 text-slate-300">+{job.rewardTokens} tok</span>
        </div>
      </div>
      {job.description && <div className="mt-2 text-xs text-slate-200 whitespace-pre-wrap">{job.description}</div>}
      <div className="mt-2 flex flex-wrap gap-1">
        {job.tags?.map((t) => (
          <span key={t} className="rounded bg-white/10 px-2 py-0.5 text-[11px]">{t}</span>
        ))}
        {job.paths?.slice(0, 4).map((p) => (
          <span key={p} className="rounded bg-sky-500/10 px-2 py-0.5 text-[11px] text-sky-200" title={p}>{p}</span>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-3 text-xs">
        {onInsertPrompt && (
          <button className="rounded-md border border-sky-400/40 bg-sky-500/20 px-3 py-1 text-sky-100 hover:bg-sky-500/30" onClick={() => onInsertPrompt(prompt)}>
            Open in console
          </button>
        )}
        <button className="rounded-md border border-emerald-400/40 bg-emerald-500/20 px-3 py-1 text-emerald-100 hover:bg-emerald-500/30" onClick={onCompleted}>
          Mark completed
        </button>
      </div>
    </div>
  );
}
