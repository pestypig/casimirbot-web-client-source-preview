// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CappedMembershipMeterSandboxDelivery } from
  "../CappedMembershipMeterSandboxDelivery";

const requestId = "capped:meter-sandbox-review-12345678";
const pending = { schema: "casimirbot.capped_meter_delivery_review.v1",
  test_mode: true, state: "pending", request_id: requestId,
  units_minor: 17 };
const ok = (body: unknown) => new Response(JSON.stringify(body),
  { status: 200 });

describe("owner-reviewed sandbox meter delivery", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("sends only the exact reviewed charge after the owner checks approval", async () => {
    const fetchMock = vi.fn(async (url: string, _init?: RequestInit) =>
      url.endsWith("/status") ? ok(pending) : ok({
        schema: "casimirbot.capped_meter_delivery_test.v1",
        state: "accepted", request_id: requestId,
      }));
    vi.stubGlobal("fetch", fetchMock);
    const onDelivered = vi.fn();
    render(<CappedMembershipMeterSandboxDelivery
      onDelivered={onDelivered} />);
    const button = await screen.findByRole("button", {
      name: "Send one reviewed sandbox event" });
    expect(button).toBeDisabled();
    expect(screen.getByText(/\$0\.17 USD/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await screen.findByText(/accepted this exact usage event/);
    const request = fetchMock.mock.calls.find(([url]) =>
      url.endsWith("/meter/dispatch-one"));
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({
      confirm_pending_meter_delivery: true,
      expected_request_id: requestId, expected_units_minor: 17,
    });
    expect(onDelivered).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("hides an unavailable route and refuses a repeat after uncertainty", async () => {
    const hiddenFetch = vi.fn(async () =>
      new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", hiddenFetch);
    const hidden = render(<CappedMembershipMeterSandboxDelivery />);
    await waitFor(() => expect(hiddenFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", {
      name: "Send one reviewed sandbox event" })).toBeNull();
    hidden.unmount();

    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/status") ? ok(pending) :
        new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipMeterSandboxDelivery />);
    const button = await screen.findByRole("button", {
      name: "Send one reviewed sandbox event" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await screen.findByText(/Do not resend this event/);
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
