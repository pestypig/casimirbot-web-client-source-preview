import { useEffect, useState } from "react";

type PendingReview = Readonly<{
  schema: "casimirbot.capped_meter_delivery_review.v1";
  test_mode: true;
  state: "pending";
  request_id: string;
  units_minor: number;
}>;

/** One owner-reviewed sandbox meter event. An uncertain processor result must
 * be reconciled, never submitted a second time from this control. */
export function CappedMembershipMeterSandboxDelivery({ onDelivered }: Readonly<{
  onDelivered?: () => void | Promise<void>;
}>) {
  const [review, setReview] = useState<PendingReview | null>(null);
  const [approved, setApproved] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/capped-membership/meter/dispatch-one/status", {
      cache: "no-store", credentials: "same-origin",
      signal: controller.signal,
    }).then(async response => response.ok ? response.json() : null)
      .then(value => {
        if (!controller.signal.aborted && value?.schema ===
            "casimirbot.capped_meter_delivery_review.v1" &&
            value.test_mode === true && value.state === "pending" &&
            typeof value.request_id === "string" &&
            /^capped:[A-Za-z0-9:_-]{8,92}$/u.test(value.request_id) &&
            Number.isSafeInteger(value.units_minor) &&
            value.units_minor > 0)
          setReview(value);
      }).catch(() => undefined);
    return () => controller.abort();
  }, []);
  if (!review) return null;

  const send = async () => {
    if (!approved || attempted) return;
    setAttempted(true);
    setMessage("Sending the reviewed sandbox usage event…");
    try {
      const response = await fetch("/api/capped-membership/meter/dispatch-one", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm_pending_meter_delivery: true,
          expected_request_id: review.request_id,
          expected_units_minor: review.units_minor }),
      });
      const result = await response.json();
      if (!response.ok || result?.schema !==
          "casimirbot.capped_meter_delivery_test.v1" ||
          result.state !== "accepted" ||
          result.request_id !== review.request_id)
        throw new Error("unconfirmed");
      setMessage("Stripe Sandbox accepted this exact usage event. Refresh the membership ledger and compare the Stripe meter total.");
      try { await onDelivered?.(); }
      catch { setMessage("Stripe Sandbox accepted this exact usage event. Refresh the membership ledger manually before continuing."); }
    } catch {
      setMessage("Stripe acceptance could not be confirmed. Do not resend this event; check the processor and CasimirBot ledger first.");
    }
  };
  return <section className="mt-4 rounded-xl border border-amber-200/25 bg-amber-200/5 p-4"
    aria-label="Private sandbox usage delivery">
    <h3 className="font-semibold text-amber-100">Private Stripe Sandbox usage review</h3>
    <p className="mt-1 text-sm text-slate-200">
      One pending metered charge of ${(review.units_minor / 100).toFixed(2)} USD
      is ready for the sandbox subscription. Event: <code>{review.request_id}</code>.
      This sends only this exact usage event to Stripe Sandbox; it makes no provider call.
    </p>
    <label className="mt-3 flex items-start gap-2 text-sm text-slate-200">
      <input type="checkbox" checked={approved} disabled={attempted}
        onChange={event => setApproved(event.target.checked)} />
      I approve sending this exact test usage event to Stripe Sandbox.
    </label>
    <button type="button" disabled={!approved || attempted}
      onClick={() => void send()}
      className="mt-3 rounded-full border border-amber-200/40 px-4 py-2 text-sm text-amber-100 disabled:opacity-50">
      Send one reviewed sandbox event
    </button>
    {message ? <p role="status" className="mt-2 text-sm text-slate-200">{message}</p> : null}
  </section>;
}
