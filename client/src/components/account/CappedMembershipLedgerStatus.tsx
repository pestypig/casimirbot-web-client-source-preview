import { useEffect, useRef, useState, type FormEvent } from "react";

const CAP_DISCLOSURE_REVISION = "capped-cap-increase-v1";
const CAP_REDUCTION_DISCLOSURE_REVISION = "capped-cap-reduction-v1";

export type CappedMembershipLedgerStatusResponse = Readonly<{
  schema: "casimirbot.capped_membership_status.v1";
  state: "active";
  period_id: string;
  currency: string;
  period_ends_at: string;
  base_minor: number;
  cap_minor: number;
  maximum_cap_minor: number;
  accrued_overage_minor: number;
  reserved_minor: number;
  remaining_cap_minor: number;
  meter_delivery_state?: "clear" | "pending" | "unconfirmed";
  included_provider_remaining_micros_usd: number;
  settled_provider_micros_usd: number;
  reserved_provider_micros_usd: number;
}>;

const minor = (value: number, currency: string): string => {
  const formatter = new Intl.NumberFormat("en-US", {
    style: "currency", currency,
  });
  const digits = formatter.resolvedOptions().maximumFractionDigits ?? 2;
  return formatter.format(value / (10 ** digits));
};

const currencyDigits = (currency: string): number =>
  new Intl.NumberFormat("en-US", { style: "currency", currency })
    .resolvedOptions().maximumFractionDigits ?? 2;

export const capAmountToMinor = (value: string, currency: string): number | null => {
  const digits = currencyDigits(currency);
  const pattern = digits === 0 ? /^\d+$/u :
    new RegExp(`^\\d+(?:\\.\\d{1,${digits}})?$`, "u");
  if (!pattern.test(value)) return null;
  const [whole, fraction = ""] = value.split(".");
  const amount = Number(whole) * (10 ** digits) +
    Number(fraction.padEnd(digits, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
};

const minorToInput = (amount: number, currency: string): string => {
  const digits = currencyDigits(currency);
  const scale = 10 ** digits;
  const whole = Math.floor(amount / scale);
  return digits === 0 ? String(whole) :
    `${whole}.${String(amount % scale).padStart(digits, "0")}`;
};

const includedUsd = (micros: number): string =>
  `$${(micros / 1_000_000).toFixed(micros % 10_000 === 0 ? 2 : 6)}`;

export const paidPeriodEndUtc = (value: string): string =>
  `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;

export const cappedMembershipSandboxSummary = (
  status: CappedMembershipLedgerStatusResponse,
): string => [
  "CasimirBot capped membership — Stripe Sandbox summary",
  "This is a test subscription; no real payment is made.",
  "This is a current account snapshot, not a purchase receipt or proof that an email notice was delivered.",
  `Monthly base (tax included): ${minor(status.base_minor, status.currency)}`,
  `Authorized total cap for this paid period (tax included): ${minor(status.cap_minor, status.currency)}`,
  "Included provider cost: up to $1 USD per paid month.",
  `Included provider cost remaining: ${includedUsd(status.included_provider_remaining_micros_usd)} USD`,
  "Eligible use after the included amount: twice measured provider cost, within the authorized total cap.",
  `Additional charges accrued: ${minor(status.accrued_overage_minor, status.currency)}`,
  `Reserved against cap: ${minor(status.reserved_minor, status.currency)}`,
  `Additional cap remaining: ${minor(status.remaining_cap_minor, status.currency)}`,
  `Current paid period ends: ${paidPeriodEndUtc(status.period_ends_at)}`,
  "The subscription renews monthly until canceled. A new paid month starts with the $5 total cap; a higher cap authorized for this month does not carry forward.",
  "To review cancellation, sign in at https://casimirbot.com/account and choose Review cancellation in Stripe. Stripe shows the effective date before you confirm. Usage already incurred may appear on a later invoice.",
  "For membership billing or access help, email danylejbruce@gmail.com.",
].join("\n");

export const validCappedMembershipLedgerStatus = (
  value: unknown,
): value is CappedMembershipLedgerStatusResponse => {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return false;
  const status = value as Record<string, unknown>;
  const minorFields = ["base_minor", "cap_minor", "maximum_cap_minor",
    "accrued_overage_minor", "reserved_minor", "remaining_cap_minor",
    "included_provider_remaining_micros_usd",
    "settled_provider_micros_usd", "reserved_provider_micros_usd"];
  const committedMinor = Number(status.base_minor) +
    Number(status.accrued_overage_minor) + Number(status.reserved_minor);
  return status.schema === "casimirbot.capped_membership_status.v1" &&
    status.state === "active" &&
    typeof status.period_id === "string" &&
    typeof status.period_ends_at === "string" &&
    Number.isFinite(Date.parse(status.period_ends_at)) &&
    typeof status.currency === "string" &&
    /^[A-Z]{3}$/u.test(status.currency) &&
    (() => { try { minor(0, status.currency as string); return true; }
      catch { return false; } })() &&
    minorFields.every(field => Number.isSafeInteger(status[field]) &&
      (status[field] as number) >= 0) &&
    (status.meter_delivery_state === undefined ||
      status.meter_delivery_state === "clear" ||
      status.meter_delivery_state === "pending" ||
      status.meter_delivery_state === "unconfirmed") &&
    (status.base_minor as number) <= (status.cap_minor as number) &&
    (status.cap_minor as number) <= (status.maximum_cap_minor as number) &&
    Number.isSafeInteger((status.settled_provider_micros_usd as number) +
      (status.reserved_provider_micros_usd as number)) &&
    Number.isSafeInteger(committedMinor) &&
    committedMinor <= (status.cap_minor as number) &&
    (status.remaining_cap_minor as number) ===
      (status.cap_minor as number) - committedMinor;
};

type LedgerProps = Readonly<{
  status: CappedMembershipLedgerStatusResponse;
  onUpdated?: () => Promise<void>;
}>;

export function CappedMembershipLedgerStatus(props: LedgerProps) {
  // A paid period owns its draft, consent and operation receipts. Replacing it
  // must not reuse an accepted amount or display an older period's late reply.
  return <CappedMembershipLedgerPeriod key={props.status.period_id} {...props} />;
}

function CappedMembershipLedgerPeriod({ status, onUpdated }: LedgerProps) {
  const currency = status.currency;
  const [target, setTarget] = useState(() => minorToInput(status.cap_minor, currency));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const decreaseRequest = useRef<{
    periodId: string; expectedCapMinor: number; nextCapMinor: number;
    requestId: string;
  } | null>(null);
  const [increaseTarget, setIncreaseTarget] = useState(() =>
    minorToInput(status.cap_minor, currency));
  const [increaseAccepted, setIncreaseAccepted] = useState(false);
  const [increaseBusy, setIncreaseBusy] = useState(false);
  const [increaseError, setIncreaseError] = useState<string | null>(null);
  const [increaseSaved, setIncreaseSaved] = useState(false);
  const increaseRequest = useRef<{
    periodId: string; expectedCapMinor: number; nextCapMinor: number;
    requestId: string;
  } | null>(null);
  useEffect(() => {
    setTarget(minorToInput(status.cap_minor, currency));
    decreaseRequest.current = null;
    setIncreaseTarget(minorToInput(status.cap_minor, currency));
    setIncreaseAccepted(false);
    increaseRequest.current = null;
  }, [status.cap_minor, currency]);
  const floor = status.base_minor + status.accrued_overage_minor;
  const parsed = capAmountToMinor(target.trim(), currency);
  const canLower = status.cap_minor > floor;
  const validReduction = parsed !== null && parsed >= floor &&
    parsed < status.cap_minor;
  const parsedIncrease = capAmountToMinor(increaseTarget.trim(), currency);
  const validIncrease = parsedIncrease !== null &&
    parsedIncrease > status.cap_minor &&
    parsedIncrease <= status.maximum_cap_minor;
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validReduction || busy) return;
    setBusy(true); setError(null); setSaved(false);
    try {
      const pending = decreaseRequest.current;
      const requestId = pending && pending.periodId === status.period_id &&
        pending.expectedCapMinor === status.cap_minor &&
        pending.nextCapMinor === parsed
        ? pending.requestId : `capped:cap-lower-${crypto.randomUUID()}`;
      decreaseRequest.current = { periodId: status.period_id,
        expectedCapMinor: status.cap_minor, nextCapMinor: parsed,
        requestId };
      const response = await fetch("/api/capped-membership/cap", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          period_id: status.period_id,
          request_id: requestId,
          expected_cap_minor: status.cap_minor,
          next_cap_minor: parsed,
          accepted_disclosure_revision: CAP_REDUCTION_DISCLOSURE_REVISION,
        }),
      });
      if (!response.ok) {
        setError(response.status === 409
          ? "The cap or accrued charges changed. Refresh usage and choose a new limit."
          : "The cap change could not be confirmed. Refresh usage to check its current state before another decision.");
        return;
      }
      const result = await response.json() as { cap_minor?: number };
      if (result.cap_minor !== parsed) {
        setError("The cap could not be verified. Refresh usage before continuing.");
        return;
      }
      setSaved(true);
      try { await onUpdated?.(); }
      catch { setError("The cap change was confirmed. Refresh usage to view the updated ledger."); }
    } catch {
      setError("The cap change could not be confirmed. Refresh usage to check its current state before another decision.");
    } finally { setBusy(false); }
  };
  const submitIncrease = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!validIncrease || !increaseAccepted || increaseBusy) return;
    setIncreaseBusy(true); setIncreaseError(null); setIncreaseSaved(false);
    try {
      const pending = increaseRequest.current;
      const requestId = pending && pending.periodId === status.period_id &&
        pending.expectedCapMinor === status.cap_minor &&
        pending.nextCapMinor === parsedIncrease
        ? pending.requestId : `capped:cap-raise-${crypto.randomUUID()}`;
      increaseRequest.current = { periodId: status.period_id,
        expectedCapMinor: status.cap_minor, nextCapMinor: parsedIncrease,
        requestId };
      const response = await fetch("/api/capped-membership/cap", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({
          period_id: status.period_id,
          request_id: requestId,
          expected_cap_minor: status.cap_minor,
          next_cap_minor: parsedIncrease,
          accepted_disclosure_revision: CAP_DISCLOSURE_REVISION,
        }),
      });
      if (!response.ok) {
        setIncreaseError(response.status === 409
          ? "The cap or paid period changed. Refresh usage and review a new limit."
          : response.status === 403 || response.status === 404
            ? "The paid Managed Payments subscription could not be verified. Your cap is unchanged."
            : "The higher cap could not be confirmed. Refresh usage to check its current state before another decision.");
        return;
      }
      const result = await response.json() as { cap_minor?: number };
      if (result.cap_minor !== parsedIncrease) {
        setIncreaseError("The new cap could not be verified. Refresh usage before continuing.");
        return;
      }
      setIncreaseSaved(true);
      try { await onUpdated?.(); }
      catch { setIncreaseError("The cap change was confirmed. Refresh usage to view the updated ledger."); }
    } catch {
      setIncreaseError("The higher cap could not be confirmed. Refresh usage to check its current state before another decision.");
    } finally { setIncreaseBusy(false); }
  };
  return <div className="mt-5 rounded-2xl border border-cyan-200/25 bg-cyan-200/5 p-4 text-sm text-slate-200"
    aria-label="Capped membership usage">
    <h3 className="font-semibold text-white">Capped membership · active</h3>
    <p className="mt-2">Monthly base: {minor(status.base_minor, currency)} ·
      total monthly cap: {minor(status.cap_minor, currency)}</p>
    <p className="mt-1">Included provider cost remaining: {includedUsd(
      status.included_provider_remaining_micros_usd)} USD.</p>
    <p className="mt-1">Additional charges accrued: {minor(
      status.accrued_overage_minor, currency)} · reserved against cap: {minor(
      status.reserved_minor, currency)} · additional cap remaining: {minor(
      status.remaining_cap_minor, currency)}.</p>
    {status.meter_delivery_state === "pending" ?
      <p className="mt-2 text-amber-100" role="status">New managed requests are paused while a usage charge is being delivered to Stripe. Your existing charges and cap remain visible.</p> : null}
    {status.meter_delivery_state === "unconfirmed" ?
      <p className="mt-2 text-amber-100" role="status">New managed requests are paused because Stripe has not confirmed a usage charge. CasimirBot must reconcile it before managed use resumes.</p> : null}
    <p className="mt-1 text-slate-300">After the included provider allowance,
      eligible managed use is charged at twice measured provider cost.
      Provider work stops when its maximum reservation will not fit.</p>
    <p className="mt-2 text-slate-300">This test membership renews monthly until canceled. Review cancellation from Account through Stripe before the next renewal; Stripe shows its effective date. The next paid month starts with a $5 total cap unless you authorize a higher limit for that month.</p>
    <a className="mt-2 inline-block underline underline-offset-4"
      href={`data:text/plain;charset=utf-8,${encodeURIComponent(
        cappedMembershipSandboxSummary(status))}`}
      download="casimirbot-sandbox-membership-summary.txt">
      Download current test membership summary
    </a>
    <p className="mt-1 text-slate-400">Estimated managed voice time is unavailable
      until a provider model and enforceable voice rate are qualified.</p>
    {canLower ? <form className="mt-4 space-y-2" onSubmit={submit}>
      <label className="block font-medium text-white" htmlFor="capped-membership-lower-cap">
        Lower this period’s total cap ({currency})
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input id="capped-membership-lower-cap" type="text" inputMode="decimal"
          value={target} onChange={event => {
            setTarget(event.target.value); setSaved(false);
            decreaseRequest.current = null;
          }}
          className="w-32 rounded-lg border border-slate-500 bg-slate-900 px-3 py-2 text-white"
          aria-describedby="capped-membership-cap-help" />
        <button type="submit" disabled={!validReduction || busy}
          className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
          {busy ? "Saving…" : "Lower cap"}
        </button>
      </div>
      <p id="capped-membership-cap-help" className="text-xs text-slate-300">
        Minimum now: {minor(floor, currency)}. A lower cap stops new managed work
        immediately when its maximum reservation will not fit. Already accrued
        charges remain due, and existing reservations may still settle.
      </p>
      {error ? <p role="alert" className="text-red-300">{error}</p> : null}
      {saved ? <p role="status" className="text-emerald-300">Cap lowered for this period.</p> : null}
    </form> : <p className="mt-3 text-xs text-slate-300">
      Your cap is at the lowest permitted amount for charges already accrued.
      Raising it requires a fresh review of the higher total charge limit.
    </p>}
    {status.cap_minor < status.maximum_cap_minor ?
      <form className="mt-4 space-y-2 border-t border-cyan-200/20 pt-4"
        onSubmit={submitIncrease}>
        <label className="block font-medium text-white"
          htmlFor="capped-membership-raise-cap">
          Set a higher total cap for this paid period ({currency})
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <input id="capped-membership-raise-cap" type="text" inputMode="decimal"
            value={increaseTarget} onChange={event => {
              setIncreaseTarget(event.target.value);
              setIncreaseAccepted(false); setIncreaseSaved(false);
              increaseRequest.current = null;
            }}
            className="w-32 rounded-lg border border-slate-500 bg-slate-900 px-3 py-2 text-white"
            aria-describedby="capped-membership-raise-help" />
          <span className="text-xs text-slate-300">
            Maximum: {minor(status.maximum_cap_minor, currency)}
          </span>
        </div>
        <p id="capped-membership-raise-help" className="text-xs text-slate-300">
          This authorizes more metered use under your existing Managed Payments
          subscription. The base fee and tax are included in this total cap.
          After the $1 provider allowance, managed use consumes the cap at
          twice measured provider cost.
        </p>
        {validIncrease ? <label className="flex items-start gap-2 text-xs text-white">
          <input type="checkbox" checked={increaseAccepted}
            onChange={event => setIncreaseAccepted(event.target.checked)} />
          <span>I authorize a total charge up to {minor(parsedIncrease, currency)}{" "}
            for this paid period, including the base fee, metered use, and tax.</span>
        </label> : null}
        <button type="submit" disabled={!validIncrease || !increaseAccepted || increaseBusy}
          className="rounded-lg bg-cyan-300 px-3 py-2 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">
          {increaseBusy ? "Authorizing…" : "Authorize higher cap"}
        </button>
        {increaseError ? <p role="alert" className="text-red-300">{increaseError}</p> : null}
        {increaseSaved ? <p role="status" className="text-emerald-300">
          Higher cap authorized for this period.</p> : null}
      </form> : null}
    <p className="mt-2 text-xs text-slate-400">Current paid period ends {paidPeriodEndUtc(
      status.period_ends_at)}.</p>
    <p className="mt-2 text-xs text-slate-400">For membership billing or access help, email{" "}
      <a href="mailto:danylejbruce@gmail.com" className="underline underline-offset-4">
        danylejbruce@gmail.com</a>.</p>
  </div>;
}
