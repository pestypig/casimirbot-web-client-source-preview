// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CappedMembershipAgentProbe } from
  "../CappedMembershipAgentProbe";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it("requires an explicit one-call review before the private provider probe", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.endsWith("/status")) return new Response(JSON.stringify({
      schema: "casimirbot.capped_agent_probe_status.v1",
      test_mode: true, model: "gpt-6-luna", tools: 0,
      maximum_output_tokens: 64,
    }), { status: 200 });
    return new Response(JSON.stringify({
      schema: "casimirbot.capped_agent_probe.v1", state: "settled",
      answer_matches_probe: true, measured_provider_micros_usd: 9,
    }), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<CappedMembershipAgentProbe />);
  const run = await screen.findByRole("button", {
    name: "Run one Responses check",
  });
  expect(run).toBeDisabled();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  fireEvent.click(screen.getByRole("checkbox", {
    name: /I approve one bounded Responses sandbox call/i,
  }));
  fireEvent.click(run);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(run).toBeDisabled();
  expect(await screen.findByText(/settled with a provider usage receipt/i))
    .toBeInTheDocument();
});

it("does not offer the private call when the status route is absent", async () => {
  const fetchMock = vi.fn(async () => new Response(null, { status: 404 }));
  vi.stubGlobal("fetch", fetchMock);
  render(<CappedMembershipAgentProbe />);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("button", {
    name: "Run one Responses check",
  })).not.toBeInTheDocument();
});
