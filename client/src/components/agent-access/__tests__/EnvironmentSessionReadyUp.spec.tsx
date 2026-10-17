// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import EnvironmentSessionReadyUp from "../EnvironmentSessionReadyUp";
import { HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT } from "@/components/helix/ask-console/shared-live-room/SharedLiveRoomGuideProjection";
import type { BrowserReasoningBinding } from "@/lib/agent-access/reasoningTaskBinding";
const binding: BrowserReasoningBinding = { reasoning_binding_id: "binding:a", binding_epoch: 1,
  helix_conversation_id: "chat:a", run_id: "run:a", status: "active", continuation_transport: "polling" };
it("requests only the returned room and reports unavailable controls without changing permissions", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    selection: { room_id: "room:exact", environment_binding_id: "environment:exact" }, readiness: { ready: false, checks: [] } }) });
  vi.stubGlobal("fetch", fetcher);
  const listener = vi.fn();
  window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener);
  try {
    render(<EnvironmentSessionReadyUp binding={binding} />);
    fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
    fireEvent.click(await screen.findByRole("button", { name: "Review environment settings" }));
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0].detail).toEqual({ roomId: "room:exact", environmentBindingId: "environment:exact", onResult: expect.any(Function) });
    expect(screen.getByRole("status").textContent).toContain("No other room was opened");
    expect(fetcher).toHaveBeenCalledTimes(1);
  } finally {
    window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener);
  }
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); sessionStorage.clear(); });
it.each(["environment_session_goal_missing", "reasoning_binding_run_association_stale"])("handles %s navigation without starting a workflow", async error => {
  const fetcher = vi.fn().mockResolvedValue({ ok: false, json: async () => ({
    schema: "helix.environment_session_error.v1", ok: false, error,
    readiness_confirmed: false, selection: { room_id: "room:exact", environment_binding_id: "not-selected" },
  }) });
  vi.stubGlobal("fetch", fetcher);
  const listener = vi.fn((event: Event) => event.preventDefault());
  window.addEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener);
  try {
    render(<EnvironmentSessionReadyUp binding={binding} />);
    fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
    await screen.findByRole("status");
    await waitFor(() => expect(screen.getByRole("button", { name: "Ready up" })).not.toBeDisabled());
    expect(listener).not.toHaveBeenCalled();
    if (error === "environment_session_goal_missing") {
      fireEvent.click(screen.getByRole("button", { name: "Review environment settings" }));
      expect(listener.mock.calls[0][0]).toHaveProperty("detail", { roomId: "room:exact", onResult: expect.any(Function) });
      expect(screen.getByRole("status").textContent).toContain("Pickup alone is not readiness");
      act(() => listener.mock.calls[0][0].detail.onResult(false));
      expect(screen.getByRole("status").textContent).toContain("No other room was selected");
    } else expect(screen.queryByRole("button", { name: "Review environment settings" })).toBeNull();
    expect(fetcher).toHaveBeenCalledOnce();
  } finally { window.removeEventListener(HELIX_SHARED_LIVE_ROOM_OPEN_DIALOG_EVENT, listener); }
});
it("clears old session controls when the exact binding changes", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    selection: { room_id: "room:old", environment_binding_id: "environment:old" },
    readiness: { ready: false, checks: [] }, session_deadlines: { run_expires_at_ms: Date.now() + 60000 } }) }));
  const view = render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await screen.findByRole("button", { name: "Review environment settings" });
  view.rerender(<EnvironmentSessionReadyUp binding={{ ...binding, binding_epoch: 2 }} />);
  expect(screen.queryByRole("button", { name: "Review environment settings" })).toBeNull();
  expect(screen.queryByText(/Environment run deadline:/)).toBeNull();
});

it("aborts an old binding request and ignores its late response", async () => {
  let finish!: (value: unknown) => void;
  const fetcher = vi.fn(() => new Promise(resolve => { finish = resolve; }));
  vi.stubGlobal("fetch", fetcher);
  const view = render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const signal = (fetcher.mock.calls[0] as unknown as [string, RequestInit])[1].signal;
  view.rerender(<EnvironmentSessionReadyUp binding={{ ...binding, run_id: "run:new" }} />);
  expect(signal?.aborted).toBe(true);
  await act(async () => finish({ ok: true, json: async () => ({ ok: true,
    selection: { room_id: "room:old" }, readiness: { ready: true, valid_until_ms: Date.now() + 5000 } }) }));
  expect(screen.queryByRole("button", { name: "Review environment settings" })).toBeNull();
  expect((screen.getByRole("button", { name: "Ready up" }) as HTMLButtonElement).disabled).toBe(false);
});

it.each(["expired", "revoked"])("explains %s gameplay permission without replacing chat binding", async kind => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    selection: { room_id: "room:exact" }, readiness: { ready: false, checks: [
      { layer: "authority", state: kind === "revoked" ? "revoked" : "blocked", expires_at_ms: Date.now() - 1000, human_approval_required: true },
      { layer: "controller", state: "blocked" },
    ] } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const details = await screen.findByRole("list", { name: "Session recovery details" });
  expect(details.textContent).toContain(kind === "revoked" ? "permission was revoked" : "lease has expired");
  expect(details.textContent).toContain("Player Embodiment");
  expect(details.textContent).toContain("Room-owner approval is required");
  expect(details.textContent).toContain("does not by itself mean another permission");
  expect(screen.getByText(/Gameplay permission deadline:/).textContent).toContain("deadline has passed");
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("shows source expiry separately and clears it when the exact binding changes", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: false, checks: [{ layer: "source", state: "stale", expires_at_ms: Date.now() - 1000 }] } }) });
  vi.stubGlobal("fetch", fetcher);
  const view = render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const source = await screen.findByText(/Source credential deadline:/);
  expect(source.textContent).toContain("deadline has passed");
  expect(source.textContent).toContain("Ready up does not renew it");
  expect(screen.queryByText(/Gameplay permission deadline:/)).toBeNull();
  expect(fetcher).toHaveBeenCalledTimes(1);
  view.rerender(<EnvironmentSessionReadyUp binding={{ ...binding, binding_epoch: 2 }} />);
  expect(screen.queryByText(/Source credential deadline:/)).toBeNull();
});

it("retains the probe retry identity after an unknown response and panel remount", async () => {
  const fetcher = vi.fn().mockRejectedValue(new Error("response lost"));
  vi.stubGlobal("fetch", fetcher);
  const first = render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ready up" })).not.toBeDisabled());
  const firstBody = JSON.parse(fetcher.mock.calls[0][1].body);
  first.unmount();
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[1][1].body).request_id).toBe(firstBody.request_id);
});

it("requests new evidence after a confirmed preparation outcome", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: false, checks: [] } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Ready up" })).not.toBeDisabled());
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(fetcher).toHaveBeenCalledTimes(2));
  expect(JSON.parse(fetcher.mock.calls[0][1].body).request_id)
    .not.toBe(JSON.parse(fetcher.mock.calls[1][1].body).request_id);
});

it("does not send preparation when retry identity cannot be retained", async () => {
  vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("storage unavailable"); });
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  expect(screen.getByRole("status").textContent).toContain("Preparation was not sent");
  expect(fetcher).not.toHaveBeenCalled();
});

it("prepares the exact binding without asking for goal or probe IDs", async () => {
  const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: true, valid_until_ms: Date.now() + 5000 } }) });
  vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("no movement was started"));
  const body = JSON.parse(fetcher.mock.calls[0][1].body);
  expect(body).toMatchObject({ reasoning_binding_id: "binding:a", binding_epoch: 1,
    helix_conversation_id: "chat:a", run_id: "run:a", request_id: expect.any(String) });
  expect(body).not.toHaveProperty("client_continuation_ref");
  expect(body).not.toHaveProperty("probe_request_id");
});
it("shows blocked layers rather than treating a successful HTTP response as ready", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: false, checks: [{ layer: "authority", state: "revoked" }] } }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("authority"));
  expect(screen.getByRole("status").textContent).toContain("No new permissions");
});
it("keeps chat-only sessions out of environment preparation", () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  render(<EnvironmentSessionReadyUp binding={{ ...binding, run_id: null }} />);
  expect((screen.getByRole("button") as HTMLButtonElement).disabled).toBe(true);
  expect(fetcher).not.toHaveBeenCalled();
});
it("identifies ambiguous goals as an environment problem, not a new binding request", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false,
    error: "durable_goal_session_ambiguous" }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("More than one unfinished goal"));
  expect(screen.getByRole("status").textContent).toContain("binding was not replaced");
});
it("expires the displayed readiness without telling the user to rebind", async () => {
  const deadline = Date.now() + 5000;
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: true, valid_until_ms: deadline } }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("prerequisites checked"));
  // The component's interval uses the wall clock; retain real timers and move
  // only Date.now so this checks the actual scheduled UI refresh.
  vi.spyOn(Date, "now").mockReturnValue(deadline + 1);
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("binding was not revoked"), { timeout: 2000 });
  vi.restoreAllMocks();
});

it.each(["goal_creation_or_replay_verified", "unrecognized"])("distinguishes verified goal replay from uncertain repair (%s)", async reason_code => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    repairs: [{ layer: "goal", changed: null, reason_code }], readiness: { ready: false, checks: [] },
  }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const results = await screen.findByRole("list", { name: "Setup repair results" });
  if (reason_code === "goal_creation_or_replay_verified") {
    expect(results.textContent).toContain("creation or replay verified; change count unspecified");
    expect(results.textContent).not.toContain("partial outcome uncertain");
  } else expect(results.textContent).toContain("partial outcome uncertain");
  expect(screen.getByRole("status").textContent).toContain("Session still needs attention");
});

it("shows completed and uncertain repairs even while readiness stays blocked", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    repairs: [{ layer: "subject", changed: true }, { layer: "goal", changed: null }],
    readiness: { ready: false, checks: [{ layer: "goal", state: "blocked" }] } }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const results = await screen.findByRole("list", { name: "Setup repair results" });
  expect(results.textContent).toContain("Player identity: updated");
  expect(results.textContent).toContain("partial outcome uncertain");
  expect(screen.getByRole("status").textContent).toContain("still needs attention");
});

it("does not imply rollback when the preparation response is lost", async () => {
  vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network lost")));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("Some setup steps may already have completed"));
  expect(screen.queryByRole("list", { name: "Setup repair results" })).toBeNull();
});

it("preserves repair evidence from a failed server response", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, json: async () => ({ ok: false,
    error: "environment_session_preparation_failed", partial_effects_unknown: true,
    repairs: [{ layer: "subject", changed: true }] }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  expect((await screen.findByRole("list", { name: "Setup repair results" })).textContent).toContain("updated");
  expect(screen.getByRole("status").textContent).toContain("Additional setup changes may have completed");
});

it("labels the run deadline separately from permission and readiness", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true,
    readiness: { ready: true, valid_until_ms: Date.now() + 5000 },
    session_deadlines: { run_expires_at_ms: Date.now() + 3600000 } }) }));
  render(<EnvironmentSessionReadyUp binding={binding} />);
  fireEvent.click(screen.getByRole("button", { name: "Ready up" }));
  const deadline = await screen.findByText(/Environment run deadline:/);
  expect(deadline.textContent).toContain("separate from chat binding and gameplay permission");
  expect(deadline.textContent).toContain("does not extend it");
});
