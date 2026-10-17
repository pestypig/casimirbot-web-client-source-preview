// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { LocalHostedSubscription } from "../LocalHostedSubscription";
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it("keeps personal-free and validation disclosures visible and requires an explicit Start Trial", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ reason: "never_enrolled", termId: null,
    eligible: false, successfulEffects: 0, unresolvedEffects: 0 }) });
  vi.stubGlobal("fetch", fetcher);
  render(<LocalHostedSubscription />);
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
  expect(screen.getByText(/Personal tools stay free/)).toBeVisible();
  expect(screen.getByText(/validation candidate awaiting review/)).toBeVisible();
  fireEvent.click(screen.getByRole("button", { name: "Start local trial" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(fetcher.mock.calls[1]).toEqual(["/api/account/local-hosted/trial", expect.objectContaining({
    method: "POST", headers: { "Content-Type": "application/json", "x-casimir-local-action": "explicit" },
    body: JSON.stringify({ acknowledgedLocalValidationLimits: true }) })]);
});
