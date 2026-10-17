import React, { useEffect, useState } from "react";
import type { HostedTermStatus } from "@shared/helix-hosted-budget";

/** Visible only in the coordinator's private local developer surface. */
export function LocalHostedSubscription() {
  const [term, setTerm] = useState<HostedTermStatus | null>(null);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  async function act(path: string, body?: unknown) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch(`/api/account/local-hosted/${path}`, {
        method: body === undefined ? "GET" : "POST", credentials: "same-origin",
        headers: body === undefined ? {} : { "Content-Type": "application/json", "x-casimir-local-action": "explicit" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "local_hosted_unavailable");
      setTerm(result.term ?? result);
      if (result.fixture) setMessage("Sandbox fixture recorded. No payment occurred.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "local_hosted_unavailable"); }
    finally { setBusy(false); }
  }
  useEffect(() => { void act("status"); }, []);
  return <section aria-label="Local hosted validation" className="space-y-3 rounded border p-4">
    <h3>Private local hosted validation</h3>
    <p>Personal tools stay free, including after hosted expiry. Program access still needs its owner's grant.</p>
    <p>Start a seven-day no-card local trial once per test identity: one room, one guest, one program, ten verified effects and finite resource limits. No automatic charge.</p>
    <p>The $60 monthly P50 offer is a validation candidate awaiting review. This screen creates no production subscription.</p>
    {term && <p>{term.reason} · {term.profile ?? "No term"} · {term.successfulEffects} verified effects · {term.unresolvedEffects} pending reconciliation{term.endsAt ? ` · Ends ${term.endsAt}` : ""}</p>}
    <div className="flex flex-wrap gap-2">
      <button disabled={busy || !!term?.termId} onClick={() => void act("trial", { acknowledgedLocalValidationLimits: true })}>Start local trial</button>
      <button disabled={busy} onClick={() => void act("status")}>Refresh</button>
      <button disabled={busy || !term?.eligible} onClick={() => void act("cancel", {})}>End local hosted eligibility</button>
      <button disabled={busy} onClick={() => void act("sandbox-event", {
        eventId: `evt_local_${crypto.randomUUID().replaceAll("-", "")}`, action: "activate", acknowledgedFixture: true,
      })}>Enroll sandbox P50 fixture</button>
    </div>
    <p role="status">{message}</p>
    {term && <a href="/local-reference-canvas.html">Open local room and canvas</a>}
  </section>;
}
