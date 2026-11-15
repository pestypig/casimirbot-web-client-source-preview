import { useEffect, useState } from "react";

type ProbeStatus = Readonly<{
  schema: "casimirbot.capped_agent_probe_status.v1";
  test_mode: true;
  model: "gpt-6-luna";
  tools: 0;
  maximum_output_tokens: 64;
}>;

/** Fixed-prompt, no-tool owner qualification; no agent action is exposed. */
export function CappedMembershipAgentProbe({ onSettled }: Readonly<{
  onSettled?: () => void | Promise<void>;
}>) {
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [approved, setApproved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/capped-membership/agent/probe/status", {
      cache: "no-store", credentials: "same-origin",
      signal: controller.signal,
    }).then(async response => response.ok ? response.json() : null)
      .then(value => {
        if (!controller.signal.aborted && value?.schema ===
            "casimirbot.capped_agent_probe_status.v1" &&
            value.test_mode === true && value.model === "gpt-6-luna" &&
            value.tools === 0 && value.maximum_output_tokens === 64)
          setStatus(value);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!status) return null;

  const run = async () => {
    if (!approved || attempted) return;
    setAttempted(true);
    setMessage("Running one bounded Responses check…");
    try {
      const response = await fetch("/api/capped-membership/agent/probe", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_bounded_agent_probe: true,
          request_id: `capped:agent-probe-${crypto.randomUUID()}` }),
      });
      const result = await response.json();
      if (!response.ok || result?.schema !==
          "casimirbot.capped_agent_probe.v1" || result?.state !== "settled" ||
          result?.answer_matches_probe !== true)
        throw new Error("unconfirmed");
      setMessage("The no-tool Responses check settled with a provider usage receipt. Check the updated membership ledger below.");
      try { await onSettled?.(); }
      catch { setMessage("The Responses check settled; refresh the membership ledger manually before continuing."); }
    } catch {
      setMessage("The provider result could not be confirmed. Do not repeat this check before reviewing the membership ledger and recovery state.");
    }
  };

  return <section className="mt-4 rounded-xl border border-cyan-200/25 bg-cyan-200/5 p-4"
    aria-label="Private managed Responses billing check">
    <h3 className="font-semibold text-cyan-100">Private managed Responses billing check</h3>
    <p className="mt-1 text-sm text-slate-200">
      This Stripe sandbox check asks GPT-6 Luna one fixed question with at most 64 output tokens.
      It reserves a maximum against this paid period before calling OpenAI, then records the usage receipt.
      It cannot run a tool, control your program, or authorize a Codex task.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
      <input type="checkbox" checked={approved} disabled={attempted}
        onChange={event => setApproved(event.target.checked)} />
      I approve one bounded Responses sandbox call using my membership allowance.
    </label>
    <button type="button" disabled={!approved || attempted}
      onClick={() => void run()}
      className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-sm text-cyan-100 disabled:opacity-50">
      Run one Responses check
    </button>
    {message ? <p role="status" className="mt-2 text-sm text-slate-200">{message}</p> : null}
  </section>;
}
