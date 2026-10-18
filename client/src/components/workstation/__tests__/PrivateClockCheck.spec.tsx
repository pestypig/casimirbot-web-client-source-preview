// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import PrivateClockCheck, { type PrivateClockBridge } from "../PrivateClockCheck";
import { HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT } from "@/lib/workstation/accountCapabilityPolicy";
import type { HelixEnvironmentConnectorProbeRequest as Request } from "@shared/helix-environment-connector";

const installationRef = "environment_installation:00000000-0000-4000-8000-000000000001";
const admission = () => ({ installationRef, catalogSnapshotId: "catalog:private", expiresAt: new Date(Date.now() + 60000).toISOString() });
const receipt = (request: Request) => ({ executionRef: "environment_execution:00000000-0000-4000-8000-000000000002",
  epoch: 1, installationRef, result: { schema: "helix.environment_connector.probe_result.v1", probe_request_id: request.probe_request_id,
    capability_id: request.capability_id, capability_version: 1, outcome: "succeeded", summary: "Clock observed",
    result: { uptime_ms: 123 }, side_effects_performed: false, commands_executed: [], environment_mutation_performed: false,
    deterministic: true, model_invoked: false, assistant_answer: false, raw_content_included: false, created_at: request.created_at } });
const deferred = <T,>() => { let resolve!: (value: T) => void, reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; };
let prepare: Mock<[], Promise<unknown>>, observe: Mock<[unknown], Promise<unknown>>, history: Mock<[unknown?], Promise<unknown>>,
  stop: Mock<[], Promise<unknown>>, activity: Mock<[boolean], void>;
let bridge: PrivateClockBridge;
beforeEach(() => {
  prepare = vi.fn<[], Promise<unknown>>(async () => ({ ready: true, installationRef }));
  observe = vi.fn<[unknown], Promise<unknown>>(async request => receipt(request as Request));
  history = vi.fn<[unknown?], Promise<unknown>>(async () => ({ state: "accepted", fresh: false, receipt: receipt(observe.mock.calls[0][0] as Request) }));
  stop = vi.fn<[], Promise<unknown>>(async () => undefined); activity = vi.fn<[boolean], void>();
  bridge = { preparePrivateClock: prepare, observePrivateClock: observe, recoverPrivateClockObservation: history, stopPrivateClock: stop };
});
afterEach(() => { cleanup(); vi.useRealTimers(); });
const show = () => render(<PrivateClockCheck bridge={bridge} admission={admission()} onActivityChange={activity} />);
const read = () => fireEvent.click(screen.getByRole("button", { name: "Read clock once" }));

describe("private clock presentation with controlled native bridge", () => {
  it("loads the latest saved request after remount without a new read", async () => {
    const view = show(); read(); await screen.findByText("123 ms");
    const original = observe.mock.calls[0][0] as Request; view.unmount();
    prepare.mockClear(); observe.mockClear(); stop.mockClear();
    history.mockResolvedValue({ state: "latest", fresh: false, legacyRecords: 0, request: original,
      history: { state: "accepted", fresh: false, receipt: receipt(original) } });
    show(); fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    await screen.findByText("Historical process uptime"); expect(screen.getByText("Saved observation — not current.")).toBeTruthy();
    expect(history).toHaveBeenCalledWith(); expect(prepare).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it.each([0, 1])("explains empty discovery with %s legacy records without starting a clock", async legacyRecords => {
    history.mockResolvedValue({ state: "empty", fresh: false, legacyRecords }); show();
    fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    await screen.findByText(legacyRecords ? /Older history is retained/ : /No saved clock requests/);
    expect(prepare).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it("discards late discovered history after account invalidation", async () => {
    const pending = deferred<unknown>(); history.mockReturnValue(pending.promise); show();
    fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT)));
    await act(async () => pending.resolve({ state: "empty", fresh: false, legacyRecords: 0 }));
    expect(screen.queryByText(/No saved clock requests/)).toBeNull();
    expect(screen.getByRole("button", { name: "Load last request history" })).toBeDisabled();
    expect(prepare).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it("holds new reads during package operations without disabling Stop", async () => {
    render(<PrivateClockCheck bridge={bridge} admission={admission()} onActivityChange={activity} blocked />);
    expect((screen.getByRole("button",{name:"Read clock once"}) as HTMLButtonElement).disabled).toBe(true);
    read(); expect(prepare).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button",{name:"Stop clock"})); await screen.findByText("Clock stopped.");
    expect(stop).toHaveBeenCalledTimes(1);
  });
  it("retains an observation while package lookup holds history and resumes without replay", async () => {
    const fixed=admission(), view=render(<PrivateClockCheck bridge={bridge} admission={fixed} onActivityChange={activity} />);
    read(); await screen.findByText("123 ms");
    view.rerender(<PrivateClockCheck bridge={bridge} admission={fixed} onActivityChange={activity} blocked />);
    expect((screen.getByRole("button",{name:"Load last request history"}) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText("123 ms")).toBeTruthy(); expect(stop).toHaveBeenCalledTimes(1);
    view.rerender(<PrivateClockCheck bridge={bridge} admission={fixed} onActivityChange={activity} />);
    fireEvent.click(screen.getByRole("button",{name:"Load last request history"})); await screen.findByText("Saved observation — not current.");
    expect(observe).toHaveBeenCalledTimes(1);
  });
  it("does nothing on open and offers no action without an installed candidate", () => {
    const view = render(<PrivateClockCheck bridge={bridge} admission={null} onActivityChange={activity} />);
    expect(view.container.textContent).toBe(""); expect(prepare).not.toHaveBeenCalled(); expect(observe).not.toHaveBeenCalled();
  });
  it("creates the five-second request only after preparation, then confirms cleanup before display", async () => {
    vi.useFakeTimers(); const initial = Date.now(), ready = deferred<unknown>(), stopped = deferred<undefined>();
    prepare.mockReturnValue(ready.promise); stop.mockReturnValue(stopped.promise);
    show(); read(); expect(screen.getByText("Preparing clock…")).toBeTruthy(); expect(observe).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(7000); ready.resolve({ ready: true, installationRef }); });
    const request = observe.mock.calls[0][0] as Request;
    expect(Date.parse(request.created_at)).toBe(initial + 7000); expect(Date.parse(request.deadline_at) - Date.parse(request.created_at)).toBe(5000);
    expect(request).toMatchObject({ arguments: { clock: "monotonic" }, constraints: { read_only: true, side_effects_allowed: false, max_duration_ms: 5000 } });
    expect(screen.queryByText("123 ms")).toBeNull();
    await act(async () => { stopped.resolve(undefined); });
    expect(screen.getByText("123 ms")).toBeTruthy(); expect(screen.getByText("Read completed; clock stopped.")).toBeTruthy();
    expect(activity).toHaveBeenLastCalledWith(false);
  });
  it("retrieves the original request as explicitly non-current history without another read", async () => {
    show(); read(); await screen.findByText("123 ms");
    const original = structuredClone(observe.mock.calls[0][0]);
    fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    await screen.findByText("Saved observation — not current.");
    expect(screen.getByText("Historical process uptime")).toBeTruthy(); expect(history).toHaveBeenCalledWith(original);
    expect(prepare).toHaveBeenCalledTimes(1); expect(observe).toHaveBeenCalledTimes(1);
  });
  it.each(["uncertain", "absent"])("shows %s history without replay", async state => {
    show(); read(); await screen.findByText("123 ms"); history.mockResolvedValue({ state, fresh: false });
    fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    await screen.findByText(state === "uncertain" ? /Outcome unknown/ : /No saved outcome/);
    expect(observe).toHaveBeenCalledTimes(1); expect(screen.queryByText("123 ms")).toBeNull();
  });
  it("rejects history claiming freshness", async () => {
    show(); read(); await screen.findByText("123 ms"); history.mockResolvedValue({ state: "accepted", fresh: true, receipt: receipt(observe.mock.calls[0][0] as Request) });
    fireEvent.click(screen.getByRole("button", { name: "Load last request history" }));
    await screen.findByText(/Saved outcome is unavailable/); expect(screen.queryByText("123 ms")).toBeNull();
  });
  it.each(["installation", "request", "capability", "effect", "uptime", "timestamp"])("rejects a mismatched %s result and cleans up", async mismatch => {
    observe.mockImplementation(async input => {
      const request = input as Request;
      const value = receipt(request);
      if (mismatch === "installation") value.installationRef = "different-install";
      if (mismatch === "request") value.result.probe_request_id = "probe:other";
      if (mismatch === "capability") value.result.capability_id = "other:capability";
      if (mismatch === "effect") value.result.side_effects_performed = true;
      if (mismatch === "uptime") value.result.result.uptime_ms = -1;
      if (mismatch === "timestamp") value.result.created_at = new Date(Date.parse(request.created_at) - 1).toISOString();
      return value;
    });
    show(); read(); await screen.findByText(/Clock check failed/);
    expect(stop).toHaveBeenCalledTimes(1); expect(screen.queryByText("Observed process uptime")).toBeNull();
  });
  it("denies readiness for another installation before submitting a request", async () => {
    prepare.mockResolvedValue({ ready: true, installationRef: "another" }); show(); read();
    await screen.findByText(/Clock check failed/); expect(observe).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledTimes(1);
  });
  it("keeps Stop available while preparing and ignores late readiness", async () => {
    const ready = deferred<unknown>(); prepare.mockReturnValue(ready.promise); show(); read();
    fireEvent.click(screen.getByRole("button", { name: "Stop clock" })); await screen.findByText("Clock stopped.");
    await act(async () => ready.resolve({ ready: true, installationRef }));
    expect(observe).not.toHaveBeenCalled(); expect(stop).toHaveBeenCalledTimes(1);
  });
  it("does not let a canceled operation's late rejection stop its successor", async () => {
    const first = deferred<unknown>(), second = deferred<unknown>(); prepare.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    show(); read(); fireEvent.click(screen.getByRole("button", { name: "Stop clock" })); await screen.findByText("Clock stopped.");
    read(); await act(async () => first.reject(new Error("old canceled work")));
    expect(stop).toHaveBeenCalledTimes(1); expect(screen.getByText("Preparing clock…")).toBeTruthy();
    await act(async () => second.resolve({ ready: true, installationRef })); await screen.findByText("123 ms");
    expect(observe).toHaveBeenCalledTimes(1); expect(stop).toHaveBeenCalledTimes(2);
  });
  it("clears results and stops on account invalidation, without publishing a late observation", async () => {
    const response = deferred<unknown>(); observe.mockReturnValue(response.promise); show(); read();
    await waitFor(() => expect(observe).toHaveBeenCalledTimes(1));
    act(() => window.dispatchEvent(new Event(HELIX_ACCOUNT_CAPABILITY_POLICY_EVENT))); await screen.findByText("Clock stopped.");
    await act(async () => response.resolve(receipt(observe.mock.calls[0][0] as Request)));
    expect(screen.queryByText("123 ms")).toBeNull(); expect(screen.getByRole("button", { name: "Load last request history" })).toBeDisabled();
  });
  it("retains Stop after catalog loss and does not claim stopped while cleanup is pending", async () => {
    const ready = deferred<unknown>(), stopped = deferred<undefined>(); prepare.mockReturnValue(ready.promise); stop.mockReturnValue(stopped.promise);
    const view = show(); read(); view.rerender(<PrivateClockCheck bridge={bridge} admission={null} onActivityChange={activity} />);
    expect(screen.getByRole("button", { name: "Read clock once" })).toBeDisabled(); expect(screen.getByText("Stopping clock…")).toBeTruthy();
    expect(screen.queryByText("Clock stopped.")).toBeNull();
    await act(async () => stopped.resolve(undefined)); await screen.findByText("Clock stopped.");
    await act(async () => ready.resolve({ ready: true, installationRef })); expect(observe).not.toHaveBeenCalled();
  });
  it("blocks another read when cleanup fails and allows explicit Stop retry", async () => {
    stop.mockRejectedValueOnce(new Error("private native error")); show(); read();
    await screen.findByText(/Cleanup could not be confirmed/); expect(screen.queryByText("123 ms")).toBeNull();
    expect(screen.getByRole("button", { name: "Read clock once" })).toBeDisabled(); expect(stop).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: "Stop clock" })); await screen.findByText(/Cleanup confirmed. Restart/);
    expect(screen.getByRole("button", { name: "Read clock once" })).toBeDisabled(); expect(activity).toHaveBeenLastCalledWith(true);
  });
  it("stops on unmount and suppresses late results", async () => {
    const ready = deferred<unknown>(); prepare.mockReturnValue(ready.promise); const view = show(); read(); view.unmount();
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1)); await act(async () => ready.resolve({ ready: true, installationRef }));
    expect(observe).not.toHaveBeenCalled();
  });
});
