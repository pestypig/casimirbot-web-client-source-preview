import { useEffect, useState } from "react";

type Status = Readonly<{
  schema: "casimirbot.capped_membership_management.v1";
  test_mode: true; cancellation_available: boolean;
  period_id: string | null;
  cancellation_scheduled?: boolean | null;
  cancellation_effective_at?: string | null;
}>;

const validStatus = (value: unknown, periodId: string): value is Status => {
  if (!value || typeof value !== "object") return false;
  const status = value as Partial<Status>;
  return status.schema === "casimirbot.capped_membership_management.v1" &&
    status.test_mode === true && status.cancellation_available === true &&
    status.period_id === periodId;
};

const validPortalUrl = (value: unknown): value is string => {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "billing.stripe.com" &&
      !url.username && !url.password;
  } catch { return false; }
};

export function CappedMembershipCancellation({ periodId }: Readonly<{
  periodId: string;
}>) {
  const [available, setAvailable] = useState(false);
  const [scheduledUntil, setScheduledUntil] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  useEffect(() => {
    let current = true;
    setAvailable(false);
    setScheduledUntil(null);
    void fetch("/api/capped-membership/management/status", {
      credentials: "same-origin", cache: "no-store",
    }).then(async response => response.ok ? response.json() : null)
      .then(value => {
        if (!current) return;
        const valid = validStatus(value, periodId);
        setAvailable(valid);
        if (valid && value.cancellation_scheduled === true &&
            typeof value.cancellation_effective_at === "string" &&
            Number.isFinite(Date.parse(value.cancellation_effective_at)))
          setScheduledUntil(value.cancellation_effective_at);
      })
      .catch(() => { if (current) setAvailable(false); });
    return () => { current = false; };
  }, [periodId]);
  if (!available) return null;
  const open = async (kind: "cancel" | "payment-method") => {
    if (busy) return;
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/capped-membership/management/${kind}`, {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ period_id: periodId,
          [kind === "cancel" ? "confirm_open_stripe_cancellation" :
            "confirm_open_stripe_payment_method"]: true }),
      });
      const value = response.ok ? await response.json() as
        { hosted_url?: unknown } : null;
      if (!validPortalUrl(value?.hosted_url)) throw new Error("unavailable");
      window.location.assign(value.hosted_url);
    } catch {
      setMessage("Stripe membership management could not open. Your membership was not changed; please try again.");
    } finally { setBusy(false); }
  };
  return <div className="mt-4 rounded-xl border border-white/15 p-4 text-sm text-slate-200">
    <p className="font-semibold text-white">Manage this test membership</p>
    {scheduledUntil ? <p role="status" className="mt-2">
      Stripe has scheduled this membership to end at{
        ` ${new Date(scheduledUntil).toLocaleString(undefined, {
          year: "numeric", month: "short", day: "numeric",
          hour: "numeric", minute: "2-digit", timeZoneName: "short",
        })}`}. The paid term
      remains usable until then, subject to its cap and account checks.
    </p> : null}
    <p className="mt-2">Open Stripe to review cancellation for this exact subscription and its effective date. Usage already incurred may appear on a later invoice. Opening the page does not cancel it.</p>
    <p className="mt-2">To change the renewal card, open Stripe, select this subscription, then choose its payment method. A change to your saved wallet card alone may not change the card charged for this subscription.</p>
    <button type="button" disabled={busy} onClick={() => void open("payment-method")}
      className="mt-3 rounded-full border border-white/30 px-4 py-2 disabled:opacity-50">
      Manage renewal card in Stripe
    </button>
    <button type="button" disabled={busy} onClick={() => void open("cancel")}
      className="mt-3 rounded-full border border-white/30 px-4 py-2 disabled:opacity-50">
      Review cancellation in Stripe
    </button>
    {message ? <p role="status" className="mt-2">{message}</p> : null}
  </div>;
}
