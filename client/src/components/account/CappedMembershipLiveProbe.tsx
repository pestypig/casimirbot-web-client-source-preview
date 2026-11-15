import { useEffect, useState } from "react";

type ProbeStatus = Readonly<{
  schema: "casimirbot.capped_live_probe_status.v1";
  test_mode: true;
  maximum_seconds: 10;
  reserved_provider_micros_usd: number;
}>;

/** Owner-only sandbox qualification. The server never returns its Live key,
 * provider session ID, or audio; a separate action is needed for media. */
export function CappedMembershipLiveProbe({ onSettled }: Readonly<{
  onSettled?: () => void | Promise<void>;
}>) {
  const [status, setStatus] = useState<ProbeStatus | null>(null);
  const [approved, setApproved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/capped-membership/live/probe/status", {
      cache: "no-store", credentials: "same-origin",
      signal: controller.signal,
    }).then(async response => response.ok ? response.json() : null)
      .then(value => {
        if (!controller.signal.aborted && value?.schema ===
            "casimirbot.capped_live_probe_status.v1" &&
            value.test_mode === true && value.maximum_seconds === 10 &&
            Number.isSafeInteger(value.reserved_provider_micros_usd))
          setStatus(value);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!status) return null;

  const run = async () => {
    if (!approved || attempted) return;
    setAttempted(true);
    setMessage("Running one silent provider check…");
    try {
      const response = await fetch("/api/capped-membership/live/probe", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_bounded_silent_probe: true,
          request_id: `capped:live-probe-${crypto.randomUUID()}` }),
      });
      const result = await response.json();
      if (!response.ok || result?.schema !==
          "casimirbot.capped_live_probe.v1" || result?.state !== "settled")
        throw new Error("unconfirmed");
      setMessage("The silent GPT Live session closed with a confirmed usage receipt. A silent session may report zero voice seconds and zero cost; this check does not qualify paid voice usage. Check the updated membership ledger below.");
      try { await onSettled?.(); }
      catch { setMessage("The silent GPT Live session closed with a confirmed usage receipt. A silent session may report zero voice seconds; refresh the membership ledger manually before continuing."); }
    } catch {
      setMessage("The provider result could not be confirmed. Do not repeat the probe before checking the membership ledger and recovery state.");
    }
  };

  return <section className="mt-4 rounded-xl border border-cyan-200/25 bg-cyan-200/5 p-4"
    aria-label="Private managed GPT Live session check">
    <h3 className="font-semibold text-cyan-100">Private managed GPT Live session check</h3>
    <p className="mt-1 text-sm text-slate-200">
      This Stripe sandbox check opens one silent GPT Live session for at most ten seconds.
      It reserves up to ${(Math.ceil(status.reserved_provider_micros_usd / 100) / 10_000).toFixed(4)}
      of provider cost against this paid period, then records the final provider receipt.
      It sends no microphone or Discord audio and grants no agent action. Silence may produce
      a zero-second, zero-cost receipt; paid voice accounting needs a separate consented audio test.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
      <input type="checkbox" checked={approved} disabled={attempted}
        onChange={event => setApproved(event.target.checked)} />
      I approve one bounded silent GPT Live sandbox call using my membership allowance.
    </label>
    <button type="button" disabled={!approved || attempted}
      onClick={() => void run()}
      className="mt-3 rounded-full border border-cyan-200/40 px-4 py-2 text-sm text-cyan-100 disabled:opacity-50">
      Run one silent GPT Live check
    </button>
    {message ? <p role="status" className="mt-2 text-sm text-slate-200">{message}</p> : null}
  </section>;
}
