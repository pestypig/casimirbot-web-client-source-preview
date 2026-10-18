// @vitest-environment jsdom
import React from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { HELIX_WORKSTATION_GUIDANCE_EVENT, clearPendingWorkstationGuidance } from "@/lib/workstation/workstationGuidance";
const observer = vi.hoisted(() => ({ available: true }));
vi.mock("../HelixAskLegacyRuntimeBridge", () => ({ HelixAskLegacyRuntimeBridge: () => <div>Conversation</div> }));
vi.mock("../HelixAskConsoleRuntimeShellProps", () => ({ buildHelixAskConsoleRuntimeBridgeProps: (props: unknown) => props }));
vi.mock("../HelixOperatorActivityPanel", () => ({ HelixOperatorActivityPanel: () => <div>Activity diagnostics</div> }));
vi.mock("../agent-run-observer/AgentRunObserverBindingSurface", () => ({ AgentRunObserverBindingSurface: () => observer.available ? <div>Connection setup</div> : null }));
import { HelixAskConsoleRuntimeShell } from "../HelixAskConsoleRuntimeShell";
afterEach(() => { cleanup(); observer.available = true; clearPendingWorkstationGuidance(); });
it("keeps diagnostics out of the conversation layout until requested", async () => {
  render(<HelixAskConsoleRuntimeShell />);
  await screen.findByText("Conversation");
  expect(screen.queryByText("Activity diagnostics")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Activity & setup" }));
  expect(screen.getByRole("dialog")).toBeTruthy();
  expect(screen.getByText("Activity diagnostics")).toBeTruthy();
  const setup = screen.getByText("External agent setup").closest("details");
  expect(setup?.open).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(screen.getByText("Conversation")).toBeTruthy();
});
it("keeps a usable setup entry when the policy-gated observer is unavailable", async () => {
  observer.available = false;
  const guidance = vi.fn();
  window.addEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
  try {
    render(<HelixAskConsoleRuntimeShell />);
    await screen.findByText("Conversation");
    fireEvent.click(screen.getByRole("button", { name: "Activity & setup" }));
    const setup = screen.getByText("External agent setup").closest("details")!;
    setup.open = true;
    expect(screen.queryByText("Connection setup")).toBeNull();
    expect(guidance).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Open Agent Access" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.getByText("Conversation")).toBeTruthy();
    expect(guidance).toHaveBeenCalledTimes(1);
    expect(guidance.mock.calls[0][0].detail).toEqual({
      kind: "user_attention", panelId: "agent-access",
      label: "Review your account and connection in Agent Access.",
      targetId: undefined, controlId: undefined, durationMs: undefined,
    });
  } finally {
    window.removeEventListener(HELIX_WORKSTATION_GUIDANCE_EVENT, guidance);
  }
});
