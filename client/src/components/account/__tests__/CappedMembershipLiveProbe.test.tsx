// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CappedMembershipLiveProbe } from
  "../CappedMembershipLiveProbe";

const ok = (body: unknown) => new Response(JSON.stringify(body),
  { status: 200 });
const ready = { schema: "casimirbot.capped_live_probe_status.v1",
  test_mode: true, maximum_seconds: 10,
  reserved_provider_micros_usd: 8_334 };

describe("private managed Live qualification review", () => {
  afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

  it("requires review before one fixed silent provider probe", async () => {
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) =>
      url.endsWith("/status") ? ok(ready) : ok({
        schema: "casimirbot.capped_live_probe.v1", state: "settled",
        maximum_seconds: 10,
      }));
    vi.stubGlobal("fetch", fetchMock);
    const onSettled = vi.fn();
    render(<CappedMembershipLiveProbe onSettled={onSettled} />);
    const button = await screen.findByRole("button", {
      name: "Run one silent GPT Live check" });
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await screen.findByText(/confirmed usage receipt/);
    expect(screen.getByText(/this check does not qualify paid voice usage/))
      .toBeInTheDocument();
    const probe = fetchMock.mock.calls.find(([url]) =>
      url.endsWith("/live/probe"));
    expect(JSON.parse(String(probe?.[1]?.body))).toMatchObject({
      confirm_bounded_silent_probe: true,
      request_id: expect.stringMatching(/^capped:live-probe-/),
    });
    expect(onSettled).toHaveBeenCalledTimes(1);
    expect(button).toBeDisabled();
  });

  it("hides an unavailable probe and does not permit repeated uncertain work", async () => {
    const hiddenFetch = vi.fn(async () => new Response("{}", { status: 404 }));
    vi.stubGlobal("fetch", hiddenFetch);
    const hidden = render(<CappedMembershipLiveProbe />);
    await waitFor(() => expect(hiddenFetch).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("button", {
      name: "Run one silent GPT Live check" })).toBeNull();
    hidden.unmount();

    const fetchMock = vi.fn(async (url: string) =>
      url.endsWith("/status") ? ok(ready) :
        new Response("{}", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<CappedMembershipLiveProbe />);
    const button = await screen.findByRole("button", {
      name: "Run one silent GPT Live check" });
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(button);
    await screen.findByText(/Do not repeat the probe/);
    expect(button).toBeDisabled();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
