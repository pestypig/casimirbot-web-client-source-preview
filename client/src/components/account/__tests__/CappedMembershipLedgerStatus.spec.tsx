// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CappedMembershipLedgerStatus,
  capAmountToMinor, cappedMembershipSandboxSummary,
  validCappedMembershipLedgerStatus } from
  "../CappedMembershipLedgerStatus";

const active = {
  schema: "casimirbot.capped_membership_status.v1" as const,
  state: "active" as const,
  period_id: "capped:period:test", currency: "USD",
  period_ends_at: "2026-11-28T00:00:00.000Z",
  base_minor: 500, cap_minor: 500, maximum_cap_minor: 10_000,
  accrued_overage_minor: 0, reserved_minor: 0,
  remaining_cap_minor: 0,
  included_provider_remaining_micros_usd: 1_000_000,
  settled_provider_micros_usd: 0,
  reserved_provider_micros_usd: 0,
};

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("capped membership account ledger display", () => {
  it("separates the included provider allowance from extra cap room", () => {
    expect(validCappedMembershipLedgerStatus(active)).toBe(true);
    const html = renderToStaticMarkup(
      <CappedMembershipLedgerStatus status={active} />);
    expect(html).toContain("Monthly base: $5.00");
    expect(html).toContain("total monthly cap: $5.00");
    expect(html).toContain("Included provider cost remaining: $1.00 USD");
    expect(html).toContain("additional cap remaining: $0.00");
    expect(html).toContain("Estimated managed voice time is unavailable");
  });

  it("offers a retainable period-specific sandbox summary", () => {
    const summary = cappedMembershipSandboxSummary({ ...active,
      cap_minor: 1_000, remaining_cap_minor: 500 });
    expect(summary).toContain("Monthly base (tax included): $5.00");
    expect(summary).toContain("not a purchase receipt or proof that an email notice was delivered");
    expect(summary).toContain("Authorized total cap for this paid period (tax included): $10.00");
    expect(summary).toContain("Included provider cost remaining:");
    expect(summary).toContain("Additional charges accrued:");
    expect(summary).toContain("Additional cap remaining: $5.00");
    expect(summary).toContain("Current paid period ends: 2026-11-28 00:00 UTC");
    expect(summary).toContain("renews monthly until canceled");
    expect(summary).toContain("https://casimirbot.com/account");
    expect(summary).toContain("danylejbruce@gmail.com");
    const html = renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={active} />);
    expect(html).toContain("download=\"casimirbot-sandbox-membership-summary.txt\"");
    expect(html).toContain("Download current test membership summary");
    expect(html).toContain("Current paid period ends 2026-11-28 00:00 UTC");
    expect(html).toContain("mailto:danylejbruce@gmail.com");
  });

  it("shows a measured micro-dollar deduction without rounding it away", () => {
    const html = renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={{ ...active,
        included_provider_remaining_micros_usd: 999_992,
        settled_provider_micros_usd: 8 }} />);
    expect(html).toContain("Included provider cost remaining: $0.999992 USD");
  });

  it("explains pending and unconfirmed Stripe usage without changing the cap", () => {
    const pending = { ...active, meter_delivery_state: "pending" as const };
    const unconfirmed = { ...active,
      meter_delivery_state: "unconfirmed" as const };
    expect(validCappedMembershipLedgerStatus(pending)).toBe(true);
    expect(validCappedMembershipLedgerStatus(unconfirmed)).toBe(true);
    expect(renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={pending} />)).toContain("usage charge is being delivered");
    expect(renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={unconfirmed} />)).toContain("must reconcile it");
    expect(validCappedMembershipLedgerStatus({ ...active,
      meter_delivery_state: "accepted" })).toBe(false);
  });

  it("rejects inactive, negative, malformed, or unsupported currency data", () => {
    expect(validCappedMembershipLedgerStatus({ ...active,
      state: "inactive" })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      reserved_minor: -1 })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      currency: "not-a-currency" })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      cap_minor: 400 })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      remaining_cap_minor: 100 })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      accrued_overage_minor: 1, remaining_cap_minor: 0 })).toBe(false);
    expect(validCappedMembershipLedgerStatus({ ...active,
      settled_provider_micros_usd: Number.MAX_SAFE_INTEGER,
      reserved_provider_micros_usd: 1 })).toBe(false);
  });

  it("formats invoice minor units for a zero-decimal currency", () => {
    const yen = { ...active, currency: "JPY",
      base_minor: 500, cap_minor: 600,
      remaining_cap_minor: 100 };
    const html = renderToStaticMarkup(
      <CappedMembershipLedgerStatus status={yen} />);
    expect(html).toContain("Monthly base: ¥500");
    expect(html).toContain("additional cap remaining: ¥100");
  });

  it("offers an immediate reduction only above already accrued charges", () => {
    const html = renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={{ ...active, cap_minor: 1_000,
        accrued_overage_minor: 100, remaining_cap_minor: 400 }} />);
    expect(html).toContain("Lower this period’s total cap (USD)");
    expect(html).toContain("Minimum now: $6.00");
    expect(html).toContain("Already accrued");
    expect(renderToStaticMarkup(<CappedMembershipLedgerStatus
      status={active} />)).not.toContain("Lower cap</button>");
  });

  it("parses exact invoice minor units without accepting extra decimals", () => {
    expect(capAmountToMinor("6.25", "USD")).toBe(625);
    expect(capAmountToMinor("6.2", "USD")).toBe(620);
    expect(capAmountToMinor("6.251", "USD")).toBeNull();
    expect(capAmountToMinor("601", "JPY")).toBe(601);
    expect(capAmountToMinor("601.0", "JPY")).toBeNull();
  });

  it("posts one exact owner-period reduction and refreshes the ledger", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ cap_minor: 700 }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = vi.fn(async () => undefined);
    render(<CappedMembershipLedgerStatus status={{ ...active,
      cap_minor: 1_000, accrued_overage_minor: 100,
      remaining_cap_minor: 400 }} onUpdated={onUpdated} />);
    fireEvent.change(screen.getByLabelText("Lower this period’s total cap (USD)"),
      { target: { value: "7.00" } });
    fireEvent.click(screen.getByRole("button", { name: "Lower cap" }));
    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, options] = fetchMock.mock.calls[0] as unknown as
      [string, RequestInit];
    expect(url).toBe("/api/capped-membership/cap");
    expect(options.credentials).toBe("same-origin");
    expect(JSON.parse(options.body as string)).toMatchObject({
      period_id: active.period_id, expected_cap_minor: 1_000,
      next_cap_minor: 700,
      accepted_disclosure_revision: "capped-cap-reduction-v1",
    });
  });

  it("requires an exact amount review before a higher cap POST", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true, status: 200,
      json: async () => ({ cap_minor: 1_000 }) }));
    vi.stubGlobal("fetch", fetchMock);
    const onUpdated = vi.fn(async () => undefined);
    render(<CappedMembershipLedgerStatus status={active}
      onUpdated={onUpdated} />);
    const authorize = screen.getByRole("button", { name: "Authorize higher cap" });
    expect((authorize as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(
      "Set a higher total cap for this paid period (USD)"),
      { target: { value: "10.00" } });
    expect((authorize as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText(
      "I authorize a total charge up to $10.00 for this paid period, including the base fee, metered use, and tax."));
    fireEvent.click(authorize);
    await waitFor(() => expect(onUpdated).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledOnce();
    const [, options] = fetchMock.mock.calls[0] as unknown as
      [string, RequestInit];
    expect(JSON.parse(options.body as string)).toMatchObject({
      period_id: active.period_id, expected_cap_minor: 500,
      next_cap_minor: 1_000,
      accepted_disclosure_revision: "capped-cap-increase-v1",
    });
  });

  it("requires a fresh amount review when the paid period changes at the same cap", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const view = render(<CappedMembershipLedgerStatus status={active} />);
    fireEvent.change(screen.getByLabelText(
      "Set a higher total cap for this paid period (USD)"),
      { target: { value: "10.00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(screen.getByRole("button", { name: "Authorize higher cap" })).toBeEnabled();
    view.rerender(<CappedMembershipLedgerStatus status={{ ...active,
      period_id: "capped:period:next" }} />);
    expect(screen.getByRole("button", { name: "Authorize higher cap" })).toBeDisabled();
    expect(screen.queryByRole("checkbox")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Authorize higher cap" }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("does not display an old period's delayed cap receipt in the replacement period", async () => {
    let finish!: (value: unknown) => void;
    vi.stubGlobal("fetch", vi.fn(() => new Promise(resolve => { finish = resolve; })));
    const view = render(<CappedMembershipLedgerStatus status={active} />);
    fireEvent.change(screen.getByLabelText(
      "Set a higher total cap for this paid period (USD)"),
      { target: { value: "10.00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Authorize higher cap" }));
    view.rerender(<CappedMembershipLedgerStatus status={{ ...active,
      period_id: "capped:period:next" }} />);
    await act(async () => finish({ ok: true,
      json: async () => ({ cap_minor: 1_000 }) }));
    expect(screen.queryByText("Higher cap authorized for this period.")).toBeNull();
    expect(screen.getByRole("button", { name: "Authorize higher cap" })).toBeDisabled();
  });

  it.each(["raise", "lower"])("preserves a confirmed %s receipt when ledger refresh fails", async direction => {
    const raise = direction === "raise";
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true,
      json: async () => ({ cap_minor: raise ? 1_000 : 700 }) })));
    render(<CappedMembershipLedgerStatus status={raise ? active : {
      ...active, cap_minor: 1_000, remaining_cap_minor: 500,
    }} onUpdated={async () => { throw new Error("ledger offline"); }} />);
    fireEvent.change(screen.getByLabelText(raise
      ? "Set a higher total cap for this paid period (USD)"
      : "Lower this period’s total cap (USD)"),
      { target: { value: raise ? "10.00" : "7.00" } });
    if (raise) fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", {
      name: raise ? "Authorize higher cap" : "Lower cap" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "The cap change was confirmed. Refresh usage to view the updated ledger.");
    expect(screen.getByRole("status")).toHaveTextContent(raise
      ? "Higher cap authorized for this period." : "Cap lowered for this period.");
  });

  it("reuses one increase request identity after an uncertain browser response", async () => {
    const fetchMock = vi.fn()
      .mockRejectedValueOnce(new Error("connection closed"))
      .mockResolvedValueOnce({ ok: true, status: 200,
        json: async () => ({ cap_minor: 1_000 }) });
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipLedgerStatus status={active} />);
    fireEvent.change(screen.getByLabelText(
      "Set a higher total cap for this paid period (USD)"),
      { target: { value: "10.00" } });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Authorize higher cap" }));
    await screen.findByText("The higher cap could not be confirmed. Refresh usage to check its current state before another decision.");
    fireEvent.click(screen.getByRole("button", { name: "Authorize higher cap" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const first = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit)
      .body as string) as { request_id: string };
    const second = JSON.parse((fetchMock.mock.calls[1][1] as RequestInit)
      .body as string) as { request_id: string };
    expect(first.request_id).toBe(second.request_id);
  });
});
