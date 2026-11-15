// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CappedMembershipCancellation } from
  "../CappedMembershipCancellation";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe("capped membership cancellation entry", () => {
  it("explains a processor-confirmed scheduled end while retaining the review link", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true,
      json: async () => ({
        schema: "casimirbot.capped_membership_management.v1",
        test_mode: true, cancellation_available: true,
        period_id: "capped:stripe_invoice:in_Test12345678",
        cancellation_scheduled: true,
        cancellation_effective_at: "2026-11-28T00:00:00Z",
      }),
    })));
    render(<CappedMembershipCancellation
      periodId="capped:stripe_invoice:in_Test12345678" />);
    expect(await screen.findByText("Review cancellation in Stripe"))
      .toBeTruthy();
    expect(screen.getByText("Manage renewal card in Stripe")).toBeTruthy();
    expect(screen.getByText(/select this subscription/)).toBeTruthy();
    expect(screen.getByRole("status").textContent)
      .toContain("scheduled this membership to end");
  });
  it("only displays a Stripe review control for the exact active period", async () => {
    const fetchMock = vi.fn(async () => ({ ok: true,
      json: async () => ({
        schema: "casimirbot.capped_membership_management.v1",
        test_mode: true, cancellation_available: true,
        period_id: "capped:stripe_invoice:in_Other12345678",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipCancellation
      periodId="capped:stripe_invoice:in_Test12345678" />);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    expect(screen.queryByText("Review cancellation in Stripe")).toBeNull();
    expect(screen.queryByText("Manage renewal card in Stripe")).toBeNull();
  });
});
