// @vitest-environment jsdom

import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import BoundedCaptureControls from "../BoundedCaptureControls";

const startCapture = vi.fn();
vi.mock("../../../../lib/helix/boundedVisualSequenceCapture", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/helix/boundedVisualSequenceCapture")>("../../../../lib/helix/boundedVisualSequenceCapture");
  return { ...actual, startBoundedVisualSequenceCapture: (...args: unknown[]) => startCapture(...args) };
});
vi.mock("../../../../lib/workstation/accountCapabilityPolicy", () => ({
  readCachedAccountProfileIdentity: () => ({ profileId: "profile:developer", revision: 1 }),
  fetchAccountCapabilityPolicy: vi.fn(),
}));

afterEach(() => { cleanup(); startCapture.mockReset(); });

const props = {
  hudElement: document.createElement("div"),
  hudReceipt: {
    receiptId: "receipt-1", mode: "hud_over_source", status: "rendered",
  } as any,
  hudIdentity: {
    sourceId: "hud-source", producerEpoch: "epoch-1", profileId: "pending",
    runId: "fixture:one", threadId: "motorcycle-hud-lab",
  },
  onArtifact: vi.fn(),
};

describe("VSE-0B developer capture controls", () => {
  it("opens no capture until consent and exposes visible stop and revoke controls while recording", async () => {
    let rejectCapture!: (error: Error) => void;
    const completion = new Promise<never>((_resolve, reject) => { rejectCapture = reject; });
    const stop = vi.fn();
    const revoke = vi.fn(() => rejectCapture(new Error("revoked")));
    startCapture.mockResolvedValue({ captureSessionId: "capture-1", startedAt: "now", completion, stop, revoke });
    render(<BoundedCaptureControls {...props} />);
    const start = screen.getByRole("button", { name: "Start capture" });
    expect(start).toBeDisabled();
    expect(startCapture).not.toHaveBeenCalled();
    fireEvent.click(screen.getByLabelText("Consent to bounded capture"));
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByLabelText("Confirm surface excludes protected or sensitive content"));
    fireEvent.click(start);
    await screen.findByRole("button", { name: "Revoke" });
    expect(startCapture).toHaveBeenCalledWith(expect.objectContaining({ consent: true, surface: "hud_composed_feed", durationMs: 10_000 }));
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(stop).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Revoke" }));
    expect(revoke).toHaveBeenCalledOnce();
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("revoked"));
  });

  it("labels Minecraft as a selected-window capture and permits the 15-second envelope", async () => {
    const completion = Promise.reject(new Error("picker cancelled"));
    completion.catch(() => undefined);
    startCapture.mockResolvedValue({ captureSessionId: "capture-2", startedAt: "now", completion, stop: vi.fn(), revoke: vi.fn() });
    render(<BoundedCaptureControls {...props} />);
    fireEvent.change(screen.getByLabelText("Bounded capture surface"), { target: { value: "minecraft_client_window" } });
    fireEvent.change(screen.getByLabelText("Bounded capture duration"), { target: { value: "15000" } });
    fireEvent.click(screen.getByLabelText("Consent to bounded capture"));
    fireEvent.click(screen.getByLabelText("Confirm surface excludes protected or sensitive content"));
    fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
    await waitFor(() => expect(startCapture).toHaveBeenCalledWith(expect.objectContaining({ surface: "minecraft_client_window", durationMs: 15_000 })));
  });

  it("revokes an active capture when the developer panel closes", async () => {
    const revoke = vi.fn();
    startCapture.mockResolvedValue({ captureSessionId: "capture-3", startedAt: "now", completion: new Promise(() => undefined), stop: vi.fn(), revoke });
    const view = render(<BoundedCaptureControls {...props} />);
    fireEvent.click(screen.getByLabelText("Consent to bounded capture"));
    fireEvent.click(screen.getByLabelText("Confirm surface excludes protected or sensitive content"));
    fireEvent.click(screen.getByRole("button", { name: "Start capture" }));
    await screen.findByRole("button", { name: "Revoke" });
    view.unmount();
    expect(revoke).toHaveBeenCalledOnce();
  });
});
