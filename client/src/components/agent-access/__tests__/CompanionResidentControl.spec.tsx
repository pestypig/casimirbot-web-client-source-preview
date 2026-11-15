// @vitest-environment jsdom
import React from "react";
import { act, cleanup, fireEvent, render, screen, waitFor } from
  "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CompanionResidentControl } from "../CompanionResidentControl";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });

const resident = { session_id: "session:one", status: "running",
  world_id: "world:fixture", companion_id: "companion:one",
  capabilities: ["follow", "native_place"],
  expires_at: "2030-01-01T01:00:00Z", hold_reason: null,
  active_task: { id: "task:one", objective: "Follow me",
    profile: "movement", generation: 1, revision: 2,
    status: "waiting", clarification: { task_revision: 2,
      question: "Which path should I take?" } },
  loop: { model_in_flight: false, local_in_flight: false,
    closed: false, ordered_events: 0 } };

describe("resident companion controls", () => {
  it.each([
    { install: false, success: true },
    { install: false, success: false },
    { install: true, success: true },
    { install: true, success: false },
  ])("keeps Stop confirmed after late preparation: %j", async ({ install, success }) => {
    let finishPreparation!: (value: Response) => void;
    const pending = new Promise<Response>(resolve => { finishPreparation = resolve; });
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith(install ? "/native/install" : "/actor/prepare")) return pending;
      if (url.endsWith("/stop")) return Promise.resolve(new Response(JSON.stringify({
        ok: true, companion_resident: { ...resident, status: "stopped" },
      })));
      if (!init?.method) return Promise.resolve(new Response(JSON.stringify({
        ok: true, companion_resident: resident,
      })));
      throw new Error("unexpected_request");
    }));
    render(<CompanionResidentControl requestId="request:one" reviewRevision={"a".repeat(64)} />);
    fireEvent.click(await screen.findByRole("button", {
      name: install ? "Connect prepared companion" : "Prepare companion in Minecraft",
    }));
    fireEvent.click(screen.getByRole("button", { name: "Stop now" }));
    await screen.findByText("Companion Stop confirmed.");
    await act(async () => {
      finishPreparation(new Response(JSON.stringify(success
        ? { ok: true, [install ? "native_install" : "actor_prepare"]: {
          state: "local_one_use_ticket_staged",
        } }
        : { ok: false, error: "resident_source_account_mismatch" }), {
        status: success ? 200 : 409,
      }));
    });
    expect(screen.getByText("Companion Stop confirmed.")).toBeTruthy();
    expect(screen.queryByText(/Companion (connection staged|preparation staged|preparation held)/)).toBeNull();
  });

  it("shows a fixed preparation denial without leaking arbitrary server text", async () => {
    const fetchMock = vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(url.endsWith("/actor/prepare") && init?.method
        ? new Response(JSON.stringify({ ok: false,
          error: "resident_source_account_mismatch" }), { status: 409 })
        : new Response(JSON.stringify({ ok: true,
          companion_resident: resident }))));
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Prepare companion in Minecraft" }));
    await screen.findByText(/resident_source_account_mismatch/);
  });

  it("shows the fixed local staging denial", async () => {
    vi.stubGlobal("fetch", vi.fn((url: string, init?: RequestInit) =>
      Promise.resolve(url.endsWith("/actor/prepare") && init?.method
        ? new Response(JSON.stringify({ ok: false,
          error: "companion_resident_actor_prepare_not_staged" }),
          { status: 409 })
        : new Response(JSON.stringify({ ok: true,
          companion_resident: resident })))));
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Prepare companion in Minecraft" }));
    await screen.findByText(/companion_resident_actor_prepare_not_staged/);
  });

  it("keeps Stop available while another owner action is pending", async () => {
    let releaseAnswer!: (value: Response) => void;
    const answerPending = new Promise<Response>(resolve => {
      releaseAnswer = resolve;
    });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (!init?.method) return Promise.resolve(new Response(
        JSON.stringify({ ok: true, companion_resident: resident })));
      if (url.endsWith("/answer")) return answerPending;
      if (url.endsWith("/stop")) return Promise.resolve(new Response(
        JSON.stringify({ ok: true, companion_resident: {
          ...resident, status: "stopped", hold_reason: "owner_stop" } })));
      throw new Error("unexpected_request");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    await screen.findByText(/running in world:fixture/);
    fireEvent.change(screen.getByRole("textbox", {
      name: "Which path should I take?" }), {
      target: { value: "Use the north bridge." } });
    fireEvent.click(screen.getByRole("button", { name: "Send answer" }));
    expect((screen.getByRole("button", { name: "Stop now" }) as
      HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Stop now" }));
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) =>
      url.endsWith("/stop"))).toBe(true));
    releaseAnswer(new Response(JSON.stringify({ ok: true,
      companion_resident: resident })));
    await screen.findByText(/Companion Stop confirmed/);
    expect(screen.queryByText(/Companion answer confirmed/)).toBeNull();
  });

  it("does not let status reads started before or during Stop restore running", async () => {
    let poll!: () => void;
    const timers: Pick<Window, "setInterval"> = window;
    const setIntervalReal = timers.setInterval.bind(timers);
    vi.spyOn(timers, "setInterval").mockImplementation((handler: TimerHandler,
      timeout?: number, ...args: unknown[]) => {
      if (timeout === 3_000) {
        poll = handler as () => void;
        return 1;
      }
      return setIntervalReal(handler, timeout, ...args);
    });
    const readers: Array<(value: Response) => void> = [];
    let finishStop!: (value: Response) => void;
    const pendingStop = new Promise<Response>(resolve => { finishStop = resolve; });
    let gets = 0;
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.endsWith("/stop")) return pendingStop;
      if (init?.method) throw new Error("unexpected_request");
      gets++;
      if (gets === 1) return Promise.resolve(new Response(JSON.stringify({
        ok: true, companion_resident: resident })));
      return new Promise<Response>(resolve => readers.push(resolve));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    await screen.findByText(/running in world:fixture/);
    poll();
    await waitFor(() => expect(readers).toHaveLength(1));
    fireEvent.click(screen.getByRole("button", { name: "Stop now" }));
    poll();
    await waitFor(() => expect(readers).toHaveLength(2));
    readers[0](new Response(JSON.stringify({ ok: true,
      companion_resident: resident })));
    finishStop(new Response(JSON.stringify({ ok: true,
      companion_resident: { ...resident, status: "stopped",
        hold_reason: "owner_stop" } })));
    await screen.findByText(/stopped in world:fixture/);
    readers[1](new Response(JSON.stringify({ ok: true,
      companion_resident: resident })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText(/running in world:fixture/)).toBeNull();
  });

  it("does not show a late block measurement after Stop", async () => {
    const building = { ...resident, completion_available: false,
      active_task: {
      ...resident.active_task, profile: "construction", status: "active",
      clarification: null } };
    let finishMeasure!: (value: Response) => void;
    const pendingMeasure = new Promise<Response>(resolve => {
      finishMeasure = resolve;
    });
    const fetchMock = vi.fn((url: string, init?: RequestInit) => {
      if (url.includes("/measure?offset=")) return pendingMeasure;
      if (url.endsWith("/stop")) return Promise.resolve(new Response(
        JSON.stringify({ ok: true, companion_resident: {
          ...building, status: "stopped" } })));
      if (!init?.method) return Promise.resolve(new Response(
        JSON.stringify({ ok: true, companion_resident: building })));
      throw new Error("unexpected_request");
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    await screen.findByRole("button", { name: "Check planned blocks" });
    expect(screen.queryByRole("button", { name: "Verify completion" })).toBeNull();
    fireEvent.click(screen.getByRole("button", {
      name: "Check planned blocks" }));
    fireEvent.click(screen.getByRole("button", { name: "Stop now" }));
    await screen.findByText(/Companion Stop confirmed/);
    finishMeasure(new Response(JSON.stringify({ ok: true, build_targets: {
      verified: true, reason: null, taskId: "task:one",
      generation: 1 } })));
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(screen.queryByText(/Recorded block targets match/)).toBeNull();
  });

  it("shows the measured cell that needs repair", async () => {
    const building = { ...resident, completion_available: false,
      performance: { model_revision_attempts: 2,
        model_revision_latency_ms: [700, 900],
        observed_actor_motion_during_model_wait_blocks: [null, 3] },
      active_task: { ...resident.active_task, profile: "construction",
        status: "active", clarification: null } };
    const fetchMock = vi.fn((url: string) => {
      const body = url.includes("/measure?offset=")
        ? { ok: true, build_targets: { verified: false,
          reason: "resident_build_wrong_block", taskId: "task:one",
          generation: 1, differences: [{ x: 12, y: 64, z: 9,
            expected: "minecraft:cobblestone", actual: "minecraft:air" }] } }
        : { ok: true, companion_resident: building };
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Check planned blocks" }));
    await screen.findByText(/At 12, 64, 9: expected minecraft:cobblestone/);
    expect(screen.getByText(/companion moved 3 blocks during that wait/))
      .toBeTruthy();
  });

  it("lets the owner inspect the next bounded build area", async () => {
    const building = { ...resident, completion_available: false,
      active_task: { ...resident.active_task, profile: "construction",
        status: "active", clarification: null } };
    const fetchMock = vi.fn((url: string) => {
      const body = url.includes("/measure?offset=0")
        ? { ok: true, build_targets: { verified: false,
          reason: "resident_build_page_checked", taskId: "task:one",
          generation: 1, offset: 0, checked: 128, total: 256,
          nextOffset: 128 } }
        : url.includes("/measure?offset=128")
          ? { ok: true, build_targets: { verified: false,
            reason: "resident_build_wrong_block", taskId: "task:one",
            generation: 1, offset: 128, checked: 128, total: 256,
            nextOffset: null, differences: [{ x: 20, y: 64, z: 20,
              expected: "minecraft:cobblestone", actual: "minecraft:air" }] } }
          : { ok: true, companion_resident: building };
      return Promise.resolve(new Response(JSON.stringify(body)));
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<CompanionResidentControl requestId="request:one"
      reviewRevision={"a".repeat(64)} />);
    fireEvent.click(await screen.findByRole("button", {
      name: "Check planned blocks" }));
    await screen.findByText(/Checked 1–128 of 256/);
    fireEvent.click(screen.getByRole("button", { name: "Check next area" }));
    await screen.findByText(/At 20, 64, 20: expected minecraft:cobblestone/);
    expect(fetchMock.mock.calls.some(([url]) =>
      url.includes("/measure?offset=128"))).toBe(true);
  });
});
